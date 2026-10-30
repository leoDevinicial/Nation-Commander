import { BUILDINGS, CARAVAN, ROAD, TICK_RATE, Terrain } from './config.ts';
import type { Simulation } from './Simulation.ts';
import { TRADE } from './trade.ts';
import type { Building, Cell, EntityId, Slot, Vec2 } from './types.ts';

/**
 * Caravanas internas (docs/CARAVANAS.md): cada prefeitura pronta mantém um caminhão de carga indo e
 * voltando até o Centro de Comando do mesmo dono, sem comando do jogador.
 * - A caravana só anda por estrada: precisa de uma ligação contínua de células de estrada (a do
 *   jogador ou a de terra do mapa) encostando no QG e na prefeitura. Sem ligação, fica parada.
 * - Cada chegada (no QG ou na prefeitura) rende suprimentos proporcionais ao comprimento da rota.
 * - A rota é refeita a cada viagem: estradas novas entram no caminho e território de quem está em
 *   guerra com o dono não é atravessado.
 * - Na estrada a caravana anda mais rápido (o mesmo bônus dos comboios do comércio).
 * - Tropas ou torres de quem está em guerra com o dono destroem a caravana no caminho; uma nova sai
 *   do QG depois de um tempo.
 */
/** `no_road`: sem estrada contínua (e livre de território inimigo em guerra) até a outra ponta. */
export type CaravanState = 'moving' | 'unloading' | 'no_road' | 'destroyed';

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
    // salvamentos antigos: o antigo estado de espera ('blocked') vira "sem estrada" e tenta de novo
    this.caravans = c.caravans.map((x) => ((x.state as string) === 'blocked' ? { ...x, state: 'no_road' as const } : x));
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
      const c: Caravan = { id: this.nextId++, owner: city.owner, cityId: city.id, to: 'city', path: [], pathLength: 0, travelled: 0, state: 'no_road', timer: 0, lastIncome: 0 };
      this.caravans.push(c);
      this.depart(c);
    }
  }

  private endpoints(c: Caravan): { hq: Building; city: Building } | null {
    const hq = this.sim.hqOf(c.owner);
    const city = this.sim.buildings.find((b) => b.id === c.cityId);
    return hq && city ? { hq, city } : null;
  }

  /** Sai rumo à ponta `c.to`, com rota nova pela estrada; sem ligação, espera e tenta de novo. */
  private depart(c: Caravan): void {
    const ends = this.endpoints(c);
    const path = ends ? (c.to === 'city' ? this.route(c.owner, ends.hq, ends.city) : this.route(c.owner, ends.city, ends.hq)) : null;
    if (!path) {
      c.state = 'no_road';
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

  /** Trajeto pela estrada de `from` até `to`, ou null se não houver ligação (ver `roadLink`). */
  private route(owner: Slot, from: Building, to: Building): Vec2[] | null {
    const cells = roadLink(this.sim, owner, from, to);
    if (!cells) return null;
    const g = this.sim.grid;
    // um ponto a cada 2 células (e nas curvas): o caminhão segue a via sem tremer
    const pts: Vec2[] = [];
    for (let i = 0; i < cells.length; i++) {
      const prev = cells[i - 1];
      const next = cells[i + 1];
      const turn = prev && next && (prev.cx - cells[i]!.cx !== cells[i]!.cx - next.cx || prev.cy - cells[i]!.cy !== cells[i]!.cy - next.cy);
      if (i === 0 || i === cells.length - 1 || turn || i % 2 === 0) pts.push(g.cellCenter(cells[i]!));
    }
    return [{ ...from.pos }, ...pts, { ...to.pos }];
  }

  private advance(c: Caravan): void {
    if (c.state === 'destroyed' || c.state === 'no_road') {
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

/** Células de estrada coladas ao edifício (inclusive na diagonal), como no "bairro pavimentado". */
export function roadRing(sim: Simulation, b: Building): number[] {
  const size = BUILDINGS[b.type].size;
  const W = sim.map.width;
  const out: number[] = [];
  for (let dy = -1; dy <= size; dy++)
    for (let dx = -1; dx <= size; dx++) {
      if (dx >= 0 && dx < size && dy >= 0 && dy < size) continue;
      const cx = b.cell.cx + dx;
      const cy = b.cell.cy + dy;
      if (sim.grid.inBounds(cx, cy) && sim.map.terrain[cy * W + cx] === Terrain.Road) out.push(cy * W + cx);
    }
  return out;
}

/**
 * Ligação por estrada entre dois edifícios: o caminho mais curto (busca em largura, só pelas
 * vizinhas norte/sul/leste/oeste) por células de estrada, saindo de uma célula colada a `from` e
 * chegando a uma colada a `to`, sem atravessar território de quem está em guerra com o dono.
 * Retorna as células do caminho ou null se não houver ligação.
 */
export function roadLink(sim: Simulation, owner: Slot, from: Building, to: Building): Cell[] | null {
  const W = sim.map.width;
  const H = sim.map.height;
  const goals = new Set(roadRing(sim, to));
  if (!goals.size) return null;
  const free = (i: number) => {
    const o = sim.territory[i] ?? -1;
    return !(o >= 0 && o !== owner && sim.hostile(owner, o));
  };
  const prev = new Int32Array(W * H).fill(-2);
  const queue: number[] = [];
  for (const i of roadRing(sim, from)) {
    if (!free(i) || prev[i] !== -2) continue;
    prev[i] = -1;
    queue.push(i);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    if (goals.has(i)) {
      const path: Cell[] = [];
      for (let k = i; k !== -1; k = prev[k]!) path.push({ cx: k % W, cy: Math.floor(k / W) });
      return path.reverse();
    }
    const cx = i % W;
    const cy = Math.floor(i / W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (prev[n] !== -2 || sim.map.terrain[n] !== Terrain.Road || !free(n)) continue;
      prev[n] = i;
      queue.push(n);
    }
  }
  return null;
}

/**
 * Rede de estradas do dono a partir do Centro de Comando e das prefeituras prontas: as células de
 * estrada alcançáveis por elas (vizinhas norte/sul/leste/oeste), sem atravessar território de quem
 * está em guerra com o dono. Um edifício encostado numa dessas células está "ligado por estrada".
 */
export function roadNetwork(sim: Simulation, owner: Slot): Set<number> {
  const W = sim.map.width;
  const H = sim.map.height;
  const free = (i: number) => {
    const o = sim.territory[i] ?? -1;
    return !(o >= 0 && o !== owner && sim.hostile(owner, o));
  };
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const b of sim.buildings) {
    if (b.owner !== owner || b.hp <= 0 || b.progress < 1 || (b.type !== 'hq' && b.type !== 'city_hall')) continue;
    for (const i of roadRing(sim, b))
      if (!seen.has(i) && free(i)) {
        seen.add(i);
        queue.push(i);
      }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const cx = i % W;
    const cy = Math.floor(i / W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (seen.has(n) || sim.map.terrain[n] !== Terrain.Road || !free(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}
