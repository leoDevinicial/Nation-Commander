import * as THREE from 'three';
import { layers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel } from './buildingModels.ts';

type Built = Omit<BuildingModel, 'detail'>;
type V3 = [number, number, number];

const SAND = '#dcc088';
const SAND_DARK = '#b59b6a';
const SAND_LIGHT = '#ead5a6';
const CAP = '#3a3e41';
const STEEL = '#8f969d';

/** Inclinação dos lançadores (rad acima da horizontal) e o giro do referencial do casulo em torno de x. */
const ELEV = 1.2;
const TILT = Math.PI / 2 - ELEV;
/** Lançadores: posição da dobradiça (base do casulo) no referencial do modelo. */
const LAUNCHERS: V3[] = [
  [-1.15, 0.5, 0.15],
  [0, 0.5, 0.45],
  [1.15, 0.5, 0.15],
];
/** Casulo: 5 × 4 tubos, comprimento ao longo do eixo. */
const COLS = 5;
const ROWS = 4;
const PITCH = 0.118;
const LEN = 1.05;

/** Ponto do referencial do casulo (eixo +y ao longo dos tubos) levado ao modelo. */
function frame(pivot: V3, local: V3): V3 {
  const [x, y, z] = local;
  const c = Math.cos(TILT);
  const s = Math.sin(TILT);
  return [pivot[0] + x, pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
}

/** Bocas dos tubos de cada lançador e a direção de saída (referencial do modelo = mundo, centrado no edifício). */
export const DOME_TUBES: { mouths: V3[]; dir: V3 }[] = LAUNCHERS.map((p) => {
  const mouths: V3[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) mouths.push(frame(p, [(c - (COLS - 1) / 2) * PITCH, LEN + 0.02, (r - (ROWS - 1) / 2) * PITCH]));
  return { mouths, dir: [0, Math.sin(ELEV), Math.cos(ELEV)] };
});

/** Peça no referencial do casulo (girada junto com ele). */
function boxIn(b: PartBuilder, pivot: V3, w: number, h: number, d: number, color: string, local: V3): void {
  b.box(w, h, d, color, frame(pivot, local), [TILT, 0, 0]);
}

/**
 * Domo de Ferro (2×2), bateria de defesa antimíssil em low poly, feita a partir das fotos de referência:
 * - três lançadores sobre reboque com sapatas, casulos de 20 tubos (5 × 4) inclinados a ~69°, nervuras laterais, tampas
 *   escuras dos tubos, cavaletes em A e o mastro de comunicação atrás de cada um, com o painel branco em losango;
 * - radar de busca (painel plano inclinado sobre plataforma giratória, que gira devagar) num reboque;
 * - centro de controle (contêiner com ar-condicionado e antenas), gerador e giroflexes laranja;
 * - cascalho e cerca em volta.
 * A faixa da nação vai na lateral de cada casulo e no contêiner.
 */
export function buildIronDome(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.8, 0.06, 3.8, '#9b958a', [0, 0.03, 0]);
  b.box(3.5, 0.02, 1.6, '#8c867b', [0, 0.07, 0.3]);
  // cerca de arame em volta
  railing(b, [-1.85, -1.85], [1.85, -1.85], 0.06, 0.32, '#a9aeb2', 6);
  railing(b, [-1.85, 1.85], [1.85, 1.85], 0.06, 0.32, '#a9aeb2', 6);
  railing(b, [-1.85, -1.85], [-1.85, 1.85], 0.06, 0.32, '#a9aeb2', 6);
  railing(b, [1.85, -1.85], [1.85, 1.85], 0.06, 0.32, '#a9aeb2', 6);

  for (const p of LAUNCHERS) {
    const [px, , pz] = p;
    // reboque: plataforma, eixo com rodas atrás, sapatas nos quatro cantos
    b.box(0.86, 0.1, 1.15, SAND_DARK, [px, 0.36, pz - 0.05]);
    b.box(0.8, 0.12, 0.3, SAND, [px, 0.24, pz - 0.5]);
    for (const dx of [-0.36, 0.36]) {
      b.cyl(0.15, 0.15, 0.1, '#262829', [px + dx, 0.17, pz - 0.48], [0, 0, Math.PI / 2], 10);
      b.cyl(0.07, 0.07, 0.11, STEEL, [px + dx, 0.17, pz - 0.48], [0, 0, Math.PI / 2], 8);
    }
    for (const [dx, dz] of [
      [-0.45, 0.45],
      [0.45, 0.45],
      [-0.45, -0.3],
      [0.45, -0.3],
    ] as const) {
      b.box(0.05, 0.3, 0.05, SAND_DARK, [px + dx, 0.22, pz + dz]);
      b.box(0.14, 0.03, 0.14, '#6d6a62', [px + dx, 0.075, pz + dz]);
    }
    // casulo: corpo, nervuras e tampas escuras dos tubos na face de cima
    boxIn(b, p, COLS * PITCH + 0.06, LEN, ROWS * PITCH + 0.06, SAND, [0, LEN / 2, 0]);
    for (let k = 0; k < 4; k++) {
      const y = 0.15 + k * 0.27;
      boxIn(b, p, COLS * PITCH + 0.09, 0.05, ROWS * PITCH + 0.09, SAND_DARK, [0, y, 0]);
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) boxIn(b, p, 0.02, LEN * 0.9, 0.06, SAND_DARK, [sx * (COLS * PITCH * 0.5 + 0.035), LEN / 2, (k - 1) * 0.15]);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) boxIn(b, p, PITCH * 0.82, 0.02, PITCH * 0.82, CAP, [(c - (COLS - 1) / 2) * PITCH, LEN + 0.005, (r - (ROWS - 1) / 2) * PITCH]);
    boxIn(b, p, COLS * PITCH + 0.07, 0.06, 0.06, SAND_LIGHT, [0, LEN - 0.03, (ROWS * PITCH) / 2 + 0.03]);
    // faixa da nação na lateral do casulo
    for (const sx of [-1, 1]) {
      const at = frame(p, [sx * (COLS * PITCH * 0.5 + 0.045), LEN * 0.62, 0]);
      a.box(0.012, 0.16, 0.36, '#ffffff', at, [TILT, 0, 0]);
    }
    // cavaletes em A do reboque até o meio do casulo e o macaco hidráulico
    for (const sx of [-1, 1]) {
      const top = frame(p, [sx * 0.3, LEN * 0.55, -(ROWS * PITCH) / 2]);
      strut(b, [px + sx * 0.38, 0.42, pz - 0.4], top, 0.035, SAND_DARK);
      strut(b, [px + sx * 0.38, 0.42, pz + 0.35], top, 0.035, SAND_DARK);
    }
    strut(b, [px, 0.42, pz - 0.45], frame(p, [0, LEN * 0.35, -(ROWS * PITCH) / 2]), 0.05, STEEL, true);
    // mastro de comunicação atrás do lançador, com o painel branco em losango
    const mx = px + 0.3;
    const mz = pz - 0.62;
    b.cyl(0.018, 0.024, 2.1, '#d7d9d6', [mx, 0.42 + 1.05, mz], undefined, 6);
    b.box(0.04, 0.06, 0.04, STEEL, [mx, 2.45, mz]);
    b.box(0.3, 0.3, 0.02, '#eef0ee', [mx, 2.62, mz + 0.03], [0, 0, Math.PI / 4]);
    b.box(0.07, 0.07, 0.05, '#55595d', [mx, 2.62, mz + 0.05]);
    for (let k = 0; k < 5; k++) b.box(0.012, 0.32, 0.012, '#2a2c2e', [mx + (k % 2 ? 0.035 : -0.035), 0.7 + k * 0.33, mz + 0.03], [0, 0, k % 2 ? 0.25 : -0.25]);
  }

  // radar de busca: reboque e plataforma giratória (o painel é a parte animada)
  b.box(0.8, 0.12, 1.0, SAND_DARK, [-1.25, 0.3, -1.25]);
  for (const dx of [-0.34, 0.34]) b.cyl(0.13, 0.13, 0.09, '#262829', [-1.25 + dx, 0.15, -1.5], [0, 0, Math.PI / 2], 10);
  b.box(0.5, 0.25, 0.45, SAND, [-1.25, 0.48, -1.0]);
  b.cyl(0.18, 0.22, 0.12, STEEL, [-1.25, 0.42, -1.4], undefined, 12);
  const radar = layers();
  radar.body.cyl(0.16, 0.16, 0.12, STEEL, [0, 0.06, 0], undefined, 12);
  radar.body.box(0.08, 0.35, 0.12, SAND_DARK, [0, 0.28, 0.0]);
  const face = new THREE.Euler(-0.32, 0, 0);
  radar.body.box(0.96, 0.66, 0.08, SAND, [0, 0.6, 0.06], [face.x, 0, 0]);
  radar.body.box(0.86, 0.56, 0.02, '#4b5054', [0, 0.6, 0.11], [face.x, 0, 0]);
  for (let k = 0; k < 4; k++) radar.body.box(0.84, 0.012, 0.025, '#5d6266', [0, 0.42 + k * 0.12, 0.12 - k * 0.04], [face.x, 0, 0]);
  radar.accent.box(0.3, 0.06, 0.02, '#ffffff', [0, 0.9, -0.02], [face.x, 0, 0]);

  // centro de controle (contêiner), gerador, giroflexes e antenas
  b.box(1.1, 0.55, 0.62, SAND, [1.2, 0.35, -1.25]);
  b.box(1.12, 0.04, 0.64, SAND_DARK, [1.2, 0.64, -1.25]);
  for (let k = 0; k < 5; k++) b.box(0.012, 0.5, 0.62, SAND_DARK, [0.72 + k * 0.24, 0.35, -1.25]);
  b.box(0.3, 0.22, 0.2, SAND_LIGHT, [0.85, 0.77, -1.25]);
  g.box(0.24, 0.12, 0.01, '#ffffff', [1.45, 0.42, -0.935]);
  a.box(0.4, 0.08, 0.01, '#ffffff', [1.2, 0.52, -0.935]);
  b.cyl(0.012, 0.012, 1.0, '#d7d9d6', [1.6, 1.15, -1.4], undefined, 5);
  b.cyl(0.04, 0.04, 0.06, '#e07a1c', [1.0, 0.7, -1.05], undefined, 8);
  b.cyl(0.04, 0.04, 0.06, '#e07a1c', [-1.05, 0.65, -0.82], undefined, 8);
  b.box(0.5, 0.32, 0.36, SAND_DARK, [0.15, 0.22, -1.45]);
  b.cyl(0.03, 0.03, 0.3, '#2a2c2e', [0.3, 0.52, -1.5], undefined, 6);
  // cabos no chão do contêiner até os lançadores
  for (const p of LAUNCHERS) b.box(0.025, 0.015, Math.abs(p[2] + 1.0), '#2a2c2e', [p[0] + 0.2, 0.075, (p[2] - 1.0) / 2]);

  return { base: l.build(), moving: { layers: radar.build(), pivot: [-1.25, 0.48, -1.4], kind: 'spin' }, height: 2.9 };
}
