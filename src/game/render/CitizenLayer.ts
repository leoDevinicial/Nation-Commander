import * as THREE from 'three';
import { BUILDINGS, type BuildingType, type ResourceType, type Terrain } from '../../../shared/sim/config.ts';
import { findPath } from '../../../shared/sim/pathfinding/AStar.ts';
import { Grid } from '../../../shared/sim/pathfinding/Grid.ts';
import type { BuildingSnapshot } from '../../../shared/sim/snapshot.ts';
import { accentMaterial, bodyMaterial } from './materials.ts';
import { citizenModel, recruitModel } from './models/unitModels.ts';

/**
 * Cidadãos no mapa. A simulação conta a população (trabalhadores por edifício e ociosos) e decide
 * a alocação; esta camada só a torna visível: um civil por cidadão real, sempre no mesmo número
 * do contador. Trabalhadores de coleta levam a carga até o depósito do recurso (silo, armazém,
 * tanque ou QG); os de quartel e fábrica circulam junto ao prédio; ociosos ficam perto do QG e
 * das casas. Não são selecionáveis e não afetam o jogo.
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

/** Edifício mais próximo que armazena o recurso (o QG guarda de tudo). */
export function dropoffFor(resource: ResourceType, from: { x: number; y: number }, own: readonly { type: BuildingType; x: number; y: number; done: boolean }[]): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const b of own) {
    if (!b.done || !(BUILDINGS[b.type].storage[resource] ?? 0)) continue;
    const d = (b.x - from.x) ** 2 + (b.y - from.y) ** 2;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

const HOMES: ReadonlySet<BuildingType> = new Set(['hq', 'house', 'residential']);
const SPEED = 1.5;
const MAX = 220;
const CARGO_COLOR: Record<ResourceType, string> = {
  supplies: '#8a8160',
  food: '#c9b452',
  wood: '#8a6a45',
  stone: '#9a968d',
  iron: '#7e858c',
  oil: '#2a2724',
};

interface Agent {
  job: CitizenJob;
  pos: THREE.Vector2;
  path: THREE.Vector2[];
  /** Espera parado (trabalhando, descarregando ou à toa). */
  wait: number;
  heading: number;
  carry: ResourceType | null;
  /** Próxima perna da rotina de coleta. */
  leg: 'toWork' | 'toDrop';
  phase: number;
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

export class CitizenLayer {
  readonly group = new THREE.Group();
  private readonly body: THREE.InstancedMesh;
  private readonly accent: THREE.InstancedMesh;
  private readonly cargo: THREE.InstancedMesh;
  /** Recrutas: modelo de soldado, desenhado em lote separado. */
  private readonly recBody: THREE.InstancedMesh;
  private readonly recAccent: THREE.InstancedMesh;
  private readonly cargoGeo = new THREE.BoxGeometry(0.28, 0.2, 0.22);
  private readonly cargoMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private agents = new Map<string, Agent>();
  private sites = new Map<number, Site>();
  private grid: Grid;
  private gridKey = '';
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private time = 0;

  constructor(
    private readonly map: { width: number; height: number; cellSize: number; terrain: Terrain[] },
    owner: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    const model = citizenModel();
    this.body = new THREE.InstancedMesh(model.body, bodyMaterial(), MAX);
    this.accent = new THREE.InstancedMesh(model.accent, accentMaterial(owner), MAX);
    this.cargo = new THREE.InstancedMesh(this.cargoGeo, this.cargoMat, MAX);
    const rec = recruitModel();
    this.recBody = new THREE.InstancedMesh(rec.body, bodyMaterial(), MAX);
    this.recAccent = new THREE.InstancedMesh(rec.accent, accentMaterial(owner), MAX);
    for (const im of [this.body, this.accent, this.cargo, this.recBody, this.recAccent]) {
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.grid = new Grid(map.width, map.height, map.cellSize, map.terrain);
  }

  /** Atualiza os postos com o snapshot: cria quem chegou, remove quem saiu, mantém o resto. */
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
    const jobs = citizenRoster(own, idle, recruits).slice(0, MAX * 2);
    const next = new Map<string, Agent>();
    for (const job of jobs) {
      const a = this.agents.get(job.key);
      if (a) {
        a.job = job;
        next.set(job.key, a);
      } else next.set(job.key, this.spawn(job));
    }
    this.agents = next;
  }

  private spawn(job: CitizenJob): Agent {
    // novos cidadãos saem de casa (QG ou moradia mais próxima do posto) e caminham até ele
    const target = job.buildingId !== null ? this.sites.get(job.buildingId) : undefined;
    // recrutas saem do próprio quartel, onde foram alistados
    const home = job.kind === 'recruit' && target ? target : this.nearestHome(target ?? null);
    const start = home ? this.doorPoint(home, target ?? home) : new THREE.Vector2(this.map.width, this.map.height);
    const a: Agent = { job, pos: start, path: [], wait: Math.random() * 0.8, heading: Math.random() * Math.PI * 2, carry: null, leg: 'toWork', phase: Math.random() * 10 };
    return a;
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

  private route(a: Agent, to: THREE.Vector2): void {
    const cs = this.map.cellSize;
    const start = { cx: Math.floor(a.pos.x / cs), cy: Math.floor(a.pos.y / cs) };
    const goal = { cx: Math.floor(to.x / cs), cy: Math.floor(to.y / cs) };
    const cells = findPath(this.grid, start, goal, { maxExpanded: 1500 });
    a.path = cells ? cells.slice(1, -1).map((c) => new THREE.Vector2((c.cx + 0.5) * cs, (c.cy + 0.5) * cs)) : [];
    a.path.push(to);
  }

  /** Decide o próximo destino quando o cidadão termina a espera. */
  private plan(a: Agent): void {
    const site = a.job.buildingId !== null ? this.sites.get(a.job.buildingId) : undefined;
    if (a.job.kind === 'gather' && site && a.job.resource) {
      if (a.leg === 'toDrop') {
        const own = [...this.sites.values()];
        const drop = dropoffFor(a.job.resource, site, own);
        // depósito colado no posto (ex.: QG vizinho): só trabalha no lugar
        if (drop && Math.hypot(drop.x - site.x, drop.y - site.y) > this.map.cellSize * 2.5) {
          const dropSite = own.find((s) => s.x === drop.x && s.y === drop.y)!;
          a.carry = a.job.resource;
          this.route(a, this.doorPoint(dropSite, site));
          a.leg = 'toWork';
          return;
        }
        a.leg = 'toWork';
      }
      a.carry = null;
      this.route(a, this.doorPoint(site, site));
      a.leg = 'toDrop';
      return;
    }
    const anchor = site ?? this.nearestHome(null);
    if (!anchor) {
      a.wait = 2;
      return;
    }
    a.carry = null;
    // passeio curto em volta do prédio (trabalhadores de quartel/fábrica e ociosos)
    this.route(a, this.doorPoint(anchor, { x: anchor.x + (Math.random() - 0.5) * 8, y: anchor.y + (Math.random() - 0.5) * 8 }));
  }

  update(dt: number): void {
    this.time += dt;
    let i = 0;
    let r = 0;
    for (const a of this.agents.values()) {
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
            // chegou: trabalha, descarrega ou fica à toa um pouco
            a.wait = a.job.kind === 'gather' ? (a.leg === 'toDrop' ? 3 + Math.random() * 4 : 1) : 2 + Math.random() * 6;
            if (a.leg === 'toWork' && a.job.kind === 'gather') a.carry = null;
          }
        } else {
          a.pos.x += (dx / d) * step;
          a.pos.y += (dy / d) * step;
          a.heading = Math.atan2(-dy, dx);
        }
      } else {
        a.wait -= dt;
        if (a.wait <= 0) this.plan(a);
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
      const working = !moving && a.job.kind === 'gather' && a.leg === 'toDrop';
      const lean = working ? Math.sin((this.time + a.phase) * 3) * 0.18 : 0;
      const y = this.heightAt(a.pos.x, a.pos.y) + bob;
      this.q.setFromEuler(new THREE.Euler(0, a.heading, lean));
      this.m.compose(new THREE.Vector3(a.pos.x, y, a.pos.y), this.q, new THREE.Vector3(1, 1, 1));
      this.body.setMatrixAt(i, this.m);
      this.accent.setMatrixAt(i, this.m);
      if (a.carry) {
        // carga no ombro
        this.m.compose(new THREE.Vector3(a.pos.x, y + 1.0, a.pos.y), this.q, new THREE.Vector3(1, 1, 1));
        this.cargo.setColorAt(i, this.color.set(CARGO_COLOR[a.carry]));
      } else this.m.makeScale(0, 0, 0);
      this.cargo.setMatrixAt(i, this.m);
      i++;
    }
    for (const im of [this.body, this.accent, this.cargo]) {
      im.count = i;
      im.instanceMatrix.needsUpdate = true;
    }
    for (const im of [this.recBody, this.recAccent]) {
      im.count = r;
      im.instanceMatrix.needsUpdate = true;
    }
    if (this.cargo.instanceColor) this.cargo.instanceColor.needsUpdate = true;
  }

  get count(): number {
    return this.agents.size;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const im of [this.body, this.accent, this.cargo, this.recBody, this.recAccent]) im.dispose();
    this.cargoGeo.dispose();
    this.cargoMat.dispose();
  }
}
