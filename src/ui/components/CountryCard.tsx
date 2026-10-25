import { countryName } from '../../../shared/data/countries.ts';
import { COEF } from '../../../shared/strategic/params.ts';
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
  { key: 'govDebtPctGdp', fmt: (v) => formatPct(v) },
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
      <td className="py-1 pl-2 text-right text-[10px] text-ink-400" title={v.sourceName}>
        {v.value === null ? '—' : v.sourceUrl ? <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-ink-100">{v.referenceDate}</a> : v.referenceDate}
      </td>
    </tr>
  );
}

/** Fatores que tornam o início da campanha mais difícil, derivados só dos dados exibidos. */
export function difficultyFactors(id: string): string[] {
  const v = countryReference(id).values;
  const out: string[] = [];
  const val = (k: ReferenceKey) => v[k].value;
  if ((val('inflationPct') ?? 0) > 10) out.push(`inflação alta (${formatPct(val('inflationPct'))}): pressiona a aprovação até ceder`);
  if ((val('govDebtPctGdp') ?? 0) > 90) out.push(`dívida elevada (${formatPct(val('govDebtPctGdp'))} do PIB): juros maiores e menos folga fiscal`);
  if ((val('unemploymentPct') ?? 0) > 15) out.push(`desemprego estrutural alto (${formatPct(val('unemploymentPct'))})`);
  if ((val('gdpGrowthPct') ?? 2) < 1) out.push(`crescimento fraco (${formatPct(val('gdpGrowthPct'))})`);
  const rev = val('govRevenuePctGdp');
  const exp = val('govExpensePctGdp');
  if (rev !== null && exp !== null && exp - rev > 5) out.push(`déficit do governo central de ${formatPct(exp - rev)} do PIB`);
  if ((val('militaryUsd') ?? Infinity) < 10e9) out.push('orçamento de defesa pequeno: pouca logística no teatro se a regra for realista');
  return out;
}

export function CountryCard({ id, balanceMode }: { id: string; balanceMode: 'parity' | 'realistic' }) {
  const ref = countryReference(id);
  const factors = difficultyFactors(id);
  const level = factors.length >= 3 ? 'Alta' : factors.length >= 1 ? 'Moderada' : 'Baixa';
  const l = ref.leaders;
  const militaryUsd = ref.values.militaryUsd.value;
  return (
    <div className="rounded border border-ink-700 bg-ink-950 p-3 text-xs">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">
          {countryName(id)} <span className="text-ink-400">({id})</span>
        </h3>
        <span className="text-ink-400">Dificuldade estimada: <span className="text-ink-100">{level}</span></span>
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
      <table className="w-full">
        <tbody>
          {MAIN_ROWS.map((r) => (
            <ReferenceRow key={r.key} k={r.key} v={ref.values[r.key]} fmt={r.fmt} />
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-ink-400">
        <div className="text-[11px] font-semibold text-ink-200">Fatores de dificuldade</div>
        {factors.length === 0 ? <div>Nenhum fator crítico nos dados de referência.</div> : <ul className="list-inside list-disc">{factors.map((f) => <li key={f}>{f}</li>)}</ul>}
        {militaryUsd !== null && (
          <div className="mt-1">
            Logística inicial no teatro:{' '}
            <span className="font-mono text-ink-100">
              +{(COEF.theaterSupplyK * Math.log10(1 + ((balanceMode === 'parity' ? (ref.values.militaryPctGdp.value ?? 0) / 100 * COEF.parityGdpUsd : militaryUsd) / 1e9))).toFixed(2)}/s
            </span>{' '}
            ({balanceMode === 'parity' ? 'regra de paridade' : 'regra realista'}).
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] text-ink-400">
        Fonte: Banco Mundial (WDI) e bases que ele redistribui (OIT, SIPRI, IISS, UNESCO, OMS), licença CC BY 4.0
        {REFERENCE_META.fetchedAt ? `, importado em ${REFERENCE_META.fetchedAt.slice(0, 10).split('-').reverse().join('/')}` : ''}. O ano de cada valor está ao
        lado (clique para abrir a série). Valores mais recentes disponíveis — não necessariamente de 2026.
      </p>
    </div>
  );
}
