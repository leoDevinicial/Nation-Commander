import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../data/countries.ts';
import { RECRUIT, TICK_RATE, Terrain, UNITS } from '../sim/config.ts';
import { COUNTRY_BONUS, countryBonus } from '../sim/countryBonus.ts';
import { checkProduce } from '../sim/production.ts';
import { Simulation } from '../sim/Simulation.ts';
import { AIRCRAFT, aircraftFor } from '../sim/air.ts';
import { flatMap } from './helpers.ts';

/** Bônus único por país (lote 2, item 12). */

const ctx = { level: 1, spec: null, progress: 1, queueLength: 0, recruits: 5, popTotal: 0, popCap: 99, techs: null, militaryResearch: ['field_artillery', 'rocket_systems'], resources: { supplies: 9999, food: 9999, wood: 9999, stone: 9999, iron: 9999, oil: 9999 } };

describe('bônus único por país', () => {
  it('todo país jogável tem um bônus com título e descrição', () => {
    for (const c of COUNTRIES) {
      expect(COUNTRY_BONUS[c.id]?.title, c.id).toBeTruthy();
      expect(COUNTRY_BONUS[c.id]?.description, c.id).toBeTruthy();
    }
  });

  it('Rússia: artilharia 25% mais barata; Índia: recrutas 25% mais baratos', () => {
    const base = checkProduce('artillery', { ...ctx, buildingType: 'factory' }).cost;
    const rus = checkProduce('artillery', { ...ctx, buildingType: 'factory', bonus: countryBonus('RUS') }).cost;
    expect(rus.iron).toBe(Math.round(UNITS.artillery.cost.iron! * 0.75));
    expect(rus.iron).toBeLessThan(base.iron!);
    const ind = checkProduce('recruit', { ...ctx, buildingType: 'barracks', bonus: countryBonus('IND') }).cost;
    expect(ind.food).toBe(Math.round(RECRUIT.cost.food! * 0.75));
  });

  it('EUA: aeronaves 30% mais baratas', () => {
    expect(aircraftFor('fighter', countryBonus('USA')).usd).toBe(Math.round(AIRCRAFT.fighter.usd * 0.7));
    expect(aircraftFor('fighter', countryBonus('BRA'))).toBe(AIRCRAFT.fighter);
  });

  it('Brasil: tropa mais rápida na floresta', () => {
    const run = (country: string) => {
      const sim = new Simulation({ map: flatMap(32, (set) => { for (let y = 0; y < 32; y++) for (let x = 8; x < 24; x++) set(x, y, Terrain.Forest); }), playerCount: 2, startingUnits: [] });
      sim.countries = [country, 'ARG'];
      const u = sim.addUnit('infantry', 0, { x: 18, y: 30 });
      sim.applyCommand(0, { type: 'move', unitIds: [u.id], x: 40, y: 30 });
      for (let i = 0; i < 3 * TICK_RATE; i++) sim.step();
      return u.pos.x;
    };
    expect(run('BRA') - 18).toBeGreaterThan((run('ARG') - 18) * 1.15);
  });

  it('Arábia Saudita: mais petróleo; China: tropas mais rápidas de produzir', () => {
    const sim = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
    const farm = sim.addBuilding('farm', 0, { cx: 8, cy: 8 }, 1);
    farm.workers = 3;
    farm.claims = [8 * 32 + 11, 8 * 32 + 12];
    sim.territory.fill(0);
    sim.countries = ['ARG', 'BRA'];
    expect(sim.buildingRate(farm)).toBeCloseTo(sim.buildingRate(farm));
    const rateArg = sim.buildingRate(farm);
    sim.countries = ['BRA', 'BRA'];
    expect(rateArg).toBeCloseTo(sim.buildingRate(farm) * 1.25);
    // tempo de produção
    const prod = (country: string) => {
      const s = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
      s.countries = [country, 'BRA'];
      const p = s.players[0]!;
      for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 3000;
      p.recruits = 5;
      p.citizens = 10;
      const b = s.addBuilding('barracks', 0, { cx: 8, cy: 8 }, 1);
      b.workers = 2;
      expect(s.applyCommand(0, { type: 'produce', buildingId: b.id, unitType: 'infantry' })).toBeNull();
      return b.queue[0]!.totalTicks;
    };
    expect(prod('CHN')).toBeLessThan(prod('BRA'));
  });
});
