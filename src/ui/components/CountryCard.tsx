import { Star } from 'lucide-react';
import { countryName } from '../../../shared/data/countries.ts';
import { countryBonus } from '../../../shared/sim/countryBonus.ts';
import { countryReference, REFERENCE_META, type ReferenceKey, type SourcedValue } from '../../../shared/strategic/reference.ts';
import { formatCount, formatNumber, formatPct, formatUsd } from '../../lib/format.ts';

type Fmt = (v: number) => string;

export const MAIN_ROWS: { key: ReferenceKey; fmt: Fmt }[] = [
  { key: 'population', fmt: formatCount },
  { key: 'gdpUsd', fmt: formatUsd },
  { key: 'gdpPerCapitaUsd', fmt: formatUsd },
  { key: 'gdpGrowthPct', fmt: (v) => formatPct(v) },
  { key: 'inflationPct', fmt: (v) => formatPct(v) },
  { key: 'unemploymentPct', fmt: (v) => formatPct(v) },
  { key: 'militaryPctGdp', fmt: (v) => formatPct(v, 2) },
  { key: 'militaryUsd', fmt: formatUsd },
  { key: 'armedForces', fmt: formatCount },
];

export const ALL_ROWS: { key: ReferenceKey; fmt: Fmt }[] = [
  ...MAIN_ROWS,
  { key: 'govRevenuePctGdp', fmt: (v) => formatPct(v) },
  { key: 'govExpensePctGdp', fmt: (v) => formatPct(v) },
  { key: 'educationPctGdp', fmt: (v) => formatPct(v) },
  { key: 'healthPctGdp', fmt: (v) => formatPct(v) },
  { key: 'researchPctGdp', fmt: (v) => formatPct(v, 2) },
  { key: 'lifeExpectancy', fmt: (v) => `${formatNumber(v, 1)} anos` },
  { key: 'electricityAccessPct', fmt: (v) => formatPct(v) },
  { key: 'tradePctGdp', fmt: (v) => formatPct(v) },
  { key: 'landAreaKm2', fmt: (v) => `${formatCount(v)} km²` },
];

export function ReferenceRow({ k, v, fmt }: { k: ReferenceKey; v: SourcedValue; fmt: Fmt }) {
  return (
    <tr className="border-t border-ink-800">
      <td className="py-1 pr-2 text-ink-400">{REFERENCE_META.labels[k] ?? k}</td>
      <td className="py-1 text-right font-mono whitespace-nowrap text-ink-100">
        {v.value === null ? <span className="font-sans text-[11px] text-brass-400">sem dado confiável</span> : fmt(v.value)}
      </td>
      <td className="py-1 pl-2 text-right text-[10px] text-ink-400" title={v.notes ? `${v.sourceName}\n${v.notes}` : v.sourceName}>
        {v.value === null ? '—' : v.sourceUrl ? <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-ink-100">{v.referenceDate}</a> : v.referenceDate}
        {v.value !== null && v.quality !== 'official' && <span className="ml-1 text-brass-400">est.</span>}
      </td>
    </tr>
  );
}

/**
 * Ficha do país no lobby (16/11): todos começam iguais na partida; o que muda é o bônus único e a região inicial. Os
 * dados reais ficam como curiosidade, sem efeito no jogo.
 */
export function CountryCard({ id }: { id: string; balanceMode?: 'parity' | 'realistic' }) {
  const ref = countryReference(id);
  const l = ref.leaders;
  const bonus = countryBonus(id);
  return (
    <div className="rounded border border-ink-700 bg-ink-950 p-3 text-xs">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">
          {countryName(id)} <span className="text-ink-400">({id})</span>
        </h3>
      </div>
      {l && (
        <p className="mb-2 text-ink-400">
          {l.system} · {l.headOfState.title}: <span className="text-ink-200">{l.headOfState.name}</span>
          {l.headOfGovernment && (
            <>
              {' '}· {l.headOfGovernment.title}: <span className="text-ink-200">{l.headOfGovernment.name}</span>
            </>
          )}{' '}
          <span className="text-[10px]">(em {ref.leadersReferenceDate.split('-').reverse().join('/')})</span>
        </p>
      )}
      {bonus.title && (
        <p className="mb-2 rounded border border-brass-400/40 bg-brass-400/10 px-2 py-1 text-ink-200">
          <span className="font-semibold text-brass-400">
            <Star size={12} className="inline-block align-[-2px]" aria-hidden /> {bonus.title}:
          </span> {bonus.description}
        </p>
      )}
      <p className="mb-2 text-ink-300">Na partida, todos os países começam com a mesma economia, a mesma logística e o mesmo caixa. O que muda é o bônus acima e a região inicial do mapa.</p>
      <div className="text-[11px] font-semibold text-ink-200">O país real (só curiosidade, sem efeito no jogo)</div>
      <table className="w-full">
        <tbody>
          {MAIN_ROWS.map((r) => (
            <ReferenceRow key={r.key} k={r.key} v={ref.values[r.key]} fmt={r.fmt} />
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-ink-400">
        Fonte: Banco Mundial (WDI) e bases que ele redistribui (OIT, SIPRI, IISS, UNESCO, OMS), licença CC BY 4.0
        {REFERENCE_META.fetchedAt ? `, importado em ${REFERENCE_META.fetchedAt.slice(0, 10).split('-').reverse().join('/')}` : ''}. O ano de cada valor está ao
        lado (clique para abrir a série). Valores mais recentes disponíveis — não necessariamente de 2026.
      </p>
    </div>
  );
}
