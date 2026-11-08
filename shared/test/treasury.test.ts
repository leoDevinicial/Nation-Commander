import { describe, expect, it } from 'vitest';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { DAYS_PER_YEAR } from '../strategic/params.ts';
import { TREASURY, treasuryDay, type TreasuryInputs } from '../strategic/treasury.ts';

const quiet: TreasuryInputs = { production: {}, infantry: 0, vehicles: 0, aircraft: 0, energy: 0, buildingCells: 0, roads: 0, services: 0 };
const ctx = { transferUsd: 200_000, scale: 1, productivity: 0, tradeGrowthPct: 0 };

describe('caixa do país', () => {
  it('produção vira receita; exército, energia, construções, estradas e serviços viram despesa', () => {
    const base = treasuryDay(quiet, ctx);
    expect(base.net).toBe(200_000);
    const farms = treasuryDay({ ...quiet, production: { food: 10 } }, ctx);
    expect(farms.income.find((l) => l.key === 'production')!.usd).toBe(10 * TREASURY.price.food);
    const army = treasuryDay({ ...quiet, infantry: 10, vehicles: 5, aircraft: 2 }, ctx);
    expect(army.expense.find((l) => l.key === 'army')!.usd).toBe(10 * TREASURY.infantry + 5 * TREASURY.vehicle + 2 * TREASURY.aircraft);
    // mais tropas, mais gasto: um exército grande deixa o saldo negativo
    expect(treasuryDay({ ...quiet, vehicles: 60 }, ctx).net).toBeLessThan(0);
    const upkeep = treasuryDay({ ...quiet, energy: 40, buildingCells: 100, roads: 30, services: 2 }, ctx);
    expect(upkeep.expense.map((l) => l.key)).toEqual(['army', 'energy', 'buildings', 'roads', 'services']);
    expect(upkeep.net).toBe(200_000 - 40 * TREASURY.energy - 100 * TREASURY.buildingPerCell - 30 * TREASURY.road - 2 * TREASURY.service);
  });

  it('produtividade, comércio e acordos entram no extrato do dia', () => {
    const d = treasuryDay({ ...quiet, production: { iron: 10 } }, { ...ctx, productivity: 0.2, tradeGrowthPct: 1, trade: { inUsd: 1_000_000, outUsd: 300_000, freightUsd: 20_000 } });
    const prod = 10 * TREASURY.price.iron;
    expect(d.income.find((l) => l.key === 'productivity')!.usd).toBe(Math.round(prod * 0.2));
    expect(d.income.find((l) => l.key === 'trade')!.usd).toBe(Math.round(200_000 * TREASURY.tradePactShare));
    // a venda inteira entra no caixa (sem dívida), compras e fretes saem
    expect(d.income.find((l) => l.key === 'trade_in')!.usd).toBe(1_000_000);
    expect(d.expense.find((l) => l.key === 'trade_out')!.usd).toBe(300_000);
    expect(d.expense.find((l) => l.key === 'freight')!.usd).toBe(20_000);
  });

  it('na simulação nacional, o caixa recebe o saldo do dia e pode ficar negativo', () => {
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }, { slot: 1, countryId: 'ARG' }], 1, 'parity');
    let army = 0;
    nat.attachTheater({
      resources: () => null,
      spend: () => {},
      setWar: () => {},
      stats: (slot) => (slot === 0 ? { buildings: {}, military: army, workers: 0, food: 0, economy: { ...quiet, vehicles: army } } : null),
    });
    const n = nat.nation(0)!;
    const start = n.works.fundUsd;
    nat.stepDay();
    expect(n.works.today!.net).toBeGreaterThan(0);
    expect(n.works.fundUsd).toBeCloseTo(start + n.works.today!.net, 0);
    army = 200;
    for (let d = 0; d < DAYS_PER_YEAR; d++) nat.stepDay();
    expect(n.works.today!.net).toBeLessThan(0);
    expect(n.works.fundUsd).toBeLessThan(0);
    // sem saldo, a obra é recusada
    expect(nat.chargeWorks(0, 1, 'teste')).toBe(false);
  });
});
