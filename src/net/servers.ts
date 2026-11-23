import { env, normalizeServerUrl } from '../lib/env.ts';

/**
 * Servidores de jogo em ordem de preferência (22/11). O principal é o do Railway; o da Vercel (`VITE_GAME_SERVER_URL`,
 * o Render) fica de reserva. Se o principal não responder, o jogo passa para a reserva e volta quando ele voltar
 * (`failover.ts`). Os dois gravam as partidas em andamento no mesmo Supabase: a partida retoma no outro.
 *
 * O principal fica no código porque a variável da Vercel não pôde ser trocada (22/11); `VITE_PRIMARY_SERVER_URL`
 * substitui, e `VITE_PRIMARY_SERVER_URL=off` desliga. No desenvolvimento local, só o servidor local.
 */
export const RAILWAY_SERVER = 'wss://nation-commander-server-production.up.railway.app/ws';

function primary(): string | null {
  const v = (import.meta.env.VITE_PRIMARY_SERVER_URL as string | undefined)?.trim();
  if (v === 'off') return null;
  if (v) return normalizeServerUrl(v);
  return import.meta.env.PROD ? RAILWAY_SERVER : null;
}

/** Principal primeiro, depois a reserva, sem repetir. */
export function serverCandidates(main = primary(), fallback = env.gameServerUrl): string[] {
  return [...new Set([main, fallback].filter((u): u is string => !!u))];
}

export const SERVER_CANDIDATES = serverCandidates();

/** Próximo servidor da lista depois de `current` (volta ao primeiro). */
export function nextServer(list: readonly string[], current: string): string {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length] ?? current;
}
