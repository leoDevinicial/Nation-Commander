import { describe, expect, it } from 'vitest';
import { ESTIMATES } from '../data/reference/estimates.ts';
import { COUNTRIES } from '../data/countries.ts';
import { NationalAI } from '../strategic/NationalAI.ts';
import { INFRA_GATE_MIN } from '../sim/upgrades.ts';
import { createNation, NationalSimulation } from '../strategic/NationalSimulation.ts';
import { DEFAULT_AREAS } from '../strategic/areas.ts';
import { DAYS_PER_YEAR, MAP_GDP_LOT_OUTPUT } from '../strategic/params.ts';
import type { TheaterStats } from '../strategic/policies.ts';
import { TREASURY, type TreasuryInputs } from '../strategic/treasury.ts';
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

/** Teatro de mentira para os testes: o que cada nação tem no mapa (produção, cidadãos, impostos, serviços). */
function theater(nat: NationalSimulation, stats: (slot: number) => TheaterStats | null) {
  nat.attachTheater({ resources: () => null, spend: () => {}, setWar: () => {}, stats });
}
const quiet: TreasuryInputs = { production: {}, infantry: 0, vehicles: 0, aircraft: 0, energy: 0, buildingCells: 0, roads: 0, services: 0 };
const town = (tax = 10, extra: Partial<TheaterStats> = {}): TheaterStats => ({
  buildings: {},
  military: 0,
  workers: 20,
  idle: 0,
  citizens: 20,
  food: 100,
  economy: { ...quiet, production: { food: 10, wood: 6 }, citizens: 20, zoning: { base: { res: 4, com: 2, ind: 1 }, tax: { res: tax, com: tax, ind: tax } } },
  ...extra,
});

describe('modelo nacional', () => {
  it('as nações do mapa começam iguais; os países de fora seguem com os dados reais', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'USA' }, { slot: 1, countryId: 'ZAF' }], 1, 'realistic');
    const [a, b] = [sim.nation(0)!, sim.nation(1)!];
    expect(sim.mode).toBe('parity');
    expect(a.budget).toEqual(b.budget);
    expect(a.theaterSupplyPerSec).toBeCloseTo(b.theaterSupplyPerSec);
    expect(a.works.fundUsd).toBe(b.works.fundUsd);
    expect(a.works.capUsd).toBe(b.works.capUsd);
    expect(a.areas).toEqual(DEFAULT_AREAS);
    expect(a.estimatedFields).toEqual([]);
    const npc = (id: string) => sim.npcs.find((n) => n.countryId === id)!;
    expect(npc('CHN').gdpUsd).toBeGreaterThan(npc('ARG').gdpUsd);
  });

  it('os países de fora preservam o déficit observado sem mudanças de política', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 3, 'parity');
    const d0 = sim.npcs.map((n) => n.deficitPctGdp);
    run(sim, 365);
    sim.npcs.forEach((n, i) => {
      expect(Number.isFinite(n.gdpUsd)).toBe(true);
      expect(Math.abs(n.deficitPctGdp - d0[i]!)).toBeLessThan(2.5);
    });
  });

  it('o PIB é o que o cenário produz (coletas, indústrias e lotes) × 365', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'DEU' }, { slot: 1, countryId: 'DEU' }], 1, 'parity');
    let farms = 10;
    theater(sim, () => ({ ...town(), economy: { ...town().economy!, production: { food: farms } } }));
    run(sim, 2);
    const n = sim.nation(0)!;
    const lots = (4 * TREASURY.lotTax.res + 2 * TREASURY.lotTax.com + TREASURY.lotTax.ind) * MAP_GDP_LOT_OUTPUT;
    // (mais a produtividade, que começa perto de zero)
    expect(n.gdpUsd / ((farms * TREASURY.price.food + lots) * DAYS_PER_YEAR)).toBeCloseTo(1, 2);
    expect(n.history.length).toBeGreaterThan(0);
    farms = 40;
    run(sim, 20);
    expect(n.realGrowthPct).toBeGreaterThan(0);
    expect(n.gdpUsd).toBeGreaterThan((10 * TREASURY.price.food + lots) * DAYS_PER_YEAR);
  });

  it('imposto alto rende mais caixa e custa aprovação, com defasagem', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'MEX' }, { slot: 1, countryId: 'MEX' }], 1, 'parity');
    theater(sim, (slot) => town(slot === 0 ? 25 : 10));
    run(sim, 1);
    const [hi, lo] = [sim.nation(0)!, sim.nation(1)!];
    expect(hi.works.today!.net).toBeGreaterThan(lo.works.today!.net);
    expect(hi.approval).toBeGreaterThan(48); // efeito não é instantâneo
    run(sim, 120);
    expect(hi.approval).toBeLessThan(lo.approval - 5);
    expect(hi.approvalFactors.find((f) => f.key === 'tax')!.value).toBeLessThan(0);
  });

  it('Assistência alta custa caixa e sobe a aprovação', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'FRA' }, { slot: 1, countryId: 'FRA' }], 1, 'parity');
    theater(sim, () => town());
    expect(sim.setAreas(0, { social: 150 })).toBeNull();
    expect(sim.setAreas(1, { social: 50 })).toBeNull();
    run(sim, 120);
    const [hi, lo] = [sim.nation(0)!, sim.nation(1)!];
    expect(hi.approval).toBeGreaterThan(lo.approval + 5);
    expect(hi.works.today!.net).toBeLessThan(lo.works.today!.net);
  });

  it('Infraestrutura alta acelera as obras e leva o índice acima da exigência do QG alto; Educação e Saúde mexem no teatro', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'IND' }, { slot: 1, countryId: 'IND' }], 1, 'parity');
    theater(sim, () => town());
    sim.setAreas(0, { infrastructure: 150, education: 150, health: 150 });
    sim.setAreas(1, { infrastructure: 50, education: 50, health: 50 });
    run(sim, 240);
    expect(sim.nation(0)!.infrastructureIndex).toBeGreaterThan(INFRA_GATE_MIN);
    expect(sim.nation(1)!.infrastructureIndex).toBeLessThan(1);
    const [a, b] = [sim.areaModifiers(0), sim.areaModifiers(1)];
    expect(a.buildSpeed).toBeGreaterThan(1);
    expect(b.buildSpeed).toBeLessThan(1);
    expect(a.knowledgeMul).toBeGreaterThan(b.knowledgeMul);
    expect(a.citizenSpeed).toBeGreaterThan(b.citizenSpeed);
  });

  it('pesquisa conclui no tempo esperado e gera evento; a área Pesquisa acelera', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'JPN' }], 1, 'parity');
    const n = sim.nation(0)!;
    expect(sim.setResearch(0, 'logistics')).toBeNull();
    const days = TECHNOLOGIES.logistics.minDays;
    run(sim, days - 2);
    expect(n.research.done).not.toContain('logistics');
    run(sim, 3);
    expect(n.research.done).toContain('logistics');
    expect(sim.drainEvents().some((e) => e.type === 'research_completed' && e.techId === 'logistics')).toBe(true);
    expect(sim.effects(0).theaterSupplyMul).toBeCloseTo(1.25);
    expect(sim.setResearch(0, 'logistics')).not.toBeNull();
    // a 150%, a mesma pesquisa sai em 2/3 do prazo (e custa 50% mais por dia)
    const fast = new NationalSimulation([{ slot: 0, countryId: 'JPN' }], 1, 'parity');
    fast.setAreas(0, { research: 150 });
    fast.setResearch(0, 'logistics');
    run(fast, Math.ceil(days / 1.25) + 1);
    expect(fast.nation(0)!.research.done).toContain('logistics');
  });

  it('Defesa: mesma verba, mesma logística; mais verba, mais suprimentos', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'USA' }, { slot: 1, countryId: 'ZAF' }], 1, 'parity');
    expect(sim.nation(1)!.theaterSupplyPerSec).toBeCloseTo(sim.nation(0)!.theaterSupplyPerSec);
    sim.setAreas(1, { defense: 150 });
    expect(sim.nation(1)!.theaterSupplyPerSec).toBeGreaterThan(sim.nation(0)!.theaterSupplyPerSec);
  });

  it('baixas militares reduzem a aprovação', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'AUS' }, { slot: 1, countryId: 'AUS' }], 1, 'parity');
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
      const s = new NationalSimulation([{ slot: 0, countryId: 'ARG' }], 99, 'parity');
      theater(s, () => town(28));
      run(s, 600);
      return [s.nation(0)!.approval, s.drainEvents().map((e) => `${e.type}@${e.day}`).join(',')];
    };
    expect(mk()).toEqual(mk());
  });

  it('áreas são limitadas a 50%–150%; o comando antigo de orçamento vira níveis', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'FRA' }], 1, 'parity');
    const n = sim.nation(0)!;
    sim.setAreas(0, { defense: 999, health: -5, research: Number.NaN });
    expect(n.areas!.defense).toBe(150);
    expect(n.areas!.health).toBe(50);
    expect(n.areas!.research).toBe(100);
    sim.setBudget(0, { ...n.referenceBudget, educationPct: n.referenceBudget.educationPct * 1.2 });
    expect(n.areas!.education).toBe(120);
    expect(n.budget.educationPct).toBeCloseTo(n.referenceBudget.educationPct * 1.2);
  });

  it('IA mantém o caixa em ordem e pesquisa', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 5, 'parity');
    theater(sim, () => town());
    const ai = new NationalAI(0);
    for (let d = 0; d < 730; d++) {
      if (d % 30 === 0) {
        const r = ai.think(sim);
        if (r.areas) sim.setAreasUncapped(0, r.areas, ai.defenseMax);
        if (r.research !== undefined) sim.setResearch(0, r.research);
      }
      sim.stepDay();
    }
    const n = sim.nation(0)!;
    expect(n.research.done.length).toBeGreaterThan(0);
    expect(n.works.fundUsd).toBeGreaterThan(0);
    expect(n.works.shortUsd).toBeUndefined();
  });

  it('IA sobe a Infraestrutura até o índice passar a exigência do Centro de Comando nível 8', () => {
    const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 5, 'parity');
    theater(sim, () => town());
    const ai = new NationalAI(0);
    // 1 dia = 1 s de partida: o QG da IA chega ao nível 8 por volta dos 25 min (dia 1500)
    for (let d = 0; d < 25 * 60; d++) {
      if (d % 30 === 0) {
        const r = ai.think(sim);
        if (r.areas) sim.setAreasUncapped(0, r.areas, ai.defenseMax);
      }
      sim.stepDay();
    }
    expect(sim.nation(0)!.infrastructureIndex).toBeGreaterThanOrEqual(INFRA_GATE_MIN);
  });

  it('IA da dificuldade alta sobe a defesa aos poucos (mais suprimentos no teatro) e paga por isso', () => {
    const go = (mul: number) => {
      const sim = new NationalSimulation([{ slot: 0, countryId: 'BRA' }], 5, 'parity');
      theater(sim, () => town());
      const ai = new NationalAI(0, false, mul);
      for (let d = 0; d < 360; d++) {
        if (d % 30 === 0) {
          const r = ai.think(sim);
          if (r.areas) sim.setAreasUncapped(0, r.areas, ai.defenseMax);
        }
        sim.stepDay();
      }
      return sim.nation(0)!;
    };
    const base = go(1);
    const hard = go(2);
    expect(hard.areas!.defense).toBeGreaterThan(base.areas!.defense);
    // nunca passa do múltiplo pedido
    expect(hard.areas!.defense).toBeLessThanOrEqual(200);
    expect(hard.theaterSupplyPerSec).toBeGreaterThan(base.theaterSupplyPerSec);
    const defense = (n: typeof base) => n.works.today!.expense.find((l) => l.key === 'defense')!.usd;
    expect(defense(hard)).toBeGreaterThan(defense(base));
  });
});
