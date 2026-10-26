import { useState } from 'react';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore, type TouchTool } from '../../state/useHudStore.ts';

const TOOLS: { tool: TouchTool; icon: string; label: string; hint: string }[] = [
  {
    tool: 'select',
    icon: '☝',
    label: 'Selecionar',
    hint: 'Toque seleciona; dois toques selecionam o tipo; toque longo dá ordem',
  },
  {
    tool: 'order',
    icon: '➤',
    label: 'Ordem',
    hint: 'O próximo toque move ou ataca com a seleção',
  },
  {
    tool: 'box',
    icon: '▢',
    label: 'Área',
    hint: 'Arraste um dedo para selecionar várias unidades',
  },
];

/**
 * Controles equivalentes ao mouse para telas de toque. Os gestos (arrastar, pinça, giro e
 * toque longo) continuam valendo; estes botões cobrem quem prefere não depender deles.
 *
 * É um menu recolhível: o botão do topo mostra a ferramenta atual e abre/fecha a lista. Enquanto o
 * painel de comando mostra algo (seleção, inspeção ou escolha de local de obra), a lista se recolhe
 * sozinha para não cobrir o painel no celular; tocar no botão a abre mesmo assim. Quando o painel
 * se fecha, volta a abrir.
 */
export function TouchToolbar({ runtime }: { runtime: GameRuntime }) {
  const tool = useHudStore((s) => s.touchTool);
  const additive = useHudStore((s) => s.touchAdditive);
  const hasSelection = useHudStore((s) => s.selectedUnits.length > 0 || s.selectedBuilding !== null || s.inspected !== null);
  const busy = useHudStore((s) => s.selectedUnits.length > 0 || s.selectedBuilding !== null || s.inspected !== null || s.mode.kind !== 'normal');
  // escolha manual do jogador, válida só enquanto o painel continuar no mesmo estado (aberto/fechado)
  const [manual, setManual] = useState<{ busy: boolean; open: boolean } | null>(null);
  const open = manual && manual.busy === busy ? manual.open : !busy;
  const current = TOOLS.find((t) => t.tool === tool) ?? TOOLS[0]!;

  return (
    <div
      className="pointer-events-auto absolute top-[6.5rem] right-2 z-10 grid gap-1.5 sm:top-28 sm:right-3 [@media(max-height:520px)]:top-[5.75rem] [@media(max-height:520px)]:grid-cols-3"
      onPointerDown={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Controles de toque"
    >
      <button
        aria-label={open ? 'Recolher controles' : 'Abrir controles'}
        aria-expanded={open}
        className={`cmd-btn touch-btn touch-toggle ${open ? '' : 'is-collapsed'}`}
        title={open ? 'Recolher os controles de toque' : `Controles de toque (ferramenta: ${current.label})`}
        onClick={() => setManual({ busy, open: !open })}
      >
        <span className="text-base leading-none" aria-hidden>
          {open ? '▴' : current.icon}
        </span>
        <span>{open ? 'Recolher' : 'Menu ▾'}</span>
      </button>
      {open && (
        <div className="touch-list contents">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              aria-label={t.label}
              className="cmd-btn touch-btn"
              aria-pressed={tool === t.tool}
              title={t.hint}
              onClick={() => runtime.setTouchTool(tool === t.tool && t.tool !== 'select' ? 'select' : t.tool)}
            >
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
      )}
    </div>
  );
}
