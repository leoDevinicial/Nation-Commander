import { describe, expect, it } from 'vitest';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { AREA_COST, DEFAULT_AREAS } from '../strategic/areas.ts';
import { DAYS_PER_YEAR } from '../strategic/params.ts';
import { TREASURY, treasuryDay, type TreasuryInputs } from '../strategic/treasury.ts';

const quiet: TreasuryInputs = { production: {}, infantry: 0, vehicles: 0, aircraft: 0, energy: 0, buildingCells: 0, roads: 0, services: 0 };
const ctx = { scale: 1, productivity: 0, tradeGrowthPct: 0 };

describe('caixa do país', () => {
  it('produção vira receita; exército, energia, construções, estradas e serviços viram despesa (sem repasse fictício)', () => {
    const base = treasuryDay(quiet, ctx);
    // 16/11: não existe mais o "repasse do orçamento": sem produção nem impostos, nada entra
    expect(base.income.some((l) => l.key === 'transfer')).toBe(false);
    expect(base.net).toBe(0);
    const farms = treasuryDay({ ...quiet, production: { food: 10 } }, ctx);
    expect(farms.income.find((l) => l.key === 'production')!.usd).toBe(10 * TREASURY.price.food);
    const army = treasuryDay({ ...quiet, infantry: 10, vehicles: 5, aircraft: 2 }, ctx);
    expect(army.expense.find((l) => l.key === 'army')!.usd).toBe(10 * TREASURY.infantry + 5 * TREASURY.vehicle + 2 * TREASURY.aircraft);
    const upkeep = treasuryDay({ ...quiet, energy: 40, buildingCells: 100, roads: 30, services: 2 }, ctx);
    expect(upkeep.expense.map((l) => l.key)).toEqual(['army', 'energy', 'buildings', 'roads', 'services']);
    expect(upkeep.net).toBe(-40 * TREASURY.energy - 100 * TREASURY.buildingPerCell - 30 * TREASURY.road - 2 * TREASURY.service);
  });

  it('cidadãos e lotes pagam imposto conforme a alíquota residencial/comercial/industrial', () => {
    const z = (res: number) => ({ base: { res: 4, com: 2, ind: 0 }, tax: { res, com: 10, ind: 10 } });
    const at10 = treasuryDay({ ...quiet, citizens: 20, zoning: z(10) }, ctx);
    const at20 = treasuryDay({ ...quiet, citizens: 20, zoning: z(20) }, ctx);
    const line = (d: ReturnType<typeof treasuryDay>, k: string) => d.income.find((l) => l.key === k)?.usd ?? 0;
    expect(line(at10, 'tax_citizens')).toBe(20 * TREASURY.citizenTax);
    expect(line(at20, 'tax_citizens')).toBe(2 * line(at10, 'tax_citizens'));
    expect(line(at20, 'tax_res')).toBe(2 * line(at10, 'tax_res'));
    expect(line(at10, 'tax_com')).toBe(2 * TREASURY.lotTax.com);
    expect(at10.income.some((l) => l.key === 'tax_ind')).toBe(false);
  });

  it('as áreas do orçamento escalam o custo dos serviços, da manutenção e da defesa', () => {
    const inputs: TreasuryInputs = { ...quiet, buildingCells: 100, roads: 10, services: 3, serviceCounts: { hospital: 1, school: 1, police_station: 1 } };
    const at = (k: keyof typeof DEFAULT_AREAS, v: number) => treasuryDay(inputs, { ...ctx, areas: { ...DEFAULT_AREAS, [k]: v } });
    const usd = (d: ReturnType<typeof treasuryDay>, k: string) => d.expense.find((l) => l.key === k)!.usd;
    const ref = at('health', 100);
    expect(usd(ref, 'svc_health')).toBe(TREASURY.service);
    expect(usd(at('health', 150), 'svc_health')).toBe(1.5 * TREASURY.service);
    expect(usd(at('health', 50), 'svc_health')).toBe(0.5 * TREASURY.service);
    expect(usd(ref, 'defense')).toBe(AREA_COST.defenseDay);
    expect(usd(at('defense', 150), 'defense')).toBe(1.5 * AREA_COST.defenseDay);
    expect(usd(at('infrastructure', 50), 'buildings')).toBe(0.5 * usd(ref, 'buildings'));
    expect(usd(ref, 'social')).toBe(AREA_COST.socialDay);
  });

  it('produtividade, comércio e acordos entram no extrato do dia', () => {
    const d = treasuryDay({ ...quiet, production: { iron: 10 } }, { ...ctx, productivity: 0.2, tradeGrowthPct: 1, trade: { inUsd: 1_000_000, outUsd: 300_000, freightUsd: 20_000 } });
    const prod = 10 * TREASURY.price.iron;
    expect(d.income.find((l) => l.key === 'productivity')!.usd).toBe(Math.round(prod * 0.2));
    // acordos comerciais: fração da produção (até 1 ponto de crescimento vindo deles)
    expect(d.income.find((l) => l.key === 'trade')!.usd).toBe(Math.round(prod * TREASURY.tradePactShare));
    // a venda inteira entra no caixa (sem dívida), compras e fretes saem
    expect(d.income.find((l) => l.key === 'trade_in')!.usd).toBe(1_000_000);
    expect(d.expense.find((l) => l.key === 'trade_out')!.usd).toBe(300_000);
    expect(d.expense.find((l) => l.key === 'freight')!.usd).toBe(20_000);
  });

  it('sem caixa, o orçamento corta as áreas por igual, avisa, e o caixa nunca fica negativo', () => {
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }, { slot: 1, countryId: 'ARG' }], 1, 'parity');
    let army = 0;
    nat.attachTheater({
      resources: () => null,
      spend: () => {},
      setWar: () => {},
      stats: (slot) => (slot === 0 ? { buildings: {}, military: army, workers: 0, food: 0, economy: { ...quiet, production: { food: 20 }, vehicles: army } } : null),
    });
    const n = nat.nation(0)!;
    const start = n.works.fundUsd;
    nat.stepDay();
    expect(n.works.today!.net).toBeGreaterThan(0);
    expect(n.works.fundUsd).toBeCloseTo(start + n.works.today!.net, 0);
    expect(n.areasCut).toBeUndefined();
    army = 200;
    for (let d = 0; d < DAYS_PER_YEAR; d++) nat.stepDay();
    expect(n.works.fundUsd).toBe(0);
    expect(n.areasCut).toBeDefined();
    expect(Object.values(n.areasCut!).every((v) => v! >= 50)).toBe(true);
    expect(n.works.shortUsd).toBeGreaterThan(0);
    expect(n.approvalFactors.some((f) => f.key === 'unpaid')).toBe(true);
    expect(nat.drainEvents().some((e) => e.type === 'policy' && e.text.startsWith('Caixa sem saldo'))).toBe(true);
    // sem saldo, a obra é recusada
    expect(nat.chargeWorks(0, 1, 'teste')).toBe(false);
  });
});

describe('produção suavizada no caixa (23/11)', () => {
  it('a coleta que liga e desliga não faz o saldo do dia pular; a média acompanha a produção real', async () => {
    const { smoothProduction } = await import('../strategic/NationalSimulation.ts');
    const works = { fundUsd: 0, capUsd: 0, spentUsd: 0, ledger: [] };
    const base = { infantry: 0, vehicles: 0, aircraft: 0, energy: 0, buildingCells: 0, roads: 0, services: 0 };
    smoothProduction(works, { ...base, production: { stone: 10 } });
    // a pedreira pausa (armazém cheio) por um dia: antes, a receita da pedra ia a zero na hora
    const paused = smoothProduction(works, { ...base, production: {} })!;
    expect(paused.production.stone).toBeGreaterThan(8);
    // estável: a média chega ao valor real
    let last = paused;
    for (let i = 0; i < 60; i++) last = smoothProduction(works, { ...base, production: { stone: 4 } })!;
    expect(last.production.stone).toBeCloseTo(4, 1);
  });
});
