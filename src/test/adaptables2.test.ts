import { describe, expect, it } from 'vitest';
import { classifyBottleneck } from '../game/perf/stats.ts';
import { targetFor } from '../game/perf/device.ts';
import { buildReport } from '../game/perf/report.ts';
import { ADVISOR, lastMeasurement, measurementText, memoryAdvisorStore, recommend, recordSession, toRecord, type PresetHistory, type PresetRecord } from '../game/perf/advisor.ts';
import type { SessionStats } from '../game/perf/kgps.ts';
import { MOBILE_TARGET, PC, PHONE, kinds, knob, runner, setup } from './perfHarness.ts';

/**
 * KAICS Adaptables+ & KGPS v2 — Onda 2 (docs/KAICS_ADAPTABLES_PLUS.md): tendência sustentada
 * (T-16), tempo de GPU medido, meta escolhida pelo jogador, eventos extraordinários, resumo da
 * sessão, consultor de preset, bloqueio por evidência e relatório v2.
 */

const SEC = 1000;
const MIN = 60 * SEC;

describe('C3 · tendência sustentada (indício de aquecimento)', () => {
  it('T-16: mediana subindo 15% em 5 min com os mesmos ajustes segura as subidas por 5 min', () => {
    const k = knob('k', { levels: 4, cost: () => 1 });
    const { kgps } = setup([k], { caps: PHONE, target: MOBILE_TARGET });
    // fase 1: o aparelho esquenta — a mesma cena fica 20% mais lenta em 6 min (sem sincronia)
    let base = 20;
    const r = runner(kgps, () => ({ cpu: 2, gpu: base * (k.state.level >= 3 ? 1 : 0.6) }), { vsync: 0.01 });
    while (r.clock.now < 6 * MIN) {
      base = 20 + 4 * Math.min(1, r.clock.now / (6 * MIN));
      r.run(2 * SEC);
    }
    const hint = kgps.log.find((d) => d.text.startsWith('Possível aquecimento'));
    expect(hint).toBeDefined();
    expect(hint!.evidence).toBe('hipotese');
    expect(hint!.at).toBeGreaterThanOrEqual(300);
    expect(kinds(kgps)).not.toContain('degrade');
    const t0 = hint!.at * SEC;
    // fase 2: pesa de vez — o KGPS reduz (reduzir continua permitido)
    base = 45;
    r.run(20 * SEC);
    expect(k.state.level).toBeLessThan(3);
    // fase 3: folga — sem o indício subiria em segundos; com ele, espera o fim dos 5 min
    base = 20;
    r.run(t0 + 290 * SEC - r.clock.now);
    expect(kgps.summary(r.clock.now).thermalHoldS).not.toBeNull();
    expect(kinds(kgps)).not.toContain('upgrade');
    r.run(60 * SEC);
    expect(kinds(kgps)).toContain('upgrade');
    expect(k.state.level).toBe(3);
  });

  it('cena estável com os mesmos ajustes não dá indício', () => {
    const k = knob('k', { levels: 4 });
    const { kgps } = setup([k], { caps: PHONE, target: MOBILE_TARGET });
    runner(kgps, () => ({ cpu: 2, gpu: 22 }), { vsync: 0.01 }).run(8 * MIN);
    expect(kgps.log.some((d) => d.text.startsWith('Possível aquecimento'))).toBe(false);
  });
});

describe('C2 · tempo de GPU medido (R-DEV-03)', () => {
  const base = { samples: 60, p50: 33.3, cpuP50: 5 };
  it('com tempo de GPU, o gargalo é medido — inclusive "nenhum dos dois" (espera pela tela)', () => {
    expect(classifyBottleneck({ ...base, gpuP50: 30 }, 20, 16.7)).toMatchObject({ kind: 'gpu', source: 'gpu-timer' });
    expect(classifyBottleneck({ ...base, cpuP50: 20, gpuP50: 8 }, 20, 16.7)).toMatchObject({ kind: 'cpu', source: 'gpu-timer' });
    // a estimativa pela fração de CPU diria GPU; medido, ninguém está no limite
    expect(classifyBottleneck({ ...base, gpuP50: 6 }, 20, 16.7)).toMatchObject({ kind: 'unknown', source: 'gpu-timer' });
    expect(classifyBottleneck(base, 20, 16.7)).toMatchObject({ kind: 'gpu', source: 'cpu-share' });
    // leitura impossível (GPU muito acima do intervalo entre quadros, como no SwiftShader): estimativa
    expect(classifyBottleneck({ ...base, gpuP50: 280 }, 20, 16.7)).toMatchObject({ source: 'cpu-share' });
  });

  it('decisões com GPU medida saem como "medido"; sem ela, o gargalo é "estimado"', () => {
    for (const gpuTimer of [true, false]) {
      const k = knob('k', { levels: 4, helps: ['gpu'] });
      const { kgps } = setup([k]);
      runner(kgps, () => ({ cpu: 3, gpu: 24 }), { gpuTimer }).run(12 * SEC);
      const d = kgps.log.find((x) => x.kind === 'degrade');
      expect(d).toBeDefined();
      expect(d!.evidence).toBe(gpuTimer ? 'medido' : 'estimado');
      expect(d!.text.includes('GPU medida')).toBe(gpuTimer);
    }
  });
});

describe('C3 · meta escolhida pelo jogador (R-TGT-01)', () => {
  it('trocar a meta para 60 no meio da partida muda o orçamento na hora', () => {
    const k = knob('k', { levels: 4 });
    const { kgps } = setup([k], { caps: PHONE, target: MOBILE_TARGET });
    const r = runner(kgps, () => ({ cpu: 3, gpu: 25 }));
    r.run(20 * SEC);
    // 40 qps com meta 30: nada a fazer
    expect(kinds(kgps)).not.toContain('degrade');
    kgps.setTarget(targetFor('mobile', null, 60), r.clock.now);
    expect(kgps.budget).toBeCloseTo(1000 / 60, 3);
    expect(kgps.target.origin).toBe('jogador');
    expect(kgps.log.some((d) => d.kind === 'mode' && d.text === 'Meta: 30 → 60 qps (escolha do jogador)')).toBe(true);
    r.run(15 * SEC);
    expect(kinds(kgps)).toContain('degrade');
  });
});

describe('C8 · eventos extraordinários (R-EVD-05)', () => {
  it('cada tipo de evento entra no máximo uma vez a cada 20 s; congelamentos viram evento', () => {
    const { kgps } = setup([knob('k', { levels: 3 })]);
    kgps.event(10 * SEC, 'hidden', 'Jogo em segundo plano');
    kgps.event(12 * SEC, 'hidden', 'Jogo em segundo plano');
    kgps.event(12 * SEC, 'visible', 'Jogo de volta');
    kgps.event(31 * SEC, 'hidden', 'Jogo em segundo plano');
    expect(kgps.log.filter((d) => d.kind === 'event').map((d) => d.text)).toEqual(['Jogo em segundo plano', 'Jogo de volta', 'Jogo em segundo plano']);
    // congelamento de 1,5 s no meio da medição
    kgps.sample(40 * SEC, 1500, 2);
    expect(kgps.log.at(-1)).toMatchObject({ kind: 'event', evidence: 'medido' });
    expect(kgps.log.at(-1)!.text).toContain('Congelamento de 1,5 s');
  });
});

describe('C6 · resumo da sessão e consultor de preset (R-ADV-01/02)', () => {
  const stats = (o: Partial<SessionStats>): SessionStats => ({
    measuredMs: 10 * MIN,
    belowMs: 0,
    emergencyMs: 0,
    fpsMedian: 30,
    p95Median: 36,
    hitches: 0,
    stalls: 0,
    targetFps: 30,
    adaptive: true,
    fidelityMin: 1,
    ...o,
  });
  const meta = { revision: 2, deviceClass: 'mobile' as const, now: Date.UTC(2026, 9, 28) };

  it('o KGPS conta o tempo abaixo da meta e os qps típicos da partida', () => {
    const { kgps } = setup([knob('k', { levels: 3 })], { caps: PHONE, target: MOBILE_TARGET, adaptive: false });
    runner(kgps, () => ({ cpu: 4, gpu: 48 })).run(2 * MIN);
    const s = kgps.session();
    expect(s.measuredMs).toBeGreaterThan(100 * SEC);
    expect(s.belowMs / s.measuredMs).toBeGreaterThan(0.95);
    expect(s.fpsMedian).toBeCloseTo(20, 0);
    expect(s.targetFps).toBe(30);
    expect(s.adaptive).toBe(false);
  });

  it('partida curta não vale; partida ruim recomenda um degrau abaixo, com motivo e números', () => {
    expect(toRecord(stats({ measuredMs: 30 * SEC }), meta)).toBeNull();
    const rec = toRecord(stats({ belowMs: 8 * MIN, emergencyMs: 6 * MIN, fpsMedian: 7.4 }), meta)!;
    expect(rec.met).toBe(false);
    const advice = recommend('ultraplus', rec, {}, 2)!;
    expect(advice.to).toBe('ultra');
    expect(advice.reason).toContain('80% do tempo');
    expect(advice.reason).toContain('~7 qps');
    expect(advice.reason).toContain('emergência em 60%');
    // partida boa: nada a recomendar; preset mais leve: nada abaixo dele
    expect(recommend('ultraplus', toRecord(stats({ belowMs: MIN }), meta)!, {}, 2)).toBeNull();
    expect(recommend('low', rec, {}, 2)).toBeNull();
  });

  it('prefere o preset mais alto que já manteve a meta neste aparelho (mesma versão gráfica)', () => {
    const ok: PresetRecord = { ...toRecord(stats({ fpsMedian: 31 }), meta)!, metAt: meta.now, metFps: 31 };
    const bad = toRecord(stats({ belowMs: 9 * MIN, fpsMedian: 12 }), meta)!;
    const history: PresetHistory = { balanced: ok, high: ok, ultra: bad };
    const advice = recommend('ultraplus', bad, history, 2)!;
    expect(advice.to).toBe('high');
    expect(advice.basis).toContain('já manteve 30 qps');
    // medição de outra versão do visual não vale
    expect(recommend('ultraplus', bad, { high: { ...ok, revision: 1 } }, 2)!.to).toBe('ultra');
  });

  it('a partida seguinte boa no mesmo preset resolve a recomendação antiga; o aviso usa a última medição', () => {
    const store = memoryAdvisorStore();
    recordSession(store, 'ultraplus', stats({ belowMs: 9 * MIN, fpsMedian: 7 }), meta);
    expect(store.advice()?.from).toBe('ultraplus');
    const h = store.history();
    const last = lastMeasurement(h, 'ultraplus', 2)!;
    expect(measurementText('ultraplus', last, meta.now + 2 * 86_400_000)).toContain('há 2 dias');
    expect(measurementText('ultraplus', last, meta.now)).toContain('~7 qps');
    expect(lastMeasurement(h, 'ultraplus', 3)).toBeNull();
    recordSession(store, 'ultraplus', stats({ belowMs: 0, fpsMedian: 31 }), meta);
    expect(store.advice()).toBeNull();
    expect(store.history().ultraplus!.met).toBe(true);
  });

  it('limiares do consultor são os da especificação', () => {
    expect(ADVISOR).toMatchObject({ minMeasuredMs: 60_000, triggerShare: 0.6 });
  });
});

describe('C7 · bloqueio por evidência (R-SHD-03)', () => {
  const rule = { knob: 'k', gpu: /Mali-G52/i, level: 0, reason: 'faixas pretas na água (relatório #12)', since: '2026-10-28' };

  it('numa GPU listada, o botão fica fixo no nível seguro, fora do controle automático', () => {
    const k = knob('k', { levels: 3 });
    const other = knob('o', { levels: 3 });
    const { kaics, kgps } = setup([k, other], { caps: { ...PHONE, gpu: 'Mali-G52 MC2' }, target: MOBILE_TARGET, incompatible: [rule] });
    expect(kaics.knobs.get('k')!.status).toBe('blocked');
    expect(k.state.level).toBe(0);
    expect(kaics.incidents.join(' ')).toContain('bloqueado nesta GPU por evidência');
    expect(kaics.set('k', 2).ok).toBe(false);
    // desligar a adaptação devolve os outros ao preset, mas o bloqueio fica
    kgps.setAdaptive(false, 10 * SEC);
    expect(k.state.level).toBe(0);
    expect(kaics.knobs.get('o')!.status).toBe('ok');
  });

  it('em outra GPU, nada muda (nunca por suposição)', () => {
    const k = knob('k', { levels: 3 });
    const { kaics } = setup([k], { caps: { ...PC, gpu: 'NVIDIA GeForce RTX 3060' }, incompatible: [rule] });
    expect(kaics.knobs.get('k')!.status).toBe('ok');
    expect(k.state.level).toBe(2);
  });
});

describe('C8 · relatório v2', () => {
  it('traz tempo de GPU por janela, resumo da sessão, pré-aquecimento e primeiro minuto', () => {
    const { kaics, kgps } = setup([knob('k', { levels: 3, helps: ['gpu'] })]);
    runner(kgps, () => ({ cpu: 3, gpu: 12 }), { gpuTimer: true }).run(30 * SEC);
    const rep = JSON.parse(
      buildReport({
        revision: 2,
        preset: 'high',
        scene: 'teatro',
        summary: kgps.summary(30 * SEC),
        caps: kaics.capabilities,
        windows: kgps.recentWindows(),
        decisions: kgps.log,
        render: { drawCalls: 100, triangles: 1000, geometries: 10, textures: 5 },
        session: kgps.session(),
        prewarm: { enabled: true, materials: 42, ms: 380 },
        firstMinute: { hitches: 2, stalls: 0, done: true },
      }),
    ) as Record<string, unknown> & { windows: { gpuP50: number | null }[]; session: { minutes: number }; bottleneck: { source: string } };
    expect(rep.schema).toBe('nc.perf.report.v2');
    expect(rep.windows.at(-1)!.gpuP50).toBeCloseTo(12, 0);
    expect(rep.bottleneck.source).toBe('gpu-timer');
    expect(rep.session.minutes).toBeGreaterThan(0.3);
    expect(rep.prewarm).toEqual({ enabled: true, materials: 42, ms: 380 });
    expect(rep.firstMinute).toEqual({ hitches: 2, stalls: 0, done: true });
  });
});
