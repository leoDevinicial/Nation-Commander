import { CARAVAN, ROAD, TICK_RATE, Terrain } from './config.ts';
import { findPath } from './pathfinding/AStar.ts';
import type { Simulation } from './Simulation.ts';
import { TRADE } from './trade.ts';
import type { Building, EntityId, Slot, Vec2 } from './types.ts';

/**
 * Caravanas internas (docs/CARAVANAS.md): cada prefeitura pronta mantém um caminhão de carga indo e
 * voltando até o Centro de Comando do mesmo dono, sem comando do jogador.
 * - Cada chegada (no QG ou na prefeitura) rende suprimentos proporcionais ao comprimento da rota.
 * - A rota é refeita a cada viagem pelo pathfinding: estradas novas entram no caminho e
 *   território de quem está em guerra com o dono é evitado.
 * - Na estrada a caravana anda mais rápido (o mesmo bônus dos comboios do comércio).
 * - Tropas ou torres de quem está em guerra com o dono destroem a caravana no caminho; uma nova sai
 *   do QG depois de um tempo.
 */
export type CaravanState = 'moving' | 'unloading' | 'blocked' | 'destroyed';

export interface Caravan {
  id: number;
  owner: Slot;
  /** Prefeitura atendida. */
  cityId: EntityId;
  /** Para onde vai agora. */
  to: 'city' | 'hq';
  path: Vec2[];
  pathLength: number;
  travelled: number;
  state: CaravanState;
  /** Ticks restantes de descarga, nova tentativa de rota ou reposição. */
  timer: number;
  /** Suprimentos entregues na última chegada. */
  lastIncome: number;
}

export interface CaravanSave {
  nextId: number;
  caravans: Caravan[];
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function polyLength(p: Vec2[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1]!, p[i]!);
  return s;
}

/** Suprimentos que uma chegada rende numa rota deste comprimento (mundo). */
export function caravanIncome(pathLength: number): number {
  return Math.round(pathLength * CARAVAN.suppliesPerWorld);
}

export class CaravanSystem {
  nextId = 1;
  caravans: Caravan[] = [];

  constructor(private readonly sim: Simulation) {}

  toSave(): CaravanSave {
    return JSON.parse(JSON.stringify({ nextId: this.nextId, caravans: this.caravans })) as CaravanSave;
  }

  load(s: CaravanSave | undefined): void {
    if (!s) return;
    const c = JSON.parse(JSON.stringify(s)) as CaravanSave;
    this.nextId = c.nextId;
    this.caravans = c.caravans;
  }

  /** Caravana da prefeitura (do dono atual), se houver. */
  forCity(cityId: EntityId): Caravan | undefined {
    const city = this.sim.buildings.find((b) => b.id === cityId);
    return this.caravans.find((c) => c.cityId === cityId && (!city || c.owner === city.owner));
  }

  step(): void {
    if (this.sim.battle) return;
    if (this.sim.tick % TICK_RATE === 0) this.sync();
    for (const c of this.caravans) this.advance(c);
  }

  /** Posição atual no mapa (para desenhar e para emboscadas). */
  position(c: Caravan): Vec2 {
    if (!c.path.length) return { x: 0, y: 0 };
    let left = c.travelled;
    for (let i = 1; i < c.path.length; i++) {
      const a = c.path[i - 1]!;
      const b = c.path[i]!;
      const d = dist(a, b);
      if (left <= d) {
        const k = d > 0 ? left / d : 0;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      left -= d;
    }
    return { ...c.path[c.path.length - 1]! };
  }

  /** Direção do movimento (radianos no plano). */
  heading(c: Caravan): number {
    const p = this.position(c);
    const ahead = this.position({ ...c, travelled: Math.min(c.pathLength, c.travelled + 0.5) });
    return Math.atan2(ahead.y - p.y, ahead.x - p.x);
  }

  /** Uma caravana por prefeitura pronta, do dono atual; some quando a prefeitura cai ou troca de dono. */
  private sync(): void {
    const cities = this.sim.buildings.filter((b) => b.type === 'city_hall' && b.progress >= 1 && b.hp > 0);
    this.caravans = this.caravans.filter((c) => cities.some((b) => b.id === c.cityId && b.owner === c.owner) && !this.sim.players[c.owner]?.defeated);
    for (const city of cities) {
      if (this.caravans.some((c) => c.cityId === city.id)) continue;
      if (!this.sim.hqOf(city.owner)) continue;
      const c: Caravan = { id: this.nextId++, owner: city.owner, cityId: city.id, to: 'city', path: [], pathLength: 0, travelled: 0, state: 'blocked', timer: 0, lastIncome: 0 };
      this.caravans.push(c);
      this.depart(c);
    }
  }

  private endpoints(c: Caravan): { hq: Building; city: Building } | null {
    const hq = this.sim.hqOf(c.owner);
    const city = this.sim.buildings.find((b) => b.id === c.cityId);
    return hq && city ? { hq, city } : null;
  }

  /** Sai rumo à ponta `c.to`, com rota nova; sem rota, espera e tenta de novo. */
  private depart(c: Caravan): void {
    const ends = this.endpoints(c);
    const path = ends ? this.route(c.owner, c.to === 'city' ? ends.hq.pos : ends.city.pos, c.to === 'city' ? ends.city.pos : ends.hq.pos) : null;
    if (!path) {
      c.state = 'blocked';
      c.timer = CARAVAN.retrySeconds * TICK_RATE;
      if (ends) c.path = [{ ...(c.to === 'city' ? ends.hq.pos : ends.city.pos) }];
      c.travelled = 0;
      c.pathLength = 0;
      return;
    }
    c.path = path;
    c.pathLength = polyLength(path);
    c.travelled = 0;
    c.state = 'moving';
    c.timer = 0;
  }

  /** Trajeto terrestre pelo pathfinding, evitando território de quem está em guerra com o dono. */
  private route(owner: Slot, a: Vec2, b: Vec2): Vec2[] | null {
    const g = this.sim.grid;
    const start = g.nearestPassable(g.worldToCell(a), 4);
    const goal = g.nearestPassable(g.worldToCell(b), 4);
    if (!start || !goal) return null;
    g.blocker = (cx, cy) => {
      const o = this.sim.territoryOwner(cx, cy);
      return o >= 0 && o !== owner && this.sim.hostile(owner, o);
    };
    try {
      const cells = findPath(g, start, goal, { maxExpanded: g.width * g.height });
      if (!cells) return null;
      // um ponto a cada 3 células: o caminhão segue a via sem tremer
      const pts = cells.filter((_, i) => i % 3 === 0 || i === cells.length - 1).map((cell) => g.cellCenter(cell));
      return [{ ...a }, ...pts, { ...b }];
    } finally {
      g.blocker = null;
    }
  }

  private advance(c: Caravan): void {
    if (c.state === 'destroyed' || c.state === 'blocked') {
      if (--c.timer > 0) return;
      if (c.state === 'destroyed') c.to = 'city';
      this.depart(c);
      return;
    }
    if (c.state === 'unloading') {
      if (--c.timer > 0) return;
      c.to = c.to === 'city' ? 'hq' : 'city';
      this.depart(c);
      return;
    }
    const pos = this.position(c);
    let speed = CARAVAN.speed;
    const cell = this.sim.grid.worldToCell(pos);
    if (this.sim.grid.inBounds(cell.cx, cell.cy) && this.sim.map.terrain[cell.cy * this.sim.map.width + cell.cx] === Terrain.Road) speed *= ROAD.convoyMul;
    c.travelled = Math.min(c.pathLength, c.travelled + speed / TICK_RATE);
    if (this.sim.tick % 5 === 0 && this.sim.hostileNear(c.owner, this.position(c), TRADE.ambushRange)) {
      this.destroy(c);
      return;
    }
    if (c.travelled >= c.pathLength - 1e-6) this.arrive(c);
  }

  private arrive(c: Caravan): void {
    const amount = caravanIncome(c.pathLength);
    const got = amount > 0 ? this.sim.storeFromTrade(c.owner, 'supplies', amount) : 0;
    const p = this.sim.players[c.owner];
    if (p) p.stats.resourcesGathered += got;
    c.lastIncome = got;
    c.state = 'unloading';
    c.timer = CARAVAN.unloadSeconds * TICK_RATE;
  }

  private destroy(c: Caravan): void {
    const pos = this.position(c);
    const city = this.sim.buildings.find((b) => b.id === c.cityId);
    c.state = 'destroyed';
    c.timer = CARAVAN.respawnSeconds * TICK_RATE;
    c.lastIncome = 0;
    const hq = this.sim.hqOf(c.owner);
    c.path = hq ? [{ ...hq.pos }] : [];
    c.pathLength = 0;
    c.travelled = 0;
    this.sim.emitTrade({ type: 'caravan_lost', tick: this.sim.tick, owner: c.owner, cityId: c.cityId, city: (city && this.sim.cityName(city)) ?? 'Prefeitura', pos });
  }
}
