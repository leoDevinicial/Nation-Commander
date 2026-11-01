import * as THREE from 'three';
import { C, layers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

type Built = Omit<BuildingModel, 'detail'>;

/**
 * Usinas da rede elétrica (versão 1.1), todas 2×2, em low poly:
 * - termelétrica a carvão: casa de caldeiras de tijolo, chaminé alta listrada com fumaça, pátio de carvão (pilha
 *   escura), esteira inclinada até a caldeira e o transformador com isoladores;
 * - parque eólico: três turbinas de alturas diferentes, torre cônica com flanges, nacele que acompanha o vento e
 *   rotor de pás afiladas com ponta vermelha, girando a ~10 rpm com rajadas suaves; estrada de serviço de cascalho,
 *   pátios dos guindastes e a subestação cercada;
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

/** Pá de turbina eólica afilada (raiz larga, ponta fina), comprimento `len` ao longo de +y, com a torção do passo. */
function bladeGeo(profile: [number, number][], depth: number, pitch: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.rotateY(pitch);
  return g;
}

/** Faixa de cascalho reta de (x0, z0) a (x1, z1). */
function gravel(b: PartBuilder, x0: number, z0: number, x1: number, z1: number, w: number, y = 0.056): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  b.box(Math.hypot(dx, dz) + w * 0.5, 0.012, w, '#a59d8c', [(x0 + x1) / 2, y, (z0 + z1) / 2], [0, -Math.atan2(dz, dx), 0]);
}

export function buildWindFarm(): Built {
  const l = layers();
  const { body: b, accent: a } = l;
  b.box(3.8, 0.05, 3.8, '#6f7f58', [0, 0.025, 0]);
  const towers: [number, number, number][] = [
    [-0.95, -0.9, 3.1],
    [1.0, -0.4, 3.5],
    [-0.2, 1.1, 2.8],
  ];
  // estrada de serviço de cascalho e os pátios dos guindastes ao lado de cada torre
  gravel(b, 1.95, 0.55, -1.7, -0.02, 0.22);
  gravel(b, 1.35, 0.42, 1.35, 1.0, 0.18);
  for (const [x, z, zSpine] of [
    [-0.95, -0.38, 0.1],
    [1.0, 0.05, 0.4],
    [-0.2, 0.68, 0.22],
  ] as const) {
    b.box(0.62, 0.012, 0.44, '#a59d8c', [x, 0.058, z]);
    gravel(b, x, z, x, zSpine, 0.16);
  }
  const anims: ModelAnim[] = [];
  const L = 1.45;
  const blade: [number, number][] = [
    [-0.036, 0.06],
    [0.036, 0.06],
    [0.072, 0.3],
    [0.05, 0.7],
    [0.025, L - 0.05],
    [0.0, L],
    [-0.012, L - 0.05],
    [-0.03, 0.7],
    [-0.046, 0.3],
  ];
  const tip: [number, number][] = [
    [0.032, L - 0.25],
    [0.025, L - 0.05],
    [0.0, L],
    [-0.012, L - 0.05],
    [-0.017, L - 0.25],
  ];
  towers.forEach(([x, z, h], k) => {
    // fundação, torre cônica com as flanges, porta com escada e a faixa da nação no pé
    b.cyl(0.3, 0.34, 0.08, C.concrete, [x, 0.09, z], undefined, 10);
    b.cyl(0.065, 0.14, h, '#e8ebe9', [x, 0.13 + h / 2, z], undefined, 14);
    for (const f of [0.36, 0.7]) {
      const r = 0.14 - 0.075 * f + 0.006;
      b.cyl(r, r, 0.02, '#d2d6d4', [x, 0.13 + h * f, z], undefined, 14);
    }
    a.cyl(0.139, 0.14, 0.07, '#ffffff', [x, 0.36, z], undefined, 14);
    b.box(0.07, 0.15, 0.03, '#9aa0a4', [x, 0.22, z + 0.135]);
    b.box(0.1, 0.03, 0.08, C.steel, [x, 0.14, z + 0.18]);
    // transformador junto ao pé da torre
    b.box(0.16, 0.14, 0.12, '#7f8c80', [x + 0.26, 0.2, z + 0.14]);
    // nacele: gira devagar para acompanhar o vento (yaw), e o rotor vai junto
    const nac = layers();
    nac.body.box(0.2, 0.2, 0.48, '#eef0ee', [0, 0.13, -0.05]);
    nac.body.box(0.17, 0.17, 0.1, '#e4e7e5', [0, 0.13, -0.33]);
    nac.body.box(0.14, 0.04, 0.12, '#cfd3d1', [0, 0.25, -0.24]);
    nac.body.cyl(0.006, 0.006, 0.12, C.steel, [0.05, 0.3, -0.3], undefined, 4);
    nac.body.box(0.06, 0.008, 0.008, C.steel, [0.05, 0.36, -0.3]);
    nac.body.sphere(0.028, '#d8322a', [-0.04, 0.27, -0.3], undefined, 6);
    nac.accent.box(0.205, 0.05, 0.3, '#ffffff', [0, 0.17, -0.08]);
    const nacIdx = anims.length;
    anims.push({
      layers: nac.build(),
      pivot: [x, 0.13 + h, z],
      motion: { kind: 'swing', axis: 'y', amp: 0.14, speed: 0.09, phase: k * 0.25 },
    });
    // rotor: cubo com o nariz cônico e três pás afiladas com a ponta vermelha de sinalização
    const rotor = layers();
    rotor.body.cyl(0.02, 0.09, 0.17, '#f2f3f1', [0, 0, 0.08], [Math.PI / 2, 0, 0], 10);
    rotor.body.cyl(0.09, 0.09, 0.07, '#e4e7e5', [0, 0, -0.03], [Math.PI / 2, 0, 0], 10);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      rotor.body.add(bladeGeo(blade, 0.022, 0.2), '#f2f3f1', { rot: [0, 0, -ang] });
      rotor.body.add(bladeGeo(tip, 0.026, 0.2), '#c8372d', { rot: [0, 0, -ang] });
    }
    anims.push({
      layers: rotor.build(),
      pivot: [0, 0.13, 0.27],
      parent: nacIdx,
      motion: { kind: 'spin', axis: 'z', speed: 0.95 + k * 0.08, gust: 0.16, gustSpeed: 0.33 + k * 0.07, phase: k * 1.9 },
    });
  });
  // subestação cercada: transformador com radiadores e buchas, pórtico de saída da linha e a casa de comando
  const sx = 1.35;
  const sz = 1.38;
  b.box(0.95, 0.03, 0.8, '#9c968a', [sx, 0.065, sz]);
  b.box(0.32, 0.26, 0.22, '#5c6a5c', [sx - 0.12, 0.21, sz - 0.05]);
  for (let i = 0; i < 4; i++) b.box(0.012, 0.2, 0.08, '#4d5a4d', [sx - 0.26 + i * 0.09, 0.2, sz + 0.1]);
  for (let i = 0; i < 3; i++) b.cyl(0.018, 0.026, 0.14, '#c9c2b0', [sx - 0.22 + i * 0.1, 0.41, sz - 0.05], undefined, 6);
  for (const dx of [-0.34, 0.1]) b.box(0.035, 0.62, 0.035, C.steel, [sx + dx, 0.38, sz - 0.3]);
  b.box(0.5, 0.035, 0.035, C.steel, [sx - 0.12, 0.68, sz - 0.3]);
  for (let i = 0; i < 3; i++) b.cyl(0.012, 0.018, 0.08, '#c9c2b0', [sx - 0.28 + i * 0.16, 0.63, sz - 0.3], undefined, 5);
  b.box(0.26, 0.22, 0.24, '#d7d9d6', [sx + 0.28, 0.19, sz + 0.12]);
  b.box(0.29, 0.03, 0.27, C.metalDark, [sx + 0.28, 0.315, sz + 0.12]);
  a.box(0.2, 0.04, 0.01, '#ffffff', [sx + 0.28, 0.25, sz + 0.245]);
  b.box(0.07, 0.13, 0.01, '#6d6a62', [sx + 0.18, 0.15, sz + 0.245]);
  railing(b, [sx - 0.45, sz - 0.38], [sx + 0.45, sz - 0.38], 0.07, 0.2, C.steel, 4);
  railing(b, [sx - 0.45, sz + 0.38], [sx + 0.45, sz + 0.38], 0.07, 0.2, C.steel, 4);
  railing(b, [sx - 0.45, sz - 0.38], [sx - 0.45, sz + 0.38], 0.07, 0.2, C.steel, 3);
  railing(b, [sx + 0.45, sz - 0.38], [sx + 0.45, sz + 0.38], 0.07, 0.2, C.steel, 3);
  return { base: l.build(), moving: null, anims, height: 4.8 };
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
