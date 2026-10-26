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

const CAMO = '#6c7363';
const CAMO_DARK = '#4f5548';

/** Caça a jato (nariz para +x), na escala usada parado no pátio e em voo. */
function fighter(b: PartBuilder, a: PartBuilder, g: PartBuilder, at: V3, s = 1): void {
  const [x, y, z] = at;
  b.cyl(0.07 * s, 0.09 * s, 0.9 * s, CAMO, [x, y, z], [0, 0, Math.PI / 2], 8);
  b.cyl(0.0, 0.07 * s, 0.28 * s, CAMO, [x + 0.59 * s, y, z], [0, 0, -Math.PI / 2], 8);
  g.sphere(0.06 * s, '#ffffff', [x + 0.28 * s, y + 0.06 * s, z], [1.8, 0.8, 0.9]);
  // asa em delta e estabilizadores
  b.plan(
    [
      [0.18 * s, 0],
      [-0.28 * s, 0.42 * s],
      [-0.38 * s, 0.42 * s],
      [-0.3 * s, 0],
      [-0.38 * s, -0.42 * s],
      [-0.28 * s, -0.42 * s],
    ],
    0.02 * s,
    CAMO_DARK,
    [x, y - 0.02 * s, z],
  );
  b.side(
    [
      [-0.45 * s, 0],
      [-0.28 * s, 0],
      [-0.42 * s, 0.24 * s],
      [-0.5 * s, 0.24 * s],
    ],
    0.02 * s,
    CAMO_DARK,
    [x, y + 0.05 * s, z],
  );
  b.cyl(0.06 * s, 0.05 * s, 0.06 * s, '#2b2d30', [x - 0.48 * s, y, z], [0, 0, Math.PI / 2], 8);
  a.box(0.12 * s, 0.012 * s, 0.1 * s, '#ffffff', [x - 0.3 * s, y + 0.005 * s, z + 0.3 * s]);
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
  fighter(b, a, g, [hx + 0.1, 0.2, hz + 1.5], 0.95);
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
  fighter(b, a, g, [0.35, 0.18, -0.15], 0.9);
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
export function aircraftModel(type: 'fighter' | 'recon' | 'transport'): ModelLayers {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  if (type === 'fighter') fighter(b, a, g, [0, 0, 0], 1.4);
  else if (type === 'recon') reconPlane(b, a, g, [0, 0, 0], 1.4);
  else transportPlane(b, a, g, [0, 0, 0], 1.4);
  return l.build();
}

/** Míssil balístico (ponta para +x), com aletas. */
export function missileModel(): ModelLayers {
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
