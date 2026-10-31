import type { AircraftType } from './air.ts';
import type { BuildingType, Cost, MilitaryResearchId, UnitType } from './config.ts';

/**
 * Progressão por eras (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 1, §3.1): o eixo central da
 * partida. Avançar é uma obra cara no Centro de Comando (recursos do teatro e US$ da verba de
 * obras), com nível mínimo do QG. Cada era troca a aparência das construções e libera aos poucos
 * tropas, veículos, construções e níveis de melhoria.
 */
export type Era = 1 | 2 | 3 | 4;
export const ERA_IDS: readonly Era[] = [1, 2, 3, 4];

export interface EraDef {
  label: string;
  /** Aparência das construções (texto do painel). */
  look: string;
  /** Requisito e custo para entrar nesta era (a era 1 é o começo). */
  hqLevel: number;
  cost: Cost;
  /** Custo em US$ como fração do teto anual da verba de obras do país (escala com a economia). */
  usdShare: number;
  seconds: number;
  /** Nível máximo das melhorias nesta era. */
  maxUpgradeLevel: number;
}

export const ERAS: Record<Era, EraDef> = {
  1: {
    label: 'Guerra Fria',
    look: 'Concreto aparente, tijolo, telhado de zinco, pintura verde-oliva e antenas simples',
    hqLevel: 1,
    cost: {},
    usdShare: 0,
    seconds: 0,
    maxUpgradeLevel: 6,
  },
  2: {
    label: 'Pós-Guerra Fria',
    look: 'Galpões metálicos pré-fabricados, cercas, guaritas e os primeiros radares',
    hqLevel: 3,
    cost: { supplies: 300, wood: 200, stone: 150, iron: 80 },
    usdShare: 0.15,
    seconds: 60,
    maxUpgradeLevel: 6,
  },
  3: {
    label: 'Era Digital',
    look: 'Vidro e aço, antenas de telecomunicação, painéis solares e camuflagem digital nos veículos',
    hqLevel: 5,
    cost: { supplies: 700, stone: 450, iron: 350, oil: 250 },
    usdShare: 0.3,
    seconds: 90,
    maxUpgradeLevel: 8,
  },
  4: {
    label: 'Futuro Próximo',
    look: 'Estruturas compostas, telas e iluminação de LED e drones de vigilância',
    hqLevel: 7,
    cost: { supplies: 1200, stone: 600, iron: 700, oil: 500 },
    usdShare: 0.5,
    seconds: 120,
    maxUpgradeLevel: 10,
  },
};

/** Era em que cada tropa passa a existir (a pesquisa militar dela só abre nessa era). */
export const UNIT_ERA: Record<UnitType, Era> = {
  infantry: 1,
  apc: 1,
  tank: 2,
  artillery: 2,
  at_infantry: 2,
  mobile_aa: 3,
  ciws: 3,
  special_forces: 3,
  rocket_artillery: 3,
  mbt: 4,
  engineer: 2,
  scout: 1,
};

/** Era das construções (as ausentes existem desde a Guerra Fria). */
export const BUILDING_ERA: Partial<Record<BuildingType, Era>> = {
  research_center: 2,
  residential: 2,
  market: 2,
  port: 2,
  rail_station: 2,
  aa_battery: 2,
  airbase: 3,
  missile_silo: 4,
  iron_dome: 4,
  nuclear_plant: 4,
  network_5g: 4,
  hydro_dam: 4,
  financial_center: 4,
  space_center: 4,
  tank_trap: 2,
  refinery: 2,
  steel_mill: 2,
  hospital: 2,
  wind_farm: 2,
  solar_farm: 3,
};

/** Aeronaves: caças, reconhecimento e cargueiros na Era Digital; bombardeiros no Futuro Próximo. */
export const AIRCRAFT_ERA: Record<AircraftType, Era> = { fighter: 3, recon: 3, transport: 3, bomber: 4 };

export const buildingEra = (t: BuildingType): Era => BUILDING_ERA[t] ?? 1;

/** Era da pesquisa militar: a da tropa que ela libera. */
export function researchEra(id: MilitaryResearchId, units: Record<UnitType, { requires?: MilitaryResearchId }>): Era {
  for (const [u, def] of Object.entries(units) as [UnitType, { requires?: MilitaryResearchId }][]) if (def.requires === id) return UNIT_ERA[u];
  return 1;
}

export const eraLabel = (e: number): string => ERAS[(Math.min(4, Math.max(1, e)) as Era)].label;

/** Nome da era como título ("Era Guerra Fria", "Era Digital"): sem repetir o "Era" de quem já começa com ele. */
export const eraTitle = (e: number): string => {
  const l = eraLabel(e);
  return l.startsWith('Era ') ? l : `Era ${l}`;
};

/** A era no meio da frase ("a era Guerra Fria", "a Era Digital"): para "Requer ${eraPhrase(e)}". */
export const eraPhrase = (e: number): string => {
  const l = eraLabel(e);
  return l.startsWith('Era ') ? `a ${l}` : `a era ${l}`;
};

/** Avanço de era em andamento (obra no Centro de Comando). */
export interface EraAdvance {
  to: Era;
  remainingTicks: number;
  totalTicks: number;
  paid: Cost;
  usd: number;
}

/** Fração devolvida ao cancelar o avanço. */
export const ERA_CANCEL_REFUND = 0.75;
