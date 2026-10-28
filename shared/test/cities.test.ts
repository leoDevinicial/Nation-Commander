import { describe, expect, it } from 'vitest';
import { BUILDINGS, CITY, TICK_RATE } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { makeSnapshot } from '../sim/snapshot.ts';
import { CITY_NAMES, nextCityName } from '../data/cities.ts';
import type { Building, Cell } from '../sim/types.ts';
import { flatMap } from './helpers.ts';

function setup() {
  const sim = new Simulation({ map: flatMap(48), playerCount: 2, startingUnits: [] });
  sim.countries = ['BRA', 'ARG'];
  sim.setWar(0, 1, true);
  for (const p of sim.players) for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 5000;
  /** Marca uma área como território do jogador (dispensa ampliar a fronteira com outras obras). */
  const own = (slot: number, cell: Cell, size = 4) => {
    for (let y = cell.cy - 1; y < cell.cy + size; y++) for (let x = cell.cx - 1; x < cell.cx + size; x++) sim.territory[y * sim.map.width + x] = slot;
  };
  const build = (slot: number, cell: Cell) => {
    own(slot, cell);
    return sim.applyCommand(slot, { type: 'build', buildingType: 'city_hall', cx: cell.cx, cy: cell.cy });
  };
  const hallAt = (cell: Cell) => sim.buildings.find((b) => b.type === 'city_hall' && b.cell.cx === cell.cx && b.cell.cy === cell.cy)!;
  return { sim, own, build, hallAt };
}

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

describe('Prefeituras e cidades', () => {
  it('cada prefeitura recebe o nome de uma cidade real do país, sem repetir; o QG leva a capital', () => {
    const { sim, build, hallAt } = setup();
    expect(build(0, { cx: 16, cy: 16 })).toBeNull();
    expect(build(0, { cx: 30, cy: 14 })).toBeNull();
    expect(hallAt({ cx: 16, cy: 16 }).city).toBe('São Paulo');
    expect(hallAt({ cx: 30, cy: 14 }).city).toBe('Rio de Janeiro');
    expect(build(1, { cx: 16, cy: 32 })).toBeNull();
    expect(hallAt({ cx: 16, cy: 32 }).city).toBe(CITY_NAMES.ARG![0]);
    expect(sim.cityName(sim.hqOf(0)!)).toBe('Brasília');
    const snap = makeSnapshot(sim, []);
    expect(snap.buildings.find((b) => b.type === 'hq' && b.owner === 0)!.city).toBe('Brasília');
    expect(snap.buildings.find((b) => b.type === 'city_hall' && b.cx === 16 && b.cy === 16)!.city).toBe('São Paulo');
  });

  it('nomes esgotados viram "Nova <cidade>"; país desconhecido numera as cidades', () => {
    const all = new Set(CITY_NAMES.BRA);
    expect(nextCityName('BRA', all)).toBe(`Nova ${CITY_NAMES.BRA![0]}`);
    expect(nextCityName('XYZ', new Set())).toBe('Cidade 1');
    expect(nextCityName(undefined, new Set(['Cidade 1']))).toBe('Cidade 2');
  });

  it(`prefeituras ficam a pelo menos ${CITY.spacingCells} células de outra prefeitura e de qualquer QG`, () => {
    const { build } = setup();
    expect(build(0, { cx: 8, cy: 8 })).toMatch(/Centro de Comando/);
    expect(build(0, { cx: 16, cy: 16 })).toBeNull();
    expect(build(0, { cx: 22, cy: 16 })).toMatch(/outra cidade/);
    // a regra vale também contra a cidade de outro país
    expect(build(1, { cx: 20, cy: 22 })).toMatch(/outra cidade/);
    expect(build(0, { cx: 30, cy: 16 })).toBeNull();
  });

  it('prefeitura destruída por inimigo: ele toma a cidade e os edifícios no raio dela, nunca o QG', () => {
    const { sim } = setup();
    const hall = sim.addBuilding('city_hall', 0, { cx: 16, cy: 16 }, 1);
    hall.city = 'São Paulo';
    const near = sim.addBuilding('barracks', 0, { cx: 19, cy: 16 }, 1);
    near.queue.push({ unitType: 'recruit', remainingTicks: 50, totalTicks: 60, paid: {} });
    const tank = sim.addBuilding('oil_tank', 0, { cx: 16, cy: 19 }, 1);
    tank.stored = 40;
    const far = sim.addBuilding('barracks', 0, { cx: 30, cy: 30 }, 1);
    const p0 = sim.players[0]!;
    const p1 = sim.players[1]!;
    // estoque coerente: petróleo = reserva do QG + tanques
    p0.oilReserve = 60;
    p0.resources.oil = 100;
    p1.oilReserve = 100;
    p1.resources.oil = 100;
    sim.drainEvents();
    expect(sim.damageBuilding(hall, hall.hp + 10, 1)).toBe(true);
    // a prefeitura não some: troca de dono com pouca vida
    expect(hall.owner).toBe(1);
    expect(hall.hp).toBe(Math.round(hall.maxHp * CITY.captureHpFrac));
    expect(near.owner).toBe(1);
    expect(near.queue).toHaveLength(0);
    expect(tank.owner).toBe(1);
    expect(p0.resources.oil).toBe(60);
    expect(p1.resources.oil).toBe(140);
    expect(far.owner).toBe(0);
    expect(sim.hqOf(0)!.owner).toBe(0);
    const ev = sim.drainEvents();
    const cap = ev.find((e) => e.type === 'city_captured');
    expect(cap).toMatchObject({ owner: 1, victim: 0, city: 'São Paulo', buildings: 2 });
    expect(ev.some((e) => e.type === 'destroyed' && e.id === hall.id)).toBe(false);
    run(sim, 1);
    expect(sim.entities.has(hall.id)).toBe(true);
    // a fronteira passa a ser do novo dono em volta da cidade
    const c = sim.grid.worldToCell(hall.pos);
    expect(sim.territoryOwner(c.cx, c.cy)).toBe(1);
    // o novo dono pode ser tomado de volta pelo antigo
    sim.damageBuilding(hall, hall.hp + 1, 0);
    expect(hall.owner).toBe(0);
  });

  it('o QG perto da prefeitura não muda de dono; prefeitura ainda em obra é destruída normalmente', () => {
    const { sim } = setup();
    const hq = sim.hqOf(0)!;
    const hall = sim.addBuilding('city_hall', 0, { cx: hq.cell.cx + 4, cy: hq.cell.cy }, 1);
    sim.damageBuilding(hall, hall.hp + 1, 1);
    expect(hall.owner).toBe(1);
    expect(hq.owner).toBe(0);
    const site = sim.addBuilding('city_hall', 0, { cx: 30, cy: 10 }, 0.5);
    sim.damageBuilding(site, site.hp + 1, 1);
    run(sim, 0.1);
    expect(sim.entities.has(site.id)).toBe(false);
  });

  it('base aérea capturada: os aviões do antigo dono no hangar se perdem', () => {
    const { sim } = setup();
    const hall = sim.addBuilding('city_hall', 0, { cx: 16, cy: 16 }, 1);
    const base = sim.addBuilding('airbase', 0, { cx: 19, cy: 19 }, 1);
    sim.air.aircraft.push({ id: 900, type: 'fighter', owner: 0, baseId: base.id, home: { ...base.pos }, state: 'ready', timer: 0, missionId: null });
    sim.drainEvents();
    sim.damageBuilding(hall, hall.hp + 1, 1);
    expect(base.owner).toBe(1);
    expect(sim.air.aircraft).toHaveLength(0);
    expect(sim.drainEvents().some((e) => e.type === 'aircraft_lost' && e.owner === 0)).toBe(true);
  });

  it('salvar e carregar mantém os países e os nomes das cidades', () => {
    const { sim, build, hallAt } = setup();
    expect(build(0, { cx: 16, cy: 16 })).toBeNull();
    const copy = Simulation.deserialize(sim.serialize());
    expect(copy.countries).toEqual(['BRA', 'ARG']);
    expect((copy.entities.get(hallAt({ cx: 16, cy: 16 }).id) as Building).city).toBe('São Paulo');
    expect(build(0, { cx: 30, cy: 14 })).toBeNull();
    run(sim, 2);
    run(copy, 2);
    expect(BUILDINGS.city_hall.buildable).toBe(true);
  });
});
