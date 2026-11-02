import { describe, expect, it } from 'vitest';
import { TICK_RATE, Terrain, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import { LOT_OCCUPANT, ZONING } from '../sim/zoning.ts';
import { treasuryDay } from '../strategic/treasury.ts';
import type { Building, Cell } from '../sim/types.ts';
import { TEST_START, flatMap } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

/** Mapa plano; o jogador 0 ganha uma estrada reta ao lado do QG. */
function setup(opts: { approval?: number; growth?: number; authoritarian?: number } = {}) {
  const s = new Simulation({ map: flatMap(40), playerCount: 2, startingUnits: [], startingResources: { ...TEST_START } });
  s.national = {
    techs: () => [],
    infrastructureIndex: () => 1,
    stability: () => 50,
    worksFundUsd: () => 1e12,
    chargeWorks: () => true,
    refundWorks: () => undefined,
    approval: () => opts.approval ?? 65,
    growth: () => opts.growth ?? 3,
    authoritarian: () => opts.authoritarian ?? 0,
  };
  const hq = s.hqOf(0)!;
  const W = s.map.width;
  const y = hq.cell.cy + 4;
  const road: number[] = [];
  for (let x = hq.cell.cx - 2; x < hq.cell.cx + 8; x++) {
    const i = y * W + x;
    s.map.terrain[i] = Terrain.Road;
    s.roads.push({ i, owner: 0 });
    road.push(i);
  }
  // células livres logo abaixo da estrada
  const below = road.map((i) => i + W).filter((i) => s.grid.occupant(i % W, Math.floor(i / W)) === 0);
  return { s, W, road, below };
}

function force(s: Simulation, type: BuildingType, cell: Cell): Building {
  return (s as unknown as { addBuilding: (t: BuildingType, o: number, c: Cell, p: number) => Building }).addBuilding(type, 0, cell, 1);
}

describe('zoneamento', () => {
  it('pinta só junto às estradas do jogador, no território, em célula livre', () => {
    const { s, W, below } = setup();
    expect(s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'res' })).toBeNull();
    expect(s.zones.zones.size).toBe(below.length);
    // longe da estrada
    const far = (s.hqOf(0)!.cell.cy + 12) * W + 2;
    expect(s.applyCommand(0, { type: 'zone_paint', cells: [far], kind: 'ind' })).toMatch(/estrada|território/);
    // o rival não pinta no território alheio
    expect(s.applyCommand(1, { type: 'zone_paint', cells: below, kind: 'com' })).toMatch(/território|estrada/);
    // apagar
    expect(s.applyCommand(0, { type: 'zone_paint', cells: [below[0]!], kind: null })).toBeNull();
    expect(s.zones.zones.has(below[0]!)).toBe(false);
    expect(parseCommand({ type: 'zone_paint', cells: [1, 2], kind: 'xyz' })).toBeNull();
    expect(parseCommand({ type: 'zone_tax', kind: 'ind', pct: ZONING.taxMax + 1 })).toBeNull();
  });

  /** Cidade desenvolvida: delegacia, escola e hospital, era 4 e economia boa (a atratividade sobe). */
  function develop(s: Simulation) {
    const hq = s.hqOf(0)!;
    force(s, 'police_station', { cx: hq.cell.cx - 4, cy: hq.cell.cy });
    force(s, 'hospital', { cx: hq.cell.cx - 4, cy: hq.cell.cy - 3 });
    force(s, 'school', { cx: hq.cell.cx + 4, cy: hq.cell.cy - 3 });
    s.players[0]!.era = 4;
  }

  it('cidade sem atrativos quase não cresce; desenvolvida, os lotes aparecem aos poucos e ocupam a célula', () => {
    const bare = setup();
    bare.s.eras = true; // começo da partida (era 1): sem a força da era
    bare.s.applyCommand(0, { type: 'zone_paint', cells: bare.below, kind: 'ind' });
    run(bare.s, ZONING.everyTicks * 40);
    expect(bare.s.zones.lots.size).toBe(0);
    expect(bare.s.zones.cityStats(0)[0]!.demand.ind).toBeLessThanOrEqual(0.1);

    const { s, W, below } = setup({ approval: 90, growth: 6 });
    develop(s);
    s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'ind' });
    expect(s.zones.lots.size).toBe(0);
    run(s, ZONING.everyTicks * 120);
    const city = s.zones.cityStats(0)[0]!;
    expect(city.development).toBeGreaterThan(0.5);
    const lots = [...s.zones.lots].filter(([, l]) => l.owner === 0);
    expect(lots.length).toBeGreaterThan(0);
    expect(lots.length).toBeLessThan(below.length + 1);
    for (const [i, l] of lots) {
      expect(l.kind).toBe('ind');
      expect(s.grid.occupant(i % W, Math.floor(i / W))).toBe(LOT_OCCUPANT);
      expect(s.placementError(0, 'house', { cx: i % W, cy: Math.floor(i / W) })).toMatch(/Lote privado|ocupado/);
    }
  });

  it('todo lote encosta na rua; com duas fileiras zoneadas, vira lote fundo (frente e trás, mesma construção)', () => {
    const { s, W, road, below } = setup({ approval: 90, growth: 6 });
    develop(s);
    const roads = new Set(road);
    const second = below.map((i) => i + W).filter((i) => s.grid.occupant(i % W, Math.floor(i / W)) === 0);
    s.applyCommand(0, { type: 'zone_tax', kind: 'com', pct: 0 });
    s.applyCommand(0, { type: 'zone_paint', cells: [...below, ...second], kind: 'com' });
    run(s, ZONING.everyTicks * 150);
    const lots = [...s.zones.lots];
    expect(lots.length).toBeGreaterThan(0);
    for (const [i, l] of lots) {
      // a frente encosta numa estrada (norte, já que a rua fica acima)
      expect([i - W, i + W, i - 1, i + 1].some((j) => roads.has(j))).toBe(true);
      if (l.back !== undefined) {
        expect(l.back).toBe(i + W);
        expect(s.grid.occupant(l.back % W, Math.floor(l.back / W))).toBe(LOT_OCCUPANT);
      }
    }
    expect(lots.some(([, l]) => l.back !== undefined)).toBe(true);
    // nenhum lote só na fileira de trás
    for (const i of second) if (s.zones.cover.has(i)) expect(s.zones.cover.get(i)).toBe(i - W);
    // demolir pela célula de trás derruba o lote inteiro
    const deep = lots.find(([, l]) => l.back !== undefined)!;
    expect(s.applyCommand(0, { type: 'zone_demolish', cells: [deep[1].back!] })).toBeNull();
    expect(s.zones.cover.has(deep[0])).toBe(false);
    expect(s.zones.cover.has(deep[1].back!)).toBe(false);
  });

  it('casa privada traz 1 cidadão e 1 vaga; prédio, 5; demolir leva embora', () => {
    const { s, W, below } = setup({ approval: 90, growth: 6 });
    develop(s);
    // imposto residencial zerado: mais procura por moradia
    s.applyCommand(0, { type: 'zone_tax', kind: 'res', pct: 0 });
    s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'res' });
    const before = s.players[0]!.citizens;
    const cap = s.population(0).cap;
    run(s, ZONING.everyTicks * 150);
    const res = [...s.zones.lots].filter(([, l]) => l.owner === 0 && l.kind === 'res' && !l.abandoned);
    expect(res.length).toBeGreaterThan(0);
    const people = res.reduce((a, [, l]) => a + ZONING.citizens[l.level - 1]!, 0);
    expect(s.players[0]!.citizens).toBe(before + people);
    expect(s.population(0).cap).toBe(cap + people);
    const [i, l] = res[0]!;
    s.applyCommand(0, { type: 'zone_demolish', cells: [i] });
    expect(s.players[0]!.citizens).toBe(before + people - ZONING.citizens[l.level - 1]!);
    expect(W).toBeGreaterThan(0);
  });

  it('imposto alto e governo autoritário afastam a indústria; imposto baixo atrai', () => {
    const grow = (tax: number, authoritarian = 0) => {
      const { s, below } = setup({ authoritarian, approval: 90, growth: 6 });
      develop(s);
      s.applyCommand(0, { type: 'zone_tax', kind: 'ind', pct: tax });
      s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'ind' });
      run(s, ZONING.everyTicks * 80);
      return { lots: s.zones.lots.size, demand: s.zones.cityStats(0)[0]!.demand.ind };
    };
    const low = grow(0);
    const high = grow(30, 1);
    expect(low.demand).toBeGreaterThan(high.demand);
    expect(high.demand).toBeLessThan(0);
    expect(high.lots).toBe(0);
    expect(low.lots).toBeGreaterThan(0);
  });

  it('com imposto alto e ataques, lotes são abandonados; abandonado não paga nem gasta luz e precisa ser demolido', () => {
    const { s, W, below } = setup();
    s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'com' });
    // força alguns lotes já existentes
    for (const i of below.slice(0, 5)) {
      (s.zones as unknown as { placeLot: (i: number, l: object) => void }).placeLot(i, { owner: 0, kind: 'com', variant: 0, level: 1, abandoned: false, since: 0 });
      s.grid.setOccupied({ cx: i % W, cy: Math.floor(i / W) }, 1, LOT_OCCUPANT);
    }
    s.applyCommand(0, { type: 'zone_tax', kind: 'com', pct: 30 });
    for (let k = 0; k < 20; k++) s.zones.noteAttack(0);
    run(s, ZONING.everyTicks * 40);
    const abandoned = [...s.zones.lots].filter(([, l]) => l.abandoned);
    expect(abandoned.length).toBeGreaterThan(0);
    expect(s.zones.taxBase(0).com).toBeLessThan(5);
    expect(s.zones.powerNodes(0).length).toBe(s.zones.taxBase(0).com);
    const [i] = abandoned[0]!;
    // a zona não aceita outro setor enquanto há lote; demolir libera a célula
    expect(s.applyCommand(0, { type: 'zone_paint', cells: [i], kind: 'res' })).toMatch(/lote/);
    expect(s.applyCommand(1, { type: 'zone_demolish', cells: [i] })).toMatch(/Nenhum lote seu/);
    expect(s.applyCommand(0, { type: 'zone_demolish', cells: [i] })).toBeNull();
    expect(s.zones.lots.has(i)).toBe(false);
    expect(s.grid.occupant(i % W, Math.floor(i / W))).toBe(0);
  });

  it('cada cidade tem a sua demanda: emprego atrai moradia; serviços entram na conta', () => {
    const { s, below } = setup();
    s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'res' });
    run(s, ZONING.everyTicks);
    const before = s.zones.cityStats(0)[0]!;
    expect(before.name).toBeTruthy();
    const hq = s.hqOf(0)!;
    force(s, 'police_station', { cx: hq.cell.cx - 4, cy: hq.cell.cy });
    force(s, 'hospital', { cx: hq.cell.cx - 4, cy: hq.cell.cy - 3 });
    run(s, ZONING.everyTicks);
    const after = s.zones.cityStats(0)[0]!;
    expect(after.services.police && after.services.hospital).toBe(true);
    expect(after.demand.res).toBeGreaterThan(before.demand.res - 0.05);
  });

  it('o snapshot manda as zonas só ao dono e os lotes só a quem enxerga', () => {
    const { s, W, below } = setup();
    s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'res' });
    const i = below[2]!;
    (s.zones as unknown as { placeLot: (i: number, l: object) => void }).placeLot(i, { owner: 0, kind: 'res', variant: 1, level: 1, abandoned: false, since: 0 });
    s.grid.setOccupied({ cx: i % W, cy: Math.floor(i / W) }, 1, LOT_OCCUPANT);
    run(s, 2);
    const mine = makeSnapshot(s, [], { slot: 0, memory: new FogMemory() }).zoning!;
    expect(mine.zones.length).toBe(below.length * 2);
    expect(mine.lots.length).toBe(9);
    const theirs = makeSnapshot(s, [], { slot: 1, memory: new FogMemory() }).zoning!;
    expect(theirs.zones.length).toBe(0);
    expect(theirs.lots.length).toBe(0); // o rival não enxerga a base do jogador 0
  });

  it('o caixa do país recebe o imposto de cada setor conforme a alíquota', () => {
    const base = { production: {}, infantry: 0, vehicles: 0, aircraft: 0, energy: 0, buildingCells: 0, roads: 0, services: 0 };
    const ctx = { transferUsd: 0, scale: 1, productivity: 0, exportsUsd: 0, tradeGrowthPct: 0 };
    const d10 = treasuryDay({ ...base, zoning: { base: { res: 10, com: 4, ind: 2 }, tax: { res: 10, com: 10, ind: 10 } } }, ctx);
    const d20 = treasuryDay({ ...base, zoning: { base: { res: 10, com: 4, ind: 2 }, tax: { res: 20, com: 20, ind: 20 } } }, ctx);
    expect(d10.income.filter((l) => l.key.startsWith('tax_'))).toHaveLength(3);
    expect(d20.net).toBe(d10.net * 2);
  });

  it('lotes entram na rede elétrica (0,5 cada) e ficam no salvamento', () => {
    const { s, W, below } = setup();
    s.applyCommand(0, { type: 'zone_paint', cells: below, kind: 'res' });
    for (const i of below.slice(0, 4)) {
      (s.zones as unknown as { placeLot: (i: number, l: object) => void }).placeLot(i, { owner: 0, kind: 'res', variant: 0, level: 1, abandoned: false, since: 0 });
      s.grid.setOccupied({ cx: i % W, cy: Math.floor(i / W) }, 1, LOT_OCCUPANT);
    }
    expect(s.zones.powerNodes(0).reduce((a, n) => a + n.use, 0)).toBeCloseTo(4 * ZONING.lotPower);
    const copy = Simulation.fromSave(JSON.parse(JSON.stringify(s.toSave())));
    expect(copy.zones.lots.size).toBe(s.zones.lots.size);
    expect(copy.zones.zones.size).toBe(s.zones.zones.size);
    const i = below[0]!;
    expect(copy.grid.occupant(i % W, Math.floor(i / W))).toBe(LOT_OCCUPANT);
    expect(TICK_RATE).toBeGreaterThan(0);
  });
});
