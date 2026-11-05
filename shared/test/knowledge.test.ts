import { describe, expect, it } from 'vitest';
import { BUILDINGS, KNOWLEDGE, MILITARY_RESEARCH, TICK_RATE, Terrain, militaryResearchKnowledge, type BuildingType } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { techKnowledge, researchBlocker } from '../strategic/technologies.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import type { Building, Cell } from '../sim/types.ts';
import { TEST_START, flatMap, BUILDING_TECHS } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

function sim(edit?: Parameters<typeof flatMap>[1]) {
  return new Simulation({ map: flatMap(40, edit), playerCount: 2, startingUnits: [], startingResources: { ...TEST_START, coal: 200 } });
}

/** Construção pronta, sem passar pela validação (para montar o cenário). */
function force(s: Simulation, type: BuildingType, cell: Cell, slot = 0): Building {
  const b = (s as unknown as { addBuilding: (t: BuildingType, o: number, c: Cell, p: number) => Building }).addBuilding(type, slot, cell, 1);
  s.staff(slot);
  return b;
}

/** Primeira posição (perto do QG) cuja validação satisfaz `ok`. */
function spot(s: Simulation, type: BuildingType, ok: (err: string | null) => boolean = (e) => e === null): Cell {
  const hq = s.hqOf(0)!;
  for (let r = 2; r < 14; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const c = { cx: hq.cell.cx + dx, cy: hq.cell.cy + dy };
        if (ok(s.placementError(0, type, c))) return c;
      }
  throw new Error(`sem lugar para ${type}`);
}

/** Libera as pesquisas nacionais e a era para os testes de construção. */
function unlock(s: Simulation, techs: string[], era = 3) {
  s.national = {
    techs: () => [...BUILDING_TECHS, ...techs],
    infrastructureIndex: () => 1,
    stability: () => 50,
    worksFundUsd: () => 1e12,
    chargeWorks: () => true,
    refundWorks: () => undefined,
    researchSpeed: () => 1,
    worksCapUsd: () => 75e6,
  } as unknown as Simulation['national'];
  s.players[0]!.era = era as 1 | 2 | 3 | 4;
}

describe('conhecimento e cidades', () => {
  it('escola e universidade formam conhecimento com trabalhadores', () => {
    const s = sim();
    const start = s.players[0]!.knowledge!;
    expect(start).toBe(KNOWLEDGE.start);
    force(s, 'school', spot(s, 'school'));
    force(s, 'university', spot(s, 'university'));
    run(s, TICK_RATE * 10);
    const gained = s.players[0]!.knowledge! - start;
    expect(gained).toBeGreaterThan((KNOWLEDGE.hq + KNOWLEDGE.school + KNOWLEDGE.university) * 10 * 0.8);
    expect(gained).toBeLessThan((KNOWLEDGE.hq + KNOWLEDGE.school + KNOWLEDGE.university) * 10 * 1.1);
  });

  it('uma escola por cidade: a segunda perto do QG é recusada; perto de outra prefeitura, aceita', () => {
    const s = sim();
    force(s, 'school', spot(s, 'school'));
    const again = spot(s, 'school', (e) => !!e && /por cidade/.test(e));
    expect(s.placementError(0, 'school', again)).toMatch(/já tem .*Escola \(máximo 1 por cidade\)/);
    // uma prefeitura longe do QG funda outra cidade
    const hq = s.hqOf(0)!;
    const city = force(s, 'city_hall', { cx: hq.cell.cx + 14, cy: hq.cell.cy });
    run(s, 2);
    const near = { cx: city.cell.cx, cy: city.cell.cy + 3 };
    const err = s.placementError(0, 'school', near);
    expect(err ?? '').not.toMatch(/por cidade/);
  });

  it('pesquisa militar cobra conhecimento; sem saldo, recusa com o motivo', () => {
    const s = sim();
    const center = force(s, 'research_center', spot(s, 'research_center'));
    run(s, TICK_RATE);
    const kp = militaryResearchKnowledge('tracked_armor');
    s.players[0]!.knowledge = kp - 1;
    expect(s.applyCommand(0, { type: 'military_research', buildingId: center.id, researchId: 'tracked_armor' })).toMatch(/Conhecimento insuficiente/);
    s.players[0]!.knowledge = kp + 5;
    expect(s.applyCommand(0, { type: 'military_research', buildingId: center.id, researchId: 'tracked_armor' })).toBeNull();
    expect(s.players[0]!.knowledge).toBe(5);
    expect(MILITARY_RESEARCH.tracked_armor.tier).toBe(1);
  });

  it('pesquisa nacional cobra conhecimento uma vez; as de era 3 exigem a era', () => {
    expect(researchBlocker('silviculture', ['agricultural_mechanization'], { era: 2, knowledge: 999 })).toMatch(/era 3/);
    expect(researchBlocker('silviculture', ['agricultural_mechanization'], { era: 3, knowledge: 1 })).toMatch(/Conhecimento insuficiente/);
    const nat = new NationalSimulation([{ slot: 0, countryId: 'BRA' }, { slot: 1, countryId: 'ARG' }], 1, 'parity');
    let kp = 100;
    nat.attachTheater({ resources: () => null, spend: () => {}, setWar: () => {}, era: () => 1, knowledge: () => kp, spendKnowledge: (_s, n) => (kp >= n ? ((kp -= n), true) : false) });
    expect(nat.setResearch(0, 'logistics')).toBeNull();
    expect(kp).toBe(100 - techKnowledge('logistics'));
    // pausar e retomar não cobra de novo
    nat.setResearch(0, null);
    expect(nat.setResearch(0, 'logistics')).toBeNull();
    expect(kp).toBe(100 - techKnowledge('logistics'));
  });
});

describe('produção sem limite (era 3)', () => {
  it('mina subterrânea em qualquer lugar: pedra, ferro e carvão; uma por cidade; para sem luz', () => {
    const s = sim();
    unlock(s, ['underground_mining']);
    const m = force(s, 'underground_mine', spot(s, 'underground_mine'));
    expect(s.placementError(0, 'underground_mine', spot(s, 'underground_mine', (e) => !!e && /por cidade/.test(e)))).toMatch(/por cidade/);
    const before = { ...s.players[0]!.resources };
    run(s, TICK_RATE * 20);
    const r = s.players[0]!.resources;
    expect(r.stone).toBeGreaterThan(before.stone);
    expect(r.iron).toBeGreaterThan(before.iron);
    expect(m.status).toBe('ok');
  });

  it('floresta de eucalipto planta na planície e dá madeira; o forno ao lado faz carvão', () => {
    const s = sim();
    unlock(s, ['silviculture']);
    expect(s.placementError(0, 'charcoal_kiln', spot(s, 'charcoal_kiln', (e) => !!e && /Floresta de Eucalipto/.test(e)))).toMatch(/Floresta de Eucalipto/);
    const at = spot(s, 'eucalyptus_forest');
    expect(s.applyCommand(0, { type: 'build', buildingType: 'eucalyptus_forest', cx: at.cx, cy: at.cy })).toBeNull();
    const forest = s.buildings.find((b) => b.type === 'eucalyptus_forest')!;
    expect(forest.claims.length).toBeGreaterThanOrEqual(BUILDINGS.eucalyptus_forest.gather!.minCells);
    for (const i of forest.claims) expect(s.map.terrain[i]).toBe(Terrain.Plains);
    // sem depósito: renovável
    expect(forest.depositId).toBeNull();
    run(s, forest.buildTicks + 2);
    force(s, 'charcoal_kiln', spot(s, 'charcoal_kiln'));
    const coal = s.players[0]!.resources.coal;
    const wood = s.players[0]!.resources.wood;
    run(s, TICK_RATE * 20);
    expect(s.players[0]!.resources.coal).toBeGreaterThan(coal);
    expect(s.players[0]!.resources.wood).not.toBe(wood);
  });
});
