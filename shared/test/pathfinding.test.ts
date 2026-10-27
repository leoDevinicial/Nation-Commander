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

describe('linha reta livre (esticar caminho)', () => {
  it('percorre toda célula cortada: não atravessa a quina de uma pedra entre amostras', () => {
    // linha rasante que corta só a pontinha da célula (2,1)
    const g = grid(['.....', '..#..', '.....']);
    const a = { x: 0.5 * 2, y: 0.5 * 2 };
    const b = { x: 4.5 * 2, y: 1.95 * 2 };
    expect(g.lineWalkable(a, b)).toBe(false);
    expect(g.lineWalkable({ x: 1, y: 1 }, { x: 9, y: 1 })).toBe(true);
  });

  it('com folga, recusa a linha que passa colada na borda bloqueada', () => {
    const g = grid(['.....', '.....', '#####']);
    // centro a 0,1 célula da borda da pedra: o corpo da unidade rasparia
    const y = 1.9 * 2;
    expect(g.lineWalkable({ x: 1, y }, { x: 9, y })).toBe(true);
    expect(g.lineWalkable({ x: 1, y }, { x: 9, y }, 0.3)).toBe(false);
    expect(g.lineWalkable({ x: 1, y: 3 }, { x: 9, y: 3 }, 0.3)).toBe(true);
  });

  it('não corta a diagonal entre duas células bloqueadas', () => {
    const g = grid(['.#', '#.']);
    expect(g.lineWalkable({ x: 1, y: 1 }, { x: 3, y: 3 })).toBe(false);
  });
});
