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
  /** Aba pedida ao abrir o painel nacional por um atalho (ex.: o saldo da barra abre o Orçamento). */
  panelTab: string | null;
  openPanelAt: (tab: string) => void;
  /** Globo diplomático aberto e país a centralizar (ISO alfa-3). */
  globeOpen: boolean;
  globeFocus: string | null;
  openGlobe: (focus?: string | null) => void;
  closeGlobe: () => void;
  /** Alvo da confirmação de guerra em aberto. */
  warTarget: number | null;
  setWarTarget: (id: number | null) => void;
  reset: () => void;
}

let seq = 1;
/** Eventos nacionais guardados no cliente (alimentam o painel de eventos e o noticiário). */
export const NATIONAL_LOG_MAX = 400;

export const useNationalStore = create<NationalState>((set) => ({
  day: 0,
  date: '',
  nations: [],
  diplomacy: null,
  history: {},
  log: [],
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen, panelTab: null }),
  panelTab: null,
  openPanelAt: (tab) => set({ panelOpen: true, panelTab: tab, globeOpen: false }),
  globeOpen: false,
  globeFocus: null,
  openGlobe: (focus = null) => set({ globeOpen: true, globeFocus: focus, panelOpen: false }),
  closeGlobe: () => set({ globeOpen: false }),
  warTarget: null,
  setWarTarget: (warTarget) => set({ warTarget }),
  reset: () => set({ day: 0, date: '', nations: [], diplomacy: null, history: {}, log: [], panelOpen: false, globeOpen: false, globeFocus: null, warTarget: null }),
}));

export function applyNationalMessage(day: number, date: string, nations: NationView[], events: NationalEvent[], diplomacy: DiplomacyView): void {
  useNationalStore.setState((s) => {
    const history = { ...s.history };
    for (const n of nations) if (n.history) history[n.slot] = n.history;
    const log = events.length ? [...s.log, ...events.map((event) => ({ id: seq++, event, date }))].slice(-NATIONAL_LOG_MAX) : s.log;
    return { day, date, nations, history, log, diplomacy };
  });
}
