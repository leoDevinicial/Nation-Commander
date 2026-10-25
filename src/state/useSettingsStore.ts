import { create } from 'zustand';
import { GRAPHICS_PRESETS, currentDeviceHints, detectPreset, type GraphicsPreset } from '../lib/graphics.ts';

export interface Settings {
  quality: GraphicsPreset;
  shadows: boolean;
  panSpeed: number;
  edgeScroll: boolean;
  showFps: boolean;
  /** Animações de câmera e de fundo reduzidas (além do prefers-reduced-motion do sistema). */
  reducedMotion: boolean;
}

const KEY = 'nc.settings.v1';

function defaults(): Settings {
  let quality: GraphicsPreset = 'balanced';
  try {
    quality = detectPreset(currentDeviceHints());
  } catch {
    // ambiente sem navigator/screen (testes): mantém equilibrado
  }
  return { quality, shadows: true, panSpeed: 1, edgeScroll: false, showFps: false, reducedMotion: false };
}

/** Lê configurações salvas; aceita o formato antigo ('low' | 'high'). */
export function parseSettings(raw: string | null, base: Settings): Settings {
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      quality: GRAPHICS_PRESETS.includes(p.quality as GraphicsPreset) ? (p.quality as GraphicsPreset) : base.quality,
      shadows: typeof p.shadows === 'boolean' ? p.shadows : base.shadows,
      panSpeed: typeof p.panSpeed === 'number' && p.panSpeed >= 0.25 && p.panSpeed <= 3 ? p.panSpeed : base.panSpeed,
      edgeScroll: Boolean(p.edgeScroll),
      showFps: Boolean(p.showFps),
      reducedMotion: Boolean(p.reducedMotion),
    };
  } catch {
    return base;
  }
}

function load(): Settings {
  const base = defaults();
  try {
    return parseSettings(localStorage.getItem(KEY), base);
  } catch {
    return base;
  }
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  update: (patch) => {
    set(patch);
    const { quality, shadows, panSpeed, edgeScroll, showFps, reducedMotion } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ quality, shadows, panSpeed, edgeScroll, showFps, reducedMotion }));
    } catch {
      // armazenamento indisponível: mantém apenas em memória
    }
  },
  reset: () => get().update(defaults()),
}));
