import { createHash } from 'node:crypto';
import type { CommunityMessage, ReportReason } from '../shared/protocol.ts';
import type { Connection } from './Connection.ts';
import { filterProfanity } from './profanity.ts';

/** Mensagens guardadas para quem entra no chat (as mais recentes). */
export const COMMUNITY_HISTORY = 80;
/** Intervalo mínimo entre duas mensagens do mesmo jogador (ms) e o teto por minuto. */
export const COMMUNITY_MIN_GAP_MS = 1500;
export const COMMUNITY_PER_MINUTE = 12;
/** Moderação automática. */
export const MODERATION = {
  /** Mensagens com ofensa (filtradas) dentro de `strikeWindowMs` que silenciam o autor. */
  strikes: 3,
  strikeWindowMs: 10 * 60_000,
  strikeMuteMs: 10 * 60_000,
  /** Denúncias de pessoas diferentes que apagam a mensagem e silenciam o autor. */
  reportsToRemove: 3,
  reportMuteMs: 15 * 60_000,
  /** Silenciamento por moderador: limites em minutos. */
  modMuteMin: 5,
  modMuteMax: 7 * 24 * 60,
};

/** Registro de denúncia gravado para a equipe (Supabase, tabela `community_reports`). */
export interface CommunityReport {
  reporter_id: string;
  reporter_name: string;
  author_id: string;
  author_name: string;
  message: string;
  reason: ReportReason;
  removed: boolean;
}

/** Identificador público de um jogador no chat: não expõe o id da conta. */
export function publicUid(userId: string): string {
  return createHash('sha256').update(`nc-chat:${userId}`).digest('hex').slice(0, 12);
}

/**
 * Chat da Comunidade (menu): um canal único para todos os jogadores conectados que abrem a tela Comunidade. Quem entra
 * recebe as últimas mensagens e o número de pessoas no chat; cada mensagem nova vai para todos. O histórico fica na
 * memória do servidor (some num reinício).
 *
 * Moderação:
 * - filtro de palavras muito ofensivas (`profanity.ts`): a palavra vira asteriscos; 3 mensagens filtradas em 10 min
 *   silenciam o autor por 10 min;
 * - denúncia: 3 denúncias de pessoas diferentes apagam a mensagem para todos e silenciam o autor por 15 min; cada
 *   denúncia é gravada para a equipe;
 * - moderadores (`COMMUNITY_MODERATORS`): apagam mensagens e silenciam por 5 min a 7 dias;
 * - cada jogador também pode silenciar alguém só para si (no cliente, sem passar pelo servidor).
 */
export class CommunityChat {
  private readonly members = new Set<Connection>();
  private readonly history: CommunityMessage[] = [];
  /** Autor (id da conta) e quem já denunciou cada mensagem. */
  private readonly meta = new Map<number, { authorId: string; reporters: Set<string> }>();
  private readonly sent = new Map<string, number[]>();
  private readonly strikes = new Map<string, number[]>();
  /** Silenciados: id público → até quando (ms). */
  private readonly muted = new Map<string, number>();
  private nextId = 1;

  constructor(
    private readonly opts: {
      now?: () => number;
      moderators?: readonly string[];
      saveReport?: (r: CommunityReport) => Promise<boolean> | boolean;
    } = {},
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  isModerator(conn: Connection): boolean {
    return !!conn.user && (this.opts.moderators ?? []).includes(conn.user.id);
  }

  get online(): number {
    return new Set([...this.members].map((c) => c.user?.id)).size;
  }

  join(conn: Connection): void {
    this.members.add(conn);
    const uid = conn.user ? publicUid(conn.user.id) : '';
    conn.send({ t: 'community_history', messages: [...this.history], online: this.online, you: uid, ...(this.isModerator(conn) ? { moderator: true } : {}) });
    this.broadcastOnline();
  }

  leave(conn: Connection): void {
    if (this.members.delete(conn)) this.broadcastOnline();
  }

  /** Até quando o jogador está silenciado (ms), ou null. */
  mutedUntil(userId: string): number | null {
    const until = this.muted.get(publicUid(userId));
    return until && until > this.now() ? until : null;
  }

  /** Publica uma mensagem; devolve o motivo da recusa (ou null). */
  post(conn: Connection, raw: string): string | null {
    if (!conn.user) return 'Identifique-se primeiro.';
    if (!this.members.has(conn)) this.join(conn);
    const now = this.now();
    const until = this.mutedUntil(conn.user.id);
    if (until) return `Você está silenciado no chat até ${clock(until)}.`;
    const times = (this.sent.get(conn.user.id) ?? []).filter((t) => now - t < 60_000);
    if (times.length && now - times[times.length - 1]! < COMMUNITY_MIN_GAP_MS) return 'Calma, comandante: espere um instante entre as mensagens.';
    if (times.length >= COMMUNITY_PER_MINUTE) return 'Muitas mensagens seguidas. Aguarde um pouco.';
    times.push(now);
    this.sent.set(conn.user.id, times);
    const { text, hits } = filterProfanity(raw);
    if (text.replace(/[*\s]/g, '').length === 0) return this.strike(conn, now) ?? 'Mensagem bloqueada pelo filtro de ofensas.';
    const uid = publicUid(conn.user.id);
    const msg: CommunityMessage = { id: this.nextId++, uid, from: conn.user.name, text, at: now, ...(conn.user.id.startsWith('guest:') ? { guest: true } : {}), ...(hits ? { filtered: true } : {}) };
    this.history.push(msg);
    this.meta.set(msg.id, { authorId: conn.user.id, reporters: new Set() });
    if (this.history.length > COMMUNITY_HISTORY) this.meta.delete(this.history.shift()!.id);
    for (const m of this.members) m.send({ t: 'community_msg', msg });
    if (hits) return this.strike(conn, now) ?? 'Algumas palavras foram ocultadas pelo filtro de ofensas.';
    return null;
  }

  /** Conta uma ofensa filtrada; na terceira em 10 min, silencia. Devolve o aviso de silenciamento, se houver. */
  private strike(conn: Connection, now: number): string | null {
    const id = conn.user!.id;
    const list = (this.strikes.get(id) ?? []).filter((t) => now - t < MODERATION.strikeWindowMs);
    list.push(now);
    this.strikes.set(id, list);
    if (list.length < MODERATION.strikes) return null;
    this.strikes.delete(id);
    this.mute(publicUid(id), now + MODERATION.strikeMuteMs);
    return `Você foi silenciado no chat por ${MODERATION.strikeMuteMs / 60_000} min por linguagem ofensiva.`;
  }

  /** Denúncia de uma mensagem; devolve o aviso para quem denunciou. */
  report(conn: Connection, id: number, reason: ReportReason): string {
    if (!conn.user) return 'Identifique-se primeiro.';
    const msg = this.history.find((m) => m.id === id);
    const meta = this.meta.get(id);
    if (!msg || !meta) return 'Essa mensagem não está mais no chat.';
    if (meta.authorId === conn.user.id) return 'Você não pode denunciar a própria mensagem.';
    if (meta.reporters.has(conn.user.id)) return 'Você já denunciou essa mensagem.';
    meta.reporters.add(conn.user.id);
    const remove = meta.reporters.size >= MODERATION.reportsToRemove;
    void this.opts.saveReport?.({ reporter_id: conn.user.id, reporter_name: conn.user.name, author_id: meta.authorId, author_name: msg.from, message: msg.text, reason, removed: remove });
    if (remove) {
      this.remove(id);
      this.mute(msg.uid, this.now() + MODERATION.reportMuteMs);
      return 'Denúncia recebida. A mensagem foi removida e o autor, silenciado.';
    }
    return 'Denúncia recebida. Obrigado por ajudar a manter a comunidade saudável.';
  }

  /** Ação de moderador: apagar uma mensagem ou silenciar o autor dela por alguns minutos. */
  moderate(conn: Connection, action: 'delete' | 'mute', id: number, minutes?: number): string {
    if (!this.isModerator(conn)) return 'Só moderadores podem fazer isso.';
    const msg = this.history.find((m) => m.id === id);
    if (!msg) return 'Essa mensagem não está mais no chat.';
    if (action === 'delete') {
      this.remove(id);
      return 'Mensagem apagada.';
    }
    const min = Math.max(MODERATION.modMuteMin, Math.min(MODERATION.modMuteMax, Math.round(minutes ?? 60)));
    this.mute(msg.uid, this.now() + min * 60_000);
    // as mensagens recentes de quem foi silenciado saem junto
    for (const m of this.history.filter((x) => x.uid === msg.uid)) this.remove(m.id);
    return `${msg.from} silenciado por ${min} min.`;
  }

  private remove(id: number): void {
    const i = this.history.findIndex((m) => m.id === id);
    if (i < 0) return;
    this.history.splice(i, 1);
    this.meta.delete(id);
    for (const m of this.members) m.send({ t: 'community_remove', id });
  }

  private mute(uid: string, until: number): void {
    this.muted.set(uid, Math.max(until, this.muted.get(uid) ?? 0));
    for (const m of this.members) if (m.user && publicUid(m.user.id) === uid) m.send({ t: 'error', code: 'community', message: `Você está silenciado no chat até ${clock(until)}.` });
  }

  private broadcastOnline(): void {
    const online = this.online;
    for (const m of this.members) m.send({ t: 'community_online', online });
  }
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}
