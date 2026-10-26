/**
 * KGPS (Kaiser Graphic Performance System): mantém o jogo perto de 60 quadros por segundo
 * mexendo o mínimo possível na qualidade, e só onde isso comprovadamente ajuda.
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
 * Nunca mexe em regras, simulação, névoa de guerra, fronteiras, seleção ou interface.
 */
import { FrameWindow, classifyBottleneck, type Bottleneck, type WindowStats } from './stats.ts';
import type { Kaics, KnobEntry } from './kaics.ts';

export const KGPS_CONFIG = {
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
};

export type KgpsConfig = typeof KGPS_CONFIG;
export type KgpsState = 'warmup' | 'observing' | 'evaluating' | 'frozen';
export type DecisionKind = 'degrade' | 'upgrade' | 'keep' | 'revert' | 'hold' | 'suggest' | 'incident' | 'profile' | 'inconclusive' | 'mode';

export interface Decision {
  /** Segundos desde o início da partida. */
  at: number;
  kind: DecisionKind;
  text: string;
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

export interface PerfSummary {
  mode: 'adaptive' | 'observe' | 'blocked';
  state: KgpsState;
  reasons: string[];
  frozenReason: string | null;
  budgetMs: number;
  window: WindowStats | null;
  bottleneck: Bottleneck;
  overheadUs: number;
  knobs: { id: string; label: string; level: number; levels: readonly string[]; baseline: number; floor: number; status: KnobEntry['status'] }[];
  log: Decision[];
  incidents: string[];
}

const BOTTLENECK_TEXT: Record<Bottleneck, string> = { gpu: 'GPU', cpu: 'CPU', unknown: 'indefinido' };

const ms = (v: number) => v.toFixed(1).replace('.', ',');

export class Kgps {
  readonly budget: number;
  private readonly win = new FrameWindow();
  private readonly startedAt: number;
  private settleUntil: number;
  private frozenUntil = 0;
  private frozenReason: string | null = null;
  private externalFreezes = 0;
  private badStreak = 0;
  private goodStreak = 0;
  private headroomStreak = 0;
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
  last: WindowStats | null = null;
  lastBottleneck: Bottleneck = 'unknown';
  overheadUs = 0;
  readonly log: Decision[] = [];

  constructor(
    private readonly kaics: Kaics,
    now: number,
    private readonly store: ProfileStore | null = null,
    private readonly cfg: KgpsConfig = KGPS_CONFIG,
  ) {
    this.budget = 1000 / cfg.targetFps;
    this.startedAt = now;
    this.settleUntil = now + cfg.warmupMs;
    for (const msg of kaics.incidents) this.push(now, 'incident', msg);
    this.applyProfile(now);
  }

  /** Um quadro desenhado. Quadros com o KAICS bloqueando (cena oculta etc.) não devem chegar aqui. */
  sample(now: number, intervalMs: number, cpuMs: number): void {
    const t0 = performance.now();
    if (now >= this.settleUntil) {
      this.win.add(now, intervalMs, cpuMs);
      const span = now - this.win.start;
      if ((span >= this.cfg.windowMs && this.win.count >= this.cfg.minSamples) || (span >= this.cfg.windowMs * 3 && this.win.count >= 5)) this.closeWindow(now);
    }
    this.overheadMs += performance.now() - t0;
    this.overheadFrames++;
  }

  /** Algo mudou fora do KGPS (redimensionamento, retomada, contexto restaurado): mede de novo. */
  invalidate(now: number, reason: string): void {
    this.win.clear();
    this.settleUntil = Math.max(this.settleUntil, now + this.cfg.settleMs);
    this.badStreak = this.goodStreak = this.headroomStreak = 0;
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
      this.chain = [];
      this.stack.length = 0;
      this.push(now, 'mode', 'Qualidade adaptativa desligada: qualidade escolhida nas configurações restaurada');
    }
    this.invalidate(now, 'modo alterado');
  }

  state(now: number): KgpsState {
    if (now < this.startedAt + this.cfg.warmupMs) return 'warmup';
    if (this.pending) return 'evaluating';
    if (now < this.frozenUntil) return 'frozen';
    return 'observing';
  }

  summary(now: number): PerfSummary {
    const verdict = this.kaics.verdict();
    return {
      mode: verdict.mode,
      state: this.state(now),
      reasons: verdict.reasons,
      frozenReason: now < this.frozenUntil ? this.frozenReason : null,
      budgetMs: this.budget,
      window: this.last,
      bottleneck: this.lastBottleneck,
      overheadUs: this.overheadUs,
      knobs: [...this.kaics.knobs.entries()].map(([id, k]) => ({
        id,
        label: k.spec.label,
        level: this.kaics.level(id),
        levels: k.spec.levels,
        baseline: k.spec.baseline,
        floor: k.spec.floor,
        status: k.status,
      })),
      log: this.log.slice(-14),
      incidents: [...this.kaics.incidents],
    };
  }

  // ------------------------------------------------------------ decisões

  private closeWindow(now: number): void {
    const s = this.win.stats(now)!;
    this.win.clear();
    this.last = s;
    this.lastBottleneck = classifyBottleneck(s, this.cfg.minSamples, this.budget).kind;
    if (this.overheadFrames > 0) this.overheadUs = (this.overheadMs * 1000) / this.overheadFrames;
    this.overheadMs = 0;
    this.overheadFrames = 0;
    if (this.pending) return this.judge(now, s);
    if (now < this.frozenUntil) return;
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
      this.degrade(now, s);
    } else if (this.stack.length && (this.headroomStreak >= this.cfg.upgradeAfterHeadroom || this.goodStreak >= this.cfg.upgradeAfterSteady)) {
      this.goodStreak = this.headroomStreak = 0;
      this.upgrade(now, s);
    }
  }

  private isBad(s: WindowStats): boolean {
    return s.p95 > this.budget * this.cfg.badP95 || s.p50 > this.budget * this.cfg.badP50;
  }

  private candidate(now: number): { id: string; from: number; to: number } | null {
    // dentro de uma cadeia, vale o diagnóstico do começo (a tela arredonda as medidas do meio)
    const b = this.chain.length ? this.chainBottleneck : this.lastBottleneck;
    let best: { id: string; from: number; to: number; cost: number } | null = null;
    for (const [id, k] of this.kaics.knobs) {
      if (k.status !== 'ok') continue;
      if ((this.degradeBan.get(id) ?? 0) > now) continue;
      if (b !== 'unknown' && !k.spec.helps.includes(b)) continue;
      const level = this.kaics.level(id);
      if (level <= k.spec.floor) continue;
      const cost = k.spec.stepCost(level);
      if (!best || cost < best.cost) best = { id, from: level, to: level - 1, cost };
    }
    return best;
  }

  private degrade(now: number, s: WindowStats): void {
    const why = `quadros lentos (p95 ${ms(s.p95)} ms, mediana ${ms(s.p50)} ms; gargalo provável: ${BOTTLENECK_TEXT[this.lastBottleneck]})`;
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
    this.push(now, 'degrade', `Reduzido ${step}, por ${why}`);
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
    const r = this.kaics.set(id, from + 1);
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
      this.chain = [];
      this.chainBefore = null;
      this.ineffective++;
      this.push(now, 'revert', `Desfeito: ${names} não melhorou (p95 ${ms(ref.p95)} → ${ms(s.p95)} ms); fica de fora por ${this.cfg.ineffectiveBanMs / 1000} s`);
      if (this.ineffective >= this.cfg.ineffectiveLimit) {
        this.ineffective = 0;
        const dur = Math.min(this.cfg.externalFreezeMaxMs, this.cfg.externalFreezeMs * 2 ** this.externalFreezes++);
        this.freeze(now, dur, 'Reduzir a qualidade não está ajudando: o limite parece ser da tela, do navegador ou do sistema');
      } else this.badStreak = this.cfg.degradeAfter - 1;
      return;
    }
    if (this.isBad(s)) {
      this.revert(now, p);
      this.stack.push(p.id);
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

  private revert(now: number, p: Pending): void {
    const r = this.kaics.set(p.id, p.from);
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

  private freeze(now: number, dur: number, reason: string): void {
    this.frozenUntil = now + dur;
    this.frozenReason = reason;
    this.push(now, 'hold', `${reason} (pausa de ${Math.round(dur / 1000)} s)`);
  }

  // ------------------------------------------------------------ perfil aprendido

  private applyProfile(now: number): void {
    const saved = this.store?.load();
    if (!saved || this.kaics.verdict().mode !== 'adaptive') return;
    const applied: string[] = [];
    for (const [id, level] of Object.entries(saved)) {
      const k = this.kaics.knobs.get(id);
      if (!k || k.status !== 'ok' || !Number.isInteger(level) || level < k.spec.floor || level >= k.spec.baseline) continue;
      if (!this.kaics.set(id, level).ok) continue;
      for (let i = level; i < k.spec.baseline; i++) this.stack.push(id);
      applied.push(`${k.spec.label} ${this.levelText(id, level)}`);
    }
    if (applied.length) this.push(now, 'profile', `Começando do ajuste aprendido neste aparelho: ${applied.join(', ')} (a qualidade sobe sozinha se houver folga)`);
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

  private push(now: number, kind: DecisionKind, text: string): void {
    this.log.push({ at: Math.max(0, Math.round((now - this.startedAt) / 100) / 10), kind, text });
    if (this.log.length > this.cfg.logSize) this.log.splice(0, this.log.length - this.cfg.logSize);
  }
}

/** Perfil aprendido salvo no navegador, por preset e densidade de tela (expira em 14 dias). */
export function localProfileStore(key: string, nowMs = Date.now()): ProfileStore {
  const STORAGE = 'nc.kgps.v1';
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
      } catch {
        // armazenamento indisponível: o ajuste vale só para esta partida
      }
    },
  };
}
