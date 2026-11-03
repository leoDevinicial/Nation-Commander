import { Terrain } from '../../../shared/sim/config.ts';
import type { MapData } from '../../../shared/sim/types.ts';

/**
 * Relevo do mapa (03/11): montanhas de verdade. A rocha e o minério sobem conforme a distância até a borda do maciço
 * (`depth`, em células): a borda fica rente ao chão (é ali que se constroem pedreira e mina) e o miolo vira encosta e
 * pico. Só visual — a simulação continua na grade plana, e rocha e minério seguem intransitáveis.
 * Um único lugar calcula a altura de cada célula, para o terreno, as estradas, as tropas e as construções concordarem.
 */

/** Subida por célula de profundidade na rocha e altura máxima do pico (unidades de mundo). */
const RISE = 1.8;
const PEAK = 11;

/** Profundidade de cada célula de rocha/minério (1 = encosta na borda; 0 = fora da montanha). */
export function mountainDepth(map: Pick<MapData, 'width' | 'height' | 'terrain'>): Uint8Array {
  const { width: w, height: h } = map;
  const depth = new Uint8Array(w * h);
  const mountain = (i: number) => map.terrain[i] === Terrain.Rock || map.terrain[i] === Terrain.Ore;
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mountain(i)) continue;
    const x = i % w;
    const y = (i - x) / w;
    // borda: alguma vizinha (8) fora da rocha, ou a beira do mapa
    let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1 && !edge; dx++) if (!mountain((y + dy) * w + x + dx)) edge = true;
    if (edge) {
      depth[i] = 1;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!mountain(n) || depth[n]) continue;
      depth[n] = Math.min(250, depth[i]! + 1);
      queue.push(n);
    }
  }
  return depth;
}

/** Ruído determinístico por célula (0..1), para os picos não saírem iguais. */
function hash(i: number): number {
  let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Altura-base de uma célula: água afunda, lama um pouco, rocha sobe com a profundidade. */
export function cellHeight(t: Terrain | undefined, depth: number, i: number): number {
  if (t === Terrain.Water) return -0.7;
  if (t === Terrain.Mud) return -0.08;
  if (t === Terrain.Rock || t === Terrain.Ore) {
    if (depth <= 1) return 0.9;
    // encosta que fica mais íngreme perto do cume, com picos de alturas diferentes
    const k = depth - 1;
    return Math.min(PEAK, 0.9 + RISE * k * (1 + 0.12 * k) * (0.75 + 0.5 * hash(i)));
  }
  return 0;
}

/** Altura do chão em (x, z): média das quatro células em volta (a mesma conta da malha do terreno). */
export function reliefHeight(map: Pick<MapData, 'width' | 'height' | 'terrain' | 'cellSize'>, depth: Uint8Array, x: number, z: number): number {
  const cs = map.cellSize;
  const o = cs * 0.45;
  let sum = 0;
  for (const [px, pz] of [
    [x - o, z - o],
    [x + o, z - o],
    [x - o, z + o],
    [x + o, z + o],
  ] as const) {
    const cx = Math.min(map.width - 1, Math.max(0, Math.floor(px / cs)));
    const cy = Math.min(map.height - 1, Math.max(0, Math.floor(pz / cs)));
    const i = cy * map.width + cx;
    sum += cellHeight(map.terrain[i], depth[i]!, i);
  }
  return sum / 4;
}

/** Neve nos picos: quanto clarear a cor do chão nessa altura (0 = nada, 1 = cume nevado, a partir de ~8). */
export function snowAt(height: number): number {
  return Math.max(0, Math.min(1, (height - 8) / 2.5));
}
