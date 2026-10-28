import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Terrain } from '../../../shared/sim/config.ts';
import { Random } from '../../../shared/sim/Random.ts';
import type { MapData } from '../../../shared/sim/types.ts';
import { withFog } from './materials.ts';
import { createWater, groundHeightTexture, type WaterHandle, type WaterReflection } from './Water.ts';
import { asphaltTexture, dirtTexture, grassTexture, rockTexture } from './textures.ts';
import { C, PartBuilder } from './models/kit.ts';
import { decorKept } from './decorThinning.ts';
import { detailedTrees } from './Trees.ts';

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
  /** Controle do reflexo planar da água (null sem reflexo planar). */
  reflection: WaterHandle['reflection'];
  /**
   * Esconde árvores, arbustos e pedras decorativos que ficam sob construções (retângulos em
   * coordenadas de mundo) e devolve os que voltaram a ficar livres. Retorna true se algo mudou.
   */
  clearUnder: (rects: readonly DecorRect[]) => boolean;
  /**
   * Densidade da decoração (árvores, arbustos, pedras) para o KGPS: 1 = toda; abaixo disso, um
   * subconjunto fixo por posição (ver `decorKept`). As instâncias visíveis são compactadas no
   * começo do buffer, então as escondidas não custam nem vértices. Devolve true se algo mudou.
   */
  setDecorDensity: (density: number) => boolean;
  readonly decorDensity: number;
  /** Sombra projetada pela decoração (só afeta o passe de sombra; não recompila shaders). */
  setDecorShadows: (on: boolean) => void;
  readonly decorShadows: boolean;
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

export interface DecorRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Instâncias de decoração que podem ser escondidas sob construções ou rareadas pelo KGPS (matriz e
 * cor originais guardadas; as visíveis vão para o começo do buffer).
 */
interface DecorTrack {
  mesh: THREE.InstancedMesh;
  items: readonly { x: number; z: number }[];
  base: THREE.Matrix4[];
  colors: THREE.Color[] | null;
  hidden: Uint8Array;
  /** A malha foi criada projetando sombra (o KGPS só desliga e religa o que o preset ligou). */
  shadow: boolean;
}

/** Folga em volta do terreno da construção: a copa ou o arbusto não invade a borda do prédio. */
const DECOR_MARGIN = 0.35;

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

  // alturas do chão para a água: profundidade real, ondas calmas no raso e margem sem corte
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) heights[i] = pos.getY(i);
  const groundHeights = groundHeightTexture(heights, map.width * sub + 1, map.height * sub + 1);
  disposables.push(groundHeights.texture);
  const water = createWater(W, H, reflection, { waves: ultra, ground: groundHeights, reflectionSize: cinematic ? 1024 : ultra ? 768 : 512 });
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

  // decoração que some sob construções e que o KGPS pode rarear (as malhas são registradas ao
  // serem criadas)
  let tracks: DecorTrack[] = [];
  let density = 1;
  let decorShadows = true;
  const track = (mesh: THREE.InstancedMesh, items: readonly { x: number; z: number }[]): void => {
    const base = items.map((_, i) => {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(i, m);
      return m;
    });
    const colors = mesh.instanceColor
      ? items.map((_, i) => {
          const c = new THREE.Color();
          mesh.getColorAt(i, c);
          return c;
        })
      : null;
    const shadow = mesh.castShadow;
    mesh.castShadow = shadow && decorShadows;
    tracks.push({ mesh, items, base, colors, hidden: new Uint8Array(items.length), shadow });
  };
  let lastRects: readonly DecorRect[] = [];
  /** Recalcula o que fica visível e compacta as instâncias visíveis no começo do buffer. */
  const refresh = (force = false): boolean => {
    let changed = false;
    for (const t of tracks) {
      let dirty = force;
      t.items.forEach((it, i) => {
        const under = lastRects.some((r) => it.x > r.x0 - DECOR_MARGIN && it.x < r.x1 + DECOR_MARGIN && it.z > r.z0 - DECOR_MARGIN && it.z < r.z1 + DECOR_MARGIN);
        const hide = under || !decorKept(it.x, it.z, density) ? 1 : 0;
        if (hide === t.hidden[i]) return;
        t.hidden[i] = hide;
        dirty = true;
      });
      if (!dirty) continue;
      let n = 0;
      for (let i = 0; i < t.items.length; i++) {
        if (t.hidden[i]) continue;
        t.mesh.setMatrixAt(n, t.base[i]!);
        if (t.colors) t.mesh.setColorAt(n, t.colors[i]!);
        n++;
      }
      t.mesh.count = n;
      t.mesh.instanceMatrix.needsUpdate = true;
      if (t.mesh.instanceColor) t.mesh.instanceColor.needsUpdate = true;
      // o volume de recorte é recalculado sobre as instâncias visíveis (senão pode ficar menor que
      // o conjunto quando ele volta a crescer e a câmera recortaria árvores visíveis)
      t.mesh.boundingSphere = null;
      t.mesh.boundingBox = null;
      changed = true;
    }
    return changed;
  };
  const clearUnder = (rects: readonly DecorRect[]): boolean => {
    lastRects = rects;
    return refresh();
  };
  const setDecorDensity = (d: number): boolean => {
    const next = Math.max(0, Math.min(1, d));
    if (next === density) return false;
    density = next;
    return refresh();
  };
  const setDecorShadows = (on: boolean): void => {
    decorShadows = on;
    for (const t of tracks) t.mesh.castShadow = on && t.shadow;
  };

  // árvores com folhagem detalhada (procedurais, prontas na hora); rochas e arbustos podem
  // trocar pelos modelos do Nature Kit em seguida
  group.add(detailedTrees(trees, { lite: quality === 'low', tint: FOLIAGE_TINT, hash: hash2, track }, disposables));
  const decor = new THREE.Group();
  decor.add(proceduralRocks(rocks, track));
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

  // jazidas de petróleo: solo encharcado em volta, poça de óleo cru (espessa e espelhada, com o
  // brilho furta-cor do óleo), respingos, bolhas e as estacas de prospecção
  const oil = new PartBuilder();
  const slick = new PartBuilder();
  for (const n of map.resourceNodes) {
    const x = (n.cx + 1) * map.cellSize;
    const z = (n.cy + 1) * map.cellSize;
    const seed = hash2(x, z) * 100;
    // mancha de solo encharcado (mais larga e irregular que a poça)
    oil.add(blobGeometry(1.55, 0.22, seed + 7), '#3a3328', { pos: [x, 0.032, z] });
    oil.add(blobGeometry(1.25, 0.18, seed + 3), '#2a241c', { pos: [x, 0.036, z] });
    // poça principal: contorno orgânico, borda abaulada (o óleo grosso não espalha fino)
    slick.add(blobGeometry(0.95, 0.16, seed, 0.035), '#ffffff', { pos: [x, 0.038, z] });
    // respingos e pocinhas satélites
    for (let k = 0; k < 4; k++) {
      const a = seed * 1.7 + k * 1.9;
      const d = 1.05 + 0.25 * Math.sin(seed + k * 3.1);
      slick.add(blobGeometry(0.12 + 0.07 * Math.abs(Math.sin(a * 2.3)), 0.2, seed + k * 11, 0.022, 20), '#ffffff', { pos: [x + Math.cos(a) * d, 0.038, z + Math.sin(a) * d] });
    }
    // bolhas de gás subindo pelo óleo (calotas brilhantes)
    for (let k = 0; k < 3; k++) {
      const a = seed * 0.9 + k * 2.3;
      const d = 0.15 + 0.35 * Math.abs(Math.sin(seed * 1.3 + k));
      slick.sphere(0.022 + 0.018 * Math.abs(Math.sin(a)), '#ffffff', [x + Math.cos(a) * d, 0.074, z + Math.sin(a) * d], [1, 0.55, 1], 10);
    }
    for (let k = 0; k < 4; k++) {
      const px = x + Math.cos(k * 1.57 + 0.4) * 1.45;
      const pz = z + Math.sin(k * 1.57 + 0.4) * 1.45;
      oil.cyl(0.03, 0.03, 0.5, C.wood, [px, 0.25, pz], undefined, 5);
      oil.box(0.12, 0.06, 0.02, C.yellow, [px, 0.47, pz]);
    }
  }
  if (!oil.isEmpty) {
    const m = new THREE.Mesh(oil.build(), withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
    m.receiveShadow = true;
    group.add(m);
    disposables.push(m.geometry, m.material as THREE.Material);
  }
  if (!slick.isEmpty) {
    // óleo cru: quase preto, liso como espelho (reflete o céu), com verniz e iridescência de
    // película fina — as manchas de arco-íris aparecem com o ângulo da câmera
    const mat = withFog(
      new THREE.MeshPhysicalMaterial({
        color: '#060504',
        roughness: 0.06,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        iridescence: 0.75,
        iridescenceIOR: 1.47,
        iridescenceThicknessRange: [220, 620],
        envMapIntensity: 0.9,
        specularIntensity: 1,
      }),
    );
    const m = new THREE.Mesh(slick.build(), mat);
    m.receiveShadow = true;
    group.add(m);
    disposables.push(m.geometry, mat);
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
    const rockKit = (await Promise.all(ROCK_MODELS.map((n) => load(n, 0.85)))).filter((x) => x !== null);
    const bushKit = (await Promise.all(BUSH_MODELS.map((n) => load(n, 0.4)))).filter((x) => x !== null);
    if (rockKit.length === 0) return; // mantém o procedural
    // as malhas antigas de rochas saem do registro; as novas entram já respeitando as construções
    tracks = tracks.filter((t) => t.mesh.parent?.parent !== decor);
    decor.clear();
    decor.add(instanced(rockKit, rocks, 1.5, -0.1, true, ROCK_TINT, track));
    if (bushKit.length) decor.add(instanced(bushKit, bushes, 0.7, 0, true, FOLIAGE_TINT, track));
    for (const t of tracks) {
      t.hidden.fill(0);
      t.mesh.castShadow = decorShadows && t.shadow;
    }
    refresh(true);
    for (const k of [...rockKit, ...bushKit]) disposables.push(k.geo, k.mat);
  };

  return {
    group,
    upgrade,
    water: water.mesh,
    update: water.update,
    reflection: water.reflection,
    clearUnder,
    setDecorDensity,
    get decorDensity() {
      return density;
    },
    setDecorShadows,
    get decorShadows() {
      return decorShadows;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Pseudoaleatório estável por posição (mesma variação a cada partida no mesmo mapa). */
/** Fator de raio orgânico (ondulações suaves de baixa frequência) no ângulo `a`. */
function blobK(a: number, wobble: number, seed: number): number {
  return 1 + wobble * (0.55 * Math.sin(a * 2 + seed) + 0.3 * Math.sin(a * 3 + seed * 1.7) + 0.15 * Math.sin(a * 5 + seed * 2.3));
}

/**
 * Mancha/poça de contorno orgânico, triangulada em leque a partir do centro (o contorno é
 * estrelado, então o leque nunca falha). Com `h > 0`, a borda sobe num quarto de círculo até o
 * topo plano (menisco do óleo espesso); com `h = 0` é uma mancha plana. Deitada no chão (y para cima).
 */
function blobGeometry(r: number, wobble: number, seed: number, h = 0, segments = 48): THREE.BufferGeometry {
  const rings = h > 0 ? 5 : 1;
  const bevel = Math.min(0.09, r * 0.3);
  const pos: number[] = [0, h, 0];
  const idx: number[] = [];
  for (let j = 0; j < rings; j++) {
    // j = 0: borda no chão; o último anel é a quina do topo
    const t = rings > 1 ? (j / (rings - 1)) * (Math.PI / 2) : 0;
    const inset = h > 0 ? bevel * (1 - Math.cos(t)) : 0;
    const y = h > 0 ? h * Math.sin(t) : 0;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const rr = r * blobK(a, wobble, seed) - inset;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
    }
  }
  const ring = (j: number, i: number) => 1 + j * segments + (i % segments);
  for (let j = 0; j < rings - 1; j++)
    for (let i = 0; i < segments; i++) idx.push(ring(j, i), ring(j + 1, i), ring(j, i + 1), ring(j, i + 1), ring(j + 1, i), ring(j + 1, i + 1));
  for (let i = 0; i < segments; i++) idx.push(0, ring(rings - 1, i + 1), ring(rings - 1, i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

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
  track?: (mesh: THREE.InstancedMesh, items: readonly { x: number; z: number }[]) => void,
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
    track?.(im, mine);
  });
  return g;
}

function proceduralRocks(points: { x: number; z: number; s: number; r: number }[], track?: (mesh: THREE.InstancedMesh, items: readonly { x: number; z: number }[]) => void): THREE.Group {
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
  track?.(rocks, points);
  return g;
}
