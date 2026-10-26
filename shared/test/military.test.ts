import { describe, expect, it } from 'vitest';
import { MILITARY_RESEARCH, TICK_RATE, UNITS, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { RESEARCH_CANCEL_REFUND, SPLASH_FRACTION, Simulation, targetMultiplier, type NationalLink } from '../sim/Simulation.ts';
import { MISSILE } from '../sim/air.ts';
import { makeSnapshot } from '../sim/snapshot.ts';
import type { Building, Unit } from '../sim/types.ts';
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

  it('lança-foguetes: o impacto atinge também quem está perto do alvo (60%)', () => {
    const { sim } = setup();
    const rl = sim.spawnUnitNear(sim.hqOf(0)!, 'rocket_artillery')!;
    const hq1 = sim.hqOf(1)!;
    const a = sim.spawnUnitNear(hq1, 'infantry')!;
    const b = sim.spawnUnitNear(hq1, 'infantry')!;
    // dentro da visão do próprio lança-foguetes (ele enxerga pouco: precisa de alvos à vista)
    a.pos = { x: rl.pos.x + 7, y: rl.pos.y };
    b.pos = { x: rl.pos.x + 8, y: rl.pos.y + 1 };
    sim.drainEvents();
    // parado, o lança-foguetes dispara sozinho contra o primeiro alvo à vista; mede o tick do
    // disparo (fora dele só há atrito, ínfimo)
    let drop = 0;
    for (let i = 0; i < TICK_RATE * 5 && drop === 0; i++) {
      const before = b.hp;
      sim.step();
      if (sim.drainEvents().some((e) => e.type === 'shot' && e.attackerId === rl.id)) drop = before - b.hp;
    }
    expect(drop).toBeCloseTo(UNITS.rocket_artillery.weapon.damage * SPLASH_FRACTION, 0);
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
});
