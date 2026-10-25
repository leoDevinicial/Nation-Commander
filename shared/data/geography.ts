/**
 * Dados geográficos de base dos países jogáveis, separados do estado político da partida.
 * - `isoNumeric`: ISO 3166-1 numérico, usado pelo `world-atlas` (Natural Earth 1:110m) para
 *   identificar as fronteiras de cada país.
 * - `capital`: coordenadas aproximadas (graus decimais) da sede de governo, usadas apenas
 *   para posicionar marcadores no globo.
 */
export interface CountryGeo {
  id: string;
  isoNumeric: string;
  capital: { name: string; lat: number; lon: number };
}

export const COUNTRY_GEO: readonly CountryGeo[] = [
  { id: 'BRA', isoNumeric: '076', capital: { name: 'Brasília', lat: -15.79, lon: -47.88 } },
  { id: 'ARG', isoNumeric: '032', capital: { name: 'Buenos Aires', lat: -34.6, lon: -58.38 } },
  { id: 'USA', isoNumeric: '840', capital: { name: 'Washington', lat: 38.9, lon: -77.04 } },
  { id: 'MEX', isoNumeric: '484', capital: { name: 'Cidade do México', lat: 19.43, lon: -99.13 } },
  { id: 'DEU', isoNumeric: '276', capital: { name: 'Berlim', lat: 52.52, lon: 13.4 } },
  { id: 'FRA', isoNumeric: '250', capital: { name: 'Paris', lat: 48.86, lon: 2.35 } },
  { id: 'IND', isoNumeric: '356', capital: { name: 'Nova Délhi', lat: 28.61, lon: 77.21 } },
  { id: 'JPN', isoNumeric: '392', capital: { name: 'Tóquio', lat: 35.68, lon: 139.69 } },
  { id: 'ZAF', isoNumeric: '710', capital: { name: 'Pretória', lat: -25.75, lon: 28.19 } },
  { id: 'AUS', isoNumeric: '036', capital: { name: 'Camberra', lat: -35.28, lon: 149.13 } },
];

export function geoOf(id: string): CountryGeo | undefined {
  return COUNTRY_GEO.find((g) => g.id === id);
}
