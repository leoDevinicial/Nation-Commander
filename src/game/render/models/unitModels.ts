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
  // equipamento: bolsas de munição no colete, joelheiras, carregador e luvas
  for (const dz of [-0.07, 0.07]) b.box(0.05 * s, 0.08 * s, 0.07 * s, C.khaki, p(0.125, 0.55, dz));
  b.box(0.04 * s, 0.05 * s, 0.11 * s, C.oliveDark, p(0.07, 0.25, 0.065));
  b.box(0.04 * s, 0.05 * s, 0.11 * s, C.oliveDark, p(0.07, 0.25, -0.065));
  b.box(0.04 * s, 0.09 * s, 0.035 * s, C.metalDark, p(0.27, 0.57, 0.04), [0, 0, 0.12]);
  b.box(0.05 * s, 0.05 * s, 0.06 * s, C.boot, p(0.26, 0.63, 0.15));
  // faixa do capacete e óculos de proteção
  b.box(0.2 * s, 0.025 * s, 0.215 * s, C.khaki, p(0, 0.82, 0));
  if (variant) {
    // operador de rádio: aparelho nas costas e antena
    b.box(0.08 * s, 0.16 * s, 0.14 * s, C.metalDark, p(-0.24, 0.66, 0));
    b.cyl(0.006 * s, 0.006 * s, 0.6 * s, C.metalDark, p(-0.26, 1.02, 0.05), undefined, 4);
  }
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

/**
 * Detalhes de esteira: elos no ramo superior, roda motriz dentada atrás, roda tensora na frente
 * e roletes de retorno — o que faz uma esteira low-poly ler como esteira de verdade.
 */
function trackDetail(b: PartBuilder, length: number, z: number, height: number, width: number): void {
  const L = length / 2;
  for (let x = -L + 0.04; x <= L - 0.04; x += 0.09) b.box(0.035, 0.018, width + 0.01, C.rubber, [x, height + 0.005, z]);
  for (let y = 0.12; y < height; y += 0.09) {
    b.box(0.018, 0.035, width + 0.01, C.rubber, [L + 0.08, y, z], [0, 0, -0.6]);
    b.box(0.018, 0.035, width + 0.01, C.rubber, [-L - 0.08, y, z], [0, 0, 0.6]);
  }
  const side = Math.sign(z) * (width / 2 + 0.02);
  // roda motriz (traseira) com dentes e tensora (frente)
  b.cyl(0.15, 0.15, 0.05, C.metalDark, [-L + 0.02, height * 0.62, z + side], [Math.PI / 2, 0, 0], 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.box(0.05, 0.05, 0.04, C.metalDark, [-L + 0.02 + Math.cos(a) * 0.16, height * 0.62 + Math.sin(a) * 0.16, z + side]);
  }
  b.cyl(0.04, 0.04, 0.06, C.steel, [-L + 0.02, height * 0.62, z + side * 1.2], [Math.PI / 2, 0, 0], 6);
  b.cyl(0.13, 0.13, 0.05, C.metal, [L - 0.02, height * 0.6, z + side], [Math.PI / 2, 0, 0], 10);
  for (const x of [-L * 0.45, L * 0.35]) b.cyl(0.05, 0.05, 0.05, C.metal, [x, height - 0.06, z + side * 0.6], [Math.PI / 2, 0, 0], 6);
}

/** Saias blindadas em painéis (com frestas), cobrindo o ramo superior da esteira. */
function skirts(b: PartBuilder, length: number, z: number, y: number, h: number, panels: number): void {
  const w = length / panels;
  for (let i = 0; i < panels; i++) {
    const x = -length / 2 + w * (i + 0.5);
    b.box(w - 0.025, h, 0.035, C.olive, [x, y, z]);
    // parafusos de fixação
    b.box(w * 0.7, 0.015, 0.045, C.oliveDark, [x, y + h / 2 - 0.03, z]);
  }
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
  trackDetail(b, 2.1, 0.6, 0.48, 0.3);
  trackDetail(b, 2.1, -0.6, 0.48, 0.3);
  skirts(b, 1.7, 0.78, 0.37, 0.2, 5);
  skirts(b, 1.7, -0.78, 0.37, 0.2, 5);
  // grades do motor, cabo de reboque e galões na traseira
  for (let i = 0; i < 5; i++) b.box(0.05, 0.012, 0.7, C.metalDark, [-0.55 - i * 0.09, 0.706, 0]);
  b.cyl(0.018, 0.018, 0.9, C.metal, [-0.98, 0.72, 0.1], [Math.PI / 2, 0, 0], 5);
  b.box(0.16, 0.2, 0.08, '#4c5436', [-1.1, 0.62, 0.36]);
  b.box(0.16, 0.2, 0.08, '#4c5436', [-1.1, 0.62, -0.36]);
  // ganchos de reboque e placa do motorista
  for (const zz of [0.3, -0.3]) b.box(0.08, 0.05, 0.05, C.metalDark, [1.14, 0.42, zz]);
  b.box(0.18, 0.04, 0.22, C.oliveDark, [0.72, 0.72, 0.18]);
  b.box(0.03, 0.04, 0.1, '#2a3a44', [0.8, 0.75, 0.18]);
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
  t.box(0.3, 0.08, 0.58, '#5a5236', [-0.8, 0.27, 0]); // lona e mochilas no cesto
  // manga térmica e evacuador de gases no cano
  for (const x of [0.9, 1.25, 1.85]) t.cyl(0.078, 0.078, 0.05, C.olive, [x, 0.17, 0], [0, 0, Math.PI / 2], 8);
  t.cyl(0.09, 0.09, 0.22, C.oliveDark, [1.55, 0.17, 0], [0, 0, Math.PI / 2], 10);
  // mira do atirador e periscópio do comandante (com vidro)
  t.box(0.22, 0.14, 0.16, C.oliveDark, [0.25, 0.39, 0.28]);
  turret.glass.box(0.02, 0.08, 0.11, '#ffffff', [0.365, 0.4, 0.28]);
  t.cyl(0.07, 0.08, 0.16, C.oliveDark, [-0.3, 0.42, 0.22], undefined, 8);
  turret.glass.box(0.02, 0.05, 0.08, '#ffffff', [-0.225, 0.45, 0.22]);
  // blindagem adicional na face da torre
  for (const z of [0.22, -0.22]) t.box(0.06, 0.24, 0.18, C.olive, [0.5, 0.16, z], [0, z > 0 ? -0.5 : 0.5, 0]);
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
  // cubos com porcas, para-lamas sobre as rodas
  for (const x of [-0.8, -0.28, 0.28, 0.8]) {
    for (const z of [0.61, -0.61]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.box(0.025, 0.025, 0.02, C.steel, [x + Math.cos(a) * 0.07, 0.25 + Math.sin(a) * 0.07, z]);
      }
    }
    b.box(0.5, 0.03, 0.26, C.oliveDark, [x, 0.5, 0.5]);
    b.box(0.5, 0.03, 0.26, C.oliveDark, [x, 0.5, -0.5]);
  }
  // periscópios do motorista e da tropa, trilhos no teto, retrovisores e grade do motor
  for (const x of [-0.9, -0.35, 0.3]) for (const z of [0.45, -0.45]) hull.glass.box(0.08, 0.03, 0.03, '#ffffff', [x, 0.97, z]);
  for (const z of [0.42, -0.42]) b.box(1.2, 0.04, 0.03, C.metalDark, [-0.45, 1.0, z]);
  for (const z of [0.56, -0.56]) {
    b.cyl(0.01, 0.01, 0.18, C.metalDark, [1.0, 0.95, z], undefined, 4);
    b.box(0.02, 0.08, 0.06, C.metalDark, [1.0, 1.05, z]);
  }
  for (let i = 0; i < 4; i++) b.box(0.03, 0.012, 0.4, C.metalDark, [0.55 + i * 0.07, 0.97, -0.2], [0, 0, 0]);
  b.box(0.1, 0.24, 0.24, C.oliveDark, [-1.17, 0.62, 0.3]); // porta traseira
  b.box(0.02, 0.06, 0.12, '#8a3f30', [-1.22, 0.5, 0.38]); // lanternas
  b.box(0.02, 0.06, 0.12, '#8a3f30', [-1.22, 0.5, -0.38]);
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
  // lançadores de fumaça e caixa de munição do canhão
  for (const z of [0.2, -0.2]) for (const dy of [0, 0.06]) t.cyl(0.025, 0.025, 0.12, C.metalDark, [0.1, 0.14 + dy, z], [0, 0, 1.2], 6);
  t.box(0.16, 0.14, 0.12, C.oliveDark, [0.05, 0.12, -0.3]);
  turret.glass.box(0.02, 0.05, 0.08, '#ffffff', [0.24, 0.21, 0.12]);
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
  trackDetail(b, 2.15, 0.58, 0.44, 0.28);
  trackDetail(b, 2.15, -0.58, 0.44, 0.28);
  // caixas de munição e ferramentas sobre o para-lama
  for (const x of [-0.7, -0.35, 0.0]) b.box(0.28, 0.12, 0.16, '#4c5436', [x, 0.54, 0.6]);
  b.cyl(0.02, 0.02, 0.7, C.woodDark, [0.4, 0.52, -0.62], [0, 0, Math.PI / 2], 5);
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
  // freio de boca (janelas laterais), evacuador e berço do cano
  t.box(0.06, 0.16, 0.26, C.metalDark, at(2.22), [0, 0, elev]);
  t.box(0.06, 0.16, 0.26, C.metalDark, at(2.38), [0, 0, elev]);
  t.cyl(0.11, 0.11, 0.26, C.oliveDark, at(1.3), [0, 0, -(Math.PI / 2 - elev)], 10);
  t.cyl(0.1, 0.1, 0.5, C.olive, at(0.25), [0, 0, -(Math.PI / 2 - elev)], 10);
  // telêmetro, escotilhas e metralhadora do teto
  t.box(0.1, 0.1, 0.5, C.oliveDark, [0.1, 0.6, 0]);
  turret.glass.box(0.02, 0.06, 0.06, '#ffffff', [0.155, 0.6, 0.22]);
  turret.glass.box(0.02, 0.06, 0.06, '#ffffff', [0.155, 0.6, -0.22]);
  t.cyl(0.11, 0.12, 0.05, C.oliveDark, [-0.2, 0.58, -0.25]);
  t.box(0.3, 0.035, 0.035, C.metalDark, [-0.05, 0.66, -0.25]);
  for (let i = 0; i < 4; i++) t.box(0.02, 0.4, 0.02, C.metalDark, [-0.63, 0.3, -0.35 + i * 0.23]);
  t.box(0.32, 0.3, 0.36, C.oliveDark, [0.48, 0.32, 0]);
  t.cyl(0.11, 0.12, 0.05, C.oliveDark, [-0.2, 0.58, 0.25]);
  t.box(0.5, 0.2, 1.0, C.oliveDark, [-0.45, 0.25, 0]);
  turret.accent.box(0.6, 0.08, 0.02, '#ffffff', [-0.2, 0.4, 0.483]);
  turret.accent.box(0.6, 0.08, 0.02, '#ffffff', [-0.2, 0.4, -0.483]);
  return { hull: hull.build(), turret: turret.build(), turretPivot: [-0.25, 0.62, 0], muzzle: at(2.4) };
}

// ------------------------------------------------------------------ cidadãos

let citizenCache: ModelLayers | null = null;

/**
 * Civil trabalhador (frente = +x, pés em y = 0): macacão, botas e capacete na cor da facção.
 * Um único boneco por instância — desenhado em lote (InstancedMesh) pela camada de cidadãos.
 */
export function citizenModel(): ModelLayers {
  if (citizenCache) return citizenCache;
  const l = layers();
  const b = l.body;
  const s = 1.25;
  const p = (dx: number, dy: number, dz: number): [number, number, number] => [dx * s, dy * s, dz * s];
  const overall = '#4f5e6c';
  b.box(0.1 * s, 0.36 * s, 0.1 * s, overall, p(0, 0.22, 0.065));
  b.box(0.1 * s, 0.36 * s, 0.1 * s, overall, p(0, 0.22, -0.065));
  b.box(0.15 * s, 0.06 * s, 0.11 * s, C.boot, p(0.025, 0.03, 0.065));
  b.box(0.15 * s, 0.06 * s, 0.11 * s, C.boot, p(0.025, 0.03, -0.065));
  b.box(0.18 * s, 0.34 * s, 0.26 * s, overall, p(0, 0.56, 0));
  b.box(0.19 * s, 0.04 * s, 0.27 * s, '#3a2f25', p(0, 0.42, 0)); // cinto
  b.box(0.07 * s, 0.3 * s, 0.07 * s, overall, p(0, 0.56, 0.165), [0.12, 0, 0]);
  b.box(0.07 * s, 0.3 * s, 0.07 * s, overall, p(0, 0.56, -0.165), [-0.12, 0, 0]);
  b.box(0.06 * s, 0.06 * s, 0.06 * s, C.skin, p(0, 0.39, 0.18));
  b.box(0.06 * s, 0.06 * s, 0.06 * s, C.skin, p(0, 0.39, -0.18));
  b.sphere(0.085 * s, C.skin, p(0.01, 0.82, 0), undefined, 8);
  // capacete e colete refletivo na cor da facção
  l.accent.sphere(0.1 * s, '#ffffff', p(0, 0.87, 0), [1, 0.62, 1], 8);
  l.accent.box(0.2 * s, 0.015 * s, 0.22 * s, '#ffffff', p(0.02, 0.84, 0));
  l.accent.box(0.185 * s, 0.05 * s, 0.265 * s, '#ffffff', p(0, 0.62, 0));
  citizenCache = l.build();
  return citizenCache;
}

export function disposeCitizenModel(): void {
  if (!citizenCache) return;
  for (const g of [citizenCache.body, citizenCache.accent, citizenCache.glass]) g.dispose();
  citizenCache = null;
}
