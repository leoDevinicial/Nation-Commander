import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useSavedStore } from '../../state/useSavedStore.ts';
import { Frame } from '../components/Frame.tsx';

/** Votação para salvar a partida entre humanos (24/11): quem falta aceitar vê os botões; os outros, quem falta. */
export function SuspendVote() {
  const vote = useSavedStore((s) => s.vote);
  const me = useAppStore((s) => s.serverUser?.name);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!vote) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [vote]);
  if (!vote) return null;
  const left = Math.max(0, Math.ceil((vote.until - now) / 1000));
  const mine = !!me && vote.waiting.includes(me);
  return (
    <div className="pointer-events-auto fixed top-20 left-1/2 z-40 w-[min(92vw,440px)] -translate-x-1/2">
      <Frame innerClassName="flex flex-col gap-2 p-3">
        <div className="flex items-start gap-2 text-sm text-ink-200">
          <Save size={16} className="mt-0.5 shrink-0 text-brass-400" aria-hidden />
          <span>{`${vote.by} quer salvar a partida e continuar outro dia (${left} s).`}</span>
        </div>
        {mine ? (
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => gameClient.send({ t: 'suspend', action: 'accept' })}>
              Aceitar e salvar
            </button>
            <button className="btn flex-1" onClick={() => gameClient.send({ t: 'suspend', action: 'decline' })}>
              Recusar
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-400">{`Aguardando: ${vote.waiting.join(', ')}`}</p>
        )}
      </Frame>
    </div>
  );
}
