/**
 * KNPS — medições de uma partida no servidor: custo do tick, atraso do laço e tráfego de snapshots. Só números; nada
 * de identidade, IP ou conteúdo. Janela fixa (memória constante).
 */
export class RollingSamples {
  private readonly buf: Float64Array;
  private n = 0;
  private i = 0;
  constructor(size = 600) {
    this.buf = new Float64Array(size);
  }
  push(v: number): void {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
  }
  get count(): number {
    return this.n;
  }
  /** Percentil (0..1) das amostras na janela; 0 sem amostras. */
  pct(p: number): number {
    if (!this.n) return 0;
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    return a[Math.min(this.n - 1, Math.floor(this.n * p))]!;
  }
}

export interface KnpsRoomSummary {
  /** Tempo de CPU de um tick da simulação (ms): mediana e p95. */
  tickMs: { p50: number; p95: number };
  /** Atraso do laço (ms): quanto o tick saiu depois da hora marcada (p95). */
  loopLagMs: number;
  /** Snapshots enviados, extras (resposta imediata a ordens) e pulados por congestionamento. */
  snapshots: number;
  quick: number;
  skipped: number;
  /** Tamanho médio do snapshot antes da compressão (bytes). */
  avgBytes: number;
}

export class KnpsRoomStats {
  readonly tickMs = new RollingSamples();
  readonly loopLag = new RollingSamples();
  snapshots = 0;
  quick = 0;
  skipped = 0;
  private bytes = 0;

  sent(bytes: number, quick = false): void {
    this.snapshots++;
    if (quick) this.quick++;
    this.bytes += bytes;
  }

  summary(): KnpsRoomSummary {
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      tickMs: { p50: r(this.tickMs.pct(0.5)), p95: r(this.tickMs.pct(0.95)) },
      loopLagMs: r(this.loopLag.pct(0.95)),
      snapshots: this.snapshots,
      quick: this.quick,
      skipped: this.skipped,
      avgBytes: this.snapshots ? Math.round(this.bytes / this.snapshots) : 0,
    };
  }
}
