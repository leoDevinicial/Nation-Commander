import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { GAME_VERSION } from '../shared/version.ts';
import { config } from './config.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { log } from './logger.ts';
import { parseClientMessage } from './messages.ts';
import { isOriginAllowed } from './origins.ts';
import { RoomManager } from './RoomManager.ts';
import { getSupabase, recordMatch, verifyAccessToken } from './supabase.ts';

const rooms = new RoomManager({ reconnectGraceMs: config.reconnectGraceMs, record: recordMatch }, config.maxRooms);
const deps: HandlerDeps = {
  rooms,
  allowGuests: config.allowGuests,
  verify: verifyAccessToken,
  sessions: new Map(),
};

if (!getSupabase()) {
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
  path: '/ws',
  maxPayload: 16 * 1024,
  verifyClient: ({ origin }, done) => {
    if (isOriginAllowed(origin, config.allowedOrigins)) done(true);
    else {
      log.warn('Origem recusada', { origin });
      done(false, 403, 'Origem não permitida');
    }
  },
});

wss.on('connection', (ws) => {
  const conn = new Connection(ws);
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
      if (++conn.violations > 50) conn.close(4008, 'rate limit');
      return;
    }
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      conn.send({ t: 'error', code: 'bad_message', message: 'Mensagem inválida.' });
      return;
    }
    handleMessage(conn, msg, deps).catch((err) => log.error('Erro ao processar mensagem', { err: String(err), t: msg.t }));
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(helloTimeout);
    handleClose(conn, deps);
  });
  ws.on('error', (err) => log.warn('Erro de WebSocket', { err: err.message }));
});

setInterval(() => rooms.sweep(), 30_000).unref();

http.listen(config.port, () => {
  log.info('Servidor de jogo ativo', { port: config.port, version: GAME_VERSION, origins: config.allowedOrigins });
});

const shutdown = () => {
  log.info('Encerrando servidor');
  wss.clients.forEach((c) => c.close(1012, 'Servidor reiniciando'));
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
