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

gameClient.on((msg) => {
  if (msg.t === 'snapshot') snapshotBuffer.last = msg;
  else if (msg.t === 'match_start') snapshotBuffer.last = null;
});
