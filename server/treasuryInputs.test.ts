import { describe, expect, it } from 'vitest';
import { Simulation } from '../shared/sim/Simulation.ts';
import { flatMap } from '../shared/test/helpers.ts';
import { treasuryInputs } from './Room.ts';

describe('manutenção do exército (treasuryInputs)', () => {
  it('pesqueiro é civil: não paga como veículo militar (08/11)', () => {
    const sim = new Simulation({ map: flatMap(32), playerCount: 2, startingUnits: [] });
    const base = treasuryInputs(sim, 0);
    sim.addUnit('fishing_boat', 0, { x: 20, y: 20 });
    sim.addUnit('fishing_boat', 0, { x: 22, y: 20 });
    expect(treasuryInputs(sim, 0).vehicles).toBe(base.vehicles);
    sim.addUnit('frigate', 0, { x: 24, y: 20 });
    expect(treasuryInputs(sim, 0).vehicles).toBeGreaterThan(base.vehicles);
    sim.addUnit('infantry', 0, { x: 10, y: 10 });
    expect(treasuryInputs(sim, 0).infantry).toBe(base.infantry + 1);
  });
});
