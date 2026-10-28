import { describe, expect, it } from 'vitest';
import type { NationalEvent } from '../../shared/strategic/NationalSimulation.ts';
import { buildNews, matchesFilter } from '../game/news.ts';

const names: Record<number, string> = { 0: 'Brasil', 1: 'Argentina', 100: 'Estados Unidos' };
const nameOf = (id: number) => names[id] ?? `#${id}`;
const entry = (event: NationalEvent, date = '2026-02-01') => ({ event, date });

/** Guerra → sanções dos EUA → protestos no Brasil, como o motor registra. */
const chain: NationalEvent[] = [
  { id: 1, type: 'diplomacy', day: 10, event: { id: 1, type: 'war_declared', day: 10, by: 0, target: 1, costs: { usd: 5e9, supplies: 150, oil: 100, approval: -3 }, brokenTreaties: [], respondingAllies: [100] } },
  { id: 2, causeIds: [1], type: 'diplomacy', day: 10, event: { id: 2, causes: [1], type: 'treaty_signed', day: 10, treaty: { id: 7, type: 'sanctions', a: 100, b: 0, startDay: 10, endDay: 370 } } },
  { id: 3, contextIds: [1], type: 'military_strike', day: 12, slot: 0, victim: 1, kind: 'air', target: 'hq', damage: 40, oilLost: 0, destroyed: 0, intercepted: false },
  { id: 4, causeIds: [2], type: 'protest', day: 40, slot: 0, approval: 30, causes: [{ key: 'tax', label: 'Impostos', value: -10 }] },
  { id: 5, causeIds: [2], type: 'protest', day: 55, slot: 0, approval: 28, causes: [{ key: 'tax', label: 'Impostos', value: -10 }] },
  { id: 6, causeIds: [2], type: 'protest', day: 120, slot: 0, approval: 25, causes: [{ key: 'tax', label: 'Impostos', value: -10 }] },
];

describe('noticiário (Fase 9)', () => {
  it('cada notícia vem de eventos registrados, da mais recente para a mais antiga', () => {
    const feed = buildNews(chain.map((e) => entry(e)), 0, nameOf);
    const all = feed.items.flatMap((n) => n.eventIds);
    expect([...all].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(feed.items[0]!.id).toBe(6);
    expect(feed.items.at(-1)!.id).toBe(1);
  });

  it('agrupa eventos repetitivos próximos sem perder o rastro de cada um', () => {
    const feed = buildNews(chain.map((e) => entry(e)), 0, nameOf);
    const grouped = feed.items.find((n) => n.id === 4)!;
    expect(grouped.eventIds).toEqual([4, 5]);
    // o protesto 120 dias depois é outra notícia
    expect(feed.items.find((n) => n.id === 6)!.eventIds).toEqual([6]);
  });

  it('causas, contexto e desdobramentos formam a cadeia guerra → sanções → protestos', () => {
    const feed = buildNews(chain.map((e) => entry(e)), 0, nameOf);
    const war = feed.items.find((n) => n.id === 1)!;
    const sanctions = feed.items.find((n) => n.id === 2)!;
    const strike = feed.items.find((n) => n.id === 3)!;
    const protest = feed.items.find((n) => n.id === 4)!;
    expect(sanctions.causeIds).toEqual([1]);
    expect(strike.contextIds).toEqual([1]);
    expect(strike.causeIds).toEqual([]);
    expect(protest.causeIds).toEqual([2]);
    expect(war.followUpIds.sort()).toEqual([2, 3]);
    expect(sanctions.followUpIds.sort()).toEqual([4, 6]);
    expect(feed.resolve(2)!.newsId).toBe(2);
    expect(feed.resolve(5)!.newsId).toBe(4);
  });

  it('evento que não chegou ao jogador não aparece nem é inventado na cadeia', () => {
    const feed = buildNews([entry({ id: 9, causeIds: [8], type: 'protest', day: 5, slot: 0, approval: 20, causes: [] })], 0, nameOf);
    expect(feed.items[0]!.causeIds).toEqual([8]);
    expect(feed.resolve(8)).toBeNull();
  });

  it('impacto usa os números do evento; escopo e tema alimentam os filtros', () => {
    const feed = buildNews(chain.map((e) => entry(e)), 0, nameOf);
    const strike = feed.items.find((n) => n.id === 3)!;
    expect(strike.impact).toContain('40 de dano');
    expect(strike.topic).toBe('militar');
    expect(strike.scope).toBe('nacional');
    const war = feed.items.find((n) => n.id === 1)!;
    expect(war.countries).toEqual([0, 1, 100]);
    expect(matchesFilter(war, 'militar')).toBe(true);
    expect(matchesFilter(war, 'economico')).toBe(false);
    // tratado entre outros países é internacional
    const foreign = buildNews([entry({ id: 1, type: 'diplomacy', day: 1, event: { id: 1, type: 'treaty_signed', day: 1, treaty: { id: 3, type: 'trade', a: 1, b: 100, startDay: 1, endDay: 361 } } })], 0, nameOf);
    expect(foreign.items[0]!.scope).toBe('internacional');
    expect(foreign.items[0]!.topic).toBe('diplomatico');
  });
});
