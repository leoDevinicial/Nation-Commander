import { useState } from 'react';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { AudioSettings } from '../components/AudioSettings.tsx';

export function PauseMenu({ runtime, onClose }: { runtime: GameRuntime; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const mode = useAppStore((s) => s.room?.mode);
  const [sound, setSound] = useState(false);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel scroll-thin max-h-[92%] w-80 space-y-2 overflow-y-auto p-5" role="dialog" aria-label="Menu da partida">
        <h2 className="mb-3 text-center font-bold tracking-wide">Menu da operação</h2>
        <button className="btn w-full" onClick={onClose}>
          Voltar ao Jogo
        </button>
        <button className="btn w-full" onClick={() => runtime.togglePause()}>
          {runtime.isPaused ? 'Retomar Simulação' : 'Pausar Simulação'}
        </button>
        <button className="btn w-full" aria-expanded={sound} onClick={() => setSound(!sound)}>
          {sound ? 'Ocultar Áudio' : 'Áudio e Volumes'}
        </button>
        {sound && <AudioSettings compact />}
        {mode === 'pvp' && <p className="text-xs text-ink-400">Em partidas multijogador, qualquer jogador pode pausar ou retomar.</p>}
        {!confirm ? (
          <button className="btn btn-danger w-full" onClick={() => setConfirm(true)}>
            Render-se
          </button>
        ) : (
          <div className="rounded border border-signal-red p-2 text-sm">
            <p className="mb-2">Render-se conta como derrota. Confirmar?</p>
            <div className="flex gap-2">
              <button className="btn btn-danger flex-1" onClick={() => gameClient.send({ t: 'surrender' })}>
                Sim, Render-se
              </button>
              <button className="btn flex-1" onClick={() => setConfirm(false)}>
                Não
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
