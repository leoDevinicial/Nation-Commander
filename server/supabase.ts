import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BalanceMode, ClientDevice, ClientDiagKind, EndReason, FeedbackCategory, NationalSummary, RoomMode } from '../shared/protocol.ts';
import type { PlayerStats } from '../shared/sim/types.ts';
import type { MatchReport } from '../shared/sim/report.ts';
import type { Slot } from '../shared/sim/types.ts';
import { config } from './config.ts';
import { log } from './logger.ts';
import type { CommunityReport } from './communityChat.ts';
import type { MatchIntegrity } from './kac/integrity.ts';
import type { KacStoreBackend } from './kac/store.ts';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) return null;
  client ??= createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export interface VerifiedUser {
  id: string;
  name: string;
  /** Assinante (`subscriptions.active`): salas com até 6 nações. */
  subscriber: boolean;
}

/** Valida o access token do Supabase Auth e carrega o username do perfil. */
export async function verifyAccessToken(token: string): Promise<VerifiedUser | null | 'retry'> {
  const sb = getSupabase();
  if (!sb) return null;
  let res: Awaited<ReturnType<typeof sb.auth.getUser>>;
  try {
    res = await sb.auth.getUser(token);
  } catch {
    return 'retry';
  }
  const { data, error } = res;
  // 4xx: token inválido ou expirado; sem status, 429 ou 5xx: o Supabase não respondeu direito (20/11)
  if (error) return isTransientAuthError(error.status) ? 'retry' : null;
  if (!data.user) return null;
  const { data: profile } = await sb.from('profiles').select('username, display_name').eq('id', data.user.id).maybeSingle();
  const name = (profile?.display_name as string | null) ?? (profile?.username as string | null) ?? 'Jogador';
  // assinatura em tabela própria (só o servidor lê); sem linha ou com erro, versão grátis
  const { data: sub } = await sb.from('subscriptions').select('active').eq('user_id', data.user.id).maybeSingle();
  return { id: data.user.id, name, subscriber: sub?.active === true };
}

/** Erro de validação que não diz nada sobre o token: rede, limite de requisições ou Supabase fora do ar. */
export function isTransientAuthError(status: number | undefined): boolean {
  return !status || status === 429 || status >= 500;
}

export interface FeedbackRecord {
  user_id: string | null;
  guest: boolean;
  display_name: string;
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  game_version: string;
}

/** Grava um feedback da área Comunidade e Feedback. Sem Supabase, fica só no log do servidor. */
export async function saveFeedback(rec: FeedbackRecord): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) {
    log.info('Feedback recebido (sem Supabase: só no log)', { ...rec });
    return true;
  }
  const { error } = await sb.from('feedback').insert(rec);
  if (error) {
    log.error('Falha ao gravar feedback', { err: error.message });
    return false;
  }
  return true;
}

export interface ClientDiagRecord {
  user_id: string | null;
  guest: boolean;
  display_name: string;
  room_code: string | null;
  in_match: boolean;
  kind: ClientDiagKind;
  detail: string | null;
  device: ClientDevice | null;
  game_version: string;
}

/** Grava um diagnóstico do navegador (tabela `client_diagnostics`). Sem Supabase, fica só no log. */
export async function saveClientDiag(rec: ClientDiagRecord): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('client_diagnostics').insert(rec);
  if (error) {
    log.warn('Falha ao gravar diagnóstico do navegador', { err: error.message });
    return false;
  }
  return true;
}

/** Grava uma denúncia do chat da Comunidade (tabela `community_reports`). Sem Supabase, fica só no log. */
export async function saveCommunityReport(rec: CommunityReport): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) {
    log.info('Denúncia no chat (sem Supabase: só no log)', { ...rec });
    return true;
  }
  const { error } = await sb.from('community_reports').insert(rec);
  if (error) log.error('Falha ao gravar denúncia', { err: error.message });
  return !error;
}

/** KAC-08: destino do diário de segurança no Supabase (tabela `kac_events`). */
export const kacSupabaseBackend: KacStoreBackend = {
  async insert(rows) {
    const sb = getSupabase();
    if (!sb) return true;
    const { error } = await sb.from('kac_events').insert(rows);
    if (error) log.error('KAC: falha ao gravar eventos', { err: error.message });
    return !error;
  },
  async purgeBefore(iso) {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('kac_events').delete().lt('occurred_at', iso);
    if (error) log.error('KAC: falha na retenção', { err: error.message });
  },
};

export interface MatchRecord {
  room_code: string;
  mode: RoomMode;
  map_seed: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  end_reason: EndReason;
  winner_id: string | null;
  game_version: string;
  balance_mode: BalanceMode;
  players: {
    slot: number;
    player_id: string | null;
    is_ai: boolean;
    display_name: string;
    country_id: string;
    result: 'win' | 'loss' | 'draw';
    stats: PlayerStats;
    national: NationalSummary | null;
  }[];
  /** Relatório pós-partida (amostras ao longo do tempo e medalhas), gravado em `matches.report`. */
  report: MatchReport & {
    integrity?: MatchIntegrity;
    /** Quedas de conexão por jogador (20/11): quantas, a mais longa e o motivo de cada uma. */
    connection?: { slot: Slot; drops: number; longestOfflineS: number; causes: Record<string, number> }[];
  };
}

/** Grava a partida via RPC atômica. Retorna true se gravada. */
export async function recordMatch(rec: MatchRecord): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const payload = {
    ...rec,
    players: rec.players.map(({ stats, national, ...p }) => ({
      ...p,
      national_summary: national,
      units_produced: stats.unitsProduced,
      units_lost: stats.unitsLost,
      units_killed: stats.unitsKilled,
      structures_built: stats.structuresBuilt,
      structures_lost: stats.structuresLost,
      structures_destroyed: stats.structuresDestroyed,
      resources_gathered: Math.round(stats.resourcesGathered),
      resources_spent: Math.round(stats.resourcesSpent),
      damage_dealt: Math.round(stats.damageDealt),
    })),
  };
  const { error } = await sb.rpc('record_match', { payload });
  if (error) {
    log.error('Falha ao gravar partida', { error: error.message, room: rec.room_code });
    return false;
  }
  return true;
}
