import type { Factor, NationState } from './NationalSimulation.ts';
import { regionOf } from '../data/geography.ts';
import { CAIXA_DAYS } from './params.ts';

/**
 * Diplomacia bilateral. Não há base de dados confiável de relações bilaterais para iniciar o
 * cenário, então toda relação começa neutra (0) — exceto entre as forças rivais deste teatro de
 * operações. A relação é a SOMA DE FATORES VISÍVEIS (tratados, sanções, ajuda, missões, memória de
 * acordos rompidos...), nunca um número opaco; e a relação A–B não determina mecanicamente a B–C.
 * Todos os coeficientes são parâmetros de jogo.
 *
 * Também guarda as duas regras geopolíticas da partida:
 * - **Contato (descoberta).** Um país existe para todos, mas só se negocia com — ou se declara
 *   guerra contra — países com quem há contato. Regra inicial: países da mesma região diplomática
 *   e as forças do mesmo teatro de operações. Novos contatos vêm de missão de contato (custo e
 *   prazo) ou de notícias de tratados assinados por um país já conhecido.
 * - **Guerra formal.** Só existe depois de uma declaração com custo, validada pela simulação.
 */

export type NationId = number;
export type TreatyType = 'trade' | 'alliance' | 'sanctions' | 'nonaggression';

export interface Treaty {
  id: number;
  type: TreatyType;
  /** Em sanções, `a` sanciona `b`. Nos demais, partes simétricas. */
  a: NationId;
  b: NationId;
  startDay: number;
  endDay: number;
  /** Pacto entre nações do teatro (06/11): não agressão ou aliança firmada na partida, sem prazo, rompível com indenização. */
  pact?: true;
  /** Aliança de time (definida na sala): não se rompe. */
  team?: true;
}

/** Convite de pacto a um jogador humano do teatro (06/11): ele aceita ou recusa até `expiresDay`. */
export interface PactOffer {
  id: number;
  from: NationId;
  to: NationId;
  treaty: 'alliance' | 'nonaggression';
  day: number;
  expiresDay: number;
}

/**
 * Pactos no teatro (06/11), em dias de repasse do caixa de quem paga: firmar (pago por quem propõe) e indenização (paga
 * por quem rompe à outra parte). Convite a humano vale `offerDays`; recusa de bot segura nova proposta por `rejectDays`.
 */
export const PACT = {
  napFeeDays: 20,
  allianceFeeDays: 30,
  napIndemnityDays: 90,
  allianceIndemnityDays: 120,
  offerDays: 60,
  rejectDays: 60,
} as const;

/** Ganchos da camada nacional para os pactos do teatro (bots, caixa, força militar e efeito no teatro). */
export interface PactHooks {
  isBot(id: NationId): boolean;
  dayUsd(id: NationId): number;
  fund(id: NationId): number;
  /** Move dinheiro entre caixas (`to` null = some do jogo). */
  pay(from: NationId, to: NationId | null, usd: number, label: string): void;
  /** Força militar no teatro (unidades), para a avaliação dos bots. */
  strength(id: NationId): number;
  /** Liga ou desliga o pacto no teatro (aliança: visão compartilhada; os dois: sem ataque) e faz a paz. */
  setPact(a: NationId, b: NationId, kind: 'alliance' | 'nonaggression' | null): void;
  setPeace(a: NationId, b: NationId): void;
}

export const PACT_LABEL = { alliance: 'aliança', nonaggression: 'pacto de não agressão' } as const;

/** Aliança de time: pela marca, ou (salvamentos antigos) pela duração da partida inteira sem ser pacto. */
export const isTeamTreaty = (t: Treaty): boolean => t.team === true || (!t.pact && t.type === 'alliance' && t.endDay - t.startDay >= 1_000_000);

export type DiplomaticAction =
  | { type: 'establish_contact'; partner: NationId }
  | { type: 'declare_war'; target: NationId }
  | { type: 'propose'; treaty: 'trade' | 'alliance' | 'nonaggression'; partner: NationId }
  /** Resposta a um convite de pacto (06/11). */
  | { type: 'answer_offer'; offerId: number; accept: boolean }
  | { type: 'request_sanctions'; partner: NationId; target: NationId }
  | { type: 'impose_sanctions'; target: NationId }
  | { type: 'lift_sanctions'; target: NationId }
  | { type: 'send_aid'; partner: NationId; pctGdp: number }
  | { type: 'set_mission'; partner: NationId; active: boolean }
  | { type: 'cancel_treaty'; treatyId: number };

export type DiscoveryMethod = 'contato' | 'terceiros' | 'teatro';

export interface WarCosts {
  usd: number;
  supplies: number;
  oil: number;
  approval: number;
}

/**
 * Eventos diplomáticos. Todos têm id sequencial e, quando são consequência de outro evento,
 * `causes` aponta para ele — a base do livro de eventos e do noticiário.
 */
export type DiplomaticEvent = { id: number; causes?: number[] } & (
  | { type: 'treaty_signed'; day: number; treaty: Treaty }
  | { type: 'proposal_rejected'; day: number; from: NationId; to: NationId; proposal: string; reasons: Factor[] }
  | { type: 'treaty_ended'; day: number; treaty: Treaty; reason: 'expired' | 'cancelled' | 'war' }
  | { type: 'aid_sent'; day: number; from: NationId; to: NationId; amountUsd: number }
  | { type: 'contact_started'; day: number; from: NationId; to: NationId; dueDay: number; costUsd: number }
  | { type: 'discovered'; day: number; by: NationId; target: NationId; via: DiscoveryMethod }
  | { type: 'war_declared'; day: number; by: NationId; target: NationId; costs: WarCosts; brokenTreaties: Treaty[]; respondingAllies: NationId[] }
  | { type: 'pact_offered'; day: number; offer: PactOffer; feeUsd: number }
  | { type: 'pact_declined'; day: number; from: NationId; to: NationId; treaty: 'alliance' | 'nonaggression'; expired?: true }
  | { type: 'pact_broken'; day: number; treaty: Treaty; breaker: NationId; indemnityUsd: number }
  | { type: 'pacts_dissolved'; day: number; nations: NationId[] }
);

type NewEvent = DiplomaticEvent extends infer E ? (E extends unknown ? Omit<E, 'id'> : never) : never;

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
  /** Ataque a infraestrutura (Fase 7): memória com o país atingido e reputação com os demais. */
  strikeVictimMemory: -4,
  strikeReputation: -1,
  missileVictimMemory: -10,
  missileReputation: -4,
  /** Lançamento nuclear: memória do atingido e reputação com todos os demais. */
  nuclearVictimMemory: -60,
  nuclearReputation: -25,
  /** Ocupação de uma região do país inimigo (Fase 8). */
  occupationVictimMemory: -12,
  occupationReputation: -3,
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
  /** Forças de dois países mobilizadas no mesmo teatro, ainda sem guerra. */
  theaterRivalry: -20,
  /** Missão de contato: prazo em dias (o custo sai do caixa: `CAIXA_DAYS.contact`). */
  contactDays: 20,
  /** Declaração de guerra: mobilização (dias de repasse pagos do caixa do país, `CAIXA_DAYS.war`), suprimentos e combustível do teatro. */
  warSupplies: 150,
  warOil: 50,
  warApproval: -3,
  /** Reputação perdida com todos os demais países e com os aliados do alvo. */
  warReputation: -8,
  warAllyMemory: -20,
  /** Aliado do alvo (governo da IA) sanciona o agressor se a relação com ele estiver abaixo disto. */
  warAllyResponseBelow: 40,
} as const;

export interface WarPreviewInput {
  actor: NationId;
  target: NationId;
  /** Um dia do repasse de referência de quem declara (`NationState.dayUsd`). */
  actorDayUsd: number;
  /** Caixa do país de quem declara (US$). */
  actorFundUsd: number;
  /** Estoque do teatro do agressor (null se o país não está no teatro). */
  theaterStock: { supplies: number; oil: number } | null;
  targetInTheater: boolean;
  known: boolean;
  atWar: boolean;
  /** Tratados conhecidos (o cliente só vê os públicos entre países que conhece). */
  treaties: Treaty[];
  isNpc: (id: NationId) => boolean;
  relationWith: (id: NationId) => number;
}

export interface WarPreview {
  costs: WarCosts;
  brokenTreaties: Treaty[];
  /** Aliados do alvo que responderiam com sanções pela regra explícita. */
  respondingAllies: NationId[];
  /** Aliados do alvo que não responderiam (relação alta ou aliança também com o agressor). */
  otherAllies: NationId[];
  /** Motivos que impedem a declaração; vazio = permitida. */
  blockers: string[];
}

/**
 * Custos e consequências de uma declaração de guerra. A mesma função valida e aplica no
 * servidor (com informação completa) e estima no cliente (só com o que o jogador conhece).
 */
export function warPreview(i: WarPreviewInput): WarPreview {
  const costs: WarCosts = {
    usd: Math.round(CAIXA_DAYS.war * i.actorDayUsd),
    supplies: DIPLO.warSupplies,
    oil: DIPLO.warOil,
    approval: DIPLO.warApproval,
  };
  const blockers: string[] = [];
  if (i.actor === i.target) blockers.push('Alvo inválido');
  if (!i.known) blockers.push('País não descoberto: sem contato, não há alvo para uma declaração de guerra');
  if (i.atWar) blockers.push('Os dois países já estão em guerra');
  if (i.actorFundUsd < costs.usd) blockers.push(`Caixa insuficiente para a mobilização: US$ ${(costs.usd / 1e6).toFixed(1).replace('.', ',')} mi necessários`);
  if (!i.theaterStock) blockers.push('Seu país não tem forças neste teatro');
  else {
    if (i.theaterStock.supplies < costs.supplies) blockers.push(`Suprimentos insuficientes no teatro: ${costs.supplies} necessários, ${Math.floor(i.theaterStock.supplies)} disponíveis`);
    if (i.theaterStock.oil < costs.oil) blockers.push(`Combustível insuficiente no teatro: ${costs.oil} necessários, ${Math.floor(i.theaterStock.oil)} disponíveis`);
  }
  const between = (t: Treaty) => (t.a === i.actor && t.b === i.target) || (t.a === i.target && t.b === i.actor);
  // aliança de time (partidas com várias nações): não se rompe com uma declaração de guerra
  if (i.treaties.some((t) => between(t) && isTeamTreaty(t))) blockers.push('Aliado de time: não é possível declarar guerra');
  else if (i.treaties.some((t) => between(t) && t.pact)) blockers.push('Há um pacto em vigor com este país (aliança ou não agressão): rompa-o antes, pagando a indenização, na aba Diplomacia');
  const brokenTreaties = i.treaties.filter((t) => between(t) && t.type !== 'sanctions');
  const allies = i.treaties
    .filter((t) => t.type === 'alliance' && (t.a === i.target || t.b === i.target))
    .map((t) => (t.a === i.target ? t.b : t.a))
    .filter((x) => x !== i.actor);
  const alliedWithActor = (x: NationId) => i.treaties.some((t) => t.type === 'alliance' && ((t.a === x && t.b === i.actor) || (t.b === x && t.a === i.actor)));
  const respondingAllies = allies.filter((x) => i.isNpc(x) && !alliedWithActor(x) && i.relationWith(x) < DIPLO.warAllyResponseBelow);
  return { costs, brokenTreaties, respondingAllies, otherAllies: allies.filter((x) => !respondingAllies.includes(x)), blockers };
}

/** Duração das alianças de time (a partida inteira). */
export const TEAM_ALLIANCE_DAYS = 1_000_000;

/** Pontuação mínima (soma dos fatores) para um governo da IA aceitar cada proposta. */
const THRESHOLDS = { trade: 5, alliance: 30, sanctions: 25 } as const;

/** Contato inicial: mesma região diplomática (regra de jogo documentada em docs/FASE2_GLOBO_GUERRA.md). */
export function initialContact(countryA: string, countryB: string): boolean {
  const a = regionOf(countryA);
  return a !== undefined && a === regionOf(countryB);
}

interface PairState {
  memory: number;
  aid: number;
  mission: number;
}

export interface DiplomacySave {
  offers?: PactOffer[];
  nextOffer?: number;
  treaties: Treaty[];
  pairs: [string, PairState][];
  missions: string[];
  cooldown: [string, number][];
  events: DiplomaticEvent[];
  nextTreaty: number;
  nextEvent: number;
  known: string[];
  pendingContacts: [string, number][];
  wars: string[];
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
  private nextEvent = 1;
  /** Contato conhecido: "a>b" = a conhece b. */
  private readonly known = new Set<string>();
  /** Missões de contato em andamento: "a>b" → dia de conclusão. */
  readonly pendingContacts = new Map<string, number>();
  private readonly wars = new Set<string>();
  /** Convites de pacto pendentes entre jogadores do teatro (06/11). */
  readonly offers: PactOffer[] = [];
  private nextOffer = 1;
  /** Partida com times: os pactos são os times (nenhum outro se firma no teatro). */
  teamMode = false;
  pactHooks: PactHooks | null = null;

  constructor(
    private readonly all: () => NationState[],
    /** Pares de países com forças no mesmo teatro de operações (os jogadores da partida). */
    private readonly theaterPairs: [NationId, NationId][],
  ) {
    // 06/11 (estilo Rise of Nations): quem divide o mapa só se conhece depois de se encontrar nele (`discover` com
    // 'teatro'); a região só dá contato inicial com os governos de fora do mapa
    const nations = all();
    for (const a of nations)
      for (const b of nations) if (a.slot !== b.slot && !this.inTheater(a.slot, b.slot) && initialContact(a.countryId, b.countryId)) this.known.add(`${a.slot}>${b.slot}`);
  }

  private emit(e: NewEvent): DiplomaticEvent {
    const ev = { ...e, id: this.nextEvent++ } as DiplomaticEvent;
    this.events.push(ev);
    return ev;
  }

  // ------------------------------------------------------------ contato e guerra

  /** `a` tem contato com `b` (pode negociar e, no teatro, declarar guerra). */
  knows(a: NationId, b: NationId): boolean {
    return a === b || this.known.has(`${a}>${b}`);
  }

  /**
   * `by` passa a conhecer `target`. Entre nações do mesmo mapa, só pelo encontro no mapa ('teatro') ou à força (times,
   * Sandbox): nem missão de contato nem notícia de tratado revelam um vizinho de mapa nunca visto.
   */
  discover(by: NationId, target: NationId, via: DiscoveryMethod, day: number, causes?: number[], force = false): void {
    if (this.knows(by, target)) return;
    if (!force && via !== 'teatro' && this.inTheater(by, target)) return;
    this.known.add(`${by}>${target}`);
    this.emit({ type: 'discovered', day, by, target, via, ...(causes ? { causes } : {}) });
  }

  inTheater(a: NationId, b: NationId): boolean {
    return this.theaterPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  warPairs(): [NationId, NationId][] {
    return [...this.wars].map((k) => k.split(':').map(Number) as [NationId, NationId]);
  }

  /**
   * Parte diplomática da declaração (o chamador já validou com `warPreview` e cobrou os custos
   * materiais). Rompe tratados, aplica reputação e as respostas dos aliados do alvo.
   */
  applyWar(actor: NationId, target: NationId, day: number, preview: WarPreview): DiplomaticEvent {
    this.wars.add(key(actor, target));
    for (const t of preview.brokenTreaties) {
      const i = this.treaties.indexOf(t);
      if (i >= 0) this.treaties.splice(i, 1);
    }
    for (const n of this.all()) if (n.slot !== actor && n.slot !== target) this.pair(actor, n.slot).memory += DIPLO.warReputation;
    for (const ally of [...preview.respondingAllies, ...preview.otherAllies]) this.pair(actor, ally).memory += DIPLO.warAllyMemory;
    const war = this.emit({
      type: 'war_declared',
      day,
      by: actor,
      target,
      costs: preview.costs,
      brokenTreaties: preview.brokenTreaties,
      respondingAllies: preview.respondingAllies,
    });
    for (const t of preview.brokenTreaties) this.emit({ type: 'treaty_ended', day, treaty: t, reason: 'war', causes: [war.id] });
    for (const ally of preview.respondingAllies) {
      const trade = this.active('trade', ally, actor);
      if (trade) this.end(trade, day, 'cancelled', null, [war.id]);
      if (!this.active('sanctions', ally, actor, true)) this.sign('sanctions', ally, actor, day, DIPLO.sanctionsDays, [war.id]);
    }
    return war;
  }

  /**
   * Consequência diplomática de um ataque aéreo ou de míssil: o país atingido guarda memória do
   * ataque e os demais registram a perda de reputação de quem atacou (decai como as demais).
   */
  recordAttack(actor: NationId, victim: NationId, kind: 'air' | 'missile' | 'occupation' | 'nuclear'): void {
    if (actor === victim) return;
    this.pair(actor, victim).memory +=
      kind === 'nuclear' ? DIPLO.nuclearVictimMemory : kind === 'missile' ? DIPLO.missileVictimMemory : kind === 'occupation' ? DIPLO.occupationVictimMemory : DIPLO.strikeVictimMemory;
    const rep = kind === 'nuclear' ? DIPLO.nuclearReputation : kind === 'missile' ? DIPLO.missileReputation : kind === 'occupation' ? DIPLO.occupationReputation : DIPLO.strikeReputation;
    for (const n of this.all()) if (n.slot !== actor && n.slot !== victim) this.pair(actor, n.slot).memory += rep;
  }

  /** Favor ou desfeita pontual (pedidos das potências): soma à memória da relação, que decai. */
  adjustRelation(a: NationId, b: NationId, delta: number): void {
    if (a !== b) this.pair(a, b).memory += delta;
  }

  drainEvents(): DiplomaticEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Estado completo (JSON) para salvar a partida. */
  toSave(): DiplomacySave {
    return JSON.parse(
      JSON.stringify({
        treaties: this.treaties,
        pairs: [...this.pairs],
        missions: [...this.missions],
        cooldown: [...this.cooldown],
        events: this.events,
        nextTreaty: this.nextTreaty,
        nextEvent: this.nextEvent,
        known: [...this.known],
        pendingContacts: [...this.pendingContacts],
        wars: [...this.wars],
        offers: this.offers,
        nextOffer: this.nextOffer,
      }),
    ) as DiplomacySave;
  }

  load(s: DiplomacySave): void {
    const c = JSON.parse(JSON.stringify(s)) as DiplomacySave;
    this.treaties.splice(0, this.treaties.length, ...c.treaties);
    this.pairs.clear();
    for (const [k, v] of c.pairs) this.pairs.set(k, v);
    this.missions.clear();
    for (const m of c.missions) this.missions.add(m);
    this.cooldown.clear();
    for (const [k, v] of c.cooldown) this.cooldown.set(k, v);
    this.events = c.events;
    this.nextTreaty = c.nextTreaty;
    this.nextEvent = c.nextEvent;
    this.known.clear();
    for (const k of c.known) this.known.add(k);
    this.pendingContacts.clear();
    for (const [k, v] of c.pendingContacts) this.pendingContacts.set(k, v);
    this.wars.clear();
    for (const k of c.wars) this.wars.add(k);
    this.offers.splice(0, this.offers.length, ...(c.offers ?? []));
    this.nextOffer = c.nextOffer ?? 1;
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
    return this.wars.has(key(a, b));
  }

  active(type: TreatyType, a: NationId, b: NationId, directed = false): Treaty | undefined {
    return this.treaties.find((t) => t.type === type && ((t.a === a && t.b === b) || (!directed && t.a === b && t.b === a)));
  }

  /** Fatores que compõem a relação entre dois países. */
  factors(a: NationId, b: NationId): Factor[] {
    const p = this.pair(a, b);
    const out: Factor[] = [];
    if (this.atWar(a, b)) out.push({ key: 'conflict', label: 'Em guerra', value: DIPLO.conflictBase });
    else if (this.inTheater(a, b)) out.push({ key: 'rivalry', label: 'Forças rivais no mesmo teatro de operações', value: DIPLO.theaterRivalry });
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
    if (Math.abs(p.memory) >= 0.05) out.push({ key: 'memory', label: 'Histórico recente (acordos rompidos, guerras declaradas)', value: round1(p.memory) });
    return out;
  }

  relation(a: NationId, b: NationId): number {
    return clamp(
      this.factors(a, b).reduce((s, f) => s + f.value, 0),
      -100,
      100,
    );
  }

  /** Relações do país `viewer` com os países que ele conhece. */
  relationsOf(viewer: NationId): RelationView[] {
    const out: RelationView[] = [];
    for (const n of this.all())
      if (n.slot !== viewer && this.knows(viewer, n.slot)) out.push({ a: viewer, b: n.slot, value: round1(this.relation(viewer, n.slot)), factors: this.factors(viewer, n.slot) });
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
    c += this.treaties.filter((t) => t.type === 'alliance' && !t.pact && !isTeamTreaty(t) && (t.a === id || t.b === id)).length * DIPLO.allianceCostPct;
    return c;
  }

  /** Ajuda militar (suprimentos/s) enviada por aliados ao teatro do jogador. */
  allianceAid(id: NationId, gdpForTheater: (n: NationState) => number): number {
    let aid = 0;
    for (const t of this.treaties) {
      if (t.type !== 'alliance' || t.pact || isTeamTreaty(t) || (t.a !== id && t.b !== id)) continue;
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
      const enemies = this.warPairs()
        .filter(([x, y]) => x === proposer || y === proposer)
        .map(([x, y]) => (x === proposer ? y : x));
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
    const unknown = (id: NationId) => (this.knows(actor, id) ? null : 'País não descoberto: estabeleça contato antes');
    switch (action.type) {
      case 'establish_contact': {
        const other = target(action.partner);
        if (!other) return 'País inválido';
        if (this.knows(actor, other.slot)) return 'Já há contato com este país';
        if (this.inTheater(actor, other.slot)) return 'Nação do mesmo mapa: o contato só vem do encontro no mapa (uma unidade sua precisa avistar o território ou as forças dela)';
        const k = `${actor}>${other.slot}`;
        if (this.pendingContacts.has(k)) return 'Missão de contato já em andamento';
        const cost = CAIXA_DAYS.contact * me.dayUsd;
        if (me.works.fundUsd < cost) return 'Caixa insuficiente para a missão de contato';
        me.works.fundUsd -= cost;
        const due = day + DIPLO.contactDays;
        this.pendingContacts.set(k, due);
        this.emit({ type: 'contact_started', day, from: actor, to: other.slot, dueDay: due, costUsd: Math.round(cost) });
        return null;
      }
      case 'declare_war':
        return 'Declarações de guerra passam pela simulação nacional';
      case 'propose': {
        const other = target(action.partner);
        if (!other) return 'País inválido';
        if (action.treaty === 'nonaggression' || (action.treaty === 'alliance' && !isNpc(other.slot) && this.inTheater(actor, other.slot))) return this.proposePact(actor, other.slot, action.treaty, day);
        if (unknown(other.slot)) return unknown(other.slot);
        if (this.atWar(actor, other.slot)) return 'Não há acordos com um adversário em guerra';
        if (this.active(action.treaty, actor, other.slot)) return 'Acordo já vigente';
        if (!isNpc(other.slot)) return 'Propostas a outros jogadores ainda não são suportadas';
        const ck = `${actor}>${other.slot}:${action.treaty}`;
        if ((this.cooldown.get(ck) ?? -Infinity) > day) return `Proposta recusada recentemente; aguarde até o dia ${this.cooldown.get(ck)}`;
        if (action.treaty !== 'trade' && action.treaty !== 'alliance') return 'Proposta inválida';
        const ev = this.evaluate(actor, other.slot, action.treaty);
        if (!ev.accept) {
          this.cooldown.set(ck, day + DIPLO.rejectCooldownDays);
          this.emit({ type: 'proposal_rejected', day, from: actor, to: other.slot, proposal: action.treaty, reasons: ev.reasons });
          return null;
        }
        this.sign(action.treaty, actor, other.slot, day, action.treaty === 'trade' ? DIPLO.tradeDays : DIPLO.allianceDays);
        return null;
      }
      case 'request_sanctions': {
        const partner = target(action.partner);
        const victim = this.nation(action.target);
        if (!partner || !victim || victim.slot === partner.slot) return 'País inválido';
        if (unknown(partner.slot) ?? unknown(victim.slot)) return unknown(partner.slot) ?? unknown(victim.slot);
        if (!isNpc(partner.slot)) return 'Só governos da IA podem ser solicitados';
        if (!this.knows(partner.slot, victim.slot)) return 'O governo consultado não tem contato com o país-alvo';
        if (this.active('sanctions', partner.slot, victim.slot, true)) return 'Sanções já vigentes';
        const ck = `${actor}>${partner.slot}:sanctions:${victim.slot}`;
        if ((this.cooldown.get(ck) ?? -Infinity) > day) return `Pedido recusado recentemente; aguarde até o dia ${this.cooldown.get(ck)}`;
        const ev = this.evaluate(actor, partner.slot, 'sanctions', victim.slot);
        if (!ev.accept) {
          this.cooldown.set(ck, day + DIPLO.rejectCooldownDays);
          this.emit({ type: 'proposal_rejected', day, from: actor, to: partner.slot, proposal: 'sanctions', reasons: ev.reasons });
          return null;
        }
        this.sign('sanctions', partner.slot, victim.slot, day, DIPLO.sanctionsDays);
        return null;
      }
      case 'impose_sanctions': {
        const victim = target(action.target);
        if (!victim) return 'País inválido';
        if (unknown(victim.slot)) return unknown(victim.slot);
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
        if (unknown(other.slot)) return unknown(other.slot);
        if (this.atWar(actor, other.slot)) return 'Não é possível enviar ajuda a um adversário em guerra';
        const pct = clamp(action.pctGdp, 0.01, 0.5);
        const amount = pct * CAIXA_DAYS.aidPerPctGdp * me.dayUsd;
        if (me.works.fundUsd < amount) return 'Caixa insuficiente para a ajuda';
        me.works.fundUsd -= amount; // sai do caixa do país
        const p = this.pair(actor, other.slot);
        p.aid = Math.min(DIPLO.aidCap, p.aid + DIPLO.aidRelationPer01Pct * (pct / 0.1));
        this.emit({ type: 'aid_sent', day, from: actor, to: other.slot, amountUsd: Math.round(amount) });
        return null;
      }
      case 'set_mission': {
        const other = target(action.partner);
        if (!other) return 'País inválido';
        if (action.active && unknown(other.slot)) return unknown(other.slot);
        const k = `${actor}>${other.slot}`;
        if (action.active) this.missions.add(k);
        else this.missions.delete(k);
        return null;
      }
      case 'answer_offer':
        return this.answerOffer(actor, action.offerId, action.accept, day);
      case 'cancel_treaty': {
        const t = this.treaties.find((x) => x.id === action.treatyId && (x.a === actor || x.b === actor));
        if (!t) return 'Tratado inválido';
        if (isTeamTreaty(t)) return 'Aliança de time: não pode ser rompida';
        if (t.pact) return this.breakPact(actor, t, day);
        if (t.type === 'sanctions' && t.a !== actor) return 'Só quem aplica sanções pode retirá-las';
        this.end(t, day, 'cancelled', t.type === 'sanctions' ? null : actor);
        return null;
      }
    }
  }

  /** Times da partida (lote 4): aliança desde o primeiro dia, por toda a partida, e contato mútuo. */
  teamAlliance(a: NationId, b: NationId, day: number): void {
    this.discover(a, b, 'contato', day, undefined, true);
    this.discover(b, a, 'contato', day, undefined, true);
    if (!this.active('alliance', a, b)) {
      this.sign('alliance', a, b, day, TEAM_ALLIANCE_DAYS);
      const t = this.treaties[this.treaties.length - 1]!;
      t.team = true;
    }
  }

  // ------------------------------------------------------------ pactos no teatro (06/11)

  /** Custo de firmar (pago por quem propõe) e indenização ao romper (paga por quem rompe), em US$. */
  pactFeeUsd(payer: NationId, treaty: 'alliance' | 'nonaggression'): number {
    return Math.round((this.pactHooks?.dayUsd(payer) ?? 0) * (treaty === 'alliance' ? PACT.allianceFeeDays : PACT.napFeeDays));
  }

  pactIndemnityUsd(breaker: NationId, treaty: 'alliance' | 'nonaggression'): number {
    return Math.round((this.pactHooks?.dayUsd(breaker) ?? 0) * (treaty === 'alliance' ? PACT.allianceIndemnityDays : PACT.napIndemnityDays));
  }

  /** Pacto em vigor entre duas nações do teatro (o de time conta como aliança). */
  pactBetween(a: NationId, b: NationId): Treaty | undefined {
    return this.treaties.find((t) => ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && (t.pact || isTeamTreaty(t)));
  }

  private proposePact(actor: NationId, other: NationId, treaty: 'alliance' | 'nonaggression', day: number): string | null {
    const h = this.pactHooks;
    if (!h || !this.inTheater(actor, other)) return 'Pactos só entre nações do mesmo teatro de operações';
    if (!this.knows(actor, other)) return 'Sem contato: encontre essa nação no mapa antes';
    if (this.teamMode) return 'Partida com times: as alianças são os times definidos na sala';
    const cur = this.pactBetween(actor, other);
    if (cur && (cur.type === treaty || cur.type === 'alliance')) return cur.type === 'alliance' ? 'Já são aliados' : 'Pacto de não agressão já em vigor';
    if (this.offers.some((o) => o.from === actor && o.to === other)) return 'Já há um convite seu esperando resposta deste país';
    const fee = this.pactFeeUsd(actor, treaty);
    if (h.fund(actor) + 1e-6 < fee) return `Caixa insuficiente para firmar o ${PACT_LABEL[treaty]}: US$ ${(fee / 1e6).toFixed(1).replace('.', ',')} mi`;
    if (h.isBot(other)) {
      const ck = `${actor}>${other}:${treaty}`;
      if ((this.cooldown.get(ck) ?? -Infinity) > day) return `Proposta recusada recentemente; aguarde até o dia ${this.cooldown.get(ck)}`;
      const ev = this.evaluatePact(actor, other, treaty);
      if (!ev.accept) {
        this.cooldown.set(ck, day + PACT.rejectDays);
        this.emit({ type: 'proposal_rejected', day, from: actor, to: other, proposal: treaty, reasons: ev.reasons });
        return null;
      }
      this.signPact(actor, other, treaty, day);
      return null;
    }
    const offer: PactOffer = { id: this.nextOffer++, from: actor, to: other, treaty, day, expiresDay: day + PACT.offerDays };
    this.offers.push(offer);
    this.emit({ type: 'pact_offered', day, offer, feeUsd: fee });
    return null;
  }

  private answerOffer(actor: NationId, offerId: number, accept: boolean, day: number): string | null {
    // KAC: só quem recebeu o convite responde (o dono vem da conexão)
    const i = this.offers.findIndex((o) => o.id === offerId && o.to === actor);
    if (i < 0) return 'Convite inválido ou já respondido';
    const o = this.offers[i]!;
    this.offers.splice(i, 1);
    if (!accept) {
      this.emit({ type: 'pact_declined', day, from: o.from, to: o.to, treaty: o.treaty });
      return null;
    }
    const fee = this.pactFeeUsd(o.from, o.treaty);
    if ((this.pactHooks?.fund(o.from) ?? 0) + 1e-6 < fee) return `${'O país que propôs'} não tem mais caixa para firmar o ${PACT_LABEL[o.treaty]}`;
    const cur = this.pactBetween(o.from, o.to);
    if (cur && (cur.type === o.treaty || cur.type === 'alliance')) return 'Esse pacto já está em vigor';
    this.signPact(o.from, o.to, o.treaty, day);
    return null;
  }

  /** Firma: cobra quem propôs, faz a paz se havia guerra, troca não agressão por aliança e liga o pacto no teatro. */
  private signPact(from: NationId, to: NationId, treaty: 'alliance' | 'nonaggression', day: number): void {
    const h = this.pactHooks!;
    const fee = this.pactFeeUsd(from, treaty);
    if (fee > 0) h.pay(from, null, fee, `${treaty === 'alliance' ? 'Aliança' : 'Pacto de não agressão'} firmado`);
    if (this.wars.delete(key(from, to))) h.setPeace(from, to);
    const old = this.pactBetween(from, to);
    if (old) this.treaties.splice(this.treaties.indexOf(old), 1);
    this.sign(treaty, from, to, day, TEAM_ALLIANCE_DAYS);
    this.treaties[this.treaties.length - 1]!.pact = true;
    for (let k = this.offers.length - 1; k >= 0; k--) {
      const o = this.offers[k]!;
      if ((o.from === from && o.to === to) || (o.from === to && o.to === from)) this.offers.splice(k, 1);
    }
    h.setPact(from, to, treaty);
  }

  /** Rompe: quem rompe paga a indenização à outra parte; sem caixa para ela, não rompe. */
  private breakPact(actor: NationId, t: Treaty, day: number): string | null {
    const h = this.pactHooks;
    if (!h) return 'Indisponível';
    const kind = t.type === 'alliance' ? 'alliance' : 'nonaggression';
    const other = t.a === actor ? t.b : t.a;
    const usd = this.pactIndemnityUsd(actor, kind);
    if (h.fund(actor) + 1e-6 < usd) return `Caixa insuficiente para a indenização: US$ ${(usd / 1e6).toFixed(1).replace('.', ',')} mi`;
    if (usd > 0) h.pay(actor, other, usd, `Indenização por romper ${kind === 'alliance' ? 'a aliança' : 'o pacto de não agressão'}`);
    this.end(t, day, 'cancelled', actor);
    this.emit({ type: 'pact_broken', day, treaty: t, breaker: actor, indemnityUsd: usd });
    h.setPact(t.a, t.b, null);
    return null;
  }

  /**
   * Só sobraram nações com pacto entre si (partida sem times): os pactos caem sem indenização e a guerra volta entre
   * todas, para a partida ter um vencedor.
   */
  dissolvePacts(nations: NationId[], day: number): void {
    const h = this.pactHooks;
    for (const t of [...this.treaties]) {
      if (!t.pact || !nations.includes(t.a) || !nations.includes(t.b)) continue;
      this.end(t, day, 'cancelled', null);
      h?.setPact(t.a, t.b, null);
    }
    for (let i = 0; i < nations.length; i++) for (let j = i + 1; j < nations.length; j++) this.wars.add(key(nations[i]!, nations[j]!));
    this.emit({ type: 'pacts_dissolved', day, nations: [...nations] });
  }

  /**
   * Avaliação de um bot do teatro: relação, quem está mais forte, inimigos em comum e guerra em curso. Não agressão é
   * fácil de aceitar quando o bot não tem vantagem; aliança pede relação boa ou um inimigo em comum.
   */
  evaluatePact(proposer: NationId, bot: NationId, treaty: 'alliance' | 'nonaggression'): { accept: boolean; reasons: Factor[] } {
    const h = this.pactHooks!;
    // a rivalidade de quem divide o teatro e o rancor da guerra pesam no máximo −15 (senão nenhum bot aceitaria nada)
    const rel = this.relation(proposer, bot);
    const reasons: Factor[] = [{ key: 'relation', label: 'Relação atual', value: round1(Math.max(rel, -15)) }];
    const mine = h.strength(bot);
    const theirs = h.strength(proposer);
    if (mine > theirs * 1.5 + 2) reasons.push({ key: 'stronger', label: 'Está mais forte no teatro', value: -20 });
    else if (theirs > mine * 1.5 + 2) reasons.push({ key: 'weaker', label: 'Está mais fraco no teatro', value: 15 });
    const enemiesOf = (id: NationId) => this.warPairs().filter(([x, y]) => x === id || y === id).map(([x, y]) => (x === id ? y : x));
    const common = enemiesOf(bot).filter((e) => e !== proposer && enemiesOf(proposer).includes(e));
    if (common.length) reasons.push({ key: 'common_enemy', label: 'Inimigo em comum', value: 35 });
    if (this.atWar(proposer, bot)) reasons.push({ key: 'war', label: 'Guerra em curso entre os dois', value: treaty === 'alliance' ? -25 : 5 });
    reasons.push({ key: 'base', label: treaty === 'alliance' ? 'Compromisso de defesa' : 'Fronteira tranquila', value: treaty === 'alliance' ? -5 : 20 });
    const total = reasons.reduce((s, r) => s + r.value, 0);
    return { accept: total >= (treaty === 'alliance' ? 15 : 0), reasons };
  }

  private sign(type: TreatyType, a: NationId, b: NationId, day: number, duration: number, causes?: number[]): void {
    const treaty: Treaty = { id: this.nextTreaty++, type, a, b, startDay: day, endDay: day + duration };
    this.treaties.push(treaty);
    const ev = this.emit({ type: 'treaty_signed', day, treaty, ...(causes ? { causes } : {}) });
    // tratados são públicos: quem conhece uma das partes passa a conhecer a outra pela notícia
    for (const n of this.all()) {
      if (this.knows(n.slot, a) && !this.knows(n.slot, b)) this.discover(n.slot, b, 'terceiros', day, [ev.id]);
      else if (this.knows(n.slot, b) && !this.knows(n.slot, a)) this.discover(n.slot, a, 'terceiros', day, [ev.id]);
    }
  }

  /** Encerra um tratado. Romper antes do prazo (breaker ≠ null) custa relação e reputação. */
  private end(t: Treaty, day: number, reason: 'expired' | 'cancelled', breaker: NationId | null, causes?: number[]): void {
    const i = this.treaties.indexOf(t);
    if (i >= 0) this.treaties.splice(i, 1);
    if (reason === 'cancelled' && breaker !== null) {
      const other = t.a === breaker ? t.b : t.a;
      this.pair(breaker, other).memory += DIPLO.brokenTreatyPartner;
      for (const n of this.all()) if (n.slot !== breaker && n.slot !== other) this.pair(breaker, n.slot).memory += DIPLO.brokenTreatyReputation;
    }
    this.emit({ type: 'treaty_ended', day, treaty: t, reason, ...(causes ? { causes } : {}) });
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
    for (let k = this.offers.length - 1; k >= 0; k--) {
      const o = this.offers[k]!;
      if (day < o.expiresDay) continue;
      this.offers.splice(k, 1);
      this.emit({ type: 'pact_declined', day, from: o.from, to: o.to, treaty: o.treaty, expired: true });
    }
    // missões de contato concluídas: contato mútuo
    for (const [k, due] of [...this.pendingContacts]) {
      if (day < due) continue;
      this.pendingContacts.delete(k);
      const [from, to] = k.split('>').map(Number) as [NationId, NationId];
      this.discover(from, to, 'contato', day);
      this.discover(to, from, 'contato', day);
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
