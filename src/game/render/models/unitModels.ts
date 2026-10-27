import type * as THREE from 'three';
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
   */
  guns?: { layers: ModelLayers; pivot: V3; elev: number; muzzle: V3; recoil: number }[];
  /** Tipo de disparo visível (projétil que sai da boca do cano). */
  shot?: 'apfsds' | 'howitzer' | 'flak' | 'autocannon';
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

const cache = new Map<UnitType, UnitModel>();

export function unitModel(type: UnitType): UnitModel {
  let m = cache.get(type);
  if (!m) {
    rig = { treads: [], spokes: new Map(), rolling: new Map(), legs: new Map() };
    const built = BUILDERS[type]();
    m = { ...built, motion: finishRig(rig) };
    rig = null;
    cache.set(type, m);
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
function bore(b: PartBuilder, x: number, r: number, ring = r * 1.25): void {
  b.cyl(ring, ring, 0.05, C.metalDark, [x - 0.025, 0, 0], [0, 0, Math.PI / 2], 14);
  b.cyl(r, r, 0.012, '#060606', [x + 0.002, 0, 0], [0, 0, Math.PI / 2], 14);
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
  bore(gb, gun + 0.03, 0.036, 0.06);
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
    muzzle: [g0 + gun + 0.06, 0.18, 0],
    guns: [{ layers: gunL.build(), pivot: [g0, 0.18, 0], elev: 0, muzzle: [gun + 0.06, 0, 0], recoil: 0.32 }],
    shot: 'apfsds',
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
  bore(gunL.body, 0.84, 0.022, 0.042);
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
    guns: [{ layers: gunL.build(), pivot: [0.26, 0.13, 0], elev: 0, muzzle: [0.85, 0, 0], recoil: 0.1 }],
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
  gb.cyl(0.072, 0.09, 2.2, C.oliveDark, [1.1, 0, 0], [0, 0, Math.PI / 2], 14);
  gb.cyl(0.11, 0.11, 0.26, C.oliveDark, [1.3, 0, 0], [0, 0, Math.PI / 2], 12);
  gb.cyl(0.085, 0.085, 0.3, C.metalDark, [2.32, 0, 0], [0, 0, Math.PI / 2], 14);
  for (const x of [2.21, 2.43]) gb.cyl(0.13, 0.13, 0.05, C.metalDark, [x, 0, 0], [0, 0, Math.PI / 2], 14);
  for (const z of [0.088, -0.088]) for (const x of [2.27, 2.37]) gb.box(0.06, 0.1, 0.012, '#0b0b0b', [x, 0, z]);
  bore(gb, 2.47, 0.05, 0.075);
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
    gl.body.cyl(0.032, 0.045, 1.25, C.metalDark, [0.7, 0, 0], [0, 0, Math.PI / 2], 10);
    gl.body.cyl(0.055, 0.055, 0.16, C.metalDark, [1.32, 0, 0], [0, 0, Math.PI / 2], 12);
    for (const dz of [0.056, -0.056]) gl.body.box(0.1, 0.022, 0.01, '#0b0b0b', [1.32, 0, dz]);
    bore(gl.body, 1.41, 0.024, 0.04);
    guns.push({ layers: gl.build(), pivot: [0.15, 0.32, z], elev, muzzle: [1.42, 0, 0], recoil: 0.12 });
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
    muzzle: [0.15 + Math.cos(elev) * 1.42, 0.32 + Math.sin(elev) * 1.42, 0.52],
    guns,
    shot: 'flak',
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
