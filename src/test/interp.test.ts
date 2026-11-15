import { describe, expect, it } from 'vitest';
import { MAX_EXTRAPOLATION, SnapshotClock } from '../game/net/interp.ts';

/**
 * Relógio da interpolação (15/11): uma tropa andando em linha reta a 1 unidade por snapshot, com os pacotes chegando
 * com atraso irregular (até ±45 ms num intervalo de 100 ms). Desenhada a 60 quadros por segundo, conta quantos quadros
 * ela fica parada e o maior salto entre dois quadros, no método antigo e no novo.
 */
function simulate(mode: 'antigo' | 'novo') {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const interval = 100;
  const arrivals: number[] = [];
  for (let i = 1; i <= 120; i++) arrivals.push(i * interval + (rnd() - 0.5) * 90);
  arrivals.sort((a, b) => a - b);
  const clock = new SnapshotClock();
  let prev = 0;
  let curr = 0;
  let at = 0;
  let next = 0;
  let last = 0;
  let stalls = 0;
  let maxJump = 0;
  let backwards = 0;
  for (let now = interval; now < 121 * interval; now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next]! <= now) {
      const pos = next + 1;
      if (mode === 'novo') {
        const a0 = clock.alpha(arrivals[next]!, false, 1);
        prev = prev + (curr - prev) * a0;
        clock.arrive(arrivals[next]!, interval, 1);
      } else {
        prev = curr;
        at = arrivals[next]!;
      }
      curr = pos;
      next++;
    }
    const alpha = mode === 'novo' ? clock.alpha(now, false, 1) : Math.min(1, (now - at) / interval);
    const x = prev + (curr - prev) * alpha;
    if (now > 5 * interval) {
      const step = x - last;
      if (Math.abs(step) < 1e-6) stalls++;
      if (step < -1e-6) backwards++;
      maxJump = Math.max(maxJump, step);
    }
    last = x;
  }
  return { stalls, maxJump, backwards };
}

describe('interpolação entre snapshots', () => {
  it('com a rede irregular a tropa não para nem salta (o método antigo fazia as duas coisas)', () => {
    const old = simulate('antigo');
    const neu = simulate('novo');
    // passo normal a 60 qps: 1 unidade a cada 100 ms ≈ 0,17 por quadro
    expect(old.stalls).toBeGreaterThan(50);
    expect(old.maxJump).toBeGreaterThan(0.45);
    expect(neu.stalls).toBeLessThan(old.stalls / 10);
    expect(neu.maxJump).toBeLessThan(0.3);
    expect(neu.backwards).toBe(0);
  });

  it('pausado fica no último estado; a extrapolação tem limite', () => {
    const c = new SnapshotClock();
    c.arrive(1000, 100, 1);
    expect(c.alpha(1050, true, 1)).toBe(1);
    expect(c.alpha(5000, false, 1)).toBe(MAX_EXTRAPOLATION);
    expect(c.alpha(1000, false, 1)).toBe(0);
  });
});
