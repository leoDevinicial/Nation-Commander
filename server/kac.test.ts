import { NetworkGuard } from "./kac/network.ts";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { ServerMessage } from "../shared/protocol.ts";
import { PROTOCOL_VERSION } from "../shared/version.ts";
import { Connection } from "./Connection.ts";
import { handleMessage, type HandlerDeps } from "./handler.ts";
import { parseClientMessage } from "./messages.ts";
import { RoomManager } from "./RoomManager.ts";
import { guestIdentity } from "./kac/identity.ts";
import { kacJournal } from "./kac/journal.ts";
import { PAUSE_POLICY } from "./kac/policy.ts";
import { NETWORK_POLICY, clientIp } from "./kac/network.ts";

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
    last: <T extends ServerMessage["t"]>(t: T) =>
      sent.filter((m) => m.t === t).at(-1) as
        | Extract<ServerMessage, { t: T }>
        | undefined,
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
    verify: async (token) =>
      token.startsWith("ok-")
        ? { id: token.slice(3), name: token.slice(3) }
        : null,
  };
  const send = (c: Connection, raw: object) => {
    const msg = parseClientMessage(JSON.stringify(raw));
    if (!msg) throw new Error("mensagem inválida no teste");
    return handleMessage(c, msg, deps);
  };
  return { rooms, deps, send, clock };
}

describe("KAC-01 — identidade dos convidados", () => {
  it("o id público vem de um hash do segredo: estável para o dono, impossível de reutilizar por quem o vê", () => {
    const secret = "6f1c2a9e-0d4b-4c7e-9a51-3b2f8e7d1c00";
    expect(guestIdentity(secret)).toBe(guestIdentity(secret));
    expect(guestIdentity(secret)).not.toContain(secret);
    expect(guestIdentity(guestIdentity(secret).slice(6))).not.toBe(
      guestIdentity(secret),
    );
  });

  it("ataque: quem lê o id do convidado na sala não consegue assumir a conexão nem a vaga dele", async () => {
    const { send, rooms } = setup();
    const victim = fakeConn();
    const attacker = fakeConn();
    await send(victim.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: "segredo-da-vitima-123",
      guestName: "Vitima",
    });
    await send(victim.conn, {
      t: "create_room",
      mode: "pvp",
      countryId: "BRA",
    });
    const code = victim.last("room")!.room!.code;
    await send(attacker.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: "segredo-do-atacante-1",
      guestName: "Atacante",
    });
    await send(attacker.conn, { t: "join_room", code, countryId: "ARG" });
    // o que a sala revela ao atacante
    const leaked = attacker.last("room")!.room!.hostUserId;
    expect(leaked.startsWith("guest:")).toBe(true);
    // o ataque antigo: nova conexão com o id vazado como segredo
    const hijack = fakeConn();
    const before = kacJournal.count("identity.guest_impersonation");
    await send(hijack.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: leaked.slice("guest:".length),
      guestName: "Vitima",
    });
    expect(hijack.conn.user!.id).not.toBe(leaked);
    // a vítima não foi derrubada e continua dona da vaga; o atacante não entrou nela
    expect(
      victim.sent.some((m) => m.t === "error" && m.code === "replaced"),
    ).toBe(false);
    expect(hijack.last("room")?.room).toBeNull();
    expect(rooms.get(code)!.hasUser(hijack.conn.user!.id)).toBe(false);
    // e a tentativa fica registrada no diário do KAC
    expect(kacJournal.count("identity.guest_impersonation")).toBe(before + 1);
  });

  it("uso legítimo: o próprio convidado reconecta com o segredo dele e volta para a mesma vaga", async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: "meu-segredo-0001",
      guestName: "Ana",
    });
    await send(a.conn, { t: "create_room", mode: "pvp", countryId: "BRA" });
    const code = a.last("room")!.room!.code;
    const again = fakeConn();
    await send(again.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: "meu-segredo-0001",
      guestName: "Ana",
    });
    expect(again.conn.user!.id).toBe(a.conn.user!.id);
    expect(again.last("room")?.room?.code).toBe(code);
    expect(rooms.get(code)!.hasUser(again.conn.user!.id)).toBe(true);
  });
});

describe("KAC-02 — pausa justa nas partidas entre humanos", () => {
  async function pvpMatch() {
    const env = setup();
    const a = fakeConn();
    const b = fakeConn();
    await env.send(a.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "ok-alice",
    });
    await env.send(b.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "ok-bob",
    });
    await env.send(a.conn, { t: "create_room", mode: "pvp", countryId: "BRA" });
    const code = a.last("room")!.room!.code;
    await env.send(b.conn, { t: "join_room", code, countryId: "ARG" });
    await env.send(b.conn, { t: "set_ready", ready: true });
    await env.send(a.conn, { t: "start" });
    const room = env.rooms.get(code)!;
    const loop = () => (room as unknown as { onLoop: () => void }).onLoop();
    return { ...env, a, b, room, loop };
  }

  it("ataque: ordens dadas com o jogo pausado não entram na fila", async () => {
    const { send, a, room } = await pvpMatch();
    await send(a.conn, { t: "pause", paused: true });
    const unit = room.sim!.units.find((u) => u.owner === 0)!;
    await send(a.conn, {
      t: "cmd",
      cmd: {
        type: "move",
        unitIds: [unit.id],
        x: unit.pos.x + 10,
        y: unit.pos.y,
      },
    });
    expect(a.last("cmd_rejected")?.reason).toMatch(/pausada/);
    expect((room as unknown as { pending: unknown[] }).pending).toHaveLength(0);
  });

  it(`cada jogador tem ${PAUSE_POLICY.perPlayer} pausas; o outro não tira a pausa nos primeiros segundos; a pausa acaba sozinha`, async () => {
    const { send, a, b, room, clock, loop } = await pvpMatch();
    for (let i = 0; i < PAUSE_POLICY.perPlayer; i++) {
      await send(a.conn, { t: "pause", paused: true });
      expect(room.paused).toBe(true);
      // o adversário tenta tirar a pausa logo: recusado
      await send(b.conn, { t: "pause", paused: false });
      expect(room.paused).toBe(true);
      expect(b.last("cmd_rejected")?.reason).toMatch(/Só quem pausou/);
      // a pausa acaba sozinha no limite
      clock.t += PAUSE_POLICY.maxMs;
      loop();
      expect(room.paused).toBe(false);
    }
    await send(a.conn, { t: "pause", paused: true });
    expect(room.paused).toBe(false);
    expect(a.last("cmd_rejected")?.reason).toMatch(/já usou/);
    // o outro jogador ainda tem as dele, e depois do tempo de cortesia qualquer um retoma
    await send(b.conn, { t: "pause", paused: true });
    expect(room.paused).toBe(true);
    clock.t += PAUSE_POLICY.ownerOnlyMs;
    await send(a.conn, { t: "pause", paused: false });
    expect(room.paused).toBe(false);
  });

  it("contra a IA nada muda: pausa livre e ordens na fila", async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "ok-alice",
    });
    await send(a.conn, { t: "create_room", mode: "vs_ai", countryId: "BRA" });
    const code = a.last("room")!.room!.code;
    await send(a.conn, { t: "start" });
    const room = rooms.get(code)!;
    for (let i = 0; i < PAUSE_POLICY.perPlayer + 2; i++) {
      await send(a.conn, { t: "pause", paused: true });
      expect(room.paused).toBe(true);
      await send(a.conn, { t: "pause", paused: false });
    }
    await send(a.conn, { t: "pause", paused: true });
    const unit = room.sim!.units.find((u) => u.owner === 0)!;
    await send(a.conn, {
      t: "cmd",
      cmd: {
        type: "move",
        unitIds: [unit.id],
        x: unit.pos.x + 10,
        y: unit.pos.y,
      },
    });
    expect((room as unknown as { pending: unknown[] }).pending).toHaveLength(1);
  });
});

describe("KAC-03 — limites por IP", () => {
  it("ataque: um IP não esgota as salas do servidor; outro IP continua criando", async () => {
    const { send, rooms } = setup();
    const made: string[] = [];
    for (let i = 0; i < NETWORK_POLICY.maxRoomsPerIp + 3; i++) {
      const c = fakeConn();
      c.conn.ip = "203.0.113.7";
      await send(c.conn, {
        t: "hello",
        protocol: PROTOCOL_VERSION,
        token: null,
        guestId: `robo-${i}-xxxxxxxx`,
        guestName: "Robo",
      });
      await send(c.conn, { t: "create_room", mode: "pvp", countryId: "BRA" });
      const r = c.last("room")?.room;
      if (r) made.push(r.code);
      else expect(c.last("error")?.message).toMatch(/Muitas salas/);
    }
    expect(made).toHaveLength(NETWORK_POLICY.maxRoomsPerIp);
    expect(rooms.size).toBe(NETWORK_POLICY.maxRoomsPerIp);
    const honest = fakeConn();
    honest.conn.ip = "198.51.100.20";
    await send(honest.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: null,
      guestId: "jogador-honesto-1",
      guestName: "Ana",
    });
    await send(honest.conn, {
      t: "create_room",
      mode: "pvp",
      countryId: "BRA",
    });
    expect(honest.last("room")?.room).toBeTruthy();
  });

  it("teto de conexões simultâneas por IP, liberado ao desconectar; IP real é o último do X-Forwarded-For", () => {
    const g = new NetworkGuard();
    for (let i = 0; i < NETWORK_POLICY.maxConnectionsPerIp; i++)
      expect(g.connect("a")).toBe(true);
    expect(g.connect("a")).toBe(false);
    expect(g.connect("b")).toBe(true);
    g.disconnect("a");
    expect(g.connect("a")).toBe(true);
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.9" },
      socket: { remoteAddress: "10.0.0.1" },
    } as never;
    expect(clientIp(req)).toBe("10.0.0.9");
    expect(
      clientIp({ headers: {}, socket: { remoteAddress: "10.0.0.1" } } as never),
    ).toBe("10.0.0.1");
  });
});
