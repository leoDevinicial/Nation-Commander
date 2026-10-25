// URL e chave publicável do Supabase são públicas por natureza (vão no bundle do navegador);
// os valores padrão evitam um build quebrado quando as variáveis não chegam ao deploy.
const DEFAULT_SUPABASE_URL = 'https://vzzzfseliawtnodsysrn.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_r1MIE90mrvMkWqbNLXLBJQ_A2_drDSs';

const read = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Normaliza o endereço do servidor: https→wss, http→ws e garante o caminho /ws. */
export function normalizeServerUrl(raw: string): string {
  let url = raw.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
  if (!/^wss?:\/\//i.test(url)) url = `wss://${url}`;
  try {
    const u = new URL(url);
    if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
    return u.toString();
  } catch {
    return url;
  }
}

export const env = {
  supabaseUrl: read(import.meta.env.VITE_SUPABASE_URL) ?? DEFAULT_SUPABASE_URL,
  supabaseAnonKey: read(import.meta.env.VITE_SUPABASE_ANON_KEY) ?? DEFAULT_SUPABASE_ANON_KEY,
  gameServerUrl: normalizeServerUrl(read(import.meta.env.VITE_GAME_SERVER_URL) ?? 'ws://localhost:8787/ws'),
  allowGuests: import.meta.env.VITE_ALLOW_GUESTS === 'true',
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
