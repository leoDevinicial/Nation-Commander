import * as THREE from 'three';
import { C, layers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

type Built = Omit<BuildingModel, 'detail'>;

/**
 * Usinas da rede elétrica (versão 1.1), todas 2×2, em low poly:
 * - termelétrica a carvão: casa de caldeiras alta de chapa, casa de turbinas de tijolo, precipitador eletrostático
 *   com os dutos, chaminé cônica listrada com balizamento, torre de resfriamento hiperbólica com vapor, pátio de
 *   carvão com empilhadeira-recuperadora, galeria da esteira até a caldeira e os transformadores elevadores;
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
  const CLAD = '#a9aeb2';
  const CLAD_DARK = '#8d9297';
  b.box(3.8, 0.08, 3.8, C.concreteDark, [0, 0.04, 0]);
  b.box(3.8, 0.012, 1.1, '#3a3a38', [0, 0.086, -1.35]); // pátio de carvão (chão escurecido)
  // pilhas de carvão alongadas e a empilhadeira-recuperadora sobre o trilho
  b.add(new THREE.IcosahedronGeometry(0.5, 0), '#26282a', { pos: [-1.2, 0.12, -1.4], scale: [1.6, 0.55, 0.85] });
  b.add(new THREE.IcosahedronGeometry(0.42, 0), '#2f3133', { pos: [0.2, 0.1, -1.45], scale: [1.4, 0.5, 0.8] });
  for (const z of [-0.85, -0.78]) b.box(3.4, 0.02, 0.03, C.metal, [0, 0.1, z]);
  b.box(0.3, 0.22, 0.24, C.yellow, [-0.45, 0.22, -0.82]);
  strut(b, [-0.45, 0.32, -0.82], [-0.95, 0.65, -1.3], 0.04, C.yellow);
  b.cyl(0.08, 0.08, 0.06, C.metalDark, [-0.97, 0.66, -1.32], [Math.PI / 2, 0, 0], 8);
  // galeria fechada da esteira, do pátio até o alto da caldeira, sobre cavaletes
  const c0: [number, number, number] = [-0.2, 0.25, -1.0];
  const c1: [number, number, number] = [-0.5, 1.55, -0.45];
  strut(b, c0, c1, 0.09, CLAD);
  for (const t of [0.3, 0.65]) {
    const p: [number, number, number] = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    strut(b, [p[0], 0.08, p[2]], [p[0], p[1] - 0.06, p[2]], 0.03, C.metalDark);
  }
  // casa de caldeiras alta, com nervuras da chapa, faixa de janelas e a estrutura no topo
  b.box(1.0, 1.75, 0.9, CLAD, [-0.7, 0.955, -0.1]);
  for (let i = 0; i < 7; i++) b.box(0.012, 1.74, 0.91, CLAD_DARK, [-1.15 + i * 0.15, 0.955, -0.1]);
  g.box(1.01, 0.08, 0.91, '#ffffff', [-0.7, 1.45, -0.1]);
  b.box(1.04, 0.06, 0.94, C.metalDark, [-0.7, 1.86, -0.1]);
  b.box(0.5, 0.25, 0.5, CLAD, [-0.85, 2.0, -0.2]);
  b.box(0.54, 0.04, 0.54, C.metalDark, [-0.85, 2.14, -0.2]);
  // casa de turbinas comprida na frente, de tijolo, com a faixa de vidro, lanternim e a faixa da nação
  b.box(2.0, 0.8, 0.8, C.brick, [-0.75, 0.48, 0.75]);
  g.box(1.8, 0.24, 0.02, '#ffffff', [-0.75, 0.52, 1.155]);
  for (let i = 0; i < 6; i++) b.box(0.03, 0.26, 0.03, '#6b3428', [-1.6 + i * 0.34, 0.52, 1.16]);
  b.box(2.06, 0.06, 0.86, C.roof, [-0.75, 0.91, 0.75]);
  b.box(1.4, 0.1, 0.24, C.metalDark, [-0.75, 0.99, 0.75]);
  a.box(1.2, 0.1, 0.02, '#ffffff', [-0.75, 0.78, 1.16]);
  // precipitador eletrostático: dois módulos com as moegas embaixo, sobre pilares, e os dutos
  for (const z of [-0.35, 0.15]) {
    b.box(0.6, 0.5, 0.42, CLAD_DARK, [0.4, 1.05, z]);
    b.cyl(0.04, 0.3, 0.3, CLAD_DARK, [0.4, 0.65, z], [0, Math.PI / 4, 0], 4);
    for (const dx of [-0.22, 0.22]) b.box(0.05, 0.6, 0.05, C.metalDark, [0.4 + dx, 0.38, z]);
  }
  b.box(0.42, 0.22, 0.3, CLAD, [0.0, 1.25, -0.1]); // duto caldeira → filtro
  b.box(0.5, 0.2, 0.22, CLAD, [0.9, 1.0, -0.1]); // duto filtro → chaminé
  // chaminé alta e cônica, com as faixas vermelhas, plataformas e luzes de balizamento
  const cx = 1.3;
  const cz = -0.1;
  b.cyl(0.2, 0.32, 3.4, C.concreteLight, [cx, 1.78, cz], undefined, 14);
  for (const y of [2.75, 3.15]) b.cyl(0.235 - (y - 2.75) * 0.06, 0.24 - (y - 2.75) * 0.06, 0.16, C.red, [cx, y, cz], undefined, 14);
  for (const y of [1.6, 3.4]) {
    const r = 0.32 - ((y - 0.08) / 3.4) * 0.12 + 0.06;
    b.cyl(r, r, 0.025, C.metalDark, [cx, y, cz], undefined, 14);
  }
  b.cyl(0.22, 0.22, 0.06, C.metalDark, [cx, 3.5, cz], undefined, 14);
  for (const ang of [0.4, 2.5, 4.6]) b.sphere(0.025, '#d8322a', [cx + Math.cos(ang) * 0.24, 3.45, cz + Math.sin(ang) * 0.24], undefined, 5);
  // torre de resfriamento hiperbólica (oca, com o vapor saindo)
  const tx = 1.15;
  const tz = 1.2;
  const prof: [number, number][] = [
    [0.62, 0],
    [0.52, 0.4],
    [0.44, 0.85],
    [0.42, 1.05],
    [0.45, 1.3],
  ];
  const shell = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    14,
  );
  shell.deleteAttribute('normal');
  b.add(shell, '#cfccc4', { pos: [tx, 0.18, tz] });
  const inner = new THREE.LatheGeometry(
    prof
      .slice(2)
      .reverse()
      .map(([r, y]) => new THREE.Vector2(r * 0.92, y)),
    14,
  );
  inner.deleteAttribute('normal');
  b.add(inner, '#77756f', { pos: [tx, 0.18, tz] });
  b.cyl(0.4, 0.4, 0.02, '#4a4c4e', [tx, 1.0, tz], undefined, 14);
  for (let k = 0; k < 10; k++) {
    const ang = (k / 10) * Math.PI * 2;
    strut(b, [tx + Math.cos(ang) * 0.6, 0.08, tz + Math.sin(ang) * 0.6], [tx + Math.cos(ang + 0.3) * 0.6, 0.2, tz + Math.sin(ang + 0.3) * 0.6], 0.025, '#b9b6ae');
  }
  b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 14, 1, true), '#e2dfd8', { pos: [tx, 1.48, tz] });
  // transformadores elevadores com isoladores e o pórtico da linha de saída
  for (const x of [-1.55, -1.15]) {
    b.box(0.3, 0.3, 0.28, '#5c6a5c', [x, 0.25, 1.55]);
    for (let i = 0; i < 4; i++) b.box(0.012, 0.24, 0.1, '#4d5a4d', [x - 0.12 + i * 0.08, 0.24, 1.72]);
    for (let i = 0; i < 3; i++) b.cyl(0.02, 0.03, 0.16, '#c9c2b0', [x - 0.09 + i * 0.09, 0.48, 1.5], undefined, 6);
  }
  for (const x of [-1.75, -0.95]) strut(b, [x, 0.08, 1.35], [x, 0.85, 1.35], 0.03, C.steel);
  b.box(0.86, 0.04, 0.04, C.steel, [-1.35, 0.85, 1.35]);
  railing(b, [-1.85, 1.85], [-0.6, 1.85], 0.08, 0.22, C.steel, 4);
  return { base: l.build(), moving: null, height: 3.6, smoke: [[cx, 3.55, cz], [tx, 1.55, tz]] };
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
