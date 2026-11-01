/* eslint-disable @typescript-eslint/no-explicit-any -- ferramenta de gravação: mexe no estado interno da simulação de propósito */
/** Servidor de gravação: igual ao de jogo, mas a simulação só anda quando o gravador pede (GET /step?n=ticks). */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { Connection } from '../../server/Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from '../../server/handler.ts';
import { NetworkGuard } from '../../server/kac/network.ts';
import { parseClientMessage } from '../../server/messages.ts';
import { RoomManager } from '../../server/RoomManager.ts';
import type { Room } from '../../server/Room.ts';

const rooms = new RoomManager({ reconnectGraceMs: 600_000, record: async () => true, autoLoop: false, seed: Number(process.env.SEED ?? 7) }, 10);
const deps: HandlerDeps = { rooms, allowGuests: true, sessions: new Map(), network: new NetworkGuard(), verify: async () => null };
const all = () => [...(rooms as unknown as { rooms: Map<string, Room> }).rooms.values()];
const http = createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  if (u.pathname === '/step') {
    const n = Number(u.searchParams.get('n') ?? 1);
    { const r = all().at(-1); if (r && r.status === 'playing') for (let i = 0; i < n; i++) r.advance(); }
    res.writeHead(200, { 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ tick: all().at(-1)?.tick ?? 0 }));
    return;
  }
  if (u.pathname === '/setup') {
    // só na gravação: base inimiga, guerra declarada e pesquisas liberadas
    const r = all().at(-1)!;
    const sim = (r as unknown as { sim: any }).sim;
    const plan = JSON.parse(u.searchParams.get('plan') ?? '{}') as { base: [string, number, number][] };
    const made: unknown[] = [];
    for (const [type, cx, cy] of plan.base ?? []) {
      const b = sim.addBuilding(type, 1, { cx, cy }, 1);
      made.push([type, b.id]);
    }
    sim.setWar(0, 1, true);
    // gravação: tudo com energia (a rede elétrica não é o assunto do vídeo)
    sim.isPowered = () => true;
    if (sim.national) {
      const orig = sim.national.techs.bind(sim.national);
      sim.national.techs = (slot: number) => [...new Set([...orig(slot), 'ballistic_missiles', 'nuclear_weapons', 'guided_munitions', 'jet_aviation', 'strategic_bombers'])];
    }
    if (typeof sim.recomputeTerritory === 'function') sim.recomputeTerritory();
    res.writeHead(200, { 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ made, war: sim.formalWar?.(0, 1) }));
    return;
  }
  if (u.pathname === '/enemy') {
    // ordem para as tropas inimigas (slot 1): contra-ataque
    const r = all().at(-1)!;
    const sim = (r as unknown as { sim: any }).sim;
    const c = JSON.parse(u.searchParams.get('cmd') ?? '{}');
    const ids = sim.units.filter((x: any) => x.owner === 1 && (!c.near || Math.hypot(x.pos.x - c.near[0], x.pos.y - c.near[1]) < c.near[2])).map((x: any) => x.id);
    const err = sim.applyCommand(1, { type: 'attack_move', unitIds: ids, x: c.x, y: c.y });
    res.writeHead(200, { 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ n: ids.length, err }));
    return;
  }
  if (u.pathname === '/state') {
    const r = all().at(-1)!;
    const sim = (r as unknown as { sim: any }).sim;
    res.writeHead(200, { 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ tick: sim.tick, launches: sim.air.launches?.map((l: any) => ({ id: l.id, state: l.state })), missions: sim.air.missions?.map((m: any) => ({ id: m.id, state: m.state })), drones: sim.air.drones.drones.map((d: any) => ({ id: d.id, phase: d.phase, end: d.end, x: Math.round(d.pos.x), y: Math.round(d.pos.y), alt: Math.round(d.alt * 10) / 10, tx: Math.round(d.target.x), ty: Math.round(d.target.y) })), silos: sim.buildings.filter((b: any) => b.type === "missile_silo").map((b: any) => [b.id, JSON.stringify(sim.air.silos[b.id] ?? null)]) }));
    return;
  }
  res.writeHead(200, { 'access-control-allow-origin': '*' }).end('{"ok":true}');
});
const wss = new WebSocketServer({ server: http });
wss.on('connection', (ws) => {
  const conn = new Connection(ws);
  ws.on('message', (d) => {
    const m = parseClientMessage(d.toString());
    if (m) void handleMessage(conn, m, deps);
  });
  ws.on('close', () => handleClose(conn, deps));
  ws.on('error', () => {});
});
http.listen(8790, () => console.log('rec server 8790'));
