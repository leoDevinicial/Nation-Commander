import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Passes do preset Ultra:
 * - `LightShaftsPass`: feixes de luz do sol na névoa baixa (espalhamento volumétrico). Para cada
 *   pixel, percorre o raio de visão dentro da camada de névoa e consulta um mapa de profundidade
 *   visto do sol: trechos iluminados espalham luz, trechos atrás de prédios e árvores não. Daí
 *   surgem os feixes inclinados e as "sombras na névoa".
 * - `LocalExposurePass`: luz adaptativa por região. Mede a luminância média de cada área da tela
 *   (em baixa resolução, suavizada) e clareia as regiões em sombra, como o olho se ajusta ao
 *   olhar para dentro de uma sombra, sem estourar as áreas ao sol.
 */

/** Esconde o que não é superfície sólida (céu, água, fronteiras, fumaça, barras) num passe auxiliar. */
export function hideNonSolid(scene: THREE.Scene, cache: THREE.Object3D[]): void {
  scene.traverse((o) => {
    if (!o.visible) return;
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const overlay = !!m && !Array.isArray(m) && !m.depthWrite;
    const flag = o as unknown as { isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
    if (overlay || flag.isPoints || flag.isLine || flag.isSprite) {
      o.visible = false;
      cache.push(o);
    }
  });
}

export function restoreHidden(cache: THREE.Object3D[]): void {
  for (const o of cache) o.visible = true;
  cache.length = 0;
}

const SHAFT_STEPS = 28;
/** Altura da camada de névoa onde os feixes aparecem (unidades do mapa). */
const HAZE_TOP = 10;

export class LightShaftsPass extends Pass {
  private readonly sunTarget: THREE.WebGLRenderTarget;
  private readonly depthMat = new THREE.MeshDepthMaterial();
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;
  private readonly hidden: THREE.Object3D[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sun: THREE.DirectionalLight,
    private readonly sceneDepth: () => THREE.Texture | null,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    size = 1024,
  ) {
    super();
    this.sunTarget = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    this.sunTarget.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tSunDepth: { value: this.sunTarget.depthTexture },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uSunMatrix: { value: new THREE.Matrix4() },
        uSunDir: { value: sunDir.clone().normalize() },
        uSunColor: { value: sunColor.clone() },
        uIntensity: { value: 0.9 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform sampler2D tSunDepth;
        uniform mat4 uInvProj;
        uniform mat4 uCamWorld;
        uniform vec3 uCamPos;
        uniform mat4 uSunMatrix;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float lit(vec3 p) {
          vec4 lc = uSunMatrix * vec4(p, 1.0);
          vec3 c = lc.xyz / lc.w * 0.5 + 0.5;
          if (c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
          return c.z - 0.003 <= texture2D(tSunDepth, c.xy).x ? 1.0 : 0.0;
        }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          float d = texture2D(tDepth, vUv).x;
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vp /= vp.w;
          vec3 wp = (uCamWorld * vp).xyz;
          vec3 rd = normalize(wp - uCamPos);
          float tEnd = d >= 0.99999 ? 600.0 : length(wp - uCamPos);
          // trecho do raio dentro da camada de névoa (0 <= y <= HAZE_TOP)
          float t0 = 0.0;
          float t1 = tEnd;
          if (abs(rd.y) > 1e-4) {
            float ta = (${HAZE_TOP.toFixed(1)} - uCamPos.y) / rd.y;
            float tb = (0.0 - uCamPos.y) / rd.y;
            t0 = max(t0, min(ta, tb));
            t1 = min(t1, max(ta, tb));
          }
          if (t1 <= t0) { gl_FragColor = base; return; }
          float stepLen = (t1 - t0) / float(${SHAFT_STEPS});
          float j = hash(gl_FragCoord.xy + fract(uTime) * 61.0);
          float inscatter = 0.0;
          for (int i = 0; i < ${SHAFT_STEPS}; i++) {
            vec3 p = uCamPos + rd * (t0 + (float(i) + j) * stepLen);
            float density = 0.009 * exp(-max(p.y, 0.0) / 4.0);
            inscatter += lit(p) * density * stepLen;
          }
          // espalhamento para a frente (Henyey-Greenstein, g = 0,55): mais forte olhando para o sol
          float g = 0.55;
          float ct = dot(rd, uSunDir);
          float hg = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * ct, 1.5));
          vec3 add = uSunColor * inscatter * (0.12 + hg * 3.5) * uIntensity;
          gl_FragColor = vec4(base.rgb + add, base.a);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Profundidade da cena vista do sol (só superfícies sólidas), usada para testar luz/sombra. */
  private renderSunDepth(renderer: THREE.WebGLRenderer): void {
    const cam = this.sun.shadow.camera;
    this.sun.shadow.updateMatrices(this.sun);
    const prevOverride = this.scene.overrideMaterial;
    const prevTarget = renderer.getRenderTarget();
    const autoShadow = renderer.shadowMap.autoUpdate;
    hideNonSolid(this.scene, this.hidden);
    this.scene.overrideMaterial = this.depthMat;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.sunTarget);
    renderer.clear();
    renderer.render(this.scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = autoShadow;
    this.scene.overrideMaterial = prevOverride;
    restoreHidden(this.hidden);
    const u = this.material.uniforms;
    u.uSunMatrix!.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const depth = this.sceneDepth();
    if (!depth) {
      // sem profundidade disponível: repassa a imagem
      this.material.uniforms.tDiffuse!.value = readBuffer.texture;
      this.material.uniforms.uIntensity!.value = 0;
    } else {
      this.material.uniforms.uIntensity!.value = 0.9;
      this.renderSunDepth(renderer);
    }
    const u = this.material.uniforms;
    u.tDiffuse!.value = readBuffer.texture;
    u.tDepth!.value = depth;
    u.uInvProj!.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld!.value.copy(this.camera.matrixWorld);
    u.uCamPos!.value.setFromMatrixPosition(this.camera.matrixWorld);
    u.uTime!.value = performance.now() / 1000;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.sunTarget.depthTexture?.dispose();
    this.sunTarget.dispose();
    this.depthMat.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

/** Luminância média de referência (linear) e força da compensação regional. */
const LOCAL_KEY = 0.16;
const LOCAL_STRENGTH = 0.3;
const LOCAL_MAX_GAIN = 1.5;

export class LocalExposurePass extends Pass {
  private small: THREE.WebGLRenderTarget;
  private readonly lumMat: THREE.ShaderMaterial;
  private readonly applyMat: THREE.ShaderMaterial;
  private readonly lumQuad: FullScreenQuad;
  private readonly applyQuad: FullScreenQuad;

  constructor() {
    super();
    this.small = new THREE.WebGLRenderTarget(64, 36, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const vs = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    // 1) reduz a imagem a uma grade de luminâncias (log), com 16 amostras por célula
    this.lumMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: vs,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          float acc = 0.0;
          for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
            vec2 o = (vec2(float(x), float(y)) - 1.5) * uTexel * 0.25;
            vec3 c = texture2D(tDiffuse, vUv + o).rgb;
            acc += log(dot(c, vec3(0.2126, 0.7152, 0.0722)) + 1e-3);
          }
          gl_FragColor = vec4(acc / 16.0, 0.0, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    // 2) aplica: ganho por região, só para clarear sombras (nunca escurece o que está ao sol)
    this.applyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tLum: { value: this.small.texture }, uTexel: { value: new THREE.Vector2(1 / 64, 1 / 36) } },
      vertexShader: vs,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tLum; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float acc = 0.0;
          float wsum = 0.0;
          for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
            float w = exp(-float(x * x + y * y) / 4.0);
            acc += texture2D(tLum, vUv + vec2(float(x), float(y)) * uTexel).r * w;
            wsum += w;
          }
          float local = exp(acc / wsum);
          float gain = clamp(pow(${LOCAL_KEY.toFixed(3)} / max(local, 1e-3), ${LOCAL_STRENGTH.toFixed(2)}), 1.0, ${LOCAL_MAX_GAIN.toFixed(2)});
          // luz do céu nas sombras é levemente azulada
          vec3 tint = mix(vec3(1.0), vec3(0.96, 0.99, 1.06), clamp((gain - 1.0) * 1.5, 0.0, 1.0));
          gl_FragColor = vec4(c.rgb * gain * tint, c.a);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.lumQuad = new FullScreenQuad(this.lumMat);
    this.applyQuad = new FullScreenQuad(this.applyMat);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.lumMat.uniforms.tDiffuse!.value = readBuffer.texture;
    this.lumMat.uniforms.uTexel!.value.set(1 / 64, 1 / 36);
    renderer.setRenderTarget(this.small);
    this.lumQuad.render(renderer);
    this.applyMat.uniforms.tDiffuse!.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.applyQuad.render(renderer);
  }

  override dispose(): void {
    this.small.dispose();
    this.lumMat.dispose();
    this.applyMat.dispose();
    this.lumQuad.dispose();
    this.applyQuad.dispose();
  }
}
