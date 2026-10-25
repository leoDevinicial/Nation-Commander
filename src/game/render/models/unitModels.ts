import type { UnitType } from '../../../../shared/sim/config.ts';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';

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
}

const cache = new Map<UnitType, UnitModel>();

export function unitModel(type: UnitType): UnitModel {
  let m = cache.get(type);
  if (!m) {
    m = BUILDERS[type]();
    cache.set(type, m);
  }
  return m;
}

export function disposeUnitModels(): void {
  for (const m of cache.values()) {
    for (const l of [m.hull, m.turret]) if (l) for (const g of [l.body, l.accent, l.glass]) g.dispose();
  }
  cache.clear();
}

const BUILDERS: Record<UnitType, () => UnitModel> = {
  infantry: buildInfantry,
  apc: buildApc,
  tank: buildTank,
  artillery: buildArtillery,
};

// ------------------------------------------------------------------ infantaria

function soldier(b: PartBuilder, a: PartBuilder, x: number, z: number, variant: number): void {
  const s = 1.25;
  const p = (dx: number, dy: number, dz: number): [number, number, number] => [x + dx * s, dy * s, z + dz * s];
  // pernas e botas
  b.box(0.1 * s, 0.36 * s, 0.1 * s, C.oliveDark, p(0, 0.22, 0.065));
  b.box(0.1 * s, 0.36 * s, 0.1 * s, C.oliveDark, p(variant ? 0.04 : -0.02, 0.22, -0.065));
  b.box(0.16 * s, 0.06 * s, 0.11 * s, C.boot, p(0.03, 0.03, 0.065));
  b.box(0.16 * s, 0.06 * s, 0.11 * s, C.boot, p(0.03, 0.03, -0.065));
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
  // insígnia da facção nos ombros
  a.box(0.06 * s, 0.07 * s, 0.03 * s, '#ffffff', p(0, 0.66, 0.15));
  a.box(0.06 * s, 0.07 * s, 0.03 * s, '#ffffff', p(0, 0.66, -0.15));
}

function buildInfantry(): UnitModel {
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

function buildTank(): UnitModel {
  const hull = layers();
  const b = hull.body;
  // casco com glacis inclinado
  b.side(
    [
      [-1.08, 0.3],
      [0.98, 0.3],
      [1.16, 0.46],
      [0.92, 0.7],
      [-1.02, 0.7],
      [-1.12, 0.52],
    ],
    1.02,
    C.olive,
  );
  tracks(b, 2.1, 0.6, 0.48, 0.3);
  tracks(b, 2.1, -0.6, 0.48, 0.3);
  roadWheels(b, [-0.75, -0.38, 0, 0.38, 0.75], 0.2, 0.76, 0.16, 0.06, C.rubber);
  roadWheels(b, [-0.75, -0.38, 0, 0.38, 0.75], 0.2, -0.76, 0.16, 0.06, C.rubber);
  // para-lamas e caixas laterais
  b.box(2.15, 0.05, 0.34, C.oliveDark, [0, 0.5, 0.6]);
  b.box(2.15, 0.05, 0.34, C.oliveDark, [0, 0.5, -0.6]);
  b.box(0.5, 0.14, 0.12, C.oliveDark, [-0.55, 0.6, 0.72]);
  b.box(0.4, 0.14, 0.12, C.oliveDark, [0.25, 0.6, -0.72]);
  // faróis e escape
  b.box(0.05, 0.06, 0.1, C.steel, [1.05, 0.6, 0.38]);
  b.box(0.05, 0.06, 0.1, C.steel, [1.05, 0.6, -0.38]);
  b.box(0.12, 0.1, 0.5, C.metalDark, [-1.08, 0.6, 0]);
  // manchas de camuflagem
  b.box(0.5, 0.012, 0.35, C.oliveLight, [0.35, 0.706, 0.2], [0, 0.4, 0]);
  b.box(0.45, 0.012, 0.3, '#5a5236', [-0.55, 0.706, -0.25], [0, -0.3, 0]);
  hull.accent.box(0.3, 0.12, 0.02, '#ffffff', [-0.85, 0.58, 0.513]);
  hull.accent.box(0.3, 0.12, 0.02, '#ffffff', [-0.85, 0.58, -0.513]);

  const turret = layers();
  const t = turret.body;
  t.plan(
    [
      [0.55, 0],
      [0.32, 0.44],
      [-0.48, 0.46],
      [-0.68, 0.26],
      [-0.68, -0.26],
      [-0.48, -0.46],
      [0.32, -0.44],
    ],
    0.32,
    C.olive,
  );
  t.box(0.3, 0.22, 0.34, C.oliveDark, [0.55, 0.16, 0]); // mantelete
  t.cyl(0.065, 0.075, 1.5, C.oliveDark, [1.35, 0.17, 0], [0, 0, Math.PI / 2]);
  t.cyl(0.095, 0.095, 0.16, C.metalDark, [2.07, 0.17, 0], [0, 0, Math.PI / 2]);
  t.cyl(0.13, 0.15, 0.06, C.oliveDark, [-0.15, 0.35, 0.18]); // escotilha
  t.cyl(0.11, 0.12, 0.06, C.oliveDark, [-0.15, 0.35, -0.2]);
  t.box(0.32, 0.04, 0.04, C.metalDark, [0.0, 0.43, -0.2]); // metralhadora
  t.box(0.12, 0.1, 0.1, C.metalDark, [-0.15, 0.4, -0.2]);
  for (const z of [0.36, -0.36]) for (const dx of [0, 0.08]) t.cyl(0.03, 0.03, 0.14, C.metalDark, [0.18 + dx, 0.3, z], [0, 0, 1.1], 6);
  t.box(0.32, 0.14, 0.62, C.oliveDark, [-0.8, 0.16, 0]); // cesto traseiro
  t.cyl(0.012, 0.012, 0.7, C.metalDark, [-0.55, 0.65, 0.3], [0, 0, -0.2], 4); // antena
  turret.accent.box(0.5, 0.08, 0.02, '#ffffff', [-0.1, 0.18, 0.455]);
  turret.accent.box(0.5, 0.08, 0.02, '#ffffff', [-0.1, 0.18, -0.455]);
  return { hull: hull.build(), turret: turret.build(), turretPivot: [-0.08, 0.7, 0], muzzle: [2.15, 0.17, 0] };
}

function buildApc(): UnitModel {
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
  for (const x of [-0.8, -0.28, 0.28, 0.8]) {
    for (const z of [0.5, -0.5]) {
      b.cyl(0.24, 0.24, 0.2, C.rubber, [x, 0.25, z], [Math.PI / 2, 0, 0], 12);
      b.cyl(0.11, 0.11, 0.22, C.metal, [x, 0.25, z], [Math.PI / 2, 0, 0], 8);
    }
  }
  b.box(2.2, 0.06, 0.08, C.oliveDark, [0, 0.52, 0.58]); // saia lateral
  b.box(2.2, 0.06, 0.08, C.oliveDark, [0, 0.52, -0.58]);
  b.box(0.5, 0.16, 0.08, C.oliveDark, [-0.45, 0.72, 0.58]);
  b.box(0.5, 0.16, 0.08, C.oliveDark, [-0.45, 0.72, -0.58]);
  b.box(0.36, 0.06, 0.4, C.oliveDark, [-0.65, 0.99, 0]); // escotilha traseira
  b.box(0.06, 0.06, 0.1, C.steel, [1.08, 0.72, 0.38]);
  b.box(0.06, 0.06, 0.1, C.steel, [1.08, 0.72, -0.38]);
  b.box(0.04, 0.16, 0.36, '#2a3a44', [0.98, 0.84, 0.2], [0, 0, 0.5]); // visor do motorista
  b.box(0.6, 0.012, 0.4, C.oliveLight, [-0.2, 0.966, 0.2], [0, 0.5, 0]);
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
  t.cyl(0.035, 0.04, 0.85, C.metalDark, [0.68, 0.13, 0], [0, 0, Math.PI / 2], 6);
  t.box(0.1, 0.1, 0.12, C.metalDark, [0.18, 0.31, 0.12]);
  t.cyl(0.01, 0.01, 0.6, C.metalDark, [-0.2, 0.5, -0.15], [0, 0, -0.2], 4);
  turret.accent.box(0.26, 0.05, 0.02, '#ffffff', [-0.05, 0.13, 0.255]);
  return { hull: hull.build(), turret: turret.build(), turretPivot: [0.1, 0.96, 0], muzzle: [1.1, 0.13, 0] };
}

function buildArtillery(): UnitModel {
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
  t.cyl(0.075, 0.09, 2.3, C.oliveDark, at(1.15), [0, 0, -(Math.PI / 2 - elev)]);
  t.cyl(0.11, 0.11, 0.18, C.metalDark, at(2.3), [0, 0, -(Math.PI / 2 - elev)]);
  t.box(0.32, 0.3, 0.36, C.oliveDark, [0.48, 0.32, 0]);
  t.cyl(0.11, 0.12, 0.05, C.oliveDark, [-0.2, 0.58, 0.25]);
  t.box(0.5, 0.2, 1.0, C.oliveDark, [-0.45, 0.25, 0]);
  turret.accent.box(0.6, 0.08, 0.02, '#ffffff', [-0.2, 0.4, 0.483]);
  turret.accent.box(0.6, 0.08, 0.02, '#ffffff', [-0.2, 0.4, -0.483]);
  return { hull: hull.build(), turret: turret.build(), turretPivot: [-0.25, 0.62, 0], muzzle: at(2.4) };
}
