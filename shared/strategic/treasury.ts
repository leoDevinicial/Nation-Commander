import { BUILDINGS, type BuildingType, type ResourceType } from '../sim/config.ts';
import { gatherRate } from '../sim/gathering.ts';
import { powerUse } from '../sim/power.ts';
import type { ZoneKind } from '../sim/zoning.ts';
import { AREA_COST, SERVICE_AREA, level, type Areas } from './areas.ts';

/**
 * Caixa do país no teatro (01/11, pedido do usuário: "não sei quanto estou ganhando ou perdendo de dinheiro e de onde
 * vem esse 75"). O antigo "verba de obras" vira o caixa: todo dia entram as receitas e saem as despesas, e o saldo
 * paga as melhorias, estradas, Grandes Projetos e avanços de era.
 *
 * Receitas (16/11: sem o antigo "repasse do orçamento", que vinha de uma macroeconomia fictícia): a produção do teatro
 * vendida no mercado interno (fazendas, coletas e indústrias), a produtividade (infraestrutura e educação), os acordos
 * comerciais, as vendas no comércio e os impostos dos lotes. Despesas: manutenção do exército (cresce com cada tropa;
 * veículos e aviões custam mais), energia consumida, manutenção das construções e das estradas, os serviços públicos e
 * as áreas do orçamento (`areas.ts`: cada uma de 50% a 150%).
 *
 * Os preços são em US$ por dia de jogo (`scale` fica em 1: todos os países jogam com a mesma escala).
 */
export const TREASURY = {
  /** US$ por unidade produzida (1 dia de jogo = 1 s; a coleta é medida por segundo). */
  price: { food: 7_000, wood: 7_000, stone: 7_000, iron: 12_500, oil: 15_500, coal: 9_500, supplies: 9_500 } as Record<ResourceType, number>,
  /** Acordos comerciais: fração da produção por ponto percentual de crescimento vindo dos acordos (até 1 ponto). */
  tradePactShare: 0.2,
  /** Manutenção do exército por dia: infantaria, veículo e aeronave (08/11: 1/5 do original, "absurdos de caro"). */
  infantry: 1_200,
  vehicle: 4_000,
  aircraft: 8_000,
  /** Energia: por unidade de consumo atendida por dia. */
  energy: 1_500,
  /** Manutenção por construção pronta (por célula de área) e por célula de estrada. */
  buildingPerCell: 400,
  road: 600,
  /** Serviços públicos: por Hospital, Escola, Universidade, Delegacia e Prefeitura (02/11: mais caros). */
  service: 30_000,
  /** Zoneamento (02/11): imposto por lote ativo e por dia com a alíquota de 10% (escala com a alíquota). */
  lotTax: { res: 4_500, com: 11_000, ind: 18_000 } as Record<ZoneKind, number>,
  /**
   * Imposto dos cidadãos (16/11): cada cidadão (empregado ou não; militares não) paga por dia com a alíquota
   * residencial a 10% (escala com ela). Substitui o antigo repasse: o caixa do começo vem da população.
   */
  citizenTax: 2_200,
} as const;

export interface TreasuryInputs {
  /** Produção por segundo de cada recurso no teatro. */
  production: Partial<Record<ResourceType, number>>;
  infantry: number;
  vehicles: number;
  aircraft: number;
  /** Consumo de energia atendido agora. */
  energy: number;
  /** Soma da área (células) das construções prontas, sem o Centro de Comando. */
  buildingCells: number;
  roads: number;
  services: number;
  /** Serviços por tipo (16/11): cada um paga pela área do orçamento que o governa (`SERVICE_AREA`). */
  serviceCounts?: Partial<Record<BuildingType, number>>;
  /** Cidadãos (16/11: pagam o imposto residencial). */
  citizens?: number;
  /** Zoneamento: lotes ativos por setor (prédio conta 3) e alíquotas (%). */
  zoning?: { base: Record<ZoneKind, number>; tax: Record<ZoneKind, number> };
}

export interface TreasuryLine {
  key: string;
  label: string;
  usd: number;
}

export interface TreasuryDay {
  income: TreasuryLine[];
  expense: TreasuryLine[];
  net: number;
}

export function treasuryDay(
  inputs: TreasuryInputs | null,
  ctx: { scale: number; productivity: number; tradeGrowthPct: number; trade?: { inUsd: number; outUsd: number; freightUsd: number }; areas?: Areas; incomeMul?: number; extra?: TreasuryLine[] },
): TreasuryDay {
  const k = ctx.scale;
  const sumProd = inputs ? Object.entries(inputs.production).reduce((a, [r, v]) => a + (v ?? 0) * TREASURY.price[r as ResourceType], 0) : 0;
  const production = sumProd * k * (ctx.incomeMul ?? 1);
  const income: TreasuryLine[] = [
    { key: 'production', label: 'Produção (fazendas, coletas e indústrias)', usd: production },
    { key: 'productivity', label: 'Produtividade (infraestrutura e educação)', usd: production * ctx.productivity },
    { key: 'trade', label: 'Acordos comerciais', usd: production * TREASURY.tradePactShare * Math.min(1, Math.max(0, ctx.tradeGrowthPct)) },
  ];
  // comércio (02/11): o valor inteiro de cada venda entregue entra no caixa; compras e fretes saem dele
  if (ctx.trade?.inUsd) income.push({ key: 'trade_in', label: 'Vendas no comércio (cargas entregues)', usd: ctx.trade.inUsd });
  // impostos do zoneamento: um por setor, só quando há lotes
  const z = inputs?.zoning;
  if (inputs?.citizens)
    income.push({ key: 'tax_citizens', label: `Imposto dos cidadãos (${z?.tax.res ?? 10}%)`, usd: inputs.citizens * TREASURY.citizenTax * ((z?.tax.res ?? 10) / 10) * k * (ctx.incomeMul ?? 1) });
  if (z)
    for (const [kind, label] of [
      ['res', 'Imposto residencial'],
      ['com', 'Imposto comercial'],
      ['ind', 'Imposto industrial'],
    ] as const)
      if (z.base[kind] > 0) income.push({ key: `tax_${kind}`, label: `${label} (${z.tax[kind]}%)`, usd: z.base[kind] * TREASURY.lotTax[kind] * (z.tax[kind] / 10) * k * (ctx.incomeMul ?? 1) });
  const a = ctx.areas;
  const infra = a ? level(a, 'infrastructure') : 1;
  const expense: TreasuryLine[] = inputs
    ? [
        { key: 'army', label: 'Manutenção do exército', usd: (inputs.infantry * TREASURY.infantry + inputs.vehicles * TREASURY.vehicle + inputs.aircraft * TREASURY.aircraft) * k },
        { key: 'energy', label: 'Energia consumida', usd: inputs.energy * TREASURY.energy * k },
        { key: 'buildings', label: a ? `Manutenção das construções (infraestrutura ${a.infrastructure}%)` : 'Manutenção das construções', usd: inputs.buildingCells * TREASURY.buildingPerCell * k * infra },
        { key: 'roads', label: a ? `Manutenção das estradas (infraestrutura ${a.infrastructure}%)` : 'Manutenção das estradas', usd: inputs.roads * TREASURY.road * k * infra },
      ]
    : [];
  if (inputs && a) {
    // 16/11: cada serviço paga pela área que o governa (hospital → Saúde, escola → Educação...)
    const by: Partial<Record<keyof Areas, number>> = {};
    if (!inputs.serviceCounts && inputs.services) expense.push({ key: 'services', label: 'Serviços públicos', usd: inputs.services * TREASURY.service * k });
    for (const [t, c] of Object.entries(inputs.serviceCounts ?? {})) {
      const area = SERVICE_AREA[t as BuildingType];
      if (area && c) by[area] = (by[area] ?? 0) + c;
    }
    for (const [area, label] of [
      ['education', 'Educação: escolas e universidades'],
      ['health', 'Saúde: hospitais'],
      ['security', 'Segurança: delegacias'],
    ] as const)
      if (by[area]) expense.push({ key: `svc_${area}`, label: `${label} (${a[area]}%)`, usd: by[area]! * TREASURY.service * k * level(a, area) });
    expense.push({ key: 'social', label: `Assistência e administração (${a.social}%)`, usd: (AREA_COST.socialDay + (by.social ?? 0) * TREASURY.service) * k * level(a, 'social') });
    expense.push({ key: 'defense', label: `Defesa: logística militar (${a.defense}%)`, usd: AREA_COST.defenseDay * k * level(a, 'defense') });
  } else if (inputs) expense.push({ key: 'services', label: 'Serviços públicos', usd: inputs.services * TREASURY.service * k });
  if (ctx.extra) expense.push(...ctx.extra.filter((l) => l.usd > 0));
  if (ctx.trade?.outUsd) expense.push({ key: 'trade_out', label: 'Compras no comércio (cargas recebidas)', usd: ctx.trade.outUsd });
  if (ctx.trade?.freightUsd) expense.push({ key: 'freight', label: 'Fretes', usd: ctx.trade.freightUsd });
  const round = (l: TreasuryLine) => ({ ...l, usd: Math.round(l.usd) });
  const inc = income.map(round);
  const exp = expense.map(round);
  return { income: inc, expense: exp, net: inc.reduce((a, l) => a + l.usd, 0) - exp.reduce((a, l) => a + l.usd, 0) };
}

/** Construções que pagam serviço público por dia (as mesmas que o servidor conta em `treasuryInputs`). */
export const SERVICE_BUILDINGS: ReadonlySet<BuildingType> = new Set(['hospital', 'school', 'university', 'police_station', 'city_hall']);

/** Parte das células de coleta que uma construção costuma alcançar (estimativa do cartão; ao posicionar, o valor exato). */
export const TYPICAL_CLAIM_SHARE = 0.75;

/**
 * Quanto uma construção pronta soma ao caixa do país por dia (05/11, cartão de construção: "verde se rende, vermelho se
 * custa"), pelas mesmas contas de `treasuryDay`: a produção que ela coleta (estimada com 75% das células ao alcance,
 * ou `rate` quando já se sabe) menos a manutenção da área, o serviço público e a energia na era da nação. `scale` é a
 * escala do PIB (`research.usdScale`). Bônus e produtividade ficam de fora (estimativa conservadora).
 */
export function buildingDayUsd(type: BuildingType, opts: { era: number; scale: number; rate?: number }): { produce: number; area: number; service: number; energy: number; net: number } {
  const def = BUILDINGS[type];
  const k = opts.scale;
  const g = def.gather;
  const rate = g ? (opts.rate ?? gatherRate(type, Math.max(g.minCells, Math.round(g.maxCells * TYPICAL_CLAIM_SHARE)))) : 0;
  const produce = g ? rate * TREASURY.price[g.resource] * k : 0;
  const area = type === 'hq' ? 0 : def.size * def.size * TREASURY.buildingPerCell * k;
  const service = SERVICE_BUILDINGS.has(type) ? TREASURY.service * k : 0;
  const energy = powerUse(type, opts.era) * TREASURY.energy * k;
  return { produce, area, service, energy, net: produce - area - service - energy };
}
