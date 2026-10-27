import * as THREE from 'three';
import { sharedGeometry, sharedMaterial } from './palette.ts';

/** Barra de vida em billboard. A cor muda com a fração e o comprimento também (não só cor). */
export class HealthBar {
  readonly group = new THREE.Group();
  private readonly fg: THREE.Mesh;
  private readonly width: number;
  private readonly fixedColor: string | null;

  /** `color` fixa a cor da barra (ex.: recarga); sem ela, a cor acompanha a fração (vida). */
  constructor(width: number, height: number, color: string | null = null, thickness = 1) {
    this.fixedColor = color;
    this.width = width;
    const geo = sharedGeometry('hpbar-plane', () => new THREE.PlaneGeometry(1, 1));
    const bg = new THREE.Mesh(geo, sharedMaterial('hp-bg', () => new THREE.MeshBasicMaterial({ color: '#0b0f14', depthTest: false, transparent: true, opacity: 0.85 })));
    bg.scale.set(width + 0.12, 0.26 * thickness, 1);
    bg.renderOrder = 10;
    this.fg = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color ?? '#5cc47a', depthTest: false, transparent: true }));
    this.fg.scale.set(width, 0.16 * thickness, 1);
    this.fg.position.z = 0.001;
    this.fg.renderOrder = 11;
    this.group.add(bg, this.fg);
    this.group.position.y = height;
    this.group.visible = false;
  }

  set(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction));
    this.fg.scale.x = this.width * f;
    this.fg.position.x = -(this.width * (1 - f)) / 2;
    if (this.fixedColor) return;
    const m = this.fg.material as THREE.MeshBasicMaterial;
    m.color.set(f > 0.6 ? '#5cc47a' : f > 0.3 ? '#e0b44c' : '#e05a4c');
  }

  face(camera: THREE.Camera): void {
    this.group.quaternion.copy(camera.quaternion);
    // compensa a rotação do pai para manter o billboard
    const parent = this.group.parent;
    if (parent) {
      const pq = new THREE.Quaternion();
      parent.getWorldQuaternion(pq);
      this.group.quaternion.premultiply(pq.invert());
    }
  }

  dispose(): void {
    (this.fg.material as THREE.Material).dispose();
  }
}

export function selectionRing(radius: number, color: string): THREE.Mesh {
  const geo = sharedGeometry(`ring-${radius}`, () => new THREE.RingGeometry(radius, radius + 0.14, 32));
  const m = new THREE.Mesh(geo, sharedMaterial(`ring-${color}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.visible = false;
  return m;
}
