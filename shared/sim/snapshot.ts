import type { BuildingType, UnitType } from './config.ts';
import type { Simulation } from './Simulation.ts';
import type { EntityId, SimEvent, Slot, UnitActivity, Vec2 } from './types.ts';

export interface UnitSnapshot {
  id: EntityId;
  type: UnitType;
  owner: Slot;
  x: number;
  y: number;
  facing: number;
  hp: number;
  activity: UnitActivity;
  order: 'idle' | 'move' | 'attackMove' | 'attack';
  targetId: EntityId | null;
}

export interface BuildingSnapshot {
  id: EntityId;
  type: BuildingType;
  owner: Slot;
  cx: number;
  cy: number;
  hp: number;
  progress: number;
  queue: { unitType: UnitType; progress: number }[];
  rally: Vec2 | null;
}

export interface PlayerSnapshot {
  slot: Slot;
  resources: number;
  income: number;
  supply: number;
  defeated: boolean;
}

export interface Snapshot {
  tick: number;
  units: UnitSnapshot[];
  buildings: BuildingSnapshot[];
  players: PlayerSnapshot[];
  events: SimEvent[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Estado público serializável. Nunca inclui objetos internos (caminhos, grade etc.). */
export function makeSnapshot(sim: Simulation, events: SimEvent[]): Snapshot {
  const units: UnitSnapshot[] = [];
  const buildings: BuildingSnapshot[] = [];
  for (const e of sim.entities.values()) {
    if (e.kind === 'unit') {
      units.push({
        id: e.id,
        type: e.type,
        owner: e.owner,
        x: r2(e.pos.x),
        y: r2(e.pos.y),
        facing: r2(e.facing),
        hp: Math.ceil(e.hp),
        activity: e.activity,
        order: e.order.kind,
        targetId: e.order.kind === 'attack' ? e.order.targetId : e.engageId,
      });
    } else {
      buildings.push({
        id: e.id,
        type: e.type,
        owner: e.owner,
        cx: e.cell.cx,
        cy: e.cell.cy,
        hp: Math.ceil(e.hp),
        progress: r2(e.progress),
        queue: e.queue.map((q) => ({ unitType: q.unitType, progress: r2(1 - q.remainingTicks / q.totalTicks) })),
        rally: e.rally ? { x: r2(e.rally.x), y: r2(e.rally.y) } : null,
      });
    }
  }
  return {
    tick: sim.tick,
    units,
    buildings,
    players: sim.players.map((p) => ({
      slot: p.slot,
      resources: p.resources,
      income: sim.incomePerSecond(p.slot),
      supply: sim.supplyUsed(p.slot),
      defeated: p.defeated,
    })),
    events,
  };
}
