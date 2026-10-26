/**
 * Parâmetros do modelo nacional. São HIPÓTESES DE JOGO (quality: game_parameter), escolhidas
 * para serem legíveis e jogáveis, não estimativas econométricas. Cada efeito é linear e
 * limitado, para que o jogador consiga entender a causa de cada variação.
 */

/** Data inicial do cenário. Tudo após ela é linha histórica alternativa. */
export const SCENARIO_START = '2026-01-01';
/** Ticks táticos por dia de jogo (20 ticks = 1 s → 1 dia por segundo a 1×). */
export const TICKS_PER_DAY = 20;
export const DAYS_PER_YEAR = 365;
/** Intervalo de registro do histórico para gráficos. */
export const HISTORY_EVERY_DAYS = 30;
export const HISTORY_MAX_POINTS = 60;

/** Valores usados quando não há dado confiável — exibidos como "estimativa de jogo". */
export const FALLBACKS = {
  gdpGrowthPct: 2,
  inflationPct: 3,
  unemploymentPct: 6,
  govDebtPctGdp: 60,
  govRevenuePctGdp: 25,
  govExpensePctGdp: 27,
  militaryPctGdp: 1.5,
  educationPctGdp: 4.5,
  healthPctGdp: 5,
  researchPctGdp: 1,
} as const;

/** Parcela pública do gasto total em P&D (hipótese de jogo). */
export const PUBLIC_RESEARCH_SHARE = 0.3;
/** Gasto inicial em infraestrutura, % do PIB (sem série comparável no WDI). */
export const BASE_INFRASTRUCTURE_PCT = 2.5;

/**
 * Verba de obras do teatro (Fase 4): parcela do orçamento anual de infraestrutura reservada às
 * melhorias de construções no teatro de operações. Hipótese de jogo. A parcela já faz parte do gasto
 * público contabilizado (não cria despesa nova); para ter mais verba, aumenta-se o orçamento de
 * infraestrutura, com os efeitos normais sobre déficit e dívida.
 */
export const WORKS_SHARE_OF_INFRA = 0.003;
/** A verba começa a partida com esta fração do teto anual (o resto chega dia a dia). */
export const WORKS_START_FRACTION = 0.5;
/** Lançamentos mais recentes guardados no extrato de obras. */
export const WORKS_LEDGER_MAX = 12;

export const LIMITS = {
  taxPct: [5, 60] as const,
  categoryPct: [0, 30] as const,
  defensePct: [0, 10] as const,
  researchPct: [0, 4] as const,
};

/** Déficit inicial presumido quando não há dado de receita. */
export const FALLBACK_DEFICIT_PCT = 3;

/** Coeficientes do modelo (efeitos anuais em pontos percentuais). */
export const COEF = {
  /**
   * Inflação em dólar usada para o PIB nominal em US$. A inflação doméstica alta é compensada
   * pela desvalorização cambial, então não infla o PIB medido em dólares.
   */
  usdInflation: 2.5,
  /** Crescimento tendencial é limitado a esta faixa. */
  trendGrowthRange: [-1, 6] as const,
  /** Multiplicador fiscal de curto prazo sobre o desvio do gasto total. */
  fiscalMultiplier: 0.3,
  /** Arrasto do aumento de carga tributária. */
  taxDrag: 0.2,
  /** Efeito do estoque de infraestrutura sobre o crescimento. */
  infrastructureGrowth: 1.5,
  /** Velocidade de acumulação do estoque de infraestrutura (por ano, por p.p. acima da base). */
  infrastructureAccumulation: 0.04,
  /** Efeito do capital humano (educação) sobre o crescimento, com defasagem. */
  educationGrowth: 1.2,
  educationLagYears: 4,
  /** Arrasto da dívida acima de 90% do PIB, por p.p. */
  debtDrag: 0.01,
  /** Arrasto da instabilidade abaixo de 40 pontos. */
  instabilityDrag: 0.03,
  /** Lei de Okun: variação do desemprego por p.p. de crescimento acima da tendência. */
  okun: 0.4,
  /** Retorno do desemprego à taxa de referência (fração por ano). */
  unemploymentReversion: 0.5,
  /** Desinflação: constante de tempo (anos) para a âncora de inflação convergir a 3%. */
  disinflationYears: 2,
  inflationAnchor: 3,
  /** Inflação adicional por p.p. de déficit acima de 3% do PIB. */
  deficitInflation: 0.8,
  /** Ajuste da inflação em direção ao alvo (fração por ano). */
  inflationAdjust: 1.5,
  /** Juros: base + metade da inflação + prêmio de risco por p.p. de dívida acima de 60%. */
  baseRate: 2,
  inflationPassThrough: 0.5,
  /** A inflação acima disso não é repassada aos juros médios do estoque da dívida. */
  inflationPassThroughCap: 20,
  maxInterestRate: 25,
  riskPremiumPerPoint: 0.04,
  /** Aprovação: constante de tempo (dias) e pesos dos fatores. */
  approvalDays: 60,
  approvalBase: 50,
  approvalInflation: -0.8,
  approvalUnemployment: -1.5,
  approvalServices: 3,
  approvalTax: -2.5,
  approvalGrowth: 2,
  approvalCasualties: -0.25,
  approvalVictories: 0.6,
  /** Estabilidade: constante de tempo (dias). */
  stabilityDays: 90,
  /** Probabilidade diária máxima de protesto quando a aprovação chega a zero. */
  protestMaxDailyChance: 0.02,
  protestApprovalThreshold: 35,
  /** Logística do teatro: suprimentos/s = k · log10(1 + gasto de defesa anual em US$ bi). */
  theaterSupplyK: 1.2,
  /** PIB usado no modo paridade (todos os países com a mesma escala econômica). */
  parityGdpUsd: 1e12,
} as const;
