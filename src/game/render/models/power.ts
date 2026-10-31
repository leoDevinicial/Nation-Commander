import { C, layers } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

type Built = Omit<BuildingModel, 'detail'>;

/**
 * Usinas da rede elétrica (versão 1.1), todas 2×2, em low poly:
 * - termelétrica a carvão: casa de caldeiras de tijolo, chaminé alta listrada com fumaça, pátio de carvão (pilha
 *   escura), esteira inclinada até a caldeira e o transformador com isoladores;
 * - parque eólico: três turbinas brancas de alturas diferentes com o rotor de três pás girando ao vento;
 * - usina solar: fileiras de painéis inclinados para o sol em estruturas metálicas e o inversor com a faixa da nação.
 * A faixa da nação (accent) vai na fachada, na nacele e no inversor.
 */
export function buildCoalPlant(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.8, 0.08, 3.8, C.concreteDark, [0, 0.04, 0]);
  // casa de caldeiras
  b.box(1.9, 1.3, 1.5, C.brick, [-0.75, 0.73, 0.55]);
  b.box(2.0, 0.08, 1.6, C.roof, [-0.75, 1.42, 0.55]);
  b.box(1.0, 0.5, 0.9, '#8f5039', [-1.0, 1.7, 0.45]);
  b.box(1.08, 0.06, 0.98, C.roof, [-1.0, 1.98, 0.45]);
  for (let i = 0; i < 4; i++) g.box(0.26, 0.38, 0.02, '#ffffff', [-1.45 + i * 0.42, 0.95, 1.31]);
  a.box(1.2, 0.16, 0.02, '#ffffff', [-0.75, 1.27, 1.31]);
  // chaminé alta com faixas
  b.cyl(0.26, 0.36, 3.4, C.concreteLight, [0.95, 1.75, 1.0], undefined, 12);
  for (const y of [2.9, 3.25]) b.cyl(0.275, 0.275, 0.14, C.red, [0.95, y, 1.0], undefined, 12);
  b.cyl(0.29, 0.29, 0.08, C.metalDark, [0.95, 3.48, 1.0], undefined, 12);
  // pátio de carvão: pilha facetada escura e a esteira inclinada até a caldeira
  b.cyl(0.05, 0.75, 0.6, '#26282a', [0.95, 0.38, -1.05], undefined, 7);
  b.cyl(0.05, 0.45, 0.4, '#2f3133', [0.35, 0.28, -1.35], undefined, 6);
  strut(b, [0.75, 0.25, -0.6], [-0.2, 1.3, -0.2], 0.08, C.metal);
  for (const t of [0.3, 0.65]) strut(b, [0.75 - 0.95 * t, 0.05, -0.6 + 0.4 * t], [0.75 - 0.95 * t, 0.25 + 1.05 * t, -0.6 + 0.4 * t], 0.03, C.metalDark, true);
  // transformador e isoladores (de onde sai a linha)
  b.box(0.55, 0.45, 0.4, '#5c6a5c', [1.3, 0.3, -0.15]);
  for (let i = 0; i < 3; i++) b.cyl(0.035, 0.05, 0.3, '#c9c2b0', [1.12 + i * 0.18, 0.67, -0.15], undefined, 6);
  railing(b, [1.0, -0.45], [1.65, -0.45], 0.08, 0.25, C.steel, 3);
  return { base: l.build(), moving: null, height: 3.6, smoke: [[0.95, 3.55, 1.0]] };
}

export function buildWindFarm(): Built {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(3.8, 0.05, 3.8, '#6f7f58', [0, 0.025, 0]);
  const anims: ModelAnim[] = [];
  const towers: [number, number, number][] = [
    [-0.95, -0.9, 3.1],
    [1.0, -0.4, 3.5],
    [-0.2, 1.1, 2.8],
  ];
  towers.forEach(([x, z, h], k) => {
    b.cyl(0.32, 0.36, 0.1, C.concrete, [x, 0.08, z], undefined, 10);
    b.cyl(0.07, 0.13, h, '#e6e8e6', [x, 0.1 + h / 2, z], undefined, 10);
    // nacele virada para +z (o vento vem de frente)
    b.box(0.2, 0.2, 0.46, '#eef0ee', [x, h + 0.18, z - 0.05]);
    a.box(0.21, 0.05, 0.3, '#ffffff', [x, h + 0.26, z - 0.08]);
    const rotor = layers();
    rotor.body.cyl(0.08, 0.06, 0.14, '#eef0ee', [0, 0, 0.0], [Math.PI / 2, 0, 0], 8);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const len = 1.05;
      rotor.body.box(0.09, len, 0.025, '#f2f3f1', [Math.sin(ang) * (len / 2 + 0.05), Math.cos(ang) * (len / 2 + 0.05), 0.02], [0, 0, -ang]);
      rotor.accent.box(0.092, 0.1, 0.027, '#ffffff', [Math.sin(ang) * (len - 0.02), Math.cos(ang) * (len - 0.02), 0.02], [0, 0, -ang]);
    }
    anims.push({ layers: rotor.build(), pivot: [x, h + 0.18, z + 0.24], motion: { kind: 'spin', axis: 'z', speed: 1.3 + k * 0.25 } });
  });
  // subestação pequena
  b.box(0.5, 0.35, 0.4, '#5c6a5c', [1.35, 0.22, 1.35]);
  b.box(0.6, 0.04, 0.5, C.concreteDark, [1.35, 0.05, 1.35]);
  return { base: l.build(), moving: null, anims, height: 4.2 };
}

export function buildSolarFarm(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.8, 0.05, 3.8, '#8a876f', [0, 0.025, 0]);
  // quatro fileiras de painéis inclinados para o sol (que vem de −z/−x no jogo)
  for (let r = 0; r < 4; r++) {
    const z = -1.35 + r * 0.82;
    for (const x of [-0.8, 0.55]) {
      for (const dx of [-0.45, 0.45]) strut(b, [x + dx, 0.05, z + 0.12], [x + dx, 0.32, z + 0.12], 0.03, C.steel, true);
      b.box(1.25, 0.03, 0.55, C.metal, [x, 0.36, z], [0.5, 0, 0]);
      g.box(1.18, 0.02, 0.5, '#ffffff', [x, 0.385, z - 0.005], [0.5, 0, 0]);
      for (let k = 1; k < 4; k++) b.box(0.015, 0.025, 0.5, '#9aa3ab', [x - 0.59 + k * 0.295, 0.39, z - 0.005], [0.5, 0, 0]);
    }
  }
  // inversor e cerca
  b.box(0.45, 0.4, 0.35, '#d7d9d6', [1.55, 0.25, 1.55]);
  a.box(0.3, 0.08, 0.01, '#ffffff', [1.55, 0.33, 1.73]);
  railing(b, [-1.85, 1.85], [1.85, 1.85], 0.04, 0.25, C.steel, 6);
  railing(b, [-1.85, -1.85], [1.85, -1.85], 0.04, 0.25, C.steel, 6);
  return { base: l.build(), moving: null, height: 0.8 };
}
