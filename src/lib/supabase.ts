import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, supabaseConfigured } from './env.ts';

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  preferred_country: string | null;
  created_at: string;
}

export interface PlayerStatsRow {
  player_id: string;
  username: string;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  units_produced: number;
  units_killed: number;
  units_lost: number;
  structures_destroyed: number;
  resources_gathered: number;
  total_seconds_played: number;
}

export interface MatchHistoryRow {
  match_id: string;
  slot: number;
  result: 'win' | 'loss' | 'draw';
  country_id: string;
  units_killed: number;
  units_lost: number;
  matches: {
    mode: 'pvp' | 'vs_ai';
    ended_at: string;
    duration_seconds: number;
    end_reason: string;
  } | null;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
