import * as THREE from 'three';

/** Inclinação da câmera de comando (~54°) e a mais baixa da visão aproximada (~17°). */
const RTS_PITCH = 0.95;
const LOW_PITCH = 0.3;
/** Zoom mínimo normal e o da visão aproximada (bem rente às tropas). */
const RTS_MIN = 16;
const CLOSE_MIN = 3.2;
/** Distância em que a visão aproximada já volta à inclinação de comando. */
const CLOSE_FAR = 24;

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Câmera RTS: alvo no plano, distância (zoom), guinada (rotação) e inclinação. Na visão aproximada
 * o zoom chega bem perto e a câmera abaixa conforme se aproxima (quase na altura das tropas),
 * olhando para o corpo da unidade em vez do chão; a passagem entre os modos é suave.
 */
export class CameraController {
  readonly target = new THREE.Vector3();
  distance = 48;
  yaw = Math.PI / 4;
  readonly maxDistance = 110;
  panSpeed = 1;
  /** Visão aproximada ligada (o zoom mínimo e a inclinação mudam). */
  closeUp = false;
  /** 0 = câmera de comando, 1 = visão aproximada (anda suave entre os dois). */
  private blend = 0;
  /** Distância para onde o zoom está indo (aproximação suave). */
  private goal: number | null = null;
  private readonly bounds: { w: number; h: number };
  /** Tremor (0..1), que decai sozinho; o deslocamento cresce com o quadrado (pancadas secas). */
  private trauma = 0;
  private shakeTime = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    worldW: number,
    worldH: number,
  ) {
    this.bounds = { w: worldW, h: worldH };
  }

  get minDistance(): number {
    return this.closeUp ? CLOSE_MIN : RTS_MIN;
  }

  /** Inclinação atual: a de comando, ou mais baixa quanto mais perto na visão aproximada. */
  get pitch(): number {
    const low = LOW_PITCH + (RTS_PITCH - LOW_PITCH) * smoothstep((this.distance - CLOSE_MIN) / (CLOSE_FAR - CLOSE_MIN));
    return RTS_PITCH + (low - RTS_PITCH) * this.blend;
  }

  lookAt(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.clamp();
  }

  /** Move no referencial da tela (dx para a direita, dz para "cima"). */
  pan(dx: number, dz: number): void {
    const s = (this.distance / 48) * this.panSpeed;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.target.addScaledVector(right, dx * s).addScaledVector(fwd, dz * s);
    this.clamp();
  }

  zoom(factor: number): void {
    this.goal = null;
    this.distance = THREE.MathUtils.clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  /** Aproxima (ou afasta) suavemente até `d`. */
  zoomTo(d: number): void {
    this.goal = THREE.MathUtils.clamp(d, this.minDistance, this.maxDistance);
  }

  /** Tremor de câmera (ignição de míssil, impacto). Soma ao tremor atual, até 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Decai o tremor e anda as transições; chamar uma vez por quadro antes de `apply`. */
  tick(dt: number): void {
    this.shakeTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const want = this.closeUp ? 1 : 0;
    this.blend += (want - this.blend) * (1 - Math.exp(-dt * 4));
    if (Math.abs(want - this.blend) < 1e-3) this.blend = want;
    if (this.goal !== null) {
      this.distance += (this.goal - this.distance) * (1 - Math.exp(-dt * 3.5));
      if (Math.abs(this.goal - this.distance) < 0.02) {
        this.distance = this.goal;
        this.goal = null;
      }
    }
    // saindo da visão aproximada, o zoom volta ao mínimo normal
    if (!this.closeUp && this.distance < RTS_MIN && this.goal === null) this.goal = RTS_MIN;
  }

  rotate(delta: number): void {
    this.yaw += delta;
  }

  private clamp(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, this.bounds.w);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, this.bounds.h);
  }

  apply(): void {
    const pitch = this.pitch;
    // de perto, mira o corpo das tropas (não o chão sob elas)
    const lookY = this.blend * 0.6 * (1 - smoothstep((this.distance - CLOSE_MIN) / (CLOSE_FAR - CLOSE_MIN)));
    const horiz = Math.cos(pitch) * this.distance;
    this.camera.position.set(this.target.x + Math.sin(this.yaw) * horiz, lookY + Math.sin(pitch) * this.distance, this.target.z + Math.cos(this.yaw) * horiz);
    if (this.trauma > 0) {
      // ruído suave (senos de frequências primas): treme sem "saltar" de quadro em quadro
      const a = this.trauma * this.trauma * (0.4 + this.distance * 0.012);
      const t = this.shakeTime * 31;
      this.camera.position.x += a * (Math.sin(t) * 0.6 + Math.sin(t * 2.3) * 0.4);
      this.camera.position.y += a * (Math.sin(t * 1.7 + 1) * 0.6 + Math.sin(t * 3.1) * 0.4) * 0.6;
      this.camera.position.z += a * (Math.sin(t * 1.3 + 2) * 0.6 + Math.sin(t * 2.9) * 0.4);
    }
    this.camera.lookAt(this.target.x, lookY, this.target.z);
  }
}
