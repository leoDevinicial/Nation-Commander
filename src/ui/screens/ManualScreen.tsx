import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/useAppStore.ts';
import { MANUAL, markManualRead } from '../manual.ts';
import { Shell } from '../components/Shell.tsx';

/**
 * Manual do jogo antes do menu: um cartão por assunto, com avanço por botão, setas do teclado ou
 * deslize no celular. Chegar ao último cartão e tocar em "Começar" marca como lido; "Pular por
 * agora" vai ao menu, mas o manual volta na próxima entrada até ser lido inteiro.
 */
export function ManualScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const [i, setI] = useState(0);
  const last = MANUAL.length - 1;
  const card = MANUAL[i]!;
  const go = (n: number) => setI(Math.max(0, Math.min(last, n)));
  const finish = () => {
    markManualRead();
    setScreen('menu');
  };
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((v) => Math.min(last, v + 1));
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  return (
    <Shell>
      <div
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(i + (dx < 0 ? 1 : -1));
        }}
        className="touch-pan-y"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[11px] font-semibold tracking-[0.28em] text-brass-400 uppercase">Manual de campo</div>
          <button className="btn min-h-9 px-3 py-1 text-xs" onClick={() => setScreen('menu')}>
            Pular por agora
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-400">O essencial para jogar bem, em {MANUAL.length} cartões curtos (≈2 min).</p>

        <section key={i} className="manual-card mt-4 min-h-[16rem]" aria-live="polite" aria-labelledby="manual-title">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-850 text-2xl" aria-hidden>
              {card.icon}
            </span>
            <div>
              <div className="text-[11px] text-ink-400">
                {i + 1} de {MANUAL.length}
              </div>
              <h1 id="manual-title" className="font-display text-xl font-bold tracking-wide text-ink-100">
                {card.title}
              </h1>
            </div>
          </div>
          <p className="mt-3 text-[15px] leading-snug font-medium text-ink-100">{card.lead}</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-snug text-ink-200">
            {card.points.map((p) => (
              <li key={p} className="flex gap-2">
                {!/^\d\./.test(p) && (
                  <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-brass-400" aria-hidden />
                )}
                <span>{p}</span>
              </li>
            ))}
          </ul>
          {card.tip && <p className="mt-3 rounded border border-brass-400/40 bg-brass-400/10 px-3 py-2 text-xs leading-snug text-ink-100">💡 {card.tip}</p>}
        </section>

        <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="Cartões do manual">
          {MANUAL.map((c, n) => (
            <button
              key={c.title}
              role="tab"
              aria-selected={n === i}
              aria-label={`${n + 1}: ${c.title}`}
              onClick={() => go(n)}
              className={`h-2 rounded-full transition-all duration-300 ${n === i ? 'w-6 bg-brass-400' : n < i ? 'w-2 bg-brass-400/50' : 'w-2 bg-ink-600'}`}
            />
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn min-h-11 flex-1" disabled={i === 0} onClick={() => go(i - 1)}>
            ← Voltar
          </button>
          {i < last ? (
            <button className="btn btn-primary min-h-11 flex-[2]" onClick={() => go(i + 1)}>
              Próximo →
            </button>
          ) : (
            <button className="btn btn-primary min-h-11 flex-[2]" onClick={finish}>
              Entendi, começar ▶
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
