import { BUILDINGS, ECONOMY, GOODS, TICK_RATE, UNITS, canAfford, scaleCostBy, type Cost, type Goods } from './config.ts';
import { substituteGoods } from './production.ts';
import type { CountryBonus } from './countryBonus.ts';
import { AIRCRAFT_ERA, eraPhrase } from './eras.ts';
import { buildingEffects, missingText } from './upgrades.ts';
import type { Simulation } from './Simulation.ts';
import type { Building, EntityId, Slot, Vec2 } from './types.ts';

/**
 * Força aérea, defesa antiaérea e mísseis (Fase 7).
 *
 * - Aeronaves não são unidades de chão: ficam no hangar de uma Base Aérea, custam materiais, verba
 *   de obras e um recruta (piloto), consomem petróleo por missão (ida e volta) e manutenção por
 *   segundo, e passam um tempo em manutenção depois de voar.
 * - Missões: ataque (só contra edifício inimigo já descoberto, em guerra, dentro do alcance) e
 *   reconhecimento (revela uma área por um tempo e registra os edifícios vistos). O resultado
 *   depende da defesa antiaérea, dos caças de interceptação do alvo e da precisão — dano parcial é
 *   o normal; destruir exige vários ataques.
 * - Tanque de petróleo atingido perde petróleo na proporção do dano, limitado ao que estava nele.
 * - Mísseis: produzidos e guardados no silo (inventário explícito). Lançar é uma sequência com
 *   estados distintos: preparar → armado (aguarda autorização) → autorizado/lançando → em voo →
 *   impacto (ou interceptado). Exige pesquisa, silo operacional, munição e guerra com o dono do alvo.
 *
 * Toda aleatoriedade usa um gerador determinístico guardado no estado (salvar/carregar idêntico).
 */

export type AircraftType = 'fighter' | 'bomber' | 'recon' | 'transport';
export const AIRCRAFT_TYPES: AircraftType[] = ['fighter', 'bomber', 'recon', 'transport'];

export interface AircraftDef {
  label: string;
  role: string;
  cost: Cost;
  usd: number;
  buildSeconds: number;
  /** Raio de ação a partir da base (unidades de mundo). */
  range: number;
  speed: number;
  /** Petróleo por unidade de distância voada. */
  fuelPerWorld: number;
  /** Suprimentos por segundo de manutenção (sempre, no hangar ou em voo). */
  upkeep: number;
  maintenanceSeconds: number;
  /** Dano de ataque por aeronave (antes da precisão). */
  strikeDamage: number;
  /** Nível mínimo da base aérea para produzir. */
  minBaseLevel?: number;
}

export const AIRCRAFT: Record<AircraftType, AircraftDef> = {
  fighter: {
    label: 'Caça multifunção',
    role: 'Ataque a alvos descobertos e interceptação de ataques perto da base',
    cost: { iron: 60, oil: 40, supplies: 50 },
    usd: 3_000_000,
    buildSeconds: 30,
    range: 170,
    // velocidades reduzidas: no 1× um caça leva ~20 s para cruzar o mapa (antes ~9 s)
    speed: 6.5,
    fuelPerWorld: 0.12,
    upkeep: 0.04,
    maintenanceSeconds: 25,
    strikeDamage: 180,
  },
  bomber: {
    label: 'Bombardeiro',
    role: 'Bombardeio em tapete: muito dano ao edifício-alvo e aos vizinhos; lento e sem defesa contra caças',
    cost: { iron: 110, oil: 70, supplies: 80 },
    usd: 6_000_000,
    buildSeconds: 45,
    range: 190,
    speed: 4.6,
    fuelPerWorld: 0.2,
    upkeep: 0.07,
    maintenanceSeconds: 40,
    strikeDamage: 520,
    minBaseLevel: 2,
  },
  recon: {
    label: 'Reconhecimento',
    role: 'Revela uma área por 40 s e registra os edifícios inimigos vistos',
    cost: { iron: 30, oil: 25, supplies: 30 },
    usd: 1_500_000,
    buildSeconds: 20,
    range: 200,
    speed: 7.5,
    fuelPerWorld: 0.08,
    upkeep: 0.02,
    maintenanceSeconds: 15,
    strikeDamage: 0,
  },
  transport: {
    label: 'Cargueiro',
    role: 'Amplia o transporte aéreo comercial (+1 embarque aéreo simultâneo)',
    cost: { iron: 50, oil: 30, supplies: 40 },
    usd: 2_500_000,
    buildSeconds: 25,
    range: 0,
    speed: 5,
    fuelPerWorld: 0,
    upkeep: 0.03,
    maintenanceSeconds: 0,
    strikeDamage: 0,
  },
};

/** Visão das aeronaves em voo (área revelada embaixo delas, como a das tropas). */
export const FLIGHT_SIGHT: Record<AircraftType, number> = { fighter: 9, bomber: 8, recon: 14, transport: 7 };

export const AIR = {
  hangarPerBase: 4,
  reconRadius: 18,
  reconSeconds: 40,
  /** Antiaérea: chance de derrubar cada aeronave, por bateria ao alcance (e torre), com teto. */
  aaRange: 12,
  aaChance: 0.25,
  towerAaChance: 0.08,
  fighterInterceptChance: 0.15,
  interceptRadius: 25,
  maxShootDown: 0.75,
  /** Precisão do ataque: 60–100% do dano (com munição guiada, 75–100%). */
  precisionMin: 0.6,
  precisionMinGuided: 0.75,
  /** Pesquisa exigida para atacar infraestrutura. */
  strikeTech: 'guided_munitions',
  /** Bombardeio em tapete: precisão mínima e raio em que os edifícios vizinhos também são atingidos. */
  bomberPrecisionMin: 0.7,
  carpetRadius: 5,
  carpetSplash: 0.4,
  /** Combate aéreo: distância de engajamento, rodadas (1 por segundo) e chance de abate por disparo. */
  dogfightRange: 9,
  dogfightRounds: 3,
  dogfightKill: 0.22,
  /** Metralhadoras defensivas do bombardeiro: chance pequena de derrubar um caça por rodada. */
  bomberGunKill: 0.05,
};

/** Eficácia da antiaérea móvel em relação a uma bateria fixa. */
export const MOBILE_AA_FACTOR = 0.8;

export const MISSILE = {
  tech: 'ballistic_missiles',
  cost: { iron: 80, oil: 60, supplies: 60 } as Cost,
  usd: 6_000_000,
  buildSeconds: 45,
  capacityPerSilo: 2,
  prepareSeconds: 10,
  launchSeconds: 3,
  speed: 25,
  damage: 700,
  radius: 4,
  interceptChance: 0.2,
  interceptRange: 10,
  maxIntercept: 0.6,
};

/**
 * Domo de Ferro: bateria de defesa antimíssil. Protege o que estiver a até `range` dela contra o míssil balístico comum
 * (1ª geração); o pesado e a ogiva nuclear passam. Quando um míssil é lançado contra a área, a bateria dispara
 * `perEngagement` interceptadores, que encontram o míssil a `meetProgress` do voo, com `hitChance` de derrubá-lo.
 * Não dá para segurar uma salva: são `magazine` interceptadores prontos, cada um recarregado em `reloadSeconds` (um
 * por vez, pagando `interceptorCost`), e os lançadores precisam de `cooldownSeconds` entre uma interceptação e outra.
 */
export const IRON_DOME = {
  range: 22,
  magazine: 4,
  perEngagement: 2,
  hitChance: 0.9,
  reloadSeconds: 40,
  cooldownSeconds: 10,
  interceptorCost: { iron: 30, oil: 20, supplies: 30 } as Cost,
  interceptorFlightSeconds: 1.6,
  meetProgress: 0.72,
};

/** Interceptadores de uma bateria do Domo de Ferro. */
export interface DomeState {
  ready: number;
  /** Ticks até o próximo interceptador recarregado (0 = parado, magazine cheio ou sem recursos). */
  reload: number;
  /** Ticks até os lançadores poderem engajar de novo. */
  cooldown: number;
}

/**
 * Ogiva nuclear (pesquisa nacional "Armas nucleares"): muito mais cara e lenta de produzir, raio e
 * dano enormes, mais difícil de interceptar. Todo lançamento derruba a economia global por meses
 * (`NationalSimulation.nuclearShock`), inclusive a de quem lançou.
 */
export const NUCLEAR = {
  tech: 'nuclear_weapons',
  cost: { iron: 220, oil: 160, supplies: 220 } as Cost,
  usd: 40_000_000,
  buildSeconds: 90,
  damage: 6000,
  radius: 14,
  interceptMul: 0.5,
};

// balanceamento da economia (ver `ECONOMY` em config.ts): aeronaves e mísseis custam bem mais
for (const a of Object.values(AIRCRAFT)) {
  a.cost = scaleCostBy(a.cost, ECONOMY.aircraft);
  a.usd = Math.round(a.usd * ECONOMY.aircraftUsd);
}
MISSILE.cost = scaleCostBy(MISSILE.cost, ECONOMY.missiles);
NUCLEAR.cost = scaleCostBy(NUCLEAR.cost, ECONOMY.missiles);

/**
 * Ficha do míssil por geração. A 2ª geração (silo no nível 2) é o míssil pesado do lançador
 * eretor: abastece em metade do tempo, contagem final curta, voa mais rápido, ogiva maior e é
 * mais difícil de interceptar.
 */
export function missileSpec(gen: number): { prepareSeconds: number; launchSeconds: number; speed: number; damage: number; radius: number; interceptChance: number; maxIntercept: number } {
  if (gen >= 2) return { prepareSeconds: 5, launchSeconds: 2, speed: 32, damage: 1150, radius: 5.5, interceptChance: 0.13, maxIntercept: 0.45 };
  return { prepareSeconds: MISSILE.prepareSeconds, launchSeconds: MISSILE.launchSeconds, speed: MISSILE.speed, damage: MISSILE.damage, radius: MISSILE.radius, interceptChance: MISSILE.interceptChance, maxIntercept: MISSILE.maxIntercept };
}

export type AircraftState = 'building' | 'ready' | 'mission' | 'maintenance' | 'grounded';

export interface Aircraft {
  id: number;
  type: AircraftType;
  owner: Slot;
  baseId: EntityId;
  /** Posição da base (para registrar a perda se ela for destruída). */
  home: Vec2;
  state: AircraftState;
  /** Ticks restantes de produção ou manutenção. */
  timer: number;
  missionId: number | null;
}

export type MissionKind = 'strike' | 'recon';
export type MissionState = 'outbound' | 'returning' | 'done';

export interface MissionResult {
  shotDown: number;
  damage: number;
  oilLost: number;
  destroyed: boolean;
  revealed: number;
  text: string;
}

export interface AirMission {
  id: number;
  owner: Slot;
  kind: MissionKind;
  aircraft: number[];
  baseId: EntityId;
  from: Vec2;
  target: Vec2;
  targetId: EntityId | null;
  targetType: string | null;
  state: MissionState;
  launchTick: number;
  /** Ticks de ida (e de volta). */
  legTicks: number;
  fuel: number;
  result: MissionResult | null;
  /** Geração dos caças (pelo nível da base na decolagem): 1 = F-5EM, 2 = F-39 Gripen. Só visual. */
  gen?: number;
  /** Missões inimigas com que esta já travou combate aéreo (cada par luta uma vez). */
  fought?: number[];
}

/** Combate aéreo em andamento entre duas esquadrilhas: as duas ficam presas no lugar até acabar. */
export interface Dogfight {
  a: number;
  b: number;
  round: number;
  nextTick: number;
}

export type LaunchState = 'preparing' | 'armed' | 'launching' | 'flight' | 'impact' | 'intercepted' | 'aborted';

export interface MissileLaunch {
  id: number;
  owner: Slot;
  siloId: EntityId;
  target: Vec2;
  /** Dono do território no alvo no momento da preparação. */
  targetOwner: Slot;
  state: LaunchState;
  timer: number;
  from: Vec2;
  flightTicks: number;
  startTick: number;
  /** Tick em que terminou (impacto, interceptação ou aborto): o resultado fica visível a partir daqui. */
  endTick?: number;
  result: { damage: number; destroyed: number; casualties: number; intercepted: boolean } | null;
  /** Geração do míssil (2 = silo no nível 2); ausente nos salvamentos antigos = 1. */
  gen?: number;
  /** Ogiva nuclear. */
  nuclear?: boolean;
  /** Engajamento do Domo de Ferro: bateria, tick do encontro, acerto (sorteado no disparo) e se já foi resolvido. */
  dome?: { domeId: EntityId; meetTick: number; hit: boolean; resolved?: boolean };
}

export interface SiloState {
  missiles: number;
  /** Quantos dos mísseis guardados têm ogiva nuclear. */
  nuclear?: number;
  /** O míssil em produção tem ogiva nuclear. */
  buildingNuclear?: boolean;
  /** Ticks restantes do míssil em produção (0 = nenhum). */
  building: number;
  paid: Cost;
  usd: number;
}

export interface Reveal {
  owner: Slot;
  pos: Vec2;
  radius: number;
  untilTick: number;
}

export interface AirSave {
  nextId: number;
  seed: number;
  aircraft: Aircraft[];
  missions: AirMission[];
  launches: MissileLaunch[];
  silos: Record<number, SiloState>;
  reveals: Reveal[];
  known: Record<number, number[]>;
  dogfights?: Dogfight[];
  domes?: Record<number, DomeState>;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export class AirSystem {
  nextId = 1;
  seed = 0x51ed2701;
  aircraft: Aircraft[] = [];
  missions: AirMission[] = [];
  launches: MissileLaunch[] = [];
  silos: Record<number, SiloState> = {};
  reveals: Reveal[] = [];
  dogfights: Dogfight[] = [];
  /** Interceptadores de cada bateria do Domo de Ferro (por id do edifício). */
  domes: Record<number, DomeState> = {};
  /** Edifícios inimigos já descobertos por cada jogador (visão ou reconhecimento). */
  known: Record<number, Set<number>> = {};

  constructor(private readonly sim: Simulation) {}

  private rand(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  toSave(): AirSave {
    const known: Record<number, number[]> = {};
    for (const [k, v] of Object.entries(this.known)) known[Number(k)] = [...v].sort((a, b) => a - b);
    return JSON.parse(
      JSON.stringify({ nextId: this.nextId, seed: this.seed, aircraft: this.aircraft, missions: this.missions, launches: this.launches, silos: this.silos, reveals: this.reveals, known, dogfights: this.dogfights, domes: this.domes }),
    ) as AirSave;
  }

  load(s: AirSave | undefined): void {
    if (!s) return;
    const c = JSON.parse(JSON.stringify(s)) as AirSave;
    this.nextId = c.nextId;
    this.seed = c.seed;
    this.aircraft = c.aircraft;
    this.missions = c.missions;
    this.launches = c.launches;
    this.silos = c.silos;
    this.reveals = c.reveals;
    this.dogfights = c.dogfights ?? [];
    this.domes = c.domes ?? {};
    this.known = Object.fromEntries(Object.entries(c.known).map(([k, v]) => [Number(k), new Set(v)]));
  }

  // -------------------------------------------------------------- consultas

  private techs(slot: Slot): readonly string[] {
    return this.sim.national?.techs(slot) ?? [];
  }

  private funds(slot: Slot): number | null {
    return this.sim.national ? this.sim.national.worksFundUsd(slot) : null;
  }

  private building(id: EntityId): Building | null {
    const b = this.sim.entities.get(id);
    return b && b.kind === 'building' && b.hp > 0 ? b : null;
  }

  private operational(b: Building | null, type: string, slot: Slot): b is Building {
    return !!b && b.type === type && b.owner === slot && b.progress >= 1 && b.hp > 0 && !b.unpaid;
  }

  aircraftAt(baseId: EntityId): Aircraft[] {
    return this.aircraft.filter((a) => a.baseId === baseId);
  }

  /** Cargueiros prontos do jogador (ampliam o modal aéreo do comércio). */
  transports(slot: Slot): number {
    return this.aircraft.filter((a) => a.owner === slot && a.type === 'transport' && a.state === 'ready').length;
  }

  isKnown(slot: Slot, id: EntityId): boolean {
    return this.known[slot]?.has(id) ?? false;
  }

  private remember(slot: Slot, id: EntityId): void {
    (this.known[slot] ??= new Set()).add(id);
  }

  // -------------------------------------------------------------- produção de aeronaves

  buildBlocker(slot: Slot, baseId: EntityId, type: AircraftType): string | null {
    const base = this.building(baseId);
    if (!this.operational(base, 'airbase', slot)) return 'Base aérea inválida ou inoperante';
    const def = this.aircraftCost(slot, type);
    if (AIRCRAFT_ERA[type] > this.sim.eraOf(slot)) return `${def.label} exige ${eraPhrase(AIRCRAFT_ERA[type])}`;
    if (def.minBaseLevel && base.level < def.minBaseLevel) return `${def.label} exige Base Aérea nível ${def.minBaseLevel}`;
    if (this.aircraftAt(baseId).length >= AIR.hangarPerBase) return `Hangar cheio: ${AIR.hangarPerBase} aeronaves por base`;
    const p = this.sim.players[slot]!;
    if (p.recruits < 1) return 'Nenhum recruta para piloto: aliste recrutas na base militar';
    if (!canAfford(p.resources, def.cost)) return `Recursos insuficientes: faltam ${missingText(p.resources, def.cost)}`;
    const f = this.funds(slot);
    if (f !== null && f + 1e-6 < def.usd) return 'Verba de obras insuficiente para a aeronave';
    return null;
  }

  /** Ficha da aeronave com o bônus do país (custo em recursos e US$). */
  aircraftCost(slot: Slot, type: AircraftType): AircraftDef & { goods?: Partial<Goods> } {
    return aircraftFor(type, this.sim.bonusOf(slot), this.sim.players[slot]?.goods);
  }

  build(slot: Slot, baseId: EntityId, type: AircraftType): string | null {
    const err = this.buildBlocker(slot, baseId, type);
    if (err) return err;
    const def = this.aircraftCost(slot, type);
    if (this.sim.national && !this.sim.national.chargeWorks(slot, def.usd, `${def.label}`)) return 'Verba de obras insuficiente para a aeronave';
    this.sim.spendResources(slot, def.cost);
    if (def.goods) this.sim.spendGoods(this.sim.players[slot]!, def.goods);
    this.sim.players[slot]!.recruits--;
    this.aircraft.push({ id: this.nextId++, type, owner: slot, baseId, home: { ...this.building(baseId)!.pos }, state: 'building', timer: this.sim.duration(slot, def.buildSeconds * TICK_RATE), missionId: null });
    return null;
  }

  // -------------------------------------------------------------- missões

  /** Motivo de uma missão não poder sair (mesma regra no painel). */
  missionBlocker(slot: Slot, baseId: EntityId, ids: number[], kind: MissionKind, target: { buildingId?: EntityId; x?: number; y?: number }): string | null {
    const base = this.building(baseId);
    if (!this.operational(base, 'airbase', slot)) return 'Base aérea inválida ou inoperante';
    const planes = ids.map((id) => this.aircraft.find((a) => a.id === id));
    if (!planes.length || planes.some((a) => !a || a.owner !== slot || a.baseId !== baseId)) return 'Aeronaves inválidas';
    if (planes.some((a) => a!.state !== 'ready')) return 'Há aeronaves indisponíveis (em produção, em missão, em manutenção ou sem manutenção paga)';
    const allowed: AircraftType[] = kind === 'strike' ? ['fighter', 'bomber'] : ['recon'];
    if (planes.some((a) => !allowed.includes(a!.type))) return kind === 'strike' ? 'Ataque: só caças e bombardeiros' : 'Reconhecimento: só aeronaves de reconhecimento';
    let pos: Vec2;
    if (kind === 'strike') {
      if (!this.techs(slot).includes(AIR.strikeTech)) return 'Ataque aéreo a infraestrutura exige a pesquisa Munição guiada';
      const t = target.buildingId !== undefined ? this.sim.entities.get(target.buildingId) : undefined;
      // só alvos já descobertos: o ataque não ignora a névoa de guerra
      if (!t || t.kind !== 'building' || !this.isKnown(slot, t.id)) return 'Alvo não descoberto: faça reconhecimento ou aviste o edifício antes';
      // ataques aéreos exigem guerra declarada (um incidente de fronteira não basta)
      if (t.owner === slot || !this.sim.formalWar(slot, t.owner)) return 'Sem estado de guerra com o dono do alvo';
      pos = t.pos;
    } else {
      if (target.x === undefined || target.y === undefined) return 'Escolha um ponto para o reconhecimento';
      pos = this.sim.clampToMap({ x: target.x, y: target.y });
    }
    const d = dist(base!.pos, pos);
    const range = Math.min(...planes.map((a) => AIRCRAFT[a!.type].range));
    if (d > range) return `Fora do alcance: ${Math.round(d)} de ${range}`;
    const fuel = planes.reduce((s, a) => s + AIRCRAFT[a!.type].fuelPerWorld * d * 2, 0);
    // o combustível da refinaria abastece primeiro (cada unidade vale `GOODS.saves` de petróleo)
    const p = this.sim.players[slot]!;
    if (p.resources.oil + (p.goods?.fuel ?? 0) * GOODS.saves + 1e-6 < fuel) return `Combustível insuficiente: a missão consome ${Math.ceil(fuel)} de petróleo`;
    return null;
  }

  launchMission(slot: Slot, baseId: EntityId, ids: number[], kind: MissionKind, target: { buildingId?: EntityId; x?: number; y?: number }): string | null {
    const err = this.missionBlocker(slot, baseId, ids, kind, target);
    if (err) return err;
    const base = this.building(baseId)!;
    const t = kind === 'strike' ? (this.sim.entities.get(target.buildingId!) as Building) : null;
    const pos = t ? { ...t.pos } : this.sim.clampToMap({ x: target.x!, y: target.y! });
    const d = dist(base.pos, pos);
    const planes = ids.map((id) => this.aircraft.find((a) => a.id === id)!);
    const fuel = planes.reduce((s, a) => s + AIRCRAFT[a.type].fuelPerWorld * d * 2, 0);
    const p = this.sim.players[slot]!;
    const fromGoods = Math.min(p.goods?.fuel ?? 0, Math.floor(fuel / GOODS.saves));
    if (fromGoods > 0) this.sim.spendGoods(p, { fuel: fromGoods });
    this.sim.spendResources(slot, { oil: Math.max(0, fuel - fromGoods * GOODS.saves) });
    const speed = Math.min(...planes.map((a) => AIRCRAFT[a.type].speed));
    const m: AirMission = {
      id: this.nextId++,
      owner: slot,
      kind,
      aircraft: ids,
      baseId,
      from: { ...base.pos },
      target: pos,
      targetId: t?.id ?? null,
      targetType: t?.type ?? null,
      state: 'outbound',
      launchTick: this.sim.tick,
      legTicks: Math.max(1, Math.round((d / speed) * TICK_RATE)),
      fuel: Math.round(fuel * 10) / 10,
      result: null,
      gen: buildingEffects('airbase', base.level).fighterGen,
    };
    for (const a of planes) {
      a.state = 'mission';
      a.missionId = m.id;
    }
    this.missions.push(m);
    this.sim.emitTrade({
      type: 'air_mission',
      tick: this.sim.tick,
      owner: slot,
      missionId: m.id,
      kind,
      phase: 'launched',
      text: `${kind === 'strike' ? 'Ataque aéreo' : 'Reconhecimento'} decolou com ${ids.length} aeronave(s)`,
      pos: { ...m.from },
    });
    return null;
  }

  /** Chegada ao alvo: defesa antiaérea, interceptação e efeito. */
  private resolve(m: AirMission): void {
    const planes = m.aircraft.map((id) => this.aircraft.find((a) => a.id === id)).filter((a): a is Aircraft => !!a);
    const enemy = (o: Slot) => o !== m.owner && this.sim.hostile(m.owner, o);
    // chance de derrubar cada aeronave: baterias e torres ao alcance + caças prontos de bases próximas
    let chance = 0;
    for (const b of this.sim.buildings) {
      if (!enemy(b.owner) || b.progress < 1 || b.hp <= 0) continue;
      const d = dist(b.pos, m.target);
      if (b.type === 'aa_battery' && d <= AIR.aaRange && this.sim.isPowered(b)) chance += AIR.aaChance * (this.sim.bonusOf(b.owner).aaMul ?? 1);
      else if (b.type === 'tower' && d <= AIR.aaRange * 0.7) chance += AIR.towerAaChance;
      else if (b.type === 'airbase' && d <= AIR.interceptRadius) chance += AIR.fighterInterceptChance * this.aircraftAt(b.id).filter((a) => a.type === 'fighter' && a.state === 'ready').length;
    }
    // antiaérea móvel acompanhando as tropas: como uma bateria, um pouco menos eficaz
    for (const u of this.sim.units) if (enemy(u.owner) && u.hp > 0 && UNITS[u.type].airDefense && dist(u.pos, m.target) <= AIR.aaRange) chance += AIR.aaChance * MOBILE_AA_FACTOR * (this.sim.bonusOf(u.owner).aaMul ?? 1);
    chance = Math.min(AIR.maxShootDown, chance);
    let shotDown = 0;
    for (const a of planes) {
      if (this.rand() < chance) {
        shotDown++;
        this.aircraft = this.aircraft.filter((x) => x.id !== a.id);
        this.sim.emitTrade({ type: 'aircraft_lost', tick: this.sim.tick, owner: m.owner, aircraftType: a.type, pos: { ...m.target } });
      }
    }
    m.aircraft = m.aircraft.filter((id) => this.aircraft.some((a) => a.id === id));
    const r: MissionResult = { shotDown, damage: 0, oilLost: 0, destroyed: false, revealed: 0, text: '' };
    if (m.kind === 'recon') {
      if (m.aircraft.length) {
        this.reveals.push({ owner: m.owner, pos: { ...m.target }, radius: AIR.reconRadius, untilTick: this.sim.tick + AIR.reconSeconds * TICK_RATE });
        for (const b of this.sim.buildings)
          if (b.owner !== m.owner && dist(b.pos, m.target) <= AIR.reconRadius) {
            if (!this.isKnown(m.owner, b.id)) r.revealed++;
            this.remember(m.owner, b.id);
          }
        r.text = `Reconhecimento concluído: ${r.revealed} edifício(s) novo(s) descoberto(s)`;
      } else r.text = 'Reconhecimento abatido antes de cobrir a área';
    } else {
      const t = m.targetId !== null ? this.building(m.targetId) : null;
      if (!t) r.text = 'Alvo já não existia na chegada';
      else if (m.aircraft.length) {
        const guided = this.techs(m.owner).includes('guided_munitions');
        let bombers = 0;
        let carpet = 0;
        for (const id of m.aircraft) {
          const a = this.aircraft.find((x) => x.id === id)!;
          const bomber = a.type === 'bomber';
          const min = bomber ? AIR.bomberPrecisionMin : guided ? AIR.precisionMinGuided : AIR.precisionMin;
          const dmg = AIRCRAFT[a.type].strikeDamage * (min + (1 - min) * this.rand());
          r.damage += dmg;
          if (bomber) {
            bombers++;
            carpet += dmg * AIR.carpetSplash;
          }
        }
        r.damage = Math.round(r.damage);
        // tapete de bombas: os edifícios inimigos em volta do alvo também são atingidos
        let splashHit = 0;
        let splashDestroyed = 0;
        if (carpet > 0)
          for (const o of [...this.sim.buildings]) {
            if (o.id === t.id || o.hp <= 0 || o.owner === m.owner || !this.sim.hostile(m.owner, o.owner)) continue;
            const d = dist(o.pos, t.pos);
            if (d > AIR.carpetRadius + this.sim.entityRadius(o)) continue;
            const dmg = Math.round(carpet * Math.max(0.35, 1 - d / (AIR.carpetRadius + 1)));
            if (o.type === 'oil_tank' && o.stored > 0) this.sim.loseTankOil(o, o.stored * Math.min(1, dmg / Math.max(1, o.hp)));
            splashHit++;
            if (this.sim.damageBuilding(o, dmg, m.owner)) splashDestroyed++;
          }
        const before = t.hp;
        // petróleo perdido: proporcional ao dano e limitado ao que estava no tanque no impacto
        if (t.type === 'oil_tank' && t.stored > 0) {
          const frac = Math.min(1, r.damage / Math.max(1, before));
          r.oilLost = Math.round(this.sim.loseTankOil(t, t.stored * frac) * 10) / 10;
        }
        r.destroyed = this.sim.damageBuilding(t, r.damage, m.owner);
        r.text = `${BUILDINGS[t.type].label}: ${r.damage} de dano${r.destroyed ? ' (destruído)' : ''}${r.oilLost ? `, ${r.oilLost} de petróleo perdidos` : ''}`;
        if (splashHit) r.text += ` · bombardeio atingiu mais ${splashHit} edifício(s)${splashDestroyed ? ` (${splashDestroyed} destruído(s))` : ''}`;
        this.sim.emitTrade({
          type: 'air_strike',
          tick: this.sim.tick,
          owner: m.owner,
          victim: t.owner,
          buildingType: t.type,
          damage: r.damage,
          oilLost: r.oilLost,
          destroyed: r.destroyed,
          pos: { ...t.pos },
          ...(bombers ? { bombers, dir: Math.round(Math.atan2(t.pos.y - m.from.y, t.pos.x - m.from.x) * 100) / 100 } : {}),
        });
      } else r.text = 'Todas as aeronaves abatidas antes do alvo';
    }
    if (shotDown) r.text += ` · ${shotDown} abatida(s)`;
    m.result = r;
    m.state = 'returning';
    this.sim.emitTrade({ type: 'air_mission', tick: this.sim.tick, owner: m.owner, missionId: m.id, kind: m.kind, phase: 'result', text: r.text, pos: { ...m.target } });
  }

  // -------------------------------------------------------------- mísseis

  silo(id: EntityId): SiloState {
    return (this.silos[id] ??= { missiles: 0, building: 0, paid: {}, usd: 0 });
  }

  missileBuildBlocker(slot: Slot, siloId: EntityId, nuclear = false): string | null {
    const b = this.building(siloId);
    if (!this.operational(b, 'missile_silo', slot)) return 'Silo de mísseis inválido ou inoperante';
    if (!this.techs(slot).includes(MISSILE.tech)) return 'Exige a pesquisa Mísseis balísticos';
    if (nuclear && !this.techs(slot).includes(NUCLEAR.tech)) return 'Exige a pesquisa Armas nucleares';
    const price = nuclear ? NUCLEAR : MISSILE;
    const s = this.silo(siloId);
    if (s.building > 0) return 'Já há um míssil em produção neste silo';
    const reserved = this.launches.filter((l) => l.siloId === siloId && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching')).length;
    if (s.missiles + reserved >= MISSILE.capacityPerSilo) return `Silo cheio: ${MISSILE.capacityPerSilo} mísseis por silo`;
    const p = this.sim.players[slot]!;
    if (!canAfford(p.resources, price.cost)) return `Recursos insuficientes: faltam ${missingText(p.resources, price.cost)}`;
    const f = this.funds(slot);
    if (f !== null && f + 1e-6 < price.usd) return 'Verba de obras insuficiente para o míssil';
    return null;
  }

  buildMissile(slot: Slot, siloId: EntityId, nuclear = false): string | null {
    const err = this.missileBuildBlocker(slot, siloId, nuclear);
    if (err) return err;
    const price = nuclear ? NUCLEAR : MISSILE;
    if (this.sim.national && !this.sim.national.chargeWorks(slot, price.usd, nuclear ? 'Míssil com ogiva nuclear' : 'Míssil balístico')) return 'Verba de obras insuficiente para o míssil';
    this.sim.spendResources(slot, price.cost);
    const s = this.silo(siloId);
    s.building = this.sim.duration(slot, price.buildSeconds * TICK_RATE);
    s.buildingNuclear = nuclear;
    s.paid = { ...price.cost };
    s.usd = this.sim.national ? price.usd : 0;
    return null;
  }

  prepareBlocker(slot: Slot, siloId: EntityId, x: number, y: number, nuclear = false): string | null {
    const b = this.building(siloId);
    if (!this.operational(b, 'missile_silo', slot)) return 'Silo de mísseis inválido ou inoperante';
    if (!this.techs(slot).includes(MISSILE.tech)) return 'Exige a pesquisa Mísseis balísticos';
    const s = this.silo(siloId);
    if (nuclear ? (s.nuclear ?? 0) < 1 : s.missiles - (s.nuclear ?? 0) < 1) return nuclear ? 'Sem míssil nuclear no silo' : 'Sem míssil convencional no silo';
    if (this.launches.some((l) => l.siloId === siloId && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching'))) return 'O silo já tem um lançamento em andamento';
    const p = this.sim.clampToMap({ x, y });
    const c = this.sim.grid.worldToCell(p);
    const owner = this.sim.territoryOwner(c.cx, c.cy);
    // alvo: território de um país com quem há guerra, num ponto que o jogador vê ou cujo edifício já descobriu
    if (owner < 0 || owner === slot || !this.sim.formalWar(slot, owner)) return 'O alvo precisa estar no território de um país com quem você está em guerra';
    const seen = this.sim.isVisibleTo(slot, p) || this.sim.buildings.some((bb) => bb.owner === owner && this.isKnown(slot, bb.id) && dist(bb.pos, p) <= MISSILE.radius + 2);
    if (!seen) return 'Alvo não observado: precisa estar à vista ou junto de um edifício já descoberto';
    return null;
  }

  prepare(slot: Slot, siloId: EntityId, x: number, y: number, nuclear = false): string | null {
    const err = this.prepareBlocker(slot, siloId, x, y, nuclear);
    if (err) return err;
    const b = this.building(siloId)!;
    const p = this.sim.clampToMap({ x, y });
    const c = this.sim.grid.worldToCell(p);
    const st = this.silo(siloId);
    st.missiles--;
    if (nuclear) st.nuclear = (st.nuclear ?? 0) - 1;
    const gen = buildingEffects('missile_silo', b.level).missileGen;
    const spec = missileSpec(gen);
    const l: MissileLaunch = {
      id: this.nextId++,
      owner: slot,
      siloId,
      target: p,
      targetOwner: this.sim.territoryOwner(c.cx, c.cy),
      state: 'preparing',
      timer: spec.prepareSeconds * TICK_RATE,
      from: { ...b.pos },
      flightTicks: Math.max(1, Math.round((dist(b.pos, p) / spec.speed) * TICK_RATE)),
      startTick: this.sim.tick,
      result: null,
      gen,
      ...(nuclear ? { nuclear: true } : {}),
    };
    this.launches.push(l);
    this.missileEvent(l, 'Míssil em preparação (abastecimento)');
    return null;
  }

  /** Autorização final: só depois de armado, e a guerra ainda precisa valer. */
  authorize(slot: Slot, launchId: number): string | null {
    const l = this.launches.find((x) => x.id === launchId);
    if (!l || l.owner !== slot) return 'Lançamento inválido';
    if (l.state !== 'armed') return l.state === 'preparing' ? 'Aguarde o fim da preparação' : 'Lançamento não está aguardando autorização';
    if (!this.sim.formalWar(slot, l.targetOwner)) return 'Sem estado de guerra com o dono do alvo: lançamento bloqueado';
    if (!this.operational(this.building(l.siloId), 'missile_silo', slot)) return 'Silo inoperante';
    l.state = 'launching';
    l.timer = missileSpec(l.gen ?? 1).launchSeconds * TICK_RATE;
    this.missileEvent(l, 'Lançamento autorizado: contagem final');
    return null;
  }

  /** Abortar antes do lançamento: o míssil volta ao silo. */
  abort(slot: Slot, launchId: number): string | null {
    const l = this.launches.find((x) => x.id === launchId);
    if (!l || l.owner !== slot) return 'Lançamento inválido';
    if (l.state !== 'preparing' && l.state !== 'armed') return 'Não é mais possível abortar';
    l.state = 'aborted';
    l.endTick = this.sim.tick;
    const st = this.silo(l.siloId);
    st.missiles++;
    if (l.nuclear) st.nuclear = (st.nuclear ?? 0) + 1;
    this.missileEvent(l, 'Lançamento abortado: míssil devolvido ao silo');
    return null;
  }

  /** Interceptadores da bateria (uma bateria nova já vem com o magazine cheio). */
  domeState(id: EntityId): DomeState {
    return (this.domes[id] ??= { ready: IRON_DOME.magazine, reload: 0, cooldown: 0 });
  }

  /** Recarga dos interceptadores, um por vez, pagando cada um; e a espera dos lançadores entre engajamentos. */
  private stepDomes(): void {
    for (const id of Object.keys(this.domes).map(Number)) if (!this.building(id)) delete this.domes[id];
    for (const b of this.sim.buildings) {
      if (b.type !== 'iron_dome' || b.progress < 1 || b.hp <= 0) continue;
      const st = this.domeState(b.id);
      if (st.cooldown > 0) st.cooldown--;
      if (st.ready >= IRON_DOME.magazine || b.unpaid || !this.sim.isPowered(b)) continue;
      if (st.reload > 0) st.reload--;
      if (st.reload > 0) continue;
      if (!canAfford(this.sim.players[b.owner]!.resources, IRON_DOME.interceptorCost)) continue;
      this.sim.spendResources(b.owner, IRON_DOME.interceptorCost);
      st.ready++;
      st.reload = st.ready < IRON_DOME.magazine ? IRON_DOME.reloadSeconds * TICK_RATE : 0;
    }
  }

  /**
   * Míssil comum lançado contra uma área protegida: a bateria mais perto do alvo, com interceptadores e lançadores
   * prontos, dispara o par de interceptadores. O acerto é sorteado agora e aplicado no encontro.
   */
  private domeEngage(l: MissileLaunch): void {
    if ((l.gen ?? 1) >= 2 || l.nuclear) return;
    const tick = this.sim.tick;
    let best: { b: Building; d: number } | null = null;
    for (const b of this.sim.buildings) {
      if (b.type !== 'iron_dome' || b.owner !== l.targetOwner || b.progress < 1 || b.hp <= 0 || b.unpaid || !this.sim.isPowered(b)) continue;
      const d = dist(b.pos, l.target);
      if (d > IRON_DOME.range) continue;
      const st = this.domeState(b.id);
      if (st.ready < IRON_DOME.perEngagement || st.cooldown > 0) continue;
      if (!best || d < best.d) best = { b, d };
    }
    if (!best) return;
    const st = this.domeState(best.b.id);
    st.ready -= IRON_DOME.perEngagement;
    st.cooldown = IRON_DOME.cooldownSeconds * TICK_RATE;
    if (st.reload <= 0) st.reload = IRON_DOME.reloadSeconds * TICK_RATE;
    const meetTick = tick + Math.max(1, Math.round(l.flightTicks * IRON_DOME.meetProgress));
    const fireTick = Math.max(tick, meetTick - Math.round(IRON_DOME.interceptorFlightSeconds * TICK_RATE));
    const hit = this.rand() < IRON_DOME.hitChance;
    l.dome = { domeId: best.b.id, meetTick, hit };
    this.sim.emitTrade({
      type: 'dome',
      tick,
      owner: best.b.owner,
      attacker: l.owner,
      domeId: best.b.id,
      launchId: l.id,
      pos: { ...best.b.pos },
      from: { ...l.from },
      target: { ...l.target },
      meet: (meetTick - tick) / Math.max(1, l.flightTicks),
      fireDelay: (fireTick - tick) / TICK_RATE,
      flight: (meetTick - fireTick) / TICK_RATE,
      hit,
    });
  }

  private missileEvent(l: MissileLaunch, text: string): void {
    const r = l.result && !l.result.intercepted ? { damage: l.result.damage, destroyed: l.result.destroyed, casualties: l.result.casualties } : {};
    this.sim.emitTrade({ type: 'missile', tick: this.sim.tick, owner: l.owner, launchId: l.id, state: l.state, text, from: { ...l.from }, target: { ...l.target }, targetOwner: l.targetOwner, gen: l.gen ?? 1, ...(l.nuclear ? { nuclear: true } : {}), ...r });
  }

  private impact(l: MissileLaunch): void {
    const base = missileSpec(l.gen ?? 1);
    const spec = l.nuclear ? { ...base, damage: NUCLEAR.damage, radius: NUCLEAR.radius, interceptChance: base.interceptChance * NUCLEAR.interceptMul, maxIntercept: base.maxIntercept * NUCLEAR.interceptMul } : base;
    // interceptação pelas baterias antiaéreas perto do alvo
    let chance = 0;
    for (const b of this.sim.buildings)
      if (b.owner === l.targetOwner && b.type === 'aa_battery' && b.progress >= 1 && b.hp > 0 && this.sim.isPowered(b) && dist(b.pos, l.target) <= MISSILE.interceptRange) chance += spec.interceptChance;
    for (const u of this.sim.units)
      if (u.owner === l.targetOwner && u.hp > 0 && UNITS[u.type].airDefense && dist(u.pos, l.target) <= MISSILE.interceptRange) chance += spec.interceptChance * MOBILE_AA_FACTOR;
    chance = Math.min(spec.maxIntercept, chance * (this.sim.bonusOf(l.targetOwner).aaMul ?? 1));
    if (this.rand() < chance) {
      l.state = 'intercepted';
      l.endTick = this.sim.tick;
      l.result = { damage: 0, destroyed: 0, casualties: 0, intercepted: true };
      this.missileEvent(l, 'Míssil interceptado pela defesa antiaérea');
      return;
    }
    // dano em área, decrescente com a distância, em tudo o que estiver no raio
    let damage = 0;
    let destroyed = 0;
    let casualties = 0;
    for (const e of [...this.sim.entities.values()]) {
      if (e.hp <= 0) continue;
      const d = dist(e.pos, l.target);
      if (d > spec.radius + this.sim.entityRadius(e)) continue;
      const dmg = spec.damage * Math.max(0.25, 1 - d / (spec.radius + 1));
      damage += Math.min(dmg, e.hp);
      if (e.kind === 'building') {
        if (e.type === 'oil_tank' && e.stored > 0) this.sim.loseTankOil(e, e.stored * Math.min(1, dmg / Math.max(1, e.hp)));
        if (this.sim.damageBuilding(e, dmg, l.owner)) destroyed++;
      } else if (this.sim.damageUnit(e, dmg, l.owner)) casualties++;
    }
    l.state = 'impact';
    l.endTick = this.sim.tick;
    l.result = { damage: Math.round(damage), destroyed, casualties, intercepted: false };
    this.missileEvent(l, `Impacto: ${Math.round(damage)} de dano, ${destroyed} edifício(s) destruído(s), ${casualties} baixa(s)`);
  }

  // -------------------------------------------------------------- passo

  step(): void {
    const tick = this.sim.tick;
    // descoberta: o que cada jogador vê fica registrado (a cada segundo)
    if (tick % TICK_RATE === 0) {
      for (const p of this.sim.players) for (const b of this.sim.buildings) if (b.owner !== p.slot && this.sim.canSee(p.slot, b)) this.remember(p.slot, b.id);
      this.reveals = this.reveals.filter((r) => r.untilTick > tick);
      this.upkeep();
    }
    for (const a of this.aircraft) {
      if (a.state === 'building' || a.state === 'maintenance') {
        const base = this.building(a.baseId);
        // base sem energia: a linha de montagem e a manutenção param
        if (!base || !this.sim.isPowered(base)) continue;
        if (--a.timer <= 0) a.state = 'ready';
      }
    }
    // aeronaves de uma base destruída: as que estavam no hangar se perdem
    for (const a of [...this.aircraft])
      if (a.state !== 'mission' && !this.building(a.baseId)) {
        this.aircraft = this.aircraft.filter((x) => x.id !== a.id);
        this.sim.emitTrade({ type: 'aircraft_lost', tick, owner: a.owner, aircraftType: a.type, pos: { ...a.home } });
      }
    this.stepDogfights(tick);
    for (const m of this.missions) {
      if (m.state === 'done') continue;
      const t = tick - m.launchTick;
      if (m.state === 'outbound' && t >= m.legTicks) this.resolve(m);
      else if (m.state === 'returning' && t >= m.legTicks * 2) {
        m.state = 'done';
        const home = this.building(m.baseId);
        // base capturada pelo inimigo: não há onde pousar
        const base = home && home.owner === m.owner ? home : null;
        for (const id of m.aircraft) {
          const a = this.aircraft.find((x) => x.id === id);
          if (!a) continue;
          if (!base) {
            // sem base para pousar: aeronave perdida
            this.aircraft = this.aircraft.filter((x) => x.id !== id);
            this.sim.emitTrade({ type: 'aircraft_lost', tick, owner: a.owner, aircraftType: a.type, pos: { ...m.from } });
            continue;
          }
          a.state = 'maintenance';
          a.timer = AIRCRAFT[a.type].maintenanceSeconds * TICK_RATE;
          a.missionId = null;
        }
      }
    }
    if (tick % (TICK_RATE * 30) === 0) this.missions = this.missions.filter((m) => m.state !== 'done' || tick - m.launchTick < TICK_RATE * 120);
    this.stepDomes();
    // silos: produção de mísseis
    for (const [id, s] of Object.entries(this.silos)) {
      const b = this.building(Number(id));
      if (!b) {
        delete this.silos[Number(id)];
        continue;
      }
      if (s.building > 0 && !b.unpaid && this.sim.isPowered(b) && --s.building <= 0) {
        s.building = 0;
        s.missiles++;
        if (s.buildingNuclear) s.nuclear = (s.nuclear ?? 0) + 1;
        const nuc = !!s.buildingNuclear;
        s.buildingNuclear = false;
        this.sim.emitTrade({ type: 'missile', tick, owner: b.owner, launchId: 0, state: 'stored', text: nuc ? 'Míssil com ogiva nuclear pronto no silo' : 'Míssil pronto no silo', from: { ...b.pos }, target: { ...b.pos }, targetOwner: b.owner });
      }
    }
    for (const l of this.launches) {
      if (l.state === 'preparing') {
        if (!this.building(l.siloId)) {
          l.state = 'aborted';
          l.endTick = tick;
          continue;
        }
        if (--l.timer <= 0) {
          l.state = 'armed';
          this.missileEvent(l, 'Míssil armado: aguardando autorização');
        }
      } else if (l.state === 'launching') {
        if (--l.timer <= 0) {
          l.state = 'flight';
          l.timer = l.flightTicks;
          this.missileEvent(l, 'Míssil lançado');
          this.domeEngage(l);
        }
      } else if (l.state === 'flight') {
        if (l.dome && !l.dome.resolved && tick >= l.dome.meetTick) {
          l.dome.resolved = true;
          if (l.dome.hit) {
            l.state = 'intercepted';
            l.endTick = tick;
            l.result = { damage: 0, destroyed: 0, casualties: 0, intercepted: true };
            this.missileEvent(l, 'Míssil interceptado pelo Domo de Ferro');
            continue;
          }
        }
        if (--l.timer <= 0) this.impact(l);
      }
    }
    if (tick % (TICK_RATE * 30) === 0) this.launches = this.launches.filter((l) => !['impact', 'intercepted', 'aborted'].includes(l.state) || tick - (l.endTick ?? l.startTick) < TICK_RATE * 120);
  }

  /**
   * Edifício capturado (prefeitura tomada): os aviões do antigo dono naquela base se perdem (os
   * que estão em voo não têm onde pousar) e o lançamento em preparação no silo é abortado.
   */
  onCaptured(b: Building, prevOwner: Slot): void {
    if (b.type === 'airbase')
      for (const a of [...this.aircraft])
        if (a.baseId === b.id && a.owner === prevOwner && a.state !== 'mission') {
          this.aircraft = this.aircraft.filter((x) => x.id !== a.id);
          this.sim.emitTrade({ type: 'aircraft_lost', tick: this.sim.tick, owner: a.owner, aircraftType: a.type, pos: { ...a.home } });
        }
    if (b.type === 'missile_silo')
      for (const l of this.launches)
        if (l.siloId === b.id && l.owner === prevOwner && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching')) {
          l.state = 'aborted';
          l.endTick = this.sim.tick;
          this.missileEvent(l, 'Lançamento abortado: o silo foi capturado');
        }
  }

  // -------------------------------------------------------------- combate aéreo

  /** Formações em voo com a posição e a visão (a maior entre os aviões da formação). */
  flightSights(): { owner: Slot; pos: Vec2; sight: number }[] {
    const out: { owner: Slot; pos: Vec2; sight: number }[] = [];
    for (const m of this.missions) {
      if (!this.inFlight(m)) continue;
      let sight = 0;
      for (const id of m.aircraft) {
        const a = this.aircraft.find((x) => x.id === id);
        if (a) sight = Math.max(sight, FLIGHT_SIGHT[a.type]);
      }
      if (sight > 0) out.push({ owner: m.owner, pos: this.missionPos(m), sight });
    }
    return out;
  }

  private inFlight(m: AirMission | undefined): m is AirMission {
    return !!m && (m.state === 'outbound' || m.state === 'returning') && m.aircraft.length > 0;
  }

  private planesOf(m: AirMission): Aircraft[] {
    return m.aircraft.map((id) => this.aircraft.find((a) => a.id === id)).filter((a): a is Aircraft => !!a);
  }

  /** Missão presa num combate aéreo em andamento (não avança enquanto luta). */
  engaged(missionId: number): boolean {
    return this.dogfights.some((d) => d.a === missionId || d.b === missionId);
  }

  /**
   * Esquadrilhas de países em guerra que se cruzam no ar travam combate (se ao menos uma tiver
   * caças): as duas param no lugar e trocam tiros por algumas rodadas. Cada caça tem uma chance
   * de derrubar uma aeronave inimiga por rodada; o bombardeiro só se defende com metralhadoras.
   */
  private stepDogfights(tick: number): void {
    // novos engajamentos
    const flying = this.missions.filter((m) => this.inFlight(m) && !this.engaged(m.id));
    for (let i = 0; i < flying.length; i++)
      for (let j = i + 1; j < flying.length; j++) {
        const a = flying[i]!;
        const b = flying[j]!;
        if (a.owner === b.owner || !this.sim.hostile(a.owner, b.owner) || a.fought?.includes(b.id)) continue;
        if (this.engaged(a.id) || this.engaged(b.id)) continue;
        if (!this.planesOf(a).some((p) => p.type === 'fighter') && !this.planesOf(b).some((p) => p.type === 'fighter')) continue;
        if (dist(this.missionPos(a), this.missionPos(b)) > AIR.dogfightRange) continue;
        (a.fought ??= []).push(b.id);
        (b.fought ??= []).push(a.id);
        this.dogfights.push({ a: a.id, b: b.id, round: 0, nextTick: tick });
      }
    for (const d of [...this.dogfights]) {
      const a = this.missions.find((m) => m.id === d.a);
      const b = this.missions.find((m) => m.id === d.b);
      const over = !this.inFlight(a) || !this.inFlight(b) || d.round >= AIR.dogfightRounds || !this.sim.hostile(a.owner, b.owner);
      if (over) {
        this.dogfights = this.dogfights.filter((x) => x !== d);
        continue;
      }
      // as duas esquadrilhas ficam no lugar durante o combate (o relógio da missão não corre)
      a.launchTick++;
      b.launchTick++;
      if (tick < d.nextTick) continue;
      d.round++;
      d.nextTick = tick + TICK_RATE;
      this.dogfightRound(a, b);
    }
  }

  private dogfightRound(a: AirMission, b: AirMission): void {
    const pa = this.missionPos(a);
    const pb = this.missionPos(b);
    // disparos simultâneos: quem atira nesta rodada é decidido antes das perdas
    const shots: { from: AirMission; to: AirMission; chance: number }[] = [];
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const)
      for (const p of this.planesOf(from)) {
        const chance = p.type === 'fighter' ? AIR.dogfightKill : p.type === 'bomber' ? AIR.bomberGunKill : 0;
        if (chance > 0) shots.push({ from, to, chance });
      }
    for (const s of shots) {
      const victims = this.planesOf(s.to);
      if (!victims.length) continue;
      const kill = this.rand() < s.chance;
      const at = s.from === a ? pa : pb;
      const to = s.from === a ? pb : pa;
      this.sim.emitTrade({ type: 'dogfight', tick: this.sim.tick, owner: s.from.owner, victim: s.to.owner, missionId: s.from.id, targetMissionId: s.to.id, from: { ...at }, to: { ...to }, kill });
      if (!kill) continue;
      // caças inimigos são o alvo preferido; sem eles, qualquer aeronave da esquadrilha
      const fighters = victims.filter((v) => v.type === 'fighter');
      const pool = fighters.length ? fighters : victims;
      const v = pool[Math.floor(this.rand() * pool.length)]!;
      this.aircraft = this.aircraft.filter((x) => x.id !== v.id);
      s.to.aircraft = s.to.aircraft.filter((id) => id !== v.id);
      this.sim.emitTrade({ type: 'aircraft_lost', tick: this.sim.tick, owner: v.owner, aircraftType: v.type, pos: { ...to }, air: true });
    }
    for (const m of [a, b]) {
      if (m.aircraft.length) continue;
      // esquadrilha inteira abatida no combate
      const pos = this.missionPos(m);
      m.state = 'done';
      m.result = { shotDown: 0, damage: 0, oilLost: 0, destroyed: false, revealed: 0, text: 'Esquadrilha abatida em combate aéreo' };
      this.sim.emitTrade({ type: 'air_mission', tick: this.sim.tick, owner: m.owner, missionId: m.id, kind: m.kind, phase: 'result', text: m.result.text, pos });
    }
  }

  /** Suprimentos por segundo de manutenção das aeronaves do jogador (cobrados com os edifícios). */
  upkeepPerSecond(slot: Slot): number {
    let s = 0;
    for (const a of this.aircraft) if (a.owner === slot && a.state !== 'building') s += AIRCRAFT[a.type].upkeep;
    return s;
  }

  /** Manutenção em atraso: as aeronaves prontas ficam em terra até a conta ser paga. */
  private upkeep(): void {
    for (const p of this.sim.players) {
      const mine = this.aircraft.filter((a) => a.owner === p.slot && a.state !== 'building');
      if (!mine.length) continue;
      const paid = !p.unpaidUpkeep.supplies;
      for (const a of mine) {
        if (!paid && a.state === 'ready') a.state = 'grounded';
        else if (paid && a.state === 'grounded') a.state = 'ready';
      }
    }
  }

  /** Posição de uma missão em voo (para desenhar e para a visão). */
  missionPos(m: AirMission): Vec2 {
    const t = this.sim.tick - m.launchTick;
    const k = m.state === 'outbound' ? Math.min(1, t / m.legTicks) : m.state === 'returning' ? Math.max(0, 2 - t / m.legTicks) : 0;
    return { x: m.from.x + (m.target.x - m.from.x) * k, y: m.from.y + (m.target.y - m.from.y) * k };
  }

  launchPos(l: MissileLaunch): Vec2 {
    if (l.state !== 'flight') return { ...l.from };
    const k = 1 - l.timer / l.flightTicks;
    return { x: l.from.x + (l.target.x - l.from.x) * k, y: l.from.y + (l.target.y - l.from.y) * k };
  }
}

/** Combustível (cadeia produtiva) usado na montagem de cada aeronave, no lugar de parte do petróleo. */
export const AIRCRAFT_FUEL: Record<AircraftType, number> = { fighter: 10, recon: 6, transport: 8, bomber: 20 };

/**
 * Ficha da aeronave com o bônus do país aplicado ao custo e, com combustível em estoque, a troca de
 * parte do petróleo por combustível (mesma regra no servidor e no HUD).
 */
export function aircraftFor(type: AircraftType, bonus?: CountryBonus, goods?: Goods): AircraftDef & { goods?: Partial<Goods> } {
  const def = AIRCRAFT[type];
  const mul = bonus?.aircraftCostMul ?? 1;
  let out: AircraftDef = def;
  if (mul !== 1) {
    const cost: Cost = {};
    for (const [r, v] of Object.entries(def.cost) as [keyof Cost, number][]) cost[r] = Math.max(1, Math.round(v * mul));
    out = { ...def, cost, usd: Math.round(def.usd * mul) };
  }
  const sub = substituteGoods(out.cost, { fuel: AIRCRAFT_FUEL[type] }, goods);
  return Object.keys(sub.goods).length ? { ...out, cost: sub.cost, goods: sub.goods } : out;
}

export const isAircraftType = (v: unknown): v is AircraftType => typeof v === 'string' && (AIRCRAFT_TYPES as string[]).includes(v);
