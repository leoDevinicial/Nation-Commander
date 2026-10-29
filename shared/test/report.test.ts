import { describe, expect, it } from 'vitest';
import { Simulation } from '../sim/Simulation.ts';
import { REPORT_MAX_SAMPLES, medalsFor, pushSample, reportSample, type ReportSample } from '../sim/report.ts';
import type { PlayerStats } from '../sim/types.ts';
import { flatMap } from './helpers.ts';

/** Relatório pós-partida (lote 1, §3.2): amostras do teatro e medalhas. */

const stats = (over: Partial<PlayerStats> = {}): PlayerStats => ({
  unitsProduced: 0,
  unitsLost: 0,
  unitsKilled: 0,
  structuresBuilt: 0,
  structuresLost: 0,
  structuresDestroyed: 0,
  resourcesGathered: 0,
  resourcesSpent: 0,
  damageDealt: 0,
  ...over,
});

describe('Relatório pós-partida', () => {
  it('amostra tropas, construções, território e PIB de cada jogador', () => {
    const sim = new Simulation({ map: flatMap(32), playerCount: 2 });
    for (let i = 0; i < 20; i++) sim.step();
    const s = reportSample(sim, (slot) => (slot === 0 ? 2e12 : null));
    expect(s.players).toHaveLength(2);
    expect(s.players[0]!.buildings).toBeGreaterThanOrEqual(1);
    expect(s.players[0]!.territory + s.players[1]!.territory).toBeCloseTo(1, 2);
    expect(s.players[0]!.gdpUsd).toBe(2e12);
    expect(s.players[1]!.gdpUsd).toBeUndefined();
  });

  it('a série fica limitada e continua cobrindo a partida inteira', () => {
    let samples: ReportSample[] = [];
    for (let t = 0; t < REPORT_MAX_SAMPLES * 3; t++) samples = pushSample(samples, { t, players: [] });
    expect(samples.length).toBeLessThanOrEqual(REPORT_MAX_SAMPLES);
    expect(samples[0]!.t).toBe(0);
    expect(samples[samples.length - 1]!.t).toBe(REPORT_MAX_SAMPLES * 3 - 1);
  });

  it('medalhas pelos critérios declarados', () => {
    const base = { durationSeconds: 900, gdpStartUsd: 100, gdpEndUsd: 106, bestRank: 3 };
    expect(medalsFor({ ...base, result: 'win', reason: 'territory', stats: stats({ unitsKilled: 12, unitsLost: 4, resourcesGathered: 6000, structuresBuilt: 30 }) })).toEqual([
      'victory',
      'territory',
      'fortress',
      'ace',
      'industry',
      'builder',
      'economy',
      'veterans',
    ]);
    expect(medalsFor({ result: 'loss', reason: 'hq_destroyed', durationSeconds: 2000, stats: stats({ structuresLost: 3 }), bestRank: 0 })).toEqual(['survivor']);
  });
});
