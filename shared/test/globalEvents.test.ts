import { describe, expect, it } from 'vitest';
import { GLOBAL_EVENT_TIMING, GLOBAL_EVENTS, globalFx, newGlobalEvents, stepGlobalEvents } from '../strategic/globalEvents.ts';
import { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { treasuryDay } from '../strategic/treasury.ts';

/** Eventos globais (23/11). */
describe('eventos globais', () => {
  it('desligados, nada acontece; ligados, o primeiro começa no dia marcado, dura e acaba', () => {
    const off = newGlobalEvents(false);
    for (let d = 0; d < 3000; d++) expect(stepGlobalEvents(off, d, () => 0.5)).toEqual({});
    const s = newGlobalEvents(true);
    let started: string | undefined;
    let day = 0;
    for (; day < 2000 && !started; day++) started = stepGlobalEvents(s, day, () => 0.1).started;
    expect(day - 1).toBe(GLOBAL_EVENT_TIMING.firstDay);
    expect(started).toBeDefined();
    const id = s.active!.id;
    let ended: string | undefined;
    for (; day < 4000 && !ended; day++) ended = stepGlobalEvents(s, day, () => 0.1).ended;
    expect(ended).toBe(id);
    expect(day - 1 - GLOBAL_EVENT_TIMING.firstDay).toBe(GLOBAL_EVENTS[id].days);
  });

  it('crise do petróleo dobra o preço do petróleo no caixa; inverno encarece a energia', () => {
    const base = { infantry: 0, vehicles: 0, aircraft: 0, energy: 10, buildingCells: 0, roads: 0, services: 0, production: { oil: 1 } };
    const ctx = { scale: 1, productivity: 0, tradeGrowthPct: 0 };
    const crisis = { on: true, active: { id: 'oil_crisis' as const, endDay: 999 }, nextDay: 0 };
    const winter = { on: true, active: { id: 'harsh_winter' as const, endDay: 999 }, nextDay: 0 };
    const p0 = treasuryDay(base, ctx).income.find((l) => l.key === 'production')!.usd;
    const p1 = treasuryDay(base, { ...ctx, priceMul: globalFx(crisis).priceMul }).income.find((l) => l.key === 'production')!.usd;
    expect(p1).toBe(p0 * 2);
    const e0 = treasuryDay(base, ctx).expense.find((l) => l.key === 'energy')!.usd;
    const e1 = treasuryDay(base, { ...ctx, energyMul: globalFx(winter).energyCostMul }).expense.find((l) => l.key === 'energy')!.usd;
    expect(e1).toBe(e0 * 1.5);
    expect(globalFx(winter).foodGatherMul).toBe(0.7);
    expect(globalFx(crisis).fuelMul).toBe(1.5);
  });

  it('a nação anuncia o evento a todos e o estado sobrevive ao salvamento', () => {
    const nat = new NationalSimulation(
      [
        { slot: 0, countryId: 'BRA' },
        { slot: 1, countryId: 'ARG' },
      ],
      3,
    );
    nat.globalEvents.on = true;
    for (let d = 0; d <= GLOBAL_EVENT_TIMING.firstDay; d++) nat.stepDay();
    const ev = nat.drainEvents().find((e) => e.type === 'global_event');
    expect(ev).toMatchObject({ type: 'global_event', phase: 'start' });
    expect(nat.eventsFor(1, [ev!])).toHaveLength(1);
    const copy = new NationalSimulation(
      [
        { slot: 0, countryId: 'BRA' },
        { slot: 1, countryId: 'ARG' },
      ],
      3,
    );
    copy.load(nat.toSave());
    expect(copy.globalEvents).toEqual(nat.globalEvents);
  });
});
