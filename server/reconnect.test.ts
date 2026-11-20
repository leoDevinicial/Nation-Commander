import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { decodedMessages } from "../shared/net/delta.ts";
import type { ServerMessage } from "../shared/protocol.ts";
import { PROTOCOL_VERSION } from "../shared/version.ts";
import { Connection } from "./Connection.ts";
import { handleClose, handleMessage, type HandlerDeps } from "./handler.ts";
import { DISCONNECT_POLICY } from "./kac/policy.ts";
import { NetworkGuard } from "./kac/network.ts";
import { parseClientMessage } from "./messages.ts";
import { RoomManager } from "./RoomManager.ts";
import { isTransientAuthError, type MatchRecord } from "./supabase.ts";

/**
 * Quedas no meio da partida (20/11): amigos caíam em partidas de 1 h e perdiam por abandono. Estes testes cobrem
 * a reconexão com a conexão antiga ainda aberta, a pausa por queda entre humanos, o prazo maior e o token renovado.
 */
function fakeConn() {
  const sent: ServerMessage[] = [];
  const dec = decodedMessages<ServerMessage>();
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (s: string) =>
      void ((m) => m && sent.push(m))(dec(JSON.parse(s) as ServerMessage)),
    close: vi.fn(),
  } as unknown as WebSocket;
  const conn = new Connection(ws);
  return {
    conn,
    ws,
    sent,
    last: <T extends ServerMessage["t"]>(t: T) =>
      sent.filter((m) => m.t === t).at(-1) as
        | Extract<ServerMessage, { t: T }>
        | undefined,
  };
}

/** Tokens: `ok-<id>` vale, `retry-*` simula o Supabase fora do ar por um instante, o resto é inválido. */
function setup(now = { t: 0 }) {
  const records: MatchRecord[] = [];
  const rooms = new RoomManager(
    {
      reconnectGraceMs: 1000,
      reconnectGracePvpMs: 180_000,
      record: async (r) => (records.push(r), true),
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
    network: new NetworkGuard(),
    verify: async (token) =>
      token.startsWith("retry-")
        ? "retry"
        : token.startsWith("ok-")
          ? { id: token.slice(3), name: token.slice(3) }
          : null,
  };
  const send = (c: Connection, raw: object) => {
    const msg = parseClientMessage(JSON.stringify(raw));
    if (!msg) throw new Error("mensagem inválida no teste");
    return handleMessage(c, msg, deps);
  };
  return { rooms, deps, records, send, now };
}

async function pvpMatch(env: ReturnType<typeof setup>) {
  const { send, rooms } = env;
  const a = fakeConn();
  const b = fakeConn();
  await send(a.conn, {
    t: "hello",
    protocol: PROTOCOL_VERSION,
    token: "ok-ana",
  });
  await send(b.conn, {
    t: "hello",
    protocol: PROTOCOL_VERSION,
    token: "ok-bia",
  });
  await send(a.conn, { t: "create_room", mode: "pvp", countryId: "BRA" });
  const code = a.last("room")!.room!.code;
  await send(b.conn, { t: "join_room", code, countryId: "ARG" });
  await send(b.conn, { t: "set_ready", ready: true });
  await send(a.conn, { t: "start" });
  const room = rooms.get(code)!;
  const loop = () => (room as unknown as { onLoop(): void }).onLoop();
  return { a, b, room, loop };
}

const player = (
  room: { players: { userId: string | null; connected: boolean }[] },
  id: string,
) => room.players.find((p) => p.userId === id)!;

describe("quedas e reconexão no meio da partida", () => {
  it("o fechamento atrasado da conexão antiga não derruba quem já reconectou", async () => {
    const env = setup();
    const { b, room } = await pvpMatch(env);
    // a rede de B pisca: o navegador abre outra conexão antes de o servidor perceber que a antiga morreu
    const b2 = fakeConn();
    await env.send(b2.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "ok-bia",
    });
    expect(b2.last("match_start")).toBeDefined();
    expect(player(room, "bia").connected).toBe(true);
    // só agora o servidor fecha a conexão antiga (ping sem resposta ou fim do aperto de mão do fechamento)
    handleClose(b.conn, env.deps);
    expect(player(room, "bia").connected).toBe(true);
    expect(room.paused).toBe(false);
    // e B continua recebendo a partida pela conexão nova
    const before = b2.sent.length;
    room.advance();
    room.advance();
    expect(b2.sent.length).toBeGreaterThan(before);
  });

  it("entre humanos, a queda pausa a partida por um tempo limitado e o prazo para voltar é maior", async () => {
    const env = setup();
    const { a, b, room, loop } = await pvpMatch(env);
    handleClose(b.conn, env.deps);
    expect(room.paused).toBe(true);
    expect(a.sent.some((m) => m.t === "chat" && /pausada/.test(m.text))).toBe(
      true,
    );

    // a pausa termina sozinha no teto, e B ainda não perdeu (o prazo é de 3 min)
    env.now.t += DISCONNECT_POLICY.pauseMs + 10;
    loop();
    expect(room.paused).toBe(false);
    expect(room.status).toBe("playing");
    env.now.t += 60_000;
    loop();
    expect(room.status).toBe("playing");

    // B volta dentro do prazo
    const b2 = fakeConn();
    await env.send(b2.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "ok-bia",
    });
    expect(player(room, "bia").connected).toBe(true);

    // a queda vai para o histórico, com o motivo
    await env.send(a.conn, { t: "surrender" });
    await vi.waitFor(() => expect(env.records).toHaveLength(1));
    const conn = env.records[0]!.report.connection!;
    expect(conn).toEqual([
      {
        slot: 1,
        drops: 1,
        longestOfflineS: Math.round(
          (DISCONNECT_POLICY.pauseMs + 10 + 60_000) / 1000,
        ),
        causes: { "codigo ?": 1 },
      },
    ]);
  });

  it("a pausa por queda tem limite de vezes por jogador", async () => {
    const env = setup();
    const { b, room } = await pvpMatch(env);
    let conn = b;
    for (let i = 0; i < DISCONNECT_POLICY.pausesPerPlayer; i++) {
      handleClose(conn.conn, env.deps);
      expect(room.paused).toBe(true);
      conn = fakeConn();
      await env.send(conn.conn, {
        t: "hello",
        protocol: PROTOCOL_VERSION,
        token: "ok-bia",
      });
      expect(room.paused).toBe(false);
    }
    handleClose(conn.conn, env.deps);
    expect(room.paused).toBe(false);
  });

  it("quem não volta no prazo maior perde por abandono", async () => {
    const env = setup();
    const { a, b, loop } = await pvpMatch(env);
    handleClose(b.conn, env.deps);
    env.now.t += 180_001;
    loop();
    await vi.waitFor(() =>
      expect(a.last("match_end")?.end.reason).toBe("disconnect"),
    );
  });

  it("reconecta com o token renovado depois que o antigo expirou", async () => {
    const env = setup();
    const { b, room } = await pvpMatch(env);
    handleClose(b.conn, env.deps);
    // o token velho foi recusado (expirado)...
    const old = fakeConn();
    await env.send(old.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "expirado",
    });
    expect(old.last("error")?.code).toBe("auth");
    // ...e o navegador, com o token renovado, volta para a mesma vaga
    const fresh = fakeConn();
    await env.send(fresh.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "ok-bia",
    });
    expect(fresh.last("match_start")?.match.yourSlot).toBe(1);
    expect(player(room, "bia").connected).toBe(true);
  });

  it("Supabase fora do ar por um instante: pede nova tentativa em vez de dar a sessão como inválida", async () => {
    const env = setup();
    const { b, room } = await pvpMatch(env);
    handleClose(b.conn, env.deps);
    const c = fakeConn();
    await env.send(c.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "retry-bia",
    });
    // sem o erro "auth" (que faz o cliente sair da conta) e com um código que o cliente tenta de novo
    expect(c.last("error")).toBeUndefined();
    expect(c.ws.close).toHaveBeenCalledWith(1013, expect.any(String));
    const again = fakeConn();
    await env.send(again.conn, {
      t: "hello",
      protocol: PROTOCOL_VERSION,
      token: "ok-bia",
    });
    expect(player(room, "bia").connected).toBe(true);
  });

  it("separa token inválido de falha passageira do Supabase", () => {
    expect(isTransientAuthError(401)).toBe(false);
    expect(isTransientAuthError(403)).toBe(false);
    expect(isTransientAuthError(undefined)).toBe(true);
    expect(isTransientAuthError(0)).toBe(true);
    expect(isTransientAuthError(429)).toBe(true);
    expect(isTransientAuthError(503)).toBe(true);
  });
});
