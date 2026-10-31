import { createHash, timingSafeEqual } from 'node:crypto';
import { KAC_CATEGORIES, type KacCategory, type KacJournal } from './journal.ts';

/**
 * KAC — painel de leitura para a equipe (`GET /kac`), protegido por `KAC_ADMIN_TOKEN`.
 *
 * - Sem token configurado (ou com menos de `ADMIN_POLICY.minTokenLength` caracteres) o painel não existe: responde 404.
 * - O token vai no cabeçalho `Authorization: Bearer <token>`, nunca na URL (URLs ficam em logs de proxy).
 * - Comparação em tempo constante (hash dos dois lados + `timingSafeEqual`).
 * - IP com muitas tentativas erradas fica bloqueado por um tempo (429), e cada recusa vai para o diário.
 * - Só leitura: contagens por categoria, eventos recentes, fila da gravação e números agregados de rede (sem IPs).
 *   Nenhuma ação de punição sai daqui; ver `docs/kac/KAC_ENFORCEMENT_POLICY.md`.
 */
export const ADMIN_POLICY = {
  minTokenLength: 24,
  maxFailures: 10,
  failureWindowMs: 10 * 60_000,
  defaultLimit: 100,
  maxLimit: 500,
};

export interface KacAdminSources {
  journal: KacJournal;
  store?: { pending: number; dropped: number } | null;
  network?: { stats(): Record<string, number> } | null;
  startedAt?: number;
}

export interface KacAdminReply {
  status: number;
  body: unknown;
}

export function adminEnabled(token: string | undefined): token is string {
  return !!token && token.length >= ADMIN_POLICY.minTokenLength;
}

/** Compara o token em tempo constante (o tamanho do token também não vaza: os dois lados viram hashes iguais). */
export function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearer(authorization: string | undefined): string | undefined {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  return m?.[1];
}

export class KacAdmin {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly token: string | undefined,
    private readonly sources: KacAdminSources,
    private readonly now: () => number = Date.now,
  ) {}

  get enabled(): boolean {
    return adminEnabled(this.token);
  }

  handle(url: URL, authorization: string | undefined, ip: string): KacAdminReply {
    if (!adminEnabled(this.token)) return { status: 404, body: { error: 'not_found' } };
    const now = this.now();
    if (this.failures.size > 1000) for (const [k, list] of this.failures) if (!list.some((t) => now - t < ADMIN_POLICY.failureWindowMs)) this.failures.delete(k);
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < ADMIN_POLICY.failureWindowMs);
    if (recent.length >= ADMIN_POLICY.maxFailures) {
      this.failures.set(ip, recent);
      return { status: 429, body: { error: 'too_many_attempts' } };
    }
    const given = bearer(authorization);
    if (!tokenMatches(given, this.token)) {
      recent.push(now);
      this.failures.set(ip, recent);
      // token errado é alguém tentando entrar; sem token pode ser só um robô varrendo URLs
      this.sources.journal.record({ category: 'admin.denied', severity: given ? 'medium' : 'low', detail: given ? 'token errado' : 'sem token' });
      return { status: 401, body: { error: 'unauthorized' } };
    }
    this.failures.delete(ip);
    const category = url.searchParams.get('category');
    if (category !== null && !(KAC_CATEGORIES as readonly string[]).includes(category)) return { status: 400, body: { error: 'bad_category', categories: KAC_CATEGORIES } };
    const limitRaw = Number(url.searchParams.get('limit') ?? ADMIN_POLICY.defaultLimit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(ADMIN_POLICY.maxLimit, Math.floor(limitRaw))) : ADMIN_POLICY.defaultLimit;
    const events = this.sources.journal.recent((category as KacCategory | null) ?? undefined);
    return {
      status: 200,
      body: {
        now: new Date(now).toISOString(),
        uptimeSeconds: this.sources.startedAt ? Math.round((now - this.sources.startedAt) / 1000) : null,
        summary: this.sources.journal.summary(),
        store: this.sources.store ? { pending: this.sources.store.pending, dropped: this.sources.store.dropped } : null,
        network: this.sources.network?.stats() ?? null,
        events: events.slice(-limit).reverse(),
      },
    };
  }
}
