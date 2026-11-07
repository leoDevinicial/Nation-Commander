/**
 * Diretor do tutorial (07/11, `docs/TUTORIAL.md`): anda pelo roteiro (`shared/tutorial/script.ts`), confere as condições
 * na simulação e nos eventos dela, executa as ações no mundo (patrulha, aliança, rodovia do aliado, compra) e manda ao
 * jogador só o passo atual. O cliente informa apenas fatos da própria tela (câmera, seleção, painéis), aceitos só no
 * passo que os pede: nada que ele mande muda a partida.
 */
import { BUILDINGS, TICK_RATE, Terrain, UNITS } from '../../shared/sim/config.ts';
import type { NationalSimulation } from '../../shared/strategic/NationalSimulation.ts';
import type { Simulation } from '../../shared/sim/Simulation.ts';
import type { Building, EntityId, SimEvent, Slot } from '../../shared/sim/types.ts';
import type { TechId } from '../../shared/strategic/technologies.ts';
import {
  TUTORIAL,
  TUTORIAL_STEPS,
  speechSeconds,
  type TutorialAction,
  type TutorialCond,
  type TutorialFact,
  type TutorialFeature,
  type TutorialMark,
  type TutorialView,
} from '../../shared/tutorial/script.ts';

/** Conta de meio em meio segundo de jogo. */
const EVAL_TICKS = TICK_RATE / 2;
const DEFAULT_HELP_S = 35;
/** Recursos que nunca faltam no tutorial (completados em silêncio a cada conta). */
const FLOOR = { food: 600, wood: 450, stone: 500, supplies: 450, iron: 150, oil: 150, coal: 150 } as const;

export class TutorialDirector {
  index = 0;
  /** Tick em que o passo atual começou. */
  private since = 0;
  private baseline = 0;
  private helpShown = false;
  private autoDone = false;
  private facts = new Set<TutorialFact>();
  private listed = false;
  private delivered = false;
  private patrol: EntityId[] = [];
  private highwayEnd: { cx: number; cy: number } | null = null;
  private lastSent = '';
  done = false;

  constructor(
    private readonly sim: Simulation,
    private readonly national: NationalSimulation,
    readonly human: Slot,
    readonly ally: Slot,
    readonly enemy: Slot,
    private readonly send: (view: TutorialView) => void,
  ) {}

  /** Cenário: guerra declarada com a Força Vermelha (IA parada), base inimiga pequena e recursos de sobra. */
  setup(): void {
    const { sim, national, human, enemy } = this;
    national.diplomacy.discover(human, enemy, 'contato', national.day, undefined, true);
    national.diplomacy.discover(enemy, human, 'contato', national.day, undefined, true);
    sim.setMet(human, enemy);
    if (national.declareWar(human, enemy) === null) sim.setWar(human, enemy, true);
    sim.setWar(human, enemy, true);
    const hq = sim.hqOf(enemy);
    if (hq) {
      hq.hp = Math.round(hq.maxHp * 0.4);
      // defesa que cinco infantarias vencem: uma torre a meia vida e duas infantarias feridas
      sim.grantResources(enemy, sim.buildingCostFor(enemy, 'tower'));
      const cell = this.freeCellNear(enemy, 'tower', hq, 3, 7);
      if (cell) {
        const tower = sim.addBuilding('tower', enemy, cell, 1);
        tower.hp = Math.round(tower.maxHp * 0.5);
      }
      for (let i = 0; i < 2; i++) sim.addUnit('infantry', enemy, { x: hq.pos.x + (i - 0.5) * 2, y: hq.pos.y + 7 }, 0.6);
    }
    this.topUp();
    this.enter();
  }

  /** Um tick (chamado pela sala depois de `sim.step`). */
  tick(events: readonly SimEvent[]): void {
    if (this.done) return;
    for (const e of events) {
      if (e.type === 'trade_listed' && e.seller === this.human) this.listed = true;
      if (e.type === 'shipment_delivered' && e.seller === this.human) this.delivered = true;
    }
    if (this.sim.tick % EVAL_TICKS !== 0) return;
    this.topUp();
    const step = this.current().step;
    const elapsed = (this.sim.tick - this.since) / TICK_RATE;
    if (this.satisfied(step.cond, elapsed)) {
      this.advance();
      return;
    }
    if (!this.helpShown && step.help && elapsed >= (step.helpAfter ?? DEFAULT_HELP_S)) this.helpShown = true;
    if (!this.autoDone && step.auto && elapsed >= step.auto.after) {
      this.autoDone = true;
      this.act(step.auto.action);
    }
    this.publish();
  }

  /** Fato da tela do jogador: só vale se for o que o passo atual pede. */
  fact(fact: TutorialFact): void {
    if (this.done) return;
    const cond = this.current().step.cond;
    if (cond.k === 'fact' && cond.fact === fact) this.facts.add(fact);
  }

  /** Pular o passo ou o capítulo: as ações dos passos pulados rodam, para o mundo ficar coerente. */
  skip(what: 'step' | 'chapter'): void {
    if (this.done) return;
    const chapter = this.current().chapter.id;
    do {
      const { step } = this.current();
      if (step.auto) this.act(step.auto.action);
      this.next();
    } while (!this.done && what === 'chapter' && this.current().chapter.id === chapter);
    if (!this.done) this.enter();
    this.publish(true);
  }

  current() {
    return TUTORIAL_STEPS[Math.min(this.index, TUTORIAL_STEPS.length - 1)]!;
  }

  view(): TutorialView {
    const { chapter, step } = this.current();
    const locked: TutorialFeature[] = [];
    const reached = new Set(TUTORIAL.filter((c) => c.id <= chapter.id).flatMap((c) => c.unlocks ?? []));
    for (const f of ['nation', 'globe'] as TutorialFeature[]) if (!reached.has(f) && !this.done) locked.push(f);
    const mark = step.mark ? this.markPos(step.mark) : [];
    const cam = step.camera ? this.markPos(step.camera)[0] ?? null : null;
    return {
      chapter: chapter.id,
      chapters: TUTORIAL.length,
      title: chapter.title,
      step: step.id,
      index: this.index,
      total: TUTORIAL_STEPS.length,
      text: step.text,
      objective: step.objective ?? null,
      anchor: step.anchor ?? [],
      marks: mark,
      camera: cam,
      help: this.helpShown ? (step.help ?? null) : null,
      progress: this.progress(step.cond),
      fact: step.cond.k === 'fact' ? step.cond.fact : null,
      locked,
      done: this.done,
    };
  }

  /** Manda a visão se ela mudou (ou sempre, com `force`). */
  publish(force = false): void {
    const v = this.view();
    const key = JSON.stringify({ ...v, camera: null });
    if (!force && key === this.lastSent) return;
    this.lastSent = key;
    this.send(v);
  }

  // ------------------------------------------------------------ passos

  private advance(): void {
    this.next();
    if (!this.done) this.enter();
    this.publish(true);
  }

  private next(): void {
    this.index++;
    if (this.index >= TUTORIAL_STEPS.length) {
      this.index = TUTORIAL_STEPS.length - 1;
      this.done = true;
    }
  }

  private enter(): void {
    const { step } = this.current();
    this.since = this.sim.tick;
    this.helpShown = false;
    this.autoDone = false;
    this.facts.clear();
    for (const a of step.enter ?? []) this.act(a);
    const c = step.cond;
    const p = this.sim.players[this.human]!;
    this.baseline = c.k === 'more' ? (c.what === 'citizens' ? p.citizens : p.recruits) : c.k === 'road_more' ? this.ownRoads() : 0;
    if (c.k === 'listed') this.listed = false;
    if (c.k === 'delivered') this.delivered = false;
  }

  private satisfied(c: TutorialCond, elapsed: number): boolean {
    const { sim, human } = this;
    switch (c.k) {
      case 'speech':
        return elapsed >= speechSeconds(this.current().step.text);
      case 'fact':
        return this.facts.has(c.fact);
      case 'era':
        return sim.eraOf(human) >= c.era;
      case 'researching':
        return !!this.national.nation(human)?.research.current;
      case 'alliance':
        return sim.allied(human, this.ally);
      case 'truck_route':
        return typeof sim.trade.route(human, this.ally, 'road') !== 'string';
      case 'listed':
        return this.listed;
      case 'delivered':
        return this.delivered;
      case 'patrol_dead':
        return this.patrol.every((id) => {
          const u = sim.entities.get(id);
          return !u || u.hp <= 0;
        });
      case 'enemy_defeated':
        return !!sim.players[this.enemy]?.defeated || !sim.hqOf(this.enemy);
      default: {
        const p = this.progress(c);
        return !!p && p.have >= p.need;
      }
    }
  }

  private progress(c: TutorialCond): { have: number; need: number } | null {
    const { sim, human } = this;
    const p = sim.players[human]!;
    switch (c.k) {
      case 'more':
        return { have: Math.max(0, (c.what === 'citizens' ? p.citizens : p.recruits) - this.baseline), need: c.n };
      case 'built': {
        const have = sim.buildings.filter((b) => b.owner === human && b.type === c.type && b.hp > 0 && (!c.done || b.progress >= 1)).length;
        return { have, need: c.n ?? 1 };
      }
      case 'units':
        return { have: sim.units.filter((u) => u.owner === human && u.type === c.type && u.hp > 0).length, need: c.n };
      case 'army':
        return { have: this.army().length, need: c.n };
      case 'at_rally': {
        const r = this.rally();
        const near = sim.units.filter((u) => u.owner === human && u.hp > 0 && Math.hypot(u.pos.x - r.x, u.pos.y - r.y) < 5 * sim.map.cellSize).length;
        return { have: near, need: c.n };
      }
      case 'road_more':
        return { have: Math.max(0, this.ownRoads() - this.baseline), need: c.n };
      default:
        return null;
    }
  }

  // ------------------------------------------------------------ ações

  private act(a: TutorialAction): void {
    const { sim, national, human, ally, enemy } = this;
    const cs = sim.map.cellSize;
    switch (a) {
      case 'spawn_patrol': {
        if (this.patrol.length) return;
        const hq = sim.hqOf(human);
        const foe = sim.hqOf(enemy);
        if (!hq || !foe) return;
        const d = Math.hypot(foe.pos.x - hq.pos.x, foe.pos.y - hq.pos.y) || 1;
        const k = (22 * cs) / d;
        const at = { x: hq.pos.x + (foe.pos.x - hq.pos.x) * k, y: hq.pos.y + (foe.pos.y - hq.pos.y) * k };
        for (let i = 0; i < 2; i++) this.patrol.push(sim.addUnit('infantry', enemy, { x: at.x + i * 1.5, y: at.y }, 0.7).id);
        const r = this.rally();
        sim.applyCommand(enemy, { type: 'attack_move', unitIds: [...this.patrol], x: r.x, y: r.y });
        return;
      }
      case 'weaken_patrol':
        for (const id of this.patrol) {
          const u = sim.entities.get(id);
          if (u && u.hp > 0) u.hp = 1;
        }
        return;
      case 'start_era': {
        const p = sim.players[human]!;
        if (sim.eraOf(human) >= 2 || p.eraAdvance) return;
        const ticks = 4 * TICK_RATE;
        p.eraAdvance = { to: 2, remainingTicks: ticks, totalTicks: ticks, paid: {}, usd: 0 };
        return;
      }
      case 'grant_trade':
        for (const slot of [human, ally]) this.grantTechs(slot, ['foreign_trade', 'road_engineering']);
        if (sim.players[ally] && (sim.players[ally]!.era ?? 1) < 2) sim.players[ally]!.era = 2;
        return;
      case 'meet_ally':
        sim.setMet(human, ally);
        national.meetInTheater(human, ally);
        return;
      case 'ally_propose': {
        if (sim.allied(human, ally) || national.diplomacy.offers.some((o) => o.from === ally && o.to === human)) return;
        const n = national.nation(ally);
        if (n) n.works.fundUsd = Math.max(n.works.fundUsd, n.dayUsd * 400);
        national.diplomaticAction(ally, { type: 'propose', treaty: 'alliance', partner: human });
        return;
      }
      case 'ally_accept_pact': {
        const o = national.diplomacy.offers.find((x) => x.from === ally && x.to === human);
        if (o) national.diplomaticAction(human, { type: 'answer_offer', offerId: o.id, accept: true });
        return;
      }
      case 'ally_market': {
        if (sim.buildings.some((b) => b.owner === ally && b.type === 'market')) return;
        const hq = sim.hqOf(ally);
        if (!hq) return;
        // a validação de posição confere o custo: o aliado parado recebe o da obra (ela nasce pronta, sem gastar)
        sim.grantResources(ally, sim.buildingCostFor(ally, 'market'));
        const cell = this.freeCellNear(ally, 'market', hq, 3, 12, true) ?? this.freeCellNear(ally, 'market', hq, 3, 14);
        if (cell) sim.addBuilding('market', ally, cell, 1);
        return;
      }
      case 'ally_highway':
        this.allyHighway();
        return;
      case 'finish_highway':
        this.finishHighway();
        return;
      case 'ally_buy': {
        const listing = sim.trade.listings.find((l) => l.seller === human);
        if (!listing) return;
        const n = national.nation(ally);
        if (n) n.works.fundUsd = Math.max(n.works.fundUsd, n.dayUsd * 400 + listing.priceUsd * 2);
        sim.applyCommand(ally, { type: 'trade_buy', listingId: listing.id, mode: 'road' });
        return;
      }
      case 'reveal_enemy': {
        const foe = sim.hqOf(enemy);
        const hq = sim.hqOf(human);
        if (!foe || !hq) return;
        const d = Math.hypot(foe.pos.x - hq.pos.x, foe.pos.y - hq.pos.y) || 1;
        const k = 1 - (13 * cs) / d;
        sim.addUnit('scout', human, { x: hq.pos.x + (foe.pos.x - hq.pos.x) * k, y: hq.pos.y + (foe.pos.y - hq.pos.y) * k });
        return;
      }
      case 'weaken_enemy': {
        // a defesa cai e chegam reforços já atacando: o tutorial nunca trava na última missão
        const foe = sim.hqOf(enemy);
        if (!foe) return;
        foe.hp = Math.min(foe.hp, 40);
        for (const b of sim.buildings) if (b.owner === enemy && b.type === 'tower') b.hp = 1;
        for (const u of sim.units) if (u.owner === enemy && u.hp > 0) u.hp = 1;
        const r = this.rally();
        const fresh = [0, 1, 2].map((i) => sim.addUnit('infantry', human, { x: r.x + i * 1.5, y: r.y }).id);
        sim.applyCommand(human, { type: 'attack', unitIds: [...fresh, ...this.army().map((u) => u.id)], targetId: foe.id });
        return;
      }
      case 'grant_army': {
        const hq = sim.hqOf(human);
        if (!hq) return;
        for (let i = this.army().length; i < 5; i++) sim.addUnit('infantry', human, { x: hq.pos.x + 6 + i * 1.5, y: hq.pos.y + 6 });
        return;
      }
      case 'finish_obra': {
        const b = sim.buildings.find((x) => x.owner === human && x.progress < 1 && x.hp > 0);
        if (b) b.builtTicks = Math.max(b.builtTicks, b.buildTicks - 1);
        return;
      }
    }
  }

  // ------------------------------------------------------------ ajudantes

  /** Estoque mínimo do jogador (o tutorial ensina a ordem, não a falta). */
  private topUp(): void {
    const p = this.sim.players[this.human];
    if (!p) return;
    const grant: Partial<Record<keyof typeof FLOOR, number>> = {};
    for (const [r, min] of Object.entries(FLOOR) as [keyof typeof FLOOR, number][]) {
      const have = (p.resources as Record<string, number>)[r] ?? 0;
      if (have < min) grant[r] = min - have;
    }
    if (Object.keys(grant).length) this.sim.grantResources(this.human, grant);
    // sempre dois cidadãos livres (dentro da moradia): sem eles, quartel e terminal param sem trabalhador
    const pop = this.sim.population(this.human);
    if (pop.idle < 2 && pop.total < pop.cap) p.citizens += Math.min(2 - pop.idle, pop.cap - pop.total);
    const n = this.national.nation(this.human);
    if (n && n.works.fundUsd < n.dayUsd * 120) n.works.fundUsd = n.dayUsd * 120;
  }

  private grantTechs(slot: Slot, techs: TechId[]): void {
    const done = this.national.nation(slot)?.research.done;
    if (!done) return;
    for (const t of techs) if (!done.includes(t)) done.push(t);
  }

  private army() {
    return this.sim.units.filter((u) => u.owner === this.human && u.hp > 0 && !UNITS[u.type].naval && u.type !== 'scout');
  }

  private ownRoads(): number {
    return this.sim.roads.filter((r) => r.owner === this.human).length;
  }

  /** Ponto de encontro: 9 células à frente do QG, na direção do inimigo. */
  private rally(): { x: number; y: number } {
    const hq = this.sim.hqOf(this.human);
    const foe = this.sim.hqOf(this.enemy);
    if (!hq) return { x: 0, y: 0 };
    if (!foe) return { x: hq.pos.x + 9 * this.sim.map.cellSize, y: hq.pos.y };
    const d = Math.hypot(foe.pos.x - hq.pos.x, foe.pos.y - hq.pos.y) || 1;
    const k = (9 * this.sim.map.cellSize) / d;
    return { x: hq.pos.x + (foe.pos.x - hq.pos.x) * k, y: hq.pos.y + (foe.pos.y - hq.pos.y) * k };
  }

  private markPos(m: TutorialMark): { x: number; y: number }[] {
    const { sim, human } = this;
    const cs = sim.map.cellSize;
    const at = (b: Building | undefined) => (b ? [{ x: b.pos.x, y: b.pos.y }] : []);
    switch (m) {
      case 'hq':
        return at(sim.hqOf(human));
      case 'ally_hq':
        return at(sim.hqOf(this.ally));
      case 'enemy_hq':
        return at(sim.hqOf(this.enemy));
      case 'power':
        return at(sim.buildings.find((b) => b.owner === human && b.type === 'coal_plant'));
      case 'rally':
        return [this.rally()];
      case 'fertile':
      case 'forest':
      case 'rock': {
        const t = m === 'fertile' ? Terrain.Fertile : m === 'forest' ? Terrain.Forest : Terrain.Rock;
        const c = this.nearestTerrain(t);
        return c ? [{ x: (c.cx + 0.5) * cs, y: (c.cy + 0.5) * cs }] : [];
      }
      case 'patrol':
        return this.patrol.map((id) => sim.entities.get(id)).flatMap((u) => (u && u.hp > 0 ? [{ x: u.pos.x, y: u.pos.y }] : []));
      case 'my_units': {
        const us = this.army();
        if (!us.length) return [];
        return [{ x: us.reduce((s, u) => s + u.pos.x, 0) / us.length, y: us.reduce((s, u) => s + u.pos.y, 0) / us.length }];
      }
      case 'ally_highway_end':
        return this.highwayEnd ? [{ x: (this.highwayEnd.cx + 0.5) * cs, y: (this.highwayEnd.cy + 0.5) * cs }] : [];
    }
  }

  /** Célula do terreno dentro do território do jogador mais perto do QG. */
  private nearestTerrain(t: Terrain): { cx: number; cy: number } | null {
    const { sim, human } = this;
    const hq = sim.hqOf(human);
    if (!hq) return null;
    const W = sim.map.width;
    let best: { cx: number; cy: number } | null = null;
    let bd = Infinity;
    for (let i = 0; i < sim.map.terrain.length; i++) {
      if (sim.map.terrain[i] !== t || sim.territory[i] !== human) continue;
      const cx = i % W;
      const cy = Math.floor(i / W);
      const d = Math.hypot(cx - hq.cell.cx, cy - hq.cell.cy);
      if (d < bd) {
        bd = d;
        best = { cx, cy };
      }
    }
    return best;
  }

  /** Célula válida para `type` a `min`..`max` células de `near` (com `byRoad`, encostada numa estrada). */
  private freeCellNear(slot: Slot, type: 'tower' | 'market', near: Building, min: number, max: number, byRoad = false): { cx: number; cy: number } | null {
    const { sim } = this;
    const size = BUILDINGS[type].size;
    const W = sim.map.width;
    for (let r = min; r <= max; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cell = { cx: near.cell.cx + dx, cy: near.cell.cy + dy };
          if (sim.placementError(slot, type, cell) !== null) continue;
          if (byRoad) {
            let touches = false;
            for (let k = -1; k <= size && !touches; k++)
              for (const [x, y] of [
                [cell.cx + k, cell.cy - 1],
                [cell.cx + k, cell.cy + size],
                [cell.cx - 1, cell.cy + k],
                [cell.cx + size, cell.cy + k],
              ] as [number, number][])
                if (x >= 0 && y >= 0 && x < W && y < sim.map.height && sim.map.terrain[y * W + x] === Terrain.Road) touches = true;
            if (!touches) continue;
          }
          return cell;
        }
    return null;
  }

  /** Células em volta (vizinhas norte/sul/leste/oeste) de um edifício. */
  private ring(b: Building): number[] {
    const { sim } = this;
    const W = sim.map.width;
    const size = BUILDINGS[b.type].size;
    const out: number[] = [];
    for (let k = 0; k < size; k++)
      for (const [x, y] of [
        [b.cell.cx + k, b.cell.cy - 1],
        [b.cell.cx + k, b.cell.cy + size],
        [b.cell.cx - 1, b.cell.cy + k],
        [b.cell.cx + size, b.cell.cy + k],
      ] as [number, number][])
        if (x >= 0 && y >= 0 && x < W && y < sim.map.height) out.push(y * W + x);
    return out;
  }

  /**
   * Busca em largura de `from` até alguma célula de `to`, andando por planície, solo fértil, mata e estrada livres, só
   * nos territórios de `owners` ou na terra neutra. Devolve as células do caminho (sem as de chegada).
   */
  private path(from: number[], to: Set<number>, owners: Slot[]): number[] | null {
    const { sim } = this;
    const W = sim.map.width;
    const H = sim.map.height;
    const prev = new Map<number, number>();
    const queue = [...from];
    for (const i of from) prev.set(i, -1);
    const ok = (i: number) => {
      const t = sim.map.terrain[i];
      if (t !== Terrain.Plains && t !== Terrain.Fertile && t !== Terrain.Forest && t !== Terrain.Road) return false;
      const o = sim.territory[i] ?? -1;
      if (o >= 0 && !owners.includes(o)) return false;
      return t === Terrain.Road || sim.grid.occupant(i % W, Math.floor(i / W)) === 0;
    };
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]!;
      if (to.has(i)) {
        const out: number[] = [];
        for (let k = i; k >= 0; k = prev.get(k)!) out.push(k);
        return out.reverse();
      }
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as [number, number][]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (prev.has(j) || !ok(j)) continue;
        prev.set(j, i);
        queue.push(j);
      }
    }
    return null;
  }

  /** O aliado leva a rodovia do terminal dele até a terra neutra colada à fronteira do jogador, perto do terminal dele. */
  private allyHighway(): void {
    const { sim, human, ally } = this;
    if (this.highwayEnd) return;
    const market = sim.buildings.find((b) => b.owner === ally && b.type === 'market' && b.progress >= 1);
    const mine = sim.buildings.find((b) => b.owner === human && b.type === 'market') ?? sim.hqOf(human);
    if (!market || !mine) return;
    const W = sim.map.width;
    // pontas possíveis: terra neutra vizinha do território do jogador; a mais perto do terminal dele
    const ends: number[] = [];
    for (let i = 0; i < sim.territory.length; i++) {
      if ((sim.territory[i] ?? -1) >= 0) continue;
      const x = i % W;
      const y = Math.floor(i / W);
      if ([i + 1, i - 1, i + W, i - W].some((j) => j >= 0 && j < sim.territory.length && sim.territory[j] === human && Math.abs((j % W) - x) <= 1 && Math.abs(Math.floor(j / W) - y) <= 1)) ends.push(i);
    }
    ends.sort((a, b) => Math.hypot((a % W) - mine.cell.cx, Math.floor(a / W) - mine.cell.cy) - Math.hypot((b % W) - mine.cell.cx, Math.floor(b / W) - mine.cell.cy));
    for (const end of ends.slice(0, 12)) {
      const route = this.path(this.ring(market), new Set([end]), [ally]);
      if (!route) continue;
      sim.layHighway(ally, route.filter((i) => sim.map.terrain[i] !== Terrain.Road || sim.roads.some((r) => r.i === i && r.owner === ally)));
      this.highwayEnd = { cx: end % W, cy: Math.floor(end / W) };
      // o jogador precisa conhecer a ponta para traçar até ela
      const ex = sim.explored[human];
      if (ex) for (const i of route) ex[i] = 1;
      return;
    }
  }

  /** Ajuda: o diretor termina a ligação do terminal do jogador até a ponta da rodovia do aliado. */
  private finishHighway(): void {
    const { sim, human } = this;
    if (!this.highwayEnd) this.allyHighway();
    const mine = sim.buildings.find((b) => b.owner === human && b.type === 'market' && b.progress >= 1);
    if (!mine || !this.highwayEnd) return;
    const W = sim.map.width;
    const end = this.highwayEnd.cy * W + this.highwayEnd.cx;
    const route = this.path(this.ring(mine), new Set([end]), [human]);
    if (!route) return;
    sim.layHighway(human, route.filter((i) => sim.map.terrain[i] !== Terrain.Road));
  }
}
