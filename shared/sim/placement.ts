import { BUILDINGS, buildingCost, canAfford, CITY, TERRAIN, ownedOfType, UNITS, type BuildingType, type Stockpile, type Terrain, type UnitType } from './config.ts';
import type { DepositIndex } from './deposits.ts';
import { chooseClaims, claimedBy, sitesByDeposit } from './gathering.ts';
import type { Cell, Slot } from './types.ts';

const WATER = 4 as Terrain;
const ROAD = 1 as Terrain;
/** Edifícios de onde saem tropas e veículos: a saída deles não pode ser fechada por outra obra. */
const PRODUCERS = new Set<BuildingType>(Object.values(UNITS).map((u) => u.producedBy));
/** Uma saída é "aberta" se a partir dela dá para andar por pelo menos tantas células livres. */
const EXIT_CELLS = 120;
/** Células livres em volta da poça de uma jazida de petróleo (o desenho da poça passa um pouco das 2×2 células). */
const OIL_MARGIN = 0;

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
  /** Células de estrada construídas pelos jogadores (levam tropas, comboios e energia): nada vai em cima delas. */
  builtRoads?: { has(i: number): boolean };
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
      // a estrada construída leva tropas, comboios e energia: nada vai em cima dela (as do mapa seguem livres)
      if (t === ROAD && w.builtRoads?.has(y * w.width + x)) return 'Estrada no caminho: construa ao lado dela';
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
  // a poça de petróleo (2×2 células a partir da jazida) e uma célula de margem em volta ficam reservadas para o poço
  if (def.gather?.terrain !== null) {
    for (const n of w.resourceNodes) {
      const overlaps = cell.cx < n.cx + 2 + OIL_MARGIN && cell.cx + def.size > n.cx - OIL_MARGIN && cell.cy < n.cy + 2 + OIL_MARGIN && cell.cy + def.size > n.cy - OIL_MARGIN;
      if (overlaps) return 'Jazida de petróleo: aqui só cabe um Poço de Petróleo';
    }
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
    // mesma regra do servidor: a coleta não conta células embaixo de edifícios (nem embaixo do próprio)
    const under = new Set<number>();
    for (const b of [...buildings, { type, cell }]) {
      const s = BUILDINGS[b.type].size;
      for (let y = b.cell.cy; y < b.cell.cy + s; y++) for (let x = b.cell.cx; x < b.cell.cx + s; x++) under.add(y * w.width + x);
    }
    const oil = def.gather?.terrain === null;
    const choice = chooseClaims(w, w.deposits, type, cell, claimedBy(buildings, type), sitesByDeposit(buildings), (i) => w.territory[i] === slot && (oil || !under.has(i)));
    if (choice.error) return choice.error;
  }
  const blocked = exitBlocked(w, buildings, slot, type, cell);
  if (blocked) return blocked;
  // custo crescente: cada edifício do mesmo tipo encarece o próximo
  if (!canAfford(w.resources, buildingCost(type, ownedOfType(buildings, slot, type)))) return 'Recursos insuficientes';
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

/**
 * A obra fecharia a saída de um quartel ou fábrica (os veículos nasceriam presos)? Compara o antes e o depois: só
 * recusa se a saída estava aberta e deixaria de estar (um edifício já cercado pelo relevo não trava as obras vizinhas).
 */
function exitBlocked(w: PlacementWorld, buildings: { type: BuildingType; owner: Slot; cell: Cell }[], slot: Slot, type: BuildingType, cell: Cell): string | null {
  const size = BUILDINGS[type].size;
  const producers = buildings.filter((b) => b.owner === slot && PRODUCERS.has(b.type) && near(b, cell, size));
  if (PRODUCERS.has(type)) producers.push({ type, owner: slot, cell });
  if (!producers.length) return null;
  const occupied = new Set<number>();
  for (const b of buildings) {
    const s = BUILDINGS[b.type].size;
    for (let y = b.cell.cy; y < b.cell.cy + s; y++) for (let x = b.cell.cx; x < b.cell.cx + s; x++) occupied.add(y * w.width + x);
  }
  const added = new Set<number>();
  for (let y = cell.cy; y < cell.cy + size; y++) for (let x = cell.cx; x < cell.cx + size; x++) added.add(y * w.width + x);
  const free = (x: number, y: number, withNew: boolean) => {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height) return false;
    const i = y * w.width + x;
    const t = w.terrain[i];
    return t !== undefined && TERRAIN[t].passable && !occupied.has(i) && !(withNew && added.has(i));
  };
  for (const p of producers) {
    const isNew = p.cell === cell;
    const before = isNew || open(w, p, (x, y) => free(x, y, false));
    if (before && !open(w, p, (x, y) => free(x, y, true))) return isNew ? `${BUILDINGS[type].label}: sem saída livre para as tropas aqui` : `Fecharia a saída do edifício ${BUILDINGS[p.type].label}: deixe um caminho livre`;
  }
  return null;
}

function near(b: { type: BuildingType; cell: Cell }, cell: Cell, size: number): boolean {
  const s = BUILDINGS[b.type].size;
  return b.cell.cx - 2 <= cell.cx + size && cell.cx <= b.cell.cx + s + 2 && b.cell.cy - 2 <= cell.cy + size && cell.cy <= b.cell.cy + s + 2;
}

/** Busca em largura a partir das células em volta do edifício: alcança `EXIT_CELLS` células livres? */
function open(w: PlacementWorld, b: { type: BuildingType; cell: Cell }, free: (x: number, y: number) => boolean): boolean {
  const s = BUILDINGS[b.type].size;
  const seen = new Set<number>();
  const queue: number[] = [];
  for (let y = b.cell.cy - 1; y <= b.cell.cy + s; y++)
    for (let x = b.cell.cx - 1; x <= b.cell.cx + s; x++) {
      const ring = x === b.cell.cx - 1 || y === b.cell.cy - 1 || x === b.cell.cx + s || y === b.cell.cy + s;
      if (ring && free(x, y)) {
        const i = y * w.width + x;
        if (!seen.has(i)) {
          seen.add(i);
          queue.push(i);
        }
      }
    }
  for (let q = 0; q < queue.length && seen.size < EXIT_CELLS; q++) {
    const i = queue[q]!;
    const x = i % w.width;
    const y = (i - x) / w.width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (!free(nx, ny)) continue;
      const n = ny * w.width + nx;
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen.size >= EXIT_CELLS;
}
