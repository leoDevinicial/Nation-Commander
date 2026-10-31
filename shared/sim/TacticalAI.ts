import { BUILDINGS, buildingCost, emptyStockpile, Terrain, ROAD, CITIZEN, GOODS_TYPES, MINE, OIL_TANK_RANGE, emptyGoods, RECRUIT, type ResourceType, POP_ABSOLUTE_CAP, RESOURCE_TYPES, TICK_RATE, UNITS, MILITARY_RESEARCH, militaryResearchBlocker, canAfford, type MilitaryResearchId, type BuildingType, type Cost, type Stockpile, type UnitType } from './config.ts';
import { claimableCells, claimedBy } from './gathering.ts';
import { checkProduce } from './production.ts';
import type { Command } from './commands.ts';
import type { Simulation } from './Simulation.ts';
import type { Building, Cell, Entity, Slot, Unit, Vec2 } from './types.ts';
import type { SpecId } from './upgrades.ts';
import { MOD_IDS, MODS, checkModernize } from './modernization.ts';
import { BASE_PRICE } from './trade.ts';
import { DIPLO } from '../strategic/Diplomacy.ts';
import { DIFFICULTY, firstAttackTicks } from './difficulty.ts';
import { ERAS, buildingEra, type Era } from './eras.ts';
import { AIRCRAFT, MISSILE, type AircraftType } from './air.ts';
import { roadLink } from './caravans.ts';
import { MARKET, MARKET_RESOURCES, marketPrice, type MarketResource } from './market.ts';
import { POWER, POWER_GEN, POWER_USE } from './power.ts';

/** Com que frequência a IA reavalia a situação. */
export const AI_THINK_TICKS = TICK_RATE;
/**
 * Primeira ofensiva da IA (dificuldade Normal): depois do preparo, ela forma tropas e ataca nesta hora com o que
 * tiver (cada dificuldade tem a sua, `DifficultyDef.firstAttackMinutes`).
 */
export const AI_FIRST_ATTACK_TICK = firstAttackTicks('normal');
/** Intervalo mínimo entre ondas de ataque (tempo de jogo, dificuldade Normal). */
export const AI_WAVE_COOLDOWN_TICKS = TICK_RATE * 60 * DIFFICULTY.normal.waveCooldownMinutes;
/**
 * Incidentes de fronteira no preparo: a partir de 3 min, a cada 3 min, 2 a 3 tropas da guarnição
 * atacam a borda do território vizinho por 75 s, sem guerra declarada.
 */
export const AI_HARASS_FIRST_TICK = TICK_RATE * 60 * 3;
export const AI_HARASS_EVERY_TICKS = TICK_RATE * 60 * 3;
export const AI_HARASS_SECONDS = 75;
/** Tamanho máximo do exército durante o preparo (defesa da base), salvo se já estiver em guerra (Normal). */
export const AI_PREP_GARRISON = DIFFICULTY.normal.prepGarrison;
/** A IA só começa a melhorar construções depois deste momento (economia básica primeiro). */
export const AI_FIRST_UPGRADE_TICK = TICK_RATE * 120;
/** Sem crescimento do exército por este tempo, a IA ataca com o que tem (mínimo AI_MIN_WAVE). */
export const AI_STALL_TICKS = TICK_RATE * 300;
export const AI_MIN_WAVE = 8;
/** Prefeituras que a IA ergue quando sobra madeira ou pedra (sem sobra, duas). */
const AI_MAX_CITIES = 6;
/**
 * Mercado interno: a IA guarda pelo menos AI_MARKET_KEEP (ou esta fração do armazém) de cada recurso e vende o resto
 * em lotes (de 100 a 500), um a cada AI_MARKET_EVERY_TICKS, enquanto o preço estiver acima desta fração do cheio.
 */
const AI_MARKET_KEEP = 500;
const AI_MARKET_KEEP_FRACTION = 0.5;
const AI_MARKET_LOT = 100;
const AI_MARKET_MIN_PRICE = 0.5;
export const AI_MARKET_EVERY_TICKS = TICK_RATE * 5;
/** Ferro do equipamento da infantaria (o mínimo para formar um soldado). */
const AI_INFANTRY_IRON = 5;
/** Tropas que ficam na base quando a onda sai (se a onda passa do mínimo). */
export const AI_HOME_GUARD = 3;
/** Com menos tropas que isto (sem contar o explorador), a IA forma soldados antes das reservas e dos cidadãos. */
export const AI_MIN_DEFENSE = 2;
/** A guarnição mínima vale a partir deste momento (ou já com guerra). */
export const AI_DEFENSE_FROM_TICK = TICK_RATE * 60 * 4;
/** Pontos da ronda do explorador em volta da base (mais o centro do mapa). */
export const AI_SCOUT_POINTS = 6;
/** A IA começa a pesquisa militar depois dos primeiros minutos de economia. */
export const AI_RESEARCH_TICK = TICK_RATE * 240;
/** Gargalo: a IA ergue outra coleta quando a próxima compra demoraria mais que isto (s) com a renda atual. */
export const AI_BOTTLENECK_SECONDS = 30;
/** Gargalo grave: a coleta vem antes até da base militar. */
export const AI_BOTTLENECK_URGENT_SECONDS = 60;
/** Renda de comida (por segundo) abaixo da qual a IA tira um trabalhador de outra coleta para a fazenda. */
export const AI_FOOD_FLOOR = 0.8;
/** Com postos vagos (falta gente), a IA leva trabalhadores para a fazenda enquanto a comida render menos que isto (por segundo). */
export const AI_FOOD_GROWTH = 2;
/** Abaixo do exército mínimo da dificuldade, a IA leva trabalhadores para a fazenda enquanto a comida render menos que isto. */
export const AI_FOOD_MILITARY = 5;
/** Com falta de gente e as fazendas cheias, a IA ergue outra fazenda enquanto a comida render menos que isto. */
export const AI_FOOD_NEW_FARM = 3;
/** Comida que a IA mantém em estoque ao formar cidadãos. */
export const AI_FOOD_RESERVE = 20;
/** Postos vagos nas coletas a partir dos quais falta gente (a próxima coleta espera os cidadãos). */
export const AI_LABOR_SHORT = 4;
/** Coletor de cada recurso e o máximo de coletores ativos de cada tipo. */
const GATHERER_OF: [ResourceType, BuildingType][] = [
  ['food', 'farm'],
  ['wood', 'sawmill'],
  ['stone', 'quarry'],
  ['iron', 'mine'],
  ['oil', 'oil_well'],
];
const GATHERER_MAX: Record<string, number> = { farm: 6, sawmill: 6, quarry: 4, mine: 4, oil_well: 4 };
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
// usinas logo depois da força aérea: sem energia, quartéis, fábricas e pesquisa do inimigo param
const AIR_TARGETS: BuildingType[] = ['airbase', 'missile_silo', 'coal_plant', 'nuclear_plant', 'hydro_dam', 'refinery', 'steel_mill', 'factory', 'research_center', 'barracks', 'oil_well', 'oil_tank', 'mine', 'hq'];

/** Força defensiva enviada contra a força inimiga vista perto da base. */
export const AI_DEFENSE_RATIO = 1.5;
/** Contra-bateria: tiro recente (até 10 s), no máximo um grupo a cada 20 s, de até 5 unidades. */
export const AI_COUNTER_FRESH_TICKS = TICK_RATE * 10;
export const AI_COUNTER_COOLDOWN_TICKS = TICK_RATE * 20;
export const AI_COUNTER_GROUP = 5;
/** Estradas até as prefeituras (caravanas só andam por estrada): intervalo mínimo entre obras. */
export const AI_ROAD_COOLDOWN_TICKS = TICK_RATE * 20;
/** Pedra que a IA mantém depois de pagar uma estrada (para obras e defesas). */
export const AI_ROAD_STONE_RESERVE = 80;
/** Estrada até uma coleta ou usina (+15% de produção): só trechos curtos e com mais pedra de folga. */
export const AI_ROAD_PRODUCTION_MAX_CELLS = 10;
export const AI_ROAD_PRODUCTION_RESERVE = 200;

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
  lastRoadTick?: number | null;
  lastMarketTick?: number | null;
  scoutLeg?: number;
}

export class TacticalAI {
  /** Tamanho da próxima onda (null até a primeira avaliação, que lê a dificuldade). */
  private waveSize: number | null = null;
  /** Próximo ponto da ronda do explorador. */
  private scoutLeg = 0;
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
  /** Última obra de estrada (para espaçar as obras). */
  private lastRoadTick = -Infinity;
  /** Última venda no mercado interno. */
  private lastMarketTick = -Infinity;
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
      lastRoadTick: Number.isFinite(this.lastRoadTick) ? this.lastRoadTick : null,
      lastMarketTick: Number.isFinite(this.lastMarketTick) ? this.lastMarketTick : null,
      scoutLeg: this.scoutLeg,
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
    this.lastRoadTick = s.lastRoadTick ?? -Infinity;
    this.lastMarketTick = s.lastMarketTick ?? -Infinity;
    this.scoutLeg = s.scoutLeg ?? 0;
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
    const income = sim.incomePerSecond(this.slot);
    // custo crescente: cada edifício do mesmo tipo encarece o próximo
    const costOf = (type: BuildingType) => buildingCost(type, count(type));
    // posição de cada tipo, calculada uma vez por avaliação (ignora o custo: serve para reservar)
    const spots = new Map<BuildingType, Cell | null>();
    // depósito a alcançar com uma torre (definido junto com o gargalo, mais abaixo)
    let expandTo: Cell | null = null;
    const spotFor = (type: BuildingType): Cell | null => {
      if (!spots.has(type))
        spots.set(
          type,
          BUILDINGS[type].gather?.terrain === null
            ? this.freeNode(sim, hq, mine)
            : type === 'oil_tank'
              ? this.tankSpot(sim, mine)
              : type === 'tower' && expandTo
                ? this.expansionSpot(sim, hq, expandTo)
                : this.findBuildSpot(sim, hq, type, true, mine),
        );
      return spots.get(type)!;
    };
    // --- população: forma cidadãos para preencher postos e manter reserva para recrutamento (antes das
    // obras: sem gente nos postos, nenhuma coleta rende)
    const vacancies = mine.reduce((a, b) => a + (b.progress >= 1 ? Math.max(0, Math.min(b.workerTarget, sim.fx(b).workers) - b.workers) : 0), 0);
    // (guarda uma pequena reserva de comida para recrutas e emergências)
    const citizenReserve: Cost = { ...CITIZEN.cost, food: (CITIZEN.cost.food ?? 0) + AI_FOOD_RESERVE };
    const atWar = sim.players.some((p) => p.slot !== this.slot && !p.defeated && sim.formalWar(this.slot, p.slot));
    // guarnição mínima (em guerra ou não): sem ela a base cai no primeiro ataque e não há incidentes de fronteira
    const undefended = done('barracks') && army.filter((u) => u.type !== 'scout').length < AI_MIN_DEFENSE && (atWar || sim.tick >= AI_DEFENSE_FROM_TICK);
    // exército mínimo da dificuldade (cresce com o tempo): abaixo dele, as tropas passam na frente da reserva das
    // próximas pesquisas (sem isso, o ferro e a comida reservados seguravam a infantaria por minutos)
    const armyFloor = Math.min(level.maxWave, level.armyPerMinute * (sim.tick / (60 * TICK_RATE) - 2));
    const troops = army.filter((u) => u.type !== 'scout').length + pop.queuedMilitary;
    const behind = done('barracks') && troops < armyFloor;
    // muito abaixo (menos da metade): as tropas passam na frente até da era e do QG
    const farBehind = done('barracks') && troops < armyFloor / 2;
    // sem a guarnição mínima (ou abaixo do exército mínimo), a comida vai primeiro para a infantaria (o cidadão só
    // sai com sobra para ela). Sem o ferro do equipamento, a infantaria não sai de qualquer jeito: segurar a comida
    // só travaria os cidadãos que vão trabalhar na mina (impasse de minutos no começo da partida). Com a comida
    // rendendo pouco, idem: os cidadãos que vão para a fazenda vêm primeiro
    if ((undefended || behind) && budget.iron >= AI_INFANTRY_IRON && income.food >= AI_FOOD_GROWTH) citizenReserve.food = (citizenReserve.food ?? 0) + (UNITS.infantry.cost.food ?? 0);
    if (hq.queue.length < 2 && pop.total < pop.cap && pop.idle + pop.queuedCitizens < vacancies + 1 && canAfford(budget, citizenReserve) && take(CITIZEN.cost)) {
      cmds.push({ type: 'produce', buildingId: hq.id, unitType: 'citizen' });
    }
    // --- gargalo (docs/RECALIBRAGEM_RECURSOS.md §2.4): quanto falta de cada recurso para os objetivos de
    // curto prazo (estoque, renda e o que a IA quer pagar a seguir), em segundos de coleta
    const wish = emptyStockpile();
    const want = (c: Cost, k = 1) => {
      for (const r of RESOURCE_TYPES) wish[r] += (c[r] ?? 0) * k;
    };
    want(CITIZEN.cost, 2);
    const nextCore = (['barracks', 'research_center', 'factory'] as BuildingType[]).find((t) => count(t) === 0 && buildingEra(t) <= sim.eraOf(this.slot));
    if (nextCore) want(costOf(nextCore));
    if (pop.total >= pop.cap - 3 && pop.cap < POP_ABSOLUTE_CAP) want(costOf('house'));
    if (sim.eras && (me.era ?? 1) < 4) {
      const next = ERAS[((me.era ?? 1) + 1) as Era];
      if (sim.hqLevel(this.slot) >= next.hqLevel) want(next.cost);
      else if (done('barracks')) want(sim.upgradePlan(hq).cost);
    }
    if (done('barracks')) want(UNITS.infantry.cost, 2);
    if (done('factory')) want(UNITS.tank.cost);
    if (done('research_center')) want(MILITARY_RESEARCH.tracked_armor.cost);
    const waitOf = (r: ResourceType): number => {
      const short = Math.max(0, wish[r] - res[r]);
      let wait = short <= 0 ? 0 : income[r] <= 0.05 ? 999 : short / income[r];
      // comida: renda perto de zero (ou negativa) pede fazenda mesmo sem compra em vista
      if (r === 'food' && income.food < 0.3) wait = Math.max(wait, 600);
      return wait;
    };
    const waits = new Map(GATHERER_OF.map(([r]) => [r, waitOf(r)]));

    // --- trabalho: os cidadãos vão para a coleta que mais atrasa os objetivos. Com a comida em baixa, a
    // fazenda tem prioridade (sem comida não se forma gente); com folga de comida, os postos cortados
    // voltam a contratar
    const gatherers = mine.filter((b) => BUILDINGS[b.type].gather && b.progress >= 1 && b.hp > 0 && b.status !== 'depleted');
    const openFarm = gatherers.find((b) => b.type === 'farm' && b.workers < sim.fx(b).workers);
    const resourceOf = (b: Building) => BUILDINGS[b.type].gather!.resource;
    // postos vagos em todas as coletas: falta gente, não edifício (a próxima coleta espera os cidadãos)
    const laborShort = gatherers.reduce((a, b) => a + Math.max(0, sim.fx(b).workers - b.workers), 0) >= AI_LABOR_SHORT;
    // com falta de gente, a comida precisa render o bastante para formar cidadãos (senão a população estaciona)
    // abaixo do exército mínimo, a comida (que forma os soldados) também puxa trabalhadores para a fazenda
    if ((income.food < AI_FOOD_FLOOR || ((laborShort || behind) && income.food < (behind ? AI_FOOD_MILITARY : AI_FOOD_GROWTH))) && openFarm) {
      const donor = gatherers.filter((b) => b.type !== 'farm' && b.workers > 2).sort((a, b) => b.workers - a.workers || a.id - b.id)[0];
      if (donor) cmds.push({ type: 'assign_workers', buildingId: openFarm.id, sources: [donor.id] });
    } else {
      // coleta do recurso mais atrasado com posto vago recebe um trabalhador da coleta mais folgada
      const needy = gatherers
        .filter((b) => b.workers < sim.fx(b).workers)
        .sort((a, b) => (waits.get(resourceOf(b)) ?? 0) - (waits.get(resourceOf(a)) ?? 0) || a.id - b.id)[0];
      const needWait = needy ? (waits.get(resourceOf(needy)) ?? 0) : 0;
      const donor = needy
        ? gatherers
            .filter((b) => b.workers > 3 && resourceOf(b) !== resourceOf(needy) && (waits.get(resourceOf(b)) ?? 0) * 2 < needWait)
            .sort((a, b) => (waits.get(resourceOf(a)) ?? 0) - (waits.get(resourceOf(b)) ?? 0) || b.workers - a.workers)[0]
        : undefined;
      if (needy && donor && needWait > AI_BOTTLENECK_SECONDS) cmds.push({ type: 'assign_workers', buildingId: needy.id, sources: [donor.id] });
      else if (income.food > AI_FOOD_FLOOR * 2.5) {
        const capped = gatherers.find((b) => b.workerTarget < sim.fx(b).workers);
        if (capped) cmds.push({ type: 'set_workers', buildingId: capped.id, count: sim.fx(capped).workers });
      }
    }
    // centro de pesquisa, quartel e fábrica sem gente: recebem um cidadão da maior coleta (parados, não
    // pesquisam nem produzem)
    const idleCore = mine.find(
      (b) => (b.type === 'research_center' || b.type === 'barracks' || b.type === 'factory') && b.progress >= 1 && b.hp > 0 && b.workers < Math.min(b.workerTarget, sim.fx(b).workers),
    );
    if (idleCore && pop.idle === 0) {
      const donor = gatherers.filter((b) => b.workers > 2 && (b.type !== 'farm' || income.food > AI_FOOD_FLOOR * 2)).sort((a, b) => b.workers - a.workers || a.id - b.id)[0];
      if (donor) cmds.push({ type: 'assign_workers', buildingId: idleCore.id, sources: [donor.id] });
    }

    // primeira obra do plano que ficou esperando recursos: as obras seguintes e as melhorias só usam
    // o que sobra depois de reservar o custo dela (sem isso, a base militar nunca junta madeira)
    let waitingFor: BuildingType | null = null;
    let waitCost: Cost = {};
    const tryBuild = (type: BuildingType): boolean => {
      if (buildingEra(type) > sim.eraOf(this.slot)) return false;
      const cost = costOf(type);
      if (!canAfford(budget, cost)) {
        if (waitingFor === null && spotFor(type)) {
          waitingFor = type;
          waitCost = cost;
          for (const r of RESOURCE_TYPES) budget[r] -= cost[r] ?? 0;
        }
        return false;
      }
      const cell = spotFor(type);
      if (!cell || sim.placementError(this.slot, type, cell) !== null || !take(cost)) return false;
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
        const withReserve: Cost = { ...next.cost, supplies: (next.cost.supplies ?? 0) + 40 };
        if (sim.eraBlocker(this.slot) === null && canAfford(budget, withReserve) && take(next.cost)) cmds.push({ type: 'advance_era' });
        else savingForEra = true;
      }
    }
    // Centro de Pesquisa: com a fábrica pronta, guarda material para ele em vez de gastar em
    // prefeituras, melhorias e tropas (a obra entra no plano assim que couber no orçamento)
    const savingForResearch =
      count('research_center') === 0 && done('barracks') && sim.tick >= AI_RESEARCH_TICK && buildingEra('research_center') <= sim.eraOf(this.slot);
    const housingInProgress = mine.some((b) => (b.type === 'house' || b.type === 'residential') && b.progress < 1);
    const wellsWithoutTank = mine.some(
      (w) => w.type === 'oil_well' && !mine.some((t) => t.type === 'oil_tank' && dist(t.pos, w.pos) / sim.map.cellSize <= OIL_TANK_RANGE),
    );
    // ameaça aérea (Fase 7): base aérea ou silo inimigo conhecido pede defesa antiaérea perto do QG
    const airThreat = sim.buildings.some((b) => b.owner !== this.slot && (b.type === 'airbase' || b.type === 'missile_silo') && sim.hostile(this.slot, b.owner) && sim.air.isKnown(this.slot, b.id));
    // cidades: duas prefeituras na fronteira depois da economia básica (economiza pedra para elas)
    // era 2 (destrava o Centro de Pesquisa): com a base militar pronta, o QG sobe antes de qualquer outra
    // melhoria e antes da fábrica (a pesquisa vem antes dos blindados)
    const needHq = sim.eras && (me.era ?? 1) < 2 && done('barracks') && sim.hqLevel(this.slot) < ERAS[2].hqLevel;
    // eras seguintes: a partir do momento da dificuldade, com o Centro de Pesquisa pronto, o QG sobe até o nível
    // da próxima era antes das outras melhorias (sem parar a fábrica, as cidades nem as tropas)
    const era = me.era ?? 1;
    const pushEra =
      sim.eras && era >= 2 && era < 4 && !me.eraAdvance && done('research_center') && sim.tick >= level.eraPushMinutes * 60 * TICK_RATE && sim.hqLevel(this.slot) < ERAS[(era + 1) as Era].hqLevel;
    // guardando para o QG da próxima era: sem outras melhorias (a fábrica, as prefeituras, as estradas e as tropas
    // seguem: as cidades e as caravanas rendem os suprimentos da era)
    const savingCore = savingForEra || savingForResearch || needHq;
    const saving = savingCore || pushEra;
    // próxima coleta: a do recurso mais atrasado
    let bottleneck: BuildingType | null = null;
    let worst = 0;
    for (const [r, type] of GATHERER_OF) {
      // falta gente: o gargalo é a comida que forma cidadãos (outra fazenda, se as atuais estão cheias)
      if (laborShort && r === 'food') {
        if (!openFarm && income.food < AI_FOOD_NEW_FARM && active('farm') < (GATHERER_MAX.farm ?? 6) && !mine.some((b) => b.type === 'farm' && b.progress < 1)) {
          bottleneck = 'farm';
          worst = AI_BOTTLENECK_URGENT_SECONDS + 1;
          break;
        }
        continue;
      }
      if (active(type) >= (GATHERER_MAX[type] ?? 4) || mine.some((b) => b.type === type && b.progress < 1)) continue;
      // petróleo só com a base militar (os poços pedem tanque e o petróleo serve às tropas)
      if (r === 'oil' && !done('barracks')) continue;
      // postos vagos nos coletores desse recurso: falta gente, não outro edifício
      const vacant = mine.reduce((a, b) => a + (b.type === type && b.progress >= 1 && b.status !== 'depleted' ? Math.max(0, sim.fx(b).workers - b.workers) : 0), 0);
      if (vacant >= 3) continue;
      const wait = waits.get(r) ?? 0;
      // com falta de gente em outras coletas, só abre outra deste recurso se as dele estão cheias e a espera é grave
      // (madeira e pedra seguravam o QG e a era por dezenas de minutos com uma serraria e uma pedreira)
      if (laborShort && (vacant > 0 || wait <= AI_BOTTLENECK_URGENT_SECONDS)) continue;
      if (wait > worst) {
        worst = wait;
        bottleneck = type;
      }
    }
    // depósito do gargalo fora do alcance (os próximos se esgotaram): uma torre amplia a fronteira até outro
    const bottleneckTerrain = bottleneck ? BUILDINGS[bottleneck].gather!.terrain : null;
    const exhausted = bottleneck !== null && (active(bottleneck) === 0 || mine.some((b) => b.type === bottleneck && b.status === 'depleted'));
    expandTo =
      bottleneck && exhausted && worst > AI_BOTTLENECK_SECONDS && bottleneckTerrain !== null && !mine.some((b) => b.type === 'tower' && b.progress < 1) && !spotFor(bottleneck)
        ? this.nearestDeposit(sim, hq, bottleneckTerrain)
        : null;
    // coletas do tipo todas com os postos ocupados (e nenhuma em obra)
    const full = (t: BuildingType) =>
      !mine.some((b) => b.type === t && (b.progress < 1 || (b.status !== 'depleted' && b.workers < sim.fx(b).workers)));
    // com madeira e pedra sobrando (o gargalo vira suprimentos), mais prefeituras: cada uma rende suprimentos e a
    // caravana dela
    const cityCap = nearlyFull('wood') || nearlyFull('stone') ? AI_MAX_CITIES : 2;
    const cityWanted = !savingCore && count('city_hall') < cityCap && done('factory') && done('tower') && this.citySiteExists(sim, hq);
    // rede elétrica: geração abaixo da demanda (com o que está em obra) pede outra usina; carvão acabando pede mina
    const power = sim.power ? sim.powerInfo[this.slot] : undefined;
    const plantInProgress = mine.some((b) => POWER_GEN[b.type] && b.progress < 1);
    const pendingUse = mine.reduce((a, b) => a + (b.progress < 1 ? (POWER_USE[b.type]?.use ?? 0) : 0), 0);
    const powerShort = !!power && !plantInProgress && power.supply < power.demand + pendingUse + 4;
    const coalLow = sim.power && res.coal < 60;
    const plantType: BuildingType =
      era >= 3 && count('solar_farm') < count('coal_plant') ? 'solar_farm' : coalLow && era >= 2 && count('wind_farm') < 4 ? 'wind_farm' : 'coal_plant';
    const plan: [BuildingType, boolean][] = [
      [plantType, powerShort],
      ['mine', !!coalLow && active('mine') === 0 && !mine.some((b) => b.type === 'mine' && b.progress < 1)],
      ['house', pop.total >= pop.cap - 2 && pop.cap < POP_ABSOLUTE_CAP && !housingInProgress && count('house') + count('residential') < 14],
      ['oil_tank', wellsWithoutTank || (mine.some((b) => b.type === 'oil_well' && b.status === 'storage_full') && count('oil_tank') < 5)],
      ['city_hall', cityWanted],
      // mercado interno: com material sobrando e suprimentos curtos, o Terminal Comercial troca um pelo outro
      ['market', count('market') === 0 && this.surplus(sim, cap, res) !== null && res.supplies < cap.supplies * 0.5],
      ['warehouse', ((nearlyFull('wood') && done('sawmill')) || (nearlyFull('stone') && done('quarry')) || (nearlyFull('iron') && done('mine'))) && count('warehouse') < 4],
      ['silo', nearlyFull('food') && done('farm') && count('silo') < (savingCore ? 1 : 3)],
      // o mínimo de cada coleta; o resto vem do gargalo
      ['sawmill', active('sawmill') === 0],
      ['farm', count('farm') === 0],
      // gargalo grave (a próxima compra demoraria mais de 1 min): coleta antes da base militar
      [bottleneck ?? 'farm', bottleneck !== null && worst > AI_BOTTLENECK_URGENT_SECONDS],
      ['barracks', count('barracks') === 0],
      // a comida forma cidadãos e soldados: com as fazendas cheias, outra até o número da dificuldade (uma fazenda
      // cheia se paga em pouco mais de 1 min)
      ['farm', !openFarm && active('farm') < level.farms && !mine.some((b) => b.type === 'farm' && b.progress < 1)],
      // da era 2 em diante, ferro e pedra pagam o QG, a era e o equipamento: segunda mina e pedreira com as
      // primeiras cheias
      ['mine', era >= 2 && active('mine') < 2 && full('mine')],
      ['quarry', era >= 2 && active('quarry') < 2 && full('quarry')],
      ['quarry', active('quarry') === 0 && done('barracks')],
      ['mine', active('mine') === 0 && done('barracks')],
      ['oil_well', count('oil_well') === 0 && done('barracks')],
      [bottleneck ?? 'farm', bottleneck !== null && worst > AI_BOTTLENECK_SECONDS],
      ['tower', expandTo !== null && count('tower') < 3],
      ['research_center', count('research_center') === 0 && done('barracks') && sim.tick >= AI_RESEARCH_TICK],
      // fábrica depois da era 2 e do Centro de Pesquisa (ou sem eras)
      ['factory', count('factory') === 0 && done('barracks') && !savingCore],
      ['tower', count('tower') < 1 && done('factory') && !saving],
      ['aa_battery', airThreat && count('aa_battery') < 3 && done('factory')],
      ['residential', pop.cap >= 60 && pop.total >= pop.cap - 4 && !housingInProgress && count('residential') < 4],
      ['factory', count('factory') < 2 && !saving && budget.supplies > 350 && budget.oil > 150],
      ['barracks', count('barracks') < 2 && !saving && budget.food > 250],
      // cadeias produtivas e serviços (lote 1, §4): depois da economia militar montada
      ['steel_mill', count('steel_mill') === 0 && done('research_center') && active('mine') >= 1 && army.length >= 8 && budget.iron > 150],
      ['refinery', count('refinery') === 0 && done('research_center') && count('oil_well') >= 2 && army.length >= 8 && budget.oil > 120],
      ['school', count('school') === 0 && done('research_center') && count('house') >= 3 && army.length >= 6],
      ['hospital', count('hospital') === 0 && done('steel_mill') && army.length >= 10],
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

    // --- estradas até as prefeituras (as caravanas só andam por estrada): fora das emergências, sem
    // guardar recursos para algo mais urgente e com pedra de folga
    if (!savingCore && !waitingFor) this.planRoads(sim, hq, mine, budget, take, cmds);

    // --- pesquisa militar: o centro pesquisa na ordem, antes das melhorias e das tropas; a produção usa o
    // que já foi liberado (com o centro ainda em obra, a primeira pesquisa já entra na reserva)
    const unlocked = me.militaryResearch ?? [];
    const researchWait =
      this.planResearch(sim, mine, airThreat, take, cmds) ??
      (mine.some((b) => b.type === 'research_center' && b.progress < 1) && !unlocked.length ? MILITARY_RESEARCH.tracked_armor.cost : null);

    // --- melhorias (Fase 4): uma obra por vez, só com folga de recursos e de manutenção
    // (guardando material enquanto junta para a próxima prefeitura). Com os custos altos, só depois do
    // quartel e sem obra do plano esperando recursos: senão as melhorias consomem a base militar.
    if (needHq || pushEra) this.planUpgrade(sim, mine, budget, take, cmds, true);
    else if ((!cityWanted || built === 'city_hall') && !saving && !waitingFor && !researchWait && done('barracks')) this.planUpgrade(sim, mine, budget, take, cmds);


    // --- produção militar: cada unidade precisa de um recruta da reserva como tripulação.
    // No preparo (e sem guerra), só uma guarnição: os recursos vão para a economia.
    const preparing = sim.tick < prep && !atWar;
    const garrisonRoom = Math.max(0, level.prepGarrison - army.length - pop.queuedMilitary);
    // com os custos altos, a produção (e os recrutas) consumiria o material do Centro de Pesquisa e da próxima era:
    // guarda o que falta até conseguir pagá-los (destravam as tropas melhores)
    if (undefended) {
      // sem a guarnição mínima, as tropas vêm antes das reservas: devolve a da obra que esperava recursos
      for (const r of RESOURCE_TYPES) budget[r] += waitCost[r] ?? 0;
    } else {
      if (savingForResearch) for (const r of RESOURCE_TYPES) budget[r] -= BUILDINGS.research_center.cost[r] ?? 0;
      // a primeira pesquisa (e, no preparo ou com uma guarnição montada acima do exército mínimo, as seguintes)
      // passa na frente das próximas tropas
      if (researchWait && (!unlocked.length || (!behind && (preparing || army.length >= level.prepGarrison)))) for (const r of RESOURCE_TYPES) budget[r] -= researchWait[r] ?? 0;
      // muito abaixo do exército mínimo, as tropas passam na frente da era e do QG
      if (savingForEra && !farBehind) for (const r of RESOURCE_TYPES) budget[r] -= ERAS[((me.era ?? 1) + 1) as Era].cost[r] ?? 0;
      // QG para a próxima era: a melhoria que ficou esperando recursos passa na frente das tropas
      if ((needHq || pushEra) && !hq.upgrade && !farBehind) {
        const up = sim.upgradePlan(hq).cost;
        for (const r of RESOURCE_TYPES) budget[r] -= up[r] ?? 0;
      }
    }
    // recrutas: alistados no quartel para tripular as próximas unidades (no preparo, só a guarnição). Um por quartel
    // ou fábrica pronta: recruta parado na reserva prende a comida que formaria o soldado
    const lines = mine.filter((b) => (b.type === 'barracks' || b.type === 'factory') && b.progress >= 1).length;
    const wantRecruits = Math.min(preparing ? garrisonRoom : 4, lines);
    const barracks = mine.find((b) => b.type === 'barracks' && b.progress >= 1 && b.queue.length < 2);
    if (barracks && pop.total < pop.cap && pop.recruits + pop.queuedRecruits < wantRecruits && take(RECRUIT.cost)) {
      cmds.push({ type: 'produce', buildingId: barracks.id, unitType: 'recruit' });
    }
    let crew = preparing ? Math.min(pop.recruits, garrisonRoom) : pop.recruits;
    const has = (u: UnitType) => !UNITS[u].requires || unlocked.includes(UNITS[u].requires!);
    const enemyArmor = sim.units.filter((u) => sim.hostile(this.slot, u.owner) && UNITS[u.type].armor === 'vehicle' && sim.canSee(this.slot, u)).length;
    // lança-foguetes inimigo à vista: o CIWS entra no lugar da antiaérea (derruba parte das salvas)
    const enemyRockets = sim.units.some((u) => sim.hostile(this.slot, u.owner) && u.type === 'rocket_artillery' && sim.canSee(this.slot, u));
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
      enemyRockets && has('ciws') ? 'ciws' : airThreat && has('mobile_aa') ? 'mobile_aa' : has('mbt') ? 'mbt' : has('tank') ? 'tank' : 'apc',
    ];
    // força aérea depois das reservas: aviões caros consumiam os suprimentos do QG e da era
    if (level.airPower) this.planAir(sim, mine, level.missiles, natTechs, take, cmds);
    const techs = sim.national ? sim.national.techs(this.slot) : null;
    // bens industriais reservados na própria avaliação (vários pedidos no mesmo turno)
    const goods = { ...(me.goods ?? emptyGoods()) };
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
          goods,
        });
        if (check.blocker || !take(check.cost)) continue;
        for (const g of GOODS_TYPES) goods[g] -= check.goods[g] ?? 0;
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

    // --- mercado interno: vende o excedente por suprimentos (o gargalo do meio de partida)
    this.planMarket(sim, mine, cap, res, cmds);

    // --- explorador: percorre a vizinhança e o centro do mapa (acha depósitos e o inimigo); fora da onda
    this.planScout(sim, hq, army, committed, cmds);

    // --- ataque em ondas (unidades em modernização não contam: estão indisponíveis)
    const idle = army.filter((u) => u.order.kind === 'idle' && u.engageId === null && !u.refit && !committed.has(u.id));
    // primeira ofensiva na hora da dificuldade, com o que tiver (pelo menos minFirstWave); depois, ondas cheias
    const firstOffensive = !Number.isFinite(this.lastWaveTick);
    const ready = sim.tick >= Math.max(prep, firstAttackTicks(sim.difficulty)) && sim.tick - this.lastWaveTick >= level.waveCooldownMinutes * 60 * TICK_RATE;
    // exército parado de crescer (recursos esgotados ao alcance): ataca com o que tem
    if (army.length > this.armyPeak) {
      this.armyPeak = army.length;
      this.peakTick = sim.tick;
    }
    const stalled = sim.tick - this.peakTick >= AI_STALL_TICKS && idle.length >= AI_MIN_WAVE;
    const timed = firstOffensive && idle.length >= level.minFirstWave;
    if (!this.attacking && (idle.length >= this.waveSize || stalled || timed) && ready) {
      const objective = this.enemyObjective(sim);
      // sem guerra formal não há ofensiva: pede a declaração e espera
      if (objective && !sim.formalWar(this.slot, objective.slot)) this.wantsWarWith = objective.slot;
      const target = objective && sim.formalWar(this.slot, objective.slot) ? objective.pos : null;
      if (target) {
        // guarda da base: as últimas tropas ficam para conter o contra-ataque (com a economia apertada, um
        // QG sem ninguém cai na primeira resposta do inimigo)
        const wave = idle.length > AI_HOME_GUARD + AI_MIN_WAVE ? idle.slice(0, idle.length - AI_HOME_GUARD) : idle;
        cmds.push({ type: 'attack_move', unitIds: wave.map((u) => u.id), x: target.x, y: target.y });
        this.attacking = true;
        this.lastWaveTick = sim.tick;
        // a primeira ofensiva, menor que a onda cheia, não faz a próxima crescer
        if (wave.length >= this.waveSize) this.waveSize = Math.min(this.waveSize + level.waveStep, level.maxWave);
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

  /** Inicia a próxima pesquisa militar; devolve o custo da que ficou esperando por recursos. */
  private planResearch(sim: Simulation, mine: Building[], airThreat: boolean, take: (c: Cost) => boolean, cmds: Command[]): Cost | null {
    const center = mine.find((b) => b.type === 'research_center' && b.progress >= 1 && b.hp > 0 && !b.research && b.workers > 0);
    if (!center) return null;
    const done = sim.players[this.slot]!.militaryResearch ?? [];
    const order: MilitaryResearchId[] = airThreat
      ? ['tracked_armor', 'mobile_air_defense', 'field_artillery', 'antitank_weapons', 'rocket_systems', 'special_operations', 'modern_armor', 'point_defense']
      : ['tracked_armor', 'field_artillery', 'antitank_weapons', 'rocket_systems', 'mobile_air_defense', 'modern_armor', 'special_operations', 'point_defense'];
    // engenharia de combate depois das armas antitanque (só quando a dificuldade usa minas)
    if (DIFFICULTY[sim.difficulty].engineers > 0) order.splice(order.indexOf('antitank_weapons') + 1, 0, 'combat_engineering');
    for (const id of order) {
      if (done.includes(id) || mine.some((b) => b.research?.id === id)) continue;
      if (militaryResearchBlocker(id, done, center.level, sim.eraOf(this.slot))) continue;
      if (!take(MILITARY_RESEARCH[id].cost)) return MILITARY_RESEARCH[id].cost;
      cmds.push({ type: 'military_research', buildingId: center.id, researchId: id });
      return null;
    }
    return null;
  }

  /** Recurso com a maior sobra acima da reserva (e quanto sobra), ou null. */
  private surplus(sim: Simulation, cap: Stockpile, res: Stockpile): { r: MarketResource; extra: number } | null {
    let best: { r: MarketResource; extra: number } | null = null;
    for (const r of MARKET_RESOURCES) {
      const keep = Math.max(AI_MARKET_KEEP, cap[r] * AI_MARKET_KEEP_FRACTION);
      const extra = res[r] - keep;
      // preço já muito baixo (vendeu demais há pouco): espera a recuperação
      const price = marketPrice(r, sim.players[this.slot]!.marketPressure?.[r] ?? 0);
      if (extra >= AI_MARKET_LOT && price >= MARKET.rates[r] * AI_MARKET_MIN_PRICE && (!best || extra * price > best.extra * marketPrice(best.r, 0))) best = { r, extra };
    }
    return best;
  }

  /** Uma venda por vez, a cada AI_MARKET_EVERY_TICKS, enquanto houver sobra e espaço para os suprimentos. */
  private planMarket(sim: Simulation, mine: Building[], cap: Stockpile, res: Stockpile, cmds: Command[]): void {
    if (sim.tick - this.lastMarketTick < AI_MARKET_EVERY_TICKS) return;
    const market = mine.find((b) => b.type === 'market' && b.progress >= 1 && b.hp > 0);
    if (!market || (cap.supplies > 0 && res.supplies > cap.supplies * 0.8)) return;
    const best = this.surplus(sim, cap, res);
    if (!best) return;
    // lote proporcional à sobra (até 5 lotes): com a coleta alta, um lote pequeno não acompanhava a renda
    const quantity = Math.min(AI_MARKET_LOT * 5, Math.floor(best.extra / AI_MARKET_LOT) * AI_MARKET_LOT);
    cmds.push({ type: 'market_sell', buildingId: market.id, resource: best.r, quantity });
    this.lastMarketTick = sim.tick;
  }

  private planUpgrade(sim: Simulation, mine: Building[], budget: Stockpile, take: (c: Cost) => boolean, cmds: Command[], onlyHq = false): void {
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
    const candidates = mine.filter((b) => b.progress >= 1 && b.hp > 0 && (onlyHq ? b.type === 'hq' : order(b) < 9)).sort((a, b) => order(a) - order(b) || a.level - b.level || a.id - b.id);
    for (const b of candidates) {
      const plan = sim.upgradePlan(b, AI_SPEC[b.type] ?? null);
      if (plan.toLevel === null) continue;
      // o QG destrava todo o resto: se só faltam recursos ou verba, junta para ele em vez de gastar em outra obra
      const saving = order(b) === 0 && plan.blocker !== null && (plan.blocker.startsWith('Recursos') || plan.blocker.startsWith('Verba'));
      if (saving) return;
      if (plan.blocker) continue;
      // mantém reserva para recrutas e emergências (comida só com a renda negativa: a formação de
      // cidadãos consome toda a comida que entra, e a reserva fixa travava as melhorias)
      // (o QG da próxima era não guarda reserva de suprimentos: ela vem da própria reserva do QG, antes das tropas)
      const reserve: Cost = { supplies: onlyHq ? 0 : 120, food: income.food < 0 ? 80 : 0 };
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

  /**
   * Liga cada prefeitura pronta ao QG por estrada (uma obra por vez, até 40 células, a partir do QG),
   * com a mesma regra e o mesmo custo do jogador. Com as cidades ligadas, liga também as coletas e
   * usinas próximas (+15% de produção), só em trechos curtos e com mais pedra de folga. Espera quando
   * há ameaça perto da base ou quando a estrada deixaria a pedra abaixo da reserva.
   */
  private planRoads(sim: Simulation, hq: Building, mine: Building[], budget: Stockpile, take: (c: Cost) => boolean, cmds: Command[]): void {
    if (sim.tick - this.lastRoadTick < AI_ROAD_COOLDOWN_TICKS) return;
    const cities = mine.filter((b) => b.type === 'city_hall' && b.progress >= 1 && b.hp > 0);
    for (const city of cities) {
      if (roadLink(sim, this.slot, hq, city)) continue;
      if (this.nearestThreat(sim, mine)) return;
      const route = this.roadRoute(sim, hq, city);
      if (!route) continue;
      const W = sim.map.width;
      const fresh = route.filter((c) => sim.map.terrain[c.cy * W + c.cx] !== Terrain.Road).slice(0, ROAD.maxCells);
      if (!fresh.length) continue;
      const stone = fresh.length * ROAD.stonePerCell;
      if (budget.stone - stone < AI_ROAD_STONE_RESERVE) return;
      if (sim.roadPlan(this.slot, fresh).error) continue;
      if (!take({ stone })) return;
      cmds.push({ type: 'build_road', cells: fresh });
      this.lastRoadTick = sim.tick;
      return;
    }
    // cidades ligadas: coletas e usinas sem estrada (as que mais produzem primeiro), por trechos curtos
    if (this.nearestThreat(sim, mine)) return;
    // rede elétrica: construções paradas longe da malha ganham estrada até o QG (a energia anda por ela)
    if (sim.power) {
      const near = this.meshNear(sim);
      const W2 = sim.map.width;
      for (const b of mine) {
        if (!POWER_USE[b.type]?.stops || b.progress < 1 || b.hp <= 0 || sim.isPowered(b) || near(b.cell, BUILDINGS[b.type].size)) continue;
        const route = this.roadRoute(sim, b, hq);
        if (!route) continue;
        const fresh = route.filter((c) => sim.map.terrain[c.cy * W2 + c.cx] !== Terrain.Road).slice(0, ROAD.maxCells);
        if (!fresh.length) continue;
        const stone = fresh.length * ROAD.stonePerCell;
        if (budget.stone - stone < 20) return;
        if (sim.roadPlan(this.slot, fresh).error) continue;
        if (!take({ stone })) return;
        cmds.push({ type: 'build_road', cells: fresh });
        this.lastRoadTick = sim.tick;
        return;
      }
    }
    const producers = mine
      .filter((b) => (BUILDINGS[b.type].gather || BUILDINGS[b.type].process) && b.progress >= 1 && b.hp > 0 && b.status !== 'depleted' && !sim.roadLinked(b))
      .sort((a, b) => sim.buildingRate(b) - sim.buildingRate(a) || a.id - b.id);
    const W = sim.map.width;
    for (const b of producers) {
      const route = this.roadRoute(sim, b, hq);
      if (!route) continue;
      const fresh = route.filter((c) => sim.map.terrain[c.cy * W + c.cx] !== Terrain.Road);
      if (!fresh.length || fresh.length > AI_ROAD_PRODUCTION_MAX_CELLS) continue;
      const stone = fresh.length * ROAD.stonePerCell;
      if (budget.stone - stone < AI_ROAD_PRODUCTION_RESERVE) return;
      if (sim.roadPlan(this.slot, fresh).error) continue;
      if (!take({ stone })) return;
      cmds.push({ type: 'build_road', cells: fresh });
      this.lastRoadTick = sim.tick;
      return;
    }
  }

  /**
   * Traçado de estrada entre dois edifícios (Dijkstra na grade, vizinhas norte/sul/leste/oeste): sai
   * de uma célula colada ao QG e chega a uma colada à prefeitura. Estrada existente quase não custa
   * (é reaproveitada); planície livre no próprio território custa 1 e solo fértil livre, 3; água, rocha,
   * floresta, lama, minério, construções, plantações e território alheio ficam de fora (o traçado desvia).
   */
  private roadRoute(sim: Simulation, from: Building, to: Building): Cell[] | null {
    const W = sim.map.width;
    const H = sim.map.height;
    const T = sim.map.terrain;
    // células já exploradas por alguma coleta (a plantação de uma fazenda) não viram estrada
    const claimed = new Set<number>();
    for (const b of sim.buildings) for (const i of b.claims) claimed.add(i);
    const stepCost = (i: number): number => {
      const t = T[i];
      if (t === Terrain.Road) return 0.2;
      if (t !== Terrain.Plains && t !== Terrain.Fertile) return Infinity;
      if (sim.territory[i] !== this.slot || claimed.has(i)) return Infinity;
      if (sim.grid.occupant(i % W, Math.floor(i / W)) !== 0) return Infinity;
      // solo fértil livre vale uma fazenda futura: só se não houver planície por perto
      return t === Terrain.Fertile ? 3 : 1;
    };
    const ring = (b: Building): number[] => {
      const size = BUILDINGS[b.type].size;
      const out: number[] = [];
      for (let dy = -1; dy <= size; dy++)
        for (let dx = -1; dx <= size; dx++) {
          if (dx >= 0 && dx < size && dy >= 0 && dy < size) continue;
          // os cantos diagonais não ligam pelas vizinhas norte/sul/leste/oeste do edifício
          if ((dx === -1 || dx === size) && (dy === -1 || dy === size)) continue;
          const cx = b.cell.cx + dx;
          const cy = b.cell.cy + dy;
          if (cx >= 0 && cy >= 0 && cx < W && cy < H && stepCost(cy * W + cx) < Infinity) out.push(cy * W + cx);
        }
      return out;
    };
    const goals = new Set(ring(to));
    if (!goals.size) return null;
    const best = new Float64Array(W * H).fill(Infinity);
    const prev = new Int32Array(W * H).fill(-1);
    // fila de prioridade (heap binário de [custo, célula])
    const heap: [number, number][] = [];
    const push = (c: number, i: number) => {
      heap.push([c, i]);
      for (let k = heap.length - 1; k > 0; ) {
        const p = (k - 1) >> 1;
        if (heap[p]![0] <= heap[k]![0]) break;
        [heap[p], heap[k]] = [heap[k]!, heap[p]!];
        k = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ; ) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k]!, heap[m]!];
          k = m;
        }
      }
      return top;
    };
    for (const i of ring(from)) {
      best[i] = stepCost(i);
      push(best[i]!, i);
    }
    while (heap.length) {
      const [c, i] = pop();
      if (c > best[i]!) continue;
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
        const nc = c + stepCost(n);
        if (nc < best[n]!) {
          best[n] = nc;
          prev[n] = i;
          push(nc, n);
        }
      }
    }
    return null;
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
    // com várias nações: ignora aliados e prefere quem já está em guerra com outro (enfraquecido,
    // e sem abrir uma segunda frente contra si) ou quem já perdeu o QG de vista
    sim.players.forEach((p) => {
      if (p.slot === this.slot || p.defeated || sim.allied(this.slot, p.slot)) return;
      const spawn = sim.map.spawns[p.slot];
      if (!spawn) return;
      const pos = sim.grid.cellCenter(spawn);
      const busy = sim.players.some((o) => o.slot !== p.slot && o.slot !== this.slot && !o.defeated && sim.formalWar(o.slot, p.slot));
      const d = dist(pos, hq.pos) * (busy ? 0.75 : 1) * (sim.formalWar(this.slot, p.slot) ? 0.85 : 1);
      if (d < bestD) {
        bestD = d;
        best = { pos, slot: p.slot };
      }
    });
    return best;
  }

  /** Explorador parado segue para o próximo ponto da ronda: volta do território a 18 células e o centro do mapa. */
  private planScout(sim: Simulation, hq: Building, army: Unit[], committed: Set<number>, cmds: Command[]): void {
    const scout = army.find((u) => u.type === 'scout' && u.order.kind === 'idle' && u.engageId === null);
    if (!scout) return;
    committed.add(scout.id);
    const cs = sim.map.cellSize;
    const mid = { x: (sim.map.width * cs) / 2, y: (sim.map.height * cs) / 2 };
    const k = this.scoutLeg++ % (AI_SCOUT_POINTS + 1);
    let to: Vec2 = mid;
    if (k < AI_SCOUT_POINTS) {
      const a = (k / AI_SCOUT_POINTS) * Math.PI * 2;
      to = { x: hq.pos.x + Math.cos(a) * 18 * cs, y: hq.pos.y + Math.sin(a) * 18 * cs };
    }
    const max = { x: sim.map.width * cs - cs, y: sim.map.height * cs - cs };
    cmds.push({ type: 'move', unitIds: [scout.id], x: Math.max(cs, Math.min(max.x, to.x)), y: Math.max(cs, Math.min(max.y, to.y)) });
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

  /** Jazida de petróleo livre no território, a mais perto do QG (ignora o custo: serve também para reservar). */
  private freeNode(sim: Simulation, hq: Building, _mine?: Building[]): Cell | null {
    const nodes = [...sim.map.resourceNodes].sort(
      (a, b) => dist(sim.grid.cellCenter(a), hq.pos) - dist(sim.grid.cellCenter(b), hq.pos),
    );
    return nodes.find((n) => {
      const err = sim.placementError(this.slot, 'oil_well', n);
      return err === null || err === 'Recursos insuficientes';
    }) ?? null;
  }

  /**
   * Depósito ainda com recurso, fora do alcance das coletas, mais perto do QG (até 30 células): alvo de uma torre que
   * amplia a fronteira quando os depósitos próximos se esgotam.
   */
  private nearestDeposit(sim: Simulation, hq: Building, terrain: Terrain): Cell | null {
    const w = sim.map.width;
    let best: Cell | null = null;
    let bestD = 30;
    for (const d of sim.deposits.deposits) {
      if (d.terrain !== terrain || d.remaining <= 0) continue;
      for (const i of d.cells) {
        if (sim.territory[i] !== -1) continue;
        const cell = { cx: i % w, cy: Math.floor(i / w) };
        const dd = Math.hypot(cell.cx - hq.cell.cx, cell.cy - hq.cell.cy);
        if (dd < bestD) {
          bestD = dd;
          best = cell;
        }
      }
    }
    return best;
  }

  /** Posição de torre dentro do território, a mais perto do depósito a alcançar. */
  private expansionSpot(sim: Simulation, hq: Building, target: Cell): Cell | null {
    const reach = 18;
    const candidates: { cell: Cell; d: number }[] = [];
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const cell = { cx: hq.cell.cx + dx, cy: hq.cell.cy + dy };
        if (sim.territory[cell.cy * sim.map.width + cell.cx] !== this.slot) continue;
        candidates.push({ cell, d: Math.hypot(cell.cx - target.cx, cell.cy - target.cy) });
      }
    candidates.sort((a, b) => a.d - b.d || a.cell.cy - b.cell.cy || a.cell.cx - b.cell.cx);
    for (const { cell, d } of candidates.slice(0, 60)) {
      if (d > BUILDINGS.tower.territoryRadius - 1) break;
      const err = sim.placementError(this.slot, 'tower', cell);
      if ((err === null || err === 'Recursos insuficientes') && this.hasClearance(sim, cell, BUILDINGS.tower.size)) return cell;
    }
    return null;
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

  private findBuildSpot(sim: Simulation, hq: Building, type: BuildingType, ignoreCost = false, mine?: Building[]): Cell | null {
    const mid = { x: (sim.map.width * sim.map.cellSize) / 2, y: (sim.map.height * sim.map.cellSize) / 2 };
    const gather = BUILDINGS[type].gather;
    const claimed = gather ? claimedBy(sim.buildings, type) : null;
    // rede elétrica: consumidoras e usinas ficam ao alcance da malha (estradas, usinas e QG)
    const wired = sim.power && (POWER_USE[type]?.use || POWER_GEN[type]) ? this.meshNear(sim) : null;
    const scan = (center: Cell, reach: number): Cell | null => {
      const candidates: { cell: Cell; score: number }[] = [];
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const r = Math.max(Math.abs(dx), Math.abs(dy));
          if (r < (gather ? 2 : 4)) continue;
          const cell = { cx: center.cx + dx, cy: center.cy + dy };
          const c = sim.grid.cellCenter(cell);
          let score = r * 4 + dist(c, mid) * 0.2;
          if (gather && claimed) score -= claimableCells(sim.map, type, cell, claimed).length * 12;
          if (wired && !wired(cell, BUILDINGS[type].size)) score += 400;
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
    };
    // prefeituras ficam longe do QG (espaçamento mínimo entre cidades)
    const found = scan(hq.cell, gather ? 13 : type === 'city_hall' ? 17 : 9);
    if (found || !gather || !mine) return found;
    // depósitos próximos esgotados: procura também em volta das torres e prefeituras (fronteira ampliada)
    for (const b of mine) {
      if ((b.type !== 'tower' && b.type !== 'city_hall') || b.progress < 1) continue;
      const far = scan(b.cell, 9);
      if (far) return far;
    }
    return null;
  }

  /** Teste "a construção em `cell` alcança a malha elétrica" (estradas próprias, usinas e QG). */
  private meshNear(sim: Simulation): (cell: Cell, size: number) => boolean {
    const W = sim.map.width;
    const mesh = new Uint8Array(W * sim.map.height);
    for (const r of sim.roads) if (r.owner === this.slot) mesh[r.i] = 1;
    for (const b of sim.buildings)
      if (b.owner === this.slot && (b.type === 'hq' || POWER_GEN[b.type])) {
        const n = BUILDINGS[b.type].size;
        for (let y = b.cell.cy; y < b.cell.cy + n; y++) for (let x = b.cell.cx; x < b.cell.cx + n; x++) mesh[y * W + x] = 1;
      }
    const R = POWER.reach;
    return (cell, size) => {
      for (let y = Math.max(0, cell.cy - R); y < Math.min(sim.map.height, cell.cy + size + R); y++)
        for (let x = Math.max(0, cell.cx - R); x < Math.min(W, cell.cx + size + R); x++) if (mesh[y * W + x]) return true;
      return false;
    };
  }

  private hasClearance(sim: Simulation, cell: Cell, size: number): boolean {
    for (let y = cell.cy - 1; y <= cell.cy + size; y++)
      for (let x = cell.cx - 1; x <= cell.cx + size; x++) {
        if (sim.grid.inBounds(x, y) && sim.grid.occupant(x, y) !== 0) return false;
      }
    return true;
  }
}

