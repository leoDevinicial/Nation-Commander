import { TECHNOLOGIES, type TechId } from '../strategic/technologies.ts';
import { BUILDINGS, RESOURCE_TYPES, canAfford, type BuildingType, type Cost, type ResourceType, type Stockpile } from './config.ts';

/**
 * Melhorias de construções (Fase 4): até 10 níveis por classe, com custo em recursos do teatro e
 * em dinheiro do orçamento nacional, tempo de obra, requisitos (pesquisa, infraestrutura e
 * condições nacionais) e especializações mutuamente exclusivas nos níveis altos.
 *
 * Tudo aqui é dado + funções puras, usado igualmente pelo servidor (validação e efeitos) e pelo
 * cliente (painel de melhoria). Os efeitos de um edifício são SEMPRE recalculados a partir de
 * (classe, nível, especialização) — nada é somado ao estado a cada melhoria — então um efeito
 * não pode ser aplicado duas vezes.
 */

export const MAX_UPGRADE_LEVEL = 10;
/** Eficiência de coleta e produção do edifício enquanto a obra de melhoria acontece. */
export const UPGRADE_WORK_EFFICIENCY = 0.5;
/** Fração devolvida ao cancelar a obra (materiais já empregados se perdem). */
export const UPGRADE_CANCEL_REFUND = 0.8;
/** Um edifício pode estar no máximo este número de níveis acima do Centro de Comando. */
export const HQ_LEVEL_LEAD = 2;
/** A partir deste nível, toda classe exige estoque nacional de infraestrutura mínimo. */
export const INFRA_GATE_LEVEL = 8;
export const INFRA_GATE_MIN = 1.02;

export type SpecId =
  | 'admin'
  | 'logistics_hub'
  | 'fortified'
  | 'intensive'
  | 'mechanized'
  | 'granary'
  | 'efficient'
  | 'enhanced'
  | 'conservation'
  | 'lean'
  | 'capacity'
  | 'hardened'
  | 'dense'
  | 'self_sufficient'
  | 'drill'
  | 'elite'
  | 'enlistment'
  | 'volume'
  | 'energy'
  | 'advanced';

export const SPEC_IDS: readonly SpecId[] = [
  'admin',
  'logistics_hub',
  'fortified',
  'intensive',
  'mechanized',
  'granary',
  'efficient',
  'enhanced',
  'conservation',
  'lean',
  'capacity',
  'hardened',
  'dense',
  'self_sufficient',
  'drill',
  'elite',
  'enlistment',
  'volume',
  'energy',
  'advanced',
];

/** Valores funcionais de um edifício num nível (e especialização). */
export interface BuildingEffects {
  level: number;
  spec: SpecId | null;
  maxHp: number;
  /** Multiplicador da coleta (fazendas, serrarias, pedreiras, minas, poços). */
  rateMul: number;
  /** Quanto do depósito é consumido por unidade extraída (1 = exatamente o extraído). */
  depletionMul: number;
  /** Postos de trabalho totais. */
  workers: number;
  /** Capacidade de armazenamento por recurso (já com nível e especialização). */
  storage: Partial<Stockpile>;
  housing: number;
  /** Renda fixa por segundo (QG). */
  income: Cost;
  /** Raio de território em células (antes do multiplicador da pesquisa nacional). */
  territoryRadius: number;
  /** Manutenção total por segundo (base + nível + especialização). */
  upkeep: Cost;
  productionTimeMul: number;
  unitCostMul: number;
  /** Multiplicador extra só sobre o petróleo das unidades produzidas aqui. */
  unitOilMul: number;
  unitHpMul: number;
  recruitTimeMul: number;
  recruitCostMul: number;
  damageMul: number;
  rangeAdd: number;
  sightAdd: number;
}

/** Ganho linear por nível acima do 1 (k = nível − 1). Multiplicadores: 1 + passo·k. */
interface LevelScaling {
  hpMul?: number;
  rateMul?: number;
  storageMul?: number;
  housing?: number;
  incomeMul?: number;
  territory?: number;
  upkeepSupplies?: number;
  productionTimeMul?: number;
  recruitTimeMul?: number;
  damageMul?: number;
  rangeAdd?: number;
  sightAdd?: number;
}

/** Alterações de uma especialização, aplicadas uma única vez sobre os valores do nível. */
interface SpecMods {
  hpMul?: number;
  rateMul?: number;
  depletionMul?: number;
  workersAdd?: number;
  storageMul?: number;
  storageAdd?: Partial<Stockpile>;
  housingMul?: number;
  incomeMul?: number;
  territoryAdd?: number;
  /** Multiplica a manutenção total (base + nível). */
  upkeepMul?: number;
  upkeepAdd?: Cost;
  productionTimeMul?: number;
  unitCostMul?: number;
  unitOilMul?: number;
  unitHpMul?: number;
  recruitTimeMul?: number;
  recruitCostMul?: number;
  damageMul?: number;
  rangeAdd?: number;
}

export interface SpecDef {
  id: SpecId;
  label: string;
  summary: string;
  pros: string[];
  /** Custos, efeitos negativos ou oportunidades perdidas — nenhuma especialização é superior em tudo. */
  cons: string[];
  mods: SpecMods;
}

export interface UpgradeTrack {
  maxLevel: number;
  /** Custo em recursos para chegar ao nível 2; os seguintes crescem `costGrowth` por nível. */
  cost: Cost;
  costGrowth: number;
  /** Custo em milhões de US$ (orçamento nacional) do nível 2. */
  usdM: number;
  usdGrowth: number;
  /** Tempo de obra (s) do nível 2. */
  seconds: number;
  timeGrowth: number;
  perLevel: LevelScaling;
  /** Níveis em que a melhoria abre +1 posto de trabalho. */
  workersAt?: number[];
  /** Pesquisa nacional exigida a partir de um nível. */
  techAt?: { level: number; tech: TechId }[];
  /** Estabilidade política mínima a partir de um nível. */
  stabilityAt?: { level: number; min: number };
  /** A partir de `from`, exige um edifício `building` com nível ≥ ⌊nível/2⌋ (logística do produto). */
  storageAt?: { from: number; building: BuildingType };
  specLevel?: number;
  specs?: SpecDef[];
}

// ------------------------------------------------------------------ especializações

const EXTRACTION_SPECS: SpecDef[] = [
  {
    id: 'intensive',
    label: 'Extração intensiva',
    summary: 'Mais produção agora, ao custo de desperdiçar parte do depósito.',
    pros: ['+35% de produção'],
    cons: ['Perdas na lavra: o depósito diminui 25% a mais por unidade extraída (esgota bem antes)'],
    mods: { rateMul: 1.35, depletionMul: 1.25 },
  },
  {
    id: 'efficient',
    label: 'Recuperação eficiente',
    summary: 'Aproveita melhor o depósito, que rende muito mais no total.',
    pros: ['O depósito diminui 30% menos por unidade extraída (rende ~43% mais no total)'],
    cons: ['−10% de produção'],
    mods: { depletionMul: 0.7, rateMul: 0.9 },
  },
  {
    id: 'mechanized',
    label: 'Mecanizada',
    summary: 'Máquinas substituem parte da mão de obra.',
    pros: ['Precisa de 1 trabalhador a menos para a mesma produção (libera um cidadão)'],
    cons: ['Consome +0,08 petróleo/s (combustível das máquinas); sem petróleo, para'],
    mods: { workersAdd: -1, upkeepAdd: { oil: 0.08 } },
  },
];

const STORAGE_SPECS: SpecDef[] = [
  {
    id: 'capacity',
    label: 'Alta capacidade',
    summary: 'Estruturas mais leves e maiores para guardar mais.',
    pros: ['+30% de capacidade'],
    cons: ['−25% de vida (mais vulnerável a ataques; destruído, o excedente se perde)'],
    mods: { storageMul: 1.3, hpMul: 0.75 },
  },
  {
    id: 'hardened',
    label: 'Protegido',
    summary: 'Paredes de concreto armado e diques de proteção.',
    pros: ['+70% de vida'],
    cons: ['−10% de capacidade'],
    mods: { hpMul: 1.7, storageMul: 0.9 },
  },
];

// ------------------------------------------------------------------ trilhas por classe

const GATHER_SCALING: LevelScaling = { rateMul: 0.1, hpMul: 0.06, upkeepSupplies: 0.03 };
const STORAGE_SCALING: LevelScaling = { storageMul: 0.15, hpMul: 0.08, upkeepSupplies: 0.02 };

export const UPGRADES: Partial<Record<BuildingType, UpgradeTrack>> = {
  hq: {
    maxLevel: 10,
    cost: { supplies: 150, wood: 80, stone: 80 },
    costGrowth: 1.3,
    usdM: 12,
    usdGrowth: 1.28,
    seconds: 30,
    timeGrowth: 1.12,
    perLevel: { hpMul: 0.08, incomeMul: 0.12, housing: 4, storageMul: 0.12, territory: 0.5, damageMul: 0.06, rangeAdd: 0.2, sightAdd: 0.5 },
    techAt: [
      { level: 4, tech: 'logistics' },
      { level: 7, tech: 'territorial_administration' },
    ],
    stabilityAt: { level: 9, min: 45 },
    specLevel: 6,
    specs: [
      {
        id: 'admin',
        label: 'Centro administrativo',
        summary: 'Sede de governo civil: projeta mais território e arrecada mais.',
        pros: ['+3 células no raio da fronteira', '+10% de renda de suprimentos'],
        cons: ['−20% de vida (estrutura civil, menos fortificada)', '−10% de armazenagem'],
        mods: { territoryAdd: 3, incomeMul: 1.1, hpMul: 0.8, storageMul: 0.9 },
      },
      {
        id: 'logistics_hub',
        label: 'Centro logístico',
        summary: 'Pátios e depósitos ao redor da sede.',
        pros: ['+40% de armazenagem no QG', '+15% de renda de suprimentos'],
        cons: ['−2 células no raio da fronteira', '−10% de vida'],
        mods: { storageMul: 1.4, incomeMul: 1.15, territoryAdd: -2, hpMul: 0.9 },
      },
      {
        id: 'fortified',
        label: 'QG fortificado',
        summary: 'Casamatas, defesas e blindagem: resiste a cercos.',
        pros: ['+60% de vida', '+50% de dano e +2 de alcance da defesa do QG'],
        cons: ['−15% de renda de suprimentos', '−20% de moradia'],
        mods: { hpMul: 1.6, damageMul: 1.5, rangeAdd: 2, incomeMul: 0.85, housingMul: 0.8 },
      },
    ],
  },
  farm: {
    maxLevel: 10,
    cost: { supplies: 50, wood: 50, stone: 20 },
    costGrowth: 1.28,
    usdM: 3,
    usdGrowth: 1.28,
    seconds: 14,
    timeGrowth: 1.12,
    perLevel: GATHER_SCALING,
    workersAt: [4, 8],
    techAt: [{ level: 5, tech: 'agricultural_mechanization' }],
    storageAt: { from: 4, building: 'silo' },
    specLevel: 6,
    specs: [
      {
        id: 'intensive',
        label: 'Agricultura intensiva',
        summary: 'Fertilizantes, defensivos e manejo intensivo do solo.',
        pros: ['+30% de produção'],
        cons: ['Insumos custam +0,15 suprimento/s de manutenção'],
        mods: { rateMul: 1.3, upkeepAdd: { supplies: 0.15 } },
      },
      {
        id: 'mechanized',
        label: 'Mecanizada',
        summary: 'Colheitadeiras e tratores no lugar de parte da mão de obra.',
        pros: ['Precisa de 2 trabalhadores a menos (libera cidadãos para outras obras)'],
        cons: ['Consome +0,1 petróleo/s; sem petróleo, para'],
        mods: { workersAdd: -2, upkeepAdd: { oil: 0.1 } },
      },
      {
        id: 'granary',
        label: 'Celeiro próprio',
        summary: 'Armazéns de grãos junto à lavoura.',
        pros: ['+300 de capacidade de comida (sem precisar de outro silo)', '+5% de produção'],
        cons: ['Abre mão do ganho de +30% da agricultura intensiva', '+0,05 suprimento/s de manutenção'],
        mods: { storageAdd: { food: 300 }, rateMul: 1.05, upkeepAdd: { supplies: 0.05 } },
      },
    ],
  },
  sawmill: {
    maxLevel: 10,
    cost: { supplies: 60, stone: 40 },
    costGrowth: 1.28,
    usdM: 3.6,
    usdGrowth: 1.28,
    seconds: 14,
    timeGrowth: 1.12,
    perLevel: GATHER_SCALING,
    workersAt: [4, 8],
    techAt: [{ level: 5, tech: 'mechanized_extraction' }],
    storageAt: { from: 4, building: 'warehouse' },
    specLevel: 6,
    specs: EXTRACTION_SPECS,
  },
  quarry: {
    maxLevel: 10,
    cost: { supplies: 60, wood: 50 },
    costGrowth: 1.28,
    usdM: 3.6,
    usdGrowth: 1.28,
    seconds: 15,
    timeGrowth: 1.12,
    perLevel: GATHER_SCALING,
    workersAt: [4, 8],
    techAt: [{ level: 5, tech: 'mechanized_extraction' }],
    storageAt: { from: 4, building: 'warehouse' },
    specLevel: 6,
    specs: EXTRACTION_SPECS,
  },
  mine: {
    maxLevel: 10,
    cost: { supplies: 70, wood: 50, stone: 30 },
    costGrowth: 1.28,
    usdM: 4.4,
    usdGrowth: 1.28,
    seconds: 16,
    timeGrowth: 1.12,
    perLevel: GATHER_SCALING,
    workersAt: [4, 8],
    techAt: [{ level: 5, tech: 'mechanized_extraction' }],
    storageAt: { from: 4, building: 'warehouse' },
    specLevel: 6,
    specs: EXTRACTION_SPECS,
  },
  oil_well: {
    maxLevel: 10,
    cost: { supplies: 80, stone: 50, iron: 30 },
    costGrowth: 1.28,
    usdM: 5,
    usdGrowth: 1.28,
    seconds: 16,
    timeGrowth: 1.12,
    perLevel: GATHER_SCALING,
    workersAt: [4, 8],
    techAt: [{ level: 5, tech: 'advanced_drilling' }],
    storageAt: { from: 4, building: 'oil_tank' },
    specLevel: 6,
    specs: [
      {
        id: 'enhanced',
        label: 'Recuperação avançada',
        summary: 'Injeção de água e gás para manter a pressão do reservatório.',
        pros: ['+35% de produção'],
        cons: ['+0,2 suprimento/s de manutenção', 'O depósito diminui 10% a mais por barril extraído'],
        mods: { rateMul: 1.35, upkeepAdd: { supplies: 0.2 }, depletionMul: 1.1 },
      },
      {
        id: 'conservation',
        label: 'Gestão do reservatório',
        summary: 'Extração controlada para aproveitar mais o campo.',
        pros: ['O depósito diminui 30% menos por barril (rende ~43% mais no total)'],
        cons: ['−15% de produção'],
        mods: { depletionMul: 0.7, rateMul: 0.85 },
      },
      {
        id: 'lean',
        label: 'Operação enxuta',
        summary: 'Automação de válvulas e menos equipes no campo.',
        pros: ['−70% de manutenção', '1 trabalhador a menos'],
        cons: ['−10% de produção'],
        mods: { upkeepMul: 0.3, workersAdd: -1, rateMul: 0.9 },
      },
    ],
  },
  warehouse: {
    maxLevel: 10,
    cost: { wood: 60, stone: 60 },
    costGrowth: 1.28,
    usdM: 2.4,
    usdGrowth: 1.28,
    seconds: 12,
    timeGrowth: 1.1,
    perLevel: STORAGE_SCALING,
    techAt: [{ level: 5, tech: 'logistics' }],
    specLevel: 6,
    specs: STORAGE_SPECS,
  },
  silo: {
    maxLevel: 10,
    cost: { wood: 60, stone: 30 },
    costGrowth: 1.28,
    usdM: 2,
    usdGrowth: 1.28,
    seconds: 10,
    timeGrowth: 1.1,
    perLevel: STORAGE_SCALING,
    techAt: [{ level: 5, tech: 'logistics' }],
    specLevel: 6,
    specs: STORAGE_SPECS,
  },
  oil_tank: {
    maxLevel: 10,
    cost: { stone: 60, iron: 30 },
    costGrowth: 1.28,
    usdM: 3,
    usdGrowth: 1.28,
    seconds: 12,
    timeGrowth: 1.1,
    perLevel: STORAGE_SCALING,
    techAt: [{ level: 5, tech: 'logistics' }],
    specLevel: 6,
    specs: STORAGE_SPECS,
  },
  house: {
    // casa simples: poucas ampliações possíveis (puxadinho e segundo pavimento), sem especialização
    maxLevel: 3,
    cost: { wood: 30, stone: 20 },
    costGrowth: 1.4,
    usdM: 0.8,
    usdGrowth: 1.3,
    seconds: 10,
    timeGrowth: 1.15,
    perLevel: { housing: 3, hpMul: 0.1, upkeepSupplies: 0.02 },
  },
  residential: {
    maxLevel: 10,
    cost: { wood: 80, stone: 80, supplies: 60 },
    costGrowth: 1.28,
    usdM: 5,
    usdGrowth: 1.28,
    seconds: 20,
    timeGrowth: 1.1,
    perLevel: { housing: 4, hpMul: 0.08, upkeepSupplies: 0.05 },
    techAt: [{ level: 5, tech: 'modular_construction' }],
    specLevel: 6,
    specs: [
      {
        id: 'dense',
        label: 'Alta densidade',
        summary: 'Mais apartamentos por andar.',
        pros: ['+30% de moradia'],
        cons: ['+0,25 suprimento/s de manutenção', '−15% de vida'],
        mods: { housingMul: 1.3, upkeepAdd: { supplies: 0.25 }, hpMul: 0.85 },
      },
      {
        id: 'self_sufficient',
        label: 'Condomínio autossuficiente',
        summary: 'Painéis solares, cisternas e hortas comunitárias.',
        pros: ['−60% de manutenção'],
        cons: ['−15% de moradia (áreas comuns no lugar de apartamentos)'],
        mods: { upkeepMul: 0.4, housingMul: 0.85 },
      },
    ],
  },
  barracks: {
    maxLevel: 10,
    cost: { supplies: 100, wood: 60, stone: 40 },
    costGrowth: 1.28,
    usdM: 6,
    usdGrowth: 1.28,
    seconds: 20,
    timeGrowth: 1.1,
    perLevel: { productionTimeMul: -0.04, recruitTimeMul: -0.04, hpMul: 0.08, upkeepSupplies: 0.04 },
    workersAt: [5],
    techAt: [{ level: 5, tech: 'rapid_training' }],
    storageAt: { from: 4, building: 'silo' },
    specLevel: 6,
    specs: [
      {
        id: 'drill',
        label: 'Treinamento intensivo',
        summary: 'Turnos dobrados de instrução.',
        pros: ['−20% no tempo de treino de infantaria e de alistamento'],
        cons: ['+0,25 suprimento/s de manutenção'],
        mods: { productionTimeMul: 0.8, recruitTimeMul: 0.8, upkeepAdd: { supplies: 0.25 } },
      },
      {
        id: 'elite',
        label: 'Escola de elite',
        summary: 'Formação longa e equipamento individual melhor.',
        pros: ['Infantaria formada aqui tem +20% de vida'],
        cons: ['Cada soldado custa +25% e leva +15% de tempo'],
        mods: { unitHpMul: 1.2, unitCostMul: 1.25, productionTimeMul: 1.15 },
      },
      {
        id: 'enlistment',
        label: 'Centro de alistamento',
        summary: 'Postos de recrutamento e triagem rápida.',
        pros: ['Recrutas custam −30% e levam −30% de tempo'],
        cons: ['Treino de infantaria +10% mais lento'],
        mods: { recruitCostMul: 0.7, recruitTimeMul: 0.7, productionTimeMul: 1.1 },
      },
    ],
  },
  factory: {
    maxLevel: 10,
    cost: { supplies: 140, stone: 80, iron: 60 },
    costGrowth: 1.28,
    usdM: 10,
    usdGrowth: 1.28,
    seconds: 25,
    timeGrowth: 1.1,
    perLevel: { productionTimeMul: -0.04, hpMul: 0.08, upkeepSupplies: 0.05 },
    workersAt: [5],
    techAt: [{ level: 5, tech: 'automation' }],
    storageAt: { from: 4, building: 'warehouse' },
    specLevel: 6,
    specs: [
      {
        id: 'volume',
        label: 'Produção em volume',
        summary: 'Linha de montagem em três turnos.',
        pros: ['−25% no tempo de produção de veículos'],
        cons: ['+0,15 petróleo/s e +0,1 suprimento/s de manutenção (energia e turnos extras)'],
        mods: { productionTimeMul: 0.75, upkeepAdd: { oil: 0.15, supplies: 0.1 } },
      },
      {
        id: 'energy',
        label: 'Eficiência energética',
        summary: 'Fornos e prensas modernos, recuperação de calor.',
        pros: ['Veículos gastam −25% de petróleo', '−50% de manutenção'],
        cons: ['Produção +10% mais lenta'],
        mods: { unitOilMul: 0.75, upkeepMul: 0.5, productionTimeMul: 1.1 },
      },
      {
        id: 'advanced',
        label: 'Equipamentos avançados',
        summary: 'Blindagem e componentes de padrão superior.',
        pros: ['Veículos produzidos aqui têm +20% de vida'],
        cons: ['Cada veículo custa +20% e leva +15% de tempo'],
        mods: { unitHpMul: 1.2, unitCostMul: 1.2, productionTimeMul: 1.15 },
      },
    ],
  },
  tower: {
    // torre simples: 5 níveis (plataforma, blindagem, holofotes, radar); sem especialização
    maxLevel: 5,
    cost: { stone: 80, iron: 30 },
    costGrowth: 1.3,
    usdM: 3,
    usdGrowth: 1.3,
    seconds: 14,
    timeGrowth: 1.12,
    perLevel: { damageMul: 0.12, rangeAdd: 0.6, sightAdd: 1, hpMul: 0.1, upkeepSupplies: 0.02, territory: 0.5 },
    techAt: [{ level: 4, tech: 'guided_munitions' }],
  },
  research_center: {
    // laboratórios: o nível 2 libera as pesquisas de segundo escalão e o 3 os blindados de nova
    // geração; cada nível pesquisa 10% mais rápido e o 4 abre mais um posto de pesquisador
    maxLevel: 5,
    cost: { stone: 120, iron: 80, supplies: 80 },
    costGrowth: 1.35,
    usdM: 8,
    usdGrowth: 1.3,
    seconds: 25,
    timeGrowth: 1.15,
    perLevel: { productionTimeMul: -0.1, hpMul: 0.1, upkeepSupplies: 0.03 },
    workersAt: [4],
  },
};

export function upgradeTrack(type: BuildingType): UpgradeTrack | undefined {
  return UPGRADES[type];
}

export function maxLevelOf(type: BuildingType): number {
  return UPGRADES[type]?.maxLevel ?? 1;
}

export function specDef(type: BuildingType, spec: SpecId | null | undefined): SpecDef | undefined {
  if (!spec) return undefined;
  return UPGRADES[type]?.specs?.find((s) => s.id === spec);
}

export function isSpecId(v: unknown): v is SpecId {
  return typeof v === 'string' && (SPEC_IDS as readonly string[]).includes(v);
}

// ------------------------------------------------------------------ efeitos

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const effectsCache = new Map<string, BuildingEffects>();

/**
 * Valores funcionais de um edifício em `level` com `spec`. Pura e memoizada: os mesmos argumentos
 * sempre devolvem o mesmo objeto (congelado). A especialização só vale a partir do nível em que é
 * escolhida.
 */
export function buildingEffects(type: BuildingType, level = 1, spec: SpecId | null = null): BuildingEffects {
  const t = UPGRADES[type];
  const lv = Math.max(1, Math.min(Math.floor(level), t?.maxLevel ?? 1));
  const s = t?.specLevel !== undefined && lv >= t.specLevel ? specDef(type, spec) : undefined;
  const key = `${type}|${lv}|${s?.id ?? ''}`;
  const hit = effectsCache.get(key);
  if (hit) return hit;

  const def = BUILDINGS[type];
  const k = lv - 1;
  const pl = t?.perLevel ?? {};
  const m = s?.mods ?? {};
  const mul = (step: number | undefined) => 1 + (step ?? 0) * k;

  const storageMul = mul(pl.storageMul) * (m.storageMul ?? 1);
  const storage: Partial<Stockpile> = {};
  for (const r of RESOURCE_TYPES) {
    const base = (def.storage[r] ?? 0) * storageMul + (m.storageAdd?.[r] ?? 0);
    if (base > 0) storage[r] = Math.round(base);
  }
  const upkeep: Cost = {};
  const upkeepMul = m.upkeepMul ?? 1;
  for (const r of RESOURCE_TYPES) {
    let v = (def.upkeep[r] ?? 0) + (r === 'supplies' ? (pl.upkeepSupplies ?? 0) * k : 0);
    v = v * upkeepMul + (m.upkeepAdd?.[r] ?? 0);
    if (v > 1e-9) upkeep[r] = round3(v);
  }
  const income: Cost = {};
  const incomeMul = mul(pl.incomeMul) * (m.incomeMul ?? 1);
  for (const r of RESOURCE_TYPES) if ((def.income[r] ?? 0) > 0) income[r] = round3((def.income[r] ?? 0) * incomeMul);
  const extraWorkers = t?.workersAt?.filter((l) => l <= lv).length ?? 0;
  const workers = def.workers > 0 ? Math.max(1, def.workers + extraWorkers + (m.workersAdd ?? 0)) : 0;

  const fx: BuildingEffects = Object.freeze({
    level: lv,
    spec: s?.id ?? null,
    maxHp: Math.round(def.maxHp * mul(pl.hpMul) * (m.hpMul ?? 1)),
    rateMul: round3(mul(pl.rateMul) * (m.rateMul ?? 1)),
    depletionMul: round3(m.depletionMul ?? 1),
    workers,
    storage: Object.freeze(storage),
    housing: def.housing > 0 ? Math.round((def.housing + (pl.housing ?? 0) * k) * (m.housingMul ?? 1)) : 0,
    income: Object.freeze(income),
    territoryRadius: def.territoryRadius > 0 ? Math.max(1, round3(def.territoryRadius + (pl.territory ?? 0) * k + (m.territoryAdd ?? 0))) : 0,
    upkeep: Object.freeze(upkeep),
    productionTimeMul: round3(Math.max(0.3, mul(pl.productionTimeMul)) * (m.productionTimeMul ?? 1)),
    unitCostMul: round3(m.unitCostMul ?? 1),
    unitOilMul: round3(m.unitOilMul ?? 1),
    unitHpMul: round3(m.unitHpMul ?? 1),
    recruitTimeMul: round3(Math.max(0.3, mul(pl.recruitTimeMul)) * (m.recruitTimeMul ?? 1)),
    recruitCostMul: round3(m.recruitCostMul ?? 1),
    damageMul: round3(mul(pl.damageMul) * (m.damageMul ?? 1)),
    rangeAdd: round3((pl.rangeAdd ?? 0) * k + (m.rangeAdd ?? 0)),
    sightAdd: round3((pl.sightAdd ?? 0) * k),
  });
  effectsCache.set(key, fx);
  return fx;
}

/** Custo de uma unidade/recruta com os multiplicadores do edifício (arredondado). */
export function scaledCost(cost: Cost, mul: number, oilMul = 1): Cost {
  const out: Cost = {};
  for (const r of RESOURCE_TYPES) {
    const v = cost[r];
    if (!v) continue;
    out[r] = Math.max(1, Math.round(v * mul * (r === 'oil' ? oilMul : 1)));
  }
  return out;
}

// ------------------------------------------------------------------ custo de cada nível

export interface LevelCost {
  cost: Cost;
  /** US$ (unidades, não milhões). */
  usd: number;
  seconds: number;
}

/** Custo para levar a classe ao nível `toLevel` (2..máximo). */
export function upgradeCost(type: BuildingType, toLevel: number): LevelCost {
  const t = UPGRADES[type];
  if (!t || toLevel < 2 || toLevel > t.maxLevel) return { cost: {}, usd: 0, seconds: 0 };
  const k = toLevel - 2;
  const cost: Cost = {};
  for (const r of RESOURCE_TYPES) {
    const v = t.cost[r];
    if (v) cost[r] = Math.round((v * t.costGrowth ** k) / 5) * 5;
  }
  return {
    cost,
    usd: Math.round(t.usdM * t.usdGrowth ** k * 10) * 100_000,
    seconds: Math.round(t.seconds * t.timeGrowth ** k),
  };
}

/** Soma de tudo o que foi investido para chegar ao nível (útil para relatórios e IA). */
export function investedUpTo(type: BuildingType, level: number): LevelCost {
  const acc: LevelCost = { cost: {}, usd: 0, seconds: 0 };
  for (let l = 2; l <= level; l++) {
    const c = upgradeCost(type, l);
    for (const r of RESOURCE_TYPES) if (c.cost[r]) acc.cost[r] = (acc.cost[r] ?? 0) + c.cost[r]!;
    acc.usd += c.usd;
    acc.seconds += c.seconds;
  }
  return acc;
}

// ------------------------------------------------------------------ plano de melhoria (validação + painel)

/** Estado necessário para avaliar uma melhoria. Campos nacionais `null` = partida sem camada nacional. */
export interface UpgradeWorld {
  resources: Stockpile;
  hqLevel: number;
  /** Maior nível entre edifícios concluídos daquela classe (0 se não houver). */
  bestLevel: (type: BuildingType) => number;
  techs: readonly string[] | null;
  infrastructureIndex: number | null;
  stability: number | null;
  /** Verba de obras disponível (US$); null = sem cobrança em dinheiro. */
  fundsUsd: number | null;
  constructionTimeMul: number;
}

export interface UpgradeSubject {
  type: BuildingType;
  level: number;
  spec: SpecId | null;
  progress: number;
  upgrading: boolean;
}

export interface UpgradeRequirement {
  key: string;
  label: string;
  met: boolean;
}

export interface UpgradeGain {
  key: string;
  label: string;
  before: number;
  after: number;
  /** Como exibir: número simples, percentual da base ou por segundo. */
  unit: '' | '%' | '/s' | 'células';
  /** true se aumentar é bom (para colorir). */
  higherIsBetter: boolean;
}

export interface UpgradePlan {
  type: BuildingType;
  fromLevel: number;
  /** null quando já está no nível máximo (ou a classe não tem melhorias). */
  toLevel: number | null;
  maxLevel: number;
  cost: Cost;
  usd: number;
  seconds: number;
  requirements: UpgradeRequirement[];
  /** Especializações a escolher neste nível (null se este nível não pede escolha). */
  specChoice: SpecDef[] | null;
  /** Primeiro motivo que impede iniciar; null se pode. */
  blocker: string | null;
  gains: UpgradeGain[];
  /** Variação da manutenção por segundo. */
  upkeepDelta: Cost;
  risks: string[];
}


const RES_NAMES: Record<ResourceType, string> = {
  supplies: 'suprimentos',
  food: 'comida',
  wood: 'madeira',
  stone: 'pedra',
  iron: 'ferro',
  oil: 'petróleo',
};

export function formatUsd(usd: number): string {
  const m = usd / 1e6;
  return `US$ ${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace('.', ',')} mi`;
}

/**
 * Avalia a próxima melhoria de um edifício: custo, requisitos (com o que falta), ganhos, custo
 * operacional e riscos. O servidor só aceita o comando se `blocker` for null — o mesmo cálculo
 * que o painel do jogador mostra.
 */
export function planUpgrade(b: UpgradeSubject, world: UpgradeWorld, chosenSpec: SpecId | null = null): UpgradePlan {
  const t = UPGRADES[b.type];
  const maxLevel = t?.maxLevel ?? 1;
  const base: UpgradePlan = {
    type: b.type,
    fromLevel: b.level,
    toLevel: null,
    maxLevel,
    cost: {},
    usd: 0,
    seconds: 0,
    requirements: [],
    specChoice: null,
    blocker: null,
    gains: [],
    upkeepDelta: {},
    risks: [],
  };
  if (!t) return { ...base, blocker: 'Esta construção não tem melhorias' };
  if (b.level >= maxLevel) return { ...base, blocker: `Nível máximo (${maxLevel}) atingido` };

  const to = b.level + 1;
  const lc = upgradeCost(b.type, to);
  const seconds = Math.max(1, Math.round(lc.seconds * world.constructionTimeMul));
  const specChoice = t.specLevel === to && t.specs?.length ? t.specs : null;
  const nextSpec = specChoice ? (chosenSpec && specChoice.some((s) => s.id === chosenSpec) ? chosenSpec : null) : b.spec;

  const req: UpgradeRequirement[] = [];
  if (b.type !== 'hq') req.push({ key: 'hq', label: `Centro de Comando no nível ${to - HQ_LEVEL_LEAD} ou mais`, met: world.hqLevel >= to - HQ_LEVEL_LEAD });
  for (const g of t.techAt ?? []) {
    if (to < g.level) continue;
    req.push({ key: `tech:${g.tech}`, label: `Pesquisa: ${TECHNOLOGIES[g.tech].label}`, met: world.techs === null ? false : world.techs.includes(g.tech) });
  }
  if (t.storageAt && to >= t.storageAt.from) {
    const need = Math.floor(to / 2);
    const have = world.bestLevel(t.storageAt.building);
    req.push({ key: 'storage', label: `${BUILDINGS[t.storageAt.building].label} no nível ${need} ou mais (logística do produto)`, met: have >= need });
  }
  if (to >= INFRA_GATE_LEVEL) {
    req.push({
      key: 'infra',
      label: `Infraestrutura nacional com índice ${INFRA_GATE_MIN.toFixed(2).replace('.', ',')} ou mais (orçamento de infraestrutura)`,
      met: world.infrastructureIndex === null ? false : world.infrastructureIndex >= INFRA_GATE_MIN - 1e-9,
    });
  }
  if (t.stabilityAt && to >= t.stabilityAt.level) {
    req.push({ key: 'stability', label: `Estabilidade política ${t.stabilityAt.min} ou mais`, met: world.stability === null ? false : world.stability >= t.stabilityAt.min });
  }
  const affordable = canAfford(world.resources, lc.cost);
  req.push({ key: 'resources', label: 'Recursos no teatro', met: affordable });
  if (world.fundsUsd !== null) req.push({ key: 'funds', label: `Verba de obras do orçamento nacional (${formatUsd(lc.usd)})`, met: world.fundsUsd >= lc.usd });

  // ganhos esperados: valores do próximo nível contra os atuais
  const now = buildingEffects(b.type, b.level, b.spec);
  const next = buildingEffects(b.type, to, nextSpec);
  const gains = compareEffects(b.type, now, next);
  const upkeepDelta: Cost = {};
  for (const r of RESOURCE_TYPES) {
    const d = round3((next.upkeep[r] ?? 0) - (now.upkeep[r] ?? 0));
    if (Math.abs(d) > 1e-9) upkeepDelta[r] = d;
  }
  const risks = [
    `Durante a obra (${seconds} s) o edifício opera a ${Math.round(UPGRADE_WORK_EFFICIENCY * 100)}% (coleta e produção).`,
    'Se for destruído durante a obra, todo o investimento é perdido.',
    `Cancelar devolve ${Math.round(UPGRADE_CANCEL_REFUND * 100)}% dos recursos e da verba.`,
  ];
  if (next.workers > now.workers)
    risks.push(`Abre ${next.workers - now.workers} posto de trabalho: sem cidadão ocioso, a produção fica proporcional aos postos ocupados.`);
  if (Object.keys(upkeepDelta).some((r) => (upkeepDelta[r as ResourceType] ?? 0) > 0))
    risks.push('A manutenção maior é cobrada sempre; sem saldo, o edifício para.');

  let blocker: string | null = null;
  if (b.progress < 1) blocker = 'Edifício em construção';
  else if (b.upgrading) blocker = 'Já há uma obra de melhoria em andamento';
  else {
    const missing = req.find((r) => !r.met);
    if (missing) {
      blocker =
        missing.key === 'resources'
          ? `Recursos insuficientes: faltam ${missingText(world.resources, lc.cost)}`
          : missing.key === 'funds'
            ? `Verba de obras insuficiente: disponível ${formatUsd(world.fundsUsd ?? 0)} de ${formatUsd(lc.usd)}`
            : `Requisito: ${missing.label}`;
    } else if (specChoice && !nextSpec) blocker = 'Escolha uma especialização para este nível';
  }

  return { ...base, toLevel: to, cost: lc.cost, usd: world.fundsUsd === null ? 0 : lc.usd, seconds, requirements: req, specChoice, blocker, gains, upkeepDelta, risks };
}

export function missingText(have: Stockpile, cost: Cost): string {
  const out: string[] = [];
  for (const r of RESOURCE_TYPES) {
    const need = (cost[r] ?? 0) - have[r];
    if (need > 0) out.push(`${Math.ceil(need)} de ${RES_NAMES[r]}`);
  }
  return out.join(', ');
}

/** Diferenças relevantes entre dois conjuntos de efeitos, com rótulos para o painel. */
export function compareEffects(type: BuildingType, a: BuildingEffects, b: BuildingEffects): UpgradeGain[] {
  const def = BUILDINGS[type];
  const out: UpgradeGain[] = [];
  const add = (key: string, label: string, before: number, after: number, unit: UpgradeGain['unit'], higherIsBetter = true) => {
    if (Math.abs(after - before) > 1e-9) out.push({ key, label, before, after, unit, higherIsBetter });
  };
  if (def.gather) add('rate', 'Produção (em relação à base)', Math.round(a.rateMul * 100), Math.round(b.rateMul * 100), '%');
  if (def.gather) add('depletion', 'Consumo do depósito por unidade', Math.round(a.depletionMul * 100), Math.round(b.depletionMul * 100), '%', false);
  add('workers', 'Postos de trabalho', a.workers, b.workers, '', false);
  for (const r of RESOURCE_TYPES) add(`storage:${r}`, `Capacidade de ${RES_NAMES[r]}`, a.storage[r] ?? 0, b.storage[r] ?? 0, '');
  add('housing', 'Moradia', a.housing, b.housing, '');
  for (const r of RESOURCE_TYPES) add(`income:${r}`, `Renda de ${RES_NAMES[r]}`, a.income[r] ?? 0, b.income[r] ?? 0, '/s');
  add('territory', 'Raio da fronteira', a.territoryRadius, b.territoryRadius, 'células');
  add('hp', 'Vida', a.maxHp, b.maxHp, '');
  if (type === 'barracks' || type === 'factory') {
    add('prodTime', 'Tempo de produção', Math.round(a.productionTimeMul * 100), Math.round(b.productionTimeMul * 100), '%', false);
    add('unitCost', 'Custo das unidades', Math.round(a.unitCostMul * 100), Math.round(b.unitCostMul * 100), '%', false);
    add('unitOil', 'Petróleo por veículo', Math.round(a.unitOilMul * 100), Math.round(b.unitOilMul * 100), '%', false);
    add('unitHp', 'Vida das unidades produzidas', Math.round(a.unitHpMul * 100), Math.round(b.unitHpMul * 100), '%');
  }
  if (type === 'barracks') {
    add('recruitTime', 'Tempo de alistamento', Math.round(a.recruitTimeMul * 100), Math.round(b.recruitTimeMul * 100), '%', false);
    add('recruitCost', 'Custo do recruta', Math.round(a.recruitCostMul * 100), Math.round(b.recruitCostMul * 100), '%', false);
  }
  if (def.weapon) {
    add('damage', 'Dano da defesa', Math.round(def.weapon.damage * a.damageMul * 10) / 10, Math.round(def.weapon.damage * b.damageMul * 10) / 10, '');
    add('range', 'Alcance da defesa', round3(def.weapon.range + a.rangeAdd), round3(def.weapon.range + b.rangeAdd), '');
  }
  add('sight', 'Visão', def.sight + a.sightAdd, def.sight + b.sightAdd, '');
  return out;
}
