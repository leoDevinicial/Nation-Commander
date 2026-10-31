import { C, layers } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

type Built = Omit<BuildingModel, 'detail'>;

/**
 * Usinas da rede elétrica (versão 1.1), todas 2×2, em low poly:
 * - termelétrica a carvão: casa de caldeiras de tijolo, chaminé alta listrada com fumaça, pátio de carvão (pilha
 *   escura), esteira inclinada até a caldeira e o transformador com isoladores;
 * - parque eólico: três turbinas brancas de alturas diferentes com o rotor de três pás girando ao vento;
 * - usina solar: mesas de painéis espalhadas em fileiras com corredores de grama, inclinadas para o sol, com a grade
 *   das células, caixas de junção e o inversor com a faixa da nação; os painéis têm material próprio que reflete o sol.
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
  const { body: b, accent: a } = l;
  const pv = layers();
  const p = pv.body;
  // terreno de brita com faixas de grama entre as fileiras (a usina é espalhada, com corredores de manutenção)
  b.box(3.85, 0.04, 3.85, '#8c8a7e', [0, 0.02, 0]);
  for (let r = 0; r < 4; r++) b.box(3.6, 0.012, 0.32, '#6f7d55', [0, 0.046, -1.48 + r * 0.98 + 0.42]);
  // quatro fileiras de mesas soltas, cada mesa com dois painéis (retrato), inclinadas para o sol (que vem de −z)
  const tilt = 0.36;
  const rows = [-1.48, -0.5, 0.48, 1.46];
  const tables = [-1.3, -0.12, 1.06];
  rows.forEach((z, r) => {
    tables.forEach((x0, t) => {
      // o canto do inversor e do transformador fica livre
      if (r === rows.length - 1 && t === tables.length - 1) return;
      // pequeno desalinhamento de obra entre as mesas (nada fica perfeitamente igual)
      const x = x0 + ((r * 3 + t) % 3 === 1 ? 0.04 : 0);
      const w = 0.98;
      const d = 0.6;
      // pernas: as da frente baixas e as de trás altas, com a travessa
      for (const dx of [-0.38, 0.38]) {
        strut(b, [x + dx, 0.04, z - 0.18], [x + dx, 0.13, z - 0.18], 0.022, C.steel, true);
        strut(b, [x + dx, 0.04, z + 0.18], [x + dx, 0.26, z + 0.18], 0.022, C.steel, true);
        strut(b, [x + dx, 0.13, z - 0.18], [x + dx, 0.26, z + 0.18], 0.014, C.steel, true);
      }
      b.box(w, 0.02, 0.03, C.metal, [x, 0.19, z], [-tilt, 0, 0]);
      // os painéis (vidro escuro azulado) com a moldura de alumínio e a grade das células por cima
      const y = 0.215;
      p.box(w - 0.02, 0.018, d - 0.02, '#1f2f4c', [x, y, z], [-tilt, 0, 0]);
      b.box(w, 0.016, d, '#b9bfc5', [x, y - 0.006, z], [-tilt, 0, 0]);
      const ny = Math.cos(tilt);
      const nz = -Math.sin(tilt);
      const lift = 0.011;
      // divisão entre os dois painéis e as linhas das células (finas, em tom mais claro)
      b.box(0.012, 0.004, d - 0.03, '#c3c9ce', [x, y + ny * lift, z + nz * lift], [-tilt, 0, 0]);
      for (let k = 1; k < 4; k++) {
        const off = -d / 2 + (k * d) / 4;
        b.box(w - 0.04, 0.003, 0.006, '#3a5378', [x, y + ny * lift + Math.sin(tilt) * off, z + nz * lift + Math.cos(tilt) * off], [-tilt, 0, 0]);
      }
    });
  });
  // caixas de junção nas pontas das fileiras e a vala de cabos até o inversor
  for (const z of rows) b.box(0.12, 0.12, 0.08, '#d7d9d6', [1.72, 0.1, z + 0.18]);
  b.box(0.05, 0.015, 3.0, '#5a5a52', [1.72, 0.047, 0.0]);
  // inversor (contêiner com a faixa da nação), transformador e a cerca
  b.box(0.55, 0.42, 0.34, '#d7d9d6', [1.45, 0.25, 1.72]);
  a.box(0.4, 0.07, 0.01, '#ffffff', [1.45, 0.36, 1.892]);
  b.box(0.28, 0.3, 0.22, '#5c6a5c', [0.95, 0.19, 1.72]);
  for (let i = 0; i < 3; i++) b.cyl(0.022, 0.03, 0.16, '#c9c2b0', [0.87 + i * 0.08, 0.42, 1.72], undefined, 6);
  railing(b, [-1.9, 1.9], [1.9, 1.9], 0.04, 0.25, C.steel, 7);
  railing(b, [-1.9, -1.9], [1.9, -1.9], 0.04, 0.25, C.steel, 7);
  railing(b, [-1.9, -1.9], [-1.9, 1.9], 0.04, 0.25, C.steel, 7);
  return { base: l.build(), moving: null, height: 0.8, panels: pv.build() };
}
