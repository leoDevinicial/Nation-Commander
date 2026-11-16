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

/**
 * Visão geral do país do mapa (16/11): PIB do cenário, crescimento, cidadãos sem trabalho, saldo do caixa e aprovação.
 * Inflação e desemprego "macro" saíram (não há mais o que os gere); a logística vem da área Defesa do orçamento.
 */
export function OverviewTab({ nation, history, day }: { nation: NationView; history: HistoryPoint[]; day: number }) {
  const pts = [...history];
  const lastDay = pts.at(-1)?.day ?? -1;
  if (lastDay < day) {
    pts.push({
      day,
      gdpUsd: nation.gdpUsd,
      growthPct: nation.realGrowthPct,
      inflationPct: nation.inflationPct,
      unemploymentPct: nation.unemploymentPct,
      deficitPctGdp: nation.deficitPctGdp,
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
          label="PIB do cenário (produção × 365)"
          value={formatUsd(nation.gdpUsd)}
          delta={first && first.gdpUsd > 0 ? { text: `${formatSigned(((nation.gdpUsd / first.gdpUsd) - 1) * 100, 1, '%')} desde o início`, good: nation.gdpUsd >= first.gdpUsd } : undefined}
          series={series('gdpUsd')}
          format={formatUsd}
        />
        <StatTile
          label="Crescimento (PIB vs. média de 30 dias)"
          value={formatPct(nation.realGrowthPct)}
          delta={delta(nation.realGrowthPct, first?.growthPct, true, ' p.p.')}
          series={series('growthPct')}
          format={(v) => formatPct(v)}
          baseline={0}
        />
        <StatTile label="População (cidadãos e militares)" value={Math.round(nation.population).toLocaleString('pt-BR')} delta={{ text: `caixa ${formatUsd(nation.works.fundUsd)}`, good: null }} series={[]} format={(v) => String(v)} />
        <StatTile
          label="Cidadãos sem trabalho"
          value={formatPct(nation.unemploymentPct)}
          delta={delta(nation.unemploymentPct, first?.unemploymentPct, false, ' p.p.')}
          series={series('unemploymentPct')}
          format={(v) => formatPct(v)}
        />
        <StatTile
          label="Despesa acima da receita (% do PIB)"
          value={formatPct(nation.deficitPctGdp, 1)}
          delta={delta(nation.deficitPctGdp, first?.deficitPctGdp, false, ' p.p.', 1)}
          series={series('deficitPctGdp')}
          format={(v) => formatPct(v, 1)}
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
        <Meter label="Estabilidade institucional" value={nation.stability} hint="Segue a aprovação e os decretos. Muito baixa por tempo demais, o governo cai." />
      </div>
      <div className="rounded border border-ink-700 bg-ink-900 p-2.5 text-xs text-ink-200">
        <div className="mb-1 text-[11px] text-ink-400">Logística do teatro de operações</div>
        <div>
          <span className="font-mono text-base font-semibold text-ink-100">+{nation.theaterSupplyPerSec.toFixed(2)}</span>{' '}
          {`suprimentos/s vindos da Defesa do orçamento (${nation.areasCut?.defense ?? nation.areas?.defense ?? 100}%).`}
        </div>
        <div className="mt-1 text-[11px] text-ink-400">
          {`Fórmula: ${COEF.theaterSupplyK} × √(verba de defesa), com saturação suave em ${COEF.theaterSupplyMax}/s, × bônus de pesquisa, mais a ajuda de aliados. Igual para todos os países; retornos decrescentes: a 150% rende uns 20% a mais que a 100%.`}
        </div>
      </div>
    </div>
  );
}
