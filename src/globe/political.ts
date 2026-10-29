import { COUNTRY_GEO, geoOf } from '../../shared/data/geography.ts';
import type { GlobeSatellite } from './GlobeView.ts';
import { countryName } from '../../shared/data/countries.ts';
import type { DiplomacyView } from '../../shared/protocol.ts';
import type { NationId } from '../../shared/strategic/Diplomacy.ts';
import type { GlobeArc, GlobeLabel, PoliticalFill } from './GlobeView.ts';

/**
 * Estado político de cada país do ponto de vista do jogador, derivado só da visão filtrada
 * que o servidor envia. As mesmas cores são usadas no globo, na legenda e nos painéis.
 */
export type PoliticalState = 'self' | 'war' | 'sanctions' | 'ally' | 'trade' | 'hostile' | 'neutral' | 'unknown';

export const POLITICAL_COLORS: Record<PoliticalState, string> = {
  self: '#e0b44c',
  war: '#e05a4c',
  sanctions: '#b07ad8',
  ally: '#4ca3e0',
  trade: '#6fb58a',
  hostile: '#e08a4c',
  neutral: '#8693a2',
  unknown: '#3b434d',
};

export const POLITICAL_LABELS: Record<PoliticalState, string> = {
  self: 'Seu país',
  war: 'Em guerra',
  sanctions: 'Sanções',
  ally: 'Aliado',
  trade: 'Parceiro comercial',
  hostile: 'Relação hostil',
  neutral: 'Neutro',
  unknown: 'Sem contato',
};

/** Relação abaixo disto aparece como hostil. */
const HOSTILE_BELOW = -15;

export function politicalState(view: DiplomacyView, me: NationId, other: NationId): PoliticalState {
  if (other === me) return 'self';
  const f = view.nations.find((n) => n.id === other);
  if (!f || !f.known) return 'unknown';
  const pair = (a: NationId, b: NationId) => (a === me && b === other) || (a === other && b === me);
  if (view.wars.some(([a, b]) => pair(a, b))) return 'war';
  if (view.treaties.some((t) => t.type === 'sanctions' && pair(t.a, t.b))) return 'sanctions';
  if (view.treaties.some((t) => t.type === 'alliance' && pair(t.a, t.b))) return 'ally';
  if (view.treaties.some((t) => t.type === 'trade' && pair(t.a, t.b))) return 'trade';
  const rel = view.relations.find((r) => r.b === other)?.value ?? 0;
  return rel < HOSTILE_BELOW ? 'hostile' : 'neutral';
}

export interface ScenarioNation {
  id: NationId;
  countryId: string;
}

/** Todas as nações do cenário (o próprio jogador + as demais da visão). */
export function scenarioNations(view: DiplomacyView, me: NationId, myCountry: string): ScenarioNation[] {
  return [{ id: me, countryId: myCountry }, ...view.nations.map((n) => ({ id: n.id, countryId: n.countryId }))];
}

/** Preenchimentos por ISO numérico. Países fora do cenário ficam esmaecidos. */
export function politicalFills(view: DiplomacyView, me: NationId, myCountry: string, outsideIso: string[]): Record<string, PoliticalFill> {
  const fills: Record<string, PoliticalFill> = {};
  for (const iso of outsideIso) fills[iso] = { color: '#05080c', alpha: 0.5 };
  for (const n of scenarioNations(view, me, myCountry)) {
    const iso = geoOf(n.countryId)?.isoNumeric;
    if (!iso) continue;
    const st = politicalState(view, me, n.id);
    fills[iso] = st === 'unknown' ? { color: POLITICAL_COLORS.unknown, alpha: 0.55, hatch: true } : { color: POLITICAL_COLORS[st], alpha: st === 'neutral' ? 0.28 : 0.45 };
  }
  return fills;
}

export function politicalLabels(view: DiplomacyView, me: NationId, myCountry: string): GlobeLabel[] {
  return scenarioNations(view, me, myCountry).flatMap((n) => {
    const g = geoOf(n.countryId);
    if (!g) return [];
    const st = politicalState(view, me, n.id);
    return [{ key: n.countryId, lon: g.capital.lon, lat: g.capital.lat, text: countryName(n.countryId), sub: g.capital.name, color: st === 'unknown' ? '#9aa6b2' : POLITICAL_COLORS[st] }];
  });
}

/** Satélites em órbita (públicos), na cor do estado político do país para o observador. */
export function politicalSatellites(view: DiplomacyView, me: NationId, myCountry: string): GlobeSatellite[] {
  const nations = scenarioNations(view, me, myCountry);
  return (view.satellites ?? []).flatMap((id) => {
    const n = nations.find((x) => x.id === id);
    const g = n ? geoOf(n.countryId) : undefined;
    if (!n || !g) return [];
    const st = politicalState(view, me, id);
    return [{ key: n.countryId, lon: g.capital.lon, lat: g.capital.lat, code: n.countryId, color: st === 'unknown' ? '#9aa6b2' : POLITICAL_COLORS[st] }];
  });
}

/** Linhas entre capitais para tratados e guerras conhecidos (fluxos reais do estado, não decoração). */
export function politicalArcs(view: DiplomacyView, me: NationId, myCountry: string): GlobeArc[] {
  const nations = scenarioNations(view, me, myCountry);
  const cap = (id: NationId) => {
    const c = nations.find((n) => n.id === id);
    return c ? geoOf(c.countryId)?.capital : undefined;
  };
  const arcs: GlobeArc[] = [];
  const push = (a: NationId, b: NationId, color: string, dashed = false) => {
    const from = cap(a);
    const to = cap(b);
    if (from && to) arcs.push({ from, to, color, dashed });
  };
  for (const t of view.treaties) push(t.a, t.b, t.type === 'sanctions' ? POLITICAL_COLORS.sanctions : t.type === 'alliance' ? POLITICAL_COLORS.ally : POLITICAL_COLORS.trade, t.type === 'sanctions');
  for (const [a, b] of view.wars) push(a, b, POLITICAL_COLORS.war);
  return arcs;
}

/** ISO numérico → país do cenário (ou undefined se fora do cenário). */
export function scenarioCountryByIso(iso: string): string | undefined {
  return COUNTRY_GEO.find((g) => g.isoNumeric === iso)?.id;
}
