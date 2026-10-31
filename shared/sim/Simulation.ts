import { prepTicks, type Difficulty } from './difficulty.ts';
import type { IdCipher, IdSpace } from './ids.ts';
import { RANKS, rankDamageMul, rankFor, rankHpMul } from './veterancy.ts';
import { countryBonus, type CountryBonus } from './countryBonus.ts';
import { ERA_CANCEL_REFUND, ERAS, buildingEra, eraPhrase, type Era } from './eras.ts';
import { MineSystem, type MineSave } from './mines.ts';
import { POWER, POWER_GEN, POWER_USE, solvePower, windFactor, type PowerNode } from './power.ts';
import { dayLight } from './climate.ts';
import { CaravanSystem, roadNetwork, roadRing, type CaravanSave } from './caravans.ts';
import { marketBuyQuote, marketQuote, marketRecover } from './market.ts';
import { decodeNonFinite, encodeNonFinite } from './json.ts';
import {
  BUILDINGS,
  CITY,
  CHASE_REPATH_TICKS,
  MAX_REPLANS,
  STARTING_RESOURCES,
  STUCK_TICKS,
  TERRAIN,
  Terrain,
  PROJECT_FX,
  ROAD,
  SPACE,
  TICK_RATE,
  TICK_SECONDS,
  UNITS,
  RESOURCE_TYPES,
  POP_ABSOLUTE_CAP,
  STARTING_CITIZENS,
  CITIZEN,
  RECRUIT,
  STARTING_RECRUITS,
  FOOD_UPKEEP_PER_POP,
  HUNGER_EFFICIENCY,
  OIL_TANK_RANGE,
  canAfford,
  buildingCost,
  ownedOfType,
  emptyStockpile,
  emptyGoods,
  GOODS,
  GOODS_TYPES,
  SERVICES,
  VICTORY,
  type ServiceKind,
  MILITARY_RESEARCH,
  MILITARY_RESEARCH_IDS,
  militaryResearchBlocker,
  type WeaponDef,
  type BuildingType,
  type Cost,
  type ResourceType,
  type Stockpile,
  type Goods,
  type UnitType,
} from './config.ts';
import { chooseClaims, claimedBy, gatherRate, sitesByDeposit } from './gathering.ts';
import { UPGRADE_CANCEL_REFUND, UPGRADE_WORK_EFFICIENCY, buildingEffects, maxLevelOf, missingText, planUpgrade, upgradeTrack, type BuildingEffects, type UpgradePlan, type UpgradeWorld } from './upgrades.ts';
import { findDeposits, type DepositIndex } from './deposits.ts';
import { computeTerritory, NO_OWNER, type TerritorySource } from './territory.ts';
import type { Command, SandboxToggle } from './commands.ts';
import { findPath } from './pathfinding/AStar.ts';
import { placementError } from './placement.ts';
import { nextCityName } from '../data/cities.ts';
import { geoOf } from '../data/geography.ts';
import { Grid } from './pathfinding/Grid.ts';
import { checkProduce } from './production.ts';
import { TradeSystem, type TradeLink, type TradeSave } from './trade.ts';
import { AirSystem, type AirSave } from './air.ts';
import { TECHNOLOGIES, isTechId } from '../strategic/technologies.ts';
import { MOD_CANCEL_REFUND, MODS, checkModernize, combineMods, pickRefitFacility, type FacilityPick, type ModId, type ModernizeContext } from './modernization.ts';
import type { Building, BuildingStatus, Cell, Entity, EntityId, MapData, PlayerState, SimEvent, Slot, TacticalModifiers, Unit, Vec2 } from './types.ts';

/** Como a partida foi vencida além da queda do QG (lote 2, item 15). */
export type VictoryKind = 'territory' | 'political';

export interface SimulationInit {
  map: MapData;
  playerCount: number;
  startingResources?: Stockpile;
  /** Unidades iniciais por jogador. */
  startingUnits?: UnitType[];
  /**
   * Todos os pares já começam em guerra (testes de combate). Na partida real a guerra só existe
   * depois de uma declaração formal validada pela camada nacional (ver `setWar`).
   */
  allAtWar?: boolean;
  /**
   * Batalha local de uma operação (Fase 8): mapa pequeno sem linhas de suprimento a manter, então
   * não há atrito por território inimigo.
   */
  battle?: boolean;
  /**
   * Rede elétrica (versão 1.1): começa com uma termelétrica ligada ao Centro de Comando por uma estrada com postes, e
   * as construções que dependem de luz param sem energia. Padrão: ligada, exceto nas batalhas locais.
   */
  power?: boolean;
  /** KAC-06: permutação secreta dos ids (só o servidor passa; ver `ids.ts`). */
  idCipher?: IdCipher | null;
}

/** Energia de um jogador (para o painel e a IA). */
export interface PlayerPower {
  supply: number;
  demand: number;
  served: number;
  /** Consumidoras que param e estão sem luz agora (sem malha por perto ou por falta de geração). */
  dark: number;
  /** Delas, as que estão longe de qualquer estrada, usina ou Centro de Comando. */
  isolated: number;
  /** Carvão queimado por minuto no ritmo atual. */
  coalPerMin: number;
}

export const NEUTRAL_MODIFIERS: TacticalModifiers = {
  constructionTimeMul: 1,
  productionTimeMul: 1,
  externalIncome: 0,
  territoryMul: 1,
};

/**
 * Ligação com a camada nacional, usada pelas melhorias de construções (Fase 4): pesquisas
 * concluídas, condições nacionais e a verba de obras do orçamento. Sem ligação (testes e
 * simulações isoladas) não há cobrança em dinheiro e os requisitos nacionais não são atendidos.
 */
export interface NationalLink {
  techs(slot: Slot): readonly string[];
  infrastructureIndex(slot: Slot): number;
  stability(slot: Slot): number;
  /** Verba de obras disponível (US$). */
  worksFundUsd(slot: Slot): number;
  /** Debita a verba; false se não houver saldo (nada é cobrado). */
  chargeWorks(slot: Slot, usd: number, description: string): boolean;
  refundWorks(slot: Slot, usd: number, description: string): void;
  /** Multiplicador do ritmo da pesquisa militar pelo orçamento nacional de P&D (padrão 1). */
  researchSpeed?(slot: Slot): number;
  /** Teto anual da verba de obras (US$): os custos em US$ das eras e dos grandes projetos são frações dele. */
  worksCapUsd?(slot: Slot): number;
}

/**
 * Estado completo da simulação tática em formato JSON (base do salvar/carregar). Inclui níveis,
 * especializações e obras de melhoria em andamento, estoques, depósitos, território e guerras.
 */
export interface SimulationSave {
  version: 1;
  map: MapData;
  tick: number;
  nextId: number;
  players: PlayerState[];
  entities: Entity[];
  winner: Slot | null;
  ended: boolean;
  wars: string[];
  alliances: string[];
  incidents?: [string, number][];
  difficulty?: Difficulty;
  eras?: boolean;
  /** Rede elétrica ligada (ausente nos salvamentos de antes dela: tudo fica com luz). */
  power?: boolean;
  powerState?: { powered: number[]; load: [number, number][]; coalDebt: number[]; info: PlayerPower[]; homes: { homes: number; lit: number }[] };
  roads?: { i: number; owner: Slot }[];
  victory?: VictoryKind | null;
  territoryHold?: number[];
  collapseDays?: number[];
  /** Quantidade restante de cada depósito, na ordem determinística de `findDeposits`. */
  depositsRemaining: number[];
  territory: number[];
  territoryVersion: number;
  lastAlertTick: number[];
  /** Comércio (Fase 6): ofertas, contratos, embarques e mercado dos países da IA. */
  trade?: TradeSave;
  /** Força aérea e mísseis (Fase 7). */
  air?: AirSave;
  mines?: MineSave;
  caravans?: CaravanSave;
  /** Militares fora do teatro em operações expedicionárias, por jogador (Fase 8). */
  detached?: number[];
  /** Salvas de foguetes ainda em voo. */
  salvos?: SalvoInFlight[];
  countries?: string[];
  battle?: boolean;
  sandbox?: SandboxState;
}

/** Resumo populacional de um jogador. */
export interface Population {
  citizens: number;
  employed: number;
  idle: number;
  /** Recrutas na reserva (tripulação disponível para unidades militares). */
  recruits: number;
  queuedRecruits: number;
  /** Unidades em campo. */
  military: number;
  /** Militares em formação (já com tripulação reservada). */
  queuedMilitary: number;
  queuedCitizens: number;
  total: number;
  /** Capacidade efetiva: min(habitação, 200). */
  cap: number;
  /** Habitação somada antes do teto absoluto. */
  housing: number;
}

/** Atrito por segundo (fração da vida máxima) em território inimigo sem linha de suprimento. */
export const ATTRITION_PER_SECOND = 0.012;
/** Raio (unidades de mundo) em que um blindado de transporte mantém a linha de suprimento. */
export const SUPPLY_LINE_RADIUS = 12;

const UNDER_ATTACK_ALERT_TICKS = TICK_RATE * 6;
/** Folga lateral (em células) ao esticar caminhos: a linha reta não raspa quinas bloqueadas. */
const PATH_CLEARANCE = 0.3;
/** Fração devolvida ao cancelar uma pesquisa militar. */
export const RESEARCH_CANCEL_REFUND = 0.75;
/** Fração do dano que atinge quem está no raio de uma arma de área. */
export const SPLASH_FRACTION = 0.6;

/** Multiplicador de dano de uma arma contra um alvo (antitanque contra veículos, etc.). */
/** Salva de foguetes disparada e ainda no ar: o dano cai na área de `at` no tick do impacto. */
export interface SalvoInFlight {
  owner: Slot;
  attackerId: EntityId;
  unitType: UnitType;
  targetId: EntityId;
  at: Vec2;
  impactTick: number;
  /** Dano base já com os pacotes de modernização do lançador. */
  base: number;
  /** Posição do lançador no disparo (contra-bateria). */
  from?: Vec2;
  /** Tick do disparo e foguetes que ainda voam (a antiaérea do Futuro Próximo derruba parte deles). */
  launchTick?: number;
  rockets?: number;
}

/**
 * Antiaérea Móvel do Futuro Próximo (era 4): intercepta salvas do Lança-Foguetes em voo com mísseis pequenos. Cada
 * antiaérea perto do ponto de impacto derruba metade dos foguetes que restam de uma salva (depois de 30% do voo) e
 * recarrega em 4 s; o dano da salva cai na mesma proporção, e uma salva toda derrubada não chega a cair.
 */
export const ROCKET_INTERCEPT = { era: 4, range: 9, share: 0.5, cooldownTicks: 4 * TICK_RATE, minProgress: 0.3 } as const;

/**
 * Phalanx CIWS Móvel (Era Digital): o Gatling guiado por radar derruba 40% dos foguetes que restam de uma salva que
 * vá cair perto dele (depois de 30% do voo), com 3 s entre rajadas. Funciona desde a entrada em serviço.
 */
export const CIWS_INTERCEPT = { range: 8, share: 0.4, cooldownTicks: 3 * TICK_RATE, minProgress: 0.3 } as const;

/** Regra de interceptação da unidade (antiaérea do Futuro Próximo ou CIWS), ou null. */
function interceptSpec(u: Unit): { range: number; share: number; cooldownTicks: number; minProgress: number } | null {
  if (u.type === 'ciws') return CIWS_INTERCEPT;
  if (u.type === 'mobile_aa' && (u.era ?? 1) >= ROCKET_INTERCEPT.era) return ROCKET_INTERCEPT;
  return null;
}

/** Preparo do lança-foguetes ao parar para atirar (estabilizar e erguer o casulo). */
export const SALVO_DEPLOY_TICKS = Math.round(1.4 * TICK_RATE);

/** Ticks de voo de uma salva: um instante na rampa mais o tempo de cruzar a distância. */
export function salvoFlightTicks(distance: number): number {
  return Math.round((0.9 + distance / 26) * TICK_RATE);
}

export function targetMultiplier(w: WeaponDef, target: Entity): number {
  if (target.kind === 'building') return w.vsBuilding ?? 1;
  return UNITS[target.type].armor === 'vehicle' ? (w.vsVehicle ?? 1) : (w.vsInfantry ?? 1);
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Modo Sandbox: os jogadores em `slots` (os humanos) têm recursos ilimitados, tudo pesquisado e
 * ferramentas livres; o QG não cai (a partida não termina por eliminação).
 */
export interface SandboxState {
  slots: Slot[];
  /** Obras, melhorias, produção e pesquisas em 1 tick. */
  instant: boolean;
  /** IA inimiga pensando e atacando (desligada, a base inimiga fica parada como alvo de testes). */
  aiActive: boolean;
  /** Mapa inteiro visível para os jogadores do Sandbox. */
  reveal: boolean;
}

/** Estoque mantido cheio no Sandbox (cada recurso, a cada tick). */
export const SANDBOX_STOCK = 99_999;
const techLabel = (id: string) => (isTechId(id) ? TECHNOLOGIES[id].label : id);

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
  /** KAC-06: permutação secreta dos ids (definida pelo servidor; sem ela, o id é o contador). Não vai no salvamento. */
  idCipher: IdCipher | null = null;

  /** Id publicado para o contador `n` do espaço `space` (ver `shared/sim/ids.ts`). */
  opaqueId(space: IdSpace, n: number): number {
    return this.idCipher ? this.idCipher(space, n) : n;
  }
  private lastAlertTick: number[];
  /** Salvas de foguetes em voo (o dano chega no impacto). */
  private salvos: SalvoInFlight[] = [];
  winner: Slot | null = null;
  ended = false;
  /** Pares em guerra formal ("a:b", a < b). Sem guerra não há disparo nem ordem de ataque. */
  private readonly wars = new Set<string>();
  /** Estradas construídas pelos jogadores (célula e dono, para a manutenção). */
  roads: { i: number; owner: Slot }[] = [];
  private roadSet: Set<number> | null = null;
  private roadSetSize = -1;
  /** Células das estradas dos jogadores (cache; as estradas só são acrescentadas). */
  get builtRoads(): Set<number> {
    if (!this.roadSet || this.roadSetSize !== this.roads.length) {
      this.roadSet = new Set(this.roads.map((r) => r.i));
      this.roadSetSize = this.roads.length;
    }
    return this.roadSet;
  }
  /** Rede elétrica ligada nesta partida (ver `power.ts`). */
  power = false;
  /** Padrão de `SimulationInit.power` (os testes de regra antigos o desligam em `shared/test/setup.ts`). */
  static powerByDefault = true;
  /** Consumidoras com luz no último cálculo da rede. */
  private powered = new Set<number>();
  /** Carga (0..1) de cada usina no último cálculo (o carvão queima conforme a carga). */
  private powerLoad = new Map<number, number>();
  /** Resumo da energia por jogador. */
  powerInfo: PlayerPower[] = [];
  /** Moradias com luz por jogador (aprovação). */
  private litHomes: { homes: number; lit: number }[] = [];
  /** Carvão queimado ainda não descontado (frações) por jogador. */
  private coalDebt: number[] = [];
  /** Como a partida foi vencida, quando não foi pela queda do QG. */
  victory: VictoryKind | null = null;
  /** Ticks seguidos com o domínio territorial (por jogador) e dias seguidos em colapso político. */
  territoryHold: number[] = [];
  collapseDays: number[] = [];

  roadCount(slot: Slot): number {
    let n = 0;
    for (const r of this.roads) if (r.owner === slot) n++;
    return n;
  }

  /** Incidentes de fronteira em curso ("a:b" → tick em que acabam). */
  private readonly incidents = new Map<string, number>();
  /** Dificuldade da IA (preparo, ondas, aviões e mísseis). */
  difficulty: Difficulty = 'normal';
  /**
   * Progressão por eras ligada (partidas da sala). Desligada (testes antigos, batalhas locais), tudo
   * fica liberado como na última era, mas o visual continua na era 1.
   */
  eras = false;
  /** Pares aliados: podem atravessar o território um do outro mesmo sem guerra. */
  private readonly alliances = new Set<string>();
  /** Depósitos naturais (quantidades finitas e limite de instalações). */
  readonly deposits: DepositIndex;
  /** Dono de cada célula (-1 = neutro), recalculado quando as fontes mudam. */
  territory: Int8Array;
  territoryVersion = 0;
  private territoryDirty = true;
  /** Camada nacional (pesquisas, condições e verba de obras), se houver. */
  national: NationalLink | null = null;
  /** Comércio internacional e logística. */
  readonly trade: TradeSystem = new TradeSystem(this);
  /** Força aérea, antiaérea e mísseis. */
  readonly air: AirSystem = new AirSystem(this);
  /** Minas antitanque e o trabalho dos engenheiros (lote 3). */
  readonly mines: MineSystem = new MineSystem(this);
  /** Caravanas internas entre o QG e as prefeituras. */
  readonly caravans: CaravanSystem = new CaravanSystem(this);
  /** Militares fora do teatro em operações expedicionárias (contam na população). */
  detached: number[] = [];
  /** Batalha local de uma operação (sem atrito territorial). */
  battle = false;
  /** Modo Sandbox (null numa partida normal). */
  sandbox: SandboxState | null = null;
  /** País de cada jogador (código ISO-3), para os nomes das cidades; vazio nos testes. */
  countries: string[] = [];

  /** Liga o comércio à diplomacia e ao tesouro nacionais. */
  setTradeLink(link: TradeLink | null): void {
    this.trade.link = link;
  }

  constructor(init: SimulationInit) {
    // antes de qualquer entidade nascer (o construtor já cria o QG e a usina inicial)
    this.idCipher = init.idCipher ?? null;
    this.map = init.map;
    this.grid = new Grid(init.map.width, init.map.height, init.map.cellSize, [...init.map.terrain]);
    this.battle = !!init.battle;
    this.power = init.power ?? (Simulation.powerByDefault && !init.battle);
    this.players = [];
    this.lastAlertTick = [];
    this.deposits = findDeposits(init.map);
    this.territory = new Int8Array(init.map.width * init.map.height).fill(NO_OWNER);
    for (let slot = 0; slot < init.playerCount; slot++) {
      const start = { ...(init.startingResources ?? STARTING_RESOURCES) };
      this.players.push({
        slot,
        resources: start,
        oilReserve: start.oil,
        citizens: STARTING_CITIZENS,
        recruits: STARTING_RECRUITS,
        hungry: false,
        upkeepAcc: { food: 0, supplies: 0, oil: 0 },
        unpaidUpkeep: { supplies: false, oil: false },
        incomeRemainder: emptyStockpile(),
        defeated: false,
        modifiers: { ...NEUTRAL_MODIFIERS },
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
      this.addBuilding('hq', slot, { cx: spawn.cx - 1, cy: spawn.cy - 1 }, 1);
      // o armazém inicial existe uma única vez, criado aqui no estado inicial da partida
      const toCenter = spawn.cx < init.map.width / 2 ? 1 : -1;
      const wh = { cx: toCenter > 0 ? spawn.cx + 3 : spawn.cx - 4, cy: spawn.cy - 1 };
      if (this.footprintFree(wh, BUILDINGS.warehouse.size)) this.addBuilding('warehouse', slot, wh, 1);
      if (this.power) this.placeStartingPower(slot, spawn);
    }
    this.recomputeTerritory();
    for (let slot = 0; slot < init.playerCount; slot++) {
      const hq = this.hqOf(slot)!;
      // começo enxuto: nenhuma tropa de combate, só um explorador para descobrir o mapa
      const units = init.startingUnits ?? ['scout'];
      for (const t of units) this.spawnUnitNear(hq, t);
      // o estoque inicial respeita a capacidade de armazenamento
      this.clampToCapacity(slot, 'capacity');
    }
    if (init.allAtWar) for (let a = 0; a < init.playerCount; a++) for (let b = a + 1; b < init.playerCount; b++) this.setWar(a, b, true);
  }

  /**
   * Começo da rede elétrica: uma termelétrica a carvão a poucas células do Centro de Comando, ligada a ele por uma
   * estrada pavimentada de 3 a 4 células (com postes). Tenta para cima/baixo (rumo ao meio do mapa) e depois para os
   * lados; se nada couber, a usina fica encostada no QG.
   */
  private placeStartingPower(slot: Slot, spawn: Cell): void {
    const w = this.map.width;
    const towardY = spawn.cy < this.map.height / 2 ? 1 : -1;
    const towardX = spawn.cx < w / 2 ? 1 : -1;
    // QG ocupa (cx−1..cx+1, cy−1..cy+1); usina 2×2
    const options: { road: Cell[]; plant: Cell }[] = [];
    for (const len of [4, 3]) {
      for (const dy of [towardY, -towardY]) {
        const road = Array.from({ length: len }, (_, k) => ({ cx: spawn.cx, cy: spawn.cy + dy * (2 + k) }));
        options.push({ road, plant: { cx: spawn.cx - (dy > 0 ? 0 : 1), cy: dy > 0 ? spawn.cy + 2 + len : spawn.cy - 2 - len - 1 } });
      }
      for (const dx of [-towardX, towardX]) {
        const road = Array.from({ length: len }, (_, k) => ({ cx: spawn.cx + dx * (2 + k), cy: spawn.cy }));
        options.push({ road, plant: { cx: dx > 0 ? spawn.cx + 2 + len : spawn.cx - 2 - len - 1, cy: spawn.cy - (dx > 0 ? 0 : 1) } });
      }
    }
    const cellFree = (c: Cell) => this.footprintFree(c, 1);
    for (const o of options) {
      if (!o.road.every(cellFree) || !this.footprintFree(o.plant, BUILDINGS.coal_plant.size)) continue;
      this.addBuilding('coal_plant', slot, o.plant, 1);
      for (const c of o.road) {
        const i = c.cy * w + c.cx;
        this.map.terrain[i] = Terrain.Road;
        this.grid.terrain[i] = Terrain.Road;
        this.roads.push({ i, owner: slot });
      }
      return;
    }
    for (let r = 2; r <= 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const c = { cx: spawn.cx + dx, cy: spawn.cy + dy };
          if (this.footprintFree(c, BUILDINGS.coal_plant.size)) {
            this.addBuilding('coal_plant', slot, c, 1);
            return;
          }
        }
  }

  footprintFree(cell: Cell, size: number): boolean {
    for (let y = cell.cy; y < cell.cy + size; y++)
      for (let x = cell.cx; x < cell.cx + size; x++) {
        if (!this.grid.inBounds(x, y) || !TERRAIN[this.grid.terrainAt(x, y)].buildable || this.grid.occupant(x, y) !== 0) return false;
      }
    return true;
  }

  // ---------------------------------------------------------------- salvar/carregar

  /** Cópia serializável (JSON) de todo o estado — não compartilha referências com a simulação. */
  toSave(): SimulationSave {
    const data: SimulationSave = {
      version: 1,
      map: this.map,
      tick: this.tick,
      nextId: this.nextId,
      players: this.players,
      entities: [...this.entities.values()],
      winner: this.winner,
      ended: this.ended,
      wars: [...this.wars],
      alliances: [...this.alliances],
      ...(this.incidents.size ? { incidents: [...this.incidents] } : {}),
      ...(this.difficulty !== 'normal' ? { difficulty: this.difficulty } : {}),
      ...(this.eras ? { eras: true } : {}),
      ...(this.power ? { power: true, powerState: { powered: [...this.powered], load: [...this.powerLoad], coalDebt: [...this.coalDebt], info: this.powerInfo.map((p) => ({ ...p })), homes: this.litHomes.map((h) => ({ ...h })) } } : {}),
      ...(this.roads.length ? { roads: this.roads.map((r) => ({ ...r })) } : {}),
      ...(this.victory ? { victory: this.victory } : {}),
      ...(this.territoryHold.some((v) => v > 0) ? { territoryHold: [...this.territoryHold] } : {}),
      ...(this.collapseDays.some((v) => v > 0) ? { collapseDays: [...this.collapseDays] } : {}),
      depositsRemaining: this.deposits.deposits.map((d) => d.remaining),
      territory: [...this.territory],
      territoryVersion: this.territoryVersion,
      lastAlertTick: this.lastAlertTick,
      trade: this.trade.toSave(),
      air: this.air.toSave(),
      ...(this.mines.mines.length || this.mines.tasks.length ? { mines: this.mines.toSave() } : {}),
      ...(this.caravans.caravans.length ? { caravans: this.caravans.toSave() } : {}),
      detached: [...this.detached],
      ...(this.salvos.length ? { salvos: this.salvos.map((v) => ({ ...v, at: { ...v.at } })) } : {}),
      ...(this.battle ? { battle: true } : {}),
      ...(this.countries.length ? { countries: [...this.countries] } : {}),
      ...(this.sandbox ? { sandbox: { ...this.sandbox, slots: [...this.sandbox.slots] } } : {}),
    };
    return JSON.parse(JSON.stringify(data, encodeNonFinite), decodeNonFinite) as SimulationSave;
  }

  /** Texto JSON do estado (para gravar em disco, banco ou enviar pela rede). */
  serialize(): string {
    return JSON.stringify(this.toSave(), encodeNonFinite);
  }

  static deserialize(text: string): Simulation {
    return Simulation.fromSave(JSON.parse(text, decodeNonFinite) as SimulationSave);
  }

  /** Reconstrói a simulação a partir de um estado salvo; continuar dela é idêntico a continuar da original. */
  static fromSave(saved: SimulationSave): Simulation {
    if (saved.version !== 1) throw new Error(`Versão de salvamento não suportada: ${String(saved.version)}`);
    const data = JSON.parse(JSON.stringify(saved, encodeNonFinite), decodeNonFinite) as SimulationSave;
    const sim = new Simulation({ map: data.map, playerCount: data.players.length, startingUnits: [], power: false });
    // descarta o estado inicial criado pelo construtor e aplica o salvo
    for (const b of sim.buildings) sim.grid.setOccupied(b.cell, BUILDINGS[b.type].size, 0);
    sim.entities.clear();
    sim.events = [];
    sim.tick = data.tick;
    sim.nextId = data.nextId;
    sim.players.splice(0, sim.players.length, ...data.players);
    // salvamentos de antes do carvão (versão 1.0) não tinham o recurso
    for (const p of sim.players) p.resources.coal ??= 0;
    for (const e of data.entities) {
      // salvamentos de antes da Fase 5 não tinham equipamento por unidade
      if (e.kind === 'unit') {
        e.mods ??= [];
        e.refit ??= null;
      }
      sim.entities.set(e.id, e);
      if (e.kind === 'building') sim.grid.setOccupied(e.cell, BUILDINGS[e.type].size, e.id);
    }
    sim.winner = data.winner;
    sim.ended = data.ended;
    sim.wars.clear();
    for (const k of data.wars) sim.wars.add(k);
    sim.alliances.clear();
    for (const k of data.alliances) sim.alliances.add(k);
    for (const [k, v] of data.incidents ?? []) sim.incidents.set(k, v);
    sim.difficulty = data.difficulty ?? 'normal';
    sim.eras = !!data.eras;
    sim.roads = (data.roads ?? []).map((r) => ({ ...r }));
    sim.victory = data.victory ?? null;
    sim.territoryHold = [...(data.territoryHold ?? [])];
    sim.collapseDays = [...(data.collapseDays ?? [])];
    for (const r of sim.roads) sim.grid.terrain[r.i] = Terrain.Road;
    data.depositsRemaining.forEach((v, i) => {
      const d = sim.deposits.deposits[i];
      if (d) d.remaining = v;
    });
    sim.territory = Int8Array.from(data.territory);
    sim.territoryVersion = data.territoryVersion;
    sim.territoryDirty = false;
    sim.lastAlertTick = data.lastAlertTick;
    sim.visibilityTick = -1;
    sim.trade.load(data.trade);
    sim.air.load(data.air);
    sim.mines.load(data.mines);
    sim.caravans.load(data.caravans);
    sim.detached = [...(data.detached ?? [])];
    sim.salvos = (data.salvos ?? []).map((v) => ({ ...v, at: { ...v.at } }));
    sim.battle = !!data.battle;
    sim.power = !!data.power;
    if (data.powerState) {
      sim.powered = new Set(data.powerState.powered);
      sim.powerLoad = new Map(data.powerState.load);
      sim.coalDebt = [...data.powerState.coalDebt];
      sim.powerInfo = data.powerState.info.map((p) => ({ ...p }));
      sim.litHomes = data.powerState.homes.map((h) => ({ ...h }));
    }
    sim.countries = [...(data.countries ?? [])];
    sim.sandbox = data.sandbox ? { ...data.sandbox, slots: [...data.sandbox.slots] } : null;
    return sim;
  }

  // ---------------------------------------------------------------- guerra

  setWar(a: Slot, b: Slot, atWar: boolean): void {
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (atWar) this.wars.add(k);
    else this.wars.delete(k);
  }

  /**
   * Há hostilidade entre lados em guerra formal ou durante um incidente de fronteira (prazo curto,
   * sem guerra declarada).
   */
  hostile(a: Slot, b: Slot): boolean {
    if (a === b) return false;
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    return this.wars.has(k) || (this.incidents.get(k) ?? -1) > this.tick;
  }

  /** Guerra declarada (sem contar incidentes de fronteira). */
  formalWar(a: Slot, b: Slot): boolean {
    return a !== b && this.wars.has(a < b ? `${a}:${b}` : `${b}:${a}`);
  }

  /** Incidente de fronteira em curso entre os dois (tick em que acaba), ou null. */
  incidentUntil(a: Slot, b: Slot): number | null {
    const until = this.incidents.get(a < b ? `${a}:${b}` : `${b}:${a}`);
    return until !== undefined && until > this.tick ? until : null;
  }

  /**
   * Incidente de fronteira (assédio no preparo): por `seconds`, os dois lados podem trocar tiros
   * como numa guerra, mas não há guerra declarada nem efeitos diplomáticos.
   */
  startIncident(aggressor: Slot, victim: Slot, seconds: number, pos: Vec2 | null): void {
    if (aggressor === victim || this.formalWar(aggressor, victim)) return;
    const k = aggressor < victim ? `${aggressor}:${victim}` : `${victim}:${aggressor}`;
    const untilTick = this.tick + Math.round(seconds * TICK_RATE);
    this.incidents.set(k, untilTick);
    this.emit({ type: 'border_incident', tick: this.tick, aggressor, victim, untilTick, pos: pos ? { ...pos } : null });
  }

  /** Fim do período de preparo da dificuldade escolhida (tick). */
  get prepTicks(): number {
    return prepTicks(this.difficulty);
  }

  setAlliance(a: Slot, b: Slot, allied: boolean): void {
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (allied) this.alliances.add(k);
    else this.alliances.delete(k);
  }

  allied(a: Slot, b: Slot): boolean {
    return a !== b && this.alliances.has(a < b ? `${a}:${b}` : `${b}:${a}`);
  }

  // ---------------------------------------------------------------- território

  territoryOwner(cx: number, cy: number): number {
    if (!this.grid.inBounds(cx, cy)) return NO_OWNER;
    return this.territory[cy * this.map.width + cx]!;
  }

  /** Pode entrar na célula: território neutro, próprio, de quem está em guerra com ele ou de aliado. */
  canEnter(slot: Slot, cx: number, cy: number): boolean {
    const o = this.territoryOwner(cx, cy);
    return o === NO_OWNER || o === slot || this.hostile(slot, o) || this.allied(slot, o);
  }

  private canEnterWorld(slot: Slot, p: Vec2): boolean {
    const c = this.grid.worldToCell(p);
    return this.canEnter(slot, c.cx, c.cy);
  }

  /** Fontes de território: edifícios concluídos com raio, ajustado pela pesquisa de cada dono. */
  territorySources(): TerritorySource[] {
    const cs = this.map.cellSize;
    const out: TerritorySource[] = [];
    for (const b of this.buildings) {
      const def = BUILDINGS[b.type];
      const radius = this.fx(b).territoryRadius;
      if (b.progress < 1 || b.hp <= 0 || radius <= 0) continue;
      const mul = this.players[b.owner]?.modifiers.territoryMul ?? 1;
      out.push({ owner: b.owner, x: b.pos.x / cs, y: b.pos.y / cs, radius: radius * mul, weight: def.territoryWeight });
    }
    return out;
  }

  private recomputeTerritory(): void {
    const next = computeTerritory(this.map.width, this.map.height, this.territorySources());
    let changed = false;
    for (let i = 0; i < next.length; i++) if (next[i] !== this.territory[i]) changed = true;
    this.territory = next;
    this.territoryDirty = false;
    if (changed) this.territoryVersion++;
  }

  // ---------------------------------------------------------------- população e estoques

  population(slot: Slot): Population {
    const p = this.players[slot];
    let employed = 0;
    let housing = 0;
    let military = 0;
    let queuedMilitary = 0;
    let queuedCitizens = 0;
    let queuedRecruits = 0;
    for (const e of this.entities.values()) {
      if (e.owner !== slot) continue;
      if (e.kind === 'unit') {
        military++;
        continue;
      }
      employed += e.workers;
      if (e.progress >= 1 && !e.unpaid) housing += this.fx(e).housing;
      for (const q of e.queue)
        if (q.unitType === 'citizen') queuedCitizens++;
        else if (q.unitType === 'recruit') queuedRecruits++;
        else queuedMilitary++;
    }
    // pilotos: cada aeronave (pronta, em missão ou em produção) ocupa um militar
    for (const a of this.air.aircraft) if (a.owner === slot) military++;
    military += this.detached[slot] ?? 0;
    const citizens = p?.citizens ?? 0;
    const recruits = p?.recruits ?? 0;
    return {
      citizens,
      employed,
      idle: Math.max(0, citizens - employed),
      recruits,
      queuedRecruits,
      military,
      queuedMilitary,
      queuedCitizens,
      total: citizens + recruits + military + queuedMilitary + queuedCitizens + queuedRecruits,
      cap: Math.min(POP_ABSOLUTE_CAP, housing),
      housing,
    };
  }

  /** Capacidade de armazenamento por recurso (edifícios concluídos). */
  capacity(slot: Slot): Stockpile {
    const cap = emptyStockpile();
    for (const b of this.buildings) {
      if (b.owner !== slot || b.progress < 1) continue;
      const st = this.fx(b).storage;
      for (const r of RESOURCE_TYPES) cap[r] += st[r] ?? 0;
    }
    return cap;
  }

  private tanks(slot: Slot): Building[] {
    return this.buildings.filter((b) => b.owner === slot && b.type === 'oil_tank' && b.progress >= 1 && b.hp > 0);
  }

  /**
   * Adiciona recurso respeitando a capacidade. Retorna o quanto entrou; o excedente não some em
   * silêncio: quem chama decide (pausar a produção) ou registra a perda.
   */
  private store(slot: Slot, r: ResourceType, amount: number): number {
    const p = this.players[slot]!;
    if (amount <= 0) return 0;
    if (r === 'oil') {
      let left = amount;
      const reserveCap = this.oilReserveCap(slot);
      const toReserve = Math.min(left, Math.max(0, reserveCap - p.oilReserve));
      p.oilReserve += toReserve;
      left -= toReserve;
      for (const t of this.tanks(slot)) {
        if (left <= 0) break;
        const add = Math.min(left, this.tankCapacity(t) - t.stored);
        if (add > 0) {
          t.stored += add;
          left -= add;
        }
      }
      const stored = amount - left;
      p.resources.oil += stored;
      return stored;
    }
    const free = Math.max(0, this.capacity(slot)[r] - p.resources[r]);
    const add = Math.min(free, amount);
    p.resources[r] += add;
    return add;
  }

  /** Capacidade de petróleo da reserva do QG (cresce com o nível do QG). */
  private oilReserveCap(slot: Slot): number {
    const hq = this.hqOf(slot);
    return hq ? (this.fx(hq).storage.oil ?? 0) : 0;
  }

  /** Capacidade de um tanque de petróleo (cresce com o nível do tanque). */
  tankCapacity(t: Building): number {
    return this.fx(t).storage.oil ?? 0;
  }

  /** Retira petróleo dos tanques (os mais cheios primeiro) e, por último, da reserva do QG. */
  private takeOil(p: PlayerState, amount: number): void {
    let left = amount;
    const tanks = this.tanks(p.slot).sort((a, b) => b.stored - a.stored); // estável: empate fica com o mais antigo
    for (const t of tanks) {
      if (left <= 0) break;
      const take = Math.min(left, t.stored);
      t.stored -= take;
      left -= take;
    }
    const fromReserve = Math.min(left, p.oilReserve);
    p.oilReserve -= fromReserve;
    p.resources.oil -= amount;
  }

  /** Corta o excedente acima da capacidade, registrando a perda (nunca em silêncio). */
  private clampToCapacity(slot: Slot, reason: 'destroyed' | 'capacity'): void {
    const p = this.players[slot]!;
    const cap = this.capacity(slot);
    for (const r of RESOURCE_TYPES) {
      if (r === 'oil') {
        const reserveCap = this.oilReserveCap(slot);
        if (p.oilReserve > reserveCap) {
          const lost = p.oilReserve - reserveCap;
          p.oilReserve = reserveCap;
          this.emit({ type: 'storage_lost', tick: this.tick, owner: slot, resource: 'oil', amount: Math.round(lost), reason });
        }
        p.resources.oil = p.oilReserve + this.tanks(slot).reduce((a, t) => a + t.stored, 0);
        continue;
      }
      if (p.resources[r] > cap[r]) {
        const lost = p.resources[r] - cap[r];
        p.resources[r] = cap[r];
        this.emit({ type: 'storage_lost', tick: this.tick, owner: slot, resource: r, amount: Math.round(lost), reason });
      }
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

  /**
   * Produção nominal por segundo de um edifício nas condições atuais (trabalhadores, fome,
   * território, depósito). Não considera estoque cheio — esse caso aparece no `status`.
   */
  /** Rede de estradas de cada dono (refeita a cada segundo de jogo e quando estradas ou fronteiras mudam). */
  private roadNet: { tick: number; version: number; nets: Map<Slot, Set<number>> } | null = null;

  /**
   * Edifício de produção (coleta, Refinaria, Siderúrgica) ligado por estrada contínua ao Centro de
   * Comando ou a uma prefeitura do dono: produz `ROAD.productionMul` vezes mais.
   */
  roadLinked(b: Building): boolean {
    const def = BUILDINGS[b.type];
    if (!def.gather && !def.process) return false;
    if (!this.roadNet || this.tick - this.roadNet.tick >= TICK_RATE || this.roadNet.version !== this.territoryVersion) this.roadNet = { tick: this.tick, version: this.territoryVersion, nets: new Map() };
    let net = this.roadNet.nets.get(b.owner);
    if (!net) {
      net = roadNetwork(this, b.owner);
      this.roadNet.nets.set(b.owner, net);
    }
    if (!net.size) return false;
    return roadRing(this, b).some((i) => net.has(i));
  }

  buildingRate(b: Building): number {
    const def = BUILDINGS[b.type];
    if (b.progress < 1 || !def.gather || b.unpaid) return 0;
    const p = this.players[b.owner]!;
    const eff = this.workEfficiency(b) * (p.hungry ? HUNGER_EFFICIENCY : 1) * (b.upgrade ? UPGRADE_WORK_EFFICIENCY : 1);
    if (eff <= 0) return 0;
    if (b.depositId !== null && (this.deposits.deposits[b.depositId]?.remaining ?? 0) <= 0) return 0;
    const cells = def.gather.terrain === null ? 1 : b.claims.filter((i) => this.territory[i] === b.owner).length;
    const hydro = this.hasProject(b.owner, 'hydro_dam') ? PROJECT_FX.hydroGatherMul : 1;
    const school = this.serviceCovers(b.owner, 'education', b.pos) ? SERVICES.educationGatherMul : 1;
    const road = this.roadLinked(b) ? ROAD.productionMul : 1;
    return gatherRate(b.type, cells) * this.fx(b).rateMul * eff * (p.modifiers.gatherMul ?? 1) * (this.bonusOf(b.owner).gatherMul?.[def.gather.resource] ?? 1) * hydro * school * road;
  }

  /**
   * Serviço com raio de cobertura (lote 1, §4): algum Hospital, Escola ou Delegacia própria, pronta,
   * com manutenção paga e trabalhadores, a até `SERVICES.radius` células do ponto.
   */
  serviceCovers(slot: Slot, kind: ServiceKind, pos: Vec2): boolean {
    const r = SERVICES.radius * this.map.cellSize;
    for (const s of this.buildings) {
      if (s.owner !== slot || BUILDINGS[s.type].service !== kind || s.progress < 1 || s.hp <= 0 || s.unpaid) continue;
      if (this.fx(s).workers > 0 && s.workers === 0) continue;
      if (dist(s.pos, pos) <= r) return true;
    }
    return false;
  }

  /** Fração das moradias prontas do jogador cobertas por cada serviço (aprovação nacional). */
  serviceCoverage(slot: Slot): Record<ServiceKind, number> {
    const homes = this.buildings.filter((b) => b.owner === slot && b.progress >= 1 && b.hp > 0 && (b.type === 'house' || b.type === 'residential'));
    const out: Record<ServiceKind, number> = { health: 0, education: 0, security: 0 };
    if (!homes.length) return out;
    for (const k of ['health', 'education', 'security'] as const) out[k] = homes.filter((h) => this.serviceCovers(slot, k, h.pos)).length / homes.length;
    return out;
  }

  /** Hospital: tropas próprias na área recuperam vida aos poucos (uma vez por segundo). */
  private updateServices(): void {
    if (this.tick % TICK_RATE !== 0) return;
    for (const u of this.units) {
      if (u.hp <= 0 || u.hp >= u.maxHp) continue;
      if (this.serviceCovers(u.owner, 'health', u.pos)) u.hp = Math.min(u.maxHp, u.hp + SERVICES.healPerSecond);
    }
  }

  /** Fração dos postos de trabalho ocupados (1 se o edifício não precisa de trabalhadores). */
  workEfficiency(b: Building): number {
    const need = this.fx(b).workers;
    return need > 0 ? Math.min(1, b.workers / need) : 1;
  }

  /** Valores funcionais do edifício no nível e especialização atuais (Fase 4). */
  fx(b: Building): BuildingEffects {
    return buildingEffects(b.type, b.level, b.spec);
  }

  /** Nível do Centro de Comando do jogador (0 se não houver). */
  hqLevel(slot: Slot): number {
    return this.hqOf(slot)?.level ?? 0;
  }

  /** Tudo o que a avaliação de uma melhoria precisa saber sobre o jogador. */
  upgradeWorld(slot: Slot): UpgradeWorld {
    const p = this.players[slot]!;
    const link = this.national;
    return {
      resources: p.resources,
      hqLevel: this.hqLevel(slot),
      bestLevel: (type) => {
        let best = 0;
        for (const b of this.buildings) if (b.owner === slot && b.type === type && b.progress >= 1 && b.hp > 0) best = Math.max(best, b.level);
        return best;
      },
      techs: link ? link.techs(slot) : null,
      infrastructureIndex: link ? link.infrastructureIndex(slot) : null,
      stability: link ? link.stability(slot) : null,
      fundsUsd: link ? link.worksFundUsd(slot) : null,
      constructionTimeMul: p.modifiers.constructionTimeMul,
      maxLevelByEra: ERAS[this.eraOf(slot)].maxUpgradeLevel,
      ...(this.isSandbox(slot) ? { sandbox: { instant: !!this.sandbox?.instant } } : {}),
    };
  }

  /** Próxima melhoria de um edifício (custo, requisitos, ganhos e o que impede). */
  upgradePlan(b: Building, spec: Parameters<typeof planUpgrade>[2] = null): UpgradePlan {
    return planUpgrade({ type: b.type, level: b.level, spec: b.spec, progress: b.progress, upgrading: b.upgrade !== null }, this.upgradeWorld(b.owner), spec);
  }

  /** Saldo por segundo de cada recurso: produção ativa menos consumo da população e manutenção. */
  incomePerSecond(slot: Slot): Stockpile {
    const inc = emptyStockpile();
    const p = this.players[slot];
    if (!p) return inc;
    inc.supplies += p.modifiers.externalIncome;
    for (const b of this.buildings) {
      if (b.owner !== slot || b.progress < 1) continue;
      const def = BUILDINGS[b.type];
      const fx = this.fx(b);
      for (const r of RESOURCE_TYPES) inc[r] += fx.income[r] ?? 0;
      for (const r of RESOURCE_TYPES) inc[r] -= fx.upkeep[r] ?? 0;
      if (def.gather && b.status === 'ok') inc[def.gather.resource] += this.buildingRate(b);
    }
    inc.food -= this.population(slot).total * FOOD_UPKEEP_PER_POP * (this.players[slot]!.modifiers.foodUpkeepMul ?? 1);
    return inc;
  }

  // ---------------------------------------------------------------- névoa de guerra

  private visibility: Uint8Array[] = [];
  private visibilityTick = -1;

  /** Grade de células visíveis para o jogador (1 = visível), recalculada a cada poucos ticks. */
  visibilityOf(slot: Slot): Uint8Array {
    if (this.visibilityTick !== this.tick || !this.visibility[slot]) this.recomputeVisibility();
    return this.visibility[slot] ?? new Uint8Array(this.map.width * this.map.height);
  }

  private recomputeVisibility(): void {
    const w = this.map.width;
    const h = this.map.height;
    const cs = this.map.cellSize;
    this.visibility = this.players.map(() => new Uint8Array(w * h));
    for (const e of this.entities.values()) {
      const grid = this.visibility[e.owner];
      if (!grid) continue;
      markCircle(grid, w, h, e.pos.x / cs, e.pos.y / cs, this.sightOf(e) / cs);
    }
    // aeronaves em voo enxergam a área embaixo delas enquanto passam
    for (const f of this.air.flightSights()) {
      const grid = this.visibility[f.owner];
      if (grid) markCircle(grid, w, h, f.pos.x / cs, f.pos.y / cs, f.sight / cs);
    }
    // reconhecimento aéreo: área revelada temporariamente
    for (const r of this.air.reveals) {
      const grid = this.visibility[r.owner];
      if (grid) markCircle(grid, w, h, r.pos.x / cs, r.pos.y / cs, r.radius / cs);
    }
    if (this.sandbox?.reveal) for (const slot of this.sandbox.slots) this.visibility[slot]?.fill(1);
    // satélite em órbita: o mapa inteiro, em tempo real
    for (const p of this.players) if (p.satellite) this.visibility[p.slot]?.fill(1);
    this.visibilityTick = this.tick;
  }

  /** Um ponto é visível para o jogador se estiver no raio de visão de alguma entidade sua. */
  isVisibleTo(slot: Slot, p: Vec2): boolean {
    const cs = this.map.cellSize;
    const cx = Math.floor(p.x / cs);
    const cy = Math.floor(p.y / cs);
    if (cx < 0 || cy < 0 || cx >= this.map.width || cy >= this.map.height) return false;
    return this.visibilityOf(slot)[cy * this.map.width + cx] === 1;
  }

  /** Entidade visível para o jogador: suas próprias, ou de outros em células visíveis (edifícios: qualquer célula). */
  canSee(slot: Slot, e: Entity): boolean {
    if (e.owner === slot) return true;
    if (e.kind === 'unit') return this.isVisibleTo(slot, e.pos);
    const vis = this.visibilityOf(slot);
    const size = BUILDINGS[e.type].size;
    for (let y = e.cell.cy; y < e.cell.cy + size; y++) for (let x = e.cell.cx; x < e.cell.cx + size; x++) if (vis[y * this.map.width + x] === 1) return true;
    return false;
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
    if (e.kind === 'unit') return UNITS[e.type].sight + combineMods(e.mods).sightAdd + (this.projectSight[e.owner] ?? 0);
    return BUILDINGS[e.type].sight + this.fx(e).sightAdd;
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
        const units = this.ownUnits(slot, cmd.unitIds, true);
        if (units.length === 0) return 'Nenhuma unidade válida';
        const tc = this.grid.worldToCell(this.clampToMap({ x: cmd.x, y: cmd.y }));
        if (!this.canEnter(slot, tc.cx, tc.cy)) return 'Território de outra nação: sem guerra ou aliança não é possível entrar';
        const targets = this.formationTargets(units, { x: cmd.x, y: cmd.y }).map((t) => this.nearestEnterable(slot, t) ?? t);
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
        const units = this.ownUnits(slot, cmd.unitIds, true);
        if (units.length === 0) return 'Nenhuma unidade válida';
        const target = this.entities.get(cmd.targetId);
        if (!target || target.owner === slot) return 'Alvo inválido';
        // unidades precisam estar à vista; edifícios inimigos já avistados podem ser alvo
        if (target.kind === 'unit' && !this.canSee(slot, target)) return 'Alvo fora de visão';
        if (!this.hostile(slot, target.owner)) return 'Sem estado de guerra com este país: declare guerra no globo antes de atacar';
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
        const units = this.ownUnits(slot, cmd.unitIds, true);
        if (units.length === 0) return 'Nenhuma unidade válida';
        for (const u of units) this.setIdle(u);
        return null;
      }
      case 'build': {
        const cell = { cx: cmd.cx, cy: cmd.cy };
        const reason = this.placementError(slot, cmd.buildingType, cell);
        if (reason) return reason;
        const def = BUILDINGS[cmd.buildingType];
        if (def.project && !this.isSandbox(slot) && this.national && !this.national.chargeWorks(slot, this.projectUsd(slot, cmd.buildingType), def.label))
          return 'Verba de obras insuficiente para o Grande Projeto';
        this.spend(player, this.buildingCostFor(slot, cmd.buildingType));
        const b = this.addBuilding(cmd.buildingType, slot, cell, 0);
        if (b.type === 'city_hall') b.city = this.nextCity(slot);
        this.emit({ type: 'construction_started', tick: this.tick, id: b.id, owner: slot, buildingType: b.type, pos: { ...b.pos } });
        return null;
      }
      case 'produce': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        const pop = this.population(slot);
        // mesma regra que o HUD usa para mostrar o motivo de um botão bloqueado
        const check = checkProduce(cmd.unitType, {
          buildingType: b.type,
          level: b.level,
          spec: b.spec,
          progress: b.progress,
          queueLength: b.queue.length,
          resources: player.resources,
          recruits: player.recruits,
          popTotal: pop.total,
          popCap: this.isSandbox(slot) ? Infinity : pop.cap,
          techs: this.national ? this.national.techs(slot) : null,
          militaryResearch: this.isSandbox(slot) ? MILITARY_RESEARCH_IDS : (player.militaryResearch ?? []),
          recruitCostMul: player.modifiers.recruitCostMul ?? 1,
          bonus: this.bonusOf(slot),
          era: this.eraOf(slot),
          ...(player.goods ? { goods: player.goods } : {}),
        });
        if (check.blocker) return check.blocker;
        const cost = check.cost;
        const bfx = this.fx(b);
        this.spend(player, cost);
        this.spendGoods(player, check.goods);
        if (cmd.unitType === 'citizen' || cmd.unitType === 'recruit') {
          const recruit = cmd.unitType === 'recruit';
          const def = recruit ? RECRUIT : CITIZEN;
          const ticks = this.duration(slot, def.buildSeconds * TICK_RATE * (recruit ? bfx.recruitTimeMul : 1));
          b.queue.push({ unitType: cmd.unitType, remainingTicks: ticks, totalTicks: ticks, paid: cost });
          return null;
        }
        const def = UNITS[cmd.unitType];
        player.recruits--;
        const ticks = this.duration(slot, def.buildSeconds * TICK_RATE * player.modifiers.productionTimeMul * bfx.productionTimeMul * (this.bonusOf(slot).unitTimeMul ?? 1));
        b.queue.push({ unitType: cmd.unitType, remainingTicks: ticks, totalTicks: ticks, paid: cost, mods: [...check.mods], ...(Object.keys(check.goods).length ? { goodsPaid: { ...check.goods } } : {}) });
        return null;
      }
      case 'military_research': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot || b.type !== 'research_center') return 'Centro de Pesquisa inválido';
        if (b.progress < 1 || b.hp <= 0) return 'O Centro de Pesquisa ainda está em obra';
        if (b.research) return 'Este centro já está pesquisando: aguarde ou cancele';
        const def = MILITARY_RESEARCH[cmd.researchId];
        const done = player.militaryResearch ?? [];
        // a mesma pesquisa não corre em dois centros ao mesmo tempo
        if (this.buildings.some((x) => x.owner === slot && x.research?.id === cmd.researchId)) return 'Pesquisa já em andamento em outro centro';
        const blocker = militaryResearchBlocker(cmd.researchId, done, b.level, this.eraOf(slot));
        if (blocker) return blocker;
        if (!canAfford(player.resources, def.cost)) return `Recursos insuficientes: faltam ${missingText(player.resources, def.cost)}`;
        this.spend(player, def.cost);
        const ticks = this.duration(slot, def.seconds * TICK_RATE);
        b.research = { id: cmd.researchId, remaining: ticks, total: ticks, paid: { ...def.cost } };
        return null;
      }
      case 'cancel_military_research': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot || !b.research) return 'Nenhuma pesquisa em andamento';
        const back: Cost = {};
        for (const r of RESOURCE_TYPES) if (b.research.paid[r]) back[r] = Math.floor((b.research.paid[r] ?? 0) * RESEARCH_CANCEL_REFUND);
        this.refund(slot, back);
        b.research = null;
        return null;
      }
      case 'lay_mine':
        return this.mines.lay(slot, cmd.unitIds, cmd.x, cmd.y);
      case 'build_road': {
        const plan = this.roadPlan(slot, cmd.cells);
        if (plan.error) return plan.error;
        const free = this.isSandbox(slot);
        if (!free && this.national && plan.usd > 0 && !this.national.chargeWorks(slot, plan.usd, `Estrada (${plan.cells.length} células)`)) return 'Verba de obras insuficiente para a estrada';
        if (!free) this.spend(player, { stone: plan.stone });
        for (const i of plan.cells) {
          this.map.terrain[i] = Terrain.Road;
          this.grid.terrain[i] = Terrain.Road;
          this.roads.push({ i, owner: slot });
        }
        // as estradas vão junto com as fronteiras no próximo snapshot
        this.territoryVersion++;
        return null;
      }
      case 'market_sell': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot || b.type !== 'market') return 'Terminal Comercial inválido';
        if (b.progress < 1 || b.hp <= 0) return 'O Terminal Comercial ainda está em obra';
        if (player.resources[cmd.resource] < cmd.quantity) return 'Estoque insuficiente para a venda';
        const pressure = (player.marketPressure ??= {});
        const gain = marketQuote(cmd.resource, pressure[cmd.resource] ?? 0, cmd.quantity);
        if (gain <= 0) return 'Venda pequena demais';
        const cap = this.capacity(slot).supplies;
        if (cap > 0 && player.resources.supplies + gain > cap) return 'Sem espaço para os suprimentos no armazém';
        // venda não é gasto: não entra nas estatísticas de recursos gastos
        if (cmd.resource === 'oil') this.takeOil(player, cmd.quantity);
        else player.resources[cmd.resource] -= cmd.quantity;
        pressure[cmd.resource] = (pressure[cmd.resource] ?? 0) + cmd.quantity;
        this.store(slot, 'supplies', gain);
        return null;
      }
      case 'market_buy': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot || b.type !== 'market') return 'Terminal Comercial inválido';
        if (b.progress < 1 || b.hp <= 0) return 'O Terminal Comercial ainda está em obra';
        const demand = (player.marketDemand ??= {});
        const price = marketBuyQuote(cmd.resource, demand[cmd.resource] ?? 0, cmd.quantity);
        if (player.resources.supplies < price) return `Suprimentos insuficientes: a compra custa ${price}`;
        const room = this.capacity(slot)[cmd.resource] - player.resources[cmd.resource];
        if (room < cmd.quantity) return 'Sem espaço no armazém para a compra';
        // compra também não entra nas estatísticas de gasto e coleta (é troca, não produção)
        player.resources.supplies -= price;
        this.store(slot, cmd.resource, cmd.quantity);
        demand[cmd.resource] = (demand[cmd.resource] ?? 0) + cmd.quantity;
        return null;
      }
      case 'space_launch': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot || b.type !== 'space_center') return 'Programa Espacial inválido';
        if (b.progress < 1 || b.hp <= 0) return 'O Programa Espacial ainda está em obra';
        if (b.launch) return 'Lançamento já em andamento';
        if (player.satellite) return 'O satélite já está em órbita';
        b.launch = { phase: 'countdown', ticks: Math.round(SPACE.countdownSeconds * TICK_RATE) };
        this.emit({ type: 'space', tick: this.tick, owner: slot, id: b.id, state: 'countdown', pos: { ...b.pos } });
        return null;
      }
      case 'advance_era': {
        const err = this.eraBlocker(slot);
        if (err) return err;
        const to = ((player.era ?? 1) + 1) as Era;
        const def = ERAS[to];
        const hq = this.hqOf(slot);
        if (!hq) return 'Sem Centro de Comando';
        const free = this.isSandbox(slot);
        if (!free && this.national && !this.national.chargeWorks(slot, this.eraUsd(slot, to), `Avanço para ${eraPhrase(to)}`)) return 'Verba de obras insuficiente para o avanço de era';
        if (!free) this.spend(player, def.cost);
        const ticks = free && this.sandbox?.instant ? 1 : this.duration(slot, def.seconds * TICK_RATE);
        player.eraAdvance = { to, remainingTicks: ticks, totalTicks: ticks, paid: free ? {} : { ...def.cost }, usd: free ? 0 : this.eraUsd(slot, to) };
        this.emit({ type: 'era', tick: this.tick, owner: slot, era: to, state: 'started', pos: { ...hq.pos } });
        return null;
      }
      case 'cancel_era': {
        const a = player.eraAdvance;
        if (!a) return 'Nenhum avanço de era em andamento';
        const back: Cost = {};
        for (const r of RESOURCE_TYPES) if (a.paid[r]) back[r] = Math.floor((a.paid[r] ?? 0) * ERA_CANCEL_REFUND);
        this.refund(slot, back);
        if (a.usd > 0) this.national?.refundWorks(slot, Math.floor(a.usd * ERA_CANCEL_REFUND), `Avanço de era cancelado`);
        player.eraAdvance = null;
        const hq = this.hqOf(slot);
        this.emit({ type: 'era', tick: this.tick, owner: slot, era: a.to, state: 'cancelled', pos: hq ? { ...hq.pos } : { x: 0, y: 0 } });
        return null;
      }
      case 'cancel_production': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        const item = b.queue.pop();
        if (!item) return 'Fila vazia';
        this.refund(slot, item.paid ?? (item.unitType === 'citizen' ? CITIZEN.cost : item.unitType === 'recruit' ? RECRUIT.cost : UNITS[item.unitType].cost));
        if (item.goodsPaid) this.refundGoods(player, item.goodsPaid);
        if (item.unitType !== 'citizen' && item.unitType !== 'recruit') player.recruits++; // a tripulação volta à reserva
        return null;
      }
      case 'set_workers': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        const need = this.fx(b).workers;
        if (need === 0) return 'Este edifício não emprega trabalhadores';
        b.workerTarget = Math.max(0, Math.min(need, Math.floor(cmd.count)));
        this.staff(slot);
        return null;
      }
      case 'assign_workers': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        const need = this.fx(b).workers;
        if (need === 0) return 'Este edifício não emprega trabalhadores';
        if (b.progress < 1 || b.hp <= 0) return 'O edifício ainda está em obra';
        if (b.workers >= need) return 'Sem vagas: o edifício já tem todos os trabalhadores';
        let idle = this.population(slot).idle;
        let moved = 0;
        for (const src of cmd.sources) {
          if (b.workers >= need) break;
          if (src === 0) {
            if (idle <= 0) continue;
            idle--;
          } else {
            const from = this.entities.get(src);
            if (!from || from === b || from.kind !== 'building' || from.owner !== slot || from.workers <= 0) continue;
            from.workers--;
            // realocação: o posto de origem não puxa outro cidadão no lugar
            from.workerTarget = Math.min(from.workerTarget, from.workers);
          }
          b.workers++;
          moved++;
        }
        if (!moved) return 'Nenhum cidadão disponível para esse trabalho';
        b.workerTarget = Math.max(b.workerTarget, b.workers);
        this.staff(slot);
        return null;
      }
      case 'upgrade': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot || b.hp <= 0) return 'Edifício inválido';
        const plan = this.upgradePlan(b, cmd.spec ?? null);
        if (plan.blocker || plan.toLevel === null) return plan.blocker ?? 'Melhoria indisponível';
        const spec = plan.specChoice ? (cmd.spec ?? null) : null;
        // verba nacional primeiro: se o orçamento recusar, nada é debitado do teatro
        if (this.national && plan.usd > 0 && !this.national.chargeWorks(slot, plan.usd, `${BUILDINGS[b.type].label} → nível ${plan.toLevel}`)) {
          return 'Verba de obras insuficiente no orçamento nacional';
        }
        this.spend(player, plan.cost);
        const total = this.duration(slot, plan.seconds * TICK_RATE);
        b.upgrade = { toLevel: plan.toLevel, spec, builtTicks: 0, totalTicks: total, paid: { ...plan.cost }, usd: plan.usd };
        this.emit({ type: 'upgrade_started', tick: this.tick, id: b.id, owner: slot, buildingType: b.type, toLevel: plan.toLevel, spec, usd: plan.usd, pos: { ...b.pos } });
        return null;
      }
      case 'cancel_upgrade': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        const work = b.upgrade;
        if (!work) return 'Nenhuma obra de melhoria em andamento';
        b.upgrade = null;
        const back: Cost = {};
        for (const r of RESOURCE_TYPES) if (work.paid[r]) back[r] = Math.floor(work.paid[r]! * UPGRADE_CANCEL_REFUND);
        this.refund(slot, back);
        if (this.national && work.usd > 0) this.national.refundWorks(slot, Math.floor(work.usd * UPGRADE_CANCEL_REFUND), `${BUILDINGS[b.type].label}: obra cancelada`);
        this.emit({ type: 'upgrade_cancelled', tick: this.tick, id: b.id, owner: slot, buildingType: b.type, toLevel: work.toLevel, pos: { ...b.pos } });
        return null;
      }
      case 'set_rally': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== slot) return 'Edifício inválido';
        b.rally = this.clampToMap({ x: cmd.x, y: cmd.y });
        return null;
      }
      case 'modernize': {
        const units = this.ownUnits(slot, cmd.unitIds);
        if (units.length === 0) return 'Nenhuma unidade válida';
        // cada unidade é avaliada com o saldo que sobrou das anteriores; basta uma começar
        let started = 0;
        let firstError: string | null = null;
        for (const u of units) {
          const facility = this.refitFacility(u);
          const check = checkModernize(cmd.mod, this.modernizeContext(u, facility));
          if (check.blocker || !facility.ok) {
            firstError ??= check.blocker ?? 'Sem instalação compatível';
            continue;
          }
          const def = MODS[cmd.mod];
          if (this.national && check.usd > 0 && !this.national.chargeWorks(slot, check.usd, `${UNITS[u.type].label}: ${def.label}`)) {
            firstError ??= 'Verba de obras insuficiente no orçamento nacional';
            continue;
          }
          this.spend(player, check.cost);
          const total = this.duration(slot, check.seconds * TICK_RATE);
          this.setIdle(u);
          u.refit = { mod: cmd.mod, facilityId: facility.id, remainingTicks: total, totalTicks: total, paid: { ...check.cost }, usd: check.usd };
          this.emit({ type: 'modernize_started', tick: this.tick, id: u.id, owner: slot, unitType: u.type, mod: cmd.mod, usd: check.usd, pos: { ...u.pos } });
          started++;
        }
        return started > 0 ? null : (firstError ?? 'Nenhuma unidade pode receber este pacote');
      }
      case 'trade_offer': {
        return this.trade.propose(slot, {
          partner: cmd.partner,
          side: cmd.side,
          resource: cmd.resource,
          quantity: cmd.quantity,
          price: cmd.price,
          mode: cmd.mode,
          days: cmd.days,
          ...(cmd.counterOf !== undefined ? { counterOf: cmd.counterOf } : {}),
        });
      }
      case 'trade_respond':
        return this.trade.respond(slot, cmd.offerId, cmd.accept);
      case 'trade_withdraw':
        return this.trade.withdraw(slot, cmd.offerId);
      case 'trade_cancel':
        return this.trade.cancel(slot, cmd.contractId);
      case 'build_aircraft':
        return this.air.build(slot, cmd.buildingId, cmd.aircraftType);
      case 'air_mission':
        return this.air.launchMission(slot, cmd.buildingId, cmd.aircraftIds, cmd.mission, {
          ...(cmd.targetId !== undefined ? { buildingId: cmd.targetId } : {}),
          ...(cmd.x !== undefined && cmd.y !== undefined ? { x: cmd.x, y: cmd.y } : {}),
        });
      case 'build_missile':
        return this.air.buildMissile(slot, cmd.buildingId, !!cmd.nuclear);
      case 'missile_prepare':
        return this.air.prepare(slot, cmd.buildingId, cmd.x, cmd.y, !!cmd.nuclear);
      case 'missile_authorize':
        return this.air.authorize(slot, cmd.launchId);
      case 'missile_abort':
        return this.air.abort(slot, cmd.launchId);
      case 'sandbox_toggle':
      case 'sandbox_spawn':
      case 'sandbox_level':
      case 'sandbox_maxout':
      case 'sandbox_remove':
      case 'sandbox_clear':
        return this.isSandbox(slot) ? this.sandboxCommand(slot, cmd) : 'Ferramenta disponível só no modo Sandbox';
      case 'launch_operation':
      case 'operation_retreat':
        // operações expedicionárias envolvem a camada nacional: tratadas pelo servidor (OperationsSystem)
        return 'Operações expedicionárias exigem a camada nacional';
      case 'cancel_modernize': {
        const units = this.ownUnits(slot, cmd.unitIds).filter((u) => u.refit);
        if (units.length === 0) return 'Nenhuma modernização em andamento';
        for (const u of units) this.cancelRefit(u, 'player');
        return null;
      }
    }
  }

  // ---------------------------------------------------------------- modernização (Fase 5)

  /** Instalação compatível mais próxima com vaga livre (mesma regra do HUD), ou o motivo de não haver. */
  refitFacility(u: Unit): FacilityPick {
    const cs = this.grid.cellSize;
    const facilities = this.buildings.map((b) => ({
      id: b.id,
      type: b.type,
      owner: b.owner,
      ready: b.progress >= 1 && b.hp > 0,
      level: b.level,
      x: b.pos.x,
      y: b.pos.y,
      half: (BUILDINGS[b.type].size * cs) / 2,
    }));
    return pickRefitFacility({ type: u.type, owner: u.owner, x: u.pos.x, y: u.pos.y }, facilities, (id) => this.refitsAt(id));
  }

  /** Modernizações em andamento numa instalação. */
  refitsAt(facilityId: EntityId): number {
    let n = 0;
    for (const u of this.units) if (u.refit?.facilityId === facilityId) n++;
    return n;
  }

  /** Contexto da regra de modernização para uma unidade (o mesmo que o HUD monta no cliente). */
  modernizeContext(u: Unit, facility = this.refitFacility(u)): ModernizeContext {
    const link = this.national;
    return {
      unitType: u.type,
      mods: u.mods,
      refitting: u.refit !== null,
      techs: link ? link.techs(u.owner) : null,
      facility,
      resources: this.players[u.owner]!.resources,
      fundsUsd: link ? link.worksFundUsd(u.owner) : null,
    };
  }

  private cancelRefit(u: Unit, reason: 'player' | 'facility_lost'): void {
    const r = u.refit;
    if (!r) return;
    u.refit = null;
    const back: Cost = {};
    for (const res of RESOURCE_TYPES) if (r.paid[res]) back[res] = Math.floor(r.paid[res]! * MOD_CANCEL_REFUND);
    this.refund(u.owner, back);
    if (this.national && r.usd > 0) this.national.refundWorks(u.owner, Math.floor(r.usd * MOD_CANCEL_REFUND), `${UNITS[u.type].label}: modernização cancelada`);
    this.emit({ type: 'modernize_cancelled', tick: this.tick, id: u.id, owner: u.owner, unitType: u.type, mod: r.mod, reason, pos: { ...u.pos } });
  }

  /** Avança as modernizações; a unidade fica parada até terminar. Instalação perdida cancela a obra. */
  private updateRefits(): void {
    for (const u of this.units) {
      const r = u.refit;
      if (!r || u.hp <= 0) continue;
      const f = this.entities.get(r.facilityId);
      if (!f || f.kind !== 'building' || f.hp <= 0) {
        this.cancelRefit(u, 'facility_lost');
        continue;
      }
      if (--r.remainingTicks > 0) continue;
      u.refit = null;
      // modernizada, a unidade passa ao visual da era atual do dono
      const ve = this.visualEra(u.owner);
      if (ve > 1) u.era = ve;
      if (u.mods.includes(r.mod)) continue;
      u.mods.push(r.mod);
      // a vida cresce na mesma proporção da vida máxima (o pacote não "cura" a unidade)
      const mul = MODS[r.mod].effects.hpMul ?? 1;
      if (mul !== 1) {
        u.maxHp = Math.round(u.maxHp * mul);
        u.hp = Math.min(u.maxHp, u.hp * mul);
      }
      this.emit({ type: 'unit_modernized', tick: this.tick, id: u.id, owner: u.owner, unitType: u.type, mod: r.mod, pos: { ...u.pos } });
    }
  }

  /** Debita um custo (o chamador já verificou o saldo). Petróleo sai dos tanques e da reserva. */
  private spend(player: PlayerState, cost: Cost): void {
    for (const r of RESOURCE_TYPES) {
      const v = cost[r] ?? 0;
      if (v <= 0) continue;
      if (r === 'oil') this.takeOil(player, v);
      else player.resources[r] -= v;
      player.stats.resourcesSpent += v;
    }
  }

  /** Reembolso: respeita a capacidade; o que não couber é registrado como perda. */
  private refund(slot: Slot, cost: Cost): void {
    const p = this.players[slot]!;
    for (const r of RESOURCE_TYPES) {
      const v = cost[r] ?? 0;
      if (v <= 0) continue;
      const stored = this.store(slot, r, v);
      p.stats.resourcesSpent -= stored;
      if (stored < v) this.emit({ type: 'storage_lost', tick: this.tick, owner: slot, resource: r, amount: Math.round(v - stored), reason: 'capacity' });
    }
  }

  // ---------------------------------------------------------------- comércio (Fase 6)

  emitTrade(e: SimEvent): void {
    this.emit(e);
  }

  /** Retira mercadoria reservada para um contrato (petróleo sai só dos tanques). */
  takeForTrade(slot: Slot, r: ResourceType, amount: number): void {
    const p = this.players[slot]!;
    if (r === 'oil') {
      let left = amount;
      for (const t of this.tanks(slot).sort((a, b) => b.stored - a.stored)) {
        const take = Math.min(left, t.stored);
        t.stored -= take;
        left -= take;
      }
      p.resources.oil -= amount - left;
      return;
    }
    p.resources[r] -= amount;
  }

  /** Entrada de mercadoria (entrega ou reserva devolvida), respeitando a capacidade. */
  storeFromTrade(slot: Slot, r: ResourceType, amount: number): number {
    return this.store(slot, r, amount);
  }

  /** Há tropa ou torre em guerra com o jogador perto deste ponto? */
  hostileNear(slot: Slot, p: Vec2, range: number): boolean {
    for (const e of this.entities.values()) {
      if (e.hp <= 0 || !this.hostile(slot, e.owner)) continue;
      if (e.kind === 'building' && !BUILDINGS[e.type].weapon) continue;
      if (e.kind === 'building' && e.progress < 1) continue;
      if (dist(e.pos, p) <= range + this.entityRadius(e)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- força aérea e mísseis (Fase 7)

  /** Dano vindo de fora do combate terrestre (ataque aéreo, míssil). Retorna true se destruiu. */
  damageBuilding(b: Building, damage: number, attacker: Slot): boolean {
    return this.applyDamage(b, damage, attacker);
  }

  damageUnit(u: Unit, damage: number, attacker: Slot): boolean {
    return this.applyDamage(u, damage, attacker);
  }

  private applyDamage(target: Entity, damage: number, attacker: Slot): boolean {
    if (target.hp <= 0 || damage <= 0) return false;
    const dealt = Math.min(damage, target.hp);
    target.hp -= damage;
    this.players[attacker]!.stats.damageDealt += dealt;
    if (this.tick - (this.lastAlertTick[target.owner] ?? -Infinity) >= UNDER_ATTACK_ALERT_TICKS) {
      this.lastAlertTick[target.owner] = this.tick;
      this.emit({ type: 'under_attack', tick: this.tick, id: target.id, owner: target.owner, pos: { ...target.pos } });
    }
    if (target.hp <= 0) {
      this.markDestroyed(target, attacker);
      return true;
    }
    return false;
  }

  /** Edifício atingido por quem o dono não vê: guarda a origem do tiro (contra-bateria da IA). */
  private noteUnseenFire(target: Entity, attacker: Slot, from: Vec2): void {
    if (target.kind !== 'building' || this.isVisibleTo(target.owner, from)) return;
    const p = this.players[target.owner];
    if (p && p.slot !== attacker) p.unseenFire = { tick: this.tick, x: from.x, y: from.y };
  }

  /** Era que vale para as regras (sem eras ou no Sandbox: tudo liberado). */
  eraOf(slot: Slot): Era {
    if (!this.eras || this.isSandbox(slot)) return 4;
    return this.players[slot]?.era ?? 1;
  }

  /**
   * Validação e custo de um traçado de estrada: células em sequência (vizinhas, inclusive na
   * diagonal), em terreno construível e livre, no próprio território ou, fora dele (terra neutra ou
   * de um país em guerra), perto de um Engenheiro de Combate próprio. Células que já são estrada são
   * puladas sem custo.
   */
  roadPlan(slot: Slot, cells: readonly Cell[]): { cells: number[]; stone: number; usd: number; error: string | null } {
    const out: number[] = [];
    const fail = (error: string) => ({ cells: [], stone: 0, usd: 0, error });
    if (cells.length > ROAD.maxCells) return fail(`Traçado longo demais: até ${ROAD.maxCells} células por vez`);
    const engineers = this.units.filter((u) => u.owner === slot && u.type === 'engineer' && u.hp > 0);
    // células soltas valem (o jogador marca célula por célula ou arrasta um caminho)
    for (const c of cells) {
      if (!this.grid.inBounds(c.cx, c.cy)) return fail('Fora do mapa');
      const i = c.cy * this.map.width + c.cx;
      const t = this.map.terrain[i]!;
      if (t === Terrain.Road || out.includes(i)) continue;
      if (t !== Terrain.Plains && t !== Terrain.Fertile) return fail('Estradas só em planície ou solo fértil');
      if (this.grid.occupant(c.cx, c.cy) !== 0) return fail('Há uma construção no traçado');
      const owner = this.territory[i] ?? NO_OWNER;
      if (owner !== slot) {
        if (owner !== NO_OWNER && !this.hostile(slot, owner)) return fail('Território de outra nação: não é possível pavimentar');
        const center = this.grid.cellCenter(c);
        if (!engineers.some((u) => dist(u.pos, center) <= ROAD.engineerRange * this.map.cellSize)) return fail('Fora do território: só com um Engenheiro de Combate por perto');
      }
      out.push(i);
    }
    if (!out.length) return fail('O traçado já é estrada');
    const stone = out.length * ROAD.stonePerCell;
    const usd = Math.round((this.national?.worksCapUsd?.(slot) ?? 0) * ROAD.usdSharePerCell * out.length);
    if (!this.isSandbox(slot)) {
      if ((this.players[slot]?.resources.stone ?? 0) < stone) return { cells: out, stone, usd, error: `Pedra insuficiente: a estrada custa ${stone}` };
      if (this.national && this.national.worksFundUsd(slot) + 1e-6 < usd) return { cells: out, stone, usd, error: 'Verba de obras insuficiente para a estrada' };
    }
    return { cells: out, stone, usd, error: null };
  }

  /** A construção encosta numa estrada (alguma célula vizinha ao terreno dela é estrada). */
  touchesRoad(b: Building): boolean {
    const size = BUILDINGS[b.type].size;
    for (let dy = -1; dy <= size; dy++)
      for (let dx = -1; dx <= size; dx++) {
        if (dx >= 0 && dx < size && dy >= 0 && dy < size) continue;
        const cx = b.cell.cx + dx;
        const cy = b.cell.cy + dy;
        if (this.grid.inBounds(cx, cy) && this.map.terrain[cy * this.map.width + cx] === Terrain.Road) return true;
      }
    return false;
  }

  /** Moradias prontas do jogador e quantas delas ficam num "bairro pavimentado" (ligadas à estrada). */
  pavedHomes(slot: Slot): { homes: number; paved: number } {
    let homes = 0;
    let paved = 0;
    for (const b of this.buildings) {
      if (b.owner !== slot || b.progress < 1 || b.hp <= 0 || (b.type !== 'house' && b.type !== 'residential')) continue;
      homes++;
      if (this.touchesRoad(b)) paved++;
    }
    return { homes, paved };
  }

  /** Está em guerra formal com alguém (minas que sobram em paz pesam na aprovação). */
  atWarAny(slot: Slot): boolean {
    return this.players.some((p) => p.slot !== slot && this.formalWar(slot, p.slot));
  }

  /** Há um Engenheiro de Combate próprio perto da célula (obstáculos e estradas fora do território). */
  engineerNear(slot: Slot, cell: Cell): boolean {
    const c = this.grid.cellCenter(cell);
    return this.units.some((u) => u.owner === slot && u.type === 'engineer' && u.hp > 0 && dist(u.pos, c) <= ROAD.engineerRange * this.map.cellSize);
  }

  /** Custo em US$ de um Grande Projeto: fração do teto anual da verba de obras do país. */
  projectUsd(slot: Slot, type: BuildingType): number {
    return Math.round((this.national?.worksCapUsd?.(slot) ?? 0) * (BUILDINGS[type].project?.usdShare ?? 0));
  }

  /** O jogador tem este Grande Projeto pronto e de pé. */
  hasProject(slot: Slot, type: BuildingType): boolean {
    return this.buildings.some((b) => b.owner === slot && b.type === type && b.progress >= 1 && b.hp > 0);
  }

  /** Custo em US$ de entrar na era `to`: fração do teto anual da verba de obras do país. */
  eraUsd(slot: Slot, to: Era): number {
    return Math.round((this.national?.worksCapUsd?.(slot) ?? 0) * ERAS[to].usdShare);
  }

  /** Era da aparência das construções e tropas do jogador. */
  visualEra(slot: Slot): Era {
    return this.players[slot]?.era ?? 1;
  }

  /** Motivo para não poder avançar de era agora (mesma regra no painel), ou null. */
  eraBlocker(slot: Slot): string | null {
    const p = this.players[slot];
    if (!p) return 'Jogador inválido';
    const cur = p.era ?? 1;
    if (cur >= 4) return 'Já na última era';
    if (p.eraAdvance) return 'Avanço de era em andamento';
    const to = (cur + 1) as Era;
    const def = ERAS[to];
    if (this.isSandbox(slot)) return null;
    if (this.hqLevel(slot) < def.hqLevel) return `Requer o Centro de Comando no nível ${def.hqLevel}`;
    if (!canAfford(p.resources, def.cost)) return `Recursos insuficientes: faltam ${missingText(p.resources, def.cost)}`;
    if (this.national && this.national.worksFundUsd(slot) + 1e-6 < this.eraUsd(slot, to)) return 'Verba de obras insuficiente para o avanço de era';
    return null;
  }

  /** Bônus único do país do jogador (nenhum nos testes sem país). */
  bonusOf(slot: Slot): CountryBonus {
    return countryBonus(this.countries[slot]);
  }

  /** Recursos entregues ao jogador (recompensa de facção), até a capacidade de armazenamento. */
  grantResources(slot: Slot, cost: Cost): void {
    const p = this.players[slot];
    if (!p || p.defeated) return;
    for (const r of RESOURCE_TYPES) {
      const v = Math.floor(cost[r] ?? 0);
      if (v > 0) p.stats.resourcesGathered += this.store(slot, r, v);
    }
  }

  /** Petróleo derramado de um tanque atingido: nunca mais do que havia nele. Retorna o perdido. */
  loseTankOil(t: Building, amount: number): number {
    const lost = Math.max(0, Math.min(t.stored, amount));
    if (lost <= 0) return 0;
    t.stored -= lost;
    this.players[t.owner]!.resources.oil -= lost;
    this.emit({ type: 'storage_lost', tick: this.tick, owner: t.owner, resource: 'oil', amount: Math.round(lost), reason: 'attack' });
    return lost;
  }

  // ---------------------------------------------------------------- expedições (Fase 8)

  /**
   * Retira unidades do teatro para uma operação: só as próprias, vivas e fora de modernização.
   * Elas deixam de existir aqui e passam a contar como militares destacados (mesma população).
   */
  detachUnits(slot: Slot, ids: readonly EntityId[]): Unit[] {
    const out = this.ownUnits(slot, [...ids], true);
    for (const u of out) {
      this.entities.delete(u.id);
      this.detached[slot] = (this.detached[slot] ?? 0) + 1;
    }
    return out;
  }

  /** Militar destacado que não volta (baixa ou rendição). */
  releaseDetached(slot: Slot, count: number): void {
    this.detached[slot] = Math.max(0, (this.detached[slot] ?? 0) - count);
  }

  /** Volta de uma unidade destacada: reaparece junto ao QG com a vida e o equipamento que tinha. */
  returnUnit(slot: Slot, rec: { type: UnitType; hp: number; maxHp: number; mods: readonly ModId[] }): Unit | null {
    this.releaseDetached(slot, 1);
    const hq = this.hqOf(slot);
    if (!hq) return null;
    const u = this.spawnUnitNear(hq, rec.type, 1, rec.mods);
    if (!u) return null;
    u.maxHp = rec.maxHp;
    u.hp = Math.min(rec.maxHp, Math.max(1, rec.hp));
    return u;
  }

  /** Débito externo ao teatro (ex.: mobilização de uma declaração de guerra). Falha sem saldo. */
  spendResources(slot: Slot, cost: Cost): boolean {
    const p = this.players[slot];
    if (!p || !canAfford(p.resources, cost)) return false;
    this.spend(p, cost);
    return true;
  }

  surrender(slot: Slot): void {
    const p = this.players[slot];
    if (!p || p.defeated || this.ended) return;
    this.defeat(slot);
    this.checkVictory();
  }

  /** Custo do próximo edifício do tipo para o jogador (custo crescente pelos que ele já tem). */
  buildingCostFor(slot: Slot, type: BuildingType): Cost {
    return buildingCost(type, ownedOfType(this.buildings, slot, type));
  }

  /** Motivo pelo qual não se pode construir, ou null se a posição é válida. */
  placementError(slot: Slot, type: BuildingType, cell: Cell): string | null {
    const player = this.players[slot];
    if (!player) return 'Jogador inválido';
    const tech = BUILDINGS[type].requiresTech;
    if (tech && !(this.national?.techs(slot) ?? []).includes(tech)) return `Exige a pesquisa ${techLabel(tech)}`;
    const era = buildingEra(type);
    if (era > this.eraOf(slot)) return `Requer ${eraPhrase(era)} (avance de era no Centro de Comando)`;
    const bdef = BUILDINGS[type];
    if (bdef.project && this.buildings.some((b) => b.owner === slot && b.type === type)) return `${bdef.label}: só um por nação`;
    if (!this.isSandbox(slot)) {
      if (bdef.minHqLevel && this.hqLevel(slot) < bdef.minHqLevel) return `Requer o Centro de Comando no nível ${bdef.minHqLevel}`;
      if (bdef.project && this.national && this.national.worksFundUsd(slot) + 1e-6 < this.projectUsd(slot, type)) return 'Verba de obras insuficiente para o Grande Projeto';
    }
    return placementError(
      {
        width: this.map.width,
        height: this.map.height,
        cellSize: this.map.cellSize,
        terrain: this.map.terrain,
        resourceNodes: this.map.resourceNodes,
        buildings: this.buildings,
        units: this.units,
        resources: player.resources,
        territory: this.territory,
        // obstáculos: fora do território (terra neutra ou de quem está em guerra), perto de um engenheiro
        ...(BUILDINGS[type].engineerOutside && this.engineerNear(slot, cell) ? { outsideOk: (owner: number) => this.hostile(slot, owner) } : {}),
        deposits: this.deposits,
        builtRoads: this.builtRoads,
      },
      slot,
      type,
      cell,
    );
  }

  // ---------------------------------------------------------------- passo

  step(): void {
    if (this.ended) return;
    this.tick++;
    this.sandboxTopUp();
    if (this.territoryDirty) this.recomputeTerritory();
    if (this.tick % TICK_RATE === 0) for (const p of this.players) if (!p.defeated) this.staff(p.slot);
    this.updateEconomy();
    this.updateProcessing();
    this.updateServices();
    this.updateUpkeep();
    this.updateConstruction();
    this.updateUpgrades();
    this.updatePower();
    this.updateProduction();
    this.updateMilitaryResearch();
    this.updateEras();
    this.updateSpace();
    this.updateRefits();
    for (const p of this.players) {
      if (p.marketPressure) marketRecover(p.marketPressure);
      if (p.marketDemand) marketRecover(p.marketDemand);
    }
    this.trade.step();
    this.air.step();
    this.mines.step();
    this.caravans.step();
    for (const u of this.units) this.updateUnit(u);
    this.updateInterceptions();
    this.updateSalvos();
    this.updateAttrition();
    if (this.tick % TICK_RATE === 0) this.evacuateForeignTerritory();
    for (const b of this.buildings) this.updateBuildingWeapon(b);
    this.separateUnits();
    this.removeDead();
    this.checkVictory();
    this.updateTerritorialVictory();
    this.sandboxTopUp();
  }

  // ---------------------------------------------------------------- energia

  /** A construção tem luz (ou não depende dela). Sem a rede elétrica ligada, tudo tem luz. */
  isPowered(b: Building): boolean {
    if (!this.power || !POWER_USE[b.type]?.stops) return true;
    return this.powered.has(b.id);
  }

  /** Geração disponível agora de uma usina pronta (vento, sol, era e carvão no estoque). */
  powerGen(b: Building): number {
    const g = POWER_GEN[b.type];
    if (!g || b.progress < 1 || b.hp <= 0 || b.unpaid) return 0;
    const seconds = this.tick / TICK_RATE;
    switch (g.source) {
      case 'coal':
        return (this.players[b.owner]?.resources.coal ?? 0) >= 0.5 ? g.gen : 0;
      case 'wind':
        return g.gen * windFactor(seconds, b.id);
      case 'solar': {
        const era = this.players[b.owner]?.era ?? 1;
        return g.gen * dayLight(seconds).day * (era >= 3 ? POWER.solarEraMul : 1);
      }
      default:
        return g.gen;
    }
  }

  /** Recalcula a rede de cada jogador (a cada `POWER.everyTicks`) e queima o carvão das termelétricas a cada tick. */
  private updatePower(): void {
    if (!this.power) return;
    if (this.tick % POWER.everyTicks === 1 || this.powerInfo.length === 0) {
      this.powered = new Set();
      this.powerLoad = new Map();
      const w = this.map.width;
      for (const p of this.players) {
        const slot = p.slot;
        const roads: number[] = [];
        for (const r of this.roads) if (r.owner === slot) roads.push(r.i);
        const hubs: PowerNode[] = [];
        const nodes: PowerNode[] = [];
        let homes = 0;
        for (const b of this.buildings) {
          if (b.owner !== slot || b.progress < 1 || b.hp <= 0) continue;
          const node: PowerNode = { id: b.id, type: b.type, cx: b.cell.cx, cy: b.cell.cy, size: BUILDINGS[b.type].size, gen: this.powerGen(b), use: POWER_USE[b.type]?.use ?? 0 };
          if (b.type === 'hq' || POWER_GEN[b.type]) hubs.push(node);
          else if (node.use > 0) nodes.push(node);
          if (b.type === 'house' || b.type === 'residential') homes++;
        }
        // estradas do mapa dentro do território também levam a energia
        for (let i = 0; i < this.territory.length; i++) if (this.territory[i] === slot && this.map.terrain[i] === Terrain.Road) roads.push(i);
        const res = solvePower(w, this.map.height, roads, hubs, nodes);
        for (const id of res.powered) this.powered.add(id);
        for (const [id, l] of res.load) this.powerLoad.set(id, l);
        let dark = 0;
        let lit = 0;
        for (const n of nodes) {
          const on = res.powered.has(n.id);
          if (POWER_USE[n.type]?.stops && !on) dark++;
          if ((n.type === 'house' || n.type === 'residential') && on) lit++;
        }
        let coalPerSec = 0;
        for (const h of hubs) coalPerSec += (POWER_GEN[h.type]?.coal ?? 0) * (h.gen > 0 ? (res.load.get(h.id) ?? 0) : 0);
        const prev = this.powerInfo[slot];
        const isolated = nodes.filter((n) => POWER_USE[n.type]?.stops && res.isolated.has(n.id)).length;
        this.powerInfo[slot] = { supply: Math.round(res.supply), demand: res.demand, served: res.served, dark, isolated, coalPerMin: Math.round(coalPerSec * 60 * 10) / 10 };
        this.litHomes[slot] = { homes, lit };
        // aviso de apagão: quando construções começam a parar por falta de luz
        if (dark > 0 && (prev?.dark ?? 0) === 0 && this.tick > TICK_RATE * 5)
          this.emit({ type: 'blackout', tick: this.tick, owner: slot, dark, reason: res.supply < res.demand ? 'supply' : 'grid' });
      }
    }
    // carvão: cada termelétrica queima conforme a carga
    for (const b of this.buildings) {
      const g = POWER_GEN[b.type];
      if (!g?.coal || b.progress < 1 || b.hp <= 0) continue;
      const load = this.powerLoad.get(b.id) ?? 0;
      if (load <= 0) continue;
      const debt = (this.coalDebt[b.owner] ?? 0) + g.coal * load * TICK_SECONDS;
      const whole = Math.floor(debt);
      const p = this.players[b.owner]!;
      if (whole > 0) p.resources.coal = Math.max(0, p.resources.coal - whole);
      this.coalDebt[b.owner] = debt - whole;
    }
  }

  /** Moradias do jogador e quantas estão com luz (aprovação). */
  litHomesOf(slot: Slot): { homes: number; lit: number } {
    return this.litHomes[slot] ?? { homes: 0, lit: 0 };
  }

  /** Jogador com as regras do Sandbox (recursos ilimitados e tudo liberado). */
  isSandbox(slot: Slot): boolean {
    return !!this.sandbox?.slots.includes(slot);
  }

  /** Duração em ticks de uma obra/produção/pesquisa (1 tick no Sandbox instantâneo). */
  duration(slot: Slot, ticks: number): number {
    if (this.sandbox?.instant && this.isSandbox(slot)) return 1;
    return Math.max(1, Math.round(ticks));
  }

  /**
   * Sandbox: estoques sempre cheios (acima da capacidade), recrutas e cidadãos ociosos de sobra
   * e nada de fome ou manutenção atrasada. Roda no começo e no fim do tick.
   */
  sandboxTopUp(): void {
    if (!this.sandbox) return;
    for (const slot of this.sandbox.slots) {
      const p = this.players[slot];
      if (!p || p.defeated) continue;
      for (const r of RESOURCE_TYPES) p.resources[r] = SANDBOX_STOCK;
      p.oilReserve = SANDBOX_STOCK;
      p.recruits = Math.max(p.recruits, 60);
      let employed = 0;
      for (const b of this.buildings) if (b.owner === slot) employed += b.workers;
      p.citizens = Math.max(p.citizens, employed + 20);
      p.hungry = false;
      p.unpaidUpkeep = { supplies: false, oil: false };
      for (const b of this.buildings) if (b.owner === slot) b.unpaid = false;
    }
  }

  /** Comandos do Sandbox (o chamador já verificou que é um jogador do Sandbox). */
  private sandboxCommand(slot: Slot, cmd: Extract<Command, { type: `sandbox_${string}` }>): string | null {
    const sb = this.sandbox!;
    switch (cmd.type) {
      case 'sandbox_toggle': {
        const key: SandboxToggle = cmd.key;
        sb[key] = cmd.value;
        if (key === 'reveal') this.visibilityTick = -1;
        return null;
      }
      case 'sandbox_spawn': {
        const owner = cmd.enemy ? (this.players.find((p) => !sb.slots.includes(p.slot) && !p.defeated)?.slot ?? null) : slot;
        if (owner === null) return 'Não há um país inimigo nesta partida';
        const at = this.clampToMap({ x: cmd.x, y: cmd.y });
        const mods = cmd.maxed ? (Object.keys(MODS) as ModId[]).filter((m) => MODS[m].units.includes(cmd.unitType)) : [];
        const taken = new Set(this.units.map((u) => this.grid.index(...cellTuple(this.grid.worldToCell(u.pos)))));
        const origin = this.grid.worldToCell(at);
        let made = 0;
        for (let r = 0; r <= 8 && made < cmd.count; r++)
          for (let y = origin.cy - r; y <= origin.cy + r && made < cmd.count; y++)
            for (let x = origin.cx - r; x <= origin.cx + r && made < cmd.count; x++) {
              if (Math.max(Math.abs(x - origin.cx), Math.abs(y - origin.cy)) !== r) continue;
              if (!this.grid.isPassable(x, y) || taken.has(this.grid.index(x, y))) continue;
              taken.add(this.grid.index(x, y));
              this.addUnit(cmd.unitType, owner, this.grid.cellCenter({ cx: x, cy: y }), cmd.maxed ? this.maxedHpMul(cmd.unitType) : 1, mods);
              made++;
            }
        return made > 0 ? null : 'Sem espaço livre perto deste ponto';
      }
      case 'sandbox_level': {
        const b = this.entities.get(cmd.buildingId);
        if (!b || b.kind !== 'building') return 'Edifício inválido';
        const max = maxLevelOf(b.type);
        if (max <= 1) return 'Este edifício não tem melhorias';
        const level = Math.min(max, cmd.level);
        const track = upgradeTrack(b.type);
        const spec = track?.specLevel !== undefined && level >= track.specLevel ? (cmd.spec && track.specs?.some((x) => x.id === cmd.spec) ? cmd.spec : (b.spec ?? track.specs?.[0]?.id ?? null)) : null;
        const before = this.fx(b);
        b.progress = 1;
        b.upgrade = null;
        b.level = level;
        b.spec = spec;
        const after = this.fx(b);
        b.maxHp = after.maxHp;
        b.hp = after.maxHp;
        b.workerTarget = after.workers;
        if (after.territoryRadius !== before.territoryRadius) this.territoryDirty = true;
        this.staff(b.owner);
        this.emit({ type: 'upgrade_completed', tick: this.tick, id: b.id, owner: b.owner, buildingType: b.type, level: b.level, spec: b.spec, pos: { ...b.pos } });
        return null;
      }
      case 'sandbox_maxout': {
        let n = 0;
        for (const id of cmd.unitIds) {
          const u = this.entities.get(id);
          if (!u || u.kind !== 'unit') continue;
          const mods = (Object.keys(MODS) as ModId[]).filter((m) => MODS[m].units.includes(u.type));
          u.mods = mods;
          u.refit = null;
          u.maxHp = Math.round(UNITS[u.type].maxHp * this.maxedHpMul(u.type) * combineMods(mods).hpMul);
          u.hp = u.maxHp;
          n++;
        }
        return n > 0 ? null : 'Nenhuma unidade válida';
      }
      case 'sandbox_remove': {
        let n = 0;
        for (const id of cmd.ids) {
          const e = this.entities.get(id);
          if (!e || (e.kind === 'building' && e.type === 'hq')) continue;
          this.removeEntity(e);
          n++;
        }
        return n > 0 ? null : 'Nada para remover (o QG não pode ser removido)';
      }
      case 'sandbox_clear': {
        for (const u of this.units) if (cmd.who === 'mine' ? u.owner === slot : u.owner !== slot) this.removeEntity(u);
        return null;
      }
    }
  }

  /** Bônus de vida de uma unidade saída do produtor no nível máximo (melhor especialização). */
  private maxedHpMul(type: UnitType): number {
    const by = UNITS[type].producedBy;
    const level = maxLevelOf(by);
    const specs = upgradeTrack(by)?.specs ?? [];
    return Math.max(...[null, ...specs.map((x) => x.id)].map((spec) => buildingEffects(by, level, spec).unitHpMul));
  }

  /** Remove uma entidade sem destruição (Sandbox): sem explosão, sem perda contabilizada. */
  private removeEntity(e: Entity): void {
    this.entities.delete(e.id);
    if (e.kind === 'building') {
      this.grid.setOccupied(e.cell, BUILDINGS[e.type].size, 0);
      if (BUILDINGS[e.type].territoryRadius > 0 && e.progress >= 1) this.territoryDirty = true;
    }
  }

  /**
   * Distribui a força de trabalho: retira trabalhadores acima do alvo (ou de obras) e aloca
   * cidadãos ociosos nos postos vagos, na ordem de construção dos edifícios.
   */
  staff(slot: Slot): void {
    const p = this.players[slot]!;
    // ordem de construção = ordem de inserção (os ids não têm ordem: KAC-06)
    const mine = this.buildings.filter((b) => b.owner === slot);
    let employed = 0;
    for (const b of mine) {
      const limit = b.progress >= 1 && b.hp > 0 ? Math.min(b.workerTarget, this.fx(b).workers) : 0;
      if (b.workers > limit) b.workers = limit;
      employed += b.workers;
    }
    // menos cidadãos que empregos (ex.: perdas): libera dos edifícios mais novos
    for (let i = mine.length - 1; i >= 0 && employed > p.citizens; i--) {
      const b = mine[i]!;
      const cut = Math.min(b.workers, employed - p.citizens);
      b.workers -= cut;
      employed -= cut;
    }
    // cidadãos ociosos vão um a um, em rodízio, para os postos vagos (um edifício novo não fica parado
    // enquanto o mais antigo absorve todo mundo)
    let idle = p.citizens - employed;
    const open = mine.filter((b) => b.progress >= 1 && b.hp > 0 && Math.min(b.workerTarget, this.fx(b).workers) > b.workers);
    while (idle > 0 && open.length) {
      for (let i = 0; i < open.length && idle > 0; i++) {
        const b = open[i]!;
        b.workers++;
        idle--;
        if (b.workers >= Math.min(b.workerTarget, this.fx(b).workers)) open.splice(i--, 1);
      }
    }
  }

  private setStatus(b: Building, status: BuildingStatus): void {
    if (b.status === status) return;
    const before = b.status;
    b.status = status;
    if (status !== 'ok' && before === 'ok') {
      if (status === 'depleted') this.emit({ type: 'deposit_depleted', tick: this.tick, id: b.id, owner: b.owner, buildingType: b.type, pos: { ...b.pos } });
      else this.emit({ type: 'production_halted', tick: this.tick, id: b.id, owner: b.owner, buildingType: b.type, reason: status, pos: { ...b.pos } });
    }
  }

  /** Tanque próprio com espaço ao alcance de um poço (ou o motivo de não haver). */
  private tankFor(b: Building): { tank: Building | null; reason: BuildingStatus } {
    const cs = this.map.cellSize;
    const inRange = this.tanks(b.owner)
      .filter((t) => dist(t.pos, b.pos) / cs <= OIL_TANK_RANGE)
      .sort((x, y) => dist(x.pos, b.pos) - dist(y.pos, b.pos) || x.id - y.id);
    if (!inRange.length) return { tank: null, reason: 'no_tank' };
    const free = inRange.find((t) => t.stored < this.tankCapacity(t));
    return free ? { tank: free, reason: 'ok' } : { tank: null, reason: 'storage_full' };
  }

  /**
   * Produção: cada edifício de coleta rende conforme trabalhadores, território e depósito; o
   * produto só entra se houver onde guardar. Sem espaço, a produção pausa (status) em vez de
   * descartar. Depósitos finitos diminuem exatamente o que foi extraído.
   */
  private updateEconomy(): void {
    for (const p of this.players) {
      if (p.defeated) continue;
      // renda fixa (QG) e logística nacional: suprimentos, limitados pela capacidade
      let fixed = p.modifiers.externalIncome;
      for (const b of this.buildings) if (b.owner === p.slot && b.progress >= 1 && !b.unpaid) fixed += this.fx(b).income.supplies ?? 0;
      p.incomeRemainder.supplies += fixed * TICK_SECONDS;
      const whole = Math.floor(p.incomeRemainder.supplies + 1e-9);
      if (whole > 0) {
        const got = this.store(p.slot, 'supplies', whole);
        p.stats.resourcesGathered += got;
        p.incomeRemainder.supplies = got < whole ? Math.min(1, p.incomeRemainder.supplies - got) : p.incomeRemainder.supplies - whole;
      }
    }
    const cap = new Map<Slot, Stockpile>();
    for (const b of this.buildings) {
      const def = BUILDINGS[b.type];
      if (!def.gather || b.progress < 1 || b.hp <= 0) continue;
      const p = this.players[b.owner]!;
      if (p.defeated) continue;
      const deposit = b.depositId !== null ? this.deposits.deposits[b.depositId] : undefined;
      if (deposit && deposit.remaining <= 0) {
        this.setStatus(b, 'depleted');
        continue;
      }
      if (b.unpaid) {
        this.setStatus(b, 'unpaid');
        continue;
      }
      if (this.fx(b).workers > 0 && b.workers === 0) {
        this.setStatus(b, 'no_workers');
        continue;
      }
      const rate = this.buildingRate(b);
      if (rate <= 0) {
        this.setStatus(b, 'outside_territory');
        continue;
      }
      const r = def.gather.resource;
      let tank: Building | null = null;
      if (r === 'oil') {
        const t = this.tankFor(b);
        if (!t.tank) {
          this.setStatus(b, t.reason);
          continue;
        }
        tank = t.tank;
      } else {
        let c = cap.get(b.owner);
        if (!c) cap.set(b.owner, (c = this.capacity(b.owner)));
        if (p.resources[r] >= c[r]) {
          this.setStatus(b, 'storage_full');
          b.acc = Math.min(b.acc, 1);
          continue;
        }
      }
      this.setStatus(b, 'ok');
      b.acc += rate * TICK_SECONDS;
      const whole = Math.floor(b.acc + 1e-9);
      if (whole <= 0) continue;
      // a especialização pode desperdiçar (ou poupar) parte do depósito por unidade extraída
      const depletion = this.fx(b).depletionMul;
      let amount = Math.min(whole, deposit ? Math.floor(deposit.remaining / depletion + 1e-9) : whole);
      if (deposit && amount <= 0 && deposit.remaining > 0) amount = Math.min(whole, 1);
      if (tank) {
        amount = Math.min(amount, this.tankCapacity(tank) - tank.stored);
        tank.stored += amount;
        p.resources.oil += amount;
      } else {
        amount = this.store(b.owner, r, amount);
      }
      b.acc -= whole;
      if (deposit) deposit.remaining = Math.max(0, deposit.remaining - amount * depletion);
      p.stats.resourcesGathered += amount;
      // a mina tira carvão junto com o ferro (os veios dão os dois), sem gastar mais do depósito
      if (b.type === 'mine' && amount > 0) {
        b.coalAcc = (b.coalAcc ?? 0) + amount * POWER.coalPerIron;
        const coal = Math.floor(b.coalAcc + 1e-9);
        if (coal > 0) {
          b.coalAcc -= coal;
          p.stats.resourcesGathered += this.store(b.owner, 'coal', coal);
        }
      }
    }
  }

  /** Teto do estoque de bens industriais (cada usina pronta amplia). */
  goodsCap(slot: Slot): number {
    let plants = 0;
    for (const b of this.buildings) if (b.owner === slot && b.progress >= 1 && b.hp > 0 && BUILDINGS[b.type].process) plants++;
    return GOODS.baseCap + plants * GOODS.capPerPlant;
  }

  spendGoods(p: PlayerState, used: Partial<Goods>): void {
    if (!Object.keys(used).length) return;
    const g = (p.goods ??= emptyGoods());
    for (const t of GOODS_TYPES) g[t] = Math.max(0, g[t] - (used[t] ?? 0));
  }

  private refundGoods(p: PlayerState, paid: Partial<Goods>): void {
    const g = (p.goods ??= emptyGoods());
    for (const t of GOODS_TYPES) g[t] += paid[t] ?? 0;
  }

  /**
   * Cadeias produtivas (lote 1, §4): Refinaria e Siderúrgica com trabalhadores transformam o recurso
   * bruto em bem industrial, no ritmo proporcional aos postos ocupados, até o teto do estoque.
   */
  private updateProcessing(): void {
    for (const b of this.buildings) {
      const proc = BUILDINGS[b.type].process;
      if (!proc || b.progress < 1 || b.hp <= 0) continue;
      const p = this.players[b.owner]!;
      if (p.defeated) continue;
      if (b.unpaid) {
        this.setStatus(b, 'unpaid');
        continue;
      }
      const need = this.fx(b).workers;
      if (need > 0 && b.workers === 0) {
        this.setStatus(b, 'no_workers');
        continue;
      }
      if (!this.isPowered(b)) {
        this.setStatus(b, 'no_power');
        continue;
      }
      const goods = (p.goods ??= emptyGoods());
      const cap = this.goodsCap(b.owner);
      if (goods[proc.to] >= cap) {
        this.setStatus(b, 'storage_full');
        b.acc = Math.min(b.acc, 1);
        continue;
      }
      if (p.resources[proc.from] < 1) {
        this.setStatus(b, 'no_input');
        continue;
      }
      this.setStatus(b, 'ok');
      b.acc += proc.rate * (need > 0 ? b.workers / need : 1) * (this.roadLinked(b) ? ROAD.productionMul : 1) * TICK_SECONDS;
      const whole = Math.floor(b.acc + 1e-9);
      if (whole <= 0) continue;
      b.acc -= whole;
      const amount = Math.min(whole, Math.floor(p.resources[proc.from]), Math.floor(cap - goods[proc.to]));
      if (amount <= 0) continue;
      if (proc.from === 'oil') this.takeOil(p, amount);
      else p.resources[proc.from] -= amount;
      goods[proc.to] += amount;
    }
  }

  /**
   * Consumo de comida pela população e manutenção dos edifícios (suprimentos e petróleo), sem saldo
   * negativo. Sem saldo de um recurso, os edifícios que dependem dele param (e não abrigam/produzem).
   */
  private updateUpkeep(): void {
    for (const p of this.players) {
      if (p.defeated) continue;
      const pop = this.population(p.slot).total;
      p.upkeepAcc.food += pop * FOOD_UPKEEP_PER_POP * (p.modifiers.foodUpkeepMul ?? 1) * TICK_SECONDS;
      const food = Math.floor(p.upkeepAcc.food);
      if (food > 0) {
        p.upkeepAcc.food -= food;
        const eaten = Math.min(food, p.resources.food);
        p.resources.food -= eaten;
        const hungry = eaten < food;
        if (hungry && !p.hungry) this.emit({ type: 'shortage', tick: this.tick, owner: p.slot, resource: 'food' });
        p.hungry = hungry;
      }
      const mine = this.buildings.filter((b) => b.owner === p.slot && b.progress >= 1);
      let charged = false;
      for (const r of ['supplies', 'oil'] as const) {
        for (const b of mine) p.upkeepAcc[r] += (this.fx(b).upkeep[r] ?? 0) * TICK_SECONDS;
        // manutenção das aeronaves (Fase 7) e das estradas entra na mesma conta de suprimentos
        if (r === 'supplies') p.upkeepAcc[r] += (this.air.upkeepPerSecond(p.slot) + this.roadCount(p.slot) * ROAD.upkeepPerCell) * TICK_SECONDS;
        const due = Math.floor(p.upkeepAcc[r]);
        if (due <= 0) continue;
        charged = true;
        p.upkeepAcc[r] -= due;
        const paid = Math.min(due, p.resources[r]);
        if (r === 'oil') this.takeOil(p, paid);
        else p.resources[r] -= paid;
        const unpaid = paid < due;
        if (unpaid && !p.unpaidUpkeep[r]) this.emit({ type: 'shortage', tick: this.tick, owner: p.slot, resource: r });
        p.unpaidUpkeep[r] = unpaid;
      }
      // reavalia a cada cobrança (inclui edifícios novos ou recém-melhorados)
      if (!charged) continue;
      for (const b of mine) {
        const up = this.fx(b).upkeep;
        const unpaid = ((up.supplies ?? 0) > 0 && p.unpaidUpkeep.supplies) || ((up.oil ?? 0) > 0 && p.unpaidUpkeep.oil);
        if (unpaid && !b.unpaid) this.setStatus(b, 'unpaid');
        else if (!unpaid && b.unpaid) this.setStatus(b, 'ok');
        b.unpaid = unpaid;
      }
    }
  }

  private updateConstruction(): void {
    for (const b of this.buildings) {
      if (b.progress >= 1 || b.hp <= 0) continue;
      const def = BUILDINGS[b.type];
      const ticks = b.buildTicks;
      b.builtTicks++;
      b.progress = Math.min(1, b.builtTicks / ticks);
      b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * 0.9) / ticks);
      if (b.progress >= 1) {
        b.progress = 1;
        this.players[b.owner]!.stats.structuresBuilt++;
        if (def.territoryRadius > 0) this.territoryDirty = true;
        this.staff(b.owner);
        this.emit({ type: 'construction_completed', tick: this.tick, id: b.id, owner: b.owner, buildingType: b.type, pos: { ...b.pos } });
      }
    }
  }

  /**
   * Obras de melhoria (Fase 4): avançam no tempo de jogo; ao concluir, o edifício passa ao novo
   * nível e todos os efeitos são recalculados a partir dele (nunca somados ao estado anterior).
   */
  private updateUpgrades(): void {
    for (const b of this.buildings) {
      const work = b.upgrade;
      if (!work || b.hp <= 0 || b.progress < 1) continue;
      work.builtTicks++;
      if (work.builtTicks < work.totalTicks) continue;
      const before = this.fx(b);
      b.level = work.toLevel;
      if (work.spec) b.spec = work.spec;
      b.upgrade = null;
      const after = this.fx(b);
      // a vida cresce junto com a vida máxima (o dano já sofrido continua)
      b.maxHp = after.maxHp;
      b.hp = Math.max(1, Math.min(b.maxHp, b.hp + (after.maxHp - before.maxHp)));
      // novos postos ficam disponíveis se o jogador usava todos; redução de postos é respeitada
      if (b.workerTarget >= before.workers || b.workerTarget > after.workers) b.workerTarget = after.workers;
      if (after.territoryRadius !== before.territoryRadius) this.territoryDirty = true;
      this.staff(b.owner);
      // uma especialização que reduz capacidade corta o excedente (com registro, nunca em silêncio)
      const shrank = Object.keys(before.storage).some((r) => (after.storage[r as ResourceType] ?? 0) < (before.storage[r as ResourceType] ?? 0));
      if (shrank) this.clampToCapacity(b.owner, 'capacity');
      this.emit({ type: 'upgrade_completed', tick: this.tick, id: b.id, owner: b.owner, buildingType: b.type, level: b.level, spec: b.spec, pos: { ...b.pos } });
    }
  }

  private updateProduction(): void {
    for (const b of this.buildings) {
      if (b.progress < 1 || b.hp <= 0) continue;
      const item = b.queue[0];
      if (!item) continue;
      if (b.unpaid) {
        this.setStatus(b, 'unpaid');
        continue;
      }
      if (!this.isPowered(b)) {
        this.setStatus(b, 'no_power');
        continue;
      }
      // bases e fábricas produzem no ritmo dos trabalhadores alocados (sem nenhum, param);
      // durante uma obra de melhoria, a meio ritmo
      const eff = this.workEfficiency(b) * (this.players[b.owner]!.hungry ? HUNGER_EFFICIENCY : 1) * (b.upgrade ? UPGRADE_WORK_EFFICIENCY : 1);
      if (eff <= 0) {
        this.setStatus(b, 'no_workers');
        continue;
      }
      if (this.fx(b).workers > 0) this.setStatus(b, 'ok');
      b.acc += eff;
      const steps = Math.floor(b.acc + 1e-9);
      b.acc -= steps;
      item.remainingTicks -= steps;
      if (item.remainingTicks > 0) continue;
      if (item.unitType === 'citizen') {
        b.queue.shift();
        this.players[b.owner]!.citizens++;
        this.emit({ type: 'citizen_trained', tick: this.tick, owner: b.owner, pos: { ...b.pos } });
        continue;
      }
      if (item.unitType === 'recruit') {
        b.queue.shift();
        this.players[b.owner]!.recruits++;
        this.emit({ type: 'recruit_trained', tick: this.tick, owner: b.owner, pos: { ...b.pos } });
        continue;
      }
      const u = this.spawnUnitNear(b, item.unitType, this.fx(b).unitHpMul * (this.bonusOf(b.owner).unitHpMul?.[item.unitType] ?? 1), item.mods ?? []);
      if (!u) {
        item.remainingTicks = TICK_RATE; // sem espaço: tenta de novo em 1 s
        continue;
      }
      b.queue.shift();
      // Escola cobrindo o quartel ou a fábrica: a tropa sai como Veterana
      if ((u.rank ?? 0) < 1 && this.serviceCovers(b.owner, 'education', b.pos)) {
        u.kills = Math.max(u.kills ?? 0, RANKS[1]!.kills);
        u.rank = 1;
        u.maxHp = Math.round(u.maxHp * rankHpMul(1));
        u.hp = u.maxHp;
      }
      this.players[b.owner]!.stats.unitsProduced++;
      this.emit({ type: 'unit_produced', tick: this.tick, id: u.id, owner: u.owner, unitType: u.type, pos: { ...u.pos } });
      if (b.rally) {
        u.order = { kind: 'move', target: b.rally };
        if (!this.planPath(u, b.rally)) u.order = { kind: 'idle' };
      }
    }
  }

  /**
   * Pesquisa militar: avança no ritmo dos pesquisadores (sem nenhum, para), do nível do centro
   * (cada nível −10% de tempo) e do orçamento nacional de P&D. Concluída, libera as tropas.
   */
  /** Visão extra das tropas pela Rede 5G (recalculada a cada tick). */
  private projectSight: number[] = [];

  /** Programa Espacial: contagem, subida e satélite em órbita. */
  private updateSpace(): void {
    this.projectSight = this.players.map((p) => (this.hasProject(p.slot, 'network_5g') ? PROJECT_FX.network5gSight : 0));
    for (const b of this.buildings) {
      const l = b.launch;
      if (!l) continue;
      if (b.hp <= 0) {
        b.launch = null;
        continue;
      }
      if (--l.ticks > 0) continue;
      if (l.phase === 'countdown') {
        b.launch = { phase: 'ascent', ticks: Math.round(SPACE.ascentSeconds * TICK_RATE) };
        this.emit({ type: 'space', tick: this.tick, owner: b.owner, id: b.id, state: 'ascent', pos: { ...b.pos } });
      } else {
        b.launch = null;
        this.players[b.owner]!.satellite = { tick: this.tick };
        this.visibilityTick = -1;
        this.emit({ type: 'space', tick: this.tick, owner: b.owner, id: b.id, state: 'orbit', pos: { ...b.pos } });
      }
    }
  }

  /** Avanço de era: obra no Centro de Comando; ao concluir, a nação entra na era nova. */
  private updateEras(): void {
    for (const p of this.players) {
      const a = p.eraAdvance;
      if (!a || p.defeated) continue;
      const hq = this.hqOf(p.slot);
      if (!hq) continue;
      if (--a.remainingTicks > 0) continue;
      p.era = a.to;
      p.eraAdvance = null;
      this.emit({ type: 'era', tick: this.tick, owner: p.slot, era: a.to, state: 'completed', pos: { ...hq.pos } });
    }
  }

  private updateMilitaryResearch(): void {
    for (const b of this.buildings) {
      const r = b.research;
      if (!r || b.progress < 1 || b.hp <= 0) continue;
      if (b.unpaid) {
        this.setStatus(b, 'unpaid');
        continue;
      }
      if (!this.isPowered(b)) {
        this.setStatus(b, 'no_power');
        continue;
      }
      const eff = this.workEfficiency(b) * (this.players[b.owner]!.hungry ? HUNGER_EFFICIENCY : 1) * (b.upgrade ? UPGRADE_WORK_EFFICIENCY : 1);
      if (eff <= 0) {
        this.setStatus(b, 'no_workers');
        continue;
      }
      this.setStatus(b, 'ok');
      const speed = ((this.national?.researchSpeed?.(b.owner) ?? 1) * (this.hasProject(b.owner, 'network_5g') ? PROJECT_FX.network5gResearchMul : 1)) / Math.max(0.2, this.fx(b).productionTimeMul);
      r.remaining -= eff * speed;
      if (r.remaining > 1e-9) continue;
      const p = this.players[b.owner]!;
      p.militaryResearch = [...(p.militaryResearch ?? []), r.id];
      b.research = null;
      this.emit({ type: 'military_research_completed', tick: this.tick, owner: b.owner, researchId: r.id, pos: { ...b.pos } });
    }
  }

  /**
   * Atrito (como em Rise of Nations): unidades em território de um país com quem estão em guerra
   * perdem vida aos poucos, a menos que um blindado de transporte próprio esteja por perto
   * mantendo a linha de suprimento.
   */
  private updateAttrition(): void {
    if (this.battle) return;
    const apcs = this.units.filter((u) => u.type === 'apc');
    for (const u of this.units) {
      const c = this.grid.worldToCell(u.pos);
      const owner = this.territoryOwner(c.cx, c.cy);
      const hostileGround = owner !== NO_OWNER && owner !== u.owner && this.hostile(u.owner, owner);
      const supplied = hostileGround && apcs.some((a) => a.owner === u.owner && dist(a.pos, u.pos) <= SUPPLY_LINE_RADIUS);
      const was = u.attrition;
      u.attrition = hostileGround && !supplied;
      if (!u.attrition) continue;
      if (!was) this.emit({ type: 'attrition', tick: this.tick, owner: u.owner, pos: { ...u.pos } });
      u.hp -= u.maxHp * ATTRITION_PER_SECOND * combineMods(u.mods).attritionMul * (this.bonusOf(u.owner).attritionMul ?? 1) * TICK_SECONDS;
      if (u.hp <= 0) this.markDestroyed(u, owner);
    }
  }

  /** Unidades paradas em território onde não podem estar (fronteira que avançou) saem sozinhas. */
  private evacuateForeignTerritory(): void {
    for (const u of this.units) {
      if (u.order.kind !== 'idle' || u.engageId !== null) continue;
      const c = this.grid.worldToCell(u.pos);
      if (this.canEnter(u.owner, c.cx, c.cy)) continue;
      const exit = this.nearestEnterable(u.owner, u.pos);
      if (!exit) continue;
      u.order = { kind: 'move', target: exit };
      if (!this.planPath(u, exit)) this.setIdle(u);
    }
  }

  /** Ponto passável mais próximo onde o jogador pode estar (busca em anéis de células). */
  nearestEnterable(slot: Slot, p: Vec2): Vec2 | null {
    const c = this.grid.worldToCell(this.clampToMap(p));
    if (this.grid.isPassable(c.cx, c.cy) && this.canEnter(slot, c.cx, c.cy)) return p;
    for (let r = 1; r <= 20; r++) {
      let best: Cell | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = c.cx + dx;
          const y = c.cy + dy;
          if (!this.grid.isPassable(x, y) || !this.canEnter(slot, x, y)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { cx: x, cy: y };
          }
        }
      if (best) return this.grid.cellCenter(best);
    }
    return null;
  }

  // ---------------------------------------------------------------- unidades

  private updateUnit(u: Unit): void {
    if (u.hp <= 0) return;
    if (u.cooldown > 0) u.cooldown--;
    // em modernização: parada na instalação, sem disparar
    if (u.refit) {
      u.activity = 'idle';
      return;
    }
    const fx = combineMods(u.mods);
    const def = UNITS[u.type];
    const reach = Math.max(def.sight + fx.sightAdd, def.weapon.range + fx.rangeAdd);

    switch (u.order.kind) {
      case 'attack': {
        const target = this.entities.get(u.order.targetId);
        // alvo destruído, inválido ou unidade que sumiu na névoa: a ordem acaba
        if (!target || target.hp <= 0 || !this.hostile(u.owner, target.owner) || (target.kind === 'unit' && !this.canSee(u.owner, target))) {
          this.setIdle(u);
          return;
        }
        this.engage(u, target);
        return;
      }
      case 'attackMove': {
        const target = this.validEngageTarget(u, reach * 1.5) ?? this.acquireTarget(u.pos, u.owner, reach, def.weapon.minRange) ?? this.acquireTarget(u.pos, u.owner, reach);
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
        const target = this.validEngageTarget(u, reach * 1.5) ?? this.acquireTarget(u.pos, u.owner, reach, def.weapon.minRange) ?? this.acquireTarget(u.pos, u.owner, reach);
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
    if (!t || t.hp <= 0 || !this.hostile(u.owner, t.owner) || !this.canSee(u.owner, t)) return null;
    if (this.distanceToEdge(u.pos, t) > leash) return null;
    return t;
  }

  /**
   * Seleção de alvo determinística: inimigo (em guerra) visível mais próximo dentro do raio, unidades antes
   * de edifícios; empate resolvido pelo menor id. Respeita a névoa de guerra do dono.
   */
  acquireTarget(from: Vec2, owner: Slot, radius: number, minRadius = 0): Entity | null {
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of this.entities.values()) {
      if (e.hp <= 0 || !this.hostile(owner, e.owner)) continue;
      if (!this.canSee(owner, e)) continue;
      const d = this.distanceToEdge(from, e);
      if (d > radius || d < minRadius) continue;
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
    // armamento conforme o equipamento instalado nesta unidade
    const fx = combineMods(u.mods);
    const d = this.distanceToEdge(u.pos, target);
    // alcance mínimo (lança-foguetes): perto demais, recua para a distância de tiro
    if (weapon.minRange !== undefined && d < weapon.minRange) {
      this.backOff(u, target, weapon.minRange);
      return;
    }
    if (d <= weapon.range + fx.rangeAdd) {
      // lança-foguetes: ao parar, baixa os macacos e ergue o casulo antes da primeira salva
      if (weapon.salvo && u.activity !== 'attacking') u.cooldown = Math.max(u.cooldown, SALVO_DEPLOY_TICKS);
      u.activity = 'attacking';
      u.path = [];
      u.facing = Math.atan2(target.pos.y - u.pos.y, target.pos.x - u.pos.x);
      // veterania: cada patente soma dano aos pacotes instalados
      const dmgMul = fx.damageMul * rankDamageMul(u.rank ?? 0);
      if (u.cooldown <= 0) this.fire(u, target, weapon.damage * dmgMul * targetMultiplier(weapon, target), weapon.cooldown * fx.cooldownMul, weapon.splash ? { radius: weapon.splash, weapon, base: weapon.damage * dmgMul } : undefined);
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
    if (this.followPath(u) && u.path.length === 0 && u.halt === 'standoff') {
      // não chega mais perto das construções inimigas: o alvo ficou fora do alcance
      u.halt = null;
      if (u.order.kind === 'attack') this.setIdle(u);
      else u.engageId = null;
    }
  }

  /** Recuo do lançador quando o alvo está dentro do alcance mínimo. */
  private backOff(u: Unit, target: Entity, minRange: number): void {
    u.activity = 'moving';
    u.repathTimer--;
    if (u.repathTimer <= 0 || u.pathIndex >= u.path.length) {
      u.repathTimer = CHASE_REPATH_TICKS;
      let dx = u.pos.x - target.pos.x;
      let dy = u.pos.y - target.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const want = minRange + this.entityRadius(target) + 2.5;
      // tenta direto para trás e, se não der, em leque para os lados
      let ok = false;
      for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const away = this.clampToMap({ x: target.pos.x + (dx * c - dy * s) * want, y: target.pos.y + (dx * s + dy * c) * want });
        if (this.planPath(u, away)) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        if (u.order.kind === 'attack') this.setIdle(u);
        else u.engageId = null;
        return;
      }
    }
    this.followPath(u);
  }

  /**
   * Distância mínima das construções inimigas para unidades com alcance mínimo (lança-foguetes):
   * elas disparam de longe e não entram até a beira das bases.
   */
  private violatesStandoff(u: Unit, p: Vec2): boolean {
    const min = UNITS[u.type].weapon.minRange;
    if (min === undefined) return false;
    for (const e of this.entities.values()) {
      if (e.kind !== 'building' || e.hp <= 0 || !this.hostile(u.owner, e.owner)) continue;
      if (this.distanceToEdge(p, e) < min) return true;
    }
    return false;
  }

  /** Antiaéreas do Futuro Próximo e CIWS derrubam parte das salvas em voo (ver `ROCKET_INTERCEPT` e `CIWS_INTERCEPT`). */
  private updateInterceptions(): void {
    if (!this.salvos.length) return;
    const aa = this.units.filter((u) => u.hp > 0 && !u.refit && interceptSpec(u));
    if (!aa.length) return;
    for (const v of this.salvos) {
      const total = v.rockets ?? UNITS[v.unitType].weapon.salvo ?? 1;
      if (total <= 0) continue;
      const t0 = v.launchTick ?? v.impactTick;
      const progress = (this.tick - t0) / Math.max(1, v.impactTick - t0);
      let left = total;
      for (const u of aa) {
        if (left <= 0) break;
        const spec = interceptSpec(u)!;
        if (progress < spec.minProgress) continue;
        if (!this.hostile(u.owner, v.owner) || (u.interceptReadyTick ?? 0) > this.tick || dist(u.pos, v.at) > spec.range) continue;
        const killed = Math.max(1, Math.ceil(left * spec.share));
        left -= killed;
        u.interceptReadyTick = this.tick + spec.cooldownTicks;
        this.emit({
          type: 'salvo_intercepted',
          tick: this.tick,
          owner: u.owner,
          aaId: u.id,
          attackerId: v.attackerId,
          from: { ...u.pos },
          at: { ...v.at },
          rockets: killed,
          ...(u.type === 'ciws' ? { gun: true } : {}),
        });
      }
      if (left === total) continue;
      v.base *= left / total;
      v.rockets = left;
    }
    // salvas derrubadas por inteiro não caem
    this.salvos = this.salvos.filter((v) => (v.rockets ?? 1) > 0);
  }

  /** Impacto das salvas de foguetes que chegaram neste tick. */
  private updateSalvos(): void {
    if (!this.salvos.length) return;
    const due = this.salvos.filter((v) => v.impactTick <= this.tick);
    if (!due.length) return;
    this.salvos = this.salvos.filter((v) => v.impactTick > this.tick);
    for (const v of due) {
      const w = UNITS[v.unitType].weapon;
      const radius = w.splash ?? 2;
      for (const e of [...this.entities.values()]) {
        if (e.hp <= 0 || !this.hostile(v.owner, e.owner)) continue;
        if (this.distanceToEdge(v.at, e) > radius) continue;
        // o alvo marcado leva a salva inteira; quem estava em volta, a fração de área
        const dmg = v.base * targetMultiplier(w, e) * (e.id === v.targetId ? 1 : SPLASH_FRACTION);
        if (v.from) this.noteUnseenFire(e, v.owner, v.from);
        this.players[v.owner]!.stats.damageDealt += Math.min(dmg, e.hp);
        e.hp -= dmg;
        if (this.tick - (this.lastAlertTick[e.owner] ?? -Infinity) >= UNDER_ATTACK_ALERT_TICKS) {
          this.lastAlertTick[e.owner] = this.tick;
          this.emit({ type: 'under_attack', tick: this.tick, id: e.id, owner: e.owner, pos: { ...e.pos } });
        }
        if (e.hp <= 0) {
          this.markDestroyed(e, v.owner);
          this.creditKill(this.entities.get(v.attackerId));
        }
      }
      this.emit({ type: 'salvo_impact', tick: this.tick, owner: v.owner, attackerId: v.attackerId, pos: { ...v.at }, radius, rockets: v.rockets ?? w.salvo ?? 1 });
    }
  }

  private fire(attacker: Unit | Building, target: Entity, damage: number, cooldownSeconds: number, splash?: { radius: number; weapon: WeaponDef; base: number }): void {
    if (target.hp <= 0) return;
    // salva de foguetes: sai agora, o dano chega à área do alvo depois do voo
    if (attacker.kind === 'unit' && splash?.weapon.salvo) {
      attacker.cooldown = Math.round(cooldownSeconds * TICK_RATE);
      const flightTicks = salvoFlightTicks(dist(attacker.pos, target.pos));
      this.salvos.push({
        owner: attacker.owner,
        attackerId: attacker.id,
        unitType: attacker.type,
        targetId: target.id,
        at: { ...target.pos },
        impactTick: this.tick + flightTicks,
        base: splash.base,
        from: { ...attacker.pos },
        launchTick: this.tick,
        rockets: splash.weapon.salvo ?? 1,
      });
      this.emit({ type: 'shot', tick: this.tick, attackerId: attacker.id, targetId: target.id, from: { ...attacker.pos }, to: { ...target.pos }, damage: Math.round(damage), salvo: splash.weapon.salvo, flightTicks });
      return;
    }
    // dano em área (foguetes): quem estiver perto do ponto de impacto recebe 60% do dano
    if (splash) {
      for (const e of [...this.entities.values()]) {
        if (e === target || e.hp <= 0 || !this.hostile(attacker.owner, e.owner)) continue;
        if (this.distanceToEdge(target.pos, e) > splash.radius) continue;
        const dmg = splash.base * SPLASH_FRACTION * targetMultiplier(splash.weapon, e);
        this.players[attacker.owner]!.stats.damageDealt += Math.min(dmg, e.hp);
        e.hp -= dmg;
        if (e.hp <= 0) {
          this.markDestroyed(e, attacker.owner);
          this.creditKill(attacker);
        }
      }
    }
    // rajada (Gatling do CIWS): tiros seguidos no ritmo da arma e, completada a rajada, a pausa
    const burst = attacker.kind === 'unit' ? UNITS[attacker.type].weapon.burst : undefined;
    let burstStart = false;
    let cooldown = cooldownSeconds;
    if (burst && attacker.kind === 'unit') {
      burstStart = !attacker.burstShots;
      attacker.burstShots = (attacker.burstShots ?? 0) + 1;
      if (attacker.burstShots >= burst.shots) {
        attacker.burstShots = 0;
        cooldown = burst.pause;
      }
    }
    attacker.cooldown = Math.round(cooldown * TICK_RATE);
    this.noteUnseenFire(target, attacker.owner, attacker.pos);
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
      ...(burstStart ? { burstStart: true } : {}),
    });
    if (this.tick - (this.lastAlertTick[target.owner] ?? -Infinity) >= UNDER_ATTACK_ALERT_TICKS) {
      this.lastAlertTick[target.owner] = this.tick;
      this.emit({ type: 'under_attack', tick: this.tick, id: target.id, owner: target.owner, pos: { ...target.pos } });
    }
    if (target.hp <= 0) {
      this.markDestroyed(target, attacker.owner);
      this.creditKill(attacker);
    }
  }

  /** Abate creditado a uma unidade: conta para a patente (veterania), com mais dano e vida. */
  private creditKill(attacker: Entity | undefined): void {
    if (!attacker || attacker.kind !== 'unit' || attacker.hp <= 0) return;
    attacker.kills = (attacker.kills ?? 0) + 1;
    const before = attacker.rank ?? 0;
    const after = rankFor(attacker.kills);
    if (after <= before) return;
    attacker.rank = after;
    const mul = rankHpMul(after) / rankHpMul(before);
    attacker.maxHp = Math.round(attacker.maxHp * mul);
    attacker.hp = Math.min(attacker.maxHp, attacker.hp * mul);
    this.emit({ type: 'unit_promoted', tick: this.tick, owner: attacker.owner, id: attacker.id, unitType: attacker.type, rank: after, pos: { ...attacker.pos } });
  }

  private updateBuildingWeapon(b: Building): void {
    const base = BUILDINGS[b.type].weapon;
    if (!base || b.progress < 1 || b.hp <= 0) return;
    const fx = this.fx(b);
    const weapon = { damage: base.damage * fx.damageMul, range: base.range + fx.rangeAdd, cooldown: base.cooldown };
    if (b.cooldown > 0) {
      b.cooldown--;
      return;
    }
    let target: Entity | null = null;
    if (b.engageId !== null) {
      const t = this.entities.get(b.engageId);
      if (t && t.kind === 'unit' && t.hp > 0 && this.hostile(b.owner, t.owner) && this.canSee(b.owner, t) && this.distanceToEdge(b.pos, t) - this.entityRadius(b) <= weapon.range) target = t;
    }
    if (!target) {
      const candidate = this.acquireTarget(b.pos, b.owner, weapon.range + this.entityRadius(b));
      target = candidate && candidate.kind === 'unit' ? candidate : null;
    }
    b.engageId = target?.id ?? null;
    if (target) this.fire(b, target, weapon.damage, weapon.cooldown);
  }

  // ---------------------------------------------------------------- movimento

  /**
   * Planeja caminho até `target`. Para edifícios, mira a célula livre mais próxima ao redor.
   * O caminho evita território onde a unidade não pode entrar (sem guerra nem aliança); se ela já
   * estiver num território assim, pode atravessá-lo para sair.
   */
  planPath(u: Unit, target: Vec2, building?: Building): boolean {
    const g = this.grid;
    const here = g.worldToCell(u.pos);
    if (this.canEnter(u.owner, here.cx, here.cy)) g.blocker = (cx, cy) => !this.canEnter(u.owner, cx, cy);
    try {
      return this.planPathInner(u, target, building);
    } finally {
      g.blocker = null;
    }
  }

  private planPathInner(u: Unit, target: Vec2, building?: Building): boolean {
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
      while (j > i && !this.grid.lineWalkable(anchor, pts[j]!, PATH_CLEARANCE)) j--;
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
    const terrain = this.grid.inBounds(cell.cx, cell.cy) ? this.grid.terrainAt(cell.cx, cell.cy) : null;
    let terrainMul = terrain !== null ? TERRAIN[terrain].speedMultiplier : 1;
    if (terrain === Terrain.Forest) terrainMul *= this.bonusOf(u.owner).forestSpeedMul ?? 1;
    const speed = UNITS[u.type].speed * combineMods(u.mods).speedMul * Math.max(terrainMul, 0.3) * TICK_SECONDS;
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
    // a fronteira pode ter avançado depois do planejamento: não cruza para território proibido
    if (!this.canEnterWorld(u.owner, next) && this.canEnterWorld(u.owner, u.pos)) {
      u.path = [];
      return true;
    }
    // lança-foguetes: para antes de chegar perto das construções inimigas
    if (this.violatesStandoff(u, next) && !this.violatesStandoff(u, u.pos)) {
      u.path = [];
      u.halt = 'standoff';
      return true;
    }
    u.pos = this.stepToward(u.pos, next);

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

  /**
   * Passo de movimento sem ficar preso na quina: se o ponto seguinte cai em célula bloqueada,
   * desliza pelo eixo livre (ao longo da parede, da margem do lago ou da pedra). Uma unidade que
   * já está numa célula bloqueada (ex.: empurrada para dentro) pode sair dela.
   */
  private stepToward(from: Vec2, next: Vec2): Vec2 {
    const g = this.grid;
    if (g.isWorldPassable(next)) return next;
    if (!g.isWorldPassable(from)) return next;
    const slideX = { x: next.x, y: from.y };
    const slideY = { x: from.x, y: next.y };
    const okX = g.isWorldPassable(slideX);
    const okY = g.isWorldPassable(slideY);
    if (okX && okY) return Math.abs(next.x - from.x) >= Math.abs(next.y - from.y) ? slideX : slideY;
    if (okX) return slideX;
    if (okY) return slideY;
    return from;
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

  addBuilding(type: BuildingType, owner: Slot, cell: Cell, progress: number): Building {
    const def = BUILDINGS[type];
    const cs = this.grid.cellSize;
    const b: Building = {
      kind: 'building',
      id: this.opaqueId('entity', this.nextId++),
      type,
      owner,
      cell: { ...cell },
      pos: { x: (cell.cx + def.size / 2) * cs, y: (cell.cy + def.size / 2) * cs },
      hp: progress >= 1 ? def.maxHp : def.maxHp * 0.1,
      maxHp: def.maxHp,
      level: 1,
      spec: null,
      upgrade: null,
      research: null,
      progress,
      builtTicks: 0,
      buildTicks: this.duration(
        owner,
        def.buildSeconds * TICK_RATE * (this.players[owner]?.modifiers.constructionTimeMul ?? 1) * (this.bonusOf(owner).buildTimeMul ?? 1) * (this.hasProject(owner, 'nuclear_plant') ? PROJECT_FX.nuclearBuildMul : 1),
      ),
      queue: [],
      rally: null,
      cooldown: 0,
      engageId: null,
      claims: [],
      depositId: null,
      workers: 0,
      workerTarget: def.workers,
      stored: 0,
      acc: 0,
      status: 'ok',
      unpaid: false,
    };
    if (def.gather) {
      const choice = chooseClaims(this.map, this.deposits, type, cell, claimedBy(this.buildings, type), sitesByDeposit(this.buildings), (i) => this.territory[i] === owner);
      b.claims = choice.claims;
      b.depositId = choice.depositId;
    }
    this.entities.set(b.id, b);
    this.grid.setOccupied(cell, def.size, b.id);
    if (progress >= 1 && def.territoryRadius > 0) this.territoryDirty = true;
    return b;
  }

  /** Cria uma unidade numa célula livre ao redor do edifício. */
  spawnUnitNear(b: Building, type: UnitType, hpMul = 1, mods: readonly ModId[] = []): Unit | null {
    const size = BUILDINGS[b.type].size;
    const occupied = new Set(this.units.map((u) => this.grid.index(...cellTuple(this.grid.worldToCell(u.pos)))));
    // primeiro só células com saída (o edifício pode ter sido cercado por obras); se nada servir, a regra antiga
    const cell = this.spawnCell(b, size, occupied, 12, true) ?? this.spawnCell(b, size, occupied, 4, false);
    return cell ? this.addUnit(type, b.owner, this.grid.cellCenter(cell), hpMul, mods) : null;
  }

  /** Célula livre no anel mais próximo do edifício (até `maxR`), voltada para o centro do mapa; `open`: exige saída. */
  private spawnCell(b: Building, size: number, occupied: Set<number>, maxR: number, open: boolean): Cell | null {
    for (let r = 1; r <= maxR; r++) {
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
      const cell = open ? candidates.find((c) => this.reachesOut(c.cx, c.cy)) : candidates[0];
      if (cell) return cell;
    }
    return null;
  }

  /** A partir da célula, dá para andar por pelo menos 120 células livres (não está num bolsão cercado)? */
  private reachesOut(cx: number, cy: number): boolean {
    const w = this.map.width;
    const seen = new Set<number>([cy * w + cx]);
    const queue = [cy * w + cx];
    for (let q = 0; q < queue.length && seen.size < 120; q++) {
      const i = queue[q]!;
      const x = i % w;
      const y = (i - x) / w;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const n = ny * w + nx;
        if (seen.has(n) || !this.grid.isPassable(nx, ny)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return seen.size >= 120;
  }

  /**
   * `hpMul`: equipamento do edifício que produziu (ex.: escola de elite, equipamentos avançados).
   * `mods`: pacotes de modernização do padrão de produção (já pagos no pedido).
   */
  addUnit(type: UnitType, owner: Slot, pos: Vec2, hpMul = 1, mods: readonly ModId[] = []): Unit {
    const maxHp = Math.round(UNITS[type].maxHp * hpMul * combineMods(mods).hpMul);
    const u: Unit = {
      kind: 'unit',
      id: this.opaqueId('entity', this.nextId++),
      type,
      owner,
      pos: { ...pos },
      facing: 0,
      hp: maxHp,
      maxHp,
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
      attrition: false,
      mods: [...mods],
      refit: null,
      ...(this.visualEra(owner) > 1 ? { era: this.visualEra(owner) } : {}),
    };
    this.entities.set(u.id, u);
    return u;
  }

  /** Atualiza os modificadores vindos da camada nacional. */
  setModifiers(slot: Slot, m: Partial<TacticalModifiers>): void {
    const p = this.players[slot];
    if (!p) return;
    if (m.territoryMul !== undefined && m.territoryMul !== p.modifiers.territoryMul) this.territoryDirty = true;
    p.modifiers = { ...p.modifiers, ...m };
  }

  private setIdle(u: Unit): void {
    u.order = { kind: 'idle' };
    u.engageId = null;
    u.path = [];
    u.pathIndex = 0;
    u.activity = 'idle';
  }

  /** `active`: só as que podem receber ordens (fora de modernização). */
  private ownUnits(slot: Slot, ids: EntityId[], active = false): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const e = this.entities.get(id);
      if (e && e.kind === 'unit' && e.owner === slot && e.hp > 0 && (!active || !e.refit)) out.push(e);
    }
    return out;
  }

  private markDestroyed(e: Entity, killerOwner: Slot | null): void {
    // Sandbox: o QG não cai — volta com a vida cheia, sem aviso de destruição
    if (this.sandbox && e.kind === 'building' && e.type === 'hq') {
      e.hp = e.maxHp;
      return;
    }
    // prefeitura pronta destruída por um inimigo: a cidade muda de dono em vez de sumir
    if (e.kind === 'building' && e.type === 'city_hall' && e.progress >= 1 && killerOwner !== null && killerOwner !== e.owner && this.players[killerOwner] && !this.players[killerOwner]!.defeated) {
      this.captureCity(e, killerOwner);
      return;
    }
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

  // ---------------------------------------------------------------- cidades

  /** Nome de cidade de um edifício: o da prefeitura, ou a capital do país para o QG. */
  cityName(b: Building): string | undefined {
    if (b.city) return b.city;
    if (b.type === 'hq') return geoOf(this.countries[b.owner] ?? '')?.capital.name;
    return undefined;
  }

  /** Próximo nome real de cidade do país do jogador (sem repetir nomes já usados na partida). */
  private nextCity(slot: Slot): string {
    const used = new Set<string>();
    for (const b of this.buildings) {
      const n = this.cityName(b);
      if (n) used.add(n);
    }
    return nextCityName(this.countries[slot], used);
  }

  /**
   * Captura (estilo Rise of Nations): a prefeitura destruída passa ao inimigo com pouca vida, e com
   * ela os edifícios do antigo dono no raio da cidade (exceto o QG). Filas, obras de melhoria e
   * pesquisas param; os trabalhadores voltam para casa; os aviões do antigo dono no hangar se
   * perdem e lançamentos de mísseis em preparação são abortados.
   */
  private captureCity(hall: Building, captor: Slot): void {
    const victim = hall.owner;
    const radius = CITY.radiusCells * this.grid.cellSize;
    const taken = this.buildings.filter((b) => b === hall || (b.owner === victim && b.type !== 'hq' && b.hp > 0 && Math.hypot(b.pos.x - hall.pos.x, b.pos.y - hall.pos.y) <= radius));
    this.players[victim]!.stats.structuresLost += taken.length;
    this.players[captor]!.stats.structuresDestroyed += taken.length;
    for (const b of taken) {
      const def = BUILDINGS[b.type];
      // petróleo guardado num tanque capturado muda de dono junto
      if (b.type === 'oil_tank' && b.stored > 0) {
        this.players[victim]!.resources.oil -= b.stored;
        this.players[captor]!.resources.oil += b.stored;
      }
      b.owner = captor;
      b.queue = [];
      b.upgrade = null;
      b.research = null;
      b.rally = null;
      b.engageId = null;
      b.cooldown = 0;
      b.workers = 0;
      b.workerTarget = def.workers;
      b.unpaid = false;
      b.status = 'ok';
      for (const u of this.units) if (u.owner === victim && u.refit?.facilityId === b.id) this.cancelRefit(u, 'facility_lost');
      this.air.onCaptured(b, victim);
      if (def.territoryRadius > 0 && b.progress >= 1) this.territoryDirty = true;
    }
    hall.hp = Math.max(1, Math.round(hall.maxHp * CITY.captureHpFrac));
    // o antigo dono perde a capacidade de armazenamento da cidade (o excedente se perde)
    this.clampToCapacity(victim, 'destroyed');
    this.emit({ type: 'city_captured', tick: this.tick, owner: captor, victim, id: hall.id, city: hall.city ?? BUILDINGS.city_hall.label, buildings: taken.length - 1, pos: { ...hall.pos } });
  }

  private removeDead(): void {
    for (const e of [...this.entities.values()]) {
      if (e.hp > 0) continue;
      // Sandbox: o QG não cai (a partida não termina); volta com a vida cheia
      if (this.sandbox && e.kind === 'building' && e.type === 'hq') {
        e.hp = e.maxHp;
        continue;
      }
      this.entities.delete(e.id);
      if (e.kind === 'building') {
        // destruir o edifício interrompe a fila (sem reembolso) e libera as células
        e.queue = [];
        this.grid.setOccupied(e.cell, BUILDINGS[e.type].size, 0);
        const def = BUILDINGS[e.type];
        if (def.territoryRadius > 0 && e.progress >= 1) this.territoryDirty = true;
        if (e.type === 'hq') {
          this.defeat(e.owner);
          continue;
        }
        // o petróleo de um tanque destruído se perde (exatamente o que estava nele)
        if (e.type === 'oil_tank' && e.stored > 0) {
          const p = this.players[e.owner]!;
          p.resources.oil -= e.stored;
          this.emit({ type: 'storage_lost', tick: this.tick, owner: e.owner, resource: 'oil', amount: Math.round(e.stored), reason: 'destroyed' });
          e.stored = 0;
        }
        // armazém/silo destruído: o que exceder a capacidade restante se perde, com registro
        if (e.progress >= 1 && Object.keys(this.fx(e).storage).length) this.clampToCapacity(e.owner, 'destroyed');
        if (e.workers > 0) e.workers = 0;
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

  /**
   * Vitória territorial (lote 2, item 15): quem controla `VICTORY.territoryShare` de todo o
   * território reivindicado no mapa por `VICTORY.territorySeconds` seguidos vence. Fora do Sandbox.
   */
  private updateTerritorialVictory(): void {
    if (this.ended || this.sandbox || this.tick % TICK_RATE !== 0) return;
    const alive = this.players.filter((p) => !p.defeated);
    if (alive.length < 2) return;
    const counts = this.players.map(() => 0);
    let total = 0;
    for (const o of this.territory)
      if (o >= 0 && o < counts.length) {
        counts[o]!++;
        total++;
      }
    if (!total) return;
    for (const p of alive) {
      const before = this.territoryHold[p.slot] ?? 0;
      if (counts[p.slot]! / total >= VICTORY.territoryShare) {
        const now = before + TICK_RATE;
        this.territoryHold[p.slot] = now;
        if (before === 0) this.emit({ type: 'victory_progress', tick: this.tick, kind: 'territory', slot: p.slot, state: 'started' });
        if (now >= VICTORY.territorySeconds * TICK_RATE) {
          this.ended = true;
          this.winner = p.slot;
          this.victory = 'territory';
          this.emit({ type: 'victory_progress', tick: this.tick, kind: 'territory', slot: p.slot, state: 'won' });
          return;
        }
      } else if (before > 0) {
        this.territoryHold[p.slot] = 0;
        this.emit({ type: 'victory_progress', tick: this.tick, kind: 'territory', slot: p.slot, state: 'lost' });
      }
    }
  }

  /**
   * Vitória política (lote 2, item 15), chamada uma vez por dia pela camada nacional: estabilidade
   * abaixo de `VICTORY.politicalStability` por `VICTORY.politicalDays` dias seguidos derruba o
   * governo, e o país sai da guerra (derrota). Fora do Sandbox.
   */
  politicalPressure(slot: Slot, stability: number): void {
    const p = this.players[slot];
    if (this.ended || this.sandbox || !p || p.defeated) return;
    const before = this.collapseDays[slot] ?? 0;
    if (stability >= VICTORY.politicalStability) {
      if (before > 0) {
        this.collapseDays[slot] = 0;
        this.emit({ type: 'victory_progress', tick: this.tick, kind: 'political', slot, state: 'lost' });
      }
      return;
    }
    const now = before + 1;
    this.collapseDays[slot] = now;
    if (before === 0) this.emit({ type: 'victory_progress', tick: this.tick, kind: 'political', slot, state: 'started' });
    if (now < VICTORY.politicalDays) return;
    this.emit({ type: 'victory_progress', tick: this.tick, kind: 'political', slot, state: 'won' });
    this.defeat(slot);
    this.checkVictory();
    if (this.ended) this.victory = 'political';
  }

  /** Progresso das vitórias alternativas em curso (0 a 1), para o HUD. */
  victoryPressure(): { kind: 'territory' | 'political'; slot: Slot; progress: number }[] {
    const out: { kind: 'territory' | 'political'; slot: Slot; progress: number }[] = [];
    this.territoryHold.forEach((t, slot) => {
      if (t > 0) out.push({ kind: 'territory', slot, progress: Math.min(1, t / (VICTORY.territorySeconds * TICK_RATE)) });
    });
    this.collapseDays.forEach((d, slot) => {
      if (d > 0 && !this.players[slot]?.defeated) out.push({ kind: 'political', slot, progress: Math.min(1, d / VICTORY.politicalDays) });
    });
    return out;
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

/** Marca como visíveis as células cujo centro está no círculo (coordenadas em células). */
function markCircle(grid: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) grid[y * w + x] = 1;
    }
  }
}
