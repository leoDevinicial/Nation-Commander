import { describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingType } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TECHNOLOGIES, TECH_IDS, isTechId, techKnowledge } from '../strategic/technologies.ts';
import { TEST_START, flatMap, BUILDING_TECHS } from './helpers.ts';

/** Nação com só as pesquisas pedidas (camada nacional falsa, era 4). */
function sim(techs: string[]) {
  const s = new Simulation({ map: flatMap(40), playerCount: 2, startingUnits: [], startingResources: { ...TEST_START, coal: 200 } });
  s.national = {
    techs: () => techs,
    infrastructureIndex: () => 1,
    stability: () => 50,
    worksFundUsd: () => 1e12,
    chargeWorks: () => true,
    refundWorks: () => undefined,
    researchSpeed: () => 1,
    worksCapUsd: () => 75e6,
  } as unknown as Simulation['national'];
  s.players[0]!.era = 4;
  return s;
}

describe('pesquisas que liberam construções (03/11)', () => {
  it('toda pesquisa exigida por uma construção existe e aparece na árvore', () => {
    const gated = (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => BUILDINGS[t].requiresTech);
    expect(gated.length).toBeGreaterThanOrEqual(20);
    for (const t of gated) expect(isTechId(BUILDINGS[t].requiresTech)).toBe(true);
    for (const id of BUILDING_TECHS) expect(TECH_IDS).toContain(id);
    // a área "Estado e logística" deixou de ter só 3 pesquisas
    expect(TECH_IDS.filter((id) => TECHNOLOGIES[id].category === 'state').length).toBeGreaterThanOrEqual(10);
    // pré-requisitos válidos e sem ciclo (o custo em conhecimento percorre a árvore)
    for (const id of TECH_IDS) expect(techKnowledge(id)).toBeGreaterThan(0);
  });

  it('sem a pesquisa o Porto e o Hospital são recusados; com ela, liberados', () => {
    const hq = (s: Simulation) => s.hqOf(0)!.cell;
    const find = (s: Simulation, type: BuildingType, ok: (e: string | null) => boolean) => {
      for (let r = 3; r < 14; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const e = s.placementError(0, type, { cx: hq(s).cx + dx, cy: hq(s).cy + dy });
            if (ok(e)) return e;
          }
      return 'nenhum';
    };
    const none = sim([]);
    expect(none.placementError(0, 'hospital', { cx: hq(none).cx + 5, cy: hq(none).cy })).toMatch(/Saúde pública/);
    expect(none.placementError(0, 'wind_farm', { cx: hq(none).cx + 5, cy: hq(none).cy })).toMatch(/Energia eólica/);
    const ok = sim(['public_health']);
    expect(find(ok, 'hospital', (e) => e === null)).toBeNull();
  });

  it('rodovia exige Engenharia rodoviária', () => {
    const s = sim([]);
    const c = s.hqOf(0)!.cell;
    const cells = [0, 1, 2].map((d) => ({ cx: c.cx + 4 + d, cy: c.cy + 4 }));
    expect(s.highwayPlan(0, cells).error).toMatch(/Engenharia rodoviária/);
    expect(sim(['road_engineering']).highwayPlan(0, cells).error ?? '').not.toMatch(/Engenharia rodoviária/);
  });
});
