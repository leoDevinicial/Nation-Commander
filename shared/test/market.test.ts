import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { MARKET, marketBuyPrice, marketBuyQuote, marketPrice, marketQuote } from '../sim/market.ts';
import { parseCommand } from '../sim/commands.ts';
import { TacticalAI } from '../sim/TacticalAI.ts';
import { flatMap } from './helpers.ts';

function withMarket() {
  const sim = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
  const hq = sim.hqOf(0)!;
  const market = sim.addBuilding('market', 0, { cx: Math.round(hq.pos.x / sim.map.cellSize) + 4, cy: Math.round(hq.pos.y / sim.map.cellSize) }, 1);
  const p = sim.players[0]!;
  p.resources.wood = 2000;
  p.resources.supplies = 0;
  return { sim, market, p };
}

describe('mercado interno (excedente → suprimentos)', () => {
  it('vende pelo preço com pressão: o preço cai com as vendas e volta com o tempo', () => {
    const { sim, market, p } = withMarket();
    const gain = marketQuote('wood', 0, 500);
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(500 * MARKET.rates.wood);
    expect(sim.applyCommand(0, { type: 'market_sell', buildingId: market.id, resource: 'wood', quantity: 500 })).toBeNull();
    expect(p.resources.wood).toBe(1500);
    expect(p.resources.supplies).toBe(gain);
    expect(p.marketPressure?.wood).toBe(500);
    // a segunda venda igual rende menos
    expect(marketQuote('wood', 500, 500)).toBeLessThan(gain);
    // a pressão some com o tempo
    for (let i = 0; i < 60 * TICK_RATE; i++) sim.step();
    expect(p.marketPressure?.wood ?? 0).toBeCloseTo(500 - 60 * MARKET.recoveryPerSec, 0);
    expect(marketPrice('wood', p.marketPressure?.wood ?? 0)).toBeGreaterThan(marketPrice('wood', 500));
  });

  it('picar a venda não rende mais do que vender de uma vez', () => {
    let pressure = 0;
    let picado = 0;
    for (let i = 0; i < 10; i++) {
      picado += marketQuote('iron', pressure, 100);
      pressure += 100;
    }
    expect(picado).toBeLessThanOrEqual(marketQuote('iron', 0, 1000));
    expect(picado).toBeGreaterThanOrEqual(marketQuote('iron', 0, 1000) - 10);
  });

  it('recusa sem terminal pronto, sem estoque e com o armazém de suprimentos cheio', () => {
    const { sim, market, p } = withMarket();
    expect(sim.applyCommand(0, { type: 'market_sell', buildingId: market.id, resource: 'stone', quantity: 100 })).toMatch(/Estoque insuficiente/);
    expect(sim.applyCommand(0, { type: 'market_sell', buildingId: sim.hqOf(0)!.id, resource: 'wood', quantity: 100 })).toMatch(/Terminal Comercial/);
    p.resources.supplies = sim.capacity(0).supplies;
    expect(sim.applyCommand(0, { type: 'market_sell', buildingId: market.id, resource: 'wood', quantity: 100 })).toMatch(/Sem espaço/);
    market.progress = 0.5;
    p.resources.supplies = 0;
    expect(sim.applyCommand(0, { type: 'market_sell', buildingId: market.id, resource: 'wood', quantity: 100 })).toMatch(/em obra/);
    // de outro jogador, nunca
    market.progress = 1;
    expect(sim.applyCommand(1, { type: 'market_sell', buildingId: market.id, resource: 'wood', quantity: 100 })).toMatch(/Terminal Comercial/);
  });

  it('o comando valida recurso e quantidade; a pressão sobrevive a salvar e carregar', () => {
    expect(parseCommand({ type: 'market_sell', buildingId: 1, resource: 'supplies', quantity: 100 })).toBeNull();
    expect(parseCommand({ type: 'market_sell', buildingId: 1, resource: 'wood', quantity: -5 })).toBeNull();
    expect(parseCommand({ type: 'market_sell', buildingId: 1, resource: 'wood', quantity: 100 })).toEqual({ type: 'market_sell', buildingId: 1, resource: 'wood', quantity: 100 });
    const { sim, market } = withMarket();
    sim.applyCommand(0, { type: 'market_sell', buildingId: market.id, resource: 'wood', quantity: 300 });
    expect(Simulation.fromSave(sim.toSave()).players[0]!.marketPressure?.wood).toBe(300);
  });

  it('compra com suprimentos: custa mais do que a venda rende, encarece com a demanda e volta com o tempo', () => {
    const { sim, market, p } = withMarket();
    p.resources.supplies = 1000;
    const iron = p.resources.iron;
    const cost = marketBuyQuote('iron', 0, 100);
    // comprar e revender sempre dá prejuízo
    expect(cost).toBeGreaterThan(marketQuote('iron', 0, 100));
    expect(sim.applyCommand(0, { type: 'market_buy', buildingId: market.id, resource: 'iron', quantity: 100 })).toBeNull();
    expect(p.resources.iron).toBe(iron + 100);
    expect(p.resources.supplies).toBe(1000 - cost);
    expect(p.marketDemand?.iron).toBe(100);
    // a próxima compra igual custa mais; com o tempo o preço volta
    expect(marketBuyQuote('iron', 100, 100)).toBeGreaterThan(cost);
    for (let i = 0; i < 60 * TICK_RATE; i++) sim.step();
    expect(p.marketDemand?.iron).toBeUndefined();
    expect(marketBuyPrice('iron', 0)).toBeCloseTo(MARKET.rates.iron * MARKET.buySpread, 6);
  });

  it('compra: picar não sai mais barato; recusa sem suprimentos ou sem espaço no armazém', () => {
    const { sim, market, p } = withMarket();
    let parts = 0;
    for (let k = 0; k < 5; k++) parts += marketBuyQuote('food', k * 100, 100);
    expect(parts).toBeGreaterThanOrEqual(marketBuyQuote('food', 0, 500));
    p.resources.supplies = 10;
    expect(sim.applyCommand(0, { type: 'market_buy', buildingId: market.id, resource: 'food', quantity: 100 })).toMatch(/Suprimentos insuficientes/);
    p.resources.supplies = 5000;
    p.resources.food = sim.capacity(0).food - 50;
    expect(sim.applyCommand(0, { type: 'market_buy', buildingId: market.id, resource: 'food', quantity: 100 })).toMatch(/Sem espaço/);
    expect(parseCommand({ type: 'market_buy', buildingId: market.id, resource: 'supplies', quantity: 100 })).toBeNull();
    expect(parseCommand({ type: 'market_buy', buildingId: market.id, resource: 'oil', quantity: 100 })).toEqual({ type: 'market_buy', buildingId: market.id, resource: 'oil', quantity: 100 });
  });

  it('a IA vende o excedente por suprimentos e guarda uma reserva', () => {
    const { sim, market, p } = withMarket();
    p.resources.wood = 3000;
    const ai = new TacticalAI(0);
    const sale = ai.think(sim).find((c) => c.type === 'market_sell');
    expect(sale).toBeTruthy();
    if (sale?.type !== 'market_sell') return;
    expect(sale.buildingId).toBe(market.id);
    expect(sale.resource).toBe('wood');
    // sem sobra (só a reserva), não vende
    p.resources.wood = 400;
    sim.tick += 60 * TICK_RATE;
    expect(ai.think(sim).some((c) => c.type === 'market_sell')).toBe(false);
  });
});
