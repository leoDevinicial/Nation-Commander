import type * as THREE from 'three';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';

type V3 = [number, number, number];

/**
 * Cavalo-mecânico (unidade de bombeio) no padrão real: base de concreto e skid de aço, poste
 * sansão em "A" com escada e plataforma amarelas, balancim em perfil I, cabeça de cavalo curva com
 * listras de alerta, redutor com manivelas e contrapesos listrados, bielas, motor elétrico com
 * proteção da correia, cabresto, haste polida e cabeça de poço com válvulas vermelhas.
 *
 * Medidas em unidades locais (comprimento ≈ 2,9; altura do mancal 1,75), com o balancim ao longo de
 * +x (cabeça de cavalo do lado do poço). A cinemática usada na animação:
 * - balancim: θ = AMP·sen(ωt) em torno do mancal;
 * - cabresto/haste: sobe e desce R·θ (a cabeça é um arco centrado no mancal);
 * - manivela: φ = ωt + π, raio REAR·AMP (acompanha a traseira do balancim);
 * - bielas: ligam a traseira do balancim ao pino da manivela a cada quadro.
 */
export const PUMP = {
  pivot: [0, 1.75, 0] as V3,
  /** Raio da cabeça de cavalo (do mancal até a face do arco). */
  radius: 0.95,
  /** Distância do mancal ao ponto das bielas na traseira do balancim (e altura abaixo do eixo). */
  rear: 1.1,
  rearDrop: 0.14,
  amp: 0.245,
  crank: [-1.1, 0.62, 0] as V3,
  /** Distância lateral das bielas. */
  pitmanZ: 0.33,
};
export const CRANK_R = PUMP.rear * PUMP.amp;

const BLACK = '#1d1e20';
const HAZARD = '#f2b705';
const PAINT_YELLOW = '#efb810';

/** Transformação de desenho: origem, escala e espelho em x (manivela em repouso). */
interface Xf {
  o: V3;
  s: number;
  flip?: boolean;
}
const at = (t: Xf, [x, y, z]: V3): V3 => [t.o[0] + t.s * (t.flip ? -x : x), t.o[1] + t.s * y, t.o[2] + t.s * z];

function bx(b: PartBuilder, t: Xf, w: number, h: number, d: number, color: THREE.ColorRepresentation, p: V3, rotZ = 0): void {
  b.box(w * t.s, h * t.s, d * t.s, color, at(t, p), rotZ ? [0, 0, t.flip ? -rotZ : rotZ] : undefined);
}
function cy(b: PartBuilder, t: Xf, r: number, h: number, color: THREE.ColorRepresentation, p: V3, rot?: V3, seg = 10): void {
  b.cyl(r * t.s, r * t.s, h * t.s, color, at(t, p), rot, seg);
}
function st(b: PartBuilder, t: Xf, a: V3, c: V3, th: number, color: THREE.ColorRepresentation, round = false): void {
  strut(b, at(t, a), at(t, c), th * t.s, color, round);
}

/** Partes fixas: base, skid, poste sansão, escada, redutor, motor, cerca e cabeça de poço. */
function drawFrame(b: PartBuilder, t: Xf): void {
  // base de concreto e skid de aço
  bx(b, t, 2.45, 0.14, 1.0, C.concreteDark, [-0.66, 0.13, 0]);
  for (const z of [-0.34, 0.34]) bx(b, t, 2.25, 0.1, 0.08, BLACK, [-0.66, 0.25, z]);
  for (const x of [-1.62, -1.0, -0.3, 0.32]) bx(b, t, 0.08, 0.06, 0.76, BLACK, [x, 0.27, 0]);
  // poste sansão em "A" com contraventamentos
  for (const z of [-1, 1]) {
    st(b, t, [0.4, 0.3, 0.3 * z], [0.03, 1.66, 0.07 * z], 0.075, BLACK);
    st(b, t, [-0.42, 0.3, 0.3 * z], [-0.03, 1.66, 0.07 * z], 0.075, BLACK);
    st(b, t, [0.26, 0.82, 0.22 * z], [-0.27, 0.82, 0.22 * z], 0.045, BLACK);
    st(b, t, [0.26, 0.82, 0.22 * z], [-0.12, 1.3, 0.14 * z], 0.04, BLACK);
  }
  st(b, t, [0.26, 0.82, -0.22], [0.26, 0.82, 0.22], 0.04, BLACK);
  // escada amarela e plataforma com guarda-corpo no topo
  for (const z of [-0.09, 0.09]) st(b, t, [0.24, 0.3, z], [0.24, 1.5, z], 0.03, PAINT_YELLOW, true);
  for (let y = 0.45; y < 1.5; y += 0.16) bx(b, t, 0.02, 0.02, 0.18, PAINT_YELLOW, [0.24, y, 0]);
  bx(b, t, 0.42, 0.03, 0.34, BLACK, [0.04, 1.5, 0]);
  const ring: [number, number][] = [
    [-0.16, -0.17],
    [0.25, -0.17],
    [0.25, 0.17],
    [-0.16, 0.17],
  ];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = ring[i]!;
    const [x1, z1] = ring[(i + 1) % 4]!;
    st(b, t, [x0, 1.62, z0], [x1, 1.62, z1], 0.025, PAINT_YELLOW, true);
  }
  for (const [x, z] of ring) st(b, t, [x, 1.5, z], [x, 1.62, z], 0.022, PAINT_YELLOW, true);
  // mancal (sela) no topo do poste
  bx(b, t, 0.18, 0.1, 0.2, '#2b2d30', [0, 1.69, 0]);
  // redutor sobre pedestal, com cubo da manivela
  bx(b, t, 0.44, 0.15, 0.4, BLACK, [-1.1, 0.37, 0]);
  bx(b, t, 0.52, 0.36, 0.34, '#2a2c2f', [-1.1, 0.62, 0]);
  bx(b, t, 0.3, 0.08, 0.3, '#2a2c2f', [-1.1, 0.84, 0]);
  cy(b, t, 0.09, 0.56, C.metalDark, [-1.1, 0.62, 0], [Math.PI / 2, 0, 0], 10);
  // motor elétrico (aletas) e proteção da correia até o redutor
  bx(b, t, 0.36, 0.08, 0.3, BLACK, [-1.62, 0.34, 0]);
  cy(b, t, 0.14, 0.34, '#cfd2cf', [-1.64, 0.53, 0], [0, 0, Math.PI / 2], 12);
  for (const x of [-1.74, -1.64, -1.54]) cy(b, t, 0.155, 0.02, '#b9bcb9', [x, 0.53, 0], [0, 0, Math.PI / 2], 12);
  cy(b, t, 0.08, 0.06, '#9ea19e', [-1.83, 0.53, 0], [0, 0, Math.PI / 2], 8);
  bx(b, t, 0.26, 0.26, 0.08, PAINT_YELLOW, [-1.38, 0.6, 0]);
  // cerca de proteção em volta da manivela
  const rail = '#8d9196';
  railing(b, [at(t, [-1.86, 0, -0.48])[0], at(t, [-1.86, 0, -0.48])[2]], [at(t, [-0.55, 0, -0.48])[0], at(t, [-0.55, 0, -0.48])[2]], 0.2 * t.s, 0.36 * t.s, rail, 3);
  railing(b, [at(t, [-1.86, 0, 0.48])[0], at(t, [-1.86, 0, 0.48])[2]], [at(t, [-0.55, 0, 0.48])[0], at(t, [-0.55, 0, 0.48])[2]], 0.2 * t.s, 0.36 * t.s, rail, 3);
  railing(b, [at(t, [-1.86, 0, -0.48])[0], at(t, [-1.86, 0, -0.48])[2]], [at(t, [-1.86, 0, 0.48])[0], at(t, [-1.86, 0, 0.48])[2]], 0.2 * t.s, 0.36 * t.s, rail, 2);
  // cabeça de poço: flange, revestimento, cruzeta com válvulas e caixa de gaxetas
  const wx = PUMP.radius;
  cy(b, t, 0.17, 0.08, '#3a3b3d', [wx, 0.1, 0], undefined, 12);
  cy(b, t, 0.1, 0.22, C.red, [wx, 0.25, 0], undefined, 10);
  cy(b, t, 0.13, 0.05, '#8e2a22', [wx, 0.37, 0], undefined, 10);
  cy(b, t, 0.06, 0.42, C.red, [wx, 0.42, 0], [Math.PI / 2, 0, 0], 8);
  for (const z of [-0.2, 0.2]) {
    cy(b, t, 0.075, 0.07, '#8e2a22', [wx, 0.42, z], [Math.PI / 2, 0, 0], 8);
    cy(b, t, 0.012, 0.12, C.metalDark, [wx, 0.52, z], undefined, 4);
    cy(b, t, 0.07, 0.015, '#8e2a22', [wx, 0.58, z], undefined, 10); // volante
  }
  cy(b, t, 0.065, 0.2, '#7d2019', [wx, 0.56, 0], undefined, 8);
  cy(b, t, 0.08, 0.04, C.metalDark, [wx, 0.67, 0], undefined, 8);
}

/** Balancim (perfil I), cabeça de cavalo listrada e barra equalizadora — em torno do mancal. */
function drawBeam(b: PartBuilder, t: Xf): void {
  bx(b, t, 1.96, 0.18, 0.05, BLACK, [-0.2, 0, 0]);
  for (const y of [-0.09, 0.09]) bx(b, t, 1.96, 0.03, 0.16, BLACK, [-0.2, y, 0]);
  bx(b, t, 0.1, 0.08, 0.72, BLACK, [-PUMP.rear, -PUMP.rearDrop + 0.02, 0]);
  bx(b, t, 0.16, 0.16, 0.12, BLACK, [-PUMP.rear, -0.06, 0]);
  // cabeça de cavalo: arco centrado no mancal, faixas amarelas e pretas alternadas
  const R = PUMP.radius;
  const a0 = 0.34;
  const a1 = -0.56;
  const n = 8;
  const da = (a0 - a1) / n;
  for (let i = 0; i < n; i++) {
    const a = a0 - da * (i + 0.5);
    const depth = 0.34 - i * 0.012;
    const rc = R - depth / 2;
    bx(b, t, depth, R * da + 0.012, 0.17, i % 2 === 0 ? HAZARD : BLACK, [rc * Math.cos(a), rc * Math.sin(a), 0], a);
  }
}

/** Manivelas com contrapesos listrados e pino (em torno do eixo do redutor). */
function drawCrank(b: PartBuilder, t: Xf): void {
  for (const z of [-0.25, 0.25]) {
    bx(b, t, 0.78, 0.11, 0.05, BLACK, [-0.04, 0, z]);
    for (let i = 0; i < 4; i++) bx(b, t, 0.065, 0.36, 0.075, i % 2 === 0 ? HAZARD : BLACK, [-0.42 + i * 0.065, 0, z]);
    cy(b, t, 0.035, 0.12, C.steel, [CRANK_R, 0, z + Math.sign(z) * 0.05], [Math.PI / 2, 0, 0], 8);
  }
  cy(b, t, 0.07, 0.6, C.metalDark, [0, 0, 0], [Math.PI / 2, 0, 0], 10);
}

/** Bielas de comprimento unitário (de y = 0 a y = −1), escaladas a cada quadro. */
function drawPitman(b: PartBuilder): void {
  for (const z of [-PUMP.pitmanZ, PUMP.pitmanZ]) b.box(0.05, 1, 0.05, BLACK, [0, -0.5, z]);
}

/** Cabresto, barra carregadora e haste polida (pendurados na face da cabeça de cavalo). */
function drawRod(b: PartBuilder, t: Xf): void {
  for (const z of [-0.05, 0.05]) st(b, t, [0, 0.05, z], [0, -0.95, z], 0.012, '#2e3033', true);
  bx(b, t, 0.07, 0.05, 0.2, BLACK, [0, -0.95, 0]);
  st(b, t, [0, -0.95, 0], [0, -1.45, 0], 0.028, '#c9ced3', true);
}

export interface PumpRig {
  beam: ModelLayers;
  crank: ModelLayers;
  pitman: ModelLayers;
  rod: ModelLayers;
  /** Posições (no modelo) do mancal, do eixo da manivela e do topo do cabresto. */
  pivot: V3;
  crankPivot: V3;
  rodPivot: V3;
}

/** Cavalo-mecânico animado: estrutura nos builders do edifício e partes móveis separadas. */
export function pumpjack(frame: { b: PartBuilder }, origin: V3): PumpRig {
  drawFrame(frame.b, { o: origin, s: 1 });
  const beam = layers();
  drawBeam(beam.body, { o: [0, 0, 0], s: 1 });
  const crank = layers();
  drawCrank(crank.body, { o: [0, 0, 0], s: 1 });
  const pitman = layers();
  drawPitman(pitman.body);
  const rod = layers();
  drawRod(rod.body, { o: [0, 0, 0], s: 1 });
  const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  return {
    beam: beam.build(),
    crank: crank.build(),
    pitman: pitman.build(),
    rod: rod.build(),
    pivot: add(origin, PUMP.pivot),
    crankPivot: add(origin, PUMP.crank),
    rodPivot: add(origin, [PUMP.radius, PUMP.pivot[1], 0]),
  };
}

/** Cavalo-mecânico parado (segundo poço das melhorias), em escala reduzida. */
export function staticPumpjack(b: PartBuilder, origin: V3, s: number): void {
  const t = { o: origin, s };
  drawFrame(b, t);
  const p = PUMP.pivot;
  drawBeam(b, { o: at(t, p), s });
  drawCrank(b, { o: at(t, PUMP.crank), s, flip: true });
  drawRod(b, { o: at(t, [PUMP.radius, p[1], 0]), s });
  // bielas em repouso: da traseira do balancim até o pino (manivela em φ = π)
  for (const z of [-PUMP.pitmanZ, PUMP.pitmanZ])
    st(b, t, [-PUMP.rear, p[1] - PUMP.rearDrop, z], [PUMP.crank[0] - CRANK_R, PUMP.crank[1], z], 0.05, BLACK);
}

/** Pose do conjunto móvel para um ângulo do balancim θ (a manivela segue em φ = fase + π). */
export function pumpPose(pivot: V3, crankPivot: V3, theta: number, phi: number): { pitmanPos: V3; pitmanRotZ: number; pitmanLen: number; rodDy: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const tx = pivot[0] - PUMP.rear * c + PUMP.rearDrop * s;
  const ty = pivot[1] - PUMP.rear * s - PUMP.rearDrop * c;
  const px = crankPivot[0] + CRANK_R * Math.cos(phi);
  const py = crankPivot[1] + CRANK_R * Math.sin(phi);
  const dx = px - tx;
  const dy = py - ty;
  return { pitmanPos: [tx, ty, pivot[2]], pitmanRotZ: Math.atan2(dx, -dy), pitmanLen: Math.hypot(dx, dy), rodDy: PUMP.radius * theta };
}
