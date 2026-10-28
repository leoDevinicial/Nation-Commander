/**
 * Relatório de desempenho exportável (KAICS Adaptables+ · C8, R-EVD-02): o jogador copia e cola
 * na conversa, e cada ajuste futuro passa a vir de dados do aparelho real.
 *
 * Contém só o necessário para diagnosticar o desempenho: aparelho, meta, janelas de medição,
 * botões, decisões e incidentes. Não contém nome do jogador, sala, posição no mapa, chat ou
 * qualquer dado pessoal. Nada é enviado automaticamente: o texto só sai quando o jogador copia.
 */
import type { Capabilities } from './kaics.ts';
import type { Decision, PerfSummary, PhaseSummary, SessionStats, WindowRecord } from './kgps.ts';
import type { MemorySample } from './memory.ts';

/** v2 (Onda 2): tempo de GPU por janela, resumo da sessão, pré-aquecimento e primeiro minuto. */
export const REPORT_SCHEMA = 'nc.perf.report.v2';
/** Tamanho máximo do texto copiado (bytes). */
export const REPORT_MAX_BYTES = 20_000;

export interface ReportInput {
  revision: number;
  preset: string;
  scene: 'teatro' | 'batalha';
  summary: PerfSummary;
  caps: Capabilities;
  windows: readonly WindowRecord[];
  decisions: readonly Decision[];
  render: { drawCalls: number; triangles: number; geometries: number; textures: number };
  /** Resumo da sessão até agora (consultor de preset). */
  session?: SessionStats;
  /** Pré-aquecimento de shaders (R-SHD-02): ligado, materiais e duração. */
  prewarm?: { enabled: boolean; materials: number; programs?: number; ms: number | null };
  /** Travadas e congelamentos nos primeiros 60 s depois do carregamento (null = ainda medindo). */
  firstMinute?: { hitches: number; stalls: number; done: boolean } | null;
  /** Ganho medido de cada ajuste (R-ADP-04). */
  knobGains?: { id: string; kept: number; reverted: number; sessionPct: number | null; learnedPct: number | null; expectedPct: number | null }[];
  /** Última amostra da vigia de memória. */
  memory?: MemorySample | null;
  /** Teste de campo automático (fases parado e combate). */
  fieldTest?: { status: string; batterySaver: boolean | null; troops: number; phases: PhaseSummary[] } | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** Relatório em JSON compacto, cortado (decisões e janelas mais antigas primeiro) até caber no limite. */
export function buildReport(i: ReportInput): string {
  const s = i.summary;
  const report = {
    schema: REPORT_SCHEMA,
    graphicsRevision: i.revision,
    preset: i.preset,
    scene: i.scene,
    device: {
      class: s.device.value,
      classSource: s.device.source,
      refreshHz: s.refreshHz,
      gpu: i.caps.gpu,
      dpr: r2(i.caps.devicePixelRatio),
      cores: i.caps.cores,
      memoryGb: i.caps.memoryGb,
      touch: i.caps.touch,
      shortSide: i.caps.shortSide ?? null,
      webgl2: i.caps.webgl2,
      gpuTimer: i.caps.gpuTimer,
    },
    target: { fps: s.target.fps, budgetMs: r2(s.target.budgetMs), origin: s.target.origin },
    mode: s.mode,
    state: s.state,
    fidelityIndex: r2(s.fidelity),
    emergencyKnobs: s.emergencyKnobs,
    bottleneck: { kind: s.bottleneck, source: s.bottleneckSource },
    thermalHoldS: s.thermalHoldS,
    windows: i.windows.slice(-30),
    knobs: s.knobs.map((k) => ({ id: k.id, level: k.level, levelText: k.levels[k.level] ?? null, baseline: k.baseline, floor: k.floor, emergencyFloor: k.emergencyFloor, status: k.status })),
    decisions: i.decisions.slice(-40),
    incidents: s.incidents.slice(-20),
    render: i.render,
    overheadUs: r2(s.overheadUs),
    session: i.session
      ? {
          minutes: r2(i.session.measuredMs / 60_000),
          belowShare: i.session.measuredMs > 0 ? r2(i.session.belowMs / i.session.measuredMs) : 0,
          emergencyShare: i.session.measuredMs > 0 ? r2(i.session.emergencyMs / i.session.measuredMs) : 0,
          fpsMedian: r2(i.session.fpsMedian),
          p95Median: r2(i.session.p95Median),
          hitches: i.session.hitches,
          stalls: i.session.stalls,
          adaptive: i.session.adaptive,
          fidelityMin: r2(i.session.fidelityMin),
        }
      : null,
    prewarm: i.prewarm ?? null,
    firstMinute: i.firstMinute ?? null,
    knobGains: (i.knobGains ?? []).map(({ id, kept, reverted, sessionPct, learnedPct, expectedPct }) => ({ id, kept, reverted, sessionPct, learnedPct, expectedPct })),
    memory: i.memory ? { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.memory.programs, heapMb: i.memory.heapMb, entities: i.memory.entities } : null,
    fieldTest: i.fieldTest ?? null,
  };
  let json = JSON.stringify(report);
  while (bytes(json) > REPORT_MAX_BYTES && (report.decisions.length > 5 || report.windows.length > 5 || report.incidents.length > 5)) {
    if (report.decisions.length > 5) report.decisions = report.decisions.slice(-Math.max(5, Math.floor(report.decisions.length * 0.75)));
    if (report.windows.length > 5) report.windows = report.windows.slice(-Math.max(5, Math.floor(report.windows.length * 0.75)));
    if (report.incidents.length > 5) report.incidents = report.incidents.slice(-5);
    json = JSON.stringify(report);
  }
  return json;
}
