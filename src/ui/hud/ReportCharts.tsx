import { useState } from 'react';
import type { MatchReport, ReportSample } from '../../../shared/sim/report.ts';
import { factionColor } from '../../game/factions.ts';
import { formatDuration, formatUsd } from '../../lib/format.ts';

type Metric = 'army' | 'buildings' | 'territory' | 'gathered' | 'gdpUsd';

const METRICS: { id: Metric; label: string; format: (v: number) => string }[] = [
  { id: 'army', label: 'Tropas', format: (v) => String(Math.round(v)) },
  { id: 'buildings', label: 'Construções', format: (v) => String(Math.round(v)) },
  { id: 'territory', label: 'Território', format: (v) => `${Math.round(v * 100)}%` },
  { id: 'gathered', label: 'Recursos coletados', format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} mil` : String(Math.round(v))) },
  { id: 'gdpUsd', label: 'PIB', format: (v) => formatUsd(v) },
];

const W = 560;
const H = 150;
const PAD = { l: 44, r: 8, t: 8, b: 18 };

function value(s: ReportSample, slot: number, m: Metric): number | null {
  const p = s.players.find((x) => x.slot === slot);
  if (!p) return null;
  const v = p[m];
  return typeof v === 'number' ? v : null;
}

/**
 * Gráficos do relatório pós-partida: uma linha por comandante, na cor da facção, para a métrica
 * escolhida (tropas, construções, território, recursos coletados e PIB).
 */
export function ReportCharts({ report, names }: { report: MatchReport; names: Map<number, string> }) {
  const [metric, setMetric] = useState<Metric>('army');
  const samples = report.samples;
  const slots = [...new Set(samples.flatMap((s) => s.players.map((p) => p.slot)))];
  const available = METRICS.filter((m) => samples.some((s) => s.players.some((p) => typeof p[m.id] === 'number')));
  const def = available.find((m) => m.id === metric) ?? available[0];
  if (samples.length < 2 || !def) return null;
  const tMax = Math.max(1, samples[samples.length - 1]!.t);
  const vals = samples.flatMap((s) => slots.map((slot) => value(s, slot, def.id)).filter((v): v is number => v !== null));
  const vMin = def.id === 'gdpUsd' ? Math.min(...vals) * 0.98 : 0;
  const vMax = Math.max(vMin + 1e-9, ...vals) * (def.id === 'gdpUsd' ? 1.02 : 1.08);
  const x = (t: number) => PAD.l + (t / tMax) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - vMin) / (vMax - vMin)) * (H - PAD.t - PAD.b);
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-2 text-xs font-semibold tracking-wider text-ink-400 uppercase">Evolução da partida</h3>
        {available.map((m) => (
          <button
            key={m.id}
            className={`btn min-h-7 px-2 py-0.5 text-[11px] ${m.id === def.id ? 'btn-primary' : ''}`}
            aria-pressed={m.id === def.id}
            onClick={() => setMetric(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Gráfico de ${def.label} ao longo da partida`}>
        {[0, 0.5, 1].map((k) => {
          const v = vMin + (vMax - vMin) * k;
          return (
            <g key={k}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-ink-700" strokeWidth={1} />
              <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" className="fill-ink-400" fontSize={9}>
                {def.format(v)}
              </text>
            </g>
          );
        })}
        <text x={PAD.l} y={H - 4} className="fill-ink-400" fontSize={9}>
          0:00
        </text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" className="fill-ink-400" fontSize={9}>
          {formatDuration(tMax)}
        </text>
        {slots.map((slot) => {
          const pts = samples
            .map((s) => {
              const v = value(s, slot, def.id);
              return v === null ? null : `${x(s.t).toFixed(1)},${y(v).toFixed(1)}`;
            })
            .filter((p) => p !== null);
          return <polyline key={slot} points={pts.join(' ')} fill="none" stroke={factionColor(slot)} strokeWidth={2} strokeLinejoin="round" />;
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-ink-300">
        {slots.map((slot) => (
          <span key={slot} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: factionColor(slot) }} aria-hidden />
            {names.get(slot) ?? `Jogador ${slot + 1}`}
          </span>
        ))}
      </div>
    </div>
  );
}
