import type { MatchStore, StoredMatch } from '../matchStore.ts';
import { isSuspendedKey } from '../savedKeys.ts';

/**
 * Salvamento da partida local no IndexedDB do aparelho (22/11): recarregar a página ou fechar e abrir o navegador
 * retoma a partida contra a IA de onde parou (com até alguns segundos de diferença). Uma loja, chave = código da sala.
 */
interface Row {
  code: string;
  userIds: string[];
  blob: string;
  updatedAt: number;
}

type IDBish = {
  open(name: string, version: number): {
    result: IDBDb;
    error: unknown;
    onupgradeneeded: (() => void) | null;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
  };
};
type IDBReq<T> = { result: T; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };
type IDBDb = {
  objectStoreNames: { contains(n: string): boolean };
  createObjectStore(n: string, o: { keyPath: string }): unknown;
  transaction(n: string, mode: 'readonly' | 'readwrite'): { objectStore(n: string): IDBObjStore };
};
type IDBObjStore = { put(v: Row): IDBReq<unknown>; delete(k: string): IDBReq<unknown>; getAll(): IDBReq<Row[]> };

const DB = 'nc-local-matches';
const STORE = 'matches';

export class IdbMatchStore implements MatchStore {
  readonly kind = 'aparelho';
  private db: Promise<IDBDb> | null = null;

  private open(): Promise<IDBDb> {
    const idb = (globalThis as unknown as { indexedDB?: IDBish }).indexedDB;
    if (!idb) return Promise.reject(new Error('sem IndexedDB'));
    return (this.db ??= new Promise((resolve, reject) => {
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'code' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        this.db = null;
        reject(req.error);
      };
    }));
  }

  private async run<T>(mode: 'readonly' | 'readwrite', fn: (s: IDBObjStore) => IDBReq<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async save(code: string, userIds: readonly string[], blob: string): Promise<void> {
    await this.run('readwrite', (s) => s.put({ code, userIds: [...userIds], blob, updatedAt: Date.now() }));
  }

  async findByUser(userId: string): Promise<StoredMatch | null> {
    const rows = await this.run('readonly', (s) => s.getAll()).catch(() => [] as Row[]);
    let best: StoredMatch | null = null;
    for (const r of rows) if (!isSuspendedKey(r.code) && r.userIds.includes(userId) && (!best || r.updatedAt > best.updatedAt)) best = { code: r.code, blob: r.blob, updatedAt: r.updatedAt };
    return best;
  }

  async listSuspended(userId: string): Promise<StoredMatch[]> {
    const rows = await this.run('readonly', (s) => s.getAll()).catch(() => [] as Row[]);
    return rows
      .filter((r) => isSuspendedKey(r.code) && r.userIds.includes(userId))
      .map((r) => ({ code: r.code, blob: r.blob, updatedAt: r.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(key: string): Promise<(StoredMatch & { userIds: string[] }) | null> {
    const rows = await this.run('readonly', (s) => s.getAll()).catch(() => [] as Row[]);
    const r = rows.find((x) => x.code === key);
    return r ? { code: key, blob: r.blob, updatedAt: r.updatedAt, userIds: [...r.userIds] } : null;
  }

  async remove(code: string): Promise<void> {
    await this.run('readwrite', (s) => s.delete(code)).catch(() => undefined);
  }
}
