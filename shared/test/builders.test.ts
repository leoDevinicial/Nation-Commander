import { describe, expect, it } from 'vitest';
import { BUILDERS, BUILDINGS, TICK_RATE, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import type { Building, Cell } from '../sim/types.ts';
import { TEST_START, flatMap } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

function sim(citizens?: number) {
  const s = new Simulation({
    map: flatMap(),
    playerCount: 2,
    startingUnits: [],
    startingResources: { ...TEST_START },
    builders: true,
  });
  if (citizens !== undefined) s.players[0]!.citizens = citizens;
  return s;
}

/** Obra recém-aberta (progresso 0), sem pagar nem checar o terreno. */
function site(s: Simulation, type: BuildingType, cell: Cell): Building {
  const b = (
    s as unknown as {
      addBuilding: (t: BuildingType, o: number, c: Cell, p: number) => Building;
    }
  ).addBuilding(type, 0, cell, 0);
  s.staff(0);
  return b;
}

describe('construção por cidadãos', () => {
  it('com 4 construtores a obra anda no tempo normal', () => {
    const s = sim(10);
    const b = site(s, 'house', { cx: 6, cy: 6 });
    expect(b.builders).toBe(BUILDERS.max);
    run(s, b.buildTicks - 2);
    expect(b.progress).toBeLessThan(1);
    run(s, 3);
    expect(b.progress).toBe(1);
    expect(b.builders).toBe(0);
  });

  it('cada construtor a menos tira 25%: com 1, a obra leva 4 vezes o tempo', () => {
    const s = sim(10);
    const b = site(s, 'house', { cx: 6, cy: 6 });
    expect(s.applyCommand(0, { type: 'set_builders', buildingId: b.id, count: 1 })).toBeNull();
    expect(b.builders).toBe(1);
    run(s, b.buildTicks);
    expect(b.progress).toBeCloseTo(0.25, 2);
    run(s, b.buildTicks * 3 + 1);
    expect(b.progress).toBe(1);
  });

  it('sem cidadão nenhum a obra para; ao surgir um, volta a andar', () => {
    const s = sim(0);
    const b = site(s, 'house', { cx: 6, cy: 6 });
    run(s, TICK_RATE * 5);
    expect(b.progress).toBe(0);
    s.players[0]!.citizens = 1;
    run(s, TICK_RATE * 2);
    expect(b.builders).toBe(1);
    expect(b.progress).toBeGreaterThan(0);
  });

  it('construtores saem dos empregos e voltam a eles quando a obra acaba', () => {
    const s = sim();
    const citizens = s.players[0]!.citizens;
    s.staff(0);
    const before = s.population(0);
    expect(before.employed).toBeLessThanOrEqual(citizens);
    const b = site(s, 'house', { cx: 6, cy: 6 });
    const pop = s.population(0);
    expect(pop.builders).toBe(Math.min(BUILDERS.max, citizens));
    expect(pop.employed).toBeLessThanOrEqual(citizens);
    run(s, Math.ceil(b.buildTicks * (BUILDERS.max / (b.builders || 1))) + TICK_RATE * 2);
    expect(b.progress).toBe(1);
    expect(s.population(0).builders ?? 0).toBe(0);
    expect(s.population(0).employed).toBe(before.employed);
  });

  it('duas obras ao mesmo tempo dividem os cidadãos (a mais antiga primeiro)', () => {
    const s = sim(6);
    const a = site(s, 'house', { cx: 6, cy: 6 });
    const b = site(s, 'house', { cx: 10, cy: 6 });
    expect(a.builders).toBe(4);
    expect(b.builders).toBe(2);
  });

  it('o comando é do dono, só vale em obra e aceita de 0 a 4', () => {
    const s = sim(10);
    const b = site(s, 'house', { cx: 6, cy: 6 });
    expect(s.applyCommand(1, { type: 'set_builders', buildingId: b.id, count: 2 })).toMatch(/inválido/);
    expect(
      s.applyCommand(0, {
        type: 'set_builders',
        buildingId: s.hqOf(0)!.id,
        count: 2,
      }),
    ).toMatch(/obras em andamento/);
    expect(parseCommand({ type: 'set_builders', buildingId: b.id, count: 5 })).toBeNull();
    expect(parseCommand({ type: 'set_builders', buildingId: b.id, count: 3 })).toEqual({ type: 'set_builders', buildingId: b.id, count: 3 });
  });

  it('o snapshot mostra os construtores da obra; o alvo só para o dono', () => {
    const s = sim(10);
    const b = site(s, 'house', { cx: 6, cy: 6 });
    s.applyCommand(0, { type: 'set_builders', buildingId: b.id, count: 3 });
    const mine = makeSnapshot(s, [], {
      slot: 0,
      memory: new FogMemory(),
    }).buildings.find((v) => v.id === b.id)!;
    expect(mine.builders).toBe(3);
    expect(mine.builderTarget).toBe(3);
    // o inimigo vê os cidadãos no canteiro (se enxergar a obra), mas não o alvo
    const theirs = makeSnapshot(s, [], {
      slot: 1,
      memory: new FogMemory(),
    }).buildings.find((v) => v.id === b.id);
    if (theirs) expect(theirs.builderTarget).toBeUndefined();
    expect(BUILDINGS.house.buildSeconds).toBeGreaterThan(0);
  });
});
