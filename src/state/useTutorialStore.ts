import { create } from 'zustand';
import type { TutorialView } from '../../shared/tutorial/script.ts';

/** Passo atual do tutorial (07/11), como o servidor manda; null fora do tutorial. */
interface TutorialState {
  view: TutorialView | null;
  set: (view: TutorialView | null) => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  view: null,
  set: (view) => set({ view }),
}));

/** Parte da interface escondida pelo tutorial agora? */
export function tutorialLocked(feature: 'nation' | 'globe'): boolean {
  return !!useTutorialStore.getState().view?.locked.includes(feature);
}

const KEY = 'nc.tutorial.v1';

/** O jogador já concluiu ou dispensou o tutorial neste aparelho? */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function markTutorial(state: 'done' | 'skipped'): void {
  try {
    localStorage.setItem(KEY, state);
  } catch {
    // sem armazenamento: o convite volta na próxima visita
  }
}
