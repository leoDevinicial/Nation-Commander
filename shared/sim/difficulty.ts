import { TICK_RATE } from './config.ts';

/**
 * Níveis de dificuldade da IA (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 1, §2.5). Mudam o preparo, a hora da
 * primeira ofensiva, o exército mínimo, o ritmo das eras, o orçamento de defesa do governo da IA, o tamanho e o
 * ritmo das ondas, se a IA usa aviões e mísseis, os incidentes de fronteira no preparo
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
  /** Tropas que a IA mantém no preparo (a base da primeira ofensiva). */
  prepGarrison: number;
  /**
   * Primeira ofensiva (min de jogo): a IA ataca com o que tiver (pelo menos `minFirstWave` tropas),
   * sem esperar a onda cheia. As ondas seguintes usam `firstWave`, `waveStep` e o intervalo.
   */
  firstAttackMinutes: number;
  minFirstWave: number;
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
  /**
   * Exército mínimo da IA: `armyPerMinute × (minutos − 2)`. Abaixo dele, as tropas passam na frente das reservas
   * da era, da pesquisa e do QG.
   */
  armyPerMinute: number;
  /** Orçamento de defesa que o governo da IA busca, em múltiplos do de referência (mais suprimentos no teatro). */
  defenseBudgetMul: number;
  /** Fazendas que a IA mantém depois da base militar (a comida forma os soldados). */
  farms: number;
  /**
   * Eras (min de jogo): a partir deste momento, com o Centro de Pesquisa pronto, o QG sobe até o nível
   * da próxima era antes das outras melhorias e com a reserva passando na frente das tropas.
   */
  eraPushMinutes: number;
  /** Engenheiros de Combate mantidos e minas antitanque na defesa (lote 3). */
  engineers: number;
  mines: number;
  description: string;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: {
    label: 'Fácil',
    prepMinutes: 12,
    prepGarrison: 4,
    firstAttackMinutes: 14,
    minFirstWave: 4,
    firstWave: 8,
    waveStep: 2,
    maxWave: 16,
    waveCooldownMinutes: 6,
    airPower: false,
    missiles: false,
    harassment: false,
    gatherBonus: 0,
    armyPerMinute: 0.5,
    defenseBudgetMul: 1,
    farms: 3,
    eraPushMinutes: 16,
    engineers: 0,
    mines: 0,
    description: '12 min de preparo, primeiro ataque perto dos 14 min, ondas pequenas e espaçadas, sem aviões nem mísseis.',
  },
  normal: {
    label: 'Normal',
    prepMinutes: 8,
    prepGarrison: 6,
    firstAttackMinutes: 10,
    minFirstWave: 4,
    firstWave: 12,
    waveStep: 3,
    maxWave: 24,
    waveCooldownMinutes: 4,
    airPower: true,
    missiles: false,
    harassment: true,
    gatherBonus: 0,
    armyPerMinute: 0.8,
    defenseBudgetMul: 1.5,
    farms: 4,
    eraPushMinutes: 10,
    engineers: 1,
    mines: 4,
    description: '8 min de preparo, incidentes de fronteira, primeiro ataque perto dos 10 min, ondas médias; a IA usa aviões.',
  },
  hard: {
    label: 'Difícil',
    prepMinutes: 5,
    prepGarrison: 8,
    firstAttackMinutes: 8,
    minFirstWave: 4,
    firstWave: 14,
    waveStep: 4,
    maxWave: 30,
    waveCooldownMinutes: 3,
    airPower: true,
    missiles: true,
    harassment: true,
    gatherBonus: 0,
    armyPerMinute: 1,
    defenseBudgetMul: 2,
    farms: 5,
    eraPushMinutes: 7,
    engineers: 2,
    mines: 8,
    description: '5 min de preparo, primeiro ataque perto dos 8 min, ondas grandes e frequentes; a IA usa aviões e mísseis.',
  },
  brutal: {
    label: 'Brutal',
    prepMinutes: 3,
    prepGarrison: 8,
    firstAttackMinutes: 6,
    minFirstWave: 3,
    firstWave: 16,
    waveStep: 4,
    maxWave: 36,
    waveCooldownMinutes: 2.5,
    airPower: true,
    missiles: true,
    harassment: true,
    gatherBonus: 0.15,
    armyPerMinute: 1.2,
    defenseBudgetMul: 2.5,
    farms: 5,
    eraPushMinutes: 5,
    engineers: 2,
    mines: 12,
    description: '3 min de preparo, primeiro ataque perto dos 6 min, ondas enormes, aviões e mísseis, e +15% de coleta para a IA.',
  },
};

export const prepTicks = (d: Difficulty): number => Math.round(DIFFICULTY[d].prepMinutes * 60 * TICK_RATE);
export const firstAttackTicks = (d: Difficulty): number => Math.round(DIFFICULTY[d].firstAttackMinutes * 60 * TICK_RATE);
