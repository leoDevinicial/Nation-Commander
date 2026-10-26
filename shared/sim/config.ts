/**
 * Tabelas de regras da operação tática. Todos os valores são parâmetros de jogo
 * (game_parameter), não dados factuais. Ajustar aqui, nunca espalhados pelo código.
 */

export const TICK_RATE = 20; // atualizações de simulação por segundo
/**
 * Período de preparo (tempo de jogo): os governos de IA não declaram guerra nem lançam ofensivas,
 * e mantêm só uma guarnição pequena, priorizando a economia. Pensado para partidas de 30–60 min:
 * dá tempo de montar a base antes da primeira onda. O jogador pode declarar guerra antes, se quiser.
 */
export const PREPARATION_TICKS = TICK_RATE * 60 * 12;
export const TICK_SECONDS = 1 / TICK_RATE;

export const MAP_SIZE = 64; // células por lado
export const CELL_SIZE = 2; // unidades de mundo por célula

// ------------------------------------------------------------------ população

/** Teto absoluto de população por nação (cidadãos + efetivo militar), em qualquer situação. */
export const POP_ABSOLUTE_CAP = 200;
/** Cidadãos no início da partida (além das unidades iniciais). */
export const STARTING_CITIZENS = 8;
/** Formação de um cidadão civil no Centro de Comando: trabalha nas construções (fazendas, poços, serrarias…). */
export const CITIZEN = { label: 'Cidadão', cost: { food: 40 } as Cost, buildSeconds: 6, hotkey: 'Z' };
/**
 * Recruta: cidadão alistado na base militar (quartel). Fica na reserva e é a tripulação de toda
 * unidade militar — infantaria, blindados, tanques e artilharia. Ocupa moradia como qualquer
 * habitante e não trabalha nas construções civis.
 */
export const RECRUIT = { label: 'Recruta', cost: { food: 40, supplies: 25 } as Cost, buildSeconds: 8, hotkey: 'Z' };
/** Recrutas na reserva no início da partida (o quartel ainda precisa ser construído). */
export const STARTING_RECRUITS = 0;
/** Consumo de comida por habitante (cidadão ou militar), por segundo. */
export const FOOD_UPKEEP_PER_POP = 0.02;
/** Eficiência de produção sem comida em estoque (fome). */
export const HUNGER_EFFICIENCY = 0.5;

// ------------------------------------------------------------------ recursos

export type ResourceType = 'supplies' | 'food' | 'wood' | 'stone' | 'iron' | 'oil';
export const RESOURCE_TYPES: readonly ResourceType[] = ['supplies', 'food', 'wood', 'stone', 'iron', 'oil'];

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  supplies: 'Suprimentos',
  food: 'Comida',
  wood: 'Madeira',
  stone: 'Pedra',
  iron: 'Ferro',
  oil: 'Petróleo',
};

/**
 * Onde cada recurso é guardado (regra explícita, capacidade separada por recurso):
 * suprimentos no Centro de Comando; comida em silos; madeira, pedra e ferro em armazéns;
 * petróleo em tanques (cada tanque com estoque próprio) e na pequena reserva do QG.
 */
export const STORAGE_LABEL: Record<ResourceType, string> = {
  supplies: 'Centro de Comando',
  food: 'Silos',
  wood: 'Armazéns de Recursos',
  stone: 'Armazéns de Recursos',
  iron: 'Armazéns de Recursos',
  oil: 'Tanques de Petróleo',
};

export type Cost = Partial<Record<ResourceType, number>>;
export type Stockpile = Record<ResourceType, number>;

export const STARTING_RESOURCES: Stockpile = { supplies: 300, food: 150, wood: 250, stone: 120, iron: 60, oil: 50 };

export function emptyStockpile(): Stockpile {
  return { supplies: 0, food: 0, wood: 0, stone: 0, iron: 0, oil: 0 };
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
  /** Veio de minério de ferro dentro de formações rochosas (montanhas); explorado por minas. */
  Ore = 7,
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
  [Terrain.Ore]: { label: 'Minério de ferro', passable: false, pathCost: Infinity, speedMultiplier: 0, buildable: false },
};

// ------------------------------------------------------------------ depósitos naturais

export type DepositSize = 'small' | 'medium' | 'large';
export const DEPOSIT_SIZE_LABELS: Record<DepositSize, string> = { small: 'pequeno', medium: 'médio', large: 'grande' };

/**
 * Depósitos são agrupamentos contínuos de um terreno de recurso. O tamanho (em células) define a
 * classe e quantas instalações o depósito suporta; a quantidade extraível é finita.
 * Inspirado em RTS clássicos: floresta pequena/média/grande = 1/2/3 serrarias. Rocha e minério
 * rendem menos instalações por serem fontes mais concentradas.
 */
export interface DepositRule {
  /** Células mínimas para ser médio / grande. */
  mediumFrom: number;
  largeFrom: number;
  maxSites: Record<DepositSize, number>;
  /** Quantidade extraível por célula do depósito. */
  amountPerCell: number;
}

export const DEPOSIT_RULES: Partial<Record<Terrain, DepositRule>> = {
  [Terrain.Forest]: { mediumFrom: 20, largeFrom: 50, maxSites: { small: 1, medium: 2, large: 3 }, amountPerCell: 80 },
  [Terrain.Rock]: { mediumFrom: 12, largeFrom: 36, maxSites: { small: 1, medium: 2, large: 2 }, amountPerCell: 120 },
  [Terrain.Ore]: { mediumFrom: 6, largeFrom: 16, maxSites: { small: 1, medium: 1, large: 2 }, amountPerCell: 100 },
};
/** Solo fértil é renovável (sem esgotamento), limitado só pelas células livres. */
export const OIL_DEPOSIT_AMOUNT = 2500;

// ------------------------------------------------------------------ unidades

export type UnitType = 'infantry' | 'apc' | 'tank' | 'artillery';
export type BuildingType =
  | 'hq'
  | 'barracks'
  | 'factory'
  | 'farm'
  | 'sawmill'
  | 'quarry'
  | 'mine'
  | 'oil_well'
  | 'tower'
  | 'house'
  | 'residential'
  | 'warehouse'
  | 'silo'
  | 'oil_tank'
  | 'market'
  | 'port'
  | 'rail_station';

/** O que uma fila de produção pode produzir. */
export type ProducibleType = UnitType | 'citizen' | 'recruit';

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
    cost: { oil: 40, iron: 30, supplies: 30 },
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
    cost: { oil: 70, iron: 60, supplies: 50 },
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
    cost: { oil: 50, iron: 50, stone: 30, supplies: 60 },
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
  /** Renda fixa por segundo quando concluído (sem trabalhadores). */
  income: Cost;
  gather?: GatherDef;
  sight: number;
  weapon?: WeaponDef;
  /**
   * Raio (em células) do território que o edifício concluído projeta. Território define onde se
   * pode construir e por onde tropas de países sem guerra/aliança podem passar.
   */
  territoryRadius: number;
  /** Peso da influência territorial (centros de comando pesam mais na disputa de fronteira). */
  territoryWeight: number;
  /** Postos de trabalho; sem trabalhadores a produção para (proporcional aos ocupados). */
  workers: number;
  /** Capacidade habitacional fornecida quando concluído (e com manutenção paga). */
  housing: number;
  /** Capacidade de armazenamento por recurso quando concluído. */
  storage: Partial<Stockpile>;
  /** Manutenção por segundo. */
  upkeep: Cost;
  buildable: boolean;
  description: string;
  hotkey?: string;
}

/** Distância máxima (células, centro a centro) entre um poço e um tanque de petróleo válido. */
export const OIL_TANK_RANGE = 9;

const NONE = { workers: 0, housing: 0, storage: {}, upkeep: {}, territoryRadius: 0, territoryWeight: 1 } as const;

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: {
    ...NONE,
    label: 'Centro de Comando',
    cost: {},
    buildSeconds: 0,
    maxHp: 1500,
    size: 3,
    income: { supplies: 3 },
    sight: 14,
    weapon: { damage: 14, range: 9, cooldown: 1.5 },
    territoryRadius: 13,
    territoryWeight: 1.5,
    housing: 20,
    storage: { supplies: 1000, food: 150, wood: 150, stone: 150, iron: 100, oil: 100 },
    buildable: false,
    description: 'Sede do governo no teatro: forma cidadãos, abriga 20 habitantes, guarda suprimentos e projeta o maior território. Se for destruído, a operação está perdida.',
  },
  barracks: {
    ...NONE,
    label: 'Base Militar',
    cost: { wood: 100, stone: 30 },
    buildSeconds: 15,
    maxHp: 600,
    size: 2,
    income: {},
    sight: 9,
    territoryRadius: 5,
    workers: 2,
    buildable: true,
    description: 'Base de forças terrestres: treina infantaria (cada soldado sai da força de trabalho). Amplia levemente a fronteira.',
    hotkey: 'B',
  },
  factory: {
    ...NONE,
    label: 'Fábrica de Veículos',
    cost: { wood: 120, stone: 150, supplies: 100 },
    buildSeconds: 25,
    maxHp: 900,
    size: 2,
    income: {},
    sight: 9,
    territoryRadius: 5,
    workers: 4,
    buildable: true,
    description: 'Produz veículos blindados, tanques e artilharia (consome ferro). Cada veículo exige uma tripulação.',
    hotkey: 'N',
  },
  farm: {
    ...NONE,
    label: 'Fazenda',
    cost: { wood: 60 },
    buildSeconds: 10,
    maxHp: 300,
    size: 2,
    income: {},
    gather: { resource: 'food', terrain: Terrain.Fertile, radius: 3, maxCells: 8, minCells: 3, ratePerCell: 0.5 },
    sight: 7,
    workers: 3,
    buildable: true,
    description: 'Cultiva o solo fértil ao redor (renovável). A comida vai para silos; pausa com os silos cheios.',
    hotkey: 'C',
  },
  sawmill: {
    ...NONE,
    label: 'Serraria',
    cost: { supplies: 60 },
    buildSeconds: 10,
    maxHp: 350,
    size: 2,
    income: {},
    gather: { resource: 'wood', terrain: Terrain.Forest, radius: 4, maxCells: 10, minCells: 3, ratePerCell: 0.4 },
    sight: 7,
    workers: 3,
    buildable: true,
    description: 'Explora uma floresta (pequena: 1 serraria; média: 2; grande: 3). A madeira é finita e vai para os armazéns.',
    hotkey: 'M',
  },
  quarry: {
    ...NONE,
    label: 'Pedreira',
    cost: { wood: 80 },
    buildSeconds: 12,
    maxHp: 400,
    size: 2,
    income: {},
    gather: { resource: 'stone', terrain: Terrain.Rock, radius: 3, maxCells: 8, minCells: 2, ratePerCell: 0.35 },
    sight: 7,
    workers: 3,
    buildable: true,
    description: 'Extrai pedra de uma formação rochosa (limite de pedreiras pelo tamanho da formação). Finita.',
    hotkey: 'P',
  },
  mine: {
    ...NONE,
    label: 'Mina',
    cost: { wood: 80, supplies: 40 },
    buildSeconds: 14,
    maxHp: 450,
    size: 2,
    income: {},
    gather: { resource: 'iron', terrain: Terrain.Ore, radius: 2, maxCells: 6, minCells: 2, ratePerCell: 0.45 },
    sight: 7,
    workers: 3,
    buildable: true,
    description: 'Extrai ferro de veios de minério nas montanhas. Necessário para veículos. Finito.',
    hotkey: 'J',
  },
  oil_well: {
    ...NONE,
    label: 'Poço de Petróleo',
    cost: { wood: 80, stone: 60 },
    buildSeconds: 14,
    maxHp: 450,
    size: 2,
    income: {},
    gather: { resource: 'oil', terrain: null, radius: 0, maxCells: 1, minCells: 1, ratePerCell: 3 },
    sight: 7,
    workers: 2,
    buildable: true,
    description: `Construído sobre uma jazida (finita). Só opera com um Tanque de Petróleo com espaço a até ${9} células.`,
    hotkey: 'O',
  },
  tower: {
    ...NONE,
    label: 'Torre de Vigilância',
    cost: { stone: 100, wood: 40 },
    buildSeconds: 12,
    maxHp: 500,
    size: 1,
    income: {},
    sight: 15,
    weapon: { damage: 10, range: 10, cooldown: 1.2 },
    territoryRadius: 8,
    territoryWeight: 1.2,
    buildable: true,
    description: 'Amplia visão e fronteira (como fortes e torres de fronteira) e defende a área.',
    hotkey: 'K',
  },
  house: {
    ...NONE,
    label: 'Casa',
    cost: { wood: 40, stone: 20 },
    buildSeconds: 8,
    maxHp: 250,
    size: 1,
    income: {},
    sight: 5,
    territoryRadius: 3,
    housing: 10,
    buildable: true,
    description: '+10 de capacidade populacional. Expande um pouco a fronteira.',
    hotkey: 'U',
  },
  residential: {
    ...NONE,
    label: 'Prédio Residencial',
    cost: { wood: 120, stone: 120, supplies: 80 },
    buildSeconds: 20,
    maxHp: 600,
    size: 2,
    income: {},
    sight: 6,
    territoryRadius: 4,
    housing: 20,
    upkeep: { supplies: 0.25 },
    buildable: true,
    description: '+20 de capacidade populacional. Manutenção de 0,25 suprimento/s; sem pagamento, não abriga ninguém.',
    hotkey: 'I',
  },
  warehouse: {
    ...NONE,
    label: 'Armazém de Recursos',
    cost: { wood: 50, stone: 60 },
    buildSeconds: 12,
    maxHp: 500,
    size: 2,
    income: {},
    sight: 6,
    storage: { wood: 400, stone: 400, iron: 400 },
    buildable: true,
    description: 'Guarda madeira, pedra e ferro (400 de cada). Destruído, o excedente acima da capacidade restante se perde.',
    hotkey: 'R',
  },
  silo: {
    ...NONE,
    label: 'Silo',
    cost: { wood: 80, stone: 20 },
    buildSeconds: 10,
    maxHp: 300,
    size: 1,
    income: {},
    sight: 5,
    storage: { food: 400 },
    buildable: true,
    description: 'Guarda 400 de comida. Fazendas pausam quando todos os silos estão cheios.',
    hotkey: 'L',
  },
  oil_tank: {
    ...NONE,
    label: 'Tanque de Petróleo',
    cost: { stone: 60, iron: 30 },
    buildSeconds: 10,
    maxHp: 350,
    size: 1,
    income: {},
    sight: 5,
    storage: { oil: 300 },
    buildable: true,
    description: `Guarda 300 de petróleo, com estoque próprio. Poços a até ${OIL_TANK_RANGE} células enchem o tanque; se for destruído, o petróleo dele se perde.`,
    hotkey: 'Y',
  },
  market: {
    ...NONE,
    label: 'Terminal Comercial',
    cost: { wood: 80, stone: 60, supplies: 60 },
    buildSeconds: 14,
    maxHp: 450,
    size: 2,
    income: {},
    sight: 6,
    upkeep: { supplies: 0.05 },
    buildable: true,
    description: 'Habilita o comércio internacional (ofertas e contratos no painel Nação → Comércio) e despacha comboios rodoviários. Cada terminal opera 2 embarques ao mesmo tempo.',
    hotkey: 'K',
  },
  port: {
    ...NONE,
    label: 'Porto',
    cost: { wood: 120, stone: 100, iron: 40 },
    buildSeconds: 18,
    maxHp: 600,
    size: 2,
    income: {},
    sight: 8,
    upkeep: { supplies: 0.08 },
    buildable: true,
    description: 'Construído na margem da água. Navios levam até 320 por viagem com o menor frete, mas são lentos e, em guerra, navegam escoltados (+50% de tempo).',
  },
  rail_station: {
    ...NONE,
    label: 'Estação Ferroviária',
    cost: { wood: 100, stone: 80, iron: 80 },
    buildSeconds: 16,
    maxHp: 500,
    size: 2,
    income: {},
    sight: 6,
    upkeep: { supplies: 0.06 },
    buildable: true,
    description: 'Trens pela mesma rota terrestre dos caminhões: até 160 por viagem, mais rápidos e com frete menor.',
  },
};

export const PRODUCTION_QUEUE_LIMIT = 5;
/** Ticks sem progresso antes de replanejar o caminho. */
export const STUCK_TICKS = 20;
export const MAX_REPLANS = 3;
/** Intervalo (ticks) para recalcular caminho de perseguição. */
export const CHASE_REPATH_TICKS = 10;
