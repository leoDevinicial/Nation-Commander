import * as THREE from 'three';
import type { BuildingType } from '../../../../shared/sim/config.ts';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';

/**
 * Modelos de edifícios centrados na origem (piso em y = 0). Concreto, vidros azulados e detalhes
 * da facção em faixas, bandeiras e coberturas. Partes animadas ficam em camadas separadas.
 */
export interface BuildingModel {
  base: ModelLayers;
  /** Parte animada opcional (antena, balancim do poço, serra...). */
  moving: { layers: ModelLayers; pivot: [number, number, number]; kind: 'spin' | 'rock' | 'saw' } | null;
  height: number;
  /** Topos de chaminé que soltam fumaça (coordenadas locais). */
  smoke?: [number, number, number][];
}

const cache = new Map<BuildingType, BuildingModel>();

export function buildingModel(type: BuildingType): BuildingModel {
  let m = cache.get(type);
  if (!m) {
    m = BUILDERS[type]();
    cache.set(type, m);
  }
  return m;
}

export function disposeBuildingModels(): void {
  for (const m of cache.values()) {
    for (const l of [m.base, m.moving?.layers]) if (l) for (const g of [l.body, l.accent, l.glass]) g.dispose();
  }
  cache.clear();
}

const BUILDERS: Record<BuildingType, () => BuildingModel> = {
  hq: buildHq,
  barracks: buildBarracks,
  factory: buildFactory,
  farm: buildFarm,
  sawmill: buildSawmill,
  quarry: buildQuarry,
  oil_well: buildOilWell,
  tower: buildTower,
  mine: buildMine,
  house: buildHouse,
  residential: buildResidential,
  warehouse: buildWarehouse,
  silo: buildSilo,
  oil_tank: buildOilTank,
};

/** Fileira de janelas numa fachada (normal ±x ou ±z). */
function windows(g: PartBuilder, axis: 'x' | 'z', at: number, from: number, to: number, y: number, count: number, w = 0.28, h = 0.3): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const c = from + (to - from) * t;
    if (axis === 'z') g.box(w, h, 0.04, '#ffffff', [c, y, at]);
    else g.box(0.04, h, w, '#ffffff', [at, y, c]);
  }
}

function slab(b: PartBuilder, size: number): void {
  b.box(size - 0.1, 0.16, size - 0.1, C.concreteDark, [0, 0.08, 0]);
}

function flag(b: PartBuilder, a: PartBuilder, x: number, z: number, h: number): void {
  b.cyl(0.03, 0.04, h, C.steel, [x, h / 2, z], undefined, 6);
  a.box(0.55, 0.32, 0.02, '#ffffff', [x + 0.3, h - 0.22, z]);
}

// ------------------------------------------------------------------ comando e militares

function buildHq(): BuildingModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  slab(b, 6);
  // bloco principal de dois pavimentos
  b.box(4.4, 2.2, 3.4, C.concrete, [-0.2, 1.26, 0.5]);
  b.box(4.5, 0.12, 3.5, C.concreteDark, [-0.2, 2.42, 0.5]);
  windows(g, 'z', 2.22, -2.0, 1.6, 0.9, 6);
  windows(g, 'z', 2.22, -2.0, 1.6, 1.75, 6);
  windows(g, 'x', 1.92, -0.8, 1.8, 0.9, 4);
  windows(g, 'x', 1.92, -0.8, 1.8, 1.75, 4);
  windows(g, 'x', -2.42, -0.8, 1.8, 1.75, 4);
  // torre de comando sobre a cobertura
  b.box(1.8, 1.4, 1.6, C.concreteLight, [-1.1, 3.18, -0.2]);
  b.box(1.9, 0.1, 1.7, C.concreteDark, [-1.1, 3.93, -0.2]);
  windows(g, 'z', 0.62, -1.7, -0.5, 3.25, 3, 0.3, 0.45);
  windows(g, 'x', -0.18, -0.7, 0.3, 3.25, 2, 0.3, 0.45);
  // entrada com marquise
  b.box(1.4, 0.08, 0.7, C.concreteDark, [-0.2, 0.92, 2.5]);
  b.box(0.08, 0.9, 0.08, C.concreteDark, [-0.8, 0.46, 2.8]);
  b.box(0.08, 0.9, 0.08, C.concreteDark, [0.4, 0.46, 2.8]);
  g.box(0.9, 0.7, 0.04, '#ffffff', [-0.2, 0.52, 2.22]);
  // equipamentos na cobertura
  b.box(0.6, 0.4, 0.5, C.metal, [0.9, 2.68, -0.6]);
  b.box(0.5, 0.3, 0.4, C.metal, [1.4, 2.63, 1.2]);
  b.cyl(0.04, 0.05, 2.0, C.steel, [-1.6, 4.95, -0.6], undefined, 6);
  b.cyl(0.02, 0.02, 1.2, C.steel, [-0.6, 4.55, 0.3], undefined, 4);
  b.sphere(0.06, C.red, [-1.6, 5.95, -0.6]);
  // heliponto
  b.cyl(1.0, 1.0, 0.06, C.asphalt, [1.6, 0.19, -1.9], undefined, 16);
  b.box(0.12, 0.02, 0.8, C.white, [1.35, 0.23, -1.9]);
  b.box(0.12, 0.02, 0.8, C.white, [1.85, 0.23, -1.9]);
  b.box(0.5, 0.02, 0.12, C.white, [1.6, 0.23, -1.9]);
  // canhão de defesa
  b.cyl(0.32, 0.38, 0.3, C.metalDark, [-2.3, 0.3, -2.2]);
  b.box(0.9, 0.12, 0.12, C.metalDark, [-1.9, 0.45, -2.2]);
  // faixa e bandeira da facção
  a.box(4.52, 0.12, 0.02, '#ffffff', [-0.2, 2.3, 2.24]);
  a.box(1.92, 0.1, 0.02, '#ffffff', [-1.1, 3.84, 0.62]);
  flag(b, a, 2.4, 2.4, 2.6);

  // antena parabólica giratória (parte animada)
  return { base: l.build(), moving: { layers: dishLayers(), pivot: [0.9, 2.9, 1.2], kind: 'spin' }, height: 6 };
}

function dishLayers(): ModelLayers {
  const d = layers();
  d.body.cyl(0.05, 0.06, 0.45, C.steel, [0, 0.22, 0], undefined, 6);
  d.body.sphere(0.55, C.white, [0.0, 0.62, 0], [0.35, 1, 1], 10);
  d.body.cyl(0.02, 0.02, 0.5, C.steel, [0.3, 0.62, 0], [0, 0, Math.PI / 2], 4);
  return d.build();
}

function buildBarracks(): BuildingModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  slab(b, 4);
  // hangar com cobertura em arco
  b.box(3.2, 0.9, 2.6, C.concrete, [0, 0.6, -0.1]);
  b.add(arcRoof(1.35, 3.3), C.roof, { pos: [0, 1.05, -0.1], rot: [0, Math.PI / 2, 0] });
  b.box(1.0, 0.9, 0.06, C.metalDark, [0, 0.55, 1.22]); // portão
  g.box(0.4, 0.22, 0.04, '#ffffff', [-1.0, 0.85, 1.21]);
  g.box(0.4, 0.22, 0.04, '#ffffff', [1.0, 0.85, 1.21]);
  // sacos de areia e cerca
  for (let i = 0; i < 6; i++) b.box(0.32, 0.14, 0.18, C.sandbag, [-1.6 + i * 0.34, 0.24 + (i % 2) * 0.01, 1.75]);
  for (let i = 0; i < 4; i++) b.box(0.32, 0.14, 0.18, C.sandbag, [-1.45 + i * 0.34, 0.37, 1.75]);
  b.box(0.08, 0.6, 0.08, C.steel, [1.7, 0.45, 1.75]);
  a.box(1.1, 0.14, 0.02, '#ffffff', [0, 1.1, 1.23]);
  flag(b, a, 1.75, -1.6, 2.4);
  return { base: l.build(), moving: null, height: 2.6 };
}

function buildFactory(): BuildingModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  slab(b, 4);
  b.box(3.5, 1.6, 2.9, C.concreteDark, [0, 0.95, 0]);
  // telhado em dente de serra com claraboias
  for (let i = 0; i < 3; i++) {
    const x = -1.15 + i * 1.15;
    b.side(
      [
        [-0.58, 0],
        [0.58, 0],
        [0.58, 0.55],
      ],
      2.9,
      C.roof,
      [x, 1.75, 0],
    );
    g.box(0.04, 0.5, 2.7, '#ffffff', [x + 0.56, 2.02, 0]);
  }
  // portões e janelas
  b.box(1.2, 1.1, 0.06, C.metalDark, [-0.6, 0.72, 1.48]);
  for (let i = 0; i < 5; i++) b.box(1.18, 0.02, 0.07, C.metal, [-0.6, 0.3 + i * 0.2, 1.5]);
  windows(g, 'z', 1.47, 0.5, 1.5, 1.2, 3, 0.26, 0.32);
  windows(g, 'x', 1.77, -1.0, 1.0, 1.2, 4, 0.28, 0.32);
  // chaminés listradas
  for (const [x, z, h] of [
    [1.25, -1.05, 2.6],
    [0.7, -1.15, 2.1],
  ] as const) {
    b.cyl(0.16, 0.2, h, C.concreteLight, [x, h / 2 + 0.2, z], undefined, 10);
    b.cyl(0.165, 0.165, 0.2, C.red, [x, h - 0.1, z], undefined, 10);
    b.cyl(0.18, 0.18, 0.18, C.red, [x, h * 0.6, z], undefined, 10);
  }
  // pátio com contêiner
  b.box(0.9, 0.4, 0.4, '#5b6f7e', [-1.4, 0.36, -1.7]);
  a.box(3.52, 0.14, 0.02, '#ffffff', [0, 1.6, 1.46]);
  return {
    base: l.build(),
    moving: null,
    height: 2.8,
    smoke: [
      [1.25, 2.85, -1.05],
      [0.7, 2.35, -1.15],
    ],
  };
}

// ------------------------------------------------------------------ economia

function buildFarm(): BuildingModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#6f7f3e', [0, 0.03, 0]);
  // casa com telhado vermelho
  b.box(1.5, 0.9, 1.2, C.concreteLight, [-0.8, 0.5, 0.8]);
  b.gable(1.6, 1.35, 0.6, C.roofRed, [-0.8, 0.95, 0.8]);
  b.box(0.3, 0.55, 0.04, C.woodDark, [-0.8, 0.33, 1.42]);
  g.box(0.26, 0.24, 0.04, '#ffffff', [-1.25, 0.6, 1.42]);
  g.box(0.26, 0.24, 0.04, '#ffffff', [-0.35, 0.6, 1.42]);
  // celeiro e silo
  b.box(1.2, 1.0, 1.0, C.brick, [0.9, 0.55, -0.9]);
  b.gable(1.3, 1.15, 0.5, C.roof, [0.9, 1.05, -0.9], Math.PI / 2);
  b.cyl(0.4, 0.4, 1.8, C.concreteLight, [1.35, 0.95, 0.75], undefined, 12);
  b.sphere(0.4, C.metal, [1.35, 1.85, 0.75], [1, 0.6, 1], 12);
  // trator
  b.box(0.45, 0.25, 0.3, C.red, [0.0, 0.3, -0.2]);
  b.cyl(0.14, 0.14, 0.34, C.rubber, [-0.12, 0.16, -0.2], [Math.PI / 2, 0, 0], 10);
  // cerca
  for (let i = 0; i < 8; i++) b.box(0.05, 0.3, 0.05, C.wood, [-1.85 + i * 0.5, 0.18, -1.85]);
  b.box(3.6, 0.04, 0.03, C.wood, [-0.1, 0.27, -1.85]);
  a.box(0.4, 0.25, 0.02, '#ffffff', [0.9, 0.8, -0.39]);
  return { base: l.build(), moving: null, height: 2.2 };
}

function buildSawmill(): BuildingModel {
  const l = layers();
  const { body: b, accent: a } = l;
  slab(b, 4);
  // galpão aberto
  for (const [x, z] of [
    [-1.4, -0.8],
    [1.4, -0.8],
    [-1.4, 0.9],
    [1.4, 0.9],
  ] as const)
    b.box(0.12, 1.3, 0.12, C.woodDark, [x, 0.8, z]);
  b.gable(3.2, 2.2, 0.55, C.roof, [0, 1.45, 0.05]);
  b.box(1.6, 0.5, 0.6, C.metal, [0, 0.42, 0]); // bancada
  // pilhas de toras
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4 - row; i++) b.cyl(0.13, 0.13, 1.4, C.wood, [-1.2 + i * 0.27 + row * 0.13, 0.28 + row * 0.23, -1.55], [Math.PI / 2, 0, Math.PI / 2], 8);
  for (let i = 0; i < 3; i++) b.box(1.3, 0.08, 0.5, '#c2a173', [1.1, 0.24 + i * 0.09, 1.55]); // tábuas
  a.box(0.8, 0.22, 0.02, '#ffffff', [0, 1.3, 1.0]);
  const saw = layers();
  saw.body.cyl(0.38, 0.38, 0.03, C.steel, [0, 0, 0], [Math.PI / 2, 0, 0], 16);
  return { base: l.build(), moving: { layers: saw.build(), pivot: [0, 0.75, 0], kind: 'saw' }, height: 2.1 };
}

function buildQuarry(): BuildingModel {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(3.9, 0.06, 3.9, '#8c877c', [0, 0.03, 0]);
  // escavadeira
  b.box(0.9, 0.3, 0.6, C.track, [-0.4, 0.2, 0.3]);
  b.box(0.7, 0.45, 0.55, C.yellow, [-0.4, 0.55, 0.3]);
  b.box(0.3, 0.3, 0.4, '#2a3a44', [-0.25, 0.85, 0.3]);
  b.box(1.2, 0.12, 0.12, C.yellow, [0.25, 1.0, 0.3], [0, 0, 0.6]);
  b.box(0.9, 0.1, 0.1, C.yellow, [0.85, 0.85, 0.3], [0, 0, -0.9]);
  b.box(0.3, 0.25, 0.35, C.metalDark, [1.05, 0.35, 0.3]);
  // blocos de pedra e esteira
  for (let i = 0; i < 5; i++) b.box(0.4, 0.3, 0.35, C.stone, [-1.4 + (i % 3) * 0.45, 0.2 + Math.floor(i / 3) * 0.3, -1.3]);
  b.box(2.0, 0.08, 0.3, C.metalDark, [0.8, 0.6, -1.2], [0, 0, 0.35]);
  b.box(0.12, 0.6, 0.12, C.metal, [0.2, 0.3, -1.2]);
  b.cyl(0.0, 0.7, 0.6, C.stone, [1.6, 0.3, -1.2], undefined, 7); // monte de brita
  b.box(0.8, 0.6, 0.6, C.concreteLight, [1.3, 0.35, 1.3]); // escritório
  a.box(0.4, 0.25, 0.02, '#ffffff', [1.3, 0.45, 1.61]);
  return { base: l.build(), moving: null, height: 1.4 };
}

function buildOilWell(): BuildingModel {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(3.9, 0.06, 3.9, '#4b4740', [0, 0.03, 0]);
  b.cyl(0.6, 0.6, 0.02, C.oil, [-0.2, 0.07, 0.3], undefined, 14);
  // base e cavalete do cavalo-mecânico
  b.box(1.6, 0.18, 0.5, C.metalDark, [-0.2, 0.15, 0.3]);
  b.box(0.1, 1.2, 0.1, C.metal, [-0.2, 0.8, 0.5], [0.25, 0, 0]);
  b.box(0.1, 1.2, 0.1, C.metal, [-0.2, 0.8, 0.1], [-0.25, 0, 0]);
  b.box(0.3, 0.3, 0.3, C.metalDark, [-0.85, 0.35, 0.3]); // motor
  // manifold de válvulas e saída para o tanque de petróleo
  b.box(0.5, 0.35, 0.35, C.metalDark, [1.1, 0.25, -1.1]);
  b.cyl(0.06, 0.06, 0.5, C.red, [1.1, 0.6, -1.1], undefined, 6);
  a.box(0.52, 0.08, 0.02, '#ffffff', [1.1, 0.35, -0.92]);
  b.box(1.6, 0.06, 0.06, C.metal, [0.5, 0.3, -0.5]); // tubulação
  b.box(0.06, 0.06, 1.0, C.metal, [1.25, 0.3, 0.0]);
  const jack = layers();
  jack.body.box(1.6, 0.12, 0.14, C.yellow, [0, 0, 0]);
  jack.body.box(0.2, 0.4, 0.16, C.yellow, [0.82, -0.12, 0]); // cabeça de cavalo
  jack.body.box(0.3, 0.3, 0.2, C.metalDark, [-0.7, -0.15, 0]); // contrapeso
  return { base: l.build(), moving: { layers: jack.build(), pivot: [-0.2, 1.4, 0.3], kind: 'rock' }, height: 1.8 };
}

function buildTower(): BuildingModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.8, 0.14, 1.8, C.concreteDark, [0, 0.07, 0]);
  const h = 3.0;
  for (const [x, z] of [
    [-0.6, -0.6],
    [0.6, -0.6],
    [-0.6, 0.6],
    [0.6, 0.6],
  ] as const) {
    b.box(0.08, h, 0.08, C.woodDark, [x * 0.82, h / 2, z * 0.82], [z * 0.07, 0, -x * 0.07]);
  }
  // travamentos em X
  for (const y of [0.9, 1.9]) {
    b.box(1.05, 0.05, 0.05, C.wood, [0, y, 0.5], [0, 0, 0.7]);
    b.box(1.05, 0.05, 0.05, C.wood, [0, y, -0.5], [0, 0, -0.7]);
    b.box(0.05, 0.05, 1.05, C.wood, [0.5, y, 0], [0.7, 0, 0]);
    b.box(0.05, 0.05, 1.05, C.wood, [-0.5, y, 0], [-0.7, 0, 0]);
  }
  // cabine
  b.box(1.3, 0.1, 1.3, C.woodDark, [0, h + 0.05, 0]);
  b.box(1.1, 0.3, 1.1, C.wood, [0, h + 0.25, 0]);
  for (const [x, z] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ] as const)
    b.box(0.06, 0.6, 0.06, C.woodDark, [x, h + 0.6, z]);
  g.box(1.0, 0.28, 0.02, '#ffffff', [0, h + 0.55, 0.52]);
  g.box(0.02, 0.28, 1.0, '#ffffff', [0.52, h + 0.55, 0]);
  b.gable(1.4, 1.4, 0.4, C.roof, [0, h + 0.9, 0]);
  b.cyl(0.1, 0.14, 0.18, C.metalDark, [0.45, h + 0.5, 0.45], [0.6, 0, -0.6], 8); // holofote
  b.box(0.4, 0.04, 0.04, C.metalDark, [0.55, h + 0.45, -0.3]); // metralhadora
  a.box(1.42, 0.08, 0.02, '#ffffff', [0, h + 0.92, 0.7]);
  return { base: l.build(), moving: null, height: h + 1.3 };
}

// ------------------------------------------------------------------ população e armazenamento

function buildMine(): BuildingModel {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(3.9, 0.06, 3.9, '#6b625a', [0, 0.03, 0]);
  // boca da mina escorada na encosta
  b.side(
    [
      [-1.6, 0],
      [1.6, 0],
      [0.9, 1.2],
      [-0.9, 1.2],
    ],
    1.6,
    C.stone,
    [0, 0.06, -1.1],
  );
  b.box(1.0, 0.8, 0.1, '#1b1a18', [0, 0.46, -0.28]);
  b.box(0.12, 0.95, 0.12, C.woodDark, [-0.55, 0.53, -0.22]);
  b.box(0.12, 0.95, 0.12, C.woodDark, [0.55, 0.53, -0.22]);
  b.box(1.3, 0.12, 0.14, C.woodDark, [0, 1.02, -0.22]);
  // trilhos e vagonete com minério avermelhado
  b.box(0.06, 0.04, 2.0, C.metal, [-0.18, 0.08, 0.8]);
  b.box(0.06, 0.04, 2.0, C.metal, [0.18, 0.08, 0.8]);
  b.box(0.55, 0.32, 0.45, C.metalDark, [0, 0.3, 1.0]);
  b.box(0.48, 0.1, 0.38, '#8a4b32', [0, 0.49, 1.0]);
  // castelete de içamento
  b.box(0.08, 1.8, 0.08, C.steel, [1.2, 0.95, 0.6], [0, 0, 0.15]);
  b.box(0.08, 1.8, 0.08, C.steel, [1.6, 0.95, 0.6], [0, 0, -0.15]);
  b.cyl(0.22, 0.22, 0.08, C.metalDark, [1.4, 1.85, 0.6], [Math.PI / 2, 0, 0], 12);
  // pilha de minério
  b.cyl(0.0, 0.6, 0.5, '#7b4630', [-1.3, 0.3, 1.2], undefined, 7);
  a.box(0.9, 0.12, 0.02, '#ffffff', [0, 1.12, -0.14]);
  return { base: l.build(), moving: null, height: 2.0 };
}

function buildHouse(): BuildingModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.8, 0.06, 1.8, '#7c8a52', [0, 0.03, 0]);
  b.box(1.15, 0.75, 0.95, C.concreteLight, [0, 0.43, 0]);
  b.gable(1.3, 1.1, 0.5, C.roofRed, [0, 0.8, 0]);
  b.box(0.24, 0.45, 0.04, C.woodDark, [0.2, 0.28, 0.49]);
  g.box(0.22, 0.2, 0.04, '#ffffff', [-0.28, 0.5, 0.49]);
  g.box(0.04, 0.2, 0.22, '#ffffff', [0.59, 0.5, 0]);
  b.box(0.12, 0.35, 0.12, C.brick, [0.35, 1.15, -0.2]); // chaminé
  a.box(0.3, 0.06, 0.02, '#ffffff', [0.2, 0.55, 0.5]);
  return { base: l.build(), moving: null, height: 1.4 };
}

function buildResidential(): BuildingModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  slab(b, 4);
  // bloco de quatro pavimentos
  b.box(2.6, 2.6, 1.7, C.concrete, [0, 1.46, -0.3]);
  b.box(2.7, 0.1, 1.8, C.concreteDark, [0, 2.8, -0.3]);
  for (let floor = 0; floor < 4; floor++) {
    const y = 0.5 + floor * 0.6;
    windows(g, 'z', 0.56, -1.0, 1.0, y, 5, 0.26, 0.28);
    windows(g, 'x', 1.31, -0.9, 0.3, y, 2, 0.26, 0.28);
    b.box(2.62, 0.05, 0.12, C.concreteDark, [0, y - 0.24, 0.6]); // sacadas
  }
  b.box(0.5, 0.3, 0.4, C.metal, [0.8, 3.0, -0.6]); // caixa d'água
  b.box(1.4, 0.06, 0.6, '#6f7f3e', [-0.4, 0.2, 1.3]); // jardim
  a.box(2.62, 0.1, 0.02, '#ffffff', [0, 2.7, 0.56]);
  return { base: l.build(), moving: null, height: 3.2 };
}

function buildWarehouse(): BuildingModel {
  const l = layers();
  const { body: b, accent: a } = l;
  slab(b, 4);
  b.box(3.3, 1.3, 2.4, C.concreteDark, [0, 0.8, -0.3]);
  b.gable(3.4, 2.5, 0.45, C.roof, [0, 1.45, -0.3]);
  // docas e portões
  for (const x of [-0.9, 0.9]) {
    b.box(0.9, 0.85, 0.06, C.metalDark, [x, 0.6, 0.92]);
    for (let i = 0; i < 4; i++) b.box(0.88, 0.02, 0.07, C.metal, [x, 0.3 + i * 0.18, 0.94]);
  }
  b.box(3.3, 0.25, 0.5, C.concrete, [0, 0.2, 1.2]);
  // estoque visível: toras, blocos de pedra e lingotes
  for (let i = 0; i < 3; i++) b.cyl(0.11, 0.11, 0.9, C.wood, [-1.3 + i * 0.24, 0.27, 1.65], [0, 0, Math.PI / 2], 8);
  for (let i = 0; i < 3; i++) b.box(0.28, 0.24, 0.28, C.stone, [0.2 + i * 0.32, 0.22, 1.65]);
  b.box(0.4, 0.14, 0.25, '#7e858c', [1.45, 0.17, 1.65]);
  a.box(3.32, 0.12, 0.02, '#ffffff', [0, 1.2, 0.92]);
  return { base: l.build(), moving: null, height: 2.0 };
}

function buildSilo(): BuildingModel {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(1.8, 0.1, 1.8, C.concreteDark, [0, 0.05, 0]);
  b.cyl(0.55, 0.55, 2.0, C.concreteLight, [-0.15, 1.1, -0.1], undefined, 14);
  b.sphere(0.56, C.metal, [-0.15, 2.1, -0.1], [1, 0.55, 1], 14);
  for (const y of [0.6, 1.2, 1.8]) b.cyl(0.57, 0.57, 0.05, C.metal, [-0.15, y, -0.1], undefined, 14);
  b.box(0.06, 2.2, 0.06, C.steel, [0.45, 1.1, 0.35]); // escada
  b.box(0.5, 0.35, 0.4, C.metalDark, [0.45, 0.25, 0.55]); // moega
  a.cyl(0.565, 0.565, 0.12, '#ffffff', [-0.15, 1.5, -0.1], undefined, 14);
  return { base: l.build(), moving: null, height: 2.4 };
}

function buildOilTank(): BuildingModel {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(1.8, 0.1, 1.8, C.concreteDark, [0, 0.05, 0]);
  // dique de contenção e tanque de teto flutuante
  for (const [x, z, w, d] of [
    [0, 0.85, 1.8, 0.1],
    [0, -0.85, 1.8, 0.1],
    [0.85, 0, 0.1, 1.8],
    [-0.85, 0, 0.1, 1.8],
  ] as const)
    b.box(w, 0.25, d, C.concrete, [x, 0.2, z]);
  b.cyl(0.65, 0.65, 1.0, C.white, [0, 0.6, 0], undefined, 16);
  b.cyl(0.66, 0.66, 0.05, C.metal, [0, 1.12, 0], undefined, 16);
  b.box(0.05, 1.0, 0.05, C.steel, [0.62, 0.6, 0.2]);
  b.box(0.5, 0.06, 0.06, C.metal, [0.6, 0.3, -0.55]);
  a.cyl(0.665, 0.665, 0.14, '#ffffff', [0, 0.85, 0], undefined, 16);
  return { base: l.build(), moving: null, height: 1.3 };
}

/** Arco semicilíndrico achatado ao longo de z (cobertura de hangar). */
function arcRoof(radius: number, length: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, 12, 1, false, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 0.55, 1);
  return g;
}
