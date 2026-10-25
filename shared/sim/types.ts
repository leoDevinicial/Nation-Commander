import type { BuildingType, Terrain, UnitType } from './config.ts';

export type EntityId = number;
/** Índice do jogador na partida (0..n-1). */
export type Slot = number;

/** Posição em unidades de mundo no plano do mapa. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Cell {
  cx: number;
  cy: number;
}

export type UnitOrder =
  | { kind: 'idle' }
  | { kind: 'move'; target: Vec2 }
  | { kind: 'attackMove'; target: Vec2 }
  | { kind: 'attack'; targetId: EntityId };

export type UnitActivity = 'idle' | 'moving' | 'chasing' | 'attacking';

export interface Unit {
  kind: 'unit';
  id: EntityId;
  type: UnitType;
  owner: Slot;
  pos: Vec2;
  /** Ângulo em radianos (0 = +x). */
  facing: number;
  hp: number;
  order: UnitOrder;
  /** Alvo adquirido automaticamente (ordem idle/attackMove). */
  engageId: EntityId | null;
  path: Vec2[];
  pathIndex: number;
  /** Ticks restantes até poder disparar de novo. */
  cooldown: number;
  activity: UnitActivity;
  stuckTicks: number;
  replans: number;
  lastProgressDist: number;
  repathTimer: number;
}

export interface ProductionItem {
  unitType: UnitType;
  remainingTicks: number;
  totalTicks: number;
}

export interface Building {
  kind: 'building';
  id: EntityId;
  type: BuildingType;
  owner: Slot;
  /** Célula do canto superior esquerdo. */
  cell: Cell;
  /** Centro em unidades de mundo. */
  pos: Vec2;
  hp: number;
  /** 0..1; 1 = concluído. Derivado de `builtTicks` para evitar erro acumulado. */
  progress: number;
  builtTicks: number;
  queue: ProductionItem[];
  rally: Vec2 | null;
  cooldown: number;
  engageId: EntityId | null;
}

export type Entity = Unit | Building;

export interface PlayerStats {
  unitsProduced: number;
  unitsLost: number;
  unitsKilled: number;
  structuresBuilt: number;
  structuresLost: number;
  structuresDestroyed: number;
  resourcesGathered: number;
  resourcesSpent: number;
  damageDealt: number;
}

export interface PlayerState {
  slot: Slot;
  resources: number;
  /** Acumulador fracionário de renda para manter inteiros em `resources`. */
  incomeRemainder: number;
  defeated: boolean;
  stats: PlayerStats;
}

export interface MapData {
  width: number;
  height: number;
  cellSize: number;
  seed: number;
  terrain: Terrain[];
  resourceNodes: Cell[];
  spawns: Cell[];
}

export type SimEvent =
  | { type: 'shot'; tick: number; attackerId: EntityId; targetId: EntityId; from: Vec2; to: Vec2; damage: number }
  | { type: 'destroyed'; tick: number; id: EntityId; owner: Slot; entity: 'unit' | 'building'; entityType: string; pos: Vec2; killerOwner: Slot | null }
  | { type: 'construction_started'; tick: number; id: EntityId; owner: Slot; buildingType: BuildingType; pos: Vec2 }
  | { type: 'construction_completed'; tick: number; id: EntityId; owner: Slot; buildingType: BuildingType; pos: Vec2 }
  | { type: 'unit_produced'; tick: number; id: EntityId; owner: Slot; unitType: UnitType; pos: Vec2 }
  | { type: 'under_attack'; tick: number; id: EntityId; owner: Slot; pos: Vec2 }
  | { type: 'player_defeated'; tick: number; slot: Slot };
