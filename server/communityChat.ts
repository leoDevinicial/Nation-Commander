import type { CommunityMessage } from '../shared/protocol.ts';
import type { Connection } from './Connection.ts';

/** Mensagens guardadas para quem entra no chat (as mais recentes). */
export const COMMUNITY_HISTORY = 80;
/** Intervalo mínimo entre duas mensagens do mesmo jogador (ms) e o teto por minuto. */
export const COMMUNITY_MIN_GAP_MS = 1500;
export const COMMUNITY_PER_MINUTE = 12;

/**
 * Chat da Comunidade (menu): um canal único para todos os jogadores conectados que abrem a tela Comunidade. Quem entra
 * recebe as últimas mensagens e o número de pessoas no chat; cada mensagem nova vai para todos. O histórico fica na
 * memória do servidor (some num reinício).
 */
export class CommunityChat {
  private readonly members = new Set<Connection>();
  private readonly history: CommunityMessage[] = [];
  private readonly sent = new Map<string, number[]>();
  private nextId = 1;

  constructor(private readonly now: () => number = Date.now) {}

  get online(): number {
    return new Set([...this.members].map((c) => c.user?.id)).size;
  }

  join(conn: Connection): void {
    this.members.add(conn);
    conn.send({ t: 'community_history', messages: [...this.history], online: this.online });
    this.broadcastOnline();
  }

  leave(conn: Connection): void {
    if (this.members.delete(conn)) this.broadcastOnline();
  }

  /** Publica uma mensagem; devolve o motivo da recusa (ou null). */
  post(conn: Connection, text: string): string | null {
    if (!conn.user) return 'Identifique-se primeiro.';
    if (!this.members.has(conn)) this.join(conn);
    const now = this.now();
    const times = (this.sent.get(conn.user.id) ?? []).filter((t) => now - t < 60_000);
    if (times.length && now - times[times.length - 1]! < COMMUNITY_MIN_GAP_MS) return 'Calma, comandante: espere um instante entre as mensagens.';
    if (times.length >= COMMUNITY_PER_MINUTE) return 'Muitas mensagens seguidas. Aguarde um pouco.';
    times.push(now);
    this.sent.set(conn.user.id, times);
    const msg: CommunityMessage = { id: this.nextId++, from: conn.user.name, text, at: now, ...(conn.user.id.startsWith('guest:') ? { guest: true } : {}) };
    this.history.push(msg);
    if (this.history.length > COMMUNITY_HISTORY) this.history.shift();
    for (const m of this.members) m.send({ t: 'community_msg', msg });
    return null;
  }

  private broadcastOnline(): void {
    const online = this.online;
    for (const m of this.members) m.send({ t: 'community_online', online });
  }
}
