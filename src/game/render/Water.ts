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

const vertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  uniform float uTime;
  uniform float uWaves;
  varying vec4 vReflUv;
  varying vec3 vWorld;
  varying vec2 vFogXZ;
  varying vec3 vWaveN;
  varying float vCrest;
  #include <fog_pars_vertex>
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
  uniform sampler2D uShore;
  varying vec4 vReflUv;
  varying vec3 vWorld;
  varying vec2 vFogXZ;
  varying vec3 vWaveN;
  varying float vCrest;
  #include <common>
  #include <fog_pars_fragment>
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
  void main() {
    vec3 n = ripples(vWorld.xz);
    // ondas grandes (vértices) + ondulação fina (pixels)
    n = normalize(vec3(n.x + vWaveN.x, 1.0, n.z + vWaveN.z));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 r = reflect(-v, n);
    vec3 refl;
    if (uPlanar > 0.5) {
      vec4 uv = vReflUv;
      uv.xy += n.xz * 0.35 * uv.w * 0.08;
      refl = texture2DProj(tDiffuse, uv).rgb;
    } else {
      refl = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.55));
    }
    vec3 base = mix(uShallow, uDeep, 0.6 + 0.4 * n.x);
    // reflexo visível mesmo na câmera alta do RTS (fator mínimo), mais forte rente ao horizonte
    vec3 col = mix(base, refl, clamp(0.28 + fres * 0.9, 0.0, 0.92));
    // brilho especular do sol nas ondulações
    float sd = max(dot(r, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 260.0) * 2.2 + pow(sd, 24.0) * 0.18);
    // cristas das ondulações um pouco mais claras: a superfície "mexe" mesmo vista de cima
    col += vec3(0.05, 0.06, 0.06) * smoothstep(0.2, 0.6, n.x + n.z);
    float alpha = 0.9;
    if (uWaves > 0.5) {
      // distância até a margem (0 na borda, 1 a 3+ células para dentro)
      float shore = texture2D(uShore, vFogXZ / uFogSize).r;
      float shallow = 1.0 - smoothstep(0.0, 0.5, shore);
      col = mix(col, col * vec3(1.02, 1.08, 1.05) + vec3(0.01, 0.025, 0.02), shallow * 0.5);
      alpha = mix(0.92, 0.72, shallow);
      // espuma: linha fina de arrebentação na margem (animada pelo fluxo) e cristas das ondas maiores
      float flow = wNoise(vWorld.xz * 2.2 + vec2(uTime * 0.6, -uTime * 0.4)) * wNoise(vWorld.xz * 4.7 - uTime * 0.3);
      float edge = 1.0 - smoothstep(0.0, 0.07 + 0.025 * sin(uTime * 1.3 + vWorld.x * 0.7), shore);
      float crest = smoothstep(0.075, 0.1, vCrest) * smoothstep(0.35, 0.6, flow);
      float foam = clamp(edge * smoothstep(0.15, 0.4, flow) + crest * 0.35, 0.0, 1.0);
      col = mix(col, vec3(0.86, 0.9, 0.9), foam * 0.75);
      alpha = max(alpha, foam);
    }
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
    uShore: { value: null },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color('#1d3d4a') },
    uShallow: { value: new THREE.Color('#3b6a70') },
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
}

export interface WaterOptions {
  /** Ultra: ondas de Gerstner na malha, espuma e transparência rasa perto da margem. */
  waves?: boolean;
  /** Distância (0–1) de cada célula de água até a margem; obrigatório com `waves`. */
  shore?: THREE.Texture | null;
}

/**
 * Distância de cada célula de água até a terra mais próxima, em células (0 = terra), limitada a 3
 * e normalizada para 0–1. Calculada uma vez por mapa (busca em largura).
 */
export function shoreDistance(width: number, height: number, isWater: (i: number) => boolean): Uint8Array {
  const n = width * height;
  const dist = new Float32Array(n).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < n; i++)
    if (!isWater(i)) {
      dist[i] = 0;
      queue.push(i);
    }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h]!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (dist[j]! > dist[i]! + 1) {
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round((Math.min(3, dist[i]!) / 3) * 255);
  return out;
}

export function createWater(W: number, H: number, mode: WaterReflection, opts: WaterOptions = {}): WaterHandle {
  const seg = opts.waves ? Math.round(Math.max(W, H) * 2) : 1;
  const geo = new THREE.PlaneGeometry(W, H, seg, seg);
  let mesh: THREE.Mesh;
  let material: THREE.ShaderMaterial;
  if (mode === 'planar') {
    const reflector = new Reflector(geo, {
      textureWidth: 512,
      textureHeight: 512,
      clipBias: 0.02,
      multisample: 0,
      shader: { name: 'NcWater', uniforms: uniforms(), vertexShader, fragmentShader },
    });
    material = reflector.material as THREE.ShaderMaterial;
    material.uniforms.uPlanar!.value = 1;
    mesh = reflector;
  } else {
    material = new THREE.ShaderMaterial({ uniforms: uniforms(), vertexShader, fragmentShader });
    mesh = new THREE.Mesh(geo, material);
  }
  // as cópias feitas pelo Reflector quebrariam o vínculo com a névoa de guerra: religa por referência
  material.uniforms.uFogMap = fogUniforms.uFogMap;
  material.uniforms.uFogSize = fogUniforms.uFogSize;
  if (opts.waves) {
    material.uniforms.uWaves!.value = 1;
    material.uniforms.uShore!.value = opts.shore ?? null;
  }
  material.transparent = true;
  material.fog = true;
  material.depthWrite = false;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(W / 2, -0.25, H / 2);
  mesh.renderOrder = 0;
  return {
    mesh,
    update: (time) => (material.uniforms.uTime!.value = time),
    dispose: () => {
      geo.dispose();
      material.dispose();
      if (mesh instanceof Reflector) mesh.dispose();
    },
  };
}
