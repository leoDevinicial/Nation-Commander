import { create } from 'zustand';
import type { ClientDevice, ClientDiagKind } from '../../shared/protocol.ts';
import { gameClient } from '../net/client.ts';
import { useAppStore } from '../state/useAppStore.ts';
import { useSettingsStore } from '../state/useSettingsStore.ts';
import type { GraphicsPreset } from './graphics.ts';

/**
 * Diagnóstico do navegador e modo leve automático (21/11).
 *
 * Num relato de 20/11, um jogador teve 8 quedas "conexão perdida" numa partida e a tela ficou branca com a interface
 * viva: a parte gráfica estourava no aparelho dele e derrubava a página. O servidor só via a conexão sumir. Agora:
 * - o navegador conta ao servidor quando perde os gráficos, quando a página anterior morreu no meio de uma partida e
 *   os primeiros erros da página, com a placa de vídeo e a memória do aparelho (`client_diag`);
 * - nesses casos o jogo passa sozinho para a qualidade mínima (modo leve), avisa e deixa voltar nas Configurações.
 */

const SESSION_KEY = 'nc.session.v1';
const SAFE_KEY = 'nc.safemode.v1';
/** Batimento da sessão em partida: uma marca a cada tanto, para saber se a página morreu no meio. */
const BEAT_MS = 10_000;
/** Depois disso, a marca velha é de outra visita, não de uma página que acabou de morrer. */
const ABRUPT_WINDOW_MS = 15 * 60_000;
/** Gráficos perdidos sem volta depois deste tempo: modo leve e convite para recarregar. */
export const CONTEXT_RESTORE_WAIT_MS = 6000;
const MAX_ERRORS = 5;
const MAX_QUEUE = 10;

interface SessionMark {
  at: number;
  inMatch: boolean;
  visible: boolean;
  quality: string;
}

interface SafeMode {
  from: GraphicsPreset;
  shadows: boolean;
  reason: string;
  at: number;
}

/** Estado dos gráficos da partida, para a tela de jogo mostrar o aviso de recarregar. */
export const useGfxHealth = create<{ failed: boolean }>(() => ({ failed: false }));

let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
let gpuName: string | undefined;
let inMatch = false;
const queue: { kind: ClientDiagKind; detail?: string; device: ClientDevice; inMatch: boolean }[] = [];
let installed = false;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o diagnóstico só não lembra */
  }
}

/** Nome da placa de vídeo (do contexto da partida, se houver; senão de um contexto descartável, uma vez). */
function gpu(): string | undefined {
  if (gpuName !== undefined) return gpuName || undefined;
  gpuName = '';
  try {
    let ctx = gl;
    let temp: HTMLCanvasElement | null = null;
    if (!ctx) {
      temp = document.createElement('canvas');
      ctx = temp.getContext('webgl2') ?? temp.getContext('webgl');
    }
    if (ctx) {
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      const name: unknown = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
      gpuName = typeof name === 'string' ? name.slice(0, 160) : '';
      if (temp) ctx.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* navegador sem WebGL ou que bloqueia a consulta */
  }
  return gpuName || undefined;
}

/** O que o diagnóstico conta do aparelho: placa de vídeo, memória, núcleos, tela, toque, qualidade e navegador. */
export function deviceInfo(): ClientDevice {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const d: ClientDevice = {
    screen: `${screen.width}x${screen.height}@${Math.round((window.devicePixelRatio || 1) * 100) / 100}`,
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    quality: useSettingsStore.getState().quality,
    userAgent: navigator.userAgent.slice(0, 300),
  };
  const g = gpu();
  if (g) d.gpu = g;
  if (typeof nav.deviceMemory === 'number') d.memoryGb = nav.deviceMemory;
  if (navigator.hardwareConcurrency) d.cores = navigator.hardwareConcurrency;
  return d;
}

/** Manda um diagnóstico ao servidor (ou guarda até a conexão voltar, que é justamente quando ele mais importa). */
export function reportDiag(kind: ClientDiagKind, detail?: string): void {
  const item = { kind, ...(detail ? { detail: detail.slice(0, 600) } : {}), device: deviceInfo(), inMatch };
  if (gameClient.status === 'connected' && gameClient.send({ t: 'client_diag', ...item })) return;
  if (queue.length < MAX_QUEUE) queue.push(item);
}

function flush(): void {
  while (queue.length && gameClient.status === 'connected') {
    if (!gameClient.send({ t: 'client_diag', ...queue[0]! })) return;
    queue.shift();
  }
}

/**
 * Passa para a qualidade mínima, guardando a anterior para o jogador voltar nas Configurações. Vale a partir da
 * próxima cena (a de agora já está montada). Não faz nada se a qualidade já é a mínima.
 */
export function enterSafeMode(reason: string): boolean {
  const s = useSettingsStore.getState();
  if (s.quality === 'low' && !s.shadows) return false;
  if (!read<SafeMode>(SAFE_KEY)) write(SAFE_KEY, { from: s.quality, shadows: s.shadows, reason, at: Date.now() } satisfies SafeMode);
  s.update({ quality: 'low', shadows: false });
  reportDiag('safe_mode', `${reason} (antes: ${s.quality}${s.shadows ? ', sombras' : ''})`);
  useAppStore.getState().pushToast('info', 'Os gráficos falharam neste aparelho: o jogo passou para o modo leve. Dá para voltar nas Configurações.');
  return true;
}

/** Modo leve ligado automaticamente (null: não está). */
export function safeModeInfo(): SafeMode | null {
  return read<SafeMode>(SAFE_KEY);
}

/** O jogador escolheu a qualidade por conta própria: o modo leve automático deixa de valer. */
export function forgetSafeMode(): void {
  write(SAFE_KEY, null);
}

/** Volta para a qualidade de antes do modo leve. */
export function exitSafeMode(): void {
  const prev = read<SafeMode>(SAFE_KEY);
  write(SAFE_KEY, null);
  if (prev) useSettingsStore.getState().update({ quality: prev.from, shadows: prev.shadows });
}

function mark(): void {
  if (!inMatch) return write(SESSION_KEY, null);
  write(SESSION_KEY, { at: Date.now(), inMatch, visible: document.visibilityState === 'visible', quality: useSettingsStore.getState().quality } satisfies SessionMark);
}

/**
 * A página anterior morreu no meio de uma partida, com a aba visível (sem fechar nem trocar de página)? É o caso da
 * aba que o navegador derruba por falta de memória ou de placa de vídeo. Aba em segundo plano que o sistema fecha
 * não conta (no celular isso é normal).
 */
export function wasAbruptEnd(m: SessionMark | null, now: number): boolean {
  return !!m && m.inMatch && m.visible && now - m.at < ABRUPT_WINDOW_MS;
}

/** A partida começou ou terminou nesta página (a tela de jogo avisa). */
export function setInMatch(v: boolean): void {
  inMatch = v;
  if (!v) useGfxHealth.setState({ failed: false });
  mark();
}

/** Gráficos da partida: o runtime avisa quando perde e quando recupera o contexto. */
export const gfxEvents = {
  attach(ctx: WebGLRenderingContext | WebGL2RenderingContext): void {
    gl = ctx;
    // lê já: depois que o contexto se perde, o navegador não informa mais a placa
    gpuName = undefined;
    gpu();
  },
  timer: 0 as ReturnType<typeof setTimeout> | 0,
  lost(): void {
    reportDiag('context_lost');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = 0;
      reportDiag('context_failed', `sem restaurar em ${CONTEXT_RESTORE_WAIT_MS / 1000} s`);
      enterSafeMode('gráficos perdidos na partida');
      useGfxHealth.setState({ failed: true });
    }, CONTEXT_RESTORE_WAIT_MS);
  },
  restored(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    useGfxHealth.setState({ failed: false });
    reportDiag('context_restored');
  },
};

/** Liga o diagnóstico (uma vez, na abertura da página). */
export function installClientDiag(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const prev = read<SessionMark>(SESSION_KEY);
  write(SESSION_KEY, null);
  if (wasAbruptEnd(prev, Date.now())) {
    reportDiag('abrupt_end', `página anterior terminou no meio da partida (qualidade ${prev!.quality})`);
    enterSafeMode('a página anterior caiu no meio da partida');
  }
  gameClient.onStatus((st) => st === 'connected' && flush());
  setInterval(mark, BEAT_MS);
  document.addEventListener('visibilitychange', mark);
  // saída limpa (fechar a aba, recarregar, trocar de página): não é queda
  window.addEventListener('pagehide', () => write(SESSION_KEY, null));
  const seen = new Set<string>();
  const onError = (text: string) => {
    if (seen.size >= MAX_ERRORS || seen.has(text)) return;
    seen.add(text);
    reportDiag('error', text);
  };
  // só erros de script (falha ao carregar imagem ou som também dispara 'error', sem mensagem)
  window.addEventListener('error', (e) => e.message && onError(`${e.message} @ ${String(e.filename).split('/').pop()}:${e.lineno}:${e.colno}`));
  window.addEventListener('unhandledrejection', (e) => onError(`promessa: ${String((e.reason as Error)?.message ?? e.reason).slice(0, 300)}`));
}
