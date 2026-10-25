/**
 * Chefes de Estado e de governo na data de referência do cenário (2026-01-01).
 * Registro editorial verificado manualmente contra fontes oficiais de cada governo; deve ser
 * revisado sempre que a data de referência mudar. Não descreve orientação política nem
 * atribui características aos líderes — apenas cargo e nome.
 */
export interface LeaderRecord {
  headOfState: { title: string; name: string };
  headOfGovernment: { title: string; name: string } | null; // null quando acumulado pelo chefe de Estado
  system: string;
}

export const LEADERS_REFERENCE_DATE = '2026-01-01';

export const LEADERS: Record<string, LeaderRecord> = {
  BRA: { system: 'República presidencialista', headOfState: { title: 'Presidente', name: 'Luiz Inácio Lula da Silva' }, headOfGovernment: null },
  ARG: { system: 'República presidencialista', headOfState: { title: 'Presidente', name: 'Javier Milei' }, headOfGovernment: null },
  USA: { system: 'República presidencialista federal', headOfState: { title: 'Presidente', name: 'Donald Trump' }, headOfGovernment: null },
  MEX: { system: 'República presidencialista federal', headOfState: { title: 'Presidenta', name: 'Claudia Sheinbaum' }, headOfGovernment: null },
  DEU: {
    system: 'República parlamentarista federal',
    headOfState: { title: 'Presidente federal', name: 'Frank-Walter Steinmeier' },
    headOfGovernment: { title: 'Chanceler', name: 'Friedrich Merz' },
  },
  FRA: {
    system: 'República semipresidencialista',
    headOfState: { title: 'Presidente', name: 'Emmanuel Macron' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Sébastien Lecornu' },
  },
  IND: {
    system: 'República parlamentarista federal',
    headOfState: { title: 'Presidenta', name: 'Droupadi Murmu' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Narendra Modi' },
  },
  JPN: {
    system: 'Monarquia constitucional parlamentarista',
    headOfState: { title: 'Imperador', name: 'Naruhito' },
    headOfGovernment: { title: 'Primeira-ministra', name: 'Sanae Takaichi' },
  },
  ZAF: { system: 'República parlamentarista (presidente eleito pelo parlamento)', headOfState: { title: 'Presidente', name: 'Cyril Ramaphosa' }, headOfGovernment: null },
  AUS: {
    system: 'Monarquia constitucional parlamentarista federal',
    headOfState: { title: 'Rei', name: 'Charles III' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Anthony Albanese' },
  },
};
