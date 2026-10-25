import { BUILDINGS, CITIZEN, OIL_TANK_RANGE, POP_ABSOLUTE_CAP, RESOURCE_TYPES, TICK_RATE, UNITS, canAfford, type BuildingType, type Cost, type Stockpile, type UnitType } from './config.ts';
import { claimableCells, claimedBy } from './gathering.ts';
import type { Command } from './commands.ts';
import type { Simulation } from './Simulation.ts';
import type { Building, Cell, Entity, Slot, Vec2 } from './types.ts';
import { DIPLO } from '../strategic/Diplomacy.ts';

/** Com que frequência a IA reavalia a situação. */
export const AI_THINK_TICKS = TICK_RATE;
/** A IA não lança ofensivas antes deste momento (dá tempo ao jogador de se organizar). */
export const AI_FIRST_ATTACK_TICK = TICK_RATE * 150;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * IA tática. Separa avaliação (o que fazer) da execução (comandos), e emite os mesmos
 * comandos que um jogador humano — sem recursos ocultos nem visão total: só reage a
 * inimigos dentro do raio de visão das próprias entidades. Conhece apenas a posição inicial
 * do QG adversário, como um jogador humano conheceria o mapa.
 *
 * Também obedece à regra de guerra formal: não ataca sem guerra declarada. Quando quer atacar,
 * guarda os recursos da mobilização e pede a declaração (`wantsWarWith`), que o servidor valida
 * pelo mesmo caminho do jogador humano.
 */
export class TacticalAI {
  private waveSize = 8;
  private produced = 0;
  private attacking = false;
  /** País contra o qual a IA quer declarar guerra (lido e processado pelo servidor). */
  wantsWarWith: Slot | null = null;

  constructor(readonly slot: Slot) {}

  think(sim: Simulation): Command[] {
    const hq = sim.hqOf(this.slot);
    if (!hq || sim.ended) return [];
    const cmds: Command[] = [];
    const me = sim.players[this.slot]!;
    const budget: Stockpile = { ...me.resources };
    const take = (cost: Cost): boolean => {
      if (!canAfford(budget, cost)) return false;
      for (const r of RESOURCE_TYPES) budget[r] -= cost[r] ?? 0;
      return true;
    };
    if (this.wantsWarWith !== null && sim.hostile(this.slot, this.wantsWarWith)) this.wantsWarWith = null;
    // reserva a mobilização enquanto espera a declaração de guerra
    if (this.wantsWarWith !== null) {
      budget.supplies -= DIPLO.warSupplies;
      budget.oil -= DIPLO.warOil;
    }

    const mine = sim.buildings.filter((b) => b.owner === this.slot);
    const army = sim.units.filter((u) => u.owner === this.slot);
    const count = (t: BuildingType) => mine.filter((b) => b.type === t).length;
    const done = (t: BuildingType) => mine.some((b) => b.type === t && b.progress >= 1);

    // --- economia e construção (uma obra por avaliação, na ordem de prioridade)
    const pop = sim.population(this.slot);
    const cap = sim.capacity(this.slot);
    const res = me.resources;
    const nearlyFull = (r: 'wood' | 'stone' | 'iron' | 'food') => cap[r] > 0 && res[r] >= cap[r] * 0.8;
    const tryBuild = (type: BuildingType): boolean => {
      if (!canAfford(budget, BUILDINGS[type].cost)) return false;
      const cell =
        BUILDINGS[type].gather?.terrain === null ? this.freeNode(sim, hq) : type === 'oil_tank' ? this.tankSpot(sim, mine) : this.findBuildSpot(sim, hq, type);
      if (!cell || !take(BUILDINGS[type].cost)) return false;
      cmds.push({ type: 'build', buildingType: type, cx: cell.cx, cy: cell.cy });
      return true;
    };
    const housingInProgress = mine.some((b) => (b.type === 'house' || b.type === 'residential') && b.progress < 1);
    const wellsWithoutTank = mine.some(
      (w) => w.type === 'oil_well' && !mine.some((t) => t.type === 'oil_tank' && dist(t.pos, w.pos) / sim.map.cellSize <= OIL_TANK_RANGE),
    );
    const plan: [BuildingType, boolean][] = [
      ['house', pop.total >= pop.cap - 2 && pop.cap < POP_ABSOLUTE_CAP && !housingInProgress && count('house') + count('residential') < 14],
      ['oil_tank', wellsWithoutTank || (mine.some((b) => b.type === 'oil_well' && b.status === 'storage_full') && count('oil_tank') < 5)],
      ['farm', res.food < 30 && done('farm') && count('farm') < 5],
      ['warehouse', ((nearlyFull('wood') && done('sawmill')) || (nearlyFull('stone') && done('quarry')) || (nearlyFull('iron') && done('mine'))) && count('warehouse') < 4],
      ['silo', nearlyFull('food') && done('farm') && count('silo') < 4],
      ['sawmill', count('sawmill') === 0],
      ['farm', count('farm') === 0],
      ['barracks', count('barracks') === 0],
      ['quarry', count('quarry') === 0],
      ['sawmill', count('sawmill') < 2 && done('barracks')],
      ['mine', count('mine') === 0],
      ['oil_well', count('oil_well') === 0],
      ['farm', count('farm') < 2 && done('barracks')],
      ['factory', count('factory') === 0 && done('barracks')],
      ['oil_well', count('oil_well') < 2 && done('factory')],
      ['sawmill', count('sawmill') < 3 && done('factory')],
      ['farm', count('farm') < 3 && done('factory')],
      ['tower', count('tower') < 1 && done('factory')],
      ['residential', pop.cap >= 60 && pop.total >= pop.cap - 4 && !housingInProgress && count('residential') < 4],
      ['factory', count('factory') < 2 && budget.supplies > 350 && budget.oil > 150],
      ['barracks', count('barracks') < 2 && budget.food > 250],
      ['oil_well', count('oil_well') < 3 && army.length >= 10],
    ];
    for (const [type, wanted] of plan) if (wanted && tryBuild(type)) break;

    // --- população: forma cidadãos para preencher postos e manter reserva para recrutamento
    const vacancies = mine.reduce((a, b) => a + (b.progress >= 1 ? Math.max(0, Math.min(b.workerTarget, BUILDINGS[b.type].workers) - b.workers) : 0), 0);
    if (hq.queue.length < 2 && pop.total < pop.cap && pop.idle + pop.queuedCitizens < vacancies + 3 && take(CITIZEN.cost)) {
      cmds.push({ type: 'produce', buildingId: hq.id, unitType: 'citizen' });
    }

    // --- produção militar: cada unidade precisa de um cidadão ocioso como tripulação
    let crew = pop.idle;
    const factoryMix: UnitType[] = ['tank', 'apc', 'tank', 'artillery'];
    for (const b of mine) {
      if (b.progress < 1 || b.queue.length > 0 || crew <= 0 || b.workers === 0) continue;
      let unitType: UnitType | null = null;
      if (b.type === 'barracks') unitType = 'infantry';
      else if (b.type === 'factory') unitType = factoryMix[(this.produced++ + b.id) % factoryMix.length]!;
      if (!unitType || !take(UNITS[unitType].cost)) continue;
      cmds.push({ type: 'produce', buildingId: b.id, unitType });
      crew--;
    }

    // --- defesa: inimigos visíveis perto da base
    const threat = this.nearestThreat(sim, mine);
    if (threat) {
      const defenders = army.filter((u) => u.order.kind !== 'attack' && dist(u.pos, threat.pos) < 45);
      if (defenders.length > 0) {
        cmds.push({ type: 'attack_move', unitIds: defenders.map((u) => u.id), x: threat.pos.x, y: threat.pos.y });
      }
      return cmds;
    }

    // --- ataque em ondas
    const idle = army.filter((u) => u.order.kind === 'idle' && u.engageId === null);
    if (!this.attacking && idle.length >= this.waveSize && sim.tick >= AI_FIRST_ATTACK_TICK) {
      const objective = this.enemyObjective(sim);
      // sem guerra formal não há ofensiva: pede a declaração e espera
      if (objective && !sim.hostile(this.slot, objective.slot)) this.wantsWarWith = objective.slot;
      const target = objective && sim.hostile(this.slot, objective.slot) ? objective.pos : null;
      if (target) {
        cmds.push({ type: 'attack_move', unitIds: idle.map((u) => u.id), x: target.x, y: target.y });
        this.attacking = true;
        this.waveSize = Math.min(this.waveSize + 2, 16);
      }
    } else if (this.attacking && army.every((u) => u.order.kind === 'idle')) {
      this.attacking = false;
    } else if (!this.attacking) {
      // reúne as tropas ociosas à frente do QG
      const rally = this.rallyPoint(sim, hq);
      const strays = idle.filter((u) => dist(u.pos, rally) > 8);
      if (strays.length > 0) cmds.push({ type: 'move', unitIds: strays.map((u) => u.id), x: rally.x, y: rally.y });
    }
    return cmds;
  }

  private nearestThreat(sim: Simulation, mine: Building[]): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of sim.units) {
      if (!sim.hostile(this.slot, e.owner)) continue;
      for (const b of mine) {
        const d = dist(e.pos, b.pos);
        if (d < 22 && d < bestD && sim.isVisibleTo(this.slot, e.pos)) {
          bestD = d;
          best = e;
        }
      }
    }
    return best;
  }

  private enemyObjective(sim: Simulation): { pos: Vec2; slot: Slot } | null {
    // posições iniciais são conhecidas; mira o QG adversário vivo mais próximo
    let best: { pos: Vec2; slot: Slot } | null = null;
    let bestD = Infinity;
    const hq = sim.hqOf(this.slot)!;
    sim.players.forEach((p) => {
      if (p.slot === this.slot || p.defeated) return;
      const spawn = sim.map.spawns[p.slot];
      if (!spawn) return;
      const pos = sim.grid.cellCenter(spawn);
      const d = dist(pos, hq.pos);
      if (d < bestD) {
        bestD = d;
        best = { pos, slot: p.slot };
      }
    });
    return best;
  }

  private rallyPoint(sim: Simulation, hq: Building): Vec2 {
    const mid = { x: (sim.map.width * sim.map.cellSize) / 2, y: (sim.map.height * sim.map.cellSize) / 2 };
    const d = dist(hq.pos, mid);
    return { x: hq.pos.x + ((mid.x - hq.pos.x) / d) * 12, y: hq.pos.y + ((mid.y - hq.pos.y) / d) * 12 };
  }

  /** Posição para um tanque de petróleo perto de um poço que ainda não tem tanque ao alcance. */
  private tankSpot(sim: Simulation, mine: Building[]): Cell | null {
    const cs = sim.map.cellSize;
    for (const w of mine) {
      if (w.type !== 'oil_well') continue;
      if (mine.some((t) => t.type === 'oil_tank' && dist(t.pos, w.pos) / cs <= OIL_TANK_RANGE)) continue;
      for (let r = 2; r <= 6; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const cell = { cx: w.cell.cx + dx, cy: w.cell.cy + dy };
            if (sim.placementError(this.slot, 'oil_tank', cell) === null && this.hasClearance(sim, cell, 1)) return cell;
          }
    }
    return null;
  }

  private freeNode(sim: Simulation, hq: Building): Cell | null {
    const nodes = [...sim.map.resourceNodes].sort(
      (a, b) => dist(sim.grid.cellCenter(a), hq.pos) - dist(sim.grid.cellCenter(b), hq.pos),
    );
    return nodes.find((n) => sim.placementError(this.slot, 'oil_well', n) === null) ?? null;
  }

  /** Busca em espiral uma posição válida, preferindo o lado voltado ao centro do mapa. */
  /**
   * Busca uma posição válida. Edifícios de coleta preferem o local que reivindica mais células de
   * recurso; os demais, posições próximas ao QG voltadas para o centro do mapa.
   */
  private findBuildSpot(sim: Simulation, hq: Building, type: BuildingType): Cell | null {
    const mid = { x: (sim.map.width * sim.map.cellSize) / 2, y: (sim.map.height * sim.map.cellSize) / 2 };
    const gather = BUILDINGS[type].gather;
    const claimed = gather ? claimedBy(sim.buildings, type) : null;
    const reach = gather ? 13 : 9;
    const candidates: { cell: Cell; score: number }[] = [];
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const r = Math.max(Math.abs(dx), Math.abs(dy));
        if (r < (gather ? 2 : 4)) continue;
        const cell = { cx: hq.cell.cx + dx, cy: hq.cell.cy + dy };
        const c = sim.grid.cellCenter(cell);
        let score = r * 4 + dist(c, mid) * 0.2;
        if (gather && claimed) score -= claimableCells(sim.map, type, cell, claimed).length * 12;
        candidates.push({ cell, score });
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.cell.cy - b.cell.cy || a.cell.cx - b.cell.cx);
    for (const { cell } of candidates) {
      if (sim.placementError(this.slot, type, cell) !== null) continue;
      // deixa um corredor livre de 1 célula ao redor para as unidades circularem
      if (!this.hasClearance(sim, cell, BUILDINGS[type].size)) continue;
      return cell;
    }
    return null;
  }

  private hasClearance(sim: Simulation, cell: Cell, size: number): boolean {
    for (let y = cell.cy - 1; y <= cell.cy + size; y++)
      for (let x = cell.cx - 1; x <= cell.cx + size; x++) {
        if (sim.grid.inBounds(x, y) && sim.grid.occupant(x, y) !== 0) return false;
      }
    return true;
  }
}

