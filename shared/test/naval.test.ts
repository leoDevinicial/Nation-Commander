import { describe, expect, it } from 'vitest';
import { reachable } from '../sim/MapGen.ts';
import { TICK_RATE, Terrain, UNITS } from '../sim/config.ts';
import { generateMatchMap } from '../sim/matchMap.ts';
import { parseCommand } from '../sim/commands.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import type { Cell, Unit } from '../sim/types.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

/** Arquipélago de 2 nações: uma célula de água colada à ilha do jogador (para o navio) e um ponto na ilha do outro. */
function setup() {
  const map = generateMatchMap(7, { nations: 2, type: 'islands' });
  const sim = new Simulation({ map, playerCount: 2, startingUnits: ['infantry', 'infantry', 'tank'] });
  const W = map.width;
  const home = reachable(map, map.spawns[0]!);
  // água colada à ilha do jogador 0, a mais perto da base
  let coast: Cell | null = null;
  let best = Infinity;
  for (const i of home) {
    for (const n of [i - 1, i + 1, i - W, i + W]) {
      if (map.terrain[n] !== Terrain.Water) continue;
      const c = { cx: n % W, cy: Math.floor(n / W) };
      const d = Math.hypot(c.cx - map.spawns[0]!.cx, c.cy - map.spawns[0]!.cy);
      if (d < best) {
        best = d;
        coast = c;
      }
    }
  }
  const ship = sim.addUnit('transport_ship', 0, sim.grid.cellCenter(coast!));
  const troops = sim.units.filter((u) => u.owner === 0 && !UNITS[u.type].naval);
  return { sim, ship, troops, enemyBase: sim.grid.cellCenter(map.spawns[1]!) };
}

describe('Navio de transporte (03/11)', () => {
  it('no Arquipélago não há caminho por terra até o inimigo', () => {
    const { sim } = setup();
    expect(reachable(sim.map, sim.map.spawns[0]!).has(sim.map.spawns[1]!.cy * sim.map.width + sim.map.spawns[1]!.cx)).toBe(false);
  });

  it('embarca, atravessa o mar e desembarca na outra ilha; a carga conta na população', () => {
    const { sim, ship, troops, enemyBase } = setup();
    const pop = sim.population(0).military;
    expect(sim.applyCommand(0, { type: 'embark', unitIds: troops.map((u) => u.id), shipId: ship.id })).toBeNull();
    run(sim, TICK_RATE * 40);
    expect(ship.cargo?.length).toBe(troops.length);
    expect(sim.units.some((u) => troops.some((t) => t.id === u.id))).toBe(false);
    expect(sim.population(0).military).toBe(pop);
    // desembarque em território inimigo só em guerra
    expect(sim.applyCommand(0, { type: 'unload', shipId: ship.id, x: enemyBase.x, y: enemyBase.y })).toMatch(/guerra/);
    sim.setWar(0, 1, true);
    expect(sim.applyCommand(0, { type: 'unload', shipId: ship.id, x: enemyBase.x, y: enemyBase.y })).toBeNull();
    // anda até a costa e desembarca (confere logo, antes das defesas inimigas reagirem)
    for (let t = 0; t < TICK_RATE * 150 && (ship.cargo?.length ?? 0) > 0; t++) sim.step();
    expect(ship.cargo?.length ?? 0).toBe(0);
    // as tropas estão em terra, na ilha do inimigo
    const W = sim.map.width;
    const enemyIsland = reachable(sim.map, sim.map.spawns[1]!);
    const landed = sim.units.filter((u) => troops.some((t) => t.id === u.id));
    expect(landed).toHaveLength(troops.length);
    for (const u of landed) {
      const c = sim.grid.worldToCell(u.pos);
      expect(enemyIsland.has(c.cy * W + c.cx)).toBe(true);
    }
  });

  it('o navio só anda na água, não ataca, e afundado leva a carga junto', () => {
    const { sim, ship, troops } = setup();
    expect(sim.applyCommand(0, { type: 'embark', unitIds: troops.map((u) => u.id), shipId: ship.id })).toBeNull();
    run(sim, TICK_RATE * 40);
    expect(ship.cargo?.length ?? 0).toBeGreaterThan(0);
    // ordem de mover para a terra: ele para na água mais perto
    const base = sim.grid.cellCenter(sim.map.spawns[0]!);
    sim.applyCommand(0, { type: 'move', unitIds: [ship.id], x: base.x, y: base.y });
    run(sim, TICK_RATE * 10);
    const c = sim.grid.worldToCell(ship.pos);
    expect(sim.map.terrain[c.cy * sim.map.width + c.cx]).toBe(Terrain.Water);
    // afunda
    const lost = sim.players[0]!.stats.unitsLost;
    const n = ship.cargo!.length;
    sim.damageUnit(ship as Unit, 10_000, 1);
    run(sim, 2);
    expect(sim.players[0]!.stats.unitsLost).toBe(lost + 1 + n);
    expect(sim.units.some((u) => u.id === ship.id)).toBe(false);
  });

  it('o Porto produz o navio, que nasce na água', () => {
    const { sim } = setup();
    const W = sim.map.width;
    const home = reachable(sim.map, sim.map.spawns[0]!);
    const sp = sim.map.spawns[0]!;
    // terreno 2×2 livre na ilha, colado à água, o mais perto da base
    let at: Cell | null = null;
    let best = Infinity;
    for (const i of home) {
      const cx = i % W;
      const cy = Math.floor(i / W);
      const cells = [i, i + 1, i + W, i + W + 1];
      if (!cells.every((c) => home.has(c) && sim.grid.isPassable(c % W, Math.floor(c / W)))) continue;
      const wet = [i - 1, i + 2, i + W - 1, i + W + 2, i - W, i - W + 1, i + 2 * W, i + 2 * W + 1].some((n) => sim.map.terrain[n] === Terrain.Water);
      const d = Math.hypot(cx - sp.cx, cy - sp.cy);
      if (wet && d > 4 && d < best) {
        best = d;
        at = { cx, cy };
      }
    }
    const port = sim.addBuilding('port', 0, at!, 1);
    const p = sim.players[0]!;
    p.era = 2;
    p.recruits = 5;
    Object.assign(p.resources, { wood: 5000, iron: 5000, oil: 5000, supplies: 5000 });
    sim.staff(0);
    expect(sim.applyCommand(0, { type: 'produce', buildingId: port.id, unitType: 'transport_ship' })).toBeNull();
    run(sim, TICK_RATE * 60);
    const ships = sim.units.filter((u) => u.owner === 0 && u.type === 'transport_ship');
    expect(ships.length).toBe(2);
    const c = sim.grid.worldToCell(ships[1]!.pos);
    expect(sim.map.terrain[c.cy * W + c.cx]).toBe(Terrain.Water);
  });

  it('KAC: só o dono vê a carga do navio no snapshot', () => {
    const { sim, ship, troops } = setup();
    sim.applyCommand(0, { type: 'embark', unitIds: troops.map((u) => u.id), shipId: ship.id });
    run(sim, TICK_RATE * 40);
    expect(ship.cargo?.length).toBeGreaterThan(0);
    // um soldado inimigo colado ao navio: ele vê o navio, não o que vai dentro
    sim.addUnit('infantry', 1, { x: ship.pos.x + 1, y: ship.pos.y });
    sim.step();
    const mine = makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() }).units.find((u) => u.id === ship.id)!;
    expect(mine.cargo).toHaveLength(ship.cargo!.length);
    const theirs = makeSnapshot(sim, [], { slot: 1, memory: new FogMemory() }).units.find((u) => u.id === ship.id);
    expect(theirs).toBeDefined();
    expect(theirs!.cargo).toBeUndefined();
  });

  it('comandos validados', () => {
    expect(parseCommand({ type: 'embark', unitIds: [1, 2], shipId: 3 })).toEqual({ type: 'embark', unitIds: [1, 2], shipId: 3 });
    expect(parseCommand({ type: 'unload', shipId: 3, x: 1, y: 'a' })).toBeNull();
    const { sim, ship, troops } = setup();
    // navio de outro jogador ou tropa que não é sua: recusado
    expect(sim.applyCommand(1, { type: 'embark', unitIds: troops.map((u) => u.id), shipId: ship.id })).not.toBeNull();
    expect(sim.applyCommand(0, { type: 'unload', shipId: ship.id, x: 10, y: 10 })).toMatch(/vazio/);
  });
});
