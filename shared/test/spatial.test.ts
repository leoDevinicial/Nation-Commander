import { describe, expect, it } from 'vitest';
import { TICK_RATE, type UnitType } from '../sim/config.ts';
import { SPATIAL, Simulation } from '../sim/Simulation.ts';
import { flatMap, TEST_START } from './helpers.ts';

/**
 * Grade espacial (10/11): a busca de alvo e a separação das unidades pela grade têm que dar exatamente o mesmo
 * resultado da busca completa (a simulação é determinística: servidor, salvamentos e testes dependem disso).
 */
function run(spatial: boolean, setup: (sim: Simulation) => void, seconds: number): string {
  SPATIAL.enabled = spatial;
  try {
    const sim = new Simulation({ map: flatMap(96), playerCount: 2, startingUnits: [], allAtWar: true, startingResources: TEST_START });
    setup(sim);
    for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
    return sim.serialize();
  } finally {
    SPATIAL.enabled = true;
  }
}

describe('grade espacial', () => {
  it('batalha de dois exércitos: mesmo estado com e sem a grade', () => {
    const kinds: UnitType[] = ['infantry', 'tank', 'artillery', 'apc', 'infantry', 'rocket_artillery'];
    const setup = (sim: Simulation) => {
      const cs = sim.map.cellSize;
      for (let s = 0; s < 2; s++) {
        const ids: number[] = [];
        for (let i = 0; i < 80; i++) ids.push(sim.addUnit(kinds[i % kinds.length]!, s, { x: (10 + s * 44 + (i % 10) * 1.3) * cs, y: (20 + Math.floor(i / 10) * 1.3) * cs }).id);
        sim.applyCommand(s, { type: 'attack_move', unitIds: ids, x: 48 * cs, y: 60 * cs });
      }
    };
    const a = run(true, setup, 40);
    expect(a).toBe(run(false, setup, 40));
  });

  it('pilha densa (força a volta para a comparação completa): mesmo estado com e sem a grade', () => {
    const setup = (sim: Simulation) => {
      const cs = sim.map.cellSize;
      // 150 unidades no mesmo ponto: os empurrões somam muito numa passada
      for (let i = 0; i < 150; i++) sim.addUnit('infantry', i % 2, { x: 40 * cs + (i % 3) * 0.01, y: 40 * cs });
    };
    const a = run(true, setup, 8);
    expect(a).toBe(run(false, setup, 8));
  });
});
