import * as THREE from 'three';
import type { AirView } from '../../../shared/sim/snapshot.ts';
import type { Effects } from './Effects.ts';
import { factionColor } from './palette.ts';
import type { ModelLayers } from './models/kit.ts';
import { AIRBASE_SLOTS, aircraftModel, bomberStoresModel, missileModel } from './models/military.ts';
import { glowTexture, volumetricSmokeTexture } from './textures.ts';

type Flight = AirView['flights'][number];
type Launch = AirView['launches'][number];
type Kind = 'fighter' | 'gripen' | 'bomber' | 'recon' | 'transport' | 'missile' | 'missile2' | 'stores';

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
  /** Chama do pós-combustor (só caças; o bombardeiro a jato não tem). */
  flame: THREE.Group | null;
  /** Luzes de navegação: vermelha na asa esquerda, verde na direita e o estroboscópio branco na deriva. */
  strobe: THREE.Sprite;
  /** Rastros em fita: vapor nas pontas das asas (caça, nas curvas fechadas) ou condensação dos motores (bombardeiro). */
  ribbons: Ribbon[];
  /** Pontos de saída das fitas no referencial do modelo. */
  ribbonAt: THREE.Vector3[];
  /** Sombra no chão e o tamanho dela rente ao chão (comprimento, envergadura). */
  shadow: THREE.Mesh;
  shadowSize: [number, number];
  big: boolean;
  /** Atraso do estroboscópio (cada avião pisca na sua hora). */
  blink: number;
  /** Bombardeiro: bombas sob as asas (somem na volta) e o brilho dos outros três bocais. */
  stores: THREE.Group | null;
  nozzles: THREE.Sprite[];
  /** Balanço próprio do avião pesado (turbulência lenta). */
  sway: number;
}

/** Fitas de rastro: um ponto novo a cada RIB_STEP segundos. */
const RIB_STEP = 0.04;

/**
 * Rastro em fita (faixa horizontal que acompanha o caminho): cada ponto envelhece, a faixa alarga e esmaece. Usado nas
 * trilhas de condensação dos bombardeiros, no vapor das pontas das asas dos caças nas curvas e na fumaça preta de um
 * avião abatido. Uma malha por fita, com buffers fixos e reaproveitados (nada é alocado por quadro).
 */
class Ribbon {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly pts: { x: number; y: number; z: number; age: number; s: number }[] = [];
  private acc = 0;
  private readonly max: number;

  constructor(
    private readonly life: number,
    private readonly w0: number,
    private readonly w1: number,
    private readonly rgb: [number, number, number],
    private readonly alpha: number,
    /** Segundos até a fita aparecer atrás do ponto de saída (a condensação se forma um pouco atrás do motor). */
    private readonly gap = 0,
  ) {
    this.max = Math.ceil(life / RIB_STEP) + 2;
    this.pos = new Float32Array(this.max * 2 * 3);
    this.col = new Float32Array(this.max * 2 * 4);
    const index: number[] = [];
    for (let i = 0; i < this.max - 1; i++) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    this.geo.setIndex(index);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, ribbonMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Avança `dt`; com `s` > 0 solta pontos novos em `at` (s = força do rastro, 0..1). */
  step(dt: number, at: THREE.Vector3, s: number): void {
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[0]!.age > this.life) this.pts.shift();
    this.acc += dt;
    if (this.acc >= RIB_STEP) {
      this.acc = 0;
      const last = this.pts[this.pts.length - 1];
      if (s > 0.02 || (last && last.s > 0.02)) {
        if (this.pts.length >= this.max - 1) this.pts.shift();
        this.pts.push({ x: at.x, y: at.y, z: at.z, age: 0, s });
      }
    }
    this.rebuild(at, s);
  }

  get empty(): boolean {
    return this.pts.length === 0;
  }

  private rebuild(head: THREE.Vector3, s: number): void {
    const n = this.pts.length;
    if (n === 0) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    const pt = (i: number) => (i < n ? this.pts[i]! : { x: head.x, y: head.y, z: head.z, age: 0, s });
    // a ponta viva só entra enquanto a fita está sendo emitida (sem ela, a fita esmaece onde ficou)
    const count = s > 0.02 ? n + 1 : n;
    if (count < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < count; i++) {
      const p = pt(i);
      const a = pt(Math.max(0, i - 1));
      const b = pt(Math.min(count - 1, i + 1));
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const k = p.age / this.life;
      const w = (this.w0 + (this.w1 - this.w0) * Math.sqrt(k)) / 2;
      const fadeIn = this.gap > 0 ? smooth(this.gap * 0.4, this.gap, p.age) : 1;
      const al = Math.max(0, p.s * this.alpha * Math.pow(1 - k, 1.4) * fadeIn);
      const o = i * 6;
      this.pos[o] = p.x - dz * w;
      this.pos[o + 1] = p.y;
      this.pos[o + 2] = p.z + dx * w;
      this.pos[o + 3] = p.x + dz * w;
      this.pos[o + 4] = p.y;
      this.pos[o + 5] = p.z - dx * w;
      const c = i * 8;
      for (const v of [0, 4]) {
        this.col[c + v] = this.rgb[0];
        this.col[c + v + 1] = this.rgb[1];
        this.col[c + v + 2] = this.rgb[2];
        this.col[c + v + 3] = al;
      }
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
    this.geo.setDrawRange(0, (count - 1) * 6);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
  }
}

function shadowGeometry(): THREE.PlaneGeometry {
  if (!shadowGeo) {
    shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
  }
  return shadowGeo;
}
function shadowMaterial(): THREE.MeshBasicMaterial {
  return (shadowMat ??= new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: glowTexture(), transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}

let ribbonMat: THREE.MeshBasicMaterial | null = null;
function ribbonMaterial(): THREE.MeshBasicMaterial {
  return (ribbonMat ??= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
}
let shadowMat: THREE.MeshBasicMaterial | null = null;
let shadowGeo: THREE.PlaneGeometry | null = null;
const navMats: THREE.SpriteMaterial[] = [];
/** Materiais das luzes de navegação: vermelha, verde e o estroboscópio branco. */
function navMaterial(i: 0 | 1 | 2): THREE.SpriteMaterial {
  if (!navMats.length)
    for (const color of ['#ff1a10', '#3aff6a', '#ffffff'])
      navMats.push(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  return navMats[i]!;
}

/** Flare de despiste: brilho branco-alaranjado que cai em arco soltando fumaça. */
interface Flare {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  age: number;
  life: number;
  smokeAcc: number;
}

/** Rajada de canhão em andamento no combate aéreo: um traçante a cada intervalo, do nariz do atirador. */
interface GunBurst {
  shooter: THREE.Object3D | null;
  from: THREE.Vector3;
  victim: THREE.Object3D | null;
  to: THREE.Vector3;
  next: number;
  left: number;
  kill: boolean;
}

/** Corrida de decolagem na pista (s) e o intervalo entre os aviões da esquadrilha. */
/** Bocais dos quatro motores do bombardeiro (referencial do modelo, escala de `aircraftModel('bomber')`). */
const BOMBER_NOZZLES = [0.31, -0.31, 0.49, -0.49].map((z) => new THREE.Vector3(-1.33, -0.13, z));
/** O bombardeiro pesado faz curvas bem mais abertas e inclina menos que o caça. */
const BOMBER_TURN = 2.1;
const BOMBER_MAX_BANK = 0.55;
const TAKEOFF_ROLL = 2.2;
const TAKEOFF_GAP = 0.6;
/** Pista da Base Aérea no referencial da base (ao longo de +x, do lado +z): início e fim da corrida. */
const RUNWAY_Z = 2.75;
const RUNWAY_X0 = -3.3;
const RUNWAY_X1 = 3.2;

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
  /** Inclinação lateral suavizada (curva coordenada). */
  bank: number;
  /** Decolagem pela pista: segundos desde o início da corrida (−1 = já no ar ou nasceu longe da base). */
  takeoff: number;
  /** Mergulho já passou do fundo: na recuperação os caças soltam flares. */
  flareArmed: boolean;
  /** Próximo flare no combate aéreo (tempo próprio). */
  nextFlare: number;
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
    m = kind === 'missile' ? missileModel(1) : kind === 'missile2' ? missileModel(2) : kind === 'stores' ? bomberStoresModel() : aircraftModel(kind);
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
const tmpRib = new THREE.Vector3();
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
  /** Aeronaves próprias paradas no pátio da base (prontas, em manutenção ou sem piloto), nas vagas do modelo. */
  private readonly parked = new Map<number, { group: THREE.Group; kind: Kind }>();
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
  /** Fitas que continuam no céu depois que o avião sumiu (pousou ou saiu da vista), até esmaecer. */
  private readonly fading: Ribbon[] = [];
  private readonly flares: Flare[] = [];
  private flareNext = 0;
  private readonly bursts: GunBurst[] = [];
  private ground: (x: number, z: number) => number = () => 0;

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
    for (let i = 0; i < 24; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff0c8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false;
      this.group.add(sprite);
      this.flares.push({ sprite, vel: new THREE.Vector3(), age: 1, life: 1, smokeAcc: 0 });
    }
    // guardiões de shader das fitas e das sombras (compilados no pré-aquecimento, sem travada no primeiro voo)
    const keep = effects.keepers();
    const rib = new Ribbon(0.2, 0.1, 0.1, [1, 1, 1], 0);
    rib.mesh.visible = false;
    keep.add(rib.mesh);
    const sh = new THREE.Mesh(shadowGeometry(), shadowMaterial());
    sh.visible = false;
    sh.frustumCulled = false;
    keep.add(sh);
  }

  /** Altura do terreno (para a sombra dos aviões e a corrida na pista). */
  setGround(fn: (x: number, z: number) => number): void {
    this.ground = fn;
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
        t = { snap: f, planes: [], prev: p.clone(), curr: p.clone(), lastC: null, pos: p.clone(), heading: f.heading, turn: 0, speed: 0, alt: 0, t: 0, phase: (f.id * 2.399) % 6.283, bank: 0, takeoff: -1, flareArmed: false, nextFlare: 3 };
        // decolando: a esquadrilha começa na cabeceira da pista e corre um avião de cada vez, se ainda estiver perto da
        // base na saída
        // (a base de um voo inimigo só vem quando o jogador a enxerga: sem ela, o voo já aparece no ar)
        const fresh = f.bx !== undefined && f.by !== undefined && f.state === 'outbound' && Math.hypot(f.x - f.bx, f.y - f.by) < AIRFIELD_RADIUS * 0.6;
        t.alt = fresh ? 0.3 : ALTITUDE;
        if (fresh) {
          t.takeoff = 0;
          t.pos.set((f.bx ?? f.x) + RUNWAY_X1, (f.by ?? f.y) + RUNWAY_Z);
          t.heading = 0;
        }
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

    this.updateParked(air.aircraft);

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

  /**
   * Desenha nas vagas da base as aeronaves que existem de fato (até 4 por base, como o hangar), viradas para a pista:
   * o pátio mostra de relance quantas estão estacionadas. As que saem em missão ou ainda estão em produção somem dali.
   */
  private updateParked(list: AirView['aircraft']): void {
    const perBase = new Map<number, number>();
    const keep = new Set<number>();
    for (const a of list) {
      if (a.state === 'building' || a.state === 'mission') continue;
      const n = perBase.get(a.baseId) ?? 0;
      const slot = AIRBASE_SLOTS[n];
      const at = this.posOf(a.baseId);
      if (!slot || !at) continue;
      perBase.set(a.baseId, n + 1);
      keep.add(a.id);
      const kind: Kind = a.type === 'fighter' ? (a.gen >= 2 ? 'gripen' : 'fighter') : a.type;
      let p = this.parked.get(a.id);
      if (p && p.kind !== kind) {
        p.group.removeFromParent();
        p = undefined;
      }
      if (!p) {
        p = { group: meshes(model(kind), this.mySlot, true), kind };
        // bombardeiro no pátio já armado, com as bombas sob as asas
        if (kind === 'bomber') p.group.add(meshes(model('stores'), this.mySlot, true));
        // o bombardeiro e o cargueiro são maiores que a vaga de caça
        if (kind === 'bomber' || kind === 'transport') p.group.scale.setScalar(0.65);
        p.group.rotation.y = slot.heading;
        this.group.add(p.group);
        this.parked.set(a.id, p);
      }
      p.group.position.set(at.x + slot.x, 0.24, at.y + slot.z);
    }
    for (const [id, p] of this.parked)
      if (!keep.has(id)) {
        p.group.removeFromParent();
        this.parked.delete(id);
      }
  }

  private rebuildPlanes(t: TrackedFlight, f: Flight): void {
    for (const pl of t.planes) this.disposePlane(pl, true);
    t.planes = [];
    const kind: Kind = f.kind === 'recon' ? 'recon' : f.plane === 'bomber' ? 'bomber' : f.gen >= 2 ? 'gripen' : 'fighter';
    const big = kind === 'bomber';
    const m = model(kind);
    if (!m.body.boundingBox) m.body.computeBoundingBox();
    const bb = m.body.boundingBox!;
    const tipZ = bb.max.z * 0.96;
    const tail = kind === 'bomber' ? -0.8 : kind === 'gripen' ? -1.1 : -0.95;
    for (let i = 0; i < Math.min(4, f.count); i++) {
      const group = new THREE.Group();
      group.add(meshes(m, f.owner, false));
      // brilho do motor atrás de cada avião
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb46a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(big ? BOMBER_NOZZLES[0]!.x : tail, big ? BOMBER_NOZZLES[0]!.y : 0, big ? BOMBER_NOZZLES[0]!.z : 0);
      glow.scale.setScalar(big ? 0.3 : 0.45);
      group.add(glow);
      // bombardeiro: um brilho por bocal (quatro motores) e a carga de bombas sob as asas
      const nozzles: THREE.Sprite[] = [];
      let stores: THREE.Group | null = null;
      if (big) {
        for (const at of BOMBER_NOZZLES.slice(1)) {
          const sp = new THREE.Sprite(glow.material);
          sp.position.copy(at);
          sp.scale.setScalar(0.3);
          group.add(sp);
          nozzles.push(sp);
        }
        stores = meshes(model('stores'), f.owner, false);
        group.add(stores);
      }
      // pós-combustor: o cone de chama dos caças (aceso na decolagem, no mergulho e no combate)
      let flame: THREE.Group | null = null;
      if (!big && kind !== 'recon') {
        flame = flameMesh();
        flame.position.set(tail + 0.12, 0, 0);
        flame.visible = false;
        group.add(flame);
      }
      // luzes de navegação
      for (const [z, k] of [
        [-tipZ, 0],
        [tipZ, 1],
      ] as const) {
        const sp = new THREE.Sprite(navMaterial(k));
        sp.position.set(big ? -0.95 : bb.min.x * 0.1, 0.02, z);
        sp.scale.setScalar(big ? 0.32 : 0.2);
        group.add(sp);
      }
      const strobe = new THREE.Sprite(navMaterial(2));
      if (big) strobe.position.set(-1.62, 0.8, 0);
      else strobe.position.set(bb.min.x * 0.92, bb.max.y * 0.95, 0);
      strobe.scale.setScalar(big ? 0.55 : 0.38);
      group.add(strobe);
      this.group.add(group);
      // fitas: condensação dos motores internos no bombardeiro; vapor das pontas das asas no caça
      // bombardeiro: uma trilha de condensação por motor (quatro), que se junta em duas faixas largas mais atrás
      const ribbonAt = big ? BOMBER_NOZZLES.map((v) => v.clone().setX(v.x - 0.05)) : [new THREE.Vector3(bb.min.x * 0.2, 0, -tipZ), new THREE.Vector3(bb.min.x * 0.2, 0, tipZ)];
      const ribbons = ribbonAt.map(() => (big ? new Ribbon(6, 0.05, 0.75, [1, 1, 1], 0.42, 0.12) : new Ribbon(0.8, 0.035, 0.16, [1, 1, 1], 0.7)));
      for (const r of ribbons) this.group.add(r.mesh);
      const shadow = new THREE.Mesh(shadowGeometry(), shadowMaterial());
      shadow.renderOrder = 1;
      this.group.add(shadow);
      t.planes.push({ group, glow, prevLat: 0, prevAlt: 0, trailAcc: Math.random() * 0.1, flame, strobe, ribbons, ribbonAt, shadow, shadowSize: [(bb.max.x - bb.min.x) * 0.85, tipZ * 1.25], big, blink: Math.random() * 1.3, stores, nozzles, sway: Math.random() * 10 });
    }
  }

  private orphan(pl: Plane, owner: number): void {
    pl.group.visible = false;
    pl.shadow.visible = false;
    this.orphans.push({ pl, owner, age: 0 });
  }

  /** Descarta o avião; as fitas ficam no céu esmaecendo (`now`: some de uma vez, ex. troca de modelo). */
  private disposePlane(pl: Plane, now = false): void {
    pl.group.removeFromParent();
    pl.shadow.removeFromParent();
    for (const r of pl.ribbons) {
      if (now || r.empty) r.dispose();
      else this.fading.push(r);
    }
    pl.ribbons = [];
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
    // base do voo: a de um voo inimigo só vem quando está à vista do jogador (névoa no servidor)
    const hasBase = f.bx !== undefined && f.by !== undefined;
    const bx = f.bx ?? 0;
    const by = f.by ?? 0;
    if (!hasBase) t.takeoff = -1;
    // decolagem: o líder ainda corre na pista; o centro da esquadrilha espera na cabeceira oposta
    const n = t.planes.length;
    if (t.takeoff >= 0) {
      t.takeoff += dt;
      if (t.takeoff > TAKEOFF_ROLL + (n - 1) * TAKEOFF_GAP + 2.6) t.takeoff = -1;
    }
    const rolling = t.takeoff >= 0 && t.takeoff < TAKEOFF_ROLL;
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
    let v = 0;
    if (rolling) {
      t.pos.set(bx + RUNWAY_X1, by + RUNWAY_Z);
      t.heading = 0;
      t.turn = 0;
      v = 5.9;
    } else if (dist > 40 && t.takeoff < 0) {
      // salto grande (entrou na tela, reconexão): reposiciona sem voar o caminho
      t.pos.set(cx, cy);
      t.heading = f.heading;
    } else if (t.speed > 0.05 || dist > 0.2) {
      // persegue um ponto um pouco à frente do centro, com raio de curva limitado
      const lead = 0.5;
      const ax = cx + Math.cos(f.heading) * t.speed * lead - t.pos.x;
      const ay = cy + Math.sin(f.heading) * t.speed * lead - t.pos.y;
      const want = Math.hypot(ax, ay) > 0.3 ? Math.atan2(ay, ax) : f.heading;
      v = Math.min(t.speed * 2.4 + 3, t.speed + dist * 1.3);
      // logo depois de sair do chão a curva é aberta (o avião ainda ganha velocidade)
      const maxTurn = (bomber ? Math.max(0.5, v / (TURN_RADIUS * BOMBER_TURN)) : Math.max(1.2, v / TURN_RADIUS)) * (t.takeoff >= 0 ? 0.45 : 1);
      const d = angDiff(want, t.heading);
      const step = Math.max(-maxTurn * dt, Math.min(maxTurn * dt, d));
      t.heading += step;
      t.turn += ((dt > 0 ? step / dt : 0) - t.turn) * Math.min(1, dt * 4);
      t.pos.x += Math.cos(t.heading) * v * dt;
      t.pos.y += Math.sin(t.heading) * v * dt;
    }
    // altitude: decolagem/pouso perto da base e mergulho perto do alvo
    const nearBase = hasBase ? smooth(1.5, AIRFIELD_RADIUS, Math.hypot(t.pos.x - bx, t.pos.y - by)) : 1;
    let dive = 0;
    if (f.kind === 'strike' && !bomber && f.tx !== undefined && f.ty !== undefined) {
      const dt2 = Math.hypot(t.pos.x - f.tx, t.pos.y - f.ty);
      dive = f.state === 'outbound' ? smooth(ATTACK_RADIUS, 4, dt2) : smooth(ATTACK_RADIUS * 0.8, 2, dt2);
    }
    const wantAlt = 0.35 + (ALTITUDE + (f.kind === 'recon' ? 1.5 : bomber ? 0.8 : 0) - 0.35) * nearBase;
    const targetAlt = wantAlt + (DIVE_ALTITUDE - wantAlt) * dive * nearBase;
    const prevAlt = t.alt;
    if (rolling) t.alt = 0.3;
    else t.alt += (Math.max(targetAlt, t.takeoff >= 0 ? 0.3 + (t.takeoff - TAKEOFF_ROLL) * 1.6 : 0) - t.alt) * Math.min(1, dt * 1.6);
    const climb = dt > 0 ? (t.alt - prevAlt) / dt : 0;
    const groundSpeed = Math.max(4, t.speed, v);
    const pitch = Math.atan2(climb, groundSpeed) * (bomber ? 0.8 : 1.3);
    // curva coordenada: a inclinação vem da velocidade e da taxa de curva (tan φ = v·ω/g), com a rolagem limitada
    const maxBank = bomber ? BOMBER_MAX_BANK : 1.25;
    let bankWant = Math.max(-maxBank, Math.min(maxBank, Math.atan((t.turn * groundSpeed) / 5)));
    // corrida de bombardeio: asas niveladas e rumo firme sobre o alvo
    const run = bomber && f.kind === 'strike' && f.state === 'outbound' && f.tx !== undefined && f.ty !== undefined ? smooth(ATTACK_RADIUS * 1.2, ATTACK_RADIUS * 0.5, Math.hypot(t.pos.x - f.tx, t.pos.y - f.ty)) : 0;
    bankWant *= 1 - run * 0.85;
    // o pesado rola devagar (inércia); o caça responde rápido
    t.bank += (bankWant - t.bank) * Math.min(1, dt * (bomber ? 1.1 : 3));
    // flares: na recuperação do mergulho de ataque e de vez em quando no combate aéreo
    if (!bomber) {
      if (dive > 0.85) t.flareArmed = true;
      else if (t.flareArmed && dive < 0.55) {
        t.flareArmed = false;
        t.planes.forEach((pl, i) => this.popFlares(pl.group, 5, i * 0.18));
      }
      if (f.engaged && t.t > t.nextFlare && t.planes.length) {
        t.nextFlare = t.t + 2.5 + Math.random() * 3;
        this.popFlares(t.planes[Math.floor(Math.random() * t.planes.length)]!.group, 4, 0);
      }
    }
    const fwdX = Math.cos(t.heading);
    const fwdY = Math.sin(t.heading);
    // lado direito no plano do mapa (+z do modelo)
    const rgtX = -fwdY;
    const rgtY = fwdX;
    const cruise = bomber ? 0.4 : nearBase * (1 - dive);
    const spread = bomber ? 2.5 : 1;
    // potência do motor (pós-combustor dos caças): decolagem, subida, mergulho e combate
    const thrBase = Math.max(t.takeoff >= 0 ? 1 : 0, dive * 0.9, f.engaged ? 0.85 : 0, Math.min(1, Math.max(0, climb) * 0.5));
    for (let i = 0; i < n; i++) {
      const pl = t.planes[i]!;
      const [back, side] = FORMATION[i]!;
      const tt = t.t + t.phase;
      let lat = side * spread;
      let along = back * spread;
      let up = i * 0.12;
      // turbulência leve: cada ala oscila pouco e devagar em volta do seu lugar (formação firme, sem acrobacias)
      if (i > 0) {
        lat += 0.12 * Math.sin(tt * 0.8 + i * 1.7) * cruise;
        up += 0.08 * Math.sin(tt * 1.1 + i * 2.3) * cruise;
        along += 0.1 * Math.sin(tt * 0.6 + i * 0.9) * cruise;
      }
      // ataque: a formação vira fila e os aviões mergulham um atrás do outro
      lat *= 1 - dive;
      along = along * (1 - dive) - i * 2.2 * dive;
      up = up * (1 - dive) + i * 0.5 * dive;
      // decolagem/pouso: fila indiana sobre a pista
      lat *= nearBase;
      along = along * nearBase - i * 1.6 * spread * (1 - nearBase);
      let x = t.pos.x + fwdX * along + rgtX * lat;
      let y = t.pos.y + fwdY * along + rgtY * lat;
      let alt = t.alt + up * nearBase;
      let yaw = t.heading;
      let pitchI = pitch;
      let rollI = t.bank;
      let thr = thrBase;
      if (t.takeoff >= 0) {
        // corrida na pista, um avião de cada vez: acelera, levanta o nariz e sai do chão; depois se junta à formação
        const tr = t.takeoff - i * TAKEOFF_GAP;
        const g = this.ground(bx, by);
        const acc = (2 * (RUNWAY_X1 - RUNWAY_X0)) / (TAKEOFF_ROLL * TAKEOFF_ROLL);
        let rx: number;
        let ralt: number;
        let rp = 0;
        if (tr < 0) {
          // na fila da cabeceira, motor acelerando
          rx = RUNWAY_X0 - (i >= 2 ? 0.5 : 0);
          ralt = 0.24 + g;
          thr = 0.3;
        } else if (tr < TAKEOFF_ROLL) {
          rx = RUNWAY_X0 + 0.5 * acc * tr * tr;
          const lift = smooth(TAKEOFF_ROLL * 0.7, TAKEOFF_ROLL, tr);
          ralt = 0.24 + g + lift * 0.35;
          rp = 0.22 * lift;
          thr = 1;
        } else {
          const e = tr - TAKEOFF_ROLL;
          rx = RUNWAY_X1 + acc * TAKEOFF_ROLL * e;
          ralt = 0.59 + g + 1.5 * e;
          rp = 0.28;
          thr = 1;
        }
        const rz = RUNWAY_Z + (i % 2 ? 0.35 : -0.35) * (tr < TAKEOFF_ROLL ? 1 : 0);
        const w = smooth(TAKEOFF_ROLL, TAKEOFF_ROLL + 2.4, tr);
        x = bx + rx + (x - (bx + rx)) * w;
        y = by + rz + (y - (by + rz)) * w;
        alt = ralt + (alt - ralt) * w;
        yaw = angDiff(t.heading, 0) * w;
        pitchI = rp + (pitch - rp) * w;
        rollI *= w;
      }
      if (pl.big && t.takeoff < 0) {
        // avião pesado no ar: sobe e desce devagar na turbulência, balança pouco nas asas e o nariz atrasa na curva
        const sw = this.time * 0.55 + pl.sway;
        alt += 0.1 * Math.sin(sw) * nearBase + 0.04 * Math.sin(sw * 2.3 + 1.1) * nearBase;
        rollI += 0.035 * Math.sin(sw * 0.8 + 2) * nearBase;
        pitchI += 0.015 * Math.cos(sw) * nearBase;
        yaw -= t.turn * 0.06;
      }
      const latVel = dt > 0 ? (lat - pl.prevLat) / dt : 0;
      pl.prevLat = lat;
      pl.prevAlt = alt;
      pl.group.position.set(x, alt, y);
      // guinada, depois arfagem, depois rolagem (inclina para dentro das curvas e das trocas de posição)
      pl.group.rotation.set(rollI + Math.max(-0.35, Math.min(0.35, latVel * (pl.big ? 0.12 : 0.25))), -yaw, pitchI, 'YZX');
      // bombas sob as asas só na ida; na volta a esquadrilha já despejou a carga
      if (pl.stores) pl.stores.visible = f.state === 'outbound';
      // motor: brilho e chama do pós-combustor crescem com a potência, com tremulação
      const glowMat = pl.glow.material as THREE.SpriteMaterial;
      glowMat.opacity = (pl.big ? 0.32 + thr * 0.3 : 0.45 + thr * 0.4) + Math.random() * 0.2;
      glowMat.color.set(thr > 0.6 && !pl.big ? '#ffd2a0' : '#ffb46a');
      pl.glow.scale.setScalar((pl.big ? 0.26 + thr * 0.12 : 0.38 + thr * 0.35) + Math.random() * 0.06);
      for (const nz of pl.nozzles) nz.scale.setScalar(pl.glow.scale.x * (0.92 + Math.random() * 0.16));
      if (pl.flame) {
        pl.flame.visible = thr > 0.2;
        if (pl.flame.visible) pl.flame.scale.set((0.1 + thr * 0.26) * (0.85 + Math.random() * 0.3), 0.36, 0.36);
      }
      // estroboscópio: dois piscos rápidos a cada 1,3 s
      const ph = (this.time + pl.blink) % 1.3;
      pl.strobe.visible = ph < 0.05 || (ph > 0.14 && ph < 0.19);
      // sombra no chão, mais larga e mais fraca com a altura
      const gy = this.ground(x, y);
      const h = Math.max(0, alt - gy);
      pl.shadow.position.set(x, gy + 0.06, y);
      pl.shadow.rotation.y = -yaw;
      // o sol está longe: a sombra não cresce com a altura, só fica um pouco mais difusa (um pouco maior)
      const sk = 1 + h * 0.02;
      pl.shadow.visible = h < 14;
      pl.shadow.scale.set(pl.shadowSize[0] * sk, 1, pl.shadowSize[1] * sk);
      // fitas: condensação contínua dos bombardeiros acima de 5 de altitude; vapor nas pontas das asas dos caças só sob
      // carga (curva fechada, recuperação do mergulho, combate)
      const pull = dive > 0.3 && climb > 0.6 ? 0.6 : 0;
      const g = Math.min(1, Math.abs(t.bank) * 0.9 + pull + (f.engaged ? 0.35 : 0));
      const strength = pl.big ? smooth(4.5, 6.5, alt) : smooth(0.45, 0.85, g);
      pl.group.updateMatrixWorld();
      for (let k = 0; k < pl.ribbons.length; k++) {
        tmpRib.copy(pl.ribbonAt[k]!).applyMatrix4(pl.group.matrixWorld);
        pl.ribbons[k]!.step(dt, tmpRib, strength);
      }
      // fumaça leve dos motores só com o pós-combustor aceso (o rastro de cruzeiro fica com as fitas)
      if (alt > 1 && thr > 0.5 && !pl.big) {
        pl.trailAcc += dt;
        if (pl.trailAcc > 0.09) {
          pl.trailAcc = 0;
          const tail = new THREE.Vector3(-1, 0, 0).applyEuler(pl.group.rotation).multiplyScalar(1.1).add(pl.group.position);
          this.emit(tail, { life: 0.8 + dive * 0.5, size0: 0.16, size1: 0.8, peak: 0.25 + dive * 0.2, tone: 1 });
        }
      }
    }
  }

  /** Solta `count` flares do avião em leque para trás e para baixo, depois de `delay` segundos. */
  private popFlares(from: THREE.Object3D, count: number, delay: number): void {
    const fwd = new THREE.Vector3(1, 0, 0).applyEuler(from.rotation);
    const rgt = new THREE.Vector3(0, 0, 1).applyEuler(from.rotation);
    for (let i = 0; i < count; i++) {
      const fl = this.flares[this.flareNext]!;
      this.flareNext = (this.flareNext + 1) % this.flares.length;
      const side = (i % 2 ? 1 : -1) * (0.8 + Math.random() * 1.6);
      fl.sprite.position.copy(from.position).addScaledVector(fwd, -0.5);
      fl.vel.copy(fwd).multiplyScalar(1.5 + Math.random()).addScaledVector(rgt, side).add(new THREE.Vector3(0, 0.8 + Math.random() * 0.8, 0));
      fl.age = -delay - i * 0.07;
      fl.life = 1.4 + Math.random() * 0.6;
      fl.smokeAcc = 0;
      fl.sprite.visible = false;
    }
  }

  private frameFlares(dt: number): void {
    for (const fl of this.flares) {
      if (fl.age >= fl.life) continue;
      fl.age += dt;
      if (fl.age < 0) continue;
      if (fl.age >= fl.life) {
        fl.sprite.visible = false;
        continue;
      }
      fl.sprite.visible = true;
      fl.vel.y -= 3.2 * dt;
      fl.vel.multiplyScalar(Math.max(0, 1 - dt * 0.9));
      fl.sprite.position.addScaledVector(fl.vel, dt);
      const k = fl.age / fl.life;
      fl.sprite.scale.setScalar((0.55 - k * 0.25) * (0.8 + Math.random() * 0.4));
      fl.sprite.material.opacity = 1 - k * k;
      fl.smokeAcc += dt;
      if (fl.smokeAcc > 0.05) {
        fl.smokeAcc = 0;
        this.emit(fl.sprite.position, { life: 1.3, size0: 0.12, size1: 0.6, peak: 0.55 * (1 - k), tone: 1.05 });
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
    this.frameFlares(dt);
    this.frameBursts();
    this.frameBombs(dt);
    this.frameWrecks(dt);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const r = this.fading[i]!;
      r.step(dt, tmpRib, 0);
      if (r.empty) {
        r.dispose();
        this.fading.splice(i, 1);
      }
    }
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
    const shooter = shooters.length ? shooters[Math.floor(Math.random() * shooters.length)]! : null;
    const victim = victims.length ? victims[Math.floor(Math.random() * victims.length)]! : null;
    // rajada do canhão: ~10 traçantes em 0,6 s saindo do nariz do atirador, que acompanham os dois aviões em movimento
    this.bursts.push({ shooter, from: new THREE.Vector3(e.from.x, ALTITUDE, e.from.y), victim, to: new THREE.Vector3(e.to.x, ALTITUDE, e.to.y), next: this.time, left: 10, kill: e.kill });
  }

  private frameBursts(): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      if (this.time < b.next) continue;
      b.next = this.time + 0.06;
      b.left--;
      const from = b.shooter?.parent ? b.shooter.position : b.from;
      const to = b.victim?.parent ? b.victim.position : b.to;
      const dir = tmpB.copy(to).sub(from).normalize();
      // o tiro sai na direção do nariz, puxado para o alvo (o atirador está mirando com o avião)
      if (b.shooter?.parent) dir.lerp(new THREE.Vector3(1, 0, 0).applyEuler(b.shooter.rotation), 0.35).normalize();
      const nose = from.clone().addScaledVector(dir, 0.85);
      const reach = Math.min(18, from.distanceTo(to) + 2);
      const hit = b.kill && b.left < 3;
      const end = hit ? to.clone() : nose.clone().addScaledVector(dir, reach).add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
      this.effects.tracer(nose, end, false);
      if (b.left % 3 === 0) this.effects.muzzleFlash(nose, dir, 0.3);
      if (hit) this.effects.flash(to, 0.5, '#ffd38a', 0.12);
      if (b.left <= 0) this.bursts.splice(i, 1);
    }
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
    // o motor vira fogo: o brilho fica, laranja-avermelhado e tremulando; as luzes e a chama apagam
    (pl.glow.material as THREE.SpriteMaterial).color.set('#ff5a14');
    if (pl.flame) pl.flame.visible = false;
    pl.strobe.visible = false;
    pl.shadow.visible = false;
    for (const r of pl.ribbons) this.fading.push(r);
    // o rastro de fumaça preta da queda
    pl.ribbons = [new Ribbon(3.2, 0.25, 1.5, [0.13, 0.12, 0.11], 0.8)];
    pl.ribbonAt = [new THREE.Vector3(-0.4, 0, 0)];
    this.group.add(pl.ribbons[0]!.mesh);
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
      if (w.smokeAcc > 0.07) {
        w.smokeAcc = 0;
        this.emit(w.group.position, { life: 2.6, size0: 0.4, size1: 1.8, peak: 0.85, tone: 0.22 });
      }
      if (w.plane) {
        w.plane.glow.scale.setScalar(0.9 + Math.random() * 0.5);
        (w.plane.glow.material as THREE.SpriteMaterial).opacity = 0.8 + Math.random() * 0.2;
        w.group.updateMatrixWorld();
        for (let k = 0; k < w.plane.ribbons.length; k++) w.plane.ribbons[k]!.step(dt, tmpRib.copy(w.plane.ribbonAt[k]!).applyMatrix4(w.group.matrixWorld), 1);
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
    for (const r of this.fading) r.dispose();
    this.fading.length = 0;
    for (const fl of this.flares) {
      fl.sprite.removeFromParent();
      fl.sprite.material.dispose();
    }
    this.flares.length = 0;
    this.bursts.length = 0;
    for (const p of this.parked.values()) p.group.removeFromParent();
    this.parked.clear();
    for (const t of this.flights.values()) for (const pl of t.planes) this.disposePlane(pl, true);
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
      if (w.plane) this.disposePlane(w.plane, true);
      else w.group.removeFromParent();
    }
    this.wrecks.length = 0;
    for (const o of this.orphans) this.disposePlane(o.pl, true);
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
  ribbonMat?.dispose();
  ribbonMat = null;
  shadowMat?.dispose();
  shadowMat = null;
  shadowGeo?.dispose();
  shadowGeo = null;
  for (const m of navMats) m.dispose();
  navMats.length = 0;
  bombMat?.dispose();
  bombMat = null;
  for (const m of flameMats) m.dispose();
  flameMats.length = 0;
}
