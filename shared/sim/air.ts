import { BUILDINGS, TICK_RATE, UNITS, canAfford, type Cost } from './config.ts';
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

export type AircraftType = 'fighter' | 'recon' | 'transport';
export const AIRCRAFT_TYPES: AircraftType[] = ['fighter', 'recon', 'transport'];

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
}

export const AIRCRAFT: Record<AircraftType, AircraftDef> = {
  fighter: {
    label: 'Caça multifunção',
    role: 'Ataque a alvos descobertos e interceptação de ataques perto da base',
    cost: { iron: 60, oil: 40, supplies: 50 },
    usd: 3_000_000,
    buildSeconds: 30,
    range: 170,
    speed: 14,
    fuelPerWorld: 0.12,
    upkeep: 0.04,
    maintenanceSeconds: 25,
    strikeDamage: 180,
  },
  recon: {
    label: 'Reconhecimento',
    role: 'Revela uma área por 40 s e registra os edifícios inimigos vistos',
    cost: { iron: 30, oil: 25, supplies: 30 },
    usd: 1_500_000,
    buildSeconds: 20,
    range: 200,
    speed: 16,
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
    speed: 10,
    fuelPerWorld: 0,
    upkeep: 0.03,
    maintenanceSeconds: 0,
    strikeDamage: 0,
  },
};

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
}

export interface SiloState {
  missiles: number;
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
      JSON.stringify({ nextId: this.nextId, seed: this.seed, aircraft: this.aircraft, missions: this.missions, launches: this.launches, silos: this.silos, reveals: this.reveals, known }),
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
    const def = AIRCRAFT[type];
    if (this.aircraftAt(baseId).length >= AIR.hangarPerBase) return `Hangar cheio: ${AIR.hangarPerBase} aeronaves por base`;
    const p = this.sim.players[slot]!;
    if (p.recruits < 1) return 'Nenhum recruta para piloto: aliste recrutas na base militar';
    if (!canAfford(p.resources, def.cost)) return `Recursos insuficientes: faltam ${missingText(p.resources, def.cost)}`;
    const f = this.funds(slot);
    if (f !== null && f + 1e-6 < def.usd) return 'Verba de obras insuficiente para a aeronave';
    return null;
  }

  build(slot: Slot, baseId: EntityId, type: AircraftType): string | null {
    const err = this.buildBlocker(slot, baseId, type);
    if (err) return err;
    const def = AIRCRAFT[type];
    if (this.sim.national && !this.sim.national.chargeWorks(slot, def.usd, `${def.label}`)) return 'Verba de obras insuficiente para a aeronave';
    this.sim.spendResources(slot, def.cost);
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
    const need: AircraftType = kind === 'strike' ? 'fighter' : 'recon';
    if (planes.some((a) => a!.type !== need)) return kind === 'strike' ? 'Ataque: só caças' : 'Reconhecimento: só aeronaves de reconhecimento';
    let pos: Vec2;
    if (kind === 'strike') {
      if (!this.techs(slot).includes(AIR.strikeTech)) return 'Ataque aéreo a infraestrutura exige a pesquisa Munição guiada';
      const t = target.buildingId !== undefined ? this.sim.entities.get(target.buildingId) : undefined;
      // só alvos já descobertos: o ataque não ignora a névoa de guerra
      if (!t || t.kind !== 'building' || !this.isKnown(slot, t.id)) return 'Alvo não descoberto: faça reconhecimento ou aviste o edifício antes';
      if (t.owner === slot || !this.sim.hostile(slot, t.owner)) return 'Sem estado de guerra com o dono do alvo';
      pos = t.pos;
    } else {
      if (target.x === undefined || target.y === undefined) return 'Escolha um ponto para o reconhecimento';
      pos = this.sim.clampToMap({ x: target.x, y: target.y });
    }
    const d = dist(base!.pos, pos);
    const range = Math.min(...planes.map((a) => AIRCRAFT[a!.type].range));
    if (d > range) return `Fora do alcance: ${Math.round(d)} de ${range}`;
    const fuel = planes.reduce((s, a) => s + AIRCRAFT[a!.type].fuelPerWorld * d * 2, 0);
    if (this.sim.players[slot]!.resources.oil + 1e-6 < fuel) return `Combustível insuficiente: a missão consome ${Math.ceil(fuel)} de petróleo`;
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
    this.sim.spendResources(slot, { oil: fuel });
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
      if (b.type === 'aa_battery' && d <= AIR.aaRange) chance += AIR.aaChance;
      else if (b.type === 'tower' && d <= AIR.aaRange * 0.7) chance += AIR.towerAaChance;
      else if (b.type === 'airbase' && d <= AIR.interceptRadius) chance += AIR.fighterInterceptChance * this.aircraftAt(b.id).filter((a) => a.type === 'fighter' && a.state === 'ready').length;
    }
    // antiaérea móvel acompanhando as tropas: como uma bateria, um pouco menos eficaz
    for (const u of this.sim.units) if (enemy(u.owner) && u.hp > 0 && UNITS[u.type].airDefense && dist(u.pos, m.target) <= AIR.aaRange) chance += AIR.aaChance * MOBILE_AA_FACTOR;
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
        for (const id of m.aircraft) {
          const a = this.aircraft.find((x) => x.id === id)!;
          const min = guided ? AIR.precisionMinGuided : AIR.precisionMin;
          r.damage += AIRCRAFT[a.type].strikeDamage * (min + (1 - min) * this.rand());
        }
        r.damage = Math.round(r.damage);
        const before = t.hp;
        // petróleo perdido: proporcional ao dano e limitado ao que estava no tanque no impacto
        if (t.type === 'oil_tank' && t.stored > 0) {
          const frac = Math.min(1, r.damage / Math.max(1, before));
          r.oilLost = Math.round(this.sim.loseTankOil(t, t.stored * frac) * 10) / 10;
        }
        r.destroyed = this.sim.damageBuilding(t, r.damage, m.owner);
        r.text = `${BUILDINGS[t.type].label}: ${r.damage} de dano${r.destroyed ? ' (destruído)' : ''}${r.oilLost ? `, ${r.oilLost} de petróleo perdidos` : ''}`;
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

  missileBuildBlocker(slot: Slot, siloId: EntityId): string | null {
    const b = this.building(siloId);
    if (!this.operational(b, 'missile_silo', slot)) return 'Silo de mísseis inválido ou inoperante';
    if (!this.techs(slot).includes(MISSILE.tech)) return 'Exige a pesquisa Mísseis balísticos';
    const s = this.silo(siloId);
    if (s.building > 0) return 'Já há um míssil em produção neste silo';
    const reserved = this.launches.filter((l) => l.siloId === siloId && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching')).length;
    if (s.missiles + reserved >= MISSILE.capacityPerSilo) return `Silo cheio: ${MISSILE.capacityPerSilo} mísseis por silo`;
    const p = this.sim.players[slot]!;
    if (!canAfford(p.resources, MISSILE.cost)) return `Recursos insuficientes: faltam ${missingText(p.resources, MISSILE.cost)}`;
    const f = this.funds(slot);
    if (f !== null && f + 1e-6 < MISSILE.usd) return 'Verba de obras insuficiente para o míssil';
    return null;
  }

  buildMissile(slot: Slot, siloId: EntityId): string | null {
    const err = this.missileBuildBlocker(slot, siloId);
    if (err) return err;
    if (this.sim.national && !this.sim.national.chargeWorks(slot, MISSILE.usd, 'Míssil balístico')) return 'Verba de obras insuficiente para o míssil';
    this.sim.spendResources(slot, MISSILE.cost);
    const s = this.silo(siloId);
    s.building = this.sim.duration(slot, MISSILE.buildSeconds * TICK_RATE);
    s.paid = { ...MISSILE.cost };
    s.usd = this.sim.national ? MISSILE.usd : 0;
    return null;
  }

  prepareBlocker(slot: Slot, siloId: EntityId, x: number, y: number): string | null {
    const b = this.building(siloId);
    if (!this.operational(b, 'missile_silo', slot)) return 'Silo de mísseis inválido ou inoperante';
    if (!this.techs(slot).includes(MISSILE.tech)) return 'Exige a pesquisa Mísseis balísticos';
    if (this.silo(siloId).missiles < 1) return 'Sem míssil no silo';
    if (this.launches.some((l) => l.siloId === siloId && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching'))) return 'O silo já tem um lançamento em andamento';
    const p = this.sim.clampToMap({ x, y });
    const c = this.sim.grid.worldToCell(p);
    const owner = this.sim.territoryOwner(c.cx, c.cy);
    // alvo: território de um país com quem há guerra, num ponto que o jogador vê ou cujo edifício já descobriu
    if (owner < 0 || owner === slot || !this.sim.hostile(slot, owner)) return 'O alvo precisa estar no território de um país com quem você está em guerra';
    const seen = this.sim.isVisibleTo(slot, p) || this.sim.buildings.some((bb) => bb.owner === owner && this.isKnown(slot, bb.id) && dist(bb.pos, p) <= MISSILE.radius + 2);
    if (!seen) return 'Alvo não observado: precisa estar à vista ou junto de um edifício já descoberto';
    return null;
  }

  prepare(slot: Slot, siloId: EntityId, x: number, y: number): string | null {
    const err = this.prepareBlocker(slot, siloId, x, y);
    if (err) return err;
    const b = this.building(siloId)!;
    const p = this.sim.clampToMap({ x, y });
    const c = this.sim.grid.worldToCell(p);
    this.silo(siloId).missiles--;
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
    if (!this.sim.hostile(slot, l.targetOwner)) return 'Sem estado de guerra com o dono do alvo: lançamento bloqueado';
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
    this.silo(l.siloId).missiles++;
    this.missileEvent(l, 'Lançamento abortado: míssil devolvido ao silo');
    return null;
  }

  private missileEvent(l: MissileLaunch, text: string): void {
    const r = l.result && !l.result.intercepted ? { damage: l.result.damage, destroyed: l.result.destroyed, casualties: l.result.casualties } : {};
    this.sim.emitTrade({ type: 'missile', tick: this.sim.tick, owner: l.owner, launchId: l.id, state: l.state, text, from: { ...l.from }, target: { ...l.target }, targetOwner: l.targetOwner, gen: l.gen ?? 1, ...r });
  }

  private impact(l: MissileLaunch): void {
    const spec = missileSpec(l.gen ?? 1);
    // interceptação pelas baterias antiaéreas perto do alvo
    let chance = 0;
    for (const b of this.sim.buildings)
      if (b.owner === l.targetOwner && b.type === 'aa_battery' && b.progress >= 1 && b.hp > 0 && dist(b.pos, l.target) <= MISSILE.interceptRange) chance += spec.interceptChance;
    for (const u of this.sim.units)
      if (u.owner === l.targetOwner && u.hp > 0 && UNITS[u.type].airDefense && dist(u.pos, l.target) <= MISSILE.interceptRange) chance += spec.interceptChance * MOBILE_AA_FACTOR;
    chance = Math.min(spec.maxIntercept, chance);
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
        if (!this.building(a.baseId)) continue;
        if (--a.timer <= 0) a.state = 'ready';
      }
    }
    // aeronaves de uma base destruída: as que estavam no hangar se perdem
    for (const a of [...this.aircraft])
      if (a.state !== 'mission' && !this.building(a.baseId)) {
        this.aircraft = this.aircraft.filter((x) => x.id !== a.id);
        this.sim.emitTrade({ type: 'aircraft_lost', tick, owner: a.owner, aircraftType: a.type, pos: { ...a.home } });
      }
    for (const m of this.missions) {
      if (m.state === 'done') continue;
      const t = tick - m.launchTick;
      if (m.state === 'outbound' && t >= m.legTicks) this.resolve(m);
      else if (m.state === 'returning' && t >= m.legTicks * 2) {
        m.state = 'done';
        const base = this.building(m.baseId);
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
    // silos: produção de mísseis
    for (const [id, s] of Object.entries(this.silos)) {
      const b = this.building(Number(id));
      if (!b) {
        delete this.silos[Number(id)];
        continue;
      }
      if (s.building > 0 && !b.unpaid && --s.building <= 0) {
        s.building = 0;
        s.missiles++;
        this.sim.emitTrade({ type: 'missile', tick, owner: b.owner, launchId: 0, state: 'stored', text: 'Míssil pronto no silo', from: { ...b.pos }, target: { ...b.pos }, targetOwner: b.owner });
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
        }
      } else if (l.state === 'flight') {
        if (--l.timer <= 0) this.impact(l);
      }
    }
    if (tick % (TICK_RATE * 30) === 0) this.launches = this.launches.filter((l) => !['impact', 'intercepted', 'aborted'].includes(l.state) || tick - (l.endTick ?? l.startTick) < TICK_RATE * 120);
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

export const isAircraftType = (v: unknown): v is AircraftType => typeof v === 'string' && (AIRCRAFT_TYPES as string[]).includes(v);
