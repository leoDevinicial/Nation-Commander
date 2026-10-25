import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { hideNonSolid, LightShaftsPass, LocalExposurePass } from './UltraPasses.ts';

/**
 * Oclusão de ambiente em espaço de tela (GTAO): escurece cantos, encontros com o chão e frestas,
 * o que "assenta" os modelos low-poly no terreno como numa foto. Só no preset Alto — custa uma
 * passada extra de profundidade/normais por quadro.
 * No Ultra, entram também os feixes de luz do sol e a exposição local (ver `UltraPasses.ts`).
 */
export interface PostFxUltra {
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunDepthSize: number;
}

export class PostFx {
  private readonly composer: EffectComposer;
  private readonly ao: GTAOPass;

  private readonly extra: { dispose: () => void }[] = [];

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, ultra: PostFxUltra | null = null) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: 12 });
    this.ao.updatePdMaterial({ radius: 6, rings: 2, samples: 12 });
    this.ao.blendIntensity = 1;
    excludeOverlaysFromAo(this.ao, scene);
    this.composer.addPass(this.ao);
    if (ultra) {
      const ao = this.ao;
      const shafts = new LightShaftsPass(scene, camera, ultra.sun, () => ao.depthTexture ?? null, ultra.sunDir, ultra.sunColor, ultra.sunDepthSize);
      const local = new LocalExposurePass();
      this.composer.addPass(shafts);
      this.composer.addPass(local);
      this.extra.push(shafts, local);
    }
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    for (const p of this.extra) p.dispose();
    this.ao.dispose();
    this.composer.dispose();
  }
}

/**
 * O GTAO só deve "ver" superfícies sólidas. Camadas sobrepostas e transparentes que não gravam
 * profundidade (fronteiras, água, céu, fumaça, barras de vida) entrariam no passe de normais e
 * apareceriam como manchas pretas — por isso ficam de fora, junto com pontos e linhas.
 */
function excludeOverlaysFromAo(pass: GTAOPass, scene: THREE.Scene): void {
  const internal = pass as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
  internal._overrideVisibility = () => hideNonSolid(scene, internal._visibilityCache);
}
