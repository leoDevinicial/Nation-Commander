import type { Slot } from '../sim/types.ts';
import { spendPct, type Budget, type NationalSimulation } from './NationalSimulation.ts';
import { researchBlocker, TECH_IDS, type TechId } from './technologies.ts';
import type { DiplomaticAction } from './Diplomacy.ts';

/** Ordem de pesquisa da IA: primeiro o que ajuda no teatro, depois a economia. */
const AI_RESEARCH_ORDER: TechId[] = [
  'logistics',
  'agricultural_mechanization',
  'territorial_administration',
  'mechanized_extraction',
  'rapid_training',
  'digital_comms',
  'composite_armor',
  'guided_munitions',
  'advanced_drilling',
  'modular_construction',
  'sensor_optics',
  'automation',
  'efficient_propulsion',
];

/**
 * Governo controlado pela IA. Revisa o orçamento uma vez por mês com regras explícitas e
 * limitadas — nada de recursos ocultos: usa os mesmos comandos do jogador.
 */
export class NationalAI {
  constructor(readonly slot: Slot) {}

  /** Retorna o orçamento a aplicar (ou null para manter) e a pesquisa desejada. */
  think(sim: NationalSimulation): { budget: Budget | null; research: TechId | null | undefined; diplomacy: DiplomaticAction[] } {
    const n = sim.nation(this.slot);
    if (!n) return { budget: null, research: undefined, diplomacy: [] };
    const b: Budget = { ...n.budget };
    const ref = n.referenceBudget;
    let changed = false;

    // déficit muito acima do de referência: corta despesas discricionárias e sobe impostos
    if (n.deficitPctGdp > Math.max(3, n.base.deficitPctGdp) + 2) {
      b.socialPct = Math.max(ref.socialPct * 0.9, b.socialPct - 0.3);
      b.infrastructurePct = Math.max(ref.infrastructurePct * 0.8, b.infrastructurePct - 0.2);
      if (n.approval > 45) b.taxPct += 0.3;
      changed = true;
    }
    // aprovação baixa: recompõe serviços sociais e alivia impostos
    if (n.approval < 40) {
      b.socialPct = Math.min(ref.socialPct * 1.2, b.socialPct + 0.3);
      b.taxPct = Math.max(ref.taxPct - 1, b.taxPct - 0.2);
      changed = true;
    }
    // sob pressão militar com folga fiscal: reforça a defesa gradualmente
    const casualties = n.casualties30d.reduce((a, c) => a + c, 0);
    if (casualties >= 5 && n.deficitPctGdp < n.base.deficitPctGdp + 3 && b.defensePct < ref.defensePct * 2) {
      b.defensePct += 0.2;
      changed = true;
    }
    // pesquisa: garante um mínimo de investimento
    if (b.researchPct < 0.3 && spendPct(b) < spendPct(ref) + 1) {
      b.researchPct = 0.3;
      changed = true;
    }

    let research: TechId | null | undefined;
    if (!n.research.current) {
      // a primeira da lista cujos pré-requisitos já estão prontos (mesma regra do jogador)
      const ready = (t: TechId) => researchBlocker(t, n.research.done) === null;
      research = AI_RESEARCH_ORDER.find(ready) ?? TECH_IDS.find(ready) ?? null;
    }
    return { budget: changed ? b : null, research, diplomacy: this.diplomacy(sim) };
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
