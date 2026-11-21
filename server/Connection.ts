import { deflateRawSync } from 'node:zlib';
import type { WebSocket } from 'ws';
import type { PublicUser, ServerMessage } from '../shared/protocol.ts';
import { KNPS_SEND_QUEUE_LIMIT } from './knps/transport.ts';
import { RttTracker } from './knps/region.ts';

/** Mensagens a partir deste tamanho vão comprimidas pelo servidor quando o transporte não comprime. */
export const APP_DEFLATE_MIN = 1024;

/** Token bucket simples para limitar mensagens por conexão. */
class RateLimiter {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}

export class Connection {
  user: PublicUser | null = null;
  authenticating = false;
  roomCode: string | null = null;
  /** IP do cliente (KAC: limites por IP; não vai para logs públicos nem para outros jogadores). */
  ip = 'desconhecido';
  private readonly limiter = new RateLimiter(30, 60);
  violations = 0;
  /** KNPS: ping de rede medido pelo servidor (ping de protocolo do WebSocket). */
  readonly rtt = new RttTracker();
  /**
   * Compressão feita pelo próprio servidor (15/11): o navegador avisa no `hello` que o WebSocket chegou sem a
   * compressão do transporte (algum proxy no caminho a tirou). Mensagens acima de `APP_DEFLATE_MIN` bytes vão
   * comprimidas em binário (deflate-raw, nível 1, sem contexto: ~1/3 do tamanho dos snapshots delta).
   */
  appDeflate = false;
  /** Quando a conexão abriu (ms), para o log de quedas. */
  readonly openedAt = Date.now();
  /** Por que a conexão caiu, quando o servidor sabe (ping sem resposta, fechamento pedido pelo servidor...). */
  closeCause: string | null = null;
  /** Código de fechamento do WebSocket (1006: caiu sem aviso; 1001: o navegador saiu da página). */
  closeCode: number | null = null;
  /** Diagnósticos do navegador recebidos nesta conexão (teto `CLIENT_DIAG_PER_CONNECTION`). */
  diagCount = 0;

  constructor(readonly ws: WebSocket) {}

  send(msg: ServerMessage): void {
    this.sendRaw(JSON.stringify(msg));
  }

  sendRaw(json: string): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    if (this.appDeflate && json.length >= APP_DEFLATE_MIN) this.ws.send(deflateRawSync(json, { level: 1 }), { binary: true, compress: false });
    else this.ws.send(json);
  }

  /** Como esta conexão está comprimida: pelo transporte (permessage-deflate), pelo servidor ou nada. */
  get compression(): 'transporte' | 'servidor' | 'nenhuma' {
    if (/permessage-deflate/.test(this.ws.extensions ?? '')) return 'transporte';
    return this.appDeflate ? 'servidor' : 'nenhuma';
  }

  /** KNPS-02: a fila de saída desta conexão passou do limite (rede do jogador não está dando conta). */
  congested(): boolean {
    return (this.ws.bufferedAmount ?? 0) > KNPS_SEND_QUEUE_LIMIT;
  }

  allowMessage(): boolean {
    return this.limiter.take();
  }

  /** Há quantos segundos a conexão está aberta. */
  ageSeconds(): number {
    return Math.round((Date.now() - this.openedAt) / 1000);
  }

  close(code: number, reason: string): void {
    this.closeCause ??= `servidor: ${reason}`;
    try {
      this.ws.close(code, reason);
    } catch {
      // conexão já encerrada
    }
  }
}
