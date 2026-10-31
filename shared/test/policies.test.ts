import { describe, expect, it } from 'vitest';
import type { Cost } from '../sim/config.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { NationalAI } from '../strategic/NationalAI.ts';
import { DECREE_MIN_DAYS, FACTION, REQUEST, policyEffects, type TheaterStats } from '../strategic/policies.ts';
import { meet } from './helpers.ts';

/** Decretos, facções e pedidos das potências (lote 1, §4). */

const run = (sim: NationalSimulation, days: number) => {
  for (let i = 0; i < days; i++) sim.stepDay();
};

function setup(stats: TheaterStats | null = null) {
  const sim = new NationalSimulation(
    [
      { slot: 0, countryId: 'BRA' },
      { slot: 1, countryId: 'ARG' },
    ],
    7,
    'parity',
  );
  const grants: Cost[] = [];
  const st = { stats };
  sim.attachTheater({
    resources: () => ({ supplies: 1000, food: 0, wood: 0, stone: 0, iron: 0, oil: 1000, coal: 0 }),
    spend: () => {},
    setWar: () => {},
    stats: () => st.stats,
    grant: (_slot, cost) => grants.push(cost),
  });
  return { sim, grants, st };
}

const policyText = (sim: NationalSimulation) =>
  sim
    .drainEvents()
    .filter((e) => e.type === 'policy' && e.slot === 0)
    .map((e) => (e.type === 'policy' ? e.text : ''));

describe('decretos', () => {
  it('efeito duplo: alistamento barateia recrutas e custa aprovação; revogar exige 30 dias', () => {
    const { sim } = setup();
    expect(sim.setDecree(0, 'conscription', true)).toBeNull();
    expect(sim.setDecree(0, 'conscription', true)).toMatch(/já em vigor/);
    const fx = policyEffects(sim.nation(0)!.policies);
    expect(fx.recruitCostMul).toBeCloseTo(0.6);
    expect(fx.approval).toBeLessThan(0);
    run(sim, 1);
    expect(sim.nation(0)!.approvalFactors.some((f) => f.key === 'policy' && f.value < 0)).toBe(true);
    expect(sim.setDecree(0, 'conscription', false)).toMatch(/precisa vigorar/);
    run(sim, DECREE_MIN_DAYS);
    expect(sim.setDecree(0, 'conscription', false)).toBeNull();
    expect(policyEffects(sim.nation(0)!.policies).recruitCostMul).toBe(1);
  });

  it('economia de guerra acelera a produção e sobe a inflação; lei marcial segura protestos', () => {
    const a = setup().sim;
    const b = setup().sim;
    a.setDecree(0, 'war_economy', true);
    run(a, 120);
    run(b, 120);
    expect(policyEffects(a.nation(0)!.policies).productionTimeMul).toBeCloseTo(0.8);
    expect(a.nation(0)!.inflationPct).toBeGreaterThan(b.nation(0)!.inflationPct);
    const m = setup().sim;
    m.setDecree(0, 'martial_law', true);
    const fx = policyEffects(m.nation(0)!.policies);
    expect(fx.protestMul).toBeCloseTo(0.3);
    expect(fx.stability).toBe(10);
  });
});

describe('facções', () => {
  it('exigência cumprida no teatro rende recursos, satisfação e aprovação', () => {
    const { sim, grants, st } = setup({ buildings: {}, military: 0, workers: 0, food: 0 });
    run(sim, FACTION.firstDay + 40);
    const p = sim.nation(0)!.policies!;
    const open = Object.entries(p.factions).filter(([, f]) => f.demand);
    expect(open.length).toBeGreaterThan(0);
    expect(policyText(sim).some((t) => t.includes('exigem'))).toBe(true);
    // tudo o que pode ser pedido no teatro passa a existir
    st.stats = { buildings: { barracks: 3, airbase: 1, factory: 3, mine: 3, market: 1, farm: 5, silo: 3, residential: 1, house: 5 }, military: 30, workers: 40, food: 900 };
    const before = Object.fromEntries(open.map(([id, f]) => [id, f.satisfaction]));
    run(sim, 1);
    const texts = policyText(sim);
    expect(texts.some((t) => t.includes('satisfeitas'))).toBe(true);
    expect(grants.length).toBeGreaterThan(0);
    const raised = open.filter(([id]) => p.factions[id as keyof typeof p.factions].satisfaction > before[id]!);
    expect(raised.length).toBeGreaterThan(0);
    expect(p.favor).toBeGreaterThan(0);
  });

  it('exigência ignorada até o prazo frustra a facção; facção em protesto reduz a coleta', () => {
    const { sim } = setup({ buildings: {}, military: 0, workers: 0, food: 0 });
    run(sim, FACTION.firstDay + 40 + FACTION.deadlineDays);
    expect(policyText(sim).some((t) => t.includes('frustradas'))).toBe(true);
    const p = sim.nation(0)!.policies!;
    p.factions.agro.satisfaction = 10;
    expect(policyEffects(p).gatherMul).toBeCloseTo(0.9);
    p.factions.military.satisfaction = 10;
    expect(policyEffects(p).productionTimeMul).toBeCloseTo(1.1);
  });
});

describe('pedidos das potências', () => {
  it('uma potência conhecida pede algo com prazo; cumprir melhora a relação, recusar piora', () => {
    const { sim } = setup();
    for (const n of sim.npcs) meet(sim, 0, n.slot);
    run(sim, REQUEST.firstDay);
    const r = sim.nation(0)!.policies!.request!;
    expect(r).toBeTruthy();
    expect(policyText(sim).some((t) => t.includes('pede'))).toBe(true);
    const rel0 = sim.diplomacy.relation(0, r.from);
    // força um pedido simples de cumprir: reforçar a defesa
    r.request = { kind: 'defense', pct: sim.nation(0)!.budget.defensePct + 0.5 };
    sim.setBudget(0, { ...sim.nation(0)!.budget, defensePct: sim.nation(0)!.budget.defensePct + 1 });
    const debt = sim.nation(0)!.debtUsd;
    run(sim, 1);
    expect(sim.nation(0)!.policies!.request).toBeNull();
    expect(sim.diplomacy.relation(0, r.from)).toBeGreaterThan(rel0);
    expect(sim.nation(0)!.debtUsd).toBeLessThan(debt + debt * 0.01);
    // próximo pedido: recusado
    run(sim, REQUEST.gapDays);
    const next = sim.nation(0)!.policies!.request!;
    expect(next).toBeTruthy();
    const rel1 = sim.diplomacy.relation(0, next.from);
    expect(sim.respondRequest(0, false)).toBeNull();
    expect(sim.diplomacy.relation(0, next.from)).toBeLessThan(rel1);
  });

  it('"não declarar guerra": declarar falha o pedido', () => {
    const { sim } = setup();
    for (const n of sim.npcs) meet(sim, 0, n.slot);
    meet(sim, 0, 1);
    run(sim, REQUEST.firstDay);
    const r = sim.nation(0)!.policies!.request!;
    r.request = { kind: 'no_war', target: 1 };
    const rel = sim.diplomacy.relation(0, r.from);
    expect(sim.declareWar(0, 1)).toBeNull();
    run(sim, 1);
    expect(policyText(sim).some((t) => t.includes('não cumprido'))).toBe(true);
    expect(sim.diplomacy.relation(0, r.from)).toBeLessThan(rel);
  });

  it('salvar e carregar mantém decretos, facções e pedido', () => {
    const { sim } = setup();
    for (const n of sim.npcs) meet(sim, 0, n.slot);
    sim.setDecree(0, 'rationing', true);
    run(sim, REQUEST.firstDay);
    const copy = setup().sim;
    copy.load(sim.toSave());
    expect(copy.nation(0)!.policies).toEqual(sim.nation(0)!.policies);
  });
});

describe('IA nacional e decretos', () => {
  it('em guerra, a IA decreta economia de guerra', () => {
    const { sim } = setup();
    meet(sim, 0, 1);
    expect(sim.declareWar(0, 1)).toBeNull();
    const r = new NationalAI(1).think(sim);
    expect(r.decrees).toContainEqual({ id: 'war_economy', active: true });
  });
});
