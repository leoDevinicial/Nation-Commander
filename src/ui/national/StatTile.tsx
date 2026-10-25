import { useState } from 'react';
import { formatDate } from '../../lib/format.ts';

export interface SeriesPoint {
  date: string;
  value: number;
}

interface Props {
  label: string;
  value: string;
  /** Variação desde o início da partida, já formatada, e se ela é boa. */
  delta?: { text: string; good: boolean | null };
  series: SeriesPoint[];
  format: (v: number) => string;
  /** Linha de referência opcional (ex.: valor inicial). */
  baseline?: number;
}

const W = 200;
const H = 44;
const PAD = 5;
const LINE = '#4ca3e0';
const SURFACE = '#0d131b';

/**
 * Indicador com valor atual, variação e minigráfico. Série única: sem legenda (o rótulo do
 * cartão nomeia o que está plotado). Passar o mouse mostra data e valor de cada ponto.
 */
export function StatTile({ label, value, delta, series, format, baseline }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const values = series.map((p) => p.value);
  if (baseline !== undefined) values.push(baseline);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const x = (i: number) => PAD + (series.length <= 1 ? (W - 2 * PAD) / 2 : (i / (series.length - 1)) * (W - 2 * PAD));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = series.length > 1 ? `${path} L${x(series.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z` : '';
  const last = series.length - 1;
  const hp = hover !== null ? series[hover] : null;

  return (
    <div className="relative rounded border border-ink-700 bg-ink-900 p-2.5">
      <div className="text-[11px] text-ink-400">{label}</div>
      <div>
        <div className="text-lg leading-tight font-semibold whitespace-nowrap text-ink-100">{value}</div>
        {delta && (
          <div className={`text-[11px] ${delta.good === null ? 'text-ink-400' : delta.good ? 'text-signal-green' : 'text-red-300'}`}>
            {delta.good === null ? '' : delta.good ? '▲ ' : '▼ '}
            {delta.text}
          </div>
        )}
      </div>
      {series.length > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="mt-1 block w-full"
          role="img"
          aria-label={`${label}: evolução de ${format(series[0]!.value)} para ${format(series[last]!.value)}`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            series.forEach((_, i) => {
              if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
            });
            setHover(best);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {baseline !== undefined && <line x1={PAD} x2={W - PAD} y1={y(baseline)} y2={y(baseline)} stroke="#243243" strokeWidth={1} />}
          {area && <path d={area} fill={LINE} opacity={0.1} />}
          <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hp && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD - 2} y2={H - PAD + 2} stroke="#7d8ea3" strokeWidth={1} />}
          {series.length > 0 && (
            <circle
              cx={x(hover ?? last)}
              cy={y(series[hover ?? last]!.value)}
              r={4}
              fill={LINE}
              stroke={SURFACE}
              strokeWidth={2}
            />
          )}
        </svg>
      )}
      {hp && (
        <div className="pointer-events-none absolute top-1 right-2 rounded bg-ink-950/95 px-1.5 py-0.5 text-[11px] text-ink-100 shadow">
          {formatDate(hp.date)} · {format(hp.value)}
        </div>
      )}
    </div>
  );
}
