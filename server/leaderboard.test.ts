import { describe, expect, it } from 'vitest';
import { monthStart, rank, seasonLabel } from './leaderboard.ts';

/** Ranking e temporada mensal (23/11). */
describe('ranking da temporada', () => {
  it('conta vitórias de quem tem conta, ignora IA e partida local, desempata pelo aproveitamento', () => {
    const rows = rank([
      { player_id: 'a', display_name: 'Ana', result: 'win' },
      { player_id: 'a', display_name: 'Ana', result: 'loss' },
      { player_id: 'b', display_name: 'Beto', result: 'win' },
      { player_id: 'c', display_name: 'Caio', result: 'win', verdict: 'local' },
      { player_id: null, display_name: 'IA Tática', result: 'win' },
    ]);
    expect(rows).toEqual([
      { name: 'Beto', wins: 1, played: 1 },
      { name: 'Ana', wins: 1, played: 2 },
    ]);
  });

  it('a temporada é o mês (UTC) e tem nome em português', () => {
    const now = Date.UTC(2026, 10, 23, 15);
    expect(monthStart(now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(monthStart(now, -1).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(seasonLabel(monthStart(now))).toBe('novembro de 2026');
  });
});
