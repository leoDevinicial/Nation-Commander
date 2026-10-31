import { randomUUID } from 'node:crypto';
import type { ClientMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION, GAME_VERSION } from '../shared/version.ts';
import type { Connection } from './Connection.ts';
import type { RoomManager } from './RoomManager.ts';
import { sanitizeName } from './messages.ts';
import { saveCommunityReport, saveFeedback, type FeedbackRecord } from './supabase.ts';
import { config } from './config.ts';
import { CommunityChat } from './communityChat.ts';

export interface HandlerDeps {
  rooms: RoomManager;
  allowGuests: boolean;
  verify: (token: string) => Promise<{ id: string; name: string; subscriber?: boolean } | null>;
  /** Conexões ativas por usuário (uma por vez). */
  sessions: Map<string, Connection>;
  /** Grava um feedback (padrão: Supabase, ou só o log sem Supabase). */
  saveFeedback?: (rec: FeedbackRecord) => Promise<boolean>;
  /** Chat da Comunidade do menu (um canal para todos). */
  community?: CommunityChat;
  /** Último feedback de cada usuário (ms): no máximo um a cada `FEEDBACK_COOLDOWN_MS`. */
  feedbackAt?: Map<string, number>;
}

/** Chat da Comunidade (criado na primeira vez, com os moderadores e a gravação de denúncias do servidor). */
function community(deps: HandlerDeps): CommunityChat {
  return (deps.community ??= new CommunityChat({ moderators: config.communityModerators, saveReport: saveCommunityReport }));
}

/** Intervalo mínimo entre dois feedbacks do mesmo jogador. */
export const FEEDBACK_COOLDOWN_MS = 60_000;

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
      conn.user = { id: user.id, name: user.name, guest: false, ...(user.subscriber ? { subscriber: true } : {}) };
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
    // em memória ou, depois de um reinício do servidor, retomada do salvamento
    const room = await deps.rooms.findOrRestore(conn.user.id);
    if (room && conn.user && deps.sessions.get(conn.user.id) === conn) room.reattach(conn);
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
      const created = deps.rooms.create(conn, msg.mode, msg.countryId, msg.isPublic === true);
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
    case 'feedback': {
      const at = (deps.feedbackAt ??= new Map());
      const now = Date.now();
      const last = at.get(conn.user.id) ?? -Infinity;
      if (now - last < FEEDBACK_COOLDOWN_MS) {
        conn.send({ t: 'error', code: 'feedback', message: `Aguarde ${Math.ceil((FEEDBACK_COOLDOWN_MS - (now - last)) / 1000)} s para enviar outro feedback.` });
        return;
      }
      at.set(conn.user.id, now);
      const guest = conn.user.id.startsWith('guest:');
      const ok = await (deps.saveFeedback ?? saveFeedback)({
        user_id: guest ? null : conn.user.id,
        guest,
        display_name: conn.user.name,
        category: msg.category,
        rating: msg.rating ?? null,
        message: msg.message,
        game_version: GAME_VERSION,
      });
      if (ok) conn.send({ t: 'feedback_ok' });
      else {
        at.delete(conn.user.id);
        conn.send({ t: 'error', code: 'feedback', message: 'Não foi possível enviar agora. Tente de novo em instantes.' });
      }
      return;
    }
    case 'community_join':
      community(deps).join(conn);
      return;
    case 'community_leave':
      deps.community?.leave(conn);
      return;
    case 'community_say': {
      const err = community(deps).post(conn, msg.text);
      if (err) conn.send({ t: 'error', code: 'community', message: err });
      return;
    }
    case 'community_report':
      conn.send({ t: 'community_notice', text: community(deps).report(conn, msg.id, msg.reason) });
      return;
    case 'community_mod':
      conn.send({ t: 'community_notice', text: community(deps).moderate(conn, msg.action, msg.id, msg.minutes) });
      return;
    case 'list_rooms':
      conn.send({ t: 'room_list', rooms: deps.rooms.listPublic() });
      return;
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
    case 'set_difficulty':
      room?.setDifficulty(conn, msg.difficulty);
      return;
    case 'set_room':
      room?.setRoom(conn, msg);
      return;
    case 'add_bot': {
      const err = room ? room.addBot(conn) : 'Você não está em uma sala';
      if (err) conn.send({ t: 'error', code: 'room', message: err });
      return;
    }
    case 'remove_bot':
      room?.removeBot(conn, msg.slot);
      return;
    case 'set_team':
      room?.setTeam(conn, msg.slot, msg.team);
      return;
    case 'set_bot_country':
      room?.setBotCountry(conn, msg.slot, msg.countryId);
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
  deps.community?.leave(conn);
  const room = conn.roomCode ? deps.rooms.get(conn.roomCode) : undefined;
  room?.onDisconnect(conn);
}
