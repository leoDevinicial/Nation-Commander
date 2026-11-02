import { C, layers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel } from './buildingModels.ts';

/**
 * Conhecimento e produção sem limite (02/11): Universidade, Floresta de Eucalipto (galpão com serraria; as árvores
 * ficam nas células plantadas, `eucalyptusCell`), Forno de Carvão Vegetal e Mina Subterrânea. Mesmo kit low poly das
 * outras construções; a camada `accent` recebe a cor da nação.
 */
type Built = Omit<BuildingModel, 'detail'>;

const STEEL = '#9aa1a8';
const DARK = '#3a3f45';
const BRICK = '#a5674c';
const TRIM = '#e9e4d6';
const BARK = '#b8a48a';
const LEAF = '#7f9c6c';
const LEAF_DARK = '#66855a';
const WHITE_STONE = '#ece8dc';

/** Universidade (3×3): prédio principal com colunata e cúpula, duas alas, biblioteca, gramado central e torre. */
export function buildUniversity(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(5.7, 0.1, 5.7, C.concreteDark, [0, 0.05, 0]);
  b.box(5.5, 0.012, 5.5, '#8f8b82', [0, 0.106, 0]);
  // gramado central com caminho em cruz
  b.box(2.6, 0.02, 2.2, '#5d8a4c', [0, 0.12, 0.6]);
  b.box(0.4, 0.024, 2.2, '#cfc6b2', [0, 0.124, 0.6]);
  b.box(2.6, 0.024, 0.3, '#cfc6b2', [0, 0.124, 0.6]);
  // prédio principal (fundo), dois andares, com colunata e frontão
  b.box(3.2, 1.5, 1.2, TRIM, [0, 0.85, -1.9]);
  b.box(3.3, 0.08, 1.3, '#cfc8b6', [0, 1.62, -1.9]);
  for (let i = 0; i < 6; i++) b.cyl(0.07, 0.08, 1.2, WHITE_STONE, [-1.0 + i * 0.4, 0.72, -1.22], undefined, 8);
  b.box(2.5, 0.1, 0.25, '#cfc8b6', [0, 1.37, -1.2]);
  b.gable(2.5, 0.4, 0.35, '#cfc8b6', [0, 1.43, -1.2]);
  for (const y of [0.55, 1.15]) for (let i = 0; i < 7; i++) g.box(0.2, 0.3, 0.02, '#ffffff', [-1.35 + i * 0.45, y, -1.29]);
  // cúpula com lanterna
  b.cyl(0.55, 0.6, 0.35, TRIM, [0, 1.85, -1.9], undefined, 12);
  b.sphere(0.55, '#5b7f8a', [0, 2.02, -1.9], [1, 0.75, 1], 12);
  b.cyl(0.1, 0.12, 0.3, TRIM, [0, 2.55, -1.9], undefined, 8);
  a.box(0.6, 0.12, 0.02, '#ffffff', [0, 1.5, -1.17]);
  // alas laterais em tijolo
  for (const s of [-1, 1]) {
    b.box(1.0, 1.1, 2.6, BRICK, [s * 2.15, 0.65, 0.3]);
    b.gable(1.1, 2.7, 0.4, C.roofRed, [s * 2.15, 1.2, 0.3], Math.PI / 2);
    for (const y of [0.45, 0.95]) for (let i = 0; i < 5; i++) g.box(0.02, 0.26, 0.22, '#ffffff', [s * 1.64, y, -0.6 + i * 0.45]);
  }
  // biblioteca e torre do relógio (frente)
  b.box(1.4, 0.8, 0.9, BRICK, [-0.9, 0.5, 2.15]);
  b.gable(1.5, 1.0, 0.3, C.roofRed, [-0.9, 0.9, 2.15]);
  b.box(0.5, 2.4, 0.5, BRICK, [1.2, 1.3, 2.2]);
  b.cyl(0.0, 0.42, 0.5, C.roofRed, [1.2, 2.75, 2.2], [0, Math.PI / 4, 0], 4);
  b.cyl(0.16, 0.16, 0.03, '#f4f2ea', [1.2, 2.1, 2.46], [Math.PI / 2, 0, 0], 12);
  a.box(0.52, 0.12, 0.52, '#ffffff', [1.2, 2.45, 2.2]);
  // árvores do campus
  for (const [x, z] of [
    [-1.0, 0.0],
    [1.0, 0.0],
    [-1.0, 1.25],
    [1.0, 1.25],
  ] as const) {
    b.cyl(0.04, 0.05, 0.3, '#6b5038', [x, 0.25, z], undefined, 6);
    b.sphere(0.25, '#4f7f3e', [x, 0.55, z], [1, 0.9, 1], 7);
  }
  railing(b, [-2.75, 2.75], [-1.8, 2.75], 0.1, 0.24, '#e0e0dc', 3);
  railing(b, [2.0, 2.75], [2.75, 2.75], 0.1, 0.24, '#e0e0dc', 2);
  return { base: l.build(), moving: null, height: 2.9 };
}


/**
 * Eucalipto low poly para cada célula plantada (como a lavoura da fazenda): três árvores por célula, tronco claro,
 * fino e alto, copa alta, rala e verde-acinzentada. Altura e posição variam pelo índice da célula.
 */
export function eucalyptusCell(b: PartBuilder, x: number, z: number, cs: number, cell: number): void {
  let s = (cell * 2654435761) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  b.box(cs * 0.94, 0.02, cs * 0.94, '#7a6247', [x, 0.01, z]);
  for (const [dx, dz] of [
    [-0.28, -0.25],
    [0.3, -0.05],
    [-0.05, 0.3],
  ] as const) {
    const h = 1.4 + rnd() * 0.8;
    const px = x + dx * cs + (rnd() - 0.5) * 0.15;
    const pz = z + dz * cs + (rnd() - 0.5) * 0.15;
    b.cyl(0.035, 0.05, h, BARK, [px, h / 2, pz], undefined, 4);
    // copa alta e rala, verde-acinzentada, no terço de cima do tronco (eucalipto, não pinheiro)
    b.sphere(0.2, rnd() > 0.5 ? LEAF : LEAF_DARK, [px, h * 0.86, pz], [1, 2.1, 1], 5);
    b.sphere(0.13, LEAF, [px + 0.08, h * 0.7, pz - 0.05], [1, 1.5, 1], 4);
  }
}

/** Floresta de Eucalipto (2×2): galpão da serraria com serra de fita, pilhas de toras e tábuas, viveiro de mudas. */
export function buildEucalyptusForest(): Built {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(3.7, 0.08, 3.7, '#7a6247', [0, 0.04, 0]);
  // galpão aberto com telhado de duas águas
  for (const x of [-1.3, 0, 1.3]) for (const z of [-1.4, -0.2]) b.box(0.1, 1.0, 0.1, C.woodDark, [x, 0.55, z]);
  b.gable(2.9, 1.5, 0.45, '#8a7a5a', [0, 1.05, -0.8]);
  a.box(2.9, 0.08, 0.04, '#ffffff', [0, 1.02, -0.04]);
  // serra de fita e mesa
  b.box(1.4, 0.35, 0.4, STEEL, [0, 0.3, -0.8]);
  b.box(0.12, 0.8, 0.3, DARK, [0, 0.75, -0.8]);
  b.cyl(0.18, 0.18, 0.05, '#c8ccd0', [0, 1.05, -0.8], [Math.PI / 2, 0, 0], 10);
  // toras de eucalipto e tábuas
  for (let i = 0; i < 4; i++) b.cyl(0.11, 0.11, 1.5, BARK, [-0.9 + (i % 2) * 0.22, 0.2 + Math.floor(i / 2) * 0.19, 1.0], [0, 0, Math.PI / 2], 6);
  for (let i = 0; i < 4; i++) b.box(1.0, 0.07, 0.5, '#d8b98a', [0.9, 0.12 + i * 0.08, 1.0]);
  // viveiro de mudas
  b.box(1.0, 0.05, 0.7, '#5a4632', [1.1, 0.1, 0.2]);
  for (let i = 0; i < 6; i++) b.cyl(0.0, 0.07, 0.22, LEAF, [0.75 + (i % 3) * 0.33, 0.24, 0.05 + Math.floor(i / 3) * 0.3], undefined, 4);
  return { base: l.build(), moving: null, height: 1.5 };
}

/** Forno de Carvão Vegetal (1×1): fornos de tijolo em cúpula (rabo-quente), chaminé e pilha de carvão. */
export function buildCharcoalKiln(): Built {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(1.85, 0.06, 1.85, '#3b3632', [0, 0.03, 0]);
  for (const [x, z] of [
    [-0.4, -0.35],
    [0.4, -0.35],
  ] as const) {
    b.sphere(0.42, BRICK, [x, 0.06, z], [1, 0.95, 1], 8);
    b.box(0.2, 0.22, 0.04, '#1c1a18', [x, 0.16, z + 0.4]);
  }
  b.cyl(0.08, 0.1, 1.1, BRICK, [0.0, 0.6, -0.75], undefined, 6);
  b.cyl(0.11, 0.11, 0.05, DARK, [0.0, 1.17, -0.75], undefined, 6);
  // carvão pronto e lenha
  b.cyl(0.0, 0.32, 0.3, '#1f1d1b', [-0.45, 0.2, 0.5], undefined, 6);
  for (let i = 0; i < 3; i++) b.cyl(0.06, 0.06, 0.6, BARK, [0.45, 0.1 + i * 0.1, 0.5], [0, 0, Math.PI / 2], 5);
  a.box(0.3, 0.2, 0.02, '#ffffff', [0.55, 0.45, 0.02]);
  b.box(0.03, 0.5, 0.03, DARK, [0.55, 0.27, 0.0]);
  return { base: l.build(), moving: null, height: 1.25, smoke: [[0, 1.2, -0.75]] };
}

/** Mina Subterrânea (2×2): castelo de extração (torre com polias), casa do guincho, ventilação e vagonetes. */
export function buildUndergroundMine(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.7, 0.1, 3.7, C.concreteDark, [0, 0.05, 0]);
  // boca do poço e castelo de extração em treliça
  b.box(1.0, 0.2, 1.0, '#4a4540', [-0.6, 0.18, -0.4]);
  const top = 2.6;
  for (const [x, z] of [
    [-1.0, -0.8],
    [-0.2, -0.8],
    [-1.0, 0.0],
    [-0.2, 0.0],
  ] as const)
    strut(b, [x, 0.2, z], [-0.6 + (x + 0.6) * 0.4, top, -0.4 + (z + 0.4) * 0.4], 0.04, '#b5452f');
  for (const y of [0.9, 1.7]) {
    const k = 1 - (y - 0.2) / (top - 0.2) * 0.6;
    b.box(0.8 * k + 0.05, 0.05, 0.05, '#b5452f', [-0.6, y, -0.4 - 0.4 * k]);
    b.box(0.8 * k + 0.05, 0.05, 0.05, '#b5452f', [-0.6, y, -0.4 + 0.4 * k]);
  }
  b.box(0.5, 0.12, 0.5, '#b5452f', [-0.6, top, -0.4]);
  for (const dz of [-0.12, 0.12]) b.cyl(0.2, 0.2, 0.05, STEEL, [-0.6, top + 0.15, -0.4 + dz], [Math.PI / 2, 0, 0], 12);
  // casa do guincho com cabo até as polias
  b.box(1.0, 0.8, 0.9, '#c9b89a', [0.95, 0.5, -0.4]);
  b.gable(1.1, 1.0, 0.3, '#5b6066', [0.95, 0.9, -0.4], Math.PI / 2);
  g.box(0.02, 0.2, 0.5, '#ffffff', [0.44, 0.6, -0.4]);
  a.box(0.6, 0.12, 0.02, '#ffffff', [0.95, 0.75, 0.06]);
  strut(b, [0.5, 0.75, -0.4], [-0.5, top + 0.15, -0.4], 0.012, DARK);
  // chaminé de ventilação
  b.cyl(0.14, 0.16, 1.2, STEEL, [1.3, 0.7, 1.0], undefined, 8);
  b.cyl(0.2, 0.2, 0.08, DARK, [1.3, 1.32, 1.0], undefined, 8);
  // trilho com vagonetes de minério e pilhas (pedra, ferro, carvão)
  b.box(0.06, 0.03, 2.2, DARK, [-0.75, 0.12, 0.9]);
  b.box(0.06, 0.03, 2.2, DARK, [-0.45, 0.12, 0.9]);
  for (const z of [0.6, 1.3]) {
    b.box(0.4, 0.22, 0.45, '#6b6f74', [-0.6, 0.27, z]);
    b.box(0.34, 0.06, 0.38, '#7b4630', [-0.6, 0.4, z]);
  }
  b.cyl(0.0, 0.35, 0.35, C.stone, [0.3, 0.27, 1.25], undefined, 6);
  b.cyl(0.0, 0.3, 0.3, '#7b4630', [0.85, 0.25, 1.4], undefined, 6);
  b.cyl(0.0, 0.28, 0.28, '#1f1d1b', [0.6, 0.24, 0.65], undefined, 6);
  railing(b, [-1.8, -1.8], [1.8, -1.8], 0.1, 0.24, '#a7adb2', 6);
  return { base: l.build(), moving: null, height: 2.8, smoke: [[1.3, 1.4, 1.0]] };
}
