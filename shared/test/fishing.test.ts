import { describe, expect, it } from 'vitest';
import { FISHING, TICK_RATE, Terrain } from '../sim/config.ts';
import { checkProduce } from '../sim/production.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { BUILDING_TECHS, flatMap } from './helpers.ts';

/** Pesqueiro (05/11): ciclo automático Porto → mar → Porto, limite de 3 por porto e custo crescente. */

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

/** Terra a oeste (colunas 0–23) e mar a leste; território do jogador 0 até a coluna 34. */
function coast() {
  const map = flatMap(48, (set) => {
    for (let y = 0; y < 48; y++) for (let x = 24; x < 48; x++) set(x, y, Terrain.Water);
  });
  map.spawns = [
    { cx: 6, cy: 6 },
    { cx: 6, cy: 40 },
  ];
  const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
  const link: NationalLink = {
    techs: () => [...BUILDING_TECHS, 'naval_logistics'],
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => 1e12,
    chargeWorks: () => true,
    refundWorks: () => undefined,
  };
  sim.national = link;
  for (let cy = 0; cy < 48; cy++) for (let cx = 0; cx < 48; cx++) sim.territory[cy * 48 + cx] = cx <= 34 && cy < 30 ? 0 : -1;
  const p = sim.players[0]!;
  for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 3000;
  p.resources.food = 0;
  const port = sim.addBuilding('port', 0, { cx: 22, cy: 14 }, 1);
  sim.addBuilding('silo', 0, { cx: 10, cy: 10 }, 1);
  return { sim, port, p };
}

describe('Pesqueiro', () => {
  it('sai do porto, pesca no mar e volta com comida', () => {
    const { sim, port, p } = coast();
    expect(sim.applyCommand(0, { type: 'produce', buildingId: port.id, unitType: 'fishing_boat' })).toBeNull();
    run(sim, 45);
    const boat = sim.units.find((u) => u.type === 'fishing_boat')!;
    expect(boat).toBeTruthy();
    expect(boat.fishing?.portId).toBe(port.id);
    let fished = false;
    let food = 0;
    for (let s = 0; s < 120 && food === 0; s++) {
      run(sim, 1);
      if (boat.fishing?.state === 'fishing') {
        fished = true;
        const c = sim.grid.worldToCell(boat.pos);
        expect(sim.grid.terrainAt(c.cx, c.cy)).toBe(Terrain.Water);
        expect(Math.hypot(c.cx - 23, c.cy - 15)).toBeGreaterThanOrEqual(FISHING.minCells - 1.5);
      }
      food = p.resources.food;
    }
    expect(fished).toBe(true);
    expect(food).toBeGreaterThan(FISHING.foodPerTrip - 5); // menos o que a população comeu no mesmo segundo
    // e recomeça sozinho
    run(sim, 3);
    expect(boat.fishing?.state).toBe('out');
  });

  it('no máximo 3 por porto; cada pesqueiro novo custa mais', () => {
    const { sim, port } = coast();
    for (let i = 0; i < 3; i++) expect(sim.applyCommand(0, { type: 'produce', buildingId: port.id, unitType: 'fishing_boat' })).toBeNull();
    expect(sim.applyCommand(0, { type: 'produce', buildingId: port.id, unitType: 'fishing_boat' })).toMatch(/3 pesqueiros/);
    const base = { buildingType: 'port' as const, level: 1, spec: null, progress: 1, queueLength: 0, resources: sim.players[0]!.resources, recruits: 0, popTotal: 0, popCap: 99, techs: null, militaryResearch: [] };
    const first = checkProduce('fishing_boat', { ...base, fishing: { atPort: 0, owned: 0 } });
    const third = checkProduce('fishing_boat', { ...base, fishing: { atPort: 2, owned: 2 } });
    expect(first.blocker).toBeNull();
    expect(third.cost.wood!).toBeGreaterThan(first.cost.wood! * 1.3);
    expect(checkProduce('fishing_boat', { ...base, fishing: { atPort: 3, owned: 3 } }).short).toBe('máx. 3');
  });

  it('sem o porto de origem, adota outro porto do jogador', () => {
    const { sim, port, p } = coast();
    sim.applyCommand(0, { type: 'produce', buildingId: port.id, unitType: 'fishing_boat' });
    run(sim, 45);
    const other = sim.addBuilding('port', 0, { cx: 22, cy: 4 }, 1);
    port.hp = 0;
    run(sim, 2);
    const boat = sim.units.find((u) => u.type === 'fishing_boat')!;
    for (let s = 0; s < 160 && p.resources.food === 0; s++) run(sim, 1);
    expect(boat.fishing?.portId).toBe(other.id);
    expect(p.resources.food).toBeGreaterThan(0);
  });
});

describe('Custo crescente em recursos e US$ (05/11)', () => {
  it('o segundo porto custa mais recursos e paga taxa de obra; sem caixa, não constrói', async () => {
    const { buildingCost, buildingUsd } = await import('../sim/config.ts');
    const map = flatMap(48, (set) => {
      for (let y = 0; y < 48; y++) for (let x = 24; x < 48; x++) set(x, y, Terrain.Water);
    });
    map.spawns = [
      { cx: 6, cy: 6 },
      { cx: 6, cy: 40 },
    ];
    const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
    const st = { fund: 10_000_000, charged: [] as number[] };
    sim.national = {
      techs: () => [...BUILDING_TECHS, 'naval_logistics'],
      infrastructureIndex: () => 1,
      stability: () => 60,
      worksFundUsd: () => st.fund,
      chargeWorks: (_s, usd) => {
        if (st.fund < usd) return false;
        st.fund -= usd;
        st.charged.push(usd);
        return true;
      },
      refundWorks: () => undefined,
      worksCapUsd: () => 75_000_000,
    };
    for (let cy = 0; cy < 48; cy++) for (let cx = 0; cx < 48; cx++) sim.territory[cy * 48 + cx] = cx <= 34 && cy < 30 ? 0 : -1;
    const p = sim.players[0]!;
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 5000;
    expect(buildingUsd('port', 0, 75e6)).toBe(0);
    expect(buildingUsd('port', 1, 75e6)).toBe(300_000);
    expect(buildingUsd('port', 5, 75e6)).toBeGreaterThan(buildingUsd('port', 4, 75e6) * 1.15);
    expect(buildingCost('port', 1).wood!).toBeGreaterThan(buildingCost('port', 0).wood!);
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'port', cx: 22, cy: 4 })).toBeNull();
    expect(st.charged).toEqual([]);
    const wood = p.resources.wood;
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'port', cx: 22, cy: 14 })).toBeNull();
    expect(st.charged).toEqual([300_000]);
    expect(wood - p.resources.wood).toBe(buildingCost('port', 1).wood);
    st.fund = 0;
    expect(sim.applyCommand(0, { type: 'build', buildingType: 'port', cx: 22, cy: 24 })).toMatch(/taxa de obra/);
  });
});
