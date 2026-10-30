import { describe, expect, it } from 'vitest';
import { CARAVAN, TICK_RATE, Terrain } from '../sim/config.ts';
import { caravanIncome } from '../sim/caravans.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import { flatMap } from './helpers.ts';

/** Caravanas internas entre o Centro de Comando e as prefeituras (docs/CARAVANAS.md). */

function setup(opts: { road?: boolean } = {}) {
  // QG do jogador 0 nas células 2..4; a prefeitura fica na linha 6, ao lado de uma estrada na linha 5
  const map = flatMap(40, (set) => {
    if (opts.road) for (let cx = 3; cx <= 26; cx++) set(cx, 5, Terrain.Road);
  });
  const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
  for (const p of sim.players) p.resources.supplies = 0;
  const hall = sim.addBuilding('city_hall', 0, { cx: 24, cy: 6 }, 1);
  const run = (s: number) => {
    for (let i = 0; i < s * TICK_RATE; i++) sim.step();
  };
  /** Ticks até a primeira chegada da caravana (ou -1). */
  const firstArrival = (maxSeconds = 60): number => {
    for (let t = 0; t < maxSeconds * TICK_RATE; t++) {
      sim.step();
      if (sim.caravans.forCity(hall.id)?.state === 'unloading') return t;
    }
    return -1;
  };
  return { sim, hall, run, firstArrival };
}

describe('Caravanas internas', () => {
  it('prefeitura pronta mantém uma caravana que vai e volta e rende suprimentos a cada chegada', () => {
    const { sim, hall, run, firstArrival } = setup();
    run(1);
    const c = sim.caravans.forCity(hall.id)!;
    expect(c.owner).toBe(0);
    expect(c.state).toBe('moving');
    expect(c.to).toBe('city');
    const income = caravanIncome(c.pathLength);
    expect(income).toBeGreaterThan(0);
    const gathered = sim.players[0]!.stats.resourcesGathered;
    expect(firstArrival()).toBeGreaterThan(0);
    expect(c.lastIncome).toBe(income);
    expect(sim.players[0]!.stats.resourcesGathered - gathered).toBeGreaterThanOrEqual(income);
    // descarrega e volta para o QG
    run(CARAVAN.unloadSeconds + 0.2);
    expect(c.state).toBe('moving');
    expect(c.to).toBe('hq');
    // só uma caravana por prefeitura; obra em andamento não tem caravana
    sim.addBuilding('city_hall', 0, { cx: 10, cy: 20 }, 0.5);
    run(2);
    expect(sim.caravans.caravans.length).toBe(1);
  });

  it('a estrada encurta a viagem', () => {
    const plain = setup().firstArrival();
    const paved = setup({ road: true }).firstArrival();
    expect(plain).toBeGreaterThan(0);
    expect(paved).toBeGreaterThan(0);
    expect(paved).toBeLessThan(plain * 0.9);
  });

  it('tropas de quem está em guerra destroem a caravana; uma nova sai do QG depois', () => {
    const { sim, hall, run } = setup();
    run(1);
    const c = sim.caravans.forCity(hall.id)!;
    const mid = c.path[Math.floor(c.path.length / 2)]!;
    const enemy = sim.addUnit('infantry', 1, { x: mid.x, y: mid.y + 1 });
    // sem guerra declarada, a caravana passa
    run(20);
    expect(c.state).not.toBe('destroyed');
    sim.setWar(0, 1, true);
    sim.drainEvents();
    let lost = false;
    for (let t = 0; t < 40 * TICK_RATE && !lost; t++) {
      sim.step();
      lost = sim.drainEvents().some((e) => e.type === 'caravan_lost' && e.owner === 0);
    }
    expect(lost).toBe(true);
    expect(c.state).toBe('destroyed');
    enemy.hp = 0;
    run(CARAVAN.respawnSeconds + 1);
    expect(c.state).toBe('moving');
    expect(c.to).toBe('city');
  });

  it('a cidade tomada passa a abastecer o novo dono', () => {
    const { sim, hall, run } = setup();
    run(1);
    expect(sim.caravans.forCity(hall.id)!.owner).toBe(0);
    hall.owner = 1;
    run(1);
    const c = sim.caravans.forCity(hall.id)!;
    expect(c.owner).toBe(1);
    expect(sim.caravans.caravans.filter((x) => x.owner === 0)).toHaveLength(0);
  });

  it('entra no salvamento e no snapshot (o inimigo só vê a caravana em trânsito à vista)', () => {
    const { sim, hall, run } = setup();
    run(3);
    const before = sim.caravans.forCity(hall.id)!;
    const copy = Simulation.fromSave(JSON.parse(JSON.stringify(sim.toSave())));
    const after = copy.caravans.forCity(hall.id)!;
    expect(after.travelled).toBeCloseTo(before.travelled);
    expect(after.to).toBe(before.to);
    const mine = makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() }).caravans!;
    expect(mine).toHaveLength(1);
    expect(mine[0]!.income).toBe(caravanIncome(before.pathLength));
    const theirs = makeSnapshot(sim, [], { slot: 1, memory: new FogMemory() }).caravans ?? [];
    expect(theirs.every((c) => c.income === undefined)).toBe(true);
  });
});
