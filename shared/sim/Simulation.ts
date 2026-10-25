import {
  BUILDINGS,
  CHASE_REPATH_TICKS,
  MAX_REPLANS,
  PRODUCTION_QUEUE_LIMIT,
  STARTING_RESOURCES,
  STUCK_TICKS,
  TERRAIN,
  TICK_RATE,
  TICK_SECONDS,
  UNITS,
  UNIT_CAP,
  type BuildingType,
  type UnitType,
} from './config.ts';
import type { Command } from './commands.ts';
import { findPath } from './pathfinding/AStar.ts';
import { Grid } from './pathfinding/Grid.ts';
import type {
  Building,
  Cell,
  Entity,
  EntityId,
  MapData,
  PlayerState,
  SimEvent,
  Slot,
  Unit,
  Vec2,
} from './types.ts';

export interface SimulationInit {
  map: MapData;
  playerCount: number;
  startingResources?: number;
  /** Unidades iniciais por jogador. */
  startingUnits?: UnitType[];
}

const UNDER_ATTACK_ALERT_TICKS = TICK_RATE * 6;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Simulação tática autoritativa. Não depende de rede, DOM nem Three.js: o servidor a executa e
 * os testes a exercitam diretamente. Avança em passos fixos (`step`) de TICK_SECONDS.
 */
export class Simulation {
  readonly map: MapData;
  readonly grid: Grid;
  tick = 0;
  readonly players: PlayerState[];
  readonly entities = new Map<EntityId, Entity>();
  /** Eventos acumulados desde a última chamada a `drainEvents`. */
  private events: SimEvent[] = [];
  private nextId = 1;
  private lastAlertTick: number[];
  winner: Slot | null = null;
  ended = false;

  constructor(init: SimulationInit) {
    this.map = init.map;
    this.grid = new Grid(init.map.width, init.map.height, init.map.cellSize, [...init.map.terrain]);
    this.players = [];
    this.lastAlertTick = [];
    for (let slot = 0; slot < init.playerCount; slot++) {
      this.players.push({
        slot,
        resources: init.startingResources ?? STARTING_RESOURCES,
        incomeRemainder: 0,
        defeated: false,
        stats: {
          unitsProduced: 0,
          unitsLost: 0,
          unitsKilled: 0,
          structuresBuilt: 0,
          structuresLost: 0,
          structuresDestroyed: 0,
          resourcesGathered: 0,
          resourcesSpent: 0,
          damageDealt: 0,
        },
      });
      this.lastAlertTick.push(-Infinity);
      const spawn = init.map.spawns[slot];
      if (!spawn) throw new Error(`Mapa sem ponto de partida para o jogador ${slot}`);
      const hq = this.addBuilding('hq', slot, { cx: spawn.cx - 1, cy: spawn.cy - 1 }, 1);
      const units = init.startingUnits ?? ['infantry', 'infantry', 'infantry', 'tank'];
      for (const t of units) this.spawnUnitNear(hq, t);
    }
  }

  // ---------------------------------------------------------------- consultas

  get units(): Unit[] {
    const out: Unit[] = [];
    for (const e of this.entities.values()) if (e.kind === 'unit') out.push(e);
    return out;
  }

  get buildings(): Building[] {
    const out: Building[] = [];
    for (const e of this.entities.values()) if (e.kind === 'building') out.push(e);
    return out;
  }

  get(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  drainEvents(): SimEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  supplyUsed(slot: Slot): number {
    let n = 0;
    for (const e of this.entities.values()) {
      if (e.owner !== slot) continue;
      if (e.kind === 'unit') n++;
      else n += e.queue.length;
    }
    return n;
  }

  incomePerSecond(slot: Slot): number {
    let inc = 0;
    for (const b of this.buildings) if (b.owner === slot && b.progress >= 1) inc += BUILDINGS[b.type].income;
    return inc;
  }

  entityRadius(e: Entity): number {
    return e.kind === 'unit' ? UNITS[e.type].radius : (BUILDINGS[e.type].size * this.grid.cellSize) / 2;
  }

  /** Distância de um ponto até a borda do alvo. */
  distanceToEdge(p: Vec2, target: Entity): number {
    if (target.kind === 'unit') return Math.max(0, dist(p, target.pos) - UNITS[target.type].radius);
    const half = (BUILDINGS[target.type].size * this.grid.cellSize) / 2;
    const dx = Math.max(Math.abs(p.x - target.pos.x) - half, 0);
    const dy = Math.max(Math.abs(p.y - target.pos.y) - half, 0);
    return Math.hypot(dx, dy);
  }

  sightOf(e: Entity): number {
    return e.kind === 'unit' ? UNITS[e.type].sight : BUILDINGS[e.type].sight;
  }

  /** Um ponto é visível para o jogador se estiver no raio de visão de alguma entidade sua. */
  isVisibleTo(slot: Slot, p: Vec2): boolean {
    for (const e of this.entities.values()) {
      if (e.owner === slot && dist(e.pos, p) <= this.sightOf(e)) return true;
    }
    return false;
  }

  hqOf(slot: Slot): Building | undefined {
    return this.buildings.find((b) => b.owner === slot && b.type === 'hq');
  }

  // ---------------------------------------------------------------- comandos

  /** Aplica um comando do jogador. Retorna null em caso de sucesso ou o motivo da recusa. */
  applyCommand(slot: Slot, cmd: Command): string | null {
    if (this.ended) return 'Partida encerrada';
    const player = this.players[slot];
    if (!player || player.defeated) return 'Jogador inválido';

    switch (cmd.type) {
      case 'move':
      case 'attack_move': {
        const units = this.ownUnits(slot, cmd.unitIds);
        if (units.length === 0) return 'Nenhuma unidade válida';
        const targets = this.formationTargets(units, { x: cmd.x, y: cmd.y });
        units.forEach((u, i) => {
          const target = targets[i]!;
          u.order = cmd.type === 'move' ? { kind: 'move', target } : { kind: 'attackMove', target };
          u.engageId = null;
          u.replans = 0;
          if (!this.planPath(u, target)) u.order = { kind: 'idle' };
        });
        return null;
      }
      case 'attack': {
        const units = this.ownUnits(slot, cmd.unitIds);
        if (units.length === 0) return 'Nenhuma unidade válida';
        const target = this.entities.get(cmd.targetId);
        if (!target || target.owner === slot) return 'Alvo inválido';
        for (const u of units) {
          u.order = { kind: 'attack', targetId: target.id };
          u.engageId = null;
          u.path = [];
          u.repathTimer = 0;
          u.replans = 0;
        }
        return null;
      }
      case 'stop': {
        const units = this.ownUnits(slot, cmd.unitIds);
        if (units.length === 0) return 'Nenhuma unidade válida';
        for (const u of units) this.setIdle(u);
        return null;
      }
      case 'build': {
        const cell = { cx: cmd.cx, cy: cmd.cy };
        const reason = this.placementError(slot, cmd.buildingType, cell);
        if (reason) return reason;
        const def = BUILDINGS[cmd.buildingType];
        player.resources -= def.cost;
        player.stats.resourcesSpent += def.cost;
        const b = this.addBuilding(cmd.buildingType, slot, cell, 0);
        this.emit({ type: 'construction_started', tick: this.tick, id: b.id, owner: slot, buildingType: b.type, pos: { ...b.pos } });
        return null;
      }
      case 'produce': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        if (b.progress < 1) return 'Edifício em construção';
        const def = UNITS[cmd.unitType];
        if (def.producedBy !== b.type) return `${BUILDINGS[b.type].label} não produz ${def.label}`;
        if (b.queue.length >= PRODUCTION_QUEUE_LIMIT) return 'Fila de produção cheia';
        if (this.supplyUsed(slot) >= UNIT_CAP) return 'Limite de unidades atingido';
        if (player.resources < def.cost) return 'Suprimentos insuficientes';
        player.resources -= def.cost;
        player.stats.resourcesSpent += def.cost;
        const ticks = Math.round(def.buildSeconds * TICK_RATE);
        b.queue.push({ unitType: cmd.unitType, remainingTicks: ticks, totalTicks: ticks });
        return null;
      }
      case 'cancel_production': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        const item = b.queue.pop();
        if (!item) return 'Fila vazia';
        const cost = UNITS[item.unitType].cost;
        player.resources += cost;
        player.stats.resourcesSpent -= cost;
        return null;
      }
      case 'set_rally': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        b.rally = this.clampToMap({ x: cmd.x, y: cmd.y });
        return null;
      }
    }
  }

  surrender(slot: Slot): void {
    const p = this.players[slot];
    if (!p || p.defeated || this.ended) return;
    this.defeat(slot);
    this.checkVictory();
  }

  /** Motivo pelo qual não se pode construir, ou null se a posição é válida. */
  placementError(slot: Slot, type: BuildingType, cell: Cell): string | null {
    const def = BUILDINGS[type];
    const player = this.players[slot];
    if (!player) return 'Jogador inválido';
    if (!def.buildable) return 'Este edifício não pode ser construído';
    for (let y = cell.cy; y < cell.cy + def.size; y++) {
      for (let x = cell.cx; x < cell.cx + def.size; x++) {
        if (!this.grid.inBounds(x, y)) return 'Fora do mapa';
        if (!TERRAIN[this.grid.terrainAt(x, y)].buildable) return 'Terreno impróprio para construção';
        if (this.grid.occupant(x, y) !== 0) return 'Local ocupado';
      }
    }
    const cs = this.grid.cellSize;
    const min = { x: cell.cx * cs, y: cell.cy * cs };
    const max = { x: (cell.cx + def.size) * cs, y: (cell.cy + def.size) * cs };
    for (const u of this.units) {
      const r = UNITS[u.type].radius;
      if (u.pos.x + r > min.x && u.pos.x - r < max.x && u.pos.y + r > min.y && u.pos.y - r < max.y) {
        return 'Há unidades no local';
      }
    }
    if (type === 'extractor') {
      if (!this.map.resourceNodes.some((n) => n.cx === cell.cx && n.cy === cell.cy)) return 'Extratores precisam ser construídos sobre uma jazida';
    } else {
      const center = { x: (cell.cx + def.size / 2) * cs, y: (cell.cy + def.size / 2) * cs };
      const inRange = this.buildings.some(
        (b) =>
          b.owner === slot &&
          b.progress >= 1 &&
          BUILDINGS[b.type].buildRadius > 0 &&
          dist(b.pos, center) <= BUILDINGS[b.type].buildRadius * cs,
      );
      if (!inRange) return 'Fora da área de construção';
    }
    if (player.resources < def.cost) return 'Suprimentos insuficientes';
    return null;
  }

  // ---------------------------------------------------------------- passo

  step(): void {
    if (this.ended) return;
    this.tick++;
    this.updateEconomy();
    this.updateConstruction();
    this.updateProduction();
    for (const u of this.units) this.updateUnit(u);
    for (const b of this.buildings) this.updateBuildingWeapon(b);
    this.separateUnits();
    this.removeDead();
    this.checkVictory();
  }

  private updateEconomy(): void {
    for (const p of this.players) {
      if (p.defeated) continue;
      p.incomeRemainder += this.incomePerSecond(p.slot) * TICK_SECONDS;
      const whole = Math.floor(p.incomeRemainder + 1e-9);
      if (whole > 0) {
        p.incomeRemainder -= whole;
        p.resources += whole;
        p.stats.resourcesGathered += whole;
      }
    }
  }

  private updateConstruction(): void {
    for (const b of this.buildings) {
      if (b.progress >= 1 || b.hp <= 0) continue;
      const def = BUILDINGS[b.type];
      const ticks = Math.max(1, def.buildSeconds * TICK_RATE);
      b.builtTicks++;
      b.progress = Math.min(1, b.builtTicks / ticks);
      b.hp = Math.min(def.maxHp, b.hp + (def.maxHp * 0.9) / ticks);
      if (b.progress >= 1) {
        b.progress = 1;
        this.players[b.owner]!.stats.structuresBuilt++;
        this.emit({ type: 'construction_completed', tick: this.tick, id: b.id, owner: b.owner, buildingType: b.type, pos: { ...b.pos } });
      }
    }
  }

  private updateProduction(): void {
    for (const b of this.buildings) {
      if (b.progress < 1 || b.hp <= 0) continue;
      const item = b.queue[0];
      if (!item) continue;
      item.remainingTicks--;
      if (item.remainingTicks > 0) continue;
      const u = this.spawnUnitNear(b, item.unitType);
      if (!u) {
        item.remainingTicks = TICK_RATE; // sem espaço: tenta de novo em 1 s
        continue;
      }
      b.queue.shift();
      this.players[b.owner]!.stats.unitsProduced++;
      this.emit({ type: 'unit_produced', tick: this.tick, id: u.id, owner: u.owner, unitType: u.type, pos: { ...u.pos } });
      if (b.rally) {
        u.order = { kind: 'move', target: b.rally };
        if (!this.planPath(u, b.rally)) u.order = { kind: 'idle' };
      }
    }
  }

  // ---------------------------------------------------------------- unidades

  private updateUnit(u: Unit): void {
    if (u.hp <= 0) return;
    if (u.cooldown > 0) u.cooldown--;
    const def = UNITS[u.type];

    switch (u.order.kind) {
      case 'attack': {
        const target = this.entities.get(u.order.targetId);
        if (!target || target.hp <= 0 || target.owner === u.owner) {
          this.setIdle(u);
          return;
        }
        this.engage(u, target);
        return;
      }
      case 'attackMove': {
        const target = this.validEngageTarget(u, def.sight * 1.5) ?? this.acquireTarget(u.pos, u.owner, def.sight);
        if (target) {
          if (u.engageId !== target.id) {
            u.engageId = target.id;
            u.repathTimer = 0;
          }
          this.engage(u, target);
          return;
        }
        if (u.engageId !== null) {
          // alvo eliminado ou perdido: retoma a marcha
          u.engageId = null;
          if (!this.planPath(u, u.order.target)) {
            this.setIdle(u);
            return;
          }
        }
        u.activity = 'moving';
        if (this.followPath(u)) this.setIdle(u);
        return;
      }
      case 'move': {
        u.activity = 'moving';
        if (this.followPath(u)) this.setIdle(u);
        return;
      }
      case 'idle': {
        const target = this.validEngageTarget(u, def.sight * 1.5) ?? this.acquireTarget(u.pos, u.owner, def.sight);
        if (!target) {
          u.engageId = null;
          u.activity = 'idle';
          u.path = [];
          return;
        }
        if (u.engageId !== target.id) {
          u.engageId = target.id;
          u.repathTimer = 0;
        }
        this.engage(u, target);
        return;
      }
    }
  }

  private validEngageTarget(u: Unit, leash: number): Entity | null {
    if (u.engageId === null) return null;
    const t = this.entities.get(u.engageId);
    if (!t || t.hp <= 0 || t.owner === u.owner) return null;
    if (this.distanceToEdge(u.pos, t) > leash) return null;
    return t;
  }

  /**
   * Seleção de alvo determinística: inimigo mais próximo dentro do raio, unidades antes de
   * edifícios; empate resolvido pelo menor id.
   */
  acquireTarget(from: Vec2, owner: Slot, radius: number): Entity | null {
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of this.entities.values()) {
      if (e.owner === owner || e.hp <= 0) continue;
      const d = this.distanceToEdge(from, e);
      if (d > radius) continue;
      const score = d + (e.kind === 'building' ? 1000 : 0);
      if (score < bestScore || (score === bestScore && best !== null && e.id < best.id)) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }

  private engage(u: Unit, target: Entity): void {
    const weapon = UNITS[u.type].weapon;
    const d = this.distanceToEdge(u.pos, target);
    if (d <= weapon.range) {
      u.activity = 'attacking';
      u.path = [];
      u.facing = Math.atan2(target.pos.y - u.pos.y, target.pos.x - u.pos.x);
      if (u.cooldown <= 0) this.fire(u, target, weapon.damage, weapon.cooldown);
      return;
    }
    u.activity = 'chasing';
    u.repathTimer--;
    if (u.repathTimer <= 0 || u.pathIndex >= u.path.length) {
      u.repathTimer = CHASE_REPATH_TICKS;
      if (!this.planPath(u, target.pos, target.kind === 'building' ? target : undefined)) {
        // inalcançável: desiste do alvo
        if (u.order.kind === 'attack') this.setIdle(u);
        else u.engageId = null;
        return;
      }
    }
    this.followPath(u);
  }

  private fire(attacker: Unit | Building, target: Entity, damage: number, cooldownSeconds: number): void {
    if (target.hp <= 0) return;
    attacker.cooldown = Math.round(cooldownSeconds * TICK_RATE);
    const dealt = Math.min(damage, target.hp);
    target.hp -= damage;
    this.players[attacker.owner]!.stats.damageDealt += dealt;
    this.emit({
      type: 'shot',
      tick: this.tick,
      attackerId: attacker.id,
      targetId: target.id,
      from: { ...attacker.pos },
      to: { ...target.pos },
      damage: dealt,
    });
    if (this.tick - (this.lastAlertTick[target.owner] ?? -Infinity) >= UNDER_ATTACK_ALERT_TICKS) {
      this.lastAlertTick[target.owner] = this.tick;
      this.emit({ type: 'under_attack', tick: this.tick, id: target.id, owner: target.owner, pos: { ...target.pos } });
    }
    if (target.hp <= 0) this.markDestroyed(target, attacker.owner);
  }

  private updateBuildingWeapon(b: Building): void {
    const weapon = BUILDINGS[b.type].weapon;
    if (!weapon || b.progress < 1 || b.hp <= 0) return;
    if (b.cooldown > 0) {
      b.cooldown--;
      return;
    }
    let target: Entity | null = null;
    if (b.engageId !== null) {
      const t = this.entities.get(b.engageId);
      if (t && t.kind === 'unit' && t.hp > 0 && this.distanceToEdge(b.pos, t) - this.entityRadius(b) <= weapon.range) target = t;
    }
    if (!target) {
      const candidate = this.acquireTarget(b.pos, b.owner, weapon.range + this.entityRadius(b));
      target = candidate && candidate.kind === 'unit' ? candidate : null;
    }
    b.engageId = target?.id ?? null;
    if (target) this.fire(b, target, weapon.damage, weapon.cooldown);
  }

  // ---------------------------------------------------------------- movimento

  /** Planeja caminho até `target`. Para edifícios, mira a célula livre mais próxima ao redor. */
  planPath(u: Unit, target: Vec2, building?: Building): boolean {
    const g = this.grid;
    let start = g.worldToCell(u.pos);
    if (!g.isPassable(start.cx, start.cy)) {
      const s = g.nearestPassable(start, 3);
      if (!s) return false;
      start = s;
    }
    let goal: Cell | null;
    if (building) {
      goal = this.nearestCellAround(building, u.pos);
    } else {
      goal = g.nearestPassable(g.worldToCell(this.clampToMap(target)), 10);
    }
    if (!goal) return false;
    const cells = findPath(g, start, goal, { maxExpanded: 6000 });
    if (!cells) return false;
    const pts = cells.map((c) => g.cellCenter(c));
    const goalCell = g.worldToCell(target);
    if (!building && goalCell.cx === goal.cx && goalCell.cy === goal.cy) pts[pts.length - 1] = this.clampToMap(target);
    u.path = this.smoothPath(u.pos, pts);
    u.pathIndex = 0;
    u.stuckTicks = 0;
    u.lastProgressDist = Infinity;
    return true;
  }

  private nearestCellAround(b: Building, from: Vec2): Cell | null {
    const size = BUILDINGS[b.type].size;
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let y = b.cell.cy - 1; y <= b.cell.cy + size; y++) {
      for (let x = b.cell.cx - 1; x <= b.cell.cx + size; x++) {
        const inside = x >= b.cell.cx && x < b.cell.cx + size && y >= b.cell.cy && y < b.cell.cy + size;
        if (inside || !this.grid.isPassable(x, y)) continue;
        const d = dist(this.grid.cellCenter({ cx: x, cy: y }), from);
        if (d < bestD) {
          bestD = d;
          best = { cx: x, cy: y };
        }
      }
    }
    return best ?? this.grid.nearestPassable(b.cell, size + 4);
  }

  /** Remove pontos intermediários quando há linha reta livre (string pulling). */
  private smoothPath(from: Vec2, pts: Vec2[]): Vec2[] {
    if (pts.length <= 1) return pts;
    const out: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.grid.lineWalkable(anchor, pts[j]!)) j--;
      out.push(pts[j]!);
      anchor = pts[j]!;
      i = j + 1;
    }
    return out;
  }

  /** Avança ao longo do caminho. Retorna true ao chegar ao fim. */
  private followPath(u: Unit): boolean {
    const wp = u.path[u.pathIndex];
    if (!wp) return true;
    const cell = this.grid.worldToCell(u.pos);
    const terrainMul = this.grid.inBounds(cell.cx, cell.cy) ? TERRAIN[this.grid.terrainAt(cell.cx, cell.cy)].speedMultiplier : 1;
    const speed = UNITS[u.type].speed * Math.max(terrainMul, 0.3) * TICK_SECONDS;
    const dx = wp.x - u.pos.x;
    const dy = wp.y - u.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= speed) {
      if (this.grid.isWorldPassable(wp)) u.pos = { x: wp.x, y: wp.y };
      u.pathIndex++;
      u.stuckTicks = 0;
      u.lastProgressDist = Infinity;
      return u.pathIndex >= u.path.length;
    }
    u.facing = Math.atan2(dy, dx);
    const next = { x: u.pos.x + (dx / d) * speed, y: u.pos.y + (dy / d) * speed };
    if (this.grid.isWorldPassable(next)) u.pos = next;

    // detecção de bloqueio persistente → replanejamento limitado
    if (d < u.lastProgressDist - 0.05) {
      u.lastProgressDist = d;
      u.stuckTicks = 0;
    } else if (++u.stuckTicks >= STUCK_TICKS) {
      u.stuckTicks = 0;
      if (++u.replans > MAX_REPLANS) {
        u.path = [];
        return true;
      }
      const final = u.path[u.path.length - 1]!;
      if (!this.planPath(u, final)) return true;
    }
    return false;
  }

  /** Separação simples entre unidades para reduzir empilhamento. */
  private separateUnits(): void {
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const a = units[i]!;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j]!;
        const minD = (UNITS[a.type].radius + UNITS[b.type].radius) * 0.9;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2);
        // direção determinística quando as posições coincidem
        const nx = d > 1e-6 ? dx / d : Math.cos(a.id * 2.399);
        const ny = d > 1e-6 ? dy / d : Math.sin(a.id * 2.399);
        const push = Math.min((minD - d) / 2, 0.15);
        const pa = { x: a.pos.x - nx * push, y: a.pos.y - ny * push };
        const pb = { x: b.pos.x + nx * push, y: b.pos.y + ny * push };
        if (this.grid.isWorldPassable(pa)) a.pos = pa;
        if (this.grid.isWorldPassable(pb)) b.pos = pb;
      }
    }
  }

  /** Posições em grade ao redor do destino para que um grupo não se empilhe. */
  formationTargets(units: Unit[], target: Vec2): Vec2[] {
    if (units.length === 1) return [this.clampToMap(target)];
    const spacing = 1.8;
    const cols = Math.ceil(Math.sqrt(units.length));
    const cx = units.reduce((s, u) => s + u.pos.x, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.pos.y, 0) / units.length;
    const ang = Math.atan2(target.y - cy, target.x - cx);
    const fwd = { x: Math.cos(ang), y: Math.sin(ang) };
    const right = { x: -fwd.y, y: fwd.x };
    const slots: Vec2[] = [];
    for (let i = 0; i < units.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const ox = (col - (cols - 1) / 2) * spacing;
      const oy = -row * spacing;
      slots.push(this.clampToMap({ x: target.x + right.x * ox + fwd.x * oy, y: target.y + right.y * ox + fwd.y * oy }));
    }
    // atribuição gulosa: unidades mais à direita ficam com posições à direita, evitando cruzamentos
    const order = units
      .map((u, i) => ({ i, side: (u.pos.x - cx) * right.x + (u.pos.y - cy) * right.y, depth: (u.pos.x - cx) * fwd.x + (u.pos.y - cy) * fwd.y }))
      .sort((a, b) => b.depth - a.depth || a.side - b.side || a.i - b.i);
    const result = new Array<Vec2>(units.length);
    const slotOrder = slots.map((s, i) => ({ s, i })).sort((a, b) => a.i - b.i);
    order.forEach((o, k) => {
      result[o.i] = slotOrder[k]!.s;
    });
    return result;
  }

  clampToMap(p: Vec2): Vec2 {
    const w = this.map.width * this.map.cellSize - 0.01;
    const h = this.map.height * this.map.cellSize - 0.01;
    return { x: Math.min(Math.max(p.x, 0), w), y: Math.min(Math.max(p.y, 0), h) };
  }

  // ---------------------------------------------------------------- ciclo de vida

  private addBuilding(type: BuildingType, owner: Slot, cell: Cell, progress: number): Building {
    const def = BUILDINGS[type];
    const cs = this.grid.cellSize;
    const b: Building = {
      kind: 'building',
      id: this.nextId++,
      type,
      owner,
      cell: { ...cell },
      pos: { x: (cell.cx + def.size / 2) * cs, y: (cell.cy + def.size / 2) * cs },
      hp: progress >= 1 ? def.maxHp : def.maxHp * 0.1,
      progress,
      builtTicks: 0,
      queue: [],
      rally: null,
      cooldown: 0,
      engageId: null,
    };
    this.entities.set(b.id, b);
    this.grid.setOccupied(cell, def.size, b.id);
    return b;
  }

  /** Cria uma unidade numa célula livre ao redor do edifício. */
  spawnUnitNear(b: Building, type: UnitType): Unit | null {
    const size = BUILDINGS[b.type].size;
    const occupied = new Set(this.units.map((u) => this.grid.index(...cellTuple(this.grid.worldToCell(u.pos)))));
    for (let r = 1; r <= 4; r++) {
      const candidates: Cell[] = [];
      for (let y = b.cell.cy - r; y < b.cell.cy + size + r; y++) {
        for (let x = b.cell.cx - r; x < b.cell.cx + size + r; x++) {
          const ring = x === b.cell.cx - r || y === b.cell.cy - r || x === b.cell.cx + size + r - 1 || y === b.cell.cy + size + r - 1;
          if (!ring || !this.grid.isPassable(x, y)) continue;
          if (occupied.has(this.grid.index(x, y))) continue;
          candidates.push({ cx: x, cy: y });
        }
      }
      // prioriza células voltadas para o centro do mapa
      const mid = { x: (this.map.width * this.map.cellSize) / 2, y: (this.map.height * this.map.cellSize) / 2 };
      candidates.sort((a, c) => dist(this.grid.cellCenter(a), mid) - dist(this.grid.cellCenter(c), mid));
      const cell = candidates[0];
      if (cell) return this.addUnit(type, b.owner, this.grid.cellCenter(cell));
    }
    return null;
  }

  addUnit(type: UnitType, owner: Slot, pos: Vec2): Unit {
    const u: Unit = {
      kind: 'unit',
      id: this.nextId++,
      type,
      owner,
      pos: { ...pos },
      facing: 0,
      hp: UNITS[type].maxHp,
      order: { kind: 'idle' },
      engageId: null,
      path: [],
      pathIndex: 0,
      cooldown: 0,
      activity: 'idle',
      stuckTicks: 0,
      replans: 0,
      lastProgressDist: Infinity,
      repathTimer: 0,
    };
    this.entities.set(u.id, u);
    return u;
  }

  private setIdle(u: Unit): void {
    u.order = { kind: 'idle' };
    u.engageId = null;
    u.path = [];
    u.pathIndex = 0;
    u.activity = 'idle';
  }

  private ownUnits(slot: Slot, ids: EntityId[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const e = this.entities.get(id);
      if (e && e.kind === 'unit' && e.owner === slot && e.hp > 0) out.push(e);
    }
    return out;
  }

  private markDestroyed(e: Entity, killerOwner: Slot | null): void {
    const victim = this.players[e.owner]!;
    const killer = killerOwner !== null ? this.players[killerOwner] : undefined;
    if (e.kind === 'unit') {
      victim.stats.unitsLost++;
      if (killer) killer.stats.unitsKilled++;
    } else {
      victim.stats.structuresLost++;
      if (killer) killer.stats.structuresDestroyed++;
    }
    this.emit({
      type: 'destroyed',
      tick: this.tick,
      id: e.id,
      owner: e.owner,
      entity: e.kind,
      entityType: e.type,
      pos: { ...e.pos },
      killerOwner,
    });
  }

  private removeDead(): void {
    for (const e of [...this.entities.values()]) {
      if (e.hp > 0) continue;
      this.entities.delete(e.id);
      if (e.kind === 'building') {
        // destruir o edifício interrompe a fila (sem reembolso) e libera as células
        e.queue = [];
        this.grid.setOccupied(e.cell, BUILDINGS[e.type].size, 0);
        if (e.type === 'hq') this.defeat(e.owner);
      }
    }
  }

  private defeat(slot: Slot): void {
    const p = this.players[slot]!;
    if (p.defeated) return;
    p.defeated = true;
    this.emit({ type: 'player_defeated', tick: this.tick, slot });
    // as forças restantes do derrotado se rendem
    for (const e of [...this.entities.values()]) {
      if (e.owner !== slot) continue;
      this.entities.delete(e.id);
      if (e.kind === 'building') this.grid.setOccupied(e.cell, BUILDINGS[e.type].size, 0);
    }
  }

  private checkVictory(): void {
    if (this.ended) return;
    const alive = this.players.filter((p) => !p.defeated);
    if (alive.length <= 1) {
      this.ended = true;
      this.winner = alive[0]?.slot ?? null;
    }
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }
}

function cellTuple(c: Cell): [number, number] {
  return [c.cx, c.cy];
}
