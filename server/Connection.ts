import type { WebSocket } from 'ws';
import type { PublicUser, ServerMessage } from '../shared/protocol.ts';

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

  constructor(readonly ws: WebSocket) {}

  send(msg: ServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendRaw(json: string): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(json);
  }

  allowMessage(): boolean {
    return this.limiter.take();
  }

  close(code: number, reason: string): void {
    try {
      this.ws.close(code, reason);
    } catch {
      // conexão já encerrada
    }
  }
}
