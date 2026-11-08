import { BUILDINGS, type BuildingType, type ResourceType } from '../sim/config.ts';
import { gatherRate } from '../sim/gathering.ts';
import { powerUse } from '../sim/power.ts';
import type { ZoneKind } from '../sim/zoning.ts';

/**
 * Caixa do país no teatro (01/11, pedido do usuário: "não sei quanto estou ganhando ou perdendo de dinheiro e de onde
 * vem esse 75"). O antigo "verba de obras" vira o caixa: todo dia entram as receitas e saem as despesas, e o saldo
 * paga as melhorias, estradas, Grandes Projetos e avanços de era.
 *
 * Receitas: repasse do orçamento federal (a fatia de infraestrutura, como antes), a produção do teatro vendida no
 * mercado interno (fazendas, coletas e indústrias), a produtividade (infraestrutura e educação), exportações e acordos
 * comerciais. Despesas: manutenção do exército (cresce com cada tropa; veículos e aviões custam mais), energia
 * consumida, manutenção das construções e das estradas e os serviços públicos.
 *
 * Os preços são em US$ por dia de jogo para um PIB de referência de US$ 1 tri (`scale` ajusta ao PIB do país).
 */
export const TREASURY = {
  /** US$ por unidade produzida (1 dia de jogo = 1 s; a coleta é medida por segundo). */
  price: { food: 4_500, wood: 4_500, stone: 4_500, iron: 8_000, oil: 10_000, coal: 6_000, supplies: 6_000 } as Record<ResourceType, number>,
  /** Acordos comerciais: % do repasse por ponto percentual de crescimento vindo dos acordos. */
  tradePactShare: 0.25,
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
  lotTax: { res: 1_800, com: 4_500, ind: 7_500 } as Record<ZoneKind, number>,
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
  ctx: { transferUsd: number; scale: number; productivity: number; tradeGrowthPct: number; trade?: { inUsd: number; outUsd: number; freightUsd: number } },
): TreasuryDay {
  const k = ctx.scale;
  const sumProd = inputs ? Object.entries(inputs.production).reduce((a, [r, v]) => a + (v ?? 0) * TREASURY.price[r as ResourceType], 0) : 0;
  const production = sumProd * k;
  const income: TreasuryLine[] = [
    { key: 'transfer', label: 'Repasse do orçamento (infraestrutura)', usd: ctx.transferUsd },
    { key: 'production', label: 'Produção (fazendas, coletas e indústrias)', usd: production },
    { key: 'productivity', label: 'Produtividade (infraestrutura e educação)', usd: production * ctx.productivity },
    { key: 'trade', label: 'Acordos comerciais', usd: ctx.transferUsd * TREASURY.tradePactShare * Math.max(0, ctx.tradeGrowthPct) },
  ];
  // comércio (02/11): o valor inteiro de cada venda entregue entra no caixa; compras e fretes saem dele
  if (ctx.trade?.inUsd) income.push({ key: 'trade_in', label: 'Vendas no comércio (cargas entregues)', usd: ctx.trade.inUsd });
  // impostos do zoneamento: um por setor, só quando há lotes
  const z = inputs?.zoning;
  if (z)
    for (const [kind, label] of [
      ['res', 'Imposto residencial'],
      ['com', 'Imposto comercial'],
      ['ind', 'Imposto industrial'],
    ] as const)
      if (z.base[kind] > 0) income.push({ key: `tax_${kind}`, label: `${label} (${z.tax[kind]}%)`, usd: z.base[kind] * TREASURY.lotTax[kind] * (z.tax[kind] / 10) * k });
  const expense: TreasuryLine[] = inputs
    ? [
        { key: 'army', label: 'Manutenção do exército', usd: (inputs.infantry * TREASURY.infantry + inputs.vehicles * TREASURY.vehicle + inputs.aircraft * TREASURY.aircraft) * k },
        { key: 'energy', label: 'Energia consumida', usd: inputs.energy * TREASURY.energy * k },
        { key: 'buildings', label: 'Manutenção das construções', usd: inputs.buildingCells * TREASURY.buildingPerCell * k },
        { key: 'roads', label: 'Manutenção das estradas', usd: inputs.roads * TREASURY.road * k },
        { key: 'services', label: 'Serviços públicos', usd: inputs.services * TREASURY.service * k },
      ]
    : [];
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
