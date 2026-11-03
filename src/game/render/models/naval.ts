import { layers, type PartBuilder, type ModelLayers } from './kit.ts';

/**
 * Navios (03/11), low poly, frente para +x e origem na linha d'água (o casco afunda um pouco abaixo de y = 0). Cascos
 * em planta (polígono no plano x-z extrudado na vertical), obras vivas vermelhas, superestrutura em blocos facetados e a
 * cor da nação em faixas, número de costado e bandeira. Referências de forma: navio de desembarque com doca alagável
 * (L402), fragatas de três gerações, submarinos, porta-aviões e cargueiro de contêineres; o desenho é próprio.
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
const WINDOW = '#ffffff';

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

/** Casco: obras vivas vermelhas, costado e convés. Devolve a altura do convés. */
function hull(b: PartBuilder, L: number, W: number, H: number, color: string, deck: string, bow = 0.22, sternRound = 0): number {
  b.side(plan(L, W, bow, 0.97, sternRound), 0.22, RED, [0, -0.09, 0], FLAT);
  b.side(plan(L, W, bow, 1, sternRound), H, color, [0, H / 2 + 0.02, 0], FLAT);
  b.side(plan(L, W, bow, 0.94, sternRound), 0.03, deck, [0, H + 0.035, 0], FLAT);
  return H + 0.05;
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

/** Mastro com bandeira da nação no topo. */
function mast(b: PartBuilder, a: PartBuilder, x: number, y: number, h: number, color = '#2b2d30'): void {
  b.cyl(0.022, 0.03, h, color, [x, y + h / 2, 0], undefined, 5);
  a.box(0.2, 0.12, 0.012, '#ffffff', [x - 0.11, y + h - 0.08, 0]);
}

/** Canhão naval simples (torre que gira): base, casa da arma e cano. Para a torre da fragata. */
function navalGun(t: PartBuilder, color: string, stealth: boolean, twin = false): void {
  if (stealth) {
    t.side(
      [
        [-0.2, 0],
        [0.16, 0],
        [0.1, 0.17],
        [-0.16, 0.17],
      ],
      0.3,
      color,
    );
  } else {
    t.cyl(0.18, 0.2, 0.1, color, [0, 0.05, 0], undefined, 10);
    t.box(0.34, 0.16, 0.28, color, [0, 0.16, 0]);
  }
  for (const z of twin ? [-0.06, 0.06] : [0]) t.cyl(0.022, 0.026, 0.48, '#2f3236', [0.36, 0.11, z], [0, 0, -Math.PI / 2], 6);
}

// ------------------------------------------------------------------ L402

/** Navio de desembarque com doca alagável: casco alto e escuro, superestrutura central, convoo à popa e porta da doca. */
export function buildL402(): ShipModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const deck = hull(b, 4.7, 1.3, 0.62, '#4a4f55', '#3b3f44', 0.2);
  // faixa e número de costado da nação
  for (const z of [-0.655, 0.655]) {
    a.box(3.6, 0.06, 0.012, '#ffffff', [-0.2, deck - 0.14, z]);
    a.box(0.34, 0.16, 0.012, '#ffffff', [1.25, 0.3, z]);
  }
  // superestrutura em dois andares, laterais inclinadas, janelas da ponte
  block(b, -0.75, 1.05, deck, 0.5, 1.12, '#555b62', 0.14);
  block(b, -0.45, 0.75, deck + 0.5, 0.32, 0.92, '#5c6269', 0.1);
  g.box(0.03, 0.08, 0.8, WINDOW, [0.68, deck + 0.7, 0]);
  b.box(0.5, 0.04, 1.2, '#3f444a', [0.3, deck + 0.52, 0]);
  // mastro com radar e bandeiras
  b.cyl(0.07, 0.09, 0.42, '#3f444a', [0.1, deck + 1.03, 0], undefined, 6);
  b.box(0.2, 0.05, 0.24, '#2b2d30', [0.1, deck + 1.27, 0]);
  b.cyl(0.08, 0.08, 0.06, '#dfe3e6', [0.1, deck + 1.34, 0], undefined, 8);
  mast(b, a, -0.4, deck + 0.82, 0.55);
  mast(b, a, 0.6, deck + 0.82, 0.45);
  // guindaste de embarcações e lanchas de desembarque nos turcos
  b.box(0.06, 0.5, 0.06, '#2f4a3e', [-1.0, deck + 0.25, 0.42]);
  b.box(0.7, 0.05, 0.06, '#2f4a3e', [-0.7, deck + 0.5, 0.42]);
  for (const z of [-0.6, 0.6]) b.box(0.55, 0.14, 0.18, '#2f4a3e', [-0.05, deck + 0.18, z]);
  // convoo à popa com marcas e grade
  b.box(1.2, 0.02, 1.1, '#34383d', [-1.72, deck + 0.01, 0]);
  for (const x of [-2.15, -1.3]) b.box(0.03, 0.012, 0.9, '#e8e8e2', [x, deck + 0.03, 0]);
  b.box(0.5, 0.012, 0.04, '#e8e8e2', [-1.72, deck + 0.03, 0]);
  // porta da doca alagável na popa
  b.box(0.02, 0.4, 0.6, '#2e4a40', [-2.36, 0.3, 0]);
  // canhão leve na proa
  b.cyl(0.08, 0.1, 0.12, '#555b62', [1.6, deck + 0.06, 0], undefined, 8);
  b.box(0.3, 0.03, 0.03, '#2b2d30', [1.75, deck + 0.12, 0]);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [1.9, deck + 0.12, 0] };
}

// ------------------------------------------------------------------ fragatas

/** Fragata da Guerra Fria: casco claro, superestrutura em degraus, chaminé, mastro treliçado e torre dupla na proa. */
export function buildFrigateEra1(): ShipModel {
  const l = layers();
  const t = layers();
  const { body: b, accent: a, glass: g } = l;
  const hullC = '#8e969b';
  const deck = hull(b, 4.6, 1.0, 0.42, hullC, '#6c6f66', 0.26);
  for (const z of [-0.505, 0.505]) a.box(0.3, 0.14, 0.012, '#ffffff', [1.0, 0.22, z]);
  // superestrutura em degraus
  b.box(1.4, 0.32, 0.72, '#9aa2a7', [-0.1, deck + 0.16, 0]);
  b.box(0.7, 0.28, 0.6, '#a3abb0', [0.2, deck + 0.46, 0]);
  g.box(0.03, 0.07, 0.5, WINDOW, [0.55, deck + 0.5, 0]);
  // chaminé com faixa da nação
  b.box(0.36, 0.42, 0.34, '#8a9297', [-0.45, deck + 0.53, 0]);
  a.box(0.37, 0.08, 0.35, '#ffffff', [-0.45, deck + 0.66, 0]);
  b.box(0.3, 0.04, 0.28, '#2b2d30', [-0.45, deck + 0.75, 0]);
  // mastro treliçado com vergas
  for (const z of [-0.08, 0.08]) b.box(0.025, 0.7, 0.025, '#3c4046', [0.15, deck + 0.95, z], [z * 2, 0, 0]);
  b.box(0.04, 0.03, 0.5, '#3c4046', [0.15, deck + 1.15, 0]);
  b.box(0.18, 0.08, 0.06, '#3c4046', [0.15, deck + 1.32, 0]);
  mast(b, a, -1.6, deck, 0.6);
  // canhão de ré e lançador antiaéreo
  b.cyl(0.12, 0.14, 0.12, hullC, [-1.25, deck + 0.06, 0], undefined, 8);
  b.box(0.36, 0.03, 0.03, '#2f3236', [-1.45, deck + 0.13, 0]);
  b.box(0.22, 0.1, 0.18, '#7d858a', [-0.95, deck + 0.05, 0]);
  navalGun(t.body, '#9aa2a7', false, true);
  return { hull: l.build(), turret: t.build(), turretPivot: [1.25, deck, 0], muzzle: [0.6, 0.11, 0] };
}

/** Fragata moderna (eras 2 e 3): superestrutura de laterais inclinadas, mastro fechado, canhão furtivo, VLS e convoo. */
export function buildFrigateEra2(): ShipModel {
  const l = layers();
  const t = layers();
  const { body: b, accent: a, glass: g } = l;
  const hullC = '#b6bdc2';
  const deck = hull(b, 4.8, 1.05, 0.48, hullC, '#5a6168', 0.25);
  for (const z of [-0.53, 0.53]) a.box(0.32, 0.14, 0.012, '#ffffff', [1.1, 0.26, z]);
  // bloco da ponte e hangar, laterais inclinadas
  block(b, -0.25, 0.85, deck, 0.42, 0.86, '#c4cbcf', 0.12);
  block(b, 0.05, 0.6, deck + 0.42, 0.24, 0.66, '#cdd3d6', 0.08);
  g.box(0.03, 0.06, 0.6, WINDOW, [0.74, deck + 0.34, 0]);
  block(b, -1.3, -0.25, deck, 0.34, 0.9, '#c4cbcf', 0.1);
  // mastro fechado com radar e bandeira
  block(b, 0.2, 0.46, deck + 0.66, 0.38, 0.3, '#3d434a', 0.06);
  b.box(0.08, 0.16, 0.36, '#2b2d30', [0.33, deck + 1.1, 0]);
  mast(b, a, 0.33, deck + 1.04, 0.3);
  // chaminé baixa e VLS à frente da ponte
  block(b, -0.75, -0.45, deck + 0.34, 0.2, 0.42, '#b0b7bc', 0.05);
  b.box(0.36, 0.03, 0.46, '#4a5056', [1.15, deck + 0.015, 0]);
  for (let i = 0; i < 3; i++) for (const z of [-0.12, 0, 0.12]) b.box(0.08, 0.012, 0.08, '#34383d', [1.05 + i * 0.1, deck + 0.035, z]);
  // convoo
  b.box(0.75, 0.012, 0.85, '#4a5056', [-1.85, deck + 0.01, 0]);
  b.box(0.35, 0.01, 0.03, '#e8e8e2', [-1.85, deck + 0.022, 0]);
  navalGun(t.body, '#c4cbcf', true);
  return { hull: l.build(), turret: t.build(), turretPivot: [1.65, deck, 0], muzzle: [0.6, 0.11, 0] };
}

/** Fragata do Futuro Próximo: superestrutura pirâmide, radar esférico no mastro alto, canhão furtivo e convoo. */
export function buildFrigateEra4(): ShipModel {
  const l = layers();
  const t = layers();
  const { body: b, accent: a, glass: g } = l;
  const hullC = '#a9b6c0';
  const deck = hull(b, 4.9, 1.1, 0.5, hullC, '#4b525a', 0.26);
  for (const z of [-0.555, 0.555]) a.box(0.34, 0.14, 0.012, '#ffffff', [1.15, 0.27, z]);
  block(b, -1.25, 0.95, deck, 0.45, 0.98, '#b9c5ce', 0.22);
  block(b, -0.1, 0.75, deck + 0.45, 0.32, 0.78, '#c2ced6', 0.15);
  g.box(0.03, 0.06, 0.56, WINDOW, [0.62, deck + 0.62, 0]);
  // torre do radar: pirâmide alta com a esfera no topo
  block(b, 0.1, 0.5, deck + 0.77, 0.55, 0.42, '#b9c5ce', 0.12);
  b.cyl(0.03, 0.04, 0.25, '#2b2d30', [0.3, deck + 1.44, 0], undefined, 5);
  b.sphere(0.16, '#e4e9ec', [0.3, deck + 1.62, 0], undefined, 8);
  mast(b, a, -0.55, deck + 0.45, 0.6);
  // segunda torre (radar de busca) e chaminé
  block(b, -0.85, -0.4, deck + 0.45, 0.3, 0.6, '#b9c5ce', 0.1);
  b.box(0.06, 0.12, 0.34, '#2b2d30', [-0.62, deck + 0.82, 0]);
  // VLS e convoo
  b.box(0.42, 0.03, 0.5, '#3e444b', [1.3, deck + 0.015, 0]);
  for (let i = 0; i < 4; i++) for (const z of [-0.15, 0, 0.15]) b.box(0.08, 0.012, 0.08, '#2c3035', [1.18 + i * 0.09, deck + 0.035, z]);
  b.box(0.8, 0.012, 0.9, '#3e444b', [-1.9, deck + 0.01, 0]);
  b.box(0.38, 0.01, 0.03, '#e8e8e2', [-1.9, deck + 0.022, 0]);
  navalGun(t.body, '#b9c5ce', true);
  return { hull: l.build(), turret: t.build(), turretPivot: [1.75, deck, 0], muzzle: [0.6, 0.11, 0] };
}

// ------------------------------------------------------------------ submarinos

/** Submarino na superfície: charuto escuro meio submerso, vela com lemes, leme cruciforme e hélice. */
function submarine(missile: boolean): ShipModel {
  const l = layers();
  const { body: b, accent: a } = l;
  const L = missile ? 4.6 : 3.8;
  const r = missile ? 0.36 : 0.3;
  const dark = '#24272a';
  // casco: cilindro deitado com as pontas arredondadas, metade abaixo d'água (a faixa vermelha fica na linha d'água)
  b.cyl(r, r, L - 2 * r, dark, [0, 0.02, 0], [0, 0, Math.PI / 2], 12);
  b.sphere(r, dark, [L / 2 - r, 0.02, 0], [1.35, 1, 1], 10);
  b.sphere(r, dark, [-L / 2 + r, 0.02, 0], [1.6, 1, 1], 10);
  b.box(L * 0.82, 0.04, r * 2.02, '#6b2a24', [0, -0.08, 0]);
  // vela, lemes da vela, periscópios
  const sx = missile ? 1.0 : 0.6;
  b.side(
    [
      [sx - 0.35, 0],
      [sx + 0.3, 0],
      [sx + 0.22, 0.5],
      [sx - 0.25, 0.5],
    ],
    0.2,
    dark,
    [0, r - 0.04, 0],
  );
  b.box(0.18, 0.025, 0.6, dark, [sx, r + 0.3, 0]);
  b.cyl(0.015, 0.015, 0.3, '#3c4046', [sx + 0.05, r + 0.6, 0], undefined, 4);
  a.box(0.1, 0.06, 0.012, '#ffffff', [sx - 0.05, r + 0.75, 0]);
  // faixa da nação na vela
  for (const z of [-0.105, 0.105]) a.box(0.3, 0.08, 0.012, '#ffffff', [sx - 0.02, r + 0.25, z]);
  // leme cruciforme e hélice na popa
  b.box(0.28, 0.5, 0.03, dark, [-L / 2 + 0.05, 0.1, 0]);
  b.box(0.28, 0.03, 0.5, dark, [-L / 2 + 0.05, 0.02, 0]);
  b.cyl(0.14, 0.14, 0.03, '#a8792f', [-L / 2 - 0.12, 0.02, 0], [0, 0, Math.PI / 2], 6);
  if (missile) {
    // corcova dos tubos de mísseis atrás da vela, com as tampas
    b.box(1.6, 0.12, r * 1.2, dark, [-0.2, r - 0.02, 0]);
    for (let i = 0; i < 6; i++) for (const z of [-0.1, 0.1]) b.box(0.13, 0.015, 0.13, '#3a3e42', [-0.85 + i * 0.25, r + 0.045, z]);
  }
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [L / 2, 0.05, 0] };
}

export const buildSubmarine = (): ShipModel => submarine(false);
export const buildMissileSubmarine = (): ShipModel => submarine(true);

// ------------------------------------------------------------------ porta-aviões

/** Caça estacionado no convés (silhueta de asa em delta). */
function deckJet(b: PartBuilder, x: number, z: number, y: number, rot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (dx: number, dz: number): V3 => [x + dx * c - dz * s, y, z + dx * s + dz * c];
  b.box(0.42, 0.06, 0.07, '#6d747a', at(0, 0), [0, -rot, 0]);
  b.side(
    [
      [0.05, 0],
      [-0.16, 0.17],
      [-0.2, 0.17],
      [-0.16, 0],
      [-0.2, -0.17],
      [-0.16, -0.17],
    ],
    0.02,
    '#6d747a',
    at(0, 0),
    [Math.PI / 2, 0, rot],
  );
  b.box(0.08, 0.1, 0.015, '#5d646a', at(-0.17, 0), [0, -rot, 0]);
}

/** Porta-aviões: convés corrido com pista angulada, ilha a boreste com radar e bandeira, e caças estacionados. */
export function buildCarrier(): ShipModel {
  const l = layers();
  const { body: b, accent: a } = l;
  const deck = hull(b, 7.2, 1.7, 0.6, '#6f777e', '#3f454b', 0.16);
  // convés de voo com sobras dos dois lados (pista angulada a bombordo)
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
    [0, deck + 0.04, 0],
    FLAT,
  );
  const top = deck + 0.085;
  // marcas: linha central, pista angulada e faixas amarelas
  b.box(6.5, 0.01, 0.04, '#e8e8e2', [-0.1, top, 0.15]);
  b.box(4.6, 0.01, 0.035, '#e8e8e2', [-1.0, top, -0.55], [0, 0.13, 0]);
  b.box(4.6, 0.01, 0.025, '#e7c23a', [-1.0, top, -0.35], [0, 0.13, 0]);
  for (let i = 0; i < 5; i++) b.box(0.3, 0.012, 0.03, '#e8e8e2', [-3.0 + i * 0.4, top, 0.15]);
  // ilha a boreste com o radar, o mastro e a faixa da nação
  block(b, -0.6, 0.4, top, 0.55, 0.36, '#6f777e', 0.06, 0.62);
  block(b, -0.45, 0.25, top + 0.55, 0.3, 0.3, '#767e85', 0.05, 0.62);
  b.box(0.03, 0.06, 0.24, WINDOW, [0.27, top + 0.72, 0.62]);
  b.cyl(0.03, 0.04, 0.45, '#2b2d30', [-0.1, top + 1.08, 0.62], undefined, 5);
  b.box(0.06, 0.12, 0.34, '#2b2d30', [-0.1, top + 1.2, 0.62]);
  a.box(0.9, 0.08, 0.37, '#ffffff', [-0.1, top + 0.45, 0.62]);
  a.box(0.2, 0.12, 0.012, '#ffffff', [-0.21, top + 1.36, 0.62]);
  // caças estacionados no convés
  deckJet(b, 2.6, 0.35, top + 0.03, Math.PI * 0.85);
  deckJet(b, 2.0, 0.45, top + 0.03, Math.PI * 0.85);
  deckJet(b, -2.6, 0.55, top + 0.03, Math.PI * 1.15);
  deckJet(b, -2.0, 0.6, top + 0.03, Math.PI * 1.15);
  // elevador e catapultas
  b.box(0.6, 0.012, 0.5, '#3a4046', [1.0, top, -0.85]);
  for (const z of [-0.1, 0.35]) b.box(1.4, 0.011, 0.02, '#2a2e32', [2.7, top, z]);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [3.6, top, 0] };
}

// ------------------------------------------------------------------ cargueiro

const CONTAINERS = ['#c4562f', '#2f6d96', '#e0a43a', '#4f7a3c', '#9b3e3e', '#dad6cc', '#3b3f47'];

/** Cargueiro: casco azul-escuro, pilhas de contêineres, guindaste amarelo e superestrutura branca à popa. */
export function buildCargoShip(): ShipModel {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const deck = hull(b, 4.6, 1.2, 0.5, '#23324a', '#8f8a80', 0.2, 0.25);
  // superestrutura branca à popa, com janelas e chaminé na cor da nação
  b.box(0.7, 0.62, 1.0, '#e9e9e4', [-1.75, deck + 0.31, 0]);
  b.box(0.45, 0.04, 1.2, '#e9e9e4', [-1.7, deck + 0.64, 0]);
  g.box(0.03, 0.08, 0.9, WINDOW, [-1.39, deck + 0.52, 0]);
  for (const y of [0.2, 0.36]) for (const z of [-0.51, 0.51]) g.box(0.5, 0.05, 0.012, WINDOW, [-1.75, deck + y, z]);
  b.box(0.22, 0.32, 0.26, '#e9e9e4', [-2.0, deck + 0.8, 0]);
  a.box(0.23, 0.1, 0.27, '#ffffff', [-2.0, deck + 0.88, 0]);
  mast(b, a, -1.7, deck + 0.66, 0.35);
  // pilhas de contêineres (cores alternadas)
  let k = 0;
  for (let i = 0; i < 5; i++)
    for (const z of [-0.3, 0, 0.3])
      for (let j = 0; j < (i % 2 ? 2 : 3); j++) b.box(0.42, 0.18, 0.28, CONTAINERS[k++ % CONTAINERS.length]!, [-0.95 + i * 0.46, deck + 0.09 + j * 0.185, z]);
  // guindaste amarelo à proa
  b.cyl(0.07, 0.08, 0.6, '#e2b02c', [1.6, deck + 0.3, 0.2], undefined, 6);
  b.box(0.9, 0.06, 0.06, '#e2b02c', [1.25, deck + 0.62, 0.2], [0, 0, 0.35]);
  b.box(0.02, 0.3, 0.02, '#2b2d30', [0.85, deck + 0.42, 0.2]);
  // faixa da nação no costado
  for (const z of [-0.605, 0.605]) a.box(3.2, 0.05, 0.012, '#ffffff', [0, deck - 0.1, z]);
  return { hull: l.build(), turret: null, turretPivot: [0, 0, 0], muzzle: [2.3, deck, 0] };
}
