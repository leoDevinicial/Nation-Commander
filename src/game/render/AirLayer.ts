import * as THREE from 'three';
import type { AirView } from '../../../shared/sim/snapshot.ts';
import type { Effects } from './Effects.ts';
import { factionColor } from './palette.ts';
import type { ModelLayers } from './models/kit.ts';
import { aircraftModel, missileModel } from './models/military.ts';
import { glowTexture, volumetricSmokeTexture } from './textures.ts';

type Flight = AirView['flights'][number];
type Launch = AirView['launches'][number];
type Kind = 'fighter' | 'recon' | 'transport' | 'missile';

const ALTITUDE = 7;
/** Formação em "V" (até 4 aeronaves por missão). */
const FORMATION: [number, number][] = [
  [0, 0],
  [-0.9, -0.8],
  [-0.9, 0.8],
  [-1.8, 0],
];

interface TrackedFlight {
  group: THREE.Group;
  prev: THREE.Vector2;
  curr: THREE.Vector2;
  heading: number;
  bob: number;
}

interface TrackedMissile {
  group: THREE.Group;
  glow: THREE.Sprite;
  flame: THREE.Group;
  prev: number;
  curr: number;
  snap: Launch;
  trailAcc: number;
  lightAcc: number;
  last: THREE.Vector3 | null;
}

/** Partícula do rastro (fumaça do motor e vapor do silo), de um conjunto fixo e reaproveitado. */
interface TrailPuff {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vel: THREE.Vector3;
  size0: number;
  size1: number;
  peak: number;
  tone: number;
}

/** Chama do motor: cone externo laranja e núcleo branco, apontando para trás (eixo −X). */
let flameGeo: THREE.ConeGeometry | null = null;
const flameMats: THREE.MeshBasicMaterial[] = [];
function flameMesh(): THREE.Group {
  if (!flameGeo) {
    flameGeo = new THREE.ConeGeometry(0.2, 1, 12, 1, true);
    flameGeo.rotateZ(Math.PI / 2);
    flameGeo.translate(-1, 0, 0);
    flameMats.push(
      new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
  }
  const g = new THREE.Group();
  const outer = new THREE.Mesh(flameGeo, flameMats[0]!);
  const inner = new THREE.Mesh(flameGeo, flameMats[1]!);
  inner.scale.set(0.55, 0.5, 0.5);
  inner.position.x = -0.22;
  g.add(outer, inner);
  return g;
}

const models = new Map<Kind, ModelLayers>();
function model(kind: Kind): ModelLayers {
  let m = models.get(kind);
  if (!m) {
    m = kind === 'missile' ? missileModel() : aircraftModel(kind);
    models.set(kind, m);
  }
  return m;
}

/**
 * Materiais próprios, sem a névoa de guerra dos materiais do mapa: uma aeronave nossa sobre área
 * inexplorada continua visível (a do inimigo só chega no snapshot quando está à vista).
 */
const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

function meshes(l: ModelLayers, owner: number, shadow: boolean): THREE.Group {
  const g = new THREE.Group();
  for (const [geo, m] of [
    [l.body, mat('body', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }))],
    [l.accent, mat(`accent-${owner}`, () => new THREE.MeshStandardMaterial({ color: factionColor(owner), roughness: 0.5, metalness: 0.2 }))],
    [l.glass, mat('glass', () => new THREE.MeshStandardMaterial({ color: '#3d4f5c', emissive: '#0b141a', roughness: 0.1, metalness: 0.7 }))],
  ] as const) {
    if (!geo.getAttribute('position')) continue;
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = shadow;
    g.add(mesh);
  }
  return g;
}

/** Anel no chão; `width` é a espessura relativa ao raio 1. */
function ring(color: string, opacity: number, width = 0.08): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 18;
  m.visible = false;
  return m;
}

/** Altura do arco balístico (cresce com a distância). */
const apex = (l: Launch) => Math.min(40, Math.max(12, Math.hypot(l.tx - l.fx, l.ty - l.fy) * 0.45));

/**
 * Posição do míssil no progresso `k` (0..1) do voo. O avanço horizontal começa lento (k^1,7):
 * o míssil sai quase na vertical do silo, faz um arco alto e mergulha íngreme sobre o alvo.
 */
export function missilePoint(l: Pick<Launch, 'fx' | 'fy' | 'tx' | 'ty'>, k: number, out = new THREE.Vector3()): THREE.Vector3 {
  const s = Math.pow(Math.max(0, Math.min(1, k)), 1.7);
  const h = apex(l as Launch);
  return out.set(l.fx + (l.tx - l.fx) * s, 0.6 + 4 * h * k * (1 - k), l.fy + (l.ty - l.fy) * s);
}

const AXIS = new THREE.Vector3(1, 0, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
/**
 * Força aérea e mísseis no mapa (Fase 7): aeronaves em formação na altitude de voo, com a cor da
 * nação; míssil subindo do silo na contagem final, voo em arco com rastro de fumaça e brilho do
 * motor; farol do silo em preparação (âmbar) e armado (vermelho); alvos marcados no chão (anel
 * pulsante) e o raio de ação da base durante a escolha de alvo.
 */
export class AirLayer {
  readonly group = new THREE.Group();
  private readonly flights = new Map<number, TrackedFlight>();
  private readonly missiles = new Map<number, TrackedMissile>();
  private readonly beacons = new Map<number, THREE.Sprite>();
  private readonly targetRings = new Map<number, THREE.Mesh>();
  private readonly rangeRing = ring('#f2c94c', 0.55);
  private readonly aimRing = ring('#ff5a4a', 0.9);
  private readonly waves: { mesh: THREE.Mesh; age: number; radius: number }[] = [];
  private launches: Launch[] = [];
  private time = 0;
  private readonly puffs: TrailPuff[] = [];
  private puffNext = 0;

  constructor(
    private readonly effects: Effects,
    private readonly mySlot: number,
    private readonly posOf: (id: number) => { x: number; y: number } | null,
    /** Partículas de rastro disponíveis (conjunto fixo; menos nos presets leves). */
    trailBudget = 140,
  ) {
    this.group.add(this.rangeRing, this.aimRing);
    const map = volumetricSmokeTexture();
    for (let i = 0; i < trailBudget; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: '#d9d6cf', transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, age: 1, life: 1, vel: new THREE.Vector3(), size0: 1, size1: 1, peak: 0, tone: 1 });
    }
  }

  /** Solta uma partícula de rastro (reaproveita a mais antiga quando o conjunto está cheio). */
  private emit(at: THREE.Vector3, o: { life: number; size0: number; size1: number; peak: number; tone: number; vx?: number; vy?: number; vz?: number }): void {
    if (!this.puffs.length) return;
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

  update(air: AirView): void {
    const seen = new Set<number>();
    for (const f of air.flights) {
      seen.add(f.id);
      let t = this.flights.get(f.id);
      const p = new THREE.Vector2(f.x, f.y);
      if (!t) {
        t = { group: this.formation(f), prev: p.clone(), curr: p.clone(), heading: f.heading, bob: Math.random() * 6 };
        this.group.add(t.group);
        this.flights.set(f.id, t);
      } else {
        t.prev.copy(t.curr);
        t.curr.copy(p);
        // aeronave perdida no caminho: a formação encolhe
        if (t.group.children.length !== Math.min(4, f.count)) {
          t.group.removeFromParent();
          t.group = this.formation(f);
          this.group.add(t.group);
        }
      }
      t.heading = f.heading;
    }
    for (const [id, t] of this.flights)
      if (!seen.has(id)) {
        t.group.removeFromParent();
        this.flights.delete(id);
      }

    this.launches = air.launches;
    const live = new Set<number>();
    for (const l of air.launches) {
      if (l.state !== 'flight' && l.state !== 'launching') continue;
      live.add(l.id);
      let m = this.missiles.get(l.id);
      if (!m) {
        const group = meshes(model('missile'), l.owner, false);
        // um pouco maior que a escala real: precisa ser legível com a câmera afastada
        group.scale.setScalar(2.4);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb36b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(1.4);
        glow.position.set(-0.55, 0, 0);
        group.add(glow);
        const flame = flameMesh();
        flame.visible = false;
        group.add(flame);
        this.group.add(group);
        m = { group, glow, flame, prev: l.progress, curr: l.progress, snap: l, trailAcc: 0, lightAcc: 0, last: null };
        this.missiles.set(l.id, m);
      } else {
        m.prev = m.snap.state === l.state ? m.curr : 0;
        m.curr = l.progress;
        m.snap = l;
      }
    }
    for (const [id, m] of this.missiles)
      if (!live.has(id)) {
        m.group.removeFromParent();
        (m.glow.material as THREE.SpriteMaterial).dispose();
        this.missiles.delete(id);
      }

    // faróis dos silos (só os próprios) e anéis dos alvos (próprios e mísseis vindo contra nós)
    const silos = new Set<number>();
    const targets = new Set<number>();
    for (const l of air.launches) {
      if (l.owner === this.mySlot && (l.state === 'preparing' || l.state === 'armed')) silos.add(l.siloId);
      const mineOrIncoming = l.owner === this.mySlot || l.targetOwner === this.mySlot;
      if (mineOrIncoming && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching' || l.state === 'flight')) targets.add(l.id);
    }
    for (const id of silos)
      if (!this.beacons.has(id)) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb000', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.scale.setScalar(1.2);
        this.group.add(sp);
        this.beacons.set(id, sp);
      }
    for (const [id, sp] of this.beacons)
      if (!silos.has(id)) {
        sp.removeFromParent();
        (sp.material as THREE.SpriteMaterial).dispose();
        this.beacons.delete(id);
      }
    for (const l of air.launches)
      if (targets.has(l.id) && !this.targetRings.has(l.id)) {
        const r = ring(l.owner === this.mySlot ? '#ff7a4a' : '#ff3030', 0.85);
        r.visible = true;
        r.position.set(l.tx, 0.3, l.ty);
        this.group.add(r);
        this.targetRings.set(l.id, r);
      }
    for (const [id, r] of this.targetRings)
      if (!targets.has(id)) {
        r.removeFromParent();
        r.geometry.dispose();
        (r.material as THREE.Material).dispose();
        this.targetRings.delete(id);
      }
  }

  private formation(f: Flight): THREE.Group {
    const g = new THREE.Group();
    const kind: Kind = f.kind === 'recon' ? 'recon' : 'fighter';
    for (let i = 0; i < Math.min(4, f.count); i++) {
      const m = meshes(model(kind), f.owner, false);
      const [dx, dz] = FORMATION[i]!;
      m.position.set(dx * 1.2, i * 0.15, dz * 1.2);
      g.add(m);
    }
    return g;
  }

  /** Raio de ação (base ou silo) e alvo marcado durante a escolha de alvo. */
  setTargeting(range: { x: number; y: number; r: number } | null, aim: { x: number; y: number; r: number } | null): void {
    this.rangeRing.visible = !!range;
    if (range) {
      this.rangeRing.position.set(range.x, 0.35, range.y);
      if (this.rangeRing.scale.x !== range.r) {
        // espessura fixa (~0,6 unidade) qualquer que seja o raio de ação
        this.rangeRing.geometry.dispose();
        this.rangeRing.geometry = new THREE.RingGeometry(1 - 0.6 / range.r, 1, 128);
        this.rangeRing.scale.setScalar(range.r);
      }
    }
    this.aimRing.visible = !!aim;
    if (aim) {
      this.aimRing.position.set(aim.x, 0.4, aim.y);
      this.aimRing.scale.setScalar(aim.r);
    }
  }

  frame(alpha: number, dt: number): void {
    this.time += dt;
    for (const t of this.flights.values()) {
      t.bob += dt;
      const x = t.prev.x + (t.curr.x - t.prev.x) * alpha;
      const y = t.prev.y + (t.curr.y - t.prev.y) * alpha;
      t.group.position.set(x, ALTITUDE + Math.sin(t.bob * 1.3) * 0.15, y);
      t.group.rotation.set(Math.sin(t.bob * 0.9) * 0.06, -t.heading, 0);
    }
    for (const m of this.missiles.values()) {
      const l = m.snap;
      const k = Math.min(1, m.prev + (m.curr - m.prev) * alpha);
      if (l.state === 'launching') this.frameLaunching(m, l, k, dt);
      else this.frameFlight(m, l, k, dt);
    }
    this.framePuffs(dt);
    for (const [id, sp] of this.beacons) {
      const p = this.posOf(id);
      if (!p) continue;
      const armed = this.launches.some((l) => l.siloId === id && l.state === 'armed');
      sp.position.set(p.x + 0.75, 0.95, p.y + 0.75);
      const mat = sp.material as THREE.SpriteMaterial;
      mat.color.set(armed ? '#ff2a1a' : '#ffb000');
      mat.opacity = armed ? (Math.sin(this.time * 9) > 0 ? 1 : 0.15) : 0.45 + Math.sin(this.time * 3) * 0.4;
    }
    for (const r of this.targetRings.values()) {
      const pulse = 1 + 0.25 * Math.sin(this.time * 5);
      r.scale.setScalar(4 * pulse);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(this.time * 5);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.age += dt;
      const k = Math.min(1, w.age / 0.8);
      w.mesh.scale.setScalar(0.5 + w.radius * 1.6 * k);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (k >= 1) {
        w.mesh.removeFromParent();
        w.mesh.geometry.dispose();
        (w.mesh.material as THREE.Material).dispose();
        this.waves.splice(i, 1);
      }
    }
    if (this.aimRing.visible) (this.aimRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * Math.sin(this.time * 6);
  }

  /**
   * Contagem final (3 s): o míssil sobe devagar na boca do silo, de pé; vapor escapa rente ao
   * chão e, no último segundo, a base acende (pré-ignição).
   */
  private frameLaunching(m: TrackedMissile, l: Launch, k: number, dt: number): void {
    m.group.position.set(l.fx, -0.4 + k * 1.3, l.fy + 0.1);
    m.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const pre = Math.max(0, (k - 0.65) / 0.35);
    m.flame.visible = pre > 0;
    m.flame.scale.set(0.3 + pre * 0.6 * (0.8 + Math.random() * 0.4), 1 + pre, 1 + pre);
    m.glow.visible = pre > 0;
    m.glow.scale.setScalar(1 + pre * 2.5);
    (m.glow.material as THREE.SpriteMaterial).opacity = pre;
    m.trailAcc += dt;
    if (m.trailAcc > 0.06) {
      m.trailAcc = 0;
      const a = Math.random() * Math.PI * 2;
      const v = 1.4 + Math.random() * 1.4 + pre * 2;
      this.emit(tmpA.set(l.fx, 0.25, l.fy + 0.1), { life: 1.6 + pre, size0: 0.8, size1: 3 + pre * 2.5, peak: 0.7, tone: 1, vx: Math.cos(a) * v, vy: 0.4 + pre, vz: Math.sin(a) * v });
    }
    if (pre > 0) {
      m.lightAcc += dt;
      if (m.lightAcc > 0.15) {
        m.lightAcc = 0;
        this.effects.light(tmpA.set(l.fx, 0.8, l.fy), '#ffb36b', 40 + pre * 120, 14, 0.2);
      }
    }
  }

  /**
   * Voo: chama tremulando, rastro contínuo de fumaça (uma partícula a cada ~0,3 unidade
   * percorrida, que se alarga e fica no ar alguns segundos), luz do motor sobre o chão e, na
   * descida final, o brilho branco da reentrada.
   */
  private frameFlight(m: TrackedMissile, l: Launch, k: number, dt: number): void {
    const pos = missilePoint(l, k, tmpA);
    const ahead = missilePoint(l, Math.min(1, k + 0.004), tmpB);
    const dir = ahead.sub(pos);
    if (dir.lengthSq() > 1e-8) m.group.quaternion.setFromUnitVectors(AXIS, dir.normalize());
    m.group.position.copy(pos);
    const reentry = Math.max(0, (k - 0.8) / 0.2);
    const flicker = 0.8 + Math.random() * 0.45;
    m.flame.visible = true;
    m.flame.scale.set((1.3 - reentry * 0.6) * flicker, 1.15, 1.15);
    m.glow.visible = true;
    m.glow.scale.setScalar(1.6 + reentry * 1.8 + Math.random() * 0.3);
    const gm = m.glow.material as THREE.SpriteMaterial;
    gm.color.set(reentry > 0 ? '#fff1d6' : '#ffb36b');
    gm.opacity = 0.8 + Math.sin(this.time * 40) * 0.2;
    // rastro por distância percorrida: contínuo mesmo com quadros lentos
    const tail = pos.clone().addScaledVector(dir, -0.9 * m.group.scale.x);
    if (!m.last) m.last = tail.clone();
    const gap = m.last.distanceTo(tail);
    const steps = Math.min(12, Math.floor(gap / 0.3));
    for (let i = 1; i <= steps; i++) {
      const at = m.last.clone().lerp(tail, i / steps);
      this.emit(at, { life: 3.6 + Math.random(), size0: 0.7, size1: 3.6, peak: 0.8 * (1 - reentry * 0.4), tone: 0.9, vx: 0.5, vy: 0.15, vz: 0.2 });
    }
    if (steps > 0) m.last.copy(tail);
    m.lightAcc += dt;
    if (m.lightAcc > 0.12) {
      m.lightAcc = 0;
      this.effects.light(pos, reentry > 0 ? '#ffe9c8' : '#ffb36b', 70, 18, 0.16);
    }
  }

  /** Anima o rastro: cada partícula se alarga, sobe um pouco com o vento e esmaece. */
  private framePuffs(dt: number): void {
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 1.5));
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.pow(t, 0.5));
      const mat = p.sprite.material;
      const c = p.tone * (0.92 - t * 0.12);
      mat.color.setRGB(c, c * 0.985, c * 0.96);
      mat.opacity = Math.min(1, t * 12) * Math.pow(1 - t, 1.6) * p.peak;
      mat.rotation += dt * 0.25;
    }
  }

  /** Onda de choque do impacto: anel que se abre rente ao chão. */
  shockwave(at: { x: number; y: number }, radius: number): void {
    const r = ring('#ffd9a0', 0.9);
    r.visible = true;
    r.position.set(at.x, 0.25, at.y);
    this.group.add(r);
    this.waves.push({ mesh: r, age: 0, radius });
  }

  dispose(): void {
    for (const t of this.flights.values()) t.group.removeFromParent();
    this.flights.clear();
    for (const m of this.missiles.values()) {
      m.group.removeFromParent();
      (m.glow.material as THREE.SpriteMaterial).dispose();
    }
    this.missiles.clear();
    for (const sp of this.beacons.values()) (sp.material as THREE.SpriteMaterial).dispose();
    for (const p of this.puffs) p.sprite.material.dispose();
    this.puffs.length = 0;
    this.beacons.clear();
    for (const r of [...this.targetRings.values(), ...this.waves.map((w) => w.mesh), this.rangeRing, this.aimRing]) {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    }
    this.targetRings.clear();
    this.waves.length = 0;
    this.group.removeFromParent();
  }
}

export function disposeAirModels(): void {
  for (const m of models.values()) for (const g of [m.body, m.accent, m.glass]) g.dispose();
  models.clear();
  for (const m of mats.values()) m.dispose();
  mats.clear();
  flameGeo?.dispose();
  flameGeo = null;
  for (const m of flameMats) m.dispose();
  flameMats.length = 0;
}
