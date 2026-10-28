import { describe, expect, it } from 'vitest';
import { TICK_RATE, type BuildingType } from '../sim/config.ts';
import { Simulation, type NationalLink } from '../sim/Simulation.ts';
import { AIRCRAFT } from '../sim/air.ts';
import { TacticalAI } from '../sim/TacticalAI.ts';
import type { Building } from '../sim/types.ts';
import type { Difficulty } from '../sim/difficulty.ts';
import { flatMap } from './helpers.ts';

/** IA usando a força aérea e os mísseis (lote 1, §1.1 e §2.5), com as mesmas regras do jogador. */

function setup(difficulty: Difficulty, war = true) {
  const sim = new Simulation({ map: flatMap(36), playerCount: 2, startingUnits: [] });
  const link: NationalLink = {
    techs: () => ['guided_munitions', 'ballistic_missiles'],
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => 1e9,
    chargeWorks: () => true,
    refundWorks: () => {},
  };
  sim.national = link;
  sim.difficulty = difficulty;
  if (war) sim.setWar(0, 1, true);
  for (const p of sim.players) {
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 3000;
    p.oilReserve = 3000;
    p.recruits = 10;
  }
  const place = (slot: number, type: BuildingType, from: [number, number], to: [number, number]): Building => {
    for (let cy = from[1]; cy <= to[1]; cy++)
      for (let cx = from[0]; cx <= to[0]; cx++)
        if (sim.applyCommand(slot, { type: 'build', buildingType: type, cx, cy }) === null) return sim.buildings.find((b) => b.type === type && b.owner === slot && b.cell.cx === cx && b.cell.cy === cy)!;
    throw new Error(`sem lugar para ${type}`);
  };
  const base = place(1, 'airbase', [22, 20], [33, 30]);
  const silo = place(1, 'missile_silo', [22, 20], [33, 33]);
  const target = place(0, 'factory', [2, 8], [12, 14]);
  for (let i = 0; i < 40 * TICK_RATE; i++) sim.step();
  sim.air.known[1] = new Set([target.id]);
  const ai = new TacticalAI(1);
  const think = (seconds: number) => {
    const out: string[] = [];
    for (let t = 0; t < seconds; t++) {
      for (const c of ai.think(sim)) {
        if (sim.applyCommand(1, c) === null) out.push(c.type === 'air_mission' ? `air_mission:${c.mission}` : c.type);
      }
      for (let i = 0; i < TICK_RATE; i++) sim.step();
    }
    return out;
  };
  return { sim, base, silo, target, think };
}

describe('IA com força aérea e mísseis', () => {
  it('Difícil: monta aeronaves, faz reconhecimento, ataca o alvo descoberto e lança míssil', () => {
    const { sim, think } = setup('hard');
    const done = think(AIRCRAFT.fighter.buildSeconds * 3 + 30);
    expect(done).toContain('build_aircraft');
    expect(done).toContain('air_mission:recon');
    expect(done).toContain('air_mission:strike');
    expect(done).toContain('build_missile');
    expect(done).toContain('missile_prepare');
    expect(done).toContain('missile_authorize');
    expect(sim.players[1]!.stats.damageDealt).toBeGreaterThan(0);
  }, 30_000);

  it('Normal: aviões sim, mísseis não; Fácil: nenhum dos dois', () => {
    const normal = setup('normal').think(AIRCRAFT.fighter.buildSeconds * 2 + 10);
    expect(normal).toContain('build_aircraft');
    expect(normal).not.toContain('build_missile');
    const easy = setup('easy').think(40);
    expect(easy).not.toContain('build_aircraft');
  }, 30_000);

  it('sem guerra declarada não há ataque aéreo nem míssil (nem durante um incidente)', () => {
    const { sim, think } = setup('hard', false);
    sim.startIncident(1, 0, 600, null);
    const done = think(AIRCRAFT.fighter.buildSeconds * 2 + 20);
    expect(done).not.toContain('air_mission:strike');
    expect(done).not.toContain('missile_prepare');
  }, 30_000);
});
