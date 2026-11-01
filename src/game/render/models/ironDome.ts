import * as THREE from "three";
import { layers, type PartBuilder } from "./kit.ts";
import { railing, strut } from "./rigging.ts";
import type { BuildingModel } from "./buildingModels.ts";

type Built = Omit<BuildingModel, "detail">;
type V3 = [number, number, number];

const SAND = "#dcc088";
const SAND_DARK = "#b59b6a";
const SAND_LIGHT = "#ead5a6";
// tampas dos tubos bem escuras: com a pintura metálica do Futuro Próximo, um tom médio refletia o céu e parecia painel solar
const CAP = "#16181a";
const STEEL = "#8f969d";

/** Inclinação dos lançadores (rad acima da horizontal) e o giro do referencial do casulo em torno de x. */
const ELEV = 1.2;
const TILT = Math.PI / 2 - ELEV;
/** Lançadores: posição da dobradiça (base do casulo) no referencial do modelo. */
const LAUNCHERS: V3[] = [
  [-1.15, 0.5, 0.15],
  [0, 0.5, 0.45],
  [1.15, 0.5, 0.15],
];
/** Casulo: 5 × 4 tubos, comprimento ao longo do eixo. */
const COLS = 5;
const ROWS = 4;
const PITCH = 0.118;
const LEN = 1.05;

/** Ponto do referencial do casulo (eixo +y ao longo dos tubos) levado ao modelo. */
function frame(pivot: V3, local: V3): V3 {
  const [x, y, z] = local;
  const c = Math.cos(TILT);
  const s = Math.sin(TILT);
  return [pivot[0] + x, pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
}

/** Bocas dos tubos de cada lançador e a direção de saída (referencial do modelo = mundo, centrado no edifício). */
export const DOME_TUBES: { mouths: V3[]; dir: V3 }[] = LAUNCHERS.map((p) => {
  const mouths: V3[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      mouths.push(
        frame(p, [
          (c - (COLS - 1) / 2) * PITCH,
          LEN + 0.02,
          (r - (ROWS - 1) / 2) * PITCH,
        ]),
      );
  return { mouths, dir: [0, Math.sin(ELEV), Math.cos(ELEV)] };
});

/** Peça no referencial do casulo (girada junto com ele). */
function boxIn(
  b: PartBuilder,
  pivot: V3,
  w: number,
  h: number,
  d: number,
  color: string,
  local: V3,
): void {
  b.box(w, h, d, color, frame(pivot, local), [TILT, 0, 0]);
}

/** Rodas de caminhão/reboque (eixo ao longo de x quando `alongX` é falso). */
function wheel(
  b: PartBuilder,
  at: V3,
  r: number,
  w: number,
  alongX = false,
  hub = false,
): void {
  const rot: V3 = alongX ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
  b.cyl(r, r, w, "#232526", at, rot, 8);
  if (hub) b.cyl(r * 0.5, r * 0.5, w + 0.01, STEEL, at, rot, 6);
}

/** Tampa redonda de tubo (disco de 7 lados virado para +z antes da rotação). */
const cap = (): THREE.BufferGeometry =>
  new THREE.CircleGeometry(PITCH * 0.4, 7);

/**
 * Domo de Ferro (2×2), bateria de defesa antimíssil em low poly, feita a partir das fotos de referência:
 * - três lançadores sobre reboque com cambão, estabilizadores hidráulicos abertos com sapatas redondas, casulos de 20
 *   tubos (5 × 4) inclinados a ~69° com as tampas redondas, nervuras, trilhos laterais, cavaletes em A e o macaco;
 *   atrás de cada um o mastro de comunicação estaiado, com o painel branco em losango;
 * - radar de busca (painel grande de módulos, inclinado, sobre plataforma giratória, que gira devagar) num reboque
 *   com sapatas, e a faixa de IFF em cima;
 * - centro de controle (contêiner com ar-condicionado e antenas) sob rede de camuflagem, gerador protegido por sacos
 *   de areia, caminhão de recarga com guindaste e um casulo reserva na carroceria;
 * - cascalho com marcas de pneu, cerca com portão, giroflexes laranja.
 * A faixa da nação vai na lateral de cada casulo, no radar, no contêiner e na porta do caminhão.
 */
export function buildIronDome(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.8, 0.06, 3.8, "#9b958a", [0, 0.03, 0]);
  b.box(3.5, 0.02, 1.6, "#8c867b", [0, 0.07, 0.3]);
  // marcas de pneu do portão até os lançadores e o caminhão
  for (const dx of [-0.12, 0.12])
    b.box(0.07, 0.012, 1.6, "#7f796e", [-0.38 + dx, 0.066, 1.05]);
  for (const dz of [-0.1, 0.1])
    b.box(1.5, 0.012, 0.07, "#7f796e", [0.45, 0.066, 1.4 + dz]);
  // cerca de arame com o portão aberto na frente
  railing(b, [-1.85, -1.85], [1.85, -1.85], 0.06, 0.32, "#a9aeb2", 6);
  railing(b, [-1.85, 1.85], [-0.72, 1.85], 0.06, 0.32, "#a9aeb2", 2);
  railing(b, [-0.04, 1.85], [1.85, 1.85], 0.06, 0.32, "#a9aeb2", 3);
  railing(b, [-1.85, -1.85], [-1.85, 1.85], 0.06, 0.32, "#a9aeb2", 6);
  railing(b, [1.85, -1.85], [1.85, 1.85], 0.06, 0.32, "#a9aeb2", 6);
  // folhas do portão abertas para dentro (tubo de cima e de baixo)
  for (const [x0, x1] of [
    [-0.72, -0.86],
    [-0.04, 0.1],
  ] as const)
    for (const y of [0.1, 0.36])
      strut(b, [x0, y, 1.85], [x1, y, 1.52], 0.012, "#a9aeb2", true);
  strut(b, [-0.86, 0.06, 1.52], [-0.86, 0.38, 1.52], 0.02, "#a9aeb2", true);
  strut(b, [0.1, 0.06, 1.52], [0.1, 0.38, 1.52], 0.02, "#a9aeb2", true);

  for (const p of LAUNCHERS) {
    const [px, , pz] = p;
    // reboque: plataforma, eixo duplo com rodas atrás, cambão na frente
    b.box(0.86, 0.1, 1.15, SAND_DARK, [px, 0.36, pz - 0.05]);
    b.box(0.8, 0.12, 0.3, SAND, [px, 0.24, pz - 0.5]);
    for (const dx of [-0.37, 0.37])
      for (const dz of [-0.36, -0.6])
        wheel(b, [px + dx, 0.15, pz + dz], 0.13, 0.1);
    strut(b, [px - 0.3, 0.3, pz + 0.5], [px, 0.2, pz + 0.85], 0.03, SAND_DARK);
    strut(b, [px + 0.3, 0.3, pz + 0.5], [px, 0.2, pz + 0.85], 0.03, SAND_DARK);
    b.cyl(0.035, 0.035, 0.05, STEEL, [px, 0.2, pz + 0.88], undefined, 6);
    // estabilizadores abertos: viga, macaco e sapata redonda nos quatro cantos
    for (const [sx, dz] of [
      [-1, 0.42],
      [1, 0.42],
      [-1, -0.28],
      [1, -0.28],
    ] as const) {
      b.box(0.16, 0.06, 0.07, SAND_DARK, [px + sx * 0.5, 0.33, pz + dz]);
      b.box(0.05, 0.24, 0.05, STEEL, [px + sx * 0.56, 0.2, pz + dz]);
      b.cyl(
        0.075,
        0.085,
        0.03,
        "#5d5a53",
        [px + sx * 0.56, 0.08, pz + dz],
        undefined,
        7,
      );
    }
    // casulo: corpo, nervuras, trilhos laterais e a face dos tubos com as tampas redondas escuras
    boxIn(b, p, COLS * PITCH + 0.06, LEN, ROWS * PITCH + 0.06, SAND, [
      0,
      LEN / 2,
      0,
    ]);
    for (let k = 0; k < 4; k++) {
      const y = 0.15 + k * 0.27;
      boxIn(b, p, COLS * PITCH + 0.09, 0.05, ROWS * PITCH + 0.09, SAND_DARK, [
        0,
        y,
        0,
      ]);
    }
    for (const sx of [-1, 1])
      for (let k = 0; k < 3; k++)
        boxIn(b, p, 0.02, LEN * 0.9, 0.06, SAND_DARK, [
          sx * (COLS * PITCH * 0.5 + 0.035),
          LEN / 2,
          (k - 1) * 0.15,
        ]);
    boxIn(b, p, COLS * PITCH + 0.03, 0.012, ROWS * PITCH + 0.03, SAND_DARK, [
      0,
      LEN + 0.003,
      0,
    ]);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const at = frame(p, [
          (c - (COLS - 1) / 2) * PITCH,
          LEN + 0.011,
          (r - (ROWS - 1) / 2) * PITCH,
        ]);
        b.add(cap(), CAP, { pos: at, rot: [TILT - Math.PI / 2, 0, 0] });
      }
    boxIn(b, p, COLS * PITCH + 0.07, 0.06, 0.06, SAND_LIGHT, [
      0,
      LEN - 0.03,
      (ROWS * PITCH) / 2 + 0.03,
    ]);
    // alças de içamento no topo e a caixa de conexões atrás do casulo
    for (const sx of [-1, 1])
      boxIn(b, p, 0.03, 0.06, 0.08, STEEL, [
        sx * (COLS * PITCH * 0.5 + 0.02),
        LEN - 0.08,
        -(ROWS * PITCH) / 2 - 0.05,
      ]);
    boxIn(b, p, 0.26, 0.2, 0.06, SAND_LIGHT, [
      0.12,
      0.42,
      -(ROWS * PITCH) / 2 - 0.06,
    ]);
    // faixa da nação na lateral do casulo
    for (const sx of [-1, 1]) {
      const at = frame(p, [sx * (COLS * PITCH * 0.5 + 0.045), LEN * 0.62, 0]);
      a.box(0.012, 0.16, 0.36, "#ffffff", at, [TILT, 0, 0]);
    }
    // cavaletes em A do reboque até o meio do casulo e o macaco hidráulico
    for (const sx of [-1, 1]) {
      const top = frame(p, [sx * 0.3, LEN * 0.55, -(ROWS * PITCH) / 2]);
      strut(b, [px + sx * 0.38, 0.42, pz - 0.4], top, 0.035, SAND_DARK);
      strut(b, [px + sx * 0.38, 0.42, pz + 0.35], top, 0.035, SAND_DARK);
    }
    strut(
      b,
      [px, 0.42, pz - 0.45],
      frame(p, [0, LEN * 0.35, -(ROWS * PITCH) / 2]),
      0.05,
      STEEL,
      true,
    );
    strut(
      b,
      [px, 0.42, pz - 0.45],
      frame(p, [0, LEN * 0.2, -(ROWS * PITCH) / 2]),
      0.075,
      SAND_DARK,
      true,
    );
    // mastro de comunicação atrás do lançador, estaiado, com o painel branco em losango
    const mx = px + 0.3;
    const mz = pz - 0.62;
    b.cyl(0.018, 0.024, 2.1, "#d7d9d6", [mx, 0.42 + 1.05, mz], undefined, 6);
    b.box(0.04, 0.06, 0.04, STEEL, [mx, 2.45, mz]);
    b.box(
      0.3,
      0.3,
      0.02,
      "#eef0ee",
      [mx, 2.62, mz + 0.03],
      [0, 0, Math.PI / 4],
    );
    b.box(0.07, 0.07, 0.05, "#55595d", [mx, 2.62, mz + 0.05]);
    b.cyl(0.006, 0.006, 0.3, "#2a2c2e", [mx - 0.05, 2.85, mz], undefined, 4);
    for (let k = 0; k < 5; k++)
      b.box(
        0.012,
        0.32,
        0.012,
        "#2a2c2e",
        [mx + (k % 2 ? 0.035 : -0.035), 0.7 + k * 0.33, mz + 0.03],
        [0, 0, k % 2 ? 0.25 : -0.25],
      );
    for (const [gx, gz] of [
      [-0.32, -0.12],
      [0.3, -0.16],
    ] as const)
      strut(b, [mx, 1.75, mz], [mx + gx, 0.07, mz + gz], 0.005, "#3a3c3e");
  }

  // radar de busca: reboque com sapatas e plataforma giratória (o painel é a parte animada)
  b.box(0.8, 0.12, 1.0, SAND_DARK, [-1.25, 0.3, -1.25]);
  for (const dx of [-0.34, 0.34])
    for (const dz of [-1.48, -1.68])
      wheel(b, [-1.25 + dx, 0.14, dz], 0.12, 0.09);
  for (const sx of [-1, 1])
    for (const dz of [-0.85, -1.55]) {
      b.box(0.04, 0.2, 0.04, STEEL, [-1.25 + sx * 0.44, 0.2, dz]);
      b.cyl(
        0.06,
        0.07,
        0.03,
        "#5d5a53",
        [-1.25 + sx * 0.44, 0.08, dz],
        undefined,
        6,
      );
    }
  strut(b, [-1.5, 0.28, -0.76], [-1.25, 0.2, -0.5], 0.025, SAND_DARK);
  strut(b, [-1.0, 0.28, -0.76], [-1.25, 0.2, -0.5], 0.025, SAND_DARK);
  b.box(0.5, 0.25, 0.45, SAND, [-1.25, 0.48, -1.0]);
  for (let k = 0; k < 3; k++)
    b.box(0.44, 0.012, 0.01, SAND_DARK, [-1.25, 0.42 + k * 0.06, -0.77]);
  b.cyl(0.18, 0.22, 0.12, STEEL, [-1.25, 0.42, -1.4], undefined, 12);
  const radar = layers();
  radar.body.cyl(0.16, 0.16, 0.12, STEEL, [0, 0.06, 0], undefined, 12);
  radar.body.box(0.08, 0.35, 0.12, SAND_DARK, [0, 0.28, 0.0]);
  radar.body.box(0.5, 0.36, 0.14, SAND_DARK, [0, 0.6, -0.08], [-0.32, 0, 0]);
  const face = new THREE.Euler(-0.32, 0, 0);
  const fw = 1.1;
  const fh = 0.76;
  radar.body.box(fw, fh, 0.08, SAND, [0, 0.62, 0.06], [face.x, 0, 0]);
  radar.body.box(
    fw - 0.08,
    fh - 0.08,
    0.02,
    "#4b5054",
    [0, 0.62, 0.11],
    [face.x, 0, 0],
  );
  // grade dos módulos da antena (linhas e colunas finas sobre a face)
  const nY = Math.cos(face.x);
  const nZ = -Math.sin(face.x);
  const up = (d: number): [number, number] => [0.62 + nY * d, 0.11 + nZ * d];
  for (let k = 1; k < 5; k++) {
    const off = -fh / 2 + 0.04 + (k * (fh - 0.08)) / 5;
    const [cy, cz] = up(off);
    radar.body.box(
      fw - 0.1,
      0.01,
      0.026,
      "#62676b",
      [0, cy, cz + 0.004],
      [face.x, 0, 0],
    );
  }
  for (let k = 1; k < 6; k++) {
    const x = -fw / 2 + 0.04 + (k * (fw - 0.08)) / 6;
    radar.body.box(
      0.01,
      fh - 0.1,
      0.026,
      "#62676b",
      [x, 0.62, 0.115],
      [face.x, 0, 0],
    );
  }
  // faixa de IFF no topo (com a cor da nação)
  radar.body.box(
    fw * 0.8,
    0.07,
    0.07,
    SAND_LIGHT,
    [0, 0.62 + nY * (fh / 2 + 0.04), 0.06 + nZ * (fh / 2 + 0.04)],
    [face.x, 0, 0],
  );
  radar.accent.box(
    0.3,
    0.05,
    0.075,
    "#ffffff",
    [0, 0.62 + nY * (fh / 2 + 0.04), 0.062 + nZ * (fh / 2 + 0.04)],
    [face.x, 0, 0],
  );

  // centro de controle (contêiner) sob a rede de camuflagem, antenas e o ar-condicionado na frente
  b.box(1.1, 0.55, 0.62, SAND, [1.2, 0.35, -1.25]);
  b.box(1.12, 0.04, 0.64, SAND_DARK, [1.2, 0.64, -1.25]);
  for (let k = 0; k < 5; k++)
    b.box(0.012, 0.5, 0.62, SAND_DARK, [0.72 + k * 0.24, 0.35, -1.25]);
  b.box(0.24, 0.22, 0.1, SAND_LIGHT, [0.86, 0.36, -0.9]);
  for (let k = 0; k < 3; k++)
    b.box(0.2, 0.012, 0.01, "#6d6a62", [0.86, 0.3 + k * 0.06, -0.845]);
  g.box(0.24, 0.12, 0.01, "#ffffff", [1.45, 0.42, -0.935]);
  a.box(0.4, 0.08, 0.01, "#ffffff", [1.2, 0.52, -0.935]);
  b.box(0.14, 0.04, 0.12, "#6d6a62", [1.2, 0.09, -0.88]);
  b.convex(
    [
      [0.52, 0.07, -1.8],
      [1.88, 0.07, -1.8],
      [0.58, 0.72, -1.62],
      [1.82, 0.72, -1.62],
      [0.6, 0.76, -0.98],
      [1.8, 0.76, -0.98],
      [1.15, 0.86, -1.3],
      [0.5, 0.25, -1.5],
      [1.9, 0.25, -1.5],
    ],
    "#7a7452",
  );
  b.cyl(0.012, 0.012, 1.0, "#d7d9d6", [1.6, 1.15, -1.4], undefined, 5);
  b.cyl(0.008, 0.008, 0.6, "#2a2c2e", [0.75, 1.1, -1.35], undefined, 4);
  b.cyl(0.04, 0.04, 0.06, "#e07a1c", [1.0, 0.89, -1.05], undefined, 8);
  b.cyl(0.04, 0.04, 0.06, "#e07a1c", [-1.05, 0.65, -0.82], undefined, 8);
  // gerador protegido por sacos de areia
  b.box(0.5, 0.32, 0.36, SAND_DARK, [0.15, 0.22, -1.45]);
  for (let k = 0; k < 3; k++)
    b.box(0.012, 0.2, 0.37, "#8d7a52", [-0.02 + k * 0.08, 0.22, -1.45]);
  b.cyl(0.03, 0.03, 0.3, "#2a2c2e", [0.3, 0.52, -1.5], undefined, 6);
  for (let layer = 0; layer < 2; layer++) {
    const y = 0.1 + layer * 0.065;
    const o = layer % 2 ? 0.07 : 0;
    for (let k = 0; k < 5; k++)
      b.box(
        0.13,
        0.065,
        0.09,
        layer % 2 ? "#a8966a" : "#b3a275",
        [-0.2 + o + k * 0.15, y, -1.12],
        [0, k % 2 ? 0.08 : -0.06, 0],
      );
    for (const sx of [-1, 1])
      for (let k = 0; k < 2; k++)
        b.box(0.09, 0.065, 0.13, "#ab996c", [
          0.15 + sx * 0.38,
          y,
          -1.25 - k * 0.15 - o * 0.5,
        ]);
  }
  // cabos no chão do contêiner até os lançadores
  for (const p of LAUNCHERS)
    b.box(0.025, 0.015, Math.abs(p[2] + 1.0), "#2a2c2e", [
      p[0] + 0.2,
      0.075,
      (p[2] - 1.0) / 2,
    ]);

  // caminhão de recarga (cabine voltada para +x) com guindaste dobrado e um casulo reserva na carroceria
  const tz = 1.42;
  b.box(1.2, 0.08, 0.36, "#3c3e3a", [1.05, 0.22, tz]);
  for (const x of [0.62, 0.9, 1.48])
    for (const sz of [-1, 1])
      wheel(b, [x, 0.14, tz + sz * 0.17], 0.12, 0.08, true, true);
  b.box(0.34, 0.34, 0.42, SAND, [1.5, 0.45, tz]);
  b.box(0.34, 0.1, 0.42, SAND_DARK, [1.52, 0.28, tz]);
  g.box(0.01, 0.13, 0.36, "#ffffff", [1.672, 0.53, tz], [0, 0, -0.18]);
  for (const sz of [-1, 1])
    g.box(0.14, 0.1, 0.01, "#ffffff", [1.5, 0.53, tz + sz * 0.212]);
  a.box(0.2, 0.06, 0.012, "#ffffff", [1.46, 0.38, tz + 0.214]);
  b.box(0.06, 0.08, 0.38, "#2a2c2e", [1.69, 0.3, tz]);
  b.box(0.82, 0.06, 0.4, SAND_DARK, [0.82, 0.29, tz]);
  for (const sz of [-1, 1])
    b.box(0.82, 0.08, 0.02, SAND, [0.82, 0.36, tz + sz * 0.19]);
  // casulo reserva deitado, tubos para trás
  b.box(0.64, 0.3, 0.32, SAND, [0.78, 0.48, tz]);
  for (let k = 0; k < 3; k++)
    b.box(0.04, 0.32, 0.34, SAND_DARK, [0.56 + k * 0.2, 0.48, tz]);
  b.box(0.012, 0.26, 0.28, SAND_DARK, [0.455, 0.48, tz]);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 3; c++)
      b.add(cap(), CAP, {
        pos: [0.452, 0.4 + r * 0.14, tz - 0.09 + c * 0.09],
        rot: [0, -Math.PI / 2, 0],
      });
  // guindaste: coluna atrás da cabine e o braço dobrado sobre a carga
  b.cyl(0.05, 0.06, 0.3, STEEL, [1.28, 0.45, tz], undefined, 8);
  strut(b, [1.28, 0.6, tz], [0.9, 0.74, tz], 0.04, SAND_DARK);
  strut(b, [0.9, 0.74, tz], [1.2, 0.7, tz], 0.03, SAND_DARK);
  b.box(0.04, 0.04, 0.04, "#e07a1c", [1.56, 0.64, tz - 0.12]);

  return {
    base: l.build(),
    moving: { layers: radar.build(), pivot: [-1.25, 0.48, -1.4], kind: "spin" },
    height: 2.9,
  };
}
