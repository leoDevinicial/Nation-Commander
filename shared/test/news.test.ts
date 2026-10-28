import { describe, expect, it } from 'vitest';
import { linkEvent } from '../strategic/eventLinks.ts';
import { NationalSimulation, type NationalEvent } from '../strategic/NationalSimulation.ts';
import { meet, theater } from './helpers.ts';

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

const run = (sim: NationalSimulation, days: number, out: NationalEvent[]) => {
  for (let i = 0; i < days; i++) {
    sim.stepDay();
    out.push(...sim.drainEvents());
  }
};

/** Guerra do Brasil contra a Argentina, aliada dos EUA: rompe o comércio e gera sanções contra o Brasil. */
function warScenario() {
  const { sim, npc } = setup();
  theater(sim);
  const usa = npc('USA').slot;
  meet(sim, 1, usa);
  sim.diplomacy.treaties.push({ id: 900, type: 'alliance', a: 1, b: usa, startDay: 0, endDay: 9999 });
  sim.diplomacy.treaties.push({ id: 901, type: 'trade', a: 0, b: 1, startDay: 0, endDay: 9999 });
  expect(sim.diplomaticAction(0, { type: 'declare_war', target: 1 })).toBeNull();
  return { sim, usa };
}

const diplo = (events: NationalEvent[], type: string) => events.filter((e): e is Extract<NationalEvent, { type: 'diplomacy' }> => e.type === 'diplomacy' && e.event.type === type);

describe('livro de eventos (Fase 9)', () => {
  it('todo evento recebe id único e crescente, e as ligações apontam só para eventos anteriores existentes', () => {
    const { sim } = warScenario();
    const events = sim.drainEvents();
    run(sim, 400, events);
    const ids = events.map((e) => e.id!);
    expect(ids.every((id) => typeof id === 'number')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    const known = new Set(ids);
    for (const e of events) {
      for (const ref of [...(e.causeIds ?? []), ...(e.contextIds ?? [])]) {
        expect(known.has(ref)).toBe(true);
        expect(ref).toBeLessThan(e.id!);
      }
    }
  });

  it('as causas registradas pela diplomacia viram ids do livro: guerra → tratado rompido e sanções', () => {
    const { sim } = warScenario();
    const events = sim.drainEvents();
    const war = diplo(events, 'war_declared')[0]!;
    const ended = diplo(events, 'treaty_ended')[0]!;
    const sanctions = diplo(events, 'treaty_signed').find((e) => e.event.type === 'treaty_signed' && e.event.treaty.type === 'sanctions')!;
    expect(ended.causeIds).toEqual([war.id]);
    expect(sanctions.causeIds).toEqual([war.id]);
  });

  it('ataque registrado depois da guerra cita a declaração como contexto, mesmo sem drenar antes', () => {
    const { sim } = warScenario();
    sim.registerTacticalEvents([{ type: 'air_strike', owner: 0, victim: 1, buildingType: 'hq', damage: 40, oilLost: 0, destroyed: false } as never]);
    const events = sim.drainEvents();
    const war = diplo(events, 'war_declared')[0]!;
    const strike = events.find((e) => e.type === 'military_strike')!;
    expect(strike.contextIds).toEqual([war.id]);
    expect(strike.causeIds).toBeUndefined();
  });

  it('cadeia causal completa: guerra → sanções → protesto com o fator "sanções" ligado ao tratado', () => {
    const { sim } = warScenario();
    const events = sim.drainEvents();
    // governo impopular: impostos altos e serviços cortados
    const b = sim.nation(0)!.budget;
    expect(sim.setBudget(0, { ...b, taxPct: b.taxPct + 15, socialPct: 0, healthPct: 0, educationPct: 0 })).toBeNull();
    run(sim, 500, events);
    const war = diplo(events, 'war_declared')[0]!;
    const sanctions = diplo(events, 'treaty_signed').find((e) => e.event.type === 'treaty_signed' && e.event.treaty.type === 'sanctions')!;
    expect(sanctions.causeIds).toEqual([war.id]);
    const treaty = sanctions.event.type === 'treaty_signed' ? sanctions.event.treaty : null;
    const protests = events.filter((e): e is Extract<NationalEvent, { type: 'protest' }> => e.type === 'protest' && e.slot === 0);
    // enquanto as sanções valem, o fator "sanções" pesa na aprovação e o protesto cita o tratado
    const during = protests.filter((e) => e.day < treaty!.endDay);
    const after = protests.filter((e) => e.day > treaty!.endDay);
    expect(during.length).toBeGreaterThan(0);
    for (const p of during) expect(p.causeIds).toContain(sanctions.id);
    // depois que expiram, deixam de ser citadas
    expect(after.length).toBeGreaterThan(0);
    for (const p of after) expect(p.causeIds ?? []).not.toContain(sanctions.id);
  });

  it('sem fator registrado não há causa: protesto sem sanções não cita tratado nenhum', () => {
    const journal: NationalEvent[] = [{ id: 1, type: 'policy', day: 0, slot: 0, text: 'x', tone: 'info' }];
    const links = linkEvent({ type: 'protest', day: 10, slot: 0, approval: 20, causes: [{ key: 'tax', label: 'Impostos', value: -8 }] }, journal, {
      day: 10,
      approvalFactors: [{ key: 'tax', label: 'Impostos', value: -8 }],
      sanctionsAgainst: [],
    });
    expect(links).toEqual({ causeIds: [], contextIds: [] });
  });

  it('melhora de indicador não puxa contexto de crise; piora econômica só cita eventos do mesmo país e da janela', () => {
    const journal: NationalEvent[] = [
      { id: 1, type: 'budget_changed', day: 0, slot: 1, deficitPctGdp: 5 },
      { id: 2, type: 'budget_changed', day: 10, slot: 0, deficitPctGdp: 6 },
      { id: 3, type: 'nuclear_shock', day: 20, slot: 1, victim: 0, level: 1 },
    ];
    const ctx = { day: 30, approvalFactors: [], sanctionsAgainst: [] };
    expect(linkEvent({ type: 'threshold', day: 30, slot: 0, indicator: 'growth', value: 2, threshold: 0, direction: 'up' }, journal, ctx)).toEqual({ causeIds: [], contextIds: [] });
    expect(linkEvent({ type: 'threshold', day: 30, slot: 0, indicator: 'debt', value: 91, threshold: 90, direction: 'up' }, journal, ctx)).toEqual({ causeIds: [], contextIds: [2, 3] });
    // fora da janela de um ano, o orçamento antigo não conta
    expect(linkEvent({ type: 'threshold', day: 380, slot: 0, indicator: 'debt', value: 91, threshold: 90, direction: 'up' }, journal, { ...ctx, day: 380 }).contextIds).toEqual([3]);
  });

  it('salvar e carregar preserva o livro: os ids continuam e as ligações seguem válidas', () => {
    const { sim } = warScenario();
    sim.drainEvents();
    const copy = setup().sim;
    copy.load(sim.toSave());
    expect(copy.journalEvents().map((e) => e.id)).toEqual(sim.journalEvents().map((e) => e.id));
    const strike = { type: 'air_strike', owner: 0, victim: 1, buildingType: 'hq', damage: 10, oilLost: 0, destroyed: false } as never;
    sim.registerTacticalEvents([strike]);
    copy.registerTacticalEvents([strike]);
    const a = sim.drainEvents().find((e) => e.type === 'military_strike')!;
    const b = copy.drainEvents().find((e) => e.type === 'military_strike')!;
    expect(b.id).toBe(a.id);
    expect(b.contextIds).toEqual(a.contextIds);
  });
});
