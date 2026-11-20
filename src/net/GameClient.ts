import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../../shared/version.ts';
import { NetStats } from './netStats.ts';
import { SnapshotDeltaDecoder, type SnapshotDelta } from '../../shared/net/delta.ts';
import type { Snapshot } from '../../shared/sim/snapshot.ts';

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
  /** Mensagens binárias (comprimidas pelo servidor) descomprimem em fila, na ordem de chegada. */
  private inbox: Promise<void> = Promise.resolve();
  private pendingBinary = 0;
  /** Snapshots delta (15/11): remonta o snapshot completo antes de entregar (`shared/net/delta.ts`). */
  private readonly delta = new SnapshotDeltaDecoder();
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
  /** KNPS: ping, jitter, pings sem resposta e cadência dos snapshots (ver netStats.ts). */
  readonly stats = new NetStats();

  constructor(private url: string) {}

  /** Endereço do servidor em uso. */
  get serverUrl(): string {
    return this.url;
  }

  /**
   * KNPS-08: troca de servidor (outra região) mantendo a mesma conta. Resolve true quando o novo servidor dá o
   * `welcome`; false se não conectar em 15 s (o cliente continua tentando sozinho, como em qualquer queda).
   */
  switchTo(url: string): Promise<boolean> {
    if (url === this.url && this.status === 'connected') return Promise.resolve(true);
    if (!this.creds) return Promise.resolve(false);
    this.url = url;
    return new Promise((resolve) => {
      let off: () => void = () => {};
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, 15_000);
      off = this.onStatus((st) => {
        if (st === 'connected' || st === 'failed') {
          clearTimeout(timer);
          off();
          resolve(st === 'connected');
        }
      });
      this.retry();
    });
  }

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
    this.stats.pingSent();
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

  /** Uma mensagem do servidor, já em texto (`bytes`: tamanho que chegou pela rede, para o painel de conexão). */
  private receive(ws: WebSocket, raw: string, bytes: number): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (this.ws !== ws) return;
    this.unanswered = 0;
    this.stats.message(bytes, msg.t === 'snapshot');
    if (msg.t === 'welcome') {
      this.clearOpenTimer();
      this.attempts = 0;
      this.setStatus('connected');
      this.startPing();
    } else if (msg.t === 'net') {
      this.stats.network(msg.rtt, msg.region);
    } else if (msg.t === 'pong') {
      this.rtt = Math.round(performance.now() - msg.n);
      this.stats.pong(this.rtt);
      return;
    } else if (msg.t === 'snapshot' && !msg.scope) {
      // diferença sobre o snapshot anterior: o resto do jogo sempre recebe o snapshot inteiro
      const full = this.delta.apply(msg.s as Snapshot | SnapshotDelta);
      if (!full) return;
      msg = { ...msg, s: full };
    }
    for (const l of this.listeners) l(msg);
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
    // mensagens comprimidas pelo servidor chegam em binário (ver `inflate` no hello)
    ws.binaryType = 'arraybuffer';
    this.inbox = Promise.resolve();
    this.pendingBinary = 0;
    this.unanswered = 0;
    this.stats.reset();
    // conexão que não abre nem responde ao hello (rede presa): desiste desta e tenta outra
    this.clearOpenTimer();
    this.openTimer = setTimeout(() => {
      if (this.ws === ws && this.status !== 'connected') this.dropDead();
    }, OPEN_TIMEOUT_MS);

    ws.onopen = async () => {
      // conexão nova: o servidor manda o primeiro snapshot completo
      this.delta.reset();
      // sem a compressão do WebSocket (algum proxy no caminho tirou), pede ao servidor que comprima ele mesmo
      const inflate = !/permessage-deflate/.test(ws.extensions) && typeof DecompressionStream !== 'undefined';
      this.stats.compression = /permessage-deflate/.test(ws.extensions) ? 'transporte' : inflate ? 'servidor' : 'nenhuma';
      let token: string | null;
      try {
        token = await this.creds!.getToken();
      } catch {
        // não deu para renovar o token agora (rede voltando): tenta de novo em vez de entrar sem ele (20/11)
        if (this.ws === ws) this.dropDead();
        return;
      }
      if (this.ws !== ws) return;
      this.send({ t: 'hello', protocol: PROTOCOL_VERSION, token, guestId: this.creds!.guestId, guestName: this.creds!.guestName, ...(inflate ? { inflate: true as const } : {}) });
    };

    ws.onmessage = (ev) => {
      const data = ev.data as string | ArrayBuffer;
      // texto sem binário na frente: na hora; binário (ou texto atrás de um binário): em fila, na ordem de chegada
      if (typeof data === 'string' && this.pendingBinary === 0) {
        this.receive(ws, data, data.length);
        return;
      }
      if (typeof data !== 'string') this.pendingBinary++;
      this.inbox = this.inbox
        .then(async () => {
          if (typeof data === 'string') return this.receive(ws, data, data.length);
          const text = await inflateRaw(data).finally(() => this.pendingBinary--);
          this.receive(ws, text, data.byteLength);
        })
        .catch(() => undefined);
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

/** Descomprime uma mensagem binária do servidor (deflate-raw, ver `Connection.sendRaw`). */
async function inflateRaw(buf: ArrayBuffer): Promise<string> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
