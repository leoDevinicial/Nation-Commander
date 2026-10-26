import * as THREE from 'three';

/**
 * Iluminação adaptativa: exposição que se ajusta ao que está na tela (como o olho ou uma câmera),
 * sombras concentradas onde o jogador está olhando e reflexos que acompanham o cenário ao redor.
 * Só muda a imagem — nunca o estado do jogo.
 */

const MEASURE_W = 32;
const MEASURE_H = 18;
/** Luminância média (linear) de referência: medida em vistas típicas da base, 0,10–0,16. */
export const EXPOSURE_KEY = 0.13;
export const EXPOSURE_MIN = 0.8;
export const EXPOSURE_MAX = 1.45;
/** Fração da correção aplicada: 1 = adaptação total; menor preserva a intenção artística. */
const ADAPT_STRENGTH = 0.5;

/** Exposição-alvo para uma luminância média medida (função pura, testada). */
export function targetExposure(avgLuminance: number): number {
  if (!(avgLuminance > 0)) return 1;
  const raw = Math.pow(EXPOSURE_KEY / avgLuminance, ADAPT_STRENGTH);
  return THREE.MathUtils.clamp(raw, EXPOSURE_MIN, EXPOSURE_MAX);
}

/**
 * Média logarítmica da luminância de pixels RGBA lineares, ignorando o que está quase preto
 * (áreas inexploradas da névoa de guerra não devem "acender" o resto da cena).
 */
export function logAverageLuminance(rgba: ArrayLike<number>, decode: (v: number) => number = (v) => v): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const l = 0.2126 * decode(rgba[i]!) + 0.7152 * decode(rgba[i + 1]!) + 0.0722 * decode(rgba[i + 2]!);
    if (l < 0.012) continue;
    sum += Math.log(l + 1e-4);
    n++;
  }
  return n === 0 ? 0 : Math.exp(sum / n);
}

/**
 * Mede a luminância média da cena numa miniatura (32×18) a cada ~0,6 s, com leitura assíncrona
 * (sem travar a GPU), e aproxima a exposição suavemente — leva ~1 s para se adaptar.
 */
export class AdaptiveExposure {
  private readonly rt = new THREE.WebGLRenderTarget(MEASURE_W, MEASURE_H, { type: THREE.HalfFloatType });
  private readonly buf = new Uint16Array(MEASURE_W * MEASURE_H * 4);
  private pending = false;
  private last = 0;
  private target = 1;
  current = 1;
  /** Última luminância média medida (para diagnóstico). */
  lastAverage = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly base: number,
  ) {}

  update(scene: THREE.Scene, camera: THREE.Camera, now: number, dt: number, hide: THREE.Object3D[]): void {
    if (!this.pending && now - this.last > 600) {
      this.last = now;
      this.measure(scene, camera, hide);
    }
    this.current += (this.target - this.current) * (1 - Math.exp(-dt * 1.6));
    this.renderer.toneMappingExposure = this.base * this.current;
  }

  private measure(scene: THREE.Scene, camera: THREE.Camera, hide: THREE.Object3D[]): void {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const autoShadow = r.shadowMap.autoUpdate;
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = autoShadow;
    hide.forEach((o, i) => (o.visible = vis[i]!));
    this.pending = true;
    r.readRenderTargetPixelsAsync(this.rt, 0, 0, MEASURE_W, MEASURE_H, this.buf)
      .then(() => {
        const avg = logAverageLuminance(this.buf, THREE.DataUtils.fromHalfFloat);
        this.lastAverage = avg;
        if (avg > 0) this.target = targetExposure(avg);
      })
      .catch(() => {
        // contexto perdido ou leitura indisponível: mantém a exposição atual
      })
      .finally(() => (this.pending = false));
  }

  dispose(): void {
    this.rt.dispose();
  }
}

/**
 * Sombras que acompanham a câmera: o volume de sombra do sol cobre só a área visível (e cresce
 * com o zoom), então a mesma resolução de mapa de sombra fica bem mais nítida perto do jogador.
 * O centro é "encaixado" na grade de texels para a sombra não tremer quando a câmera anda.
 */
export class ShadowFollow {
  private half = 0;

  constructor(
    private readonly sun: THREE.DirectionalLight,
    private readonly sunDir: THREE.Vector3,
    private readonly maxHalf: number,
  ) {}

  update(target: THREE.Vector3, distance: number): void {
    const half = THREE.MathUtils.clamp(Math.ceil(distance * 1.15 / 4) * 4, 24, this.maxHalf);
    const sc = this.sun.shadow.camera;
    if (half !== this.half) {
      this.half = half;
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    const texel = (half * 2) / this.sun.shadow.mapSize.x;
    const x = Math.round(target.x / texel) * texel;
    const z = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + this.sunDir.x * 120, this.sunDir.y * 120, z + this.sunDir.z * 120);
  }
}

/**
 * Sonda de ambiente: a cada poucos segundos (se a câmera andou), captura um cubo de 64 px do
 * cenário em volta do ponto observado e o usa como mapa de ambiente. Vidros, metais e água
 * passam a refletir o terreno, as árvores e os prédios reais da região, não só o céu.
 */
export class EnvironmentProbe {
  private readonly cubeRT: THREE.WebGLCubeRenderTarget;
  private readonly cam: THREE.CubeCamera;
  private readonly pmrem: THREE.PMREMGenerator;
  private env: THREE.WebGLRenderTarget | null = null;
  private last = -Infinity;
  private readonly at = new THREE.Vector3(Infinity, 0, 0);

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    /** Resolução do cubo (Ultra+: 128, reflexos mais nítidos) e intervalo mínimo entre capturas. */
    size = 64,
    private readonly interval = 2500,
  ) {
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
    this.cam = new THREE.CubeCamera(1, 400, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  update(target: THREE.Vector3, now: number, hide: THREE.Object3D[]): void {
    if (now - this.last < this.interval || this.at.distanceToSquared(target) < 64) return;
    this.last = now;
    this.at.copy(target);
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const autoShadow = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.cam.position.set(target.x, 7, target.z);
    this.cam.update(this.renderer, this.scene);
    this.renderer.shadowMap.autoUpdate = autoShadow;
    hide.forEach((o, i) => (o.visible = vis[i]!));
    const next = this.pmrem.fromCubemap(this.cubeRT.texture);
    this.scene.environment = next.texture;
    this.env?.dispose();
    this.env = next;
  }

  dispose(): void {
    this.env?.dispose();
    this.cubeRT.dispose();
    this.pmrem.dispose();
  }
}
