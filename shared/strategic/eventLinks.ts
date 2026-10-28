import type { NationId, Treaty } from './Diplomacy.ts';
import type { Factor, NationalEvent } from './NationalSimulation.ts';

/**
 * Livro de eventos (Fase 9): liga cada evento novo a eventos anteriores já registrados.
 *
 * Dois tipos de ligação:
 * - **causa** (`causeIds`): o motor registrou a relação. Ex.: o fator "sanções" pesou na aprovação
 *   no momento do protesto, então o tratado de sanções em vigor contra o país é causa.
 * - **contexto** (`contextIds`): eventos recentes que envolvem o mesmo país e mexem no mesmo
 *   indicador, sem prova de causalidade. A interface os mostra como correlação.
 *
 * Nenhuma ligação é inventada: só são citados eventos que existem no livro.
 */

/** Quantos eventos o livro guarda para procurar ligações. */
export const JOURNAL_MAX = 400;
/** Janelas (em dias) em que um evento anterior ainda conta como contexto. */
export const LINK_WINDOW = { casualties: 30, approval: 180, economy: 180, debt: 365, nuclear: 365 } as const;

export interface LinkContext {
  day: number;
  /** Fatores de aprovação atuais do país do evento (para protestos e quedas de aprovação). */
  approvalFactors: Factor[];
  /** Tratados de sanções em vigor contra o país do evento. */
  sanctionsAgainst: Treaty[];
}

export interface Links {
  causeIds: number[];
  contextIds: number[];
}

type Diplo = Extract<NationalEvent, { type: 'diplomacy' }>;

const isDiplo = (e: NationalEvent): e is Diplo => e.type === 'diplomacy';

/** Último evento do livro que satisfaz `pred` dentro da janela de dias. */
function last(journal: readonly NationalEvent[], day: number, window: number, pred: (e: NationalEvent) => boolean): NationalEvent | undefined {
  for (let i = journal.length - 1; i >= 0; i--) {
    const e = journal[i]!;
    if (day - e.day > window) break;
    if (pred(e)) return e;
  }
  return undefined;
}

/** Todos os eventos do livro que satisfazem `pred` dentro da janela de dias (mais recentes primeiro). */
function all(journal: readonly NationalEvent[], day: number, window: number, pred: (e: NationalEvent) => boolean, max = 3): NationalEvent[] {
  const out: NationalEvent[] = [];
  for (let i = journal.length - 1; i >= 0 && out.length < max; i--) {
    const e = journal[i]!;
    if (day - e.day > window) break;
    if (pred(e)) out.push(e);
  }
  return out;
}

/** Declaração de guerra entre `a` e `b` (em qualquer sentido) — sem limite de tempo. */
export function warBetween(journal: readonly NationalEvent[], a: NationId, b: NationId): NationalEvent | undefined {
  return last(journal, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, (e) => isDiplo(e) && e.event.type === 'war_declared' && ((e.event.by === a && e.event.target === b) || (e.event.by === b && e.event.target === a)));
}

/** Eventos de assinatura dos tratados de sanções em vigor contra o país. */
function sanctionEvents(journal: readonly NationalEvent[], treaties: readonly Treaty[]): NationalEvent[] {
  const ids = new Set(treaties.map((t) => t.id));
  return journal.filter((e) => isDiplo(e) && e.event.type === 'treaty_signed' && ids.has(e.event.treaty.id));
}

/** Eventos militares em que `slot` teve baixas ou foi atingido, nos últimos `window` dias. */
function militaryLosses(journal: readonly NationalEvent[], day: number, slot: NationId, window: number): NationalEvent[] {
  return all(journal, day, window, (e) => (e.type === 'operation' && ((e.slot === slot && e.lost > 0) || (e.target === slot && e.enemyLost > 0))) || (e.type === 'military_strike' && e.victim === slot && !e.intercepted));
}

/** Causas registradas pelo motor a partir dos fatores negativos de aprovação. */
function approvalCauses(journal: readonly NationalEvent[], ctx: LinkContext): NationalEvent[] {
  const negative = new Set(ctx.approvalFactors.filter((f) => f.value < 0).map((f) => f.key));
  const out: NationalEvent[] = [];
  if (negative.has('sanctions')) out.push(...sanctionEvents(journal, ctx.sanctionsAgainst));
  if (negative.has('nuclear')) out.push(...all(journal, ctx.day, LINK_WINDOW.nuclear, (e) => e.type === 'nuclear_shock'));
  return out;
}

/** Contexto comum de um indicador econômico que piorou no país `slot`. */
function economicContext(journal: readonly NationalEvent[], ctx: LinkContext, slot: NationId, window: number): NationalEvent[] {
  return [
    ...sanctionEvents(journal, ctx.sanctionsAgainst),
    ...all(journal, ctx.day, LINK_WINDOW.nuclear, (e) => e.type === 'nuclear_shock'),
    ...all(journal, ctx.day, window, (e) => isDiplo(e) && e.event.type === 'war_declared' && (e.event.by === slot || e.event.target === slot), 2),
    ...all(journal, ctx.day, window, (e) => e.type === 'operation' && e.target === slot && e.occupied, 2),
  ];
}

const ids = (events: NationalEvent[]): number[] => [...new Set(events.map((e) => e.id).filter((x): x is number => x !== undefined))].sort((a, b) => a - b);

/** Ligações de um evento novo com o livro (o evento ainda não está no livro). */
export function linkEvent(ev: NationalEvent, journal: readonly NationalEvent[], ctx: LinkContext): Links {
  const causes: NationalEvent[] = [];
  const context: NationalEvent[] = [];
  const war = (a: NationId, b: NationId) => {
    const w = warBetween(journal, a, b);
    if (w) context.push(w);
  };
  switch (ev.type) {
    case 'military_strike':
      war(ev.slot, ev.victim);
      break;
    case 'operation':
      war(ev.slot, ev.target);
      break;
    case 'nuclear_shock':
      war(ev.slot, ev.victim);
      break;
    case 'protest': {
      causes.push(...approvalCauses(journal, ctx));
      const keys = new Set(ev.causes.map((c) => c.key));
      if (keys.has('casualties')) context.push(...militaryLosses(journal, ctx.day, ev.slot, LINK_WINDOW.casualties));
      const drop = last(journal, ctx.day, LINK_WINDOW.approval, (e) => e.type === 'threshold' && e.slot === ev.slot && e.indicator === 'approval' && e.direction === 'down');
      if (drop) context.push(drop);
      if (keys.has('policy')) context.push(...all(journal, ctx.day, LINK_WINDOW.approval, (e) => e.type === 'policy' && e.slot === ev.slot && e.tone === 'bad', 2));
      break;
    }
    case 'threshold': {
      const worse = ev.indicator === 'approval' || ev.indicator === 'growth' ? ev.direction === 'down' : ev.direction === 'up';
      if (!worse) break;
      if (ev.indicator === 'approval') {
        causes.push(...approvalCauses(journal, ctx));
        if (ctx.approvalFactors.some((f) => f.key === 'casualties' && f.value < 0)) context.push(...militaryLosses(journal, ctx.day, ev.slot, LINK_WINDOW.casualties));
        context.push(...all(journal, ctx.day, LINK_WINDOW.approval, (e) => e.type === 'protest' && e.slot === ev.slot, 2));
      } else {
        const window = ev.indicator === 'debt' ? LINK_WINDOW.debt : LINK_WINDOW.economy;
        context.push(...economicContext(journal, ctx, ev.slot, window));
        if (ev.indicator === 'debt') {
          const budget = last(journal, ctx.day, LINK_WINDOW.debt, (e) => e.type === 'budget_changed' && e.slot === ev.slot);
          if (budget) context.push(budget);
        }
      }
      break;
    }
    default:
      break;
  }
  const causeIds = ids(causes);
  const taken = new Set(causeIds);
  return { causeIds, contextIds: ids(context).filter((id) => !taken.has(id)) };
}
