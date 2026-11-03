import { buildCoalPlant, buildSolarFarm, buildWindFarm } from './power.ts';
import { buildIronDome } from './ironDome.ts';
import * as THREE from 'three';
import { buildHospital, buildPoliceStation, buildRefinery, buildSchool, buildSteelMill } from './chains.ts';
import { buildCharcoalKiln, buildEucalyptusForest, buildUndergroundMine, buildUniversity } from './production.ts';
import { buildFinancialCenter, buildHydroDam, buildNetwork5g, buildNuclearPlant, buildSpaceCenter, buildTankTrap } from './projects.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType } from '../../../../shared/sim/config.ts';
import type { SpecId } from '../../../../shared/sim/upgrades.ts';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { modulesFor } from './upgradeModules.ts';
import { strut } from './rigging.ts';
import { pumpjack, type PumpRig } from './pumpjack.ts';
import { tractor } from './crops.ts';
import { barracksDetail, factoryDetail, houseDetail, oilTankDetail, SILO_LEG, SILO_WALL_TOP, SILO_X, SILO_Z, siloBin, siloRoof } from './details.ts';
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
  /**
   * Painéis fotovoltaicos (só a camada `body` é usada): material próprio, azul-escuro e liso, que reflete o sol
   * conforme o ângulo; não muda com a era.
   */
  panels?: ModelLayers;
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
  | {
      kind: 'spin';
      axis: 'x' | 'y' | 'z';
      speed: number;
      /** Rajadas: a velocidade varia ±gust (fração) devagar, com frequência `gustSpeed` (rad/s) e fase própria. */
      gust?: number;
      gustSpeed?: number;
      phase?: number;
    }
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

/**
 * Edifícios que ganharam terreno maior depois de modelados (pedido do usuário, 01/11): o modelo inteiro, com os
 * módulos de melhoria, é ampliado por igual, mantendo as proporções do desenho. Tanque e silo passaram de 1×1 para
 * 2×2 e o armazém de 2×2 para 3×3; o Terminal Comercial também foi para 3×3 (02/11).
 */
export const MODEL_SCALE: Partial<Record<BuildingType, number>> = { oil_tank: 2, silo: 2, warehouse: 1.5, market: 1.5 };

function scaleLayers(l: ModelLayers, k: number): void {
  for (const g of [l.body, l.accent, l.glass]) if (g.getAttribute('position')) g.scale(k, k, k);
}

function baseModel(type: BuildingType): BuildingModel {
  let m = cache.get(type);
  if (!m) {
    m = { ...BUILDERS[type](), detail: null };
    const k = MODEL_SCALE[type];
    if (k) {
      scaleLayers(m.base, k);
      m.height *= k;
      if (m.smoke) m.smoke = m.smoke.map(([x, y, z]) => [x * k, y * k, z * k]);
    }
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
  // módulos desenhados nas coordenadas do modelo original: ampliados junto com a base
  const k = MODEL_SCALE[type];
  if (k) {
    scaleLayers(extra, k);
    scaleLayers(detail, k);
    height = Math.max(base.height, ...mods.map((m) => (m.height ?? 0) * k));
    for (let i = (base.smoke ?? []).length; i < smoke.length; i++) smoke[i] = smoke[i]!.map((v) => v * k) as [number, number, number];
  }
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
  coal_plant: buildCoalPlant,
  wind_farm: buildWindFarm,
  solar_farm: buildSolarFarm,
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
  iron_dome: buildIronDome,
  research_center: buildResearchCenterModel,
  city_hall: buildCityHallModel,
  nuclear_plant: buildNuclearPlant,
  network_5g: buildNetwork5g,
  hydro_dam: buildHydroDam,
  financial_center: buildFinancialCenter,
  space_center: buildSpaceCenter,
  tank_trap: buildTankTrap,
  refinery: buildRefinery,
  steel_mill: buildSteelMill,
  hospital: buildHospital,
  school: buildSchool,
  police_station: buildPoliceStation,
  university: buildUniversity,
  eucalyptus_forest: buildEucalyptusForest,
  charcoal_kiln: buildCharcoalKiln,
  underground_mine: buildUndergroundMine,
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
  // portão principal aberto: interior iluminado, ponte rolante e um tanque saindo da linha de montagem
  b.box(1.2, 1.1, 0.4, '#2c2a27', [-0.6, 0.72, 1.28]);
  b.box(1.2, 0.02, 0.4, '#5a5650', [-0.6, 0.175, 1.28]);
  for (let i = 0; i < 3; i++) b.box(0.24, 0.06, 0.02, '#e9dfb8', [-0.95 + i * 0.35, 1.2, 1.1]);
  b.cyl(0.1, 0.1, 1.24, C.metal, [-0.6, 1.33, 1.5], [0, 0, Math.PI / 2], 8);
  b.box(1.16, 0.08, 0.08, C.yellow, [-0.6, 1.12, 1.3]);
  b.box(0.16, 0.1, 0.12, C.metalDark, [-0.45, 1.04, 1.3]);
  strut(b, [-0.45, 1.0, 1.3], [-0.45, 0.62, 1.3], 0.008, C.metalDark);
  for (const s of [-1, 1]) b.box(0.06, 1.12, 0.08, C.yellow, [-0.6 + s * 0.62, 0.72, 1.49]);
  // o tanque: casco, lagartas, torre e canhão apontando para fora
  const [tx, tz] = [-0.6, 1.62];
  b.box(0.58, 0.2, 0.86, C.oliveDark, [tx, 0.32, tz]);
  b.box(0.6, 0.06, 0.3, C.olive, [tx, 0.43, tz + 0.3], [0.35, 0, 0]);
  for (const s of [-1, 1]) {
    b.box(0.14, 0.17, 0.92, '#2a2b28', [tx + s * 0.32, 0.25, tz]);
    for (let k = 0; k < 4; k++) b.cyl(0.06, 0.06, 0.03, '#4a4c47', [tx + s * 0.4, 0.24, tz - 0.33 + k * 0.22], [0, 0, Math.PI / 2], 8);
  }
  b.box(0.38, 0.14, 0.42, C.olive, [tx, 0.49, tz - 0.05]);
  b.cyl(0.025, 0.03, 0.62, C.oliveDark, [tx, 0.5, tz + 0.43], [Math.PI / 2, 0, 0], 6);
  a.box(0.2, 0.03, 0.2, '#ffffff', [tx, 0.57, tz - 0.05]);
  // escritório: duas fileiras de janelas à direita
  windows(b, g, 'z', 1.47, 0.5, 1.5, 1.2, 3, 0.26, 0.32);
  windows(b, g, 'z', 1.47, 1.05, 1.5, 0.68, 2, 0.26, 0.28);
  // chapa nervurada na parte alta das laterais e do fundo, e faixa de janelas alta
  for (let z = -1.3; z <= 1.3; z += 0.13) for (const s of [-1, 1]) b.box(0.02, 0.5, 0.03, '#5e6368', [s * 1.758, 1.45, z]);
  for (let x = -1.6; x <= 1.6; x += 0.13) b.box(0.03, 0.5, 0.02, '#5e6368', [x, 1.45, -1.458]);
  for (const s of [-1, 1]) g.box(0.02, 0.12, 2.2, '#ffffff', [s * 1.762, 1.62, 0]);
  // exaustores no telhado
  for (const x of [-1.5, -0.35, 0.8]) for (const z of [-0.8, 0.8]) {
    b.cyl(0.11, 0.11, 0.12, C.metal, [x, 1.81, z], undefined, 8);
    b.cyl(0.13, 0.13, 0.03, C.metalDark, [x, 1.88, z], undefined, 8);
  }
  // blindado pronto estacionado na frente
  const [vx, vz] = [1.1, 1.78];
  b.box(0.72, 0.2, 0.3, C.olive, [vx, 0.38, vz]);
  b.box(0.3, 0.1, 0.24, C.oliveDark, [vx - 0.05, 0.52, vz]);
  b.cyl(0.018, 0.02, 0.35, C.oliveDark, [vx + 0.25, 0.53, vz], [0, 0, Math.PI / 2], 6);
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) b.cyl(0.07, 0.07, 0.05, C.rubber, [vx - 0.27 + k * 0.18, 0.24, vz + s * 0.15], [Math.PI / 2, 0, 0], 8);
  windows(b, g, 'x', 1.77, -1.0, 1.0, 1.2, 4, 0.28, 0.32);
  // chaminés listradas
  for (const [x, z, h] of [
    [1.25, -1.05, 2.6],
    [0.7, -1.15, 2.1],
  ] as const) {
    b.cyl(0.16, 0.2, h, C.concreteLight, [x, h / 2 + 0.2, z], undefined, 10);
    a.cyl(0.165, 0.165, 0.2, '#ffffff', [x, h - 0.1, z], undefined, 10);
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
  b.box(3.9, 0.06, 3.9, '#5a554c', [0, 0.03, 0]);
  b.box(3.6, 0.012, 3.6, '#7a7468', [0, 0.066, 0]); // locação de cascalho compactado
  // cavalo-mecânico real ao longo de x, cabeça de cavalo sobre a cabeça de poço (x ≈ 0,95)
  const rig = pumpjack({ b }, [0, 0, 0.3]);
  // porão de concreto em volta da cabeça de poço e a mancha de óleo
  b.box(0.56, 0.05, 0.56, C.concrete, [0.95, 0.07, 0.3]);
  b.box(0.42, 0.012, 0.42, '#2b2d30', [0.95, 0.1, 0.3]);
  b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.006, 7), '#17191b', { pos: [0.98, 0.075, 0.62], scale: [1.2, 1, 0.8] });
  // linha de produção (tubo branco em suportes) da cabeça de poço até o manifold
  const pipeY = 0.42;
  b.cyl(0.035, 0.035, 1.3, '#d8d9d4', [0.95, pipeY, -0.4], [Math.PI / 2, 0, 0], 8);
  for (const z of [-0.35, -0.85]) {
    b.box(0.05, pipeY, 0.05, '#c9372c', [0.95, pipeY / 2 + 0.03, z]);
    b.box(0.14, 0.03, 0.05, '#e6e6e0', [0.95, pipeY - 0.04, z]);
  }
  // manifold sobre skid: tubos, válvulas com volante e a placa do poço com a cor da nação
  b.box(0.7, 0.06, 0.45, '#2b2d30', [1.1, 0.1, -1.1]);
  b.cyl(0.045, 0.045, 0.6, '#d8d9d4', [1.1, 0.32, -1.05], [0, 0, Math.PI / 2], 6);
  for (const x of [0.88, 1.1, 1.32]) {
    b.cyl(0.04, 0.04, 0.2, '#d8d9d4', [x, 0.22, -1.05], undefined, 6);
    b.box(0.08, 0.08, 0.08, C.red, [x, 0.32, -1.05]);
    b.cyl(0.006, 0.006, 0.1, C.metalDark, [x, 0.4, -1.05], undefined, 4);
    b.cyl(0.05, 0.05, 0.012, C.red, [x, 0.45, -1.05], undefined, 6);
  }
  b.cyl(0.012, 0.012, 0.5, C.steel, [1.48, 0.3, -1.3], undefined, 4);
  a.box(0.26, 0.16, 0.012, '#ffffff', [1.48, 0.52, -1.29]);
  // tanque de produto químico, ao lado do poço
  b.box(0.2, 0.22, 0.2, '#e8e8e2', [0.55, 0.18, -0.55]);
  // poste da rede com o transformador e o cabo até o painel do motor (com cobertura e eletroduto)
  b.cyl(0.03, 0.04, 1.7, '#7a5a3a', [-1.75, 0.92, -1.25], undefined, 6);
  b.box(0.36, 0.03, 0.03, '#7a5a3a', [-1.75, 1.66, -1.25]);
  b.cyl(0.07, 0.07, 0.18, '#8d939a', [-1.68, 1.35, -1.25], undefined, 6);
  strut(b, [-1.7, 1.3, -1.22], [-1.6, 0.55, -0.48], 0.006, '#26282b', true);
  b.box(0.3, 0.42, 0.14, '#9aa0a6', [-1.6, 0.27, -0.45]);
  b.box(0.38, 0.03, 0.26, '#6c7177', [-1.6, 0.55, -0.42]);
  b.box(0.04, 0.3, 0.04, C.metalDark, [-1.45, 0.42, -0.3]);
  b.box(0.04, 0.03, 0.75, '#2b2d30', [-1.6, 0.08, -0.05]);
  // biruta (sinaliza o vento por causa do gás)
  b.cyl(0.012, 0.012, 1.2, C.steel, [1.8, 0.66, -0.6], undefined, 4);
  for (let k = 0; k < 2; k++) b.cyl(0.05 - k * 0.01, 0.06 - k * 0.01, 0.1, k % 2 ? '#f2f2ee' : '#e86a1c', [1.8 - 0.06 - k * 0.1, 1.2 - k * 0.03, -0.6], [0, 0, Math.PI / 2 - 0.25], 6);
  const beam = { layers: rig.beam, pivot: rig.pivot, kind: 'pump' as const };
  return { base: l.build(), moving: beam, pump: { crank: rig.crank, pitman: rig.pitman, rod: rig.rod, crankPivot: rig.crankPivot, rodPivot: rig.rodPivot }, height: 2.3 };
}

function buildTower(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.8, 0.14, 1.8, C.concreteDark, [0, 0.07, 0]);
  const h = 3.0;
  // pernas inclinadas (mais abertas no chão) sobre sapatas de concreto
  const leg = (y: number): number => 0.57 - (0.11 * (y - 0.14)) / (h - 0.14);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  for (const [sx, sz] of corners) {
    b.box(0.22, 0.12, 0.22, C.concrete, [sx * 0.57, 0.2, sz * 0.57]);
    strut(b, [sx * 0.57, 0.26, sz * 0.57], [sx * 0.46, h, sz * 0.46], 0.095, C.woodDark);
  }
  // travessas horizontais e contraventamento em X de perna a perna nas quatro faces
  const lv = [0.3, 1.2, 2.1, h - 0.05];
  for (let i = 0; i < lv.length; i++) {
    const y = lv[i]!;
    const w = leg(y);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k]!;
      const [bx, bz] = corners[(k + 1) % 4]!;
      strut(b, [ax * w, y, az * w], [bx * w, y, bz * w], 0.045, C.wood);
      if (i < lv.length - 1) {
        const y2 = lv[i + 1]!;
        const w2 = leg(y2);
        strut(b, [ax * w, y, az * w], [bx * w2, y2, bz * w2], 0.035, C.wood);
        strut(b, [bx * w, y, bz * w], [ax * w2, y2, az * w2], 0.035, C.wood);
      }
    }
  }
  // escada de mão na face da frente até o alçapão da plataforma
  for (const dx of [-0.13, 0.13]) strut(b, [0.2 + dx, 0.14, 0.82], [0.2 + dx, h + 0.05, 0.42], 0.022, C.steel);
  for (let k = 1; k < 13; k++) {
    const f = k / 13;
    b.box(0.26, 0.018, 0.018, C.steel, [0.2, 0.14 + f * (h - 0.09), 0.82 - f * 0.4]);
  }
  // plataforma de tábuas com mãos-francesas, passarela e guarda-corpo
  b.box(1.42, 0.08, 1.42, C.woodDark, [0, h + 0.04, 0]);
  for (let k = 0; k < 7; k++) b.box(1.4, 0.006, 0.012, '#4a3626', [0, h + 0.083, -0.6 + k * 0.2]);
  for (const [sx, sz] of corners) {
    strut(b, [sx * leg(h - 0.5), h - 0.5, sz * leg(h - 0.5)], [sx * 0.66, h, sz * 0.46], 0.03, C.woodDark);
    strut(b, [sx * leg(h - 0.5), h - 0.5, sz * leg(h - 0.5)], [sx * 0.46, h, sz * 0.66], 0.03, C.woodDark);
  }
  for (const [sx, sz] of corners) b.box(0.04, 0.32, 0.04, C.woodDark, [sx * 0.68, h + 0.24, sz * 0.68]);
  for (const y of [h + 0.22, h + 0.39]) {
    for (const s of [-1, 1]) {
      b.box(1.38, 0.025, 0.025, C.wood, [0, y, s * 0.68]);
      if (s === 1) continue;
      b.box(0.025, 0.025, 1.38, C.wood, [0.68, y, 0]);
      b.box(0.025, 0.025, 1.38, C.wood, [-0.68, y, 0]);
    }
  }
  // cabine: parede baixa de tábuas, faixa de janelas com montantes e a verga
  b.box(1.1, 0.34, 1.1, C.wood, [0, h + 0.25, 0]);
  for (let k = 0; k < 3; k++) {
    const y = h + 0.14 + k * 0.1;
    b.box(1.112, 0.008, 1.112, '#6f5236', [0, y, 0]);
  }
  g.box(1.04, 0.3, 1.04, '#ffffff', [0, h + 0.57, 0]);
  for (const [sx, sz] of corners) b.box(0.07, 0.62, 0.07, C.woodDark, [sx * 0.52, h + 0.45, sz * 0.52]);
  for (const s of [-1, 1])
    for (const k of [-0.18, 0.18]) {
      b.box(0.03, 0.3, 0.03, C.woodDark, [k, h + 0.57, s * 0.525]);
      b.box(0.03, 0.3, 0.03, C.woodDark, [s * 0.525, h + 0.57, k]);
    }
  b.box(1.12, 0.06, 1.12, C.woodDark, [0, h + 0.75, 0]);
  // telhado de quatro águas com beiral e a faixa da nação na testeira
  const roof = new THREE.CylinderGeometry(0.03, 1.04, 0.42, 4);
  roof.deleteAttribute('normal');
  b.add(roof, C.roof, { pos: [0, h + 0.99, 0], rot: [0, Math.PI / 4, 0] });
  b.box(1.48, 0.06, 1.48, C.woodDark, [0, h + 0.8, 0]);
  for (const s of [-1, 1]) {
    a.box(1.5, 0.08, 0.014, '#ffffff', [0, h + 0.8, s * 0.746]);
    a.box(0.014, 0.08, 1.5, '#ffffff', [s * 0.746, h + 0.8, 0]);
  }
  // holofote com forquilha no canto, metralhadora no pino da janela da frente, antena e bandeira no topo
  b.box(0.04, 0.12, 0.04, C.metalDark, [0.6, h + 0.5, 0.6]);
  b.cyl(0.09, 0.12, 0.16, C.metalDark, [0.6, h + 0.6, 0.6], [0.6, 0, -0.6], 8);
  b.cyl(0.085, 0.085, 0.01, '#f2e6a0', [0.65, h + 0.65, 0.65], [0.6, 0, -0.6], 8);
  b.box(0.03, 0.1, 0.03, C.metalDark, [-0.25, h + 0.47, 0.58]);
  b.box(0.06, 0.06, 0.3, '#2b2e31', [-0.25, h + 0.55, 0.66]);
  b.box(0.012, 0.012, 0.2, '#2b2e31', [-0.25, h + 0.56, 0.9]);
  b.cyl(0.006, 0.006, 0.5, C.steel, [-0.42, h + 1.05, -0.42], undefined, 4);
  b.cyl(0.008, 0.008, 0.45, C.steel, [0, h + 1.38, 0], undefined, 4);
  a.box(0.2, 0.12, 0.008, '#ffffff', [0.1, h + 1.52, 0]);
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

/**
 * Armazém de recursos (2×2), depósito logístico em low poly. O volume do galpão é o mesmo de antes (os módulos de
 * melhoria se encaixam nele):
 * - galpão com base de concreto e chapa ondulada em cima, faixa de janelas alta, claraboias e lanternim no telhado;
 * - doca elevada com três portões de enrolar, para-choques, niveladores, escada e luminárias;
 * - escritório no canto da fachada (janelas e porta);
 * - pátio com o estoque à vista: toras, blocos de pedra, barras de ferro, tambores de petróleo, caixas em paletes,
 *   contêineres na cor da nação e uma empilhadeira.
 */
function buildWarehouse(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  slab(b, 4);
  b.box(3.7, 0.012, 1.0, '#6d6a63', [0, 0.166, 1.45]);
  // --- galpão: base de concreto e chapa ondulada
  const [W, D, cz] = [3.3, 2.4, -0.3];
  const front = cz + D / 2;
  b.box(W, 0.38, D, C.concreteDark, [0, 0.35, cz]);
  b.box(W - 0.02, 0.95, D - 0.02, '#8d9296', [0, 1.0, cz]);
  for (let x = -W / 2 + 0.08; x <= W / 2 - 0.05; x += 0.15) b.box(0.03, 0.93, 0.02, '#787d82', [x, 1.0, cz - D / 2 - 0.005]);
  for (let z = cz - D / 2 + 0.08; z <= front - 0.05; z += 0.15) for (const s of [-1, 1]) b.box(0.02, 0.93, 0.03, '#787d82', [s * (W / 2 + 0.005), 1.0, z]);
  // faixa de janelas alta nas laterais
  for (const s of [-1, 1]) g.box(0.02, 0.14, D - 0.4, '#ffffff', [s * (W / 2 + 0.012), 1.32, cz]);
  b.gable(W + 0.1, D + 0.1, 0.45, C.roof, [0, 1.47, cz]);
  // lanternim (respiro na cumeeira) e claraboias nas águas
  b.box(W * 0.7, 0.1, 0.2, '#5c6166', [0, 1.95, cz]);
  b.gable(W * 0.7, 0.3, 0.08, C.roof, [0, 2.0, cz]);
  for (const x of [-1.05, 0, 1.05]) for (const s of [-1, 1]) g.box(0.5, 0.02, 0.32, '#ffffff', [x, 1.7, cz + s * 0.55], [s * -0.35, 0, 0]);
  // --- fachada: três portões de enrolar com moldura, escritório no canto e faixa da nação
  for (const x of [-1.05, 0, 1.05]) {
    b.box(0.74, 0.78, 0.04, C.metalDark, [x, 0.73, front + 0.01]);
    for (let i = 0; i < 6; i++) b.box(0.72, 0.015, 0.05, C.metal, [x, 0.4 + i * 0.13, front + 0.02]);
    for (const s of [-1, 1]) b.box(0.05, 0.84, 0.06, C.yellow, [x + s * 0.4, 0.73, front + 0.02]);
    b.box(0.86, 0.05, 0.06, C.yellow, [x, 1.15, front + 0.02]);
    b.box(0.1, 0.06, 0.08, '#e8e4c8', [x, 1.25, front + 0.05]);
  }
  a.box(W + 0.02, 0.1, 0.02, '#ffffff', [0, 1.36, front + 0.012]);
  // escritório: janelas no alto à esquerda
  g.box(0.5, 0.14, 0.02, '#ffffff', [-1.4, 1.2, front + 0.012]);
  // --- doca elevada: plataforma, para-choques, niveladores e escada
  b.box(W, 0.28, 0.45, C.concrete, [0, 0.3, front + 0.22]);
  b.box(W, 0.03, 0.05, C.yellow, [0, 0.455, front + 0.43]);
  for (const x of [-1.05, 0, 1.05]) {
    for (const s of [-1, 1]) b.box(0.08, 0.12, 0.05, '#1b1b1b', [x + s * 0.32, 0.3, front + 0.47]);
    b.box(0.5, 0.02, 0.3, '#4b5056', [x, 0.452, front + 0.24]);
  }
  for (let i = 0; i < 3; i++) b.box(0.3, 0.09, 0.12, C.concreteDark, [W / 2 + 0.17, 0.2 + i * 0.09, front + 0.38 - i * 0.1]);
  // calhas e tubos de descida
  for (const s of [-1, 1]) b.cyl(0.025, 0.025, 1.25, C.metalDark, [s * (W / 2 - 0.05), 0.85, front + 0.03], undefined, 6);

  // --- pátio: o estoque à vista
  const yz = 1.55;
  // toras em pirâmide
  for (const [x, y] of [
    [-1.62, 0.27],
    [-1.4, 0.27],
    [-1.18, 0.27],
    [-1.51, 0.46],
    [-1.29, 0.46],
    [-1.4, 0.65],
  ] as const)
    b.cyl(0.1, 0.1, 0.75, C.wood, [x, y, yz], [Math.PI / 2, 0, 0], 8);
  // blocos de pedra
  for (const [x, y] of [
    [-0.82, 0.29],
    [-0.52, 0.29],
    [-0.67, 0.53],
  ] as const)
    b.box(0.27, 0.24, 0.27, C.stone, [x, y, yz]);
  // barras de ferro em palete
  b.box(0.42, 0.06, 0.32, C.wood, [-0.12, 0.2, yz]);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) b.box(0.38, 0.07, 0.08, '#7e858c', [-0.12, 0.27 + k * 0.07, yz - 0.1 + i * 0.1]);
  // caixas em paletes
  for (const [x, z, y] of [
    [0.38, yz - 0.15, 0.32],
    [0.38, yz + 0.15, 0.32],
    [0.38, yz, 0.56],
  ] as const) {
    b.box(0.26, 0.04, 0.26, C.wood, [x, y - 0.13, z]);
    b.box(0.24, 0.22, 0.24, '#a8875a', [x, y, z]);
  }
  // tambores de petróleo
  for (const [x, z] of [
    [0.8, yz - 0.14],
    [0.98, yz - 0.14],
    [0.89, yz + 0.04],
  ] as const)
    b.cyl(0.08, 0.08, 0.26, '#3d4a57', [x, 0.3, z], undefined, 8);
  // contêineres na cor da nação (dois empilhados)
  a.box(0.42, 0.42, 0.95, '#ffffff', [1.62, 0.38, yz - 0.05]);
  b.box(0.42, 0.42, 0.95, '#7b8188', [1.62, 0.8, yz - 0.05]);
  for (const y of [0.38, 0.8]) for (let i = 0; i < 4; i++) b.box(0.44, 0.38, 0.015, '#5d636a', [1.62, y, yz - 0.45 + i * 0.27]);
  // empilhadeira
  const [fx, fz] = [1.05, 0.62 + front - 0.3 + 0.4];
  b.box(0.3, 0.16, 0.4, C.yellow, [fx, 0.3, fz]);
  b.box(0.26, 0.04, 0.24, C.metalDark, [fx, 0.58, fz + 0.05]);
  for (const s of [-1, 1]) b.box(0.025, 0.36, 0.025, C.metalDark, [fx + s * 0.11, 0.4, fz + 0.15]);
  for (const s of [-1, 1]) b.box(0.025, 0.42, 0.025, C.metalDark, [fx + s * 0.08, 0.4, fz - 0.21]);
  for (const s of [-1, 1]) b.box(0.04, 0.02, 0.32, C.metalDark, [fx + s * 0.07, 0.22, fz - 0.37]);
  for (const s of [-1, 1]) for (const dz of [-0.13, 0.13]) b.cyl(0.07, 0.07, 0.05, C.rubber, [fx + s * 0.16, 0.24, fz + dz], [0, 0, Math.PI / 2], 8);
  return { base: l.build(), moving: null, height: 2.05 };
}

function buildSilo(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(1.8, 0.1, 1.8, C.concreteDark, [0, 0.05, 0]);
  siloBin(b, 0.1, SILO_WALL_TOP);
  siloRoof(b, SILO_WALL_TOP);
  // faixa da nação no alto do costado
  a.cyl(0.572, 0.572, 0.12, '#ffffff', [SILO_X, 1.45, SILO_Z], undefined, 18);
  // porta de acesso e ventilador de aeração ao pé do costado
  const door = 1.6;
  b.box(0.26, 0.4, 0.04, '#7c848b', [SILO_X + Math.cos(door) * 0.565, 0.33, SILO_Z + Math.sin(door) * 0.565], [0, Math.PI / 2 - door, 0]);
  const fan = 5.0;
  const fx = (r: number): V3 => [SILO_X + Math.cos(fan) * r, 0.24, SILO_Z + Math.sin(fan) * r];
  b.box(0.18, 0.18, 0.14, '#8d959c', fx(0.6), [0, Math.PI / 2 - fan, 0]);
  b.cyl(0.1, 0.1, 0.12, '#6c747b', fx(0.72), [0, -fan, -Math.PI / 2], 8);
  b.cyl(0.075, 0.075, 0.125, '#2b2e31', fx(0.72), [0, -fan, -Math.PI / 2], 8);
  // escada marinheiro com gaiola no lado +x
  const lx = SILO_X + 0.6;
  for (let y = 0.25; y < SILO_WALL_TOP; y += 0.12) b.box(0.012, 0.012, 0.16, C.steel, [lx, y, SILO_Z]);
  for (const dz of [-0.08, 0.08]) b.box(0.012, SILO_WALL_TOP - 0.1, 0.012, C.steel, [lx, (SILO_WALL_TOP + 0.1) / 2 + 0.05, SILO_Z + dz]);
  for (let y = 0.8; y < SILO_WALL_TOP + 0.05; y += 0.3)
    b.add(new THREE.TorusGeometry(0.13, 0.008, 3, 10, Math.PI), C.steel, { pos: [lx - 0.02, y, SILO_Z], rot: [Math.PI / 2, 0, -Math.PI / 2] });
  // escada do telhado até o respiro
  strut(b, [SILO_X + 0.56, SILO_WALL_TOP + 0.03, SILO_Z + 0.05], [SILO_X + 0.1, SILO_WALL_TOP + 0.43, SILO_Z + 0.05], 0.01, C.steel, true);
  strut(b, [SILO_X + 0.56, SILO_WALL_TOP + 0.03, SILO_Z - 0.05], [SILO_X + 0.1, SILO_WALL_TOP + 0.43, SILO_Z - 0.05], 0.01, C.steel, true);
  // elevador de canecas: pé com a moega de descarga, torre, cabeça e a calha até o topo do silo
  const [ex, ez] = SILO_LEG;
  b.box(0.26, 0.22, 0.26, '#8d959c', [ex, 0.21, ez]);
  b.box(0.13, 2.3, 0.13, '#a7aeb4', [ex, 1.3, ez]);
  for (let y = 0.6; y < 2.4; y += 0.45) b.box(0.15, 0.03, 0.15, '#7c848b', [ex, y, ez]);
  b.box(0.22, 0.16, 0.2, '#8d959c', [ex, 2.46, ez - 0.02]);
  a.box(0.225, 0.05, 0.205, '#ffffff', [ex, 2.43, ez - 0.02]);
  strut(b, [ex - 0.06, 2.42, ez - 0.06], [SILO_X + 0.05, SILO_WALL_TOP + 0.47, SILO_Z + 0.04], 0.028, '#9ea2a6', true);
  strut(b, [ex - 0.06, 1.3, ez - 0.06], [SILO_X + 0.4, 1.3, SILO_Z + 0.4], 0.015, C.steel);
  strut(b, [ex + 0.06, 1.1, ez + 0.06], [ex + 0.3, 0.1, ez + 0.3], 0.012, C.steel);
  // moega de descarga dos caminhões: grade no piso e a guia de concreto
  b.box(0.42, 0.04, 0.3, C.concrete, [ex - 0.05, 0.11, 0.78]);
  b.box(0.34, 0.012, 0.22, '#2b2e31', [ex - 0.05, 0.135, 0.78]);
  for (let k = 0; k < 4; k++) b.box(0.012, 0.014, 0.22, C.steel, [ex - 0.17 + k * 0.08, 0.142, 0.78]);
  return { base: l.build(), moving: null, height: 2.5 };
}

function buildOilTank(): Omit<BuildingModel, 'detail'> {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(1.8, 0.1, 1.8, C.concreteDark, [0, 0.05, 0]);
  b.box(1.6, 0.01, 1.6, '#8a8478', [0, 0.105, 0]); // piso de brita dentro do dique
  // dique de contenção com a escada de transposição e a caixa de drenagem
  for (const [x, z, w, d] of [
    [0, 0.85, 1.8, 0.1],
    [0, -0.85, 1.8, 0.1],
    [0.85, 0, 0.1, 1.8],
    [-0.85, 0, 0.1, 1.8],
  ] as const)
    b.box(w, 0.25, d, C.concrete, [x, 0.2, z]);
  for (let k = 0; k < 3; k++) b.box(0.18, 0.025, 0.06, C.metalDark, [-0.55, 0.12 + k * 0.1, 0.72 + k * 0.06]);
  b.box(0.16, 0.02, 0.16, '#3a3d40', [0.6, 0.11, 0.6]);
  // base de areia/concreto e o costado com as juntas das chapas (cursos horizontais) e o anel de vento no topo
  b.cyl(0.7, 0.72, 0.06, C.concreteLight, [0, 0.13, 0], undefined, 18);
  b.cyl(0.65, 0.65, 0.96, C.white, [0, 0.64, 0], undefined, 18);
  for (const y of [0.36, 0.56, 0.76, 0.98]) b.add(new THREE.CylinderGeometry(0.654, 0.654, 0.012, 18, 1, true), '#c9ccc9', { pos: [0, y, 0] });
  b.cyl(0.69, 0.69, 0.03, C.metal, [0, 1.1, 0], undefined, 18);
  a.cyl(0.656, 0.656, 0.14, '#ffffff', [0, 0.85, 0], undefined, 18);
  // teto cônico raso com respiros, boca de visita e o bocal de medição
  const roof = new THREE.CylinderGeometry(0.08, 0.66, 0.14, 18);
  roof.deleteAttribute('normal');
  b.add(roof, '#b9bdbf', { pos: [0, 1.19, 0] });
  b.cyl(0.07, 0.07, 0.06, C.metal, [0, 1.28, 0], undefined, 8);
  for (const [x, z] of [
    [0.3, -0.2],
    [-0.25, 0.28],
  ] as const) {
    b.cyl(0.035, 0.035, 0.08, C.metalDark, [x, 1.2, z], undefined, 6);
    b.cyl(0.06, 0.06, 0.03, C.metal, [x, 1.25, z], undefined, 6);
  }
  // tubulação de entrada e saída: bocais no pé do costado, válvulas e a passagem pelo dique até a régua de tubos
  for (const z of [-0.22, 0.02]) {
    b.cyl(0.04, 0.04, 0.28, C.metalDark, [0.78, 0.24, z], [0, 0, Math.PI / 2], 8);
    b.cyl(0.07, 0.07, 0.03, C.red, [0.78, 0.24, z], [0, 0, Math.PI / 2], 8);
    b.box(0.03, 0.08, 0.03, C.red, [0.78, 0.32, z]);
    b.cyl(0.04, 0.04, 0.1, C.metalDark, [0.88, 0.24, z], [0, 0, Math.PI / 2], 8);
  }
  b.box(0.06, 0.16, 0.5, '#6f6c66', [0.88, 0.18, -0.1]);
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
