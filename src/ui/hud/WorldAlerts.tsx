import { useEffect } from 'react';
import { ChevronsUp, Landmark, Radiation, Satellite, Swords, type LucideIcon } from 'lucide-react';
import { useHudStore, type WorldAlert, type WorldAlertIcon } from '../../state/useHudStore.ts';

/** Quanto tempo cada alerta mundial fica na tela (ms); a faixa cinematográfica fica um pouco mais. */
const ALERT_MS = 7000;
const BIG_MS = 5500;

const ICONS: Record<WorldAlertIcon, LucideIcon> = { war: Swords, era: ChevronsUp, nuclear: Radiation, project: Landmark, satellite: Satellite };

const TONE: Record<WorldAlert['tone'], { color: string; border: string }> = {
  info: { color: '#5aa9e6', border: 'border-l-signal-blue' },
  warn: { color: '#e2b54d', border: 'border-l-brass-400' },
  bad: { color: '#e85c4e', border: 'border-l-signal-red' },
};

const lifetime = (a: WorldAlert) => (a.big ? BIG_MS : ALERT_MS);

/**
 * Alertas mundiais (03/11; Sala de Situação, 05/11). Todos os jogadores recebem os grandes eventos (guerra declarada,
 * nova era, pesquisa nuclear, Grande Projeto, satélite) numa faixa no topo; os grandes momentos do próprio jogador
 * (`big`) viram a faixa cinematográfica no centro da tela, por alguns segundos. Um toque fecha antes.
 */
export function WorldAlerts() {
  const alerts = useHudStore((s) => s.worldAlerts);
  const drop = useHudStore((s) => s.dropWorldAlert);
  useEffect(() => {
    if (!alerts.length) return;
    const next = Math.min(...alerts.map((a) => a.at + lifetime(a)));
    const t = window.setTimeout(() => {
      const now = performance.now();
      for (const a of useHudStore.getState().worldAlerts) if (now - a.at >= lifetime(a) - 50) drop(a.id);
    }, Math.max(50, next - performance.now()));
    return () => window.clearTimeout(t);
  }, [alerts, drop]);
  if (!alerts.length) return null;
  const big = alerts.filter((a) => a.big).at(-1);
  const small = alerts.filter((a) => !a.big);
  return (
    <>
      {big && <CinematicBand key={big.id} alert={big} onClose={() => drop(big.id)} />}
      {small.length > 0 && (
        <div className="pointer-events-none absolute top-16 left-1/2 z-40 flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-1.5" role="status" aria-live="assertive">
          {small.map((a) => {
            const Icon = ICONS[a.icon];
            const t = TONE[a.tone];
            return (
              <button key={a.id} className={`world-alert nc-event pointer-events-auto flex items-center gap-3 border-l-[3px] px-3 py-2 text-left ${t.border}`} onClick={() => drop(a.id)} title="Fechar">
                <span className="grid h-8 w-8 shrink-0 place-items-center" style={{ color: t.color, background: `${t.color}1f`, clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' }}>
                  <Icon size={17} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="nc-kicker block" style={{ color: t.color }}>
                    {a.title}
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold text-ink-50">{a.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Faixa cinematográfica dos grandes momentos (maquete 3): ícone em hexágono, rótulo, título grande e a explicação. */
function CinematicBand({ alert, onClose }: { alert: WorldAlert; onClose: () => void }) {
  const Icon = ICONS[alert.icon];
  const color = alert.tone === 'bad' ? '#e85c4e' : '#e2b54d';
  return (
    <div className="nc-cine pointer-events-none absolute inset-x-0 top-[30%] z-40 flex justify-center [@media(max-height:520px)]:top-[24%]" role="status" aria-live="assertive">
      <button className="nc-cine-band pointer-events-auto flex w-full flex-col items-center px-4 py-5 text-center sm:py-6 [@media(max-height:520px)]:py-3" style={{ ['--cine' as string]: color }} onClick={onClose} title="Fechar">
        <span className="mb-2 grid h-12 w-12 place-items-center border sm:h-14 sm:w-14 [@media(max-height:520px)]:mb-1 [@media(max-height:520px)]:h-9 [@media(max-height:520px)]:w-9" style={{ color, borderColor: `${color}99`, background: `${color}1a`, clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' }}>
          <Icon size={26} aria-hidden />
        </span>
        <span className="nc-cine-kicker" style={{ color }}>
          {alert.title}
        </span>
        <span className="nc-title mt-1.5 text-3xl leading-none tracking-[0.08em] text-ink-50 sm:text-5xl [@media(max-height:520px)]:text-3xl">{alert.text}</span>
        {alert.sub && <span className="mt-2 max-w-xl text-sm text-ink-200 sm:text-base [@media(max-height:520px)]:mt-1 [@media(max-height:520px)]:text-xs">{alert.sub}</span>}
      </button>
    </div>
  );
}
