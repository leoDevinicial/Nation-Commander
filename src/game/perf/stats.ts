/**
 * Telemetria de quadros do KGPS: junta os quadros de uma janela de observação (~2 s) e, no fim
 * dela, calcula percentis do intervalo entre quadros e do tempo de CPU gasto no quadro.
 *
 * - intervalo: tempo entre dois requestAnimationFrame (o que o jogador sente);
 * - CPU: tempo do JavaScript do quadro (atualização + envio dos comandos de desenho);
 * - GPU (quando o navegador oferece `EXT_disjoint_timer_query_webgl2`): tempo de execução dos
 *   comandos de desenho, amostrado em 1 de cada 10 quadros (ver `gpuTimer.ts`). Sem ele, o gargalo
 *   é estimado pela fração do quadro gasta na CPU.
 */

export interface WindowStats {
  samples: number;
  /** Duração real coberta pela janela (ms). */
  spanMs: number;
  fps: number;
  /** Quadros mais rápidos da janela: indicam a taxa da tela quando há folga (ver `estimateRefreshHz`). */
  p10: number;
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
  /**
   * Fração dos intervalos presos em ~33,3 ms (30 Hz). Perto de 1, com CPU baixa, o quadro pode estar
   * travado pelo navegador ou pelo sistema (ex.: economia de bateria) — ou por uma carga entre 17 e
   * 33 ms numa tela de 60 Hz. Só uma redução sem efeito separa os dois casos (ver `externalCap`).
   */
  lock30: number;
  /** Tempo de GPU do quadro (mediana das amostras da janela; null = não medido nesta janela). */
  gpuP50: number | null;
  gpuSamples: number;
  /**
   * Carga da cena: mediana das chamadas de desenho por quadro (null = não informada). Separa "a
   * cena ficou mais pesada" de "o aparelho ficou mais lento" (indício de aquecimento).
   */
  loadP50: number | null;
}

/** Amostras de GPU necessárias para a janela ter um tempo de GPU medido. */
export const MIN_GPU_SAMPLES = 3;

/** Período de 30 Hz e a tolerância para considerar um intervalo "preso" nele. */
export const LOCK30_MS = 1000 / 30;
export const LOCK30_TOL_MS = 1.5;

const CAP = 2048;
const GPU_CAP = 256;
export const STALL_MS = 1000;

export class FrameWindow {
  private readonly intervals = new Float64Array(CAP);
  private readonly cpu = new Float64Array(CAP);
  private readonly gpu = new Float64Array(GPU_CAP);
  private readonly load = new Float64Array(CAP);
  private n = 0;
  private gn = 0;
  private ln = 0;
  private stalls = 0;
  private startedAt = -1;

  get count(): number {
    return this.n;
  }

  /** Início da janela (ms), ou -1 se ainda vazia. */
  get start(): number {
    return this.startedAt;
  }

  add(now: number, intervalMs: number, cpuMs: number, load?: number): void {
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
    if (load !== undefined && Number.isFinite(load)) this.load[this.ln++] = load;
  }

  /** Tempo de GPU de um quadro desta janela (chega alguns quadros depois, quando a GPU termina). */
  addGpu(ms: number): void {
    if (this.gn < GPU_CAP && ms >= 0 && Number.isFinite(ms)) this.gpu[this.gn++] = ms;
  }

  clear(): void {
    this.n = 0;
    this.gn = 0;
    this.ln = 0;
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
    let locked = 0;
    for (let i = 0; i < this.n; i++) {
      const v = this.intervals[i]!;
      sum += v;
      if (v > 50 && v > p50 * 2.5) hitches++;
      if (Math.abs(v - LOCK30_MS) <= LOCK30_TOL_MS) locked++;
    }
    return {
      samples: this.n,
      spanMs: Math.max(0, now - this.startedAt),
      fps: sum > 0 ? (this.n * 1000) / sum : 0,
      p10: percentile(iv, 0.1),
      p50,
      p95: percentile(iv, 0.95),
      p99: percentile(iv, 0.99),
      cpuP50: percentile(cp, 0.5),
      cpuP95: percentile(cp, 0.95),
      hitches,
      stalls: this.stalls,
      lock30: locked / this.n,
      gpuP50: this.gn >= MIN_GPU_SAMPLES ? percentile(this.gpu.slice(0, this.gn).sort(), 0.5) : null,
      gpuSamples: this.gn,
      loadP50: this.ln > 0 ? percentile(this.load.slice(0, this.ln).sort(), 0.5) : null,
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
/** De onde veio o diagnóstico: tempo de GPU medido ou fração do quadro gasta na CPU (estimativa). */
export type BottleneckSource = 'gpu-timer' | 'cpu-share';

export interface BottleneckVerdict {
  kind: Bottleneck;
  /** Fração do quadro gasta no JavaScript. */
  ratio: number;
  /** Fração do quadro gasta na GPU (null sem tempo de GPU). */
  gpuRatio: number | null;
  source: BottleneckSource;
}

/**
 * Gargalo provável da janela.
 *
 * Com tempo de GPU medido (R-DEV-03), a conta é direta: quem passa de 90% do orçamento da meta
 * (ou ocupa a maior parte do quadro) limita. Se nenhum dos dois está perto do limite, o quadro
 * espera por outra coisa (tela, navegador, sistema) e o gargalo fica indefinido.
 *
 * Sem tempo de GPU, a pista é a fração do quadro gasta no JavaScript: se o quadro demora 25 ms
 * mas o JS leva 4 ms, o resto é espera pela GPU (ou pela tela). É uma hipótese, não uma certeza:
 * por isso cada mudança é medida e desfeita se não ajudar.
 */
export function classifyBottleneck(s: Pick<WindowStats, 'samples' | 'p50' | 'cpuP50'> & { gpuP50?: number | null }, minSamples: number, budgetMs = Infinity): BottleneckVerdict {
  const gpu = plausibleGpu(s);
  const source: BottleneckSource = gpu !== null ? 'gpu-timer' : 'cpu-share';
  if (s.samples < minSamples || s.p50 <= 0) return { kind: 'unknown', ratio: 0, gpuRatio: null, source };
  const ratio = s.cpuP50 / s.p50;
  if (gpu !== null) {
    const gpuRatio = gpu / s.p50;
    if (gpu >= budgetMs * 0.9 && gpu >= s.cpuP50) return { kind: 'gpu', ratio, gpuRatio, source };
    if (ratio >= 0.7 || s.cpuP50 >= budgetMs * 0.9) return { kind: 'cpu', ratio, gpuRatio, source };
    if (gpuRatio >= 0.75) return { kind: 'gpu', ratio, gpuRatio, source };
    return { kind: 'unknown', ratio, gpuRatio, source };
  }
  // o JavaScript sozinho já estoura o orçamento do quadro: a CPU limita, arredonde a tela como for
  if (ratio >= 0.7 || s.cpuP50 >= budgetMs * 0.9) return { kind: 'cpu', ratio, gpuRatio: null, source };
  if (ratio <= 0.45) return { kind: 'gpu', ratio, gpuRatio: null, source };
  return { kind: 'unknown', ratio, gpuRatio: null, source };
}

/**
 * Tempo de GPU utilizável: na média, a GPU não pode levar mais que o intervalo entre quadros (os
 * quadros se acumulariam e o intervalo cresceria). Leituras muito acima disso — típicas da
 * renderização por software, em que a "GPU" é a própria CPU com fila — são inconsistentes e o
 * gargalo volta a ser estimado.
 */
export function plausibleGpu(s: { p50: number; gpuP50?: number | null }): number | null {
  const gpu = s.gpuP50 ?? null;
  return gpu !== null && s.p50 > 0 && gpu <= s.p50 * 1.5 ? gpu : null;
}

/** Taxas de tela reconhecidas e o período de cada uma (ms). */
const REFRESH_RATES = [144, 120, 90, 60] as const;

/**
 * Taxa da tela inferida pelos quadros mais rápidos (p10) de uma janela: com folga, eles caem no
 * período da tela (16,7 ms a 60 Hz, 8,3 ms a 120 Hz…). Quadros presos em 33,3 ms são ambíguos —
 * tela/navegador a 30 Hz ou carga entre 17 e 33 ms numa tela de 60 Hz — e não viram estimativa
 * (null): esse caso só se resolve medindo o efeito de uma redução (ver `externalCap` no KGPS).
 */
export function estimateRefreshHz(p10: number): number | null {
  for (const hz of REFRESH_RATES) {
    const period = 1000 / hz;
    if (Math.abs(p10 - period) <= period * 0.07) return hz;
  }
  return null;
}
