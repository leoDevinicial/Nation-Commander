import { describe, expect, it } from 'vitest';
import { TICK_RATE, TERRAIN, Terrain } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { generateBattleMap, reachable } from '../sim/MapGen.ts';
import { Simulation } from '../sim/Simulation.ts';
import type { Unit } from '../sim/types.ts';
import { NationalSimulation, OCCUPATION_GDP_LOSS } from '../strategic/NationalSimulation.ts';
import { OPS, OperationsSystem, garrisonSize, operationCost, operationsView } from '../strategic/operations.ts';
import { TICKS_PER_DAY } from '../strategic/params.ts';
import { sectorById, sectorsOf } from '../data/sectors.ts';
import { flatMap, meet } from './helpers.ts';

/** Partida BRA × ARG com o Brasil em guerra contra os EUA (governo da IA fora do teatro). */
function setup(units: Unit['type'][] = ['infantry', 'infantry', 'tank', 'apc']) {
  const theater = new Simulation({ map: flatMap(40), playerCount: 2, startingUnits: units });
  const national = new NationalSimulation(
    [
      { slot: 0, countryId: 'BRA' },
      { slot: 1, countryId: 'ARG' },
    ],
    3,
    'realistic',
  );
  national.attachTheater({
    resources: (slot) => theater.players[slot]?.resources ?? null,
    spend: (slot, cost) => void theater.spendResources(slot, cost),
    setWar: (a, b) => theater.setWar(a, b, true),
  });
  for (const p of theater.players) for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 900;
  const usa = national.npcs.find((n) => n.countryId === 'USA')!.slot;
  meet(national, 0, usa);
  const ops = new OperationsSystem(theater, national, 11);
  const mine = () => theater.units.filter((u) => u.owner === 0);
  const step = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      theater.step();
      ops.step();
    }
  };
  return { theater, national, ops, usa, mine, step, sector: sectorsOf('USA')[0]!.id };
}

describe('Fase 8 — guerra contra governos fora do teatro e lançamento', () => {
  it('recusa operações sem guerra, contra jogador do teatro, sem unidades ou com setor inválido', () => {
    const { ops, usa, mine, sector, national } = setup();
    const ids = mine().map((u) => u.id);
    expect(ops.launch(0, usa, sector, ids)).toMatch(/Sem estado de guerra/);
    expect(ops.launch(0, 1, sector, ids)).toMatch(/jogadores se enfrentam no próprio teatro/);
    expect(national.diplomaticAction(0, { type: 'declare_war', target: usa })).toBeNull();
    expect(ops.launch(0, usa, 'ARG-pampa', ids)).toMatch(/Setor inválido/);
    expect(ops.launch(0, usa, sector, [])).toMatch(/Escolha as unidades/);
    expect(ops.launch(0, usa, sector, [999])).toMatch(/inválidas/);
  });

  it('lançar: as mesmas unidades saem do teatro (sem duplicar), a população não muda e os custos são cobrados', () => {
    const { theater, national, ops, usa, mine, sector } = setup();
    national.diplomaticAction(0, { type: 'declare_war', target: usa });
    const before = mine();
    const pop = theater.population(0);
    const debt = national.nation(0)!.debtUsd;
    const supplies = theater.players[0]!.resources.supplies;
    const cost = operationCost(
      'BRA',
      sectorById(sector)!,
      before.map((u) => u.type),
    );
    expect(
      ops.launch(
        0,
        usa,
        sector,
        before.map((u) => u.id),
      ),
    ).toBeNull();
    expect(mine()).toHaveLength(0);
    expect(theater.population(0).military).toBe(pop.military);
    expect(theater.population(0).total).toBe(pop.total);
    expect(theater.players[0]!.resources.supplies).toBe(supplies - cost.supplies);
    expect(national.nation(0)!.debtUsd).toBeCloseTo(debt + cost.usd, 0);
    const op = ops.ops[0]!;
    expect(op.units.map((u) => u.originId)).toEqual(before.map((u) => u.id));
    expect(op.state).toBe('transit');
    expect(op.travelDays).toBe(cost.days);
    // uma operação por vez
    theater.addUnit('infantry', 0, { x: 10, y: 10 });
    expect(ops.launch(0, usa, sector, [mine()[0]!.id])).toMatch(/Já há uma operação/);
  });
});

describe('Fase 8 — batalha local e reconciliação', () => {
  function launched() {
    const s = setup();
    s.national.diplomaticAction(0, { type: 'declare_war', target: s.usa });
    const units = s.mine();
    units[0]!.hp = units[0]!.maxHp * 0.5;
    units[0]!.mods = ['body_armor'];
    s.ops.launch(
      0,
      s.usa,
      s.sector,
      units.map((u) => u.id),
    );
    const op = s.ops.ops[0]!;
    s.step(op.arriveTick - s.theater.tick);
    return { ...s, op, originals: units.map((u) => ({ id: u.id, type: u.type, hp: u.hp, mods: [...u.mods] })) };
  }

  it('a batalha recebe as forças enviadas (mesma vida e equipamento) e a guarnição do setor, em mapa do bioma', () => {
    const { ops, op, originals, national, usa, sector } = launched();
    expect(op.state).toBe('battle');
    const battle = ops.battles.get(op.id)!;
    expect(battle.battle).toBe(true);
    const attackers = battle.units.filter((u) => u.owner === 0);
    expect(attackers.map((u) => u.type).sort()).toEqual(originals.map((u) => u.type).sort());
    const wounded = battle.entities.get(op.units[0]!.battleId!) as Unit;
    expect(wounded.hp).toBe(originals[0]!.hp);
    expect(wounded.mods).toEqual(['body_armor']);
    const defenders = battle.units.filter((u) => u.owner === 1).length;
    expect(defenders).toBe(garrisonSize(national.defenseBudgetUsd(usa), sectorById(sector)!));
    expect(battle.buildings.some((b) => b.owner === 1 && b.type === 'tower')).toBe(true);
  });

  it('vitória: setor ocupado, PIB do alvo cai, sobreviventes voltam ao teatro com a vida que tinham, uma única vez', () => {
    const { theater, national, ops, op, usa, step, mine, sector } = launched();
    const battle = ops.battles.get(op.id)!;
    const gdp = national.nation(usa)!.gdpUsd;
    const survivor = battle.entities.get(op.units[1]!.battleId!) as Unit;
    survivor.hp = 42;
    battle.damageBuilding(battle.hqOf(1)!, 1e6, 0);
    step(1);
    expect(op.result?.outcome).toBe('victory');
    expect(op.result?.occupied).toBe(true);
    expect(ops.sector(usa, sector)!.control).toBe('occupied');
    expect(national.nation(usa)!.gdpUsd).toBeCloseTo(gdp * (1 - sectorById(sector)!.share * OCCUPATION_GDP_LOSS), -3);
    const news = national.drainEvents().filter((e) => e.type === 'operation');
    expect(news).toHaveLength(1);
    expect(op.state).toBe('returning');
    expect(ops.battles.has(op.id)).toBe(false);
    step(op.returnTick - theater.tick);
    expect(op.state).toBe('done');
    const back = mine();
    expect(back).toHaveLength(op.units.filter((u) => !u.lost).length);
    expect(back.some((u) => u.hp === 42)).toBe(true);
    expect(theater.detached[0]).toBe(0);
    step(5 * TICKS_PER_DAY);
    expect(national.drainEvents().filter((e) => e.type === 'operation')).toHaveLength(0);
    // setor ocupado rende suprimentos por dia no teatro
    const s0 = theater.players[0]!.resources.supplies;
    step(TICKS_PER_DAY);
    expect(theater.players[0]!.resources.supplies).toBeGreaterThan(s0);
  });

  it('derrota: todas as forças perdidas contam como baixas; a guarnição fica com o que sobrou', () => {
    const { theater, national, ops, op, step, mine, usa, sector } = launched();
    const battle = ops.battles.get(op.id)!;
    for (const u of op.units) battle.damageUnit(battle.entities.get(u.battleId!) as Unit, 1e6, 1);
    const killed = battle.units.find((u) => u.owner === 1)!;
    battle.damageUnit(killed, 1e6, 0);
    step(2);
    expect(op.result?.outcome).toBe('defeat');
    expect(op.result?.lost).toBe(op.units.length);
    expect(op.result?.enemyLost).toBe(1);
    expect(op.state).toBe('done');
    expect(theater.detached[0]).toBe(0);
    expect(mine()).toHaveLength(0);
    expect(national.nation(0)!.casualties30d[0]).toBe(op.units.length);
    expect(ops.sector(usa, sector)!.garrison).toBeLessThan(1);
  });

  it('recuo durante o combate e na viagem de ida; impasse por tempo limite', () => {
    const a = launched();
    expect(a.ops.retreat(1, a.op.id)).toMatch(/inválida/);
    expect(a.ops.retreat(0, a.op.id)).toBeNull();
    a.step(1);
    expect(a.op.result?.outcome).toBe('retreat');
    expect(a.op.result?.lost).toBe(0);

    const b = setup();
    b.national.diplomaticAction(0, { type: 'declare_war', target: b.usa });
    const ids = b.mine().map((u) => u.id);
    b.ops.launch(0, b.usa, b.sector, ids);
    b.step(TICKS_PER_DAY);
    expect(b.ops.retreat(0, b.ops.ops[0]!.id)).toBeNull();
    const op = b.ops.ops[0]!;
    expect(op.state).toBe('returning');
    b.step(op.returnTick - b.theater.tick);
    expect(
      b
        .mine()
        .map((u) => u.type)
        .sort(),
    ).toEqual(['apc', 'infantry', 'infantry', 'tank']);

    const c = launched();
    c.ops.battles.get(c.op.id)!; // sem ordens: ninguém ataca o posto
    c.step(OPS.maxBattleSeconds * TICK_RATE + 2);
    expect(['stalemate', 'defeat', 'victory']).toContain(c.op.result?.outcome);
  });

  it('salvar e carregar no meio da batalha continua igual', () => {
    const { theater, national, ops, op } = launched();
    const battle = ops.battles.get(op.id)!;
    battle.applyCommand(0, { type: 'attack_move', unitIds: battle.units.filter((u) => u.owner === 0).map((u) => u.id), x: 70, y: 30 });
    for (let i = 0; i < 40; i++) {
      theater.step();
      ops.step();
    }
    const copy = new OperationsSystem(Simulation.fromSave(theater.toSave()), national, 11);
    copy.load(ops.toSave());
    for (let i = 0; i < 60; i++) {
      ops.step();
      copy.step();
    }
    expect(copy.battles.get(op.id)!.serialize()).toBe(ops.battles.get(op.id)!.serialize());
  });

  it('a visão do jogador lista os países em guerra, os setores e a operação; comandos validados', () => {
    const { ops, national, op, usa, theater } = launched();
    const v = operationsView(ops, national, 0, theater.tick);
    expect(v.wars.map((w) => w.target)).toContain(usa);
    expect(v.wars[0]!.sectors.length).toBe(sectorsOf('USA').length);
    expect(v.ops[0]!.id).toBe(op.id);
    expect(operationsView(ops, national, 1, theater.tick).ops).toHaveLength(0);
    expect(parseCommand({ type: 'launch_operation', target: 100, sectorId: 'USA-texas', unitIds: [1, 1, 2] })).toEqual({
      type: 'launch_operation',
      target: 100,
      sectorId: 'USA-texas',
      unitIds: [1, 2],
    });
    expect(parseCommand({ type: 'launch_operation', target: 100, sectorId: 5, unitIds: [1] })).toBeNull();
    expect(parseCommand({ type: 'operation_retreat', opId: 3 })).toEqual({ type: 'operation_retreat', opId: 3 });
  });
});

describe('Fase 8 — mapa da batalha pelo bioma', () => {
  it('costa, rio e estrada: sempre há caminho entre as posições', () => {
    for (const id of ['ARG-pampa', 'BRA-norte', 'USA-texas', 'DEU-baviera', 'JPN-kanto']) {
      const def = sectorById(id)!;
      const map = generateBattleMap(77, def);
      const [a, b] = map.spawns as [{ cx: number; cy: number }, { cx: number; cy: number }];
      expect(reachable(map, a).has(b.cy * map.width + b.cx), id).toBe(true);
      if (def.coast) expect(map.terrain[(map.height - 1) * map.width + 5]).toBe(Terrain.Water);
      if (def.river) expect(map.terrain.filter((t) => t === Terrain.Water).length).toBeGreaterThan(map.height);
      expect(TERRAIN[map.terrain[a.cy * map.width + a.cx]!].buildable).toBe(true);
    }
    // bioma árido tem bem menos floresta que o tropical
    const forest = (id: string) => generateBattleMap(5, sectorById(id)!).terrain.filter((t) => t === Terrain.Forest).length;
    expect(forest('USA-texas')).toBeLessThan(forest('BRA-norte'));
  });
});
