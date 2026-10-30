import { describe, expect, it } from 'vitest';
import { TICK_RATE, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { AIR, AIRCRAFT, IRON_DOME, MISSILE, NUCLEAR, type AirMission } from '../sim/air.ts';
import { BUILDINGS } from '../sim/config.ts';
import { airView } from '../sim/snapshot.ts';
import type { Building, SimEvent } from '../sim/types.ts';
import { flatMap } from './helpers.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

/** Camada nacional de teste: pesquisas controladas e verba de obras com extrato. */
function national(techs: string[] = ['guided_munitions', 'ballistic_missiles']) {
  const st = { techs, fund: 1e9, ledger: [] as { slot: number; usd: number; d: string }[] };
  const link: NationalLink = {
    techs: () => st.techs,
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => st.fund,
    chargeWorks: (slot, usd, d) => {
      if (st.fund < usd) return false;
      st.fund -= usd;
      st.ledger.push({ slot, usd, d });
      return true;
    },
    refundWorks: (slot, usd, d) => {
      st.fund += usd;
      st.ledger.push({ slot, usd: -usd, d });
    },
  };
  return { st, link };
}

function setup(opts: { techs?: string[]; war?: boolean } = {}) {
  const sim = new Simulation({ map: flatMap(36), playerCount: 2, startingUnits: [] });
  const N = national(opts.techs);
  sim.national = N.link;
  if (opts.war !== false) sim.setWar(0, 1, true);
  for (const p of sim.players) {
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 2000;
    p.oilReserve = 2000;
    p.recruits = 10;
  }
  const place = (slot: number, type: BuildingType, from: [number, number], to: [number, number]): Building => {
    for (let cy = from[1]; cy <= to[1]; cy++)
      for (let cx = from[0]; cx <= to[0]; cx++)
        if (sim.applyCommand(slot, { type: 'build', buildingType: type, cx, cy }) === null) return sim.buildings.find((b) => b.type === type && b.owner === slot && b.cell.cx === cx && b.cell.cy === cy)!;
    throw new Error(`sem lugar para ${type}`);
  };
  return { sim, N, place };
}

/** Base aérea pronta do jogador 0, com o tanque inimigo construído. */
function withBase(opts: { techs?: string[]; war?: boolean; fighters?: number; recon?: number } = {}) {
  const s = setup(opts);
  const base = s.place(0, 'airbase', [2, 8], [12, 14]);
  const tank = s.place(1, 'oil_tank', [24, 24], [33, 33]);
  run(s.sim, 40);
  const ids: number[] = [];
  for (let i = 0; i < (opts.fighters ?? 2); i++) expect(s.sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'fighter' })).toBeNull();
  for (let i = 0; i < (opts.recon ?? 1); i++) expect(s.sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'recon' })).toBeNull();
  run(s.sim, AIRCRAFT.fighter.buildSeconds + 1);
  for (const a of s.sim.air.aircraft) ids.push(a.id);
  return { ...s, base, tank, ids };
}

const fighters = (sim: Simulation) => sim.air.aircraft.filter((a) => a.type === 'fighter' && a.state === 'ready').map((a) => a.id);
const recons = (sim: Simulation) => sim.air.aircraft.filter((a) => a.type === 'recon' && a.state === 'ready').map((a) => a.id);

describe('Fase 7 — aeronaves e bases aéreas', () => {
  it('produção exige base aérea, piloto, materiais e verba; hangar limitado; piloto conta como militar', () => {
    const { sim, N, place } = setup();
    const p = sim.players[0]!;
    const hq = sim.hqOf(0)!;
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: hq.id, aircraftType: 'fighter' })).toMatch(/Base aérea/);
    const base = place(0, 'airbase', [2, 8], [12, 14]);
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'fighter' })).toMatch(/inoperante/);
    run(sim, 30);
    p.recruits = 0;
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'fighter' })).toMatch(/piloto/);
    p.recruits = 10;
    const iron = p.resources.iron;
    const military = sim.population(0).military;
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'fighter' })).toBeNull();
    expect(p.resources.iron).toBe(iron - AIRCRAFT.fighter.cost.iron!);
    expect(p.recruits).toBe(9);
    expect(sim.population(0).military).toBe(military + 1);
    expect(N.st.ledger.at(-1)!.usd).toBe(AIRCRAFT.fighter.usd);
    for (let i = 0; i < 3; i++) expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'recon' })).toBeNull();
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'fighter' })).toMatch(/Hangar cheio/);
    expect(sim.air.aircraft[0]!.state).toBe('building');
    run(sim, AIRCRAFT.fighter.buildSeconds + 1);
    expect(sim.air.aircraft.every((a) => a.state === 'ready')).toBe(true);
  });

  it('sem manutenção paga as aeronaves ficam em terra; voltam a voar quando há suprimentos', () => {
    const { sim } = withBase();
    const p = sim.players[0]!;
    // sem suprimentos e sem renda (a logística nacional anula a renda do QG neste teste)
    sim.setModifiers(0, { externalIncome: -3 });
    p.resources.supplies = 0;
    run(sim, 20);
    expect(sim.air.aircraft.every((a) => a.state === 'grounded')).toBe(true);
    expect(fighters(sim)).toHaveLength(0);
    sim.setModifiers(0, { externalIncome: 0 });
    p.resources.supplies = 500;
    run(sim, 20);
    expect(sim.air.aircraft.every((a) => a.state === 'ready')).toBe(true);
  });

  it('missões inválidas são recusadas com o motivo: sem guerra, alvo não descoberto, pesquisa, alcance, combustível, aeronave errada', () => {
    const peace = withBase({ war: false });
    const t = peace.tank;
    // o tanque inimigo ainda não foi visto: não pode ser alvo
    expect(peace.sim.applyCommand(0, { type: 'air_mission', buildingId: peace.base.id, aircraftIds: fighters(peace.sim), mission: 'strike', targetId: t.id })).toMatch(/não descoberto/);
    peace.sim.air.known[0] = new Set([t.id]);
    expect(peace.sim.applyCommand(0, { type: 'air_mission', buildingId: peace.base.id, aircraftIds: fighters(peace.sim), mission: 'strike', targetId: t.id })).toMatch(/guerra/);

    const noTech = withBase({ techs: [] });
    noTech.sim.air.known[0] = new Set([noTech.tank.id]);
    expect(noTech.sim.applyCommand(0, { type: 'air_mission', buildingId: noTech.base.id, aircraftIds: fighters(noTech.sim), mission: 'strike', targetId: noTech.tank.id })).toMatch(/Munição guiada/);

    const { sim, base, tank } = withBase();
    sim.air.known[0] = new Set([tank.id]);
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: recons(sim), mission: 'strike', targetId: tank.id })).toMatch(/só caças/);
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: fighters(sim), mission: 'recon', x: 60, y: 60 })).toMatch(/só aeronaves de reconhecimento/);
    const p = sim.players[0]!;
    p.resources.oil = 1;
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: fighters(sim), mission: 'strike', targetId: tank.id })).toMatch(/Combustível insuficiente/);
    p.resources.oil = 2000;
    // fora do alcance: base deslocada para longe do alvo
    const far = { ...base.pos };
    base.pos = { x: -200, y: -200 };
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: fighters(sim), mission: 'strike', targetId: tank.id })).toMatch(/Fora do alcance/);
    base.pos = far;
  });

  it('reconhecimento revela a área por um tempo e registra os edifícios vistos (que passam a ser alvos)', () => {
    const { sim, base, tank } = withBase();
    expect(sim.air.isKnown(0, tank.id)).toBe(false);
    expect(sim.isVisibleTo(0, tank.pos)).toBe(false);
    const oil = sim.players[0]!.resources.oil;
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: recons(sim), mission: 'recon', x: tank.pos.x, y: tank.pos.y })).toBeNull();
    expect(sim.players[0]!.resources.oil).toBeLessThan(oil); // combustível de ida e volta debitado na decolagem
    const m = sim.air.missions[0]!;
    run(sim, m.legTicks / TICK_RATE + 1);
    expect(m.result?.revealed).toBeGreaterThan(0);
    expect(sim.air.isKnown(0, tank.id)).toBe(true);
    expect(sim.isVisibleTo(0, tank.pos)).toBe(true);
    expect(airView(sim, 0).known).toContain(tank.id);
    run(sim, AIR.reconSeconds + 1);
    expect(sim.isVisibleTo(0, tank.pos)).toBe(false);
    // de volta à base, em manutenção
    expect(m.state).toBe('done');
    const a = sim.air.aircraft.find((x) => x.type === 'recon')!;
    expect(a.state === 'maintenance' || a.state === 'ready').toBe(true);
  });

  it('ataque ao tanque: dano parcial, petróleo perdido proporcional ao dano e limitado ao estoque, resultado registrado', () => {
    const { sim, base, tank } = withBase();
    sim.air.known[0] = new Set([tank.id]);
    tank.stored = 300;
    const enemy = sim.players[1]!;
    const oilBefore = enemy.resources.oil;
    const hpBefore = tank.hp;
    sim.drainEvents();
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: fighters(sim).slice(0, 1), mission: 'strike', targetId: tank.id })).toBeNull();
    const m = sim.air.missions[0]!;
    run(sim, m.legTicks / TICK_RATE + 0.5);
    const r = m.result!;
    expect(r.shotDown).toBe(0); // sem antiaérea
    expect(r.damage).toBeGreaterThanOrEqual(AIRCRAFT.fighter.strikeDamage * AIR.precisionMinGuided - 1);
    expect(tank.hp).toBe(hpBefore - r.damage);
    expect(r.destroyed).toBe(false);
    const expected = 300 * (r.damage / hpBefore);
    expect(r.oilLost).toBeCloseTo(expected, 0);
    expect(tank.stored).toBeCloseTo(300 - expected, 3);
    expect(enemy.resources.oil).toBeCloseTo(oilBefore - expected, 3);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'air_strike' && e.victim === 1 && e.oilLost === r.oilLost)).toBe(true);
    expect(ev.some((e) => e.type === 'storage_lost' && e.owner === 1 && e.reason === 'attack')).toBe(true);
  });

  it('tanque destruído perde exatamente o petróleo que tinha no impacto', () => {
    const { sim, base, tank } = withBase({ fighters: 3 });
    sim.air.known[0] = new Set([tank.id]);
    tank.hp = 50;
    tank.stored = 123;
    const enemy = sim.players[1]!;
    // estoque coerente: todo o petróleo do inimigo está neste tanque
    enemy.oilReserve = 0;
    enemy.resources.oil = 123;
    const oilBefore = enemy.resources.oil;
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: fighters(sim), mission: 'strike', targetId: tank.id })).toBeNull();
    const m = sim.air.missions[0]!;
    run(sim, m.legTicks / TICK_RATE + 0.5);
    expect(m.result!.destroyed).toBe(true);
    expect(m.result!.oilLost).toBe(123);
    expect(enemy.resources.oil).toBeCloseTo(oilBefore - 123, 6);
    expect(sim.entities.has(tank.id)).toBe(false);
  });

  it('antiaérea derruba aeronaves (determinístico); sem defesa ninguém cai', () => {
    const { sim, base, tank, place } = withBase({ fighters: 4, recon: 0 });
    for (let i = 0; i < 3; i++) place(1, 'aa_battery', [22 + i * 2, 22], [33, 33]);
    run(sim, 20);
    for (const a of sim.air.aircraft) a.state = 'ready';
    sim.air.known[0] = new Set([tank.id]);
    let lost = 0;
    for (let round = 0; round < 3 && fighters(sim).length; round++) {
      const ids = fighters(sim);
      expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: ids, mission: 'strike', targetId: tank.id })).toBeNull();
      const m = sim.air.missions.at(-1)!;
      run(sim, (m.legTicks * 2) / TICK_RATE + AIRCRAFT.fighter.maintenanceSeconds + 2);
      lost += m.result!.shotDown;
      expect(m.aircraft.length).toBe(ids.length - m.result!.shotDown);
    }
    expect(lost).toBeGreaterThan(0);
    expect(sim.air.aircraft.length).toBe(4 - lost);
  });

  it('base destruída com aeronaves no hangar: as aeronaves se perdem', () => {
    const { sim, base } = withBase();
    const n = sim.air.aircraft.length;
    expect(n).toBeGreaterThan(0);
    sim.damageBuilding(base, base.hp + 1, 1);
    sim.drainEvents();
    run(sim, 0.2);
    expect(sim.air.aircraft).toHaveLength(0);
  });
});

const bombers = (sim: Simulation) => sim.air.aircraft.filter((a) => a.type === 'bomber' && a.state === 'ready').map((a) => a.id);

describe('Bombardeiro e combate aéreo', () => {
  it('bombardeiro exige base aérea nível 2', () => {
    const { sim, base } = withBase({ fighters: 0, recon: 0 });
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'bomber' })).toMatch(/nível 2/);
    base.level = 2;
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'bomber' })).toBeNull();
    run(sim, AIRCRAFT.bomber.buildSeconds + 1);
    expect(bombers(sim)).toHaveLength(1);
  });

  it('bombardeio em tapete: muito mais dano que o caça e atinge os edifícios inimigos vizinhos', () => {
    const { sim, base, tank, place } = withBase({ fighters: 0, recon: 0 });
    const near = place(1, 'oil_tank', [24, 24], [33, 33]);
    expect(Math.hypot(near.pos.x - tank.pos.x, near.pos.y - tank.pos.y)).toBeLessThan(AIR.carpetRadius);
    base.level = 2;
    for (let i = 0; i < 2; i++) expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'bomber' })).toBeNull();
    run(sim, AIRCRAFT.bomber.buildSeconds + 1);
    sim.air.known[0] = new Set([tank.id]);
    tank.hp = tank.maxHp = 5000;
    near.hp = near.maxHp = 5000;
    sim.drainEvents();
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: bombers(sim), mission: 'strike', targetId: tank.id })).toBeNull();
    const m = sim.air.missions[0]!;
    run(sim, m.legTicks / TICK_RATE + 0.5);
    const r = m.result!;
    // dois bombardeiros: pelo menos 2 × 520 × 70% e bem acima do máximo de dois caças
    expect(r.damage).toBeGreaterThanOrEqual(2 * AIRCRAFT.bomber.strikeDamage * AIR.bomberPrecisionMin - 1);
    expect(r.damage).toBeGreaterThan(2 * AIRCRAFT.fighter.strikeDamage);
    expect(tank.hp).toBe(5000 - r.damage);
    expect(near.hp).toBeLessThan(5000);
    expect(near.hp).toBeGreaterThan(5000 - r.damage * AIR.carpetSplash - 1);
    expect(r.text).toMatch(/mais 1 edifício/);
    const ev = sim.drainEvents().find((e) => e.type === 'air_strike');
    expect(ev && ev.type === 'air_strike' && ev.bombers).toBe(2);
  });

  /** Dois países em guerra com caças no ar, em rotas que se cruzam no meio do caminho. */
  function crossing() {
    const { sim, base, tank, place } = withBase({ recon: 0 });
    const base1 = place(1, 'airbase', [16, 16], [34, 34]);
    const target0 = sim.hqOf(0)!;
    run(sim, 30);
    for (let i = 0; i < 2; i++) expect(sim.applyCommand(1, { type: 'build_aircraft', buildingId: base1.id, aircraftType: 'fighter' })).toBeNull();
    run(sim, AIRCRAFT.fighter.buildSeconds + 1);
    sim.air.known[0] = new Set([tank.id]);
    sim.air.known[1] = new Set([target0.id]);
    const own = (slot: number) => sim.air.aircraft.filter((a) => a.owner === slot && a.type === 'fighter' && a.state === 'ready').map((a) => a.id);
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: own(0), mission: 'strike', targetId: tank.id })).toBeNull();
    expect(sim.applyCommand(1, { type: 'air_mission', buildingId: base1.id, aircraftIds: own(1), mission: 'strike', targetId: target0.id })).toBeNull();
    const [a, b] = sim.air.missions.slice(-2) as [AirMission, AirMission];
    // rotas espelhadas: as esquadrilhas se encontram na metade da ida
    b.from = { ...a.target };
    b.target = { ...a.from };
    b.legTicks = a.legTicks;
    sim.drainEvents();
    return { sim, a, b };
  }

  it('caças de países em guerra que se cruzam no ar travam combate: param, trocam tiros e lutam uma vez só', () => {
    const { sim, a, b } = crossing();
    let engagedAt = -1;
    for (let i = 0; i < a.legTicks && engagedAt < 0; i++) {
      sim.step();
      if (sim.air.engaged(a.id)) engagedAt = sim.tick;
    }
    expect(engagedAt).toBeGreaterThan(0);
    expect(sim.air.engaged(b.id)).toBe(true);
    expect(a.fought).toContain(b.id);
    // presas no lugar durante o combate
    const pa = sim.air.missionPos(a);
    run(sim, 1);
    expect(sim.air.missionPos(a)).toEqual(pa);
    run(sim, AIR.dogfightRounds + 1);
    expect(sim.air.engaged(a.id)).toBe(false);
    const ev = sim.drainEvents();
    const shots = ev.filter((e) => e.type === 'dogfight');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => e.type === 'dogfight' && (e.missionId === a.id || e.missionId === b.id))).toBe(true);
    const kills = shots.filter((e) => e.type === 'dogfight' && e.kill).length;
    expect(ev.filter((e) => e.type === 'aircraft_lost' && e.air).length).toBe(kills);
    expect(a.aircraft.length + b.aircraft.length).toBe(4 - kills);
    // as que sobreviveram seguem viagem e não voltam a lutar entre si
    run(sim, 3);
    expect(sim.air.dogfights).toHaveLength(0);
  });

  it('esquadrilha inteira abatida no combate termina a missão; reconhecimento sem escolta não revida', () => {
    const kill = AIR.dogfightKill;
    AIR.dogfightKill = 1;
    try {
      const { sim, a, b } = crossing();
      run(sim, a.legTicks / TICK_RATE);
      expect(a.state).toBe('done');
      expect(b.state).toBe('done');
      expect(a.result?.text).toMatch(/combate aéreo/);
      expect(sim.air.aircraft.filter((x) => x.type === 'fighter')).toHaveLength(0);
    } finally {
      AIR.dogfightKill = kill;
    }
    const { sim, a, b } = crossing();
    // a esquadrilha de 1 vira reconhecimento: só a de 0 atira
    for (const id of b.aircraft) sim.air.aircraft.find((x) => x.id === id)!.type = 'recon';
    run(sim, a.legTicks / TICK_RATE);
    const shots = sim.drainEvents().filter((e) => e.type === 'dogfight');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => e.type === 'dogfight' && e.owner === 0)).toBe(true);
    expect(a.aircraft).toHaveLength(2);
  });

  it('sem guerra não há combate; salvar no meio do combate e continuar é idêntico', () => {
    const peace = crossing();
    peace.sim.setWar(0, 1, false);
    run(peace.sim, peace.a.legTicks / TICK_RATE);
    expect(peace.sim.drainEvents().some((e) => e.type === 'dogfight')).toBe(false);

    const { sim, a } = crossing();
    while (!sim.air.engaged(a.id) && sim.tick < 1e5) sim.step();
    sim.step();
    const copy = Simulation.deserialize(sim.serialize());
    copy.national = sim.national;
    run(sim, 6);
    run(copy, 6);
    expect(copy.serialize()).toBe(sim.serialize());
  });

  it('a esquadrilha aparece no snapshot com o tipo de avião e o estado de combate', () => {
    const { sim, a } = crossing();
    while (!sim.air.engaged(a.id) && sim.tick < 1e5) sim.step();
    const f = airView(sim, 0).flights.find((x) => x.id === a.id)!;
    expect(f.plane).toBe('fighter');
    expect(f.engaged).toBe(true);
  });
});

describe('Fase 7 — mísseis', () => {
  function silo(opts: { techs?: string[]; war?: boolean } = {}) {
    const s = setup(opts);
    const sl = s.place(0, 'missile_silo', [2, 8], [12, 14]);
    const enemyHq = s.sim.hqOf(1)!;
    run(s.sim, 35);
    return { ...s, silo: sl, enemyHq };
  }

  it('silo exige a pesquisa; produção cara e limitada à capacidade', () => {
    const s = setup({ techs: [] });
    expect(s.sim.applyCommand(0, { type: 'build', buildingType: 'missile_silo', cx: 6, cy: 10 })).toMatch(/Mísseis balísticos/);
    const { sim, silo: sl, N } = silo();
    const p = sim.players[0]!;
    const iron = p.resources.iron;
    expect(sim.applyCommand(0, { type: 'build_missile', buildingId: sl.id })).toBeNull();
    expect(p.resources.iron).toBe(iron - MISSILE.cost.iron!);
    expect(N.st.ledger.at(-1)!.usd).toBe(MISSILE.usd);
    expect(sim.applyCommand(0, { type: 'build_missile', buildingId: sl.id })).toMatch(/em produção/);
    run(sim, MISSILE.buildSeconds + 1);
    expect(sim.air.silo(sl.id).missiles).toBe(1);
    expect(sim.applyCommand(0, { type: 'build_missile', buildingId: sl.id })).toBeNull();
    run(sim, MISSILE.buildSeconds + 1);
    expect(sim.air.silo(sl.id).missiles).toBe(2);
    expect(sim.applyCommand(0, { type: 'build_missile', buildingId: sl.id })).toMatch(/Silo cheio/);
  });

  it('sequência com estados distintos e confirmação: preparar → armado → autorizar → lançar → impacto', () => {
    const { sim, silo: sl, enemyHq } = silo();
    sim.air.silo(sl.id).missiles = 1;
    const target = { x: enemyHq.pos.x, y: enemyHq.pos.y };
    // alvo fora de vista e sem edifício descoberto
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, ...target })).toMatch(/não observado/);
    sim.air.known[0] = new Set([enemyHq.id]);
    // alvo no próprio território
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, x: sl.pos.x, y: sl.pos.y })).toMatch(/guerra/);
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, ...target })).toBeNull();
    const l = sim.air.launches[0]!;
    expect(l.state).toBe('preparing');
    expect(sim.air.silo(sl.id).missiles).toBe(0);
    // autorizar antes do fim da preparação é recusado: não há disparo acidental
    expect(sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toMatch(/Aguarde/);
    run(sim, MISSILE.prepareSeconds + 0.1);
    expect(l.state).toBe('armed');
    run(sim, 100);
    expect(l.state).toBe('armed'); // armado não lança sozinho, mesmo esperando muito
    const hp = enemyHq.hp;
    expect(sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
    expect(l.state).toBe('launching');
    expect(sim.applyCommand(0, { type: 'missile_abort', launchId: l.id })).toMatch(/Não é mais possível/);
    run(sim, MISSILE.launchSeconds + 0.1);
    expect(l.state).toBe('flight');
    run(sim, l.flightTicks / TICK_RATE + 0.1);
    expect(l.state).toBe('impact');
    expect(l.result!.damage).toBeGreaterThan(0);
    expect(enemyHq.hp).toBeLessThan(hp);
    // o resultado conta a partir do impacto (não da preparação): segue visível ao jogador por um tempo
    run(sim, 40);
    expect(airView(sim, 0).launches.find((x) => x.id === l.id)?.state).toBe('impact');
    run(sim, 100);
    expect(airView(sim, 0).launches.some((x) => x.id === l.id)).toBe(false);
  });

  it('abortar devolve o míssil; a paz decretada depois de armar bloqueia a autorização', () => {
    const { sim, silo: sl, enemyHq } = silo();
    sim.air.silo(sl.id).missiles = 1;
    sim.air.known[0] = new Set([enemyHq.id]);
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, x: enemyHq.pos.x, y: enemyHq.pos.y })).toBeNull();
    const l = sim.air.launches[0]!;
    expect(sim.applyCommand(1, { type: 'missile_abort', launchId: l.id })).toMatch(/inválido/);
    expect(sim.applyCommand(0, { type: 'missile_abort', launchId: l.id })).toBeNull();
    expect(l.state).toBe('aborted');
    expect(sim.air.silo(sl.id).missiles).toBe(1);
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, x: enemyHq.pos.x, y: enemyHq.pos.y })).toBeNull();
    run(sim, MISSILE.prepareSeconds + 0.1);
    const l2 = sim.air.launches[1]!;
    expect(l2.state).toBe('armed');
    sim.setWar(0, 1, false);
    expect(sim.applyCommand(0, { type: 'missile_authorize', launchId: l2.id })).toMatch(/guerra/);
  });

  it('antiaérea perto do alvo pode interceptar o míssil (sem dano)', () => {
    const { sim, silo: sl, enemyHq, place } = silo();
    for (let i = 0; i < 3; i++) place(1, 'aa_battery', [29, 29], [34, 34]);
    run(sim, 20);
    expect(sim.buildings.filter((b) => b.type === 'aa_battery' && Math.hypot(b.pos.x - enemyHq.pos.x, b.pos.y - enemyHq.pos.y) <= MISSILE.interceptRange)).toHaveLength(3);
    sim.air.known[0] = new Set([enemyHq.id]);
    let intercepted = 0;
    let hits = 0;
    for (let k = 0; k < 6; k++) {
      sim.air.silo(sl.id).missiles = 1;
      expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, x: enemyHq.pos.x, y: enemyHq.pos.y })).toBeNull();
      const l = sim.air.launches.at(-1)!;
      run(sim, MISSILE.prepareSeconds + 0.1);
      expect(sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
      run(sim, MISSILE.launchSeconds + l.flightTicks / TICK_RATE + 0.2);
      if (l.state === 'intercepted') {
        intercepted++;
        expect(l.result!.damage).toBe(0);
      } else if (l.state === 'impact') hits++;
      if (!sim.entities.has(enemyHq.id)) break;
    }
    expect(intercepted).toBeGreaterThan(0);
    expect(intercepted + hits).toBeGreaterThan(1);
  });
});

describe('Domo de Ferro', () => {
  /** Silo do jogador 0 com mísseis à vontade e uma bateria do jogador 1 perto do QG dele. */
  function scene(opts: { hit?: boolean } = {}) {
    const s = setup();
    const sl = s.place(0, 'missile_silo', [2, 8], [12, 14]);
    const sl2 = s.place(0, 'missile_silo', [2, 8], [12, 14]);
    const dome = s.place(1, 'iron_dome', [26, 26], [33, 33]);
    const enemyHq = s.sim.hqOf(1)!;
    run(s.sim, BUILDINGS.iron_dome.buildSeconds + 2);
    s.sim.air.known[0] = new Set([enemyHq.id]);
    // acerto ou erro forçado (o sorteio é o único aleatório do engajamento)
    if (opts.hit !== undefined) (s.sim.air as unknown as { rand: () => number }).rand = () => (opts.hit ? 0 : 0.999);
    /** Prepara, autoriza e espera o míssil sair do silo (estado de voo). */
    const fire = (o: { nuclear?: boolean } = {}) => {
      const st = s.sim.air.silo(sl.id);
      st.missiles = 1;
      if (o.nuclear) st.nuclear = 1;
      expect(s.sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, x: enemyHq.pos.x, y: enemyHq.pos.y, ...(o.nuclear ? { nuclear: true } : {}) })).toBeNull();
      const l = s.sim.air.launches.at(-1)!;
      run(s.sim, MISSILE.prepareSeconds + 0.1);
      expect(s.sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
      run(s.sim, MISSILE.launchSeconds + 0.05);
      expect(l.state).toBe('flight');
      return l;
    };
    /** Salva: os dois silos lançam juntos (os mísseis saem no mesmo tick). */
    const salvo = () => {
      const ls = [sl, sl2].map((x) => {
        s.sim.air.silo(x.id).missiles = 1;
        expect(s.sim.applyCommand(0, { type: 'missile_prepare', buildingId: x.id, x: enemyHq.pos.x, y: enemyHq.pos.y })).toBeNull();
        return s.sim.air.launches.at(-1)!;
      });
      run(s.sim, MISSILE.prepareSeconds + 0.1);
      for (const l of ls) expect(s.sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
      run(s.sim, MISSILE.launchSeconds + 0.05);
      return ls;
    };
    return { ...s, silo: sl, dome, enemyHq, fire, salvo };
  }
  const total = (c: object) => Object.values(c).reduce((a: number, v: number) => a + v, 0);

  it('é mais cara que o silo de mísseis e exige a pesquisa de mísseis', () => {
    expect(total(BUILDINGS.iron_dome.cost)).toBeGreaterThan(total(BUILDINGS.missile_silo.cost));
    for (const [r, v] of Object.entries(BUILDINGS.missile_silo.cost)) expect(BUILDINGS.iron_dome.cost[r as 'iron']).toBeGreaterThan(v);
    const s = setup({ techs: [] });
    expect(s.sim.applyCommand(1, { type: 'build', buildingType: 'iron_dome', cx: 28, cy: 28 })).toMatch(/Mísseis balísticos/);
  });

  it('dispara dois interceptadores e derruba o míssil comum no ar, sem dano no alvo', () => {
    const { sim, dome, enemyHq, fire } = scene({ hit: true });
    const hp = enemyHq.hp;
    sim.drainEvents();
    const l = fire();
    const ev = sim.drainEvents().find((e) => e.type === 'dome');
    expect(ev).toMatchObject({ type: 'dome', domeId: dome.id, launchId: l.id, owner: 1, attacker: 0, hit: true });
    expect(sim.air.domeState(dome.id).ready).toBe(IRON_DOME.magazine - IRON_DOME.perEngagement);
    run(sim, l.flightTicks / TICK_RATE + 0.2);
    expect(l.state).toBe('intercepted');
    expect(l.result!.damage).toBe(0);
    expect(enemyHq.hp).toBe(hp);
  });

  it('se o interceptador erra, o míssil segue e cai no alvo', () => {
    const { sim, enemyHq, fire } = scene({ hit: false });
    const hp = enemyHq.hp;
    const l = fire();
    run(sim, l.flightTicks / TICK_RATE + 0.2);
    expect(l.state).toBe('impact');
    expect(enemyHq.hp).toBeLessThan(hp);
  });

  it('não dá conta de uma salva: espera entre engajamentos, magazine limitado e recarga lenta e paga', () => {
    const { sim, dome, enemyHq, salvo } = scene({ hit: true });
    enemyHq.maxHp = enemyHq.hp = 1e9;
    // dois mísseis juntos: só um é engajado (os lançadores precisam de tempo entre uma interceptação e outra)
    const [a, b] = salvo();
    expect(a!.dome).toBeDefined();
    expect(b!.dome).toBeUndefined();
    // a próxima salva sai 13 s depois (preparo e contagem): pega um, e o magazine esvazia
    const [c, d] = salvo();
    expect(c!.dome).toBeDefined();
    expect(d!.dome).toBeUndefined();
    expect(sim.air.domeState(dome.id).ready).toBe(0);
    const [e] = salvo();
    expect(e!.dome).toBeUndefined();
    // recarga: um interceptador por vez, 40 s cada, e cada um é pago
    const iron = sim.players[1]!.resources.iron;
    const reloadStart = sim.air.domeState(dome.id).reload;
    run(sim, reloadStart / TICK_RATE + 0.1);
    expect(sim.air.domeState(dome.id).ready).toBe(1);
    expect(sim.players[1]!.resources.iron).toBe(iron - IRON_DOME.interceptorCost.iron!);
    run(sim, IRON_DOME.reloadSeconds - 1);
    expect(sim.air.domeState(dome.id).ready).toBe(1);
    run(sim, 1.1);
    expect(sim.air.domeState(dome.id).ready).toBe(2);
  });

  it('não intercepta a ogiva nuclear nem o míssil pesado', () => {
    const { sim, silo: sl, enemyHq, fire } = scene({ hit: true });
    enemyHq.maxHp = enemyHq.hp = 1e9;
    const n = fire({ nuclear: true });
    expect(n.dome).toBeUndefined();
    run(sim, 30);
    sim.air.silo(sl.id).missiles = 0;
    sl.level = 2;
    const h = fire();
    expect(h.gen).toBe(2);
    expect(h.dome).toBeUndefined();
  });

  it('salvar e carregar mantém os interceptadores e o engajamento em curso', () => {
    const { sim, dome, fire } = scene({ hit: true });
    const l = fire();
    const copy = Simulation.deserialize(sim.serialize());
    expect(copy.air.domeState(dome.id).ready).toBe(IRON_DOME.magazine - IRON_DOME.perEngagement);
    const l2 = copy.air.launches.find((x) => x.id === l.id)!;
    expect(l2.dome).toMatchObject({ domeId: dome.id, hit: true });
    for (let i = 0; i < l.flightTicks + 4; i++) copy.step();
    expect(l2.state).toBe('intercepted');
  });
});

describe('Fase 7 — persistência, comandos e comércio aéreo', () => {
  it('salvar no meio de uma missão e de um lançamento e continuar é idêntico', () => {
    const { sim, base, tank, place } = withBase();
    const sl = place(0, 'missile_silo', [2, 2], [14, 14]);
    run(sim, 32);
    sim.air.known[0] = new Set([tank.id, sim.hqOf(1)!.id]);
    for (const a of sim.air.aircraft) a.state = 'ready';
    sim.air.silo(sl.id).missiles = 1;
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: fighters(sim), mission: 'strike', targetId: tank.id })).toBeNull();
    const hq1 = sim.hqOf(1)!;
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, x: hq1.pos.x, y: hq1.pos.y })).toBeNull();
    run(sim, 2);
    const copy = Simulation.deserialize(sim.serialize());
    copy.national = sim.national;
    run(sim, 12);
    run(copy, 12);
    expect(copy.serialize()).toBe(sim.serialize());
    expect(copy.air.launches[0]!.state).toBe('armed');
  });

  it('parseCommand valida a forma dos comandos aéreos', () => {
    expect(parseCommand({ type: 'build_aircraft', buildingId: 3, aircraftType: 'fighter' })).toEqual({ type: 'build_aircraft', buildingId: 3, aircraftType: 'fighter' });
    expect(parseCommand({ type: 'build_aircraft', buildingId: 3, aircraftType: 'bomber' })).toEqual({ type: 'build_aircraft', buildingId: 3, aircraftType: 'bomber' });
    expect(parseCommand({ type: 'build_aircraft', buildingId: 3, aircraftType: 'zeppelin' })).toBeNull();
    expect(parseCommand({ type: 'air_mission', buildingId: 3, aircraftIds: [1, 1, 2], mission: 'strike', targetId: 9 })).toEqual({ type: 'air_mission', buildingId: 3, aircraftIds: [1, 2], mission: 'strike', targetId: 9 });
    expect(parseCommand({ type: 'air_mission', buildingId: 3, aircraftIds: [1], mission: 'nuke' })).toBeNull();
    expect(parseCommand({ type: 'air_mission', buildingId: 3, aircraftIds: [1], mission: 'recon', x: 1 })).toBeNull();
    expect(parseCommand({ type: 'missile_prepare', buildingId: 3, x: 1, y: 2 })).toEqual({ type: 'missile_prepare', buildingId: 3, x: 1, y: 2 });
    expect(parseCommand({ type: 'missile_authorize', launchId: 0 })).toBeNull();
    expect(parseCommand({ type: 'missile_abort', launchId: 4 })).toEqual({ type: 'missile_abort', launchId: 4 });
  });

  it('base aérea habilita o modal aéreo do comércio e cada cargueiro pronto amplia os embarques', () => {
    const { sim, place } = setup();
    place(0, 'market', [2, 8], [14, 14]);
    run(sim, 20);
    expect(sim.trade.modeBlocker(0, 'air')).toMatch(/Base Aérea/);
    const base = place(0, 'airbase', [2, 8], [14, 14]);
    run(sim, 30);
    expect(sim.trade.modeBlocker(0, 'air')).toBeNull();
    const before = sim.trade.convoyLimit(0, 'air');
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'transport' })).toBeNull();
    run(sim, AIRCRAFT.transport.buildSeconds + 1);
    expect(sim.trade.convoyLimit(0, 'air')).toBe(before + 1);
  });

  it('visão de cada jogador: o inimigo vê o míssil só depois do lançamento', () => {
    const { sim, base, place } = withBase();
    void base;
    const sl = place(0, 'missile_silo', [2, 2], [14, 14]);
    run(sim, 32);
    const hq1 = sim.hqOf(1)!;
    sim.air.known[0] = new Set([hq1.id]);
    sim.air.silo(sl.id).missiles = 1;
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sl.id, x: hq1.pos.x, y: hq1.pos.y })).toBeNull();
    expect(airView(sim, 0).launches).toHaveLength(1);
    expect(airView(sim, 1).launches).toHaveLength(0);
    run(sim, MISSILE.prepareSeconds + 0.1);
    sim.applyCommand(0, { type: 'missile_authorize', launchId: sim.air.launches[0]!.id });
    run(sim, MISSILE.launchSeconds + 0.1);
    expect(airView(sim, 1).launches[0]?.state).toBe('flight');
    expect(airView(sim, 1).aircraft).toHaveLength(0);
  });
});

describe('Fase 7 — consequências nacionais', () => {
  it('ataque e míssil viram notícia com os números e custam reputação; aeronave perdida conta como baixa', () => {
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }, { slot: 1, countryId: 'ARG' }], 1, 'realistic');
    const third = nat.npcs[0]!.slot;
    const before = { victim: nat.diplomacy.relation(0, 1), third: nat.diplomacy.relation(0, third) };
    nat.registerTacticalEvents([
      { type: 'air_strike', tick: 1, owner: 0, victim: 1, buildingType: 'oil_tank', damage: 210, oilLost: 84.5, destroyed: false, pos: { x: 0, y: 0 } },
      { type: 'missile', tick: 2, owner: 0, launchId: 7, state: 'impact', text: '', from: { x: 0, y: 0 }, target: { x: 9, y: 9 }, targetOwner: 1, damage: 900, destroyed: 2, casualties: 3 },
      { type: 'aircraft_lost', tick: 3, owner: 0, aircraftType: 'fighter', pos: { x: 0, y: 0 } },
    ]);
    const ev = nat.drainEvents().filter((e) => e.type === 'military_strike');
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ slot: 0, victim: 1, kind: 'air', damage: 210, oilLost: 84.5 });
    expect(ev[1]).toMatchObject({ kind: 'missile', damage: 900, destroyed: 2, intercepted: false });
    expect(nat.diplomacy.relation(0, 1)).toBeLessThan(before.victim);
    expect(nat.diplomacy.relation(0, third)).toBeLessThan(before.third);
    expect(nat.nation(0)!.casualties30d[0]).toBe(1);
  });
});

describe('ogiva nuclear e choque econômico global', () => {
  it('exige a pesquisa; produz, prepara e detona com raio enorme', () => {
    const s = setup({ techs: ['guided_munitions', 'ballistic_missiles'] });
    const silo = s.place(0, 'missile_silo', [2, 8], [12, 14]);
    const target = s.place(1, 'oil_tank', [24, 24], [33, 33]);
    run(s.sim, 35);
    expect(s.sim.applyCommand(0, { type: 'build_missile', buildingId: silo.id, nuclear: true })).toMatch(/Armas nucleares/);
    s.N.st.techs = ['guided_munitions', 'ballistic_missiles', 'nuclear_weapons'];
    expect(s.sim.applyCommand(0, { type: 'build_missile', buildingId: silo.id, nuclear: true })).toBeNull();
    run(s.sim, NUCLEAR.buildSeconds + 1);
    expect(s.sim.air.silo(silo.id).nuclear).toBe(1);
    // o convencional não serve: só há ogiva nuclear no silo
    s.sim.air.known[0] = new Set([target.id]);
    expect(s.sim.applyCommand(0, { type: 'missile_prepare', buildingId: silo.id, x: target.pos.x, y: target.pos.y })).toMatch(/convencional/);
    expect(s.sim.applyCommand(0, { type: 'missile_prepare', buildingId: silo.id, x: target.pos.x, y: target.pos.y, nuclear: true })).toBeNull();
    run(s.sim, MISSILE.prepareSeconds + 1);
    const l = s.sim.air.launches.at(-1)!;
    expect(l.nuclear).toBe(true);
    expect(s.sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
    const events: SimEvent[] = [];
    for (let i = 0; i < 40 * TICK_RATE && l.state !== 'impact' && l.state !== 'intercepted'; i++) {
      s.sim.step();
      events.push(...s.sim.drainEvents());
    }
    expect(events.some((e) => e.type === 'missile' && e.nuclear && e.state === 'flight')).toBe(true);
    expect(target.hp).toBeLessThanOrEqual(0);
  });

  it('todo lançamento nuclear derruba a economia de todos, inclusive de quem lançou, e decai', () => {
    const players = [
      { slot: 0, countryId: 'BRA' },
      { slot: 1, countryId: 'ARG' },
    ];
    const calm = new NationalSimulation(players, 3, 'parity');
    const war = new NationalSimulation(players, 3, 'parity');
    for (let d = 0; d < 10; d++) {
      calm.stepDay();
      war.stepDay();
    }
    war.registerTacticalEvents([{ type: 'missile', tick: 0, owner: 0, launchId: 1, state: 'flight', text: '', from: { x: 0, y: 0 }, target: { x: 0, y: 0 }, targetOwner: 1, nuclear: true }]);
    expect(war.shockLevel()).toBeCloseTo(1);
    expect(war.shockTheaterMul()).toBeCloseTo(0.7);
    expect(war.drainEvents().some((e) => e.type === 'nuclear_shock' && e.slot === 0)).toBe(true);
    for (let d = 0; d < 30; d++) {
      calm.stepDay();
      war.stepDay();
    }
    for (const slot of [0, 1]) expect(war.nation(slot)!.realGrowthPct).toBeLessThan(calm.nation(slot)!.realGrowthPct - 2);
    // um país de fora da partida também sente
    expect(war.npcs[0]!.realGrowthPct).toBeLessThan(calm.npcs[0]!.realGrowthPct - 2);
    expect(war.diplomacy.relation(0, war.npcs[0]!.slot)).toBeLessThan(calm.diplomacy.relation(0, calm.npcs[0]!.slot));
    for (let d = 0; d < 300; d++) war.stepDay();
    expect(war.shockLevel()).toBeLessThan(0.05);
    const copy = new NationalSimulation(players, 3, 'parity');
    copy.load(war.toSave());
    expect(copy.shocks).toEqual(war.shocks);
  });
});

describe('Visão das aeronaves em voo', () => {
  it('a área embaixo da formação fica visível enquanto ela passa, e some depois', () => {
    const { sim, base, tank } = withBase({ fighters: 2, recon: 0 });
    sim.air.known[0] = new Set([tank.id]);
    // tropa inimiga no meio da rota, longe de qualquer visão do jogador 0
    const mid = { x: (base.pos.x + tank.pos.x) / 2, y: (base.pos.y + tank.pos.y) / 2 };
    const spy = sim.addUnit('infantry', 1, mid);
    expect(sim.canSee(0, spy)).toBe(false);
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: fighters(sim), mission: 'strike', targetId: tank.id })).toBeNull();
    let seen = false;
    for (let i = 0; i < 40 * TICK_RATE && !seen; i++) {
      sim.step();
      spy.hp = spy.maxHp;
      spy.pos = { ...mid };
      seen = sim.canSee(0, spy);
    }
    expect(seen).toBe(true);
    expect(sim.air.flightSights().some((f) => f.owner === 0)).toBe(true);
  });
});
