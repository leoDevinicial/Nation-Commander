import { log } from "../logger.ts";

/**
 * KAC — diário de eventos de segurança (servidor).
 *
 * Registra o que o KAC barrou ou observou, com categoria, gravidade e contexto mínimo (sala, conta, comando), sem
 * tokens nem dados pessoais. Guarda os últimos eventos na memória (para investigação e testes), conta por categoria
 * e escreve no log estruturado do servidor os de gravidade média ou maior. A gravação persistente (tabela própria)
 * e a correlação entre sinais são as próximas etapas (ver `docs/kac/KAC_IMPLEMENTATION_ROADMAP.md`).
 *
 * Registrar um evento nunca pune ninguém: punição é decisão separada, com política e revisão.
 */
export type KacSeverity = "info" | "low" | "medium" | "high";

export type KacCategory =
  /** Mensagem fora do protocolo (JSON inválido, campo ou tipo errado). */
  | "protocol.malformed"
  /** Conexão acima do limite de mensagens por segundo. */
  | "protocol.rate_limited"
  /** `hello` de convidado com o id público de outra pessoa (tentativa de assumir a vaga dela). */
  | "identity.guest_impersonation"
  /** Comando recusado pela simulação (dono, recursos, regra); a maioria é engano normal de interface. */
  | "command.rejected"
  /** Comando enviado com a partida pausada (recusado nas partidas entre jogadores). */
  | "match.command_while_paused"
  /** Pedido de pausa recusado pela política (sem pausas, cedo demais para tirar a pausa de outro). */
  | "match.pause_denied"
  /** Conexão recusada: IP acima do teto de conexões simultâneas. */
  | "network.connection_limit"
  /** Sala recusada: IP acima do teto de salas novas na janela. */
  | "network.room_limit";

export interface KacEvent {
  at: number;
  category: KacCategory;
  severity: KacSeverity;
  room?: string;
  /** Conta (id do servidor; convidados já chegam com o id público derivado). */
  user?: string;
  detail?: string;
}

const RECENT = 500;

export class KacJournal {
  private readonly recentEvents: KacEvent[] = [];
  private readonly counts = new Map<KacCategory, number>();

  constructor(private readonly now: () => number = Date.now) {}

  record(e: Omit<KacEvent, "at">): void {
    const ev: KacEvent = { at: this.now(), ...e };
    this.recentEvents.push(ev);
    if (this.recentEvents.length > RECENT) this.recentEvents.shift();
    this.counts.set(e.category, (this.counts.get(e.category) ?? 0) + 1);
    if (e.severity === "medium" || e.severity === "high")
      log.warn("KAC", { ...ev });
  }

  recent(category?: KacCategory): KacEvent[] {
    return category
      ? this.recentEvents.filter((e) => e.category === category)
      : [...this.recentEvents];
  }

  count(category: KacCategory): number {
    return this.counts.get(category) ?? 0;
  }

  /** Contagem por categoria (para o resumo periódico no log e a observabilidade). */
  summary(): Partial<Record<KacCategory, number>> {
    return Object.fromEntries(this.counts) as Partial<
      Record<KacCategory, number>
    >;
  }
}

/** Diário do processo do servidor. */
export const kacJournal = new KacJournal();
