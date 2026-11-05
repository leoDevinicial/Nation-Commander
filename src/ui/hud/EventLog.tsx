import { useEffect } from 'react';
import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useHudStore } from '../../state/useHudStore.ts';

/**
 * Feed de eventos da operação (Sala de Situação, 05/11): cada aviso com a faixa e o ícone da sua cor (bom, atenção,
 * perigo, informação), fundo grafite com desfoque e o canto inferior direito chanfrado. Some sozinho em 12 s.
 */
const TONE: Record<'info' | 'good' | 'warn' | 'bad', { color: string; text: string; icon: LucideIcon }> = {
  info: { color: '#5aa9e6', text: 'text-ink-100', icon: Info },
  good: { color: '#5cc47a', text: 'text-ink-100', icon: CircleCheck },
  warn: { color: '#e6a53c', text: 'text-ink-100', icon: TriangleAlert },
  bad: { color: '#e85c4e', text: 'text-ink-100', icon: OctagonAlert },
};

/** Emoji no começo do texto (alguns avisos antigos trazem): o ícone da linha já diz o tipo. */
const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u;

export function EventLog() {
  const events = useHudStore((s) => s.events);
  const expire = useHudStore((s) => s.expireEvents);
  useEffect(() => {
    const id = setInterval(() => expire(12_000), 1000);
    return () => clearInterval(id);
  }, [expire]);
  return (
    <div
      className="pointer-events-none absolute top-15 left-2 w-[min(21rem,calc(100vw-5.5rem))] space-y-1 [@media(min-height:521px)_and_(max-height:900px)]:w-[min(21rem,calc(100vw-9.25rem))] sm:top-16 sm:left-3 max-sm:[&>*:nth-last-child(n+4)]:hidden [@media(max-height:520px)]:[&>*:nth-last-child(n+3)]:hidden"
      aria-live="polite"
      aria-label="Eventos da operação"
    >
      {events.map((e) => {
        const t = TONE[e.tone];
        const Icon = t.icon;
        return (
          <div
            key={e.id}
            className={`nc-event flex items-start gap-2 py-1.5 pr-3 pl-2 text-xs leading-snug ${t.text}`}
            style={{ borderLeftColor: t.color }}
          >
            <Icon size={14} className="mt-px shrink-0" style={{ color: t.color }} aria-hidden />
            <span className="min-w-0">{e.text.replace(LEADING_EMOJI, '')}</span>
          </div>
        );
      })}
    </div>
  );
}
