import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterFullscreen, exitFullscreen, fullscreenMode, isFullscreen, toggleFullscreen } from '../lib/fullscreen.ts';
import { parseSettings, type Settings } from '../state/useSettingsStore.ts';

/** Documento falso com a Fullscreen API (padrão ou só com prefixo webkit). */
function fakeDom(opts: { api?: 'std' | 'webkit' | null; ua?: string; standalone?: boolean; rejects?: boolean } = {}) {
  const api = opts.api === undefined ? 'std' : opts.api;
  const calls: string[] = [];
  const d: Record<string, unknown> = { fullscreenElement: null, addEventListener() {}, removeEventListener() {} };
  const el: Record<string, unknown> = {};
  if (api === 'std') {
    d.fullscreenEnabled = true;
    el.requestFullscreen = async (o: FullscreenOptions) => {
      calls.push(`request:${o?.navigationUI}`);
      if (opts.rejects) throw new Error('negado');
      d.fullscreenElement = el;
    };
    d.exitFullscreen = async () => {
      calls.push('exit');
      d.fullscreenElement = null;
    };
  } else if (api === 'webkit') {
    d.webkitFullscreenEnabled = true;
    el.webkitRequestFullscreen = async () => {
      calls.push('webkit-request');
      d.webkitFullscreenElement = el;
    };
    d.webkitExitFullscreen = async () => {
      calls.push('webkit-exit');
      d.webkitFullscreenElement = null;
    };
  }
  d.documentElement = el;
  vi.stubGlobal('document', d);
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { userAgent: opts.ua ?? 'Mozilla/5.0 (Linux; Android 14)', standalone: opts.standalone });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: !!opts.standalone && q.includes('display-mode') }));
  vi.stubGlobal('screen', {
    orientation: {
      lock: async (o: string) => void calls.push(`lock:${o}`),
      unlock: () => void calls.push('unlock'),
    },
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('tela cheia', () => {
  it('escolhe a forma certa para cada aparelho', () => {
    fakeDom();
    expect(fullscreenMode()).toBe('api');
    fakeDom({ api: 'webkit' });
    expect(fullscreenMode()).toBe('api');
    // iPhone: o Safari não tem tela cheia de páginas → orientar a instalar na tela de início
    fakeDom({ api: null, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    expect(fullscreenMode()).toBe('install');
    // já instalado como app: nada a oferecer
    fakeDom({ standalone: true });
    expect(fullscreenMode()).toBe('none');
    fakeDom({ api: null });
    expect(fullscreenMode()).toBe('none');
  });

  it('entra escondendo a navegação, trava na horizontal só quando pedido e sai destravando', async () => {
    const calls = fakeDom();
    expect(await enterFullscreen()).toBe(true);
    expect(isFullscreen()).toBe(true);
    expect(calls).toEqual(['request:hide']);
    // em tela cheia o botão continua disponível para sair, mesmo com display-mode: fullscreen
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(fullscreenMode()).toBe('api');
    await exitFullscreen();
    expect(isFullscreen()).toBe(false);
    expect(await enterFullscreen(true)).toBe(true);
    expect(calls).toEqual(['request:hide', 'unlock', 'exit', 'request:hide', 'lock:landscape']);
  });

  it('alterna e usa os nomes webkit quando só eles existem', async () => {
    const calls = fakeDom({ api: 'webkit' });
    expect(await toggleFullscreen()).toBe(true);
    expect(await toggleFullscreen()).toBe(false);
    expect(calls).toEqual(['webkit-request', 'unlock', 'webkit-exit']);
  });

  it('recusa do navegador (sem gesto do jogador) não quebra nada', async () => {
    fakeDom({ rejects: true });
    expect(await enterFullscreen(true)).toBe(false);
    expect(isFullscreen()).toBe(false);
    fakeDom({ api: null });
    expect(await enterFullscreen()).toBe(false);
  });

  it('as preferências de tela cheia ficam salvas', () => {
    const base: Settings = { quality: 'low', shadows: true, panSpeed: 1, edgeScroll: false, showFps: false, reducedMotion: false, autoFullscreen: true, lockLandscape: false };
    expect(parseSettings(JSON.stringify({ autoFullscreen: false, lockLandscape: true }), base)).toMatchObject({ autoFullscreen: false, lockLandscape: true });
    // configurações antigas (sem os campos) herdam o padrão do aparelho
    expect(parseSettings(JSON.stringify({ quality: 'high' }), base)).toMatchObject({ autoFullscreen: true, lockLandscape: false });
  });
});
