import * as THREE from 'three';
import { cinematicSmokeTexture, glowTexture, volumetricSmokeTexture } from './textures.ts';

/** Qualidade da fumaça das explosões (ver `SmokeMode` em BuildingVisuals). */
export type ExplosionSmoke = 'basic' | 'volumetric' | 'cinematic';

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
    /**
     * Ultra: fumaça volumétrica (várias partículas com volume e giro). Ultra+: coluna mais alta e
     * duradoura, que o vento deita e espalha, com poeira rasteira nas explosões grandes.
     */
    private readonly smokeMode: ExplosionSmoke = 'basic',
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
    if (this.smokeMode === 'cinematic') this.fireball(at, big);
    else this.fireCore(at, big);
    if (this.smokeMode === 'cinematic') {
      const n = big ? 18 : 9;
      const map = cinematicSmokeTexture();
      for (let i = 0; i < n; i++) this.smokePuff(at, big, map, i / n, false);
      // poeira levantada pelo impacto: anel rasteiro que se abre e assenta
      if (big) for (let i = 0; i < 7; i++) this.smokePuff(at, big, map, (i / 7) * 0.15, true, (i / 7) * Math.PI * 2);
      return;
    }
    if (this.smokeMode === 'volumetric') {
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

  /** Núcleo de fogo simples (esfera que cresce e esfria). */
  private fireCore(at: THREE.Vector3, big: boolean): void {
    const fire = new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, depthWrite: false });
    const core = new THREE.Mesh(this.sphereGeo, fire);
    core.position.copy(at).setY(at.y + 0.6);
    const size = big ? 3.2 : 1.2;
    this.add(core, big ? 0.9 : 0.5, (t) => {
      core.scale.setScalar(size * (0.3 + t));
      fire.opacity = 1 - t;
      fire.color.setRGB(1, 0.55 - t * 0.4, 0.2 - t * 0.2);
    }, () => fire.dispose());
  }

  /**
   * Bola de fogo do Ultra+: várias partículas de brilho aditivo, sem contorno, que se expandem,
   * sobem e esfriam do branco-amarelo ao vermelho escuro (o bloom faz o resto).
   */
  private fireball(at: THREE.Vector3, big: boolean): void {
    const n = big ? 7 : 4;
    const map = glowTexture();
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.maxItems) return;
      const m = new THREE.SpriteMaterial({ map, color: '#ffd28a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const sp = new THREE.Sprite(m);
      const r = big ? 1.1 : 0.5;
      const ox = (Math.random() - 0.5) * r;
      const oz = (Math.random() - 0.5) * r;
      const up = (big ? 1.6 : 0.8) * (0.5 + Math.random());
      const sz = (big ? 3.4 : 1.5) * (0.7 + Math.random() * 0.5);
      const delay = (i / n) * 0.2;
      sp.position.copy(at);
      this.add(sp, big ? 1.1 : 0.6, (t) => {
        const k = Math.max(0, (t - delay) / (1 - delay));
        sp.position.set(at.x + ox * (1 + k), at.y + 0.5 + k * up, at.z + oz * (1 + k));
        sp.scale.setScalar(sz * (0.35 + Math.pow(k, 0.5) * 0.9));
        // esfria: branco-amarelo → laranja → vermelho
        m.color.setRGB(1, Math.max(0.25, 0.85 - k * 0.7), Math.max(0.05, 0.55 - k * 0.6));
        m.opacity = Math.min(1, k * 14) * Math.pow(1 - k, 1.3) * 0.9;
      }, () => m.dispose());
    }
  }

  /**
   * Uma partícula de fumaça do Ultra+. A coluna sobe, abre e é deitada pelo vento; a poeira
   * (`ground`) corre rente ao chão na direção `angle` e assenta.
   */
  private smokePuff(at: THREE.Vector3, big: boolean, map: THREE.Texture, delay: number, ground: boolean, angle = 0): void {
    if (this.items.length >= this.maxItems) return;
    const m = new THREE.SpriteMaterial({ map, color: '#3a3835', transparent: true, depthWrite: false, opacity: 0 });
    const sp = new THREE.Sprite(m);
    const spread = big ? 1.8 : 0.9;
    const ox = (Math.random() - 0.5) * spread;
    const oz = (Math.random() - 0.5) * spread;
    const spin = (Math.random() - 0.5) * 0.8;
    const rise = (big ? 7.5 : 3.6) * (0.65 + Math.random() * 0.7);
    const sz = (big ? 2.6 : 1.3) * (0.8 + Math.random() * 0.5);
    const wind = (big ? 4 : 2.2) * (0.7 + Math.random() * 0.6);
    const reach = (big ? 3.6 : 1.8) * (0.8 + Math.random() * 0.4);
    sp.position.copy(at);
    this.add(sp, ground ? (big ? 3 : 2) : big ? 6.5 : 3.5, (t) => {
      const k = Math.max(0, (t - delay) / (1 - delay));
      if (ground) {
        const r = reach * (1 - Math.pow(1 - k, 2.2));
        sp.position.set(at.x + Math.cos(angle) * r + k * 0.6, at.y + 0.25 + k * 0.5, at.z + Math.sin(angle) * r + k * 0.2);
        sp.scale.setScalar(sz * (0.5 + k * 1.3));
        const c = 0.42 + k * 0.12;
        m.color.setRGB(c, c * 0.93, c * 0.82);
        m.opacity = Math.min(1, k * 12) * Math.pow(1 - k, 1.8) * 0.55;
      } else {
        const d = Math.pow(k, 1.5) * wind;
        sp.position.set(at.x + ox * (1 + k * 1.6) + d * 0.94, at.y + 0.6 + Math.pow(k, 0.5) * rise, at.z + oz * (1 + k * 1.6) + d * 0.34);
        sp.scale.setScalar(sz * (0.5 + k * 2.6));
        // núcleo escuro de fuligem que clareia e se dilui ao subir
        const c = 0.18 + k * 0.38;
        m.color.setRGB(c, c * 0.98, c * 0.96);
        m.opacity = Math.min(1, k * 9) * Math.pow(1 - k, 1.5) * 0.62;
      }
      m.rotation += spin * 0.016;
    }, () => m.dispose());
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
