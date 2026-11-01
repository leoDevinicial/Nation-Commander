import type { MatchStartInfo, ServerMessage } from '../../shared/protocol.ts';
import { useAppStore } from '../state/useAppStore.ts';
import { env } from '../lib/env.ts';
import { GameClient } from './GameClient.ts';
import { REGIONS, probeRegions, rememberServer, rememberedServer } from './regionState.ts';

// KNPS-08: volta direto ao servidor da última sala (partida em andamento é retomada); senão, o primeiro da lista
export const gameClient = new GameClient(rememberedServer() ?? REGIONS[0]?.url ?? env.gameServerUrl);
// mede as regiões em segundo plano para a hora de criar uma sala
void probeRegions();

type SnapshotMsg = Extract<ServerMessage, { t: 'snapshot' }>;

/**
 * Último snapshot recebido, mantido fora do React. O runtime 3D lê daqui ao montar e depois
 * assina diretamente o cliente, evitando re-renderizações por frame.
 */
export const snapshotBuffer: { last: SnapshotMsg | null } = { last: null };

/**
 * Fronteiras e estradas chegam só quando mudam (juntas, no mesmo snapshot): guarda as últimas para quem montar depois.
 * Antes só a grade de território era guardada; a tela do jogo, montada depois do primeiro snapshot, recebia o
 * território sem as estradas e a estrada inicial (QG → termelétrica) nunca aparecia.
 */
let lastTerritory: string | undefined;
let lastRoads: number[] | undefined;

gameClient.on((msg) => {
  // entrou numa sala: lembra o servidor dela (reconexão depois de fechar o navegador)
  if (msg.t === 'room' && msg.room) rememberServer(gameClient.serverUrl);
  // snapshots da batalha local (Fase 8) vão para a cena da batalha, não para o teatro
  if (msg.t === 'snapshot' && !msg.scope) {
    if (msg.s.territory) {
      lastTerritory = msg.s.territory;
      lastRoads = msg.s.roads;
    }
    // o snapshot guardado sempre carrega a grade de território e as estradas mais recentes
    snapshotBuffer.last =
      msg.s.territory || !lastTerritory ? msg : { ...msg, s: { ...msg.s, territory: lastTerritory, ...(lastRoads ? { roads: lastRoads } : {}) } };
  } else if (msg.t === 'match_start') {
    // reconexão à mesma partida: a cena continua, e o último snapshot segue válido
    if (isSameMatch(currentMatch(), msg.match)) return;
    snapshotBuffer.last = null;
    lastTerritory = undefined;
    lastRoads = undefined;
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
