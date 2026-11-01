import { env, normalizeServerUrl } from '../lib/env.ts';
import { bestRegion, parseRegions, probeRegion, type GameRegion } from './regions.ts';

/** Regiões configuradas no build (ver regions.ts). */
export const REGIONS: GameRegion[] = parseRegions(import.meta.env.VITE_GAME_SERVERS as string | undefined, env.gameServerUrl, normalizeServerUrl);
export const multiRegion = REGIONS.length > 1;

const SERVER_KEY = 'knps.server';
const PREF_KEY = 'knps.region';

/**
 * Servidor da última sala em que o jogador entrou (por até 6 h): ao abrir o jogo de novo ele conecta direto nele e a
 * partida em andamento é retomada.
 */
export function rememberedServer(): string | null {
  try {
    const raw = localStorage.getItem(SERVER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { url: string; at: number };
    if (Date.now() - v.at > 6 * 3600_000 || !REGIONS.some((r) => r.url === v.url)) return null;
    return v.url;
  } catch {
    return null;
  }
}

export function rememberServer(url: string): void {
  if (!multiRegion) return;
  try {
    localStorage.setItem(SERVER_KEY, JSON.stringify({ url, at: Date.now() }));
  } catch {
    // sem armazenamento: só não lembra
  }
}

/** Preferência do jogador: 'auto' (menor ping) ou a letra de uma região. */
export function regionPreference(): string {
  try {
    return localStorage.getItem(PREF_KEY) ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function setRegionPreference(v: string): void {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    // ignora
  }
}

/** Último ping medido de cada região (letra → ms; null = não respondeu). */
export const regionPings = new Map<string, number | null>();
let probing: Promise<void> | null = null;
let probedAt = 0;

/** Mede todas as regiões (no máximo uma vez a cada 2 min; chamadas juntas esperam a mesma medição). */
export function probeRegions(force = false): Promise<void> {
  if (!multiRegion) return Promise.resolve();
  if (probing) return probing;
  if (!force && Date.now() - probedAt < 120_000 && regionPings.size) return Promise.resolve();
  probing = Promise.all(
    REGIONS.map(async (r) => {
      regionPings.set(r.letter, await probeRegion(r));
    }),
  ).then(() => {
    probedAt = Date.now();
    probing = null;
  });
  return probing;
}

/** Região para criar uma sala: a escolhida pelo jogador, ou a de menor ping. */
export async function regionForNewRoom(): Promise<GameRegion> {
  const pref = regionPreference();
  const chosen = REGIONS.find((r) => r.letter === pref);
  if (chosen) return chosen;
  await Promise.race([probeRegions(), new Promise((r) => setTimeout(r, 4000))]);
  return bestRegion(REGIONS, regionPings);
}
