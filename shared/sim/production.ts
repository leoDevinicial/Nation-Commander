import {
  BUILDINGS,
  MILITARY_RESEARCH,
  CITIZEN,
  GOODS,
  GOODS_TYPES,
  GOODS_USE,
  POP_ABSOLUTE_CAP,
  PRODUCTION_QUEUE_LIMIT,
  RECRUIT,
  RESOURCE_TYPES,
  UNITS,
  canAfford,
  type BuildingType,
  type Cost,
  type Goods,
  type ProducibleType,
  type Stockpile,
} from './config.ts';
import { buildingEffects, missingText, scaledCost, type SpecId } from './upgrades.ts';
import { addCost, productionStandard, type ModId } from './modernization.ts';
import type { CountryBonus } from './countryBonus.ts';
import { UNIT_ERA, eraPhrase } from './eras.ts';

/**
 * Regra única de produção (cidadão, recruta e unidades militares): o servidor valida com ela e o
 * HUD a usa para mostrar, antes do clique, o custo real e o motivo exato de um botão bloqueado —
 * inclusive no celular, onde não há dica de mouse.
 */
export interface ProduceContext {
  buildingType: BuildingType;
  level: number;
  spec: SpecId | null;
  /** Construção concluída (1) ou em obra. */
  progress: number;
  queueLength: number;
  resources: Stockpile;
  recruits: number;
  popTotal: number;
  popCap: number;
  /** Pesquisas concluídas do país: definem o padrão de equipamento da linha (null = sem camada nacional). */
  techs: readonly string[] | null;
  /** Pesquisas militares concluídas no Centro de Pesquisa (liberam tropas novas). */
  militaryResearch: readonly string[];
  /** Decreto de alistamento: multiplicador do custo dos recrutas (padrão 1). */
  recruitCostMul?: number;
  /** Bônus único do país (custo de tropas e recrutas). */
  bonus?: CountryBonus;
  /** Era da nação (tropas de eras futuras ficam bloqueadas; ausente = todas). */
  era?: number;
  /** Bens industriais em estoque: substituem parte do custo quando bastam (ausente = sem bens). */
  goods?: Goods;
}

export interface ProduceCheck {
  /** Custo já com nível e especialização do edifício e com o equipamento do padrão vigente. */
  cost: Cost;
  /** Pacotes de modernização com que a unidade sai da linha (vazio para cidadão e recruta). */
  mods: ModId[];
  /** Parte do custo que paga esses pacotes. */
  equipmentCost: Cost;
  /** Motivo completo da recusa (o mesmo texto que o servidor devolve), ou null se pode produzir. */
  blocker: string | null;
  /** Versão curta para caber no botão ("sem recruta", "fila cheia", "faltam 20 petróleo"). */
  short: string | null;
  /**
   * A unidade sai sem a modernização de linha porque os recursos não cobrem o equipamento
   * (dá para instalar depois numa instalação compatível). Evita travar a produção sem ferro.
   */
  basic: boolean;
  /** Bens industriais usados no lugar de parte do custo (já descontado em `cost`). */
  goods: Partial<Goods>;
}

/**
 * Cadeias produtivas: com bens em estoque, cada unidade de bem paga `GOODS.saves` do recurso bruto
 * (combustível no lugar do petróleo, aço no lugar do ferro). Sem estoque suficiente, custo cheio.
 */
export function substituteGoods(cost: Cost, use: Partial<Goods> | undefined, goods: Goods | undefined): { cost: Cost; goods: Partial<Goods> } {
  const used: Partial<Goods> = {};
  if (!use || !goods) return { cost, goods: used };
  const out = { ...cost };
  for (const g of GOODS_TYPES) {
    const u = use[g] ?? 0;
    const raw = GOODS.raw[g];
    if (u <= 0 || goods[g] < u || !(out[raw] ?? 0)) continue;
    out[raw] = Math.max(0, (out[raw] ?? 0) - u * GOODS.saves);
    used[g] = u;
  }
  return { cost: out, goods: used };
}

const SHORT_RES: Record<string, string> = { supplies: 'supr.', food: 'comida', wood: 'madeira', stone: 'pedra', iron: 'ferro', oil: 'petróleo' };

function firstMissing(have: Stockpile, cost: Cost): string {
  for (const r of RESOURCE_TYPES) {
    const need = Math.ceil((cost[r] ?? 0) - have[r]);
    if (need > 0) return `faltam ${need} ${SHORT_RES[r]}`;
  }
  return 'sem recursos';
}

export function checkProduce(unit: ProducibleType, c: ProduceContext): ProduceCheck {
  const fx = buildingEffects(c.buildingType, c.level, c.spec);
  const civil = unit === 'citizen' || unit === 'recruit';
  const std = civil ? { mods: [] as ModId[], extra: {} as Cost } : productionStandard(unit, c.techs);
  const base = unit === 'citizen' ? CITIZEN.cost : unit === 'recruit'
        ? scaledCost(RECRUIT.cost, fx.recruitCostMul * (c.recruitCostMul ?? 1) * (c.bonus?.recruitCostMul ?? 1))
        : scaledCost(UNITS[unit].cost, fx.unitCostMul * (c.bonus?.unitCostMul?.[unit] ?? 1), fx.unitOilMul);
  let cost = addCost(base, std.extra);
  let eq = { mods: std.mods, equipmentCost: std.extra };
  let basic = false;
  // sem recursos para o equipamento, mas com o bastante para a unidade básica: sai sem ele
  if (std.mods.length && !canAfford(c.resources, cost) && canAfford(c.resources, base)) {
    cost = base;
    eq = { mods: [], equipmentCost: {} };
    basic = true;
  }
  const sub = substituteGoods(cost, civil ? undefined : GOODS_USE[unit], c.goods);
  cost = sub.cost;
  const goods = sub.goods;
  const no = (blocker: string, short: string): ProduceCheck => ({ cost, ...eq, blocker, short, basic, goods });
  if (c.progress < 1) return no('Edifício em construção', 'em obra');
  if (c.queueLength >= PRODUCTION_QUEUE_LIMIT) return no('Fila de produção cheia', 'fila cheia');
  if (civil) {
    // a Prefeitura funciona como um centro de comando secundário da cidade
    if (unit === 'citizen' && c.buildingType !== 'hq' && c.buildingType !== 'city_hall') return no('Cidadãos são formados no Centro de Comando ou numa Prefeitura', 'só no QG');
    if (unit === 'recruit' && c.buildingType !== 'barracks') return no('Recrutas são alistados na base militar (quartel)', 'só no quartel');
    if (c.popTotal >= c.popCap)
      return c.popCap >= POP_ABSOLUTE_CAP
        ? no(`Limite nacional de ${POP_ABSOLUTE_CAP} habitantes atingido`, `limite ${POP_ABSOLUTE_CAP}`)
        : no(`Sem moradia: ${c.popTotal}/${c.popCap}. Construa casas ou prédios residenciais (ou perca unidades) para liberar espaço`, 'sem moradia');
  } else {
    const def = UNITS[unit];
    if (def.producedBy !== c.buildingType) return no(`${BUILDINGS[c.buildingType].label} não produz ${def.label}`, 'outro edifício');
    if (c.era !== undefined && UNIT_ERA[unit] > c.era) return no(`Requer ${eraPhrase(UNIT_ERA[unit])} (avance de era no Centro de Comando)`, `era ${UNIT_ERA[unit]}`);
    if (def.requires && !c.militaryResearch.includes(def.requires))
      return no(`Requer a pesquisa "${MILITARY_RESEARCH[def.requires].label}" no Centro de Pesquisa Militar`, 'pesquisar');
    // cada unidade militar precisa de um recruta da reserva como tripulação
    if (c.recruits < 1) return no('Nenhum recruta disponível: aliste recrutas na base militar (quartel)', 'sem recruta');
  }
  if (!canAfford(c.resources, cost)) return no(`Recursos insuficientes: faltam ${missingText(c.resources, cost)}`, firstMissing(c.resources, cost));
  return { cost, ...eq, blocker: null, short: null, basic, goods };
}
