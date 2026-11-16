import type { Slot } from '../sim/types.ts';
import type { NationalSimulation } from './NationalSimulation.ts';
import { AREA_LIMITS, DEFAULT_AREAS, type Areas } from './areas.ts';
import { researchBlocker, techKnowledge, TECH_IDS, type TechId } from './technologies.ts';

/** Conhecimento que a IA não gasta na pesquisa nacional (fica para as pesquisas militares do teatro). */
const AI_KNOWLEDGE_RESERVE = 20;
import type { DiplomaticAction } from './Diplomacy.ts';
import type { DecreeId } from './policies.ts';
import { INFRA_GATE_MIN } from '../sim/upgrades.ts';

/** Ordem de pesquisa da IA: primeiro o que ajuda no teatro, depois a economia. */
const AI_RESEARCH_ORDER: TechId[] = [
  'logistics',
  // 03/11: a eólica cedo (o carvão das térmicas acaba); depois o que a IA tática constrói no meio da partida
  'wind_power',
  'agricultural_mechanization',
  'territorial_administration',
  'mechanized_extraction',
  'foreign_trade',
  'urban_planning',
  'air_defense',
  'rapid_training',
  'steelmaking',
  'oil_refining',
  'public_security',
  'public_health',
  'digital_comms',
  'naval_logistics',
  'naval_warfare',
  'road_engineering',
  'higher_education',
  'composite_armor',
  'military_aviation',
  'guided_munitions',
  'advanced_drilling',
  'modular_construction',
  'solar_power',
  'sensor_optics',
  'automation',
  'efficient_propulsion',
  'nuclear_power',
  'financial_markets',
];

/**
 * Governo controlado pela IA. Revisa o orçamento uma vez por mês com regras explícitas e
 * limitadas — nada de recursos ocultos: usa os mesmos comandos do jogador.
 */
/** Com a força aérea e os mísseis na dificuldade: munição guiada e mísseis vêm primeiro. */
const AI_MILITARY_FIRST: TechId[] = ['logistics', 'digital_comms', 'military_aviation', 'guided_munitions', 'ballistic_missiles'];

/** Arquipélago (03/11): Porto (Logística naval) e escolta (Guerra naval) logo no começo. */
const AI_NAVAL_FIRST: TechId[] = ['naval_logistics', 'logistics', 'wind_power', 'naval_warfare'];

/** Dia (1 dia = 1 s de partida) a partir do qual o governo da IA puxa o índice de infraestrutura. */
export const AI_INFRA_FROM_DAY = 720;

export class NationalAI {
  constructor(
    readonly slot: Slot,
    /** Prioriza as pesquisas que liberam ataques aéreos e mísseis (dificuldade Difícil ou Brutal). */
    private readonly militaryFirst = false,
    /**
     * Orçamento de defesa desejado, em múltiplos do de referência (dificuldade): a defesa rende os suprimentos do
     * teatro. Sobe 0,2 ponto por mês, só com o déficit sob controle.
     */
    private readonly defenseMul = 1,
    /** Mapa em ilhas (Arquipélago): sem Porto não há como chegar ao inimigo, então a marinha vem cedo. */
    private readonly naval = false,
  ) {}

  /** Defesa que a IA busca com folga no caixa (dificuldade): Fácil e Normal 100%, Difícil 150%, Brutal 200%+. */
  get defenseTarget(): number {
    return Math.round(100 * this.defenseMul);
  }

  /** Teto da defesa da IA (sob ataque sobe até aqui): 150% ou a da dificuldade, o que for maior. */
  get defenseMax(): number {
    return Math.max(AREA_LIMITS[1], this.defenseTarget);
  }

  /**
   * Retorna as áreas do orçamento a aplicar (ou null para manter) e a pesquisa desejada. 16/11: as mesmas regras do
   * jogador, sobre o caixa do país do mapa (não há mais déficit fictício): com o caixa apertado ou cortes, alivia
   * Assistência, Segurança e Pesquisa; com folga, sobe a Defesa até a da dificuldade, a Infraestrutura até o índice
   * passar a exigência do QG alto e a Assistência quando a aprovação cai.
   */
  think(sim: NationalSimulation): { areas: Areas | null; research: TechId | null | undefined; diplomacy: DiplomaticAction[]; decrees: { id: DecreeId; active: boolean }[] } {
    const n = sim.nation(this.slot);
    if (!n) return { areas: null, research: undefined, diplomacy: [], decrees: [] };
    const a: Areas = { ...DEFAULT_AREAS, ...n.areas };
    const before = JSON.stringify(a);
    const step = (k: keyof Areas, d: number, min: number, max: number) => (a[k] = Math.max(min, Math.min(max, a[k] + d)));
    const today = n.works.today;
    const spend = today ? today.expense.reduce((x, l) => x + l.usd, 0) : 0;
    const net = today?.net ?? 0;
    // aperto: o dia não fecha e o caixa dura menos de 2 minutos, ou o orçamento já está sendo cortado
    const tight = !!n.areasCut || (net < 0 && n.works.fundUsd < -net * 120);
    // folga: o dia rende ou o caixa paga uns 5 minutos de despesas
    const comfy = !tight && (net > 0 || n.works.fundUsd > spend * 300);
    const infraLow = sim.day >= AI_INFRA_FROM_DAY && n.infrastructureIndex < INFRA_GATE_MIN + 0.05;
    if (tight) {
      step('social', -10, 80, 150);
      step('security', -10, 80, 150);
      step('research', -10, 80, 150);
      if (!infraLow) step('infrastructure', -10, 90, 150);
      if (a.defense > 100) step('defense', -10, 100, this.defenseMax);
    } else if (comfy) {
      if (a.defense < this.defenseTarget) step('defense', 10, 50, this.defenseTarget);
      if (infraLow) step('infrastructure', 10, 50, 140);
      else if (n.infrastructureIndex > INFRA_GATE_MIN + 0.1 && a.infrastructure > 110) step('infrastructure', -10, 110, 150);
      if (n.approval < 45) step('social', 10, 50, 130);
      if (a.research < 100) step('research', 10, 50, 100);
    }
    // aprovação baixa: Assistência mesmo sem folga (a queda de governo custa mais que o caixa)
    if (n.approval < 35 && !tight) step('social', 10, 50, 130);
    // sob pressão militar: defesa primeiro
    const casualties = n.casualties30d.reduce((x, c) => x + c, 0);
    if (casualties >= 5 && !tight) step('defense', 10, 50, this.defenseMax);
    const areas = JSON.stringify(a) !== before ? a : null;

    let research: TechId | null | undefined;
    if (!n.research.current) {
      // a primeira da lista cujos pré-requisitos já estão prontos (mesma regra do jogador)
      // 02/11: a pesquisa nacional custa conhecimento; a IA guarda uma reserva para as pesquisas militares do teatro
      const kp = sim.theaterKnowledge(n.slot);
      const era = sim.theaterEra(n.slot);
      const ready = (t: TechId) =>
        researchBlocker(t, n.research.done, era !== null ? { era } : {}) === null &&
        (kp === null || (n.research.kpPaid ?? []).includes(t) || kp >= techKnowledge(t) + AI_KNOWLEDGE_RESERVE);
      research = (this.naval ? AI_NAVAL_FIRST.find(ready) : undefined) ?? (this.militaryFirst ? AI_MILITARY_FIRST.find(ready) : undefined) ?? AI_RESEARCH_ORDER.find(ready) ?? TECH_IDS.find(ready) ?? null;
    }
    return { areas, research, diplomacy: this.diplomacy(sim), decrees: this.decrees(sim, n) };
  }

  /**
   * Decretos pela mesma regra do jogador: em guerra, economia de guerra e (com aprovação folgada)
   * alistamento; lei marcial se a estabilidade desabar. Com a aprovação baixa, revoga o que pesa nela.
   */
  private decrees(sim: NationalSimulation, n: NonNullable<ReturnType<NationalSimulation['nation']>>): { id: DecreeId; active: boolean }[] {
    const on = new Set((n.policies?.decrees ?? []).map((d) => d.id));
    const out: { id: DecreeId; active: boolean }[] = [];
    const atWar = sim.nations.some((x) => x.slot !== this.slot && sim.diplomacy.atWar(this.slot, x.slot));
    if (atWar && !on.has('war_economy')) out.push({ id: 'war_economy', active: true });
    if (atWar && !on.has('conscription') && n.approval > 52) out.push({ id: 'conscription', active: true });
    if (!on.has('martial_law') && n.stability < 25) out.push({ id: 'martial_law', active: true });
    if (n.approval < 35) for (const id of ['conscription', 'rationing'] as const) if (on.has(id)) out.push({ id, active: false });
    if (on.has('martial_law') && n.stability > 45) out.push({ id: 'martial_law', active: false });
    if (on.has('war_economy') && !atWar) out.push({ id: 'war_economy', active: false });
    return out;
  }

  /**
   * Política externa, sob as mesmas regras de informação do jogador: só negocia com quem conhece
   * e abre missões de contato (com custo e prazo) para os demais. Comércio com todos que
   * aceitarem, missões com as três maiores economias conhecidas, aliança quando a relação
   * permitir e pedidos de sanção contra quem está em guerra com ela.
   */
  private diplomacy(sim: NationalSimulation): DiplomaticAction[] {
    const d = sim.diplomacy;
    const me = this.slot;
    const out: DiplomaticAction[] = [];
    const npcs = [...sim.npcs].sort((a, b) => b.gdpUsd - a.gdpUsd || a.slot - b.slot);
    const known = npcs.filter((n) => d.knows(me, n.slot));
    const pending = [...d.pendingContacts.keys()].filter((k) => k.startsWith(`${me}>`)).length;
    for (const n of npcs.filter((x) => !d.knows(me, x.slot) && !d.pendingContacts.has(`${me}>${x.slot}`)).slice(0, Math.max(0, 2 - pending))) {
      out.push({ type: 'establish_contact', partner: n.slot });
    }
    const enemies = sim.nations.filter((x) => x.slot !== me && d.atWar(me, x.slot));
    for (const [i, npc] of known.entries()) {
      if (i < 3 && !d.missions.has(`${me}>${npc.slot}`)) out.push({ type: 'set_mission', partner: npc.slot, active: true });
      if (!d.active('trade', me, npc.slot)) out.push({ type: 'propose', treaty: 'trade', partner: npc.slot });
      const rel = d.relation(me, npc.slot);
      if (rel >= 55 && !d.active('alliance', me, npc.slot)) out.push({ type: 'propose', treaty: 'alliance', partner: npc.slot });
      if (rel >= 45) for (const e of enemies) if (d.knows(npc.slot, e.slot) && !d.active('sanctions', npc.slot, e.slot, true)) out.push({ type: 'request_sanctions', partner: npc.slot, target: e.slot });
    }
    return out;
  }
}
