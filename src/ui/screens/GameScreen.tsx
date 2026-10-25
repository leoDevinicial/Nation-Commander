import { useEffect, useRef, useState } from 'react';
import { GameRuntime } from '../../game/GameRuntime.ts';
import { gameClient, snapshotBuffer } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { CommandPanel } from '../hud/CommandPanel.tsx';
import { EventLog } from '../hud/EventLog.tsx';
import { Minimap } from '../hud/Minimap.tsx';
import { PauseMenu } from '../hud/PauseMenu.tsx';
import { ResultsOverlay } from '../hud/ResultsOverlay.tsx';
import { TopBar } from '../hud/TopBar.tsx';
import { ChatBox } from '../components/ChatBox.tsx';

export function GameScreen() {
  const match = useAppStore((s) => s.match);
  const matchEnd = useAppStore((s) => s.matchEnd);
  const containerRef = useRef<HTMLDivElement>(null);
  const [runtime, setRuntime] = useState<GameRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!match || !containerRef.current) return;
    const settings = useSettingsStore.getState();
    let rt: GameRuntime | null = null;
    try {
      rt = new GameRuntime(
        containerRef.current,
        match,
        gameClient,
        { quality: settings.quality, shadows: settings.shadows, panSpeed: settings.panSpeed, edgeScroll: settings.edgeScroll },
        snapshotBuffer.last,
      );
      setRuntime(rt);
      if (import.meta.env.DEV) (window as unknown as { __runtime?: GameRuntime }).__runtime = rt;
    } catch (err) {
      console.error(err);
      setError('Não foi possível iniciar o WebGL neste navegador. Verifique se a aceleração de hardware está ativa.');
    }
    return () => {
      rt?.dispose();
      setRuntime(null);
    };
  }, [match]);

  // Esc sem modo ativo e sem seleção abre o menu; F10 sempre abre
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F10') {
        e.preventDefault();
        setMenuOpen((v) => !v);
      } else if (e.code === 'Enter' && !(e.target instanceof HTMLInputElement)) {
        setChatOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!match) return null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950/90 p-8 text-center">
          <div className="panel max-w-md p-6">
            <p className="mb-4">{error}</p>
            <button className="btn" onClick={() => gameClient.send({ t: 'surrender' })}>
              Abandonar partida
            </button>
          </div>
        </div>
      )}
      {runtime && (
        <>
          <TopBar runtime={runtime} onMenu={() => setMenuOpen(true)} canControlSpeed={match.canControlSpeed} />
          <EventLog />
          <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex items-end gap-3">
            <Minimap runtime={runtime} />
            <CommandPanel runtime={runtime} />
          </div>
          {chatOpen && (
            <div className="absolute top-14 right-3 w-72">
              <ChatBox compact />
              <button className="mt-1 text-xs text-ink-400 hover:text-ink-100" onClick={() => setChatOpen(false)}>
                fechar chat
              </button>
            </div>
          )}
          {!chatOpen && (
            <button className="btn absolute top-14 right-3 px-2 py-1 text-xs" onClick={() => setChatOpen(true)} title="Chat (Enter)">
              💬 Chat
            </button>
          )}
          {menuOpen && !matchEnd && <PauseMenu runtime={runtime} onClose={() => setMenuOpen(false)} />}
        </>
      )}
      {matchEnd && <ResultsOverlay />}
    </div>
  );
}
