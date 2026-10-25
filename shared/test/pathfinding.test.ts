import { describe, expect, it } from 'vitest';
import { Terrain } from '../sim/config.ts';
import { findPath } from '../sim/pathfinding/AStar.ts';
import { Grid } from '../sim/pathfinding/Grid.ts';

function grid(rows: string[]): Grid {
  const h = rows.length;
  const w = rows[0]!.length;
  const t: Terrain[] = [];
  for (const r of rows) for (const ch of r) t.push(ch === '#' ? Terrain.Rock : ch === 'f' ? Terrain.Forest : Terrain.Plains);
  return new Grid(w, h, 2, t);
}

describe('A*', () => {
  it('contorna obstáculos e nunca passa por células bloqueadas', () => {
    const g = grid(['.....', '.###.', '...#.', '.#.#.', '.#...']);
    const path = findPath(g, { cx: 0, cy: 0 }, { cx: 2, cy: 3 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ cx: 0, cy: 0 });
    expect(path![path!.length - 1]).toEqual({ cx: 2, cy: 3 });
    for (const c of path!) expect(g.isPassable(c.cx, c.cy)).toBe(true);
    // passos são adjacentes (8 direções)
    for (let i = 1; i < path!.length; i++) {
      expect(Math.abs(path![i]!.cx - path![i - 1]!.cx)).toBeLessThanOrEqual(1);
      expect(Math.abs(path![i]!.cy - path![i - 1]!.cy)).toBeLessThanOrEqual(1);
    }
  });

  it('não corta quinas entre duas células bloqueadas', () => {
    const g = grid(['.#', '#.']);
    expect(findPath(g, { cx: 0, cy: 0 }, { cx: 1, cy: 1 })).toBeNull();
  });

  it('falha de forma controlada quando não há caminho', () => {
    const g = grid(['..#..', '..#..', '..#..']);
    expect(findPath(g, { cx: 0, cy: 0 }, { cx: 4, cy: 2 })).toBeNull();
  });

  it('prefere terreno de menor custo', () => {
    const g = grid(['.....', 'fffff', '.....']);
    const path = findPath(g, { cx: 0, cy: 0 }, { cx: 4, cy: 0 })!;
    expect(path.every((c) => c.cy === 0)).toBe(true);
  });

  it('respeita ocupação dinâmica por edifícios', () => {
    const g = grid(['...', '...', '...']);
    g.setOccupied({ cx: 1, cy: 0 }, 1, 7);
    g.setOccupied({ cx: 1, cy: 1 }, 1, 7);
    const path = findPath(g, { cx: 0, cy: 0 }, { cx: 2, cy: 0 })!;
    expect(path.some((c) => c.cy === 2)).toBe(true);
  });
});
