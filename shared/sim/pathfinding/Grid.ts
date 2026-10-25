import { TERRAIN, Terrain } from '../config.ts';
import type { Cell, Vec2 } from '../types.ts';

/** Grade de navegação: terreno estático + ocupação dinâmica por edifícios. */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly terrain: Terrain[];
  /** id do edifício que ocupa a célula, 0 se livre. */
  private readonly occupancy: Int32Array;

  constructor(width: number, height: number, cellSize: number, terrain: Terrain[]) {
    if (terrain.length !== width * height) throw new Error('Tamanho de terreno inválido');
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.terrain = terrain;
    this.occupancy = new Int32Array(width * height);
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  index(cx: number, cy: number): number {
    return cy * this.width + cx;
  }

  terrainAt(cx: number, cy: number): Terrain {
    return this.terrain[this.index(cx, cy)] ?? Terrain.Rock;
  }

  occupant(cx: number, cy: number): number {
    return this.occupancy[this.index(cx, cy)] ?? 0;
  }

  isPassable(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return false;
    return TERRAIN[this.terrainAt(cx, cy)].passable && this.occupant(cx, cy) === 0;
  }

  pathCost(cx: number, cy: number): number {
    return TERRAIN[this.terrainAt(cx, cy)].pathCost;
  }

  setOccupied(cell: Cell, size: number, id: number): void {
    for (let y = cell.cy; y < cell.cy + size; y++) {
      for (let x = cell.cx; x < cell.cx + size; x++) {
        if (this.inBounds(x, y)) this.occupancy[this.index(x, y)] = id;
      }
    }
  }

  worldToCell(p: Vec2): Cell {
    return { cx: Math.floor(p.x / this.cellSize), cy: Math.floor(p.y / this.cellSize) };
  }

  cellCenter(c: Cell): Vec2 {
    return { x: (c.cx + 0.5) * this.cellSize, y: (c.cy + 0.5) * this.cellSize };
  }

  isWorldPassable(p: Vec2): boolean {
    const c = this.worldToCell(p);
    return this.isPassable(c.cx, c.cy);
  }

  /** Busca em anéis a célula passável mais próxima. */
  nearestPassable(c: Cell, maxRadius = 12): Cell | null {
    if (this.isPassable(c.cx, c.cy)) return c;
    for (let r = 1; r <= maxRadius; r++) {
      let best: Cell | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = c.cx + dx;
          const y = c.cy + dy;
          if (!this.isPassable(x, y)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { cx: x, cy: y };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Verifica se o segmento a→b atravessa apenas células passáveis (amostragem densa). */
  lineWalkable(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize * 0.25)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWorldPassable({ x: a.x + dx * t, y: a.y + dy * t })) return false;
    }
    return true;
  }
}
