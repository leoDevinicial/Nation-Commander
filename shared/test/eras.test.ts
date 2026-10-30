import { describe, expect, it } from 'vitest';
import { TICK_RATE, type BuildingType } from '../sim/config.ts';
import { ERAS, eraPhrase, eraTitle } from '../sim/eras.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TEST_START, flatMap } from './helpers.ts';

/** Progressão por eras (lote 1, §3.1). */

function setup() {
  const sim = new Simulation({ map: flatMap(36), playerCount: 2, startingUnits: [], startingResources: TEST_START });
  sim.eras = true;
  for (const p of sim.players) {
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 5000;
    p.oilReserve = 5000;
    p.recruits = 10;
    p.citizens = 30;
  }
  const place = (slot: number, type: BuildingType): string | null => {
    let last: string | null = 'sem lugar';
    for (let cy = 8; cy <= 16; cy++)
      for (let cx = 2; cx <= 14; cx++) {
        last = sim.applyCommand(slot, { type: 'build', buildingType: type, cx, cy });
        if (last === null || /era/.test(last)) return last;
      }
    return last;
  };
  const run = (s: number) => {
    for (let i = 0; i < s * TICK_RATE; i++) sim.step();
  };
  return { sim, place, run };
}

describe('eras', () => {
  it('nome da era sem "Era" repetido: "Era Digital", não "Era Era Digital"', () => {
    expect([1, 2, 3, 4].map(eraTitle)).toEqual(['Era Guerra Fria', 'Era Pós-Guerra Fria', 'Era Digital', 'Era Futuro Próximo']);
    expect(eraPhrase(3)).toBe('a Era Digital');
    expect(eraPhrase(4)).toBe('a era Futuro Próximo');
  });

  it('começa na Guerra Fria: construções e tropas das eras seguintes ficam bloqueadas', () => {
    const { sim, place } = setup();
    expect(sim.eraOf(0)).toBe(1);
    expect(place(0, 'research_center')).toMatch(/Pós-Guerra Fria/);
    expect(place(0, 'airbase')).toMatch(/Era Digital/);
    expect(place(0, 'barracks')).toBeNull();
  });

  it('avançar exige o QG no nível certo, custa recursos e leva tempo; ao concluir libera a era', () => {
    const { sim, place, run } = setup();
    expect(sim.applyCommand(0, { type: 'advance_era' })).toMatch(/nível 3/);
    sim.hqOf(0)!.level = ERAS[2].hqLevel;
    const stone = sim.players[0]!.resources.stone;
    expect(sim.applyCommand(0, { type: 'advance_era' })).toBeNull();
    expect(sim.players[0]!.resources.stone).toBe(stone - ERAS[2].cost.stone!);
    expect(sim.applyCommand(0, { type: 'advance_era' })).toMatch(/em andamento/);
    run(ERAS[2].seconds - 2);
    expect(sim.eraOf(0)).toBe(1);
    run(3);
    expect(sim.eraOf(0)).toBe(2);
    expect(sim.drainEvents().some((e) => e.type === 'era' && e.state === 'completed' && e.era === 2)).toBe(true);
    expect(place(0, 'research_center')).toBeNull();
  });

  it('cancelar devolve 75%; tropas, pesquisas e níveis de melhoria seguem a era', () => {
    const { sim } = setup();
    sim.hqOf(0)!.level = ERAS[2].hqLevel;
    // dentro da capacidade de armazenamento do QG (a devolução não passa dela)
    sim.players[0]!.resources.iron = 200;
    const iron = sim.players[0]!.resources.iron;
    sim.applyCommand(0, { type: 'advance_era' });
    expect(sim.applyCommand(0, { type: 'cancel_era' })).toBeNull();
    expect(sim.players[0]!.resources.iron).toBe(iron - ERAS[2].cost.iron! + Math.floor(ERAS[2].cost.iron! * 0.75));
    // pesquisa militar do tanque (era 2) bloqueada na era 1
    const center = sim.addBuilding('research_center', 0, { cx: 6, cy: 10 }, 1);
    center.workers = 3;
    expect(sim.applyCommand(0, { type: 'military_research', buildingId: center.id, researchId: 'tracked_armor' })).toMatch(/era/);
    // melhorias até o nível 6 nas eras 1 e 2
    const hq = sim.hqOf(0)!;
    hq.level = 6;
    expect(sim.upgradePlan(hq).blocker).toMatch(/próxima era/);
    // fábrica: tanque exige a era 2 mesmo com a pesquisa feita
    const f = sim.addBuilding('factory', 0, { cx: 10, cy: 14 }, 1);
    f.workers = 4;
    sim.players[0]!.militaryResearch = ['tracked_armor'];
    expect(sim.applyCommand(0, { type: 'produce', buildingId: f.id, unitType: 'tank' })).toMatch(/era/);
    expect(sim.applyCommand(0, { type: 'produce', buildingId: f.id, unitType: 'apc' })).toBeNull();
  });

  it('tropa nova sai com o visual da era; salvar e carregar mantém era e avanço', () => {
    const { sim, run } = setup();
    sim.players[0]!.era = 3;
    const u = sim.addUnit('infantry', 0, { x: 20, y: 20 });
    expect(u.era).toBe(3);
    sim.hqOf(0)!.level = ERAS[4].hqLevel;
    expect(sim.applyCommand(0, { type: 'advance_era' })).toBeNull();
    run(1);
    const copy = Simulation.fromSave(sim.toSave());
    expect(copy.eras).toBe(true);
    expect(copy.players[0]!.era).toBe(3);
    expect(copy.players[0]!.eraAdvance?.to).toBe(4);
  });

  it('sem eras (testes antigos, batalhas) e no Sandbox tudo fica liberado', () => {
    const off = new Simulation({ map: flatMap(36), playerCount: 2, startingUnits: [] });
    expect(off.eraOf(0)).toBe(4);
    const { sim } = setup();
    sim.sandbox = { slots: [0], instant: true, aiActive: false, reveal: false };
    expect(sim.eraOf(0)).toBe(4);
    expect(sim.eraOf(1)).toBe(1);
    // no Sandbox o avanço é livre (para ver o visual de cada era)
    expect(sim.applyCommand(0, { type: 'advance_era' })).toBeNull();
    sim.step();
    sim.step();
    expect(sim.visualEra(0)).toBe(2);
  });
});
