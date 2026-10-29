/**
 * Simulação de economia (docs/RECALIBRAGEM_RECURSOS.md, seção 5): duas IAs táticas no mapa das partidas, sem camada
 * nacional e com logística externa fixa de 1,5 suprimento/s. Mede quanto tempo cada recurso fica escasso (< 40) ou com
 * o armazém quase cheio (≥ 95%), quando a IA pesquisa e se ela trava (sem coleta nova nem cidadão novo empregado).
 *
 *   npx tsx scripts/sim-economia.ts 7 25          # seed 7, 25 minutos, relatório detalhado
 *   npx tsx scripts/sim-economia.ts 1,2,3,4,5 25  # várias seeds, uma tabela de critérios
 */
import { Simulation } from '../shared/sim/Simulation.ts';
import { generateMatchMap } from '../shared/sim/matchMap.ts';
import { TacticalAI } from '../shared/sim/TacticalAI.ts';
import { BUILDINGS, RESOURCE_TYPES, TICK_RATE, type ResourceType } from '../shared/sim/config.ts';

const seeds = (process.argv[2] ?? '7').split(',').map(Number);
const minutes = Number(process.argv[3] ?? 25);
const verbose = seeds.length === 1;
const fmt = (t: number) => `${Math.floor(t / (60 * TICK_RATE))}:${String(Math.floor((t % (60 * TICK_RATE)) / TICK_RATE)).padStart(2, '0')}`;
const GATHER = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k as keyof typeof BUILDINGS].gather) as string[];

interface Result {
  seed: number;
  low: Record<ResourceType, number>[];
  full: Record<ResourceType, number>[];
  lowEarly: boolean[];
  firstResearch: (number | null)[];
  maxStall: number[];
  war: number | null;
  winner: number | null;
  armies: number[];
}

function run(seed: number): Result {
  const sim = new Simulation({ map: generateMatchMap(seed, { nations: 2 }), playerCount: 2 });
  sim.eras = true;
  for (const s of [0, 1]) sim.setModifiers(s, { externalIncome: 1.5 });
  const ais = [new TacticalAI(0), new TacticalAI(1)];
  const zero = () => Object.fromEntries(RESOURCE_TYPES.map((r) => [r, 0])) as Record<ResourceType, number>;
  const low = [zero(), zero()];
  const full = [zero(), zero()];
  const lowEarly = [false, false];
  const firstResearch: (number | null)[] = [null, null];
  // trava: tempo sem coleta nova e sem cidadão novo empregado, antes dos 15 min. Com até 6 trabalhadores por
  // coleta, a economia cresce também enchendo os postos das coletas que já existem
  const lastGrowth = [0, 0];
  const maxStall = [0, 0];
  const gatherCount = [0, 0];
  const employedMax = [0, 0];
  let samples = 0;
  let war: number | null = null;
  const end = minutes * 60 * TICK_RATE;
  for (let t = 0; t < end && !sim.ended; t++) {
    if (t % TICK_RATE === 0)
      for (const ai of ais) {
        for (const c of ai.think(sim)) sim.applyCommand(ai.slot, c);
        if (ai.wantsWarWith !== null && war === null) {
          sim.setWar(ai.slot, ai.wantsWarWith, true);
          war = t;
        }
      }
    sim.step();
    sim.drainEvents();
    if (t % TICK_RATE !== 0) continue;
    samples++;
    for (const s of [0, 1]) {
      const p = sim.players[s]!;
      const cap = sim.capacity(s);
      for (const r of RESOURCE_TYPES) {
        if (p.resources[r] < 40) low[s]![r]++;
        if (cap[r] > 0 && p.resources[r] >= cap[r] * 0.95) full[s]![r]++;
        if (t < 8 * 60 * TICK_RATE && p.resources[r] < 40 && (r === 'food' || r === 'wood' || r === 'supplies')) lowEarly[s] = true;
      }
      if (firstResearch[s] === null && ((p.militaryResearch ?? []).length > 0 || sim.buildings.some((b) => b.owner === s && b.research))) firstResearch[s] = t;
      const g = sim.buildings.filter((b) => b.owner === s && GATHER.includes(b.type)).length;
      const employed = sim.population(s).employed;
      if (g > gatherCount[s]! || employed > employedMax[s]!) {
        gatherCount[s] = Math.max(g, gatherCount[s]!);
        employedMax[s] = Math.max(employed, employedMax[s]!);
        lastGrowth[s] = t;
      }
      if (t < 15 * 60 * TICK_RATE) maxStall[s] = Math.max(maxStall[s]!, t - lastGrowth[s]!);
    }
    if (verbose && (t + TICK_RATE) % (150 * TICK_RATE) === 0) {
      const s = 0;
      const p = sim.players[s]!;
      const inc = sim.incomePerSecond(s);
      const pop = sim.population(s);
      const bs = sim.buildings.filter((b) => b.owner === s && b.progress >= 1);
      const g = (k: string) => bs.filter((b) => b.type === k).length;
      console.log(
        `${fmt(t + TICK_RATE)} P${s} | estoque ${RESOURCE_TYPES.map((r) => `${r.slice(0, 3)} ${Math.round(p.resources[r])}`).join(', ')} | renda/s ${RESOURCE_TYPES.map((r) => inc[r].toFixed(1)).join('/')} | pop ${pop.total}/${pop.cap} exército ${sim.units.filter((u) => u.owner === s).length} | QG nv${bs.find((b) => b.type === 'hq')?.level ?? '-'} era ${p.era ?? 1} | faz ${g('farm')} serr ${g('sawmill')} pedr ${g('quarry')} mina ${g('mine')} poço ${g('oil_well')} | pesq ${(p.militaryResearch ?? []).length}`,
      );
    }
  }
  const pct = (o: Record<ResourceType, number>) => Object.fromEntries(RESOURCE_TYPES.map((r) => [r, Math.round((100 * o[r]) / samples)])) as Record<ResourceType, number>;
  return {
    seed,
    low: low.map(pct),
    full: full.map(pct),
    lowEarly,
    firstResearch,
    maxStall,
    war,
    winner: sim.ended ? (sim.winner ?? null) : null,
    armies: [0, 1].map((s) => sim.units.filter((u) => u.owner === s).length),
  };
}

const results = seeds.map(run);
for (const r of results) {
  const short = (o: Record<ResourceType, number>) => RESOURCE_TYPES.map((k) => `${k.slice(0, 3)} ${o[k]}`).join(' ');
  console.log(
    `seed ${r.seed} | guerra ${r.war === null ? 'não' : fmt(r.war)} | fim ${r.winner === null ? 'em andamento' : `vitória P${r.winner}`} | exércitos ${r.armies.join(' x ')}`,
  );
  for (const s of [0, 1])
    console.log(
      `  P${s} estoque<40 %: ${short(r.low[s]!)} | armazém≥95% %: ${short(r.full[s]!)} | escassez antes de 8 min: ${r.lowEarly[s] ? 'sim' : 'não'} | 1ª pesquisa ${r.firstResearch[s] === null ? 'nunca' : fmt(r.firstResearch[s]!)} | maior pausa sem coleta nova nem cidadão novo empregado (até 15 min) ${fmt(r.maxStall[s]!)}`,
    );
}
// critérios da seção 5
const all = results.flatMap((r) => [0, 1].map((s) => ({ r, s })));
const check = (label: string, ok: boolean) => console.log(`${ok ? '✓' : '✗'} ${label}`);
check(
  'comida, madeira e suprimentos com armazém ≥ 95% abaixo de 20% do tempo',
  all.every(({ r, s }) => (['food', 'wood', 'supplies'] as const).every((k) => r.full[s]![k] < 20)),
);
check(
  'algum recurso abaixo de 40 nos primeiros 8 minutos',
  all.every(({ r, s }) => r.lowEarly[s]),
);
check(
  'nenhum recurso abaixo de 40 por mais de 60% do tempo',
  all.every(({ r, s }) => RESOURCE_TYPES.every((k) => r.low[s]![k] <= 60)),
);
check(
  'IA nunca travada (sem coleta nova nem cidadão novo empregado por mais de 5 min antes dos 15:00)',
  all.every(({ r, s }) => r.maxStall[s]! <= 5 * 60 * TICK_RATE),
);
check(
  'primeira pesquisa militar antes dos 12:00',
  all.every(({ r, s }) => r.firstResearch[s] !== null && r.firstResearch[s]! < 12 * 60 * TICK_RATE),
);
check('menos da metade das partidas decididas antes dos 25:00', results.filter((r) => r.winner !== null).length < results.length / 2);
