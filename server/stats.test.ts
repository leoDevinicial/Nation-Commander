import { describe, expect, it } from 'vitest';
import { DbStatsCache, MatchTally, PROVISIONAL_STATS_TOKEN, STATS_POLICY, StatsGate, dayKey, dayStartIso } from './stats.ts';

/** Painel de números (06/11): token, bloqueio por tentativas, dia no horário de Brasília e contagem em memória. */
describe('Painel /stats', () => {
  const TOKEN = 'x'.repeat(STATS_POLICY.minTokenLength);

  it('sem token configurado (ou curto) não existe; token errado é 401 e muitas tentativas viram 429', () => {
    expect(new StatsGate(undefined).check(`Bearer ${TOKEN}`, '1.1.1.1')).toBe(404);
    expect(new StatsGate('curto').check('Bearer curto', '1.1.1.1')).toBe(404);
    const gate = new StatsGate(TOKEN);
    expect(gate.check(`Bearer ${TOKEN}`, '1.1.1.1')).toBe(200);
    expect(gate.check(undefined, '1.1.1.1')).toBe(401);
    for (let i = 0; i < STATS_POLICY.maxFailures; i++) gate.check('Bearer errado', '2.2.2.2');
    expect(gate.check(`Bearer ${TOKEN}`, '2.2.2.2')).toBe(429);
    expect(gate.check(`Bearer ${TOKEN}`, '3.3.3.3')).toBe(200);
  });

  it('chave provisória vale só sem STATS_TOKEN (com a variável, só ela entra)', () => {
    expect(new StatsGate(PROVISIONAL_STATS_TOKEN).check(`Bearer ${PROVISIONAL_STATS_TOKEN}`, '9.9.9.9')).toBe(200);
    expect(new StatsGate(TOKEN).check(`Bearer ${PROVISIONAL_STATS_TOKEN}`, '9.9.9.9')).toBe(401);
  });

  it('o dia vira à meia-noite de Brasília (03:00 UTC)', () => {
    expect(dayKey(Date.parse('2026-11-06T02:59:00Z'))).toBe('2026-11-05');
    expect(dayKey(Date.parse('2026-11-06T03:00:00Z'))).toBe('2026-11-06');
    expect(dayStartIso(Date.parse('2026-11-06T15:00:00Z'))).toBe('2026-11-06T03:00:00.000Z');
    expect(dayStartIso(Date.parse('2026-11-06T15:00:00Z'), 6)).toBe('2026-10-31T03:00:00.000Z');
  });

  it('a contagem em memória soma as partidas do dia, inclusive as só de convidados', () => {
    const t = new MatchTally();
    const now = Date.parse('2026-11-06T15:00:00Z');
    t.record(now, 600, true);
    t.record(now, 1200, false);
    t.record(Date.parse('2026-11-05T15:00:00Z'), 60, true);
    expect(t.today(now)).toEqual({ matches: 2, avgSeconds: 900, guestOnly: 1 });
  });

  it('sem Supabase, os números do banco vêm vazios com o motivo', async () => {
    const db = await new DbStatsCache(() => null).get(Date.now());
    expect(db.accounts).toBeNull();
    expect(db.error).toMatch(/Supabase/);
  });
});
