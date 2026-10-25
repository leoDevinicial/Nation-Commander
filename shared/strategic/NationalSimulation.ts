import { Random } from '../sim/Random.ts';
import type { SimEvent, Slot } from '../sim/types.ts';
import { COEF, DAYS_PER_YEAR, FALLBACKS, FALLBACK_DEFICIT_PCT, HISTORY_EVERY_DAYS, HISTORY_MAX_POINTS, LIMITS, BASE_INFRASTRUCTURE_PCT, PUBLIC_RESEARCH_SHARE, SCENARIO_START } from './params.ts';
import { countryReference, type ReferenceKey } from './reference.ts';
import { combineEffects, TECH_IDS, TECHNOLOGIES, type TechEffects, type TechId } from './technologies.ts';

export type BalanceMode = 'parity' | 'realistic';

/** Alocação orçamentária anual, em % do PIB. */
export interface Budget {
  taxPct: number;
  defensePct: number;
  educationPct: number;
  healthPct: number;
  infrastructurePct: number;
  researchPct: number;
  /** Previdência, assistência, administração e demais despesas. */
  socialPct: number;
}

export const BUDGET_KEYS = ['taxPct', 'defensePct', 'educationPct', 'healthPct', 'infrastructurePct', 'researchPct', 'socialPct'] as const;

export interface Factor {
  key: string;
  label: string;
  /** Contribuição em pontos (positiva ou negativa). */
  value: number;
}

export interface HistoryPoint {
  day: number;
  gdpUsd: number;
  growthPct: number;
  inflationPct: number;
  unemploymentPct: number;
  debtPctGdp: number;
  approval: number;
}

export interface NationState {
  slot: Slot;
  countryId: string;
  population: number;
  gdpUsd: number;
  realGrowthPct: number;
  trendGrowthPct: number;
  inflationPct: number;
  unemploymentPct: number;
  naturalUnemploymentPct: number;
  debtUsd: number;
  interestRatePct: number;
  budget: Budget;
  referenceBudget: Budget;
  /** Fluxos anuais correntes (US$) — derivados do orçamento e do PIB atuais. */
  revenueUsd: number;
  spendingUsd: number;
  interestUsd: number;
  deficitPctGdp: number;
  infrastructureIndex: number;
  humanCapitalIndex: number;
  approval: number;
  approvalFactors: Factor[];
  stability: number;
  growthFactors: Factor[];
  research: { current: TechId | null; progress: Record<TechId, number>; done: TechId[] };
  /** Suprimentos/s que a logística nacional entrega ao teatro. */
  theaterSupplyPerSec: number;
  casualties30d: number[];
  victories30d: number[];
  /** Campos cujo valor inicial veio de estimativa de jogo por falta de dado confiável. */
  estimatedFields: ReferenceKey[];
  /** Ajuste (p.p. do PIB) somado à receita do governo central para cobrir gastos subnacionais. */
  taxAdjustmentPct: number;
  history: HistoryPoint[];
  /** Linha de base (valores de referência) para medir desvios. */
  base: { inflationPct: number; growthPct: number; taxPct: number; servicesPct: number; totalSpendPct: number; deficitPctGdp: number };
}

export type NationalEvent =
  | { type: 'research_completed'; day: number; slot: Slot; techId: TechId }
  | { type: 'protest'; day: number; slot: Slot; approval: number; causes: Factor[] }
  | { type: 'threshold'; day: number; slot: Slot; indicator: 'debt' | 'inflation' | 'approval' | 'growth'; value: number; threshold: number; direction: 'up' | 'down' }
  | { type: 'budget_changed'; day: number; slot: Slot; deficitPctGdp: number };

/** Simulação nacional de cada jogador, avançando um dia por vez. Determinística dada a seed. */
export class NationalSimulation {
  day = 0;
  readonly nations: NationState[];
  private readonly rng: Random;
  private events: NationalEvent[] = [];

  constructor(
    players: { slot: Slot; countryId: string }[],
    seed: number,
    readonly mode: BalanceMode,
  ) {
    this.rng = new Random(seed ^ 0x5bd1e995);
    this.nations = players.map((p) => createNation(p.slot, p.countryId));
    for (const n of this.nations) {
      this.recompute(n, 0);
      // o déficit inicial faz parte da situação de referência; só desvios pressionam a inflação
      n.base.deficitPctGdp = n.deficitPctGdp;
      this.pushHistory(n);
    }
  }

  nation(slot: Slot): NationState | undefined {
    return this.nations.find((n) => n.slot === slot);
  }

  effects(slot: Slot): TechEffects {
    return combineEffects(this.nation(slot)?.research.done ?? []);
  }

  drainEvents(): NationalEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Data ISO do dia atual do cenário. */
  date(day = this.day): string {
    const d = new Date(`${SCENARIO_START}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + day);
    return d.toISOString().slice(0, 10);
  }

  // ------------------------------------------------------------ comandos

  setBudget(slot: Slot, budget: Budget): string | null {
    const n = this.nation(slot);
    if (!n) return 'Nação inválida';
    const clamped = clampBudget(budget);
    n.budget = clamped;
    this.recompute(n, 0);
    this.events.push({ type: 'budget_changed', day: this.day, slot, deficitPctGdp: round2(n.deficitPctGdp) });
    return null;
  }

  setResearch(slot: Slot, techId: TechId | null): string | null {
    const n = this.nation(slot);
    if (!n) return 'Nação inválida';
    if (techId && n.research.done.includes(techId)) return 'Pesquisa já concluída';
    n.research.current = techId;
    return null;
  }

  /** Contabiliza baixas e vitórias táticas para a opinião pública. */
  registerTacticalEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'destroyed') continue;
      const victim = this.nation(e.owner);
      if (victim && e.entity === 'unit') victim.casualties30d[0] = (victim.casualties30d[0] ?? 0) + 1;
      if (e.killerOwner !== null && e.entity === 'building') {
        const killer = this.nation(e.killerOwner);
        if (killer) killer.victories30d[0] = (killer.victories30d[0] ?? 0) + 1;
      }
    }
  }

  // ------------------------------------------------------------ passo diário

  stepDay(): void {
    this.day++;
    for (const n of this.nations) this.stepNation(n);
  }

  private stepNation(n: NationState): void {
    const dt = 1 / DAYS_PER_YEAR;
    const fx = combineEffects(n.research.done);
    const b = n.budget;
    const debtPct = (n.debtUsd / n.gdpUsd) * 100;
    const totalSpendPct = spendPct(b);

    // --- crescimento real (efeitos anuais em p.p.)
    const growthFactors: Factor[] = [
      { key: 'trend', label: 'Tendência de referência', value: n.trendGrowthPct },
      { key: 'fiscal', label: 'Impulso fiscal (gasto vs. referência)', value: COEF.fiscalMultiplier * (totalSpendPct - n.base.totalSpendPct) },
      { key: 'tax', label: 'Carga tributária vs. referência', value: -COEF.taxDrag * (b.taxPct - n.base.taxPct) },
      { key: 'infra', label: 'Estoque de infraestrutura', value: COEF.infrastructureGrowth * (n.infrastructureIndex - 1) },
      { key: 'education', label: 'Capital humano (educação, com defasagem)', value: COEF.educationGrowth * (n.humanCapitalIndex - 1) },
      { key: 'debt', label: 'Dívida acima de 90% do PIB', value: -COEF.debtDrag * Math.max(0, debtPct - 90) },
      { key: 'stability', label: 'Instabilidade política', value: -COEF.instabilityDrag * Math.max(0, 40 - n.stability) },
      { key: 'tech', label: 'Pesquisas concluídas', value: fx.growthBonus },
    ];
    const prevGrowth = n.realGrowthPct;
    n.realGrowthPct = clamp(sum(growthFactors), -15, 15);
    n.growthFactors = growthFactors.map((f) => ({ ...f, value: round2(f.value) }));

    // --- estoques de longo prazo
    n.infrastructureIndex = clamp(n.infrastructureIndex + COEF.infrastructureAccumulation * (b.infrastructurePct - BASE_INFRASTRUCTURE_PCT) * dt, 0.5, 1.6);
    const eduTarget = b.educationPct / Math.max(0.5, n.referenceBudget.educationPct);
    n.humanCapitalIndex += ((clamp(eduTarget, 0.5, 1.5) - n.humanCapitalIndex) * dt) / COEF.educationLagYears;

    // --- inflação: âncora que converge para 3% + pressão do déficit e do aquecimento
    const years = this.day / DAYS_PER_YEAR;
    const anchor = COEF.inflationAnchor + (n.base.inflationPct - COEF.inflationAnchor) * Math.exp(-years / COEF.disinflationYears);
    const deficitExcess = Math.max(0, n.deficitPctGdp - Math.max(3, n.base.deficitPctGdp));
    const target = anchor + COEF.deficitInflation * deficitExcess + 0.3 * (n.realGrowthPct - n.trendGrowthPct);
    const prevInflation = n.inflationPct;
    n.inflationPct += (target - n.inflationPct) * Math.min(1, COEF.inflationAdjust * dt);

    // --- desemprego (Okun + reversão à taxa de referência)
    n.unemploymentPct = clamp(
      n.unemploymentPct + (-COEF.okun * (n.realGrowthPct - n.trendGrowthPct) + COEF.unemploymentReversion * (n.naturalUnemploymentPct - n.unemploymentPct)) * dt,
      0.5,
      50,
    );

    // --- PIB nominal, contas públicas e dívida
    n.gdpUsd *= 1 + ((n.realGrowthPct + COEF.usdInflation) / 100) * dt;
    this.recompute(n, dt);
    n.debtUsd = Math.max(0, n.debtUsd + (n.spendingUsd + n.interestUsd - n.revenueUsd) * dt);

    // --- opinião pública
    this.updateApproval(n);
    const stabilityTarget = clamp(
      30 + 0.7 * n.approval - Math.min(15, 0.2 * Math.max(0, debtPct - 100)) - Math.min(20, 0.3 * Math.max(0, n.inflationPct - 20)),
      0,
      100,
    );
    n.stability += ((stabilityTarget - n.stability) * 1) / COEF.stabilityDays;

    // --- protesto: risco probabilístico com causas registradas
    if (n.approval < COEF.protestApprovalThreshold) {
      const chance = COEF.protestMaxDailyChance * ((COEF.protestApprovalThreshold - n.approval) / COEF.protestApprovalThreshold);
      if (this.rng.next() < chance) {
        n.approval = Math.max(0, n.approval - 2);
        n.stability = Math.max(0, n.stability - 4);
        const causes = [...n.approvalFactors].filter((f) => f.value < 0).sort((a, c) => a.value - c.value).slice(0, 3);
        this.events.push({ type: 'protest', day: this.day, slot: n.slot, approval: round2(n.approval), causes });
      }
    }

    // --- pesquisa
    const cur = n.research.current;
    if (cur) {
      n.research.progress[cur] = Math.min(1, n.research.progress[cur] + (b.researchPct * dt) / TECHNOLOGIES[cur].cost);
      if (n.research.progress[cur] >= 1) {
        n.research.done.push(cur);
        n.research.current = null;
        this.events.push({ type: 'research_completed', day: this.day, slot: n.slot, techId: cur });
      }
    }

    // --- janelas de 30 dias de baixas/vitórias
    n.casualties30d.unshift(0);
    n.victories30d.unshift(0);
    n.casualties30d.length = Math.min(n.casualties30d.length, 30);
    n.victories30d.length = Math.min(n.victories30d.length, 30);

    // --- limiares (geram eventos uma vez ao cruzar)
    const newDebtPct = (n.debtUsd / n.gdpUsd) * 100;
    this.crossing(n, 'debt', debtPct, newDebtPct, [60, 90, 120]);
    this.crossing(n, 'inflation', prevInflation, n.inflationPct, [10, 25]);
    this.crossing(n, 'growth', prevGrowth, n.realGrowthPct, [0]);

    if (this.day % HISTORY_EVERY_DAYS === 0) this.pushHistory(n);
  }

  private updateApproval(n: NationState): void {
    const services = n.budget.educationPct + n.budget.healthPct + n.budget.socialPct;
    const casualties = sum(n.casualties30d.map((v) => ({ value: v })));
    const victories = sum(n.victories30d.map((v) => ({ value: v })));
    const factors: Factor[] = [
      { key: 'inflation', label: 'Inflação', value: clamp(COEF.approvalInflation * (n.inflationPct - COEF.inflationAnchor), -25, 5) },
      { key: 'unemployment', label: 'Desemprego acima da taxa de referência', value: clamp(COEF.approvalUnemployment * (n.unemploymentPct - n.naturalUnemploymentPct), -20, 8) },
      { key: 'services', label: 'Serviços públicos vs. referência', value: clamp(COEF.approvalServices * (services - n.base.servicesPct), -20, 15) },
      { key: 'tax', label: 'Impostos vs. referência', value: clamp(COEF.approvalTax * (n.budget.taxPct - n.base.taxPct), -20, 15) },
      { key: 'growth', label: 'Crescimento vs. tendência', value: clamp(COEF.approvalGrowth * (n.realGrowthPct - n.trendGrowthPct), -15, 10) },
      { key: 'casualties', label: 'Baixas militares (30 dias)', value: clamp(COEF.approvalCasualties * casualties, -15, 0) },
      { key: 'victories', label: 'Vitórias militares (30 dias)', value: clamp(COEF.approvalVictories * victories, 0, 8) },
    ];
    const target = clamp(COEF.approvalBase + sum(factors), 0, 100);
    const prev = n.approval;
    n.approval += (target - n.approval) / COEF.approvalDays;
    n.approvalFactors = factors.map((f) => ({ ...f, value: round2(f.value) }));
    this.crossing(n, 'approval', prev, n.approval, [30]);
  }

  /** Recalcula fluxos anuais e a logística do teatro a partir do orçamento e do PIB atuais. */
  private recompute(n: NationState, _dt: number): void {
    const b = n.budget;
    const debtPct = (n.debtUsd / n.gdpUsd) * 100;
    n.interestRatePct = interestRate(n.inflationPct, debtPct);
    n.revenueUsd = (b.taxPct / 100) * n.gdpUsd;
    n.spendingUsd = (spendPct(b) / 100) * n.gdpUsd;
    n.interestUsd = (n.interestRatePct / 100) * n.debtUsd;
    n.deficitPctGdp = ((n.spendingUsd + n.interestUsd - n.revenueUsd) / n.gdpUsd) * 100;
    const fx = combineEffects(n.research.done);
    const gdpForTheater = this.mode === 'parity' ? COEF.parityGdpUsd : n.gdpUsd;
    const defenseBn = ((b.defensePct / 100) * gdpForTheater) / 1e9;
    n.theaterSupplyPerSec = COEF.theaterSupplyK * Math.log10(1 + defenseBn) * fx.theaterSupplyMul;
  }

  private crossing(n: NationState, indicator: 'debt' | 'inflation' | 'approval' | 'growth', before: number, after: number, thresholds: number[]): void {
    for (const t of thresholds) {
      if (before < t && after >= t) this.events.push({ type: 'threshold', day: this.day, slot: n.slot, indicator, value: round2(after), threshold: t, direction: 'up' });
      else if (before >= t && after < t) this.events.push({ type: 'threshold', day: this.day, slot: n.slot, indicator, value: round2(after), threshold: t, direction: 'down' });
    }
  }

  private pushHistory(n: NationState): void {
    n.history.push({
      day: this.day,
      gdpUsd: Math.round(n.gdpUsd),
      growthPct: round2(n.realGrowthPct),
      inflationPct: round2(n.inflationPct),
      unemploymentPct: round2(n.unemploymentPct),
      debtPctGdp: round2((n.debtUsd / n.gdpUsd) * 100),
      approval: round2(n.approval),
    });
    if (n.history.length > HISTORY_MAX_POINTS) n.history.shift();
  }
}

// ------------------------------------------------------------ criação a partir dos dados de referência

export function createNation(slot: Slot, countryId: string): NationState {
  const ref = countryReference(countryId);
  const estimated: ReferenceKey[] = [];
  const pick = (key: ReferenceKey, fallback: number): number => {
    const v = ref.values[key].value;
    if (v === null || !Number.isFinite(v)) {
      estimated.push(key);
      return fallback;
    }
    return v;
  };
  // PIB e população são indispensáveis; sem eles usamos uma escala neutra declarada
  const gdpUsd = pick('gdpUsd', 1e12);
  const population = pick('population', 50e6);
  const growth = clamp(pick('gdpGrowthPct', FALLBACKS.gdpGrowthPct), COEF.trendGrowthRange[0], COEF.trendGrowthRange[1]);
  const inflation = pick('inflationPct', FALLBACKS.inflationPct);
  const unemployment = pick('unemploymentPct', FALLBACKS.unemploymentPct);
  const debtPct = pick('govDebtPctGdp', FALLBACKS.govDebtPctGdp);
  const revenuePct = pick('govRevenuePctGdp', FALLBACKS.govRevenuePctGdp);
  const expensePct = pick('govExpensePctGdp', FALLBACKS.govExpensePctGdp);
  const defensePct = pick('militaryPctGdp', FALLBACKS.militaryPctGdp);
  const educationPct = pick('educationPctGdp', FALLBACKS.educationPctGdp);
  const healthPct = pick('healthPctGdp', FALLBACKS.healthPctGdp);
  const researchPct = pick('researchPctGdp', FALLBACKS.researchPctGdp) * PUBLIC_RESEARCH_SHARE;

  // "social" fecha a despesa total de referência (descontados juros estimados e demais rubricas)
  const interestEstimatePct = interestRate(inflation, debtPct) * (debtPct / 100);
  const named = defensePct + educationPct + healthPct + BASE_INFRASTRUCTURE_PCT + researchPct;
  const socialPct = clamp(expensePct - named - interestEstimatePct, 2, 40);
  const modelSpend = named + socialPct + interestEstimatePct;

  // Receita/despesa do WDI cobrem só o governo central, enquanto saúde e educação cobrem todos
  // os níveis de governo. A receita do modelo é ajustada para preservar o déficit observado
  // (despesa − receita do governo central); sem dado de receita, presume-se déficit de 3%.
  let taxPct: number;
  let taxAdjustmentPct = 0;
  if (estimated.includes('govRevenuePctGdp')) {
    taxPct = modelSpend - FALLBACK_DEFICIT_PCT;
  } else {
    const observedDeficit = estimated.includes('govExpensePctGdp') ? FALLBACK_DEFICIT_PCT : expensePct - revenuePct;
    taxPct = modelSpend - observedDeficit;
    taxAdjustmentPct = taxPct - revenuePct;
  }

  const budget = clampBudget({
    taxPct,
    defensePct,
    educationPct,
    healthPct,
    infrastructurePct: BASE_INFRASTRUCTURE_PCT,
    researchPct,
    socialPct,
  });
  const progress = Object.fromEntries(TECH_IDS.map((id) => [id, 0])) as Record<TechId, number>;
  return {
    slot,
    countryId,
    population,
    gdpUsd,
    realGrowthPct: growth,
    trendGrowthPct: growth,
    inflationPct: inflation,
    unemploymentPct: unemployment,
    naturalUnemploymentPct: unemployment,
    debtUsd: (debtPct / 100) * gdpUsd,
    interestRatePct: 0,
    budget,
    referenceBudget: { ...budget },
    revenueUsd: 0,
    spendingUsd: 0,
    interestUsd: 0,
    deficitPctGdp: 0,
    infrastructureIndex: 1,
    humanCapitalIndex: 1,
    approval: COEF.approvalBase,
    approvalFactors: [],
    stability: 60,
    growthFactors: [],
    research: { current: null, progress, done: [] },
    theaterSupplyPerSec: 0,
    casualties30d: [0],
    victories30d: [0],
    estimatedFields: estimated,
    taxAdjustmentPct: round2(taxAdjustmentPct),
    history: [],
    base: {
      inflationPct: inflation,
      growthPct: growth,
      taxPct: budget.taxPct,
      servicesPct: budget.educationPct + budget.healthPct + budget.socialPct,
      totalSpendPct: spendPct(budget),
      deficitPctGdp: 0,
    },
  };
}

/**
 * Juros nominais médios da dívida: base + repasse parcial da inflação (limitado, pois parte da
 * dívida é prefixada/indexada) + prêmio de risco pela dívida acima de 60% do PIB.
 */
export function interestRate(inflationPct: number, debtPct: number): number {
  const r =
    COEF.baseRate +
    COEF.inflationPassThrough * clamp(inflationPct, 0, COEF.inflationPassThroughCap) +
    COEF.riskPremiumPerPoint * Math.max(0, debtPct - 60);
  return Math.min(r, COEF.maxInterestRate);
}

export function clampBudget(b: Budget): Budget {
  return {
    taxPct: clamp(b.taxPct, ...LIMITS.taxPct),
    defensePct: clamp(b.defensePct, ...LIMITS.defensePct),
    educationPct: clamp(b.educationPct, ...LIMITS.categoryPct),
    healthPct: clamp(b.healthPct, ...LIMITS.categoryPct),
    infrastructurePct: clamp(b.infrastructurePct, ...LIMITS.categoryPct),
    researchPct: clamp(b.researchPct, ...LIMITS.researchPct),
    socialPct: clamp(b.socialPct, ...LIMITS.categoryPct),
  };
}

export function spendPct(b: Budget): number {
  return b.defensePct + b.educationPct + b.healthPct + b.infrastructurePct + b.researchPct + b.socialPct;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function sum(fs: { value: number }[]): number {
  return fs.reduce((s, f) => s + f.value, 0);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
