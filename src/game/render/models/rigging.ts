import * as THREE from 'three';
import type { PartBuilder } from './kit.ts';

type V3 = [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);

/** Viga de seção quadrada entre dois pontos (treliças, pernas, escoras, cabos). */
export function strut(b: PartBuilder, from: V3, to: V3, t: number, color: THREE.ColorRepresentation, round = false): void {
  const a = new THREE.Vector3(...from);
  const c = new THREE.Vector3(...to);
  const dir = c.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const mid = a.add(c).multiplyScalar(0.5);
  const geo = round ? new THREE.CylinderGeometry(t / 2, t / 2, len, 5) : new THREE.BoxGeometry(t, len, t);
  b.add(geo, color, { pos: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z] });
}

/** Corrimão simples (postes + dois tubos) ao longo de uma linha no chão. */
export function railing(b: PartBuilder, from: [number, number], to: [number, number], y0: number, h: number, color: THREE.ColorRepresentation, posts = 3): void {
  for (let i = 0; i <= posts; i++) {
    const k = i / posts;
    const x = from[0] + (to[0] - from[0]) * k;
    const z = from[1] + (to[1] - from[1]) * k;
    strut(b, [x, y0, z], [x, y0 + h, z], 0.025, color, true);
  }
  for (const f of [0.55, 1]) strut(b, [from[0], y0 + h * f, from[1]], [to[0], y0 + h * f, to[1]], 0.02, color, true);
}
