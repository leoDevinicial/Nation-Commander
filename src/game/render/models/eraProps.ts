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

/** Altura do telhado do modelo no ponto (x, z) do referencial do edifício, ou null fora do modelo. */
export type RoofSampler = (x: number, z: number) => number | null;

/**
 * Amostrador de telhado por raio vertical contra as malhas do modelo (só o corpo, sem as peças de era). As peças de era
 * se apoiam no telhado real: o modelo de cada edifício tem forma e altura próprias (torres, platibandas, galpões
 * menores que o terreno), e a altura nominal do edifício deixava painéis e mastros flutuando.
 */
export function roofSampler(root: THREE.Object3D): RoofSampler {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const ray = new THREE.Raycaster();
  const o = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0).transformDirection(root.matrixWorld);
  return (x, z) => {
    o.set(x, 60, z).applyMatrix4(root.matrixWorld);
    ray.set(o, down);
    const hit = ray.intersectObject(root, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible);
    return hit ? hit.point.clone().applyMatrix4(inv).y : null;
  };
}

/** O ponto está num trecho plano de telhado: os vizinhos a `r` em volta ficam na mesma altura (nada de chaminé ou cumeeira). */
function flatAt(roofAt: RoofSampler, x: number, z: number, y: number, r: number, tol: number): boolean {
  for (const [dx, dz] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ] as const) {
    const n = roofAt(x + dx, z + dz);
    if (n === null || Math.abs(n - y) > tol) return false;
  }
  return true;
}

/**
 * Ponto de telhado plano mais perto de (x, z), andando em direção ao centro (o canto pode cair fora do modelo). O trecho
 * precisa ser plano num raio `r` (a base da peça): sem isso o radar ia parar no topo da chaminé da fábrica.
 */
function roofNear(roofAt: RoofSampler, x: number, z: number, r = 0.25): { x: number; z: number; y: number } | null {
  // primeiro um trecho plano; sem nenhum (telhado em arco ou de duas águas), aceita inclinação suave. O topo de uma
  // chaminé nunca passa: em volta dele o telhado fica um metro ou mais abaixo
  for (const tol of [0.08, 0.3])
    for (let k = 0; k <= 10; k++) {
      const f = 1 - k * 0.1;
      const y = roofAt(x * f, z * f);
      if (y !== null && y > 0.2 && flatAt(roofAt, x * f, z * f, y, r, tol)) return { x: x * f, z: z * f, y };
    }
  return null;
}

export function buildEraProps(type: BuildingType, size: number, height: number, era: number, owner: number, roofAt: RoofSampler | null = null): EraProps {
  const group = new THREE.Group();
  let radar: THREE.Object3D | null = null;
  let drone: THREE.Object3D | null = null;
  const half = size / 2;
  const top = height * 0.96;
  // sem amostrador (miniaturas): telhado plano na altura nominal, dentro de 3/4 do terreno
  const roof: RoofSampler = roofAt ?? ((x, z) => (Math.abs(x) <= half * 0.75 && Math.abs(z) <= half * 0.75 ? top : null));
  if (era >= 2 && RADAR_ON.includes(type)) {
    // mastro curto apoiado no telhado e prato parabólico que gira
    const at = roofNear(roof, half * 0.55, -half * 0.55);
    if (at) {
      // escala com o edifício: em construções pequenas (torre, antiaérea) o prato não pode dominar o modelo
      const k = Math.max(0.55, Math.min(1, size / 6));
      const r = new THREE.Group();
      const mast = mesh(sharedGeometry('era-radar-mast', () => new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6)), steel(), at.x, at.y + 0.35 * k, at.z);
      mast.scale.setScalar(k);
      group.add(mast);
      const base = mesh(sharedGeometry('era-radar-base', () => new THREE.CylinderGeometry(0.14, 0.16, 0.06, 8)), dark(), at.x, at.y + 0.03, at.z);
      base.scale.setScalar(k);
      group.add(base);
      r.position.set(at.x, at.y + 0.75 * k, at.z);
      r.scale.setScalar(k);
      // prato parabólico aberto (as duas faces visíveis), inclinado para cima, com nervura e alimentador no foco
      const dish = mesh(
        sharedGeometry('era-radar-dish2', () => {
          const prof: THREE.Vector2[] = [];
          for (let i = 0; i <= 10; i++) {
            const rr = (i / 10) * 0.42;
            prof.push(new THREE.Vector2(rr, (rr * rr) / 0.9));
          }
          return new THREE.LatheGeometry(prof, 20).rotateX(Math.PI / 2);
        }),
        sharedMaterial('era-radar-white', () => new THREE.MeshStandardMaterial({ color: '#e7ebee', roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide })),
        0,
        0.05,
        0,
      );
      dish.rotation.x = -0.45;
      r.add(dish);
      r.add(mesh(sharedGeometry('era-radar-yoke', () => new THREE.BoxGeometry(0.08, 0.16, 0.08)), dark(), 0, -0.05, 0));
      const feed = mesh(sharedGeometry('era-radar-feed', () => new THREE.CylinderGeometry(0.02, 0.02, 0.36, 5).rotateX(Math.PI / 2)), dark(), 0, 0.14, 0.2);
      feed.rotation.x = -0.45;
      r.add(feed);
      group.add(r);
      radar = r;
    }
  }
  if (era >= 3 && SOLAR_ON.includes(type) && size >= 2) {
    // fileira de painéis inclinados voltados para o norte (−z), cada um sobre dois pés que descem até o telhado; um
    // painel só entra onde o telhado embaixo dele é contínuo (sem cair na borda nem atravessar uma torre)
    const n = Math.max(2, Math.min(4, Math.round(size / 1.6)));
    const w = Math.min(1.1, (size * 0.8) / n);
    const tilt = 0.5;
    const depth = 0.75;
    for (let i = 0; i < n; i++) {
      const x = -half * 0.6 + (i + 0.5) * ((size * 0.6) / n);
      let placed = false;
      for (const z of [half * 0.3, half * 0.15, 0, -half * 0.2]) {
        const zf = z - Math.cos(tilt) * depth * 0.45;
        const zb = z + Math.cos(tilt) * depth * 0.45;
        // quatro cantos e o centro: telhado em arco ou de duas águas (cumeeira mais alta no meio) não recebe painel
        // e uma margem de 0,3 em volta: só telhado plano (a cumeeira de um arco parece plana de perto)
        const m = 0.3;
        const ys = [
          roof(x - w * 0.45, zf),
          roof(x + w * 0.45, zf),
          roof(x - w * 0.45, zb),
          roof(x + w * 0.45, zb),
          roof(x, z),
          roof(x, zf - m),
          roof(x, zb + m),
          roof(x - w * 0.45 - m, z),
          roof(x + w * 0.45 + m, z),
        ];
        if (ys.some((y) => y === null || y < 0.2)) continue;
        const lo = Math.min(...(ys as number[]));
        const hi = Math.max(...(ys as number[]));
        if (hi - lo > 0.06) continue;
        const base = hi;
        const p = mesh(box(`solar-${w.toFixed(2)}`, w * 0.9, 0.05, depth), panel(), x, base + 0.26, z);
        p.rotation.x = -tilt;
        group.add(p);
        // pés: o de trás mais alto (painel inclinado), ambos apoiados no telhado
        for (const [zz, h] of [
          [zf, 0.1],
          [zb, 0.42],
        ] as const)
          for (const xx of [x - w * 0.35, x + w * 0.35]) group.add(mesh(box(`solar-leg-${h}`, 0.04, h, 0.04), dark(), xx, base + h / 2, zz, false));
        placed = true;
        break;
      }
      if (!placed) continue;
    }
  }
  if (era >= 3 && MAST_ON.includes(type)) {
    // torre de telecomunicação treliçada com antenas, apoiada no telhado
    const at = roofNear(roof, -half * 0.6, -half * 0.5);
    if (at) {
      const h = 3.2;
      group.add(mesh(sharedGeometry('era-mast', () => new THREE.CylinderGeometry(0.06, 0.16, h, 4, 1, true)), steel(), at.x, at.y + h / 2, at.z));
      group.add(mesh(box('mast-foot', 0.36, 0.06, 0.36), dark(), at.x, at.y + 0.03, at.z));
      for (const y of [0.55, 0.75, 0.92]) group.add(mesh(box('mast-ant', 0.12, 0.42, 0.12), white(), at.x + 0.12, at.y + h * y, at.z, false));
      group.add(
        mesh(sharedGeometry('era-mast-light', () => new THREE.SphereGeometry(0.07, 6, 4)), sharedMaterial('era-beacon', () => new THREE.MeshBasicMaterial({ color: '#ff4a3a' })), at.x, at.y + h + 0.05, at.z, false),
      );
    }
  }
  if (era >= 4 && size >= 2 && type !== 'farm') {
    // faixa de LED na cor da facção, rente às paredes reais do modelo (medidas pelo telhado), logo abaixo da borda
    const led = eraAccentMaterial(owner, 4);
    const edge = (dx: number, dz: number): number => {
      let last = 0;
      for (let k = 1; k <= 40; k++) {
        const d = (k / 40) * half * 1.2;
        if (roof(dx * d, dz * d) === null) break;
        last = d;
      }
      return last;
    };
    const ex = Math.min(edge(1, 0), edge(-1, 0));
    const ez = Math.min(edge(0, 1), edge(0, -1));
    const wallTop = Math.min(...[roof(ex * 0.9, 0), roof(-ex * 0.9, 0), roof(0, ez * 0.9), roof(0, -ez * 0.9)].map((y) => y ?? top));
    if (ex > 0.3 && ez > 0.3 && wallTop > 0.5) {
      const y = wallTop * 0.88;
      for (const [x, z, l, rot] of [
        [0, ez + 0.012, ex * 2, 0],
        [0, -ez - 0.012, ex * 2, 0],
        [ex + 0.012, 0, ez * 2, Math.PI / 2],
        [-ex - 0.012, 0, ez * 2, Math.PI / 2],
      ] as const) {
        const m = mesh(box(`led-${l.toFixed(2)}`, l, 0.045, 0.03), led, x, y, z, false);
        m.rotation.y = rot;
        group.add(m);
      }
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
