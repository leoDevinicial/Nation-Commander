import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Faixa que rola na horizontal quando o conteúdo não cabe (16/11). Antes a barra de recursos e as abas do painel
 * nacional cortavam sem aviso: só dava para ver o resto clicando na faixa e usando as setas do teclado, que também
 * moviam a câmera. Agora:
 * - setas de latão aparecem na borda que tem mais conteúdo e rolam 70% da largura;
 * - a roda do mouse rola a faixa (e não dá zoom na câmera);
 * - dá para arrastar com o mouse ou o dedo (o clique de quem arrastou não aciona o item).
 */
export function ScrollStrip({ children, className = '', innerClassName = '', role, ariaLabel }: { children: ReactNode; className?: string; innerClassName?: string; role?: string; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const dragged = useRef(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdge((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  // o conteúdo muda a cada snapshot (números): confere depois de cada render, sem custo quando nada muda
  useLayoutEffect(update);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 2) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
    };
  }, [update]);

  const by = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        className={`no-scrollbar overflow-x-auto ${innerClassName}`}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || e.button !== 0) return;
          drag.current = { x: e.clientX, left: ref.current?.scrollLeft ?? 0, moved: false, id: e.pointerId };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || e.pointerId !== d.id || !ref.current) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) < 6) return;
          if (!d.moved) ref.current.setPointerCapture(e.pointerId);
          d.moved = true;
          ref.current.scrollLeft = d.left - dx;
        }}
        onPointerUp={(e) => {
          if (drag.current?.moved) dragged.current = true;
          drag.current = null;
          if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
        }}
        onClickCapture={(e) => {
          // quem arrastou para rolar não quis clicar no item embaixo do ponteiro
          if (dragged.current) {
            e.stopPropagation();
            e.preventDefault();
            dragged.current = false;
          }
        }}
      >
        {children}
      </div>
      {edge.left && (
        <button type="button" className="nc-strip-arrow nc-strip-arrow-l" onClick={() => by(-1)} aria-label="Rolar para a esquerda" title="Mais à esquerda">
          <ChevronLeft size={16} aria-hidden />
        </button>
      )}
      {edge.right && (
        <button type="button" className="nc-strip-arrow nc-strip-arrow-r" onClick={() => by(1)} aria-label="Rolar para a direita" title="Mais à direita (ou role a roda do mouse)">
          <ChevronRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
