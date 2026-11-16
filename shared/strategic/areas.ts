import type { BuildingType } from '../sim/config.ts';

/**
 * Orçamento do país do cenário (16/11, `docs/PROPOSTA_ORCAMENTO_NO_CENARIO.md`): o painel deixou de controlar uma
 * macroeconomia com dados reais e passou a governar o que está no mapa, como os orçamentos de serviço de Cities.
 *
 * Cada área tem um nível de financiamento de 50% a 150%. 100% é o custo de referência; abaixo economiza caixa e perde
 * efeito, acima custa mais e rende mais (com retorno menor que o custo: subir tudo a 150% não se paga sozinho). Os
 * impostos são os três do zoneamento (residencial, comercial, industrial), já existentes, agora no topo do painel.
 */
export const AREA_KEYS = ['defense', 'infrastructure', 'education', 'health', 'security', 'research', 'social'] as const;
export type AreaKey = (typeof AREA_KEYS)[number];
export type Areas = Record<AreaKey, number>;

export const AREA_LIMITS: readonly [number, number] = [50, 150];

export const DEFAULT_AREAS: Areas = { defense: 100, infrastructure: 100, education: 100, health: 100, security: 100, research: 100, social: 100 };

export const AREA_LABEL: Record<AreaKey, string> = {
  defense: 'Defesa',
  infrastructure: 'Infraestrutura',
  education: 'Educação',
  health: 'Saúde',
  security: 'Segurança',
  research: 'Pesquisa',
  social: 'Assistência e administração',
};

/** Custos por dia a 100% (US$). As áreas de serviço pagam por prédio; as demais, um valor fixo. */
export const AREA_COST = {
  /** Defesa: logística militar (suprimentos/s do teatro). */
  defenseDay: 15_000,
  /** Assistência e administração: valor fixo, mais as prefeituras (serviço). */
  socialDay: 8_000,
} as const;

/** Prédio de serviço → área que paga e governa a sua manutenção. */
export const SERVICE_AREA: Partial<Record<BuildingType, AreaKey>> = {
  hospital: 'health',
  school: 'education',
  university: 'education',
  police_station: 'security',
  city_hall: 'social',
};

/** Efeitos de cada área no cenário (`l` = nível/100, de 0,5 a 1,5). Todos lineares e limitados, para ler a causa. */
export const AREA_FX = {
  /** Defesa: a verba militar que rende os suprimentos (`theaterSupply`) é a de referência × nível. */
  defense: (l: number) => l,
  /**
   * Infraestrutura: obras (tempo ÷) e o índice de infraestrutura, que destrava o QG alto e rende produtividade. A 100%
   * o índice fica em 1,0; o QG nível 8 pede 1,02, então é preciso investir acima da referência por um tempo.
   */
  buildSpeed: (l: number) => 0.75 + 0.25 * l,
  infraIndexTarget: (l: number) => 0.4 + 0.6 * l,
  /** Educação: conhecimento das escolas e universidades e o capital humano. */
  knowledge: (l: number) => 0.5 + 0.5 * l,
  /** Saúde: formação de cidadãos no Centro de Comando (velocidade). */
  citizens: (l: number) => 0.7 + 0.3 * l,
  /** Pesquisa: velocidade das pesquisas nacionais (e o custo do dia acompanha o nível). */
  research: (l: number) => 0.5 + 0.5 * l,
  /** Assistência: aprovação direta (pontos). */
  socialApproval: (l: number) => 14 * (l - 1),
} as const;

export function clampAreas(a: Partial<Areas> | undefined): Areas {
  const out = { ...DEFAULT_AREAS };
  for (const k of AREA_KEYS) {
    const v = a?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(Math.min(AREA_LIMITS[1], Math.max(AREA_LIMITS[0], v)));
  }
  return out;
}

/** Nível de 0,5 a 1,5 (o que os efeitos usam). */
export const level = (a: Areas, k: AreaKey): number => a[k] / 100;

/** Imposto médio do zoneamento (%), para a aprovação e o painel. */
export function averageTax(t: { res: number; com: number; ind: number }): number {
  return (t.res + t.com + t.ind) / 3;
}

/**
 * Aprovação pelos impostos: 10% é neutro; cada ponto acima tira 0,8 e cada ponto abaixo dá 0,8 (de +8 a −16 entre
 * 0% e 30%). O caixa também sente: imposto zero esvazia a receita dos lotes.
 */
export function taxApproval(avgTaxPct: number): number {
  return Math.max(-16, Math.min(8, -0.8 * (avgTaxPct - 10)));
}
