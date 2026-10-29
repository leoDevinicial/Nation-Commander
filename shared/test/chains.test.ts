import { describe, expect, it } from 'vitest';
import { BUILDINGS, GOODS, GOODS_USE, SERVICES, TICK_RATE, Terrain, UNITS } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { checkProduce } from '../sim/production.ts';
import { AIRCRAFT, AIRCRAFT_FUEL, aircraftFor } from '../sim/air.ts';
import { RANK_HP } from '../sim/veterancy.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { flatMap } from './helpers.ts';

/** Cadeias produtivas e serviços com raio de cobertura (lote 1, §4). */

function setup() {
  const sim = new Simulation({ map: flatMap(40), playerCount: 2, startingUnits: [] });
  sim.territory.fill(0);
  const p = sim.players[0]!;
  for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 400;
  p.oilReserve = 400;
  p.citizens = 30;
  p.recruits = 10;
  sim.addBuilding('warehouse', 0, { cx: 30, cy: 30 }, 1);
  const run = (s: number) => {
    for (let i = 0; i < s * TICK_RATE; i++) sim.step();
  };
  return { sim, p, run };
}

describe('Cadeias produtivas', () => {
  it('Refinaria transforma petróleo em combustível e Siderúrgica, ferro em aço, com trabalhadores', () => {
    const { sim, p, run } = setup();
    const ref = sim.addBuilding('refinery', 0, { cx: 8, cy: 8 }, 1);
    const mill = sim.addBuilding('steel_mill', 0, { cx: 12, cy: 8 }, 1);
    sim.staff(0);
    expect(ref.workers).toBe(BUILDINGS.refinery.workers);
    const oil = p.resources.oil;
    const iron = p.resources.iron;
    run(20);
    expect(p.goods!.fuel).toBeGreaterThanOrEqual(Math.floor(20 * BUILDINGS.refinery.process!.rate) - 1);
    expect(p.goods!.steel).toBeGreaterThanOrEqual(Math.floor(20 * BUILDINGS.steel_mill.process!.rate) - 1);
    expect(p.resources.oil).toBeLessThan(oil);
    expect(p.resources.iron).toBeLessThan(iron);
    expect(sim.goodsCap(0)).toBe(GOODS.baseCap + 2 * GOODS.capPerPlant);
    // sem ferro, a siderúrgica para por falta de matéria-prima
    p.resources.iron = 0;
    run(1);
    expect(mill.status).toBe('no_input');
  });

  it('bens substituem parte do custo das tropas; a fila devolve os bens ao cancelar', () => {
    const { sim, p } = setup();
    p.goods = { fuel: 50, steel: 50 };
    const ctx = {
      buildingType: 'factory' as const,
      level: 1,
      spec: null,
      progress: 1,
      queueLength: 0,
      resources: p.resources,
      recruits: 5,
      popTotal: 0,
      popCap: 100,
      techs: null,
      militaryResearch: ['tracked_armor'],
    };
    const plain = checkProduce('tank', ctx);
    const withGoods = checkProduce('tank', { ...ctx, goods: p.goods });
    const use = GOODS_USE.tank!;
    expect(withGoods.goods).toEqual(use);
    expect(withGoods.cost.iron).toBe(Math.max(0, plain.cost.iron! - use.steel! * GOODS.saves));
    expect(withGoods.cost.oil).toBe(Math.max(0, plain.cost.oil! - use.fuel! * GOODS.saves));
    // sem estoque suficiente: custo cheio
    expect(checkProduce('tank', { ...ctx, goods: { fuel: 0, steel: 5 } }).goods).toEqual({});

    sim.players[0]!.militaryResearch = ['tracked_armor'];
    const f = sim.addBuilding('factory', 0, { cx: 8, cy: 14 }, 1);
    sim.staff(0);
    expect(sim.applyCommand(0, { type: 'produce', buildingId: f.id, unitType: 'tank' })).toBeNull();
    expect(p.goods).toEqual({ fuel: 50 - use.fuel!, steel: 50 - use.steel! });
    expect(sim.applyCommand(0, { type: 'cancel_production', buildingId: f.id })).toBeNull();
    expect(p.goods).toEqual({ fuel: 50, steel: 50 });
  });

  it('combustível no lugar do petróleo na montagem das aeronaves', () => {
    const def = aircraftFor('fighter', undefined, { fuel: 100, steel: 0 });
    expect(def.goods).toEqual({ fuel: AIRCRAFT_FUEL.fighter });
    expect(def.cost.oil).toBe(AIRCRAFT.fighter.cost.oil! - AIRCRAFT_FUEL.fighter * GOODS.saves);
    expect(aircraftFor('fighter', undefined, { fuel: 1, steel: 0 })).toBe(AIRCRAFT.fighter);
  });
});

describe('Serviços com raio de cobertura', () => {
  it('Escola: coleta coberta rende mais e a tropa sai Veterana', () => {
    const { sim, p, run } = setup();
    // solo fértil em volta da fazenda
    for (let y = 17; y < 25; y++) for (let x = 3; x < 9; x++) sim.map.terrain[y * 40 + x] = Terrain.Fertile;
    const farm = sim.addBuilding('farm', 0, { cx: 5, cy: 20 }, 1);
    sim.staff(0);
    const before = sim.buildingRate(farm);
    expect(before).toBeGreaterThan(0);
    sim.addBuilding('school', 0, { cx: 9, cy: 20 }, 1);
    sim.staff(0);
    expect(sim.buildingRate(farm)).toBeCloseTo(before * SERVICES.educationGatherMul, 5);
    const barracks = sim.addBuilding('barracks', 0, { cx: 9, cy: 24 }, 1);
    sim.staff(0);
    expect(sim.applyCommand(0, { type: 'produce', buildingId: barracks.id, unitType: 'infantry' })).toBeNull();
    run(UNITS.infantry.buildSeconds + 2);
    const u = sim.units.find((x) => x.owner === 0 && x.type === 'infantry')!;
    expect(u.rank).toBe(1);
    expect(u.maxHp).toBe(Math.round(UNITS.infantry.maxHp * (1 + RANK_HP)));
    expect(p.recruits).toBeGreaterThanOrEqual(0);
  });

  it('Hospital cura tropas próprias na área; cobertura das moradias por serviço', () => {
    const { sim, run } = setup();
    const h = sim.addBuilding('hospital', 0, { cx: 10, cy: 10 }, 1);
    sim.staff(0);
    const near = sim.addUnit('infantry', 0, { x: h.pos.x + 4, y: h.pos.y });
    const far = sim.addUnit('infantry', 0, { x: 70, y: 70 });
    near.hp = far.hp = 30;
    run(4);
    expect(near.hp).toBeGreaterThanOrEqual(30 + 3 * SERVICES.healPerSecond);
    expect(far.hp).toBe(30);
    sim.addBuilding('house', 0, { cx: 12, cy: 14 }, 1);
    sim.addBuilding('house', 0, { cx: 34, cy: 4 }, 1);
    expect(sim.serviceCoverage(0)).toEqual({ health: 0.5, education: 0, security: 0 });
  });

  it('cobertura entra na aprovação nacional', () => {
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 3, 'parity');
    nat.attachTheater({
      resources: () => null,
      spend: () => {},
      setWar: () => {},
      stats: () => ({ buildings: {}, military: 0, workers: 0, food: 0, services: { health: 1, education: 0.5, security: 0 } }),
    });
    nat.stepDay();
    expect(nat.nation(0)!.approvalFactors.find((f) => f.key === 'services_coverage')?.value).toBeCloseTo(SERVICES.approvalMax * 1.5, 1);
  });
});
