import { useAppStore } from '../state/useAppStore.ts';
import { gameClient } from './client.ts';
import { LOCAL_URL } from './localSocket.ts';
import { httpBase } from './regions.ts';
import { multiRegion } from './regionState.ts';
import { SERVER_CANDIDATES, nextServer } from './servers.ts';

/**
 * Alternância entre o servidor principal (Railway) e a reserva (Render), 22/11 (`servers.ts`):
 * - sem conexão por `FAIL_AFTER_MS` seguidos, passa para o próximo da lista (e volta a girar se esse também falhar);
 * - na reserva, a cada minuto, fora de uma sala, sonda o principal (`/knps/ping`); respondendo, volta para ele.
 * Nunca troca no meio de uma sala por escolha própria: só quando o servidor dela caiu (e a partida retoma no outro,
 * pelo salvamento no Supabase). Com várias regiões configuradas (`VITE_GAME_SERVERS`), não faz nada.
 */
const FAIL_AFTER_MS = 20_000;
const PROBE_EVERY_MS = 60_000;

const enabled = SERVER_CANDIDATES.length > 1 && !multiRegion;
let downSince: number | null = null;
let switching = false;

const inRoom = () => !!useAppStore.getState().room;

async function switchTo(url: string): Promise<void> {
  if (switching) return;
  switching = true;
  downSince = null;
  try {
    await gameClient.switchTo(url);
  } finally {
    switching = false;
  }
}

async function primaryAlive(): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(`${httpBase(SERVER_CANDIDATES[0]!)}/knps/ping`, { cache: 'no-store', signal: ctl.signal });
    return res.ok || res.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (enabled) {
  gameClient.onStatus((st) => {
    if (st === 'connected') downSince = null;
    else if (st !== 'idle') downSince ??= Date.now();
  });

  setInterval(() => {
    const url = gameClient.serverUrl;
    if (url === LOCAL_URL || !SERVER_CANDIDATES.includes(url) || switching) return;
    // fora do ar há tempo demais: o próximo da lista
    if (gameClient.status !== 'connected' && gameClient.status !== 'idle') {
      downSince ??= Date.now();
      if (Date.now() - downSince >= FAIL_AFTER_MS) void switchTo(nextServer(SERVER_CANDIDATES, url));
    }
  }, 2000);

  setInterval(() => {
    const url = gameClient.serverUrl;
    if (url === LOCAL_URL || url === SERVER_CANDIDATES[0] || gameClient.status !== 'connected' || inRoom() || switching) return;
    void primaryAlive().then((ok) => {
      if (ok && !inRoom() && gameClient.serverUrl === url) void switchTo(SERVER_CANDIDATES[0]!);
    });
  }, PROBE_EVERY_MS);
}
