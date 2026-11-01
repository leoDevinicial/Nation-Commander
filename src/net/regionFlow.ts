import { useAppStore } from '../state/useAppStore.ts';
import { gameClient } from './client.ts';
import { REGIONS, multiRegion, regionForNewRoom, rememberServer } from './regionState.ts';
import { regionForCode } from './regions.ts';

/**
 * KNPS-08: antes de criar ou entrar numa sala, conecta ao servidor da região certa (com um servidor só, não faz nada).
 * Devolve false se a troca não deu certo; o jogador recebe o aviso e continua no servidor em que estava.
 */
async function goTo(url: string, label: string): Promise<boolean> {
  if (url === gameClient.serverUrl && gameClient.status === 'connected') return true;
  useAppStore.getState().pushToast('info', `Conectando ao servidor ${label}…`);
  const ok = await gameClient.switchTo(url);
  if (ok) rememberServer(url);
  else useAppStore.getState().pushToast('error', `Não foi possível conectar ao servidor ${label}. Tente de novo em instantes.`);
  return ok;
}

/** Sala nova: na região escolhida pelo jogador ou na de menor ping. */
export async function prepareNewRoom(): Promise<boolean> {
  if (!multiRegion) return true;
  const r = await regionForNewRoom();
  return goTo(r.url, r.label);
}

/** Entrar por código: o servidor da região indicada pela primeira letra (sem letra conhecida, o atual). */
export async function prepareJoin(code: string): Promise<boolean> {
  if (!multiRegion) return true;
  const r = regionForCode(REGIONS, code);
  return r ? goTo(r.url, r.label) : true;
}
