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
  varying vec4 vReflUv;
  varying vec3 vWorld;
  varying vec2 vFogXZ;
  #include <fog_pars_vertex>
  void main() {
    vReflUv = textureMatrix * vec4(position, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
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
  varying vec4 vReflUv;
  varying vec3 vWorld;
  varying vec2 vFogXZ;
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
    gl_FragColor = vec4(col, 0.9);
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

export function createWater(W: number, H: number, mode: WaterReflection): WaterHandle {
  const geo = new THREE.PlaneGeometry(W, H);
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
