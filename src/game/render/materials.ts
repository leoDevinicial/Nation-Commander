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

/**
 * Sombras de nuvens (Ultra+): textura de manchas macias deslocada pelo vento sobre o mapa. Só a
 * luz direta (sol e clarões) é atenuada — a luz do céu continua, como numa tarde parcialmente
 * nublada. `uCloudStrength` 0 desliga sem recompilar.
 */
/** Vento da vegetação: tempo (s) atualizado a cada quadro pela cena ativa. */
export const windUniforms = {
  uWindTime: { value: 0 },
};

export const cloudUniforms = {
  uCloudMap: { value: null as THREE.Texture | null },
  uCloudOffset: { value: new THREE.Vector2() },
  uCloudStrength: { value: 0 },
};

let cloudShadows = false;
/** Liga as sombras de nuvens nos materiais criados a partir de agora (definido no início da partida). */
export function setCloudShadows(on: boolean): void {
  cloudShadows = on;
}

/** Escala da textura de nuvens no mundo (uma repetição a cada ~220 unidades). */
const CLOUD_SCALE = 0.0045;

/**
 * Correção de cor única (aplicada em céu, terreno, vegetação e modelos, depois do tone mapping):
 * saturação levemente contida, sombras um pouco frias e luzes um pouco quentes. É o que faz
 * peças de origens diferentes parecerem pertencer à mesma foto. Custo: poucas instruções por pixel.
 */
export const GRADE_GLSL = /* glsl */ `
  {
    vec3 gc = gl_FragColor.rgb;
    float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
    gc = mix(vec3(gl), gc, 0.93);
    gc += vec3(-0.006, 0.0, 0.01) * (1.0 - gl) + vec3(0.02, 0.01, -0.012) * gl;
    gl_FragColor.rgb = gc;
  }`;

/**
 * Névoa de guerra aplicada à cor final (requer uFogMap, uFogSize e vFogXZ): inexplorado quase
 * preto, explorado fora de visão dessaturado e escuro, visível com cor plena.
 */
export const FOG_GLSL = /* glsl */ `
  {
    float fogV = texture2D(uFogMap, vFogXZ / uFogSize).r;
    vec3 fogFull = gl_FragColor.rgb;
    vec3 fogGray = vec3(dot(fogFull, vec3(0.299, 0.587, 0.114)));
    vec3 fogSeen = mix(fogGray, fogFull, 0.45) * 0.5;
    vec3 fogHidden = fogGray * 0.12;
    gl_FragColor.rgb = fogV < 0.45
      ? mix(fogHidden, fogSeen, smoothstep(0.0, 0.45, fogV))
      : mix(fogSeen, fogFull, smoothstep(0.45, 1.0, fogV));
  }`;

/** Luz de contorno: o céu "abraça" as bordas dos modelos e separa a silhueta do chão. */
const RIM = new THREE.Color('#9fb6cc');

interface EnhanceOpts {
  /** Intensidade do desgaste (0 = desligado). */
  weather?: number;
  /** Juntas de painéis no desgaste (paredes e chapas; não em vegetação/rochas). */
  seams?: boolean;
  /** Vidros com caixilhos (grade de janelas em vez de desgaste). */
  panes?: boolean;
  /**
   * Balanço ao vento (folhas e arbustos): deslocamento por unidade de altura do modelo. Cada
   * instância tem sua fase (pela posição), e a base fica parada. 0 = sem vento.
   */
  sway?: number;
}

/**
 * Injeta no shader padrão do three.js a névoa de guerra (sempre) e, opcionalmente, o desgaste
 * triplanar em espaço do objeto: concreto manchado, metal com escorridos e sujeira acumulada.
 */
export function withFog<T extends THREE.Material>(material: T, opts: EnhanceOpts = {}): T {
  const weather = opts.weather ?? 0;
  const panes = opts.panes ?? false;
  const ch = opts.seams ? 'g' : 'r';
  const sway = opts.sway ?? 0;
  const clouds = cloudShadows;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogMap = fogUniforms.uFogMap;
    if (sway) shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uFogSize = fogUniforms.uFogSize;
    if (clouds) {
      shader.uniforms.uCloudMap = cloudUniforms.uCloudMap;
      shader.uniforms.uCloudOffset = cloudUniforms.uCloudOffset;
      shader.uniforms.uCloudStrength = cloudUniforms.uCloudStrength;
    }
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
    if (sway)
      vs = vs.replace('#include <common>', '#include <common>\nuniform float uWindTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // vento: rajadas lentas + tremor fino; mais forte no alto, nada na base
          vec3 wBase = vec3(0.0);
          #ifdef USE_INSTANCING
            wBase = instanceMatrix[3].xyz;
          #endif
          float wH = max(position.y, 0.0) * ${sway.toFixed(4)};
          float wPh = dot(wBase.xz, vec2(0.37, 0.53));
          float wT = uWindTime;
          float gust = 0.65 + 0.35 * sin(wT * 0.45 + wPh * 0.2);
          transformed.x += (sin(wT * 1.6 + wPh) * 0.7 + sin(wT * 3.3 + wPh * 1.7 + position.z * 2.0) * 0.3) * wH * gust;
          transformed.z += (sin(wT * 1.2 + wPh * 1.3 + 1.7) * 0.5 + sin(wT * 2.9 + position.x * 2.0) * 0.25) * wH * gust;
        }`,
      );
    shader.vertexShader = vs;
    let fs = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform sampler2D uFogMap;\nuniform vec2 uFogSize;\nvarying vec2 vFogXZ;' +
        (weather ? '\nuniform sampler2D uGrime;\nuniform float uGrimeScale;\nuniform vec3 uRimColor;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;\nfloat vGrimeV = 1.0;' : '') +
        (panes ? '\nuniform sampler2D uPanes;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;' : '') +
        (clouds ? '\nuniform sampler2D uCloudMap;\nuniform vec2 uCloudOffset;\nuniform float uCloudStrength;' : ''),
    );
    if (clouds)
      fs = fs.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // força 0 (KGPS: nuvens desligadas) pula a leitura da textura: ramo uniforme, sem custo
        if (uCloudStrength > 0.0) {
          float cloudS = texture2D(uCloudMap, vFogXZ * ${CLOUD_SCALE} + uCloudOffset).r;
          float cloudLit = 1.0 - uCloudStrength * cloudS;
          reflectedLight.directDiffuse *= cloudLit;
          reflectedLight.directSpecular *= cloudLit;
        }`,
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
      shader.uniforms.uRimColor = { value: RIM };
      fs = fs
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 tw = pow(abs(normalize(vObjNormal)), vec3(4.0));
          tw /= (tw.x + tw.y + tw.z + 1e-5);
          vec3 gp = vObjPos * uGrimeScale;
          float grime = texture2D(uGrime, gp.zy).${ch} * tw.x + texture2D(uGrime, gp.xz).${ch} * tw.y + texture2D(uGrime, gp.xy).${ch} * tw.z;
          grime = smoothstep(0.15, 1.0, grime);
          vGrimeV = grime;
          // poeira e lama acumuladas na parte de baixo (rodas, esteiras, base das paredes)
          float nearGround = 1.0 - smoothstep(0.0, 0.6, vObjPos.y);
          diffuseColor.rgb *= mix(1.0, grime, ${weather.toFixed(2)});
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.3, 0.22), nearGround * 0.38);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uRimColor * rimF * 0.16 * (0.35 + 0.65 * diffuseColor.rgb);`,
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
        ${GRADE_GLSL}
        ${FOG_GLSL}`,
    );
  };
  material.customProgramCacheKey = () => `nc-fog-v6-w${weather}-p${panes ? 1 : 0}-${ch}-c${clouds ? 1 : 0}-s${sway}`;
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
  cached('body', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.12, envMapIntensity: 0.7 }), { weather: 0.9, seams: true });

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
