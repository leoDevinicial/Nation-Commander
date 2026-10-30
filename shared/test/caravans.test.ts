import { describe, expect, it } from 'vitest';
import { CARAVAN, ROAD, TICK_RATE, Terrain } from '../sim/config.ts';
import { caravanIncome, roadLink } from '../sim/caravans.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import { TacticalAI } from '../sim/TacticalAI.ts';
import { flatMap } from './helpers.ts';

/** Caravanas internas entre o Centro de Comando e as prefeituras (docs/CARAVANAS.md). */

/** Estrada na linha 5, do QG (células 2..4) até a prefeitura (24..25, linhas 6..7). */
const ROAD_ROW = Array.from({ length: 24 }, (_, k) => ({ cx: 3 + k, cy: 5 }));

function setup(opts: { road?: boolean } = { road: true }) {
  const map = flatMap(40, (set) => {
    if (opts.road) for (const c of ROAD_ROW) set(c.cx, c.cy, Terrain.Road);
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

  it('só anda por estrada: sem ligação fica parada; com a estrada pronta, sai e segue por ela', () => {
    const { sim, hall, run } = setup({ road: false });
    sim.players[0]!.resources.stone = 1000;
    run(3);
    const c = sim.caravans.forCity(hall.id)!;
    expect(c.state).toBe('no_road');
    expect(c.travelled).toBe(0);
    expect(c.lastIncome).toBe(0);
    // uma estrada com uma lacuna ainda não liga
    expect(sim.applyCommand(0, { type: 'build_road', cells: ROAD_ROW.filter((q) => q.cx !== 14) })).toBeNull();
    run(CARAVAN.retrySeconds + 1);
    expect(c.state).toBe('no_road');
    expect(sim.applyCommand(0, { type: 'build_road', cells: [{ cx: 14, cy: 5 }] })).toBeNull();
    run(CARAVAN.retrySeconds + 1);
    expect(c.state).toBe('moving');
    // todos os pontos intermediários da rota ficam sobre a estrada
    for (const p of c.path.slice(1, -1)) {
      const cell = sim.grid.worldToCell(p);
      expect(sim.map.terrain[cell.cy * 40 + cell.cx]).toBe(Terrain.Road);
    }
  });

  it('território de quem está em guerra no caminho corta a ligação', () => {
    const { sim, hall } = setup();
    const hq = sim.hqOf(0)!;
    expect(roadLink(sim, 0, hq, hall)).not.toBeNull();
    sim.setWar(0, 1, true);
    sim.territory[5 * 40 + 14] = 1;
    expect(roadLink(sim, 0, hq, hall)).toBeNull();
  });

  it('tropas de quem está em guerra destroem a caravana; uma nova sai do QG depois', () => {
    const { sim, hall, run } = setup();
    run(1);
    const c = sim.caravans.forCity(hall.id)!;
    const mid = c.path[Math.floor(c.path.length / 2)]!;
    // (sem guerra, tropa estrangeira parada no território é retirada: a guerra vem antes)
    sim.setWar(0, 1, true);
    const enemy = sim.addUnit('infantry', 1, { x: mid.x, y: mid.y + 1 });
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

describe('IA: estradas até as prefeituras', () => {
  function aiSetup(edit?: (set: (cx: number, cy: number, t: Terrain) => void) => void) {
    const sim = new Simulation({ map: flatMap(40, edit), playerCount: 2, startingUnits: [] });
    const p = sim.players[0]!;
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 3000;
    const hall = sim.addBuilding('city_hall', 0, { cx: 22, cy: 6 }, 1);
    sim.step();
    return { sim, hall, ai: new TacticalAI(0) };
  }
  const roadCmds = (cmds: ReturnType<TacticalAI['think']>) => cmds.filter((c) => c.type === 'build_road');

  it('liga a prefeitura ao QG com a mesma regra e o mesmo custo do jogador', () => {
    const { sim, hall, ai } = aiSetup();
    const stone = sim.players[0]!.resources.stone;
    const cmds = roadCmds(ai.think(sim));
    expect(cmds).toHaveLength(1);
    for (const c of cmds) expect(sim.applyCommand(0, c)).toBeNull();
    expect(roadLink(sim, 0, sim.hqOf(0)!, hall)).not.toBeNull();
    expect(sim.players[0]!.resources.stone).toBeLessThan(stone);
    // ligada: não pede outra estrada
    expect(roadCmds(new TacticalAI(0).think(sim))).toHaveLength(0);
  });

  it('desvia de rio e floresta no traçado', () => {
    // rio na coluna 12 (linhas 0..9) e floresta na coluna 16 (linhas 0..8): o traçado contorna os dois por baixo
    const { sim, hall, ai } = aiSetup((set) => {
      for (let cy = 0; cy <= 9; cy++) set(12, cy, Terrain.Water);
      for (let cy = 0; cy <= 8; cy++) set(16, cy, Terrain.Forest);
    });
    const cmds = roadCmds(ai.think(sim));
    expect(cmds).toHaveLength(1);
    const cells = (cmds[0] as { cells: { cx: number; cy: number }[] }).cells;
    expect(cells.every((c) => c.cx !== 12 || c.cy > 9)).toBe(true);
    expect(cells.every((c) => c.cx !== 16 || c.cy > 8)).toBe(true);
    expect(sim.applyCommand(0, cmds[0]!)).toBeNull();
    expect(roadLink(sim, 0, sim.hqOf(0)!, hall)).not.toBeNull();
  });

  it('espera quando a estrada deixaria a pedra abaixo da reserva', () => {
    const { sim, ai } = aiSetup();
    sim.players[0]!.resources.stone = 60;
    expect(roadCmds(ai.think(sim))).toHaveLength(0);
  });
});

describe('Produção ligada por estrada (+15%)', () => {
  // fazenda colada à estrada da linha 5 (células 10..11, linhas 6..7) com solo fértil embaixo dela
  function prodSetup(road: boolean) {
    const map = flatMap(40, (set) => {
      if (road) for (const c of ROAD_ROW) set(c.cx, c.cy, Terrain.Road);
      for (let cy = 8; cy <= 10; cy++) for (let cx = 9; cx <= 12; cx++) set(cx, cy, Terrain.Fertile);
    });
    const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
    const farm = sim.addBuilding('farm', 0, { cx: 10, cy: 6 }, 1);
    farm.workers = sim.fx(farm).workers;
    sim.step();
    return { sim, farm };
  }

  it('coleta ligada ao QG por estrada produz 15% a mais; sem ligação, não', () => {
    const linked = prodSetup(true);
    const loose = prodSetup(false);
    expect(linked.sim.roadLinked(linked.farm)).toBe(true);
    expect(loose.sim.roadLinked(loose.farm)).toBe(false);
    expect(loose.sim.buildingRate(loose.farm)).toBeGreaterThan(0);
    expect(linked.sim.buildingRate(linked.farm) / loose.sim.buildingRate(loose.farm)).toBeCloseTo(ROAD.productionMul, 5);
  });

  it('a ligação pode ser por uma prefeitura, e a estrada cortada tira o bônus', () => {
    const { sim, farm } = prodSetup(true);
    // corta a estrada entre o QG e a fazenda: sem prefeitura do lado de lá, perde o bônus
    sim.map.terrain[5 * 40 + 6] = Terrain.Plains;
    sim.grid.terrain[5 * 40 + 6] = Terrain.Plains;
    sim.territoryVersion++;
    expect(sim.roadLinked(farm)).toBe(false);
    sim.addBuilding('city_hall', 0, { cx: 24, cy: 6 }, 1);
    sim.territoryVersion++;
    expect(sim.roadLinked(farm)).toBe(true);
    // o dono vê o estado no painel; usina também conta
    const snap = makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() });
    expect(snap.buildings.find((b) => b.id === farm.id)!.roadLinked).toBe(true);
  });

  it('IA liga uma coleta próxima por estrada, sem pavimentar a plantação', () => {
    const map = flatMap(40, (set) => {
      for (let cy = 8; cy <= 10; cy++) for (let cx = 9; cx <= 12; cx++) set(cx, cy, Terrain.Fertile);
    });
    const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
    const p = sim.players[0]!;
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 3000;
    const farm = sim.addBuilding('farm', 0, { cx: 8, cy: 5 }, 1);
    sim.step();
    const cmds = new TacticalAI(0).think(sim).filter((c) => c.type === 'build_road');
    expect(cmds).toHaveLength(1);
    const cells = (cmds[0] as { cells: { cx: number; cy: number }[] }).cells;
    expect(cells.length).toBeLessThanOrEqual(10);
    for (const c of cells) expect(farm.claims).not.toContain(c.cy * 40 + c.cx);
    expect(sim.applyCommand(0, cmds[0]!)).toBeNull();
    expect(sim.roadLinked(farm)).toBe(true);
  });
});
