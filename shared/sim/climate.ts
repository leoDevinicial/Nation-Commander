import { geoOf } from '../data/geography.ts';
import type { MapType } from './matchMap.ts';

/**
 * Clima da partida (só visual: não muda nenhuma regra). Decidido pelos países escolhidos no lobby (humanos e IA) e
 * pelo tipo de mapa. Todos os jogadores calculam o mesmo resultado, a partir da semente e do tempo da partida, então o
 * céu é igual para todo mundo.
 * - `snow`: todas as nações são da Europa. Nevascas de tempos em tempos (e a neve fica no chão), às vezes chuva fria.
 * - `tropical`: alguma nação entre os trópicos (|latitude da capital| < 23,5°). Chuvas fortes e frequentes, com raios.
 * - `arid`: mapa Deserto. Chuva rara e fraca.
 * - `temperate`: o resto. Chuva de vez em quando.
 */
export type Climate = 'snow' | 'tropical' | 'temperate' | 'arid';

export const CLIMATE_LABELS: Record<Climate, string> = {
  snow: 'Inverno europeu',
  tropical: 'Tropical',
  temperate: 'Temperado',
  arid: 'Árido',
};

export function matchClimate(countryIds: readonly string[], mapKind?: MapType): Climate {
  const geos = countryIds.map((id) => geoOf(id)).filter((g) => g !== undefined);
  if (geos.length && geos.every((g) => g.region === 'europe')) return 'snow';
  if (mapKind === 'desert') return 'arid';
  if (geos.some((g) => Math.abs(g.capital.lat) < 23.5)) return 'tropical';
  return 'temperate';
}

/** Duração de um dia completo da partida (s): ~9 min de dia, 1,5 de entardecer, 4 de noite e 1,5 de amanhecer. */
export const DAY_CYCLE_SECONDS = 16 * 60;
/** A partida começa no meio da manhã. */
const START_PHASE = 0.08;

export interface DayLight {
  /** Hora do dia (0 a 24). */
  hour: number;
  /** 1 = pleno dia, 0 = noite. */
  day: number;
  /** 1 = noite fechada. */
  night: number;
  /** Pico no nascer e no pôr do sol (luz alaranjada). */
  golden: number;
  /** Altura do sol (−1 a 1; positivo de dia). */
  sunHeight: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Luz do dia num instante da partida (segundos de jogo). */
export function dayLight(seconds: number): DayLight {
  // fase 0 = 6h (nascer do sol). O dia ocupa ~66% do ciclo, a noite ~25%, o resto é amanhecer e entardecer.
  const phase = (((seconds / DAY_CYCLE_SECONDS + START_PHASE) % 1) + 1) % 1;
  const hour = (6 + phase * 24) % 24;
  // dia: 0,0 a 0,66; entardecer 0,66 a 0,75; noite 0,75 a 0,91; amanhecer 0,91 a 1,0
  const day = phase < 0.66 ? smooth(-0.02, 0.03, phase) : phase < 0.75 ? 1 - smooth(0.66, 0.75, phase) : phase < 0.91 ? 0 : smooth(0.91, 1.0, phase);
  const night = phase < 0.66 ? 0 : phase < 0.91 ? smooth(0.7, 0.78, phase) : 1 - smooth(0.92, 0.99, phase);
  const golden = Math.max(1 - Math.abs(phase - 0.69) / 0.06, 1 - Math.abs(phase - 0.97) / 0.06, 1 - Math.abs(phase + 0.03) / 0.06, 0);
  // o sol nasce em 0 e se põe em 0,75; abaixo do horizonte no resto
  const sunHeight = phase < 0.75 ? Math.sin((phase / 0.75) * Math.PI) : -Math.sin(((phase - 0.75) / 0.25) * Math.PI) * 0.5;
  return { hour, day, night, golden: Math.min(1, golden), sunHeight };
}

export interface WeatherState {
  /** Intensidade da chuva (0 a 1). */
  rain: number;
  /** Intensidade da neve caindo (0 a 1). */
  snow: number;
  /** Tempestade (raios e trovões), 0 a 1. */
  storm: number;
  /** Céu encoberto (0 a 1): acompanha a precipitação e começa antes dela. */
  cover: number;
}

/** Janelas de clima (s): cada janela tem ou não um evento, com entrada e saída suaves. */
export const WEATHER_WINDOW = 150;
const CHANCE: Record<Climate, { rain: number; snow: number; storm: number }> = {
  snow: { rain: 0.12, snow: 0.55, storm: 0 },
  tropical: { rain: 0.5, snow: 0, storm: 0.45 },
  temperate: { rain: 0.35, snow: 0, storm: 0.25 },
  arid: { rain: 0.07, snow: 0, storm: 0 },
};

/** Sorteio determinístico (0..1) por semente, janela e canal. */
function hash(seed: number, window: number, salt: number): number {
  let h = (seed ^ Math.imul(window + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Clima num instante da partida. A primeira janela (começo da partida) é sempre de tempo bom. */
export function weatherAt(seed: number, climate: Climate, seconds: number): WeatherState {
  const out: WeatherState = { rain: 0, snow: 0, storm: 0, cover: 0 };
  const w = Math.floor(seconds / WEATHER_WINDOW);
  if (w < 1) return out;
  const local = seconds - w * WEATHER_WINDOW;
  const c = CHANCE[climate];
  const roll = hash(seed, w, 1);
  const kind: 'snow' | 'rain' | null = roll < c.snow ? 'snow' : roll < c.snow + c.rain ? 'rain' : null;
  if (!kind) return out;
  // força do evento e a curva: entra em ~25 s, fica, e sai nos últimos ~25 s da janela
  const strength = 0.45 + hash(seed, w, 2) * 0.55;
  const env = smooth(5, 30, local) * (1 - smooth(WEATHER_WINDOW - 30, WEATHER_WINDOW - 3, local));
  const cover = smooth(0, 20, local) * (1 - smooth(WEATHER_WINDOW - 20, WEATHER_WINDOW, local));
  out.cover = Math.min(1, cover * (0.55 + strength * 0.45));
  if (kind === 'snow') out.snow = env * strength;
  else {
    out.rain = env * strength;
    if (hash(seed, w, 3) < c.storm && strength > 0.6) out.storm = env * smooth(0.6, 1, strength) * 0.6 + env * 0.4;
  }
  return out;
}
