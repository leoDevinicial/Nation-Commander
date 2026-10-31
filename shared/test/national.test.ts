import { describe, expect, it } from 'vitest';
import { ESTIMATES } from '../data/reference/estimates.ts';
import { COUNTRIES } from '../data/countries.ts';
import { NationalAI } from '../strategic/NationalAI.ts';
import { INFRA_GATE_MIN } from '../sim/upgrades.ts';
import { createNation, NationalSimulation, spendPct } from '../strategic/NationalSimulation.ts';
import { countryReference, hasReferenceData } from '../strategic/reference.ts';
import { TECHNOLOGIES } from '../strategic/technologies.ts';

const run = (sim: NationalSimulation, days: number) => {
  for (let i = 0; i < days; i++) sim.stepDay();
};

describe('dados de referência', () => {
  it('existem para todos os países jogáveis, com fonte e ano', () => {
    expect(hasReferenceData()).toBe(true);
    for (const c of COUNTRIES) {
      const ref = countryReference(c.id);
      for (const key of ['population', 'gdpUsd', 'inflationPct', 'militaryPctGdp'] as const) {
        const v = ref.values[key];
        // única lacuna aceita: inflação da Coreia do Norte (sem fonte confiável; vira estimativa declarada)
        if (c.id === 'PRK' && key === 'inflationPct') {
          expect(v.value).toBeNull();
          continue;
        }
        expect(v.value, `${c.id}.${key}`).not.toBeNull();
        expect(v.referenceDate).toMatch(/^\d{4}/);
        expect(v.sourceName.length).toBeGreaterThan(0);
        // estimativa de pesquisa só onde não há dado oficial, e sempre com fonte e nota
        if (v.quality !== 'official') {
          expect(ESTIMATES[c.id]?.[key], `${c.id}.${key}`).toBeDefined();
          expect(v.quality).toBe('research');
          expect(v.sourceUrl).toMatch(/^https:/);
          expect(v.notes?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('campos sem dado viram estimativa declarada, nunca valor silencioso', () => {
    for (const c of COUNTRIES) {
      const ref = countryReference(c.id);
      const n = createNation(0, c.id);
      for (const key of n.estimatedFields) expect(ref.values[key].value).toBeNull();
    }
  });

  it('nunca sobrescreve o dado de referência com o estado da partida', () => {
    const before = countryReference('BRA').values.gdpUsd.value;
    const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 1, 'realistic');
    run(sim, 400);
    expect(countryReference('BRA').values.gdpUsd.value).toBe(before);
    expect(sim.nation(0)!.gdpUsd).not.toBe(before);
  });
});

describe('modelo nacional', () => {
  it('começa com o déficit observado e o preserva sem mudanças de política', () => {
    const sim = new NationalSimulation(COUNTRIES.map((c, i) => ({ slot: i, countryId: c.id })), 3, 'realistic');
    const d0 = sim.nations.map((n) => n.deficitPctGdp);
    run(sim, 365);
    sim.nations.forEach((n, i) => {
      expect(Number.isFinite(n.gdpUsd)).toBe(true);
      expect(Math.abs(n.deficitPctGdp - d0[i]!)).toBeLessThan(2.5);
      expect(n.approval).toBeGreaterThanOrEqual(0);
      expect(n.approval).toBeLessThanOrEqual(100);
    });
  });

  it('déficit acumula dívida; superávit a reduz', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'DEU' }, { slot: 1, countryId: 'DEU' }], 1, 'realistic');
    const a = sim.nation(0)!;
    const b = sim.nation(1)!;
    sim.setBudget(0, { ...a.budget, taxPct: a.budget.taxPct - 5 });
    sim.setBudget(1, { ...b.budget, taxPct: b.budget.taxPct + 5 });
    const debtA = a.debtUsd;
    const debtB = b.debtUsd;
    run(sim, 180);
    expect(a.debtUsd).toBeGreaterThan(debtA);
    expect(b.debtUsd).toBeLessThan(debtB);
  });

  it('aumentar impostos reduz a aprovação com defasagem, e o fator aparece no diagnóstico', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'MEX' }, { slot: 1, countryId: 'MEX' }], 1, 'realistic');
    const n = sim.nation(0)!;
    sim.setBudget(0, { ...n.budget, taxPct: n.budget.taxPct + 6 });
    run(sim, 1);
    expect(n.approval).toBeGreaterThan(48); // efeito não é instantâneo
    run(sim, 120);
    expect(n.approval).toBeLessThan(sim.nation(1)!.approval - 5);
    const tax = n.approvalFactors.find((f) => f.key === 'tax')!;
    expect(tax.value).toBeLessThan(0);
  });

  it('investir em infraestrutura acelera o crescimento só depois de acumular estoque', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'IND' }, { slot: 1, countryId: 'IND' }], 1, 'realistic');
    const n = sim.nation(0)!;
    sim.setBudget(0, { ...n.budget, infrastructurePct: n.budget.infrastructurePct + 3, taxPct: n.budget.taxPct + 3 });
    run(sim, 30);
    const early = n.growthFactors.find((f) => f.key === 'infra')!.value;
    run(sim, 700);
    const late = n.growthFactors.find((f) => f.key === 'infra')!.value;
    expect(late).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(0.1);
  });

  it('pesquisa conclui no tempo esperado e gera evento', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'JPN' }], 1, 'realistic');
    const n = sim.nation(0)!;
    sim.setBudget(0, { ...n.budget, researchPct: 1 });
    expect(sim.setResearch(0, 'logistics')).toBeNull();
    // verba alta: o ritmo fica limitado pela duração mínima da pesquisa
    const days = Math.max(TECHNOLOGIES.logistics.minDays, Math.ceil((TECHNOLOGIES.logistics.cost / 1) * 365));
    run(sim, days - 2);
    expect(n.research.done).not.toContain('logistics');
    run(sim, 3);
    expect(n.research.done).toContain('logistics');
    expect(sim.drainEvents().some((e) => e.type === 'research_completed' && e.techId === 'logistics')).toBe(true);
    expect(sim.effects(0).theaterSupplyMul).toBeCloseTo(1.25);
    expect(sim.setResearch(0, 'logistics')).not.toBeNull();
  });

  it('modo paridade iguala a escala econômica do teatro; realista não', () => {
    const players = [{ slot: 0, countryId: 'USA' }, { slot: 1, countryId: 'ZAF' }];
    const parity = new NationalSimulation(players, 1, 'parity');
    const real = new NationalSimulation(players, 1, 'realistic');
    const ratio = (s: NationalSimulation) => s.nation(0)!.theaterSupplyPerSec / s.nation(1)!.theaterSupplyPerSec;
    expect(ratio(real)).toBeGreaterThan(ratio(parity));
    // em paridade, mesma alocação → mesma logística
    parity.setBudget(1, { ...parity.nation(1)!.budget, defensePct: parity.nation(0)!.budget.defensePct });
    expect(parity.nation(1)!.theaterSupplyPerSec).toBeCloseTo(parity.nation(0)!.theaterSupplyPerSec);
  });

  it('baixas militares reduzem a aprovação', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'AUS' }, { slot: 1, countryId: 'AUS' }], 1, 'realistic');
    for (let d = 0; d < 30; d++) {
      sim.registerTacticalEvents(
        Array.from({ length: 2 }, (_, i) => ({ type: 'destroyed' as const, tick: d, id: d * 10 + i, owner: 0, entity: 'unit' as const, entityType: 'infantry', pos: { x: 0, y: 0 }, killerOwner: 1 })),
      );
      sim.stepDay();
    }
    expect(sim.nation(0)!.approval).toBeLessThan(sim.nation(1)!.approval);
    expect(sim.nation(0)!.approvalFactors.find((f) => f.key === 'casualties')!.value).toBeLessThan(0);
  });

  it('é determinístico pela seed (inclui protestos)', () => {
    const mk = () => {
      const s = new NationalSimulation([{ slot: 0, countryId: 'ARG' }], 99, 'realistic');
      run(s, 600);
      return [s.nation(0)!.approval, s.drainEvents().map((e) => `${e.type}@${e.day}`).join(',')];
    };
    expect(mk()).toEqual(mk());
  });

  it('orçamento é limitado a faixas válidas', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'FRA' }], 1, 'realistic');
    const n = sim.nation(0)!;
    sim.setBudget(0, { ...n.budget, defensePct: 99, taxPct: -5, researchPct: 50 });
    expect(n.budget.defensePct).toBe(10);
    expect(n.budget.taxPct).toBe(5);
    expect(n.budget.researchPct).toBe(4);
  });

  it('IA mantém as contas sob controle e pesquisa', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 5, 'realistic');
    const ai = new NationalAI(0);
    for (let d = 0; d < 730; d++) {
      if (d % 30 === 0) {
        const r = ai.think(sim);
        if (r.budget) sim.setBudget(0, r.budget);
        if (r.research !== undefined) sim.setResearch(0, r.research);
      }
      sim.stepDay();
    }
    const n = sim.nation(0)!;
    expect(n.research.done.length).toBeGreaterThan(0);
    expect(spendPct(n.budget)).toBeLessThan(40);
  });

  it('IA sobe a verba de infraestrutura até o índice passar a exigência do Centro de Comando nível 8', () => {
    for (const country of ['BRA', 'USA', 'IND']) {
      const sim = new NationalSimulation([{ slot: 0, countryId: country }], 5, 'parity');
      const ai = new NationalAI(0);
      // 1 dia = 1 s de partida: o QG da IA chega ao nível 8 por volta dos 25 min (dia 1500)
      for (let d = 0; d < 25 * 60; d++) {
        if (d % 30 === 0) {
          const r = ai.think(sim);
          if (r.budget) sim.setBudget(0, r.budget);
        }
        sim.stepDay();
      }
      const n = sim.nation(0)!;
      // aos 25 min o índice já destrava o nível 8 (antes ficava em 1,00 ou abaixo, e o QG da IA travava no 7)
      expect(n.infrastructureIndex, country).toBeGreaterThanOrEqual(INFRA_GATE_MIN);
      expect(spendPct(n.budget), country).toBeLessThan(40);
    }
  });

  it('IA da dificuldade alta sobe a defesa aos poucos (mais suprimentos no teatro), com as contas sob controle', () => {
    const run = (mul: number) => {
      const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 5, 'parity');
      const ai = new NationalAI(0, false, mul);
      for (let d = 0; d < 360; d++) {
        if (d % 30 === 0) {
          const r = ai.think(sim);
          if (r.budget) sim.setBudget(0, r.budget);
        }
        sim.stepDay();
      }
      return sim.nation(0)!;
    };
    const base = run(1);
    const hard = run(2);
    expect(hard.budget.defensePct).toBeGreaterThan(base.budget.defensePct);
    // nunca passa do múltiplo pedido
    expect(hard.budget.defensePct).toBeLessThanOrEqual(hard.referenceBudget.defensePct * 2 + 1e-9);
    expect(hard.theaterSupplyPerSec).toBeGreaterThan(base.theaterSupplyPerSec);
  });
});
