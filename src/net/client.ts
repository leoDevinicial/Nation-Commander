import type { MatchStartInfo, ServerMessage } from '../../shared/protocol.ts';
import { useAppStore } from '../state/useAppStore.ts';
import { env } from '../lib/env.ts';
import { GameClient } from './GameClient.ts';

export const gameClient = new GameClient(env.gameServerUrl);

type SnapshotMsg = Extract<ServerMessage, { t: 'snapshot' }>;

/**
 * Último snapshot recebido, mantido fora do React. O runtime 3D lê daqui ao montar e depois
 * assina diretamente o cliente, evitando re-renderizações por frame.
 */
export const snapshotBuffer: { last: SnapshotMsg | null } = { last: null };

/** Fronteiras chegam só quando mudam: guarda a última grade para quem montar depois. */
let lastTerritory: string | undefined;

gameClient.on((msg) => {
  // snapshots da batalha local (Fase 8) vão para a cena da batalha, não para o teatro
  if (msg.t === 'snapshot' && !msg.scope) {
    if (msg.s.territory) lastTerritory = msg.s.territory;
    // o snapshot guardado sempre carrega a grade de território mais recente
    snapshotBuffer.last = msg.s.territory || !lastTerritory ? msg : { ...msg, s: { ...msg.s, territory: lastTerritory } };
  } else if (msg.t === 'match_start') {
    // reconexão à mesma partida: a cena continua, e o último snapshot segue válido
    if (isSameMatch(currentMatch(), msg.match)) return;
    snapshotBuffer.last = null;
    lastTerritory = undefined;
  }
});

/** Partida em andamento na tela (null no menu, no lobby ou depois do fim). */
export function currentMatch(): MatchStartInfo | null {
  const app = useAppStore.getState();
  return app.screen === 'game' && !app.matchEnd ? app.match : null;
}

/**
 * O `match_start` recebido é a mesma partida que já está na tela? Acontece ao reconectar (queda
 * de rede, servidor atualizando). Nesse caso a cena 3D é mantida: câmera, seleção, grupos e o
 * mapa já explorado não se perdem.
 */
export function isSameMatch(prev: MatchStartInfo | null, next: MatchStartInfo): boolean {
  return (
    !!prev &&
    prev.seed === next.seed &&
    prev.yourSlot === next.yourSlot &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.cellSize === next.cellSize &&
    prev.terrain === next.terrain
  );
}
