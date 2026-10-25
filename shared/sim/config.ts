/**
 * Tabelas de regras da operação tática. Todos os valores são parâmetros de jogo
 * (game_parameter), não dados factuais. Ajustar aqui, nunca espalhados pelo código.
 */

export const TICK_RATE = 20; // atualizações de simulação por segundo
export const TICK_SECONDS = 1 / TICK_RATE;

export const MAP_SIZE = 64; // células por lado
export const CELL_SIZE = 2; // unidades de mundo por célula

export const UNIT_CAP = 40;

// ------------------------------------------------------------------ recursos

export type ResourceType = 'supplies' | 'food' | 'wood' | 'stone' | 'oil';
export const RESOURCE_TYPES: readonly ResourceType[] = ['supplies', 'food', 'wood', 'stone', 'oil'];

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  supplies: 'Suprimentos',
  food: 'Comida',
  wood: 'Madeira',
  stone: 'Pedra',
  oil: 'Petróleo',
};

export type Cost = Partial<Record<ResourceType, number>>;
export type Stockpile = Record<ResourceType, number>;

export const STARTING_RESOURCES: Stockpile = { supplies: 300, food: 150, wood: 250, stone: 100, oil: 50 };

export function emptyStockpile(): Stockpile {
  return { supplies: 0, food: 0, wood: 0, stone: 0, oil: 0 };
}

export function canAfford(have: Stockpile, cost: Cost): boolean {
  return RESOURCE_TYPES.every((r) => have[r] >= (cost[r] ?? 0));
}

export function costTotal(cost: Cost): number {
  return RESOURCE_TYPES.reduce((s, r) => s + (cost[r] ?? 0), 0);
}

// ------------------------------------------------------------------ terreno

export enum Terrain {
  Plains = 0,
  Road = 1,
  Forest = 2,
  Mud = 3,
  Water = 4,
  Rock = 5,
  /** Solo fértil: passável, construível, explorado por fazendas. */
  Fertile = 6,
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
  [Terrain.Fertile]: { label: 'Solo fértil', passable: true, pathCost: 1, speedMultiplier: 1, buildable: true },
};

// ------------------------------------------------------------------ unidades

export type UnitType = 'infantry' | 'apc' | 'tank' | 'artillery';
export type BuildingType = 'hq' | 'barracks' | 'factory' | 'farm' | 'sawmill' | 'quarry' | 'oil_well' | 'tower';

export interface WeaponDef {
  damage: number;
  /** Alcance em unidades de mundo, medido até a borda do alvo. */
  range: number;
  /** Segundos entre disparos. */
  cooldown: number;
}

export interface UnitDef {
  label: string;
  cost: Cost;
  buildSeconds: number;
  maxHp: number;
  speed: number; // unidades de mundo por segundo
  radius: number;
  sight: number;
  weapon: WeaponDef;
  producedBy: BuildingType;
  description: string;
  hotkey: string;
}

export const UNITS: Record<UnitType, UnitDef> = {
  infantry: {
    label: 'Infantaria',
    cost: { food: 55 },
    buildSeconds: 6,
    maxHp: 70,
    speed: 3.2,
    radius: 0.5,
    sight: 11,
    weapon: { damage: 9, range: 6, cooldown: 1 },
    producedBy: 'barracks',
    description: 'Barata e rápida de treinar. Eficaz em grupo.',
    hotkey: 'I',
  },
  apc: {
    label: 'Veículo Blindado',
    cost: { oil: 50, supplies: 30 },
    buildSeconds: 8,
    maxHp: 160,
    speed: 6,
    radius: 0.8,
    sight: 14,
    weapon: { damage: 12, range: 6.5, cooldown: 0.8 },
    producedBy: 'factory',
    description: 'Rápido e com visão ampla: ideal para reconhecimento e para dar visão à artilharia.',
    hotkey: 'V',
  },
  tank: {
    label: 'Tanque',
    cost: { oil: 90, supplies: 50 },
    buildSeconds: 12,
    maxHp: 260,
    speed: 4.4,
    radius: 0.9,
    sight: 12,
    weapon: { damage: 30, range: 8, cooldown: 2.2 },
    producedBy: 'factory',
    description: 'Resistente e de bom alcance. Lento na floresta e na lama.',
    hotkey: 'T',
  },
  artillery: {
    label: 'Artilharia',
    cost: { oil: 60, stone: 50, supplies: 60 },
    buildSeconds: 14,
    maxHp: 120,
    speed: 2.6,
    radius: 0.9,
    sight: 9,
    weapon: { damage: 55, range: 16, cooldown: 4 },
    producedBy: 'factory',
    description: 'Alcance muito longo, mas frágil e com pouca visão: precisa de outras unidades para enxergar alvos.',
    hotkey: 'R',
  },
};

// ------------------------------------------------------------------ edifícios

/** Coleta de recurso por edifícios posicionados perto da fonte (estilo Rise of Nations). */
export interface GatherDef {
  resource: ResourceType;
  /** Terreno explorado (null = jazida de petróleo sob o edifício). */
  terrain: Terrain | null;
  /** Distância máxima (em células, a partir da borda do edifício) das células exploradas. */
  radius: number;
  /** Máximo de células reivindicadas por edifício. */
  maxCells: number;
  /** Mínimo de células livres para poder construir. */
  minCells: number;
  /** Renda por célula reivindicada (ou total, para petróleo), por segundo. */
  ratePerCell: number;
}

export interface BuildingDef {
  label: string;
  cost: Cost;
  buildSeconds: number;
  maxHp: number;
  /** Lado em células (edifícios são quadrados). */
  size: number;
  /** Renda fixa por segundo quando concluído. */
  income: Cost;
  gather?: GatherDef;
  sight: number;
  weapon?: WeaponDef;
  /** Raio (em células) em que o jogador pode construir ao redor deste edifício concluído. */
  buildRadius: number;
  buildable: boolean;
  description: string;
  hotkey?: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: {
    label: 'Centro de Comando',
    cost: {},
    buildSeconds: 0,
    maxHp: 1500,
    size: 3,
    income: { supplies: 3 },
    sight: 14,
    weapon: { damage: 14, range: 9, cooldown: 1.5 },
    buildRadius: 14,
    buildable: false,
    description: 'Estrutura principal. Se for destruída, a operação está perdida.',
  },
  barracks: {
    label: 'Base Militar',
    cost: { wood: 100, stone: 30 },
    buildSeconds: 15,
    maxHp: 600,
    size: 2,
    income: {},
    sight: 9,
    buildRadius: 8,
    buildable: true,
    description: 'Treina infantaria.',
    hotkey: 'B',
  },
  factory: {
    label: 'Fábrica de Veículos',
    cost: { wood: 120, stone: 150, supplies: 100 },
    buildSeconds: 25,
    maxHp: 900,
    size: 2,
    income: {},
    sight: 9,
    buildRadius: 8,
    buildable: true,
    description: 'Produz veículos blindados, tanques e artilharia.',
    hotkey: 'N',
  },
  farm: {
    label: 'Fazenda',
    cost: { wood: 60 },
    buildSeconds: 10,
    maxHp: 300,
    size: 2,
    income: {},
    gather: { resource: 'food', terrain: Terrain.Fertile, radius: 3, maxCells: 8, minCells: 3, ratePerCell: 0.5 },
    sight: 7,
    buildRadius: 6,
    buildable: true,
    description: 'Cultiva o solo fértil ao redor. Rende mais quanto mais solo fértil livre houver por perto.',
    hotkey: 'C',
  },
  sawmill: {
    label: 'Serraria',
    cost: { supplies: 60 },
    buildSeconds: 10,
    maxHp: 350,
    size: 2,
    income: {},
    gather: { resource: 'wood', terrain: Terrain.Forest, radius: 4, maxCells: 10, minCells: 3, ratePerCell: 0.25 },
    sight: 7,
    buildRadius: 6,
    buildable: true,
    description: 'Explora a floresta próxima. Rende mais quanto mais árvores livres houver por perto.',
    hotkey: 'M',
  },
  quarry: {
    label: 'Pedreira',
    cost: { wood: 80 },
    buildSeconds: 12,
    maxHp: 400,
    size: 2,
    income: {},
    gather: { resource: 'stone', terrain: Terrain.Rock, radius: 3, maxCells: 8, minCells: 2, ratePerCell: 0.35 },
    sight: 7,
    buildRadius: 6,
    buildable: true,
    description: 'Extrai pedra dos afloramentos rochosos adjacentes.',
    hotkey: 'P',
  },
  oil_well: {
    label: 'Poço de Petróleo',
    cost: { wood: 80, stone: 60 },
    buildSeconds: 14,
    maxHp: 450,
    size: 2,
    income: {},
    gather: { resource: 'oil', terrain: null, radius: 0, maxCells: 1, minCells: 1, ratePerCell: 3 },
    sight: 7,
    buildRadius: 0,
    buildable: true,
    description: 'Construído sobre uma jazida de petróleo. Pode ficar longe da base.',
    hotkey: 'O',
  },
  tower: {
    label: 'Torre de Vigilância',
    cost: { stone: 100, wood: 40 },
    buildSeconds: 12,
    maxHp: 500,
    size: 1,
    income: {},
    sight: 15,
    weapon: { damage: 10, range: 10, cooldown: 1.2 },
    buildRadius: 4,
    buildable: true,
    description: 'Amplia a visão através da névoa de guerra e defende a área.',
    hotkey: 'K',
  },
};

export const PRODUCTION_QUEUE_LIMIT = 5;
/** Ticks sem progresso antes de replanejar o caminho. */
export const STUCK_TICKS = 20;
export const MAX_REPLANS = 3;
/** Intervalo (ticks) para recalcular caminho de perseguição. */
export const CHASE_REPATH_TICKS = 10;
