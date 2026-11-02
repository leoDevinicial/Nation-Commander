import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { strut } from './rigging.ts';

/**
 * Lotes privados do zoneamento (02/11): uma célula (2×2 unidades), frente para +z (a camada vira o lote para a
 * estrada mais próxima). Low poly no mesmo kit das construções; a camada `accent` leva a cor da nação (toldos,
 * placas, letreiros), a `glass`, as janelas (acesas à noite). Cada modelo fica entre ~300 e ~1.100 triângulos,
 * porque uma cidade pode ter centenas de lotes.
 *
 * - Residencial: sobrado, bangalô com garagem, casa moderna com piscina, casas geminadas; prédios de apartamentos (2).
 * - Comercial: mercadinho com toldo, posto de gasolina, lanchonete com mesas, prédio de escritórios com lojas.
 * - Industrial: galpão de telhado em dente de serra, química com tanques, centro logístico, fábrica de cimento.
 */
type V3 = [number, number, number];

const DARK = '#3a3f45';
const STEEL = '#9aa1a8';
const WHITE = '#efece4';
const LAWN = '#62914c';
const PAVE = '#a9a397';
const WALLS = ['#e8d9b5', '#cfe0e8', '#f0c9a6', '#d9e3c4'];

// ------------------------------------------------------------------ peças

function win(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number, w = 0.2, h = 0.22): void {
  b.box(w + 0.05, h + 0.05, 0.02, WHITE, [x, y, z]);
  g.box(w, h, 0.02, '#ffffff', [x, y, z + 0.008]);
}

function winX(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number, w = 0.2, h = 0.22, s = 1): void {
  b.box(0.02, h + 0.05, w + 0.05, WHITE, [x, y, z]);
  g.box(0.02, h, w, '#ffffff', [x + s * 0.008, y, z]);
}

function door(b: PartBuilder, x: number, z: number, color = '#5a3e2b', w = 0.18): void {
  b.box(w, 0.32, 0.02, color, [x, 0.22, z]);
  b.box(w + 0.06, 0.03, 0.03, WHITE, [x, 0.39, z]);
}

function tree(b: PartBuilder, x: number, z: number, r = 0.2): void {
  b.cyl(0.025, 0.035, 0.28, '#6b5038', [x, 0.2, z], undefined, 5);
  b.sphere(r, '#4f7f3e', [x, 0.36 + r * 0.7, z], [1, 0.9, 1], 6);
}

function car(b: PartBuilder, g: PartBuilder, x: number, z: number, color: string, alongX = true): void {
  const [w, d] = alongX ? [0.5, 0.24] : [0.24, 0.5];
  b.box(w, 0.1, d, color, [x, 0.14, z]);
  b.box(alongX ? 0.28 : 0.2, 0.09, alongX ? 0.2 : 0.28, color, [x, 0.23, z]);
  g.box(alongX ? 0.29 : 0.21, 0.06, alongX ? 0.21 : 0.29, '#ffffff', [x, 0.235, z]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, 0.07, 0.04, C.rubber, [x + sx * (alongX ? 0.15 : 0.11), 0.1, z + sz * (alongX ? 0.11 : 0.15)]);
}

/** Lote: grama e calçada na frente (borda +z). */
function lotBase(b: PartBuilder, ground = LAWN): void {
  b.box(1.96, 0.04, 1.96, ground, [0, 0.02, 0]);
  b.box(1.96, 0.05, 0.28, PAVE, [0, 0.025, 0.84]);
}

/** Telhado de quatro águas sobre uma caixa w × d (cumeeira ao longo do lado maior). */
function hipRoof(b: PartBuilder, w: number, d: number, h: number, color: string, pos: V3): void {
  const [x, y, z] = pos;
  const along = w >= d;
  const r = Math.abs(w - d) / 2;
  b.convex(
    [
      [x - w / 2, y, z - d / 2],
      [x + w / 2, y, z - d / 2],
      [x - w / 2, y, z + d / 2],
      [x + w / 2, y, z + d / 2],
      along ? [x - r, y + h, z] : [x, y + h, z - r],
      along ? [x + r + 0.001, y + h, z] : [x, y + h, z + r + 0.001],
    ],
    color,
  );
}

// ------------------------------------------------------------------ residencial

/** Sobrado de dois andares com varanda, chaminé, cerca e árvore. */
function sobrado(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b);
  const wall = WALLS[v % WALLS.length]!;
  b.box(1.1, 0.9, 0.9, wall, [0, 0.49, -0.15]);
  b.box(1.14, 0.04, 0.94, WHITE, [0, 0.5, -0.15]);
  b.gable(1.2, 1.0, 0.42, C.roofRed, [0, 0.94, -0.15]);
  b.box(0.14, 0.4, 0.14, '#8a5a44', [0.35, 1.15, -0.3]); // chaminé
  for (const x of [-0.3, 0.3]) {
    win(b, g, x, 0.3, 0.305);
    win(b, g, x, 0.72, 0.305);
  }
  door(b, 0, 0.305);
  b.box(0.7, 0.03, 0.25, WHITE, [0, 0.52, 0.42]); // varanda
  for (const x of [-0.32, 0.32]) b.box(0.03, 0.48, 0.03, WHITE, [x, 0.28, 0.53]);
  a.box(0.7, 0.05, 0.03, '#ffffff', [0, 0.56, 0.54]);
  for (let i = 0; i < 9; i++) b.box(0.03, 0.14, 0.03, WHITE, [-0.9 + i * 0.225, 0.11, 0.68]); // cerca
  b.box(1.8, 0.025, 0.02, WHITE, [0, 0.16, 0.68]);
  tree(b, -0.72, 0.15);
  return l.build();
}

/** Bangalô térreo com telhado de quatro águas, garagem e carro na entrada. */
function bangalo(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b);
  b.box(1.2, 0.55, 0.95, WALLS[(v + 1) % WALLS.length]!, [-0.28, 0.32, -0.2]);
  hipRoof(b, 1.36, 1.1, 0.36, '#6d5a4a', [-0.28, 0.6, -0.2]);
  b.box(1.36, 0.03, 1.1, '#5f4f42', [-0.28, 0.6, -0.2]); // beiral
  for (const x of [-0.6, 0.0]) win(b, g, x, 0.33, 0.265, 0.24, 0.2);
  door(b, -0.3, 0.265);
  // garagem com porta basculante
  b.box(0.55, 0.45, 0.8, '#d5cfc2', [0.62, 0.27, -0.25]);
  b.box(0.6, 0.04, 0.85, '#5f4f42', [0.62, 0.51, -0.25]);
  b.box(0.42, 0.32, 0.02, '#c0c4c8', [0.62, 0.21, 0.155]);
  for (let i = 0; i < 4; i++) b.box(0.42, 0.01, 0.025, '#9aa0a6', [0.62, 0.1 + i * 0.08, 0.162]);
  b.box(0.5, 0.045, 0.7, PAVE, [0.62, 0.03, 0.5]); // entrada
  car(b, g, 0.62, 0.48, ['#b93a2e', '#2f5f8a', '#e0e0d8', '#3f7a46'][v % 4]!, false);
  a.box(0.08, 0.18, 0.08, '#ffffff', [-0.85, 0.13, 0.6]); // caixa de correio na cor da nação
  tree(b, -0.75, 0.55, 0.16);
  return l.build();
}

/** Casa moderna: volumes brancos sobrepostos, vidro grande, terraço e piscina. */
function moderna(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b);
  b.box(1.2, 0.5, 0.8, WHITE, [-0.2, 0.29, -0.35]);
  b.box(0.9, 0.42, 0.7, '#d8d4cc', [0.15, 0.75, -0.45]);
  b.box(1.0, 0.04, 0.85, '#4a4f55', [0.15, 0.98, -0.45]);
  b.box(1.3, 0.04, 0.9, '#4a4f55', [-0.2, 0.555, -0.35]);
  g.box(0.8, 0.36, 0.02, '#ffffff', [-0.35, 0.28, 0.055]); // vidro do térreo
  g.box(0.6, 0.28, 0.02, '#ffffff', [0.15, 0.75, -0.095]);
  b.box(0.06, 0.5, 0.82, '#8a6a45', [0.42, 0.29, -0.35]); // ripado de madeira
  a.box(0.3, 0.04, 0.02, '#ffffff', [0.15, 0.93, -0.088]);
  // piscina e deque
  b.box(0.9, 0.04, 0.55, '#c8b28e', [0.3, 0.05, 0.38]);
  b.box(0.7, 0.02, 0.38, '#5fb4d6', [0.3, 0.075, 0.38]);
  b.box(0.18, 0.04, 0.4, '#e8e4dc', [-0.55, 0.07, 0.4]); // espreguiçadeira
  tree(b, -0.75, 0.62, 0.15);
  return l.build();
}

/** Casas geminadas: duas unidades estreitas de cores diferentes com telhados íngremes. */
function geminadas(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b);
  for (const [k, x] of [
    [0, -0.42],
    [1, 0.42],
  ] as const) {
    const wall = WALLS[(v + k * 2) % WALLS.length]!;
    b.box(0.8, 0.85, 0.95, wall, [x, 0.47, -0.2]);
    b.gable(0.84, 1.0, 0.5, k ? '#4f5d6b' : C.roofRed, [x, 0.9, -0.2], Math.PI / 2);
    win(b, g, x - 0.17, 0.68, 0.28, 0.2, 0.2);
    win(b, g, x + 0.17, 0.68, 0.28, 0.2, 0.2);
    win(b, g, x + 0.17, 0.3, 0.28, 0.2, 0.2);
    door(b, x - 0.17, 0.28, k ? '#2f4a6a' : '#6a2f2f', 0.16);
    b.box(0.3, 0.06, 0.18, PAVE, [x - 0.17, 0.05, 0.4]); // degrau
    b.box(0.12, 0.25, 0.12, wall, [x + 0.25, 1.15, -0.4]); // chaminé
  }
  b.box(0.02, 0.85, 0.95, WHITE, [0, 0.47, -0.2]);
  a.box(0.2, 0.12, 0.02, '#ffffff', [-0.6, 0.48, 0.282]);
  for (const x of [-0.75, 0.75]) b.sphere(0.12, '#4a7a3a', [x, 0.12, 0.55], [1, 0.7, 1], 6); // arbustos
  return l.build();
}

/** Prédio de apartamentos: lâmina de 5 andares com varandas (v par) ou torre de 7 com coroamento (v ímpar). */
function apartamentos(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#7f9a6a');
  if (v % 2 === 0) {
    const floors = 5;
    const fh = 0.36;
    b.box(1.5, floors * fh, 1.1, WALLS[v % WALLS.length]!, [0, 0.05 + (floors * fh) / 2, -0.2]);
    for (let f = 0; f < floors; f++) {
      const y = 0.25 + f * fh;
      for (const x of [-0.5, 0, 0.5]) win(b, g, x, y, 0.355, 0.24, 0.2);
      if (f > 0) {
        b.box(1.5, 0.03, 0.18, WHITE, [0, y - 0.15, 0.44]); // varandas
        b.box(1.5, 0.08, 0.02, '#c9c5bb', [0, y - 0.1, 0.53]);
      }
      for (const z of [-0.5, 0.05]) winX(b, g, 0.755, y, z, 0.22, 0.2);
    }
    const top = 0.05 + floors * fh;
    b.box(1.56, 0.06, 1.16, WHITE, [0, top, -0.2]);
    b.box(0.4, 0.3, 0.3, '#b9b3a6', [-0.4, top + 0.18, -0.35]); // casa de máquinas
    b.cyl(0.14, 0.14, 0.2, '#6e8494', [0.35, top + 0.16, -0.4], undefined, 8); // caixa-d'água
    a.box(0.5, 0.12, 0.02, '#ffffff', [0, 0.18, 0.36]);
    g.box(0.4, 0.2, 0.02, '#ffffff', [0, 0.2, 0.355]);
  } else {
    const floors = 7;
    const fh = 0.32;
    b.box(1.1, floors * fh, 1.1, '#c7ccd1', [0, 0.05 + (floors * fh) / 2, -0.15]);
    for (let f = 0; f < floors; f++) {
      const y = 0.22 + f * fh;
      g.box(1.02, 0.16, 0.02, '#ffffff', [0, y, 0.405]);
      g.box(0.02, 0.16, 1.02, '#ffffff', [0.555, y, -0.15]);
      b.box(1.12, 0.03, 1.12, '#e6e3dc', [0, y - 0.12, -0.15]);
    }
    const top = 0.05 + floors * fh;
    b.box(0.8, 0.25, 0.8, '#aab0b6', [0, top + 0.12, -0.15]);
    b.box(0.5, 0.2, 0.5, '#e6e3dc', [0, top + 0.35, -0.15]);
    a.box(0.82, 0.06, 0.82, '#ffffff', [0, top + 0.02, -0.15]);
    strut(b, [0, top + 0.45, -0.15], [0, top + 0.8, -0.15], 0.02, DARK);
  }
  tree(b, -0.75, 0.62, 0.15);
  tree(b, 0.75, 0.62, 0.15);
  return l.build();
}

// ------------------------------------------------------------------ comercial

/** Mercadinho: loja térrea com vitrine, toldo listrado na cor da nação, letreiro e carro estacionado. */
function mercadinho(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, PAVE);
  b.box(1.6, 0.62, 1.0, WALLS[(v + 2) % WALLS.length]!, [0, 0.35, -0.4]);
  b.box(1.66, 0.08, 1.06, '#d8d4cc', [0, 0.7, -0.4]);
  g.box(1.1, 0.32, 0.02, '#ffffff', [-0.15, 0.27, 0.105]); // vitrine
  b.box(0.22, 0.38, 0.02, '#4a4f55', [0.6, 0.23, 0.105]);
  // toldo listrado: faixas na cor da nação alternadas com branco
  for (let i = 0; i < 6; i++) (i % 2 ? b : a).box(0.27, 0.025, 0.36, i % 2 ? WHITE : '#ffffff', [-0.67 + i * 0.27, 0.53, 0.27], [-0.35, 0, 0]);
  a.box(1.0, 0.2, 0.04, '#ffffff', [0, 0.85, 0.08]); // letreiro
  b.box(1.04, 0.24, 0.02, WHITE, [0, 0.85, 0.055]);
  b.box(0.3, 0.3, 0.3, '#8a6a45', [0.75, 0.2, 0.55]); // caixotes
  car(b, g, -0.45, 0.62, '#2f5f8a');
  return l.build();
}

/** Posto de gasolina: cobertura sobre colunas, bombas, lojinha de conveniência e totem de preços. */
function posto(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  for (const [x, z] of [
    [-0.55, -0.05],
    [0.25, -0.05],
    [-0.55, 0.5],
    [0.25, 0.5],
  ] as const)
    b.box(0.06, 0.62, 0.06, WHITE, [x, 0.35, z]);
  b.box(1.2, 0.08, 0.85, WHITE, [-0.15, 0.7, 0.22]);
  a.box(1.22, 0.06, 0.87, '#ffffff', [-0.15, 0.63, 0.22]); // faixa da cobertura na cor da nação
  for (const x of [-0.45, 0.15]) {
    b.box(0.12, 0.28, 0.1, '#e6e3dc', [x, 0.18, 0.22]);
    g.box(0.08, 0.06, 0.02, '#ffffff', [x, 0.26, 0.275]);
    b.box(0.2, 0.04, 0.6, '#8a8a8a', [x, 0.06, 0.22]);
  }
  b.box(0.55, 0.42, 0.6, '#e8e4dc', [0.65, 0.25, -0.55]); // conveniência
  g.box(0.4, 0.22, 0.02, '#ffffff', [0.65, 0.25, -0.245]);
  a.box(0.55, 0.06, 0.02, '#ffffff', [0.65, 0.44, -0.24]);
  b.box(0.05, 0.75, 0.05, DARK, [0.8, 0.4, 0.62]); // totem
  b.box(0.22, 0.32, 0.05, WHITE, [0.8, 0.72, 0.62]);
  a.box(0.22, 0.08, 0.06, '#ffffff', [0.8, 0.84, 0.62]);
  car(b, g, -0.15, 0.22, '#e0e0d8', false);
  return l.build();
}

/** Lanchonete: prédio baixo com letreiro grande, janelão, mesas com guarda-sóis na calçada. */
function lanchonete(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, PAVE);
  b.box(1.4, 0.6, 0.9, ['#b5612f', '#c9a227', '#7a3b3b', '#3f6b5a'][v % 4]!, [-0.1, 0.34, -0.45]);
  b.box(1.46, 0.06, 0.96, '#3a3f45', [-0.1, 0.67, -0.45]);
  g.box(1.0, 0.3, 0.02, '#ffffff', [-0.2, 0.3, 0.005]);
  b.box(0.2, 0.36, 0.02, '#2a2d31', [0.42, 0.22, 0.005]);
  a.box(0.9, 0.3, 0.06, '#ffffff', [-0.1, 0.88, -0.1]); // letreiro grande
  b.box(0.04, 0.24, 0.04, DARK, [-0.4, 0.7, -0.1]);
  b.box(0.04, 0.24, 0.04, DARK, [0.2, 0.7, -0.1]);
  // mesas com guarda-sol
  for (const [x, z] of [
    [-0.55, 0.45],
    [0.15, 0.45],
  ] as const) {
    b.cyl(0.14, 0.14, 0.02, WHITE, [x, 0.2, z], undefined, 8);
    b.cyl(0.015, 0.015, 0.2, DARK, [x, 0.1, z], undefined, 4);
    b.cyl(0.015, 0.015, 0.45, DARK, [x, 0.4, z], undefined, 4);
    a.cyl(0.0, 0.3, 0.12, '#ffffff', [x, 0.62, z], undefined, 8);
    for (const s of [-1, 1]) b.box(0.09, 0.12, 0.09, '#8a6a45', [x + s * 0.2, 0.08, z]);
  }
  b.box(0.3, 0.5, 0.3, '#6e7378', [0.7, 0.3, -0.6]); // exaustor
  return l.build();
}

/** Prédio comercial: lojas envidraçadas no térreo, dois andares de escritórios e outdoor no telhado. */
function escritorios(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, PAVE);
  b.box(1.6, 0.45, 1.2, '#d8d4cc', [0, 0.27, -0.3]);
  g.box(1.4, 0.3, 0.02, '#ffffff', [0, 0.25, 0.305]);
  for (const x of [-0.35, 0.35]) b.box(0.04, 0.45, 0.04, '#4a4f55', [x, 0.27, 0.31]);
  a.box(1.62, 0.07, 1.22, '#ffffff', [0, 0.52, -0.3]);
  b.box(1.5, 0.8, 1.1, '#9fb0bf', [0, 0.95, -0.3]);
  for (const y of [0.75, 1.15]) {
    g.box(1.42, 0.22, 0.02, '#ffffff', [0, y, 0.255]);
    g.box(0.02, 0.22, 1.02, '#ffffff', [0.755, y, -0.3]);
    b.box(1.52, 0.03, 1.12, '#e6e3dc', [0, y - 0.15, -0.3]);
  }
  b.box(1.56, 0.05, 1.16, '#e6e3dc', [0, 1.37, -0.3]);
  // outdoor
  for (const x of [-0.3, 0.3]) b.box(0.04, 0.3, 0.04, DARK, [x, 1.54, -0.55]);
  b.box(0.9, 0.34, 0.04, WHITE, [0, 1.82, -0.55]);
  a.box(0.8, 0.26, 0.05, '#ffffff', [0, 1.82, -0.54]);
  return l.build();
}

// ------------------------------------------------------------------ industrial

/** Galpão fabril com telhado em dente de serra, docas de carga e chaminé. */
function denteDeSerra(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  b.box(1.7, 0.55, 1.3, '#b9b3a6', [0, 0.32, -0.25]);
  for (let i = 0; i < 4; i++) {
    const x = -0.64 + i * 0.425;
    b.side(
      [
        [-0.21, 0],
        [0.21, 0],
        [0.21, 0.3],
      ],
      1.3,
      '#7d858c',
      [x, 0.595, -0.25],
    );
    g.box(0.02, 0.26, 1.24, '#ffffff', [x + 0.2, 0.74, -0.25]);
  }
  for (const x of [-0.45, 0.2]) {
    b.box(0.42, 0.34, 0.02, '#8a9097', [x, 0.24, 0.405]); // portas de doca
    b.box(0.5, 0.08, 0.2, '#6e7378', [x, 0.08, 0.5]);
  }
  a.box(1.2, 0.08, 0.02, '#ffffff', [0, 0.5, 0.407]);
  b.cyl(0.08, 0.1, 1.3, '#8a5a44', [0.7, 0.65, -0.75], undefined, 8);
  b.cyl(0.11, 0.11, 0.06, DARK, [0.7, 1.32, -0.75], undefined, 8);
  return l.build();
}

/** Química: dois tanques verticais, esfera, tubulação, casa de controle e tocha. */
function quimica(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  for (const [x, z, r, h] of [
    [-0.5, -0.45, 0.32, 0.95],
    [0.15, -0.5, 0.26, 1.15],
  ] as const) {
    b.cyl(r, r, h, '#dcdcd4', [x, 0.04 + h / 2, z], undefined, 12);
    b.cyl(r + 0.01, r + 0.01, 0.05, '#9aa0a6', [x, 0.04 + h, z], undefined, 12);
    a.cyl(r + 0.005, r + 0.005, 0.08, '#ffffff', [x, 0.04 + h * 0.6, z], undefined, 12);
    strut(b, [x + r, 0.05, z], [x + r, 0.04 + h, z], 0.02, STEEL);
  }
  b.sphere(0.24, '#e6e3dc', [0.65, 0.34, -0.1], undefined, 10);
  for (const s of [-1, 1]) b.box(0.03, 0.2, 0.03, STEEL, [0.65 + s * 0.15, 0.1, -0.1]);
  // tubos
  b.box(1.3, 0.05, 0.05, '#c9a43a', [0, 0.55, 0.05]);
  b.box(1.3, 0.05, 0.05, '#4a7a8a', [0, 0.47, 0.05]);
  for (const x of [-0.6, 0, 0.6]) b.box(0.04, 0.55, 0.04, STEEL, [x, 0.3, 0.05]);
  b.box(0.6, 0.35, 0.4, '#e8e4dc', [-0.45, 0.22, 0.45]); // controle
  g.box(0.4, 0.14, 0.02, '#ffffff', [-0.45, 0.26, 0.655]);
  b.cyl(0.03, 0.04, 1.4, STEEL, [0.75, 0.74, 0.5], undefined, 6); // tocha
  a.sphere(0.05, '#ffffff', [0.75, 1.47, 0.5], undefined, 6);
  return l.build();
}

/** Centro logístico: armazém grande com docas, caminhão encostado e contêineres empilhados. */
function logistica(v: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#8e8a82');
  b.box(1.4, 0.7, 1.1, '#c9c3b5', [-0.2, 0.39, -0.35]);
  b.box(1.46, 0.05, 1.16, '#7d858c', [-0.2, 0.765, -0.35]);
  for (let i = 0; i < 3; i++) b.box(0.3, 0.38, 0.02, '#8a9097', [-0.65 + i * 0.45, 0.24, 0.205]);
  a.box(1.0, 0.12, 0.02, '#ffffff', [-0.2, 0.6, 0.207]);
  g.box(0.02, 0.12, 0.6, '#ffffff', [0.505, 0.55, -0.35]);
  // caminhão na doca
  b.box(0.26, 0.24, 0.5, '#e6e3dc', [-0.65, 0.2, 0.5]);
  b.box(0.24, 0.2, 0.2, ['#b93a2e', '#2f5f8a', '#d6a92c', '#3f7a46'][v % 4]!, [-0.65, 0.17, 0.82]);
  g.box(0.22, 0.08, 0.02, '#ffffff', [-0.65, 0.22, 0.925]);
  // contêineres
  const cols = ['#b5452f', '#2f5f8a', '#3f7a46', '#d6a92c'];
  for (let k = 0; k < 4; k++) b.box(0.5, 0.2, 0.22, cols[(k + v) % 4]!, [0.6, 0.14 + Math.floor(k / 2) * 0.21, 0.15 + (k % 2) * 0.24]);
  return l.build();
}

/** Fábrica de cimento: dois silos grossos com anéis, prédio de moagem, forno rotativo, correia e betoneira. */
function cimento(): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  lotBase(b, '#9a968d');
  for (const x of [-0.62, -0.18]) {
    b.cyl(0.22, 0.22, 1.1, '#d5d2ca', [x, 0.66, -0.6], undefined, 12);
    b.cyl(0.0, 0.22, 0.2, '#d5d2ca', [x, 0.12, -0.6], [Math.PI, 0, 0], 12);
    for (const y of [0.45, 0.8]) b.cyl(0.225, 0.225, 0.03, '#a9a69e', [x, y, -0.6], undefined, 12);
    b.cyl(0.12, 0.23, 0.12, '#bdb9b0', [x, 1.27, -0.6], undefined, 12);
    for (const s of [-1, 1]) b.box(0.04, 0.3, 0.04, DARK, [x + s * 0.15, 0.12, -0.6]);
  }
  a.box(0.86, 0.12, 0.02, '#ffffff', [-0.4, 0.95, -0.37]);
  // prédio de moagem com janelas e telhado de duas águas
  b.box(0.7, 0.75, 0.55, '#c4bdb0', [0.45, 0.42, -0.5]);
  b.gable(0.74, 0.6, 0.2, '#7d858c', [0.45, 0.8, -0.5]);
  for (const y of [0.3, 0.6]) for (const x of [0.3, 0.6]) win(b, g, x, y, -0.218, 0.14, 0.14);
  b.cyl(0.07, 0.09, 0.9, '#9a6a54', [0.72, 1.15, -0.65], undefined, 8);
  // forno rotativo inclinado sobre apoios
  b.cyl(0.12, 0.12, 0.95, '#8a8580', [0.15, 0.32, 0.12], [0, 0, Math.PI / 2 - 0.08], 10);
  for (const x of [-0.2, 0.15, 0.5]) b.box(0.08, 0.22, 0.2, '#6e7378', [x, 0.14, 0.12]);
  strut(b, [-0.4, 0.15, 0.2], [-0.4, 1.1, -0.45], 0.06, '#5f666d'); // correia até os silos
  // pilhas de agregado e betoneira
  b.cyl(0.0, 0.26, 0.22, '#a5a093', [-0.62, 0.15, 0.45], undefined, 7);
  b.box(0.24, 0.16, 0.24, '#d6a92c', [0.6, 0.15, 0.6]);
  b.cyl(0.1, 0.12, 0.26, '#e6e3dc', [0.6, 0.27, 0.33], [Math.PI / 2 - 0.2, 0, 0], 8);
  b.box(0.26, 0.05, 0.5, DARK, [0.6, 0.07, 0.45]);
  return l.build();
}

// ------------------------------------------------------------------ lote fundo (02/11)

/**
 * Parte de trás do lote fundo (a célula atrás da frente, do lado oposto à rua), nas coordenadas da frente: ocupa
 * z de −1 a −3. A construção da frente continua para trás, mais comprida, sem mudar a fachada:
 * - casa: a mesma casa se estende (corpo, telhado e janelas laterais) até o quintal com árvore e varal;
 * - prédio: a lâmina continua em uma ala de fundos mais baixa, com estacionamento;
 * - loja: depósito de fundos com doca e estacionamento;
 * - indústria: o galpão se alonga, com pátio cercado e caminhão.
 */
function backPart(kind: LotKind, v: number, level: number): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const ground = kind === 'res' ? LAWN : kind === 'com' ? PAVE : '#8e8a82';
  b.box(1.96, 0.04, 1.96, ground, [0, 0.02, -2]);
  if (kind === 'res' && level >= 2) {
    b.box(1.2, 1.1, 1.3, WALLS[v % WALLS.length]!, [0, 0.6, -1.5]);
    b.box(1.26, 0.05, 1.36, WHITE, [0, 1.17, -1.5]);
    for (const z of [-1.2, -1.75]) for (const y of [0.35, 0.75]) winX(b, g, 0.605, y, z, 0.22, 0.2);
    for (const x of [-0.5, 0, 0.5]) b.box(0.3, 0.012, 0.5, '#d9d6cf', [x, 0.045, -2.55]); // vagas
    b.box(1.6, 0.012, 0.6, '#5a5d61', [0, 0.04, -2.55]);
  } else if (kind === 'res') {
    // a casa continua para trás: corpo e telhado da mesma cor, janelas nas laterais
    const wall = WALLS[(v + (v === 1 ? 1 : 0)) % WALLS.length]!;
    const roof = [C.roofRed, '#6d5a4a', '#4a4f55', C.roofRed][v % 4]!;
    const w = v === 3 ? 1.6 : 1.0;
    const h = v === 0 || v === 3 ? 0.9 : 0.5;
    b.box(w, h, 1.5, wall, [v === 1 ? -0.28 : 0, 0.04 + h / 2, -1.35]);
    if (v === 2) b.box(w + 0.1, 0.04, 1.6, '#4a4f55', [0, 0.04 + h + 0.02, -1.35]);
    else b.gable(w + 0.08, 1.56, 0.35, roof, [v === 1 ? -0.28 : 0, 0.04 + h, -1.35], Math.PI / 2);
    for (const z of [-0.9, -1.5]) {
      winX(b, g, (v === 1 ? -0.28 : 0) + w / 2 + 0.005, 0.04 + h * 0.55, z, 0.2, 0.2);
      winX(b, g, (v === 1 ? -0.28 : 0) - w / 2 - 0.005, 0.04 + h * 0.55, z, 0.2, 0.2, -1);
    }
    // quintal: árvore, varal e horta
    tree(b, 0.6, -2.5, 0.2);
    for (const x of [-0.7, -0.1]) b.box(0.03, 0.3, 0.03, DARK, [x, 0.17, -2.55]);
    b.box(0.6, 0.01, 0.01, WHITE, [-0.4, 0.3, -2.55]);
    for (let k = 0; k < 3; k++) a.box(0.1, 0.12, 0.01, '#ffffff', [-0.6 + k * 0.2, 0.24, -2.55]);
    b.box(0.6, 0.05, 0.35, '#5a4632', [-0.4, 0.05, -2.2]);
  } else if (kind === 'com') {
    b.box(1.4, 0.55, 1.4, '#cfc8bb', [0, 0.31, -1.45]);
    b.box(1.46, 0.05, 1.46, '#9aa0a6', [0, 0.6, -1.45]);
    b.box(0.5, 0.36, 0.02, '#8a9097', [0.3, 0.22, -2.155]); // doca
    a.box(0.6, 0.06, 0.02, '#ffffff', [0.3, 0.45, -2.16]);
    g.box(0.02, 0.14, 0.6, '#ffffff', [0.705, 0.4, -1.45]);
    car(b, g, -0.45, -2.6, '#3f7a46');
    car(b, g, 0.45, -2.6, '#e0e0d8');
  } else {
    b.box(1.6, 0.6, 1.5, '#b9b3a6', [0, 0.34, -1.35]);
    b.box(1.66, 0.05, 1.56, '#7d858c', [0, 0.665, -1.35]);
    for (const z of [-0.9, -1.6]) g.box(0.02, 0.2, 0.4, '#ffffff', [0.805, 0.45, z]);
    a.box(0.02, 0.1, 1.2, '#ffffff', [-0.805, 0.5, -1.35]);
    for (let k = 0; k < 8; k++) b.box(0.03, 0.22, 0.03, DARK, [-0.95 + k * 0.27, 0.15, -2.9]); // cerca do pátio
    b.box(0.26, 0.22, 0.48, '#e6e3dc', [-0.4, 0.17, -2.45]);
    b.box(0.24, 0.2, 0.2, ['#b93a2e', '#2f5f8a', '#d6a92c', '#3f7a46'][v % 4]!, [-0.4, 0.14, -2.12]);
    b.box(0.5, 0.2, 0.22, '#b5452f', [0.45, 0.14, -2.5]);
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
