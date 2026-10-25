import type { Slot } from '../sim/types.ts';
import { spendPct, type Budget, type NationalSimulation } from './NationalSimulation.ts';
import { TECH_IDS, type TechId } from './technologies.ts';

/** Ordem de pesquisa da IA: primeiro o que ajuda no teatro, depois a economia. */
const AI_RESEARCH_ORDER: TechId[] = ['logistics', 'rapid_training', 'guided_munitions', 'composite_armor', 'modular_construction', 'automation'];

/**
 * Governo controlado pela IA. Revisa o orçamento uma vez por mês com regras explícitas e
 * limitadas — nada de recursos ocultos: usa os mesmos comandos do jogador.
 */
export class NationalAI {
  constructor(readonly slot: Slot) {}

  /** Retorna o orçamento a aplicar (ou null para manter) e a pesquisa desejada. */
  think(sim: NationalSimulation): { budget: Budget | null; research: TechId | null | undefined } {
    const n = sim.nation(this.slot);
    if (!n) return { budget: null, research: undefined };
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
      research = AI_RESEARCH_ORDER.find((t) => !n.research.done.includes(t)) ?? TECH_IDS.find((t) => !n.research.done.includes(t)) ?? null;
    }
    return { budget: changed ? b : null, research };
  }
}
