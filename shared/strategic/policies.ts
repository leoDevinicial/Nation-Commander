/**
 * Política interna e externa no estilo Tropico (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 1, §4):
 *
 * - **Decretos** com efeito duplo: ganho no teatro e custo em aprovação, inflação ou estabilidade.
 * - **Facções** (Forças Armadas, Indústria, Agro, Sindicatos, Opinião Pública) com exigências
 *   ligadas ao teatro e prazo. Cumprir rende aprovação e recursos; ignorar baixa a satisfação, e
 *   uma facção insatisfeita protesta e reduz a produtividade no teatro.
 * - **Pedidos das potências** (Tropico 6): uma grande economia conhecida pede algo com prazo
 *   (exportar, não declarar guerra, reforçar a defesa, concluir uma pesquisa). Cumprir melhora a
 *   relação e rende ajuda em US$; falhar ou recusar piora a relação.
 *
 * Tudo é determinístico (sorteios pela seed da simulação nacional) e fica salvo no estado da nação.
 */
import type { BuildingType } from '../sim/config.ts';

// ------------------------------------------------------------------ decretos

export type DecreeId = 'conscription' | 'war_economy' | 'rationing' | 'martial_law';
export const DECREE_IDS: readonly DecreeId[] = ['conscription', 'war_economy', 'rationing', 'martial_law'];
export const isDecreeId = (v: unknown): v is DecreeId => typeof v === 'string' && (DECREE_IDS as readonly string[]).includes(v);

export interface DecreeDef {
  label: string;
  gain: string;
  cost: string;
  /** Pontos de aprovação (fator permanente enquanto vigorar). */
  approval: number;
  /** p.p. somados à inflação-alvo. */
  inflation: number;
  /** Pontos somados à estabilidade-alvo. */
  stability: number;
  /** Multiplicadores no teatro. */
  recruitCostMul: number;
  productionTimeMul: number;
  foodUpkeepMul: number;
  /** Fator na chance diária de protesto. */
  protestMul: number;
  /** Deriva diária da satisfação das facções (pontos/dia) enquanto vigora. */
  factions: Partial<Record<FactionId, number>>;
}

export const DECREES: Record<DecreeId, DecreeDef> = {
  conscription: {
    label: 'Alistamento obrigatório',
    gain: 'Recrutas 40% mais baratos',
    cost: '−4 de aprovação; Opinião Pública insatisfeita',
    approval: -4,
    inflation: 0,
    stability: 0,
    recruitCostMul: 0.6,
    productionTimeMul: 1,
    foodUpkeepMul: 1,
    protestMul: 1,
    factions: { military: 0.4, public: -0.4 },
  },
  war_economy: {
    label: 'Economia de guerra',
    gain: 'Produção militar 20% mais rápida',
    cost: '+1,5 p.p. de inflação; Sindicatos insatisfeitos',
    approval: 0,
    inflation: 1.5,
    stability: 0,
    recruitCostMul: 1,
    productionTimeMul: 0.8,
    foodUpkeepMul: 1,
    protestMul: 1,
    factions: { industry: 0.4, unions: -0.4 },
  },
  rationing: {
    label: 'Racionamento',
    gain: 'Consumo de comida 40% menor',
    cost: '−3 de aprovação; Agro e Opinião Pública insatisfeitos',
    approval: -3,
    inflation: 0,
    stability: 0,
    recruitCostMul: 1,
    productionTimeMul: 1,
    foodUpkeepMul: 0.6,
    protestMul: 1,
    factions: { agro: -0.3, public: -0.3 },
  },
  martial_law: {
    label: 'Lei marcial',
    gain: '+10 de estabilidade e protestos 70% menos prováveis',
    cost: '−6 de aprovação; Sindicatos e Opinião Pública muito insatisfeitos',
    approval: -6,
    inflation: 0,
    stability: 10,
    recruitCostMul: 1,
    productionTimeMul: 1,
    foodUpkeepMul: 1,
    protestMul: 0.3,
    factions: { military: 0.3, unions: -0.5, public: -0.6 },
  },
};

/** Um decreto precisa vigorar pelo menos este tempo antes de ser revogado (dias). */
export const DECREE_MIN_DAYS = 30;

// ------------------------------------------------------------------ facções

export type FactionId = 'military' | 'industry' | 'agro' | 'unions' | 'public';
export const FACTION_IDS: readonly FactionId[] = ['military', 'industry', 'agro', 'unions', 'public'];

/** Estado do teatro que as facções observam (contado pelo servidor; ausente nos testes sem teatro). */
export interface TheaterStats {
  buildings: Partial<Record<BuildingType, number>>;
  military: number;
  workers: number;
  food: number;
  /** Moradias prontas e quantas ficam ligadas à estrada ("bairro pavimentado"). */
  homes?: number;
  pavedHomes?: number;
  /** Minas próprias que sobram no mapa sem guerra em curso. */
  leftoverMines?: number;
}

export type Demand =
  | { kind: 'buildings'; building: BuildingType; count: number }
  | { kind: 'army'; count: number }
  | { kind: 'food'; amount: number }
  | { kind: 'workers'; count: number }
  | { kind: 'casualties_max'; count: number }
  | { kind: 'services' }
  | { kind: 'defense'; pct: number }
  | { kind: 'unemployment'; pct: number };

export interface FactionDef {
  label: string;
  /** Exigências possíveis (a primeira cabível é sorteada entre elas). */
  demands: (ctx: { refDefensePct: number; naturalUnemploymentPct: number }) => Demand[];
  /** Recompensa no teatro ao cumprir. */
  reward: Partial<Record<'supplies' | 'food' | 'wood' | 'stone' | 'iron' | 'oil', number>>;
  /** Efeito no teatro enquanto a facção protesta (satisfação abaixo de 30). */
  unrest: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  military: {
    label: 'Forças Armadas',
    demands: (c) => [
      { kind: 'army', count: 16 },
      { kind: 'buildings', building: 'barracks', count: 2 },
      { kind: 'buildings', building: 'airbase', count: 1 },
      { kind: 'defense', pct: Math.round(c.refDefensePct * 1.25 * 10) / 10 },
    ],
    reward: { supplies: 150, iron: 80 },
    unrest: 'produção militar 10% mais lenta',
  },
  industry: {
    label: 'Indústria',
    demands: () => [
      { kind: 'buildings', building: 'factory', count: 2 },
      { kind: 'buildings', building: 'mine', count: 2 },
      { kind: 'buildings', building: 'market', count: 1 },
    ],
    reward: { iron: 120, oil: 80 },
    unrest: 'coleta 10% menor',
  },
  agro: {
    label: 'Agro',
    demands: () => [
      { kind: 'buildings', building: 'farm', count: 4 },
      { kind: 'buildings', building: 'silo', count: 2 },
      { kind: 'food', amount: 400 },
    ],
    reward: { food: 250, wood: 100 },
    unrest: 'coleta 10% menor',
  },
  unions: {
    label: 'Sindicatos',
    demands: (c) => [
      { kind: 'workers', count: 20 },
      { kind: 'unemployment', pct: Math.round((c.naturalUnemploymentPct + 0.5) * 10) / 10 },
      { kind: 'buildings', building: 'residential', count: 1 },
    ],
    reward: { supplies: 120, stone: 100 },
    unrest: 'coleta 10% menor',
  },
  public: {
    label: 'Opinião Pública',
    demands: () => [{ kind: 'casualties_max', count: 20 }, { kind: 'services' }, { kind: 'buildings', building: 'house', count: 4 }],
    reward: { supplies: 100, food: 100 },
    unrest: '−5 de aprovação',
  },
};

export const FACTION = {
  /** Prazo de cada exigência e intervalo até a próxima (dias). */
  deadlineDays: 90,
  gapDays: 20,
  /** Primeira exigência de cada facção (dias), escalonada. */
  firstDay: 15,
  /** Satisfação: inicial, ganho ao cumprir, perda ao falhar, limiar de protesto e retorno diário a 50. */
  start: 60,
  win: 25,
  loss: 25,
  unrestBelow: 30,
  drift: 0.08,
  /** Aprovação extra (pontos) ao cumprir, decaindo em ~60 dias. */
  favor: 3,
  favorDays: 60,
};

export interface FactionState {
  satisfaction: number;
  demand: { demand: Demand; startDay: number; dueDay: number } | null;
  nextDay: number;
}

// ------------------------------------------------------------------ pedidos das potências

export type PowerRequest =
  | { kind: 'export_usd'; usd: number; baseUsd: number }
  | { kind: 'no_war'; target: number }
  | { kind: 'defense'; pct: number }
  | { kind: 'research'; baseDone: number };

export interface RequestState {
  /** Potência que pede (NPC). */
  from: number;
  request: PowerRequest;
  startDay: number;
  dueDay: number;
}

export const REQUEST = {
  firstDay: 40,
  gapDays: 45,
  deadlineDays: 90,
  /** Meta de exportação do pedido (US$ em 90 dias). */
  exportUsd: 15_000_000,
  /** Recompensa: relação e ajuda (redução da dívida, fração do PIB). */
  relationWin: 12,
  relationLoss: -10,
  relationDecline: -4,
  aidGdpShare: 0.001,
};

// ------------------------------------------------------------------ estado e efeitos

export interface PolicyState {
  decrees: { id: DecreeId; sinceDay: number }[];
  factions: Record<FactionId, FactionState>;
  request: RequestState | null;
  nextRequestDay: number;
  /** Aprovação extra de exigências cumpridas (decai). */
  favor: number;
}

export function createPolicies(): PolicyState {
  const factions = {} as Record<FactionId, FactionState>;
  FACTION_IDS.forEach((id, i) => (factions[id] = { satisfaction: FACTION.start, demand: null, nextDay: FACTION.firstDay + i * 9 }));
  return { decrees: [], factions, request: null, nextRequestDay: REQUEST.firstDay, favor: 0 };
}

export const unrest = (p: PolicyState, id: FactionId): boolean => p.factions[id].satisfaction < FACTION.unrestBelow;

export interface PolicyEffects {
  approval: number;
  inflation: number;
  stability: number;
  protestMul: number;
  recruitCostMul: number;
  productionTimeMul: number;
  foodUpkeepMul: number;
  gatherMul: number;
}

/** Efeitos combinados dos decretos e das facções em protesto (mesma regra no servidor e no HUD). */
export function policyEffects(p: PolicyState | undefined): PolicyEffects {
  const e: PolicyEffects = { approval: 0, inflation: 0, stability: 0, protestMul: 1, recruitCostMul: 1, productionTimeMul: 1, foodUpkeepMul: 1, gatherMul: 1 };
  if (!p) return e;
  for (const { id } of p.decrees) {
    const d = DECREES[id];
    e.approval += d.approval;
    e.inflation += d.inflation;
    e.stability += d.stability;
    e.protestMul *= d.protestMul;
    e.recruitCostMul *= d.recruitCostMul;
    e.productionTimeMul *= d.productionTimeMul;
    e.foodUpkeepMul *= d.foodUpkeepMul;
  }
  if (unrest(p, 'military')) e.productionTimeMul *= 1.1;
  for (const f of ['industry', 'agro', 'unions'] as const) if (unrest(p, f)) e.gatherMul *= 0.9;
  if (unrest(p, 'public')) e.approval -= 5;
  e.approval += p.favor;
  return e;
}

/** Texto curto de uma exigência ou pedido (painel e eventos). */
export function demandText(d: Demand): string {
  switch (d.kind) {
    case 'buildings':
      return `Ter ${d.count} ${BUILDING_PLURAL[d.building] ?? d.building} prontos no teatro`;
    case 'army':
      return `Manter ${d.count} unidades militares no teatro`;
    case 'food':
      return `Ter ${d.amount} de comida em estoque`;
    case 'workers':
      return `Ter ${d.count} cidadãos trabalhando`;
    case 'casualties_max':
      return `Não passar de ${d.count} baixas em 30 dias até o prazo`;
    case 'services':
      return 'Gastar em serviços (educação, saúde, social) pelo menos o de referência';
    case 'defense':
      return `Orçamento de defesa de pelo menos ${String(d.pct).replace('.', ',')}% do PIB`;
    case 'unemployment':
      return `Desemprego até ${String(d.pct).replace('.', ',')}%`;
  }
}

const BUILDING_PLURAL: Partial<Record<BuildingType, string>> = {
  barracks: 'bases militares',
  airbase: 'base aérea',
  factory: 'fábricas de veículos',
  mine: 'minas',
  market: 'terminal comercial',
  farm: 'fazendas',
  silo: 'silos',
  residential: 'prédio residencial',
  house: 'casas',
};

export function requestText(r: PowerRequest, name: (id: number) => string): string {
  switch (r.kind) {
    case 'export_usd':
      return `Exportar US$ ${Math.round(r.usd / 1e6)} mi em mercadorias (comércio internacional)`;
    case 'no_war':
      return `Não declarar guerra a ${name(r.target)}`;
    case 'defense':
      return `Reforçar a defesa para pelo menos ${String(r.pct).replace('.', ',')}% do PIB`;
    case 'research':
      return 'Concluir uma pesquisa nacional';
  }
}
