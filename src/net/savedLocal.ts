import { SAVED_MATCHES, type SavedMatchInfo } from '../../shared/protocol.ts';
import { useSavedStore } from '../state/useSavedStore.ts';

/**
 * Partidas contra a IA salvas no aparelho (24/11): o servidor local (Web Worker, `server/local/idbStore.ts`) grava no
 * IndexedDB; o menu lê e apaga direto daqui, sem ligar o servidor local só para listar. Continuar liga o servidor local
 * e pede a retomada. Mesmo banco, loja e chave (`~CÓDIGO`) do servidor local.
 */
const DB = 'nc-local-matches';
const STORE = 'matches';
const PREFIX = '~';

interface Row {
  code: string;
  blob: string;
  updatedAt: number;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'code' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function refreshLocalSaved(): Promise<void> {
  const rows = ((await run('readonly', (s) => s.getAll())) ?? []) as Row[];
  const now = Date.now();
  const items: SavedMatchInfo[] = [];
  for (const row of rows) {
    if (!row.code?.startsWith(PREFIX)) continue;
    if (now - row.updatedAt > SAVED_MATCHES.maxAgeMs) {
      await run('readwrite', (s) => s.delete(row.code));
      continue;
    }
    try {
      // só o que a lista usa do salvamento (o tipo completo vive no servidor)
      const save = JSON.parse(row.blob) as { code: string; mode: SavedMatchInfo['mode']; national?: { day?: number }; players: { name: string; countryId: string; isAI: boolean }[] };
      items.push({
        code: save.code,
        mode: save.mode,
        savedAt: row.updatedAt,
        day: save.national?.day ?? 0,
        // no aparelho só há partidas contra a IA: o único humano é quem joga aqui
        players: save.players.map((p) => ({ name: p.name, countryId: p.countryId, isAI: p.isAI, ...(p.isAI ? {} : { me: true }) })),
      });
    } catch {
      await run('readwrite', (s) => s.delete(row.code));
    }
  }
  useSavedStore.getState().set({ local: items.sort((a, b) => b.savedAt - a.savedAt) });
}

export async function deleteLocalSaved(code: string): Promise<void> {
  await run('readwrite', (s) => s.delete(`${PREFIX}${code}`));
  await refreshLocalSaved();
}
