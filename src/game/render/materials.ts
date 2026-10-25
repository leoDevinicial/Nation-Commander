import * as THREE from 'three';
import { factionColor } from '../factions.ts';

/**
 * Névoa de guerra: textura (1 texel por célula) amostrada pela posição de mundo de cada
 * fragmento. 0 = inexplorado, ~0.45 = explorado fora de visão, 1 = visível.
 */
export const fogUniforms = {
  uFogMap: { value: null as THREE.Texture | null },
  uFogSize: { value: new THREE.Vector2(1, 1) },
};

const FOG_KEY = 'nc-fog-v1';

/** Injeta a névoa de guerra no shader de um material padrão do three.js. */
export function withFog<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogMap = fogUniforms.uFogMap;
    shader.uniforms.uFogSize = fogUniforms.uFogSize;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fogWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogWp = instanceMatrix * fogWp;
        #endif
        fogWp = modelMatrix * fogWp;
        vFogXZ = fogWp.xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uFogMap;\nuniform vec2 uFogSize;\nvarying vec2 vFogXZ;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float fogV = texture2D(uFogMap, vFogXZ / uFogSize).r;
        vec3 fogFull = gl_FragColor.rgb;
        vec3 fogGray = vec3(dot(fogFull, vec3(0.299, 0.587, 0.114)));
        vec3 fogSeen = mix(fogGray, fogFull, 0.45) * 0.5;
        vec3 fogHidden = fogGray * 0.12;
        gl_FragColor.rgb = fogV < 0.45
          ? mix(fogHidden, fogSeen, smoothstep(0.0, 0.45, fogV))
          : mix(fogSeen, fogFull, smoothstep(0.45, 1.0, fogV));`,
      );
  };
  material.customProgramCacheKey = () => FOG_KEY;
  return material;
}

const cache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = withFog(make());
    cache.set(key, m);
  }
  return m;
}

/** Corpo dos modelos: cores de vértice, sombreamento facetado (estilo low-poly). */
export const bodyMaterial = () =>
  cached('body', () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.12 }));

export const glassMaterial = () =>
  cached('glass', () => new THREE.MeshStandardMaterial({ color: '#7fb1cf', emissive: '#1f4a63', emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.35, flatShading: true }));

/** Detalhes na cor da facção (faixas, bandeiras, insígnias). */
export const accentMaterial = (slot: number) =>
  cached(`accent-${slot}`, () => new THREE.MeshStandardMaterial({ color: factionColor(slot), roughness: 0.55, metalness: 0.1, flatShading: true }));

export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
