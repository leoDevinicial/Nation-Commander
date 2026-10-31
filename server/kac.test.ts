import { NetworkGuard } from './kac/network.ts';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { Connection } from './Connection.ts';
import { handleMessage, type HandlerDeps } from './handler.ts';
import { parseClientMessage } from './messages.ts';
import { RoomManager } from './RoomManager.ts';
import { guestIdentity } from './kac/identity.ts';
import { kacJournal } from './kac/journal.ts';
import { PAUSE_POLICY } from './kac/policy.ts';
import { NETWORK_POLICY, clientIp } from './kac/network.ts';
import { publicId } from './kac/identity.ts';
import { BEHAVIOR_POLICY, BehaviorMonitor } from './kac/behavior.ts';
import { buildIntegrity, stateHash } from './kac/integrity.ts';
import { KacEventStore, STORE_POLICY, type KacEventRow, type KacStoreBackend } from './kac/store.ts';
import { ADMIN_POLICY, KacAdmin, tokenMatches } from './kac/admin.ts';
import { idCipher, newIdKey } from './kac/entityIds.ts';
import { Room } from './Room.ts';
import { KacJournal, type KacEvent } from './kac/journal.ts';

/**
 * KAC — testes adversariais: cada teste reproduz o ataque achado na auditoria (docs/kac/) e prova que ele não
 * funciona mais, sem quebrar o uso legítimo.
 */
function fakeConn() {
  const sent: ServerMessage[] = [];
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => sent.push(JSON.parse(s) as ServerMessage),
    close: vi.fn(),
  } as unknown as WebSocket;
  const conn = new Connection(ws);
  return {
    conn,
    sent,
    ws,
    last: <T extends ServerMessage['t']>(t: T) => sent.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined,
  };
}

function setup() {
  const clock = { t: 0 };
  const rooms = new RoomManager(
    {
      reconnectGraceMs: 1000,
      record: async () => true,
      autoLoop: false,
      seed: 5,
      now: () => clock.t,
    },
    10,
  );
  const deps: HandlerDeps = {
    rooms,
    allowGuests: true,
    sessions: new Map(),
    network: new NetworkGuard(),
    verify: async (token) => (token.startsWith('ok-') ? { id: token.slice(3), name: token.slice(3) } : null),
  };
  const send = (c: Connection, raw: object) => {
    const msg = parseClientMessage(JSON.stringify(raw));
    if (!msg) throw new Error('mensagem inválida no teste');
    return handleMessage(c, msg, deps);
  };
  return { rooms, deps, send, clock };
}

describe('KAC-01 — identidade dos convidados', () => {
  it('o id público vem de um hash do segredo: estável para o dono, impossível de reutilizar por quem o vê', () => {
    const secret = '6f1c2a9e-0d4b-4c7e-9a51-3b2f8e7d1c00';
    expect(guestIdentity(secret)).toBe(guestIdentity(secret));
    expect(guestIdentity(secret)).not.toContain(secret);
    expect(guestIdentity(guestIdentity(secret).slice(6))).not.toBe(guestIdentity(secret));
  });

  it('ataque: quem lê o id do convidado na sala não consegue assumir a conexão nem a vaga dele', async () => {
    const { send, rooms } = setup();
    const victim = fakeConn();
    const attacker = fakeConn();
    await send(victim.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: 'segredo-da-vitima-123',
      guestName: 'Vitima',
    });
    await send(victim.conn, {
      t: 'create_room',
      mode: 'pvp',
      countryId: 'BRA',
    });
    const code = victim.last('room')!.room!.code;
    await send(attacker.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: 'segredo-do-atacante-1',
      guestName: 'Atacante',
    });
    await send(attacker.conn, { t: 'join_room', code, countryId: 'ARG' });
    // o que a sala revela ao atacante
    const leaked = attacker.last('room')!.room!.hostUserId;
    expect(leaked.startsWith('p:')).toBe(true);
    // o ataque antigo: nova conexão com o id vazado como segredo
    const hijack = fakeConn();
    const before = kacJournal.count('identity.guest_impersonation');
    await send(hijack.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: leaked.slice('p:'.length),
      guestName: 'Vitima',
    });
    expect(hijack.conn.user!.id).not.toBe(leaked);
    // a vítima não foi derrubada e continua dona da vaga; o atacante não entrou nela
    expect(victim.sent.some((m) => m.t === 'error' && m.code === 'replaced')).toBe(false);
    expect(hijack.last('room')?.room).toBeNull();
    expect(rooms.get(code)!.hasUser(hijack.conn.user!.id)).toBe(false);
    // e a tentativa fica registrada no diário do KAC
    expect(kacJournal.count('identity.guest_impersonation')).toBe(before + 1);
  });

  it('uso legítimo: o próprio convidado reconecta com o segredo dele e volta para a mesma vaga', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: 'meu-segredo-0001',
      guestName: 'Ana',
    });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    const again = fakeConn();
    await send(again.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: 'meu-segredo-0001',
      guestName: 'Ana',
    });
    expect(again.conn.user!.id).toBe(a.conn.user!.id);
    expect(again.last('room')?.room?.code).toBe(code);
    expect(rooms.get(code)!.hasUser(again.conn.user!.id)).toBe(true);
  });
});

describe('KAC-02 — pausa justa nas partidas entre humanos', () => {
  async function pvpMatch() {
    const env = setup();
    const a = fakeConn();
    const b = fakeConn();
    await env.send(a.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: 'ok-alice',
    });
    await env.send(b.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: 'ok-bob',
    });
    await env.send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await env.send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
    await env.send(b.conn, { t: 'set_ready', ready: true });
    await env.send(a.conn, { t: 'start' });
    const room = env.rooms.get(code)!;
    const loop = () => (room as unknown as { onLoop: () => void }).onLoop();
    return { ...env, a, b, room, loop };
  }

  it('ataque: ordens dadas com o jogo pausado não entram na fila', async () => {
    const { send, a, room } = await pvpMatch();
    await send(a.conn, { t: 'pause', paused: true });
    const unit = room.sim!.units.find((u) => u.owner === 0)!;
    await send(a.conn, {
      t: 'cmd',
      cmd: {
        type: 'move',
        unitIds: [unit.id],
        x: unit.pos.x + 10,
        y: unit.pos.y,
      },
    });
    expect(a.last('cmd_rejected')?.reason).toMatch(/pausada/);
    expect((room as unknown as { pending: unknown[] }).pending).toHaveLength(0);
  });

  it(`cada jogador tem ${PAUSE_POLICY.perPlayer} pausas; o outro não tira a pausa nos primeiros segundos; a pausa acaba sozinha`, async () => {
    const { send, a, b, room, clock, loop } = await pvpMatch();
    for (let i = 0; i < PAUSE_POLICY.perPlayer; i++) {
      await send(a.conn, { t: 'pause', paused: true });
      expect(room.paused).toBe(true);
      // o adversário tenta tirar a pausa logo: recusado
      await send(b.conn, { t: 'pause', paused: false });
      expect(room.paused).toBe(true);
      expect(b.last('cmd_rejected')?.reason).toMatch(/Só quem pausou/);
      // a pausa acaba sozinha no limite
      clock.t += PAUSE_POLICY.maxMs;
      loop();
      expect(room.paused).toBe(false);
    }
    await send(a.conn, { t: 'pause', paused: true });
    expect(room.paused).toBe(false);
    expect(a.last('cmd_rejected')?.reason).toMatch(/já usou/);
    // o outro jogador ainda tem as dele, e depois do tempo de cortesia qualquer um retoma
    await send(b.conn, { t: 'pause', paused: true });
    expect(room.paused).toBe(true);
    clock.t += PAUSE_POLICY.ownerOnlyMs;
    await send(a.conn, { t: 'pause', paused: false });
    expect(room.paused).toBe(false);
  });

  it('contra a IA nada muda: pausa livre e ordens na fila', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: 'ok-alice',
    });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    for (let i = 0; i < PAUSE_POLICY.perPlayer + 2; i++) {
      await send(a.conn, { t: 'pause', paused: true });
      expect(room.paused).toBe(true);
      await send(a.conn, { t: 'pause', paused: false });
    }
    await send(a.conn, { t: 'pause', paused: true });
    const unit = room.sim!.units.find((u) => u.owner === 0)!;
    await send(a.conn, {
      t: 'cmd',
      cmd: {
        type: 'move',
        unitIds: [unit.id],
        x: unit.pos.x + 10,
        y: unit.pos.y,
      },
    });
    expect((room as unknown as { pending: unknown[] }).pending).toHaveLength(1);
  });
});

describe('KAC-03 — limites por IP', () => {
  it('ataque: um IP não esgota as salas do servidor; outro IP continua criando', async () => {
    const { send, rooms } = setup();
    const made: string[] = [];
    for (let i = 0; i < NETWORK_POLICY.maxRoomsPerIp + 3; i++) {
      const c = fakeConn();
      c.conn.ip = '203.0.113.7';
      await send(c.conn, {
        t: 'hello',
        protocol: PROTOCOL_VERSION,
        token: null,
        guestId: `robo-${i}-xxxxxxxx`,
        guestName: 'Robo',
      });
      await send(c.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
      const r = c.last('room')?.room;
      if (r) made.push(r.code);
      else expect(c.last('error')?.message).toMatch(/Muitas salas/);
    }
    expect(made).toHaveLength(NETWORK_POLICY.maxRoomsPerIp);
    expect(rooms.size).toBe(NETWORK_POLICY.maxRoomsPerIp);
    const honest = fakeConn();
    honest.conn.ip = '198.51.100.20';
    await send(honest.conn, {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: 'jogador-honesto-1',
      guestName: 'Ana',
    });
    await send(honest.conn, {
      t: 'create_room',
      mode: 'pvp',
      countryId: 'BRA',
    });
    expect(honest.last('room')?.room).toBeTruthy();
  });

  it('teto de conexões simultâneas por IP, liberado ao desconectar; IP real é o último do X-Forwarded-For', () => {
    const g = new NetworkGuard();
    for (let i = 0; i < NETWORK_POLICY.maxConnectionsPerIp; i++) expect(g.connect('a')).toBe(true);
    expect(g.connect('a')).toBe(false);
    expect(g.connect('b')).toBe(true);
    g.disconnect('a');
    expect(g.connect('a')).toBe(true);
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.9' },
      socket: { remoteAddress: '10.0.0.1' },
    } as never;
    expect(clientIp(req)).toBe('10.0.0.9');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.1' } } as never)).toBe('10.0.0.1');
  });
});

/** Partida entre dois humanos com contas (ids de conta "reais" diferentes dos nomes). */
async function pvpWithAccounts() {
  const env = setup();
  env.deps.verify = async (token) =>
    token === 'tok-alice' ? { id: 'a1b2c3d4-0000-4000-8000-uuid-alice', name: 'Alice' } : token === 'tok-bob' ? { id: 'b5e6f7a8-0000-4000-8000-uuid-bob', name: 'Bob' } : null;
  const a = fakeConn();
  const b = fakeConn();
  await env.send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'tok-alice' });
  await env.send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'tok-bob' });
  await env.send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
  const code = a.last('room')!.room!.code;
  await env.send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
  return { ...env, a, b, code };
}

describe('KAC-05 — ids de conta não saem do servidor', () => {
  it('ataque: nenhum id de conta do Supabase chega ao adversário (sala, partida) nem ao próprio jogador', async () => {
    const { send, a, b } = await pvpWithAccounts();
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const toBob = JSON.stringify(b.sent);
    const toAlice = JSON.stringify(a.sent);
    for (const raw of ['a1b2c3d4-0000-4000-8000-uuid-alice', 'b5e6f7a8-0000-4000-8000-uuid-bob']) {
      expect(toBob).not.toContain(raw);
      expect(toAlice).not.toContain(raw);
    }
  });

  it('uso legítimo: cada um se reconhece na sala e o anfitrião continua anfitrião', async () => {
    const { a, b } = await pvpWithAccounts();
    const meA = a.last('welcome')!.user.id;
    const meB = b.last('welcome')!.user.id;
    const room = b.last('room')!.room!;
    expect(meA).toBe(publicId('a1b2c3d4-0000-4000-8000-uuid-alice'));
    expect(room.hostUserId).toBe(meA);
    expect(room.players.some((p) => p.userId === meB)).toBe(true);
    // o id público é estável (reconexão, outra sala) e não volta para o id da conta
    expect(publicId('a1b2c3d4-0000-4000-8000-uuid-alice')).toBe(meA);
    expect(meA).not.toContain('a1b2c3d4');
  });
});

describe('KAC-09 — sinais de automação (só alerta)', () => {
  const feed = (m: BehaviorMonitor, gaps: (i: number) => number, n: number) => {
    let t = 0;
    const out = [];
    for (let i = 0; i < n; i++) {
      t += gaps(i);
      const s = m.record('p', t);
      if (s) out.push(s);
    }
    return out;
  };

  it('um script com intervalo fixo é sinalizado, com os números que geraram o alerta', () => {
    const signals = feed(new BehaviorMonitor(), () => 250, BEHAVIOR_POLICY.window + BEHAVIOR_POLICY.every + 1);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: 'regular_timing', meanMs: 250 });
    expect(signals[0]!.cv).toBeLessThan(BEHAVIOR_POLICY.regularCv);
  });

  it('um script com ruído pequeno (±5%) também é sinalizado', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    expect(feed(new BehaviorMonitor(), () => 400 * (1 + 0.05 * rnd()), 400).map((s) => s.kind)).toContain('regular_timing');
  });

  it('jogador humano rápido (rajadas irregulares, APM alto) não é sinalizado', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // rajadas de cliques (80–300 ms) com pausas para pensar (1–6 s): ~250 APM
    const human = (i: number) => (i % 7 === 6 ? 1000 + rnd() * 5000 : 80 + rnd() * 220);
    expect(feed(new BehaviorMonitor(), human, 3000)).toHaveLength(0);
  });

  it('ritmo que nenhuma mão sustenta (mais de 15 ordens/s por um minuto) é sinalizado, mesmo irregular', () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const signals = feed(new BehaviorMonitor(), () => 20 + rnd() * 80, 1200);
    expect(signals.map((s) => s.kind)).toContain('sustained_rate');
  });

  it('no máximo um alerta por jogador a cada 5 minutos, e na partida ele vira evento para revisão sem bloquear ordens', async () => {
    const m = new BehaviorMonitor();
    expect(feed(m, () => 250, 1000)).toHaveLength(1);

    const { send, a, b, rooms, code, clock } = await pvpWithAccounts();
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    const unit = room.sim!.units.find((u) => u.owner === 0)!;
    const before = kacJournal.count('behavior.automation_suspected');
    for (let i = 0; i < BEHAVIOR_POLICY.window + BEHAVIOR_POLICY.every; i++) {
      clock.t += 300;
      await send(a.conn, { t: 'cmd', cmd: { type: 'move', unitIds: [unit.id], x: unit.pos.x + (i % 5), y: unit.pos.y } });
      (room as unknown as { pending: unknown[] }).pending.length = 0; // o tick não roda neste teste
    }
    expect(kacJournal.count('behavior.automation_suspected')).toBe(before + 1);
    expect(a.last('cmd_rejected')).toBeUndefined();
    const report = room.integrityReport(room.sim!);
    expect(report.verdict).toBe('review');
    expect(report.players.find((p) => p.slot === 0)!.automationAlerts).toBe(1);
    expect(report.players.find((p) => p.slot === 1)!.automationAlerts).toBe(0);
  });
});

describe('KAC-11 — decisões nacionais com a partida pausada', () => {
  it('ataque: orçamento e pesquisa enviados durante a pausa não entram na fila', async () => {
    const { send, a, b, rooms, code } = await pvpWithAccounts();
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    await send(a.conn, { t: 'pause', paused: true });
    await send(b.conn, { t: 'national', cmd: { type: 'set_research', techId: 'logistics' } });
    expect(b.last('cmd_rejected')?.reason).toMatch(/pausada/);
    expect((room as unknown as { pendingNational: unknown[] }).pendingNational).toHaveLength(0);
  });

  it('contra a IA nada muda', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-alice' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await send(a.conn, { t: 'start' });
    await send(a.conn, { t: 'pause', paused: true });
    await send(a.conn, { t: 'national', cmd: { type: 'set_research', techId: 'logistics' } });
    expect((rooms.get(code)! as unknown as { pendingNational: unknown[] }).pendingNational).toHaveLength(1);
  });
});

describe('KAC — relatório de integridade da partida', () => {
  it('partida limpa: veredito "clean", contagem de ordens por jogador e hash do estado final estável', async () => {
    const { send, a, b, rooms, code } = await pvpWithAccounts();
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    const unit = room.sim!.units.find((u) => u.owner === 0)!;
    await send(a.conn, { t: 'cmd', cmd: { type: 'move', unitIds: [unit.id], x: unit.pos.x + 4, y: unit.pos.y } });
    await send(a.conn, { t: 'cmd', cmd: { type: 'move', unitIds: [2 ** 30], x: 1, y: 1 } });
    room.advance();
    const r1 = room.integrityReport(room.sim!);
    expect(r1.verdict).toBe('clean');
    expect(r1.competitive).toBe(true);
    expect(r1.players.find((p) => p.slot === 0)).toMatchObject({ commandsAccepted: 1, commandsRejected: 1, automationAlerts: 0 });
    expect(r1.stateHash).toMatch(/^[0-9a-f]{64}$/);
    // mesmo estado, mesmo hash; um passo a mais, hash diferente
    expect(room.integrityReport(room.sim!).stateHash).toBe(r1.stateHash);
    room.advance();
    expect(room.integrityReport(room.sim!).stateHash).not.toBe(r1.stateHash);
  });

  it('qualquer evento de segurança relevante na sala manda a partida para revisão (sem punir ninguém)', () => {
    const base = { serialized: '{}', ticks: 10, competitive: true, slots: [0, 1], counters: () => undefined, pausesUsed: () => 0 };
    expect(buildIntegrity({ ...base, securityEvents: 0 }).verdict).toBe('clean');
    expect(buildIntegrity({ ...base, securityEvents: 2 }).verdict).toBe('review');
    expect(stateHash('a')).not.toBe(stateHash('b'));
  });
});

describe('KAC-08 — gravação persistente do diário', () => {
  const ev = (i: number, severity: KacEvent['severity'] = 'medium'): KacEvent => ({
    at: 1_000 + i,
    category: 'network.room_limit',
    severity,
    room: 'ABCD',
    user: 'guest:x',
    detail: `n${i}`,
  });
  function fakeBackend(ok = true) {
    const rows: KacEventRow[] = [];
    const purges: string[] = [];
    const backend: KacStoreBackend & { ok: boolean } = {
      ok,
      async insert(r) {
        if (!backend.ok) return false;
        rows.push(...r);
        return true;
      },
      async purgeBefore(iso) {
        purges.push(iso);
      },
    };
    return { backend, rows, purges };
  }

  it('grava só gravidade média ou maior, em lotes, com o formato da tabela', async () => {
    const { backend, rows } = fakeBackend();
    const store = new KacEventStore(backend, () => 0);
    store.push(ev(1, 'low'));
    store.push(ev(2, 'info'));
    store.push(ev(3, 'medium'));
    store.push(ev(4, 'high'));
    expect(store.pending).toBe(2);
    await store.flush();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ occurred_at: new Date(1003).toISOString(), category: 'network.room_limit', severity: 'medium', room_code: 'ABCD', user_id: 'guest:x', detail: 'n3' });
  });

  it('banco fora do ar: nada se perde até o teto da fila; acima dele descarta os mais antigos e conta', async () => {
    const { backend, rows } = fakeBackend(false);
    const store = new KacEventStore(backend, () => 0);
    for (let i = 0; i < 10; i++) store.push(ev(i));
    await store.flush();
    expect(store.pending).toBe(10);
    backend.ok = true;
    await store.drain();
    expect(rows.map((r) => r.detail)).toEqual(Array.from({ length: 10 }, (_, i) => `n${i}`));
    backend.ok = false;
    for (let i = 0; i < STORE_POLICY.maxQueue + 25; i++) store.push(ev(i));
    await store.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.pending).toBeLessThanOrEqual(STORE_POLICY.maxQueue);
    expect(store.dropped).toBeGreaterThanOrEqual(25);
  });

  it('falha na retenção não duplica o lote já gravado; exceção no insert devolve o lote para a fila', async () => {
    const { backend, rows } = fakeBackend();
    backend.purgeBefore = async () => {
      throw new Error('timeout');
    };
    const store = new KacEventStore(backend, () => 100 * 24 * 60 * 60_000);
    store.push(ev(1));
    await store.flush();
    expect(rows).toHaveLength(1);
    expect(store.pending).toBe(0);
    backend.insert = async () => {
      throw new Error('rede');
    };
    store.push(ev(2));
    await store.flush();
    expect(store.pending).toBe(1);
  });

  it('retenção: apaga o que passou de 90 dias, uma vez por dia', async () => {
    const { backend, purges } = fakeBackend();
    let now = 100 * 24 * 60 * 60_000;
    const store = new KacEventStore(backend, () => now);
    store.push(ev(1));
    await store.flush();
    store.push(ev(2));
    await store.flush();
    expect(purges).toEqual([new Date(now - STORE_POLICY.retentionDays * 24 * 60 * 60_000).toISOString()]);
    now += 25 * 60 * 60_000;
    store.push(ev(3));
    await store.flush();
    expect(purges).toHaveLength(2);
  });

  it('o diário entrega ao destino persistente só os eventos de gravidade média ou maior', () => {
    const j = new KacJournal(() => 5);
    const got: KacEvent[] = [];
    j.setSink((e) => got.push(e));
    j.record({ category: 'protocol.malformed', severity: 'low' });
    j.record({ category: 'network.connection_limit', severity: 'medium' });
    expect(got.map((e) => e.category)).toEqual(['network.connection_limit']);
  });
});

describe('KAC — painel de leitura /kac', () => {
  const TOKEN = 'kac-teste-0123456789abcdef-xyz';
  const url = (q = '') => new URL(`http://local/kac${q}`);
  function panel(token: string | undefined = TOKEN) {
    const journal = new KacJournal(() => 1_000);
    journal.record({ category: 'network.room_limit', severity: 'medium', room: 'ABCD' });
    journal.record({ category: 'protocol.malformed', severity: 'low' });
    const admin = new KacAdmin(token, { journal, store: { pending: 3, dropped: 0 }, network: new NetworkGuard() }, () => 2_000);
    return { journal, admin };
  }

  it('sem token configurado (ou curto demais) o painel não existe', () => {
    expect(panel('').admin.handle(url(), `Bearer ${TOKEN}`, 'ip').status).toBe(404);
    expect(panel('curto').admin.handle(url(), 'Bearer curto', 'ip').status).toBe(404);
  });

  it('ataque: sem o token certo nada sai, as tentativas vão para o diário e o IP é barrado depois de várias', () => {
    const { admin, journal } = panel();
    expect(admin.handle(url(), undefined, '203.0.113.9').status).toBe(401);
    expect(admin.handle(url(), `Bearer ${TOKEN}x`, '203.0.113.9').status).toBe(401);
    expect(admin.handle(url(`?token=${TOKEN}`), undefined, '203.0.113.9').status).toBe(401);
    expect(journal.count('admin.denied')).toBe(3);
    for (let i = 3; i < ADMIN_POLICY.maxFailures; i++) admin.handle(url(), 'Bearer errado', '203.0.113.9');
    // barrado mesmo com o token certo, até a janela passar; outro IP segue normal
    expect(admin.handle(url(), `Bearer ${TOKEN}`, '203.0.113.9').status).toBe(429);
    expect(admin.handle(url(), `Bearer ${TOKEN}`, '198.51.100.1').status).toBe(200);
  });

  it('com o token: contagens, eventos recentes (filtro e limite validados), fila da gravação e rede sem IPs', () => {
    const { admin } = panel();
    const ok = admin.handle(url(), `Bearer ${TOKEN}`, 'ip');
    expect(ok.status).toBe(200);
    const body = ok.body as { summary: Record<string, number>; events: KacEvent[]; store: { pending: number }; network: Record<string, number> };
    expect(body.summary).toEqual({ 'network.room_limit': 1, 'protocol.malformed': 1 });
    expect(body.events.map((e) => e.category)).toEqual(['protocol.malformed', 'network.room_limit']);
    expect(body.store.pending).toBe(3);
    expect(JSON.stringify(body.network)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    const filtered = admin.handle(url('?category=network.room_limit&limit=5'), `Bearer ${TOKEN}`, 'ip').body as { events: KacEvent[] };
    expect(filtered.events).toHaveLength(1);
    expect(admin.handle(url('?category=<script>'), `Bearer ${TOKEN}`, 'ip').status).toBe(400);
  });

  it('comparação do token em tempo constante e sem aceitar prefixo', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
  });
});

describe('KAC-06 — ids opacos', () => {
  it('a permutação é uma bijeção estável por chave, separada por espaço, e não preserva a ordem', () => {
    const key = newIdKey();
    const p = idCipher(key);
    const seen = new Set<number>();
    let ascents = 0;
    let prev = 0;
    for (let n = 0; n < 50_000; n++) {
      const id = p('entity', n);
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(2 ** 24);
      seen.add(id);
      if (n && id > prev) ascents++;
      prev = id;
    }
    expect(seen.size).toBe(50_000);
    // num contador comum, 100% dos passos sobem; numa permutação aleatória, perto de metade
    expect(ascents / 49_999).toBeGreaterThan(0.45);
    expect(ascents / 49_999).toBeLessThan(0.55);
    expect(idCipher(key)('entity', 77)).toBe(p('entity', 77));
    expect(idCipher(newIdKey())('entity', 77)).not.toBe(p('entity', 77));
    expect(p('air', 77)).not.toBe(p('entity', 77));
    // além do domínio: segue único, em sequência
    expect(p('entity', 2 ** 24)).toBe(2 ** 24 + 1);
  });

  it('ataque: pelos ids, o adversário não descobre quantas unidades e prédios o inimigo criou', async () => {
    const { send, a, b, rooms, code } = await pvpWithAccounts();
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const sim = rooms.get(code)!.sim!;
    const hq = sim.hqOf(0)!;
    // o inimigo (slot 0) cria 30 unidades em sequência; antes cada uma tinha o id da anterior + 1 (ou mais, se outros
    // criaram no meio), e a diferença entre dois ids vistos contava a produção
    const ids = Array.from({ length: 30 }, () => sim.addUnit('infantry', 0, { x: hq.pos.x, y: hq.pos.y + 6 }).id);
    let ascents = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i]! > ids[i - 1]!) ascents++;
    expect(ascents).toBeLessThan(ids.length - 1);
    expect(new Set(ids).size).toBe(ids.length);
    // e os ids iniciais de cada jogador não são uma sequência (o QG não é mais o id 1)
    expect(sim.hqOf(0)!.id).not.toBe(1);
  });

  it('a chave nunca vai para o cliente e continua a mesma depois de retomar a partida salva', async () => {
    const { send, a, b, rooms, code, clock } = await pvpWithAccounts();
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    room.advance();
    const save = room.toSave()!;
    expect(save.idKey).toMatch(/^[0-9a-f]{64}$/);
    for (const c of [a, b]) expect(JSON.stringify(c.sent)).not.toContain(save.idKey!);
    const restored = Room.restore(save, { reconnectGraceMs: 1000, record: async () => true, onEmpty: () => {}, now: () => clock.t });
    const hq = room.sim!.hqOf(1)!;
    const next = room.sim!.addUnit('tank', 1, { x: hq.pos.x, y: hq.pos.y + 6 }).id;
    const again = restored.sim!.addUnit('tank', 1, { x: hq.pos.x, y: hq.pos.y + 6 }).id;
    expect(again).toBe(next);
  });
});
