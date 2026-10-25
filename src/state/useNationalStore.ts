import { create } from 'zustand';
import type { DiplomacyView, NationView } from '../../shared/protocol.ts';
import type { HistoryPoint, NationalEvent } from '../../shared/strategic/NationalSimulation.ts';

export interface NationalLogEntry {
  id: number;
  event: NationalEvent;
  date: string;
}

interface NationalState {
  day: number;
  date: string;
  nations: NationView[];
  diplomacy: DiplomacyView | null;
  /** Histórico mensal por slot (o servidor só reenvia quando muda). */
  history: Record<number, HistoryPoint[]>;
  log: NationalLogEntry[];
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  reset: () => void;
}

let seq = 1;

export const useNationalStore = create<NationalState>((set) => ({
  day: 0,
  date: '',
  nations: [],
  diplomacy: null,
  history: {},
  log: [],
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  reset: () => set({ day: 0, date: '', nations: [], diplomacy: null, history: {}, log: [], panelOpen: false }),
}));

export function applyNationalMessage(day: number, date: string, nations: NationView[], events: NationalEvent[], diplomacy: DiplomacyView): void {
  useNationalStore.setState((s) => {
    const history = { ...s.history };
    for (const n of nations) if (n.history) history[n.slot] = n.history;
    const log = events.length ? [...s.log, ...events.map((event) => ({ id: seq++, event, date }))].slice(-80) : s.log;
    return { day, date, nations, history, log, diplomacy };
  });
}
