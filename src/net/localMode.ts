import type { ClientMessage } from '../../shared/protocol.ts';
import { useAppStore } from '../state/useAppStore.ts';
import { useSettingsStore } from '../state/useSettingsStore.ts';
import { gameClient } from './client.ts';
import { LOCAL_URL, localSupported, markLocalActive, onLocalRecord } from './localSocket.ts';
import { REGIONS } from './regionState.ts';
import { env } from '../lib/env.ts';

/**
 * Partida contra a IA no navegador (22/11): quando o `gameClient` fala com o servidor local (endereço `local:`) e quando
 * volta ao remoto.
 * - "Jogar contra a IA" troca para o local (se o aparelho suporta e a opção está ligada) antes de criar a sala;
 * - sair da sala (ou abrir o jogo sem partida local guardada) volta ao remoto;
 * - multijogador, sandbox e tutorial sempre no remoto;
 * - o resultado de cada partida local fica guardado no aparelho até o servidor remoto confirmar o histórico.
 */
const QUEUE_KEY = 'nc.localmatches.v1';
/** O servidor remoto recusa mensagens acima de 16 KB: o resultado vai com as amostras enxugadas até caber. */
const MAX_MSG = 14_000;

let lastRemote = gameClient.serverUrl !== LOCAL_URL ? gameClient.serverUrl : (REGIONS[0]?.url ?? env.gameServerUrl);

export const isLocal = (): boolean => gameClient.serverUrl === LOCAL_URL;

/** A partida contra a IA vai rodar no aparelho? */
export function wantsLocal(): boolean {
  return localSupported() && useSettingsStore.getState().localAi;
}

/**
 * Em que pé está o servidor local: entrando para criar a sala (o "sem sala" do hello é esperado), retomando ao abrir o
 * jogo (sem partida guardada, volta ao remoto) ou numa sala (sair dela volta ao remoto).
 */
let phase: 'idle' | 'entering' | 'resuming' | 'in_room' = gameClient.serverUrl === LOCAL_URL ? 'resuming' : 'idle';

/** Troca para o servidor local; false se não deu (a partida segue no remoto). */
export async function goLocal(): Promise<boolean> {
  if (isLocal() && gameClient.status === 'connected') return true;
  phase = 'entering';
  const ok = await gameClient.switchTo(LOCAL_URL);
  if (!ok) {
    phase = 'idle';
    await ensureRemote();
  }
  return ok;
}

/** Volta ao servidor remoto (multijogador, salas públicas, comunidade). */
export async function ensureRemote(): Promise<boolean> {
  if (!isLocal()) return true;
  return gameClient.switchTo(lastRemote);
}

// ----------------------------------------------------------------- resultados para o histórico

interface Pending {
  id: string;
  rec: unknown;
}

function readQueue(): Pending[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(v) ? (v as Pending[]).slice(-20) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: Pending[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-20)));
  } catch {
    // sem armazenamento: o resultado vale só nesta visita
  }
}

/** Corta as amostras do relatório (uma a cada duas) até a mensagem caber no limite do servidor. */
export function fitRecord(rec: unknown): unknown {
  let out = rec as { report?: { samples?: unknown[] } };
  for (let i = 0; i < 12 && JSON.stringify(out).length > MAX_MSG; i++) {
    const samples = out.report?.samples ?? [];
    out = { ...out, report: { ...out.report, samples: samples.length > 1 ? samples.filter((_, k) => k % 2 === 1) : [] } };
  }
  return out;
}

function flushResults(): void {
  if (isLocal() || gameClient.status !== 'connected') return;
  for (const p of readQueue()) gameClient.send({ t: 'local_match', id: p.id, rec: p.rec } satisfies ClientMessage);
}

onLocalRecord((rec) => {
  // só contas vão para o histórico (como no servidor remoto)
  if (!useAppStore.getState().authUserId) return;
  writeQueue([...readQueue(), { id: crypto.randomUUID(), rec: fitRecord(rec) }]);
  flushResults();
});

gameClient.onStatus((st) => {
  if (st !== 'connected') return;
  if (!isLocal()) {
    lastRemote = gameClient.serverUrl;
    flushResults();
  }
});

gameClient.on((msg) => {
  if (msg.t === 'local_match_ok') writeQueue(readQueue().filter((p) => p.id !== msg.id));
  else if (msg.t === 'room' && isLocal()) {
    markLocalActive(!!msg.room && msg.room.status !== 'ended');
    if (msg.room) phase = 'in_room';
    // saiu da sala local, ou abriu o jogo para retomar e não havia partida guardada: volta ao remoto. Entrando (o
    // hello responde "sem sala" antes do create_room), fica.
    else if (phase === 'in_room' || phase === 'resuming') {
      phase = 'idle';
      setTimeout(() => void ensureRemote(), 0);
    }
  } else if (msg.t === 'match_end' && isLocal()) markLocalActive(false);
});
