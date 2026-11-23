import { describe, expect, it } from 'vitest';
import { Terrain } from '../../shared/sim/config.ts';
import { landComponents } from '../game/render/CitizenLayer.ts';

/** Prefeitura em ilha nova (23/11): os construtores não atravessam o mar a pé. */
describe('pedaços de terra dos cidadãos', () => {
  it('duas ilhas separadas por água ficam com rótulos diferentes; a água não tem rótulo', () => {
    const P = Terrain.Plains;
    const W = Terrain.Water;
    // 5×1: terra, terra, água, terra, terra
    const land = landComponents(5, 1, [P, P, W, P, P]);
    expect(land[0]).toBe(land[1]);
    expect(land[2]).toBe(-1);
    expect(land[3]).toBe(land[4]);
    expect(land[0]).not.toBe(land[3]);
  });
});

describe('estrada na diagonal', async () => {
  const { roadStairs } = await import('../game/GameRuntime.ts');
  it('vira uma escada de células sempre ligadas pelo lado, do começo ao fim', () => {
    const cells = roadStairs({ cx: 2, cy: 3 }, { cx: 8, cy: 9 }, 100);
    expect(cells[0]).toEqual({ cx: 2, cy: 3 });
    expect(cells.at(-1)).toEqual({ cx: 8, cy: 9 });
    expect(cells.length).toBe(6 + 6 + 1);
    for (let i = 1; i < cells.length; i++) expect(Math.abs(cells[i]!.cx - cells[i - 1]!.cx) + Math.abs(cells[i]!.cy - cells[i - 1]!.cy)).toBe(1);
  });
});
