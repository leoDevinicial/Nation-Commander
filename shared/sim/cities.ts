import { BUILDINGS, type BuildingType } from './config.ts';
import type { Cell, Slot } from './types.ts';

/**
 * Cidades (02/11, pedido do usuário: "cada região próxima a um QG ou prefeitura é uma cidade e as construções
 * próximas ficam atreladas ao QG ou cidade"). Cada construção pertence à sede (QG ou prefeitura do mesmo dono, pronta
 * ou em obra) mais próxima, centro a centro. Escola, Universidade, Floresta de Eucalipto, Forno de Carvão Vegetal e
 * Mina Subterrânea têm limite por cidade (`BuildingDef.perCity`): fundar cidades libera mais de cada.
 */
export interface CityBuilding {
  type: BuildingType;
  owner: Slot;
  cell: Cell;
  hp?: number;
}

const center = (type: BuildingType, cell: Cell) => ({ x: cell.cx + BUILDINGS[type].size / 2, y: cell.cy + BUILDINGS[type].size / 2 });

export const isCitySeat = (type: BuildingType) => type === 'hq' || type === 'city_hall';

/** Sede (QG ou prefeitura) mais próxima de uma construção do dono; null se ele não tiver nenhuma. */
export function citySeat<B extends CityBuilding>(buildings: Iterable<B>, owner: Slot, type: BuildingType, cell: Cell): B | null {
  const c = center(type, cell);
  let best: B | null = null;
  let bd = Infinity;
  for (const b of buildings) {
    if (b.owner !== owner || !isCitySeat(b.type) || (b.hp !== undefined && b.hp <= 0)) continue;
    const s = center(b.type, b.cell);
    const d = (s.x - c.x) ** 2 + (s.y - c.y) ** 2;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Quantas construções do tipo já pertencem à mesma cidade que a posição pedida. */
export function cityCount<B extends CityBuilding>(buildings: Iterable<B>, owner: Slot, type: BuildingType, cell: Cell): { seat: B | null; count: number } {
  const list = [...buildings];
  const seat = citySeat(list, owner, type, cell);
  if (!seat) return { seat, count: 0 };
  let count = 0;
  for (const b of list) if (b.owner === owner && b.type === type && (b.hp === undefined || b.hp > 0) && citySeat(list, owner, b.type, b.cell) === seat) count++;
  return { seat, count };
}
