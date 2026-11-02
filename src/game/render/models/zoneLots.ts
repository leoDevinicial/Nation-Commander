import * as THREE from 'three';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { strut } from './rigging.ts';

/**
 * Lotes privados do zoneamento: uma célula (2×2 unidades), frente para +z (a rua). Low poly no mesmo kit das
 * construções; a camada `accent` leva a cor da nação (toldos, placas, letreiros, faixas), a `glass`, as janelas
 * (acesas à noite).
 *
 * Redesenho de 02/11 (pedido do usuário: "melhore os modelos 3D das construções de zoneamento"), com o que os kits low
 * poly de cidade usam para ler bem de cima: telhado com beiral e acabamento (a silhueta da casa), janelas com moldura,
 * divisória, peitoril e venezianas, base mais escura e cantoneiras nas paredes, portas com batente, degrau e marquise,
 * e os pequenos objetos que contam a história do lugar (caixa de correio, ar-condicionado, antena, vasos, bicicletário,
 * paletes, empilhadeira, chaminé listrada). Cores chapadas por camada; sem textura. Cada modelo fica entre ~700 e
 * ~2.000 triângulos (a cidade pode ter centenas de lotes, desenhados em lote).
 *
 * - Residencial: sobrado com varanda, bangalô com garagem, casa moderna com piscina, casas geminadas; prédio lâmina
 *   com varandas e torre envidraçada.
 * - Comercial: mercadinho com toldo, posto de gasolina, lanchonete americana, prédio de escritórios com lojas.
 * - Industrial: galpão em dente de serra, química com tanques e passarelas, centro logístico, fábrica de cimento.
 */
type V3 = [number, number, number];

const DARK = '#3a3f45';
const STEEL = '#9aa1a8';
const WHITE = '#f2efe8';
const TRIM = '#e6e1d6';
const LAWN = '#62914c';
const LAWN_DARK = '#4f7f3e';
const PAVE = '#b3ada1';
const PLINTH = '#8c857a';
const WALLS = ['#ead9b2', '#c9dce6', '#f0c4a0', '#d6e2bf'];
const ROOFS = ['#a8473a', '#6f5a48', '#4d5560', '#8e3b30'];
const SHUTTERS = ['#3f6b5a', '#2f4f7a', '#7a3b3b', '#5a5a5a'];
const CARS = ['#b93a2e', '#2f5f8a', '#e2e2da', '#3f7a46', '#d6a92c'];

// ------------------------------------------------------------------ peças

/** Paredes com base escura (rodapé) e cantoneiras claras nas quatro arestas. */
function walls(b: PartBuilder, w: number, h: number, d: number, color: string, pos: V3, plinth = PLINTH, corners = TRIM): void {
  const [x, y, z] = pos;
  b.box(w, h, d, color, [x, y + h / 2, z]);
  b.box(w + 0.02, 0.07, d + 0.02, plinth, [x, y + 0.035, z]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, h, 0.05, corners, [x + sx * (w / 2), y + h / 2, z + sz * (d / 2)]);
}

/**
 * Telhado de duas águas com beiral (`over` além das paredes), testeira clara nas bordas e cumeeira. `alongX`: a
 * cumeeira corre ao longo de x (empenas nos lados ±x).
 */
function gableRoof(b: PartBuilder, w: number, d: number, h: number, color: string, pos: V3, alongX = true, over = 0.1): void {
  const [x, y, z] = pos;
  const L = (alongX ? w : d) + over * 2;
  const S = (alongX ? d : w) + over * 2;
  b.gable(L, S, h, color, [x, y, z], alongX ? 0 : Math.PI / 2);
  // testeira (bordas do beiral) e cumeeira
  if (alongX) {
    for (const s of [-1, 1]) b.box(L, 0.035, 0.035, TRIM, [x, y, z + s * (S / 2)]);
    b.box(L + 0.02, 0.04, 0.06, darker(color), [x, y + h, z]);
  } else {
    for (const s of [-1, 1]) b.box(0.035, 0.035, L, TRIM, [x + s * (S / 2), y, z]);
    b.box(0.06, 0.04, L + 0.02, darker(color), [x, y + h, z]);
  }
}

/** Telhado de quatro águas com beiral (cumeeira ao longo do lado maior). */
function hipRoof(b: PartBuilder, w: number, d: number, h: number, color: string, pos: V3, over = 0.1): void {
  const [x, y, z] = pos;
  const W = w + over * 2;
  const D = d + over * 2;
  const along = W >= D;
  const r = Math.abs(W - D) / 2;
  b.convex(
    [
      [x - W / 2, y, z - D / 2],
      [x + W / 2, y, z - D / 2],
      [x - W / 2, y, z + D / 2],
      [x + W / 2, y, z + D / 2],
      along ? [x - r, y + h, z] : [x, y + h, z - r],
      along ? [x + r + 0.001, y + h, z] : [x, y + h, z + r + 0.001],
    ],
    color,
  );
  b.box(W, 0.03, D, TRIM, [x, y - 0.015, z]);
}

const tmpColor = new THREE.Color();
const darker = (c: string, k = 0.75) => '#' + tmpColor.set(c).multiplyScalar(k).getHexString();

/**
 * Janela com moldura, divisória em cruz, vidro e peitoril, numa fachada voltada para `face` (+z, −z, +x ou −x).
 * Venezianas opcionais na cor dada.
 */
function win(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number, w = 0.2, h = 0.24, face: '+z' | '-z' | '+x' | '-x' = '+z', shutter?: string): void {
  const alongZ = face === '+z' || face === '-z';
  const s = face === '+z' || face === '+x' ? 1 : -1;
  const box = (bw: number, bh: number, depth: number, color: string, off: number, dx = 0, dy = 0, layer = b) =>
    alongZ ? layer.box(bw, bh, depth, color, [x + dx, y + dy, z + s * off]) : layer.box(depth, bh, bw, color, [x + s * off, y + dy, z + dx]);
  box(w + 0.06, h + 0.06, 0.02, WHITE, 0);
  box(w, h, 0.02, '#ffffff', 0.01, 0, 0, g);
  box(0.02, h, 0.025, WHITE, 0.02);
  box(w, 0.02, 0.025, WHITE, 0.02);
  box(w + 0.1, 0.03, 0.06, WHITE, 0.03, 0, -h / 2 - 0.04);
  if (shutter)
    for (const k of [-1, 1]) box(w * 0.42, h + 0.02, 0.02, shutter, 0.015, k * (w / 2 + w * 0.25));
}

/** Porta com batente, degrau e marquise, voltada para +z. */
function door(b: PartBuilder, x: number, z: number, color = '#5a3e2b', w = 0.2, y0 = 0.04): void {
  b.box(w + 0.06, 0.4, 0.02, WHITE, [x, y0 + 0.2, z]);
  b.box(w, 0.36, 0.025, color, [x, y0 + 0.18, z + 0.005]);
  b.box(0.025, 0.025, 0.02, '#d6b04a', [x + w * 0.3, y0 + 0.18, z + 0.02]);
  b.box(w + 0.16, 0.04, 0.16, PAVE, [x, y0 + 0.02, z + 0.08]);
  b.box(w + 0.16, 0.03, 0.14, WHITE, [x, y0 + 0.45, z + 0.07]);
}

/** Arbusto: duas ou três massas facetadas. */
function bush(b: PartBuilder, x: number, z: number, r = 0.11, color = LAWN_DARK): void {
  b.sphere(r, color, [x, 0.05 + r * 0.7, z], [1.2, 0.8, 1], 5);
  b.sphere(r * 0.75, '#5d9447', [x + r * 0.6, 0.05 + r * 0.6, z + r * 0.3], [1.1, 0.8, 1], 5);
}

/** Árvore de copa redonda em duas massas. */
function tree(b: PartBuilder, x: number, z: number, r = 0.2): void {
  b.cyl(0.025, 0.04, 0.3, '#6b5038', [x, 0.19, z], undefined, 5);
  b.sphere(r, LAWN_DARK, [x, 0.36 + r * 0.75, z], [1, 0.9, 1], 6);
  b.sphere(r * 0.7, '#5d9447', [x + r * 0.35, 0.36 + r * 1.2, z - r * 0.2], [1, 0.9, 1], 6);
}

/** Carro de passeio low poly (frente para +x, ou +z com `alongZ`). */
function car(b: PartBuilder, g: PartBuilder, x: number, z: number, color: string, alongZ = false): void {
  const R = (w: number, d: number) => (alongZ ? [d, w] : [w, d]) as [number, number];
  const [w1, d1] = R(0.52, 0.24);
  b.box(w1, 0.1, d1, color, [x, 0.14, z]);
  const [w2, d2] = R(0.3, 0.22);
  b.box(w2, 0.09, d2, color, [x, 0.235, z]);
  const [w3, d3] = R(0.31, 0.23);
  g.box(w3, 0.06, d3, '#ffffff', [x, 0.24, z]);
  for (const a of [-1, 1])
    for (const c of [-1, 1]) {
      const [ox, oz] = alongZ ? [c * 0.12, a * 0.16] : [a * 0.16, c * 0.12];
      b.cyl(0.05, 0.05, 0.04, C.rubber, [x + ox, 0.1, z + oz], alongZ ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], 8);
    }
}

/** Cerca de estacas ao longo de x, de `x0` a `x1`, em `z`. */
function fence(b: PartBuilder, x0: number, x1: number, z: number, color = WHITE): void {
  const n = Math.max(2, Math.round((x1 - x0) / 0.14));
  for (let i = 0; i <= n; i++) b.box(0.025, 0.15, 0.025, color, [x0 + ((x1 - x0) * i) / n, 0.115, z]);
  for (const y of [0.09, 0.16]) b.box(x1 - x0, 0.02, 0.015, color, [(x0 + x1) / 2, y, z]);
}

/** Aparelho de ar-condicionado (caixa com grade) preso na parede ou no telhado. */
function acUnit(b: PartBuilder, x: number, y: number, z: number): void {
  b.box(0.16, 0.11, 0.1, '#dcdcd6', [x, y, z]);
  b.cyl(0.035, 0.035, 0.012, '#8a9096', [x, y, z + 0.051], [Math.PI / 2, 0, 0], 8);
}

/** Lote: grama e caminho até a calçada (borda +z). */
function lotBase(b: PartBuilder, ground = LAWN, path?: number): void {
  b.box(1.96, 0.04, 1.96, ground, [0, 0.02, 0]);
  if (path !== undefined) for (let k = 0; k < 4; k++) b.box(0.18, 0.012, 0.12, PAVE, [path, 0.045, 0.45 + k * 0.15]);
}

// ------------------------------------------------------------------ residencial

/** Sobrado: dois andares, telhado de duas águas com beiral, varanda coberta com colunas, venezianas, chaminé e cerca. */
function sobrado(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const wall = WALLS[v % 4]!;
  const roof = ROOFS[v % 4]!;
  const sh = SHUTTERS[v % 4]!;
  lotBase(b, LAWN, 0);
  walls(b, 1.15, 0.95, 0.9, wall, [0, 0.04, -0.2]);
  b.box(1.19, 0.035, 0.94, TRIM, [0, 0.52, -0.2]);
  gableRoof(b, 1.15, 0.9, 0.42, roof, [0, 0.99, -0.2], true, 0.12);
  // chaminé de tijolo com capa
  b.box(0.15, 0.42, 0.15, '#9a5a44', [0.32, 1.25, -0.4]);
  b.box(0.19, 0.04, 0.19, '#6e3f30', [0.32, 1.47, -0.4]);
  for (const x of [-0.32, 0.32]) win(b, g, x, 0.77, 0.255, 0.2, 0.24, '+z', sh);
  win(b, g, -0.33, 0.3, 0.255, 0.22, 0.22, '+z', sh);
  door(b, 0.15, 0.255);
  for (const z of [-0.45, 0.05]) {
    win(b, g, 0.58, 0.77, z, 0.18, 0.22, '+x');
    win(b, g, -0.58, 0.77, z, 0.18, 0.22, '-x');
  }
  // varanda coberta
  b.box(1.0, 0.05, 0.36, '#c9c1b2', [0, 0.065, 0.45]);
  for (const x of [-0.45, 0.45]) b.box(0.05, 0.4, 0.05, WHITE, [x, 0.29, 0.6]);
  b.box(1.06, 0.035, 0.42, roof, [0, 0.5, 0.45], [0.18, 0, 0]);
  a.box(1.06, 0.04, 0.02, '#ffffff', [0, 0.47, 0.66]);
  for (let k = 0; k < 7; k++) b.box(0.02, 0.12, 0.02, WHITE, [-0.45 + k * 0.15, 0.15, 0.62]);
  b.box(0.92, 0.02, 0.02, WHITE, [0, 0.2, 0.62]);
  // jardim
  fence(b, -0.95, -0.15, 0.9);
  fence(b, 0.15, 0.95, 0.9);
  bush(b, -0.6, 0.62);
  bush(b, 0.62, 0.6, 0.09);
  tree(b, -0.75, -0.75, 0.18);
  b.box(0.04, 0.2, 0.04, DARK, [0.75, 0.14, 0.82]);
  a.box(0.1, 0.07, 0.07, '#ffffff', [0.75, 0.27, 0.82]); // caixa de correio
  return l.build();
}

/** Bangalô: térreo com telhado de quatro águas e beiral, garagem com portão basculante, entrada e carro. */
function bangalo(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const wall = WALLS[(v + 1) % 4]!;
  const roof = ROOFS[(v + 1) % 4]!;
  lotBase(b, LAWN);
  walls(b, 1.15, 0.55, 1.0, wall, [-0.3, 0.04, -0.2]);
  hipRoof(b, 1.15, 1.0, 0.36, roof, [-0.3, 0.6, -0.2], 0.12);
  for (const x of [-0.65, -0.05]) {
    win(b, g, x, 0.34, 0.305, 0.26, 0.22, '+z');
    b.box(0.28, 0.06, 0.07, '#7a5a3c', [x, 0.19, 0.34]); // floreira
    b.sphere(0.06, '#c76b8a', [x - 0.06, 0.23, 0.34], [1.4, 0.6, 0.8], 5);
    b.sphere(0.06, '#e2c04a', [x + 0.06, 0.23, 0.34], [1.4, 0.6, 0.8], 5);
  }
  door(b, -0.35, 0.305, '#2f4a6a');
  win(b, g, -0.88, 0.34, -0.2, 0.22, 0.22, '-x');
  // garagem
  walls(b, 0.6, 0.48, 0.85, '#dcd6c9', [0.6, 0.04, -0.25]);
  b.box(0.72, 0.05, 0.97, darker(roof), [0.6, 0.545, -0.25]);
  b.box(0.48, 0.34, 0.02, '#c8ccd0', [0.6, 0.22, 0.18]);
  for (let i = 0; i < 5; i++) b.box(0.48, 0.012, 0.025, '#9aa0a6', [0.6, 0.08 + i * 0.065, 0.19]);
  b.box(0.56, 0.02, 0.8, '#a39d92', [0.6, 0.045, 0.55]);
  car(b, g, 0.6, 0.55, CARS[v % CARS.length]!, true);
  acUnit(b, -0.88 - 0.06, 0.2, 0.15);
  bush(b, -0.85, 0.65);
  tree(b, -0.75, -0.85, 0.16);
  b.box(0.04, 0.2, 0.04, DARK, [-0.85, 0.14, 0.88]);
  a.box(0.1, 0.07, 0.07, '#ffffff', [-0.85, 0.27, 0.88]);
  return l.build();
}

/** Casa moderna: volumes brancos em balanço, ripado de madeira, vidro do chão ao teto, terraço e piscina com deque. */
function moderna(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, LAWN);
  walls(b, 1.25, 0.5, 0.85, WHITE, [-0.25, 0.04, -0.45], '#6e6a63', '#d6d2c8');
  // pavimento de cima em balanço, deslocado
  walls(b, 1.0, 0.44, 0.8, '#3f454c', [0.15, 0.56, -0.5], '#3f454c', '#2f3439');
  b.box(1.1, 0.05, 0.9, WHITE, [0.15, 1.02, -0.5]);
  b.box(1.35, 0.05, 0.95, '#d6d2c8', [-0.25, 0.565, -0.45]);
  // vidro com montantes
  g.box(0.85, 0.4, 0.02, '#ffffff', [-0.4, 0.27, -0.015]);
  for (let k = 0; k < 4; k++) b.box(0.025, 0.42, 0.03, '#2f3439', [-0.82 + k * 0.28, 0.27, -0.01]);
  g.box(0.75, 0.3, 0.02, '#ffffff', [0.15, 0.78, -0.09]);
  for (let k = 0; k < 3; k++) b.box(0.025, 0.32, 0.03, DARK, [-0.22 + k * 0.37, 0.78, -0.085]);
  // ripado de madeira na lateral
  for (let k = 0; k < 8; k++) b.box(0.03, 0.5, 0.06, '#9a7046', [0.4 + k * 0.04, 0.29, -0.01]);
  // terraço com guarda-corpo de vidro
  for (const x of [-0.85, -0.2]) b.box(0.02, 0.14, 0.02, DARK, [x, 0.66, 0.0]);
  g.box(0.65, 0.12, 0.015, '#ffffff', [-0.52, 0.66, 0.0]);
  a.box(0.4, 0.05, 0.02, '#ffffff', [0.15, 0.95, -0.085]);
  // piscina com deque e espreguiçadeiras
  b.box(1.0, 0.05, 0.62, '#c8ae86', [0.3, 0.06, 0.45]);
  b.box(0.78, 0.02, 0.4, '#5fb4d6', [0.3, 0.09, 0.45]);
  b.box(0.82, 0.03, 0.03, WHITE, [0.3, 0.095, 0.24]);
  for (const x of [-0.45, -0.7]) {
    b.box(0.14, 0.03, 0.36, '#ececec', [x, 0.09, 0.5]);
    b.box(0.14, 0.03, 0.12, '#ececec', [x, 0.13, 0.33], [0.6, 0, 0]);
  }
  b.cyl(0.0, 0.18, 0.08, '#e6e3dc', [-0.58, 0.42, 0.62], undefined, 8);
  b.cyl(0.01, 0.01, 0.34, DARK, [-0.58, 0.22, 0.62], undefined, 4);
  bush(b, 0.8, -0.85, 0.1);
  tree(b, -0.8, -0.85, 0.15);
  return l.build();
}

/** Casas geminadas: duas unidades estreitas em cores diferentes, telhados íngremes, águas-furtadas e escadinhas. */
function geminadas(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, LAWN);
  for (const [k, x] of [
    [0, -0.42],
    [1, 0.42],
  ] as const) {
    const wall = WALLS[(v + k * 2) % 4]!;
    const roof = k ? '#4d5560' : ROOFS[v % 4]!;
    walls(b, 0.82, 0.88, 0.95, wall, [x, 0.04, -0.2]);
    b.box(0.86, 0.035, 0.99, TRIM, [x, 0.5, -0.2]);
    gableRoof(b, 0.82, 0.95, 0.5, roof, [x, 0.92, -0.2], false, 0.06);
    // água-furtada na frente
    b.box(0.22, 0.16, 0.14, wall, [x + 0.12, 1.12, 0.12]);
    b.gable(0.18, 0.28, 0.1, roof, [x + 0.12, 1.2, 0.12], Math.PI / 2);
    win(b, g, x + 0.12, 1.11, 0.195, 0.13, 0.11);
    win(b, g, x - 0.17, 0.72, 0.28, 0.2, 0.24, '+z', SHUTTERS[(v + k) % 4]);
    win(b, g, x + 0.17, 0.72, 0.28, 0.2, 0.24, '+z', SHUTTERS[(v + k) % 4]);
    win(b, g, x + 0.17, 0.3, 0.28, 0.2, 0.22);
    door(b, x - 0.17, 0.28, k ? '#2f4a6a' : '#6a2f2f', 0.18, 0.1);
    // escadinha com corrimão
    for (let s = 0; s < 2; s++) b.box(0.3, 0.05, 0.12, PAVE, [x - 0.17, 0.065 + s * 0.05, 0.5 - s * 0.1]);
    for (const dx of [-0.15, 0.15]) strut(b, [x - 0.17 + dx, 0.1, 0.56], [x - 0.17 + dx, 0.22, 0.38], 0.015, DARK);
    // chaminé
    b.box(0.12, 0.28, 0.12, darker(wall, 0.85), [x + (k ? 0.25 : -0.25), 1.18, -0.45]);
    b.box(0.15, 0.03, 0.15, '#5a5a5a', [x + (k ? 0.25 : -0.25), 1.33, -0.45]);
  }
  b.box(0.03, 0.88, 0.97, WHITE, [0, 0.48, -0.2]);
  a.box(0.22, 0.12, 0.02, '#ffffff', [-0.62, 0.48, 0.282]);
  for (const x of [-0.82, 0.82]) bush(b, x, 0.6);
  fence(b, -0.95, 0.95, 0.9, '#3a3f45');
  return l.build();
}

/** Prédio de apartamentos: lâmina de 5 andares com varandas (v par) ou torre de 8 envidraçada com coroamento (v ímpar). */
function apartamentos(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#7f9a6a');
  if (v % 2 === 0) {
    const floors = 5;
    const fh = 0.36;
    const wall = WALLS[v % 4]!;
    walls(b, 1.55, floors * fh + 0.1, 1.15, wall, [0, 0.04, -0.25]);
    for (let f = 0; f < floors; f++) {
      const y = 0.32 + f * fh;
      for (const x of [-0.5, 0, 0.5]) win(b, g, x, y, 0.33, 0.24, 0.2);
      b.box(1.57, 0.03, 1.17, TRIM, [0, y - 0.16, -0.25]); // friso entre andares
      if (f > 0) {
        b.box(1.5, 0.03, 0.2, WHITE, [0, y - 0.13, 0.43]); // laje da varanda
        for (let k = 0; k < 5; k++) b.box(0.015, 0.12, 0.015, DARK, [-0.72 + k * 0.36, y - 0.06, 0.525]);
        b.box(1.48, 0.015, 0.02, DARK, [0, y + 0.0, 0.525]);
      }
      for (const z of [-0.6, 0.05]) {
        win(b, g, 0.78, y, z, 0.22, 0.2, '+x');
        win(b, g, -0.78, y, z, 0.22, 0.2, '-x');
      }
      if (f % 2 === 1) acUnit(b, 0.78 + 0.05, y - 0.08, -0.28);
    }
    const top = 0.14 + floors * fh;
    b.box(1.6, 0.12, 1.2, TRIM, [0, top, -0.25]); // platibanda
    b.box(0.42, 0.3, 0.32, '#b9b3a6', [-0.4, top + 0.21, -0.4]);
    b.cyl(0.15, 0.15, 0.22, '#6e8494', [0.35, top + 0.17, -0.45], undefined, 10);
    b.cyl(0.16, 0.16, 0.03, '#56697a', [0.35, top + 0.29, -0.45], undefined, 10);
    strut(b, [0.6, top + 0.06, -0.7], [0.6, top + 0.45, -0.7], 0.015, DARK); // antena
    // portaria com marquise na cor da nação
    g.box(0.42, 0.24, 0.02, '#ffffff', [0, 0.2, 0.335]);
    a.box(0.6, 0.04, 0.3, '#ffffff', [0, 0.36, 0.48]);
    for (const x of [-0.27, 0.27]) b.box(0.03, 0.32, 0.03, DARK, [x, 0.2, 0.62]);
  } else {
    const floors = 8;
    const fh = 0.3;
    walls(b, 1.15, floors * fh + 0.12, 1.15, '#c7ccd1', [0, 0.04, -0.2], '#5a5f66', '#8e959c');
    for (let f = 0; f < floors; f++) {
      const y = 0.3 + f * fh;
      g.box(1.07, 0.17, 0.02, '#ffffff', [0, y, 0.385]);
      g.box(0.02, 0.17, 1.07, '#ffffff', [0.585, y, -0.2]);
      g.box(0.02, 0.17, 1.07, '#ffffff', [-0.585, y, -0.2]);
      b.box(1.18, 0.035, 1.18, '#e6e3dc', [0, y - 0.12, -0.2]);
    }
    for (let k = 0; k < 5; k++) b.box(0.025, floors * fh, 0.03, '#8e959c', [-0.44 + k * 0.22, 0.2 + (floors * fh) / 2, 0.39]); // montantes
    const top = 0.16 + floors * fh;
    b.box(0.85, 0.26, 0.85, '#aab0b6', [0, top + 0.13, -0.2]);
    b.box(0.55, 0.22, 0.55, '#e6e3dc', [0, top + 0.37, -0.2]);
    a.box(0.87, 0.07, 0.87, '#ffffff', [0, top + 0.03, -0.2]);
    strut(b, [0, top + 0.48, -0.2], [0, top + 0.95, -0.2], 0.02, DARK);
    b.sphere(0.03, '#d8322a', [0, top + 0.96, -0.2], undefined, 5);
    // lobby com marquise
    a.box(0.7, 0.04, 0.34, '#ffffff', [0, 0.38, 0.55]);
    for (const x of [-0.32, 0.32]) b.box(0.03, 0.34, 0.03, DARK, [x, 0.2, 0.7]);
  }
  tree(b, -0.78, 0.65, 0.15);
  tree(b, 0.78, 0.65, 0.15);
  bush(b, -0.45, 0.75, 0.08);
  return l.build();
}

// ------------------------------------------------------------------ comercial

/** Fachada de loja com vitrine em montantes, voltada para +z. */
function storefront(b: PartBuilder, g: PartBuilder, x: number, z: number, w: number, h: number, frame = DARK): void {
  g.box(w, h, 0.02, '#ffffff', [x, 0.06 + h / 2, z]);
  const n = Math.max(2, Math.round(w / 0.3));
  for (let k = 0; k <= n; k++) b.box(0.025, h + 0.02, 0.03, frame, [x - w / 2 + (w * k) / n, 0.06 + h / 2, z + 0.005]);
  b.box(w + 0.03, 0.03, 0.03, frame, [x, 0.06 + h, z + 0.005]);
}

/** Toldo listrado: faixas na cor da nação alternadas com branco, inclinado para a rua. */
function awning(b: PartBuilder, a: PartBuilder, x: number, y: number, z: number, w: number, depth = 0.34, stripes = 6): void {
  for (let i = 0; i < stripes; i++) (i % 2 ? b : a).box(w / stripes, 0.025, depth, i % 2 ? WHITE : '#ffffff', [x - w / 2 + (w / stripes) * (i + 0.5), y, z], [-0.38, 0, 0]);
  a.box(w, 0.07, 0.015, '#ffffff', [x, y - 0.09, z + depth / 2 - 0.01]);
}

/** Mercadinho: fachada com platibanda e cornija, vitrine, toldo listrado, letreiro, freezer, caixotes e bicicletário. */
function mercadinho(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, PAVE);
  const wall = ['#c98a5e', '#d8c7a4', '#a9b8c4', '#c9a26b'][v % 4]!;
  walls(b, 1.6, 0.66, 1.05, wall, [0, 0.04, -0.4]);
  b.box(1.66, 0.22, 0.06, wall, [0, 0.8, 0.14]); // platibanda da fachada
  b.box(1.7, 0.04, 0.1, TRIM, [0, 0.92, 0.14]);
  b.box(1.66, 0.04, 1.1, TRIM, [0, 0.7, -0.4]);
  storefront(b, g, -0.15, 0.13, 1.05, 0.38);
  b.box(0.24, 0.42, 0.025, '#3f454c', [0.58, 0.25, 0.13]);
  g.box(0.18, 0.3, 0.02, '#ffffff', [0.58, 0.27, 0.145]);
  awning(b, a, -0.15, 0.56, 0.32, 1.15);
  // letreiro com "letras" em blocos
  a.box(1.0, 0.16, 0.05, '#ffffff', [0, 0.8, 0.18]);
  for (let k = 0; k < 6; k++) b.box(0.09, 0.08, 0.02, WHITE, [-0.38 + k * 0.15, 0.8, 0.21]);
  acUnit(b, -0.5, 0.79, -0.55);
  acUnit(b, 0.3, 0.79, -0.7);
  // calçada da loja: freezer, caixotes de frutas, bicicletário
  b.box(0.3, 0.26, 0.18, '#e8eef2', [0.68, 0.17, 0.42]);
  a.box(0.3, 0.06, 0.02, '#ffffff', [0.68, 0.24, 0.515]);
  for (let k = 0; k < 3; k++) {
    b.box(0.16, 0.08, 0.13, '#8a6a45', [-0.75 + k * 0.17, 0.08, 0.45]);
    b.sphere(0.05, ['#d8322a', '#e2c04a', '#5d9447'][k]!, [-0.75 + k * 0.17, 0.13, 0.45], [1.3, 0.5, 1], 5);
  }
  for (let k = 0; k < 3; k++) b.box(0.015, 0.1, 0.18, DARK, [0.2 + k * 0.1, 0.09, 0.55]);
  car(b, g, -0.4, 0.82, CARS[(v + 2) % CARS.length]!);
  return l.build();
}

/** Posto de gasolina: cobertura com testeira e luzes, duas ilhas de bombas, loja de conveniência, calibrador e totem. */
function posto(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  b.box(1.5, 0.012, 1.0, '#6f6b65', [-0.2, 0.045, 0.25]);
  for (const [x, z] of [
    [-0.65, -0.05],
    [0.25, -0.05],
    [-0.65, 0.55],
    [0.25, 0.55],
  ] as const)
    b.box(0.07, 0.64, 0.07, WHITE, [x, 0.36, z]);
  b.box(1.25, 0.12, 0.9, WHITE, [-0.2, 0.72, 0.25]);
  a.box(1.27, 0.08, 0.92, '#ffffff', [-0.2, 0.7, 0.25]);
  for (const [x, z] of [
    [-0.45, 0.1],
    [0.05, 0.1],
    [-0.45, 0.4],
    [0.05, 0.4],
  ] as const)
    g.box(0.16, 0.012, 0.08, '#ffffff', [x, 0.655, z]); // luzes da cobertura
  for (const x of [-0.45, 0.05]) {
    b.box(0.26, 0.06, 0.62, '#c8c4bc', [x, 0.07, 0.25]); // ilha
    for (const z of [0.1, 0.4]) {
      b.box(0.13, 0.3, 0.1, '#e6e3dc', [x, 0.25, z]);
      a.box(0.135, 0.06, 0.105, '#ffffff', [x, 0.36, z]);
      g.box(0.08, 0.06, 0.012, '#ffffff', [x, 0.28, z + 0.056]);
      b.box(0.02, 0.1, 0.02, DARK, [x + 0.08, 0.2, z]);
    }
  }
  // conveniência
  walls(b, 0.6, 0.45, 0.62, '#efebe2', [0.62, 0.04, -0.6]);
  b.box(0.66, 0.05, 0.68, '#d6d2c8', [0.62, 0.515, -0.6]);
  storefront(b, g, 0.62, -0.285, 0.45, 0.26);
  a.box(0.6, 0.07, 0.02, '#ffffff', [0.62, 0.45, -0.28]);
  acUnit(b, 0.5, 0.58, -0.75);
  // calibrador e totem de preços
  b.box(0.08, 0.22, 0.08, '#d8322a', [0.85, 0.15, 0.1]);
  b.box(0.06, 0.85, 0.06, DARK, [0.82, 0.46, 0.7]);
  b.box(0.26, 0.4, 0.06, WHITE, [0.82, 0.78, 0.7]);
  a.box(0.26, 0.1, 0.07, '#ffffff', [0.82, 0.93, 0.7]);
  for (let k = 0; k < 3; k++) b.box(0.18, 0.05, 0.065, '#1e2226', [0.82, 0.62 + k * 0.08, 0.7]);
  car(b, g, -0.45, 0.25, CARS[2]!, true);
  return l.build();
}

/** Lanchonete americana: cantos arredondados, faixa cromada, letreiro alto, janelão, mesas com guarda-sóis e cardápio. */
function lanchonete(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, PAVE);
  const wall = ['#c94a3a', '#3f7a8a', '#d6a92c', '#5a7a4a'][v % 4]!;
  // corpo com cantos arredondados (cilindros nas pontas)
  b.box(1.0, 0.56, 0.8, wall, [-0.1, 0.32, -0.45]);
  for (const x of [-0.6, 0.4]) b.cyl(0.4, 0.4, 0.56, wall, [x, 0.32, -0.45], undefined, 12);
  b.box(1.0, 0.05, 0.81, '#d9dde0', [-0.1, 0.2, -0.45]); // faixa cromada
  for (const x of [-0.6, 0.4]) b.cyl(0.405, 0.405, 0.05, '#d9dde0', [x, 0.2, -0.45], undefined, 12);
  b.box(1.0, 0.06, 0.86, '#2a2d31', [-0.1, 0.63, -0.45]);
  for (const x of [-0.6, 0.4]) b.cyl(0.43, 0.43, 0.06, '#2a2d31', [x, 0.63, -0.45], undefined, 12);
  g.box(0.95, 0.2, 0.02, '#ffffff', [-0.1, 0.42, -0.04]);
  door(b, 0.25, -0.04, '#2a2d31');
  // letreiro alto em poste
  b.box(0.05, 0.5, 0.05, DARK, [0.75, 0.95, -0.3]);
  a.box(0.5, 0.3, 0.06, '#ffffff', [0.75, 1.3, -0.3]);
  b.box(0.54, 0.34, 0.04, WHITE, [0.75, 1.3, -0.335]);
  b.sphere(0.06, '#e2c04a', [0.75, 1.5, -0.3], undefined, 6);
  // mesas com guarda-sol e cadeiras
  for (const [x, z] of [
    [-0.55, 0.45],
    [0.15, 0.45],
  ] as const) {
    b.cyl(0.14, 0.14, 0.02, WHITE, [x, 0.21, z], undefined, 8);
    b.cyl(0.015, 0.015, 0.2, DARK, [x, 0.11, z], undefined, 4);
    b.cyl(0.012, 0.012, 0.42, DARK, [x, 0.42, z], undefined, 4);
    a.cyl(0.0, 0.3, 0.12, '#ffffff', [x, 0.66, z], undefined, 8);
    for (const s of [-1, 1]) {
      b.box(0.1, 0.02, 0.1, '#7a5a3c', [x + s * 0.21, 0.13, z]);
      b.box(0.02, 0.12, 0.1, '#7a5a3c', [x + s * 0.26, 0.19, z]);
    }
  }
  b.box(0.04, 0.3, 0.2, DARK, [0.72, 0.19, 0.55]); // cardápio
  b.box(0.02, 0.24, 0.18, '#f2efe8', [0.7, 0.21, 0.55]);
  acUnit(b, -0.3, 0.72, -0.6);
  return l.build();
}

/** Prédio comercial: lojas com toldos no térreo, dois andares de escritórios envidraçados, casa de máquinas e outdoor. */
function escritorios(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, PAVE);
  walls(b, 1.65, 0.48, 1.25, '#d8d4cc', [0, 0.04, -0.3], '#6e6a63', '#b9b3a6');
  for (const x of [-0.42, 0.42]) {
    storefront(b, g, x, 0.33, 0.7, 0.32);
    awning(b, a, x, 0.47, 0.48, 0.74, 0.22, 4);
  }
  b.box(1.71, 0.06, 1.31, TRIM, [0, 0.54, -0.3]);
  walls(b, 1.55, 0.86, 1.15, '#9fb0bf', [0, 0.57, -0.3], '#7b8a97', '#e6e3dc');
  for (const y of [0.78, 1.2]) {
    g.box(1.47, 0.24, 0.02, '#ffffff', [0, y, 0.28]);
    g.box(0.02, 0.24, 1.07, '#ffffff', [0.785, y, -0.3]);
    g.box(0.02, 0.24, 1.07, '#ffffff', [-0.785, y, -0.3]);
    b.box(1.57, 0.035, 1.17, '#e6e3dc', [0, y - 0.15, -0.3]);
  }
  for (let k = 0; k < 6; k++) b.box(0.025, 0.8, 0.03, '#e6e3dc', [-0.7 + k * 0.28, 1.0, 0.285]);
  b.box(1.61, 0.08, 1.21, '#e6e3dc', [0, 1.46, -0.3]);
  b.box(0.45, 0.22, 0.35, '#aab0b6', [0.45, 1.6, -0.55]);
  for (const x of [-0.5, -0.2]) acUnit(b, x, 1.56, -0.75);
  // outdoor
  for (const x of [-0.35, 0.35]) b.box(0.05, 0.32, 0.05, DARK, [x, 1.66, -0.15]);
  b.box(1.0, 0.36, 0.05, WHITE, [0, 1.96, -0.15]);
  a.box(0.9, 0.28, 0.06, '#ffffff', [0, 1.96, -0.14]);
  return l.build();
}

// ------------------------------------------------------------------ industrial

/** Parede de chapa ondulada: nervuras verticais numa face (+z ou ±x) de largura `w`. */
function ribs(b: PartBuilder, x: number, y: number, z: number, w: number, h: number, face: '+z' | '+x' | '-x', color = '#9aa1a6'): void {
  const n = Math.round(w / 0.12);
  for (let k = 0; k <= n; k++) {
    const t = -w / 2 + (w * k) / n;
    if (face === '+z') b.box(0.02, h, 0.015, color, [x + t, y, z]);
    else b.box(0.015, h, 0.02, color, [x, y, z + t]);
  }
}

/** Portão de enrolar com frisos horizontais, voltado para +z. */
function rollDoor(b: PartBuilder, x: number, z: number, w: number, h: number): void {
  b.box(w + 0.06, h + 0.05, 0.02, '#5f666d', [x, 0.04 + h / 2, z]);
  b.box(w, h, 0.02, '#a8aeb4', [x, 0.04 + h / 2, z + 0.008]);
  for (let k = 1; k < 6; k++) b.box(w, 0.01, 0.025, '#868c92', [x, 0.04 + (h * k) / 6, z + 0.012]);
}

/** Empilhadeira (garfos para +x). */
function forklift(b: PartBuilder, x: number, z: number): void {
  b.box(0.2, 0.1, 0.13, C.yellow, [x, 0.12, z]);
  for (const s of [-1, 1]) b.box(0.015, 0.22, 0.015, DARK, [x + 0.04, 0.27, z + s * 0.05]);
  b.box(0.12, 0.015, 0.11, DARK, [x + 0.03, 0.38, z]);
  for (const s of [-1, 1]) b.box(0.015, 0.25, 0.015, '#2a2d31', [x + 0.11, 0.17, z + s * 0.045]);
  for (const s of [-1, 1]) b.box(0.12, 0.012, 0.02, '#2a2d31', [x + 0.17, 0.06, z + s * 0.04]);
  for (const sx of [-0.06, 0.06]) for (const s of [-1, 1]) b.cyl(0.035, 0.035, 0.03, C.rubber, [x + sx, 0.07, z + s * 0.07], [Math.PI / 2, 0, 0], 8);
}

/** Pilha de paletes com carga. */
function pallets(b: PartBuilder, x: number, z: number, color = '#c8b28e'): void {
  for (let k = 0; k < 2; k++) {
    b.box(0.2, 0.025, 0.2, '#8a6a45', [x, 0.06 + k * 0.13, z]);
    b.box(0.18, 0.1, 0.18, color, [x, 0.125 + k * 0.13, z]);
  }
}

/** Chaminé com faixas vermelhas e brancas e capa. */
function stack(b: PartBuilder, x: number, z: number, h: number, r = 0.08): void {
  b.cyl(r * 0.85, r, h, '#e6e3dc', [x, 0.04 + h / 2, z], undefined, 8);
  for (let k = 0; k < 3; k++) b.cyl(r * 0.88, r * 0.9, h * 0.08, '#c9483a', [x, 0.04 + h * (0.6 + k * 0.14), z], undefined, 8);
  b.cyl(r + 0.02, r + 0.02, 0.04, DARK, [x, 0.06 + h, z], undefined, 8);
}

/** Galpão fabril com telhado em dente de serra envidraçado, chapa ondulada, portões, paletes, empilhadeira e chaminé. */
function denteDeSerra(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  walls(b, 1.7, 0.56, 1.3, '#b9b3a6', [0, 0.04, -0.25], '#6e6a63', '#8e959c');
  ribs(b, 0, 0.32, 0.405, 1.68, 0.5, '+z');
  ribs(b, 0.855, 0.32, -0.25, 1.28, 0.5, '+x');
  for (let i = 0; i < 4; i++) {
    const x = -0.64 + i * 0.425;
    b.side(
      [
        [-0.21, 0],
        [0.21, 0],
        [0.21, 0.32],
      ],
      1.32,
      '#7d858c',
      [x, 0.6, -0.25],
    );
    g.box(0.02, 0.28, 1.26, '#ffffff', [x + 0.205, 0.76, -0.25]);
  }
  for (const x of [-0.45, 0.25]) rollDoor(b, x, 0.415, 0.42, 0.36);
  a.box(1.3, 0.09, 0.02, '#ffffff', [0, 0.52, 0.42]);
  b.box(0.2, 0.03, 0.12, '#2a2d31', [-0.45, 0.06, 0.5]);
  stack(b, 0.72, -0.78, 1.35);
  pallets(b, 0.75, 0.6);
  pallets(b, 0.52, 0.72, '#7aa0b8');
  forklift(b, -0.1, 0.65);
  return l.build();
}

/** Química: tanques com escadas e passarela, esfera, rack de tubos, casa de controle e tocha. */
function quimica(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  const tanks: [number, number, number, number][] = [
    [-0.5, -0.45, 0.32, 0.95],
    [0.15, -0.5, 0.26, 1.15],
  ];
  for (const [x, z, r, h] of tanks) {
    b.cyl(r, r, h, '#dcdcd4', [x, 0.04 + h / 2, z], undefined, 14);
    b.cyl(r * 0.6, r + 0.01, 0.1, '#c9c9c0', [x, 0.09 + h, z], undefined, 14);
    a.cyl(r + 0.005, r + 0.005, 0.08, '#ffffff', [x, 0.04 + h * 0.6, z], undefined, 14);
    for (const y of [h * 0.3, h * 0.85]) b.cyl(r + 0.012, r + 0.012, 0.02, '#9aa0a6', [x, 0.04 + y, z], undefined, 14);
    // escada de marinheiro com guarda-corpo
    strut(b, [x + r + 0.02, 0.05, z - 0.04], [x + r + 0.02, 0.04 + h, z - 0.04], 0.015, STEEL);
    strut(b, [x + r + 0.02, 0.05, z + 0.04], [x + r + 0.02, 0.04 + h, z + 0.04], 0.015, STEEL);
    for (let k = 1; k < 6; k++) b.box(0.01, 0.01, 0.08, STEEL, [x + r + 0.02, 0.04 + (h * k) / 6, z]);
  }
  // passarela entre os tanques
  b.box(0.42, 0.02, 0.1, STEEL, [-0.17, 1.0, -0.47]);
  for (const s of [-1, 1]) b.box(0.42, 0.01, 0.01, STEEL, [-0.17, 1.08, -0.47 + s * 0.05]);
  b.sphere(0.25, '#e6e3dc', [0.65, 0.36, -0.12], undefined, 12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.03, 0.24, 0.03, STEEL, [0.65 + sx * 0.15, 0.13, -0.12 + sz * 0.15]);
  // rack de tubos coloridos
  for (const x of [-0.7, -0.1, 0.5]) b.box(0.04, 0.6, 0.04, STEEL, [x, 0.34, 0.08]);
  b.box(1.3, 0.03, 0.12, STEEL, [-0.1, 0.62, 0.08]);
  for (const [dz, c] of [
    [-0.035, '#c9a43a'],
    [0.0, '#4a7a8a'],
    [0.035, '#a8473a'],
  ] as const)
    b.cyl(0.018, 0.018, 1.3, c, [-0.1, 0.655, 0.08 + dz], [0, 0, Math.PI / 2], 6);
  // casa de controle
  walls(b, 0.6, 0.36, 0.4, '#efebe2', [-0.45, 0.04, 0.5]);
  b.box(0.66, 0.04, 0.46, '#7d858c', [-0.45, 0.42, 0.5]);
  g.box(0.42, 0.14, 0.02, '#ffffff', [-0.45, 0.27, 0.705]);
  door(b, -0.2, 0.705, '#3f454c', 0.12);
  acUnit(b, -0.6, 0.5, 0.42);
  // tocha
  strut(b, [0.78, 0.04, 0.55], [0.78, 1.5, 0.55], 0.04, STEEL);
  for (let k = 0; k < 4; k++) strut(b, [0.7, 0.04 + k * 0.35, 0.55], [0.86, 0.04 + (k + 1) * 0.35, 0.55], 0.012, STEEL);
  a.sphere(0.05, '#ffffff', [0.78, 1.55, 0.55], undefined, 6);
  return l.build();
}

/** Centro logístico: armazém com chapa ondulada, três docas com para-choques, carreta, contêineres e empilhadeira. */
function logistica(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  walls(b, 1.45, 0.72, 1.15, '#c9c3b5', [-0.15, 0.04, -0.35], '#6e6a63', '#8e959c');
  ribs(b, -0.15, 0.4, 0.23, 1.42, 0.64, '+z', '#b0aa9d');
  b.box(1.51, 0.06, 1.21, '#7d858c', [-0.15, 0.79, -0.35]);
  for (let i = 0; i < 3; i++) {
    const x = -0.62 + i * 0.47;
    rollDoor(b, x, 0.235, 0.3, 0.32);
    for (const s of [-1, 1]) b.box(0.04, 0.08, 0.04, '#1e2226', [x + s * 0.17, 0.12, 0.26]);
    b.box(0.36, 0.04, 0.08, '#5f666d', [x, 0.42, 0.28]);
  }
  a.box(1.0, 0.13, 0.02, '#ffffff', [-0.15, 0.62, 0.237]);
  g.box(0.02, 0.12, 0.7, '#ffffff', [0.585, 0.6, -0.35]);
  // carreta encostada na doca
  b.box(0.3, 0.3, 0.62, '#e6e3dc', [-0.62, 0.27, 0.6]);
  a.box(0.31, 0.06, 0.63, '#ffffff', [-0.62, 0.36, 0.6]);
  b.box(0.27, 0.22, 0.2, CARS[v % CARS.length]!, [-0.62, 0.2, 1.0 - 0.06]);
  for (const z of [0.4, 0.75, 0.95]) for (const s of [-1, 1]) b.cyl(0.05, 0.05, 0.04, C.rubber, [-0.62 + s * 0.14, 0.08, z], [0, 0, Math.PI / 2], 8);
  // contêineres empilhados
  const cols = ['#b5452f', '#2f5f8a', '#3f7a46', '#d6a92c'];
  for (let k = 0; k < 5; k++) {
    const c = cols[(k + v) % 4]!;
    const [x, y, z] = [0.62, 0.15 + Math.floor(k / 3) * 0.21, 0.25 + (k % 3) * 0.24];
    b.box(0.5, 0.2, 0.22, c, [x, y, z]);
    for (let r = 0; r < 4; r++) b.box(0.012, 0.18, 0.225, darker(c), [x - 0.18 + r * 0.12, y, z]);
  }
  forklift(b, 0.05, 0.62);
  return l.build();
}

/** Fábrica de cimento: silos com anéis, torre de pré-aquecimento com passarelas, correia, forno rotativo e betoneira. */
function cimento(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#9a968d');
  for (const x of [-0.62, -0.18]) {
    b.cyl(0.22, 0.22, 1.1, '#d5d2ca', [x, 0.66, -0.62], undefined, 12);
    b.cyl(0.0, 0.22, 0.2, '#d5d2ca', [x, 0.12, -0.62], [Math.PI, 0, 0], 12);
    for (const y of [0.45, 0.8]) b.cyl(0.225, 0.225, 0.03, '#a9a69e', [x, y, -0.62], undefined, 12);
    b.cyl(0.12, 0.23, 0.12, '#bdb9b0', [x, 1.27, -0.62], undefined, 12);
    for (const s of [-1, 1]) b.box(0.04, 0.3, 0.04, DARK, [x + s * 0.15, 0.12, -0.62]);
  }
  a.box(0.86, 0.12, 0.02, '#ffffff', [-0.4, 0.95, -0.39]);
  // torre de pré-aquecimento (estrutura com pisos e passarelas)
  const [tx, tz] = [0.5, -0.55];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.035, 1.3, 0.035, '#8a5a44', [tx + sx * 0.18, 0.69, tz + sz * 0.18]);
  for (const y of [0.4, 0.75, 1.1, 1.34]) b.box(0.42, 0.03, 0.42, '#a9a69e', [tx, y, tz]);
  b.cyl(0.11, 0.11, 0.9, '#c4bdb0', [tx, 0.85, tz], undefined, 10);
  stack(b, tx + 0.12, tz - 0.12, 1.6, 0.06);
  walls(b, 0.5, 0.36, 0.4, '#c4bdb0', [0.5, 0.04, 0.0]);
  for (const x of [0.38, 0.62]) win(b, g, x, 0.26, 0.205, 0.12, 0.12);
  // forno rotativo sobre apoios
  b.cyl(0.11, 0.11, 0.95, '#8a8580', [-0.15, 0.33, 0.2], [0, 0, Math.PI / 2 - 0.08], 10);
  for (const x of [-0.5, -0.15, 0.2]) b.box(0.08, 0.24, 0.2, '#6e7378', [x, 0.15, 0.2]);
  for (const x of [-0.45, 0.1]) b.cyl(0.13, 0.13, 0.04, '#5f666d', [x, 0.33, 0.2], [0, 0, Math.PI / 2], 10);
  strut(b, [-0.62, 0.15, 0.25], [-0.62, 1.1, -0.45], 0.06, '#5f666d'); // correia até os silos
  // pilhas de agregado e betoneira
  b.cyl(0.0, 0.26, 0.22, '#a5a093', [-0.62, 0.15, 0.62], undefined, 7);
  b.cyl(0.0, 0.18, 0.16, '#7d776c', [-0.25, 0.12, 0.68], undefined, 7);
  b.box(0.24, 0.16, 0.24, C.yellow, [0.6, 0.15, 0.78]);
  g.box(0.02, 0.08, 0.2, '#ffffff', [0.72, 0.2, 0.78]);
  b.cyl(0.1, 0.13, 0.28, '#e6e3dc', [0.6, 0.28, 0.5], [Math.PI / 2 - 0.25, 0, 0], 10);
  for (let k = 0; k < 3; k++) b.cyl(0.115, 0.115, 0.02, '#c9483a', [0.6, 0.28, 0.42 + k * 0.08], [Math.PI / 2 - 0.25, 0, 0], 10);
  b.box(0.26, 0.05, 0.6, DARK, [0.6, 0.07, 0.62]);
  for (const z of [0.42, 0.62, 0.8]) for (const s of [-1, 1]) b.cyl(0.05, 0.05, 0.04, C.rubber, [0.6 + s * 0.13, 0.07, z], [0, 0, Math.PI / 2], 8);
  return l.build();
}

// ------------------------------------------------------------------ lote fundo

/**
 * Parte de trás do lote fundo (a célula atrás da frente, do lado oposto à rua), nas coordenadas da frente: ocupa
 * z de −1 a −3. A construção da frente continua para trás, mais comprida, sem mudar a fachada:
 * - casa: o corpo e o telhado se estendem (mesmas cores, janelas nas laterais) até o quintal com árvore, varal e horta;
 * - prédio: ala de fundos mais baixa e estacionamento;
 * - loja: depósito de fundos com doca e estacionamento;
 * - indústria: o galpão se alonga, com pátio cercado, caminhão e contêiner.
 */
function backPart(kind: LotKind, v: number, level: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const ground = kind === 'res' ? LAWN : kind === 'com' ? PAVE : '#8e8a82';
  b.box(1.96, 0.04, 1.96, ground, [0, 0.02, -2]);
  if (kind === 'res' && level >= 2) {
    walls(b, 1.2, 1.1, 1.3, v % 2 ? '#c7ccd1' : WALLS[v % 4]!, [0, 0.04, -1.5]);
    b.box(1.26, 0.08, 1.36, TRIM, [0, 1.18, -1.5]);
    for (const z of [-1.2, -1.75]) for (const y of [0.35, 0.75]) win(b, g, 0.61, y, z, 0.22, 0.2, '+x');
    b.box(1.6, 0.012, 0.6, '#5a5d61', [0, 0.045, -2.55]);
    for (const x of [-0.5, 0, 0.5]) b.box(0.02, 0.014, 0.5, WHITE, [x - 0.25, 0.05, -2.55]);
    car(b, g, -0.25, -2.55, CARS[v % CARS.length]!, true);
  } else if (kind === 'res') {
    // a casa continua para trás com as mesmas cores
    const dims: [number, number, number, string, string][] = [
      [0, 1.15, 0.95, WALLS[v % 4]!, ROOFS[v % 4]!],
      [-0.3, 1.15, 0.55, WALLS[(v + 1) % 4]!, ROOFS[(v + 1) % 4]!],
      [-0.25, 1.25, 0.5, WHITE, '#3f454c'],
      [0, 1.66, 0.88, WALLS[v % 4]!, ROOFS[v % 4]!],
    ];
    const [x, w, h, wall, roof] = dims[v % 4]!;
    walls(b, w, h, 1.4, wall, [x, 0.04, -1.35]);
    if (v === 2) b.box(w + 0.1, 0.05, 1.5, '#d6d2c8', [x, 0.04 + h + 0.025, -1.35]);
    else gableRoof(b, w, 1.4, 0.38, roof, [x, 0.04 + h, -1.35], false, 0.1);
    for (const z of [-0.95, -1.6]) {
      win(b, g, x + w / 2 + 0.005, 0.04 + h * 0.55, z, 0.2, 0.22, '+x');
      win(b, g, x - w / 2 - 0.005, 0.04 + h * 0.55, z, 0.2, 0.22, '-x');
    }
    // quintal: árvore, varal com roupa, horta e churrasqueira
    tree(b, 0.65, -2.55, 0.2);
    for (const px of [-0.75, -0.1]) b.box(0.03, 0.32, 0.03, DARK, [px, 0.18, -2.6]);
    b.box(0.65, 0.008, 0.008, WHITE, [-0.43, 0.32, -2.6]);
    for (let k = 0; k < 3; k++) a.box(0.11, 0.12, 0.008, '#ffffff', [-0.65 + k * 0.2, 0.25, -2.6]);
    b.box(0.6, 0.06, 0.35, '#5a4632', [-0.4, 0.05, -2.2]);
    for (let k = 0; k < 4; k++) b.sphere(0.05, '#5d9447', [-0.6 + k * 0.13, 0.1, -2.2], [1, 0.7, 1], 4);
    b.box(0.14, 0.18, 0.12, '#9a5a44', [0.2, 0.13, -2.75]);
  } else if (kind === 'com') {
    walls(b, 1.4, 0.55, 1.4, '#cfc8bb', [0, 0.04, -1.45]);
    b.box(1.46, 0.06, 1.46, '#9aa0a6', [0, 0.62, -1.45]);
    rollDoor(b, 0.3, -2.155, 0.5, 0.36);
    a.box(0.6, 0.06, 0.02, '#ffffff', [0.3, 0.48, -2.16]);
    g.box(0.02, 0.14, 0.6, '#ffffff', [0.705, 0.4, -1.45]);
    acUnit(b, -0.3, 0.7, -1.6);
    b.box(1.8, 0.012, 0.6, '#5a5d61', [0, 0.045, -2.6]);
    car(b, g, -0.45, -2.6, CARS[(v + 3) % CARS.length]!, true);
    car(b, g, 0.45, -2.6, CARS[(v + 1) % CARS.length]!, true);
  } else {
    walls(b, 1.6, 0.6, 1.5, '#b9b3a6', [0, 0.04, -1.35], '#6e6a63', '#8e959c');
    ribs(b, 0.805, 0.34, -1.35, 1.48, 0.56, '+x');
    ribs(b, -0.805, 0.34, -1.35, 1.48, 0.56, '-x');
    b.box(1.66, 0.06, 1.56, '#7d858c', [0, 0.67, -1.35]);
    a.box(0.02, 0.1, 1.2, '#ffffff', [-0.82, 0.52, -1.35]);
    for (let k = 0; k < 8; k++) b.box(0.03, 0.24, 0.03, DARK, [-0.95 + k * 0.27, 0.16, -2.92]);
    b.box(1.9, 0.02, 0.02, DARK, [0, 0.27, -2.92]);
    b.box(0.26, 0.24, 0.5, '#e6e3dc', [-0.4, 0.18, -2.45]);
    b.box(0.24, 0.2, 0.2, CARS[v % CARS.length]!, [-0.4, 0.14, -2.1]);
    b.box(0.5, 0.2, 0.22, '#b5452f', [0.45, 0.14, -2.5]);
    pallets(b, 0.45, -2.15);
  }
  return l.build();
}

// ------------------------------------------------------------------ catálogo

export type LotKind = 'res' | 'com' | 'ind';

const cache = new Map<string, ModelLayers>();

/** Modelo de um lote (cacheado): setor, variação (0..3) e nível (2 = prédio residencial). */
export function lotModel(kind: LotKind, variant: number, level: number): ModelLayers {
  const key = `${kind}:${variant}:${level}`;
  let m = cache.get(key);
  if (m) return m;
  const v = ((variant % 4) + 4) % 4;
  if (kind === 'res') m = level >= 2 ? apartamentos(v) : [sobrado, bangalo, moderna, geminadas][v]!(v);
  else if (kind === 'com') m = [mercadinho, posto, lanchonete, escritorios][v]!(v);
  else m = [denteDeSerra, quimica, logistica, cimento][v]!(v);
  cache.set(key, m);
  return m;
}

/** Parte de trás do lote fundo (cacheada). */
export function lotBackModel(kind: LotKind, variant: number, level: number): ModelLayers {
  const key = `back:${kind}:${variant}:${level}`;
  let m = cache.get(key);
  if (!m) cache.set(key, (m = backPart(kind, ((variant % 4) + 4) % 4, level)));
  return m;
}

export function disposeLotModels(): void {
  for (const m of cache.values()) for (const g of [m.body, m.accent, m.glass]) g.dispose();
  cache.clear();
}
