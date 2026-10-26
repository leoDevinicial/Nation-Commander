/**
 * Países jogáveis. Os dados de referência ficam em shared/data/reference/ (importados do Banco
 * Mundial por scripts/import-reference-data.ts) e iniciam a simulação nacional.
 * Ver docs/DATA_SOURCES.md.
 */
export interface CountryProfile {
  id: string; // ISO 3166-1 alfa-3
  name: string;
}

export const COUNTRIES: readonly CountryProfile[] = [
  { id: 'BRA', name: 'Brasil' },
  { id: 'ARG', name: 'Argentina' },
  { id: 'USA', name: 'Estados Unidos' },
  { id: 'MEX', name: 'México' },
  { id: 'DEU', name: 'Alemanha' },
  { id: 'FRA', name: 'França' },
  { id: 'IND', name: 'Índia' },
  { id: 'JPN', name: 'Japão' },
  { id: 'ZAF', name: 'África do Sul' },
  { id: 'AUS', name: 'Austrália' },
  { id: 'GBR', name: 'Reino Unido' },
  { id: 'CHN', name: 'China' },
  { id: 'ITA', name: 'Itália' },
  { id: 'CAN', name: 'Canadá' },
  { id: 'SAU', name: 'Arábia Saudita' },
  { id: 'ESP', name: 'Espanha' },
  { id: 'EGY', name: 'Egito' },
  { id: 'RUS', name: 'Rússia' },
  { id: 'TUR', name: 'Turquia' },
  { id: 'KOR', name: 'Coreia do Sul' },
  { id: 'PRK', name: 'Coreia do Norte' },
];

export const DEFAULT_COUNTRY = 'BRA';

export function isCountryId(id: unknown): id is string {
  return typeof id === 'string' && COUNTRIES.some((c) => c.id === id);
}

export function countryName(id: string): string {
  return COUNTRIES.find((c) => c.id === id)?.name ?? id;
}
