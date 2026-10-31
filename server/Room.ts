import { COUNTRIES, countryName } from '../shared/data/countries.ts';
import type {
  BalanceMode,
  EndReason,
  GameSpeed,
  NationalCommand,
  NationalSummary,
  NationView,
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
import { MAP_TYPE_INFO, MAP_TYPES, MAX_NATIONS_FREE, MAX_NATIONS_SUBSCRIBER, generateMatchMap, type MapType } from '../shared/sim/matchMap.ts';
import { Simulation } from '../shared/sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../shared/sim/snapshot.ts';
import { REPORT_EVERY_TICKS, medalsFor, pushSample, reportSample, type MatchReport, type ReportSample } from '../shared/sim/report.ts';
import { AI_THINK_TICKS, AI_HARASS_SECONDS, TacticalAI, type TacticalAISave } from '../shared/sim/TacticalAI.ts';
import { DIFFICULTY, type Difficulty } from '../shared/sim/difficulty.ts';
import { policyEffects, type TheaterStats } from '../shared/strategic/policies.ts';
import type { BuildingSnapshot } from '../shared/sim/snapshot.ts';
import type { EntityId, SimEvent, Slot } from '../shared/sim/types.ts';
import { NationalAI } from '../shared/strategic/NationalAI.ts';
import { NationalSimulation, type NationalEvent, type NationalSave } from '../shared/strategic/NationalSimulation.ts';
import { HISTORY_EVERY_DAYS, SCENARIO_START, TICKS_PER_DAY, militaryResearchSpeed } from '../shared/strategic/params.ts';
import { TECHNOLOGIES, type TechId } from '../shared/strategic/technologies.ts';
import { OperationsSystem, operationsView, type Operation, type OperationsSave } from '../shared/strategic/operations.ts';
import { sectorById } from '../shared/data/sectors.ts';
import type { Connection } from './Connection.ts';
import { log } from './logger.ts';
import type { MatchRecord } from './supabase.ts';

export const SNAPSHOT_EVERY = 2; // 10 snapshots/s
const MAX_COMMANDS_PER_TICK = 20;
/** Partida retomada de um salvamento: tempo extra para os jogadores reconectarem antes do abandono. */
export const RESTORE_GRACE_MS = 5 * 60_000;

/**
 * Estado completo de uma partida em andamento (JSON), para gravar e retomar depois de um
 * reinício do servidor: sala, simulação tática, camada nacional, operações, IA e névoa.
 */
export interface RoomSave {
  format: 1;
  gameVersion: string;
  savedAt: number;
  code: string;
  mode: RoomMode;
  hostUserId: string;
  balanceMode: BalanceMode;
  seed: number;
  startedAt: number;
  speed: GameSpeed;
  players: { slot: Slot; userId: string | null; name: string; countryId: string; isAI: boolean }[];
  /** `Simulation.serialize()` (preserva ±Infinity). */
  sim: string;
  national: NationalSave;
  ops: OperationsSave | null;
  ais: { slot: Slot; state: TacticalAISave }[];
  gdpStart: [Slot, number][];
  fog: [Slot, [EntityId, BuildingSnapshot][]][];
  /** Relatório pós-partida em construção (amostras e maior patente por jogador). */
  report?: { samples: ReportSample[]; bestRank: [Slot, number][] };
}

interface RoomPlayer extends RoomPlayerInfo {
  conn: Connection | null;
  disconnectedAt: number | null;
}

export interface RoomDeps {
  reconnectGraceMs: number;
  record: (rec: MatchRecord) => Promise<boolean>;
  onEmpty: (room: Room) => void;
  /** Partida encerrada (o salvamento em andamento deixa de valer). */
  onEnded?: (room: Room) => void;
  now?: () => number;
  /** Seed opcional (testes). */
  seed?: number;
  /** Sorteio do país dos bots (padrão: aleatório; com `seed`, o primeiro país livre, como nos testes). */
  random?: () => number;
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
  hostUserId = '';
  /** Nações na sala (o anfitrião escolhe de 2 até `nationLimit`). */
  maxPlayers = 2;
  /** Teto de nações: 4 na versão grátis, 6 com o anfitrião assinante; 2 no Sandbox. */
  nationLimit = MAX_NATIONS_FREE;
  mapType: MapType | 'random' = 'continental';
  balanceMode: BalanceMode = 'parity';
  difficulty: Difficulty = 'normal';
  national: NationalSimulation | null = null;
  private nationalAIs: NationalAI[] = [];
  private pendingNational: { slot: Slot; cmd: NationalCommand; conn: Connection | null }[] = [];
  private nationalEvents: NationalEvent[] = [];
  private gdpStart = new Map<Slot, number>();
  /** Relatório pós-partida: amostras do teatro e a maior patente alcançada por jogador. */
  private reportSamples: ReportSample[] = [];
  private bestRank = new Map<Slot, number>();
  private fogMemory = new Map<Slot, FogMemory>();
  /** Última versão de território enviada a cada jogador (o mapa só vai quando muda). */
  private territorySent = new Map<Slot, number>();

  sim: Simulation | null = null;
  private ais: TacticalAI[] = [];
  private pending: { slot: Slot; cmd: Command; conn: Connection | null }[] = [];
  /** Ordens às tropas nas batalhas locais das operações (Fase 8). */
  private pendingBattle: { slot: Slot; cmd: Command; conn: Connection | null }[] = [];
  private ops: OperationsSystem | null = null;
  private battleFog = new Map<number, FogMemory>();
  private opsDirty = new Set<Slot>();
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
  /** Até quando ninguém perde por abandono (partida retomada após reinício do servidor). */
  private graceUntil = 0;
  /** A pausa foi automática, pela queda da conexão (volta sozinha na reconexão). */
  private pausedForDisconnect = false;

  /** `host` nulo: sala retomada de um salvamento (ver `Room.restore`). */
  private readonly rand: () => number;

  constructor(
    readonly code: string,
    readonly mode: RoomMode,
    host: { conn: Connection; countryId: string } | null,
    private readonly deps: RoomDeps,
  ) {
    this.now = deps.now ?? Date.now;
    this.rand = deps.random ?? (deps.seed !== undefined ? () => 0 : Math.random);
    if (!host) return;
    const countryId = host.countryId;
    this.hostUserId = host.conn.user!.id;
    this.nationLimit = mode === 'sandbox' ? 2 : host.conn.user!.subscriber ? MAX_NATIONS_SUBSCRIBER : MAX_NATIONS_FREE;
    this.addHuman(host.conn, countryId);
    if (mode !== 'pvp') {
      this.players.push({
        slot: 1,
        userId: null,
        name: 'IA Tática',
        countryId: randomFreeCountry([countryId], this.rand),
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
      balanceMode: this.balanceMode,
      mapType: this.mapType,
      nationLimit: this.nationLimit,
      ...(this.mode !== 'pvp' || this.players.some((p) => p.isAI) ? { difficulty: this.difficulty } : {}),
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
    // a IA sempre comanda um país diferente do jogador
    for (const ai of this.players.filter((x) => x.isAI && x.countryId === countryId)) ai.countryId = randomFreeCountry(this.players.map((x) => x.countryId), this.rand);
    this.broadcastRoom();
  }

  setReady(conn: Connection, ready: boolean): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'lobby') return;
    p.ready = ready;
    this.broadcastRoom();
  }

  setBalance(conn: Connection, mode: BalanceMode): void {
    if (this.status !== 'lobby' || conn.user?.id !== this.hostUserId) return;
    this.balanceMode = mode;
    // mudar a regra exige nova confirmação dos demais
    this.players.forEach((p) => !p.isAI && p.userId !== this.hostUserId && (p.ready = false));
    this.system(mode === 'parity' ? 'Regra do teatro: paridade econômica.' : 'Regra do teatro: escala econômica real.');
    this.broadcastRoom();
  }

  setDifficulty(conn: Connection, difficulty: Difficulty): void {
    if (this.status !== 'lobby' || conn.user?.id !== this.hostUserId || (this.mode === 'pvp' && !this.players.some((p) => p.isAI))) return;
    this.difficulty = difficulty;
    this.system(`Dificuldade da IA: ${DIFFICULTY[difficulty].label} — ${DIFFICULTY[difficulty].description}`);
    this.broadcastRoom();
  }

  /** Anfitrião: número de nações e tipo de mapa. */
  setRoom(conn: Connection, opts: { maxPlayers?: number; mapType?: MapType | 'random' }): void {
    if (this.status !== 'lobby' || conn.user?.id !== this.hostUserId || this.mode === 'sandbox') return;
    if (opts.maxPlayers !== undefined) this.maxPlayers = Math.max(2, this.players.length, Math.min(this.nationLimit, opts.maxPlayers));
    if (opts.mapType !== undefined) {
      this.mapType = opts.mapType;
      this.system(`Mapa: ${opts.mapType === 'random' ? 'sorteado no início' : MAP_TYPE_INFO[opts.mapType].label}.`);
    }
    this.broadcastRoom();
  }

  /** Anfitrião: acrescenta uma nação comandada pela IA (bot), com um país ainda livre. */
  addBot(conn: Connection): string | null {
    if (this.status !== 'lobby') return 'A partida já começou';
    if (conn.user?.id !== this.hostUserId) return 'Apenas o anfitrião adiciona bots';
    if (this.mode === 'sandbox') return 'O Sandbox tem um único inimigo';
    if (this.players.length >= this.maxPlayers) {
      if (this.maxPlayers >= this.nationLimit)
        return this.nationLimit < MAX_NATIONS_SUBSCRIBER ? `Limite de ${this.nationLimit} nações na versão grátis (assinantes: até ${MAX_NATIONS_SUBSCRIBER})` : `Limite de ${this.nationLimit} nações`;
      this.maxPlayers++;
    }
    const used = new Set(this.players.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const bots = this.players.filter((p) => p.isAI).length;
    this.players.push({
      slot,
      userId: null,
      name: bots === 0 ? 'IA Tática' : `IA Tática ${bots + 1}`,
      countryId: randomFreeCountry(this.players.map((p) => p.countryId), this.rand),
      ready: true,
      isAI: true,
      connected: true,
      conn: null,
      disconnectedAt: null,
      team: null,
    });
    this.players.sort((a, b) => a.slot - b.slot);
    this.broadcastRoom();
    return null;
  }

  removeBot(conn: Connection, slot: Slot): void {
    if (this.status !== 'lobby' || conn.user?.id !== this.hostUserId) return;
    const i = this.players.findIndex((p) => p.slot === slot && p.isAI);
    // contra a IA, sempre sobra pelo menos um bot
    if (i < 0 || (this.mode !== 'pvp' && this.players.filter((p) => p.isAI).length <= 1)) return;
    this.players.splice(i, 1);
    this.broadcastRoom();
  }

  /** Anfitrião: país de um bot, ou sorteado entre os que ninguém da sala usa. Dois bots não repetem país. */
  setBotCountry(conn: Connection, slot: Slot, countryId: string | 'random'): void {
    if (this.status !== 'lobby' || conn.user?.id !== this.hostUserId) return;
    const bot = this.players.find((p) => p.slot === slot && p.isAI);
    if (!bot) return;
    const taken = this.players.filter((p) => p !== bot).map((p) => p.countryId);
    if (countryId === 'random') bot.countryId = randomFreeCountry([...taken, bot.countryId], this.rand);
    else if (!taken.includes(countryId)) bot.countryId = countryId;
    else return;
    this.broadcastRoom();
  }

  /** Time do próprio jogador, ou de um bot pelo anfitrião (1 a 3; null = sem time). */
  setTeam(conn: Connection, slot: Slot, team: number | null): void {
    if (this.status !== 'lobby' || this.mode === 'sandbox') return;
    const p = this.players.find((x) => x.slot === slot);
    if (!p) return;
    const own = !p.isAI && p.userId === conn.user?.id;
    const host = p.isAI && conn.user?.id === this.hostUserId;
    if (!own && !host) return;
    p.team = team;
    if (!p.isAI && p.userId !== this.hostUserId) p.ready = false;
    this.broadcastRoom();
  }

  start(conn: Connection): string | null {
    if (this.status !== 'lobby') return 'A partida já começou';
    if (conn.user!.id !== this.hostUserId) return 'Apenas o anfitrião pode iniciar';
    if (this.players.length < 2) return 'Aguardando outro jogador ou adicione um bot';
    // pelo menos dois lados: times iguais para todos não fazem uma guerra
    const sides = new Set(this.players.map((p) => (p.team ? `t${p.team}` : `s${p.slot}`)));
    if (sides.size < 2) return 'Todos no mesmo time: deixe pelo menos dois lados';
    if (!this.players.every((p) => p.ready || p.userId === this.hostUserId)) return 'Nem todos estão prontos';
    this.beginMatch();
    return null;
  }

  // ------------------------------------------------------------ partida

  private beginMatch(): void {
    this.seed = this.deps.seed ?? (Math.random() * 0xffffffff) >>> 0;
    // slots contínuos (0..n-1) na ordem do lobby: a simulação indexa nações por slot
    this.players.sort((a, b) => a.slot - b.slot).forEach((p, i) => (p.slot = i));
    const type = this.mapType === 'random' ? MAP_TYPES[this.seed % MAP_TYPES.length]! : this.mapType;
    const map = generateMatchMap(this.seed, { nations: this.players.length, type, countries: this.players.map((p) => p.countryId) });
    this.sim = new Simulation({ map, playerCount: this.players.length });
    this.sim.difficulty = this.difficulty;
    // progressão por eras (no Sandbox tudo fica liberado, mas o visual pode avançar)
    this.sim.eras = true;
    // os nomes das cidades (prefeituras e capital) vêm do país de cada jogador
    for (const p of this.players) this.sim.countries[p.slot] = p.countryId;
    this.ais = this.players.filter((p) => p.isAI).map((p) => new TacticalAI(p.slot));
    this.national = new NationalSimulation(
      this.players.map((p) => ({ slot: p.slot, countryId: p.countryId })),
      this.seed,
      this.balanceMode,
    );
    this.nationalAIs = this.players.filter((p) => p.isAI).map((p) => new NationalAI(p.slot, DIFFICULTY[this.difficulty].missiles, DIFFICULTY[this.difficulty].defenseBudgetMul));
    if (this.mode === 'sandbox') this.national.policiesActive = false;
    if (this.mode === 'sandbox') this.sim.sandbox = { slots: this.players.filter((p) => !p.isAI).map((p) => p.slot), instant: true, aiActive: false, reveal: false };
    this.wire();
    const sim = this.sim;
    const national = this.national;
    if (sim.sandbox) this.startSandbox();
    // times: quem está no mesmo time começa aliado (no teatro e na diplomacia)
    for (const a of this.players)
      for (const b of this.players)
        if (a.slot < b.slot && a.team && a.team === b.team) {
          sim.setAlliance(a.slot, b.slot, true);
          national.diplomacy.teamAlliance(a.slot, b.slot, national.day);
        }
    // operações expedicionárias contra governos fora do teatro (Fase 8)
    this.ops = new OperationsSystem(sim, national, this.seed);
    for (const n of this.national.nations) this.gdpStart.set(n.slot, n.gdpUsd);
    this.reportSamples = [this.sampleReport()];
    this.applyNationalModifiers();
    this.status = 'playing';
    this.startedAt = this.now();
    this.paused = false;
    this.speed = 1;
    for (const p of this.players) if (p.conn) this.sendMatchStart(p);
    this.broadcastRoom();
    this.broadcastSnapshot();
    this.broadcastNational(true);
    log.info('Partida iniciada', { room: this.code, mode: this.mode, seed: this.seed });
    this.startLoop();
  }

  /**
   * Liga as camadas da partida (a guerra nacional libera o combate no teatro; melhorias, pesquisa,
   * verba de obras e comércio consultam a nação). Vale para a partida nova e para a retomada.
   */
  private wire(): void {
    const sim = this.sim!;
    const national = this.national!;
    // a guerra declarada na camada nacional é o que libera o combate no teatro
    national.attachTheater({
      resources: (slot) => sim.players[slot]?.resources ?? null,
      spend: (slot, cost) => void sim.spendResources(slot, cost),
      setWar: (a, b) => sim.setWar(a, b, true),
      stats: (slot) => theaterStats(sim, slot),
      grant: (slot, cost) => sim.grantResources(slot, cost),
    });
    // melhorias de construções consultam pesquisas, condições nacionais e a verba de obras
    // Sandbox: tudo pesquisado, estabilidade máxima e verba de obras ilimitada (sem mexer no orçamento)
    const free = (slot: Slot) => sim.isSandbox(slot);
    const allTechs = Object.keys(TECHNOLOGIES) as TechId[];
    sim.national = {
      techs: (slot) => (free(slot) ? allTechs : (national.nation(slot)?.research.done ?? [])),
      infrastructureIndex: (slot) => national.nation(slot)?.infrastructureIndex ?? 1,
      stability: (slot) => (free(slot) ? 100 : (national.nation(slot)?.stability ?? 0)),
      worksFundUsd: (slot) => (free(slot) ? 1e15 : (national.nation(slot)?.works.fundUsd ?? 0)),
      chargeWorks: (slot, usd, description) => free(slot) || national.chargeWorks(slot, usd, description),
      refundWorks: (slot, usd, description) => (free(slot) ? undefined : national.refundWorks(slot, usd, description)),
      researchSpeed: (slot) => militaryResearchSpeed(national.nation(slot)?.budget.researchPct ?? 0),
      worksCapUsd: (slot) => national.nation(slot)?.works.capUsd ?? 0,
    };
    // comércio internacional: diplomacia, países da IA e tesouro nacional
    const d = national.diplomacy;
    sim.setTradeLink({
      npcs: () => national.npcs.map((n) => ({ id: n.slot, countryId: n.countryId })),
      knows: (a, b) => d.knows(a, b),
      atWar: (a, b) => d.atWar(a, b),
      sanctioned: (a, b) => !!d.active('sanctions', a, b),
      relation: (a, b) => d.relation(a, b),
      atWarAny: (a) => d.warPairs().some(([x, y]) => x === a || y === a),
      debtPctGdp: (slot) => {
        const n = national.nation(slot);
        return n ? (n.debtUsd / n.gdpUsd) * 100 : 0;
      },
      pay: (slot, usd, description) => national.tradePayment(slot, usd, description.startsWith('Frete') ? 'freight' : usd >= 0 ? 'export' : 'import'),
      partnerName: (id) => countryName(national.nation(id)?.countryId ?? '') || `Jogador ${id + 1}`,
    });
  }

  /** Sandbox: contato e guerra com a IA desde o início (o combate fica liberado na hora). */
  private startSandbox(): void {
    const sim = this.sim!;
    const national = this.national!;
    sim.sandboxTopUp();
    for (const me of sim.sandbox!.slots)
      for (const ai of this.players.filter((p) => p.isAI)) {
        national.diplomacy.discover(me, ai.slot, 'contato', national.day);
        national.diplomacy.discover(ai.slot, me, 'contato', national.day);
        if (national.declareWar(me, ai.slot)) sim.setWar(me, ai.slot, true);
      }
  }

  private startLoop(): void {
    this.lastLoopTime = this.now();
    if (this.deps.autoLoop !== false) this.loop = setInterval(() => this.onLoop(), 1000 / TICK_RATE / 2);
  }

  // ------------------------------------------------------------ salvar e retomar

  /** Ids dos jogadores humanos (para achar a partida salva quando um deles volta). */
  userIds(): string[] {
    return this.players.filter((p) => !p.isAI && p.userId).map((p) => p.userId!);
  }

  get tick(): number {
    return this.sim?.tick ?? 0;
  }

  /** Estado completo da partida em andamento (null fora da partida). */
  toSave(): RoomSave | null {
    if (this.status !== 'playing' || !this.sim || !this.national) return null;
    return {
      format: 1,
      gameVersion: GAME_VERSION,
      savedAt: this.now(),
      code: this.code,
      mode: this.mode,
      hostUserId: this.hostUserId,
      balanceMode: this.balanceMode,
      seed: this.seed,
      startedAt: this.startedAt,
      speed: this.speed,
      players: this.players.map((p) => ({ slot: p.slot, userId: p.userId, name: p.name, countryId: p.countryId, isAI: p.isAI })),
      sim: this.sim.serialize(),
      national: this.national.toSave(),
      ops: this.ops?.toSave() ?? null,
      ais: this.ais.map((a) => ({ slot: a.slot, state: a.toSave() })),
      gdpStart: [...this.gdpStart],
      fog: [...this.fogMemory].map(([slot, m]) => [slot, [...m.known]]),
      report: { samples: this.reportSamples, bestRank: [...this.bestRank] },
    };
  }

  /**
   * Retoma uma partida salva: todos começam desconectados; os humanos têm RESTORE_GRACE_MS para
   * voltar (contra a IA a partida fica pausada até lá). Continuar daqui é idêntico a continuar da
   * partida original.
   */
  static restore(save: RoomSave, deps: RoomDeps): Room {
    if (save.format !== 1) throw new Error(`Formato de salvamento não suportado: ${String(save.format)}`);
    const room = new Room(save.code, save.mode, null, deps);
    const now = room.now();
    room.hostUserId = save.hostUserId;
    room.balanceMode = save.balanceMode;
    room.seed = save.seed;
    room.startedAt = save.startedAt;
    room.speed = save.speed;
    for (const p of save.players) room.players.push({ ...p, ready: true, connected: p.isAI, conn: null, disconnectedAt: p.isAI ? null : now });
    room.players.sort((a, b) => a.slot - b.slot);
    room.sim = Simulation.deserialize(save.sim);
    room.difficulty = room.sim.difficulty;
    room.national = new NationalSimulation(
      room.players.map((p) => ({ slot: p.slot, countryId: p.countryId })),
      save.seed,
      save.balanceMode,
    );
    room.national.load(save.national);
    if (save.mode === 'sandbox') room.national.policiesActive = false;
    room.wire();
    room.ops = new OperationsSystem(room.sim, room.national, save.seed);
    if (save.ops) room.ops.load(save.ops);
    room.ais = room.players.filter((p) => p.isAI).map((p) => new TacticalAI(p.slot));
    for (const a of room.ais) {
      const st = save.ais.find((x) => x.slot === a.slot);
      if (st) a.load(st.state);
    }
    room.nationalAIs = room.players.filter((p) => p.isAI).map((p) => new NationalAI(p.slot, DIFFICULTY[room.difficulty].missiles, DIFFICULTY[room.difficulty].defenseBudgetMul));
    for (const [slot, usd] of save.gdpStart) room.gdpStart.set(slot, usd);
    room.reportSamples = save.report?.samples ?? [];
    for (const [slot, r] of save.report?.bestRank ?? []) room.bestRank.set(slot, r);
    for (const [slot, known] of save.fog) {
      const m = new FogMemory();
      for (const [id, b] of known) m.known.set(id, b);
      room.fogMemory.set(slot, m);
    }
    room.applyNationalModifiers();
    room.status = 'playing';
    room.graceUntil = now + RESTORE_GRACE_MS;
    if (save.mode !== 'pvp') {
      room.paused = true;
      room.pausedBy = room.players.find((p) => !p.isAI)?.name ?? null;
      room.pausedForDisconnect = true;
    }
    room.startLoop();
    return room;
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
      ...(sim.map.kind ? { mapKind: sim.map.kind } : {}),
      tickRate: TICK_RATE,
      snapshotEvery: SNAPSHOT_EVERY,
      canControlSpeed: this.mode !== 'pvp',
      mode: this.mode,
      difficulty: this.difficulty,
      balanceMode: this.balanceMode,
      scenarioStart: SCENARIO_START,
      ticksPerDay: TICKS_PER_DAY,
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
    try {
      while (this.accumulator >= tickMs && steps < 8 && this.status === 'playing') {
        this.accumulator -= tickMs;
        this.advance();
        steps++;
      }
    } catch (err) {
      // um erro na simulação não pode derrubar o servidor (nem as outras partidas): congela esta
      log.error('Erro na simulação; partida pausada', { room: this.code, tick: this.sim?.tick, err: String(err), stack: (err as Error)?.stack });
      this.paused = true;
      this.pausedBy = 'Servidor';
      this.system('Erro interno na simulação: partida pausada. Ela foi salva e pode ser retomada.');
    }
  }

  /** Executa exatamente um tick da simulação (exposto para testes). */
  advance(): void {
    const sim = this.sim;
    if (!sim || this.status !== 'playing') return;
    // Sandbox: a IA inimiga só age quando o jogador liga (senão a base fica parada como alvo)
    if (sim.tick % AI_THINK_TICKS === 0 && (!sim.sandbox || sim.sandbox.aiActive)) {
      for (const ai of this.ais) {
        const cmds = ai.think(sim);
        // incidente de fronteira (assédio no preparo): abre antes das ordens, para as tropas entrarem
        if (ai.wantsIncident) {
          sim.startIncident(ai.slot, ai.wantsIncident.victim, AI_HARASS_SECONDS, ai.wantsIncident.pos);
          ai.wantsIncident = null;
        }
        for (const cmd of cmds) sim.applyCommand(ai.slot, cmd);
        // a IA pede a guerra pelo mesmo caminho validado do jogador; se faltar algo, tenta depois
        if (ai.wantsWarWith !== null && this.national && !this.national.diplomaticAction(ai.slot, { type: 'declare_war', target: ai.wantsWarWith })) {
          ai.wantsWarWith = null;
          this.broadcastNational();
        }
      }
    }
    const batch = this.pending.splice(0, this.pending.length);
    for (const { slot, cmd, conn } of batch) {
      const err =
        cmd.type === 'launch_operation'
          ? this.ops
            ? this.ops.launch(slot, cmd.target, cmd.sectorId, cmd.unitIds)
            : 'Indisponível'
          : cmd.type === 'operation_retreat'
            ? this.ops
              ? this.ops.retreat(slot, cmd.opId)
              : 'Indisponível'
            : sim.applyCommand(slot, cmd);
      if (err) conn?.send({ t: 'cmd_rejected', reason: err });
      else if (cmd.type === 'launch_operation' || cmd.type === 'operation_retreat') this.opsDirty.add(slot);
    }
    for (const { slot, cmd, conn } of this.pendingBattle.splice(0, this.pendingBattle.length)) {
      const err = this.ops ? this.ops.battleCommand(slot, cmd) : 'Indisponível';
      if (err) conn?.send({ t: 'cmd_rejected', reason: err });
    }
    sim.step();
    this.stepOperations();
    const tickEvents = sim.drainEvents();
    this.events.push(...tickEvents);
    for (const e of tickEvents) if (e.type === 'unit_promoted' && e.rank > (this.bestRank.get(e.owner) ?? 0)) this.bestRank.set(e.owner, e.rank);
    if (sim.tick % REPORT_EVERY_TICKS === 0) this.reportSamples = pushSample(this.reportSamples, this.sampleReport());
    this.advanceNational(tickEvents);
    if (sim.tick % SNAPSHOT_EVERY === 0 || sim.ended) this.broadcastSnapshot();
    if (sim.ended) void this.finish(this.endReason ?? sim.victory ?? (sim.winner === null ? 'draw' : 'hq_destroyed'));
  }

  /** Operações: viagem, batalhas locais (snapshots só para o dono), reconciliação e volta. */
  private stepOperations(): void {
    const ops = this.ops;
    const sim = this.sim;
    if (!ops || !sim) return;
    const before = new Map(ops.ops.map((o) => [o.id, o.state]));
    ops.step();
    for (const op of ops.ops) {
      const prev = before.get(op.id);
      if (prev !== op.state) this.opsDirty.add(op.owner);
      if (prev === 'transit' && op.state === 'battle') this.sendBattleStart(op);
    }
    if (sim.tick % SNAPSHOT_EVERY === 0) for (const [id, battle] of ops.battles) this.sendBattleSnapshot(id, battle);
    for (const [id, battle] of ops.finishedBattles) {
      const op = ops.ops.find((o) => o.id === id)!;
      this.sendBattleSnapshot(id, battle);
      this.playerBySlot(op.owner)?.conn?.send({ t: 'battle_end', opId: id, result: op.result! });
      this.battleFog.delete(id);
      ops.battleEvents.delete(id);
    }
    ops.finishedBattles.clear();
    if (sim.tick % TICKS_PER_DAY === 0) for (const p of this.players) if (!p.isAI) this.opsDirty.add(p.slot);
    for (const slot of this.opsDirty) this.sendOperations(slot);
    this.opsDirty.clear();
  }

  private playerBySlot(slot: Slot): RoomPlayer | undefined {
    return this.players.find((p) => p.slot === slot);
  }

  private sendOperations(slot: Slot): void {
    const p = this.playerBySlot(slot);
    if (!p?.conn || p.isAI || !this.ops || !this.national || !this.sim) return;
    p.conn.send({ t: 'operations', ops: operationsView(this.ops, this.national, slot, this.sim.tick) });
  }

  private sendBattleStart(op: Operation): void {
    const p = this.playerBySlot(op.owner);
    const battle = this.ops?.battles.get(op.id);
    if (!p?.conn || !battle || !this.national) return;
    const def = sectorById(op.sectorId)!;
    const view = operationsView(this.ops!, this.national, op.owner, this.sim!.tick)
      .wars.find((w) => w.target === op.target)
      ?.sectors.find((s) => s.id === op.sectorId);
    const target = this.national.nation(op.target);
    p.conn.send({
      t: 'battle_start',
      battle: {
        opId: op.id,
        target: op.target,
        targetCountryId: target?.countryId ?? '',
        sector: view ?? { ...def, control: 'enemy', garrison: 0 },
        match: {
          seed: op.seed,
          yourSlot: 0,
          players: [
            { slot: 0, userId: p.userId, name: p.name, countryId: p.countryId, ready: true, isAI: false, connected: true },
            { slot: 1, userId: null, name: countryName(target?.countryId ?? '') || 'Defensor', countryId: target?.countryId ?? '', ready: true, isAI: true, connected: true },
          ],
          terrain: battle.map.terrain.join(''),
          width: battle.map.width,
          height: battle.map.height,
          cellSize: battle.map.cellSize,
          resourceNodes: battle.map.resourceNodes,
          spawns: battle.map.spawns,
          tickRate: TICK_RATE,
          snapshotEvery: SNAPSHOT_EVERY,
          canControlSpeed: false,
          balanceMode: this.balanceMode,
          scenarioStart: SCENARIO_START,
          ticksPerDay: TICKS_PER_DAY,
        },
      },
    });
    this.sendBattleSnapshot(op.id, battle);
  }

  private sendBattleSnapshot(opId: number, battle: Simulation): void {
    const op = this.ops?.ops.find((o) => o.id === opId);
    const p = op ? this.playerBySlot(op.owner) : undefined;
    const events = this.ops?.battleEvents.get(opId)?.splice(0) ?? [];
    if (!p?.conn) return;
    let memory = this.battleFog.get(opId);
    if (!memory) this.battleFog.set(opId, (memory = new FogMemory()));
    p.conn.sendRaw(
      JSON.stringify({
        t: 'snapshot',
        s: makeSnapshot(battle, events, { slot: 0, memory }, true),
        paused: this.paused,
        speed: this.speed,
        pausedBy: this.pausedBy,
        scope: 'battle',
        opId,
      } satisfies ServerMessage),
    );
  }

  /** Camada nacional: comandos pendentes, um dia a cada TICKS_PER_DAY ticks e modificadores táticos. */
  private advanceNational(tickEvents: SimEvent[]): void {
    const national = this.national;
    const sim = this.sim;
    if (!national || !sim) return;
    national.registerTacticalEvents(tickEvents);
    let diplomacyChanged = false;
    for (const { slot, cmd, conn } of this.pendingNational.splice(0, this.pendingNational.length)) {
      const err =
        cmd.type === 'set_budget'
          ? national.setBudget(slot, cmd.budget)
          : cmd.type === 'set_research'
            ? national.setResearch(slot, cmd.techId)
            : cmd.type === 'decree'
              ? national.setDecree(slot, cmd.id, cmd.active)
              : cmd.type === 'request_respond'
                ? national.respondRequest(slot, cmd.accept)
                : national.diplomaticAction(slot, cmd.action);
      if (err) conn?.send({ t: 'cmd_rejected', reason: err });
      else if (cmd.type === 'diplomacy' || cmd.type === 'decree' || cmd.type === 'request_respond') diplomacyChanged = true;
      if (!err && cmd.type === 'decree') this.applyNationalModifiers();
    }
    if (sim.tick % TICKS_PER_DAY !== 0) {
      // decisões diplomáticas (contato, guerra, tratados) aparecem na hora, sem esperar o dia virar
      if (diplomacyChanged) this.broadcastNational();
      return;
    }
    // Sandbox com a IA pausada: o governo inimigo também não mexe em orçamento nem diplomacia
    // (senão poderia propor paz e desligar o combate no meio do teste)
    if (national.day % 30 === 0 && (!sim.sandbox || sim.sandbox.aiActive)) {
      for (const ai of this.nationalAIs) {
        const r = ai.think(national);
        if (r.budget) national.setBudget(ai.slot, r.budget);
        for (const d of r.decrees) national.setDecree(ai.slot, d.id, d.active);
        if (r.research !== undefined) national.setResearch(ai.slot, r.research);
        for (const action of r.diplomacy) national.diplomaticAction(ai.slot, action);
      }
    }
    national.stepDay();
    // vitória política: governo em colapso de estabilidade por tempo demais cai
    for (const p of this.players) {
      const n = national.nation(p.slot);
      if (n) sim.politicalPressure(p.slot, n.stability);
    }
    this.applyNationalModifiers();
    this.broadcastNational();
  }

  private applyNationalModifiers(): void {
    if (!this.national || !this.sim) return;
    for (const n of this.national.nations) {
      const fx = this.national.effects(n.slot);
      const pol = policyEffects(n.policies);
      // choque nuclear global: a coleta e a logística de todos caem enquanto durar
      const shock = this.national.shockTheaterMul();
      this.sim.setModifiers(n.slot, {
        constructionTimeMul: fx.constructionTimeMul,
        productionTimeMul: fx.productionTimeMul * pol.productionTimeMul,
        recruitCostMul: pol.recruitCostMul,
        foodUpkeepMul: pol.foodUpkeepMul,
        externalIncome: n.theaterSupplyPerSec * shock,
        territoryMul: fx.territoryMul,
        // bônus declarado de coleta da IA (só no Brutal)
        gatherMul: (this.players.find((p) => p.slot === n.slot)?.isAI ? 1 + DIFFICULTY[this.difficulty].gatherBonus : 1) * pol.gatherMul * shock,
      });
    }
  }

  /** Relatório nacional por jogador: cada um recebe só a própria nação e o que conhece das outras. */
  private broadcastNational(fullHistory = false): void {
    if (!this.national) return;
    this.nationalEvents.push(...this.national.drainEvents());
    const events = this.nationalEvents.splice(0, this.nationalEvents.length);
    const withHistory = fullHistory || this.national.day % HISTORY_EVERY_DAYS === 0;
    for (const p of this.players) p.conn?.send(this.nationalMessage(p.slot, events, withHistory));
  }

  private nationalMessage(slot: Slot, events: NationalEvent[], withHistory: boolean): ServerMessage {
    const national = this.national!;
    return {
      t: 'national',
      day: national.day,
      date: national.date(),
      nations: this.nationViews(slot, withHistory),
      events: national.eventsFor(slot, events),
      diplomacy: national.viewFor(slot),
    };
  }

  private nationViews(slot: Slot, withHistory: boolean): NationView[] {
    return (this.national?.nations ?? [])
      .filter((n) => n.slot === slot)
      .map(({ history, casualties30d, victories30d: _v, ...rest }) => ({
        ...rest,
        casualties30d: casualties30d.reduce((a, c) => a + c, 0),
        ...(withHistory ? { history } : {}),
      }));
  }

  nationalCommand(conn: Connection, cmd: NationalCommand): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'playing' || !this.national) return;
    if (this.pendingNational.filter((x) => x.slot === p.slot).length >= 10) return;
    this.pendingNational.push({ slot: p.slot, cmd, conn });
  }

  command(conn: Connection, cmd: Command, scope?: 'battle'): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'playing' || !this.sim) return;
    if (scope === 'battle') {
      if (this.pendingBattle.filter((x) => x.slot === p.slot).length >= MAX_COMMANDS_PER_TICK) return;
      this.pendingBattle.push({ slot: p.slot, cmd, conn });
      return;
    }
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
    this.pausedForDisconnect = false;
    this.system(paused ? `${p.name} pausou a partida.` : `${p.name} retomou a partida.`);
    this.broadcastSnapshot();
  }

  setSpeed(conn: Connection, speed: GameSpeed): void {
    const p = this.playerOf(conn);
    if (!p || this.status !== 'playing') return;
    if (this.mode === 'pvp') {
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
      if (this.mode !== 'pvp' && !this.paused) {
        this.paused = true;
        this.pausedBy = p.name;
        this.pausedForDisconnect = true;
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
      // a pausa automática da queda termina quando todos os humanos estão de volta
      if (this.pausedForDisconnect && this.players.every((x) => x.isAI || x.connected)) {
        this.paused = false;
        this.pausedBy = null;
        this.pausedForDisconnect = false;
      }
      this.sendMatchStart(p);
      this.system(`${p.name} reconectou.`);
      this.broadcastRoom();
      this.territorySent.delete(p.slot); // reconexão: reenvia as fronteiras
      conn.sendRaw(this.snapshotJson([], p.slot));
      if (this.national) conn.send(this.nationalMessage(p.slot, [], true));
      // operação em combate: o cliente reabre a batalha local
      const battle = this.ops?.battleOf(p.slot);
      if (battle) {
        this.battleFog.delete(battle.op.id);
        this.sendBattleStart(battle.op);
      }
      this.sendOperations(p.slot);
    }
    return true;
  }

  private checkDisconnects(): void {
    if (this.status !== 'playing') return;
    const now = this.now();
    if (now < this.graceUntil) return;
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
    this.deps.onEnded?.(this);
    const sim = this.sim;
    const winnerSlot = sim.winner;
    const endedAt = this.now();
    const durationSeconds = Math.round(sim.tick / TICK_RATE);
    const result = (slot: Slot): 'win' | 'loss' | 'draw' => (winnerSlot === null ? 'draw' : winnerSlot === slot ? 'win' : 'loss');
    const winner = this.players.find((p) => p.slot === winnerSlot);

    // relatório pós-partida: vai na tela de resultado e também no histórico do Supabase
    this.reportSamples = pushSample(this.reportSamples, this.sampleReport());
    const report: MatchReport = {
      samples: this.reportSamples,
      medals: this.players.map((p) => {
        const nat = this.nationalSummary(p.slot);
        return {
          slot: p.slot,
          medals: medalsFor({
            result: result(p.slot),
            reason,
            durationSeconds,
            stats: sim.players[p.slot]!.stats,
            gdpStartUsd: nat?.gdpStartUsd ?? null,
            gdpEndUsd: nat?.gdpEndUsd ?? null,
            bestRank: this.bestRank.get(p.slot) ?? 0,
          }),
        };
      }),
    };
    // o Sandbox não conta no histórico nem no ranking
    const realUsers = this.mode === 'sandbox' ? [] : this.players.filter((p) => !p.isAI && p.userId && !p.userId.startsWith('guest:'));
    let recorded = false;
    if (realUsers.length > 0) {
      try {
        // a gravação nunca segura o fim da partida: sem resposta do banco em 8 s, o resultado sai assim mesmo
        recorded = await withTimeout(
          this.deps.record({
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
              national: this.nationalSummary(p.slot),
            })),
            balance_mode: this.balanceMode,
            report,
          }),
          RECORD_TIMEOUT_MS,
          false,
        );
      } catch (err) {
        log.error('Erro ao gravar partida', { err: String(err) });
      }
    }

    const end: MatchEndInfo = {
      winnerSlot,
      reason,
      durationSeconds,
      recorded,
      report,
      players: this.players.map((p) => ({
        ...publicPlayer(p),
        stats: { ...sim.players[p.slot]!.stats },
        result: result(p.slot),
        national: this.nationalSummary(p.slot),
      })),
    };
    this.broadcast({ t: 'match_end', end });
    this.broadcastRoom();
    log.info('Partida encerrada', { room: this.code, reason, winnerSlot, recorded, durationSeconds });
  }

  private sampleReport(): ReportSample {
    return reportSample(this.sim!, (slot) => this.national?.nation(slot)?.gdpUsd ?? null);
  }

  private nationalSummary(slot: Slot): NationalSummary | null {
    const n = this.national?.nation(slot);
    if (!n || !this.national) return null;
    const start = this.gdpStart.get(slot) ?? n.gdpUsd;

    const avg = n.history.length > 0 ? n.history.reduce((a, h) => a + h.growthPct, 0) / n.history.length : n.realGrowthPct;
    return {
      countryId: n.countryId,
      days: this.national.day,
      gdpStartUsd: Math.round(start),
      gdpEndUsd: Math.round(n.gdpUsd),
      realGrowthAvgPct: Math.round(avg * 100) / 100,
      approvalEnd: Math.round(n.approval * 10) / 10,
      debtPctGdpEnd: Math.round((n.debtUsd / n.gdpUsd) * 1000) / 10,
      inflationEndPct: Math.round(n.inflationPct * 10) / 10,
      unemploymentEndPct: Math.round(n.unemploymentPct * 10) / 10,
      researchDone: [...n.research.done],
    };
  }

  // ------------------------------------------------------------ envio

  /**
   * Snapshot com névoa de guerra para um jogador. Ao fim da partida o mapa é revelado (sem filtro).
   */
  private snapshotJson(events: SimEvent[], slot: Slot): string {
    const sim = this.sim!;
    let memory = this.fogMemory.get(slot);
    if (!memory) this.fogMemory.set(slot, (memory = new FogMemory()));
    const withTerritory = this.territorySent.get(slot) !== sim.territoryVersion;
    this.territorySent.set(slot, sim.territoryVersion);
    return JSON.stringify({
      t: 'snapshot',
      s: sim.ended ? makeSnapshot(sim, events, undefined, withTerritory) : makeSnapshot(sim, events, { slot, memory }, withTerritory),
      paused: this.paused,
      speed: this.speed,
      pausedBy: this.pausedBy,
    } satisfies ServerMessage);
  }

  private broadcastSnapshot(): void {
    if (!this.sim) return;
    const events = this.events.splice(0, this.events.length);
    // gera para todo humano (mesmo desconectado) para manter a memória da névoa atualizada
    for (const p of this.players) {
      if (p.isAI) continue;
      const json = this.snapshotJson(events, p.slot);
      p.conn?.sendRaw(json);
    }
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

  /** Congela a simulação (encerramento do servidor: o estado gravado é o último). */
  freeze(): void {
    this.stopLoop();
  }

  dispose(): void {
    this.stopLoop();
    for (const p of this.players) if (p.conn?.roomCode === this.code) p.conn.roomCode = null;
  }
}

function publicPlayer(p: RoomPlayer): RoomPlayerInfo {
  return { slot: p.slot, userId: p.userId, name: p.name, countryId: p.countryId, ready: p.ready, isAI: p.isAI, connected: p.connected, ...(p.team ? { team: p.team } : {}) };
}

/** País sorteado entre os que ninguém da sala usa (bots variam de partida para partida). */
function randomFreeCountry(taken: readonly string[], rand: () => number): string {
  const free = COUNTRIES.filter((c) => !taken.includes(c.id));
  const pool = free.length ? free : COUNTRIES.filter((c) => c.id !== taken[0]);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!.id;
}

const RECORD_TIMEOUT_MS = 8000;

/** Espera a promessa até `ms`; depois disso, segue com `fallback` (a promessa continua por conta própria). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      log.warn('Gravação da partida demorou demais; resultado enviado sem confirmação');
      resolve(fallback);
    }, ms);
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), late]);
}

/** O que as facções observam no teatro de um jogador. */
export function theaterStats(sim: Simulation, slot: Slot): TheaterStats {
  const buildings: TheaterStats['buildings'] = {};
  for (const b of sim.buildings) if (b.owner === slot && b.progress >= 1 && b.hp > 0) buildings[b.type] = (buildings[b.type] ?? 0) + 1;
  const pop = sim.population(slot);
  const homes = sim.pavedHomes(slot);
  const leftoverMines = sim.atWarAny(slot) ? 0 : sim.mines.mines.filter((m) => m.owner === slot).length;
  return {
    buildings,
    military: sim.units.filter((u) => u.owner === slot).length,
    workers: pop.employed,
    food: sim.players[slot]?.resources.food ?? 0,
    homes: homes.homes,
    pavedHomes: homes.paved,
    ...(sim.power ? { litHomes: sim.litHomesOf(slot).lit } : {}),
    leftoverMines,
    services: sim.serviceCoverage(slot),
  };
}
