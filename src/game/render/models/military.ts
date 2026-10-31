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

/**
 * Vagas de estacionamento das aeronaves no pátio da Base Aérea (referencial do modelo = mundo, centrado no edifício):
 * posição e rumo (rad, nariz para +z, voltado para a pista). Uma por vaga do hangar (`AIR.hangarPerBase`); as aeronaves
 * paradas de verdade são desenhadas nelas pela camada aérea.
 */
/** Pista da Base Aérea (referencial do edifício): eixo em z e as cabeceiras em x (decolagem e pouso da camada aérea). */
export const AIRBASE_RUNWAY = { z: 3.45, x0: -4.1, x1: 4.0 };

export const AIRBASE_SLOTS: { x: number; z: number; heading: number }[] = [-3.3, -1.1, 1.1, 3.3].map((x) => ({ x, z: 0.85, heading: -Math.PI / 2 }));

const BOMBER = { body: '#2f353b', panel: '#3b424a', belly: '#464e56', dark: '#1d2125', nozzle: '#121416', radome: '#262a2e' };

/** Raio da fuselagem do bombardeiro em cada estação x (da cauda ao nariz), antes do achatamento. */
const BOMBER_BODY: [number, number][] = [
  [-1.3, 0.015],
  [-1.2, 0.055],
  [-0.95, 0.105],
  [-0.45, 0.145],
  [0.15, 0.16],
  [0.65, 0.145],
  [0.98, 0.115],
  [1.22, 0.075],
  [1.4, 0.035],
  [1.5, 0.004],
];
const bomberR = (x: number): number => {
  for (let i = 1; i < BOMBER_BODY.length; i++) {
    const [x1, r1] = BOMBER_BODY[i]!;
    const [x0, r0] = BOMBER_BODY[i - 1]!;
    if (x <= x1) return r0 + ((r1 - r0) * (x - x0)) / (x1 - x0);
  }
  return 0;
};
/** Achatamento da fuselagem: mais larga que alta, fundida com a raiz da asa. */
const BOMBER_SQUASH: [number, number] = [0.78, 1.18];
/** Asa em flecha média (meio caminho da geometria variável): bordo de ataque da raiz à ponta. */
const BOMBER_WING = { rootX: 0.08, rootZ: 0.36, tipX: -0.64, tipZ: 1.24, chordRoot: 0.5, chordTip: 0.17 };
const wingLeadX = (z: number) => BOMBER_WING.rootX + ((BOMBER_WING.tipX - BOMBER_WING.rootX) * (z - BOMBER_WING.rootZ)) / (BOMBER_WING.tipZ - BOMBER_WING.rootZ);

/**
 * Bombardeiro estratégico de asa em flecha (nariz para +x), em low poly: fuselagem longa e achatada fundida às luvas
 * da asa, nariz afilado com radome, para-brisa facetado, quatro motores em duas naceles sob a raiz, deriva alta com o
 * estabilizador embaixo e cauda em ferrão. Cinza-chumbo com painéis em tom mais claro; a cor da nação (camada
 * `accent`) vai na faixa do dorso, nos painéis das luvas, na ponta da deriva e nas pontas das asas. As bombas sob as
 * asas ficam num modelo à parte (`bomberStoresModel`), para sumirem depois do ataque.
 */
function bomberPlane(b: PartBuilder, a: PartBuilder, g: PartBuilder, at: V3, s = 1): void {
  const [x, y, z] = at;
  const P = (dx: number, dy: number, dz: number): V3 => [x + dx * s, y + dy * s, z + dz * s];
  const sc = (pts: [number, number][]) => pts.map(([px, pz]) => [x + px * s, z + pz * s] as [number, number]);
  const X: V3 = [0, 0, Math.PI / 2];
  const top = (px: number) => bomberR(px) * BOMBER_SQUASH[0];
  // fuselagem torneada e achatada; barriga em tom mais claro (meia casca de baixo)
  lathe(b, BOMBER_BODY, BOMBER.body, P(0, 0, 0), s, BOMBER_SQUASH, undefined, 14);
  lathe(b, BOMBER_BODY.map(([px, r]) => [px, r * 1.01] as [number, number]), BOMBER.belly, P(0, -0.004, 0), s, BOMBER_SQUASH, [Math.PI * 0.15, Math.PI * 0.7], 14);
  // radome escuro no nariz e tubo de reabastecimento
  lathe(b, [[1.3, 0.056], [1.4, 0.036], [1.5, 0.006]], BOMBER.radome, P(0.002, 0, 0), s, BOMBER_SQUASH, undefined, 14);
  b.cyl(0.005 * s, 0.005 * s, 0.14 * s, BOMBER.dark, P(1.56, 0, 0), X, 4);
  // luvas da asa fundidas ao corpo (planta em diamante achatado) e quilha dorsal até a deriva
  mirrored(b, sc([[0.95, 0], [0.55, 0.17], [0.0, 0.4], [-0.62, 0.38], [-0.98, 0.15], [-1.05, 0]]), 0.07 * s, BOMBER.body, P(0, -0.045, 0));
  mirrored(b, sc([[0.62, 0], [0.3, 0.12], [-0.2, 0.26], [-0.7, 0.2], [-0.95, 0]]), 0.012 * s, BOMBER.panel, P(0, 0.026, 0));
  // asas em flecha: planta trapezoidal, bordo de ataque em tom claro e farol na ponta
  const W = BOMBER_WING;
  for (const sz of [1, -1]) {
    const wing: [number, number][] = [
      [W.rootX, sz * W.rootZ],
      [W.tipX, sz * W.tipZ],
      [W.tipX - W.chordTip, sz * W.tipZ],
      [W.rootX - W.chordRoot, sz * W.rootZ],
    ];
    b.plan(sc(sz > 0 ? wing : [...wing].reverse()), 0.026 * s, BOMBER.body, P(0, -0.012, 0));
    const lead: [number, number][] = [
      [W.rootX + 0.005, sz * W.rootZ],
      [W.tipX + 0.005, sz * W.tipZ],
      [W.tipX - 0.035, sz * W.tipZ],
      [W.rootX - 0.04, sz * W.rootZ],
    ];
    b.plan(sc(sz > 0 ? lead : [...lead].reverse()), 0.03 * s, BOMBER.belly, P(0, -0.014, 0));
    // flapes (faixa escura no bordo de fuga)
    const flap: [number, number][] = [
      [W.rootX - W.chordRoot + 0.07, sz * (W.rootZ + 0.05)],
      [W.tipX - W.chordTip + 0.04, sz * (W.tipZ - 0.12)],
      [W.tipX - W.chordTip - 0.002, sz * (W.tipZ - 0.12)],
      [W.rootX - W.chordRoot - 0.002, sz * (W.rootZ + 0.05)],
    ];
    b.plan(sc(sz > 0 ? flap : [...flap].reverse()), 0.03 * s, BOMBER.panel, P(0, -0.013, 0));
    // ponta da asa na cor da nação
    const tip: [number, number][] = [
      [W.tipX + 0.004, sz * W.tipZ],
      [W.tipX - W.chordTip - 0.004, sz * W.tipZ],
      [W.tipX - W.chordTip + 0.012, sz * (W.tipZ - 0.1)],
      [wingLeadX(W.tipZ - 0.1), sz * (W.tipZ - 0.1)],
    ];
    a.plan(sc(sz > 0 ? tip.reverse() : tip), 0.032 * s, '#ffffff', P(0, -0.015, 0));
    // painel de identificação na luva (o "letreiro" amarelo da referência), em flecha com a asa
    a.box(0.26 * s, 0.006 * s, 0.07 * s, '#ffffff', P(-0.18, 0.028, sz * 0.27), [0, sz * 0.55, 0]);
    a.box(0.12 * s, 0.006 * s, 0.04 * s, '#ffffff', P(0.12, 0.028, sz * 0.2), [0, sz * 0.55, 0]);
    // nacele dupla sob a raiz: tomada de ar escura na frente, dois bocais atrás
    b.box(0.6 * s, 0.11 * s, 0.27 * s, BOMBER.panel, P(-0.6, -0.1, sz * 0.31));
    b.box(0.08 * s, 0.09 * s, 0.25 * s, BOMBER.nozzle, P(-0.28, -0.1, sz * 0.31));
    for (const e of [0.24, 0.38]) {
      b.cyl(0.05 * s, 0.056 * s, 0.12 * s, BOMBER.dark, P(-0.95, -0.1, sz * e), X, 10);
      b.cyl(0.04 * s, 0.04 * s, 0.125 * s, BOMBER.nozzle, P(-0.955, -0.1, sz * e), X, 10);
    }
    // estabilizador horizontal na base da deriva, em flecha
    b.plan(sc(sz > 0 ? [[-0.98, 0.04], [-1.16, 0.46], [-1.27, 0.46], [-1.22, 0.04]] : [[-1.22, -0.04], [-1.27, -0.46], [-1.16, -0.46], [-0.98, -0.04]]), 0.022 * s, BOMBER.body, P(0, 0.05, 0));
  }
  // faixa da nação ao longo do dorso, acompanhando a curva da fuselagem (do para-brisa à deriva)
  for (let px = 0.86; px > -0.98; px -= 0.16) a.box(0.17 * s, 0.01 * s, 0.05 * s, '#ffffff', P(px, top(px) + 0.002, 0), [0, 0, (top(px + 0.08) - top(px - 0.08)) / 0.16]);
  // cabine: para-brisa facetado em V e janelas laterais
  for (const sz of [1, -1]) {
    g.box(0.15 * s, 0.006 * s, 0.075 * s, '#ffffff', P(1.12, top(1.12) - 0.005, sz * 0.035), [sz * 0.32, 0, -0.42]);
    g.box(0.1 * s, 0.035 * s, 0.006 * s, '#ffffff', P(1.0, top(1.0) - 0.035, sz * bomberR(1.0) * BOMBER_SQUASH[1] * 0.86), [0, sz * 0.2, 0]);
  }
  b.box(0.08 * s, 0.03 * s, 0.012 * s, BOMBER.dark, P(1.17, top(1.17) - 0.004, 0), [0, 0, -0.42]);
  // deriva alta inclinada, com faixa da nação no topo e farol
  b.side(
    [
      [-1.27 * s, 0.03 * s],
      [-0.78 * s, 0.03 * s],
      [-1.06 * s, 0.6 * s],
      [-1.26 * s, 0.6 * s],
    ],
    0.03 * s,
    BOMBER.body,
    P(0, 0, 0),
  );
  a.side(
    [
      [-1.255 * s, 0.5 * s],
      [-0.985 * s, 0.5 * s],
      [-1.055 * s, 0.6 * s],
      [-1.255 * s, 0.6 * s],
    ],
    0.034 * s,
    '#ffffff',
    P(0, 0, 0),
  );
  // ferrão da cauda (contramedidas)
  b.cyl(0.008 * s, 0.03 * s, 0.22 * s, BOMBER.dark, P(-1.38, 0.0, 0), [0, 0, -Math.PI / 2], 8);
  // portas do compartimento de bombas
  for (const dz of [-0.045, 0.045]) b.box(0.7 * s, 0.01 * s, 0.075 * s, BOMBER.dark, P(0.1, -bomberR(0.1) * BOMBER_SQUASH[0] + 0.003, dz));
}

/**
 * Bombas guiadas sob as asas e sob as luvas do bombardeiro (nariz para +x, mesmo referencial e escala de
 * `aircraftModel('bomber')`): corpo escuro, anel na cor da nação perto da ogiva, aletas e cabide. Modelo separado:
 * some na volta, depois que a esquadrilha despejou a carga.
 */
export function bomberStoresModel(s = 1.3): ModelLayers {
  const l = layers();
  const { body: b, accent: a } = l;
  const X: V3 = [0, 0, Math.PI / 2];
  const prof: [number, number][] = [
    [-0.2, 0.012],
    [-0.17, 0.034],
    [-0.08, 0.044],
    [0.11, 0.044],
    [0.19, 0.03],
    [0.24, 0.004],
  ];
  const stations: [number, number][] = [
    [wingLeadX(0.62) - 0.13, 0.62],
    [wingLeadX(0.86) - 0.1, 0.86],
    [wingLeadX(1.08) - 0.07, 1.08],
    [0.2, 0.5],
  ];
  for (const sz of [1, -1])
    for (const [bx, bz] of stations) {
      const at: V3 = [bx * s, -0.085 * s, sz * bz * s];
      lathe(b, prof, '#2a2f34', at, s, [1, 1], undefined, 10);
      a.cyl(0.046 * s, 0.046 * s, 0.03 * s, '#ffffff', [at[0] + 0.14 * s, at[1], at[2]], X, 10);
      a.cyl(0.046 * s, 0.046 * s, 0.015 * s, '#ffffff', [at[0] - 0.12 * s, at[1], at[2]], X, 10);
      for (const r of [0, Math.PI / 2]) b.box(0.06 * s, 0.004 * s, 0.1 * s, '#3b424a', [at[0] - 0.17 * s, at[1], at[2]], [r, 0, 0]);
      b.box(0.14 * s, 0.04 * s, 0.012 * s, '#1d2125', [at[0], at[1] + 0.055 * s, at[2]]);
    }
  return l.build();
}

// ------------------------------------------------------------------ base aérea

/**
 * Caminhão-tanque de reabastecimento (eixo ao longo de +x, cabine na frente): chassi, cabine com para-brisa e capô,
 * tanque cilíndrico com tampas abauladas e passarela em cima, para-lamas, três eixos de rodas grossas, carretel da
 * mangueira atrás e faixa de faixa refletiva. `a` recebe a faixa na cor da nação.
 */
function fuelTruck(b: PartBuilder, a: PartBuilder, g: PartBuilder, x: number, z: number, s = 1): void {
  const P = (dx: number, dy: number, dz: number): V3 => [x + dx * s, dy * s, z + dz * s];
  const X: V3 = [0, 0, Math.PI / 2];
  // chassi e para-choque
  b.box(1.35, 0.06, 0.3, '#2b2d2f', P(0, 0.15, 0));
  b.box(0.04, 0.07, 0.34, '#3a3c3e', P(0.7, 0.16, 0));
  // cabine: bloco com teto chanfrado, para-brisa inclinado, janelas laterais e capô curto
  b.box(0.32, 0.3, 0.34, '#d8d4c6', P(0.48, 0.34, 0));
  b.box(0.2, 0.06, 0.34, '#d8d4c6', P(0.43, 0.52, 0));
  g.box(0.02, 0.15, 0.3, '#ffffff', P(0.64, 0.4, 0), [0, 0, 0.25]);
  for (const sz of [-1, 1]) g.box(0.15, 0.12, 0.01, '#ffffff', P(0.46, 0.41, sz * 0.172));
  b.box(0.1, 0.12, 0.32, '#d8d4c6', P(0.66, 0.24, 0));
  b.box(0.012, 0.06, 0.2, '#2b2d2f', P(0.712, 0.24, 0));
  for (const sz of [-1, 1]) b.box(0.02, 0.03, 0.05, '#f2e6a0', P(0.71, 0.27, sz * 0.12));
  b.box(0.06, 0.03, 0.2, '#e07a2e', P(0.44, 0.565, 0));
  // tanque: cilindro com tampas abauladas, berço, passarela e escotilhas
  b.cyl(0.17, 0.17, 0.8, '#e2e0d8', P(-0.12, 0.36, 0), X, 14);
  for (const sx of [-1, 1]) b.sphere(0.17, '#e2e0d8', P(-0.12 + sx * 0.4, 0.36, 0), [0.35, 1, 1], 12);
  b.box(0.82, 0.04, 0.3, '#4a4d50', P(-0.12, 0.2, 0));
  b.box(0.7, 0.015, 0.1, '#8c8f92', P(-0.12, 0.535, 0));
  for (const dx of [-0.3, 0.06]) b.cyl(0.04, 0.04, 0.03, '#8c8f92', P(dx, 0.545, 0), undefined, 8);
  a.box(0.8, 0.04, 0.005, '#ffffff', P(-0.12, 0.32, 0.172));
  a.box(0.8, 0.04, 0.005, '#ffffff', P(-0.12, 0.32, -0.172));
  // carretel da mangueira e escada traseira
  b.cyl(0.07, 0.07, 0.2, '#2b2d2f', P(-0.6, 0.27, 0), [Math.PI / 2, 0, 0], 10);
  for (const sz of [-1, 1]) b.box(0.012, 0.3, 0.012, '#8c8f92', P(-0.58, 0.36, sz * 0.06));
  // para-lamas e rodas (pneu escuro, cubo claro)
  for (const dx of [0.47, -0.2, -0.42])
    for (const sz of [-1, 1]) {
      b.cyl(0.085, 0.085, 0.07, C.rubber, P(dx, 0.085, sz * 0.15), [Math.PI / 2, 0, 0], 12);
      b.cyl(0.04, 0.04, 0.072, '#9a9d9f', P(dx, 0.085, sz * 0.152), [Math.PI / 2, 0, 0], 8);
    }
  for (const sz of [-1, 1]) b.box(0.4, 0.02, 0.08, '#2b2d2f', P(-0.31, 0.19, sz * 0.15));
}

/**
 * Base Aérea (5×5): pista de ponta a ponta (9,8 de comprimento, cabeceiras zebradas, números, eixo tracejado, luzes de
 * borda e antena de pouso na cabeceira), pátio largo com quatro vagas espaçadas (cabe um bombardeiro em cada, longe do
 * hangar), faixas de taxiamento, hangar em arco com portas de correr, prédio de operações, torre de controle,
 * combustível com mureta de contenção e caminhão-tanque, refletores do pátio, radar de vigilância, bandeira e biruta.
 * As aeronaves paradas não fazem parte do modelo: a camada aérea desenha as que existem de fato, nas vagas
 * (`AIRBASE_SLOTS`).
 */
export function buildAirbaseModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const H = 4.95;
  b.box(H * 2, 0.05, H * 2, '#7b7d76', [0, 0.025, 0]);
  // meio-fio em volta do terreno
  for (const sz of [-1, 1]) {
    b.box(H * 2, 0.07, 0.06, '#9a9b94', [0, 0.04, sz * (H - 0.03)]);
    b.box(0.06, 0.07, H * 2, '#9a9b94', [sz * (H - 0.03), 0.04, 0]);
  }
  // pista (ao longo de x, lado +z)
  const rz = AIRBASE_RUNWAY.z;
  b.box(9.8, 0.03, 1.95, C.asphalt, [0, 0.065, rz]);
  b.box(9.8, 0.031, 0.4, '#4a4c4e', [0, 0.066, rz + 1.12]);
  b.box(9.8, 0.031, 0.25, '#4a4c4e', [0, 0.066, rz - 1.08]);
  for (let i = 0; i < 14; i++) b.box(0.38, 0.01, 0.06, C.white, [-3.9 + i * 0.6, 0.085, rz]);
  for (const sz of [-1, 1]) b.box(9.6, 0.01, 0.04, C.white, [0, 0.085, rz + sz * 0.9]);
  // cabeceiras zebradas, faixa de toque e números da pista nas duas pontas
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) b.box(0.48, 0.01, 0.09, C.white, [sx * 4.55, 0.085, rz - 0.72 + i * 0.24]);
    for (const dz of [-0.45, 0.45]) b.box(0.6, 0.01, 0.16, C.white, [sx * 3.2, 0.085, rz + dz]);
    for (const dz of [-0.18, 0.18]) b.box(0.08, 0.01, 0.26, C.white, [sx * 3.85, 0.085, rz + dz]);
  }
  // luzes de borda
  for (let i = 0; i < 14; i++) for (const sz of [-1, 1]) b.box(0.05, 0.05, 0.05, i % 2 ? '#f2e6a0' : '#d65a4a', [-4.7 + i * 0.723, 0.1, rz + sz * 1.02]);
  // antena do sistema de pouso por instrumentos, além da cabeceira oeste
  b.box(0.08, 0.04, 1.4, C.metal, [-4.85, 0.13, rz]);
  for (let i = 0; i < 7; i++) strut(b, [-4.85, 0.06, rz - 0.6 + i * 0.2], [-4.85, 0.32, rz - 0.6 + i * 0.2], 0.012, C.steel, true);
  // pátio largo com as vagas (quatro, espaçadas para a envergadura do bombardeiro) e faixas de taxiamento
  b.box(8.6, 0.03, 2.55, '#55585b', [0, 0.06, 0.95]);
  b.box(8.6, 0.008, 0.04, C.yellow, [0, 0.08, 2.1]);
  for (const s of AIRBASE_SLOTS) {
    b.box(0.05, 0.008, 1.7, C.yellow, [s.x, 0.08, s.z + 0.25]);
    b.box(1.6, 0.008, 0.04, C.yellow, [s.x, 0.08, s.z - 0.85]);
    for (const sx of [-1, 1]) b.box(0.04, 0.008, 0.5, '#d9d9d2', [s.x + sx * 1.05, 0.08, s.z - 0.55]);
    // calço de roda e extintor ao lado da vaga
    b.box(0.08, 0.12, 0.08, C.red, [s.x + 0.95, 0.12, s.z - 0.75]);
  }
  // refletores do pátio (postes com luminária dupla)
  for (const x of [-4.4, 0, 4.4]) {
    strut(b, [x, 0.05, -0.75], [x, 1.5, -0.75], 0.035, C.steel, true);
    b.box(0.3, 0.06, 0.08, "#3a3d40", [x, 1.5, -0.7]);
    for (const dx of [-0.08, 0.08]) b.box(0.1, 0.05, 0.02, "#f6efc8", [x + dx, 1.47, -0.65]);
  }
  // hangar em arco (meia-cana) com o portão aberto para o pátio e portas de correr recolhidas
  const hx = -3.15;
  const hz = -2.7;
  b.box(3.2, 0.03, 3.0, '#6b6e70', [hx, 0.055, hz + 0.05]);
  b.add(cylHalf(1.45, 3.0), '#8e959b', { pos: [hx, 0.06, hz] });
  for (let i = 0; i < 8; i++) b.add(cylHalf(1.47, 0.03), '#767d83', { pos: [hx, 0.06, hz - 1.45 + i * 0.41] });
  b.box(2.5, 1.2, 0.04, '#2a2d30', [hx, 0.66, hz + 1.5]);
  for (const sx of [-1, 1]) {
    b.box(0.07, 1.42, 0.14, '#6d7378', [hx + sx * 1.33, 0.73, hz + 1.5]);
    b.box(0.6, 1.1, 0.05, '#a7adb2', [hx + sx * 1.62, 0.6, hz + 1.57]);
    for (let k = 0; k < 4; k++) b.box(0.6, 0.015, 0.055, '#8e959b', [hx + sx * 1.62, 0.2 + k * 0.28, hz + 1.57]);
  }
  a.box(1.2, 0.18, 0.02, '#ffffff', [hx, 1.38, hz + 1.48]);
  // claraboia no topo do arco e janelinhas laterais
  g.box(0.3, 0.04, 2.8, '#ffffff', [hx, 1.46, hz]);
  // prédio de operações (dois andares, janelas em fita, ar-condicionado e antenas no teto)
  const ox = 0.3;
  const oz = -3.75;
  b.box(2.0, 0.95, 1.1, '#c9c6bb', [ox, 0.5, oz]);
  b.box(2.08, 0.06, 1.18, C.concreteDark, [ox, 1.0, oz]);
  for (const y of [0.35, 0.72]) g.box(1.8, 0.16, 0.01, '#ffffff', [ox, y, oz + 0.556]);
  b.box(0.4, 0.5, 0.06, '#6d7378', [ox + 0.7, 0.3, oz + 0.57]);
  for (const dx of [-0.6, -0.2]) b.box(0.28, 0.18, 0.28, '#9aa0a6', [ox + dx, 1.12, oz - 0.1]);
  strut(b, [ox + 0.7, 1.03, oz - 0.2], [ox + 0.7, 1.6, oz - 0.2], 0.02, C.steel, true);
  b.cyl(0.14, 0.02, 0.08, '#d9d8d0', [ox + 0.35, 1.12, oz + 0.2], [0.5, 0, 0], 10);
  a.box(0.6, 0.12, 0.01, '#ffffff', [ox - 0.5, 0.9, oz + 0.556]);
  // torre de controle com base, fuste, varanda, cabine envidraçada inclinada e antena
  const tx = 2.65;
  const tz = -3.55;
  b.box(0.95, 0.7, 0.95, '#cfd2d0', [tx, 0.4, tz]);
  b.box(0.98, 0.05, 0.98, C.concreteDark, [tx, 0.77, tz]);
  b.cyl(0.24, 0.27, 1.6, '#cfd2d0', [tx, 1.55, tz], undefined, 10);
  for (let k = 0; k < 3; k++) g.box(0.08, 0.12, 0.01, '#ffffff', [tx, 1.0 + k * 0.45, tz + 0.255]);
  b.cyl(0.55, 0.42, 0.08, C.concreteDark, [tx, 2.38, tz], undefined, 12);
  g.cyl(0.54, 0.42, 0.4, '#ffffff', [tx, 2.62, tz], undefined, 12);
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    b.box(0.03, 0.4, 0.03, C.concreteDark, [tx + Math.cos(ang) * 0.48, 2.62, tz + Math.sin(ang) * 0.48]);
  }
  b.cyl(0.6, 0.6, 0.06, C.roof, [tx, 2.85, tz], undefined, 12);
  strut(b, [tx, 2.88, tz], [tx, 3.4, tz], 0.025, C.steel, true);
  b.box(0.05, 0.05, 0.05, C.red, [tx, 3.42, tz]);
  railing(b, [tx - 0.58, tz - 0.58], [tx + 0.58, tz - 0.58], 2.42, 0.1, C.steel, 3);
  // combustível: dois tanques com bacia e mureta de contenção, tubulação e o caminhão-tanque
  const fx = -0.25;
  const fz = -1.95;
  b.box(2.3, 0.06, 1.15, C.concreteDark, [fx - 0.45, 0.08, fz]);
  for (const sz of [-1, 1]) b.box(2.3, 0.16, 0.06, '#9a9b94', [fx - 0.45, 0.13, fz + sz * 0.56]);
  for (const sx of [-1, 1]) b.box(0.06, 0.16, 1.15, '#9a9b94', [fx - 0.45 + sx * 1.13, 0.13, fz]);
  for (const x of [fx - 0.95, fx + 0.05]) {
    b.cyl(0.4, 0.4, 0.66, C.white, [x, 0.44, fz], undefined, 16);
    b.cyl(0.41, 0.41, 0.04, '#9a9a92', [x, 0.79, fz], undefined, 16);
    b.cyl(0.18, 0.4, 0.07, '#d9d9d2', [x, 0.84, fz], undefined, 16);
    a.box(0.36, 0.07, 0.01, '#ffffff', [x, 0.5, fz + 0.405]);
  }
  strut(b, [fx - 0.95, 0.22, fz + 0.42], [fx + 0.05, 0.22, fz + 0.42], 0.03, C.metal, true);
  strut(b, [fx + 0.05, 0.22, fz + 0.42], [fx + 0.9, 0.22, fz + 0.42], 0.03, C.metal, true);
  fuelTruck(b, a, g, 2.3, -1.9, 1.15);
  // mastro da bandeira e biruta
  strut(b, [-4.6, 0.05, 2.15], [-4.6, 1.6, 2.15], 0.03, C.steel, true);
  a.box(0.02, 0.28, 0.46, '#ffffff', [-4.6, 1.46, 2.39]);
  strut(b, [4.6, 0.05, 2.25], [4.6, 0.85, 2.25], 0.025, C.steel, true);
  b.cyl(0.06, 0.028, 0.3, '#e07a2e', [4.75, 0.82, 2.25], [0, 0, Math.PI / 2], 6);
  // radar de vigilância girando sobre o abrigo, no canto
  const rx = 4.25;
  const rzr = -4.25;
  b.box(0.55, 0.38, 0.55, '#cfd2d0', [rx, 0.24, rzr]);
  strut(b, [rx, 0.43, rzr], [rx, 1.15, rzr], 0.08, C.steel);
  const radar = layers();
  radar.body.box(0.9, 0.3, 0.04, '#d9d8d0', [0, 0.1, 0]);
  for (let i = 0; i < 6; i++) radar.body.box(0.012, 0.28, 0.05, '#9aa0a6', [-0.375 + i * 0.15, 0.1, 0.01]);
  radar.body.box(0.06, 0.06, 0.18, C.metalDark, [0, -0.02, -0.06]);
  const anims: ModelAnim[] = [{ layers: radar.build(), pivot: [rx, 1.2, rzr], motion: { kind: 'spin', axis: 'y', speed: 1.6 } }];
  return { base: l.build(), moving: null, anims, height: 3.4 };
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
  // tampa blindada em duas folhas articuladas (animadas: abrem para o míssil subir)
  const hatch: NonNullable<BuildingModel['hatch']> = [];
  for (const sx of [-1, 1] as const) {
    const leaf = layers();
    // no referencial da dobradiça (borda de fora da folha): a folha se estende para o centro
    leaf.body.box(0.46, 0.08, 0.92, '#6b6f70', [-sx * 0.23, 0, 0]);
    for (let i = 0; i < 3; i++) leaf.body.box(0.44, 0.012, 0.03, '#55595a', [-sx * 0.23, 0.045, -0.3 + i * 0.3]);
    // faixas de alerta na borda que encontra a outra folha e as dobradiças
    leaf.body.box(0.05, 0.085, 0.92, C.yellow, [-sx * 0.435, 0, 0]);
    for (const z of [-0.3, 0.3]) leaf.body.cyl(0.03, 0.03, 0.12, C.metalDark, [0, -0.01, z], [Math.PI / 2, 0, 0], 8);
    hatch.push({ layers: leaf.build(), pivot: [sx * 0.465, 0.29, 0.1], side: sx });
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
  return { base: l.build(), moving: null, anims, hatch, height: 0.9 };
}

// ------------------------------------------------------------------ em voo

/** Aumento dos caças em voo em relação ao tamanho original (no pátio, a camada aérea desfaz para caber na vaga). */
export const FIGHTER_SCALE = 1.45;

/** Aeronave em voo (nariz para +x), com a cor da nação nas marcas. */
export function aircraftModel(type: 'fighter' | 'gripen' | 'bomber' | 'recon' | 'transport'): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  // caças 45% maiores que no começo (presença em tela), com a mesma proporção entre os dois modelos
  if (type === 'fighter') fighter(b, a, g, [0, 0, 0], 0.85 * FIGHTER_SCALE);
  else if (type === 'gripen') gripen(b, a, g, [0, 0, 0], 0.82 * FIGHTER_SCALE);
  else if (type === 'bomber') bomberPlane(b, a, g, [0, 0, 0], 1.3);
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
  // asas cruciformes no meio do corpo (trapezoidais: corda maior junto ao corpo). O giro em x é -ang: assim o eixo z
  // da placa (a envergadura) aponta para (sen ang, cos ang), a mesma direção em que ela é posta, e a placa sai do corpo
  // em vez de ficar de lado, solta no ar
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const cy = Math.sin(ang);
    const cz = Math.cos(ang);
    b.box(0.26, 0.012, 0.13, '#cfcdc4', [0.08, cy * 0.16, cz * 0.16], [-ang, 0, 0]);
    b.box(0.16, 0.012, 0.09, '#cfcdc4', [0.1, cy * 0.27, cz * 0.27], [-ang, 0, 0]);
    // aletas de cauda, maiores, alinhadas com as asas
    b.box(0.22, 0.014, 0.16, '#5b5f63', [-0.47, cy * 0.17, cz * 0.17], [-ang, 0, 0]);
    b.box(0.12, 0.014, 0.08, '#5b5f63', [-0.5, cy * 0.29, cz * 0.29], [-ang, 0, 0]);
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
