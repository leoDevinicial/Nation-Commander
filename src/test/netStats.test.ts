import { describe, expect, it } from 'vitest';
import { NetStats } from '../net/netStats.ts';

describe('KNPS: medições de rede no cliente', () => {
  it('ping estável e baixo é "boa"; mediana, p95 e oscilação saem das amostras', () => {
    let t = 0;
    const s = new NetStats(() => t);
    for (const r of [40, 42, 41, 43, 40, 44]) {
      s.pingSent();
      t += 2500;
      s.pong(r);
    }
    const x = s.summary();
    expect(x.rttP50).toBe(42);
    expect(x.rttP95).toBe(44);
    expect(x.jitter).toBe(2);
    expect(x.unanswered).toBe(0);
    expect(x.quality).toBe('boa');
  });

  it('pings sem resposta e ping alto deixam a conexão "ruim", com o motivo', () => {
    let t = 0;
    const s = new NetStats(() => t);
    for (let i = 0; i < 8; i++) {
      s.pingSent();
      t += 2500;
      if (i % 2 === 0) s.pong(320);
    }
    t += 6000;
    const x = s.summary();
    expect(x.unanswered).toBeGreaterThan(0.4);
    expect(x.quality).toBe('ruim');
    expect(x.reasons).toEqual(expect.arrayContaining(['ping alto', 'pings sem resposta']));
  });

  it('oscilação grande é "instável"; snapshots e dados recebidos são contados', () => {
    let t = 0;
    const s = new NetStats(() => t);
    for (const r of [30, 120, 35, 130, 30]) {
      s.pingSent();
      t += 100;
      s.pong(r);
    }
    for (let i = 0; i < 20; i++) {
      t += 100;
      s.message(1000, true);
    }
    const x = s.summary();
    expect(x.quality).toBe('instável');
    expect(x.reasons).toContain('ping oscilando');
    expect(x.gapP50).toBe(100);
    expect(x.snapshotsPerSec).toBeGreaterThan(3);
    expect(x.kbps).toBeGreaterThan(0);
  });

  it('com poucas amostras ainda está medindo; reset esquece a conexão antiga', () => {
    const s = new NetStats(() => 0);
    s.pong(50);
    expect(s.summary().quality).toBe('medindo');
    s.reset();
    expect(s.summary().rttP50).toBeNull();
  });
});
