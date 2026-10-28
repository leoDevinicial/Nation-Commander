/**
 * KAICS Adaptables+ · perfil do aparelho e meta de quadros (C2/C3 da especificação v2).
 *
 * Tudo aqui é derivado de evidência, e cada valor guarda de onde veio: a classe do aparelho sai do
 * nome do renderizador (renderização por software) e do tipo de tela (toque + lado curto), nunca
 * de marca ou modelo. A meta de quadros depende da classe: 30 qps no celular, 60 no PC.
 */
import type { Capabilities } from './kaics.ts';

export type DeviceClass = 'mobile' | 'pc' | 'software';

/** Valor com a natureza da evidência: lido do navegador, deduzido de um padrão, ou indisponível. */
export interface Observed<T> {
  value: T;
  source: string;
  kind: 'observada' | 'inferida' | 'indisponivel';
}

/** Lado curto da tela (px CSS) abaixo do qual um aparelho de toque conta como celular. */
export const MOBILE_SHORT_SIDE = 820;

/** Renderizadores sem placa de vídeo (o navegador desenha na CPU). */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export const DEVICE_CLASS_TEXT: Record<DeviceClass, string> = { mobile: 'celular', pc: 'PC', software: 'renderização por software' };

/** Classe do aparelho, com a fonte da conclusão (R-DEV-01). */
export function classifyDevice(caps: Pick<Capabilities, 'gpu' | 'touch' | 'shortSide'>): Observed<DeviceClass> {
  if (caps.gpu && SOFTWARE_RENDERER.test(caps.gpu)) return { value: 'software', source: `renderizador "${caps.gpu}"`, kind: 'observada' };
  const short = caps.shortSide ?? null;
  if (caps.touch && short !== null && short < MOBILE_SHORT_SIDE) return { value: 'mobile', source: `toque + tela curta (${Math.round(short)} px)`, kind: 'inferida' };
  if (caps.touch && short === null) return { value: 'mobile', source: 'toque (tamanho da tela desconhecido)', kind: 'inferida' };
  return { value: 'pc', source: caps.touch ? `toque com tela grande (${Math.round(short ?? 0)} px)` : 'sem toque', kind: 'inferida' };
}

/**
 * Classe deste aparelho fora da partida (menu e configurações), sem contexto WebGL: só toque e
 * tamanho da tela. Renderização por software só é detectada dentro da partida (nome da GPU).
 */
export function currentDeviceClass(): DeviceClass {
  if (typeof window === 'undefined') return 'pc';
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const shortSide = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight);
  return classifyDevice({ gpu: null, touch, shortSide }).value;
}

export interface TargetPolicy {
  fps: number;
  budgetMs: number;
  /** De onde veio a meta: padrão da classe, escolha do jogador ou teto da tela. */
  origin: 'classe' | 'jogador' | 'tela';
}

/** Meta padrão por classe (R-TGT-01). */
export const CLASS_TARGET: Record<DeviceClass, number> = { mobile: 30, pc: 60, software: 30 };

/**
 * Meta de quadros (R-TGT-01/03): a da classe (ou a escolhida pelo jogador), nunca acima da taxa
 * conhecida da tela.
 */
export function targetFor(cls: DeviceClass, refreshHz: number | null = null, chosen: number | null = null): TargetPolicy {
  let fps = chosen ?? CLASS_TARGET[cls];
  let origin: TargetPolicy['origin'] = chosen ? 'jogador' : 'classe';
  if (refreshHz !== null && refreshHz < fps) {
    fps = refreshHz;
    origin = 'tela';
  }
  return { fps, budgetMs: 1000 / fps, origin };
}

/**
 * Chave do ajuste aprendido neste aparelho (R-EVD-04): muda quando o visual do jogo muda
 * (`revision`), quando o preset, a densidade de tela, a cena, a classe ou a meta mudam — um ajuste
 * aprendido sob outras condições não vale.
 */
export function profileKey(p: { revision: number; preset: string; dpr: number; scene: string; deviceClass: DeviceClass; fps: number }): string {
  return `r${p.revision}|${p.preset}|${Math.round(p.dpr * 100)}|${p.scene}|${p.deviceClass}|${p.fps}`;
}

/**
 * Chave dos ganhos por ajuste (R-ADP-04): o ganho de um passo depende do aparelho e do conteúdo
 * do preset, não da cena nem da meta — assim o histórico cresce mais rápido.
 */
export function gainKey(p: { revision: number; preset: string; dpr: number; deviceClass: DeviceClass }): string {
  return `r${p.revision}|${p.preset}|${Math.round(p.dpr * 100)}|${p.deviceClass}`;
}
