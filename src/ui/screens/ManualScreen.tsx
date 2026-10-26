import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/useAppStore.ts';
import { MANUAL, manualRead, markManualRead } from '../manual.ts';
import { Shell } from '../components/Shell.tsx';

/**
 * Manual do jogo antes do menu: um cartão por assunto, com avanço por botão, setas do teclado ou
 * deslize no celular. Chegar ao último cartão e tocar em "Começar" marca como lido; "Pular por
 * agora" pede confirmação (o manual é importante) e vai ao menu, mas o manual volta na próxima
 * entrada até ser lido inteiro. A entrada é animada (o painel surge e os blocos aparecem em
 * sequência) para a passagem do login ao manual não ser um corte seco.
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
  // quem já leu (abriu pelo botão do menu) sai sem aviso
  const [alreadyRead] = useState(manualRead);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const skip = () => (alreadyRead ? setScreen('menu') : setConfirmSkip(true));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmSkip) {
        if (e.key === 'Escape') setConfirmSkip(false);
        return;
      }
      if (e.key === 'ArrowRight') setI((v) => Math.min(last, v + 1));
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, confirmSkip]);

  return (
    <Shell enter>
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
        <div className="manual-stagger flex items-center justify-between gap-3" style={{ animationDelay: '250ms' }}>
          <div className="font-display text-[11px] font-semibold tracking-[0.28em] text-brass-400 uppercase">Manual de campo</div>
          {i < last && (
            <button className="btn min-h-9 px-3 py-1 text-xs" onClick={skip}>
              {alreadyRead ? 'Fechar' : 'Pular por agora'}
            </button>
          )}
        </div>
        <p className="manual-stagger mt-1 text-xs text-ink-400" style={{ animationDelay: '330ms' }}>O essencial para jogar bem, em {MANUAL.length} cartões curtos (≈2 min).</p>

        <section key={i} className={`mt-4 min-h-[16rem] ${i === 0 ? 'manual-stagger' : 'manual-card'}`} style={i === 0 ? { animationDelay: '430ms' } : undefined} aria-live="polite" aria-labelledby="manual-title">
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

        <div className="manual-stagger mt-4 flex justify-center gap-1.5" style={{ animationDelay: '560ms' }} role="tablist" aria-label="Cartões do manual">
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

        <div className="manual-stagger mt-4 flex gap-2" style={{ animationDelay: '640ms' }}>
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
      {confirmSkip && (
        <SkipWarning
          card={i + 1}
          onRead={() => setConfirmSkip(false)}
          onSkip={() => {
            setConfirmSkip(false);
            setScreen('menu');
          }}
        />
      )}
    </Shell>
  );
}

/** Aviso ao pular: o manual explica regras que não são óbvias e travam quem não as conhece. */
function SkipWarning({ card, onRead, onSkip }: { card: number; onRead: () => void; onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/75 p-3 sm:items-center" onPointerDown={(e) => e.target === e.currentTarget && onRead()}>
      <div className="manual-pop panel w-full max-w-md p-4 text-sm" role="alertdialog" aria-modal="true" aria-labelledby="skip-title" aria-describedby="skip-body">
        <div id="skip-title" className="text-base font-semibold text-brass-400">
          ⚠ Pular o manual?
        </div>
        <div id="skip-body" className="mt-2 space-y-2 text-ink-200">
          <p>Leva só uns 2 minutos e explica regras que não são óbvias — quem pula costuma travar nos primeiros minutos:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-300">
            <li>cada tropa precisa de um <b>recruta</b> da Base Militar (sem ele, o botão fica bloqueado);</li>
            <li>atacar exige <b>guerra declarada</b> pelo Globo;</li>
            <li>as melhorias são pagas com a <b>verba de obras</b> (US$) do orçamento do país;</li>
            <li>sem <b>moradia</b> e <b>comida</b>, a população não cresce.</li>
          </ul>
          <p className="text-xs text-ink-400">
            Você está no cartão {card} de {MANUAL.length}. Se pular, o manual aparece de novo na próxima entrada e fica sempre no botão Manual do menu.
          </p>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn min-h-11" onClick={onSkip}>
            Pular mesmo assim
          </button>
          <button className="btn btn-primary min-h-11" onClick={onRead} autoFocus>
            Continuar lendo
          </button>
        </div>
      </div>
    </div>
  );
}
