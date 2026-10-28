import { describe, expect, it } from 'vitest';
import { BUILDINGS, RECRUIT, TICK_RATE, UNITS, costTotal, type UnitType } from '../sim/config.ts';
import { Simulation, targetMultiplier } from '../sim/Simulation.ts';
import { AI_COUNTER_GROUP, TacticalAI } from '../sim/TacticalAI.ts';
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
