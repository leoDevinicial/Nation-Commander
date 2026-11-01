import * as THREE from 'three';
import { C, layers, type PartBuilder } from './kit.ts';
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
/** Ambulância (furgão branco com faixa vermelha e giroflex), comprimento ao longo de x, frente para +x. */
function ambulance(b: PartBuilder, g: PartBuilder, x: number, z: number): void {
  b.box(0.42, 0.2, 0.2, WHITE, [x, 0.24, z]);
  b.box(0.12, 0.12, 0.2, WHITE, [x + 0.26, 0.2, z]);
  g.box(0.012, 0.07, 0.17, '#ffffff', [x + 0.215, 0.28, z]);
  b.box(0.43, 0.04, 0.205, '#d23a30', [x, 0.22, z]);
  b.box(0.12, 0.025, 0.06, '#d23a30', [x + 0.12, 0.35, z]);
  b.box(0.06, 0.026, 0.061, '#2f6bd8', [x + 0.12, 0.351, z]);
  for (const dx of [-0.13, 0.22]) for (const s2 of [-1, 1]) b.cyl(0.045, 0.045, 0.03, '#1d1f22', [x + dx, 0.1, z + s2 * 0.1], [Math.PI / 2, 0, 0], 8);
}

/** Cruz vermelha (no plano xy, voltada para +z). */
function redCross(b: PartBuilder, x: number, y: number, z: number, s2: number): void {
  b.box(0.5 * s2, 0.16 * s2, 0.03, '#d23a30', [x, y, z]);
  b.box(0.16 * s2, 0.5 * s2, 0.03, '#d23a30', [x, y, z]);
}

export function buildHospital(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const SPANDREL = '#eef0ee';
  b.box(3.7, 0.1, 3.7, C.concreteDark, [0, 0.05, 0]);
  // torre de internação de três andares: faixas de janelas contínuas, peitoris brancos e aletas verticais
  const tx = -0.2;
  const tz = -1.0;
  b.box(2.4, 1.45, 1.2, WHITE, [tx, 0.825, tz]);
  for (const y of [0.42, 0.88, 1.32]) {
    g.box(2.3, 0.22, 0.02, '#ffffff', [tx, y, tz + 0.605]);
    g.box(0.02, 0.22, 1.1, '#ffffff', [tx - 1.205, y, tz]);
    g.box(0.02, 0.22, 1.1, '#ffffff', [tx + 1.205, y, tz]);
    b.box(2.42, 0.05, 1.22, SPANDREL, [tx, y - 0.14, tz]);
  }
  for (let i = 0; i < 9; i++) b.box(0.03, 1.3, 0.05, SPANDREL, [tx - 1.12 + i * 0.28, 0.82, tz + 0.62]);
  // platibanda com a faixa da nação só nas laterais (o telhado continua claro)
  b.box(2.44, 0.08, 1.24, '#d9dbd9', [tx, 1.58, tz]);
  a.box(2.445, 0.06, 0.02, '#ffffff', [tx, 1.5, tz + 0.615]);
  a.box(2.445, 0.06, 0.02, '#ffffff', [tx, 1.5, tz - 0.615]);
  a.box(0.02, 0.06, 1.245, '#ffffff', [tx - 1.215, 1.5, tz]);
  a.box(0.02, 0.06, 1.245, '#ffffff', [tx + 1.215, 1.5, tz]);
  b.box(2.36, 0.012, 1.16, '#a7aaa9', [tx, 1.6, tz]);
  redCross(b, tx + 0.85, 1.12, tz + 0.63, 0.75);
  // heliponto elevado sobre colunas, com o círculo, o H e as luzes de borda
  const hx = tx - 0.45;
  for (const [dx, dz] of [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ] as const)
    b.box(0.05, 0.14, 0.05, C.steel, [hx + dx, 1.67, tz + dz]);
  b.box(1.0, 0.04, 1.0, '#4a4f55', [hx, 1.76, tz]);
  b.add(new THREE.RingGeometry(0.36, 0.41, 20), '#e2b12e', { pos: [hx, 1.783, tz], rot: [-Math.PI / 2, 0, 0] });
  b.box(0.06, 0.012, 0.32, '#ffffff', [hx - 0.1, 1.785, tz]);
  b.box(0.06, 0.012, 0.32, '#ffffff', [hx + 0.1, 1.785, tz]);
  b.box(0.2, 0.012, 0.06, '#ffffff', [hx, 1.785, tz]);
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    b.box(0.03, 0.025, 0.03, '#4fbf6a', [hx + Math.cos(ang) * 0.47, 1.79, tz + Math.sin(ang) * 0.47]);
  }
  // casa de máquinas e ar-condicionado no outro lado do telhado
  b.box(0.5, 0.18, 0.5, '#d9dbd9', [tx + 0.65, 1.7, tz - 0.15]);
  for (const dz of [-0.2, 0.2]) {
    b.box(0.2, 0.08, 0.16, '#c9ccc9', [tx + 0.65, 1.65, tz + 0.35 + dz * 0.4]);
  }
  // saguão térreo na frente: entrada de vidro, marquise de desembarque e letreiro com a cruz
  b.box(1.9, 0.55, 0.9, WHITE, [-0.55, 0.375, 0.05]);
  g.box(1.5, 0.32, 0.02, '#ffffff', [-0.55, 0.3, 0.505]);
  b.box(1.94, 0.05, 0.94, '#d9dbd9', [-0.55, 0.675, 0.05]);
  a.box(1.92, 0.07, 0.012, '#ffffff', [-0.55, 0.6, 0.51]);
  b.box(0.9, 0.04, 0.5, '#d9dbd9', [-0.75, 0.48, 0.78]);
  for (const x of [-1.15, -0.35]) b.cyl(0.025, 0.025, 0.36, STEEL, [x, 0.28, 1.0], undefined, 6);
  redCross(b, -0.05, 0.43, 0.512, 0.35);
  // ala de emergência com a cobertura vermelha da entrada das ambulâncias
  b.box(1.2, 0.5, 0.95, WHITE, [1.1, 0.35, 0.05]);
  g.box(0.02, 0.18, 0.7, '#ffffff', [1.705, 0.38, 0.05]);
  b.box(0.36, 0.3, 0.02, '#8d939a', [1.0, 0.25, 0.53]);
  b.box(1.0, 0.05, 0.62, '#d9dbd9', [1.1, 0.48, 0.86]);
  b.box(1.02, 0.07, 0.02, '#d23a30', [1.1, 0.46, 1.17]);
  for (const x of [0.65, 1.55]) b.box(0.05, 0.38, 0.05, STEEL, [x, 0.29, 1.12]);
  ambulance(b, g, 0.85, 0.85);
  ambulance(b, g, 1.25, 1.45);
  // desembarque, estacionamento com carros, árvores e calçada
  b.box(3.5, 0.012, 0.75, '#3d4044', [0, 0.106, 1.42]);
  for (let i = 0; i < 6; i++) b.box(0.02, 0.014, 0.32, '#e8eae8', [-1.6 + i * 0.3, 0.114, 1.6]);
  for (const [x, c] of [
    [-1.45, '#2f5f8a'],
    [-0.85, '#a8432f'],
    [-0.25, '#d9d8d0'],
  ] as const) {
    b.box(0.22, 0.09, 0.4, c, [x, 0.17, 1.62]);
    b.box(0.19, 0.07, 0.2, c, [x, 0.24, 1.6]);
    g.box(0.195, 0.05, 0.21, '#ffffff', [x, 0.245, 1.6]);
  }
  for (const [x, z] of [
    [-1.65, 0.75],
    [1.65, -1.55],
    [-1.65, -1.75],
  ] as const) {
    b.cyl(0.03, 0.04, 0.22, '#5a4632', [x, 0.21, z], undefined, 5);
    b.add(new THREE.IcosahedronGeometry(0.2, 0), '#4f7a3c', { pos: [x, 0.42, z] });
  }
  return { base: l.build(), moving: null, height: 1.8 };
}

/**
 * Escola (2×2), em low poly:
 * - prédio em L de dois andares, tijolo com janelas de moldura branca e telhado de duas águas;
 * - torre do relógio na entrada (telhado em pirâmide, sino) e marquise com colunas;
 * - quadra com linhas e duas tabelas de basquete, parquinho (escorregador e balanço), árvores e bancos;
 * - ônibus escolar amarelo na frente, mastro com a bandeira da nação e cerca com portão.
 */
export function buildSchool(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const TRIM = '#e9e4d6';
  const YELLOW = '#e2b12e';
  b.box(3.7, 0.1, 3.7, C.concreteDark, [0, 0.05, 0]);
  b.box(3.5, 0.012, 3.5, '#8f8b82', [0, 0.106, 0]);
  railing(b, [-1.8, -1.8], [1.8, -1.8], 0.1, 0.24, '#e0e0dc', 6);
  railing(b, [-1.8, -1.8], [-1.8, 1.8], 0.1, 0.24, '#e0e0dc', 6);
  railing(b, [1.8, -1.8], [1.8, 1.8], 0.1, 0.24, '#e0e0dc', 6);
  railing(b, [-1.8, 1.8], [-0.5, 1.8], 0.1, 0.24, '#e0e0dc', 3);

  // --- prédio em L (dois andares)
  const wing = (x: number, z: number, w: number, d: number, alongX: boolean) => {
    b.box(w, 1.15, d, BRICK, [x, 0.67, z]);
    b.box(w + 0.04, 0.06, d + 0.04, TRIM, [x, 0.66, z]);
    b.gable(alongX ? w + 0.1 : d + 0.1, alongX ? d + 0.12 : w + 0.12, 0.42, C.roofRed, [x, 1.25, z], alongX ? 0 : Math.PI / 2);
  };
  wing(0.15, -1.15, 3.1, 1.0, true);
  wing(-1.05, 0.15, 1.0, 1.6, false);
  // janelas com moldura (dois andares) — fachada principal e a lateral da ala
  for (const y of [0.42, 0.95])
    for (let i = 0; i < 6; i++) {
      const x = -1.05 + i * 0.47;
      if (Math.abs(x - 0.15) < 0.3) continue;
      b.box(0.3, 0.32, 0.03, TRIM, [x, y, -0.645]);
      g.box(0.24, 0.26, 0.02, '#ffffff', [x, y, -0.63]);
    }
  for (const y of [0.42, 0.95])
    for (let i = 0; i < 3; i++) {
      const z = -0.35 + i * 0.45;
      b.box(0.03, 0.32, 0.3, TRIM, [-0.545, y, z]);
      g.box(0.02, 0.26, 0.24, '#ffffff', [-0.53, y, z]);
    }
  // --- torre do relógio e entrada
  const [ex, ez] = [0.15, -0.6];
  b.box(0.55, 2.0, 0.5, BRICK, [ex, 1.1, ez - 0.1]);
  b.box(0.6, 0.06, 0.55, TRIM, [ex, 1.55, ez - 0.1]);
  b.box(0.6, 0.06, 0.55, TRIM, [ex, 2.08, ez - 0.1]);
  b.cyl(0.0, 0.43, 0.45, C.roofRed, [ex, 2.33, ez - 0.1], [0, Math.PI / 4, 0], 4);
  b.cyl(0.17, 0.17, 0.03, WHITE, [ex, 1.82, ez + 0.16], [Math.PI / 2, 0, 0], 14);
  b.box(0.02, 0.12, 0.02, DARK, [ex, 1.86, ez + 0.18]);
  b.box(0.09, 0.02, 0.02, DARK, [ex + 0.03, 1.82, ez + 0.18]);
  b.cyl(0.07, 0.09, 0.12, '#b8902e', [ex, 1.67, ez + 0.05], undefined, 8);
  // marquise com colunas e portas
  b.box(0.9, 0.05, 0.5, TRIM, [ex, 0.62, ez + 0.3]);
  for (const dx of [-0.38, 0.38]) b.cyl(0.035, 0.035, 0.52, TRIM, [ex + dx, 0.36, ez + 0.5], undefined, 8);
  b.box(0.3, 0.42, 0.02, '#4c3a2c', [ex, 0.32, ez + 0.06]);
  for (let i = 0; i < 2; i++) b.box(0.9 - i * 0.1, 0.05, 0.1, C.concrete, [ex, 0.13 + i * 0.05, ez + 0.6 - i * 0.08]);
  a.box(0.56, 0.1, 0.02, '#ffffff', [ex, 1.3, ez + 0.155]);

  // --- quadra com tabelas de basquete
  const [qx, qz] = [0.85, 0.55];
  b.box(1.55, 0.02, 1.05, '#3f7a5f', [qx, 0.12, qz]);
  b.box(1.45, 0.012, 0.03, '#ffffff', [qx, 0.135, qz - 0.48]);
  b.box(1.45, 0.012, 0.03, '#ffffff', [qx, 0.135, qz + 0.48]);
  b.box(0.03, 0.012, 0.99, '#ffffff', [qx - 0.73, 0.135, qz]);
  b.box(0.03, 0.012, 0.99, '#ffffff', [qx + 0.73, 0.135, qz]);
  b.box(0.03, 0.012, 0.99, '#ffffff', [qx, 0.135, qz]);
  b.cyl(0.15, 0.15, 0.012, '#ffffff', [qx, 0.135, qz], undefined, 12);
  for (const s of [-1, 1]) {
    b.box(0.04, 0.6, 0.04, STEEL, [qx + s * 0.8, 0.42, qz]);
    b.box(0.03, 0.22, 0.32, WHITE, [qx + s * 0.76, 0.68, qz]);
    b.cyl(0.07, 0.07, 0.015, '#d0602c', [qx + s * 0.69, 0.6, qz], undefined, 10);
  }

  // --- parquinho: escorregador e balanço
  const [px, pz] = [-1.0, 1.35];
  b.box(0.2, 0.32, 0.2, YELLOW, [px - 0.25, 0.26, pz]);
  b.box(0.12, 0.03, 0.45, '#d0602c', [px - 0.25, 0.26, pz + 0.3], [0.62, 0, 0]);
  for (const s of [-1, 1]) strut(b, [px + 0.2 + s * 0.22, 0.1, pz - 0.15], [px + 0.2, 0.55, pz - 0.15], 0.02, STEEL);
  for (const s of [-1, 1]) strut(b, [px + 0.2 + s * 0.22, 0.1, pz + 0.15], [px + 0.2, 0.55, pz + 0.15], 0.02, STEEL);
  b.box(0.04, 0.03, 0.34, STEEL, [px + 0.2, 0.55, pz]);
  for (const dz of [-0.08, 0.08]) b.box(0.12, 0.02, 0.06, '#4c3a2c', [px + 0.2, 0.25, pz + dz]);

  // --- árvores e bancos
  for (const [x, z, r] of [
    [-0.25, 0.35, 0.28],
    [-0.15, 1.05, 0.22],
    [1.6, 1.45, 0.25],
  ] as const) {
    b.cyl(0.04, 0.05, 0.35, '#6b5038', [x, 0.27, z], undefined, 6);
    b.sphere(r, '#4f7f3e', [x, 0.48 + r * 0.7, z], [1, 0.9, 1], 7);
  }
  for (const x of [0.4, 1.2]) b.box(0.35, 0.05, 0.1, '#7a5a3c', [x, 0.2, 1.22]);

  // --- ônibus escolar amarelo na frente
  const [bx, bz] = [0.65, 1.55];
  b.box(1.1, 0.34, 0.36, YELLOW, [bx, 0.38, bz]);
  b.box(0.25, 0.22, 0.34, YELLOW, [bx + 0.67, 0.31, bz]);
  b.box(1.12, 0.03, 0.38, DARK, [bx, 0.24, bz]);
  for (let i = 0; i < 6; i++) g.box(0.13, 0.12, 0.02, '#ffffff', [bx - 0.45 + i * 0.17, 0.46, bz + 0.18]);
  g.box(0.02, 0.14, 0.28, '#ffffff', [bx + 0.555, 0.46, bz]);
  for (const x of [-0.35, 0.4]) for (const s of [-1, 1]) b.cyl(0.08, 0.08, 0.06, C.rubber, [bx + x, 0.19, bz + s * 0.17], [Math.PI / 2, 0, 0], 10);

  // --- mastro com a bandeira da nação
  b.cyl(0.025, 0.03, 2.2, STEEL, [1.6, 1.2, -0.45], undefined, 6);
  a.box(0.55, 0.34, 0.02, '#ffffff', [1.88, 2.1, -0.45]);
  b.cyl(0.12, 0.14, 0.08, C.concrete, [1.6, 0.14, -0.45], undefined, 8);
  return { base: l.build(), moving: null, height: 2.4 };
}

/** Delegacia (1×1): prédio compacto com giroflex, antena e viatura na frente. */
/** Viatura (sedã branco com portas pretas e barra de luz azul e vermelha), comprimento ao longo de z, frente para +z. */
function patrolCar(b: PartBuilder, a: PartBuilder, g: PartBuilder, x: number, z: number): void {
  b.box(0.25, 0.09, 0.6, WHITE, [x, 0.15, z]);
  b.box(0.252, 0.06, 0.26, '#1d1f22', [x, 0.15, z - 0.02]);
  b.box(0.22, 0.09, 0.3, WHITE, [x, 0.235, z - 0.04]);
  g.box(0.226, 0.06, 0.28, '#ffffff', [x, 0.24, z - 0.04]);
  b.box(0.2, 0.012, 0.3, WHITE, [x, 0.285, z - 0.04]);
  b.box(0.18, 0.025, 0.06, '#2f6bd8', [x - 0.0, 0.305, z + 0.02]);
  b.box(0.08, 0.026, 0.061, '#d8322a', [x + 0.05, 0.305, z + 0.02]);
  a.box(0.254, 0.025, 0.2, '#ffffff', [x, 0.17, z + 0.17]);
  b.box(0.2, 0.03, 0.01, '#f2e6a0', [x, 0.16, z + 0.3]);
  for (const dx of [-0.12, 0.12]) for (const dz of [-0.19, 0.19]) b.cyl(0.05, 0.05, 0.04, '#1d1f22', [x + dx, 0.1, z + dz], [0, 0, Math.PI / 2], 8);
}

export function buildPoliceStation(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const STONE = '#d6d1c4';
  const STONE_DARK = '#b9b3a5';
  b.box(1.8, 0.08, 1.8, C.concreteDark, [0, 0.04, 0]);
  // calçada na frente e o pátio de asfalto com as vagas
  b.box(1.76, 0.02, 0.32, C.concrete, [0, 0.09, 0.2]);
  b.box(1.2, 0.012, 0.5, '#3d4044', [0.28, 0.086, 0.62]);
  for (const x of [-0.06, 0.28, 0.62]) b.box(0.02, 0.014, 0.42, '#e8eae8', [x, 0.094, 0.62]);
  // prédio de dois andares: embasamento escuro, faixa entre os andares, platibanda e a faixa da nação
  b.box(1.3, 1.0, 0.8, STONE, [-0.2, 0.58, -0.45]);
  b.box(1.32, 0.12, 0.82, STONE_DARK, [-0.2, 0.14, -0.45]);
  b.box(1.32, 0.04, 0.82, STONE_DARK, [-0.2, 0.6, -0.45]);
  b.box(1.34, 0.08, 0.84, STONE_DARK, [-0.2, 1.1, -0.45]);
  a.box(1.335, 0.07, 0.835, '#ffffff', [-0.2, 1.02, -0.45]);
  b.box(1.24, 0.02, 0.74, C.roof, [-0.2, 1.09, -0.45]);
  // janelas em faixa nos dois andares (frente) e nas laterais, com peitoril
  for (const y of [0.4, 0.82])
    for (const x of [-0.72, -0.5, 0.1, 0.3]) {
      g.box(0.15, 0.2, 0.02, '#ffffff', [x, y, -0.045]);
      b.box(0.17, 0.02, 0.04, STONE_DARK, [x, y - 0.11, -0.04]);
    }
  for (const y of [0.4, 0.82]) for (const z of [-0.65, -0.3]) g.box(0.02, 0.2, 0.18, '#ffffff', [-0.856, y, z]);
  // entrada: escada, porta de vidro, marquise com colunas, letreiro com a cor da nação e as lanternas azuis
  b.box(0.48, 0.03, 0.18, STONE_DARK, [-0.2, 0.115, 0.03]);
  b.box(0.48, 0.03, 0.12, STONE_DARK, [-0.2, 0.145, 0.0]);
  g.box(0.26, 0.32, 0.02, '#ffffff', [-0.2, 0.32, -0.04]);
  b.box(0.012, 0.32, 0.025, DARK, [-0.2, 0.32, -0.035]);
  b.box(0.56, 0.05, 0.3, STONE_DARK, [-0.2, 0.52, 0.08]);
  for (const s2 of [-1, 1]) b.cyl(0.025, 0.025, 0.36, WHITE, [-0.2 + s2 * 0.24, 0.32, 0.2], undefined, 8);
  a.box(0.4, 0.07, 0.01, '#ffffff', [-0.2, 0.585, 0.21]);
  for (const s2 of [-1, 1]) {
    b.box(0.06, 0.09, 0.06, '#2f6bd8', [-0.2 + s2 * 0.2, 0.62, 0.14]);
    b.box(0.07, 0.015, 0.07, DARK, [-0.2 + s2 * 0.2, 0.672, 0.14]);
  }
  // garagem anexa com portão de enrolar
  b.box(0.42, 0.56, 0.7, STONE, [0.66, 0.36, -0.5]);
  b.box(0.44, 0.05, 0.72, STONE_DARK, [0.66, 0.665, -0.5]);
  b.box(0.32, 0.36, 0.02, '#8d939a', [0.66, 0.26, -0.145]);
  for (let k = 0; k < 6; k++) b.box(0.32, 0.008, 0.024, '#737980', [0.66, 0.12 + k * 0.06, -0.14]);
  // telhado: aparelhos de ar-condicionado, torre de rádio treliçada com antenas e a parabólica
  for (const x of [-0.65, -0.4]) {
    b.box(0.18, 0.1, 0.14, '#c9ccc9', [x, 1.15, -0.65]);
    b.cyl(0.05, 0.05, 0.012, DARK, [x, 1.205, -0.65], undefined, 8);
  }
  const mx = 0.2;
  const mz = -0.55;
  for (const [dx, dz] of [
    [-0.06, -0.06],
    [0.06, -0.06],
    [0.06, 0.06],
    [-0.06, 0.06],
  ] as const)
    strut(b, [mx + dx * 1.6, 1.1, mz + dz * 1.6], [mx + dx * 0.4, 1.62, mz + dz * 0.4], 0.008, STEEL, true);
  for (const y of [1.25, 1.42])
    for (const s2 of [-1, 1]) {
      strut(b, [mx - 0.08, y, mz + s2 * 0.06], [mx + 0.08, y + 0.1, mz + s2 * 0.06], 0.005, STEEL);
      strut(b, [mx + s2 * 0.06, y, mz - 0.08], [mx + s2 * 0.06, y + 0.1, mz + 0.08], 0.005, STEEL);
    }
  b.cyl(0.006, 0.006, 0.3, STEEL, [mx, 1.75, mz], undefined, 4);
  b.box(0.02, 0.14, 0.02, '#e8eae8', [mx + 0.04, 1.55, mz + 0.03]);
  b.sphere(0.018, '#d8322a', [mx, 1.9, mz], undefined, 6);
  b.cyl(0.08, 0.05, 0.03, '#e8eae8', [-0.05, 1.18, -0.3], [-0.7, 0, 0], 10);
  // mastro com a bandeira da nação na frente
  b.cyl(0.012, 0.016, 1.0, STEEL, [-0.78, 0.6, 0.22], undefined, 6);
  a.box(0.2, 0.12, 0.008, '#ffffff', [-0.67, 1.02, 0.22]);
  // frades na calçada, cerca viva e as viaturas no pátio
  for (let k = 0; k < 4; k++) b.cyl(0.02, 0.02, 0.1, '#e8eae8', [0.0 + k * 0.25, 0.15, 0.34], undefined, 6);
  b.box(0.5, 0.12, 0.1, '#4f7a3c', [-0.6, 0.15, 0.6]);
  b.box(0.1, 0.12, 0.4, '#4f7a3c', [-0.8, 0.15, 0.4]);
  patrolCar(b, a, g, 0.12, 0.6);
  patrolCar(b, a, g, 0.45, 0.6);
  return { base: l.build(), moving: null, height: 1.6 };
}
