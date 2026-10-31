import { useEffect, useState } from 'react';
import { enterFullscreen, fullscreenMode, isFullscreen, toggleFullscreen, useFullscreen } from '../../lib/fullscreen.ts';
import { isTouchDevice } from '../../lib/graphics.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';

/**
 * Chamado nos toques que iniciam uma partida ("Nova Partida", "Iniciar Operação", "Estou Pronto",
 * "Entrar em Sala"): com a opção ligada, num aparelho de toque, entra em tela cheia. Precisa ser
 * chamado dentro do próprio gesto — o navegador recusa pedidos fora dele.
 */
export function autoFullscreen(): void {
  const s = useSettingsStore.getState();
  if (!s.autoFullscreen || !isTouchDevice() || fullscreenMode() !== 'api' || isFullscreen()) return;
  void enterFullscreen(s.lockLandscape);
}

function FullscreenIcon({ active }: { active: boolean }) {
  // cantos para fora (entrar) ou para dentro (sair); SVG porque ⛶ falta em muitas fontes móveis
  const d = active ? 'M5 1v4H1M11 1v4h4M5 15v-4H1M11 15v-4h4' : 'M1 5V1h4M15 5V1h-4M1 11v4h4M15 11v4h-4';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Instruções para o iPhone, onde páginas não podem entrar em tela cheia. */
export function InstallTip({ onClose }: { onClose: () => void }) {
  return (
    <div className="panel w-72 p-3 text-xs text-ink-200" role="dialog" aria-label="Tela cheia no iPhone">
      <div className="mb-1 font-semibold text-ink-100">Tela cheia no iPhone</div>
      <p>O Safari do iPhone não deixa páginas ocuparem a tela toda. Para jogar sem as barras do navegador:</p>
      <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
        <li>
          toque em <b>Compartilhar</b> (quadrado com seta para cima);
        </li>
        <li>
          escolha <b>Adicionar à Tela de Início</b>;
        </li>
        <li>abra o jogo pelo novo ícone — ele abre em tela cheia.</li>
      </ol>
      <button className="btn mt-2 min-h-9 w-full" onClick={onClose}>
        Entendi
      </button>
    </div>
  );
}

/**
 * Botão de tela cheia. `hud`: compacto, na barra superior da partida. `floating`: canto superior
 * direito das telas de menu. Some quando o jogo já roda como aplicativo instalado ou o navegador
 * não oferece nenhuma forma de tela cheia.
 */
export function FullscreenButton({ variant = 'hud' }: { variant?: 'hud' | 'floating' }) {
  const active = useFullscreen();
  const lockLandscape = useSettingsStore((s) => s.lockLandscape);
  const [tip, setTip] = useState(false);
  const mode = fullscreenMode();
  if (mode === 'none') return null;
  const label = mode === 'install' ? 'Como jogar em tela cheia' : active ? 'Sair da tela cheia' : 'Tela cheia';
  const cls =
    variant === 'hud'
      ? `btn min-h-8 px-2 py-1 text-xs whitespace-nowrap ${active ? 'btn-primary' : ''}`
      : `btn min-h-10 min-w-10 justify-center px-2.5 ${active ? 'btn-primary' : ''}`;
  return (
    <div className={variant === 'floating' ? 'fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30' : 'relative'}>
      <button
        className={cls}
        aria-label={label}
        aria-pressed={mode === 'api' ? active : undefined}
        title={mode === 'api' ? `${label}${active ? ' (ou gesto de voltar / Esc)' : ''}` : label}
        onClick={() => (mode === 'install' ? setTip(!tip) : void toggleFullscreen(lockLandscape))}
      >
        <FullscreenIcon active={active} />
        {variant === 'hud' && <span className="hidden min-[2100px]:inline">{active ? 'Sair' : 'Tela cheia'}</span>}
      </button>
      {tip && (
        <div className={`absolute right-0 z-50 ${variant === 'floating' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <InstallTip onClose={() => setTip(false)} />
        </div>
      )}
    </div>
  );
}

const PROMPT_KEY = 'nc.fullscreenPrompt.v1';

/**
 * Convite dentro da partida, só em aparelhos de toque fora da tela cheia: um toque entra em tela
 * cheia (o toque é o gesto exigido pelo navegador). Dispensar vale para a sessão; no iPhone, a dica
 * de instalação é mostrada uma única vez. Depois que o jogador usou a tela cheia na sessão, o
 * convite não volta se ele sair dela de propósito (o botão da barra continua lá).
 */
export function FullscreenPrompt() {
  const active = useFullscreen();
  const lockLandscape = useSettingsStore((s) => s.lockLandscape);
  const mode = fullscreenMode();
  const store = mode === 'install' ? localStorage : sessionStorage;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return store.getItem(PROMPT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [tip, setTip] = useState(false);
  const dismiss = () => {
    setDismissed(true);
    try {
      store.setItem(PROMPT_KEY, '1');
    } catch {
      // armazenamento indisponível: dispensa só nesta tela
    }
  };
  useEffect(() => {
    if (!active) return;
    try {
      sessionStorage.setItem(PROMPT_KEY, '1');
    } catch {
      // sem armazenamento: o convite só reaparece se a tela for recriada
    }
  }, [active]);
  // lido a cada render: a sessão pode ter usado a tela cheia depois que o convite foi montado
  let usedThisSession = false;
  try {
    usedThisSession = sessionStorage.getItem(PROMPT_KEY) === '1';
  } catch {
    // sem armazenamento
  }
  if (!isTouchDevice() || mode === 'none' || active || dismissed || usedThisSession) return null;
  return (
    <div className="pointer-events-auto absolute top-12 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1" role="region" aria-label="Tela cheia">
      <div className="panel flex w-max items-center gap-2 py-1.5 pr-1.5 pl-3 text-xs">
        <span className="whitespace-nowrap text-ink-200">{mode === 'install' ? 'Jogar sem as barras?' : 'Mais espaço para o mapa'}</span>
        <button
          className="btn btn-primary min-h-9 px-3 whitespace-nowrap"
          onClick={() => {
            if (mode === 'install') setTip(true);
            else void enterFullscreen(lockLandscape).then((ok) => ok && dismiss());
          }}
        >
          <FullscreenIcon active={false} />
          {mode === 'install' ? 'Como?' : 'Tela cheia'}
        </button>
        <button className="btn min-h-9 px-2.5" aria-label="Dispensar" onClick={dismiss}>
          ✕
        </button>
      </div>
      {tip && (
        <InstallTip
          onClose={() => {
            setTip(false);
            dismiss();
          }}
        />
      )}
    </div>
  );
}
