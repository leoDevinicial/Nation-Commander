import { BUILDINGS, CITIZEN, MINE, OIL_TANK_RANGE, RECRUIT, type ResourceType, POP_ABSOLUTE_CAP, PREPARATION_TICKS, RESOURCE_TYPES, TICK_RATE, UNITS, MILITARY_RESEARCH, militaryResearchBlocker, canAfford, type MilitaryResearchId, type BuildingType, type Cost, type Stockpile, type UnitType } from './config.ts';
import { claimableCells, claimedBy } from './gathering.ts';
import { checkProduce } from './production.ts';
import type { Command } from './commands.ts';
import type { Simulation } from './Simulation.ts';
import type { Building, Cell, Entity, Slot, Unit, Vec2 } from './types.ts';
import type { SpecId } from './upgrades.ts';
import { MOD_IDS, MODS, checkModernize } from './modernization.ts';
import { BASE_PRICE } from './trade.ts';
import { DIPLO } from '../strategic/Diplomacy.ts';
import { DIFFICULTY } from './difficulty.ts';
import { ERAS, buildingEra, type Era } from './eras.ts';
import { AIRCRAFT, MISSILE, type AircraftType } from './air.ts';

/** Com que frequência a IA reavalia a situação. */
export const AI_THINK_TICKS = TICK_RATE;
/** A IA não lança ofensivas antes do fim do período de preparo (valores da dificuldade Normal). */
export const AI_FIRST_ATTACK_TICK = PREPARATION_TICKS;
/** Intervalo mínimo entre ondas de ataque (tempo de jogo, dificuldade Normal). */
export const AI_WAVE_COOLDOWN_TICKS = TICK_RATE * 60 * DIFFICULTY.normal.waveCooldownMinutes;
/**
 * Incidentes de fronteira no preparo: a partir de 3 min, a cada 3 min, 2 a 3 tropas da guarnição
 * atacam a borda do território vizinho por 75 s, sem guerra declarada.
 */
export const AI_HARASS_FIRST_TICK = TICK_RATE * 60 * 3;
export const AI_HARASS_EVERY_TICKS = TICK_RATE * 60 * 3;
export const AI_HARASS_SECONDS = 75;
/** Tamanho máximo do exército durante o preparo (defesa da base), salvo se já estiver em guerra. */
export const AI_PREP_GARRISON = 6;
/** A IA só começa a melhorar construções depois deste momento (economia básica primeiro). */
export const AI_FIRST_UPGRADE_TICK = TICK_RATE * 120;
/** Sem crescimento do exército por este tempo, a IA ataca com o que tem (mínimo AI_MIN_WAVE). */
export const AI_STALL_TICKS = TICK_RATE * 180;
export const AI_MIN_WAVE = 6;
/** A IA começa a pesquisa militar depois dos primeiros minutos de economia. */
export const AI_RESEARCH_TICK = TICK_RATE * 240;
/** Campo de minas da IA: raio a partir do QG e passo angular do arco. */
const AI_MINE_RADIUS = 15;
const AI_MINE_ARC_STEP = 0.22;
/** Especialização que a IA escolhe em cada classe (determinística). */
const AI_SPEC: Partial<Record<BuildingType, SpecId>> = {
  hq: 'fortified',
  farm: 'intensive',
  sawmill: 'efficient',
  quarry: 'efficient',
  mine: 'efficient',
  oil_well: 'enhanced',
  warehouse: 'capacity',
  silo: 'capacity',
  oil_tank: 'capacity',
  residential: 'dense',
  barracks: 'drill',
  factory: 'volume',
};

/** Primeira onda e crescimento por onda (dificuldade Normal): a pressão sobe ao longo da partida. */
export const AI_FIRST_WAVE = DIFFICULTY.normal.firstWave;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Força aérea da IA: base aérea a partir de 9 min; reconhecimento a cada 60 s; ataques a cada 45 s. */
export const AI_AIR_TICK = TICK_RATE * 60 * 9;
export const AI_RECON_EVERY_TICKS = TICK_RATE * 60;
export const AI_STRIKE_EVERY_TICKS = TICK_RATE * 45;
/** Alvos preferidos dos ataques aéreos e mísseis (os primeiros da lista primeiro). */
const AIR_TARGETS: BuildingType[] = ['airbase', 'missile_silo', 'factory', 'research_center', 'barracks', 'oil_well', 'oil_tank', 'mine', 'hq'];

/** Força defensiva enviada contra a força inimiga vista perto da base. */
export const AI_DEFENSE_RATIO = 1.5;
/** Contra-bateria: tiro recente (até 10 s), no máximo um grupo a cada 20 s, de até 5 unidades. */
export const AI_COUNTER_FRESH_TICKS = TICK_RATE * 10;
export const AI_COUNTER_COOLDOWN_TICKS = TICK_RATE * 20;
export const AI_COUNTER_GROUP = 5;

/** Força aproximada de uma unidade: dano por segundo × vida (raiz, para ficar na escala do custo). */
export function unitStrength(u: Unit): number {
  const w = UNITS[u.type].weapon;
  return Math.sqrt((w.damage / w.cooldown) * Math.max(1, u.hp));
}

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
export interface TacticalAISave {
  waveSize: number | null;
  produced: number;
  attacking: boolean;
  lastWaveTick: number | null;
  wantsWarWith: Slot | null;
  armyPeak?: number;
  peakTick?: number;
  citySite?: { tick: number; ok: boolean } | null;
  lastCounterTick?: number | null;
  lastHarassTick?: number | null;
  lastReconTick?: number | null;
  lastStrikeTick?: number | null;
}

export class TacticalAI {
  /** Tamanho da próxima onda (null até a primeira avaliação, que lê a dificuldade). */
  private waveSize: number | null = null;
  /** Último incidente de fronteira provocado. */
  private lastHarassTick = -Infinity;
  /** Incidente de fronteira pedido (o servidor abre antes de aplicar as ordens). */
  wantsIncident: { victim: Slot; pos: Vec2 } | null = null;
  private produced = 0;
  private attacking = false;
  private lastWaveTick = -Infinity;
  /** Maior exército desde a última onda e quando foi atingido (detecta produção estagnada). */
  private armyPeak = 0;
  private peakTick = 0;
  /** Último grupo de contra-bateria enviado. */
  private lastCounterTick = -Infinity;
  /** Últimas missões aéreas (reconhecimento e ataque). */
  private lastReconTick = -Infinity;
  private lastStrikeTick = -Infinity;
  /** País contra o qual a IA quer declarar guerra (lido e processado pelo servidor). */
  wantsWarWith: Slot | null = null;

  constructor(readonly slot: Slot) {}

  /** Memória da IA (ondas e ataque em curso) para salvar a partida. */
  toSave(): TacticalAISave {
    return {
      waveSize: this.waveSize,
      produced: this.produced,
      attacking: this.attacking,
      lastWaveTick: Number.isFinite(this.lastWaveTick) ? this.lastWaveTick : null,
      wantsWarWith: this.wantsWarWith,
      armyPeak: this.armyPeak,
      peakTick: this.peakTick,
      citySite: this.citySite ? { ...this.citySite } : null,
      lastCounterTick: Number.isFinite(this.lastCounterTick) ? this.lastCounterTick : null,
      lastHarassTick: Number.isFinite(this.lastHarassTick) ? this.lastHarassTick : null,
      lastReconTick: Number.isFinite(this.lastReconTick) ? this.lastReconTick : null,
      lastStrikeTick: Number.isFinite(this.lastStrikeTick) ? this.lastStrikeTick : null,
    };
  }

  load(s: TacticalAISave): void {
    this.waveSize = s.waveSize;
    this.produced = s.produced;
    this.attacking = s.attacking;
    this.lastWaveTick = s.lastWaveTick ?? -Infinity;
    this.citySite = s.citySite ? { ...s.citySite } : null;
    this.wantsWarWith = s.wantsWarWith;
    this.armyPeak = s.armyPeak ?? 0;
    this.peakTick = s.peakTick ?? 0;
    this.lastCounterTick = s.lastCounterTick ?? -Infinity;
    this.lastHarassTick = s.lastHarassTick ?? -Infinity;
    this.lastReconTick = s.lastReconTick ?? -Infinity;
    this.lastStrikeTick = s.lastStrikeTick ?? -Infinity;
  }

  think(sim: Simulation): Command[] {
    const hq = sim.hqOf(this.slot);
    if (!hq || sim.ended) return [];
    const level = DIFFICULTY[sim.difficulty];
    this.waveSize ??= level.firstWave;
    const prep = sim.prepTicks;
    const cmds: Command[] = [];
    const me = sim.players[this.slot]!;
    const budget: Stockpile = { ...me.resources };
    const take = (cost: Cost): boolean => {
      if (!canAfford(budget, cost)) return false;
      for (const r of RESOURCE_TYPES) budget[r] -= cost[r] ?? 0;
      return true;
    };
    if (this.wantsWarWith !== null && sim.formalWar(this.slot, this.wantsWarWith)) this.wantsWarWith = null;
    // reserva a mobilização enquanto espera a declaração de guerra
    if (this.wantsWarWith !== null) {
      budget.supplies -= DIPLO.warSupplies;
      budget.oil -= DIPLO.warOil;
    }

    const mine = sim.buildings.filter((b) => b.owner === this.slot);
    const army = sim.units.filter((u) => u.owner === this.slot);
    const count = (t: BuildingType) => mine.filter((b) => b.type === t).length;
    // coletas ainda produtivas: um depósito esgotado pede outro edifício em outro lugar
    const active = (t: BuildingType) => mine.filter((b) => b.type === t && b.status !== 'depleted').length;
    const done = (t: BuildingType) => mine.some((b) => b.type === t && b.progress >= 1);

    // --- economia e construção (uma obra por avaliação, na ordem de prioridade)
    const pop = sim.population(this.slot);
    const cap = sim.capacity(this.slot);
    const res = me.resources;
    const nearlyFull = (r: 'wood' | 'stone' | 'iron' | 'food') => cap[r] > 0 && res[r] >= cap[r] * 0.8;
    const tryBuild = (type: BuildingType): boolean => {
      if (buildingEra(type) > sim.eraOf(this.slot)) return false;
      if (!canAfford(budget, BUILDINGS[type].cost)) return false;
      const cell =
        BUILDINGS[type].gather?.terrain === null ? this.freeNode(sim, hq) : type === 'oil_tank' ? this.tankSpot(sim, mine) : this.findBuildSpot(sim, hq, type);
      if (!cell || !take(BUILDINGS[type].cost)) return false;
      cmds.push({ type: 'build', buildingType: type, cx: cell.cx, cy: cell.cy });
      return true;
    };
    const natTechs = sim.national?.techs(this.slot) ?? [];
    // eras: avança assim que o QG permite e sobra uma reserva (destrava tropas e construções). Com o
    // QG pronto para a próxima era, guarda material para ela em vez de gastar em prefeituras e melhorias.
    let savingForEra = false;
    if (sim.eras && !me.eraAdvance && (me.era ?? 1) < 4) {
      const next = ERAS[((me.era ?? 1) + 1) as Era];
      if (sim.hqLevel(this.slot) >= next.hqLevel) {
        const withReserve: Cost = { ...next.cost, supplies: (next.cost.supplies ?? 0) + 120, food: (next.cost.food ?? 0) + 60 };
        if (sim.eraBlocker(this.slot) === null && canAfford(budget, withReserve) && take(next.cost)) cmds.push({ type: 'advance_era' });
        else savingForEra = true;
      }
    }
    const housingInProgress = mine.some((b) => (b.type === 'house' || b.type === 'residential') && b.progress < 1);
    const wellsWithoutTank = mine.some(
      (w) => w.type === 'oil_well' && !mine.some((t) => t.type === 'oil_tank' && dist(t.pos, w.pos) / sim.map.cellSize <= OIL_TANK_RANGE),
    );
    // ameaça aérea (Fase 7): base aérea ou silo inimigo conhecido pede defesa antiaérea perto do QG
    const airThreat = sim.buildings.some((b) => b.owner !== this.slot && (b.type === 'airbase' || b.type === 'missile_silo') && sim.hostile(this.slot, b.owner) && sim.air.isKnown(this.slot, b.id));
    // cidades: duas prefeituras na fronteira depois da economia básica (economiza pedra para elas)
    const cityWanted = !savingForEra && count('city_hall') < 2 && done('factory') && done('tower') && this.citySiteExists(sim, hq);
    const plan: [BuildingType, boolean][] = [
      ['house', pop.total >= pop.cap - 2 && pop.cap < POP_ABSOLUTE_CAP && !housingInProgress && count('house') + count('residential') < 14],
      ['oil_tank', wellsWithoutTank || (mine.some((b) => b.type === 'oil_well' && b.status === 'storage_full') && count('oil_tank') < 5)],
      ['city_hall', cityWanted],
      ['farm', res.food < 30 && done('farm') && count('farm') < 5],
      ['warehouse', ((nearlyFull('wood') && done('sawmill')) || (nearlyFull('stone') && done('quarry')) || (nearlyFull('iron') && done('mine'))) && count('warehouse') < 4],
      ['silo', nearlyFull('food') && done('farm') && count('silo') < 4],
      ['sawmill', active('sawmill') === 0],
      ['farm', count('farm') === 0],
      ['barracks', count('barracks') === 0],
      ['quarry', active('quarry') === 0],
      ['quarry', active('quarry') < 2 && done('barracks') && sim.eras],
      ['sawmill', active('sawmill') < 2 && done('barracks')],
      ['mine', active('mine') === 0],
      ['oil_well', count('oil_well') === 0],
      ['farm', count('farm') < 2 && done('barracks')],
      ['factory', count('factory') === 0 && done('barracks')],
      ['oil_well', count('oil_well') < 2 && done('factory')],
      ['sawmill', active('sawmill') < 3 && done('factory')],
      ['research_center', count('research_center') === 0 && done('factory') && sim.tick >= AI_RESEARCH_TICK],
      ['mine', active('mine') < 2 && done('research_center')],
      ['farm', count('farm') < 3 && done('factory')],
      ['tower', count('tower') < 1 && done('factory')],
      ['aa_battery', airThreat && count('aa_battery') < 3 && done('factory')],
      ['residential', pop.cap >= 60 && pop.total >= pop.cap - 4 && !housingInProgress && count('residential') < 4],
      ['factory', count('factory') < 2 && budget.supplies > 350 && budget.oil > 150],
      ['barracks', count('barracks') < 2 && budget.food > 250],
      ['oil_well', count('oil_well') < 3 && army.length >= 10],
      // força aérea (Normal ou mais): base aérea depois da economia militar; silo quando houver a pesquisa
      ['airbase', level.airPower && count('airbase') === 0 && done('factory') && done('research_center') && sim.tick >= AI_AIR_TICK],
      ['missile_silo', level.missiles && count('missile_silo') === 0 && done('airbase') && natTechs.includes(MISSILE.tech)],
      // Grandes Projetos na última era, com folga de material
      ['nuclear_plant', sim.eraOf(this.slot) >= 4 && count('nuclear_plant') === 0 && budget.supplies > 900 && budget.iron > 700],
      ['financial_center', sim.eraOf(this.slot) >= 4 && done('nuclear_plant') && count('financial_center') === 0 && budget.supplies > 1000],
    ];
    let built: BuildingType | null = null;
    for (const [type, wanted] of plan)
      if (wanted && tryBuild(type)) {
        built = type;
        break;
      }

    // --- melhorias (Fase 4): uma obra por vez, só com folga de recursos e de manutenção
    // (guardando material enquanto junta para a próxima prefeitura)
    if ((!cityWanted || built === 'city_hall') && !savingForEra) this.planUpgrade(sim, mine, budget, take, cmds);

    // --- população: forma cidadãos para preencher postos e manter reserva para recrutamento
    const vacancies = mine.reduce((a, b) => a + (b.progress >= 1 ? Math.max(0, Math.min(b.workerTarget, sim.fx(b).workers) - b.workers) : 0), 0);
    if (hq.queue.length < 2 && pop.total < pop.cap && pop.idle + pop.queuedCitizens < vacancies + 1 && take(CITIZEN.cost)) {
      cmds.push({ type: 'produce', buildingId: hq.id, unitType: 'citizen' });
    }

    // --- produção militar: cada unidade precisa de um recruta da reserva como tripulação.
    // No preparo (e sem guerra), só uma guarnição: os recursos vão para a economia.
    const atWar = sim.players.some((p) => p.slot !== this.slot && !p.defeated && sim.formalWar(this.slot, p.slot));
    const preparing = sim.tick < prep && !atWar;
    const garrisonRoom = Math.max(0, AI_PREP_GARRISON - army.length - pop.queuedMilitary);
    // recrutas: alistados no quartel para tripular as próximas unidades (no preparo, só a guarnição)
    const wantRecruits = preparing ? garrisonRoom : 4;
    const barracks = mine.find((b) => b.type === 'barracks' && b.progress >= 1 && b.queue.length < 2);
    if (barracks && pop.total < pop.cap && pop.recruits + pop.queuedRecruits < wantRecruits && take(RECRUIT.cost)) {
      cmds.push({ type: 'produce', buildingId: barracks.id, unitType: 'recruit' });
    }
    let crew = preparing ? Math.min(pop.recruits, garrisonRoom) : pop.recruits;
    // pesquisa militar: o centro pesquisa na ordem; a produção usa o que já foi liberado
    this.planResearch(sim, mine, airThreat, take, cmds);
    if (level.airPower) this.planAir(sim, mine, level.missiles, natTechs, take, cmds);
    const unlocked = me.militaryResearch ?? [];
    const has = (u: UnitType) => !UNITS[u].requires || unlocked.includes(UNITS[u].requires!);
    const enemyArmor = sim.units.filter((u) => sim.hostile(this.slot, u.owner) && UNITS[u.type].armor === 'vehicle' && sim.canSee(this.slot, u)).length;
    // engenheiros: alguns por nação (minas na defesa e remoção das minas inimigas)
    const wantEngineer = has('engineer') && army.filter((u) => u.type === 'engineer').length + mine.reduce((a, b) => a + b.queue.filter((q) => q.unitType === 'engineer').length, 0) < level.engineers;
    const barracksMix: UnitType[] = [
      wantEngineer ? 'engineer' : 'infantry',
      has('at_infantry') ? 'at_infantry' : 'infantry',
      enemyArmor > 3 && has('at_infantry') ? 'at_infantry' : 'infantry',
      has('special_forces') ? 'special_forces' : 'infantry',
    ];
    const factoryMix: UnitType[] = [
      has('mbt') ? 'mbt' : has('tank') ? 'tank' : 'apc',
      'apc',
      has('tank') ? 'tank' : 'apc',
      has('rocket_artillery') ? 'rocket_artillery' : has('artillery') ? 'artillery' : 'apc',
      airThreat && has('mobile_aa') ? 'mobile_aa' : has('mbt') ? 'mbt' : has('tank') ? 'tank' : 'apc',
    ];
    const techs = sim.national ? sim.national.techs(this.slot) : null;
    for (const b of mine) {
      if (b.progress < 1 || b.queue.length > 0 || crew <= 0 || b.workers === 0) continue;
      const mix = b.type === 'barracks' ? barracksMix : b.type === 'factory' ? factoryMix : null;
      if (!mix) continue;
      // a mesma regra do servidor (custo real, com o equipamento do padrão vigente); se a escolha
      // não couber, tenta a próxima da lista em vez de insistir num pedido que seria recusado
      const start = (this.produced + b.id) % mix.length;
      for (let k = 0; k < mix.length; k++) {
        const unitType = mix[(start + k) % mix.length]!;
        const check = checkProduce(unitType, {
          buildingType: b.type,
          level: b.level,
          spec: b.spec,
          progress: b.progress,
          queueLength: b.queue.length,
          resources: budget,
          recruits: crew,
          popTotal: pop.total,
          popCap: Infinity,
          techs,
          militaryResearch: unlocked,
          recruitCostMul: me.modifiers.recruitCostMul ?? 1,
          bonus: sim.bonusOf(this.slot),
          era: sim.eraOf(this.slot),
        });
        if (check.blocker || !take(check.cost)) continue;
        cmds.push({ type: 'produce', buildingId: b.id, unitType });
        this.produced++;
        crew--;
        break;
      }
    }

    // --- defesa: inimigos visíveis perto da base. Responde com cerca de 1,5× a força inimiga
    // vista (as tropas mais próximas primeiro), em vez de puxar o exército inteiro para uma isca.
    const committed = new Set<number>();
    const threat = this.nearestThreat(sim, mine);
    if (threat) {
      const enemies = sim.units.filter((e) => sim.hostile(this.slot, e.owner) && dist(e.pos, threat.pos) < 14 && sim.canSee(this.slot, e));
      const need = AI_DEFENSE_RATIO * enemies.reduce((a, e) => a + unitStrength(e), 0);
      const pool = army.filter((u) => u.order.kind !== 'attack' && !u.refit && dist(u.pos, threat.pos) < 45).sort((a, b) => dist(a.pos, threat.pos) - dist(b.pos, threat.pos) || a.id - b.id);
      let sent = 0;
      const defenders: Unit[] = [];
      for (const u of pool) {
        if (sent >= need) break;
        defenders.push(u);
        sent += unitStrength(u);
      }
      if (defenders.length > 0) {
        cmds.push({ type: 'attack_move', unitIds: defenders.map((u) => u.id), x: threat.pos.x, y: threat.pos.y });
        for (const u of defenders) committed.add(u.id);
      }
    }

    // --- contra-bateria: edifício atingido por quem não se vê (artilharia de longe). Um grupo
    // rápido vai na direção de onde veio o tiro.
    const hit = me.unseenFire;
    if (hit && sim.tick - hit.tick <= AI_COUNTER_FRESH_TICKS && sim.tick - this.lastCounterTick >= AI_COUNTER_COOLDOWN_TICKS) {
      const from = { x: hit.x, y: hit.y };
      const raiders = army
        .filter((u) => !committed.has(u.id) && u.order.kind !== 'attack' && !u.refit && UNITS[u.type].weapon.minRange === undefined && UNITS[u.type].weapon.range < 12)
        .sort((a, b) => UNITS[b.type].speed - UNITS[a.type].speed || dist(a.pos, from) - dist(b.pos, from) || a.id - b.id)
        .slice(0, AI_COUNTER_GROUP);
      if (raiders.length > 0) {
        cmds.push({ type: 'attack_move', unitIds: raiders.map((u) => u.id), x: from.x, y: from.y });
        for (const u of raiders) committed.add(u.id);
        this.lastCounterTick = sim.tick;
      }
    }
    // --- engenharia (lote 3): remove as minas inimigas conhecidas e mina a frente da base
    this.planEngineers(sim, hq, army, committed, level.mines, take, cmds);

    // --- comércio (Fase 6): responde a ofertas de outros jogadores pela mesma regra de aceitação
    for (const o of sim.trade.offers) {
      if (o.status !== 'pending' || o.to !== this.slot || o.from >= 100) continue;
      const fair = Math.abs(o.price / BASE_PRICE[o.resource] - 1) <= 0.15;
      cmds.push({ type: 'trade_respond', offerId: o.id, accept: fair && sim.trade.acceptBlocker(o) === null });
    }

    // --- modernização (Fase 5): tropas paradas perto da instalação recebem os pacotes liberados
    if (!this.attacking) this.planModernize(sim, army, take, cmds);

    // --- incidente de fronteira no preparo (Normal ou mais): 2 a 3 tropas atacam a borda vizinha
    if (preparing && level.harassment) this.planHarass(sim, hq, army, committed, cmds);

    // --- ataque em ondas (unidades em modernização não contam: estão indisponíveis)
    const idle = army.filter((u) => u.order.kind === 'idle' && u.engageId === null && !u.refit && !committed.has(u.id));
    const ready = sim.tick >= prep && sim.tick - this.lastWaveTick >= level.waveCooldownMinutes * 60 * TICK_RATE;
    // exército parado de crescer (recursos esgotados ao alcance): ataca com o que tem
    if (army.length > this.armyPeak) {
      this.armyPeak = army.length;
      this.peakTick = sim.tick;
    }
    const stalled = sim.tick - this.peakTick >= AI_STALL_TICKS && idle.length >= AI_MIN_WAVE;
    if (!this.attacking && (idle.length >= this.waveSize || stalled) && ready) {
      const objective = this.enemyObjective(sim);
      // sem guerra formal não há ofensiva: pede a declaração e espera
      if (objective && !sim.formalWar(this.slot, objective.slot)) this.wantsWarWith = objective.slot;
      const target = objective && sim.formalWar(this.slot, objective.slot) ? objective.pos : null;
      if (target) {
        cmds.push({ type: 'attack_move', unitIds: idle.map((u) => u.id), x: target.x, y: target.y });
        this.attacking = true;
        this.lastWaveTick = sim.tick;
        this.waveSize = Math.min(this.waveSize + level.waveStep, level.maxWave);
        this.armyPeak = 0;
        this.peakTick = sim.tick;
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

  /**
   * Força aérea e mísseis (dificuldade Normal ou mais), pelos mesmos comandos e regras do jogador:
   * aeronaves na base aérea (reconhecimento, caças e, com a base no nível 2, bombardeiros),
   * reconhecimento sobre a base inimiga, ataques a edifícios já descobertos e, com a pesquisa,
   * mísseis contra o alvo descoberto mais valioso. Só ataca em guerra declarada.
   */
  private planAir(sim: Simulation, mine: Building[], missiles: boolean, natTechs: readonly string[], take: (c: Cost) => boolean, cmds: Command[]): void {
    const air = sim.air;
    const enemy = this.enemyObjective(sim);
    const atWar = enemy !== null && sim.formalWar(this.slot, enemy.slot);
    for (const base of mine) {
      if (base.type !== 'airbase' || base.progress < 1 || base.hp <= 0) continue;
      const planes = air.aircraftAt(base.id);
      const has = (t: AircraftType) => planes.filter((a) => a.type === t).length;
      const want: AircraftType | null = has('recon') === 0 ? 'recon' : has('fighter') < 2 ? 'fighter' : base.level >= 2 && has('bomber') < 1 ? 'bomber' : null;
      if (want && !planes.some((a) => a.state === 'building') && air.buildBlocker(this.slot, base.id, want) === null && take(AIRCRAFT[want].cost)) {
        cmds.push({ type: 'build_aircraft', buildingId: base.id, aircraftType: want });
      }
      if (!atWar || !enemy) continue;
      const ready = (types: AircraftType[]) => planes.filter((a) => a.state === 'ready' && types.includes(a.type)).map((a) => a.id);
      const known = sim.buildings.filter((b) => b.owner === enemy.slot && b.hp > 0 && air.isKnown(this.slot, b.id));
      // reconhecimento: sobre a base inimiga enquanto não houver alvos conhecidos (ou a cada minuto)
      const recon = ready(['recon']);
      if (recon.length && sim.tick - this.lastReconTick >= AI_RECON_EVERY_TICKS) {
        const at = known.length < 4 ? enemy.pos : (known[(sim.tick / AI_RECON_EVERY_TICKS) % known.length | 0]?.pos ?? enemy.pos);
        if (air.missionBlocker(this.slot, base.id, recon, 'recon', { x: at.x, y: at.y }) === null) {
          cmds.push({ type: 'air_mission', buildingId: base.id, aircraftIds: recon, mission: 'recon', x: at.x, y: at.y });
          this.lastReconTick = sim.tick;
        }
      }
      // ataque: caças e bombardeiros prontos contra o alvo conhecido mais valioso
      const strikers = ready(['fighter', 'bomber']);
      if (strikers.length && sim.tick - this.lastStrikeTick >= AI_STRIKE_EVERY_TICKS) {
        const target = this.airTarget(known);
        if (target && air.missionBlocker(this.slot, base.id, strikers, 'strike', { buildingId: target.id }) === null) {
          cmds.push({ type: 'air_mission', buildingId: base.id, aircraftIds: strikers, mission: 'strike', targetId: target.id });
          this.lastStrikeTick = sim.tick;
        }
      }
    }
    if (!missiles || !natTechs.includes(MISSILE.tech)) return;
    for (const silo of mine) {
      if (silo.type !== 'missile_silo' || silo.progress < 1 || silo.hp <= 0) continue;
      if (air.missileBuildBlocker(this.slot, silo.id) === null && take(MISSILE.cost)) cmds.push({ type: 'build_missile', buildingId: silo.id });
      if (!atWar || !enemy) continue;
      const known = sim.buildings.filter((b) => b.owner === enemy.slot && b.hp > 0 && air.isKnown(this.slot, b.id));
      const target = this.airTarget(known);
      if (target && air.prepareBlocker(this.slot, silo.id, target.pos.x, target.pos.y) === null) cmds.push({ type: 'missile_prepare', buildingId: silo.id, x: target.pos.x, y: target.pos.y });
    }
    // lançamentos armados: autoriza (a mesma confirmação do jogador)
    for (const l of air.launches) if (l.owner === this.slot && l.state === 'armed') cmds.push({ type: 'missile_authorize', launchId: l.id });
  }

  private airTarget(known: Building[]): Building | null {
    let best: Building | null = null;
    let bestScore = Infinity;
    for (const b of known) {
      const rank = AIR_TARGETS.indexOf(b.type);
      const score = (rank < 0 ? AIR_TARGETS.length : rank) * 10000 + b.id;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  /**
   * Incidente de fronteira: escolhe o vizinho mais próximo (sem guerra declarada), o ponto do
   * território dele mais perto da base da IA (a borda, onde ficam fazendas e serrarias) e manda 2 a
   * 3 tropas da guarnição. O servidor abre o incidente antes de aplicar a ordem.
   */
  private planHarass(sim: Simulation, hq: Building, army: Unit[], committed: Set<number>, cmds: Command[]): void {
    if (sim.tick < AI_HARASS_FIRST_TICK || sim.tick - this.lastHarassTick < AI_HARASS_EVERY_TICKS) return;
    const objective = this.enemyObjective(sim);
    if (!objective || sim.formalWar(this.slot, objective.slot) || sim.allied(this.slot, objective.slot)) return;
    const raiders = army.filter((u) => !committed.has(u.id) && u.order.kind === 'idle' && !u.refit && UNITS[u.type].weapon.minRange === undefined).slice(0, 3);
    if (raiders.length < 2) return;
    const edge = this.territoryEdge(sim, hq.pos, objective.slot);
    if (!edge) return;
    this.lastHarassTick = sim.tick;
    this.wantsIncident = { victim: objective.slot, pos: edge };
    cmds.push({ type: 'attack_move', unitIds: raiders.map((u) => u.id), x: edge.x, y: edge.y });
    for (const u of raiders) committed.add(u.id);
  }

  /** Célula do território de `owner` mais perto de `from` (centro, em coordenadas de mundo). */
  private territoryEdge(sim: Simulation, from: Vec2, owner: Slot): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let cy = 0; cy < sim.map.height; cy++)
      for (let cx = 0; cx < sim.map.width; cx++) {
        if (sim.territoryOwner(cx, cy) !== owner) continue;
        const c = sim.grid.cellCenter({ cx, cy });
        const d = dist(c, from);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    if (!best) return null;
    // um pouco para dentro: as construções da borda ficam ao alcance
    const len = dist(best, from) || 1;
    return sim.clampToMap({ x: best.x + ((best.x - from.x) / len) * 6, y: best.y + ((best.y - from.y) / len) * 6 });
  }

  /**
   * Moderniza até duas unidades por avaliação, com a mesma regra (`checkModernize`) e o mesmo
   * comando do jogador. Fora do preparo, mantém metade do exército disponível.
   */
  private planModernize(sim: Simulation, army: Unit[], take: (c: Cost) => boolean, cmds: Command[]): void {
    const busy = army.filter((u) => u.refit).length;
    let room = Math.min(2, Math.floor(army.length / 2) - busy);
    for (const u of army) {
      if (room <= 0) return;
      if (u.refit || u.order.kind !== 'idle' || u.engageId !== null) continue;
      const ctx = sim.modernizeContext(u);
      const mod = MOD_IDS.find((m) => checkModernize(m, ctx).blocker === null);
      if (!mod || !take(MODS[mod].retrofit.cost)) continue;
      cmds.push({ type: 'modernize', unitIds: [u.id], mod });
      room--;
    }
  }

  /**
   * Escolhe no máximo uma melhoria: QG primeiro (destrava os demais), depois coleta, depósitos
   * que limitam a coleta e, fora do preparo, a produção militar. Usa exatamente a mesma avaliação
   * (`upgradePlan`) e o mesmo comando que o jogador humano.
   */
  /** Uma pesquisa militar por vez, na ordem; a antiaérea móvel sobe quando há ameaça aérea. */
  /**
   * Engenheiros de Combate da IA, pelas mesmas regras do jogador: o mais próximo vai até cada mina
   * inimiga que a IA já viu (parado ao lado, ele a remove) e, fora disso, um engenheiro ocioso
   * instala minas antitanque num arco à frente do QG, voltado para o inimigo.
   */
  private planEngineers(sim: Simulation, hq: Building, army: Unit[], committed: Set<number>, maxMines: number, take: (c: Cost) => boolean, cmds: Command[]): void {
    const engineers = army.filter((u) => u.type === 'engineer' && u.hp > 0 && !u.refit);
    if (!engineers.length) return;
    // quem está instalando uma mina fica de fora das ondas e da reunião
    for (const t of sim.mines.tasks) if (t.owner === this.slot) committed.add(t.unitId);
    const known = sim.mines.mines.filter((m) => m.owner !== this.slot && m.seenBy.includes(this.slot)).sort((a, b) => a.id - b.id);
    for (const m of known) {
      const e = engineers.filter((u) => !committed.has(u.id) && dist(u.pos, m.pos) < 40).sort((a, b) => dist(a.pos, m.pos) - dist(b.pos, m.pos) || a.id - b.id)[0];
      if (!e) continue;
      committed.add(e.id);
      const heading = e.order.kind === 'move' && dist(e.order.target, m.pos) < 1;
      if (dist(e.pos, m.pos) > MINE.clearRange * 0.7 && !heading) cmds.push({ type: 'move', unitIds: [e.id], x: m.pos.x, y: m.pos.y });
    }
    if (sim.mines.count(this.slot) >= maxMines) return;
    const layer = engineers.find((u) => !committed.has(u.id) && u.order.kind === 'idle');
    const objective = this.enemyObjective(sim);
    if (!layer || !objective) return;
    const toward = Math.atan2(objective.pos.y - hq.pos.y, objective.pos.x - hq.pos.x);
    for (let k = 0; k < maxMines * 2; k++) {
      // arco de ±0,9 rad em dois raios, começando pelo centro
      const side = k % 2 === 0 ? 1 : -1;
      const step = Math.ceil((k % maxMines) / 2);
      const radius = k < maxMines ? AI_MINE_RADIUS : AI_MINE_RADIUS + 3;
      const a = toward + side * step * AI_MINE_ARC_STEP;
      const p = sim.clampToMap({ x: hq.pos.x + Math.cos(a) * radius, y: hq.pos.y + Math.sin(a) * radius });
      if (sim.mines.mines.some((m) => dist(m.pos, p) < 1.5) || sim.mines.tasks.some((t) => dist(t.pos, p) < 1.5)) continue;
      if (sim.mines.layBlocker(this.slot, [layer.id], p.x, p.y)) continue;
      if (!take(MINE.cost)) return;
      cmds.push({ type: 'lay_mine', unitIds: [layer.id], x: p.x, y: p.y });
      committed.add(layer.id);
      return;
    }
  }

  private planResearch(sim: Simulation, mine: Building[], airThreat: boolean, take: (c: Cost) => boolean, cmds: Command[]): void {
    const center = mine.find((b) => b.type === 'research_center' && b.progress >= 1 && b.hp > 0 && !b.research && b.workers > 0);
    if (!center) return;
    const done = sim.players[this.slot]!.militaryResearch ?? [];
    const order: MilitaryResearchId[] = airThreat
      ? ['tracked_armor', 'mobile_air_defense', 'field_artillery', 'antitank_weapons', 'rocket_systems', 'special_operations', 'modern_armor']
      : ['tracked_armor', 'field_artillery', 'antitank_weapons', 'rocket_systems', 'mobile_air_defense', 'modern_armor', 'special_operations'];
    // engenharia de combate depois das armas antitanque (só quando a dificuldade usa minas)
    if (DIFFICULTY[sim.difficulty].engineers > 0) order.splice(order.indexOf('antitank_weapons') + 1, 0, 'combat_engineering');
    for (const id of order) {
      if (done.includes(id) || mine.some((b) => b.research?.id === id)) continue;
      if (militaryResearchBlocker(id, done, center.level, sim.eraOf(this.slot))) continue;
      if (!take(MILITARY_RESEARCH[id].cost)) return;
      cmds.push({ type: 'military_research', buildingId: center.id, researchId: id });
      return;
    }
  }

  private planUpgrade(sim: Simulation, mine: Building[], budget: Stockpile, take: (c: Cost) => boolean, cmds: Command[]): void {
    if (sim.tick < AI_FIRST_UPGRADE_TICK || mine.some((b) => b.upgrade)) return;
    const hq = mine.find((b) => b.type === 'hq');
    if (!hq) return;
    const income = sim.incomePerSecond(this.slot);
    const minutes = sim.tick / TICK_RATE / 60;
    const preparing = sim.tick < sim.prepTicks;
    const res = sim.players[this.slot]!.resources;
    const cap = sim.capacity(this.slot);
    const pop = sim.population(this.slot);
    const full = (r: ResourceType) => cap[r] > 0 && res[r] >= cap[r] * 0.7;
    // depósitos que limitam a próxima melhoria de alguma coleta (requisito de logística)
    const neededStorage = new Set<BuildingType>();
    for (const b of mine) {
      const g = BUILDINGS[b.type].gather;
      if (!g || b.progress < 1) continue;
      const blocked = sim.upgradePlan(b, AI_SPEC[b.type] ?? null).requirements.find((r) => r.key === 'storage' && !r.met);
      if (blocked) neededStorage.add(g.resource === 'food' ? 'silo' : g.resource === 'oil' ? 'oil_tank' : 'warehouse');
    }
    const storageWanted = (t: BuildingType) =>
      neededStorage.has(t) || (t === 'silo' ? full('food') : t === 'oil_tank' ? full('oil') : full('wood') || full('stone') || full('iron'));
    const order = (b: Building): number => {
      if (b.type === 'hq') return b.level < 2 + Math.floor(minutes / 5) ? 0 : 9;
      if (BUILDINGS[b.type].gather) return b.status === 'ok' ? 1 : 9;
      if (b.type === 'warehouse' || b.type === 'silo' || b.type === 'oil_tank') return storageWanted(b.type) ? 2 : 9;
      if (b.type === 'barracks' || b.type === 'factory') return preparing ? 9 : 3;
      // centro de pesquisa: sobe de nível quando a próxima pesquisa exige
      if (b.type === 'research_center') return b.level < 3 ? 3 : 9;
      if (b.type === 'residential' || b.type === 'house') return pop.total >= pop.cap - 3 ? 4 : 9;
      return 6;
    };
    const candidates = mine.filter((b) => b.progress >= 1 && b.hp > 0 && order(b) < 9).sort((a, b) => order(a) - order(b) || a.level - b.level || a.id - b.id);
    for (const b of candidates) {
      const plan = sim.upgradePlan(b, AI_SPEC[b.type] ?? null);
      if (plan.toLevel === null) continue;
      // o QG destrava todo o resto: se só faltam recursos ou verba, junta para ele em vez de gastar em outra obra
      const saving = order(b) === 0 && plan.blocker !== null && (plan.blocker.startsWith('Recursos') || plan.blocker.startsWith('Verba'));
      if (saving) return;
      if (plan.blocker) continue;
      // mantém reserva para cidadãos, recrutas e emergências
      const reserve: Cost = { supplies: 120, food: 80 };
      const left = { ...budget };
      for (const r of RESOURCE_TYPES) left[r] -= (plan.cost[r] ?? 0) + (reserve[r] ?? 0);
      if (RESOURCE_TYPES.some((r) => left[r] < 0)) continue;
      // a manutenção extra não pode deixar o saldo de suprimentos/petróleo negativo
      if (income.supplies - (plan.upkeepDelta.supplies ?? 0) < 0.4 || income.oil - (plan.upkeepDelta.oil ?? 0) < 0) continue;
      if (!take(plan.cost)) continue;
      const spec = plan.specChoice ? AI_SPEC[b.type] : undefined;
      cmds.push(spec ? { type: 'upgrade', buildingId: b.id, spec } : { type: 'upgrade', buildingId: b.id });
      return;
    }
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
  private citySite: { tick: number; ok: boolean } | null = null;

  /** Há lugar para uma prefeitura (mesmo sem material ainda)? Reavaliado a cada 30 s. */
  private citySiteExists(sim: Simulation, hq: Building): boolean {
    if (this.citySite && sim.tick - this.citySite.tick < 30 * TICK_RATE) return this.citySite.ok;
    const ok = this.findBuildSpot(sim, hq, 'city_hall', true) !== null;
    this.citySite = { tick: sim.tick, ok };
    return ok;
  }

  private findBuildSpot(sim: Simulation, hq: Building, type: BuildingType, ignoreCost = false): Cell | null {
    const mid = { x: (sim.map.width * sim.map.cellSize) / 2, y: (sim.map.height * sim.map.cellSize) / 2 };
    const gather = BUILDINGS[type].gather;
    const claimed = gather ? claimedBy(sim.buildings, type) : null;
    // prefeituras ficam longe do QG (espaçamento mínimo entre cidades)
    const reach = gather ? 13 : type === 'city_hall' ? 17 : 9;
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
      const err = sim.placementError(this.slot, type, cell);
      if (err !== null && !(ignoreCost && err === 'Recursos insuficientes')) continue;
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

