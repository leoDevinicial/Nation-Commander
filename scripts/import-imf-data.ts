/**
 * Importa indicadores do FMI (World Economic Outlook, via DataMapper API) para os países jogáveis
 * e grava `shared/data/reference/imf.json`. Usa o ano-base do cenário menos um (2025), o último ano
 * fechado antes de 01/01/2026 — valores desse ano podem ser estimativas do próprio FMI.
 *
 * Uso: npm run data:import:imf   (requer acesso a www.imf.org)
 */
import { writeFileSync } from 'node:fs';
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

type Values = Record<string, Record<string, Record<string, number | null>>>;

async function fetchIndicator(code: string, iso3: string[]): Promise<Record<string, Record<string, number | null>>> {
  const url = `${API}/${code}/${iso3.join('/')}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'nation-commander-data-import' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { values?: Values };
      return body.values?.[code] ?? {};
    } catch (err) {
      if (attempt >= 4) throw new Error(`Falha ao buscar ${code}`, { cause: err });
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function main(): Promise<void> {
  const iso3 = COUNTRIES.map((c) => c.id);
  const countries: Record<string, Record<string, unknown>> = Object.fromEntries(iso3.map((id) => [id, {}]));
  for (const ind of IMF_INDICATORS) {
    const byCountry = await fetchIndicator(ind.code, iso3);
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
          sourceName: 'FMI — World Economic Outlook (DataMapper)',
          sourceUrl: `https://www.imf.org/external/datamapper/${ind.code}@WEO/${id}`,
        };
      } else {
        countries[id]![ind.key] = null;
      }
    }
    console.log(`${ind.code}: ${n}/${iso3.length} países com valor em ${TARGET_YEAR}`);
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
  writeFileSync(new URL('../shared/data/reference/imf.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log('Gravado shared/data/reference/imf.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
