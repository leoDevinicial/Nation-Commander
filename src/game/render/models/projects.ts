import { C, layers } from './kit.ts';
import type { BuildingModel } from './buildingModels.ts';

/**
 * Grandes Projetos Nacionais (lote 2, item 13): construções de fim de partida, maiores e mais
 * marcantes que as demais. O foguete do Programa Espacial não faz parte do modelo: ele é animado à
 * parte (fica na plataforma até o lançamento e sobe com a contagem).
 */
type Built = Omit<BuildingModel, 'detail'>;

const WHITE = '#e6e8e6';
const STEEL = '#9aa1a8';
const DARK = '#3a3f45';
const ORANGE = '#c8642c';

/** Usina Nuclear (3×3): duas torres de resfriamento, reator em cúpula e casa de turbinas. */
export function buildNuclearPlant(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(5.6, 0.16, 5.6, C.concreteDark, [0, 0.08, 0]);
  // torres de resfriamento (hiperboloide aproximado por troncos de cone)
  for (const [x, z] of [
    [-1.55, -1.3],
    [-1.55, 1.3],
  ] as const) {
    b.cyl(0.95, 1.25, 1.6, C.concreteLight, [x, 0.95, z], undefined, 18);
    b.cyl(0.85, 0.95, 1.2, C.concreteLight, [x, 2.35, z], undefined, 18);
    b.cyl(0.92, 0.85, 0.5, C.concreteLight, [x, 3.2, z], undefined, 18);
    b.cyl(0.8, 0.8, 0.05, DARK, [x, 3.46, z], undefined, 18);
    a.cyl(1.0, 1.0, 0.12, '#ffffff', [x, 2.9, z], undefined, 18);
  }
  // reator: cilindro com cúpula
  b.cyl(0.9, 0.9, 1.4, WHITE, [1.2, 0.86, -1.0], undefined, 16);
  b.sphere(0.9, WHITE, [1.2, 1.56, -1.0], [1, 0.75, 1], 14);
  // casa de turbinas e subestação
  b.box(2.0, 1.1, 1.5, C.concrete, [1.25, 0.71, 1.3]);
  b.box(2.1, 0.08, 1.6, C.roof, [1.25, 1.3, 1.3]);
  for (let i = 0; i < 4; i++) g.box(0.32, 0.36, 0.02, '#ffffff', [0.55 + i * 0.47, 0.85, 2.06]);
  for (const x of [2.3, 2.6]) b.box(0.08, 1.4, 0.08, STEEL, [x, 0.86, -2.2]);
  b.box(0.7, 0.06, 0.06, STEEL, [2.45, 1.5, -2.2]);
  a.box(1.2, 0.18, 0.03, '#ffffff', [1.25, 1.05, 2.06]);
  return { base: l.build(), moving: null, height: 3.5, smoke: [[-1.55, 3.5, -1.3], [-1.55, 3.5, 1.3]] };
}

/** Rede 5G Nacional (2×2): torre treliçada alta com painéis de antena e prédio de equipamentos. */
export function buildNetwork5g(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.6, 0.14, 3.6, C.concreteDark, [0, 0.07, 0]);
  b.box(1.4, 0.8, 1.0, C.concreteLight, [-0.9, 0.54, 0.95]);
  g.box(0.9, 0.24, 0.02, '#ffffff', [-0.9, 0.6, 1.46]);
  const h = 6.2;
  // torre: quatro montantes convergindo e travamentos
  for (const [x, z] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ] as const) {
    b.box(0.07, h, 0.07, STEEL, [x * 0.55 + 0.6, h / 2, z * 0.55 - 0.6], [z * 0.08, 0, -x * 0.08]);
  }
  for (let y = 0.8; y < h - 0.5; y += 0.9) {
    const w = 0.6 * (1 - (y / h) * 0.55);
    b.box(w, 0.04, 0.04, STEEL, [0.6, y, -0.6 + w / 2]);
    b.box(w, 0.04, 0.04, STEEL, [0.6, y, -0.6 - w / 2]);
    b.box(0.04, 0.04, w, STEEL, [0.6 + w / 2, y, -0.6]);
    b.box(0.04, 0.04, w, STEEL, [0.6 - w / 2, y, -0.6]);
  }
  // painéis de antena em três alturas, nos quatro lados
  for (const y of [h - 0.4, h - 1.3, h - 2.2]) {
    for (const [dx, dz, w, d] of [
      [0.25, 0, 0.05, 0.22],
      [-0.25, 0, 0.05, 0.22],
      [0, 0.25, 0.22, 0.05],
      [0, -0.25, 0.22, 0.05],
    ] as const)
      b.box(w, 0.55, d, WHITE, [0.6 + dx, y, -0.6 + dz]);
  }
  a.box(0.12, 0.3, 0.12, '#ffffff', [0.6, h + 0.15, -0.6]);
  return { base: l.build(), moving: null, height: h + 0.3 };
}

/** Hidrelétrica (3×3): paredão de concreto curvo, comportas, casa de força e linhas de transmissão. */
export function buildHydroDam(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(5.6, 0.14, 5.6, C.concreteDark, [0, 0.07, 0]);
  // paredão: segmentos inclinados formando um arco, mais alto no meio
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.78;
    const z = -1.4 + (i * i) * 0.05;
    b.box(0.8, 2.2, 0.9, C.concreteLight, [x, 1.17, z], [0.12, -i * 0.06, 0]);
  }
  b.box(5.6, 0.12, 0.6, C.concrete, [0, 2.32, -1.1]);
  // comportas (vertedouro) com água escura descendo
  for (const x of [-0.8, 0, 0.8]) {
    b.box(0.5, 0.9, 0.08, DARK, [x, 1.5, -0.88]);
    g.box(0.44, 1.2, 0.02, '#ffffff', [x, 0.75, -0.78]);
  }
  // casa de força a jusante
  b.box(3.0, 0.9, 1.3, C.concrete, [0, 0.6, 0.6]);
  b.box(3.1, 0.07, 1.4, C.roof, [0, 1.08, 0.6]);
  for (let i = 0; i < 5; i++) g.box(0.3, 0.3, 0.02, '#ffffff', [-1.2 + i * 0.6, 0.7, 1.26]);
  // torres de transmissão
  for (const x of [-2.2, 2.2]) {
    b.box(0.07, 2.4, 0.07, STEEL, [x, 1.27, 1.9]);
    b.box(0.9, 0.05, 0.05, STEEL, [x, 2.3, 1.9]);
  }
  a.box(1.6, 0.16, 0.03, '#ffffff', [0, 0.95, 1.26]);
  return { base: l.build(), moving: null, height: 2.6 };
}

/**
 * Centro Financeiro (2×2), no estilo de um edifício corporativo moderno: torre de escritórios com
 * faixas de vidro e lajes claras, moldura saliente com jardim na fachada, cobertura envidraçada,
 * pódio de chapa metálica com parede verde na entrada, edifício-garagem aberto ao lado e
 * palmeiras na calçada. A faixa no alto do pódio leva a cor da facção (sem letreiro).
 */
export function buildFinancialCenter(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const SLAB = '#cfd2d4';
  const FRAME = '#8d9297';
  const METAL = '#a7abae';
  const GREEN = '#2e6a4a';
  const PALM = '#3f7a3a';
  b.box(3.7, 0.12, 3.7, C.concreteDark, [0, 0.06, 0]);
  b.box(3.7, 0.03, 0.45, C.concreteLight, [0, 0.135, 1.6]);

  // --- torre de escritórios: térreo envidraçado recuado e cinco andares com faixas de vidro
  const tx = -0.45;
  const tw = 2.3;
  const td = 1.7;
  const tz = -0.15;
  const ground = 0.12;
  const lobby = 0.45;
  const floorH = 0.36;
  const floors = 5;
  b.box(tw - 0.3, lobby, td - 0.3, DARK, [tx, ground + lobby / 2, tz]);
  g.box(tw - 0.32, lobby * 0.85, 0.02, '#ffffff', [tx, ground + lobby / 2, tz + (td - 0.3) / 2 + 0.01]);
  for (let i = 0; i < floors; i++) {
    const y0 = ground + lobby + i * floorH;
    // núcleo escuro (sombra atrás do vidro) e as quatro fachadas de vidro
    b.box(tw - 0.08, floorH, td - 0.08, '#3b4247', [tx, y0 + floorH / 2, tz]);
    g.box(tw - 0.1, floorH * 0.78, 0.02, '#ffffff', [tx, y0 + floorH * 0.5, tz + td / 2 - 0.03]);
    g.box(tw - 0.1, floorH * 0.78, 0.02, '#ffffff', [tx, y0 + floorH * 0.5, tz - td / 2 + 0.03]);
    g.box(0.02, floorH * 0.78, td - 0.1, '#ffffff', [tx - tw / 2 + 0.03, y0 + floorH * 0.5, tz]);
    g.box(0.02, floorH * 0.78, td - 0.1, '#ffffff', [tx + tw / 2 - 0.03, y0 + floorH * 0.5, tz]);
    // laje clara saliente em volta de cada andar
    b.box(tw + 0.04, 0.05, td + 0.04, SLAB, [tx, y0 + 0.025, tz]);
  }
  const top = ground + lobby + floors * floorH;
  b.box(tw + 0.06, 0.08, td + 0.06, SLAB, [tx, top + 0.04, tz]);
  // montantes verticais finos na fachada principal
  for (let k = 0; k <= 8; k++) b.box(0.025, floors * floorH, 0.03, FRAME, [tx - tw / 2 + 0.05 + (k * (tw - 0.1)) / 8, ground + lobby + (floors * floorH) / 2, tz + td / 2 - 0.01]);
  // moldura saliente com jardim (andares 2 a 3), como uma vitrine na fachada
  const fy = ground + lobby + 1.5 * floorH;
  const fh = floorH * 2 - 0.04;
  const fz = tz + td / 2 + 0.12;
  b.box(0.82, 0.07, 0.26, SLAB, [tx, fy + fh / 2, fz]);
  b.box(0.82, 0.07, 0.26, SLAB, [tx, fy - fh / 2, fz]);
  b.box(0.07, fh, 0.26, SLAB, [tx - 0.38, fy, fz]);
  b.box(0.07, fh, 0.26, SLAB, [tx + 0.38, fy, fz]);
  b.box(0.7, fh - 0.08, 0.02, GREEN, [tx, fy, fz - 0.1]);
  b.box(0.68, 0.06, 0.2, PALM, [tx, fy - fh / 2 + 0.06, fz]);

  // --- cobertura: andar envidraçado recuado, laje de cobertura e casas de máquinas
  b.box(1.5, 0.3, 1.1, '#3b4247', [tx - 0.25, top + 0.23, tz - 0.1]);
  g.box(1.46, 0.24, 0.02, '#ffffff', [tx - 0.25, top + 0.23, tz + 0.46]);
  b.box(1.7, 0.1, 1.25, METAL, [tx - 0.25, top + 0.43, tz - 0.1]);
  b.box(0.55, 0.32, 0.5, SLAB, [tx + 0.7, top + 0.24, tz - 0.3]);
  for (const x of [tx + 0.55, tx + 0.85]) b.box(0.18, 0.1, 0.18, FRAME, [x, top + 0.13, tz + 0.45]);

  // --- pódio frontal de chapa perfurada, com parede verde na entrada e faixa da facção
  const pz = tz + td / 2 + 0.3;
  b.box(2.0, 0.55, 0.6, METAL, [tx - 0.15, ground + 0.275, pz]);
  for (let k = 0; k < 4; k++) b.box(2.02, 0.012, 0.61, FRAME, [tx - 0.15, ground + 0.1 + k * 0.12, pz]);
  b.box(0.9, 0.38, 0.02, GREEN, [tx + 0.25, ground + 0.22, pz + 0.31]);
  g.box(0.6, 0.26, 0.02, '#ffffff', [tx - 0.75, ground + 0.2, pz + 0.31]);
  b.box(2.1, 0.05, 0.7, SLAB, [tx - 0.15, ground + 0.575, pz]);
  a.box(2.0, 0.06, 0.02, '#ffffff', [tx - 0.15, ground + 0.5, pz + 0.315]);

  // --- edifício-garagem aberto ao lado: lajes, pilares, guarda-corpos e carros
  const gx = 1.3;
  const gw = 0.85;
  const gd = 2.6;
  const gz = -0.05;
  const decks = 5;
  const deckH = 0.36;
  b.box(gw - 0.1, decks * deckH, gd - 0.1, '#2d3236', [gx, ground + (decks * deckH) / 2, gz]);
  for (let i = 0; i <= decks; i++) {
    const y = ground + i * deckH;
    b.box(gw, 0.05, gd, SLAB, [gx, y + 0.025, gz]);
    if (i > 0) {
      b.box(gw, 0.025, 0.02, FRAME, [gx, y - deckH / 2, gz + gd / 2]);
      b.box(0.02, 0.025, gd, FRAME, [gx - gw / 2, y - deckH / 2, gz]);
    }
  }
  for (const x of [gx - gw / 2 + 0.03, gx + gw / 2 - 0.03])
    for (let k = 0; k <= 5; k++) b.box(0.05, decks * deckH, 0.05, SLAB, [x, ground + (decks * deckH) / 2, gz - gd / 2 + 0.03 + (k * (gd - 0.06)) / 5]);
  const cars = ['#d8d8d8', '#2c3e66', '#9b2a2a', '#e2e2e2', '#3a3a3a'];
  for (let k = 0; k < 5; k++) b.box(0.16, 0.07, 0.3, cars[k]!, [gx + (k % 2 ? 0.18 : -0.18), ground + decks * deckH + 0.085, gz - 0.9 + k * 0.42]);

  // --- palmeiras na calçada
  for (const x of [-1.55, -1.15, 0.25, 0.6]) {
    b.cyl(0.025, 0.035, 0.55, '#8a6b48', [x, 0.42, 1.55], undefined, 6);
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2;
      b.box(0.32, 0.015, 0.08, PALM, [x + Math.cos(ang) * 0.13, 0.69, 1.55 + Math.sin(ang) * 0.13], [0, -ang, -0.35]);
    }
  }
  return { base: l.build(), moving: null, height: top + 0.5 };
}

/** Programa Espacial (4×4): plataforma, torre de serviço, centro de controle e antena de rastreio. */
export function buildSpaceCenter(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(7.6, 0.16, 7.6, C.concreteDark, [0, 0.08, 0]);
  // plataforma de lançamento com fosso de chamas
  b.box(3.2, 0.5, 3.2, C.concrete, [1.4, 0.41, -1.4]);
  b.box(1.0, 0.52, 1.0, DARK, [1.4, 0.42, -1.4]);
  b.box(3.0, 0.3, 0.9, C.concrete, [1.4, 0.3, -3.1]);
  // torre de serviço vermelha ao lado do foguete, com braços
  const th = 5.4;
  for (const [x, z] of [
    [0, 0],
    [0.6, 0],
    [0, 0.6],
    [0.6, 0.6],
  ] as const)
    b.box(0.08, th, 0.08, ORANGE, [0.05 + x, th / 2 + 0.6, -0.55 - z]);
  for (let y = 1.2; y < th; y += 0.8) {
    b.box(0.7, 0.05, 0.05, ORANGE, [0.35, y, -0.55]);
    b.box(0.7, 0.05, 0.05, ORANGE, [0.35, y, -1.15]);
  }
  for (const y of [2.6, 4.2]) b.box(0.75, 0.08, 0.12, STEEL, [0.95, y, -0.85]);
  // centro de controle
  b.box(2.8, 1.0, 1.8, WHITE, [-1.9, 0.66, 2.0]);
  b.box(2.9, 0.08, 1.9, C.roof, [-1.9, 1.2, 2.0]);
  for (let i = 0; i < 6; i++) g.box(0.3, 0.32, 0.02, '#ffffff', [-3.0 + i * 0.44, 0.75, 2.91]);
  // antena de rastreio
  b.cyl(0.08, 0.12, 1.2, STEEL, [2.4, 0.76, 2.2], undefined, 8);
  b.sphere(0.85, WHITE, [2.4, 1.6, 2.2], [1, 0.35, 1], 14);
  // hangar de montagem
  b.box(1.9, 2.0, 1.6, C.concreteLight, [-2.2, 1.16, -1.9]);
  b.box(1.4, 1.6, 0.02, DARK, [-2.2, 0.96, -1.09]);
  a.box(1.9, 0.25, 0.03, '#ffffff', [-2.2, 1.9, -1.09]);
  return { base: l.build(), moving: null, height: th + 0.6 };
}

/** Posição do foguete na plataforma do Programa Espacial (referencial do modelo). */
export const SPACE_PAD: [number, number, number] = [1.4, 0.68, -1.4];

/** Obstáculo antitanque (1×1): três ouriços de aço e uma mureta de sacos de areia. */
export function buildTankTrap(): Built {
  const l = layers();
  const { body: b } = l;
  for (const [x, z] of [
    [-0.45, -0.35],
    [0.4, -0.3],
    [0, 0.4],
  ] as const) {
    // ouriço tcheco: três vigas cruzadas
    b.box(0.08, 0.08, 0.85, '#4a4d50', [x, 0.32, z], [0.7, 0, 0]);
    b.box(0.08, 0.08, 0.85, '#4a4d50', [x, 0.32, z], [-0.7, 0, 0]);
    b.box(0.85, 0.08, 0.08, '#4a4d50', [x, 0.32, z], [0, 0, 0.7]);
  }
  for (let i = 0; i < 5; i++) b.box(0.32, 0.14, 0.2, C.sandbag, [-0.66 + i * 0.33, 0.08, 0.82]);
  for (let i = 0; i < 4; i++) b.box(0.32, 0.14, 0.2, C.sandbag, [-0.5 + i * 0.33, 0.21, 0.82]);
  return { base: l.build(), moving: null, height: 0.7 };
}
