import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../../shared/version.ts';
import { MemoryMatchStore } from '../matchStore.ts';
import type { Room } from '../Room.ts';
import type { MatchRecord } from '../supabase.ts';
import { LocalServer, type LocalIdentity } from './LocalServer.ts';

/**
 * Partida contra a IA no navegador (22/11): o servidor local recebe o mesmo protocolo do remoto. Aqui sem o Web Worker:
 * o teste faz o papel do navegador (mensagens em texto, sem formato binário) e avança as salas à mão.
 */
function setup(opts: { identity?: LocalIdentity | null; store?: MemoryMatchStore } = {}) {
  const inbox = new Map<number, ServerMessage[]>();
  const closed: { cid: number; code: number }[] = [];
  const records: MatchRecord[] = [];
  const server = new LocalServer({
    post: (cid, data) => {
      if (typeof data !== 'string') throw new Error('o teste não pediu binário');
      (inbox.get(cid) ?? inbox.set(cid, []).get(cid)!).push(JSON.parse(data) as ServerMessage);
    },
    closed: (cid, code) => closed.push({ cid, code }),
    identity: () => (opts.identity === undefined ? { id: null, name: 'Comandante' } : opts.identity),
    record: async (rec) => {
      records.push(rec);
      return true;
    },
    store: opts.store ?? null,
    autoLoop: false,
    seed: 5,
  });
  const send = (cid: number, msg: object) => server.message(cid, JSON.stringify(msg));
  const got = (cid: number) => inbox.get(cid) ?? [];
  const last = <T extends ServerMessage['t']>(cid: number, t: T) => got(cid).filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const room = (): Room => (server.rooms as unknown as { rooms: Map<string, Room> }).rooms.values().next().value!;
  return { server, send, got, last, flush, room, closed, records };
}

const hello = (extra: object = {}) => ({ t: 'hello', protocol: PROTOCOL_VERSION, token: null, guestId: 'segredo-do-convidado', guestName: 'Comandante', ...extra });

describe('servidor local (partida contra a IA no navegador)', () => {
  it('convidado: hello, sala contra a IA, início, ordens e snapshots, como no servidor remoto', async () => {
    const e = setup();
    e.server.open(1);
    e.send(1, hello());
    await e.flush();
    expect(e.last(1, 'welcome')?.user.name).toBe('Comandante');
    expect(e.last(1, 'room')?.room).toBeNull();
    e.send(1, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await e.flush();
    expect(e.last(1, 'room')?.room?.mode).toBe('vs_ai');
    e.send(1, { t: 'start' });
    await e.flush();
    expect(e.last(1, 'match_start')).toBeTruthy();
    const r = e.room();
    for (let i = 0; i < 40; i++) r.advance();
    const snaps = e.got(1).filter((m) => m.t === 'snapshot');
    expect(snaps.length).toBeGreaterThan(10);
    // uma ordem de verdade: o cidadão inicial forma-se no QG
    e.send(1, { t: 'ping', n: 7 });
    expect(e.last(1, 'pong')?.n).toBe(7);
  });

  it('só a partida contra a IA roda aqui: multijogador e sandbox ficam no servidor', async () => {
    const e = setup();
    e.server.open(1);
    e.send(1, hello());
    await e.flush();
    e.send(1, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    await e.flush();
    expect(e.last(1, 'error')?.message).toMatch(/servidor/);
    expect(e.last(1, 'room')?.room).toBeNull();
  });

  it('conta logada: a identidade vem do navegador, sem validar o token', async () => {
    const e = setup({ identity: { id: 'uuid-da-conta', name: 'Ana', subscriber: true } });
    e.server.open(1);
    e.send(1, hello({ token: 'jwt-qualquer', guestId: undefined }));
    await e.flush();
    const w = e.last(1, 'welcome')!;
    expect(w.user.name).toBe('Ana');
    expect(w.user.guest).toBe(false);
  });

  it('recarregar a página: a partida gravada volta, com o mesmo tick, numa instância nova do servidor', async () => {
    const store = new MemoryMatchStore();
    const a = setup({ store });
    a.server.open(1);
    a.send(1, hello());
    await a.flush();
    a.send(1, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await a.flush();
    a.send(1, { t: 'start' });
    await a.flush();
    for (let i = 0; i < 60; i++) a.room().advance();
    const tick = a.room().tick;
    expect(await a.server.persist(true)).toBe(1);
    // página nova: outra instância, o mesmo armazenamento
    const b = setup({ store });
    b.server.open(9);
    b.send(9, hello());
    await new Promise((r) => setTimeout(r, 20));
    expect(b.last(9, 'room')?.room?.mode).toBe('vs_ai');
    expect(b.room().tick).toBe(tick);
    const snap = b.last(9, 'snapshot');
    expect(snap?.s && 'tick' in snap.s ? snap.s.tick : -1).toBe(tick);
  });

  it('render-se encerra a partida e o resultado sai para o histórico (com conta; só convidados não grava, como no remoto)', async () => {
    const e = setup({ identity: { id: 'uuid-da-conta', name: 'Ana' } });
    e.server.open(1);
    e.send(1, hello({ token: 'jwt', guestId: undefined }));
    await e.flush();
    e.send(1, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await e.flush();
    e.send(1, { t: 'start' });
    await e.flush();
    for (let i = 0; i < 20; i++) e.room().advance();
    e.send(1, { t: 'surrender' });
    await e.flush();
    for (let i = 0; i < 5; i++) e.room().advance();
    await new Promise((r) => setTimeout(r, 20));
    expect(e.last(1, 'match_end')).toBeTruthy();
    expect(e.records.length).toBe(1);
    expect(e.records[0]!.mode).toBe('vs_ai');
    expect(e.records[0]!.players.find((p) => !p.is_ai)?.player_id).toBe('uuid-da-conta');
  });
});
