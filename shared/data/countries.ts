/**
 * Perfis de país disponíveis na seleção. Nesta fase eles são apenas identidade visual da
 * facção: os dados de referência (população, PIB, forças armadas...) ainda não foram
 * integrados e por isso NÃO são exibidos nem afetam a partida. Ver docs/DATA_SOURCES.md.
 */
export interface CountryProfile {
  id: string; // ISO 3166-1 alfa-3
  name: string;
  /** Sempre true até a integração da Fase 2. */
  isPlaceholder: true;
}

export const COUNTRIES: readonly CountryProfile[] = [
  { id: 'BRA', name: 'Brasil', isPlaceholder: true },
  { id: 'ARG', name: 'Argentina', isPlaceholder: true },
  { id: 'USA', name: 'Estados Unidos', isPlaceholder: true },
  { id: 'MEX', name: 'México', isPlaceholder: true },
  { id: 'DEU', name: 'Alemanha', isPlaceholder: true },
  { id: 'FRA', name: 'França', isPlaceholder: true },
  { id: 'IND', name: 'Índia', isPlaceholder: true },
  { id: 'JPN', name: 'Japão', isPlaceholder: true },
  { id: 'ZAF', name: 'África do Sul', isPlaceholder: true },
  { id: 'AUS', name: 'Austrália', isPlaceholder: true },
];

export const DEFAULT_COUNTRY = 'BRA';

export function isCountryId(id: unknown): id is string {
  return typeof id === 'string' && COUNTRIES.some((c) => c.id === id);
}

export function countryName(id: string): string {
  return COUNTRIES.find((c) => c.id === id)?.name ?? id;
}
