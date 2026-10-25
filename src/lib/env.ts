export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  gameServerUrl: (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) ?? 'ws://localhost:8787/ws',
  allowGuests: import.meta.env.VITE_ALLOW_GUESTS === 'true',
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
