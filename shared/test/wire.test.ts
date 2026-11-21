import { describe, expect, it } from 'vitest';
import { SnapshotDeltaDecoder, SnapshotDeltaEncoder } from '../net/delta.ts';
import { WIRE_MIN_HOT, decodeSnapshotFrame, encodeSnapshotFrame, isWireFrame } from '../net/wire.ts';
import type { Snapshot } from '../sim/snapshot.ts';

/** Formato binário dos snapshots (21/11): o cliente remonta exatamente o mesmo snapshot que pelo texto. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

type U = Record<string, unknown> & { id: number };

describe('formato binário dos snapshots', () => {
  it('ida e volta: 300 snapshots de tropas andando saem idênticos ao caminho em texto e bem menores', () => {
    const r = rng(5);
    let units: U[] = Array.from({ length: 200 }, (_, i) => ({
      id: Math.floor(r() * 0xffffffff),
      type: 'tank',
      owner: i % 4,
      x: r2(r() * 150),
      y: r2(r() * 150),
      facing: r2(r() * 6.28 - 3.14),
      hp: 100,
      maxHp: 100,
      activity: 'moving',
      order: 'move',
      targetId: null,
    }));
    const enc = new SnapshotDeltaEncoder(1000);
    const viaText = new SnapshotDeltaDecoder();
    const viaBin = new SnapshotDeltaDecoder();
    let bin = 0;
    let text = 0;
    let frames = 0;
    for (let t = 1; t <= 300; t++) {
      units = units.map((u) => {
        const n = { ...u };
        if (r() < 0.7) n.x = r2(Math.max(0, (n.x as number) + r() - 0.5));
        if (r() < 0.7) n.y = r2(Math.max(0, (n.y as number) + r() - 0.5));
        if (r() < 0.3) n.facing = r2(r() * 6.28 - 3.14);
        if (r() < 0.05) n.hp = Math.max(1, (n.hp as number) - 7);
        if (r() < 0.02) n.activity = n.activity === 'moving' ? 'attacking' : 'moving';
        return n;
      });
      const s = { tick: t, units, buildings: [], events: [], territoryVersion: 1, players: [] } as unknown as Snapshot;
      const msg = { t: 'snapshot' as const, s: enc.encode(s), paused: false, speed: 1, pausedBy: null };
      const json = JSON.stringify(msg);
      const frame = encodeSnapshotFrame(msg);
      const a = viaText.apply((JSON.parse(json) as typeof msg).s);
      text += json.length;
      if (frame) {
        frames++;
        expect(isWireFrame(frame)).toBe(true);
        bin += frame.length;
        const back = decodeSnapshotFrame<typeof msg>(frame);
        expect(back.paused).toBe(false);
        expect(viaBin.apply(back.s)).toEqual(a);
      } else {
        bin += json.length;
        expect(viaBin.apply((JSON.parse(json) as typeof msg).s)).toEqual(a);
      }
      expect(a).toEqual(JSON.parse(JSON.stringify(s)));
    }
    expect(frames).toBeGreaterThan(290);
    expect(bin).toBeLessThan(text * 0.5);
  });

  it('o que não cabe exatamente fica no texto; snapshot completo e poucas tropas não viram binário', () => {
    const base = { t: 'snapshot' as const, paused: false, speed: 1, pausedBy: null };
    const hot = Array.from({ length: WIRE_MIN_HOT }, (_, i) => ({ id: i + 1, x: 1.25, y: 2.5 }));
    const odd = [
      { id: 100, x: 1.234 }, // 3 casas
      { id: 101, x: -1 }, // negativo
      { id: 102, hp: 70000 }, // fora de u16
      { id: 103, x: 1, activity: 'idle' }, // campo que não é do bloco
      { id: 104, x: 1, _x: ['rank'] },
      { id: 105, type: 'tank', owner: 0, x: 3, y: 4 }, // tropa nova
    ];
    const frame = encodeSnapshotFrame({ ...base, s: { d: 1, tick: 2, events: [], u: [...odd, ...hot] } });
    expect(frame).not.toBeNull();
    const back = decodeSnapshotFrame<{ s: { u: Record<string, unknown>[] } }>(frame!);
    // as estranhas vêm primeiro, na ordem, pelo texto; as do bloco depois, idênticas
    expect(back.s.u.slice(0, odd.length)).toEqual(odd);
    expect(back.s.u.slice(odd.length)).toEqual(hot);
    expect(encodeSnapshotFrame({ ...base, s: { d: 1, tick: 2, events: [], u: hot.slice(1) } })).toBeNull();
    expect(encodeSnapshotFrame({ ...base, s: { tick: 2, units: hot } })).toBeNull();
  });
});
