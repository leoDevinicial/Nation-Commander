import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { kacJournal } from './kac/journal.ts';
import { clientIp, networkGuard } from './kac/network.ts';
import { KacEventStore, STORE_POLICY } from './kac/store.ts';
import { KacAdmin } from './kac/admin.ts';
import { GAME_VERSION } from '../shared/version.ts';
import { config } from './config.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { log } from './logger.ts';
import { parseClientMessage } from './messages.ts';
import { isOriginAllowed } from './origins.ts';
import { FileMatchStore, SupabaseMatchStore, type MatchStore } from './matchStore.ts';
import { RoomManager } from './RoomManager.ts';
import { KNPS_DEFLATE } from './knps/transport.ts';
import { RegionTelemetry, regionFromEnv } from './knps/region.ts';
import { getSupabase, kacSupabaseBackend, recordMatch, verifyAccessToken } from './supabase.ts';
import { DbDetailsCache, DbStatsCache, PROVISIONAL_DETAILS_KEY_SHA256, PROVISIONAL_STATS_TOKEN, StatsGate, matchTally, recentMatches } from './stats.ts';

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

// KAC-08: eventos de gravidade média ou maior vão para a tabela kac_events do Supabase (em lotes)
const kacStore = sb ? new KacEventStore(kacSupabaseBackend) : null;
if (kacStore) {
  kacJournal.setSink((e) => kacStore.push(e));
  setInterval(() => void kacStore.flush(), STORE_POLICY.flushMs).unref();
}
// KAC: painel de leitura da equipe (GET /kac com Authorization: Bearer KAC_ADMIN_TOKEN); sem token, não existe
const kacAdmin = new KacAdmin(config.kacAdminToken || undefined, { journal: kacJournal, store: kacStore, network: networkGuard, startedAt: Date.now() });
if (config.kacAdminToken && !kacAdmin.enabled) log.warn('KAC_ADMIN_TOKEN curto demais (mínimo 24 caracteres): painel /kac desligado');

// painel de números (06/11): GET /stats com Authorization: Bearer STATS_TOKEN; sem token, não existe
// sem STATS_TOKEN no Render, vale a chave provisória (stats.ts)
// detalhes (07/11: feedbacks e últimas partidas com o nome dos comandantes): só o STATS_TOKEN de verdade ou, sem ele, a
// chave de detalhes provisória (no código fica só o hash). A chave de detalhes também abre os números.
const detailsHash = Buffer.from(PROVISIONAL_DETAILS_KEY_SHA256, 'hex');
const statsGate = new StatsGate(config.statsToken || PROVISIONAL_STATS_TOKEN, Date.now, config.statsToken ? [] : [detailsHash]);
const detailsGate = config.statsToken ? new StatsGate(config.statsToken) : new StatsGate(undefined, Date.now, [detailsHash]);
const dbStats = new DbStatsCache(getSupabase);
const dbDetails = new DbDetailsCache(getSupabase);
if (config.statsToken && !statsGate.enabled) log.warn('STATS_TOKEN curto demais (mínimo 24 caracteres): painel /stats desligado');

// KNPS-08: região deste servidor (letra no início dos códigos de sala) e o agregado do ping de rede dos jogadores
const region = regionFromEnv(process.env);
rooms.codePrefix = region.letter;
const regionTelemetry = new RegionTelemetry();
if (region.id) log.info('Região do servidor', { region: region.id, letter: region.letter || null });

const http = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  // KNPS: sonda leve de ping por HTTP (o cliente mede cada região antes de criar a sala). Sem dados, sem cache.
  if (path === '/knps/ping') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'timing-allow-origin': '*' });
    res.end();
    return;
  }
  // KNPS-08: salas públicas desta região, para a lista que junta todas as regiões (as mesmas que o list_rooms mostra
  // a qualquer jogador conectado). Só para as origens do jogo.
  if (path === '/knps/rooms' && req.method === 'GET') {
    const origin = req.headers.origin;
    const allowed = isOriginAllowed(origin, config.allowedOrigins);
    res.writeHead(allowed ? 200 : 403, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(allowed && origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    });
    res.end(allowed ? JSON.stringify({ region: region.id, rooms: rooms.listPublic() }) : '{}');
    return;
  }
  if (path === '/stats' || path === '/stats/details') {
    // a página /painel do site chama daqui: CORS só para as origens do jogo, com o cabeçalho Authorization
    const origin = req.headers.origin;
    const allowed = isOriginAllowed(origin, config.allowedOrigins);
    const cors = allowed && origin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization', 'access-control-allow-methods': 'GET', vary: 'Origin' } : {};
    const gate = path === '/stats' ? statsGate : detailsGate;
    if (req.method === 'OPTIONS') {
      res.writeHead(allowed && gate.enabled ? 204 : 404, { ...cors, 'cache-control': 'no-store' });
      res.end();
      return;
    }
    const status = req.method === 'GET' ? gate.check(req.headers.authorization, clientIp(req)) : 404;
    if (status !== 200) {
      res.writeHead(status, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: status === 404 ? 'not_found' : status === 429 ? 'too_many_attempts' : 'unauthorized' }));
      return;
    }
    const now = Date.now();
    if (path === '/stats/details') {
      void dbDetails.get(now).then(({ emails, ...db }) => {
        // e-mail de quem tem conta nas partidas da memória (11/11); o id da conta não sai daqui
        const recent = recentMatches.all().map((m) => ({
          ...m,
          players: m.players.map(({ uid, ...p }) => ({ ...p, ...(uid && emails?.has(uid) ? { email: emails.get(uid)! } : {}) })),
        }));
        res.writeHead(200, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ now: new Date(now).toISOString(), region: region.id || null, recent, db }));
      });
      return;
    }
    void dbStats.get(now).then((db) => {
      res.writeHead(200, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(
        JSON.stringify({
          now: new Date(now).toISOString(),
          region: region.id || null,
          online: deps.sessions.size,
          inMatches: rooms.humansInMatches(),
          matchesRunning: rooms.stats().playing,
          db,
          server: { since: new Date(matchTally.startedAt).toISOString(), today: matchTally.today(now) },
        }),
      );
    });
    return;
  }
  if (path === '/kac' && req.method === 'GET') {
    const reply = kacAdmin.handle(new URL(req.url ?? '/kac', 'http://local'), req.headers.authorization, clientIp(req));
    res.writeHead(reply.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(reply.body));
    return;
  }
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(
      JSON.stringify({
        ok: true,
        version: GAME_VERSION,
        ...rooms.stats(),
        players: deps.sessions.size,
        region: region.id || null,
        letter: region.letter || null,
        rttBuckets: regionTelemetry.summary(),
      }),
    );
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server: http,
  // aceita /ws e também a raiz, para tolerar VITE_GAME_SERVER_URL sem o sufixo
  path: undefined,
  maxPayload: 16 * 1024,
  // KNPS-01: snapshots comprimidos com contexto (~5% do tamanho); ver server/knps/transport.ts
  perMessageDeflate: KNPS_DEFLATE,
  verifyClient: ({ origin }, done) => {
    if (isOriginAllowed(origin, config.allowedOrigins)) done(true);
    else {
      log.warn('Origem recusada', { origin });
      done(false, 403, 'Origem não permitida');
    }
  },
});

let xffMaxHops = 0;
wss.on('connection', (ws, req) => {
  const conn = new Connection(ws);
  // KAC-03: teto de conexões simultâneas por IP
  conn.ip = clientIp(req);
  // KAC-04: quantos endereços vêm no X-Forwarded-For (só a contagem, sem IPs), para confirmar o proxy do Render
  const xff = req.headers['x-forwarded-for'];
  xffMaxHops = Math.max(xffMaxHops, (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').filter((x) => x.trim()).length);
  if (!networkGuard.connect(conn.ip)) {
    kacJournal.record({ category: 'network.connection_limit', severity: 'medium', detail: 'conexões demais do mesmo IP' });
    ws.close(4009, 'too many connections');
    return;
  }
  // KNPS: ping de protocolo a cada 5 s. O navegador responde sozinho (sem passar pela página): é o ping de rede real.
  // Três sem resposta (~15 s, como antes) derrubam o socket morto.
  ws.on('pong', () => {
    const rtt = conn.rtt.pong(Date.now());
    if (rtt !== null && conn.user) conn.send({ t: 'net', rtt: Math.round(rtt), region: region.label });
  });
  const heartbeat = setInterval(() => {
    if (conn.rtt.missed >= 2) return ws.terminate();
    conn.rtt.sent(Date.now());
    ws.ping();
  }, 5_000);

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
    if (conn.rtt.count >= 3) regionTelemetry.record(conn.rtt.median!);
    networkGuard.disconnect(conn.ip);
    clearInterval(heartbeat);
    clearTimeout(helloTimeout);
    handleClose(conn, deps);
  });
  ws.on('error', (err) => log.warn('Erro de WebSocket', { err: err.message }));
});

setInterval(() => {
  rooms.sweep();
  networkGuard.sweep();
}, 30_000).unref();
// KNPS: o lobby mostra o ping de cada jogador; atualiza a cada 5 s enquanto a partida não começa
setInterval(() => rooms.refreshLobbies(), 5_000).unref();
// KAC: resumo do diário de segurança a cada 10 min (quando houve evento ou há jogadores conectados)
setInterval(() => {
  const summary = kacJournal.summary();
  const net = networkGuard.stats();
  // busiestIp alto com muitos jogadores = vários jogadores atrás de um IP só (proxy na frente do Render?): rever KAC-04
  if (Object.keys(summary).length || net.connections) log.info('KAC resumo', { ...summary, rede: net, xffMaxHops, fila: kacStore ? { pendente: kacStore.pending, descartados: kacStore.dropped } : null });
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
  // KAC-08: grava o que ainda estava na fila do diário
  if (kacStore) await Promise.race([kacStore.drain(), new Promise((r) => setTimeout(r, 2_000))]);
  wss.clients.forEach((c) => c.close(1012, 'Servidor reiniciando'));
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
