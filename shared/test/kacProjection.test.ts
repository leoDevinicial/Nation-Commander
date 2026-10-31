import { describe, expect, it } from 'vitest';
import { UNITS } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { FogMemory, makeSnapshot } from '../sim/snapshot.ts';
import { TEST_START, flatMap } from './helpers.ts';

/**
 * KAC — confidencialidade do snapshot: o que um jogador recebe não pode citar o que ele não enxerga (ver
 * `docs/kac/KAC_THREAT_MODEL.md`). Os testes de voo (KAC-12) ficam em `air.test.ts`, junto com a montagem da base.
 */
describe('KAC-07 — alvo de uma unidade alheia', () => {
  function threeNations() {
    const map = flatMap(64);
    map.spawns.push({ cx: 3, cy: 60 });
    const sim = new Simulation({ map, playerCount: 3, startingUnits: [], allAtWar: true, startingResources: TEST_START });
    // o tanque do jogador 1 mira a infantaria do jogador 2; o batedor do jogador 0 vê o tanque, mas não o alvo
    const tank = sim.addUnit('tank', 1, { x: 64, y: 30 });
    const target = sim.addUnit('infantry', 2, { x: 64 + UNITS.tank.sight - 2, y: 30 });
    const scout = sim.addUnit('infantry', 0, { x: 64 - (UNITS.infantry.sight - 3), y: 30 });
    sim.step();
    expect(sim.applyCommand(1, { type: 'attack', unitIds: [tank.id], targetId: target.id })).toBeNull();
    sim.step();
    return { sim, tank, target, scout };
  }

  it('ataque: o observador não descobre pelo targetId uma unidade que ele não vê', () => {
    const { sim, tank, target } = threeNations();
    expect(sim.canSee(0, tank)).toBe(true);
    expect(sim.canSee(0, target)).toBe(false);
    const seen = makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() });
    expect(seen.units.find((u) => u.id === tank.id)?.targetId).toBeNull();
    expect(JSON.stringify(seen)).not.toContain(`"targetId":${target.id}`);
  });

  it('o dono continua vendo o alvo dele, e o observador passa a ver quando enxerga os dois', () => {
    const { sim, tank, target, scout } = threeNations();
    expect(makeSnapshot(sim, [], { slot: 1, memory: new FogMemory() }).units.find((u) => u.id === tank.id)?.targetId).toBe(target.id);
    scout.pos = { x: 64 + UNITS.tank.sight / 2 - 1, y: 33 };
    sim.step();
    expect(sim.canSee(0, target)).toBe(true);
    expect(makeSnapshot(sim, [], { slot: 0, memory: new FogMemory() }).units.find((u) => u.id === tank.id)?.targetId).toBe(target.id);
  });
});
