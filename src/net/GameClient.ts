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
/** Servidor reiniciando (atualização): a partida é gravada e retomada quando a conexão volta. */
const RESTART_CLOSE = 1012;
/**
 * Espera antes de cada nova tentativa (ms): as primeiras são quase imediatas (queda curta de rede no meio da partida
 * volta em menos de 1 s); depois espaça. Somadas, ~2 min 20 s: cobrem um servidor que acorda devagar.
 */
const RETRY_DELAYS = [250, 750, 1500, 2500, 4000, 6000, 8000, 10_000];
const MAX_ATTEMPTS = 18;
/** Ping de vida (ms): o servidor responde na hora; na partida os snapshots já chegam 10 por segundo. */
const PING_MS = 2500;
/**
 * Pings seguidos sem nenhuma mensagem de volta: a conexão morreu sem o navegador avisar (Wi-Fi trocou, celular dormiu,
 * proxy cortou). Conta pings, e não tempo, porque o navegador atrasa os relógios da aba em segundo plano.
 */
const DEAD_AFTER_PINGS = 3;
/** Abrir a conexão e receber o `welcome` não pode passar disso (ms). */
const OPEN_TIMEOUT_MS = 9000;

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
  /** Pings enviados desde a última mensagem recebida. */
  private unanswered = 0;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeHooked = false;
  status: ConnectionStatus = 'idle';
  /** Latência medida (ms). */
  rtt = 0;

  constructor(private readonly url: string) {}

  connect(creds: Credentials): void {
    this.creds = creds;
    this.manualClose = false;
    this.attempts = 0;
    this.hookWake();
    this.open();
  }

  /**
   * A rede voltou (evento `online`) ou a aba voltou a ficar visível: em vez de esperar o próximo intervalo, tenta na
   * hora; se parecia conectado mas está mudo há um tempo, a conexão morreu sem aviso e é refeita.
   */
  private hookWake(): void {
    if (this.wakeHooked || typeof window === 'undefined') return;
    this.wakeHooked = true;
    const wake = () => {
      if (this.manualClose || !this.creds) return;
      if (this.status === 'reconnecting') this.reconnectNow();
      else if (this.status === 'connected') this.probe();
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
    });
  }

  /** Abandona a conexão atual (sem esperar o fechamento, que numa conexão morta pode levar minutos) e reconecta. */
  private dropDead(): void {
    const ws = this.ws;
    this.ws = null;
    this.stopPing();
    this.clearOpenTimer();
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        // já fechada
      }
    }
    if (this.manualClose) return;
    this.scheduleReconnect('Conexão instável: reconectando');
  }

  /** Pergunta ao servidor se a conexão vive: sem resposta em 3 s, refaz. */
  private probe(): void {
    if (this.probeTimer) return;
    const ws = this.ws;
    const before = this.unanswered;
    this.sendPing();
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      if (this.ws === ws && this.status === 'connected' && this.unanswered > before) this.dropDead();
    }, 3000);
  }

  private sendPing(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.unanswered++;
    this.ws.send(JSON.stringify({ t: 'ping', n: performance.now() } satisfies ClientMessage));
  }

  private reconnectNow(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.open();
  }

  private clearOpenTimer(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearOpenTimer();
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'logout');
    this.ws = null;
    this.setStatus('idle');
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    // conectado só no papel: o servidor parou de responder e a mensagem se perderia (render-se ficava em "Encerrando…")
    if (this.status === 'connected' && this.unanswered >= DEAD_AFTER_PINGS - 1) {
      this.dropDead();
      return false;
    }
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
    this.setStatus(this.attempts === 0 ? 'connecting' : 'reconnecting', this.lastDetail);
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.setStatus('failed', `Endereço do servidor inválido: ${String(err)}`);
      return;
    }
    this.ws = ws;
    this.unanswered = 0;
    // conexão que não abre nem responde ao hello (rede presa): desiste desta e tenta outra
    this.clearOpenTimer();
    this.openTimer = setTimeout(() => {
      if (this.ws === ws && this.status !== 'connected') this.dropDead();
    }, OPEN_TIMEOUT_MS);

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
      if (this.ws !== ws) return;
      this.unanswered = 0;
      if (msg.t === 'welcome') {
        this.clearOpenTimer();
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
      if (this.ws !== ws) return;
      this.stopPing();
      this.clearOpenTimer();
      this.ws = null;
      if (this.manualClose) return;
      if (FATAL_CLOSE.has(ev.code)) {
        this.setStatus('failed', ev.reason || 'Conexão recusada pelo servidor');
        return;
      }
      if (ev.code === RESTART_CLOSE) this.attempts = 0;
      this.scheduleReconnect(ev.code === RESTART_CLOSE ? 'Servidor atualizando: a partida será retomada' : undefined);
    };
  }

  private scheduleReconnect(detail?: string): void {
    this.attempts++;
    if (this.attempts > MAX_ATTEMPTS) {
      this.setStatus('failed', 'Não foi possível alcançar o servidor de jogo.');
      return;
    }
    this.setStatus('reconnecting', detail ?? this.lastDetail);
    const delay = RETRY_DELAYS[Math.min(this.attempts - 1, RETRY_DELAYS.length - 1)]!;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  /** Reconecta imediatamente (ex.: botão "tentar de novo"). */
  retry(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.attempts = 0;
    this.manualClose = false;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close();
    }
    this.stopPing();
    this.open();
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.unanswered >= DEAD_AFTER_PINGS) {
        this.dropDead();
        return;
      }
      this.sendPing();
    }, PING_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Motivo da queda atual (mantido nas tentativas seguintes até reconectar). */
  private lastDetail: string | undefined;

  private setStatus(s: ConnectionStatus, detail?: string): void {
    this.status = s;
    this.lastDetail = s === 'reconnecting' ? detail : undefined;
    for (const l of this.statusListeners) l(s, detail);
  }
}
