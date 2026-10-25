import type { Cell } from '../types.ts';
import type { Grid } from './Grid.ts';

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Heap binário mínimo sobre índices de célula, ordenado por `f`. */
class MinHeap {
  private readonly items: number[] = [];
  constructor(private readonly f: Float64Array) {}

  get size(): number {
    return this.items.length;
  }

  push(v: number): void {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]!]! <= this.f[a[i]!]!) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }

  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.f[a[l]!]! < this.f[a[m]!]!) m = l;
        if (r < a.length && this.f[a[r]!]! < this.f[a[m]!]!) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

export interface PathOptions {
  /** Limite de nós expandidos para proteger o orçamento de CPU. */
  maxExpanded?: number;
}

/**
 * A* em 8 direções sem cortar quinas de células bloqueadas.
 * Retorna a lista de células do início ao fim (inclusive), ou null se não houver caminho.
 */
export function findPath(grid: Grid, start: Cell, goal: Cell, opts: PathOptions = {}): Cell[] | null {
  if (!grid.inBounds(start.cx, start.cy) || !grid.isPassable(goal.cx, goal.cy)) return null;
  const maxExpanded = opts.maxExpanded ?? grid.width * grid.height;
  const n = grid.width * grid.height;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(f);

  const startI = grid.index(start.cx, start.cy);
  const goalI = grid.index(goal.cx, goal.cy);
  const h = (cx: number, cy: number) => {
    const dx = Math.abs(cx - goal.cx);
    const dy = Math.abs(cy - goal.cy);
    // heurística octil com custo mínimo de terreno (estrada) para manter admissibilidade
    return 0.7 * (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy));
  };

  g[startI] = 0;
  f[startI] = h(start.cx, start.cy);
  heap.push(startI);
  let expanded = 0;

  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goalI) return reconstruct(grid, came, cur);
    closed[cur] = 1;
    if (++expanded > maxExpanded) return null;

    const cx = cur % grid.width;
    const cy = (cur - cx) / grid.width;
    for (const [dx, dy, step] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.isPassable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!grid.isPassable(cx + dx, cy) || !grid.isPassable(cx, cy + dy))) continue;
      const ni = grid.index(nx, ny);
      if (closed[ni]) continue;
      const cost = g[cur]! + step * grid.pathCost(nx, ny);
      if (cost < g[ni]!) {
        g[ni] = cost;
        f[ni] = cost + h(nx, ny);
        came[ni] = cur;
        heap.push(ni);
      }
    }
  }
  return null;
}

function reconstruct(grid: Grid, came: Int32Array, end: number): Cell[] {
  const out: Cell[] = [];
  let cur = end;
  while (cur !== -1) {
    const cx = cur % grid.width;
    out.push({ cx, cy: (cur - cx) / grid.width });
    cur = came[cur]!;
  }
  return out.reverse();
}
