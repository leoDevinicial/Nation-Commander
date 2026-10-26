import * as THREE from 'three';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

/**
 * Indústria extrativa com movimento: serraria (toras correndo na esteira até a serra fita e a
 * mesa de transferência com serra destopadeira), pedreira (bancadas de rocha cortada, guindaste
 * treliçado que gira e iça blocos, silo e escritório) e mina (encosta rochosa, castelete com polias
 * girando, vagonetes que entram e saem do túnel). As peças móveis vão em `anims`; o resto é
 * fundido numa geometria por material, como os demais edifícios.
 *
 * As áreas usadas pelos módulos de melhoria (`upgradeModules.ts`) ficam livres: cada base ocupa o
 * miolo do terreno e as faixas que já ocupava antes.
 */

type V3 = [number, number, number];
type Built = Omit<BuildingModel, 'detail'>;

const GREEN = '#2f6b35';
const GREEN_DARK = '#244f29';
const RED = '#d0392b';
const BLACK = '#1f2022';
const LOG = '#a77b4d';
const LOG_END = '#e2c08a';
const BLOCK_WALL = '#c9cbc4';
const ROCK = '#d6d2c6';
const ROCK_DARK = '#b9b3a4';
const CRANE = '#e0b11d';

// ------------------------------------------------------------------ peças comuns

/** Tora com as pontas claras (anéis do corte); eixo ao longo de x, z ou y. */
export function log(b: PartBuilder, pos: V3, len: number, r: number, axis: 'x' | 'z' | 'y' = 'x'): void {
  const rot: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  b.cyl(r, r * 1.04, len, LOG, pos, rot, 8);
  const off = len / 2 + 0.004;
  for (const s of [-1, 1]) {
    const p: V3 = [...pos];
    const i = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
    p[i] += s * off;
    b.cyl(r * 0.92, r * 0.92, 0.012, LOG_END, p, rot, 8);
  }
}

/** Disco de serra com dentes (plano yz, gira em torno de x). */
function sawBlade(b: PartBuilder, r: number): void {
  b.cyl(r, r, 0.02, '#c8ced6', [0, 0, 0], [0, 0, Math.PI / 2], 24);
  b.cyl(r * 0.25, r * 0.25, 0.04, C.metalDark, [0, 0, 0], [0, 0, Math.PI / 2], 10);
  const teeth = 18;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    b.box(0.022, 0.05, 0.03, '#9aa2ab', [0, Math.cos(a) * r, Math.sin(a) * r], [a, 0, 0]);
  }
}

/** Pilha de madeira serrada com separadores (tabiques), comprimento ao longo de x. */
function lumberStack(b: PartBuilder, x: number, z: number, len: number, layers3: number): void {
  for (let k = 0; k < layers3; k++) {
    const y = 0.09 + k * 0.075;
    for (let i = 0; i < 4; i++) b.box(len, 0.05, 0.09, k % 2 ? '#d6b27c' : '#cfa86f', [x, y, z - 0.15 + i * 0.1]);
    for (const dx of [-len * 0.4, 0, len * 0.4]) b.box(0.04, 0.025, 0.42, '#8a6a45', [x + dx, y + 0.037, z]);
  }
}

/** Galpão de blocos de concreto: rodapé escuro, juntas horizontais, faixa de janelas e lanternim. */
function blockHall(b: PartBuilder, g: PartBuilder, a: PartBuilder, x0: number, x1: number, z0: number, z1: number, h: number): void {
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  b.box(w, h, d, BLOCK_WALL, [cx, h / 2 + 0.06, cz]);
  b.box(w + 0.02, 0.14, d + 0.02, C.concreteDark, [cx, 0.13, cz]);
  for (let y = 0.32; y < h - 0.25; y += 0.16) {
    b.box(w + 0.012, 0.012, d + 0.012, '#b3b5ae', [cx, y, cz]);
  }
  // faixa de janelas na frente e nas laterais
  g.box(w - 0.3, 0.12, 0.02, '#ffffff', [cx, h - 0.12, z1 + 0.005]);
  g.box(0.02, 0.12, d - 0.3, '#ffffff', [x1 + 0.005, h - 0.12, cz]);
  g.box(0.02, 0.12, d - 0.3, '#ffffff', [x0 - 0.005, h - 0.12, cz]);
  // cobertura com platibanda e lanternim envidraçado
  b.box(w + 0.08, 0.06, d + 0.08, C.roof, [cx, h + 0.09, cz]);
  b.box(w + 0.08, 0.08, 0.04, C.concreteDark, [cx, h + 0.15, z1 + 0.04]);
  b.box(w - 0.3, 0.2, d * 0.38, '#8d9196', [cx, h + 0.22, cz]);
  g.box(w - 0.34, 0.1, d * 0.38 + 0.02, '#ffffff', [cx, h + 0.23, cz]);
  b.box(w - 0.22, 0.04, d * 0.46, C.roof, [cx, h + 0.34, cz]);
  a.box(w * 0.5, 0.07, 0.02, '#ffffff', [cx + w * 0.18, h + 0.01, z1 + 0.012]);
}

// ------------------------------------------------------------------ serraria

export function buildSawmillModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#5e5242', [0, 0.03, 0]); // pátio de terra batida
  b.box(1.0, 0.02, 1.6, '#6e6253', [-0.55, 0.065, 0.55]); // pista da esteira
  // galpão principal com portão de entrada das toras
  const hx0 = -1.45;
  const hx1 = 0.15;
  const hz0 = -1.15;
  const hz1 = -0.05;
  blockHall(b, g, a, hx0, hx1, hz0, hz1, 1.15);
  b.box(0.52, 0.62, 0.03, '#141414', [-0.55, 0.4, hz1 + 0.01]); // vão do portão
  b.box(0.54, 0.24, 0.05, C.metal, [-0.55, 0.62, hz1 + 0.025]); // porta de enrolar meio aberta
  for (let i = 0; i < 4; i++) b.box(0.54, 0.012, 0.06, C.metalDark, [-0.55, 0.52 + i * 0.06, hz1 + 0.03]);
  b.box(0.2, 0.42, 0.03, '#5d6b74', [-1.15, 0.3, hz1 + 0.01]); // porta de pessoal
  for (const x of [hx0 + 0.04, hx1 - 0.04]) b.cyl(0.025, 0.025, 1.1, C.metalDark, [x, 0.62, hz1 + 0.04], undefined, 6);
  // chaminé da caldeira (queima de resíduos)
  b.cyl(0.08, 0.09, 1.3, C.metalDark, [-1.2, 1.85, -0.95], undefined, 10);
  for (const y of [1.6, 2.1]) b.cyl(0.095, 0.095, 0.04, C.metal, [-1.2, y, -0.95], undefined, 10);

  // esteira de toras (verde) com berços pretos e garras vermelhas, até o portão
  const ex = -0.55;
  for (const s of [-1, 1]) b.box(0.06, 0.12, 1.25, GREEN, [ex + s * 0.2, 0.28, 0.55]);
  for (const z of [0.05, 0.5, 0.95]) for (const s of [-1, 1]) b.box(0.05, 0.22, 0.05, BLACK, [ex + s * 0.2, 0.15, z]);
  b.box(0.06, 0.02, 1.25, '#2a2a2a', [ex, 0.335, 0.55]); // corrente
  for (let i = 0; i < 9; i++) b.box(0.07, 0.022, 0.03, '#e6c22e', [ex, 0.345, 0.0 + i * 0.14]); // elos marcados
  for (let i = 0; i < 5; i++) {
    const z = 0.1 + i * 0.25;
    for (const s of [-1, 1]) b.box(0.16, 0.035, 0.05, BLACK, [ex + s * 0.09, 0.4, z], [0, 0, s * 0.55]);
    b.box(0.04, 0.06, 0.06, RED, [ex + 0.18, 0.44, z], [0, 0, -0.5]);
  }
  // serra fita/circular no portão: carcaça preta e protetor
  b.box(0.05, 0.3, 0.05, BLACK, [ex + 0.2, 0.2, 0.32]);
  b.box(0.05, 0.3, 0.05, BLACK, [ex + 0.2, 0.2, 0.04]);
  b.box(0.08, 0.05, 0.36, BLACK, [ex + 0.16, 0.74, 0.18]); // protetor sobre o disco
  // cabine do operador entre a esteira e a mesa de transferência
  b.box(0.3, 0.06, 0.3, C.concreteDark, [0.0, 0.09, 0.3]);
  b.box(0.28, 0.42, 0.28, '#d9d8d0', [0.0, 0.33, 0.3]);
  g.box(0.24, 0.16, 0.29, '#ffffff', [0.0, 0.42, 0.3]);
  b.box(0.32, 0.04, 0.32, C.roof, [0.0, 0.56, 0.3]);

  // mesa de transferência com rolos verdes, garras vermelhas e serra destopadeira
  const tx0 = 0.35;
  const tx1 = 1.45;
  for (const z of [0.2, 1.0]) b.box(tx1 - tx0, 0.12, 0.06, GREEN, [(tx0 + tx1) / 2, 0.3, z]);
  for (const x of [tx0 + 0.05, (tx0 + tx1) / 2, tx1 - 0.05]) for (const z of [0.2, 1.0]) b.box(0.05, 0.24, 0.05, BLACK, [x, 0.14, z]);
  for (let i = 0; i < 6; i++) {
    const x = tx0 + 0.12 + i * 0.18;
    b.cyl(0.04, 0.04, 0.78, GREEN_DARK, [x, 0.38, 0.6], [Math.PI / 2, 0, 0], 8);
    b.box(0.03, 0.08, 0.05, RED, [x + 0.07, 0.42, 0.28], [0, 0, 0.6]);
    b.box(0.03, 0.08, 0.05, RED, [x + 0.07, 0.42, 0.92], [0, 0, 0.6]);
  }
  b.box(0.08, 0.5, 0.2, BLACK, [0.4, 0.42, 0.36]); // suporte da destopadeira
  b.box(0.2, 0.06, 0.26, BLACK, [0.42, 0.75, 0.6]);

  // pilhas: toras no fundo, madeira serrada na frente e serragem ao lado
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) log(b, [-1.25 + i * 0.25 + row * 0.125, 0.18 + row * 0.21, -1.6], 0.9, 0.11);
  lumberStack(b, 0.95, 1.45, 0.75, 3);
  lumberStack(b, 0.95, 1.85 - 0.02, 0.6, 2);
  b.cyl(0.02, 0.36, 0.3, '#c9a46a', [-1.15, 0.2, 0.45], undefined, 9);

  // partes móveis: toras na esteira, serras girando e tora na mesa de transferência
  const anims: ModelAnim[] = [];
  for (const phase of [0, 0.5]) {
    const lg = layers();
    log(lg.body, [0, 0, 0], 0.7, 0.1, 'z');
    anims.push({ layers: lg.build(), pivot: [ex, 0.5, 0.85], motion: { kind: 'slide', dir: [0, 0, -1], length: 1.3, speed: 0.22, phase, fade: 0.12 } });
  }
  const saw = layers();
  sawBlade(saw.body, 0.24);
  anims.push({ layers: saw.build(), pivot: [ex + 0.11, 0.48, 0.18], motion: { kind: 'spin', axis: 'x', speed: 16 } });
  const trim = layers();
  sawBlade(trim.body, 0.2);
  anims.push({ layers: trim.build(), pivot: [0.47, 0.55, 0.6], motion: { kind: 'spin', axis: 'x', speed: 16 } });
  const tlog = layers();
  log(tlog.body, [0, 0, 0], 0.7, 0.09, 'x');
  anims.push({ layers: tlog.build(), pivot: [1.45, 0.51, 0.6], motion: { kind: 'slide', dir: [-1, 0, 0], length: 0.62, speed: 0.12, fade: 0.14 } });
  return { base: l.build(), moving: null, anims, height: 2.5, smoke: [[-1.2, 2.55, -0.95]] };
}

// ------------------------------------------------------------------ pedreira

/** Bancadas da cava: degraus de rocha clara com cortes irregulares, subindo para o fundo. */
function benches(b: PartBuilder, x0: number, x1: number): void {
  const tiers: [number, number, number][] = [
    [-0.95, -1.25, 0.28],
    [-1.25, -1.55, 0.58],
    [-1.55, -1.92, 0.9],
  ];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const [zf, zb, h] of tiers) {
    // blocos cortados lado a lado, com pequenas diferenças de altura, recuo e tom
    let x = x0;
    while (x < x1 - 0.05) {
      const w = Math.min(x1 - x, 0.32 + rnd() * 0.3);
      const hh = h + (rnd() - 0.5) * 0.08;
      const front = zf + (rnd() - 0.5) * 0.06;
      const tone = rnd() < 0.3 ? ROCK_DARK : rnd() < 0.5 ? '#ddd9cf' : ROCK;
      b.box(w - 0.01, hh, front - zb, tone, [x + w / 2, hh / 2 + 0.06, (front + zb) / 2]);
      if (rnd() < 0.35) b.box(w * 0.6, 0.015, 0.02, '#9d8f7a', [x + w / 2, hh * 0.6, front + 0.005]); // veio escuro
      x += w;
    }
  }
}

export function buildQuarryModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#b9b19f', [0, 0.03, 0]); // piso da cava (pó de pedra)
  benches(b, -1.3, 1.5);
  // blocos cortados no pátio
  for (const [x, z, w, h, d] of [
    [-0.65, 0.45, 0.4, 0.3, 0.32],
    [-1.0, 0.55, 0.32, 0.28, 0.3],
    [-0.8, 0.12, 0.36, 0.26, 0.3],
    [-0.78, 0.12, 0.28, 0.22, 0.24],
  ] as const) {
    const y = x === -0.78 ? 0.06 + 0.26 + h / 2 : 0.06 + h / 2;
    b.box(w, h, d, x === -0.65 ? '#e3dfd5' : ROCK, [x, y, z]);
  }
  // silo de agregado com escada de gaiola, torre treliçada e faixa da nação
  const sx = 1.15;
  const sz = -0.55;
  b.cyl(0.33, 0.33, 1.5, '#a9adb1', [sx, 0.85, sz], undefined, 16);
  for (let y = 0.25; y < 1.6; y += 0.2) b.cyl(0.338, 0.338, 0.025, '#8d9196', [sx, y, sz], undefined, 16);
  b.cyl(0.04, 0.35, 0.22, '#9ea2a6', [sx, 1.71, sz], undefined, 16);
  b.cyl(0.06, 0.06, 0.12, C.metalDark, [sx, 1.86, sz], undefined, 8);
  a.box(0.36, 0.42, 0.02, '#ffffff', [sx, 0.9, sz + 0.335]);
  // passarela no topo do silo
  b.add(new THREE.TorusGeometry(0.36, 0.012, 4, 20), CRANE, { pos: [sx, 1.72, sz], rot: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) strut(b, [sx - 0.36, 0.1, sz + s * 0.08], [sx - 0.36, 1.55, sz + s * 0.08], 0.02, C.yellow, true);
  // escritório pré-fabricado com ar-condicionado
  b.box(0.6, 0.06, 0.34, C.concreteDark, [0.75, 0.09, 0.95]);
  b.box(0.58, 0.42, 0.32, '#c3c6c4', [0.75, 0.33, 0.95]);
  for (let i = 0; i < 6; i++) b.box(0.012, 0.4, 0.33, '#aeb2b0', [0.5 + i * 0.1, 0.33, 0.95]);
  g.box(0.18, 0.13, 0.02, '#ffffff', [0.62, 0.38, 1.115]);
  b.box(0.12, 0.28, 0.02, '#5d6b74', [0.92, 0.28, 1.115]);
  b.box(0.62, 0.035, 0.36, '#8d9196', [0.75, 0.56, 0.95]);
  b.box(0.12, 0.1, 0.08, C.steel, [0.38, 0.36, 0.95]);
  // tambores junto ao guindaste
  for (let i = 0; i < 3; i++) b.cyl(0.06, 0.06, 0.15, i === 1 ? '#3f5f8a' : '#c9a23a', [0.62 + i * 0.13, 0.135, -0.05], undefined, 8);

  // guindaste: base quadrada com faixa amarela, pedestal cônico e passarela circular
  const cx = 0.1;
  const cz = 0.1;
  b.box(0.95, 0.24, 0.95, '#3a3d40', [cx, 0.18, cz]);
  b.box(0.97, 0.04, 0.97, CRANE, [cx, 0.31, cz]);
  railing(b, [cx - 0.47, cz + 0.47], [cx + 0.47, cz + 0.47], 0.32, 0.2, CRANE, 3);
  railing(b, [cx + 0.47, cz - 0.47], [cx + 0.47, cz + 0.47], 0.32, 0.2, CRANE, 3);
  b.cyl(0.24, 0.34, 0.36, '#7d8288', [cx, 0.5, cz], undefined, 16);
  b.cyl(0.45, 0.45, 0.03, '#5a5f66', [cx, 0.62, cz], undefined, 20);
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    strut(b, [cx + Math.cos(t) * 0.44, 0.63, cz + Math.sin(t) * 0.44], [cx + Math.cos(t) * 0.44, 0.78, cz + Math.sin(t) * 0.44], 0.018, CRANE, true);
  }
  b.add(new THREE.TorusGeometry(0.44, 0.012, 4, 24), CRANE, { pos: [cx, 0.78, cz], rot: [Math.PI / 2, 0, 0] });

  // partes móveis: plataforma giratória com casa de máquinas, mastro em A e lança treliçada
  const turn = layers();
  const t = turn.body;
  t.box(0.62, 0.07, 0.5, '#4a4e52', [0, 0.04, 0]);
  t.box(0.3, 0.26, 0.4, CRANE, [-0.12, 0.2, 0]); // casa de máquinas
  turn.glass.box(0.02, 0.1, 0.18, '#ffffff', [-0.02, 0.24, 0.1]);
  t.box(0.1, 0.18, 0.3, '#3a3d40', [-0.3, 0.13, 0]); // contrapeso
  for (const s of [-1, 1]) strut(t, [0.12, 0.08, s * 0.18], [-0.05, 0.75, s * 0.05], 0.04, CRANE);
  strut(t, [-0.3, 0.08, 0], [-0.05, 0.75, 0], 0.035, CRANE);
  // lança treliçada: 4 banzos e diagonais em zigue-zague
  const ang = 0.9;
  const len = 1.7;
  const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
  const base0 = new THREE.Vector3(0.18, 0.1, 0);
  const off = (x: THREE.Vector3, k: number, dy: number, dz: number): V3 => {
    const p = x.clone().addScaledVector(dir, k);
    return [p.x - Math.sin(ang) * dy, p.y + Math.cos(ang) * dy, p.z + dz];
  };
  const hw = 0.07;
  for (const [dy, dz] of [
    [hw, hw],
    [hw, -hw],
    [-hw, hw],
    [-hw, -hw],
  ] as const)
    strut(t, off(base0, 0, dy, dz), off(base0, len, dy * 0.6, dz * 0.6), 0.025, CRANE);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const k0 = (i / n) * len;
    const k1 = ((i + 1) / n) * len;
    const sh0 = 1 - (0.4 * i) / n;
    const sh1 = 1 - (0.4 * (i + 1)) / n;
    for (const dz of [hw, -hw]) strut(t, off(base0, k0, hw * sh0, dz * sh0), off(base0, k1, -hw * sh1, dz * sh1), 0.014, CRANE);
    for (const dy of [hw, -hw]) strut(t, off(base0, k0, dy * sh0, -hw * sh0), off(base0, k1, dy * sh1, hw * sh1), 0.014, CRANE);
  }
  const tip = base0.clone().addScaledVector(dir, len);
  t.box(0.12, 0.12, 0.12, '#3a3d40', [tip.x, tip.y, tip.z]); // cabeça com polias
  // cabos de sustentação do mastro até a ponta
  for (const s of [-1, 1]) strut(t, [-0.05, 0.75, s * 0.05], [tip.x - 0.05, tip.y + 0.04, s * 0.04], 0.008, '#26282b', true);
  const turnIdx = 0;
  // gancho com bloco de pedra pendurado (sobe e desce, preso à lança que gira)
  const hook = layers();
  const drop = 0.65;
  strut(hook.body, [0, 0.0, 0], [0, -drop, 0], 0.01, '#26282b', true);
  hook.body.box(0.08, 0.1, 0.06, CRANE, [0, -drop - 0.02, 0]);
  for (const s of [-1, 1]) strut(hook.body, [0, -drop - 0.05, 0], [s * 0.15, -drop - 0.24, 0], 0.008, '#26282b', true);
  hook.body.box(0.34, 0.24, 0.28, '#e6e2d8', [0, -drop - 0.36, 0]);
  const anims: ModelAnim[] = [
    { layers: turn.build(), pivot: [cx, 0.64, cz], motion: { kind: 'swing', axis: 'y', amp: 0.55, speed: 0.32, phase: 0 } },
    { layers: hook.build(), pivot: [tip.x, tip.y - 0.06, tip.z], motion: { kind: 'bob', amp: 0.22, speed: 0.64, phase: 1.2 }, parent: turnIdx },
  ];
  // a lança aponta para o pátio de blocos (−x, um pouco para +z): gira a plataforma ≈160° em repouso
  // (feito na própria geometria para a oscilação continuar em torno de y)
  for (const an of anims.slice(0, 1)) {
    const rot = new THREE.Matrix4().makeRotationY(-2.79);
    for (const geo of [an.layers.body, an.layers.accent, an.layers.glass]) if (geo.getAttribute('position')) geo.applyMatrix4(rot);
  }
  const p = anims[1]!.pivot;
  const r = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(new THREE.Matrix4().makeRotationY(-2.79));
  anims[1]!.pivot = [r.x, r.y, r.z];
  return { base: l.build(), moving: null, anims, height: 2.4 };
}

// ------------------------------------------------------------------ mina

/** Roda de polia com raios (plano xy, gira em torno de z). */
function sheave(b: PartBuilder, r: number): void {
  b.add(new THREE.TorusGeometry(r, 0.025, 5, 18), '#3a3d40');
  for (let i = 0; i < 6; i++) b.box(0.018, r * 2, 0.018, '#5a5f66', [0, 0, 0], [0, 0, (i / 6) * Math.PI]);
  b.cyl(0.04, 0.04, 0.06, C.metalDark, [0, 0, 0], [Math.PI / 2, 0, 0], 8);
}

/** Vagonete de minério sobre rodas, comprimento ao longo de z. */
function oreCart(b: PartBuilder, z: number): void {
  b.box(0.36, 0.2, 0.42, '#5a5f66', [0, 0.2, z]);
  b.box(0.38, 0.03, 0.44, '#3a3d40', [0, 0.31, z]);
  b.box(0.3, 0.08, 0.36, '#8a4b32', [0, 0.33, z]);
  for (const s of [-1, 1]) for (const dz of [-0.13, 0.13]) b.cyl(0.055, 0.055, 0.03, BLACK, [s * 0.17, 0.08, z + dz], [0, 0, Math.PI / 2], 8);
}

export function buildMineModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#6b625a', [0, 0.03, 0]);
  // encosta rochosa (perfil trapezoidal) com afloramentos e topo gramado
  b.side(
    [
      [-1.6, 0],
      [1.6, 0],
      [0.9, 1.2],
      [-0.9, 1.2],
    ],
    1.6,
    '#8d867b',
    [0, 0.06, -1.1],
  );
  b.box(1.8, 0.05, 1.6, '#6c7a46', [0, 1.285, -1.1]);
  for (const [x, y, z, s] of [
    [-1.25, 0.35, -0.4, 0.28],
    [1.3, 0.3, -0.45, 0.24],
    [-1.15, 0.7, -0.45, 0.2],
    [1.05, 0.95, -1.7, 0.22],
    [-1.35, 0.5, -1.8, 0.3],
  ] as const)
    b.add(new THREE.IcosahedronGeometry(s, 0), '#7d776c', { pos: [x, y, z], scale: [1.3, 0.8, 1] });
  // portal de concreto com escoramento de madeira e boca escura
  b.box(1.25, 0.95, 0.16, C.concrete, [0, 0.53, -0.26]);
  b.box(0.82, 0.68, 0.18, '#141312', [0, 0.4, -0.25]);
  for (const s of [-1, 1]) b.box(0.1, 0.72, 0.1, C.woodDark, [s * 0.38, 0.42, -0.16]);
  b.box(0.9, 0.1, 0.12, C.woodDark, [0, 0.8, -0.16]);
  b.box(1.32, 0.08, 0.24, C.concreteDark, [0, 1.03, -0.24]);
  a.box(0.7, 0.12, 0.02, '#ffffff', [0, 0.92, -0.17]);
  for (const s of [-1, 1]) b.box(0.08, 0.06, 0.06, '#f2e6a0', [s * 0.48, 0.88, -0.15]); // luminárias
  // via férrea com dormentes
  for (const s of [-1, 1]) b.box(0.035, 0.04, 2.1, C.metal, [s * 0.17, 0.1, 0.78]);
  for (let z = -0.15; z < 1.8; z += 0.17) b.box(0.5, 0.03, 0.07, C.woodDark, [0, 0.075, z]);
  // castelete de içamento (estrutura em A) com casa do guincho e colar do poço
  const hx = 1.35;
  const hz = 0.95;
  b.box(0.5, 0.12, 0.5, C.concrete, [hx, 0.12, hz]);
  for (const s of [-1, 1]) {
    strut(b, [hx - 0.2, 0.12, hz + s * 0.2], [hx - 0.05, 2.0, hz + s * 0.08], 0.06, '#7a2b23');
    strut(b, [hx + 0.2, 0.12, hz + s * 0.2], [hx + 0.05, 2.0, hz + s * 0.08], 0.06, '#7a2b23');
    strut(b, [hx - 0.55, 0.12, hz + s * 0.18], [hx - 0.05, 1.85, hz + s * 0.08], 0.05, '#7a2b23'); // escoras traseiras
  }
  for (const y of [0.6, 1.1, 1.55]) {
    const k = (y - 0.12) / 1.88;
    const w = 0.2 - 0.12 * k;
    strut(b, [hx - w, y, hz - w], [hx - w, y, hz + w], 0.03, '#7a2b23');
    strut(b, [hx + w, y, hz - w], [hx + w, y, hz + w], 0.03, '#7a2b23');
  }
  b.box(0.22, 0.06, 0.3, '#4a2019', [hx, 2.02, hz]);
  // casa do guincho com cabos até as polias
  b.box(0.45, 0.4, 0.4, '#c3c6c4', [0.5, 0.26, 0.95]);
  b.gable(0.5, 0.45, 0.16, C.roof, [0.5, 0.46, 0.95], Math.PI / 2);
  g.box(0.02, 0.1, 0.22, '#ffffff', [0.725, 0.32, 0.95]);
  for (const s of [-1, 1]) strut(b, [0.72, 0.38, 0.95 + s * 0.06], [hx - 0.1, 2.1, hz + s * 0.06], 0.01, '#26282b', true);
  // pilha de minério
  b.cyl(0.0, 0.55, 0.48, '#7b4630', [-1.3, 0.3, 1.2], undefined, 8);
  b.add(new THREE.IcosahedronGeometry(0.14, 0), '#6b3c29', { pos: [-1.05, 0.15, 1.45] });

  const anims: ModelAnim[] = [];
  for (const s of [-1, 1]) {
    const w = layers();
    sheave(w.body, 0.17);
    anims.push({ layers: w.build(), pivot: [hx, 2.12, hz + s * 0.06], motion: { kind: 'spin', axis: 'z', speed: s * 1.6 } });
  }
  // dois vagonetes engatados saindo do túnel e voltando
  const cart = layers();
  oreCart(cart.body, 0);
  oreCart(cart.body, -0.5);
  cart.body.box(0.04, 0.04, 0.1, BLACK, [0, 0.15, -0.25]);
  anims.push({ layers: cart.build(), pivot: [0, 0.06, -0.55], motion: { kind: 'shuttle', dir: [0, 0, 1], length: 1.5, speed: 0.45 } });
  return { base: l.build(), moving: null, anims, height: 2.3 };
}

export type { ModelLayers };
