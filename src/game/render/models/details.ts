import * as THREE from 'three';
import { C, type PartBuilder } from './kit.ts';
import { strut } from './rigging.ts';

/**
 * Detalhes de acabamento dos modelos base (presos às paredes e coberturas, dentro da área que cada
 * edifício já ocupava, para não colidir com os módulos de melhoria): nervuras de chapa, pilastras,
 * portões com réguas, marquises, para-choques de doca, luminárias, escadas, guarda-corpos,
 * venezianas, cercas e canteiros.
 */

/** Luminária de parede com braço, voltada para +z (ou −x/+x com `dir`). */
function wallLight(b: PartBuilder, x: number, y: number, z: number, dir: 'z' | '-x' | 'x' = 'z'): void {
  const off = 0.06;
  const p: [number, number, number] = dir === 'z' ? [x, y, z + off] : dir === 'x' ? [x + off, y, z] : [x - off, y, z];
  b.box(dir === 'z' ? 0.04 : 0.1, 0.03, dir === 'z' ? 0.1 : 0.04, C.metalDark, [(x + p[0]) / 2, y, (z + p[2]) / 2]);
  b.box(0.1, 0.04, 0.08, '#f2e6a0', [p[0], y - 0.03, p[2]]);
}

// ------------------------------------------------------------------ base militar (hangar)

export function barracksDetail(b: PartBuilder, g: PartBuilder): void {
  // costelas metálicas da cobertura em arco
  for (let i = 0; i < 7; i++) {
    const x = -1.6 + i * (3.2 / 6);
    b.add(new THREE.TorusGeometry(1.36, 0.022, 4, 14, Math.PI), C.metalDark, { pos: [x, 1.05, -0.1], rot: [0, Math.PI / 2, 0], scale: [1, 0.55, 1] });
  }
  // pilastras nas paredes laterais e no fundo
  for (let i = 0; i <= 4; i++) {
    const z = -1.38 + i * 0.64;
    for (const s of [-1, 1]) b.box(0.05, 0.9, 0.08, C.concreteDark, [s * 1.62, 0.6, z]);
  }
  // réguas do portão, portas laterais com janelinhas e luminárias
  for (let i = 0; i < 6; i++) b.box(1.02, 0.015, 0.075, C.metal, [0, 0.2 + i * 0.13, 1.25]);
  b.box(1.1, 0.05, 0.09, C.concreteDark, [0, 1.02, 1.24]);
  for (const s of [-1, 1]) {
    b.box(0.03, 0.42, 0.22, '#4f5a50', [s * 1.615, 0.37, 0.55]);
    g.box(0.03, 0.12, 0.3, '#ffffff', [s * 1.615, 0.82, -0.6]);
    wallLight(b, s * 0.7, 0.98, 1.21);
  }
}

// ------------------------------------------------------------------ fábrica

export function factoryDetail(b: PartBuilder, g: PartBuilder): void {
  // pilastras de concreto na fachada e nas laterais
  for (const x of [-1.72, -1.27, 0.07, 0.75, 1.25, 1.72]) b.box(0.08, 1.6, 0.06, C.concrete, [x, 0.95, 1.48]);
  for (const z of [-1.4, -0.67, 0, 0.67, 1.4]) for (const s of [-1, 1]) b.box(0.06, 1.6, 0.08, C.concrete, [s * 1.78, 0.95, z]);
  // marquise metálica sobre o portão com mãos-francesas
  b.box(1.4, 0.05, 0.28, C.metal, [-0.6, 1.4, 1.61]);
  for (const x of [-1.2, 0.0]) strut(b, [x, 1.18, 1.48], [x, 1.38, 1.72], 0.03, C.metalDark);
  // porta de pessoal, faixa de segurança no piso e luminárias
  b.box(0.22, 0.45, 0.03, '#5d6b74', [0.6, 0.38, 1.47]);
  g.box(0.12, 0.1, 0.02, '#ffffff', [0.6, 0.48, 1.49]);
  for (let i = 0; i < 6; i++) b.box(0.14, 0.012, 0.08, i % 2 ? C.yellow : '#2a2a2a', [-1.2 + i * 0.24, 0.165, 1.62]);
  wallLight(b, -1.45, 1.3, 1.48);
  wallLight(b, 0.25, 1.3, 1.48);
}

// ------------------------------------------------------------------ armazém

export function warehouseDetail(b: PartBuilder): void {
  // chapa ondulada: nervuras verticais nas laterais e no fundo
  for (let z = -1.42; z <= 0.84; z += 0.16) for (const s of [-1, 1]) b.box(0.025, 1.22, 0.035, '#5f6368', [s * 1.663, 0.79, z]);
  for (let x = -1.58; x <= 1.6; x += 0.16) b.box(0.035, 1.22, 0.025, '#5f6368', [x, 0.79, -1.513]);
  // para-choques de doca, calços e luminárias sobre os portões
  for (const x of [-0.9, 0.9]) {
    for (const s of [-1, 1]) b.box(0.08, 0.12, 0.06, '#1b1b1b', [x + s * 0.38, 0.27, 1.47]);
    wallLight(b, x, 1.12, 0.93);
    b.box(0.92, 0.04, 0.05, C.yellow, [x, 0.34, 1.46]);
  }
  // calhas e tubos de descida
  for (const s of [-1, 1]) b.cyl(0.025, 0.025, 1.3, C.metalDark, [s * 1.6, 0.8, 0.94], undefined, 6);
}

// ------------------------------------------------------------------ silo de grãos

export function siloDetail(b: PartBuilder): void {
  // escada marinheiro com degraus e gaiola de proteção
  const x = 0.45;
  const z = 0.35;
  for (let y = 0.3; y < 2.15; y += 0.12) b.box(0.16, 0.012, 0.012, C.steel, [x, y, z]);
  b.box(0.012, 2.1, 0.012, C.steel, [x - 0.08, 1.15, z]);
  b.box(0.012, 2.1, 0.012, C.steel, [x + 0.08, 1.15, z]);
  for (let y = 0.9; y < 2.2; y += 0.3) b.add(new THREE.TorusGeometry(0.13, 0.008, 3, 10, Math.PI), C.steel, { pos: [x, y, z + 0.02], rot: [Math.PI / 2, 0, 0] });
  // rosca transportadora da moega até o topo
  strut(b, [0.45, 0.42, 0.55], [0.12, 2.15, 0.1], 0.06, '#9ea2a6', true);
  b.box(0.12, 0.1, 0.12, C.metalDark, [0.12, 2.18, 0.1]);
  // respiro no domo
  b.cyl(0.05, 0.05, 0.12, C.metalDark, [-0.15, 2.42, -0.1], undefined, 8);
  b.cyl(0.08, 0.08, 0.02, C.metal, [-0.15, 2.49, -0.1], undefined, 8);
}

// ------------------------------------------------------------------ tanque de petróleo

export function oilTankDetail(b: PartBuilder): void {
  // escada helicoidal no lado oeste (os módulos usam os quadrantes leste)
  const r = 0.72;
  const steps = 11;
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    const a = THREE.MathUtils.degToRad(100 + k * 150);
    const y = 0.18 + k * 0.9;
    b.box(0.12, 0.02, 0.07, C.metalDark, [Math.cos(a) * r, y, Math.sin(a) * r], [0, -a, 0]);
    if (i % 2 === 0) b.box(0.012, 0.22, 0.012, C.steel, [Math.cos(a) * (r + 0.05), y + 0.11, Math.sin(a) * (r + 0.05)]);
  }
  for (let i = 0; i < steps - 1; i++) {
    const a0 = THREE.MathUtils.degToRad(100 + (i / (steps - 1)) * 150);
    const a1 = THREE.MathUtils.degToRad(100 + ((i + 1) / (steps - 1)) * 150);
    const y0 = 0.18 + (i / (steps - 1)) * 0.9 + 0.22;
    const y1 = 0.18 + ((i + 1) / (steps - 1)) * 0.9 + 0.22;
    strut(b, [Math.cos(a0) * (r + 0.05), y0, Math.sin(a0) * (r + 0.05)], [Math.cos(a1) * (r + 0.05), y1, Math.sin(a1) * (r + 0.05)], 0.012, C.steel, true);
  }
  // anéis de reforço e bocal de inspeção com válvula
  b.cyl(0.665, 0.665, 0.03, C.metal, [0, 0.35, 0], undefined, 16);
  b.cyl(0.07, 0.07, 0.08, C.metalDark, [-0.66, 0.3, -0.2], [0, 0, Math.PI / 2], 8);
  b.cyl(0.1, 0.1, 0.02, C.red, [-0.72, 0.3, -0.2], [0, 0, Math.PI / 2], 10);
  // placa de risco (losango) na parede do tanque
  b.box(0.16, 0.16, 0.01, '#d23a2a', [0, 0.62, 0.656], [0, 0, Math.PI / 4]);
}

// ------------------------------------------------------------------ casa

export function houseDetail(b: PartBuilder, g: PartBuilder): void {
  // venezianas, floreira, marquise da porta e caminho de lajotas
  for (const s of [-1, 1]) b.box(0.07, 0.22, 0.02, '#4f6b45', [-0.28 + s * 0.15, 0.5, 0.5]);
  b.box(0.3, 0.06, 0.07, C.woodDark, [-0.28, 0.36, 0.53]);
  for (let i = 0; i < 4; i++) b.add(new THREE.IcosahedronGeometry(0.035, 0), i % 2 ? '#c94f6a' : '#e6c24a', { pos: [-0.39 + i * 0.075, 0.41, 0.53] });
  b.box(0.34, 0.025, 0.15, C.roofRed, [0.2, 0.6, 0.56], [0.3, 0, 0]);
  for (const s of [-1, 1]) b.box(0.012, 0.06, 0.1, C.woodDark, [0.2 + s * 0.15, 0.565, 0.53]); // mãos-francesas
  for (let i = 0; i < 3; i++) b.box(0.18, 0.02, 0.12, '#a6a093', [0.2, 0.065, 0.66 + i * 0.1]);
  // cerca de madeira na frente com portão aberto e cerca viva na lateral
  for (const [x0, x1] of [
    [-0.85, -0.02],
    [0.42, 0.85],
  ] as const) {
    for (let x = x0; x <= x1 + 1e-6; x += 0.1) b.box(0.025, 0.18, 0.02, '#e9e4d8', [x, 0.15, 0.86]);
    b.box(x1 - x0, 0.02, 0.015, '#e9e4d8', [(x0 + x1) / 2, 0.17, 0.86]);
  }
  for (let z = -0.7; z <= 0.6; z += 0.22) b.add(new THREE.IcosahedronGeometry(0.11, 0), '#4f7a3a', { pos: [-0.8, 0.13, z], scale: [0.8, 0.9, 1.1] });
  // caixa de correio e janela lateral com moldura
  b.box(0.012, 0.22, 0.012, C.woodDark, [0.55, 0.17, 0.82]);
  b.box(0.08, 0.06, 0.1, '#3f5f8a', [0.55, 0.3, 0.82]);
  g.box(0.04, 0.18, 0.18, '#ffffff', [-0.59, 0.5, -0.15]);
  b.box(0.05, 0.03, 0.24, C.concreteDark, [-0.6, 0.39, -0.15]);
}
