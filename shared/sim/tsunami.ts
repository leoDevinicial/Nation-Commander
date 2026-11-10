/**
 * Tsunami (11/11): ogiva nuclear que explode na água levanta uma onda que corre pela água a partir do ponto da
 * explosão, perdendo força até sumir. Ela contorna ilhas e continentes (anda só pela água; a distância é medida pelo
 * caminho na água), afunda ou avaria todo navio que alcança, de qualquer nação, inclusive de quem lançou, e invade a
 * costa por `coastCells` células, danificando construções e matando tropas nessa faixa.
 *
 * Determinístico: o campo de distâncias sai só do mapa (a água não muda durante a partida) e do ponto da explosão;
 * o salvamento guarda só a origem, o início e quem já foi atingido.
 */
import { BUILDINGS, TICK_RATE, Terrain } from './config.ts';
import { canHit } from './targeting.ts';
import type { Entity, EntityId, MapData, SimEvent, Slot, Vec2 } from './types.ts';

export const TSUNAMI = {
  /** Velocidade da frente da onda (células por segundo). */
  speed: 4,
  /** Distância máxima pela água (células): depois disso a onda sumiu. */
  reach: 40,
  /** Quantas células a onda avança terra adentro a partir da margem (3 desde 11/11: "mais destrutivo"). */
  coastCells: 3,
  /**
   * Dano nos navios junto da explosão; cai com o quadrado da distância até zero no alcance máximo: perto afunda até o
   * porta-aviões (2.600) com folga, até uns 20 células afunda uma fragata (900); mais longe, avaria.
   */
  shipDamage: 4500,
  /** Dano na faixa da costa (construções e tropas) junto da explosão: portos e casas da margem caem até ~25 células. */
  coastDamage: 2600,
};

export interface TsunamiSave {
  owner: Slot;
  /** Célula da explosão. */
  cx: number;
  cy: number;
  startTick: number;
  hit: EntityId[];
}

/** O que o tsunami precisa da simulação. */
export interface TsunamiHost {
  readonly map: MapData;
  readonly tick: number;
  readonly entities: Map<EntityId, Entity>;
  damageUnit(u: Extract<Entity, { kind: 'unit' }>, dmg: number, attacker: Slot): boolean;
  damageBuilding(b: Extract<Entity, { kind: 'building' }>, dmg: number, attacker: Slot): boolean;
  /** Derruba a mata da célula (vira planície e a floresta perde a madeira dela), como a estrada faz. */
  clearForestCell(i: number): void;
  emitTrade(e: SimEvent): void;
}

const WATER = Terrain.Water as number;

/**
 * Distância (em células, pelo caminho) da explosão até cada célula alcançada: pela água em 8 direções (diagonal √2),
 * e da margem até `coastCells` passos terra adentro. Infinity onde a onda não chega.
 */
export function tsunamiField(map: MapData, cx: number, cy: number): Float32Array {
  const W = map.width;
  const H = map.height;
  const dist = new Float32Array(W * H).fill(Infinity);
  const start = cy * W + cx;
  if (cx < 0 || cy < 0 || cx >= W || cy >= H || map.terrain[start] !== WATER) return dist;
  // Dijkstra pela água com fila de prioridade simples (heap binário de índices)
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (dist[heap[p]!]! < dist[heap[k]!]! || (dist[heap[p]!] === dist[heap[k]!] && heap[p]! < heap[k]!)) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        const less = (a: number, b: number) => dist[heap[a]!]! < dist[heap[b]!]! || (dist[heap[a]!] === dist[heap[b]!] && heap[a]! < heap[b]!);
        if (l < heap.length && less(l, m)) m = l;
        if (r < heap.length && less(r, m)) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  dist[start] = 0;
  push(start);
  const done = new Uint8Array(W * H);
  const steps: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const d = dist[i]!;
    if (d > TSUNAMI.reach) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy, c] of steps) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (map.terrain[n] !== WATER || done[n]) continue;
      const nd = d + c;
      if (nd < dist[n]!) {
        dist[n] = nd;
        push(n);
      }
    }
  }
  // costa: da água alcançada, até `coastCells` passos terra adentro (busca em camadas, sempre pela menor distância)
  let frontier: number[] = [];
  for (let i = 0; i < dist.length; i++) if (map.terrain[i] === WATER && dist[i]! <= TSUNAMI.reach) frontier.push(i);
  for (let layer = 0; layer < TSUNAMI.coastCells; layer++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy, c] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (map.terrain[n] === WATER) continue;
        const nd = dist[i]! + c;
        if (nd < dist[n]!) {
          if (dist[n] === Infinity) next.push(n);
          dist[n] = nd;
        }
      }
    }
    frontier = next;
  }
  return dist;
}

interface Wave extends TsunamiSave {
  field: Float32Array | null;
  hitSet: Set<EntityId>;
  /** Células de mata ao alcance, da mais perto à mais longe (derrubadas quando a frente passa), e quantas já passaram. */
  forest: number[] | null;
  felled: number;
}

/** Células de mata que a onda alcança, em ordem de chegada (distância, depois índice: determinístico). */
export function tsunamiForest(map: MapData, field: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < field.length; i++) if (field[i]! < Infinity && map.terrain[i] === (Terrain.Forest as number)) out.push(i);
  return out.sort((a, b) => field[a]! - field[b]! || a - b);
}

export class TsunamiSystem {
  private waves: Wave[] = [];

  constructor(private readonly host: TsunamiHost) {}

  get active(): number {
    return this.waves.length;
  }

  /** Ogiva nuclear explodiu em `at`: se for na água, a onda começa. */
  detonate(owner: Slot, at: Vec2): boolean {
    const cs = this.host.map.cellSize;
    const cx = Math.floor(at.x / cs);
    const cy = Math.floor(at.y / cs);
    const { width: W, height: H } = this.host.map;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || this.host.map.terrain[cy * W + cx] !== WATER) return false;
    this.waves.push({ owner, cx, cy, startTick: this.host.tick, hit: [], field: null, hitSet: new Set(), forest: null, felled: 0 });
    this.host.emitTrade({
      type: 'tsunami',
      tick: this.host.tick,
      owner,
      pos: { x: (cx + 0.5) * cs, y: (cy + 0.5) * cs },
      speed: TSUNAMI.speed * cs,
      radius: TSUNAMI.reach * cs,
    });
    return true;
  }

  /** Distância (células) da onda até a entidade: a menor das células que ela ocupa. */
  private reachOf(field: Float32Array, e: Entity): number {
    const W = this.host.map.width;
    const cs = this.host.map.cellSize;
    if (e.kind === 'unit') {
      const x = Math.floor(e.pos.x / cs);
      const y = Math.floor(e.pos.y / cs);
      return x < 0 || y < 0 || x >= W || y >= this.host.map.height ? Infinity : field[y * W + x]!;
    }
    const size = BUILDINGS[e.type].size;
    let best = Infinity;
    for (let y = e.cell.cy; y < e.cell.cy + size; y++) for (let x = e.cell.cx; x < e.cell.cx + size; x++) best = Math.min(best, field[y * W + x] ?? Infinity);
    return best;
  }

  step(): void {
    if (!this.waves.length) return;
    const t = this.host.tick;
    for (const w of this.waves) {
      w.field ??= tsunamiField(this.host.map, w.cx, w.cy);
      const front = ((t - w.startTick) / TICK_RATE) * TSUNAMI.speed;
      // a mata por onde a onda passa é arrancada (o cliente repete a mesma conta a partir do evento)
      w.forest ??= tsunamiForest(this.host.map, w.field);
      while (w.felled < w.forest.length && w.field[w.forest[w.felled]!]! <= front) {
        const i = w.forest[w.felled++]!;
        if (this.host.map.terrain[i] === (Terrain.Forest as number)) this.host.clearForestCell(i);
      }
      // todo o mundo que a frente já alcançou e ainda não foi atingido (navio que entra depois na área molhada, não)
      for (const e of this.host.entities.values()) {
        if (e.hp <= 0 || w.hitSet.has(e.id) || !canHit(null, e)) continue;
        const d = this.reachOf(w.field, e);
        if (d > front || d > TSUNAMI.reach + TSUNAMI.coastCells) continue;
        w.hitSet.add(e.id);
        w.hit.push(e.id);
        const f = Math.max(0, 1 - d / (TSUNAMI.reach + TSUNAMI.coastCells)) ** 2;
        const onWater = e.kind === 'unit' && this.host.map.terrain[Math.floor(e.pos.y / this.host.map.cellSize) * this.host.map.width + Math.floor(e.pos.x / this.host.map.cellSize)] === WATER;
        const dmg = (onWater ? TSUNAMI.shipDamage : TSUNAMI.coastDamage) * f;
        if (dmg <= 0) continue;
        if (e.kind === 'unit') this.host.damageUnit(e, dmg, w.owner);
        else this.host.damageBuilding(e, dmg, w.owner);
      }
    }
    // a onda sumiu depois de percorrer o alcance e a faixa da costa
    this.waves = this.waves.filter((w) => ((t - w.startTick) / TICK_RATE) * TSUNAMI.speed <= TSUNAMI.reach + TSUNAMI.coastCells + 1);
  }

  toSave(): TsunamiSave[] {
    return this.waves.map(({ owner, cx, cy, startTick, hit }) => ({ owner, cx, cy, startTick, hit: [...hit] }));
  }

  load(saves: readonly TsunamiSave[] | undefined): void {
    this.waves = (saves ?? []).map((s) => ({ ...s, hit: [...s.hit], field: null, hitSet: new Set(s.hit), forest: null, felled: 0 }));
  }
}
