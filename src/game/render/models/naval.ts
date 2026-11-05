import * as THREE from 'three';
import { layers, type PartBuilder, type ModelLayers } from './kit.ts';

/**
 * Navios (03/11), low poly, frente para +x e origem na linha d'água (o casco afunda um pouco abaixo de y = 0). Cascos
 * em planta (polígono no plano x-z extrudado na vertical) com obras vivas vermelhas, faixa preta na linha d'água e
 * castelo de proa elevado; superestrutura em blocos facetados; detalhes que leem de perto (guarda-corpos, vigias,
 * botes, balsas, âncoras, radares, CIWS, VLS, helicóptero no convoo) sem pesar de longe. A cor da nação aparece em
 * faixas, número de costado, chaminé e bandeira. Referências de forma: navio de desembarque com doca alagável (L402),
 * fragatas de três gerações, submarinos, porta-aviões e cargueiro de contêineres; o desenho é próprio.
 */
type V3 = [number, number, number];
export interface ShipModel {
  hull: ModelLayers;
  turret: ModelLayers | null;
  turretPivot: V3;
  muzzle: V3;
}

const FLAT: V3 = [Math.PI / 2, 0, 0];
const RED = '#7a2b24';
const BOOT = '#1d1f22';
const WINDOW = '#ffffff';
const DARK = '#2b2d30';
const ORANGE = '#e0752a';

/** Planta do casco: popa reta em −L/2, costado reto e proa afilada (`bow` = fração do comprimento que afina). */
function plan(L: number, W: number, bow = 0.22, k = 1, sternRound = 0): [number, number][] {
  const x0 = (-L / 2) * k;
  const x1 = (L / 2 - L * bow) * k;
  const x2 = (L / 2) * k;
  const w = (W / 2) * k;
  const pts: [number, number][] = [];
  if (sternRound) pts.push([x0 + sternRound, -w], [x1, -w]);
  else pts.push([x0, -w * 0.92], [x1, -w]);
  pts.push([x2 - L * bow * 0.35 * k, -w * 0.45], [x2, 0], [x2 - L * bow * 0.35 * k, w * 0.45], [x1, w]);
  if (sternRound) pts.push([x0 + sternRound, w], [x0, w * 0.6], [x0, -w * 0.6]);
  else pts.push([x0, w * 0.92]);
  return pts;
}

interface Hull {
  L: number;
  W: number;
  /** Altura do convés principal. */
  deck: number;
  bow: number;
}

/**
 * Casco: obras vivas vermelhas, faixa preta na linha d'água, costado, convés e castelo de proa um pouco mais alto
 * (dá o tosamento da proa). Devolve as medidas para os detalhes.
 */
function hull(b: PartBuilder, L: number, W: number, H: number, color: string, deckColor: string, bow = 0.22, sternRound = 0, forecastle = 0.12): Hull {
  b.side(plan(L, W, bow, 0.97, sternRound), 0.22, RED, [0, -0.09, 0], FLAT);
  b.side(plan(L, W, bow, 1.004, sternRound), 0.06, BOOT, [0, 0.03, 0], FLAT);
  b.side(plan(L, W, bow, 1, sternRound), H, color, [0, H / 2 + 0.02, 0], FLAT);
  b.side(plan(L, W, bow, 0.95, sternRound), 0.03, deckColor, [0, H + 0.035, 0], FLAT);
  if (forecastle > 0) {
    // castelo de proa: a parte da frente do convés sobe um degrau
    const fx = L / 2 - L * bow - L * 0.12;
    const front = plan(L, W, bow, 1, sternRound).filter(([x]) => x >= fx);
    const pts: [number, number][] = [[fx, -W / 2], ...front, [fx, W / 2]];
    b.side(pts, forecastle, color, [0, H + forecastle / 2 + 0.02, 0], FLAT);
    b.side(
      pts.map(([x, z]) => [x * 0.995, z * 0.95]),
      0.02,
      deckColor,
      [0, H + forecastle + 0.03, 0],
      FLAT,
    );
  }
  return { L, W, deck: H + 0.05, bow };
}

/** Bloco de superestrutura com laterais inclinadas (furtivo): perfil trapezoidal no plano x-y, largura em z. */
function block(b: PartBuilder, x0: number, x1: number, y0: number, h: number, w: number, color: string, slope = 0.12, z = 0): void {
  b.side(
    [
      [x0, y0],
      [x1, y0],
      [x1 - slope, y0 + h],
      [x0 + slope, y0 + h],
    ],
    w,
    color,
    [0, 0, z],
  );
}

/** Guarda-corpo ao longo de x, de x0 a x1, na borda z: corrimão e balaústres. */
function rail(b: PartBuilder, x0: number, x1: number, y: number, z: number, color = '#c9cdd0', h = 0.08): void {
  const len = x1 - x0;
  b.box(len, 0.01, 0.01, color, [(x0 + x1) / 2, y + h, z]);
  const n = Math.max(2, Math.round(len / 0.28));
  for (let i = 0; i <= n; i++) b.box(0.01, h, 0.01, color, [x0 + (len * i) / n, y + h / 2, z]);
}

/** Guarda-corpo dos dois bordos do convés principal (sem a proa afilada). */
function deckRails(b: PartBuilder, h: Hull, x0: number, x1: number, color?: string): void {
  for (const z of [-h.W / 2 + 0.03, h.W / 2 - 0.03]) rail(b, x0, x1, h.deck, z, color);
}

/** Fileira de vigias no costado (os dois bordos). */
function portholes(g: PartBuilder, x0: number, x1: number, y: number, W: number, n: number): void {
  for (let i = 0; i < n; i++) for (const z of [-W / 2 - 0.004, W / 2 + 0.004]) g.box(0.05, 0.035, 0.008, WINDOW, [x0 + ((x1 - x0) * (i + 0.5)) / n, y, z]);
}

/** Janelas da ponte: faixa de vidro inclinada na frente e nas laterais de um bloco. */
function bridgeWindows(g: PartBuilder, x: number, y: number, w: number, depth: number): void {
  g.box(0.025, 0.07, w * 0.86, WINDOW, [x, y, 0], [0, 0, -0.3]);
  for (const z of [-w / 2 - 0.004, w / 2 + 0.004]) g.box(depth, 0.06, 0.008, WINDOW, [x - depth / 2 - 0.02, y, z]);
}

/** Bote salva-vidas (casco laranja e toldo branco) no turco. */
function lifeboat(b: PartBuilder, x: number, y: number, z: number): void {
  b.box(0.36, 0.08, 0.13, ORANGE, [x, y, z]);
  b.box(0.3, 0.06, 0.11, '#efeee8', [x, y + 0.07, z]);
  for (const dx of [-0.13, 0.13]) b.box(0.02, 0.18, 0.02, '#8d9196', [x + dx, y + 0.05, z + Math.sign(z) * 0.07]);
}

/** Balsas salva-vidas em cilindros brancos, em fileira ao longo de x. */
function rafts(b: PartBuilder, x: number, y: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) b.cyl(0.035, 0.035, 0.1, '#efeee8', [x + i * 0.08, y, z], [Math.PI / 2, 0, 0], 6);
}

/** CIWS: pedestal, cúpula branca do radar e o feixe de canos. */
function ciws(b: PartBuilder, x: number, y: number, z: number): void {
  b.cyl(0.07, 0.08, 0.06, '#b4b9bd', [x, y + 0.03, z], undefined, 8);
  b.cyl(0.055, 0.06, 0.1, '#e9ecee', [x, y + 0.11, z], undefined, 8);
  b.sphere(0.055, '#e9ecee', [x, y + 0.16, z], [1, 0.9, 1], 6);
  b.cyl(0.015, 0.015, 0.16, DARK, [x + 0.1, y + 0.08, z], [0, 0, -Math.PI / 2], 5);
}

/** Lançador vertical (VLS): placa com a grade de tampas. */
function vls(b: PartBuilder, x: number, y: number, rows: number, cols: number, color = '#3e444b'): void {
  b.box(rows * 0.085 + 0.04, 0.03, cols * 0.085 + 0.04, color, [x, y + 0.015, 0]);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) b.box(0.07, 0.012, 0.07, '#2a2e33', [x + (i - (rows - 1) / 2) * 0.085, y + 0.036, (j - (cols - 1) / 2) * 0.085]);
}

/** Lançadores antinavio em caixotes inclinados (dois pares, um em cada bordo). */
function harpoons(b: PartBuilder, x: number, y: number): void {
  for (const z of [-0.12, 0.12]) for (const k of [0, 1]) b.box(0.32, 0.06, 0.06, '#7e868c', [x, y + 0.07 + k * 0.065, z], [0, 0, 0.25 * Math.sign(z)]);
  b.box(0.36, 0.04, 0.34, '#5d646a', [x, y + 0.02, 0]);
}

/** Radar de busca: barra giratória sobre um mastro curto. */
function radarBar(b: PartBuilder, x: number, y: number, len = 0.36): void {
  b.cyl(0.02, 0.025, 0.08, DARK, [x, y + 0.04, 0], undefined, 5);
  b.box(0.05, 0.07, len, '#3a3f45', [x, y + 0.11, 0]);
}

/** Antenas finas (chicotes) num ponto. */
function whips(b: PartBuilder, x: number, y: number, z: number, h: number): void {
  b.cyl(0.006, 0.006, h, DARK, [x, y + h / 2, z], undefined, 3);
}

/** Mastro com bandeira da nação no topo. */
function mast(b: PartBuilder, a: PartBuilder, x: number, y: number, h: number, color = DARK): void {
  b.cyl(0.022, 0.03, h, color, [x, y + h / 2, 0], undefined, 5);
  a.box(0.2, 0.12, 0.012, '#ffffff', [x - 0.11, y + h - 0.08, 0]);
}

/** Âncoras nos dois bordos da proa. */
function anchors(b: PartBuilder, x: number, y: number, W: number): void {
  for (const z of [-W * 0.42, W * 0.42]) {
    b.box(0.08, 0.1, 0.012, DARK, [x, y, z * 1.02]);
    b.box(0.1, 0.02, 0.014, DARK, [x, y - 0.05, z * 1.02]);
  }
}

/** Número de costado: placa na cor da nação nos dois bordos. */
function hullNumber(a: PartBuilder, x: number, y: number, W: number): void {
  for (const z of [-W / 2 - 0.006, W / 2 + 0.006]) a.box(0.36, 0.13, 0.008, '#ffffff', [x, y, z]);
}

/** Convoo: placa escura, círculo e linhas de pouso brancas. */
function helideck(b: PartBuilder, x: number, y: number, len: number, w: number): void {
  b.box(len, 0.012, w, '#3f454c', [x, y, 0]);
  b.add(new THREE.RingGeometry(w * 0.26, w * 0.3, 16), '#e8e8e2', { pos: [x, y + 0.008, 0], rot: [-Math.PI / 2, 0, 0] });
  b.box(len * 0.9, 0.006, 0.02, '#e8e8e2', [x, y + 0.009, 0]);
  for (const z of [-w / 2 + 0.02, w / 2 - 0.02]) b.box(len, 0.006, 0.015, '#e7c23a', [x, y + 0.009, z]);
}

/** Helicóptero naval estacionado (pás dobradas). */
function helicopter(b: PartBuilder, g: PartBuilder, x: number, y: number): void {
  b.box(0.36, 0.12, 0.13, '#5f6870', [x, y + 0.08, 0]);
  g.box(0.08, 0.06, 0.11, WINDOW, [x + 0.17, y + 0.1, 0]);
  b.box(0.36, 0.04, 0.04, '#5f6870', [x - 0.33, y + 0.11, 0]);
  b.box(0.05, 0.1, 0.012, '#5f6870', [x - 0.5, y + 0.15, 0]);
  for (const r of [0.2, -0.2, 0.6]) b.box(0.42, 0.008, 0.025, DARK, [x - 0.12, y + 0.17, 0], [0, r, 0]);
  for (const z of [-0.06, 0.06]) b.box(0.02, 0.03, 0.02, DARK, [x, y + 0.015, z]);
}

/** Canhão naval (torre que gira): base, casa da arma e cano. Para a torre da fragata. */
function navalGun(t: PartBuilder, color: string, stealth: boolean, twin = false): void {
  if (stealth) {
    t.cyl(0.17, 0.19, 0.05, color, [0, 0.025, 0], undefined, 10);
    t.side(
      [
        [-0.2, 0.05],
        [0.18, 0.05],
        [0.12, 0.2],
        [-0.17, 0.2],
      ],
      0.3,
      color,
    );
    t.box(0.06, 0.04, 0.12, '#7d868c', [0.15, 0.13, 0]);
  } else {
    t.cyl(0.18, 0.2, 0.1, color, [0, 0.05, 0], undefined, 10);
    t.box(0.34, 0.16, 0.28, color, [0, 0.16, 0]);
    t.box(0.12, 0.05, 0.3, color, [-0.12, 0.26, 0]);
  }
  for (const z of twin ? [-0.06, 0.06] : [0]) {
    t.cyl(0.024, 0.03, 0.5, '#2f3236', [0.38, 0.12, z], [0, 0, -Math.PI / 2], 6);
    t.cyl(0.03, 0.03, 0.06, '#2f3236', [0.62, 0.12, z], [0, 0, -Math.PI / 2], 6);
  }
}

// ------------------------------------------------------------------ L402

/**
 * Navio de desembarque com doca alagável: casco alto e escuro, superestrutura grande a meia-nau com laterais
 * inclinadas, torre do mastro com radar, pórtico de guindaste e lanchas de desembarque, convoo à popa com helicóptero e
 * a porta da doca na popa.
 */
export function buildL402(): ShipModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const H = hull(b, 4.8, 1.32, 0.62, '#43484e', '#33373c', 0.2, 0, 0.1);
  const d = H.deck;
  hullNumber(a, 1.25, 0.34, H.W);
  for (const z of [-0.665, 0.665]) a.box(3.4, 0.05, 0.008, '#ffffff', [-0.35, d - 0.12, z]);
  portholes(g, -1.8, 0.9, 0.42, H.W, 14);
  anchors(b, 1.95, 0.42, H.W);
  // superestrutura: dois andares de laterais inclinadas, ponte com asas, telhado com balsas e guarda-corpos
  block(b, -0.55, 1.25, d, 0.5, 1.18, '#4d535a', 0.16);
  block(b, -0.25, 1.0, d + 0.5, 0.32, 1.0, '#555b62', 0.1);
  bridgeWindows(g, 0.96, d + 0.68, 0.98, 0.5);
  b.box(0.3, 0.03, 1.36, '#3d4248', [0.78, d + 0.62, 0]);
  for (const z of [-0.5, 0.5]) rail(b, -0.15, 0.95, d + 0.82, z);
  rafts(b, -0.4, d + 0.56, 0.55, 4);
  rafts(b, -0.4, d + 0.56, -0.55, 4);
  for (const z of [-0.6, 0.6]) b.box(0.6, 0.1, 0.012, '#2e4a40', [0.4, d + 0.25, z]);
  // torre do mastro: radar esférico, barra de busca, antenas e as duas bandeiras
  block(b, 0.15, 0.55, d + 0.82, 0.3, 0.42, '#555b62', 0.07);
  b.cyl(0.03, 0.04, 0.35, DARK, [0.35, d + 1.29, 0], undefined, 5);
  b.sphere(0.09, '#e3e6e8', [0.35, d + 1.5, 0], undefined, 8);
  radarBar(b, 0.35, d + 1.12, 0.42);
  for (const z of [-0.15, 0.15]) whips(b, 0.2, d + 1.12, z, 0.35);
  mast(b, a, -0.45, d + 0.82, 0.55);
  mast(b, a, 0.85, d + 0.82, 0.45);
  ciws(b, 1.18, d + 0.5, 0);
  // pórtico do guindaste e lanchas de desembarque (com rampa) a meia-nau
  for (const z of [-0.5, 0.5]) b.box(0.06, 0.55, 0.06, '#2e4a40', [-0.8, d + 0.275, z]);
  b.box(0.08, 0.06, 1.1, '#2e4a40', [-0.8, d + 0.56, 0]);
  b.box(0.7, 0.05, 0.06, '#2e4a40', [-0.6, d + 0.56, 0.5]);
  for (const z of [-0.33, 0.33]) {
    b.box(0.5, 0.12, 0.26, '#556048', [-1.05, d + 0.06, z]);
    b.box(0.05, 0.12, 0.24, '#4a543e', [-0.78, d + 0.08, z], [0, 0, 0.35]);
  }
  // convoo à popa com helicóptero, porta da doca alagável e guarda-corpos
  helideck(b, -1.85, d + 0.01, 1.0, 1.1);
  helicopter(b, g, -1.85, d + 0.02);
  b.box(0.02, 0.42, 0.62, '#2e4a40', [-2.405, 0.3, 0]);
  b.box(0.025, 0.05, 0.7, DARK, [-2.405, 0.53, 0]);
  deckRails(b, H, -2.3, 1.3);
  // proa: canhão leve e escotilha
  b.cyl(0.08, 0.1, 0.12, '#4d535a', [1.62, d + 0.16, 0], undefined, 8);
  b.box(0.3, 0.03, 0.03, DARK, [1.78, d + 0.22, 0]);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [1.95, d + 0.22, 0] };
}

// ------------------------------------------------------------------ fragatas

/**
 * Fragata da Guerra Fria: casco claro com castelo de proa, superestrutura em degraus, chaminé com faixa da nação,
 * mastro treliçado com vergas e radares, torre dupla na proa, lançador antissubmarino, lançador antiaéreo de braço
 * duplo à ré, botes e guarda-corpos.
 */
export function buildFrigateEra1(): ShipModel {
  const l = layers();
  const t = layers();
  const { body: b, accent: a, glass: g } = l;
  const hullC = '#8e969b';
  const H = hull(b, 4.6, 1.0, 0.42, hullC, '#6c6f66', 0.26, 0, 0.1);
  const d = H.deck;
  hullNumber(a, 1.05, 0.25, H.W);
  portholes(g, -1.4, 0.6, 0.3, H.W, 10);
  anchors(b, 1.75, 0.32, H.W);
  // superestrutura em degraus com ponte e asas
  b.box(1.4, 0.32, 0.72, '#9aa2a7', [-0.1, d + 0.16, 0]);
  b.box(0.7, 0.28, 0.6, '#a3abb0', [0.25, d + 0.46, 0]);
  bridgeWindows(g, 0.6, d + 0.52, 0.6, 0.4);
  b.box(0.2, 0.025, 0.86, '#878f94', [0.5, d + 0.6, 0]);
  rail(b, -0.1, 0.6, d + 0.6, 0.3);
  rail(b, -0.1, 0.6, d + 0.6, -0.3);
  // chaminé com faixa da nação e tampa
  b.side(
    [
      [-0.65, 0],
      [-0.25, 0],
      [-0.3, 0.45],
      [-0.6, 0.45],
    ],
    0.34,
    '#8a9297',
    [0, d + 0.32, 0],
  );
  a.box(0.34, 0.08, 0.35, '#ffffff', [-0.45, d + 0.66, 0]);
  b.box(0.32, 0.04, 0.3, DARK, [-0.45, d + 0.79, 0]);
  // mastro treliçado com vergas, radares e antenas
  for (const z of [-0.08, 0.08]) b.box(0.025, 0.7, 0.025, '#3c4046', [0.15, d + 0.95, z], [z * 2, 0, 0]);
  b.box(0.04, 0.03, 0.5, '#3c4046', [0.15, d + 1.15, 0]);
  radarBar(b, 0.15, d + 1.28, 0.4);
  b.box(0.12, 0.12, 0.12, '#d9dde0', [0.15, d + 0.92, 0]);
  whips(b, 0.15, d + 1.4, 0, 0.3);
  mast(b, a, -1.75, d, 0.6);
  // lançador antissubmarino à frente da ponte e lançador antiaéreo de braço duplo à ré
  b.box(0.22, 0.1, 0.24, '#7d858a', [0.95, d + 0.07, 0]);
  for (const z of [-0.06, 0.06]) b.box(0.2, 0.04, 0.04, '#5e666b', [1.0, d + 0.15, z], [0, 0, 0.3]);
  b.cyl(0.1, 0.12, 0.12, hullC, [-1.25, d + 0.06, 0], undefined, 8);
  for (const z of [-0.07, 0.07]) b.box(0.3, 0.04, 0.04, '#d9dde0', [-1.2, d + 0.16, z], [0, 0, 0.2]);
  // botes, balsas, cargas de profundidade na popa e guarda-corpos
  lifeboat(b, -0.35, d + 0.38, 0.42);
  lifeboat(b, -0.35, d + 0.38, -0.42);
  rafts(b, 0.0, d + 0.36, 0.38, 3);
  for (const z of [-0.3, 0.3]) for (let i = 0; i < 3; i++) b.cyl(0.03, 0.03, 0.05, DARK, [-2.0 + i * 0.07, d + 0.03, z], undefined, 6);
  deckRails(b, H, -2.25, 1.2);
  navalGun(t.body, '#9aa2a7', false, true);
  return { hull: l.build(), turret: t.build(), turretPivot: [1.35, d + 0.1, 0], muzzle: [0.65, 0.12, 0] };
}

/**
 * Fragata moderna (eras 2 e 3): superestrutura de laterais inclinadas, mastro fechado com radares planos, VLS e
 * canhão furtivo na proa, CIWS, lançadores antinavio a meia-nau, hangar com helicóptero no convoo e botes infláveis.
 */
export function buildFrigateEra2(): ShipModel {
  const l = layers();
  const t = layers();
  const { body: b, accent: a, glass: g } = l;
  const hullC = '#b6bdc2';
  const H = hull(b, 4.8, 1.05, 0.48, hullC, '#5a6168', 0.25, 0, 0.1);
  const d = H.deck;
  hullNumber(a, 1.15, 0.3, H.W);
  anchors(b, 1.85, 0.36, H.W);
  // ponte e hangar, laterais inclinadas
  block(b, -0.25, 0.85, d, 0.42, 0.86, '#c4cbcf', 0.12);
  block(b, 0.05, 0.62, d + 0.42, 0.24, 0.66, '#cdd3d6', 0.08);
  bridgeWindows(g, 0.58, d + 0.55, 0.62, 0.4);
  block(b, -1.32, -0.25, d, 0.36, 0.9, '#c4cbcf', 0.1);
  b.box(0.02, 0.28, 0.6, '#9aa2a7', [-1.33, d + 0.15, 0]);
  // mastro fechado com radares planos, antenas e bandeira
  block(b, 0.18, 0.48, d + 0.66, 0.42, 0.32, '#3d434a', 0.06);
  for (const z of [-0.165, 0.165]) b.box(0.18, 0.16, 0.01, '#5d646a', [0.33, d + 0.86, z]);
  radarBar(b, 0.33, d + 1.08, 0.36);
  for (const z of [-0.1, 0.1]) whips(b, 0.25, d + 1.08, z, 0.28);
  mast(b, a, 0.33, d + 1.2, 0.22);
  // chaminé baixa com faixa da nação e radar de ré
  block(b, -0.8, -0.42, d + 0.36, 0.22, 0.42, '#b0b7bc', 0.05);
  a.box(0.3, 0.05, 0.43, '#ffffff', [-0.61, d + 0.5, 0]);
  b.sphere(0.07, '#e3e6e8', [-0.95, d + 0.48, 0], undefined, 8);
  // VLS na proa, CIWS sobre o hangar, antinavio a meia-nau, botes infláveis
  vls(b, 1.15, d + 0.1, 3, 4, '#4a5056');
  ciws(b, -1.0, d + 0.36, 0);
  harpoons(b, -0.1, d);
  for (const z of [-0.47, 0.47]) b.box(0.3, 0.07, 0.11, '#2f3236', [-0.55, d + 0.24, z]);
  rafts(b, 0.1, d + 0.04, 0.4, 3);
  rafts(b, 0.1, d + 0.04, -0.4, 3);
  // convoo com helicóptero
  helideck(b, -1.85, d + 0.01, 0.75, 0.88);
  helicopter(b, g, -1.85, d + 0.02);
  deckRails(b, H, -2.3, 1.3);
  navalGun(t.body, '#c4cbcf', true);
  return { hull: l.build(), turret: t.build(), turretPivot: [1.65, d + 0.1, 0], muzzle: [0.65, 0.12, 0] };
}

/**
 * Fragata do Futuro Próximo: superestrutura em pirâmide de faces lisas, torre alta com o radar esférico no topo,
 * segunda torre com radar de busca, VLS duplo, canhão furtivo, CIWS, antinavio, convoo com helicóptero e sponsons.
 */
export function buildFrigateEra4(): ShipModel {
  const l = layers();
  const t = layers();
  const { body: b, accent: a, glass: g } = l;
  const hullC = '#a9b6c0';
  const H = hull(b, 4.9, 1.1, 0.5, hullC, '#4b525a', 0.26, 0, 0.1);
  const d = H.deck;
  hullNumber(a, 1.2, 0.31, H.W);
  anchors(b, 1.9, 0.38, H.W);
  block(b, -1.25, 0.95, d, 0.45, 0.98, '#b9c5ce', 0.22);
  block(b, -0.1, 0.75, d + 0.45, 0.32, 0.78, '#c2ced6', 0.15);
  bridgeWindows(g, 0.6, d + 0.62, 0.58, 0.36);
  // torre do radar: pirâmide alta com a esfera no topo e antenas
  block(b, 0.1, 0.5, d + 0.77, 0.55, 0.42, '#b9c5ce', 0.12);
  b.cyl(0.03, 0.04, 0.25, DARK, [0.3, d + 1.44, 0], undefined, 5);
  b.sphere(0.16, '#e4e9ec', [0.3, d + 1.62, 0], undefined, 10);
  for (const z of [-0.12, 0.12]) whips(b, 0.18, d + 1.32, z, 0.3);
  mast(b, a, -0.55, d + 0.45, 0.6);
  // segunda torre (radar de busca), chaminé com faixa da nação
  block(b, -0.85, -0.4, d + 0.45, 0.3, 0.6, '#b9c5ce', 0.1);
  radarBar(b, -0.62, d + 0.75, 0.42);
  a.box(0.3, 0.05, 0.61, '#ffffff', [-0.62, d + 0.6, 0]);
  // VLS duplo, CIWS, antinavio, sponsons com botes
  vls(b, 1.3, d + 0.1, 4, 4, '#3e444b');
  vls(b, -0.05, d + 0.45, 2, 3, '#3e444b');
  ciws(b, -1.1, d + 0.45, 0);
  ciws(b, 0.82, d + 0.45, 0);
  harpoons(b, -1.15, d);
  for (const z of [-0.53, 0.53]) {
    b.box(0.5, 0.05, 0.08, '#9eabb5', [-0.45, d + 0.18, z]);
    b.box(0.3, 0.07, 0.1, '#2f3236', [-0.45, d + 0.24, z]);
  }
  helideck(b, -1.9, d + 0.01, 0.8, 0.92);
  helicopter(b, g, -1.9, d + 0.02);
  deckRails(b, H, -2.35, 1.3);
  navalGun(t.body, '#b9c5ce', true);
  return { hull: l.build(), turret: t.build(), turretPivot: [1.78, d + 0.1, 0], muzzle: [0.65, 0.12, 0] };
}

// ------------------------------------------------------------------ submarinos

/**
 * Submarino na superfície: charuto escuro meio submerso com a faixa do convés, vela com lemes horizontais e mastros
 * (periscópio, radar, antenas), aberturas de alagamento no costado, leme em cruz e hélice de sete pás. O lançador tem
 * a corcova dos tubos de mísseis com as tampas atrás da vela.
 */
function submarine(missile: boolean): ShipModel {
  const l = layers();
  const { body: b, accent: a } = l;
  const L = missile ? 4.6 : 3.8;
  const r = missile ? 0.36 : 0.3;
  const dark = '#24272a';
  const deckC = '#2f3337';
  // casco: cilindro deitado com as pontas arredondadas; a faixa de cima mais clara é o convés
  b.cyl(r, r, L - 2 * r, dark, [0, 0.02, 0], [0, 0, Math.PI / 2], 14);
  b.sphere(r, dark, [L / 2 - r, 0.02, 0], [1.35, 1, 1], 12);
  b.sphere(r, dark, [-L / 2 + r, 0.02, 0], [1.7, 1, 1], 12);
  b.box(L - 2 * r, 0.03, r * 0.5, deckC, [0, r - 0.002, 0]);
  // aberturas de alagamento e cabeços no convés
  for (let i = 0; i < 10; i++) for (const z of [-r * 0.97, r * 0.97]) b.box(0.07, 0.025, 0.01, '#141618', [-L / 2 + r + 0.3 + i * ((L - 2 * r - 0.6) / 9), -0.02, z]);
  for (const x of [L / 2 - r - 0.2, -L / 2 + r + 0.25]) b.box(0.04, 0.04, 0.04, '#3a3e42', [x, r + 0.04, 0]);
  // vela com lemes horizontais, mastros e a faixa da nação
  const sx = missile ? 1.0 : 0.6;
  b.side(
    [
      [sx - 0.35, 0],
      [sx + 0.3, 0],
      [sx + 0.24, 0.5],
      [sx - 0.22, 0.52],
    ],
    0.2,
    dark,
    [0, r - 0.04, 0],
  );
  b.box(0.18, 0.025, 0.64, dark, [sx + 0.05, r + 0.3, 0]);
  for (const [dx, h] of [
    [0.05, 0.32],
    [-0.05, 0.24],
    [-0.13, 0.18],
  ] as const)
    b.cyl(0.016, 0.016, h, '#3c4046', [sx + dx, r + 0.48 + h / 2, 0], undefined, 4);
  b.box(0.06, 0.04, 0.03, '#3c4046', [sx + 0.05, r + 0.8, 0]);
  a.box(0.1, 0.06, 0.012, '#ffffff', [sx - 0.13, r + 0.7, 0]);
  for (const z of [-0.105, 0.105]) a.box(0.32, 0.08, 0.012, '#ffffff', [sx - 0.02, r + 0.25, z]);
  // popa: leme em cruz, lemes horizontais e hélice de sete pás
  const px = -L / 2 + 0.02;
  b.box(0.3, 0.55, 0.03, dark, [px, 0.08, 0]);
  b.box(0.3, 0.03, 0.62, dark, [px, 0.02, 0]);
  for (let i = 0; i < 7; i++) b.box(0.03, 0.15, 0.05, '#a8792f', [px - 0.16, 0.02, 0], [(i / 7) * Math.PI * 2, 0, 0]);
  b.cyl(0.04, 0.05, 0.08, '#a8792f', [px - 0.16, 0.02, 0], [0, 0, Math.PI / 2], 6);
  // lemes de proa: a raiz entra no casco (nada de peça solta ao lado dele)
  for (const z of [-r - 0.04, r + 0.04]) b.box(0.2, 0.025, 0.2, dark, [L / 2 - r - 0.25, 0.06, z]);
  if (missile) {
    // corcova dos tubos de mísseis atrás da vela, com as tampas e as dobradiças
    // a base desce até dentro do casco: as bordas da corcova não ficam soltas sobre a curva do cilindro
    b.side(
      [
        [-1.1, 0],
        [0.7, 0],
        [0.6, 0.23],
        [-1.0, 0.23],
      ],
      r * 1.25,
      dark,
      [0, r - 0.13, 0],
    );
    for (let i = 0; i < 6; i++)
      for (const z of [-0.11, 0.11]) {
        b.box(0.14, 0.012, 0.14, '#3a3e42', [-0.85 + i * 0.27, r + 0.105, z]);
        b.box(0.02, 0.02, 0.1, '#55595e', [-0.92 + i * 0.27, r + 0.11, z]);
      }
  }
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [L / 2, 0.05, 0] };
}

export const buildSubmarine = (): ShipModel => submarine(false);
export const buildMissileSubmarine = (): ShipModel => submarine(true);

// ------------------------------------------------------------------ porta-aviões

/** Caça estacionado no convés: fuselagem, asa em delta, empenagens duplas e capota de vidro. */
function deckJet(b: PartBuilder, g: PartBuilder, x: number, z: number, y: number, rot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (dx: number, dz: number, dy = 0): V3 => [x + dx * c - dz * s, y + dy, z + dx * s + dz * c];
  const yaw: V3 = [0, -rot, 0];
  b.box(0.46, 0.06, 0.07, '#7b8389', at(0, 0, 0.03), yaw);
  b.box(0.1, 0.04, 0.05, '#7b8389', at(0.27, 0, 0.03), yaw);
  g.box(0.1, 0.035, 0.05, WINDOW, at(0.13, 0, 0.07), yaw);
  b.side(
    [
      [0.08, 0],
      [-0.14, 0.2],
      [-0.2, 0.2],
      [-0.16, 0],
      [-0.2, -0.2],
      [-0.14, -0.2],
    ],
    0.015,
    '#6d747a',
    at(0, 0, 0.03),
    [Math.PI / 2, 0, rot],
  );
  for (const dz of [-0.04, 0.04]) b.box(0.08, 0.1, 0.01, '#5d646a', at(-0.19, dz, 0.08), [0.25 * Math.sign(dz), -rot, 0]);
  for (const dz of [-0.07, 0.07]) b.box(0.06, 0.012, 0.08, '#5d646a', at(-0.2, dz * 1.6, 0.04), yaw);
}

/**
 * Porta-aviões: casco largo com abas, convés corrido com pista angulada, faixas e catapultas, elevadores, ilha a
 * boreste em três níveis (janelas, radares planos, mastro com antenas e bandeira, chaminé), sponsons com CIWS, redes
 * de segurança, seis caças, um helicóptero e tratores de convés.
 */
export function buildCarrier(): ShipModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const H = hull(b, 7.2, 1.7, 0.6, '#6f777e', '#3f454b', 0.16, 0, 0);
  const d = H.deck;
  hullNumber(a, 2.4, 0.38, H.W);
  portholes(g, -3.0, 2.0, 0.42, H.W, 20);
  anchors(b, 3.05, 0.42, H.W);
  // abas sob o convés de voo (o convés é bem mais largo que o casco)
  for (const z of [-0.95, 0.85]) b.box(5.6, 0.12, 0.3, '#646c73', [-0.3, d + 0.0, z]);
  // convés de voo com pista angulada a bombordo
  b.side(
    [
      [-3.55, -1.05],
      [-0.4, -1.25],
      [2.4, -0.85],
      [3.5, -0.4],
      [3.5, 0.75],
      [-3.55, 0.95],
    ],
    0.08,
    '#454b52',
    [0, d + 0.06, 0],
    FLAT,
  );
  const top = d + 0.105;
  // marcas: linha central, pista angulada com faixas, catapultas, número do navio
  b.box(6.5, 0.01, 0.035, '#e8e8e2', [-0.1, top, 0.15]);
  b.box(4.6, 0.01, 0.035, '#e8e8e2', [-1.0, top, -0.55], [0, 0.13, 0]);
  b.box(4.6, 0.01, 0.025, '#e7c23a', [-1.0, top, -0.35], [0, 0.13, 0]);
  b.box(4.6, 0.01, 0.025, '#e7c23a', [-1.0, top, -0.78], [0, 0.13, 0]);
  for (let i = 0; i < 8; i++) b.box(0.22, 0.012, 0.035, '#e8e8e2', [-3.1 + i * 0.4, top, -0.55 + i * 0.05]);
  for (const z of [-0.1, 0.35]) {
    b.box(1.5, 0.011, 0.025, '#22262a', [2.65, top, z]);
    b.box(0.08, 0.04, 0.12, '#55595e', [1.9, top + 0.02, z]);
  }
  a.box(0.5, 0.012, 0.32, '#ffffff', [3.05, top + 0.002, 0.2]);
  // elevadores (recortes) e redes de segurança nas bordas
  for (const [x, z] of [
    [1.0, -1.0],
    [-1.2, 0.95],
    [0.4, 0.95],
  ] as const)
    b.box(0.55, 0.012, 0.35, '#363b41', [x, top - 0.001, z]);
  for (const z of [-1.0, 0.92]) b.box(6.4, 0.02, 0.06, '#2a2e32', [-0.2, top - 0.03, z * 1.06]);
  // ilha a boreste: três níveis, janelas, radares planos, chaminé, mastro com antenas e bandeira
  const iz = 0.62;
  block(b, -0.6, 0.4, top, 0.5, 0.36, '#6f777e', 0.05, iz);
  block(b, -0.5, 0.3, top + 0.5, 0.28, 0.32, '#767e85', 0.05, iz);
  block(b, -0.35, 0.18, top + 0.78, 0.18, 0.3, '#7d858c', 0.04, iz);
  for (const y of [0.2, 0.36]) for (const z of [iz - 0.185, iz + 0.185]) g.box(0.8, 0.035, 0.008, WINDOW, [-0.1, top + y, z]);
  g.box(0.025, 0.06, 0.28, WINDOW, [0.23, top + 0.88, iz]);
  g.box(0.025, 0.05, 0.3, WINDOW, [0.33, top + 0.62, iz]);
  for (const z of [iz - 0.165, iz + 0.165]) b.box(0.16, 0.16, 0.012, '#5a6168', [0.05, top + 0.64, z]);
  b.box(0.16, 0.16, 0.012, '#5a6168', [0.05, top + 0.64, iz], [0, Math.PI / 2, 0]);
  b.box(0.22, 0.25, 0.24, '#5a6168', [-0.48, top + 0.88, iz]);
  a.box(0.23, 0.06, 0.25, '#ffffff', [-0.48, top + 0.96, iz]);
  b.cyl(0.03, 0.04, 0.45, DARK, [-0.1, top + 1.18, iz], undefined, 5);
  b.box(0.05, 0.08, 0.32, '#3a3f45', [-0.1, top + 1.25, iz]);
  b.sphere(0.06, '#e3e6e8', [-0.1, top + 1.43, iz], undefined, 8);
  for (const dz of [-0.1, 0.1]) whips(b, -0.2, top + 1.0, iz + dz, 0.35);
  a.box(0.2, 0.12, 0.012, '#ffffff', [-0.21, top + 1.36, iz]);
  a.box(0.9, 0.06, 0.37, '#ffffff', [-0.1, top + 0.47, iz]);
  // sponsons com CIWS nos cantos
  for (const [x, z] of [
    [3.0, 0.8],
    [-3.3, -0.9],
    [-3.3, 0.85],
  ] as const) {
    b.box(0.3, 0.05, 0.25, '#646c73', [x, d - 0.05, z]);
    ciws(b, x, d - 0.02, z);
  }
  // caças estacionados, helicóptero e tratores
  deckJet(b, g, 2.6, 0.45, top, Math.PI * 0.85);
  deckJet(b, g, 2.0, 0.5, top, Math.PI * 0.85);
  deckJet(b, g, 1.4, 0.55, top, Math.PI * 0.85);
  deckJet(b, g, -2.6, 0.55, top, Math.PI * 1.15);
  deckJet(b, g, -2.0, 0.6, top, Math.PI * 1.15);
  deckJet(b, g, -1.35, 0.62, top, Math.PI * 1.15);
  helicopter(b, g, -0.9, top);
  for (const [x, z] of [
    [0.8, 0.5],
    [-2.3, 0.2],
  ] as const)
    b.box(0.1, 0.05, 0.07, '#e7c23a', [x, top + 0.025, z]);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [3.6, top, 0] };
}

// ------------------------------------------------------------------ cargueiro

const CONTAINERS = ['#c4562f', '#2f6d96', '#e0a43a', '#4f7a3c', '#9b3e3e', '#dad6cc', '#3b3f47'];

/**
 * Cargueiro: casco azul-escuro com bulbo de proa, castelo de proa e popa redonda; superestrutura branca em vários
 * andares com janelas e asas da ponte; chaminé com a cor da nação; contêineres em baias com tampas das escotilhas,
 * guindaste amarelo, mastro de proa, bote salva-vidas no turco e guarda-corpos.
 */
export function buildCargoShip(): ShipModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const H = hull(b, 4.6, 1.2, 0.5, '#23324a', '#8f8a80', 0.2, 0.25, 0.12);
  const d = H.deck;
  b.sphere(0.13, RED, [2.18, -0.1, 0], [1.6, 1, 1], 8);
  anchors(b, 1.8, 0.4, H.W);
  for (const z of [-0.605, 0.605]) a.box(3.4, 0.045, 0.008, '#ffffff', [-0.1, d - 0.1, z]);
  // superestrutura branca em andares, janelas, asas da ponte, chaminé na cor da nação
  b.box(0.72, 0.5, 1.0, '#e9e9e4', [-1.75, d + 0.25, 0]);
  b.box(0.6, 0.2, 0.9, '#efefea', [-1.72, d + 0.6, 0]);
  b.box(0.36, 0.035, 1.3, '#e9e9e4', [-1.55, d + 0.72, 0]);
  bridgeWindows(g, -1.41, d + 0.64, 0.88, 0.5);
  for (const y of [0.14, 0.28, 0.42]) for (const z of [-0.505, 0.505]) g.box(0.56, 0.04, 0.008, WINDOW, [-1.75, d + y, z]);
  for (const y of [0.14, 0.28, 0.42]) g.box(0.008, 0.04, 0.8, WINDOW, [-1.385, d + y, 0]);
  b.side(
    [
      [-2.2, 0],
      [-1.92, 0],
      [-1.95, 0.42],
      [-2.18, 0.42],
    ],
    0.3,
    '#e9e9e4',
    [0, d + 0.52, 0],
  );
  a.box(0.27, 0.12, 0.31, '#ffffff', [-2.06, d + 0.84, 0]);
  b.box(0.26, 0.03, 0.29, DARK, [-2.06, d + 0.95, 0]);
  mast(b, a, -1.65, d + 0.75, 0.32);
  radarBar(b, -1.8, d + 0.74, 0.3);
  lifeboat(b, -2.1, d + 0.42, 0.56);
  // contêineres em baias, com tampas de escotilha entre elas
  let k = 0;
  for (let i = 0; i < 5; i++) {
    const x = -1.0 + i * 0.47;
    b.box(0.44, 0.04, 1.02, '#556070', [x, d + 0.02, 0]);
    const tiers = i % 2 ? 2 : 3;
    for (const z of [-0.33, 0, 0.33])
      for (let j = 0; j < tiers; j++) {
        b.box(0.42, 0.17, 0.3, CONTAINERS[k++ % CONTAINERS.length]!, [x, d + 0.13 + j * 0.175, z]);
        b.box(0.425, 0.01, 0.305, '#2a2e33', [x, d + 0.215 + j * 0.175, z]);
      }
  }
  // guindaste amarelo, mastro de proa com luzes, guarda-corpos
  b.cyl(0.07, 0.08, 0.6, '#e2b02c', [1.6, d + 0.3, 0.22], undefined, 6);
  b.box(0.12, 0.1, 0.12, '#e2b02c', [1.6, d + 0.62, 0.22]);
  b.box(0.9, 0.06, 0.06, '#e2b02c', [1.25, d + 0.68, 0.22], [0, 0, 0.35]);
  for (let i = 0; i < 4; i++) b.box(0.05, 0.012, 0.07, '#c4362a', [1.0 + i * 0.12, d + 0.6 + i * 0.044, 0.22], [0, 0, 0.35]);
  b.box(0.02, 0.32, 0.02, DARK, [0.85, d + 0.43, 0.22]);
  b.cyl(0.02, 0.025, 0.55, '#e9e9e4', [1.95, d + 0.4, 0], undefined, 5);
  b.sphere(0.025, '#f2e6a0', [1.95, d + 0.69, 0], undefined, 5);
  deckRails(b, H, -2.2, 1.4, '#e9e9e4');
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [2.3, d, 0] };
}

/**
 * Pesqueiro (05/11): barco de pesca costeiro, bem menor que o cargueiro. Casco verde-escuro com fundo vermelho e
 * faixa na cor da nação, convés de madeira, timoneira branca com janelas azuis na frente, mastro com antenas e luz,
 * pórtico de popa com o cabo e o tambor da rede, boias laranja e caixas de peixe. Referência de forma: traineiras e
 * arrastões costeiros; o desenho é próprio.
 */
export function buildFishingBoat(): ShipModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const H = hull(b, 2.6, 0.86, 0.34, '#1f5a46', '#9a7451', 0.24, 0.18, 0.1);
  const d = H.deck;
  // faixa da nação abaixo da borda e borda clara (amurada)
  for (const z of [-0.432, 0.432]) a.box(2.0, 0.04, 0.008, '#ffffff', [-0.1, d - 0.07, z]);
  for (const z of [-0.41, 0.41]) b.box(2.1, 0.06, 0.03, '#e8e4da', [-0.12, d + 0.04, z]);
  // timoneira à frente do meio: bloco branco, teto com beiral, janelas azuis em volta
  b.box(0.62, 0.4, 0.56, '#eeeee8', [0.32, d + 0.2, 0]);
  b.box(0.72, 0.04, 0.64, '#dcdcd4', [0.32, d + 0.42, 0]);
  for (const x of [0.12, 0.32, 0.52]) for (const z of [-0.284, 0.284]) g.box(0.13, 0.12, 0.008, '#3f6fb3', [x, d + 0.27, z]);
  for (const z of [-0.17, 0, 0.17]) g.box(0.008, 0.12, 0.13, '#3f6fb3', [0.635, d + 0.27, z]);
  g.box(0.008, 0.16, 0.1, '#3f6fb3', [0.005, d + 0.22, 0.12]);
  // teto: domo do radar, luz e mastro com antenas e a bandeira da nação
  b.cyl(0.07, 0.07, 0.05, '#f2f2ee', [0.42, d + 0.47, 0.1], undefined, 8);
  b.box(0.18, 0.03, 0.08, '#f2f2ee', [0.18, d + 0.46, -0.12]);
  b.cyl(0.012, 0.014, 0.5, DARK, [0.25, d + 0.69, 0.18], undefined, 4);
  b.cyl(0.008, 0.008, 0.36, DARK, [0.3, d + 0.62, -0.16], undefined, 3);
  mast(b, a, 0.05, d + 0.44, 0.62);
  b.sphere(0.025, '#f2e6a0', [0.05, d + 1.07, 0], undefined, 5);
  // escapamento atrás da timoneira
  b.cyl(0.04, 0.045, 0.32, '#2f3236', [-0.05, d + 0.36, -0.2], undefined, 6);
  // convés de trabalho na popa: pórtico em A, cabos, tambor da rede, boias e caixas de peixe
  for (const z of [-0.3, 0.3]) {
    b.box(0.05, 0.7, 0.05, '#c9cbc8', [-1.08, d + 0.35, z], [0, 0, -0.12]);
  }
  b.box(0.06, 0.06, 0.66, '#c9cbc8', [-1.12, d + 0.7, 0]);
  b.box(0.06, 0.05, 0.05, '#c9cbc8', [-1.3, d + 0.66, 0], [0, 0, 0.4]);
  strutLine(b, [-1.12, d + 0.7, 0], [0.05, d + 0.98, 0]);
  strutLine(b, [-1.3, d + 0.62, 0], [-1.33, d + 0.1, 0]);
  b.cyl(0.12, 0.12, 0.4, '#5a5f66', [-0.55, d + 0.14, 0], [Math.PI / 2, 0, 0], 10);
  b.cyl(0.125, 0.125, 0.3, '#2e7d6b', [-0.55, d + 0.14, 0], [Math.PI / 2, 0, 0], 10);
  for (const z of [-0.36, 0.36]) b.sphere(0.07, '#e0752a', [-1.18, d + 0.05, z], undefined, 7);
  b.sphere(0.06, '#e0752a', [-0.82, d + 0.06, -0.33], undefined, 7);
  for (const [x, z] of [
    [-0.82, 0.18],
    [-0.82, 0.32],
    [-0.98, 0.25],
  ] as const) b.box(0.13, 0.07, 0.12, '#3d82b8', [x, d + 0.04 + (x < -0.9 ? 0.07 : 0), z]);
  // rede recolhida sobre o tambor (malha escura)
  b.box(0.18, 0.05, 0.36, '#3a4a3a', [-0.55, d + 0.28, 0]);
  anchors(b, 0.95, 0.24, H.W);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [1.3, d, 0] };
}

/** Cabo fino entre dois pontos. */
function strutLine(b: PartBuilder, p: V3, q: V3): void {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const dz = q[2] - p[2];
  const len = Math.hypot(dx, dy, dz);
  const mid: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  const geo = new THREE.CylinderGeometry(0.008, 0.008, len, 3);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(quat);
  b.add(geo, '#202224', { pos: mid, rot: [e.x, e.y, e.z] });
}
