/**
 * Importa indicadores do FMI (World Economic Outlook, via DataMapper API) para os países jogáveis
 * e grava `shared/data/reference/imf.json`. Usa o ano-base do cenário menos um (2025), o último ano
 * fechado antes de 01/01/2026 — valores desse ano podem ser estimativas do próprio FMI.
 *
 * Uso: npm run data:import:imf   (requer acesso a www.imf.org)
 *      npm run data:import:imf -- --only=GBR,CHN   (acrescenta esses países sem mexer nos demais)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { COUNTRIES } from '../shared/data/countries.ts';

const TARGET_YEAR = 2025;

export const IMF_INDICATORS = [
  { key: 'govDebtPctGdp', code: 'GGXWDG_NGDP', label: 'Dívida bruta do governo geral', unit: '% do PIB' },
  { key: 'govRevenuePctGdp', code: 'GGR_NGDP', label: 'Receita do governo geral', unit: '% do PIB' },
  { key: 'govExpensePctGdp', code: 'GGX_NGDP', label: 'Despesa do governo geral', unit: '% do PIB' },
  { key: 'govBalancePctGdp', code: 'GGXCNL_NGDP', label: 'Saldo do governo geral (capacidade/necessidade de financiamento)', unit: '% do PIB' },
  { key: 'inflationPct', code: 'PCPIPCH', label: 'Inflação (preços ao consumidor, média anual)', unit: '% a.a.' },
  { key: 'gdpGrowthPct', code: 'NGDP_RPCH', label: 'Crescimento do PIB real', unit: '% a.a.' },
  { key: 'unemploymentPct', code: 'LUR', label: 'Taxa de desemprego', unit: '% da força de trabalho' },
] as const;

const API = 'https://www.imf.org/external/datamapper/api/v1';
const DBNOMICS = 'https://api.db.nomics.world/v22/series/IMF/WEO:latest';

type Values = Record<string, Record<string, Record<string, number | null>>>;
type Series = Record<string, Record<string, number | null>>;

interface FetchResult {
  series: Series;
  source: 'imf' | 'dbnomics';
  edition?: string;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; nation-commander-data-import/1.0; +https://github.com/leoDevinicial/Nation-Commander)',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

/** API DataMapper do próprio FMI. */
async function fromImf(code: string, iso3: string[]): Promise<FetchResult> {
  const body = (await getJson(`${API}/${code}/${iso3.join('/')}`)) as { values?: Values };
  return { series: body.values?.[code] ?? {}, source: 'imf' };
}

/** DBnomics: espelho aberto que republica o WEO do FMI sem alterações. */
async function fromDbnomics(code: string, iso3: string[]): Promise<FetchResult> {
  const dims = encodeURIComponent(JSON.stringify({ 'weo-country': iso3, 'weo-subject': [code] }));
  const body = (await getJson(`${DBNOMICS}?dimensions=${dims}&observations=1&limit=100`)) as {
    series?: { docs?: { series_code?: string; dimensions?: Record<string, string>; period?: string[]; value?: (number | string | null)[] }[] };
    dataset?: { code?: string; name?: string };
  };
  const docs = body.series?.docs ?? [];
  if (docs.length === 0) throw new Error(`DBnomics sem séries para ${code}`);
  const series: Series = {};
  for (const d of docs) {
    const country = d.dimensions?.['weo-country'] ?? d.series_code?.split('.')[0];
    if (!country) continue;
    const obs: Record<string, number | null> = {};
    (d.period ?? []).forEach((p, i) => {
      const v = d.value?.[i];
      obs[p.slice(0, 4)] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
    series[country] = obs;
  }
  return { series, source: 'dbnomics', edition: body.dataset?.name ?? body.dataset?.code };
}

async function fetchIndicator(code: string, iso3: string[]): Promise<FetchResult> {
  const errors: string[] = [];
  for (const attempt of [fromImf, fromDbnomics]) {
    for (let i = 1; i <= 3; i++) {
      try {
        return await attempt(code, iso3);
      } catch (err) {
        errors.push(String(err));
        await new Promise((r) => setTimeout(r, 1000 * i));
      }
    }
  }
  throw new Error(`Falha ao buscar ${code}:\n${errors.join('\n')}`);
}

async function main(): Promise<void> {
  // --only=GBR,CHN: busca só esses países e mescla no arquivo atual (os demais ficam como estão)
  const only = process.argv.find((x) => x.startsWith('--only='))?.slice(7).split(',').filter(Boolean) ?? null;
  const iso3 = only ?? COUNTRIES.map((c) => c.id);
  const countries: Record<string, Record<string, unknown>> = Object.fromEntries(iso3.map((id) => [id, {}]));
  for (const ind of IMF_INDICATORS) {
    const result = await fetchIndicator(ind.code, iso3);
    const byCountry = result.series;
    let n = 0;
    for (const id of iso3) {
      const series = byCountry[id] ?? {};
      const value = series[String(TARGET_YEAR)];
      if (typeof value === 'number' && Number.isFinite(value)) {
        n++;
        countries[id]![ind.key] = {
          value,
          year: TARGET_YEAR,
          unit: ind.unit,
          indicator: ind.code,
          sourceName:
            result.source === 'imf'
              ? 'FMI — World Economic Outlook (DataMapper)'
              : `FMI — World Economic Outlook${result.edition ? ` (${result.edition})` : ''}, via DBnomics`,
          sourceUrl: `https://www.imf.org/external/datamapper/${ind.code}@WEO/${id}`,
        };
      } else {
        countries[id]![ind.key] = null;
      }
    }
    console.log(`${ind.code} [${result.source}${result.edition ? ` ${result.edition}` : ''}]: ${n}/${iso3.length} países com valor em ${TARGET_YEAR}`);
  }
  const out = {
    generatedBy: 'scripts/import-imf-data.ts',
    fetchedAt: new Date().toISOString(),
    targetYear: TARGET_YEAR,
    license: 'Dados do FMI — termos de uso em https://www.imf.org/en/About/copyright-and-terms (reutilização com atribuição)',
    note: 'Valores do ano-alvo podem ser estimativas do FMI na edição vigente do WEO.',
    indicators: IMF_INDICATORS,
    countries,
  };
  const file = new URL('../shared/data/reference/imf.json', import.meta.url);
  if (only) {
    const prev = JSON.parse(readFileSync(file, 'utf8')) as typeof out;
    out.countries = { ...prev.countries, ...countries };
  }
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log('Gravado shared/data/reference/imf.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
