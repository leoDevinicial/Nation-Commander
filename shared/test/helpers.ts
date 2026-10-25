import { CELL_SIZE, Terrain } from '../sim/config.ts';
import type { MapData } from '../sim/types.ts';

/** Mapa plano 32x32 com bases em cantos opostos, para testes controlados. */
export function flatMap(size = 32, edit?: (set: (cx: number, cy: number, t: Terrain) => void) => void): MapData {
  const terrain = new Array<Terrain>(size * size).fill(Terrain.Plains);
  edit?.((cx, cy, t) => {
    terrain[cy * size + cx] = t;
  });
  return {
    width: size,
    height: size,
    cellSize: CELL_SIZE,
    seed: 1,
    terrain,
    resourceNodes: [{ cx: 10, cy: 3 }],
    spawns: [
      { cx: 3, cy: 3 },
      { cx: size - 4, cy: size - 4 },
    ],
  };
}
