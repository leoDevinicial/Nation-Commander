/** Pesquisas disponíveis. Custo em "% do PIB × ano": investir esse percentual por um ano conclui a pesquisa. */
export type TechId =
  | 'logistics'
  | 'guided_munitions'
  | 'composite_armor'
  | 'modular_construction'
  | 'rapid_training'
  | 'automation'
  | 'territorial_administration'
  | 'agricultural_mechanization'
  | 'mechanized_extraction'
  | 'advanced_drilling';

export interface TechDef {
  id: TechId;
  label: string;
  description: string;
  cost: number;
  effect: Partial<TechEffects>;
}

export interface TechEffects {
  /** Multiplicador da renda tática vinda da logística nacional. */
  theaterSupplyMul: number;
  damageMul: number;
  tankHpMul: number;
  infantryHpMul: number;
  constructionTimeMul: number;
  productionTimeMul: number;
  /** Pontos percentuais adicionados ao crescimento anual. */
  growthBonus: number;
  /** Multiplicador do raio de território das construções no teatro. */
  territoryMul: number;
}

export const NEUTRAL_EFFECTS: TechEffects = {
  theaterSupplyMul: 1,
  damageMul: 1,
  tankHpMul: 1,
  infantryHpMul: 1,
  constructionTimeMul: 1,
  productionTimeMul: 1,
  growthBonus: 0,
  territoryMul: 1,
};

export const TECHNOLOGIES: Record<TechId, TechDef> = {
  logistics: {
    id: 'logistics',
    label: 'Logística integrada',
    description: '+25% nos suprimentos que a logística nacional envia ao teatro. Libera melhorias de armazéns, silos e tanques a partir do nível 5 e do QG a partir do 4.',
    cost: 0.15,
    effect: { theaterSupplyMul: 1.25 },
  },
  rapid_training: {
    id: 'rapid_training',
    label: 'Treinamento acelerado',
    description: '−25% no tempo de produção de unidades. Libera melhorias da base militar a partir do nível 5.',
    cost: 0.15,
    effect: { productionTimeMul: 0.75 },
  },
  modular_construction: {
    id: 'modular_construction',
    label: 'Construção modular',
    description: '−30% no tempo de construção de estruturas (e das obras de melhoria). Libera melhorias do prédio residencial a partir do nível 5.',
    cost: 0.12,
    effect: { constructionTimeMul: 0.7 },
  },
  guided_munitions: {
    id: 'guided_munitions',
    label: 'Munição guiada',
    description: '+15% de dano para todas as unidades e defesas. Libera melhorias da torre a partir do nível 4.',
    cost: 0.25,
    effect: { damageMul: 1.15 },
  },
  composite_armor: {
    id: 'composite_armor',
    label: 'Blindagem composta',
    description: '+25% de vida para blindados e +10% para infantaria produzidos após a conclusão.',
    cost: 0.25,
    effect: { tankHpMul: 1.25, infantryHpMul: 1.1 },
  },
  territorial_administration: {
    id: 'territorial_administration',
    label: 'Administração territorial',
    description: '+20% no raio de território de todas as construções no teatro (fronteiras maiores). Libera o QG a partir do nível 7.',
    cost: 0.15,
    effect: { territoryMul: 1.2 },
  },
  automation: {
    id: 'automation',
    label: 'Automação industrial',
    description: '+0,4 p.p. no crescimento econômico anual. Libera melhorias de fábrica a partir do nível 5.',
    cost: 0.3,
    effect: { growthBonus: 0.4 },
  },
  agricultural_mechanization: {
    id: 'agricultural_mechanization',
    label: 'Mecanização agrícola',
    description: 'Libera melhorias de fazenda a partir do nível 5 (colheitadeiras, irrigação e armazenagem modernas).',
    cost: 0.12,
    effect: {},
  },
  mechanized_extraction: {
    id: 'mechanized_extraction',
    label: 'Extração mecanizada',
    description: 'Libera melhorias de serraria, pedreira e mina a partir do nível 5 (máquinas pesadas e britagem).',
    cost: 0.15,
    effect: {},
  },
  advanced_drilling: {
    id: 'advanced_drilling',
    label: 'Perfuração avançada',
    description: 'Libera melhorias de poço de petróleo a partir do nível 5 (perfuração direcional e recuperação avançada).',
    cost: 0.15,
    effect: {},
  },
};

export const TECH_IDS = Object.keys(TECHNOLOGIES) as TechId[];

export function combineEffects(done: TechId[]): TechEffects {
  const e = { ...NEUTRAL_EFFECTS };
  for (const id of done) {
    const t = TECHNOLOGIES[id].effect;
    e.theaterSupplyMul *= t.theaterSupplyMul ?? 1;
    e.damageMul *= t.damageMul ?? 1;
    e.tankHpMul *= t.tankHpMul ?? 1;
    e.infantryHpMul *= t.infantryHpMul ?? 1;
    e.constructionTimeMul *= t.constructionTimeMul ?? 1;
    e.productionTimeMul *= t.productionTimeMul ?? 1;
    e.growthBonus += t.growthBonus ?? 0;
    e.territoryMul *= t.territoryMul ?? 1;
  }
  return e;
}
