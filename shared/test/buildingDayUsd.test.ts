import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../sim/config.ts';
import { gatherRate } from '../sim/gathering.ts';
import { powerUse } from '../sim/power.ts';
import { TREASURY, buildingDayUsd } from '../strategic/treasury.ts';

describe('saldo diário de uma construção (cartão de construção, 05/11)', () => {
  it('escola: só custa — área, serviço público e energia da era, na escala do PIB', () => {
    const k = 2.2;
    const d = buildingDayUsd('school', { era: 4, scale: k });
    const size = BUILDINGS.school.size;
    expect(d.produce).toBe(0);
    expect(d.area).toBeCloseTo(size * size * TREASURY.buildingPerCell * k);
    expect(d.service).toBeCloseTo(TREASURY.service * k);
    expect(d.energy).toBeCloseTo(powerUse('school', 4) * TREASURY.energy * k);
    expect(d.net).toBeLessThan(0);
    expect(d.net).toBeCloseTo(-(d.area + d.service + d.energy));
  });

  it('fazenda: a produção entra no caixa e o saldo fica positivo; com o rendimento exato, usa ele', () => {
    const d = buildingDayUsd('farm', { era: 1, scale: 1 });
    expect(d.produce).toBeGreaterThan(0);
    expect(d.net).toBeGreaterThan(0);
    const exact = buildingDayUsd('farm', { era: 1, scale: 1, rate: gatherRate('farm', 3) });
    expect(exact.produce).toBeCloseTo(gatherRate('farm', 3) * TREASURY.price.food);
    expect(exact.produce).toBeLessThan(d.produce);
  });

  it('casa: só manutenção pequena; o QG não paga área', () => {
    expect(buildingDayUsd('house', { era: 1, scale: 1 }).net).toBeLessThan(0);
    expect(buildingDayUsd('hq', { era: 1, scale: 1 }).area).toBe(0);
  });
});
