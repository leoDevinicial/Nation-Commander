import './envShim.ts';
import type { MatchRecord } from '../supabase.ts';
import { idbAvailable } from './idbAvailable.ts';
import { IdbMatchStore } from './idbStore.ts';
import { LocalServer, type LocalIdentity } from './LocalServer.ts';

/**
 * Web Worker da partida contra a IA no navegador (22/11; ver `LocalServer.ts`). Mensagens da página:
 * - `{ k: 'open', cid }`, `{ k: 'msg', cid, data }`, `{ k: 'close', cid, code }`: as "conexões" (`src/net/localSocket.ts`);
 * - `{ k: 'identity', me }`: quem joga (conta ou convidado);
 * - `{ k: 'flush' }`: a página vai para o fundo ou fecha: grava a partida agora.
 * Para a página: `{ k: 'msg', cid, data }`, `{ k: 'closed', cid, code, reason }` e `{ k: 'record', rec }` (resultado).
 */
type In =
  | { k: 'open'; cid: number }
  | { k: 'msg'; cid: number; data: string }
  | { k: 'close'; cid: number; code?: number }
  | { k: 'identity'; me: LocalIdentity | null }
  | { k: 'flush' };

const ctx = globalThis as unknown as {
  onmessage: ((e: { data: In }) => void) | null;
  postMessage: (m: unknown, transfer?: ArrayBuffer[]) => void;
};

let me: LocalIdentity | null = null;
const server = new LocalServer({
  post: (cid, data) => {
    if (typeof data === 'string') ctx.postMessage({ k: 'msg', cid, data });
    else {
      // quadro binário: vai como ArrayBuffer transferido (sem cópia)
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      ctx.postMessage({ k: 'msg', cid, data: buf }, [buf]);
    }
  },
  closed: (cid, code, reason) => ctx.postMessage({ k: 'closed', cid, code, reason }),
  identity: () => me,
  record: async (rec: MatchRecord) => {
    ctx.postMessage({ k: 'record', rec });
    return true;
  },
  store: idbAvailable() ? new IdbMatchStore() : null,
});

// grava a partida a cada 10 s (a página pode fechar sem aviso: perde no máximo esse tanto)
setInterval(() => void server.persist().catch(() => undefined), 10_000);
setInterval(() => server.sweep(), 30_000);

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.k === 'open') server.open(m.cid);
  else if (m.k === 'msg') server.message(m.cid, m.data);
  else if (m.k === 'close') server.close(m.cid, m.code);
  else if (m.k === 'identity') me = m.me;
  else if (m.k === 'flush') void server.persist(true).catch(() => undefined);
};
