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
  /** Fração do máximo de efeitos em uso (o KGPS reduz quando o jogo pesa). */
  private budgetFrac = 1;
  /** Fumaça das explosões novas (o KGPS pode baixar até a básica; as em curso terminam como estão). */
  private smokeMode: ExplosionSmoke;

  constructor(
    private readonly scene: THREE.Scene,
    maxItems: number,
    dynamicLights = 0,
    /**
     * Ultra: fumaça volumétrica (várias partículas com volume e giro). Ultra+: coluna mais alta e
     * duradoura, que o vento deita e espalha, com poeira rasteira nas explosões grandes.
     */
    readonly topSmoke: ExplosionSmoke = 'basic',
  ) {
    this.maxItems = maxItems;
    this.smokeMode = topSmoke;
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
    if (this.items.length >= this.cap) return;
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
    if (this.items.length >= this.cap) return;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(this.sphereGeo, material);
    m.position.copy(at);
    m.scale.setScalar(size);
    this.add(m, life, (t) => {
      material.opacity = 1 - t;
      m.scale.setScalar(size * (1 + t * 0.8));
    }, () => material.dispose());
  }

  private keeperGroup: THREE.Group | null = null;

  /**
   * Guardiões de shader (KAICS Adaptables+ · R-SHD-02): um objeto invisível para cada variante de
   * material que os efeitos (e as camadas de foguetes, aviões e projéteis) criam durante a
   * partida. Ficam na cena até o fim: o pré-aquecimento compila os shaders deles antes do primeiro
   * tiro, e eles seguram os programas compilados. Sem isso, quando a última explosão acaba e o
   * material dela é descartado, o three.js apaga o programa e a próxima explosão compila tudo de
   * novo — uma travada no meio da batalha.
   */
  keepers(): THREE.Group {
    if (this.keeperGroup) return this.keeperGroup;
    const g = new THREE.Group();
    g.name = 'shader-keepers';
    const add = (o: THREE.Object3D) => {
      o.visible = false;
      o.frustumCulled = false;
      g.add(o);
    };
    const geo = this.sphereGeo;
    add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), this.lineMatLight.clone()));
    add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false })));
    add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, depthWrite: false, opacity: 0 })));
    add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#6b6a66', transparent: true, depthWrite: false, roughness: 1 })));
    add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false })));
    add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false })));
    this.keeperGroup = g;
    return g;
  }

  /** Limite de efeitos simultâneos em vigor (nunca menos que 8: tiros e explosões continuam visíveis). */
  private get cap(): number {
    return Math.max(8, Math.round(this.maxItems * this.budgetFrac));
  }

  get budget(): number {
    return this.budgetFrac;
  }

  get smoke(): ExplosionSmoke {
    return this.smokeMode;
  }

  /**
   * Orçamento de efeitos (KAICS Adaptables+ · K-05): fração do máximo do preset e a fumaça das
   * explosões novas. Não recompila shaders: só limita quantos efeitos nascem e quão densa é a fumaça.
   */
  setBudget(fraction: number, smoke: ExplosionSmoke): void {
    this.budgetFrac = Math.max(0.1, Math.min(1, fraction));
    this.smokeMode = smoke;
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
      if (this.items.length >= this.cap) return;
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
    if (this.items.length >= this.cap) return;
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

  // ------------------------------------------------------------ míssil balístico (cinematográfico)

  /** Luz pontual de curta duração (usa o conjunto fixo de luzes do preset; sem luzes, não faz nada). */
  light(at: THREE.Vector3, color: string, peak: number, range: number, life: number): void {
    this.glow(at, color, peak, range, life);
  }

  /**
   * Nuvem de fumaça grande e lenta (ignição e cogumelo do impacto). `ground` espalha rente ao chão
   * em anel; senão sobe em coluna e, no topo (`cap`), abre para os lados como um cogumelo.
   */
  plume(at: THREE.Vector3, o: { count: number; size: number; rise: number; life: number; spread: number; ground?: boolean; cap?: boolean; tone?: number; delay?: number }): void {
    const map = this.smokeMode === 'cinematic' ? cinematicSmokeTexture() : volumetricSmokeTexture();
    for (let i = 0; i < o.count; i++) {
      if (this.items.length >= this.cap) return;
      const m = new THREE.SpriteMaterial({ map, color: '#3a3835', transparent: true, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(m);
      const angle = (i / o.count) * Math.PI * 2 + Math.random() * 0.6;
      const reach = o.spread * (0.6 + Math.random() * 0.5);
      const rise = o.rise * (0.75 + Math.random() * 0.5);
      const sz = o.size * (0.75 + Math.random() * 0.5);
      const spin = (Math.random() - 0.5) * 0.6;
      const delay = (o.delay ?? 0) + (i / o.count) * 0.12;
      const tone = o.tone ?? 0.5;
      sp.position.copy(at);
      this.add(sp, o.life * (0.85 + Math.random() * 0.3), (t) => {
        const k = Math.max(0, (t - delay) / (1 - delay));
        const out = 1 - Math.pow(1 - k, 2.5);
        if (o.ground) {
          sp.position.set(at.x + Math.cos(angle) * reach * out, at.y + 0.3 + k * 0.8, at.z + Math.sin(angle) * reach * out);
        } else if (o.cap) {
          // sobe e, já no alto, abre para fora (o "chapéu" do cogumelo)
          const up = Math.pow(Math.min(1, k * 1.6), 0.6);
          const side = Math.max(0, k * 1.6 - 0.6) * reach;
          sp.position.set(at.x + Math.cos(angle) * side + k * 1.2, at.y + rise * up, at.z + Math.sin(angle) * side + k * 0.4);
        } else {
          sp.position.set(at.x + Math.cos(angle) * reach * 0.3 * out + k * 0.8, at.y + 0.5 + Math.pow(k, 0.55) * rise, at.z + Math.sin(angle) * reach * 0.3 * out);
        }
        sp.scale.setScalar(sz * (0.45 + k * 1.9));
        const c = tone * 0.45 + k * 0.32;
        m.color.setRGB(c, c * 0.97, c * 0.93);
        m.opacity = Math.min(1, k * 8) * Math.pow(1 - k, 1.2) * 0.88;
        m.rotation += spin * 0.016;
      }, () => m.dispose());
    }
  }

  /**
   * Clarão de boca de cano: brilho macio (sem borda) e um jato curto de fogo à frente, que somem em
   * poucos centésimos de segundo; respeita a profundidade (não aparece por cima dos prédios).
   */
  muzzleFlash(at: THREE.Vector3, dir: THREE.Vector3, size: number): void {
    if (this.items.length >= this.cap) return;
    const map = glowTexture();
    const parts: [number, number, string][] = [
      [0, 1, '#ffe6a8'],
      [0.45, 0.75, '#ffb453'],
      [0.9, 0.5, '#ff8a2a'],
    ];
    for (const [ahead, scale, color] of parts) {
      const m = new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const sp = new THREE.Sprite(m);
      sp.position.copy(at).addScaledVector(dir, ahead * size);
      const sz = size * scale * (0.85 + Math.random() * 0.3);
      this.add(sp, 0.07 + size * 0.03, (t) => {
        sp.scale.setScalar(sz * (1 + t * 0.6));
        m.opacity = Math.pow(1 - t, 1.5);
      }, () => m.dispose());
    }
  }

  /** Clarão grande e macio (sprite com brilho radial): sem a borda poligonal de uma esfera. */
  softFlash(at: THREE.Vector3, size: number, color: string, life: number): void {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(m);
    sp.position.copy(at);
    sp.renderOrder = 20;
    // o clarão principal não conta no limite de efeitos: é um só e marca o instante
    this.scene.add(sp);
    this.items.push({
      obj: sp,
      age: 0,
      life,
      update: (t) => {
        sp.scale.setScalar(size * (0.6 + Math.pow(t, 0.4) * 0.8));
        m.opacity = Math.pow(1 - t, 2);
      },
      dispose: () => m.dispose(),
    });
  }

  /** Bola de fogo aditiva (todos os presets; no Ultra+ o brilho ainda passa pelo bloom). */
  blast(at: THREE.Vector3, size: number, life: number, count = 8): void {
    const map = glowTexture();
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.cap) return;
      const m = new THREE.SpriteMaterial({ map, color: '#fff2c8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const sp = new THREE.Sprite(m);
      const ox = (Math.random() - 0.5) * size * 0.5;
      const oz = (Math.random() - 0.5) * size * 0.5;
      const up = size * (0.4 + Math.random() * 0.6);
      const sz = size * (0.8 + Math.random() * 0.6);
      const delay = (i / count) * 0.15;
      sp.position.copy(at);
      this.add(sp, life * (0.8 + Math.random() * 0.4), (t) => {
        const k = Math.max(0, (t - delay) / (1 - delay));
        sp.position.set(at.x + ox * (1 + k), at.y + 0.6 + k * up, at.z + oz * (1 + k));
        sp.scale.setScalar(sz * (0.3 + Math.pow(k, 0.45)));
        m.color.setRGB(1, Math.max(0.2, 0.95 - k * 0.8), Math.max(0.04, 0.75 - k * 0.85));
        m.opacity = Math.min(1, k * 16) * Math.pow(1 - k, 1.1);
      }, () => m.dispose());
    }
  }

  /** Marca escura de queimado no chão, que esmaece devagar. */
  scorch(at: { x: number; y: number }, radius: number, life: number): void {
    const material = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, depthWrite: false, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, 0.12, at.y);
    m.scale.setScalar(radius * 2.6);
    m.renderOrder = 2;
    // a marca não conta no limite de efeitos (é uma só e precisa durar)
    this.scene.add(m);
    this.items.push({
      obj: m,
      age: 0,
      life,
      update: (t) => (material.opacity = Math.min(1, t * 40) * 0.75 * (1 - Math.pow(t, 3))),
      dispose: () => {
        m.geometry.dispose();
        material.dispose();
      },
    });
  }

  /**
   * Ignição do míssil pesado (silo nível 2): clarão maior, luz que cega por um instante, bola de
   * fogo no defletor e uma nuvem enorme que sai em leque pela frente da torre e sobe em coluna.
   */
  heavyIgnition(at: THREE.Vector3): void {
    this.light(at, '#ffe0a8', 520, 40, 1.8);
    this.softFlash(at.clone().setY(2), 22, '#fff6e0', 0.6);
    this.softFlash(at.clone().setY(1), 9, '#ffb760', 1.4);
    this.blast(at.clone().setZ(at.z + 0.8), 3.8, 1.2, 12);
    this.plume(at, { count: 26, size: 4.6, rise: 1.8, life: 10, spread: 11, ground: true, tone: 1 });
    this.plume(at, { count: 12, size: 4, rise: 16, life: 11, spread: 2.6, tone: 0.95, delay: 0.04 });
    this.plume(at.clone().setZ(at.z + 2.5), { count: 10, size: 3.6, rise: 5, life: 8, spread: 4, tone: 0.9, delay: 0.1 });
  }

  /** Ignição no silo: clarão, luz forte e uma nuvem de fumaça que rola pelo chão e sobe. */
  ignition(at: THREE.Vector3): void {
    this.light(at, '#ffd9a0', 260, 26, 1.4);
    this.softFlash(at.clone().setY(1.5), 14, '#fff3d6', 0.5);
    this.blast(at, 2.6, 0.9, 6);
    this.plume(at, { count: 16, size: 3.4, rise: 1.4, life: 7.5, spread: 7, ground: true, tone: 1 });
    this.plume(at, { count: 8, size: 3, rise: 11, life: 8.5, spread: 2, tone: 0.95, delay: 0.05 });
  }

  /** Impacto do míssil: clarão cegante, bola de fogo, cogumelo de fumaça, poeira e queimado. */
  missileImpact(at: THREE.Vector3, radius: number): void {
    this.light(at, '#fff0c8', 520, radius * 9, 1.8);
    this.softFlash(at.clone().setY(3), radius * 9, '#ffffff', 0.45);
    this.softFlash(at.clone().setY(2), radius * 4, '#ffd28a', 1.2);
    this.blast(at, radius * 1.3, 1.8, 12);
    for (let i = 0; i < 4; i++) this.explosion(new THREE.Vector3(at.x + (Math.random() - 0.5) * radius * 1.6, 0, at.z + (Math.random() - 0.5) * radius * 1.6), i < 2);
    // cogumelo: haste escura que sobe e um chapéu que abre no alto
    this.plume(at, { count: 10, size: radius * 1.1, rise: radius * 3.2, life: 10, spread: radius * 0.4, tone: 0.35 });
    this.plume(at, { count: 14, size: radius * 1.4, rise: radius * 3.8, life: 12, spread: radius * 1.5, cap: true, tone: 0.5, delay: 0.04 });
    this.plume(at, { count: 18, size: radius * 1, rise: 1, life: 6.5, spread: radius * 2.8, ground: true, tone: 0.8 });
    this.scorch({ x: at.x, y: at.z }, radius, 40);
  }

  /**
   * Impacto do míssil pesado: o impacto comum maior, um segundo clarão, um anel de explosões em
   * volta, brasas lançadas para todos os lados e uma poeira mais larga e demorada.
   */
  heavyMissileImpact(at: THREE.Vector3, radius: number): void {
    this.missileImpact(at, radius);
    this.softFlash(at.clone().setY(5), radius * 12, '#fff8ea', 0.7);
    this.light(at, '#ffd08a', 400, radius * 12, 2.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const r = radius * (0.7 + Math.random() * 0.35);
      this.explosion(new THREE.Vector3(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r), i % 2 === 0);
    }
    this.plume(at, { count: 22, size: radius * 1.1, rise: 1.4, life: 9, spread: radius * 3.8, ground: true, tone: 0.75, delay: 0.08 });
    for (let i = 0; i < 16; i++) {
      if (this.items.length >= this.cap) return;
      const m = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffa648', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const sp = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2;
      const v = 5 + Math.random() * 7;
      const vy = 5 + Math.random() * 7;
      sp.scale.setScalar(0.4 + Math.random() * 0.3);
      this.add(sp, 1.8 + Math.random() * 0.8, (t) => {
        const s = t * 2.2;
        sp.position.set(at.x + Math.cos(a) * v * s, Math.max(0.2, 1 + vy * s - 4.9 * s * s), at.z + Math.sin(a) * v * s);
        m.opacity = 1 - t * t;
      }, () => m.dispose());
    }
  }

  /** Interceptação: estouro no céu, nuvem que fica pairando e fragmentos incandescentes caindo. */
  airburst(at: THREE.Vector3): void {
    this.light(at, '#ffffff', 220, 30, 0.6);
    this.softFlash(at, 16, '#ffffff', 0.35);
    this.blast(at, 2.6, 1, 6);
    this.plume(at.clone().setY(at.y - 0.6), { count: 8, size: 1.8, rise: 1.5, life: 6, spread: 3, tone: 0.7 });
    for (let i = 0; i < 7; i++) {
      if (this.items.length >= this.cap) return;
      const m = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb35a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const sp = new THREE.Sprite(m);
      const vx = (Math.random() - 0.5) * 6;
      const vz = (Math.random() - 0.5) * 6;
      const vy = Math.random() * 3;
      sp.scale.setScalar(0.35);
      this.add(sp, 1.6 + Math.random() * 0.6, (t) => {
        const s = t * 1.8;
        sp.position.set(at.x + vx * s, Math.max(0.2, at.y + vy * s - 4.9 * s * s), at.z + vz * s);
        m.opacity = 1 - t;
      }, () => m.dispose());
    }
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
    if (this.keeperGroup) {
      for (const o of this.keeperGroup.children) {
        const m = (o as THREE.Mesh).material as THREE.Material;
        m.dispose();
        if (o instanceof THREE.Line) o.geometry.dispose();
      }
      this.keeperGroup.removeFromParent();
      this.keeperGroup = null;
    }
  }
}
