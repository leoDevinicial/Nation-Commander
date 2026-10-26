import { BUILDINGS, CITIZEN, POP_ABSOLUTE_CAP, PRODUCTION_QUEUE_LIMIT, RECRUIT, RESOURCE_TYPES, UNITS, canAfford, type BuildingType, type Cost, type ProducibleType, type Stockpile } from './config.ts';
import { buildingEffects, missingText, scaledCost, type SpecId } from './upgrades.ts';
import { addCost, productionStandard, type ModId } from './modernization.ts';

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
  const base = unit === 'citizen' ? CITIZEN.cost : unit === 'recruit' ? scaledCost(RECRUIT.cost, fx.recruitCostMul) : scaledCost(UNITS[unit].cost, fx.unitCostMul, fx.unitOilMul);
  const cost = addCost(base, std.extra);
  const eq = { mods: std.mods, equipmentCost: std.extra };
  const no = (blocker: string, short: string): ProduceCheck => ({ cost, ...eq, blocker, short });
  if (c.progress < 1) return no('Edifício em construção', 'em obra');
  if (c.queueLength >= PRODUCTION_QUEUE_LIMIT) return no('Fila de produção cheia', 'fila cheia');
  if (civil) {
    if (unit === 'citizen' && c.buildingType !== 'hq') return no('Cidadãos são formados no Centro de Comando', 'só no QG');
    if (unit === 'recruit' && c.buildingType !== 'barracks') return no('Recrutas são alistados na base militar (quartel)', 'só no quartel');
    if (c.popTotal >= c.popCap)
      return c.popCap >= POP_ABSOLUTE_CAP
        ? no(`Limite nacional de ${POP_ABSOLUTE_CAP} habitantes atingido`, `limite ${POP_ABSOLUTE_CAP}`)
        : no(`Sem moradia: ${c.popTotal}/${c.popCap}. Construa casas ou prédios residenciais (ou perca unidades) para liberar espaço`, 'sem moradia');
  } else {
    const def = UNITS[unit];
    if (def.producedBy !== c.buildingType) return no(`${BUILDINGS[c.buildingType].label} não produz ${def.label}`, 'outro edifício');
    // cada unidade militar precisa de um recruta da reserva como tripulação
    if (c.recruits < 1) return no('Nenhum recruta disponível: aliste recrutas na base militar (quartel)', 'sem recruta');
  }
  if (!canAfford(c.resources, cost)) return no(`Recursos insuficientes: faltam ${missingText(c.resources, cost)}`, firstMissing(c.resources, cost));
  return { cost, ...eq, blocker: null, short: null };
}
