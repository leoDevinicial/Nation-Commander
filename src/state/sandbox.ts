import { MILITARY_RESEARCH_IDS } from '../../shared/sim/config.ts';
import { TECHNOLOGIES, type TechId } from '../../shared/strategic/technologies.ts';
import { useAppStore } from './useAppStore.ts';

/**
 * Modo Sandbox no cliente: o servidor libera tudo (pesquisas, verba, população) para o jogador;
 * estas funções aplicam as mesmas regras nos cálculos da interface, para os botões não aparecerem
 * bloqueados por algo que o servidor não exige.
 */
export function isSandboxMatch(): boolean {
  return useAppStore.getState().match?.mode === 'sandbox';
}

const ALL_TECHS: readonly TechId[] = Object.keys(TECHNOLOGIES) as TechId[];

export function effectiveTechs<T extends readonly string[] | null>(done: T): T | readonly TechId[] {
  return isSandboxMatch() ? ALL_TECHS : done;
}

export function effectiveMilitaryResearch(done: readonly string[]): readonly string[] {
  return isSandboxMatch() ? MILITARY_RESEARCH_IDS : done;
}

export function effectiveFund(fund: number | null): number | null {
  return isSandboxMatch() ? 1e15 : fund;
}

export function effectivePopCap(cap: number): number {
  return isSandboxMatch() ? Infinity : cap;
}

export function effectiveStability(stability: number | null): number | null {
  return isSandboxMatch() ? 100 : stability;
}
