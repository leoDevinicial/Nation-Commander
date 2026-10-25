/**
 * Presets gráficos. Controlam apenas custo de renderização (resolução, sombras, efeitos,
 * vegetação, camadas decorativas do globo) — nunca regras ou resultados da simulação.
 */
export type GraphicsPreset = 'low' | 'balanced' | 'high';

export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = ['low', 'balanced', 'high'];

export const PRESET_LABELS: Record<GraphicsPreset, string> = {
  low: 'Mobile/Baixo',
  balanced: 'Equilibrado',
  high: 'Alto',
};

export interface GraphicsProfile {
  /** Limite do devicePixelRatio aplicado ao renderizador. */
  pixelRatioCap: number;
  antialias: boolean;
  /** Sombras dinâmicas permitidas pelo preset (o jogador ainda pode desligá-las). */
  shadows: boolean;
  shadowMapSize: number;
  /** Detalhe do terreno e densidade de vegetação. */
  terrain: 'low' | 'high';
  /** Máximo de efeitos simultâneos (traçantes, clarões, explosões). */
  maxEffects: number;
  /** Oclusão de ambiente em espaço de tela (sombras de contato e cantos). */
  ao: boolean;
  /** Reflexo da água: espelho real da cena ('planar') ou só do céu ('sky'). */
  reflections: 'planar' | 'sky';
  /** Exposição que se adapta à luminosidade da tela. */
  adaptiveExposure: boolean;
  /** Luzes pontuais de disparos e explosões (0 = desligado). */
  dynamicLights: number;
  /** Mapa de ambiente atualizado com o cenário ao redor da câmera. */
  envProbe: boolean;
  /** Globo do menu. */
  globe: { textureWidth: number; clouds: boolean; stars: number; maxFps: number };
}

export const PROFILES: Record<GraphicsPreset, GraphicsProfile> = {
  low: {
    pixelRatioCap: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 1024,
    terrain: 'low',
    maxEffects: 60,
    ao: false,
    reflections: 'sky',
    adaptiveExposure: false,
    dynamicLights: 0,
    envProbe: false,
    globe: { textureWidth: 1024, clouds: false, stars: 400, maxFps: 30 },
  },
  balanced: {
    pixelRatioCap: 1.25,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    terrain: 'high',
    maxEffects: 120,
    ao: false,
    reflections: 'sky',
    adaptiveExposure: true,
    dynamicLights: 2,
    envProbe: false,
    globe: { textureWidth: 2048, clouds: true, stars: 1200, maxFps: 60 },
  },
  high: {
    pixelRatioCap: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    terrain: 'high',
    maxEffects: 160,
    ao: true,
    reflections: 'planar',
    adaptiveExposure: true,
    dynamicLights: 4,
    envProbe: true,
    globe: { textureWidth: 4096, clouds: true, stars: 2000, maxFps: 60 },
  },
};

export interface DeviceHints {
  coarsePointer: boolean;
  /** navigator.deviceMemory (GB), quando o navegador informa. */
  memoryGb?: number;
  cores?: number;
  shortSide: number;
}

/** Escolha inicial conservadora: aparelhos de toque ou modestos começam no preset baixo. */
export function detectPreset(h: DeviceHints): GraphicsPreset {
  if (h.coarsePointer && h.shortSide < 820) return 'low';
  if ((h.memoryGb !== undefined && h.memoryGb <= 4) || (h.cores !== undefined && h.cores <= 4)) return 'low';
  return 'balanced';
}

export function currentDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    memoryGb: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    shortSide: Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight),
  };
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
}
