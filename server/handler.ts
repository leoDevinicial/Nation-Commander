import { SAVED_MATCHES, type ClientMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION, GAME_VERSION } from '../shared/version.ts';
import type { Connection } from './Connection.ts';
import type { RoomManager } from './RoomManager.ts';
import { sanitizeName } from './messages.ts';
import { recordMatch, saveClientDiag, saveCommunityReport, saveFeedback, type ClientDiagRecord, type FeedbackRecord, type MatchRecord } from './supabase.ts';
import { validateLocalMatch } from './local/localMatch.ts';
import { config } from './config.ts';
import { guestIdentity, publicId } from './kac/identity.ts';
import { kacJournal } from './kac/journal.ts';
import { networkGuard, type NetworkGuard } from './kac/network.ts';
import { CommunityChat } from './communityChat.ts';
import { log } from './logger.ts';

export interface HandlerDeps {
  rooms: RoomManager;
  allowGuests: boolean;
  /** Valida o token: o usuário, `null` (token inválido ou expirado) ou `'retry'` (Supabase fora do ar por um instante). */
  verify: (token: string) => Promise<{ id: string; name: string; subscriber?: boolean } | null | 'retry'>;
  /** Conexões ativas por usuário (uma por vez). */
  sessions: Map<string, Connection>;
  /** Grava um feedback (padrão: Supabase, ou só o log sem Supabase). */
  saveFeedback?: (rec: FeedbackRecord) => Promise<boolean>;
  /** Proteção por IP do KAC (padrão: a do processo). */
  network?: NetworkGuard;
  /** Chat da Comunidade do menu (um canal para todos). */
  community?: CommunityChat;
  /** Grava um diagnóstico do navegador (padrão: Supabase, ou só o log sem Supabase). */
  saveClientDiag?: (rec: ClientDiagRecord) => Promise<boolean>;
  /** Último feedback de cada usuário (ms): no máximo um a cada `FEEDBACK_COOLDOWN_MS`. */
  feedbackAt?: Map<string, number>;
  /** Grava o resultado de uma partida contra a IA que rodou no navegador (padrão: Supabase). */
  recordLocalMatch?: (rec: MatchRecord) => Promise<boolean>;
  /** Partidas locais já recebidas (id → quando): o navegador repete até receber a confirmação. */
  localMatches?: Map<string, number>;
}

/** Resultados de partidas locais aceitos por usuário: no máximo um a cada tanto (ms). */
export const LOCAL_MATCH_COOLDOWN_MS = 20_000;

/** Chat da Comunidade (criado na primeira vez, com os moderadores e a gravação de denúncias do servidor). */
function community(deps: HandlerDeps): CommunityChat {
  return (deps.community ??= new CommunityChat({ moderators: config.communityModerators, saveReport: saveCommunityReport }));
}

/**
 * O segredo de convidado enviado é o id (interno ou público) de alguém conectado: tentativa de assumir a vaga dessa
 * pessoa com o que apareceu na sala. Não funciona (o id resultante é outro), mas fica registrada no diário do KAC.
 */
function impersonates(guestId: string, sessions: Map<string, Connection>): boolean {
  for (const id of sessions.keys()) {
    const pub = publicId(id);
    if (id === `guest:${guestId}` || pub === guestId || pub === `p:${guestId}`) return true;
  }
  return false;
}

/** Intervalo mínimo entre dois feedbacks do mesmo jogador. */
export const FEEDBACK_COOLDOWN_MS = 60_000;
/** Diagnósticos do navegador aceitos por conexão (21/11). */
export const CLIENT_DIAG_PER_CONNECTION = 20;

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
    // sem compressão no transporte: o servidor comprime as mensagens grandes ele mesmo (Connection.sendRaw)
    conn.appDeflate = msg.inflate === true;
    if (msg.token) {
      conn.authenticating = true;
      const user = await deps.verify(msg.token).finally(() => (conn.authenticating = false));
      if (user === 'retry') {
        // falha passageira ao validar (20/11): antes virava "sessão inválida", o navegador saía da conta e o jogador
        // perdia a vaga. 1013 ("tente mais tarde") faz o cliente reconectar sozinho.
        log.warn('Validação de sessão indisponível; cliente vai tentar de novo');
        conn.close(1013, 'auth unavailable');
        return;
      }
      if (!user) {
        conn.send({ t: 'error', code: 'auth', message: 'Sessão inválida ou expirada. Entre novamente.' });
        conn.close(4003, 'auth');
        return;
      }
      conn.user = { id: user.id, name: user.name, guest: false, ...(user.subscriber ? { subscriber: true } : {}) };
    } else if (deps.allowGuests) {
      // KAC-01: o id público é um hash do segredo do convidado (o segredo nunca sai desta conexão)
      conn.user = { id: guestIdentity(msg.guestId), name: sanitizeName(msg.guestName ?? 'Convidado'), guest: true };
      // quem manda como segredo o id público de alguém conectado está tentando assumir a vaga dessa pessoa
      if (msg.guestId && impersonates(msg.guestId, deps.sessions))
        kacJournal.record({ category: 'identity.guest_impersonation', severity: 'high', user: conn.user.id, detail: 'hello com o id público de outro convidado' });
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
    // KAC-05: o cliente conhece só o próprio id público (o mesmo que aparece para os outros na sala)
    conn.send({ t: 'welcome', user: { ...conn.user, id: publicId(conn.user.id) }, serverVersion: GAME_VERSION });
    // em memória ou, depois de um reinício do servidor, retomada do salvamento
    conn.binary = msg.bin === true;
    conn.resume = msg.resume ?? null;
    const room = await deps.rooms.findOrRestore(conn.user.id);
    if (room && conn.user && deps.sessions.get(conn.user.id) === conn) room.reattach(conn);
    else conn.send({ t: 'room', room: null });
    // o ponto de retomada vale só para esta volta (depois o navegador já montou outros snapshots)
    conn.resume = null;
    return;
  }

  if (!conn.user) {
    // mensagem que chegou antes do hello terminar (o navegador manda a área da câmera assim que a conexão abre, e o
    // hello com conta espera o Supabase): a área é ignorada; o resto recebe um aviso neutro. Nunca o código 'auth',
    // que faz o navegador sair da conta: até a 1.5.3 isso tirava o jogador da conta a cada reconexão (22/11)
    if (msg.t === 'view') return;
    conn.send({ t: 'error', code: 'not_ready', message: 'Conectando ao servidor, tente de novo em instantes.' });
    return;
  }

  const room = conn.roomCode ? deps.rooms.get(conn.roomCode) : undefined;

  switch (msg.t) {
    case 'view':
      // só muda a frequência com que as tropas longe da câmera são atualizadas; nunca o que o jogador vê (KAC)
      conn.view = msg.rect;
      return;
    case 'create_room': {
      // KAC-03: teto de salas novas por IP (sem isso, um script esgotava as salas do servidor)
      if (!(deps.network ?? networkGuard).createRoom(conn.ip)) {
        kacJournal.record({ category: 'network.room_limit', severity: 'medium', user: conn.user.id, detail: 'salas demais do mesmo IP' });
        conn.send({ t: 'error', code: 'room', message: 'Muitas salas criadas em pouco tempo. Aguarde alguns minutos.' });
        return;
      }
      if (room) room.leave(conn);
      const created = deps.rooms.create(conn, msg.mode, msg.countryId, msg.isPublic === true);
      if (typeof created === 'string') conn.send({ t: 'error', code: 'room', message: created });
      else {
        // tutorial: começa na hora, sem lobby (a partida já avisa a sala)
        if (msg.mode === 'tutorial') created.beginTutorial();
        else created.broadcastRoom();
      }
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
    case 'client_diag': {
      // um navegador com problema pode repetir o mesmo aviso: teto por conexão (o resto é descartado em silêncio)
      if (++conn.diagCount > CLIENT_DIAG_PER_CONNECTION) return;
      const guest = conn.user.id.startsWith('guest:');
      const rec: ClientDiagRecord = {
        user_id: guest ? null : conn.user.id,
        guest,
        display_name: conn.user.name,
        room_code: conn.roomCode,
        in_match: msg.inMatch === true,
        kind: msg.kind,
        detail: msg.detail ?? null,
        device: msg.device ?? null,
        game_version: GAME_VERSION,
      };
      log.info('Diagnóstico do navegador', { kind: rec.kind, room: rec.room_code, inMatch: rec.in_match, detail: rec.detail, gpu: rec.device?.gpu, memoryGb: rec.device?.memoryGb, quality: rec.device?.quality });
      await (deps.saveClientDiag ?? saveClientDiag)(rec);
      return;
    }
    case 'local_match': {
      const seen = (deps.localMatches ??= new Map());
      // repetição do mesmo resultado (a confirmação se perdeu): só confirma de novo
      if (seen.has(msg.id)) {
        conn.send({ t: 'local_match_ok', id: msg.id });
        return;
      }
      const lastOfUser = seen.get(`user:${conn.user.id}`) ?? -Infinity;
      if (Date.now() - lastOfUser < LOCAL_MATCH_COOLDOWN_MS) return;
      const rec = validateLocalMatch(msg.rec, conn.user);
      if (typeof rec === 'string') {
        // recusado de vez: confirma para o navegador não insistir, e fica no log
        log.warn('Resultado de partida local recusado', { reason: rec });
        conn.send({ t: 'local_match_ok', id: msg.id });
        return;
      }
      seen.set(`user:${conn.user.id}`, Date.now());
      const ok = await (deps.recordLocalMatch ?? recordMatch)(rec);
      if (ok) {
        seen.set(msg.id, Date.now());
        if (seen.size > 5000) for (const k of [...seen.keys()].slice(0, 1000)) seen.delete(k);
        conn.send({ t: 'local_match_ok', id: msg.id });
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
    case 'suspend':
      // partidas salvas (24/11): limite por jogador conferido antes de pedir
      if (msg.action === 'request' && room && (await deps.rooms.savedCount(conn.user.id)) >= SAVED_MATCHES.maxPerUser) {
        conn.send({ t: 'cmd_rejected', reason: `Você já tem ${SAVED_MATCHES.maxPerUser} partidas salvas: apague uma no menu para salvar esta.` });
        return;
      }
      room?.suspendAction(conn, msg.action);
      return;
    case 'saved_list':
      conn.send({ t: 'saved_list', items: await deps.rooms.listSaved(conn.user.id) });
      return;
    case 'saved_resume': {
      if (room && room.status !== 'ended') {
        conn.send({ t: 'cmd_rejected', reason: 'Saia da sala atual antes de continuar uma partida salva.' });
        return;
      }
      const r = await deps.rooms.resumeSaved(conn.user.id, msg.code);
      if (typeof r === 'string') {
        conn.send({ t: 'error', code: 'saved', message: r });
        conn.send({ t: 'saved_list', items: await deps.rooms.listSaved(conn.user.id) });
        return;
      }
      r.reattach(conn);
      // avisa os outros comandantes que estão no menu agora
      for (const uid of r.userIds()) {
        if (uid === conn.user.id) continue;
        const s = deps.sessions.get(uid);
        if (s && !s.roomCode) s.send({ t: 'saved_invite', code: r.code, by: conn.user.name });
      }
      return;
    }
    case 'saved_delete':
      await deps.rooms.deleteSaved(conn.user.id, msg.code);
      conn.send({ t: 'saved_list', items: await deps.rooms.listSaved(conn.user.id) });
      return;
    case 'tutorial':
      room?.tutorialInput(conn, msg);
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
