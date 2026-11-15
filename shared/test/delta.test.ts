import { describe, expect, it } from 'vitest';
import { SnapshotDeltaDecoder, SnapshotDeltaEncoder, isDelta } from '../net/delta.ts';
import type { Snapshot } from '../sim/snapshot.ts';

/** Snapshots delta (15/11): o cliente remonta exatamente o que o servidor tinha, inclusive a ordem das listas. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

type U = Record<string, unknown> & { id: number };

function evolve(r: () => number, prev: { units: U[]; buildings: U[]; extra: Record<string, unknown> }, tick: number) {
  const move = (list: U[], kind: 'u' | 'b') => {
    let out = list.filter(() => r() > 0.04).map((e) => {
      const n: U = { ...e };
      if (r() < 0.6) n.x = Math.round(((n.x as number) + r() - 0.5) * 100) / 100;
      if (r() < 0.1) n.hp = Math.max(1, (n.hp as number) - 3);
      const k = r();
      if (k < 0.05) delete n.rank;
      else if (k < 0.1) n.rank = 2;
      if (r() < 0.05) n.refit = { mod: 'armor', progress: Math.round(r() * 100) / 100 };
      if (r() < 0.05) delete n.refit;
      return n;
    });
    const born = Math.floor(r() * 4);
    for (let i = 0; i < born; i++) {
      const e: U = { id: Math.floor(r() * 1e9), type: kind === 'u' ? 'infantry' : 'farm', owner: Math.floor(r() * 4), x: r() * 100, hp: 100 };
      // às vezes entra no meio da lista (unidade inimiga que aparece na vista)
      const at = Math.floor(r() * (out.length + 1));
      out = [...out.slice(0, at), e, ...out.slice(at)];
    }
    if (r() < 0.05 && out.length > 2) out = [out[1]!, out[0]!, ...out.slice(2)];
    return out;
  };
  const extra: Record<string, unknown> = { ...prev.extra };
  // nações: estoques mudam quase sempre, às vezes um campo some, e a nação 2 entra e sai
  const players = [0, 1, 2]
    .filter((slot) => slot !== 2 || r() < 0.8)
    .map((slot) => ({ slot, resources: { food: Math.floor(r() * 1000) }, defeated: false, ...(r() < 0.5 ? { era: 2 } : {}) }));
  extra.players = r() < 0.05 ? [...players].reverse() : players;
  if (r() < 0.1) extra.mines = [{ id: 1, owner: 0, x: 1, y: 2 }];
  if (r() < 0.1) delete extra.mines;
  if (r() < 0.1) extra.zoning = { version: tick, lots: [1, 2, 3] };
  return { units: move(prev.units, 'u'), buildings: move(prev.buildings, 'b'), extra };
}

function snap(state: { units: U[]; buildings: U[]; extra: Record<string, unknown> }, tick: number, r: () => number): Snapshot {
  return {
    tick,
    units: state.units,
    buildings: state.buildings,
    events: r() < 0.3 ? [{ type: 'shot', tick } as never] : [],
    territoryVersion: 1,
    ...(r() < 0.05 ? { territory: 'abc' + tick, roads: [tick] } : {}),
    ...state.extra,
  } as unknown as Snapshot;
}

describe('Snapshots delta', () => {
  it('ida e volta: 600 snapshots aleatórios saem idênticos no cliente (campos, remoções, entradas no meio, ordem)', () => {
    const r = rng(42);
    const enc = new SnapshotDeltaEncoder(50);
    const dec = new SnapshotDeltaDecoder();
    let state = { units: [] as U[], buildings: [] as U[], extra: { players: [] } as Record<string, unknown> };
    let deltas = 0;
    for (let t = 1; t <= 600; t++) {
      state = evolve(r, state, t);
      const s = snap(state, t, r);
      const wire = JSON.parse(JSON.stringify(enc.encode(s))) as Snapshot;
      if (isDelta(wire)) deltas++;
      const got = dec.apply(wire);
      expect(got).toEqual(JSON.parse(JSON.stringify(s)));
      // campos de uma mensagem só não ficam grudados no estado
      expect(got!.territory).toBe(s.territory);
    }
    expect(deltas).toBeGreaterThan(550);
  });

  it('a diferença é bem menor que o snapshot inteiro quando quase tudo está parado', () => {
    const enc = new SnapshotDeltaEncoder();
    const units: U[] = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, type: 'tank', owner: 0, x: i, y: i, facing: 0, hp: 100, maxHp: 100, activity: 'idle', order: 'idle', targetId: null }));
    const s1 = { tick: 1, units, buildings: [], events: [], territoryVersion: 1, players: [] } as unknown as Snapshot;
    enc.encode(s1);
    const moved = units.map((u, i) => (i < 30 ? { ...u, x: (u.x as number) + 0.5 } : u));
    const s2 = { ...s1, tick: 2, units: moved } as unknown as Snapshot;
    const full = JSON.stringify(s2).length;
    const delta = JSON.stringify(enc.encode(s2)).length;
    expect(delta).toBeLessThan(full * 0.05);
  });

  it('sem base o cliente ignora a diferença; depois do reset o servidor manda completo', () => {
    const enc = new SnapshotDeltaEncoder();
    const s = (tick: number) => ({ tick, units: [{ id: 1, x: tick }], buildings: [], events: [], territoryVersion: 1 }) as unknown as Snapshot;
    enc.encode(s(1));
    const d = enc.encode(s(2));
    expect(isDelta(d)).toBe(true);
    expect(new SnapshotDeltaDecoder().apply(d)).toBeNull();
    enc.reset();
    expect(isDelta(enc.encode(s(3)))).toBe(false);
  });
});
