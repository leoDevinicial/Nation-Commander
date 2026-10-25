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
    this.camera.lookAt(this.target);
  }
}
