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

  S('GBR', 'londres', 'Londres e Sudeste', 51.5, -0.1, 'temperate', { coast: true, river: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.45),
  S('GBR', 'midlands', 'Midlands e Norte (Birmingham e Manchester)', 53, -2, 'temperate', { river: true }, ['road', 'rail', 'industry'], 0.22),
  S('GBR', 'escocia', 'Escócia e Mar do Norte', 56.5, -3.5, 'cold', { coast: true, mountains: true }, ['road', 'port', 'oil'], 0.08),

  S('CHN', 'litoral', 'Litoral Leste (Xangai e Jiangsu)', 31.2, 121.5, 'temperate', { coast: true, river: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.3),
  S('CHN', 'sul', 'Delta do Rio das Pérolas (Guangdong)', 23.1, 113.3, 'tropical', { coast: true, river: true }, ['road', 'rail', 'port', 'industry'], 0.2),
  S('CHN', 'norte', 'Planície do Norte (Pequim e Hebei)', 39.9, 116.4, 'temperate', {}, ['road', 'rail', 'industry', 'airfield'], 0.15),
  S('CHN', 'oeste', 'Oeste (Sichuan e Chongqing)', 30.6, 104.1, 'temperate', { river: true, mountains: true }, ['road', 'rail', 'industry'], 0.08),

  S('ITA', 'norte', 'Planície do Pó (Milão e Turim)', 45.4, 9.2, 'temperate', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.4),
  S('ITA', 'centro', 'Centro (Roma e Toscana)', 42.5, 12, 'temperate', { coast: true, mountains: true }, ['road', 'rail', 'port'], 0.22),
  S('ITA', 'sul', 'Sul e Sicília (Nápoles)', 40.8, 14.3, 'arid', { coast: true, mountains: true }, ['road', 'port', 'oil'], 0.15),

  S('CAN', 'ontario', 'Ontário (Toronto)', 43.7, -79.4, 'temperate', { coast: true, river: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.38),
  S('CAN', 'quebec', 'Quebec (Montreal)', 45.5, -73.6, 'cold', { river: true }, ['road', 'rail', 'port', 'industry'], 0.2),
  S('CAN', 'alberta', 'Alberta (areias betuminosas)', 53.5, -113.5, 'grassland', { river: true }, ['road', 'rail', 'oil'], 0.15),
  S('CAN', 'columbia', 'Colúmbia Britânica (Vancouver)', 49.3, -123.1, 'cold', { coast: true, mountains: true }, ['road', 'port'], 0.13),

  S('SAU', 'leste', 'Província Oriental (Dhahran e Ghawar)', 26.3, 50, 'arid', { coast: true }, ['road', 'port', 'oil', 'industry', 'airfield'], 0.4),
  S('SAU', 'riad', 'Riad e Najd', 24.7, 46.7, 'arid', {}, ['road', 'rail', 'airfield'], 0.3),
  S('SAU', 'hejaz', 'Hejaz (Jidá)', 21.5, 39.2, 'arid', { coast: true, mountains: true }, ['road', 'port'], 0.18),

  S('ESP', 'madri', 'Madri e Meseta', 40.4, -3.7, 'arid', {}, ['road', 'rail', 'industry', 'airfield'], 0.3),
  S('ESP', 'catalunha', 'Catalunha (Barcelona)', 41.4, 2.2, 'temperate', { coast: true, mountains: true }, ['road', 'rail', 'port', 'industry'], 0.25),
  S('ESP', 'andaluzia', 'Andaluzia (Sevilha)', 37.4, -6, 'arid', { coast: true, river: true }, ['road', 'port'], 0.13),

  S('EGY', 'cairo', 'Cairo e Delta do Nilo', 30.05, 31.2, 'arid', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.45),
  S('EGY', 'suez', 'Canal de Suez', 30.6, 32.3, 'arid', { coast: true }, ['road', 'port', 'oil'], 0.2),
  S('EGY', 'alexandria', 'Alexandria e Costa Mediterrânea', 31.2, 29.9, 'arid', { coast: true }, ['road', 'rail', 'port', 'oil'], 0.15),

  S('RUS', 'moscou', 'Moscou e Rússia Central', 55.8, 37.6, 'cold', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.35),
  S('RUS', 'sao_petersburgo', 'São Petersburgo e Noroeste', 59.9, 30.3, 'cold', { coast: true, river: true }, ['road', 'rail', 'port', 'industry'], 0.12),
  S('RUS', 'volga', 'Volga e Urais', 55.8, 49.1, 'grassland', { river: true }, ['road', 'rail', 'oil', 'industry'], 0.15),
  S('RUS', 'siberia', 'Sibéria Ocidental (Tyumen)', 61, 69, 'cold', { river: true }, ['road', 'oil', 'airfield'], 0.12),

  S('TUR', 'marmara', 'Mármara (Istambul)', 41, 28.98, 'temperate', { coast: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.4),
  S('TUR', 'anatolia', 'Anatólia Central (Ancara)', 39.9, 32.9, 'arid', { mountains: true }, ['road', 'rail', 'industry'], 0.15),
  S('TUR', 'egeu', 'Egeu e Mediterrâneo (Izmir)', 38.4, 27.1, 'temperate', { coast: true, mountains: true }, ['road', 'port'], 0.15),

  S('KOR', 'seul', 'Seul e Incheon', 37.5, 126.9, 'temperate', { coast: true, river: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.5),
  S('KOR', 'sudeste', 'Sudeste (Busan e Ulsan)', 35.3, 129.2, 'temperate', { coast: true, mountains: true }, ['road', 'rail', 'port', 'industry'], 0.22),
  S('KOR', 'centro', 'Centro (Daejeon)', 36.35, 127.4, 'temperate', { mountains: true, river: true }, ['road', 'rail', 'airfield'], 0.1),

  S('PRK', 'pyongyang', 'Pyongyang e Planície Ocidental', 39, 125.75, 'cold', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.4),
  S('PRK', 'nampo', 'Nampo e Costa Oeste', 38.73, 125.4, 'cold', { coast: true }, ['road', 'port', 'industry'], 0.15),
  S('PRK', 'leste', 'Costa Leste (Hamhung e Wonsan)', 39.9, 127.5, 'cold', { coast: true, mountains: true }, ['road', 'rail', 'port'], 0.2),

  S('NGA', 'lagos', 'Lagos e Sudoeste', 6.5, 3.4, 'tropical', { coast: true }, ['road', 'port', 'industry', 'airfield'], 0.35),
  S('NGA', 'delta', 'Delta do Níger (Port Harcourt)', 4.8, 7, 'tropical', { coast: true, river: true }, ['road', 'port', 'oil'], 0.2),
  S('NGA', 'norte', 'Norte (Kano e Kaduna)', 11.5, 8.5, 'arid', {}, ['road', 'rail', 'airfield'], 0.15),
  S('NGA', 'centro', 'Centro (Abuja)', 9.1, 7.4, 'grassland', { river: true }, ['road', 'airfield'], 0.08),

  S('IDN', 'java', 'Java Ocidental (Jacarta e Bandung)', -6.6, 107.2, 'tropical', { coast: true, mountains: true }, ['road', 'rail', 'port', 'industry', 'airfield'], 0.45),
  S('IDN', 'java_leste', 'Java Oriental (Surabaia)', -7.3, 112.7, 'tropical', { coast: true }, ['road', 'rail', 'port', 'industry'], 0.15),
  S('IDN', 'sumatra', 'Sumatra (Medan e Riau)', 1.5, 101, 'tropical', { coast: true, river: true }, ['road', 'port', 'oil'], 0.2),
  S('IDN', 'kalimantan', 'Kalimantan Oriental', -0.5, 117, 'tropical', { coast: true, river: true }, ['road', 'port', 'oil'], 0.07),

  S('IRN', 'teera', 'Teerã e Planalto Central', 35.7, 51.4, 'arid', { mountains: true }, ['road', 'rail', 'industry', 'airfield'], 0.4),
  S('IRN', 'cuzistao', 'Cuzistão (campos de petróleo)', 31.3, 48.7, 'arid', { coast: true, river: true }, ['road', 'rail', 'port', 'oil'], 0.15),
  S('IRN', 'isfahan', 'Isfahan e Centro', 32.65, 51.67, 'arid', { mountains: true }, ['road', 'rail', 'industry', 'airfield'], 0.12),
  S('IRN', 'golfo', 'Bandar Abbas e Golfo', 27.2, 56.3, 'arid', { coast: true }, ['road', 'port', 'oil'], 0.08),

  S('POL', 'mazovia', 'Varsóvia e Mazóvia', 52.2, 21, 'temperate', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.3),
  S('POL', 'silesia', 'Silésia e Pequena Polônia (Katowice e Cracóvia)', 50.2, 19.4, 'temperate', { mountains: true }, ['road', 'rail', 'industry'], 0.2),
  S('POL', 'pomerania', 'Pomerânia (Gdańsk)', 54.35, 18.6, 'temperate', { coast: true }, ['road', 'rail', 'port', 'industry'], 0.1),
  S('POL', 'grande_polonia', 'Grande Polônia (Poznań)', 52.4, 16.9, 'grassland', {}, ['road', 'rail', 'industry'], 0.1),

  S('COL', 'bogota', 'Bogotá e Cundinamarca', 4.7, -74.1, 'temperate', { mountains: true }, ['road', 'industry', 'airfield'], 0.32),
  S('COL', 'antioquia', 'Antioquia (Medellín)', 6.25, -75.6, 'tropical', { mountains: true, river: true }, ['road', 'industry'], 0.15),
  S('COL', 'caribe', 'Costa do Caribe (Barranquilla e Cartagena)', 10.7, -75, 'tropical', { coast: true, river: true }, ['road', 'port', 'industry'], 0.12),
  S('COL', 'llanos', 'Llanos Orientais (Meta e Casanare)', 4.2, -72.5, 'grassland', { river: true }, ['road', 'oil'], 0.07),

  S('PAK', 'punjab', 'Punjab (Lahore e Faisalabad)', 31.5, 73.5, 'grassland', { river: true }, ['road', 'rail', 'industry', 'airfield'], 0.45),
  S('PAK', 'sindh', 'Karachi e Sindh', 24.9, 67.1, 'arid', { coast: true, river: true }, ['road', 'rail', 'port', 'industry'], 0.25),
  S('PAK', 'norte', 'Islamabad e Norte', 33.7, 73.05, 'cold', { mountains: true }, ['road', 'airfield'], 0.08),
  S('PAK', 'baluchistao', 'Baluchistão (Quetta e Gwadar)', 28, 65, 'arid', { coast: true, mountains: true }, ['road', 'port'], 0.03),
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
