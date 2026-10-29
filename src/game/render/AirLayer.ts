import * as THREE from 'three';
import type { AirView } from '../../../shared/sim/snapshot.ts';
import type { Effects } from './Effects.ts';
import { factionColor } from './palette.ts';
import type { ModelLayers } from './models/kit.ts';
import { aircraftModel, missileModel } from './models/military.ts';
import { glowTexture, volumetricSmokeTexture } from './textures.ts';

type Flight = AirView['flights'][number];
type Launch = AirView['launches'][number];
type Kind = 'fighter' | 'gripen' | 'bomber' | 'recon' | 'transport' | 'missile' | 'missile2';

const ALTITUDE = 7;
/** Altitude no fundo do mergulho de ataque. */
const DIVE_ALTITUDE = 2.4;
/** Raio (a partir do alvo) em que a esquadrilha entra em fila e mergulha. */
const ATTACK_RADIUS = 16;
/** Raio (a partir da base) da decolagem e do pouso. */
const AIRFIELD_RADIUS = 10;
/** Raio das curvas da esquadrilha (a volta no alvo vira uma curva em U, não uma inversão seca). */
const TURN_RADIUS = 6.5;
/** Combate aéreo: raio e velocidade angular da órbita das esquadrilhas engajadas. */
const DOGFIGHT_ORBIT = 4.5;
const DOGFIGHT_SPIN = 1.3;
/** Bombardeio em tapete: bombas por bombardeiro, altura de soltura e tempo de queda (s). */
const BOMBS_PER_BOMBER = 6;
const BOMB_DROP_ALT = 7.5;
const BOMB_FALL = 1.05;
/** Formação em "V" (até 4 aeronaves por missão): (atrás, lado). */
const FORMATION: [number, number][] = [
  [0, 0],
  [-1.3, -1.25],
  [-1.3, 1.25],
  [-2.6, 0],
];

interface Plane {
  group: THREE.Group;
  glow: THREE.Sprite;
  prevLat: number;
  prevAlt: number;
  trailAcc: number;
}

/**
 * Esquadrilha em voo. O servidor dá só o centro da missão (ida em linha reta e volta); aqui a
 * esquadrilha o persegue com curvas de raio limitado, inclina nas curvas, decola e pousa, entra em
 * fila e mergulha sobre o alvo, e os alas trocam de lado e fazem tonneaux — tudo cosmético.
 */
interface TrackedFlight {
  snap: Flight;
  planes: Plane[];
  prev: THREE.Vector2;
  curr: THREE.Vector2;
  /** Centro de referência no quadro anterior (para a velocidade do servidor). */
  lastC: THREE.Vector2 | null;
  pos: THREE.Vector2;
  heading: number;
  turn: number;
  speed: number;
  alt: number;
  /** Tempo próprio (manobras defasadas entre esquadrilhas). */
  t: number;
  phase: number;
}

/** Bomba em queda (visual): parte do bombardeiro e explode no chão. */
interface Bomb {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  delay: number;
  onImpact: (at: THREE.Vector3, index: number) => void;
  index: number;
}

/** Destroço de uma aeronave abatida: cai girando e soltando fumaça preta. */
interface Wreck {
  plane: Plane | null;
  group: THREE.Group;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  smokeAcc: number;
}

let bombGeo: THREE.BufferGeometry | null = null;
let bombMat: THREE.MeshStandardMaterial | null = null;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Diferença angular em (−π, π]. */
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

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
    m = kind === 'missile' ? missileModel(1) : kind === 'missile2' ? missileModel(2) : aircraftModel(kind);
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
/** Escala do míssil pesado (2ª geração) e a distância da base ao centro do modelo (unidades do modelo). */
const MISSILE2_SCALE = 3;
const MISSILE2_BASE = 0.64;
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

  /** Posição desenhada (interpolada) de uma formação, para a névoa acompanhar o avião na tela. */
  flightPosition(id: number): { x: number; y: number } | null {
    const f = this.flights.get(id);
    return f ? { x: f.pos.x, y: f.pos.y } : null;
  }
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
  private readonly bombs: Bomb[] = [];
  private readonly wrecks: Wreck[] = [];
  /**
   * Aviões que saíram do snapshot (abatidos, pousados ou fora da vista), escondidos por um
   * instante: se o evento de abate chegar, viram destroço de onde estavam; senão são descartados.
   */
  private readonly orphans: { pl: Plane; owner: number; age: number }[] = [];

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

  update(air: AirView): void {
    const seen = new Set<number>();
    for (const f of air.flights) {
      seen.add(f.id);
      let t = this.flights.get(f.id);
      const p = new THREE.Vector2(f.x, f.y);
      if (!t) {
        t = { snap: f, planes: [], prev: p.clone(), curr: p.clone(), lastC: null, pos: p.clone(), heading: f.heading, turn: 0, speed: 0, alt: 0, t: 0, phase: (f.id * 2.399) % 6.283 };
        // decolando: começa na pista, se ainda estiver perto da base
        t.alt = Math.hypot(f.x - f.bx, f.y - f.by) < AIRFIELD_RADIUS ? 0.4 : ALTITUDE;
        this.flights.set(f.id, t);
      } else {
        t.prev.copy(t.curr);
        t.curr.copy(p);
      }
      // aeronave perdida no caminho (ou troca de modelo): a formação é refeita
      const want = Math.min(4, f.count);
      if (want < t.planes.length && t.snap.gen === f.gen && t.snap.plane === f.plane) for (const pl of t.planes.splice(want)) this.orphan(pl, f.owner);
      else if (t.planes.length !== want || t.snap.gen !== f.gen || t.snap.plane !== f.plane) this.rebuildPlanes(t, f);
      t.snap = f;
    }
    for (const [id, t] of this.flights)
      if (!seen.has(id)) {
        for (const pl of t.planes) this.orphan(pl, t.snap.owner);
        this.flights.delete(id);
      }

    this.launches = air.launches;
    const live = new Set<number>();
    for (const l of air.launches) {
      // o míssil pesado (2ª geração) aparece já no abastecimento: sobe do silo e fica de pé na torre
      const standing = l.gen >= 2 && (l.state === 'preparing' || l.state === 'armed');
      if (l.state !== 'flight' && l.state !== 'launching' && !standing) continue;
      live.add(l.id);
      let m = this.missiles.get(l.id);
      if (!m) {
        const group = meshes(model(l.gen >= 2 ? 'missile2' : 'missile'), l.owner, l.gen >= 2);
        // um pouco maior que a escala real: precisa ser legível com a câmera afastada
        group.scale.setScalar(l.gen >= 2 ? MISSILE2_SCALE : 2.4);
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

  private rebuildPlanes(t: TrackedFlight, f: Flight): void {
    for (const pl of t.planes) this.disposePlane(pl);
    t.planes = [];
    const kind: Kind = f.kind === 'recon' ? 'recon' : f.plane === 'bomber' ? 'bomber' : f.gen >= 2 ? 'gripen' : 'fighter';
    for (let i = 0; i < Math.min(4, f.count); i++) {
      const group = new THREE.Group();
      group.add(meshes(model(kind), f.owner, false));
      // brilho do motor (pós-combustor) atrás de cada caça
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb46a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(kind === 'bomber' ? -0.8 : kind === 'gripen' ? -1.1 : -0.95, kind === 'bomber' ? -0.16 : 0, 0);
      glow.scale.setScalar(kind === 'bomber' ? 0.6 : 0.45);
      group.add(glow);
      this.group.add(group);
      t.planes.push({ group, glow, prevLat: 0, prevAlt: 0, trailAcc: Math.random() * 0.1 });
    }
  }

  private orphan(pl: Plane, owner: number): void {
    pl.group.visible = false;
    this.orphans.push({ pl, owner, age: 0 });
  }

  private disposePlane(pl: Plane): void {
    pl.group.removeFromParent();
    (pl.glow.material as THREE.SpriteMaterial).dispose();
  }

  /**
   * Um quadro da esquadrilha: perseguição do centro do servidor com curvas de raio limitado,
   * altitude (decolagem, cruzeiro, mergulho de ataque, pouso) e a coreografia dos alas.
   */
  private frameSquadron(t: TrackedFlight, alpha: number, dt: number): void {
    const f = t.snap;
    t.t += dt;
    let cx = t.prev.x + (t.curr.x - t.prev.x) * alpha;
    let cy = t.prev.y + (t.curr.y - t.prev.y) * alpha;
    // velocidade do servidor, suavizada (some quando o jogo está pausado)
    if (t.lastC && dt > 0) t.speed += (Math.hypot(cx - t.lastC.x, cy - t.lastC.y) / dt - t.speed) * Math.min(1, dt * 3);
    t.lastC = (t.lastC ?? new THREE.Vector2()).set(cx, cy);
    const bomber = f.plane === 'bomber';
    if (f.engaged && dt > 0) {
      // combate aéreo: o centro fica parado no servidor; a esquadrilha circula em volta dele,
      // as duas em sentidos opostos, cruzando-se a cada volta
      const dir = f.owner % 2 ? 1 : -1;
      const ang = t.t * DOGFIGHT_SPIN * dir + t.phase;
      cx += Math.cos(ang) * DOGFIGHT_ORBIT;
      cy += Math.sin(ang) * DOGFIGHT_ORBIT;
      t.speed += (DOGFIGHT_ORBIT * DOGFIGHT_SPIN * 1.1 - t.speed) * Math.min(1, dt * 2);
    }
    const dx = cx - t.pos.x;
    const dy = cy - t.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 40) {
      // salto grande (entrou na tela, reconexão): reposiciona sem voar o caminho
      t.pos.set(cx, cy);
      t.heading = f.heading;
    } else if (t.speed > 0.05 || dist > 0.2) {
      // persegue um ponto um pouco à frente do centro, com raio de curva limitado
      const lead = 0.5;
      const ax = cx + Math.cos(f.heading) * t.speed * lead - t.pos.x;
      const ay = cy + Math.sin(f.heading) * t.speed * lead - t.pos.y;
      const want = Math.hypot(ax, ay) > 0.3 ? Math.atan2(ay, ax) : f.heading;
      const v = Math.min(t.speed * 2.4 + 3, t.speed + dist * 1.3);
      const maxTurn = Math.max(1.2, v / TURN_RADIUS);
      const d = angDiff(want, t.heading);
      const step = Math.max(-maxTurn * dt, Math.min(maxTurn * dt, d));
      t.heading += step;
      t.turn += ((dt > 0 ? step / dt : 0) - t.turn) * Math.min(1, dt * 4);
      t.pos.x += Math.cos(t.heading) * v * dt;
      t.pos.y += Math.sin(t.heading) * v * dt;
    }
    // altitude: decolagem/pouso perto da base e mergulho perto do alvo
    const nearBase = smooth(1.5, AIRFIELD_RADIUS, Math.hypot(t.pos.x - f.bx, t.pos.y - f.by));
    let dive = 0;
    if (f.kind === 'strike' && !bomber && f.tx !== undefined && f.ty !== undefined) {
      const dt2 = Math.hypot(t.pos.x - f.tx, t.pos.y - f.ty);
      dive = f.state === 'outbound' ? smooth(ATTACK_RADIUS, 4, dt2) : smooth(ATTACK_RADIUS * 0.8, 2, dt2);
    }
    const wantAlt = 0.35 + (ALTITUDE + (f.kind === 'recon' ? 1.5 : bomber ? 0.8 : 0) - 0.35) * nearBase;
    const targetAlt = wantAlt + (DIVE_ALTITUDE - wantAlt) * dive * nearBase;
    const prevAlt = t.alt;
    t.alt += (targetAlt - t.alt) * Math.min(1, dt * 1.6);
    const climb = dt > 0 ? (t.alt - prevAlt) / dt : 0;
    const groundSpeed = Math.max(4, t.speed);
    const pitch = Math.atan2(climb, groundSpeed) * 1.4;
    const bank = Math.max(-1.15, Math.min(1.15, t.turn * 0.55));
    const fwdX = Math.cos(t.heading);
    const fwdY = Math.sin(t.heading);
    // lado direito no plano do mapa (+z do modelo)
    const rgtX = -fwdY;
    const rgtY = fwdX;
    // bombardeiros voam em formação rígida e larga, sem acrobacias
    const cruise = bomber ? 0 : nearBase * (1 - dive);
    const spread = bomber ? 2.5 : 1;
    for (let i = 0; i < t.planes.length; i++) {
      const pl = t.planes[i]!;
      const [back, side] = FORMATION[i]!;
      const tt = t.t + t.phase;
      let lat = side * spread;
      let along = back * spread;
      let up = i * 0.12;
      let roll = 0;
      if (i > 0) {
        // vaivém suave de cada ala
        lat += 0.3 * Math.sin(tt * 0.9 + i * 1.7) * cruise;
        up += 0.22 * Math.sin(tt * 0.7 + i * 2.3) * cruise;
      }
      if (i === 1 || i === 2) {
        // cruzamento: os dois alas trocam de lado (um passa por cima do outro)
        const tri = Math.abs(((tt / 9) % 1) - 0.5) * 2;
        const sw = smooth(0.3, 0.7, tri);
        lat *= 1 - 2 * sw * cruise;
        up += 0.55 * Math.sin(Math.PI * sw) * (i === 1 ? 1 : -1) * cruise;
      }
      // tonneau: a cada ~13 s, um giro completo com uma pequena hélice
      const rollCycle = (tt + i * 3.1) / 13;
      const q = smooth(0.82, 0.97, rollCycle % 1) * cruise;
      if (q > 0 && q < 1) {
        roll = Math.PI * 2 * q;
        up += 0.3 * Math.sin(Math.PI * 2 * q);
        lat += 0.3 * (1 - Math.cos(Math.PI * 2 * q)) * (i % 2 ? -1 : 1);
      }
      // ataque: a formação vira fila e os aviões mergulham um atrás do outro
      lat *= 1 - dive;
      along = along * (1 - dive) - i * 2.2 * dive;
      up = up * (1 - dive) + i * 0.5 * dive;
      // decolagem/pouso: fila indiana sobre a pista
      lat *= nearBase;
      along = along * nearBase - i * 1.6 * spread * (1 - nearBase);
      const x = t.pos.x + fwdX * along + rgtX * lat;
      const y = t.pos.y + fwdY * along + rgtY * lat;
      const alt = t.alt + up * nearBase;
      const latVel = dt > 0 ? (lat - pl.prevLat) / dt : 0;
      pl.prevLat = lat;
      pl.prevAlt = alt;
      pl.group.position.set(x, alt, y);
      // guinada, depois arfagem, depois rolagem (inclina para dentro das curvas e das trocas)
      pl.group.rotation.set(bank + Math.max(-0.6, Math.min(0.6, latVel * 0.35)) + roll, -t.heading, pitch, 'YZX');
      const glowMat = pl.glow.material as THREE.SpriteMaterial;
      glowMat.opacity = 0.55 + Math.random() * 0.3 + dive * 0.2;
      pl.glow.scale.setScalar(0.4 + dive * 0.25 + Math.random() * 0.06);
      // rastro leve dos motores (mais denso no mergulho e na recuperação)
      if (alt > 1) {
        pl.trailAcc += dt;
        if (pl.trailAcc > (dive > 0.2 ? 0.05 : 0.11)) {
          pl.trailAcc = 0;
          const tail = new THREE.Vector3(-1, 0, 0).applyEuler(pl.group.rotation).multiplyScalar(1.1).add(pl.group.position);
          this.emit(tail, { life: 0.9 + dive * 0.6, size0: 0.18, size1: 0.9, peak: 0.35 + dive * 0.2, tone: 1 });
        }
      }
    }
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
    for (const t of this.flights.values()) this.frameSquadron(t, alpha, dt);
    for (const m of this.missiles.values()) {
      const l = m.snap;
      const k = Math.min(1, m.prev + (m.curr - m.prev) * alpha);
      if (l.state === 'preparing' || l.state === 'armed') this.frameStanding(m, l, l.state === 'armed' ? 1 : k, dt);
      else if (l.state === 'launching') this.frameLaunching(m, l, k, dt);
      else this.frameFlight(m, l, k, dt);
    }
    this.framePuffs(dt);
    this.frameBombs(dt);
    this.frameWrecks(dt);
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
   * Míssil pesado no abastecimento: o elevador o traz do fundo do silo até ficar de pé entre as
   * torres (primeiros 45%); depois o propelente criogênico solta vapor branco pelos respiros, que
   * escorre e se espalha. Armado, o vapor continua em lufadas mais espaçadas.
   */
  private frameStanding(m: TrackedMissile, l: Launch, k: number, dt: number): void {
    const len = (MISSILE2_BASE + 0.83) * MISSILE2_SCALE;
    // a tampa do silo abre primeiro; o elevador só sobe depois
    const rise = smooth(0.16, 0.55, k);
    const base = -len + (len + 0.3) * rise;
    m.group.position.set(l.fx, base + MISSILE2_BASE * MISSILE2_SCALE, l.fy + 0.1);
    m.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    m.flame.visible = false;
    m.glow.visible = false;
    if (rise < 1) return;
    m.trailAcc += dt;
    const every = k >= 1 ? 0.28 : 0.1;
    if (m.trailAcc > every) {
      m.trailAcc = 0;
      const side = Math.random() < 0.5 ? -1 : 1;
      const h = 0.3 + (0.35 + Math.random() * 0.45) * len;
      this.emit(tmpA.set(l.fx + side * 0.2, h, l.fy + 0.1 + (Math.random() - 0.5) * 0.3), {
        life: 2.2 + Math.random(),
        size0: 0.35,
        size1: 1.6 + Math.random(),
        peak: 0.55,
        tone: 1.05,
        vx: side * (0.5 + Math.random() * 0.5),
        vy: -0.35,
        vz: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  /**
   * Contagem final (3 s): o míssil sobe devagar na boca do silo, de pé; vapor escapa rente ao
   * chão e, no último segundo, a base acende (pré-ignição). O pesado já está de pé na torre: a
   * pré-ignição começa antes, com mais fumaça e luz, e a estrutura treme.
   */
  private frameLaunching(m: TrackedMissile, l: Launch, k: number, dt: number): void {
    if (l.gen >= 2) {
      const len = (MISSILE2_BASE + 0.83) * MISSILE2_SCALE;
      const pre = Math.max(0, (k - 0.35) / 0.65);
      const shake = pre * pre * 0.05;
      m.group.position.set(l.fx + (Math.random() - 0.5) * shake, 0.3 + MISSILE2_BASE * MISSILE2_SCALE + pre * pre * 0.5, l.fy + 0.1 + (Math.random() - 0.5) * shake);
      m.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      m.flame.visible = pre > 0;
      m.flame.scale.set(0.4 + pre * 0.9 * (0.8 + Math.random() * 0.4), 1 + pre * 0.6, 1 + pre * 0.6);
      m.glow.visible = pre > 0;
      m.glow.scale.setScalar(1 + pre * 3.2);
      (m.glow.material as THREE.SpriteMaterial).opacity = pre;
      m.trailAcc += dt;
      if (m.trailAcc > 0.04) {
        m.trailAcc = 0;
        // o jato bate no defletor e sai em leque pela frente, rolando pelo chão
        for (let i = 0; i < (pre > 0 ? 2 : 1); i++) {
          const a = Math.PI / 2 + (Math.random() - 0.5) * 2.2;
          const v = 1.6 + Math.random() * 1.6 + pre * 4;
          this.emit(tmpA.set(l.fx, 0.3, l.fy + 0.6), { life: 2 + pre * 2, size0: 1, size1: 3.6 + pre * 3.5, peak: 0.75, tone: 1, vx: Math.cos(a) * v, vy: 0.3 + pre * 1.2, vz: Math.sin(a) * v });
        }
        if (pre === 0) this.emit(tmpA.set(l.fx + 0.2, 0.3 + len * 0.6, l.fy + 0.1), { life: 1.8, size0: 0.35, size1: 1.4, peak: 0.45, tone: 1.05, vx: 0.6, vy: -0.3 });
      }
      if (pre > 0) {
        m.lightAcc += dt;
        if (m.lightAcc > 0.12) {
          m.lightAcc = 0;
          this.effects.light(tmpA.set(l.fx, 1, l.fy), '#ffc27a', 80 + pre * 220, 22, 0.18);
        }
      }
      return;
    }
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
    // o pesado sai de pé da torre (centro mais alto): a diferença some no começo da subida
    if (l.gen >= 2) {
      const lift = 1.7 * Math.pow(1 - Math.min(1, k * 8), 2);
      pos.y += lift;
      ahead.y += 1.7 * Math.pow(1 - Math.min(1, (k + 0.004) * 8), 2);
    }
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
      const heavy = l.gen >= 2 ? 1.45 : 1;
      this.emit(at, { life: (3.6 + Math.random()) * heavy, size0: 0.7 * heavy, size1: 3.6 * heavy, peak: 0.8 * (1 - reentry * 0.4), tone: 0.9, vx: 0.5, vy: 0.15, vz: 0.2 });
    }
    if (steps > 0) m.last.copy(tail);
    m.lightAcc += dt;
    if (m.lightAcc > 0.12) {
      m.lightAcc = 0;
      this.effects.light(pos, reentry > 0 ? '#ffe9c8' : '#ffb36b', l.gen >= 2 ? 120 : 70, l.gen >= 2 ? 26 : 18, 0.16);
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

  /** Aviões em voo (posição no mundo) de uma missão; vazio se ela não está à vista. */
  private planesOf(missionId: number): THREE.Group[] {
    return this.flights.get(missionId)?.planes.map((p) => p.group) ?? [];
  }

  /**
   * Um disparo do combate aéreo: rajada de traçantes de um avião da esquadrilha atiradora até um
   * avião da outra (ou entre os centros, se uma delas não está à vista).
   */
  dogfightShot(e: { missionId: number; targetMissionId: number; from: { x: number; y: number }; to: { x: number; y: number }; kill: boolean }): void {
    const shooters = this.planesOf(e.missionId);
    const victims = this.planesOf(e.targetMissionId);
    const from = shooters.length ? shooters[Math.floor(Math.random() * shooters.length)]!.position.clone() : new THREE.Vector3(e.from.x, ALTITUDE, e.from.y);
    const to = victims.length ? victims[Math.floor(Math.random() * victims.length)]!.position.clone() : new THREE.Vector3(e.to.x, ALTITUDE, e.to.y);
    // a rajada sai do nariz e erra por pouco (o abate é decidido no servidor)
    const dir = to.clone().sub(from).normalize();
    const nose = from.clone().addScaledVector(dir, 0.8);
    for (let i = 0; i < 3; i++) {
      const miss = e.kill && i === 2 ? 0 : 0.6;
      const end = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * miss, (Math.random() - 0.5) * miss, (Math.random() - 0.5) * miss));
      this.effects.tracer(nose, end, false);
    }
    if (e.kill) this.effects.flash(to, 0.8, '#ffd38a', 0.2);
  }

  /**
   * Aeronave abatida no ar: explode onde está o avião mais próximo do ponto do servidor e o
   * destroço cai girando com um rastro de fumaça preta. Devolve onde explodiu.
   */
  planeDown(at: { x: number; y: number }, owner: number): THREE.Vector3 {
    let best = -1;
    let bestD = 25;
    this.orphans.forEach((o, i) => {
      const d = Math.hypot(o.pl.group.position.x - at.x, o.pl.group.position.z - at.y);
      if (o.owner === owner && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return new THREE.Vector3(at.x, ALTITUDE, at.y);
    const pl = this.orphans.splice(best, 1)[0]!.pl;
    pl.group.visible = true;
    pl.glow.visible = false;
    const fwd = new THREE.Vector3(1, 0, 0).applyEuler(pl.group.rotation);
    this.wrecks.push({ plane: pl, group: pl.group, vel: fwd.multiplyScalar(4).setY(-0.5), spin: new THREE.Vector3(3 + Math.random() * 3, 0.6, 1.2), smokeAcc: 0 });
    return pl.group.position.clone();
  }

  private frameWrecks(dt: number): void {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i]!;
      w.vel.y -= 6 * dt;
      w.vel.x *= 1 - dt * 0.3;
      w.vel.z *= 1 - dt * 0.3;
      w.group.position.addScaledVector(w.vel, dt);
      w.group.rotation.x += w.spin.x * dt;
      w.group.rotation.y += w.spin.y * dt;
      w.group.rotation.z += w.spin.z * dt;
      w.smokeAcc += dt;
      if (w.smokeAcc > 0.05) {
        w.smokeAcc = 0;
        this.emit(w.group.position, { life: 2.6, size0: 0.4, size1: 1.8, peak: 0.85, tone: 0.22 });
      }
      if (w.group.position.y <= 0.2) {
        this.effects.explosion(w.group.position.clone().setY(0), false);
        if (w.plane) this.disposePlane(w.plane);
        else w.group.removeFromParent();
        this.wrecks.splice(i, 1);
      }
    }
    for (let i = this.orphans.length - 1; i >= 0; i--) {
      const o = this.orphans[i]!;
      o.age += dt;
      if (o.age > 1) {
        this.disposePlane(o.pl);
        this.orphans.splice(i, 1);
      }
    }
  }

  /**
   * Bombardeio em tapete: cada bombardeiro solta uma fileira de bombas que caem ao longo do rumo
   * da passagem; as fileiras correm lado a lado, como na formação. `onImpact` faz a explosão.
   */
  dropBombs(at: { x: number; y: number }, dir: number, bombers: number, onImpact: (at: THREE.Vector3, index: number) => void): void {
    if (!bombGeo || !bombMat) {
      bombGeo = new THREE.CapsuleGeometry(0.07, 0.32, 3, 8);
      bombGeo.rotateZ(Math.PI / 2);
      bombMat = new THREE.MeshStandardMaterial({ color: '#3d4136', roughness: 0.6, metalness: 0.4 });
    }
    const fx = Math.cos(dir);
    const fz = Math.sin(dir);
    let index = 0;
    for (let b = 0; b < Math.min(4, bombers); b++) {
      const [back, side] = FORMATION[b]!;
      for (let i = 0; i < BOMBS_PER_BOMBER; i++) {
        // fileira de ~8 unidades centrada no alvo, deslocada pela posição do avião na formação
        const along = -4 + (8 * i) / (BOMBS_PER_BOMBER - 1) + back * 1.2 + (Math.random() - 0.5) * 0.6;
        const lat = side * 1.3 + (Math.random() - 0.5) * 0.8;
        const to = new THREE.Vector3(at.x + fx * along - fz * lat, 0, at.y + fz * along + fx * lat);
        // a bomba herda a velocidade do avião: é solta antes do ponto de impacto
        const from = to.clone().addScaledVector(new THREE.Vector3(fx, 0, fz), -3.2).setY(BOMB_DROP_ALT);
        const mesh = new THREE.Mesh(bombGeo, bombMat);
        mesh.visible = false;
        mesh.castShadow = true;
        this.group.add(mesh);
        this.bombs.push({ mesh, from, to, age: 0, delay: i * 0.11 - back * 0.08, onImpact, index: index++ });
      }
    }
  }

  private frameBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]!;
      b.age += dt;
      const t = (b.age - b.delay) / BOMB_FALL;
      if (t < 0) continue;
      if (t >= 1) {
        b.onImpact(b.to, b.index);
        b.mesh.removeFromParent();
        this.bombs.splice(i, 1);
        continue;
      }
      // horizontal constante, queda acelerada: o nariz aponta para a velocidade
      b.mesh.visible = true;
      const x = b.from.x + (b.to.x - b.from.x) * t;
      const z = b.from.z + (b.to.z - b.from.z) * t;
      const y = b.from.y * (1 - t * t);
      b.mesh.position.set(x, y, z);
      tmpB.set((b.to.x - b.from.x) / BOMB_FALL, (-2 * b.from.y * t) / BOMB_FALL, (b.to.z - b.from.z) / BOMB_FALL).normalize();
      b.mesh.quaternion.setFromUnitVectors(AXIS, tmpB);
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
    for (const t of this.flights.values()) for (const pl of t.planes) this.disposePlane(pl);
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
    for (const b of this.bombs) b.mesh.removeFromParent();
    this.bombs.length = 0;
    for (const w of this.wrecks) {
      if (w.plane) this.disposePlane(w.plane);
      else w.group.removeFromParent();
    }
    this.wrecks.length = 0;
    for (const o of this.orphans) this.disposePlane(o.pl);
    this.orphans.length = 0;
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
  bombGeo?.dispose();
  bombGeo = null;
  bombMat?.dispose();
  bombMat = null;
  for (const m of flameMats) m.dispose();
  flameMats.length = 0;
}
