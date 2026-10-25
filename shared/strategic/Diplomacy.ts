import type { Factor, NationState } from './NationalSimulation.ts';

/**
 * Diplomacia bilateral. Não há base de dados confiável de relações bilaterais para iniciar o
 * cenário, então toda relação começa neutra (0) — exceto entre os dois lados em conflito nesta
 * operação. A relação é a SOMA DE FATORES VISÍVEIS (tratados, sanções, ajuda, missões, memória de
 * acordos rompidos...), nunca um número opaco; e a relação A–B não determina mecanicamente a B–C.
 * Todos os coeficientes são parâmetros de jogo.
 */

export type NationId = number;
export type TreatyType = 'trade' | 'alliance' | 'sanctions';

export interface Treaty {
  id: number;
  type: TreatyType;
  /** Em sanções, `a` sanciona `b`. Nos demais, partes simétricas. */
  a: NationId;
  b: NationId;
  startDay: number;
  endDay: number;
}

export type DiplomaticAction =
  | { type: 'propose'; treaty: 'trade' | 'alliance'; partner: NationId }
  | { type: 'request_sanctions'; partner: NationId; target: NationId }
  | { type: 'impose_sanctions'; target: NationId }
  | { type: 'lift_sanctions'; target: NationId }
  | { type: 'send_aid'; partner: NationId; pctGdp: number }
  | { type: 'set_mission'; partner: NationId; active: boolean }
  | { type: 'cancel_treaty'; treatyId: number };

export type DiplomaticEvent =
  | { type: 'treaty_signed'; day: number; treaty: Treaty }
  | { type: 'proposal_rejected'; day: number; from: NationId; to: NationId; proposal: string; reasons: Factor[] }
  | { type: 'treaty_ended'; day: number; treaty: Treaty; reason: 'expired' | 'cancelled' }
  | { type: 'aid_sent'; day: number; from: NationId; to: NationId; amountUsd: number };

export interface RelationView {
  a: NationId;
  b: NationId;
  value: number;
  factors: Factor[];
}

export const DIPLO = {
  conflictBase: -60,
  tradeRelation: 12,
  allianceRelation: 22,
  sanctionsRelation: -30,
  enemyOfAlly: -12,
  missionPerDay: 0.08,
  missionCap: 20,
  /** Custo anual de uma missão diplomática, % do PIB. */
  missionCostPct: 0.02,
  /** Contribuição anual de cada parte de uma aliança de defesa, % do PIB. */
  allianceCostPct: 0.1,
  aidRelationPer01Pct: 12,
  aidCap: 30,
  /** Decaimento diário da memória de eventos e da ajuda (meia-vida ≈ 140 e 115 dias). */
  memoryDecay: 0.995,
  aidDecay: 0.994,
  brokenTreatyPartner: -25,
  brokenTreatyReputation: -5,
  tradeDays: 360,
  allianceDays: 540,
  sanctionsDays: 360,
  rejectCooldownDays: 60,
  /** Crescimento (p.p./ano) por acordo comercial, escalado pela razão de PIBs (limitada a 2). */
  tradeGrowth: 0.25,
  tradeGrowthCap: 1,
  /** Perda de crescimento do alvo de sanções, escalada pelo PIB do sancionador. */
  sanctionsGrowth: 0.5,
  sanctionsCostGrowth: 0.05,
  sanctionsApproval: -2,
  /** Ajuda militar de um aliado ao teatro: k · log10(1 + defesa do aliado em US$ bi). */
  allianceAidK: 0.5,
} as const;

/** Pontuação mínima (soma dos fatores) para um governo da IA aceitar cada proposta. */
const THRESHOLDS = { trade: 5, alliance: 30, sanctions: 25 } as const;

interface PairState {
  memory: number;
  aid: number;
  mission: number;
}

const key = (a: NationId, b: NationId) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export class Diplomacy {
  readonly treaties: Treaty[] = [];
  private readonly pairs = new Map<string, PairState>();
  /** Missões ativas: chave "de→para". */
  readonly missions = new Set<string>();
  private readonly cooldown = new Map<string, number>();
  private events: DiplomaticEvent[] = [];
  private nextTreaty = 1;

  constructor(
    private readonly all: () => NationState[],
    /** Pares em conflito nesta operação (os jogadores adversários). */
    private readonly conflicts: [NationId, NationId][],
  ) {}

  drainEvents(): DiplomaticEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private nation(id: NationId): NationState | undefined {
    return this.all().find((n) => n.slot === id);
  }

  private pair(a: NationId, b: NationId): PairState {
    let p = this.pairs.get(key(a, b));
    if (!p) {
      p = { memory: 0, aid: 0, mission: 0 };
      this.pairs.set(key(a, b), p);
    }
    return p;
  }

  atWar(a: NationId, b: NationId): boolean {
    return this.conflicts.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  active(type: TreatyType, a: NationId, b: NationId, directed = false): Treaty | undefined {
    return this.treaties.find((t) => t.type === type && ((t.a === a && t.b === b) || (!directed && t.a === b && t.b === a)));
  }

  /** Fatores que compõem a relação entre dois países. */
  factors(a: NationId, b: NationId): Factor[] {
    const p = this.pair(a, b);
    const out: Factor[] = [];
    if (this.atWar(a, b)) out.push({ key: 'conflict', label: 'Conflito armado nesta operação', value: DIPLO.conflictBase });
    if (this.active('trade', a, b)) out.push({ key: 'trade', label: 'Acordo comercial', value: DIPLO.tradeRelation });
    if (this.active('alliance', a, b)) out.push({ key: 'alliance', label: 'Acordo de defesa', value: DIPLO.allianceRelation });
    if (this.active('sanctions', a, b)) out.push({ key: 'sanctions', label: 'Sanções em vigor entre os dois', value: DIPLO.sanctionsRelation });
    // aliado do inimigo: um fator, não uma regra automática
    const enemyOfAlly = this.all().some(
      (c) => c.slot !== a && c.slot !== b && ((this.active('alliance', a, c.slot) && this.atWar(c.slot, b)) || (this.active('alliance', b, c.slot) && this.atWar(c.slot, a))),
    );
    if (enemyOfAlly) out.push({ key: 'enemy_ally', label: 'Aliado de um adversário em guerra', value: DIPLO.enemyOfAlly });
    if (Math.abs(p.aid) >= 0.05) out.push({ key: 'aid', label: 'Ajuda recebida/enviada recentemente', value: round1(p.aid) });
    if (p.mission >= 0.05) out.push({ key: 'mission', label: 'Missões diplomáticas', value: round1(p.mission) });
    if (Math.abs(p.memory) >= 0.05) out.push({ key: 'memory', label: 'Histórico recente (acordos rompidos, recusas)', value: round1(p.memory) });
    return out;
  }

  relation(a: NationId, b: NationId): number {
    return clamp(this.factors(a, b).reduce((s, f) => s + f.value, 0), -100, 100);
  }

  relationsOf(ids: NationId[]): RelationView[] {
    const out: RelationView[] = [];
    const all = this.all().map((n) => n.slot);
    for (const a of ids) for (const b of all) if (a !== b && !(ids.includes(b) && b < a)) out.push({ a, b, value: round1(this.relation(a, b)), factors: this.factors(a, b) });
    return out;
  }

  // ------------------------------------------------------------ efeitos sobre as nações

  /** Crescimento (p.p./ano) vindo de acordos comerciais e sanções. */
  growthEffects(id: NationId): { trade: number; sanctions: number } {
    const me = this.nation(id);
    if (!me) return { trade: 0, sanctions: 0 };
    let trade = 0;
    let sanctions = 0;
    for (const t of this.treaties) {
      if (t.type === 'trade' && (t.a === id || t.b === id)) {
        const other = this.nation(t.a === id ? t.b : t.a);
        if (other) trade += DIPLO.tradeGrowth * Math.sqrt(Math.min(other.gdpUsd / me.gdpUsd, 2));
      } else if (t.type === 'sanctions') {
        if (t.b === id) {
          const by = this.nation(t.a);
          if (by) sanctions -= DIPLO.sanctionsGrowth * Math.sqrt(Math.min(by.gdpUsd / me.gdpUsd, 2));
        } else if (t.a === id) sanctions -= DIPLO.sanctionsCostGrowth;
      }
    }
    return { trade: Math.min(trade, DIPLO.tradeGrowthCap), sanctions };
  }

  sanctionsAgainst(id: NationId): number {
    return this.treaties.filter((t) => t.type === 'sanctions' && t.b === id).length;
  }

  /** Custo anual (% do PIB) de missões e alianças. */
  costPct(id: NationId): number {
    let c = 0;
    for (const m of this.missions) if (m.startsWith(`${id}>`)) c += DIPLO.missionCostPct;
    c += this.treaties.filter((t) => t.type === 'alliance' && (t.a === id || t.b === id)).length * DIPLO.allianceCostPct;
    return c;
  }

  /** Ajuda militar (suprimentos/s) enviada por aliados ao teatro do jogador. */
  allianceAid(id: NationId, gdpForTheater: (n: NationState) => number): number {
    let aid = 0;
    for (const t of this.treaties) {
      if (t.type !== 'alliance' || (t.a !== id && t.b !== id)) continue;
      const ally = this.nation(t.a === id ? t.b : t.a);
      if (!ally) continue;
      const defenseBn = ((ally.budget.defensePct / 100) * gdpForTheater(ally)) / 1e9;
      aid += DIPLO.allianceAidK * Math.log10(1 + defenseBn);
    }
    return aid;
  }

  // ------------------------------------------------------------ ações

  /**
   * Avaliação de uma proposta por um governo da IA: interesse e risco explícitos.
   * Retorna os fatores considerados; aceita se a soma passar do limiar.
   */
  evaluate(proposer: NationId, receiver: NationId, proposal: 'trade' | 'alliance' | 'sanctions', target?: NationId): { accept: boolean; reasons: Factor[]; threshold: number } {
    const me = this.nation(receiver);
    const them = this.nation(proposer);
    if (!me || !them) return { accept: false, reasons: [], threshold: 0 };
    const reasons: Factor[] = [{ key: 'relation', label: 'Relação atual', value: round1(this.relation(proposer, receiver)) }];
    const threshold = THRESHOLDS[proposal];
    if (proposal === 'trade') {
      reasons.push({ key: 'mutual', label: 'Benefício mútuo do comércio', value: 8 });
      reasons.push({ key: 'market', label: 'Tamanho do mercado do proponente', value: round1(12 * Math.log10(1 + them.gdpUsd / me.gdpUsd)) });
      if (this.active('sanctions', receiver, proposer, true)) reasons.push({ key: 'sanctions', label: 'Mantém sanções contra o proponente', value: -50 });
    } else if (proposal === 'alliance') {
      const enemies = this.conflicts.filter(([x, y]) => x === proposer || y === proposer).map(([x, y]) => (x === proposer ? y : x));
      if (enemies.length) reasons.push({ key: 'war_risk', label: 'Risco de envolvimento num conflito em curso', value: -20 });
      for (const e of enemies) {
        const r = this.relation(receiver, e);
        if (r > 0) reasons.push({ key: 'enemy_ties', label: 'Boas relações com o adversário do proponente', value: round1(-r / 2) });
      }
    } else {
      if (target === undefined) return { accept: false, reasons, threshold };
      reasons.push({ key: 'target_relation', label: 'Relação com o alvo das sanções', value: round1(-this.relation(receiver, target)) });
      reasons.push({ key: 'cost', label: 'Custo econômico de sancionar', value: -20 });
      if (this.active('trade', receiver, target)) reasons.push({ key: 'trade_with_target', label: 'Tem acordo comercial com o alvo', value: -25 });
    }
    const total = reasons.reduce((s, r) => s + r.value, 0);
    return { accept: total >= threshold, reasons, threshold };
  }

  /** Executa uma ação de `actor`. NPCs respondem a propostas na hora. Retorna erro ou null. */
  act(actor: NationId, action: DiplomaticAction, day: number, isNpc: (id: NationId) => boolean): string | null {
    const me = this.nation(actor);
    if (!me) return 'Nação inválida';
    const target = (id: NationId) => (id === actor ? undefined : this.nation(id));
    switch (action.type) {
      case 'propose': {
        const other = target(action.partner);
        if (!other) return 'País inválido';
        if (this.atWar(actor, other.slot)) return 'Não há acordos com um adversário em guerra';
        if (this.active(action.treaty, actor, other.slot)) return 'Acordo já vigente';
        if (!isNpc(other.slot)) return 'Propostas a outros jogadores ainda não são suportadas';
        const ck = `${actor}>${other.slot}:${action.treaty}`;
        if ((this.cooldown.get(ck) ?? -Infinity) > day) return `Proposta recusada recentemente; aguarde até o dia ${this.cooldown.get(ck)}`;
        const ev = this.evaluate(actor, other.slot, action.treaty);
        if (!ev.accept) {
          this.cooldown.set(ck, day + DIPLO.rejectCooldownDays);
          this.events.push({ type: 'proposal_rejected', day, from: actor, to: other.slot, proposal: action.treaty, reasons: ev.reasons });
          return null;
        }
        this.sign(action.treaty, actor, other.slot, day, action.treaty === 'trade' ? DIPLO.tradeDays : DIPLO.allianceDays);
        return null;
      }
      case 'request_sanctions': {
        const partner = target(action.partner);
        const victim = this.nation(action.target);
        if (!partner || !victim || victim.slot === partner.slot) return 'País inválido';
        if (!isNpc(partner.slot)) return 'Só governos da IA podem ser solicitados';
        if (this.active('sanctions', partner.slot, victim.slot, true)) return 'Sanções já vigentes';
        const ck = `${actor}>${partner.slot}:sanctions:${victim.slot}`;
        if ((this.cooldown.get(ck) ?? -Infinity) > day) return `Pedido recusado recentemente; aguarde até o dia ${this.cooldown.get(ck)}`;
        const ev = this.evaluate(actor, partner.slot, 'sanctions', victim.slot);
        if (!ev.accept) {
          this.cooldown.set(ck, day + DIPLO.rejectCooldownDays);
          this.events.push({ type: 'proposal_rejected', day, from: actor, to: partner.slot, proposal: 'sanctions', reasons: ev.reasons });
          return null;
        }
        this.sign('sanctions', partner.slot, victim.slot, day, DIPLO.sanctionsDays);
        return null;
      }
      case 'impose_sanctions': {
        const victim = target(action.target);
        if (!victim) return 'País inválido';
        if (this.active('sanctions', actor, victim.slot, true)) return 'Sanções já vigentes';
        // sanções encerram o comércio entre as partes
        const trade = this.active('trade', actor, victim.slot);
        if (trade) this.end(trade, day, 'cancelled', actor);
        this.sign('sanctions', actor, victim.slot, day, DIPLO.sanctionsDays);
        return null;
      }
      case 'lift_sanctions': {
        const t = this.active('sanctions', actor, action.target, true);
        if (!t) return 'Não há sanções suas contra este país';
        this.end(t, day, 'cancelled', null);
        return null;
      }
      case 'send_aid': {
        const other = target(action.partner);
        if (!other) return 'País inválido';
        if (this.atWar(actor, other.slot)) return 'Não é possível enviar ajuda a um adversário em guerra';
        const pct = clamp(action.pctGdp, 0.01, 0.5);
        const amount = (pct / 100) * me.gdpUsd;
        me.debtUsd += amount; // pago com endividamento (sai do orçamento do ano)
        const p = this.pair(actor, other.slot);
        p.aid = Math.min(DIPLO.aidCap, p.aid + DIPLO.aidRelationPer01Pct * (pct / 0.1));
        this.events.push({ type: 'aid_sent', day, from: actor, to: other.slot, amountUsd: Math.round(amount) });
        return null;
      }
      case 'set_mission': {
        const other = target(action.partner);
        if (!other) return 'País inválido';
        const k = `${actor}>${other.slot}`;
        if (action.active) this.missions.add(k);
        else this.missions.delete(k);
        return null;
      }
      case 'cancel_treaty': {
        const t = this.treaties.find((x) => x.id === action.treatyId && (x.a === actor || x.b === actor));
        if (!t) return 'Tratado inválido';
        if (t.type === 'sanctions' && t.a !== actor) return 'Só quem aplica sanções pode retirá-las';
        this.end(t, day, 'cancelled', t.type === 'sanctions' ? null : actor);
        return null;
      }
    }
  }

  private sign(type: TreatyType, a: NationId, b: NationId, day: number, duration: number): void {
    const treaty: Treaty = { id: this.nextTreaty++, type, a, b, startDay: day, endDay: day + duration };
    this.treaties.push(treaty);
    this.events.push({ type: 'treaty_signed', day, treaty });
  }

  /** Encerra um tratado. Romper antes do prazo (breaker ≠ null) custa relação e reputação. */
  private end(t: Treaty, day: number, reason: 'expired' | 'cancelled', breaker: NationId | null): void {
    const i = this.treaties.indexOf(t);
    if (i >= 0) this.treaties.splice(i, 1);
    if (reason === 'cancelled' && breaker !== null) {
      const other = t.a === breaker ? t.b : t.a;
      this.pair(breaker, other).memory += DIPLO.brokenTreatyPartner;
      for (const n of this.all()) if (n.slot !== breaker && n.slot !== other) this.pair(breaker, n.slot).memory += DIPLO.brokenTreatyReputation;
    }
    this.events.push({ type: 'treaty_ended', day, treaty: t, reason });
  }

  stepDay(day: number): void {
    for (const p of this.pairs.values()) {
      p.memory *= DIPLO.memoryDecay;
      p.aid *= DIPLO.aidDecay;
    }
    const ids = this.all().map((n) => n.slot);
    for (const a of ids)
      for (const b of ids) {
        if (a >= b) continue;
        const p = this.pair(a, b);
        const active = this.missions.has(`${a}>${b}`) || this.missions.has(`${b}>${a}`);
        p.mission = active ? Math.min(DIPLO.missionCap, p.mission + DIPLO.missionPerDay) : p.mission * 0.99;
      }
    for (const t of [...this.treaties]) if (day >= t.endDay) this.end(t, day, 'expired', null);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
