import { describe, expect, it } from 'vitest';
import { BUILDINGS, TICK_RATE, UNITS, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { MODS, MOD_CANCEL_REFUND, checkModernize, equipmentTag, productionStandard, refitSlots, unitStatLines } from '../sim/modernization.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import type { Building, Unit } from '../sim/types.ts';
import { NationalAI } from '../strategic/NationalAI.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { TECHNOLOGIES, TECH_IDS, researchBlocker, researchDailyProgress, researchEtaDays, type TechId } from '../strategic/technologies.ts';
import { flatMap } from './helpers.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};
const runDays = (sim: NationalSimulation, days: number) => {
  for (let i = 0; i < days; i++) sim.stepDay();
};

/** Camada nacional de teste: pesquisas e verba de obras controladas pelo teste. */
function link(techs: TechId[] = [], fundUsd = 50e6) {
  const state = { techs: [...techs] as string[], fund: fundUsd, ledger: [] as number[] };
  const l: NationalLink = {
    techs: () => state.techs,
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => state.fund,
    chargeWorks: (_s, usd) => {
      if (state.fund < usd) return false;
      state.fund -= usd;
      state.ledger.push(usd);
      return true;
    },
    refundWorks: (_s, usd) => {
      state.fund += usd;
      state.ledger.push(-usd);
    },
  };
  return { state, link: l };
}

/** Partida plana com recursos fartos, base militar e fábrica prontas para o jogador 0. */
function base(techs: TechId[] = [], fundUsd = 50e6) {
  const sim = new Simulation({ map: flatMap(40), playerCount: 2, startingUnits: [] });
  const nat = link(techs, fundUsd);
  sim.national = nat.link;
  const p = sim.players[0]!;
  for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 5000;
  p.oilReserve = 5000;
  const place = (type: BuildingType): Building => {
    for (let cy = 1; cy < 16; cy++)
      for (let cx = 1; cx < 16; cx++) {
        if (sim.applyCommand(0, { type: 'build', buildingType: type, cx, cy }) === null) return sim.buildings.find((b) => b.type === type && b.owner === 0)!;
      }
    throw new Error(`sem lugar para ${type}`);
  };
  const barracks = place('barracks');
  const factory = place('factory');
  run(sim, Math.max(BUILDINGS.barracks.buildSeconds, BUILDINGS.factory.buildSeconds) * TICK_RATE + 2);
  expect(barracks.progress).toBe(1);
  expect(factory.progress).toBe(1);
  return { sim, nat, barracks, factory, p };
}

/** Unidade parada ao lado do edifício (dentro do alcance de modernização). */
const beside = (sim: Simulation, b: Building, type: Unit['type'], mods: Unit['mods'] = []) =>
  sim.addUnit(type, 0, { x: b.pos.x + (BUILDINGS[b.type].size * sim.map.cellSize) / 2 + 1.5, y: b.pos.y }, 1, mods);

describe('Fase 5 — árvore de pesquisa', () => {
  it('toda tecnologia tem custo, duração mínima, categoria e pré-requisitos válidos (sem ciclos)', () => {
    for (const id of TECH_IDS) {
      const t = TECHNOLOGIES[id];
      expect(t.cost).toBeGreaterThan(0);
      expect(t.minDays).toBeGreaterThan(0);
      expect(t.unlocks.length).toBeGreaterThan(0);
      for (const p of t.prereqs) expect(TECH_IDS).toContain(p);
    }
    // ordem topológica existe: dá para concluir tudo respeitando os pré-requisitos
    const done: TechId[] = [];
    for (let guard = 0; guard < TECH_IDS.length && done.length < TECH_IDS.length; guard++) {
      for (const id of TECH_IDS) if (!done.includes(id) && researchBlocker(id, done) === null) done.push(id);
    }
    expect(done).toHaveLength(TECH_IDS.length);
  });

  it('pré-requisito ausente bloqueia o início (mesmo motivo no servidor e no painel)', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 1, 'realistic');
    expect(sim.setResearch(0, 'guided_munitions')).toBe('Requer: Comunicações digitais');
    expect(sim.nation(0)!.research.current).toBeNull();
    expect(sim.setResearch(0, 'efficient_propulsion')).toMatch(/Automação industrial.*Perfuração avançada/);
    expect(sim.setResearch(0, 'digital_comms')).toBeNull();
  });

  it('o orçamento de P&D vira investimento no projeto; sem projeto é gasto sem retorno', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 1, 'realistic');
    const n = sim.nation(0)!;
    runDays(sim, 10);
    expect(n.research.idleUsd).toBeGreaterThan(0);
    const idle = n.research.idleUsd;
    sim.setResearch(0, 'logistics');
    runDays(sim, 10);
    expect(n.research.idleUsd).toBe(idle);
    const dailyRd = (n.budget.researchPct / 100) * n.gdpUsd / 365;
    // o PIB varia dia a dia: o investido acompanha a verba diária de P&D (margem de 1%)
    expect(n.research.invested.logistics / 10 / dailyRd).toBeCloseTo(1, 2);
    expect(n.research.progress.logistics).toBeCloseTo(10 * researchDailyProgress('logistics', n.budget.researchPct).perDay, 6);
  });

  it('pausar e trocar de projeto mantém progresso e investido; a duração mínima limita o ritmo', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'JPN' }], 1, 'realistic');
    const n = sim.nation(0)!;
    sim.setBudget(0, { ...n.budget, researchPct: 2 });
    expect(researchDailyProgress('automation', 2).capped).toBe(true);
    sim.setResearch(0, 'modular_construction');
    const half = Math.floor(TECHNOLOGIES.modular_construction.minDays / 2);
    runDays(sim, half);
    const p = n.research.progress.modular_construction;
    const inv = n.research.invested.modular_construction;
    expect(p).toBeCloseTo(half / TECHNOLOGIES.modular_construction.minDays, 6);
    sim.setResearch(0, null);
    runDays(sim, 15);
    expect(n.research.progress.modular_construction).toBe(p);
    sim.setResearch(0, 'logistics');
    runDays(sim, 5);
    sim.setResearch(0, 'modular_construction');
    expect(n.research.progress.modular_construction).toBe(p);
    expect(n.research.invested.modular_construction).toBe(inv);
    const eta = researchEtaDays('modular_construction', p, 2);
    runDays(sim, eta);
    expect(n.research.done).toContain('modular_construction');
    expect(n.research.doneDay.modular_construction).toBe(sim.day);
  });

  it('a IA nacional só escolhe pesquisas com pré-requisitos prontos', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'USA' }], 3, 'realistic');
    const ai = new NationalAI(0);
    for (let d = 0; d < 3000; d++) {
      if (sim.day % 30 === 0) {
        const r = ai.think(sim);
        if (r.budget) sim.setBudget(0, r.budget);
        if (r.research !== undefined) expect(sim.setResearch(0, r.research)).toBeNull();
      }
      sim.stepDay();
    }
    const n = sim.nation(0)!;
    expect(n.research.done.length).toBeGreaterThan(3);
    for (const id of n.research.done) for (const pre of TECHNOLOGIES[id].prereqs) expect(n.research.doneDay[pre]!).toBeLessThan(n.research.doneDay[id]!);
  });

  it('estado da pesquisa persiste no salvar/carregar', () => {
    const a = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 1, 'realistic');
    a.setResearch(0, 'digital_comms');
    runDays(a, 5);
    const saved = JSON.parse(JSON.stringify(a.saveResearch()));
    const b = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 1, 'realistic');
    b.loadResearch(saved);
    expect(b.nation(0)!.research).toEqual(a.nation(0)!.research);
    expect(b.nation(0)!.research.current).toBe('digital_comms');
  });
});

describe('Fase 5 — modernização de tropas', () => {
  it('pesquisa concluída não altera tropas já em campo', () => {
    const { sim, nat, barracks } = base();
    const inf = beside(sim, barracks, 'infantry');
    nat.state.techs.push('composite_armor', 'guided_munitions');
    run(sim, TICK_RATE * 3);
    expect(inf.maxHp).toBe(UNITS.infantry.maxHp);
    expect(inf.mods).toEqual([]);
  });

  it('modernizar exige a pesquisa e uma instalação compatível por perto', () => {
    const { sim, nat, barracks, factory } = base();
    const tank = beside(sim, factory, 'tank');
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [tank.id], mod: 'composite_armor' })).toBe('Pesquisa necessária: Blindagem composta');
    nat.state.techs.push('composite_armor');
    // tanque ao lado da base militar: a instalação certa é a fábrica
    const far = beside(sim, barracks, 'tank');
    far.pos = { x: 70, y: 70 };
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [far.id], mod: 'composite_armor' })).toMatch(/Leve a unidade para perto de uma Fábrica/);
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [tank.id], mod: 'body_armor' })).toMatch(/não se aplica/);
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [tank.id], mod: 'composite_armor' })).toBeNull();
  });

  it('cobra materiais e verba, deixa a unidade indisponível e instala o pacote ao fim', () => {
    const { sim, nat, factory, p } = base(['composite_armor']);
    const tank = beside(sim, factory, 'tank');
    tank.hp = 200;
    const iron = p.resources.iron;
    const fund = nat.state.fund;
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [tank.id], mod: 'composite_armor' })).toBeNull();
    expect(p.resources.iron).toBe(iron - MODS.composite_armor.retrofit.cost.iron!);
    expect(nat.state.fund).toBe(fund - MODS.composite_armor.retrofit.usd);
    expect(tank.refit?.mod).toBe('composite_armor');
    // indisponível: não aceita ordens de movimento
    expect(sim.applyCommand(0, { type: 'move', unitIds: [tank.id], x: 60, y: 60 })).toBe('Nenhuma unidade válida');
    const at = { ...tank.pos };
    run(sim, MODS.composite_armor.retrofit.seconds * TICK_RATE - 1);
    expect(tank.mods).toEqual([]);
    expect(tank.pos).toEqual(at);
    run(sim, 1);
    expect(tank.refit).toBeNull();
    expect(tank.mods).toEqual(['composite_armor']);
    expect(tank.maxHp).toBe(Math.round(UNITS.tank.maxHp * 1.25));
    expect(tank.hp).toBeCloseTo(250); // a vida sobe na mesma proporção, sem cura
    expect(sim.drainEvents().some((e) => e.type === 'unit_modernized' && e.id === tank.id)).toBe(true);
    // o ganho aponta para o pacote e para a pesquisa de origem
    const hp = unitStatLines('tank', tank.mods, tank.maxHp).find((l) => l.key === 'hp')!;
    expect(hp.sources).toEqual([{ mod: 'composite_armor', label: 'Blindagem composta', tech: 'Blindagem composta', text: '+25%' }]);
    expect(equipmentTag('tank', tank.mods)).toBe('Ger. 1/5 · BC');
  });

  it('cada pacote muda só a unidade que o recebeu (equipamento novo e antigo convivem)', () => {
    const { sim, factory } = base(['guided_munitions', 'digital_comms']);
    const modern = beside(sim, factory, 'tank', ['guided_munitions', 'digital_radio']);
    const old = beside(sim, factory, 'tank');
    expect(sim.sightOf(modern)).toBe(UNITS.tank.sight + 2);
    expect(sim.sightOf(old)).toBe(UNITS.tank.sight);
  });

  it('cancelar devolve metade; instalação destruída cancela a obra', () => {
    const { sim, nat, barracks, p } = base(['composite_armor']);
    const a = beside(sim, barracks, 'infantry');
    const b = beside(sim, barracks, 'infantry');
    p.resources.iron = 100; // abaixo da capacidade: o reembolso não é cortado pelo armazém
    const iron = p.resources.iron;
    const fund = nat.state.fund;
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [a.id, b.id], mod: 'body_armor' })).toBeNull();
    expect(sim.applyCommand(0, { type: 'cancel_modernize', unitIds: [a.id] })).toBeNull();
    const c = MODS.body_armor.retrofit;
    expect(p.resources.iron).toBe(iron - 2 * c.cost.iron! + Math.floor(c.cost.iron! * MOD_CANCEL_REFUND));
    expect(nat.state.fund).toBe(fund - 2 * c.usd + Math.floor(c.usd * MOD_CANCEL_REFUND));
    barracks.hp = 0;
    run(sim, 1);
    expect(b.refit).toBeNull();
    expect(b.mods).toEqual([]);
    expect(sim.drainEvents().some((e) => e.type === 'modernize_cancelled' && e.id === b.id && e.reason === 'facility_lost')).toBe(true);
  });

  it('a instalação tem baias limitadas: parte da força fica indisponível de cada vez', () => {
    const { sim, barracks } = base(['composite_armor']);
    const slots = refitSlots(barracks.level);
    const troops = Array.from({ length: slots + 1 }, () => beside(sim, barracks, 'infantry'));
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: troops.map((u) => u.id), mod: 'body_armor' })).toBeNull();
    expect(troops.filter((u) => u.refit).length).toBe(slots);
    const last = troops.find((u) => !u.refit)!;
    expect(checkModernize('body_armor', sim.modernizeContext(last)).short).toBe('sem vaga');
  });

  it('sem verba de obras nada é cobrado', () => {
    const { sim, factory, p } = base(['composite_armor'], 1000);
    const tank = beside(sim, factory, 'tank');
    const iron = p.resources.iron;
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [tank.id], mod: 'composite_armor' })).toMatch(/Verba de obras insuficiente/);
    expect(p.resources.iron).toBe(iron);
    expect(tank.refit).toBeNull();
  });

  it('unidade nova sai com o padrão vigente pagando a diferença; pedido anterior à pesquisa não ganha o pacote', () => {
    const { sim, nat, factory, p } = base();
    p.recruits = 5;
    expect(sim.applyCommand(0, { type: 'produce', buildingId: factory.id, unitType: 'tank' })).toBeNull();
    nat.state.techs.push('composite_armor');
    const iron = p.resources.iron;
    expect(sim.applyCommand(0, { type: 'produce', buildingId: factory.id, unitType: 'tank' })).toBeNull();
    const std = productionStandard('tank', nat.state.techs);
    expect(std.mods).toEqual(['composite_armor']);
    expect(p.resources.iron).toBe(iron - UNITS.tank.cost.iron! - std.extra.iron!);
    run(sim, UNITS.tank.buildSeconds * TICK_RATE * 3);
    const tanks = sim.units.filter((u) => u.type === 'tank' && u.owner === 0).sort((a, b) => a.id - b.id);
    expect(tanks.map((u) => u.mods)).toEqual([[], ['composite_armor']]);
    expect(tanks[1]!.maxHp).toBe(Math.round(UNITS.tank.maxHp * 1.25));
  });

  it('equipamento e modernização em andamento persistem no salvar/carregar', () => {
    const { sim, factory } = base(['composite_armor', 'sensor_optics', 'digital_comms']);
    const t1 = beside(sim, factory, 'tank', ['thermal_optics']);
    const t2 = beside(sim, factory, 'apc');
    expect(sim.applyCommand(0, { type: 'modernize', unitIds: [t2.id], mod: 'composite_armor' })).toBeNull();
    run(sim, 10);
    const copy = Simulation.deserialize(sim.serialize());
    copy.national = sim.national;
    const u1 = copy.entities.get(t1.id) as Unit;
    const u2 = copy.entities.get(t2.id) as Unit;
    expect(u1.mods).toEqual(['thermal_optics']);
    expect(u2.refit).toEqual(t2.refit);
    run(sim, 600);
    run(copy, 600);
    expect((copy.entities.get(t2.id) as Unit).mods).toEqual(t2.mods);
    expect(copy.serialize()).toBe(sim.serialize());
  });

  it('valida a forma dos comandos de modernização', () => {
    expect(parseCommand({ type: 'modernize', unitIds: [1, 1, 2], mod: 'composite_armor' })).toEqual({ type: 'modernize', unitIds: [1, 2], mod: 'composite_armor' });
    expect(parseCommand({ type: 'modernize', unitIds: [1], mod: 'laser' })).toBeNull();
    expect(parseCommand({ type: 'modernize', unitIds: [], mod: 'composite_armor' })).toBeNull();
    expect(parseCommand({ type: 'cancel_modernize', unitIds: [3] })).toEqual({ type: 'cancel_modernize', unitIds: [3] });
  });
});
