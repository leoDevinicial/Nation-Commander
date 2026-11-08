import { describe, expect, it } from 'vitest';
import { Terrain } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TEST_START, flatMap } from './helpers.ts';

/** Feedback 08/11: o porto não cabia na praia e só a estrada podia ir para cima da mata. */
describe('obra na mata e na praia', () => {
  const map = () =>
    flatMap(40, (set) => {
      for (let y = 0; y < 40; y++) {
        for (let x = 20; x < 40; x++) set(x, y, Terrain.Water);
        set(18, y, Terrain.Mud);
        set(19, y, Terrain.Mud);
      }
      for (let y = 6; y < 9; y++) for (let x = 6; x < 9; x++) set(x, y, Terrain.Forest);
    });
  const sim = () => new Simulation({ map: map(), playerCount: 2, startingUnits: [], startingResources: TEST_START });

  it('o porto vai na praia (lama) encostada no mar; outros prédios não', () => {
    const s = sim();
    expect(s.placementError(0, 'port', { cx: 18, cy: 4 }) ?? '').not.toMatch(/Terreno impróprio|margem/);
    expect(s.placementError(0, 'barracks', { cx: 18, cy: 4 })).toBe('Terreno impróprio para construção');
  });

  it('prédio na mata é aceito e derruba as árvores embaixo dele', () => {
    const s = sim();
    expect(s.placementError(0, 'barracks', { cx: 6, cy: 6 }) ?? '').not.toMatch(/Terreno impróprio/);
    s.addBuilding('barracks', 0, { cx: 6, cy: 6 }, 0);
    for (const [x, y] of [[6, 6], [7, 6], [6, 7], [7, 7]] as const) {
      expect(s.map.terrain[y * 40 + x]).toBe(Terrain.Plains);
      expect(s.clearedForest).toContain(y * 40 + x);
    }
    // fora do prédio a mata continua
    expect(s.map.terrain[8 * 40 + 8]).toBe(Terrain.Forest);
  });
});
