import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { Simulation } from '../sim/Simulation.ts';
import { makeSnapshot, FogMemory } from '../sim/snapshot.ts';
import type { SimEvent } from '../sim/types.ts';
import { BUILDING_TECHS, TEST_START, flatMap } from './helpers.ts';

function sim() {
  const map = flatMap(40);
  map.spawns.push({ cx: 3, cy: 34 });
  const s = new Simulation({ map, playerCount: 3, startingUnits: [], startingResources: { ...TEST_START } });
  return s;
}
const worlds = (s: Simulation): Extract<SimEvent, { type: 'world' }>[] => s.drainEvents().filter((e): e is Extract<SimEvent, { type: 'world' }> => e.type === 'world');

describe('Alertas mundiais (03/11)', () => {
  it('guerra declarada vira alerta para todos, com quem declarou e o alvo, sem posição', () => {
    const s = sim();
    s.step();
    s.drainEvents();
    s.setWar(1, 2, true);
    const w = worlds(s);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'war', slot: 1, other: 2 });
    expect('pos' in w[0]!).toBe(false);
    // repetir a declaração não repete o alerta
    s.setWar(1, 2, true);
    expect(worlds(s)).toHaveLength(0);
    // o terceiro país (fora da guerra) também recebe no snapshot
    s.setWar(0, 1, true);
    const ev = s.drainEvents();
    const snap = makeSnapshot(s, ev, { slot: 2, memory: new FogMemory() });
    expect(snap.events.some((e) => e.type === 'world' && e.kind === 'war')).toBe(true);
  });

  it('pesquisa nuclear: alerta ao começar e ao terminar, uma vez cada', () => {
    const s = sim();
    let researching: string | null = null;
    let techs: string[] = [...BUILDING_TECHS];
    s.national = {
      techs: () => techs,
      researching: () => researching,
      infrastructureIndex: () => 1,
      stability: () => 50,
      worksFundUsd: () => 1e12,
      chargeWorks: () => true,
      refundWorks: () => undefined,
    };
    for (let i = 0; i < TICK_RATE; i++) s.step();
    expect(worlds(s)).toHaveLength(0);
    researching = 'nuclear_weapons';
    for (let i = 0; i < TICK_RATE * 3; i++) s.step();
    const a = worlds(s).filter((e) => e.kind === 'nuclear');
    expect(a.map((e) => e.phase)).toEqual(['started', 'started', 'started']);
    expect(new Set(a.map((e) => e.slot)).size).toBe(3);
    researching = null;
    techs = [...techs, 'nuclear_weapons'];
    for (let i = 0; i < TICK_RATE * 3; i++) s.step();
    expect(worlds(s).filter((e) => e.kind === 'nuclear' && e.phase === 'completed')).toHaveLength(3);
  });
});

describe('Demolir (03/11)', () => {
  it('derruba construção própria (não o QG), devolve a fila e recusa a de outro jogador', () => {
    const s = sim();
    const house = s.addBuilding('house', 0, { cx: 8, cy: 3 }, 1);
    const enemy = s.addBuilding('house', 1, { cx: 30, cy: 30 }, 1);
    expect(s.applyCommand(0, { type: 'demolish', buildingId: s.hqOf(0)!.id })).toMatch(/não podem ser demolidos/);
    expect(s.applyCommand(0, { type: 'demolish', buildingId: enemy.id })).toMatch(/inválida/);
    expect(s.applyCommand(0, { type: 'demolish', buildingId: house.id })).toBeNull();
    expect(s.entities.has(house.id)).toBe(false);
    expect(s.grid.occupant(8, 3)).toBe(0);
    expect(s.drainEvents().some((e) => e.type === 'demolished' && e.buildingType === 'house')).toBe(true);
  });

  it('demolir tanque de petróleo e armazém tira do estoque o que estava neles (como na destruição)', () => {
    const s = sim();
    const p = s.players[0]!;
    const tank = s.addBuilding('oil_tank', 0, { cx: 8, cy: 3 }, 1);
    tank.stored = 40;
    p.oilReserve = 60;
    p.resources.oil = 100;
    s.drainEvents();
    expect(s.applyCommand(0, { type: 'demolish', buildingId: tank.id })).toBeNull();
    // sem o tanque, o petróleo dele some: o estoque volta a ser só a reserva do QG
    expect(p.resources.oil).toBe(60);
    expect(s.drainEvents().some((e) => e.type === 'storage_lost' && e.resource === 'oil' && e.amount === 40)).toBe(true);
    const wh = s.addBuilding('warehouse', 0, { cx: 14, cy: 3 }, 1);
    p.resources.wood = s.capacity(0).wood;
    const withWh = p.resources.wood;
    expect(s.applyCommand(0, { type: 'demolish', buildingId: wh.id })).toBeNull();
    expect(p.resources.wood).toBe(s.capacity(0).wood);
    expect(p.resources.wood).toBeLessThan(withWh);
  });

  it('não demole base aérea com aeronaves nem silo com mísseis', () => {
    const s = sim();
    const base = s.addBuilding('airbase', 0, { cx: 8, cy: 3 }, 1);
    s.air.aircraft.push({ id: 77, type: 'fighter', owner: 0, baseId: base.id, home: { ...base.pos }, state: 'ready', timer: 0, missionId: null });
    expect(s.applyCommand(0, { type: 'demolish', buildingId: base.id })).toMatch(/aeronaves/);
    s.air.aircraft = [];
    expect(s.applyCommand(0, { type: 'demolish', buildingId: base.id })).toBeNull();
    const silo = s.addBuilding('missile_silo', 0, { cx: 20, cy: 3 }, 1);
    s.air.silos[silo.id] = { missiles: 1, building: 0, paid: {}, usd: 0 };
    expect(s.applyCommand(0, { type: 'demolish', buildingId: silo.id })).toMatch(/mísseis/);
    s.air.silos[silo.id] = { missiles: 0, building: 0, paid: {}, usd: 0 };
    expect(s.applyCommand(0, { type: 'demolish', buildingId: silo.id })).toBeNull();
  });

  it('derruba estrada própria e deixa a dos outros', () => {
    const s = sim();
    s.roads.push({ i: 5 * 40 + 10, owner: 0 }, { i: 5 * 40 + 11, owner: 1 });
    expect(s.applyCommand(0, { type: 'demolish', cells: [5 * 40 + 11] })).toMatch(/Nenhuma estrada sua/);
    expect(s.applyCommand(0, { type: 'demolish', cells: [5 * 40 + 10, 5 * 40 + 11] })).toBeNull();
    expect(s.roads.map((r) => r.i)).toEqual([5 * 40 + 11]);
  });

  it('comando validado', () => {
    expect(parseCommand({ type: 'demolish', buildingId: 3 })).toEqual({ type: 'demolish', buildingId: 3 });
    expect(parseCommand({ type: 'demolish', cells: [1, 2] })).toEqual({ type: 'demolish', cells: [1, 2] });
    expect(parseCommand({ type: 'demolish' })).toBeNull();
    expect(parseCommand({ type: 'demolish', buildingId: 3, cells: [1] })).toBeNull();
    expect(parseCommand({ type: 'demolish', buildingId: -1 })).toBeNull();
  });
});
