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
  /**
   * Bloqueio extra temporário (ex.: território onde a unidade não pode entrar), aplicado só
   * durante o planejamento de um caminho.
   */
  blocker: ((cx: number, cy: number) => boolean) | null = null;

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
    return TERRAIN[this.terrainAt(cx, cy)].passable && this.occupant(cx, cy) === 0 && !this.blocker?.(cx, cy);
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

  /**
   * Verifica se o segmento a→b atravessa apenas células passáveis. Percorre exatamente as células
   * cortadas pela linha (DDA, sem pular quinas) e, com `clearance` (em células), também duas linhas
   * paralelas a essa distância — o corpo da unidade não raspa pedra, água nem parede.
   */
  lineWalkable(a: Vec2, b: Vec2, clearance = 0): boolean {
    if (!this.cellsClear(a, b)) return false;
    if (clearance <= 0) return true;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) return true;
    const ox = (-(b.y - a.y) / len) * clearance * this.cellSize;
    const oy = ((b.x - a.x) / len) * clearance * this.cellSize;
    return this.cellsClear({ x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }) && this.cellsClear({ x: a.x - ox, y: a.y - oy }, { x: b.x - ox, y: b.y - oy });
  }

  /** Travessia de grade (Amanatides & Woo): toda célula tocada pelo segmento precisa ser passável. */
  private cellsClear(a: Vec2, b: Vec2): boolean {
    const cs = this.cellSize;
    let cx = Math.floor(a.x / cs);
    let cy = Math.floor(a.y / cs);
    const ex = Math.floor(b.x / cs);
    const ey = Math.floor(b.y / cs);
    if (!this.isPassable(cx, cy)) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(cs / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(cs / dy) : Infinity;
    let tx = dx !== 0 ? (sx > 0 ? (cx + 1) * cs - a.x : a.x - cx * cs) / Math.abs(dx) : Infinity;
    let ty = dy !== 0 ? (sy > 0 ? (cy + 1) * cs - a.y : a.y - cy * cs) / Math.abs(dy) : Infinity;
    for (let n = Math.abs(ex - cx) + Math.abs(ey - cy); n > 0; n--) {
      if (Math.abs(tx - ty) < 1e-9) {
        // passa exatamente pela quina: as duas vizinhas também contam (não corta canto)
        if (!this.isPassable(cx + sx, cy) || !this.isPassable(cx, cy + sy)) return false;
        cx += sx;
        cy += sy;
        tx += tdx;
        ty += tdy;
        n--;
      } else if (tx < ty) {
        cx += sx;
        tx += tdx;
      } else {
        cy += sy;
        ty += tdy;
      }
      if (!this.isPassable(cx, cy)) return false;
    }
    return true;
  }
}
