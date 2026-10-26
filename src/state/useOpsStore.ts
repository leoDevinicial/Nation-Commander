import { create } from 'zustand';
import type { BattleInfo, ServerMessage } from '../../shared/protocol.ts';
import type { OperationResult, OperationsView } from '../../shared/strategic/operations.ts';

type SnapshotMsg = Extract<ServerMessage, { t: 'snapshot' }>;

/** Último snapshot da batalha local (fora do React: a cena lê ao montar). */
export const battleSnapshotBuffer: { last: SnapshotMsg | null } = { last: null };

export interface BattleOutcome {
  opId: number;
  result: OperationResult;
  sectorName: string;
  targetCountryId: string;
}

interface OpsState {
  /** Setores dos países em guerra e operações do jogador (Fase 8). */
  view: OperationsView | null;
  /** Batalha local em andamento (do `battle_start`). */
  battle: BattleInfo | null;
  /** A cena da batalha está à frente (o teatro fica em segundo plano). */
  inBattle: boolean;
  /** Resultado reconciliado da última batalha, até o jogador fechar. */
  outcome: BattleOutcome | null;
  /** País da IA cujo mapa operacional está aberto. */
  opMap: number | null;
  set: (patch: Partial<Omit<OpsState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

export const useOpsStore = create<OpsState>((set) => ({
  view: null,
  battle: null,
  inBattle: false,
  outcome: null,
  opMap: null,
  set: (patch) => set(patch),
  reset: () => {
    battleSnapshotBuffer.last = null;
    set({ view: null, battle: null, inBattle: false, outcome: null, opMap: null });
  },
}));

/** Mensagens do servidor sobre operações e batalhas locais. */
export function applyOpsMessage(msg: ServerMessage): void {
  const st = useOpsStore.getState();
  if (msg.t === 'operations') st.set({ view: msg.ops });
  else if (msg.t === 'battle_start') {
    battleSnapshotBuffer.last = null;
    st.set({ battle: msg.battle, outcome: null });
  } else if (msg.t === 'snapshot' && msg.scope === 'battle') battleSnapshotBuffer.last = msg;
  else if (msg.t === 'battle_end') {
    const b = st.battle?.opId === msg.opId ? st.battle : null;
    st.set({
      battle: null,
      inBattle: false,
      outcome: { opId: msg.opId, result: msg.result, sectorName: b?.sector.name ?? st.view?.ops.find((o) => o.id === msg.opId)?.sectorName ?? '', targetCountryId: b?.targetCountryId ?? '' },
    });
  }
}
