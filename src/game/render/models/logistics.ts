import * as THREE from 'three';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

/**
 * Instalações de comércio (Fase 6): terminal comercial (escritório, pátio de contêineres e
 * empilhadeira de contêiner), porto (cais com defensas e cabeços, portêiner com cavalete em A, estais e carro
 * que corre pela lança até sobre a água, pórtico de pátio, caminhão-trator, armazém e postes altos) e estação ferroviária (plataforma coberta, linhas com dormentes,
 * prédio da estação, sinal e vagões). Também os veículos de carga desenhados no mapa.
 */

type Built = Omit<BuildingModel, 'detail'>;
type V3 = [number, number, number];

const CONTAINER_COLORS = ['#a8432f', '#2f5f8a', '#3f7a46', '#c99a2e', '#6b6f75', '#8a3f6a'];

/** Contêiner com nervuras (comprimento ao longo de x). */
export function box20(b: PartBuilder, pos: V3, color: string, len = 0.6): void {
  const [x, y, z] = pos;
  b.box(len, 0.26, 0.26, color, [x, y + 0.13, z]);
  for (let i = 1; i < 5; i++) b.box(0.012, 0.24, 0.27, color, [x - len / 2 + (i * len) / 5, y + 0.13, z]);
  for (const s of [-1, 1]) b.box(0.02, 0.27, 0.27, '#2b2d30', [x + (s * len) / 2, y + 0.13, z]);
}

function containerStack(b: PartBuilder, x: number, z: number, rows: number, cols: number, tiers: number, seed: number): void {
  let k = seed;
  for (let t = 0; t < tiers; t++)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        k = (k * 31 + 7) % 97;
        if (t > 0 && k % 4 === 0) continue;
        box20(b, [x + c * 0.64, 0.06 + t * 0.27, z + r * 0.29], CONTAINER_COLORS[k % CONTAINER_COLORS.length]!);
      }
}

// ------------------------------------------------------------------ terminal comercial

/** Carreta (cavalo + semirreboque baú) ao longo de z, cabine para +z. */
function dockTruck(b: PartBuilder, g: PartBuilder, x: number, z: number, color: string, accent?: PartBuilder): void {
  b.box(0.08, 0.04, 0.95, '#2b2d30', [x, 0.13, z]);
  b.box(0.23, 0.25, 0.66, color, [x, 0.3, z - 0.13]);
  for (let k = 1; k < 5; k++) b.box(0.235, 0.24, 0.012, '#8d9094', [x, 0.3, z - 0.46 + k * 0.132]);
  accent?.box(0.236, 0.06, 0.5, '#ffffff', [x, 0.36, z - 0.13]);
  b.box(0.22, 0.2, 0.19, '#d9d8d0', [x, 0.25, z + 0.34]);
  b.box(0.2, 0.06, 0.12, '#d9d8d0', [x, 0.38, z + 0.3]);
  g.box(0.2, 0.08, 0.012, '#ffffff', [x, 0.29, z + 0.436]);
  for (const dz of [-0.4, -0.3, 0.2, 0.36]) for (const s of [-1, 1]) b.cyl(0.045, 0.045, 0.04, '#1d1d1d', [x + s * 0.1, 0.08, z + dz], [0, 0, Math.PI / 2], 8);
}

export function buildMarketModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, C.asphalt, [0, 0.03, 0]);
  // armazém de transbordo (cross-dock): docas na face +z com abrigos, para-choques amarelos e numeração
  b.box(2.2, 0.62, 0.86, '#cfd2d0', [-0.75, 0.37, -1.42]);
  for (let i = 0; i < 12; i++) b.box(0.012, 0.6, 0.87, '#b9bdbf', [-1.8 + i * 0.19, 0.37, -1.42]);
  b.box(2.26, 0.05, 0.92, C.roof, [-0.75, 0.7, -1.42]);
  for (const x of [-1.5, -0.75, 0.0]) g.box(0.36, 0.03, 0.2, '#ffffff', [x, 0.735, -1.42]);
  b.box(2.2, 0.16, 0.12, C.concrete, [-0.75, 0.14, -0.94]); // plataforma das docas
  for (let i = 0; i < 6; i++) {
    const x = -1.65 + i * 0.36;
    b.box(0.26, 0.3, 0.02, '#6c7177', [x, 0.3, -0.985]);
    for (let k = 0; k < 4; k++) b.box(0.26, 0.006, 0.024, '#5a5f66', [x, 0.2 + k * 0.07, -0.98]);
    b.box(0.32, 0.36, 0.04, '#26282b', [x, 0.31, -0.975]);
    for (const s of [-1, 1]) b.box(0.03, 0.06, 0.03, C.yellow, [x + s * 0.11, 0.16, -0.87]);
  }
  a.box(1.2, 0.1, 0.02, '#ffffff', [-0.75, 0.58, -0.985]);
  // carretas encostadas nas docas (de ré) e o pátio de manobra
  dockTruck(b, g, -1.65, -0.38, '#e8eae8', a);
  dockTruck(b, g, -0.93, -0.38, '#2f5f8a');
  dockTruck(b, g, -0.21, -0.38, '#e8eae8');
  for (let i = 0; i < 6; i++) b.box(0.025, 0.012, 0.5, '#d9d8d0', [-1.83 + i * 0.36, 0.065, -0.5]);
  // prédio administrativo de dois andares com fachada de vidro e o letreiro da nação no telhado
  b.box(0.7, 0.85, 0.55, '#d9dcd9', [-1.48, 0.49, 0.7]);
  g.box(0.02, 0.62, 0.42, '#ffffff', [-1.12, 0.5, 0.7]);
  for (const y of [0.4, 0.68]) b.box(0.025, 0.03, 0.44, '#9aa0a6', [-1.115, y, 0.7]);
  g.box(0.5, 0.24, 0.02, '#ffffff', [-1.48, 0.62, 0.98]);
  b.box(0.76, 0.05, 0.61, C.roof, [-1.48, 0.94, 0.7]);
  b.box(0.24, 0.14, 0.18, C.steel, [-1.65, 1.03, 0.6]);
  for (const s of [-1, 1]) b.box(0.03, 0.22, 0.03, C.metalDark, [-1.48 + s * 0.25, 1.06, 0.82]);
  a.box(0.6, 0.18, 0.03, '#ffffff', [-1.48, 1.2, 0.82]);
  // portaria com cobertura, cancelas de entrada e saída e a balança rodoviária
  b.box(0.22, 0.28, 0.22, '#d9d8d0', [-0.55, 0.2, 1.55]);
  g.box(0.23, 0.1, 0.18, '#ffffff', [-0.55, 0.26, 1.55]);
  b.box(1.0, 0.04, 0.6, C.roof, [-0.55, 0.62, 1.55]);
  for (const [x, z] of [
    [-1.0, 1.3],
    [-1.0, 1.8],
    [-0.1, 1.3],
    [-0.1, 1.8],
  ] as const)
    b.box(0.04, 0.58, 0.04, C.metalDark, [x, 0.34, z]);
  for (const s of [-1, 1]) {
    b.box(0.06, 0.12, 0.06, '#d9d8d0', [-0.55 + s * 0.15, 0.12, 1.32 + (s > 0 ? 0.45 : 0)]);
    b.box(0.32, 0.025, 0.025, C.red, [-0.55 + s * 0.3, 0.17, 1.32 + (s > 0 ? 0.45 : 0)]);
  }
  b.box(0.3, 0.025, 0.8, '#7d8288', [-0.22, 0.07, 1.2]);
  // pátio de contêineres com a empilhadeira de contêiner (reach stacker)
  containerStack(b, 0.75, -1.75, 3, 2, 3, 5);
  containerStack(b, 0.75, -0.6, 2, 2, 2, 11);
  b.box(0.55, 0.22, 0.3, C.yellow, [1.25, 0.25, 0.55]);
  for (const s of [-1, 1]) for (const dx of [-0.18, 0.18]) b.cyl(0.09, 0.09, 0.06, C.rubber, [1.25 + dx, 0.15, 0.55 + s * 0.16], [Math.PI / 2, 0, 0], 8);
  b.box(0.18, 0.2, 0.2, '#2a3a44', [1.1, 0.46, 0.55]);
  strut(b, [1.35, 0.4, 0.55], [0.8, 0.9, 0.55], 0.07, C.yellow);
  b.box(0.08, 0.06, 0.34, '#2b2d30', [0.77, 0.86, 0.55]);
  box20(b, [0.77, 0.56, 0.55], CONTAINER_COLORS[1]!, 0.56);
  // vagas de carretas na frente, uma carreta estacionada, e os postes altos de iluminação
  for (let i = 0; i < 5; i++) b.box(0.025, 0.012, 0.8, '#d9d8d0', [0.25 + i * 0.36, 0.065, 1.45]);
  dockTruck(b, g, 0.79, 1.4, '#a8432f');
  for (const [x, z] of [
    [1.82, 1.82],
    [0.2, -0.05],
  ] as const) {
    strut(b, [x, 0.06, z], [x, 1.45, z], 0.035, C.steel, true);
    b.box(0.3, 0.05, 0.1, '#f2e6a0', [x - 0.12, 1.45, z]);
  }
  return { base: l.build(), moving: null, height: 1.5 };
}

// ------------------------------------------------------------------ porto

export function buildPortModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const CRANE = '#c8402f';
  // pátio do terminal (a margem da água fica do lado +z do modelo — o porto é girado pelo jogo para a água)
  b.box(3.9, 0.18, 3.9, '#8d8a82', [0, 0.09, 0]);
  b.box(3.9, 0.012, 1.3, '#9a978f', [0, 0.186, 1.25]); // faixa do cais, concreto mais claro
  // muro do cais com a face escura, defensas cilíndricas de borracha e cabeços de amarração
  b.box(3.9, 0.34, 0.12, '#5f5c57', [0, 0.02, 1.92]);
  b.box(3.9, 0.04, 0.16, '#a6a39b', [0, 0.18, 1.9]);
  for (let i = 0; i < 6; i++) {
    const x = -1.6 + i * 0.64;
    b.cyl(0.07, 0.07, 0.3, '#1d1d1d', [x, 0.02, 2.02], undefined, 8);
    b.cyl(0.04, 0.05, 0.08, '#2b2d30', [x + 0.25, 0.22, 1.8], undefined, 8);
    b.cyl(0.065, 0.065, 0.025, '#2b2d30', [x + 0.25, 0.27, 1.8], undefined, 8);
  }
  for (let i = 0; i < 10; i++) b.box(0.18, 0.012, 0.04, C.yellow, [-1.75 + i * 0.4, 0.195, 1.66]);
  // trilhos do portêiner e faixas de pista dos caminhões sob a ponte
  for (const z of [0.75, 1.55]) {
    b.box(3.8, 0.02, 0.05, C.metal, [0, 0.2, z]);
    b.box(3.8, 0.01, 0.1, '#6f6c66', [0, 0.19, z]);
  }
  for (const z of [1.0, 1.3]) b.box(3.6, 0.008, 0.02, '#e8e6dc', [0, 0.194, z]);

  // portêiner (guindaste de cais): pórtico de quatro pernas sobre truques, contraventamento, cavalete em A com os
  // estais, lança dupla que sai sobre a água e a casa de máquinas na contralança
  const px = 0.55;
  const top = 1.55;
  for (const sx of [-1, 1]) {
    const x = px + sx * 0.45;
    for (const z of [0.75, 1.55]) {
      strut(b, [x, 0.3, z], [x, top, z], 0.075, CRANE);
      b.box(0.14, 0.1, 0.22, '#3a3d40', [x, 0.25, z]);
      for (const dz of [-0.07, 0.07]) b.cyl(0.035, 0.035, 0.05, '#1d1d1d', [x, 0.235, z + dz], [0, 0, Math.PI / 2], 6);
    }
    strut(b, [x, 0.45, 0.75], [x, 0.45, 1.55], 0.05, CRANE); // viga de soleira
    strut(b, [x, 0.5, 0.75], [x, 1.45, 1.55], 0.03, CRANE);
    strut(b, [x, 1.0, 0.75], [x, 1.0, 1.55], 0.04, CRANE);
  }
  for (const z of [0.75, 1.55]) strut(b, [px - 0.45, top, z], [px + 0.45, top, z], 0.07, CRANE);
  a.box(0.82, 0.08, 0.02, '#ffffff', [px, top, 1.6]);
  // lança e contralança: duas vigas-caixão da retaguarda (z −0.45) até a ponta sobre a água (z 3.0)
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.1, 3.45, CRANE, [px + sx * 0.14, top + 0.1, 1.27]);
    for (let k = 0; k < 7; k++) b.box(0.3, 0.025, 0.025, CRANE, [px, top + 0.06, -0.3 + k * 0.5]);
  }
  // cavalete em A sobre o pórtico e os estais até a ponta da lança e a contralança
  const apex: V3 = [px, 2.45, 1.05];
  for (const sx of [-1, 1]) {
    strut(b, [px + sx * 0.45, top, 0.75], [px + sx * 0.1, apex[1], apex[2]], 0.05, CRANE);
    strut(b, [px + sx * 0.45, top, 1.55], [px + sx * 0.1, apex[1], apex[2]], 0.05, CRANE);
    strut(b, [px + sx * 0.1, apex[1], apex[2]], [px + sx * 0.14, top + 0.15, 2.95], 0.016, '#3a3d40', true);
    strut(b, [px + sx * 0.1, apex[1], apex[2]], [px + sx * 0.14, top + 0.15, 2.05], 0.012, '#3a3d40', true);
    strut(b, [px + sx * 0.1, apex[1], apex[2]], [px + sx * 0.14, top + 0.15, -0.4], 0.016, '#3a3d40', true);
  }
  b.box(0.28, 0.08, 0.1, CRANE, [px, apex[1], apex[2]]);
  b.sphere(0.03, '#d8322a', [px, apex[1] + 0.07, apex[2]], undefined, 6);
  // casa de máquinas na contralança, com a faixa da nação
  b.box(0.5, 0.3, 0.42, '#d9d8d0', [px, top + 0.3, -0.2]);
  b.box(0.54, 0.03, 0.46, '#8b9198', [px, top + 0.465, -0.2]);
  a.box(0.502, 0.07, 0.3, '#ffffff', [px, top + 0.36, -0.2]);
  // caminhão-trator com a carreta sob o portêiner, esperando o contêiner
  b.box(0.22, 0.18, 0.22, '#e3e5e2', [px - 0.62, 0.32, 1.15]);
  g.box(0.02, 0.08, 0.18, '#ffffff', [px - 0.735, 0.36, 1.15]);
  b.box(0.8, 0.04, 0.2, '#2b2d30', [px - 0.1, 0.26, 1.15]);
  for (const dx of [-0.62, -0.05, 0.22]) for (const s2 of [-1, 1]) b.cyl(0.045, 0.045, 0.04, '#1d1d1d', [px + dx, 0.23, 1.15 + s2 * 0.1], [Math.PI / 2, 0, 0], 8);
  box20(b, [px - 0.08, 0.28, 1.15], CONTAINER_COLORS[2]!, 0.6);

  // pátio de contêineres em blocos e o pórtico de pátio (RTG) sobre um dos blocos
  containerStack(b, 0.25, -1.7, 2, 3, 3, 3);
  containerStack(b, 0.25, -0.75, 2, 3, 2, 9);
  const rx = 0.89;
  for (const sx of [-1, 1])
    for (const z of [-1.95 + 0.12, -1.1]) {
      strut(b, [rx + sx * 0.98, 0.26, z], [rx + sx * 0.98, 1.15, z], 0.04, C.yellow);
      b.cyl(0.06, 0.06, 0.06, '#1d1d1d', [rx + sx * 0.98, 0.24, z], [Math.PI / 2, 0, 0], 8);
    }
  for (const sx of [-1, 1]) b.box(0.08, 0.08, 0.84, C.yellow, [rx + sx * 0.98, 1.17, -1.47]);
  for (const z of [-1.83, -1.1]) b.box(2.04, 0.08, 0.08, C.yellow, [rx, 1.17, z]);
  b.box(0.2, 0.14, 0.24, '#d9d8d0', [rx + 0.3, 1.1, -1.47]);
  g.box(0.21, 0.06, 0.2, '#ffffff', [rx + 0.3, 1.07, -1.47]);

  // armazém de carga (galpão) com portas de enrolar, nervuras e o letreiro
  b.box(1.4, 0.7, 1.0, '#9ca2a8', [-1.15, 0.53, -1.35]);
  b.gable(1.5, 1.1, 0.26, C.roof, [-1.15, 0.88, -1.35]);
  for (let i = 0; i < 8; i++) b.box(0.012, 0.69, 1.01, '#878d93', [-1.8 + i * 0.185, 0.53, -1.35]);
  for (const x of [-1.5, -0.85]) {
    b.box(0.36, 0.42, 0.03, '#6c7177', [x, 0.39, -0.84]);
    for (let k = 0; k < 5; k++) b.box(0.36, 0.008, 0.035, '#5a5f66', [x, 0.22 + k * 0.08, -0.835]);
  }
  a.box(0.9, 0.11, 0.02, '#ffffff', [-1.15, 0.78, -0.84]);
  // guarita com cancela e os postes altos de iluminação do pátio
  b.box(0.3, 0.32, 0.3, '#d9d8d0', [-1.65, 0.34, 0.2]);
  g.box(0.31, 0.1, 0.2, '#ffffff', [-1.65, 0.4, 0.2]);
  b.box(0.34, 0.03, 0.34, C.roof, [-1.65, 0.515, 0.2]);
  b.box(0.7, 0.03, 0.03, C.red, [-1.15, 0.36, 0.4]);
  for (const [x, z] of [
    [-0.45, 0.25],
    [1.8, -0.35],
  ] as const) {
    strut(b, [x, 0.18, z], [x, 2.1, z], 0.035, C.steel, true);
    b.cyl(0.14, 0.14, 0.04, C.metalDark, [x, 2.12, z], undefined, 8);
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + 0.4;
      b.box(0.08, 0.03, 0.05, '#f2e6a0', [x + Math.cos(ang) * 0.12, 2.09, z + Math.sin(ang) * 0.12], [0, -ang, 0]);
    }
  }

  // carro do portêiner: cabine do operador, cabos, spreader e o contêiner, indo do pátio até sobre a água
  const trolley = layers();
  trolley.body.box(0.36, 0.12, 0.26, '#3a3d40', [0, 0, 0]);
  trolley.body.box(0.16, 0.14, 0.18, '#d9d8d0', [0.12, -0.14, 0.05]);
  trolley.glass.box(0.165, 0.07, 0.16, '#ffffff', [0.12, -0.15, 0.06]);
  for (const dx of [-0.08, 0.08]) strut(trolley.body, [dx, -0.05, -0.04], [dx, -0.72, -0.04], 0.008, '#26282b', true);
  trolley.body.box(0.62, 0.05, 0.22, C.yellow, [0, -0.75, -0.04]);
  box20(trolley.body, [0, -1.03, -0.04], CONTAINER_COLORS[0]!, 0.56);
  const anims: ModelAnim[] = [{ layers: trolley.build(), pivot: [px, top + 0.02, 0.4], motion: { kind: 'shuttle', dir: [0, 0, 1], length: 2.2, speed: 0.4 } }];
  return { base: l.build(), moving: null, anims, height: 2.5 };
}

// ------------------------------------------------------------------ estação ferroviária

function track(b: PartBuilder, z: number, x0: number, x1: number): void {
  // lastro com os ombros, dormentes de concreto e trilhos com a base mais escura
  b.box(x1 - x0 + 0.1, 0.03, 0.56, '#8a8478', [(x0 + x1) / 2, 0.08, z]);
  for (let x = x0; x <= x1; x += 0.18) b.box(0.07, 0.03, 0.42, '#a9a59c', [x, 0.1, z]);
  for (const s of [-1, 1]) {
    b.box(x1 - x0 + 0.1, 0.01, 0.045, '#4a4c4e', [(x0 + x1) / 2, 0.115, z + s * 0.14]);
    b.box(x1 - x0 + 0.1, 0.03, 0.022, C.steel, [(x0 + x1) / 2, 0.13, z + s * 0.14]);
  }
}

/** Truque ferroviário (duas rodas por lado) centrado em (x, z). */
function bogie(b: PartBuilder, x: number, y: number, z: number): void {
  b.box(0.24, 0.05, 0.24, '#2b2d30', [x, y + 0.1, z]);
  for (const dx of [-0.07, 0.07]) for (const s of [-1, 1]) b.cyl(0.055, 0.055, 0.025, '#1d1d1d', [x + dx, y + 0.07, z + s * 0.13], [Math.PI / 2, 0, 0], 6);
}

/** Vagão (comprimento ao longo de x). */
export function wagon(b: PartBuilder, x: number, y: number, z: number, kind: 'box' | 'tank' | 'loco' | 'flat', color: string): void {
  b.box(0.82, 0.05, 0.3, '#2b2d30', [x, y + 0.15, z]);
  for (const dx of [-0.26, 0.26]) bogie(b, x + dx, y, z);
  for (const s of [-1, 1]) b.box(0.04, 0.03, 0.05, '#1d1d1d', [x + s * 0.43, y + 0.15, z]); // engates
  if (kind === 'tank') {
    b.cyl(0.14, 0.14, 0.74, color, [x, y + 0.33, z], [0, 0, Math.PI / 2], 10);
    for (const s of [-1, 1]) b.sphere(0.14, color, [x + s * 0.37, y + 0.33, z], [0.25, 1, 1], 8);
    b.cyl(0.06, 0.06, 0.06, '#2b2d30', [x, y + 0.49, z], undefined, 8);
    b.box(0.5, 0.012, 0.1, '#5a5f66', [x, y + 0.475, z]);
  } else if (kind === 'loco') {
    // locomotiva diesel de cabine: capô longo com grades, cabine com janelas, faixas na frente e tanque
    b.box(0.56, 0.26, 0.24, color, [x - 0.12, y + 0.3, z]);
    for (let k = 0; k < 4; k++) b.box(0.08, 0.14, 0.245, '#3a3d40', [x - 0.34 + k * 0.13, y + 0.32, z]);
    b.box(0.22, 0.34, 0.3, color, [x + 0.27, y + 0.34, z]);
    b.box(0.24, 0.03, 0.31, '#3a3d40', [x + 0.27, y + 0.525, z]);
    b.box(0.012, 0.09, 0.24, '#2a3a44', [x + 0.385, y + 0.43, z]);
    for (const s of [-1, 1]) b.box(0.12, 0.08, 0.012, '#2a3a44', [x + 0.27, y + 0.43, z + s * 0.152]);
    b.box(0.012, 0.06, 0.3, C.yellow, [x + 0.385, y + 0.24, z]);
    b.box(0.3, 0.07, 0.2, '#2b2d30', [x, y + 0.11, z]);
    b.cyl(0.03, 0.03, 0.05, '#2b2d30', [x - 0.25, y + 0.46, z], undefined, 6);
    for (const s of [-1, 1]) b.box(0.6, 0.012, 0.012, C.yellow, [x - 0.08, y + 0.4, z + s * 0.14]);
  } else if (kind === 'flat') {
    b.box(0.8, 0.04, 0.3, '#5a5f66', [x, y + 0.19, z]);
  } else {
    b.box(0.8, 0.3, 0.3, color, [x, y + 0.33, z]);
    const rib = `#${new THREE.Color(color).multiplyScalar(0.72).getHexString()}`;
    for (let k = 0; k < 6; k++) b.box(0.012, 0.29, 0.305, rib, [x - 0.33 + k * 0.132, y + 0.33, z]);
    b.box(0.22, 0.26, 0.31, '#3a3d40', [x, y + 0.31, z]);
    b.box(0.82, 0.03, 0.31, '#5a5f66', [x, y + 0.49, z]);
  }
}

export function buildRailStationModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#6f6a60', [0, 0.03, 0]);
  track(b, 0.55, -1.9, 1.9);
  track(b, 1.35, -1.9, 1.9);
  // plataforma com borda de concreto, faixa tátil amarela, bancos, postes e placas
  b.box(3.6, 0.2, 0.62, C.concrete, [0, 0.13, -0.02]);
  b.box(3.6, 0.03, 0.08, '#d9d8d0', [0, 0.235, 0.27]);
  b.box(3.6, 0.012, 0.05, C.yellow, [0, 0.24, 0.19]);
  for (const x of [-1.2, 0.3]) {
    b.box(0.26, 0.03, 0.08, C.woodDark, [x, 0.33, -0.2]);
    for (const s of [-1, 1]) b.box(0.03, 0.09, 0.07, C.metalDark, [x + s * 0.1, 0.28, -0.2]);
  }
  // cobertura da plataforma: pilares, vigas em balanço, telhado inclinado com calha
  for (let i = 0; i < 5; i++) {
    const x = -1.5 + i * 0.75;
    b.box(0.05, 0.62, 0.05, C.metalDark, [x, 0.54, -0.18]);
    strut(b, [x, 0.8, -0.18], [x, 0.86, 0.22], 0.03, C.metalDark);
  }
  b.box(3.5, 0.04, 0.66, '#6f7a85', [0, 0.87, 0.0], [-0.08, 0, 0]);
  b.box(3.5, 0.05, 0.05, C.metalDark, [0, 0.85, 0.32]);
  a.box(3.5, 0.05, 0.012, '#ffffff', [0, 0.87, 0.34]);
  for (const x of [-0.75, 1.0]) {
    b.box(0.3, 0.1, 0.02, '#1f3a5f', [x, 0.72, 0.15]);
    b.box(0.012, 0.12, 0.012, C.metalDark, [x, 0.8, 0.15]);
  }
  // prédio da estação: bloco central de dois andares com torre do relógio e alas térreas
  const sx = -0.6;
  const sz = -1.15;
  const WALL = '#d8c8a8';
  const TRIM = '#efe6d2';
  b.box(0.8, 0.95, 0.75, WALL, [sx, 0.53, sz]);
  b.gable(0.9, 0.85, 0.3, C.roofRed, [sx, 1.0, sz], Math.PI / 2);
  for (const s of [-1, 1]) {
    b.box(0.55, 0.55, 0.62, WALL, [sx + s * 0.67, 0.33, sz]);
    b.gable(0.62, 0.7, 0.22, C.roofRed, [sx + s * 0.67, 0.6, sz]);
    for (const dx of [-0.13, 0.13]) {
      g.box(0.13, 0.24, 0.02, '#ffffff', [sx + s * 0.67 + dx, 0.36, sz + 0.315]);
      b.box(0.17, 0.03, 0.03, TRIM, [sx + s * 0.67 + dx, 0.5, sz + 0.32]);
    }
  }
  b.box(0.82, 0.04, 0.77, TRIM, [sx, 0.62, sz]);
  for (const dx of [-0.2, 0.2]) g.box(0.14, 0.2, 0.02, '#ffffff', [sx + dx, 0.8, sz + 0.38]);
  b.box(0.26, 0.4, 0.03, C.woodDark, [sx, 0.28, sz + 0.38]);
  b.box(0.34, 0.04, 0.18, TRIM, [sx, 0.5, sz + 0.46]);
  a.box(0.6, 0.09, 0.02, '#ffffff', [sx, 0.56, sz + 0.383]);
  // torre do relógio sobre o bloco central
  b.box(0.26, 0.36, 0.26, WALL, [sx, 1.28, sz]);
  for (const [dx, dz, ry] of [
    [0, 0.135, 0],
    [0.135, 0, Math.PI / 2],
  ] as const) {
    b.cyl(0.08, 0.08, 0.02, '#f0eee6', [sx + dx, 1.32, sz + dz], [Math.PI / 2, 0, ry], 12);
    b.box(0.012, 0.06, 0.025, '#1d1d1d', [sx + dx, 1.34, sz + dz + (dz ? 0.012 : 0)], [0, ry, 0]);
  }
  b.cyl(0.02, 0.21, 0.18, C.roofRed, [sx, 1.55, sz], [0, Math.PI / 4, 0], 4);
  // passarela sobre as linhas: escada na plataforma, ponte e escada do outro lado
  const fx = 1.35;
  for (const z of [-0.3, 1.82]) {
    for (const s of [-1, 1]) b.box(0.04, 0.9, 0.04, C.metalDark, [fx + s * 0.12, 0.55, z]);
  }
  b.box(0.32, 0.06, 2.2, '#8d939a', [fx, 1.0, 0.76]);
  for (const s of [-1, 1]) b.box(0.012, 0.14, 2.2, '#c9ccc9', [fx + s * 0.15, 1.1, 0.76]);
  strut(b, [fx - 0.35, 0.24, -0.25], [fx - 0.06, 0.98, -0.25], 0.09, '#8d939a');
  for (const s of [-1, 1]) b.box(0.05, 0.86, 0.05, C.metalDark, [fx + s * 0.12, 0.53, 0.95]); // pilar entre as linhas
  // pátio de carga: pórtico amarelo sobre a pilha de contêineres
  for (const x of [0.55, 1.75]) {
    for (const z of [-1.75, -0.75]) strut(b, [x, 0.06, z], [x, 0.95, z], 0.05, C.yellow);
    strut(b, [x, 0.95, -1.75], [x, 0.95, -0.75], 0.06, C.yellow);
  }
  b.box(1.3, 0.1, 0.12, C.yellow, [1.15, 1.0, -1.25]);
  b.box(0.22, 0.12, 0.2, '#3a3d40', [1.0, 0.92, -1.25]);
  containerStack(b, 0.85, -1.55, 2, 1, 2, 7);
  // sinal ferroviário de três focos no fim da plataforma
  strut(b, [1.85, 0.06, 0.25], [1.85, 0.95, 0.25], 0.03, C.metalDark, true);
  b.box(0.1, 0.28, 0.07, '#1d1d1d', [1.85, 0.88, 0.25]);
  b.sphere(0.022, C.red, [1.85, 0.96, 0.29]);
  b.sphere(0.022, C.yellow, [1.85, 0.88, 0.29]);
  b.sphere(0.022, '#3fbf5a', [1.85, 0.8, 0.29]);
  // composição estacionada na linha 2: locomotiva, vagão fechado, tanque e plataforma com contêiner
  wagon(b, -1.4, 0.06, 1.35, 'loco', '#2f5f8a');
  a.box(0.02, 0.1, 0.24, '#ffffff', [-0.98, 0.38, 1.35]);
  wagon(b, -0.52, 0.06, 1.35, 'box', '#8a4b32');
  wagon(b, 0.36, 0.06, 1.35, 'tank', '#2b2d30');
  wagon(b, 1.24, 0.06, 1.35, 'flat', '#5a5f66');
  box20(b, [1.24, 0.27, 1.35], CONTAINER_COLORS[2]!, 0.62);
  railing(b, [1.95, -1.9], [1.95, -0.4], 0.06, 0.3, '#8d9196', 3);
  return { base: l.build(), moving: null, height: 1.6 };
}

// ------------------------------------------------------------------ veículos de carga (mapa)

/** Modelo de um veículo de carga por modal (frente para +x), em escala do mapa. */
export function cargoVehicle(mode: 'road' | 'sea' | 'air' | 'caravan'): ModelLayers {
  const l = layers();
  if (mode === 'caravan') {
    boxTruck(l);
    return l.build();
  }
  const { body: b, glass: g, accent: a } = l;
  if (mode === 'road') {
    semiTruck(l);
  } else if (mode === 'sea') {
    // navio porta-contêineres: casco, superestrutura e pilhas no convés
    b.side(
      [
        [-1.6, 0],
        [1.3, 0],
        [1.75, 0.35],
        [-1.7, 0.35],
      ],
      0.75,
      '#2b3440',
      [0, -0.05, 0],
    );
    b.box(3.2, 0.04, 0.7, '#a8432f', [0, -0.03, 0]);
    b.box(0.5, 0.55, 0.62, '#e6e6e0', [-1.25, 0.6, 0]);
    g.box(0.51, 0.08, 0.6, '#ffffff', [-1.25, 0.78, 0]);
    b.cyl(0.06, 0.07, 0.3, '#2b2d30', [-1.4, 1.0, 0], undefined, 8);
    for (let i = 0; i < 4; i++) for (const z of [-0.15, 0.15]) box20(b, [-0.6 + i * 0.55, 0.32, z], CONTAINER_COLORS[(i * 2 + (z > 0 ? 1 : 0)) % CONTAINER_COLORS.length]!, 0.5);
    a.box(0.3, 0.12, 0.02, '#ffffff', [-1.25, 0.6, 0.315]);
  } else {
    // helicóptero de carga com contêiner no gancho
    b.box(0.9, 0.3, 0.32, '#4f5a50', [0, 0.9, 0]);
    g.box(0.2, 0.18, 0.3, '#ffffff', [0.42, 0.95, 0]);
    b.box(0.9, 0.08, 0.08, '#4f5a50', [-0.85, 0.98, 0]);
    b.box(0.04, 0.22, 0.04, '#4f5a50', [-1.28, 1.06, 0]);
    b.cyl(0.9, 0.9, 0.02, '#26282b', [0, 1.12, 0], undefined, 12); // rotor (disco translúcido no material comum)
    strut(b, [0, 0.75, 0], [0, 0.35, 0], 0.012, '#26282b', true);
    box20(b, [0, 0.07, 0], CONTAINER_COLORS[2]!, 0.55);
    a.box(0.3, 0.06, 0.33, '#ffffff', [-0.2, 0.9, 0]);
  }
  return l.build();
}

// ------------------------------------------------------------------ caminhões (comboio e caravana)

type Layers = ReturnType<typeof layers>;

const TIRE = '#111211';
const HUB = '#b8bcc0';
const CHASSIS = '#26282b';
const LAMP = '#f3eed2';
const SIGNAL = '#e08a2a';
const TAIL = '#a3241c';

/** Roda com pneu, aro e cubo (eixo ao longo de z); `dual` desenha a roda dupla do eixo traseiro. */
function truckWheel(b: PartBuilder, x: number, z: number, r: number, dual = false): void {
  const s = Math.sign(z);
  const w = dual ? 0.22 : 0.15;
  b.cyl(r, r, w, TIRE, [x, r, z], [Math.PI / 2, 0, 0], 14);
  b.cyl(r * 0.58, r * 0.58, 0.02, HUB, [x, r, z + s * (w / 2 + 0.005)], [Math.PI / 2, 0, 0], 12);
  b.cyl(r * 0.2, r * 0.2, 0.03, '#6f747a', [x, r, z + s * (w / 2 + 0.02)], [Math.PI / 2, 0, 0], 8);
  if (dual) b.box(0.012, r * 1.6, 0.012, '#111', [x, r, z]);
}

/** Para-lama sobre a roda. */
function fender(b: PartBuilder, x: number, z: number, r: number, len = 0.55): void {
  b.box(len, 0.04, 0.22, CHASSIS, [x, r * 2 + 0.06, z]);
  b.box(0.04, 0.12, 0.22, CHASSIS, [x - len / 2, r * 2, z]);
}

/** Grade frontal com frisos horizontais (frente em `x`). */
function grille(b: PartBuilder, x: number, y: number, h: number, w: number, slats: number, color = '#2a2c2f', slat = '#9aa0a6'): void {
  b.box(0.03, h, w, color, [x, y, 0]);
  for (let i = 0; i < slats; i++) b.box(0.035, 0.018, w - 0.06, slat, [x + 0.005, y - h / 2 + ((i + 0.5) * h) / slats, 0]);
}

/**
 * Caravana interna: caminhão-baú de entregas (frente para +x), com a cabine na cor da nação,
 * para-choque com protetor, barra de faróis no teto, baú com faixas da nação e portas traseiras.
 * Do tamanho de um blindado leve (≈2,8 × 1,0 × 1,4).
 */
function boxTruck(l: Layers): void {
  const { body: b, accent: a, glass: g } = l;
  const r = 0.21;
  // chassi, rodas (dianteira simples, traseira dupla) e para-lamas
  b.box(2.55, 0.12, 0.7, CHASSIS, [-0.05, r + 0.14, 0]);
  for (const z of [-0.43, 0.43]) {
    truckWheel(b, 0.86, z, r);
    truckWheel(b, -0.78, z, r, true);
    fender(b, 0.86, z, r, 0.5);
    fender(b, -0.78, z, r, 0.56);
  }
  // cabine (perfil lateral) na cor da nação: capô curto, para-brisa inclinado e teto
  a.side(
    [
      [0.4, 0.42],
      [1.3, 0.42],
      [1.32, 0.66],
      [1.06, 0.72],
      [0.95, 1.12],
      [0.4, 1.14],
    ],
    1.0,
    '#ffffff',
  );
  b.box(0.92, 0.03, 1.01, '#d9dadc', [0.86, 0.43, 0]); // soleira clara
  b.box(0.34, 0.022, 0.9, '#ffffff', [1.18, 0.705, 0], [0, 0, -0.22]); // faixa clara no capô
  // vidros: para-brisa, janelas laterais e quebra-vento
  g.box(0.02, 0.4, 0.88, '#ffffff', [1.0, 0.93, 0], [0, 0, -0.26]);
  for (const s of [-1, 1]) {
    g.box(0.36, 0.26, 0.02, '#ffffff', [0.72, 0.92, s * 0.501]);
    g.box(0.08, 0.18, 0.02, '#ffffff', [0.95, 0.88, s * 0.501]);
    b.box(0.03, 0.42, 0.02, '#2a2c2f', [0.53, 0.82, s * 0.502]); // vão da porta
    b.box(0.06, 0.02, 0.02, '#c9cdd1', [0.6, 0.74, s * 0.505]); // maçaneta
    // retrovisor com braço
    b.box(0.14, 0.02, 0.02, '#2a2c2f', [1.0, 0.98, s * 0.56]);
    b.box(0.04, 0.17, 0.08, '#2a2c2f', [1.07, 0.95, s * 0.63]);
    // degrau
    b.box(0.22, 0.03, 0.08, '#3c4046', [0.62, 0.38, s * 0.52]);
  }
  // frente: grade, faróis duplos, piscas, para-choque e protetor de grade
  grille(b, 1.33, 0.55, 0.18, 0.6, 4);
  for (const s of [-1, 1]) {
    b.box(0.04, 0.09, 0.15, LAMP, [1.33, 0.58, s * 0.39]);
    b.box(0.04, 0.05, 0.09, SIGNAL, [1.33, 0.5, s * 0.41]);
  }
  b.box(0.1, 0.1, 1.02, '#9ea3a8', [1.38, 0.38, 0]);
  for (const z of [-0.3, 0, 0.3]) b.box(0.04, 0.26, 0.04, '#b8bcc0', [1.44, 0.53, z]);
  b.box(0.04, 0.04, 0.9, '#b8bcc0', [1.44, 0.66, 0]);
  // barra de faróis auxiliares no teto
  b.box(0.06, 0.06, 0.7, '#b8bcc0', [0.9, 1.2, 0]);
  for (const z of [-0.26, -0.1, 0.1, 0.26]) b.cyl(0.04, 0.04, 0.03, LAMP, [0.94, 1.2, z], [0, 0, Math.PI / 2], 10);
  // baú de carga com avanço sobre a cabine
  const bx0 = -1.4;
  const bx1 = 0.38;
  const bodyC = '#e6e4dd';
  b.box(bx1 - bx0, 0.9, 1.06, bodyC, [(bx0 + bx1) / 2, 0.96, 0]);
  b.box(0.3, 0.28, 1.06, bodyC, [bx1 + 0.15, 1.27, 0]); // avanço sobre o teto da cabine
  for (const s of [-1, 1]) {
    a.box(bx1 - bx0 + 0.3, 0.07, 0.01, '#ffffff', [(bx0 + bx1 + 0.3) / 2, 1.22, s * 0.536]); // faixa alta
    a.box(bx1 - bx0, 0.05, 0.01, '#ffffff', [(bx0 + bx1) / 2, 0.66, s * 0.536]); // faixa baixa
    b.box(bx1 - bx0, 0.04, 0.012, '#b7b5ad', [(bx0 + bx1) / 2, 0.52, s * 0.536]); // perfil inferior
  }
  a.box(bx1 - bx0 + 0.3, 0.012, 0.5, '#ffffff', [(bx0 + bx1 + 0.3) / 2, 1.415, 0]); // faixa no teto
  b.box(0.04, 0.88, 1.06, '#cfcdc5', [bx0 - 0.01, 0.96, 0]); // traseira
  b.box(0.045, 0.86, 0.015, '#9a988f', [bx0 - 0.02, 0.96, 0]); // divisão das portas
  for (const z of [-0.12, 0.12]) b.box(0.05, 0.5, 0.02, '#8f9399', [bx0 - 0.03, 0.94, z]); // trincos
  for (const s of [-1, 1]) {
    b.box(0.04, 0.1, 0.08, TAIL, [bx0 - 0.02, 0.6, s * 0.44]);
    b.box(0.04, 0.05, 0.08, SIGNAL, [bx0 - 0.02, 0.69, s * 0.44]);
  }
  b.box(0.08, 0.08, 0.9, '#3c4046', [bx0 - 0.02, 0.36, 0]); // para-choque traseiro
  // tanque de combustível e caixa de ferramentas sob o baú
  b.cyl(0.11, 0.11, 0.42, '#9aa0a6', [0.05, 0.33, 0.36], [0, 0, Math.PI / 2], 10);
  b.box(0.36, 0.18, 0.2, '#3c4046', [-0.25, 0.33, -0.36]);
}

/**
 * Comboio do comércio: cavalo mecânico de cabine avançada na cor da nação, com defletor no teto,
 * e carreta baú de três eixos (frente para +x). ≈4,7 × 1,0 × 1,6.
 */
function semiTruck(l: Layers): void {
  const { body: b, accent: a, glass: g } = l;
  const r = 0.21;
  // cavalo mecânico: chassi, eixo dianteiro e dois traseiros
  b.box(1.75, 0.12, 0.66, CHASSIS, [1.25, r + 0.14, 0]);
  for (const z of [-0.42, 0.42]) {
    truckWheel(b, 1.85, z, r);
    truckWheel(b, 0.92, z, r, true);
    truckWheel(b, 0.47, z, r, true);
    fender(b, 1.85, z, r, 0.48);
    b.box(0.95, 0.04, 0.24, CHASSIS, [0.7, r * 2 + 0.07, z]);
  }
  // cabine avançada (perfil) na cor da nação, com defletor de ar e para-sol
  a.side(
    [
      [1.38, 0.44],
      [2.17, 0.44],
      [2.19, 1.0],
      [2.12, 1.42],
      [1.38, 1.42],
    ],
    1.0,
    '#ffffff',
  );
  a.side(
    [
      [1.4, 1.42],
      [1.95, 1.42],
      [1.6, 1.68],
      [1.4, 1.7],
    ],
    0.9,
    '#ffffff',
  );
  b.box(0.06, 0.05, 1.0, '#2a2c2f', [2.15, 1.38, 0]); // para-sol
  b.box(0.82, 0.04, 1.01, '#2a2c2f', [1.79, 0.46, 0]); // faixa escura inferior
  g.box(0.02, 0.36, 0.9, '#ffffff', [2.17, 1.17, 0], [0, 0, -0.08]);
  for (const s of [-1, 1]) {
    g.box(0.3, 0.3, 0.02, '#ffffff', [1.93, 1.14, s * 0.501]);
    b.box(0.03, 0.62, 0.02, '#2a2c2f', [1.72, 0.85, s * 0.502]);
    b.box(0.06, 0.02, 0.02, '#c9cdd1', [1.78, 0.93, s * 0.505]);
    b.box(0.16, 0.02, 0.02, '#2a2c2f', [2.1, 1.2, s * 0.57]);
    b.box(0.04, 0.2, 0.08, '#2a2c2f', [2.18, 1.15, s * 0.64]);
    b.box(0.26, 0.03, 0.1, '#3c4046', [1.85, 0.6, s * 0.52]);
    b.box(0.26, 0.03, 0.1, '#3c4046', [1.85, 0.42, s * 0.52]); // degraus
    b.cyl(0.12, 0.12, 0.38, '#b8bcc0', [1.2, 0.36, s * 0.38], [0, 0, Math.PI / 2], 12); // tanques
  }
  grille(b, 2.2, 0.75, 0.32, 0.62, 6);
  for (const s of [-1, 1]) {
    b.box(0.04, 0.08, 0.17, LAMP, [2.2, 0.55, s * 0.36]);
    b.box(0.04, 0.08, 0.06, SIGNAL, [2.2, 0.55, s * 0.47]);
  }
  b.box(0.12, 0.14, 1.02, '#2a2c2f', [2.23, 0.42, 0]); // para-choque
  b.box(0.42, 0.04, 0.4, '#3c4046', [0.7, 0.62, 0]); // quinta roda
  b.cyl(0.04, 0.04, 0.5, '#9aa0a6', [1.32, 1.6, 0.38], undefined, 8); // escapamento
  // carreta baú
  const t0 = -2.55;
  const t1 = 1.25;
  b.box(t1 - t0, 0.08, 0.6, CHASSIS, [(t0 + t1) / 2, 0.6, 0]);
  b.box(t1 - t0, 1.0, 1.04, '#d8d2c4', [(t0 + t1) / 2, 1.16, 0]);
  for (const s of [-1, 1]) {
    b.box(t1 - t0, 0.04, 0.012, '#a9a395', [(t0 + t1) / 2, 0.68, s * 0.526]);
    b.box(t1 - t0, 0.04, 0.012, '#a9a395', [(t0 + t1) / 2, 1.64, s * 0.526]);
    a.box(1.6, 0.16, 0.01, '#ffffff', [(t0 + t1) / 2 + 0.3, 1.3, s * 0.526]); // faixa da nação
    b.box(1.3, 0.06, 0.02, '#8f9399', [-0.5, 0.48, s * 0.4]); // proteção lateral
    b.box(0.03, 0.42, 0.03, '#3c4046', [0.4, 0.38, s * 0.3]); // pé de apoio
  }
  for (const x of [-1.55, -1.95, -2.35]) for (const z of [-0.42, 0.42]) truckWheel(b, x, z, r, true);
  for (const s of [-1, 1]) b.box(1.24, 0.025, 0.2, CHASSIS, [-1.95, r * 2 + 0.04, s * 0.42]);
  b.box(0.04, 0.96, 1.04, '#c4bdae', [t0 - 0.01, 1.16, 0]);
  b.box(0.045, 0.94, 0.015, '#8f887a', [t0 - 0.02, 1.16, 0]);
  for (const z of [-0.25, -0.1, 0.1, 0.25]) b.box(0.05, 0.84, 0.02, '#8f9399', [t0 - 0.03, 1.14, z]);
  for (const s of [-1, 1]) b.box(0.04, 0.08, 0.12, TAIL, [t0 - 0.02, 0.62, s * 0.42]);
  b.box(0.08, 0.08, 0.9, '#3c4046', [t0 - 0.02, 0.42, 0]);
}
