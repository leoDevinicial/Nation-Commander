/**
 * Importa indicadores de referência da API do Banco Mundial (licença CC BY 4.0) para os países
 * jogáveis e grava `shared/data/reference/worldbank.json`. Para cada indicador guarda o valor
 * mais recente não nulo, o ano, a unidade e o código da série — nada é estimado aqui.
 *
 * Uso: npm run data:import:wb   (requer acesso a api.worldbank.org)
 *      npm run data:import:wb -- --only=GBR,CHN   (acrescenta esses países sem mexer nos demais)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { COUNTRIES } from '../shared/data/countries.ts';

interface IndicatorSpec {
  key: string;
  code: string;
  label: string;
  unit: string;
  /** Fonte primária, quando o Banco Mundial apenas redistribui (ex.: SIPRI). */
  primarySource?: string;
}

export const INDICATORS: IndicatorSpec[] = [
  { key: 'population', code: 'SP.POP.TOTL', label: 'População total', unit: 'pessoas' },
  { key: 'gdpUsd', code: 'NY.GDP.MKTP.CD', label: 'PIB (US$ correntes)', unit: 'US$ correntes' },
  { key: 'gdpPerCapitaUsd', code: 'NY.GDP.PCAP.CD', label: 'PIB per capita (US$ correntes)', unit: 'US$ correntes' },
  { key: 'gdpGrowthPct', code: 'NY.GDP.MKTP.KD.ZG', label: 'Crescimento do PIB real', unit: '% a.a.' },
  { key: 'inflationPct', code: 'FP.CPI.TOTL.ZG', label: 'Inflação (preços ao consumidor)', unit: '% a.a.' },
  { key: 'unemploymentPct', code: 'SL.UEM.TOTL.ZS', label: 'Desemprego (estimativa modelada da OIT)', unit: '% da força de trabalho', primarySource: 'OIT (ILOSTAT)' },
  { key: 'govDebtPctGdp', code: 'GC.DOD.TOTL.GD.ZS', label: 'Dívida do governo central', unit: '% do PIB' },
  { key: 'govRevenuePctGdp', code: 'GC.REV.XGRT.GD.ZS', label: 'Receita do governo central (exceto doações)', unit: '% do PIB' },
  { key: 'govExpensePctGdp', code: 'GC.XPN.TOTL.GD.ZS', label: 'Despesa do governo central', unit: '% do PIB' },
  { key: 'militaryPctGdp', code: 'MS.MIL.XPND.GD.ZS', label: 'Gasto militar', unit: '% do PIB', primarySource: 'SIPRI Military Expenditure Database' },
  { key: 'militaryUsd', code: 'MS.MIL.XPND.CD', label: 'Gasto militar (US$ correntes)', unit: 'US$ correntes', primarySource: 'SIPRI Military Expenditure Database' },
  { key: 'armedForces', code: 'MS.MIL.TOTL.P1', label: 'Efetivo das forças armadas', unit: 'pessoas', primarySource: 'IISS The Military Balance' },
  { key: 'educationPctGdp', code: 'SE.XPD.TOTL.GD.ZS', label: 'Gasto público em educação', unit: '% do PIB', primarySource: 'UNESCO UIS' },
  { key: 'healthPctGdp', code: 'SH.XPD.GHED.GD.ZS', label: 'Gasto público doméstico em saúde', unit: '% do PIB', primarySource: 'OMS (Global Health Expenditure Database)' },
  { key: 'researchPctGdp', code: 'GB.XPD.RSDV.GD.ZS', label: 'Gasto em P&D', unit: '% do PIB', primarySource: 'UNESCO UIS' },
  { key: 'lifeExpectancy', code: 'SP.DYN.LE00.IN', label: 'Expectativa de vida ao nascer', unit: 'anos' },
  { key: 'electricityAccessPct', code: 'EG.ELC.ACCS.ZS', label: 'Acesso à eletricidade', unit: '% da população' },
  { key: 'tradePctGdp', code: 'NE.TRD.GNFS.ZS', label: 'Comércio (exportações + importações)', unit: '% do PIB' },
  { key: 'landAreaKm2', code: 'AG.LND.TOTL.K2', label: 'Área terrestre', unit: 'km²' },
];

const API = 'https://api.worldbank.org/v2';

interface WbRow {
  countryiso3code: string;
  date: string;
  value: number | null;
}

async function fetchIndicator(code: string, iso3: string[]): Promise<WbRow[]> {
  const url = `${API}/country/${iso3.join(';')}/indicator/${code}?format=json&date=2010:2026&per_page=2000`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as [unknown, WbRow[] | null];
      return body[1] ?? [];
    } catch (err) {
      if (attempt >= 4) throw new Error(`Falha ao buscar ${code}`, { cause: err });
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function main(): Promise<void> {
  // --only=GBR,CHN: busca só esses países e mescla no arquivo atual (os demais ficam como estão)
  const only = process.argv.find((x) => x.startsWith('--only='))?.slice(7).split(',').filter(Boolean) ?? null;
  const iso3 = only ?? COUNTRIES.map((c) => c.id);
  const fetchedAt = new Date().toISOString();
  const countries: Record<string, Record<string, unknown>> = Object.fromEntries(iso3.map((id) => [id, {}]));
  for (const ind of INDICATORS) {
    const rows = await fetchIndicator(ind.code, iso3);
    for (const id of iso3) {
      const latest = rows
        .filter((r) => r.countryiso3code === id && r.value !== null)
        .sort((a, b) => Number(b.date) - Number(a.date))[0];
      countries[id]![ind.key] = latest
        ? {
            value: latest.value,
            year: Number(latest.date),
            unit: ind.unit,
            indicator: ind.code,
            sourceName: ind.primarySource ? `${ind.primarySource}, via Banco Mundial (WDI)` : 'Banco Mundial — World Development Indicators',
            sourceUrl: `https://data.worldbank.org/indicator/${ind.code}?locations=${id}`,
          }
        : null;
    }
    console.log(`${ind.code}: ${rows.filter((r) => r.value !== null).length} valores`);
  }
  const out = {
    generatedBy: 'scripts/import-reference-data.ts',
    fetchedAt,
    license: 'CC BY 4.0 — The World Bank (https://datacatalog.worldbank.org/public-licenses)',
    indicators: INDICATORS,
    countries,
  };
  const file = new URL('../shared/data/reference/worldbank.json', import.meta.url);
  if (only) {
    const prev = JSON.parse(readFileSync(file, 'utf8')) as typeof out;
    out.countries = { ...prev.countries, ...countries };
  }
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log('Gravado shared/data/reference/worldbank.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
