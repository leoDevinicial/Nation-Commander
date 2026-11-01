import { describe, expect, it } from 'vitest';
import { Terrain } from '../sim/config.ts';
import { generateMatchMap } from '../sim/matchMap.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';

describe('depósitos esgotados no snapshot', () => {
  it('o dono do território sabe que o depósito acabou; o rival longe, na névoa, não', () => {
    const sim = new Simulation({ map: generateMatchMap(3, { nations: 2 }), playerCount: 2 });
    sim.step();
    const own = sim.deposits.deposits.find((d) => d.terrain === Terrain.Rock && d.cells.some((i) => sim.territory[i] === 0))!;
    expect(own).toBeTruthy();
    const snap = (slot: number) => makeSnapshot(sim, [], { slot, memory: new FogMemory() });
    expect(snap(0).depleted).toBeUndefined();
    own.remaining = 0;
    expect(snap(0).depleted).toEqual([own.id]);
    expect(snap(1).depleted).toBeUndefined();
  });
});
