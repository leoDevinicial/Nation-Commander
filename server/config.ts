function bool(v: string | undefined): boolean {
  return v === '1' || v?.toLowerCase() === 'true';
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  /** service_role: necessária para validar sessões e gravar partidas. */
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  allowGuests: bool(process.env.ALLOW_GUESTS),
  /** Tempo para um jogador desconectado voltar antes de perder por abandono. */
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS ?? 60_000),
  maxRooms: Number(process.env.MAX_ROOMS ?? 200),
  /** Intervalo de gravação das partidas em andamento (para retomar após reinício). */
  saveIntervalMs: Number(process.env.SAVE_INTERVAL_MS ?? 30_000),
  /** Sem Supabase: diretório onde gravar as partidas (vazio = não grava). */
  matchStoreDir: process.env.MATCH_STORE_DIR ?? '',
};

export type ServerConfig = typeof config;
