import { useEffect, useMemo, useRef, useState } from 'react';
import { buildNews, matchesFilter, NEWS_FILTERS, TOPIC_LABEL, type LinkedEvent, type NewsFilter, type NewsItem } from '../../game/news.ts';
import { formatDate } from '../../lib/format.ts';
import type { NationalLogEntry } from '../../state/useNationalStore.ts';

const TONE = { info: 'border-ink-600', good: 'border-signal-green', warn: 'border-brass-400', bad: 'border-red-400' } as const;
const TEXT = { info: 'text-ink-200', good: 'text-signal-green', warn: 'text-brass-400', bad: 'text-red-300' } as const;

interface Props {
  log: NationalLogEntry[];
  mySlot: number;
  nameOf: (id: number) => string;
  /** País (ISO alfa-3) de uma nação, para abrir no globo. */
  countryOf: (id: number) => string | null;
  onShowOnGlobe: (countryId: string) => void;
}

/**
 * Noticiário (Fase 9): notícias geradas só a partir do livro de eventos do servidor, com filtros,
 * impacto aplicado e a cadeia de causas, contexto e desdobramentos de cada uma.
 */
export function NewsTab({ log, mySlot, nameOf, countryOf, onShowOnGlobe }: Props) {
  const [filter, setFilter] = useState<NewsFilter>('todas');
  const [open, setOpen] = useState<number | null>(null);
  const feed = useMemo(() => buildNews(log, mySlot, nameOf), [log, mySlot, nameOf]);
  const items = feed.items.filter((n) => matchesFilter(n, filter));
  const refs = useRef(new Map<number, HTMLLIElement>());

  // ao seguir um elo da cadeia, rola até a notícia aberta
  useEffect(() => {
    if (open !== null) refs.current.get(open)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  const goTo = (newsId: number) => {
    const target = feed.items.find((n) => n.id === newsId);
    if (target && !matchesFilter(target, filter)) setFilter('todas');
    setOpen(newsId);
  };

  return (
    <div className="space-y-2 text-xs">
      <p className="text-ink-400">
        Notícias geradas só a partir dos eventos registrados pelo motor da partida. <span className="text-ink-200">Causa</span> é uma ligação registrada pela
        simulação; <span className="text-ink-200">contexto</span> é correlação, sem causa comprovada.
      </p>
      <div className="no-scrollbar flex gap-1 overflow-x-auto" role="group" aria-label="Filtrar notícias">
        {NEWS_FILTERS.map((f) => (
          <button
            key={f.id}
            aria-pressed={filter === f.id}
            className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${filter === f.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="rounded border border-ink-700 bg-ink-900 p-3 text-ink-400">
          {feed.items.length === 0 ? 'Nenhuma notícia ainda. Os acontecimentos da partida aparecem aqui conforme o motor os registra.' : 'Nenhuma notícia neste filtro.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              ref={(el) => {
                if (el) refs.current.set(n.id, el);
                else refs.current.delete(n.id);
              }}
            >
              <NewsCard item={n} expanded={open === n.id} onToggle={() => setOpen(open === n.id ? null : n.id)} resolve={feed.resolve} goTo={goTo} nameOf={nameOf} countryOf={countryOf} onShowOnGlobe={onShowOnGlobe} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewsCard({
  item: n,
  expanded,
  onToggle,
  resolve,
  goTo,
  nameOf,
  countryOf,
  onShowOnGlobe,
}: {
  item: NewsItem;
  expanded: boolean;
  onToggle: () => void;
  resolve: (id: number) => LinkedEvent | null;
  goTo: (newsId: number) => void;
  nameOf: (id: number) => string;
  countryOf: (id: number) => string | null;
  onShowOnGlobe: (countryId: string) => void;
}) {
  const links = n.causeIds.length + n.contextIds.length + n.followUpIds.length;
  return (
    <article className={`rounded border-l-2 bg-ink-900 p-2.5 ${TONE[n.tone]}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] text-ink-400">
        <span>
          {n.eventIds.length > 1 ? `${formatDate(n.firstDate)} – ${formatDate(n.date)}` : formatDate(n.date)} · {TOPIC_LABEL[n.topic]} · {n.scope === 'nacional' ? 'Nacional' : 'Internacional'}
        </span>
        {n.eventIds.length > 1 && <span className="rounded bg-ink-700 px-1.5 py-0.5 text-ink-200">×{n.eventIds.length}</span>}
      </div>
      <h3 className={`mt-1 text-[13px] font-semibold ${TEXT[n.tone]}`}>{n.title}</h3>
      <p className="mt-0.5 text-ink-200">{n.summary}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {n.countries.map((id) => {
          const c = countryOf(id);
          return c ? (
            <button key={id} className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-200 underline decoration-dotted hover:text-ink-100" onClick={() => onShowOnGlobe(c)} title="Ver no globo">
              {nameOf(id)}
            </button>
          ) : null;
        })}
      </div>
      {(n.impact.length > 0 || links > 0) && (
        <button className="mt-1.5 text-[11px] text-ink-400 underline decoration-dotted hover:text-ink-100" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? 'Fechar contexto' : `Impacto e contexto${links ? ` (${links} ligação${links > 1 ? 'ões' : ''})` : ''}`}
        </button>
      )}
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-ink-700 pt-2">
          {n.impact.length > 0 && (
            <Section title="Impacto aplicado">
              {n.impact.map((t, i) => (
                <li key={i} className="text-ink-200">
                  {t}
                </li>
              ))}
            </Section>
          )}
          <Chain title="Causas registradas pelo motor" ids={n.causeIds} resolve={resolve} goTo={goTo} />
          <Chain title="Contexto (correlação, não causa comprovada)" ids={n.contextIds} resolve={resolve} goTo={goTo} />
          <Chain title="Desdobramentos" ids={n.followUpIds} resolve={resolve} goTo={goTo} />
          {n.causeIds.length === 0 && n.contextIds.length === 0 && <p className="text-[11px] text-ink-400">O motor não registrou causa para este acontecimento.</p>}
        </div>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold tracking-wide text-ink-400 uppercase">{title}</div>
      <ul className="list-disc space-y-0.5 pl-4">{children}</ul>
    </div>
  );
}

function Chain({ title, ids, resolve, goTo }: { title: string; ids: number[]; resolve: (id: number) => LinkedEvent | null; goTo: (newsId: number) => void }) {
  const events = ids.map(resolve).filter((e): e is LinkedEvent => e !== null);
  if (!events.length) return null;
  return (
    <Section title={title}>
      {events.map((e) => (
        <li key={e.id} className={TEXT[e.tone]}>
          <span className="text-ink-400">{formatDate(e.date)} · </span>
          {e.newsId !== null ? (
            <button className="text-left underline decoration-dotted hover:text-ink-100" onClick={() => goTo(e.newsId!)}>
              {e.text}
            </button>
          ) : (
            e.text
          )}
        </li>
      ))}
    </Section>
  );
}
