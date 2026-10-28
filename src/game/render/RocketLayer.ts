import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Effects } from './Effects.ts';
import { glowTexture, volumetricSmokeTexture } from './textures.ts';

/** Intervalo entre os foguetes de uma salva (s). */
const RIPPLE = 0.09;
/** Os impactos se espalham em volta do instante em que a simulação aplica o dano (s). */
const IMPACT_EARLY = 0.22;
const IMPACT_STEP = 0.045;

interface Rocket {
  attackerId: number;
  /** Instante de saída (relógio da camada) e duração do voo. */
  launchAt: number;
  flight: number;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  launched: boolean;
  slot: number;
  flame: THREE.Sprite;
  trailAcc: number;
  /** Pede ao lançador a boca do tubo no instante da saída (o casulo pode ter girado). */
  tube: (pos: THREE.Vector3, dir: THREE.Vector3) => void;
  onLaunch: () => void;
  spread: THREE.Vector2;
  target: THREE.Vector2;
  dist: number;
}

interface Puff {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vel: THREE.Vector3;
  size0: number;
  size1: number;
  peak: number;
  tone: number;
}

/** Foguete: corpo claro, ogiva e quatro aletas (aponta para +y; girado na direção do voo). */
function rocketGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.055, 0.055, 0.9, 8);
  const nose = new THREE.ConeGeometry(0.055, 0.22, 8).translate(0, 0.56, 0);
  const fins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) fins.push(new THREE.BoxGeometry(0.008, 0.16, 0.13).translate(0, -0.38, 0.09).rotateY((i * Math.PI) / 2));
  const band = new THREE.CylinderGeometry(0.058, 0.058, 0.06, 8).translate(0, 0.32, 0);
  const color = (g: THREE.BufferGeometry, c: string) => {
    const col = new THREE.Color(c);
    const arr = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < arr.length; i += 3) arr.set([col.r, col.g, col.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g.toNonIndexed();
  };
  const parts = [color(body, '#dedbd0'), color(nose, '#1d1e1c'), color(band, '#d9b13a'), ...fins.map((f) => color(f, '#6d7068'))];
  const g = mergeGeometries(parts)!;
  for (const p of [body, nose, band, ...fins, ...parts]) p.dispose();
  return g;
}

const tmpPos = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Salvas do lança-foguetes: os foguetes saem um a um dos tubos do casulo (clarão, jato de gases
 * para trás e poeira), sobem em arco com chama e rastro de fumaça e caem espalhados na área do
 * alvo, cada um com a sua explosão. O dano é da simulação (no evento de impacto da salva).
 */
export class RocketLayer {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly rockets: Rocket[] = [];
  private readonly free: number[] = [];
  private readonly flames: THREE.Sprite[] = [];
  private readonly puffs: Puff[] = [];
  private puffNext = 0;
  private time = 0;

  constructor(
    private readonly effects: Effects,
    /** Treme a câmera conforme a distância (lançamentos e impactos perto da tela). */
    private readonly shake: (at: { x: number; y: number }, strength: number) => void,
    /** Som de cada foguete que cai (o motor agrupa estouros muito juntos). */
    private readonly onImpact: (x: number, z: number) => void = () => {},
    capacity = 72,
    trailBudget = 220,
  ) {
    const geo = rocketGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.free.push(capacity - 1 - i);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb45a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.visible = false;
      this.group.add(flame);
      this.flames.push(flame);
    }
    this.group.add(this.mesh);
    const smoke = volumetricSmokeTexture();
    for (let i = 0; i < trailBudget; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: '#d8d5cd', transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, age: 1, life: 1, vel: new THREE.Vector3(), size0: 1, size1: 1, peak: 0, tone: 1 });
    }
  }

  /**
   * Nova salva. `flight` é o tempo de voo da simulação (s): os impactos se espalham em volta desse
   * instante, um por foguete, dentro de `spread` do alvo.
   */
  salvo(o: {
    attackerId: number;
    count: number;
    flight: number;
    target: { x: number; y: number };
    spread: number;
    tube: (index: number, pos: THREE.Vector3, dir: THREE.Vector3) => void;
    onLaunch: (index: number) => void;
  }): void {
    for (let i = 0; i < o.count; i++) {
      const slot = this.free.pop();
      if (slot === undefined) return;
      const launchAt = this.time + i * RIPPLE;
      const arrive = this.time + Math.max(o.flight - IMPACT_EARLY + i * IMPACT_STEP, i * RIPPLE + 0.45);
      // ponto de queda: espalhado em disco (mais denso no centro), determinado já no disparo
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * o.spread * 0.85;
      this.rockets.push({
        attackerId: o.attackerId,
        launchAt,
        flight: arrive - launchAt,
        p0: new THREE.Vector3(),
        p1: new THREE.Vector3(),
        p2: new THREE.Vector3(),
        launched: false,
        slot,
        flame: this.flames[slot]!,
        trailAcc: 0,
        tube: (pos, dir) => o.tube(i, pos, dir),
        onLaunch: () => o.onLaunch(i),
        spread: new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r),
        target: new THREE.Vector2(o.target.x, o.target.y),
        dist: 0,
      });
    }
  }

  /** Há foguetes desta salva ainda por cair (o impacto visual fica com eles). */
  pending(attackerId: number): boolean {
    return this.rockets.some((r) => r.attackerId === attackerId);
  }

  /** Fração das partículas de rastro emitidas (KAICS Adaptables+ · K-06: 1 = todas, 0,5 = metade). */
  private trailFrac = 1;
  private trailAcc = 0;

  get trailBudget(): number {
    return this.trailFrac;
  }

  /** Emite só uma fração das partículas de rastro (o rastro fica mais ralo; nada recompila). */
  setTrailBudget(fraction: number): void {
    this.trailFrac = Math.max(0.1, Math.min(1, fraction));
    this.trailAcc = 0;
  }

  private emit(at: THREE.Vector3, o: { life: number; size0: number; size1: number; peak: number; tone: number; vx?: number; vy?: number; vz?: number }): void {
    if (!this.puffs.length) return;
    if (this.trailFrac < 1) {
      this.trailAcc += this.trailFrac;
      if (this.trailAcc < 1) return;
      this.trailAcc -= 1;
    }
    const p = this.puffs[this.puffNext]!;
    this.puffNext = (this.puffNext + 1) % this.puffs.length;
    p.sprite.position.copy(at);
    p.sprite.visible = true;
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
    p.age = 0;
    p.life = o.life;
    p.vel.set(o.vx ?? 0, o.vy ?? 0, o.vz ?? 0);
    p.size0 = o.size0;
    p.size1 = o.size1;
    p.peak = o.peak;
    p.tone = o.tone;
  }

  private launch(r: Rocket): void {
    r.tube(tmpPos, tmpDir);
    r.p0.copy(tmpPos);
    r.p2.set(r.target.x + r.spread.x, 0.05, r.target.y + r.spread.y);
    r.dist = Math.hypot(r.p2.x - r.p0.x, r.p2.z - r.p0.z);
    // controle do arco: segue a direção do tubo e sobe com a distância (saída na inclinação do casulo)
    const lift = Math.max(3, r.dist * 0.42);
    r.p1.copy(r.p0).addScaledVector(tmpDir, lift * 0.9);
    r.p1.y = Math.max(r.p1.y, r.p0.y + lift);
    r.launched = true;
    r.onLaunch();
    // clarão na boca do tubo, jato para trás e poeira levantada em volta do lançador
    this.effects.flash(tmpPos, 0.32, '#fff0c0', 0.1);
    this.effects.light(tmpPos, '#ffc070', 34, 9, 0.18);
    tmpA.copy(tmpDir).multiplyScalar(-1);
    for (let k = 0; k < 3; k++)
      this.emit(tmpB.copy(tmpPos).addScaledVector(tmpA, 1.6 + k * 0.5), {
        life: 1.8 + Math.random() * 0.6,
        size0: 0.6,
        size1: 2.4 + Math.random(),
        peak: 0.65,
        tone: 0.95,
        vx: tmpA.x * 2.4 + (Math.random() - 0.5),
        vy: 0.4,
        vz: tmpA.z * 2.4 + (Math.random() - 0.5),
      });
    this.emit(tmpB.set(tmpPos.x, 0.25, tmpPos.z), { life: 2.4, size0: 1, size1: 3.2, peak: 0.45, tone: 0.85, vx: (Math.random() - 0.5) * 1.6, vy: 0.15, vz: (Math.random() - 0.5) * 1.6 });
  }

  private land(r: Rocket): void {
    const at = r.p2;
    this.effects.explosion(new THREE.Vector3(at.x, 0, at.z), false);
    this.effects.light(at, '#ff9a48', 70, 8, 0.35);
    this.emit(tmpB.set(at.x, 0.4, at.z), { life: 3.4, size0: 1.2, size1: 3.6, peak: 0.6, tone: 0.55, vy: 0.5 });
    this.shake({ x: at.x, y: at.z }, 0.09);
    this.onImpact(at.x, at.z);
  }

  /** Posição e tangente da curva no progresso `k`. */
  private point(r: Rocket, k: number, out: THREE.Vector3, tangent?: THREE.Vector3): THREE.Vector3 {
    const u = 1 - k;
    out
      .set(0, 0, 0)
      .addScaledVector(r.p0, u * u)
      .addScaledVector(r.p1, 2 * u * k)
      .addScaledVector(r.p2, k * k);
    if (tangent)
      tangent
        .copy(r.p1)
        .sub(r.p0)
        .multiplyScalar(2 * u)
        .add(
          tmpA
            .copy(r.p2)
            .sub(r.p1)
            .multiplyScalar(2 * k),
        )
        .normalize();
    return out;
  }

  update(dt: number): void {
    this.time += dt;
    let dirty = false;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      if (this.time < r.launchAt) continue;
      if (!r.launched) this.launch(r);
      // aceleração do motor: começa devagar na rampa e ganha velocidade
      const raw = Math.min(1, (this.time - r.launchAt) / r.flight);
      const k = raw < 0.15 ? raw * raw * (1 / 0.15) * 0.5 + raw * 0.5 : raw;
      this.point(r, Math.min(1, k), tmpPos, tmpDir);
      tmpQ.setFromUnitVectors(UP, tmpDir);
      tmpM.compose(tmpPos, tmpQ, tmpB.set(1, 1, 1));
      this.mesh.setMatrixAt(r.slot, tmpM);
      dirty = true;
      // chama na cauda e rastro de fumaça (mais denso na subida)
      const tail = tmpA.copy(tmpPos).addScaledVector(tmpDir, -0.5);
      r.flame.visible = true;
      r.flame.position.copy(tail);
      r.flame.scale.setScalar(0.55 + Math.random() * 0.2);
      r.trailAcc += dt;
      const every = k < 0.5 ? 0.02 : 0.035;
      while (r.trailAcc > every) {
        r.trailAcc -= every;
        this.emit(tail, { life: 1.3 + Math.random() * 0.6, size0: 0.22, size1: 1.1, peak: 0.55 * (1 - k * 0.5), tone: 1 });
      }
      if (raw >= 1) {
        this.land(r);
        r.flame.visible = false;
        this.mesh.setMatrixAt(r.slot, HIDDEN);
        this.free.push(r.slot);
        this.rockets.splice(i, 1);
      }
    }
    if (dirty || this.rockets.length === 0) this.mesh.instanceMatrix.needsUpdate = true;
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 1.6));
      p.sprite.position.y += dt * 0.25;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.pow(t, 0.5));
      const mat = p.sprite.material;
      const c = p.tone * (0.92 - t * 0.15);
      mat.color.setRGB(c, c * 0.985, c * 0.96);
      mat.opacity = Math.min(1, t * 14) * Math.pow(1 - t, 1.5) * p.peak;
      mat.rotation += dt * 0.3;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    for (const f of this.flames) f.material.dispose();
    for (const p of this.puffs) p.sprite.material.dispose();
    this.rockets.length = 0;
    this.group.removeFromParent();
  }
}
