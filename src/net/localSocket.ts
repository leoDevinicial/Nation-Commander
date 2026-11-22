import { useAppStore } from '../state/useAppStore.ts';

/**
 * "WebSocket" da partida contra a IA no navegador (22/11): fala com o servidor local, que roda num Web Worker
 * (`server/local/worker.ts`), com a mesma interface que o `GameClient` usa do WebSocket. O endereço `local:` no
 * `GameClient` abre um destes em vez de um WebSocket de verdade; todo o resto (hello, reconexão, snapshots delta,
 * formato binário) segue igual.
 */
export const LOCAL_URL = 'local:';

type Out = { k: 'msg'; cid: number; data: string | ArrayBuffer } | { k: 'closed'; cid: number; code: number; reason: string } | { k: 'record'; rec: unknown };

let worker: Worker | null = null;
let nextCid = 1;
const sockets = new Map<number, LocalSocket>();
const recordListeners = new Set<(rec: unknown) => void>();

const ACTIVE_KEY = 'nc.local.active.v1';

/** Marca "há partida local em andamento": ao abrir o jogo de novo, ele conecta direto ao servidor local e a retoma. */
export function markLocalActive(on: boolean): void {
  try {
    if (on) localStorage.setItem(ACTIVE_KEY, String(Date.now()));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // sem armazenamento: só não retoma sozinho
  }
}

/** Há partida local recente para retomar (até 12 h, como os salvamentos do servidor)? */
export function localActive(): boolean {
  try {
    const at = Number(localStorage.getItem(ACTIVE_KEY));
    return at > 0 && Date.now() - at < 12 * 3600_000;
  } catch {
    return false;
  }
}

/** O navegador consegue rodar a partida local (Web Worker de módulo)? */
export function localSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined';
}

/** Quem joga: a conta do navegador ou o convidado (o servidor local não tem como validar o token). */
function identity() {
  const s = useAppStore.getState();
  if (s.authUserId) return { id: s.authUserId, name: s.profile?.display_name ?? s.profile?.username ?? s.serverUser?.name ?? 'Jogador' };
  return s.guest ? { id: null, name: s.guest.name } : null;
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('../../server/local/worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<Out>) => {
    const m = e.data;
    if (m.k === 'record') {
      for (const l of recordListeners) l(m.rec);
      return;
    }
    const s = sockets.get(m.cid);
    if (!s) return;
    if (m.k === 'msg') s.deliver(m.data);
    else s.serverClosed(m.code, m.reason);
  };
  w.onerror = () => {
    // worker quebrou: as conexões caem e o GameClient tenta de novo (abre outro)
    worker = null;
    for (const s of [...sockets.values()]) s.serverClosed(1011, 'servidor local falhou');
  };
  // a página vai para o fundo ou fecha: grava a partida agora
  const flush = () => w.postMessage({ k: 'flush' });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  worker = w;
  return w;
}

/** Resultado de uma partida local terminada (para o histórico no servidor remoto). */
export function onLocalRecord(fn: (rec: unknown) => void): () => void {
  recordListeners.add(fn);
  return () => recordListeners.delete(fn);
}

export class LocalSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly OPEN = 1;
  readyState = 0;
  binaryType: BinaryType = 'arraybuffer';
  /** Sem compressão de transporte (nada a comprimir: não há rede). */
  readonly extensions = '';
  readonly url = LOCAL_URL;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private readonly cid = nextCid++;
  private readonly w: Worker;

  constructor() {
    this.w = getWorker();
    sockets.set(this.cid, this);
    this.w.postMessage({ k: 'identity', me: identity() });
    this.w.postMessage({ k: 'open', cid: this.cid });
    // abre no próximo giro, como um WebSocket (quem criou ainda vai pendurar o onopen)
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send(data: string): void {
    if (this.readyState !== 1) return;
    this.w.postMessage({ k: 'msg', cid: this.cid, data });
  }

  close(code = 1000): void {
    if (this.readyState >= 2) return;
    this.w.postMessage({ k: 'close', cid: this.cid, code });
    this.finish(code, '');
  }

  deliver(data: string | ArrayBuffer): void {
    if (this.readyState !== 1) return;
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  serverClosed(code: number, reason: string): void {
    this.finish(code, reason);
  }

  private finish(code: number, reason: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    sockets.delete(this.cid);
    this.onclose?.(new CloseEvent('close', { code, reason, wasClean: code === 1000 }));
  }
}
