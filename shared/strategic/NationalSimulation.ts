import { Random } from '../sim/Random.ts';
import type { SimEvent, Slot } from '../sim/types.ts';
import {
  COEF,
  DAYS_PER_YEAR,
  FALLBACKS,
  FALLBACK_DEFICIT_PCT,
  HISTORY_EVERY_DAYS,
  HISTORY_MAX_POINTS,
  LIMITS,
  BASE_INFRASTRUCTURE_PCT,
  PUBLIC_RESEARCH_SHARE,
  SCENARIO_START,
  WORKS_LEDGER_MAX,
  WORKS_SHARE_OF_INFRA,
  WORKS_START_FRACTION,
} from './params.ts';
import { countryReference, type ReferenceKey } from './reference.ts';
import { combineEffects, researchBlocker, researchDailyProgress, TECH_IDS, type TechEffects, type TechId } from './technologies.ts';
import { COUNTRIES } from '../data/countries.ts';
import { DIPLO, Diplomacy, warPreview, type DiplomaticAction, type DiplomaticEvent, type NationId, type RelationView, type Treaty, type WarPreview } from './Diplomacy.ts';
import type { Cost, Stockpile } from '../sim/config.ts';

/**
 * Ligação com o teatro de operações (a simulação tática). A declaração de guerra cobra
 * suprimentos do teatro e só passa a valer no combate através daqui.
 */
export interface TheaterLink {
  resources(slot: Slot): Stockpile | null;
  spend(slot: Slot, cost: Cost): void;
  setWar(a: Slot, b: Slot): void;
}

/** O que um país sabe de outro. `intel` só existe com missão diplomática ativa (ou para si mesmo). */
export interface ForeignView {
  id: NationId;
  countryId: string;
  isPlayer: boolean;
  known: boolean;
  /** Dia previsto para concluir a missão de contato do observador, se houver. */
  contactDueDay: number | null;
  intel: { gdpUsd: number; realGrowthPct: number; approval: number; defensePct: number; debtPctGdp: number } | null;
}

export interface GeopoliticalView {
  /** Todos os demais países do cenário (existem para todos; dados só se houver contato). */
  nations: ForeignView[];
  relations: RelationView[];
  /** Tratados públicos entre países que o observador conhece (ou dos quais participa). */
  treaties: Treaty[];
  /** Missões diplomáticas do observador ("de>para"). */
  missions: string[];
  /** Guerras entre países que o observador conhece. */
  wars: [NationId, NationId][];
}

/** Nações não jogadoras recebem ids a partir deste valor. */
export const NPC_BASE_ID = 100;

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

/**
 * Verba de obras do teatro: parcela do orçamento de infraestrutura que paga as melhorias de
 * construções. Repõe-se diariamente até o teto anual; todo débito e devolução fica no extrato.
 */
export interface WorksFund {
  /** Disponível agora (US$). */
  fundUsd: number;
  /** Teto anual (US$): orçamento de infraestrutura × parcela do teatro. */
  capUsd: number;
  /** Total gasto em obras na partida (US$, líquido de devoluções). */
  spentUsd: number;
  /** Lançamentos mais recentes (dia, valor; negativo = devolução). */
  ledger: { day: number; usd: number; description: string }[];
}

/**
 * Estado da pesquisa nacional (Fase 5). O orçamento de P&D é gasto todo dia (compete com as
 * outras despesas); com um projeto ativo ele vira investimento naquele projeto, sem projeto é
 * gasto sem retorno tecnológico (`idleUsd`). Pausar ou trocar de projeto mantém o progresso e o
 * investido; nada é devolvido.
 */
export interface ResearchState {
  current: TechId | null;
  progress: Record<TechId, number>;
  done: TechId[];
  /** US$ investidos em cada projeto até agora. */
  invested: Record<TechId, number>;
  /** US$ do orçamento de P&D gastos sem projeto ativo. */
  idleUsd: number;
  /** Dia em que cada pesquisa foi concluída. */
  doneDay: Partial<Record<TechId, number>>;
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
  research: ResearchState;
  /** Verba de obras do teatro (melhorias de construções). */
  works: WorksFund;
  /** Comércio internacional (Fase 6): totais acumulados em US$. */
  trade: { exportsUsd: number; importsUsd: number; freightUsd: number };
  /** Suprimentos/s que a logística nacional entrega ao teatro (inclui ajuda de aliados). */
  theaterSupplyPerSec: number;
  /** Parte da logística vinda de aliados por acordos de defesa. */
  allianceAidPerSec: number;
  casualties30d: number[];
  victories30d: number[];
  /** Campos cujo valor inicial veio de estimativa de jogo por falta de dado confiável. */
  estimatedFields: ReferenceKey[];
  /** Ajuste (p.p. do PIB) somado à receita do governo central para cobrir gastos subnacionais. */
  taxAdjustmentPct: number;
  /** Dívida/PIB na data de referência. */
  baseDebtPctGdp: number;
  history: HistoryPoint[];
  /** Linha de base (valores de referência) para medir desvios. */
  base: { inflationPct: number; growthPct: number; taxPct: number; servicesPct: number; totalSpendPct: number; deficitPctGdp: number };
}

export type NationalEvent =
  | { type: 'research_completed'; day: number; slot: Slot; techId: TechId }
  | { type: 'protest'; day: number; slot: Slot; approval: number; causes: Factor[] }
  | { type: 'threshold'; day: number; slot: Slot; indicator: 'debt' | 'inflation' | 'approval' | 'growth'; value: number; threshold: number; direction: 'up' | 'down' }
  | { type: 'budget_changed'; day: number; slot: Slot; deficitPctGdp: number }
  | { type: 'diplomacy'; day: number; event: DiplomaticEvent };

/** Simulação nacional de cada jogador, avançando um dia por vez. Determinística dada a seed. */
export class NationalSimulation {
  day = 0;
  readonly nations: NationState[];
  /** Países fora da partida, governados pela IA, com economia própria e diplomacia. */
  readonly npcs: NationState[];
  readonly diplomacy: Diplomacy;
  private readonly rng: Random;
  private events: NationalEvent[] = [];
  private theater: TheaterLink | null = null;

  constructor(
    players: { slot: Slot; countryId: string }[],
    seed: number,
    readonly mode: BalanceMode,
  ) {
    this.rng = new Random(seed ^ 0x5bd1e995);
    this.nations = players.map((p) => createNation(p.slot, p.countryId));
    const used = new Set(players.map((p) => p.countryId));
    this.npcs = COUNTRIES.filter((c) => !used.has(c.id)).map((c, i) => createNation(NPC_BASE_ID + i, c.id));
    // os jogadores da partida têm forças no mesmo teatro: rivais, mas sem guerra até a declaração
    const theaterPairs: [NationId, NationId][] = [];
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) theaterPairs.push([players[i]!.slot, players[j]!.slot]);
    this.diplomacy = new Diplomacy(() => [...this.nations, ...this.npcs], theaterPairs);
    for (const n of this.npcs) {
      this.recompute(n, 0);
      n.base.deficitPctGdp = n.deficitPctGdp;
    }
    for (const n of this.nations) {
      this.recompute(n, 0);
      // o déficit inicial faz parte da situação de referência; só desvios pressionam a inflação
      n.base.deficitPctGdp = n.deficitPctGdp;
      n.works.fundUsd = Math.round(n.works.capUsd * WORKS_START_FRACTION);
      this.pushHistory(n);
    }
  }

  nation(slot: Slot): NationState | undefined {
    return this.nations.find((n) => n.slot === slot) ?? this.npcs.find((n) => n.slot === slot);
  }

  isNpc(id: NationId): boolean {
    return id >= NPC_BASE_ID;
  }

  attachTheater(link: TheaterLink): void {
    this.theater = link;
  }

  /** Ação diplomática de um jogador (ou da IA de um jogador). */
  diplomaticAction(slot: Slot, action: DiplomaticAction): string | null {
    if (!this.nations.some((n) => n.slot === slot)) return 'Nação inválida';
    if (action.type === 'declare_war') return this.declareWar(slot, action.target);
    const err = this.diplomacy.act(slot, action, this.day, (id) => this.isNpc(id));
    if (!err) for (const n of [...this.nations, ...this.npcs]) this.recompute(n, 0);
    return err;
  }

  /** Consequências previstas de `actor` declarar guerra a `target`, com informação completa. */
  warPreview(actor: Slot, target: NationId): WarPreview {
    const me = this.nation(actor);
    const d = this.diplomacy;
    return warPreview({
      actor,
      target,
      actorGdpUsd: me?.gdpUsd ?? 0,
      actorDebtPctGdp: me ? (me.debtUsd / me.gdpUsd) * 100 : 0,
      theaterStock: this.theater?.resources(actor) ?? null,
      targetInTheater: !!this.nation(target) && d.inTheater(actor, target),
      known: !!this.nation(target) && d.knows(actor, target),
      atWar: d.atWar(actor, target),
      treaties: d.treaties,
      isNpc: (id) => this.isNpc(id),
      relationWith: (id) => d.relation(actor, id),
    });
  }

  /**
   * Declaração formal de guerra. Validada por completo antes de qualquer efeito; se algo
   * impedir (alvo desconhecido, fora do teatro, recursos insuficientes), nada muda. Os custos são
   * cobrados uma única vez.
   */
  declareWar(actor: Slot, target: NationId): string | null {
    const me = this.nation(actor);
    if (!me || this.isNpc(actor)) return 'Nação inválida';
    const preview = this.warPreview(actor, target);
    if (preview.blockers.length) return preview.blockers[0]!;
    this.theater!.spend(actor, { supplies: preview.costs.supplies, oil: preview.costs.oil });
    me.debtUsd += preview.costs.usd;
    me.approval = Math.max(0, me.approval + preview.costs.approval);
    this.diplomacy.applyWar(actor, target, this.day, preview);
    this.theater!.setWar(actor, target);
    for (const n of [...this.nations, ...this.npcs]) this.recompute(n, 0);
    return null;
  }

  /** Visão geopolítica de um país: só o que ele conhece. */
  viewFor(viewer: NationId): GeopoliticalView {
    const d = this.diplomacy;
    const knows = (id: NationId) => d.knows(viewer, id);
    const all = [...this.nations, ...this.npcs];
    return {
      nations: all
        .filter((n) => n.slot !== viewer)
        .map((n) => {
          const known = knows(n.slot);
          const intel = known && d.missions.has(`${viewer}>${n.slot}`);
          return {
            id: n.slot,
            countryId: n.countryId,
            isPlayer: !this.isNpc(n.slot),
            known,
            contactDueDay: d.pendingContacts.get(`${viewer}>${n.slot}`) ?? null,
            intel: intel
              ? {
                  gdpUsd: Math.round(n.gdpUsd),
                  realGrowthPct: round2(n.realGrowthPct),
                  approval: Math.round(n.approval * 10) / 10,
                  defensePct: round2(n.budget.defensePct),
                  debtPctGdp: Math.round((n.debtUsd / n.gdpUsd) * 1000) / 10,
                }
              : null,
          };
        }),
      relations: d.relationsOf(viewer),
      treaties: d.treaties.filter((t) => knows(t.a) && knows(t.b)).map((t) => ({ ...t })),
      missions: [...d.missions].filter((m) => m.startsWith(`${viewer}>`)),
      wars: d.warPairs().filter(([a, b]) => knows(a) && knows(b)),
    };
  }

  /** Eventos que chegam ao conhecimento de `viewer` (os próprios, e os públicos sobre quem ele conhece). */
  eventsFor(viewer: NationId, events: NationalEvent[]): NationalEvent[] {
    const knows = (id: NationId) => this.diplomacy.knows(viewer, id);
    return events.filter((e) => {
      if (e.type === 'protest') return knows(e.slot);
      if (e.type !== 'diplomacy') return e.slot === viewer;
      const ev = e.event;
      switch (ev.type) {
        case 'discovered':
          return ev.by === viewer;
        case 'contact_started':
          return ev.from === viewer || ev.to === viewer;
        case 'proposal_rejected':
          return ev.from === viewer || ev.to === viewer;
        case 'treaty_signed':
        case 'treaty_ended':
          return knows(ev.treaty.a) && knows(ev.treaty.b);
        case 'aid_sent':
          return knows(ev.from) && knows(ev.to);
        case 'war_declared':
          return knows(ev.by) && knows(ev.target);
      }
    });
  }

  // ------------------------------------------------------------ verba de obras do teatro

  /** Debita uma obra da verba do país. Recusa (false) sem saldo — nada é cobrado. */
  chargeWorks(slot: Slot, usd: number, description: string): boolean {
    const n = this.nations.find((x) => x.slot === slot);
    if (!n || usd < 0 || n.works.fundUsd + 1e-6 < usd) return false;
    n.works.fundUsd -= usd;
    n.works.spentUsd += usd;
    this.ledger(n, usd, description);
    return true;
  }

  /** Devolução (obra cancelada): volta à verba, sem passar do teto anual. */
  refundWorks(slot: Slot, usd: number, description: string): void {
    const n = this.nations.find((x) => x.slot === slot);
    if (!n || usd <= 0) return;
    n.works.fundUsd = Math.min(n.works.capUsd, n.works.fundUsd + usd);
    n.works.spentUsd = Math.max(0, n.works.spentUsd - usd);
    this.ledger(n, -usd, description);
  }

  private ledger(n: NationState, usd: number, description: string): void {
    n.works.ledger.push({ day: this.day, usd: Math.round(usd), description });
    if (n.works.ledger.length > WORKS_LEDGER_MAX) n.works.ledger.shift();
  }

  effects(slot: Slot): TechEffects {
    return combineEffects(this.nation(slot)?.research.done ?? []);
  }

  /**
   * Lançamento de comércio no tesouro (Fase 6): receita de exportação reduz a dívida; importação e
   * frete a aumentam. `kind` separa os totais para o painel.
   */
  tradePayment(slot: Slot, usd: number, kind: 'export' | 'import' | 'freight'): void {
    const n = this.nations.find((x) => x.slot === slot);
    if (!n) return;
    n.debtUsd = Math.max(0, n.debtUsd - usd);
    if (kind === 'export') n.trade.exportsUsd += usd;
    else if (kind === 'import') n.trade.importsUsd -= usd;
    else n.trade.freightUsd -= usd;
  }

  /** Estado de pesquisa de todas as nações (JSON) — parte do salvar/carregar da partida. */
  saveResearch(): Record<number, ResearchState> {
    const out: Record<number, ResearchState> = {};
    for (const n of [...this.nations, ...this.npcs]) out[n.slot] = JSON.parse(JSON.stringify(n.research)) as ResearchState;
    return out;
  }

  /** Restaura o estado de pesquisa salvo (nações ausentes no salvamento ficam como estão). */
  loadResearch(saved: Record<number, ResearchState>): void {
    for (const n of [...this.nations, ...this.npcs]) {
      const r = saved[n.slot];
      if (!r) continue;
      n.research = JSON.parse(JSON.stringify(r)) as ResearchState;
      // salvamentos antigos (antes da Fase 5) não tinham investimento nem data de conclusão
      n.research.invested ??= Object.fromEntries(TECH_IDS.map((id) => [id, 0])) as Record<TechId, number>;
      n.research.idleUsd ??= 0;
      n.research.doneDay ??= {};
      for (const id of TECH_IDS) {
        n.research.progress[id] ??= 0;
        n.research.invested[id] ??= 0;
      }
      this.recompute(n, 0);
    }
  }

  drainEvents(): NationalEvent[] {
    for (const ev of this.diplomacy.drainEvents()) this.events.push({ type: 'diplomacy', day: this.day, event: ev });
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
    if (techId) {
      const blocker = researchBlocker(techId, n.research.done);
      if (blocker) return blocker;
    }
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
    this.diplomacy.stepDay(this.day);
    for (const n of this.nations) this.stepNation(n);
    for (const n of this.npcs) this.stepNation(n);
  }

  private stepNation(n: NationState): void {
    const dt = 1 / DAYS_PER_YEAR;
    const fx = combineEffects(n.research.done);
    const b = n.budget;
    const debtPct = (n.debtUsd / n.gdpUsd) * 100;
    const totalSpendPct = spendPct(b);
    const diplo = this.diplomacy.growthEffects(n.slot);

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
      { key: 'trade', label: 'Acordos comerciais', value: diplo.trade },
      { key: 'sanctions', label: 'Sanções (sofridas e aplicadas)', value: diplo.sanctions },
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
    // --- verba de obras do teatro: repõe 1/365 do teto anual por dia, até o teto
    n.works.fundUsd = Math.min(n.works.capUsd, n.works.fundUsd + n.works.capUsd / DAYS_PER_YEAR);
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
    const rdUsd = (b.researchPct / 100) * n.gdpUsd * dt;
    if (cur) {
      // a verba do dia vira investimento no projeto; o avanço respeita a duração mínima
      n.research.invested[cur] = (n.research.invested[cur] ?? 0) + rdUsd;
      n.research.progress[cur] = Math.min(1, n.research.progress[cur] + researchDailyProgress(cur, b.researchPct, DAYS_PER_YEAR).perDay);
      if (n.research.progress[cur] >= 1 - 1e-9) {
        n.research.progress[cur] = 1;
        n.research.done.push(cur);
        n.research.doneDay[cur] = this.day;
        n.research.current = null;
        this.events.push({ type: 'research_completed', day: this.day, slot: n.slot, techId: cur });
      }
    } else {
      n.research.idleUsd += rdUsd;
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
      { key: 'sanctions', label: 'Sanções internacionais contra o país', value: Math.max(-10, DIPLO.sanctionsApproval * this.diplomacy.sanctionsAgainst(n.slot)) },
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
    n.interestRatePct = interestRate(n.inflationPct, debtPct, n.baseDebtPctGdp);
    n.revenueUsd = (b.taxPct / 100) * n.gdpUsd;
    n.spendingUsd = ((spendPct(b) + this.diplomacy.costPct(n.slot)) / 100) * n.gdpUsd;
    n.interestUsd = (n.interestRatePct / 100) * n.debtUsd;
    n.deficitPctGdp = ((n.spendingUsd + n.interestUsd - n.revenueUsd) / n.gdpUsd) * 100;
    const fx = combineEffects(n.research.done);
    const gdpFor = (x: NationState) => (this.mode === 'parity' ? COEF.parityGdpUsd : x.gdpUsd);
    const defenseBn = ((b.defensePct / 100) * gdpFor(n)) / 1e9;
    // teto anual da verba de obras: segue o orçamento de infraestrutura (e o PIB) atuais
    n.works.capUsd = Math.round((b.infrastructurePct / 100) * gdpFor(n) * WORKS_SHARE_OF_INFRA);
    if (n.works.fundUsd > n.works.capUsd) n.works.fundUsd = n.works.capUsd;
    n.allianceAidPerSec = this.diplomacy.allianceAid(n.slot, gdpFor);
    n.theaterSupplyPerSec = COEF.theaterSupplyK * Math.log10(1 + defenseBn) * fx.theaterSupplyMul + n.allianceAidPerSec;
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
  const interestEstimatePct = interestRate(inflation, debtPct, debtPct) * (debtPct / 100);
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
    // saldo do governo geral (FMI) quando houver; senão despesa − receita
    const balance = countryReference(countryId).values.govBalancePctGdp.value;
    const observedDeficit = balance !== null ? -balance : estimated.includes('govExpensePctGdp') ? FALLBACK_DEFICIT_PCT : expensePct - revenuePct;
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
    trade: { exportsUsd: 0, importsUsd: 0, freightUsd: 0 },
    research: { current: null, progress, done: [], invested: Object.fromEntries(TECH_IDS.map((id) => [id, 0])) as Record<TechId, number>, idleUsd: 0, doneDay: {} },
    works: { fundUsd: 0, capUsd: 0, spentUsd: 0, ledger: [] },
    theaterSupplyPerSec: 0,
    allianceAidPerSec: 0,
    casualties30d: [0],
    victories30d: [0],
    estimatedFields: estimated,
    taxAdjustmentPct: round2(taxAdjustmentPct),
    baseDebtPctGdp: debtPct,
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
 * Juros nominais médios da dívida (hipótese de jogo): base + repasse parcial da inflação (limitado,
 * pois parte da dívida é prefixada/indexada) + prêmio de risco pelo endividamento adicional.
 */
export function interestRate(inflationPct: number, debtPct: number, baseDebtPct: number): number {
  // o mercado já precifica a dívida inicial: o prêmio incide só sobre o aumento acima dela (e de 60%)
  const r =
    COEF.baseRate +
    COEF.inflationPassThrough * clamp(inflationPct, 0, COEF.inflationPassThroughCap) +
    COEF.riskPremiumPerPoint * Math.max(0, debtPct - Math.max(60, baseDebtPct));
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
