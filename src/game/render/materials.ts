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

/**
 * Clima e hora do dia (`WeatherSystem`), em todos os materiais do mapa:
 * - `uSnow`: neve acumulada nas faces voltadas para cima (0 = nada, 1 = tudo branco);
 * - `uWet`: chão e telhados molhados na chuva (mais escuros e mais brilhantes);
 * - `uNight`: janelas acesas à noite (só nos vidros com caixilhos).
 * Com os três em 0 o custo é um ramo uniforme.
 */
export const climateUniforms = {
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uNight: { value: 0 },
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
    shader.uniforms.uSnow = climateUniforms.uSnow;
    shader.uniforms.uWet = climateUniforms.uWet;
    shader.uniforms.uNight = climateUniforms.uNight;
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
      '#include <common>\nuniform sampler2D uFogMap;\nuniform vec2 uFogSize;\nvarying vec2 vFogXZ;\nuniform float uSnow;\nuniform float uWet;\nuniform float uNight;' +
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
      ).replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uNight > 0.0) {
          // à noite, parte das janelas acende (luz quente), escolhidas por vidraça
          vec3 cellP = floor(vObjPos * 1.6 * 4.0);
          float lit = step(0.45, fract(sin(dot(cellP, vec3(12.99, 78.23, 37.71))) * 43758.55));
          float paneL = dot(pane, vec3(0.333));
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * uNight * lit * smoothstep(0.45, 0.8, paneL) * 1.6;
        }`,
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
    // chuva: tudo um pouco mais escuro e liso (brilho de molhado); neve: faces para cima ficam brancas, com falhas
    fs = fs
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uWet > 0.0) diffuseColor.rgb *= 1.0 - 0.22 * uWet;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor *= 1.0 - 0.45 * uWet;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uSnow > 0.0) {
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          // manchas suaves (a neve falha em placas, não em pontos)
          vec2 sxz = vFogXZ;
          float snowN = 0.5 + 0.2 * sin(sxz.x * 0.37 + sin(sxz.y * 0.23) * 2.3) + 0.17 * sin(sxz.y * 0.53 + sin(sxz.x * 0.31) * 1.9) + 0.13 * sin((sxz.x + sxz.y) * 1.7 + sin(sxz.x * 0.9));
          float snowK = smoothstep(0.45, 0.8, dot(normal, upV)) * smoothstep(snowN * 0.55, snowN * 0.55 + 0.3, uSnow);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), snowK * 0.92);
        }`,
      );
    shader.fragmentShader = fs.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
        ${GRADE_GLSL}
        ${FOG_GLSL}`,
    );
  };
  material.customProgramCacheKey = () => `nc-fog-v7-w${weather}-p${panes ? 1 : 0}-${ch}-c${clouds ? 1 : 0}-s${sway}`;
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

/**
 * Aparência por era (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 1, §3.1). O corpo dos modelos usa
 * cores de vértice; a era muda o tom (multiplicado nelas), o brilho e o metal:
 * 1 Guerra Fria — concreto e pintura gastos (material base);
 * 2 Pós-Guerra Fria — galpões metálicos pré-fabricados, cinza-azulado;
 * 3 Era Digital — vidro e aço claros e lisos;
 * 4 Futuro Próximo — compósito escuro, vidros como telas e faixas de LED na cor da facção.
 */
const ERA_BODY: Record<number, { color: string; roughness: number; metalness: number; env: number }> = {
  2: { color: '#d3dbe2', roughness: 0.66, metalness: 0.3, env: 0.9 },
  3: { color: '#f1f5f8', roughness: 0.48, metalness: 0.4, env: 1.15 },
  4: { color: '#a5aebb', roughness: 0.38, metalness: 0.52, env: 1.25 },
};

export const eraBodyMaterial = (era: number) => {
  const d = ERA_BODY[era];
  if (!d) return bodyMaterial();
  return cached(`body-e${era}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, color: d.color, roughness: d.roughness, metalness: d.metalness, envMapIntensity: d.env }), { weather: era >= 3 ? 0.45 : 0.75, seams: true });
};

export const eraGlassMaterial = (era: number) => {
  if (era <= 2) return glassMaterial();
  return era === 3
    ? cached('glass-e3', () => new THREE.MeshStandardMaterial({ color: '#6f8a9a', emissive: '#14303f', emissiveIntensity: 0.5, roughness: 0.07, metalness: 0.82, envMapIntensity: 1.7 }), { panes: true })
    : cached('glass-e4', () => new THREE.MeshStandardMaterial({ color: '#4a6b7d', emissive: '#2a8fb8', emissiveIntensity: 0.85, roughness: 0.06, metalness: 0.7, envMapIntensity: 1.5 }), { panes: true });
};

export const eraAccentMaterial = (slot: number, era: number) =>
  era < 4
    ? accentMaterial(slot)
    : cached(`accent-${slot}-e4`, () => new THREE.MeshStandardMaterial({ color: factionColor(slot), emissive: factionColor(slot), emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 }), { weather: 0.2 });

/**
 * Corpo das tropas por era: as que saem da fábrica numa era nova (ou são modernizadas) ganham a
 * pintura dela — cinza-oliva na Pós-Guerra Fria, camuflagem digital clara na Era Digital e
 * compósito escuro no Futuro Próximo.
 */
const UNIT_ERA_BODY: Record<number, { color: string; roughness: number; metalness: number }> = {
  2: { color: '#c9cdbd', roughness: 0.7, metalness: 0.22 },
  3: { color: '#b7c2a6', roughness: 0.6, metalness: 0.25 },
  4: { color: '#8e97a4', roughness: 0.42, metalness: 0.45 },
};

export const eraUnitBodyMaterial = (era: number) => {
  const d = UNIT_ERA_BODY[era];
  if (!d) return bodyMaterial();
  return cached(`unit-body-e${era}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, color: d.color, roughness: d.roughness, metalness: d.metalness, envMapIntensity: 0.8 }), { weather: 0.7, seams: true });
};

/** Material da camada de um modelo (corpo, cor da facção ou vidro) na era dada. */
export function eraLayerMaterial(layer: 'body' | 'accent' | 'glass', owner: number, era: number): THREE.Material {
  return layer === 'body' ? eraBodyMaterial(era) : layer === 'accent' ? eraAccentMaterial(owner, era) : eraGlassMaterial(era);
}

export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
