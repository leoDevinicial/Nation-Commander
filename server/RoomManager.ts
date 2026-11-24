import { randomInt } from 'node:crypto';
import { SAVED_MATCHES, type PublicRoomSummary, type RoomMode, type SavedMatchInfo } from '../shared/protocol.ts';
import { isSuspendedKey, suspendedKey } from './savedKeys.ts';
import { GAME_VERSION } from '../shared/version.ts';
import type { Connection } from './Connection.ts';
import { log } from './logger.ts';
import { decodeSave, encodeSave, MAX_SAVE_AGE_MS, type MatchStore } from './matchStore.ts';
import { Room, type RoomDeps, type RoomSave } from './Room.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos
/** Ticks simulados numa cópia antes de aceitar um salvamento (um salvamento quebrado não entra). */
const RESTORE_CHECK_TICKS = 40;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** Tick da última gravação de cada sala (sala pausada não regrava). */
  private readonly savedTick = new Map<string, number>();
  /** Retomadas em curso por usuário (duas conexões seguidas não retomam duas vezes). */
  private readonly restoring = new Map<string, Promise<Room | undefined>>();
  private readonly roomDeps: RoomDeps;

  /** KNPS-08: letra da região no início dos códigos de sala ('' = sem região). */
  codePrefix = '';

  /** KNPS: reenvia o lobby das salas que ainda não começaram (o ping de cada jogador muda com o tempo). */
  refreshLobbies(): void {
    for (const r of this.rooms.values()) if (r.status === 'lobby') r.broadcastRoom();
  }

  constructor(
    deps: Omit<RoomDeps, 'onEmpty' | 'onEnded'>,
    private readonly maxRooms: number,
    private readonly store: MatchStore | null = null,
    /** Formato do salvamento: gzip + base64 no servidor; JSON puro na partida local do navegador (22/11). */
    private readonly codec: { encode: (save: RoomSave) => string; decode: (blob: string) => RoomSave } = { encode: encodeSave, decode: decodeSave },
  ) {
    this.roomDeps = {
      ...deps,
      onEmpty: (r) => this.rooms.delete(r.code),
      onEnded: (r) => this.forget(r.code),
      ...(store ? { onSuspend: (r: Room) => this.suspend(r) } : {}),
    };
  }

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Salas públicas com vaga, as mais cheias primeiro (até 30). */
  listPublic(): PublicRoomSummary[] {
    const out: PublicRoomSummary[] = [];
    for (const r of this.rooms.values()) {
      const s = r.publicSummary();
      if (s) out.push(s);
    }
    return out.sort((a, b) => b.players - a.players || a.code.localeCompare(b.code)).slice(0, 30);
  }

  create(host: Connection, mode: RoomMode, countryId: string, isPublic = false): Room | string {
    if (this.rooms.size >= this.maxRooms) return 'Servidor cheio, tente novamente em instantes';
    let code: string;
    do {
      // KNPS-08: com a região configurada, o código começa com a letra dela (o cliente sabe a que servidor ir)
      code = this.codePrefix + Array.from({ length: 5 - this.codePrefix.length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, mode, { conn: host, countryId }, this.roomDeps);
    if (isPublic && mode === 'pvp') room.isPublic = true;
    this.rooms.set(code, room);
    return room;
  }

  /** Sala (em andamento ou no lobby) da qual o usuário participa, para reconexão. */
  findByUser(userId: string): Room | undefined {
    for (const r of this.rooms.values()) if (r.status !== 'ended' && r.hasUser(userId)) return r;
    return undefined;
  }

  /**
   * Sala do usuário, em memória ou retomada do armazenamento (depois de um reinício do servidor).
   * A retomada é sob demanda, na volta do jogador: numa atualização sem interrupção o servidor
   * novo entra antes de o antigo gravar o estado final, então ler tudo na partida leria salvamentos
   * velhos.
   */
  async findOrRestore(userId: string): Promise<Room | undefined> {
    const live = this.findByUser(userId);
    if (live || !this.store) return live;
    let pending = this.restoring.get(userId);
    if (!pending) {
      pending = this.restoreFor(userId).finally(() => this.restoring.delete(userId));
      this.restoring.set(userId, pending);
    }
    return pending;
  }

  private async restoreFor(userId: string): Promise<Room | undefined> {
    const stored = await this.store!.findByUser(userId);
    if (!stored) return undefined;
    // outro jogador da mesma sala pode ter retomado enquanto buscávamos
    const already = this.rooms.get(stored.code);
    if (already) return already.hasUser(userId) && already.status !== 'ended' ? already : undefined;
    const now = (this.roomDeps.now ?? Date.now)();
    if (now - stored.updatedAt > MAX_SAVE_AGE_MS) {
      log.info('Salvamento antigo descartado', { room: stored.code });
      await this.store!.remove(stored.code);
      return undefined;
    }
    try {
      const save = this.codec.decode(stored.blob);
      if (save.gameVersion !== GAME_VERSION) log.warn('Retomando partida de outra versão do jogo', { room: save.code, saved: save.gameVersion, now: GAME_VERSION });
      // ensaio numa cópia: se o salvamento não roda nesta versão, é descartado sem afetar ninguém
      const probe = Room.restore(save, { ...this.roomDeps, autoLoop: false, record: async () => false, onEnded: () => {}, onEmpty: () => {} });
      for (let i = 0; i < RESTORE_CHECK_TICKS; i++) probe.advance();
      probe.dispose();
      const room = Room.restore(save, this.roomDeps);
      this.rooms.set(room.code, room);
      this.savedTick.set(room.code, room.tick);
      log.info('Partida retomada', { room: room.code, tick: room.tick, savedAt: new Date(save.savedAt).toISOString(), store: this.store!.kind });
      return room;
    } catch (err) {
      log.error('Salvamento inválido descartado', { room: stored.code, err: String(err) });
      await this.store!.remove(stored.code);
      return undefined;
    }
  }

  // ------------------------------------------------------------ partidas salvas pelo jogador (24/11)

  /**
   * "Salvar e sair": grava a partida com a chave `~CÓDIGO` (não volta sozinha num reinício), apaga o salvamento de
   * partida em andamento, solta os jogadores (voltam ao menu) e tira a sala da memória.
   */
  async suspend(room: Room): Promise<boolean> {
    if (!this.store) return false;
    const save = room.toSave();
    if (!save) return false;
    delete save.suspendWait;
    await this.store.save(suspendedKey(room.code), room.userIds(), this.codec.encode(save));
    await this.store.remove(room.code).catch(() => undefined);
    log.info('Partida salva pelos jogadores', { room: room.code, tick: room.tick });
    room.notifySuspended();
    this.savedTick.delete(room.code);
    this.remove(room);
    return true;
  }

  /** Partidas salvas do usuário (as vencidas são apagadas aqui) e as reabertas esperando por ele. */
  async listSaved(userId: string): Promise<SavedMatchInfo[]> {
    const out: SavedMatchInfo[] = [];
    for (const r of this.rooms.values()) {
      if (!r.awaitingAll || r.status !== 'playing' || !r.hasUser(userId)) continue;
      const save = r.toSave();
      if (save) out.push({ ...savedInfo(save, userId), waiting: true });
    }
    if (!this.store) return out;
    const now = (this.roomDeps.now ?? Date.now)();
    for (const row of await this.store.listSuspended(userId)) {
      if (now - row.updatedAt > SAVED_MATCHES.maxAgeMs) {
        await this.store.remove(row.code).catch(() => undefined);
        continue;
      }
      try {
        out.push(savedInfo(this.codec.decode(row.blob), userId, row.updatedAt));
      } catch {
        await this.store.remove(row.code).catch(() => undefined);
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Quantas partidas salvas o usuário tem (limite `SAVED_MATCHES.maxPerUser`). */
  async savedCount(userId: string): Promise<number> {
    return this.store ? (await this.store.listSuspended(userId)).length : 0;
  }

  /**
   * Reabre uma partida salva. Se outro comandante já a reabriu, devolve a sala em memória. A partida volta pausada,
   * esperando todos os comandantes na disputa; ninguém perde por ausência.
   */
  async resumeSaved(userId: string, code: string): Promise<Room | string> {
    const live = this.rooms.get(code);
    if (live && live.status === 'playing' && live.hasUser(userId)) return live;
    if (!this.store) return 'Este servidor não guarda partidas.';
    if (this.findByUser(userId)) return 'Saia da partida atual antes de continuar outra.';
    const row = await this.store.get(suspendedKey(code));
    if (!row || !row.userIds.includes(userId)) return 'Partida salva não encontrada.';
    const now = (this.roomDeps.now ?? Date.now)();
    if (now - row.updatedAt > SAVED_MATCHES.maxAgeMs) {
      await this.store.remove(row.code);
      return 'Esta partida salva venceu (mais de 30 dias).';
    }
    let save: RoomSave;
    try {
      save = this.codec.decode(row.blob);
      const probe = Room.restore(save, { ...this.roomDeps, autoLoop: false, record: async () => false, onEnded: () => {}, onEmpty: () => {} });
      for (let i = 0; i < RESTORE_CHECK_TICKS; i++) probe.advance();
      probe.dispose();
    } catch (err) {
      log.error('Partida salva não roda nesta versão', { room: code, err: String(err) });
      return 'Esta partida salva é de uma versão antiga do jogo e não pode mais ser retomada.';
    }
    // o código antigo pode estar em uso por outra sala agora
    if (this.rooms.has(save.code)) {
      let fresh: string;
      do fresh = this.codePrefix + Array.from({ length: 5 - this.codePrefix.length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      while (this.rooms.has(fresh));
      save = { ...save, code: fresh };
    }
    const room = Room.restore(save, this.roomDeps, { fromSaved: true });
    this.rooms.set(room.code, room);
    this.savedTick.delete(room.code);
    await this.store.remove(row.code);
    // grava já como partida em andamento: um reinício agora não a perde
    const now2 = room.toSave();
    if (now2) await this.store.save(room.code, room.userIds(), this.codec.encode(now2)).catch(() => undefined);
    log.info('Partida salva reaberta', { room: room.code, from: code, tick: room.tick });
    return room;
  }

  /** Apaga a partida salva (para todos os comandantes dela: sem um deles, ela não reabre mais). */
  async deleteSaved(userId: string, code: string): Promise<boolean> {
    if (!this.store) return false;
    const row = await this.store.get(suspendedKey(code));
    if (!row || !row.userIds.includes(userId) || !isSuspendedKey(row.code)) return false;
    await this.store.remove(row.code);
    log.info('Partida salva apagada', { room: code });
    return true;
  }

  /** Grava as partidas em andamento que avançaram desde a última gravação. */
  async persistAll(force = false): Promise<number> {
    if (!this.store) return 0;
    let n = 0;
    for (const room of [...this.rooms.values()]) {
      if (room.status !== 'playing') continue;
      if (!force && this.savedTick.get(room.code) === room.tick) continue;
      try {
        const save = room.toSave();
        if (!save) continue;
        await this.store.save(room.code, room.userIds(), this.codec.encode(save));
        this.savedTick.set(room.code, room.tick);
        n++;
      } catch (err) {
        log.error('Falha ao salvar partida', { room: room.code, err: String(err) });
      }
    }
    return n;
  }

  /** Encerramento do servidor: congela todas as partidas e grava o estado final de cada uma. */
  async shutdown(): Promise<number> {
    for (const r of this.rooms.values()) r.freeze();
    return this.persistAll(true);
  }

  /** Partida encerrada: o salvamento deixa de valer. */
  private forget(code: string): void {
    this.savedTick.delete(code);
    void this.store?.remove(code).catch((err) => log.warn('Falha ao apagar salvamento', { room: code, err: String(err) }));
  }

  remove(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
  }

  /** Remove salas encerradas sem ninguém conectado. */
  sweep(): void {
    for (const r of this.rooms.values()) {
      if (r.status === 'ended' && r.players.every((p) => p.isAI || !p.connected || p.conn?.roomCode !== r.code)) this.remove(r);
    }
  }

  stats() {
    let playing = 0;
    // KNPS: o pior caso entre as partidas em andamento (custo do tick e atraso do laço) e o tráfego somado
    const knps = { tickP95Ms: 0, loopLagP95Ms: 0, snapshots: 0, quick: 0, skipped: 0 };
    for (const r of this.rooms.values()) {
      if (r.status !== 'playing') continue;
      playing++;
      const k = r.knps.summary();
      knps.tickP95Ms = Math.max(knps.tickP95Ms, k.tickMs.p95);
      knps.loopLagP95Ms = Math.max(knps.loopLagP95Ms, k.loopLagMs);
      knps.snapshots += k.snapshots;
      knps.quick += k.quick;
      knps.skipped += k.skipped;
    }
    return { rooms: this.rooms.size, playing, knps };
  }

  /** Jogadores humanos conectados a partidas em andamento (painel de números). */
  humansInMatches(): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.status === 'playing') n += r.players.filter((p) => !p.isAI && p.connected).length;
    return n;
  }
}

/** Resumo de uma partida salva para a lista do menu (`me`: o país de quem pediu). */
function savedInfo(save: RoomSave, userId: string, savedAt = save.savedAt): SavedMatchInfo {
  return {
    code: save.code,
    mode: save.mode,
    savedAt,
    day: save.national?.day ?? 0,
    players: save.players.map((p) => ({ name: p.name, countryId: p.countryId, isAI: p.isAI, ...(p.userId === userId ? { me: true } : {}) })),
  };
}
