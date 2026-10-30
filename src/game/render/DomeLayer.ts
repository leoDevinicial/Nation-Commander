import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Effects } from './Effects.ts';
import { DOME_TUBES } from './models/ironDome.ts';
import { glowTexture, volumetricSmokeTexture } from './textures.ts';

interface Shot {
  launchAt: number;
  flight: number;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  p3: THREE.Vector3;
  launched: boolean;
  slot: number;
  flame: THREE.Sprite;
  trailAcc: number;
  /** O primeiro interceptador de um engajamento que acerta: a explosão grande vem da interceptação (no runtime). */
  kills: boolean;
  onLaunch: (at: THREE.Vector3) => void;
}

interface Puff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  age: number;
  life: number;
  vel: THREE.Vector3;
  size0: number;
  size1: number;
  peak: number;
}

/** Interceptador (Tamir): corpo branco fino, ogiva escura, aletas de cauda e canards. Aponta para +y. */
function interceptorGeometry(): THREE.BufferGeometry {
  const color = (g: THREE.BufferGeometry, c: string) => {
    const col = new THREE.Color(c);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g.toNonIndexed();
  };
  const parts = [color(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8), '#eceae4'), color(new THREE.ConeGeometry(0.045, 0.16, 8).translate(0, 0.43, 0), '#2e3134')];
  for (let i = 0; i < 4; i++) {
    parts.push(color(new THREE.BoxGeometry(0.006, 0.12, 0.09).translate(0, -0.29, 0.07).rotateY((i * Math.PI) / 2), '#7b7f82'));
    parts.push(color(new THREE.BoxGeometry(0.005, 0.05, 0.05).translate(0, 0.24, 0.06).rotateY((i * Math.PI) / 2 + Math.PI / 4), '#7b7f82'));
  }
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const SCALE = new THREE.Vector3(1.6, 1.6, 1.6);

/**
 * Interceptadores do Domo de Ferro. Cada engajamento dispara dois:
 * - saem de tubos dos lançadores na direção do casulo (clarão, sopro de fumaça no lançador);
 * - sobem quase na vertical e fazem a curva até o ponto em que o míssil vai estar, num arco suave (cúbica);
 * - deixam o rastro branco e grosso que fica pendurado no céu;
 * - o segundo sai pouco depois e chega logo após o primeiro.
 * O primeiro que acerta some no ponto de encontro (a explosão grande é do runtime, no evento de interceptação). Os
 * outros, ou os dois se o disparo falhou, se autodestroem com um estouro pequeno.
 */
export class DomeLayer {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly free: number[] = [];
  private readonly flames: THREE.Sprite[] = [];
  private readonly shots: Shot[] = [];
  private readonly puffs: Puff[] = [];
  private next = 0;
  private time = 0;
  /** Próximo tubo de cada bateria (para os disparos saírem de tubos diferentes). */
  private readonly tubeOf = new Map<number, number>();

  constructor(
    private readonly effects: Effects,
    capacity = 12,
    budget = 220,
  ) {
    this.mesh = new THREE.InstancedMesh(interceptorGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 }), capacity);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.free.push(capacity - 1 - i);
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffc46a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      flame.visible = false;
      this.group.add(flame);
      this.flames.push(flame);
    }
    this.group.add(this.mesh);
    const map = volumetricSmokeTexture();
    for (let i = 0; i < budget; i++) {
      const mat = new THREE.SpriteMaterial({ map, color: '#f1f0ec', transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, mat, age: 1, life: 1, vel: new THREE.Vector3(), size0: 1, size1: 1, peak: 0 });
    }
  }

  /**
   * Engajamento: a bateria `domeId` (centro `center` no mundo) dispara contra o ponto `meet`, saindo em `fireDelay` s e
   * chegando em `flight` s. `hit` diz se o primeiro interceptador derruba o míssil.
   */
  engage(o: { domeId: number; center: THREE.Vector3; meet: THREE.Vector3; fireDelay: number; flight: number; hit: boolean; onLaunch: (at: THREE.Vector3) => void }): void {
    const gap = Math.min(0.5, o.flight * 0.3);
    for (let i = 0; i < 2; i++) {
      const slot = this.free.pop();
      if (slot === undefined) return;
      const n = this.tubeOf.get(o.domeId) ?? 0;
      this.tubeOf.set(o.domeId, n + 1);
      const launcher = DOME_TUBES[n % DOME_TUBES.length]!;
      const mouth = launcher.mouths[Math.floor(n / DOME_TUBES.length) % launcher.mouths.length]!;
      const dir = new THREE.Vector3(...launcher.dir);
      const p0 = new THREE.Vector3(...mouth).add(o.center);
      const p3 = o.meet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4));
      const span = p0.distanceTo(p3);
      // sobe na direção do lançador e encurva até o alvo, chegando um pouco de baixo
      const p1 = p0.clone().addScaledVector(dir, span * 0.45);
      const p2 = p3
        .clone()
        .lerp(p1, 0.35)
        .setY(Math.min(p3.y, p1.y + (p3.y - p1.y) * 0.6));
      const launchAt = this.time + o.fireDelay + i * gap;
      const flight = Math.max(0.5, o.flight - i * gap + i * 0.15);
      this.shots.push({ launchAt, flight, p0, p1, p2, p3, launched: false, slot, flame: this.flames[slot]!, trailAcc: 0, kills: o.hit && i === 0, onLaunch: o.onLaunch });
    }
  }

  private bezier(s: Shot, k: number, out: THREE.Vector3): THREE.Vector3 {
    const u = 1 - k;
    return out
      .set(0, 0, 0)
      .addScaledVector(s.p0, u * u * u)
      .addScaledVector(s.p1, 3 * u * u * k)
      .addScaledVector(s.p2, 3 * u * k * k)
      .addScaledVector(s.p3, k * k * k);
  }

  update(dt: number): void {
    this.time += dt;
    let dirty = false;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      if (this.time < s.launchAt) continue;
      if (!s.launched) {
        s.launched = true;
        tmpA.copy(s.p0);
        this.effects.flash(tmpA, 0.5, '#fff1c8', 0.12);
        this.effects.light(tmpA, '#ffd9a0', 90, 10, 0.3);
        // sopro de fumaça no lançador
        for (let k = 0; k < 6; k++)
          this.emit(tmpA, {
            life: 2.5 + Math.random(),
            size0: 0.4,
            size1: 1.8,
            peak: 0.6,
            vx: (Math.random() - 0.5) * 1.6,
            vy: -0.2 + Math.random() * 0.4,
            vz: (Math.random() - 0.5) * 1.6,
          });
        s.onLaunch(tmpA);
      }
      // motor: aceleração forte no começo (k com saída rápida)
      const raw = Math.min(1, (this.time - s.launchAt) / s.flight);
      const k = 1 - Math.pow(1 - raw, 1.35);
      this.bezier(s, k, tmpA);
      this.bezier(s, Math.min(1, k + 0.02), tmpB);
      tmpB.sub(tmpA);
      if (tmpB.lengthSq() < 1e-9) tmpB.copy(UP);
      tmpB.normalize();
      tmpQ.setFromUnitVectors(UP, tmpB);
      tmpM.compose(tmpA, tmpQ, SCALE);
      this.mesh.setMatrixAt(s.slot, tmpM);
      dirty = true;
      // chama e rastro de fumaça (grosso, fica no céu)
      const tail = tmpB.multiplyScalar(-0.62).add(tmpA);
      s.flame.visible = true;
      s.flame.position.copy(tail);
      s.flame.scale.setScalar(0.55 + Math.random() * 0.25);
      s.trailAcc += dt;
      // rastro contínuo: puffs juntos e largos, mais densos quanto maior o orçamento de partículas
      const every = this.puffs.length >= 300 ? 0.011 : 0.018;
      while (s.trailAcc > every) {
        s.trailAcc -= every;
        tmpB.copy(tail).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12));
        this.emit(tmpB, {
          life: 7 + Math.random() * 3,
          size0: 0.55,
          size1: 2.3 + Math.random() * 0.8,
          peak: 0.62,
          vx: (Math.random() - 0.5) * 0.2,
          vy: -0.05,
          vz: 0.12 + (Math.random() - 0.5) * 0.2,
        });
      }
      if (raw >= 1) {
        // chegou: o que acerta some (a explosão vem com a interceptação); os outros se autodestroem
        if (!s.kills) {
          this.effects.flash(tmpA, 1.2, '#ffd59a', 0.18);
          for (let n = 0; n < 4; n++)
            this.emit(tmpA, {
              life: 4,
              size0: 0.6,
              size1: 2.2,
              peak: 0.55,
              vx: (Math.random() - 0.5) * 1.2,
              vy: (Math.random() - 0.5) * 0.6,
              vz: (Math.random() - 0.5) * 1.2,
              tone: 0.55,
            });
        }
        s.flame.visible = false;
        this.mesh.setMatrixAt(s.slot, HIDDEN);
        this.free.push(s.slot);
        this.shots.splice(i, 1);
        dirty = true;
      }
    }
    if (dirty || this.shots.length === 0) this.mesh.instanceMatrix.needsUpdate = true;
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 0.8));
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.sqrt(t));
      p.mat.opacity = Math.min(1, t * 15) * Math.pow(1 - t, 1.3) * p.peak;
      p.mat.rotation += dt * 0.2;
    }
  }

  private emit(at: THREE.Vector3, o: { life: number; size0: number; size1: number; peak: number; vx: number; vy: number; vz: number; tone?: number }): void {
    if (!this.puffs.length) return;
    const p = this.puffs[this.next]!;
    this.next = (this.next + 1) % this.puffs.length;
    p.sprite.position.copy(at);
    p.sprite.visible = true;
    p.mat.rotation = Math.random() * Math.PI * 2;
    const c = o.tone ?? 0.95;
    p.mat.color.setRGB(c, c * 0.99, c * 0.97);
    p.age = 0;
    p.life = o.life;
    p.vel.set(o.vx, o.vy, o.vz);
    p.size0 = o.size0;
    p.size1 = o.size1;
    p.peak = o.peak;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    for (const f of this.flames) f.material.dispose();
    for (const p of this.puffs) p.mat.dispose();
    this.shots.length = 0;
    this.group.removeFromParent();
  }
}
