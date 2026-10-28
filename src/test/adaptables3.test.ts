import { describe, expect, it } from 'vitest';
import { KGPS_CONFIG, Kgps, type GainStore, type KnobGain } from '../game/perf/kgps.ts';
import { Kaics } from '../game/perf/kaics.ts';
import { MemoryWatch, type MemorySample } from '../game/perf/memory.ts';
import { buildReport } from '../game/perf/report.ts';
import { MOBILE_TARGET, PC, PHONE, kinds, knob, runner, setup } from './perfHarness.ts';

/**
 * KAICS Adaptables+ — etapa 3: fases do teste de campo, ganho medido por ajuste (R-ADP-04) e a
 * descida rápida pelo custo por ganho esperado, carga da cena no indício de aquecimento, vigia de
 * memória (Onda 3, R-DEV-05) e o relatório com tudo isso.
 */

const SEC = 1000;
const MIN = 60 * SEC;

function memoryGainStore(initial: Record<string, KnobGain> = {}): GainStore & { saved: Record<string, KnobGain> | null } {
  const box = { saved: null as Record<string, KnobGain> | null };
  return Object.assign(box, {
    load: () => initial,
    save: (g: Record<string, KnobGain>) => {
      box.saved = g;
    },
  });
}

describe('fases nomeadas (teste de campo)', () => {
  it('cada fase resume só as janelas medidas nela', () => {
    const k = knob('k', { levels: 4 });
    const { kgps } = setup([k], { caps: PHONE, target: MOBILE_TARGET, adaptive: false });
    let gpu = 20;
    const r = runner(kgps, () => ({ cpu: 2, gpu }), { vsync: 0.01 });
    r.run(10 * SEC);
    kgps.beginPhase('parado', r.clock.now);
    r.run(60 * SEC);
    gpu = 50;
    kgps.beginPhase('combate', r.clock.now);
    r.run(60 * SEC);
    kgps.endPhase(r.clock.now);
    const [idle, combat] = kgps.phases(r.clock.now);
    expect(idle!.name).toBe('parado');
    expect(idle!.fpsMedian).toBeCloseTo(50, -1);
    expect(idle!.belowShare).toBe(0);
    expect(combat!.fpsMedian).toBeCloseTo(20, -1);
    expect(combat!.belowShare).toBeGreaterThan(0.9);
    expect(combat!.running).toBe(false);
    expect(kgps.log.filter((d) => d.kind === 'event').map((d) => d.text)).toEqual(['Fase "parado" começou', 'Fase "parado" terminou', 'Fase "combate" começou', 'Fase "combate" terminou']);
  });
});

describe('ganho medido por ajuste (R-ADP-04)', () => {
  it('um passo confirmado registra o ganho, que fica salvo para a próxima partida', () => {
    const k = knob('k', { levels: 4, helps: ['gpu'] });
    const kaics = new Kaics(PC, true);
    kaics.register(k.spec);
    const store = memoryGainStore();
    const kgps = new Kgps(kaics, 0, null, KGPS_CONFIG, undefined, store);
    runner(kgps, () => ({ cpu: 3, gpu: k.state.level >= 3 ? 26 : 14 })).run(20 * SEC);
    expect(kinds(kgps)).toContain('keep');
    const g = kgps.knobGains().find((x) => x.id === 'k')!;
    expect(g.kept).toBe(1);
    expect(g.sessionPct).toBeGreaterThan(0.3);
    expect(store.saved?.k?.n).toBe(1);
    expect(store.saved!.k!.pct).toBeGreaterThan(0.3);
  });

  it('na descida rápida, o ganho aprendido neste aparelho decide a ordem (custo por ganho)', () => {
    const order = (learned: Record<string, KnobGain>) => {
      const a = knob('cheap', { levels: 3, floor: 1, emergencyFloor: 0, cost: () => 1 });
      const b = knob('strong', { levels: 3, floor: 1, emergencyFloor: 0, cost: () => 2 });
      const applied: string[] = [];
      for (const k of [a, b]) {
        const apply = k.spec.apply;
        k.spec.apply = (l) => {
          if (l < k.state.level) applied.push(k.spec.id);
          apply(l);
        };
      }
      const kaics = new Kaics(PHONE, true);
      kaics.register(a.spec);
      kaics.register(b.spec);
      const kgps = new Kgps(kaics, 0, null, KGPS_CONFIG, MOBILE_TARGET, memoryGainStore(learned));
      // ~7 qps: descida rápida; a ordem dos passos mostra a preferência
      runner(kgps, () => ({ cpu: 4, gpu: 140 })).run(14 * SEC);
      expect(kinds(kgps)).toContain('emergency');
      return applied;
    };
    // sem histórico: o mais barato visualmente vai primeiro
    expect(order({})[0]).toBe('cheap');
    // o barato quase não ajuda neste aparelho (1%) e o forte ajuda muito (40%): o forte vai antes
    expect(order({ cheap: { n: 6, pct: 0.01 }, strong: { n: 6, pct: 0.4 } })[0]).toBe('strong');
  });

  it('no ajuste normal o menor custo visual continua mandando; o ganho só desempata', () => {
    const a = knob('a', { levels: 3, cost: () => 1, helps: ['gpu'] });
    const b = knob('b', { levels: 3, cost: () => 2, helps: ['gpu'] });
    const kaics = new Kaics(PC, true);
    kaics.register(a.spec);
    kaics.register(b.spec);
    const kgps = new Kgps(kaics, 0, null, KGPS_CONFIG, undefined, memoryGainStore({ a: { n: 6, pct: 0.01 }, b: { n: 6, pct: 0.4 } }));
    runner(kgps, () => ({ cpu: 3, gpu: 24 })).run(12 * SEC);
    // só o mais barato visualmente foi usado (o forte, apesar do ganho, nunca foi tocado)
    expect(a.state.min).toBeLessThan(2);
    expect(b.state.min).toBe(Infinity);
  });
});

describe('indício de aquecimento × cena mais pesada', () => {
  function rising(withLoad: boolean) {
    const k = knob('k', { levels: 4 });
    const { kgps } = setup([k], { caps: PHONE, target: MOBILE_TARGET });
    const clock = { now: 0 };
    let i = 0;
    while (clock.now < 7 * MIN) {
      const f = Math.min(1, clock.now / (6 * MIN));
      const interval = (20 + 4 * f) * (0.98 + ((i++ * 7919) % 100) / 2500);
      clock.now += interval;
      // com carga: as chamadas de desenho sobem junto (batalha começando); sem: constantes
      kgps.sample(clock.now, interval, 2, withLoad ? 200 + 120 * f : 200);
    }
    return kgps.log.some((d) => d.text.startsWith('Possível aquecimento'));
  }

  it('mesma carga e mediana subindo: indício', () => {
    expect(rising(false)).toBe(true);
  });

  it('mediana subindo com mais desenhos por quadro: é a cena, não o aparelho', () => {
    expect(rising(true)).toBe(false);
  });
});

describe('vigia de memória (Onda 3, R-DEV-05)', () => {
  const series = (n: number, f: (i: number) => Partial<MemorySample>) =>
    Array.from({ length: n }, (_, i): MemorySample => ({ t: i * 15 * SEC, geometries: 300, textures: 50, programs: 70, heapMb: null, entities: 100, ...f(i) }));
  const run = (w: MemoryWatch, samples: MemorySample[]) => samples.map((s) => w.add(s)).filter((x): x is string => x !== null);

  it('geometrias subindo sem parar por 10 min, sem mais tropas e prédios: incidente (uma vez)', () => {
    const alerts = run(new MemoryWatch(), series(60, (i) => ({ geometries: 300 + i * 6 })));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('geometrias');
    expect(alerts[0]).toContain('Possível vazamento');
  });

  it('memória que cresce junto com a partida (mais tropas e prédios) não é vazamento', () => {
    expect(run(new MemoryWatch(), series(60, (i) => ({ geometries: 300 + i * 6, entities: 100 + i * 2 })))).toHaveLength(0);
  });

  it('sobe e desce (unidades morrendo e nascendo): nada', () => {
    expect(run(new MemoryWatch(), series(60, (i) => ({ geometries: 300 + (i % 4) * 40 })))).toHaveLength(0);
  });

  it('memória do JavaScript subindo sem parar também vira incidente; troca de cena recomeça', () => {
    const w = new MemoryWatch();
    const half = series(30, (i) => ({ heapMb: 150 + i * 4 }));
    run(w, half);
    w.reset();
    const after = series(60, (i) => ({ t: (30 + i) * 15 * SEC, heapMb: 270 + i * 4 }));
    const alerts = run(w, after);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('JavaScript');
  });

  it('o KGPS registra o incidente como hipótese, sem mexer em nada', () => {
    const k = knob('k', { levels: 3 });
    const { kaics, kgps } = setup([k]);
    kgps.incident(5 * SEC, 'Memória de vídeo subindo sem parar: teste');
    expect(kgps.log.at(-1)).toMatchObject({ kind: 'incident', evidence: 'hipotese' });
    expect(kaics.incidents.at(-1)).toContain('Memória de vídeo');
    expect(k.state.level).toBe(2);
  });
});

describe('relatório com teste de campo, ganhos e memória', () => {
  it('traz as fases, o ganho de cada ajuste e a última amostra de memória', () => {
    const k = knob('k', { levels: 4, helps: ['gpu'] });
    const { kaics, kgps } = setup([k]);
    const r = runner(kgps, () => ({ cpu: 3, gpu: k.state.level >= 3 ? 26 : 14 }));
    kgps.beginPhase('parado', 0);
    r.run(30 * SEC);
    kgps.endPhase(r.clock.now);
    const rep = JSON.parse(
      buildReport({
        revision: 2,
        preset: 'high',
        scene: 'teatro',
        summary: kgps.summary(r.clock.now),
        caps: kaics.capabilities,
        windows: kgps.recentWindows(),
        decisions: kgps.log,
        render: { drawCalls: 100, triangles: 1000, geometries: 10, textures: 5 },
        knobGains: kgps.knobGains(),
        memory: { t: 1, geometries: 310, textures: 54, programs: 73, heapMb: 180, entities: 40 },
        fieldTest: { status: 'concluído', batterySaver: true, troops: 20, phases: kgps.phases(r.clock.now) },
      }),
    ) as { knobGains: { id: string; kept: number }[]; memory: { programs: number }; fieldTest: { batterySaver: boolean; phases: { name: string }[] } };
    expect(rep.knobGains[0]).toMatchObject({ id: 'k', kept: 1 });
    expect(rep.memory.programs).toBe(73);
    expect(rep.fieldTest.batterySaver).toBe(true);
    expect(rep.fieldTest.phases[0]!.name).toBe('parado');
  });
});
