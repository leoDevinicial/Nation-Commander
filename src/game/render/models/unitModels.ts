import * as THREE from 'three';
import type { UnitType } from '../../../../shared/sim/config.ts';
import { C, layers, PartBuilder, type ModelLayers } from './kit.ts';

/**
 * Modelos de unidades (frente = +x). Cada unidade tem chassi fixo e, quando aplicável, uma torre
 * que gira para o alvo. Cores militares neutras; a facção aparece em faixas e bandeirolas.
 */
export interface UnitModel {
  hull: ModelLayers;
  turret: ModelLayers | null;
  /** Posição do pivô da torre em relação ao chassi. */
  turretPivot: [number, number, number];
  /** Ponta do cano no referencial da torre (para o clarão do disparo). */
  muzzle: [number, number, number];
  /** Peças que se movem conforme a distância percorrida (esteiras, rodas, pernas). */
  motion: UnitMotion;
  /**
   * Casulo de foguetes articulado (lança-foguetes): gira na dobradiça `hinge` (referencial da
   * torre) entre `stowed` (deitado, em deslocamento) e `raised` (erguido para a salva). `tubes`
   * são as bocas dos tubos no referencial do casulo, que aponta para +x.
   */
  pod?: { layers: ModelLayers; hinge: [number, number, number]; tubes: [number, number, number][]; stowed: number; raised: number };
  /**
   * Canos (peças separadas da torre): giram com ela e recuam sozinhos no disparo. `pivot` é a
   * culatra no referencial da torre, `elev` a elevação (rad) e `muzzle` a boca no referencial do
   * cano, que aponta para +x. `recoil` é o curso do recuo.
   * `spin` (rad/s) faz o feixe de canos girar durante a rajada (Gatling). `lift`: a geometria do cano foi erguida
   * em y por esse valor (a malha desce o mesmo), para a poeira do shader, que vai pela altura local, não pegar nele.
   */
  guns?: { layers: ModelLayers; pivot: V3; elev: number; muzzle: V3; recoil: number; spin?: number; lift?: number }[];
  /** Tipo de disparo visível (projétil que sai da boca do cano). */
  shot?: 'apfsds' | 'howitzer' | 'flak' | 'autocannon' | 'gatling';
  /**
   * Lentes e luzes acesas na torre (referencial da torre): disco brilhante com halo, voltado para `normal`.
   * `color: 'faction'` usa a cor da facção do dono.
   */
  glow?: { at: V3; normal: V3; r: number; color: string | 'faction' }[];
  /** Bocas dos tubos de mísseis interceptadores (referencial da torre, apontando para +x elevado). */
  launchers?: V3[];
}

type V3 = [number, number, number];

/** Peças animadas pelo deslocamento; cada geometria usa o material do corpo (cores de vértice). */
export interface UnitMotion {
  /** Elos da esteira: ramo superior (corre para a frente) e inferior (para trás); passo dos elos. */
  treads: { top: THREE.BufferGeometry; bottom: THREE.BufferGeometry; pitch: number; gauge: number; width: number; length: number } | null;
  /** Rodas que giram: raios das rodas de apoio (veículos de esteira) ou a roda inteira (rodas). */
  wheels: { geo: THREE.BufferGeometry; at: V3[]; r: number }[];
  /** Pernas dos soldados: geometria de uma perna com o quadril na origem e os quadris (pares). */
  legs: { geo: THREE.BufferGeometry; hips: V3[] }[];
}

/** Coleta as peças animadas enquanto um modelo é montado (ver `tracks`, `roadWheels`, `soldier`). */
interface Rig {
  treads: { length: number; z: number; height: number; width: number }[];
  spokes: Map<number, V3[]>;
  rolling: Map<string, { r: number; w: number; at: V3[] }>;
  legs: Map<string, V3[]>;
}
let rig: Rig | null = null;

const LINK_PITCH = 0.09;

function finishRig(r: Rig): UnitMotion {
  let treads: UnitMotion['treads'] = null;
  if (r.treads.length) {
    const top = new PartBuilder();
    const bottom = new PartBuilder();
    for (const t of r.treads) {
      const L = t.length / 2;
      for (let x = -L + 0.04; x <= L - 0.04 - LINK_PITCH; x += LINK_PITCH) {
        top.box(0.035, 0.02, t.width + 0.012, C.rubber, [x, t.height + 0.006, t.z]);
        bottom.box(0.035, 0.03, t.width + 0.03, C.rubber, [x, 0.06, t.z]);
      }
    }
    // bitola (centro → esteira), largura e comprimento: o desenho dos rastros no chão
    const t0 = r.treads[0]!;
    treads = { top: top.build(), bottom: bottom.build(), pitch: LINK_PITCH, gauge: Math.abs(t0.z), width: t0.width, length: t0.length };
  }
  const wheels: UnitMotion['wheels'] = [];
  for (const [rad, at] of r.spokes) {
    // raios sobre o cubo da roda de apoio: o giro fica visível
    const g = new PartBuilder();
    for (let k = 0; k < 3; k++) g.box(rad * 1.5, 0.028, 0.014, C.metalDark, [0, 0, 0], [0, 0, (k * Math.PI) / 3]);
    wheels.push({ geo: g.build(), at, r: rad });
  }
  for (const { r: rad, w, at } of r.rolling.values()) {
    const g = new PartBuilder();
    g.cyl(rad, rad, w, C.rubber, [0, 0, 0], [Math.PI / 2, 0, 0], 12);
    g.cyl(rad * 0.46, rad * 0.46, w + 0.02, C.metal, [0, 0, 0], [Math.PI / 2, 0, 0], 8);
    // porcas e banda de rodagem: marcas que mostram a roda girando
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.box(0.035, 0.035, w + 0.04, C.metalDark, [Math.cos(a) * rad * 0.3, Math.sin(a) * rad * 0.3, 0]);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      g.box(0.05, 0.03, w + 0.01, '#1c1d1e', [Math.cos(a) * rad, Math.sin(a) * rad, 0], [0, 0, a]);
    }
    wheels.push({ geo: g.build(), at, r: rad });
  }
  const legs: UnitMotion['legs'] = [];
  for (const [color, hips] of r.legs) {
    const g = new PartBuilder();
    legParts(g, color, [0, 0, 0]);
    legs.push({ geo: g.build(), hips });
  }
  return { treads, wheels, legs };
}

const cache = new Map<string, UnitModel>();

/**
 * Modelos próprios de uma era (a partir dela): a tropa troca de veículo, não só de pintura. Hoje, no Futuro Próximo:
 * o Lança-Foguetes (caminhão 8×8 blindado com casulo de tubos grandes) e a Artilharia (caminhão 6×6 com torre
 * facetada e cano longo).
 */
const ERA_BUILDERS: Partial<Record<UnitType, { from: number; build: () => BuiltUnit }>> = {
  rocket_artillery: { from: 4, build: buildRocketArtilleryFuture },
  artillery: { from: 4, build: buildArtilleryFuture },
  mbt: { from: 4, build: t90Future },
  mobile_aa: { from: 4, build: buildMobileAaFuture },
};

/** Chave do modelo da unidade na era dada (muda quando a era troca o veículo). */
export function unitModelKey(type: UnitType, era = 1): string {
  const v = ERA_BUILDERS[type];
  return v && era >= v.from ? `${type}@${v.from}` : type;
}

export function unitModel(type: UnitType, era = 1): UnitModel {
  const key = unitModelKey(type, era);
  let m = cache.get(key);
  if (!m) {
    rig = { treads: [], spokes: new Map(), rolling: new Map(), legs: new Map() };
    const v = ERA_BUILDERS[type];
    const built = key !== type && v ? v.build() : BUILDERS[type]();
    m = { ...built, motion: finishRig(rig) };
    rig = null;
    cache.set(key, m);
  }
  return m;
}

export function disposeUnitModels(): void {
  for (const m of cache.values()) {
    for (const l of [m.hull, m.turret, m.pod?.layers, ...(m.guns ?? []).map((g) => g.layers)]) if (l) for (const g of [l.body, l.accent, l.glass]) g.dispose();
    m.motion.treads?.top.dispose();
    m.motion.treads?.bottom.dispose();
    for (const w of m.motion.wheels) w.geo.dispose();
    for (const l of m.motion.legs) l.geo.dispose();
  }
  cache.clear();
}

/** Perna animada (o quadril fica a 0,4 da altura do soldado). */
/** Perna com o quadril em `hip`: coxa e canela, joelheira e bota. */
function legParts(g: PartBuilder, color: string, hip: V3): void {
  const s = 1.25;
  const [x, y, z] = hip;
  g.box(0.1 * s, 0.36 * s, 0.1 * s, color, [x, y - 0.18 * s, z]);
  g.box(0.04 * s, 0.05 * s, 0.11 * s, C.oliveDark, [x + 0.07 * s, y - 0.15 * s, z]);
  g.box(0.16 * s, 0.06 * s, 0.11 * s, C.boot, [x + 0.03 * s, y - 0.37 * s, z]);
}

/**
 * Onde as pernas vão quando o modelo não tem animação (recrutas parados, desenhados em lote):
 * presas ao próprio corpo. Sem isto, o soldado ficaria sem pernas fora do rig.
 */
let staticLegs: PartBuilder | null = null;

function leg(color: string, hip: V3): void {
  if (!rig) {
    if (staticLegs) legParts(staticLegs, color, hip);
    return;
  }
  const list = rig.legs.get(color) ?? [];
  list.push(hip);
  rig.legs.set(color, list);
}

/** Roda de veículo sobre rodas, que gira inteira (pneu, cubo, porcas). */
function rollingWheel(at: V3, r: number, w: number): void {
  if (!rig) return;
  const key = `${r}|${w}`;
  const e = rig.rolling.get(key) ?? { r, w, at: [] };
  e.at.push(at);
  rig.rolling.set(key, e);
}

type BuiltUnit = Omit<UnitModel, 'motion'>;

/**
 * Boca do cano aberta: anel de aço na ponta e o furo escuro (a alma do cano) à mostra, no
 * referencial do cano (aponta para +x).
 */
/** Tubo aberto ao longo de x (de x0 a x1); `inside` vira as faces para dentro (parede interna). */
function tube(b: PartBuilder, x0: number, x1: number, r: number, color: THREE.ColorRepresentation, inside = false, segments = 16): void {
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(r, r, x1 - x0, segments, 1, true);
  if (inside) {
    // inverte a ordem dos vértices de cada triângulo e as normais: a parede passa a ser vista por dentro
    g = g.toNonIndexed();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 3)
      for (const a of [pos, nor]) {
        const t = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)];
        a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
        a.setXYZ(i + 2, t[0]!, t[1]!, t[2]!);
      }
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  }
  b.add(g, color, { pos: [(x0 + x1) / 2, 0, 0], rot: [0, 0, -Math.PI / 2] });
}

/**
 * Boca aberta de verdade na ponta de um cano (eixo x): colar externo, face anelar (a espessura da
 * parede do tubo), alma escura vista por dentro e o fundo preto recuado — de frente se vê o furo
 * com profundidade, não um disco pintado. O colar ocupa de `x - len` a `x` (o cano termina em
 * `x - len`).
 */
function openMuzzle(b: PartBuilder, x: number, len: number, rOut: number, rIn: number, color: THREE.ColorRepresentation, segments = 18): void {
  tube(b, x - len, x, rOut, color, false, segments);
  b.add(new THREE.RingGeometry(rIn, rOut, segments), color, { pos: [x, 0, 0], rot: [0, Math.PI / 2, 0] });
  tube(b, x - len, x, rIn, '#1c1c1b', true, segments);
  b.add(new THREE.CircleGeometry(rIn, segments), '#040404', { pos: [x - len + 0.002, 0, 0], rot: [0, Math.PI / 2, 0] });
}

const BUILDERS: Record<UnitType, () => BuiltUnit> = {
  infantry: buildInfantry,
  apc: buildApc,
  tank: buildTank,
  artillery: buildArtillery,
  at_infantry: buildAtInfantry,
  special_forces: buildSpecialForces,
  mbt: buildMbt,
  rocket_artillery: buildRocketArtillery,
  mobile_aa: buildMobileAa,
  ciws: buildCiws,
  engineer: buildEngineer,
  scout: buildScout,
};

// ------------------------------------------------------------------ infantaria

function soldier(b: PartBuilder, a: PartBuilder, x: number, z: number, variant: number): void {
  const s = 1.25;
  const p = (dx: number, dy: number, dz: number): [number, number, number] => [x + dx * s, dy * s, z + dz * s];
  // pernas e botas: animadas (marcha), fora do corpo fundido
  leg(C.oliveDark, p(0, 0.4, 0.065));
  leg(C.oliveDark, p(variant ? 0.04 : -0.02, 0.4, -0.065));
  // tronco, colete e cinto
  b.box(0.2 * s, 0.32 * s, 0.27 * s, C.olive, p(0, 0.56, 0));
  b.box(0.23 * s, 0.22 * s, 0.29 * s, C.oliveDark, p(0.01, 0.6, 0));
  b.box(0.21 * s, 0.04 * s, 0.28 * s, C.khaki, p(0, 0.42, 0));
  // mochila
  b.box(0.12 * s, 0.24 * s, 0.2 * s, C.khaki, p(-0.16, 0.6, 0));
  // braços segurando o fuzil
  b.box(0.26 * s, 0.07 * s, 0.07 * s, C.olive, p(0.12, 0.62, 0.13), [0, 0.35, -0.25]);
  b.box(0.24 * s, 0.07 * s, 0.07 * s, C.olive, p(0.14, 0.6, -0.1), [0, -0.6, -0.2]);
  // cabeça e capacete
  b.sphere(0.085 * s, C.skin, p(0.01, 0.8, 0), undefined, 8);
  b.sphere(0.105 * s, C.oliveDark, p(0, 0.85, 0), [1, 0.72, 1], 8);
  b.box(0.05 * s, 0.02 * s, 0.2 * s, C.oliveDark, p(0.09, 0.83, 0));
  // fuzil
  b.box(0.52 * s, 0.045 * s, 0.045 * s, C.metalDark, p(0.24, 0.63, 0.04), [0, 0, 0.12]);
  b.box(0.05 * s, 0.1 * s, 0.04 * s, C.metalDark, p(0.2, 0.57, 0.04));
  // equipamento: bolsas de munição no colete, joelheiras, carregador e luvas
  for (const dz of [-0.07, 0.07]) b.box(0.05 * s, 0.08 * s, 0.07 * s, C.khaki, p(0.125, 0.55, dz));
  b.box(0.04 * s, 0.09 * s, 0.035 * s, C.metalDark, p(0.27, 0.57, 0.04), [0, 0, 0.12]);
  b.box(0.05 * s, 0.05 * s, 0.06 * s, C.boot, p(0.26, 0.63, 0.15));
  // faixa do capacete e óculos de proteção
  b.box(0.2 * s, 0.025 * s, 0.215 * s, C.khaki, p(0, 0.82, 0));
  if (variant) {
    // operador de rádio: aparelho nas costas e antena
    b.box(0.08 * s, 0.16 * s, 0.14 * s, C.metalDark, p(-0.24, 0.66, 0));
    b.cyl(0.006 * s, 0.006 * s, 0.6 * s, C.metalDark, p(-0.26, 1.02, 0.05), undefined, 4);
  }
  // insígnia da facção nos ombros
  a.box(0.06 * s, 0.07 * s, 0.03 * s, '#ffffff', p(0, 0.66, 0.15));
  a.box(0.06 * s, 0.07 * s, 0.03 * s, '#ffffff', p(0, 0.66, -0.15));
}

/** Lança-rojão no ombro direito (tubo, ogiva e mira), para a infantaria antitanque. */
function launcher(b: PartBuilder, x: number, z: number): void {
  const s = 1.25;
  const y = 0.78 * s;
  b.cyl(0.05 * s, 0.05 * s, 0.95 * s, C.oliveDark, [x + 0.08 * s, y, z + 0.11 * s], [0, 0, Math.PI / 2 - 0.08], 8);
  b.cyl(0.075 * s, 0.075 * s, 0.12 * s, C.oliveDark, [x + 0.52 * s, y + 0.04 * s, z + 0.11 * s], [0, 0, Math.PI / 2 - 0.08], 8);
  b.cyl(0, 0.07 * s, 0.16 * s, '#6b6a3c', [x + 0.66 * s, y + 0.05 * s, z + 0.11 * s], [0, 0, -Math.PI / 2 - 0.08], 8);
  b.box(0.08 * s, 0.07 * s, 0.05 * s, C.metalDark, [x + 0.1 * s, y + 0.08 * s, z + 0.17 * s]);
  b.box(0.05 * s, 0.12 * s, 0.04 * s, C.metalDark, [x + 0.02 * s, y - 0.08 * s, z + 0.11 * s]);
}

/** Operador de forças especiais: uniforme escuro, colete tático, óculos de visão noturna e fuzil com supressor. */
function operator(b: PartBuilder, a: PartBuilder, x: number, z: number, variant: number): void {
  const s = 1.25;
  const p = (dx: number, dy: number, dz: number): [number, number, number] => [x + dx * s, dy * s, z + dz * s];
  const cloth = '#2f3436';
  const gear = '#3d3a2e';
  leg(cloth, p(0, 0.4, 0.065));
  leg(cloth, p(variant ? 0.05 : -0.02, 0.4, -0.065));
  b.box(0.2 * s, 0.32 * s, 0.27 * s, cloth, p(0, 0.56, 0));
  b.box(0.24 * s, 0.24 * s, 0.3 * s, gear, p(0.01, 0.6, 0));
  for (const dz of [-0.08, 0, 0.08]) b.box(0.05 * s, 0.09 * s, 0.06 * s, '#4a4636', p(0.135, 0.56, dz));
  b.box(0.1 * s, 0.18 * s, 0.18 * s, gear, p(-0.17, 0.62, 0));
  b.box(0.26 * s, 0.07 * s, 0.07 * s, cloth, p(0.12, 0.64, 0.13), [0, 0.35, -0.2]);
  b.box(0.24 * s, 0.07 * s, 0.07 * s, cloth, p(0.14, 0.62, -0.1), [0, -0.6, -0.15]);
  // balaclava, capacete de alto corte e óculos de visão noturna levantados
  b.sphere(0.085 * s, '#1f2224', p(0.01, 0.8, 0), undefined, 8);
  b.sphere(0.1 * s, gear, p(0, 0.86, 0), [1, 0.62, 1], 8);
  b.box(0.06 * s, 0.05 * s, 0.1 * s, C.metalDark, p(0.1, 0.9, 0));
  b.cyl(0.018 * s, 0.018 * s, 0.05 * s, C.metalDark, p(0.13, 0.9, 0.03), [0, 0, Math.PI / 2], 6);
  b.cyl(0.018 * s, 0.018 * s, 0.05 * s, C.metalDark, p(0.13, 0.9, -0.03), [0, 0, Math.PI / 2], 6);
  // fuzil curto com supressor e mira
  b.box(0.42 * s, 0.045 * s, 0.045 * s, '#1f2124', p(0.22, 0.66, 0.04), [0, 0, 0.08]);
  b.cyl(0.03 * s, 0.03 * s, 0.16 * s, '#1f2124', p(0.5, 0.685, 0.04), [0, 0, Math.PI / 2 + 0.08], 6);
  b.box(0.08 * s, 0.05 * s, 0.04 * s, C.metalDark, p(0.2, 0.71, 0.04));
  a.box(0.06 * s, 0.07 * s, 0.03 * s, '#ffffff', p(0, 0.66, 0.16));
  a.box(0.06 * s, 0.07 * s, 0.03 * s, '#ffffff', p(0, 0.66, -0.16));
}

function buildAtInfantry(): BuiltUnit {
  const l = layers();
  soldier(l.body, l.accent, 0.26, 0, 0);
  launcher(l.body, 0.26, 0);
  soldier(l.body, l.accent, -0.24, 0.36, 0);
  launcher(l.body, -0.24, 0.36);
  // municiador: carrega rojões extras nas costas
  soldier(l.body, l.accent, -0.24, -0.36, 0);
  for (const dz of [-0.06, 0.06]) l.body.cyl(0.05, 0.05, 0.5, '#6b6a3c', [-0.48, 0.85, -0.36 + dz], [0.15, 0, 0], 6);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [0.95, 1.05, 0.14] };
}

function buildSpecialForces(): BuiltUnit {
  const l = layers();
  operator(l.body, l.accent, 0.3, 0.05, 0);
  operator(l.body, l.accent, -0.2, 0.38, 1);
  operator(l.body, l.accent, -0.25, -0.32, 0);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [0.75, 0.86, 0.05] };
}

/**
 * Engenheiros de combate: um sapador com detector de minas (haste e prato à frente), outro com pá e
 * mochila de cargas, e um terceiro com o rolo de fita de demarcação.
 */
function buildEngineer(): BuiltUnit {
  const l = layers();
  soldier(l.body, l.accent, 0.26, 0, 0);
  // detector: haste inclinada para a frente e prato rente ao chão
  l.body.cyl(0.015, 0.015, 0.75, C.metalDark, [0.52, 0.42, 0.05], [0, 0, 1.05], 5);
  l.body.cyl(0.12, 0.12, 0.025, '#2f3432', [0.82, 0.1, 0.05], undefined, 10);
  soldier(l.body, l.accent, -0.24, 0.36, 1);
  // pá nas costas e mochila de cargas
  l.body.box(0.16, 0.22, 0.2, '#5b5a3a', [-0.42, 0.85, 0.36]);
  l.body.cyl(0.012, 0.012, 0.5, C.wood, [-0.47, 0.95, 0.46], [0.5, 0, 0], 5);
  l.body.box(0.09, 0.12, 0.02, C.metal, [-0.47, 1.18, 0.58], [0.5, 0, 0]);
  soldier(l.body, l.accent, -0.24, -0.36, 0);
  l.accent.cyl(0.06, 0.06, 0.05, '#ffffff', [-0.1, 0.62, -0.36], [Math.PI / 2, 0, 0], 8);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [0.5, 0.65, 0] };
}

/** Explorador: um batedor só, com binóculo, rádio de antena alta e mochila leve. */
function buildScout(): BuiltUnit {
  const l = layers();
  soldier(l.body, l.accent, 0.05, 0, 0);
  // binóculo diante do rosto
  for (const z of [-0.05, 0.05]) l.body.cyl(0.03, 0.03, 0.12, '#24272a', [0.27, 1.02, z], [0, 0, Math.PI / 2], 8);
  // mochila com rádio e antena
  l.body.box(0.16, 0.24, 0.2, '#56603f', [-0.17, 0.85, 0]);
  l.body.cyl(0.008, 0.008, 0.7, C.metalDark, [-0.2, 1.3, 0.06], undefined, 4);
  l.accent.box(0.05, 0.05, 0.05, '#ffffff', [-0.2, 1.66, 0.06]);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [0.3, 0.7, 0] };
}

function buildInfantry(): BuiltUnit {
  const l = layers();
  soldier(l.body, l.accent, 0.26, 0, 0);
  soldier(l.body, l.accent, -0.24, 0.36, 1);
  soldier(l.body, l.accent, -0.24, -0.36, 0);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [0.5, 0.65, 0] };
}

// ------------------------------------------------------------------ veículos

function roadWheels(b: PartBuilder, xs: number[], y: number, z: number, r: number, width: number, color: string): void {
  for (const x of xs) {
    b.cyl(r, r, width, color, [x, y, z], [Math.PI / 2, 0, 0], 10);
    b.cyl(r * 0.45, r * 0.45, width + 0.02, C.metal, [x, y, z], [Math.PI / 2, 0, 0], 8);
    if (rig) {
      const list = rig.spokes.get(r) ?? [];
      list.push([x, y, z + Math.sign(z) * (width / 2 + 0.018)]);
      rig.spokes.set(r, list);
    }
  }
}

function tracks(b: PartBuilder, length: number, z: number, height: number, width: number): void {
  const L = length / 2;
  b.side(
    [
      [-L, 0.06],
      [L, 0.06],
      [L + 0.12, height * 0.55],
      [L - 0.05, height],
      [-L + 0.05, height],
      [-L - 0.12, height * 0.55],
    ],
    width,
    C.track,
    [0, 0, z],
  );
}

/**
 * Detalhes de esteira: elos no ramo superior, roda motriz dentada atrás, roda tensora na frente
 * e roletes de retorno — o que faz uma esteira low-poly ler como esteira de verdade.
 */
function trackDetail(b: PartBuilder, length: number, z: number, height: number, width: number): void {
  const L = length / 2;
  // os elos dos ramos superior e inferior são animados (ver `finishRig`)
  rig?.treads.push({ length, z, height, width });
  for (let y = 0.12; y < height; y += 0.09) {
    b.box(0.018, 0.035, width + 0.01, C.rubber, [L + 0.08, y, z], [0, 0, -0.6]);
    b.box(0.018, 0.035, width + 0.01, C.rubber, [-L - 0.08, y, z], [0, 0, 0.6]);
  }
  const side = Math.sign(z) * (width / 2 + 0.02);
  // roda motriz (traseira) com dentes e tensora (frente)
  b.cyl(0.15, 0.15, 0.05, C.metalDark, [-L + 0.02, height * 0.62, z + side], [Math.PI / 2, 0, 0], 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.box(0.05, 0.05, 0.04, C.metalDark, [-L + 0.02 + Math.cos(a) * 0.16, height * 0.62 + Math.sin(a) * 0.16, z + side]);
  }
  b.cyl(0.04, 0.04, 0.06, C.steel, [-L + 0.02, height * 0.62, z + side * 1.2], [Math.PI / 2, 0, 0], 6);
  b.cyl(0.13, 0.13, 0.05, C.metal, [L - 0.02, height * 0.6, z + side], [Math.PI / 2, 0, 0], 10);
  for (const x of [-L * 0.45, L * 0.35]) b.cyl(0.05, 0.05, 0.05, C.metal, [x, height - 0.06, z + side * 0.6], [Math.PI / 2, 0, 0], 6);
}

function buildTank(): BuiltUnit {
  return t90(false);
}

/**
 * Tanque no estilo T-90 (o comum) e T-90M (o moderno). Casco baixo e comprido com glacis em cunha
 * coberto de blindagem reativa em "V", seis rodas de apoio grandes à mostra e saias de borracha
 * com painéis reativos só na frente; torre arredondada com os blocos reativos em "V" na frente, os
 * bloqueadores infravermelhos (Shtora) dos dois lados do canhão, cúpula do comandante com
 * metralhadora, mira do atirador, lançadores de fumígenos, caixas laterais e cesto traseiro; canhão
 * longo com luva térmica e evacuador de gases. O moderno é maior, com mais blocos reativos, torre
 * soldada com cesto blindado e estação de armas remota.
 */
function t90(modern: boolean): BuiltUnit {
  const s = modern ? 1.1 : 1;
  const green = modern ? '#626b46' : '#6b7650';
  const dark = modern ? '#4b5236' : '#525c3c';
  const era = modern ? '#5a6340' : '#636e48';
  const hull = layers();
  const b = hull.body;
  const L = 1.12 * s;
  const W = 0.5 * s;
  // casco: lateral baixa e glacis em cunha (a frente sobe até o convés)
  b.side(
    [
      [-L, 0.28],
      [L - 0.1, 0.28],
      [L + 0.14, 0.42],
      [L - 0.12, 0.66],
      [-L + 0.05, 0.68],
      [-L - 0.05, 0.5],
    ],
    W * 2,
    green,
  );
  // esteiras, seis rodas de apoio grandes e detalhes (motriz atrás, tensora na frente)
  const tl = 2.3 * s;
  const tz = 0.62 * s;
  tracks(b, tl, tz, 0.46, 0.3);
  tracks(b, tl, -tz, 0.46, 0.3);
  const xs = [-0.85, -0.51, -0.17, 0.17, 0.51, 0.85].map((x) => x * s);
  roadWheels(b, xs, 0.22, tz + 0.16, 0.2, 0.06, green);
  roadWheels(b, xs, 0.22, -tz - 0.16, 0.2, 0.06, green);
  trackDetail(b, tl, tz, 0.46, 0.3);
  trackDetail(b, tl, -tz, 0.46, 0.3);
  // para-lamas finos ao longo da esteira
  for (const z of [tz, -tz]) b.box(tl + 0.1, 0.03, 0.36, dark, [0, 0.5, z]);
  // saias de borracha com painéis reativos só nos três primeiros vãos (frente)
  for (const z of [tz + 0.19, -tz - 0.19]) {
    for (let i = 0; i < 3; i++) {
      const x = L - 0.2 - i * 0.3 * s;
      b.box(0.28 * s, 0.2, 0.04, era, [x, 0.42, z]);
      b.box(0.24 * s, 0.03, 0.05, dark, [x, 0.5, z]);
    }
    b.box(0.9 * s, 0.1, 0.02, '#2f3127', [-0.35 * s, 0.46, z]);
  }
  // glacis: blocos reativos assentados na rampa frontal, em duas metades levemente em "V"
  {
    const p0 = [L + 0.14, 0.42];
    const p1 = [L - 0.12, 0.66];
    const dx = p1[0]! - p0[0]!;
    const dy = p1[1]! - p0[1]!;
    const len = Math.hypot(dx, dy);
    const nx = dy / len;
    const ny = -dx / len;
    const ang = Math.atan2(dy, dx);
    for (let row = 0; row < 2; row++) {
      const k = 0.28 + row * 0.42;
      const x = p0[0]! + dx * k + nx * 0.03;
      const y = p0[1]! + dy * k + ny * 0.03;
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const z = side * (0.09 + i * 0.14) * s;
          b.box(len * 0.4, 0.05, 0.13, era, [x - Math.abs(z) * 0.08, y, z], [side * 0.18, 0, ang]);
        }
    }
  }
  b.box(0.06, 0.08, W * 1.8, dark, [L + 0.12, 0.34, 0]);
  // faróis com protetores e escotilha do motorista
  for (const z of [0.36, -0.36]) {
    b.box(0.06, 0.07, 0.09, C.steel, [L - 0.06, 0.64, z * s]);
    b.box(0.08, 0.02, 0.12, dark, [L - 0.06, 0.69, z * s]);
  }
  b.box(0.16, 0.035, 0.2, dark, [0.72 * s, 0.69, 0]);
  b.box(0.03, 0.035, 0.12, '#2a3a44', [0.81 * s, 0.71, 0]);
  // convés do motor: grades, tampas e cabo de reboque
  for (let i = 0; i < 6; i++) b.box(0.05, 0.012, 0.66 * s, C.metalDark, [-0.42 * s - i * 0.09, 0.686, 0]);
  b.box(0.36 * s, 0.025, 0.3 * s, dark, [-0.62 * s, 0.69, 0.26 * s]);
  b.cyl(0.016, 0.016, 0.85 * s, C.metal, [-0.98 * s, 0.7, 0.05], [Math.PI / 2, 0, 0], 5);
  // traseira: dois tambores de combustível, tronco de desatolamento e escape
  for (const z of [0.28, -0.28]) b.cyl(0.1, 0.1, 0.32, '#4d5535', [-L - 0.08, 0.62, z * s], [0, 0, Math.PI / 2], 10);
  b.cyl(0.06, 0.06, W * 1.9, '#5b4a35', [-L - 0.02, 0.76, 0], [Math.PI / 2, 0, 0], 8);
  b.box(0.12, 0.08, 0.3, C.metalDark, [-L - 0.02, 0.42, 0.25 * s]);
  // caixas laterais sobre os para-lamas
  for (const z of [tz + 0.06, -tz - 0.06]) for (const x of [-0.75, -0.35, 0.05]) b.box(0.32 * s, 0.11, 0.16, dark, [x * s, 0.58, z]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [-0.85 * s, 0.57, W + 0.012]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [-0.85 * s, 0.57, -W - 0.012]);

  const turret = layers();
  const t = turret.body;
  // torre arredondada: base em planta e cúpula achatada por cima
  t.plan(
    [
      [0.52 * s, 0],
      [0.38 * s, 0.4 * s],
      [-0.25 * s, 0.5 * s],
      [-0.6 * s, 0.36 * s],
      [-0.66 * s, 0],
      [-0.6 * s, -0.36 * s],
      [-0.25 * s, -0.5 * s],
      [0.38 * s, -0.4 * s],
    ],
    0.18,
    green,
  );
  t.sphere(0.52 * s, green, [-0.05 * s, 0.17, 0], [1.05, 0.38, 0.92], 14);
  // blocos reativos em "V" na frente da torre (Kontakt-5 / Relikt)
  for (const side of [-1, 1]) {
    for (let i = 0; i < (modern ? 4 : 3); i++) {
      const z = side * (0.13 + i * 0.1) * s;
      t.box(0.24 * s, 0.13, 0.1, era, [0.42 * s - i * 0.05, 0.22, z], [0, side * 0.55, 0]);
      t.box(0.24 * s, 0.025, 0.1, dark, [0.42 * s - i * 0.05, 0.3, z], [0, side * 0.55, 0]);
    }
  }
  // mantelete e canhão longo com luva térmica, evacuador de gases e freio de boca liso
  t.box(0.22, 0.2, 0.26, dark, [0.56 * s, 0.17, 0]);
  const gun = modern ? 2.0 : 1.85;
  // canhão (peça própria, recua no disparo): tubo afinando, luva térmica, evacuador e boca aberta
  const gunL = layers();
  const gb = gunL.body;
  const g0 = 0.6 * s;
  gb.cyl(0.05, 0.066, gun, dark, [gun / 2, 0, 0], [0, 0, Math.PI / 2], 14);
  for (const x of [0.95, 1.35, 1.95, 2.25]) gb.cyl(0.07, 0.07, 0.04, green, [x * s - g0, 0, 0], [0, 0, Math.PI / 2], 12);
  gb.cyl(0.082, 0.082, 0.24, green, [1.62 * s - g0, 0, 0], [0, 0, Math.PI / 2], 14);
  // boca do canhão de alma lisa: parede grossa, furo largo e fundo escuro
  openMuzzle(gb, gun + 0.16, 0.16, 0.066, 0.042, dark, 20);
  // Shtora: bloqueadores infravermelhos (caixa com lente vermelha) dos dois lados do canhão
  for (const z of [0.22, -0.22]) {
    t.box(0.14, 0.12, 0.15, dark, [0.5 * s, 0.36, z * s]);
    turret.glass.box(0.02, 0.07, 0.09, '#ff6a50', [0.575 * s, 0.36, z * s]);
  }
  // mira do atirador (à direita) e cúpula do comandante com metralhadora (à esquerda)
  t.box(0.2, 0.14, 0.14, dark, [0.18 * s, 0.4, -0.27 * s]);
  turret.glass.box(0.02, 0.08, 0.1, '#ffffff', [0.285 * s, 0.41, -0.27 * s]);
  t.cyl(0.13, 0.14, 0.08, dark, [-0.18 * s, 0.38, 0.22 * s], undefined, 12);
  t.cyl(0.06, 0.07, 0.12, dark, [-0.12 * s, 0.47, 0.22 * s], undefined, 8);
  turret.glass.box(0.02, 0.05, 0.07, '#ffffff', [-0.06 * s, 0.48, 0.22 * s]);
  if (modern) {
    // estação de armas remota
    t.box(0.22, 0.1, 0.16, C.metalDark, [-0.2 * s, 0.53, 0.22 * s]);
    t.box(0.42, 0.03, 0.03, C.metalDark, [0.02, 0.56, 0.22 * s]);
  } else {
    t.box(0.36, 0.028, 0.028, C.metalDark, [0.0, 0.47, 0.3 * s]);
    t.box(0.1, 0.08, 0.08, C.metalDark, [-0.14 * s, 0.46, 0.3 * s]);
  }
  t.cyl(0.08, 0.08, 0.04, dark, [-0.18 * s, 0.37, -0.2 * s], undefined, 10); // escotilha do atirador
  // lançadores de fumígenos em leque nas laterais
  for (const z of [0.42, -0.42]) for (let i = 0; i < 4; i++) t.cyl(0.026, 0.026, 0.13, C.metalDark, [(0.05 - i * 0.08) * s, 0.33, z * s], [Math.sign(z) * 0.7, 0, 0.6], 6);
  // caixas laterais da torre, cesto traseiro e snorkel
  for (const z of [0.46, -0.46]) t.box(0.42 * s, 0.14, 0.1, dark, [-0.3 * s, 0.16, z * s]);
  t.box(0.26 * s, (modern ? 0.2 : 0.14), 0.7 * s, modern ? era : dark, [-0.72 * s, modern ? 0.2 : 0.16, 0]);
  if (!modern) t.box(0.24 * s, 0.07, 0.62 * s, '#5a5236', [-0.72 * s, 0.26, 0]);
  t.cyl(0.04, 0.04, 0.55, dark, [-0.52 * s, 0.2, -0.3 * s], [Math.PI / 2, 0.2, 0], 8);
  // antenas
  t.cyl(0.008, 0.008, 0.9, C.metalDark, [-0.5 * s, 0.7, 0.32 * s], [0, 0, -0.08], 4);
  t.cyl(0.008, 0.008, 0.6, C.metalDark, [-0.55 * s, 0.55, -0.34 * s], [0, 0, -0.1], 4);
  turret.accent.box(0.36, 0.08, 0.02, '#ffffff', [-0.32 * s, 0.17, 0.515 * s]);
  turret.accent.box(0.36, 0.08, 0.02, '#ffffff', [-0.32 * s, 0.17, -0.515 * s]);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.1 * s, 0.68, 0],
    muzzle: [g0 + gun + 0.18, 0.18, 0],
    guns: [{ layers: gunL.build(), pivot: [g0, 0.18, 0], elev: 0, muzzle: [gun + 0.18, 0, 0], recoil: 0.32 }],
    shot: 'apfsds',
  };
}

/**
 * Tanque Moderno do Futuro Próximo (T-90M "Proryv" levado ao extremo): casco mais largo e longo, glacis coberto de
 * blocos reativos, saias reativas em toda a lateral, para-lamas dianteiros grandes e inclinados, torre angular em
 * cunha com módulos reativos em ponta de flecha, bloqueadores Shtora com lentes vermelhas acesas (`glow`), mira
 * panorâmica do comandante com lente azul, estação de armas remota, gaiola de grades na traseira da torre, bancos de
 * fumígenos e canhão longo com luva térmica, sensor de referência na boca e boca larga.
 */
function t90Future(): BuiltUnit {
  const s = 1.18;
  const green = '#5d634c';
  const dark = '#43473a';
  const era = '#6a6f58';
  const black = '#1b1c19';
  const hull = layers();
  const b = hull.body;
  const L = 1.12 * s;
  const W = 0.5 * s;
  b.side(
    [
      [-L, 0.28],
      [L - 0.1, 0.28],
      [L + 0.16, 0.42],
      [L - 0.12, 0.68],
      [-L + 0.05, 0.7],
      [-L - 0.06, 0.5],
    ],
    W * 2,
    green,
  );
  const tl = 2.3 * s;
  const tz = 0.62 * s;
  tracks(b, tl, tz, 0.48, 0.32);
  tracks(b, tl, -tz, 0.48, 0.32);
  const xs = [-0.85, -0.51, -0.17, 0.17, 0.51, 0.85].map((x) => x * s);
  roadWheels(b, xs, 0.22, tz + 0.17, 0.2, 0.06, green);
  roadWheels(b, xs, 0.22, -tz - 0.17, 0.2, 0.06, green);
  trackDetail(b, tl, tz, 0.48, 0.32);
  trackDetail(b, tl, -tz, 0.48, 0.32);
  for (const z of [tz, -tz]) b.box(tl + 0.12, 0.035, 0.38, dark, [0, 0.52, z]);
  // saias reativas em toda a lateral (blocos com moldura) e aba de borracha embaixo
  for (const side of [1, -1]) {
    const z = side * (tz + 0.2);
    for (let i = 0; i < 6; i++) {
      const x = L - 0.22 - i * 0.37 * s;
      b.box(0.34 * s, 0.22, 0.05, era, [x, 0.43, z]);
      b.box(0.34 * s, 0.03, 0.06, dark, [x, 0.55, z]);
      b.box(0.012, 0.22, 0.06, dark, [x + 0.17 * s, 0.43, z]);
    }
    b.box(tl, 0.07, 0.02, black, [0, 0.29, z]);
    // para-lama dianteiro grande, inclinado para baixo (o "queixo" da foto)
    b.box(0.42, 0.04, 0.42, dark, [L + 0.04, 0.5, side * tz], [side * 0.12, 0, -0.42]);
    b.box(0.04, 0.2, 0.42, dark, [L + 0.22, 0.38, side * tz], [0, 0, -0.2]);
  }
  // glacis: três fileiras de blocos reativos em "V"
  {
    const p0 = [L + 0.16, 0.42];
    const p1 = [L - 0.12, 0.68];
    const dx = p1[0]! - p0[0]!;
    const dy = p1[1]! - p0[1]!;
    const len = Math.hypot(dx, dy);
    const nx = dy / len;
    const ny = -dx / len;
    const ang = Math.atan2(dy, dx);
    for (let row = 0; row < 3; row++) {
      const k = 0.2 + row * 0.3;
      const x = p0[0]! + dx * k + nx * 0.035;
      const y = p0[1]! + dy * k + ny * 0.035;
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const z = side * (0.07 + i * 0.13) * s;
          b.box(len * 0.28, 0.06, 0.12, era, [x - Math.abs(z) * 0.06, y, z], [side * 0.2, 0, ang]);
        }
    }
  }
  b.box(0.07, 0.1, W * 1.9, dark, [L + 0.15, 0.34, 0]);
  // faróis em gaiolas e escotilha do motorista com periscópios
  for (const z of [0.38, -0.38]) {
    b.box(0.07, 0.08, 0.1, C.steel, [L - 0.05, 0.67, z * s]);
    b.box(0.09, 0.02, 0.13, dark, [L - 0.05, 0.72, z * s]);
    b.box(0.02, 0.1, 0.13, dark, [L - 0.0, 0.67, z * s]);
  }
  b.box(0.18, 0.04, 0.22, dark, [0.74 * s, 0.71, 0]);
  hull.glass.box(0.03, 0.04, 0.14, '#ffffff', [0.84 * s, 0.73, 0]);
  // convés do motor: grades, tampas e cabo
  for (let i = 0; i < 7; i++) b.box(0.05, 0.014, 0.7 * s, C.metalDark, [-0.4 * s - i * 0.085, 0.706, 0]);
  b.cyl(0.016, 0.016, 0.9 * s, C.metal, [-1.0 * s, 0.72, 0.05], [Math.PI / 2, 0, 0], 5);
  // traseira: tambores, tronco e escape
  for (const z of [0.3, -0.3]) b.cyl(0.1, 0.1, 0.34, dark, [-L - 0.09, 0.64, z * s], [0, 0, Math.PI / 2], 10);
  b.cyl(0.06, 0.06, W * 1.95, '#4c3f2e', [-L - 0.03, 0.79, 0], [Math.PI / 2, 0, 0], 8);
  // caixas sobre os para-lamas
  for (const z of [tz + 0.07, -tz - 0.07]) for (const x of [-0.78, -0.4, -0.02]) b.box(0.32 * s, 0.12, 0.17, dark, [x * s, 0.6, z]);
  hull.accent.box(0.32, 0.1, 0.02, '#ffffff', [-0.88 * s, 0.58, W + 0.013]);
  hull.accent.box(0.32, 0.1, 0.02, '#ffffff', [-0.88 * s, 0.58, -W - 0.013]);

  // --- torre angular em cunha
  const turret = layers();
  const t = turret.body;
  t.plan(
    [
      [0.58 * s, 0.1 * s],
      [0.48 * s, 0.46 * s],
      [-0.3 * s, 0.52 * s],
      [-0.7 * s, 0.42 * s],
      [-0.74 * s, 0],
      [-0.7 * s, -0.42 * s],
      [-0.3 * s, -0.52 * s],
      [0.48 * s, -0.46 * s],
      [0.58 * s, -0.1 * s],
    ],
    0.3,
    green,
  );
  // teto facetado: placa superior mais estreita e chanfros
  t.plan(
    [
      [0.4 * s, 0.1 * s],
      [0.3 * s, 0.38 * s],
      [-0.3 * s, 0.44 * s],
      [-0.62 * s, 0.34 * s],
      [-0.62 * s, -0.34 * s],
      [-0.3 * s, -0.44 * s],
      [0.3 * s, -0.38 * s],
      [0.4 * s, -0.1 * s],
    ],
    0.08,
    green,
    [0, 0.3, 0],
  );
  // módulos reativos em ponta de flecha na frente da torre (Relikt): três camadas por lado, abertas em leque
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = side * (0.15 + i * 0.1) * s;
      const x = 0.56 * s - i * 0.07;
      t.box(0.3 * s, 0.24, 0.1, era, [x, 0.17, z], [0, side * 0.62, 0]);
      t.box(0.3 * s, 0.03, 0.11, dark, [x, 0.3, z], [0, side * 0.62, 0]);
      t.box(0.3 * s, 0.03, 0.11, dark, [x, 0.05, z], [0, side * 0.62, 0]);
    }
    // blocos reativos do teto, à frente das escotilhas
    for (let i = 0; i < 2; i++) t.box(0.18 * s, 0.04, 0.14, era, [(0.28 - i * 0.2) * s, 0.4, side * 0.3 * s], [0, side * 0.2, 0]);
  }
  // mantelete grande com capa e berço do canhão
  t.box(0.26, 0.24, 0.3, dark, [0.62 * s, 0.19, 0]);
  t.box(0.08, 0.26, 0.34, black, [0.74 * s, 0.19, 0]);
  // Shtora: caixas dos bloqueadores com lente (o brilho vermelho vem de `glow`)
  for (const z of [0.25, -0.25]) {
    t.box(0.18, 0.16, 0.2, dark, [0.62 * s, 0.4, z * s]);
    t.box(0.03, 0.17, 0.21, black, [0.72 * s, 0.4, z * s]);
  }
  // mira do atirador (caixa com portas) e mira panorâmica do comandante em mastro (lente azul)
  t.box(0.24, 0.16, 0.16, dark, [0.2 * s, 0.47, -0.28 * s]);
  turret.glass.box(0.02, 0.09, 0.11, '#ffffff', [0.33 * s, 0.48, -0.28 * s]);
  t.cyl(0.04, 0.05, 0.16, dark, [-0.05 * s, 0.5, 0.06 * s], undefined, 8);
  t.box(0.2, 0.16, 0.18, dark, [-0.05 * s, 0.64, 0.06 * s]);
  t.cyl(0.1, 0.1, 0.18, dark, [-0.08 * s, 0.75, 0.06 * s], undefined, 14);
  // cúpula do comandante com estação de armas remota (metralhadora e cofre de munição)
  t.cyl(0.14, 0.15, 0.08, dark, [-0.25 * s, 0.42, 0.26 * s], undefined, 12);
  t.box(0.26, 0.14, 0.18, C.metalDark, [-0.25 * s, 0.53, 0.26 * s]);
  t.box(0.5, 0.035, 0.035, black, [0.03, 0.56, 0.26 * s]);
  t.box(0.12, 0.1, 0.1, C.metalDark, [-0.3 * s, 0.53, 0.37 * s]);
  turret.glass.box(0.02, 0.05, 0.07, '#ffffff', [-0.12 * s, 0.56, 0.2 * s]);
  t.cyl(0.08, 0.08, 0.04, dark, [-0.25 * s, 0.4, -0.22 * s], undefined, 10);
  // bancos de fumígenos (6 tubos por lado, em leque)
  for (const z of [0.47, -0.47])
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) t.cyl(0.028, 0.028, 0.14, black, [(0.1 - i * 0.08) * s, 0.34 + r * 0.06, z * s], [Math.sign(z) * 0.7, 0, 0.6], 6);
  // caixas laterais reativas e cesto traseiro com gaiola de grades (proteção contra foguetes)
  for (const z of [0.5, -0.5]) t.box(0.46 * s, 0.18, 0.1, era, [-0.3 * s, 0.17, z * s]);
  t.box(0.3 * s, 0.24, 0.8 * s, dark, [-0.82 * s, 0.2, 0]);
  {
    const x0 = -1.04 * s;
    const zs = 0.5 * s;
    for (let i = 0; i <= 8; i++) {
      const z = -zs + (i / 8) * zs * 2;
      t.box(0.02, 0.36, 0.02, black, [x0, 0.22, z]);
    }
    for (let i = 0; i <= 3; i++) {
      const x = x0 + i * 0.1;
      for (const z of [zs, -zs]) t.box(0.02, 0.36, 0.02, black, [x, 0.22, z]);
    }
    for (const y of [0.06, 0.38]) {
      t.box(0.02, 0.02, zs * 2, black, [x0, y, 0]);
      for (const z of [zs, -zs]) t.box(0.3, 0.02, 0.02, black, [x0 + 0.15, y, z]);
    }
  }
  // sensor de vento e antenas
  t.cyl(0.01, 0.01, 0.22, black, [-0.55 * s, 0.5, -0.1 * s], undefined, 4);
  t.box(0.06, 0.03, 0.03, black, [-0.55 * s, 0.62, -0.1 * s]);
  t.cyl(0.008, 0.008, 1.0, C.metalDark, [-0.62 * s, 0.82, 0.36 * s], [0, 0, -0.1], 4);
  t.cyl(0.008, 0.008, 0.7, C.metalDark, [-0.66 * s, 0.67, -0.38 * s], [0, 0, -0.12], 4);
  turret.accent.box(0.4, 0.08, 0.02, '#ffffff', [-0.34 * s, 0.2, 0.556 * s]);
  turret.accent.box(0.4, 0.08, 0.02, '#ffffff', [-0.34 * s, 0.2, -0.556 * s]);

  // canhão longo com luva térmica, evacuador, sensor de referência na boca e boca larga
  const gun = 2.15;
  const g0 = 0.78 * s;
  const gunL = layers();
  const gb = gunL.body;
  gb.cyl(0.054, 0.07, gun, dark, [gun / 2, 0, 0], [0, 0, Math.PI / 2], 16);
  for (const x of [0.3, 0.75, 1.5, 1.85]) gb.cyl(0.076, 0.076, 0.05, green, [x, 0, 0], [0, 0, Math.PI / 2], 14);
  gb.cyl(0.09, 0.09, 0.28, green, [1.1, 0, 0], [0, 0, Math.PI / 2], 16);
  gb.box(0.08, 0.05, 0.05, black, [gun - 0.05, 0.08, 0]);
  openMuzzle(gb, gun + 0.16, 0.16, 0.074, 0.046, dark, 20);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.1 * s, 0.7, 0],
    muzzle: [g0 + gun + 0.18, 0.19, 0],
    guns: [{ layers: gunL.build(), pivot: [g0, 0.19, 0], elev: 0, muzzle: [gun + 0.18, 0, 0], recoil: 0.34 }],
    shot: 'apfsds',
    // lentes acesas: Shtora na cor da facção e o brilho azul da mira panorâmica
    glow: [
      { at: [0.736 * s, 0.4, 0.25 * s], normal: [1, 0, 0], r: 0.055, color: 'faction' },
      { at: [0.736 * s, 0.4, -0.25 * s], normal: [1, 0, 0], r: 0.055, color: 'faction' },
      { at: [0.06 * s, 0.75, 0.06 * s], normal: [1, 0, 0], r: 0.035, color: '#5ab4ff' },
    ],
  };
}

function buildApc(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  b.side(
    [
      [-1.15, 0.36],
      [0.82, 0.36],
      [1.2, 0.62],
      [0.98, 0.96],
      [-1.08, 0.96],
      [-1.15, 0.8],
    ],
    1.1,
    C.olive,
  );
  for (const x of [-0.8, -0.28, 0.28, 0.8]) for (const z of [0.5, -0.5]) rollingWheel([x, 0.25, z], 0.24, 0.2);
  b.box(2.2, 0.06, 0.08, C.oliveDark, [0, 0.52, 0.58]); // saia lateral
  b.box(2.2, 0.06, 0.08, C.oliveDark, [0, 0.52, -0.58]);
  b.box(0.5, 0.16, 0.08, C.oliveDark, [-0.45, 0.72, 0.58]);
  b.box(0.5, 0.16, 0.08, C.oliveDark, [-0.45, 0.72, -0.58]);
  b.box(0.36, 0.06, 0.4, C.oliveDark, [-0.65, 0.99, 0]); // escotilha traseira
  b.box(0.06, 0.06, 0.1, C.steel, [1.08, 0.72, 0.38]);
  b.box(0.06, 0.06, 0.1, C.steel, [1.08, 0.72, -0.38]);
  b.box(0.04, 0.16, 0.36, '#2a3a44', [0.98, 0.84, 0.2], [0, 0, 0.5]); // visor do motorista
  b.box(0.6, 0.012, 0.4, C.oliveLight, [-0.2, 0.966, 0.2], [0, 0.5, 0]);
  // cubos com porcas, para-lamas sobre as rodas
  for (const x of [-0.8, -0.28, 0.28, 0.8]) {
    for (const z of [0.61, -0.61]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.box(0.025, 0.025, 0.02, C.steel, [x + Math.cos(a) * 0.07, 0.25 + Math.sin(a) * 0.07, z]);
      }
    }
    b.box(0.5, 0.03, 0.26, C.oliveDark, [x, 0.5, 0.5]);
    b.box(0.5, 0.03, 0.26, C.oliveDark, [x, 0.5, -0.5]);
  }
  // periscópios do motorista e da tropa, trilhos no teto, retrovisores e grade do motor
  for (const x of [-0.9, -0.35, 0.3]) for (const z of [0.45, -0.45]) hull.glass.box(0.08, 0.03, 0.03, '#ffffff', [x, 0.97, z]);
  for (const z of [0.42, -0.42]) b.box(1.2, 0.04, 0.03, C.metalDark, [-0.45, 1.0, z]);
  for (const z of [0.56, -0.56]) {
    b.cyl(0.01, 0.01, 0.18, C.metalDark, [1.0, 0.95, z], undefined, 4);
    b.box(0.02, 0.08, 0.06, C.metalDark, [1.0, 1.05, z]);
  }
  for (let i = 0; i < 4; i++) b.box(0.03, 0.012, 0.4, C.metalDark, [0.55 + i * 0.07, 0.97, -0.2], [0, 0, 0]);
  b.box(0.1, 0.24, 0.24, C.oliveDark, [-1.17, 0.62, 0.3]); // porta traseira
  b.box(0.02, 0.06, 0.12, '#8a3f30', [-1.22, 0.5, 0.38]); // lanternas
  b.box(0.02, 0.06, 0.12, '#8a3f30', [-1.22, 0.5, -0.38]);
  hull.accent.box(0.36, 0.16, 0.02, '#ffffff', [0.2, 0.72, 0.553]);
  hull.accent.box(0.36, 0.16, 0.02, '#ffffff', [0.2, 0.72, -0.553]);

  const turret = layers();
  const t = turret.body;
  t.plan(
    [
      [0.3, 0],
      [0.18, 0.24],
      [-0.26, 0.26],
      [-0.32, 0.12],
      [-0.32, -0.12],
      [-0.26, -0.26],
      [0.18, -0.24],
    ],
    0.24,
    C.olive,
  );
  // canhão automático (peça própria) com a boca aberta
  const gunL = layers();
  gunL.body.cyl(0.032, 0.04, 0.82, C.metalDark, [0.41, 0, 0], [0, 0, Math.PI / 2], 10);
  openMuzzle(gunL.body, 0.9, 0.08, 0.04, 0.022, C.metalDark);
  t.box(0.1, 0.1, 0.12, C.metalDark, [0.18, 0.31, 0.12]);
  t.cyl(0.01, 0.01, 0.6, C.metalDark, [-0.2, 0.5, -0.15], [0, 0, -0.2], 4);
  // lançadores de fumaça e caixa de munição do canhão
  for (const z of [0.2, -0.2]) for (const dy of [0, 0.06]) t.cyl(0.025, 0.025, 0.12, C.metalDark, [0.1, 0.14 + dy, z], [0, 0, 1.2], 6);
  t.box(0.16, 0.14, 0.12, C.oliveDark, [0.05, 0.12, -0.3]);
  turret.glass.box(0.02, 0.05, 0.08, '#ffffff', [0.24, 0.21, 0.12]);
  turret.accent.box(0.26, 0.05, 0.02, '#ffffff', [-0.05, 0.13, 0.255]);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [0.1, 0.96, 0],
    muzzle: [1.11, 0.13, 0],
    guns: [{ layers: gunL.build(), pivot: [0.26, 0.13, 0], elev: 0, muzzle: [0.92, 0, 0], recoil: 0.1 }],
    shot: 'autocannon',
  };
}

function buildArtillery(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  b.side(
    [
      [-1.15, 0.3],
      [1.0, 0.3],
      [1.15, 0.45],
      [0.95, 0.62],
      [-1.12, 0.62],
    ],
    1.0,
    C.olive,
  );
  tracks(b, 2.15, 0.58, 0.44, 0.28);
  tracks(b, 2.15, -0.58, 0.44, 0.28);
  roadWheels(b, [-0.8, -0.4, 0, 0.4, 0.8], 0.19, 0.73, 0.15, 0.06, C.rubber);
  roadWheels(b, [-0.8, -0.4, 0, 0.4, 0.8], 0.19, -0.73, 0.15, 0.06, C.rubber);
  trackDetail(b, 2.15, 0.58, 0.44, 0.28);
  trackDetail(b, 2.15, -0.58, 0.44, 0.28);
  // caixas de munição e ferramentas sobre o para-lama
  for (const x of [-0.7, -0.35, 0.0]) b.box(0.28, 0.12, 0.16, '#4c5436', [x, 0.54, 0.6]);
  b.cyl(0.02, 0.02, 0.7, C.woodDark, [0.4, 0.52, -0.62], [0, 0, Math.PI / 2], 5);
  b.box(2.2, 0.05, 0.3, C.oliveDark, [0, 0.46, 0.58]);
  b.box(2.2, 0.05, 0.3, C.oliveDark, [0, 0.46, -0.58]);
  b.box(0.14, 0.3, 0.9, C.oliveDark, [-1.12, 0.25, 0], [0, 0, 0.5]); // pá traseira
  b.box(0.3, 0.012, 0.3, C.oliveLight, [0.6, 0.626, -0.2], [0, 0.7, 0]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [0.6, 0.5, 0.503]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [0.6, 0.5, -0.503]);

  const turret = layers();
  const t = turret.body;
  t.side(
    [
      [-0.62, 0],
      [0.42, 0],
      [0.52, 0.22],
      [0.36, 0.56],
      [-0.62, 0.56],
    ],
    0.96,
    C.olive,
  );
  // cano longo elevado (24°): começa na frente da torre e aponta para cima/frente
  const elev = 0.42;
  const dir = [Math.cos(elev), Math.sin(elev)] as const;
  const start = [0.45, 0.42] as const;
  const at = (d: number): [number, number, number] => [start[0] + dir[0] * d, start[1] + dir[1] * d, 0];
  // obus (peça própria, recua no disparo): tubo, evacuador, freio de boca de dupla câmara com
  // janelas laterais e a boca aberta
  const gunL = layers();
  const gb = gunL.body;
  gb.cyl(0.072, 0.09, 2.1, C.oliveDark, [1.05, 0, 0], [0, 0, Math.PI / 2], 16);
  // evacuador de gases (bojo no meio do tubo) com cintas
  gb.cyl(0.1, 0.1, 0.34, C.oliveDark, [1.3, 0, 0], [0, 0, Math.PI / 2], 16);
  for (const x of [1.14, 1.46]) gb.cyl(0.09, 0.1, 0.05, C.oliveDark, [x, 0, 0], [0, 0, Math.PI / 2], 16);
  // freio de boca de dupla câmara (M109): dois blocos achatados nas laterais, com o vão aberto
  // entre eles e a saída de gases para os lados; o projétil sai pelo furo central
  const brake = C.oliveDark;
  gb.cyl(0.074, 0.074, 0.1, brake, [2.14, 0, 0], [0, 0, Math.PI / 2], 16);
  for (const [x0, x1] of [
    [2.19, 2.28],
    [2.37, 2.46],
  ] as const) {
    const xm = (x0 + x1) / 2;
    // câmara: bloco achatado, mais largo que alto, com as quinas chanfradas
    gb.box(x1 - x0, 0.12, 0.27, brake, [xm, 0, 0]);
    gb.box(x1 - x0, 0.17, 0.2, brake, [xm, 0, 0]);
    // aberturas laterais escuras (os gases saem para os lados)
    for (const z of [0.136, -0.136]) gb.box(x1 - x0 - 0.025, 0.08, 0.006, '#0a0a0a', [xm, 0, z]);
    // face da câmara com o furo de passagem do projétil
    gb.add(new THREE.CircleGeometry(0.05, 18), '#050505', { pos: [x1 + 0.002, 0, 0], rot: [0, Math.PI / 2, 0] });
  }
  // vão aberto entre as câmaras: só o núcleo escuro e duas barras de ligação em cima e embaixo
  gb.cyl(0.05, 0.05, 0.09, '#151515', [2.325, 0, 0], [0, 0, Math.PI / 2], 14);
  for (const y of [0.075, -0.075]) gb.box(0.09, 0.02, 0.12, brake, [2.325, y, 0]);
  openMuzzle(gb, 2.5, 0.04, 0.075, 0.05, brake, 18);
  // berço do cano (fica na torre, não recua)
  t.cyl(0.1, 0.1, 0.5, C.olive, at(0.25), [0, 0, -(Math.PI / 2 - elev)], 10);
  // telêmetro, escotilhas e metralhadora do teto
  t.box(0.1, 0.1, 0.5, C.oliveDark, [0.1, 0.6, 0]);
  turret.glass.box(0.02, 0.06, 0.06, '#ffffff', [0.155, 0.6, 0.22]);
  turret.glass.box(0.02, 0.06, 0.06, '#ffffff', [0.155, 0.6, -0.22]);
  t.cyl(0.11, 0.12, 0.05, C.oliveDark, [-0.2, 0.58, -0.25]);
  t.box(0.3, 0.035, 0.035, C.metalDark, [-0.05, 0.66, -0.25]);
  for (let i = 0; i < 4; i++) t.box(0.02, 0.4, 0.02, C.metalDark, [-0.63, 0.3, -0.35 + i * 0.23]);
  t.box(0.32, 0.3, 0.36, C.oliveDark, [0.48, 0.32, 0]);
  t.cyl(0.11, 0.12, 0.05, C.oliveDark, [-0.2, 0.58, 0.25]);
  t.box(0.5, 0.2, 1.0, C.oliveDark, [-0.45, 0.25, 0]);
  turret.accent.box(0.6, 0.08, 0.02, '#ffffff', [-0.2, 0.4, 0.483]);
  turret.accent.box(0.6, 0.08, 0.02, '#ffffff', [-0.2, 0.4, -0.483]);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.25, 0.62, 0],
    muzzle: at(2.5),
    guns: [{ layers: gunL.build(), pivot: [start[0], start[1], 0], elev, muzzle: [2.5, 0, 0], recoil: 0.45 }],
    shot: 'howitzer',
  };
}

/**
 * Artilharia da era Futuro Próximo: caminhão 6×6 com cabine avançada (grade, para-brisa e espelhos), estepe e
 * escapamento atrás da cabine, tanque de combustível e escada na lateral, plataforma com caixas de equipamento e
 * patolas traseiras, e uma torre facetada grande (em cunha, chapas inclinadas) com cano longo e fino, freio de boca e
 * sensor eletro-óptico cilíndrico na traseira da torre.
 */
function buildArtilleryFuture(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  const armor = '#5d6350';
  const armorDark = '#474c3c';
  const black = '#1d1e1b';
  // chassi e rodas (3 eixos)
  b.box(2.4, 0.16, 0.8, armorDark, [-0.1, 0.52, 0]);
  for (const x of [0.88, -0.48, -0.98]) for (const z of [0.47, -0.47]) rollingWheel([x, 0.3, z], 0.3, 0.24);
  for (const [x, w] of [
    [0.88, 0.62],
    [-0.73, 1.02],
  ] as const)
    for (const z of [0.5, -0.5]) {
      b.box(w, 0.05, 0.28, armorDark, [x, 0.66, z]);
      b.box(0.05, 0.16, 0.28, armorDark, [x - w / 2, 0.58, z]);
    }

  // --- cabine avançada
  b.side(
    [
      [0.62, 0.64],
      [1.3, 0.64],
      [1.33, 1.02],
      [1.24, 1.42],
      [0.62, 1.42],
    ],
    0.9,
    armor,
  );
  b.box(0.12, 0.16, 0.96, armorDark, [1.33, 0.64, 0]); // para-choque
  b.box(0.02, 0.24, 0.56, black, [1.335, 0.86, 0]); // grade
  for (let i = 0; i < 7; i++) b.box(0.025, 0.24, 0.02, armorDark, [1.345, 0.86, -0.24 + i * 0.08]);
  for (const z of [0.36, -0.36]) b.box(0.03, 0.06, 0.12, '#ece6cc', [1.34, 0.72, z]);
  hull.glass.box(0.02, 0.26, 0.76, '#ffffff', [1.29, 1.22, 0], [0, 0, -0.22]);
  for (const z of [0.452, -0.452]) {
    hull.glass.box(0.3, 0.22, 0.01, '#ffffff', [1.0, 1.2, z]);
    b.box(0.02, 0.4, 0.012, armorDark, [0.8, 1.0, z * 1.01]);
    // espelho
    b.box(0.03, 0.03, 0.1, armorDark, [1.24, 1.28, z * 1.12]);
    b.box(0.04, 0.2, 0.09, black, [1.24, 1.28, z * 1.28]);
  }
  b.box(0.5, 0.06, 0.7, armorDark, [0.9, 1.45, 0]); // teto com bagageiro
  b.cyl(0.01, 0.014, 0.4, black, [0.7, 1.68, 0.3], undefined, 5);
  // estepe na vertical e escapamento atrás da cabine
  b.cyl(0.26, 0.26, 0.2, black, [0.44, 1.08, 0.12], [Math.PI / 2, 0, 0], 14);
  b.cyl(0.12, 0.12, 0.21, armorDark, [0.44, 1.08, 0.12], [Math.PI / 2, 0, 0], 10);
  b.cyl(0.03, 0.03, 0.6, black, [0.5, 1.15, -0.35], undefined, 6);
  b.box(0.3, 0.6, 0.84, armor, [0.48, 0.92, -0.05]);
  // tanque de combustível e escada na lateral
  b.cyl(0.1, 0.1, 0.42, C.steel, [0.2, 0.52, 0.42], [0, 0, Math.PI / 2], 12);
  for (let i = 0; i < 4; i++) b.box(0.012, 0.012, 0.08, C.steel, [0.62, 0.62 + i * 0.12, 0.47]);

  // --- plataforma traseira com caixas de equipamento e patolas
  b.box(1.5, 0.08, 0.86, armorDark, [-0.6, 0.66, 0]);
  for (const z of [0.38, -0.38])
    for (let i = 0; i < 3; i++) {
      b.box(0.42, 0.2, 0.12, armor, [-0.1 - i * 0.46, 0.8, z]);
      b.box(0.05, 0.02, 0.13, C.steel, [-0.1 - i * 0.46, 0.84, z]);
    }
  for (const z of [0.38, -0.38]) {
    b.box(0.08, 0.4, 0.08, armorDark, [-1.32, 0.38, z], [0, 0, 0.5]);
    b.box(0.2, 0.03, 0.14, armorDark, [-1.42, 0.17, z]);
  }
  // lanternas traseiras na cor da facção
  hull.accent.box(0.06, 0.06, 0.12, '#ffffff', [-1.36, 0.62, 0.36]);
  hull.accent.box(0.06, 0.06, 0.12, '#ffffff', [-1.36, 0.62, -0.36]);
  hull.accent.box(0.3, 0.12, 0.02, '#ffffff', [0.98, 0.82, 0.453]);
  hull.accent.box(0.3, 0.12, 0.02, '#ffffff', [0.98, 0.82, -0.453]);

  // --- torre facetada em cunha: base giratória, corpo com chapas inclinadas e sensor na traseira
  const turret = layers();
  const t = turret.body;
  t.cyl(0.34, 0.38, 0.12, armorDark, [0, 0.06, 0], undefined, 14);
  t.box(0.9, 0.14, 0.82, armor, [0, 0.18, 0]);
  t.side(
    [
      [-0.62, 0.22],
      [0.32, 0.22],
      [0.58, 0.42],
      [0.4, 0.76],
      [-0.5, 0.82],
      [-0.7, 0.55],
    ],
    0.86,
    armor,
  );
  // chanfros laterais (as faces da torre se fecham para dentro)
  for (const z of [0.45, -0.45]) t.box(0.9, 0.36, 0.06, armorDark, [-0.08, 0.5, z], [z > 0 ? 0.35 : -0.35, 0, 0]);
  // escotilhas e linhas de chapas
  t.box(0.2, 0.03, 0.24, armorDark, [-0.2, 0.82, 0.15]);
  for (const x of [-0.35, 0.05]) t.box(0.012, 0.5, 0.87, armorDark, [x, 0.52, 0]);
  // sensor eletro-óptico cilíndrico na traseira, com lente
  t.cyl(0.14, 0.14, 0.24, '#d0d3cc', [-0.62, 0.95, 0.28], [Math.PI / 2, 0, 0], 16);
  t.box(0.06, 0.16, 0.06, armorDark, [-0.62, 0.8, 0.28]);
  turret.glass.cyl(0.09, 0.09, 0.02, '#ffffff', [-0.62, 0.95, 0.405], [Math.PI / 2, 0, 0], 14);
  t.box(0.08, 0.06, 0.08, armorDark, [-0.45, 0.9, 0.36]);
  turret.accent.box(0.5, 0.08, 0.02, '#ffffff', [-0.15, 0.5, 0.478]);
  turret.accent.box(0.5, 0.08, 0.02, '#ffffff', [-0.15, 0.5, -0.478]);

  // cano longo e fino com luva, berço e freio de boca
  const elev = 0.42;
  const dir = [Math.cos(elev), Math.sin(elev)] as const;
  const start = [0.45, 0.55] as const;
  const at = (d: number): [number, number, number] => [start[0] + dir[0] * d, start[1] + dir[1] * d, 0];
  t.cyl(0.12, 0.14, 0.4, armorDark, at(0.15), [0, 0, -(Math.PI / 2 - elev)], 12);
  const gunL = layers();
  const gb = gunL.body;
  gb.cyl(0.055, 0.075, 2.2, armorDark, [1.1, 0, 0], [0, 0, Math.PI / 2], 14);
  gb.cyl(0.085, 0.085, 0.5, armor, [0.4, 0, 0], [0, 0, Math.PI / 2], 14);
  gb.cyl(0.075, 0.07, 0.16, black, [2.24, 0, 0], [0, 0, Math.PI / 2], 14);
  for (const z of [0.07, -0.07]) gb.box(0.1, 0.05, 0.02, '#0a0a0a', [2.24, 0, z]);
  openMuzzle(gb, 2.38, 0.06, 0.07, 0.042, black, 16);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.55, 0.7, 0],
    muzzle: at(2.38),
    guns: [{ layers: gunL.build(), pivot: [start[0], start[1], 0], elev, muzzle: [2.38, 0, 0], recoil: 0.4 }],
    shot: 'howitzer',
  };
}

// ------------------------------------------------------------------ veículos liberados por pesquisa

/** Tanque de batalha moderno: casco mais longo, torre em cunha com blindagem reativa e canhão longo. */
function buildMbt(): BuiltUnit {
  return t90(true);
}

/** Lança-foguetes sobre caminhão 6×6: cabine, chassi e casulo de tubos elevado (gira como torre). */
function buildRocketArtillery(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  b.box(2.3, 0.18, 0.86, C.oliveDark, [-0.1, 0.5, 0]); // chassi
  for (const x of [-0.85, -0.35, 0.8]) for (const z of [0.46, -0.46]) rollingWheel([x, 0.26, z], 0.25, 0.2);
  // cabine blindada com para-brisa
  b.side(
    [
      [0.55, 0.58],
      [1.2, 0.58],
      [1.22, 0.9],
      [1.05, 1.18],
      [0.55, 1.18],
    ],
    0.9,
    C.olive,
  );
  hull.glass.box(0.02, 0.2, 0.7, '#ffffff', [1.14, 1.0, 0], [0, 0, 0.55]);
  for (const z of [0.452, -0.452]) hull.glass.box(0.28, 0.16, 0.01, '#ffffff', [0.85, 1.0, z]);
  b.box(0.06, 0.08, 0.12, C.steel, [1.22, 0.7, 0.32]);
  b.box(0.06, 0.08, 0.12, C.steel, [1.22, 0.7, -0.32]);
  // para-lamas, tanque de combustível, macacos estabilizadores
  for (const x of [-0.85, -0.35, 0.8]) for (const z of [0.47, -0.47]) b.box(0.52, 0.04, 0.24, C.olive, [x, 0.55, z]);
  b.box(0.4, 0.2, 0.14, C.metalDark, [0.25, 0.48, 0.46]);
  for (const z of [0.4, -0.4]) b.box(0.08, 0.36, 0.08, C.metalDark, [-1.15, 0.3, z]);
  b.box(0.7, 0.012, 0.5, C.oliveLight, [-0.3, 0.6, 0.1], [0, 0.5, 0]);
  hull.accent.box(0.3, 0.14, 0.02, '#ffffff', [0.85, 0.75, 0.453]);
  hull.accent.box(0.3, 0.14, 0.02, '#ffffff', [0.85, 0.75, -0.453]);

  // berço do casulo sobre a carroceria
  b.box(1.2, 0.08, 0.7, C.oliveDark, [-0.55, 0.62, 0]);

  // plataforma giratória com os braços da dobradiça e a cabine do operador
  const turret = layers();
  const t = turret.body;
  t.cyl(0.36, 0.4, 0.12, C.oliveDark, [0, 0.06, 0], undefined, 12);
  for (const z of [0.36, -0.36]) t.box(0.24, 0.26, 0.06, C.metalDark, [-0.5, 0.2, z]);
  t.box(0.3, 0.22, 0.3, C.olive, [0.25, 0.2, 0.3]);
  turret.glass.box(0.02, 0.1, 0.22, '#ffffff', [0.41, 0.24, 0.3]);

  // casulo com 12 tubos (3 × 4), em camuflagem de faixas: dobradiça atrás, bocas à frente
  const pod = layers();
  const pb = pod.body;
  const L = 1.62;
  pb.box(L, 0.5, 0.74, '#9b6a43', [L / 2, 0.3, 0]);
  // faixas de camuflagem verde (laterais e topo)
  for (const [x, w] of [
    [0.3, 0.32],
    [0.95, 0.26],
    [1.4, 0.2],
  ] as const) {
    for (const z of [0.373, -0.373]) pb.box(w, 0.5, 0.012, '#5a6440', [x, 0.3, z], [0.5, 0, 0]);
    pb.box(w * 0.9, 0.012, 0.74, '#5a6440', [x + 0.08, 0.553, 0], [0, 0.4, 0]);
  }
  // nervuras de reforço e cintas
  for (const x of [0.12, 0.62, 1.12, 1.52]) pb.box(0.05, 0.54, 0.78, C.oliveDark, [x, 0.3, 0]);
  // face dos tubos: moldura e bocas escuras
  pb.box(0.04, 0.52, 0.76, C.metalDark, [L + 0.01, 0.3, 0]);
  const tubes: [number, number, number][] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      const y = 0.14 + r * 0.16;
      const z = (c - 1.5) * 0.17;
      // tubo aberto: o fundo escuro aparece quando o foguete já saiu (as ogivas são animadas)
      pb.cyl(0.062, 0.062, 0.03, '#141513', [L + 0.035, y, z], [0, 0, -Math.PI / 2], 10);
      tubes.push([L + 0.06, y, z]);
    }
  // traseira: saída dos gases (tampas abertas)
  pb.box(0.03, 0.5, 0.74, '#20211e', [-0.005, 0.3, 0]);
  // macacos hidráulicos (vão junto com o casulo)
  for (const z of [0.3, -0.3]) pb.cyl(0.04, 0.04, 0.5, C.steel, [0.55, -0.12, z], [0, 0, 0.9], 8);
  pod.accent.box(0.5, 0.12, 0.02, '#ffffff', [0.7, 0.36, 0.376]);
  pod.accent.box(0.5, 0.12, 0.02, '#ffffff', [0.7, 0.36, -0.376]);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.45, 0.62, 0],
    muzzle: [1.1, 1.2, 0],
    pod: { layers: pod.build(), hinge: [-0.62, 0.16, 0], tubes, stowed: 0.03, raised: 0.72 },
  };
}

/**
 * Lança-foguetes da era Futuro Próximo: caminhão 8×8 blindado com cabine facetada (grade de lâminas verticais,
 * para-brisa dividido, para-lamas em cunha, luzes vermelhas de comboio, espelhos), mastro com câmera e antenas no
 * teto, armários laterais na carroceria e casulo de 12 tubos grandes cilíndricos (3 × 4) presos por cintas.
 */
function buildRocketArtilleryFuture(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  const armor = '#5b5f4c';
  const armorDark = '#454939';
  const black = '#1e1f1c';
  // chassi longo e rodas (4 eixos)
  b.box(2.5, 0.16, 0.8, armorDark, [-0.1, 0.5, 0]);
  const axles = [0.92, 0.42, -0.62, -1.08];
  for (const x of axles) for (const z of [0.47, -0.47]) rollingWheel([x, 0.28, z], 0.28, 0.22);
  // para-lamas sobre cada par de eixos
  for (const [x, w] of [
    [0.67, 0.86],
    [-0.85, 0.82],
  ] as const)
    for (const z of [0.5, -0.5]) {
      b.box(w, 0.05, 0.26, armorDark, [x, 0.62, z]);
      b.box(w, 0.12, 0.03, armorDark, [x, 0.56, z * 1.06]);
    }

  // --- cabine blindada facetada
  b.side(
    [
      [0.48, 0.62],
      [1.3, 0.62],
      [1.36, 0.9],
      [1.22, 0.98],
      [1.12, 1.34],
      [0.48, 1.36],
    ],
    0.92,
    armor,
  );
  // capô em cunha e chanfros dos cantos da frente
  b.box(0.22, 0.05, 0.94, armor, [1.28, 0.95, 0], [0, 0, -0.35]);
  for (const z of [0.44, -0.44]) b.box(0.36, 0.34, 0.08, armorDark, [1.22, 0.78, z], [0, z > 0 ? 0.5 : -0.5, 0]);
  // grade de lâminas verticais
  b.box(0.03, 0.22, 0.6, black, [1.355, 0.77, 0]);
  for (let i = 0; i < 9; i++) b.box(0.035, 0.22, 0.025, armorDark, [1.37, 0.77, -0.27 + i * 0.0675]);
  // para-choque, ganchos de reboque e faróis
  b.box(0.14, 0.14, 0.98, armorDark, [1.36, 0.6, 0]);
  for (const z of [0.3, -0.3]) {
    b.add(new THREE.TorusGeometry(0.035, 0.012, 6, 10), C.steel, { pos: [1.44, 0.55, z], rot: [0, Math.PI / 2, 0] });
    b.box(0.03, 0.05, 0.1, '#ece6cc', [1.43, 0.66, z * 1.35]);
  }
  // para-brisa dividido e janelas laterais
  const ws = Math.atan2(1.34 - 0.98, 1.12 - 1.22);
  for (const z of [0.21, -0.21]) hull.glass.box(0.02, 0.36, 0.38, '#ffffff', [1.17, 1.16, z], [0, 0, ws - Math.PI / 2]);
  b.box(0.04, 0.38, 0.04, armorDark, [1.17, 1.16, 0], [0, 0, ws - Math.PI / 2]);
  for (const z of [0.462, -0.462]) {
    hull.glass.box(0.3, 0.2, 0.01, '#ffffff', [0.9, 1.15, z]);
    hull.glass.box(0.18, 0.2, 0.01, '#ffffff', [0.6, 1.15, z]);
    // porta: dobradiças e maçaneta
    b.box(0.02, 0.36, 0.012, armorDark, [0.76, 0.95, z * 1.01]);
    b.box(0.06, 0.02, 0.014, C.steel, [0.7, 0.92, z * 1.02]);
  }
  // espelhos nos braços
  for (const z of [0.52, -0.52]) {
    b.box(0.03, 0.03, 0.12, armorDark, [1.08, 1.12, z]);
    b.box(0.04, 0.2, 0.1, black, [1.08, 1.12, z * 1.18]);
  }
  // luzes vermelhas de comboio (teto e frente) e âmbar nos cantos
  // luzes de comboio na cor da facção (camada de destaque)
  for (const z of [0.36, 0.12, -0.12, -0.36]) hull.accent.box(0.03, 0.04, 0.07, '#ffffff', [1.14, 1.37, z]);
  for (const z of [0.4, -0.4]) {
    hull.accent.box(0.03, 0.04, 0.07, '#ffffff', [1.31, 0.92, z * 0.6]);
    b.box(0.03, 0.035, 0.05, '#e39a2b', [1.33, 0.66, z * 1.12]);
  }
  // teto: caixa de sensores, câmera em mastro curto e antenas
  b.box(0.5, 0.1, 0.6, armorDark, [0.78, 1.41, 0]);
  b.cyl(0.025, 0.025, 0.16, armorDark, [0.98, 1.52, 0], undefined, 6);
  b.box(0.12, 0.1, 0.12, armorDark, [0.98, 1.64, 0]);
  hull.glass.cyl(0.03, 0.03, 0.02, '#ffffff', [1.045, 1.64, 0], [0, 0, Math.PI / 2], 10);
  for (const [x, z, h] of [
    [0.6, 0.32, 0.6],
    [0.6, -0.32, 0.5],
    [0.95, -0.28, 0.42],
  ] as const)
    b.cyl(0.008, 0.012, h, black, [x, 1.46 + h / 2, z], undefined, 5);

  // --- carroceria: módulo atrás da cabine, armários laterais e macacos estabilizadores
  b.box(0.3, 0.5, 0.84, armor, [0.3, 0.88, 0]);
  for (const z of [0.44, -0.44]) {
    for (let i = 0; i < 4; i++) {
      b.box(0.34, 0.24, 0.06, armor, [-0.05 - i * 0.37, 0.71, z]);
      b.box(0.012, 0.2, 0.065, armorDark, [0.12 - i * 0.37, 0.71, z]);
      b.box(0.05, 0.02, 0.07, C.steel, [-0.05 - i * 0.37, 0.76, z]);
    }
    b.box(0.1, 0.38, 0.08, armorDark, [-1.32, 0.34, z * 0.85]);
  }
  b.box(1.4, 0.06, 0.8, armorDark, [-0.6, 0.62, 0]);
  hull.accent.box(0.3, 0.12, 0.02, '#ffffff', [0.85, 0.78, 0.463]);
  hull.accent.box(0.3, 0.12, 0.02, '#ffffff', [0.85, 0.78, -0.463]);

  // --- plataforma giratória e braços da dobradiça
  const turret = layers();
  const t = turret.body;
  t.cyl(0.36, 0.4, 0.12, armorDark, [0, 0.06, 0], undefined, 14);
  for (const z of [0.34, -0.34]) t.box(0.34, 0.3, 0.07, armorDark, [-0.48, 0.2, z]);
  t.box(0.2, 0.14, 0.2, armor, [0.2, 0.16, 0.28]);

  // --- casulo: 12 tubos cilíndricos grandes (3 × 4), cintas e tampas traseiras
  const pod = layers();
  const pb = pod.body;
  const L = 1.66;
  const R = 0.098;
  const tubes: [number, number, number][] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      const y = 0.13 + r * 0.205;
      const z = (c - 1.5) * 0.205;
      // tubo: corpo, anel da boca, fundo escuro recuado (a ogiva carregada aparece na boca) e tampa traseira
      pb.cyl(R, R, L, armor, [L / 2 + 0.02, y, z], [0, 0, -Math.PI / 2], 14);
      pb.add(new THREE.RingGeometry(R * 0.72, R * 1.04, 14), armorDark, { pos: [L + 0.021, y, z], rot: [0, Math.PI / 2, 0] });
      pb.add(new THREE.CircleGeometry(R * 0.72, 14), '#0c0d0b', { pos: [L + 0.012, y, z], rot: [0, Math.PI / 2, 0] });
      pb.cyl(R * 1.02, R * 1.02, 0.05, armorDark, [0.03, y, z], [0, 0, -Math.PI / 2], 14);
      tubes.push([L + 0.02, y, z]);
    }
  // cintas que prendem o feixe de tubos e longarina inferior
  for (const x of [0.25, 0.85, 1.45]) {
    pb.box(0.06, 0.03, 0.86, armorDark, [x, 0.13 + 2 * 0.205 + R + 0.01, 0]);
    pb.box(0.06, 0.03, 0.86, armorDark, [x, 0.13 - R - 0.01, 0]);
    for (const z of [0.43, -0.43]) pb.box(0.06, 0.64, 0.03, armorDark, [x, 0.335, z]);
  }
  pb.box(1.5, 0.06, 0.5, armorDark, [0.8, 0.0, 0]);
  // macacos hidráulicos (vão junto com o casulo)
  for (const z of [0.3, -0.3]) pb.cyl(0.04, 0.04, 0.5, C.steel, [0.55, -0.12, z], [0, 0, 0.9], 8);
  pod.accent.box(0.4, 0.1, 0.02, '#ffffff', [0.55, 0.335, 0.446]);
  pod.accent.box(0.4, 0.1, 0.02, '#ffffff', [0.55, 0.335, -0.446]);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.45, 0.66, 0],
    muzzle: [1.1, 1.2, 0],
    pod: { layers: pod.build(), hinge: [-0.62, 0.18, 0], tubes, stowed: 0.03, raised: 0.72 },
  };
}

/** Antiaérea autopropulsada: chassi de lagartas, torre com dois canhões e radar de busca. */
function buildMobileAa(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  b.side(
    [
      [-1.08, 0.3],
      [0.95, 0.3],
      [1.12, 0.46],
      [0.92, 0.66],
      [-1.05, 0.66],
    ],
    1.0,
    C.olive,
  );
  tracks(b, 2.05, 0.58, 0.44, 0.28);
  tracks(b, 2.05, -0.58, 0.44, 0.28);
  roadWheels(b, [-0.75, -0.38, 0, 0.38, 0.75], 0.19, 0.73, 0.15, 0.06, C.rubber);
  roadWheels(b, [-0.75, -0.38, 0, 0.38, 0.75], 0.19, -0.73, 0.15, 0.06, C.rubber);
  trackDetail(b, 2.05, 0.58, 0.44, 0.28);
  trackDetail(b, 2.05, -0.58, 0.44, 0.28);
  b.box(2.1, 0.05, 0.3, C.oliveDark, [0, 0.47, 0.58]);
  b.box(2.1, 0.05, 0.3, C.oliveDark, [0, 0.47, -0.58]);
  for (let i = 0; i < 4; i++) b.box(0.05, 0.012, 0.6, C.metalDark, [-0.6 - i * 0.09, 0.666, 0]);
  b.box(0.05, 0.06, 0.1, C.steel, [1.04, 0.56, 0.36]);
  b.box(0.05, 0.06, 0.1, C.steel, [1.04, 0.56, -0.36]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [-0.7, 0.5, 0.503]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [-0.7, 0.5, -0.503]);

  const turret = layers();
  const t = turret.body;
  t.box(0.9, 0.5, 0.86, C.olive, [0, 0.25, 0]);
  t.box(0.3, 0.3, 0.86, C.oliveDark, [0.45, 0.22, 0], [0, 0, -0.5]);
  // dois canhões de tiro rápido elevados nas laterais
  const elev = 0.45;
  const guns: NonNullable<UnitModel['guns']> = [];
  for (const z of [0.52, -0.52]) {
    t.box(0.34, 0.3, 0.18, C.oliveDark, [0.15, 0.32, z]);
    // canhão de tiro rápido (peça própria): tubo, quebra-chamas com fendas e boca aberta
    const gl = layers();
    // cano fino e reto, com luva de reforço na raiz
    gl.body.cyl(0.03, 0.03, 1.22, C.metalDark, [0.63, 0, 0], [0, 0, Math.PI / 2], 12);
    gl.body.cyl(0.044, 0.044, 0.22, C.metalDark, [0.13, 0, 0], [0, 0, Math.PI / 2], 12);
    // freio de boca em gaiola (Gepard): três anéis finos ligados por barras, com a alma escura
    // aparecendo nas janelas largas entre eles, e a boca aberta na frente
    gl.body.cyl(0.024, 0.024, 0.2, '#121212', [1.33, 0, 0], [0, 0, Math.PI / 2], 12);
    for (const x of [1.245, 1.305, 1.365]) gl.body.cyl(0.054, 0.054, 0.02, C.metalDark, [x, 0, 0], [0, 0, Math.PI / 2], 18);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      gl.body.box(0.2, 0.014, 0.014, C.metalDark, [1.33, Math.sin(a) * 0.047, Math.cos(a) * 0.047], [a, 0, 0]);
    }
    openMuzzle(gl.body, 1.44, 0.05, 0.054, 0.026, C.metalDark, 18);
    guns.push({ layers: gl.build(), pivot: [0.15, 0.32, z], elev, muzzle: [1.45, 0, 0], recoil: 0.12 });
  }
  // radar de busca (prato) atrás e radar de tiro na frente
  t.cyl(0.04, 0.04, 0.3, C.metalDark, [-0.3, 0.65, 0], undefined, 6);
  t.cyl(0.36, 0.3, 0.05, C.steel, [-0.3, 0.82, 0], [0.35, 0, Math.PI / 2], 14);
  t.sphere(0.13, C.steel, [0.42, 0.42, 0], [0.6, 1, 1], 10);
  turret.glass.box(0.02, 0.06, 0.12, '#ffffff', [0.46, 0.4, 0.25]);
  turret.accent.box(0.5, 0.08, 0.02, '#ffffff', [-0.1, 0.3, 0.435]);
  turret.accent.box(0.5, 0.08, 0.02, '#ffffff', [-0.1, 0.3, -0.435]);
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.1, 0.66, 0],
    muzzle: [0.15 + Math.cos(elev) * 1.45, 0.32 + Math.sin(elev) * 1.45, 0.52],
    guns,
    shot: 'flak',
  };
}

/**
 * Antiaérea Móvel do Futuro Próximo (estilo Pantsir sobre 8×8 blindado): casco facetado com camuflagem digital em
 * quadrados de três tons, cabine em cunha com grade e faróis, armários laterais; torre com dois canhões gêmeos de tiro
 * rápido, dois casulos de 6 mísseis interceptadores (derrubam as salvas do Lança-Foguetes), radar de busca retangular
 * no mastro de trás com luzes, radar de tiro redondo na frente e sensor eletro-óptico. `launchers` são as bocas dos
 * tubos de míssil no referencial da torre (o interceptador visível sai delas).
 */
function buildMobileAaFuture(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  const base = '#7a8070';
  const dark = '#4a4f42';
  const black = '#1c1d1a';
  // contraste alto: a pintura escura da era 4 multiplica estes tons
  const camo = ['#b4b8a6', '#4f5444', '#d6d8ca'];
  // camuflagem digital: quadrados em três tons sobre as faces laterais e o topo (determinística)
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pixels = (x0: number, x1: number, y0: number, y1: number, z: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const w = 0.06 + rnd() * 0.08;
      const h = 0.05 + rnd() * 0.06;
      b.box(w, h, 0.012, camo[Math.floor(rnd() * 3)]!, [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), z]);
    }
  };
  b.box(2.6, 0.14, 0.82, dark, [-0.1, 0.52, 0]);
  for (const x of [0.92, 0.45, -0.6, -1.06]) for (const z of [0.47, -0.47]) rollingWheel([x, 0.29, z], 0.29, 0.23);
  // casco facetado (laterais chanfradas embaixo) e cabine em cunha
  b.side(
    [
      [-1.36, 0.6],
      [0.6, 0.6],
      [0.6, 0.98],
      [-1.36, 0.98],
    ],
    0.94,
    base,
  );
  b.side(
    [
      [0.6, 0.6],
      [1.32, 0.6],
      [1.38, 0.84],
      [1.2, 0.98],
      [1.1, 1.22],
      [0.6, 1.24],
    ],
    0.9,
    base,
  );
  for (const z of [0.47, -0.47]) {
    b.box(1.96, 0.16, 0.06, dark, [-0.38, 0.66, z], [z > 0 ? -0.5 : 0.5, 0, 0]);
    pixels(-1.3, 0.55, 0.72, 0.95, z * 1.005, 26);
    pixels(0.65, 1.25, 0.66, 1.18, z * 1.0 + Math.sign(z) * 0.006, 12);
  }
  // para-lamas, armários laterais com fechos e tanque
  for (const [x, w] of [
    [0.69, 0.82],
    [-0.83, 0.84],
  ] as const)
    for (const z of [0.5, -0.5]) b.box(w, 0.05, 0.28, dark, [x, 0.66, z]);
  for (const z of [0.49, -0.49])
    for (let i = 0; i < 3; i++) {
      b.box(0.4, 0.2, 0.05, base, [-0.15 - i * 0.44, 0.84, z]);
      b.box(0.05, 0.02, 0.06, C.steel, [-0.15 - i * 0.44, 0.88, z]);
    }
  b.cyl(0.09, 0.09, 0.36, C.steel, [0.2, 0.55, 0.44], [0, 0, Math.PI / 2], 12);
  // frente: grade, para-choque, faróis, luzes âmbar, ganchos e espelhos
  b.box(0.12, 0.16, 0.96, dark, [1.36, 0.62, 0]);
  b.box(0.02, 0.18, 0.5, black, [1.383, 0.76, 0]);
  for (let i = 0; i < 6; i++) b.box(0.025, 0.18, 0.02, dark, [1.39, 0.76, -0.2 + i * 0.08]);
  for (const z of [0.36, -0.36]) {
    b.box(0.03, 0.06, 0.12, '#ece6cc', [1.38, 0.72, z]);
    b.box(0.03, 0.035, 0.06, '#e39a2b', [1.33, 0.9, z * 1.1]);
    b.add(new THREE.TorusGeometry(0.03, 0.01, 6, 10), C.steel, { pos: [1.44, 0.56, z * 0.8], rot: [0, Math.PI / 2, 0] });
    b.box(0.03, 0.03, 0.1, dark, [1.12, 1.12, z * 1.35]);
    b.box(0.04, 0.18, 0.09, black, [1.12, 1.12, z * 1.55]);
  }
  hull.glass.box(0.02, 0.22, 0.74, '#ffffff', [1.16, 1.1, 0], [0, 0, -0.42]);
  for (const z of [0.452, -0.452]) hull.glass.box(0.26, 0.18, 0.01, '#ffffff', [0.9, 1.08, z]);
  // topo do casco: grades do motor e escotilhas
  for (let i = 0; i < 5; i++) b.box(0.05, 0.012, 0.6, black, [-1.0 - i * 0.07, 0.986, 0]);
  b.box(0.3, 0.03, 0.3, dark, [0.85, 1.25, 0]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [0.9, 0.8, 0.455]);
  hull.accent.box(0.3, 0.1, 0.02, '#ffffff', [0.9, 0.8, -0.455]);

  // --- torre: base, corpo facetado, canhões, casulos de mísseis e radares
  const turret = layers();
  const t = turret.body;
  t.cyl(0.38, 0.42, 0.1, dark, [0, 0.05, 0], undefined, 14);
  t.side(
    [
      [-0.5, 0.1],
      [0.42, 0.1],
      [0.54, 0.26],
      [0.4, 0.48],
      [-0.46, 0.5],
      [-0.56, 0.3],
    ],
    0.62,
    base,
  );
  for (const z of [0.312, -0.312]) {
    for (let i = 0; i < 8; i++) {
      const w = 0.06 + ((i * 37) % 7) * 0.012;
      t.box(w, 0.05 + ((i * 13) % 5) * 0.01, 0.01, camo[i % 3]!, [-0.4 + i * 0.11, 0.2 + ((i * 29) % 6) * 0.04, z]);
    }
  }
  // casulos de mísseis: 6 tubos (2 × 3) de cada lado, elevados, com as bocas escuras
  const podElev = 0.5;
  const launchers: [number, number, number][] = [];
  for (const side of [1, -1]) {
    const pz = side * 0.52;
    t.box(0.16, 0.14, 0.12, dark, [0.0, 0.34, side * 0.36]);
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) {
        const off = (c - 1) * 0.095;
        const up = 0.32 + r * 0.1;
        const len = 0.8;
        const cx = -0.05 + (Math.cos(podElev) * len) / 2;
        const cy = up + (Math.sin(podElev) * len) / 2;
        t.cyl(0.045, 0.045, len, base, [cx, cy, pz + off], [0, 0, podElev - Math.PI / 2], 10);
        const mx = -0.05 + Math.cos(podElev) * len;
        const my = up + Math.sin(podElev) * len;
        // boca escura voltada ao longo do tubo
        t.add(new THREE.CircleGeometry(0.036, 10).rotateY(Math.PI / 2), '#0c0d0b', { pos: [mx + 0.003, my, pz + off], rot: [0, 0, podElev] });
        launchers.push([mx, my, pz + off]);
      }
    // cintas do casulo
    for (const k of [0.2, 0.6]) {
      const x = -0.05 + Math.cos(podElev) * 0.8 * k;
      t.box(0.04, 0.3, 0.34, dark, [x, 0.4 + Math.sin(podElev) * 0.8 * k, pz], [0, 0, podElev]);
    }
  }
  // radar de busca retangular no mastro traseiro, com luzes, e radar de tiro redondo na frente
  t.cyl(0.04, 0.05, 0.4, dark, [-0.38, 0.7, 0], undefined, 8);
  t.box(0.12, 0.32, 0.5, dark, [-0.38, 1.0, 0]);
  t.box(0.02, 0.28, 0.44, '#4a5040', [-0.31, 1.0, 0]);
  t.box(0.08, 0.06, 0.52, black, [-0.38, 1.19, 0]);
  t.cyl(0.12, 0.12, 0.08, dark, [0.48, 0.38, 0], [0, 0, Math.PI / 2], 16);
  t.cyl(0.1, 0.1, 0.02, '#575e4c', [0.53, 0.38, 0], [0, 0, Math.PI / 2], 16);
  // sensor eletro-óptico
  t.box(0.14, 0.12, 0.14, dark, [0.18, 0.58, -0.16]);
  turret.glass.cyl(0.035, 0.035, 0.02, '#ffffff', [0.255, 0.58, -0.16], [0, 0, Math.PI / 2], 10);
  turret.accent.box(0.4, 0.07, 0.02, '#ffffff', [-0.15, 0.25, 0.315]);
  turret.accent.box(0.4, 0.07, 0.02, '#ffffff', [-0.15, 0.25, -0.315]);

  // canhões gêmeos de tiro rápido no centro da torre
  const elev = 0.62;
  const guns: { layers: ModelLayers; pivot: V3; elev: number; muzzle: V3; recoil: number }[] = [];
  for (const z of [0.09, -0.09]) {
    const gl = layers();
    gl.body.cyl(0.026, 0.03, 1.15, black, [0.6, 0, 0], [0, 0, Math.PI / 2], 10);
    gl.body.cyl(0.045, 0.045, 0.3, dark, [0.12, 0, 0], [0, 0, Math.PI / 2], 10);
    openMuzzle(gl.body, 1.24, 0.08, 0.036, 0.018, black, 12);
    guns.push({ layers: gl.build(), pivot: [0.25, 0.42, z], elev, muzzle: [1.25, 0, 0], recoil: 0.1 });
  }
  return {
    hull: hull.build(),
    turret: turret.build(),
    turretPivot: [-0.45, 0.98, 0],
    muzzle: [0.25 + Math.cos(elev) * 1.25, 0.42 + Math.sin(elev) * 1.25, 0.09],
    guns,
    shot: 'flak',
    launchers,
    glow: [
      { at: [-0.299, 1.12, 0.18], normal: [1, 0, 0], r: 0.022, color: '#7dff6a' },
      { at: [-0.299, 1.12, -0.18], normal: [1, 0, 0], r: 0.022, color: 'faction' },
    ],
  };
}

/**
 * Phalanx CIWS Móvel (Era Digital): 8×8 blindado de nariz em cunha (casco em V facetado, para-brisa duplo inclinado,
 * barra de faróis de LED), carroceria baixa com armários e escapamento vertical, e na traseira a montagem do Phalanx:
 * base giratória, cúpula branca do radar (cilindro com tampa em domo e faixa na cor da nação), Gatling de 6 canos
 * elevado (gira ao disparar), tambor de munição, treliça em X sob o cano, câmera térmica e a pilha de caixas de
 * eletrônica ao lado. A torre gira para o alvo; o cano tem elevação fixa.
 */
function buildCiws(): BuiltUnit {
  const hull = layers();
  const b = hull.body;
  const olive = '#878a63';
  const oliveDark = '#64674a';
  const black = '#1d1e1b';
  const radome = '#f0ecdc';
  const sym = (pts: V3[]): V3[] => pts.flatMap(([x, y, z]) => (z === 0 ? [[x, y, z] as V3] : [[x, y, z] as V3, [x, y, -z] as V3]));

  // --- rodas: dois pares na frente, sob a cabine, e dois atrás, sob a montagem do canhão
  for (const x of [0.98, 0.5, -0.56, -1.04]) for (const z of [0.44, -0.44]) rollingWheel([x, 0.3, z], 0.3, 0.24);
  // longarinas e eixos (aparecem entre as rodas)
  b.box(2.5, 0.12, 0.42, black, [-0.05, 0.42, 0]);
  for (const x of [0.98, 0.5, -0.56, -1.04]) b.cyl(0.05, 0.05, 0.7, black, [x, 0.3, 0], [Math.PI / 2, 0, 0], 6);

  // --- cabine blindada em cunha: casco em V embaixo, nariz com a barra de faróis, para-brisa inclinado
  b.convex(
    sym([
      [0.18, 0.62, 0.5],
      [0.18, 0.96, 0.5],
      [0.18, 1.3, 0.41],
      [0.92, 1.3, 0.39],
      [1.16, 0.98, 0.46],
      [1.08, 0.96, 0.5],
      [1.3, 0.84, 0.48],
      [1.43, 0.84, 0.33],
      [1.34, 0.6, 0.3],
      [1.08, 0.62, 0.5],
      [1.02, 0.46, 0.3],
      [0.18, 0.46, 0.3],
    ]),
    olive,
  );
  // carroceria traseira, mais baixa, com as quinas de cima chanfradas
  b.convex(
    sym([
      [0.18, 0.62, 0.5],
      [0.18, 0.95, 0.5],
      [0.18, 1.02, 0.44],
      [-1.5, 1.02, 0.44],
      [-1.5, 0.95, 0.5],
      [-1.5, 0.62, 0.5],
      [-1.44, 0.46, 0.3],
      [0.18, 0.46, 0.3],
    ]),
    olive,
  );
  // saias de chapa sobre as rodas (para-lamas) e frisos laterais
  for (const z of [0.5, -0.5]) {
    for (const [x, w] of [
      [0.74, 0.92],
      [-0.8, 0.92],
    ] as const) {
      b.box(w, 0.04, 0.12, oliveDark, [x, 0.62, z * 1.02]);
      b.box(w - 0.04, 0.08, 0.02, oliveDark, [x, 0.58, z * 1.06]);
    }
    b.box(2.9, 0.035, 0.02, oliveDark, [-0.06, 0.95, z * 1.01]);
    // caixa lateral entre os eixos (tanque e armário) com fechos
    b.box(0.6, 0.24, 0.06, olive, [-0.03, 0.66, z * 0.98]);
    b.box(0.6, 0.02, 0.07, oliveDark, [-0.03, 0.78, z * 0.98]);
    for (const x of [-0.2, 0.14]) b.box(0.05, 0.03, 0.075, C.steel, [x, 0.72, z * 0.98]);
    // painéis de blindagem aparafusados na carroceria
    for (let i = 0; i < 3; i++) {
      const x = -0.22 - i * 0.42;
      b.box(0.38, 0.26, 0.02, olive, [x, 0.79, z * 1.01]);
      for (const dx of [-0.16, 0.16]) for (const y of [0.69, 0.89]) b.box(0.02, 0.02, 0.01, oliveDark, [x + dx, y, z * 1.025]);
    }
  }

  // --- frente: barra de faróis de LED, placa central, ganchos de reboque e para-choque
  const noseDir = Math.atan2(0.84 - 0.6, 1.43 - 1.34);
  for (const z of [0.2, -0.2]) {
    b.box(0.04, 0.07, 0.2, black, [1.42, 0.8, z]);
    for (let k = 0; k < 4; k++) b.box(0.012, 0.035, 0.03, '#f4efda', [1.443, 0.8, z + (k - 1.5) * 0.045]);
    b.box(0.03, 0.04, 0.04, '#e39a2b', [1.33, 0.82, z * 2.3]);
    // ganchos pendurados no casco em V
    b.add(new THREE.TorusGeometry(0.045, 0.014, 6, 10), C.steel, { pos: [1.38, 0.6, z * 1.1], rot: [0, Math.PI / 2, 0.3] });
  }
  b.box(0.02, 0.1, 0.16, '#d9d6c8', [1.4, 0.7, 0], [0, 0, noseDir - Math.PI / 2]);
  b.box(0.08, 0.06, 0.62, oliveDark, [1.37, 0.57, 0]);
  // vincos do casco em V (lâminas na quina)
  for (const z of [0.4, -0.4]) b.box(0.3, 0.03, 0.03, oliveDark, [1.36, 0.84, z], [0, z > 0 ? -0.9 : 0.9, 0]);

  // --- para-brisa duplo inclinado, molduras e janelas laterais com a porta
  const ws = Math.atan2(1.16 - 0.92, 1.3 - 0.98);
  const wn = new THREE.Vector3(1.3 - 0.98, 1.16 - 0.92, 0).normalize();
  for (const z of [0.18, -0.18]) {
    b.box(0.014, 0.33, 0.33, black, [1.04 + wn.x * 0.004, 1.14 + wn.y * 0.004, z], [0, 0, ws]);
    hull.glass.box(0.01, 0.27, 0.28, '#ffffff', [1.04 + wn.x * 0.012, 1.14 + wn.y * 0.012, z], [0, 0, ws]);
  }
  const sideTilt = Math.atan2(0.5 - 0.41, 1.3 - 0.96);
  for (const s of [1, -1]) {
    for (const [x, w] of [
      [0.74, 0.34],
      [0.36, 0.2],
    ] as const) {
      b.box(w + 0.04, 0.22, 0.012, black, [x, 1.13, s * 0.462], [-s * sideTilt, 0, 0]);
      hull.glass.box(w, 0.17, 0.01, '#ffffff', [x, 1.13, s * 0.47], [-s * sideTilt, 0, 0]);
    }
    // porta: recorte, dobradiças e maçaneta
    b.box(0.015, 0.34, 0.012, oliveDark, [0.55, 0.79, s * 0.505]);
    b.box(0.015, 0.34, 0.012, oliveDark, [0.95, 0.79, s * 0.505]);
    for (const y of [0.68, 0.9]) b.box(0.05, 0.03, 0.02, oliveDark, [0.95, y, s * 0.51]);
    b.box(0.07, 0.02, 0.02, C.steel, [0.62, 0.82, s * 0.512]);
    // faixa da nação na porta e luz de comboio
    hull.accent.box(0.34, 0.08, 0.012, '#ffffff', [0.75, 0.68, s * 0.508]);
    hull.accent.box(0.03, 0.035, 0.05, '#ffffff', [1.17, 0.99, s * 0.42]);
  }
  // teto: escotilha, caixas de sensores e antenas de chicote altas
  b.box(0.28, 0.03, 0.28, oliveDark, [0.48, 1.315, 0]);
  b.box(0.06, 0.02, 0.06, C.steel, [0.48, 1.335, 0.1]);
  for (const z of [0.3, -0.3]) b.box(0.1, 0.07, 0.08, oliveDark, [0.86, 1.33, z]);
  for (const z of [0.33, -0.33]) {
    b.cyl(0.025, 0.03, 0.05, black, [0.26, 1.325, z], undefined, 6);
    b.cyl(0.006, 0.009, 0.95, black, [0.26, 1.82, z], undefined, 4);
  }

  // --- carroceria: caixas de material atrás da cabine, plataforma do canhão, escapamento e luzes traseiras
  b.box(0.3, 0.22, 0.78, olive, [0.0, 1.13, 0]);
  b.box(0.3, 0.02, 0.8, oliveDark, [0.0, 1.245, 0]);
  for (const z of [0.25, -0.25]) b.box(0.2, 0.12, 0.2, oliveDark, [-0.32, 1.08, z]);
  for (const z of [0.4, -0.4]) {
    // armários baixos nas bordas do convés, ao lado da montagem
    b.box(1.0, 0.1, 0.1, olive, [-1.0, 1.07, z]);
    for (let i = 0; i < 4; i++) b.box(0.012, 0.09, 0.11, oliveDark, [-1.42 + i * 0.28, 1.07, z]);
  }
  b.box(0.98, 0.1, 0.62, oliveDark, [-0.98, 1.07, 0]);
  b.cyl(0.035, 0.035, 0.55, oliveDark, [-1.44, 1.29, -0.38], undefined, 8);
  b.cyl(0.04, 0.035, 0.06, black, [-1.44, 1.58, -0.38], undefined, 8);
  b.box(0.04, 0.03, 0.06, oliveDark, [-1.44, 1.2, -0.42]);
  for (const z of [0.38, -0.38]) {
    b.box(0.02, 0.05, 0.08, '#b23a2c', [-1.505, 0.86, z]);
    b.add(new THREE.TorusGeometry(0.04, 0.012, 6, 10), C.steel, { pos: [-1.52, 0.6, z * 0.6], rot: [0, Math.PI / 2, 0] });
  }

  // --- montagem do Phalanx (torre): base giratória, berço, cúpula do radar, câmera, munição e eletrônica
  const turret = layers();
  const t = turret.body;
  t.cyl(0.36, 0.4, 0.08, oliveDark, [0, 0.04, 0], undefined, 16);
  t.convex(
    sym([
      [-0.3, 0.08, 0.28],
      [0.3, 0.08, 0.28],
      [0.34, 0.2, 0.22],
      [0.24, 0.36, 0.22],
      [-0.28, 0.36, 0.24],
      [-0.34, 0.2, 0.28],
    ]),
    olive,
  );
  // garfo de elevação dos dois lados e a caixa do mecanismo sob a cúpula
  for (const z of [0.26, -0.26]) t.box(0.36, 0.34, 0.06, oliveDark, [0.02, 0.5, z]);
  t.box(0.5, 0.14, 0.44, olive, [-0.02, 0.68, 0]);
  t.box(0.52, 0.03, 0.46, oliveDark, [-0.02, 0.76, 0]);
  // cúpula do radar: cilindro claro com domo em cima, costuras e a faixa da nação embaixo
  t.cyl(0.235, 0.245, 0.56, radome, [-0.04, 1.06, 0], undefined, 16);
  t.add(new THREE.SphereGeometry(0.235, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), radome, { pos: [-0.04, 1.34, 0], scale: [1, 0.62, 1] });
  t.cyl(0.03, 0.03, 0.03, '#c9c5ae', [-0.04, 1.49, 0], undefined, 8);
  t.cyl(0.25, 0.25, 0.025, '#c9c5ae', [-0.04, 1.2, 0], undefined, 16);
  t.cyl(0.252, 0.252, 0.03, oliveDark, [-0.04, 0.79, 0], undefined, 16);
  turret.accent.cyl(0.25, 0.25, 0.07, '#ffffff', [-0.04, 0.86, 0], undefined, 16);
  // tambor de munição atrás e embaixo da cúpula (acompanha o cano)
  t.cyl(0.13, 0.13, 0.42, olive, [-0.2, 0.52, 0.07], [0, 0, Math.PI / 2], 14);
  for (const x of [-0.38, -0.02]) t.cyl(0.135, 0.135, 0.03, oliveDark, [x, 0.52, 0.07], [0, 0, Math.PI / 2], 14);
  // treliça em X sob o cano (suporte do berço)
  for (const z of [0.205, 0.0]) {
    t.box(0.24, 0.025, 0.025, oliveDark, [0.22, 0.4, z + 0.07]);
    t.box(0.24, 0.025, 0.025, oliveDark, [0.22, 0.6, z + 0.07]);
    t.box(0.025, 0.22, 0.025, oliveDark, [0.105, 0.5, z + 0.07]);
    t.box(0.025, 0.22, 0.025, oliveDark, [0.335, 0.5, z + 0.07]);
    t.box(0.3, 0.02, 0.02, oliveDark, [0.22, 0.5, z + 0.07], [0, 0, 0.72]);
    t.box(0.3, 0.02, 0.02, oliveDark, [0.22, 0.5, z + 0.07], [0, 0, -0.72]);
  }
  // câmera térmica e telêmetro no lado oposto ao cano
  t.box(0.06, 0.2, 0.05, oliveDark, [0.08, 0.86, -0.27]);
  t.box(0.2, 0.15, 0.13, olive, [0.12, 0.98, -0.31]);
  t.box(0.04, 0.11, 0.11, black, [0.23, 0.98, -0.31]);
  for (const y of [1.01, 0.95]) turret.glass.cyl(0.03, 0.03, 0.02, '#ffffff', [0.255, y, -0.31], [0, 0, Math.PI / 2], 10);
  // pilha de caixas de eletrônica e refrigeração ao lado da cúpula, com aletas e cabos
  for (const [y, h, w] of [
    [0.24, 0.3, 0.3],
    [0.5, 0.22, 0.26],
    [0.72, 0.2, 0.22],
  ] as const) {
    t.box(w, h, 0.14, olive, [-0.2, y, -0.4]);
    t.box(w + 0.01, 0.015, 0.15, oliveDark, [-0.2, y + h / 2, -0.4]);
  }
  for (let i = 0; i < 5; i++) t.box(0.012, 0.18, 0.02, oliveDark, [-0.31 + i * 0.05, 0.24, -0.475]);
  t.cyl(0.02, 0.02, 0.4, black, [-0.02, 0.6, -0.33], [0.4, 0, 0], 5);
  t.box(0.16, 0.12, 0.1, olive, [-0.22, 0.24, 0.36]);
  turret.accent.box(0.3, 0.07, 0.012, '#ffffff', [-0.02, 0.22, 0.3]);

  // --- Gatling de 6 canos: carcaça do rotor, feixe de canos, braçadeiras e a boca com os seis furos
  const elev = 0.38;
  const gl = layers();
  const g = gl.body;
  g.cyl(0.075, 0.075, 0.26, black, [0.08, 0, 0], [0, 0, Math.PI / 2], 12);
  g.cyl(0.06, 0.075, 0.06, '#2c2d29', [0.24, 0, 0], [0, 0, Math.PI / 2], 12);
  const L = 1.0;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.cyl(0.014, 0.014, L - 0.24, '#26272a', [0.24 + (L - 0.24) / 2, Math.sin(a) * 0.034, Math.cos(a) * 0.034], [0, 0, Math.PI / 2], 6);
    g.add(new THREE.CircleGeometry(0.009, 6), '#030303', { pos: [L + 0.031, Math.sin(a) * 0.034, Math.cos(a) * 0.034], rot: [0, Math.PI / 2, 0] });
  }
  g.cyl(0.022, 0.022, L - 0.24, '#131413', [0.24 + (L - 0.24) / 2, 0, 0], [0, 0, Math.PI / 2], 6);
  g.cyl(0.056, 0.056, 0.035, '#2c2d29', [0.56, 0, 0], [0, 0, Math.PI / 2], 12);
  g.cyl(0.058, 0.058, 0.09, '#2c2d29', [L - 0.015, 0, 0], [0, 0, Math.PI / 2], 12);
  g.add(new THREE.RingGeometry(0.046, 0.058, 12), '#3a3b37', { pos: [L + 0.03, 0, 0], rot: [0, Math.PI / 2, 0] });
  g.add(new THREE.CircleGeometry(0.046, 12), '#2a2b28', { pos: [L + 0.029, 0, 0], rot: [0, Math.PI / 2, 0] });
  // a torre é montada a partir do convés e erguida até a altura real (a poeira do shader é pela altura local)
  const deck = 1.12;
  const built = turret.build();
  const barrel = gl.build();
  for (const geo of [barrel.body, barrel.accent, barrel.glass]) if (geo.getAttribute('position')) geo.translate(0, deck, 0);
  for (const geo of [built.body, built.accent, built.glass]) if (geo.getAttribute('position')) geo.translate(0, deck, 0);
  const pivot: V3 = [0.2, 0.68 + deck, 0.07];
  return {
    hull: hull.build(),
    turret: built,
    turretPivot: [-0.95, 0, 0],
    muzzle: [pivot[0] + Math.cos(elev) * (L + 0.04), pivot[1] + Math.sin(elev) * (L + 0.04), pivot[2]],
    guns: [{ layers: barrel, pivot, elev, muzzle: [L + 0.04, 0, 0], recoil: 0.015, spin: 40, lift: deck }],
    shot: 'gatling',
  };
}

// ------------------------------------------------------------------ cidadãos

let citizenCache: ModelLayers | null = null;

/**
 * Civil trabalhador (frente = +x, pés em y = 0): macacão, botas e capacete na cor da facção.
 * Um único boneco por instância — desenhado em lote (InstancedMesh) pela camada de cidadãos.
 */
export function citizenModel(): ModelLayers {
  if (citizenCache) return citizenCache;
  const l = layers();
  const b = l.body;
  const s = 1.25;
  const p = (dx: number, dy: number, dz: number): [number, number, number] => [dx * s, dy * s, dz * s];
  const overall = '#4f5e6c';
  b.box(0.1 * s, 0.36 * s, 0.1 * s, overall, p(0, 0.22, 0.065));
  b.box(0.1 * s, 0.36 * s, 0.1 * s, overall, p(0, 0.22, -0.065));
  b.box(0.15 * s, 0.06 * s, 0.11 * s, C.boot, p(0.025, 0.03, 0.065));
  b.box(0.15 * s, 0.06 * s, 0.11 * s, C.boot, p(0.025, 0.03, -0.065));
  b.box(0.18 * s, 0.34 * s, 0.26 * s, overall, p(0, 0.56, 0));
  b.box(0.19 * s, 0.04 * s, 0.27 * s, '#3a2f25', p(0, 0.42, 0)); // cinto
  b.box(0.07 * s, 0.3 * s, 0.07 * s, overall, p(0, 0.56, 0.165), [0.12, 0, 0]);
  b.box(0.07 * s, 0.3 * s, 0.07 * s, overall, p(0, 0.56, -0.165), [-0.12, 0, 0]);
  b.box(0.06 * s, 0.06 * s, 0.06 * s, C.skin, p(0, 0.39, 0.18));
  b.box(0.06 * s, 0.06 * s, 0.06 * s, C.skin, p(0, 0.39, -0.18));
  b.sphere(0.085 * s, C.skin, p(0.01, 0.82, 0), undefined, 8);
  // capacete e colete refletivo na cor da facção
  l.accent.sphere(0.1 * s, '#ffffff', p(0, 0.87, 0), [1, 0.62, 1], 8);
  l.accent.box(0.2 * s, 0.015 * s, 0.22 * s, '#ffffff', p(0.02, 0.84, 0));
  l.accent.box(0.185 * s, 0.05 * s, 0.265 * s, '#ffffff', p(0, 0.62, 0));
  citizenCache = l.build();
  return citizenCache;
}

let recruitCache: ModelLayers | null = null;

/** Recruta da reserva: um soldado de uniforme e fuzil (mesmo modelo da infantaria, sozinho). */
export function recruitModel(): ModelLayers {
  if (recruitCache) return recruitCache;
  const l = layers();
  // recrutas são desenhados em lote, sem animação: as pernas vão fixas no corpo
  staticLegs = l.body;
  try {
    soldier(l.body, l.accent, 0, 0, 0);
  } finally {
    staticLegs = null;
  }
  recruitCache = l.build();
  return recruitCache;
}

export function disposeCitizenModel(): void {
  for (const m of [citizenCache, recruitCache]) if (m) for (const g of [m.body, m.accent, m.glass]) g.dispose();
  citizenCache = null;
  recruitCache = null;
}
