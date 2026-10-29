import { TICK_RATE } from './config.ts';

/**
 * Níveis de dificuldade da IA (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 1, §2.5). Mudam o preparo,
 * o tamanho e o ritmo das ondas, se a IA usa aviões e mísseis, os incidentes de fronteira no preparo
 * e, só no Brutal, um bônus de coleta pequeno e declarado. A IA continua sem visão total e sem
 * recursos escondidos em todos os níveis.
 */
export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'brutal'];
export const isDifficulty = (v: unknown): v is Difficulty => typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v);

export interface DifficultyDef {
  label: string;
  /** Período de preparo (min de jogo): sem guerra da IA, só uma guarnição. */
  prepMinutes: number;
  firstWave: number;
  waveStep: number;
  maxWave: number;
  /** Intervalo mínimo entre ondas (min de jogo). */
  waveCooldownMinutes: number;
  /** A IA usa a força aérea (ataques e reconhecimento). */
  airPower: boolean;
  /** A IA lança mísseis balísticos. */
  missiles: boolean;
  /** Incidentes de fronteira durante o preparo (2 a 3 tropas contra a coleta na borda). */
  harassment: boolean;
  /** Bônus de coleta da IA (fração; declarado na tela da sala). */
  gatherBonus: number;
  /** Engenheiros de Combate mantidos e minas antitanque na defesa (lote 3). */
  engineers: number;
  mines: number;
  description: string;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: {
    label: 'Fácil',
    prepMinutes: 12,
    firstWave: 8,
    waveStep: 2,
    maxWave: 16,
    waveCooldownMinutes: 6,
    airPower: false,
    missiles: false,
    harassment: false,
    gatherBonus: 0,
    engineers: 0,
    mines: 0,
    description: '12 min de preparo, ondas pequenas e espaçadas, sem aviões nem mísseis.',
  },
  normal: {
    label: 'Normal',
    prepMinutes: 8,
    firstWave: 12,
    waveStep: 3,
    maxWave: 24,
    waveCooldownMinutes: 4,
    airPower: true,
    missiles: false,
    harassment: true,
    gatherBonus: 0,
    engineers: 1,
    mines: 4,
    description: '8 min de preparo, incidentes de fronteira, ondas médias; a IA usa aviões.',
  },
  hard: {
    label: 'Difícil',
    prepMinutes: 5,
    firstWave: 14,
    waveStep: 4,
    maxWave: 30,
    waveCooldownMinutes: 3,
    airPower: true,
    missiles: true,
    harassment: true,
    gatherBonus: 0,
    engineers: 2,
    mines: 8,
    description: '5 min de preparo, ondas grandes e frequentes; a IA usa aviões e mísseis.',
  },
  brutal: {
    label: 'Brutal',
    prepMinutes: 3,
    firstWave: 16,
    waveStep: 4,
    maxWave: 36,
    waveCooldownMinutes: 2.5,
    airPower: true,
    missiles: true,
    harassment: true,
    gatherBonus: 0.15,
    engineers: 2,
    mines: 12,
    description: '3 min de preparo, ondas enormes, aviões e mísseis, e +15% de coleta para a IA.',
  },
};

export const prepTicks = (d: Difficulty): number => Math.round(DIFFICULTY[d].prepMinutes * 60 * TICK_RATE);
