import { BUILDINGS, canAfford, CITY, TERRAIN, UNITS, type BuildingType, type Stockpile, type Terrain, type UnitType } from './config.ts';
import type { DepositIndex } from './deposits.ts';
import { chooseClaims, claimedBy, sitesByDeposit } from './gathering.ts';
import type { Cell, Slot } from './types.ts';

const WATER = 4 as Terrain;

/** Visão mínima do mundo necessária para validar uma construção (usada no servidor e no cliente). */
export interface PlacementWorld {
  width: number;
  height: number;
  cellSize: number;
  terrain: ArrayLike<Terrain>;
  resourceNodes: Cell[];
  buildings: Iterable<{ type: BuildingType; owner: Slot; cell: Cell; progress: number; claims?: number[]; depositId?: number | null }>;
  units: Iterable<{ type: UnitType; pos: { x: number; y: number } }>;
  resources: Stockpile;
  /** Dono de cada célula (-1 = neutro). */
  territory: ArrayLike<number>;
  /** Fora do território vale (obstáculo perto de um engenheiro): só não pode em país sem guerra. */
  outsideOk?: (owner: number) => boolean;
  deposits: DepositIndex;
}

/** Motivo pelo qual não se pode construir, ou null se a posição é válida. */
export function placementError(w: PlacementWorld, slot: Slot, type: BuildingType, cell: Cell): string | null {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'Este edifício não pode ser construído';
  const buildings = [...w.buildings];
  let foreign = -1;
  let outside = false;
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
      const owner = w.territory[y * w.width + x] ?? -1;
      if (owner !== slot) {
        outside = true;
        if (owner >= 0) foreign = owner;
      }
    }
  }
  if (w.outsideOk && outside) {
    if (foreign >= 0 && !w.outsideOk(foreign)) return 'Território de outra nação: não é possível construir aqui';
  } else {
    if (foreign >= 0) return 'Território de outra nação: não é possível construir aqui';
    if (outside) return 'Fora do seu território: amplie a fronteira com casas, bases ou torres';
  }
  if (type === 'city_hall') {
    // cidades espaçadas: a prefeitura precisa de distância de outra prefeitura e de qualquer QG
    const c = { x: cell.cx + def.size / 2, y: cell.cy + def.size / 2 };
    for (const b of buildings) {
      if (b.type !== 'city_hall' && b.type !== 'hq') continue;
      const s = BUILDINGS[b.type].size;
      if (Math.hypot(b.cell.cx + s / 2 - c.x, b.cell.cy + s / 2 - c.y) < CITY.spacingCells)
        return `Muito perto de ${b.type === 'hq' ? 'um Centro de Comando' : 'outra cidade'}: prefeituras ficam a pelo menos ${CITY.spacingCells} células de outra prefeitura ou do QG`;
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
  if (def.nearWater) {
    // o cais precisa encostar na água: ao menos duas células de água em volta do terreno
    let water = 0;
    for (let y = cell.cy - 1; y <= cell.cy + def.size; y++)
      for (let x = cell.cx - 1; x <= cell.cx + def.size; x++) {
        const inside = x >= cell.cx && x < cell.cx + def.size && y >= cell.cy && y < cell.cy + def.size;
        if (inside || x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
        if (w.terrain[y * w.width + x] === WATER) water++;
      }
    if (water < 2) return `${def.label}: precisa ficar na margem da água`;
  }
  if (def.gather) {
    const choice = chooseClaims(w, w.deposits, type, cell, claimedBy(buildings, type), sitesByDeposit(buildings), (i) => w.territory[i] === slot);
    if (choice.error) return choice.error;
  }
  if (!canAfford(w.resources, def.cost)) return 'Recursos insuficientes';
  return null;
}

/** Célula âncora (canto superior esquerdo) para centralizar um edifício sob o cursor. */
export function anchorForCursor(type: BuildingType, cursor: Cell, resourceNodes: Cell[]): Cell {
  if (BUILDINGS[type].gather?.terrain === null) {
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
