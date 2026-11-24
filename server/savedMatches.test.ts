import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { decodedMessages } from '../shared/net/delta.ts';
import { SAVED_MATCHES, type ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { NetworkGuard } from './kac/network.ts';
import { MemoryMatchStore } from './matchStore.ts';
import { parseClientMessage } from './messages.ts';
import type { Room } from './Room.ts';
import { RoomManager } from './RoomManager.ts';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const dec = decodedMessages<ServerMessage>();
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => void ((m) => m && sent.push(m))(dec(JSON.parse(s) as ServerMessage)),
    close: vi.fn(),
  } as unknown as WebSocket;
  const conn = new Connection(ws);
  return { conn, sent, last: <T extends ServerMessage['t']>(t: T) => sent.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined };
}

function server(store: MemoryMatchStore | null, now: { t: number }) {
  const rooms = new RoomManager({ reconnectGraceMs: 1000, record: async () => true, autoLoop: false, seed: 11, now: () => now.t }, 10, store);
  const deps: HandlerDeps = {
    rooms,
    allowGuests: false,
    sessions: new Map(),
    network: new NetworkGuard(),
    verify: async (token) => (token.startsWith('ok-') ? { id: token.slice(3), name: token.slice(3) } : null),
  };
  const send = (c: Connection, raw: object) => {
    const msg = parseClientMessage(JSON.stringify(raw));
    if (!msg) throw new Error(`mensagem inválida no teste: ${JSON.stringify(raw)}`);
    return handleMessage(c, msg, deps);
  };
  return { rooms, send, deps };
}

/** O laço da sala (os testes não têm o temporizador). */
const loop = (room: Room) => (room as unknown as { onLoop(): void }).onLoop();
const flush = () => new Promise((r) => setTimeout(r, 0));

async function pvp(s: ReturnType<typeof server>) {
  const a = fakeConn();
  const b = fakeConn();
  await s.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
  await s.send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-bia' });
  await s.send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
  const code = a.last('room')!.room!.code;
  await s.send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
  await s.send(b.conn, { t: 'set_ready', ready: true });
  await s.send(a.conn, { t: 'start' });
  const room = s.rooms.get(code)!;
  for (let i = 0; i < 40; i++) room.advance();
  return { a, b, code, room };
}

describe('partidas salvas pelo jogador (salvar e sair)', () => {
  it('contra a IA: salva na hora, some da memória, não volta sozinha e reabre pelo menu de onde parou', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s = server(store, now);
    const a = fakeConn();
    await s.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    await s.send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await s.send(a.conn, { t: 'start' });
    const code = a.last('room')!.room!.code;
    const room = s.rooms.get(code)!;
    for (let i = 0; i < 60; i++) room.advance();
    const tick = room.tick;
    await s.send(a.conn, { t: 'suspend', action: 'request' });
    await flush();
    expect(a.last('suspended')?.code).toBe(code);
    expect(a.last('room')?.room).toBeNull();
    expect(s.rooms.get(code)).toBeUndefined();
    expect(store.rows.has(`~${code}`)).toBe(true);
    expect(store.rows.has(code)).toBe(false);

    // reconectar não retoma sozinho (é o jogador quem escolhe continuar)
    const a2 = fakeConn();
    await s.send(a2.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    expect(a2.last('room')?.room).toBeNull();
    await s.send(a2.conn, { t: 'saved_list' });
    const list = a2.last('saved_list')!.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code, mode: 'vs_ai' });
    expect(list[0]!.players.find((p) => p.me)?.countryId).toBe('BRA');

    await s.send(a2.conn, { t: 'saved_resume', code });
    const back = s.rooms.get(code)!;
    expect(back.tick).toBe(tick);
    expect(a2.last('room')?.room?.status).toBe('playing');
    // único comandante de volta: a partida continua
    expect(back.awaitingAll).toBe(false);
    back.advance();
    expect(back.tick).toBe(tick + 1);
    expect(store.rows.has(`~${code}`)).toBe(false);
  });

  it('entre humanos: todos precisam aceitar; recusa ou prazo mantêm a partida', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s = server(store, now);
    const { a, b, code, room } = await pvp(s);

    await s.send(a.conn, { t: 'suspend', action: 'request' });
    expect(b.last('suspend_vote')).toMatchObject({ by: 'ana', waiting: ['bia'] });
    expect(room.toSave()).not.toBeNull();
    await s.send(b.conn, { t: 'suspend', action: 'decline' });
    expect(a.last('suspend_vote_end')?.reason).toMatch(/recusou/);
    expect(s.rooms.get(code)).toBe(room);

    // pedido de novo só depois da espera
    await s.send(a.conn, { t: 'suspend', action: 'request' });
    expect(a.last('cmd_rejected')?.reason).toMatch(/tente de novo/);
    now.t += 61_000;
    await s.send(a.conn, { t: 'suspend', action: 'request' });
    now.t += SAVED_MATCHES.voteMs + 1;
    loop(room);
    expect(b.last('suspend_vote_end')?.reason).toMatch(/a tempo/);
    expect(s.rooms.get(code)).toBe(room);

    now.t += 61_000;
    await s.send(b.conn, { t: 'suspend', action: 'request' });
    await s.send(a.conn, { t: 'suspend', action: 'accept' });
    await flush();
    expect(a.last('suspended')?.code).toBe(code);
    expect(b.last('suspended')?.code).toBe(code);
    expect(s.rooms.get(code)).toBeUndefined();
  });

  it('reaberta: ninguém perde por ausência; o outro é avisado; volta todo mundo e ela continua', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s = server(store, now);
    const { a, b, code } = await pvp(s);
    await s.send(a.conn, { t: 'suspend', action: 'request' });
    await s.send(b.conn, { t: 'suspend', action: 'accept' });
    await flush();

    now.t += 3 * 24 * 60 * 60_000; // três dias depois
    await s.send(a.conn, { t: 'saved_resume', code });
    const room = s.rooms.get(code)!;
    expect(b.last('saved_invite')).toMatchObject({ code, by: 'ana' });
    expect(room.awaitingAll).toBe(true);
    const tick = room.tick;
    // muito tempo esperando a Bia, mas ninguém perde por ausência (antes do prazo de nova gravação)
    now.t += 5 * 60_000;
    loop(room);
    expect(room.status).toBe('playing');
    expect(room.tick).toBe(tick);
    await s.send(b.conn, { t: 'saved_resume', code });
    expect(room.awaitingAll).toBe(false);
    room.advance();
    expect(room.tick).toBe(tick + 1);
  });

  it('reaberta e ninguém mais volta em 10 minutos: é salva de novo', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s = server(store, now);
    const { a, b, code } = await pvp(s);
    await s.send(a.conn, { t: 'suspend', action: 'request' });
    await s.send(b.conn, { t: 'suspend', action: 'accept' });
    await flush();
    await s.send(a.conn, { t: 'saved_resume', code });
    const room = s.rooms.get(code)!;
    now.t += SAVED_MATCHES.waitMs + 1;
    loop(room);
    await flush();
    expect(s.rooms.get(code)).toBeUndefined();
    expect(store.rows.has(`~${code}`)).toBe(true);
    expect(a.last('suspended')?.code).toBe(code);
  });

  it('limites: todos conectados para votar, 5 por jogador, apagar, e só quem jogou vê ou reabre', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s = server(store, now);
    const { a, b, code, room } = await pvp(s);
    // a Bia caiu: não dá para votar sem ela
    handleClose(b.conn, s.deps);
    expect(room.status).toBe('playing');
    await s.send(a.conn, { t: 'suspend', action: 'request' });
    expect(a.last('cmd_rejected')?.reason).toMatch(/todos precisam estar conectados/);

    for (let i = 0; i < SAVED_MATCHES.maxPerUser; i++) await store.save(`~X${i}AAA`, ['ana'], 'x');
    await s.send(a.conn, { t: 'suspend', action: 'request' });
    expect(a.last('cmd_rejected')?.reason).toMatch(/já tem 5/);

    // outra pessoa não reabre nem apaga a partida dos outros
    const c = fakeConn();
    await s.send(c.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-caio' });
    await store.save(`~${code}`, ['ana', 'bia'], 'x');
    await s.send(c.conn, { t: 'saved_resume', code });
    expect(c.last('error')?.message).toMatch(/não encontrada/);
    await s.send(c.conn, { t: 'saved_delete', code });
    expect(store.rows.has(`~${code}`)).toBe(true);
    // vencida (mais de 30 dias): some da lista
    now.t += SAVED_MATCHES.maxAgeMs + 1;
    await s.send(c.conn, { t: 'saved_list' });
    expect(c.last('saved_list')!.items).toHaveLength(0);
  });

  it('a retomada automática (reinício do servidor) nunca pega uma partida salva pelo jogador', async () => {
    const store = new MemoryMatchStore(() => 0);
    await store.save('~ABCDE', ['ana'], 'x');
    expect(await store.findByUser('ana')).toBeNull();
    expect((await store.listSuspended('ana')).map((r) => r.code)).toEqual(['~ABCDE']);
  });
});
