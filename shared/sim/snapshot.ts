import { BUILDINGS, MINE, RESOURCE_TYPES, SPACE, TICK_RATE, UNITS, type BuildingType, type DepositSize, type MilitaryResearchId, type ProducibleType, type Stockpile, type UnitType } from './config.ts';
import type { Population, Simulation } from './Simulation.ts';
import { encodeTerritory } from './territory.ts';
import type { BuildingStatus, EntityId, SimEvent, Slot, UnitActivity, Vec2 } from './types.ts';
import { buildingEffects, type SpecId } from './upgrades.ts';
import { combineMods, type ModId } from './modernization.ts';
import { AIRCRAFT, IRON_DOME, MISSILE, NUCLEAR, missileSpec, type AircraftState, type AircraftType, type LaunchState, type MissionKind, type MissionResult, type MissionState } from './air.ts';
import { caravanIncome, type CaravanState } from './caravans.ts';
import { TRADE_RESOURCES, TRANSPORT_MODES, type ShipmentState, type TradeContract, type TradeOffer, type TradeResource, type TransportMode } from './trade.ts';
import type { MarketResource } from './market.ts';

export interface UnitSnapshot {
  id: EntityId;
  type: UnitType;
  owner: Slot;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  activity: UnitActivity;
  order: 'idle' | 'move' | 'attackMove' | 'attack';
  targetId: EntityId | null;
  /** Sofrendo atrito em território inimigo. */
  attrition?: true;
  /** Pacotes de modernização instalados (equipamento visível no próprio veículo/soldado). */
  mods?: ModId[];
  /** Patente (veterania), visível como insígnia para todos; ausente = recruta. */
  rank?: number;
  /** Era do visual da unidade (ausente = 1). */
  era?: number;
  /** Abates (só para o dono). */
  kills?: number;
  /** Modernização em andamento (só para o dono). */
  refit?: { mod: ModId; progress: number; facility: EntityId };  /** Recarga da salva (lança-foguetes): 0 recém-disparado → 1 pronto; ausente quando pronto. */
  reload?: number;
}

export interface BuildingSnapshot {
  id: EntityId;
  type: BuildingType;
  owner: Slot;
  cx: number;
  cy: number;
  hp: number;
  /** Vida máxima atual (cresce com o nível). */
  maxHp: number;
  progress: number;
  /** Nível de melhoria (1..10) e especialização — visíveis no próprio modelo, logo para todos. */
  level: number;
  spec: SpecId | null;
  /** Obra de melhoria: progresso só para o dono; para os demais, apenas que há obra (andaimes). */
  upgrade?: { toLevel: number; progress: number; spec: SpecId | null } | { visible: true };
  queue: { unitType: ProducibleType; progress: number }[];
  rally: Vec2 | null;
  /** Células de recurso reivindicadas (só para edifícios próprios de coleta). */
  claims?: number[];
  /** Só para edifícios próprios: trabalho, situação, estoque e depósito explorado. */
  workers?: number;
  workerTarget?: number;
  /** Produção ligada por estrada ao QG ou a uma prefeitura (+15%); só para o dono, em coletas e usinas. */
  roadLinked?: boolean;
  status?: BuildingStatus;
  /** Produção atual por segundo (edifícios de coleta). */
  rate?: number;
  stored?: number;
  deposit?: { remaining: number; initial: number; size: DepositSize; maxSites: number };
  /** Edifício inimigo fora de visão: último estado conhecido (pode estar desatualizado). */
  remembered?: boolean;
  /** Pesquisa militar em andamento (só edifícios próprios). */
  research?: { id: MilitaryResearchId; progress: number };
  /** Nome da cidade (prefeituras; a capital no QG). */
  city?: string;
  /** Programa Espacial: lançamento em andamento (visível para todos). */
  launch?: { phase: 'countdown' | 'ascent'; progress: number };
}

export interface PlayerSnapshot {
  slot: Slot;
  /** Recursos e renda só são enviados ao próprio jogador (null para os demais). */
  resources: Stockpile | null;
  income: Stockpile | null;
  capacity: Stockpile | null;
  population: Population | null;
  hungry: boolean | null;
  defeated: boolean;
  /** Pesquisas militares concluídas (só para o próprio jogador). */
  militaryResearch?: MilitaryResearchId[];
  /** Era (pública: aparece nas construções) e avanço em andamento (só para o próprio jogador). */
  era?: number;
  eraAdvance?: { to: number; progress: number };
  /** Progressão por eras ligada nesta partida. */
  eras?: boolean;
  /** Satélite em órbita (público). */
  satellite?: true;
  /** Bens industriais (só para o próprio jogador) e o teto do estoque. */
  goods?: { fuel: number; steel: number; cap: number };
  /** Pressão do mercado interno por recurso (só para o próprio jogador; baixa o preço de venda). */
  market?: Partial<Record<MarketResource, number>>;
  /** Demanda acumulada das compras no mercado interno (só para o dono). */
  marketDemand?: Partial<Record<MarketResource, number>>;
}

/** Carga em trânsito: completa para quem negocia; para os demais, só o veículo visível no mapa. */
/** Caravana interna (QG ↔ prefeitura): as próprias sempre; as inimigas só em trânsito e à vista. */
export interface CaravanView {
  id: number;
  owner: Slot;
  cityId: EntityId;
  state: CaravanState;
  x: number;
  y: number;
  heading: number;
  /** Só para o dono: destino atual, suprimentos por chegada e segundos até sair de novo. */
  to?: 'city' | 'hq';
  income?: number;
  waitSeconds?: number;
}

export interface ShipmentView {
  id: number;
  contractId: number;
  mode: TransportMode;
  state: ShipmentState;
  x: number;
  y: number;
  /** Direção do movimento (radianos no plano). */
  heading: number;
  seller: number;
  buyer: number;
  resource?: TradeResource;
  quantity?: number;
  /** Segundos restantes estimados (só para quem negocia). */
  etaSeconds?: number;
  /** Trajeto restante no mapa (só para quem negocia: inspeção de rota). */
  path?: { x: number; y: number }[];
  reason?: string | null;
}

/** Comércio do ponto de vista de um jogador. */
export interface TradeView {
  offers: TradeOffer[];
  contracts: TradeContract[];
  shipments: ShipmentView[];
  /** Cotação dos países da IA (venda/compra por unidade) e o quanto têm/querem agora. */
  quotes: { partner: number; resource: TradeResource; sell: number; buy: number; supply: number; demand: number }[];
  /** Motivo de cada modal estar indisponível para o jogador (null = disponível) e embarques simultâneos. */
  modes: Record<TransportMode, { blocker: string | null; limit: number }>;
  /** Estoque vendável (nos depósitos certos) e espaço livre por recurso. */
  sellable: Record<TradeResource, number>;
  free: Record<TradeResource, number>;
}

/** Força aérea e mísseis do ponto de vista de um jogador (Fase 7). */
export interface AirView {
  /** Aeronaves próprias. `progress`: produção ou manutenção (0..1); `gen`: modelo dos caças da base (desenho no pátio). */
  aircraft: { id: number; type: AircraftType; baseId: EntityId; state: AircraftState; progress: number; gen: number }[];
  /** Voos no mapa: os próprios e os inimigos visíveis. */
  /**
   * Voos em andamento. `gen`: modelo dos caças (1 = F-5EM, 2 = F-39 Gripen); `bx/by`: base de
   * origem; `tx/ty`: alvo (só nos voos próprios ou que atacam este jogador).
   */
  flights: { id: number; owner: Slot; kind: MissionKind; state: MissionState; x: number; y: number; heading: number; count: number; gen: number; plane: AircraftType; engaged?: boolean; bx: number; by: number; tx?: number; ty?: number }[];
  /** Missões próprias recentes, com o resultado registrado. */
  missions: { id: number; kind: MissionKind; state: MissionState; baseId: EntityId; targetType: string | null; fuel: number; count: number; result: MissionResult | null }[];
  silos: { id: EntityId; missiles: number; building: number; nuclear?: number; buildingNuclear?: boolean }[];
  /** Baterias do Domo de Ferro do jogador: interceptadores prontos, recarga do próximo (0..1) e espera dos lançadores (s). */
  domes: { id: EntityId; ready: number; max: number; reload: number; cooldown: number }[];
  /** Lançamentos próprios, e os inimigos em voo que miram este jogador ou estão à vista. */
  launches: { id: number; owner: Slot; siloId: EntityId; state: LaunchState; progress: number; x: number; y: number; fx: number; fy: number; tx: number; ty: number; targetOwner: Slot; gen: number; nuclear?: boolean }[];
  /** Áreas reveladas pelo reconhecimento próprio (névoa do cliente). */
  reveals: { x: number; y: number; r: number }[];
  /** Edifícios inimigos já descobertos (alvos válidos de ataque aéreo). */
  known: EntityId[];
  /** Cargueiros prontos (transporte aéreo comercial). */
  transports: number;
}

export interface Snapshot {
  tick: number;
  /** Opções do modo Sandbox (ausente nas partidas normais). */
  sandbox?: { instant: boolean; aiActive: boolean; reveal: boolean };
  trade?: TradeView;
  air?: AirView;
  units: UnitSnapshot[];
  buildings: BuildingSnapshot[];
  players: PlayerSnapshot[];
  events: SimEvent[];
  /** Vitórias alternativas em curso (domínio territorial, colapso político), de 0 a 1. */
  victory?: { kind: 'territory' | 'political'; slot: Slot; progress: number }[];
  /** Estradas construídas pelos jogadores (índices de célula), junto com o território. */
  roads?: number[];
  /** Caravanas internas que o observador vê. */
  caravans?: CaravanView[];
  /** Minas que o observador vê (as próprias e as inimigas detectadas). */
  mines?: { id: number; owner: Slot; x: number; y: number; clearing?: number }[];
  /** Território (um caractere por célula), enviado só quando muda (ver `territoryVersion`). */
  territory?: string;
  territoryVersion: number;
}

/** Memória de um jogador sobre edifícios inimigos já avistados (névoa de guerra). */
export class FogMemory {
  readonly known = new Map<EntityId, BuildingSnapshot>();
}

export interface Viewer {
  slot: Slot;
  memory: FogMemory;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const roundStock = (s: Stockpile): Stockpile => Object.fromEntries(RESOURCE_TYPES.map((r) => [r, r2(s[r])])) as Stockpile;

/**
 * Estado serializável. Sem `viewer`, inclui tudo (testes, depuração). Com `viewer`, aplica a névoa
 * de guerra: unidades inimigas só se visíveis; edifícios inimigos se visíveis ou lembrados;
 * recursos dos outros jogadores ocultos; eventos filtrados ao que o jogador poderia perceber.
 */
export function makeSnapshot(sim: Simulation, events: SimEvent[], viewer?: Viewer, includeTerritory = true): Snapshot {
  const units: UnitSnapshot[] = [];
  const buildings: BuildingSnapshot[] = [];
  const seenBuildings = new Set<EntityId>();
  const visible = viewer ? sim.visibilityOf(viewer.slot) : null;
  const w = sim.map.width;

  for (const e of sim.entities.values()) {
    if (viewer && !sim.canSee(viewer.slot, e)) continue;
    if (e.kind === 'unit') {
      units.push({
        id: e.id,
        type: e.type,
        owner: e.owner,
        x: r2(e.pos.x),
        y: r2(e.pos.y),
        facing: r2(e.facing),
        hp: Math.ceil(e.hp),
        maxHp: e.maxHp,
        activity: e.activity,
        order: e.order.kind,
        targetId: e.order.kind === 'attack' ? e.order.targetId : e.engageId,
        ...(e.attrition ? { attrition: true as const } : {}),
        ...(e.mods.length ? { mods: [...e.mods] } : {}),
        ...(e.rank ? { rank: e.rank } : {}),
        ...(e.era && e.era > 1 ? { era: e.era } : {}),
        ...(e.kills && (!viewer || e.owner === viewer.slot) ? { kills: e.kills } : {}),
        ...(UNITS[e.type].weapon.salvo && e.cooldown > 0 ? { reload: r2(Math.max(0, 1 - e.cooldown / Math.max(1, UNITS[e.type].weapon.cooldown * combineMods(e.mods).cooldownMul * TICK_RATE))) } : {}),
        ...(e.refit && (!viewer || e.owner === viewer.slot) ? { refit: { mod: e.refit.mod, progress: r2(1 - e.refit.remainingTicks / e.refit.totalTicks), facility: e.refit.facilityId } } : {}),
      });
    } else {
      const own = !viewer || e.owner === viewer.slot;
      const snap: BuildingSnapshot = {
        id: e.id,
        type: e.type,
        owner: e.owner,
        cx: e.cell.cx,
        cy: e.cell.cy,
        hp: Math.ceil(e.hp),
        maxHp: e.maxHp,
        progress: r2(e.progress),
        level: e.level,
        spec: e.spec,
        ...(sim.cityName(e) ? { city: sim.cityName(e) } : {}),
        ...(e.launch ? { launch: { phase: e.launch.phase, progress: r2(1 - e.launch.ticks / ((e.launch.phase === 'countdown' ? SPACE.countdownSeconds : SPACE.ascentSeconds) * TICK_RATE)) } } : {}),
        ...(own && e.research ? { research: { id: e.research.id, progress: r2(1 - e.research.remaining / e.research.total) } } : {}),
        ...(e.upgrade ? { upgrade: own ? { toLevel: e.upgrade.toLevel, progress: r2(e.upgrade.builtTicks / e.upgrade.totalTicks), spec: e.upgrade.spec } : { visible: true as const } } : {}),
        // fila e ponto de reunião de edifícios inimigos não são observáveis
        queue: own ? e.queue.map((q) => ({ unitType: q.unitType, progress: r2(1 - q.remainingTicks / q.totalTicks) })) : [],
        rally: own && e.rally ? { x: r2(e.rally.x), y: r2(e.rally.y) } : null,
        ...(own && e.claims.length ? { claims: e.claims } : {}),
        ...(own ? ownBuildingDetail(sim, e) : {}),
      };
      buildings.push(snap);
      seenBuildings.add(e.id);
      if (viewer && e.owner !== viewer.slot) viewer.memory.known.set(e.id, snap);
    }
  }

  if (viewer && visible) {
    for (const [id, mem] of viewer.memory.known) {
      if (seenBuildings.has(id)) continue;
      // área do edifício lembrado está à vista e ele não está lá: foi destruído
      const size = BUILDINGS[mem.type].size;
      let inView = false;
      for (let y = mem.cy; y < mem.cy + size && !inView; y++) for (let x = mem.cx; x < mem.cx + size; x++) if (visible[y * w + x] === 1) inView = true;
      // área à vista e edifício ausente: foi destruído (só se descobre ao observar o local)
      if (inView) viewer.memory.known.delete(id);
      else buildings.push({ ...mem, remembered: true });
    }
  }

  return {
    tick: sim.tick,
    ...(sim.sandbox ? { sandbox: { instant: sim.sandbox.instant, aiActive: sim.sandbox.aiActive, reveal: sim.sandbox.reveal } } : {}),
    units,
    buildings,
    players: sim.players.map((p) => {
      const mine = !viewer || p.slot === viewer.slot;
      return {
        slot: p.slot,
        resources: mine ? roundStock(p.resources) : null,
        income: mine ? roundStock(sim.incomePerSecond(p.slot)) : null,
        capacity: mine ? sim.capacity(p.slot) : null,
        population: mine ? sim.population(p.slot) : null,
        hungry: mine ? p.hungry : null,
        defeated: p.defeated,
        ...(mine ? { militaryResearch: [...(p.militaryResearch ?? [])] } : {}),
        ...(p.era && p.era > 1 ? { era: p.era } : {}),
        ...(mine && p.eraAdvance ? { eraAdvance: { to: p.eraAdvance.to, progress: r2(1 - p.eraAdvance.remainingTicks / Math.max(1, p.eraAdvance.totalTicks)) } } : {}),
        ...(mine && sim.eras ? { eras: true } : {}),
        ...(p.satellite ? { satellite: true as const } : {}),
        ...(mine && p.marketPressure && Object.keys(p.marketPressure).length ? { market: Object.fromEntries(Object.entries(p.marketPressure).map(([k, v]) => [k, Math.round(v)])) } : {}),
        ...(mine && p.marketDemand && Object.keys(p.marketDemand).length ? { marketDemand: Object.fromEntries(Object.entries(p.marketDemand).map(([k, v]) => [k, Math.round(v)])) } : {}),
        ...(mine && p.goods ? { goods: { fuel: Math.floor(p.goods.fuel), steel: Math.floor(p.goods.steel), cap: sim.goodsCap(p.slot) } } : {}),
      };
    }),
    events: viewer ? events.filter((ev) => eventVisible(sim, ev, viewer.slot)) : events,
    ...(viewer ? { trade: tradeView(sim, viewer.slot), air: airView(sim, viewer.slot) } : {}),
    territoryVersion: sim.territoryVersion,
    // fronteiras são conhecidas por todos (como no mapa político de Rise of Nations)
    ...(includeTerritory ? { territory: encodeTerritory(sim.territory) } : {}),
    ...(includeTerritory && sim.roads.length ? { roads: sim.roads.map((r) => r.i) } : {}),
    ...(() => {
      const v = sim.victoryPressure().map((x) => ({ ...x, progress: r2(x.progress) }));
      return v.length ? { victory: v } : {};
    })(),
    ...(() => {
      const list: CaravanView[] = [];
      for (const c of sim.caravans.caravans) {
        const own = !viewer || c.owner === viewer.slot;
        const p = sim.caravans.position(c);
        if (!own && !(c.state === 'moving' && sim.isVisibleTo(viewer!.slot, p))) continue;
        list.push({
          id: c.id,
          owner: c.owner,
          cityId: c.cityId,
          state: c.state,
          x: r2(p.x),
          y: r2(p.y),
          heading: r2(sim.caravans.heading(c)),
          ...(own ? { to: c.to, income: c.pathLength > 0 ? caravanIncome(c.pathLength) : c.lastIncome, ...(c.state !== 'moving' ? { waitSeconds: Math.ceil(c.timer / TICK_RATE) } : {}) } : {}),
        });
      }
      return list.length ? { caravans: list } : {};
    })(),
    ...(() => {
      const list = sim.mines.mines
        .filter((m) => !viewer || sim.mines.visibleTo(m, viewer.slot))
        .map((m) => ({ id: m.id, owner: m.owner, x: r2(m.pos.x), y: r2(m.pos.y), ...(m.clearing ? { clearing: r2(1 - m.clearing.ticks / (MINE.clearSeconds * TICK_RATE)) } : {}) }));
      return list.length ? { mines: list } : {};
    })(),
  };
}

function ownBuildingDetail(sim: Simulation, b: Parameters<Simulation['buildingRate']>[0]): Partial<BuildingSnapshot> {
  const def = BUILDINGS[b.type];
  const d = b.depositId !== null ? sim.deposits.deposits[b.depositId] : undefined;
  return {
    ...(sim.fx(b).workers > 0 ? { workers: b.workers, workerTarget: b.workerTarget } : {}),
    status: b.status,
    ...(def.gather ? { rate: r2(b.status === 'ok' ? sim.buildingRate(b) : 0) } : {}),
    ...((def.gather || def.process) && b.progress >= 1 ? { roadLinked: sim.roadLinked(b) } : {}),
    ...(b.type === 'oil_tank' ? { stored: r2(b.stored) } : {}),
    ...(d ? { deposit: { remaining: Math.max(0, Math.round(d.remaining)), initial: d.initial, size: d.size, maxSites: d.maxSites } } : {}),
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function tradeView(sim: Simulation, slot: Slot): TradeView {
  const t = sim.trade;
  const mine = (a: number, b: number) => a === slot || b === slot;
  const shipments: ShipmentView[] = [];
  for (const s of t.shipments) {
    if (s.state === 'delivered' || s.state === 'lost') continue;
    const p = t.position(s);
    const own = mine(s.seller, s.buyer);
    const onMap = s.state === 'moving' || s.state === 'loading' || s.state === 'waiting_capacity';
    if (!own && !(onMap && sim.isVisibleTo(slot, p))) continue;
    const ahead = s.path.find((_, i) => i > 0) ?? p;
    const next = t.position({ ...s, travelled: Math.min(s.pathLength, s.travelled + 0.5) });
    const heading = Math.atan2(next.y - p.y, next.x - p.x) || Math.atan2(ahead.y - p.y, ahead.x - p.x);
    shipments.push({
      id: s.id,
      contractId: s.contractId,
      mode: s.mode,
      state: s.state,
      x: r2(p.x),
      y: r2(p.y),
      heading: r2(heading),
      seller: s.seller,
      buyer: s.buyer,
      ...(own
        ? {
            resource: s.resource,
            quantity: r1(s.quantity),
            etaSeconds: Math.max(0, Math.round((s.etaTicks - (sim.tick - s.startTick)) / 20)),
            path: s.path.map((q) => ({ x: r2(q.x), y: r2(q.y) })),
            reason: s.reason,
          }
        : {}),
    });
  }
  const quotes: TradeView['quotes'] = [];
  for (const n of t.link?.npcs() ?? []) {
    if (!t.link?.knows(slot, n.id)) continue;
    for (const r of TRADE_RESOURCES) {
      const q = t.quote(n.id, slot, r);
      const pool = t.npcPool(n.id)[r];
      quotes.push({ partner: n.id, resource: r, sell: q.sell, buy: q.buy, supply: Math.floor(pool.supply), demand: Math.floor(pool.demand) });
    }
  }
  return {
    offers: t.offers.filter((o) => mine(o.from, o.to) && (o.status === 'pending' || sim.tick - o.createdTick < 20 * 120)),
    contracts: t.contracts.filter((c) => mine(c.seller, c.buyer)),
    shipments,
    quotes,
    modes: Object.fromEntries(TRANSPORT_MODES.map((m) => [m, { blocker: t.modeBlocker(slot, m), limit: t.convoyLimit(slot, m) }])) as TradeView['modes'],
    sellable: Object.fromEntries(TRADE_RESOURCES.map((r) => [r, Math.floor(t.sellable(slot, r))])) as Record<TradeResource, number>,
    free: Object.fromEntries(TRADE_RESOURCES.map((r) => [r, Math.floor(t.freeCapacity(slot, r))])) as Record<TradeResource, number>,
  };
}

export function airView(sim: Simulation, slot: Slot): AirView {
  const air = sim.air;
  const flights: AirView['flights'] = [];
  for (const m of air.missions) {
    if (m.state === 'done' || !m.aircraft.length) continue;
    const p = air.missionPos(m);
    if (m.owner !== slot && !sim.isVisibleTo(slot, p)) continue;
    const dir = m.state === 'outbound' ? 1 : -1;
    flights.push({
      id: m.id,
      owner: m.owner,
      kind: m.kind,
      state: m.state,
      x: r2(p.x),
      y: r2(p.y),
      heading: r2(Math.atan2((m.target.y - m.from.y) * dir, (m.target.x - m.from.x) * dir)),
      count: m.aircraft.length,
      gen: m.gen ?? 1,
      plane: air.aircraft.find((a) => a.id === m.aircraft[0])?.type ?? (m.kind === 'recon' ? 'recon' : 'fighter'),
      ...(air.engaged(m.id) ? { engaged: true } : {}),
      bx: r2(m.from.x),
      by: r2(m.from.y),
      ...(m.owner === slot || (m.targetId !== null && sim.entities.get(m.targetId)?.owner === slot) ? { tx: r2(m.target.x), ty: r2(m.target.y) } : {}),
    });
  }
  const live = (st: LaunchState) => st === 'preparing' || st === 'armed' || st === 'launching' || st === 'flight';
  const launches: AirView['launches'] = [];
  for (const l of air.launches) {
    const own = l.owner === slot;
    const p = air.launchPos(l);
    if (!own) {
      // o alvo recebe o alerta assim que o míssil sai; terceiros só o veem passar
      if (l.state !== 'flight' && l.state !== 'impact' && l.state !== 'intercepted') continue;
      if (l.targetOwner !== slot && !sim.isVisibleTo(slot, p)) continue;
    }
    if (!live(l.state) && sim.tick - (l.endTick ?? l.startTick) > TICK_RATE * 60) continue;
    const spec = missileSpec(l.gen ?? 1);
    const total = l.state === 'preparing' ? spec.prepareSeconds * TICK_RATE : l.state === 'launching' ? spec.launchSeconds * TICK_RATE : l.flightTicks;
    launches.push({
      id: l.id,
      owner: l.owner,
      siloId: l.siloId,
      state: l.state,
      progress: r2(l.state === 'preparing' || l.state === 'launching' || l.state === 'flight' ? 1 - l.timer / Math.max(1, total) : 1),
      x: r2(p.x),
      y: r2(p.y),
      fx: r2(l.from.x),
      fy: r2(l.from.y),
      tx: r2(l.target.x),
      ty: r2(l.target.y),
      targetOwner: l.targetOwner,
      gen: l.gen ?? 1,
      ...(l.nuclear ? { nuclear: true } : {}),
    });
  }
  return {
    aircraft: air.aircraft
      .filter((a) => a.owner === slot)
      .map((a) => {
        const total = a.state === 'building' ? AIRCRAFT[a.type].buildSeconds * TICK_RATE : AIRCRAFT[a.type].maintenanceSeconds * TICK_RATE;
        const base = sim.entities.get(a.baseId);
        const gen = base && 'level' in base ? buildingEffects('airbase', base.level).fighterGen : 1;
        return { id: a.id, type: a.type, baseId: a.baseId, state: a.state, progress: a.state === 'building' || a.state === 'maintenance' ? r2(1 - a.timer / Math.max(1, total)) : 1, gen };
      }),
    flights,
    missions: air.missions
      .filter((m) => m.owner === slot)
      .slice(-12)
      .map((m) => ({ id: m.id, kind: m.kind, state: m.state, baseId: m.baseId, targetType: m.targetType, fuel: m.fuel, count: m.aircraft.length, result: m.result })),
    silos: sim.buildings
      .filter((b) => b.owner === slot && b.type === 'missile_silo')
      .map((b) => {
        const st = air.silos[b.id];
        const secs = st?.buildingNuclear ? NUCLEAR.buildSeconds : MISSILE.buildSeconds;
        return {
          id: b.id,
          missiles: st?.missiles ?? 0,
          building: st && st.building > 0 ? r2(1 - st.building / (secs * TICK_RATE)) : 0,
          ...(st?.nuclear ? { nuclear: st.nuclear } : {}),
          ...(st?.buildingNuclear && st.building > 0 ? { buildingNuclear: true } : {}),
        };
      }),
    domes: sim.buildings
      .filter((b) => b.owner === slot && b.type === 'iron_dome' && b.progress >= 1)
      .map((b) => {
        const st = air.domes[b.id] ?? { ready: IRON_DOME.magazine, reload: 0, cooldown: 0 };
        const full = IRON_DOME.reloadSeconds * TICK_RATE;
        return { id: b.id, ready: st.ready, max: IRON_DOME.magazine, reload: st.ready < IRON_DOME.magazine ? r2(1 - st.reload / full) : 1, cooldown: r2(st.cooldown / TICK_RATE) };
      }),
    launches,
    known: sim.buildings.filter((b) => b.owner !== slot && air.isKnown(slot, b.id)).map((b) => b.id),
    reveals: air.reveals.filter((r) => r.owner === slot).map((r) => ({ x: r2(r.pos.x), y: r2(r.pos.y), r: r.radius })),
    transports: air.transports(slot),
  };
}

function eventVisible(sim: Simulation, e: SimEvent, slot: Slot): boolean {
  switch (e.type) {
    case 'trade_offer':
    case 'trade_reply':
      return e.from === slot || e.to === slot;
    case 'contract_update':
    case 'shipment_delivered':
      return e.seller === slot || e.buyer === slot;
    case 'shipment_lost':
      return e.seller === slot || e.buyer === slot || sim.isVisibleTo(slot, e.pos);
    case 'shot':
      return sim.isVisibleTo(slot, e.from) || sim.isVisibleTo(slot, e.to);
    case 'salvo_impact':
      return e.owner === slot || sim.isVisibleTo(slot, e.pos);
    case 'salvo_intercepted':
      return e.owner === slot || sim.isVisibleTo(slot, e.from) || sim.isVisibleTo(slot, e.at);
    case 'destroyed':
      return e.owner === slot || e.killerOwner === slot || sim.isVisibleTo(slot, e.pos);
    case 'construction_started':
    case 'construction_completed':
    case 'unit_produced':
    case 'upgrade_completed':
      return e.owner === slot || sim.isVisibleTo(slot, e.pos);
    case 'upgrade_started':
    case 'upgrade_cancelled':
    case 'modernize_started':
    case 'unit_modernized':
    case 'modernize_cancelled':
      return e.owner === slot;
    case 'under_attack':
    case 'military_research_completed':
    case 'citizen_trained':
    case 'recruit_trained':
    case 'production_halted':
    case 'deposit_depleted':
    case 'storage_lost':
    case 'shortage':
    case 'attrition':
      return e.owner === slot;
    case 'air_mission':
      return e.owner === slot;
    case 'aircraft_lost':
      return e.owner === slot || sim.isVisibleTo(slot, e.pos);
    case 'air_strike':
      return e.owner === slot || e.victim === slot || sim.isVisibleTo(slot, e.pos);
    case 'city_captured':
      return e.owner === slot || e.victim === slot || sim.isVisibleTo(slot, e.pos);
    case 'caravan_lost':
      return e.owner === slot || sim.isVisibleTo(slot, e.pos);
    case 'dogfight':
      return e.owner === slot || e.victim === slot || sim.isVisibleTo(slot, e.from) || sim.isVisibleTo(slot, e.to);
    case 'missile':
      // o dono acompanha cada etapa; o país-alvo é alertado no lançamento e no impacto
      return (
        e.owner === slot ||
        (e.targetOwner === slot && (e.state === 'flight' || e.state === 'impact' || e.state === 'intercepted')) ||
        ((e.state === 'impact' || e.state === 'intercepted') && sim.isVisibleTo(slot, e.target))
      );
    case 'dome':
      // a bateria e quem lançou o míssil acompanham; os outros, se virem a bateria ou o alvo
      return e.owner === slot || e.attacker === slot || sim.isVisibleTo(slot, e.pos) || sim.isVisibleTo(slot, e.target);
    case 'unit_promoted':
      return e.owner === slot;
    case 'era':
      return e.owner === slot || e.state === 'completed';
    case 'space':
      // o lançamento é anunciado a todos os jogadores
      return true;
    case 'mine':
      return e.owner === slot || e.by === slot || (e.state === 'blast' && sim.isVisibleTo(slot, e.pos));
    case 'victory_progress':
      // vitórias alternativas são anunciadas a todos
      return true;
    case 'border_incident':
      return e.aggressor === slot || e.victim === slot;
    case 'player_defeated':
      return true;
  }
}
