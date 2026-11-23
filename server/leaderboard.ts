import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ranking e temporada mensal (23/11). Cada mês é uma temporada; vale quem tem conta e partidas gravadas pelo servidor
 * (multijogador e contra a IA no servidor). A partida contra a IA que rodou no navegador fica de fora (`verdict =
 * 'local'`: o resultado vem do aparelho e não é verificável). Ordem: vitórias, depois aproveitamento, depois menos
 * partidas. Os três primeiros da temporada passada ganham o título da temporada.
 */
export interface LeaderRow {
  name: string;
  wins: number;
  played: number;
}

export interface Leaderboard {
  season: { label: string; start: string; end: string };
  rows: LeaderRow[];
  last: { label: string; champions: (LeaderRow & { title: string })[] };
}

export const LEADERBOARD = { cacheMs: 5 * 60_000, top: 50, titles: ['Marechal da Temporada', 'General da Temporada', 'Coronel da Temporada'] };

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Início (UTC) do mês de `now` deslocado por `offset` meses. */
export function monthStart(now: number, offset = 0): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}

export const seasonLabel = (start: Date): string => `${MONTHS[start.getUTCMonth()]} de ${start.getUTCFullYear()}`;

export interface Participation {
  player_id: string | null;
  display_name: string;
  result: string;
  verdict?: string | null;
}

/** Soma as participações de uma temporada (sem IA e sem partida local) e ordena. */
export function rank(rows: readonly Participation[]): LeaderRow[] {
  const by = new Map<string, LeaderRow>();
  for (const r of rows) {
    if (!r.player_id || r.verdict === 'local') continue;
    let p = by.get(r.player_id);
    if (!p) by.set(r.player_id, (p = { name: r.display_name, wins: 0, played: 0 }));
    p.played++;
    if (r.result === 'win') p.wins++;
  }
  return [...by.values()].sort((a, b) => b.wins - a.wins || b.wins / b.played - a.wins / a.played || a.played - b.played || a.name.localeCompare(b.name));
}

export class LeaderboardCache {
  private cached: { at: number; value: Leaderboard } | null = null;

  constructor(private readonly sb: () => SupabaseClient | null) {}

  private async season(sb: SupabaseClient, from: Date, to: Date): Promise<LeaderRow[]> {
    const { data, error } = await sb
      .from('match_players')
      .select('player_id, display_name, result, matches!inner(ended_at, report->integrity->>verdict)')
      .not('player_id', 'is', null)
      .gte('matches.ended_at', from.toISOString())
      .lt('matches.ended_at', to.toISOString())
      .limit(50_000);
    if (error || !data) throw new Error(error?.message ?? 'sem dados');
    return rank(
      (data as unknown as { player_id: string | null; display_name: string; result: string; matches: { verdict?: string | null } | { verdict?: string | null }[] }[]).map((r) => {
        const m = Array.isArray(r.matches) ? r.matches[0] : r.matches;
        return { player_id: r.player_id, display_name: r.display_name, result: r.result, verdict: m?.verdict ?? null };
      }),
    );
  }

  async get(now: number): Promise<Leaderboard | null> {
    if (this.cached && now - this.cached.at < LEADERBOARD.cacheMs) return this.cached.value;
    const sb = this.sb();
    if (!sb) return null;
    const start = monthStart(now);
    const next = monthStart(now, 1);
    const prev = monthStart(now, -1);
    try {
      const [cur, last] = await Promise.all([this.season(sb, start, next), this.season(sb, prev, start)]);
      const value: Leaderboard = {
        season: { label: seasonLabel(start), start: start.toISOString(), end: next.toISOString() },
        rows: cur.slice(0, LEADERBOARD.top),
        last: { label: seasonLabel(prev), champions: last.slice(0, 3).filter((r) => r.wins > 0).map((r, i) => ({ ...r, title: LEADERBOARD.titles[i]! })) },
      };
      this.cached = { at: now, value };
      return value;
    } catch {
      return this.cached?.value ?? null;
    }
  }
}
