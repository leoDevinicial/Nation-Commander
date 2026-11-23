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
  const { roadLine } = await import('../game/GameRuntime.ts');
  it('a 45° vira uma linha de células ligadas pela quina, do começo ao fim', () => {
    const cells = roadLine({ cx: 2, cy: 3 }, { cx: 8, cy: 9 }, 100);
    expect(cells).toHaveLength(7);
    expect(cells.at(-1)).toEqual({ cx: 8, cy: 9 });
    for (let i = 1; i < cells.length; i++) expect([Math.abs(cells[i]!.cx - cells[i - 1]!.cx), Math.abs(cells[i]!.cy - cells[i - 1]!.cy)]).toEqual([1, 1]);
  });
  it('fora de 45°, mistura passos retos e diagonais sem pular célula', () => {
    const cells = roadLine({ cx: 0, cy: 0 }, { cx: 10, cy: 4 }, 100);
    expect(cells.at(-1)).toEqual({ cx: 10, cy: 4 });
    for (let i = 1; i < cells.length; i++) expect(Math.max(Math.abs(cells[i]!.cx - cells[i - 1]!.cx), Math.abs(cells[i]!.cy - cells[i - 1]!.cy))).toBe(1);
  });
});

describe('peças da estrada diagonal', async () => {
  const { diagonalExits } = await import('../game/render/RoadLayer.ts');
  const none = { n: false, s: false, w: false, e: false };
  it('vizinha pela quina vira saída diagonal; ligada também pelos lados, não', () => {
    expect(diagonalExits(none, { nw: false, ne: true, sw: true, se: false })).toEqual([
      [1, -1],
      [-1, 1],
    ]);
    expect(diagonalExits({ ...none, n: true }, { nw: false, ne: true, sw: false, se: false })).toEqual([]);
  });
});
