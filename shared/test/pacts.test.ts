import { describe, expect, it } from 'vitest';
import { PACT } from '../strategic/Diplomacy.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { TICK_RATE } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { giftFreightUsd } from '../sim/trade.ts';
import { flatMap } from './helpers.ts';

/** Pactos no teatro, vitória do time e envio ao aliado (06/11). */

function national(players = 3) {
  const nat = new NationalSimulation(
    ['BRA', 'ARG', 'CHL', 'PER'].slice(0, players).map((countryId, slot) => ({ slot, countryId })),
    7,
    'parity',
  );
  const pacts: string[] = [];
  const peace: string[] = [];
  const wars: string[] = [];
  const stock = { supplies: 5000, food: 0, wood: 0, stone: 0, iron: 0, oil: 5000, coal: 0 };
  nat.attachTheater({
    resources: () => ({ ...stock }),
    spend: () => undefined,
    setWar: (a, b) => wars.push(`${a}:${b}`),
    stats: (slot) => ({ buildings: {}, military: slot === 2 ? 40 : 5, workers: 0, food: 0 }),
    setPact: (a, b, kind) => pacts.push(`${a}:${b}:${kind}`),
    setPeace: (a, b) => peace.push(`${a}:${b}`),
  });
  for (const n of nat.nations) n.works.fundUsd = 1e9;
  return { nat, pacts, peace, wars };
}

const fund = (nat: NationalSimulation, slot: number) => nat.nation(slot)!.works.fundUsd;

describe('Pactos entre nações do teatro', () => {
  it('humano recebe convite, aceita; quem propôs paga; romper custa indenização à outra parte', () => {
    const { nat, pacts } = national();
    const fee = nat.diplomacy.pactFeeUsd(0, 'nonaggression');
    expect(fee).toBeGreaterThan(0);
    expect(nat.diplomaticAction(0, { type: 'propose', treaty: 'nonaggression', partner: 1 })).toBeNull();
    const offer = nat.diplomacy.offers[0]!;
    expect(offer).toMatchObject({ from: 0, to: 1, treaty: 'nonaggression' });
    // só quem recebeu responde (KAC)
    expect(nat.diplomaticAction(2, { type: 'answer_offer', offerId: offer.id, accept: true })).toMatch(/inválido/);
    const before = fund(nat, 0);
    expect(nat.diplomaticAction(1, { type: 'answer_offer', offerId: offer.id, accept: true })).toBeNull();
    expect(before - fund(nat, 0)).toBe(fee);
    expect(pacts).toContain('0:1:nonaggression');
    // guerra bloqueada enquanto o pacto vale
    expect(nat.diplomaticAction(0, { type: 'declare_war', target: 1 })).toMatch(/pacto em vigor/);
    // romper: indenização sai de quem rompe e vai para a outra parte
    const t = nat.diplomacy.pactBetween(0, 1)!;
    const ind = nat.diplomacy.pactIndemnityUsd(1, 'nonaggression');
    const a0 = fund(nat, 0);
    const a1 = fund(nat, 1);
    expect(nat.diplomaticAction(1, { type: 'cancel_treaty', treatyId: t.id })).toBeNull();
    expect(a1 - fund(nat, 1)).toBe(ind);
    expect(fund(nat, 0) - a0).toBe(ind);
    expect(pacts).toContain('0:1:null');
    expect(nat.diplomacy.pactBetween(0, 1)).toBeUndefined();
    expect(nat.diplomaticAction(0, { type: 'declare_war', target: 1 })).toBeNull();
  });

  it('sem caixa para a indenização não rompe; convite sem resposta expira', () => {
    const { nat } = national();
    nat.diplomaticAction(0, { type: 'propose', treaty: 'alliance', partner: 1 });
    nat.diplomaticAction(1, { type: 'answer_offer', offerId: nat.diplomacy.offers[0]!.id, accept: true });
    const t = nat.diplomacy.pactBetween(0, 1)!;
    expect(t.type).toBe('alliance');
    nat.nation(0)!.works.fundUsd = 0;
    expect(nat.diplomaticAction(0, { type: 'cancel_treaty', treatyId: t.id })).toMatch(/indenização/);
    nat.diplomaticAction(0, { type: 'propose', treaty: 'nonaggression', partner: 2 });
    nat.nation(0)!.works.fundUsd = 1e9;
    nat.bots.clear();
    expect(nat.diplomaticAction(0, { type: 'propose', treaty: 'nonaggression', partner: 2 })).toBeNull();
    expect(nat.diplomacy.offers.length).toBe(1);
    for (let d = 0; d < PACT.offerDays + 1; d++) nat.stepDay();
    expect(nat.diplomacy.offers.length).toBe(0);
  });

  it('firmar em guerra faz a paz; bot avalia na hora (o mais forte recusa não agressão)', () => {
    const { nat, peace } = national();
    nat.bots.add(1);
    nat.bots.add(2);
    expect(nat.diplomaticAction(0, { type: 'declare_war', target: 1 })).toBeNull();
    expect(nat.diplomaticAction(0, { type: 'propose', treaty: 'nonaggression', partner: 1 })).toBeNull();
    expect(nat.diplomacy.pactBetween(0, 1)?.type).toBe('nonaggression');
    expect(peace).toContain('0:1');
    expect(nat.diplomacy.atWar(0, 1)).toBe(false);
    // o bot 2 tem 40 tropas contra 5: não precisa de pacto
    expect(nat.diplomaticAction(0, { type: 'propose', treaty: 'nonaggression', partner: 2 })).toBeNull();
    expect(nat.diplomacy.pactBetween(0, 2)).toBeUndefined();
  });

  it('modo time: nenhum pacto novo e a aliança de time não se rompe', () => {
    const { nat } = national();
    nat.diplomacy.teamMode = true;
    nat.diplomacy.teamAlliance(0, 1, 0);
    expect(nat.diplomaticAction(0, { type: 'propose', treaty: 'nonaggression', partner: 2 })).toMatch(/times/);
    const t = nat.diplomacy.pactBetween(0, 1)!;
    expect(nat.diplomaticAction(0, { type: 'cancel_treaty', treatyId: t.id })).toMatch(/time/);
    expect(nat.diplomaticAction(0, { type: 'declare_war', target: 1 })).toMatch(/time/);
  });
});

function theaterSim(players = 3) {
  const map = flatMap(48);
  map.spawns = [
    { cx: 6, cy: 6 },
    { cx: 40, cy: 6 },
    { cx: 6, cy: 40 },
  ].slice(0, players);
  return new Simulation({ map, playerCount: players, startingUnits: [] });
}

describe('Teatro: times, visão compartilhada e última aliança', () => {
  it('vitória do time: acaba quando só sobra um time, e o time inteiro vence', () => {
    const sim = theaterSim();
    sim.teams = [1, 1, 2];
    sim.setAlliance(0, 1, true);
    sim.surrender(0);
    expect(sim.ended).toBe(false);
    sim.surrender(2);
    expect(sim.ended).toBe(true);
    expect(sim.winners.sort()).toEqual([0, 1]);
  });

  it('aliados veem o que o outro vê; pacto de não agressão não compartilha visão', () => {
    const sim = theaterSim();
    const far = sim.grid.cellCenter({ cx: 40, cy: 8 });
    expect(sim.isVisibleTo(0, far)).toBe(false);
    sim.setPact(0, 1, true);
    sim.step();
    expect(sim.isVisibleTo(0, far)).toBe(false);
    sim.setPact(0, 1, false);
    sim.setAlliance(0, 1, true);
    sim.step();
    expect(sim.isVisibleTo(0, far)).toBe(true);
    // não passa adiante a visão de um terceiro
    sim.setAlliance(1, 2, true);
    sim.step();
    expect(sim.isVisibleTo(0, sim.grid.cellCenter({ cx: 6, cy: 42 }))).toBe(false);
  });

  it('sem times: se só sobram nações com pacto entre si, a simulação aponta os pares a desfazer', () => {
    const sim = theaterSim();
    sim.setAlliance(0, 1, true);
    expect(sim.lastPactPairs()).toBeNull();
    sim.surrender(2);
    expect(sim.ended).toBe(false);
    expect(sim.lastPactPairs()).toEqual([[0, 1]]);
    sim.teams = [1, 1, 2];
    expect(sim.lastPactPairs()).toBeNull();
  });

  it('auxílio de tropas e envio de recursos só para aliado; envio exige transporte e cobra o frete', () => {
    const sim = theaterSim();
    const charged: number[] = [];
    sim.setTradeLink({ atWar: () => false, sanctioned: () => false, spendable: () => 1e9, pay: (_s, usd) => charged.push(usd), partnerName: (id) => `P${id}` });
    const inf = sim.addUnit('infantry', 0, sim.grid.cellCenter({ cx: 8, cy: 8 }));
    expect(sim.applyCommand(0, { type: 'aid_ally', unitIds: [inf.id], ally: 1 })).toMatch(/aliado/);
    expect(sim.applyCommand(0, { type: 'trade_gift', to: 1, items: [{ resource: 'wood', quantity: 50 }], mode: 'road' })).toMatch(/aliado/);
    sim.setAlliance(0, 1, true);
    expect(sim.applyCommand(0, { type: 'aid_ally', unitIds: [inf.id], ally: 1 })).toBeNull();
    expect(inf.order.kind).toBe('attackMove');
    // sem Terminal Comercial, sem Porto, sem aeroporto: o motivo diz o que falta
    expect(sim.applyCommand(0, { type: 'trade_gift', to: 1, items: [{ resource: 'wood', quantity: 50 }], mode: 'road' })).toMatch(/Terminal Comercial/);
    expect(sim.applyCommand(0, { type: 'trade_gift', to: 1, items: [{ resource: 'wood', quantity: 50 }], mode: 'sea' })).toMatch(/Porto/);
    expect(sim.applyCommand(0, { type: 'trade_gift', to: 1, items: [{ resource: 'wood', quantity: 50 }], mode: 'air' })).toMatch(/Base Aérea|aeroporto/);
    // com terminais ligados por estrada: sai do estoque, frete cobrado e chega ao aliado
    const hq0 = sim.hqOf(0)!;
    const hq1 = sim.hqOf(1)!;
    const m0 = sim.addBuilding('market', 0, { cx: hq0.cell.cx + 4, cy: hq0.cell.cy }, 1);
    const m1 = sim.addBuilding('market', 1, { cx: hq1.cell.cx - 4, cy: hq1.cell.cy }, 1);
    const cells: { cx: number; cy: number }[] = [];
    for (let x = m0.cell.cx; x <= m1.cell.cx + 1; x++) cells.push({ cx: x, cy: m0.cell.cy - 1 });
    for (const p of [0, 1] as const) {
      sim.explored[p] = new Uint8Array(48 * 48).fill(1);
      sim.players[p]!.resources.stone = 2000;
      sim.players[p]!.resources.wood = 500;
    }
    // cada lado pavimenta a sua parte (rodovia nunca entra no território do outro)
    for (const p of [0, 1] as const) {
      const part = cells.filter((c) => (p === 1 ? sim.territoryOwner(c.cx, c.cy) === 1 : sim.territoryOwner(c.cx, c.cy) !== 1));
      for (let i = 0; i < part.length; i += 30) expect(sim.applyCommand(p, { type: 'build_road', cells: part.slice(i, i + 30), highway: true })).toBeNull();
    }
    const wood0 = sim.players[0]!.resources.wood;
    const wood1 = sim.players[1]!.resources.wood;
    expect(sim.applyCommand(0, { type: 'trade_gift', to: 1, items: [{ resource: 'wood', quantity: 50 }], mode: 'road' })).toBeNull();
    expect(wood0 - sim.players[0]!.resources.wood).toBe(50);
    expect(charged).toContain(-giftFreightUsd([{ resource: 'wood', quantity: 50 }], 'road'));
    for (let t = 0; t < 120 * TICK_RATE && sim.players[1]!.resources.wood < wood1 + 50; t++) sim.step();
    expect(sim.players[1]!.resources.wood).toBeGreaterThanOrEqual(wood1 + 50);
  });
});
