import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../../shared/version.ts';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface Credentials {
  /** Retorna o access token atual do Supabase (renovado automaticamente) ou null para convidado. */
  getToken: () => Promise<string | null>;
  guestId?: string;
  guestName?: string;
}

type Listener = (msg: ServerMessage) => void;
type StatusListener = (status: ConnectionStatus, detail?: string) => void;

/** Códigos de fechamento que não devem provocar reconexão automática. */
const FATAL_CLOSE = new Set([4000, 4001, 4003]);

/**
 * Conexão WebSocket com o servidor de jogo. Reconecta com backoff exponencial e repete o
 * `hello` para que o servidor reassocie o jogador à sala/partida em andamento.
 */
export class GameClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private creds: Credentials | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private manualClose = false;
  status: ConnectionStatus = 'idle';
  /** Latência medida (ms). */
  rtt = 0;

  constructor(private readonly url: string) {}

  connect(creds: Credentials): void {
    this.creds = creds;
    this.manualClose = false;
    this.attempts = 0;
    this.open();
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'logout');
    this.ws = null;
    this.setStatus('idle');
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private open(): void {
    if (!this.creds) return;
    this.setStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.setStatus('failed', `Endereço do servidor inválido: ${String(err)}`);
      return;
    }
    this.ws = ws;

    ws.onopen = async () => {
      const token = await this.creds!.getToken().catch(() => null);
      this.send({ t: 'hello', protocol: PROTOCOL_VERSION, token, guestId: this.creds!.guestId, guestName: this.creds!.guestName });
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.attempts = 0;
        this.setStatus('connected');
        this.startPing();
      } else if (msg.t === 'pong') {
        this.rtt = Math.round(performance.now() - msg.n);
        return;
      }
      for (const l of this.listeners) l(msg);
    };

    ws.onclose = (ev) => {
      this.stopPing();
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.manualClose) return;
      if (FATAL_CLOSE.has(ev.code)) {
        this.setStatus('failed', ev.reason || 'Conexão recusada pelo servidor');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.attempts++;
    if (this.attempts > 8) {
      this.setStatus('failed', 'Não foi possível alcançar o servidor de jogo.');
      return;
    }
    this.setStatus('reconnecting');
    const delay = Math.min(1000 * 2 ** (this.attempts - 1), 15_000);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  /** Reconecta imediatamente (ex.: botão "tentar de novo"). */
  retry(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.attempts = 0;
    this.manualClose = false;
    this.ws?.close();
    this.open();
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ t: 'ping', n: performance.now() }), 5000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setStatus(s: ConnectionStatus, detail?: string): void {
    this.status = s;
    for (const l of this.statusListeners) l(s, detail);
  }
}
