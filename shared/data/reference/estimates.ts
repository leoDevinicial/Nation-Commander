/**
 * Estimativas de pesquisa para países que não publicam estatísticas oficiais (hoje, só a Coreia
 * do Norte: o Banco Mundial e o FMI não têm PIB, crescimento nem gasto militar dela). Usadas
 * apenas onde não há valor oficial, sempre marcadas como estimativa e com a fonte. Registro
 * editorial: revisar quando a data de referência do cenário mudar.
 */
export interface EstimateEntry {
  value: number;
  unit: string;
  referenceDate: string;
  sourceName: string;
  sourceUrl: string;
  notes: string;
}

export const ESTIMATES: Record<string, Partial<Record<string, EstimateEntry>>> = {
  PRK: {
    gdpUsd: {
      value: 32.01e9,
      unit: 'US$ correntes',
      referenceDate: '2024',
      sourceName: 'Banco da Coreia (estimativa anual da economia norte-coreana), via The Korea Times',
      sourceUrl: 'https://www.koreatimes.co.kr/amp/foreignaffairs/northkorea/20250829/n-korean-economy-logs-fastest-growth-in-8-years-in-2024-bok',
      notes: 'Renda nacional bruta nominal de 44,4 trilhões de wons (2024), usada como PIB; estimativa externa, a Coreia do Norte não publica contas nacionais.',
    },
    gdpPerCapitaUsd: {
      value: 1240,
      unit: 'US$ correntes',
      referenceDate: '2024',
      sourceName: 'Banco da Coreia (estimativa), via The Korea Times',
      sourceUrl: 'https://www.koreatimes.co.kr/amp/foreignaffairs/northkorea/20250829/n-korean-economy-logs-fastest-growth-in-8-years-in-2024-bok',
      notes: 'Renda per capita de 1,72 milhão de wons (2024), convertida pela mesma taxa da renda nacional.',
    },
    gdpGrowthPct: {
      value: 3.7,
      unit: '% a.a.',
      referenceDate: '2024',
      sourceName: 'Banco da Coreia (estimativa), via The Korea Times',
      sourceUrl: 'https://www.koreatimes.co.kr/amp/foreignaffairs/northkorea/20250829/n-korean-economy-logs-fastest-growth-in-8-years-in-2024-bok',
      notes: 'Crescimento real estimado de 2024, o maior desde 2016.',
    },
    militaryPctGdp: {
      value: 18.4,
      unit: '% do PIB',
      referenceDate: '2007–2017',
      sourceName: 'Departamento de Estado dos EUA — World Military Expenditures and Arms Transfers (WMEAT 2019)',
      sourceUrl: 'https://www.state.gov/world-military-expenditures-and-arms-transfers/',
      notes: 'Ponto médio da faixa de 13,4% a 23,4% do PIB (média 2007–2017; a faixa vem dos métodos de conversão cambial). A maior do mundo no relatório.',
    },
  },
};
