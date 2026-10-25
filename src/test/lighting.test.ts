import { describe, expect, it } from 'vitest';
import { EXPOSURE_KEY, EXPOSURE_MAX, EXPOSURE_MIN, logAverageLuminance, targetExposure } from '../game/render/Lighting.ts';

describe('exposição adaptativa', () => {
  it('cena na luminância de referência mantém a exposição neutra', () => {
    expect(targetExposure(EXPOSURE_KEY)).toBeCloseTo(1, 5);
  });

  it('cena escura aumenta e cena clara reduz a exposição, sempre dentro dos limites', () => {
    expect(targetExposure(EXPOSURE_KEY / 2)).toBeGreaterThan(1);
    expect(targetExposure(EXPOSURE_KEY * 2)).toBeLessThan(1);
    expect(targetExposure(0.0001)).toBe(EXPOSURE_MAX);
    expect(targetExposure(100)).toBe(EXPOSURE_MIN);
    expect(targetExposure(0)).toBe(1);
    expect(targetExposure(Number.NaN)).toBe(1);
  });

  it('média logarítmica ignora pixels quase pretos (névoa de guerra inexplorada)', () => {
    const lit = [0.2, 0.2, 0.2, 1];
    const black = [0, 0, 0, 1];
    const onlyLit = logAverageLuminance([...lit, ...lit]);
    const withBlack = logAverageLuminance([...lit, ...lit, ...black, ...black, ...black]);
    expect(onlyLit).toBeCloseTo(0.2, 2);
    expect(withBlack).toBeCloseTo(onlyLit, 6);
    expect(logAverageLuminance([...black])).toBe(0);
  });

  it('aplica a decodificação dos valores lidos (ex.: half float)', () => {
    expect(logAverageLuminance([2, 2, 2, 1], (v) => v / 10)).toBeCloseTo(0.2, 2);
  });
});
