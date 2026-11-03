import { Terrain } from '../../../shared/sim/config.ts';
import type { MapData } from '../../../shared/sim/types.ts';

/**
 * Costa orgânica (03/11, pedido do usuário: "a shoreline parece cortada com régua"). A simulação continua na grade, mas
 * o desenho da margem não segue mais as bordas das células: uma distância com sinal até a costa (positiva na terra,
 * negativa na água, em células) é interpolada entre os centros das células e deslocada por um ruído suave. A altura do
 * chão perto da água e a faixa de areia saem dela, então a linha d'água vira baías e pontas em vez de degraus.
 * Só visual: as regras (onde se anda, onde se constrói) seguem a grade.
 */

/** Altura do fundo d'água e alcance (células) em que a margem é redesenhada. */
const SEA_FLOOR = -0.7;
const REACH = 2.2;

export interface CoastField {
  /** Distância com sinal no ponto (x, z) do mundo, já com o ruído (células; 0 = linha d'água). */
  at(x: number, z: number): number;
  /** Há água a até `REACH` células: só aí a margem muda. */
  near(x: number, z: number): boolean;
  /** Largura da faixa de areia (células a partir da água). */
  sandReach: number;
}

/** Distância de cada célula até a mais próxima que satisfaz `target` (chanfro 3-4, aproxima a euclidiana). */
function chamfer(w: number, h: number, target: (i: number) => boolean): Float32Array {
  const d = new Float32Array(w * h).fill(1e6);
  for (let i = 0; i < w * h; i++) if (target(i)) d[i] = 0;
  const relax = (i: number, j: number, c: number) => {
    if (d[j]! + c < d[i]!) d[i] = d[j]! + c;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) {
        relax(i, i - w, 1);
        if (x > 0) relax(i, i - w - 1, 1.414);
        if (x < w - 1) relax(i, i - w + 1, 1.414);
      }
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) relax(i, i + 1, 1);
      if (y < h - 1) {
        relax(i, i + w, 1);
        if (x < w - 1) relax(i, i + w + 1, 1.414);
        if (x > 0) relax(i, i + w - 1, 1.414);
      }
    }
  return d;
}

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Ruído de valor suave (−1..1) na escala de `1 / freq` células. */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

export function coastField(map: Pick<MapData, 'width' | 'height' | 'terrain' | 'cellSize' | 'seed' | 'kind'>): CoastField {
  const { width: w, height: h, cellSize: cs } = map;
  const water = (i: number) => map.terrain[i] === Terrain.Water;
  const toWater = chamfer(w, h, water);
  const toLand = chamfer(w, h, (i) => !water(i));
  // centro a centro: duas células vizinhas de lados opostos ficam em +0,5 e −0,5 (a costa passa entre elas)
  const sd = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) sd[i] = water(i) ? -(toLand[i]! - 0.5) : toWater[i]! - 0.5;
  const seed = map.seed | 0;
  const cell = (cx: number, cy: number) => sd[Math.min(h - 1, Math.max(0, cy)) * w + Math.min(w - 1, Math.max(0, cx))]!;
  const raw = (x: number, z: number) => {
    // posição em células, com os centros nos inteiros
    const u = x / cs - 0.5;
    const v = z / cs - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const a = cell(x0, y0);
    const b = cell(x0 + 1, y0);
    const c = cell(x0, y0 + 1);
    const d = cell(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  return {
    at(x, z) {
      const u = x / cs;
      const v = z / cs;
      // baías de ~3 células e recortes menores
      const n = valueNoise(u * 0.33, v * 0.33, seed) * 0.75 + valueNoise(u * 0.9 + 17, v * 0.9 + 5, seed + 1) * 0.3;
      return raw(x, z) + n;
    },
    near(x, z) {
      return Math.abs(raw(x, z)) < REACH;
    },
    // nos mapas oceânicos a praia (a faixa de lama do gerador) vira areia; nos outros, uma faixa estreita
    sandReach: map.kind === 'ocean' || map.kind === 'islands' ? 1.9 : 1.1,
  };
}

/**
 * Altura do chão perto da costa: do fundo (−0,7) até a altura da terra, numa rampa que cruza a linha d'água (−0,25)
 * onde a distância com sinal passa por 0. `land` é a altura que o vértice teria só com as células de terra.
 */
export function coastHeight(sd: number, land: number): number {
  const t = Math.min(1, Math.max(0, (sd + 0.9) / 1.5));
  const s = t * t * (3 - 2 * t);
  return SEA_FLOOR + (land - SEA_FLOOR) * s;
}

/** Peso da areia (0..1): cheia junto da água (inclusive no raso, visível sob a água), some a `reach` células. */
export function sandWeight(sd: number, reach: number): number {
  if (sd < -1.2) return 0;
  const t = Math.min(1, Math.max(0, (sd - reach * 0.55) / (reach * 0.45)));
  return 1 - t * t * (3 - 2 * t);
}
