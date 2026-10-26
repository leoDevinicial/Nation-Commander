/**
 * Telemetria de quadros do KGPS: junta os quadros de uma janela de observação (~2 s) e, no fim
 * dela, calcula percentis do intervalo entre quadros e do tempo de CPU gasto no quadro.
 *
 * - intervalo: tempo entre dois requestAnimationFrame (o que o jogador sente);
 * - CPU: tempo do JavaScript do quadro (atualização + envio dos comandos de desenho). O tempo da
 *   GPU não é medido: no navegador ele quase nunca está disponível de forma confiável.
 */

export interface WindowStats {
  samples: number;
  /** Duração real coberta pela janela (ms). */
  spanMs: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  cpuP50: number;
  cpuP95: number;
  /** Quadros muito acima do normal (> 50 ms e > 2,5× a mediana): travadas perceptíveis. */
  hitches: number;
  /**
   * Congelamentos (> 1 s): compilação de shader, aba voltando do segundo plano, página parada.
   * Reduzir qualidade não resolve isso, então eles ficam fora dos percentis (só são contados).
   */
  stalls: number;
}

const CAP = 2048;
export const STALL_MS = 1000;

export class FrameWindow {
  private readonly intervals = new Float64Array(CAP);
  private readonly cpu = new Float64Array(CAP);
  private n = 0;
  private stalls = 0;
  private startedAt = -1;

  get count(): number {
    return this.n;
  }

  /** Início da janela (ms), ou -1 se ainda vazia. */
  get start(): number {
    return this.startedAt;
  }

  add(now: number, intervalMs: number, cpuMs: number): void {
    if (intervalMs > STALL_MS) {
      // a janela recomeça depois do congelamento: o tempo parado não conta como medição
      this.stalls++;
      if (this.n === 0) this.startedAt = now;
      return;
    }
    if (this.startedAt < 0) this.startedAt = now;
    if (this.n >= CAP) return;
    this.intervals[this.n] = intervalMs;
    this.cpu[this.n] = cpuMs;
    this.n++;
  }

  clear(): void {
    this.n = 0;
    this.stalls = 0;
    this.startedAt = -1;
  }

  /** Estatísticas da janela atual (null se vazia). Não limpa a janela. */
  stats(now: number): WindowStats | null {
    if (this.n === 0) return null;
    const iv = this.intervals.slice(0, this.n).sort();
    const cp = this.cpu.slice(0, this.n).sort();
    const p50 = percentile(iv, 0.5);
    let sum = 0;
    let hitches = 0;
    for (let i = 0; i < this.n; i++) {
      const v = this.intervals[i]!;
      sum += v;
      if (v > 50 && v > p50 * 2.5) hitches++;
    }
    return {
      samples: this.n,
      spanMs: Math.max(0, now - this.startedAt),
      fps: sum > 0 ? (this.n * 1000) / sum : 0,
      p50,
      p95: percentile(iv, 0.95),
      p99: percentile(iv, 0.99),
      cpuP50: percentile(cp, 0.5),
      cpuP95: percentile(cp, 0.95),
      hitches,
      stalls: this.stalls,
    };
  }
}

/** Percentil por interpolação linear numa lista já ordenada. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const pos = Math.min(1, Math.max(0, p)) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export type Bottleneck = 'gpu' | 'cpu' | 'unknown';

/**
 * Gargalo provável da janela. Sem tempo de GPU, a pista é a fração do quadro gasta no
 * JavaScript: se o quadro demora 25 ms mas o JS leva 4 ms, o resto é espera pela GPU (ou pela
 * tela). É uma hipótese, não uma certeza: por isso cada mudança é medida e desfeita se não ajudar.
 */
export function classifyBottleneck(s: WindowStats, minSamples: number, budgetMs = Infinity): { kind: Bottleneck; ratio: number } {
  if (s.samples < minSamples || s.p50 <= 0) return { kind: 'unknown', ratio: 0 };
  const ratio = s.cpuP50 / s.p50;
  // o JavaScript sozinho já estoura o orçamento do quadro: a CPU limita, arredonde a tela como for
  if (ratio >= 0.7 || s.cpuP50 >= budgetMs * 0.9) return { kind: 'cpu', ratio };
  if (ratio <= 0.45) return { kind: 'gpu', ratio };
  return { kind: 'unknown', ratio };
}
