import { describe, expect, it } from 'vitest';
import { TICK_RATE, Terrain, type BuildingType } from '../sim/config.ts';
import { POWER, POWER_GEN, solvePower, type PowerNode } from '../sim/power.ts';
import { Simulation } from '../sim/Simulation.ts';
import type { Building, Cell } from '../sim/types.ts';
import { TEST_START, flatMap } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

function sim() {
  return new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [], startingResources: { ...TEST_START, coal: 200 }, power: true });
}

function force(s: Simulation, slot: number, type: BuildingType, cell: Cell): Building {
  return (s as unknown as { addBuilding: (t: BuildingType, o: number, c: Cell, p: number) => Building }).addBuilding(type, slot, cell, 1);
}

function road(s: Simulation, slot: number, cells: Cell[]) {
  for (const c of cells) {
    const i = c.cy * s.map.width + c.cx;
    s.map.terrain[i] = Terrain.Road;
    s.roads.push({ i, owner: slot });
  }
}

describe('rede elétrica', () => {
  it('cada nação começa com uma termelétrica ligada ao QG por 3 a 4 células de estrada', () => {
    const s = sim();
    for (const slot of [0, 1]) {
      expect(s.buildings.filter((b) => b.owner === slot && b.type === 'coal_plant')).toHaveLength(1);
      const n = s.roads.filter((r) => r.owner === slot).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
    expect(s.players[0]!.resources.coal).toBeGreaterThan(0);
  });

  it('quartel perto da malha tem luz; longe dela para por completo até ganhar estrada', () => {
    const s = sim();
    const near = force(s, 0, 'barracks', { cx: 6, cy: 6 });
    const far = force(s, 0, 'barracks', { cx: 18, cy: 4 });
    run(s, POWER.everyTicks + 1);
    expect(s.isPowered(near)).toBe(true);
    expect(s.isPowered(far)).toBe(false);
    expect(s.powerInfo[0]!.isolated).toBe(1);
    // estrada do QG até perto do quartel distante: a fiação alcança
    road(
      s,
      0,
      Array.from({ length: 11 }, (_, k) => ({ cx: 5 + k, cy: 3 })),
    );
    run(s, POWER.everyTicks);
    expect(s.isPowered(far)).toBe(true);
  });

  it('sem carvão a termelétrica apaga e a produção para; o carvão queima conforme a carga', () => {
    const s = sim();
    const b = force(s, 0, 'factory', { cx: 6, cy: 6 });
    run(s, POWER.everyTicks + 1);
    expect(s.isPowered(b)).toBe(true);
    const before = s.players[0]!.resources.coal;
    run(s, TICK_RATE * 20);
    expect(s.players[0]!.resources.coal).toBeLessThan(before);
    s.players[0]!.resources.coal = 0;
    run(s, POWER.everyTicks);
    expect(s.isPowered(b)).toBe(false);
    expect(s.powerInfo[0]!.supply).toBe(0);
  });

  it('falta de geração: as construções mais novas apagam primeiro e o jogador é avisado', () => {
    const s = sim();
    const cap = POWER_GEN.coal_plant!.gen;
    const built: Building[] = [];
    // cada fábrica usa 6: a quinta passa da geração de uma termelétrica (30)
    for (let k = 0; k < 6; k++) built.push(force(s, 0, 'factory', { cx: 5 + (k % 2) * 2, cy: 5 + Math.floor(k / 2) * 2 }));
    run(s, TICK_RATE * 6);
    const lit = built.filter((b) => s.isPowered(b));
    expect(lit.length).toBe(Math.floor(cap / 6));
    expect(s.isPowered(built[0]!)).toBe(true);
    expect(s.isPowered(built.at(-1)!)).toBe(false);
  });

  it('destruir a usina derruba a luz', () => {
    const s = sim();
    const f = force(s, 0, 'factory', { cx: 6, cy: 6 });
    run(s, TICK_RATE * 6);
    expect(s.isPowered(f)).toBe(true);
    s.buildings.find((b) => b.owner === 0 && b.type === 'coal_plant')!.hp = 0;
    run(s, POWER.everyTicks + 1);
    expect(s.isPowered(f)).toBe(false);
    expect(s.drainEvents?.().some((e) => e.type === 'blackout') ?? true).toBe(true);
  });

  it('a mina tira carvão junto com o ferro', () => {
    const map = flatMap(32, (set) => {
      for (let y = 10; y < 14; y++) for (let x = 8; x < 12; x++) set(x, y, Terrain.Ore);
    });
    const s = new Simulation({ map, playerCount: 2, startingUnits: [], startingResources: { ...TEST_START, coal: 0 }, power: true });
    const mine = force(s, 0, 'mine', { cx: 6, cy: 10 });
    mine.claims = [10 * 32 + 8, 11 * 32 + 8, 12 * 32 + 8];
    mine.workers = 6;
    run(s, TICK_RATE * 30);
    expect(s.players[0]!.resources.coal).toBeGreaterThan(0);
  });

  it('salvar no meio e continuar é idêntico', () => {
    const s = sim();
    force(s, 0, 'factory', { cx: 6, cy: 6 });
    run(s, POWER.everyTicks * 3 + 4);
    const copy = Simulation.deserialize(s.serialize());
    run(s, 300);
    run(copy, 300);
    expect(copy.serialize()).toBe(s.serialize());
  });

  it('solver: uma construção que alcança duas redes as une', () => {
    const plant: PowerNode = { id: 1, type: 'coal_plant', cx: 0, cy: 0, size: 2, gen: 30, use: 0 };
    const user: PowerNode = { id: 2, type: 'factory', cx: 30, cy: 0, size: 2, gen: 0, use: 6 };
    const bridge: PowerNode = { id: 3, type: 'barracks', cx: 15, cy: 0, size: 2, gen: 0, use: 3 };
    const roads = [...Array.from({ length: 10 }, (_, k) => 2 + k), ...Array.from({ length: 10 }, (_, k) => 20 + k)];
    const res = solvePower(40, 4, roads, [plant], [user, bridge]);
    expect(res.powered.has(2)).toBe(true);
    expect(res.powered.has(3)).toBe(true);
  });
});
