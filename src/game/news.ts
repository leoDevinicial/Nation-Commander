import { DIPLO } from '../../shared/strategic/Diplomacy.ts';
import { PROTEST_IMPACT, type NationalEvent } from '../../shared/strategic/NationalSimulation.ts';
import { TECHNOLOGIES } from '../../shared/strategic/technologies.ts';
import { formatPct, formatUsd } from '../lib/format.ts';
import { describeNationalEvent, TREATY_LABEL } from './nationalText.ts';

/**
 * Noticiário da partida (Fase 9). Cada notícia nasce de um ou mais eventos do livro de eventos do
 * servidor: título, resumo e impacto saem só dos campos registrados. As ligações de causa e de
 * contexto também vêm do motor (`causeIds` / `contextIds`); aqui elas só são resolvidas e exibidas.
 */

export type NewsTopic = 'militar' | 'economico' | 'social' | 'diplomatico';
export type NewsScope = 'nacional' | 'internacional';
export type NewsTone = 'info' | 'good' | 'warn' | 'bad';

export const TOPIC_LABEL: Record<NewsTopic, string> = { militar: 'Militar', economico: 'Econômico', social: 'Social', diplomatico: 'Diplomático' };

export interface LogEntry {
  event: NationalEvent;
  date: string;
}

export interface NewsItem {
  /** Id do primeiro evento da notícia (chave estável, mesmo quando outros eventos são agrupados nela). */
  id: number;
  /** Todos os eventos agrupados nesta notícia (o mais recente por último). */
  eventIds: number[];
  day: number;
  date: string;
  /** Data do primeiro evento, quando a notícia agrupa vários. */
  firstDate: string;
  title: string;
  summary: string;
  tone: NewsTone;
  topic: NewsTopic;
  scope: NewsScope;
  /** Países envolvidos (ids de nação). */
  countries: number[];
  /** Impacto aplicado pelo motor, em frases curtas com os números registrados. */
  impact: string[];
  causeIds: number[];
  contextIds: number[];
  /** Eventos posteriores que citam esta notícia como causa ou contexto. */
  followUpIds: number[];
}

/** Resumo de um evento qualquer do livro, inclusive os que não viram notícia (para a cadeia causal). */
export interface LinkedEvent {
  id: number;
  date: string;
  text: string;
  tone: NewsTone;
  /** Id da notícia em que o evento aparece, se houver. */
  newsId: number | null;
}

/** Janela (dias) para agrupar eventos repetitivos na mesma notícia. */
export const GROUP_WINDOW_DAYS = 30;

type Diplo = Extract<NationalEvent, { type: 'diplomacy' }>['event'];

function topicOf(e: NationalEvent): NewsTopic {
  switch (e.type) {
    case 'operation':
    case 'military_strike':
    case 'nuclear_shock':
      return 'militar';
    case 'protest':
    case 'policy':
      return 'social';
    case 'threshold':
      return e.indicator === 'approval' ? 'social' : 'economico';
    case 'research_completed':
    case 'budget_changed':
      return 'economico';
    case 'diplomacy':
      return e.event.type === 'war_declared' ? 'militar' : 'diplomatico';
  }
}

/** Nações envolvidas no evento. */
export function actorsOf(e: NationalEvent): number[] {
  if (e.type !== 'diplomacy') {
    if (e.type === 'operation') return [e.slot, e.target];
    if (e.type === 'military_strike' || e.type === 'nuclear_shock') return [e.slot, e.victim];
    return [e.slot];
  }
  const d: Diplo = e.event;
  switch (d.type) {
    case 'treaty_signed':
    case 'treaty_ended':
      return [d.treaty.a, d.treaty.b];
    case 'discovered':
      return [d.by, d.target];
    case 'war_declared':
      return [d.by, d.target, ...d.respondingAllies];
    default:
      return [d.from, d.to];
  }
}

function titleOf(e: NationalEvent, mySlot: number, nameOf: (id: number) => string): string {
  const who = (id: number) => (id === mySlot ? 'Nosso país' : nameOf(id));
  switch (e.type) {
    case 'research_completed':
      return `${who(e.slot)} conclui ${TECHNOLOGIES[e.techId].label}`;
    case 'protest':
      return `Protestos em ${e.slot === mySlot ? 'nosso país' : nameOf(e.slot)}`;
    case 'threshold': {
      const label = { debt: 'Dívida', inflation: 'Inflação', approval: 'Aprovação', growth: 'Crescimento' }[e.indicator];
      const worse = e.indicator === 'approval' || e.indicator === 'growth' ? e.direction === 'down' : e.direction === 'up';
      return `${label} ${e.direction === 'up' ? 'sobe' : 'cai'}${worse ? ' — alerta' : ''}`;
    }
    case 'budget_changed':
      return 'Novo orçamento em vigor';
    case 'operation':
      return `Operação em ${e.sector}: ${{ victory: 'vitória', defeat: 'derrota', retreat: 'recuo', stalemate: 'impasse' }[e.outcome]}`;
    case 'military_strike':
      return `${e.kind === 'missile' ? 'Míssil' : 'Ataque aéreo'} contra ${e.victim === mySlot ? 'nosso país' : nameOf(e.victim)}`;
    case 'nuclear_shock':
      return 'Lançamento nuclear abala a economia mundial';
    case 'policy':
      return e.tone === 'bad' ? 'Crise política' : e.tone === 'good' ? 'Vitória política' : 'Política interna';
    case 'diplomacy': {
      const d = e.event;
      switch (d.type) {
        case 'treaty_signed':
          return d.treaty.type === 'sanctions' ? `Sanções contra ${d.treaty.b === mySlot ? 'nosso país' : nameOf(d.treaty.b)}` : `${TREATY_LABEL[d.treaty.type]} assinado`;
        case 'treaty_ended':
          return `${TREATY_LABEL[d.treaty.type]} ${d.reason === 'war' ? 'rompido pela guerra' : 'encerrado'}`;
        case 'war_declared':
          return `${who(d.by)} declara guerra a ${d.target === mySlot ? 'nosso país' : nameOf(d.target)}`;
        case 'discovered':
          return `Contato estabelecido com ${nameOf(d.target)}`;
        case 'contact_started':
          return 'Missão de contato a caminho';
        case 'proposal_rejected':
          return 'Proposta recusada';
        case 'aid_sent':
          return 'Ajuda internacional enviada';
      }
    }
  }
}

/** Impacto aplicado pelo motor, a partir dos campos do evento (sem estimativas). */
function impactOf(e: NationalEvent): string[] {
  switch (e.type) {
    case 'protest':
      return [`Aprovação −${PROTEST_IMPACT.approval} pts e estabilidade −${PROTEST_IMPACT.stability} pts no dia do protesto`];
    case 'threshold':
      return [`Valor registrado: ${formatPct(e.value)}${e.indicator === 'debt' ? ' do PIB' : ''} (limite ${e.threshold}${e.indicator === 'debt' ? '% do PIB' : '%'})`];
    case 'budget_changed':
      return [`Saldo orçamentário: ${formatPct(-e.deficitPctGdp)} do PIB`];
    case 'operation':
      return [`${e.lost} de ${e.sent} unidades perdidas; ${e.enemyLost} baixas inimigas`, `Custo: ${formatUsd(e.usd)}`, ...(e.occupied ? ['Região ocupada: perda de produção no país atingido'] : [])];
    case 'military_strike':
      if (e.intercepted) return ['Interceptado: sem dano'];
      return [`${e.damage} de dano`, ...(e.destroyed ? [`${e.destroyed} estrutura(s) destruída(s)`] : []), ...(e.oilLost ? [`${e.oilLost} de petróleo perdidos`] : []), 'Reputação do atacante piora'];
    case 'nuclear_shock':
      return [`Nível do choque global: ${e.level}`, 'Crescimento, inflação e renda no teatro pioram para todos os países'];
    case 'diplomacy': {
      const d = e.event;
      if (d.type === 'war_declared') return [`Mobilização: ${formatUsd(d.costs.usd)}, ${d.costs.supplies} suprimentos e ${d.costs.oil} de combustível`, `Aprovação do agressor ${d.costs.approval} pts`, ...(d.brokenTreaties.length ? [`${d.brokenTreaties.length} tratado(s) rompido(s)`] : [])];
      if (d.type === 'treaty_signed' && d.treaty.type === 'sanctions') return [`Enquanto valer: aprovação ${DIPLO.sanctionsApproval} pts e crescimento menor no país sancionado`, `Vigência até o dia ${d.treaty.endDay}`];
      if (d.type === 'treaty_signed') return [`Vigência até o dia ${d.treaty.endDay}`];
      if (d.type === 'aid_sent') return [`Valor: ${formatUsd(d.amountUsd)}`];
      if (d.type === 'contact_started') return [`Custo: ${formatUsd(d.costUsd)}; conclusão no dia ${d.dueDay}`];
      return [];
    }
    default:
      return [];
  }
}

/** Chave de agrupamento: eventos repetitivos do mesmo tipo e dos mesmos países. */
function groupKey(e: NationalEvent): string | null {
  if (e.type === 'protest') return `protest:${e.slot}`;
  if (e.type === 'military_strike') return `strike:${e.slot}:${e.victim}:${e.kind}`;
  if (e.type === 'threshold') return `threshold:${e.slot}:${e.indicator}:${e.direction}`;
  return null;
}

/** Descrição curta de qualquer evento (inclusive os que não aparecem como notícia). */
function linkedText(e: NationalEvent, mySlot: number, nameOf: (id: number) => string): { text: string; tone: NewsTone } {
  return describeNationalEvent(e, mySlot, nameOf) ?? { text: titleOf(e, mySlot, nameOf), tone: 'info' };
}

export interface NewsFeed {
  /** Notícias, da mais recente para a mais antiga. */
  items: NewsItem[];
  /** Resolve um id do livro para exibir na cadeia causal (null se o evento não chegou a este jogador). */
  resolve: (id: number) => LinkedEvent | null;
}

/** Monta o noticiário a partir do registro de eventos recebido do servidor. */
export function buildNews(log: readonly LogEntry[], mySlot: number, nameOf: (id: number) => string): NewsFeed {
  const byId = new Map<number, LogEntry>();
  for (const l of log) if (l.event.id !== undefined) byId.set(l.event.id, l);

  const items: NewsItem[] = [];
  const open = new Map<string, NewsItem>();
  const newsOf = new Map<number, number>();
  for (const l of log) {
    const e = l.event;
    if (e.id === undefined) continue;
    const d = describeNationalEvent(e, mySlot, nameOf);
    if (!d) continue;
    const key = groupKey(e);
    const prev = key ? open.get(key) : undefined;
    if (prev && e.day - prev.day <= GROUP_WINDOW_DAYS) {
      prev.eventIds.push(e.id);
      prev.day = e.day;
      prev.date = l.date;
      prev.summary = d.text;
      prev.tone = d.tone;
      prev.impact = impactOf(e);
      prev.causeIds = [...new Set([...prev.causeIds, ...(e.causeIds ?? [])])];
      prev.contextIds = [...new Set([...prev.contextIds, ...(e.contextIds ?? [])])];
      newsOf.set(e.id, prev.id);
      continue;
    }
    const item: NewsItem = {
      id: e.id,
      eventIds: [e.id],
      day: e.day,
      date: l.date,
      firstDate: l.date,
      title: titleOf(e, mySlot, nameOf),
      summary: d.text,
      tone: d.tone,
      topic: topicOf(e),
      scope: actorsOf(e).includes(mySlot) || e.type === 'nuclear_shock' ? 'nacional' : 'internacional',
      countries: [...new Set(actorsOf(e))],
      impact: impactOf(e),
      causeIds: [...(e.causeIds ?? [])],
      contextIds: [...(e.contextIds ?? [])],
      followUpIds: [],
    };
    items.push(item);
    newsOf.set(e.id, e.id);
    if (key) open.set(key, item);
  }

  const itemByFirst = new Map(items.map((n) => [n.id, n]));
  for (const n of items) {
    const own = new Set(n.eventIds);
    n.causeIds = n.causeIds.filter((id) => !own.has(id)).sort((a, b) => a - b);
    n.contextIds = n.contextIds.filter((id) => !own.has(id) && !n.causeIds.includes(id)).sort((a, b) => a - b);
    for (const ref of [...n.causeIds, ...n.contextIds]) {
      const target = itemByFirst.get(newsOf.get(ref) ?? -1);
      if (target && target !== n && !target.followUpIds.includes(n.id)) target.followUpIds.push(n.id);
    }
  }

  const resolve = (id: number): LinkedEvent | null => {
    const l = byId.get(id);
    if (!l) return null;
    const t = linkedText(l.event, mySlot, nameOf);
    return { id, date: l.date, text: t.text, tone: t.tone, newsId: newsOf.get(id) ?? null };
  };

  return { items: items.reverse(), resolve };
}

export type NewsFilter = 'todas' | NewsScope | NewsTopic;

export const NEWS_FILTERS: { id: NewsFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'nacional', label: 'Nacionais' },
  { id: 'internacional', label: 'Internacionais' },
  { id: 'militar', label: 'Militares' },
  { id: 'economico', label: 'Econômicas' },
  { id: 'social', label: 'Sociais' },
  { id: 'diplomatico', label: 'Diplomáticas' },
];

export function matchesFilter(n: NewsItem, f: NewsFilter): boolean {
  if (f === 'todas') return true;
  if (f === 'nacional' || f === 'internacional') return n.scope === f;
  return n.topic === f;
}
