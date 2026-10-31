import * as THREE from 'three';
import { Terrain } from '../../../shared/sim/config.ts';
import type { MapData } from '../../../shared/sim/types.ts';
import { Random } from '../../../shared/sim/Random.ts';
import { PartBuilder } from './models/kit.ts';
import { withFog } from './materials.ts';

/**
 * Vida ambiente do mapa, puramente cosmética (nada disso existe na simulação):
 * - bandos de pássaros sobre a terra e gaivotas sobre a água: batem asas em rajadas, planam, às vezes circulam numa
 *   térmica; com tiros e explosões por perto, fogem subindo e acelerando;
 * - manadas de cervos nas bordas das matas: pastam (cabeça baixa), andam devagar, levantam a cabeça e fogem correndo
 *   quando uma tropa chega perto ou algo explode; mudam de pasto quando uma construção ocupa o lugar.
 * Tudo em low poly e desenhado por instâncias (sete chamadas de desenho no total), com a névoa de guerra dos materiais
 * do mapa: o que está em área inexplorada fica escondido como o resto.
 */

const BIRD_ALT = 6;
/** Ciclo das asas (rad/s) e quanto tempo um bando bate asas antes de planar. */
const FLAP = 13;

interface Bird {
  /** Posição relativa ao centro do bando (atrás, lado, altura). */
  off: THREE.Vector3;
  phase: number;
}

interface Flock {
  gull: boolean;
  pos: THREE.Vector3;
  heading: number;
  turn: number;
  target: THREE.Vector2;
  speed: number;
  /** Térmica: centro e tempo restante circulando. */
  orbit: THREE.Vector2 | null;
  orbitLeft: number;
  /** Susto: segundos restantes fugindo. */
  scared: number;
  flapLeft: number;
  glideLeft: number;
  birds: Bird[];
}

interface Deer {
  pos: THREE.Vector2;
  heading: number;
  /** Destino da caminhada (null = parado pastando). */
  goal: THREE.Vector2 | null;
  wait: number;
  /** 0 = cabeça baixa pastando, 1 = cabeça erguida. */
  head: number;
  gait: number;
  speed: number;
  /** Macho com chifres (um por manada). */
  stag: boolean;
}

interface Herd {
  home: THREE.Vector2;
  deer: Deer[];
  fleeing: number;
  flee: THREE.Vector2;
}

export class AmbientLife {
  readonly group = new THREE.Group();
  private readonly rng: Random;
  private readonly flocks: Flock[] = [];
  private readonly herds: Herd[] = [];
  private readonly birdBody: THREE.InstancedMesh;
  private readonly wingL: THREE.InstancedMesh;
  private readonly wingR: THREE.InstancedMesh;
  private readonly deerBody: THREE.InstancedMesh;
  private readonly deerHead: THREE.InstancedMesh;
  private readonly deerLegs: THREE.InstancedMesh;
  private readonly antlers: THREE.InstancedMesh;
  private readonly materials: THREE.Material[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly land: number[] = [];
  private readonly water: number[] = [];
  private readonly pasture: number[] = [];
  private time = 0;
  /** Células tomadas por construções (com uma célula de folga em volta). */
  private readonly occupied: Uint8Array;
  private checkAcc = 0;

  constructor(
    private readonly map: MapData,
    private readonly ground: (x: number, z: number) => number,
    /** Posições das tropas (para os cervos fugirem) e se uma posição está ocupada por construção. */
    private readonly units: () => Iterable<{ x: number; y: number }>,
    lite: boolean,
  ) {
    this.occupied = new Uint8Array(map.width * map.height);
    this.rng = new Random((map.seed ^ 0x5eed) >>> 0);
    const { width: w, height: h } = map;
    for (let i = 0; i < w * h; i++) {
      const t = map.terrain[i];
      if (t === Terrain.Water) this.water.push(i);
      else this.land.push(i);
      if (t === Terrain.Plains || t === Terrain.Fertile) {
        // pasto na borda da mata: pelo menos uma célula de floresta a até 2 células
        const cx = i % w;
        const cy = Math.floor(i / w);
        let edge = false;
        for (let dy = -2; dy <= 2 && !edge; dy++)
          for (let dx = -2; dx <= 2 && !edge; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x >= 0 && y >= 0 && x < w && y < h && map.terrain[y * w + x] === Terrain.Forest) edge = true;
          }
        if (edge) this.pasture.push(i);
      }
    }

    // ---------------------------------------------------------------- pássaros
    const bodyGeo = this.geo(new PartBuilder().box(0.26, 0.06, 0.07, '#ffffff', [0, 0, 0]).box(0.07, 0.05, 0.05, '#ffffff', [0.15, 0.015, 0]).box(0.08, 0.015, 0.1, '#ffffff', [-0.15, 0, 0]).build());
    // asa: perfil em flecha, raiz no corpo (origem) e ponta para +z; a esquerda é a mesma espelhada
    const wing = (side: 1 | -1) => {
      const g = new THREE.BufferGeometry();
      const s = side;
      const v = [0.07, 0, 0, -0.07, 0, 0, -0.06, 0, 0.17 * s, 0.07, 0, 0, -0.06, 0, 0.17 * s, 0.02, 0, 0.17 * s, 0.02, 0, 0.17 * s, -0.06, 0, 0.17 * s, -0.1, 0, 0.3 * s];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      return this.geo(g);
    };
    const birdMat = this.mat(withFog(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, side: THREE.DoubleSide })));
    const flockCount = lite ? 3 : 5;
    const gullFlocks = this.water.length > w * h * 0.03 ? (lite ? 1 : 2) : 0;
    let birds = 0;
    for (let i = 0; i < flockCount + gullFlocks; i++) {
      const gull = i >= flockCount;
      const n = (gull ? 4 : 6) + Math.floor(this.rng.next() * 4);
      const start = this.randomCell(gull ? this.water : this.land);
      const f: Flock = {
        gull,
        pos: new THREE.Vector3(start.x, BIRD_ALT + this.rng.next() * 2, start.y),
        heading: this.rng.next() * Math.PI * 2,
        turn: 0,
        target: this.randomCell(gull ? this.water : this.land),
        speed: gull ? 2 : 2.6,
        orbit: null,
        orbitLeft: 0,
        scared: 0,
        flapLeft: 1 + this.rng.next() * 2,
        glideLeft: 0,
        birds: [],
      };
      for (let k = 0; k < n; k++) {
        // bando solto em V irregular
        const row = Math.ceil(k / 2);
        const side = k === 0 ? 0 : k % 2 ? 1 : -1;
        f.birds.push({ off: new THREE.Vector3(-row * 0.45 - this.rng.next() * 0.3, (this.rng.next() - 0.5) * 0.5, side * row * 0.4 + (this.rng.next() - 0.5) * 0.4), phase: this.rng.next() * 6.28 });
      }
      birds += n;
      this.flocks.push(f);
    }
    this.birdBody = new THREE.InstancedMesh(bodyGeo, birdMat, birds);
    this.wingL = new THREE.InstancedMesh(wing(-1), birdMat, birds);
    this.wingR = new THREE.InstancedMesh(wing(1), birdMat, birds);
    let k = 0;
    const dark = new THREE.Color('#2e2b28');
    const gullC = new THREE.Color('#eef0ee');
    const gullWing = new THREE.Color('#b9bfc4');
    for (const f of this.flocks)
      for (let j = 0; j < f.birds.length; j++, k++) {
        this.birdBody.setColorAt(k, f.gull ? gullC : dark);
        this.wingL.setColorAt(k, f.gull ? gullWing : dark);
        this.wingR.setColorAt(k, f.gull ? gullWing : dark);
      }

    // ---------------------------------------------------------------- cervos
    const deerMat = this.mat(withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })));
    const FUR = '#8a5a34';
    const BELLY = '#d8c3a0';
    const body = new PartBuilder()
      .box(0.46, 0.2, 0.18, FUR, [0, 0.42, 0])
      .box(0.36, 0.05, 0.15, BELLY, [0, 0.31, 0])
      .box(0.05, 0.08, 0.07, '#f1e9da', [-0.245, 0.47, 0]);
    // pescoço e cabeça numa peça só, com origem no ombro: pastar = girar a peça inteira até o focinho tocar o chão
    const head = new PartBuilder()
      .box(0.09, 0.3, 0.09, FUR, [0.06, 0.12, 0], [0, 0, -0.45])
      .box(0.17, 0.09, 0.09, FUR, [0.19, 0.27, 0])
      .box(0.06, 0.06, 0.07, '#4a3626', [0.29, 0.25, 0])
      .box(0.03, 0.07, 0.03, FUR, [0.13, 0.34, 0.05], [0.4, 0, 0])
      .box(0.03, 0.07, 0.03, FUR, [0.13, 0.34, -0.05], [-0.4, 0, 0]);
    const antlers = new PartBuilder();
    for (const s of [1, -1]) {
      antlers.box(0.02, 0.16, 0.02, '#cdbb98', [0.14, 0.39, 0.04 * s], [0.35 * s, 0, 0.2]);
      antlers.box(0.08, 0.02, 0.02, '#cdbb98', [0.17, 0.45, 0.07 * s], [0, 0, 0.5]);
    }
    const headGeo = this.geo(head.build());
    const antlerGeo = this.geo(antlers.build());
    const legGeo = this.geo(new PartBuilder().box(0.04, 0.34, 0.04, '#6e4529', [0, -0.17, 0]).box(0.045, 0.04, 0.045, '#2a201a', [0, -0.33, 0]).build());
    // quantas manadas: proporcional ao mapa e ao pasto disponível
    const herdCount = this.pasture.length ? Math.min(lite ? 8 : 16, Math.max(4, Math.round((w * h) / (lite ? 1600 : 900)))) : 0;
    let deer = 0;
    for (let i = 0; i < herdCount; i++) {
      const home = this.freePasture();
      if (!home) break;
      const herd: Herd = { home, deer: [], fleeing: 0, flee: new THREE.Vector2() };
      const n = 3 + Math.floor(this.rng.next() * 3);
      for (let j = 0; j < n; j++) {
        herd.deer.push({
          pos: home.clone().add(new THREE.Vector2((this.rng.next() - 0.5) * 2.5, (this.rng.next() - 0.5) * 2.5)),
          heading: this.rng.next() * Math.PI * 2,
          goal: null,
          wait: this.rng.next() * 4,
          head: 0,
          gait: this.rng.next() * 6,
          speed: 0,
          stag: j === 0,
        });
      }
      deer += n;
      this.herds.push(herd);
    }
    this.deerBody = new THREE.InstancedMesh(this.geo(body.build()), deerMat, Math.max(1, deer));
    this.deerHead = new THREE.InstancedMesh(headGeo, deerMat, Math.max(1, deer));
    // chifres só nos machos (um por manada), com a mesma matriz da cabeça dele
    this.antlers = new THREE.InstancedMesh(antlerGeo, deerMat, Math.max(1, this.herds.length));
    this.antlers.count = this.herds.length;
    this.deerLegs = new THREE.InstancedMesh(legGeo, deerMat, Math.max(1, deer * 4));
    this.deerBody.count = deer;
    this.deerHead.count = deer;
    this.deerLegs.count = deer * 4;

    for (const m of [this.birdBody, this.wingL, this.wingR, this.deerBody, this.deerHead, this.antlers, this.deerLegs]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    for (const m of [this.deerBody, this.deerHead, this.antlers, this.deerLegs]) m.castShadow = true;
  }

  /** Construções atuais (canto e tamanho em células): os cervos não pisam nelas e mudam de pasto se forem cercados. */
  setBuildings(list: Iterable<{ cx: number; cy: number; size: number }>): void {
    const { width: w, height: h } = this.map;
    this.occupied.fill(0);
    for (const b of list)
      for (let y = Math.max(0, b.cy - 1); y < Math.min(h, b.cy + b.size + 1); y++)
        for (let x = Math.max(0, b.cx - 1); x < Math.min(w, b.cx + b.size + 1); x++) this.occupied[y * w + x] = 1;
  }

  private blocked(x: number, z: number): boolean {
    const cs = this.map.cellSize;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(z / cs);
    if (cx < 0 || cy < 0 || cx >= this.map.width || cy >= this.map.height) return true;
    return this.occupied[cy * this.map.width + cx] === 1;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private cellCenter(i: number): THREE.Vector2 {
    const cs = this.map.cellSize;
    return new THREE.Vector2(((i % this.map.width) + 0.2 + this.rng.next() * 0.6) * cs, (Math.floor(i / this.map.width) + 0.2 + this.rng.next() * 0.6) * cs);
  }

  private randomCell(list: number[]): THREE.Vector2 {
    if (!list.length) return new THREE.Vector2((this.map.width * this.map.cellSize) / 2, (this.map.height * this.map.cellSize) / 2);
    return this.cellCenter(list[Math.floor(this.rng.next() * list.length)]!);
  }

  /** Um pasto livre: longe das construções e das tropas e longe dos pontos iniciais das nações. */
  private freePasture(near?: THREE.Vector2): THREE.Vector2 | null {
    const cs = this.map.cellSize;
    for (let tries = 0; tries < 40; tries++) {
      const p = near ? near.clone().add(new THREE.Vector2((this.rng.next() - 0.5) * 24, (this.rng.next() - 0.5) * 24)) : this.randomCell(this.pasture);
      const ci = Math.floor(p.y / cs) * this.map.width + Math.floor(p.x / cs);
      if (!this.pasture.includes(ci) && near) continue;
      if (this.map.spawns.some((s) => Math.hypot((s.cx + 1) * cs - p.x, (s.cy + 1) * cs - p.y) < 14 * cs)) continue;
      if (this.blocked(p.x, p.y) || this.unitWithin(p, 8)) continue;
      return p;
    }
    return null;
  }

  private unitWithin(p: THREE.Vector2, r: number): { x: number; y: number } | null {
    for (const u of this.units()) if ((u.x - p.x) ** 2 + (u.y - p.y) ** 2 < r * r) return u;
    return null;
  }

  private walkable(x: number, z: number): boolean {
    const cs = this.map.cellSize;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(z / cs);
    if (cx < 0 || cy < 0 || cx >= this.map.width || cy >= this.map.height) return false;
    const t = this.map.terrain[cy * this.map.width + cx];
    return t !== Terrain.Water && t !== Terrain.Rock && t !== Terrain.Ore && !this.blocked(x, z);
  }

  /** Susto (tiro forte, explosão, bomba): os bandos perto fogem subindo e as manadas perto correm. */
  disturb(x: number, z: number, radius = 14): void {
    for (const f of this.flocks)
      if (Math.hypot(f.pos.x - x, f.pos.z - z) < radius * 1.4) {
        f.scared = 4 + this.rng.next() * 2;
        f.orbit = null;
        const away = Math.atan2(f.pos.z - z, f.pos.x - x);
        f.target.set(f.pos.x + Math.cos(away) * 40, f.pos.z + Math.sin(away) * 40);
        f.flapLeft = 4;
      }
    for (const h of this.herds) {
      const c = h.deer[0]?.pos ?? h.home;
      if (Math.hypot(c.x - x, c.y - z) < radius) this.spook(h, x, z);
    }
  }

  private spook(h: Herd, x: number, z: number): void {
    if (h.fleeing > 0) return;
    h.fleeing = 3.2;
    const c = h.deer[0]?.pos ?? h.home;
    h.flee.set(c.x - x, c.y - z).normalize();
    if (!Number.isFinite(h.flee.x)) h.flee.set(1, 0);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.updateBirds(dt);
    this.checkAcc += dt;
    const check = this.checkAcc > 0.4;
    if (check) this.checkAcc = 0;
    this.updateDeer(dt, check);
  }

  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly local = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();

  private updateBirds(dt: number): void {
    const W = this.map.width * this.map.cellSize;
    const H = this.map.height * this.map.cellSize;
    let k = 0;
    for (const f of this.flocks) {
      f.scared = Math.max(0, f.scared - dt);
      const scared = f.scared > 0;
      // rumo: térmica (círculo largo) ou voo até o próximo ponto
      let goalX = f.target.x;
      let goalY = f.target.y;
      if (f.orbit) {
        f.orbitLeft -= dt;
        const a = Math.atan2(f.pos.z - f.orbit.y, f.pos.x - f.orbit.x) + 0.9;
        goalX = f.orbit.x + Math.cos(a) * 5;
        goalY = f.orbit.y + Math.sin(a) * 5;
        if (f.orbitLeft <= 0) f.orbit = null;
      } else if (Math.hypot(f.target.x - f.pos.x, f.target.y - f.pos.z) < 3 || f.target.x < 0 || f.target.y < 0 || f.target.x > W || f.target.y > H) {
        f.target.copy(this.randomCell(f.gull ? this.water : this.land));
        if (!scared && this.rng.next() < 0.45) {
          f.orbit = new THREE.Vector2(f.pos.x, f.pos.z);
          f.orbitLeft = 8 + this.rng.next() * 8;
        }
      }
      const want = Math.atan2(goalY - f.pos.z, goalX - f.pos.x);
      const d = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
      const maxTurn = (scared ? 1.6 : 0.7) * dt;
      const step = Math.max(-maxTurn, Math.min(maxTurn, d));
      f.heading += step;
      f.turn += (step / dt - f.turn) * Math.min(1, dt * 3);
      const speed = f.speed * (scared ? 2.2 : 1);
      f.pos.x += Math.cos(f.heading) * speed * dt;
      f.pos.z += Math.sin(f.heading) * speed * dt;
      const altWant = (scared ? BIRD_ALT + 4 : BIRD_ALT + (f.gull ? -1.5 : 0)) + Math.sin(this.time * 0.2 + f.heading) * 0.8;
      f.pos.y += (altWant - f.pos.y) * Math.min(1, dt * 0.6);
      // bater asas em rajadas e planar (gaivotas planam mais)
      let flapping = true;
      if (f.flapLeft > 0) {
        f.flapLeft -= dt;
        if (f.flapLeft <= 0) f.glideLeft = scared ? 0.3 : (f.gull ? 2.5 : 1.2) + this.rng.next() * 1.5;
      } else {
        f.glideLeft -= dt;
        flapping = false;
        if (f.glideLeft <= 0) f.flapLeft = scared ? 3 : 0.8 + this.rng.next() * 1.5;
      }
      const bank = Math.max(-0.7, Math.min(0.7, f.turn * 0.9));
      const cos = Math.cos(f.heading);
      const sin = Math.sin(f.heading);
      for (const b of f.birds) {
        // cada pássaro oscila um pouco em volta do seu lugar no bando
        const ox = b.off.x + Math.sin(this.time * 0.7 + b.phase) * 0.15;
        const oz = b.off.z + Math.cos(this.time * 0.5 + b.phase) * 0.2;
        const oy = b.off.y + Math.sin(this.time * 1.3 + b.phase) * 0.1;
        this.v.set(f.pos.x + cos * ox - sin * oz, f.pos.y + oy, f.pos.z + sin * ox + cos * oz);
        this.e.set(bank, -f.heading, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        const sc = f.gull ? 1.35 : 1;
        this.s.setScalar(sc);
        this.m4.compose(this.v, this.q, this.s);
        this.birdBody.setMatrixAt(k, this.m4);
        const rate = f.gull ? FLAP * 0.7 : FLAP * (scared ? 1.3 : 1);
        const flap = flapping ? Math.sin(this.time * rate + b.phase) * 0.75 : 0.12 + Math.sin(this.time * 2 + b.phase) * 0.05;
        this.local.makeRotationX(-flap);
        this.wingR.setMatrixAt(k, this.local.premultiply(this.m4));
        this.local.makeRotationX(flap);
        this.wingL.setMatrixAt(k, this.local.premultiply(this.m4));
        k++;
      }
    }
    for (const m of [this.birdBody, this.wingL, this.wingR]) m.instanceMatrix.needsUpdate = true;
  }

  private updateDeer(dt: number, check: boolean): void {
    let k = 0;
    let a = 0;
    for (const h of this.herds) {
      const lead = h.deer[0]!;
      // perigo: tropa perto (a manada levanta a cabeça e foge) e pasto tomado por construção (muda de lugar)
      if (check && h.fleeing <= 0) {
        const u = this.unitWithin(lead.pos, 5.5);
        if (u) this.spook(h, u.x, u.y);
        else if (this.blocked(h.home.x, h.home.y)) {
          const p = this.freePasture(h.home);
          if (p) h.home.copy(p);
        }
      }
      if (h.fleeing > 0) {
        h.fleeing -= dt;
        if (h.fleeing <= 0) {
          // para onde chegou vira o pasto novo, se for um bom lugar; senão procura outro por perto
          if (this.walkable(lead.pos.x, lead.pos.y) && !this.unitWithin(lead.pos, 7)) h.home.copy(lead.pos);
          else {
            const p = this.freePasture(lead.pos);
            if (p) h.home.copy(p);
          }
        }
      }
      for (const d of h.deer) {
        if (h.fleeing > 0) {
          const dir = Math.atan2(h.flee.y, h.flee.x) + Math.sin(d.gait * 0.3) * 0.25;
          const nx = d.pos.x + Math.cos(dir) * 4 * dt;
          const nz = d.pos.y + Math.sin(dir) * 4 * dt;
          if (this.walkable(nx, nz)) {
            d.pos.set(nx, nz);
            d.heading = dir;
          } else h.flee.rotateAround(new THREE.Vector2(), 0.9);
          d.speed = 4;
          d.head += (1 - d.head) * Math.min(1, dt * 8);
          d.goal = null;
          d.wait = 0.5 + this.rng.next();
        } else if (d.goal) {
          const dx = d.goal.x - d.pos.x;
          const dz = d.goal.y - d.pos.y;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.1) {
            d.goal = null;
            d.wait = 2 + this.rng.next() * 6;
            d.speed = 0;
          } else {
            const want = Math.atan2(dz, dx);
            d.heading += Math.atan2(Math.sin(want - d.heading), Math.cos(want - d.heading)) * Math.min(1, dt * 3);
            const step = Math.min(dist, 0.7 * dt);
            d.pos.x += Math.cos(d.heading) * step;
            d.pos.y += Math.sin(d.heading) * step;
            d.speed = 0.7;
          }
          d.head += (0.7 - d.head) * Math.min(1, dt * 3);
        } else {
          // pastando: cabeça baixa, de vez em quando ergue para olhar em volta, depois anda alguns passos
          d.wait -= dt;
          d.speed = 0;
          const look = Math.sin(this.time * 0.6 + d.gait) > 0.85 ? 1 : 0;
          d.head += (look - d.head) * Math.min(1, dt * 2.5);
          if (d.wait <= 0) {
            const g = h.home.clone().add(new THREE.Vector2((this.rng.next() - 0.5) * 3, (this.rng.next() - 0.5) * 3));
            if (this.walkable(g.x, g.y)) d.goal = g;
            else d.wait = 1;
          }
        }
        d.gait += dt * (d.speed > 2 ? 11 : 6) * (d.speed > 0 ? 1 : 0);
        // corpo: galope sobe e desce
        const y = this.ground(d.pos.x, d.pos.y) + (d.speed > 2 ? Math.abs(Math.sin(d.gait)) * 0.08 : 0);
        this.v.set(d.pos.x, y, d.pos.y);
        this.e.set(0, -d.heading, d.speed > 2 ? Math.sin(d.gait) * 0.08 : 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.s.set(1, 1, 1);
        this.m4.compose(this.v, this.q, this.s);
        this.deerBody.setMatrixAt(k, this.m4);
        // pescoço girando no ombro: baixo para pastar, erguido para vigiar
        const low = 1 - d.head;
        this.local.makeTranslation(0.19, 0.48, 0).multiply(this.tmp.makeRotationZ(-1.9 * low + 0.15 * d.head));
        this.local.premultiply(this.m4);
        this.deerHead.setMatrixAt(k, this.local);
        if (d.stag) this.antlers.setMatrixAt(a++, this.local);
        // pernas: articuladas no quadril, balançando em pares opostos ao andar
        const legs: [number, number, number][] = [
          [0.17, 0.08, 0],
          [0.17, -0.08, Math.PI],
          [-0.17, 0.08, Math.PI],
          [-0.17, -0.08, 0],
        ];
        for (let l = 0; l < 4; l++) {
          const [lx, lz, ph] = legs[l]!;
          const swing = d.speed > 0 ? Math.sin(d.gait + ph) * (d.speed > 2 ? 0.7 : 0.35) : 0;
          this.local.makeTranslation(lx, 0.36, lz).multiply(this.tmp.makeRotationZ(swing));
          this.deerLegs.setMatrixAt(k * 4 + l, this.local.premultiply(this.m4));
        }
        k++;
      }
    }
    for (const m of [this.deerBody, this.deerHead, this.antlers, this.deerLegs]) m.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of [this.birdBody, this.wingL, this.wingR, this.deerBody, this.deerHead, this.antlers, this.deerLegs]) m.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
