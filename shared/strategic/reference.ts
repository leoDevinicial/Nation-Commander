import worldbank from '../data/reference/worldbank.json';
import { LEADERS, LEADERS_REFERENCE_DATE, type LeaderRecord } from '../data/reference/leaders.ts';

/** Valor com procedência. `quality` distingue dado oficial de parâmetro de jogo. */
export interface SourcedValue {
  value: number | null;
  unit: string;
  /** Ano (ou data ISO) a que o valor se refere. */
  referenceDate: string;
  sourceName: string;
  sourceUrl?: string;
  quality: 'official' | 'research' | 'estimate' | 'game_parameter' | 'unknown';
  notes?: string;
}

export const REFERENCE_KEYS = [
  'population',
  'gdpUsd',
  'gdpPerCapitaUsd',
  'gdpGrowthPct',
  'inflationPct',
  'unemploymentPct',
  'govDebtPctGdp',
  'govRevenuePctGdp',
  'govExpensePctGdp',
  'militaryPctGdp',
  'militaryUsd',
  'armedForces',
  'educationPctGdp',
  'healthPctGdp',
  'researchPctGdp',
  'lifeExpectancy',
  'electricityAccessPct',
  'tradePctGdp',
  'landAreaKm2',
] as const;

export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

export interface CountryReference {
  id: string;
  values: Record<ReferenceKey, SourcedValue>;
  leaders: LeaderRecord | null;
  leadersReferenceDate: string;
}

interface RawEntry {
  value: number;
  year: number;
  unit: string;
  indicator: string;
  sourceName: string;
  sourceUrl: string;
}

interface RawFile {
  fetchedAt?: string;
  license?: string;
  indicators?: { key: string; label: string; unit: string; code: string }[];
  countries?: Record<string, Partial<Record<ReferenceKey, RawEntry | null>>>;
}

const raw = worldbank as RawFile;

export const REFERENCE_META = {
  fetchedAt: raw.fetchedAt ?? null,
  license: raw.license ?? null,
  labels: Object.fromEntries((raw.indicators ?? []).map((i) => [i.key, i.label])) as Partial<Record<ReferenceKey, string>>,
};

/** Dados de referência de um país. Campos ausentes vêm com value=null e quality='unknown'. */
export function countryReference(id: string): CountryReference {
  const entries = raw.countries?.[id] ?? {};
  const values = {} as Record<ReferenceKey, SourcedValue>;
  for (const key of REFERENCE_KEYS) {
    const e = entries[key];
    values[key] = e
      ? {
          value: e.value,
          unit: e.unit,
          referenceDate: String(e.year),
          sourceName: e.sourceName,
          sourceUrl: e.sourceUrl,
          quality: 'official',
          notes: `Série ${e.indicator}`,
        }
      : { value: null, unit: '', referenceDate: '', sourceName: 'Sem dado confiável', quality: 'unknown' };
  }
  return { id, values, leaders: LEADERS[id] ?? null, leadersReferenceDate: LEADERS_REFERENCE_DATE };
}

export function hasReferenceData(): boolean {
  return Boolean(raw.countries && Object.keys(raw.countries).length > 0);
}
