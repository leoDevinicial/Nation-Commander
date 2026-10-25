/**
 * Tabelas de regras da operação tática. Todos os valores são parâmetros de jogo
 * (game_parameter), não dados factuais. Ajustar aqui, nunca espalhados pelo código.
 */

export const TICK_RATE = 20; // atualizações de simulação por segundo
export const TICK_SECONDS = 1 / TICK_RATE;

export const MAP_SIZE = 64; // células por lado
export const CELL_SIZE = 2; // unidades de mundo por célula

export const STARTING_RESOURCES = 400;
export const UNIT_CAP = 40;

export enum Terrain {
  Plains = 0,
  Road = 1,
  Forest = 2,
  Mud = 3,
  Water = 4,
  Rock = 5,
}

export interface TerrainDef {
  label: string;
  passable: boolean;
  /** Custo usado pelo A*. */
  pathCost: number;
  /** Multiplicador de velocidade aplicado ao atravessar a célula. */
  speedMultiplier: number;
  buildable: boolean;
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  [Terrain.Plains]: { label: 'Planície', passable: true, pathCost: 1, speedMultiplier: 1, buildable: true },
  [Terrain.Road]: { label: 'Estrada', passable: true, pathCost: 0.7, speedMultiplier: 1.3, buildable: true },
  [Terrain.Forest]: { label: 'Floresta', passable: true, pathCost: 2, speedMultiplier: 0.6, buildable: false },
  [Terrain.Mud]: { label: 'Lama', passable: true, pathCost: 2.5, speedMultiplier: 0.5, buildable: false },
  [Terrain.Water]: { label: 'Água', passable: false, pathCost: Infinity, speedMultiplier: 0, buildable: false },
  [Terrain.Rock]: { label: 'Rocha', passable: false, pathCost: Infinity, speedMultiplier: 0, buildable: false },
};

export type UnitType = 'infantry' | 'tank';
export type BuildingType = 'hq' | 'barracks' | 'factory' | 'extractor';

export interface WeaponDef {
  damage: number;
  /** Alcance em unidades de mundo, medido até a borda do alvo. */
  range: number;
  /** Segundos entre disparos. */
  cooldown: number;
}

export interface UnitDef {
  label: string;
  cost: number;
  buildSeconds: number;
  maxHp: number;
  speed: number; // unidades de mundo por segundo
  radius: number;
  sight: number;
  weapon: WeaponDef;
  producedBy: BuildingType;
  description: string;
}

export const UNITS: Record<UnitType, UnitDef> = {
  infantry: {
    label: 'Infantaria',
    cost: 50,
    buildSeconds: 6,
    maxHp: 70,
    speed: 3.2,
    radius: 0.5,
    sight: 11,
    weapon: { damage: 9, range: 6, cooldown: 1 },
    producedBy: 'barracks',
    description: 'Barata e rápida de treinar. Eficaz em grupo.',
  },
  tank: {
    label: 'Blindado',
    cost: 150,
    buildSeconds: 12,
    maxHp: 260,
    speed: 4.4,
    radius: 0.9,
    sight: 12,
    weapon: { damage: 30, range: 8, cooldown: 2.2 },
    producedBy: 'factory',
    description: 'Resistente e de longo alcance. Lento na floresta e na lama.',
  },
};

export interface BuildingDef {
  label: string;
  cost: number;
  buildSeconds: number;
  maxHp: number;
  /** Lado em células (edifícios são quadrados). */
  size: number;
  /** Recursos por segundo gerados quando concluído. */
  income: number;
  sight: number;
  weapon?: WeaponDef;
  /** Raio (em células) em que o jogador pode construir ao redor deste edifício concluído. */
  buildRadius: number;
  buildable: boolean;
  description: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: {
    label: 'Quartel-General',
    cost: 0,
    buildSeconds: 0,
    maxHp: 1500,
    size: 3,
    income: 3,
    sight: 14,
    weapon: { damage: 14, range: 9, cooldown: 1.5 },
    buildRadius: 14,
    buildable: false,
    description: 'Estrutura principal. Se for destruída, a operação está perdida.',
  },
  barracks: {
    label: 'Caserna',
    cost: 150,
    buildSeconds: 15,
    maxHp: 600,
    size: 2,
    income: 0,
    sight: 9,
    buildRadius: 8,
    buildable: true,
    description: 'Treina infantaria.',
  },
  factory: {
    label: 'Fábrica',
    cost: 300,
    buildSeconds: 25,
    maxHp: 900,
    size: 2,
    income: 0,
    sight: 9,
    buildRadius: 8,
    buildable: true,
    description: 'Produz blindados.',
  },
  extractor: {
    label: 'Extrator',
    cost: 100,
    buildSeconds: 12,
    maxHp: 400,
    size: 2,
    income: 4,
    sight: 8,
    buildRadius: 0,
    buildable: true,
    description: 'Construído sobre uma jazida. Gera suprimentos continuamente.',
  },
};

export const PRODUCTION_QUEUE_LIMIT = 5;
/** Ticks sem progresso antes de replanejar o caminho. */
export const STUCK_TICKS = 20;
export const MAX_REPLANS = 3;
/** Intervalo (ticks) para recalcular caminho de perseguição. */
export const CHASE_REPATH_TICKS = 10;
