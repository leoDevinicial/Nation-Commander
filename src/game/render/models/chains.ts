import * as THREE from 'three';
import { C, layers } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel } from './buildingModels.ts';

/**
 * Cadeias produtivas e serviços com cobertura (lote 1, §4): Refinaria, Siderúrgica, Hospital,
 * Escola e Delegacia. Modelos procedurais no mesmo kit das demais construções (a camada `accent`
 * recebe a cor da facção).
 */
type Built = Omit<BuildingModel, 'detail'>;

const STEEL = '#9aa1a8';
const DARK = '#3a3f45';
const RUST = '#8a5a3c';
const WHITE = '#e8eae8';
const BRICK = '#9c5a44';

/**
 * Refinaria (2×2), em low poly:
 * - duas colunas de destilação de alturas diferentes, com plataformas, escadas, bandas de isolamento e topo;
 * - forno com chaminés, trocadores de calor e rack de tubulação elevado atravessando a planta (tubos de várias cores);
 * - esfera de GLP em pernas e tanque de teto flutuante com a faixa da nação;
 * - tocha (flare) alta em treliça, casa de controle e cerca.
 */
export function buildRefinery(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const PIPE_Y = '#c9a43a';
  b.box(3.7, 0.12, 3.7, C.concreteDark, [0, 0.06, 0]);
  b.box(3.5, 0.012, 3.5, '#8e8a80', [0, 0.126, 0]);
  railing(b, [-1.8, -1.8], [1.8, -1.8], 0.12, 0.24, '#a7adb2', 6);
  railing(b, [-1.8, -1.8], [-1.8, 1.8], 0.12, 0.24, '#a7adb2', 6);
  railing(b, [1.8, -1.8], [1.8, 1.8], 0.12, 0.24, '#a7adb2', 6);
  railing(b, [-1.8, 1.8], [-0.2, 1.8], 0.12, 0.24, '#a7adb2', 3);

  // --- colunas de destilação
  const column = (x: number, z: number, r: number, h: number, rings: number[]) => {
    b.cyl(r + 0.08, r + 0.1, 0.18, C.concrete, [x, 0.21, z], undefined, 12);
    b.cyl(r, r, h, STEEL, [x, 0.3 + h / 2, z], undefined, 12);
    b.sphere(r, STEEL, [x, 0.3 + h, z], [1, 0.45, 1], 12);
    for (const y of rings) {
      b.cyl(r + 0.16, r + 0.16, 0.04, DARK, [x, y, z], undefined, 12);
      b.add(new THREE.CylinderGeometry(r + 0.16, r + 0.16, 0.12, 12, 1, true), '#c2c7cc', { pos: [x, y + 0.08, z] });
    }
    for (let y = 0.6; y < 0.3 + h; y += 0.55) b.cyl(r + 0.012, r + 0.012, 0.05, '#7d848b', [x, y, z], undefined, 12);
    strut(b, [x + r + 0.04, 0.15, z + 0.1], [x + r + 0.04, 0.3 + h - 0.1, z + 0.1], 0.02, C.steel);
    strut(b, [x + r + 0.04, 0.15, z - 0.1], [x + r + 0.04, 0.3 + h - 0.1, z - 0.1], 0.02, C.steel);
  };
  column(-1.15, -1.0, 0.3, 3.1, [1.2, 2.2, 3.1]);
  column(-0.35, -1.25, 0.21, 2.1, [1.0, 1.9]);
  a.cyl(0.315, 0.315, 0.12, '#ffffff', [-1.15, 2.7, -1.0], undefined, 12);

  // --- forno com chaminés
  const [hx, hz] = [0.6, -1.2];
  b.box(0.95, 0.75, 0.62, BRICK, [hx, 0.5, hz]);
  b.box(0.99, 0.06, 0.66, DARK, [hx, 0.9, hz]);
  for (const dx of [-0.25, 0.25]) {
    b.cyl(0.07, 0.09, 1.3, DARK, [hx + dx, 1.55, hz], undefined, 8);
    b.cyl(0.095, 0.095, 0.05, '#555b61', [hx + dx, 2.2, hz], undefined, 8);
  }
  for (let i = 0; i < 4; i++) b.box(0.18, 0.12, 0.02, '#e07a2c', [hx - 0.33 + i * 0.22, 0.32, hz + 0.32]);

  // --- rack de tubulação elevado atravessando a planta
  const rz = -0.2;
  const ry = 0.95;
  for (const x of [-1.6, -0.8, 0, 0.8, 1.6]) {
    for (const s of [-1, 1]) b.box(0.06, ry - 0.12, 0.06, DARK, [x, (ry + 0.12) / 2, rz + s * 0.22]);
    b.box(0.06, 0.06, 0.56, DARK, [x, ry, rz]);
    b.box(0.06, 0.06, 0.56, DARK, [x, ry - 0.35, rz]);
  }
  for (const [dz, y, col, r] of [
    [-0.15, ry + 0.07, RUST, 0.05],
    [-0.04, ry + 0.07, STEEL, 0.04],
    [0.07, ry + 0.07, PIPE_Y, 0.04],
    [0.16, ry + 0.07, '#4f7a8c', 0.05],
    [-0.1, ry - 0.28, STEEL, 0.05],
    [0.1, ry - 0.28, RUST, 0.04],
  ] as const)
    b.cyl(r, r, 3.4, col, [0, y, rz + dz], [0, 0, Math.PI / 2], 6);
  // ligações: das colunas ao rack e do rack aos tanques
  strut(b, [-1.15, 1.1, -0.72], [-1.15, ry + 0.07, rz - 0.15], 0.05, RUST);
  strut(b, [-0.35, 0.8, -1.04], [-0.35, ry + 0.07, rz - 0.04], 0.04, STEEL);
  strut(b, [hx, 0.88, hz + 0.3], [hx, ry + 0.07, rz + 0.07], 0.04, PIPE_Y);

  // --- trocadores de calor (cilindros deitados em berços)
  for (const z of [0.3, 0.62]) {
    b.cyl(0.13, 0.13, 0.95, '#b7bcc1', [-0.75, 0.38, z], [0, 0, Math.PI / 2], 10);
    for (const dx of [-0.32, 0.32]) b.box(0.08, 0.22, 0.22, DARK, [-0.75 + dx, 0.22, z]);
  }

  // --- esfera de GLP em pernas
  const [sx, sz] = [1.0, 0.55];
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2;
    b.box(0.05, 0.55, 0.05, DARK, [sx + Math.cos(ang) * 0.4, 0.4, sz + Math.sin(ang) * 0.4]);
  }
  b.sphere(0.5, WHITE, [sx, 0.98, sz], undefined, 14);
  a.cyl(0.505, 0.505, 0.07, '#ffffff', [sx, 0.98, sz], undefined, 14);
  strut(b, [sx, 1.48, sz], [sx + 0.35, 1.48, sz], 0.02, C.steel);

  // --- tanque de teto flutuante
  const [tx, tz] = [1.05, 1.35];
  b.cyl(0.42, 0.42, 0.55, WHITE, [tx, 0.4, tz], undefined, 14);
  b.cyl(0.38, 0.38, 0.02, '#8e939a', [tx, 0.62, tz], undefined, 14);
  a.cyl(0.425, 0.425, 0.08, '#ffffff', [tx, 0.5, tz], undefined, 14);
  strut(b, [tx - 0.42, 0.15, tz], [tx - 0.1, 0.66, tz], 0.015, C.steel);

  // --- casa de controle
  const [cx, cz] = [-1.05, 1.15];
  b.box(1.0, 0.55, 0.7, C.concreteLight, [cx, 0.4, cz]);
  b.box(1.04, 0.06, 0.74, C.roof, [cx, 0.7, cz]);
  for (let i = 0; i < 3; i++) g.box(0.22, 0.16, 0.02, '#ffffff', [cx - 0.3 + i * 0.3, 0.46, cz + 0.36]);
  a.box(1.02, 0.08, 0.02, '#ffffff', [cx, 0.62, cz + 0.36]);
  b.box(0.22, 0.12, 0.22, C.steel, [cx + 0.25, 0.79, cz - 0.1]);

  // --- tocha (flare) em treliça
  const [fx, fz] = [1.55, -1.55];
  const FH = 3.3;
  for (const [ox, oz] of [
    [-0.16, -0.16],
    [0.16, -0.16],
    [0.16, 0.16],
    [-0.16, 0.16],
  ] as const)
    strut(b, [fx + ox, 0.12, fz + oz], [fx + ox * 0.3, FH - 0.2, fz + oz * 0.3], 0.025, STEEL);
  for (const y of [0.9, 1.8, 2.6]) b.box(0.26 - y * 0.06, 0.03, 0.26 - y * 0.06, STEEL, [fx, y, fz]);
  b.cyl(0.05, 0.06, FH, DARK, [fx, FH / 2 + 0.1, fz], undefined, 8);
  b.cyl(0.09, 0.07, 0.14, '#555b61', [fx, FH + 0.15, fz], undefined, 8);
  strut(b, [fx, 0.3, fz + 0.1], [hx + 0.4, 0.3, hz], 0.035, DARK);
  return { base: l.build(), moving: null, height: 3.6, smoke: [[fx, FH + 0.3, fz]] };
}

/**
 * Siderúrgica (2×2), em low poly:
 * - alto-forno dentro da estrutura de aço, com o tubo de descida até o coletor de pó e a ponte inclinada de carga;
 * - três regeneradores (torres de topo arredondado), a marca mais reconhecível da usina;
 * - linha férrea com o carro-torpedo do ferro gusa, montes de minério e de carvão;
 * - galpão de laminação com telhado em dente de serra, pátio de bobinas e placas sob um pórtico rolante;
 * - chaminé de tijolo com a faixa da nação.
 */
export function buildSteelMill(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const HOT = '#e8792c';
  b.box(3.7, 0.12, 3.7, C.concreteDark, [0, 0.06, 0]);
  b.box(3.5, 0.012, 3.5, '#7f7a71', [0, 0.126, 0]);

  // --- alto-forno
  const [fx, fz] = [-1.05, -0.95];
  b.cyl(0.62, 0.66, 0.35, C.concrete, [fx, 0.3, fz], undefined, 12);
  b.cyl(0.5, 0.6, 0.9, RUST, [fx, 0.92, fz], undefined, 12);
  b.cyl(0.6, 0.5, 0.25, RUST, [fx, 1.5, fz], undefined, 12);
  b.cyl(0.5, 0.38, 1.0, RUST, [fx, 2.12, fz], undefined, 12);
  b.cyl(0.38, 0.2, 0.35, DARK, [fx, 2.8, fz], undefined, 10);
  b.cyl(0.66, 0.66, 0.1, DARK, [fx, 1.35, fz], undefined, 12);
  a.cyl(0.505, 0.505, 0.1, '#ffffff', [fx, 1.9, fz], undefined, 12);
  // estrutura de aço em volta
  for (const [ox, oz] of [
    [-0.72, -0.72],
    [0.72, -0.72],
    [0.72, 0.72],
    [-0.72, 0.72],
  ] as const) {
    b.box(0.06, 3.0, 0.06, DARK, [fx + ox, 1.62, fz + oz]);
  }
  for (const y of [1.1, 2.0, 2.9]) {
    b.box(1.5, 0.05, 0.05, DARK, [fx, y, fz - 0.72]);
    b.box(1.5, 0.05, 0.05, DARK, [fx, y, fz + 0.72]);
    b.box(0.05, 0.05, 1.5, DARK, [fx - 0.72, y, fz]);
    b.box(0.05, 0.05, 1.5, DARK, [fx + 0.72, y, fz]);
  }
  // tubo de descida (U invertido) até o coletor de pó
  strut(b, [fx + 0.1, 3.0, fz], [fx + 0.1, 3.35, fz], 0.08, RUST);
  strut(b, [fx + 0.1, 3.35, fz], [-0.05, 3.35, -1.55], 0.08, RUST);
  strut(b, [-0.05, 3.35, -1.55], [-0.05, 1.6, -1.55], 0.08, RUST);
  b.cyl(0.24, 0.24, 0.6, STEEL, [-0.05, 1.3, -1.55], undefined, 10);
  b.cyl(0.05, 0.24, 0.35, STEEL, [-0.05, 0.82, -1.55], undefined, 10);
  for (const [ox, oz] of [
    [-0.2, -0.2],
    [0.2, 0.2],
  ] as const) b.box(0.05, 0.75, 0.05, DARK, [-0.05 + ox, 0.5, -1.55 + oz]);
  // ponte inclinada de carga (do pátio até o topo)
  strut(b, [0.05, 0.15, -0.15], [fx + 0.45, 2.85, fz + 0.25], 0.11, STEEL);
  strut(b, [0.12, 0.15, -0.05], [fx + 0.52, 2.85, fz + 0.35], 0.03, DARK);
  // casa de corrida: o gusa saindo quente
  b.box(0.7, 0.4, 0.45, C.concrete, [fx + 0.05, 0.32, fz + 0.85]);
  b.box(0.35, 0.03, 0.12, HOT, [fx + 0.05, 0.14, fz + 1.12]);

  // --- três regeneradores
  for (const x of [0.45, 0.85, 1.25]) {
    const z = -1.45;
    b.cyl(0.18, 0.2, 2.1, '#b0aea8', [x, 1.17, z], undefined, 10);
    b.sphere(0.18, '#b0aea8', [x, 2.22, z], [1, 0.8, 1], 10);
    b.cyl(0.21, 0.21, 0.05, DARK, [x, 0.5, z], undefined, 10);
    b.cyl(0.21, 0.21, 0.05, DARK, [x, 1.5, z], undefined, 10);
  }
  strut(b, [0.25, 1.75, -1.45], [fx + 0.6, 1.75, fz - 0.3], 0.06, RUST);

  // --- chaminé
  b.cyl(0.16, 0.22, 3.4, BRICK, [1.6, 1.82, -0.75], undefined, 10);
  a.cyl(0.21, 0.21, 0.14, '#ffffff', [1.6, 3.15, -0.75], undefined, 10);
  b.cyl(0.17, 0.17, 0.06, DARK, [1.6, 3.53, -0.75], undefined, 10);

  // --- linha férrea com o carro-torpedo
  const rz = -0.12;
  for (const dz of [-0.09, 0.09]) b.box(3.5, 0.03, 0.03, '#4a4e53', [0, 0.15, rz + dz]);
  for (let x = -1.65; x <= 1.65; x += 0.25) b.box(0.07, 0.025, 0.3, '#5a4a3a', [x, 0.135, rz]);
  const tx = 0.75;
  b.box(1.1, 0.08, 0.22, DARK, [tx, 0.22, rz]);
  b.cyl(0.17, 0.17, 0.75, '#6c7177', [tx, 0.42, rz], [0, 0, Math.PI / 2], 10);
  for (const s of [-1, 1]) b.cyl(0.09, 0.17, 0.22, '#6c7177', [tx + s * 0.48, 0.42, rz], [0, 0, (s * Math.PI) / 2], 10);
  b.box(0.18, 0.06, 0.12, HOT, [tx, 0.59, rz]);
  for (const x of [-0.4, -0.15, 0.15, 0.4]) b.cyl(0.06, 0.06, 0.24, C.rubber, [tx + x, 0.2, rz], [Math.PI / 2, 0, 0], 8);

  // --- montes de minério e de carvão
  b.cyl(0.0, 0.5, 0.45, '#8a4a32', [1.3, 0.35, 0.45], undefined, 7);
  b.cyl(0.0, 0.42, 0.38, '#2b2b2d', [0.55, 0.31, 0.5], undefined, 7);

  // --- galpão de laminação (dente de serra)
  const [mx, mz] = [-0.75, 1.15];
  b.box(2.0, 0.85, 1.2, C.concrete, [mx, 0.55, mz]);
  for (let i = 0; i < 4; i++) {
    const x = mx - 0.75 + i * 0.5;
    b.box(0.52, 0.05, 1.24, C.roof, [x, 1.08, mz], [0, 0, 0.42]);
    g.box(0.02, 0.2, 1.16, '#ffffff', [x + 0.24, 1.07, mz]);
  }
  g.box(1.6, 0.2, 0.02, '#ffffff', [mx, 0.66, mz + 0.61]);
  b.box(0.45, 0.55, 0.03, C.metalDark, [mx + 0.7, 0.42, mz + 0.61]);
  a.box(2.02, 0.09, 0.02, '#ffffff', [mx, 0.9, mz + 0.61]);

  // --- pátio de bobinas e placas sob o pórtico rolante
  const [yx, yz] = [1.05, 1.3];
  for (const x of [0.6, 0.95, 1.3]) b.cyl(0.17, 0.17, 0.26, STEEL, [x, 0.3, yz - 0.25], [Math.PI / 2, 0, 0], 12);
  for (let i = 0; i < 3; i++) b.box(0.85, 0.06, 0.4, '#7d848b', [yx, 0.16 + i * 0.065, yz + 0.25]);
  for (const s of [-1, 1]) {
    b.box(0.06, 1.0, 0.06, C.yellow, [yx + s * 0.62, 0.62, yz - 0.45]);
    b.box(0.06, 1.0, 0.06, C.yellow, [yx + s * 0.62, 0.62, yz + 0.5]);
    b.box(0.06, 0.06, 1.0, C.yellow, [yx + s * 0.62, 1.12, yz + 0.02]);
  }
  b.box(1.3, 0.08, 0.1, C.yellow, [yx, 1.17, yz + 0.1]);
  b.box(0.2, 0.12, 0.16, C.metalDark, [yx + 0.2, 1.07, yz + 0.1]);
  strut(b, [yx + 0.2, 1.0, yz + 0.1], [yx + 0.2, 0.55, yz + 0.1], 0.01, DARK);
  return {
    base: l.build(),
    moving: null,
    height: 3.5,
    smoke: [
      [1.6, 3.6, -0.75],
      [fx, 3.0, fz],
    ],
  };
}

/** Hospital (2×2): bloco branco com cruz vermelha, heliponto no telhado e entrada coberta. */
export function buildHospital(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.7, 0.1, 3.7, C.concreteDark, [0, 0.05, 0]);
  b.box(2.9, 1.5, 2.2, WHITE, [0, 0.85, -0.3]);
  b.box(1.4, 0.9, 1.0, WHITE, [-0.6, 0.55, 1.2]);
  for (const y of [0.55, 1.05, 1.45]) for (let i = 0; i < 6; i++) g.box(0.3, 0.22, 0.02, '#ffffff', [-1.15 + i * 0.46, y, 0.81]);
  // cruz vermelha na fachada e no telhado
  b.box(0.5, 0.14, 0.03, '#d23a30', [0.95, 1.25, 0.82]);
  b.box(0.14, 0.5, 0.03, '#d23a30', [0.95, 1.25, 0.82]);
  // heliponto
  b.cyl(0.85, 0.85, 0.06, DARK, [0, 1.63, -0.3], undefined, 20);
  b.box(0.08, 0.02, 0.5, '#ffffff', [-0.15, 1.67, -0.3]);
  b.box(0.08, 0.02, 0.5, '#ffffff', [0.15, 1.67, -0.3]);
  b.box(0.3, 0.02, 0.08, '#ffffff', [0, 1.67, -0.3]);
  // marquise da emergência e faixa na cor da facção
  b.box(1.2, 0.06, 0.6, C.roof, [0.95, 0.62, 1.15]);
  for (const x of [0.45, 1.45]) b.box(0.06, 0.6, 0.06, STEEL, [x, 0.32, 1.4]);
  a.box(2.92, 0.12, 2.22, '#ffffff', [0, 1.55, -0.3]);
  return { base: l.build(), moving: null, height: 1.8 };
}

/** Escola (2×2): prédio em L de tijolo, pátio com quadra e mastro com bandeira. */
export function buildSchool(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.7, 0.1, 3.7, C.concreteDark, [0, 0.05, 0]);
  b.box(3.0, 1.0, 1.1, BRICK, [0, 0.6, -1.1]);
  b.box(1.1, 1.0, 1.6, BRICK, [-1.0, 0.6, 0.25]);
  b.box(3.1, 0.08, 1.2, C.roof, [0, 1.14, -1.1]);
  b.box(1.2, 0.08, 1.7, C.roof, [-1.0, 1.14, 0.25]);
  for (let i = 0; i < 6; i++) g.box(0.32, 0.36, 0.02, '#ffffff', [-1.2 + i * 0.48, 0.7, -0.54]);
  for (let i = 0; i < 3; i++) g.box(0.02, 0.36, 0.32, '#ffffff', [-0.44, 0.7, -0.2 + i * 0.45]);
  // quadra no pátio
  b.box(1.6, 0.03, 1.2, '#4f7d5a', [0.75, 0.12, 0.75]);
  b.box(1.5, 0.01, 0.03, '#ffffff', [0.75, 0.14, 0.75]);
  for (const z of [0.2, 1.3]) b.box(0.05, 0.5, 0.05, STEEL, [0.75, 0.35, z]);
  // relógio e mastro com bandeira da facção
  b.cyl(0.18, 0.18, 0.04, WHITE, [0, 0.95, -0.53], [Math.PI / 2, 0, 0], 14);
  b.cyl(0.03, 0.03, 2.2, STEEL, [1.55, 1.1, -0.2], undefined, 6);
  a.box(0.6, 0.36, 0.02, '#ffffff', [1.86, 1.95, -0.2]);
  return { base: l.build(), moving: null, height: 2.2 };
}

/** Delegacia (1×1): prédio compacto com giroflex, antena e viatura na frente. */
export function buildPoliceStation(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.8, 0.08, 1.8, C.concreteDark, [0, 0.04, 0]);
  b.box(1.3, 0.9, 0.9, C.concreteLight, [0, 0.53, -0.3]);
  b.box(1.36, 0.08, 0.96, C.roof, [0, 1.02, -0.3]);
  a.box(1.32, 0.14, 0.92, '#ffffff', [0, 0.85, -0.3]);
  for (let i = 0; i < 3; i++) g.box(0.24, 0.24, 0.02, '#ffffff', [-0.4 + i * 0.4, 0.55, 0.16]);
  b.box(0.3, 0.45, 0.02, DARK, [0, 0.3, 0.16]);
  // antena e luz azul no telhado
  b.cyl(0.02, 0.02, 0.8, STEEL, [0.45, 1.45, -0.5], undefined, 6);
  b.box(0.16, 0.08, 0.08, '#2f6bd8', [-0.35, 1.1, -0.3]);
  // viatura: carroceria branca e preta, giroflex
  b.box(0.8, 0.2, 0.4, WHITE, [0.1, 0.22, 0.6]);
  b.box(0.45, 0.16, 0.36, DARK, [0.05, 0.4, 0.6]);
  b.box(0.12, 0.05, 0.1, '#2f6bd8', [0.05, 0.5, 0.6]);
  for (const [x, z] of [
    [-0.18, 0.4],
    [0.38, 0.4],
    [-0.18, 0.8],
    [0.38, 0.8],
  ] as const)
    b.cyl(0.09, 0.09, 0.06, '#1d1f22', [x, 0.1, z], [Math.PI / 2, 0, 0], 10);
  return { base: l.build(), moving: null, height: 1.5 };
}
