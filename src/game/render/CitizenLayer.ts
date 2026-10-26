import * as THREE from 'three';
import { BUILDINGS, type BuildingType, type ResourceType, type Terrain } from '../../../shared/sim/config.ts';
import { findPath } from '../../../shared/sim/pathfinding/AStar.ts';
import { Grid } from '../../../shared/sim/pathfinding/Grid.ts';
import type { BuildingSnapshot } from '../../../shared/sim/snapshot.ts';
import { accentMaterial, bodyMaterial } from './materials.ts';
import { citizenModel, recruitModel } from './models/unitModels.ts';

/**
 * Cidadãos no mapa. A simulação conta a população (trabalhadores por edifício e ociosos) e decide
 * a alocação; esta camada a torna visível, um civil por cidadão real, sempre no mesmo número do
 * contador:
 * - quem ganha um posto caminha até o edifício e entra (some enquanto trabalha lá dentro);
 * - quem perde o posto sai pela porta e vira ocioso; ociosos ficam perto do QG e das casas, ou no
 *   ponto para onde o jogador os mandou;
 * - cada civil tem identidade própria: o mesmo boneco que o jogador selecionou é o que caminha
 *   para o trabalho quando a ordem é aceita (ou o ocioso mais próximo, quando a simulação aloca
 *   sozinha);
 * - recrutas da reserva treinam junto ao quartel (não são selecionáveis).
 * Ociosos e quem está a caminho podem ser selecionados; a ordem de trabalho vai para a simulação
 * (`assign_workers`), o passeio até um ponto é só visual.
 */

export type CitizenJobKind = 'gather' | 'staff' | 'idle' | 'recruit';

export interface CitizenJob {
  /** Chave estável: o mesmo cidadão continua no mesmo posto entre snapshots. */
  key: string;
  kind: CitizenJobKind;
  buildingId: number | null;
  resource: ResourceType | null;
}

/**
 * Lista de postos a partir do estado real: um por trabalhador, um por cidadão ocioso e um por
 * recruta da reserva (que treina junto ao quartel).
 */
export function citizenRoster(own: readonly BuildingSnapshot[], idle: number, recruits = 0): CitizenJob[] {
  const jobs: CitizenJob[] = [];
  for (const b of own) {
    const n = b.progress >= 1 ? (b.workers ?? 0) : 0;
    const gather = BUILDINGS[b.type].gather;
    for (let i = 0; i < n; i++) {
      jobs.push({ key: `b${b.id}:${i}`, kind: gather ? 'gather' : 'staff', buildingId: b.id, resource: gather ? gather.resource : null });
    }
  }
  for (let i = 0; i < Math.max(0, idle); i++) jobs.push({ key: `idle:${i}`, kind: 'idle', buildingId: null, resource: null });
  const barracks = own.filter((b) => b.type === 'barracks' && b.progress >= 1);
  for (let i = 0; i < Math.max(0, recruits); i++) {
    const at = barracks.length ? barracks[i % barracks.length]!.id : null;
    jobs.push({ key: `rec:${i}`, kind: 'recruit', buildingId: at, resource: null });
  }
  return jobs;
}

const HOMES: ReadonlySet<BuildingType> = new Set(['hq', 'house', 'residential']);
const SPEED = 1.5;
const MAX = 220;
/** Quanto tempo (s) uma ordem de trabalho espera a confirmação da simulação. */
const HANDOFF_SECONDS = 6;

export interface CitizenAgent {
  readonly id: number;
  job: CitizenJob;
  pos: THREE.Vector2;
  path: THREE.Vector2[];
  /** Espera parado (à toa). */
  wait: number;
  heading: number;
  phase: number;
  /** Dentro do edifício onde trabalha (não é desenhado). */
  inside: boolean;
  /** Ponto para onde o jogador mandou o ocioso (passeia em volta dele). */
  hold: THREE.Vector2 | null;
}

interface Site {
  id: number;
  type: BuildingType;
  cx: number;
  cy: number;
  size: number;
  x: number;
  y: number;
  done: boolean;
}

const isWorker = (j: CitizenJob) => j.kind === 'gather' || j.kind === 'staff';

export class CitizenLayer {
  readonly group = new THREE.Group();
  private readonly body: THREE.InstancedMesh;
  private readonly accent: THREE.InstancedMesh;
  /** Recrutas: modelo de soldado, desenhado em lote separado. */
  private readonly recBody: THREE.InstancedMesh;
  private readonly recAccent: THREE.InstancedMesh;
  /** Anel de seleção sob os civis selecionados. */
  private readonly rings: THREE.InstancedMesh;
  private readonly ringGeo = new THREE.RingGeometry(0.34, 0.46, 20).rotateX(-Math.PI / 2);
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: '#8fe0a4', transparent: true, opacity: 0.9, depthWrite: false });
  private nextId = 1;
  /** Civis com posto de trabalho (chave do posto → civil). */
  private workers = new Map<string, CitizenAgent>();
  private idle: CitizenAgent[] = [];
  private recruits = new Map<string, CitizenAgent>();
  /** Civis selecionados pelo jogador. */
  readonly selected = new Set<number>();
  /** Ordens de trabalho enviadas: civil → edifício, até a simulação confirmar. */
  private handoffs = new Map<number, { buildingId: number; until: number }>();
  private sites = new Map<number, Site>();
  private grid: Grid;
  private gridKey = '';
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private time = 0;

  constructor(
    private readonly map: { width: number; height: number; cellSize: number; terrain: Terrain[] },
    owner: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    const model = citizenModel();
    this.body = new THREE.InstancedMesh(model.body, bodyMaterial(), MAX);
    this.accent = new THREE.InstancedMesh(model.accent, accentMaterial(owner), MAX);
    const rec = recruitModel();
    this.recBody = new THREE.InstancedMesh(rec.body, bodyMaterial(), MAX);
    this.recAccent = new THREE.InstancedMesh(rec.accent, accentMaterial(owner), MAX);
    this.rings = new THREE.InstancedMesh(this.ringGeo, this.ringMat, MAX);
    for (const im of [this.body, this.accent, this.recBody, this.recAccent, this.rings]) {
      im.count = 0;
      im.castShadow = im !== this.rings;
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.grid = new Grid(map.width, map.height, map.cellSize, map.terrain);
  }

  /** Todos os civis (sem os recrutas). */
  private *civilians(): Generator<CitizenAgent> {
    yield* this.workers.values();
    yield* this.idle;
  }

  /** Atualiza os postos com o snapshot, mantendo cada civil e movendo quem mudou de posto. */
  sync(allBuildings: readonly BuildingSnapshot[], own: readonly BuildingSnapshot[], idle: number, recruits = 0): void {
    const cs = this.map.cellSize;
    this.sites.clear();
    for (const b of own) {
      const size = BUILDINGS[b.type].size;
      this.sites.set(b.id, { id: b.id, type: b.type, cx: b.cx, cy: b.cy, size, x: (b.cx + size / 2) * cs, y: (b.cy + size / 2) * cs, done: b.progress >= 1 });
    }
    // grade de caminhos com os prédios como obstáculos (refeita só quando o conjunto muda)
    const key = allBuildings.map((b) => b.id).join(',');
    if (key !== this.gridKey) {
      this.gridKey = key;
      this.grid = new Grid(this.map.width, this.map.height, cs, this.map.terrain);
      for (const b of allBuildings) this.grid.setOccupied({ cx: b.cx, cy: b.cy }, BUILDINGS[b.type].size, b.id);
    }
    const jobs = citizenRoster(own, idle, recruits);
    const workerJobs = jobs.filter(isWorker).slice(0, MAX);
    const idleCount = Math.min(Math.max(0, idle), Math.max(0, MAX - workerJobs.length));

    // quem continua no mesmo posto fica; quem perdeu o posto fica livre
    const nextWorkers = new Map<string, CitizenAgent>();
    const wanted = new Set(workerJobs.map((j) => j.key));
    const freed: CitizenAgent[] = [];
    for (const [k, a] of this.workers) {
      if (wanted.has(k)) nextWorkers.set(k, a);
      else freed.push(a);
    }
    const pool = [...this.idle];
    const take = (list: CitizenAgent[], a: CitizenAgent) => list.splice(list.indexOf(a), 1)[0]!;
    for (const job of workerJobs) {
      if (nextWorkers.has(job.key)) continue;
      const site = this.sites.get(job.buildingId!);
      // 1) o civil que o jogador mandou para este edifício; 2) o ocioso mais próximo; 3) quem saiu de outro posto; 4) um novo, de casa
      const ordered = [...pool, ...freed].find((a) => this.handoffs.get(a.id)?.buildingId === job.buildingId);
      let a: CitizenAgent | undefined = ordered ? take(pool.includes(ordered) ? pool : freed, ordered) : undefined;
      if (!a && pool.length) a = take(pool, this.nearest(pool, site));
      if (!a && freed.length) a = take(freed, this.nearest(freed, site));
      if (a) {
        this.handoffs.delete(a.id);
        this.leaveBuilding(a);
        a.hold = null;
        a.path = [];
        a.wait = 0;
      } else a = this.spawn(job);
      a.job = job;
      nextWorkers.set(job.key, a);
    }
    // ociosos: os que sobraram e os que perderam o posto (saem pela porta)
    const nextIdle: CitizenAgent[] = [];
    for (const a of [...pool, ...freed]) {
      if (nextIdle.length >= idleCount) break;
      this.leaveBuilding(a);
      a.job = { key: `idle:${a.id}`, kind: 'idle', buildingId: null, resource: null };
      nextIdle.push(a);
    }
    while (nextIdle.length < idleCount) nextIdle.push(this.spawn({ key: 'idle', kind: 'idle', buildingId: null, resource: null }));
    this.workers = nextWorkers;
    this.idle = nextIdle;

    // recrutas: postos fixos junto ao quartel
    const nextRec = new Map<string, CitizenAgent>();
    for (const job of jobs.filter((j) => j.kind === 'recruit').slice(0, MAX)) {
      const a = this.recruits.get(job.key) ?? this.spawn(job);
      a.job = job;
      nextRec.set(job.key, a);
    }
    this.recruits = nextRec;

    // seleção e ordens só valem para civis que ainda existem e estão à vista
    const alive = new Set([...this.civilians()].map((a) => a.id));
    for (const id of [...this.selected]) if (!alive.has(id)) this.selected.delete(id);
    for (const [id, h] of [...this.handoffs]) if (!alive.has(id) || h.until < this.time) this.handoffs.delete(id);
  }

  private nearest(list: CitizenAgent[], site: Site | undefined): CitizenAgent {
    if (!site) return list[0]!;
    let best = list[0]!;
    let bd = Infinity;
    for (const a of list) {
      const d = (a.pos.x - site.x) ** 2 + (a.pos.y - site.y) ** 2 + (a.inside ? 1e6 : 0);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** Quem estava dentro de um edifício reaparece na porta. */
  private leaveBuilding(a: CitizenAgent): void {
    if (!a.inside) return;
    a.inside = false;
    const site = a.job.buildingId !== null ? this.sites.get(a.job.buildingId) : undefined;
    if (site) a.pos.copy(this.doorPoint(site, site));
    a.path = [];
    a.wait = 0.5 + Math.random();
  }

  private spawn(job: CitizenJob): CitizenAgent {
    // novos cidadãos saem de casa (QG ou moradia mais próxima do posto) e caminham até ele
    const target = job.buildingId !== null ? this.sites.get(job.buildingId) : undefined;
    // recrutas saem do próprio quartel, onde foram alistados
    const home = job.kind === 'recruit' && target ? target : this.nearestHome(target ?? null);
    const start = home ? this.doorPoint(home, target ?? home) : new THREE.Vector2(this.map.width, this.map.height);
    const id = this.nextId++;
    return {
      id,
      job: job.kind === 'idle' ? { ...job, key: `idle:${id}` } : job,
      pos: start,
      path: [],
      wait: Math.random() * 0.8,
      heading: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
      inside: false,
      hold: null,
    };
  }

  private nearestHome(near: Site | null): Site | null {
    let best: Site | null = null;
    let bd = Infinity;
    for (const s of this.sites.values()) {
      if (!s.done || !HOMES.has(s.type)) continue;
      const d = near ? (s.x - near.x) ** 2 + (s.y - near.y) ** 2 : s.type === 'hq' ? 0 : 1;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Ponto livre junto ao prédio, do lado voltado para `toward`, com pequena variação. */
  private doorPoint(s: Site, toward: { x: number; y: number }): THREE.Vector2 {
    const cs = this.map.cellSize;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let y = s.cy - 1; y <= s.cy + s.size; y++)
      for (let x = s.cx - 1; x <= s.cx + s.size; x++) {
        const ring = x === s.cx - 1 || y === s.cy - 1 || x === s.cx + s.size || y === s.cy + s.size;
        if (!ring || !this.grid.isPassable(x, y)) continue;
        const wx = (x + 0.5) * cs;
        const wy = (y + 0.5) * cs;
        const d = (wx - toward.x) ** 2 + (wy - toward.y) ** 2 + Math.random() * cs * cs * 2;
        if (d < bd) {
          bd = d;
          best = [wx, wy];
        }
      }
    if (!best) return new THREE.Vector2(s.x, s.y);
    return new THREE.Vector2(best[0] + (Math.random() - 0.5) * cs * 0.7, best[1] + (Math.random() - 0.5) * cs * 0.7);
  }

  private route(a: CitizenAgent, to: THREE.Vector2): void {
    const cs = this.map.cellSize;
    const start = { cx: Math.floor(a.pos.x / cs), cy: Math.floor(a.pos.y / cs) };
    const goal = { cx: Math.floor(to.x / cs), cy: Math.floor(to.y / cs) };
    const cells = findPath(this.grid, start, goal, { maxExpanded: 1500 });
    a.path = cells ? cells.slice(1, -1).map((c) => new THREE.Vector2((c.cx + 0.5) * cs, (c.cy + 0.5) * cs)) : [];
    a.path.push(to);
  }

  /** Decide o próximo destino quando o cidadão termina a espera. */
  private plan(a: CitizenAgent): void {
    const site = a.job.buildingId !== null ? this.sites.get(a.job.buildingId) : undefined;
    if (isWorker(a.job) && site) {
      // a caminho do trabalho: vai até a porta e entra
      const door = this.doorPoint(site, a.pos);
      if (a.pos.distanceTo(door) < this.map.cellSize * 1.2) {
        a.inside = true;
        this.selected.delete(a.id);
        return;
      }
      this.route(a, door);
      return;
    }
    if (a.hold) {
      // mandado pelo jogador: fica por ali, com passos curtos
      const cs = this.map.cellSize;
      this.route(a, new THREE.Vector2(a.hold.x + (Math.random() - 0.5) * cs * 1.5, a.hold.y + (Math.random() - 0.5) * cs * 1.5));
      return;
    }
    const anchor = site ?? this.nearestHome(null);
    if (!anchor) {
      a.wait = 2;
      return;
    }
    // ocioso: passeio curto em volta de casa; recruta: em volta do quartel
    this.route(a, this.doorPoint(anchor, { x: anchor.x + (Math.random() - 0.5) * 8, y: anchor.y + (Math.random() - 0.5) * 8 }));
  }

  // ------------------------------------------------------------ seleção e ordens

  /** Civis à vista (fora dos edifícios), com a posição atual. */
  visible(): { id: number; x: number; y: number }[] {
    const out = [];
    for (const a of this.civilians()) if (!a.inside) out.push({ id: a.id, x: a.pos.x, y: a.pos.y });
    return out;
  }

  /** Resumo da seleção para o HUD. */
  selectionInfo(): { idle: number; going: number } | null {
    if (!this.selected.size) return null;
    let idle = 0;
    let going = 0;
    for (const a of this.civilians()) {
      if (!this.selected.has(a.id)) continue;
      if (isWorker(a.job)) going++;
      else idle++;
    }
    return { idle, going };
  }

  /**
   * Fontes da ordem de trabalho para a simulação (0 = ocioso; id do edifício = realocação) e
   * registro de quem deve caminhar para o novo posto quando a simulação confirmar.
   */
  orderWork(buildingId: number): number[] {
    const sources: number[] = [];
    for (const a of this.civilians()) {
      if (!this.selected.has(a.id) || a.job.buildingId === buildingId) continue;
      sources.push(isWorker(a.job) ? a.job.buildingId! : 0);
      this.handoffs.set(a.id, { buildingId, until: this.time + HANDOFF_SECONDS });
    }
    return sources;
  }

  /** Manda os ociosos selecionados até um ponto (só visual: continuam ociosos). */
  orderMove(p: { x: number; y: number }): number {
    let n = 0;
    for (const a of this.idle) {
      if (!this.selected.has(a.id)) continue;
      a.hold = new THREE.Vector2(p.x, p.y);
      this.route(a, new THREE.Vector2(p.x + (Math.random() - 0.5) * 1.2, p.y + (Math.random() - 0.5) * 1.2));
      n++;
    }
    return n;
  }

  update(dt: number): void {
    this.time += dt;
    let i = 0;
    let r = 0;
    let s = 0;
    for (const a of [...this.civilians(), ...this.recruits.values()]) {
      if (a.inside) continue;
      if (a.path.length > 0) {
        const t = a.path[0]!;
        const dx = t.x - a.pos.x;
        const dy = t.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        const step = SPEED * dt;
        if (d <= step) {
          a.pos.copy(t);
          a.path.shift();
          if (a.path.length === 0) {
            // chegou: o trabalhador entra; os demais ficam um pouco à toa
            if (isWorker(a.job)) {
              a.inside = true;
              this.selected.delete(a.id);
              continue;
            }
            a.wait = a.hold ? 4 + Math.random() * 6 : 2 + Math.random() * 6;
          }
        } else {
          a.pos.x += (dx / d) * step;
          a.pos.y += (dy / d) * step;
          a.heading = Math.atan2(-dy, dx);
        }
      } else {
        a.wait -= dt;
        if (a.wait <= 0) this.plan(a);
        if (a.inside) continue;
      }
      const moving = a.path.length > 0;
      if (a.job.kind === 'recruit') {
        if (r >= MAX) continue;
        // recrutas em treino: marcha com passo firme
        const yb = this.heightAt(a.pos.x, a.pos.y) + (moving ? Math.abs(Math.sin((this.time + a.phase) * 7)) * 0.05 : 0);
        this.q.setFromEuler(new THREE.Euler(0, a.heading, 0));
        this.m.compose(new THREE.Vector3(a.pos.x, yb, a.pos.y), this.q, new THREE.Vector3(1, 1, 1));
        this.recBody.setMatrixAt(r, this.m);
        this.recAccent.setMatrixAt(r, this.m);
        r++;
        continue;
      }
      if (i >= MAX) continue;
      const bob = moving ? Math.abs(Math.sin((this.time + a.phase) * 9)) * 0.06 : 0;
      const ground = this.heightAt(a.pos.x, a.pos.y);
      this.q.setFromEuler(new THREE.Euler(0, a.heading, 0));
      this.m.compose(new THREE.Vector3(a.pos.x, ground + bob, a.pos.y), this.q, new THREE.Vector3(1, 1, 1));
      this.body.setMatrixAt(i, this.m);
      this.accent.setMatrixAt(i, this.m);
      i++;
      if (this.selected.has(a.id) && s < MAX) {
        this.m.makeTranslation(a.pos.x, ground + 0.05, a.pos.y);
        this.rings.setMatrixAt(s++, this.m);
      }
    }
    for (const [im, n] of [
      [this.body, i],
      [this.accent, i],
      [this.recBody, r],
      [this.recAccent, r],
      [this.rings, s],
    ] as const) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  get count(): number {
    return this.workers.size + this.idle.length + this.recruits.size;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const im of [this.body, this.accent, this.recBody, this.recAccent, this.rings]) im.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
  }
}
