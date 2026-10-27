import * as THREE from 'three';
import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

/**
 * Instalações da Fase 7: base aérea (pista com faixas, hangar em arco, torre de controle com
 * cabine envidraçada, tanques de combustível e radar de vigilância girando), bateria antiaérea
 * (lançador de quatro tubos sobre plataforma giratória, radar de tiro e sacos de areia) e silo de
 * mísseis (laje de concreto, tampa blindada em duas folhas, bunker de controle e cerca). Também os
 * modelos desenhados em voo: caça, avião de reconhecimento, cargueiro e míssil.
 */

type Built = Omit<BuildingModel, 'detail'>;
type V3 = [number, number, number];


/**
 * Fuselagem torneada ao longo de x: `prof` dá o raio em cada estação (x, r), da cauda ao nariz.
 * `phi` recorta um setor (manchas de camuflagem sobre a fuselagem); `squash` achata em y e z.
 */
function lathe(b: PartBuilder, prof: [number, number][], color: string, at: V3, s: number, squash: [number, number] = [1, 1], phi?: [number, number], seg = 16): void {
  const pts = prof.map(([x, r]) => new THREE.Vector2(r * s, x * s));
  const g = phi ? new THREE.LatheGeometry(pts, Math.max(4, Math.round((seg * phi[1]) / (Math.PI * 2))), phi[0], phi[1]) : new THREE.LatheGeometry(pts, seg);
  g.rotateZ(-Math.PI / 2);
  b.add(g, color, { pos: at, scale: [1, squash[0], squash[1]] });
}

/** Ângulos do torno (após girar para +x): topo, lados e barriga da fuselagem. */
const TOP = Math.PI * 1.5;

/** Planta espelhada em z (asa, canard, estabilizador): pontos (x, z) só do lado +z. */
function mirrored(b: PartBuilder, half: [number, number][], thick: number, color: string, at: V3): void {
  const pts: [number, number][] = [...half, ...half.slice(1, -1).reverse().map(([x, z]) => [x, -z] as [number, number])];
  b.plan(pts, thick, color, at);
}

/** Míssil ar-ar na ponta da asa (Sidewinder/IRIS-T): corpo branco, ogiva e aletas. */
function wingtipMissile(b: PartBuilder, x: number, y: number, z: number, s: number): void {
  b.cyl(0.018 * s, 0.018 * s, 0.5 * s, '#dcdcd6', [x, y, z], [0, 0, Math.PI / 2], 8);
  b.cyl(0, 0.018 * s, 0.07 * s, '#5b6066', [x + 0.285 * s, y, z], [0, 0, -Math.PI / 2], 8);
  for (const r of [0, Math.PI / 2]) b.box(0.07 * s, 0.006 * s, 0.09 * s, '#b9bab4', [x - 0.2 * s, y, z], [r, 0, 0]);
  for (const r of [0, Math.PI / 2]) b.box(0.05 * s, 0.006 * s, 0.07 * s, '#b9bab4', [x + 0.16 * s, y, z], [r, 0, 0]);
}

const F5 = { base: '#a2aaa3', green: '#5b6f50', dark: '#3e4f3d', metal: '#3a3d40' };

/**
 * F-5EM Tiger II da FAB (nariz para +x): fuselagem fina e longa com nariz pontudo, asa trapezoidal
 * baixa com mísseis nas pontas, estabilizadores baixos, deriva única, dois bocais, tanque ventral
 * e camuflagem em verde e cinza.
 */
function fighter(b: PartBuilder, a: PartBuilder, g: PartBuilder, at: V3, s = 1): void {
  const [x, y, z] = at;
  const P = (dx: number, dy: number, dz: number): V3 => [x + dx * s, y + dy * s, z + dz * s];
  const body: [number, number][] = [
    [-1.0, 0.07],
    [-0.94, 0.1],
    [-0.6, 0.12],
    [-0.2, 0.13],
    [0.15, 0.125],
    [0.45, 0.105],
    [0.7, 0.075],
    [0.9, 0.042],
    [1.07, 0.012],
    [1.12, 0],
  ];
  lathe(b, body, F5.base, at, s, [0.95, 0.85]);
  // camuflagem: manchas verdes sobre o dorso e os flancos
  const patch = (x0: number, x1: number, a0: number, len: number, color: string) =>
    lathe(
      b,
      body.filter(([px]) => px >= x0 && px <= x1).map(([px, r]) => [px, r * 1.02] as [number, number]),
      color,
      at,
      s,
      [0.95, 0.85],
      [a0, len],
    );
  patch(-0.94, -0.2, TOP - 0.9, 1.4, F5.green);
  patch(-0.6, 0.15, 0.3, 1.1, F5.dark);
  patch(0.15, 0.7, TOP - 0.2, 1.3, F5.dark);
  patch(-0.2, 0.45, Math.PI + 0.2, 1.0, F5.green);
  // cabine em gota e moldura
  g.sphere(0.08 * s, '#ffffff', P(0.47, 0.105, 0), [2.4, 0.95, 0.85], 10);
  b.box(0.03 * s, 0.07 * s, 0.13 * s, F5.metal, P(0.33, 0.1, 0));
  b.box(0.3 * s, 0.05 * s, 0.1 * s, F5.base, P(0.18, 0.1, 0));
  // entradas de ar laterais (com a boca escura) e LERX
  for (const sz of [1, -1]) {
    b.box(0.42 * s, 0.11 * s, 0.07 * s, F5.base, P(0.0, -0.005, sz * 0.12));
    b.box(0.02 * s, 0.09 * s, 0.055 * s, '#1c1e20', P(0.215, -0.005, sz * 0.125));
  }
  mirrored(
    b,
    [
      [0.55, 0],
      [0.22, 0.17],
      [0.0, 0.12],
    ],
    0.012 * s,
    F5.base,
    P(0, -0.01, 0),
  );
  // asa trapezoidal enflechada, com mísseis nas pontas
  const wing: [number, number][] = [
    [0.22 * s, 0],
    [-0.31 * s, 0.78 * s],
    [-0.47 * s, 0.78 * s],
    [-0.42 * s, 0],
  ];
  mirrored(b, wing, 0.024 * s, F5.base, P(0, -0.045, 0));
  // manchas nas asas
  for (const sz of [1, -1]) {
    b.plan(
      [
        [0.05 * s, 0.18 * s * sz],
        [-0.18 * s, 0.55 * s * sz],
        [-0.36 * s, 0.5 * s * sz],
        [-0.25 * s, 0.2 * s * sz],
      ],
      0.004 * s,
      sz > 0 ? F5.green : F5.dark,
      P(0, -0.02, 0),
    );
    wingtipMissile(b, x - 0.33 * s, y - 0.045 * s, z + 0.8 * s * sz, s);
    // cocar nacional na asa
    a.cyl(0.07 * s, 0.07 * s, 0.006 * s, '#ffffff', P(-0.28, -0.017, 0.48 * sz), undefined, 14);
  }
  // estabilizadores horizontais baixos e deriva enflechada
  mirrored(
    b,
    [
      [-0.72, 0],
      [-0.9, 0.36],
      [-0.99, 0.36],
      [-0.96, 0],
    ].map((p) => [p[0]! * s, p[1]! * s] as [number, number]),
    0.016 * s,
    F5.green,
    P(0, -0.03, 0),
  );
  b.side(
    [
      [-1.0 * s, 0.07 * s],
      [-0.6 * s, 0.07 * s],
      [-0.86 * s, 0.5 * s],
      [-1.0 * s, 0.5 * s],
    ],
    0.022 * s,
    F5.green,
    P(0, 0, 0),
  );
  b.side(
    [
      [-0.88 * s, 0.3 * s],
      [-0.74 * s, 0.3 * s],
      [-0.82 * s, 0.44 * s],
      [-0.94 * s, 0.44 * s],
    ],
    0.026 * s,
    F5.dark,
    P(0, 0, 0),
  );
  a.box(0.1 * s, 0.07 * s, 0.03 * s, '#ffffff', P(-0.92, 0.42, 0));
  // dois bocais e tanque ventral
  for (const sz of [1, -1]) b.cyl(0.05 * s, 0.045 * s, 0.1 * s, F5.metal, P(-1.02, -0.005, 0.045 * sz), [0, 0, Math.PI / 2], 10);
  lathe(
    b,
    [
      [-0.42, 0],
      [-0.35, 0.045],
      [0.05, 0.06],
      [0.3, 0.045],
      [0.42, 0],
    ],
    '#b4bbb5',
    P(-0.1, -0.17, 0),
    s,
  );
  b.box(0.2 * s, 0.06 * s, 0.015 * s, F5.base, P(-0.1, -0.12, 0));
  // tubo de pitot no nariz
  b.cyl(0.006 * s, 0.006 * s, 0.14 * s, F5.metal, P(1.18, 0, 0), [0, 0, Math.PI / 2], 4);
}

const GRIPEN = { base: '#8e979d', light: '#a4acb1', metal: '#3a3e42' };

/**
 * F-39 Gripen E (nariz para +x): asa em delta com canards à frente, entradas de ar em "D" ao lado
 * da cabine, deriva grande e enflechada, um bocal largo e mísseis nas pontas — cinza uniforme.
 */
function gripen(b: PartBuilder, a: PartBuilder, g: PartBuilder, at: V3, s = 1): void {
  const [x, y, z] = at;
  const P = (dx: number, dy: number, dz: number): V3 => [x + dx * s, y + dy * s, z + dz * s];
  lathe(
    b,
    [
      [-1.1, 0.1],
      [-0.95, 0.14],
      [-0.4, 0.15],
      [0.1, 0.14],
      [0.5, 0.115],
      [0.8, 0.08],
      [1.03, 0.04],
      [1.2, 0.01],
      [1.22, 0],
    ],
    GRIPEN.base,
    at,
    s,
    [1, 0.9],
  );
  // dorso mais claro (espinha) e cabine em bolha
  lathe(
    b,
    [
      [-0.85, 0.145],
      [-0.2, 0.15],
      [0.3, 0.13],
    ].map((p) => [p[0]!, p[1]! * 1.02] as [number, number]),
    GRIPEN.light,
    at,
    s,
    [1, 0.9],
    [TOP - 0.5, 1.0],
  );
  g.sphere(0.085 * s, '#ffffff', P(0.6, 0.11, 0), [2.5, 1.05, 0.9], 12);
  b.box(0.03 * s, 0.08 * s, 0.14 * s, GRIPEN.metal, P(0.42, 0.11, 0));
  // entradas de ar em "D" e canards
  for (const sz of [1, -1]) {
    b.box(0.5 * s, 0.15 * s, 0.08 * s, GRIPEN.base, P(0.2, -0.01, sz * 0.15));
    b.box(0.02 * s, 0.12 * s, 0.065 * s, '#1c1e20', P(0.455, -0.01, sz * 0.155));
  }
  mirrored(
    b,
    [
      [0.62, 0],
      [0.38, 0.42],
      [0.3, 0.42],
      [0.3, 0],
    ].map((p) => [p[0]! * s, p[1]! * s] as [number, number]),
    0.014 * s,
    GRIPEN.base,
    P(0, 0.05, 0),
  );
  // asa em delta com pontas cortadas (trilhos de míssil)
  mirrored(
    b,
    [
      [0.15, 0],
      [-0.62, 0.78],
      [-0.84, 0.78],
      [-0.92, 0],
    ].map((p) => [p[0]! * s, p[1]! * s] as [number, number]),
    0.026 * s,
    GRIPEN.base,
    P(0, -0.04, 0),
  );
  for (const sz of [1, -1]) {
    wingtipMissile(b, x - 0.62 * s, y - 0.04 * s, z + 0.8 * s * sz, s);
    // cabides sob a asa com mísseis de médio alcance
    b.box(0.2 * s, 0.04 * s, 0.02 * s, GRIPEN.metal, P(-0.45, -0.07, 0.42 * sz));
    b.cyl(0.02 * s, 0.02 * s, 0.55 * s, '#cfd0ca', P(-0.4, -0.11, 0.42 * sz), [0, 0, Math.PI / 2], 8);
    a.cyl(0.06 * s, 0.06 * s, 0.006 * s, '#ffffff', P(-0.62, -0.012, 0.55 * sz), undefined, 14);
  }
  // deriva grande e enflechada, com farol na ponta
  b.side(
    [
      [-1.08 * s, 0.1 * s],
      [-0.52 * s, 0.1 * s],
      [-0.86 * s, 0.64 * s],
      [-1.04 * s, 0.64 * s],
    ],
    0.024 * s,
    GRIPEN.base,
    P(0, 0, 0),
  );
  b.box(0.2 * s, 0.03 * s, 0.035 * s, GRIPEN.metal, P(-0.95, 0.65, 0));
  a.box(0.12 * s, 0.07 * s, 0.03 * s, '#ffffff', P(-0.92, 0.5, 0));
  // bocal único, largo, com anel interno escuro
  b.cyl(0.11 * s, 0.095 * s, 0.16 * s, GRIPEN.metal, P(-1.16, 0, 0), [0, 0, Math.PI / 2], 14);
  b.cyl(0.075 * s, 0.075 * s, 0.17 * s, '#141516', P(-1.17, 0, 0), [0, 0, Math.PI / 2], 12);
  // tubo de pitot longo
  b.cyl(0.006 * s, 0.006 * s, 0.2 * s, GRIPEN.metal, P(1.31, 0, 0), [0, 0, Math.PI / 2], 4);
}

/** Avião de reconhecimento: asa reta e longa, hélice dupla e radome. */
function reconPlane(b: PartBuilder, a: PartBuilder, g: PartBuilder, at: V3, s = 1): void {
  const [x, y, z] = at;
  b.cyl(0.06 * s, 0.05 * s, 0.85 * s, '#9aa1a6', [x, y, z], [0, 0, Math.PI / 2], 8);
  b.sphere(0.07 * s, '#9aa1a6', [x + 0.43 * s, y, z], [1.4, 1, 1]);
  g.box(0.1 * s, 0.04 * s, 0.09 * s, '#ffffff', [x + 0.36 * s, y + 0.05 * s, z]);
  b.box(0.14 * s, 0.015 * s, 1.3 * s, '#8b9298', [x + 0.05 * s, y + 0.03 * s, z]);
  for (const sz of [-1, 1]) {
    b.cyl(0.035 * s, 0.03 * s, 0.22 * s, '#6f767c', [x + 0.1 * s, y + 0.02 * s, z + sz * 0.3 * s], [0, 0, Math.PI / 2], 6);
    b.box(0.01 * s, 0.18 * s, 0.02 * s, '#2b2d30', [x + 0.22 * s, y + 0.02 * s, z + sz * 0.3 * s]);
  }
  b.box(0.12 * s, 0.015 * s, 0.4 * s, '#8b9298', [x - 0.38 * s, y + 0.03 * s, z]);
  b.box(0.12 * s, 0.16 * s, 0.015 * s, '#8b9298', [x - 0.38 * s, y + 0.1 * s, z]);
  b.cyl(0.12 * s, 0.12 * s, 0.025 * s, '#d9d8d0', [x - 0.1 * s, y + 0.1 * s, z], undefined, 12);
  a.box(0.2 * s, 0.012 * s, 0.03 * s, '#ffffff', [x - 0.1 * s, y - 0.03 * s, z]);
}

/** Cargueiro de asa alta, quatro motores e rampa traseira. */
function transportPlane(b: PartBuilder, a: PartBuilder, g: PartBuilder, at: V3, s = 1): void {
  const [x, y, z] = at;
  b.cyl(0.11 * s, 0.11 * s, 1.0 * s, '#7c8580', [x, y, z], [0, 0, Math.PI / 2], 10);
  b.sphere(0.11 * s, '#7c8580', [x + 0.5 * s, y, z], [1.2, 1, 1]);
  b.cyl(0.11 * s, 0.05 * s, 0.35 * s, '#7c8580', [x - 0.66 * s, y + 0.03 * s, z], [0, 0, Math.PI / 2], 10);
  g.box(0.08 * s, 0.04 * s, 0.14 * s, '#ffffff', [x + 0.52 * s, y + 0.06 * s, z]);
  b.box(0.22 * s, 0.025 * s, 1.5 * s, '#6f7873', [x + 0.05 * s, y + 0.11 * s, z]);
  for (const sz of [-0.55, -0.3, 0.3, 0.55]) b.cyl(0.04 * s, 0.035 * s, 0.2 * s, '#4a504c', [x + 0.1 * s, y + 0.07 * s, z + sz * s], [0, 0, Math.PI / 2], 8);
  b.box(0.18 * s, 0.02 * s, 0.55 * s, '#6f7873', [x - 0.78 * s, y + 0.25 * s, z]);
  b.box(0.2 * s, 0.24 * s, 0.02 * s, '#6f7873', [x - 0.76 * s, y + 0.14 * s, z]);
  a.box(0.3 * s, 0.05 * s, 0.01 * s, '#ffffff', [x - 0.1 * s, y + 0.03 * s, z + 0.111 * s]);
}

// ------------------------------------------------------------------ base aérea

export function buildAirbaseModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  // pátio e pista (ao longo de x, lado +z)
  b.box(5.9, 0.05, 5.9, '#7b7d76', [0, 0.025, 0]);
  b.box(5.8, 0.03, 1.2, C.asphalt, [0, 0.065, 2.1]);
  for (let i = 0; i < 9; i++) b.box(0.32, 0.01, 0.05, C.white, [-2.5 + i * 0.62, 0.085, 2.1]);
  for (const sz of [-1, 1]) b.box(5.7, 0.01, 0.03, C.white, [0, 0.085, 2.1 + sz * 0.54]);
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) b.box(0.05, 0.01, 0.28, C.white, [sx * (2.55 - (i % 3) * 0.12), 0.085, 1.78 + Math.floor(i / 3) * 0.64]);
  // luzes de borda da pista
  for (let i = 0; i < 8; i++) for (const sz of [-1, 1]) b.box(0.05, 0.05, 0.05, i % 2 ? '#f2e6a0' : '#d65a4a', [-2.8 + i * 0.8, 0.1, 2.1 + sz * 0.66]);
  // pista de taxiamento e pátio de estacionamento
  b.box(0.7, 0.03, 1.6, C.asphalt, [1.3, 0.06, 0.75]);
  b.box(2.6, 0.03, 1.5, '#55585b', [0.9, 0.06, -0.15]);
  b.box(0.04, 0.008, 1.5, C.yellow, [1.3, 0.08, 0.8]);
  for (const x of [0.2, 1.4]) b.box(0.9, 0.008, 0.04, C.yellow, [x, 0.08, -0.15]);
  // hangar em arco (meia-cana) com portões abertos
  const hx = -1.4;
  const hz = -1.0;
  b.add(cylHalf(1.0, 2.0), '#8e959b', { pos: [hx, 0.06, hz] });
  for (let i = 0; i < 6; i++) b.add(cylHalf(1.02, 0.03), '#767d83', { pos: [hx, 0.06, hz - 0.95 + i * 0.38] });
  b.box(1.75, 0.82, 0.04, '#2a2d30', [hx, 0.47, hz + 1.0]); // vão escuro do portão
  b.box(0.06, 0.95, 0.12, '#6d7378', [hx - 0.92, 0.5, hz + 1.0]);
  b.box(0.06, 0.95, 0.12, '#6d7378', [hx + 0.92, 0.5, hz + 1.0]);
  a.box(0.8, 0.14, 0.02, '#ffffff', [hx, 0.98, hz + 0.98]);
  fighter(b, a, g, [hx + 0.1, 0.2, hz + 1.5], 0.52);
  // torre de controle com cabine envidraçada
  const tx = 2.3;
  const tz = -2.2;
  b.box(0.6, 0.5, 0.6, '#cfd2d0', [tx, 0.3, tz]);
  b.cyl(0.18, 0.2, 1.1, '#cfd2d0', [tx, 1.05, tz], undefined, 10);
  b.cyl(0.36, 0.3, 0.06, C.concreteDark, [tx, 1.62, tz], undefined, 12);
  g.cyl(0.36, 0.3, 0.3, '#ffffff', [tx, 1.8, tz], undefined, 12);
  b.cyl(0.4, 0.4, 0.05, C.roof, [tx, 1.97, tz], undefined, 12);
  strut(b, [tx, 2.0, tz], [tx, 2.35, tz], 0.025, C.steel, true);
  b.box(0.05, 0.05, 0.05, C.red, [tx, 2.37, tz]);
  railing(b, [tx - 0.4, tz - 0.4], [tx + 0.4, tz - 0.4], 1.65, 0.1, C.steel, 2);
  // tanques de combustível com bacia de contenção
  b.box(1.4, 0.08, 0.8, C.concreteDark, [0.6, 0.09, -2.35]);
  for (const x of [0.2, 1.0]) {
    b.cyl(0.3, 0.3, 0.5, C.white, [x, 0.38, -2.35], undefined, 14);
    b.cyl(0.31, 0.31, 0.04, '#9a9a92', [x, 0.64, -2.35], undefined, 14);
    a.box(0.3, 0.06, 0.01, '#ffffff', [x, 0.42, -2.04]);
  }
  strut(b, [0.2, 0.2, -2.0], [1.0, 0.2, -2.0], 0.03, C.metal, true);
  // caminhão-tanque de reabastecimento no pátio
  b.box(0.5, 0.18, 0.2, '#c8c3b4', [2.25, 0.2, -0.6]);
  b.box(0.18, 0.2, 0.2, '#5b6650', [2.6, 0.2, -0.6]);
  for (const dx of [-0.15, 0.15, 0.55]) for (const sz of [-1, 1]) b.cyl(0.05, 0.05, 0.04, C.rubber, [2.25 + dx, 0.11, -0.6 + sz * 0.11], [Math.PI / 2, 0, 0], 8);
  fighter(b, a, g, [0.35, 0.18, -0.15], 0.5);
  // mastro da bandeira e biruta
  strut(b, [-2.7, 0.05, 0.9], [-2.7, 1.3, 0.9], 0.03, C.steel, true);
  a.box(0.02, 0.24, 0.38, '#ffffff', [-2.7, 1.18, 1.1]);
  strut(b, [2.7, 0.05, 1.2], [2.7, 0.75, 1.2], 0.025, C.steel, true);
  b.cyl(0.05, 0.025, 0.25, '#e07a2e', [2.82, 0.72, 1.2], [0, 0, Math.PI / 2], 6);
  // radar de vigilância girando sobre a torre do radar
  const rx = -2.4;
  const rz = -2.4;
  b.box(0.4, 0.3, 0.4, '#cfd2d0', [rx, 0.2, rz]);
  strut(b, [rx, 0.35, rz], [rx, 0.95, rz], 0.08, C.steel);
  const radar = layers();
  radar.body.box(0.7, 0.24, 0.04, '#d9d8d0', [0, 0.1, 0]);
  for (let i = 0; i < 5; i++) radar.body.box(0.012, 0.22, 0.05, '#9aa0a6', [-0.3 + i * 0.15, 0.1, 0.01]);
  radar.body.box(0.06, 0.06, 0.18, C.metalDark, [0, -0.02, -0.06]);
  const anims: ModelAnim[] = [{ layers: radar.build(), pivot: [rx, 1.0, rz], motion: { kind: 'spin', axis: 'y', speed: 1.6 } }];
  return { base: l.build(), moving: null, anims, height: 2.4 };
}

// ------------------------------------------------------------------ bateria antiaérea

export function buildAaBatteryModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.9, 0.06, 1.9, '#7d7a6e', [0, 0.03, 0]);
  // anel de sacos de areia
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    if (i === 3) continue;
    b.box(0.28, 0.12, 0.16, C.sandbag, [Math.cos(ang) * 0.78, 0.12, Math.sin(ang) * 0.78], [0, -ang, 0]);
    if (i % 2) b.box(0.26, 0.11, 0.15, '#9b8c63', [Math.cos(ang) * 0.78, 0.23, Math.sin(ang) * 0.78], [0, -ang + 0.2, 0]);
  }
  // base da plataforma giratória
  b.cyl(0.38, 0.42, 0.14, C.oliveDark, [0, 0.13, 0], undefined, 12);
  // radar de tiro (painel) e gerador
  b.box(0.22, 0.2, 0.22, C.olive, [-0.55, 0.16, 0.45]);
  strut(b, [-0.55, 0.26, 0.45], [-0.55, 0.62, 0.45], 0.04, C.steel);
  b.box(0.3, 0.24, 0.03, '#c9ccc4', [-0.55, 0.72, 0.45], [0, 0.6, 0.2]);
  b.box(0.3, 0.16, 0.2, C.olive, [0.55, 0.14, -0.5]);
  g.box(0.08, 0.05, 0.01, '#ffffff', [0.55, 0.18, -0.39]);
  // lançador: torre giratória com quatro tubos inclinados
  const t = layers();
  t.body.box(0.42, 0.14, 0.36, C.olive, [0, 0.07, 0]);
  t.body.box(0.08, 0.2, 0.3, C.oliveDark, [-0.1, 0.22, 0]);
  for (const dy of [0, 0.13]) for (const dz of [-0.08, 0.08]) t.body.cyl(0.05, 0.05, 0.6, C.oliveLight, [0.05, 0.28 + dy, dz], [0, 0, -Math.PI / 2 + 0.6], 8);
  for (const dy of [0, 0.13]) for (const dz of [-0.08, 0.08]) t.body.cyl(0.035, 0.035, 0.01, '#2b2d30', [0.29, 0.45 + dy, dz], [0, 0, -Math.PI / 2 + 0.6], 8);
  t.accent.box(0.2, 0.05, 0.01, '#ffffff', [0, 0.1, 0.181]);
  const anims: ModelAnim[] = [{ layers: t.build(), pivot: [0, 0.2, 0], motion: { kind: 'swing', axis: 'y', amp: 1.1, speed: 0.35 } }];
  a.box(0.1, 0.06, 0.01, '#ffffff', [0.55, 0.12, -0.39]);
  return { base: l.build(), moving: null, anims, height: 1.0 };
}

// ------------------------------------------------------------------ silo de mísseis

export function buildMissileSiloModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(1.9, 0.08, 1.9, '#8a877e', [0, 0.04, 0]);
  // laje do silo e tampa blindada em duas folhas
  b.cyl(0.62, 0.66, 0.16, C.concrete, [0, 0.16, 0.1], undefined, 16);
  b.cyl(0.46, 0.46, 0.02, '#2a2b2c', [0, 0.25, 0.1], undefined, 16);
  for (const sx of [-1, 1]) {
    b.box(0.46, 0.08, 0.92, '#6b6f70', [sx * 0.235, 0.29, 0.1]);
    for (let i = 0; i < 3; i++) b.box(0.44, 0.012, 0.03, '#55595a', [sx * 0.235, 0.335, -0.2 + i * 0.3]);
  }
  for (let i = 0; i < 6; i++) b.box(0.18, 0.01, 0.05, i % 2 ? C.yellow : '#2b2d30', [-0.45 + i * 0.18, 0.245, 0.74]);
  // trilhos de abertura da tampa
  for (const sz of [-0.3, 0.5]) b.box(1.6, 0.03, 0.05, C.metal, [0, 0.1, sz]);
  // respiros e bunker de controle semienterrado
  for (const x of [-0.7, 0.7]) {
    b.cyl(0.06, 0.06, 0.3, C.metalDark, [x, 0.22, -0.55], undefined, 8);
    b.cyl(0.09, 0.09, 0.03, C.metalDark, [x, 0.38, -0.55], undefined, 8);
  }
  b.box(0.7, 0.28, 0.4, C.concreteDark, [0, 0.2, -0.7]);
  b.box(0.76, 0.05, 0.46, C.concrete, [0, 0.36, -0.7]);
  g.box(0.3, 0.06, 0.01, '#ffffff', [0, 0.26, -0.495]);
  a.box(0.3, 0.04, 0.01, '#ffffff', [0, 0.16, -0.495]);
  // cerca e luz de alerta
  railing(b, [-0.9, -0.9], [0.9, -0.9], 0.08, 0.3, C.steel, 4);
  railing(b, [-0.9, 0.9], [0.9, 0.9], 0.08, 0.3, C.steel, 4);
  railing(b, [-0.9, -0.9], [-0.9, 0.9], 0.08, 0.3, C.steel, 4);
  railing(b, [0.9, -0.9], [0.9, 0.9], 0.08, 0.3, C.steel, 4);
  strut(b, [0.75, 0.08, 0.75], [0.75, 0.75, 0.75], 0.03, C.steel, true);
  b.box(0.06, 0.06, 0.06, C.red, [0.75, 0.78, 0.75]);
  const ant = layers();
  ant.body.box(0.24, 0.02, 0.02, C.steel, [0, 0, 0]);
  ant.body.box(0.02, 0.02, 0.2, C.steel, [0, 0, 0]);
  const anims: ModelAnim[] = [{ layers: ant.build(), pivot: [0, 0.48, -0.7], motion: { kind: 'spin', axis: 'y', speed: 0.8 } }];
  strut(b, [0, 0.38, -0.7], [0, 0.48, -0.7], 0.02, C.steel, true);
  return { base: l.build(), moving: null, anims, height: 0.9 };
}

// ------------------------------------------------------------------ em voo

/** Aeronave em voo (nariz para +x), com a cor da nação nas marcas. */
export function aircraftModel(type: 'fighter' | 'gripen' | 'recon' | 'transport'): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  if (type === 'fighter') fighter(b, a, g, [0, 0, 0], 0.85);
  else if (type === 'gripen') gripen(b, a, g, [0, 0, 0], 0.82);
  else if (type === 'recon') reconPlane(b, a, g, [0, 0, 0], 1.4);
  else transportPlane(b, a, g, [0, 0, 0], 1.4);
  return l.build();
}

/**
 * Míssil (ponta para +x). A 1ª geração é o balístico simples com aletas; a 2ª, o míssil pesado do
 * lançador eretor: corpo mais grosso e longo em seções, ogiva escura, asas cruciformes no meio do
 * corpo e aletas de cauda largas, faixas de alerta e tubeira aparente.
 */
export function missileModel(gen = 1): ModelLayers {
  if (gen >= 2) return heavyMissile();
  const l = layers();
  const { body: b, accent: a } = l;
  b.cyl(0.07, 0.07, 0.9, '#d9d8d0', [0, 0, 0], [0, 0, Math.PI / 2], 10);
  b.cyl(0, 0.07, 0.25, '#4a4d50', [0.57, 0, 0], [0, 0, -Math.PI / 2], 10);
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    b.box(0.16, 0.012, 0.12, '#4a4d50', [-0.38, Math.sin(ang) * 0.1, Math.cos(ang) * 0.1], [ang, 0, 0]);
  }
  a.cyl(0.072, 0.072, 0.06, '#ffffff', [0.2, 0, 0], [0, 0, Math.PI / 2], 10);
  return l.build();
}

function heavyMissile(): ModelLayers {
  const l = layers();
  const { body: b, accent: a } = l;
  const X: V3r = [0, 0, Math.PI / 2];
  const tip: V3r = [0, 0, -Math.PI / 2];
  // corpo em três seções (a do meio um pouco mais clara), com anéis de junção
  b.cyl(0.1, 0.1, 0.46, '#e4e2d8', [-0.3, 0, 0], X, 14);
  b.cyl(0.1, 0.1, 0.4, '#efede5', [0.13, 0, 0], X, 14);
  b.cyl(0.1, 0.1, 0.24, '#e4e2d8', [0.45, 0, 0], X, 14);
  for (const x of [-0.07, 0.33]) b.cyl(0.104, 0.104, 0.02, '#9fa19c', [x, 0, 0], X, 14);
  // ogiva escura (radome) em dois cones e ponta metálica
  b.cyl(0.07, 0.1, 0.16, '#3d4044', [0.65, 0, 0], tip, 14);
  b.cyl(0.012, 0.07, 0.17, '#2c2e31', [0.815, 0, 0], tip, 14);
  // tubeira e saia traseira
  b.cyl(0.1, 0.085, 0.05, '#7d8084', [-0.555, 0, 0], X, 14);
  b.cyl(0.075, 0.06, 0.07, '#3a3c3f', [-0.61, 0, 0], X, 12);
  // asas cruciformes no meio do corpo (trapezoidais: corda maior junto ao corpo)
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const cy = Math.sin(ang);
    const cz = Math.cos(ang);
    b.box(0.26, 0.012, 0.13, '#cfcdc4', [0.08, cy * 0.16, cz * 0.16], [ang, 0, 0]);
    b.box(0.16, 0.012, 0.09, '#cfcdc4', [0.1, cy * 0.27, cz * 0.27], [ang, 0, 0]);
    // aletas de cauda, maiores, alinhadas com as asas
    b.box(0.22, 0.014, 0.16, '#5b5f63', [-0.47, cy * 0.17, cz * 0.17], [ang, 0, 0]);
    b.box(0.12, 0.014, 0.08, '#5b5f63', [-0.5, cy * 0.29, cz * 0.29], [ang, 0, 0]);
  }
  // calhas de cabos e janelas de acesso
  b.box(0.7, 0.025, 0.03, '#b9b8b0', [0.0, 0.098, 0]);
  for (const x of [-0.35, -0.2, 0.25]) b.box(0.05, 0.03, 0.02, '#8e8f8a', [x, 0, 0.099]);
  // faixas de alerta e marcas da nação
  b.cyl(0.102, 0.102, 0.035, '#d6a31f', [0.55, 0, 0], X, 14);
  b.cyl(0.102, 0.102, 0.035, '#1f2022', [0.515, 0, 0], X, 14);
  a.cyl(0.103, 0.103, 0.08, '#ffffff', [-0.18, 0, 0], X, 14);
  return l.build();
}

type V3r = [number, number, number];

/** Meia-cana (arco do hangar) de raio r e comprimento len ao longo de z, apoiada em y = 0. */
function cylHalf(r: number, len: number): THREE.BufferGeometry {
  // meia-cana fechada nas pontas: arco no plano xy extrudado ao longo de z
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.absarc(0, 0, r, Math.PI, 0, true);
  shape.lineTo(-r, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -len / 2);
  return g;
}

// ------------------------------------------------------------------ centro de pesquisa militar

/**
 * Centro de Pesquisa Militar (2×2): bloco de laboratórios em concreto com fachada envidraçada,
 * domo de ensaios, antena parabólica girando, campo de provas com alvos e uma peça em teste.
 */
export function buildResearchCenterModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#8a877e', [0, 0.03, 0]);
  // bloco principal de laboratórios (dois andares) com faixa de janelas contínua
  b.box(2.2, 1.2, 1.3, C.concreteLight, [-0.65, 0.66, -1.05]);
  for (const y of [0.45, 0.95]) g.box(2.0, 0.26, 0.02, '#ffffff', [-0.65, y, -0.39]);
  for (const y of [0.3, 0.8]) b.box(2.24, 0.04, 0.08, C.concreteDark, [-0.65, y, -0.38]);
  for (let i = 0; i < 5; i++) b.box(0.04, 1.1, 0.06, C.concreteDark, [-1.65 + i * 0.5, 0.66, -0.38]);
  b.box(2.3, 0.08, 1.4, C.roof, [-0.65, 1.3, -1.05]);
  // equipamentos no telhado: chillers e duto
  for (const x of [-1.3, -0.9]) b.box(0.3, 0.22, 0.4, C.steel, [x, 1.45, -1.15]);
  b.cyl(0.07, 0.07, 1.0, C.metal, [-0.2, 1.42, -1.3], [0, 0, Math.PI / 2], 8);
  // entrada com marquise e placa
  b.box(0.7, 0.05, 0.4, C.metalDark, [-0.65, 0.62, -0.2]);
  for (const x of [-0.95, -0.35]) b.cyl(0.03, 0.03, 0.6, C.metalDark, [x, 0.3, -0.05], undefined, 6);
  g.box(0.5, 0.45, 0.02, '#ffffff', [-0.65, 0.3, -0.385]);
  a.box(1.2, 0.16, 0.02, '#ffffff', [-0.65, 1.17, -0.385]);
  // domo de ensaios (meia esfera) sobre base cilíndrica
  b.cyl(0.62, 0.66, 0.5, C.concrete, [1.1, 0.28, -1.0], undefined, 18);
  b.sphere(0.62, '#d7d9d4', [1.1, 0.52, -1.0], [1, 0.75, 1], 16);
  b.box(0.08, 0.5, 0.5, '#5f6467', [1.1, 0.75, -0.42], [0.25, 0, 0]);
  // campo de provas: pista, banquetas de concreto e alvos de chapa
  b.box(2.6, 0.02, 0.7, '#6f6a5d', [0.15, 0.06, 1.2]);
  for (let i = 0; i < 6; i++) b.box(0.2, 0.012, 0.04, '#d9d8d0', [-1.0 + i * 0.45, 0.075, 1.2]);
  for (const x of [1.25, 1.6]) {
    b.box(0.08, 0.5, 0.36, '#7a7d80', [x, 0.31, 1.2]);
    a.box(0.02, 0.2, 0.2, '#ffffff', [x - 0.05, 0.36, 1.2]);
  }
  for (let i = 0; i < 5; i++) b.box(0.3, 0.18, 0.2, C.concrete, [-1.5 + i * 0.32, 0.12, 0.62]);
  // peça em teste: lançador sobre reboque, apontando para os alvos
  b.box(0.7, 0.08, 0.36, C.oliveDark, [-0.6, 0.22, 1.2]);
  for (const x of [-0.85, -0.4]) for (const z of [1.05, 1.35]) b.cyl(0.1, 0.1, 0.06, C.rubber, [x, 0.12, z], [Math.PI / 2, 0, 0], 10);
  b.cyl(0.06, 0.06, 0.9, C.olive, [-0.45, 0.42, 1.2], [0, 0, -Math.PI / 2 + 0.25], 8);
  // biruta e sensores meteorológicos
  strut(b, [1.6, 0.06, 0.3], [1.6, 1.1, 0.3], 0.025, C.steel);
  b.cyl(0.02, 0.07, 0.3, '#d9772e', [1.75, 1.05, 0.3], [0, 0, Math.PI / 2], 8);
  // antena parabólica (gira devagar acompanhando ensaios)
  b.cyl(0.08, 0.1, 0.3, C.metal, [0.95, 0.2, 0.25], undefined, 8);
  const dish = layers();
  dish.body.cyl(0.03, 0.03, 0.35, C.metalDark, [0, 0.17, 0], undefined, 6);
  dish.body.cyl(0.42, 0.32, 0.06, '#e2e3df', [0.05, 0.42, 0], [0, 0, Math.PI / 2 + 0.5], 16);
  dish.body.cyl(0.015, 0.015, 0.35, C.metalDark, [0.2, 0.5, 0], [0, 0, Math.PI / 2 + 0.5], 4);
  const anims: ModelAnim[] = [{ layers: dish.build(), pivot: [0.95, 0.35, 0.25], motion: { kind: 'spin', axis: 'y', speed: 0.35 } }];
  return { base: l.build(), moving: null, anims, height: 1.6 };
}
