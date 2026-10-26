import { useSyncExternalStore } from 'react';

/**
 * Tela cheia, principalmente para celulares e tablets.
 *
 * - **Fullscreen API** (Android, iPad, computadores): `requestFullscreen` no documento inteiro,
 *   escondendo a barra do navegador; usa os nomes com prefixo `webkit` quando só eles existem.
 * - **iPhone**: o Safari não permite tela cheia de páginas (só de vídeos). A alternativa é instalar
 *   o jogo na tela de início, que abre sem barras graças ao manifesto (`display: fullscreen`).
 * - **App instalado** (PWA): já está em tela cheia; o botão some.
 *
 * Pedidos de tela cheia só funcionam dentro de um gesto do jogador (toque/clique). Por isso o
 * jogo pede tela cheia no toque de "Iniciar Operação"/"Nova Partida" e oferece um aviso tocável
 * dentro da partida — nunca sozinho.
 */

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: (opts?: FullscreenOptions) => Promise<void> | void };
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void>; unlock?: () => void };

const doc = () => (typeof document === 'undefined' ? null : (document as FsDocument));

/** O navegador permite tela cheia de páginas? */
export function fullscreenSupported(): boolean {
  const d = doc();
  if (!d) return false;
  const el = d.documentElement as FsElement;
  return Boolean((d.fullscreenEnabled ?? d.webkitFullscreenEnabled) && (el.requestFullscreen || el.webkitRequestFullscreen));
}

export function isFullscreen(): boolean {
  const d = doc();
  return Boolean(d && (d.fullscreenElement ?? d.webkitFullscreenElement));
}

/** Aberto como aplicativo instalado (sem barras do navegador). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // em tela cheia pela API o navegador também responde "display-mode: fullscreen" — não é app instalado
  if (isFullscreen()) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const mm = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return nav.standalone === true || mm('(display-mode: fullscreen)') || mm('(display-mode: standalone)');
}

/** iPhone/iPod (inclui iPadOS com tela pequena não; iPad tem a API de tela cheia). */
export function isIPhone(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent);
}

/** O que o botão de tela cheia deve oferecer neste aparelho. */
export type FullscreenMode = 'api' | 'install' | 'none';
export function fullscreenMode(): FullscreenMode {
  if (isStandalone()) return 'none';
  if (fullscreenSupported()) return 'api';
  return isIPhone() ? 'install' : 'none';
}

/**
 * Entra em tela cheia (chamar dentro de um toque/clique). Com `landscape`, tenta também travar a
 * tela na horizontal (Android; ignorado onde não existe). Nunca lança: devolve se conseguiu.
 */
export async function enterFullscreen(landscape = false): Promise<boolean> {
  const d = doc();
  if (!d || !fullscreenSupported()) return false;
  if (!isFullscreen()) {
    const el = d.documentElement as FsElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    } catch {
      return false;
    }
  }
  if (landscape) {
    try {
      await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
    } catch {
      // travar orientação não é suportado em todo aparelho; segue em tela cheia mesmo assim
    }
  }
  return isFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  const d = doc();
  if (!d || !isFullscreen()) return;
  try {
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  } catch {
    // sem trava ativa
  }
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    // já saiu (gesto de voltar do sistema)
  }
}

export async function toggleFullscreen(landscape = false): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return enterFullscreen(landscape);
}

function subscribe(cb: () => void): () => void {
  const d = doc();
  if (!d) return () => {};
  d.addEventListener('fullscreenchange', cb);
  d.addEventListener('webkitfullscreenchange', cb);
  return () => {
    d.removeEventListener('fullscreenchange', cb);
    d.removeEventListener('webkitfullscreenchange', cb);
  };
}

/** Estado reativo: atualiza também quando o jogador sai pelo gesto de voltar ou pela tecla Esc. */
export function useFullscreen(): boolean {
  return useSyncExternalStore(subscribe, isFullscreen, () => false);
}
