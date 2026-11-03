import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { FOG_GLSL, GRADE_GLSL, fogUniforms } from './materials.ts';
import { SKY } from './Sky.ts';

/**
 * Superfície da água com reflexo.
 * - `planar` (preset Alto): espelho real da cena (céu, árvores, prédios, unidades) renderizado
 *   de uma câmera refletida, distorcido por ondulações.
 * - `sky`: reflexo analítico do céu (gradiente + brilho do sol), sem passada extra.
 * Nos dois casos a mistura segue Fresnel: olhando de cima vê-se mais a cor da água, rente ao
 * horizonte vê-se mais o reflexo — como na água de verdade.
 */
export type WaterReflection = 'planar' | 'sky';

/** Faixa de altura do solo codificada na textura (o relevo decorativo fica entre -0,7 e 0,9). */
export const GROUND_MIN = -0.9;
export const GROUND_MAX = 1.1;

export interface GroundHeight {
  texture: THREE.DataTexture;
  /** Vértices da malha do chão em x e z. */
  res: THREE.Vector2;
}

/**
 * Alturas da malha do chão numa textura (1 texel por vértice, 8 bits na faixa GROUND_MIN–MAX,
 * ~0,008 de precisão), lida pela água para saber a profundidade real em cada ponto.
 */
export function groundHeightTexture(heights: ArrayLike<number>, nx: number, nz: number): GroundHeight {
  const data = new Uint8Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) data[i] = Math.round(THREE.MathUtils.clamp((heights[i]! - GROUND_MIN) / (GROUND_MAX - GROUND_MIN), 0, 1) * 255);
  const texture = new THREE.DataTexture(data, nx, nz, THREE.RedFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, res: new THREE.Vector2(nx, nz) };
}

/**
 * Distância até a costa (03/11), uma célula por texel: 0 na margem, 1 a `SHORE_CELLS` células ou mais mar adentro. A
 * água estilizada usa para o degradê turquesa → azul-profundo e para as cáusticas mais fortes no raso.
 */
export const SHORE_CELLS = 14;
export function shoreTexture(map: { width: number; height: number; terrain: ArrayLike<number> }, water: number): THREE.DataTexture {
  const { width: w, height: h } = map;
  const dist = new Uint8Array(w * h).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++)
    if (map.terrain[i] !== water) {
      dist[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (dist[n] !== 255) continue;
      dist[n] = Math.min(254, dist[i]! + 1);
      queue.push(n);
    }
  }
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = Math.round(Math.min(1, dist[i]! / SHORE_CELLS) * 255);
  const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const GROUND_GLSL = /* glsl */ `
  float groundHeight(vec2 xz) {
    vec2 uv = (xz / uFogSize * (uGroundRes - 1.0) + 0.5) / uGroundRes;
    return ${GROUND_MIN.toFixed(2)} + texture2D(uGround, uv).r * ${(GROUND_MAX - GROUND_MIN).toFixed(2)};
  }`;

const vertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  uniform float uTime;
  uniform float uWaves;
  uniform sampler2D uGround;
  uniform vec2 uGroundRes;
  uniform vec2 uFogSize;
  varying vec4 vReflUv;
  varying vec3 vWorld;
  varying vec2 vFogXZ;
  varying vec3 vWaveN;
  varying float vCrest;
  #include <fog_pars_vertex>
  ${GROUND_GLSL}
  // Ondas de Gerstner: cada onda tem direção, comprimento L e amplitude A; a frequência sai da
  // relação de dispersão de águas profundas, w = sqrt(g k), com k = 2 pi / L.
  const float G = 3.27; // 9,81 m/s² com ~3 m por unidade do mapa
  void gerstner(vec2 dir, float L, float A, float Q, vec2 p, inout vec3 off, inout vec3 n) {
    float k = 6.2831853 / L;
    float w = sqrt(G * k);
    vec2 d = normalize(dir);
    float f = k * dot(d, p) - w * uTime;
    float c = cos(f);
    float s = sin(f);
    off.xz += Q * A * d * c;
    off.y += A * s;
    n.xz -= d * k * A * c;
    n.y -= Q * k * A * s;
  }
  void main() {
    vReflUv = textureMatrix * vec4(position, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 off = vec3(0.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    if (uWaves > 0.5) {
      gerstner(vec2(1.0, 0.35), 5.5, 0.05, 0.6, wp.xz, off, n);
      gerstner(vec2(-0.4, 1.0), 3.1, 0.03, 0.5, wp.xz, off, n);
      gerstner(vec2(0.8, -0.7), 1.7, 0.016, 0.4, wp.xz, off, n);
      gerstner(vec2(-1.0, -0.2), 0.9, 0.008, 0.3, wp.xz, off, n);
      // ondas morrem no raso: na margem a superfície fica parada e a linha d'água não sobe nem
      // desce pelo barranco (nem anda por cima do solo)
      float calm = smoothstep(0.03, 0.4, wp.y - groundHeight(wp.xz));
      off *= calm;
      n = mix(vec3(0.0, 1.0, 0.0), n, calm);
    }
    wp.xyz += off;
    vWaveN = normalize(n);
    vCrest = off.y;
    vWorld = wp.xyz;
    vFogXZ = wp.xz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uPlanar;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform sampler2D uFogMap;
  uniform vec2 uFogSize;
  uniform float uWaves;
  uniform sampler2D uGround;
  uniform vec2 uGroundRes;
  uniform sampler2D uShore;
  uniform float uHasShore;
  uniform vec3 uMid;
  varying vec4 vReflUv;
  varying vec3 vWorld;
  varying vec2 vFogXZ;
  varying vec3 vWaveN;
  varying float vCrest;
  #include <common>
  #include <fog_pars_fragment>
  ${GROUND_GLSL}
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
  }
  // normal da superfície por diferença finita de duas camadas de ondulação em direções diferentes
  vec3 ripples(vec2 p) {
    float t = uTime;
    vec2 a = p * 0.9 + vec2(t * 0.35, t * 0.22);
    vec2 b = p * 2.3 - vec2(t * 0.28, -t * 0.4);
    float e = 0.15;
    float h0 = wNoise(a) + 0.5 * wNoise(b);
    float hx = wNoise(a + vec2(e, 0.0)) + 0.5 * wNoise(b + vec2(e, 0.0));
    float hz = wNoise(a + vec2(0.0, e)) + 0.5 * wNoise(b + vec2(0.0, e));
    return normalize(vec3((h0 - hx) * 2.6, 1.0, (h0 - hz) * 2.6));
  }
  vec2 wHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  // cáusticas estilizadas: distância até a borda das células de Voronoi, que se mexem devagar
  float cells(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = wHash2(i + g);
        o = 0.5 + 0.38 * sin(uTime * 0.5 + 6.2831 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    return sqrt(d2) - sqrt(d1);
  }
  // facetas low poly: grade triangular em coordenadas inclinadas; cada triângulo tem a sua inclinação, que muda
  // devagar (xz = inclinação da normal, w = brilho 0..1)
  vec3 facet(vec2 p) {
    vec2 q = vec2(p.x + p.y * 0.57735, p.y * 1.1547);
    vec2 c = floor(q);
    vec2 fr = fract(q);
    float tri = step(fr.y, fr.x);
    float h = wHash(c + tri * vec2(17.31, 5.71));
    float a = h * 6.2831 + uTime * (0.25 + 0.2 * h);
    return vec3(cos(a), sin(a), 0.5 + 0.5 * sin(uTime * 0.6 + h * 6.2831));
  }
  void main() {
    // superfície facetada (low poly): a normal vem do triângulo, com só um pouco da ondulação fina por cima
    vec3 fa1 = facet(vWorld.xz * 0.42);
    vec3 fa2 = facet(vWorld.xz * 0.95 + 3.7);
    vec3 rip = ripples(vWorld.xz);
    vec3 n = normalize(vec3(fa1.x * 0.085 + fa2.x * 0.035 + rip.x * 0.2 + vWaveN.x, 1.0, fa1.y * 0.085 + fa2.y * 0.035 + rip.z * 0.2 + vWaveN.z));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 r = reflect(-v, n);
    vec3 refl;
    if (uPlanar > 0.5) {
      vec4 uv = vReflUv;
      // a imagem refletida treme com as ondulações (mais longe, mais esticada) e é amostrada
      // em cruz para suavizar o serrilhado, como a água de verdade borra o reflexo
      uv.xy += n.xz * uv.w * (0.05 + 0.04 * uWaves);
      vec2 px = vec2(0.0018, 0.0026) * uv.w;
      refl = texture2DProj(tDiffuse, uv).rgb * 0.4
        + texture2DProj(tDiffuse, uv + vec4(px.x, 0.0, 0.0, 0.0)).rgb * 0.15
        + texture2DProj(tDiffuse, uv - vec4(px.x, 0.0, 0.0, 0.0)).rgb * 0.15
        + texture2DProj(tDiffuse, uv + vec4(0.0, px.y, 0.0, 0.0)).rgb * 0.15
        + texture2DProj(tDiffuse, uv - vec4(0.0, px.y, 0.0, 0.0)).rgb * 0.15;
      // a água absorve um pouco: o reflexo fica levemente mais escuro e esverdeado
      refl *= vec3(0.86, 0.93, 0.95);
    } else {
      refl = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.55));
    }
    // degradê pela distância até a costa: turquesa na beira, azul-médio, azul-profundo em mar aberto
    float off = uHasShore > 0.5 ? texture2D(uShore, vWorld.xz / uFogSize).r : 0.6;
    vec3 base = mix(uShallow, uMid, smoothstep(0.0, 0.32, off));
    base = mix(base, uDeep, smoothstep(0.3, 1.0, off));
    // facetas triangulares (low poly) em duas escalas, com brilho que muda devagar
    float fa = fa1.z * 0.65 + fa2.z * 0.35;
    base *= 0.86 + 0.28 * fa;
    // reflexo visível mesmo na câmera alta do RTS (fator mínimo), mais forte rente ao horizonte
    // reflexo bem presente mesmo na câmera alta do RTS (planar mais forte), e quase espelho
    // rente ao horizonte (Fresnel)
    vec3 col = mix(base, refl, clamp((uPlanar > 0.5 ? 0.3 : 0.16) + fres * 0.85, 0.0, 0.9));
    // linhas de luz das cáusticas, mais fortes no raso e fracas em mar aberto
    float edgeC = cells(vWorld.xz * 0.5);
    float caust = 1.0 - smoothstep(0.0, 0.05, edgeC);
    col += vec3(0.55, 0.85, 0.9) * caust * mix(0.3, 0.04, smoothstep(0.0, 0.5, off));
    // brilho especular do sol nas ondulações
    float sd = max(dot(r, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 120.0) * 0.6 + pow(sd, 20.0) * 0.06);
    // cristas das ondulações um pouco mais claras: a superfície "mexe" mesmo vista de cima
    col += vec3(0.05, 0.06, 0.06) * smoothstep(0.2, 0.6, n.x + n.z);
    float alpha = 0.9;
    // profundidade real até o solo neste ponto (a margem é onde ela chega a zero)
    float depth = vWorld.y - groundHeight(vWorld.xz);
    float shallow = 1.0 - smoothstep(0.0, 0.3, depth);
    col = mix(col, col * vec3(1.02, 1.08, 1.05) + vec3(0.01, 0.025, 0.02), shallow * 0.5);
    if (uWaves > 0.5) {
      alpha = mix(0.92, 0.72, shallow);
      // espuma: faixa fina sobre a água logo antes da margem, que avança e recua um pouco (sem
      // passar para o solo), e cristas das ondas maiores
      float flow = wNoise(vWorld.xz * 2.2 + vec2(uTime * 0.6, -uTime * 0.4)) * wNoise(vWorld.xz * 4.7 - uTime * 0.3);
      float reach = 0.07 + 0.03 * sin(uTime * 1.3 + vWorld.x * 0.7 + vWorld.z * 0.4);
      float edge = smoothstep(0.0, 0.025, depth) * (1.0 - smoothstep(reach * 0.5, reach, depth));
      float crest = smoothstep(0.075, 0.1, vCrest) * smoothstep(0.35, 0.6, flow);
      float foam = clamp(edge * smoothstep(0.12, 0.38, flow) + crest * 0.35, 0.0, 1.0);
      col = mix(col, vec3(0.86, 0.9, 0.9), foam * 0.75);
      alpha = max(alpha, foam);
    }
    // borda suave exatamente onde a água encontra o solo (sem serrilhado nem corte seco)
    alpha *= smoothstep(0.0, 0.035, depth);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    ${GRADE_GLSL}
    ${FOG_GLSL}
  }`;

function uniforms(): Record<string, THREE.IUniform> {
  return {
    tDiffuse: { value: null },
    color: { value: new THREE.Color(1, 1, 1) },
    textureMatrix: { value: new THREE.Matrix4() },
    uPlanar: { value: 0 },
    uWaves: { value: 0 },
    uGround: { value: null },
    uGroundRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    // água estilizada (03/11): turquesa na costa, azul-médio e azul-profundo em mar aberto
    uDeep: { value: new THREE.Color('#123f6a') },
    uMid: { value: new THREE.Color('#1f73a0') },
    uShallow: { value: new THREE.Color('#2fa6b0') },
    uShore: { value: null },
    uHasShore: { value: 0 },
    uZenith: { value: SKY.zenith },
    uHorizon: { value: SKY.horizon },
    uSunDir: { value: SKY.sunDir },
    uSunColor: { value: SKY.sunColor },
    ...THREE.UniformsLib.fog,
  };
}

export interface WaterHandle {
  mesh: THREE.Mesh;
  update(time: number): void;
  dispose(): void;
  /**
   * Reflexo planar (preset Alto+): o espelho redesenha a cena inteira; com intervalo N ele é
   * atualizado só a cada N quadros (o KGPS usa isso quando o quadro está pesado).
   */
  reflection: {
    readonly interval: number;
    setInterval(n: number): void;
    /** Só céu: sem a passada do espelho (o reflexo analítico do céu assume, sem recompilar). */
    readonly sky: boolean;
    setSky(on: boolean): void;
  } | null;
  /**
   * Ondas (Ultra): malha fina deslocada pelas ondas ↔ plano simples, sem recompilar (o shader lê
   * `uWaves`). Null fora do Ultra. KAICS Adaptables+ · K-09.
   */
  waves: { readonly on: boolean; set(on: boolean): void } | null;
}

export interface WaterOptions {
  /** Ultra: ondas de Gerstner na malha, espuma e transparência rasa perto da margem. */
  waves?: boolean;
  /** Altura do solo (ver `groundHeightTexture`): calma das ondas no raso, espuma e borda na margem. */
  ground?: GroundHeight | null;
  /** Resolução da textura do reflexo planar (px). */
  reflectionSize?: number;
  /** Distância até a costa (ver `shoreTexture`): degradê de cor e cáusticas. */
  shore?: THREE.DataTexture | null;
}

export function createWater(W: number, H: number, mode: WaterReflection, opts: WaterOptions = {}): WaterHandle {
  const seg = opts.waves ? Math.round(Math.max(W, H) * 2) : 1;
  const geo = new THREE.PlaneGeometry(W, H, seg, seg);
  // com ondas, um plano simples fica pronto para o KGPS trocar quando o quadro pesa
  const flat = opts.waves ? new THREE.PlaneGeometry(W, H, 1, 1) : null;
  let mesh: THREE.Mesh;
  let material: THREE.ShaderMaterial;
  let reflection: WaterHandle['reflection'] = null;
  if (mode === 'planar') {
    const reflector = new Reflector(geo, {
      textureWidth: opts.reflectionSize ?? 512,
      textureHeight: opts.reflectionSize ?? 512,
      clipBias: 0.02,
      multisample: 0,
      shader: { name: 'NcWater', uniforms: uniforms(), vertexShader, fragmentShader },
    });
    material = reflector.material as THREE.ShaderMaterial;
    material.uniforms.uPlanar!.value = 1;
    mesh = reflector;
    // pular a atualização mantém textura e matriz do quadro anterior juntas: o reflexo só atrasa
    const draw = reflector.onBeforeRender.bind(reflector);
    let interval = 1;
    let frame = 0;
    let sky = false;
    reflector.onBeforeRender = (renderer, scene, camera, geometry, mat, group) => {
      if (!sky && frame++ % interval === 0) draw(renderer, scene, camera, geometry, mat, group);
    };
    reflection = {
      get interval() {
        return interval;
      },
      setInterval: (n) => {
        interval = Math.max(1, Math.round(n));
        frame = 0;
      },
      get sky() {
        return sky;
      },
      setSky: (on) => {
        sky = on;
        // uniforme, não define: o mesmo programa de shader serve aos dois modos
        material.uniforms.uPlanar!.value = on ? 0 : 1;
        frame = 0;
      },
    };
  } else {
    material = new THREE.ShaderMaterial({ uniforms: uniforms(), vertexShader, fragmentShader });
    mesh = new THREE.Mesh(geo, material);
  }
  // as cópias feitas pelo Reflector quebrariam o vínculo com a névoa de guerra: religa por referência
  material.uniforms.uFogMap = fogUniforms.uFogMap;
  material.uniforms.uFogSize = fogUniforms.uFogSize;
  if (opts.waves) material.uniforms.uWaves!.value = 1;
  if (opts.ground) {
    material.uniforms.uGround!.value = opts.ground.texture;
    material.uniforms.uGroundRes!.value = opts.ground.res;
  }
  if (opts.shore) {
    material.uniforms.uShore!.value = opts.shore;
    material.uniforms.uHasShore!.value = 1;
  }
  material.transparent = true;
  material.fog = true;
  material.depthWrite = false;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(W / 2, -0.25, H / 2);
  mesh.renderOrder = 0;
  const waves: WaterHandle['waves'] = flat
    ? {
        get on() {
          return material.uniforms.uWaves!.value > 0.5 && mesh.geometry === geo;
        },
        set: (on) => {
          mesh.geometry = on ? geo : flat;
          material.uniforms.uWaves!.value = on ? 1 : 0;
        },
      }
    : null;
  return {
    mesh,
    reflection,
    waves,
    update: (time) => (material.uniforms.uTime!.value = time),
    dispose: () => {
      geo.dispose();
      flat?.dispose();
      material.dispose();
      if (mesh instanceof Reflector) mesh.dispose();
    },
  };
}
