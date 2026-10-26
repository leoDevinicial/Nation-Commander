import { TICK_RATE, UNITS, type UnitType } from '../sim/config.ts';
import { generateBattleMap } from '../sim/MapGen.ts';
import { Simulation } from '../sim/Simulation.ts';
import type { ModId } from '../sim/modernization.ts';
import type { EntityId, SimEvent, Slot, Unit } from '../sim/types.ts';
import { geoOf } from '../data/geography.ts';
import { distanceKm, sectorById, sectorsOf, type SectorDef } from '../data/sectors.ts';
import { TICKS_PER_DAY } from './params.ts';
import type { NationalSimulation } from './NationalSimulation.ts';
import type { NationId } from './Diplomacy.ts';

/**
 * Operações expedicionárias (Fase 8): a guerra contra um governo fora do teatro acontece nas
 * regiões (setores) do país inimigo. O jogador escolhe um setor no mapa operacional e envia
 * unidades reais do teatro; elas saem do teatro (associação persistente por registro), viajam,
 * lutam numa batalha tática local (uma segunda `Simulation`, com mapa gerado pelo bioma e pelo
 * relevo do setor) e voltam com a vida e o equipamento que restaram. O resultado é reconciliado
 * uma única vez: baixas, munição, custo em US$, guarnição inimiga, ocupação e notícia.
 */

export type SectorControl = 'enemy' | 'occupied';
export type OperationState = 'transit' | 'battle' | 'returning' | 'done';
export type OperationOutcome = 'victory' | 'defeat' | 'retreat' | 'stalemate';

export const OPS = {
  /** km por dia de deslocamento (mobilização, transporte e aproximação). */
  kmPerDay: 900,
  minTravelDays: 3,
  maxTravelDays: 20,
  maxUnits: 16,
  /** Suprimentos por unidade enviada e petróleo por veículo (na partida). */
  suppliesPerUnit: 15,
  oilPerVehicle: 12,
  /** US$ por unidade: base + por 1.000 km. */
  usdPerUnit: 1_500_000,
  usdPerUnitPer1000Km: 600_000,
  /** Suprimentos por disparo do atacante (munição), cobrados na reconciliação. */
  ammoPerShot: 0.15,
  /** Batalha sem decisão vira impasse e as tropas recuam. */
  maxBattleSeconds: 480,
  /** Guarnição: unidades por força de defesa e recuperação diária de setores não ocupados. */
  garrisonRegenPerDay: 0.01,
  /** Renda diária de um setor ocupado (entregue no teatro): suprimentos ∝ economia; petróleo se houver campos. */
  occupiedSuppliesBase: 6,
  occupiedSuppliesPerShare: 60,
  occupiedOil: 8,
  battleMapSize: 40,
};

export interface ExpUnit {
  /** Id da unidade no teatro (preservado para rastrear a mesma unidade). */
  originId: EntityId;
  type: UnitType;
  hp: number;
  maxHp: number;
  mods: ModId[];
  /** Id na batalha local (enquanto ela existe). */
  battleId: EntityId | null;
  lost: boolean;
}

export interface OperationResult {
  outcome: OperationOutcome;
  sent: number;
  lost: number;
  returned: number;
  enemyLost: number;
  enemyInitial: number;
  ammoSupplies: number;
  usd: number;
  supplies: number;
  oil: number;
  occupied: boolean;
  gdpLossUsd: number;
  days: number;
}

export interface Operation {
  id: number;
  owner: Slot;
  target: NationId;
  sectorId: string;
  state: OperationState;
  units: ExpUnit[];
  launchTick: number;
  arriveTick: number;
  battleStartTick: number;
  returnTick: number;
  travelDays: number;
  cost: { usd: number; supplies: number; oil: number };
  seed: number;
  retreat: boolean;
  /** Ids das unidades da guarnição na batalha (para contar as baixas inimigas). */
  defenders: EntityId[];
  shots: number;
  result: OperationResult | null;
}

export interface SectorState {
  id: string;
  target: NationId;
  control: SectorControl;
  /** Força da guarnição (0..1) — cai com as baixas e se recupera com o tempo. */
  garrison: number;
}

export interface OperationsSave {
  nextId: number;
  ops: Operation[];
  sectors: SectorState[];
  /** Batalhas em andamento, no texto de `Simulation.serialize` (preserva ±Infinity). */
  battles: Record<number, string>;
}

/** Tamanho da guarnição completa de um setor: cresce com o orçamento de defesa e o peso econômico. */
export function garrisonSize(defenseUsd: number, sector: SectorDef): number {
  const base = 3 + Math.log10(1 + defenseUsd / 1e9) * 2.4 + sector.share * 8;
  return Math.max(4, Math.min(14, Math.round(base)));
}

/** Composição da guarnição: infantaria, blindados, tanques e artilharia (relevo favorece a infantaria). */
export function garrisonUnits(count: number, sector: SectorDef): UnitType[] {
  const out: UnitType[] = [];
  const tankShare = sector.mountains || sector.biome === 'tropical' ? 0.15 : 0.3;
  for (let i = 0; i < count; i++) {
    const k = (i + 0.5) / count;
    out.push(k < tankShare ? 'tank' : k < tankShare + 0.15 ? 'apc' : k < tankShare + 0.25 ? 'artillery' : 'infantry');
  }
  return out;
}

export function travelDays(fromCountry: string, sector: SectorDef): number {
  const from = geoOf(fromCountry)?.capital;
  const km = from ? distanceKm(from, sector) : 3000;
  return Math.max(OPS.minTravelDays, Math.min(OPS.maxTravelDays, Math.round(km / OPS.kmPerDay)));
}

export function operationCost(fromCountry: string, sector: SectorDef, types: readonly UnitType[]): { usd: number; supplies: number; oil: number; days: number; km: number } {
  const from = geoOf(fromCountry)?.capital;
  const km = from ? distanceKm(from, sector) : 3000;
  const vehicles = types.filter((t) => t !== 'infantry').length;
  return {
    usd: Math.round(types.length * (OPS.usdPerUnit + (OPS.usdPerUnitPer1000Km * km) / 1000)),
    supplies: OPS.suppliesPerUnit * types.length,
    oil: OPS.oilPerVehicle * vehicles,
    days: travelDays(fromCountry, sector),
    km: Math.round(km),
  };
}

export class OperationsSystem {
  nextId = 1;
  ops: Operation[] = [];
  sectors: SectorState[] = [];
  /** Batalhas locais em andamento (uma `Simulation` por operação em combate). */
  readonly battles = new Map<number, Simulation>();
  /** Eventos de cada batalha desde o último snapshot (para o cliente). */
  readonly battleEvents = new Map<number, SimEvent[]>();
  /** Batalhas encerradas neste passo (o servidor envia o estado final e descarta). */
  readonly finishedBattles = new Map<number, Simulation>();

  constructor(
    private readonly theater: Simulation,
    private readonly national: NationalSimulation,
    private readonly seed: number,
  ) {}

  // ------------------------------------------------------------------ consultas

  private countryOf(id: NationId): string {
    return this.national.nation(id)?.countryId ?? '';
  }

  /** Estado dos setores de um país (criados na primeira consulta). */
  sectorsOf(target: NationId): SectorState[] {
    const country = this.countryOf(target);
    const defs = sectorsOf(country);
    for (const d of defs) if (!this.sectors.some((s) => s.id === d.id && s.target === target)) this.sectors.push({ id: d.id, target, control: 'enemy', garrison: 1 });
    return this.sectors.filter((s) => s.target === target);
  }

  sector(target: NationId, id: string): SectorState | undefined {
    return this.sectorsOf(target).find((s) => s.id === id);
  }

  activeOf(slot: Slot): Operation | undefined {
    return this.ops.find((o) => o.owner === slot && o.state !== 'done');
  }

  battleOf(slot: Slot): { op: Operation; sim: Simulation } | null {
    const op = this.ops.find((o) => o.owner === slot && o.state === 'battle');
    const sim = op ? this.battles.get(op.id) : undefined;
    return op && sim ? { op, sim } : null;
  }

  // ------------------------------------------------------------------ comandos

  /** Motivo de não poder lançar (mesma regra no painel). */
  launchBlocker(slot: Slot, target: NationId, sectorId: string, unitIds: readonly EntityId[]): string | null {
    if (this.national.isNpc(slot)) return 'Nação inválida';
    if (!this.national.isNpc(target)) return 'Operações expedicionárias são contra governos fora deste teatro (jogadores se enfrentam no próprio teatro)';
    if (!this.national.diplomacy.atWar(slot, target)) return 'Sem estado de guerra com este país: declare guerra pelo globo primeiro';
    const def = sectorById(sectorId);
    if (!def || def.countryId !== this.countryOf(target)) return 'Setor inválido';
    const st = this.sector(target, sectorId)!;
    if (st.control === 'occupied') return 'Setor já ocupado';
    if (this.activeOf(slot)) return 'Já há uma operação em andamento: conclua ou recue antes de lançar outra';
    if (!unitIds.length) return 'Escolha as unidades que vão compor a força expedicionária';
    if (unitIds.length > OPS.maxUnits) return `No máximo ${OPS.maxUnits} unidades por operação`;
    const units = unitIds.map((id) => this.theater.entities.get(id));
    if (units.some((u) => !u || u.kind !== 'unit' || u.owner !== slot || u.hp <= 0)) return 'Unidades inválidas';
    if ((units as Unit[]).some((u) => u.refit)) return 'Há unidades em modernização';
    const cost = operationCost(
      this.countryOf(slot),
      def,
      (units as Unit[]).map((u) => u.type),
    );
    const res = this.theater.players[slot]?.resources;
    if (!res) return 'Nação inválida';
    if (res.supplies < cost.supplies) return `Suprimentos insuficientes: ${cost.supplies} necessários`;
    if (res.oil < cost.oil) return `Combustível insuficiente: ${cost.oil} de petróleo necessários`;
    const n = this.national.nation(slot)!;
    if ((n.debtUsd / n.gdpUsd) * 100 > 250) return 'Sem capacidade de financiar a operação: dívida acima de 250% do PIB';
    return null;
  }

  launch(slot: Slot, target: NationId, sectorId: string, unitIds: readonly EntityId[]): string | null {
    const err = this.launchBlocker(slot, target, sectorId, unitIds);
    if (err) return err;
    const def = sectorById(sectorId)!;
    const units = this.theater.detachUnits(slot, unitIds);
    const cost = operationCost(
      this.countryOf(slot),
      def,
      units.map((u) => u.type),
    );
    this.theater.spendResources(slot, { supplies: cost.supplies, oil: cost.oil });
    this.national.militarySpend(slot, cost.usd);
    const tick = this.theater.tick;
    const op: Operation = {
      id: this.nextId++,
      owner: slot,
      target,
      sectorId,
      state: 'transit',
      units: units.map((u) => ({ originId: u.id, type: u.type, hp: u.hp, maxHp: u.maxHp, mods: [...u.mods], battleId: null, lost: false })),
      launchTick: tick,
      arriveTick: tick + cost.days * TICKS_PER_DAY,
      battleStartTick: 0,
      returnTick: 0,
      travelDays: cost.days,
      cost: { usd: cost.usd, supplies: cost.supplies, oil: cost.oil },
      seed: (this.seed ^ Math.imul(this.nextId, 0x9e3779b1)) >>> 0,
      retreat: false,
      defenders: [],
      shots: 0,
      result: null,
    };
    this.ops.push(op);
    return null;
  }

  /** Recuo: encerra a batalha e traz os sobreviventes (ou cancela a viagem de ida). */
  retreat(slot: Slot, opId: number): string | null {
    const op = this.ops.find((o) => o.id === opId);
    if (!op || op.owner !== slot) return 'Operação inválida';
    if (op.state === 'transit') {
      // ainda a caminho: volta sem combate, pelo tempo já percorrido
      const elapsed = this.theater.tick - op.launchTick;
      this.finish(op, 'retreat', null, elapsed);
      return null;
    }
    if (op.state !== 'battle') return 'A operação não está em combate';
    op.retreat = true;
    return null;
  }

  /** Ordem do jogador dentro da batalha local (só ordens de unidades). */
  battleCommand(slot: Slot, cmd: Parameters<Simulation['applyCommand']>[1]): string | null {
    const b = this.battleOf(slot);
    if (!b) return 'Nenhuma batalha em andamento';
    if (cmd.type !== 'move' && cmd.type !== 'attack_move' && cmd.type !== 'attack' && cmd.type !== 'stop') return 'Na batalha local só há ordens às tropas';
    return b.sim.applyCommand(0, cmd);
  }

  // ------------------------------------------------------------------ passo

  step(): void {
    const tick = this.theater.tick;
    for (const op of this.ops) {
      if (op.state === 'transit' && tick >= op.arriveTick) this.startBattle(op);
      else if (op.state === 'battle') this.stepBattle(op);
      else if (op.state === 'returning' && tick >= op.returnTick) this.arrive(op);
    }
    if (tick % TICKS_PER_DAY === 0) this.daily();
  }

  private startBattle(op: Operation): void {
    const def = sectorById(op.sectorId)!;
    const st = this.sector(op.target, op.sectorId)!;
    const map = generateBattleMap(op.seed, def, OPS.battleMapSize);
    const sim = new Simulation({ map, playerCount: 2, startingUnits: [], startingResources: { supplies: 0, food: 0, wood: 0, stone: 0, iron: 0, oil: 0 }, allAtWar: true, battle: true });
    for (const p of sim.players) p.recruits = 0;
    // atacantes: as mesmas unidades enviadas, com vida e equipamento preservados
    const fieldHq = sim.hqOf(0)!;
    for (const u of op.units) {
      const b = sim.spawnUnitNear(fieldHq, u.type, 1, u.mods);
      if (!b) {
        u.lost = true;
        continue;
      }
      b.maxHp = u.maxHp;
      b.hp = u.hp;
      u.battleId = b.id;
    }
    // defensores: guarnição proporcional à defesa do país e ao estado do setor, com torres
    const full = garrisonSize(this.national.defenseBudgetUsd(op.target), def);
    const count = Math.max(2, Math.round(full * st.garrison));
    const post = sim.hqOf(1)!;
    for (const t of garrisonUnits(count, def)) {
      const u = sim.spawnUnitNear(post, t);
      if (u) op.defenders.push(u.id);
    }
    const towers = 1 + (def.mountains ? 1 : 0) + (def.infra.includes('airfield') ? 1 : 0);
    for (let i = 0; i < towers; i++) {
      // torres à frente do posto de comando, voltadas para o oeste (de onde o atacante vem)
      for (let tries = 0; tries < 6; tries++) {
        const cell = { cx: post.cell.cx - 4 - tries, cy: post.cell.cy - 3 + i * 4 };
        if (!sim.footprintFree(cell, 1)) continue;
        op.defenders.push(sim.addBuilding('tower', 1, cell, 1).id);
        break;
      }
    }
    op.state = 'battle';
    op.battleStartTick = this.theater.tick;
    this.battles.set(op.id, sim);
    this.battleEvents.set(op.id, []);
  }

  private stepBattle(op: Operation): void {
    const sim = this.battles.get(op.id);
    if (!sim) return;
    sim.step();
    const ev = sim.drainEvents();
    for (const e of ev) if (e.type === 'shot' && this.isAttacker(sim, e.attackerId)) op.shots++;
    this.battleEvents.get(op.id)?.push(...ev);
    const attackersAlive = op.units.some((u) => u.battleId !== null && (sim.entities.get(u.battleId)?.hp ?? 0) > 0);
    const elapsed = (this.theater.tick - op.battleStartTick) / TICK_RATE;
    let outcome: OperationOutcome | null = null;
    if (sim.ended) outcome = sim.winner === 0 ? 'victory' : 'defeat';
    else if (!attackersAlive) outcome = 'defeat';
    else if (op.retreat) outcome = 'retreat';
    else if (elapsed >= OPS.maxBattleSeconds) outcome = 'stalemate';
    if (outcome) this.finish(op, outcome, sim, this.theater.tick - op.launchTick);
  }

  private isAttacker(sim: Simulation, id: EntityId): boolean {
    const e = sim.entities.get(id);
    return !!e && e.owner === 0;
  }

  /** Reconciliação única: perdas, munição, guarnição, ocupação, custos e notícia. */
  private finish(op: Operation, outcome: OperationOutcome, sim: Simulation | null, elapsedTicks: number): void {
    if (op.result) return;
    let lost = 0;
    for (const u of op.units) {
      if (u.lost) {
        lost++;
        continue;
      }
      if (!sim) continue; // voltou antes do combate: intacta
      const e = u.battleId !== null ? sim.entities.get(u.battleId) : undefined;
      // derrota com o posto avançado destruído: as forças restantes se rendem (a simulação já as removeu)
      if (!e || e.kind !== 'unit' || e.hp <= 0) {
        u.lost = true;
        lost++;
        continue;
      }
      u.hp = e.hp;
      u.maxHp = e.maxHp;
      u.mods = [...e.mods];
    }
    const st = this.sector(op.target, op.sectorId)!;
    const def = sectorById(op.sectorId)!;
    let enemyLost = 0;
    if (sim) {
      enemyLost = op.defenders.filter((id) => (sim.entities.get(id)?.hp ?? 0) <= 0).length;
      const garrisonUnitsLeft = op.defenders.filter((id) => {
        const e = sim.entities.get(id);
        return e && e.kind === 'unit' && e.hp > 0;
      }).length;
      const full = garrisonSize(this.national.defenseBudgetUsd(op.target), def);
      st.garrison = outcome === 'victory' ? 0 : Math.max(0.1, Math.min(1, garrisonUnitsLeft / full));
    }
    const occupied = outcome === 'victory';
    let gdpLoss = 0;
    if (occupied) {
      st.control = 'occupied';
      gdpLoss = this.national.applyOccupation(op.owner, op.target, def.share);
    }
    // munição gasta: cobrada no teatro (até o que houver)
    const ammo = Math.round(op.shots * OPS.ammoPerShot);
    const res = this.theater.players[op.owner]?.resources;
    const ammoPaid = res ? Math.min(ammo, Math.floor(res.supplies)) : 0;
    if (ammoPaid > 0) this.theater.spendResources(op.owner, { supplies: ammoPaid });
    this.theater.releaseDetached(op.owner, lost);
    this.national.registerCasualties(op.owner, lost);
    const returned = op.units.length - lost;
    op.result = {
      outcome,
      sent: op.units.length,
      lost,
      returned,
      enemyLost,
      enemyInitial: op.defenders.length,
      ammoSupplies: ammoPaid,
      usd: op.cost.usd,
      supplies: op.cost.supplies,
      oil: op.cost.oil,
      occupied,
      gdpLossUsd: Math.round(gdpLoss),
      days: Math.round(elapsedTicks / TICKS_PER_DAY),
    };
    this.national.pushEvent({
      type: 'operation',
      day: this.national.day,
      slot: op.owner,
      target: op.target,
      sector: def.name,
      outcome,
      sent: op.units.length,
      lost,
      enemyLost,
      usd: op.cost.usd,
      occupied,
    });
    // volta: pelo mesmo tempo da ida (ou pelo tempo já percorrido, se recuou a caminho)
    const back = sim ? op.travelDays * TICKS_PER_DAY : elapsedTicks;
    op.returnTick = this.theater.tick + back;
    op.state = returned > 0 ? 'returning' : 'done';
    if (sim) {
      this.battles.delete(op.id);
      // a batalha fica disponível para o último snapshot (o Room a descarta depois de enviar)
      this.finishedBattles.set(op.id, sim);
    }
  }

  private arrive(op: Operation): void {
    for (const u of op.units) if (!u.lost) this.theater.returnUnit(op.owner, u);
    op.state = 'done';
  }

  /** Por dia: setores ocupados rendem no teatro; guarnições não ocupadas se recompõem. */
  private daily(): void {
    for (const s of this.sectors) {
      if (s.control === 'enemy') {
        s.garrison = Math.min(1, s.garrison + OPS.garrisonRegenPerDay);
        continue;
      }
      const owner = this.ops.find((o) => o.sectorId === s.id && o.target === s.target && o.result?.occupied)?.owner;
      if (owner === undefined) continue;
      const def = sectorById(s.id)!;
      this.theater.storeFromTrade(owner, 'supplies', Math.round(OPS.occupiedSuppliesBase + OPS.occupiedSuppliesPerShare * def.share));
      if (def.infra.includes('oil')) this.theater.storeFromTrade(owner, 'oil', OPS.occupiedOil);
    }
  }

  // ------------------------------------------------------------------ salvar/carregar

  toSave(): OperationsSave {
    const battles: Record<number, string> = {};
    for (const [id, sim] of this.battles) battles[id] = sim.serialize();
    return JSON.parse(JSON.stringify({ nextId: this.nextId, ops: this.ops, sectors: this.sectors, battles })) as OperationsSave;
  }

  load(s: OperationsSave | undefined): void {
    if (!s) return;
    const c = JSON.parse(JSON.stringify(s)) as OperationsSave;
    this.nextId = c.nextId;
    this.ops = c.ops;
    this.sectors = c.sectors;
    this.battles.clear();
    for (const [id, save] of Object.entries(c.battles)) {
      this.battles.set(Number(id), Simulation.deserialize(save));
      this.battleEvents.set(Number(id), []);
    }
  }
}

export const unitLabel = (t: UnitType) => UNITS[t].label;

// ------------------------------------------------------------------ visão do jogador

export interface SectorView {
  id: string;
  name: string;
  lat: number;
  lon: number;
  biome: SectorDef['biome'];
  coast: boolean;
  river: boolean;
  mountains: boolean;
  infra: SectorDef['infra'];
  share: number;
  control: SectorControl;
  /** Estimativa de inteligência: unidades da guarnição (arredondada). */
  garrison: number;
}

export interface OperationView {
  id: number;
  target: NationId;
  sectorId: string;
  sectorName: string;
  state: OperationState;
  units: { originId: EntityId; type: UnitType; hp: number; maxHp: number; lost: boolean }[];
  /** Dias até o próximo marco (chegada ao setor ou volta ao teatro). */
  daysLeft: number;
  travelDays: number;
  cost: Operation['cost'];
  result: OperationResult | null;
}

export interface OperationsView {
  /** Países da IA em guerra com o jogador e o estado de cada setor. */
  wars: { target: NationId; countryId: string; sectors: SectorView[] }[];
  ops: OperationView[];
}

export function operationsView(sys: OperationsSystem, national: NationalSimulation, slot: Slot, tick: number): OperationsView {
  const wars: OperationsView['wars'] = [];
  for (const [a, b] of national.diplomacy.warPairs()) {
    const target = a === slot ? b : b === slot ? a : null;
    if (target === null || !national.isNpc(target)) continue;
    const countryId = national.nation(target)?.countryId ?? '';
    const full = (d: SectorDef) => garrisonSize(national.defenseBudgetUsd(target), d);
    wars.push({
      target,
      countryId,
      sectors: sys.sectorsOf(target).map((s) => {
        const d = sectorById(s.id)!;
        return {
          id: s.id,
          name: d.name,
          lat: d.lat,
          lon: d.lon,
          biome: d.biome,
          coast: d.coast,
          river: d.river,
          mountains: d.mountains,
          infra: d.infra,
          share: d.share,
          control: s.control,
          garrison: s.control === 'occupied' ? 0 : Math.max(2, Math.round(full(d) * s.garrison)),
        };
      }),
    });
  }
  const ops = sys.ops
    .filter((o) => o.owner === slot && (o.state !== 'done' || tick - o.returnTick < TICKS_PER_DAY * 60))
    .map((o) => ({
      id: o.id,
      target: o.target,
      sectorId: o.sectorId,
      sectorName: sectorById(o.sectorId)?.name ?? o.sectorId,
      state: o.state,
      units: o.units.map((u) => ({ originId: u.originId, type: u.type, hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), lost: u.lost })),
      daysLeft: Math.max(0, Math.ceil(((o.state === 'transit' ? o.arriveTick : o.state === 'returning' ? o.returnTick : tick) - tick) / TICKS_PER_DAY)),
      travelDays: o.travelDays,
      cost: o.cost,
      result: o.result,
    }));
  return { wars, ops };
}
