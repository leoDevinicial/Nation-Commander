import * as THREE from 'three';

/** Câmera RTS: alvo no plano, distância (zoom), guinada (rotação) e inclinação fixa. */
export class CameraController {
  readonly target = new THREE.Vector3();
  distance = 48;
  yaw = Math.PI / 4;
  readonly pitch = 0.95; // ~54°
  readonly minDistance = 16;
  readonly maxDistance = 110;
  panSpeed = 1;
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
    this.distance = THREE.MathUtils.clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  /** Tremor de câmera (ignição de míssil, impacto). Soma ao tremor atual, até 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Decai o tremor; chamar uma vez por quadro antes de `apply`. */
  tick(dt: number): void {
    this.shakeTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
  }

  rotate(delta: number): void {
    this.yaw += delta;
  }

  private clamp(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, this.bounds.w);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, this.bounds.h);
  }

  apply(): void {
    const horiz = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horiz,
      Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horiz,
    );
    if (this.trauma > 0) {
      // ruído suave (senos de frequências primas): treme sem "saltar" de quadro em quadro
      const a = this.trauma * this.trauma * (0.4 + this.distance * 0.012);
      const t = this.shakeTime * 31;
      this.camera.position.x += a * (Math.sin(t) * 0.6 + Math.sin(t * 2.3) * 0.4);
      this.camera.position.y += a * (Math.sin(t * 1.7 + 1) * 0.6 + Math.sin(t * 3.1) * 0.4) * 0.6;
      this.camera.position.z += a * (Math.sin(t * 1.3 + 2) * 0.6 + Math.sin(t * 2.9) * 0.4);
    }
    this.camera.lookAt(this.target);
  }
}
