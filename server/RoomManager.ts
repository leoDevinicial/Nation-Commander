import { randomInt } from 'node:crypto';
import type { PublicRoomSummary, RoomMode } from '../shared/protocol.ts';
import { GAME_VERSION } from '../shared/version.ts';
import type { Connection } from './Connection.ts';
import { log } from './logger.ts';
import { decodeSave, encodeSave, MAX_SAVE_AGE_MS, type MatchStore } from './matchStore.ts';
import { Room, type RoomDeps } from './Room.ts';

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

  constructor(
    deps: Omit<RoomDeps, 'onEmpty' | 'onEnded'>,
    private readonly maxRooms: number,
    private readonly store: MatchStore | null = null,
  ) {
    this.roomDeps = {
      ...deps,
      onEmpty: (r) => this.rooms.delete(r.code),
      onEnded: (r) => this.forget(r.code),
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
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
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
      const save = decodeSave(stored.blob);
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
        await this.store.save(room.code, room.userIds(), encodeSave(save));
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
    for (const r of this.rooms.values()) if (r.status === 'playing') playing++;
    return { rooms: this.rooms.size, playing };
  }
}
