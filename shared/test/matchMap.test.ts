import { describe, expect, it } from 'vitest';
import { reachable } from '../sim/MapGen.ts';
import { MAP_TYPES, generateMatchMap, mapSizeFor, regionOf } from '../sim/matchMap.ts';
import { BUILDINGS, Terrain } from '../sim/config.ts';
import { claimableCells } from '../sim/gathering.ts';
import { Simulation } from '../sim/Simulation.ts';

/** Gerador de mapas para 2 a 6 nações e tipos de mapa (lote 4). */

describe('mapas das partidas', () => {
  it('início garantido: a primeira fazenda, serraria, pedreira e mina de cada nação trabalham cheias', () => {
    // docs/RECALIBRAGEM_RECURSOS.md §2.4: com a economia apertada, um começo pobre vira desvantagem enorme
    const types = ['farm', 'sawmill', 'quarry', 'mine'] as const;
    // um país de cada perfil (equilibrado, florestal, petrolífero, serrano, agrícola)
    const countries = ['MEX', 'BRA', 'SAU', 'JPN', 'ARG', 'MEX'];
    for (const type of MAP_TYPES)
      for (const n of [2, 3, 6])
        for (const seed of [1, 2]) {
          const map = generateMatchMap(seed, { nations: n, type, countries: countries.slice(0, n) });
          const sim = new Simulation({ map, playerCount: n });
          for (let slot = 0; slot < n; slot++) {
            const hq = sim.hqOf(slot)!;
            for (const t of types) {
              let best = 0;
              for (let dy = -13; dy <= 13; dy++)
                for (let dx = -13; dx <= 13; dx++) {
                  const cell = { cx: hq.cell.cx + dx, cy: hq.cell.cy + dy };
                  const err = sim.placementError(slot, t, cell);
                  if (err && err !== 'Recursos insuficientes') continue;
                  best = Math.max(best, claimableCells(sim.map, t, cell, new Set(), (i) => sim.territory[i] === slot).length);
                }
              expect(best, `${type}, ${n} nações, seed ${seed}, nação ${slot}: ${t}`).toBeGreaterThanOrEqual(BUILDINGS[t].gather!.maxCells);
            }
          }
        }
  }, 120_000);

  it('tamanho cresce com as nações; todos os pontos de partida se alcançam, em todos os tipos', () => {
    for (const n of [2, 3, 4, 5, 6])
      for (const type of MAP_TYPES)
        for (const seed of [1, 42]) {
          const m = generateMatchMap(seed, { nations: n, type });
          expect(m.width).toBe(mapSizeFor(n));
          expect(m.spawns).toHaveLength(n);
          expect(m.kind).toBe(type);
          const r = reachable(m, m.spawns[0]!);
          for (const s of m.spawns) expect(r.has(s.cy * m.width + s.cx)).toBe(true);
          // a simulação monta todas as bases
          const sim = new Simulation({ map: m, playerCount: n });
          expect(sim.buildings.filter((b) => b.type === 'hq')).toHaveLength(n);
        }
  });

  it('simetria exata para 2 e 4 nações (sem perfis de país)', () => {
    for (const n of [2, 4]) {
      const m = generateMatchMap(7, { nations: n, type: 'continental' });
      const s = m.width;
      const turns = 4 / n;
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          let px = x;
          let py = y;
          for (let i = 0; i < turns; i++) [px, py] = [s - 1 - py, px];
          expect(m.terrain[py * s + px]).toBe(m.terrain[y * s + x]);
        }
      // mesma quantidade de jazidas por nação
      expect(m.resourceNodes.length % n).toBe(0);
    }
  });

  it('deserto: mais petróleo e menos floresta; perfil petrolífero ganha uma jazida a mais', () => {
    const cont = generateMatchMap(3, { nations: 2, type: 'continental' });
    const des = generateMatchMap(3, { nations: 2, type: 'desert' });
    const count = (t: Terrain, m: typeof cont) => m.terrain.filter((x) => x === t).length;
    expect(des.resourceNodes.length).toBeGreaterThan(cont.resourceNodes.length);
    expect(count(Terrain.Forest, des)).toBeLessThan(count(Terrain.Forest, cont));
    expect(regionOf('SAU')).toBe('oil');
    const oil = generateMatchMap(3, { nations: 2, type: 'continental', countries: ['SAU', 'DEU'] });
    expect(oil.resourceNodes.length).toBe(cont.resourceNodes.length + 1);
  });
});
