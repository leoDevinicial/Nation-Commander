import { describe, expect, it } from 'vitest';
import { generateMap, reachable } from '../sim/MapGen.ts';

describe('generateMap', () => {
  it('é determinístico pelo seed', () => {
    expect(generateMap(42).terrain).toEqual(generateMap(42).terrain);
    expect(generateMap(42).terrain).not.toEqual(generateMap(43).terrain);
  });

  it('é simétrico e conecta as bases para vários seeds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const m = generateMap(seed);
      const n = m.width * m.height;
      for (let i = 0; i < n; i++) expect(m.terrain[i]).toBe(m.terrain[n - 1 - i]);
      const r = reachable(m, m.spawns[0]!);
      const s1 = m.spawns[1]!;
      expect(r.has(s1.cy * m.width + s1.cx)).toBe(true);
      for (const node of m.resourceNodes) expect(r.has(node.cy * m.width + node.cx)).toBe(true);
    }
  });
});
