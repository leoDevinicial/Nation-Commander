import { useEffect, useState } from 'react';
import { FlaskConical, Hammer, Handshake, Landmark, LayoutGrid, type LucideIcon, Ship, X } from 'lucide-react';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';

/**
 * Roda de ferramentas (HUD compacta, 21/11; maquete em `docs/ui_maquete`, imagens 12 a 19). Um botão no canto de
 * baixo à direita que abre, num arco, as ferramentas que antes ficavam espalhadas (Construir, Pesquisa, Nação,
 * Diplomacia e Comércio). Com algo selecionado, o cartão da seleção ocupa a parte de baixo e a roda recolhe (fica
 * menor e fechada). Os atalhos de teclado continuam (B constrói, G abre o painel nacional).
 */
interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  key?: string;
  tour?: string;
  run: (runtime: GameRuntime) => void;
}

const TOOLS: Tool[] = [
  { id: 'build', label: 'Construir', icon: Hammer, key: 'B', tour: 'build-button', run: (rt) => rt.openBuildMenu() },
  { id: 'research', label: 'Pesquisa', icon: FlaskConical, run: () => useNationalStore.getState().openPanelAt('research') },
  { id: 'nation', label: 'Nação', icon: Landmark, key: 'G', run: () => useNationalStore.getState().openPanelAt('overview') },
  { id: 'diplomacy', label: 'Diplomacia', icon: Handshake, run: () => useNationalStore.getState().openPanelAt('diplomacy') },
  { id: 'trade', label: 'Comércio', icon: Ship, run: () => useNationalStore.getState().openPanelAt('trade') },
];

/** Posição de cada botão no arco de 90° (da esquerda para cima), a partir do centro do botão principal. */
function arc(k: number, n: number, r: number): { dx: number; dy: number } {
  const a = Math.PI + (k / (n - 1)) * (Math.PI / 2);
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

export function ToolWheel({ runtime }: { runtime: GameRuntime }) {
  const [open, setOpen] = useState(false);
  const touch = useHudStore((s) => s.touchUi);
  const busy = useHudStore((s) => s.selectedUnits.length > 0 || s.selectedBuilding !== null || s.inspected !== null || s.selectedCitizens !== null || s.mode.kind !== 'normal');
  // seleção nova recolhe a roda (o cartão aparece embaixo); ajuste durante a renderização, sem efeito
  const [wasBusy, setWasBusy] = useState(busy);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (busy) setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const core = touch ? 54 : 64;
  const btn = touch ? 44 : 52;
  // raio que separa os rótulos (os de cima não se cruzam) e ainda cabe na altura de um celular deitado
  const radius = touch ? 160 : 184;
  const run = (t: Tool) => {
    setOpen(false);
    t.run(runtime);
  };

  return (
    <div
      className={`tool-wheel pointer-events-auto absolute right-2 bottom-2 z-20 sm:right-3 sm:bottom-3 ${busy && !open ? 'is-tucked' : ''}`}
      style={{ width: core, height: core }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {open && <div className="tool-wheel-scrim" onClick={() => setOpen(false)} aria-hidden />}
      {/* as ferramentas vêm antes do botão principal: com a roda aberta, o tutorial destaca o Construir */}
      {open &&
        TOOLS.map((t, k) => {
          const { dx, dy } = arc(k, TOOLS.length, radius);
          // só o último (em cima do botão) leva o rótulo para cima; os outros, à esquerda
          const up = k === TOOLS.length - 1;
          return (
            // o rótulo fica fora do botão: o recorte octogonal cortaria o texto
            <div key={t.id} className="tool-wheel-slot" style={{ width: btn, height: btn, left: core / 2 - btn / 2 + dx, top: core / 2 - btn / 2 + dy }}>
              <button className="tool-wheel-item" onClick={() => run(t)} aria-label={t.label} title={t.key ? `${t.label} (${t.key})` : t.label} data-tour={t.tour}>
                <t.icon size={touch ? 20 : 22} aria-hidden />
              </button>
              <span className={`tool-wheel-label ${up ? 'is-up' : ''}`} aria-hidden>
                {t.label}
                {t.key && !touch && <kbd>{t.key}</kbd>}
              </span>
            </div>
          );
        })}
      <button
        className={`tool-wheel-core ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? 'Fechar ferramentas' : 'Ferramentas: construir, pesquisa, nação, diplomacia e comércio'}
        title={open ? 'Fechar' : 'Ferramentas'}
        data-tour={open ? undefined : 'build-button'}
      >
        {open ? <X size={touch ? 22 : 26} aria-hidden /> : <LayoutGrid size={touch ? 24 : 28} strokeWidth={2.2} aria-hidden />}
      </button>
    </div>
  );
}
