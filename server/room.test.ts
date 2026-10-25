import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { parseClientMessage } from './messages.ts';
import { RoomManager } from './RoomManager.ts';
import type { MatchRecord } from './supabase.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => sent.push(JSON.parse(s) as ServerMessage),
    close: vi.fn(),
  } as unknown as WebSocket;
  const conn = new Connection(ws);
  return { conn, sent, last: <T extends ServerMessage['t']>(t: T) => sent.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined };
}

function setup(now = { t: 0 }) {
  const records: MatchRecord[] = [];
  const rooms = new RoomManager(
    {
      reconnectGraceMs: 1000,
      record: async (r) => {
        records.push(r);
        return true;
      },
      autoLoop: false,
      seed: 5,
      now: () => now.t,
    },
    10,
  );
  const deps: HandlerDeps = {
    rooms,
    allowGuests: false,
    sessions: new Map(),
    verify: async (token) => (token.startsWith('ok-') ? { id: token.slice(3), name: token.slice(3) } : null),
  };
  const send = (c: Connection, raw: object) => {
    const msg = parseClientMessage(JSON.stringify(raw));
    if (!msg) throw new Error('mensagem inválida no teste');
    return handleMessage(c, msg, deps);
  };
  return { rooms, deps, records, send, now };
}

describe('servidor de partidas', () => {
  it('recusa conexão sem token quando convidados estão desativados', async () => {
    const { send } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: null });
    expect(a.last('error')?.code).toBe('auth');
    expect(a.conn.user).toBeNull();
  });

  it('recusa token inválido e versão de protocolo diferente', async () => {
    const { send } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'bad' });
    expect(a.last('error')?.code).toBe('auth');
    const b = fakeConn();
    await send(b.conn, { t: 'hello', protocol: 999, token: 'ok-x' });
    expect(b.last('error')?.code).toBe('protocol');
  });

  it('fluxo PvP: criar, entrar, pronto, iniciar, comandar e encerrar com gravação', async () => {
    const { send, rooms, records } = setup();
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-alice' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-bob' });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
    expect(b.last('room')!.room!.players).toHaveLength(2);

    await send(a.conn, { t: 'start' });
    expect(a.last('error')?.message).toBe('Nem todos estão prontos');
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const start = b.last('match_start')!.match;
    expect(start.yourSlot).toBe(1);
    expect(start.terrain).toHaveLength(start.width * start.height);

    const room = rooms.get(code)!;
    const sim = room.sim!;
    const myUnit = sim.units.find((u) => u.owner === 0)!;
    const enemyUnit = sim.units.find((u) => u.owner === 1)!;
    // B tenta mover unidade de A: recusado pela simulação
    await send(b.conn, { t: 'cmd', cmd: { type: 'move', unitIds: [myUnit.id], x: 60, y: 60 } });
    room.advance();
    expect(b.last('cmd_rejected')).toBeDefined();
    // A move a própria unidade
    await send(a.conn, { t: 'cmd', cmd: { type: 'move', unitIds: [myUnit.id], x: myUnit.pos.x + 6, y: myUnit.pos.y } });
    room.advance();
    expect(myUnit.order.kind).toBe('move');
    expect(enemyUnit.order.kind).toBe('idle');
    expect(a.last('snapshot')!.s.units.length).toBeGreaterThan(0);

    // velocidade é fixa em PvP
    await send(a.conn, { t: 'speed', speed: 4 });
    expect(a.last('cmd_rejected')?.reason).toMatch(/Velocidade/);

    await send(b.conn, { t: 'surrender' });
    await vi.waitFor(() => expect(a.last('match_end')).toBeDefined());
    const end = a.last('match_end')!.end;
    expect(end.winnerSlot).toBe(0);
    expect(end.reason).toBe('forfeit');
    expect(end.recorded).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]!.winner_id).toBe('alice');
    expect(records[0]!.players.map((p) => p.result)).toEqual(['win', 'loss']);
  });

  it('pausa impede o avanço da simulação; reconexão restaura a partida', async () => {
    const now = { t: 0 };
    const { send, rooms, deps } = setup(now);
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-carol' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(a.last('room')!.room!.code)!;
    const loop = () => (room as unknown as { onLoop(): void }).onLoop();

    now.t += 200;
    loop();
    const t1 = room.sim!.tick;
    expect(t1).toBe(4); // 200 ms a 20 ticks/s

    await send(a.conn, { t: 'pause', paused: true });
    now.t += 2000;
    loop();
    expect(room.sim!.tick).toBe(t1);

    await send(a.conn, { t: 'pause', paused: false });
    await send(a.conn, { t: 'speed', speed: 2 });
    now.t += 100;
    loop();
    expect(room.sim!.tick).toBe(t1 + 4);

    // desconecta: em vs_ai a partida pausa automaticamente
    handleClose(a.conn, deps);
    expect(room.paused).toBe(true);
    const a2 = fakeConn();
    await send(a2.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-carol' });
    expect(a2.last('match_start')).toBeDefined();
    expect(a2.last('snapshot')).toBeDefined();
  });

  it('abandono após o prazo de reconexão encerra a partida', async () => {
    const now = { t: 0 };
    const { send, rooms, deps } = setup(now);
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-dan' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-eve' });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    handleClose(b.conn, deps);
    now.t += 1500;
    (room as unknown as { onLoop(): void }).onLoop();
    await vi.waitFor(() => expect(a.last('match_end')?.end.reason).toBe('disconnect'));
  });
});
