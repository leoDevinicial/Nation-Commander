import { describe, expect, it } from 'vitest';
import { TICK_RATE, type UnitType } from '../sim/config.ts';
import { generateMap } from '../sim/MapGen.ts';
import { Simulation } from '../sim/Simulation.ts';

/**
 * Casos reais de mapas gerados em que tropas terrestres paravam encostadas em pedra, margem de
 * lago ou quina: o caminho esticado raspava a célula bloqueada e o passo seguinte caía nela.
 */
const CASES: { seed: number; type: UnitType; from: [number, number]; to: [number, number] }[] = [
  { seed: 1, type: 'artillery', from: [6, 2], to: [20, 15] },
  { seed: 2, type: 'infantry', from: [56, 14], to: [37, 30] },
  { seed: 3, type: 'tank', from: [18, 28], to: [4, 18] },
  { seed: 3, type: 'tank', from: [51, 26], to: [29, 38] },
  { seed: 4, type: 'infantry', from: [57, 47], to: [28, 53] },
  { seed: 4, type: 'apc', from: [42, 11], to: [53, 19] },
  { seed: 4, type: 'artillery', from: [54, 59], to: [29, 49] },
  { seed: 6, type: 'artillery', from: [52, 56], to: [49, 37] },
  { seed: 7, type: 'tank', from: [49, 42], to: [57, 15] },
  { seed: 7, type: 'tank', from: [58, 60], to: [38, 41] },
];

describe('movimento terrestre', () => {
  it.each(CASES)('$type no mapa $seed chega de $from a $to sem travar no obstáculo', ({ seed, type, from, to }) => {
    const sim = new Simulation({ map: generateMap(seed * 7919), playerCount: 2 });
    const g = sim.grid;
    const u = sim.addUnit(type, 0, g.cellCenter({ cx: from[0], cy: from[1] }));
    const goal = g.cellCenter({ cx: to[0], cy: to[1] });
    expect(sim.applyCommand(0, { type: 'move', unitIds: [u.id], x: goal.x, y: goal.y })).toBeNull();
    for (let i = 0; i < 70 * TICK_RATE && u.order.kind === 'move'; i++) {
      sim.step();
      sim.drainEvents();
    }
    expect(Math.hypot(u.pos.x - goal.x, u.pos.y - goal.y) / g.cellSize).toBeLessThan(1.5);
  });
});
