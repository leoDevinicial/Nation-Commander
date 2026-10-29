import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { Connection } from './Connection.ts';
import { handleMessage, type HandlerDeps } from './handler.ts';
import { parseClientMessage } from './messages.ts';
import { RoomManager } from './RoomManager.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { mapSizeFor } from '../shared/sim/matchMap.ts';

/** Partidas com mais nações (lote 4): limite grátis/assinante, bots, times e tipo de mapa. */

function fakeConn() {
  const sent: ServerMessage[] = [];
  const ws = { readyState: 1, OPEN: 1, send: (s: string) => sent.push(JSON.parse(s) as ServerMessage), close: vi.fn() } as unknown as WebSocket;
  const conn = new Connection(ws);
  return { conn, last: <T extends ServerMessage['t']>(t: T) => sent.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined };
}

function setup() {
  const rooms = new RoomManager({ reconnectGraceMs: 1000, record: async () => true, autoLoop: false, seed: 9, now: () => 0 }, 10);
  const deps: HandlerDeps = {
    rooms,
    allowGuests: false,
    sessions: new Map(),
    // "ok-sub-x": assinante
    verify: async (token) => (token.startsWith('ok-') ? { id: token.slice(3), name: token.slice(3), subscriber: token.startsWith('ok-sub-') } : null),
  };
  const send = (c: Connection, raw: object) => {
    const msg = parseClientMessage(JSON.stringify(raw));
    if (!msg) throw new Error('mensagem inválida no teste');
    return handleMessage(c, msg, deps);
  };
  return { rooms, send };
}

async function host(token: string) {
  const s = setup();
  const a = fakeConn();
  await s.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token });
  await s.send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
  return { ...s, a };
}

describe('partidas com mais nações', () => {
  it('versão grátis: até 4 nações com bots; times e tipo de mapa definem a partida', async () => {
    const { send, a, rooms } = await host('ok-alice');
    expect(a.last('room')!.room!.nationLimit).toBe(4);
    await send(a.conn, { t: 'add_bot' });
    await send(a.conn, { t: 'add_bot' });
    expect(a.last('room')!.room!.players).toHaveLength(4);
    await send(a.conn, { t: 'add_bot' });
    expect(a.last('error')?.message).toMatch(/Limite de 4/);
    const room = a.last('room')!.room!;
    // países diferentes para cada bot
    expect(new Set(room.players.map((p) => p.countryId)).size).toBe(4);
    // time 1: o jogador e o primeiro bot
    await send(a.conn, { t: 'set_team', slot: 0, team: 1 });
    await send(a.conn, { t: 'set_team', slot: 1, team: 1 });
    await send(a.conn, { t: 'set_room', mapType: 'mountains' });
    await send(a.conn, { t: 'start' });
    const start = a.last('match_start')!.match;
    expect(start.mapKind).toBe('mountains');
    expect(start.width).toBe(mapSizeFor(4));
    expect(start.spawns).toHaveLength(4);
    const sim = rooms.get(room.code)!.sim!;
    expect(sim.players).toHaveLength(4);
    expect(sim.allied(0, 1)).toBe(true);
    expect(sim.allied(0, 2)).toBe(false);
    // aliado de time não pode ser alvo de declaração de guerra
    const r = rooms.get(room.code)!;
    expect(r.national!.declareWar(0, 1)).toMatch(/Aliado de time/);
  });

  it('assinante: até 6 nações; todos no mesmo time não começa', async () => {
    const { send, a } = await host('ok-sub-bia');
    expect(a.last('room')!.room!.nationLimit).toBe(6);
    for (let i = 0; i < 5; i++) await send(a.conn, { t: 'add_bot' });
    expect(a.last('room')!.room!.players).toHaveLength(6);
    for (const p of a.last('room')!.room!.players) await send(a.conn, { t: 'set_team', slot: p.slot, team: 2 });
    await send(a.conn, { t: 'start' });
    expect(a.last('error')?.message).toMatch(/mesmo time/);
    await send(a.conn, { t: 'set_team', slot: 5, team: 3 });
    await send(a.conn, { t: 'start' });
    expect(a.last('match_start')!.match.width).toBe(mapSizeFor(6));
  });
});
