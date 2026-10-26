import { describe, expect, it } from 'vitest';
import { BUILDINGS, RESOURCE_TYPES, TICK_RATE, Terrain, UNITS, type BuildingType, type Stockpile } from '../sim/config.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { makeSnapshot } from '../sim/snapshot.ts';
import {
  HQ_LEVEL_LEAD,
  INFRA_GATE_LEVEL,
  MAX_UPGRADE_LEVEL,
  UPGRADES,
  UPGRADE_CANCEL_REFUND,
  UPGRADE_WORK_EFFICIENCY,
  buildingEffects,
  compareEffects,
  upgradeCost,
  type SpecId,
} from '../sim/upgrades.ts';
import type { Building, Cell } from '../sim/types.ts';
import { flatMap } from './helpers.ts';

const run = (s: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) s.step();
};

/** Camada nacional de teste: pesquisas, condições e verba controláveis, com extrato. */
function fakeNation(over: Partial<{ techs: string[]; infra: number; stability: number; fund: number }> = {}) {
  const st = { techs: over.techs ?? [], infra: over.infra ?? 1, stability: over.stability ?? 60, fund: over.fund ?? 1e9, ledger: [] as number[] };
  const link: NationalLink = {
    techs: () => st.techs,
    infrastructureIndex: () => st.infra,
    stability: () => st.stability,
    worksFundUsd: () => st.fund,
    chargeWorks: (_s, usd) => {
      if (st.fund < usd) return false;
      st.fund -= usd;
      st.ledger.push(usd);
      return true;
    },
    refundWorks: (_s, usd) => {
      st.fund += usd;
      st.ledger.push(-usd);
    },
  };
  return { st, link };
}

const fertile = flatMap(32, (set) => {
  for (let y = 0; y < 2; y++) for (let x = 12; x < 16; x++) set(x, y, Terrain.Fertile);
});

function sim(link: NationalLink | null = fakeNation().link, map = fertile) {
  const s = new Simulation({ map, playerCount: 2, startingUnits: [] });
  s.national = link;
  return s;
}

const RICH: Stockpile = { supplies: 50_000, food: 50_000, wood: 50_000, stone: 50_000, iron: 50_000, oil: 0 };
const rich = (s: Simulation, slot = 0) => (s.players[slot]!.resources = { ...RICH });

/** Constrói e conclui um edifício pelo comando validado. */
function build(s: Simulation, slot: number, type: BuildingType, cell: Cell): Building {
  const err = s.applyCommand(slot, { type: 'build', buildingType: type, cx: cell.cx, cy: cell.cy });
  expect(err).toBeNull();
  const b = s.buildings.filter((x) => x.type === type && x.owner === slot).at(-1)!;
  run(s, b.buildTicks + 1);
  return b;
}

/** Leva o edifício ao próximo nível pelo caminho real (comando + tempo de obra). */
function upgrade(s: Simulation, b: Building, spec?: SpecId): void {
  const err = s.applyCommand(b.owner, spec ? { type: 'upgrade', buildingId: b.id, spec } : { type: 'upgrade', buildingId: b.id });
  expect(err).toBeNull();
  run(s, b.upgrade!.totalTicks + 1);
  expect(b.upgrade).toBeNull();
}

describe('dados das melhorias', () => {
  it('nível 1 reproduz exatamente os valores de base de todas as classes', () => {
    for (const type of Object.keys(BUILDINGS) as BuildingType[]) {
      const def = BUILDINGS[type];
      const fx = buildingEffects(type, 1, null);
      expect(fx.maxHp).toBe(def.maxHp);
      expect(fx.workers).toBe(def.workers);
      expect(fx.housing).toBe(def.housing);
      expect(fx.territoryRadius).toBe(def.territoryRadius);
      expect(fx.storage).toEqual(def.storage);
      expect(fx.income).toEqual(def.income);
      expect(fx.upkeep).toEqual(def.upkeep);
      expect([fx.rateMul, fx.depletionMul, fx.productionTimeMul, fx.unitCostMul, fx.unitHpMul, fx.damageMul]).toEqual([1, 1, 1, 1, 1, 1]);
    }
  });

  it('trilhas orientadas por dados: até 10 níveis, custos e tempos crescentes', () => {
    for (const [type, t] of Object.entries(UPGRADES) as [BuildingType, NonNullable<(typeof UPGRADES)[BuildingType]>][]) {
      expect(t.maxLevel).toBeGreaterThanOrEqual(2);
      expect(t.maxLevel).toBeLessThanOrEqual(MAX_UPGRADE_LEVEL);
      for (let l = 3; l <= t.maxLevel; l++) {
        const a = upgradeCost(type, l - 1);
        const b = upgradeCost(type, l);
        for (const r of RESOURCE_TYPES) expect(b.cost[r] ?? 0).toBeGreaterThanOrEqual(a.cost[r] ?? 0);
        expect(b.usd).toBeGreaterThan(a.usd);
        expect(b.seconds).toBeGreaterThanOrEqual(a.seconds);
      }
      if (t.specLevel !== undefined) expect(t.specLevel).toBeLessThanOrEqual(t.maxLevel);
      expect(upgradeCost(type, t.maxLevel + 1).usd).toBe(0);
    }
  });

  it('especializações: cada uma tem vantagem e custo/perda claros — nenhuma é superior em tudo', () => {
    for (const [type, t] of Object.entries(UPGRADES) as [BuildingType, NonNullable<(typeof UPGRADES)[BuildingType]>][]) {
      if (!t.specs) continue;
      const plain = buildingEffects(type, t.specLevel!, null);
      for (const spec of t.specs) {
        expect(spec.pros.length).toBeGreaterThan(0);
        expect(spec.cons.length).toBeGreaterThan(0);
        const withSpec = buildingEffects(type, t.specLevel!, spec.id);
        const diff = compareEffects(type, plain, withSpec);
        const upkeepBetter = RESOURCE_TYPES.some((r) => (withSpec.upkeep[r] ?? 0) < (plain.upkeep[r] ?? 0));
        const upkeepWorse = RESOURCE_TYPES.some((r) => (withSpec.upkeep[r] ?? 0) > (plain.upkeep[r] ?? 0));
        const better = upkeepBetter || diff.some((g) => (g.after > g.before) === g.higherIsBetter);
        const worse = upkeepWorse || diff.some((g) => (g.after > g.before) !== g.higherIsBetter);
        expect(better, `${type}/${spec.id} sem vantagem`).toBe(true);
        expect(worse, `${type}/${spec.id} sem desvantagem`).toBe(true);
      }
    }
  });

  it('efeitos são derivados do nível: subir 1→2→3 dá o mesmo que calcular o nível 3 direto', () => {
    const s = sim();
    rich(s);
    const wh = s.buildings.find((b) => b.owner === 0 && b.type === 'warehouse')!;
    s.hqOf(0)!.level = 5;
    upgrade(s, wh);
    upgrade(s, wh);
    expect(wh.level).toBe(3);
    expect(s.fx(wh)).toBe(buildingEffects('warehouse', 3, null));
    // a capacidade conta cada edifício uma única vez, com o valor do nível atual
    const hqStore = buildingEffects('hq', 5, null).storage.wood ?? 0;
    expect(s.capacity(0).wood).toBe(hqStore + (buildingEffects('warehouse', 3, null).storage.wood ?? 0));
    run(s, 200);
    expect(s.capacity(0).wood).toBe(hqStore + (buildingEffects('warehouse', 3, null).storage.wood ?? 0));
    expect(wh.maxHp).toBe(buildingEffects('warehouse', 3, null).maxHp);
  });
});

describe('regras do comando de melhoria', () => {
  it('sem recursos: recusado e nada é cobrado (nem recursos nem verba)', () => {
    const { st, link } = fakeNation({ fund: 50e6 });
    const s = sim(link);
    const hq = s.hqOf(0)!;
    s.players[0]!.resources = { supplies: 10, food: 0, wood: 0, stone: 0, iron: 0, oil: s.players[0]!.resources.oil };
    const before = { ...s.players[0]!.resources };
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: hq.id })).toMatch(/Recursos insuficientes/);
    expect(s.players[0]!.resources).toEqual(before);
    expect(st.fund).toBe(50e6);
    expect(hq.upgrade).toBeNull();
  });

  it('sem verba de obras do orçamento nacional: recusado e nada é cobrado do teatro', () => {
    const { st, link } = fakeNation({ fund: 1e6 });
    const s = sim(link);
    rich(s);
    const hq = s.hqOf(0)!;
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: hq.id })).toMatch(/Verba de obras insuficiente/);
    expect(s.players[0]!.resources).toEqual(RICH);
    expect(st.fund).toBe(1e6);
  });

  it('cobra exatamente o custo do nível, em recursos e na verba nacional (registrada no extrato)', () => {
    const { st, link } = fakeNation({ fund: 100e6 });
    const s = sim(link);
    rich(s);
    const hq = s.hqOf(0)!;
    const c = upgradeCost('hq', 2);
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: hq.id })).toBeNull();
    for (const r of RESOURCE_TYPES) expect(s.players[0]!.resources[r]).toBe(RICH[r] - (c.cost[r] ?? 0));
    expect(st.fund).toBe(100e6 - c.usd);
    expect(st.ledger).toEqual([c.usd]);
    // segunda ordem durante a obra é recusada (não paga duas vezes)
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: hq.id })).toMatch(/obra de melhoria em andamento/);
    expect(st.ledger).toEqual([c.usd]);
  });

  it('requisitos: nível do QG, pesquisa, logística do produto, infraestrutura e estabilidade nacionais', () => {
    const { st, link } = fakeNation();
    const s = sim(link);
    rich(s);
    const hq = s.hqOf(0)!;
    const farm = build(s, 0, 'farm', { cx: 13, cy: 2 });
    // QG no nível 1: a fazenda vai no máximo ao nível 1 + HQ_LEVEL_LEAD
    for (let l = 2; l <= 1 + HQ_LEVEL_LEAD; l++) upgrade(s, farm);
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: farm.id })).toMatch(/Centro de Comando no nível/);
    hq.level = 4;
    // nível 4 de fazenda exige silo nível 2 (logística do produto)
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: farm.id })).toMatch(/Silo no nível 2/);
    const silo = build(s, 0, 'silo', { cx: 9, cy: 8 });
    upgrade(s, silo);
    upgrade(s, farm);
    expect(farm.level).toBe(4);
    // nível 5 exige a pesquisa de mecanização agrícola
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: farm.id })).toMatch(/Mecanização agrícola/);
    st.techs = ['agricultural_mechanization'];
    upgrade(s, farm);
    expect(farm.level).toBe(5);
    // nível 8+ exige infraestrutura nacional; QG 9+ exige estabilidade
    hq.level = INFRA_GATE_LEVEL - 1;
    hq.maxHp = buildingEffects('hq', hq.level).maxHp;
    st.techs = ['agricultural_mechanization', 'logistics', 'territorial_administration'];
    st.infra = 1;
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: hq.id })).toMatch(/Infraestrutura nacional/);
    st.infra = 1.05;
    upgrade(s, hq);
    st.stability = 30;
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: hq.id })).toMatch(/Estabilidade política/);
    st.stability = 70;
    upgrade(s, hq);
    expect(hq.level).toBe(9);
  });

  it('especialização: obrigatória no nível de escolha, válida só para a classe, exclusiva e permanente', () => {
    const { link } = fakeNation({ techs: ['logistics'] });
    const s = sim(link);
    rich(s);
    const hq = s.hqOf(0)!;
    hq.level = 8;
    const wh = s.buildings.find((b) => b.owner === 0 && b.type === 'warehouse')!;
    for (let l = 2; l <= 5; l++) upgrade(s, wh);
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: wh.id })).toMatch(/Escolha uma especialização/);
    // especialização de outra classe é recusada sem cobrar nada
    const before = { ...s.players[0]!.resources };
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: wh.id, spec: 'fortified' })).toMatch(/Escolha uma especialização/);
    expect(s.players[0]!.resources).toEqual(before);
    upgrade(s, wh, 'hardened');
    expect(wh.spec).toBe('hardened');
    expect(wh.maxHp).toBe(buildingEffects('warehouse', 6, 'hardened').maxHp);
    // nos níveis seguintes a especialização não muda (mesmo que o comando traga outra)
    upgrade(s, wh, 'capacity');
    expect(wh.level).toBe(7);
    expect(wh.spec).toBe('hardened');
    expect(s.fx(wh)).toBe(buildingEffects('warehouse', 7, 'hardened'));
  });

  it('durante a obra a coleta cai para 50%; cancelar devolve 80% de recursos e verba', () => {
    const { st, link } = fakeNation({ fund: 100e6 });
    const s = sim(link);
    rich(s);
    const farm = build(s, 0, 'farm', { cx: 13, cy: 2 });
    run(s, TICK_RATE * 2);
    // estoques dentro da capacidade: o reembolso entra inteiro (o que não cabe seria perdido, com registro)
    Object.assign(s.players[0]!.resources, { supplies: 500, wood: 300, stone: 300 });
    const full = s.buildingRate(farm);
    expect(full).toBeGreaterThan(0);
    const before = { ...s.players[0]!.resources };
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: farm.id })).toBeNull();
    expect(s.buildingRate(farm)).toBeCloseTo(full * UPGRADE_WORK_EFFICIENCY, 6);
    const c = upgradeCost('farm', 2);
    expect(s.applyCommand(0, { type: 'cancel_upgrade', buildingId: farm.id })).toBeNull();
    expect(farm.level).toBe(1);
    expect(farm.upgrade).toBeNull();
    for (const r of ['supplies', 'wood', 'stone'] as const) {
      const lost = (c.cost[r] ?? 0) - Math.floor((c.cost[r] ?? 0) * UPGRADE_CANCEL_REFUND);
      expect(s.players[0]!.resources[r]).toBe(before[r] - lost);
    }
    expect(st.fund).toBe(100e6 - c.usd + Math.floor(c.usd * UPGRADE_CANCEL_REFUND));
    expect(s.buildingRate(farm)).toBeCloseTo(full, 6);
  });

  it('destruído durante a obra: o investimento é perdido (sem reembolso)', () => {
    const { st, link } = fakeNation({ fund: 100e6 });
    const s = sim(link);
    rich(s);
    const farm = build(s, 0, 'farm', { cx: 13, cy: 2 });
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: farm.id })).toBeNull();
    const fundAfter = st.fund;
    const res = { ...s.players[0]!.resources };
    farm.hp = 0;
    run(s, 2);
    expect(s.get(farm.id)).toBeUndefined();
    expect(st.fund).toBe(fundAfter);
    expect(s.players[0]!.resources.wood).toBe(res.wood);
  });

  it('custo operacional: o nível eleva a manutenção; sem saldo, o edifício para e não produz', () => {
    const s = sim();
    rich(s);
    const farm = build(s, 0, 'farm', { cx: 13, cy: 2 });
    for (let l = 2; l <= 3; l++) upgrade(s, farm);
    expect(s.fx(farm).upkeep.supplies).toBeCloseTo(2 * 0.03, 6);
    // cobrança vencendo agora e nenhum suprimento em estoque
    const p = s.players[0]!;
    p.resources.supplies = 0;
    p.incomeRemainder.supplies = 0;
    p.modifiers.externalIncome = 0;
    p.upkeepAcc.supplies = 0.999;
    run(s, 1);
    expect(p.unpaidUpkeep.supplies).toBe(true);
    expect(farm.unpaid).toBe(true);
    expect(farm.status).toBe('unpaid');
    expect(s.buildingRate(farm)).toBe(0);
  });

  it('especialização da fábrica muda custo e vida das unidades; o cancelamento devolve o que foi pago', () => {
    const { link } = fakeNation({ techs: ['automation'] });
    const s = sim(link);
    rich(s);
    s.hqOf(0)!.level = 8;
    s.players[0]!.recruits = 5;
    s.players[0]!.resources.oil = 90;
    s.players[0]!.oilReserve = 90;
    const wh = s.buildings.find((b) => b.owner === 0 && b.type === 'warehouse')!;
    for (let l = 2; l <= 3; l++) upgrade(s, wh);
    const barracks = build(s, 0, 'barracks', { cx: 8, cy: 8 });
    expect(barracks.progress).toBe(1);
    const factory = build(s, 0, 'factory', { cx: 11, cy: 8 });
    for (let l = 2; l <= 5; l++) upgrade(s, factory);
    upgrade(s, factory, 'advanced');
    expect(factory.spec).toBe('advanced');
    // estoques dentro da capacidade, para o reembolso entrar inteiro
    Object.assign(s.players[0]!.resources, { supplies: 800, iron: 300 });
    const before = { ...s.players[0]!.resources };
    expect(s.applyCommand(0, { type: 'produce', buildingId: factory.id, unitType: 'tank' })).toBeNull();
    const paidIron = before.iron - s.players[0]!.resources.iron;
    expect(paidIron).toBe(Math.round(UNITS.tank.cost.iron! * 1.2));
    expect(s.applyCommand(0, { type: 'cancel_production', buildingId: factory.id })).toBeNull();
    expect(s.players[0]!.resources.iron).toBe(before.iron);
    expect(s.applyCommand(0, { type: 'produce', buildingId: factory.id, unitType: 'tank' })).toBeNull();
    run(s, factory.queue[0]!.totalTicks * 3);
    const tank = s.units.find((u) => u.owner === 0 && u.type === 'tank')!;
    expect(tank.maxHp).toBe(Math.round(UNITS.tank.maxHp * 1.2));
  });

  it('o QG mais alto projeta fronteira maior (território derivado do nível)', () => {
    const { link } = fakeNation({ techs: ['logistics'] });
    const s = sim(link);
    rich(s);
    const owned = () => [...s.territory].filter((o) => o === 0).length;
    const before = owned();
    const hq = s.hqOf(0)!;
    for (let l = 2; l <= 5; l++) upgrade(s, hq);
    run(s, 2);
    expect(hq.level).toBe(5);
    expect(owned()).toBeGreaterThan(before);
  });
});

describe('persistência', () => {
  it('salvar e carregar preserva nível, especialização e obra em andamento; a continuação é idêntica', () => {
    const { link } = fakeNation({ techs: ['logistics'] });
    const s = sim(link);
    rich(s);
    s.hqOf(0)!.level = 8;
    const wh = s.buildings.find((b) => b.owner === 0 && b.type === 'warehouse')!;
    for (let l = 2; l <= 5; l++) upgrade(s, wh);
    upgrade(s, wh, 'capacity');
    const farm = build(s, 0, 'farm', { cx: 13, cy: 2 });
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: farm.id })).toBeNull();
    run(s, 10);

    const text = s.serialize();
    const restored = Simulation.deserialize(text);
    restored.national = link;
    const wh2 = restored.get(wh.id) as Building;
    expect(wh2.level).toBe(6);
    expect(wh2.spec).toBe('capacity');
    expect(restored.fx(wh2)).toBe(buildingEffects('warehouse', 6, 'capacity'));
    const farm2 = restored.get(farm.id) as Building;
    expect(farm2.upgrade).toEqual(farm.upgrade);
    expect(restored.capacity(0)).toEqual(s.capacity(0));

    // o mesmo snapshot e, depois de avançar os dois, o mesmo estado
    const digest = (x: Simulation) => JSON.stringify(makeSnapshot(x, [], undefined, true));
    expect(digest(restored)).toBe(digest(s));
    run(s, TICK_RATE * 40);
    run(restored, TICK_RATE * 40);
    expect(digest(restored)).toBe(digest(s));
    expect((restored.get(farm.id) as Building).level).toBe(2);
  });
});

describe('verba de obras no orçamento nacional', () => {
  it('teto segue o orçamento de infraestrutura; começa pela metade e repõe 1/365 por dia', async () => {
    const { NationalSimulation } = await import('../strategic/NationalSimulation.ts');
    const { WORKS_SHARE_OF_INFRA, WORKS_START_FRACTION, COEF, DAYS_PER_YEAR } = await import('../strategic/params.ts');
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }, { slot: 1, countryId: 'ARG' }], 1, 'parity');
    const n = nat.nation(0)!;
    const cap = Math.round((n.budget.infrastructurePct / 100) * COEF.parityGdpUsd * WORKS_SHARE_OF_INFRA);
    expect(n.works.capUsd).toBe(cap);
    expect(n.works.fundUsd).toBe(Math.round(cap * WORKS_START_FRACTION));
    const start = n.works.fundUsd;
    nat.stepDay();
    expect(n.works.fundUsd).toBeCloseTo(start + n.works.capUsd / DAYS_PER_YEAR, 0);
    // mais orçamento de infraestrutura → teto maior (com efeitos normais sobre gasto e déficit)
    const deficit = n.deficitPctGdp;
    nat.setBudget(0, { ...n.budget, infrastructurePct: n.budget.infrastructurePct + 1 });
    expect(n.works.capUsd).toBeGreaterThan(cap);
    expect(n.deficitPctGdp).toBeGreaterThan(deficit);
    // nunca acumula além do teto anual
    for (let d = 0; d < DAYS_PER_YEAR * 2; d++) nat.stepDay();
    expect(n.works.fundUsd).toBeLessThanOrEqual(n.works.capUsd);
  });

  it('débito sem saldo é recusado sem cobrar; débito e devolução ficam no extrato', async () => {
    const { NationalSimulation } = await import('../strategic/NationalSimulation.ts');
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }, { slot: 1, countryId: 'ARG' }], 1, 'parity');
    const n = nat.nation(0)!;
    const fund = n.works.fundUsd;
    expect(nat.chargeWorks(0, fund + 1, 'obra grande demais')).toBe(false);
    expect(n.works.fundUsd).toBe(fund);
    expect(n.works.ledger).toHaveLength(0);
    expect(nat.chargeWorks(0, 5e6, 'Fazenda → nível 2')).toBe(true);
    expect(n.works.fundUsd).toBe(fund - 5e6);
    expect(n.works.spentUsd).toBe(5e6);
    nat.refundWorks(0, 4e6, 'Fazenda: obra cancelada');
    expect(n.works.fundUsd).toBe(fund - 1e6);
    expect(n.works.spentUsd).toBe(1e6);
    expect(n.works.ledger.map((l) => l.usd)).toEqual([5e6, -4e6]);
  });

  it('na partida real o comando de melhoria cobra a verba da nação pelo servidor', async () => {
    const { NationalSimulation } = await import('../strategic/NationalSimulation.ts');
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }, { slot: 1, countryId: 'ARG' }], 1, 'parity');
    const s = new Simulation({ map: fertile, playerCount: 2, startingUnits: [] });
    s.national = {
      techs: (slot) => nat.nation(slot)?.research.done ?? [],
      infrastructureIndex: (slot) => nat.nation(slot)?.infrastructureIndex ?? 1,
      stability: (slot) => nat.nation(slot)?.stability ?? 0,
      worksFundUsd: (slot) => nat.nation(slot)?.works.fundUsd ?? 0,
      chargeWorks: (slot, usd, d) => nat.chargeWorks(slot, usd, d),
      refundWorks: (slot, usd, d) => nat.refundWorks(slot, usd, d),
    };
    rich(s);
    const fund = nat.nation(0)!.works.fundUsd;
    expect(s.applyCommand(0, { type: 'upgrade', buildingId: s.hqOf(0)!.id })).toBeNull();
    expect(nat.nation(0)!.works.fundUsd).toBe(fund - upgradeCost('hq', 2).usd);
    expect(nat.nation(0)!.works.ledger.at(-1)!.description).toMatch(/Centro de Comando → nível 2/);
  });
});
