import { describe, expect, it } from 'vitest';
import { DAY_CYCLE_SECONDS, WEATHER_WINDOW, dayLight, matchClimate, weatherAt } from '../sim/climate.ts';

describe('clima da partida', () => {
  it('neve só quando todas as nações são da Europa', () => {
    expect(matchClimate(['DEU', 'FRA', 'RUS'])).toBe('snow');
    expect(matchClimate(['DEU', 'FRA', 'BRA'])).not.toBe('snow');
    expect(matchClimate(['DEU', 'GBR'], 'desert')).toBe('snow');
  });

  it('trópicos, deserto e temperado', () => {
    expect(matchClimate(['BRA', 'USA'])).toBe('tropical');
    expect(matchClimate(['USA', 'CHN'], 'desert')).toBe('arid');
    expect(matchClimate(['USA', 'CHN'])).toBe('temperate');
  });

  it('dia e noite se alternam ao longo do ciclo', () => {
    expect(dayLight(0).day).toBeGreaterThan(0.9);
    const samples = Array.from({ length: 64 }, (_, i) => dayLight((i / 64) * DAY_CYCLE_SECONDS));
    expect(samples.some((d) => d.night > 0.95)).toBe(true);
    expect(samples.some((d) => d.day > 0.95)).toBe(true);
    for (const d of samples) {
      expect(d.day).toBeGreaterThanOrEqual(0);
      expect(d.day).toBeLessThanOrEqual(1);
      expect(d.night * d.day).toBeLessThan(0.3);
    }
    // ciclo periódico
    expect(dayLight(123).hour).toBeCloseTo(dayLight(123 + DAY_CYCLE_SECONDS).hour, 5);
  });

  it('o tempo é determinístico, começa bom e respeita o clima', () => {
    expect(weatherAt(42, 'tropical', 60).rain).toBe(0);
    let rain = 0;
    let snow = 0;
    for (let t = 0; t < 40 * WEATHER_WINDOW; t += 10) {
      const w = weatherAt(42, 'snow', t);
      expect(w).toEqual(weatherAt(42, 'snow', t));
      snow = Math.max(snow, w.snow);
      rain = Math.max(rain, weatherAt(42, 'tropical', t).rain);
      expect(weatherAt(42, 'tropical', t).snow).toBe(0);
    }
    expect(snow).toBeGreaterThan(0.3);
    expect(rain).toBeGreaterThan(0.3);
  });
});

describe('clima ocasional e curto', () => {
  it('chuva e neve ocupam pouco tempo e cada evento dura no máximo ~1,5 min', () => {
    for (const climate of ['snow', 'tropical', 'temperate'] as const) {
      let wet = 0;
      let total = 0;
      let longest = 0;
      for (let seed = 1; seed <= 20; seed++) {
        let run = 0;
        for (let s = 0; s < 2 * 3600; s++) {
          const w = weatherAt(seed, climate, s);
          const on = w.rain > 0.05 || w.snow > 0.05;
          total++;
          if (on) wet++;
          run = on ? run + 1 : 0;
          longest = Math.max(longest, run);
        }
      }
      expect(wet / total).toBeLessThan(0.14);
      expect(wet / total).toBeGreaterThan(0.02);
      expect(longest).toBeLessThanOrEqual(90);
    }
  });
});
