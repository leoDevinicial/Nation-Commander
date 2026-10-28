import type { ResourceType, UnitType } from './config.ts';

/**
 * Bônus único de cada país (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 2, item 12): pouca regra e
 * muita identidade. Cada país tem um bônus pequeno, mostrado na sala e no painel nacional. Todos
 * usam os mesmos ganchos do motor (custo, tempo, vida, coleta, antiaérea, atrito).
 */
export interface CountryBonus {
  title: string;
  description: string;
  /** Multiplicador de custo (recursos) por tropa. */
  unitCostMul?: Partial<Record<UnitType, number>>;
  /** Multiplicador de vida por tropa. */
  unitHpMul?: Partial<Record<UnitType, number>>;
  /** Tempo de produção das tropas militares. */
  unitTimeMul?: number;
  /** Custo dos recrutas. */
  recruitCostMul?: number;
  /** Tempo das obras. */
  buildTimeMul?: number;
  /** Coleta por recurso. */
  gatherMul?: Partial<Record<ResourceType, number>>;
  /** Custo das aeronaves (recursos e US$). */
  aircraftCostMul?: number;
  /** Chance da antiaérea própria (baterias e antiaérea móvel) contra aviões e mísseis. */
  aaMul?: number;
  /** Atrito em território inimigo. */
  attritionMul?: number;
  /** Velocidade na floresta. */
  forestSpeedMul?: number;
}

export const COUNTRY_BONUS: Record<string, CountryBonus> = {
  BRA: { title: 'Guerra na selva', description: 'Tropas 25% mais rápidas na floresta e metade do atrito em território inimigo.', forestSpeedMul: 1.25, attritionMul: 0.5 },
  ARG: { title: 'Celeiro do mundo', description: '+25% de comida colhida.', gatherMul: { food: 1.25 } },
  USA: { title: 'Logística aérea', description: 'Aeronaves 30% mais baratas.', aircraftCostMul: 0.7 },
  MEX: { title: 'Indústria de montagem', description: 'Veículo Blindado 20% mais barato.', unitCostMul: { apc: 0.8 } },
  DEU: { title: 'Engenharia blindada', description: 'Tanques e Tanques Modernos com 15% mais vida.', unitHpMul: { tank: 1.15, mbt: 1.15 } },
  FRA: { title: 'Força de intervenção', description: 'Forças Especiais e Infantaria Antitanque 20% mais baratas.', unitCostMul: { special_forces: 0.8, at_infantry: 0.8 } },
  IND: { title: 'Grande reserva humana', description: 'Recrutas 25% mais baratos.', recruitCostMul: 0.75 },
  JPN: { title: 'Eficiência industrial', description: 'Obras 15% mais rápidas.', buildTimeMul: 0.85 },
  ZAF: { title: 'Minerais estratégicos', description: '+30% de ferro extraído.', gatherMul: { iron: 1.3 } },
  AUS: { title: 'Mineração em escala', description: '+20% de pedra e ferro extraídos.', gatherMul: { stone: 1.2, iron: 1.2 } },
  GBR: { title: 'Forças especiais de elite', description: 'Forças Especiais com 20% mais vida e 15% mais baratas.', unitHpMul: { special_forces: 1.2 }, unitCostMul: { special_forces: 0.85 } },
  CHN: { title: 'Produção em massa', description: 'Tropas produzidas 20% mais rápido.', unitTimeMul: 0.8 },
  ITA: { title: 'Engenharia civil', description: 'Obras 12% mais rápidas e +10% de pedra.', buildTimeMul: 0.88, gatherMul: { stone: 1.1 } },
  CAN: { title: 'Recursos florestais', description: '+25% de madeira extraída.', gatherMul: { wood: 1.25 } },
  SAU: { title: 'Petróleo abundante', description: '+30% de petróleo extraído.', gatherMul: { oil: 1.3 } },
  ESP: { title: 'Infantaria de montanha', description: 'Infantaria 15% mais barata e 10% mais resistente.', unitCostMul: { infantry: 0.85 }, unitHpMul: { infantry: 1.1 } },
  EGY: { title: 'Muralha antiaérea', description: 'Antiaérea própria 20% mais eficaz contra aviões e mísseis.', aaMul: 1.2 },
  RUS: { title: 'Artilharia em massa', description: 'Artilharia e Lança-Foguetes 25% mais baratos.', unitCostMul: { artillery: 0.75, rocket_artillery: 0.75 } },
  TUR: { title: 'Indústria de defesa', description: 'Antiaérea Móvel e Veículo Blindado 15% mais baratos.', unitCostMul: { mobile_aa: 0.85, apc: 0.85 } },
  KOR: { title: 'Defesa antiaérea superior', description: 'Antiaérea própria 30% mais eficaz contra aviões e mísseis.', aaMul: 1.3 },
  PRK: { title: 'Exército de massa', description: 'Artilharia 20% mais barata e recrutas 15% mais baratos.', unitCostMul: { artillery: 0.8 }, recruitCostMul: 0.85 },
  NGA: { title: 'Gigante do petróleo africano', description: '+20% de petróleo extraído e recrutas 10% mais baratos.', gatherMul: { oil: 1.2 }, recruitCostMul: 0.9 },
  IDN: { title: 'Guerra nas ilhas e matas', description: 'Tropas 20% mais rápidas na floresta e +15% de madeira.', forestSpeedMul: 1.2, gatherMul: { wood: 1.15 } },
  IRN: { title: 'Dissuasão por foguetes', description: 'Lança-Foguetes 20% mais barato e antiaérea própria 15% mais eficaz.', unitCostMul: { rocket_artillery: 0.8 }, aaMul: 1.15 },
  POL: { title: 'Muralha blindada do leste', description: 'Tanques Modernos 15% mais baratos e Artilharia 10% mais barata.', unitCostMul: { mbt: 0.85, artillery: 0.9 } },
  COL: { title: 'Contrainsurgência', description: 'Forças Especiais com 15% mais vida e tropas 15% mais rápidas na floresta.', unitHpMul: { special_forces: 1.15 }, forestSpeedMul: 1.15 },
  PAK: { title: 'Exército de montanha', description: 'Infantaria e Infantaria Antitanque 15% mais baratas.', unitCostMul: { infantry: 0.85, at_infantry: 0.85 } },
};

const NONE: CountryBonus = { title: '', description: '' };

export function countryBonus(countryId: string | undefined): CountryBonus {
  return (countryId && COUNTRY_BONUS[countryId]) || NONE;
}
