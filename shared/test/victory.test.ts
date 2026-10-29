import { describe, expect, it } from 'vitest';
import { TICK_RATE, VICTORY } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { makeSnapshot } from '../sim/snapshot.ts';
import { flatMap } from './helpers.ts';

/** Vitórias alternativas (lote 2, item 15): territorial e política. */

function setup() {
  const sim = new Simulation({ map: flatMap(40), playerCount: 2, startingUnits: [] });
  const kinds: string[] = [];
  const run = (s: number) => {
    for (let i = 0; i < s * TICK_RATE && !sim.ended; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'victory_progress') kinds.push(`${e.kind}:${e.slot}:${e.state}`);
    }
  };
  return { sim, run, kinds };
}

describe('Vitória territorial', () => {
  it(`quem controla ${VICTORY.territoryShare * 100}% do território por ${VICTORY.territorySeconds} s vence`, () => {
    const { sim, run, kinds } = setup();
    const hq0 = sim.hqOf(0)!;
    run(1);
    expect(sim.territoryHold[0] ?? 0).toBe(0);
    // o território é recalculado pelas construções: a cada segundo, o jogador 0 fica com quase tudo
    const fill = () => {
      for (let i = 0; i < sim.territory.length; i++) sim.territory[i] = i === 0 ? 1 : 0;
    };
    for (let s = 0; s < VICTORY.territorySeconds + 2 && !sim.ended; s++) {
      fill();
      run(1);
    }
    expect(kinds[0]).toBe('territory:0:started');
    expect(sim.ended).toBe(true);
    expect(sim.winner).toBe(0);
    expect(sim.victory).toBe('territory');
    expect(hq0.hp).toBeGreaterThan(0);
  });

  it('perder o domínio zera a contagem; o HUD recebe o progresso', () => {
    const { sim, run, kinds } = setup();
    for (let s = 0; s < 30; s++) {
      for (let i = 0; i < sim.territory.length; i++) sim.territory[i] = i === 0 ? 1 : 0;
      run(1);
    }
    const v = makeSnapshot(sim, []).victory;
    expect(v?.[0]?.kind).toBe('territory');
    expect(v![0]!.progress).toBeGreaterThan(0.05);
    for (let i = 0; i < sim.territory.length; i++) sim.territory[i] = i % 2;
    run(1);
    expect(sim.territoryHold[0]).toBe(0);
    expect(kinds).toContain('territory:0:lost');
    const copy = Simulation.fromSave(sim.toSave());
    expect(copy.victory).toBeNull();
  });
});

describe('Vitória política', () => {
  it(`estabilidade abaixo de ${VICTORY.politicalStability} por ${VICTORY.politicalDays} dias derruba o governo`, () => {
    const { sim } = setup();
    for (let d = 0; d < VICTORY.politicalDays - 1; d++) sim.politicalPressure(1, 4);
    expect(sim.ended).toBe(false);
    expect(sim.collapseDays[1]).toBe(VICTORY.politicalDays - 1);
    // a crise contida zera a contagem
    sim.politicalPressure(1, 40);
    expect(sim.collapseDays[1]).toBe(0);
    for (let d = 0; d < VICTORY.politicalDays; d++) sim.politicalPressure(1, 4);
    expect(sim.ended).toBe(true);
    expect(sim.winner).toBe(0);
    expect(sim.victory).toBe('political');
    expect(sim.players[1]!.defeated).toBe(true);
  });

  it('Sandbox não tem vitórias alternativas', () => {
    const { sim } = setup();
    sim.sandbox = { slots: [0], instant: false, aiActive: false, reveal: false } as never;
    for (let d = 0; d < VICTORY.politicalDays + 5; d++) sim.politicalPressure(1, 0);
    expect(sim.ended).toBe(false);
  });
});
