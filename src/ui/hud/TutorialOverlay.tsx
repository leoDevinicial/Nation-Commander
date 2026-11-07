/**
 * Tutorial (07/11, `docs/TUTORIAL.md`): painel do passo (fala, objetivo, ajuda), destaque do botão certo, marcadores no
 * mapa, câmera e narração. O passo vem do servidor (`useTutorialStore`); daqui só saem os fatos da tela (câmera,
 * seleção, painéis) e os pedidos de pular.
 */
import { GraduationCap, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TutorialFact } from '../../../shared/tutorial/script.ts';
import { audio } from '../../game/audio/AudioService.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { markTutorial, useTutorialStore } from '../../state/useTutorialStore.ts';
import { Frame } from '../components/Frame.tsx';

export function TutorialOverlay({ runtime }: { runtime: GameRuntime }) {
  const view = useTutorialStore((s) => s.view);
  const step = view?.step ?? null;

  // começou: o convite do menu não volta; concluído, fica marcado como feito
  useEffect(() => markTutorial('skipped'), []);
  useEffect(() => {
    if (view?.done) markTutorial('done');
  }, [view?.done]);

  // a cada passo novo: câmera, narração
  useEffect(() => {
    const v = useTutorialStore.getState().view;
    if (!v) return;
    if (v.camera) runtime.tutorialFocus(v.camera.x, v.camera.y);
    if (audio.narrate(v.done ? null : v.step)) return;
    // o áudio só destrava no primeiro toque ou tecla da partida: a fala deste passo toca logo depois
    const retry = () => window.setTimeout(() => audio.narrate(useTutorialStore.getState().view?.step === v.step ? v.step : null), 80);
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
    return () => {
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
    };
  }, [step, runtime]);
  useEffect(
    () => () => {
      audio.narrate(null);
    },
    [],
  );

  // marcadores no chão (as posições mudam com a patrulha e as tropas)
  const marks = JSON.stringify(view?.marks ?? []);
  useEffect(() => {
    runtime.setTutorialMarks(JSON.parse(marks) as { x: number; y: number }[]);
  }, [marks, runtime]);
  useEffect(() => () => runtime.setTutorialMarks([]), [runtime]);

  useFactWatcher(runtime, view?.fact ?? null, step);

  if (!view || view.done) return null;
  const pct = Math.round((view.index / Math.max(1, view.total - 1)) * 100);
  return (
    <>
      <Spotlight anchors={view.anchor} />
      <Frame
        className="pointer-events-auto absolute top-15 left-2 z-30 w-[340px] max-w-[calc(100vw-24px)] sm:top-auto sm:bottom-[244px] sm:left-3 [@media(max-height:640px)]:top-14 [@media(max-height:640px)]:bottom-auto [@media(max-height:520px)]:w-[300px]"
        innerClassName="space-y-2 p-3 text-sm"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="nc-kicker flex items-center gap-1.5">
            <GraduationCap size={13} aria-hidden />
            <span>{`Tutorial · capítulo ${view.chapter} de ${view.chapters}`}</span>
          </div>
          <span className="nc-num text-[10px] text-ink-400">{pct}%</span>
        </div>
        <div className="h-0.5 w-full bg-white/10" aria-hidden>
          <div className="h-full bg-brass-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="nc-title text-base leading-tight">{view.title}</div>
        <p className="leading-snug text-ink-100">{view.text}</p>
        {view.objective && (
          <div className="flex items-baseline justify-between gap-2 border-l-2 border-brass-400 bg-brass-400/[0.07] px-2 py-1.5 text-[13px]">
            <span className="font-semibold text-brass-300">{view.objective}</span>
            {view.progress && (
              <span className="nc-num shrink-0 text-xs text-ink-200">
                {Math.min(view.progress.have, view.progress.need)}/{view.progress.need}
              </span>
            )}
          </div>
        )}
        {view.help && <p className="text-[12px] leading-snug text-signal-amber">{view.help}</p>}
        <div className="flex gap-1.5 pt-0.5">
          <button className="btn flex-1 px-2 py-1 text-[11px]" onClick={() => gameClient.send({ t: 'tutorial', skip: 'step' })} title="Pula este passo (o tutorial faz o que ele pedia)">
            <SkipForward size={12} aria-hidden /> Pular passo
          </button>
          <button className="btn flex-1 px-2 py-1 text-[11px]" onClick={() => gameClient.send({ t: 'tutorial', skip: 'chapter' })} title="Vai para o próximo capítulo">
            Pular capítulo
          </button>
        </div>
      </Frame>
    </>
  );
}

/**
 * Confere na tela o fato que o passo pede (câmera, zoom, seleção, painel) e avisa o servidor uma vez por passo.
 * O servidor só aceita o fato do passo atual.
 */
function useFactWatcher(runtime: GameRuntime, fact: TutorialFact | null, step: string | null): void {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!fact || !step) return;
    const cam = runtime.cameraCtl;
    const start = { x: cam.target.x, z: cam.target.z, dist: cam.distance };
    // a câmera pode começar no limite do zoom: vale mexer 15% para qualquer lado (o máximo menos o mínimo visto)
    let lo = start.dist;
    let hi = start.dist;
    const check = (): boolean => {
      const hud = useHudStore.getState();
      const nat = useNationalStore.getState();
      const mySlot = useAppStore.getState().match?.yourSlot ?? 0;
      switch (fact) {
        case 'camera_moved':
          return Math.hypot(cam.target.x - start.x, cam.target.z - start.z) > 12;
        case 'zoomed':
          lo = Math.min(lo, cam.distance);
          hi = Math.max(hi, cam.distance);
          return hi - lo > start.dist * 0.15;
        case 'hq_selected':
        case 'build_menu':
          return hud.selectedBuilding?.type === 'hq' && hud.selectedBuilding.owner === mySlot;
        case 'units_selected':
          return hud.selectedUnits.length > 0;
        case 'nation_open':
          return nat.panelOpen;
        case 'nation_tab_research':
          return nat.panelOpen && nat.shownTab === 'research';
        case 'nation_tab_diplomacy':
          return nat.panelOpen && nat.shownTab === 'diplomacy';
        case 'nation_tab_trade':
          return nat.panelOpen && nat.shownTab === 'trade';
        case 'nation_closed':
          return !nat.panelOpen;
      }
    };
    const id = window.setInterval(() => {
      const key = `${step}:${fact}`;
      if (sent.current === key || !check()) return;
      sent.current = key;
      gameClient.send({ t: 'tutorial', fact });
    }, 250);
    return () => window.clearInterval(id);
  }, [fact, step, runtime]);
}

/** Moldura de latão pulsando em volta do primeiro elemento `data-tour` da lista que estiver visível na tela. */
function Spotlight({ anchors }: { anchors: readonly string[] }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const key = anchors.join('|');
  useEffect(() => {
    const find = () => {
      for (const a of anchors) {
        for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(a)}"]`)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return r;
        }
      }
      return null;
    };
    const tick = () =>
      setRect((prev) => {
        const r = find();
        if (!r) return null;
        return prev && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height ? prev : r;
      });
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 300);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
    // a lista vem nova a cada passo; a chave evita refazer o laço sem mudança
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!rect) return null;
  const pad = 5;
  return (
    <div
      className="tutorial-spot pointer-events-none fixed z-[60] rounded-[4px] border-2 border-brass-400"
      style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      aria-hidden
    />
  );
}
