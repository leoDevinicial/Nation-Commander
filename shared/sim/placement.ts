import { BUILDINGS, TERRAIN, UNITS, type BuildingType, type Terrain, type UnitType } from './config.ts';
import type { Cell, Slot } from './types.ts';

/** Visão mínima do mundo necessária para validar uma construção (usada no servidor e no cliente). */
export interface PlacementWorld {
  width: number;
  height: number;
  cellSize: number;
  terrain: ArrayLike<Terrain>;
  resourceNodes: Cell[];
  buildings: Iterable<{ type: BuildingType; owner: Slot; cell: Cell; progress: number }>;
  units: Iterable<{ type: UnitType; pos: { x: number; y: number } }>;
  resources: number;
}

/** Motivo pelo qual não se pode construir, ou null se a posição é válida. */
export function placementError(w: PlacementWorld, slot: Slot, type: BuildingType, cell: Cell): string | null {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'Este edifício não pode ser construído';
  const buildings = [...w.buildings];
  for (let y = cell.cy; y < cell.cy + def.size; y++) {
    for (let x = cell.cx; x < cell.cx + def.size; x++) {
      if (x < 0 || y < 0 || x >= w.width || y >= w.height) return 'Fora do mapa';
      const t = w.terrain[y * w.width + x];
      if (t === undefined || !TERRAIN[t].buildable) return 'Terreno impróprio para construção';
      const occupied = buildings.some((b) => {
        const s = BUILDINGS[b.type].size;
        return x >= b.cell.cx && x < b.cell.cx + s && y >= b.cell.cy && y < b.cell.cy + s;
      });
      if (occupied) return 'Local ocupado';
    }
  }
  const cs = w.cellSize;
  const minX = cell.cx * cs;
  const minY = cell.cy * cs;
  const maxX = (cell.cx + def.size) * cs;
  const maxY = (cell.cy + def.size) * cs;
  for (const u of w.units) {
    const r = UNITS[u.type].radius;
    if (u.pos.x + r > minX && u.pos.x - r < maxX && u.pos.y + r > minY && u.pos.y - r < maxY) return 'Há unidades no local';
  }
  if (type === 'extractor') {
    if (!w.resourceNodes.some((n) => n.cx === cell.cx && n.cy === cell.cy)) return 'Extratores precisam ser construídos sobre uma jazida';
  } else {
    const cx = (cell.cx + def.size / 2) * cs;
    const cy = (cell.cy + def.size / 2) * cs;
    const inRange = buildings.some((b) => {
      const bd = BUILDINGS[b.type];
      if (b.owner !== slot || b.progress < 1 || bd.buildRadius <= 0) return false;
      const bx = (b.cell.cx + bd.size / 2) * cs;
      const by = (b.cell.cy + bd.size / 2) * cs;
      return Math.hypot(bx - cx, by - cy) <= bd.buildRadius * cs;
    });
    if (!inRange) return 'Fora da área de construção';
  }
  if (w.resources < def.cost) return 'Suprimentos insuficientes';
  return null;
}

/** Célula âncora (canto superior esquerdo) para centralizar um edifício sob o cursor. */
export function anchorForCursor(type: BuildingType, cursor: Cell, resourceNodes: Cell[]): Cell {
  if (type === 'extractor') {
    // encaixa na jazida mais próxima do cursor, se houver uma a até 2 células
    let best: Cell | null = null;
    let bestD = Infinity;
    for (const n of resourceNodes) {
      const d = Math.hypot(n.cx + 0.5 - cursor.cx, n.cy + 0.5 - cursor.cy);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best && bestD <= 2.5) return { ...best };
  }
  const s = BUILDINGS[type].size;
  return { cx: cursor.cx - Math.floor((s - 1) / 2), cy: cursor.cy - Math.floor((s - 1) / 2) };
}
