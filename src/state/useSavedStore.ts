import { create } from 'zustand';
import type { SavedMatchInfo } from '../../shared/protocol.ts';

/**
 * Partidas salvas (24/11): a lista do servidor (multijogador e contra a IA no servidor), a do aparelho (contra a IA
 * no navegador, IndexedDB), a votação em curso na partida e o aviso de que alguém reabriu uma partida salva.
 */
interface SavedState {
  remote: SavedMatchInfo[] | null;
  local: SavedMatchInfo[];
  vote: { by: string; waiting: string[]; until: number } | null;
  invite: { code: string; by: string } | null;
  set: (p: Partial<Omit<SavedState, 'set'>>) => void;
}

export const useSavedStore = create<SavedState>((set) => ({
  remote: null,
  local: [],
  vote: null,
  invite: null,
  set: (p) => set(p),
}));
