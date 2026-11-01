import type { BuildingType } from './config.ts';

/**
 * Altura sólida de cada edifício (unidades de mundo), para o que voa baixo bater neles: o drone de ataque.
 *
 * É a altura do corpo do modelo 3D (`buildingModel(tipo).height`, medida em `src/test/buildingHeights.test.ts`, que
 * falha se um modelo crescer ou encolher sem atualizar esta tabela). Peças finas que ocupam pouco da área (mastro da
 * torre 5G, pás das turbinas, antenas) contam mais baixo: o drone passa ao lado delas na maior parte do terreno.
 */
export const BUILDING_SOLID_HEIGHT: Record<BuildingType, number> = {
  hq: 6,
  barracks: 2.6,
  factory: 2.8,
  farm: 0.6,
  sawmill: 2.5,
  quarry: 2.4,
  mine: 2.3,
  oil_well: 2.3,
  tower: 4.3,
  refinery: 3.6,
  steel_mill: 3.7,
  hospital: 1.8,
  school: 2.2,
  police_station: 1.5,
  house: 1.4,
  residential: 3.2,
  warehouse: 2,
  silo: 2.5,
  coal_plant: 3.6,
  wind_farm: 1.2,
  solar_farm: 0.5,
  oil_tank: 1.3,
  market: 1.5,
  port: 2.3,
  rail_station: 1.3,
  airbase: 1.2,
  aa_battery: 1,
  research_center: 1.6,
  city_hall: 4.1,
  nuclear_plant: 3.8,
  network_5g: 3,
  hydro_dam: 2.6,
  financial_center: 2.87,
  space_center: 8.8,
  tank_trap: 0.7,
  missile_silo: 0.9,
  iron_dome: 2.9,
};

/**
 * Tipos em que a tabela fica abaixo do modelo de propósito (área quase toda vazia por baixo: campo, turbinas, pista,
 * mastro). O teste aceita esses valores menores.
 */
export const SPARSE_BUILDINGS: readonly BuildingType[] = ['farm', 'wind_farm', 'airbase', 'network_5g', 'solar_farm'];
