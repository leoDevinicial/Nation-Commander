import * as THREE from 'three';

import { factionColor } from '../factions.ts';

export { factionColor };

const materialCache = new Map<string, THREE.Material>();

/** Materiais compartilhados por chave — reutilizados entre unidades equivalentes. */
export function sharedMaterial(key: string, make: () => THREE.Material): THREE.Material {
  let m = materialCache.get(key);
  if (!m) {
    m = make();
    materialCache.set(key, m);
  }
  return m;
}

export function factionMaterial(slot: number, variant: 'base' | 'dark' = 'base'): THREE.Material {
  return sharedMaterial(`faction-${slot}-${variant}`, () => {
    const c = new THREE.Color(factionColor(slot));
    if (variant === 'dark') c.multiplyScalar(0.55);
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.25 });
  });
}

export const mat = {
  metal: () => sharedMaterial('metal', () => new THREE.MeshStandardMaterial({ color: '#59616b', roughness: 0.45, metalness: 0.7 })),
  darkMetal: () => sharedMaterial('darkMetal', () => new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.7, metalness: 0.5 })),
  concrete: () => sharedMaterial('concrete', () => new THREE.MeshStandardMaterial({ color: '#a9a69c', roughness: 0.9 })),
  concreteDark: () => sharedMaterial('concreteDark', () => new THREE.MeshStandardMaterial({ color: '#77746c', roughness: 0.95 })),
  glass: () => sharedMaterial('glass', () => new THREE.MeshStandardMaterial({ color: '#9fd4f0', roughness: 0.1, metalness: 0.2, emissive: '#1d4b66', emissiveIntensity: 0.6 })),
  skin: () => sharedMaterial('skin', () => new THREE.MeshStandardMaterial({ color: '#c8a27a', roughness: 0.8 })),
  olive: () => sharedMaterial('olive', () => new THREE.MeshStandardMaterial({ color: '#4f5a3a', roughness: 0.85 })),
  crystal: () =>
    sharedMaterial('crystal', () => new THREE.MeshStandardMaterial({ color: '#46d6c4', emissive: '#14806f', emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 })),
  ghostOk: () => sharedMaterial('ghostOk', () => new THREE.MeshBasicMaterial({ color: '#5cc47a', transparent: true, opacity: 0.4, depthWrite: false })),
  ghostBad: () => sharedMaterial('ghostBad', () => new THREE.MeshBasicMaterial({ color: '#e05a4c', transparent: true, opacity: 0.4, depthWrite: false })),
};

const geoCache = new Map<string, THREE.BufferGeometry>();

export function sharedGeometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const box = (w: number, h: number, d: number) => sharedGeometry(`box-${w}-${h}-${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt: number, rb: number, h: number, seg = 10) =>
  sharedGeometry(`cyl-${rt}-${rb}-${h}-${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const sphere = (r: number, seg = 10) => sharedGeometry(`sph-${r}-${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)));

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, castShadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

/** Libera todos os recursos compartilhados (ao sair da partida). */
export function disposeSharedResources(): void {
  for (const g of geoCache.values()) g.dispose();
  for (const m of materialCache.values()) m.dispose();
  geoCache.clear();
  materialCache.clear();
}
