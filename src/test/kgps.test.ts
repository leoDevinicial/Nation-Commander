import { describe, expect, it } from 'vitest';
import { Kaics, type Capabilities, type KnobSpec } from '../game/perf/kaics.ts';
import { KGPS_CONFIG, Kgps, type ProfileStore } from '../game/perf/kgps.ts';
import { FrameWindow, classifyBottleneck, percentile } from '../game/perf/stats.ts';

const CAPS: Capabilities = { webgl2: true, maxTextureSize: 8192, gpuTimer: false, gpu: null, devicePixelRatio: 1, cores: 8, memoryGb: 8, touch: false };

/** Botão falso: guarda o nível num objeto, como o renderizador guardaria. */
function knob(id: string, opts: { levels: number; baseline?: number; floor?: number; helps?: ('gpu' | 'cpu')[]; cost?: (from: number) => number }) {
  const state = { level: opts.baseline ?? opts.levels - 1 };
  const spec: KnobSpec = {
    id,
    label: id,
    levels: Array.from({ length: opts.levels }, (_, i) => `n${i}`),
    baseline: opts.baseline ?? opts.levels - 1,
    floor: opts.floor ?? 0,
    helps: opts.helps ?? ['gpu', 'cpu'],
    stepCost: opts.cost ?? (() => 1),
    apply: (l) => (state.level = l),
    read: () => state.level,
  };
  return { spec, state };
}

/** Pseudoaleatório estável para o tremor natural dos quadros. */
function jitter(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Roda quadros: o modelo devolve o custo de CPU e GPU do quadro; a tela sincroniza a 60 Hz. */
function runner(k: Kgps, model: () => { cpu: number; gpu: number }, opts: { vsync?: number } = {}) {
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
        // com sincronia vertical, o quadro espera o próximo ciclo da tela
        const interval = Math.ceil(work / vs - 1e-6) * vs;
        clock.now += interval;
        k.sample(clock.now, interval, cpu);
      }
    },
  };
}

function setup(knobs: ReturnType<typeof knob>[], opts: { adaptive?: boolean; store?: ProfileStore } = {}) {
  const kaics = new Kaics(CAPS, opts.adaptive ?? true);
  for (const k of knobs) kaics.register(k.spec);
  const kgps = new Kgps(kaics, 0, opts.store ?? null);
  return { kaics, kgps };
}

describe('telemetria de quadros', () => {
  it('percentis por interpolação e travadas contadas à parte', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([5], 0.95)).toBe(5);
    const w = new FrameWindow();
    for (let i = 0; i < 99; i++) w.add(i * 16, 16, 4);
    w.add(2000, 120, 4);
    const s = w.stats(2000)!;
    expect(s.samples).toBe(100);
    expect(s.p50).toBe(16);
    expect(s.hitches).toBe(1);
    expect(s.p99).toBeGreaterThan(16);
  });

  it('congelamentos (> 1 s) são contados, mas não entram nos percentis', () => {
    const w = new FrameWindow();
    for (let i = 0; i < 10; i++) w.add(i * 16, 16, 4);
    w.add(51_000, 51_000, 4);
    const s = w.stats(51_100)!;
    expect(s.samples).toBe(10);
    expect(s.p95).toBe(16);
    expect(s.stalls).toBe(1);
  });

  it('gargalo provável pela fração do quadro gasta no JavaScript', () => {
    const base = { samples: 60, spanMs: 2000, fps: 40, p95: 30, p99: 32, cpuP95: 5, hitches: 0, stalls: 0 };
    expect(classifyBottleneck({ ...base, p50: 25, cpuP50: 4 }, 20).kind).toBe('gpu');
    expect(classifyBottleneck({ ...base, p50: 25, cpuP50: 22 }, 20).kind).toBe('cpu');
    expect(classifyBottleneck({ ...base, p50: 25, cpuP50: 14 }, 20).kind).toBe('unknown');
    expect(classifyBottleneck({ ...base, samples: 5, p50: 25, cpuP50: 4 }, 20).kind).toBe('unknown');
  });
});

describe('KAICS: contratos dos botões', () => {
  it('põe em quarentena um botão cujo estado lido não bate com o declarado', () => {
    const k = knob('res', { levels: 4 });
    k.state.level = 1;
    const kaics = new Kaics(CAPS, true);
    expect(kaics.register(k.spec)).toBe(false);
    expect(kaics.knobs.get('res')!.status).toBe('quarantined');
    expect(kaics.set('res', 2).ok).toBe(false);
    expect(kaics.incidents[0]).toMatch(/quarentena/);
  });

  it('ignora botões sem margem (piso igual ao nível base)', () => {
    const kaics = new Kaics(CAPS, true);
    expect(kaics.register(knob('x', { levels: 3, baseline: 0, floor: 0 }).spec)).toBe(false);
    expect(kaics.knobs.size).toBe(0);
  });

  it('confere cada mudança lendo de volta e restaura se o renderizador não obedeceu', () => {
    const k = knob('sombra', { levels: 3 });
    const kaics = new Kaics(CAPS, true);
    kaics.register(k.spec);
    // o renderizador "engole" o pedido de nível 1
    const apply = k.spec.apply;
    (k.spec as { apply: (l: number) => void }).apply = (l) => (l === 1 ? undefined : apply(l));
    expect(kaics.set('sombra', 1)).toEqual({ ok: false, reason: 'mudança não confirmada (restaurado)' });
    expect(k.state.level).toBe(2);
    expect(kaics.knobs.get('sombra')!.status).toBe('ok');
    // aplicar quebra o estado e a restauração também falha: botão sai do controle
    (k.spec as { apply: (l: number) => void }).apply = () => (k.state.level = 99);
    expect(kaics.set('sombra', 1).ok).toBe(false);
    expect(kaics.knobs.get('sombra')!.status).toBe('faulted');
  });

  it('respeita limites e bloqueia mudanças em momentos inseguros', () => {
    const k = knob('res', { levels: 4, floor: 1 });
    const kaics = new Kaics(CAPS, true);
    kaics.register(k.spec);
    expect(kaics.set('res', 0).ok).toBe(false);
    kaics.setCondition('suspended', true);
    expect(kaics.set('res', 2)).toEqual({ ok: false, reason: 'cena oculta (globo ou outra cena aberta)' });
    kaics.setCondition('suspended', false);
    expect(kaics.set('res', 2).ok).toBe(true);
    kaics.setCondition('contextLost', true);
    expect(kaics.verdict().mode).toBe('blocked');
  });

  it('kill switch devolve a qualidade escolhida pelo jogador', () => {
    const a = knob('a', { levels: 4 });
    const b = knob('b', { levels: 3 });
    const kaics = new Kaics(CAPS, true);
    kaics.register(a.spec);
    kaics.register(b.spec);
    kaics.set('a', 1);
    kaics.set('b', 0);
    kaics.disable();
    expect([a.state.level, b.state.level]).toEqual([3, 2]);
    expect(kaics.verdict().mode).toBe('observe');
    expect(kaics.set('a', 2).ok).toBe(false);
  });
});

describe('KGPS: decisões com evidência', () => {
  it('limitado pela GPU: reduz o mais barato primeiro até voltar aos 60 qps, sem passar do piso', () => {
    const res = knob('res', { levels: 4, floor: 1, helps: ['gpu'], cost: (l) => [9, 4, 3, 2][l]! });
    const ao = knob('ao', { levels: 2, helps: ['gpu', 'cpu'], cost: () => 4 });
    const { kgps } = setup([res, ao]);
    const r = runner(kgps, () => ({ cpu: 4, gpu: 8 + res.state.level * 4 + ao.state.level * 6 }));
    r.run(60_000);
    expect(res.state.level).toBeGreaterThanOrEqual(1);
    expect(8 + res.state.level * 4 + ao.state.level * 6).toBeLessThanOrEqual(1000 / 60);
    expect(kgps.log.filter((d) => d.kind === 'keep').length).toBeGreaterThanOrEqual(2);
    expect(kgps.log[0]!.at).toBeGreaterThanOrEqual(KGPS_CONFIG.warmupMs / 1000);
    expect(kgps.last!.p95).toBeLessThan(1000 / 60 + 1);
  });

  it('limitado pela CPU: não sacrifica a resolução (que só alivia a GPU)', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'], cost: () => 1 });
    const refl = knob('reflexos', { levels: 3, helps: ['gpu', 'cpu'], cost: () => 2 });
    const { kgps } = setup([res, refl]);
    const r = runner(kgps, () => ({ cpu: 12 + refl.state.level * 6, gpu: 6 + res.state.level }));
    r.run(60_000);
    expect(res.state.level).toBe(3);
    expect(refl.state.level).toBeLessThan(2);
  });

  it('desfaz reduções que não ajudam e reconhece o limite externo (30 Hz travados)', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const sh = knob('sombra', { levels: 3, helps: ['gpu'] });
    const ao = knob('ao', { levels: 2, helps: ['gpu'] });
    const { kgps } = setup([res, sh, ao]);
    // a tela entrega no máximo 30 qps (economia de bateria), por mais leve que o quadro seja
    const r = runner(kgps, () => ({ cpu: 3, gpu: 5 }), { vsync: 1000 / 30 });
    r.run(60_000);
    expect([res.state.level, sh.state.level, ao.state.level]).toEqual([3, 2, 1]);
    // v2: uma cadeia sem efeito com quadros presos em 30 qps já basta (antes: duas e uma pausa)
    expect(kgps.log.filter((d) => d.kind === 'revert').length).toBe(1);
    expect(kgps.state(r.clock.now)).toBe('externalCap');
    const hold = kgps.log.find((d) => d.kind === 'hold')!;
    expect(hold.text).toMatch(/limite do navegador ou do sistema provável \(ex\.: economia de bateria\)/);
    expect(hold.evidence).toBe('hipotese');
  });

  it('recupera a qualidade quando a cena alivia', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res]);
    let heavy = true;
    const r = runner(kgps, () => ({ cpu: 3, gpu: (heavy ? 14 : 4) + res.state.level * 3 }));
    r.run(40_000);
    expect(res.state.level).toBeLessThan(3);
    heavy = false;
    r.run(120_000);
    expect(res.state.level).toBe(3);
    expect(kgps.log.some((d) => /Qualidade recuperada/.test(d.text))).toBe(true);
  });

  it('não fica oscilando: tentativas de subir que pesam são desfeitas com espera crescente', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res]);
    // nível 3 pesa 21 ms; nível 2 cabe em 15 ms
    const r = runner(kgps, () => ({ cpu: 3, gpu: [9, 12, 15, 21][res.state.level]! }));
    r.run(300_000);
    expect(res.state.level).toBe(2);
    const tries = kgps.log.filter((d) => d.kind === 'upgrade').length;
    // 30 s, 60 s, 120 s, 240 s de espera: no máximo ~5 tentativas em 5 minutos
    expect(tries).toBeGreaterThan(0);
    expect(tries).toBeLessThanOrEqual(5);
  });

  it('ignora o aquecimento do início (compilação de shaders)', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res]);
    let t = 0;
    const r = runner(kgps, () => ({ cpu: 3, gpu: t++ < 60 ? 80 : 10 }));
    r.run(KGPS_CONFIG.warmupMs);
    r.run(30_000);
    expect(res.state.level).toBe(3);
    expect(kgps.log.length).toBe(0);
  });

  it('modo observação: só sugere, nunca muda nada', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res], { adaptive: false });
    const r = runner(kgps, () => ({ cpu: 3, gpu: 30 }));
    r.run(60_000);
    expect(res.state.level).toBe(3);
    const s = kgps.summary(r.clock.now);
    expect(s.mode).toBe('observe');
    expect(kgps.log.some((d) => d.kind === 'suggest' && /Modo observação — faria res/.test(d.text))).toBe(true);
  });

  it('desligar no meio da partida devolve a qualidade original', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res]);
    const r = runner(kgps, () => ({ cpu: 3, gpu: 8 + res.state.level * 4 }));
    r.run(40_000);
    expect(res.state.level).toBeLessThan(3);
    kgps.setAdaptive(false, r.clock.now);
    expect(res.state.level).toBe(3);
    expect(kgps.summary(r.clock.now).mode).toBe('observe');
  });

  it('interrupção durante a avaliação (redimensionar, abrir o globo) deixa o resultado inconclusivo', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res]);
    const r = runner(kgps, () => ({ cpu: 3, gpu: 8 + res.state.level * 4 }));
    while (kgps.state(r.clock.now) !== 'evaluating' && r.clock.now < 60_000) r.run(16);
    expect(kgps.state(r.clock.now)).toBe('evaluating');
    kgps.invalidate(r.clock.now, 'janela redimensionada');
    expect(kgps.log.at(-1)!.kind).toBe('inconclusive');
    expect(res.state.level).toBe(2);
  });

  it('perfil aprendido: guarda o ajuste confirmado e começa dele na próxima partida', () => {
    let saved: Record<string, number> | null = null;
    const store: ProfileStore = { load: () => saved, save: (l) => (saved = l) };
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const first = setup([res], { store }).kgps;
    runner(first, () => ({ cpu: 3, gpu: 8 + res.state.level * 4 })).run(60_000);
    expect(saved).not.toBeNull();
    expect(saved!.res).toBe(res.state.level);
    const next = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([next], { store });
    expect(next.state.level).toBe(saved!.res);
    expect(kgps.log[0]!.kind).toBe('profile');
  });

  it('custa pouco: microssegundos por quadro', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res]);
    runner(kgps, () => ({ cpu: 3, gpu: 10 })).run(120_000);
    expect(kgps.overheadUs).toBeLessThan(100);
  });
});
