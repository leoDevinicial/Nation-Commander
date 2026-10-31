import type { KacEvent } from './journal.ts';

/**
 * KAC-08 — gravação persistente do diário (tabela `kac_events` do Supabase).
 *
 * Só eventos de gravidade média ou maior (os de baixa ficam na contagem e no log). Grava em lotes, para não pesar no
 * tick: a cada `flushMs` ou quando juntar `batch` eventos. Se o banco falhar, o lote volta para a fila até um teto
 * (`maxQueue`), descartando os mais antigos, para nunca crescer sem limite. Uma vez por dia apaga o que passou da
 * retenção.
 */
export const STORE_POLICY = {
  batch: 50,
  flushMs: 30_000,
  maxQueue: 2_000,
  retentionDays: 90,
};

export interface KacEventRow {
  occurred_at: string;
  category: string;
  severity: 'medium' | 'high';
  room_code: string | null;
  user_id: string | null;
  detail: string | null;
}

export interface KacStoreBackend {
  insert(rows: KacEventRow[]): Promise<boolean>;
  purgeBefore(iso: string): Promise<void>;
}

export class KacEventStore {
  private queue: KacEventRow[] = [];
  private flushing = false;
  private lastPurge = 0;
  dropped = 0;

  constructor(
    private readonly backend: KacStoreBackend,
    private readonly now: () => number = Date.now,
  ) {}

  /** Recebe um evento do diário (os de gravidade baixa são ignorados aqui). */
  push(e: KacEvent): void {
    if (e.severity !== 'medium' && e.severity !== 'high') return;
    this.queue.push({
      occurred_at: new Date(e.at).toISOString(),
      category: e.category,
      severity: e.severity,
      room_code: e.room ?? null,
      user_id: e.user ?? null,
      detail: e.detail?.slice(0, 500) ?? null,
    });
    this.trim();
    if (this.queue.length >= STORE_POLICY.batch) void this.flush();
  }

  /** Mantém a fila no teto, descartando os mais antigos (e contando quantos). */
  private trim(): void {
    if (this.queue.length <= STORE_POLICY.maxQueue) return;
    this.dropped += this.queue.length - STORE_POLICY.maxQueue;
    this.queue = this.queue.slice(-STORE_POLICY.maxQueue);
  }

  /** Lote que o banco recusou volta para o começo da fila (é o mais antigo), sem passar do teto. */
  private requeue(rows: KacEventRow[]): void {
    this.queue.unshift(...rows);
    this.trim();
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Esvazia a fila em até `maxBatches` lotes (encerramento do servidor). */
  async drain(maxBatches = 20): Promise<void> {
    for (let i = 0; i < maxBatches && this.queue.length && !this.flushing; i++) {
      const before = this.queue.length;
      await this.flush();
      if (this.queue.length >= before) break; // o banco recusou: para de tentar
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    const rows = this.queue.splice(0, STORE_POLICY.batch);
    try {
      const ok = await this.backend.insert(rows).catch(() => false);
      if (!ok) {
        this.requeue(rows);
        return;
      }
      // a retenção roda à parte: se falhar, o lote já gravado não volta para a fila (não duplica)
      const now = this.now();
      if (now - this.lastPurge > 24 * 60 * 60_000) {
        this.lastPurge = now;
        await this.backend.purgeBefore(new Date(now - STORE_POLICY.retentionDays * 24 * 60 * 60_000).toISOString()).catch(() => undefined);
      }
    } finally {
      this.flushing = false;
    }
  }
}
