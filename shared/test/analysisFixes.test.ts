import { describe, expect, it } from 'vitest';
import { Terrain, UNITS, recruitsFor } from '../sim/config.ts';
import { checkProduce } from '../sim/production.ts';
import { Simulation } from '../sim/Simulation.ts';
import { flatMap } from './helpers.ts';

/** Correções da análise de 03/11 (pitfalls e exploits apontados para os jogadores). */
describe('correções da análise (03/11)', () => {
  it('porta-aviões: os 4 caças embarcados também ocupam recrutas (pilotos)', () => {
    expect(recruitsFor('aircraft_carrier')).toBe((UNITS.aircraft_carrier.crew ?? 1) + (UNITS.aircraft_carrier.carrierFighters ?? 0));
    expect(recruitsFor('infantry')).toBe(1);
    const base = {
      buildingType: 'port' as const,
      level: 1,
      spec: null,
      progress: 1,
      queueLength: 0,
      resources: { food: 9999, wood: 9999, stone: 9999, iron: 9999, oil: 9999, supplies: 9999, coal: 9999 },
      popTotal: 0,
      popCap: 999,
      militaryResearch: [],
      era: 4,
      techs: ['naval_aviation', 'naval_warfare'],
    };
    const need = recruitsFor('aircraft_carrier');
    expect(checkProduce('aircraft_carrier', { ...base, recruits: need - 1 }).blocker).toMatch(/pilotos/);
    expect(checkProduce('aircraft_carrier', { ...base, recruits: need }).blocker).toBeNull();
  });

  it('estrada em solo fértil devolve o solo fértil ao ser demolida', () => {
    const sim = new Simulation({ map: flatMap(32, (set) => set(5, 8, Terrain.Fertile)), playerCount: 2, startingUnits: [] });
    sim.roads.push({ i: 8 * 32 + 5, owner: 0, prev: Terrain.Fertile });
    sim.map.terrain[8 * 32 + 5] = Terrain.Road;
    sim.grid.terrain[8 * 32 + 5] = Terrain.Road;
    expect(sim.demolishRoads(0, [8 * 32 + 5])).toBeNull();
    expect(sim.map.terrain[8 * 32 + 5]).toBe(Terrain.Fertile);
  });

  it('porto não sai numa lagoa pequena, só na margem de água grande', () => {
    const map = flatMap(48, (set) => {
      // lagoa 3×3 junto à base
      for (let y = 9; y < 12; y++) for (let x = 9; x < 12; x++) set(x, y, Terrain.Water);
      // mar a leste
      for (let y = 0; y < 48; y++) for (let x = 30; x < 48; x++) set(x, y, Terrain.Water);
    });
    map.spawns = [
      { cx: 6, cy: 6 },
      { cx: 26, cy: 40 },
    ];
    const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
    const lake = sim.placementError(0, 'port', { cx: 7, cy: 9 });
    expect(lake).toMatch(/lagoa/);
  });
});
