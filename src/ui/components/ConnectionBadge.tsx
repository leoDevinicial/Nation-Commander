import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';

const LABEL = {
  idle: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  failed: 'Sem conexão',
} as const;

/**
 * Qual servidor está em uso (22/11, pedido do responsável): RL = Railway (principal), RN = Render (reserva), LC = a
 * partida contra a IA no próprio aparelho. Muda junto com o estado da conexão (a troca de servidor passa por ele).
 */
export function serverTag(url: string): string | null {
  if (url === 'local:') return 'LC';
  if (/railway\.app/i.test(url)) return 'RL';
  if (/onrender\.com/i.test(url)) return 'RN';
  return null;
}

export function ConnectionBadge() {
  const status = useAppStore((s) => s.connStatus);
  const detail = useAppStore((s) => s.connDetail);
  const color = status === 'connected' ? 'bg-signal-green' : status === 'failed' ? 'bg-signal-red' : 'bg-brass-400';
  return (
    <div className="flex items-center gap-2 text-xs text-ink-400" title={detail ?? undefined}>
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />
      <span>Servidor: {LABEL[status]}</span>
      {status === 'connected' && serverTag(gameClient.serverUrl) && (
        <span className="font-mono text-[10px] tracking-wider text-ink-500" translate="no" title={gameClient.serverUrl}>
          {serverTag(gameClient.serverUrl)}
        </span>
      )}
      {status === 'failed' && (
        <button className="underline hover:text-ink-100" onClick={() => gameClient.retry()}>
          Tentar de Novo
        </button>
      )}
    </div>
  );
}
