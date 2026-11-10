/**
 * Escala da simulação (10/11): mede o custo do tick com muitas unidades em combate e tira a "impressão digital" de
 * partidas fixas, para provar que uma otimização não mudou o resultado (a simulação é determinística).
 *
 *   npx tsx scripts/sim-escala.ts bench            # 250, 500, 1000 e 2000 unidades em combate: ms por tick
 *   npx tsx scripts/sim-escala.ts hash             # hash do estado final de partidas fixas (IA × IA e batalhas)
 *
 * Compare a saída de `hash` antes e depois da mudança: tem que ser idêntica.
 */
import { createHash } from 'node:crypto';
import { Simulation } from '../shared/sim/Simulation.ts';
import { generateMatchMap } from '../shared/sim/matchMap.ts';
import { TacticalAI } from '../shared/sim/TacticalAI.ts';
import { TICK_RATE, Terrain, type UnitType } from '../shared/sim/config.ts';
import { flatMap, TEST_START } from '../shared/test/helpers.ts';

const mode = process.argv[2] ?? 'bench';

/** Dois exércitos em linha, um contra o outro, com tanques, artilharia e (opcional) navios num canal no meio. */
function battle(n: number, navy: boolean): Simulation {
  const map = flatMap(160, (set) => {
    if (navy) for (let y = 0; y < 160; y++) for (let x = 70; x < 90; x++) if (y > 90) set(x, y, Terrain.Water);
  });
  const sim = new Simulation({ map, playerCount: 2, startingUnits: [], allAtWar: true, startingResources: TEST_START });
  const cs = sim.map.cellSize;
  const kinds: UnitType[] = ['infantry', 'infantry', 'tank', 'infantry', 'artillery', 'apc'];
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < n / 2; i++) {
    const k = kinds[i % kinds.length]!;
    a.push(sim.addUnit(k, 0, { x: (20 + (i % 25) * 1.2) * cs, y: (30 + Math.floor(i / 25) * 1.2) * cs }).id);
    b.push(sim.addUnit(k, 1, { x: (110 + (i % 25) * 1.2) * cs, y: (30 + Math.floor(i / 25) * 1.2) * cs }).id);
  }
  if (navy)
    for (let i = 0; i < 12; i++) {
      sim.addUnit('frigate', i % 2, { x: (72 + (i % 6) * 2.5) * cs, y: (100 + Math.floor(i / 6) * 30) * cs });
      sim.addUnit('fishing_boat', i % 2, { x: (75 + (i % 6) * 2) * cs, y: (120 + Math.floor(i / 6) * 10) * cs });
    }
  sim.applyCommand(0, { type: 'attack_move', unitIds: a, x: 125 * cs, y: 50 * cs });
  sim.applyCommand(1, { type: 'attack_move', unitIds: b, x: 30 * cs, y: 50 * cs });
  return sim;
}

const hash = (sim: Simulation) => createHash('sha256').update(sim.serialize()).digest('hex').slice(0, 16);

if (mode === 'bench') {
  for (const n of [250, 500, 1000, 2000]) {
    const sim = battle(n, false);
    for (let i = 0; i < 20; i++) sim.step();
    const times: number[] = [];
    for (let i = 0; i < 300; i++) {
      const t = performance.now();
      sim.step();
      times.push(performance.now() - t);
    }
    times.sort((x, y) => x - y);
    const avg = times.reduce((s, x) => s + x, 0) / times.length;
    console.log(`${String(n).padStart(4)} unidades: média ${avg.toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)]!.toFixed(2)} ms (orçamento ${1000 / TICK_RATE} ms)`);
  }
} else {
  for (const [n, navy] of [
    [300, false],
    [600, true],
  ] as const) {
    const sim = battle(n, navy);
    for (let i = 0; i < 90 * TICK_RATE; i++) sim.step();
    console.log(`batalha ${n}${navy ? ' + marinha' : ''}: ${hash(sim)} (vivas ${sim.units.length})`);
  }
  for (const [seed, nations] of [
    [3, 2],
    [5, 4],
  ] as const) {
    const sim = new Simulation({ map: generateMatchMap(seed, { nations }), playerCount: nations, allAtWar: true });
    const ais = Array.from({ length: nations }, (_, s) => new TacticalAI(s));
    for (let t = 0; t < 12 * 60 * TICK_RATE && !sim.ended; t++) {
      if (t % TICK_RATE === 0) for (const ai of ais) for (const c of ai.think(sim)) sim.applyCommand(ai.slot, c);
      sim.step();
    }
    console.log(`IA × IA seed ${seed}, ${nations} nações, 12 min: ${hash(sim)} (unidades ${sim.units.length}, prédios ${sim.buildings.length})`);
  }
}
