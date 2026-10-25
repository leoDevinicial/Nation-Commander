import * as THREE from 'three';
import { Terrain } from '../../../shared/sim/config.ts';
import type { MapData } from '../../../shared/sim/types.ts';
import { Random } from '../../../shared/sim/Random.ts';
import { mat, mesh, sharedGeometry } from './palette.ts';

const TERRAIN_COLORS: Record<Terrain, THREE.Color> = {
  [Terrain.Plains]: new THREE.Color('#6f8a4a'),
  [Terrain.Road]: new THREE.Color('#a8956d'),
  [Terrain.Forest]: new THREE.Color('#3f5a32'),
  [Terrain.Mud]: new THREE.Color('#5c4a35'),
  [Terrain.Water]: new THREE.Color('#2d4f5c'),
  [Terrain.Rock]: new THREE.Color('#77736a'),
};

export const MINIMAP_COLORS: Record<Terrain, string> = {
  [Terrain.Plains]: '#5d7740',
  [Terrain.Road]: '#a08c62',
  [Terrain.Forest]: '#2f4a28',
  [Terrain.Mud]: '#4f3f2d',
  [Terrain.Water]: '#24485a',
  [Terrain.Rock]: '#6b675f',
};

/**
 * Cria a representação visual do mapa. A simulação é 2D plana; a altura aqui é decorativa e
 * mantida baixa nas áreas passáveis para que unidades e terreno continuem alinhados.
 */
export function buildTerrain(map: MapData, quality: 'low' | 'high'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain';
  const W = map.width * map.cellSize;
  const H = map.height * map.cellSize;
  const rng = new Random(map.seed ^ 0x9e3779b9);
  const sub = quality === 'high' ? 2 : 1;
  const segX = map.width * sub;
  const segY = map.height * sub;

  const geo = new THREE.PlaneGeometry(W, H, segX, segY);
  geo.rotateX(-Math.PI / 2);
  geo.translate(W / 2, 0, H / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
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
    // média das células vizinhas suaviza as transições de cor
    tmp.setRGB(0, 0, 0);
    let height = 0;
    const o = map.cellSize * 0.45;
    const samples: Terrain[] = [terrainAt(x - o, z - o), terrainAt(x + o, z - o), terrainAt(x - o, z + o), terrainAt(x + o, z + o)];
    for (const t of samples) {
      tmp.r += TERRAIN_COLORS[t].r / 4;
      tmp.g += TERRAIN_COLORS[t].g / 4;
      tmp.b += TERRAIN_COLORS[t].b / 4;
      height += (t === Terrain.Water ? -0.7 : t === Terrain.Rock ? 0.9 : t === Terrain.Mud ? -0.08 : 0) / 4;
    }
    const jitter = 0.94 + rng.next() * 0.1;
    colors[i * 3] = tmp.r * jitter;
    colors[i * 3 + 1] = tmp.g * jitter;
    colors[i * 3 + 2] = tmp.b * jitter;
    pos.setY(i, height + (rng.next() - 0.5) * 0.06);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // água
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ color: '#2b6f8a', transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.3 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(W / 2, -0.25, H / 2);
  group.add(water);

  // árvores e rochas instanciadas
  const forest: THREE.Vector3[] = [];
  const rocks: THREE.Vector3[] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const t = map.terrain[cy * map.width + cx];
      const bx = cx * map.cellSize;
      const bz = cy * map.cellSize;
      if (t === Terrain.Forest) {
        const n = quality === 'high' ? 2 : 1;
        for (let k = 0; k < n; k++) forest.push(new THREE.Vector3(bx + 0.3 + rng.next() * 1.4, rng.next(), bz + 0.3 + rng.next() * 1.4));
      } else if (t === Terrain.Rock) {
        rocks.push(new THREE.Vector3(bx + 1, rng.next(), bz + 1));
      }
    }
  }
  group.add(instancedTrees(forest, rng));
  group.add(instancedRocks(rocks, rng));

  // jazidas
  for (const n of map.resourceNodes) {
    const g = new THREE.Group();
    g.position.set((n.cx + 1) * map.cellSize, 0, (n.cy + 1) * map.cellSize);
    const crystal = sharedGeometry('crystal', () => new THREE.OctahedronGeometry(0.5, 0));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rng.next();
      const r = 0.4 + rng.next() * 1.1;
      const c = mesh(crystal, mat.crystal(), Math.cos(a) * r, 0.4, Math.sin(a) * r);
      c.scale.set(0.6 + rng.next() * 0.5, 1 + rng.next() * 1.4, 0.6 + rng.next() * 0.5);
      c.rotation.set(rng.next() * 0.4, rng.next() * 3, rng.next() * 0.4);
      g.add(c);
    }
    g.name = 'resource-node';
    group.add(g);
  }
  return group;
}

function instancedTrees(points: THREE.Vector3[], rng: Random): THREE.Group {
  const g = new THREE.Group();
  if (points.length === 0) return g;
  const crown = new THREE.ConeGeometry(0.75, 2.1, 7);
  crown.translate(0, 2, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1, 5);
  trunk.translate(0, 0.5, 0);
  const crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#2f5a2e', roughness: 0.9 }), points.length);
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.9 }), points.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  points.forEach((p, i) => {
    const scale = 0.75 + p.y * 0.6;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI);
    s.set(scale, scale, scale);
    m.compose(new THREE.Vector3(p.x, 0, p.z), q, s);
    crownMesh.setMatrixAt(i, m);
    trunkMesh.setMatrixAt(i, m);
    crownMesh.setColorAt(i, c.setHSL(0.27 + rng.next() * 0.06, 0.4, 0.22 + rng.next() * 0.08));
  });
  crownMesh.castShadow = true;
  trunkMesh.castShadow = true;
  g.add(crownMesh, trunkMesh);
  return g;
}

function instancedRocks(points: THREE.Vector3[], rng: Random): THREE.InstancedMesh {
  const geo = new THREE.DodecahedronGeometry(1.1, 0);
  const rocks = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#7a766c', roughness: 0.95, flatShading: true }), Math.max(points.length, 1));
  rocks.count = points.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  points.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(rng.next(), rng.next() * 6, rng.next()));
    const sc = 0.8 + p.y * 0.6;
    m.compose(new THREE.Vector3(p.x, 0.5, p.z), q, new THREE.Vector3(sc, sc * (0.7 + rng.next() * 0.6), sc));
    rocks.setMatrixAt(i, m);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  return rocks;
}
