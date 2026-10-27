import { describe, expect, it } from 'vitest';
import { MILITARY_RESEARCH, TICK_RATE, UNITS, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { RESEARCH_CANCEL_REFUND, SPLASH_FRACTION, Simulation, targetMultiplier, type NationalLink } from '../sim/Simulation.ts';
import { MISSILE, missileSpec } from '../sim/air.ts';
import { makeSnapshot } from '../sim/snapshot.ts';
import type { Building, SimEvent, Unit } from '../sim/types.ts';
import { militaryResearchSpeed } from '../strategic/params.ts';
import { flatMap } from './helpers.ts';

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

function setup(opts: { speed?: number; war?: boolean } = {}) {
  const sim = new Simulation({ map: flatMap(36), playerCount: 2, startingUnits: [] });
  const link: NationalLink = {
    techs: () => ['ballistic_missiles'],
    infrastructureIndex: () => 1,
    stability: () => 60,
    worksFundUsd: () => 1e9,
    chargeWorks: () => true,
    refundWorks: () => {},
    researchSpeed: () => opts.speed ?? 1,
  };
  sim.national = link;
  if (opts.war !== false) sim.setWar(0, 1, true);
  for (const p of sim.players) {
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 3000;
    p.oilReserve = 3000;
    p.recruits = 10;
    p.citizens = 30;
  }
  const place = (slot: number, type: BuildingType, from: [number, number], to: [number, number]): Building => {
    for (let cy = from[1]; cy <= to[1]; cy++)
      for (let cx = from[0]; cx <= to[0]; cx++)
        if (sim.applyCommand(slot, { type: 'build', buildingType: type, cx, cy }) === null)
          return sim.buildings.find((b) => b.type === type && b.owner === slot && b.cell.cx === cx && b.cell.cy === cy)!;
    throw new Error(`sem lugar para ${type}`);
  };
  return { sim, place };
}

/** Centro de pesquisa pronto e com pesquisadores. */
function withCenter(opts: { speed?: number } = {}) {
  const s = setup(opts);
  const center = s.place(0, 'research_center', [2, 8], [12, 14]);
  run(s.sim, 32);
  s.sim.staff(0);
  return { ...s, center };
}

const research = (sim: Simulation, center: Building, id: keyof typeof MILITARY_RESEARCH) => sim.applyCommand(0, { type: 'military_research', buildingId: center.id, researchId: id });

describe('produção sem recursos para o equipamento de linha', () => {
  it('a unidade sai básica (sem modernização) em vez de travar a produção', async () => {
    const { checkProduce } = await import('../sim/production.ts');
    const ctx = { buildingType: 'barracks' as const, level: 1, spec: null, progress: 1, queueLength: 0, recruits: 2, popTotal: 0, popCap: 99, techs: ['composite_armor'], militaryResearch: [] };
    const full = checkProduce('infantry', { ...ctx, resources: { supplies: 100, food: 100, wood: 0, stone: 0, iron: 50, oil: 0 } });
    expect(full.mods).toContain('body_armor');
    expect(full.basic).toBe(false);
    const noIron = checkProduce('infantry', { ...ctx, resources: { supplies: 100, food: 100, wood: 0, stone: 0, iron: 0, oil: 0 } });
    expect(noIron.blocker).toBeNull();
    expect(noIron.basic).toBe(true);
    expect(noIron.mods).toEqual([]);
    expect(noIron.cost.iron ?? 0).toBe(0);
  });
});

describe('progressão militar — pesquisa no Centro de Pesquisa', () => {
  it('tropa nova bloqueada até pesquisar; a pesquisa custa recursos e tempo e libera a produção', () => {
    const { sim, center, place } = withCenter();
    const barracks = place(0, 'barracks', [14, 2], [26, 12]);
    run(sim, 30);
    const p = sim.players[0]!;
    expect(sim.applyCommand(0, { type: 'produce', buildingId: barracks.id, unitType: 'at_infantry' })).toMatch(/Armas antitanque/);
    const iron = p.resources.iron;
    expect(research(sim, center, 'antitank_weapons')).toBeNull();
    expect(p.resources.iron).toBe(iron - MILITARY_RESEARCH.antitank_weapons.cost.iron!);
    // um centro pesquisa uma coisa por vez
    expect(research(sim, center, 'mobile_air_defense')).toMatch(/já está pesquisando/);
    sim.drainEvents();
    run(sim, MILITARY_RESEARCH.antitank_weapons.seconds - 2);
    expect(p.militaryResearch ?? []).not.toContain('antitank_weapons');
    run(sim, 3);
    expect(p.militaryResearch).toContain('antitank_weapons');
    expect(sim.drainEvents().some((e) => e.type === 'military_research_completed' && e.researchId === 'antitank_weapons')).toBe(true);
    expect(sim.applyCommand(0, { type: 'produce', buildingId: barracks.id, unitType: 'at_infantry' })).toBeNull();
    // o adversário não ganhou nada
    expect(sim.players[1]!.militaryResearch ?? []).toHaveLength(0);
  });

  it('pré-requisitos e nível do centro: segundo escalão pede nível 2, blindados de nova geração pedem nível 3', () => {
    const { sim, center } = withCenter();
    expect(research(sim, center, 'rocket_systems')).toMatch(/Requer: Armas antitanque/);
    sim.players[0]!.militaryResearch = ['antitank_weapons'];
    expect(research(sim, center, 'rocket_systems')).toMatch(/nível 2/);
    center.level = 2;
    expect(research(sim, center, 'rocket_systems')).toBeNull();
    sim.applyCommand(0, { type: 'cancel_military_research', buildingId: center.id });
    sim.players[0]!.militaryResearch = ['antitank_weapons', 'rocket_systems'];
    expect(research(sim, center, 'modern_armor')).toMatch(/nível 3/);
  });

  it('sem pesquisadores a pesquisa para; o orçamento nacional de P&D acelera', () => {
    const slow = withCenter({ speed: 1 });
    const fast = withCenter({ speed: 2 });
    for (const s of [slow, fast]) expect(research(s.sim, s.center, 'antitank_weapons')).toBeNull();
    run(slow.sim, 21);
    run(fast.sim, 21);
    expect(fast.sim.players[0]!.militaryResearch).toContain('antitank_weapons');
    expect(slow.sim.players[0]!.militaryResearch ?? []).not.toContain('antitank_weapons');
    // sem ninguém trabalhando, não avança
    const idle = withCenter();
    expect(research(idle.sim, idle.center, 'antitank_weapons')).toBeNull();
    idle.sim.applyCommand(0, { type: 'set_workers', buildingId: idle.center.id, count: 0 });
    const before = idle.center.research!.remaining;
    run(idle.sim, 10);
    expect(idle.center.research!.remaining).toBe(before);
    expect(idle.center.status).toBe('no_workers');
    expect(militaryResearchSpeed(0)).toBe(0.8);
    expect(militaryResearchSpeed(2)).toBe(2);
  });

  it('cancelar devolve 75%; destruir o centro perde a pesquisa em andamento', () => {
    const { sim, center } = withCenter();
    const p = sim.players[0]!;
    // estoque abaixo da capacidade: a devolução cabe inteira
    p.resources.supplies = 500;
    const supplies = p.resources.supplies;
    research(sim, center, 'antitank_weapons');
    expect(sim.applyCommand(0, { type: 'cancel_military_research', buildingId: center.id })).toBeNull();
    expect(p.resources.supplies).toBe(supplies - MILITARY_RESEARCH.antitank_weapons.cost.supplies! + Math.floor(MILITARY_RESEARCH.antitank_weapons.cost.supplies! * RESEARCH_CANCEL_REFUND));
    expect(center.research).toBeNull();
  });

  it('a visão do jogador mostra só as próprias pesquisas e o progresso do próprio centro', () => {
    const { sim, center } = withCenter();
    research(sim, center, 'antitank_weapons');
    run(sim, 10);
    const mine = makeSnapshot(sim, [], { slot: 0, memory: { known: new Map() } as never });
    expect(mine.buildings.find((b) => b.id === center.id)!.research?.id).toBe('antitank_weapons');
    expect(mine.buildings.find((b) => b.id === center.id)!.research!.progress).toBeGreaterThan(0.2);
    expect(mine.players.find((p) => p.slot === 0)!.militaryResearch).toEqual([]);
    expect(mine.players.find((p) => p.slot === 1)!.militaryResearch).toBeUndefined();
  });

  it('salvar no meio da pesquisa e continuar é idêntico', () => {
    const { sim, center } = withCenter();
    research(sim, center, 'antitank_weapons');
    run(sim, 15);
    const copy = Simulation.deserialize(sim.serialize());
    copy.national = sim.national;
    run(sim, 30);
    run(copy, 30);
    expect(copy.serialize()).toBe(sim.serialize());
    expect(copy.players[0]!.militaryResearch).toContain('antitank_weapons');
  });

  it('parseCommand valida os comandos de pesquisa militar', () => {
    expect(parseCommand({ type: 'military_research', buildingId: 3, researchId: 'modern_armor' })).toEqual({ type: 'military_research', buildingId: 3, researchId: 'modern_armor' });
    expect(parseCommand({ type: 'military_research', buildingId: 3, researchId: 'bomba' })).toBeNull();
    expect(parseCommand({ type: 'cancel_military_research', buildingId: 3 })).toEqual({ type: 'cancel_military_research', buildingId: 3 });
  });
});

describe('progressão militar — tropas novas em combate', () => {
  it('antitanque: dano triplo contra veículos e metade contra infantaria', () => {
    const w = UNITS.at_infantry.weapon;
    const unit = (type: Unit['type']) => ({ kind: 'unit', type }) as Unit;
    expect(targetMultiplier(w, unit('tank'))).toBe(3);
    expect(targetMultiplier(w, unit('mbt'))).toBe(3);
    expect(targetMultiplier(w, unit('infantry'))).toBe(0.5);
    expect(targetMultiplier(UNITS.tank.weapon, unit('infantry'))).toBe(1);
    // em duelo, 3 antitanques destroem um tanque comum antes de perderem a metade
    const { sim } = setup();
    const hq0 = sim.hqOf(0)!;
    const hq1 = sim.hqOf(1)!;
    const at = [0, 1, 2].map(() => sim.spawnUnitNear(hq0, 'at_infantry')!);
    const tank = sim.spawnUnitNear(hq1, 'tank')!;
    tank.pos = { x: at[0]!.pos.x + 6, y: at[0]!.pos.y };
    for (const u of at) sim.applyCommand(0, { type: 'attack', unitIds: [u.id], targetId: tank.id });
    run(sim, 20);
    expect(tank.hp).toBeLessThanOrEqual(0);
    expect(at.filter((u) => u.hp > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('lança-foguetes: salva de 12 foguetes; o dano chega no impacto e atinge quem está perto do alvo (60%)', () => {
    const { sim } = setup();
    const rl = sim.spawnUnitNear(sim.hqOf(0)!, 'rocket_artillery')!;
    const hq1 = sim.hqOf(1)!;
    const a = sim.spawnUnitNear(hq1, 'infantry')!;
    const b = sim.spawnUnitNear(hq1, 'infantry')!;
    // à vista do lançador e além do alcance mínimo
    a.pos = { x: rl.pos.x + 8.6, y: rl.pos.y };
    b.pos = { x: rl.pos.x + 9.2, y: rl.pos.y + 0.8 };
    sim.drainEvents();
    let shot: Extract<SimEvent, { type: 'shot' }> | null = null;
    const pa = { ...a.pos };
    const pb = { ...b.pos };
    for (let i = 0; i < TICK_RATE * 5 && !shot; i++) {
      // os alvos ficam no lugar (sem isso a infantaria avançaria contra o lançador)
      a.pos = { ...pa };
      b.pos = { ...pb };
      sim.step();
      shot = sim.drainEvents().find((e): e is Extract<SimEvent, { type: 'shot' }> => e.type === 'shot' && e.attackerId === rl.id) ?? null;
    }
    expect(shot?.salvo).toBe(12);
    // no disparo, ninguém foi atingido ainda (só o atrito, ínfimo, no território inimigo)
    expect(a.hp).toBeGreaterThan(a.maxHp - 3);
    expect(b.hp).toBeGreaterThan(b.maxHp - 3);
    let impact = false;
    let dropA = 0;
    let dropB = 0;
    for (let i = 0; i < shot!.flightTicks! && !impact; i++) {
      a.pos = { ...pa };
      b.pos = { ...pb };
      const [ha, hb] = [a.hp, b.hp];
      sim.step();
      impact = sim.drainEvents().some((e) => e.type === 'salvo_impact' && e.attackerId === rl.id);
      // dano do tick do impacto (fora dele só há atrito, ínfimo)
      if (impact) [dropA, dropB] = [ha - a.hp, hb - b.hp];
    }
    expect(impact).toBe(true);
    expect(sim.tick).toBe(shot!.tick + shot!.flightTicks!);
    expect(dropA).toBeCloseTo(UNITS.rocket_artillery.weapon.damage, 0);
    expect(dropB).toBeCloseTo(UNITS.rocket_artillery.weapon.damage * SPLASH_FRACTION, 0);
  });

  it('lança-foguetes: quem sai da área durante o voo escapa; salvar e carregar mantém a salva no ar', () => {
    const { sim } = setup();
    const rl = sim.spawnUnitNear(sim.hqOf(0)!, 'rocket_artillery')!;
    const a = sim.spawnUnitNear(sim.hqOf(1)!, 'infantry')!;
    a.pos = { x: rl.pos.x + 8.6, y: rl.pos.y };
    const pa = { ...a.pos };
    let shot = false;
    for (let i = 0; i < TICK_RATE * 5 && !shot; i++) {
      a.pos = { ...pa };
      sim.step();
      shot = sim.drainEvents().some((e) => e.type === 'shot' && e.attackerId === rl.id);
    }
    expect(shot).toBe(true);
    const copy = Simulation.deserialize(sim.serialize());
    const a2 = copy.get(a.id) as Unit;
    // no original, a infantaria corre para longe; na cópia, fica parada no ponto do impacto
    const stay = { ...a2.pos };
    const away = { x: a.pos.x + 12, y: a.pos.y + 6 };
    for (let i = 0; i < TICK_RATE * 3; i++) {
      a.pos = { ...away };
      a2.pos = { ...stay };
      sim.step();
      copy.step();
    }
    // longe da área só sobra o atrito; na cópia, a salva acerta em cheio
    expect(a.maxHp - a.hp).toBeLessThan(5);
    expect(a2.maxHp - a2.hp).toBeGreaterThan(UNITS.rocket_artillery.weapon.damage * 0.9);
  });

  it('lança-foguetes: não atira dentro do alcance mínimo (recua) nem se aproxima das construções inimigas', () => {
    const { sim } = setup();
    const rl = sim.spawnUnitNear(sim.hqOf(0)!, 'rocket_artillery')!;
    const a = sim.spawnUnitNear(sim.hqOf(1)!, 'infantry')!;
    a.pos = { x: rl.pos.x + 3, y: rl.pos.y };
    a.order = { kind: 'idle' };
    const start = { ...rl.pos };
    let fired = false;
    for (let i = 0; i < TICK_RATE * 2 && !fired; i++) {
      a.pos = { x: rl.pos.x + 3, y: rl.pos.y };
      sim.step();
      fired = sim.drainEvents().some((e) => e.type === 'shot' && e.attackerId === rl.id);
    }
    expect(fired).toBe(false);
    expect(Math.hypot(rl.pos.x - start.x, rl.pos.y - start.y)).toBeGreaterThan(1);

    // ordem de ir até o QG inimigo: para antes, à distância mínima das construções
    sim.get(a.id)!.hp = 0;
    sim.step();
    const hq1 = sim.hqOf(1)!;
    expect(sim.applyCommand(0, { type: 'move', unitIds: [rl.id], x: hq1.pos.x, y: hq1.pos.y })).toBeNull();
    for (let i = 0; i < TICK_RATE * 90 && rl.order.kind === 'move'; i++) sim.step();
    for (const b of sim.buildings) if (b.owner === 1) expect(sim.distanceToEdge(rl.pos, b)).toBeGreaterThanOrEqual(UNITS.rocket_artillery.weapon.minRange! - 0.5);
    expect(sim.distanceToEdge(rl.pos, hq1)).toBeLessThan(UNITS.rocket_artillery.weapon.range);
  });

  it('antiaérea móvel perto do alvo intercepta mísseis como uma bateria', () => {
    const { sim, place } = setup();
    const silo = place(0, 'missile_silo', [2, 8], [12, 14]);
    run(sim, 35);
    const enemyHq = sim.hqOf(1)!;
    for (let i = 0; i < 6; i++) {
      const u = sim.spawnUnitNear(enemyHq, 'mobile_aa')!;
      expect(Math.hypot(u.pos.x - enemyHq.pos.x, u.pos.y - enemyHq.pos.y)).toBeLessThanOrEqual(MISSILE.interceptRange);
    }
    sim.air.known[0] = new Set([enemyHq.id]);
    let intercepted = 0;
    for (let k = 0; k < 6; k++) {
      sim.air.silo(silo.id).missiles = 1;
      expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: silo.id, x: enemyHq.pos.x, y: enemyHq.pos.y })).toBeNull();
      const l = sim.air.launches.at(-1)!;
      run(sim, MISSILE.prepareSeconds + 0.1);
      expect(sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
      run(sim, MISSILE.launchSeconds + l.flightTicks / TICK_RATE + 0.2);
      if (l.state === 'intercepted') intercepted++;
      if (!sim.entities.has(enemyHq.id)) break;
    }
    expect(intercepted).toBeGreaterThan(0);
  });
  it('silo nível 2: míssil pesado (abastece em 5 s, contagem de 2 s, voa mais rápido, raio e dano maiores)', () => {
    const { sim, place } = setup();
    const silo = place(0, 'missile_silo', [2, 8], [12, 14]);
    run(sim, 35);
    // a melhoria passa pela regra normal de obra
    const plan = sim.upgradePlan(silo);
    expect(plan.toLevel).toBe(2);
    expect(plan.gains.some((g) => g.key === 'missileGen')).toBe(true);
    silo.level = 2;
    const enemyHq = sim.hqOf(1)!;
    sim.air.known[0] = new Set([enemyHq.id]);
    sim.air.silo(silo.id).missiles = 1;
    expect(sim.applyCommand(0, { type: 'missile_prepare', buildingId: silo.id, x: enemyHq.pos.x, y: enemyHq.pos.y })).toBeNull();
    const l = sim.air.launches.at(-1)!;
    const heavy = missileSpec(2);
    expect(l.gen).toBe(2);
    expect(l.timer).toBe(heavy.prepareSeconds * TICK_RATE);
    expect(l.flightTicks).toBe(Math.max(1, Math.round((Math.hypot(enemyHq.pos.x - silo.pos.x, enemyHq.pos.y - silo.pos.y) / heavy.speed) * TICK_RATE)));
    expect(heavy.damage).toBeGreaterThan(MISSILE.damage);
    expect(heavy.radius).toBeGreaterThan(MISSILE.radius);
    expect(heavy.maxIntercept).toBeLessThan(MISSILE.maxIntercept);
    run(sim, heavy.prepareSeconds + 0.1);
    expect(l.state).toBe('armed');
    expect(sim.applyCommand(0, { type: 'missile_authorize', launchId: l.id })).toBeNull();
    expect(l.timer).toBe(heavy.launchSeconds * TICK_RATE);
    const before = enemyHq.hp;
    const events: SimEvent[] = [];
    for (let i = 0; i < (heavy.launchSeconds + 0.2) * TICK_RATE + l.flightTicks; i++) {
      sim.step();
      events.push(...sim.drainEvents());
    }
    expect(l.state).toBe('impact');
    expect(events.find((e) => e.type === 'missile' && e.state === 'impact')).toMatchObject({ gen: 2 });
    expect(before - enemyHq.hp).toBeGreaterThan(MISSILE.damage);
    // salvar e carregar mantém a geração do lançamento
    expect(Simulation.deserialize(sim.serialize()).air.launches.at(-1)!.gen).toBe(2);
  });
  it('lança-foguetes: o snapshot mostra a recarga da salva (0 recém-disparado → some quando pronto)', () => {
    const { sim } = setup();
    const rl = sim.spawnUnitNear(sim.hqOf(0)!, 'rocket_artillery')!;
    const a = sim.spawnUnitNear(sim.hqOf(1)!, 'infantry')!;
    a.pos = { x: rl.pos.x + 8.6, y: rl.pos.y };
    const pa = { ...a.pos };
    let shot = false;
    for (let i = 0; i < TICK_RATE * 5 && !shot; i++) {
      a.pos = { ...pa };
      sim.step();
      shot = sim.drainEvents().some((e) => e.type === 'shot' && e.attackerId === rl.id);
    }
    const snap = () => makeSnapshot(sim, [], undefined).units.find((u) => u.id === rl.id)!;
    expect(snap().reload).toBeLessThan(0.05);
    a.hp = 0;
    for (let i = 0; i < TICK_RATE * 3.5; i++) sim.step();
    expect(snap().reload).toBeGreaterThan(0.4);
    for (let i = 0; i < TICK_RATE * 5; i++) sim.step();
    expect(snap().reload).toBeUndefined();
  });
});
