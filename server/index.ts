import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { kacJournal } from './kac/journal.ts';
import { clientIp, networkGuard } from './kac/network.ts';
import { GAME_VERSION } from '../shared/version.ts';
import { config } from './config.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { log } from './logger.ts';
import { parseClientMessage } from './messages.ts';
import { isOriginAllowed } from './origins.ts';
import { FileMatchStore, SupabaseMatchStore, type MatchStore } from './matchStore.ts';
import { RoomManager } from './RoomManager.ts';
import { getSupabase, recordMatch, verifyAccessToken } from './supabase.ts';

// partidas em andamento sobrevivem a reinícios: Supabase em produção, arquivos no desenvolvimento
const sb = getSupabase();
const store: MatchStore | null = sb ? new SupabaseMatchStore(sb) : config.matchStoreDir ? new FileMatchStore(config.matchStoreDir) : null;
const rooms = new RoomManager({ reconnectGraceMs: config.reconnectGraceMs, record: recordMatch }, config.maxRooms, store);
const deps: HandlerDeps = {
  rooms,
  allowGuests: config.allowGuests,
  verify: verifyAccessToken,
  sessions: new Map(),
};

log.info(store ? 'Partidas em andamento são salvas' : 'Partidas em andamento NÃO são salvas (sem Supabase nem MATCH_STORE_DIR)', { store: store?.kind ?? null });

if (!sb) {
  log.warn('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes: login e gravação de partidas desativados.', {
    allowGuests: config.allowGuests,
  });
}

const http = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, version: GAME_VERSION, ...rooms.stats(), players: deps.sessions.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server: http,
  // aceita /ws e também a raiz, para tolerar VITE_GAME_SERVER_URL sem o sufixo
  path: undefined,
  maxPayload: 16 * 1024,
  verifyClient: ({ origin }, done) => {
    if (isOriginAllowed(origin, config.allowedOrigins)) done(true);
    else {
      log.warn('Origem recusada', { origin });
      done(false, 403, 'Origem não permitida');
    }
  },
});

wss.on('connection', (ws, req) => {
  const conn = new Connection(ws);
  // KAC-03: teto de conexões simultâneas por IP
  conn.ip = clientIp(req);
  if (!networkGuard.connect(conn.ip)) {
    kacJournal.record({ category: 'network.connection_limit', severity: 'medium', detail: 'conexões demais do mesmo IP' });
    ws.close(4009, 'too many connections');
    return;
  }
  let alive = true;
  ws.on('pong', () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 15_000);

  // a conexão precisa se identificar rapidamente
  const helloTimeout = setTimeout(() => {
    if (!conn.user) conn.close(4002, 'hello timeout');
  }, 10_000);

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    if (!conn.allowMessage()) {
      const v = ++conn.violations;
      // KAC: registra a 1ª, a 10ª e a 50ª violação (sem inundar o diário)
      if (v === 1 || v === 10 || v === 50) kacJournal.record({ category: 'protocol.rate_limited', severity: v >= 50 ? 'medium' : 'low', ...(conn.user ? { user: conn.user.id } : {}), detail: `${v} mensagens acima do limite` });
      if (v > 50) conn.close(4008, 'rate limit');
      return;
    }
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      kacJournal.record({ category: 'protocol.malformed', severity: 'low', ...(conn.user ? { user: conn.user.id } : {}) });
      conn.send({ t: 'error', code: 'bad_message', message: 'Mensagem inválida.' });
      return;
    }
    handleMessage(conn, msg, deps).catch((err) => log.error('Erro ao processar mensagem', { err: String(err), t: msg.t }));
  });

  ws.on('close', () => {
    networkGuard.disconnect(conn.ip);
    clearInterval(heartbeat);
    clearTimeout(helloTimeout);
    handleClose(conn, deps);
  });
  ws.on('error', (err) => log.warn('Erro de WebSocket', { err: err.message }));
});

setInterval(() => rooms.sweep(), 30_000).unref();
// KAC: resumo do diário de segurança a cada 10 min (só quando houve algo)
setInterval(() => {
  const summary = kacJournal.summary();
  if (Object.keys(summary).length) log.info('KAC resumo', summary);
}, 10 * 60_000).unref();
let saving = false;
setInterval(() => {
  if (saving) return;
  saving = true;
  void rooms.persistAll().finally(() => (saving = false));
}, config.saveIntervalMs).unref();

http.listen(config.port, () => {
  log.info('Servidor de jogo ativo', { port: config.port, version: GAME_VERSION, origins: config.allowedOrigins });
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('Encerrando servidor');
  // grava o estado final de cada partida ANTES de derrubar as conexões: quando os jogadores
  // reconectam (no servidor novo), a partida é retomada exatamente daqui
  const saved = await Promise.race([rooms.shutdown(), new Promise<number>((r) => setTimeout(() => r(-1), 10_000))]);
  log.info('Partidas salvas no encerramento', { saved });
  wss.clients.forEach((c) => c.close(1012, 'Servidor reiniciando'));
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
