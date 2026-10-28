/**
 * Bancada de testes do KGPS/KAICS: botões falsos, fluxos de quadros sintéticos sob sincronia
 * vertical e montagem rápida. Usada pelos testes da v2 (Ondas 1 e 2).
 */
import { Kaics, type Capabilities, type Incompatibility, type KnobSpec } from '../game/perf/kaics.ts';
import { KGPS_CONFIG, Kgps, type ProfileStore } from '../game/perf/kgps.ts';
import { targetFor, type TargetPolicy } from '../game/perf/device.ts';

export const PC: Capabilities = { webgl2: true, maxTextureSize: 8192, gpuTimer: false, gpu: null, devicePixelRatio: 1, cores: 8, memoryGb: 8, touch: false, shortSide: 1080 };
export const PHONE: Capabilities = { ...PC, gpu: 'Adreno (TM) 610', devicePixelRatio: 2.5, cores: 8, memoryGb: 4, touch: true, shortSide: 393 };
export const MOBILE_TARGET: TargetPolicy = targetFor('mobile');

/** Botão falso: guarda o nível num objeto, como o renderizador guardaria. */
export function knob(id: string, opts: { levels: number; baseline?: number; floor?: number; emergencyFloor?: number; helps?: ('gpu' | 'cpu')[]; cost?: (from: number) => number }) {
  const state = { level: opts.baseline ?? opts.levels - 1, min: Infinity };
  const spec: KnobSpec = {
    id,
    label: id,
    levels: Array.from({ length: opts.levels }, (_, i) => `n${i}`),
    baseline: opts.baseline ?? opts.levels - 1,
    floor: opts.floor ?? 0,
    ...(opts.emergencyFloor !== undefined ? { emergencyFloor: opts.emergencyFloor } : {}),
    helps: opts.helps ?? ['gpu', 'cpu'],
    stepCost: opts.cost ?? (() => 1),
    apply: (l) => {
      state.level = l;
      state.min = Math.min(state.min, l);
    },
    read: () => state.level,
  };
  return { spec, state };
}

export function jitter(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Roda quadros: o modelo devolve o custo de CPU e GPU do quadro; a tela sincroniza (60 Hz padrão;
 * `vsync` bem pequeno = sem sincronia). Com `gpuTimer`, o tempo de GPU de cada quadro também vai
 * para o KGPS, como faria o temporizador do navegador.
 */
export function runner(k: Kgps, model: () => { cpu: number; gpu: number }, opts: { vsync?: number; gpuTimer?: boolean } = {}) {
  const rnd = jitter();
  const clock = { now: 0 };
  const vs = opts.vsync ?? 1000 / 60;
  return {
    clock,
    run(ms: number) {
      const end = clock.now + ms;
      while (clock.now < end) {
        const { cpu, gpu } = model();
        const work = Math.max(cpu, gpu) * (0.97 + rnd() * 0.06);
        const interval = Math.ceil(work / vs - 1e-6) * vs;
        clock.now += interval;
        k.sample(clock.now, interval, cpu);
        if (opts.gpuTimer) k.gpuSample(clock.now, gpu);
      }
    },
  };
}

export function setup(
  knobs: ReturnType<typeof knob>[],
  opts: { caps?: Capabilities; target?: TargetPolicy; adaptive?: boolean; store?: ProfileStore; incompatible?: readonly Incompatibility[] } = {},
) {
  const kaics = new Kaics(opts.caps ?? PC, opts.adaptive ?? true, opts.incompatible);
  for (const k of knobs) kaics.register(k.spec);
  const kgps = new Kgps(kaics, 0, opts.store ?? null, KGPS_CONFIG, opts.target);
  return { kaics, kgps };
}

export const kinds = (k: Kgps) => k.log.map((d) => d.kind);
