import { useEffect, useRef } from 'react';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { MINIMAP_COLORS } from '../../game/render/TerrainFactory.ts';

const SIZE = 180;

export function Minimap({ runtime }: { runtime: GameRuntime }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const map = runtime.map;
    const worldW = map.width * map.cellSize;
    const scale = SIZE / worldW;

    // terreno desenhado uma única vez
    const bg = document.createElement('canvas');
    bg.width = SIZE;
    bg.height = SIZE;
    const bctx = bg.getContext('2d')!;
    const cellPx = SIZE / map.width;
    for (let cy = 0; cy < map.height; cy++)
      for (let cx = 0; cx < map.width; cx++) {
        bctx.fillStyle = MINIMAP_COLORS[map.terrain[cy * map.width + cx]!];
        bctx.fillRect(cx * cellPx, cy * cellPx, cellPx + 0.5, cellPx + 0.5);
      }
    bctx.fillStyle = '#46d6c4';
    for (const n of map.resourceNodes) bctx.fillRect((n.cx + 0.5) * cellPx, (n.cy + 0.5) * cellPx, cellPx, cellPx);

    const draw = () => {
      const d = runtime.minimapData();
      ctx.drawImage(bg, 0, 0);
      for (const b of d.buildings) {
        ctx.fillStyle = factionColor(b.owner);
        ctx.fillRect(b.cx * cellPx, b.cy * cellPx, b.size * cellPx, b.size * cellPx);
        ctx.strokeStyle = '#0b0f14';
        ctx.strokeRect(b.cx * cellPx, b.cy * cellPx, b.size * cellPx, b.size * cellPx);
      }
      for (const u of d.units) {
        ctx.fillStyle = u.selected ? '#ffffff' : factionColor(u.owner);
        ctx.fillRect(u.x * scale - 1.5, u.y * scale - 1.5, 3, 3);
      }
      const pts = d.view.filter((p): p is NonNullable<typeof p> => p !== null);
      if (pts.length === 4) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale)));
        ctx.closePath();
        ctx.stroke();
      }
    };
    draw();
    const id = setInterval(draw, 200);
    return () => clearInterval(id);
  }, [runtime]);

  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const worldW = runtime.map.width * runtime.map.cellSize;
    const worldH = runtime.map.height * runtime.map.cellSize;
    return { x: ((e.clientX - r.left) / r.width) * worldW, y: ((e.clientY - r.top) / r.height) * worldH };
  };

  return (
    <div className="panel pointer-events-auto shrink-0 p-1.5" onPointerDown={(e) => e.stopPropagation()}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="block cursor-pointer"
        aria-label="Minimapa: clique para mover a câmera, botão direito para mover unidades selecionadas"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          const p = toWorld(e);
          if (e.button === 2) runtime.orderMoveTo(p.x, p.y);
          else {
            runtime.lookAt(p.x, p.y);
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) {
            const p = toWorld(e);
            runtime.lookAt(p.x, p.y);
          }
        }}
      />
    </div>
  );
}
