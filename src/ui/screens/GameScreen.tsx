import { useEffect, useRef, useState } from 'react';
import { GameRuntime } from '../../game/GameRuntime.ts';
import { gameClient, snapshotBuffer } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { PROFILES } from '../../lib/graphics.ts';
import { CommandPanel } from '../hud/CommandPanel.tsx';
import { EventLog } from '../hud/EventLog.tsx';
import { Minimap } from '../hud/Minimap.tsx';
import { PauseMenu } from '../hud/PauseMenu.tsx';
import { ResultsOverlay } from '../hud/ResultsOverlay.tsx';
import { TopBar } from '../hud/TopBar.tsx';
import { TouchToolbar } from '../hud/TouchToolbar.tsx';
import { RouteInspector } from '../hud/RouteInspector.tsx';
import { UpgradePanel } from '../hud/UpgradePanel.tsx';
import { GlobePanel } from '../geo/GlobePanel.tsx';
import { WarDialog } from '../geo/WarDialog.tsx';
import { ChatBox } from '../components/ChatBox.tsx';
import { NationalPanel } from '../national/NationalPanel.tsx';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { FullscreenPrompt } from '../components/FullscreenButton.tsx';
import { describeNationalEvent, makeNameOf } from '../../game/nationalText.ts';
import { battleSnapshotBuffer, useOpsStore } from '../../state/useOpsStore.ts';
import { OperationalMap } from '../geo/OperationalMap.tsx';
import { BattleBar, BattleLoading, BattlePrompt, OperationChip, OutcomeDialog } from '../hud/BattleHud.tsx';

export function GameScreen() {
  const match = useAppStore((s) => s.match);
  const matchEnd = useAppStore((s) => s.matchEnd);
  const containerRef = useRef<HTMLDivElement>(null);
  const [runtime, setRuntime] = useState<GameRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const nationalOpen = useNationalStore((s) => s.panelOpen);
  const setNationalOpen = useNationalStore((s) => s.setPanelOpen);
  const nationalTab = useNationalStore((s) => s.panelTab);
  const touchUi = useHudStore((s) => s.touchUi);
  const globeOpen = useNationalStore((s) => s.globeOpen);
  const warTarget = useNationalStore((s) => s.warTarget);
  // o globo só é montado na primeira abertura e depois fica pausado em segundo plano
  const [globeMounted, setGlobeMounted] = useState(false);
  if (globeOpen && !globeMounted) setGlobeMounted(true);

  // batalha local de uma operação (Fase 8): segunda cena tática, criada ao entrar e mantida até o fim
  const battle = useOpsStore((s) => s.battle);
  const inBattle = useOpsStore((s) => s.inBattle);
  const opMap = useOpsStore((s) => s.opMap);
  const battleRef = useRef<HTMLDivElement>(null);
  const [battleRt, setBattleRt] = useState<GameRuntime | null>(null);
  const battleId = battle?.opId ?? null;
  const wantBattle = battleId !== null && (inBattle || battleRt !== null);
  useEffect(() => {
    if (!wantBattle || !battle || !battleRef.current) return;
    const settings = useSettingsStore.getState();
    let rt: GameRuntime | null = null;
    try {
      rt = new GameRuntime(
        battleRef.current,
        battle.match,
        gameClient,
        {
          profile: PROFILES[settings.quality],
          shadows: settings.shadows && PROFILES[settings.quality].shadows,
          panSpeed: settings.panSpeed,
          edgeScroll: settings.edgeScroll,
          adaptive: settings.adaptiveQuality,
          preset: settings.quality,
          battle: { opId: battle.opId, biome: battle.sector.biome },
        },
        battleSnapshotBuffer.last?.opId === battle.opId ? battleSnapshotBuffer.last : null,
      );
      setBattleRt(rt);
      if (import.meta.env.DEV) (window as unknown as { __battle?: GameRuntime }).__battle = rt;
    } catch (err) {
      console.error(err);
      useOpsStore.getState().set({ inBattle: false });
    }
    return () => {
      rt?.dispose();
      setBattleRt(null);
    };
    // a cena depende só da batalha (não de cada atualização do resumo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, wantBattle]);
  const battleActive = inBattle && battleRt !== null;
  useEffect(() => {
    runtime?.setHudActive(!battleActive);
    runtime?.setSuspended(globeOpen || battleActive);
    battleRt?.setHudActive(battleActive);
    battleRt?.setSuspended(!battleActive || globeOpen);
  }, [runtime, battleRt, battleActive, globeOpen]);
  const active = battleActive ? battleRt : runtime;
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  // eventos nacionais entram no painel de eventos da operação
  useEffect(() => {
    let seen = useNationalStore.getState().log.at(-1)?.id ?? 0;
    return useNationalStore.subscribe((s) => {
      const fresh = s.log.filter((l) => l.id > seen);
      if (!fresh.length) return;
      seen = fresh.at(-1)!.id;
      const match = useAppStore.getState().match;
      if (!match) return;
      const nameOf = makeNameOf(match.players, s.diplomacy?.nations ?? []);
      for (const l of fresh) {
        const d = describeNationalEvent(l.event, match.yourSlot, nameOf);
        if (d) useHudStore.getState().pushEvent({ tick: 0, text: d.text, tone: d.tone });
      }
    });
  }, []);

  useEffect(() => {
    if (!match || !containerRef.current) return;
    const settings = useSettingsStore.getState();
    let rt: GameRuntime | null = null;
    try {
      rt = new GameRuntime(
        containerRef.current,
        match,
        gameClient,
        {
          profile: PROFILES[settings.quality],
          shadows: settings.shadows && PROFILES[settings.quality].shadows,
          panSpeed: settings.panSpeed,
          edgeScroll: settings.edgeScroll,
          adaptive: settings.adaptiveQuality,
          preset: settings.quality,
        },
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

  // atalhos da tela: F10 menu, Enter chat, G painel nacional, Tab globo (Esc fica com a cena: cancela o modo ou a seleção)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F10') {
        e.preventDefault();
        setMenuOpen((v) => !v);
      } else if (e.code === 'Enter' && !(e.target instanceof HTMLInputElement)) {
        setChatOpen(true);
      } else if (e.code === 'KeyG' && !(e.target instanceof HTMLInputElement)) {
        const st = useNationalStore.getState();
        st.setPanelOpen(!st.panelOpen);
      } else if (e.code === 'Tab' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        const st = useNationalStore.getState();
        if (st.globeOpen) st.closeGlobe();
        else st.openGlobe();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Esc fecha a camada de cima (menu → globo → painel nacional) antes de chegar à cena; o mapa
  // operacional trata o próprio Esc. Fase de captura: a cena não cancela a seleção ao mesmo tempo.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useOpsStore.getState().opMap !== null) return;
      const st = useNationalStore.getState();
      if (menuOpen) setMenuOpen(false);
      else if (st.globeOpen) st.closeGlobe();
      else if (st.panelOpen) st.setPanelOpen(false);
      else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [menuOpen]);

  if (!match) return null;

  return (
    <div className={`relative h-full w-full overflow-hidden ${reducedMotion ? 'reduce-motion' : ''}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div ref={battleRef} className={`absolute inset-0 ${battleActive ? '' : 'pointer-events-none invisible'}`} aria-hidden={!battleActive} />
      {/* troca de cena (teatro ↔ batalha): esmaecimento curto, sem salto brusco */}
      {battleRt && <div key={battleActive ? 'battle' : 'theater'} className="scene-fade pointer-events-none absolute inset-0 z-[35] bg-ink-950" aria-hidden />}
      {inBattle && battle && <BattleLoading runtime={battleRt} />}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950/90 p-8 text-center">
          <div className="panel max-w-md p-6">
            <p className="mb-4">{error}</p>
            <button className="btn" onClick={() => (gameClient.send({ t: 'surrender' }) ? undefined : useAppStore.setState({ screen: 'menu', match: null, matchEnd: null, room: null, chat: [] }))}>
              Abandonar partida
            </button>
          </div>
        </div>
      )}
      {runtime && active && (
        <>
          {battleActive && !globeOpen ? <BattleBar runtime={active} /> : <TopBar runtime={runtime} onMenu={() => setMenuOpen(true)} canControlSpeed={match.canControlSpeed} />}
          {!battleActive && !globeOpen && !nationalOpen && <OperationChip />}
          {!battleActive && !opMap && <BattlePrompt />}
          {globeMounted && <GlobePanel visible={globeOpen} onClose={() => useNationalStore.getState().closeGlobe()} />}
          <EventLog />
          {!globeOpen && (
            <div className="pointer-events-none absolute right-2 bottom-2 left-2 flex items-end gap-2 sm:right-3 sm:bottom-3 sm:left-3 sm:gap-3">
              <Minimap key={battleActive ? 'b' : 't'} runtime={active} />
              <CommandPanel runtime={active} />
            </div>
          )}
          {touchUi && !nationalOpen && !globeOpen && <TouchToolbar runtime={active} />}
          {!nationalOpen && !globeOpen && !battleActive && <RouteInspector />}
          {touchUi && !nationalOpen && !globeOpen && !menuOpen && <FullscreenPrompt />}
          {!globeOpen && !nationalOpen && !battleActive && <UpgradePanel runtime={runtime} />}
          {opMap !== null && <OperationalMap runtime={runtime} target={opMap} />}
          <OutcomeDialog />
          {nationalOpen && <NationalPanel key={nationalTab ?? 'painel'} onClose={() => setNationalOpen(false)} />}
          {chatOpen && (
            <div className="absolute top-15 right-2 z-30 w-72 max-w-[calc(100vw-16px)] sm:top-14 sm:right-3">
              <ChatBox compact />
              <button className="btn mt-1 px-2 py-1 text-xs" onClick={() => setChatOpen(false)}>
                Fechar Chat
              </button>
            </div>
          )}
          {warTarget !== null && (
            <WarDialog
              target={warTarget}
              mySlot={match.yourSlot}
              nameOf={makeNameOf(match.players, useNationalStore.getState().diplomacy?.nations ?? [])}
              onClose={() => useNationalStore.getState().setWarTarget(null)}
              onConfirm={() => {
                gameClient.send({ t: 'national', cmd: { type: 'diplomacy', action: { type: 'declare_war', target: warTarget } } });
                useNationalStore.getState().setWarTarget(null);
              }}
            />
          )}
          {!chatOpen && !nationalOpen && !globeOpen && (
            <button className="btn absolute top-15 right-2 px-2 py-1 text-xs sm:top-14 sm:right-3" onClick={() => setChatOpen(true)} title="Chat (Enter)" aria-label="Chat">
              💬<span className="hidden sm:inline">Chat</span>
            </button>
          )}
          {menuOpen && !matchEnd && <PauseMenu runtime={runtime} onClose={() => setMenuOpen(false)} />}
        </>
      )}
      {matchEnd && <ResultsOverlay />}
    </div>
  );
}
