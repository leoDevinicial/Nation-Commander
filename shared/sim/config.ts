import { ERAS, eraLabel, researchEra } from './eras.ts';
/**
 * Tabelas de regras da operação tática. Todos os valores são parâmetros de jogo
 * (game_parameter), não dados factuais. Ajustar aqui, nunca espalhados pelo código.
 */

export const TICK_RATE = 20; // atualizações de simulação por segundo
/**
 * Período de preparo (tempo de jogo) na dificuldade Normal: os governos de IA não declaram guerra
 * nem lançam ofensivas, e mantêm só uma guarnição pequena, priorizando a economia. Cada dificuldade
 * tem o seu (`shared/sim/difficulty.ts`, `Simulation.prepTicks`). O jogador pode declarar guerra
 * antes, se quiser.
 */
export const PREPARATION_TICKS = TICK_RATE * 60 * 8;
export const TICK_SECONDS = 1 / TICK_RATE;

export const MAP_SIZE = 64; // células por lado
export const CELL_SIZE = 2; // unidades de mundo por célula

// ------------------------------------------------------------------ população

/** Teto absoluto de população por nação (cidadãos + efetivo militar), em qualquer situação. */
export const POP_ABSOLUTE_CAP = 200;
/** Cidadãos no início da partida (além das unidades iniciais). */
export const STARTING_CITIZENS = 6;
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

/**
 * Bens industriais das cadeias produtivas (lote 1, §4): a Refinaria transforma petróleo em
 * combustível e a Siderúrgica, ferro em aço. Ficam num estoque à parte (`PlayerState.goods`) e
 * substituem parte do custo das tropas e aeronaves: cada unidade de bem poupa `GOODS.saves`
 * unidades do recurso bruto (combustível no lugar do petróleo, aço no lugar do ferro).
 */
export type GoodsType = 'fuel' | 'steel';
export const GOODS_TYPES: readonly GoodsType[] = ['fuel', 'steel'];
export type Goods = Record<GoodsType, number>;
export const GOODS = {
  label: { fuel: 'Combustível', steel: 'Aço' } as Record<GoodsType, string>,
  /** Recurso bruto que cada bem substitui. */
  raw: { fuel: 'oil', steel: 'iron' } as Record<GoodsType, ResourceType>,
  /** Unidades do recurso bruto poupadas por unidade de bem. */
  saves: 2,
  /** Estoque de bens: base e por usina pronta (Refinaria ou Siderúrgica). */
  baseCap: 40,
  capPerPlant: 150,
};
/** Bens usados na produção de cada tropa (quando há estoque; senão paga o custo cheio). */
export const GOODS_USE: Partial<Record<UnitType, Partial<Goods>>> = {
  apc: { fuel: 5 },
  tank: { steel: 10, fuel: 5 },
  artillery: { steel: 5 },
  rocket_artillery: { steel: 10, fuel: 5 },
  mobile_aa: { steel: 10, fuel: 5 },
  mbt: { steel: 20, fuel: 10 },
};
export const emptyGoods = (): Goods => ({ fuel: 0, steel: 0 });

/**
 * Serviços com raio de cobertura (lote 1, §4, como no *Tropico*): Hospital, Escola e Delegacia.
 * O raio é em células, a partir do centro do edifício pronto e com trabalhadores.
 */
export type ServiceKind = 'health' | 'education' | 'security';
const SERVICES_RADIUS = 10;
export const SERVICES = {
  radius: SERVICES_RADIUS,
  /** Hospital: vida recuperada por segundo pelas tropas próprias cobertas. */
  healPerSecond: 1.5,
  /** Escola: coleta e produção mais rápidas nos edifícios cobertos. */
  educationGatherMul: 1.1,
  /** Aprovação máxima de cada serviço (com todas as moradias cobertas). */
  approvalMax: 2,
};

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

/** Começo enxuto (só o essencial para a primeira fazenda e a primeira serraria): administrar recursos é o centro do jogo. */
export const STARTING_RESOURCES: Stockpile = { supplies: 200, food: 150, wood: 200, stone: 60, iron: 0, oil: 50 };

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

// reservas dobradas no rebalanceamento da economia (custos 1,5–3× maiores): os depósitos duram a partida
export const DEPOSIT_RULES: Partial<Record<Terrain, DepositRule>> = {
  [Terrain.Forest]: { mediumFrom: 20, largeFrom: 50, maxSites: { small: 1, medium: 2, large: 3 }, amountPerCell: 160 },
  [Terrain.Rock]: { mediumFrom: 12, largeFrom: 36, maxSites: { small: 1, medium: 2, large: 2 }, amountPerCell: 240 },
  [Terrain.Ore]: { mediumFrom: 6, largeFrom: 16, maxSites: { small: 1, medium: 1, large: 2 }, amountPerCell: 200 },
};
/** Solo fértil é renovável (sem esgotamento), limitado só pelas células livres. */
export const OIL_DEPOSIT_AMOUNT = 5000;

// ------------------------------------------------------------------ unidades

export type UnitType = 'infantry' | 'apc' | 'tank' | 'artillery' | 'at_infantry' | 'special_forces' | 'mbt' | 'rocket_artillery' | 'mobile_aa' | 'engineer' | 'scout';

/** Classe de blindagem do alvo: define os bônus das armas (antitanque contra veículos, etc.). */
export type ArmorClass = 'infantry' | 'vehicle';
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
  | 'rail_station'
  | 'airbase'
  | 'aa_battery'
  | 'missile_silo'
  | 'research_center'
  | 'city_hall'
  // Grandes Projetos Nacionais (Futuro Próximo; um de cada por nação)
  | 'nuclear_plant'
  | 'network_5g'
  | 'hydro_dam'
  | 'financial_center'
  | 'space_center'
  // engenharia de combate
  | 'tank_trap'
  // cadeias produtivas e serviços com cobertura (lote 1, §4)
  | 'refinery'
  | 'steel_mill'
  | 'hospital'
  | 'school'
  | 'police_station';

/** O que uma fila de produção pode produzir. */
export type ProducibleType = UnitType | 'citizen' | 'recruit';

export interface WeaponDef {
  damage: number;
  /** Alcance em unidades de mundo, medido até a borda do alvo. */
  range: number;
  /** Segundos entre disparos. */
  cooldown: number;
  /** Multiplicadores de dano por tipo de alvo (padrão 1): antitanque contra veículos, etc. */
  vsInfantry?: number;
  vsVehicle?: number;
  vsBuilding?: number;
  /** Raio de dano em área (foguetes): quem estiver perto do alvo recebe 60% do dano. */
  splash?: number;
  /**
   * Salva de foguetes: quantos saem do lançador a cada disparo. O dano chega à área do alvo
   * depois do voo (quem sair dali a tempo escapa), não no instante do disparo.
   */
  salvo?: number;
  /** Alcance mínimo: alvos mais perto que isso não podem ser atingidos (o lançador recua). */
  minRange?: number;
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
  armor: ArmorClass;
  /** Pesquisa militar (Centro de Pesquisa) que libera a produção. */
  requires?: MilitaryResearchId;
  /** Contribui para a defesa antiaérea por perto (aeronaves e mísseis), como uma bateria. */
  airDefense?: boolean;
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
    weapon: { damage: 9, range: 6, cooldown: 1, vsVehicle: 0.35 },
    producedBy: 'barracks',
    description: 'Barata e rápida de treinar. Eficaz em grupo contra infantaria; o fuzil quase não fere blindados (35% do dano).',
    hotkey: 'I',
    armor: 'infantry',
  },
  apc: {
    label: 'Veículo Blindado',
    cost: { oil: 40, iron: 30, supplies: 30 },
    buildSeconds: 8,
    maxHp: 160,
    speed: 6,
    radius: 0.8,
    sight: 14,
    weapon: { damage: 8, range: 6.5, cooldown: 0.8, vsVehicle: 0.6 },
    producedBy: 'factory',
    description: 'Rápido e com visão ampla: ideal para reconhecimento e para dar visão à artilharia. A metralhadora rende pouco contra outros blindados.',
    hotkey: 'V',
    armor: 'vehicle',
  },
  tank: {
    label: 'Tanque',
    cost: { oil: 70, iron: 60, supplies: 50 },
    buildSeconds: 12,
    maxHp: 260,
    speed: 4.4,
    radius: 0.9,
    sight: 12,
    weapon: { damage: 30, range: 8, cooldown: 1.7 },
    producedBy: 'factory',
    description: 'Resistente e de bom alcance. Lento na floresta e na lama.',
    hotkey: 'T',
    armor: 'vehicle',
    requires: 'tracked_armor',
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
    armor: 'vehicle',
    requires: 'field_artillery',
  },
  // ---- liberadas por pesquisa militar (Centro de Pesquisa) ----
  at_infantry: {
    label: 'Infantaria Antitanque',
    cost: { food: 60, iron: 25, supplies: 20 },
    buildSeconds: 8,
    maxHp: 70,
    speed: 3,
    radius: 0.5,
    sight: 10,
    weapon: { damage: 16, range: 7, cooldown: 2.2, vsVehicle: 3, vsInfantry: 0.5, vsBuilding: 1.3 },
    producedBy: 'barracks',
    description: 'Lança-rojões: arrasa blindados e tanques (dano triplo contra veículos), mas é fraca contra infantaria.',
    hotkey: 'N',
    armor: 'infantry',
    requires: 'antitank_weapons',
  },
  special_forces: {
    label: 'Forças Especiais',
    cost: { food: 90, supplies: 60, iron: 20 },
    buildSeconds: 12,
    maxHp: 115,
    speed: 3.9,
    radius: 0.5,
    sight: 15,
    weapon: { damage: 17, range: 7.5, cooldown: 0.85, vsVehicle: 0.8, vsBuilding: 1.4 },
    producedBy: 'barracks',
    description: 'Tropa de elite: rápida, com visão longa e fogo preciso. Ótima para reconhecimento e para destruir edifícios.',
    hotkey: 'J',
    armor: 'infantry',
    requires: 'special_operations',
  },
  mbt: {
    label: 'Tanque Moderno',
    cost: { oil: 110, iron: 100, supplies: 80 },
    buildSeconds: 18,
    maxHp: 430,
    speed: 4.8,
    radius: 1,
    sight: 13,
    weapon: { damage: 48, range: 9, cooldown: 2.4 },
    producedBy: 'factory',
    description: 'Tanque de batalha de nova geração: blindagem e canhão muito superiores ao tanque comum. Caro.',
    hotkey: 'M',
    armor: 'vehicle',
    requires: 'modern_armor',
  },
  rocket_artillery: {
    label: 'Lança-Foguetes',
    cost: { oil: 70, iron: 70, supplies: 80 },
    buildSeconds: 16,
    maxHp: 110,
    speed: 3.4,
    radius: 0.9,
    sight: 9,
    weapon: { damage: 120, range: 24, cooldown: 7, splash: 3.5, vsBuilding: 1.6, salvo: 12, minRange: 7 },
    producedBy: 'factory',
    description:
      'Salvas de 12 foguetes de longo alcance com dano em área: arrasa construções e grupos de tropas de longe. Não atira em alvos a menos de 7 de distância e não se aproxima das construções inimigas. Frágil e lento para recarregar.',
    hotkey: 'L',
    armor: 'vehicle',
    requires: 'rocket_systems',
  },
  engineer: {
    label: 'Engenheiro de Combate',
    cost: { food: 50, iron: 20, supplies: 30 },
    buildSeconds: 9,
    maxHp: 80,
    speed: 3.1,
    radius: 0.5,
    sight: 10,
    weapon: { damage: 5, range: 5, cooldown: 1.2, vsVehicle: 0.3 },
    producedBy: 'barracks',
    description:
      'Engenharia de combate: instala minas antitanque, detecta e remove as minas inimigas por perto, pavimenta estradas fora do território e ergue obstáculos antitanque. Fraco em combate.',
    hotkey: 'E',
    armor: 'infantry',
    requires: 'combat_engineering',
  },
  scout: {
    label: 'Explorador',
    cost: { food: 30, supplies: 15 },
    buildSeconds: 7,
    maxHp: 70,
    speed: 5.2,
    radius: 0.45,
    sight: 16,
    weapon: { damage: 3, range: 4, cooldown: 1.5, vsVehicle: 0.2 },
    producedBy: 'barracks',
    description: 'Batedor rápido de visão longa: descobre o mapa, as jazidas e os vizinhos. Quase não luta. Toda nação começa a partida com um.',
    hotkey: 'O',
    armor: 'infantry',
  },
  mobile_aa: {
    label: 'Antiaérea Móvel',
    cost: { oil: 60, iron: 60, supplies: 50 },
    buildSeconds: 12,
    maxHp: 150,
    speed: 4.6,
    radius: 0.85,
    sight: 14,
    weapon: { damage: 9, range: 7, cooldown: 0.6, vsVehicle: 0.6 },
    producedBy: 'factory',
    description: 'Canhões e radar sobre lagartas: acompanha as tropas e derruba aeronaves e mísseis por perto (como uma bateria antiaérea).',
    hotkey: 'Y',
    armor: 'vehicle',
    requires: 'mobile_air_defense',
    airDefense: true,
  },
};

// ------------------------------------------------------------------ pesquisa militar

export type MilitaryResearchId = 'tracked_armor' | 'field_artillery' | 'antitank_weapons' | 'mobile_air_defense' | 'special_operations' | 'rocket_systems' | 'modern_armor' | 'combat_engineering';

/**
 * Pesquisa militar feita no Centro de Pesquisa durante a partida (fila no próprio edifício, com
 * recursos e tempo): libera tropas novas aos poucos. O orçamento nacional de P&D acelera.
 */
export interface MilitaryResearchDef {
  label: string;
  description: string;
  cost: Cost;
  seconds: number;
  prereqs: MilitaryResearchId[];
  /** Nível mínimo do Centro de Pesquisa (níveis de melhoria). */
  tier: 1 | 2 | 3;
  hotkey: string;
}

export const MILITARY_RESEARCH: Record<MilitaryResearchId, MilitaryResearchDef> = {
  // veículos liberados aos poucos: só o blindado de transporte sai da fábrica sem pesquisa
  tracked_armor: {
    label: 'Blindados sobre lagartas',
    description: 'Motor, transmissão e canhão para o chassi de lagartas: libera o Tanque.',
    cost: { supplies: 100, iron: 90, oil: 40 },
    seconds: 35,
    prereqs: [],
    tier: 1,
    hotkey: 'K',
  },
  field_artillery: {
    label: 'Artilharia de campanha',
    description: 'Obus autopropulsado e direção de tiro indireto: libera a Artilharia.',
    cost: { supplies: 110, iron: 80, oil: 30 },
    seconds: 35,
    prereqs: [],
    tier: 1,
    hotkey: 'U',
  },
  combat_engineering: {
    label: 'Engenharia de combate',
    description: 'Minas, sapadores e equipamento de pontes e estradas: libera o Engenheiro de Combate.',
    cost: { supplies: 100, iron: 70, stone: 40 },
    seconds: 35,
    prereqs: [],
    tier: 1,
    hotkey: 'E',
  },
  antitank_weapons: {
    label: 'Armas antitanque',
    description: 'Lança-rojões portáteis: libera a Infantaria Antitanque.',
    cost: { supplies: 120, iron: 80 },
    seconds: 40,
    prereqs: [],
    tier: 1,
    hotkey: 'N',
  },
  mobile_air_defense: {
    label: 'Defesa antiaérea móvel',
    description: 'Radar e canhões sobre lagartas: libera a Antiaérea Móvel.',
    cost: { supplies: 140, iron: 100, oil: 60 },
    seconds: 50,
    prereqs: ['tracked_armor'],
    tier: 1,
    hotkey: 'Y',
  },
  special_operations: {
    label: 'Operações especiais',
    description: 'Seleção e treinamento de elite: libera as Forças Especiais.',
    cost: { supplies: 180, food: 150, iron: 60 },
    seconds: 60,
    prereqs: ['antitank_weapons'],
    tier: 2,
    hotkey: 'J',
  },
  rocket_systems: {
    label: 'Lança-foguetes múltiplos',
    description: 'Foguetes de saturação com dano em área: libera o Lança-Foguetes.',
    cost: { supplies: 200, iron: 140, oil: 90 },
    seconds: 65,
    prereqs: ['field_artillery'],
    tier: 2,
    hotkey: 'L',
  },
  modern_armor: {
    label: 'Blindados de nova geração',
    description: 'Blindagem composta, canhão de alta velocidade e controle de tiro digital: libera o Tanque Moderno.',
    cost: { supplies: 300, iron: 240, oil: 160 },
    seconds: 90,
    prereqs: ['tracked_armor', 'rocket_systems'],
    tier: 3,
    hotkey: 'M',
  },
};

export const MILITARY_RESEARCH_IDS = Object.keys(MILITARY_RESEARCH) as MilitaryResearchId[];
export const isMilitaryResearchId = (v: unknown): v is MilitaryResearchId => typeof v === 'string' && Object.hasOwn(MILITARY_RESEARCH, v);

/** Motivo para não poder pesquisar (mesma regra no servidor e no painel), ou null. */
export function militaryResearchBlocker(id: MilitaryResearchId, done: readonly string[], centerLevel: number, era = 4): string | null {
  const def = MILITARY_RESEARCH[id];
  if (done.includes(id)) return 'Pesquisa já concluída';
  const need = researchEra(id, UNITS);
  if (need > era) return `Requer a era ${eraLabel(need)} (avance de era no Centro de Comando)`;
  const missing = def.prereqs.filter((p) => !done.includes(p));
  if (missing.length) return `Requer: ${missing.map((m) => MILITARY_RESEARCH[m].label).join(', ')}`;
  const level = def.tier === 3 ? 3 : def.tier === 2 ? 2 : 1;
  if (centerLevel < level) return `Requer o Centro de Pesquisa no nível ${level}`;
  return null;
}

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
  /** Pesquisa nacional exigida para construir (Fase 7: silo de mísseis). */
  requiresTech?: string;
  /**
   * Grande Projeto Nacional: um por nação, custo extra em US$ (fração do teto anual da verba de
   * obras) e um bônus global enquanto estiver de pé (texto em `effect`).
   */
  project?: { usdShare: number; effect: string; growth: number };
  /** Nível mínimo do Centro de Comando para construir. */
  minHqLevel?: number;
  /** Precisa encostar na água (porto, hidrelétrica). */
  nearWater?: boolean;
  /** Pode ser erguido fora do território, perto de um Engenheiro de Combate (obstáculos). */
  engineerOutside?: boolean;
  /** Cadeia produtiva: com trabalhadores, transforma um recurso bruto num bem (por segundo). */
  process?: { from: ResourceType; to: GoodsType; rate: number };
  /** Serviço com raio de cobertura (`SERVICES.radius` células). */
  service?: ServiceKind;
}

/**
 * Minas antitanque (lote 3): só veículos inimigos detonam; a infantaria passa por cima. O dono vê as
 * próprias; o inimigo só as vê com Engenheiro ou Forças Especiais por perto, reconhecimento aéreo ou
 * quando uma explode. O satélite não revela minas.
 */
export const MINE = {
  cost: { iron: 15, supplies: 10 } as Cost,
  /** Tempo parado para instalar (s). */
  laySeconds: 3,
  perNation: 24,
  triggerRadius: 0.9,
  damage: 260,
  /** Raio e fração do dano em volta. */
  splash: 2.2,
  splashFraction: 0.5,
  /** Detecção pelo inimigo (Engenheiro e Forças Especiais). */
  detectRange: 7,
  /** Remoção pelo engenheiro parado perto da mina (s). */
  clearSeconds: 2.5,
  clearRange: 1.8,
};

/** Bônus dos Grandes Projetos no teatro (aplicados pelo motor enquanto o projeto estiver pronto). */
export const PROJECT_FX = {
  /** Usina Nuclear: obras mais rápidas. */
  nuclearBuildMul: 0.9,
  /** Rede 5G: pesquisa militar mais rápida e visão extra das tropas. */
  network5gResearchMul: 1.3,
  network5gSight: 2,
  /** Hidrelétrica: coleta maior. */
  hydroGatherMul: 1.15,
  /** Centro Financeiro: teto da verba de obras maior. */
  financialWorksMul: 1.5,
};

/**
 * Estradas construídas pelo jogador (lote 3): traçado na grade, pedra por célula e uma fração do teto
 * da verba de obras (orçamento de infraestrutura); pequena manutenção em suprimentos. Fora do
 * território, só perto de um Engenheiro de Combate próprio.
 */
export const ROAD = {
  maxCells: 40,
  stonePerCell: 10,
  /** Fração do teto anual da verba de obras por célula. */
  usdSharePerCell: 0.002,
  /** Suprimentos/s por célula. */
  upkeepPerCell: 0.004,
  /** Distância (células) de um engenheiro para pavimentar fora do território. */
  engineerRange: 6,
  /** Velocidade dos comboios rodoviários sobre a estrada. */
  convoyMul: 1.3,
};

/**
 * Vitórias alternativas (lote 2, item 15), além de destruir o QG: territorial (controlar a maior
 * parte do território reivindicado por um tempo) e política (o rival em colapso de estabilidade).
 */
export const VICTORY = {
  /** Fração de todo o território reivindicado no mapa. */
  territoryShare: 0.7,
  territorySeconds: 240,
  /** Estabilidade nacional abaixo deste valor por `politicalDays` dias derruba o governo. */
  politicalStability: 10,
  politicalDays: 60,
};

/** Programa Espacial: contagem regressiva e subida do foguete (s). */
export const SPACE = { countdownSeconds: 10, ascentSeconds: 9 };

/**
 * Cidades (prefeituras, estilo Rise of Nations): distância mínima entre prefeituras e QGs, raio em
 * que os edifícios ficam vinculados à cidade e vida com que a prefeitura capturada passa ao novo dono.
 */
export const CITY = {
  spacingCells: 10,
  radiusCells: 8,
  captureHpFrac: 0.3,
};

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
    storage: { supplies: 1500, food: 300, wood: 300, stone: 300, iron: 200, oil: 200 },
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
    weapon: { damage: 10, range: 13, cooldown: 1.2 },
    territoryRadius: 8,
    territoryWeight: 1.2,
    buildable: true,
    description: 'Amplia visão e fronteira (como fortes e torres de fronteira) e defende a área.',
    hotkey: 'K',
  },
  refinery: {
    ...NONE,
    label: 'Refinaria',
    cost: { wood: 80, stone: 100, iron: 80 },
    buildSeconds: 28,
    maxHp: 550,
    size: 2,
    income: {},
    sight: 5,
    workers: 3,
    upkeep: { supplies: 0.05 },
    buildable: true,
    process: { from: 'oil', to: 'fuel', rate: 0.6 },
    description: 'Cadeia produtiva: com trabalhadores, transforma petróleo em combustível (0,6/s). O combustível substitui o petróleo na produção de veículos e aeronaves (cada unidade poupa 2 de petróleo). Alvo estratégico.',
  },
  steel_mill: {
    ...NONE,
    label: 'Siderúrgica',
    cost: { wood: 80, stone: 120, iron: 60 },
    buildSeconds: 28,
    maxHp: 600,
    size: 2,
    income: {},
    sight: 5,
    workers: 3,
    upkeep: { supplies: 0.05 },
    buildable: true,
    process: { from: 'iron', to: 'steel', rate: 0.5 },
    description: 'Cadeia produtiva: com trabalhadores, transforma ferro em aço (0,5/s). O aço substitui o ferro na produção dos blindados (cada unidade poupa 2 de ferro). Alvo estratégico.',
  },
  hospital: {
    ...NONE,
    label: 'Hospital',
    cost: { wood: 60, stone: 80, supplies: 60 },
    buildSeconds: 20,
    maxHp: 450,
    size: 2,
    income: {},
    sight: 6,
    workers: 2,
    upkeep: { supplies: 0.06 },
    buildable: true,
    service: 'health',
    description: `Serviço com raio de ${SERVICES_RADIUS} células: tropas próprias na área recuperam vida aos poucos e moradias cobertas dão aprovação.`,
  },
  school: {
    ...NONE,
    label: 'Escola',
    cost: { wood: 70, stone: 50, supplies: 40 },
    buildSeconds: 18,
    maxHp: 400,
    size: 2,
    income: {},
    sight: 5,
    workers: 2,
    upkeep: { supplies: 0.05 },
    buildable: true,
    service: 'education',
    description: `Serviço com raio de ${SERVICES_RADIUS} células: coletas cobertas rendem 10% a mais, tropas formadas em quartéis e fábricas cobertos saem como Veteranas e moradias cobertas dão aprovação.`,
  },
  police_station: {
    ...NONE,
    label: 'Delegacia',
    cost: { wood: 50, stone: 60, supplies: 40 },
    buildSeconds: 15,
    maxHp: 450,
    size: 1,
    income: {},
    sight: 7,
    workers: 1,
    upkeep: { supplies: 0.04 },
    buildable: true,
    service: 'security',
    description: `Serviço com raio de ${SERVICES_RADIUS} células: moradias cobertas dão aprovação e os protestos pesam menos na estabilidade; a viatura vigia a área (visão de 7 células).`,
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
    storage: { wood: 800, stone: 800, iron: 800 },
    buildable: true,
    description: 'Guarda madeira, pedra e ferro (800 de cada). Destruído, o excedente acima da capacidade restante se perde.',
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
    storage: { food: 800 },
    buildable: true,
    description: 'Guarda 800 de comida. Fazendas pausam quando todos os silos estão cheios.',
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
    storage: { oil: 600 },
    buildable: true,
    description: `Guarda 600 de petróleo, com estoque próprio. Poços a até ${OIL_TANK_RANGE} células enchem o tanque; se for destruído, o petróleo dele se perde.`,
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
  airbase: {
    ...NONE,
    label: 'Base Aérea',
    cost: { wood: 100, stone: 150, iron: 120, supplies: 100 },
    buildSeconds: 24,
    maxHp: 900,
    size: 3,
    income: {},
    sight: 10,
    workers: 4,
    upkeep: { supplies: 0.1, oil: 0.03 },
    territoryRadius: 4,
    buildable: true,
    description:
      'Pista, hangar (4 aeronaves), torre de controle e combustível. Produz caças, aviões de reconhecimento e cargueiros; cada aeronave exige um piloto (recruta), consome petróleo por missão e manutenção. Também serve de terminal para o comércio aéreo.',
  },
  aa_battery: {
    ...NONE,
    label: 'Bateria Antiaérea',
    cost: { stone: 60, iron: 90, supplies: 40 },
    buildSeconds: 14,
    maxHp: 450,
    size: 1,
    income: {},
    sight: 12,
    upkeep: { supplies: 0.04 },
    buildable: true,
    description: 'Defesa contra aeronaves e mísseis num raio de 12: cada bateria dá 25% de chance de derrubar cada aeronave inimiga e 20% de interceptar um míssil (com teto). Não dispara contra tropas.',
  },
  research_center: {
    ...NONE,
    label: 'Centro de Pesquisa Militar',
    cost: { wood: 120, stone: 120, iron: 60 },
    buildSeconds: 30,
    maxHp: 650,
    size: 2,
    income: {},
    sight: 8,
    workers: 3,
    upkeep: { supplies: 0.08 },
    territoryRadius: 4,
    buildable: true,
    description:
      'Laboratórios e campo de provas: pesquisa armamentos que liberam tropas novas (antitanque, antiaérea móvel, forças especiais, lança-foguetes, tanque moderno). A pesquisa anda com os 3 pesquisadores e acelera com o orçamento nacional de P&D. Melhorias liberam as pesquisas mais avançadas.',
    hotkey: 'T',
  },
  city_hall: {
    ...NONE,
    label: 'Prefeitura',
    cost: { wood: 200, stone: 120, supplies: 150 },
    buildSeconds: 35,
    maxHp: 1200,
    size: 2,
    income: { supplies: 1 },
    sight: 11,
    territoryRadius: 10,
    territoryWeight: 1.4,
    housing: 10,
    storage: { supplies: 400, food: 200, wood: 200, stone: 200 },
    buildable: true,
    description:
      'Funda uma cidade com o nome de uma cidade real do seu país: amplia bastante a fronteira, abriga 10, guarda recursos e rende suprimentos. Fica a pelo menos 10 células de outra prefeitura ou do QG. Se um inimigo a destruir, ele toma a cidade e os edifícios dela num raio de 8 células. Funciona como um QG secundário: pronta, forma cidadãos e abre o menu de construção.',
    hotkey: 'G',
  },
  nuclear_plant: {
    ...NONE,
    label: 'Usina Nuclear',
    cost: { stone: 600, iron: 500, supplies: 500, oil: 200 },
    buildSeconds: 240,
    maxHp: 2200,
    size: 3,
    income: { supplies: 4 },
    sight: 8,
    workers: 4,
    upkeep: { supplies: 0.1 },
    territoryRadius: 5,
    buildable: true,
    project: { usdShare: 0.4, effect: '+4 suprimentos/s e obras 10% mais rápidas; +0,5 p.p. de crescimento nacional', growth: 0.5 },
    description: 'Grande Projeto Nacional: energia firme para a nação. +4 suprimentos/s, obras 10% mais rápidas e +0,5 p.p. de crescimento. Um por nação.',
  },
  network_5g: {
    ...NONE,
    label: 'Rede 5G Nacional',
    cost: { iron: 400, supplies: 400, stone: 200, oil: 100 },
    buildSeconds: 200,
    maxHp: 1200,
    size: 2,
    income: {},
    sight: 18,
    workers: 2,
    upkeep: { supplies: 0.08 },
    territoryRadius: 6,
    buildable: true,
    project: { usdShare: 0.35, effect: 'Pesquisa militar 30% mais rápida e +2 de visão para todas as tropas; +0,4 p.p. de crescimento', growth: 0.4 },
    description: 'Grande Projeto Nacional: torre central da rede 5G. Pesquisa militar 30% mais rápida, +2 de visão para todas as tropas e +0,4 p.p. de crescimento. Um por nação.',
  },
  hydro_dam: {
    ...NONE,
    label: 'Hidrelétrica',
    cost: { stone: 800, iron: 300, supplies: 400 },
    buildSeconds: 220,
    maxHp: 2600,
    size: 3,
    income: { supplies: 2 },
    sight: 8,
    workers: 3,
    upkeep: { supplies: 0.06 },
    territoryRadius: 5,
    buildable: true,
    nearWater: true,
    project: { usdShare: 0.4, effect: '+15% na coleta de todos os recursos e +2 suprimentos/s; +0,4 p.p. de crescimento', growth: 0.4 },
    description: 'Grande Projeto Nacional: barragem e casa de força na margem da água. +15% na coleta de todos os recursos, +2 suprimentos/s e +0,4 p.p. de crescimento. Um por nação.',
  },
  financial_center: {
    ...NONE,
    label: 'Centro Financeiro',
    cost: { stone: 400, iron: 250, supplies: 600, wood: 200 },
    buildSeconds: 180,
    maxHp: 1400,
    size: 2,
    income: { supplies: 3 },
    sight: 7,
    workers: 3,
    territoryRadius: 6,
    territoryWeight: 1.3,
    buildable: true,
    project: { usdShare: 0.3, effect: 'Teto da verba de obras 50% maior e +3 suprimentos/s; +0,6 p.p. de crescimento', growth: 0.6 },
    description: 'Grande Projeto Nacional: arranha-céu da bolsa e dos bancos. Teto da verba de obras 50% maior, +3 suprimentos/s e +0,6 p.p. de crescimento. Um por nação.',
  },
  space_center: {
    ...NONE,
    label: 'Programa Espacial',
    cost: { supplies: 1500, iron: 1200, stone: 800, wood: 600, oil: 600 },
    buildSeconds: 360,
    maxHp: 2500,
    size: 4,
    income: {},
    sight: 10,
    workers: 6,
    upkeep: { supplies: 0.2, oil: 0.05 },
    territoryRadius: 6,
    buildable: true,
    minHqLevel: 9,
    requiresTech: 'space_technology',
    project: { usdShare: 0.9, effect: 'Lança um satélite: o mapa inteiro fica visível em tempo real (menos minas); +0,5 p.p. de crescimento', growth: 0.5 },
    description:
      'A megaconstrução de fim de partida: plataforma, torre de serviço, foguete e centro de controle. Pronto, autorize o lançamento: o satélite em órbita tira a névoa de guerra do mapa inteiro, em tempo real (só as minas continuam escondidas). Exige o Centro de Comando no nível 9 e a pesquisa Tecnologia espacial.',
  },
  tank_trap: {
    ...NONE,
    label: 'Obstáculo Antitanque',
    cost: { stone: 25, iron: 10 },
    buildSeconds: 6,
    maxHp: 350,
    size: 1,
    income: {},
    sight: 2,
    buildable: true,
    engineerOutside: true,
    description: 'Ouriços de aço e sacos de areia: bloqueiam a passagem de tropas e veículos. Pode ser erguido fora do território, perto de um Engenheiro de Combate.',
  },
  missile_silo: {
    ...NONE,
    label: 'Silo de Mísseis',
    cost: { stone: 160, iron: 200, supplies: 120 },
    buildSeconds: 30,
    maxHp: 700,
    size: 1,
    income: {},
    sight: 4,
    workers: 2,
    upkeep: { supplies: 0.08 },
    buildable: true,
    requiresTech: 'ballistic_missiles',
    description: 'Guarda até 2 mísseis balísticos (produção cara e lenta). Lançar exige pesquisa, guerra com o dono do alvo e uma sequência com confirmação: preparar → autorizar → lançar.',
  },
};

export const PRODUCTION_QUEUE_LIMIT = 5;
/** Ticks sem progresso antes de replanejar o caminho. */
export const STUCK_TICKS = 20;
export const MAX_REPLANS = 3;
/** Intervalo (ticks) para recalcular caminho de perseguição. */
export const CHASE_REPATH_TICKS = 10;

// ------------------------------------------------------------------ economia (balanceamento)

/**
 * Peso da economia: tudo custa bem mais do que o primeiro protótipo e a coleta é um pouco mais
 * lenta, para que administrar recursos seja o centro do jogo (pedido de balanceamento). Os
 * multiplicadores se aplicam uma vez, sobre os valores de referência acima (arredondados de 5
 * em 5); a armazenagem foi dobrada direto nas definições para caber os custos novos.
 */
export const ECONOMY = {
  units: 2.5,
  recruit: 1.5,
  citizen: 1.25,
  research: 2,
  economicBuildings: 1.6,
  militaryBuildings: 2,
  projects: 1.3,
  gather: 0.8,
  /** Aeronaves e mísseis (aplicado em `air.ts`). */
  aircraft: 3,
  aircraftUsd: 2,
  missiles: 2.5,
  /** Avanço de era (aplicado em `eras.ts`). */
  eras: 1.6,
};

export function scaleCostBy(c: Cost, mul: number): Cost {
  const out: Cost = {};
  for (const [r, v] of Object.entries(c) as [ResourceType, number][]) out[r] = Math.max(5, Math.round((v * mul) / 5) * 5);
  return out;
}

const MILITARY_BUILDINGS: readonly BuildingType[] = ['barracks', 'factory', 'tower', 'research_center', 'tank_trap', 'aa_battery', 'airbase', 'missile_silo'];
for (const u of Object.values(UNITS)) u.cost = scaleCostBy(u.cost, ECONOMY.units);
RECRUIT.cost = scaleCostBy(RECRUIT.cost, ECONOMY.recruit);
CITIZEN.cost = scaleCostBy(CITIZEN.cost, ECONOMY.citizen);
for (const r of Object.values(MILITARY_RESEARCH)) r.cost = scaleCostBy(r.cost, ECONOMY.research);
for (const [type, b] of Object.entries(BUILDINGS) as [BuildingType, BuildingDef][]) {
  if (type === 'hq') continue;
  b.cost = scaleCostBy(b.cost, b.project ? ECONOMY.projects : MILITARY_BUILDINGS.includes(type) ? ECONOMY.militaryBuildings : ECONOMY.economicBuildings);
  if (b.gather) b.gather.ratePerCell = Math.round(b.gather.ratePerCell * ECONOMY.gather * 1000) / 1000;
}
MINE.cost = scaleCostBy(MINE.cost, 2);
for (const e of Object.values(ERAS)) e.cost = scaleCostBy(e.cost, ECONOMY.eras);
