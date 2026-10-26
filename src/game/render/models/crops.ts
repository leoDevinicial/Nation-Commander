import * as THREE from 'three';
import { C, type PartBuilder } from './kit.ts';

/**
 * Lavouras low poly das células cultivadas da fazenda: solo arado com camalhões e plantas de
 * verdade em fileiras — milho (colmo, folhas caídas, pendão e espiga), trigo (touceiras douradas
 * com espigas), soja (moitas de folhas) e hortaliças (cabeças de repolho/alface). A cultura de
 * cada célula é sorteada pelo índice da célula (sempre a mesma), com pequenas variações de altura,
 * cor e posição para não parecer carimbo. Geometrias de poucos lados, montadas sem o
 * multiplicador de segmentos dos presets altos (são muitas plantas).
 */
export type Crop = 'corn' | 'wheat' | 'soy' | 'vegetables';
const CROPS: Crop[] = ['corn', 'wheat', 'soy', 'vegetables'];

/** Gerador determinístico por célula (mulberry32). */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cropOf(cellIndex: number): Crop {
  return CROPS[Math.floor(rng(cellIndex * 7 + 3)() * CROPS.length)]!;
}

const tmp = new THREE.Color();
const mix = (a: string, b: string, k: number) => '#' + tmp.set(a).lerp(new THREE.Color(b), k).getHexString();

// primitivas baratas (sem o multiplicador de segmentos do Ultra)
// (abertas embaixo: a base nunca aparece e economiza vértices)
const cone = (r: number, h: number, seg = 3) => new THREE.ConeGeometry(r, h, seg, 1, true);
const stick = (r: number, h: number) => new THREE.CylinderGeometry(r * 0.8, r, h, 4, 1, true);
const blob = (r: number) => new THREE.IcosahedronGeometry(r, 0);
const petal = (r: number) => new THREE.OctahedronGeometry(r, 0);

/** Folha: cone achatado de 3 lados, inclinado para fora a partir do colmo. */
function leaf(b: PartBuilder, x: number, y: number, z: number, len: number, yaw: number, droop: number, color: string): void {
  const g = cone(0.055, len);
  g.translate(0, len / 2, 0);
  g.scale(1, 1, 0.3);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, yaw, -(Math.PI / 2 - droop), 'YXZ'));
  g.applyMatrix4(m);
  b.add(g, color, { pos: [x, y, z] });
}

/** Solo arado: base e camalhões (perfil triangular) ao longo de x. */
function soil(b: PartBuilder, x: number, z: number, cs: number, rows: number, dark: string): void {
  b.box(cs * 0.96, 0.05, cs * 0.96, C.soil, [x, 0.035, z]);
  const shape = new THREE.Shape([new THREE.Vector2(-0.11, 0), new THREE.Vector2(0.11, 0), new THREE.Vector2(0, 0.07)]);
  for (let r = 0; r < rows; r++) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: cs * 0.9, bevelEnabled: false });
    g.translate(0, 0, -cs * 0.45);
    g.rotateY(Math.PI / 2);
    b.add(g, dark, { pos: [x, 0.06, z - cs * 0.36 + (r * cs * 0.72) / (rows - 1)] });
  }
}

function corn(b: PartBuilder, x: number, z: number, cs: number, rnd: () => number): void {
  const rows = 4;
  soil(b, x, z, cs, rows, '#4a3726');
  for (let r = 0; r < rows; r++) {
    const rz = z - cs * 0.36 + (r * cs * 0.72) / (rows - 1);
    for (let i = 0; i < 5; i++) {
      const px = x - cs * 0.38 + (i * cs * 0.76) / 4 + (rnd() - 0.5) * 0.08;
      const pz = rz + (rnd() - 0.5) * 0.06;
      const h = 0.62 + rnd() * 0.16;
      const green = mix('#5f8a32', '#8aa040', rnd() * 0.6);
      b.add(stick(0.022, h), green, { pos: [px, 0.1 + h / 2, pz] });
      for (let k = 0; k < 4; k++) leaf(b, px, 0.2 + k * 0.14 + rnd() * 0.04, pz, 0.32 - k * 0.04, rnd() * Math.PI * 2, 0.45 + rnd() * 0.4, mix(green, '#3f6b25', 0.3));
      b.add(cone(0.03, 0.12, 4), '#d9c27a', { pos: [px, 0.12 + h + 0.05, pz] }); // pendão
      if (rnd() < 0.7) b.add(stick(0.03, 0.13), '#d8c46a', { pos: [px + 0.035, 0.12 + h * 0.55, pz], rot: [0, 0, -0.35] }); // espiga
    }
  }
}

function wheat(b: PartBuilder, x: number, z: number, cs: number, rnd: () => number): void {
  const rows = 6;
  soil(b, x, z, cs, rows, '#5a4530');
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  for (let r = 0; r < rows; r++) {
    const rz = z - cs * 0.36 + (r * cs * 0.72) / (rows - 1);
    // palha baixa ao longo da fileira: o talhão "lê" dourado também de longe
    b.box(cs * 0.86, 0.1, 0.14, '#c9a646', [x, 0.1, rz]);
    for (let i = 0; i < 8; i++) {
      const px = x - cs * 0.41 + (i * cs * 0.82) / 7 + (rnd() - 0.5) * 0.1;
      const pz = rz + (rnd() - 0.5) * 0.08;
      const h = 0.3 + rnd() * 0.08;
      const gold = mix('#d9b544', '#f0d36a', rnd());
      // touceira: três colmos em leque, cada um com a espiga na ponta
      for (let k = 0; k < 3; k++) {
        e.set(0, rnd() * Math.PI, (k - 1) * 0.24 + (rnd() - 0.5) * 0.1);
        const g = cone(0.022, h);
        g.translate(0, h / 2, 0);
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
        b.add(g, mix(gold, '#9a8a3a', 0.35), { pos: [px, 0.08, pz] });
        const tip = new THREE.Vector3(0, h, 0).applyEuler(e);
        const ear = cone(0.032, 0.12, 4);
        ear.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
        b.add(ear, gold, { pos: [px + tip.x, 0.08 + tip.y, pz + tip.z] });
      }
    }
  }
}

function soy(b: PartBuilder, x: number, z: number, cs: number, rnd: () => number): void {
  const rows = 5;
  soil(b, x, z, cs, rows, '#4d3a28');
  for (let r = 0; r < rows; r++) {
    const rz = z - cs * 0.36 + (r * cs * 0.72) / (rows - 1);
    for (let i = 0; i < 6; i++) {
      const px = x - cs * 0.39 + (i * cs * 0.78) / 5 + (rnd() - 0.5) * 0.08;
      const pz = rz + (rnd() - 0.5) * 0.06;
      const s = 0.1 + rnd() * 0.04;
      const green = mix('#3f7a34', '#6a9a3e', rnd());
      b.add(blob(s), green, { pos: [px, 0.1 + s * 0.7, pz], scale: [1.2, 0.8, 1] });
      b.add(blob(s * 0.75), mix(green, '#8fb04a', 0.35), { pos: [px + (rnd() - 0.5) * 0.12, 0.12 + s, pz + (rnd() - 0.5) * 0.1], scale: [1, 0.8, 1.1] });
    }
  }
}

function vegetables(b: PartBuilder, x: number, z: number, cs: number, rnd: () => number): void {
  const rows = 5;
  soil(b, x, z, cs, rows, '#4b3826');
  const lettuce = rnd() < 0.5;
  for (let r = 0; r < rows; r++) {
    const rz = z - cs * 0.36 + (r * cs * 0.72) / (rows - 1);
    for (let i = 0; i < 6; i++) {
      const px = x - cs * 0.39 + (i * cs * 0.78) / 5 + (rnd() - 0.5) * 0.05;
      const pz = rz + (rnd() - 0.5) * 0.05;
      const s = 0.085 + rnd() * 0.025;
      const head = lettuce ? mix('#8cc34f', '#a9d466', rnd()) : mix('#7fa66a', '#9bbf86', rnd());
      // folhas externas abertas e cabeça no centro
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + rnd();
        b.add(petal(s * 0.8), mix(head, '#3f6b2e', 0.45), { pos: [px + Math.cos(a) * s * 0.75, 0.1, pz + Math.sin(a) * s * 0.75], scale: [1.2, 0.35, 1.2] });
      }
      b.add(blob(s), head, { pos: [px, 0.1 + s * 0.55, pz], scale: [1, 0.85, 1] });
    }
  }
}

/** Uma célula cultivada centrada em (x, z), com a cultura sorteada pelo índice da célula. */
export function cropCell(b: PartBuilder, x: number, z: number, cs: number, cellIndex: number): void {
  const rnd = rng(cellIndex + 1);
  const crop = cropOf(cellIndex);
  if (crop === 'corn') corn(b, x, z, cs, rnd);
  else if (crop === 'wheat') wheat(b, x, z, cs, rnd);
  else if (crop === 'soy') soy(b, x, z, cs, rnd);
  else vegetables(b, x, z, cs, rnd);
}

/** Trator agrícola (frente para +x): capô, cabine com vidros, rodas traseiras grandes e escapamento. */
export function tractor(b: PartBuilder, g: PartBuilder, x: number, y: number, z: number, color: string = C.red): void {
  b.box(0.34, 0.16, 0.2, color, [x + 0.08, y + 0.2, z]); // capô
  b.box(0.06, 0.12, 0.18, C.metalDark, [x + 0.26, y + 0.19, z]); // grade
  b.box(0.18, 0.12, 0.22, color, [x - 0.12, y + 0.2, z]);
  for (const k of [-1, 1]) for (const dx of [-0.2, -0.04]) b.box(0.03, 0.2, 0.03, C.metalDark, [x + dx, y + 0.36, z + k * 0.1]);
  b.box(0.22, 0.03, 0.24, color, [x - 0.12, y + 0.47, z]); // teto
  g.box(0.14, 0.15, 0.2, '#ffffff', [x - 0.12, y + 0.36, z]);
  b.add(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 5), C.metalDark, { pos: [x + 0.16, y + 0.36, z + 0.06] });
  for (const k of [-1, 1]) {
    b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10), C.rubber, { pos: [x - 0.12, y + 0.14, z + k * 0.15], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.082, 8), C.yellow, { pos: [x - 0.12, y + 0.14, z + k * 0.15], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8), C.rubber, { pos: [x + 0.17, y + 0.09, z + k * 0.12], rot: [Math.PI / 2, 0, 0] });
  }
}
