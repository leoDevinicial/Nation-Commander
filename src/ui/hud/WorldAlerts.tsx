import { useEffect } from 'react';
import { useHudStore } from '../../state/useHudStore.ts';

/** Quanto tempo cada alerta mundial fica na tela (ms). */
const ALERT_MS = 7000;

const TONE: Record<'info' | 'warn' | 'bad', string> = {
  info: 'border-signal-blue/70 bg-ink-900/90',
  warn: 'border-brass-400/80 bg-ink-900/90',
  bad: 'border-signal-red/80 bg-ink-950/90',
};

/**
 * Alertas mundiais (03/11): faixa no topo, como os anúncios de grandes eventos do Rise of Nations. Todos os
 * jogadores recebem: guerra declarada, nova era, pesquisa nuclear e Grande Projeto (início e conclusão). Cada
 * faixa some sozinha em alguns segundos; um toque fecha antes.
 */
export function WorldAlerts() {
  const alerts = useHudStore((s) => s.worldAlerts);
  const drop = useHudStore((s) => s.dropWorldAlert);
  useEffect(() => {
    if (!alerts.length) return;
    const next = Math.min(...alerts.map((a) => a.at + ALERT_MS));
    const t = window.setTimeout(() => {
      const now = performance.now();
      for (const a of useHudStore.getState().worldAlerts) if (now - a.at >= ALERT_MS - 50) drop(a.id);
    }, Math.max(50, next - performance.now()));
    return () => window.clearTimeout(t);
  }, [alerts, drop]);
  if (!alerts.length) return null;
  return (
    <div className="pointer-events-none absolute top-16 left-1/2 z-40 flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-1.5" role="status" aria-live="assertive">
      {alerts.map((a) => (
        <button
          key={a.id}
          className={`world-alert pointer-events-auto flex items-center gap-3 rounded-lg border-2 px-3 py-2 text-left shadow-xl backdrop-blur ${TONE[a.tone]}`}
          onClick={() => drop(a.id)}
          title="Fechar"
        >
          <span className="text-2xl leading-none">{a.icon}</span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold tracking-wider text-ink-300 uppercase">{a.title}</span>
            <span className="block text-sm font-semibold text-ink-50">{a.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
