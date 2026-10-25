import * as THREE from 'three';

interface Effect {
  obj: THREE.Object3D;
  age: number;
  life: number;
  update: (t: number) => void;
  dispose: () => void;
}

/** Efeitos curtos e contidos: traçantes, clarões e explosões. */
export class Effects {
  private readonly items: Effect[] = [];
  private readonly sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly lineMatLight = new THREE.LineBasicMaterial({ color: '#ffe7a3', transparent: true });
  private readonly lineMatHeavy = new THREE.LineBasicMaterial({ color: '#ffb36b', transparent: true });
  private readonly maxItems: number;

  constructor(
    private readonly scene: THREE.Scene,
    quality: 'low' | 'high',
  ) {
    this.maxItems = quality === 'high' ? 160 : 60;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, heavy: boolean): void {
    if (this.items.length >= this.maxItems) return;
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = (heavy ? this.lineMatHeavy : this.lineMatLight).clone();
    const line = new THREE.Line(geo, material);
    this.add(line, heavy ? 0.16 : 0.09, (t) => (material.opacity = 1 - t), () => {
      geo.dispose();
      material.dispose();
    });
    this.flash(from, heavy ? 0.35 : 0.16, '#fff2c0', 0.08);
    if (heavy) this.flash(to, 0.5, '#ff9a4a', 0.22);
  }

  flash(at: THREE.Vector3, size: number, color: string, life: number): void {
    if (this.items.length >= this.maxItems) return;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(this.sphereGeo, material);
    m.position.copy(at);
    m.scale.setScalar(size);
    this.add(m, life, (t) => {
      material.opacity = 1 - t;
      m.scale.setScalar(size * (1 + t * 0.8));
    }, () => material.dispose());
  }

  explosion(at: THREE.Vector3, big: boolean): void {
    const fire = new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, depthWrite: false });
    const core = new THREE.Mesh(this.sphereGeo, fire);
    core.position.copy(at).setY(at.y + 0.6);
    const size = big ? 3.2 : 1.2;
    this.add(core, big ? 0.9 : 0.5, (t) => {
      core.scale.setScalar(size * (0.3 + t));
      fire.opacity = 1 - t;
      fire.color.setRGB(1, 0.55 - t * 0.4, 0.2 - t * 0.2);
    }, () => fire.dispose());
    const smoke = new THREE.MeshStandardMaterial({ color: '#6b6a66', transparent: true, depthWrite: false, roughness: 1 });
    const puff = new THREE.Mesh(this.sphereGeo, smoke);
    const smokeSize = big ? 1.6 : 0.7;
    puff.position.copy(at).setY(at.y + 1);
    this.add(puff, big ? 2.2 : 1.2, (t) => {
      puff.scale.setScalar(smokeSize * (0.6 + t));
      puff.position.y = at.y + 1.2 + t * (big ? 4 : 2);
      smoke.opacity = 0.4 * (1 - t) * (1 - t);
    }, () => smoke.dispose());
  }

  private add(obj: THREE.Object3D, life: number, update: (t: number) => void, dispose: () => void): void {
    this.scene.add(obj);
    this.items.push({ obj, age: 0, life, update, dispose });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i]!;
      e.age += dt;
      const t = Math.min(1, e.age / e.life);
      e.update(t);
      if (t >= 1) {
        e.obj.removeFromParent();
        e.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const e of this.items) {
      e.obj.removeFromParent();
      e.dispose();
    }
    this.items.length = 0;
    this.sphereGeo.dispose();
    this.lineMatLight.dispose();
    this.lineMatHeavy.dispose();
  }
}
