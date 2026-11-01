/**
 * KNPS-07/08 — região deste servidor e medição do ping de rede de cada conexão.
 *
 * Região: `KNPS_REGION` (id, ex.: "us-east"), `KNPS_REGION_LABEL` ("Virgínia (EUA)") e `KNPS_REGION_LETTER` (uma letra
 * do alfabeto dos códigos de sala). Com a letra definida, todo código de sala criado aqui começa com ela, e o cliente
 * sabe para qual servidor ir ao entrar por código. Sem configuração, nada muda (um servidor só).
 *
 * Ping de rede: o servidor manda um ping de protocolo do WebSocket a cada 5 s; o navegador responde sozinho, sem passar
 * pelo JavaScript da página. É o ping "puro" da rede, medido pelo servidor (o jogador não consegue declarar outro).
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RegionInfo {
  id: string;
  label: string;
  letter: string;
}

export function regionFromEnv(env: Record<string, string | undefined>): RegionInfo {
  const letter = (env.KNPS_REGION_LETTER ?? '').trim().toUpperCase();
  const id = (env.KNPS_REGION ?? '').trim().slice(0, 32);
  return {
    id,
    label: (env.KNPS_REGION_LABEL ?? '').trim().slice(0, 48) || id,
    // letra inválida (fora do alfabeto dos códigos) é ignorada: o código seguiria impossível de digitar
    letter: letter.length === 1 && CODE_ALPHABET.includes(letter) ? letter : '',
  };
}

/** Pings de rede de uma conexão (janela das últimas 12 medições, ~1 min). */
export class RttTracker {
  private samples: number[] = [];
  private sentAt: number | null = null;
  /** Pings seguidos sem resposta. */
  missed = 0;

  sent(now: number): void {
    if (this.sentAt !== null) this.missed++;
    this.sentAt = now;
  }

  /** Resposta do navegador; devolve o RTT medido (ms) ou null se não havia ping pendente. */
  pong(now: number): number | null {
    if (this.sentAt === null) return null;
    const rtt = Math.max(0, now - this.sentAt);
    this.sentAt = null;
    this.missed = 0;
    this.samples.push(rtt);
    if (this.samples.length > 12) this.samples.shift();
    return rtt;
  }

  /** Mediana recente (ms), ou null antes da primeira resposta. */
  get median(): number | null {
    if (!this.samples.length) return null;
    const s = [...this.samples].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  }

  get count(): number {
    return this.samples.length;
  }
}

/** Faixas de ping para o agregado do servidor (sem identidade nem IP: só contagens). */
export const RTT_BUCKETS = [50, 100, 150, 200, 300] as const;

/**
 * Distribuição do ping de rede das conexões deste servidor: ao fechar cada conexão (com 3+ medições), a mediana dela
 * cai numa faixa. Serve para decidir regiões com dados reais. Não guarda quem foi, nem de onde.
 */
export class RegionTelemetry {
  private readonly counts = new Array<number>(RTT_BUCKETS.length + 1).fill(0);

  record(median: number): void {
    let i = RTT_BUCKETS.findIndex((b) => median < b);
    if (i < 0) i = RTT_BUCKETS.length;
    this.counts[i]!++;
  }

  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    RTT_BUCKETS.forEach((b, i) => (out[`<${b}ms`] = this.counts[i]!));
    out[`>=${RTT_BUCKETS.at(-1)}ms`] = this.counts[RTT_BUCKETS.length]!;
    return out;
  }
}
