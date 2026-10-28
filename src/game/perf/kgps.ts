/**
 * KGPS (Kaiser Graphic Performance System): mantém o jogo perto da meta de quadros do aparelho
 * (30 qps no celular, 60 no PC) mexendo o mínimo possível na qualidade, e só onde isso
 * comprovadamente ajuda.
 *
 * Ciclo, a cada janela de ~2 s:
 * 1. mede (intervalo entre quadros e tempo de CPU, ver `stats.ts`);
 * 2. se duas janelas seguidas estão lentas, escolhe o ajuste mais barato visualmente entre os que
 *    aliviam o gargalo provável e pede ao KAICS para aplicá-lo — um por vez;
 * 3. mede de novo: se melhorou, mantém. Com sincronia vertical a tela arredonda cada quadro para
 *    16,7 ou 33,3 ms, então um passo pequeno pode não aparecer na medida: ele fica provisório e
 *    o próximo passo se soma a ele (até 3). A cadeia é comparada com o ponto de partida e, se no
 *    fim nada melhorou, tudo é desfeito e esses ajustes ficam de lado por um tempo;
 * 4. com folga sustentada, devolve a qualidade na ordem inversa, testando cada passo — se voltar a
 *    ficar lento, desfaz e espera cada vez mais antes de tentar de novo (sem "pisca-pisca").
 *
 * v2 (KAICS Adaptables+, ver docs/KAICS_ADAPTABLES_PLUS.md):
 * - meta por classe de aparelho (o orçamento do quadro sai dela);
 * - descida rápida: com o jogo muito abaixo da meta, vários passos em segundos (inclusive os níveis
 *   de emergência), uma prova final e, se não houve ganho, tudo desfeito;
 * - limite externo explícito: quadros presos em 30 qps, com CPU folgada e reduções sem efeito, são
 *   tratados como limite do navegador ou do sistema (ex.: economia de bateria) — nada mais é
 *   reduzido enquanto o padrão durar;
 * - cada decisão diz a natureza da evidência (medido, estimado ou hipótese).
 *
 * Onda 2:
 * - meta escolhida pelo jogador (Automática, 30 ou 60), trocada na hora (`setTarget`);
 * - tempo de GPU medido, quando o navegador oferece, no diagnóstico do gargalo (`gpuSample`);
 * - tendência sustentada: com os mesmos ajustes, a mediana subindo 15% em 5 min é indício de
 *   aquecimento — as subidas de qualidade ficam seguradas por 5 min;
 * - eventos extraordinários marcados no registro (congelamento, aba oculta, troca de cena…);
 * - resumo da sessão (`session`) para o consultor de preset da próxima partida.
 *
 * Etapa 3:
 * - fases nomeadas (`beginPhase`), usadas pelo teste de campo automático do Sandbox;
 * - ganho medido de cada ajuste neste aparelho (R-ADP-04), guardado entre partidas: a descida
 *   rápida escolhe pelo menor custo visual por ganho esperado (seção 22 da especificação);
 * - carga da cena (chamadas de desenho) na janela: uma cena que fica mais pesada não é confundida
 *   com aquecimento.
 *
 * Nunca mexe em regras, simulação, névoa de guerra, fronteiras, seleção ou interface.
 */
import { FrameWindow, STALL_MS, classifyBottleneck, estimateRefreshHz, percentile, type Bottleneck, type BottleneckSource, type WindowStats } from './stats.ts';
import type { Kaics, KnobEntry } from './kaics.ts';
import type { DeviceClass, Observed, TargetPolicy } from './device.ts';

export const KGPS_CONFIG = {
  /** Meta quando nenhuma política de aparelho é informada (PC). */
  targetFps: 60,
  windowMs: 2000,
  minSamples: 20,
  /** Início da partida: compilação de shaders e envio de texturas distorcem as medidas. */
  warmupMs: 4000,
  /** Depois de cada mudança (ou redimensionamento/retomada), espera o renderizador assentar. */
  settleMs: 1200,
  /** Janela lenta: p95 acima de 1,2× o orçamento do quadro ou mediana acima de 1,08×. */
  badP95: 1.2,
  badP50: 1.08,
  /** Janela estável: p95 até 1,1× o orçamento (com sincronia vertical, o normal a 60 Hz). */
  steadyP95: 1.1,
  /** Folga visível (telas de 120 Hz+): p95 até 0,8× o orçamento. */
  headroomP95: 0.8,
  degradeAfter: 2,
  upgradeAfterHeadroom: 3,
  upgradeAfterSteady: 8,
  /** Melhora mínima para confirmar uma redução: mediana 4% menor ou p95 6% menor. */
  improveP50: 0.96,
  improveP95: 0.94,
  ineffectiveBanMs: 90_000,
  /** Passos somados antes de concluir que reduzir não ajuda (ver arredondamento da tela). */
  maxChainSteps: 3,
  /** Duas cadeias seguidas sem efeito: o limite é externo (tela/navegador/sistema). */
  ineffectiveLimit: 2,
  externalFreezeMs: 300_000,
  externalFreezeMaxMs: 1_800_000,
  upgradeBanBaseMs: 30_000,
  upgradeBanMaxMs: 480_000,
  watchdogWindowMs: 60_000,
  watchdogMaxChanges: 6,
  watchdogFreezeMs: 60_000,
  observeLogEveryMs: 20_000,
  logSize: 40,
  // ---- v2: descida rápida (R-EMG-*)
  /** Janela crítica: mediana acima de 1,8× o orçamento (< ~17 qps com meta 30; < ~33 com meta 60). */
  emergencyP50: 1.8,
  /** Queda tão forte que dispensa a espera entre descidas rápidas. */
  emergencyOverrideP50: 2.5,
  /** A descida para quando a mediana fica até 1,15× o orçamento. */
  emergencyExitP50: 1.15,
  /** Prova final: a mediana precisa cair pelo menos 15% em relação ao início. */
  emergencyMinGain: 0.85,
  emergencyCooldownMs: 180_000,
  /** Mini-janela entre os passos da descida (depois do assentamento). */
  emergencyProbeMs: 500,
  emergencyMaxStepsPerRound: 3,
  /** Depois de uma descida com ganho, nenhuma subida por 10 s. */
  stabilizeMs: 10_000,
  // ---- v2: limite externo (R-TGT-04)
  /** Fração mínima de quadros presos em 33,3 ms para suspeitar de limite de 30 Hz. */
  lock30Share: 0.8,
  /** E o JavaScript ocupando até 45% do quadro (a CPU não é o motivo). */
  lockCpuRatio: 0.45,
  /** Janelas seguidas fora do padrão para encerrar o limite externo. */
  externalCapExitWindows: 3,
  /** Janelas guardadas para o relatório. */
  reportWindows: 30,
  // ---- Onda 2: tendência sustentada (R-TGT-06)
  /** Alta da mediana, com os mesmos níveis de botões, que indica aquecimento (indício). */
  sustainedRise: 1.15,
  /** Tempo mínimo com os mesmos níveis para comparar o começo com o agora. */
  sustainedWindowMs: 300_000,
  /** Subidas de qualidade seguradas depois do indício. */
  thermalHoldMs: 300_000,
  // ---- Onda 2: eventos extraordinários (R-EVD-05)
  /** Intervalo mínimo entre dois registros do mesmo tipo de evento. */
  eventGapMs: 20_000,
  /** Janelas guardadas para o resumo da sessão (~2 h de partida). */
  sessionWindows: 3600,
  // ---- Etapa 3
  /** A cena ficou mais pesada (chamadas de desenho) se a carga sobe mais que isso: não é aquecimento. */
  trendLoadRise: 1.1,
  /** Ganho esperado de um ajuste sem histórico (queda de 8% da mediana por passo). */
  defaultGain: 0.08,
  /** Observações mínimas para usar o ganho aprendido de um ajuste. */
  gainMinSamples: 2,
  /** Peso máximo do histórico de ganho (o aparelho e o jogo mudam com o tempo). */
  gainMaxSamples: 20,
};

export type KgpsConfig = typeof KGPS_CONFIG;
export type KgpsState = 'warmup' | 'observing' | 'evaluating' | 'emergency' | 'stabilizing' | 'externalCap' | 'frozen';
export type DecisionKind = 'degrade' | 'upgrade' | 'keep' | 'revert' | 'hold' | 'suggest' | 'incident' | 'profile' | 'inconclusive' | 'mode' | 'emergency' | 'event';
/** Natureza da evidência de uma decisão (R-EVD-03). */
export type Evidence = 'medido' | 'estimado' | 'hipotese';

export interface Decision {
  /** Segundos desde o início da partida. */
  at: number;
  kind: DecisionKind;
  text: string;
  evidence: Evidence;
}

/** Ganho medido de um ajuste neste aparelho (R-ADP-04): queda relativa média da mediana por passo. */
export interface KnobGain {
  /** Passos observados. */
  n: number;
  /** Queda média da mediana por passo (0,1 = 10% mais rápido). */
  pct: number;
}

/** Ganhos aprendidos por aparelho e preset, guardados entre partidas. */
export interface GainStore {
  load(): Record<string, KnobGain> | null;
  save(gains: Record<string, KnobGain>): void;
}

/** Resumo de uma fase nomeada (ex.: as duas do teste de campo). */
export interface PhaseSummary {
  name: string;
  /** Duração da fase (s). */
  seconds: number;
  /** Tempo coberto por janelas válidas (s). */
  measuredS: number;
  fpsMedian: number;
  p95Median: number;
  belowShare: number;
  emergencyShare: number;
  hitches: number;
  stalls: number;
  /** Mudanças de qualidade decididas durante a fase. */
  changes: number;
  running: boolean;
}

/** Níveis aprendidos neste aparelho e preset (aplicados no começo da próxima partida). */
export interface ProfileStore {
  load(): Record<string, number> | null;
  save(levels: Record<string, number>): void;
}

interface Pending {
  kind: 'degrade' | 'upgrade';
  id: string;
  from: number;
  to: number;
  before: WindowStats;
}

interface Emergency {
  start: WindowStats;
  bottleneck: Bottleneck;
  applied: { id: string; from: number; to: number }[];
  phase: 'stepping' | 'proving';
}

/** Janela guardada para o relatório (tempo em segundos desde o início). */
export interface WindowRecord {
  t: number;
  fps: number;
  p10: number;
  p50: number;
  p95: number;
  p99: number;
  cpuP50: number;
  hitches: number;
  stalls: number;
  lock30: number;
  /** Tempo de GPU do quadro (mediana das amostras; null = não medido). */
  gpuP50: number | null;
  bottleneck: Bottleneck;
}

/**
 * Resumo da sessão para o consultor de preset (C6): quanto tempo o jogo passou abaixo da meta ou
 * com níveis de emergência, e os qps típicos. Só conta janelas válidas (fora dos portões).
 */
export interface SessionStats {
  /** Tempo coberto por janelas válidas (ms). */
  measuredMs: number;
  /** Tempo em janelas abaixo da meta (mediana acima de 1,08× o orçamento). */
  belowMs: number;
  /** Tempo com algum botão abaixo do piso normal (níveis de emergência). */
  emergencyMs: number;
  /** Mediana dos qps das janelas, ponderada pela duração. */
  fpsMedian: number;
  /** Mediana dos p95 das janelas (ms). */
  p95Median: number;
  hitches: number;
  stalls: number;
  targetFps: number;
  adaptive: boolean;
  /** Menor índice de fidelidade visto na sessão. */
  fidelityMin: number;
}
export interface PerfSummary {
  mode: 'adaptive' | 'observe' | 'blocked';
  state: KgpsState;
  reasons: string[];
  frozenReason: string | null;
  budgetMs: number;
  target: TargetPolicy;
  device: Observed<DeviceClass>;
  /** Taxa da tela inferida pelos quadros mais rápidos (null = indeterminada). */
  refreshHz: number | null;
  window: WindowStats | null;
  bottleneck: Bottleneck;
  /** O gargalo veio do tempo de GPU medido ou da fração de CPU (estimativa). */
  bottleneckSource: BottleneckSource;
  /** Segundos restantes de subidas seguradas por indício de aquecimento (null = nenhum). */
  thermalHoldS: number | null;
  overheadUs: number;
  /** Índice de fidelidade adaptativa (0–1): estimativa relativa aos ajustes disponíveis. */
  fidelity: number;
  /** Botões abaixo do piso normal (níveis de emergência em vigor). */
  emergencyKnobs: string[];
  knobs: { id: string; label: string; level: number; levels: readonly string[]; baseline: number; floor: number; emergencyFloor: number; status: KnobEntry['status'] }[];
  log: Decision[];
  incidents: string[];
}

const BOTTLENECK_TEXT: Record<Bottleneck, string> = { gpu: 'GPU', cpu: 'CPU', unknown: 'indefinido' };
const ORIGIN_TEXT: Record<TargetPolicy['origin'], string> = { classe: 'padrão do aparelho', jogador: 'escolha do jogador', tela: 'limite da tela' };

const ms = (v: number) => v.toFixed(1).replace('.', ',');
const qps = (p50: number) => (p50 > 0 ? Math.round(1000 / p50) : 0);

export class Kgps {
  budget: number;
  target: TargetPolicy;
  private readonly win = new FrameWindow();
  private readonly startedAt: number;
  private settleUntil: number;
  private frozenUntil = 0;
  private frozenReason: string | null = null;
  private externalFreezes = 0;
  private badStreak = 0;
  private goodStreak = 0;
  private headroomStreak = 0;
  private criticalStreak = 0;
  private pending: Pending | null = null;
  /** Reduções confirmadas, na ordem em que foram feitas (a qualidade volta na ordem inversa). */
  private readonly stack: string[] = [];
  /** Passos provisórios ainda sem efeito visível, a confirmar (ou desfazer) juntos. */
  private chain: Pending[] = [];
  private chainBefore: WindowStats | null = null;
  private chainBottleneck: Bottleneck = 'unknown';
  private readonly degradeBan = new Map<string, number>();
  private readonly upgradeBan = new Map<string, { until: number; strikes: number }>();
  private ineffective = 0;
  private readonly changes: number[] = [];
  private lastSuggest = -Infinity;
  private exhaustedLogged = false;
  private overheadMs = 0;
  private overheadFrames = 0;
  private emergency: Emergency | null = null;
  private emergencyCooldownUntil = 0;
  private stabilizeUntil = 0;
  /** Limite externo de 30 qps em vigor (até o padrão mudar ou até `until`). */
  private externalCap: { outside: number; until: number } | null = null;
  private readonly windows: WindowRecord[] = [];
  /** Tendência com os mesmos níveis de botões (R-TGT-06). */
  private trend: { sig: string; since: number; first: number[]; recent: number[]; firstLoad: number[]; recentLoad: number[] } | null = null;
  /** Subidas seguradas até aqui por indício de aquecimento. */
  private thermalUntil = 0;
  private readonly eventAt = new Map<string, number>();
  /** Janelas da sessão (para o consultor) e da fase em andamento (teste de campo). */
  private readonly sessionAcc: StatsAcc;
  private phase: { name: string; at: number; endedAt: number | null; acc: StatsAcc } | null = null;
  private readonly phaseLog: { name: string; at: number; endedAt: number | null; acc: StatsAcc }[] = [];
  /** Ganho observado de cada ajuste nesta partida e o aprendido em partidas anteriores. */
  private readonly gains = new Map<string, { kept: number; reverted: number; sumPct: number; n: number }>();
  private readonly learned: Record<string, KnobGain>;
  last: WindowStats | null = null;
  lastBottleneck: Bottleneck = 'unknown';
  lastBottleneckSource: BottleneckSource = 'cpu-share';
  overheadUs = 0;
  refreshHz: number | null = null;
  readonly log: Decision[] = [];

  constructor(
    private readonly kaics: Kaics,
    now: number,
    private store: ProfileStore | null = null,
    private readonly cfg: KgpsConfig = KGPS_CONFIG,
    target?: TargetPolicy,
    private readonly gainStore: GainStore | null = null,
  ) {
    this.sessionAcc = new StatsAcc(cfg.sessionWindows);
    this.learned = gainStore?.load() ?? {};
    this.target = target ?? { fps: cfg.targetFps, budgetMs: 1000 / cfg.targetFps, origin: 'classe' };
    this.budget = this.target.budgetMs;
    this.startedAt = now;
    this.settleUntil = now + cfg.warmupMs;
    for (const msg of kaics.incidents) this.push(now, 'incident', msg);
    this.applyProfile(now);
  }

  /**
   * Um quadro desenhado. Quadros com o KAICS bloqueando (cena oculta etc.) não devem chegar aqui.
   * `load` (opcional): chamadas de desenho do quadro, a carga da cena.
   */
  sample(now: number, intervalMs: number, cpuMs: number, load?: number): void {
    const t0 = performance.now();
    if (now >= this.settleUntil) {
      if (intervalMs > STALL_MS) this.event(now, 'stall', `Congelamento de ${(intervalMs / 1000).toFixed(1).replace('.', ',')} s (fora das medições: compilação, carga ou página parada)`);
      this.win.add(now, intervalMs, cpuMs, load);
      const span = now - this.win.start;
      if (this.emergency?.phase === 'stepping') {
        if ((span >= this.cfg.emergencyProbeMs && this.win.count >= 3) || (span >= this.cfg.emergencyProbeMs * 4 && this.win.count >= 1)) this.emergencyProbe(now);
      } else if ((span >= this.cfg.windowMs && this.win.count >= this.cfg.minSamples) || (span >= this.cfg.windowMs * 3 && this.win.count >= 5)) this.closeWindow(now);
    }
    this.overheadMs += performance.now() - t0;
    this.overheadFrames++;
  }

  /**
   * Tempo de GPU de um quadro (R-DEV-03), medido pelo `EXT_disjoint_timer_query_webgl2`. Chega
   * alguns quadros depois do quadro medido; vale só para a janela em andamento.
   */
  gpuSample(now: number, ms: number): void {
    if (now >= this.settleUntil && this.win.count > 0) this.win.addGpu(ms);
  }

  /**
   * Evento extraordinário (R-EVD-05): marcado no registro para explicar medidas estranhas
   * (congelamento, aba oculta, troca de cena, contexto perdido, pré-aquecimento). No máximo um
   * registro por tipo a cada 20 s.
   */
  event(now: number, key: string, text: string): void {
    const last = this.eventAt.get(key) ?? -Infinity;
    if (now - last < this.cfg.eventGapMs) return;
    this.eventAt.set(key, now);
    this.push(now, 'event', text);
  }

  /** Incidente vindo de fora do KGPS (ex.: vigia de memória): no registro e na lista do KAICS. */
  incident(now: number, text: string, evidence: Evidence = 'hipotese'): void {
    this.kaics.incidents.push(text);
    this.push(now, 'incident', text, evidence);
  }

  /**
   * Começa uma fase nomeada (encerrando a anterior): as janelas medidas até `endPhase` entram no
   * resumo dela. Usado pelo teste de campo automático do Sandbox.
   */
  beginPhase(name: string, now: number): void {
    this.endPhase(now);
    const p = { name, at: now, endedAt: null, acc: new StatsAcc(this.cfg.sessionWindows) };
    this.phase = p;
    this.phaseLog.push(p);
    this.push(now, 'event', `Fase "${name}" começou`);
  }

  endPhase(now: number): void {
    if (!this.phase) return;
    this.phase.endedAt = now;
    this.push(now, 'event', `Fase "${this.phase.name}" terminou`);
    this.phase = null;
  }

  /** Resumo das fases registradas nesta partida. */
  phases(now: number): PhaseSummary[] {
    const startS = (t: number) => (t - this.startedAt) / 1000;
    return this.phaseLog.map((p) => {
      const end = p.endedAt ?? now;
      const a = p.acc;
      const from = startS(p.at);
      const to = startS(end);
      return {
        name: p.name,
        seconds: Math.round((end - p.at) / 100) / 10,
        measuredS: Math.round(a.measuredMs / 100) / 10,
        fpsMedian: Math.round(a.fpsMedian() * 10) / 10,
        p95Median: Math.round(a.p95Median() * 10) / 10,
        belowShare: a.measuredMs > 0 ? Math.round((a.belowMs / a.measuredMs) * 100) / 100 : 0,
        emergencyShare: a.measuredMs > 0 ? Math.round((a.emergencyMs / a.measuredMs) * 100) / 100 : 0,
        hitches: a.hitches,
        stalls: a.stalls,
        changes: this.log.filter((d) => d.at >= from && d.at <= to && (d.kind === 'degrade' || d.kind === 'upgrade' || d.kind === 'emergency' || d.kind === 'revert')).length,
        running: p.endedAt === null,
      };
    });
  }

  /** Ganho medido de cada ajuste (R-ADP-04): nesta partida e o aprendido neste aparelho. */
  knobGains(): { id: string; label: string; kept: number; reverted: number; sessionPct: number | null; learnedPct: number | null; expectedPct: number | null }[] {
    const out = [];
    for (const id of this.kaics.knobs.keys()) {
      const g = this.gains.get(id);
      const l = this.learned[id];
      if (!g && !l) continue;
      const exp = this.expectedGain(id);
      out.push({
        id,
        label: this.label(id),
        kept: g?.kept ?? 0,
        reverted: g?.reverted ?? 0,
        sessionPct: g && g.n > 0 ? Math.round((g.sumPct / g.n) * 1000) / 1000 : null,
        learnedPct: l ? Math.round(l.pct * 1000) / 1000 : null,
        expectedPct: exp === null ? null : Math.round(exp * 1000) / 1000,
      });
    }
    return out;
  }

  /**
   * Nova meta (escolha do jogador nas configurações): o orçamento do quadro muda na hora e a
   * medição recomeça. `store` troca o ajuste aprendido para o da nova meta.
   */
  setTarget(target: TargetPolicy, now: number, store?: ProfileStore | null): void {
    if (target.fps === this.target.fps && target.origin === this.target.origin) return;
    const before = this.target.fps;
    this.target = target;
    this.budget = target.budgetMs;
    if (store !== undefined) this.store = store;
    this.trend = null;
    this.push(now, 'mode', `Meta: ${before} → ${target.fps} qps (${ORIGIN_TEXT[target.origin]})`);
    this.invalidate(now, 'meta alterada');
  }

  /** A tela pode ter mudado (outro monitor, zoom): a taxa estimada recomeça do zero (R-DEV-04). */
  resetRefresh(): void {
    this.refreshHz = null;
  }

  /**
   * Um botão foi trocado (ex.: resolução refeita para a nova densidade de tela): sai da pilha de
   * reduções e das esperas, para não ser devolvido com o significado antigo dos níveis.
   */
  forget(id: string, now: number): void {
    if (this.pending?.id === id || this.chain.some((c) => c.id === id) || this.emergency?.applied.some((a) => a.id === id)) this.invalidate(now, 'ajuste refeito');
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i] === id) this.stack.splice(i, 1);
    this.degradeBan.delete(id);
    this.upgradeBan.delete(id);
    this.trend = null;
  }

  /** Algo mudou fora do KGPS (redimensionamento, retomada, contexto restaurado): mede de novo. */
  invalidate(now: number, reason: string): void {
    this.win.clear();
    this.settleUntil = Math.max(this.settleUntil, now + this.cfg.settleMs);
    this.badStreak = this.goodStreak = this.headroomStreak = this.criticalStreak = 0;
    const e = this.emergency;
    if (e) {
      // a descida em andamento fica como está (pode ser devolvida depois, na ordem inversa)
      this.emergency = null;
      for (const a of e.applied) this.stack.push(a.id);
      this.emergencyCooldownUntil = now + this.cfg.emergencyCooldownMs;
      if (e.applied.length) this.push(now, 'inconclusive', `Descida rápida interrompida (${reason}); ${e.applied.length} ajuste(s) mantido(s)`);
    }
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    if (p.kind === 'degrade') for (const c of [...this.chain, p]) this.stack.push(c.id);
    this.chain = [];
    this.push(now, 'inconclusive', `Avaliação de ${this.label(p.id)} interrompida (${reason}); mudança mantida`);
  }

  /** Liga/desliga a adaptação. Desligar devolve a qualidade escolhida pelo jogador. */
  setAdaptive(on: boolean, now: number): void {
    if (on === this.kaics.enabled) return;
    if (on) {
      this.kaics.enable();
      this.push(now, 'mode', 'Qualidade adaptativa ligada');
    } else {
      this.kaics.disable();
      this.pending = null;
      this.emergency = null;
      this.chain = [];
      this.stack.length = 0;
      this.push(now, 'mode', 'Qualidade adaptativa desligada: qualidade escolhida nas configurações restaurada');
    }
    this.invalidate(now, 'modo alterado');
  }

  state(now: number): KgpsState {
    if (now < this.startedAt + this.cfg.warmupMs) return 'warmup';
    if (this.emergency) return 'emergency';
    if (this.pending) return 'evaluating';
    if (this.externalCap) return 'externalCap';
    if (now < this.frozenUntil) return 'frozen';
    if (now < this.stabilizeUntil) return 'stabilizing';
    return 'observing';
  }

  summary(now: number): PerfSummary {
    const verdict = this.kaics.verdict();
    const knobs = [...this.kaics.knobs.entries()].map(([id, k]) => ({
      id,
      label: k.spec.label,
      level: this.kaics.level(id),
      levels: k.spec.levels,
      baseline: k.spec.baseline,
      floor: k.spec.floor,
      emergencyFloor: k.spec.emergencyFloor ?? k.spec.floor,
      status: k.status,
    }));
    return {
      mode: verdict.mode,
      state: this.state(now),
      reasons: verdict.reasons,
      frozenReason: now < this.frozenUntil ? this.frozenReason : null,
      budgetMs: this.budget,
      target: this.target,
      device: this.kaics.device,
      refreshHz: this.refreshHz,
      window: this.last,
      bottleneck: this.lastBottleneck,
      bottleneckSource: this.lastBottleneckSource,
      thermalHoldS: now < this.thermalUntil ? Math.ceil((this.thermalUntil - now) / 1000) : null,
      overheadUs: this.overheadUs,
      fidelity: this.fidelity(),
      emergencyKnobs: knobs.filter((k) => k.status === 'ok' && k.level >= 0 && k.level < k.floor).map((k) => k.label),
      knobs,
      log: this.log.slice(-14),
      incidents: [...this.kaics.incidents],
    };
  }

  /** Janelas recentes (para o relatório exportável). */
  recentWindows(): readonly WindowRecord[] {
    return this.windows;
  }

  /** Resumo da sessão até agora (consultor de preset e relatório). */
  session(): SessionStats {
    const a = this.sessionAcc;
    return {
      measuredMs: a.measuredMs,
      belowMs: a.belowMs,
      emergencyMs: a.emergencyMs,
      fpsMedian: a.fpsMedian(),
      p95Median: a.p95Median(),
      hitches: a.hitches,
      stalls: a.stalls,
      targetFps: this.target.fps,
      adaptive: this.kaics.enabled,
      fidelityMin: a.fidelityMin,
    };
  }

  /**
   * Índice de fidelidade adaptativa (IFA): 1 − custo visual dos passos aplicados ÷ custo visual de
   * todos os passos até o piso de emergência. É uma estimativa relativa aos ajustes disponíveis,
   * não uma medida da imagem.
   */
  fidelity(): number {
    let total = 0;
    let applied = 0;
    for (const [id, k] of this.kaics.knobs) {
      if (k.status !== 'ok') continue;
      const lowest = k.spec.emergencyFloor ?? k.spec.floor;
      const level = this.kaics.level(id);
      for (let f = lowest + 1; f <= k.spec.baseline; f++) {
        const c = k.spec.stepCost(f);
        total += c;
        if (level >= 0 && f > level) applied += c;
      }
    }
    return total > 0 ? Math.max(0, Math.min(1, 1 - applied / total)) : 1;
  }

  // ------------------------------------------------------------ decisões

  private closeWindow(now: number): void {
    const s = this.win.stats(now)!;
    this.win.clear();
    this.last = s;
    const verdict = classifyBottleneck(s, this.cfg.minSamples, this.budget);
    this.lastBottleneck = verdict.kind;
    this.lastBottleneckSource = verdict.source;
    if (this.overheadFrames > 0) this.overheadUs = (this.overheadMs * 1000) / this.overheadFrames;
    this.overheadMs = 0;
    this.overheadFrames = 0;
    this.record(now, s);
    for (const c of this.kaics.audit()) this.push(now, 'incident', `${this.label(c.id)}: alterado fora do KAICS (${this.levelText(c.id, c.from)} → ${this.levelText(c.id, c.to)}); novo nível adotado`);
    this.trackTrend(now, s);
    if (this.emergency) {
      if (this.emergency.phase === 'proving') this.emergencyJudge(now, s);
      return;
    }
    if (this.pending) return this.judge(now, s);
    if (this.externalCap && this.checkExternalCap(now, s)) return;
    if (now < this.frozenUntil) return;
    // muito abaixo da meta: descida rápida (a não ser que o quadro esteja preso em 30 Hz — aí a
    // carga e um limite da tela se confundem, e o caminho passo a passo resolve a dúvida)
    this.criticalStreak = this.isCritical(s) ? this.criticalStreak + 1 : 0;
    if (!this.externalCap && this.criticalStreak >= this.cfg.degradeAfter && (now >= this.emergencyCooldownUntil || s.p50 > this.budget * this.cfg.emergencyOverrideP50)) {
      this.criticalStreak = 0;
      if (this.startEmergency(now, s)) {
        this.badStreak = this.goodStreak = this.headroomStreak = 0;
        return;
      }
    }
    if (this.isBad(s)) {
      this.badStreak++;
      this.goodStreak = this.headroomStreak = 0;
    } else if (s.p95 <= this.budget * this.cfg.steadyP95) {
      this.goodStreak++;
      this.badStreak = 0;
      this.headroomStreak = s.p95 <= this.budget * this.cfg.headroomP95 ? this.headroomStreak + 1 : 0;
    } else {
      this.badStreak = this.goodStreak = this.headroomStreak = 0;
    }
    if (this.badStreak >= this.cfg.degradeAfter) {
      this.badStreak = 0;
      // limite externo em vigor: reduzir não resolve (só se espera o padrão mudar)
      if (!this.externalCap) this.degrade(now, s);
    } else if (this.stack.length && now >= this.stabilizeUntil && now >= this.thermalUntil && (this.headroomStreak >= this.cfg.upgradeAfterHeadroom || this.goodStreak >= this.cfg.upgradeAfterSteady)) {
      this.goodStreak = this.headroomStreak = 0;
      this.upgrade(now, s);
    }
  }

  private record(now: number, s: WindowStats): void {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    this.windows.push({
      t: Math.round((now - this.startedAt) / 100) / 10,
      fps: r2(s.fps),
      p10: r2(s.p10),
      p50: r2(s.p50),
      p95: r2(s.p95),
      p99: r2(s.p99),
      cpuP50: r2(s.cpuP50),
      hitches: s.hitches,
      stalls: s.stalls,
      lock30: r2(s.lock30),
      gpuP50: s.gpuP50 === null ? null : r2(s.gpuP50),
      bottleneck: this.lastBottleneck,
    });
    if (this.windows.length > this.cfg.reportWindows) this.windows.splice(0, this.windows.length - this.cfg.reportWindows);
    // sessão e fase em andamento: tempo abaixo da meta e com níveis de emergência
    const below = s.p50 > this.budget * this.cfg.badP50;
    const emergency = this.inEmergencyLevels();
    const fidelity = this.fidelity();
    this.sessionAcc.add(s, below, emergency, fidelity);
    this.phase?.acc.add(s, below, emergency, fidelity);
    // taxa da tela: a mais rápida já evidenciada pelos quadros com folga (R-DEV-02)
    const hz = estimateRefreshHz(s.p10);
    if (hz !== null && (this.refreshHz === null || hz > this.refreshHz)) this.refreshHz = hz;
  }

  /** Algum botão abaixo do piso normal (nível de emergência em vigor). */
  private inEmergencyLevels(): boolean {
    for (const [id, k] of this.kaics.knobs) {
      if (k.status !== 'ok') continue;
      const l = this.kaics.level(id);
      if (l >= 0 && l < k.spec.floor) return true;
    }
    return false;
  }

  /** Assinatura dos níveis em vigor (a tendência só compara janelas com os mesmos ajustes). */
  private configSig(): string {
    let sig = '';
    for (const id of this.kaics.knobs.keys()) sig += `${id}:${this.kaics.level(id)};`;
    return sig;
  }

  /**
   * Tendência sustentada (R-TGT-06): com os mesmos níveis de botões por 5 min, a mediana das
   * últimas janelas 15% acima das primeiras é indício de aquecimento (o aparelho reduzindo o
   * próprio ritmo). Não é medido — a temperatura não é acessível no navegador —, por isso só segura
   * as subidas de qualidade por um tempo, em vez de reduzir algo.
   */
  private trackTrend(now: number, s: WindowStats): void {
    if (this.pending || this.emergency || this.chain.length) {
      this.trend = null;
      return;
    }
    const sig = this.configSig();
    if (!this.trend || this.trend.sig !== sig) this.trend = { sig, since: now, first: [], recent: [], firstLoad: [], recentLoad: [] };
    const t = this.trend;
    if (t.first.length < 3) {
      t.first.push(s.p50);
      if (s.loadP50 !== null) t.firstLoad.push(s.loadP50);
      return;
    }
    t.recent.push(s.p50);
    if (t.recent.length > 3) t.recent.shift();
    if (s.loadP50 !== null) {
      t.recentLoad.push(s.loadP50);
      if (t.recentLoad.length > 3) t.recentLoad.shift();
    }
    if (now - t.since < this.cfg.sustainedWindowMs || t.recent.length < 3) return;
    const before = median3(t.first);
    const after = median3(t.recent);
    if (after < before * this.cfg.sustainedRise) return;
    // mais desenhos por quadro: a cena ficou mais pesada (batalha, mais prédios) — não é aquecimento
    if (t.firstLoad.length && t.recentLoad.length && median3(t.recentLoad) > median3(t.firstLoad) * this.cfg.trendLoadRise) {
      this.trend = { sig, since: now, first: [], recent: [], firstLoad: [], recentLoad: [] };
      return;
    }
    this.thermalUntil = now + this.cfg.thermalHoldMs;
    this.push(
      now,
      'hold',
      `Possível aquecimento (indício, não medido): com os mesmos ajustes, a mediana subiu de ${ms(before)} para ${ms(after)} ms em ${Math.round((now - t.since) / 60_000)} min; subidas de qualidade seguradas por ${Math.round(this.cfg.thermalHoldMs / 60_000)} min`,
      'hipotese',
    );
    // a próxima comparação começa daqui
    this.trend = { sig, since: now, first: [], recent: [], firstLoad: [], recentLoad: [] };
  }

  private isBad(s: WindowStats): boolean {
    return s.p95 > this.budget * this.cfg.badP95 || s.p50 > this.budget * this.cfg.badP50;
  }

  /** Quadro preso em 30 Hz com a CPU folgada: limite da tela/navegador ou carga entre 17 e 33 ms. */
  private looksLocked30(s: WindowStats): boolean {
    return s.lock30 >= this.cfg.lock30Share && s.p50 > 0 && s.cpuP50 / s.p50 <= this.cfg.lockCpuRatio;
  }

  private isCritical(s: WindowStats): boolean {
    return s.p50 > this.budget * this.cfg.emergencyP50 && !this.looksLocked30(s);
  }

  private candidate(now: number, emergency = false, bottleneck?: Bottleneck): { id: string; from: number; to: number } | null {
    // dentro de uma cadeia, vale o diagnóstico do começo (a tela arredonda as medidas do meio)
    const b = bottleneck ?? (this.chain.length ? this.chainBottleneck : this.lastBottleneck);
    // descida rápida: menor custo visual por ganho esperado (o ganho aprendido neste aparelho, ou um
    // padrão sem histórico); ajuste normal: menor custo visual, e no empate o que mais ajuda
    let best: { id: string; from: number; to: number; cost: number; gain: number } | null = null;
    for (const [id, k] of this.kaics.knobs) {
      if (k.status !== 'ok') continue;
      if ((this.degradeBan.get(id) ?? 0) > now) continue;
      if (b !== 'unknown' && !k.spec.helps.includes(b)) continue;
      const level = this.kaics.level(id);
      if (level < 0 || level <= this.kaics.minLevel(id, emergency)) continue;
      const cost = k.spec.stepCost(level);
      const gain = Math.min(0.6, Math.max(0.01, this.expectedGain(id) ?? this.cfg.defaultGain));
      const better = !best || (emergency ? cost / gain < best.cost / best.gain - 1e-9 : cost < best.cost || (cost === best.cost && gain > best.gain + 1e-9));
      if (better) best = { id, from: level, to: level - 1, cost, gain };
    }
    return best;
  }

  private degrade(now: number, s: WindowStats): void {
    const diag =
      this.lastBottleneckSource === 'gpu-timer' && s.gpuP50 !== null
        ? `gargalo: ${BOTTLENECK_TEXT[this.lastBottleneck]} (GPU medida: ${ms(s.gpuP50)} ms por quadro)`
        : `gargalo provável: ${BOTTLENECK_TEXT[this.lastBottleneck]}`;
    const why = `quadros lentos (p95 ${ms(s.p95)} ms, mediana ${ms(s.p50)} ms; ${diag})`;
    // o passo escolhido depende do gargalo: estimado pela fração de CPU, medido com tempo de GPU
    const evidence: Evidence = this.lastBottleneck === 'unknown' || this.lastBottleneckSource === 'gpu-timer' ? 'medido' : 'estimado';
    const c = this.candidate(now);
    if (!c) {
      if (!this.exhaustedLogged) this.push(now, 'hold', `Sem ajuste disponível para ${why}: a qualidade já está no piso permitido ou os ajustes estão em pausa`);
      this.exhaustedLogged = true;
      return;
    }
    const step = `${this.label(c.id)}: ${this.levelText(c.id, c.from)} → ${this.levelText(c.id, c.to)}`;
    if (this.kaics.verdict().mode !== 'adaptive') {
      if (now - this.lastSuggest >= this.cfg.observeLogEveryMs) {
        this.lastSuggest = now;
        this.push(now, 'suggest', `Modo observação — faria ${step}, por ${why}`);
      }
      return;
    }
    const r = this.kaics.set(c.id, c.to);
    if (!r.ok) {
      this.push(now, 'incident', `${this.label(c.id)}: ajuste recusado (${r.reason})`);
      this.degradeBan.set(c.id, now + this.cfg.ineffectiveBanMs);
      return;
    }
    this.pending = { kind: 'degrade', ...c, before: s };
    this.push(now, 'degrade', `Reduzido ${step}, por ${why}`, evidence);
    this.afterChange(now);
  }

  private upgrade(now: number, s: WindowStats): void {
    let idx = -1;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const ban = this.upgradeBan.get(this.stack[i]!);
      if (!ban || ban.until <= now) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    const id = this.stack.splice(idx, 1)[0]!;
    const k = this.kaics.knobs.get(id);
    const from = this.kaics.level(id);
    if (!k || k.status !== 'ok' || from < 0 || from >= k.spec.baseline) return;
    if (this.kaics.verdict().mode !== 'adaptive') return;
    // subir de um nível de emergência ainda passa por níveis abaixo do piso normal
    const r = this.kaics.set(id, from + 1, { emergency: from + 1 < k.spec.floor });
    if (!r.ok) {
      this.push(now, 'incident', `${this.label(id)}: não foi possível recuperar a qualidade (${r.reason})`);
      return;
    }
    this.pending = { kind: 'upgrade', id, from, to: from + 1, before: s };
    this.push(now, 'upgrade', `Folga sustentada (p95 ${ms(s.p95)} ms): testando ${this.label(id)} ${this.levelText(id, from)} → ${this.levelText(id, from + 1)}`);
    this.afterChange(now);
  }

  private judge(now: number, s: WindowStats): void {
    const p = this.pending!;
    this.pending = null;
    const name = this.label(p.id);
    if (p.kind === 'degrade') {
      const ref = this.chainBefore ?? p.before;
      const steps = [...this.chain, p];
      const names = [...new Set(steps.map((c) => this.label(c.id)))].join(' + ');
      const improved = s.p50 <= ref.p50 * this.cfg.improveP50 || s.p95 <= ref.p95 * this.cfg.improveP95;
      if (improved) {
        for (const c of steps) this.stack.push(c.id);
        this.noteGain(steps.map((c) => c.id), ref.p50, s.p50, true);
        this.chain = [];
        this.chainBefore = null;
        this.ineffective = 0;
        this.push(now, 'keep', `Confirmado: ${names} ajudou (p95 ${ms(ref.p95)} → ${ms(s.p95)} ms, mediana ${ms(ref.p50)} → ${ms(s.p50)} ms)`);
        this.save();
        // ainda lento: o próximo passo sai já na próxima janela lenta
        this.badStreak = this.isBad(s) ? this.cfg.degradeAfter - 1 : 0;
        return;
      }
      if (steps.length < this.cfg.maxChainSteps) {
        if (!this.chain.length) this.chainBottleneck = this.lastBottleneck;
        this.chain = steps;
        this.chainBefore = ref;
        if (this.candidate(now)) {
          this.push(now, 'inconclusive', `Sem efeito visível ainda (p95 ${ms(s.p95)} ms; a tela arredonda o tempo do quadro): mantendo ${names} e somando o próximo passo`);
          this.degrade(now, s);
          if (this.pending) return;
        }
      }
      for (let i = steps.length - 1; i >= 0; i--) {
        this.revert(now, steps[i]!);
        this.degradeBan.set(steps[i]!.id, now + this.cfg.ineffectiveBanMs);
      }
      this.noteGain(steps.map((c) => c.id), ref.p50, s.p50, false);
      this.chain = [];
      this.chainBefore = null;
      this.ineffective++;
      this.push(now, 'revert', `Desfeito: ${names} não melhorou (p95 ${ms(ref.p95)} → ${ms(s.p95)} ms); fica de fora por ${this.cfg.ineffectiveBanMs / 1000} s`);
      // quadros presos em 30 qps antes e depois, com a CPU folgada: limite da tela/navegador/sistema
      if (this.looksLocked30(ref) && this.looksLocked30(s)) {
        this.ineffective = 0;
        this.enterExternalCap(now);
        return;
      }
      if (this.ineffective >= this.cfg.ineffectiveLimit) {
        this.ineffective = 0;
        const dur = Math.min(this.cfg.externalFreezeMaxMs, this.cfg.externalFreezeMs * 2 ** this.externalFreezes++);
        this.freeze(now, dur, 'Reduzir a qualidade não está ajudando: o limite parece ser da tela, do navegador ou do sistema', 'hipotese');
      } else this.badStreak = this.cfg.degradeAfter - 1;
      return;
    }
    if (this.isBad(s)) {
      this.revert(now, p);
      this.stack.push(p.id);
      // subir este ajuste pesou: é a mesma medida do ganho de descê-lo, vista ao contrário
      this.noteGain([p.id], s.p50, p.before.p50, true);
      const prev = this.upgradeBan.get(p.id);
      const strikes = (prev?.strikes ?? 0) + 1;
      const wait = Math.min(this.cfg.upgradeBanMaxMs, this.cfg.upgradeBanBaseMs * 2 ** (strikes - 1));
      this.upgradeBan.set(p.id, { until: now + wait, strikes });
      this.push(now, 'revert', `Voltou: subir ${name} deixou o jogo lento (p95 ${ms(s.p95)} ms); nova tentativa em ${Math.round(wait / 1000)} s`);
      return;
    }
    this.push(now, 'keep', `Qualidade recuperada: ${name} ${this.levelText(p.id, p.from)} → ${this.levelText(p.id, p.to)}`);
    this.save();
  }

  // ------------------------------------------------------------ limite externo (R-TGT-04)

  private enterExternalCap(now: number): void {
    const dur = Math.min(this.cfg.externalFreezeMaxMs, this.cfg.externalFreezeMs * 2 ** this.externalFreezes++);
    this.externalCap = { outside: 0, until: now + dur };
    const met = this.target.fps <= 30 ? ' A meta de 30 qps está sendo atingida.' : '';
    this.push(
      now,
      'hold',
      `Quadros presos em 30 qps mesmo reduzindo a qualidade, com a CPU folgada: limite do navegador ou do sistema provável (ex.: economia de bateria). Nada mais será reduzido enquanto durar.${met}`,
      'hipotese',
    );
  }

  /** Limite externo em vigor: sai quando o padrão muda ou o prazo vence. Devolve true se a janela foi consumida. */
  private checkExternalCap(now: number, s: WindowStats): boolean {
    const cap = this.externalCap!;
    cap.outside = s.lock30 < 0.5 ? cap.outside + 1 : 0;
    if (cap.outside >= this.cfg.externalCapExitWindows || now >= cap.until) {
      this.externalCap = null;
      this.push(now, 'mode', now >= cap.until ? 'Revendo o limite de 30 qps: voltando a medir o efeito dos ajustes' : 'O limite de 30 qps sumiu: voltando a ajustar normalmente');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ descida rápida (R-EMG-*)

  private startEmergency(now: number, s: WindowStats): boolean {
    const why = `quadros muito lentos (mediana ${ms(s.p50)} ms, ~${qps(s.p50)} qps; meta ${this.target.fps} qps)`;
    if (this.kaics.verdict().mode !== 'adaptive') {
      if (now - this.lastSuggest >= this.cfg.observeLogEveryMs) {
        this.lastSuggest = now;
        this.push(now, 'suggest', `Modo observação — faria a descida rápida, por ${why}`);
      }
      return false;
    }
    if (!this.candidate(now, true, this.lastBottleneck)) return false;
    this.emergency = { start: s, bottleneck: this.lastBottleneck, applied: [], phase: 'stepping' };
    this.push(now, 'emergency', `Descida rápida: ${why}`);
    // a descida inteira conta como uma mudança no vigia de oscilação
    this.afterChange(now);
    this.emergencyStep(now, s);
    return true;
  }

  /** Aplica a próxima leva de passos (mais passos quanto mais longe da meta). */
  private emergencyStep(now: number, s: WindowStats): void {
    const e = this.emergency!;
    const ratio = s.p50 / this.budget;
    const n = Math.min(this.cfg.emergencyMaxStepsPerRound, ratio > 3 ? 3 : ratio > 2 ? 2 : 1);
    let done = 0;
    let tries = 0;
    while (done < n && tries++ < 12) {
      const c = this.candidate(now, true, e.bottleneck);
      if (!c) break;
      const r = this.kaics.set(c.id, c.to, { emergency: true });
      if (!r.ok) {
        this.push(now, 'incident', `${this.label(c.id)}: ajuste recusado na descida rápida (${r.reason})`);
        this.degradeBan.set(c.id, now + this.cfg.ineffectiveBanMs);
        continue;
      }
      e.applied.push(c);
      done++;
    }
    if (done === 0) {
      // sem mais passos: a prova final decide se o que foi feito valeu
      e.phase = 'proving';
      if (!e.applied.length) {
        this.emergency = null;
        this.emergencyCooldownUntil = now + this.cfg.emergencyCooldownMs;
        this.push(now, 'hold', 'Descida rápida sem ajuste disponível: a qualidade já está no piso permitido');
        return;
      }
    }
    this.win.clear();
    this.settleUntil = now + this.cfg.settleMs;
    this.exhaustedLogged = false;
  }

  /** Mini-janela entre os passos: para quando já está perto da meta. */
  private emergencyProbe(now: number): void {
    const s = this.win.stats(now)!;
    this.win.clear();
    if (s.p50 <= this.budget * this.cfg.emergencyExitP50) {
      this.emergency!.phase = 'proving';
      return;
    }
    this.emergencyStep(now, s);
  }

  /** Prova final: uma janela completa contra o início da descida. */
  private emergencyJudge(now: number, s: WindowStats): void {
    const e = this.emergency!;
    this.emergency = null;
    this.emergencyCooldownUntil = now + this.cfg.emergencyCooldownMs;
    const before = e.start;
    const steps = e.applied.map((a) => `${this.label(a.id)} ${this.levelText(a.id, a.from)} → ${this.levelText(a.id, a.to)}`).join(', ');
    if (s.p50 <= before.p50 * this.cfg.emergencyMinGain) {
      for (const a of e.applied) this.stack.push(a.id);
      this.noteGain(e.applied.map((a) => a.id), before.p50, s.p50, true);
      this.stabilizeUntil = now + this.cfg.stabilizeMs;
      this.push(
        now,
        'keep',
        `Descida rápida concluída: ${e.applied.length} ajuste(s) (${steps}); mediana ${ms(before.p50)} → ${ms(s.p50)} ms (~${qps(before.p50)} → ~${qps(s.p50)} qps)`,
      );
      this.save();
      return;
    }
    for (let i = e.applied.length - 1; i >= 0; i--) {
      const a = e.applied[i]!;
      this.revert(now, { kind: 'degrade', ...a, before });
      this.degradeBan.set(a.id, now + this.cfg.ineffectiveBanMs);
    }
    this.noteGain(e.applied.map((a) => a.id), before.p50, s.p50, false);
    this.push(
      now,
      'revert',
      `Descida rápida desfeita: ${e.applied.length} ajuste(s) sem ganho suficiente (mediana ${ms(before.p50)} → ${ms(s.p50)} ms). Causa provável: limite que não é gráfico (CPU, rede, navegador) ou externo`,
      'hipotese',
    );
  }

  private revert(now: number, p: Pending): void {
    // voltar a um nível já confirmado é sempre permitido (mesmo um nível de emergência)
    const r = this.kaics.set(p.id, p.from, { emergency: true });
    if (!r.ok) this.push(now, 'incident', `${this.label(p.id)}: não foi possível desfazer (${r.reason})`);
    this.afterChange(now, false);
  }

  private afterChange(now: number, count = true): void {
    this.win.clear();
    this.settleUntil = now + this.cfg.settleMs;
    this.exhaustedLogged = false;
    if (!count) return;
    this.changes.push(now);
    while (this.changes.length && this.changes[0]! < now - this.cfg.watchdogWindowMs) this.changes.shift();
    if (this.changes.length > this.cfg.watchdogMaxChanges) {
      this.changes.length = 0;
      this.freeze(now, this.cfg.watchdogFreezeMs, 'Muitas mudanças em pouco tempo: segurando a qualidade atual para estabilizar');
    }
  }

  private freeze(now: number, dur: number, reason: string, evidence: Evidence = 'medido'): void {
    this.frozenUntil = now + dur;
    this.frozenReason = reason;
    this.push(now, 'hold', `${reason} (pausa de ${Math.round(dur / 1000)} s)`, evidence);
  }

  // ------------------------------------------------------------ ganho por ajuste (R-ADP-04)

  /** Ganho esperado de um passo deste ajuste (null = sem observações suficientes). */
  private expectedGain(id: string): number | null {
    const l = this.learned[id];
    const g = this.gains.get(id);
    const n = (l?.n ?? 0) + (g?.n ?? 0);
    if (n < this.cfg.gainMinSamples) return null;
    return ((l ? l.pct * l.n : 0) + (g?.sumPct ?? 0)) / n;
  }

  /**
   * Registra o efeito medido de uma decisão: a queda relativa da mediana (de `fromP50` para
   * `toP50`) dividida entre os passos que participaram. Desfeitos também contam (ganho ~0).
   */
  private noteGain(ids: readonly string[], fromP50: number, toP50: number, kept: boolean): void {
    if (!ids.length || fromP50 <= 0) return;
    const pct = Math.max(-0.5, Math.min(0.9, (fromP50 - toP50) / fromP50)) / ids.length;
    const seen = new Set<string>();
    for (const id of ids) {
      const g = this.gains.get(id) ?? { kept: 0, reverted: 0, sumPct: 0, n: 0 };
      g.sumPct += pct;
      g.n++;
      if (!seen.has(id)) {
        if (kept) g.kept++;
        else g.reverted++;
        seen.add(id);
      }
      this.gains.set(id, g);
    }
    this.saveGains();
  }

  private saveGains(): void {
    if (!this.gainStore) return;
    const out: Record<string, KnobGain> = { ...this.learned };
    for (const [id, g] of this.gains) {
      const l = this.learned[id];
      const n = (l?.n ?? 0) + g.n;
      const pct = ((l ? l.pct * l.n : 0) + g.sumPct) / n;
      out[id] = { n: Math.min(this.cfg.gainMaxSamples, n), pct: Math.round(pct * 1000) / 1000 };
    }
    this.gainStore.save(out);
  }

  // ------------------------------------------------------------ perfil aprendido

  private applyProfile(now: number): void {
    const saved = this.store?.load();
    if (!saved || this.kaics.verdict().mode !== 'adaptive') return;
    const applied: string[] = [];
    for (const [id, level] of Object.entries(saved)) {
      const k = this.kaics.knobs.get(id);
      // níveis de emergência valem: foram confirmados numa descida rápida neste aparelho e preset
      if (!k || k.status !== 'ok' || !Number.isInteger(level) || level < this.kaics.minLevel(id, true) || level >= k.spec.baseline) continue;
      if (!this.kaics.set(id, level, { emergency: true }).ok) continue;
      for (let i = level; i < k.spec.baseline; i++) this.stack.push(id);
      applied.push(`${k.spec.label} ${this.levelText(id, level)}`);
    }
    if (applied.length) this.push(now, 'profile', `Começando do ajuste aprendido neste aparelho: ${applied.join(', ')} (a qualidade sobe sozinha se houver folga)`, 'estimado');
  }

  private save(): void {
    if (!this.store) return;
    const out: Record<string, number> = {};
    for (const [id, k] of this.kaics.knobs) {
      const level = this.kaics.level(id);
      if (k.status === 'ok' && level >= 0 && level < k.spec.baseline) out[id] = level;
    }
    this.store.save(out);
  }

  // ------------------------------------------------------------ utilidades

  private label(id: string): string {
    return this.kaics.knobs.get(id)?.spec.label ?? id;
  }

  private levelText(id: string, level: number): string {
    return this.kaics.knobs.get(id)?.spec.levels[level] ?? String(level);
  }

  private push(now: number, kind: DecisionKind, text: string, evidence: Evidence = 'medido'): void {
    this.log.push({ at: Math.max(0, Math.round((now - this.startedAt) / 100) / 10), kind, text, evidence });
    if (this.log.length > this.cfg.logSize) this.log.splice(0, this.log.length - this.cfg.logSize);
  }
}

/** Acumulador de janelas (sessão inteira ou uma fase): tempo medido, abaixo da meta, emergência, qps. */
class StatsAcc {
  measuredMs = 0;
  belowMs = 0;
  emergencyMs = 0;
  hitches = 0;
  stalls = 0;
  fidelityMin = 1;
  private readonly wins: { fps: number; p95: number; span: number }[] = [];

  constructor(private readonly cap: number) {}

  add(s: WindowStats, below: boolean, emergency: boolean, fidelity: number): void {
    const span = Math.max(s.spanMs, 1);
    this.measuredMs += span;
    if (below) this.belowMs += span;
    if (emergency) this.emergencyMs += span;
    this.hitches += s.hitches;
    this.stalls += s.stalls;
    this.fidelityMin = Math.min(this.fidelityMin, fidelity);
    this.wins.push({ fps: s.fps, p95: s.p95, span });
    if (this.wins.length > this.cap) this.wins.shift();
  }

  fpsMedian(): number {
    return weightedMedian(this.wins.map((w) => [w.fps, w.span]));
  }

  p95Median(): number {
    return percentile(this.wins.map((w) => w.p95).sort((a, b) => a - b), 0.5);
  }
}

/** Mediana de três (ou menos) valores. */
function median3(v: readonly number[]): number {
  return percentile([...v].sort((a, b) => a - b), 0.5);
}

/** Mediana ponderada de pares [valor, peso]. */
function weightedMedian(pairs: [number, number][]): number {
  if (!pairs.length) return 0;
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((acc, p) => acc + p[1], 0);
  let acc = 0;
  for (const [v, w] of sorted) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return sorted.at(-1)![0];
}

/**
 * Ganhos por ajuste salvos no navegador, por chave (versão gráfica, preset, densidade de tela e
 * classe do aparelho; ver `gainKey` em device.ts). Expiram em 30 dias.
 */
export function localGainStore(key: string, nowMs = Date.now()): GainStore {
  const STORAGE = 'nc.kgps.gains.v1';
  const TTL = 30 * 24 * 3600 * 1000;
  const read = (): Record<string, { gains: Record<string, KnobGain>; at: number }> => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as unknown;
      return raw && typeof raw === 'object' ? (raw as Record<string, { gains: Record<string, KnobGain>; at: number }>) : {};
    } catch {
      return {};
    }
  };
  return {
    load: () => {
      const e = read()[key];
      if (!e || typeof e.at !== 'number' || nowMs - e.at > TTL || typeof e.gains !== 'object' || e.gains === null) return null;
      const out: Record<string, KnobGain> = {};
      for (const [id, g] of Object.entries(e.gains)) if (g && Number.isFinite(g.n) && Number.isFinite(g.pct) && g.n > 0) out[id] = { n: g.n, pct: g.pct };
      return out;
    },
    save: (gains) => {
      try {
        const all = read();
        all[key] = { gains, at: Date.now() };
        localStorage.setItem(STORAGE, JSON.stringify(all));
      } catch {
        // armazenamento indisponível: o ganho vale só para esta partida
      }
    },
  };
}

/** Ajuste aprendido salvo no navegador, por chave (ver `profileKey`); expira em 14 dias. */
export function localProfileStore(key: string, nowMs = Date.now()): ProfileStore {
  const STORAGE = 'nc.kgps.v2';
  const TTL = 14 * 24 * 3600 * 1000;
  const read = (): Record<string, { levels: Record<string, number>; at: number }> => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as unknown;
      return raw && typeof raw === 'object' ? (raw as Record<string, { levels: Record<string, number>; at: number }>) : {};
    } catch {
      return {};
    }
  };
  return {
    load: () => {
      const e = read()[key];
      if (!e || typeof e.at !== 'number' || nowMs - e.at > TTL || typeof e.levels !== 'object' || e.levels === null) return null;
      return e.levels;
    },
    save: (levels) => {
      try {
        const all = read();
        if (Object.keys(levels).length) all[key] = { levels, at: Date.now() };
        else delete all[key];
        localStorage.setItem(STORAGE, JSON.stringify(all));
        // o formato v1 (sem a versão gráfica na chave) não vale mais
        localStorage.removeItem('nc.kgps.v1');
      } catch {
        // armazenamento indisponível: o ajuste vale só para esta partida
      }
    },
  };
}
