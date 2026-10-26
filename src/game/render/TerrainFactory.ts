import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Terrain } from '../../../shared/sim/config.ts';
import { Random } from '../../../shared/sim/Random.ts';
import type { MapData } from '../../../shared/sim/types.ts';
import { withFog } from './materials.ts';
import { createWater, shoreDistance, type WaterReflection } from './Water.ts';
import { asphaltTexture, dirtTexture, grassTexture, rockTexture } from './textures.ts';
import { C, PartBuilder } from './models/kit.ts';

/** Tom aplicado sobre a textura de cada terreno (1 = textura pura). */
const TERRAIN_COLORS: Record<Terrain, THREE.Color> = {
  [Terrain.Plains]: new THREE.Color(1, 1, 1),
  [Terrain.Road]: new THREE.Color(1, 1, 1),
  [Terrain.Forest]: new THREE.Color(0.72, 0.8, 0.64),
  [Terrain.Mud]: new THREE.Color(0.6, 0.53, 0.46),
  [Terrain.Water]: new THREE.Color(0.55, 0.62, 0.6),
  [Terrain.Rock]: new THREE.Color(1, 1, 1),
  [Terrain.Fertile]: new THREE.Color(1.02, 0.9, 0.74),
  [Terrain.Ore]: new THREE.Color(1.12, 0.8, 0.68),
};

/** Canal de textura de cada terreno: grama, terra, asfalto, rocha. */
const SPLAT: Record<Terrain, [number, number, number, number]> = {
  [Terrain.Plains]: [255, 0, 0, 0],
  [Terrain.Forest]: [200, 55, 0, 0],
  [Terrain.Fertile]: [30, 225, 0, 0],
  [Terrain.Mud]: [0, 255, 0, 0],
  [Terrain.Water]: [0, 255, 0, 0],
  [Terrain.Road]: [0, 0, 255, 0],
  [Terrain.Rock]: [0, 0, 0, 255],
  [Terrain.Ore]: [0, 40, 0, 215],
};

/**
 * Solo com texturas reais misturadas por um mapa de pesos (1 texel por célula, filtrado):
 * transições suaves entre grama, terra, asfalto e rocha. Repetição quebrada por variação macro.
 */
function groundMaterial(map: MapData, quality: 'low' | 'high', disposables: { dispose: () => void }[], tint: [number, number, number] = [1, 1, 1]): THREE.MeshStandardMaterial {
  const data = new Uint8Array(map.width * map.height * 4);
  // biomas secos trocam parte da grama por solo exposto (o tom vem de `tint`)
  const dry = Math.max(0, Math.min(0.8, (tint[0] - tint[2]) * 0.9));
  for (let i = 0; i < map.width * map.height; i++) {
    const w = SPLAT[map.terrain[i] ?? Terrain.Plains];
    const moved = Math.round(w[0] * dry);
    data.set([w[0] - moved, Math.min(255, w[1] + moved), w[2], w[3]], i * 4);
  }
  const splat = new THREE.DataTexture(data, map.width, map.height, THREE.RGBAFormat);
  splat.magFilter = THREE.LinearFilter;
  splat.minFilter = THREE.LinearFilter;
  splat.needsUpdate = true;
  disposables.push(splat);
  const size = quality === 'high' ? 512 : 256;
  const tex = { uGrass: grassTexture(size), uDirt: dirtTexture(size), uAsphalt: asphaltTexture(size), uRock: rockTexture(size) };
  const mat = withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.35 }));
  const fogCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    fogCompile.call(mat, shader, renderer);
    shader.uniforms.uSplat = { value: splat };
    shader.uniforms.uTint = { value: new THREE.Vector3(...tint) };
    shader.uniforms.uMapSize = { value: new THREE.Vector2(map.width * map.cellSize, map.height * map.cellSize) };
    for (const [k, t] of Object.entries(tex)) shader.uniforms[k] = { value: t };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uTint; uniform sampler2D uSplat; uniform vec2 uMapSize; uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uAsphalt; uniform sampler2D uRock;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec4 sw = texture2D(uSplat, vFogXZ / uMapSize);
        float sum = sw.r + sw.g + sw.b + sw.a + 1e-4;
        vec2 tuv = vFogXZ * 0.12;
        vec3 ground = texture2D(uGrass, tuv).rgb * sw.r
          + texture2D(uDirt, tuv * 1.1).rgb * sw.g
          + texture2D(uAsphalt, tuv * 0.8).rgb * sw.b
          + texture2D(uRock, tuv * 0.7).rgb * sw.a;
        ground /= sum;
        // variação em grande escala para não denunciar a repetição
        float macro = texture2D(uGrass, vFogXZ * 0.013 + 0.37).g;
        diffuseColor.rgb = ground * vColor.rgb * uTint * (0.86 + 0.28 * macro);`,
      );
  };
  mat.customProgramCacheKey = () => 'nc-ground-v2';
  return mat;
}

/**
 * Relevo além dos limites do mapa: planície que sobe em morros e montanhas, desaparecendo na
 * neblina do horizonte. Só cenário — fora da área jogável.
 */
function buildSkirt(map: MapData, quality: 'low' | 'high', disposables: { dispose: () => void }[]): THREE.Mesh {
  const W = map.width * map.cellSize;
  const H = map.height * map.cellSize;
  const ext = 260;
  const seg = quality === 'high' ? 160 : 90;
  const geo = new THREE.PlaneGeometry(W + ext * 2, H + ext * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(W / 2, 0, H / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const rng = new Random(map.seed ^ 0x51ed);
  const grid = Array.from({ length: 33 * 33 }, () => rng.next());
  const n = (x: number, z: number) => {
    const wrap = (v: number) => ((v % 32) + 32) % 32;
    const gx = wrap(((x + ext) / (W + ext * 2)) * 32);
    const gz = wrap(((z + ext) / (H + ext * 2)) * 32);
    const x0 = Math.min(31, Math.floor(gx));
    const z0 = Math.min(31, Math.floor(gz));
    const tx = gx - x0;
    const tz = gz - z0;
    const v = (i: number, j: number) => grid[(z0 + j) * 33 + x0 + i]!;
    return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - tz) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * tz;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dx = Math.max(0, -x, x - W);
    const dz = Math.max(0, -z, z - H);
    const d = Math.hypot(dx, dz);
    const rise = THREE.MathUtils.smoothstep(d, 6, 120);
    const h = d <= 0.01 ? -1.2 : rise * (8 + 60 * n(x, z) * n(x * 1.7, z * 1.7)) + (n(x * 4, z * 4) - 0.5) * 1.5 * rise - 0.3;
    pos.setY(i, h);
    const rocky = THREE.MathUtils.smoothstep(h, 14, 32);
    colors[i * 3] = 0.56 + rocky * 0.4;
    colors[i * 3 + 1] = 0.6 + rocky * 0.3;
    colors[i * 3 + 2] = 0.48 + rocky * 0.44;
    uv.setXY(i, x * 0.05, z * 0.05);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTexture(quality === 'high' ? 512 : 256), roughness: 1, metalness: 0, envMapIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  disposables.push(geo, mat);
  return mesh;
}

export const MINIMAP_COLORS: Record<Terrain, string> = {
  [Terrain.Plains]: '#5d7740',
  [Terrain.Road]: '#a08c62',
  [Terrain.Forest]: '#2f4a28',
  [Terrain.Mud]: '#4f3f2d',
  [Terrain.Water]: '#24485a',
  [Terrain.Rock]: '#7a766c',
  [Terrain.Fertile]: '#7d6a3e',
  [Terrain.Ore]: '#8a5a44',
};

const NATURE_URL = '/assets/models/nature/';
const TREE_MODELS = ['TreeMed001', 'TreeMed002', 'TreeMed003', 'TreeLow001', 'TreeLow002', 'TreeLow003', 'TreeLow004'];
const ROCK_MODELS = ['Rock001', 'Rock002', 'Rock003', 'Cliff001', 'Cliff002', 'Cliff003'];
const BUSH_MODELS = ['Bush001', 'Bush002'];

export interface TerrainHandle {
  group: THREE.Group;
  /** Carrega modelos do Nature Kit e substitui a vegetação procedural (assíncrono). */
  upgrade: () => Promise<void>;
  /** Superfície da água (oculta durante a medição de exposição para não refletir duas vezes). */
  water: THREE.Mesh;
  /** Anima as ondulações da água (segundos). */
  update: (time: number) => void;
  dispose: () => void;
}

/**
 * Representação visual do mapa. A simulação é 2D plana; a altura aqui é decorativa e baixa nas
 * áreas passáveis para que unidades e terreno continuem alinhados.
 */
/**
 * Tom do solo por bioma (Fase 8): a batalha local reflete a região escolhida — areia e ocre no
 * árido, verde fechado no tropical, palha nos campos abertos, tons frios no frio.
 */
export const BIOME_TINT: Record<'temperate' | 'arid' | 'tropical' | 'cold' | 'grassland', [number, number, number]> = {
  temperate: [1, 1, 1],
  grassland: [1.08, 1.03, 0.82],
  tropical: [0.8, 1.0, 0.78],
  arid: [1.36, 1.06, 0.66],
  cold: [0.9, 0.97, 1.06],
};

export function buildTerrain(map: MapData, quality: 'low' | 'high', reflection: WaterReflection = 'sky', ultra = false, cinematic = false, tint: [number, number, number] = [1, 1, 1]): TerrainHandle {
  const group = new THREE.Group();
  group.name = 'terrain';
  const W = map.width * map.cellSize;
  const H = map.height * map.cellSize;
  const rng = new Random(map.seed ^ 0x9e3779b9);
  // Ultra+: malha do chão 4× mais fina (relevo e margens mais suaves)
  const sub = cinematic ? 4 : quality === 'high' ? 2 : 1;
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
      height += (t === Terrain.Water ? -0.7 : t === Terrain.Rock || t === Terrain.Ore ? 0.9 : t === Terrain.Mud ? -0.08 : 0) / 4;
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
  const groundMat = groundMaterial(map, quality, disposables, tint);
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);
  disposables.push(geo, groundMat);
  group.add(buildSkirt(map, quality, disposables));

  let shore: THREE.DataTexture | null = null;
  if (ultra) {
    shore = new THREE.DataTexture(
      shoreDistance(map.width, map.height, (i) => map.terrain[i] === Terrain.Water),
      map.width,
      map.height,
      THREE.RedFormat,
    );
    shore.magFilter = THREE.LinearFilter;
    shore.minFilter = THREE.LinearFilter;
    shore.needsUpdate = true;
    disposables.push(shore);
  }
  const water = createWater(W, H, reflection, { waves: ultra, shore });
  group.add(water.mesh);
  disposables.push(water);

  // posições da vegetação e das rochas (sementes determinísticas)
  const trees: { x: number; z: number; s: number; r: number; v: number }[] = [];
  const rocks: { x: number; z: number; s: number; r: number; v: number }[] = [];
  const bushes: { x: number; z: number; s: number; r: number; v: number }[] = [];
  const ores: { x: number; z: number; s: number; r: number; v: number }[] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const t = map.terrain[cy * map.width + cx];
      const bx = cx * map.cellSize;
      const bz = cy * map.cellSize;
      if (t === Terrain.Forest) {
        const n = quality === 'high' ? 2 : 1;
        for (let k = 0; k < n; k++) trees.push({ x: bx + 0.3 + rng.next() * 1.4, z: bz + 0.3 + rng.next() * 1.4, s: 0.8 + rng.next() * 0.5, r: rng.next() * 6.28, v: rng.next() });
      } else if (t === Terrain.Rock || t === Terrain.Ore) {
        rocks.push({ x: bx + 1, z: bz + 1, s: 0.9 + rng.next() * 0.5, r: rng.next() * 6.28, v: rng.next() });
        if (t === Terrain.Ore) ores.push({ x: bx + 0.4 + rng.next() * 1.2, z: bz + 0.4 + rng.next() * 1.2, s: 0.5 + rng.next() * 0.3, r: rng.next() * 6.28, v: rng.next() });
      } else if (t === Terrain.Plains && quality === 'high' && rng.next() < 0.025) {
        bushes.push({ x: bx + rng.next() * 2, z: bz + rng.next() * 2, s: 0.5 + rng.next() * 0.4, r: rng.next() * 6.28, v: rng.next() });
      }
    }
  }

  const decor = new THREE.Group();
  decor.add(proceduralTrees(trees), proceduralRocks(rocks));
  group.add(decor);

  // veios de minério: blocos ferruginosos entre as rochas da montanha
  const ore = new PartBuilder();
  for (const o of ores) ore.box(0.5 * o.s, 0.35 * o.s, 0.45 * o.s, o.v > 0.5 ? '#8a4b32' : '#6e3d2b', [o.x, 0.45 + 0.15 * o.s, o.z], [o.r * 0.3, o.r, 0]);
  if (!ore.isEmpty) {
    const m = new THREE.Mesh(ore.build(), withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35, flatShading: true })));
    m.castShadow = true;
    group.add(m);
    disposables.push(m.geometry, m.material as THREE.Material);
  }

  // jazidas de petróleo (subterrâneas): solo escurecido e estacas de prospecção, sem poça à mostra
  const oil = new PartBuilder();
  for (const n of map.resourceNodes) {
    const x = (n.cx + 1) * map.cellSize;
    const z = (n.cy + 1) * map.cellSize;
    oil.cyl(1.2, 1.2, 0.02, '#3d3a33', [x, 0.02, z], undefined, 9);
    for (let k = 0; k < 4; k++) {
      const px = x + Math.cos(k * 1.57 + 0.4) * 1.25;
      const pz = z + Math.sin(k * 1.57 + 0.4) * 1.25;
      oil.cyl(0.03, 0.03, 0.5, C.wood, [px, 0.25, pz], undefined, 5);
      oil.box(0.12, 0.06, 0.02, C.yellow, [px, 0.47, pz]);
    }
  }
  if (!oil.isEmpty) {
    const m = new THREE.Mesh(oil.build(), withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true })));
    m.receiveShadow = true;
    group.add(m);
    disposables.push(m.geometry, m.material as THREE.Material);
  }

  const upgrade = async (): Promise<void> => {
    const loader = new GLTFLoader();
    const load = async (name: string, weather: number): Promise<{ geo: THREE.BufferGeometry; mat: THREE.Material; height: number } | null> => {
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
        const mat = withFog((mesh.material as THREE.Material).clone(), { weather });
        // Ultra: sombreamento suave (copas e rochas sem facetas marcadas)
        if ('flatShading' in mat) (mat as THREE.MeshStandardMaterial).flatShading = !ultra;
        return { geo, mat, height };
      } catch {
        return null;
      }
    };
    const treeKit = (await Promise.all(TREE_MODELS.map((n) => load(n, 0.45)))).filter((x) => x !== null);
    const rockKit = (await Promise.all(ROCK_MODELS.map((n) => load(n, 0.85)))).filter((x) => x !== null);
    const bushKit = (await Promise.all(BUSH_MODELS.map((n) => load(n, 0.4)))).filter((x) => x !== null);
    if (treeKit.length === 0 || rockKit.length === 0) return; // mantém o procedural
    decor.clear();
    decor.add(instanced(treeKit, trees, 2.6, 0, true, FOLIAGE_TINT));
    decor.add(instanced(rockKit, rocks, 1.5, -0.1, true, ROCK_TINT));
    if (bushKit.length) decor.add(instanced(bushKit, bushes, 0.7, 0, true, FOLIAGE_TINT));
    for (const k of [...treeKit, ...rockKit, ...bushKit]) disposables.push(k.geo, k.mat);
  };

  return {
    group,
    upgrade,
    water: water.mesh,
    update: water.update,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Pseudoaleatório estável por posição (mesma variação a cada partida no mesmo mapa). */
function hash2(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Variação natural por instância: folhagens menos saturadas e com tons diferentes (verde-oliva,
 * seco, escuro), rochas com brilho variável. Evita a cara de "brinquedo" de cópias idênticas.
 */
const FOLIAGE_TINT = (h: number, out: THREE.Color): THREE.Color => {
  const b = 0.7 + h * 0.3;
  const dry = Math.max(0, h - 0.75) * 1.2;
  return out.setRGB(b * (0.82 + dry), b * 0.9, b * (0.7 - dry * 0.3));
};
const ROCK_TINT = (h: number, out: THREE.Color): THREE.Color => {
  const b = 0.72 + h * 0.3;
  return out.setRGB(b, b * 0.98, b * 0.93);
};

/** Distribui instâncias de uma família de modelos entre variantes, normalizadas pela altura. */
function instanced(
  kit: { geo: THREE.BufferGeometry; mat: THREE.Material; height: number }[],
  items: { x: number; z: number; s: number; r: number; v: number }[],
  targetHeight: number,
  y: number,
  shadows = true,
  tint?: (h: number, out: THREE.Color) => THREE.Color,
): THREE.Group {
  const g = new THREE.Group();
  kit.forEach((k, idx) => {
    const mine = items.filter((it) => Math.floor(it.v * kit.length) === idx);
    if (!mine.length) return;
    const im = new THREE.InstancedMesh(k.geo, k.mat, mine.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    mine.forEach((it, i) => {
      const sc = (targetHeight / k.height) * it.s;
      q.setFromAxisAngle(up, it.r);
      m.compose(new THREE.Vector3(it.x, y, it.z), q, new THREE.Vector3(sc, sc, sc));
      im.setMatrixAt(i, m);
      if (tint) im.setColorAt(i, tint(hash2(it.x, it.z), color));
    });
    im.castShadow = shadows;
    im.receiveShadow = true;
    g.add(im);
  });
  return g;
}

function proceduralTrees(points: { x: number; z: number; s: number; r: number }[]): THREE.Group {
  const g = new THREE.Group();
  if (points.length === 0) return g;
  const crown = new THREE.ConeGeometry(0.75, 2.1, 7);
  crown.translate(0, 2, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1, 5);
  trunk.translate(0, 0.5, 0);
  const crownMesh = new THREE.InstancedMesh(crown, withFog(new THREE.MeshStandardMaterial({ color: '#3a5a32', roughness: 0.9, flatShading: true }), { weather: 0.45 }), points.length);
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
    withFog(new THREE.MeshStandardMaterial({ color: '#7a766c', roughness: 0.95, flatShading: true }), { weather: 0.85 }),
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
