import * as THREE from 'three';
import { C, layers } from './kit.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';
import { railing, strut } from './rigging.ts';

/**
 * Grandes Projetos Nacionais (lote 2, item 13): construções de fim de partida, maiores e mais
 * marcantes que as demais. O foguete do Programa Espacial não faz parte do modelo: ele é animado à
 * parte (fica na plataforma até o lançamento e sobe com a contagem).
 */
type Built = Omit<BuildingModel, 'detail'>;

const WHITE = '#e6e8e6';
const STEEL = '#9aa1a8';
const DARK = '#3a3f45';

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

/**
 * Rede 5G Nacional (2×2), polo de telecomunicações em low poly:
 * - torre treliçada afunilada (quatro montantes que convergem de verdade, anéis, diagonais em X, plataformas e escada);
 * - topo com moldura triangular e três setores de antenas-painel, as unidades de rádio atrás delas, anel de LED na cor da
 *   nação e luz de balizamento; enlaces de micro-ondas (tambores) no meio da torre;
 * - data center com fachada de vidro e faixa acesa, e ventiladores de ar-condicionado no teto que giram;
 * - antena parabólica de satélite, postes de small cells 5G, armários de baterias, gerador, eletrocalha até a torre e
 *   cerca com portão.
 */
export function buildNetwork5g(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const TOWER = '#c3c9cf';
  const DARK = '#3a3f45';
  b.box(3.8, 0.14, 3.8, C.concreteDark, [0, 0.07, 0]);
  b.box(3.5, 0.02, 3.5, '#8f8b82', [0, 0.15, 0]);
  // cerca com portão na frente
  railing(b, [-1.85, -1.85], [1.85, -1.85], 0.14, 0.34, '#aab0b5', 6);
  railing(b, [-1.85, -1.85], [-1.85, 1.85], 0.14, 0.34, '#aab0b5', 6);
  railing(b, [1.85, -1.85], [1.85, 1.85], 0.14, 0.34, '#aab0b5', 6);
  railing(b, [-1.85, 1.85], [-0.4, 1.85], 0.14, 0.34, '#aab0b5', 3);
  railing(b, [0.5, 1.85], [1.85, 1.85], 0.14, 0.34, '#aab0b5', 3);

  // --- torre treliçada afunilada
  const [tx, tz] = [0.75, -0.75];
  const h = 6.4;
  const base = 0.62;
  const top = 0.2;
  const corner = (y: number, sx: number, sz: number): [number, number, number] => {
    const w = base + (top - base) * (y / h);
    return [tx + sx * w, 0.15 + y, tz + sz * w];
  };
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sz] of corners) {
    strut(b, corner(0, sx, sz), corner(h, sx, sz), 0.06, TOWER);
    b.box(0.2, 0.12, 0.2, C.concrete, [corner(0, sx, sz)[0], 0.2, corner(0, sx, sz)[2]]);
  }
  const step = 0.8;
  for (let y = 0; y < h - 0.1; y += step) {
    for (let k = 0; k < 4; k++) {
      const [sx, sz] = corners[k]!;
      const [nx, nz] = corners[(k + 1) % 4]!;
      // anel e diagonais em X em cada face
      strut(b, corner(y + step, sx, sz), corner(y + step, nx, nz), 0.03, TOWER);
      strut(b, corner(y, sx, sz), corner(Math.min(h, y + step), nx, nz), 0.022, '#aeb4ba');
      strut(b, corner(y, nx, nz), corner(Math.min(h, y + step), sx, sz), 0.022, '#aeb4ba');
    }
  }
  // plataformas de serviço e escada
  for (const y of [2.4, 4.6]) {
    const w = base + (top - base) * (y / h) + 0.14;
    b.box(w * 2, 0.04, w * 2, '#7d8287', [tx, 0.15 + y, tz]);
  }
  strut(b, [tx - base - 0.05, 0.15, tz + 0.1], [tx - top - 0.05, h + 0.15, tz + 0.1], 0.025, '#e0c040');
  // eletrocalha do data center até a torre
  strut(b, [-0.3, 1.2, 0.35], [tx - 0.3, 1.2, tz + 0.3], 0.06, DARK);
  // enlaces de micro-ondas: tambores no meio da torre, voltados para fora
  for (const [y, ang] of [
    [3.3, 0.6],
    [3.9, -2.2],
    [3.6, 2.4],
  ] as const) {
    const w = base + (top - base) * (y / h);
    const x = tx + Math.cos(ang) * (w + 0.2);
    const z = tz + Math.sin(ang) * (w + 0.2);
    b.cyl(0.26, 0.26, 0.16, '#e8ebec', [x, 0.15 + y, z], [0, -ang, Math.PI / 2], 14);
    b.cyl(0.23, 0.23, 0.02, '#cfd4d7', [x + Math.cos(ang) * 0.085, 0.15 + y, z + Math.sin(ang) * 0.085], [0, -ang, Math.PI / 2], 14);
  }

  // --- topo: moldura triangular, três setores de antenas-painel e unidades de rádio
  const headY = 0.15 + h - 0.2;
  b.cyl(0.42, 0.42, 0.05, '#7d8287', [tx, headY - 0.55, tz], undefined, 3);
  b.cyl(0.42, 0.42, 0.05, '#7d8287', [tx, headY + 0.45, tz], undefined, 3);
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const cx = tx + Math.cos(ang) * 0.36;
    const cz = tz + Math.sin(ang) * 0.36;
    for (const off of [-0.13, 0, 0.13]) {
      const px = cx - Math.sin(ang) * off;
      const pz = cz + Math.cos(ang) * off;
      b.box(0.06, 0.74, 0.12, '#f2f4f4', [px, headY, pz], [0, -ang, 0]);
      b.box(0.06, 0.16, 0.08, DARK, [px - Math.cos(ang) * 0.08, headY - 0.18, pz - Math.sin(ang) * 0.08], [0, -ang, 0]);
    }
  }
  // anel de LED na cor da nação, mastro e luz de balizamento
  a.cyl(0.3, 0.3, 0.08, '#ffffff', [tx, headY + 0.6, tz], undefined, 12);
  b.cyl(0.02, 0.03, 0.8, '#d9dcde', [tx, headY + 1.05, tz], undefined, 6);
  b.box(0.08, 0.08, 0.08, C.red, [tx, headY + 1.48, tz]);

  // --- data center: bloco com fachada de vidro, faixa acesa e casa de máquinas
  const [dx, dz] = [-0.85, 0.75];
  b.box(1.7, 1.1, 1.2, '#dfe3e6', [dx, 0.7, dz]);
  b.box(1.76, 0.06, 1.26, '#9aa1a8', [dx, 1.28, dz]);
  g.box(1.5, 0.5, 0.02, '#ffffff', [dx, 0.78, dz + 0.61]);
  for (let k = 0; k < 6; k++) b.box(0.02, 0.5, 0.03, '#9aa1a8', [dx - 0.75 + k * 0.3, 0.78, dz + 0.62]);
  a.box(1.5, 0.06, 0.02, '#ffffff', [dx, 1.12, dz + 0.61]);
  b.box(0.36, 0.5, 0.04, '#5d6166', [dx + 0.6, 0.4, dz + 0.61]);
  // ventiladores do ar-condicionado no teto (as hélices giram)
  for (const fx of [-0.35, 0.35]) {
    b.box(0.5, 0.18, 0.5, '#b8bec4', [dx + fx, 1.4, dz]);
    b.cyl(0.2, 0.2, 0.02, '#3a3f45', [dx + fx, 1.5, dz], undefined, 12);
  }
  // antena parabólica de satélite
  b.cyl(0.06, 0.09, 0.5, STEEL, [-1.2, 0.4, -1.1], undefined, 8);
  b.add(new THREE.SphereGeometry(0.42, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), '#eef0ee', { pos: [-1.2, 0.85, -1.1], rot: [Math.PI - 0.8, 0, 0.4] });
  b.cyl(0.015, 0.015, 0.4, DARK, [-1.12, 0.95, -0.98], [0.8, 0, 0], 5);
  // postes de small cells 5G
  for (const [x, z] of [
    [1.55, 1.3],
    [-1.55, -0.1],
    [0.2, 1.4],
  ] as const) {
    b.cyl(0.035, 0.05, 1.5, '#9aa1a8', [x, 0.9, z], undefined, 6);
    b.cyl(0.07, 0.07, 0.32, '#eef0ee', [x, 1.8, z], undefined, 8);
    a.cyl(0.072, 0.072, 0.04, '#ffffff', [x, 1.68, z], undefined, 8);
  }
  // armários de baterias e gerador
  for (const k of [0, 1, 2]) b.box(0.3, 0.5, 0.3, '#e4e7e9', [1.0 + k * 0.34, 0.4, 0.55]);
  for (const k of [0, 1, 2]) b.box(0.22, 0.03, 0.02, '#9aa1a8', [1.0 + k * 0.34, 0.5, 0.71]);
  b.box(0.7, 0.4, 0.4, '#5e6b55', [-1.3, 0.35, -0.2]);
  b.cyl(0.03, 0.03, 0.3, DARK, [-1.15, 0.65, -0.3], undefined, 6);

  // hélices dos ventiladores (anim)
  const fan = layers();
  for (let k = 0; k < 3; k++) fan.body.box(0.34, 0.012, 0.07, '#d4d9dd', [0, 0, 0], [0, (k * Math.PI) / 3, 0]);
  fan.body.cyl(0.04, 0.04, 0.03, '#3a3f45', [0, 0, 0], undefined, 8);
  const fanLayers = fan.build();
  const anims: ModelAnim[] = [-0.35, 0.35].map((fx) => ({ layers: fanLayers, pivot: [dx + fx, 1.53, dz] as [number, number, number], motion: { kind: 'spin', axis: 'y', speed: 6 } }));
  return { base: l.build(), moving: null, anims, height: h + 1.7 };
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

/** Centro da plataforma de lançamento (referencial do modelo): o foguete fica de pé aqui. */
export const SPACE_PAD: [number, number, number] = [1.1, 0.9, -1.0];
/** Pé da torre de lançamento: a torre fica a oeste do foguete e os braços apontam para +x. */
export const SPACE_TOWER: [number, number, number] = [SPACE_PAD[0] - 1.15, 0.16, SPACE_PAD[2]];
/** Altura da torre de lançamento. */
export const SPACE_TOWER_HEIGHT = 7.4;

/**
 * Programa Espacial (4×4), complexo de lançamento em low poly:
 * - plataforma elevada de concreto com fosso de chamas que leva o jato para fora (+x), defletor em cunha e canos do
 *   sistema de supressão por água;
 * - torre de lançamento em treliça de aço (montantes, anéis e diagonais em X), com plataformas, elevador, para-raios
 *   e guindaste no topo. Os braços móveis (acesso da tripulação e umbilicais) são animados à parte, com o foguete;
 * - fazenda de propelente: duas esferas (oxigênio líquido e querosene) com tubulação até a plataforma;
 * - caixa-d'água elevada da supressão acústica;
 * - prédio de montagem vertical com porta alta e faixa da nação, pista de transporte até a plataforma;
 * - centro de controle com janelas, bunker baixo e duas antenas de rastreio;
 * - torres para-raios nos cantos da plataforma.
 */
export function buildSpaceCenter(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const [px, py, pz] = SPACE_PAD;
  const SLAB = '#b9b5ab';
  const SOOT = '#2f3135';
  const RED = '#b5482a';
  b.box(7.6, 0.16, 7.6, C.concreteDark, [0, 0.08, 0]);
  // pista de transporte do prédio de montagem até a plataforma (duas faixas de brita)
  for (const dz of [-0.32, 0.32]) b.box(3.2, 0.02, 0.38, '#77746c', [-1.4, 0.17, pz + dz]);

  // --- plataforma: base facetada em octógono, rampas e o deck
  b.plan(
    [
      [px - 1.6, pz - 0.8],
      [px - 0.8, pz - 1.6],
      [px + 0.8, pz - 1.6],
      [px + 1.6, pz - 0.8],
      [px + 1.6, pz + 0.8],
      [px + 0.8, pz + 1.6],
      [px - 0.8, pz + 1.6],
      [px - 1.6, pz + 0.8],
    ],
    py - 0.16,
    C.concrete,
    [0, 0.16, 0],
  );
  b.box(2.2, 0.04, 2.2, SLAB, [px, py + 0.02, pz]);
  // mesa de lançamento: suporte do foguete com a abertura do jato e os grampos de retenção
  b.box(1.1, 0.22, 1.1, '#6f7378', [px, py + 0.13, pz]);
  b.box(0.7, 0.24, 0.7, SOOT, [px, py + 0.13, pz]);
  for (const [dx, dz] of [
    [0.42, 0.42],
    [-0.42, 0.42],
    [0.42, -0.42],
    [-0.42, -0.42],
  ] as const)
    b.box(0.12, 0.3, 0.12, '#5b5f63', [px + dx, py + 0.33, pz + dz]);
  // fosso de chamas: canal escuro que sai da plataforma para +x, defletor em cunha e parede chamuscada
  b.box(2.5, 0.05, 0.9, SOOT, [px + 1.6, 0.19, pz]);
  b.box(0.9, 0.3, 0.9, '#55524c', [px + 0.25, 0.32, pz], [0, 0, -0.55]);
  for (const dz of [-0.5, 0.5]) b.box(2.5, 0.42, 0.12, C.concreteDark, [px + 1.6, 0.37, pz + dz]);
  // canos da supressão por água ao redor da mesa
  for (const dz of [-0.62, 0.62]) b.cyl(0.045, 0.045, 1.3, STEEL, [px, py + 0.08, pz + dz], [0, 0, Math.PI / 2], 8);
  for (const dx of [-0.62, 0.62]) b.cyl(0.045, 0.045, 1.3, STEEL, [px + dx, py + 0.08, pz], [Math.PI / 2, 0, 0], 8);

  // --- torre de lançamento em treliça
  const [tx, ty, tz] = SPACE_TOWER;
  const th = SPACE_TOWER_HEIGHT;
  const w = 0.36;
  b.box(0.95, 0.12, 0.95, C.concreteDark, [tx, ty + 0.06 + 0.55, tz]);
  const base = py;
  for (const dx of [-w, w]) for (const dz of [-w, w]) b.box(0.07, th, 0.07, RED, [tx + dx, base + th / 2, tz + dz]);
  const step = 0.62;
  for (let y = base + 0.3; y < base + th; y += step) {
    for (const dz of [-w, w]) b.box(w * 2, 0.045, 0.045, RED, [tx, y, tz + dz]);
    for (const dx of [-w, w]) b.box(0.045, 0.045, w * 2, RED, [tx + dx, y, tz]);
    // diagonais em X nas faces de frente e de trás
    const len = Math.hypot(w * 2, step);
    const ang = Math.atan2(step, w * 2);
    for (const dz of [-w, w]) {
      b.box(len, 0.03, 0.03, '#9b3d23', [tx, y + step / 2, tz + dz], [0, 0, ang]);
      b.box(len, 0.03, 0.03, '#9b3d23', [tx, y + step / 2, tz + dz], [0, 0, -ang]);
    }
    for (const dx of [-w, w]) {
      b.box(0.03, 0.03, len, '#9b3d23', [tx + dx, y + step / 2, tz], [ang, 0, 0]);
    }
  }
  // plataformas de serviço, elevador e escada lateral
  for (const y of [base + 1.9, base + 3.6, base + 5.4]) b.box(1.0, 0.05, 1.0, '#7d8085', [tx, y, tz]);
  b.box(0.3, th * 0.92, 0.3, '#8d9196', [tx - w - 0.18, base + (th * 0.92) / 2, tz]);
  b.box(0.32, 0.32, 0.32, '#cfd2d4', [tx - w - 0.18, base + th * 0.6, tz]);
  // topo: casa de máquinas, guindaste e para-raios
  b.box(0.85, 0.35, 0.85, '#8a8e93', [tx, base + th + 0.18, tz]);
  b.box(1.6, 0.08, 0.1, RED, [tx + 0.45, base + th + 0.42, tz]);
  b.cyl(0.03, 0.03, 0.4, '#5b5f63', [tx + 1.1, base + th + 0.2, tz], undefined, 6);
  b.cyl(0.02, 0.035, 1.6, STEEL, [tx, base + th + 1.15, tz], undefined, 6);
  b.box(0.06, 0.06, 0.06, C.red, [tx, base + th + 1.98, tz]);
  a.box(0.74, 0.18, 0.012, '#ffffff', [tx, base + th - 0.6, tz + w + 0.02]);
  a.box(0.74, 0.18, 0.012, '#ffffff', [tx, base + th - 0.6, tz - w - 0.02]);

  // --- torres para-raios nos cantos da plataforma
  for (const [dx, dz] of [
    [1.5, 1.4],
    [-0.3, -1.6],
  ] as const) {
    b.cyl(0.05, 0.09, 6.6, '#c8cbcd', [px + dx, 0.16 + 3.3, pz + dz], undefined, 6);
    b.cyl(0.015, 0.015, 0.6, STEEL, [px + dx, 6.76 + 0.3, pz + dz], undefined, 4);
  }

  // --- fazenda de propelente: esferas de oxigênio líquido e de querosene, com a tubulação até a plataforma
  for (const [x, z, color] of [
    [3.0, 1.0, WHITE],
    [3.0, 2.7, '#c9c6bd'],
  ] as const) {
    for (const dx of [-0.32, 0.32]) for (const dz of [-0.32, 0.32]) b.box(0.06, 0.55, 0.06, STEEL, [x + dx, 0.43, z + dz]);
    b.sphere(0.58, color, [x, 1.2, z], undefined, 12);
    b.box(0.9, 0.04, 0.04, STEEL, [x, 0.7, z]);
  }
  b.cyl(0.05, 0.05, 2.2, STEEL, [3.0, 0.3, 1.85], [Math.PI / 2, 0, 0], 8);
  b.cyl(0.05, 0.05, 1.6, STEEL, [2.3, 0.3, 0.75], [0, 0, Math.PI / 2], 8);
  b.cyl(0.05, 0.05, 0.9, STEEL, [px + 0.9, 0.3, pz + 1.2], [Math.PI / 2, 0, 0], 8);

  // --- caixa-d'água elevada da supressão acústica
  {
    const [x, z] = [-0.6, 2.9];
    for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) b.box(0.06, 2.2, 0.06, STEEL, [x + dx, 1.26, z + dz]);
    b.cyl(0.5, 0.5, 0.75, '#d4d6d2', [x, 2.7, z], undefined, 12);
    b.cyl(0.08, 0.5, 0.25, '#d4d6d2', [x, 3.2, z], undefined, 12);
    a.cyl(0.505, 0.505, 0.14, '#ffffff', [x, 2.75, z], undefined, 12);
  }

  // --- prédio de montagem vertical: bloco alto, porta alta voltada para a pista e faixa da nação
  {
    const [x, z] = [-2.7, -1.0];
    b.box(1.8, 3.6, 2.2, C.concreteLight, [x, 1.96, z]);
    b.box(1.86, 0.1, 2.26, '#9a9c9a', [x, 3.81, z]);
    b.box(0.02, 3.0, 0.9, '#5d6166', [x + 0.91, 1.66, z]);
    for (let i = 0; i < 6; i++) b.box(0.025, 0.02, 0.92, '#7a7e83', [x + 0.92, 0.4 + i * 0.5, z]);
    a.box(0.02, 0.6, 0.9, '#ffffff', [x + 0.91, 3.4, z - 0.15 - 0.6]);
    for (let i = 0; i < 4; i++) b.box(0.012, 0.2, 0.3, '#8f9295', [x - 0.91, 1.0 + i * 0.7, z + 0.6]);
  }

  // --- centro de controle, bunker e antenas de rastreio
  b.box(2.2, 0.9, 1.3, WHITE, [-2.4, 0.61, 2.3]);
  b.box(2.3, 0.08, 1.4, C.roof, [-2.4, 1.1, 2.3]);
  for (let i = 0; i < 5; i++) g.box(0.32, 0.3, 0.02, '#ffffff', [-3.25 + i * 0.42, 0.7, 2.96]);
  b.plan(
    [
      [-1.2, 0.6],
      [0.1, 0.6],
      [0.3, 1.4],
      [-1.4, 1.4],
    ],
    0.35,
    C.concreteDark,
    [0, 0.16, 0],
  );
  g.box(0.8, 0.06, 0.02, '#ffffff', [-0.55, 0.42, 1.41]);
  for (const [x, z, r] of [
    [-3.1, 0.6, 0.55],
    [-1.6, 3.3, 0.4],
  ] as const) {
    b.cyl(0.06, 0.1, 0.9, STEEL, [x, 0.61, z], undefined, 8);
    b.add(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), WHITE, { pos: [x, 1.05 + r * 0.55, z], rot: [Math.PI - 0.7, 0, 0.3] });
  }
  return { base: l.build(), moving: null, height: th + 1.4 };
}

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
