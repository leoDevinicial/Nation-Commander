/**
 * Escala da simulação (10/11): mede o custo do tick com muitas unidades em combate e tira a "impressão digital" de
 * partidas fixas, para provar que uma otimização não mudou o resultado (a simulação é determinística).
 *
 *   npx tsx scripts/sim-escala.ts bench            # 250, 500, 1000 e 2000 unidades em combate: ms por tick
 *   npx tsx scripts/sim-escala.ts seis             # 6 nações × 600 tropas: paradas nas bases e em três frentes
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

/** 6 nações com `per` tropas cada em volta do QG (mapa de 6 nações, todos em guerra). */
function sixNations(per: number): { sim: Simulation; armies: number[][] } {
  const sim = new Simulation({ map: generateMatchMap(5, { nations: 6 }), playerCount: 6, allAtWar: true });
  const kinds: UnitType[] = ['infantry', 'infantry', 'infantry', 'tank', 'apc', 'artillery', 'at_infantry', 'mobile_aa'];
  const g = sim.grid;
  const armies: number[][] = [];
  for (let s = 0; s < 6; s++) {
    const hq = sim.hqOf(s)!;
    const ids: number[] = [];
    for (let r = 4; ids.length < per && r < 40; r++)
      for (let dy = -r; dy <= r && ids.length < per; dy++)
        for (let dx = -r; dx <= r && ids.length < per; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = hq.cell.cx + dx;
          const cy = hq.cell.cy + dy;
          if (!g.isPassable(cx, cy) || g.occupant(cx, cy) !== 0) continue;
          ids.push(sim.addUnit(kinds[ids.length % kinds.length]!, s, g.cellCenter({ cx, cy })).id);
        }
    armies.push(ids);
  }
  return { sim, armies };
}

/** Três guerras ao mesmo tempo (0×1, 2×3, 4×5): metade de cada exército ataca o QG do vizinho. */
function threeFronts(sim: Simulation, armies: number[][]): void {
  for (const [a, b] of [
    [0, 1],
    [2, 3],
    [4, 5],
  ] as const) {
    const ha = sim.hqOf(a)!.pos;
    const hb = sim.hqOf(b)!.pos;
    sim.applyCommand(a, { type: 'attack_move', unitIds: armies[a]!.slice(0, armies[a]!.length / 2), x: hb.x, y: hb.y });
    sim.applyCommand(b, { type: 'attack_move', unitIds: armies[b]!.slice(0, armies[b]!.length / 2), x: ha.x, y: ha.y });
  }
}

function timeTicks(sim: Simulation, ticks: number): string {
  const times: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const t = performance.now();
    sim.step();
    times.push(performance.now() - t);
  }
  times.sort((x, y) => x - y);
  return `média ${(times.reduce((s, x) => s + x, 0) / times.length).toFixed(1)} ms, p95 ${times[Math.floor(times.length * 0.95)]!.toFixed(1)} ms`;
}

const hash = (sim: Simulation) => createHash('sha256').update(sim.serialize()).digest('hex').slice(0, 16);

if (mode === 'seis') {
  const { sim, armies } = sixNations(600);
  for (let i = 0; i < 20; i++) sim.step();
  console.log(`6 nações × 600 (${sim.units.length} tropas), paradas nas bases: ${timeTicks(sim, 200)}`);
  threeFronts(sim, armies);
  console.log(`três frentes de batalha (metade de cada exército atacando): ${timeTicks(sim, 600)}`);
} else if (mode === 'bench') {
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
  {
    // 6 nações × 150 tropas, três frentes: grade por nação e separação por terra/água
    const { sim, armies } = sixNations(150);
    for (let i = 0; i < 10 * TICK_RATE; i++) sim.step();
    threeFronts(sim, armies);
    for (let i = 0; i < 60 * TICK_RATE; i++) sim.step();
    console.log(`6 nações × 150, três frentes: ${hash(sim)} (vivas ${sim.units.length})`);
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
