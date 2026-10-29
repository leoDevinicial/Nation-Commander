import { Random } from '../sim/Random.ts';
import { decodeNonFinite, encodeNonFinite } from '../sim/json.ts';
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
  NUCLEAR_SHOCK,
  ROAD_APPROVAL,
  theaterSupply,
} from './params.ts';
import { countryReference, type ReferenceKey } from './reference.ts';
import { combineEffects, researchBlocker, researchDailyProgress, TECH_IDS, type TechEffects, type TechId } from './technologies.ts';
import { COUNTRIES } from '../data/countries.ts';
import { DIPLO, Diplomacy, warPreview, type DiplomacySave, type DiplomaticAction, type DiplomaticEvent, type NationId, type RelationView, type Treaty, type WarPreview } from './Diplomacy.ts';
import { BUILDINGS, PROJECT_FX, SERVICES, type BuildingType, type Cost, type Stockpile } from '../sim/config.ts';
import {
  DECREE_MIN_DAYS,
  DECREES,
  FACTION,
  FACTION_IDS,
  FACTIONS,
  REQUEST,
  createPolicies,
  demandText,
  policyEffects,
  requestText,
  type DecreeId,
  type Demand,
  type PolicyState,
  type PowerRequest,
  type RequestState,
  type TheaterStats,
} from './policies.ts';

/**
 * Ligação com o teatro de operações (a simulação tática). A declaração de guerra cobra
 * suprimentos do teatro e só passa a valer no combate através daqui.
 */
export interface TheaterLink {
  resources(slot: Slot): Stockpile | null;
  spend(slot: Slot, cost: Cost): void;
  setWar(a: Slot, b: Slot): void;
  /** O que as facções observam no teatro (edifícios prontos, tropas, trabalhadores, comida). */
  stats?(slot: Slot): TheaterStats | null;
  /** Recompensa de uma facção entregue no teatro (limitada pela capacidade de armazenamento). */
  grant?(slot: Slot, cost: Cost): void;
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
  /** Países com satélite em órbita (públicos: aparecem orbitando o globo). */
  satellites?: NationId[];
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
  /** Decretos, facções e pedidos das potências (ausente em salvamentos antigos). */
  policies?: PolicyState;
  /** Grandes Projetos Nacionais prontos no teatro (atualizado todo dia). */
  projects?: BuildingType[];
  /** Linha de base (valores de referência) para medir desvios. */
  base: { inflationPct: number; growthPct: number; taxPct: number; servicesPct: number; totalSpendPct: number; deficitPctGdp: number };
}

export type NationalEvent =
  | { type: 'research_completed'; day: number; slot: Slot; techId: TechId }
  | { type: 'protest'; day: number; slot: Slot; approval: number; causes: Factor[] }
  | { type: 'threshold'; day: number; slot: Slot; indicator: 'debt' | 'inflation' | 'approval' | 'growth'; value: number; threshold: number; direction: 'up' | 'down' }
  | { type: 'budget_changed'; day: number; slot: Slot; deficitPctGdp: number }
  /** Ataque aéreo ou de míssil registrado (Fase 7): custo, dano, petróleo perdido e alvo. */
  /** Operação expedicionária concluída (Fase 8): resultado reconciliado uma única vez. */
  | {
      type: 'operation';
      day: number;
      slot: Slot;
      target: NationId;
      sector: string;
      outcome: 'victory' | 'defeat' | 'retreat' | 'stalemate';
      sent: number;
      lost: number;
      enemyLost: number;
      usd: number;
      occupied: boolean;
    }
  /** Decretos, exigências das facções e pedidos das potências. */
  | { type: 'policy'; day: number; slot: Slot; text: string; tone: 'good' | 'bad' | 'info' }
  /** Satélite posto em órbita pelo Programa Espacial (todas as nações sabem). */
  | { type: 'satellite'; day: number; slot: Slot }
  /** Lançamento nuclear: choque econômico global (todas as nações sabem). */
  | { type: 'nuclear_shock'; day: number; slot: Slot; victim: Slot; level: number }
  | { type: 'military_strike'; day: number; slot: Slot; victim: Slot; kind: 'air' | 'missile'; target: string; damage: number; oilLost: number; destroyed: number; intercepted: boolean }
  | { type: 'diplomacy'; day: number; event: DiplomaticEvent };

export interface NationalSave {
  day: number;
  rng: number;
  /** Lançamentos nucleares (choque econômico global). */
  shocks?: { day: number; by: number }[];
  satellites?: number[];
  nations: NationState[];
  npcs: NationState[];
  events: NationalEvent[];
  diplomacy: DiplomacySave;
}

/** Simulação nacional de cada jogador, avançando um dia por vez. Determinística dada a seed. */
/** Fração da produção de uma região ocupada que o país perde (choque único no PIB). */
export const OCCUPATION_GDP_LOSS = 0.3;

export class NationalSimulation {
  day = 0;
  readonly nations: NationState[];
  /** Países fora da partida, governados pela IA, com economia própria e diplomacia. */
  readonly npcs: NationState[];
  readonly diplomacy: Diplomacy;
  private readonly rng: Random;
  private events: NationalEvent[] = [];
  private theater: TheaterLink | null = null;
  /** Lançamentos nucleares da partida (dia e autor). */
  shocks: { day: number; by: number }[] = [];
  /** Nações com satélite em órbita. */
  satellites: number[] = [];
  /** Facções e pedidos das potências ativos (desligados no Sandbox). */
  policiesActive = true;

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

  /** Estado completo (JSON) para salvar a partida; o vínculo com o teatro é refeito por quem carrega. */
  toSave(): NationalSave {
    return JSON.parse(
      JSON.stringify(
        {
          day: this.day,
          rng: this.rng.seedState,
          nations: this.nations,
          npcs: this.npcs,
          events: this.events,
          diplomacy: this.diplomacy.toSave(),
          ...(this.shocks.length ? { shocks: this.shocks } : {}),
          ...(this.satellites.length ? { satellites: this.satellites } : {}),
        },
        encodeNonFinite,
      ),
      decodeNonFinite,
    ) as NationalSave;
  }

  /** Aplica um estado salvo sobre uma simulação criada com os mesmos jogadores, seed e regra. */
  load(s: NationalSave): void {
    const c = JSON.parse(JSON.stringify(s, encodeNonFinite), decodeNonFinite) as NationalSave;
    this.day = c.day;
    (this as unknown as { rng: Random }).rng = new Random(c.rng);
    // os vetores são os mesmos objetos vistos pela diplomacia: troca o conteúdo, não a referência
    this.nations.splice(0, this.nations.length, ...c.nations);
    this.npcs.splice(0, this.npcs.length, ...c.npcs);
    this.events = c.events;
    this.shocks = c.shocks ?? [];
    this.satellites = c.satellites ?? [];
    this.diplomacy.load(c.diplomacy);
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
      ...(this.satellites.length ? { satellites: [...this.satellites] } : {}),
    };
  }

  /** Eventos que chegam ao conhecimento de `viewer` (os próprios, e os públicos sobre quem ele conhece). */
  eventsFor(viewer: NationId, events: NationalEvent[]): NationalEvent[] {
    const knows = (id: NationId) => this.diplomacy.knows(viewer, id);
    return events.filter((e) => {
      if (e.type === 'protest') return knows(e.slot);
      if (e.type === 'operation') return e.slot === viewer || e.target === viewer || (knows(e.slot) && knows(e.target));
      if (e.type === 'military_strike') return e.slot === viewer || e.victim === viewer || (knows(e.slot) && knows(e.victim));
      if (e.type === 'nuclear_shock' || e.type === 'satellite') return true;
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

  // ------------------------------------------------------------ operações (Fase 8)

  /** Gasto militar extraordinário (operação expedicionária): financiado por dívida, como a mobilização. */
  militarySpend(slot: Slot, usd: number): void {
    const n = this.nation(slot);
    if (n && usd > 0) n.debtUsd += usd;
  }

  /** Baixas de uma operação contam na opinião pública como as do teatro. */
  registerCasualties(slot: Slot, count: number): void {
    const n = this.nation(slot);
    if (n && count > 0) n.casualties30d[0] = (n.casualties30d[0] ?? 0) + count;
  }

  /** Orçamento anual de defesa (US$) — base do tamanho das guarnições dos governos da IA. */
  defenseBudgetUsd(id: NationId): number {
    const n = this.nation(id);
    return n ? (n.budget.defensePct / 100) * n.gdpUsd : 0;
  }

  /**
   * Ocupação de uma região: o país atingido perde parte da produção da região (choque único no
   * PIB) e o ocupante paga em reputação. Retorna a perda de PIB (US$).
   */
  applyOccupation(actor: Slot, target: NationId, share: number): number {
    const t = this.nation(target);
    if (!t) return 0;
    const loss = t.gdpUsd * share * OCCUPATION_GDP_LOSS;
    t.gdpUsd -= loss;
    this.diplomacy.recordAttack(actor, target, 'occupation');
    this.recompute(t, 0);
    return loss;
  }

  pushEvent(e: NationalEvent): void {
    this.events.push(e);
  }

  /**
   * Lançamento nuclear: choque econômico global para todas as nações (inclusive quem lançou) e
   * perda enorme de reputação. O efeito decai em ~90 dias; lançamentos seguidos se somam.
   */
  nuclearShock(by: Slot, victim: Slot): void {
    this.shocks.push({ day: this.day, by });
    this.diplomacy.recordAttack(by, victim, 'nuclear');
    this.events.push({ type: 'nuclear_shock', day: this.day, slot: by, victim, level: round2(this.shockLevel()) });
    for (const n of [...this.nations, ...this.npcs]) this.recompute(n, 0);
  }

  /** Intensidade atual do choque nuclear global (0 = nenhum; 1 = um lançamento recente). */
  shockLevel(day = this.day): number {
    let s = 0;
    for (const x of this.shocks) if (day >= x.day) s += Math.exp(-(day - x.day) / NUCLEAR_SHOCK.decayDays);
    return Math.min(NUCLEAR_SHOCK.maxLevel, s);
  }

  /** Multiplicador da renda no teatro sob o choque nuclear (coleta e logística). */
  shockTheaterMul(): number {
    return Math.max(0.2, 1 - NUCLEAR_SHOCK.theaterMul * this.shockLevel());
  }

  /** Contabiliza baixas e vitórias táticas para a opinião pública e registra ataques estratégicos. */
  registerTacticalEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'aircraft_lost') {
        const n = this.nation(e.owner);
        if (n) n.casualties30d[0] = (n.casualties30d[0] ?? 0) + 1;
        continue;
      }
      if (e.type === 'air_strike') {
        this.diplomacy.recordAttack(e.owner, e.victim, 'air');
        this.events.push({
          type: 'military_strike',
          day: this.day,
          slot: e.owner,
          victim: e.victim,
          kind: 'air',
          target: e.buildingType,
          damage: e.damage,
          oilLost: e.oilLost,
          destroyed: e.destroyed ? 1 : 0,
          intercepted: false,
        });
        continue;
      }
      if (e.type === 'space' && e.state === 'orbit') {
        if (!this.satellites.includes(e.owner)) this.satellites.push(e.owner);
        const n = this.nation(e.owner);
        // orgulho nacional: aprovação extra que decai como a das facções
        if (n?.policies) n.policies.favor = Math.min(10, n.policies.favor + 5);
        this.events.push({ type: 'satellite', day: this.day, slot: e.owner });
        continue;
      }
      if (e.type === 'missile' && e.nuclear && e.state === 'flight') {
        this.nuclearShock(e.owner, e.targetOwner);
        continue;
      }
      if (e.type === 'missile' && (e.state === 'impact' || e.state === 'intercepted')) {
        // o lançamento custa reputação mesmo interceptado
        this.diplomacy.recordAttack(e.owner, e.targetOwner, 'missile');
        this.events.push({
          type: 'military_strike',
          day: this.day,
          slot: e.owner,
          victim: e.targetOwner,
          kind: 'missile',
          target: 'área',
          damage: e.damage ?? 0,
          oilLost: 0,
          destroyed: e.destroyed ?? 0,
          intercepted: e.state === 'intercepted',
        });
        continue;
      }
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
    const shock = this.shockLevel();
    if (shock > 0.01) growthFactors.push({ key: 'nuclear', label: 'Choque global de lançamento nuclear', value: -NUCLEAR_SHOCK.growth * shock });
    // Grandes Projetos Nacionais prontos no teatro
    if (!this.isNpc(n.slot)) {
      const stats = this.theater?.stats?.(n.slot);
      if (stats) n.projects = (Object.keys(stats.buildings) as BuildingType[]).filter((t) => BUILDINGS[t].project && (stats.buildings[t] ?? 0) > 0);
      const g = (n.projects ?? []).reduce((s, t) => s + (BUILDINGS[t].project?.growth ?? 0), 0);
      if (g > 0) growthFactors.push({ key: 'projects', label: 'Grandes Projetos Nacionais', value: g });
    }
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
    const pol = policyEffects(n.policies);
    const target = anchor + COEF.deficitInflation * deficitExcess + 0.3 * (n.realGrowthPct - n.trendGrowthPct) + pol.inflation + NUCLEAR_SHOCK.inflation * shock;
    const prevInflation = n.inflationPct;
    n.inflationPct += (target - n.inflationPct) * Math.min(1, COEF.inflationAdjust * dt);

    // --- desemprego (Okun + reversão à taxa de referência)
    n.unemploymentPct = clamp(n.unemploymentPct + (-COEF.okun * (n.realGrowthPct - n.trendGrowthPct) + COEF.unemploymentReversion * (n.naturalUnemploymentPct - n.unemploymentPct)) * dt, 0.5, 50);

    // --- PIB nominal, contas públicas e dívida
    n.gdpUsd *= 1 + ((n.realGrowthPct + COEF.usdInflation) / 100) * dt;
    this.recompute(n, dt);
    // --- verba de obras do teatro: repõe 1/365 do teto anual por dia, até o teto
    n.works.fundUsd = Math.min(n.works.capUsd, n.works.fundUsd + n.works.capUsd / DAYS_PER_YEAR);
    n.debtUsd = Math.max(0, n.debtUsd + (n.spendingUsd + n.interestUsd - n.revenueUsd) * dt);

    // --- opinião pública
    this.updateApproval(n);
    const stabilityTarget = clamp(30 + pol.stability + 0.7 * n.approval - Math.min(15, 0.2 * Math.max(0, debtPct - 100)) - Math.min(20, 0.3 * Math.max(0, n.inflationPct - 20)), 0, 100);
    n.stability += ((stabilityTarget - n.stability) * 1) / COEF.stabilityDays;

    // --- protesto: risco probabilístico com causas registradas
    if (n.approval < COEF.protestApprovalThreshold) {
      const chance = COEF.protestMaxDailyChance * ((COEF.protestApprovalThreshold - n.approval) / COEF.protestApprovalThreshold) * pol.protestMul;
      if (this.rng.next() < chance) {
        // delegacias cobrindo os bairros: protestos pesam até metade na estabilidade
        const policed = 1 - 0.5 * (this.theater?.stats?.(n.slot)?.services?.security ?? 0);
        n.approval = Math.max(0, n.approval - 2);
        n.stability = Math.max(0, n.stability - 4 * policed);
        const causes = [...n.approvalFactors]
          .filter((f) => f.value < 0)
          .sort((a, c) => a.value - c.value)
          .slice(0, 3);
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
    if (!this.isNpc(n.slot) && this.policiesActive) this.stepPolicies(n);
  }

  // ------------------------------------------------------------ decretos, facções e pedidos

  /** Decreta ou revoga. Revogar exige o tempo mínimo de vigência. */
  setDecree(slot: Slot, id: DecreeId, active: boolean): string | null {
    const n = this.nations.find((x) => x.slot === slot);
    if (!n) return 'Nação inválida';
    const p = (n.policies ??= createPolicies());
    const cur = p.decrees.find((d) => d.id === id);
    if (active) {
      if (cur) return 'Decreto já em vigor';
      p.decrees.push({ id, sinceDay: this.day });
      this.events.push({ type: 'policy', day: this.day, slot, text: `Decreto em vigor: ${DECREES[id].label} — ${DECREES[id].gain}; ${DECREES[id].cost}`, tone: 'info' });
    } else {
      if (!cur) return 'Decreto não está em vigor';
      const left = DECREE_MIN_DAYS - (this.day - cur.sinceDay);
      if (left > 0) return `O decreto precisa vigorar mais ${left} dias antes de ser revogado`;
      p.decrees = p.decrees.filter((d) => d.id !== id);
      this.events.push({ type: 'policy', day: this.day, slot, text: `Decreto revogado: ${DECREES[id].label}`, tone: 'info' });
    }
    return null;
  }

  /** Recusa o pedido de uma potência (custa relação) ou confirma que vai cumprir. */
  respondRequest(slot: Slot, accept: boolean): string | null {
    const n = this.nations.find((x) => x.slot === slot);
    const r = n?.policies?.request;
    if (!n || !r) return 'Nenhum pedido em aberto';
    if (accept) return null;
    this.diplomacy.adjustRelation(slot, r.from, REQUEST.relationDecline);
    this.events.push({ type: 'policy', day: this.day, slot, text: `Pedido recusado: ${countryOf(this, r.from)} não gostou (relação ${REQUEST.relationDecline})`, tone: 'bad' });
    n.policies!.request = null;
    n.policies!.nextRequestDay = this.day + REQUEST.gapDays;
    return null;
  }

  private stepPolicies(n: NationState): void {
    const p = (n.policies ??= createPolicies());
    const day = this.day;
    const stats = this.theater?.stats?.(n.slot) ?? null;
    p.favor = Math.max(0, p.favor - FACTION.favor / FACTION.favorDays);
    // satisfação: volta devagar a 50 e deriva com os decretos em vigor
    for (const id of FACTION_IDS) {
      const f = p.factions[id];
      let drift = (50 - f.satisfaction) * FACTION.drift * 0.1;
      for (const d of p.decrees) drift += DECREES[d.id].factions[id] ?? 0;
      const before = f.satisfaction;
      f.satisfaction = clamp(f.satisfaction + drift, 0, 100);
      if (before >= FACTION.unrestBelow && f.satisfaction < FACTION.unrestBelow)
        this.events.push({ type: 'policy', day, slot: n.slot, text: `${FACTIONS[id].label} em protesto: ${FACTIONS[id].unrest} até a satisfação voltar a ${FACTION.unrestBelow}`, tone: 'bad' });
      // exigência em curso: cumpriu, falhou ou o prazo venceu
      if (f.demand) {
        const st = this.demandStatus(n, f.demand.demand, stats);
        const due = day >= f.demand.dueDay;
        if (st === 'met' && (f.demand.demand.kind !== 'casualties_max' || due)) {
          f.satisfaction = clamp(f.satisfaction + FACTION.win, 0, 100);
          p.favor = Math.min(10, p.favor + FACTION.favor);
          this.theater?.grant?.(n.slot, FACTIONS[id].reward);
          this.events.push({ type: 'policy', day, slot: n.slot, text: `${FACTIONS[id].label} satisfeitas: "${demandText(f.demand.demand)}" cumprido (+aprovação e recursos no teatro)`, tone: 'good' });
          f.demand = null;
          f.nextDay = day + FACTION.gapDays;
        } else if (st === 'failed' || due) {
          f.satisfaction = clamp(f.satisfaction - FACTION.loss, 0, 100);
          this.events.push({ type: 'policy', day, slot: n.slot, text: `${FACTIONS[id].label} frustradas: "${demandText(f.demand.demand)}" não foi cumprido`, tone: 'bad' });
          f.demand = null;
          f.nextDay = day + FACTION.gapDays;
        }
      } else if (day >= f.nextDay) {
        const options = FACTIONS[id].demands({ refDefensePct: n.referenceBudget.defensePct, naturalUnemploymentPct: n.naturalUnemploymentPct }).filter((d) => this.demandStatus(n, d, stats) !== 'met' && (stats || !needsTheater(d)));
        if (options.length) {
          const demand = options[Math.floor(this.rng.next() * options.length)]!;
          f.demand = { demand, startDay: day, dueDay: day + FACTION.deadlineDays };
          this.events.push({ type: 'policy', day, slot: n.slot, text: `${FACTIONS[id].label} exigem: ${demandText(demand)} em ${FACTION.deadlineDays} dias`, tone: 'info' });
        } else f.nextDay = day + FACTION.gapDays;
      }
    }
    // pedido de uma potência
    const r = p.request;
    if (r) {
      const st = this.requestStatus(n, r);
      if (st === 'met') {
        this.diplomacy.adjustRelation(n.slot, r.from, REQUEST.relationWin);
        const aid = n.gdpUsd * REQUEST.aidGdpShare;
        n.debtUsd = Math.max(0, n.debtUsd - aid);
        this.events.push({ type: 'policy', day, slot: n.slot, text: `Pedido de ${countryOf(this, r.from)} cumprido: relação +${REQUEST.relationWin} e ajuda de US$ ${Math.round(aid / 1e6)} mi`, tone: 'good' });
        p.request = null;
        p.nextRequestDay = day + REQUEST.gapDays;
      } else if (st === 'failed' || day >= r.dueDay) {
        this.diplomacy.adjustRelation(n.slot, r.from, REQUEST.relationLoss);
        this.events.push({ type: 'policy', day, slot: n.slot, text: `Pedido de ${countryOf(this, r.from)} não cumprido: relação ${REQUEST.relationLoss}`, tone: 'bad' });
        p.request = null;
        p.nextRequestDay = day + REQUEST.gapDays;
      }
    } else if (day >= p.nextRequestDay) {
      const powers = [...this.npcs].filter((x) => this.diplomacy.knows(n.slot, x.slot) && !this.diplomacy.atWar(n.slot, x.slot)).sort((a, b) => b.gdpUsd - a.gdpUsd || a.slot - b.slot).slice(0, 3);
      const rivals = this.nations.filter((x) => x.slot !== n.slot && !this.diplomacy.atWar(n.slot, x.slot));
      if (!powers.length) {
        p.nextRequestDay = day + REQUEST.gapDays;
        return;
      }
      const from = powers[Math.floor(this.rng.next() * powers.length)]!.slot;
      const kinds: PowerRequest[] = [
        { kind: 'export_usd', usd: REQUEST.exportUsd, baseUsd: n.trade.exportsUsd },
        { kind: 'defense', pct: Math.round((n.budget.defensePct + 0.5) * 10) / 10 },
        { kind: 'research', baseDone: n.research.done.length },
        ...rivals.map((x): PowerRequest => ({ kind: 'no_war', target: x.slot })),
      ];
      const request = kinds[Math.floor(this.rng.next() * kinds.length)]!;
      p.request = { from, request, startDay: day, dueDay: day + REQUEST.deadlineDays };
      this.events.push({ type: 'policy', day, slot: n.slot, text: `${countryOf(this, from)} pede: ${requestText(request, (id) => countryOf(this, id))} em ${REQUEST.deadlineDays} dias`, tone: 'info' });
    }
  }

  /** Situação de uma exigência agora: cumprida, ainda em aberto ou já impossível. */
  demandStatus(n: NationState, d: Demand, stats: TheaterStats | null): 'met' | 'open' | 'failed' {
    const casualties = n.casualties30d.reduce((a, c) => a + c, 0);
    switch (d.kind) {
      case 'buildings':
        return stats && (stats.buildings[d.building] ?? 0) >= d.count ? 'met' : 'open';
      case 'army':
        return stats && stats.military >= d.count ? 'met' : 'open';
      case 'food':
        return stats && stats.food >= d.amount ? 'met' : 'open';
      case 'workers':
        return stats && stats.workers >= d.count ? 'met' : 'open';
      case 'casualties_max':
        return casualties > d.count ? 'failed' : 'met';
      case 'services':
        return n.budget.educationPct + n.budget.healthPct + n.budget.socialPct >= n.base.servicesPct - 1e-9 ? 'met' : 'open';
      case 'defense':
        return n.budget.defensePct >= d.pct - 1e-9 ? 'met' : 'open';
      case 'unemployment':
        return n.unemploymentPct <= d.pct ? 'met' : 'open';
    }
  }

  private requestStatus(n: NationState, r: RequestState): 'met' | 'open' | 'failed' {
    const q = r.request;
    switch (q.kind) {
      case 'export_usd':
        return n.trade.exportsUsd - q.baseUsd >= q.usd ? 'met' : 'open';
      case 'defense':
        return n.budget.defensePct >= q.pct - 1e-9 ? 'met' : 'open';
      case 'research':
        return n.research.done.length > q.baseDone ? 'met' : 'open';
      case 'no_war':
        if (this.diplomacy.atWar(n.slot, q.target)) return 'failed';
        return this.day >= r.dueDay ? 'met' : 'open';
    }
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
    const pol = policyEffects(n.policies);
    if (Math.abs(pol.approval) >= 0.01) factors.push({ key: 'policy', label: 'Decretos e facções', value: pol.approval });
    // lote 3: bairros ligados à estrada agradam; minas esquecidas depois da guerra assustam
    const stats = this.theater?.stats?.(n.slot);
    if (stats?.homes && stats.pavedHomes) factors.push({ key: 'paved', label: 'Bairros pavimentados', value: ROAD_APPROVAL.pavedMax * (stats.pavedHomes / stats.homes) });
    const svc = stats?.services;
    if (svc && svc.health + svc.education + svc.security > 0)
      factors.push({ key: 'services_coverage', label: 'Hospitais, escolas e delegacias cobrindo os bairros', value: SERVICES.approvalMax * (svc.health + svc.education + svc.security) });
    if (stats?.leftoverMines) factors.push({ key: 'mines', label: 'Minas esquecidas no território', value: Math.max(-ROAD_APPROVAL.minesMax, -ROAD_APPROVAL.perMine * stats.leftoverMines) });
    const shock = this.shockLevel();
    if (shock > 0.01) factors.push({ key: 'nuclear', label: 'Medo e crise do lançamento nuclear', value: NUCLEAR_SHOCK.approval * shock });
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
    n.works.capUsd = Math.round((b.infrastructurePct / 100) * gdpFor(n) * WORKS_SHARE_OF_INFRA * (n.projects?.includes('financial_center') ? PROJECT_FX.financialWorksMul : 1));
    if (n.works.fundUsd > n.works.capUsd) n.works.fundUsd = n.works.capUsd;
    n.allianceAidPerSec = this.diplomacy.allianceAid(n.slot, gdpFor);
    n.theaterSupplyPerSec = theaterSupply(defenseBn) * fx.theaterSupplyMul + n.allianceAidPerSec;
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
    policies: createPolicies(),
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
  const r = COEF.baseRate + COEF.inflationPassThrough * clamp(inflationPct, 0, COEF.inflationPassThroughCap) + COEF.riskPremiumPerPoint * Math.max(0, debtPct - Math.max(60, baseDebtPct));
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

/** Exigência que só se mede no teatro (sem teatro ligado, não é sorteada). */
function needsTheater(d: Demand): boolean {
  return d.kind === 'buildings' || d.kind === 'army' || d.kind === 'food' || d.kind === 'workers';
}

function countryOf(sim: NationalSimulation, id: number): string {
  const c = sim.nation(id)?.countryId ?? '';
  return COUNTRIES.find((x) => x.id === c)?.name ?? c;
}
