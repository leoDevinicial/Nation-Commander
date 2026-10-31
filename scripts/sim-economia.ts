/**
 * Simulação de economia e ritmo (docs/RECALIBRAGEM_RECURSOS.md, seção 5): duas IAs táticas no mapa das partidas, com a
 * camada nacional ligada como no servidor (orçamento, pesquisa nacional, verba de obras, governo da IA a cada 30 dias e
 * guerra declarada pela diplomacia). Mede quanto tempo cada recurso fica escasso (< 40) ou com o armazém quase cheio
 * (≥ 95%), quando a IA pesquisa e se ela trava (sem coleta nova nem cidadão novo empregado), e o ritmo da IA: primeira
 * ofensiva, era 3 e tamanho do exército.
 *
 *   npx tsx scripts/sim-economia.ts 7 25                      # seed 7, 25 minutos, relatório detalhado (Normal)
 *   npx tsx scripts/sim-economia.ts 1,2,3,4,5 25              # várias seeds, uma tabela de critérios
 *   npx tsx scripts/sim-economia.ts 1,2,3 25 easy,hard,brutal # outras dificuldades (só os critérios de ritmo)
 */
import { Simulation } from '../shared/sim/Simulation.ts';
import { generateMatchMap } from '../shared/sim/matchMap.ts';
import { AI_HARASS_SECONDS, TacticalAI } from '../shared/sim/TacticalAI.ts';
import { BUILDINGS, RESOURCE_TYPES, TICK_RATE, type ResourceType } from '../shared/sim/config.ts';
import { DIFFICULTY, isDifficulty, type Difficulty } from '../shared/sim/difficulty.ts';
import { NationalSimulation } from '../shared/strategic/NationalSimulation.ts';
import { NationalAI } from '../shared/strategic/NationalAI.ts';
import { policyEffects } from '../shared/strategic/policies.ts';
import { TICKS_PER_DAY, militaryResearchSpeed } from '../shared/strategic/params.ts';
import { theaterStats } from '../server/Room.ts';

const seeds = (process.argv[2] ?? '7').split(',').map(Number);
const minutes = Number(process.argv[3] ?? 25);
const difficulties = (process.argv[4] ?? 'normal').split(',').filter(isDifficulty);
const verbose = seeds.length === 1 && difficulties.length === 1;
const MIN = 60 * TICK_RATE;
const fmt = (t: number) => `${Math.floor(t / MIN)}:${String(Math.floor((t % MIN) / TICK_RATE)).padStart(2, '0')}`;
const GATHER = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k as keyof typeof BUILDINGS].gather) as string[];

/**
 * Ritmo esperado da IA por dificuldade: primeira ofensiva da partida (min, com 1 min de folga antes e 2 depois), era 3
 * até (min) e tropas formadas até os 15 min (as duas IAs brigam entre si: o exército vivo aos 15 min depende das
 * baixas, as tropas formadas medem a produção).
 */
const PACE: Record<Difficulty, { firstAttack: number; era3: number; trained15: number }> = {
  easy: { firstAttack: 14, era3: 24, trained15: 6 },
  normal: { firstAttack: 10, era3: 22, trained15: 10 },
  hard: { firstAttack: 8, era3: 23, trained15: 11 },
  brutal: { firstAttack: 6, era3: 20, trained15: 11 },
};

interface Result {
  seed: number;
  difficulty: Difficulty;
  low: Record<ResourceType, number>[];
  full: Record<ResourceType, number>[];
  lowEarly: boolean[];
  firstResearch: (number | null)[];
  maxStall: number[];
  firstAttack: (number | null)[];
  waves: number[];
  era2: (number | null)[];
  era3: (number | null)[];
  hqMax: number[];
  army10: number[];
  army15: number[];
  trained: number[];
  lost: number[];
  war: number | null;
  winner: number | null;
  end: number;
  armies: number[];
}

function run(seed: number, difficulty: Difficulty): Result {
  const sim = new Simulation({ map: generateMatchMap(seed, { nations: 2 }), playerCount: 2 });
  sim.difficulty = difficulty;
  sim.eras = true;
  // camada nacional ligada como em server/Room.ts (wire, advanceNational e applyNationalModifiers)
  const national = new NationalSimulation(
    [
      { slot: 0, countryId: 'BRA' },
      { slot: 1, countryId: 'ARG' },
    ],
    seed,
    'parity',
  );
  national.attachTheater({
    resources: (s) => sim.players[s]?.resources ?? null,
    spend: (s, c) => void sim.spendResources(s, c),
    setWar: (a, b) => sim.setWar(a, b, true),
    stats: (s) => theaterStats(sim, s),
    grant: (s, c) => sim.grantResources(s, c),
  });
  sim.national = {
    techs: (s) => national.nation(s)?.research.done ?? [],
    infrastructureIndex: (s) => national.nation(s)?.infrastructureIndex ?? 1,
    stability: (s) => national.nation(s)?.stability ?? 0,
    worksFundUsd: (s) => national.nation(s)?.works.fundUsd ?? 0,
    chargeWorks: (s, usd, d) => national.chargeWorks(s, usd, d),
    refundWorks: (s, usd, d) => national.refundWorks(s, usd, d),
    researchSpeed: (s) => militaryResearchSpeed(national.nation(s)?.budget.researchPct ?? 0),
    worksCapUsd: (s) => national.nation(s)?.works.capUsd ?? 0,
  };
  const applyModifiers = () => {
    for (const n of national.nations) {
      const fx = national.effects(n.slot);
      const pol = policyEffects(n.policies);
      const shock = national.shockTheaterMul();
      sim.setModifiers(n.slot, {
        constructionTimeMul: fx.constructionTimeMul,
        productionTimeMul: fx.productionTimeMul * pol.productionTimeMul,
        recruitCostMul: pol.recruitCostMul,
        foodUpkeepMul: pol.foodUpkeepMul,
        externalIncome: n.theaterSupplyPerSec * shock,
        territoryMul: fx.territoryMul,
        gatherMul: (1 + DIFFICULTY[difficulty].gatherBonus) * pol.gatherMul * shock,
      });
    }
  };
  applyModifiers();
  const ais = [new TacticalAI(0), new TacticalAI(1)];
  const nais = [new NationalAI(0, DIFFICULTY[difficulty].missiles, DIFFICULTY[difficulty].defenseBudgetMul), new NationalAI(1, DIFFICULTY[difficulty].missiles, DIFFICULTY[difficulty].defenseBudgetMul)];
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
  const firstAttack: (number | null)[] = [null, null];
  const lastWave: (number | null)[] = [null, null];
  const waves = [0, 0];
  const era2: (number | null)[] = [null, null];
  const era3: (number | null)[] = [null, null];
  const hqMax = [1, 1];
  const army10 = [0, 0];
  const army15 = [0, 0];
  const trained = [0, 0];
  const lost = [0, 0];
  let samples = 0;
  let war: number | null = null;
  const end = minutes * MIN;
  let t = 0;
  for (; t < end && !sim.ended; t++) {
    if (t % TICK_RATE === 0)
      for (const ai of ais) {
        const cmds = ai.think(sim);
        if (ai.wantsIncident) {
          sim.startIncident(ai.slot, ai.wantsIncident.victim, AI_HARASS_SECONDS, ai.wantsIncident.pos);
          ai.wantsIncident = null;
        }
        for (const c of cmds) sim.applyCommand(ai.slot, c);
        if (ai.wantsWarWith !== null && national.diplomaticAction(ai.slot, { type: 'declare_war', target: ai.wantsWarWith })) ai.wantsWarWith = null;
        if (war === null && sim.formalWar(0, 1)) war = t;
        const w = ai.toSave().lastWaveTick;
        if (w !== null && w !== lastWave[ai.slot]) {
          lastWave[ai.slot] = w;
          waves[ai.slot]!++;
          firstAttack[ai.slot] ??= w;
        }
      }
    sim.step();
    // POWER_LOG=1: rede elétrica de cada IA a cada minuto (diagnóstico)
    if (process.env.POWER_LOG && t % MIN === 0)
      for (const s of [0, 1]) {
        const p = sim.powerInfo[s];
        const plants = sim.buildings.filter((b) => b.owner === s && ['coal_plant', 'wind_farm', 'solar_farm'].includes(b.type)).length;
        const dark = sim.buildings.filter((b) => b.owner === s && b.progress >= 1 && !sim.isPowered(b)).map((b) => b.type);
        console.log(`${t / MIN}min P${s} oferta ${p?.supply} demanda ${p?.demand} apagados ${dark.join(',') || '-'} isolados ${p?.isolated} usinas ${plants} carvão ${Math.round(sim.players[s]!.resources.coal)}`);
      }
    const events = sim.drainEvents();
    if (t < 15 * MIN) for (const e of events) if (e.type === 'unit_produced') trained[e.owner]!++;
    if (t < 15 * MIN) for (const e of events) if (e.type === 'destroyed' && e.entity === 'unit') lost[e.owner]!++;
    national.registerTacticalEvents(events);
    if (sim.tick % TICKS_PER_DAY === 0) {
      if (national.day % 30 === 0)
        for (const nai of nais) {
          const r = nai.think(national);
          if (r.budget) national.setBudget(nai.slot, r.budget);
          for (const d of r.decrees) national.setDecree(nai.slot, d.id, d.active);
          if (r.research !== undefined) national.setResearch(nai.slot, r.research);
          for (const action of r.diplomacy) national.diplomaticAction(nai.slot, action);
        }
      national.stepDay();
      for (const s of [0, 1]) sim.politicalPressure(s, national.nation(s)?.stability ?? 0);
      applyModifiers();
    }
    if (t % TICK_RATE !== 0) continue;
    samples++;
    for (const s of [0, 1]) {
      const p = sim.players[s]!;
      const cap = sim.capacity(s);
      for (const r of RESOURCE_TYPES) {
        if (p.resources[r] < 40) low[s]![r]++;
        if (cap[r] > 0 && p.resources[r] >= cap[r] * 0.95) full[s]![r]++;
        if (t < 8 * MIN && p.resources[r] < 40 && (r === 'food' || r === 'wood' || r === 'supplies')) lowEarly[s] = true;
      }
      if (firstResearch[s] === null && ((p.militaryResearch ?? []).length > 0 || sim.buildings.some((b) => b.owner === s && b.research))) firstResearch[s] = t;
      const g = sim.buildings.filter((b) => b.owner === s && GATHER.includes(b.type)).length;
      const employed = sim.population(s).employed;
      if (g > gatherCount[s]! || employed > employedMax[s]!) {
        gatherCount[s] = Math.max(g, gatherCount[s]!);
        employedMax[s] = Math.max(employed, employedMax[s]!);
        lastGrowth[s] = t;
      }
      if (t < 15 * MIN) maxStall[s] = Math.max(maxStall[s]!, t - lastGrowth[s]!);
      if ((p.era ?? 1) >= 2) era2[s] ??= t;
      if ((p.era ?? 1) >= 3) era3[s] ??= t;
      hqMax[s] = Math.max(hqMax[s]!, sim.hqLevel(s));
      const army = sim.units.filter((u) => u.owner === s).length;
      if (t === 10 * MIN) army10[s] = army;
      if (t === 15 * MIN) army15[s] = army;
    }
    if (verbose && (t + TICK_RATE) % (150 * TICK_RATE) === 0) {
      const s = 0;
      const p = sim.players[s]!;
      const inc = sim.incomePerSecond(s);
      const pop = sim.population(s);
      const bs = sim.buildings.filter((b) => b.owner === s && b.progress >= 1);
      const g = (k: string) => bs.filter((b) => b.type === k).length;
      console.log(
        `${fmt(t + TICK_RATE)} P${s} | estoque ${RESOURCE_TYPES.map((r) => `${r.slice(0, 3)} ${Math.round(p.resources[r])}`).join(', ')} | renda/s ${RESOURCE_TYPES.map((r) => inc[r].toFixed(1)).join('/')} | pop ${pop.total}/${pop.cap} exército ${sim.units.filter((u) => u.owner === s).length} | QG nv${bs.find((b) => b.type === 'hq')?.level ?? '-'} era ${p.era ?? 1} | faz ${g('farm')} serr ${g('sawmill')} pedr ${g('quarry')} mina ${g('mine')} poço ${g('oil_well')} | pesq ${(p.militaryResearch ?? []).length} | nac ${(national.nation(s)?.research.done ?? []).length} | QG→ ${(() => { const hq = sim.hqOf(s); if (!hq) return '-'; const up = sim.upgradePlan(hq); return hq.upgrade ? 'em obra' : (up.blocker ?? `pronto (${RESOURCE_TYPES.filter((r) => up.cost[r]).map((r) => `${r.slice(0, 3)} ${up.cost[r]}`).join(' ')})`); })()} | era→ ${sim.eraBlocker(s) ?? 'livre'} | coletas ${bs.filter((b) => GATHER.includes(b.type)).map((b) => `${b.type.slice(0, 4)} ${b.workers}/${sim.fx(b).workers}·${b.claims.length}c`).join(' ')}`,
      );
    }
  }
  const pct = (o: Record<ResourceType, number>) => Object.fromEntries(RESOURCE_TYPES.map((r) => [r, Math.round((100 * o[r]) / samples)])) as Record<ResourceType, number>;
  return {
    seed,
    difficulty,
    low: low.map(pct),
    full: full.map(pct),
    lowEarly,
    firstResearch,
    maxStall,
    firstAttack,
    waves,
    era2,
    era3,
    hqMax,
    army10,
    army15,
    trained,
    lost,
    war,
    winner: sim.ended ? (sim.winner ?? null) : null,
    end: t,
    armies: [0, 1].map((s) => sim.units.filter((u) => u.owner === s).length),
  };
}

const check = (label: string, ok: boolean) => console.log(`${ok ? '✓' : '✗'} ${label}`);
const at = (t: number | null) => (t === null ? 'nunca' : fmt(t));
for (const difficulty of difficulties) {
  const results = seeds.map((seed) => run(seed, difficulty));
  const label = DIFFICULTY[difficulty].label;
  console.log(`\n=== ${label} ===`);
  for (const r of results) {
    const short = (o: Record<ResourceType, number>) => RESOURCE_TYPES.map((k) => `${k.slice(0, 3)} ${o[k]}`).join(' ');
    console.log(
      `seed ${r.seed} | guerra ${at(r.war)} | fim ${r.winner === null ? 'em andamento' : `vitória P${r.winner} aos ${fmt(r.end)}`} | exércitos ${r.armies.join(' x ')}`,
    );
    for (const s of [0, 1])
      console.log(
        `  P${s} estoque<40 %: ${short(r.low[s]!)} | armazém≥95% %: ${short(r.full[s]!)} | escassez antes de 8 min: ${r.lowEarly[s] ? 'sim' : 'não'} | 1ª pesquisa ${at(r.firstResearch[s]!)} | maior pausa (até 15 min) ${fmt(r.maxStall[s]!)}\n` +
          `     1ª ofensiva ${at(r.firstAttack[s]!)} (${r.waves[s]} ondas) | era 2 ${at(r.era2[s]!)}, era 3 ${at(r.era3[s]!)} | QG máx nv${r.hqMax[s]} | exército 10 min ${r.army10[s]}, 15 min ${r.army15[s]} (até 15 min: ${r.trained[s]} formadas, ${r.lost[s]} perdidas)`,
      );
  }
  const all = results.flatMap((r) => [0, 1].map((s) => ({ r, s })));
  // critérios de economia (seção 5): medidos no Normal
  if (difficulty === 'normal') {
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
      all.every(({ r, s }) => r.maxStall[s]! <= 5 * MIN),
    );
    // com a camada nacional, o Centro de Pesquisa espera a era 2 (QG 3 e a pesquisa nacional), por volta dos 9:30
    check(
      'primeira pesquisa militar antes dos 13:00 (em pelo menos 90% das IAs)',
      all.filter(({ r, s }) => r.firstResearch[s] !== null && r.firstResearch[s]! < 13 * MIN).length >= 0.9 * all.length,
    );
    check('menos da metade das partidas decididas antes dos 25:00', results.filter((r) => r.winner !== null && r.end < 25 * MIN).length < results.length / 2);
  }
  // critérios de ritmo da IA: a primeira ofensiva de cada partida (depois dela, a outra IA está em guerra e defende) e,
  // para era e tropas, as duas IAs (a que perdeu cedo não conta para a era)
  const pace = PACE[difficulty];
  const firsts = results.map((r) => Math.min(...r.firstAttack.map((x) => x ?? Infinity)));
  check(
    `${label}: primeira ofensiva da partida entre ${pace.firstAttack - 1}:00 e ${pace.firstAttack + 2}:00`,
    firsts.every((t) => t >= (pace.firstAttack - 1) * MIN && t <= (pace.firstAttack + 2) * MIN),
  );
  const alive = (r: Result, s: number, until: number) => r.winner === null || r.winner === s || r.end > until;
  if (minutes >= pace.era3)
    check(
      `${label}: era 3 até ${pace.era3}:00 (em pelo menos metade das IAs ainda vivas)`,
      (() => {
        const xs = all.filter(({ r, s }) => alive(r, s, pace.era3 * MIN));
        return xs.filter(({ r, s }) => r.era3[s] !== null && r.era3[s]! <= pace.era3 * MIN).length * 2 >= xs.length;
      })(),
    );
  if (minutes >= 15)
    check(
      `${label}: pelo menos ${pace.trained15} tropas formadas até 15:00 (média das IAs)`,
      all.reduce((a, { r, s }) => a + r.trained[s]!, 0) / all.length >= pace.trained15,
    );
}
