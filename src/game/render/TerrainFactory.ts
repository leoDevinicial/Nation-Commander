import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Terrain } from '../../../shared/sim/config.ts';
import { Random } from '../../../shared/sim/Random.ts';
import type { MapData } from '../../../shared/sim/types.ts';
import { withFog } from './materials.ts';
import { C, PartBuilder } from './models/kit.ts';

const TERRAIN_COLORS: Record<Terrain, THREE.Color> = {
  [Terrain.Plains]: new THREE.Color('#71874a'),
  [Terrain.Road]: new THREE.Color('#a8956d'),
  [Terrain.Forest]: new THREE.Color('#4a6236'),
  [Terrain.Mud]: new THREE.Color('#5c4a35'),
  [Terrain.Water]: new THREE.Color('#3b5a52'),
  [Terrain.Rock]: new THREE.Color('#8a857a'),
  [Terrain.Fertile]: new THREE.Color('#6d5a37'),
};

export const MINIMAP_COLORS: Record<Terrain, string> = {
  [Terrain.Plains]: '#5d7740',
  [Terrain.Road]: '#a08c62',
  [Terrain.Forest]: '#2f4a28',
  [Terrain.Mud]: '#4f3f2d',
  [Terrain.Water]: '#24485a',
  [Terrain.Rock]: '#7a766c',
  [Terrain.Fertile]: '#7d6a3e',
};

const NATURE_URL = '/assets/models/nature/';
const TREE_MODELS = ['TreeMed001', 'TreeMed002', 'TreeMed003', 'TreeLow001', 'TreeLow002', 'TreeLow003', 'TreeLow004'];
const ROCK_MODELS = ['Rock001', 'Rock002', 'Rock003', 'Cliff001', 'Cliff002', 'Cliff003'];
const BUSH_MODELS = ['Bush001', 'Bush002'];
const MOUNTAIN_MODELS = ['MountainFar001', 'MountainFar002', 'MountainFar003'];

/** Textura de detalhe (ruído) que dá granulação ao solo; multiplicada pelas cores de vértice. */
function detailTexture(seed: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new Random(seed);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 228 + Math.floor(rng.next() * 27);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // manchas maiores
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${rng.next() < 0.5 ? '255,255,255' : '0,0,0'},${0.015 + rng.next() * 0.025})`;
    ctx.beginPath();
    ctx.arc(rng.next() * size, rng.next() * size, 4 + rng.next() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface TerrainHandle {
  group: THREE.Group;
  /** Carrega modelos do Nature Kit e substitui a vegetação procedural (assíncrono). */
  upgrade: () => Promise<void>;
  dispose: () => void;
}

/**
 * Representação visual do mapa. A simulação é 2D plana; a altura aqui é decorativa e baixa nas
 * áreas passáveis para que unidades e terreno continuem alinhados.
 */
export function buildTerrain(map: MapData, quality: 'low' | 'high'): TerrainHandle {
  const group = new THREE.Group();
  group.name = 'terrain';
  const W = map.width * map.cellSize;
  const H = map.height * map.cellSize;
  const rng = new Random(map.seed ^ 0x9e3779b9);
  const sub = quality === 'high' ? 2 : 1;
  const disposables: { dispose: () => void }[] = [];

  const geo = new THREE.PlaneGeometry(W, H, map.width * sub, map.height * sub);
  geo.rotateX(-Math.PI / 2);
  geo.translate(W / 2, 0, H / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  const terrainAt = (x: number, z: number): Terrain => {
    const cx = Math.min(map.width - 1, Math.max(0, Math.floor(x / map.cellSize)));
    const cy = Math.min(map.height - 1, Math.max(0, Math.floor(z / map.cellSize)));
    return map.terrain[cy * map.width + cx] ?? Terrain.Plains;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    tmp.setRGB(0, 0, 0);
    let height = 0;
    const o = map.cellSize * 0.45;
    for (const t of [terrainAt(x - o, z - o), terrainAt(x + o, z - o), terrainAt(x - o, z + o), terrainAt(x + o, z + o)]) {
      tmp.r += TERRAIN_COLORS[t].r / 4;
      tmp.g += TERRAIN_COLORS[t].g / 4;
      tmp.b += TERRAIN_COLORS[t].b / 4;
      height += (t === Terrain.Water ? -0.7 : t === Terrain.Rock ? 0.5 : t === Terrain.Mud ? -0.08 : 0) / 4;
    }
    const jitter = 0.93 + rng.next() * 0.12;
    colors[i * 3] = tmp.r * jitter;
    colors[i * 3 + 1] = tmp.g * jitter;
    colors[i * 3 + 2] = tmp.b * jitter;
    pos.setY(i, height + (rng.next() - 0.5) * 0.05);
    uv.setXY(i, (x / W) * 24, (z / H) * 24);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const detail = detailTexture(map.seed);
  const groundMat = withFog(new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 }));
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);
  disposables.push(geo, groundMat, detail);

  const waterGeo = new THREE.PlaneGeometry(W, H);
  const waterMat = withFog(new THREE.MeshStandardMaterial({ color: '#2f6f86', transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.35 }));
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(W / 2, -0.25, H / 2);
  group.add(water);
  disposables.push(waterGeo, waterMat);

  // posições da vegetação e das rochas (sementes determinísticas)
  const trees: { x: number; z: number; s: number; r: number; v: number }[] = [];
  const rocks: { x: number; z: number; s: number; r: number; v: number }[] = [];
  const bushes: { x: number; z: number; s: number; r: number; v: number }[] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const t = map.terrain[cy * map.width + cx];
      const bx = cx * map.cellSize;
      const bz = cy * map.cellSize;
      if (t === Terrain.Forest) {
        const n = quality === 'high' ? 2 : 1;
        for (let k = 0; k < n; k++) trees.push({ x: bx + 0.3 + rng.next() * 1.4, z: bz + 0.3 + rng.next() * 1.4, s: 0.8 + rng.next() * 0.5, r: rng.next() * 6.28, v: rng.next() });
      } else if (t === Terrain.Rock) {
        rocks.push({ x: bx + 1, z: bz + 1, s: 0.9 + rng.next() * 0.5, r: rng.next() * 6.28, v: rng.next() });
      } else if (t === Terrain.Plains && quality === 'high' && rng.next() < 0.025) {
        bushes.push({ x: bx + rng.next() * 2, z: bz + rng.next() * 2, s: 0.5 + rng.next() * 0.4, r: rng.next() * 6.28, v: rng.next() });
      }
    }
  }

  const decor = new THREE.Group();
  decor.add(proceduralTrees(trees), proceduralRocks(rocks));
  group.add(decor);

  // jazidas de petróleo: poça escura e afloramento
  const oil = new PartBuilder();
  for (const n of map.resourceNodes) {
    const x = (n.cx + 1) * map.cellSize;
    const z = (n.cy + 1) * map.cellSize;
    oil.cyl(1.1, 1.1, 0.03, C.oil, [x, 0.03, z], undefined, 14);
    oil.cyl(0.6, 0.6, 0.035, '#2b2722', [x + 0.4, 0.04, z - 0.3], undefined, 10);
    for (let k = 0; k < 4; k++) oil.box(0.3, 0.2, 0.25, '#4a443a', [x + Math.cos(k * 1.7) * 1.3, 0.1, z + Math.sin(k * 1.7) * 1.3], [0, k, 0]);
  }
  if (!oil.isEmpty) {
    const m = new THREE.Mesh(oil.build(), withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.3, flatShading: true })));
    m.receiveShadow = true;
    group.add(m);
    disposables.push(m.geometry, m.material as THREE.Material);
  }

  const upgrade = async (): Promise<void> => {
    const loader = new GLTFLoader();
    const load = async (name: string): Promise<{ geo: THREE.BufferGeometry; mat: THREE.Material; height: number } | null> => {
      try {
        const gltf = await loader.loadAsync(`${NATURE_URL}${name}.glb`);
        let found: THREE.Mesh | null = null;
        gltf.scene.traverse((o) => {
          if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
        });
        if (!found) return null;
        const mesh = found as THREE.Mesh;
        mesh.updateWorldMatrix(true, false);
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        geo.computeBoundingBox();
        const height = geo.boundingBox!.max.y - geo.boundingBox!.min.y;
        const mat = withFog((mesh.material as THREE.Material).clone());
        if ('flatShading' in mat) (mat as THREE.MeshStandardMaterial).flatShading = true;
        return { geo, mat, height };
      } catch {
        return null;
      }
    };
    const treeKit = (await Promise.all(TREE_MODELS.map(load))).filter((x) => x !== null);
    const rockKit = (await Promise.all(ROCK_MODELS.map(load))).filter((x) => x !== null);
    const bushKit = (await Promise.all(BUSH_MODELS.map(load))).filter((x) => x !== null);
    const mountainKit = (await Promise.all(MOUNTAIN_MODELS.map(load))).filter((x) => x !== null);
    if (treeKit.length === 0 || rockKit.length === 0) return; // mantém o procedural
    decor.clear();
    decor.add(instanced(treeKit, trees, 2.6, 0));
    decor.add(instanced(rockKit, rocks, 1.5, -0.1));
    if (bushKit.length) decor.add(instanced(bushKit, bushes, 0.7, 0));
    if (mountainKit.length) decor.add(instanced(mountainKit, horizon(W, H, rng), 1, -0.5, false));
    for (const k of [...treeKit, ...rockKit, ...bushKit, ...mountainKit]) disposables.push(k.geo, k.mat);
  };

  return {
    group,
    upgrade,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Distribui instâncias de uma família de modelos entre variantes, normalizadas pela altura. */
function instanced(
  kit: { geo: THREE.BufferGeometry; mat: THREE.Material; height: number }[],
  items: { x: number; z: number; s: number; r: number; v: number }[],
  targetHeight: number,
  y: number,
  shadows = true,
): THREE.Group {
  const g = new THREE.Group();
  kit.forEach((k, idx) => {
    const mine = items.filter((it) => Math.floor(it.v * kit.length) === idx);
    if (!mine.length) return;
    const im = new THREE.InstancedMesh(k.geo, k.mat, mine.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    mine.forEach((it, i) => {
      const sc = (targetHeight / k.height) * it.s;
      q.setFromAxisAngle(up, it.r);
      m.compose(new THREE.Vector3(it.x, y, it.z), q, new THREE.Vector3(sc, sc, sc));
      im.setMatrixAt(i, m);
    });
    im.castShadow = shadows;
    im.receiveShadow = true;
    g.add(im);
  });
  return g;
}

/** Montanhas ao redor do mapa, fora da área jogável. */
function horizon(W: number, H: number, rng: Random) {
  const out: { x: number; z: number; s: number; r: number; v: number }[] = [];
  const margin = 18;
  for (let t = 0; t < 1; t += 0.035) {
    const per = 2 * (W + H);
    let d = t * per;
    let x: number;
    let z: number;
    if (d < W) [x, z] = [d, -margin];
    else if ((d -= W) < H) [x, z] = [W + margin, d];
    else if ((d -= H) < W) [x, z] = [W - d, H + margin];
    else [x, z] = [-margin, H - (d - W)];
    out.push({ x: x + (rng.next() - 0.5) * 8, z: z + (rng.next() - 0.5) * 8, s: 14 + rng.next() * 10, r: rng.next() * 6.28, v: rng.next() });
  }
  return out;
}

function proceduralTrees(points: { x: number; z: number; s: number; r: number }[]): THREE.Group {
  const g = new THREE.Group();
  if (points.length === 0) return g;
  const crown = new THREE.ConeGeometry(0.75, 2.1, 7);
  crown.translate(0, 2, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1, 5);
  trunk.translate(0, 0.5, 0);
  const crownMesh = new THREE.InstancedMesh(crown, withFog(new THREE.MeshStandardMaterial({ color: '#2f5a2e', roughness: 0.9, flatShading: true })), points.length);
  const trunkMesh = new THREE.InstancedMesh(trunk, withFog(new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.9 })), points.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  points.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r);
    m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    crownMesh.setMatrixAt(i, m);
    trunkMesh.setMatrixAt(i, m);
  });
  crownMesh.castShadow = true;
  trunkMesh.castShadow = true;
  g.add(crownMesh, trunkMesh);
  return g;
}

function proceduralRocks(points: { x: number; z: number; s: number; r: number }[]): THREE.Group {
  const g = new THREE.Group();
  if (points.length === 0) return g;
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1.1, 0),
    withFog(new THREE.MeshStandardMaterial({ color: '#7a766c', roughness: 0.95, flatShading: true })),
    points.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  points.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(0.3, p.r, 0.2));
    m.compose(new THREE.Vector3(p.x, 0.4, p.z), q, new THREE.Vector3(p.s, p.s * 0.8, p.s));
    rocks.setMatrixAt(i, m);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  g.add(rocks);
  return g;
}
