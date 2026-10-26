import type { ServerMessage } from '../../shared/protocol.ts';
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
    snapshotBuffer.last = null;
    lastTerritory = undefined;
  }
});
