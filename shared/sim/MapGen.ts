import { CELL_SIZE, MAP_SIZE, TERRAIN, Terrain } from './config.ts';
import { Random } from './Random.ts';
import type { Cell, MapData } from './types.ts';

/** Ruído de valor suavizado em grade grossa, interpolado bilinearmente. */
function valueNoise(rng: Random, size: number, scale: number): Float64Array {
  const coarse = Math.ceil(size / scale) + 2;
  const pts = new Float64Array(coarse * coarse);
  for (let i = 0; i < pts.length; i++) pts[i] = rng.next();
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const v00 = pts[y0 * coarse + x0]!;
      const v10 = pts[y0 * coarse + x0 + 1]!;
      const v01 = pts[(y0 + 1) * coarse + x0]!;
      const v11 = pts[(y0 + 1) * coarse + x0 + 1]!;
      out[y * size + x] = lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
    }
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Gera um mapa simétrico (rotação de 180°) para dois jogadores. Mesmo seed → mesmo mapa.
 * Garante uma estrada passável entre as bases e áreas livres ao redor das bases e jazidas.
 */
export function generateMap(seed: number, size = MAP_SIZE): MapData {
  const rng = new Random(seed);
  const elevation = valueNoise(rng, size, 9);
  const moisture = valueNoise(rng, size, 6);
  const detail = valueNoise(rng, size, 3);
  const terrain: Terrain[] = new Array<Terrain>(size * size).fill(Terrain.Plains);

  const half = Math.ceil((size * size) / 2);
  for (let i = 0; i < half; i++) {
    const e = elevation[i]! * 0.75 + detail[i]! * 0.25;
    const m = moisture[i]!;
    let t = Terrain.Plains;
    if (e < 0.2) t = Terrain.Water;
    else if (e < 0.26) t = Terrain.Mud;
    else if (e > 0.8) t = Terrain.Rock;
    else if (m > 0.66) t = Terrain.Forest;
    terrain[i] = t;
    terrain[size * size - 1 - i] = t; // simetria rotacional
  }

  const margin = 8;
  const spawns: Cell[] = [
    { cx: margin, cy: margin },
    { cx: size - 1 - margin, cy: size - 1 - margin },
  ];

  const set = (cx: number, cy: number, t: Terrain) => {
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) return;
    terrain[cy * size + cx] = t;
    terrain[(size - 1 - cy) * size + (size - 1 - cx)] = t;
  };
  const clearArea = (c: Cell, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = terrain[(c.cy + dy) * size + (c.cx + dx)];
        if (t !== undefined && t !== Terrain.Road) set(c.cx + dx, c.cy + dy, Terrain.Plains);
      }
  };

  clearArea(spawns[0]!, 7);

  // Jazidas: duas perto da base, uma em posição avançada; espelhadas para o adversário.
  const nodeOffsets: Cell[] = [
    { cx: margin + 9, cy: margin - 2 },
    { cx: margin - 2, cy: margin + 9 },
    { cx: Math.floor(size / 2) - 6, cy: Math.floor(size / 2) + 4 },
  ];
  const resourceNodes: Cell[] = [];
  for (const n of nodeOffsets) {
    clearArea(n, 2);
    resourceNodes.push(n);
  }
  // As jazidas espelhadas ocupam a célula oposta; o extrator 2x2 é ancorado na célula da jazida,
  // então a cópia espelhada precisa deslocar 1 célula para ficar dentro da área limpa.
  for (const n of nodeOffsets) resourceNodes.push({ cx: size - 2 - n.cx, cy: size - 2 - n.cy });

  // Estrada sinuosa ligando as bases (desenhada por último, garante conectividade).
  let x = spawns[0]!.cx + 2;
  let y = spawns[0]!.cy + 2;
  const tx = Math.floor(size / 2);
  while (x < tx || y < tx) {
    set(x, y, Terrain.Road);
    set(x + 1, y, Terrain.Road);
    if (x < tx && (y >= tx || rng.next() < 0.5)) x++;
    else y++;
  }
  set(tx, tx, Terrain.Road);
  set(tx - 1, tx, Terrain.Road);

  return { width: size, height: size, cellSize: CELL_SIZE, seed: seed >>> 0, terrain, resourceNodes, spawns };
}

/** Conta células passáveis alcançáveis a partir de `from` (para testes/diagnóstico). */
export function reachable(map: MapData, from: Cell): Set<number> {
  const seen = new Set<number>();
  const stack = [from.cy * map.width + from.cx];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i)) continue;
    const t = map.terrain[i];
    if (t === undefined || !TERRAIN[t].passable) continue;
    seen.add(i);
    const cx = i % map.width;
    const cy = (i - cx) / map.width;
    if (cx > 0) stack.push(i - 1);
    if (cx < map.width - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - map.width);
    if (cy < map.height - 1) stack.push(i + map.width);
  }
  return seen;
}
