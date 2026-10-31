import { describe, expect, it } from 'vitest';
import { BUILDINGS, TICK_RATE, type BuildingType } from '../sim/config.ts';
import { AIRCRAFT } from '../sim/air.ts';
import { DRONE } from '../sim/drones.ts';
import { parseCommand } from '../sim/commands.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { airView } from '../sim/snapshot.ts';
import type { Building, SimEvent } from '../sim/types.ts';
import { flatMap } from './helpers.ts';

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

function setup() {
  const sim = new Simulation({ map: flatMap(40), playerCount: 2, startingUnits: [] });
  const link: NationalLink = {
    techs: () => ['guided_munitions'],
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => 1e9,
    chargeWorks: () => true,
    refundWorks: () => {},
  };
  sim.national = link;
  sim.setWar(0, 1, true);
  for (const p of sim.players) {
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 3000;
    p.oilReserve = 3000;
    p.recruits = 10;
  }
  const place = (slot: number, type: BuildingType, from: [number, number], to: [number, number]): Building => {
    for (let cy = from[1]; cy <= to[1]; cy++)
      for (let cx = from[0]; cx <= to[0]; cx++)
        if (sim.applyCommand(slot, { type: 'build', buildingType: type, cx, cy }) === null)
          return sim.buildings.find((b) => b.type === type && b.owner === slot && b.cell.cx === cx && b.cell.cy === cy)!;
    throw new Error(`sem lugar para ${type}`);
  };
  const base = place(0, 'airbase', [2, 8], [14, 16]);
  const target = place(1, 'oil_tank', [26, 26], [36, 36]);
  run(sim, BUILDINGS.airbase.buildSeconds + 1);
  run(sim, BUILDINGS.oil_tank.buildSeconds + 1);
  expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: base.id, aircraftType: 'drone' })).toBeNull();
  run(sim, AIRCRAFT.drone.buildSeconds + 1);
  return { sim, base, target };
}

const droneEvents = (sim: Simulation) => sim.drainEvents().filter((e): e is Extract<SimEvent, { type: 'drone' }> => e.type === 'drone');

describe('drone de ataque', () => {
  it('lançado contra um alvo, voa no piloto automático, mergulha e explode no alvo; é consumido', () => {
    const { sim, base, target } = setup();
    const hp = target.hp;
    expect(sim.applyCommand(0, { type: 'launch_drone', buildingId: base.id, x: target.pos.x, y: target.pos.y })).toBeNull();
    expect(sim.air.aircraft.some((a) => a.type === 'drone')).toBe(false);
    const d = sim.air.drones.drones[0]!;
    let end: Extract<SimEvent, { type: 'drone' }> | undefined;
    for (let i = 0; i < 40 * TICK_RATE && !end; i++) {
      sim.step();
      end = droneEvents(sim).find((e) => e.phase !== 'launched');
    }
    expect(end?.phase).toBe('impact');
    expect(d.phase).toBe('done');
    expect(target.hp).toBeLessThan(hp);
    expect(end!.damage).toBeGreaterThan(0);
  });

  it('controle em primeira pessoa: só o dono, só na janela inicial; o servidor limita os comandos', () => {
    const { sim, base, target } = setup();
    sim.applyCommand(0, { type: 'launch_drone', buildingId: base.id, x: target.pos.x, y: target.pos.y });
    const d = sim.air.drones.drones[0]!;
    expect(sim.applyCommand(0, { type: 'drone_steer', droneId: d.id, turn: 1, climb: 0, throttle: 0 })).toMatch(/Assuma o controle/);
    // ataque: o inimigo tenta pegar o drone alheio
    expect(sim.applyCommand(1, { type: 'drone_control', droneId: d.id, take: true })).toMatch(/inválido/);
    expect(sim.applyCommand(0, { type: 'drone_control', droneId: d.id, take: true })).toBeNull();
    // valores fora da faixa são limitados no parser e de novo na simulação
    const raw = parseCommand({ type: 'drone_steer', droneId: d.id, turn: 50, climb: -9, throttle: 3 });
    expect(raw).toEqual({ type: 'drone_steer', droneId: d.id, turn: 1, climb: -1, throttle: 1 });
    expect(sim.air.drones.steer(0, d.id, 99, 0, 0)).toBeNull();
    expect(d.input.turn).toBe(1);
    const h0 = d.heading;
    run(sim, 1);
    expect(d.heading - h0).toBeCloseTo(DRONE.turnRate, 1);
  });

  it('a janela para assumir fecha; sem comando por 2 s (conexão caiu) o drone segue reto e nivelado', () => {
    const { sim, base } = setup();
    sim.applyCommand(0, { type: 'launch_drone', buildingId: base.id, x: base.pos.x + 60, y: base.pos.y + 60 });
    const d = sim.air.drones.drones[0]!;
    run(sim, DRONE.takeoverSeconds + 0.5);
    expect(sim.applyCommand(0, { type: 'drone_control', droneId: d.id, take: true })).toMatch(/Tarde demais/);
    const e = setup();
    e.sim.applyCommand(0, { type: 'launch_drone', buildingId: e.base.id, x: e.base.pos.x + 60, y: e.base.pos.y + 60 });
    const d2 = e.sim.air.drones.drones[0]!;
    run(e.sim, 2);
    e.sim.applyCommand(0, { type: 'drone_control', droneId: d2.id, take: true });
    e.sim.applyCommand(0, { type: 'drone_steer', droneId: d2.id, turn: 1, climb: 0, throttle: 0 });
    run(e.sim, DRONE.inputTimeoutSeconds + 0.2);
    const h = d2.heading;
    run(e.sim, 1);
    expect(d2.heading).toBeCloseTo(h, 5);
  });

  it('pilotado para baixo, bate no chão; longe de inimigos não causa dano a ninguém', () => {
    const { sim, base } = setup();
    sim.applyCommand(0, { type: 'launch_drone', buildingId: base.id, x: base.pos.x + 40, y: base.pos.y });
    const d = sim.air.drones.drones[0]!;
    run(sim, 3);
    sim.applyCommand(0, { type: 'drone_control', droneId: d.id, take: true });
    const ownHp = sim.buildings.filter((b) => b.owner === 0).map((b) => b.hp);
    let end: Extract<SimEvent, { type: 'drone' }> | undefined;
    for (let i = 0; i < 10 * TICK_RATE && !end; i++) {
      sim.applyCommand(0, { type: 'drone_steer', droneId: d.id, turn: 0, climb: -1, throttle: 0 });
      sim.step();
      end = droneEvents(sim).find((e) => e.phase !== 'launched');
    }
    expect(end?.phase).toBe('impact');
    expect(end?.damage).toBe(0);
    expect(sim.buildings.filter((b) => b.owner === 0).map((b) => b.hp)).toEqual(ownHp);
  });

  it('detonar no ar não fere ninguém longe; a antiaérea inimiga derruba drones que passam perto', () => {
    const { sim, base } = setup();
    sim.applyCommand(0, { type: 'launch_drone', buildingId: base.id, x: base.pos.x + 40, y: base.pos.y });
    const d = sim.air.drones.drones[0]!;
    run(sim, 2);
    expect(sim.applyCommand(0, { type: 'drone_detonate', droneId: d.id })).toBeNull();
    expect(d.end).toBe('detonated');
    // antiaérea: várias baterias perto do caminho
    const s2 = setup();
    for (let i = 0; i < 5; i++) {
      const aa = s2.sim.addBuilding('aa_battery', 1, { cx: 26 + i, cy: 22 }, 1);
      expect(aa.progress).toBe(1);
    }
    let shot = 0;
    for (let k = 0; k < 6; k++) {
      s2.sim.applyCommand(0, { type: 'build_aircraft', buildingId: s2.base.id, aircraftType: 'drone' });
      run(s2.sim, AIRCRAFT.drone.buildSeconds + 1);
      s2.sim.applyCommand(0, { type: 'launch_drone', buildingId: s2.base.id, x: s2.target.pos.x, y: s2.target.pos.y });
      const dd = s2.sim.air.drones.drones.at(-1)!;
      run(s2.sim, 35);
      if (dd.end === 'shot_down') shot++;
    }
    expect(shot).toBeGreaterThan(0);
  });

  it('névoa: o drone inimigo só aparece à vista; o próprio vem com a janela de controle e a bateria', () => {
    const { sim, base, target } = setup();
    sim.applyCommand(0, { type: 'launch_drone', buildingId: base.id, x: target.pos.x, y: target.pos.y });
    sim.step();
    const own = airView(sim, 0).drones[0]!;
    expect(own.takeover).toBeGreaterThan(9);
    expect(own.battery).toBeGreaterThan(0.95);
    const d = sim.air.drones.drones[0]!;
    expect(sim.isVisibleTo(1, d.pos)).toBe(false);
    expect(airView(sim, 1).drones).toHaveLength(0);
  });

  it('salvar e carregar no meio do voo continua idêntico', () => {
    const { sim, base, target } = setup();
    sim.applyCommand(0, { type: 'launch_drone', buildingId: base.id, x: target.pos.x, y: target.pos.y });
    run(sim, 3);
    const copy = Simulation.deserialize(sim.serialize());
    copy.national = sim.national;
    run(sim, 5);
    run(copy, 5);
    expect(copy.serialize()).toBe(sim.serialize());
  });
});
