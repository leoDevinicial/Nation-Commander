import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';

const LABEL = {
  idle: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  failed: 'Sem conexão',
} as const;

export function ConnectionBadge() {
  const status = useAppStore((s) => s.connStatus);
  const detail = useAppStore((s) => s.connDetail);
  const color = status === 'connected' ? 'bg-signal-green' : status === 'failed' ? 'bg-signal-red' : 'bg-brass-400';
  return (
    <div className="flex items-center gap-2 text-xs text-ink-400" title={detail ?? undefined}>
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />
      <span>Servidor: {LABEL[status]}</span>
      {status === 'failed' && (
        <button className="underline hover:text-ink-100" onClick={() => gameClient.retry()}>
          Tentar de Novo
        </button>
      )}
    </div>
  );
}
