import * as THREE from 'three';
import { volumetricSmokeTexture } from './textures.ts';

interface Effect {
  obj: THREE.Object3D;
  age: number;
  life: number;
  update: (t: number) => void;
  dispose: () => void;
}

/** Luz pontual reaproveitada (o número de luzes é fixo para não recompilar shaders). */
interface PooledLight {
  light: THREE.PointLight;
  age: number;
  life: number;
  peak: number;
}

/**
 * Efeitos curtos e contidos: traçantes, clarões e explosões. Disparos e explosões também acendem
 * por um instante o entorno (luzes pontuais de um conjunto fixo, conforme o preset gráfico).
 */
export class Effects {
  private readonly lights: PooledLight[] = [];
  private readonly items: Effect[] = [];
  private readonly sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly lineMatLight = new THREE.LineBasicMaterial({ color: '#ffe7a3', transparent: true });
  private readonly lineMatHeavy = new THREE.LineBasicMaterial({ color: '#ffb36b', transparent: true });
  private readonly maxItems: number;

  constructor(
    private readonly scene: THREE.Scene,
    maxItems: number,
    dynamicLights = 0,
    /** Ultra: fumaça de explosão volumétrica (várias partículas com volume e giro). */
    private readonly volumetricSmoke = false,
  ) {
    this.maxItems = maxItems;
    for (let i = 0; i < dynamicLights; i++) {
      const light = new THREE.PointLight('#ffb36b', 0, 10, 2);
      light.castShadow = false;
      scene.add(light);
      this.lights.push({ light, age: 1, life: 1, peak: 0 });
    }
  }

  /** Acende a luz mais antiga do conjunto em `at` (clarão de disparo ou explosão). */
  private glow(at: THREE.Vector3, color: string, peak: number, range: number, life: number): void {
    if (this.lights.length === 0) return;
    let slot = this.lights[0]!;
    for (const l of this.lights) if (l.age / l.life > slot.age / slot.life) slot = l;
    // não rouba uma luz mais forte que ainda está acesa
    if (slot.age < slot.life && slot.peak * (1 - slot.age / slot.life) > peak) return;
    slot.light.position.copy(at).setY(at.y + 0.8);
    slot.light.color.set(color);
    slot.light.distance = range;
    slot.peak = peak;
    slot.age = 0;
    slot.life = life;
    slot.light.intensity = peak;
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
    if (heavy) {
      this.flash(to, 0.5, '#ff9a4a', 0.22);
      this.glow(from, '#ffd59a', 25, 9, 0.12);
    }
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
    this.glow(at, '#ff8a3a', big ? 160 : 60, big ? 18 : 10, big ? 0.9 : 0.5);
    const fire = new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, depthWrite: false });
    const core = new THREE.Mesh(this.sphereGeo, fire);
    core.position.copy(at).setY(at.y + 0.6);
    const size = big ? 3.2 : 1.2;
    this.add(core, big ? 0.9 : 0.5, (t) => {
      core.scale.setScalar(size * (0.3 + t));
      fire.opacity = 1 - t;
      fire.color.setRGB(1, 0.55 - t * 0.4, 0.2 - t * 0.2);
    }, () => fire.dispose());
    if (this.volumetricSmoke) {
      // coluna de fumaça: partículas que sobem, abrem e escurecem/clareiam, cada uma com giro próprio
      const n = big ? 9 : 5;
      for (let i = 0; i < n; i++) {
        const m = new THREE.SpriteMaterial({ map: volumetricSmokeTexture(), color: '#3c3a37', transparent: true, depthWrite: false, opacity: 0 });
        const sp = new THREE.Sprite(m);
        const ox = (Math.random() - 0.5) * (big ? 1.6 : 0.8);
        const oz = (Math.random() - 0.5) * (big ? 1.6 : 0.8);
        const spin = (Math.random() - 0.5) * 1.2;
        const rise = (big ? 5 : 2.6) * (0.7 + Math.random() * 0.6);
        const sz = (big ? 2.2 : 1.1) * (0.8 + Math.random() * 0.5);
        const delay = (i / n) * 0.25;
        sp.position.copy(at);
        this.add(sp, big ? 4 : 2.4, (t) => {
          const k = Math.max(0, (t - delay) / (1 - delay));
          sp.position.set(at.x + ox * (1 + k) + k * k * 1.5, at.y + 0.6 + Math.sqrt(k) * rise, at.z + oz * (1 + k));
          sp.scale.setScalar(sz * (0.5 + k * 1.8));
          m.rotation += spin * 0.016;
          const c = 0.22 + k * 0.3;
          m.color.setRGB(c, c * 0.98, c * 0.95);
          m.opacity = Math.min(1, k * 10) * Math.pow(1 - k, 1.4) * 0.8;
        }, () => m.dispose());
      }
      return;
    }
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
    for (const l of this.lights) {
      if (l.age >= l.life) continue;
      l.age += dt;
      const t = Math.min(1, l.age / l.life);
      // subida instantânea e queda rápida, como um clarão
      l.light.intensity = l.peak * (1 - t) * (1 - t);
    }
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
    for (const l of this.lights) l.light.removeFromParent();
    this.lights.length = 0;
    this.sphereGeo.dispose();
    this.lineMatLight.dispose();
    this.lineMatHeavy.dispose();
  }
}
