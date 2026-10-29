import { C, layers } from './kit.ts';
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

/** Refinaria (2×2): coluna de destilação, tanques esféricos, tubulação e chama no flare. */
export function buildRefinery(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.7, 0.12, 3.7, C.concreteDark, [0, 0.06, 0]);
  // coluna de destilação com plataformas
  b.cyl(0.32, 0.36, 3.4, STEEL, [-0.9, 1.8, -0.9], undefined, 12);
  for (const y of [1.0, 1.9, 2.8]) b.cyl(0.5, 0.5, 0.05, DARK, [-0.9, y, -0.9], undefined, 12);
  b.cyl(0.2, 0.2, 0.6, STEEL, [-0.2, 1.4, -1.1], undefined, 10);
  // tanques esféricos
  for (const [x, z] of [
    [0.85, -0.85],
    [0.85, 0.35],
  ] as const) {
    b.sphere(0.55, WHITE, [x, 0.75, z], [1, 1, 1], 14);
    for (const [dx, dz] of [
      [0.35, 0],
      [-0.35, 0],
      [0, 0.35],
      [0, -0.35],
    ] as const)
      b.box(0.06, 0.4, 0.06, DARK, [x + dx, 0.32, z + dz]);
  }
  // tubulação no chão e na ponte
  b.box(2.4, 0.08, 0.08, RUST, [0, 0.28, 1.25]);
  b.box(2.4, 0.08, 0.08, RUST, [0, 0.4, 1.4]);
  b.box(0.08, 0.08, 2.2, RUST, [-1.45, 0.4, 0.2]);
  b.box(0.1, 1.1, 0.1, STEEL, [-0.9, 0.9, 0.3]);
  b.box(1.9, 0.08, 0.08, RUST, [-0.05, 1.45, 0.3]);
  // casa de controle e flare
  b.box(1.0, 0.6, 0.7, C.concreteLight, [-0.9, 0.42, 1.0]);
  g.box(0.6, 0.18, 0.02, '#ffffff', [-0.9, 0.5, 1.36]);
  a.box(1.02, 0.1, 0.72, '#ffffff', [-0.9, 0.77, 1.0]);
  b.cyl(0.06, 0.08, 2.6, DARK, [1.55, 1.3, 1.5], undefined, 8);
  return { base: l.build(), moving: null, height: 3.6, smoke: [[1.55, 2.7, 1.5]] };
}

/** Siderúrgica (2×2): alto-forno com chaminé, galpão de laminação e pilhas de chapas. */
export function buildSteelMill(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.7, 0.12, 3.7, C.concreteDark, [0, 0.06, 0]);
  // alto-forno: corpo cônico, cinta e a rampa de carga
  b.cyl(0.55, 0.75, 2.2, RUST, [-0.9, 1.2, -0.8], undefined, 14);
  b.cyl(0.62, 0.62, 0.12, DARK, [-0.9, 1.6, -0.8], undefined, 14);
  b.cyl(0.35, 0.55, 0.5, DARK, [-0.9, 2.55, -0.8], undefined, 12);
  b.box(0.18, 0.12, 2.0, STEEL, [-0.2, 1.45, -0.8], [0.6, 0, 0]);
  // chaminé alta
  b.cyl(0.18, 0.24, 3.6, BRICK, [1.3, 1.9, -1.3], undefined, 10);
  a.cyl(0.25, 0.25, 0.14, '#ffffff', [1.3, 3.2, -1.3], undefined, 10);
  // galpão de laminação com telhado em shed
  b.box(2.6, 0.9, 1.3, C.concrete, [0.2, 0.57, 0.95]);
  for (let i = 0; i < 4; i++) {
    b.box(0.65, 0.06, 1.34, C.roof, [-0.78 + i * 0.65, 1.12, 0.95], [0, 0, 0.35]);
    g.box(0.02, 0.18, 1.2, '#ffffff', [-0.5 + i * 0.65, 1.1, 0.95]);
  }
  g.box(1.6, 0.22, 0.02, '#ffffff', [0.2, 0.62, 1.61]);
  // chapas e bobinas de aço no pátio
  for (let i = 0; i < 3; i++) b.box(0.9, 0.06, 0.5, STEEL, [1.1, 0.16 + i * 0.07, -0.2]);
  for (const x of [0.3, 0.75]) b.cyl(0.22, 0.22, 0.32, STEEL, [x, 0.34, -0.15], [Math.PI / 2, 0, 0], 12);
  return {
    base: l.build(),
    moving: null,
    height: 3.7,
    smoke: [
      [1.3, 3.75, -1.3],
      [-0.9, 2.85, -0.8],
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
