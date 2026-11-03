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

/**
 * Avião de reconhecimento: drone de vigilância de longa autonomia (nariz para +x). Fuselagem longa e fina com a corcova
 * da antena de satélite no nariz, asa reta muito comprida (alto alongamento) no meio do corpo, duas vigas de cauda com
 * derivas inclinadas para fora e o estabilizador entre elas, hélice propulsora atrás, mastro com a antena de enlace,
 * torreta da câmera sob o nariz e trem de pouso fixo. Cinza-claro; faixas das derivas e pontas das asas na cor da nação.
 */
function reconPlane(b: PartBuilder, a: PartBuilder, g: PartBuilder, at: V3, s = 1): void {
  const [x0, y0, z0] = at;
  const P = (x: number, y: number, z: number): V3 => [x0 + x * s, y0 + y * s, z0 + z * s];
  const S = (pts: [number, number][]) => pts.map(([x, z]) => [x0 + x * s, z0 + z * s] as [number, number]);
  const X: V3 = [0, 0, Math.PI / 2];
  const grey = '#b8bfc5';
  const light = '#c9cfd4';
  const dark = '#3a3e42';
  // fuselagem: corpo fino que afina para trás, e a corcova grande da antena de satélite no nariz
  lathe(b, [[-0.62, 0.02], [-0.5, 0.05], [-0.1, 0.065], [0.35, 0.075], [0.55, 0.085], [0.75, 0.08], [0.88, 0.06], [0.96, 0.03], [0.99, 0]], grey, P(0, 0, 0), s, [1, 1], undefined, 12);
  // corcova da antena de satélite: domo que nasce e morre dentro do corpo (sobe só por cima)
  lathe(b, [[0.25, 0], [0.38, 0.045], [0.56, 0.075], [0.72, 0.068], [0.84, 0.045], [0.93, 0]], light, P(0, 0.03, 0), s, [1.05, 0.95], undefined, 12);
  b.cyl(0.003 * s, 0.003 * s, 0.1 * s, dark, P(1.01, 0, 0), X, 4);
  // asa reta muito comprida, um pouco afilada, e as pontas na cor da nação
  mirrored(b, S([[0.12, 0], [0.12, 0.08], [0.08, 1.15], [0.0, 1.17], [-0.06, 1.15], [-0.04, 0.08], [-0.04, 0]]), 0.018 * s, grey, P(0, 0.03, 0));
  for (const sz of [-1, 1]) {
    a.box(0.1 * s, 0.022 * s, 0.07 * s, '#ffffff', P(0.02, 0.039, sz * 1.13));
    // casulos sob a asa (sensores e rádio) e as carenagens do trem principal
    b.cyl(0.018 * s, 0.018 * s, 0.22 * s, light, P(0.03, 0.0, sz * 0.62), X, 8);
    strut(b, P(0.0, 0.02, sz * 0.12), P(-0.02, -0.17, sz * 0.2), 0.012 * s, dark, true);
    b.cyl(0.035 * s, 0.035 * s, 0.025 * s, '#1b1c1e', P(-0.02, -0.18, sz * 0.21), [Math.PI / 2, 0, 0], 10);
  }
  // duas vigas de cauda saindo da asa, com as derivas inclinadas para fora e as faixas da nação
  for (const sz of [-1, 1]) {
    b.cyl(0.018 * s, 0.022 * s, 1.0 * s, grey, P(-0.45, 0.03, sz * 0.3), X, 8);
    const fin: [number, number][] = [
      [-1.0 * s, 0],
      [-0.78 * s, 0],
      [-0.92 * s, 0.32 * s],
      [-1.02 * s, 0.32 * s],
    ];
    b.side(fin, 0.014 * s, grey, P(0, 0.035, sz * 0.3), [sz * 0.32, 0, 0]);
    a.side(
      [
        [-1.012 * s, 0.24 * s],
        [-0.895 * s, 0.24 * s],
        [-0.915 * s, 0.3 * s],
        [-1.017 * s, 0.3 * s],
      ],
      0.018 * s,
      '#ffffff',
      P(0, 0.035, sz * 0.3),
      [sz * 0.32, 0, 0],
    );
  }
  b.box(0.1 * s, 0.012 * s, 0.6 * s, grey, P(-0.95, 0.06, 0));
  // hélice propulsora de três pás atrás da fuselagem
  b.cyl(0.0, 0.03 * s, 0.06 * s, dark, P(-0.66, 0, 0), [0, 0, Math.PI / 2], 8);
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2;
    b.box(0.008 * s, 0.2 * s, 0.03 * s, dark, P(-0.64, Math.cos(ang) * 0.1, Math.sin(ang) * 0.1), [ang, 0, 0.15]);
  }
  // mastro da antena de enlace (haste com o prato achatado)
  b.box(0.06 * s, 0.24 * s, 0.025 * s, light, P(0.12, 0.18, 0), [0, 0, 0.12]);
  b.sphere(0.045 * s, light, P(0.1, 0.31, 0), [1.5, 0.4, 1.1], 10);
  // torreta da câmera sob o nariz (bola com a janela escura) e o trem do nariz
  b.sphere(0.04 * s, light, P(0.72, -0.08, 0), [1, 1, 1], 10);
  g.box(0.012 * s, 0.03 * s, 0.03 * s, '#ffffff', P(0.758, -0.085, 0));
  strut(b, P(0.82, -0.04, 0), P(0.82, -0.17, 0), 0.01 * s, dark, true);
  b.cyl(0.025 * s, 0.025 * s, 0.02 * s, '#1b1c1e', P(0.82, -0.18, 0), [Math.PI / 2, 0, 0], 10);
  // antenas pequenas do dorso
  for (const x of [-0.2, 0.35]) b.box(0.03 * s, 0.05 * s, 0.006 * s, dark, P(x, 0.08, 0), [0, 0, -0.4]);
}

/**
 * Drone de ataque (nariz para +x), com as proporções de um drone armado de longa autonomia (referência: envergadura
 * ~1,8× o comprimento, cauda em "borboleta" com a quilha ventral que protege a hélice, hélice propulsora de quatro
 * pás atrás de um turboélice). Em low poly:
 * - fuselagem fina e longa com a cúpula da antena de satélite no nariz, o cone traseiro do motor e a saída do escape
 *   dos dois lados, tomadas de ar NACA no dorso;
 * - asa reta de alto alongamento, levemente afilada e com um pouco de diedro;
 * - quatro cabides: dois mísseis guiados por dentro e duas bombas guiadas por fora;
 * - torreta de sensores (bola giroestabilizada) sob o nariz, antenas, pitot, trem de pouso com rodas e a quilha.
 * A hélice é desenhada à parte (`droneProp`) para girar. Cinza-claro; pontas das derivas, faixa do dorso e o anel da
 * torreta na cor da nação.
 */
export const DRONE_PROP_X = -1.06;
export function droneModel(s = 1): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  const P = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];
  const S = (pts: [number, number][]) => pts.map(([x, z]) => [x * s, z * s] as [number, number]);
  const X: V3 = [0, 0, Math.PI / 2];
  const grey = '#a3aab0';
  const light = '#b6bcc1';
  const panel = '#8f979e';
  const dark = '#33373b';
  // fuselagem: corpo fino que afina para o motor atrás; o nariz é a cúpula da antena de satélite (bulbo alto)
  lathe(b, [[-1.0, 0.035], [-0.92, 0.055], [-0.6, 0.068], [-0.1, 0.075], [0.3, 0.078], [0.6, 0.08], [0.82, 0.07], [0.94, 0.045], [1.0, 0.012], [1.01, 0]], grey, [0, 0, 0], s, [1, 0.92], undefined, 12);
  lathe(b, [[0.2, 0], [0.34, 0.06], [0.52, 0.095], [0.7, 0.095], [0.84, 0.07], [0.95, 0.03], [0.99, 0]], light, P(0, 0.03, 0), s, [1.1, 0.95], undefined, 14);
  // painéis na barriga e as tomadas de ar NACA no dorso, o escape dos dois lados
  b.box(1.1 * s, 0.012 * s, 0.09 * s, panel, P(-0.15, -0.07, 0));
  for (const sz of [-1, 1]) {
    b.box(0.12 * s, 0.006 * s, 0.03 * s, dark, P(-0.42, 0.064, sz * 0.03), [0, sz * 0.25, 0]);
    b.cyl(0.018 * s, 0.022 * s, 0.07 * s, dark, P(-0.82, 0.0, sz * 0.058), [0, sz * 0.5, Math.PI / 2], 8);
  }
  // asa reta muito longa (envergadura ~1,8× o comprimento), afilada e com um pouco de diedro
  const wing: [number, number][] = [[0.13, 0], [0.13, 0.1], [0.07, 1.72], [0.0, 1.75], [-0.04, 1.72], [-0.07, 0.1], [-0.07, 0]];
  for (const sz of [-1, 1]) {
    const half = S(wing.map(([x, z]) => [x, z * sz] as [number, number]));
    b.add(planWing(half, 0.022 * s, 0.09 * sz), grey, { pos: P(0, 0.05, 0) });
    a.box(0.09 * s, 0.026 * s, 0.06 * s, '#ffffff', P(0.03, 0.05 + 1.7 * 0.09, sz * 1.7), [sz * 0.09, 0, 0]);
  }
  // cauda em borboleta (as duas derivas para cima, abertas) e a quilha ventral que protege a hélice
  for (const sz of [-1, 1]) {
    b.side([[-1.0 * s, 0], [-0.74 * s, 0], [-0.9 * s, 0.4 * s], [-1.01 * s, 0.4 * s]], 0.02 * s, grey, P(0, 0.025, sz * 0.02), [sz * 0.68, 0, 0]);
    a.side([[-1.006 * s, 0.31 * s], [-0.866 * s, 0.31 * s], [-0.9 * s, 0.39 * s], [-1.009 * s, 0.39 * s]], 0.024 * s, '#ffffff', P(0, 0.025, sz * 0.02), [sz * 0.68, 0, 0]);
  }
  b.side([[-1.02 * s, 0], [-0.78 * s, 0], [-0.94 * s, -0.27 * s], [-1.04 * s, -0.27 * s]], 0.02 * s, grey, P(0, -0.03, 0));
  b.cyl(0.006 * s, 0.006 * s, 0.07 * s, dark, P(-1.0, -0.33, 0), X, 4);
  // cone do motor atrás e o cubo da hélice (as pás giram em `droneProp`)
  b.cyl(0.04 * s, 0.052 * s, 0.07 * s, panel, P(-1.0, 0, 0), X, 12);
  b.cyl(0.0, 0.04 * s, 0.07 * s, dark, P(DRONE_PROP_X - 0.04, 0, 0), [0, 0, Math.PI / 2], 10);
  // torreta de sensores giroestabilizada sob o nariz: suporte, bola, janelas escuras e o anel na cor da nação
  b.cyl(0.03 * s, 0.035 * s, 0.04 * s, panel, P(0.66, -0.085, 0), undefined, 10);
  b.sphere(0.055 * s, light, P(0.66, -0.13, 0), [1, 1, 1], 12);
  g.box(0.014 * s, 0.03 * s, 0.05 * s, '#ffffff', P(0.712, -0.13, 0));
  g.box(0.012 * s, 0.018 * s, 0.018 * s, '#ffffff', P(0.705, -0.165, 0.02));
  a.cyl(0.057 * s, 0.057 * s, 0.012 * s, '#ffffff', P(0.66, -0.1, 0), undefined, 12);
  // pitot e antenas (lâmina no dorso, chicotes na barriga)
  b.cyl(0.004 * s, 0.004 * s, 0.12 * s, dark, P(1.06, -0.01, 0.0), X, 4);
  b.box(0.05 * s, 0.07 * s, 0.006 * s, dark, P(0.1, 0.13, 0), [0, 0, -0.35]);
  for (const x of [-0.25, 0.25]) b.box(0.025 * s, 0.05 * s, 0.006 * s, dark, P(x, -0.1, 0), [0, 0, 0.4]);
  // cabides: míssil guiado por dentro, bomba guiada por fora
  for (const sz of [-1, 1]) {
    for (const [zz, kind] of [
      [0.5, 'missile'],
      [0.85, 'bomb'],
    ] as const) {
      const y = 0.05 + zz * 0.09;
      b.box(0.14 * s, 0.035 * s, 0.016 * s, dark, P(0.05, y - 0.03, sz * zz));
      if (kind === 'missile') {
        b.cyl(0.02 * s, 0.02 * s, 0.32 * s, '#5d6267', P(0.07, y - 0.07, sz * zz), X, 8);
        b.cyl(0, 0.02 * s, 0.05 * s, '#3c4044', P(0.255, y - 0.07, sz * zz), [0, 0, -Math.PI / 2], 8);
        for (const r of [0, Math.PI / 2]) b.box(0.045 * s, 0.003 * s, 0.065 * s, '#5d6267', P(-0.07, y - 0.07, sz * zz), [r, 0, 0]);
      } else {
        lathe(b, [[-0.17, 0.01], [-0.12, 0.034], [0.08, 0.036], [0.15, 0.022], [0.19, 0]], '#6b7066', P(0.05, y - 0.075, sz * zz), s, [1, 1], undefined, 10);
        for (const r of [0, Math.PI / 2]) b.box(0.05 * s, 0.003 * s, 0.08 * s, '#6b7066', P(-0.1, y - 0.075, sz * zz), [r, 0, 0]);
      }
    }
  }
  // trem de pouso: o do nariz e os principais saindo da fuselagem, mais altos (a hélice precisa de folga)
  strut(b, P(0.76, -0.07, 0), P(0.76, -0.25, 0), 0.011 * s, dark, true);
  b.cyl(0.032 * s, 0.032 * s, 0.024 * s, '#1b1c1e', P(0.76, -0.26, 0), [Math.PI / 2, 0, 0], 10);
  for (const sz of [-1, 1]) {
    strut(b, P(0.0, -0.05, sz * 0.06), P(-0.06, -0.25, sz * 0.27), 0.013 * s, dark, true);
    b.cyl(0.042 * s, 0.042 * s, 0.028 * s, '#1b1c1e', P(-0.06, -0.26, sz * 0.28), [Math.PI / 2, 0, 0], 10);
  }
  // faixa da nação no dorso
  a.box(0.34 * s, 0.006 * s, 0.035 * s, '#ffffff', P(-0.38, 0.07, 0));
  return l.build();
}

/** Asa em planta com diedro: o perfil (x, z) extrudado em altura e inclinado `dihedral` (rad) para cima na ponta. */
function planWing(pts: [number, number][], h: number, dihedral: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  // diedro: sobe proporcional à distância do eixo
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.abs(pos.getZ(i)) * Math.abs(dihedral));
  g.computeVertexNormals();
  return g;
}

/** Hélice propulsora do drone: quatro pás largas e torcidas em volta do eixo x (girar o grupo em x). */
export function droneProp(s = 1): ModelLayers {
  const l = layers();
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    l.body.box(0.012 * s, 0.25 * s, 0.05 * s, '#2a2d30', [0, Math.cos(ang) * 0.13 * s, Math.sin(ang) * 0.13 * s], [ang, 0, 0.22]);
    l.accent.box(0.013 * s, 0.022 * s, 0.051 * s, '#ffffff', [0, Math.cos(ang) * 0.245 * s, Math.sin(ang) * 0.245 * s], [ang, 0, 0.22]);
  }
  return l.build();
}

const CARGO = { white: '#eceff1', belly: '#cfd4d8', dark: '#2b2e31', metal: '#9aa0a6', prop: '#1d1f22' };

/** Hélice de seis pás com o cubo (cone) na frente da nacele. */
function propeller(b: PartBuilder, x: number, y: number, z: number, r: number, s: number): void {
  b.cyl(0, 0.04 * s, 0.09 * s, CARGO.prop, [x + 0.045 * s, y, z], [0, 0, -Math.PI / 2], 10);
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2 + 0.3;
    b.box(0.01 * s, r * s, 0.05 * s, CARGO.prop, [x, y + Math.cos(ang) * r * 0.5 * s, z + Math.sin(ang) * r * 0.5 * s], [ang, 0, 0.12]);
  }
}

/**
 * Cargueiro turboélice das primeiras eras (Guerra Fria e Pós-Guerra Fria), nariz para +x: fuselagem fina e longa com
 * nariz arredondado e cauda que sobe, asa alta reta e comprida, dois turboélices com hélice de seis pás, carenagens do
 * trem de pouso na barriga e cauda em T. Branco; a deriva, o estabilizador e a faixa da traseira vão na cor da nação.
 */
function cargoTurboprop(b: PartBuilder, a: PartBuilder, g: PartBuilder, s = 1): void {
  const P = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];
  const X: V3 = [0, 0, Math.PI / 2];
  const S = (pts: [number, number][]) => pts.map(([x, z]) => [x * s, z * s] as [number, number]);
  // fuselagem: corpo, nariz e cone de cauda levantado
  b.cyl(0.11 * s, 0.11 * s, 1.25 * s, CARGO.white, P(0.17, 0, 0), X, 14);
  lathe(b, [[0.79, 0.11], [0.93, 0.098], [1.03, 0.068], [1.09, 0.028], [1.11, 0]], CARGO.white, [0, 0, 0], s, [1, 1], undefined, 14);
  b.cyl(0.03 * s, 0.11 * s, 0.62 * s, CARGO.white, P(-0.75, 0.035, 0), [0, 0, Math.PI / 2 + 0.11], 14);
  b.box(1.5 * s, 0.03 * s, 0.17 * s, CARGO.belly, P(0.1, -0.095, 0));
  // cabine: para-brisa em faixas e as janelas laterais
  g.box(0.08 * s, 0.035 * s, 0.17 * s, '#ffffff', P(0.98, 0.058, 0), [0, 0, -0.55]);
  for (const sz of [-1, 1]) g.box(0.09 * s, 0.03 * s, 0.006 * s, '#ffffff', P(0.92, 0.05, sz * 0.096));
  // porta de carga dianteira (contorno)
  for (const sz of [-1, 1]) b.box(0.2 * s, 0.13 * s, 0.004 * s, '#c4c9cd', P(0.6, 0.0, sz * 0.111));
  // carenagens do trem de pouso
  for (const sz of [-1, 1]) b.box(0.32 * s, 0.07 * s, 0.07 * s, CARGO.white, P(0.05, -0.08, sz * 0.12));
  // asa alta reta e longa, com o bordo de ataque escuro (degelo) e as pontas
  mirrored(b, S([[0.24, 0], [0.24, 0.2], [0.19, 1.28], [0.1, 1.3], [0.02, 1.28], [-0.02, 0.2], [-0.02, 0]]), 0.03 * s, CARGO.white, P(0, 0.105, 0));
  mirrored(b, S([[0.245, 0], [0.245, 0.2], [0.195, 1.27], [0.17, 1.27], [0.215, 0.2], [0.215, 0]]), 0.032 * s, CARGO.dark, P(0, 0.104, 0));
  b.box(0.22 * s, 0.07 * s, 0.24 * s, CARGO.white, P(0.11, 0.13, 0));
  // turboélices: nacele sob a asa, escape e hélice
  for (const sz of [-1, 1]) {
    b.cyl(0.055 * s, 0.045 * s, 0.42 * s, CARGO.white, P(0.12, 0.07, sz * 0.4), X, 10);
    b.cyl(0.035 * s, 0.02 * s, 0.12 * s, CARGO.dark, P(-0.13, 0.07, sz * 0.4), X, 8);
    b.box(0.16 * s, 0.015 * s, 0.03 * s, CARGO.dark, P(0.0, 0.03, sz * 0.4));
    propeller(b, 0.34 * s, 0.07 * s, sz * 0.4 * s, 0.2, s);
  }
  // cauda em T: deriva enflechada e estabilizador no topo, na cor da nação
  a.side([[-1.07 * s, 0.07 * s], [-0.68 * s, 0.07 * s], [-0.92 * s, 0.47 * s], [-1.08 * s, 0.47 * s]], 0.03 * s, '#ffffff', P(0, 0, 0));
  a.plan(S([[-0.92, 0], [-0.95, 0.4], [-1.06, 0.4], [-1.09, 0], [-1.06, -0.4], [-0.95, -0.4]]), 0.02 * s, '#ffffff', P(0, 0.46, 0));
  // faixa da nação na traseira (a parte de baixo do cone)
  a.box(0.5 * s, 0.07 * s, 0.2 * s, '#ffffff', P(-0.62, -0.03, 0), [0, 0, 0.11]);
}

/**
 * Cargueiro pesado das eras modernas (Era Digital e Futuro Próximo), nariz para +x: fuselagem larga e longa com o
 * nariz rombudo (porta de carga que levanta) e a cabine elevada, asa alta enflechada com quatro turbofans em pilones,
 * carenagens grossas do trem de pouso com muitas rodas, cauda alta enflechada com o estabilizador embaixo. Branco com
 * a barriga cinza; a faixa ao longo da fuselagem e a deriva vão na cor da nação.
 */
function cargoHeavy(b: PartBuilder, a: PartBuilder, g: PartBuilder, s = 1): void {
  const P = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];
  const X: V3 = [0, 0, Math.PI / 2];
  const S = (pts: [number, number][]) => pts.map(([x, z]) => [x * s, z * s] as [number, number]);
  b.cyl(0.2 * s, 0.2 * s, 1.55 * s, CARGO.white, P(0.1, 0, 0), X, 16);
  lathe(b, [[0.87, 0.2], [1.02, 0.19], [1.14, 0.15], [1.22, 0.09], [1.26, 0]], CARGO.white, [0, 0, 0], s, [0.95, 1], undefined, 16);
  b.cyl(0.04 * s, 0.2 * s, 0.75 * s, CARGO.white, P(-1.02, 0.07, 0), [0, 0, Math.PI / 2 + 0.13], 16);
  // barriga cinza e a corcova da cabine elevada
  b.box(1.9 * s, 0.05 * s, 0.3 * s, CARGO.belly, P(0.05, -0.18, 0));
  lathe(b, [[0.55, 0.0], [0.65, 0.07], [0.95, 0.08], [1.08, 0.04], [1.12, 0]], CARGO.white, P(0, 0.17, 0), s, [0.8, 1.4], undefined, 12);
  g.box(0.07 * s, 0.035 * s, 0.17 * s, '#ffffff', P(1.06, 0.205, 0), [0, 0, -0.6]);
  for (const sz of [-1, 1]) g.box(0.12 * s, 0.03 * s, 0.006 * s, '#ffffff', P(0.95, 0.2, sz * 0.092));
  // faixa larga da nação ao longo da fuselagem (o lugar das cores da referência, sem bandeira)
  for (const sz of [-1, 1]) {
    a.box(1.85 * s, 0.07 * s, 0.006 * s, '#ffffff', P(0.05, -0.07, sz * 0.2));
    a.box(0.4 * s, 0.07 * s, 0.006 * s, '#ffffff', P(1.0, -0.07, sz * 0.185), [0, sz * 0.3, 0]);
  }
  // carenagens do trem de pouso e as rodas em fila
  for (const sz of [-1, 1]) {
    b.box(0.95 * s, 0.1 * s, 0.09 * s, CARGO.white, P(-0.05, -0.15, sz * 0.2));
    for (let k = 0; k < 5; k++) b.cyl(0.04 * s, 0.04 * s, 0.05 * s, CARGO.dark, P(-0.4 + k * 0.18, -0.21, sz * 0.21), [Math.PI / 2, 0, 0], 8);
  }
  // asa alta enflechada
  const wing: [number, number][] = [[0.35, 0], [0.35, 0.18], [-0.38, 1.62], [-0.52, 1.64], [-0.33, 0.18], [-0.33, 0]];
  mirrored(b, S(wing), 0.04 * s, CARGO.white, P(0, 0.16, 0));
  b.box(0.7 * s, 0.08 * s, 0.4 * s, CARGO.white, P(0.0, 0.2, 0));
  // quatro turbofans em pilones, com a entrada de ar escura e o cone de saída
  for (const sz of [-1, 1])
    for (const zz of [0.5, 0.95]) {
      const lead = 0.35 - (zz - 0.18) * (0.73 / 1.44);
      const ex = lead - 0.02;
      b.box(0.24 * s, 0.08 * s, 0.025 * s, CARGO.white, P(ex - 0.08, 0.1, sz * zz));
      b.cyl(0.085 * s, 0.075 * s, 0.4 * s, CARGO.white, P(ex - 0.02, 0.0, sz * zz), X, 12);
      b.cyl(0.07 * s, 0.07 * s, 0.02 * s, CARGO.dark, P(ex + 0.185, 0.0, sz * zz), X, 12);
      b.cyl(0.02 * s, 0.05 * s, 0.1 * s, CARGO.metal, P(ex - 0.26, 0.0, sz * zz), X, 10);
      a.cyl(0.087 * s, 0.087 * s, 0.03 * s, '#ffffff', P(ex + 0.13, 0.0, sz * zz), X, 12);
    }
  // cauda: deriva alta enflechada (na cor da nação na parte de cima) e estabilizador baixo enflechado
  b.side([[-1.4 * s, 0.12 * s], [-0.85 * s, 0.12 * s], [-1.22 * s, 0.82 * s], [-1.4 * s, 0.82 * s]], 0.035 * s, CARGO.white, P(0, 0, 0));
  a.side([[-1.395 * s, 0.5 * s], [-1.05 * s, 0.5 * s], [-1.22 * s, 0.82 * s], [-1.395 * s, 0.82 * s]], 0.039 * s, '#ffffff', P(0, 0, 0));
  mirrored(b, S([[-0.95, 0], [-0.95, 0.06], [-1.25, 0.66], [-1.36, 0.66], [-1.28, 0.06], [-1.28, 0]]), 0.025 * s, CARGO.white, P(0, 0.12, 0));
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
export function aircraftModel(type: 'fighter' | 'gripen' | 'bomber' | 'recon' | 'transport' | 'transport2'): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  // caças 45% maiores que no começo (presença em tela), com a mesma proporção entre os dois modelos
  if (type === 'fighter') fighter(b, a, g, [0, 0, 0], 0.85 * FIGHTER_SCALE);
  else if (type === 'gripen') gripen(b, a, g, [0, 0, 0], 0.82 * FIGHTER_SCALE);
  else if (type === 'bomber') bomberPlane(b, a, g, [0, 0, 0], 1.3);
  else if (type === 'recon') reconPlane(b, a, g, [0, 0, 0], 1.0);
  // cargueiro: turboélice nas eras 1 e 2; o pesado de quatro motores nas eras 3 e 4
  else if (type === 'transport') cargoTurboprop(b, a, g, 1.7);
  else cargoHeavy(b, a, g, 2.0);
  const built = l.build();
  // o cargueiro pesado é longo: estica a fuselagem (e tudo junto) no comprimento
  if (type === 'transport2') for (const geo of [built.body, built.accent, built.glass]) if (geo.getAttribute('position')) geo.scale(1.22, 1, 1);
  return built;
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

/**
 * Míssil de cruzeiro do Submarino Lançador (03/11): corpo cinza fino com ogiva escura, asas retas abertas no meio,
 * entrada de ar embaixo e cauda em cruz; `booster` acrescenta o propulsor de saída (some depois de soltar).
 */
export function cruiseMissileModel(booster: boolean): ModelLayers {
  const l = layers();
  const { body: b, accent: a } = l;
  const X: V3r = [0, 0, Math.PI / 2];
  if (booster) {
    b.cyl(0.075, 0.075, 0.3, '#3f4347', [-0.58, 0, 0], X, 10);
    b.cyl(0.06, 0.075, 0.06, '#26282b', [-0.76, 0, 0], X, 10);
    return l.build();
  }
  b.cyl(0.06, 0.06, 0.82, '#a9adb0', [0, 0, 0], X, 10);
  b.cyl(0.012, 0.06, 0.16, '#3d4044', [0.49, 0, 0], [0, 0, -Math.PI / 2], 10);
  // asas retas abertas e entrada de ar ventral
  b.box(0.12, 0.012, 0.7, '#8e9396', [0.02, 0.02, 0]);
  b.box(0.16, 0.05, 0.06, '#5b6064', [-0.15, -0.065, 0]);
  // cauda em cruz
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    b.box(0.1, 0.01, 0.1, '#5b6064', [-0.36, Math.sin(ang) * 0.08, Math.cos(ang) * 0.08], [ang, 0, 0]);
  }
  a.cyl(0.062, 0.062, 0.05, '#ffffff', [0.22, 0, 0], X, 10);
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
 * Centro de Pesquisa Militar (2×2), campus em low poly:
 * - laboratório de três andares escalonados, fachada de vidro com montantes, átrio envidraçado na esquina e mastro
 *   com luz na cor da nação; máquinas no telhado;
 * - radome (esfera de radar) sobre torre treliçada: o ponto mais alto, reconhecível de longe;
 * - túnel de vento (tubo com bocal de entrada e casa do ventilador) em cavaletes;
 * - plataforma de testes com míssil inclinado no lançador e muro defletor;
 * - antena parabólica girando, caminhos, cerca e cancela.
 */
export function buildResearchCenterModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#8a877e', [0, 0.03, 0]);
  // caminhos e pátio
  b.box(3.7, 0.012, 0.42, '#6d6a63', [0, 0.066, 0.42]);
  b.box(0.42, 0.012, 1.5, '#6d6a63', [0.35, 0.066, 1.2]);
  // cerca com cancela na frente
  railing(b, [-1.9, -1.9], [1.9, -1.9], 0.06, 0.26, '#a7adb2', 6);
  railing(b, [-1.9, -1.9], [-1.9, 1.9], 0.06, 0.26, '#a7adb2', 6);
  railing(b, [1.9, -1.9], [1.9, 1.9], 0.06, 0.26, '#a7adb2', 6);
  railing(b, [-1.9, 1.9], [0.1, 1.9], 0.06, 0.26, '#a7adb2', 4);
  railing(b, [0.6, 1.9], [1.9, 1.9], 0.06, 0.26, '#a7adb2', 3);
  b.box(0.12, 0.3, 0.12, '#5f6467', [0.12, 0.18, 1.9]);
  a.box(0.48, 0.04, 0.04, '#ffffff', [0.38, 0.3, 1.9]);

  // --- laboratório: dois andares + terceiro recuado
  const [lx, lz] = [-0.75, -1.2];
  b.box(2.3, 1.2, 1.35, C.concreteLight, [lx, 0.66, lz]);
  for (const y of [0.42, 0.92]) g.box(2.12, 0.3, 0.02, '#ffffff', [lx, y, lz + 0.685]);
  for (const y of [0.26, 0.76, 1.24]) b.box(2.34, 0.05, 0.09, C.concreteDark, [lx, y, lz + 0.68]);
  for (let i = 0; i <= 7; i++) b.box(0.035, 1.15, 0.05, '#6b7177', [lx - 1.07 + i * 0.306, 0.68, lz + 0.69]);
  b.box(2.36, 0.07, 1.41, C.roof, [lx, 1.29, lz]);
  b.box(1.5, 0.48, 0.85, C.concrete, [lx - 0.25, 1.56, lz - 0.2]);
  g.box(1.38, 0.24, 0.02, '#ffffff', [lx - 0.25, 1.58, lz + 0.23]);
  b.box(1.56, 0.06, 0.9, C.roof, [lx - 0.25, 1.83, lz - 0.2]);
  a.box(1.56, 0.08, 0.02, '#ffffff', [lx - 0.25, 1.75, lz + 0.235]);
  // máquinas no telhado e mastro com luz
  for (const x of [0.15, 0.45]) b.box(0.24, 0.18, 0.32, C.steel, [lx + x, 1.42, lz - 0.35]);
  b.cyl(0.1, 0.1, 0.06, '#40454b', [lx + 0.3, 1.52, lz - 0.35], undefined, 10);
  strut(b, [lx - 0.8, 1.86, lz - 0.3], [lx - 0.8, 2.45, lz - 0.3], 0.02, C.steel);
  a.sphere(0.05, '#ffffff', [lx - 0.8, 2.47, lz - 0.3], undefined, 6);
  // átrio envidraçado na esquina e marquise da entrada
  g.box(0.5, 0.96, 0.56, '#ffffff', [lx + 1.42, 0.55, lz + 0.35]);
  for (const [dx, dz] of [
    [-0.26, 0.29],
    [0.26, 0.29],
    [0.26, -0.29],
  ] as const) b.box(0.06, 1.0, 0.06, C.concreteLight, [lx + 1.42 + dx, 0.56, lz + 0.35 + dz]);
  b.box(0.62, 0.07, 0.68, C.concreteLight, [lx + 1.42, 1.08, lz + 0.35]);
  b.box(0.5, 0.03, 0.02, C.concreteDark, [lx + 1.42, 0.56, lz + 0.64]);
  b.box(0.75, 0.04, 0.38, C.metalDark, [lx + 0.2, 0.55, lz + 0.88]);
  for (const x of [-0.12, 0.52]) b.cyl(0.025, 0.025, 0.5, C.metalDark, [lx + x, 0.3, lz + 1.03], undefined, 6);

  // --- radome sobre torre treliçada
  const [rx, rz] = [1.3, -1.3];
  const H = 1.35;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) strut(b, [rx + sx * 0.32, 0.06, rz + sz * 0.32], [rx + sx * 0.16, H, rz + sz * 0.16], 0.03, C.steel);
  for (const y of [0.45, 0.9]) {
    const w = 0.32 - (0.16 * y) / H;
    b.box(w * 2, 0.03, 0.03, C.steel, [rx, y, rz - w]);
    b.box(w * 2, 0.03, 0.03, C.steel, [rx, y, rz + w]);
    b.box(0.03, 0.03, w * 2, C.steel, [rx - w, y, rz]);
    b.box(0.03, 0.03, w * 2, C.steel, [rx + w, y, rz]);
  }
  b.box(0.52, 0.06, 0.52, C.metalDark, [rx, H + 0.03, rz]);
  b.sphere(0.44, '#e9eae6', [rx, H + 0.44, rz], undefined, 14);
  a.cyl(0.36, 0.36, 0.05, '#ffffff', [rx, H + 0.14, rz], undefined, 14);

  // --- túnel de vento em cavaletes, na lateral (no sentido da profundidade, sem tapar a fachada)
  const wx = -1.4;
  const ty = 0.42;
  const along: [number, number, number] = [Math.PI / 2, 0, 0];
  b.cyl(0.24, 0.24, 1.35, '#b9bdbf', [wx, ty, 0.62], along, 12);
  b.cyl(0.42, 0.24, 0.42, '#b9bdbf', [wx, ty, 1.5], along, 12);
  b.cyl(0.36, 0.36, 0.03, '#2d3136', [wx, ty, 1.715], along, 12);
  b.box(0.62, 0.62, 0.55, C.concrete, [wx, 0.37, -0.25]);
  for (const dy of [-0.15, 0, 0.15]) b.box(0.5, 0.06, 0.02, '#5c6166', [wx, 0.37 + dy, 0.03]);
  for (const z of [0.2, 0.7, 1.2]) {
    b.box(0.36, ty - 0.2, 0.06, C.metalDark, [wx, (ty - 0.2) / 2 + 0.06, z]);
    b.box(0.4, 0.04, 0.26, C.metalDark, [wx, ty - 0.22, z]);
  }
  a.cyl(0.25, 0.25, 0.08, '#ffffff', [wx, ty, 0.9], along, 12);

  // --- plataforma de testes (frente à direita): lançador com míssil inclinado e muro defletor
  const [px, pz] = [1.15, 1.25];
  b.box(1.1, 0.05, 0.9, '#76726a', [px, 0.08, pz]);
  b.box(0.08, 0.55, 0.8, C.concrete, [px - 0.5, 0.35, pz]);
  b.box(0.6, 0.14, 0.36, C.oliveDark, [px, 0.18, pz]);
  b.box(0.12, 0.25, 0.12, C.olive, [px - 0.12, 0.35, pz]);
  const tilt = 0.65;
  b.box(0.95, 0.06, 0.14, C.olive, [px + 0.12, 0.5, pz], [0, 0, tilt]);
  b.cyl(0.055, 0.055, 0.8, '#e3e4df', [px + 0.14, 0.6, pz], [0, 0, tilt - Math.PI / 2], 10);
  b.cyl(0.0, 0.055, 0.16, '#e3e4df', [px + 0.14 + Math.cos(tilt) * 0.48, 0.6 + Math.sin(tilt) * 0.48, pz], [0, 0, tilt - Math.PI / 2], 10);
  a.cyl(0.058, 0.058, 0.06, '#ffffff', [px + 0.14 + Math.cos(tilt) * 0.2, 0.6 + Math.sin(tilt) * 0.2, pz], [0, 0, tilt - Math.PI / 2], 10);
  // biruta
  strut(b, [1.75, 0.06, 0.35], [1.75, 0.95, 0.35], 0.02, C.steel);
  b.cyl(0.02, 0.06, 0.26, '#d9772e', [1.62, 0.9, 0.35], [0, 0, Math.PI / 2], 8);

  // --- antena parabólica (gira devagar acompanhando os ensaios)
  b.cyl(0.1, 0.13, 0.32, C.metal, [-0.15, 0.22, 0.75], undefined, 8);
  const dish = layers();
  const bowl = new THREE.LatheGeometry(
    [
      [0.02, 0],
      [0.22, 0.03],
      [0.4, 0.1],
      [0.5, 0.18],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    14,
  );
  bowl.deleteAttribute('normal');
  dish.body.cyl(0.035, 0.035, 0.3, C.metalDark, [0, 0.15, 0], undefined, 6);
  dish.body.add(bowl, '#e2e3df', { pos: [0, 0.35, 0], rot: [0, 0, -0.75] });
  dish.body.add(new THREE.LatheGeometry([new THREE.Vector2(0.48, 0.18), new THREE.Vector2(0.4, 0.1), new THREE.Vector2(0.22, 0.03), new THREE.Vector2(0.02, 0)], 14), '#c9cbc7', {
    pos: [0, 0.35, 0],
    rot: [0, 0, -0.75],
  });
  dish.body.cyl(0.012, 0.012, 0.45, C.metalDark, [0.17, 0.52, 0], [0, 0, -0.75], 4);
  const anims: ModelAnim[] = [{ layers: dish.build(), pivot: [-0.15, 0.38, 0.75], motion: { kind: 'spin', axis: 'y', speed: 0.35 } }];
  return { base: l.build(), moving: null, anims, height: 1.85 };
}
