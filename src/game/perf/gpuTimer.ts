/**
 * Tempo de GPU do quadro (R-DEV-03), quando o navegador oferece `EXT_disjoint_timer_query_webgl2`
 * (comum em PC; raro em celular). Mede um quadro a cada ~150 ms (1 de cada ~10 quadros a 60 qps;
 * mais quadros quando o jogo está lento, para cada janela de 2 s ter amostras): uma consulta
 * TIME_ELAPSED em volta de todos os passes do quadro (sombra, cena, reflexo, pós-processamento).
 * O resultado chega alguns quadros depois, quando a GPU termina; resultados "disjuntos" (a GPU
 * trocou de frequência ou de contexto no meio) são descartados, como manda a extensão, e também
 * leituras impossíveis (quase zero, comuns em renderização por software).
 *
 * Sem a extensão, `available` é false e nada é feito: o gargalo continua estimado pela fração de
 * CPU do quadro.
 */

interface TimerQueryExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

export class GpuTimer {
  private readonly ext: TimerQueryExt | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private lastBegin = -Infinity;

  constructor(
    private readonly gl: WebGL2RenderingContext | WebGLRenderingContext,
    /** Intervalo mínimo entre dois quadros medidos (ms). */
    private readonly gapMs = 150,
  ) {
    const isGl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.ext = isGl2 ? (gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null) : null;
  }

  get available(): boolean {
    return this.ext !== null;
  }

  /** Começo do trabalho de GPU do quadro (só nos quadros amostrados). */
  begin(now = performance.now()): void {
    const ext = this.ext;
    if (!ext || this.active || now - this.lastBegin < this.gapMs || this.pending.length >= 6) return;
    this.lastBegin = now;
    const gl = this.gl as WebGL2RenderingContext;
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    const ext = this.ext;
    if (!ext || !this.active) return;
    (this.gl as WebGL2RenderingContext).endQuery(ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Resultados prontos (ms), na ordem dos quadros medidos. */
  poll(): number[] {
    const ext = this.ext;
    if (!ext || !this.pending.length) return [];
    const gl = this.gl as WebGL2RenderingContext;
    const out: number[] = [];
    const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      this.pending.shift();
      // abaixo de 0,05 ms não é um quadro de jogo 3D de verdade: leitura inválida
      if (!disjoint && ns > 50_000) out.push(ns / 1e6);
    }
    return out;
  }

  dispose(): void {
    const gl = this.gl as WebGL2RenderingContext;
    if (this.active && this.ext) gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    for (const q of this.pending) gl.deleteQuery(q);
    if (this.active) gl.deleteQuery(this.active);
    this.pending.length = 0;
    this.active = null;
  }
}
