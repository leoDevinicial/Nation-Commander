import type { BuildingType, Cost, ProducibleType, ResourceType, Stockpile, Terrain, UnitType } from './config.ts';
import type { SpecId } from './upgrades.ts';
import type { ModId } from './modernization.ts';

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
  /** Vida máxima atual: base × equipamento do edifício produtor × pacotes instalados. */
  maxHp: number;
  /** Pacotes de modernização instalados (Fase 5): o nível de equipamento desta unidade. */
  mods: ModId[];
  /** Modernização em andamento numa instalação: a unidade fica parada e não dispara. */
  refit: Refit | null;
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
  /** Sofrendo atrito em território inimigo neste momento (sem linha de suprimento). */
  attrition: boolean;
}

export interface Refit {
  mod: ModId;
  /** Instalação (base militar ou fábrica) onde o pacote é instalado. */
  facilityId: EntityId;
  remainingTicks: number;
  totalTicks: number;
  /** Materiais e verba pagos — base do reembolso parcial ao cancelar. */
  paid: Cost;
  usd: number;
}

export interface ProductionItem {
  /** Unidade militar (já reservou um recruta como tripulação), cidadão ou recruta. */
  unitType: ProducibleType;
  remainingTicks: number;
  totalTicks: number;
  /** Custo efetivamente pago (com os efeitos do edifício), devolvido integralmente ao cancelar. */
  paid?: Cost;
  /** Pacotes de equipamento do padrão de produção no momento do pedido (já pagos em `paid`). */
  mods?: ModId[];
}

/** Obra de melhoria em andamento (Fase 4). */
export interface UpgradeWork {
  toLevel: number;
  /** Especialização escolhida, quando o nível pede uma. */
  spec: SpecId | null;
  builtTicks: number;
  totalTicks: number;
  /** Recursos e verba (US$) pagos — base do reembolso parcial ao cancelar. */
  paid: Cost;
  usd: number;
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
  /** Total de ticks de obra, fixado no início (pesquisas não alteram obras em andamento). */
  buildTicks: number;
  queue: ProductionItem[];
  rally: Vec2 | null;
  cooldown: number;
  engageId: EntityId | null;
  /** Células de recurso reivindicadas (índices da grade) por edifícios de coleta. */
  claims: number[];
  /** Depósito explorado (null: renovável ou não é edifício de coleta). */
  depositId: number | null;
  /** Trabalhadores alocados e o alvo definido pelo jogador (padrão: todos os postos). */
  workers: number;
  workerTarget: number;
  /** Estoque próprio (tanques de petróleo). */
  stored: number;
  /** Produção fracionária acumulada (mantém inteiros no estoque, sem perda). */
  acc: number;
  status: BuildingStatus;
  /** Manutenção não paga: o edifício não fornece seus benefícios. */
  unpaid: boolean;
  /** Nível de melhoria (1 = como construído) e especialização (Fase 4). */
  level: number;
  spec: SpecId | null;
  /** Vida máxima atual (derivada do nível e da especialização). */
  maxHp: number;
  upgrade: UpgradeWork | null;
}

/** Por que um edifício não está produzindo (ou 'ok'). */
export type BuildingStatus = 'ok' | 'no_workers' | 'storage_full' | 'no_tank' | 'depleted' | 'outside_territory' | 'unpaid';

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

/** Modificadores táticos vindos da camada nacional (pesquisas e logística). */
export interface TacticalModifiers {
  constructionTimeMul: number;
  productionTimeMul: number;
  /** Suprimentos/s enviados pela logística nacional ao teatro. */
  externalIncome: number;
  /** Multiplicador do raio de território (pesquisa de administração territorial). */
  territoryMul: number;
}

export interface PlayerState {
  slot: Slot;
  /** Estoque total. Para petróleo: reserva do QG + soma dos tanques. */
  resources: Stockpile;
  /** Parte do petróleo guardada na reserva do QG (o resto está nos tanques). */
  oilReserve: number;
  /** Cidadãos (força de trabalho: empregados + ociosos). Militares não contam aqui. */
  citizens: number;
  /** Recrutas na reserva militar (alistados no quartel, ainda sem unidade). */
  recruits: number;
  /** Sem comida em estoque para o consumo da população. */
  hungry: boolean;
  /** Acumuladores fracionários de consumo. */
  upkeepAcc: { food: number; supplies: number; oil: number };
  /** Manutenção em atraso por recurso: os edifícios que dependem dela param. */
  unpaidUpkeep: { supplies: boolean; oil: boolean };
  modifiers: TacticalModifiers;
  /** Acumulador fracionário de renda para manter inteiros em `resources`. */
  incomeRemainder: Stockpile;
  defeated: boolean;
  stats: PlayerStats;
}

export interface MapData {
  width: number;
  height: number;
  cellSize: number;
  seed: number;
  terrain: Terrain[];
  /** Jazidas de petróleo (célula âncora de um poço 2×2). */
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
  | { type: 'player_defeated'; tick: number; slot: Slot }
  | { type: 'citizen_trained'; tick: number; owner: Slot; pos: Vec2 }
  | { type: 'recruit_trained'; tick: number; owner: Slot; pos: Vec2 }
  | { type: 'production_halted'; tick: number; id: EntityId; owner: Slot; buildingType: BuildingType; reason: BuildingStatus; pos: Vec2 }
  | { type: 'deposit_depleted'; tick: number; id: EntityId; owner: Slot; buildingType: BuildingType; pos: Vec2 }
  | { type: 'storage_lost'; tick: number; owner: Slot; resource: ResourceType; amount: number; reason: 'destroyed' | 'capacity' }
  | { type: 'shortage'; tick: number; owner: Slot; resource: 'food' | 'supplies' | 'oil' }
  | { type: 'upgrade_started'; tick: number; id: EntityId; owner: Slot; buildingType: BuildingType; toLevel: number; spec: SpecId | null; usd: number; pos: Vec2 }
  | { type: 'upgrade_completed'; tick: number; id: EntityId; owner: Slot; buildingType: BuildingType; level: number; spec: SpecId | null; pos: Vec2 }
  | { type: 'upgrade_cancelled'; tick: number; id: EntityId; owner: Slot; buildingType: BuildingType; toLevel: number; pos: Vec2 }
  | { type: 'attrition'; tick: number; owner: Slot; pos: Vec2 }
  | { type: 'modernize_started'; tick: number; id: EntityId; owner: Slot; unitType: UnitType; mod: ModId; usd: number; pos: Vec2 }
  | { type: 'unit_modernized'; tick: number; id: EntityId; owner: Slot; unitType: UnitType; mod: ModId; pos: Vec2 }
  | { type: 'trade_offer'; tick: number; offerId: number; from: number; to: number }
  | { type: 'trade_reply'; tick: number; offerId: number; from: number; to: number; accepted: boolean; reason: string | null }
  | { type: 'contract_update'; tick: number; contractId: number; seller: number; buyer: number; status: string; text: string }
  | { type: 'shipment_delivered'; tick: number; shipmentId: number; contractId: number; seller: number; buyer: number; resource: string; quantity: number }
  | { type: 'shipment_lost'; tick: number; shipmentId: number; contractId: number; seller: number; buyer: number; resource: string; quantity: number; reason: string; pos: Vec2 }
  | { type: 'modernize_cancelled'; tick: number; id: EntityId; owner: Slot; unitType: UnitType; mod: ModId; reason: 'player' | 'facility_lost'; pos: Vec2 };
