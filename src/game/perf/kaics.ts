/**
 * KAICS (Kaiser Adaptive Integration & Compatibility System), parte que roda no jogo.
 *
 * O KGPS nunca mexe direto no renderizador: ele pede ao KAICS para mudar um "botão" (knob) que o
 * jogo declarou. O KAICS:
 * - descobre o que o aparelho e o navegador oferecem (capacidades);
 * - só aceita botões cujo estado atual pode ser lido e bate com o declarado;
 * - aplica cada mudança como uma transação: aplica, lê de volta e, se não bater, desfaz;
 * - bloqueia mudanças quando o momento não é seguro (contexto gráfico perdido, teatro oculto,
 *   aba em segundo plano, câmera de entrada da batalha);
 * - desliga tudo e devolve a qualidade escolhida pelo jogador quando pedido (kill switch).
 *
 * O jogo continua dono das regras e do laço de renderização; o KAICS só arbitra o acesso aos
 * parâmetros gráficos que o jogo expôs.
 */
import type { Bottleneck } from './stats.ts';

export interface KnobSpec {
  id: string;
  label: string;
  /** Descrição de cada nível, do mais barato (0) ao mais caro. */
  levels: readonly string[];
  /** Nível da qualidade escolhida pelo jogador (o KGPS nunca passa disso). */
  baseline: number;
  /** Nível mais baixo que o KGPS pode usar (piso de qualidade). */
  floor: number;
  /** Gargalos que reduzir este botão alivia. */
  helps: readonly Exclude<Bottleneck, 'unknown'>[];
  /** Custo visual (1 = imperceptível … 5 = muito visível) de descer do nível `from` para `from - 1`. */
  stepCost: (from: number) => number;
  apply: (level: number) => void;
  /** Nível realmente em vigor, lido do renderizador (-1 se não corresponder a nenhum nível). */
  read: () => number;
}

export type KnobStatus = 'ok' | 'quarantined' | 'faulted';

export interface KnobEntry {
  spec: KnobSpec;
  status: KnobStatus;
  reason?: string;
}

export interface Capabilities {
  webgl2: boolean;
  maxTextureSize: number;
  /** Extensão de temporização de GPU (raramente disponível no navegador). */
  gpuTimer: boolean;
  gpu: string | null;
  devicePixelRatio: number;
  cores: number | null;
  memoryGb: number | null;
  touch: boolean;
}

export type Condition = 'contextLost' | 'suspended' | 'hidden' | 'intro';

const CONDITION_TEXT: Record<Condition, string> = {
  contextLost: 'contexto gráfico perdido',
  suspended: 'cena oculta (globo ou outra cena aberta)',
  hidden: 'jogo em segundo plano',
  intro: 'câmera de entrada em andamento',
};

export type SetResult = { ok: true } | { ok: false; reason: string };

export type Verdict = { mode: 'adaptive' | 'observe' | 'blocked'; reasons: string[] };

export class Kaics {
  readonly knobs = new Map<string, KnobEntry>();
  private readonly conditions = new Set<Condition>();
  private userEnabled: boolean;
  /** Incidentes de integração (leitura que não bate, restauração que falhou). */
  readonly incidents: string[] = [];

  constructor(
    readonly capabilities: Capabilities,
    adaptive: boolean,
  ) {
    this.userEnabled = adaptive;
  }

  /** Aceita um botão só se a declaração for coerente e o estado lido bater com o nível base. */
  register(spec: KnobSpec): boolean {
    // nada a adaptar (ex.: sombra já no tamanho mínimo): fica de fora, sem ser incidente
    if (spec.levels.length < 2 || spec.floor === spec.baseline) return false;
    let problem: string | null = null;
    if (!(spec.floor >= 0 && spec.floor < spec.baseline && spec.baseline < spec.levels.length)) problem = 'piso/nível base fora dos limites';
    else {
      let current: number;
      try {
        current = spec.read();
      } catch {
        current = -1;
      }
      if (current !== spec.baseline) problem = `estado lido (${current}) diferente do declarado (${spec.baseline})`;
    }
    this.knobs.set(spec.id, problem ? { spec, status: 'quarantined', reason: problem } : { spec, status: 'ok' });
    if (problem) this.incidents.push(`${spec.label}: em quarentena (${problem})`);
    return !problem;
  }

  setCondition(c: Condition, on: boolean): void {
    if (on) this.conditions.add(c);
    else this.conditions.delete(c);
  }

  /** Motivo pelo qual nenhuma mudança pode ser aplicada agora (null = liberado). */
  gate(): string | null {
    for (const c of this.conditions) return CONDITION_TEXT[c];
    return null;
  }

  verdict(): Verdict {
    if (this.conditions.has('contextLost')) return { mode: 'blocked', reasons: [CONDITION_TEXT.contextLost] };
    const usable = [...this.knobs.values()].filter((k) => k.status === 'ok');
    if (!this.userEnabled) return { mode: 'observe', reasons: ['qualidade adaptativa desligada nas configurações'] };
    if (!usable.length) return { mode: 'observe', reasons: ['nenhum ajuste validado neste aparelho/preset'] };
    return { mode: 'adaptive', reasons: [] };
  }

  get enabled(): boolean {
    return this.userEnabled;
  }

  level(id: string): number {
    const k = this.knobs.get(id);
    if (!k) return -1;
    try {
      return k.spec.read();
    } catch {
      return -1;
    }
  }

  /**
   * Muda um botão em transação: confere permissão e limites, aplica, lê de volta e, se o
   * renderizador não ficou no nível pedido, tenta voltar ao anterior. Se nem a volta funcionar,
   * o botão é marcado com defeito e sai do controle automático.
   */
  set(id: string, level: number, opts: { force?: boolean } = {}): SetResult {
    const k = this.knobs.get(id);
    if (!k) return { ok: false, reason: 'botão desconhecido' };
    if (k.status !== 'ok') return { ok: false, reason: `botão ${k.status === 'faulted' ? 'com defeito' : 'em quarentena'}` };
    if (!opts.force) {
      const blocked = this.gate();
      if (blocked) return { ok: false, reason: blocked };
      if (!this.userEnabled) return { ok: false, reason: 'qualidade adaptativa desligada' };
    }
    if (!Number.isInteger(level) || level < k.spec.floor || level > k.spec.baseline) return { ok: false, reason: 'nível fora dos limites permitidos' };
    const before = this.level(id);
    if (before === level) return { ok: true };
    try {
      k.spec.apply(level);
    } catch {
      // segue para a verificação: a leitura decide se algo mudou
    }
    if (this.level(id) === level) return { ok: true };
    // não aplicou como esperado: restaura
    try {
      if (before >= 0) k.spec.apply(before);
    } catch {
      // verificado abaixo
    }
    if (before >= 0 && this.level(id) === before) {
      this.incidents.push(`${k.spec.label}: mudança não confirmada pela leitura; estado anterior restaurado`);
      return { ok: false, reason: 'mudança não confirmada (restaurado)' };
    }
    k.status = 'faulted';
    k.reason = 'restauração falhou';
    this.incidents.push(`${k.spec.label}: falha ao aplicar e ao restaurar; botão retirado do controle automático`);
    return { ok: false, reason: 'falha ao restaurar' };
  }

  /** Kill switch: desliga a adaptação e devolve cada botão à qualidade escolhida pelo jogador. */
  disable(): void {
    this.userEnabled = false;
    this.restoreAll();
  }

  enable(): void {
    this.userEnabled = true;
  }

  restoreAll(): void {
    for (const [id, k] of this.knobs) if (k.status === 'ok') this.set(id, k.spec.baseline, { force: true });
  }
}

/** Capacidades do aparelho e do contexto WebGL (só leitura). */
export function probeCapabilities(gl: WebGLRenderingContext | WebGL2RenderingContext, maxTextureSize: number): Capabilities {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number };
  let gpu: string | null;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '') || null;
  } catch {
    gpu = null;
  }
  return {
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
    maxTextureSize,
    gpuTimer: !!(gl.getExtension('EXT_disjoint_timer_query_webgl2') ?? gl.getExtension('EXT_disjoint_timer_query')),
    gpu,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    cores: nav.hardwareConcurrency || null,
    memoryGb: nav.deviceMemory ?? null,
    touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  };
}
