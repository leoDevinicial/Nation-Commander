/**
 * Relatório de desempenho exportável (KAICS Adaptables+ · C8, R-EVD-02): o jogador copia e cola
 * na conversa, e cada ajuste futuro passa a vir de dados do aparelho real.
 *
 * Contém só o necessário para diagnosticar o desempenho: aparelho, meta, janelas de medição,
 * botões, decisões e incidentes. Não contém nome do jogador, sala, posição no mapa, chat ou
 * qualquer dado pessoal. Nada é enviado automaticamente: o texto só sai quando o jogador copia.
 */
import type { Capabilities } from './kaics.ts';
import type { Decision, PerfSummary, WindowRecord } from './kgps.ts';

export const REPORT_SCHEMA = 'nc.perf.report.v1';
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
    windows: i.windows.slice(-30),
    knobs: s.knobs.map((k) => ({ id: k.id, level: k.level, levelText: k.levels[k.level] ?? null, baseline: k.baseline, floor: k.floor, emergencyFloor: k.emergencyFloor, status: k.status })),
    decisions: i.decisions.slice(-40),
    incidents: s.incidents.slice(-20),
    render: i.render,
    overheadUs: r2(s.overheadUs),
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
