import { create } from 'zustand';

export interface Settings {
  quality: 'low' | 'high';
  shadows: boolean;
  panSpeed: number;
  edgeScroll: boolean;
  showFps: boolean;
}

const KEY = 'nc.settings.v1';
const DEFAULTS: Settings = { quality: 'high', shadows: true, panSpeed: 1, edgeScroll: false, showFps: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      quality: parsed.quality === 'low' ? 'low' : 'high',
      shadows: typeof parsed.shadows === 'boolean' ? parsed.shadows : DEFAULTS.shadows,
      panSpeed: typeof parsed.panSpeed === 'number' && parsed.panSpeed >= 0.25 && parsed.panSpeed <= 3 ? parsed.panSpeed : 1,
      edgeScroll: Boolean(parsed.edgeScroll),
      showFps: Boolean(parsed.showFps),
    };
  } catch {
    return DEFAULTS;
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
    const { quality, shadows, panSpeed, edgeScroll, showFps } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ quality, shadows, panSpeed, edgeScroll, showFps }));
    } catch {
      // armazenamento indisponível: mantém apenas em memória
    }
  },
  reset: () => get().update(DEFAULTS),
}));
