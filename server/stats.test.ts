import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { DbDetailsCache, DbStatsCache, MatchTally, PROVISIONAL_DETAILS_KEY_SHA256, PROVISIONAL_STATS_TOKEN, RecentMatches, STATS_POLICY, StatsGate, dayKey, dayStartIso } from './stats.ts';

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
  it('chave de detalhes: só o hash fica no código; abre os detalhes sem STATS_TOKEN e nunca a chave pública', () => {
    const key = 'chave-de-detalhes-de-teste-0123456789';
    const hash = createHash('sha256').update(key).digest();
    const details = new StatsGate(undefined, Date.now, [hash]);
    expect(details.enabled).toBe(true);
    expect(details.check(`Bearer ${key}`, '4.4.4.4')).toBe(200);
    expect(details.check(`Bearer ${PROVISIONAL_STATS_TOKEN}`, '4.4.4.4')).toBe(401);
    // a mesma chave abre os números junto com a chave pública
    const basic = new StatsGate(PROVISIONAL_STATS_TOKEN, Date.now, [hash]);
    expect(basic.check(`Bearer ${key}`, '5.5.5.5')).toBe(200);
    expect(basic.check(`Bearer ${PROVISIONAL_STATS_TOKEN}`, '5.5.5.5')).toBe(200);
    expect(PROVISIONAL_DETAILS_KEY_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('últimas partidas: mais recente primeiro, com limite', () => {
    const r = new RecentMatches(3);
    for (let i = 0; i < 5; i++) r.record({ endedAt: `2026-11-07T10:0${i}:00Z`, durationSeconds: 60 * i, mode: 'vs_ai', map: 'continental', reason: 'hq_destroyed', players: [{ name: `C${i}`, ai: false, guest: true, country: 'BRA', result: 'win' }] });
    expect(r.all().map((m) => m.players[0]!.name)).toEqual(['C4', 'C3', 'C2']);
  });

  it('detalhes (11/11): contas com e-mail, partidas e feedbacks contados; e-mail nos jogadores e nos feedbacks', async () => {
    const rows: Record<string, unknown[]> = {
      feedback: [{ id: 1, created_at: '2026-11-10T10:00:00Z', user_id: 'u1', display_name: 'Ana', guest: false, category: 'bug', rating: 5, message: 'oi', game_version: '1' }],
      matches: [{ ended_at: '2026-11-10T11:00:00Z', duration_seconds: 600, mode: 'vs_ai', end_reason: 'hq_destroyed', match_players: [{ player_id: 'u1', display_name: 'Ana', is_ai: false, country_id: 'BRA', result: 'win', slot: 0 }] }],
      profiles: [
        { id: 'u1', username: 'ana', display_name: 'Ana' },
        { id: 'u2', username: 'bot123', display_name: null },
      ],
      match_players: [{ player_id: 'u1' }, { player_id: 'u1' }],
    };
    const query = (table: string) => {
      const q = { select: () => q, order: () => q, limit: () => q, not: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows[table], error: null }).then(ok) };
      return q;
    };
    const users = [
      { id: 'u1', email: 'ana@exemplo.com', created_at: '2026-11-01T00:00:00Z', last_sign_in_at: '2026-11-10T09:00:00Z', email_confirmed_at: '2026-11-01T00:01:00Z', app_metadata: { provider: 'email' } },
      { id: 'u2', email: 'x9@temp.mail', created_at: '2026-11-09T00:00:00Z', last_sign_in_at: null, email_confirmed_at: null },
    ];
    const sb = { from: query, auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } } };
    const db = await new DbDetailsCache(() => sb as never).get(Date.now());
    expect(db.error).toBeUndefined();
    expect(db.accounts).toEqual([
      { email: 'x9@temp.mail', username: 'bot123', displayName: null, createdAt: '2026-11-09T00:00:00Z', lastSignIn: null, confirmed: false, provider: null, matches: 0, feedbacks: 0 },
      { email: 'ana@exemplo.com', username: 'ana', displayName: 'Ana', createdAt: '2026-11-01T00:00:00Z', lastSignIn: '2026-11-10T09:00:00Z', confirmed: true, provider: 'email', matches: 2, feedbacks: 1 },
    ]);
    expect(db.feedback![0]).toMatchObject({ email: 'ana@exemplo.com' });
    expect(db.feedback![0]).not.toHaveProperty('user_id');
    expect(db.matches![0]!.players[0]).toMatchObject({ name: 'Ana', email: 'ana@exemplo.com' });
    expect(db.emails?.get('u1')).toBe('ana@exemplo.com');
  });

  it('sem Supabase, os detalhes do banco vêm vazios com o motivo', async () => {
    expect(await new DbDetailsCache(() => null).get(Date.now())).toEqual({ feedback: null, matches: null, error: 'Sem Supabase neste servidor' });
  });
});
