import { describe, expect, it } from 'vitest';
import { BUILDINGS, PROJECT_FX, SPACE, TICK_RATE, Terrain, UNITS, type BuildingType } from '../sim/config.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { flatMap } from './helpers.ts';

/** Grandes Projetos Nacionais e Programa Espacial (lote 2, itens 13 e 13.1). */

function setup(opts: { techs?: string[]; water?: boolean } = {}) {
  const sim = new Simulation({
    map: flatMap(40, (set) => {
      if (opts.water) for (let y = 0; y < 40; y++) set(20, y, Terrain.Water);
    }),
    playerCount: 2,
    startingUnits: [],
  });
  const st = { fund: 1e9, charged: 0 };
  const link: NationalLink = {
    techs: () => opts.techs ?? ['space_technology'],
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
  sim.eras = true;
  sim.territory.fill(0);
  const p = sim.players[0]!;
  for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 9000;
  // armazenamento folgado para os custos dos projetos
  sim.addBuilding('warehouse', 0, { cx: 30, cy: 30 }, 1);
  sim.addBuilding('warehouse', 0, { cx: 30, cy: 33 }, 1);
  const build = (type: BuildingType, cx: number, cy: number) => sim.applyCommand(0, { type: 'build', buildingType: type, cx, cy });
  const run = (s: number) => {
    for (let i = 0; i < s * TICK_RATE; i++) sim.step();
  };
  return { sim, st, build, run };
}

describe('Grandes Projetos Nacionais', () => {
  it('só na última era, um de cada por nação, com custo em US$ proporcional ao teto da verba', () => {
    const { sim, st, build } = setup();
    expect(build('nuclear_plant', 8, 8)).toMatch(/Futuro Próximo/);
    sim.players[0]!.era = 4;
    expect(build('nuclear_plant', 8, 8)).toBeNull();
    expect(st.charged).toBe(100_000_000 * BUILDINGS.nuclear_plant.project!.usdShare);
    expect(build('nuclear_plant', 14, 8)).toMatch(/só um por nação/);
  });

  it('Usina Nuclear rende suprimentos e acelera obras; Rede 5G dá visão; Hidrelétrica exige água e aumenta a coleta', () => {
    const { sim, build } = setup({ water: true });
    sim.players[0]!.era = 4;
    const u = sim.addUnit('infantry', 0, { x: 10, y: 60 });
    const sight = sim.sightOf(u);
    expect(build('hydro_dam', 8, 26)).toMatch(/margem da água/);
    expect(build('hydro_dam', 17, 4)).toBeNull();
    for (const b of sim.buildings) if (b.owner === 0) b.progress = 1;
    sim.addBuilding('nuclear_plant', 0, { cx: 4, cy: 12 }, 1);
    sim.addBuilding('network_5g', 0, { cx: 4, cy: 20 }, 1);
    sim.step();
    expect(sim.sightOf(u)).toBe(sight + PROJECT_FX.network5gSight);
    expect(sim.incomePerSecond(0).supplies).toBeGreaterThanOrEqual(BUILDINGS.nuclear_plant.income.supplies! - 1);
    const house = sim.addBuilding('house', 0, { cx: 10, cy: 30 }, 0);
    expect(house.buildTicks).toBeLessThan(BUILDINGS.house.buildSeconds * TICK_RATE);
    expect(sim.hasProject(0, 'hydro_dam')).toBe(true);
    expect(UNITS.infantry.sight).toBeGreaterThan(0);
  });
});

describe('Programa Espacial', () => {
  it('exige QG nível 9 e a pesquisa; lançamento com contagem, subida e satélite que tira a névoa', () => {
    const { sim, build, run } = setup();
    sim.players[0]!.era = 4;
    expect(build('space_center', 6, 6)).toMatch(/nível 9/);
    sim.hqOf(0)!.level = 9;
    expect(build('space_center', 6, 6)).toBeNull();
    const pad = sim.buildings.find((b) => b.type === 'space_center')!;
    expect(sim.applyCommand(0, { type: 'space_launch', buildingId: pad.id })).toMatch(/obra/);
    pad.progress = 1;
    const enemyHq = sim.hqOf(1)!;
    expect(sim.isVisibleTo(0, enemyHq.pos)).toBe(false);
    expect(sim.applyCommand(0, { type: 'space_launch', buildingId: pad.id })).toBeNull();
    run(SPACE.countdownSeconds + 0.5);
    expect(pad.launch?.phase).toBe('ascent');
    const copy = Simulation.fromSave(sim.toSave());
    expect(copy.buildings.find((b) => b.id === pad.id)!.launch?.phase).toBe('ascent');
    run(SPACE.ascentSeconds + 0.5);
    expect(sim.players[0]!.satellite).toBeTruthy();
    expect(sim.isVisibleTo(0, enemyHq.pos)).toBe(true);
    expect(sim.canSee(0, enemyHq)).toBe(true);
    const events = sim.drainEvents().filter((e) => e.type === 'space').map((e) => (e.type === 'space' ? e.state : ''));
    expect(events).toEqual(['countdown', 'ascent', 'orbit']);
    expect(sim.applyCommand(0, { type: 'space_launch', buildingId: pad.id })).toMatch(/já está em órbita/);
  });

  it('a camada nacional registra o satélite (público, orgulho nacional) e o salva', () => {
    const nat = new NationalSimulation(
      [
        { slot: 0, countryId: 'BRA' },
        { slot: 1, countryId: 'ARG' },
      ],
      2,
      'parity',
    );
    nat.registerTacticalEvents([{ type: 'space', tick: 0, owner: 0, id: 5, state: 'orbit', pos: { x: 0, y: 0 } }]);
    expect(nat.satellites).toEqual([0]);
    expect(nat.nation(0)!.policies!.favor).toBeGreaterThan(0);
    expect(nat.viewFor(1).satellites).toEqual([0]);
    expect(nat.eventsFor(1, nat.drainEvents()).some((e) => e.type === 'satellite')).toBe(true);
    const copy = new NationalSimulation(
      [
        { slot: 0, countryId: 'BRA' },
        { slot: 1, countryId: 'ARG' },
      ],
      2,
      'parity',
    );
    copy.load(nat.toSave());
    expect(copy.satellites).toEqual([0]);
  });
});
