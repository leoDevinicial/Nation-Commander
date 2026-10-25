import { describe, expect, it } from 'vitest';
import { DIPLO, initialContact, warPreview } from '../strategic/Diplomacy.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TacticalAI } from '../sim/TacticalAI.ts';
import { flatMap, meet, theater } from './helpers.ts';

function setup() {
  const sim = new NationalSimulation(
    [
      { slot: 0, countryId: 'BRA' },
      { slot: 1, countryId: 'ARG' },
    ],
    7,
    'parity',
  );
  const npc = (id: string) => sim.npcs.find((n) => n.countryId === id)!;
  return { sim, npc };
}

const run = (sim: NationalSimulation, days: number) => {
  for (let i = 0; i < days; i++) sim.stepDay();
};
const diploEvents = (sim: NationalSimulation) => sim.drainEvents().flatMap((e) => (e.type === 'diplomacy' ? [e.event] : []));

describe('contato e descoberta', () => {
  it('regra inicial: mesma região diplomática e rivais do teatro se conhecem; os demais não', () => {
    const { sim, npc } = setup();
    expect(initialContact('BRA', 'USA')).toBe(true);
    expect(initialContact('BRA', 'JPN')).toBe(false);
    expect(sim.diplomacy.knows(0, npc('USA').slot)).toBe(true);
    expect(sim.diplomacy.knows(0, npc('JPN').slot)).toBe(false);
    expect(sim.diplomacy.knows(0, 1)).toBe(true);
    // África do Sul não tem vizinhos regionais no cenário: começa sem contatos
    const zaf = npc('ZAF').slot;
    expect(sim.npcs.filter((n) => n.slot !== zaf && sim.diplomacy.knows(zaf, n.slot))).toEqual([]);
  });

  it('país não descoberto não aceita negociação; missão de contato tem custo e prazo e gera evento rastreável', () => {
    const { sim, npc } = setup();
    const jpn = npc('JPN').slot;
    expect(sim.diplomaticAction(0, { type: 'propose', treaty: 'trade', partner: jpn })).toMatch(/não descoberto/);
    expect(sim.diplomaticAction(0, { type: 'set_mission', partner: jpn, active: true })).toMatch(/não descoberto/);
    const debt = sim.nation(0)!.debtUsd;
    expect(sim.diplomaticAction(0, { type: 'establish_contact', partner: jpn })).toBeNull();
    expect(sim.nation(0)!.debtUsd).toBeGreaterThan(debt);
    expect(sim.diplomaticAction(0, { type: 'establish_contact', partner: jpn })).toMatch(/em andamento/);
    run(sim, DIPLO.contactDays - 1);
    expect(sim.diplomacy.knows(0, jpn)).toBe(false);
    run(sim, 1);
    expect(sim.diplomacy.knows(0, jpn)).toBe(true);
    expect(sim.diplomacy.knows(jpn, 0)).toBe(true);
    const found = diploEvents(sim).filter((e) => e.type === 'discovered');
    expect(found.map((e) => e.type === 'discovered' && [e.by, e.target, e.via])).toContainEqual([0, jpn, 'contato']);
  });

  it('tratado assinado por um país conhecido revela a outra parte (notícia de terceiros), com causa registrada', () => {
    const { sim, npc } = setup();
    const jpn = npc('JPN').slot;
    // o Brasil não conhece o Japão; a Argentina (que o Brasil conhece) assina com ele e a notícia o revela
    meet(sim, 1, jpn);
    expect(sim.diplomaticAction(1, { type: 'propose', treaty: 'trade', partner: jpn })).toBeNull();
    const evs = diploEvents(sim);
    const signed = evs.find((e) => e.type === 'treaty_signed')!;
    const news = evs.find((e) => e.type === 'discovered' && e.by === 0 && e.target === jpn);
    expect(news).toBeDefined();
    expect(news!.causes).toEqual([signed.id]);
  });

  it('a visão de cada jogador não revela dados de quem ele não conhece nem orçamento sem missão', () => {
    const { sim, npc } = setup();
    const view = sim.viewFor(0);
    const jpn = view.nations.find((n) => n.countryId === 'JPN')!;
    expect(jpn.known).toBe(false);
    expect(jpn.intel).toBeNull();
    const usa = view.nations.find((n) => n.countryId === 'USA')!;
    expect(usa.known).toBe(true);
    expect(usa.intel).toBeNull(); // conhecido, mas sem missão: sem dados correntes
    expect(view.relations.some((r) => r.b === npc('JPN').slot)).toBe(false);
    sim.diplomaticAction(0, { type: 'set_mission', partner: usa.id, active: true });
    expect(sim.viewFor(0).nations.find((n) => n.id === usa.id)!.intel?.gdpUsd).toBeGreaterThan(0);
    // eventos sobre pares desconhecidos não chegam
    meet(sim, npc('JPN').slot, npc('IND').slot);
    sim.diplomaticAction(1, { type: 'establish_contact', partner: npc('IND').slot });
    const evs = sim.drainEvents();
    expect(sim.eventsFor(0, evs).some((e) => e.type === 'diplomacy' && e.event.type === 'contact_started')).toBe(false);
  });
});

describe('declaração de guerra', () => {
  it('declaração válida: custos cobrados uma única vez, tratados rompidos, eventos e combate liberado', () => {
    const { sim, npc } = setup();
    const t = theater(sim);
    const usa = npc('USA').slot;
    // a Argentina tem aliança com os EUA (governo da IA) e comércio com o Brasil
    const d = sim.diplomacy;
    meet(sim, 1, usa);
    d.treaties.push({ id: 900, type: 'alliance', a: 1, b: usa, startDay: 0, endDay: 999 });
    d.treaties.push({ id: 901, type: 'trade', a: 0, b: 1, startDay: 0, endDay: 999 });
    const me = sim.nation(0)!;
    const debt = me.debtUsd;
    const approval = me.approval;
    const preview = sim.warPreview(0, 1);
    expect(preview.blockers).toEqual([]);
    expect(preview.brokenTreaties.map((x) => x.id)).toEqual([901]);
    expect(preview.respondingAllies).toEqual([usa]);

    expect(sim.diplomaticAction(0, { type: 'declare_war', target: 1 })).toBeNull();
    expect(d.atWar(0, 1)).toBe(true);
    expect(t.wars).toEqual([[0, 1]]);
    expect(t.stocks.get(0)!.supplies).toBe(1000 - DIPLO.warSupplies);
    expect(t.stocks.get(0)!.oil).toBe(1000 - DIPLO.warOil);
    expect(me.debtUsd - debt).toBeCloseTo(preview.costs.usd, -3);
    expect(me.approval).toBeCloseTo(approval + DIPLO.warApproval);
    expect(d.active('trade', 0, 1)).toBeUndefined();
    expect(d.active('sanctions', usa, 0, true)).toBeDefined();
    const evs = diploEvents(sim);
    const war = evs.find((e) => e.type === 'war_declared')!;
    expect(evs.filter((e) => e.type === 'treaty_ended' && e.reason === 'war')[0]!.causes).toEqual([war.id]);
    expect(evs.find((e) => e.type === 'treaty_signed' && e.treaty.type === 'sanctions')!.causes).toEqual([war.id]);

    // segunda tentativa não cobra de novo
    expect(sim.diplomaticAction(0, { type: 'declare_war', target: 1 })).toMatch(/já estão em guerra/);
    expect(t.stocks.get(0)!.supplies).toBe(1000 - DIPLO.warSupplies);
  });

  it('recursos insuficientes bloqueiam com explicação e não alteram nada', () => {
    const { sim } = setup();
    const t = theater(sim, { supplies: 100, oil: 500 });
    const debt = sim.nation(0)!.debtUsd;
    expect(sim.diplomaticAction(0, { type: 'declare_war', target: 1 })).toMatch(/Suprimentos insuficientes.*150 necessários, 100 disponíveis/);
    expect(sim.diplomacy.atWar(0, 1)).toBe(false);
    expect(t.wars).toEqual([]);
    expect(t.stocks.get(0)!.supplies).toBe(100);
    expect(sim.nation(0)!.debtUsd).toBe(debt);
    expect(sim.drainEvents()).toEqual([]);
  });

  it('dívida acima do teto impede financiar a mobilização', () => {
    const { sim } = setup();
    theater(sim);
    const me = sim.nation(0)!;
    me.debtUsd = me.gdpUsd * 3;
    expect(sim.diplomaticAction(0, { type: 'declare_war', target: 1 })).toMatch(/financiar/);
  });

  it('alvo desconhecido é recusado antes de qualquer outra regra; governo conhecido fora do teatro também', () => {
    const { sim, npc } = setup();
    theater(sim);
    expect(sim.diplomaticAction(0, { type: 'declare_war', target: npc('JPN').slot })).toMatch(/não descoberto/);
    expect(sim.diplomaticAction(0, { type: 'declare_war', target: npc('USA').slot })).toMatch(/fora deste teatro/);
    expect(sim.diplomaticAction(0, { type: 'declare_war', target: 0 })).not.toBeNull();
  });

  it('a estimativa do cliente usa só o que ele conhece e marca os bloqueios', () => {
    const p = warPreview({
      actor: 0,
      target: 1,
      actorGdpUsd: 1e12,
      actorDebtPctGdp: 50,
      theaterStock: { supplies: 10, oil: 10 },
      targetInTheater: true,
      known: true,
      atWar: false,
      treaties: [],
      isNpc: () => false,
      relationWith: () => 0,
    });
    expect(p.costs.usd).toBe(2e9);
    expect(p.blockers).toHaveLength(2);
  });
});

describe('guerra no teatro tático', () => {
  it('sem guerra não há ataque ordenado, disparo automático nem fogo de torre', () => {
    const sim = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
    const a = sim.addUnit('tank', 0, { x: 20, y: 20 });
    const b = sim.addUnit('tank', 1, { x: 26, y: 20 });
    expect(sim.applyCommand(0, { type: 'attack', unitIds: [a.id], targetId: b.id })).toMatch(/Sem estado de guerra/);
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.drainEvents().some((e) => e.type === 'shot')).toBe(false);
    expect(b.hp).toBe(b.maxHp);
    sim.setWar(0, 1, true);
    expect(sim.applyCommand(0, { type: 'attack', unitIds: [a.id], targetId: b.id })).toBeNull();
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.drainEvents().some((e) => e.type === 'shot')).toBe(true);
  });

  it('a IA tática não ataca sem guerra: pede a declaração e guarda a mobilização', () => {
    const sim = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
    const ai = new TacticalAI(1);
    for (let i = 0; i < 10; i++) sim.addUnit('infantry', 1, { x: 50, y: 50 });
    sim.tick = 20 * 200;
    const cmds = ai.think(sim);
    expect(cmds.some((c) => c.type === 'attack_move' || c.type === 'attack')).toBe(false);
    expect(ai.wantsWarWith).toBe(0);
    // mesmo um comando de ataque direto da IA é recusado pelo motor
    const target = sim.units.find((u) => u.owner === 0) ?? sim.addUnit('infantry', 0, { x: 46, y: 50 });
    const mine = sim.units.find((u) => u.owner === 1)!;
    expect(sim.applyCommand(1, { type: 'attack', unitIds: [mine.id], targetId: target.id })).toMatch(/Sem estado de guerra/);
    sim.setWar(0, 1, true);
    expect(ai.think(sim).some((c) => c.type === 'attack_move')).toBe(true);
    expect(ai.wantsWarWith).toBeNull();
  });
});
