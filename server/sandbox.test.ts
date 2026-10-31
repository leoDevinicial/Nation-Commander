import { NetworkGuard } from './kac/network.ts';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { BUILDINGS, TICK_RATE } from '../shared/sim/config.ts';
import { SANDBOX_STOCK } from '../shared/sim/Simulation.ts';
import { maxLevelOf } from '../shared/sim/upgrades.ts';
import { Connection } from './Connection.ts';
import { handleMessage, type HandlerDeps } from './handler.ts';
import { MemoryMatchStore } from './matchStore.ts';
import { parseClientMessage } from './messages.ts';
import { RoomManager } from './RoomManager.ts';
import type { MatchRecord } from './supabase.ts';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const ws = { readyState: 1, OPEN: 1, send: (s: string) => sent.push(JSON.parse(s) as ServerMessage), close: vi.fn() } as unknown as WebSocket;
  return { conn: new Connection(ws), sent, last: <T extends ServerMessage['t']>(t: T) => sent.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined };
}

async function sandboxRoom(mode: 'sandbox' | 'vs_ai' = 'sandbox') {
  const now = { t: 0 };
  const records: MatchRecord[] = [];
  const rooms = new RoomManager({ reconnectGraceMs: 1000, record: async (r) => (records.push(r), true), autoLoop: false, seed: 5, now: () => now.t }, 10, new MemoryMatchStore(() => now.t));
  const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(),
    network: new NetworkGuard(), verify: async (t) => ({ id: t, name: 'Teste' }) };
  const a = fakeConn();
  const send = (raw: object) => handleMessage(a.conn, parseClientMessage(JSON.stringify(raw))!, deps);
  await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'u1' });
  await send({ t: 'create_room', mode, countryId: 'BRA' });
  await send({ t: 'start' });
  const room = rooms.get(a.last('room')!.room!.code)!;
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * TICK_RATE; i++) room.advance();
  };
  const cmd = async (c: object) => {
    a.sent.length = 0;
    await send({ t: 'cmd', cmd: c });
    room.advance();
    return a.last('cmd_rejected')?.reason ?? null;
  };
  return { room, sim: room.sim!, a, send, run, cmd, records };
}

describe('modo Sandbox', () => {
  it('eras: o avanço é livre e instantâneo no Sandbox (para ver o visual de cada era)', async () => {
    const { sim, cmd, run } = await sandboxRoom();
    expect(sim.eras).toBe(true);
    expect(await cmd({ type: 'advance_era' })).toBeNull();
    run(0.2);
    expect(sim.players[0]!.era).toBe(2);
    expect(sim.eraOf(1)).toBe(1);
  });

  it('começa em guerra com a IA, com recursos ilimitados, tudo pesquisado e o modo no match_start', async () => {
    const { sim, a, room } = await sandboxRoom();
    expect(a.last('match_start')!.match.mode).toBe('sandbox');
    expect(sim.sandbox).toMatchObject({ slots: [0], instant: true, aiActive: false, reveal: false });
    expect(sim.hostile(0, 1)).toBe(true);
    room.advance();
    for (const v of Object.values(sim.players[0]!.resources)) expect(v).toBe(SANDBOX_STOCK);
    // a IA não tem as regras do Sandbox
    expect(sim.players[1]!.resources.food).toBeLessThan(SANDBOX_STOCK);
    expect(sim.national!.techs(0).length).toBeGreaterThan(10);
  });

  it('obras, produção e tropas novas na hora, sem pesquisa nem limite de população', async () => {
    const { sim, cmd, run } = await sandboxRoom();
    const hq = sim.buildings.find((b) => b.owner === 0 && b.type === 'hq')!;
    let err: string | null = 'sem lugar';
    for (let r = 4; r < 14 && err; r++)
      for (let dy = -r; dy <= r && err; dy++)
        for (let dx = -r; dx <= r && err; dx++)
          err = sim.placementError(0, 'factory', { cx: hq.cell.cx + dx, cy: hq.cell.cy + dy }) ? err : await cmd({ type: 'build', buildingType: 'factory', cx: hq.cell.cx + dx, cy: hq.cell.cy + dy });
    expect(err).toBeNull();
    run(1.5);
    const factory = sim.buildings.find((b) => b.owner === 0 && b.type === 'factory')!;
    expect(factory.progress).toBe(1);
    const before = sim.units.filter((u) => u.owner === 0 && u.type === 'mbt').length;
    // tanque moderno normalmente exige três pesquisas militares
    expect(await cmd({ type: 'produce', buildingId: factory.id, unitType: 'mbt' })).toBeNull();
    run(1.5);
    expect(sim.units.filter((u) => u.owner === 0 && u.type === 'mbt').length).toBe(before + 1);
  });

  it('ferramentas: criar tropas modernizadas (próprias e inimigas), nível máximo, modernizar e remover', async () => {
    const { sim, cmd } = await sandboxRoom();
    const hq = sim.buildings.find((b) => b.owner === 0 && b.type === 'hq')!;
    expect(await cmd({ type: 'sandbox_spawn', unitType: 'tank', x: hq.pos.x + 12, y: hq.pos.y, count: 5, enemy: true, maxed: true })).toBeNull();
    const enemies = sim.units.filter((u) => u.owner === 1 && u.type === 'tank' && u.mods.length > 0);
    expect(enemies.length).toBe(5);
    expect(await cmd({ type: 'sandbox_level', buildingId: hq.id, level: 20 })).toBeNull();
    expect(hq.level).toBe(maxLevelOf('hq'));
    expect(hq.hp).toBe(hq.maxHp);
    expect(hq.maxHp).toBeGreaterThan(BUILDINGS.hq.maxHp);
    // a partida começa só com o explorador: cria infantaria própria para modernizar
    expect(await cmd({ type: 'sandbox_spawn', unitType: 'infantry', x: hq.pos.x + 6, y: hq.pos.y, count: 3, enemy: false, maxed: false })).toBeNull();
    const mine = sim.units.filter((u) => u.owner === 0 && u.type === 'infantry').map((u) => u.id);
    expect(await cmd({ type: 'sandbox_maxout', unitIds: mine })).toBeNull();
    expect(sim.units.filter((u) => u.owner === 0 && u.type === 'infantry').every((u) => u.mods.length > 0)).toBe(true);
    expect(await cmd({ type: 'sandbox_remove', ids: [enemies[0]!.id] })).toBeNull();
    expect(await cmd({ type: 'sandbox_clear', who: 'enemy' })).toBeNull();
    expect(sim.units.filter((u) => u.owner === 1).length).toBe(0);
    expect(await cmd({ type: 'sandbox_remove', ids: [hq.id] })).toMatch(/QG não pode/);
  });

  it('QG não cai e a partida não termina; IA passiva até ser ligada; mapa revelado sob demanda', async () => {
    const { sim, cmd, run, room } = await sandboxRoom();
    const enemyHq = sim.buildings.find((b) => b.owner === 1 && b.type === 'hq')!;
    enemyHq.hp = -50;
    run(0.5);
    expect(room.status).toBe('playing');
    expect(enemyHq.hp).toBe(enemyHq.maxHp);
    // atacado até "morrer", o QG volta inteiro e sem aviso de destruição
    const { MISSILE } = await import('../shared/sim/air.ts');
    expect(MISSILE.damage).toBeGreaterThan(0);
    enemyHq.hp = 1;
    expect(await cmd({ type: 'sandbox_spawn', unitType: 'tank', x: enemyHq.pos.x + 6, y: enemyHq.pos.y, count: 6, enemy: false, maxed: true })).toBeNull();
    run(10);
    expect(sim.buildings.includes(enemyHq)).toBe(true);
    expect(room.status).toBe('playing');
    const aiBuildings = sim.buildings.filter((b) => b.owner === 1).length;
    run(60);
    expect(sim.buildings.filter((b) => b.owner === 1).length).toBe(aiBuildings);
    expect(await cmd({ type: 'sandbox_toggle', key: 'aiActive', value: true })).toBeNull();
    run(60);
    expect(sim.buildings.filter((b) => b.owner === 1).length).toBeGreaterThan(aiBuildings);
    // sem as próprias tropas perto da base inimiga, ela volta à névoa
    expect(await cmd({ type: 'sandbox_clear', who: 'mine' })).toBeNull();
    run(1);
    expect(sim.isVisibleTo(0, enemyHq.pos)).toBe(false);
    expect(await cmd({ type: 'sandbox_toggle', key: 'reveal', value: true })).toBeNull();
    expect(sim.isVisibleTo(0, enemyHq.pos)).toBe(true);
  }, 60_000);

  it('fora do Sandbox as ferramentas são recusadas; o Sandbox não grava histórico', async () => {
    const normal = await sandboxRoom('vs_ai');
    expect(normal.sim.sandbox).toBeNull();
    expect(await normal.cmd({ type: 'sandbox_clear', who: 'enemy' })).toMatch(/só no modo Sandbox/);
    const sb = await sandboxRoom();
    await sb.send({ t: 'surrender' });
    await vi.waitFor(() => expect(sb.room.status).toBe('ended'));
    expect(sb.records.length).toBe(0);
  });

  it('salvar e carregar mantém o Sandbox', async () => {
    const { sim } = await sandboxRoom();
    sim.sandbox!.reveal = true;
    const { Simulation } = await import('../shared/sim/Simulation.ts');
    const back = Simulation.deserialize(sim.serialize());
    expect(back.sandbox).toEqual(sim.sandbox);
  });
  it('melhoria normal sem requisitos (QG, armazém, infraestrutura) e pronta na hora; unidades no máximo com o bônus do produtor', async () => {
    const { sim, cmd, run } = await sandboxRoom();
    const hq = sim.buildings.find((b) => b.owner === 0 && b.type === 'hq')!;
    // com o QG no nível 1, a fábrica normalmente pararia no requisito de Centro de Comando
    let err: string | null = 'sem lugar';
    for (let r = 4; r < 14 && err; r++)
      for (let dy = -r; dy <= r && err; dy++)
        for (let dx = -r; dx <= r && err; dx++)
          err = sim.placementError(0, 'factory', { cx: hq.cell.cx + dx, cy: hq.cell.cy + dy }) ? err : await cmd({ type: 'build', buildingType: 'factory', cx: hq.cell.cx + dx, cy: hq.cell.cy + dy });
    expect(err).toBeNull();
    run(1);
    const factory = sim.buildings.find((b) => b.owner === 0 && b.type === 'factory')!;
    for (let l = 2; l <= maxLevelOf('factory'); l++) {
      const spec = sim.upgradePlan(factory).specChoice?.[0]?.id ?? null;
      const plan = sim.upgradePlan(factory, spec);
      expect(plan.blocker).toBeNull();
      expect(plan.seconds).toBe(0);
      expect(await cmd({ type: 'upgrade', buildingId: factory.id, ...(spec ? { spec } : {}) })).toBeNull();
      run(0.2);
      expect(factory.level).toBe(l);
    }
    expect(await cmd({ type: 'sandbox_spawn', unitType: 'tank', x: hq.pos.x + 10, y: hq.pos.y - 10, count: 1, enemy: false, maxed: true })).toBeNull();
    const tank = sim.units.filter((u) => u.owner === 0 && u.type === 'tank').at(-1)!;
    const before = tank.maxHp;
    expect(await cmd({ type: 'sandbox_maxout', unitIds: [tank.id] })).toBeNull();
    expect(tank.maxHp).toBe(before);
  });

  it('com a IA pausada o governo inimigo não faz diplomacia nem orçamento', async () => {
    const { room, run } = await sandboxRoom();
    const national = (room as unknown as { national: { diplomacy: { atWar: (a: number, b: number) => boolean } } }).national;
    run(400);
    expect(national.diplomacy.atWar(0, 1)).toBe(true);
  });
});
