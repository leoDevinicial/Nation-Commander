import { MINE, TICK_RATE, UNITS, canAfford } from './config.ts';
import type { Simulation } from './Simulation.ts';
import type { EntityId, Slot, Vec2 } from './types.ts';
import { missingText } from './upgrades.ts';

/**
 * Minas antitanque e o trabalho dos Engenheiros de Combate (docs/BALANCEAMENTO_E_PROGRESSAO.md,
 * lote 3, seção 2):
 * - o engenheiro vai até o ponto, fica parado alguns segundos e deixa a mina;
 * - só veículos inimigos detonam (a infantaria passa por cima);
 * - o dono vê as próprias minas; o inimigo só as vê com Engenheiro ou Forças Especiais por perto,
 *   com reconhecimento aéreo ou quando uma explode (o satélite não revela minas);
 * - um engenheiro parado perto de uma mina inimiga vista a remove.
 */
export interface Mine {
  id: number;
  owner: Slot;
  pos: Vec2;
  /** Jogadores (além do dono) que já viram esta mina. */
  seenBy: Slot[];
  /** Remoção em andamento (ticks restantes) e por quem. */
  clearing?: { by: Slot; ticks: number } | null;
}

/** Mina sendo instalada por um engenheiro (custo já pago). */
export interface MineTask {
  unitId: EntityId;
  owner: Slot;
  pos: Vec2;
  ticks: number;
}

export interface MineSave {
  nextId: number;
  mines: Mine[];
  tasks: MineTask[];
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export class MineSystem {
  nextId = 1;
  mines: Mine[] = [];
  tasks: MineTask[] = [];

  constructor(private readonly sim: Simulation) {}

  toSave(): MineSave {
    return JSON.parse(
      JSON.stringify({
        nextId: this.nextId,
        mines: this.mines,
        tasks: this.tasks,
      }),
    ) as MineSave;
  }

  load(s: MineSave | undefined): void {
    if (!s) return;
    const c = JSON.parse(JSON.stringify(s)) as MineSave;
    this.nextId = c.nextId;
    this.mines = c.mines;
    this.tasks = c.tasks;
  }

  count(slot: Slot): number {
    return this.mines.filter((m) => m.owner === slot).length + this.tasks.filter((t) => t.owner === slot).length;
  }

  /** O jogador vê esta mina (as próprias e as que algum dos seus já detectou). */
  visibleTo(m: Mine, slot: Slot): boolean {
    return m.owner === slot || m.seenBy.includes(slot);
  }

  /** Motivo para não poder instalar (mesma regra no painel), ou null. */
  layBlocker(slot: Slot, unitIds: readonly EntityId[], x: number, y: number): string | null {
    const eng = this.engineers(slot, unitIds);
    if (!eng.length) return 'Selecione um Engenheiro de Combate';
    if (this.count(slot) >= MINE.perNation) return `Limite de ${MINE.perNation} minas por nação`;
    const p = this.sim.clampToMap({ x, y });
    const c = this.sim.grid.worldToCell(p);
    if (!this.sim.grid.isPassable(c.cx, c.cy)) return 'Mina só em terreno passável e livre';
    if (this.mines.some((m) => dist(m.pos, p) < 1.2)) return 'Já há uma mina aqui';
    const player = this.sim.players[slot]!;
    if (!this.sim.isSandbox(slot) && !canAfford(player.resources, MINE.cost)) return `Recursos insuficientes: faltam ${missingText(player.resources, MINE.cost)}`;
    return null;
  }

  /** Manda o engenheiro mais próximo instalar uma mina no ponto. */
  lay(slot: Slot, unitIds: readonly EntityId[], x: number, y: number): string | null {
    const err = this.layBlocker(slot, unitIds, x, y);
    if (err) return err;
    const p = this.sim.clampToMap({ x, y });
    const eng = this.engineers(slot, unitIds).sort((a, b) => dist(a.pos, p) - dist(b.pos, p) || a.id - b.id)[0]!;
    const move = this.sim.applyCommand(slot, {
      type: 'move',
      unitIds: [eng.id],
      x: p.x,
      y: p.y,
    });
    if (move) return move;
    if (!this.sim.isSandbox(slot)) this.sim.spendResources(slot, MINE.cost);
    // um engenheiro instala uma mina por vez: a ordem nova substitui a anterior (com devolução)
    for (const t of this.tasks.filter((t) => t.unitId === eng.id)) this.cancel(t);
    this.tasks.push({
      unitId: eng.id,
      owner: slot,
      pos: p,
      ticks: Math.round(MINE.laySeconds * TICK_RATE),
    });
    return null;
  }

  private engineers(slot: Slot, unitIds: readonly EntityId[]) {
    return unitIds
      .map((id) => this.sim.entities.get(id))
      .filter((u): u is Extract<typeof u, { kind: 'unit' }> & object => !!u && u.kind === 'unit' && u.owner === slot && u.type === 'engineer' && u.hp > 0 && !u.refit);
  }

  private cancel(t: MineTask): void {
    this.tasks = this.tasks.filter((x) => x !== t);
    if (!this.sim.isSandbox(t.owner)) this.sim.storeFromTrade(t.owner, 'iron', MINE.cost.iron ?? 0);
    if (!this.sim.isSandbox(t.owner)) this.sim.storeFromTrade(t.owner, 'supplies', MINE.cost.supplies ?? 0);
  }

  step(): void {
    const sim = this.sim;
    const tick = sim.tick;
    // instalação: o engenheiro precisa chegar e ficar parado no ponto
    for (const t of [...this.tasks]) {
      const u = sim.entities.get(t.unitId);
      if (!u || u.kind !== 'unit' || u.hp <= 0) {
        this.tasks = this.tasks.filter((x) => x !== t);
        continue;
      }
      if (u.order.kind === 'move' && dist(u.order.target, t.pos) > 3) {
        this.cancel(t);
        continue;
      }
      if (u.order.kind !== 'idle' || dist(u.pos, t.pos) > 2) continue;
      if (--t.ticks > 0) continue;
      this.tasks = this.tasks.filter((x) => x !== t);
      const m: Mine = {
        id: this.sim.opaqueId('mine', this.nextId++),
        owner: t.owner,
        pos: { ...t.pos },
        seenBy: [],
      };
      this.mines.push(m);
      sim.emitTrade({
        type: 'mine',
        tick,
        owner: t.owner,
        state: 'laid',
        pos: { ...m.pos },
      });
    }
    if (!this.mines.length) return;
    // detecção (a cada 0,5 s): engenheiros e forças especiais por perto, e reconhecimento aéreo
    if (tick % 10 === 0) {
      for (const m of this.mines) {
        for (const u of sim.units) {
          if (u.owner === m.owner || u.hp <= 0 || (u.type !== 'engineer' && u.type !== 'special_forces')) continue;
          if (!m.seenBy.includes(u.owner) && dist(u.pos, m.pos) <= MINE.detectRange) m.seenBy.push(u.owner);
        }
        for (const r of sim.air.reveals) if (r.owner !== m.owner && !m.seenBy.includes(r.owner) && dist(r.pos, m.pos) <= r.radius) m.seenBy.push(r.owner);
      }
    }
    // remoção: engenheiro inimigo parado perto de uma mina que o lado dele já viu
    for (const m of [...this.mines]) {
      const eng = sim.units.find(
        (u) => u.type === 'engineer' && u.owner !== m.owner && u.hp > 0 && u.order.kind === 'idle' && m.seenBy.includes(u.owner) && dist(u.pos, m.pos) <= MINE.clearRange,
      );
      if (!eng) {
        m.clearing = null;
        continue;
      }
      if (!m.clearing || m.clearing.by !== eng.owner)
        m.clearing = {
          by: eng.owner,
          ticks: Math.round(MINE.clearSeconds * TICK_RATE),
        };
      if (--m.clearing.ticks > 0) continue;
      this.mines = this.mines.filter((x) => x !== m);
      sim.emitTrade({
        type: 'mine',
        tick,
        owner: m.owner,
        state: 'cleared',
        by: eng.owner,
        pos: { ...m.pos },
      });
    }
    // detonação: só veículos inimigos
    for (const m of [...this.mines]) {
      const victim = sim.units.find(
        (u) =>
          u.hp > 0 && UNITS[u.type].armor === 'vehicle' && u.owner !== m.owner && sim.hostile(m.owner, u.owner) && dist(u.pos, m.pos) <= MINE.triggerRadius + UNITS[u.type].radius,
      );
      if (!victim) continue;
      this.mines = this.mines.filter((x) => x !== m);
      const victimOwner = victim.owner;
      sim.damageUnit(victim, MINE.damage, m.owner);
      for (const u of [...sim.units])
        if (u !== victim && u.hp > 0 && sim.hostile(m.owner, u.owner) && dist(u.pos, m.pos) <= MINE.splash) sim.damageUnit(u, MINE.damage * MINE.splashFraction, m.owner);
      sim.emitTrade({
        type: 'mine',
        tick,
        owner: m.owner,
        state: 'blast',
        by: victimOwner,
        pos: { ...m.pos },
      });
    }
  }
}
