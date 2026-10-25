import type {
  EndReason,
  GameSpeed,
  MatchEndInfo,
  MatchStartInfo,
  RoomInfo,
  RoomMode,
  RoomPlayerInfo,
  ServerMessage,
} from '../shared/protocol.ts';
import { GAME_VERSION } from '../shared/version.ts';
import type { Command } from '../shared/sim/commands.ts';
import { TICK_RATE } from '../shared/sim/config.ts';
import { generateMap } from '../shared/sim/MapGen.ts';
import { Simulation } from '../shared/sim/Simulation.ts';
import { makeSnapshot } from '../shared/sim/snapshot.ts';
import { AI_THINK_TICKS, TacticalAI } from '../shared/sim/TacticalAI.ts';
import type { SimEvent, Slot } from '../shared/sim/types.ts';
import type { Connection } from './Connection.ts';
import { log } from './logger.ts';
import type { MatchRecord } from './supabase.ts';

export const SNAPSHOT_EVERY = 2; // 10 snapshots/s
const MAX_COMMANDS_PER_TICK = 20;

interface RoomPlayer extends RoomPlayerInfo {
  conn: Connection | null;
  disconnectedAt: number | null;
}

export interface RoomDeps {
  reconnectGraceMs: number;
  record: (rec: MatchRecord) => Promise<boolean>;
  onEmpty: (room: Room) => void;
  now?: () => number;
  /** Seed opcional (testes). */
  seed?: number;
  /** Controla o laço (testes chamam `advance` manualmente). */
  autoLoop?: boolean;
}

/**
 * Sala de partida: lobby → partida → fim. O servidor é a autoridade: clientes enviam
 * apenas intenções (comandos), validadas e aplicadas no início do próximo tick.
 */
export class Room {
  status: 'lobby' | 'playing' | 'ended' = 'lobby';
  readonly players: RoomPlayer[] = [];
  hostUserId: string;
  readonly maxPlayers = 2;

  sim: Simulation | null = null;
  private ais: TacticalAI[] = [];
  private pending: { slot: Slot; cmd: Command; conn: Connection | null }[] = [];
  private events: SimEvent[] = [];
  paused = false;
  pausedBy: string | null = null;
  speed: GameSpeed = 1;
  private seed = 0;
  private startedAt = 0;
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastLoopTime = 0;
  private accumulator = 0;
  private endReason: EndReason | null = null;
  private readonly now: () => number;

  constructor(
    readonly code: string,
    readonly mode: RoomMode,
    host: Connection,
    countryId: string,
    private readonly deps: RoomDeps,
  ) {
    this.now = deps.now ?? Date.now;
    this.hostUserId = host.user!.id;
    this.addHuman(host, countryId);
    if (mode === 'vs_ai') {
      this.players.push({
        slot: 1,
        userId: null,
        name: 'IA Tática',
        countryId: countryForAI(countryId),
        ready: true,
        isAI: true,
        connected: true,
        conn: null,
        disconnectedAt: null,
      });
    }
  }

  // ------------------------------------------------------------ lobby

  info(): RoomInfo {
    return {
      code: this.code,
      mode: this.mode,
      hostUserId: this.hostUserId,
      status: this.status,
      players: this.players.map(publicPlayer),
      maxPlayers: this.maxPlayers,
    };
  }

  hasUser(userId: string): boolean {
    return this.players.some((p) => p.userId === userId);
  }

  get humanCount(): number {
    return this.players.filter((p) => !p.isAI).length;
  }

  join(conn: Connection, countryId: string): string | null {
    if (this.status !== 'lobby') return 'A partida já começou';
    if (this.hasUser(conn.user!.id)) return null;
    if (this.players.length >= this.maxPlayers) return 'Sala cheia';
    this.addHuman(conn, countryId);
    this.system(`${conn.user!.name} entrou na sala.`);
    this.broadcastRoom();
    return null;
  }

  private addHuman(conn: Connection, countryId: string): void {
    const used = new Set(this.players.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    this.players.push({
      slot,
      userId: conn.user!.id,
      name: conn.user!.name,
      countryId,
      ready: false,
      isAI: false,
      connected: true,
      conn,
      disconnectedAt: null,
    });
    this.players.sort((a, b) => a.slot - b.slot);
    conn.roomCode = this.code;
  }

  /** Saída voluntária. Durante a partida equivale a render-se. */
  leave(conn: Connection): void {
    const p = this.playerOf(conn);
    if (!p) return;
    conn.roomCode = null;
    if (this.status === 'playing') {
      p.conn = null;
      p.connected = false;
      this.forfeit(p.slot, 'forfeit');
      return;
    }
    const idx = this.players.indexOf(p);
    this.players.splice(idx, 1);
    if (this.humanCount === 0) {
      this.dispose();
      this.deps.onEmpty(this);
      return;
    }
    if (this.hostUserId === p.userId) {
      const next = this.players.find((x) => !x.isAI);
      if (next) this.hostUserId = next.userId!;
    }
    if (this.status === 'lobby') this.players.forEach((x) => !x.isAI && (x.ready = false));
    this.system(`${p.name} saiu da sala.`);
    this.broadcastRoom();
  }

  setCountry(conn: Connection, countryId: string): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'lobby') return;
    p.countryId = countryId;
    p.ready = false;
    this.broadcastRoom();
  }

  setReady(conn: Connection, ready: boolean): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'lobby') return;
    p.ready = ready;
    this.broadcastRoom();
  }

  start(conn: Connection): string | null {
    if (this.status !== 'lobby') return 'A partida já começou';
    if (conn.user!.id !== this.hostUserId) return 'Apenas o anfitrião pode iniciar';
    if (this.players.length < 2) return 'Aguardando outro jogador';
    if (!this.players.every((p) => p.ready || p.userId === this.hostUserId)) return 'Nem todos estão prontos';
    this.beginMatch();
    return null;
  }

  // ------------------------------------------------------------ partida

  private beginMatch(): void {
    this.seed = this.deps.seed ?? (Math.random() * 0xffffffff) >>> 0;
    const map = generateMap(this.seed);
    this.sim = new Simulation({ map, playerCount: this.players.length });
    this.ais = this.players.filter((p) => p.isAI).map((p) => new TacticalAI(p.slot));
    this.status = 'playing';
    this.startedAt = this.now();
    this.paused = false;
    this.speed = 1;
    for (const p of this.players) if (p.conn) this.sendMatchStart(p);
    this.broadcastRoom();
    this.broadcastSnapshot();
    log.info('Partida iniciada', { room: this.code, mode: this.mode, seed: this.seed });
    this.lastLoopTime = this.now();
    if (this.deps.autoLoop !== false) {
      this.loop = setInterval(() => this.onLoop(), 1000 / TICK_RATE / 2);
    }
  }

  private sendMatchStart(p: RoomPlayer): void {
    const sim = this.sim!;
    const match: MatchStartInfo = {
      seed: this.seed,
      yourSlot: p.slot,
      players: this.players.map(publicPlayer),
      terrain: sim.map.terrain.join(''),
      width: sim.map.width,
      height: sim.map.height,
      cellSize: sim.map.cellSize,
      resourceNodes: sim.map.resourceNodes,
      spawns: sim.map.spawns,
      tickRate: TICK_RATE,
      snapshotEvery: SNAPSHOT_EVERY,
      canControlSpeed: this.mode === 'vs_ai',
    };
    p.conn?.send({ t: 'match_start', match });
  }

  /** Laço com acumulador: mantém exatamente TICK_RATE ticks/s × velocidade. */
  private onLoop(): void {
    const now = this.now();
    const elapsed = Math.min(now - this.lastLoopTime, 250); // limita saltos após travamentos
    this.lastLoopTime = now;
    this.checkDisconnects();
    if (this.status !== 'playing' || this.paused) return;
    this.accumulator += elapsed * this.speed;
    const tickMs = 1000 / TICK_RATE;
    let steps = 0;
    while (this.accumulator >= tickMs && steps < 8 && this.status === 'playing') {
      this.accumulator -= tickMs;
      this.advance();
      steps++;
    }
  }

  /** Executa exatamente um tick da simulação (exposto para testes). */
  advance(): void {
    const sim = this.sim;
    if (!sim || this.status !== 'playing') return;
    if (sim.tick % AI_THINK_TICKS === 0) {
      for (const ai of this.ais) for (const cmd of ai.think(sim)) sim.applyCommand(ai.slot, cmd);
    }
    const batch = this.pending.splice(0, this.pending.length);
    for (const { slot, cmd, conn } of batch) {
      const err = sim.applyCommand(slot, cmd);
      if (err) conn?.send({ t: 'cmd_rejected', reason: err });
    }
    sim.step();
    this.events.push(...sim.drainEvents());
    if (sim.tick % SNAPSHOT_EVERY === 0 || sim.ended) this.broadcastSnapshot();
    if (sim.ended) void this.finish(this.endReason ?? (sim.winner === null ? 'draw' : 'hq_destroyed'));
  }

  command(conn: Connection, cmd: Command): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'playing' || !this.sim) return;
    if (this.pending.filter((x) => x.slot === p.slot).length >= MAX_COMMANDS_PER_TICK) {
      conn.send({ t: 'cmd_rejected', reason: 'Comandos demais' });
      return;
    }
    this.pending.push({ slot: p.slot, cmd, conn });
  }

  setPaused(conn: Connection, paused: boolean): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'playing') return;
    this.paused = paused;
    this.pausedBy = paused ? p.name : null;
    this.system(paused ? `${p.name} pausou a partida.` : `${p.name} retomou a partida.`);
    this.broadcastSnapshot();
  }

  setSpeed(conn: Connection, speed: GameSpeed): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'playing') return;
    if (this.mode !== 'vs_ai') {
      conn.send({ t: 'cmd_rejected', reason: 'Velocidade fixa em partidas entre jogadores' });
      return;
    }
    this.speed = speed;
    this.broadcastSnapshot();
  }

  surrender(conn: Connection): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'playing') return;
    this.forfeit(p.slot, 'forfeit');
  }

  private forfeit(slot: Slot, reason: EndReason): void {
    if (!this.sim || this.status !== 'playing') return;
    this.endReason = reason;
    const p = this.players.find((x) => x.slot === slot);
    this.system(reason === 'disconnect' ? `${p?.name} abandonou a partida.` : `${p?.name} se rendeu.`);
    this.sim.surrender(slot);
    this.events.push(...this.sim.drainEvents());
    this.broadcastSnapshot();
    if (this.sim.ended) void this.finish(reason);
  }

  // ------------------------------------------------------------ conexões

  onDisconnect(conn: Connection): void {
    const p = this.playerOf(conn);
    if (!p) return;
    if (this.status === 'lobby') {
      this.leave(conn);
      return;
    }
    p.conn = null;
    p.connected = false;
    p.disconnectedAt = this.now();
    if (this.status === 'playing') {
      this.system(`${p.name} perdeu a conexão. Aguardando reconexão...`);
      if (this.mode === 'vs_ai') {
        this.paused = true;
        this.pausedBy = p.name;
      }
      this.broadcastRoom();
    }
    if (this.humanCount === this.players.filter((x) => !x.isAI && !x.connected).length && this.status === 'ended') {
      this.dispose();
      this.deps.onEmpty(this);
    }
  }

  /** Reassocia um usuário que voltou. */
  reattach(conn: Connection): boolean {
    const p = this.players.find((x) => x.userId === conn.user!.id);
    if (!p) return false;
    if (p.conn && p.conn !== conn) p.conn.close(4001, 'Sessão aberta em outro lugar');
    p.conn = conn;
    p.connected = true;
    p.disconnectedAt = null;
    conn.roomCode = this.code;
    conn.send({ t: 'room', room: this.info() });
    if (this.status === 'playing' && this.sim) {
      this.sendMatchStart(p);
      this.system(`${p.name} reconectou.`);
      this.broadcastRoom();
      conn.sendRaw(this.snapshotJson([]));
    }
    return true;
  }

  private checkDisconnects(): void {
    if (this.status !== 'playing') return;
    const now = this.now();
    for (const p of this.players) {
      if (!p.isAI && !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > this.deps.reconnectGraceMs) {
        p.disconnectedAt = null;
        this.forfeit(p.slot, 'disconnect');
        return;
      }
    }
  }

  // ------------------------------------------------------------ fim

  private finishing = false;

  private async finish(reason: EndReason): Promise<void> {
    if (this.finishing || !this.sim) return;
    this.finishing = true;
    this.status = 'ended';
    this.stopLoop();
    const sim = this.sim;
    const winnerSlot = sim.winner;
    const endedAt = this.now();
    const durationSeconds = Math.round(sim.tick / TICK_RATE);
    const result = (slot: Slot): 'win' | 'loss' | 'draw' => (winnerSlot === null ? 'draw' : winnerSlot === slot ? 'win' : 'loss');
    const winner = this.players.find((p) => p.slot === winnerSlot);

    const realUsers = this.players.filter((p) => !p.isAI && p.userId && !p.userId.startsWith('guest:'));
    let recorded = false;
    if (realUsers.length > 0) {
      try {
        recorded = await this.deps.record({
          room_code: this.code,
          mode: this.mode,
          map_seed: this.seed,
          started_at: new Date(this.startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          duration_seconds: durationSeconds,
          end_reason: reason,
          winner_id: winner && !winner.isAI && winner.userId && !winner.userId.startsWith('guest:') ? winner.userId : null,
          game_version: GAME_VERSION,
          players: this.players.map((p) => ({
            slot: p.slot,
            player_id: p.isAI || !p.userId || p.userId.startsWith('guest:') ? null : p.userId,
            is_ai: p.isAI,
            display_name: p.name,
            country_id: p.countryId,
            result: result(p.slot),
            stats: sim.players[p.slot]!.stats,
          })),
        });
      } catch (err) {
        log.error('Erro ao gravar partida', { err: String(err) });
      }
    }

    const end: MatchEndInfo = {
      winnerSlot,
      reason,
      durationSeconds,
      recorded,
      players: this.players.map((p) => ({ ...publicPlayer(p), stats: { ...sim.players[p.slot]!.stats }, result: result(p.slot) })),
    };
    this.broadcast({ t: 'match_end', end });
    this.broadcastRoom();
    log.info('Partida encerrada', { room: this.code, reason, winnerSlot, recorded, durationSeconds });
  }

  // ------------------------------------------------------------ envio

  private snapshotJson(events: SimEvent[]): string {
    return JSON.stringify({
      t: 'snapshot',
      s: makeSnapshot(this.sim!, events),
      paused: this.paused,
      speed: this.speed,
      pausedBy: this.pausedBy,
    } satisfies ServerMessage);
  }

  private broadcastSnapshot(): void {
    if (!this.sim) return;
    const json = this.snapshotJson(this.events.splice(0, this.events.length));
    for (const p of this.players) p.conn?.sendRaw(json);
  }

  broadcast(msg: ServerMessage): void {
    const json = JSON.stringify(msg);
    for (const p of this.players) p.conn?.sendRaw(json);
  }

  broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.info() });
  }

  chat(conn: Connection, text: string): void {
    const p = this.playerOf(conn);
    if (!p) return;
    this.broadcast({ t: 'chat', from: p.name, text });
  }

  private system(text: string): void {
    this.broadcast({ t: 'chat', from: 'Sistema', text, system: true });
  }

  private playerOf(conn: Connection): RoomPlayer | undefined {
    return this.players.find((p) => p.userId === conn.user?.id);
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  dispose(): void {
    this.stopLoop();
    for (const p of this.players) if (p.conn?.roomCode === this.code) p.conn.roomCode = null;
  }
}

function publicPlayer(p: RoomPlayer): RoomPlayerInfo {
  return { slot: p.slot, userId: p.userId, name: p.name, countryId: p.countryId, ready: p.ready, isAI: p.isAI, connected: p.connected };
}

function countryForAI(humanCountry: string): string {
  return humanCountry === 'ARG' ? 'BRA' : 'ARG';
}

