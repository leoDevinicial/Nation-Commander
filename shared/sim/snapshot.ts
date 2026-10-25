import { BUILDINGS, RESOURCE_TYPES, type BuildingType, type DepositSize, type ProducibleType, type Stockpile, type UnitType } from './config.ts';
import type { Population, Simulation } from './Simulation.ts';
import { encodeTerritory } from './territory.ts';
import type { BuildingStatus, EntityId, SimEvent, Slot, UnitActivity, Vec2 } from './types.ts';

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
}

export interface BuildingSnapshot {
  id: EntityId;
  type: BuildingType;
  owner: Slot;
  cx: number;
  cy: number;
  hp: number;
  progress: number;
  queue: { unitType: ProducibleType; progress: number }[];
  rally: Vec2 | null;
  /** Células de recurso reivindicadas (só para edifícios próprios de coleta). */
  claims?: number[];
  /** Só para edifícios próprios: trabalho, situação, estoque e depósito explorado. */
  workers?: number;
  workerTarget?: number;
  status?: BuildingStatus;
  /** Produção atual por segundo (edifícios de coleta). */
  rate?: number;
  stored?: number;
  deposit?: { remaining: number; initial: number; size: DepositSize; maxSites: number };
  /** Edifício inimigo fora de visão: último estado conhecido (pode estar desatualizado). */
  remembered?: boolean;
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
}

export interface Snapshot {
  tick: number;
  units: UnitSnapshot[];
  buildings: BuildingSnapshot[];
  players: PlayerSnapshot[];
  events: SimEvent[];
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
        progress: r2(e.progress),
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
      };
    }),
    events: viewer ? events.filter((ev) => eventVisible(sim, ev, viewer.slot)) : events,
    territoryVersion: sim.territoryVersion,
    // fronteiras são conhecidas por todos (como no mapa político de Rise of Nations)
    ...(includeTerritory ? { territory: encodeTerritory(sim.territory) } : {}),
  };
}

function ownBuildingDetail(sim: Simulation, b: Parameters<Simulation['buildingRate']>[0]): Partial<BuildingSnapshot> {
  const def = BUILDINGS[b.type];
  const d = b.depositId !== null ? sim.deposits.deposits[b.depositId] : undefined;
  return {
    ...(def.workers > 0 ? { workers: b.workers, workerTarget: b.workerTarget } : {}),
    status: b.status,
    ...(def.gather ? { rate: r2(b.status === 'ok' ? sim.buildingRate(b) : 0) } : {}),
    ...(b.type === 'oil_tank' ? { stored: r2(b.stored) } : {}),
    ...(d ? { deposit: { remaining: Math.max(0, Math.round(d.remaining)), initial: d.initial, size: d.size, maxSites: d.maxSites } } : {}),
  };
}

function eventVisible(sim: Simulation, e: SimEvent, slot: Slot): boolean {
  switch (e.type) {
    case 'shot':
      return sim.isVisibleTo(slot, e.from) || sim.isVisibleTo(slot, e.to);
    case 'destroyed':
      return e.owner === slot || e.killerOwner === slot || sim.isVisibleTo(slot, e.pos);
    case 'construction_started':
    case 'construction_completed':
    case 'unit_produced':
      return e.owner === slot || sim.isVisibleTo(slot, e.pos);
    case 'under_attack':
    case 'citizen_trained':
    case 'production_halted':
    case 'deposit_depleted':
    case 'storage_lost':
    case 'shortage':
    case 'attrition':
      return e.owner === slot;
    case 'player_defeated':
      return true;
  }
}
