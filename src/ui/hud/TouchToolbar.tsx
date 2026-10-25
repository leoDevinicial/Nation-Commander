import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore, type TouchTool } from '../../state/useHudStore.ts';

const TOOLS: { tool: TouchTool; icon: string; label: string; hint: string }[] = [
  { tool: 'select', icon: '☝', label: 'Selecionar', hint: 'Toque seleciona; dois toques selecionam o tipo; toque longo dá ordem' },
  { tool: 'order', icon: '➤', label: 'Ordem', hint: 'O próximo toque move ou ataca com a seleção' },
  { tool: 'box', icon: '▢', label: 'Área', hint: 'Arraste um dedo para selecionar várias unidades' },
];

/**
 * Controles equivalentes ao mouse para telas de toque. Os gestos (arrastar, pinça, giro e
 * toque longo) continuam valendo; estes botões cobrem quem prefere não depender deles.
 */
export function TouchToolbar({ runtime }: { runtime: GameRuntime }) {
  const tool = useHudStore((s) => s.touchTool);
  const additive = useHudStore((s) => s.touchAdditive);
  const hasSelection = useHudStore((s) => s.selectedUnits.length > 0 || s.selectedBuilding !== null || s.inspected !== null);

  return (
    <div
      className="pointer-events-auto absolute top-[6.5rem] right-2 z-10 grid gap-1.5 sm:top-28 sm:right-3 [@media(max-height:520px)]:top-[5.75rem] [@media(max-height:520px)]:grid-cols-3"
      onPointerDown={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Controles de toque"
    >
      {TOOLS.map((t) => (
        <button key={t.tool} aria-label={t.label} className="cmd-btn touch-btn" aria-pressed={tool === t.tool} title={t.hint} onClick={() => runtime.setTouchTool(tool === t.tool && t.tool !== 'select' ? 'select' : t.tool)}>
          <span className="text-base leading-none" aria-hidden>
            {t.icon}
          </span>
          <span>{t.label}</span>
        </button>
      ))}
      <button aria-label="Somar" className="cmd-btn touch-btn" aria-pressed={additive} title="Somar à seleção atual em vez de substituí-la" onClick={() => runtime.toggleTouchAdditive()}>
        <span className="text-base leading-none" aria-hidden>
          ⊕
        </span>
        <span>Somar</span>
      </button>
      <button aria-label="Aproximar" className="cmd-btn touch-btn" title="Aproximar (ou pinça com dois dedos)" onClick={() => runtime.zoomBy(1 / 1.25)}>
        <span className="text-base leading-none" aria-hidden>
          ＋
        </span>
        <span>Aproximar</span>
      </button>
      <button aria-label="Afastar" className="cmd-btn touch-btn" title="Afastar (ou pinça com dois dedos)" onClick={() => runtime.zoomBy(1.25)}>
        <span className="text-base leading-none" aria-hidden>
          －
        </span>
        <span>Afastar</span>
      </button>
      <button aria-label="Girar" className="cmd-btn touch-btn" title="Girar a câmera (ou gire dois dedos)" onClick={() => runtime.rotateBy(Math.PI / 8)}>
        <span className="text-base leading-none" aria-hidden>
          ⟳
        </span>
        <span>Girar</span>
      </button>
      <button aria-label="Centro de Comando" className="cmd-btn touch-btn" title="Centralizar a câmera no Centro de Comando" onClick={() => runtime.centerOnHQ()}>
        <span className="text-base leading-none" aria-hidden>
          ⌂
        </span>
        <span>QG</span>
      </button>
      <button aria-label="Desmarcar" className="cmd-btn touch-btn" disabled={!hasSelection} title="Limpar a seleção" onClick={() => runtime.clearSelection()}>
        <span className="text-base leading-none" aria-hidden>
          ✕
        </span>
        <span>Desmarcar</span>
      </button>
    </div>
  );
}
