import { describe, expect, it } from 'vitest';
import { BUILDINGS, CITIZEN, POP_ABSOLUTE_CAP, RECRUIT, STARTING_CITIZENS, STARTING_RECRUITS, TICK_RATE, Terrain, UNITS, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { findDeposits, sizeClass } from '../sim/deposits.ts';
import { Simulation } from '../sim/Simulation.ts';
import { makeSnapshot } from '../sim/snapshot.ts';
import { computeTerritory, decodeTerritory, encodeTerritory, NO_OWNER } from '../sim/territory.ts';
import type { Building, Cell } from '../sim/types.ts';
import { TEST_START, flatMap } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

function sim(map = flatMap(), opts: { atWar?: boolean } = {}) {
  return new Simulation({ map, playerCount: 2, startingUnits: [], allAtWar: opts.atWar ?? false, startingResources: TEST_START });
}

/** Constrói e conclui um edifício (via comando validado), avançando o tempo de obra. */
function build(s: Simulation, slot: number, type: BuildingType, cell: Cell): Building {
  const err = s.applyCommand(slot, { type: 'build', buildingType: type, cx: cell.cx, cy: cell.cy });
  expect(err).toBeNull();
  const b = s.buildings.filter((x) => x.type === type && x.owner === slot).at(-1)!;
  run(s, b.buildTicks + 1);
  return b;
}

/** Atalho de teste para cenários de capacidade (sem passar pela validação de colocação). */
function forceBuilding(s: Simulation, slot: number, type: BuildingType, cell: Cell): Building {
  return (s as unknown as { addBuilding: (t: BuildingType, o: number, c: Cell, p: number) => Building }).addBuilding(type, slot, cell, 1);
}

describe('população e moradia', () => {
  it('centro de comando abriga 20; casa +10; prédio residencial +20; teto absoluto de 200', () => {
    const s = sim();
    const pop = s.population(0);
    expect(pop.cap).toBe(20);
    expect(pop.citizens).toBe(STARTING_CITIZENS);
    build(s, 0, 'house', { cx: 8, cy: 8 });
    expect(s.population(0).cap).toBe(30);
    s.players[0]!.resources.stone = 300;
    build(s, 0, 'residential', { cx: 12, cy: 6 });
    expect(s.population(0).cap).toBe(50);
    for (let i = 0; i < 12; i++) forceBuilding(s, 0, 'residential', { cx: (i % 6) * 2, cy: 18 + Math.floor(i / 6) * 2 });
    expect(s.population(0).housing).toBeGreaterThan(POP_ABSOLUTE_CAP);
    expect(s.population(0).cap).toBe(POP_ABSOLUTE_CAP);
  });

  it('formar cidadão custa comida e tempo e exige vaga; sem vaga é recusado com explicação', () => {
    const s = sim();
    const hq = s.hqOf(0)!;
    const food = s.players[0]!.resources.food;
    expect(s.applyCommand(0, { type: 'produce', buildingId: hq.id, unitType: 'citizen' })).toBeNull();
    expect(s.players[0]!.resources.food).toBe(food - CITIZEN.cost.food!);
    run(s, CITIZEN.buildSeconds * TICK_RATE + 1);
    expect(s.population(0).citizens).toBe(STARTING_CITIZENS + 1);
    s.players[0]!.citizens = 20;
    expect(s.applyCommand(0, { type: 'produce', buildingId: hq.id, unitType: 'citizen' })).toMatch(/Sem moradia/);
    // perder habitação não apaga ninguém: só bloqueia novas formações
    expect(s.population(0).citizens).toBe(20);
  });

  it('recrutas: alistados só no quartel, tripulam as unidades; cidadãos civis só no QG', () => {
    const s = sim();
    const barracks = build(s, 0, 'barracks', { cx: 8, cy: 3 });
    const hq = s.hqOf(0)!;
    // civis no QG, recrutas no quartel — e não o contrário
    expect(s.applyCommand(0, { type: 'produce', buildingId: barracks.id, unitType: 'citizen' })).toMatch(/Centro de Comando/);
    expect(s.applyCommand(0, { type: 'produce', buildingId: hq.id, unitType: 'recruit' })).toMatch(/base militar/);
    // sem recrutas na reserva, nenhuma unidade militar
    expect(s.players[0]!.recruits).toBe(STARTING_RECRUITS);
    expect(s.applyCommand(0, { type: 'produce', buildingId: barracks.id, unitType: 'infantry' })).toMatch(/Nenhum recruta disponível/);
    // alistar ocupa moradia e custa recursos; ao concluir, entra na reserva
    const before = s.population(0);
    const food0 = s.players[0]!.resources.food;
    expect(s.applyCommand(0, { type: 'produce', buildingId: barracks.id, unitType: 'recruit' })).toBeNull();
    expect(s.players[0]!.resources.food).toBe(food0 - RECRUIT.cost.food!);
    expect(s.population(0).queuedRecruits).toBe(1);
    expect(s.population(0).total).toBe(before.total + 1);
    for (let i = 0; i < RECRUIT.buildSeconds * TICK_RATE + 5; i++) s.step();
    expect(s.population(0).recruits).toBe(1);
    expect(s.drainEvents().some((e) => e.type === 'recruit_trained')).toBe(true);
    // a unidade consome o recruta, não um cidadão civil
    const civ = s.players[0]!.citizens;
    expect(s.applyCommand(0, { type: 'produce', buildingId: barracks.id, unitType: 'infantry' })).toBeNull();
    expect(s.players[0]!.recruits).toBe(0);
    expect(s.players[0]!.citizens).toBe(civ);
    expect(s.population(0).queuedMilitary).toBe(1);
    // cancelar devolve o recruta à reserva
    expect(s.applyCommand(0, { type: 'cancel_production', buildingId: barracks.id })).toBeNull();
    expect(s.players[0]!.recruits).toBe(1);
  });
});

describe('trabalhadores', () => {
  it('produção proporcional aos trabalhadores; sem nenhum, para e registra o motivo', () => {
    const map = flatMap(32, (set) => {
      for (let y = 0; y < 2; y++) for (let x = 12; x < 16; x++) set(x, y, Terrain.Fertile);
    });
    const s = sim(map);
    const farm = build(s, 0, 'farm', { cx: 13, cy: 2 });
    // até 6 trabalhadores por coleta (docs/RECALIBRAGEM_RECURSOS.md §2.3): a produção cresce com cada um
    expect(farm.workers).toBe(BUILDINGS.farm.workers);
    const full = s.buildingRate(farm);
    expect(s.applyCommand(0, { type: 'set_workers', buildingId: farm.id, count: 1 })).toBeNull();
    expect(farm.workers).toBe(1);
    expect(s.buildingRate(farm)).toBeCloseTo(full / BUILDINGS.farm.workers);
    expect(s.population(0).idle).toBeGreaterThan(0);
    s.applyCommand(0, { type: 'set_workers', buildingId: farm.id, count: 0 });
    s.drainEvents();
    run(s, 2);
    expect(farm.status).toBe('no_workers');
    expect(s.drainEvents().some((e) => e.type === 'production_halted' && e.reason === 'no_workers')).toBe(true);
    expect(s.applyCommand(0, { type: 'set_workers', buildingId: s.hqOf(0)!.id, count: 2 })).toMatch(/não emprega/);
  });
});

describe('cidadãos escolhidos pelo jogador', () => {
  it('assign_workers: ocioso entra no posto; realocação tira de outro edifício sem que ele puxe substituto', () => {
    const map = flatMap(32, (set) => {
      for (let y = 0; y < 2; y++) for (let x = 12; x < 16; x++) set(x, y, Terrain.Fertile);
    });
    const s = sim(map);
    const W = BUILDINGS.farm.workers;
    s.players[0]!.citizens = 2 * W + 4;
    const a = build(s, 0, 'farm', { cx: 13, cy: 2 });
    const b = forceBuilding(s, 0, 'farm', { cx: 20, cy: 2 });
    s.staff(0);
    expect(a.workers).toBe(W);
    expect(s.applyCommand(0, { type: 'set_workers', buildingId: b.id, count: 0 })).toBeNull();
    const idle = s.population(0).idle;
    expect(idle).toBeGreaterThan(0);
    // cidadão ocioso enviado pelo jogador: entra e o alvo do posto acompanha
    expect(s.applyCommand(0, { type: 'assign_workers', buildingId: b.id, sources: [0] })).toBeNull();
    expect(b.workers).toBe(1);
    expect(b.workerTarget).toBe(1);
    expect(s.population(0).idle).toBe(idle - 1);
    // realocação de um trabalhador da fazenda A
    expect(s.applyCommand(0, { type: 'assign_workers', buildingId: b.id, sources: [a.id] })).toBeNull();
    expect(b.workers).toBe(2);
    expect(a.workers).toBe(W - 1);
    run(s, TICK_RATE * 3);
    expect(a.workers).toBe(W - 1); // não puxou outro ocioso no lugar
    expect(s.population(0).idle).toBe(idle - 1);
    // sem vagas, edifício sem trabalho e fonte inválida
    expect(s.applyCommand(0, { type: 'assign_workers', buildingId: b.id, sources: Array(W).fill(0) })).toBeNull();
    expect(b.workers).toBe(W);
    expect(s.applyCommand(0, { type: 'assign_workers', buildingId: b.id, sources: [0] })).toMatch(/Sem vagas/);
    expect(s.applyCommand(0, { type: 'assign_workers', buildingId: s.hqOf(0)!.id, sources: [0] })).toMatch(/não emprega/);
    expect(s.applyCommand(1, { type: 'assign_workers', buildingId: a.id, sources: [0] })).toMatch(/inválido/);
  });

  it('parseCommand valida assign_workers', () => {
    expect(parseCommand({ type: 'assign_workers', buildingId: 5, sources: [0, 7] })).toEqual({ type: 'assign_workers', buildingId: 5, sources: [0, 7] });
    expect(parseCommand({ type: 'assign_workers', buildingId: 5, sources: [] })).toBeNull();
    expect(parseCommand({ type: 'assign_workers', buildingId: 5, sources: [-1] })).toBeNull();
    expect(parseCommand({ type: 'assign_workers', buildingId: 0, sources: [0] })).toBeNull();
  });
});

describe('armazenamento físico', () => {
  it('um único armazém inicial; estoque limitado pela capacidade; serraria pausa com armazém cheio', () => {
    const map = flatMap(32, (set) => {
      for (let y = 10; y < 16; y++) for (let x = 0; x < 4; x++) set(x, y, Terrain.Forest);
    });
    const s = sim(map);
    expect(s.buildings.filter((b) => b.owner === 0 && b.type === 'warehouse')).toHaveLength(1);
    const cap = s.capacity(0);
    expect(cap.wood).toBe((BUILDINGS.hq.storage.wood ?? 0) + (BUILDINGS.warehouse.storage.wood ?? 0));
    const saw = build(s, 0, 'sawmill', { cx: 4, cy: 10 });
    s.players[0]!.resources.wood = cap.wood - 1;
    run(s, TICK_RATE * 5);
    expect(s.players[0]!.resources.wood).toBe(cap.wood);
    expect(saw.status).toBe('storage_full');
  });

  it('destruir o armazém perde só o excedente acima da capacidade restante, com registro', () => {
    const s = sim();
    const cap = s.capacity(0);
    s.players[0]!.resources.stone = cap.stone;
    const wh = s.buildings.find((b) => b.owner === 0 && b.type === 'warehouse')!;
    wh.hp = 0;
    s.drainEvents();
    s.step();
    expect(s.players[0]!.resources.stone).toBe(BUILDINGS.hq.storage.stone);
    const lost = s.drainEvents().find((e) => e.type === 'storage_lost' && e.resource === 'stone');
    expect(lost && lost.type === 'storage_lost' && lost.amount).toBe(cap.stone - BUILDINGS.hq.storage.stone!);
  });

  it('tanque cheio pausa o poço; tanque destruído perde exatamente o petróleo guardado nele', () => {
    const s = sim();
    build(s, 0, 'oil_well', { cx: 10, cy: 3 });
    const tank = build(s, 0, 'oil_tank', { cx: 10, cy: 6 });
    const well = s.buildings.find((b) => b.type === 'oil_well')!;
    tank.stored = BUILDINGS.oil_tank.storage.oil! - 1;
    s.players[0]!.resources.oil = s.players[0]!.oilReserve + tank.stored;
    run(s, TICK_RATE * 2);
    expect(tank.stored).toBe(BUILDINGS.oil_tank.storage.oil);
    expect(well.status).toBe('storage_full');
    const reserve = s.players[0]!.oilReserve;
    tank.hp = 0;
    s.drainEvents();
    s.step();
    expect(s.players[0]!.resources.oil).toBe(reserve);
    const lost = s.drainEvents().find((e) => e.type === 'storage_lost' && e.resource === 'oil');
    expect(lost && lost.type === 'storage_lost' && lost.amount).toBe(BUILDINGS.oil_tank.storage.oil);
  });
});

describe('depósitos e geologia', () => {
  it('classe do depósito pelo tamanho: floresta pequena 1, média 2, grande 3 serrarias', () => {
    expect(sizeClass(Terrain.Forest, 10)).toBe('small');
    expect(sizeClass(Terrain.Forest, 30)).toBe('medium');
    expect(sizeClass(Terrain.Forest, 60)).toBe('large');
    const map = flatMap(32, (set) => {
      for (let y = 10; y < 13; y++) for (let x = 0; x < 4; x++) set(x, y, Terrain.Forest); // 12: pequena
    });
    const d = findDeposits(map);
    const forest = d.deposits.find((x) => x.terrain === Terrain.Forest)!;
    expect(forest.maxSites).toBe(1);
    const s = sim(map);
    build(s, 0, 'sawmill', { cx: 4, cy: 10 });
    expect(s.placementError(0, 'sawmill', { cx: 4, cy: 12 })).toMatch(/Depósito pequeno já tem 1 instalação/);
  });

  it('montanha com minério: mina exige veio; depósito esgotado para de produzir', () => {
    const map = flatMap(32, (set) => {
      for (let y = 9; y < 12; y++) for (let x = 9; x < 12; x++) set(x, y, Terrain.Rock);
      set(10, 10, Terrain.Ore);
      set(10, 9, Terrain.Ore);
    });
    const s = sim(map);
    expect(s.placementError(0, 'mine', { cx: 2, cy: 12 })).toMatch(/Poucos recursos/);
    const mine = build(s, 0, 'mine', { cx: 12, cy: 9 });
    const deposit = s.deposits.deposits[mine.depositId!]!;
    expect(deposit.terrain).toBe(Terrain.Ore);
    deposit.remaining = 2;
    s.drainEvents();
    run(s, TICK_RATE * 10);
    expect(deposit.remaining).toBe(0);
    expect(mine.status).toBe('depleted');
    expect(s.drainEvents().some((e) => e.type === 'deposit_depleted')).toBe(true);
    const iron = s.players[0]!.resources.iron;
    run(s, TICK_RATE * 5);
    expect(s.players[0]!.resources.iron).toBe(iron);
  });
});

describe('território e fronteiras', () => {
  it('influência: cada célula pertence a quem tem mais influência; empate fica neutro', () => {
    const t = computeTerritory(10, 1, [
      { owner: 0, x: 2, y: 0.5, radius: 4, weight: 1 },
      { owner: 1, x: 8, y: 0.5, radius: 4, weight: 1 },
    ]);
    expect(t[0]).toBe(0);
    expect(t[9]).toBe(1);
    expect(t[4]).toBe(0);
    expect(t[5]).toBe(1);
    expect(decodeTerritory(encodeTerritory(t))).toEqual(t);
  });

  it('só se constrói no próprio território; nunca no de outra nação', () => {
    const s = sim();
    expect(s.territoryOwner(3, 3)).toBe(0);
    expect(s.territoryOwner(28, 28)).toBe(1);
    expect(s.territoryOwner(16, 16)).toBe(NO_OWNER);
    expect(s.placementError(0, 'house', { cx: 16, cy: 16 })).toMatch(/Fora do seu território/);
    expect(s.placementError(0, 'house', { cx: 27, cy: 25 })).toMatch(/Território de outra nação/);
  });

  it('fronteira dinâmica: torre concluída expande o território; destruída, ele recua', () => {
    const s = sim();
    const v0 = s.territoryVersion;
    expect(s.territoryOwner(17, 3)).toBe(NO_OWNER);
    const tower = build(s, 0, 'tower', { cx: 12, cy: 3 });
    run(s, 1);
    expect(s.territoryVersion).toBeGreaterThan(v0);
    expect(s.territoryOwner(17, 3)).toBe(0);
    tower.hp = 0;
    run(s, 2);
    expect(s.territoryOwner(17, 3)).toBe(NO_OWNER);
  });

  it('sem guerra nem aliança não se entra no território alheio; com guerra ou aliança, sim', () => {
    const s = sim();
    const u = s.addUnit('infantry', 0, { x: 30, y: 30 });
    expect(s.applyCommand(0, { type: 'move', unitIds: [u.id], x: 56, y: 56 })).toMatch(/Território de outra nação/);
    s.setAlliance(0, 1, true);
    expect(s.applyCommand(0, { type: 'move', unitIds: [u.id], x: 56, y: 56 })).toBeNull();
    s.setAlliance(0, 1, false);
    s.setWar(0, 1, true);
    expect(s.applyCommand(0, { type: 'move', unitIds: [u.id], x: 56, y: 56 })).toBeNull();
  });

  it('o caminho contorna o território proibido e nunca o atravessa', () => {
    const s = sim();
    const u = s.addUnit('infantry', 0, { x: 40, y: 18 });
    // destino neutro do outro lado da área do rival (canto inferior esquerdo)
    expect(s.applyCommand(0, { type: 'move', unitIds: [u.id], x: 20, y: 60 })).toBeNull();
    for (let i = 0; i < TICK_RATE * 40; i++) {
      s.step();
      const c = s.grid.worldToCell(u.pos);
      expect(s.canEnter(0, c.cx, c.cy)).toBe(true);
    }
  });

  it('unidade surpreendida pelo avanço da fronteira alheia sai sozinha', () => {
    const s = sim();
    const u = s.addUnit('infantry', 0, { x: 40, y: 40 }); // neutro por enquanto
    forceBuilding(s, 1, 'tower', { cx: 20, cy: 20 });
    run(s, TICK_RATE * 15);
    const c = s.grid.worldToCell(u.pos);
    expect(s.territoryOwner(c.cx, c.cy)).not.toBe(1);
  });

  it('atrito em território inimigo durante a guerra; blindado de transporte mantém o suprimento', () => {
    const s = sim(flatMap(), { atWar: true });
    const a = s.addUnit('infantry', 0, { x: 50, y: 62 });
    const b = s.addUnit('infantry', 0, { x: 62, y: 50 });
    s.addUnit('apc', 0, { x: 63, y: 52 });
    // longe das armas do QG rival, mas dentro do território dele
    run(s, TICK_RATE * 5);
    expect(a.attrition).toBe(true);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.attrition).toBe(false);
    expect(b.hp).toBe(b.maxHp);
  });

  it('snapshot envia o território quando pedido (fronteiras visíveis a todos)', () => {
    const s = sim();
    const snap = makeSnapshot(s, [], undefined, true);
    expect(decodeTerritory(snap.territory!)[3 * 32 + 3]).toBe(0);
    expect(makeSnapshot(s, [], undefined, false).territory).toBeUndefined();
  });
});

describe('custos com ferro', () => {
  it('veículos exigem ferro', () => {
    expect(UNITS.tank.cost.iron).toBeGreaterThan(0);
  });
});
