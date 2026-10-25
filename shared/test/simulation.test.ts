import { describe, expect, it } from 'vitest';
import { BUILDINGS, TICK_RATE, Terrain, UNITS } from '../sim/config.ts';
import { generateMap } from '../sim/MapGen.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TacticalAI, AI_THINK_TICKS } from '../sim/TacticalAI.ts';
import { parseCommand } from '../sim/commands.ts';
import type { Unit } from '../sim/types.ts';
import { flatMap } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

function emptySim(map = flatMap()) {
  return new Simulation({ map, playerCount: 2, startingUnits: [] });
}

describe('movimento', () => {
  it('chega ao destino contornando uma parede sem atravessar células bloqueadas', () => {
    const map = flatMap(32, (set) => {
      for (let y = 0; y < 26; y++) set(16, y, Terrain.Rock);
    });
    const sim = emptySim(map);
    const u = sim.addUnit('infantry', 0, { x: 20, y: 20 });
    expect(sim.applyCommand(0, { type: 'move', unitIds: [u.id], x: 44, y: 20 })).toBeNull();
    for (let i = 0; i < TICK_RATE * 40; i++) {
      sim.step();
      const c = sim.grid.worldToCell(u.pos);
      expect(sim.grid.isPassable(c.cx, c.cy)).toBe(true);
    }
    expect(Math.hypot(u.pos.x - 44, u.pos.y - 20)).toBeLessThan(1);
    expect(u.order.kind).toBe('idle');
  });

  it('grupo recebe destinos distintos (formação)', () => {
    const sim = emptySim();
    const units = [0, 1, 2, 3].map((i) => sim.addUnit('infantry', 0, { x: 20 + i, y: 20 }));
    const targets = sim.formationTargets(units, { x: 40, y: 40 });
    const keys = new Set(targets.map((t) => `${t.x.toFixed(2)},${t.y.toFixed(2)}`));
    expect(keys.size).toBe(4);
  });

  it('destino inalcançável não trava a unidade', () => {
    const map = flatMap(32, (set) => {
      for (let y = 0; y < 32; y++) set(16, y, Terrain.Water);
    });
    const sim = emptySim(map);
    const u = sim.addUnit('infantry', 0, { x: 10, y: 10 });
    sim.applyCommand(0, { type: 'move', unitIds: [u.id], x: 50, y: 10 });
    run(sim, 5);
    expect(u.order.kind).toBe('idle');
  });
});

describe('combate', () => {
  it('não dispara fora do alcance e respeita o tempo de recarga', () => {
    const sim = emptySim();
    const a = sim.addUnit('infantry', 0, { x: 30, y: 30 });
    const b = sim.addUnit('tank', 1, { x: 30 + UNITS.infantry.weapon.range + UNITS.tank.radius + 0.5, y: 30 });
    // fixa a unidade alvo para não reagir
    b.hp = 10_000;
    sim.applyCommand(0, { type: 'attack', unitIds: [a.id], targetId: b.id });
    sim.step();
    expect(b.hp).toBe(10_000); // ainda fora do alcance: só se aproxima
    expect(a.activity).toBe('chasing');
    run(sim, TICK_RATE * 2);
    const shots = sim.drainEvents().filter((e) => e.type === 'shot' && e.attackerId === a.id);
    expect(shots.length).toBeGreaterThan(0);
    // disparos espaçados ao menos pelo cooldown
    const cd = UNITS.infantry.weapon.cooldown * TICK_RATE;
    for (let i = 1; i < shots.length; i++) expect(shots[i]!.tick - shots[i - 1]!.tick).toBeGreaterThanOrEqual(cd);
  });

  it('destrói o alvo, cancela a ordem e contabiliza estatísticas', () => {
    const sim = emptySim();
    const tanks = [0, 1, 2].map((i) => sim.addUnit('tank', 0, { x: 30, y: 30 + i * 2 }));
    const victim = sim.addUnit('infantry', 1, { x: 36, y: 32 });
    sim.applyCommand(0, { type: 'attack', unitIds: tanks.map((t) => t.id), targetId: victim.id });
    run(sim, TICK_RATE * 5);
    expect(sim.get(victim.id)).toBeUndefined();
    expect(tanks.every((t) => t.order.kind === 'idle')).toBe(true);
    expect(sim.players[0]!.stats.unitsKilled).toBe(1);
    expect(sim.players[1]!.stats.unitsLost).toBe(1);
  });

  it('unidades destruídas não aceitam ordens', () => {
    const sim = emptySim();
    const a = sim.addUnit('infantry', 0, { x: 30, y: 30 });
    a.hp = 0;
    sim.step();
    expect(sim.applyCommand(0, { type: 'move', unitIds: [a.id], x: 10, y: 10 })).not.toBeNull();
  });

  it('não aceita ordens sobre unidades de outro jogador', () => {
    const sim = emptySim();
    const enemy = sim.addUnit('infantry', 1, { x: 30, y: 30 });
    expect(sim.applyCommand(0, { type: 'move', unitIds: [enemy.id], x: 10, y: 10 })).not.toBeNull();
  });

  it('destruir o QG encerra a partida com vencedor', () => {
    const sim = emptySim();
    const hq = sim.hqOf(1)!;
    hq.hp = 1;
    const u = sim.addUnit('tank', 0, { x: hq.pos.x - 8, y: hq.pos.y });
    sim.applyCommand(0, { type: 'attack', unitIds: [u.id], targetId: hq.id });
    run(sim, TICK_RATE * 3);
    expect(sim.ended).toBe(true);
    expect(sim.winner).toBe(0);
    expect(sim.players[1]!.defeated).toBe(true);
  });
});

describe('economia, construção e produção', () => {
  it('constrói descontando o custo e conclui após o tempo de obra', () => {
    const sim = emptySim();
    const before = sim.players[0]!.resources;
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'barracks', cx: 8, cy: 3 })).toBeNull();
    // após a dedução, renda do QG continua entrando
    expect(sim.players[0]!.resources).toBe(before - BUILDINGS.barracks.cost);
    const b = sim.buildings.find((x) => x.type === 'barracks')!;
    expect(b.progress).toBe(0);
    run(sim, BUILDINGS.barracks.buildSeconds * TICK_RATE);
    expect(b.progress).toBe(1);
    expect(b.hp).toBeCloseTo(BUILDINGS.barracks.maxHp, 0);
  });

  it('recusa construção em local inválido, ocupado, fora da área ou sem recursos', () => {
    const sim = emptySim(
      flatMap(32, (set) => {
        set(8, 8, Terrain.Water);
      }),
    );
    expect(sim.placementError(0, 'barracks', { cx: 2, cy: 2 })).toBe('Local ocupado'); // sobre o QG
    expect(sim.placementError(0, 'barracks', { cx: 7, cy: 7 })).toBe('Terreno impróprio para construção');
    expect(sim.placementError(0, 'barracks', { cx: 25, cy: 25 })).not.toBeNull(); // longe/sobre inimigo
    expect(sim.placementError(0, 'barracks', { cx: 31, cy: 31 })).toBe('Fora do mapa');
    expect(sim.placementError(0, 'extractor', { cx: 5, cy: 9 })).toBe('Extratores precisam ser construídos sobre uma jazida');
    expect(sim.placementError(0, 'extractor', { cx: 10, cy: 3 })).toBeNull();
    sim.players[0]!.resources = 10;
    expect(sim.placementError(0, 'barracks', { cx: 8, cy: 3 })).toBe('Suprimentos insuficientes');
  });

  it('produz unidade gastando recursos e respeita fila; cancelar reembolsa', () => {
    const sim = emptySim();
    sim.applyCommand(0, { type: 'build', buildingType: 'barracks', cx: 8, cy: 3 });
    run(sim, BUILDINGS.barracks.buildSeconds * TICK_RATE);
    const b = sim.buildings.find((x) => x.type === 'barracks')!;
    const r0 = sim.players[0]!.resources;
    expect(sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'tank' })).not.toBeNull();
    expect(sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'infantry' })).toBeNull();
    expect(sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'infantry' })).toBeNull();
    expect(sim.players[0]!.resources).toBe(r0 - 2 * UNITS.infantry.cost);
    expect(sim.applyCommand(0, { type: 'cancel_production', buildingId: b.id })).toBeNull();
    expect(sim.players[0]!.resources).toBe(r0 - UNITS.infantry.cost);
    run(sim, UNITS.infantry.buildSeconds * TICK_RATE);
    expect(sim.units.filter((u) => u.owner === 0).length).toBe(1);
    expect(sim.players[0]!.stats.unitsProduced).toBe(1);
  });

  it('destruir o edifício interrompe a fila de produção', () => {
    const sim = emptySim();
    sim.applyCommand(0, { type: 'build', buildingType: 'barracks', cx: 8, cy: 3 });
    run(sim, BUILDINGS.barracks.buildSeconds * TICK_RATE);
    const b = sim.buildings.find((x) => x.type === 'barracks')!;
    sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'infantry' });
    b.hp = 0;
    run(sim, UNITS.infantry.buildSeconds * TICK_RATE + 5);
    expect(sim.units.filter((u) => u.owner === 0).length).toBe(0);
    // células liberadas
    expect(sim.grid.occupant(8, 3)).toBe(0);
  });

  it('o QG gera renda inteira e contabilizada', () => {
    const sim = emptySim();
    const r0 = sim.players[0]!.resources;
    run(sim, TICK_RATE * 10);
    expect(sim.players[0]!.resources - r0).toBe(BUILDINGS.hq.income * 10);
    expect(sim.players[0]!.stats.resourcesGathered).toBe(BUILDINGS.hq.income * 10);
  });
});

describe('determinismo e IA', () => {
  function playout(seed: number) {
    const sim = new Simulation({ map: generateMap(seed), playerCount: 2 });
    const ais = [new TacticalAI(0), new TacticalAI(1)];
    for (let t = 0; t < TICK_RATE * 150; t++) {
      if (sim.tick % AI_THINK_TICKS === 0) for (const ai of ais) for (const c of ai.think(sim)) sim.applyCommand(ai.slot, c);
      sim.step();
    }
    return sim;
  }

  it('mesma seed e mesmas ações produzem o mesmo estado', () => {
    const a = playout(7);
    const b = playout(7);
    const digest = (s: Simulation) =>
      JSON.stringify([...s.entities.values()].map((e) => [e.id, e.type, e.owner, e.hp, e.pos.x.toFixed(4), e.pos.y.toFixed(4)]));
    expect(digest(a)).toBe(digest(b));
    expect(a.players.map((p) => p.resources)).toEqual(b.players.map((p) => p.resources));
  });

  it('a IA constrói, produz e movimenta tropas', () => {
    const sim = playout(11);
    const p1 = sim.players[1]!;
    expect(sim.buildings.some((b) => b.owner === 1 && b.type === 'barracks')).toBe(true);
    expect(p1.stats.unitsProduced).toBeGreaterThan(2);
    expect(p1.stats.resourcesSpent).toBeGreaterThan(0);
    const moved = sim.units.some((u: Unit) => u.owner === 1 && u.order.kind !== 'idle') || p1.stats.damageDealt > 0;
    expect(moved || sim.ended).toBe(true);
  });
});

describe('parseCommand', () => {
  it('aceita comandos válidos e remove ids duplicados', () => {
    expect(parseCommand({ type: 'move', unitIds: [1, 1, 2], x: 3, y: 4 })).toEqual({ type: 'move', unitIds: [1, 2], x: 3, y: 4 });
  });
  it('rejeita formas inválidas', () => {
    expect(parseCommand(null)).toBeNull();
    expect(parseCommand({ type: 'move', unitIds: [], x: 1, y: 1 })).toBeNull();
    expect(parseCommand({ type: 'move', unitIds: [1], x: Infinity, y: 1 })).toBeNull();
    expect(parseCommand({ type: 'build', buildingType: 'hq2', cx: 1, cy: 1 })).toBeNull();
    expect(parseCommand({ type: 'build', buildingType: 'barracks', cx: 1.5, cy: 1 })).toBeNull();
    expect(parseCommand({ type: 'produce', buildingId: 3, unitType: '__proto__' })).toBeNull();
    expect(parseCommand({ type: 'nuke' })).toBeNull();
    expect(parseCommand({ type: 'attack', unitIds: Array.from({ length: 100 }, (_, i) => i + 1), targetId: 1 })).toBeNull();
  });
});
