/**
 * Pesquisas nacionais (Fase 5). Cada tecnologia tem pré-requisitos, categoria de investimento,
 * custo, duração mínima e o que ela libera. O custo está em "% do PIB × ano": investir esse
 * percentual do PIB por um ano conclui a pesquisa — o valor em US$ acompanha o PIB do país.
 *
 * Regra da Fase 5: pesquisas militares NÃO melhoram sozinhas as tropas já em campo. Elas liberam
 * pacotes de modernização (`shared/sim/modernization.ts`), que custam dinheiro, materiais, tempo e
 * uma instalação compatível para serem instalados em cada unidade.
 */
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
  | 'advanced_drilling'
  | 'digital_comms'
  | 'sensor_optics'
  | 'efficient_propulsion'
  | 'ballistic_missiles'
  | 'nuclear_weapons'
  | 'space_technology'
  // 02/11 (era 3): produção sem limite
  | 'silviculture'
  | 'underground_mining'
  // 03/11: mais pesquisas, cada uma liberando o que já existe no jogo
  | 'road_engineering'
  | 'foreign_trade'
  | 'naval_logistics'
  | 'urban_planning'
  | 'public_health'
  | 'public_security'
  | 'higher_education'
  | 'financial_markets'
  | 'wind_power'
  | 'solar_power'
  | 'hydro_power'
  | 'nuclear_power'
  | 'steelmaking'
  | 'oil_refining'
  | 'telecom_5g'
  | 'military_aviation'
  | 'air_defense'
  // 03/11: Marinha e paraquedistas
  | 'naval_warfare'
  | 'submarine_warfare'
  | 'cruise_missiles'
  | 'naval_aviation'
  | 'airborne_operations';

/** Categoria de investimento: em que área do orçamento de P&D a pesquisa compete. */
export type TechCategory = 'military' | 'industry' | 'resources' | 'state';

export const TECH_CATEGORIES: Record<TechCategory, { label: string; icon: string }> = {
  military: { label: 'Defesa', icon: '⚔' },
  industry: { label: 'Indústria e construção', icon: '🏭' },
  resources: { label: 'Recursos naturais', icon: '⛏' },
  state: { label: 'Estado e logística', icon: '🏛' },
};

export interface TechDef {
  id: TechId;
  label: string;
  category: TechCategory;
  /** O que é a pesquisa (sem os efeitos, listados em `unlocks`). */
  description: string;
  /**
   * Custo em % do PIB × ano. Ritmo de jogo: um dia passa em 1 s, então os custos e as durações
   * foram calibrados para uma pesquisa levar de ~30 s a ~1 min com o orçamento típico de P&D.
   */
  cost: number;
  /** Duração mínima (dias): mais verba não acelera além deste ritmo (equipes, testes, certificação). */
  minDays: number;
  /** Pesquisas que precisam estar concluídas antes de começar esta. */
  prereqs: TechId[];
  /** Efeitos automáticos (só os que não dependem de equipamento: logística, administração, economia). */
  effect: Partial<TechEffects>;
  /** O que a pesquisa libera, em frases curtas (mostrado no painel de pesquisa). */
  unlocks: string[];
  /** Era mínima da nação para começar (02/11). */
  minEra?: number;
}

export interface TechEffects {
  /** Multiplicador da renda tática vinda da logística nacional. */
  theaterSupplyMul: number;
  constructionTimeMul: number;
  productionTimeMul: number;
  /** Pontos percentuais adicionados ao crescimento anual. */
  growthBonus: number;
  /** Multiplicador do raio de território das construções no teatro. */
  territoryMul: number;
}

export const NEUTRAL_EFFECTS: TechEffects = {
  theaterSupplyMul: 1,
  constructionTimeMul: 1,
  productionTimeMul: 1,
  growthBonus: 0,
  territoryMul: 1,
};

export const TECHNOLOGIES: Record<TechId, TechDef> = {
  logistics: {
    id: 'logistics',
    label: 'Logística integrada',
    category: 'state',
    description: 'Cadeia de suprimentos nacional coordenada com o teatro de operações.',
    cost: 0.025,
    minDays: 20,
    prereqs: [],
    effect: { theaterSupplyMul: 1.25 },
    unlocks: ['+25% nos suprimentos que a logística nacional envia ao teatro', 'Melhorias de armazém, silo e tanque a partir do nível 5; QG a partir do 4'],
  },
  rapid_training: {
    id: 'rapid_training',
    label: 'Treinamento acelerado',
    category: 'military',
    description: 'Doutrina e simuladores que encurtam a formação das tropas.',
    cost: 0.025,
    minDays: 20,
    prereqs: [],
    effect: { productionTimeMul: 0.75 },
    unlocks: ['−25% no tempo de produção de unidades', 'Melhorias da base militar a partir do nível 5'],
  },
  modular_construction: {
    id: 'modular_construction',
    label: 'Construção modular',
    category: 'industry',
    description: 'Estruturas pré-fabricadas montadas no local.',
    cost: 0.02,
    minDays: 17,
    prereqs: [],
    effect: { constructionTimeMul: 0.7 },
    unlocks: ['−30% no tempo de construção (inclui obras de melhoria)', 'Melhorias do prédio residencial a partir do nível 5'],
  },
  agricultural_mechanization: {
    id: 'agricultural_mechanization',
    label: 'Mecanização agrícola',
    category: 'resources',
    description: 'Colheitadeiras, irrigação e armazenagem modernas.',
    cost: 0.02,
    minDays: 17,
    prereqs: [],
    effect: {},
    unlocks: ['Melhorias de fazenda a partir do nível 5'],
  },
  mechanized_extraction: {
    id: 'mechanized_extraction',
    label: 'Extração mecanizada',
    category: 'resources',
    description: 'Máquinas pesadas, britagem e metalurgia básica.',
    cost: 0.025,
    minDays: 20,
    prereqs: [],
    effect: {},
    unlocks: ['Melhorias de serraria, pedreira e mina a partir do nível 5'],
  },
  digital_comms: {
    id: 'digital_comms',
    label: 'Comunicações digitais',
    category: 'military',
    description: 'Rádios digitais criptografados e rede de dados entre as unidades.',
    cost: 0.025,
    minDays: 20,
    prereqs: [],
    effect: {},
    unlocks: ['Modernização "Rádio digital" (todas as tropas): +2 de visão e disparo 8% mais rápido'],
  },
  territorial_administration: {
    id: 'territorial_administration',
    label: 'Administração territorial',
    category: 'state',
    description: 'Cadastro, policiamento e serviços públicos nas áreas ocupadas.',
    cost: 0.025,
    minDays: 20,
    prereqs: ['logistics'],
    effect: { territoryMul: 1.2 },
    unlocks: ['+20% no raio de território das construções (fronteiras maiores)', 'QG a partir do nível 7'],
  },
  automation: {
    id: 'automation',
    label: 'Automação industrial',
    category: 'industry',
    description: 'Robótica e controle digital nas linhas de produção.',
    cost: 0.05,
    minDays: 40,
    prereqs: ['modular_construction'],
    effect: { growthBonus: 0.4 },
    unlocks: ['+0,4 p.p. no crescimento econômico anual', 'Melhorias de fábrica a partir do nível 5'],
  },
  advanced_drilling: {
    id: 'advanced_drilling',
    label: 'Perfuração avançada',
    category: 'resources',
    description: 'Perfuração direcional e recuperação avançada de petróleo.',
    cost: 0.025,
    minDays: 20,
    prereqs: ['mechanized_extraction'],
    effect: {},
    unlocks: ['Melhorias de poço de petróleo a partir do nível 5'],
  },
  composite_armor: {
    id: 'composite_armor',
    label: 'Blindagem composta',
    category: 'military',
    description: 'Placas de cerâmica e aço em camadas; coletes balísticos de nova geração.',
    cost: 0.0417,
    minDays: 33,
    prereqs: ['mechanized_extraction'],
    effect: {},
    unlocks: ['Modernização "Blindagem composta" (veículos): +25% de vida', 'Modernização "Colete balístico" (infantaria): +15% de vida'],
  },
  guided_munitions: {
    id: 'guided_munitions',
    label: 'Munição guiada',
    category: 'military',
    description: 'Munição com guiagem e controle de tiro digital.',
    cost: 0.0417,
    minDays: 33,
    prereqs: ['digital_comms'],
    effect: {},
    unlocks: ['Modernização "Munição guiada" (todas as tropas): +15% de dano', 'Melhorias da torre a partir do nível 4', 'Ataques aéreos a infraestrutura (caças) com maior precisão'],
  },
  sensor_optics: {
    id: 'sensor_optics',
    label: 'Sensores e óptica térmica',
    category: 'military',
    description: 'Câmeras térmicas, telêmetro a laser e radar de vigilância.',
    cost: 0.0333,
    minDays: 27,
    prereqs: ['digital_comms'],
    effect: {},
    unlocks: ['Modernização "Óptica térmica" (veículos): +2 de visão e +1 de alcance'],
  },
  efficient_propulsion: {
    id: 'efficient_propulsion',
    label: 'Propulsão eficiente',
    category: 'military',
    description: 'Motores e transmissões de menor consumo e maior confiabilidade.',
    cost: 0.0417,
    minDays: 33,
    prereqs: ['automation', 'advanced_drilling'],
    effect: {},
    unlocks: ['Modernização "Motor eficiente" (veículos): +12% de velocidade e −30% de desgaste fora de linha de suprimento'],
  },
  ballistic_missiles: {
    id: 'ballistic_missiles',
    label: 'Mísseis balísticos',
    category: 'military',
    description: 'Propulsão de foguete, guiagem inercial e silos endurecidos.',
    cost: 0.05,
    minDays: 40,
    prereqs: ['guided_munitions'],
    effect: {},
    unlocks: ['Silo de mísseis (até 2 mísseis por silo)', 'Lançamento com preparação, autorização e interceptação pela antiaérea'],
  },
  nuclear_weapons: {
    id: 'nuclear_weapons',
    label: 'Armas nucleares',
    category: 'military',
    description: 'Enriquecimento, ogiva e miniaturização para o míssil balístico.',
    cost: 0.08,
    minDays: 60,
    prereqs: ['ballistic_missiles'],
    effect: {},
    unlocks: [
      'Ogiva nuclear nos silos de mísseis: dano e raio enormes, mais difícil de interceptar',
      'Todo lançamento nuclear derruba a economia global por meses, inclusive a sua, e custa muita reputação',
    ],
  },
  space_technology: {
    id: 'space_technology',
    label: 'Tecnologia espacial',
    category: 'state',
    description: 'Lançadores orbitais, satélites de observação e controle de missão.',
    cost: 0.09,
    minDays: 70,
    prereqs: ['ballistic_missiles', 'sensor_optics'],
    effect: {},
    unlocks: ['Programa Espacial (Futuro Próximo, QG nível 9): satélite que revela o mapa inteiro em tempo real'],
  },
  silviculture: {
    id: 'silviculture',
    label: 'Silvicultura de eucalipto',
    category: 'resources',
    description: 'Mudas clonadas, plantio em linha e corte rotativo: madeira plantada em vez de floresta nativa.',
    cost: 0.035,
    minDays: 30,
    prereqs: ['agricultural_mechanization'],
    effect: {},
    minEra: 3,
    unlocks: ['Floresta de Eucalipto: madeira devagar, mas sem acabar (uma por cidade)', 'Forno de Carvão Vegetal ao lado da floresta: madeira vira carvão'],
  },
  underground_mining: {
    id: 'underground_mining',
    label: 'Mineração subterrânea',
    category: 'resources',
    description: 'Poços verticais, galerias escoradas e ventilação: minerar sem afloramento na superfície.',
    cost: 0.04,
    minDays: 34,
    prereqs: ['mechanized_extraction'],
    effect: {},
    minEra: 3,
    unlocks: ['Mina Subterrânea em qualquer lugar do território: pedra, ferro e carvão sem acabar (uma por cidade)'],
  },
  // --- 03/11 (pedido do usuário: mais pesquisas). Cada uma libera algo que já existia, antes só pela era.
  road_engineering: {
    id: 'road_engineering',
    label: 'Engenharia rodoviária',
    category: 'state',
    description: 'Terraplenagem, pavimento de alto tráfego e obras de arte fora das cidades.',
    cost: 0.02,
    minDays: 15,
    prereqs: [],
    effect: {},
    unlocks: ['Rodovia: pista dupla que sai da fronteira pela terra neutra e acelera cargas e tropas'],
  },
  foreign_trade: {
    id: 'foreign_trade',
    label: 'Comércio exterior',
    category: 'state',
    description: 'Aduana, câmbio e contratos de fornecimento com outros países.',
    cost: 0.02,
    minDays: 15,
    prereqs: ['logistics'],
    effect: {},
    unlocks: ['Terminal Comercial: anúncios e contratos com as nações da partida, mercado mundial e mercado interno'],
  },
  naval_logistics: {
    id: 'naval_logistics',
    label: 'Logística naval',
    category: 'state',
    description: 'Cais, guindastes de contêiner e embarque de tropas pelo mar.',
    cost: 0.02,
    minDays: 15,
    prereqs: ['logistics'],
    effect: {},
    unlocks: ['Porto: cargas do comércio por navio', 'Navio de Transporte: tropas pelo mar até outra costa'],
  },
  urban_planning: {
    id: 'urban_planning',
    label: 'Planejamento urbano',
    category: 'state',
    description: 'Plano diretor, verticalização e redes de água e esgoto.',
    cost: 0.02,
    minDays: 15,
    prereqs: [],
    effect: {},
    unlocks: ['Prédio Residencial: muito mais moradia na mesma área'],
  },
  public_health: {
    id: 'public_health',
    label: 'Saúde pública',
    category: 'state',
    description: 'Rede hospitalar, vacinação e atendimento de emergência.',
    cost: 0.02,
    minDays: 15,
    prereqs: ['urban_planning'],
    effect: {},
    unlocks: ['Hospital: cura tropas e atende a cidade no raio dele'],
  },
  public_security: {
    id: 'public_security',
    label: 'Segurança pública',
    category: 'state',
    description: 'Polícia comunitária, perícia e centrais de atendimento.',
    cost: 0.02,
    minDays: 15,
    prereqs: ['urban_planning'],
    effect: {},
    unlocks: ['Delegacia: segurança para a cidade no raio dela'],
  },
  higher_education: {
    id: 'higher_education',
    label: 'Ensino superior',
    category: 'state',
    description: 'Universidades públicas, bolsas e pós-graduação.',
    cost: 0.025,
    minDays: 18,
    prereqs: ['public_health'],
    effect: {},
    unlocks: ['Universidade: muito mais conhecimento por dia que a escola'],
  },
  financial_markets: {
    id: 'financial_markets',
    label: 'Mercado financeiro',
    category: 'state',
    description: 'Bolsa de valores, bancos de investimento e câmara de compensação.',
    cost: 0.04,
    minDays: 30,
    prereqs: ['foreign_trade', 'higher_education'],
    effect: {},
    minEra: 4,
    unlocks: ['Centro Financeiro (Grande Projeto)'],
  },
  wind_power: {
    id: 'wind_power',
    label: 'Energia eólica',
    category: 'industry',
    description: 'Aerogeradores de grande porte e linhas de transmissão.',
    cost: 0.02,
    minDays: 15,
    prereqs: [],
    effect: {},
    unlocks: ['Usina Eólica: energia sem carvão'],
  },
  solar_power: {
    id: 'solar_power',
    label: 'Energia solar',
    category: 'industry',
    description: 'Painéis fotovoltaicos de alto rendimento e baterias.',
    cost: 0.025,
    minDays: 18,
    prereqs: ['wind_power'],
    effect: {},
    minEra: 3,
    unlocks: ['Usina Solar: energia de dia, sem carvão'],
  },
  hydro_power: {
    id: 'hydro_power',
    label: 'Hidrelétricas',
    category: 'industry',
    description: 'Barragens, turbinas e eclusas em grandes rios.',
    cost: 0.035,
    minDays: 25,
    prereqs: ['wind_power', 'modular_construction'],
    effect: {},
    minEra: 4,
    unlocks: ['Usina Hidrelétrica (Grande Projeto)'],
  },
  nuclear_power: {
    id: 'nuclear_power',
    label: 'Energia nuclear',
    category: 'industry',
    description: 'Reatores de água pressurizada, combustível enriquecido e contenção.',
    cost: 0.045,
    minDays: 32,
    prereqs: ['solar_power', 'automation'],
    effect: {},
    minEra: 4,
    unlocks: ['Usina Nuclear (Grande Projeto)'],
  },
  steelmaking: {
    id: 'steelmaking',
    label: 'Siderurgia',
    category: 'industry',
    description: 'Altos-fornos, aciaria e laminação.',
    cost: 0.02,
    minDays: 15,
    prereqs: [],
    effect: {},
    unlocks: ['Siderúrgica: ferro e carvão viram aço, que barateia veículos e obras'],
  },
  oil_refining: {
    id: 'oil_refining',
    label: 'Refino de petróleo',
    category: 'industry',
    description: 'Destilação, craqueamento e tancagem de combustíveis.',
    cost: 0.02,
    minDays: 15,
    prereqs: ['steelmaking'],
    effect: {},
    unlocks: ['Refinaria: petróleo vira combustível, que barateia veículos e aeronaves'],
  },
  telecom_5g: {
    id: 'telecom_5g',
    label: 'Redes 5G',
    category: 'industry',
    description: 'Antenas de baixa latência e núcleo de rede definido por software.',
    cost: 0.035,
    minDays: 25,
    prereqs: ['automation'],
    effect: {},
    minEra: 4,
    unlocks: ['Torre 5G'],
  },
  military_aviation: {
    id: 'military_aviation',
    label: 'Aviação militar',
    category: 'military',
    description: 'Caças a jato, pilotos de combate e pistas reforçadas.',
    cost: 0.03,
    minDays: 22,
    prereqs: ['digital_comms'],
    effect: {},
    minEra: 3,
    unlocks: ['Base Aérea: caças, reconhecimento, cargueiros e bombardeiros'],
  },
  air_defense: {
    id: 'air_defense',
    label: 'Defesa aérea',
    category: 'military',
    description: 'Radares de vigilância e mísseis superfície-ar.',
    cost: 0.02,
    minDays: 15,
    prereqs: [],
    effect: {},
    unlocks: ['Bateria Antiaérea'],
  },
  naval_warfare: {
    id: 'naval_warfare',
    label: 'Guerra naval',
    category: 'military',
    description: 'Cascos de combate, canhões navais e controle de tiro no mar.',
    cost: 0.03,
    minDays: 22,
    prereqs: ['naval_logistics'],
    effect: {},
    unlocks: ['Fragata: combate navios, bombardeia a costa, tem antiaérea e leva 15 soldados'],
  },
  submarine_warfare: {
    id: 'submarine_warfare',
    label: 'Submarinos',
    category: 'military',
    description: 'Cascos de pressão, sonar passivo e torpedos guiados.',
    cost: 0.04,
    minDays: 30,
    prereqs: ['naval_warfare'],
    effect: {},
    minEra: 2,
    unlocks: ['Submarino de Ataque: afunda navios e só é atacado por outro submarino'],
  },
  cruise_missiles: {
    id: 'cruise_missiles',
    label: 'Mísseis de cruzeiro submarinos',
    category: 'military',
    description: 'Tubos verticais, lançamento submerso e guiagem por terreno (ogiva convencional).',
    cost: 0.07,
    minDays: 50,
    prereqs: ['submarine_warfare', 'guided_munitions'],
    effect: {},
    minEra: 3,
    unlocks: ['Submarino Lançador: torpedos e 4 mísseis de cruzeiro contra qualquer ponto fora da sua fronteira, dentro do alcance'],
  },
  naval_aviation: {
    id: 'naval_aviation',
    label: 'Aviação embarcada',
    category: 'military',
    description: 'Catapultas, cabos de parada e caças navalizados.',
    cost: 0.08,
    minDays: 55,
    prereqs: ['naval_warfare', 'military_aviation'],
    effect: {},
    minEra: 3,
    unlocks: ['Porta-Aviões com 4 caças embarcados'],
  },
  airborne_operations: {
    id: 'airborne_operations',
    label: 'Operações aerotransportadas',
    category: 'military',
    description: 'Cargueiros estratégicos, paraquedas de carga e tropas paraquedistas.',
    cost: 0.05,
    minDays: 35,
    prereqs: ['military_aviation'],
    effect: {},
    minEra: 3,
    unlocks: ['Cargueiro C-5 Galaxy: lança até 12 soldados e 3 veículos de paraquedas no ponto escolhido'],
  },
};

/**
 * Pontos de conhecimento para começar a pesquisa (02/11): 15 mais 15 por nível na árvore (o maior caminho de
 * pré-requisitos), mais 20 nas pesquisas de era mínima. Pagos uma vez, ao começar.
 */
export function techKnowledge(id: TechId): number {
  const depth = (t: TechId): number => Math.max(0, ...TECHNOLOGIES[t].prereqs.map((p) => depth(p) + 1));
  return 15 + 15 * depth(id) + (TECHNOLOGIES[id].minEra ? 20 : 0);
}

export const TECH_IDS = Object.keys(TECHNOLOGIES) as TechId[];

export const isTechId = (v: unknown): v is TechId => typeof v === 'string' && Object.hasOwn(TECHNOLOGIES, v);

export function combineEffects(done: readonly TechId[]): TechEffects {
  const e = { ...NEUTRAL_EFFECTS };
  for (const id of done) {
    const t = TECHNOLOGIES[id].effect;
    e.theaterSupplyMul *= t.theaterSupplyMul ?? 1;
    e.constructionTimeMul *= t.constructionTimeMul ?? 1;
    e.productionTimeMul *= t.productionTimeMul ?? 1;
    e.growthBonus += t.growthBonus ?? 0;
    e.territoryMul *= t.territoryMul ?? 1;
  }
  return e;
}

/** Pré-requisitos ainda não concluídos. */
export function missingPrereqs(id: TechId, done: readonly TechId[]): TechId[] {
  return TECHNOLOGIES[id].prereqs.filter((p) => !done.includes(p));
}

/** Motivo para não poder iniciar a pesquisa, ou null. Mesma regra no servidor e no painel. */
export function researchBlocker(id: TechId, done: readonly TechId[], ctx: { era?: number; knowledge?: number; kpPaid?: boolean } = {}): string | null {
  if (done.includes(id)) return 'Pesquisa já concluída';
  const missing = missingPrereqs(id, done);
  if (missing.length) return `Requer: ${missing.map((m) => TECHNOLOGIES[m].label).join(', ')}`;
  const minEra = TECHNOLOGIES[id].minEra;
  if (minEra && ctx.era !== undefined && ctx.era < minEra) return `Requer a era ${minEra} (avance de era no Centro de Comando)`;
  if (!ctx.kpPaid && ctx.knowledge !== undefined && ctx.knowledge + 1e-9 < techKnowledge(id))
    return `Conhecimento insuficiente: ${Math.floor(ctx.knowledge)} de ${techKnowledge(id)} (forme mais em escolas e universidades)`;
  return null;
}

/**
 * Custo da pesquisa em US$ por dia de jogo (02/11, pedido do usuário: "pode tirar do orçamento diário"): enquanto a
 * pesquisa corre, esse valor sai do caixa do país todo dia, como uma linha de despesa no extrato. Mais fundo na árvore,
 * mais caro; as de era mínima custam mais. Valores para o PIB de referência (o caixa escala com o PIB do país).
 */
export function techDailyUsd(id: TechId): number {
  const depth = (t: TechId): number => Math.max(0, ...TECHNOLOGIES[t].prereqs.map((p) => depth(p) + 1));
  return 15_000 + 12_000 * depth(id) + (TECHNOLOGIES[id].minEra ? 15_000 : 0);
}

/** Dias de jogo para concluir a pesquisa (prazo fixo: `minDays`). */
export const techDays = (id: TechId): number => TECHNOLOGIES[id].minDays;

/** Custo total em US$ (dias × custo do dia). */
export const techTotalUsd = (id: TechId): number => techDailyUsd(id) * techDays(id);

/** Dias que faltam (com o caixa pagando todo dia). */
export function researchEtaDays(id: TechId, progress: number): number {
  return Math.ceil((1 - progress) * techDays(id) - 1e-9);
}
