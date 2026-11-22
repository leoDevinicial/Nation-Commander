import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { SnapshotDeltaDecoder, isDelta } from '../shared/net/delta.ts';
import { decodeSnapshotFrame } from '../shared/net/wire.ts';
import type { ServerMessage } from '../shared/protocol.ts';
import type { Snapshot } from '../shared/sim/snapshot.ts';
import type { Slot } from '../shared/sim/types.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { NetworkGuard } from './kac/network.ts';
import { parseClientMessage } from './messages.ts';
import type { Room } from './Room.ts';
import { RoomManager } from './RoomManager.ts';

/**
 * Comunicação (21/11): formato binário para quem pede, envio por área da câmera e reconexão com a diferença desde o
 * último ponto de retomada. Aqui com o servidor de verdade (sala, simulação e encoder).
 */

/** Conexão falsa que entende texto e binário e remonta os snapshots como o navegador. */
function client(dec = new SnapshotDeltaDecoder()) {
  const sent: ServerMessage[] = [];
  const raw: (string | Uint8Array)[] = [];
  const firstSnapshotDelta: boolean[] = [];
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (d: string | Uint8Array) => {
      raw.push(d);
      const m = (typeof d === 'string' ? JSON.parse(d) : decodeSnapshotFrame(d)) as ServerMessage;
      if (m.t === 'snapshot' && !m.scope) {
        firstSnapshotDelta.push(isDelta(m.s as never));
        const s = dec.apply(m.s as never);
        if (!s) return;
        sent.push({ ...m, s });
      } else sent.push(m);
    },
    close: vi.fn(),
  } as unknown as WebSocket;
  return {
    conn: new Connection(ws),
    sent,
    raw,
    dec,
    firstSnapshotDelta,
    snap: () => (sent.filter((m) => m.t === 'snapshot').at(-1) as { s: Snapshot } | undefined)?.s,
  };
}

function setup() {
  const now = { t: 0 };
  const rooms = new RoomManager({ reconnectGraceMs: 60_000, record: async () => true, autoLoop: false, seed: 9, now: () => now.t }, 10);
  const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t }) };
  const send = (c: Connection, raw: object) => {
    const m = parseClientMessage(JSON.stringify(raw));
    if (!m) throw new Error('mensagem inválida no teste');
    return handleMessage(c, m, deps);
  };
  return { rooms, deps, send, now };
}

/** Partida contra a IA com um exército grande andando, para haver muitas tropas mudando a cada envio. */
async function match(env: ReturnType<typeof setup>, hello: object = {}) {
  const a = client();
  await env.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana', ...hello });
  await env.send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
  await env.send(a.conn, { t: 'start' });
  const room = [...(env.rooms as unknown as { rooms: Map<string, Room> }).rooms.values()][0]!;
  const sim = room.sim!;
  const me = 0 as Slot;
  const hq = sim.hqOf(me)!.pos;
  for (let i = 0; i < 60; i++) sim.addUnit('infantry', me, { x: hq.x + (i % 10) * 0.8, y: hq.y + 6 + Math.floor(i / 10) * 0.8 });
  const ids = sim.units.filter((u) => u.owner === me).map((u) => u.id);
  sim.applyCommand(me, { type: 'move', unitIds: ids, x: hq.x + 30, y: hq.y + 30 });
  return { a, room, sim, me };
}

describe('comunicação com o servidor (21/11)', () => {
  it('quem pede binário recebe quadros binários e monta o mesmo estado das tropas', async () => {
    const env = setup();
    const { a, room, sim, me } = await match(env, { bin: true });
    for (let i = 0; i < 40; i++) room.advance();
    expect(a.raw.some((d) => typeof d !== 'string')).toBe(true);
    const s = a.snap()!;
    for (const u of sim.units.filter((x) => x.owner === me)) {
      const got = s.units.find((x) => x.id === u.id)!;
      expect(got.x).toBeCloseTo(u.pos.x, 1);
      expect(got.y).toBeCloseTo(u.pos.y, 1);
    }
  });

  it('sem pedir, tudo continua em texto (navegador antigo)', async () => {
    const env = setup();
    const { a, room } = await match(env);
    for (let i = 0; i < 20; i++) room.advance();
    expect(a.raw.every((d) => typeof d === 'string')).toBe(true);
  });

  it('área da câmera: tropas longe dela esperam a vez (1 a cada 4 envios) e nunca ficam mais atrasadas que isso', async () => {
    const env = setup();
    const { a, room, sim, me } = await match(env, { bin: true });
    room.advance();
    room.advance();
    // câmera olhando para um canto longe do exército
    await env.send(a.conn, { t: 'view', rect: [0, 0, 10, 10] });
    const enc = (room as unknown as { deltas: Map<Slot, { deferred: number }> }).deltas.get(me)!;
    let deferred = 0;
    for (let i = 0; i < 16; i++) {
      room.advance();
      deferred += enc.deferred;
    }
    expect(deferred).toBeGreaterThan(100);
    // em no máximo 4 envios (8 ticks) cada tropa recebe a posição atual: anda no máximo isso de atraso
    const s = a.snap()!;
    for (const u of sim.units.filter((x) => x.owner === me)) {
      const got = s.units.find((x) => x.id === u.id)!;
      expect(Math.hypot(got.x - u.pos.x, got.y - u.pos.y)).toBeLessThan(1.5);
    }
    // a câmera volta para o exército (ou o navegador manda null): ninguém espera
    await env.send(a.conn, { t: 'view', rect: null });
    room.advance();
    room.advance();
    expect(enc.deferred).toBe(0);
  });

  it('reconexão: com o ponto de retomada desta partida vem só a diferença, e o estado bate com o completo', async () => {
    const env = setup();
    const { a, room } = await match(env, { bin: true });
    for (let i = 0; i < 70; i++) room.advance();
    const seed = String((room as unknown as { seed: number }).seed);
    handleClose(a.conn, env.deps);
    for (let i = 0; i < 6; i++) room.advance();
    // o navegador volta ao último ponto de retomada que montou e pede a diferença a partir dele
    const tick = a.dec.rewind();
    expect(tick).toBe(60);
    const b = client(a.dec);
    await env.send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana', bin: true, resume: { tick, key: seed } });
    expect(b.firstSnapshotDelta[0]).toBe(true);
    const resumed = b.snap()!;
    expect(resumed.tick).toBe(room.sim!.tick);
    // o mesmo instante pedido sem ponto de retomada (completo) tem exatamente as mesmas tropas, prédios e nações
    handleClose(b.conn, env.deps);
    const c = client();
    await env.send(c.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana', bin: true });
    expect(c.firstSnapshotDelta[0]).toBe(false);
    const full = c.snap()!;
    expect(full.tick).toBe(resumed.tick);
    expect(resumed.units).toEqual(full.units);
    expect(resumed.buildings).toEqual(full.buildings);
    expect(resumed.players).toEqual(full.players);
    // ponto de retomada de outra partida (ou que o servidor não guarda): completo
    handleClose(c.conn, env.deps);
    const d = client();
    await env.send(d.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana', bin: true, resume: { tick: 60, key: 'outra' } });
    expect(d.firstSnapshotDelta[0]).toBe(false);
    handleClose(d.conn, env.deps);
    const e = client();
    await env.send(e.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana', bin: true, resume: { tick: 40_000, key: seed } });
    expect(e.firstSnapshotDelta[0]).toBe(false);
  });

  it('mensagem que chega antes do hello terminar nunca manda sair da conta (22/11)', async () => {
    const env = setup();
    // o hello com conta espera a verificação do token: a área da câmera chega no meio
    let release!: () => void;
    env.deps.verify = (t) => new Promise((r) => (release = () => r({ id: t, name: t })));
    const a = client();
    const hello = env.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana', bin: true });
    await env.send(a.conn, { t: 'view', rect: [0, 0, 10, 10] });
    await env.send(a.conn, { t: 'list_rooms' });
    release();
    await hello;
    const errors = a.sent.filter((m) => m.t === 'error') as { code: string }[];
    expect(errors.map((e) => e.code)).not.toContain('auth');
    expect(errors.map((e) => e.code)).toEqual(['not_ready']);
    expect(a.sent.some((m) => m.t === 'welcome')).toBe(true);
  });

  it('retângulo vazio da câmera vale como "sem área", não como mensagem inválida (22/11)', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'view', rect: [0, 0, 0, 0] }))).toEqual({ t: 'view', rect: null });
    expect(parseClientMessage(JSON.stringify({ t: 'view', rect: [5, 5, 1, 9] }))).toEqual({ t: 'view', rect: null });
    expect(parseClientMessage(JSON.stringify({ t: 'view', rect: [0, 0, 'x', 1] }))).toBeNull();
  });
});
