import imf from '../data/reference/imf.json';
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
  'govBalancePctGdp',
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
const rawImf = imf as RawFile;

/**
 * Campos em que o FMI (governo geral, WEO) tem precedência sobre o Banco Mundial (governo central
 * ou séries com defasagem maior). Sem valor do FMI, usa-se o do Banco Mundial.
 */
const IMF_PREFERRED: ReferenceKey[] = ['govDebtPctGdp', 'govRevenuePctGdp', 'govExpensePctGdp', 'govBalancePctGdp', 'inflationPct'];

function imfHasValues(key: ReferenceKey): boolean {
  return Object.values(rawImf.countries ?? {}).some((c) => c[key]);
}

const labelsWb = Object.fromEntries((raw.indicators ?? []).map((i) => [i.key, i.label]));
const labelsImf = Object.fromEntries((rawImf.indicators ?? []).map((i) => [i.key, i.label]));

export const REFERENCE_META = {
  fetchedAt: raw.fetchedAt ?? null,
  imfFetchedAt: rawImf.fetchedAt ?? null,
  license: raw.license ?? null,
  /** Rótulo do indicador; o do FMI prevalece nos campos em que ele é a fonte preferida. */
  labels: {
    ...labelsWb,
    ...Object.fromEntries(IMF_PREFERRED.filter((k) => labelsImf[k] && imfHasValues(k)).map((k) => [k, labelsImf[k]])),
  } as Partial<Record<ReferenceKey, string>>,
};

/** Dados de referência de um país. Campos ausentes vêm com value=null e quality='unknown'. */
export function countryReference(id: string): CountryReference {
  const entries = raw.countries?.[id] ?? {};
  const imfEntries = rawImf.countries?.[id] ?? {};
  const values = {} as Record<ReferenceKey, SourcedValue>;
  for (const key of REFERENCE_KEYS) {
    const e = (IMF_PREFERRED.includes(key) ? imfEntries[key] : null) ?? entries[key];
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
