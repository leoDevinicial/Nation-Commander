/**
 * KAICS Adaptables+ · C6 — consultor de preset (próxima partida).
 *
 * O KGPS ajusta dentro da partida, mas parte do custo é fixa enquanto ela dura (modelos, sombras
 * ligadas, antisserrilhado, subdivisão do terreno). Quando um preset passa a maior parte da
 * partida abaixo da meta, o consultor recomenda outro para a próxima, com motivo e números:
 * - um degrau abaixo; ou
 * - o preset mais alto que já manteve a meta neste aparelho.
 *
 * Nunca troca sozinho: a recomendação aparece no menu e o jogador decide (R-ADV-01). A última
 * medição de cada preset também alimenta o aviso ao escolher Ultra/Ultra+ (R-ADV-02).
 *
 * "Neste aparelho" = neste navegador: o histórico fica no armazenamento local e nunca é enviado.
 */
import { GRAPHICS_PRESETS, PRESET_LABELS, type GraphicsPreset } from '../../lib/graphics.ts';
import type { DeviceClass } from './device.ts';
import type { SessionStats } from './kgps.ts';

/** Medição de uma partida num preset, neste aparelho. */
export interface PresetRecord {
  /** Quando foi medida (ms desde 1970). */
  at: number;
  /** Versão do visual (`GRAPHICS_REVISION`): medições de outra versão não valem. */
  revision: number;
  deviceClass: DeviceClass;
  targetFps: number;
  /** Tempo de partida efetivamente medido (min). */
  minutes: number;
  fpsMedian: number;
  p95Median: number;
  /** Fração do tempo abaixo da meta (0–1). */
  belowShare: number;
  /** Fração do tempo com níveis de emergência (0–1). */
  emergencyShare: number;
  /** A meta foi mantida nesta partida. */
  met: boolean;
  /** Última partida em que este preset manteve a meta (pode ser anterior a esta). */
  metAt?: number;
  metFps?: number;
}

/** Recomendação para a próxima partida (mostrada no menu até o jogador decidir). */
export interface Advice {
  at: number;
  from: GraphicsPreset;
  to: GraphicsPreset;
  targetFps: number;
  /** O que aconteceu na partida, com números. */
  reason: string;
  /** Por que o recomendado deve funcionar. */
  basis: string;
}

export type PresetHistory = Partial<Record<GraphicsPreset, PresetRecord>>;

export interface AdvisorStore {
  history(): PresetHistory;
  saveHistory(h: PresetHistory): void;
  advice(): Advice | null;
  saveAdvice(a: Advice | null): void;
}

export const ADVISOR = {
  /** Partidas mais curtas que isso (tempo medido) não contam. */
  minMeasuredMs: 60_000,
  /** Gatilho: mais de 60% do tempo abaixo da meta ou com níveis de emergência. */
  triggerShare: 0.6,
  /** Meta mantida: até 20% do tempo abaixo dela e até 10% com níveis de emergência. */
  metBelowShare: 0.2,
  metEmergencyShare: 0.1,
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function isPreset(p: string | undefined): p is GraphicsPreset {
  return !!p && (GRAPHICS_PRESETS as readonly string[]).includes(p);
}

/** Medição da partida (null se curta demais para valer). */
export function toRecord(s: SessionStats, meta: { revision: number; deviceClass: DeviceClass; now: number }): PresetRecord | null {
  if (s.measuredMs < ADVISOR.minMeasuredMs) return null;
  const belowShare = Math.min(1, s.belowMs / s.measuredMs);
  const emergencyShare = Math.min(1, s.emergencyMs / s.measuredMs);
  return {
    at: meta.now,
    revision: meta.revision,
    deviceClass: meta.deviceClass,
    targetFps: s.targetFps,
    minutes: Math.round((s.measuredMs / 60_000) * 10) / 10,
    fpsMedian: Math.round(s.fpsMedian * 10) / 10,
    p95Median: Math.round(s.p95Median * 10) / 10,
    belowShare: Math.round(belowShare * 1000) / 1000,
    emergencyShare: Math.round(emergencyShare * 1000) / 1000,
    met: belowShare <= ADVISOR.metBelowShare && emergencyShare <= ADVISOR.metEmergencyShare,
  };
}

/** Já manteve a meta neste aparelho (e a última partida nele não foi um fracasso). */
function keptTarget(h: PresetRecord | undefined, revision: number, targetFps: number): h is PresetRecord {
  if (!h || h.revision !== revision || h.targetFps !== targetFps) return false;
  return h.met || (h.metAt !== undefined && h.belowShare <= ADVISOR.triggerShare && h.emergencyShare <= ADVISOR.triggerShare);
}

/**
 * Recomendação depois de uma partida (R-ADV-01). Null se a partida foi bem, ou se o preset já é
 * o mais leve (aí o limite é do aparelho ou do sistema, não do preset).
 */
export function recommend(preset: GraphicsPreset, rec: PresetRecord, history: PresetHistory, revision: number): Advice | null {
  if (rec.belowShare <= ADVISOR.triggerShare && rec.emergencyShare <= ADVISOR.triggerShare) return null;
  const idx = GRAPHICS_PRESETS.indexOf(preset);
  if (idx <= 0) return null;
  let to: GraphicsPreset = GRAPHICS_PRESETS[idx - 1]!;
  let basis = `um degrau abaixo do ${PRESET_LABELS[preset]}`;
  for (let i = idx - 1; i >= 0; i--) {
    const p = GRAPHICS_PRESETS[i]!;
    const h = history[p];
    if (!keptTarget(h, revision, rec.targetFps)) continue;
    to = p;
    basis = `já manteve ${rec.targetFps} qps neste aparelho (mediana de ~${Math.round(h.metFps ?? h.fpsMedian)} qps)`;
    break;
  }
  const parts = [`abaixo de ${rec.targetFps} qps em ${pct(rec.belowShare)} do tempo (mediana de ~${Math.round(rec.fpsMedian)} qps)`];
  if (rec.emergencyShare >= 0.05) parts.push(`com ajustes de emergência em ${pct(rec.emergencyShare)} do tempo`);
  return {
    at: rec.at,
    from: preset,
    to,
    targetFps: rec.targetFps,
    reason: `Na última partida no ${PRESET_LABELS[preset]}, o jogo ficou ${parts.join(', ')}.`,
    basis,
  };
}

/**
 * Fim da partida: guarda a medição do preset e decide a recomendação. Uma partida que foi bem
 * resolve a recomendação antiga do mesmo preset.
 */
export function recordSession(store: AdvisorStore, preset: GraphicsPreset, s: SessionStats, meta: { revision: number; deviceClass: DeviceClass; now: number }): { record: PresetRecord | null; advice: Advice | null } {
  const rec = toRecord(s, meta);
  if (!rec) return { record: null, advice: null };
  const history = store.history();
  const prev = history[preset];
  if (rec.met) {
    rec.metAt = rec.at;
    rec.metFps = rec.fpsMedian;
  } else if (prev?.metAt !== undefined && prev.revision === rec.revision && prev.targetFps === rec.targetFps) {
    rec.metAt = prev.metAt;
    rec.metFps = prev.metFps;
  }
  history[preset] = rec;
  store.saveHistory(history);
  const advice = recommend(preset, rec, history, meta.revision);
  const old = store.advice();
  if (advice) store.saveAdvice(advice);
  else if (old?.from === preset) store.saveAdvice(null);
  return { record: rec, advice };
}

/** Última medição do preset neste aparelho, na versão gráfica atual (R-ADV-02). */
export function lastMeasurement(history: PresetHistory, preset: GraphicsPreset, revision: number): PresetRecord | null {
  const h = history[preset];
  return h && h.revision === revision ? h : null;
}

/** "há 2 dias", "hoje"… */
export function ago(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

/** Texto do aviso por aparelho a partir da última medição real. */
export function measurementText(preset: GraphicsPreset, rec: PresetRecord, now: number): string {
  const how = rec.met ? `manteve a meta de ${rec.targetFps} qps` : `ficou abaixo da meta de ${rec.targetFps} qps em ${pct(rec.belowShare)} do tempo`;
  const minutes = String(rec.minutes).replace('.', ',');
  return `Medição real neste aparelho (${ago(rec.at, now)}, ${minutes} min de partida): no ${PRESET_LABELS[preset]}, mediana de ~${Math.round(rec.fpsMedian)} qps; ${how}.`;
}

const HISTORY_KEY = 'nc.perf.history.v1';
const ADVICE_KEY = 'nc.perf.advice.v1';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // armazenamento indisponível: o consultor só vale nesta sessão do navegador
  }
}

/** Histórico e recomendação no armazenamento local do navegador. */
export function localAdvisorStore(): AdvisorStore {
  return {
    history: () => {
      const h = readJson<PresetHistory>(HISTORY_KEY);
      return h && typeof h === 'object' ? h : {};
    },
    saveHistory: (h) => writeJson(HISTORY_KEY, h),
    advice: () => {
      const a = readJson<Advice>(ADVICE_KEY);
      return a && isPreset(a.from) && isPreset(a.to) && typeof a.reason === 'string' ? a : null;
    },
    saveAdvice: (a) => writeJson(ADVICE_KEY, a),
  };
}

/** Armazenamento em memória (testes). */
export function memoryAdvisorStore(): AdvisorStore {
  let h: PresetHistory = {};
  let a: Advice | null = null;
  return {
    history: () => structuredClone(h),
    saveHistory: (x) => (h = structuredClone(x)),
    advice: () => a,
    saveAdvice: (x) => (a = x),
  };
}
