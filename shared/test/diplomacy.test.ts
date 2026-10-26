import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../data/countries.ts';
import { DIPLO } from '../strategic/Diplomacy.ts';
import { NationalSimulation, NPC_BASE_ID } from '../strategic/NationalSimulation.ts';
import { meet, theater } from './helpers.ts';

const run = (sim: NationalSimulation, days: number) => {
  for (let i = 0; i < days; i++) sim.stepDay();
};

function setup(mode: 'parity' | 'realistic' = 'parity') {
  const sim = new NationalSimulation(
    [
      { slot: 0, countryId: 'BRA' },
      { slot: 1, countryId: 'ARG' },
    ],
    3,
    mode,
  );
  const npc = (id: string) => sim.npcs.find((n) => n.countryId === id)!;
  return { sim, npc };
}

describe('diplomacia', () => {
  it('cria as demais nações como governos da IA e começa neutra, exceto a rivalidade no teatro', () => {
    const { sim, npc } = setup();
    expect(sim.npcs.length).toBe(COUNTRIES.length - 2);
    expect(sim.npcs.every((n) => n.slot >= NPC_BASE_ID)).toBe(true);
    expect(sim.diplomacy.relation(0, npc('USA').slot)).toBe(0);
    expect(sim.diplomacy.relation(0, 1)).toBe(DIPLO.theaterRivalry);
    expect(sim.diplomacy.factors(0, 1).map((f) => f.key)).toEqual(['rivalry']);
    theater(sim);
    expect(sim.diplomaticAction(0, { type: 'declare_war', target: 1 })).toBeNull();
    expect(sim.diplomacy.factors(0, 1).map((f) => f.key)).toEqual(['conflict']);
  });

  it('acordo comercial aceito melhora relação e crescimento; tem prazo e expira', () => {
    const { sim, npc } = setup();
    const usa = npc('USA');
    const growth0 = sim.diplomacy.growthEffects(0).trade;
    expect(sim.diplomaticAction(0, { type: 'propose', treaty: 'trade', partner: usa.slot })).toBeNull();
    const ev = sim.drainEvents().find((e) => e.type === 'diplomacy');
    expect(ev && ev.type === 'diplomacy' && ev.event.type).toBe('treaty_signed');
    expect(sim.diplomacy.relation(0, usa.slot)).toBe(DIPLO.tradeRelation);
    expect(sim.diplomacy.growthEffects(0).trade).toBeGreaterThan(growth0);
    run(sim, 2);
    expect(sim.nation(0)!.growthFactors.find((f) => f.key === 'trade')!.value).toBeGreaterThan(0);
    run(sim, DIPLO.tradeDays);
    expect(sim.diplomacy.active('trade', 0, usa.slot)).toBeUndefined();
    expect(sim.drainEvents().some((e) => e.type === 'diplomacy' && e.event.type === 'treaty_ended' && e.event.reason === 'expired')).toBe(true);
  });

  it('aliança exige relação alta e, recusada, informa os motivos e impõe espera', () => {
    const { sim, npc } = setup();
    const fra = npc('FRA');
    meet(sim, 0, fra.slot);
    theater(sim);
    sim.diplomaticAction(0, { type: 'declare_war', target: 1 });
    expect(sim.diplomaticAction(0, { type: 'propose', treaty: 'alliance', partner: fra.slot })).toBeNull();
    const rej = sim.drainEvents().find((e) => e.type === 'diplomacy' && e.event.type === 'proposal_rejected');
    expect(rej).toBeDefined();
    if (rej && rej.type === 'diplomacy' && rej.event.type === 'proposal_rejected') expect(rej.event.reasons.some((r) => r.key === 'war_risk')).toBe(true);
    expect(sim.diplomaticAction(0, { type: 'propose', treaty: 'alliance', partner: fra.slot })).toMatch(/aguarde/);
  });

  it('missões e ajuda constroem relação até permitir uma aliança, que envia ajuda militar', () => {
    const { sim, npc } = setup();
    const ind = npc('IND');
    meet(sim, 0, ind.slot);
    sim.diplomaticAction(0, { type: 'set_mission', partner: ind.slot, active: true });
    sim.diplomaticAction(0, { type: 'propose', treaty: 'trade', partner: ind.slot });
    run(sim, 200);
    sim.diplomaticAction(0, { type: 'send_aid', partner: ind.slot, pctGdp: 0.5 });
    expect(sim.diplomacy.relation(0, ind.slot)).toBeGreaterThanOrEqual(50);
    const supplyBefore = sim.nation(0)!.theaterSupplyPerSec;
    sim.diplomaticAction(0, { type: 'propose', treaty: 'alliance', partner: ind.slot });
    expect(sim.diplomacy.active('alliance', 0, ind.slot)).toBeDefined();
    expect(sim.nation(0)!.allianceAidPerSec).toBeGreaterThan(0);
    expect(sim.nation(0)!.theaterSupplyPerSec).toBeGreaterThan(supplyBefore);
    // em guerra, o adversário passa a ter um fator negativo com o aliado (não uma regra automática de inimizade)
    theater(sim);
    sim.diplomaticAction(0, { type: 'declare_war', target: 1 });
    expect(sim.diplomacy.factors(1, ind.slot).some((f) => f.key === 'enemy_ally')).toBe(true);
  });

  it('ajuda é paga com dívida e missões custam orçamento', () => {
    const { sim, npc } = setup();
    const n = sim.nation(0)!;
    const debt = n.debtUsd;
    sim.diplomaticAction(0, { type: 'send_aid', partner: npc('MEX').slot, pctGdp: 0.2 });
    expect(n.debtUsd).toBeCloseTo(debt + 0.002 * n.gdpUsd, -3);
    const spend = n.spendingUsd;
    sim.diplomaticAction(0, { type: 'set_mission', partner: npc('MEX').slot, active: true });
    expect(n.spendingUsd).toBeGreaterThan(spend);
  });

  it('pedido de sanções depende da relação com quem pede e com o alvo; sanções reduzem o crescimento do alvo', () => {
    const { sim, npc } = setup('realistic');
    const usa = npc('USA');
    // sem relação suficiente: recusa (e o pedido entra em espera de 60 dias)
    sim.diplomaticAction(0, { type: 'request_sanctions', partner: usa.slot, target: 1 });
    expect(sim.diplomacy.active('sanctions', usa.slot, 1, true)).toBeUndefined();
    expect(sim.diplomaticAction(0, { type: 'request_sanctions', partner: usa.slot, target: 1 })).toMatch(/aguarde/);
    // constrói relação com os EUA: comércio, missão e, por fim, ajuda
    sim.diplomaticAction(0, { type: 'propose', treaty: 'trade', partner: usa.slot });
    sim.diplomaticAction(0, { type: 'set_mission', partner: usa.slot, active: true });
    run(sim, 120);
    sim.diplomaticAction(0, { type: 'send_aid', partner: usa.slot, pctGdp: 0.5 });
    expect(sim.diplomaticAction(0, { type: 'request_sanctions', partner: usa.slot, target: 1 })).toBeNull();
    expect(sim.diplomacy.active('sanctions', usa.slot, 1, true)).toBeDefined();
    run(sim, 1);
    expect(sim.nation(1)!.growthFactors.find((f) => f.key === 'sanctions')!.value).toBeLessThan(0);
    expect(sim.nation(1)!.approvalFactors.find((f) => f.key === 'sanctions')!.value).toBeLessThan(0);
  });

  it('romper um acordo antes do prazo custa relação com o parceiro e reputação com os demais', () => {
    const { sim, npc } = setup();
    const jpn = npc('JPN');
    const deu = npc('DEU');
    meet(sim, 0, jpn.slot);
    meet(sim, 0, deu.slot);
    sim.diplomaticAction(0, { type: 'propose', treaty: 'trade', partner: jpn.slot });
    const t = sim.diplomacy.active('trade', 0, jpn.slot)!;
    expect(sim.diplomaticAction(0, { type: 'cancel_treaty', treatyId: t.id })).toBeNull();
    expect(sim.diplomacy.relation(0, jpn.slot)).toBeLessThan(0);
    expect(sim.diplomacy.relation(0, deu.slot)).toBeLessThan(0);
  });

  it('não permite acordos com o adversário em guerra nem ações de quem não é jogador', () => {
    const { sim, npc } = setup();
    theater(sim);
    sim.diplomaticAction(0, { type: 'declare_war', target: 1 });
    expect(sim.diplomaticAction(0, { type: 'propose', treaty: 'trade', partner: 1 })).toMatch(/adversário/);
    expect(sim.diplomaticAction(npc('USA').slot, { type: 'impose_sanctions', target: 0 })).not.toBeNull();
  });
});
