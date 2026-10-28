/**
 * Presets gráficos. Controlam apenas custo de renderização (resolução, sombras, efeitos,
 * vegetação, camadas decorativas do globo) — nunca regras ou resultados da simulação.
 */
export type GraphicsPreset = 'low' | 'balanced' | 'high' | 'ultra' | 'ultraplus';

export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = ['low', 'balanced', 'high', 'ultra', 'ultraplus'];

/**
 * Versão do visual dos presets: sobe quando o custo ou a aparência dos presets mudam (novos
 * efeitos, modelos, água…). O ajuste aprendido pelo KGPS em cada aparelho vale só para a mesma
 * versão (ver `profileKey`), para não reaplicar ajustes de um visual antigo.
 */
export const GRAPHICS_REVISION = 2;

/** Presets que pedem confirmação (aviso de desempenho) antes de serem ativados. */
export const HEAVY_PRESETS: readonly GraphicsPreset[] = ['ultraplus'];

export const PRESET_LABELS: Record<GraphicsPreset, string> = {
  low: 'Mobile/Baixo',
  balanced: 'Equilibrado',
  high: 'Alto',
  ultra: 'Ultra',
  ultraplus: 'Ultra+',
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
  /**
   * Recursos só do Ultra (placas de vídeo dedicadas): modelos arredondados e com mais segmentos,
   * água com ondas físicas e espuma, fumaça volumétrica, feixes de luz do sol na névoa e
   * exposição local que clareia regiões em sombra.
   */
  ultra: boolean;
  /**
   * Ultra+ (cinematográfico): vai além do Ultra — modelos bem mais arredondados (≈20% low-poly,
   * 80% realista), sombras de alta resolução com penumbra larga, sombras de nuvens que se movem
   * sobre o mapa, fumaça densa que se espalha com o vento, brilho (bloom) em fogo e reflexos,
   * feixes de sol com mais amostras e reflexos de ambiente mais nítidos.
   */
  cinematic: boolean;
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
    ultra: false,
    cinematic: false,
    globe: { textureWidth: 1024, clouds: false, stars: 400, maxFps: 60 },
  },
  balanced: {
    pixelRatioCap: 1.25,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    terrain: 'high',
    maxEffects: 120,
    ao: false,
    reflections: 'planar',
    adaptiveExposure: true,
    dynamicLights: 2,
    envProbe: false,
    ultra: false,
    cinematic: false,
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
    ultra: false,
    cinematic: false,
    globe: { textureWidth: 4096, clouds: true, stars: 2000, maxFps: 60 },
  },
  ultra: {
    pixelRatioCap: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 4096,
    terrain: 'high',
    maxEffects: 220,
    ao: true,
    reflections: 'planar',
    adaptiveExposure: true,
    dynamicLights: 6,
    envProbe: true,
    ultra: true,
    cinematic: false,
    globe: { textureWidth: 4096, clouds: true, stars: 2400, maxFps: 60 },
  },
  ultraplus: {
    pixelRatioCap: 2.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 8192,
    terrain: 'high',
    maxEffects: 300,
    ao: true,
    reflections: 'planar',
    adaptiveExposure: true,
    dynamicLights: 8,
    envProbe: true,
    ultra: true,
    cinematic: true,
    globe: { textureWidth: 4096, clouds: true, stars: 3000, maxFps: 60 },
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
