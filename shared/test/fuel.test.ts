import { describe, expect, it } from 'vitest';
import { FUEL, GOODS, TICK_RATE, fuelPerWorld } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import type { SimEvent } from '../sim/types.ts';
import { flatMap } from './helpers.ts';

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

function setup(oil: number, fuel = 0) {
  const sim = new Simulation({ map: flatMap(48), playerCount: 2, startingUnits: [], fuel: true });
  const p = sim.players[0]!;
  p.resources.oil = oil;
  p.goods = { fuel, steel: 0 };
  return { sim, p };
}

describe('combustível dos veículos (03/11)', () => {
  it('infantaria não gasta; tanque gasta mais que blindado leve; navio mais ainda', () => {
    expect(fuelPerWorld('infantry')).toBe(0);
    expect(fuelPerWorld('tank')).toBeGreaterThan(fuelPerWorld('apc'));
    expect(fuelPerWorld('frigate')).toBeGreaterThan(fuelPerWorld('tank'));
    expect(fuelPerWorld('aircraft_carrier')).toBe(FUEL.carrier);
  });

  it('andar consome o Combustível da Refinaria primeiro e depois o petróleo', () => {
    const { sim, p } = setup(100, 2);
    const tanks = Array.from({ length: 6 }, (_, i) => sim.addUnit('tank', 0, sim.grid.cellCenter({ cx: 8, cy: 8 + i })));
    sim.applyCommand(0, { type: 'move', unitIds: tanks.map((t) => t.id), x: sim.grid.cellCenter({ cx: 40, cy: 8 }).x, y: sim.grid.cellCenter({ cx: 40, cy: 8 }).y });
    run(sim, 30);
    expect(p.goods!.fuel).toBe(0);
    expect(p.resources.oil).toBeLessThan(100);
    // infantaria sozinha não gasta nada
    const { sim: s2, p: p2 } = setup(100);
    const inf = s2.addUnit('infantry', 0, s2.grid.cellCenter({ cx: 8, cy: 8 }));
    s2.applyCommand(0, { type: 'move', unitIds: [inf.id], x: s2.grid.cellCenter({ cx: 40, cy: 8 }).x, y: s2.grid.cellCenter({ cx: 40, cy: 8 }).y });
    run(s2, 20);
    expect(p2.resources.oil).toBe(100);
    expect(GOODS.saves).toBeGreaterThan(1);
  });

  it('sem petróleo nem combustível: aviso e meia velocidade até o petróleo voltar', () => {
    const { sim, p } = setup(0);
    const events: SimEvent[] = [];
    const tank = sim.addUnit('tank', 0, sim.grid.cellCenter({ cx: 4, cy: 20 }));
    const ref = sim.addUnit('tank', 1, sim.grid.cellCenter({ cx: 4, cy: 24 }));
    sim.players[1]!.resources.oil = 1e6;
    const dest = sim.grid.cellCenter({ cx: 44, cy: 20 });
    sim.applyCommand(0, { type: 'move', unitIds: [tank.id], x: dest.x, y: dest.y });
    sim.applyCommand(1, { type: 'move', unitIds: [ref.id], x: dest.x, y: sim.grid.cellCenter({ cx: 44, cy: 24 }).y });
    for (let i = 0; i < 12 * TICK_RATE; i++) {
      sim.step();
      events.push(...sim.drainEvents());
    }
    expect(p.noFuel).toBe(true);
    expect(events.some((e) => e.type === 'fuel' && e.owner === 0 && e.state === 'out')).toBe(true);
    // o tanque sem combustível ficou para trás do tanque abastecido
    expect(tank.pos.x).toBeLessThan(ref.pos.x - 5);
    p.resources.oil = 50;
    for (let i = 0; i < 2 * TICK_RATE; i++) {
      sim.step();
      events.push(...sim.drainEvents());
    }
    expect(p.noFuel).toBeUndefined();
    expect(events.some((e) => e.type === 'fuel' && e.owner === 0 && e.state === 'ok')).toBe(true);
  });
});
