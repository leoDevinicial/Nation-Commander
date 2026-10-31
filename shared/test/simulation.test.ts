import { describe, expect, it } from 'vitest';
import { BUILDINGS, TICK_RATE, Terrain, UNITS } from '../sim/config.ts';
import { generateMatchMap } from '../sim/matchMap.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TacticalAI, AI_THINK_TICKS } from '../sim/TacticalAI.ts';
import { parseCommand } from '../sim/commands.ts';
import { TEST_START, flatMap } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

function emptySim(map = flatMap()) {
  return new Simulation({ map, playerCount: 2, startingUnits: [], allAtWar: true, startingResources: TEST_START });
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
    const before = { ...sim.players[0]!.resources };
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'barracks', cx: 8, cy: 3 })).toBeNull();
    expect(sim.players[0]!.resources.wood).toBe(before.wood - BUILDINGS.barracks.cost.wood!);
    expect(sim.players[0]!.resources.stone).toBe(before.stone - BUILDINGS.barracks.cost.stone!);
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
    expect(sim.placementError(0, 'oil_well', { cx: 5, cy: 9 })).toBe('Poços de petróleo precisam ser construídos sobre uma jazida');
    expect(sim.placementError(0, 'oil_well', { cx: 10, cy: 3 })).toBeNull();
    expect(sim.placementError(0, 'sawmill', { cx: 8, cy: 3 })).toMatch(/Poucos recursos/);
    sim.players[0]!.resources.wood = 10;
    expect(sim.placementError(0, 'barracks', { cx: 8, cy: 3 })).toBe('Recursos insuficientes');
  });

  it('produz unidade gastando recursos e respeita fila; cancelar reembolsa', () => {
    const sim = emptySim();
    sim.applyCommand(0, { type: 'build', buildingType: 'barracks', cx: 8, cy: 3 });
    run(sim, BUILDINGS.barracks.buildSeconds * TICK_RATE);
    const b = sim.buildings.find((x) => x.type === 'barracks')!;
    sim.players[0]!.recruits = 2; // tripulação já alistada
    const food0 = sim.players[0]!.resources.food;
    const foodCost = UNITS.infantry.cost.food!;
    expect(sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'tank' })).not.toBeNull();
    expect(sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'infantry' })).toBeNull();
    expect(sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'infantry' })).toBeNull();
    expect(sim.players[0]!.resources.food).toBe(food0 - 2 * foodCost);
    expect(sim.applyCommand(0, { type: 'cancel_production', buildingId: b.id })).toBeNull();
    expect(sim.players[0]!.resources.food).toBe(food0 - foodCost);
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
    const r0 = sim.players[0]!.resources.supplies;
    run(sim, TICK_RATE * 10);
    expect(sim.players[0]!.resources.supplies - r0).toBe(BUILDINGS.hq.income.supplies! * 10);
    expect(sim.players[0]!.stats.resourcesGathered).toBe(BUILDINGS.hq.income.supplies! * 10);
  });
});

describe('determinismo e IA', () => {
  function playout(seed: number) {
    // mapa das partidas (o começo é enxuto: a IA precisa de alguns minutos de economia)
    const sim = new Simulation({ map: generateMatchMap(seed, { nations: 2 }), playerCount: 2, allAtWar: true });
    const ais = [new TacticalAI(0), new TacticalAI(1)];
    const moveOrders = [0, 0];
    for (let t = 0; t < TICK_RATE * 360; t++) {
      if (sim.tick % AI_THINK_TICKS === 0)
        for (const ai of ais)
          for (const c of ai.think(sim)) {
            if ((c.type === 'move' || c.type === 'attack_move') && !sim.applyCommand(ai.slot, c)) moveOrders[ai.slot]!++;
            else sim.applyCommand(ai.slot, c);
          }
      sim.step();
    }
    return Object.assign(sim, { moveOrders });
  }

  it('mesma seed e mesmas ações produzem o mesmo estado', () => {
    const a = playout(7);
    const b = playout(7);
    const digest = (s: Simulation) =>
      JSON.stringify([...s.entities.values()].map((e) => [e.id, e.type, e.owner, e.hp, e.pos.x.toFixed(4), e.pos.y.toFixed(4)]));
    expect(digest(a)).toBe(digest(b));
    expect(a.players.map((p) => p.resources)).toEqual(b.players.map((p) => p.resources));
  }, 30_000);

  it('a IA constrói, produz e movimenta tropas', () => {
    const sim = playout(11);
    const p1 = sim.players[1]!;
    expect(sim.buildings.some((b) => b.owner === 1 && b.type === 'barracks')).toBe(true);
    // economia apertada (docs/RECALIBRAGEM_RECURSOS.md): em 6 min de guerra a IA já forma tropas, mas poucas
    expect(p1.stats.unitsProduced).toBeGreaterThanOrEqual(2);
    expect(p1.stats.resourcesSpent).toBeGreaterThan(0);
    // no período de preparo a IA não ataca, mas reúne as tropas (ordens de movimento aceitas)
    expect(sim.moveOrders[1]).toBeGreaterThan(0);
  }, 30_000);
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

describe('modificadores da camada nacional', () => {
  it('renda externa e tempos de produção/obra; dano e vida vêm do equipamento de cada unidade', () => {
    const sim = emptySim();
    sim.setModifiers(0, { externalIncome: 2.5, productionTimeMul: 0.5, constructionTimeMul: 0.5 });
    const r0 = sim.players[0]!.resources.supplies;
    run(sim, TICK_RATE * 10);
    expect(sim.players[0]!.resources.supplies - r0).toBe((BUILDINGS.hq.income.supplies! + 2.5) * 10);

    // pesquisa não melhora tropas sozinha: só o pacote instalado na unidade muda os números
    const tank = sim.addUnit('tank', 0, { x: 30, y: 30 }, 1, ['composite_armor', 'guided_munitions']);
    expect(tank.maxHp).toBe(Math.round(UNITS.tank.maxHp * 1.25));
    expect(sim.addUnit('tank', 1, { x: 60, y: 60 }).maxHp).toBe(UNITS.tank.maxHp);

    sim.applyCommand(0, { type: 'build', buildingType: 'barracks', cx: 8, cy: 3 });
    const b = sim.buildings.find((x) => x.type === 'barracks')!;
    run(sim, (BUILDINGS.barracks.buildSeconds * TICK_RATE) / 2);
    sim.players[0]!.recruits = 3;
    expect(b.progress).toBe(1);
    sim.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'infantry' });
    expect(b.queue[0]!.totalTicks).toBe(UNITS.infantry.buildSeconds * TICK_RATE * 0.5);

    const victim = sim.addUnit('tank', 1, { x: 30 + 4, y: 30 });
    victim.hp = 10_000;
    sim.applyCommand(0, { type: 'attack', unitIds: [tank.id], targetId: victim.id });
    run(sim, 3);
    const shot = sim.drainEvents().find((e) => e.type === 'shot' && e.attackerId === tank.id);
    expect(shot && shot.type === 'shot' ? shot.damage : 0).toBeCloseTo(UNITS.tank.weapon.damage * 1.15);
  });
});

describe('coleta de recursos', () => {
  // sem jazida de petróleo (a poça reservaria as células da fazenda vizinha)
  const resourceMap = () => ({
    ...flatMap(32, (set) => {
      for (let y = 10; y < 16; y++) for (let x = 0; x < 4; x++) set(x, y, Terrain.Forest); // 24 células de floresta (média)
      for (let y = 0; y < 2; y++) for (let x = 12; x < 16; x++) set(x, y, Terrain.Fertile); // 8 de solo fértil
    }),
    resourceNodes: [],
  });

  it('serraria reivindica as árvores próximas e rende por célula; a segunda não pode reutilizá-las', () => {
    const sim = emptySim(resourceMap());
    // gente para as duas serrarias trabalharem cheias
    sim.players[0]!.citizens = 2 * BUILDINGS.sawmill.workers;
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'sawmill', cx: 4, cy: 10 })).toBeNull();
    const a = sim.buildings.find((b) => b.type === 'sawmill')!;
    expect(a.claims.length).toBe(BUILDINGS.sawmill.gather!.maxCells);
    for (const i of a.claims) expect(sim.map.terrain[i]).toBe(Terrain.Forest);
    // floresta média (24 células): comporta uma segunda serraria, sem reutilizar árvores
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'sawmill', cx: 4, cy: 14 })).toBeNull();
    const b = sim.buildings.filter((x) => x.type === 'sawmill')[1]!;
    expect(b.claims.length).toBeGreaterThan(0);
    expect(b.claims.some((i) => a.claims.includes(i))).toBe(false);
    // a terceira esbarra no limite do depósito médio
    expect(sim.placementError(0, 'sawmill', { cx: 4, cy: 12 })).toMatch(/Depósito médio já tem 2/);

    const wood0 = sim.players[0]!.resources.wood;
    run(sim, BUILDINGS.sawmill.buildSeconds * TICK_RATE); // concluídas (e com trabalhadores)
    const before = sim.players[0]!.resources.wood;
    expect(before).toBe(wood0); // nada rende durante a obra
    expect(a.workers).toBe(BUILDINGS.sawmill.workers);
    run(sim, TICK_RATE * 10);
    const rate = (a.claims.length + b.claims.length) * BUILDINGS.sawmill.gather!.ratePerCell;
    const got = sim.players[0]!.resources.wood - before;
    expect(got).toBeGreaterThanOrEqual(Math.floor(rate * 10) - 2);
    expect(got).toBeLessThanOrEqual(Math.ceil(rate * 10));
  });

  it('destruir o edifício libera as células para outro', () => {
    const sim = emptySim(resourceMap());
    sim.applyCommand(0, { type: 'build', buildingType: 'farm', cx: 13, cy: 2 });
    const farm = sim.buildings.find((b) => b.type === 'farm')!;
    expect(farm.claims.length).toBe(8);
    expect(sim.placementError(0, 'farm', { cx: 11, cy: 2 })).toMatch(/Poucos recursos/);
    farm.hp = 0;
    sim.step();
    expect(sim.placementError(0, 'farm', { cx: 11, cy: 2 })).toBeNull();
  });

  it('poço de petróleo só opera com tanque próximo e enche o tanque', () => {
    const sim = emptySim();
    sim.applyCommand(0, { type: 'build', buildingType: 'oil_well', cx: 10, cy: 3 });
    run(sim, BUILDINGS.oil_well.buildSeconds * TICK_RATE + 1);
    const well = sim.buildings.find((b) => b.type === 'oil_well')!;
    expect(well.status).toBe('no_tank');
    expect(sim.incomePerSecond(0).oil).toBe(0);
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'oil_tank', cx: 10, cy: 6 })).toBeNull();
    run(sim, BUILDINGS.oil_tank.buildSeconds * TICK_RATE + 2);
    expect(well.status).toBe('ok');
    expect(sim.incomePerSecond(0).oil).toBe(BUILDINGS.oil_well.gather!.ratePerCell);
    const tank = sim.buildings.find((b) => b.type === 'oil_tank')!;
    run(sim, TICK_RATE * 10);
    expect(tank.stored).toBeGreaterThan(20);
    expect(sim.players[0]!.resources.oil).toBe(sim.players[0]!.oilReserve + tank.stored);
  });
});

describe('névoa de guerra', () => {
  it('só enxerga e ataca o que está no raio de visão', () => {
    const sim = emptySim();
    const a = sim.addUnit('infantry', 0, { x: 30, y: 30 });
    const far = sim.addUnit('infantry', 1, { x: 30 + UNITS.infantry.sight + 4, y: 30 });
    expect(sim.canSee(0, far)).toBe(false);
    expect(sim.applyCommand(0, { type: 'attack', unitIds: [a.id], targetId: far.id })).toBe('Alvo fora de visão');
    const near = sim.addUnit('infantry', 1, { x: 30 + UNITS.infantry.sight - 2, y: 30 });
    sim.step();
    expect(sim.canSee(0, near)).toBe(true);
  });

  it('snapshot filtrado esconde unidades e recursos do inimigo e lembra edifícios avistados', async () => {
    const { makeSnapshot, FogMemory } = await import('../sim/snapshot.ts');
    const sim = emptySim();
    const viewer = { slot: 0, memory: new FogMemory() };
    const enemyHq = sim.hqOf(1)!;
    const hidden = sim.addUnit('tank', 1, { x: enemyHq.pos.x, y: enemyHq.pos.y - 6 });
    let snap = makeSnapshot(sim, [], viewer);
    expect(snap.units.some((u) => u.id === hidden.id)).toBe(false);
    expect(snap.buildings.some((b) => b.id === enemyHq.id)).toBe(false);
    expect(snap.players[1]!.resources).toBeNull();
    expect(snap.players[0]!.resources).not.toBeNull();

    // um batedor avista o QG inimigo...
    const scout = sim.addUnit('apc', 0, { x: enemyHq.pos.x - 10, y: enemyHq.pos.y - 10 });
    sim.step();
    snap = makeSnapshot(sim, [], viewer);
    expect(snap.buildings.find((b) => b.id === enemyHq.id)?.remembered).toBeUndefined();
    // ...e ao sair, o QG continua lembrado
    scout.pos = { x: 4, y: 4 };
    sim.step();
    snap = makeSnapshot(sim, [], viewer);
    expect(snap.buildings.find((b) => b.id === enemyHq.id)?.remembered).toBe(true);
  });

  it('artilharia precisa de outra unidade para enxergar alvos além da própria visão', () => {
    const sim = emptySim();
    const art = sim.addUnit('artillery', 0, { x: 20, y: 30 });
    const target = sim.addUnit('infantry', 1, { x: 20 + UNITS.artillery.sight + 4, y: 30 });
    target.hp = 10_000;
    run(sim, TICK_RATE * 2);
    expect(target.hp).toBe(10_000);
    sim.addUnit('apc', 0, { x: target.pos.x - 8, y: 30 });
    run(sim, TICK_RATE * 6);
    expect(target.hp).toBeLessThan(10_000);
    expect(sim.drainEvents().some((e) => e.type === 'shot' && e.attackerId === art.id)).toBe(true);
  });
});

describe('jazida de petróleo', () => {
  it('a poça fica reservada para o Poço de Petróleo: outro edifício não é construído em cima dela', () => {
    const sim = emptySim();
    const node = sim.map.resourceNodes[0]!;
    expect(sim.placementError(0, 'house', { cx: node.cx, cy: node.cy })).toMatch(/Jazida de petróleo/);
    expect(sim.placementError(0, 'barracks', { cx: node.cx - 1, cy: node.cy + 1 })).toMatch(/Jazida de petróleo/);
    expect(sim.placementError(0, 'oil_well', { cx: node.cx, cy: node.cy })).toBeNull();
    // ao lado da poça continua livre
    expect(sim.placementError(0, 'house', { cx: node.cx + 2, cy: node.cy })).toBeNull();
  });
});
