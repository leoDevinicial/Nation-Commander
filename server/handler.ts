import { randomUUID } from 'node:crypto';
import type { ClientMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION, GAME_VERSION } from '../shared/version.ts';
import type { Connection } from './Connection.ts';
import type { RoomManager } from './RoomManager.ts';
import { sanitizeName } from './messages.ts';

export interface HandlerDeps {
  rooms: RoomManager;
  allowGuests: boolean;
  verify: (token: string) => Promise<{ id: string; name: string } | null>;
  /** Conexões ativas por usuário (uma por vez). */
  sessions: Map<string, Connection>;
}

/** Processa uma mensagem já validada de uma conexão. */
export async function handleMessage(conn: Connection, msg: ClientMessage, deps: HandlerDeps): Promise<void> {
  if (msg.t === 'ping') {
    conn.send({ t: 'pong', n: msg.n });
    return;
  }

  if (msg.t === 'hello') {
    if (conn.user || conn.authenticating) return;
    if (msg.protocol !== PROTOCOL_VERSION) {
      conn.send({ t: 'error', code: 'protocol', message: 'Versão do jogo desatualizada. Recarregue a página.' });
      conn.close(4000, 'protocol');
      return;
    }
    if (msg.token) {
      conn.authenticating = true;
      const user = await deps.verify(msg.token).finally(() => (conn.authenticating = false));
      if (!user) {
        conn.send({ t: 'error', code: 'auth', message: 'Sessão inválida ou expirada. Entre novamente.' });
        conn.close(4003, 'auth');
        return;
      }
      conn.user = { id: user.id, name: user.name, guest: false };
    } else if (deps.allowGuests) {
      const gid = msg.guestId ?? randomUUID();
      conn.user = { id: `guest:${gid}`, name: sanitizeName(msg.guestName ?? 'Convidado'), guest: true };
    } else {
      conn.send({ t: 'error', code: 'auth', message: 'É necessário entrar com uma conta.' });
      conn.close(4003, 'auth');
      return;
    }
    const previous = deps.sessions.get(conn.user.id);
    if (previous && previous !== conn) {
      previous.send({ t: 'error', code: 'replaced', message: 'Sua conta foi conectada em outra aba ou dispositivo.' });
      previous.close(4001, 'replaced');
    }
    deps.sessions.set(conn.user.id, conn);
    conn.send({ t: 'welcome', user: conn.user, serverVersion: GAME_VERSION });
    const room = deps.rooms.findByUser(conn.user.id);
    if (room) room.reattach(conn);
    else conn.send({ t: 'room', room: null });
    return;
  }

  if (!conn.user) {
    conn.send({ t: 'error', code: 'auth', message: 'Identifique-se primeiro.' });
    return;
  }

  const room = conn.roomCode ? deps.rooms.get(conn.roomCode) : undefined;

  switch (msg.t) {
    case 'create_room': {
      if (room) room.leave(conn);
      const created = deps.rooms.create(conn, msg.mode, msg.countryId);
      if (typeof created === 'string') conn.send({ t: 'error', code: 'room', message: created });
      else created.broadcastRoom();
      return;
    }
    case 'join_room': {
      const target = deps.rooms.get(msg.code);
      if (!target) {
        conn.send({ t: 'error', code: 'room', message: 'Sala não encontrada.' });
        return;
      }
      if (room && room !== target) room.leave(conn);
      if (target.hasUser(conn.user.id)) {
        target.reattach(conn);
        return;
      }
      const err = target.join(conn, msg.countryId);
      if (err) conn.send({ t: 'error', code: 'room', message: err });
      return;
    }
    case 'leave_room':
      room?.leave(conn);
      conn.roomCode = null;
      conn.send({ t: 'room', room: null });
      return;
    case 'set_country':
      room?.setCountry(conn, msg.countryId);
      return;
    case 'set_ready':
      room?.setReady(conn, msg.ready);
      return;
    case 'start': {
      const err = room ? room.start(conn) : 'Você não está em uma sala';
      if (err) conn.send({ t: 'error', code: 'room', message: err });
      return;
    }
    case 'cmd':
      room?.command(conn, msg.cmd, msg.scope);
      return;
    case 'national':
      room?.nationalCommand(conn, msg.cmd);
      return;
    case 'set_balance':
      room?.setBalance(conn, msg.mode);
      return;
    case 'pause':
      room?.setPaused(conn, msg.paused);
      return;
    case 'speed':
      room?.setSpeed(conn, msg.speed);
      return;
    case 'surrender':
      room?.surrender(conn);
      return;
    case 'chat':
      room?.chat(conn, msg.text);
      return;
  }
}

export function handleClose(conn: Connection, deps: HandlerDeps): void {
  if (conn.user && deps.sessions.get(conn.user.id) === conn) deps.sessions.delete(conn.user.id);
  const room = conn.roomCode ? deps.rooms.get(conn.roomCode) : undefined;
  room?.onDisconnect(conn);
}
