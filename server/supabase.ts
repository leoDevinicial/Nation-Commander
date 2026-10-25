import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EndReason, RoomMode } from '../shared/protocol.ts';
import type { PlayerStats } from '../shared/sim/types.ts';
import { config } from './config.ts';
import { log } from './logger.ts';

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
}

/** Valida o access token do Supabase Auth e carrega o username do perfil. */
export async function verifyAccessToken(token: string): Promise<VerifiedUser | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await sb.from('profiles').select('username, display_name').eq('id', data.user.id).maybeSingle();
  const name = (profile?.display_name as string | null) ?? (profile?.username as string | null) ?? 'Jogador';
  return { id: data.user.id, name };
}

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
  players: {
    slot: number;
    player_id: string | null;
    is_ai: boolean;
    display_name: string;
    country_id: string;
    result: 'win' | 'loss' | 'draw';
    stats: PlayerStats;
  }[];
}

/** Grava a partida via RPC atômica. Retorna true se gravada. */
export async function recordMatch(rec: MatchRecord): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const payload = {
    ...rec,
    players: rec.players.map(({ stats, ...p }) => ({
      ...p,
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
