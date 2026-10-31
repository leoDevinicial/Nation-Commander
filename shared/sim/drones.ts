import { BUILDINGS, TICK_RATE, UNITS } from './config.ts';
import type { Simulation } from './Simulation.ts';
import type { Building, Slot, Vec2 } from './types.ts';

/**
 * Drone de ataque (munição vagante), a partir da Era Digital.
 *
 * Feito na Base Aérea como as outras aeronaves, mas é consumido no ataque. Lançado contra um ponto do mapa, ele voa no
 * piloto automático, chega à área e mergulha no alvo. Nos primeiros `takeoverSeconds` do voo o dono pode assumir o
 * controle em primeira pessoa: daí em diante quem pilota é o jogador (virar, subir, descer, acelerar e detonar), até o
 * impacto, a bateria acabar ou a antiaérea derrubar o drone.
 *
 * Tudo é decidido no servidor (KAC): o cliente só manda a intenção dos comandos (de −1 a 1, limitados aqui), e a
 * posição, a bateria, o choque e o dano são calculados na simulação. O drone só causa dano a quem está em guerra com o
 * dono; se bater em algo amigo ou no chão, explode sem efeito.
 */
export const DRONE = {
  /** Velocidades (unidades de mundo por segundo): lenta, de cruzeiro e com o acelerador no máximo. */
  slowSpeed: 3.0,
  cruiseSpeed: 5.4,
  boostSpeed: 8.6,
  /** Velocidade de curva (rad/s) e de subida/descida (unidades/s); o mergulho é mais rápido que a subida. */
  turnRate: 1.25,
  climbRate: 1.9,
  diveMul: 1.5,
  /**
   * Resposta do manche (1/s): o comando do piloto chega ao drone aos poucos (~0,3 s para a curva toda), sem trancos. O
   * cliente usa a mesma conta para prever o voo na câmera.
   */
  stickResponse: 3.2,
  /** Resposta do acelerador (1/s). */
  throttleResponse: 1.6,
  cruiseAlt: 5,
  maxAlt: 12,
  /** Bateria (s de voo no cruzeiro); acelerar gasta mais. */
  batterySeconds: 80,
  /** Janela para assumir o controle depois do lançamento (s). */
  takeoverSeconds: 10,
  /** Alcance a partir da base até o ponto escolhido. */
  range: 170,
  /** Ogiva: dano em tropas e em edifícios no raio (decresce com a distância). */
  unitDamage: 360,
  buildingDamage: 320,
  radius: 2.6,
  /** Visão do drone (a câmera dele): revela a área embaixo para o dono. */
  sight: 11,
  /** Antiaérea: chance por segundo de derrubar o drone, por bateria ao alcance (e defesa antiaérea móvel). */
  aaRange: 12,
  aaChance: 0.12,
  /** Sem comando do piloto por tanto tempo (conexão caiu), o drone segue reto, nivelado. */
  inputTimeoutSeconds: 2,
};

export type DronePhase = 'flight' | 'done';
export type DroneEnd = 'impact' | 'shot_down' | 'battery' | 'detonated';

export interface Drone {
  id: number;
  owner: Slot;
  pos: Vec2;
  alt: number;
  heading: number;
  speed: number;
  /** Variação de altitude no último passo (unidades/s), para a atitude no desenho. */
  climb: number;
  /** Ponto escolhido no lançamento (piloto automático). */
  target: Vec2;
  launchTick: number;
  /** Ticks de bateria restantes. */
  battery: number;
  controlled: boolean;
  input: { turn: number; climb: number; throttle: number };
  /** Manche já suavizado (o que está valendo neste passo); vai de 0 até `input` aos poucos. */
  turnNow?: number;
  climbNow?: number;
  lastInputTick: number;
  phase: DronePhase;
  end?: DroneEnd;
  endTick?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class DroneSystem {
  drones: Drone[] = [];

  constructor(
    private readonly sim: Simulation,
    private readonly rand: () => number,
    private readonly newId: () => number,
  ) {}

  toSave(): Drone[] {
    return JSON.parse(JSON.stringify(this.drones)) as Drone[];
  }

  load(list: Drone[] | undefined): void {
    this.drones = list ? (JSON.parse(JSON.stringify(list)) as Drone[]) : [];
  }

  /** Lança um drone da base rumo a `target`. A validação (base, aeronave pronta, alcance) fica em `AirSystem`. */
  launch(owner: Slot, base: Building, target: Vec2): Drone {
    const heading = Math.atan2(target.y - base.pos.y, target.x - base.pos.x);
    const d: Drone = {
      id: this.newId(),
      owner,
      pos: { ...base.pos },
      alt: 0.6,
      heading,
      speed: DRONE.cruiseSpeed,
      climb: 0,
      target: { ...target },
      launchTick: this.sim.tick,
      battery: DRONE.batterySeconds * TICK_RATE,
      controlled: false,
      input: { turn: 0, climb: 0, throttle: 0 },
      lastInputTick: this.sim.tick,
      phase: 'flight',
    };
    this.drones.push(d);
    this.sim.emitTrade({ type: 'drone', tick: this.sim.tick, owner, droneId: d.id, phase: 'launched', pos: { ...d.pos } });
    return d;
  }

  private own(slot: Slot, id: number): Drone | string {
    const d = this.drones.find((x) => x.id === id);
    if (!d || d.owner !== slot) return 'Drone inválido';
    if (d.phase !== 'flight') return 'O drone já caiu';
    return d;
  }

  /** Segundos que ainda restam para assumir o controle (0 = a janela fechou). */
  takeoverLeft(d: Drone): number {
    return Math.max(0, DRONE.takeoverSeconds - (this.sim.tick - d.launchTick) / TICK_RATE);
  }

  /** Assume (`take`) ou devolve ao piloto automático o controle do drone. */
  control(slot: Slot, id: number, take: boolean): string | null {
    const d = this.own(slot, id);
    if (typeof d === 'string') return d;
    if (take) {
      if (d.controlled) return null;
      if (this.takeoverLeft(d) <= 0) return 'Tarde demais: o drone já está no piloto automático até o alvo';
      d.controlled = true;
      d.lastInputTick = this.sim.tick;
    } else {
      d.controlled = false;
      d.input = { turn: 0, climb: 0, throttle: 0 };
    }
    return null;
  }

  /** Comandos do piloto: só valem com o controle assumido; os valores são limitados a −1..1 aqui, no servidor. */
  steer(slot: Slot, id: number, turn: number, climb: number, throttle: number): string | null {
    const d = this.own(slot, id);
    if (typeof d === 'string') return d;
    if (!d.controlled) return 'Assuma o controle do drone antes de pilotar';
    d.input = { turn: clamp(turn, -1, 1), climb: clamp(climb, -1, 1), throttle: clamp(throttle, -1, 1) };
    d.lastInputTick = this.sim.tick;
    return null;
  }

  detonate(slot: Slot, id: number): string | null {
    const d = this.own(slot, id);
    if (typeof d === 'string') return d;
    this.explode(d, 'detonated');
    return null;
  }

  step(): void {
    const dt = 1 / TICK_RATE;
    const tick = this.sim.tick;
    for (const d of this.drones) {
      if (d.phase !== 'flight') continue;
      let turn: number;
      let climb: number;
      let throttle: number;
      if (d.controlled) {
        const stale = tick - d.lastInputTick > DRONE.inputTimeoutSeconds * TICK_RATE;
        turn = stale ? 0 : d.input.turn;
        climb = stale ? 0 : d.input.climb;
        throttle = stale ? 0 : d.input.throttle;
      } else {
        // piloto automático: aponta para o alvo, voa na altitude de cruzeiro e mergulha nos últimos metros
        const want = Math.atan2(d.target.y - d.pos.y, d.target.x - d.pos.x);
        turn = clamp(angDiff(want, d.heading) * 2, -1, 1);
        const flat = Math.hypot(d.target.x - d.pos.x, d.target.y - d.pos.y);
        const wantAlt = flat < 9 ? flat * 0.45 : DRONE.cruiseAlt;
        climb = clamp((wantAlt - d.alt) * 0.8, -1, 1);
        throttle = flat < 9 ? 0.6 : 0;
      }
      // o manche chega aos poucos: curva e subida sem trancos (no piloto automático também)
      const k = Math.min(1, dt * DRONE.stickResponse);
      d.turnNow = (d.turnNow ?? 0) + (turn - (d.turnNow ?? 0)) * k;
      d.climbNow = (d.climbNow ?? 0) + (climb - (d.climbNow ?? 0)) * k;
      turn = d.turnNow;
      climb = d.climbNow;
      const speedWant =
        throttle >= 0 ? DRONE.cruiseSpeed + (DRONE.boostSpeed - DRONE.cruiseSpeed) * throttle : DRONE.cruiseSpeed + (DRONE.cruiseSpeed - DRONE.slowSpeed) * throttle;
      d.speed += (speedWant - d.speed) * Math.min(1, dt * DRONE.throttleResponse);
      d.heading += turn * DRONE.turnRate * dt;
      const vz = climb * DRONE.climbRate * (climb < 0 ? DRONE.diveMul : 1);
      const prevAlt = d.alt;
      d.alt = clamp(d.alt + vz * dt, -1, DRONE.maxAlt);
      d.climb = (d.alt - prevAlt) / dt;
      d.pos = { x: d.pos.x + Math.cos(d.heading) * d.speed * dt, y: d.pos.y + Math.sin(d.heading) * d.speed * dt };
      // bateria: acelerar gasta mais
      d.battery -= 1 + Math.max(0, throttle) * 0.8;
      const inMap = this.sim.clampToMap(d.pos);
      if (inMap.x !== d.pos.x || inMap.y !== d.pos.y) {
        d.pos = inMap;
        this.explode(d, 'impact');
        continue;
      }
      if (this.collides(d)) {
        this.explode(d, 'impact');
        continue;
      }
      if (d.battery <= 0) {
        this.explode(d, 'battery');
        continue;
      }
      if (tick % TICK_RATE === 0 && this.rand() < this.aaChance(d)) this.explode(d, 'shot_down');
    }
    if (tick % (TICK_RATE * 30) === 0) this.drones = this.drones.filter((d) => d.phase === 'flight' || tick - (d.endTick ?? tick) < TICK_RATE * 20);
  }

  /** Bateu no chão, num edifício alheio (abaixo do telhado) ou numa tropa de outro país? */
  private collides(d: Drone): boolean {
    if (d.alt <= 0.3) return true;
    const cs = this.sim.map.cellSize;
    if (d.alt < 1.7)
      for (const b of this.sim.buildings) {
        // os prédios do próprio dono ficam de fora (o drone decola da base e sobrevoa o próprio território)
        if (b.hp <= 0 || b.owner === d.owner) continue;
        const s = BUILDINGS[b.type].size * cs;
        const x0 = b.cell.cx * cs;
        const y0 = b.cell.cy * cs;
        if (d.pos.x >= x0 && d.pos.x <= x0 + s && d.pos.y >= y0 && d.pos.y <= y0 + s) return true;
      }
    if (d.alt < 1.3)
      for (const u of this.sim.units) if (u.hp > 0 && u.owner !== d.owner && Math.hypot(u.pos.x - d.pos.x, u.pos.y - d.pos.y) < UNITS[u.type].radius + 0.5) return true;
    return false;
  }

  /** Antiaérea inimiga ao alcance: chance por segundo de derrubar o drone. */
  private aaChance(d: Drone): number {
    let c = 0;
    let victim: Slot | null = null;
    for (const b of this.sim.buildings)
      if (
        b.type === 'aa_battery' &&
        b.hp > 0 &&
        b.progress >= 1 &&
        this.sim.hostile(d.owner, b.owner) &&
        this.sim.isPowered(b) &&
        Math.hypot(b.pos.x - d.pos.x, b.pos.y - d.pos.y) <= DRONE.aaRange
      ) {
        c += DRONE.aaChance;
        victim = b.owner;
      }
    for (const u of this.sim.units)
      if (u.hp > 0 && UNITS[u.type].airDefense && this.sim.hostile(d.owner, u.owner) && Math.hypot(u.pos.x - d.pos.x, u.pos.y - d.pos.y) <= DRONE.aaRange) {
        c += DRONE.aaChance * 0.8;
        victim = u.owner;
      }
    return victim === null ? 0 : Math.min(0.6, c * (this.sim.bonusOf(victim).aaMul ?? 1));
  }

  private explode(d: Drone, end: DroneEnd): void {
    d.phase = 'done';
    d.end = end;
    d.endTick = this.sim.tick;
    d.alt = Math.max(0, d.alt);
    let damage = 0;
    let kills = 0;
    // derrubado no ar: os destroços caem sem efeito; nos outros casos a ogiva explode onde o drone está
    if (end !== 'shot_down' && d.alt < 3) {
      for (const e of [...this.sim.entities.values()]) {
        if (e.hp <= 0 || !this.sim.hostile(d.owner, e.owner)) continue;
        const dd = Math.hypot(e.pos.x - d.pos.x, e.pos.y - d.pos.y);
        const reach = DRONE.radius + this.sim.entityRadius(e);
        if (dd > reach) continue;
        const k = Math.max(0.3, 1 - dd / (reach + 0.5));
        const dmg = (e.kind === 'building' ? DRONE.buildingDamage : DRONE.unitDamage) * k;
        damage += Math.min(dmg, e.hp);
        if (e.kind === 'building') {
          if (e.type === 'oil_tank' && e.stored > 0) this.sim.loseTankOil(e, e.stored * Math.min(1, dmg / Math.max(1, e.hp)));
          if (this.sim.damageBuilding(e, dmg, d.owner)) kills++;
        } else if (this.sim.damageUnit(e, dmg, d.owner)) kills++;
      }
    }
    this.sim.emitTrade({
      type: 'drone',
      tick: this.sim.tick,
      owner: d.owner,
      droneId: d.id,
      phase: end,
      pos: { ...d.pos },
      alt: Math.round(d.alt * 10) / 10,
      damage: Math.round(damage),
      kills,
      controlled: d.controlled,
    });
  }

  /** Drones em voo (posição e a visão da câmera), para a névoa de guerra. */
  sights(): { owner: Slot; pos: Vec2; sight: number }[] {
    return this.drones.filter((d) => d.phase === 'flight').map((d) => ({ owner: d.owner, pos: d.pos, sight: DRONE.sight }));
  }
}
