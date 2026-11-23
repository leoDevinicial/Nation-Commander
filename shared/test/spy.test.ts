import { describe, expect, it } from 'vitest';
import { SPY, TICK_RATE } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import { flatMap } from './helpers.ts';

/** Espião (23/11): invisível de longe, informação sobre a fila e sabotagem de usina. */
function setup() {
  const sim = new Simulation({ map: flatMap(60), playerCount: 2, startingUnits: [], power: true, startingResources: { supplies: 500, food: 500, wood: 500, stone: 500, iron: 500, oil: 500, coal: 500 } });
  for (let cy = 0; cy < 60; cy++) for (let cx = 0; cx < 60; cx++) sim.territory[cy * 60 + cx] = cx < 30 ? 0 : 1;
  const cs = sim.map.cellSize;
  const plant = sim.addBuilding('coal_plant', 1, { cx: 44, cy: 30 }, 1);
  const barracks = sim.addBuilding('barracks', 1, { cx: 44, cy: 40 }, 1);
  const spy = sim.addUnit('spy', 0, { x: 40 * cs, y: 30 * cs });
  return { sim, cs, plant, barracks, spy };
}

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

describe('espião', () => {
  it('o inimigo só o vê de perto; o dono sempre vê', () => {
    const { sim, cs, spy } = setup();
    expect(sim.canSee(0, spy)).toBe(true);
    // longe das construções do jogador 1 (usina a ~4 células da borda, depois do raio de 2)
    spy.pos = { x: 20 * cs, y: 10 * cs };
    expect(sim.canSee(1, spy)).toBe(false);
    expect(makeSnapshot(sim, [], { slot: 1, memory: new FogMemory() }).units.some((u) => u.id === spy.id)).toBe(false);
    // colado na usina
    spy.pos = { x: 43 * cs, y: 31 * cs };
    sim.step();
    expect(sim.canSee(1, spy)).toBe(true);
  });

  it('entra no território de outra nação sem guerra (é a função dele)', () => {
    const { sim, cs, spy } = setup();
    spy.pos = { x: 20 * cs, y: 20 * cs };
    expect(sim.applyCommand(0, { type: 'move', unitIds: [spy.id], x: 50 * cs, y: 20 * cs })).toBeNull();
    expect(spy.order.kind).toBe('move');
  });

  it('perto da construção inimiga, a fila de produção dela vai no snapshot do dono do espião', () => {
    const { sim, cs, spy, barracks } = setup();
    sim.players[1]!.recruits = 5;
    expect(sim.applyCommand(1, { type: 'produce', buildingId: barracks.id, unitType: 'infantry' })).toBeNull();
    spy.pos = { x: 20 * cs, y: 10 * cs };
    const far = makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() }).buildings.find((b) => b.id === barracks.id);
    expect(far?.queue ?? []).toHaveLength(0);
    spy.pos = { x: (44 - SPY.intelCells + 1) * cs, y: 41 * cs };
    sim.step();
    const near = makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() }).buildings.find((b) => b.id === barracks.id);
    expect(near?.queue.length).toBeGreaterThan(0);
  });

  it('sabotagem: só em guerra; ao lado da usina por alguns segundos, ela para por um minuto e o espião é consumido', () => {
    const { sim, spy, plant } = setup();
    expect(sim.applyCommand(0, { type: 'spy_sabotage', unitId: spy.id, targetId: plant.id })).toMatch(/guerra/);
    sim.setWar(0, 1, true);
    expect(sim.applyCommand(0, { type: 'spy_sabotage', unitId: spy.id, targetId: plant.id })).toBeNull();
    run(sim, 20);
    expect(sim.entities.has(spy.id)).toBe(false);
    expect(plant.sabotagedUntil).toBeGreaterThan(sim.tick);
    expect(sim.powerGen(plant)).toBe(0);
    run(sim, SPY.outageSeconds + 1);
    expect(sim.powerGen(plant)).toBeGreaterThan(0);
  });
});
