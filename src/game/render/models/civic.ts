import { C, layers, type PartBuilder } from './kit.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

type Built = Omit<BuildingModel, 'detail'>;
type V3 = [number, number, number];

const STONE = '#e2dac6';
const STONE_DARK = '#c3b9a2';
const STONE_TRIM = '#efe9da';
const ROOF = '#5f6b70';
const DOME = '#7c9a8e';

/** Janela alta com moldura na fachada da frente (+z). */
function tallWindow(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number): void {
  g.box(0.2, 0.36, 0.02, '#ffffff', [x, y, z]);
  b.box(0.27, 0.035, 0.06, STONE_TRIM, [x, y - 0.2, z + 0.01]);
  b.box(0.27, 0.05, 0.05, STONE_TRIM, [x, y + 0.21, z + 0.01]);
}

/** Frontão triangular (perfil no plano xy, espessura em z). */
function pediment(b: PartBuilder, w: number, h: number, depth: number, at: V3, color: string): void {
  b.side(
    [
      [-w / 2, 0],
      [w / 2, 0],
      [0, h],
    ],
    depth,
    color,
    at,
  );
}

/**
 * Prefeitura (2×2), estilo paço municipal neoclássico: corpo de pedra clara em dois pavimentos com
 * janelas altas, pórtico de seis colunas sobre escadaria e frontão com o brasão (cor da nação),
 * torre do relógio central com mostradores, sineira aberta e cúpula de cobre, e praça cívica na
 * frente com chafariz, canteiros, postes e mastros. O relógio anda.
 */
export function buildCityHallModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  // praça: piso de pedra portuguesa com faixas e meio-fio
  b.box(3.9, 0.06, 3.9, '#b8b2a3', [0, 0.03, 0]);
  for (let i = 0; i < 4; i++) b.box(3.7, 0.008, 0.06, '#8f897b', [0, 0.064, 0.55 + i * 0.4]);
  // corpo principal (frente para +z) com embasamento, cornija e platibanda
  const zc = -0.55;
  const depth = 1.5;
  const front = zc + depth / 2;
  b.box(3.3, 0.18, depth + 0.1, STONE_DARK, [0, 0.15, zc]);
  b.box(3.2, 1.2, depth, STONE, [0, 0.84, zc]);
  b.box(3.3, 0.07, depth + 0.08, STONE_TRIM, [0, 1.47, zc]);
  b.box(3.24, 0.14, depth + 0.02, STONE, [0, 1.58, zc]);
  b.box(3.0, 0.16, depth - 0.2, ROOF, [0, 1.71, zc]);
  // faixa entre os pavimentos e janelas das alas
  b.box(3.22, 0.04, 0.04, STONE_TRIM, [0, 0.86, front + 0.01]);
  for (const x of [-1.35, -1.0, 1.0, 1.35])
    for (const y of [0.55, 1.18]) tallWindow(b, g, x, y, front + 0.005);
  for (const sx of [-1, 1]) for (const z of [zc - 0.4, zc, zc + 0.4]) for (const y of [0.55, 1.18]) g.box(0.02, 0.32, 0.18, '#ffffff', [sx * 1.605, y, z]);
  // pilastras nas quinas das alas
  for (const x of [-1.58, -0.72, 0.72, 1.58]) b.box(0.1, 1.24, 0.06, STONE_TRIM, [x, 0.84, front + 0.02]);
  // escadaria de três degraus e pórtico avançado
  for (let i = 0; i < 3; i++) b.box(1.7 - i * 0.08, 0.06, 0.72 - i * 0.14, STONE_DARK, [0, 0.09 + i * 0.06, front + 0.36 - i * 0.07]);
  const pz = front + 0.33;
  for (let i = 0; i < 6; i++) {
    const x = -0.6 + i * 0.24;
    b.cyl(0.055, 0.065, 1.08, STONE_TRIM, [x, 0.8, pz], undefined, 10);
    b.box(0.15, 0.04, 0.15, STONE_TRIM, [x, 0.27, pz]);
    b.box(0.16, 0.05, 0.16, STONE_TRIM, [x, 1.36, pz]);
  }
  b.box(1.5, 0.12, 0.5, STONE_TRIM, [0, 1.44, front + 0.2]);
  pediment(b, 1.56, 0.42, 0.5, [0, 1.5, front + 0.2], STONE);
  pediment(b, 1.3, 0.3, 0.02, [0, 1.55, front + 0.46], STONE_DARK);
  // brasão no tímpano e faixa com a cor da nação sobre a porta
  a.sphere(0.09, '#ffffff', [0, 1.66, front + 0.47], [1, 1.2, 0.3], 10);
  a.box(0.9, 0.08, 0.02, '#ffffff', [0, 1.28, front + 0.012]);
  // portal de madeira com bandeira envidraçada
  b.box(0.44, 0.62, 0.04, C.woodDark, [0, 0.55, front + 0.01]);
  g.box(0.36, 0.14, 0.02, '#ffffff', [0, 0.95, front + 0.02]);
  for (const x of [-0.4, 0.4]) tallWindow(b, g, x, 1.1, front + 0.005);
  // torre do relógio: fuste, mostradores, sineira com colunas, cúpula de cobre, lanternim e mastro
  const tz = zc - 0.05;
  b.box(0.72, 0.7, 0.72, STONE, [0, 2.0, tz]);
  b.box(0.8, 0.06, 0.8, STONE_TRIM, [0, 2.37, tz]);
  for (const [dx, dz, ry] of [
    [0, 0.37, 0],
    [0, -0.37, Math.PI],
    [0.37, 0, Math.PI / 2],
    [-0.37, 0, -Math.PI / 2],
  ] as const) {
    b.cyl(0.22, 0.22, 0.03, STONE_TRIM, [dx, 2.05, tz + dz], [Math.PI / 2, ry, 0], 18);
    b.cyl(0.18, 0.18, 0.035, '#f4f1e6', [dx * 1.03, 2.05, tz + dz * 1.03], [Math.PI / 2, ry, 0], 18);
  }
  b.box(0.66, 0.05, 0.66, STONE_DARK, [0, 2.42, tz]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 0.42, 0.08, STONE_TRIM, [sx * 0.27, 2.65, tz + sz * 0.27]);
  b.cyl(0.11, 0.15, 0.18, '#8a6a2f', [0, 2.62, tz], undefined, 10);
  b.box(0.7, 0.06, 0.7, STONE_TRIM, [0, 2.89, tz]);
  b.cyl(0.32, 0.34, 0.1, STONE, [0, 2.97, tz], undefined, 16);
  b.sphere(0.32, DOME, [0, 3.02, tz], [1, 0.95, 1], 16);
  b.cyl(0.06, 0.08, 0.2, STONE_TRIM, [0, 3.38, tz], undefined, 8);
  b.sphere(0.07, '#c9a54a', [0, 3.5, tz], undefined, 8);
  b.cyl(0.015, 0.015, 0.6, C.steel, [0, 3.82, tz], undefined, 4);
  a.box(0.34, 0.2, 0.01, '#ffffff', [0.18, 3.98, tz]);
  // chafariz da praça: tanque redondo, taça e espelho d'água
  const fz = 1.35;
  b.cyl(0.5, 0.52, 0.16, STONE_DARK, [0, 0.14, fz], undefined, 20);
  g.cyl(0.44, 0.44, 0.02, '#ffffff', [0, 0.21, fz], undefined, 20);
  b.cyl(0.06, 0.08, 0.32, STONE_TRIM, [0, 0.36, fz], undefined, 10);
  b.cyl(0.2, 0.08, 0.06, STONE_TRIM, [0, 0.54, fz], undefined, 14);
  // canteiros com arbustos e postes de iluminação
  for (const sx of [-1, 1]) {
    b.box(0.7, 0.1, 0.5, STONE_DARK, [sx * 1.25, 0.09, 1.2]);
    b.box(0.62, 0.04, 0.42, '#4f6b34', [sx * 1.25, 0.16, 1.2]);
    for (const dx of [-0.18, 0.18]) b.sphere(0.13, '#3f5e2b', [sx * 1.25 + dx, 0.25, 1.2], [1, 0.8, 1], 8);
    for (const z of [0.45, 1.75]) {
      b.cyl(0.02, 0.03, 0.62, C.metalDark, [sx * 0.75, 0.37, z], undefined, 6);
      b.sphere(0.05, '#f3e2a8', [sx * 0.75, 0.7, z], undefined, 8);
    }
    // mastros com a bandeira da nação
    b.cyl(0.02, 0.025, 1.3, C.steel, [sx * 1.7, 0.7, 0.4], undefined, 6);
    a.box(0.32, 0.2, 0.01, '#ffffff', [sx * 1.7 + 0.17, 1.24, 0.4]);
  }
  // ponteiros do relógio (giram devagar): um conjunto por face
  const hands = layers();
  hands.body.box(0.02, 0.15, 0.01, '#1f1f1f', [0, 0.07, 0]);
  hands.body.box(0.11, 0.02, 0.01, '#1f1f1f', [0.05, 0, 0]);
  const anims: ModelAnim[] = [
    { layers: hands.build(), pivot: [0, 2.05, tz + 0.395], motion: { kind: 'spin', axis: 'z', speed: -0.12 } },
  ];
  return { base: l.build(), moving: null, anims, height: 4.1 };
}
