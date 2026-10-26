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
  GBR: {
    system: 'Monarquia constitucional parlamentarista',
    headOfState: { title: 'Rei', name: 'Charles III' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Keir Starmer' },
  },
  CHN: {
    system: 'República socialista de partido único',
    headOfState: { title: 'Presidente', name: 'Xi Jinping' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Li Qiang' },
  },
  ITA: {
    system: 'República parlamentarista',
    headOfState: { title: 'Presidente', name: 'Sergio Mattarella' },
    headOfGovernment: { title: 'Presidenta do Conselho de Ministros', name: 'Giorgia Meloni' },
  },
  CAN: {
    system: 'Monarquia constitucional parlamentarista federal',
    headOfState: { title: 'Rei', name: 'Charles III' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Mark Carney' },
  },
  SAU: {
    system: 'Monarquia absoluta',
    headOfState: { title: 'Rei', name: 'Salman bin Abdulaziz Al Saud' },
    headOfGovernment: { title: 'Príncipe herdeiro e primeiro-ministro', name: 'Mohammed bin Salman' },
  },
  ESP: {
    system: 'Monarquia constitucional parlamentarista',
    headOfState: { title: 'Rei', name: 'Felipe VI' },
    headOfGovernment: { title: 'Presidente do Governo', name: 'Pedro Sánchez' },
  },
  EGY: {
    system: 'República semipresidencialista',
    headOfState: { title: 'Presidente', name: 'Abdel Fattah el-Sisi' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Mostafa Madbouly' },
  },
  RUS: {
    system: 'República semipresidencialista federal',
    headOfState: { title: 'Presidente', name: 'Vladimir Putin' },
    headOfGovernment: { title: 'Presidente do Governo (primeiro-ministro)', name: 'Mikhail Mishustin' },
  },
  TUR: { system: 'República presidencialista', headOfState: { title: 'Presidente', name: 'Recep Tayyip Erdoğan' }, headOfGovernment: null },
  KOR: { system: 'República presidencialista', headOfState: { title: 'Presidente', name: 'Lee Jae-myung' }, headOfGovernment: null },
  PRK: {
    system: 'Estado socialista de partido único',
    headOfState: { title: 'Presidente dos Assuntos de Estado', name: 'Kim Jong Un' },
    headOfGovernment: { title: 'Primeiro-ministro', name: 'Pak Thae-song' },
  },
};
