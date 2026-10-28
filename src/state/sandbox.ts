import { MILITARY_RESEARCH_IDS } from '../../shared/sim/config.ts';
import { TECHNOLOGIES, type TechId } from '../../shared/strategic/technologies.ts';
import { useAppStore } from './useAppStore.ts';
import { useHudStore } from './useHudStore.ts';

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

/** Tempo exibido nas dicas: no Sandbox com "Tudo instantâneo" ligado, a obra fica pronta na hora. */
export function timeText(seconds: number): string {
  return useHudStore.getState().sandbox?.instant ? 'instantâneo (Sandbox)' : `${seconds}s`;
}

/** Era que vale para as regras no cliente (sem eras ligadas ou no Sandbox: tudo liberado). */
export function effectiveEra(me: { era?: number; eras?: boolean } | undefined): number {
  if (!me?.eras || isSandboxMatch()) return 4;
  return me.era ?? 1;
}
