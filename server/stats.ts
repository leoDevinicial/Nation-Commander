import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Painel de números do jogo (06/11): contas registradas, jogadores online, partidas do dia e duração média. Só por link
 * direto: a página `/painel` do site chama `GET /stats` aqui com `Authorization: Bearer <STATS_TOKEN>` (o token viaja no
 * fragmento `#` do link, que o navegador não manda a servidor nenhum). Sem token configurado, o endpoint não existe
 * (404). Só números agregados: nenhum nome, id ou IP sai daqui.
 */
export const STATS_POLICY = {
  minTokenLength: 24,
  maxFailures: 10,
  failureWindowMs: 10 * 60_000,
  /** As consultas ao banco ficam em cache por este tempo (a página atualiza sozinha). */
  cacheMs: 30_000,
  /** Fuso do "dia": o horário de Brasília (UTC−3, sem horário de verão desde 2019). */
  timeZone: 'America/Sao_Paulo',
  utcOffset: '-03:00',
};

/** Dia (AAAA-MM-DD) no fuso do painel. */
export function dayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STATS_POLICY.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Início do dia (ISO) no fuso do painel, `daysAgo` dias atrás. */
export function dayStartIso(ms: number, daysAgo = 0): string {
  const start = new Date(`${dayKey(ms)}T00:00:00${STATS_POLICY.utcOffset}`).getTime() - daysAgo * 86_400_000;
  return new Date(start).toISOString();
}

interface DayTally {
  matches: number;
  seconds: number;
  /** Partidas só de convidados (não vão para o banco). */
  guestOnly: number;
}

/**
 * Contagem em memória das partidas encerradas neste servidor (inclui as só de convidados, que o banco não grava). Zera
 * num reinício; o Sandbox não conta.
 */
export class MatchTally {
  readonly startedAt = Date.now();
  private readonly days = new Map<string, DayTally>();

  record(endedAtMs: number, durationSeconds: number, registered: boolean): void {
    const k = dayKey(endedAtMs);
    const d = this.days.get(k) ?? { matches: 0, seconds: 0, guestOnly: 0 };
    d.matches++;
    d.seconds += Math.max(0, durationSeconds);
    if (!registered) d.guestOnly++;
    this.days.set(k, d);
    if (this.days.size > 14) this.days.delete(this.days.keys().next().value!);
  }

  today(now: number): { matches: number; avgSeconds: number | null; guestOnly: number } {
    const d = this.days.get(dayKey(now));
    return { matches: d?.matches ?? 0, avgSeconds: d && d.matches ? Math.round(d.seconds / d.matches) : null, guestOnly: d?.guestOnly ?? 0 };
  }
}

export const matchTally = new MatchTally();

/** Uma partida encerrada neste servidor, para a lista do painel (07/11). */
export interface RecentMatch {
  endedAt: string;
  durationSeconds: number;
  mode: string;
  map: string | null;
  reason: string;
  players: { name: string; ai: boolean; guest: boolean; country: string; result: 'win' | 'loss' | 'draw'; uid?: string; email?: string }[];
}

/**
 * Últimas partidas encerradas neste servidor, em memória (inclui as só de convidados, que o banco não grava). Zera num
 * reinício; o Sandbox não entra.
 */
export class RecentMatches {
  private readonly list: RecentMatch[] = [];

  constructor(readonly max = 40) {}

  record(m: RecentMatch): void {
    this.list.unshift(m);
    if (this.list.length > this.max) this.list.length = this.max;
  }

  all(): RecentMatch[] {
    return [...this.list];
  }
}

export const recentMatches = new RecentMatches();

export interface DbStats {
  accounts: number | null;
  today: { matches: number; avgSeconds: number | null } | null;
  week: { matches: number; avgSeconds: number | null } | null;
  error?: string;
}

const avg = (rows: { duration_seconds: number }[]) => (rows.length ? Math.round(rows.reduce((a, r) => a + r.duration_seconds, 0) / rows.length) : null);

/** Números do banco (contas e partidas gravadas), com cache curto. */
export class DbStatsCache {
  private cached: { at: number; value: DbStats } | null = null;

  constructor(private readonly sb: () => SupabaseClient | null) {}

  async get(now: number): Promise<DbStats> {
    if (this.cached && now - this.cached.at < STATS_POLICY.cacheMs) return this.cached.value;
    const sb = this.sb();
    if (!sb) return { accounts: null, today: null, week: null, error: 'Sem Supabase neste servidor' };
    try {
      const [acc, today, week] = await Promise.all([
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        sb.from('matches').select('duration_seconds').gte('ended_at', dayStartIso(now)).limit(10_000),
        sb.from('matches').select('duration_seconds').gte('ended_at', dayStartIso(now, 6)).limit(50_000),
      ]);
      const value: DbStats = {
        accounts: acc.count ?? null,
        today: today.data ? { matches: today.data.length, avgSeconds: avg(today.data) } : null,
        week: week.data ? { matches: week.data.length, avgSeconds: avg(week.data) } : null,
        ...(acc.error || today.error || week.error ? { error: 'Falha parcial na consulta ao banco' } : {}),
      };
      this.cached = { at: now, value };
      return value;
    } catch {
      return { accounts: null, today: null, week: null, error: 'Banco indisponível' };
    }
  }
}

export interface FeedbackRow {
  id: number;
  created_at: string;
  display_name: string;
  email?: string;
  guest: boolean;
  category: string;
  rating: number | null;
  message: string;
  game_version: string;
}

export interface DbMatchRow {
  ended_at: string;
  duration_seconds: number;
  mode: string;
  end_reason: string;
  players: { name: string; ai: boolean; country: string; result: string; email?: string }[];
}

/** Conta registrada (11/11, só na chave de detalhes): para o responsável ver se é jogador de verdade ou cadastro falso. */
export interface AccountRow {
  email: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignIn: string | null;
  confirmed: boolean;
  provider: string | null;
  matches: number;
  feedbacks: number;
}

export interface DbDetails {
  feedback: FeedbackRow[] | null;
  matches: DbMatchRow[] | null;
  accounts?: AccountRow[] | null;
  /** E-mail por id de conta (não sai na resposta: serve para pôr o e-mail nas partidas da memória). */
  emails?: Map<string, string>;
  error?: string;
}

/** Feedbacks e partidas gravadas mais recentes (só para a chave de detalhes), com cache curto. */
export class DbDetailsCache {
  private cached: { at: number; value: DbDetails } | null = null;

  constructor(
    private readonly sb: () => SupabaseClient | null,
    readonly limits = { feedback: 50, matches: 30, accounts: 500 },
  ) {}

  async get(now: number): Promise<DbDetails> {
    if (this.cached && now - this.cached.at < STATS_POLICY.cacheMs) return this.cached.value;
    const sb = this.sb();
    if (!sb) return { feedback: null, matches: null, error: 'Sem Supabase neste servidor' };
    try {
      const [fb, mt, users, profiles, plays] = await Promise.all([
        sb.from('feedback').select('id, created_at, user_id, display_name, guest, category, rating, message, game_version').order('created_at', { ascending: false }).limit(this.limits.feedback),
        sb
          .from('matches')
          .select('ended_at, duration_seconds, mode, end_reason, match_players(player_id, display_name, is_ai, country_id, result, slot)')
          .order('ended_at', { ascending: false })
          .limit(this.limits.matches),
        listAllUsers(sb),
        sb.from('profiles').select('id, username, display_name').limit(10_000),
        sb.from('match_players').select('player_id').not('player_id', 'is', null).limit(100_000),
      ]);
      const emails = new Map<string, string>();
      for (const u of users ?? []) if (u.email) emails.set(u.id, u.email);
      const prof = new Map(((profiles.data ?? []) as { id: string; username: string; display_name: string | null }[]).map((p) => [p.id, p]));
      const played = new Map<string, number>();
      for (const r of (plays.data ?? []) as { player_id: string }[]) played.set(r.player_id, (played.get(r.player_id) ?? 0) + 1);
      const fbRows = (fb.data as (FeedbackRow & { user_id: string | null })[] | null) ?? null;
      const wrote = new Map<string, number>();
      for (const f of fbRows ?? []) if (f.user_id) wrote.set(f.user_id, (wrote.get(f.user_id) ?? 0) + 1);
      const accounts: AccountRow[] | null = users
        ? users
            .map((u) => ({
              email: u.email ?? null,
              username: prof.get(u.id)?.username ?? null,
              displayName: prof.get(u.id)?.display_name ?? null,
              createdAt: u.created_at,
              lastSignIn: u.last_sign_in_at ?? null,
              confirmed: !!u.email_confirmed_at,
              provider: u.app_metadata?.provider ?? null,
              matches: played.get(u.id) ?? 0,
              feedbacks: wrote.get(u.id) ?? 0,
            }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, this.limits.accounts)
        : null;
      type Mp = { player_id: string | null; display_name: string; is_ai: boolean; country_id: string; result: string; slot: number };
      const matches = mt.data
        ? (mt.data as unknown as (Omit<DbMatchRow, 'players'> & { match_players: Mp[] | null })[]).map((m) => ({
            ended_at: m.ended_at,
            duration_seconds: m.duration_seconds,
            mode: m.mode,
            end_reason: m.end_reason,
            players: [...(m.match_players ?? [])]
              .sort((a, b) => a.slot - b.slot)
              .map((p) => ({ name: p.display_name, ai: p.is_ai, country: p.country_id, result: p.result, ...(p.player_id && emails.has(p.player_id) ? { email: emails.get(p.player_id)! } : {}) })),
          }))
        : null;
      const value: DbDetails = {
        feedback: fbRows ? fbRows.map(({ user_id, ...f }) => ({ ...f, ...(user_id && emails.has(user_id) ? { email: emails.get(user_id)! } : {}) })) : null,
        matches,
        accounts,
        emails,
        ...(fb.error || mt.error || !users || profiles.error || plays.error ? { error: 'Falha parcial na consulta ao banco' } : {}),
      };
      this.cached = { at: now, value };
      return value;
    } catch {
      return { feedback: null, matches: null, error: 'Banco indisponível' };
    }
  }
}

type AuthUser = { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; app_metadata?: { provider?: string } };

/** Todas as contas do Supabase Auth (precisa da service role), em páginas de 1.000; null se falhar. */
async function listAllUsers(sb: SupabaseClient): Promise<AuthUser[] | null> {
  const out: AuthUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return out.length ? out : null;
    out.push(...(data.users as AuthUser[]));
    if (data.users.length < 1000) break;
  }
  return out;
}

/**
 * Chave de detalhes provisória (07/11): feedbacks e nomes dos comandantes não são públicos como os agregados, então a
 * chave não fica no código, só o SHA-256 dela (o responsável recebeu a chave em conversa). Abre o painel inteiro
 * enquanto `STATS_TOKEN` não existe; com a variável definida, só ela abre os detalhes.
 */
export const PROVISIONAL_DETAILS_KEY_SHA256 = 'c55e945b74b2d06b4d7bc765a9963a4a8dd24276d21176b576f6f3fe8ec92f35';

/**
 * Chave provisória (06/11, pedido do responsável enquanto não dá para criar `STATS_TOKEN` no Render): vale só quando a
 * variável não existe. Os números são públicos de propósito (só agregados), então ela pode ficar no código; ao definir
 * `STATS_TOKEN`, esta deixa de funcionar.
 */
export const PROVISIONAL_STATS_TOKEN = 'HkL665Bn&8D';

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Confere o token (tempo constante) e bloqueia por um tempo o IP com muitas tentativas erradas. */
export class StatsGate {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly token: string | undefined,
    private readonly now: () => number = Date.now,
    /** Outras chaves aceitas, pelo SHA-256 (a chave em si não fica no código). */
    private readonly extraHashes: Buffer[] = [],
  ) {}

  /** O token principal vale (comprido o bastante, ou a chave provisória pública). */
  private get tokenOk(): boolean {
    return !!this.token && (this.token.length >= STATS_POLICY.minTokenLength || this.token === PROVISIONAL_STATS_TOKEN);
  }

  get enabled(): boolean {
    return this.tokenOk || this.extraHashes.length > 0;
  }

  /** 200 liberado, 401 token errado, 404 painel desligado, 429 tentativas demais. */
  check(authorization: string | undefined, ip: string): 200 | 401 | 404 | 429 {
    if (!this.enabled) return 404;
    const now = this.now();
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < STATS_POLICY.failureWindowMs);
    if (recent.length >= STATS_POLICY.maxFailures) return 429;
    const given = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '')?.[1];
    const h = given ? sha(given) : null;
    const match = !!h && ((this.tokenOk && timingSafeEqual(h, sha(this.token!))) || this.extraHashes.some((x) => x.length === h.length && timingSafeEqual(h, x)));
    if (!match) {
      recent.push(now);
      this.failures.set(ip, recent);
      if (this.failures.size > 1000) this.failures.clear();
      return 401;
    }
    this.failures.delete(ip);
    return 200;
  }
}
