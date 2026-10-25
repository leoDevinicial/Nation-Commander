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

/** Desgaste triplanar (sujeira, escorridos) aplicado aos modelos, sem precisar de UV. */
export const weatherUniforms = {
  uGrime: { value: null as THREE.Texture | null },
  uGrimeScale: { value: 0.32 },
  uPanes: { value: null as THREE.Texture | null },
};

interface EnhanceOpts {
  /** Intensidade do desgaste (0 = desligado). */
  weather?: number;
  /** Vidros com caixilhos (grade de janelas em vez de desgaste). */
  panes?: boolean;
}

/**
 * Injeta no shader padrão do three.js a névoa de guerra (sempre) e, opcionalmente, o desgaste
 * triplanar em espaço do objeto: concreto manchado, metal com escorridos e sujeira acumulada.
 */
export function withFog<T extends THREE.Material>(material: T, opts: EnhanceOpts = {}): T {
  const weather = opts.weather ?? 0;
  const panes = opts.panes ?? false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogMap = fogUniforms.uFogMap;
    shader.uniforms.uFogSize = fogUniforms.uFogSize;
    let vs = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;' + (weather || panes ? '\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;' : ''))
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
    if (weather || panes) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform sampler2D uFogMap;\nuniform vec2 uFogSize;\nvarying vec2 vFogXZ;' +
        (weather ? '\nuniform sampler2D uGrime;\nuniform float uGrimeScale;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;\nfloat vGrimeV = 1.0;' : '') +
        (panes ? '\nuniform sampler2D uPanes;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;' : ''),
    );
    if (panes) {
      shader.uniforms.uPanes = weatherUniforms.uPanes;
      fs = fs.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 pw = pow(abs(normalize(vObjNormal)), vec3(4.0));
        pw /= (pw.x + pw.y + pw.z + 1e-5);
        vec3 pp = vObjPos * 1.6;
        vec3 pane = texture2D(uPanes, pp.zy).rgb * pw.x + texture2D(uPanes, pp.xz).rgb * pw.y + texture2D(uPanes, pp.xy).rgb * pw.z;
        diffuseColor.rgb *= pane * 1.4;`,
      );
    }
    if (weather) {
      shader.uniforms.uGrime = weatherUniforms.uGrime;
      shader.uniforms.uGrimeScale = weatherUniforms.uGrimeScale;
      fs = fs
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 tw = pow(abs(normalize(vObjNormal)), vec3(4.0));
          tw /= (tw.x + tw.y + tw.z + 1e-5);
          vec3 gp = vObjPos * uGrimeScale;
          float grime = texture2D(uGrime, gp.zy).r * tw.x + texture2D(uGrime, gp.xz).r * tw.y + texture2D(uGrime, gp.xy).r * tw.z;
          grime = smoothstep(0.15, 1.0, grime);
          vGrimeV = grime;
          // sujeira mais forte junto ao chão (respingos de lama)
          float nearGround = 1.0 - smoothstep(0.0, 0.9, vObjPos.y);
          diffuseColor.rgb *= mix(1.0, grime, ${weather.toFixed(2)}) * (1.0 - nearGround * 0.32);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (1.0 - vGrimeV) * 0.45, 0.05, 1.0);`,
        );
    }
    shader.fragmentShader = fs.replace(
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
  material.customProgramCacheKey = () => `nc-fog-v3-w${weather}-p${panes ? 1 : 0}`;
  return material;
}

const cache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, make: () => T, opts: EnhanceOpts = {}): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = withFog(make(), opts);
    cache.set(key, m);
  }
  return m;
}

/** Corpo dos modelos: cores de vértice com desgaste (concreto manchado, metal sujo). */
export const bodyMaterial = () =>
  cached('body', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.12, envMapIntensity: 0.7 }), { weather: 0.9 });

/** Vidros escuros e reflexivos (refletem o céu pelo mapa de ambiente). */
export const glassMaterial = () =>
  cached('glass', () => new THREE.MeshStandardMaterial({ color: '#56656e', emissive: '#0b141a', emissiveIntensity: 0.35, roughness: 0.14, metalness: 0.65, envMapIntensity: 1.3 }), { panes: true });

/** Detalhes na cor da facção (faixas, bandeiras, insígnias), com pintura gasta. */
export const accentMaterial = (slot: number) =>
  cached(`accent-${slot}`, () => new THREE.MeshStandardMaterial({ color: factionColor(slot), roughness: 0.6, metalness: 0.1, envMapIntensity: 0.6 }), { weather: 0.5 });

export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
