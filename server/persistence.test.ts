import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { TacticalAI } from '../shared/sim/TacticalAI.ts';
import { NationalSimulation } from '../shared/strategic/NationalSimulation.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { decodeSave, encodeSave, FileMatchStore, MemoryMatchStore } from './matchStore.ts';
import { parseClientMessage } from './messages.ts';
import { RESTORE_GRACE_MS, type Room } from './Room.ts';
import { RoomManager } from './RoomManager.ts';
import type { MatchRecord } from './supabase.ts';

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

/** Um "processo" de servidor: gerenciador de salas com o armazenamento compartilhado. */
function server(store: MemoryMatchStore, now: { t: number }) {
  const records: MatchRecord[] = [];
  const rooms = new RoomManager(
    {
      reconnectGraceMs: 1000,
      record: async (r) => {
        records.push(r);
        return true;
      },
      autoLoop: false,
      seed: 11,
      now: () => now.t,
    },
    10,
    store,
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
  return { rooms, deps, send, records };
}

const state = (room: Room) => {
  const s = room.toSave()!;
  return { sim: s.sim, national: JSON.stringify(s.national), ops: JSON.stringify(s.ops), ais: JSON.stringify(s.ais) };
};

describe('partidas salvas no servidor', () => {
  it('reinício do servidor: a partida volta exatamente de onde parou e segue idêntica', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s1 = server(store, now);
    const a = fakeConn();
    await s1.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    await s1.send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await s1.send(a.conn, { t: 'start' });
    const code = a.last('room')!.room!.code;
    const room1 = s1.rooms.get(code)!;
    // um pouco de tudo: guerra com país da IA, dias de economia e decisões da IA tática
    const usa = a.last('national')!.diplomacy.nations.find((n) => n.countryId === 'USA')!.id;
    await s1.send(a.conn, { t: 'national', cmd: { type: 'diplomacy', action: { type: 'declare_war', target: usa } } });
    for (let i = 0; i < 1200; i++) room1.advance();
    expect(room1.national!.diplomacy.atWar(0, usa)).toBe(true);

    // encerramento: congela e grava o estado final
    expect(await s1.rooms.shutdown()).toBe(1);
    expect(store.rows.has(code)).toBe(true);

    // servidor novo, mesmo armazenamento: nada em memória até o jogador voltar
    const s2 = server(store, now);
    expect(s2.rooms.size).toBe(0);
    const a2 = fakeConn();
    await s2.send(a2.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    const room2 = s2.rooms.get(code)!;
    expect(room2).toBeDefined();
    expect(room2.tick).toBe(room1.tick);
    expect(a2.last('match_start')?.match.yourSlot).toBe(0);
    expect(a2.last('snapshot')).toBeDefined();
    expect(a2.last('national')?.diplomacy.wars.some(([x, y]) => x === usa || y === usa)).toBe(true);
    // a pausa automática da retomada termina com o jogador de volta
    expect(room2.paused).toBe(false);

    // continuar das duas é idêntico (simulação, economia, diplomacia, operações e IA)
    expect(state(room2)).toEqual(state(room1));
    for (let i = 0; i < 600; i++) {
      room1.advance();
      room2.advance();
    }
    expect(state(room2)).toEqual(state(room1));
  }, 60_000);

  it('reinício no meio de uma batalha local: o jogador volta direto para a batalha', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s1 = server(store, now);
    const a = fakeConn();
    await s1.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-op' });
    await s1.send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await s1.send(a.conn, { t: 'start' });
    const code = a.last('room')!.room!.code;
    const room1 = s1.rooms.get(code)!;
    const sim = room1.sim!;
    const usa = a.last('national')!.diplomacy.nations.find((n) => n.countryId === 'USA')!.id;
    await s1.send(a.conn, { t: 'national', cmd: { type: 'diplomacy', action: { type: 'declare_war', target: usa } } });
    for (let i = 0; i < 21; i++) room1.advance();
    sim.players[0]!.resources.oil = 100;
    sim.players[0]!.oilReserve = 100;
    const sector = a.last('operations')!.ops.wars.find((w) => w.target === usa)!.sectors[0]!.id;
    const mine = sim.units.filter((u) => u.owner === 0).map((u) => u.id);
    await s1.send(a.conn, { t: 'cmd', cmd: { type: 'launch_operation', target: usa, sectorId: sector, unitIds: mine } });
    room1.advance();
    const op = a.last('operations')!.ops.ops[0]!;
    for (let i = 0; i < op.travelDays * 20 + 30; i++) room1.advance();
    expect(a.last('battle_start')).toBeDefined();
    await s1.rooms.shutdown();

    const s2 = server(store, now);
    const a2 = fakeConn();
    await s2.send(a2.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-op' });
    const room2 = s2.rooms.get(code)!;
    expect(a2.last('battle_start')?.battle.opId).toBe(op.id);
    expect(state(room2)).toEqual(state(room1));
    for (let i = 0; i < 200; i++) {
      room1.advance();
      room2.advance();
    }
    expect(state(room2)).toEqual(state(room1));
  }, 60_000);

  it('PvP retomado: prazo de reconexão estendido; quem não volta perde por abandono e o salvamento some', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s1 = server(store, now);
    const a = fakeConn();
    const b = fakeConn();
    await s1.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-bia' });
    await s1.send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-caio' });
    await s1.send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await s1.send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
    await s1.send(b.conn, { t: 'set_ready', ready: true });
    await s1.send(a.conn, { t: 'start' });
    for (let i = 0; i < 100; i++) s1.rooms.get(code)!.advance();
    await s1.rooms.shutdown();

    const s2 = server(store, now);
    const a2 = fakeConn();
    await s2.send(a2.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-bia' });
    const room = s2.rooms.get(code)!;
    const loop = () => (room as unknown as { onLoop(): void }).onLoop();
    // o adversário ainda não voltou: o prazo normal (1 s) não vale logo após a retomada
    now.t += 5000;
    loop();
    expect(room.status).toBe('playing');
    // o segundo jogador acha a mesma sala (sem retomar outra cópia)
    const b2 = fakeConn();
    await s2.send(b2.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-caio' });
    expect(s2.rooms.size).toBe(1);
    expect(b2.last('match_start')?.match.yourSlot).toBe(1);
    // ele cai de novo e não volta: abandono depois do prazo estendido
    handleClose(b2.conn, s2.deps);
    now.t += RESTORE_GRACE_MS + 2000;
    loop();
    await vi.waitFor(() => expect(a2.last('match_end')?.end.reason).toBe('disconnect'));
    expect(store.rows.has(code)).toBe(false);
  });

  it('salvamento ilegível é descartado sem derrubar o servidor; o jogador vai para o menu', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    await store.save('ZZZZZ', ['dora'], encodeSave({ format: 1 } as never));
    const s = server(store, now);
    const a = fakeConn();
    await s.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-dora' });
    expect(a.last('room')?.room).toBeNull();
    expect(store.rows.has('ZZZZZ')).toBe(false);
  });

  it('sala pausada não é regravada; gravação comprime o estado', async () => {
    const now = { t: 0 };
    const store = new MemoryMatchStore(() => now.t);
    const s = server(store, now);
    const a = fakeConn();
    await s.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-eli' });
    await s.send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'ARG' });
    await s.send(a.conn, { t: 'start' });
    const room = s.rooms.get(a.last('room')!.room!.code)!;
    for (let i = 0; i < 40; i++) room.advance();
    expect(await s.rooms.persistAll()).toBe(1);
    expect(await s.rooms.persistAll()).toBe(0);
    const blob = store.rows.get(room.code)!.blob;
    const save = decodeSave(blob);
    expect(save.code).toBe(room.code);
    expect(blob.length).toBeLessThan(JSON.stringify(save).length / 3);
  });
});

describe('salvar e carregar as camadas da partida', () => {
  it('simulação nacional (economia, pesquisa, diplomacia) continua idêntica depois de carregar', () => {
    const players = [
      { slot: 0, countryId: 'BRA' },
      { slot: 1, countryId: 'ARG' },
    ];
    const a = new NationalSimulation(players, 42, 'parity');
    const link = { resources: () => ({ supplies: 1e6, food: 0, wood: 0, stone: 0, iron: 0, oil: 1e6 }), spend: () => {}, setWar: () => {} };
    a.attachTheater(link);
    a.setResearch(0, 'logistics');
    for (let d = 0; d < 120; d++) a.stepDay();
    const usa = a.npcs.find((n) => n.countryId === 'USA')!.slot;
    a.declareWar(0, usa);
    const b = new NationalSimulation(players, 42, 'parity');
    b.attachTheater(link);
    b.load(a.toSave());
    expect(b.toSave()).toEqual(a.toSave());
    for (let d = 0; d < 200; d++) {
      a.stepDay();
      b.stepDay();
    }
    expect(b.toSave()).toEqual(a.toSave());
    expect(b.diplomacy.atWar(0, usa)).toBe(true);
  });

  it('IA tática guarda a memória das ondas (inclusive o "nunca atacou")', () => {
    const ai = new TacticalAI(1);
    const fresh = ai.toSave();
    expect(fresh.lastWaveTick).toBeNull();
    const b = new TacticalAI(1);
    b.load({ ...fresh, waveSize: 9, attacking: true, lastWaveTick: 1234, wantsWarWith: 0 });
    expect(b.toSave()).toEqual({ ...fresh, waveSize: 9, attacking: true, lastWaveTick: 1234, wantsWarWith: 0 });
  });

  it('armazenamento em arquivos: grava, acha pelo jogador e apaga', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nc-saves-'));
    try {
      const store = new FileMatchStore(dir);
      await store.save('ABCDE', ['u1', 'u2'], 'blob-1');
      await store.save('FGHJK', ['u3'], 'blob-2');
      expect((await store.findByUser('u2'))?.blob).toBe('blob-1');
      expect((await store.findByUser('u3'))?.code).toBe('FGHJK');
      expect(await store.findByUser('nada')).toBeNull();
      await store.remove('ABCDE');
      expect(await store.findByUser('u1')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
