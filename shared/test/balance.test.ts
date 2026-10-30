import { describe, expect, it } from 'vitest';
import { BUILDINGS, PREPARATION_TICKS, RECRUIT, TICK_RATE, UNITS, costTotal, type UnitType } from '../sim/config.ts';
import { DIFFICULTIES, DIFFICULTY, firstAttackTicks, prepTicks, type Difficulty } from '../sim/difficulty.ts';
import { Simulation, targetMultiplier } from '../sim/Simulation.ts';
import { AI_COUNTER_GROUP, AI_HARASS_FIRST_TICK, TacticalAI } from '../sim/TacticalAI.ts';
import { rankDamageMul, rankFor, rankHpMul } from '../sim/veterancy.ts';
import { COEF, theaterSupply } from '../strategic/params.ts';
import { flatMap } from './helpers.ts';

/** Ajustes rápidos do lote 1 (docs/BALANCEAMENTO_E_PROGRESSAO.md, seção 2). */

const crew = costTotal(RECRUIT.cost);
const dps = (t: UnitType) => UNITS[t].weapon.damage / UNITS[t].weapon.cooldown;
const efficiency = (t: UnitType) => (dps(t) * UNITS[t].maxHp) / (costTotal(UNITS[t].cost) + crew) ** 2;

function sim2() {
  const sim = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
  sim.setWar(0, 1, true);
  return sim;
}

describe('blindagem por classe', () => {
  it('fuzil de infantaria e metralhadora do blindado rendem pouco contra veículos', () => {
    const sim = sim2();
    const apc = sim.addUnit('apc', 1, { x: 40, y: 40 });
    const inf = sim.addUnit('infantry', 1, { x: 44, y: 40 });
    expect(targetMultiplier(UNITS.infantry.weapon, apc)).toBe(0.35);
    expect(targetMultiplier(UNITS.infantry.weapon, inf)).toBe(1);
    expect(targetMultiplier(UNITS.apc.weapon, apc)).toBe(0.6);
  });

  it('o tanque passa a valer mais que o blindado inicial; o moderno é o mais forte', () => {
    expect(dps('tank')).toBeGreaterThan(dps('apc'));
    expect(efficiency('tank')).toBeGreaterThan(efficiency('apc'));
    expect(dps('mbt') * UNITS.mbt.maxHp).toBeGreaterThan(dps('tank') * UNITS.tank.maxHp);
  });

  it('o Lança-Foguetes bate mais que a artilharia que o libera (dano por salva)', () => {
    const rocket = UNITS.rocket_artillery.weapon;
    const art = UNITS.artillery.weapon;
    expect(rocket.damage / rocket.cooldown).toBeGreaterThan(art.damage / art.cooldown);
    expect(rocket.damage).toBe(120);
  });

  it('torre de vigilância com alcance 13', () => {
    expect(BUILDINGS.tower.weapon!.range).toBe(13);
  });
});

describe('contra-bateria', () => {
  it('edifício atingido por artilharia que o dono não vê: guarda a origem do tiro', () => {
    const sim = sim2();
    // o atacante enxerga o mapa inteiro (como com um blindado dando visão)
    sim.sandbox = { slots: [0], instant: false, aiActive: true, reveal: true };
    const hq = sim.hqOf(1)!;
    const art = sim.addUnit('artillery', 0, { x: hq.pos.x - 17, y: hq.pos.y });
    expect(sim.isVisibleTo(1, art.pos)).toBe(false);
    expect(sim.applyCommand(0, { type: 'attack', unitIds: [art.id], targetId: hq.id })).toBeNull();
    for (let i = 0; i < 8 * TICK_RATE && hq.hp === hq.maxHp; i++) sim.step();
    expect(hq.hp).toBeLessThan(hq.maxHp);
    const hit = sim.players[1]!.unseenFire!;
    expect(hit).toBeTruthy();
    expect(Math.hypot(hit.x - art.pos.x, hit.y - art.pos.y)).toBeLessThan(1);
  });

  it('a IA manda um grupo rápido na direção do tiro, sem tirar todo o exército', () => {
    const sim = sim2();
    const ai = new TacticalAI(1);
    const hq = sim.hqOf(1)!;
    for (let i = 0; i < 6; i++) sim.addUnit('infantry', 1, { x: hq.pos.x - 6 + i, y: hq.pos.y - 6 });
    for (let i = 0; i < 4; i++) sim.addUnit('apc', 1, { x: hq.pos.x - 6 + i, y: hq.pos.y - 8 });
    sim.addUnit('artillery', 1, { x: hq.pos.x - 6, y: hq.pos.y - 10 });
    const from = { x: hq.pos.x - 30, y: hq.pos.y };
    sim.players[1]!.unseenFire = { tick: sim.tick, ...from };
    const cmd = ai.think(sim).find((c) => c.type === 'attack_move' && Math.abs(c.x - from.x) < 0.01 && Math.abs(c.y - from.y) < 0.01);
    expect(cmd).toBeTruthy();
    if (cmd?.type !== 'attack_move') return;
    expect(cmd.unitIds.length).toBe(AI_COUNTER_GROUP);
    // os mais rápidos (blindados) vão primeiro; a artilharia não entra no grupo
    const types = cmd.unitIds.map((id) => sim.units.find((u) => u.id === id)!.type);
    expect(types.filter((t) => t === 'apc')).toHaveLength(4);
    expect(types).not.toContain('artillery');
    // logo depois, não manda outro grupo
    expect(ai.think(sim).some((c) => c.type === 'attack_move' && Math.abs(c.x - from.x) < 0.01)).toBe(false);
  });
});

describe('defesa proporcional', () => {
  it('uma isca barata puxa só parte do exército (cerca de 1,5× a força vista)', () => {
    const sim = sim2();
    const ai = new TacticalAI(1);
    const hq = sim.hqOf(1)!;
    for (let i = 0; i < 20; i++) sim.addUnit('infantry', 1, { x: hq.pos.x - 10 + (i % 5) * 1.5, y: hq.pos.y - 8 - Math.floor(i / 5) * 1.5 });
    const bait = sim.addUnit('infantry', 0, { x: hq.pos.x - 14, y: hq.pos.y - 18 });
    sim.step();
    expect(sim.isVisibleTo(1, bait.pos)).toBe(true);
    const cmd = ai.think(sim).find((c) => c.type === 'attack_move' && Math.abs(c.x - bait.pos.x) < 0.01);
    expect(cmd).toBeTruthy();
    if (cmd?.type !== 'attack_move') return;
    expect(cmd.unitIds.length).toBeGreaterThanOrEqual(2);
    expect(cmd.unitIds.length).toBeLessThanOrEqual(3);
  });
});

describe('níveis de dificuldade', () => {
  it('o preparo muda com a dificuldade (12 / 8 / 5 / 3 min) e é salvo na partida', () => {
    expect(DIFFICULTIES.map((d) => prepTicks(d) / TICK_RATE / 60)).toEqual([12, 8, 5, 3]);
    expect(prepTicks('normal')).toBe(PREPARATION_TICKS);
    const sim = sim2();
    sim.difficulty = 'brutal';
    expect(Simulation.fromSave(sim.toSave()).difficulty).toBe('brutal');
  });

  it('no Difícil a primeira ofensiva sai aos 8 min; no Fácil ainda não', () => {
    const wave = (d: Difficulty) => {
      const sim = sim2();
      sim.difficulty = d;
      const ai = new TacticalAI(1);
      for (let i = 0; i < 30; i++) sim.addUnit('infantry', 1, { x: 50, y: 50 });
      sim.tick = firstAttackTicks('hard') + 1;
      return ai.think(sim).some((c) => c.type === 'attack_move' && c.unitIds.length >= DIFFICULTY[d].firstWave);
    };
    expect(wave('hard')).toBe(true);
    expect(wave('easy')).toBe(false);
  });

  it('primeira ofensiva na hora da dificuldade (14 / 10 / 8 / 6 min), com o que tiver', () => {
    expect(DIFFICULTIES.map((d) => firstAttackTicks(d) / TICK_RATE / 60)).toEqual([14, 10, 8, 6]);
    // nunca antes do fim do preparo
    for (const d of DIFFICULTIES) expect(firstAttackTicks(d)).toBeGreaterThanOrEqual(prepTicks(d));
    const attack = (tick: number, troops: number) => {
      const sim = sim2();
      sim.difficulty = 'normal';
      const ai = new TacticalAI(1);
      for (let i = 0; i < troops; i++) sim.addUnit('infantry', 1, { x: 50, y: 50 });
      sim.tick = tick;
      return ai.think(sim).find((c) => c.type === 'attack_move' && c.unitIds.length >= DIFFICULTY.normal.minFirstWave);
    };
    const t = firstAttackTicks('normal');
    // bem abaixo da onda cheia (12), mas já na hora: ataca
    expect(attack(t, DIFFICULTY.normal.minFirstWave)).toBeTruthy();
    // um segundo antes, não; e sem o mínimo de tropas, também não
    expect(attack(t - TICK_RATE, DIFFICULTY.normal.minFirstWave)).toBeUndefined();
    expect(attack(t, DIFFICULTY.normal.minFirstWave - 1)).toBeUndefined();
  });

  it('a primeira ofensiva pequena não faz a próxima onda crescer; a seguinte espera a onda cheia', () => {
    const sim = sim2();
    sim.difficulty = 'normal';
    const ai = new TacticalAI(1);
    for (let i = 0; i < DIFFICULTY.normal.minFirstWave; i++) sim.addUnit('infantry', 1, { x: 50, y: 50 });
    sim.tick = firstAttackTicks('normal');
    expect(ai.think(sim).some((c) => c.type === 'attack_move')).toBe(true);
    expect(ai.toSave().waveSize).toBe(DIFFICULTY.normal.firstWave);
    // a ofensiva acabou; depois do intervalo, com as mesmas tropas (menos que a onda cheia), não sai outra
    for (const u of sim.units) if (u.owner === 1) u.order = { kind: 'idle' };
    ai.think(sim);
    sim.tick += DIFFICULTY.normal.waveCooldownMinutes * 60 * TICK_RATE;
    expect(ai.think(sim).some((c) => c.type === 'attack_move' && c.unitIds.length >= DIFFICULTY.normal.minFirstWave)).toBe(false);
  });

  it('a dificuldade escala o ritmo inteiro, não só o tamanho da onda', () => {
    const asc = (k: 'prepGarrison' | 'armyPerMinute' | 'farms' | 'defenseBudgetMul') => DIFFICULTIES.every((d, i) => i === 0 || DIFFICULTY[d][k] >= DIFFICULTY[DIFFICULTIES[i - 1]!][k]);
    const desc = (k: 'firstAttackMinutes' | 'waveCooldownMinutes' | 'eraPushMinutes') => DIFFICULTIES.every((d, i) => i === 0 || DIFFICULTY[d][k] < DIFFICULTY[DIFFICULTIES[i - 1]!][k]);
    expect(asc('prepGarrison') && asc('armyPerMinute') && asc('farms') && asc('defenseBudgetMul')).toBe(true);
    expect(desc('firstAttackMinutes') && desc('waveCooldownMinutes') && desc('eraPushMinutes')).toBe(true);
  });

  it('Brutal: bônus de coleta declarado só para quem tem o modificador', () => {
    const sim = sim2();
    const farm = sim.addBuilding('farm', 1, { cx: 24, cy: 22 }, 1);
    farm.workers = 3;
    farm.claims = [22 * 32 + 22, 22 * 32 + 23, 23 * 32 + 22];
    sim.territory.fill(1);
    const base = sim.buildingRate(farm);
    sim.setModifiers(1, { gatherMul: 1 + DIFFICULTY.brutal.gatherBonus });
    expect(sim.buildingRate(farm)).toBeCloseTo(base * 1.15);
  });
});

describe('incidentes de fronteira (assédio no preparo)', () => {
  it('hostilidade só pelo prazo, sem guerra declarada; sobrevive a salvar e carregar', () => {
    const sim = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
    expect(sim.hostile(0, 1)).toBe(false);
    sim.startIncident(1, 0, 10, null);
    expect(sim.hostile(0, 1)).toBe(true);
    expect(sim.formalWar(0, 1)).toBe(false);
    expect(sim.drainEvents().some((e) => e.type === 'border_incident' && e.aggressor === 1 && e.victim === 0)).toBe(true);
    const copy = Simulation.fromSave(sim.toSave());
    expect(copy.hostile(0, 1)).toBe(true);
    for (let i = 0; i < 10 * TICK_RATE; i++) sim.step();
    expect(sim.hostile(0, 1)).toBe(false);
  });

  it('a IA manda 2 a 3 tropas à borda do vizinho no preparo (Normal), nunca no Fácil', () => {
    const harass = (d: Difficulty) => {
      const sim = new Simulation({ map: flatMap(), playerCount: 2, startingUnits: [] });
      sim.difficulty = d;
      sim.step();
      const ai = new TacticalAI(1);
      const hq = sim.hqOf(1)!;
      for (let i = 0; i < 6; i++) sim.addUnit('infantry', 1, { x: hq.pos.x - 6 + i, y: hq.pos.y - 6 });
      sim.tick = AI_HARASS_FIRST_TICK;
      const cmds = ai.think(sim);
      return { ai, cmds };
    };
    const normal = harass('normal');
    expect(normal.ai.wantsIncident?.victim).toBe(0);
    const raid = normal.cmds.find((c) => c.type === 'attack_move');
    expect(raid?.type === 'attack_move' && raid.unitIds.length).toBeGreaterThanOrEqual(2);
    expect(raid?.type === 'attack_move' && raid.unitIds.length).toBeLessThanOrEqual(3);
    expect(harass('easy').ai.wantsIncident).toBeNull();
  });
});

describe('veterania', () => {
  it('abates sobem a patente: mais vida e mais dano, com evento', () => {
    const sim = sim2();
    const vet = sim.addUnit('tank', 0, { x: 30, y: 30 });
    const hp0 = vet.maxHp;
    for (let k = 0; k < 2; k++) {
      const victim = sim.addUnit('infantry', 1, { x: 36, y: 30 });
      victim.hp = 1;
      for (let i = 0; i < 4 * TICK_RATE && victim.hp > 0; i++) sim.step();
      expect(victim.hp).toBeLessThanOrEqual(0);
    }
    expect(vet.kills).toBe(2);
    expect(vet.rank).toBe(1);
    expect(rankFor(10)).toBe(3);
    expect(vet.maxHp).toBe(Math.round(hp0 * rankHpMul(1)));
    expect(sim.drainEvents().some((e) => e.type === 'unit_promoted' && e.id === vet.id && e.rank === 1)).toBe(true);
    // dano do próximo tiro com +10%
    const target = sim.addUnit('apc', 1, { x: 36, y: 30 });
    const before = target.hp;
    for (let i = 0; i < 3 * TICK_RATE && target.hp === before; i++) sim.step();
    expect(before - target.hp).toBeCloseTo(UNITS.tank.weapon.damage * rankDamageMul(1), 5);
  });
});

describe('curva do orçamento de defesa', () => {
  it('na paridade, de 1% para 10% do PIB a logística sobe mais de 2 suprimentos/s', () => {
    const at = (pct: number) => theaterSupply(((pct / 100) * COEF.parityGdpUsd) / 1e9);
    expect(at(10) - at(1)).toBeGreaterThan(2);
    expect(at(2)).toBeGreaterThan(at(1));
    // saturação suave: nunca passa do teto, mas continua subindo
    expect(theaterSupply(5000)).toBeLessThan(COEF.theaterSupplyMax);
    expect(theaterSupply(5000)).toBeGreaterThan(theaterSupply(1000));
  });
});
