import { useEffect, useState } from 'react';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { AudioSettings } from '../components/AudioSettings.tsx';
import { SettingsForm } from '../screens/SettingsScreen.tsx';
import { Frame } from '../components/Frame.tsx';
import { ArrowLeft, Flag, Pause, Play, Settings, Volume2 } from 'lucide-react';

export function PauseMenu({ runtime, onClose }: { runtime: GameRuntime; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const mode = useAppStore((s) => s.room?.mode);
  const [sound, setSound] = useState(false);
  const [options, setOptions] = useState(false);
  // rendição enviada: aguarda o servidor encerrar (sem resposta em alguns segundos, deixa tentar de novo)
  const [surrender, setSurrender] = useState<'idle' | 'sent' | 'offline' | 'slow'>('idle');
  useEffect(() => {
    if (surrender !== 'sent') return;
    const t = setTimeout(() => setSurrender('slow'), 6000);
    return () => clearTimeout(t);
  }, [surrender]);
  const sendSurrender = () => setSurrender(gameClient.send({ t: 'surrender' }) ? 'sent' : 'offline');
  // pediu para se render e a conexão caiu: assim que ela voltar, o pedido vai de novo sozinho
  useEffect(() => {
    if (surrender === 'idle') return;
    return gameClient.onStatus((st) => {
      if (st === 'connected') setSurrender(gameClient.send({ t: 'surrender' }) ? 'sent' : 'offline');
    });
  }, [surrender]);
  if (options)
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70 p-2" onPointerDown={(e) => e.stopPropagation()}>
        <Frame className="max-h-[94%] w-[min(36rem,100%)]" innerClassName="scroll-thin overflow-y-auto p-4">
          <div role="dialog" aria-label="Opções">
            <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between gap-2 border-b border-white/10 bg-[rgb(14_19_27)] px-4 py-2.5">
              <h2 className="nc-title text-lg">Opções</h2>
              <button className="btn min-h-8 px-3" onClick={() => setOptions(false)}>
                <ArrowLeft size={15} aria-hidden /> Voltar
              </button>
            </div>
            <SettingsForm inGame />
          </div>
        </Frame>
      </div>
    );
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70" onPointerDown={(e) => e.stopPropagation()}>
      <Frame className="max-h-[92%] w-80" innerClassName="scroll-thin space-y-2 overflow-y-auto p-5">
        <div role="dialog" aria-label="Menu da partida" className="space-y-2">
          <div className="mb-4 text-center">
            <div className="nc-kicker">Sala de Situação</div>
            <h2 className="nc-title mt-1.5 text-2xl leading-none">Menu da operação</h2>
          </div>
          <button className="btn btn-primary w-full" onClick={onClose}>
            <ArrowLeft size={16} aria-hidden /> Voltar ao Jogo
          </button>
          <button className="btn w-full" onClick={() => runtime.togglePause()}>
            {runtime.isPaused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
            {runtime.isPaused ? 'Retomar Simulação' : 'Pausar Simulação'}
          </button>
          <button className="btn w-full" aria-expanded={sound} onClick={() => setSound(!sound)}>
            <Volume2 size={16} aria-hidden />
            {sound ? 'Ocultar Áudio' : 'Áudio e Volumes'}
          </button>
          {sound && <AudioSettings compact />}
          <button className="btn w-full" onClick={() => setOptions(true)}>
            <Settings size={16} aria-hidden /> Opções
          </button>
          {mode === 'pvp' && <p className="text-xs text-ink-400">Em partidas multijogador, qualquer jogador pode pausar ou retomar.</p>}
          {!confirm ? (
            <button className="btn btn-danger w-full" onClick={() => setConfirm(true)}>
              <Flag size={16} aria-hidden /> Render-se
            </button>
          ) : (
            <div className="rounded border border-signal-red p-2 text-sm">
              <p className="mb-2">Render-se conta como derrota. Confirmar?</p>
              <div className="flex gap-2">
                <button className="btn btn-danger flex-1" disabled={surrender === 'sent'} onClick={sendSurrender}>
                  {surrender === 'sent' ? 'Encerrando…' : surrender === 'idle' ? 'Sim, Render-se' : 'Tentar de novo'}
                </button>
                <button className="btn flex-1" disabled={surrender === 'sent'} onClick={() => (setConfirm(false), setSurrender('idle'))}>
                  Não
                </button>
              </div>
              {surrender === 'offline' && <p className="mt-2 text-xs text-brass-400">Sem conexão com o servidor agora. Assim que reconectar, a rendição é enviada sozinha.</p>}
              {surrender === 'slow' && <p className="mt-2 text-xs text-brass-400">O servidor ainda não respondeu. Verifique a conexão e tente de novo.</p>}
            </div>
          )}
        </div>
      </Frame>
    </div>
  );
}
