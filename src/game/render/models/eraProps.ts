import * as THREE from 'three';
import type { BuildingType } from '../../../../shared/sim/config.ts';
import { eraAccentMaterial } from '../materials.ts';
import { sharedGeometry, sharedMaterial } from '../palette.ts';
import { buildDrone, type DroneParts } from './droneModel.ts';

/**
 * Peças que marcam a era de cada construção (lote 1, §3.1), por cima do modelo:
 * - Pós-Guerra Fria: radar giratório nas instalações militares e no QG;
 * - Era Digital: painéis solares nos telhados e torre de telecomunicação no QG e nas prefeituras;
 * - Futuro Próximo: faixa de LED na cor da facção no alto das paredes e um drone de vigilância
 *   pairando sobre o QG.
 * As peças das eras anteriores continuam (a nação evolui por camadas).
 */
export interface EraProps {
  group: THREE.Group;
  /** Partes animadas: o prato do radar gira; o drone circula, inclina nas curvas e gira as hélices. */
  radar: THREE.Object3D | null;
  drone: THREE.Object3D | null;
  droneParts: DroneParts | null;
}

const RADAR_ON: BuildingType[] = ['hq', 'barracks', 'factory', 'tower', 'airbase', 'aa_battery', 'research_center'];
const SOLAR_ON: BuildingType[] = ['hq', 'barracks', 'factory', 'house', 'residential', 'warehouse', 'market', 'research_center', 'city_hall', 'rail_station', 'port', 'airbase'];
const MAST_ON: BuildingType[] = ['hq', 'city_hall'];

const steel = () => sharedMaterial('era-steel', () => new THREE.MeshStandardMaterial({ color: '#8e979f', roughness: 0.45, metalness: 0.75 }));
const dark = () => sharedMaterial('era-dark', () => new THREE.MeshStandardMaterial({ color: '#2b3137', roughness: 0.5, metalness: 0.5 }));
const panel = () => sharedMaterial('era-solar', () => new THREE.MeshStandardMaterial({ color: '#1d2e4a', emissive: '#0c1830', emissiveIntensity: 0.3, roughness: 0.18, metalness: 0.7 }));
const white = () => sharedMaterial('era-white', () => new THREE.MeshStandardMaterial({ color: '#e7ebee', roughness: 0.5, metalness: 0.2 }));

const box = (k: string, w: number, h: number, d: number) => sharedGeometry(`era-box-${k}`, () => new THREE.BoxGeometry(w, h, d));

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

export function buildEraProps(type: BuildingType, size: number, height: number, era: number, owner: number): EraProps {
  const group = new THREE.Group();
  let radar: THREE.Object3D | null = null;
  let drone: THREE.Object3D | null = null;
  const half = size / 2;
  const top = height * 0.96;
  if (era >= 2 && RADAR_ON.includes(type)) {
    // mastro curto no canto e prato parabólico que gira
    const r = new THREE.Group();
    const x = half * 0.55;
    const z = -half * 0.55;
    group.add(mesh(sharedGeometry('era-radar-mast', () => new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6)), steel(), x, top + 0.35, z));
    r.position.set(x, top + 0.75, z);
    const dish = mesh(sharedGeometry('era-radar-dish', () => new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32).rotateX(Math.PI / 2)), white(), 0, 0, 0);
    dish.rotation.x = -0.35;
    r.add(dish);
    r.add(mesh(sharedGeometry('era-radar-feed', () => new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5).rotateX(Math.PI / 2)), dark(), 0, 0.05, 0.22));
    group.add(r);
    radar = r;
  }
  if (era >= 3 && SOLAR_ON.includes(type) && size >= 2) {
    // fileira de painéis inclinados voltados para o norte (−z), com estrutura escura
    const n = Math.max(2, Math.min(4, Math.round(size / 1.6)));
    const w = Math.min(1.1, (size * 0.8) / n);
    for (let i = 0; i < n; i++) {
      const x = -half * 0.6 + (i + 0.5) * ((size * 0.6) / n);
      const p = mesh(box(`solar-${w.toFixed(2)}`, w * 0.9, 0.05, 0.75), panel(), x, top + 0.22, half * 0.3);
      p.rotation.x = -0.5;
      group.add(p);
      group.add(mesh(box('solar-leg', 0.05, 0.3, 0.05), dark(), x, top + 0.1, half * 0.3 + 0.2, false));
    }
  }
  if (era >= 3 && MAST_ON.includes(type)) {
    // torre de telecomunicação treliçada com antenas
    const mx = -half * 0.6;
    const mz = -half * 0.5;
    const h = 3.2;
    group.add(mesh(sharedGeometry('era-mast', () => new THREE.CylinderGeometry(0.06, 0.16, h, 4, 1, true)), steel(), mx, top + h / 2, mz));
    for (const y of [0.55, 0.75, 0.92]) group.add(mesh(box('mast-ant', 0.12, 0.42, 0.12), white(), mx + 0.12, top + h * y, mz, false));
    group.add(mesh(sharedGeometry('era-mast-light', () => new THREE.SphereGeometry(0.07, 6, 4)), sharedMaterial('era-beacon', () => new THREE.MeshBasicMaterial({ color: '#ff4a3a' })), mx, top + h + 0.05, mz, false));
  }
  if (era >= 4 && size >= 2 && type !== 'farm') {
    // faixa de LED contornando o alto das paredes, na cor da facção
    const led = eraAccentMaterial(owner, 4);
    // rente às paredes do modelo (que ocupa ~3/4 do terreno da construção)
    const y = height * 0.62;
    const e = half * 0.74;
    const l = e * 2;
    for (const [x, z, rot] of [
      [0, e, 0],
      [0, -e, 0],
      [e, 0, Math.PI / 2],
      [-e, 0, Math.PI / 2],
    ] as const) {
      const m = mesh(box(`led-${l.toFixed(2)}`, l, 0.045, 0.03), led, x, y, z, false);
      m.rotation.y = rot;
      group.add(m);
    }
  }
  if (era >= 4 && type === 'hq') {
    // drone de vigilância: casco facetado, câmera, braços e rotores com protetor (droneModel.ts)
    const parts = buildDrone(owner);
    const d = parts.group;
    d.userData.drone = parts;
    d.position.set(0, height + 2.2, 0);
    group.add(d);
    drone = d;
  }
  return { group, radar, drone, droneParts: drone ? (drone.userData.drone as DroneParts) : null };
}
