import { describe, expect, it } from 'vitest';
import { TICK_RATE, Terrain, UNITS } from '../sim/config.ts';
import { AIRLIFT, CRUISE, MISSILE, launcherRange } from '../sim/air.ts';
import { checkProduce } from '../sim/production.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { canHit } from '../sim/targeting.ts';
import type { Unit } from '../sim/types.ts';
import { BUILDING_TECHS, flatMap } from './helpers.ts';

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

const NAVY_TECHS = ['naval_warfare', 'submarine_warfare', 'cruise_missiles', 'naval_aviation', 'airborne_operations', 'guided_munitions', 'ballistic_missiles', 'logistics'];

/** Mapa 48×48: terra a oeste e um mar a leste (colunas 24+), com as duas bases em terra. */
function sea(techs: string[] = NAVY_TECHS) {
  const map = flatMap(48, (set) => {
    for (let y = 0; y < 48; y++) for (let x = 24; x < 48; x++) if (!(y > 38 && x > 38)) set(x, y, Terrain.Water);
  });
  map.spawns = [
    { cx: 6, cy: 6 },
    { cx: 43, cy: 43 },
  ];
  const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
  const link: NationalLink = {
    techs: () => [...BUILDING_TECHS, ...techs],
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => 1e12,
    chargeWorks: () => true,
    refundWorks: () => undefined,
  };
  sim.national = link;
  sim.setWar(0, 1, true);
  for (const p of sim.players) {
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 5000;
    p.recruits = 40;
    p.era = 4;
  }
  const at = (cx: number, cy: number) => sim.grid.cellCenter({ cx, cy });
  return { sim, at };
}

describe('Marinha (03/11)', () => {
  it('quem atinge quem: submarino só por submarino; fragata não atira em tropa em terra', () => {
    const { sim, at } = sea();
    const sub = sim.addUnit('submarine', 1, at(30, 20));
    const frig = sim.addUnit('frigate', 1, at(30, 24));
    const tank = sim.addUnit('tank', 1, at(10, 10));
    expect(canHit('frigate', sub)).toBe(false);
    expect(canHit(null, sub)).toBe(false);
    expect(canHit('submarine', sub)).toBe(true);
    expect(canHit('submarine', frig)).toBe(true);
    expect(canHit('submarine', tank)).toBe(false);
    expect(canHit('frigate', tank)).toBe(false);
    expect(canHit('frigate', frig)).toBe(true);
    expect(canHit('frigate', sim.hqOf(0)!)).toBe(true);
    expect(canHit('tank', frig)).toBe(true);
  });

  it('fragata afunda navio inimigo e bombardeia a costa; submarino escapa da fragata e cai para outro submarino', () => {
    const { sim, at } = sea();
    const frig = sim.addUnit('frigate', 0, at(28, 20));
    const cargo = sim.addUnit('cargo_ship', 1, at(34, 20));
    const enemySub = sim.addUnit('submarine', 1, at(30, 22));
    run(sim, 40);
    expect(cargo.hp).toBeLessThanOrEqual(0);
    expect(enemySub.hp).toBe(enemySub.maxHp);
    const mySub = sim.addUnit('submarine', 0, at(32, 24));
    run(sim, 60);
    expect(enemySub.hp < enemySub.maxHp || mySub.hp < mySub.maxHp).toBe(true);
    // a fragata não enxerga alvo no submarino, mas leva torpedo dele
    expect(frig.hp).toBeLessThan(frig.maxHp);
  });

  it('tripulação e pesquisa: fragata ocupa 6 recrutas e exige Guerra naval', () => {
    const base = {
      buildingType: 'port' as const,
      level: 1,
      spec: null,
      progress: 1,
      queueLength: 0,
      resources: { food: 9999, wood: 9999, stone: 9999, iron: 9999, oil: 9999, supplies: 9999, coal: 9999 },
      popTotal: 0,
      popCap: 999,
      militaryResearch: [],
      era: 4,
    };
    expect(checkProduce('frigate', { ...base, recruits: 5, techs: ['naval_warfare'] }).blocker).toMatch(/Tripulação de 6/);
    expect(checkProduce('frigate', { ...base, recruits: 9, techs: [] }).blocker).toMatch(/Guerra naval/);
    expect(checkProduce('frigate', { ...base, recruits: 9, techs: ['naval_warfare'] }).blocker).toBeNull();
    expect(checkProduce('cargo_ship', { ...base, recruits: 9, techs: [] }).blocker).toMatch(/Logística/);
    const { sim, at } = sea();
    const pop = sim.population(0).military;
    sim.addUnit('frigate', 0, at(28, 20));
    expect(sim.population(0).military).toBe(pop + 6);
  });

  it('fragata leva até 15 soldados a pé, nunca veículos; o L402 leva 10 de cada', () => {
    const { sim, at } = sea();
    const frig = sim.addUnit('frigate', 0, at(24, 10));
    const tank = sim.addUnit('tank', 0, at(22, 10));
    expect(sim.applyCommand(0, { type: 'embark', unitIds: [tank.id], shipId: frig.id })).toMatch(/só soldados a pé/);
    const soldiers = Array.from({ length: 16 }, (_, i) => sim.addUnit('infantry', 0, at(20 - (i % 4), 6 + Math.floor(i / 4))));
    expect(sim.applyCommand(0, { type: 'embark', unitIds: soldiers.map((u) => u.id), shipId: frig.id })).toBeNull();
    run(sim, 30);
    expect(frig.cargo?.length).toBe(15);
    expect(UNITS.transport_ship.cargo).toEqual({ infantry: 10, vehicles: 10 });
    const l402 = sim.addUnit('transport_ship', 0, at(24, 16));
    expect(sim.cargoRoom(l402, 'tank')).toBe(10);
    expect(sim.cargoRoom(l402, 'infantry')).toBe(10);
  });

  it('mísseis: alcance do silo e do submarino, alvo em qualquer ponto fora da fronteira e recarga no Porto', () => {
    const { sim, at } = sea();
    const sub = sim.addUnit('missile_submarine', 0, at(26, 10));
    expect(sub.missiles).toBe(UNITS.missile_submarine.missiles);
    // dentro da própria fronteira: recusado
    expect(sim.air.prepareBlocker(0, sub.id, sim.hqOf(0)!.pos.x, sim.hqOf(0)!.pos.y)).toMatch(/fora da sua fronteira/);
    // longe demais
    const far = at(45, 45);
    expect(sim.air.prepareBlocker(0, sub.id, far.x, far.y)).toMatch(/Fora do alcance/);
    // no mar aberto (neutro), dentro do alcance: só depois de explorado (nada de bombardear às cegas)
    const p = at(40, 10);
    expect(Math.hypot(p.x - sub.pos.x, p.y - sub.pos.y)).toBeLessThan(CRUISE.range);
    expect(sim.air.prepareBlocker(0, sub.id, p.x, p.y)).toMatch(/não explorado/);
    const pc = sim.grid.worldToCell(p);
    (sim.explored[0] ??= new Uint8Array(sim.map.width * sim.map.height))[pc.cy * sim.map.width + pc.cx] = 1;
    const enemyShip = sim.addUnit('frigate', 1, p);
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: sub.id, x: p.x, y: p.y })).toBeNull();
    expect(sub.missiles).toBe((UNITS.missile_submarine.missiles ?? 0) - 1);
    run(sim, CRUISE.prepareSeconds + 0.2);
    const l = sim.air.launches[0]!;
    expect(l.state).toBe('armed');
    expect(sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
    run(sim, 8);
    expect(['impact', 'intercepted']).toContain(l.state);
    if (l.state === 'impact') expect(enemyShip.hp).toBeLessThan(enemyShip.maxHp);
    expect(launcherRange('silo', 1)).toBe(MISSILE.range[1]);
    // recarga junto a um Porto próprio
    sub.missiles = 0;
    sim.addBuilding('port', 0, { cx: 22, cy: 9 }, 1);
    sub.pos = at(25, 10);
    sub.order = { kind: 'idle' };
    run(sim, CRUISE.reloadSeconds + 1);
    expect(sub.missiles).toBeGreaterThanOrEqual(1);
  });

  it('porta-aviões sai com 4 caças, só opera caças e repõe o abatido pelo preço normal; afundado, perde os do convés', () => {
    const { sim, at } = sea();
    const cv = sim.addUnit('aircraft_carrier', 0, at(30, 10));
    const planes = sim.air.aircraftAt(cv.id);
    expect(planes).toHaveLength(4);
    expect(planes.every((a) => a.type === 'fighter' && a.state === 'ready')).toBe(true);
    expect(sim.air.buildBlocker(0, cv.id, 'fighter')).toMatch(/Convés cheio/);
    sim.air.aircraft = sim.air.aircraft.filter((a) => a.id !== planes[0]!.id);
    expect(sim.air.buildBlocker(0, cv.id, 'bomber')).toMatch(/só opera caças/);
    const iron = sim.players[0]!.resources.iron;
    expect(sim.applyCommand(0, { type: 'build_aircraft', buildingId: cv.id, aircraftType: 'fighter' })).toBeNull();
    expect(sim.players[0]!.resources.iron).toBeLessThan(iron);
    sim.damageUnit(cv as Unit, 1e6, 1);
    run(sim, 1);
    expect(sim.air.aircraftAt(cv.id)).toHaveLength(0);
  });

  it('C-5: embarca as tropas perto da base, lança de paraquedas no ponto e volta; abatido, todos morrem', () => {
    const { sim, at } = sea();
    const base = sim.addBuilding('airbase', 0, { cx: 12, cy: 12 }, 1);
    base.level = 2;
    sim.air.aircraft.push({ id: 900, type: 'airlifter', owner: 0, baseId: base.id, home: { ...base.pos }, state: 'ready', timer: 0, missionId: null });
    const troops = [sim.addUnit('infantry', 0, at(10, 10)), sim.addUnit('infantry', 0, at(11, 10)), sim.addUnit('tank', 0, at(10, 11))];
    const far = sim.addUnit('infantry', 0, at(2, 40));
    const drop = at(18, 30);
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: [900], mission: 'paradrop', x: drop.x, y: drop.y, unitIds: [...troops, far].map((u) => u.id) })).toBeNull();
    // embarcaram (saem do mapa), menos o que estava longe da base
    expect(troops.every((u) => !sim.entities.has(u.id))).toBe(true);
    expect(sim.entities.has(far.id)).toBe(true);
    run(sim, 30);
    const landed = troops.filter((u) => sim.entities.has(u.id));
    expect(landed).toHaveLength(3);
    for (const u of landed) expect(Math.hypot(u.pos.x - drop.x, u.pos.y - drop.y)).toBeLessThan(AIRLIFT.dropCells * 2 + 2);
    expect(sim.applyCommand(0, { type: 'air_mission', buildingId: base.id, aircraftIds: [900], mission: 'paradrop', x: drop.x, y: drop.y, unitIds: [] })).not.toBeNull();
  });

  it('paraquedas: na descida a tropa não age, mas pode ser atingida; o veículo desce mais devagar', () => {
    const { sim, at } = sea();
    const inf = sim.addUnit('infantry', 0, at(10, 30));
    const tank = sim.addUnit('tank', 0, at(10, 30));
    sim.entities.delete(inf.id);
    sim.entities.delete(tank.id);
    const enemy = sim.addUnit('infantry', 1, at(12, 30));
    expect(sim.dropTroops(0, [inf, tank], at(10, 30), 4)).toBe(2);
    expect(inf.descent!.total).toBe(Math.round(AIRLIFT.descentInfantry * TICK_RATE));
    expect(tank.descent!.total).toBeGreaterThan(inf.descent!.total);
    const hp = enemy.hp;
    const before = inf.hp;
    run(sim, 1);
    // no ar: não atira (o inimigo segue inteiro) e já leva tiro
    expect(enemy.hp).toBe(hp);
    expect(inf.hp).toBeLessThan(before);
    run(sim, AIRLIFT.descentVehicle + 1);
    expect(inf.descent).toBeUndefined();
    expect(tank.descent).toBeUndefined();
  });

  it('comércio por navio só com Cargueiro', () => {
    const { sim, at } = sea();
    sim.addBuilding('market', 0, { cx: 4, cy: 12 }, 1);
    sim.addBuilding('port', 0, { cx: 22, cy: 9 }, 1);
    expect(sim.trade.modeBlocker(0, 'sea')).toMatch(/Cargueiro/);
    sim.addUnit('cargo_ship', 0, at(25, 9));
    expect(sim.trade.modeBlocker(0, 'sea')).toBeNull();
    expect(sim.trade.convoyLimit(0, 'sea')).toBe(1);
  });
});
