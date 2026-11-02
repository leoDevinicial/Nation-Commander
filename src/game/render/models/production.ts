import * as THREE from 'three';
import { C, layers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel } from './buildingModels.ts';

/**
 * Conhecimento e produção sem limite (02/11): Universidade, Floresta de Eucalipto (centro de manejo com serraria; as
 * árvores ficam nas células plantadas, `eucalyptusCell`), Forno de Carvão Vegetal e Mina Subterrânea. Mesmo kit low
 * poly das outras construções; a camada `accent` recebe a cor da nação e a `glass`, as janelas (acesas à noite).
 * Redesenho de 02/11 com as referências do usuário para a universidade: tijolo laranja sobre térreo de pedra,
 * cornijas brancas, pórtico neoclássico com frontão, rotunda com cúpula e campus com praça, postes e jardins.
 */
type Built = Omit<BuildingModel, 'detail'>;

const STEEL = '#9aa1a8';
const DARK = '#3a3f45';
const BRICK = '#d2743f';
const BRICK_DARK = '#b5612f';
const STONE = '#cfc4b2';
const WHITE = '#f1ede4';
const TRIM = '#e4ddd0';
const PAVING = '#c7bfb1';
const LAWN = '#5f8f4a';
const HEDGE = '#3f6b37';
const BARK = '#c2ad90';
const LEAF = '#7f9c6c';
const COPPER = '#5f8f86';
const SOOT = '#24211f';

// ------------------------------------------------------------------ peças comuns

/** Janela com moldura branca, vidro e peitoril, numa fachada voltada para +z. */
function windowZ(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number, w = 0.24, h = 0.36): void {
  b.box(w + 0.07, h + 0.07, 0.03, WHITE, [x, y, z]);
  g.box(w, h, 0.02, '#ffffff', [x, y, z + 0.012]);
  b.box(w + 0.12, 0.035, 0.08, WHITE, [x, y - h / 2 - 0.05, z + 0.03]);
}

/** Janela numa fachada voltada para +x (ou -x com `flip`). */
function windowX(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number, w = 0.24, h = 0.36, flip = false): void {
  const s = flip ? -1 : 1;
  b.box(0.03, h + 0.07, w + 0.07, WHITE, [x, y, z]);
  g.box(0.02, h, w, '#ffffff', [x + s * 0.012, y, z]);
  b.box(0.08, 0.035, w + 0.12, WHITE, [x + s * 0.03, y - h / 2 - 0.05, z]);
}

/** Janela em arco (térreo): vidro retangular com o topo em meio disco, voltada para +z. */
function archWindowZ(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number, w = 0.26, h = 0.34): void {
  b.box(w + 0.07, h, 0.03, WHITE, [x, y, z]);
  b.cyl(w / 2 + 0.035, w / 2 + 0.035, 0.03, WHITE, [x, y + h / 2, z], [Math.PI / 2, 0, 0], 7);
  g.box(w, h - 0.04, 0.02, '#ffffff', [x, y, z + 0.012]);
  g.cyl(w / 2, w / 2, 0.02, '#ffffff', [x, y + h / 2, z + 0.012], [Math.PI / 2, 0, 0], 7);
}

/** Poste de praça com braço duplo e duas luminárias (vidro). */
function lampPost(b: PartBuilder, g: PartBuilder, x: number, z: number, h = 0.9): void {
  b.cyl(0.05, 0.06, 0.06, DARK, [x, 0.13, z], undefined, 6);
  b.cyl(0.018, 0.024, h, DARK, [x, 0.1 + h / 2, z], undefined, 6);
  b.box(0.3, 0.018, 0.018, DARK, [x, 0.1 + h - 0.06, z]);
  for (const dx of [-0.15, 0.15]) {
    b.cyl(0.035, 0.02, 0.03, DARK, [x + dx, 0.1 + h - 0.02, z], undefined, 6);
    g.sphere(0.045, '#ffffff', [x + dx, 0.1 + h - 0.07, z], undefined, 6);
  }
}

/** Árvore de copa redonda (duas massas de folhas). */
function roundTree(b: PartBuilder, x: number, z: number, r = 0.28, y0 = 0.1): void {
  b.cyl(0.035, 0.05, 0.35, '#6b5038', [x, y0 + 0.17, z], undefined, 5);
  b.sphere(r, '#4f7f3e', [x, y0 + 0.35 + r * 0.7, z], [1, 0.85, 1], 7);
  b.sphere(r * 0.7, '#5d8f47', [x + r * 0.35, y0 + 0.35 + r * 1.05, z - r * 0.2], [1, 0.85, 1], 6);
}

/** Cipreste (cone alto e estreito). */
function cypress(b: PartBuilder, x: number, z: number, h = 0.7, y0 = 0.1): void {
  b.cyl(0.0, 0.11, h, '#3d6a3a', [x, y0 + h / 2, z], undefined, 6);
}

/** Banco de praça (assento ao longo de x, ou de z com `alongZ`). */
function bench(b: PartBuilder, x: number, z: number, alongZ = false): void {
  const [w, d] = alongZ ? [0.1, 0.36] : [0.36, 0.1];
  b.box(w, 0.03, d, '#7a5a3c', [x, 0.2, z]);
  b.box(alongZ ? 0.03 : 0.36, 0.1, alongZ ? 0.36 : 0.03, '#7a5a3c', [x + (alongZ ? 0.05 : 0), 0.27, z + (alongZ ? 0 : -0.05)]);
  for (const s of [-1, 1]) b.box(alongZ ? 0.08 : 0.03, 0.1, alongZ ? 0.03 : 0.08, DARK, [x + (alongZ ? 0 : s * 0.15), 0.15, z + (alongZ ? s * 0.15 : 0)]);
}

// ------------------------------------------------------------------ Universidade (3×3)

/**
 * Universidade (3×3), a partir das referências do usuário:
 * - prédio principal de três andares: térreo de pedra com janelas em arco, dois andares de tijolo laranja com
 *   pilastras, cornija e platibanda brancas, casas de máquinas, claraboia e chaminés no telhado;
 * - pórtico neoclássico avançado com escadaria, quatro colunas, entablamento e frontão com o brasão da nação;
 * - rotunda (biblioteca) com colunata, janelas altas, tambor envidraçado, cúpula de cobre com anéis e lanterna;
 * - ala de aulas de dois andares com telhado de duas águas;
 * - campus: praça pavimentada, chafariz, gramados com sebes e canteiros, ciprestes, árvores, bancos, postes, grade com
 *   portão e mastro com a bandeira da nação.
 */
export function buildUniversity(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;

  // --- terreno: laje, praça pavimentada com juntas, gramados com sebes e canteiros
  b.box(5.85, 0.1, 5.85, C.concreteDark, [0, 0.05, 0]);
  b.box(5.7, 0.012, 5.7, PAVING, [0, 0.106, 0]);
  for (let i = -2; i <= 2; i++) {
    b.box(5.6, 0.004, 0.025, '#aaa294', [0, 0.114, i * 1.1]);
    b.box(0.025, 0.004, 5.6, '#aaa294', [i * 1.1, 0.114, 0]);
  }
  for (const s of [-1, 1]) {
    b.box(1.5, 0.03, 1.5, LAWN, [s * 1.35, 0.125, 1.95]);
    for (const [dx, dz, w, d] of [
      [0, -0.74, 1.5, 0.08],
      [0, 0.74, 1.5, 0.08],
      [-0.74, 0, 0.08, 1.5],
      [0.74, 0, 0.08, 1.5],
    ] as const)
      b.box(w, 0.1, d, HEDGE, [s * 1.35 + dx, 0.17, 1.95 + dz]);
    b.cyl(0.28, 0.3, 0.06, '#8a6f55', [s * 1.35, 0.16, 1.95], undefined, 10);
    b.sphere(0.2, '#c76b8a', [s * 1.35, 0.2, 1.95], [1, 0.45, 1], 7);
  }

  // --- prédio principal (fundo): três andares
  const zF = -0.85; // fachada da frente
  const zc = -1.75;
  const dep = 1.8;
  b.box(5.3, 0.62, dep, STONE, [0, 0.42, zc]); // térreo de pedra
  b.box(5.36, 0.06, dep + 0.06, WHITE, [0, 0.74, zc]);
  b.box(5.3, 1.5, dep, BRICK, [0, 1.52, zc]); // dois andares de tijolo
  b.box(5.36, 0.04, dep + 0.06, WHITE, [0, 1.52, zc]); // friso entre os andares
  b.box(5.44, 0.12, dep + 0.14, WHITE, [0, 2.31, zc]); // cornija
  b.box(5.3, 0.16, dep, TRIM, [0, 2.45, zc]); // platibanda
  b.box(5.1, 0.02, dep - 0.2, '#b9b3a6', [0, 2.535, zc]); // laje do telhado
  for (const x of [-2.62, -1.6, 1.6, 2.62]) b.box(0.12, 1.5, 0.06, BRICK_DARK, [x, 1.52, zF - 0.02]); // pilastras
  for (let i = 0; i < 10; i++) {
    const x = -2.4 + i * 0.533;
    if (Math.abs(x) < 0.95) continue;
    archWindowZ(b, g, x, 0.38, zF + 0.015, 0.22, 0.28);
    windowZ(b, g, x, 1.12, zF + 0.015);
    windowZ(b, g, x, 1.85, zF + 0.015);
  }
  for (const s of [-1, 1])
    for (const z of [-2.1, -1.4]) {
      windowX(b, g, s * 2.665, 1.12, z, 0.24, 0.36, s < 0);
      windowX(b, g, s * 2.665, 1.85, z, 0.24, 0.36, s < 0);
    }
  b.box(0.6, 0.25, 0.45, '#9c9a94', [-1.6, 2.67, -2.0]);
  b.box(0.45, 0.2, 0.4, '#9c9a94', [1.7, 2.65, -1.6]);
  g.box(0.9, 0.06, 0.5, '#ffffff', [0.0, 2.58, -2.05]); // claraboia
  for (const x of [-2.2, 2.25]) b.box(0.18, 0.35, 0.18, BRICK_DARK, [x, 2.72, -2.35]);

  // --- pórtico neoclássico avançado
  const pz = -0.55;
  b.box(1.9, 0.18, 0.75, STONE, [0, 0.19, pz]); // pódio
  for (let i = 0; i < 4; i++) b.box(1.9 - i * 0.04, 0.06, 0.16, STONE, [0, 0.13 + i * 0.06, pz + 0.48 - i * 0.07]); // escadaria
  for (const x of [-0.66, -0.22, 0.22, 0.66]) {
    b.box(0.17, 0.05, 0.17, WHITE, [x, 0.3, pz + 0.18]);
    b.cyl(0.065, 0.075, 1.55, WHITE, [x, 1.1, pz + 0.18], undefined, 8);
    b.box(0.18, 0.06, 0.18, WHITE, [x, 1.9, pz + 0.18]);
  }
  b.box(1.86, 0.18, 0.72, WHITE, [0, 2.02, pz]); // entablamento
  b.box(1.9, 0.04, 0.74, TRIM, [0, 2.13, pz]);
  b.side(
    [
      [-0.98, 0],
      [0.98, 0],
      [0, 0.48],
    ],
    0.74,
    WHITE,
    [0, 2.15, pz],
  ); // frontão
  a.cyl(0.12, 0.12, 0.02, '#ffffff', [0, 2.3, pz + 0.375], [Math.PI / 2, 0, 0], 12); // brasão no tímpano
  a.box(1.2, 0.08, 0.02, '#ffffff', [0, 1.98, pz + 0.37]); // faixa na cor da nação
  for (const x of [-0.44, 0, 0.44]) {
    b.box(0.26, 0.5, 0.02, '#4a3627', [x, 0.56, zF + 0.012]);
    b.cyl(0.13, 0.13, 0.02, '#4a3627', [x, 0.81, zF + 0.012], [Math.PI / 2, 0, 0], 8);
    g.box(0.22, 0.12, 0.02, '#ffffff', [x, 1.0, zF + 0.012]);
  }

  // --- rotunda (biblioteca) com colunata e cúpula de cobre, à esquerda
  const [rx, rz] = [-1.75, 0.55];
  b.cyl(0.88, 0.92, 0.14, STONE, [rx, 0.17, rz], undefined, 12);
  b.cyl(0.66, 0.66, 1.05, STONE, [rx, 0.76, rz], undefined, 12);
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    b.cyl(0.04, 0.045, 1.0, WHITE, [rx + Math.cos(t) * 0.8, 0.74, rz + Math.sin(t) * 0.8], undefined, 6);
    if (i % 2 === 0) g.box(0.16, 0.5, 0.02, '#ffffff', [rx + Math.cos(t + 0.26) * 0.665, 0.8, rz + Math.sin(t + 0.26) * 0.665], [0, Math.PI / 2 - (t + 0.26), 0]);
  }
  b.cyl(0.9, 0.9, 0.12, WHITE, [rx, 1.3, rz], undefined, 12);
  b.cyl(0.6, 0.62, 0.32, TRIM, [rx, 1.52, rz], undefined, 12);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    g.box(0.1, 0.16, 0.02, '#ffffff', [rx + Math.cos(t) * 0.61, 1.53, rz + Math.sin(t) * 0.61], [0, Math.PI / 2 - t, 0]);
  }
  b.sphere(0.6, COPPER, [rx, 1.66, rz], [1, 0.85, 1], 12);
  // anéis de cobre mais escuro marcando os gomos da cúpula
  b.cyl(0.59, 0.61, 0.03, '#4d766f', [rx, 1.75, rz], undefined, 12);
  b.cyl(0.43, 0.47, 0.03, '#4d766f', [rx, 1.98, rz], undefined, 12);
  b.cyl(0.11, 0.13, 0.22, WHITE, [rx, 2.25, rz], undefined, 8);
  b.cyl(0.0, 0.14, 0.18, COPPER, [rx, 2.45, rz], undefined, 8);
  a.sphere(0.04, '#ffffff', [rx, 2.56, rz], undefined, 6);

  // --- ala de aulas à direita (dois andares, telhado de duas águas)
  const [wx, wz] = [1.75, 0.45];
  b.box(1.5, 0.45, 1.5, STONE, [wx, 0.33, wz]);
  b.box(1.5, 0.75, 1.5, BRICK, [wx, 0.93, wz]);
  b.box(1.56, 0.05, 1.56, WHITE, [wx, 0.56, wz]);
  b.box(1.6, 0.07, 1.6, WHITE, [wx, 1.32, wz]);
  b.gable(1.62, 1.62, 0.45, C.roofRed, [wx, 1.35, wz]);
  for (const x of [wx - 0.45, wx, wx + 0.45]) {
    archWindowZ(b, g, x, 0.32, wz + 0.765, 0.2, 0.24);
    windowZ(b, g, x, 0.95, wz + 0.765, 0.22, 0.32);
  }
  for (const z of [wz - 0.4, wz + 0.4]) windowX(b, g, wx - 0.765, 0.95, z, 0.22, 0.32, true);
  b.box(0.5, 0.04, 0.3, WHITE, [wx - 0.85, 0.62, wz]);
  b.box(0.02, 0.4, 0.22, '#4a3627', [wx - 0.762, 0.32, wz]);

  // --- chafariz no eixo do pórtico
  b.cyl(0.42, 0.45, 0.12, STONE, [0, 0.17, 1.1], undefined, 14);
  b.cyl(0.36, 0.36, 0.02, '#7fb2c9', [0, 0.225, 1.1], undefined, 14);
  b.cyl(0.07, 0.09, 0.3, STONE, [0, 0.33, 1.1], undefined, 8);
  b.cyl(0.16, 0.12, 0.05, STONE, [0, 0.49, 1.1], undefined, 10);
  b.sphere(0.06, '#a9d3e6', [0, 0.56, 1.1], [1, 1.6, 1], 6);

  // --- postes, árvores, ciprestes e bancos
  for (const [x, z] of [
    [-0.55, 0.35],
    [0.55, 0.35],
    [-0.55, 2.55],
    [0.55, 2.55],
  ] as const)
    lampPost(b, g, x, z);
  for (const [x, z] of [
    [-2.6, 2.7],
    [2.6, 2.7],
    [-0.65, 1.7],
    [0.65, 1.7],
  ] as const)
    roundTree(b, x, z);
  for (const [x, z] of [
    [-2.75, 1.3],
    [2.75, 1.4],
    [-1.05, -0.1],
    [1.0, -0.15],
    [-2.75, -1.6],
    [2.75, -1.6],
  ] as const)
    cypress(b, x, z);
  bench(b, -0.45, 1.55, true);
  bench(b, 0.45, 1.55, true);
  bench(b, -1.35, 1.1);
  bench(b, 1.35, 1.1);

  // --- grade com portão e mastro com a bandeira da nação
  b.cyl(0.02, 0.03, 2.0, STEEL, [0.95, 1.1, 2.7], undefined, 6);
  a.box(0.5, 0.3, 0.02, '#ffffff', [1.2, 1.9, 2.7]);
  railing(b, [-2.85, 2.88], [-0.4, 2.88], 0.1, 0.22, DARK, 6);
  railing(b, [0.4, 2.88], [2.85, 2.88], 0.1, 0.22, DARK, 6);
  for (const s of [-1, 1]) b.box(0.14, 0.42, 0.14, STONE, [s * 0.42, 0.3, 2.88]);
  return { base: l.build(), moving: null, height: 2.75 };
}

// ------------------------------------------------------------------ Floresta de Eucalipto

/** Tufo de folhas: icosaedro achatado (20 faces facetadas), barato e com silhueta irregular. */
const TUFT = new THREE.IcosahedronGeometry(1, 0);
/** Verdes do eucalipto: folhagem verde-acinzentada, alguns tufos puxando para o azulado. */
const EUCA_LEAVES = ['#7f9c6c', '#6f8f62', '#8aa67a', '#7a9a88', '#66855a'];

/**
 * Um eucalipto low poly: tronco reto e alto em duas partes (casca rugosa e escura na base, lisa e clara em cima, com
 * tiras soltando), dois galhos subindo em leque e a copa alta e aberta em vários tufos achatados de verdes
 * diferentes, concentrada no terço de cima. `age` (0..1) muda a altura e quantos tufos a árvore tem.
 */
function eucalyptus(b: PartBuilder, px: number, pz: number, age: number, rnd: () => number): void {
  const h = 0.9 + age * 1.5 + rnd() * 0.3;
  const r = 0.03 + age * 0.03;
  // inclinação leve: o topo sai um pouco do eixo
  const lx = (rnd() - 0.5) * 0.12 * h;
  const lz = (rnd() - 0.5) * 0.12 * h;
  const low = h * 0.26;
  b.cyl(r * 0.95, r * 1.25, low, '#8f7a5e', [px, low / 2, pz], undefined, 5);
  strut(b, [px, low, pz], [px + lx, h, pz + lz], r * 0.8, '#e2d5bd', true);
  // tira de casca soltando no meio do tronco
  b.box(r * 0.25, h * 0.1, r * 1.1, '#b49a77', [px + lx * 0.3 + r * 0.45, low + h * 0.05, pz + lz * 0.3]);
  const top: [number, number, number] = [px + lx, h, pz + lz];
  const tufts = age < 0.35 ? 2 : 4;
  // galhos: saem do tronco a 60–75% da altura, em direções opostas
  const a0 = rnd() * Math.PI * 2;
  const ends: [number, number, number][] = [];
  for (let k = 0; k < (age < 0.35 ? 1 : 2); k++) {
    const ang = a0 + k * Math.PI + (rnd() - 0.5) * 0.6;
    const y0 = h * (0.6 + rnd() * 0.15);
    const t = y0 / h;
    const from: [number, number, number] = [px + lx * t, y0, pz + lz * t];
    const reach = 0.1 + age * 0.08;
    const end: [number, number, number] = [from[0] + Math.cos(ang) * reach, y0 + 0.2 + age * 0.12, from[2] + Math.sin(ang) * reach];
    strut(b, from, end, r * 0.45, '#d6c7ab');
    ends.push(end);
  }
  // copa: um tufo no topo, os dos galhos e outros soltos em volta do terço de cima
  const spots: [number, number, number][] = [[top[0], top[1] + 0.02, top[2]], ...ends];
  while (spots.length < tufts + 1) {
    const ang = rnd() * Math.PI * 2;
    const y = h * (0.78 + rnd() * 0.16);
    const t = y / h;
    spots.push([px + lx * t + Math.cos(ang) * 0.07, y, pz + lz * t + Math.sin(ang) * 0.07]);
  }
  for (const [x, y, z] of spots) {
    // tufos estreitos e mais altos que largos (a copa do eucalipto é alta e rala, não redonda)
    const size = (0.075 + age * 0.06) * (0.8 + rnd() * 0.4);
    b.add(TUFT, EUCA_LEAVES[Math.floor(rnd() * EUCA_LEAVES.length)]!, {
      pos: [x, y, z],
      scale: [size * (0.9 + rnd() * 0.3), size * (1.5 + rnd() * 0.5), size * (0.9 + rnd() * 0.3)],
      rot: [rnd() * 0.6, rnd() * Math.PI, rnd() * 0.6],
    });
  }
}

/**
 * Eucaliptal para cada célula plantada (como a lavoura da fazenda): três árvores em linha por célula, de idades
 * diferentes (o corte é rotativo), solo com camalhões de palhada e folhas caídas; às vezes uma muda nova ao lado do
 * toco de uma árvore cortada. Tudo varia pelo índice da célula (sempre igual para a mesma célula).
 */
export function eucalyptusCell(b: PartBuilder, x: number, z: number, cs: number, cell: number): void {
  let s = (cell * 2654435761) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  b.box(cs * 0.94, 0.02, cs * 0.94, '#7a6247', [x, 0.01, z]);
  b.box(cs * 0.9, 0.012, 0.12, '#8d7a55', [x, 0.025, z - cs * 0.25]);
  b.box(cs * 0.9, 0.012, 0.12, '#8d7a55', [x, 0.025, z + cs * 0.25]);
  // folhas e cascas caídas
  for (let k = 0; k < 1; k++) b.box(0.12, 0.008, 0.06, k % 2 ? '#a08c62' : '#9c7f5a', [x + (rnd() - 0.5) * cs * 0.8, 0.024, z + (rnd() - 0.5) * cs * 0.8], [0, rnd() * Math.PI, 0]);
  // a idade da célula: árvores da mesma célula têm idades parecidas (talhões plantados juntos)
  const stand = rnd();
  for (const [dx, dz] of [
    [-0.28, -0.25],
    [0.3, -0.05],
    [-0.05, 0.3],
  ] as const) {
    const px = x + dx * cs + (rnd() - 0.5) * 0.15;
    const pz = z + dz * cs + (rnd() - 0.5) * 0.15;
    if (rnd() < 0.1) {
      // muda recém-plantada ao lado do toco da árvore cortada
      b.cyl(0.05, 0.06, 0.06, '#c9b38f', [px + 0.12, 0.04, pz], undefined, 6);
      b.cyl(0.05, 0.05, 0.005, '#e2cfa8', [px + 0.12, 0.072, pz], undefined, 6);
      b.cyl(0.008, 0.01, 0.22, '#7a6a4a', [px, 0.13, pz], undefined, 4);
      b.add(TUFT, EUCA_LEAVES[0]!, { pos: [px, 0.26, pz], scale: [0.07, 0.06, 0.07] });
      continue;
    }
    eucalyptus(b, px, pz, Math.min(1, Math.max(0.15, stand * 0.7 + rnd() * 0.45)), rnd);
  }
}

/** Pilha de toras deitadas ao longo de x, com as pontas claras do corte. */
function logPile(b: PartBuilder, x: number, z: number, rows: number, len = 1.2, r = 0.09): void {
  for (let row = 0; row < rows; row++)
    for (let i = 0; i < rows - row + 1; i++) {
      const pz = z - (rows - row) * r + i * r * 2 + row * r;
      const py = 0.1 + r + row * r * 1.7;
      b.cyl(r, r, len, BARK, [x, py, pz], [0, 0, Math.PI / 2], 6);
      b.cyl(r * 0.85, r * 0.85, 0.01, '#e2cfa8', [x + len / 2 + 0.003, py, pz], [0, 0, Math.PI / 2], 6);
    }
}

/**
 * Floresta de Eucalipto (2×2): centro de manejo com serraria embutida:
 * - galpão de estrutura metálica e telha ondulada, com serra de fita, mesa de rolos e esteira de saída;
 * - pátio de toras (pilhas com as pontas claras) e carregadeira florestal com garra;
 * - tábuas empilhadas em tabiques, viveiro de mudas sob estufa de vidro, escritório e bandeira da nação.
 */
export function buildEucalyptusForest(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.75, 0.08, 3.75, '#7d6a4f', [0, 0.04, 0]);
  b.box(3.6, 0.01, 1.2, '#958268', [0, 0.085, 0.95]); // pátio de terra batida

  // --- galpão da serraria (fundo)
  const [gx, gz] = [-0.2, -0.95];
  for (const x of [-1.5, -0.5, 0.5, 1.1]) for (const z of [gz - 0.65, gz + 0.65]) b.box(0.07, 1.05, 0.07, '#6d7379', [gx + x, 0.6, z]);
  b.box(2.75, 0.06, 0.07, '#6d7379', [gx - 0.2, 1.1, gz - 0.65]);
  b.box(2.75, 0.06, 0.07, '#6d7379', [gx - 0.2, 1.1, gz + 0.65]);
  b.gable(2.9, 1.5, 0.42, '#9aa3a8', [gx - 0.2, 1.12, gz]);
  for (let i = 0; i < 9; i++) b.box(0.02, 0.012, 1.52, '#7f878d', [gx - 1.55 + i * 0.33, 1.34, gz]);
  b.box(2.6, 0.7, 0.04, '#8a6a45', [gx - 0.2, 0.45, gz - 0.62]); // parede de tábuas no fundo
  a.box(2.0, 0.1, 0.02, '#ffffff', [gx - 0.2, 1.02, gz + 0.68]); // faixa na cor da nação
  b.box(0.3, 1.0, 0.25, '#4b6f8f', [gx + 0.1, 0.6, gz]); // serra de fita
  b.cyl(0.2, 0.2, 0.05, STEEL, [gx + 0.1, 0.95, gz + 0.14], [Math.PI / 2, 0, 0], 12);
  b.cyl(0.2, 0.2, 0.05, STEEL, [gx + 0.1, 0.35, gz + 0.14], [Math.PI / 2, 0, 0], 12);
  b.box(1.9, 0.08, 0.36, '#5c6166', [gx - 0.6, 0.36, gz]); // mesa de rolos
  for (let i = 0; i < 8; i++) b.cyl(0.03, 0.03, 0.34, '#9aa1a8', [gx - 1.45 + i * 0.24, 0.42, gz], [Math.PI / 2, 0, 0], 6);
  b.cyl(0.08, 0.08, 1.2, BARK, [gx - 0.75, 0.52, gz], [0, 0, Math.PI / 2], 6);
  b.box(0.9, 0.06, 0.3, DARK, [gx + 0.7, 0.32, gz + 0.1]); // esteira de saída
  for (let i = 0; i < 3; i++) b.box(0.5, 0.04, 0.22, '#e2c58f', [gx + 0.75, 0.37 + i * 0.045, gz + 0.1]);

  // --- pátio de toras e carregadeira florestal
  logPile(b, -0.95, 0.85, 3);
  logPile(b, -0.95, 1.55, 2, 1.1);
  const [lx, lz] = [0.55, 0.95];
  b.box(0.7, 0.18, 0.36, C.yellow, [lx, 0.26, lz]);
  b.box(0.28, 0.3, 0.32, C.yellow, [lx - 0.2, 0.5, lz]);
  g.box(0.02, 0.18, 0.26, '#ffffff', [lx - 0.06, 0.53, lz]);
  for (const x of [lx - 0.22, lx + 0.22]) for (const s of [-1, 1]) b.cyl(0.11, 0.11, 0.08, C.rubber, [x, 0.17, lz + s * 0.2], [Math.PI / 2, 0, 0], 10);
  strut(b, [lx + 0.05, 0.45, lz], [lx + 0.45, 0.85, lz], 0.05, C.yellow);
  strut(b, [lx + 0.45, 0.85, lz], [lx + 0.75, 0.45, lz], 0.04, C.yellow);
  b.box(0.08, 0.16, 0.26, DARK, [lx + 0.78, 0.36, lz]); // garra
  b.cyl(0.07, 0.07, 0.6, BARK, [lx + 0.8, 0.3, lz], [Math.PI / 2, 0, 0], 6);

  // --- tábuas em tabiques
  for (const [x, z] of [
    [1.45, 0.35],
    [1.45, 1.25],
  ] as const)
    for (let i = 0; i < 5; i++) {
      b.box(0.6, 0.055, 0.6, '#dcbc88', [x, 0.12 + i * 0.075, z]);
      if (i < 4) for (const dz of [-0.24, 0, 0.24]) b.box(0.62, 0.02, 0.04, '#9a7a52', [x, 0.16 + i * 0.075, z + dz]);
    }

  // --- viveiro de mudas sob estufa, escritório e bandeira
  const [vx, vz] = [1.35, -1.25];
  b.box(0.9, 0.06, 0.8, '#5a4632', [vx, 0.11, vz]);
  for (let i = 0; i < 12; i++) b.cyl(0.0, 0.06, 0.18, LEAF, [vx - 0.33 + (i % 4) * 0.22, 0.23, vz - 0.25 + Math.floor(i / 4) * 0.25], undefined, 4);
  g.side(
    [
      [-0.4, 0],
      [0.4, 0],
      [0.4, 0.3],
      [0, 0.48],
      [-0.4, 0.3],
    ],
    0.85,
    '#ffffff',
    [vx, 0.12, vz],
    [0, Math.PI / 2, 0],
  );
  b.box(0.55, 0.42, 0.45, '#e5dccb', [-1.45, 0.29, -1.55]);
  b.box(0.6, 0.04, 0.5, '#7c3c30', [-1.45, 0.52, -1.55]);
  g.box(0.25, 0.15, 0.02, '#ffffff', [-1.45, 0.33, -1.32]);
  b.cyl(0.02, 0.025, 1.4, STEEL, [-1.65, 0.75, 1.75], undefined, 6);
  a.box(0.4, 0.24, 0.02, '#ffffff', [-1.43, 1.32, 1.75]);
  return { base: l.build(), moving: null, height: 1.45 };
}

// ------------------------------------------------------------------ Forno de Carvão Vegetal (1×1)

/**
 * Forno de Carvão Vegetal (1×1): bateria de três fornos "rabo-quente" de tijolo em cúpula, com cinta de ferro, respiro
 * e a boca brilhando (vidro aceso à noite); chaminé, placa da nação, lenha de eucalipto empilhada,
 * sacos de carvão, monte de carvão e carrinho de mão.
 */
export function buildCharcoalKiln(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.9, 0.06, 1.9, '#4a433d', [0, 0.03, 0]);
  b.box(1.8, 0.01, 1.8, '#2e2a27', [0, 0.065, 0]); // chão escurecido de fuligem
  for (const [x, z] of [
    [-0.55, -0.45],
    [0.0, -0.5],
    [0.55, -0.45],
  ] as const) {
    b.sphere(0.32, BRICK, [x, 0.07, z], [1, 1.2, 1], 9);
    b.cyl(0.33, 0.34, 0.03, '#5a4a40', [x, 0.2, z], undefined, 10);
    b.cyl(0.05, 0.06, 0.06, BRICK_DARK, [x, 0.46, z], undefined, 6);
    b.box(0.2, 0.2, 0.06, '#5c4a3c', [x, 0.16, z + 0.3]);
    g.box(0.14, 0.12, 0.02, '#ffffff', [x, 0.15, z + 0.335]);
    for (let k = 0; k < 4; k++) b.box(0.03, 0.012, 0.03, '#7c3c2a', [x - 0.15 + k * 0.1, 0.075, z + 0.4]);
  }
  b.cyl(0.07, 0.09, 1.0, BRICK_DARK, [0.0, 0.55, -0.85], undefined, 6);
  b.cyl(0.1, 0.1, 0.05, DARK, [0.0, 1.07, -0.85], undefined, 6);
  // placa na cor da nação numa estaca
  b.box(0.04, 0.55, 0.04, C.woodDark, [0.82, 0.33, 0.05]);
  a.box(0.32, 0.2, 0.02, '#ffffff', [0.82, 0.55, 0.07]);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) b.cyl(0.05, 0.05, 0.62, BARK, [-0.5, 0.11 + row * 0.085, 0.45 + i * 0.1 + row * 0.05], [0, 0, Math.PI / 2], 5);
  for (const [x, z] of [
    [0.35, 0.55],
    [0.55, 0.55],
    [0.45, 0.75],
    [0.65, 0.75],
  ] as const)
    b.box(0.17, 0.2, 0.13, '#efe7d4', [x, 0.16, z]);
  b.cyl(0.0, 0.22, 0.2, SOOT, [0.2, 0.17, 0.25], undefined, 6);
  b.box(0.2, 0.08, 0.13, '#5f666d', [0.75, 0.16, 0.25]);
  b.cyl(0.04, 0.04, 0.02, C.rubber, [0.86, 0.1, 0.25], [Math.PI / 2, 0, 0], 8);
  return { base: l.build(), moving: null, height: 1.1, smoke: [[0, 1.12, -0.85]] };
}

// ------------------------------------------------------------------ Mina Subterrânea (2×2)

/**
 * Mina Subterrânea (2×2):
 * - castelo de extração em treliça vermelha, com travessas, diagonais, escoras inclinadas e duas polias raiadas no topo;
 * - casa do guincho com telhado, janelas e os cabos subindo às polias; boca do poço com a gaiola;
 * - correia transportadora até dois silos de minério, pilhas de pedra, ferro e carvão, vagonetes no trilho;
 * - poço de ventilação com exaustor, escritório, holofotes, grade e a faixa da nação.
 */
export function buildUndergroundMine(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const RED = '#b5452f';
  b.box(3.75, 0.1, 3.75, C.concreteDark, [0, 0.05, 0]);
  b.box(3.6, 0.01, 3.6, '#6f6a62', [0, 0.105, 0]);

  // --- boca do poço e gaiola
  const [px, pz] = [-0.85, -0.6];
  b.box(1.0, 0.22, 1.0, '#55504a', [px, 0.21, pz]);
  b.box(0.5, 0.02, 0.5, '#151515', [px, 0.325, pz]);
  b.box(0.36, 0.42, 0.36, STEEL, [px, 0.55, pz]);
  for (const s of [-1, 1]) b.box(0.02, 0.4, 0.38, DARK, [px + s * 0.18, 0.55, pz]);

  // --- castelo de extração
  const top = 2.75;
  for (const [dx, dz] of [
    [-0.42, -0.4],
    [0.42, -0.4],
    [-0.42, 0.4],
    [0.42, 0.4],
  ] as const)
    strut(b, [px + dx, 0.32, pz + dz], [px + dx * 0.45, top, pz + dz * 0.45], 0.045, RED);
  for (const y of [0.85, 1.4, 1.95, 2.45]) {
    const k = 1 - ((y - 0.32) / (top - 0.32)) * 0.55;
    for (const s of [-1, 1]) {
      b.box(0.84 * k + 0.04, 0.035, 0.035, RED, [px, y, pz + s * 0.4 * k]);
      b.box(0.035, 0.035, 0.8 * k + 0.04, RED, [px + s * 0.42 * k, y, pz]);
    }
  }
  for (const s of [-1, 1]) strut(b, [px + s * 0.42, 0.32, pz + 0.4], [px - s * 0.3, 1.4, pz + 0.3], 0.02, RED);
  strut(b, [px + 0.95, 0.32, pz - 0.3], [px + 0.2, top - 0.2, pz - 0.15], 0.05, RED);
  strut(b, [px + 0.95, 0.32, pz + 0.3], [px + 0.2, top - 0.2, pz + 0.15], 0.05, RED);
  b.box(0.55, 0.1, 0.55, RED, [px, top, pz]);
  railing(b, [px - 0.27, pz - 0.27], [px + 0.27, pz - 0.27], top + 0.05, 0.12, DARK, 3);
  for (const dz of [-0.12, 0.12]) {
    b.cyl(0.26, 0.26, 0.04, STEEL, [px, top + 0.3, pz + dz], [Math.PI / 2, 0, 0], 16);
    b.cyl(0.05, 0.05, 0.06, DARK, [px, top + 0.3, pz + dz], [Math.PI / 2, 0, 0], 8);
    for (let k = 0; k < 4; k++) b.box(0.48, 0.02, 0.02, '#7d848b', [px, top + 0.3, pz + dz], [0, 0, (k * Math.PI) / 4]);
  }
  b.box(0.04, 0.3, 0.3, DARK, [px, top + 0.15, pz]);

  // --- casa do guincho com cabos
  const [hx, hz] = [0.75, -0.6];
  b.box(1.05, 0.85, 1.0, '#c9b89a', [hx, 0.53, hz]);
  b.box(1.1, 0.05, 1.05, '#a99a80', [hx, 0.96, hz]);
  b.gable(1.15, 1.1, 0.32, '#5b6066', [hx, 0.98, hz], Math.PI / 2);
  for (const z of [hz - 0.25, hz + 0.25]) windowX(b, g, hx - 0.53, 0.6, z, 0.22, 0.28, true);
  for (const x of [hx - 0.25, hx + 0.25]) windowZ(b, g, x, 0.6, hz + 0.51, 0.22, 0.28);
  b.box(0.3, 0.45, 0.02, '#4a3627', [hx + 0.3, 0.33, hz + 0.505]);
  a.box(0.8, 0.12, 0.02, '#ffffff', [hx, 0.86, hz + 0.515]);
  for (const dz of [-0.12, 0.12]) strut(b, [hx - 0.53, 0.8, hz + dz * 0.5], [px + 0.02, top + 0.5, pz + dz], 0.008, DARK);

  // --- correia transportadora até os silos e pilhas de minério
  strut(b, [px + 0.3, 0.45, pz + 0.55], [0.95, 1.25, 0.75], 0.07, '#5f666d');
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const h = 0.45 + t * 0.75;
    b.box(0.04, h, 0.04, DARK, [px + 0.3 + (0.95 - px - 0.3) * t, 0.12 + h / 2, pz + 0.55 + (0.75 - pz - 0.55) * t]);
  }
  for (const x of [0.75, 1.25]) {
    b.cyl(0.23, 0.23, 0.7, STEEL, [x, 1.0, 0.75], undefined, 12);
    b.cyl(0.0, 0.23, 0.2, STEEL, [x, 0.55, 0.75], [Math.PI, 0, 0], 12);
    for (const [dx, dz] of [
      [-0.16, -0.16],
      [0.16, -0.16],
      [-0.16, 0.16],
      [0.16, 0.16],
    ] as const)
      b.box(0.035, 0.55, 0.035, DARK, [x + dx, 0.38, 0.75 + dz]);
    b.cyl(0.24, 0.24, 0.04, DARK, [x, 1.36, 0.75], undefined, 12);
  }
  for (const [x, z, c, r] of [
    [-0.15, 1.45, C.stone, 0.42],
    [0.6, 1.5, '#7b4630', 0.34],
    [1.35, 1.5, SOOT, 0.32],
  ] as const) {
    b.cyl(0.0, r, r * 0.8, c, [x, 0.1 + r * 0.4, z], undefined, 7);
    b.cyl(0.0, r * 0.55, r * 0.5, c, [x + r * 0.35, 0.1 + r * 0.25, z - r * 0.25], undefined, 6);
  }
  b.box(0.04, 0.025, 2.2, DARK, [-1.48, 0.12, 0.65]);
  b.box(0.04, 0.025, 2.2, DARK, [-1.2, 0.12, 0.65]);
  for (let i = 0; i < 8; i++) b.box(0.42, 0.02, 0.06, '#5e4630', [-1.34, 0.11, -0.35 + i * 0.28]);
  for (const z of [0.35, 0.95, 1.55]) {
    b.box(0.38, 0.2, 0.42, '#6b6f74', [-1.34, 0.27, z]);
    b.box(0.32, 0.06, 0.36, z > 1.2 ? SOOT : '#7b4630', [-1.34, 0.39, z]);
    for (const s of [-1, 1]) b.cyl(0.05, 0.05, 0.04, DARK, [-1.34 + s * 0.15, 0.15, z], [0, 0, Math.PI / 2], 8);
  }

  // --- ventilação, escritório e holofotes
  const [vx, vz] = [1.45, -1.45];
  b.box(0.5, 0.35, 0.5, STEEL, [vx, 0.28, vz]);
  b.cyl(0.13, 0.15, 1.3, STEEL, [vx, 1.05, vz], undefined, 10);
  b.cyl(0.2, 0.2, 0.08, DARK, [vx, 1.72, vz], undefined, 10);
  b.cyl(0.18, 0.18, 0.05, '#5f666d', [vx - 0.26, 0.3, vz], [0, 0, Math.PI / 2], 12);
  b.box(0.75, 0.4, 0.5, '#e5dccb', [-1.35, 0.3, -1.5]);
  b.box(0.8, 0.04, 0.55, '#7c3c30', [-1.35, 0.52, -1.5]);
  g.box(0.3, 0.16, 0.02, '#ffffff', [-1.35, 0.34, -1.245]);
  for (const [x, z] of [
    [1.75, 0.0],
    [-1.75, -0.6],
  ] as const) {
    b.cyl(0.02, 0.025, 1.2, DARK, [x, 0.7, z], undefined, 6);
    g.box(0.12, 0.08, 0.1, '#ffffff', [x, 1.3, z]);
  }
  railing(b, [-1.85, -1.85], [1.85, -1.85], 0.1, 0.22, '#a7adb2', 7);
  return { base: l.build(), moving: null, height: 3.05, smoke: [[vx, 1.78, vz]] };
}
