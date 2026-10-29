import * as THREE from 'three';
import { buildFinancialCenter, buildHydroDam, buildNetwork5g, buildNuclearPlant, buildSpaceCenter, buildTankTrap } from './projects.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType } from '../../../../shared/sim/config.ts';
import type { SpecId } from '../../../../shared/sim/upgrades.ts';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { modulesFor } from './upgradeModules.ts';
import { pumpjack, type PumpRig } from './pumpjack.ts';
import { tractor } from './crops.ts';
import { barracksDetail, factoryDetail, houseDetail, oilTankDetail, siloDetail, warehouseDetail } from './details.ts';
import { buildMineModel, buildQuarryModel, buildSawmillModel } from './industry.ts';
import { buildMarketModel, buildPortModel, buildRailStationModel } from './logistics.ts';
import { buildAaBatteryModel, buildAirbaseModel, buildMissileSiloModel, buildResearchCenterModel } from './military.ts';
import { buildCityHallModel } from './civic.ts';

/**
 * Modelos de edifícios centrados na origem (piso em y = 0). Concreto, vidros azulados e detalhes
 * da facção em faixas, bandeiras e coberturas. Partes animadas ficam em camadas separadas.
 */
export interface BuildingModel {
  base: ModelLayers;
  /** Peças pequenas dos módulos de melhoria: ficam ocultas em zoom distante (LOD). */
  detail: ModelLayers | null;
  /** Parte animada opcional (antena, balancim do poço, serra...). */
  moving: { layers: ModelLayers; pivot: [number, number, number]; kind: 'spin' | 'rock' | 'saw' | 'pump' } | null;
  /** Cavalo-mecânico: manivela, bielas e haste animadas junto com o balancim (`moving`, tipo 'pump'). */
  pump?: Omit<PumpRig, 'beam' | 'pivot'>;
  /** Outras partes animadas (serras, toras na esteira, guindaste, polias, vagonetes...). */
  anims?: ModelAnim[];
  /**
   * Folhas da tampa do silo de mísseis: giram na dobradiça (`pivot`, na borda de fora) para cima e
   * para fora; `side` diz para que lado a folha fica (+1 à direita). Abrem e fecham pelo estado do
   * lançamento, não pelo tempo.
   */
  hatch?: { layers: ModelLayers; pivot: [number, number, number]; side: 1 | -1 }[];
  height: number;
  /** Topos de chaminé que soltam fumaça (coordenadas locais). */
  smoke?: [number, number, number][];
}

type V3 = [number, number, number];

/**
 * Movimento de uma parte animada, em função do tempo t (s):
 * - spin: gira sem parar em torno do eixo (rad/s);
 * - swing: oscila amp·sen(speed·t + phase) em torno do eixo;
 * - slide: percorre `length` ao longo de `dir` e recomeça (esteira); `fade` encolhe a peça no
 *   início e no fim do percurso (fração do percurso), para ela "surgir" e "sumir";
 * - shuttle: vai e volta ao longo de `dir` (vagonete, carro de ponte);
 * - bob: sobe e desce amp·sen(speed·t + phase) (gancho de guindaste).
 */
export type AnimMotion =
  | { kind: 'spin'; axis: 'x' | 'y' | 'z'; speed: number }
  | { kind: 'swing'; axis: 'x' | 'y' | 'z'; amp: number; speed: number; phase?: number }
  | { kind: 'slide'; dir: V3; length: number; speed: number; phase?: number; fade?: number }
  | { kind: 'shuttle'; dir: V3; length: number; speed: number; phase?: number }
  | { kind: 'bob'; amp: number; speed: number; phase?: number };

export interface ModelAnim {
  layers: ModelLayers;
  /** Posição da parte (relativa ao pai, se houver). */
  pivot: V3;
  motion: AnimMotion;
  /** Índice de outra parte em `anims` que a carrega (ex.: gancho preso à lança que gira). */
  parent?: number;
}

/** Posição de repouso de uma parte animada no modelo (somando os pais). */
export function animRestPivot(anims: ModelAnim[], i: number): V3 {
  const a = anims[i]!;
  const p: V3 = [...a.pivot];
  if (a.parent !== undefined) {
    const q = animRestPivot(anims, a.parent);
    p[0] += q[0];
    p[1] += q[1];
    p[2] += q[2];
  }
  return p;
}

const cache = new Map<BuildingType, BuildingModel>();
/** Variantes por nível e especialização (base + módulos fundidos numa geometria por camada). */
const variants = new Map<string, BuildingModel>();

function baseModel(type: BuildingType): BuildingModel {
  let m = cache.get(type);
  if (!m) {
    m = { ...BUILDERS[type](), detail: null };
    cache.set(type, m);
  }
  return m;
}

const hasGeometry = (g: THREE.BufferGeometry) => !!g.getAttribute('position');

/** Funde a geometria da base com a dos módulos (uma chamada de desenho por camada). */
function mergeLayer(base: THREE.BufferGeometry, extra: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!hasGeometry(extra)) {
    extra.dispose();
    return base.clone();
  }
  if (!hasGeometry(base)) return extra;
  const merged = mergeGeometries([base, extra], false);
  extra.dispose();
  if (!merged) throw new Error('Falha ao fundir os módulos de melhoria');
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Modelo do edifício no nível e especialização dados. Nível 1 (ou classe sem módulos) é o modelo
 * base; acima disso, os módulos de melhoria entram na mesma geometria, e as peças pequenas numa
 * camada de detalhe separada (LOD).
 */
export function buildingModel(type: BuildingType, level = 1, spec: SpecId | null = null): BuildingModel {
  const base = baseModel(type);
  const mods = modulesFor(type, level, spec);
  if (!mods.length) return base;
  const key = `${type}|${level}|${spec ?? ''}`;
  const hit = variants.get(key);
  if (hit) return hit;
  const main = layers();
  const det = layers();
  let height = base.height;
  const smoke = [...(base.smoke ?? [])];
  for (const mod of mods) {
    const t = mod.detail ? det : main;
    mod.build({ b: t.body, a: t.accent, g: t.glass });
    if (mod.height) height = Math.max(height, mod.height);
    if (mod.smoke) smoke.push(...mod.smoke);
  }
  const extra = main.build();
  const detail = det.build();
  const m: BuildingModel = {
    base: {
      body: mergeLayer(base.base.body, extra.body),
      accent: mergeLayer(base.base.accent, extra.accent),
      glass: mergeLayer(base.base.glass, extra.glass),
    },
    detail: [detail.body, detail.accent, detail.glass].some(hasGeometry) ? detail : null,
    moving: base.moving,
    ...(base.pump ? { pump: base.pump } : {}),
    ...(base.anims ? { anims: base.anims } : {}),
    ...(base.hatch ? { hatch: base.hatch } : {}),
    height,
    ...(smoke.length ? { smoke } : {}),
  };
  if (!m.detail) for (const g of [detail.body, detail.accent, detail.glass]) g.dispose();
  variants.set(key, m);
  return m;
}

export function disposeBuildingModels(): void {
  for (const m of variants.values()) {
    for (const l of [m.base, m.detail]) if (l) for (const g of [l.body, l.accent, l.glass]) g.dispose();
  }
  variants.clear();
  for (const m of cache.values()) {
    for (const l of [m.base, m.moving?.layers, m.pump?.crank, m.pump?.pitman, m.pump?.rod, ...(m.anims ?? []).map((x) => x.layers)])
      if (l) for (const g of [l.body, l.accent, l.glass]) g.dispose();
  }
  cache.clear();
}

const BUILDERS: Record<BuildingType, () => Omit<BuildingModel, 'detail'>> = {
  hq: buildHq,
  barracks: buildBarracks,
  factory: buildFactory,
  farm: buildFarm,
  sawmill: buildSawmillModel,
  quarry: buildQuarryModel,
  oil_well: buildOilWell,
  tower: buildTower,
  mine: buildMineModel,
  house: buildHouse,
  residential: buildResidential,
  warehouse: buildWarehouse,
  silo: buildSilo,
  oil_tank: buildOilTank,
  market: buildMarketModel,
  port: buildPortModel,
  rail_station: buildRailStationModel,
  airbase: buildAirbaseModel,
  aa_battery: buildAaBatteryModel,
  missile_silo: buildMissileSiloModel,
  research_center: buildResearchCenterModel,
  city_hall: buildCityHallModel,
  nuclear_plant: buildNuclearPlant,
  network_5g: buildNetwork5g,
  hydro_dam: buildHydroDam,
  financial_center: buildFinancialCenter,
  space_center: buildSpaceCenter,
  tank_trap: buildTankTrap,
};

/** Fileira de janelas numa fachada (normal ±x ou ±z). */
function windows(b: PartBuilder, g: PartBuilder, axis: 'x' | 'z', at: number, from: number, to: number, y: number, count: number, w = 0.28, h = 0.3): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const c = from + (to - from) * t;
    // vidro, peitoril saliente e verga: o recorte de sombra dá profundidade à fachada
    if (axis === 'z') {
      g.box(w, h, 0.04, '#ffffff', [c, y, at]);
      b.box(w + 0.06, 0.03, 0.09, C.concreteLight, [c, y - h / 2 - 0.015, at]);
      b.box(w + 0.04, 0.025, 0.07, C.concreteDark, [c, y + h / 2 + 0.012, at]);
    } else {
      g.box(0.04, h, w, '#ffffff', [at, y, c]);
      b.box(0.09, 0.03, w + 0.06, C.concreteLight, [at, y - h / 2 - 0.015, c]);
      b.box(0.07, 0.025, w + 0.04, C.concreteDark, [at, y + h / 2 + 0.012, c]);
    }
  }
}

/** Calha vertical (tubo de descida) presa à parede. */
function downpipe(b: PartBuilder, x: number, z: number, top: number): void {
  b.cyl(0.03, 0.03, top - 0.16, C.metalDark, [x, (top + 0.16) / 2, z], undefined, 6);
  b.box(0.08, 0.04, 0.08, C.metalDark, [x, 0.18, z]);
}

/** Aparelho de ar-condicionado/exaustor de cobertura, com grade. */
function rooftopUnit(b: PartBuilder, x: number, y: number, z: number): void {
  b.box(0.42, 0.24, 0.32, C.steel, [x, y + 0.12, z]);
  b.cyl(0.11, 0.11, 0.02, C.metalDark, [x, y + 0.25, z], undefined, 10);
  for (let i = 0; i < 3; i++) b.box(0.02, 0.18, 0.33, C.metalDark, [x - 0.12 + i * 0.12, y + 0.12, z]);
}

function slab(b: PartBuilder, size: number): void {
  b.box(size - 0.1, 0.16, size - 0.1, C.concreteDark, [0, 0.08, 0]);
}

/** Barreira de concreto tipo "New Jersey" (perfil trapezoidal), comprimento ao longo de x. */
function jersey(b: PartBuilder, x: number, z: number, rotY = 0, len = 0.8): void {
  b.side(
    [
      [-0.16, 0],
      [0.16, 0],
      [0.1, 0.1],
      [0.05, 0.42],
      [-0.05, 0.42],
      [-0.1, 0.1],
    ],
    len,
    C.concrete,
    [x, 0.16, z],
    [0, Math.PI / 2 + rotY, 0],
  );
}

/** Contêiner de carga com nervuras e portas; comprimento ao longo de x. */
function container(b: PartBuilder, pos: [number, number, number], color: string, len = 1.0, rotY = 0): void {
  const [x, y, z] = pos;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (dx: number, dy: number, dz: number): [number, number, number] => [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
  const w = 0.42;
  const h = 0.44;
  b.box(len, h, w, color, at(0, h / 2, 0), [0, rotY, 0]);
  const ribs = Math.round(len / 0.12);
  for (let i = 1; i < ribs; i++) {
    const dx = -len / 2 + (i * len) / ribs;
    b.box(0.03, h - 0.06, w + 0.025, color, at(dx, h / 2, 0), [0, rotY, 0]);
  }
  // cantoneiras e portas
  for (const sx of [-1, 1]) b.box(0.04, h + 0.01, w + 0.02, C.metalDark, at((sx * len) / 2, h / 2, 0), [0, rotY, 0]);
  b.box(0.02, h - 0.08, 0.02, C.metalDark, at(len / 2 + 0.02, h / 2, 0), [0, rotY, 0]);
}

function flag(b: PartBuilder, a: PartBuilder, x: number, z: number, h: number): void {
  b.cyl(0.03, 0.04, h, C.steel, [x, h / 2, z], undefined, 6);
  a.box(0.55, 0.32, 0.02, '#ffffff', [x + 0.3, h - 0.22, z]);
}

// ------------------------------------------------------------------ comando e militares

function buildHq(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  slab(b, 6);
  // bloco principal de dois pavimentos
  b.box(4.4, 2.2, 3.4, C.concrete, [-0.2, 1.26, 0.5]);
  b.box(4.5, 0.12, 3.5, C.concreteDark, [-0.2, 2.42, 0.5]);
  windows(b, g, 'z', 2.22, -2.0, 1.6, 0.9, 6);
  windows(b, g, 'z', 2.22, -2.0, 1.6, 1.75, 6);
  windows(b, g, 'x', 1.92, -0.8, 1.8, 0.9, 4);
  windows(b, g, 'x', 1.92, -0.8, 1.8, 1.75, 4);
  windows(b, g, 'x', -2.42, -0.8, 1.8, 1.75, 4);
  // torre de comando sobre a cobertura
  b.box(1.8, 1.4, 1.6, C.concreteLight, [-1.1, 3.18, -0.2]);
  b.box(1.9, 0.1, 1.7, C.concreteDark, [-1.1, 3.93, -0.2]);
  windows(b, g, 'z', 0.62, -1.7, -0.5, 3.25, 3, 0.3, 0.45);
  windows(b, g, 'x', -0.18, -0.7, 0.3, 3.25, 2, 0.3, 0.45);
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
  // platibanda na cobertura, calhas e equipamentos
  b.box(4.5, 0.14, 0.06, C.concreteDark, [-0.2, 2.55, 2.22]);
  b.box(4.5, 0.14, 0.06, C.concreteDark, [-0.2, 2.55, -1.22]);
  b.box(0.06, 0.14, 3.5, C.concreteDark, [2.02, 2.55, 0.5]);
  b.box(0.06, 0.14, 3.5, C.concreteDark, [-2.42, 2.55, 0.5]);
  downpipe(b, 1.98, 2.25, 2.42);
  downpipe(b, -2.38, 2.25, 2.42);
  rooftopUnit(b, 0.2, 2.48, 1.6);
  // barreiras de concreto na frente do quartel-general
  for (const x of [1.3, 2.15, -1.7, -2.5]) jersey(b, x, 2.75);

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

function buildBarracks(): Omit<BuildingModel, 'detail'> {
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
  barracksDetail(b, g);
  return { base: l.build(), moving: null, height: 2.6 };
}

function buildFactory(): Omit<BuildingModel, 'detail'> {
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
  windows(b, g, 'z', 1.47, 0.5, 1.5, 1.2, 3, 0.26, 0.32);
  windows(b, g, 'x', 1.77, -1.0, 1.0, 1.2, 4, 0.28, 0.32);
  // chaminés listradas
  for (const [x, z, h] of [
    [1.25, -1.05, 2.6],
    [0.7, -1.15, 2.1],
  ] as const) {
    b.cyl(0.16, 0.2, h, C.concreteLight, [x, h / 2 + 0.2, z], undefined, 10);
    b.cyl(0.165, 0.165, 0.2, C.red, [x, h - 0.1, z], undefined, 10);
    b.cyl(0.18, 0.18, 0.18, C.red, [x, h * 0.6, z], undefined, 10);
  }
  // tubulação externa, exaustores e calhas
  b.cyl(0.06, 0.06, 2.6, C.steel, [0, 1.35, -1.52], [0, 0, Math.PI / 2], 8);
  for (const x of [-1.1, 0.2]) b.box(0.08, 0.1, 0.1, C.metalDark, [x, 1.35, -1.5]);
  b.cyl(0.06, 0.06, 1.2, C.steel, [1.3, 0.75, -1.52], undefined, 8);
  downpipe(b, -1.72, 1.48, 1.75);
  downpipe(b, 1.72, 1.48, 1.75);
  // pátio com contêiner
  container(b, [-1.25, 0.16, -1.72], '#5b6f7e', 1.1);
  container(b, [-1.25, 0.6, -1.72], '#8a4b32', 1.1);
  jersey(b, 1.15, 1.78, 0, 0.75);
  a.box(3.52, 0.14, 0.02, '#ffffff', [0, 1.6, 1.46]);
  factoryDetail(b, g);
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

function buildFarm(): Omit<BuildingModel, 'detail'> {
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
  tractor(b, g, 0.0, 0.06, -0.2);
  // cerca
  for (let i = 0; i < 8; i++) b.box(0.05, 0.3, 0.05, C.wood, [-1.85 + i * 0.5, 0.18, -1.85]);
  b.box(3.6, 0.04, 0.03, C.wood, [-0.1, 0.27, -1.85]);
  a.box(0.4, 0.25, 0.02, '#ffffff', [0.9, 0.8, -0.39]);
  return { base: l.build(), moving: null, height: 2.2 };
}



function buildOilWell(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(3.9, 0.06, 3.9, '#4b4740', [0, 0.03, 0]);
  // cavalo-mecânico real ao longo de x, cabeça de cavalo sobre a cabeça de poço (x ≈ 0,95)
  const rig = pumpjack({ b }, [0, 0, 0.3]);
  // linha de produção (tubo branco em suportes) da cabeça de poço até o manifold
  const pipeY = 0.42;
  b.cyl(0.035, 0.035, 1.3, '#d8d9d4', [0.95, pipeY, -0.4], [Math.PI / 2, 0, 0], 8);
  for (const z of [-0.35, -0.85]) {
    b.box(0.05, pipeY, 0.05, '#c9372c', [0.95, pipeY / 2 + 0.03, z]);
    b.box(0.14, 0.03, 0.05, '#e6e6e0', [0.95, pipeY - 0.04, z]);
  }
  // manifold de válvulas com identificação da facção
  b.box(0.5, 0.35, 0.35, C.metalDark, [1.1, 0.25, -1.1]);
  b.cyl(0.06, 0.06, 0.5, C.red, [1.1, 0.6, -1.1], undefined, 6);
  a.box(0.52, 0.08, 0.02, '#ffffff', [1.1, 0.35, -0.92]);
  // quadro elétrico do motor
  b.box(0.3, 0.42, 0.14, '#9aa0a6', [-1.6, 0.27, -0.45]);
  b.box(0.26, 0.04, 0.16, '#6c7177', [-1.6, 0.5, -0.45]);
  const beam = { layers: rig.beam, pivot: rig.pivot, kind: 'pump' as const };
  return { base: l.build(), moving: beam, pump: { crank: rig.crank, pitman: rig.pitman, rod: rig.rod, crankPivot: rig.crankPivot, rodPivot: rig.rodPivot }, height: 2.3 };
}

function buildTower(): Omit<BuildingModel, 'detail'> {
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


function buildHouse(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.8, 0.06, 1.8, '#7c8a52', [0, 0.03, 0]);
  b.box(1.15, 0.75, 0.95, C.concreteLight, [0, 0.43, 0]);
  b.gable(1.3, 1.1, 0.5, C.roofRed, [0, 0.8, 0]);
  b.box(0.24, 0.45, 0.04, C.woodDark, [0.2, 0.28, 0.49]);
  g.box(0.22, 0.2, 0.04, '#ffffff', [-0.28, 0.5, 0.49]);
  g.box(0.04, 0.2, 0.22, '#ffffff', [0.59, 0.5, 0]);
  b.box(0.12, 0.35, 0.12, C.brick, [0.35, 1.15, -0.2]); // chaminé
  b.box(0.32, 0.05, 0.14, C.concreteDark, [0.2, 0.08, 0.55]); // degrau
  b.box(0.3, 0.03, 0.06, C.concreteLight, [0.2, 0.52, 0.49]); // verga da porta
  downpipe(b, 0.56, 0.46, 0.8);
  a.box(0.3, 0.06, 0.02, '#ffffff', [0.2, 0.55, 0.5]);
  houseDetail(b, g);
  return { base: l.build(), moving: null, height: 1.4 };
}

function buildResidential(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  slab(b, 4);
  // bloco de quatro pavimentos
  b.box(2.6, 2.6, 1.7, C.concrete, [0, 1.46, -0.3]);
  b.box(2.7, 0.1, 1.8, C.concreteDark, [0, 2.8, -0.3]);
  for (let floor = 0; floor < 4; floor++) {
    const y = 0.5 + floor * 0.6;
    windows(b, g, 'z', 0.56, -1.0, 1.0, y, 5, 0.26, 0.28);
    windows(b, g, 'x', 1.31, -0.9, 0.3, y, 2, 0.26, 0.28);
    b.box(2.62, 0.05, 0.12, C.concreteDark, [0, y - 0.24, 0.6]); // sacadas
  }
  b.box(0.5, 0.3, 0.4, C.metal, [0.8, 3.0, -0.6]); // caixa d'água
  rooftopUnit(b, -0.6, 2.85, -0.7);
  downpipe(b, 1.28, 0.58, 2.8);
  downpipe(b, -1.28, 0.58, 2.8);
  for (const [x, y] of [[-0.75, 0.75], [0.5, 1.35], [-0.25, 1.95]] as const) b.box(0.18, 0.12, 0.1, C.steel, [x, y, 0.64]);
  b.box(1.4, 0.06, 0.6, '#6f7f3e', [-0.4, 0.2, 1.3]); // jardim
  a.box(2.62, 0.1, 0.02, '#ffffff', [0, 2.7, 0.56]);
  return { base: l.build(), moving: null, height: 3.2 };
}

function buildWarehouse(): Omit<BuildingModel, 'detail'> {
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
  warehouseDetail(b);
  return { base: l.build(), moving: null, height: 2.0 };
}

function buildSilo(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(1.8, 0.1, 1.8, C.concreteDark, [0, 0.05, 0]);
  b.cyl(0.55, 0.55, 2.0, C.concreteLight, [-0.15, 1.1, -0.1], undefined, 14);
  b.sphere(0.56, C.metal, [-0.15, 2.1, -0.1], [1, 0.55, 1], 14);
  for (const y of [0.6, 1.2, 1.8]) b.cyl(0.57, 0.57, 0.05, C.metal, [-0.15, y, -0.1], undefined, 14);
  b.box(0.06, 2.2, 0.06, C.steel, [0.45, 1.1, 0.35]); // escada
  b.box(0.5, 0.35, 0.4, C.metalDark, [0.45, 0.25, 0.55]); // moega
  a.cyl(0.565, 0.565, 0.12, '#ffffff', [-0.15, 1.5, -0.1], undefined, 14);
  siloDetail(b);
  return { base: l.build(), moving: null, height: 2.4 };
}

function buildOilTank(): Omit<BuildingModel, 'detail'> {
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
  oilTankDetail(b);
  return { base: l.build(), moving: null, height: 1.3 };
}

/** Arco semicilíndrico achatado ao longo de z (cobertura de hangar). */
function arcRoof(radius: number, length: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, 12, 1, false, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 0.55, 1);
  return g;
}
