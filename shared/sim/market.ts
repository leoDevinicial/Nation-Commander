import { TICK_RATE, type ResourceType } from './config.ts';

/**
 * Mercado interno do Terminal Comercial (docs/MERCADO_INTERNO.md): troca o excedente de comida, madeira, pedra,
 * ferro e petróleo por suprimentos. O preço de cada recurso cai à medida que se vende (pressão de mercado) e
 * volta ao normal com o tempo, como num mercado local saturado: vender aos poucos rende o mesmo que vender de uma
 * vez, e despejar o estoque inteiro rende cada vez menos.
 */
export type MarketResource = Exclude<ResourceType, 'supplies'>;
export const MARKET_RESOURCES: MarketResource[] = ['food', 'wood', 'stone', 'iron', 'oil'];
export const isMarketResource = (v: unknown): v is MarketResource => typeof v === 'string' && (MARKET_RESOURCES as string[]).includes(v);

export const MARKET = {
  /** Suprimentos por unidade vendida, sem pressão (proporcional ao preço internacional de cada recurso). */
  rates: { food: 0.3, wood: 0.25, stone: 0.2, iron: 0.5, oil: 0.6 } as Record<MarketResource, number>,
  /** Profundidade: com esta pressão acumulada, o preço do recurso cai à metade. */
  depth: 1000,
  /** Pressão que some por segundo, em cada recurso (1.000 unidades vendidas se recuperam em ~8 min). */
  recoveryPerSec: 2,
  /** Lotes oferecidos no painel. */
  lots: [100, 500] as const,
};

/** Preço atual (suprimentos por unidade) com a pressão acumulada. */
export function marketPrice(resource: MarketResource, pressure: number): number {
  return (MARKET.rates[resource] * MARKET.depth) / (MARKET.depth + Math.max(0, pressure));
}

/**
 * Suprimentos recebidos por `quantity` unidades: a integral do preço enquanto a pressão sobe. Vender em lotes
 * pequenos ou de uma vez rende o mesmo, fora o arredondamento (sem vantagem em picar a venda).
 */
export function marketQuote(resource: MarketResource, pressure: number, quantity: number): number {
  if (quantity <= 0) return 0;
  const p = Math.max(0, pressure);
  return Math.floor(MARKET.rates[resource] * MARKET.depth * Math.log((MARKET.depth + p + quantity) / (MARKET.depth + p)));
}

/** Recuperação da pressão em um tick. */
export function marketRecover(pressure: Partial<Record<MarketResource, number>>): void {
  const step = MARKET.recoveryPerSec / TICK_RATE;
  for (const r of MARKET_RESOURCES) {
    const v = pressure[r];
    if (v === undefined) continue;
    if (v <= step) delete pressure[r];
    else pressure[r] = v - step;
  }
}
