import '@fontsource/michroma/latin-400.css';
import { useCallback, useEffect, useState } from 'react';
import { GAME_VERSION } from '../../../shared/version.ts';
import { prefersReducedMotion } from '../../lib/graphics.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { markIntroSeen } from '../manual.ts';

const TITLE = ['NATIONS', 'COMMANDER'];
/** Duração da abertura antes do fade (ms) e do fade para a tela seguinte. */
const PLAY_MS = 4300;
const PLAY_REDUCED_MS = 1700;
const OUT_MS = 800;

const STATUS = ['Estabelecendo enlace seguro…', 'Sincronizando teatro de operações…', 'Carregando dados nacionais…', 'Comando pronto'];

/**
 * Abertura no estilo RTS depois do login: fundo preto com grade tática e radar discretos, o nome
 * "NATIONS COMMANDER" surgindo letra a letra em branco (fonte Michroma), linha de destaque, reflexo
 * de luz e uma barra de "inicialização". Em seguida faz um fade para o manual (ou o menu), que
 * entra por baixo. Toque, clique ou tecla pula. Toca uma vez por sessão; com "reduzir movimento",
 * é curta e sem deslocamentos.
 */
export function IntroOverlay() {
  const phase = useAppStore((s) => s.intro);
  const reducedSetting = useSettingsStore((s) => s.reducedMotion);
  const reduced = reducedSetting || prefersReducedMotion();
  const [status, setStatus] = useState(0);
  const [coords, setCoords] = useState('00°00′N · 000°00′W');

  const finish = useCallback(() => {
    if (useAppStore.getState().intro !== 'play') return;
    markIntroSeen();
    useAppStore.setState({ intro: 'out' });
    window.setTimeout(() => useAppStore.setState({ intro: 'off' }), OUT_MS);
  }, []);

  useEffect(() => {
    const total = reduced ? PLAY_REDUCED_MS : PLAY_MS;
    const end = window.setTimeout(finish, total);
    const steps = STATUS.map((_, i) => window.setTimeout(() => setStatus(i), (total * 0.85 * i) / (STATUS.length - 1)));
    // coordenadas "varrendo" o globo enquanto o comando sincroniza
    const tick = window.setInterval(() => {
      const lat = Math.floor(Math.random() * 90);
      const lon = Math.floor(Math.random() * 180);
      const m = () => String(Math.floor(Math.random() * 60)).padStart(2, '0');
      setCoords(`${String(lat).padStart(2, '0')}°${m()}′${Math.random() < 0.5 ? 'N' : 'S'} · ${String(lon).padStart(3, '0')}°${m()}′${Math.random() < 0.5 ? 'E' : 'W'}`);
    }, 120);
    // pular: toque, clique ou tecla (ignora o próprio toque do login, nos primeiros 400 ms)
    const started = performance.now();
    const skip = () => performance.now() - started > 400 && finish();
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.clearTimeout(end);
      steps.forEach((t) => window.clearTimeout(t));
      window.clearInterval(tick);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [finish, reduced]);

  let n = 0;
  return (
    <div
      className={`intro-root fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black text-white select-none ${phase === 'out' ? 'intro-out' : ''} ${reduced ? 'intro-reduced' : ''}`}
      style={{ ['--intro-out' as string]: `${OUT_MS}ms` }}
      role="img"
      aria-label="Nations Commander"
    >
      <div className="intro-grid absolute inset-0" aria-hidden />
      <div className="intro-radar absolute" aria-hidden>
        <div className="intro-sweep absolute inset-0 rounded-full" />
      </div>
      <div className="intro-vignette absolute inset-0" aria-hidden />
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <span key={c} className={`intro-corner intro-corner-${c}`} aria-hidden />
      ))}

      <div className="intro-hud absolute top-[max(1.25rem,env(safe-area-inset-top))] left-5 text-[10px] tracking-[0.3em] text-white/45 sm:left-8" aria-hidden>
        SISTEMA DE COMANDO · v{GAME_VERSION}
      </div>
      <div className="intro-hud absolute top-[max(1.25rem,env(safe-area-inset-top))] right-5 hidden font-mono sm:block text-[10px] tracking-[0.15em] text-white/45 sm:right-8" aria-hidden>
        {coords}
      </div>

      <div className="relative flex flex-col items-center px-4 text-center">
        <h1 className="intro-title relative flex flex-wrap justify-center gap-x-[0.5em] gap-y-1 font-normal text-white" style={{ fontFamily: '"Michroma", var(--font-display)' }}>
          {TITLE.map((word) => (
            <span key={word} className="whitespace-nowrap">
              {[...word].map((ch) => (
                <span key={n} className="intro-letter inline-block" style={{ animationDelay: `${250 + n++ * 60}ms` }}>
                  {ch}
                </span>
              ))}
            </span>
          ))}
          <span className="intro-shine pointer-events-none absolute inset-0" aria-hidden />
        </h1>
        <div className="intro-line mt-4 h-px w-[min(34rem,80vw)]" aria-hidden />
        <div className="intro-sub mt-4 text-[10px] tracking-[0.45em] text-white/60 sm:text-xs">MODERN GEOPOLITICAL REAL STRATEGY</div>
      </div>

      <div className="intro-status absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 w-[min(22rem,80vw)] -translate-x-1/2 text-center" aria-hidden>
        <div className="mb-2 text-[10px] tracking-[0.25em] text-white/55 uppercase">{STATUS[status]}</div>
        <div className="h-[2px] overflow-hidden rounded bg-white/10">
          <div className="intro-progress h-full" style={{ animationDuration: `${(reduced ? PLAY_REDUCED_MS : PLAY_MS) * 0.95}ms` }} />
        </div>
      </div>
      <div className="intro-hint absolute right-5 bottom-[max(0.75rem,env(safe-area-inset-bottom))] text-[10px] tracking-[0.2em] text-white/35 sm:right-8" aria-hidden>
        TOQUE PARA PULAR
      </div>
    </div>
  );
}
