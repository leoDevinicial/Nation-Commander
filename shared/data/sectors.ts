/**
 * Setores operacionais de cada país (Fase 8): regiões onde uma operação militar pode ocorrer.
 *
 * São aproximações de jogo, não cartografia: o ponto (lat/lon) marca a região no globo e no mapa
 * operacional; o bioma, o relevo, a costa/rios e a infraestrutura listada orientam a geração do
 * mapa tático local e as consequências da ocupação. `share` é a fração aproximada da economia do
 * país associada ao setor (a soma por país fica abaixo de 1: o resto do país não é alvo
 * operacional nesta versão).
 */
export type Biome = 'temperate' | 'arid' | 'tropical' | 'cold' | 'grassland';

export const BIOME_LABELS: Record<Biome, string> = {
  temperate: 'Temperado (campos e bosques)',
  arid: 'Árido (cerrado seco e deserto)',
  tropical: 'Tropical úmido (mata densa)',
  cold: 'Frio (taiga e montanha)',
  grassland: 'Campos abertos (pradaria e pampa)',
};

export type Infra = 'road' | 'rail' | 'port' | 'oil' | 'industry' | 'airfield';

export const INFRA_LABELS: Record<Infra, string> = {
  road: 'Rodovias',
  rail: 'Ferrovia',
  port: 'Porto',
  oil: 'Campos de petróleo',
  industry: 'Polo industrial',
  airfield: 'Base aérea',
};

export interface SectorDef {
  id: string;
  countryId: string;
  name: string;
  lat: number;
  lon: number;
  biome: Biome;
  coast: boolean;
  river: boolean;
  mountains: boolean;
  infra: Infra[];
  share: number;
}

const S = (
  countryId: string,
  id: string,
  name: string,
  lat: number,
  lon: number,
  biome: Biome,
  f: { coast?: boolean; river?: boolean; mountains?: boolean },
  infra: Infra[],
  share: number,
): SectorDef => ({
  id: `${countryId}-${id}`,
  countryId,
  name,
  lat,
  lon,
  biome,
  coast: !!f.coast,
  river: !!f.river,
  mountains: !!f.mountains,
  infra,
  share,
});

export const SECTORS: readonly SectorDef[] = [
  S('BRA', 'sul', 'Sul (Paraná e Rio Grande do Sul)', -27.5, -51.5, 'grassland', { coast: true, river: true }, ['road', 'rail', 'port', 'industry'], 0.16),
  S('BRA', 'sudeste', 'Sudeste (São Paulo e Rio)', -22.9, -45.5, 'tropical', { coast: true, mountains: true }, ['road', 'rail', 'port', 'industry', 'oil', 'airfield'], 0.5),
  S('BRA', 'centro', 'Centro-Oeste (Planalto)', -15.8, -50, 'arid', { river: true }, ['road', 'airfield'], 0.1),
  S('BRA', 'norte', 'Norte (Amazônia)', -3.1, -60, 'tropical', { river: true }, ['road', 'port'], 0.06),

  S('ARG', 'pampa', 'Pampa (Buenos Aires)', -35.5, -59.5, 'grassland', { coast: true, river: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.45),
  S('ARG', 'cuyo', 'Cuyo e Andes (Mendoza)', -32.9, -68.8, 'arid', { mountains: true }, ['road', 'oil'], 0.1),
  S('ARG', 'patagonia', 'Patagônia (Neuquén)', -39, -68, 'cold', { river: true, mountains: true }, ['road', 'oil'], 0.12),
  S('ARG', 'noroeste', 'Noroeste (Tucumán e Salta)', -26, -65.3, 'arid', { mountains: true }, ['road', 'rail'], 0.08),

  S('USA', 'texas', 'Texas e Golfo', 30.5, -97, 'arid', { coast: true }, ['road', 'rail', 'port', 'oil', 'industry', 'airfield'], 0.12),
  S('USA', 'meio_oeste', 'Meio-Oeste (Grandes Lagos)', 41.9, -87.6, 'grassland', { coast: true, river: true }, ['road', 'rail', 'industry'], 0.18),
  S('USA', 'nordeste', 'Nordeste (corredor atlântico)', 40.7, -74, 'temperate', { coast: true, river: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.25),
  S('USA', 'california', 'Califórnia', 36.5, -119.5, 'arid', { coast: true, mountains: true }, ['road', 'port', 'industry', 'airfield'], 0.14),

  S('MEX', 'norte', 'Norte (Monterrey)', 25.7, -100.3, 'arid', { mountains: true }, ['road', 'rail', 'industry'], 0.2),
  S('MEX', 'centro', 'Vale do México', 19.4, -99.1, 'temperate', { mountains: true }, ['road', 'rail', 'industry', 'airfield'], 0.35),
  S('MEX', 'golfo', 'Golfo (Veracruz e Tabasco)', 19.2, -96.1, 'tropical', { coast: true, river: true }, ['road', 'port', 'oil'], 0.15),

  S('DEU', 'norte', 'Norte (Hamburgo)', 53.55, 10, 'temperate', { coast: true, river: true }, ['road', 'rail', 'port', 'industry'], 0.18),
  S('DEU', 'ruhr', 'Renânia e Ruhr', 51.4, 7.2, 'temperate', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.3),
  S('DEU', 'baviera', 'Baviera e Alpes', 48.1, 11.6, 'cold', { river: true, mountains: true }, ['road', 'rail', 'industry'], 0.2),

  S('FRA', 'norte', 'Norte e Bacia de Paris', 49.2, 2.6, 'temperate', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.35),
  S('FRA', 'atlantico', 'Costa Atlântica (Bretanha)', 47.8, -2.5, 'temperate', { coast: true }, ['road', 'port'], 0.12),
  S('FRA', 'sudeste', 'Ródano e Alpes', 45.5, 5.5, 'cold', { river: true, mountains: true }, ['road', 'rail', 'industry'], 0.18),

  S('IND', 'norte', 'Planície do Ganges (Délhi)', 28.6, 77.2, 'grassland', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.3),
  S('IND', 'oeste', 'Costa Oeste (Mumbai e Gujarat)', 20, 73, 'arid', { coast: true }, ['road', 'rail', 'port', 'oil', 'industry'], 0.3),
  S('IND', 'sul', 'Sul (Decão e Chennai)', 13, 79, 'tropical', { coast: true }, ['road', 'rail', 'port', 'industry'], 0.22),

  S('JPN', 'kanto', 'Kanto (Tóquio)', 35.7, 139.7, 'temperate', { coast: true, mountains: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.4),
  S('JPN', 'kansai', 'Kansai (Osaka)', 34.7, 135.5, 'temperate', { coast: true, mountains: true }, ['road', 'rail', 'port', 'industry'], 0.2),
  S('JPN', 'hokkaido', 'Hokkaido', 43.1, 141.3, 'cold', { coast: true, mountains: true }, ['road', 'port', 'airfield'], 0.05),

  S('ZAF', 'gauteng', 'Gauteng (Joanesburgo e Pretória)', -26.1, 28.1, 'grassland', {}, ['road', 'rail', 'industry', 'airfield'], 0.35),
  S('ZAF', 'cabo', 'Cabo Ocidental', -33.9, 18.6, 'temperate', { coast: true, mountains: true }, ['road', 'port'], 0.14),
  S('ZAF', 'natal', 'KwaZulu-Natal (Durban)', -29.9, 31, 'tropical', { coast: true }, ['road', 'rail', 'port', 'oil'], 0.16),

  S('AUS', 'sudeste', 'Sudeste (Sydney e Melbourne)', -34.5, 148, 'temperate', { coast: true, mountains: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.55),
  S('AUS', 'oeste', 'Austrália Ocidental (Pilbara)', -22, 118, 'arid', { coast: true }, ['road', 'rail', 'port', 'oil'], 0.15),
  S('AUS', 'queensland', 'Queensland', -24, 150, 'tropical', { coast: true }, ['road', 'port'], 0.12),
];

export function sectorsOf(countryId: string): SectorDef[] {
  return SECTORS.filter((s) => s.countryId === countryId);
}

export function sectorById(id: string): SectorDef | undefined {
  return SECTORS.find((s) => s.id === id);
}

/** Distância de grande círculo (km) entre dois pontos. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
