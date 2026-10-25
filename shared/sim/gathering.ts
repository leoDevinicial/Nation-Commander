import { BUILDINGS, type BuildingType, type Terrain } from './config.ts';
import type { Cell } from './types.ts';

export interface GatherWorld {
  width: number;
  height: number;
  terrain: ArrayLike<Terrain>;
}

/**
 * Células de recurso que um edifício de coleta reivindicaria em `cell`, excluindo as já
 * reivindicadas por outro edifício do mesmo tipo. Ordem determinística: mais próximas do centro
 * primeiro, depois menor índice. Retorna índices da grade.
 */
export function claimableCells(world: GatherWorld, type: BuildingType, cell: Cell, claimed: ReadonlySet<number>): number[] {
  const def = BUILDINGS[type];
  const g = def.gather;
  if (!g || g.terrain === null) return [];
  const size = def.size;
  const cx = cell.cx + size / 2;
  const cy = cell.cy + size / 2;
  const out: { i: number; d: number }[] = [];
  for (let y = cell.cy - g.radius; y < cell.cy + size + g.radius; y++) {
    for (let x = cell.cx - g.radius; x < cell.cx + size + g.radius; x++) {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      const i = y * world.width + x;
      if (world.terrain[i] !== g.terrain || claimed.has(i)) continue;
      out.push({ i, d: Math.hypot(x + 0.5 - cx, y + 0.5 - cy) });
    }
  }
  out.sort((a, b) => a.d - b.d || a.i - b.i);
  return out.slice(0, g.maxCells).map((o) => o.i);
}

/** Conjunto de células já reivindicadas por edifícios do mesmo tipo. */
export function claimedBy(buildings: Iterable<{ type: BuildingType; claims?: number[] }>, type: BuildingType): Set<number> {
  const set = new Set<number>();
  for (const b of buildings) if (b.type === type) for (const i of b.claims ?? []) set.add(i);
  return set;
}

/** Renda por segundo de um edifício de coleta com `claims` células. */
export function gatherRate(type: BuildingType, claims: number): number {
  const g = BUILDINGS[type].gather;
  if (!g) return 0;
  return g.terrain === null ? g.ratePerCell : claims * g.ratePerCell;
}
