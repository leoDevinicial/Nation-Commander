import type { NationView } from '../../../shared/protocol.ts';
import type { HistoryPoint } from '../../../shared/strategic/NationalSimulation.ts';
import { COEF, SCENARIO_START } from '../../../shared/strategic/params.ts';
import { formatPct, formatSigned, formatUsd } from '../../lib/format.ts';
import { Meter } from './Meter.tsx';
import { StatTile, type SeriesPoint } from './StatTile.tsx';

function dateOf(day: number): string {
  const d = new Date(`${SCENARIO_START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

export function OverviewTab({ nation, history, day, balanceMode }: { nation: NationView; history: HistoryPoint[]; day: number; balanceMode: 'parity' | 'realistic' }) {
  const debtPct = (nation.debtUsd / nation.gdpUsd) * 100;
  const pts = [...history];
  const lastDay = pts.at(-1)?.day ?? -1;
  if (lastDay < day) {
    pts.push({
      day,
      gdpUsd: nation.gdpUsd,
      growthPct: nation.realGrowthPct,
      inflationPct: nation.inflationPct,
      unemploymentPct: nation.unemploymentPct,
      debtPctGdp: debtPct,
      approval: nation.approval,
    });
  }
  const series = (key: keyof HistoryPoint): SeriesPoint[] => pts.map((h) => ({ date: dateOf(h.day), value: h[key] }));
  const first = pts[0];
  const delta = (cur: number, start: number | undefined, upIsGood: boolean | null, unit: string, digits = 1) => {
    if (start === undefined || Math.abs(cur - start) < 10 ** -digits / 2) return { text: 'estável', good: null };
    return { text: `${formatSigned(cur - start, digits, unit)} desde o início`, good: upIsGood === null ? null : cur > start === upIsGood };
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="PIB nominal (US$ correntes)"
          value={formatUsd(nation.gdpUsd)}
          delta={first ? { text: `${formatSigned(((nation.gdpUsd / first.gdpUsd) - 1) * 100, 1, '%')} desde o início`, good: nation.gdpUsd >= first.gdpUsd } : undefined}
          series={series('gdpUsd')}
          format={formatUsd}
        />
        <StatTile
          label="Crescimento real (anualizado)"
          value={formatPct(nation.realGrowthPct)}
          delta={delta(nation.realGrowthPct, first?.growthPct, true, ' p.p.')}
          series={series('growthPct')}
          format={(v) => formatPct(v)}
          baseline={nation.trendGrowthPct}
        />
        <StatTile
          label="Inflação (anual)"
          value={formatPct(nation.inflationPct)}
          delta={delta(nation.inflationPct, first?.inflationPct, false, ' p.p.')}
          series={series('inflationPct')}
          format={(v) => formatPct(v)}
        />
        <StatTile
          label="Desemprego"
          value={formatPct(nation.unemploymentPct)}
          delta={delta(nation.unemploymentPct, first?.unemploymentPct, false, ' p.p.')}
          series={series('unemploymentPct')}
          format={(v) => formatPct(v)}
        />
        <StatTile
          label="Dívida do governo (% do PIB)"
          value={formatPct(debtPct, 0)}
          delta={delta(debtPct, first?.debtPctGdp, false, ' p.p.', 0)}
          series={series('debtPctGdp')}
          format={(v) => formatPct(v, 0)}
        />
        <StatTile
          label="Aprovação do governo"
          value={formatPct(nation.approval, 0)}
          delta={delta(nation.approval, first?.approval, true, ' p.p.', 0)}
          series={series('approval')}
          format={(v) => formatPct(v, 0)}
        />
      </div>
      <div className="space-y-2 rounded border border-ink-700 bg-ink-900 p-2.5">
        <Meter label="Aprovação" value={nation.approval} hint="Abaixo de 35, cresce o risco de protestos." />
        <Meter label="Estabilidade institucional" value={nation.stability} hint="Depende da aprovação, da dívida e da inflação. Abaixo de 40 freia o crescimento." />
      </div>
      <div className="rounded border border-ink-700 bg-ink-900 p-2.5 text-xs text-ink-200">
        <div className="mb-1 text-[11px] text-ink-400">Logística do teatro de operações</div>
        <div>
          <span className="font-mono text-base font-semibold text-ink-100">+{nation.theaterSupplyPerSec.toFixed(2)}</span> suprimentos/s vindos do
          orçamento de defesa ({formatPct(nation.budget.defensePct)} do PIB).
        </div>
        <div className="mt-1 text-[11px] text-ink-400">
          Fórmula: {COEF.theaterSupplyK} × √(gasto de defesa anual em US$ bi), com saturação suave em {COEF.theaterSupplyMax}/s
          {balanceMode === 'parity' ? ', calculado sobre um PIB de referência de US$ 1 tri (regra de paridade)' : ', calculado sobre o PIB real do país (regra realista)'}
          , × bônus de pesquisa. Retornos decrescentes: quadruplicar a defesa dobra os suprimentos.
        </div>
      </div>
    </div>
  );
}
