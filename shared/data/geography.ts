/**
 * Dados geográficos de base dos países jogáveis, separados do estado político da partida.
 * - `isoNumeric`: ISO 3166-1 numérico, usado pelo `world-atlas` (Natural Earth 1:110m) para
 *   identificar as fronteiras de cada país.
 * - `capital`: coordenadas aproximadas (graus decimais) da sede de governo, usadas apenas
 *   para posicionar marcadores no globo.
 */
/** Região diplomática usada na regra de contato inicial (regra de jogo, não classificação oficial). */
export type Region = 'americas' | 'europe' | 'asia_pacific' | 'africa' | 'middle_east';

export const REGION_LABELS: Record<Region, string> = {
  americas: 'Américas',
  europe: 'Europa',
  asia_pacific: 'Ásia-Pacífico',
  africa: 'África',
  middle_east: 'Oriente Médio e Norte da África',
};

export interface CountryGeo {
  id: string;
  isoNumeric: string;
  region: Region;
  capital: { name: string; lat: number; lon: number };
}

export const COUNTRY_GEO: readonly CountryGeo[] = [
  { id: 'BRA', region: 'americas', isoNumeric: '076', capital: { name: 'Brasília', lat: -15.79, lon: -47.88 } },
  { id: 'ARG', region: 'americas', isoNumeric: '032', capital: { name: 'Buenos Aires', lat: -34.6, lon: -58.38 } },
  { id: 'USA', region: 'americas', isoNumeric: '840', capital: { name: 'Washington', lat: 38.9, lon: -77.04 } },
  { id: 'MEX', region: 'americas', isoNumeric: '484', capital: { name: 'Cidade do México', lat: 19.43, lon: -99.13 } },
  { id: 'DEU', region: 'europe', isoNumeric: '276', capital: { name: 'Berlim', lat: 52.52, lon: 13.4 } },
  { id: 'FRA', region: 'europe', isoNumeric: '250', capital: { name: 'Paris', lat: 48.86, lon: 2.35 } },
  { id: 'IND', region: 'asia_pacific', isoNumeric: '356', capital: { name: 'Nova Délhi', lat: 28.61, lon: 77.21 } },
  { id: 'JPN', region: 'asia_pacific', isoNumeric: '392', capital: { name: 'Tóquio', lat: 35.68, lon: 139.69 } },
  { id: 'ZAF', region: 'africa', isoNumeric: '710', capital: { name: 'Pretória', lat: -25.75, lon: 28.19 } },
  { id: 'AUS', region: 'asia_pacific', isoNumeric: '036', capital: { name: 'Camberra', lat: -35.28, lon: 149.13 } },
  { id: 'GBR', region: 'europe', isoNumeric: '826', capital: { name: 'Londres', lat: 51.51, lon: -0.13 } },
  { id: 'CHN', region: 'asia_pacific', isoNumeric: '156', capital: { name: 'Pequim', lat: 39.9, lon: 116.41 } },
  { id: 'ITA', region: 'europe', isoNumeric: '380', capital: { name: 'Roma', lat: 41.9, lon: 12.5 } },
  { id: 'CAN', region: 'americas', isoNumeric: '124', capital: { name: 'Ottawa', lat: 45.42, lon: -75.7 } },
  { id: 'SAU', region: 'middle_east', isoNumeric: '682', capital: { name: 'Riad', lat: 24.71, lon: 46.68 } },
  { id: 'ESP', region: 'europe', isoNumeric: '724', capital: { name: 'Madri', lat: 40.42, lon: -3.7 } },
  { id: 'EGY', region: 'middle_east', isoNumeric: '818', capital: { name: 'Cairo', lat: 30.04, lon: 31.24 } },
  { id: 'RUS', region: 'europe', isoNumeric: '643', capital: { name: 'Moscou', lat: 55.76, lon: 37.62 } },
  { id: 'TUR', region: 'middle_east', isoNumeric: '792', capital: { name: 'Ancara', lat: 39.93, lon: 32.86 } },
  { id: 'KOR', region: 'asia_pacific', isoNumeric: '410', capital: { name: 'Seul', lat: 37.57, lon: 126.98 } },
  { id: 'PRK', region: 'asia_pacific', isoNumeric: '408', capital: { name: 'Pyongyang', lat: 39.04, lon: 125.76 } },
  { id: 'NGA', region: 'africa', isoNumeric: '566', capital: { name: 'Abuja', lat: 9.08, lon: 7.4 } },
  { id: 'IDN', region: 'asia_pacific', isoNumeric: '360', capital: { name: 'Jacarta', lat: -6.21, lon: 106.85 } },
  { id: 'IRN', region: 'middle_east', isoNumeric: '364', capital: { name: 'Teerã', lat: 35.69, lon: 51.39 } },
  { id: 'POL', region: 'europe', isoNumeric: '616', capital: { name: 'Varsóvia', lat: 52.23, lon: 21.01 } },
  { id: 'COL', region: 'americas', isoNumeric: '170', capital: { name: 'Bogotá', lat: 4.71, lon: -74.07 } },
  { id: 'PAK', region: 'asia_pacific', isoNumeric: '586', capital: { name: 'Islamabad', lat: 33.69, lon: 73.05 } },
];

export function geoOf(id: string): CountryGeo | undefined {
  return COUNTRY_GEO.find((g) => g.id === id);
}

export function regionOf(id: string): Region | undefined {
  return geoOf(id)?.region;
}
