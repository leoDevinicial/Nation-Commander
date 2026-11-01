import { describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import type { ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { Connection } from './Connection.ts';
import { handleMessage, type HandlerDeps } from './handler.ts';
import { NetworkGuard } from './kac/network.ts';
import { KNPS_DEFLATE, KNPS_SEND_QUEUE_LIMIT } from './knps/transport.ts';
import { RollingSamples } from './knps/stats.ts';
import { parseClientMessage } from './messages.ts';
import type { Room } from './Room.ts';
import { RoomManager } from './RoomManager.ts';

/** Servidor WebSocket local com as mesmas opções do servidor de jogo (compressão e limite de payload). */
async function localServer(): Promise<{ wss: WebSocketServer; url: string }> {
  const wss = new WebSocketServer({ port: 0, maxPayload: 16 * 1024, perMessageDeflate: KNPS_DEFLATE });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  // como no servidor de jogo: erro de uma conexão (ex.: mensagem grande demais) fica nela
  wss.on('connection', (ws) => ws.on('error', () => {}));
  return { wss, url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}` };
}

/** Snapshot parecido com o real: a mesma estrutura mudando um pouco a cada envio. */
function fakeSnapshot(tick: number): string {
  const units = Array.from({ length: 120 }, (_, i) => ({
    id: 1000 + i,
    type: i % 3 ? 'infantry' : 'tank',
    owner: i % 4,
    x: 10 + i + Math.sin(tick + i) * 0.2,
    y: 30 + (i % 9),
    hp: 100 - (i % 7),
    activity: 'idle',
  }));
  return JSON.stringify({ t: 'snapshot', s: { tick, units, buildings: [], events: [] }, paused: false, speed: 1, pausedBy: null });
}

describe('KNPS-01: compressão do transporte', () => {
  it('o cliente negocia permessage-deflate e os snapshots viajam com uma fração do tamanho', async () => {
    const { wss, url } = await localServer();
    let serverWs: WebSocket | null = null;
    wss.on('connection', (ws) => (serverWs = ws));
    const client = new WebSocket(url);
    await new Promise<void>((r) => client.once('open', () => r()));
    expect(client.extensions).toContain('permessage-deflate');
    let got = 0;
    client.on('message', () => got++);
    let raw = 0;
    for (let t = 0; t < 40; t++) {
      const json = fakeSnapshot(t);
      raw += json.length;
      serverWs!.send(json);
    }
    await new Promise<void>((r) => {
      const wait = () => (got >= 40 ? r() : setTimeout(wait, 5));
      wait();
    });
    const wire = (serverWs! as unknown as { _socket: { bytesWritten: number } })._socket.bytesWritten;
    // com contexto entre mensagens, bem menos que um quinto do original
    expect(wire / raw).toBeLessThan(0.2);
    client.close();
    wss.close();
  });

  it('o limite de tamanho vale para o conteúdo descomprimido (bomba de compressão é recusada)', async () => {
    const { wss, url } = await localServer();
    const client = new WebSocket(url, { perMessageDeflate: true });
    await new Promise<void>((r) => client.once('open', () => r()));
    const closed = new Promise<number>((r) => client.once('close', (code) => r(code)));
    // 200 KB de zeros comprimem para poucos bytes, mas passam do limite de 16 KB depois de abertos
    client.send('0'.repeat(200 * 1024));
    expect(await closed).toBe(1009);
    wss.close();
  });
});

function room(): { conn: Connection; sent: ServerMessage[]; ws: { bufferedAmount: number }; room: Room; send: (raw: object) => Promise<void> } {
  const sent: ServerMessage[] = [];
  const ws = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: (s: string) => sent.push(JSON.parse(s) as ServerMessage), close: () => {} };
  const conn = new Connection(ws as unknown as WebSocket);
  const rooms = new RoomManager({ reconnectGraceMs: 60_000, record: async () => true, autoLoop: false, seed: 3, now: () => 0 }, 10);
  const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t }) };
  const send = (raw: object) => handleMessage(conn, parseClientMessage(JSON.stringify(raw))!, deps);
  return {
    conn,
    sent,
    ws,
    send,
    get room() {
      return [...(rooms as unknown as { rooms: Map<string, Room> }).rooms.values()][0]!;
    },
  };
}

const snaps = (sent: ServerMessage[]) => sent.filter((m): m is Extract<ServerMessage, { t: 'snapshot' }> => m.t === 'snapshot');

describe('KNPS-03: resposta imediata às ordens', () => {
  it('a ordem aplicada num tick fora da cadência gera um snapshot já naquele tick, sem eventos (eles vão no próximo)', async () => {
    const r = room();
    await r.send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana' });
    await r.send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await r.send({ t: 'start' });
    r.room.advance();
    // o próximo tick precisa ser fora da cadência (ímpar): parte de um tick par
    if (r.room.tick % 2 === 1) r.room.advance();
    const before = snaps(r.sent).length;
    const mine = snaps(r.sent)
      .at(-1)!
      .s.units.find((u) => u.owner === 0)!;
    await r.send({ t: 'cmd', cmd: { type: 'move', unitIds: [mine.id], x: mine.x + 3, y: mine.y } });
    r.room.advance();
    expect(r.room.tick % 2).toBe(1);
    const after = snaps(r.sent);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.s.tick).toBe(r.room.tick);
    expect(after.at(-1)!.s.events).toEqual([]);
    expect(r.room.knps.summary().quick).toBe(1);
    // sem ordem, o tick ímpar seguinte não gera snapshot extra
    r.room.advance();
    const n = snaps(r.sent).length;
    r.room.advance();
    expect(r.room.tick % 2).toBe(1);
    expect(snaps(r.sent).length).toBe(n);
  });
});

describe('KNPS-02: fila de saída cheia', () => {
  it('pula o snapshot da conexão congestionada, guarda os eventos e manda tudo quando a fila esvazia', async () => {
    const r = room();
    await r.send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana' });
    await r.send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await r.send({ t: 'start' });
    for (let i = 0; i < 4; i++) r.room.advance();
    const sim = (r.room as unknown as { sim: { tick: number } }).sim;
    const events = (r.room as unknown as { events: unknown[] }).events;
    r.ws.bufferedAmount = KNPS_SEND_QUEUE_LIMIT + 1;
    const n = snaps(r.sent).length;
    // um evento qualquer pendente para o próximo snapshot
    const mine = snaps(r.sent)
      .at(-1)!
      .s.units.find((u) => u.owner === 0)!;
    events.push({ type: 'unit_produced', tick: sim.tick, owner: 0, unitId: mine.id, unitType: mine.type, pos: { x: mine.x, y: mine.y }, knpsProbe: true });
    for (let i = 0; i < 6; i++) r.room.advance();
    expect(snaps(r.sent).length).toBe(n);
    expect(r.room.knps.summary().skipped).toBeGreaterThan(0);
    r.ws.bufferedAmount = 0;
    for (let i = 0; i < 2; i++) r.room.advance();
    const next = snaps(r.sent).slice(n);
    expect(next.length).toBeGreaterThan(0);
    // o evento guardado chegou uma vez só, e o território veio de novo
    const probes = next.flatMap((m) => m.s.events).filter((e) => (e as { knpsProbe?: boolean }).knpsProbe);
    expect(probes.length).toBe(1);
    expect(next[0]!.s.territory).toBeDefined();
  });
});

describe('KNPS: amostras do servidor', () => {
  it('percentis numa janela fixa', () => {
    const s = new RollingSamples(10);
    for (let i = 1; i <= 25; i++) s.push(i);
    expect(s.count).toBe(10);
    expect(s.pct(0.5)).toBe(21);
    expect(s.pct(0.95)).toBe(25);
  });
});

describe('KNPS-08: região do servidor', () => {
  it('lê a região do ambiente e recusa letra fora do alfabeto dos códigos', async () => {
    const { regionFromEnv } = await import('./knps/region.ts');
    expect(regionFromEnv({ KNPS_REGION: 'us-east', KNPS_REGION_LABEL: 'Virgínia (EUA)', KNPS_REGION_LETTER: 'v' })).toEqual({
      id: 'us-east',
      label: 'Virgínia (EUA)',
      letter: 'V',
    });
    // O e o 0 não existem nos códigos (ambíguos): a letra é ignorada
    expect(regionFromEnv({ KNPS_REGION: 'x', KNPS_REGION_LETTER: 'O' }).letter).toBe('');
    expect(regionFromEnv({})).toEqual({ id: '', label: '', letter: '' });
  });

  it('com a letra configurada, todo código de sala começa com ela', async () => {
    const mgr = new RoomManager({ reconnectGraceMs: 1000, record: async () => true, autoLoop: false, seed: 1, now: () => 0 }, 50);
    mgr.codePrefix = 'V';
    for (let i = 0; i < 20; i++) {
      const ws = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: () => {}, close: () => {} };
      const c = new Connection(ws as unknown as WebSocket);
      c.user = { id: `u${i}`, name: `u${i}`, guest: false };
      const made = mgr.create(c, 'vs_ai', 'BRA');
      expect(typeof made).not.toBe('string');
      expect((made as Room).code).toMatch(/^V[A-Z2-9]{4}$/);
    }
  });

  it('ping de rede medido pelo servidor: mediana, pings perdidos e o agregado sem identidade', async () => {
    const { RttTracker, RegionTelemetry } = await import('./knps/region.ts');
    const t = new RttTracker();
    for (const [sent, back] of [
      [0, 80],
      [5000, 5090],
      [10000, 10070],
    ]) {
      t.sent(sent!);
      t.pong(back!);
    }
    expect(t.median).toBe(80);
    t.sent(15000);
    t.sent(20000);
    expect(t.missed).toBe(1);
    expect(t.pong(20120)).toBe(120);
    expect(t.missed).toBe(0);
    // pong sem ping pendente não vale
    expect(t.pong(30000)).toBeNull();
    const agg = new RegionTelemetry();
    for (const m of [40, 120, 130, 220, 400]) agg.record(m);
    expect(agg.summary()).toEqual({ '<50ms': 1, '<100ms': 0, '<150ms': 2, '<200ms': 0, '<300ms': 1, '>=300ms': 1 });
  });

  it('o lobby mostra o ping de rede de cada humano (arredondado), nunca de bot', async () => {
    const r = room();
    await r.send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana' });
    r.conn.rtt.sent(0);
    r.conn.rtt.pong(123);
    await r.send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    const info = r.sent.filter((m): m is Extract<ServerMessage, { t: 'room' }> => m.t === 'room').at(-1)!.room!;
    expect(info.players.find((p) => !p.isAI)!.ping).toBe(125);
    expect(info.players.filter((p) => p.isAI).every((p) => p.ping === undefined)).toBe(true);
  });
});
