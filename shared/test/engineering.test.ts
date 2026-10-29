import { describe, expect, it } from 'vitest';
import { BUILDINGS, MINE, ROAD, TICK_RATE, Terrain, UNITS } from '../sim/config.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import { TacticalAI } from '../sim/TacticalAI.ts';
import { NO_OWNER } from '../sim/territory.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { flatMap } from './helpers.ts';

/** Lote 3: estradas do jogador, Engenheiro de Combate, minas antitanque e obstáculos. */

function setup(opts: { fund?: number } = {}) {
  const sim = new Simulation({
    map: flatMap(40),
    playerCount: 2,
    startingUnits: [],
  });
  const st = { fund: opts.fund ?? 1e9, charged: 0 };
  const link: NationalLink = {
    techs: () => [],
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => st.fund,
    chargeWorks: (_s, usd) => {
      if (st.fund < usd) return false;
      st.fund -= usd;
      st.charged += usd;
      return true;
    },
    refundWorks: () => {},
    worksCapUsd: () => 100_000_000,
  };
  sim.national = link;
  // território: oeste do jogador 0, leste do 1 e uma faixa neutra no meio (x 18..21)
  for (let cy = 0; cy < 40; cy++) for (let cx = 0; cx < 40; cx++) sim.territory[cy * 40 + cx] = cx < 18 ? 0 : cx > 21 ? 1 : NO_OWNER;
  for (const p of sim.players) for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 500;
  const run = (s: number) => {
    for (let i = 0; i < s * TICK_RATE; i++) sim.step();
  };
  const cell = (cx: number, cy: number) => sim.grid.cellCenter({ cx, cy });
  return { sim, st, run, cell };
}

const line = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, k) => ({ cx: x0 + k, cy: y }));

describe('Estradas do jogador', () => {
  it('pavimenta no próprio território com pedra e verba de obras; recusa traçado quebrado e terreno ruim', () => {
    const { sim, st } = setup();
    expect(
      sim.applyCommand(0, {
        type: 'build_road',
        cells: [
          { cx: 6, cy: 10 },
          { cx: 8, cy: 10 },
        ],
      }),
    ).toMatch(/contínuo/);
    sim.map.terrain[10 * 40 + 9] = Terrain.Forest;
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(10, 6, 9) })).toMatch(/planície/);
    const stone = sim.players[0]!.resources.stone;
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(12, 4, 8) })).toBeNull();
    expect(sim.players[0]!.resources.stone).toBe(stone - 5 * ROAD.stonePerCell);
    expect(st.charged).toBe(Math.round(100_000_000 * ROAD.usdSharePerCell * 5));
    for (let x = 4; x <= 8; x++) {
      expect(sim.map.terrain[12 * 40 + x]).toBe(Terrain.Road);
      expect(sim.grid.terrain[12 * 40 + x]).toBe(Terrain.Road);
    }
    // repetir o mesmo traçado não cobra nada
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(12, 4, 8) })).toMatch(/já é estrada/);
    // as estradas vão no snapshot junto com o território e sobrevivem ao salvamento
    expect(makeSnapshot(sim, []).roads).toHaveLength(5);
    const copy = Simulation.fromSave(sim.toSave());
    expect(copy.roads).toHaveLength(5);
    expect(copy.grid.terrain[12 * 40 + 6]).toBe(Terrain.Road);
  });

  it('fora do território só com Engenheiro de Combate por perto; nunca em território de nação em paz', () => {
    const { sim, cell } = setup();
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(20, 16, 20) })).toMatch(/Engenheiro/);
    sim.addUnit('engineer', 0, cell(17, 20));
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(20, 16, 20) })).toBeNull();
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(21, 20, 22) })).toMatch(/outra nação/);
    sim.setWar(0, 1, true);
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(21, 20, 22) })).toBeNull();
  });

  it('verba de obras insuficiente bloqueia; manutenção em suprimentos', () => {
    const { sim, run } = setup({ fund: 0 });
    const plain = setup();
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(12, 4, 8) })).toMatch(/Verba/);
    sim.national = {
      ...sim.national!,
      worksFundUsd: () => 1e9,
      chargeWorks: () => true,
    };
    expect(sim.applyCommand(0, { type: 'build_road', cells: line(12, 2, 15) })).toBeNull();
    expect(sim.roadCount(0)).toBe(14);
    sim.players[0]!.resources.supplies = plain.sim.players[0]!.resources.supplies;
    run(60);
    plain.run(60);
    // a mesma partida sem estrada: a diferença é a manutenção (~14 × 0,004 × 60 suprimentos)
    const upkeep = plain.sim.players[0]!.resources.supplies - sim.players[0]!.resources.supplies;
    expect(upkeep).toBeGreaterThanOrEqual(Math.floor(14 * ROAD.upkeepPerCell * 60) - 1);
    expect(upkeep).toBeLessThanOrEqual(Math.ceil(14 * ROAD.upkeepPerCell * 60) + 1);
  });

  it('moradia ligada à estrada conta como bairro pavimentado', () => {
    const { sim } = setup();
    const a = sim.addBuilding('house', 0, { cx: 4, cy: 4 }, 1);
    sim.addBuilding('house', 0, { cx: 10, cy: 4 }, 1);
    expect(sim.pavedHomes(0)).toEqual({ homes: 2, paved: 0 });
    // estrada encostada no lado de baixo da primeira casa
    const size = BUILDINGS.house.size;
    expect(
      sim.applyCommand(0, {
        type: 'build_road',
        cells: line(a.cell.cy + size, 3, 6),
      }),
    ).toBeNull();
    expect(sim.pavedHomes(0)).toEqual({ homes: 2, paved: 1 });
  });
});

describe('Engenheiro de Combate e minas antitanque', () => {
  it('instala parado, cobra ferro e suprimentos, e só o dono vê a mina (nem o satélite revela)', () => {
    const { sim, run, cell } = setup();
    const inf = sim.addUnit('infantry', 0, cell(10, 10));
    expect(
      sim.applyCommand(0, {
        type: 'lay_mine',
        unitIds: [inf.id],
        x: 30,
        y: 30,
      }),
    ).toMatch(/Engenheiro/);
    const eng = sim.addUnit('engineer', 0, cell(10, 10));
    const iron = sim.players[0]!.resources.iron;
    const at = cell(14, 10);
    expect(
      sim.applyCommand(0, {
        type: 'lay_mine',
        unitIds: [eng.id],
        x: at.x,
        y: at.y,
      }),
    ).toBeNull();
    expect(sim.players[0]!.resources.iron).toBe(iron - MINE.cost.iron!);
    run(2);
    expect(sim.mines.mines).toHaveLength(0);
    run(MINE.laySeconds + 4);
    expect(sim.mines.mines).toHaveLength(1);
    const own = makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() });
    expect(own.mines).toHaveLength(1);
    sim.players[1]!.satellite = { tick: 0 };
    const enemy = makeSnapshot(sim, [], { slot: 1, memory: new FogMemory() });
    expect(enemy.mines).toBeUndefined();
  });

  it('só veículos inimigos detonam; a infantaria passa por cima', () => {
    const { sim, run, cell } = setup();
    sim.setWar(0, 1, true);
    const at = cell(19, 30);
    sim.mines.mines.push({ id: 99, owner: 0, pos: at, seenBy: [] });
    const inf = sim.addUnit('infantry', 1, { x: at.x, y: at.y + 0.2 });
    run(1);
    expect(sim.mines.mines).toHaveLength(1);
    expect(inf.hp).toBe(UNITS.infantry.maxHp);
    const tank = sim.addUnit('tank', 1, { x: at.x + 0.3, y: at.y });
    const events: string[] = [];
    for (let i = 0; i < TICK_RATE; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'mine') events.push(e.state);
    }
    expect(sim.mines.mines).toHaveLength(0);
    expect(events).toContain('blast');
    expect(tank.hp).toBeLessThan(UNITS.tank.maxHp - MINE.damage * 0.9);
    // a explosão também é vista pelo dono do veículo
    expect(inf.hp).toBeLessThan(UNITS.infantry.maxHp);
  });

  it('engenheiro inimigo detecta a mina de perto e a remove parado ao lado', () => {
    const { sim, run, cell } = setup();
    sim.setWar(0, 1, true);
    const at = cell(19, 30);
    sim.mines.mines.push({ id: 7, owner: 0, pos: at, seenBy: [] });
    const eng = sim.addUnit('engineer', 1, cell(30, 30));
    run(1);
    expect(sim.mines.mines[0]!.seenBy).toEqual([]);
    expect(
      sim.applyCommand(1, {
        type: 'move',
        unitIds: [eng.id],
        x: at.x + 1,
        y: at.y,
      }),
    ).toBeNull();
    run(8);
    expect(sim.mines.mines[0]?.seenBy ?? [1]).toContain(1);
    expect(makeSnapshot(sim, [], { slot: 1, memory: new FogMemory() }).mines ?? []).toHaveLength(sim.mines.mines.length);
    run(MINE.clearSeconds + 2);
    expect(sim.mines.mines).toHaveLength(0);
  });

  it('obstáculo antitanque: fora do território só com engenheiro por perto', () => {
    const { sim, cell } = setup();
    sim.eras = false;
    expect(
      sim.applyCommand(0, {
        type: 'build',
        buildingType: 'tank_trap',
        cx: 19,
        cy: 20,
      }),
    ).not.toBeNull();
    sim.addUnit('engineer', 0, cell(18, 20));
    expect(
      sim.applyCommand(0, {
        type: 'build',
        buildingType: 'tank_trap',
        cx: 19,
        cy: 20,
      }),
    ).toBeNull();
  });

  it('salvamento guarda minas e instalações em andamento', () => {
    const { sim, cell } = setup();
    const eng = sim.addUnit('engineer', 0, cell(10, 10));
    const at = cell(12, 10);
    sim.mines.mines.push({ id: 3, owner: 0, pos: cell(5, 5), seenBy: [1] });
    sim.mines.nextId = 4;
    expect(
      sim.applyCommand(0, {
        type: 'lay_mine',
        unitIds: [eng.id],
        x: at.x,
        y: at.y,
      }),
    ).toBeNull();
    const copy = Simulation.fromSave(sim.toSave());
    expect(copy.mines.mines).toEqual(sim.mines.mines);
    expect(copy.mines.tasks).toEqual(sim.mines.tasks);
    expect(copy.mines.nextId).toBe(4);
  });
});

describe('IA com engenharia de combate', () => {
  it('Difícil: mina a frente da base e manda o engenheiro remover mina inimiga conhecida', () => {
    const { sim, cell } = setup();
    sim.difficulty = 'hard';
    sim.setWar(0, 1, true);
    for (const r of Object.keys(sim.players[1]!.resources) as (keyof (typeof sim.players)[1]['resources'])[]) sim.players[1]!.resources[r] = 3000;
    const eng = sim.addUnit('engineer', 1, sim.hqOf(1)!.pos);
    const ai = new TacticalAI(1);
    const lay = ai.think(sim).find((c) => c.type === 'lay_mine');
    expect(lay).toBeTruthy();
    expect(sim.applyCommand(1, lay!)).toBeNull();
    // mina inimiga já detectada perto: o engenheiro (livre) vai até ela
    sim.mines.tasks = [];
    const enemyMine = { id: 50, owner: 0, pos: cell(28, 30), seenBy: [1] };
    sim.mines.mines.push(enemyMine);
    const move = ai.think(sim).find((c) => c.type === 'move' && c.unitIds.includes(eng.id));
    expect(move).toMatchObject({ x: enemyMine.pos.x, y: enemyMine.pos.y });
  });
});

describe('Aprovação: bairros pavimentados e minas esquecidas', () => {
  it('entram como fatores da aprovação nacional', () => {
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 3, 'parity');
    const stats = {
      buildings: {},
      military: 0,
      workers: 0,
      food: 0,
      homes: 4,
      pavedHomes: 2,
      leftoverMines: 6,
    };
    nat.attachTheater({
      resources: () => null,
      spend: () => {},
      setWar: () => {},
      stats: () => stats,
    });
    nat.stepDay();
    const f = nat.nation(0)!.approvalFactors;
    expect(f.find((x) => x.key === 'paved')?.value).toBeCloseTo(2, 1);
    expect(f.find((x) => x.key === 'mines')?.value).toBeCloseTo(-1.5, 1);
  });
});
