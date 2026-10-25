// URL e chave publicável do Supabase são públicas por natureza (vão no bundle do navegador);
// os valores padrão evitam um build quebrado quando as variáveis não chegam ao deploy.
const DEFAULT_SUPABASE_URL = 'https://vzzzfseliawtnodsysrn.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_r1MIE90mrvMkWqbNLXLBJQ_A2_drDSs';

const read = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export const env = {
  supabaseUrl: read(import.meta.env.VITE_SUPABASE_URL) ?? DEFAULT_SUPABASE_URL,
  supabaseAnonKey: read(import.meta.env.VITE_SUPABASE_ANON_KEY) ?? DEFAULT_SUPABASE_ANON_KEY,
  gameServerUrl: read(import.meta.env.VITE_GAME_SERVER_URL) ?? 'ws://localhost:8787/ws',
  allowGuests: import.meta.env.VITE_ALLOW_GUESTS === 'true',
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
