import { afterEach, describe, expect, it } from 'vitest';
import { Kaics, type Capabilities, type KnobSpec } from '../game/perf/kaics.ts';
import { KGPS_CONFIG, Kgps, localProfileStore, type ProfileStore } from '../game/perf/kgps.ts';
import { classifyDevice, profileKey, targetFor, type TargetPolicy } from '../game/perf/device.ts';
import { estimateRefreshHz } from '../game/perf/stats.ts';
import { REPORT_MAX_BYTES, buildReport } from '../game/perf/report.ts';
import { decorKept } from '../game/render/decorThinning.ts';

/**
 * KAICS Adaptables+ & KGPS v2 (docs/KAICS_ADAPTABLES_PLUS.md, seção 32): metas por classe de
 * aparelho, descida rápida, limite externo explícito, níveis de emergência, auditoria, relatório.
 * Os testes do v1 continuam em kgps.test.ts (T-18).
 */

const PC: Capabilities = { webgl2: true, maxTextureSize: 8192, gpuTimer: false, gpu: null, devicePixelRatio: 1, cores: 8, memoryGb: 8, touch: false, shortSide: 1080 };
const PHONE: Capabilities = { ...PC, gpu: 'Adreno (TM) 610', devicePixelRatio: 2.5, cores: 8, memoryGb: 4, touch: true, shortSide: 393 };
const MOBILE_TARGET: TargetPolicy = targetFor('mobile');

/** Botão falso: guarda o nível num objeto, como o renderizador guardaria. */
function knob(id: string, opts: { levels: number; baseline?: number; floor?: number; emergencyFloor?: number; helps?: ('gpu' | 'cpu')[]; cost?: (from: number) => number }) {
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

function jitter(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Roda quadros: o modelo devolve o custo de CPU e GPU do quadro; a tela sincroniza (60 Hz padrão). */
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
        const interval = Math.ceil(work / vs - 1e-6) * vs;
        clock.now += interval;
        k.sample(clock.now, interval, cpu);
      }
    },
  };
}

function setup(knobs: ReturnType<typeof knob>[], opts: { caps?: Capabilities; target?: TargetPolicy; adaptive?: boolean; store?: ProfileStore } = {}) {
  const kaics = new Kaics(opts.caps ?? PC, opts.adaptive ?? true);
  for (const k of knobs) kaics.register(k.spec);
  const kgps = new Kgps(kaics, 0, opts.store ?? null, KGPS_CONFIG, opts.target);
  return { kaics, kgps };
}

const kinds = (k: Kgps) => k.log.map((d) => d.kind);

describe('C2/C3 · perfil do aparelho e metas por classe', () => {
  it('T-12: classe do aparelho por evidência (renderizador, toque, tamanho da tela)', () => {
    expect(classifyDevice({ gpu: 'Google SwiftShader', touch: false, shortSide: 1080 }).value).toBe('software');
    expect(classifyDevice({ gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)', touch: false }).value).toBe('software');
    const phone = classifyDevice({ gpu: 'Mali-G57', touch: true, shortSide: 393 });
    expect(phone.value).toBe('mobile');
    expect(phone.source).toMatch(/toque \+ tela curta \(393 px\)/);
    expect(classifyDevice({ gpu: 'Apple GPU', touch: true, shortSide: 1024 }).value).toBe('pc');
    expect(classifyDevice({ gpu: 'NVIDIA GeForce RTX 3060', touch: false, shortSide: 1080 }).value).toBe('pc');
    expect(new Kaics(PHONE, true).device.value).toBe('mobile');
  });

  it('T-01: meta 30 no celular — quadros estáveis em 33,3 ms não disparam nenhum ajuste', () => {
    expect(MOBILE_TARGET).toEqual({ fps: 30, budgetMs: 1000 / 30, origin: 'classe' });
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res], { caps: PHONE, target: MOBILE_TARGET });
    // 20 ms de GPU numa tela de 60 Hz: todo quadro sai em 33,3 ms (30 qps estáveis)
    runner(kgps, () => ({ cpu: 4, gpu: 20 })).run(60_000);
    expect(res.state.level).toBe(3);
    expect(kinds(kgps)).not.toContain('degrade');
    expect(kinds(kgps)).not.toContain('emergency');
    // o mesmo quadro com a meta de PC (60) seria considerado lento
    const res2 = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps: pc } = setup([res2]);
    runner(pc, () => ({ cpu: 4, gpu: 8 + res2.state.level * 4 })).run(60_000);
    expect(kinds(pc)).toContain('degrade');
  });

  it('T-02/T-13: taxa da tela pelos quadros mais rápidos; 33,3 ms presos não viram estimativa', () => {
    expect(estimateRefreshHz(1000 / 120)).toBe(120);
    expect(estimateRefreshHz(1000 / 144 + 0.2)).toBe(144);
    expect(estimateRefreshHz(1000 / 90)).toBe(90);
    expect(estimateRefreshHz(16.9)).toBe(60);
    expect(estimateRefreshHz(1000 / 30)).toBeNull();
    expect(estimateRefreshHz(25)).toBeNull();
    // o teto da meta vem da tela quando ela é mais lenta que a meta da classe
    expect(targetFor('pc', 30)).toEqual({ fps: 30, budgetMs: 1000 / 30, origin: 'tela' });
    expect(targetFor('pc', 120).fps).toBe(60);
    expect(targetFor('mobile', null, 60)).toMatchObject({ fps: 60, origin: 'jogador' });
    const { kgps } = setup([knob('res', { levels: 4 })]);
    runner(kgps, () => ({ cpu: 2, gpu: 4 }), { vsync: 1000 / 120 }).run(20_000);
    expect(kgps.refreshHz).toBe(120);
  });

  it('T-03: limite externo explícito — nada é reduzido enquanto durar; com meta 30, conta como meta atingida', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const sh = knob('sombra', { levels: 3, helps: ['gpu'] });
    const { kgps } = setup([res, sh]);
    const r = runner(kgps, () => ({ cpu: 3, gpu: 5 }), { vsync: 1000 / 30 });
    r.run(60_000);
    expect(kgps.state(r.clock.now)).toBe('externalCap');
    const degradesAtCap = kinds(kgps).filter((k) => k === 'degrade').length;
    r.run(120_000);
    // nenhuma nova redução e nenhuma descida rápida (o quadro preso em 30 Hz não é emergência)
    expect(kinds(kgps).filter((k) => k === 'degrade').length).toBe(degradesAtCap);
    expect(kinds(kgps)).not.toContain('emergency');
    expect([res.state.level, sh.state.level]).toEqual([3, 2]);
    // no celular a mesma tela de 30 Hz já é a meta: nenhuma tentativa
    const res2 = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps: phone } = setup([res2], { caps: PHONE, target: MOBILE_TARGET });
    runner(phone, () => ({ cpu: 3, gpu: 5 }), { vsync: 1000 / 30 }).run(60_000);
    expect(kinds(phone).filter((k) => k === 'degrade' || k === 'emergency')).toEqual([]);
  });
});

describe('C4 · descida rápida', () => {
  /** Cena pesada no celular: a GPU leva até ~165 ms (6 qps) com tudo no máximo. */
  function heavyPhone(load = { base: 20 }) {
    const a = knob('exposicao', { levels: 4, helps: ['gpu'], cost: () => 1 });
    const b = knob('sombras', { levels: 3, helps: ['gpu'], cost: () => 2 });
    const res = knob('res', { levels: 6, floor: 3, emergencyFloor: 0, helps: ['gpu'], cost: (f) => (f > 3 ? 3 : 5) });
    const { kaics, kgps } = setup([a, b, res], { caps: PHONE, target: MOBILE_TARGET });
    const gpu = () => load.base + a.state.level * 15 + b.state.level * 20 + res.state.level * 12;
    return { a, b, res, kaics, kgps, gpu, r: runner(kgps, () => ({ cpu: 6, gpu: gpu() })) };
  }

  it('T-04: muito abaixo da meta, desce vários passos em segundos (inclusive emergência) e prova o ganho', () => {
    const { res, kgps, gpu, r } = heavyPhone();
    expect(gpu()).toBeGreaterThan(150);
    r.run(40_000);
    const start = kgps.log.find((d) => d.kind === 'emergency')!;
    const done = kgps.log.find((d) => d.kind === 'keep' && /Descida rápida concluída/.test(d.text))!;
    expect(start.text).toMatch(/meta 30 qps/);
    expect(done).toBeDefined();
    // a descida inteira leva segundos (não um passo a cada 4–6 s)
    expect(done.at - start.at).toBeLessThanOrEqual(20);
    expect(done.evidence).toBe('medido');
    expect(res.state.level).toBeLessThan(3); // usou nível de emergência
    // a prova final mediu a mediana já perto da meta (ex.: "mediana 166,7 → 33,3 ms")
    const after = Number(/→ ([\d,]+) ms \(/.exec(done.text)![1]!.replace(',', '.'));
    expect(after).toBeLessThanOrEqual(MOBILE_TARGET.budgetMs * KGPS_CONFIG.emergencyExitP50 + 1);
    expect(kgps.summary(r.clock.now).emergencyKnobs).toContain('res');
    expect(kgps.summary(r.clock.now).fidelity).toBeLessThan(1);
  });

  it('T-05: descida sem ganho é desfeita por inteiro e registrada como hipótese de limite não gráfico', () => {
    const a = knob('a', { levels: 4, cost: () => 1 });
    const res = knob('res', { levels: 6, floor: 3, emergencyFloor: 0, cost: () => 2 });
    const { kgps } = setup([a, res], { caps: PHONE, target: MOBILE_TARGET });
    // 150 ms por quadro que nenhum ajuste gráfico alivia
    runner(kgps, () => ({ cpu: 10, gpu: 150 })).run(40_000);
    const undo = kgps.log.find((d) => d.kind === 'revert' && /Descida rápida desfeita/.test(d.text))!;
    expect(undo).toBeDefined();
    expect(undo.evidence).toBe('hipotese');
    expect([a.state.level, res.state.level]).toEqual([3, 5]);
  });

  it('T-06: depois da descida, estabiliza 10 s e devolve primeiro os níveis de emergência', () => {
    const load = { base: 20 };
    const { res, kgps, r } = heavyPhone(load);
    r.run(40_000);
    const doneAt = kgps.log.find((d) => /Descida rápida concluída/.test(d.text))!.at * 1000;
    expect(kgps.state(doneAt + 2000)).toBe('stabilizing');
    expect(kgps.log.filter((d) => d.kind === 'upgrade' && d.at * 1000 < doneAt + KGPS_CONFIG.stabilizeMs)).toEqual([]);
    // a cena alivia: a qualidade volta, começando pelo que está abaixo do piso normal
    const emergencyLevel = res.state.level;
    expect(emergencyLevel).toBeLessThan(3);
    load.base = -200;
    r.run(240_000);
    const firstUp = kgps.log.find((d) => d.kind === 'upgrade')!;
    expect(firstUp.text).toMatch(/testando res/);
    expect(res.state.level).toBe(5);
  });

  it('T-07: espera de 3 min entre descidas, salvo queda muito forte (> 2,5× o orçamento)', () => {
    const load = { base: 20 };
    const { kgps, r, a, b, res } = heavyPhone(load);
    r.run(40_000);
    expect(kinds(kgps).filter((k) => k === 'emergency').length).toBe(1);
    // nova queda moderada (~2× o orçamento: quadros de 66,7 ms): sem segunda descida dentro da espera
    load.base = 58 - (a.state.level * 15 + b.state.level * 20 + res.state.level * 12);
    r.run(30_000);
    expect(kinds(kgps).filter((k) => k === 'emergency').length).toBe(1);
    // queda muito forte: a espera é dispensada
    load.base = 400;
    r.run(30_000);
    expect(kinds(kgps).filter((k) => k === 'emergency').length).toBeGreaterThanOrEqual(2);
  });

  it('T-08: níveis de emergência ficam fora do ajuste normal; portões novos bloqueiam mudanças', () => {
    const res = knob('res', { levels: 6, floor: 3, emergencyFloor: 0, helps: ['gpu'] });
    const { kaics, kgps } = setup([res]);
    // lento, mas não crítico (preso em 33,3 ms com CPU folgada): só o caminho normal
    runner(kgps, () => ({ cpu: 3, gpu: 12 + res.state.level * 2 })).run(120_000);
    expect(res.state.min).toBeGreaterThanOrEqual(3);
    expect(kaics.set('res', 1).ok).toBe(false);
    expect(kaics.set('res', 1, { emergency: true }).ok).toBe(true);
    for (const [c, text] of [
      ['loading', 'cena carregando'],
      ['compiling', 'preparando shaders de modelos novos'],
    ] as const) {
      kaics.setCondition(c, true);
      expect(kaics.set('res', 2, { emergency: true })).toEqual({ ok: false, reason: text });
      kaics.setCondition(c, false);
    }
  });

  it('T-11: desligar a adaptação no meio da descida devolve tudo, inclusive os níveis de emergência', () => {
    const { a, b, res, kgps, r } = heavyPhone();
    while (kgps.state(r.clock.now) !== 'emergency' && r.clock.now < 30_000) r.run(50);
    r.run(4000);
    expect(res.state.level + a.state.level + b.state.level).toBeLessThan(5 + 3 + 2);
    kgps.setAdaptive(false, r.clock.now);
    expect([a.state.level, b.state.level, res.state.level]).toEqual([3, 2, 5]);
    expect(kgps.state(r.clock.now)).not.toBe('emergency');
  });
});

describe('C1 · núcleo do KAICS', () => {
  it('T-09: exceção num adaptador põe só ele em quarentena; adaptadores ligam e desligam uma vez', () => {
    const bad = knob('ruim', { levels: 3 });
    (bad.spec as { apply: (l: number) => void }).apply = () => {
      throw new Error('quebrou');
    };
    const good = knob('bom', { levels: 3 });
    let attached = 0;
    let detached = 0;
    good.spec.attach = () => attached++;
    good.spec.detach = () => detached++;
    const kaics = new Kaics(PC, true);
    kaics.register(bad.spec);
    kaics.register(good.spec);
    expect(kaics.set('ruim', 1).ok).toBe(false);
    expect(kaics.knobs.get('ruim')!.status).toBe('quarantined');
    expect(kaics.set('bom', 1).ok).toBe(true);
    kaics.dispose();
    kaics.dispose();
    expect([attached, detached]).toEqual([1, 1]);
  });

  it('T-10: mudança feita por fora do KAICS vira incidente e o novo nível é adotado (sem briga)', () => {
    const res = knob('res', { levels: 4, helps: ['gpu'] });
    const { kgps } = setup([res]);
    const r = runner(kgps, () => ({ cpu: 3, gpu: 6 }));
    r.run(10_000);
    res.state.level = 1; // alguém mexeu direto no renderizador
    r.run(30_000);
    expect(kgps.log.some((d) => d.kind === 'incident' && /alterado fora do KAICS \(n3 → n1\)/.test(d.text))).toBe(true);
    expect(res.state.level).toBe(1);
  });
});

describe('C8 · evidência, relatório e perfil aprendido', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('T-14: relatório com os campos do diagnóstico, até 20 KB, congelamentos e evidência por decisão', () => {
    const { kgps, kaics, r } = (() => {
      const res = knob('res', { levels: 6, floor: 3, emergencyFloor: 0, helps: ['gpu'] });
      const s = setup([res], { caps: PHONE, target: MOBILE_TARGET });
      let n = 0;
      // quadros pesados com um congelamento de 2 s no meio
      const rr = runner(s.kgps, () => ({ cpu: 5, gpu: n++ === 400 ? 2000 : 90 + res.state.level * 10 }));
      return { ...s, r: rr };
    })();
    r.run(90_000);
    const json = buildReport({
      revision: 3,
      preset: 'ultraplus',
      scene: 'teatro',
      summary: kgps.summary(r.clock.now),
      caps: PHONE,
      windows: kgps.recentWindows(),
      decisions: kgps.log,
      render: { drawCalls: 300, triangles: 250_000, geometries: 120, textures: 40 },
    });
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(REPORT_MAX_BYTES);
    const rep = JSON.parse(json) as Record<string, unknown> & { device: { class: string }; target: { fps: number }; windows: { stalls: number }[]; decisions: { evidence: string }[] };
    expect(rep.device.class).toBe('mobile');
    expect(rep.target.fps).toBe(30);
    expect(rep.windows.length).toBeGreaterThan(0);
    expect(rep.windows.reduce((s, w) => s + w.stalls, 0)).toBeGreaterThanOrEqual(1);
    expect(rep.decisions.length).toBeGreaterThan(0);
    expect(rep.decisions.every((d) => ['medido', 'estimado', 'hipotese'].includes(d.evidence))).toBe(true);
    for (const key of ['schema', 'graphicsRevision', 'preset', 'state', 'fidelityIndex', 'knobs', 'incidents', 'render']) expect(rep).toHaveProperty(key);
    // nada de dados pessoais ou da partida
    expect(json).not.toMatch(/"(name|player|room|chat|userId|email|pos)"/);
    expect(kaics.device.value).toBe('mobile');
  });

  it('T-15: o ajuste aprendido vale só para a mesma versão gráfica, classe e meta', () => {
    const mem = new Map<string, string>([['nc.kgps.v1', '{}']]);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const base = { revision: 3, preset: 'ultraplus', dpr: 2.5, scene: 'teatro', deviceClass: 'mobile' as const, fps: 30 };
    const key = profileKey(base);
    expect(profileKey({ ...base, revision: 4 })).not.toBe(key);
    expect(profileKey({ ...base, deviceClass: 'pc' })).not.toBe(key);
    expect(profileKey({ ...base, fps: 60 })).not.toBe(key);
    localProfileStore(key).save({ res: 2 });
    expect(localProfileStore(key).load()).toEqual({ res: 2 });
    expect(localProfileStore(profileKey({ ...base, revision: 4 })).load()).toBeNull();
    expect(mem.has('nc.kgps.v1')).toBe(false);
  });

  it('perfil aprendido com nível de emergência recomeça dele na próxima partida', () => {
    let saved: Record<string, number> | null = { res: 1 };
    const store: ProfileStore = { load: () => saved, save: (l) => (saved = l) };
    const res = knob('res', { levels: 6, floor: 3, emergencyFloor: 0 });
    const { kgps } = setup([res], { caps: PHONE, target: MOBILE_TARGET, store });
    expect(res.state.level).toBe(1);
    expect(kgps.log[0]).toMatchObject({ kind: 'profile', evidence: 'estimado' });
  });
});

describe('C5 · densidade da decoração', () => {
  it('T-17: subconjunto fixo e encaixado — quem fica com 50% fica com 75%, sempre o mesmo', () => {
    const pts = Array.from({ length: 2000 }, (_, i) => ({ x: (i * 7.31) % 251, z: (i * 3.77) % 197 }));
    const at = (d: number) => pts.filter((p) => decorKept(p.x, p.z, d));
    const half = at(0.5);
    const most = at(0.75);
    expect(at(1)).toHaveLength(pts.length);
    expect(half.every((p) => decorKept(p.x, p.z, 0.75))).toBe(true);
    expect(at(0.5)).toEqual(half);
    expect(half.length / pts.length).toBeGreaterThan(0.42);
    expect(half.length / pts.length).toBeLessThan(0.58);
    expect(most.length).toBeGreaterThan(half.length);
  });
});
