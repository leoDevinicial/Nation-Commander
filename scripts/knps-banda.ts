/**
 * KNPS — banda de uma partida pesada (15/11): 4 nações, o humano pilotado pela IA e dois exércitos de `exercito` tropas
 * marchando um contra o outro (trocam de direção a cada minuto). Mede, por jogador e por hora:
 * - antigo: o snapshot inteiro a cada envio (remontado do delta), cru e com a compressão do WebSocket;
 * - novo: o delta cru, com a compressão do WebSocket (fio) e com a compressão do servidor sem contexto (por mensagem).
 *
 * 21/11: o cliente pede o formato binário (`bin`) e, com `camera=1`, manda a área da câmera (perto da própria base): mede
 * também o binário (`bin*`) e quantas atualizações de tropa esperaram a vez (camera=1 perto da batalha, 2 longe).
 *
 *   npx tsx scripts/knps-banda.ts [minutos=6] [exercito=250] [camera=0|1|2]
 */
import { createDeflateRaw, constants, type DeflateRaw } from 'node:zlib';
import type { WebSocket } from 'ws';
import { Connection } from '../server/Connection.ts';
import { handleMessage, type HandlerDeps } from '../server/handler.ts';
import { NetworkGuard } from '../server/kac/network.ts';
import { parseClientMessage } from '../server/messages.ts';
import { RoomManager } from '../server/RoomManager.ts';
import type { Room } from '../server/Room.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { TICK_RATE } from '../shared/sim/config.ts';
import { TacticalAI } from '../shared/sim/TacticalAI.ts';
import { SnapshotDeltaDecoder } from '../shared/net/delta.ts';
import { decodeSnapshotFrame } from '../shared/net/wire.ts';

const minutes = Number(process.argv[2] ?? 6);
const army = Number(process.argv[3] ?? 250);
// 1: câmera na própria base (perto da batalha); 2: câmera num canto do mapa, longe dela
const camera = Number(process.argv[4] ?? 0);
const sent: (string | Uint8Array)[] = [];
let tick = 0;
const ws = { readyState: 1, OPEN: 1, send: (s: string | Uint8Array) => sent.push(s), close: () => {} } as unknown as WebSocket;
const conn = new Connection(ws);
const rooms = new RoomManager({ reconnectGraceMs: 600_000, record: async () => true, autoLoop: false, seed: 7, now: () => tick * 50 }, 10);
const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t, subscriber: true }) };
const send = async (raw: object) => {
  const m = parseClientMessage(JSON.stringify(raw));
  if (m) await handleMessage(conn, m, deps);
};
await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'qa', bin: true });
await send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
await send({ t: 'set_room', maxPlayers: 4 });
for (let i = 1; i < 4; i++) await send({ t: 'add_bot' });
await send({ t: 'start' });
const room = [...(rooms as unknown as { rooms: Map<string, Room> }).rooms.values()][0]!;
const sim = room.sim!;
const me = room.info().players.find((p) => !p.isAI)!.slot;
const foe = (me + 1) % 4;
const pilot = new TacticalAI(me);
// exércitos grandes: o do jogador e o de um bot, entre as duas bases
const hqA = sim.hqOf(me)!.pos;
const hqB = sim.hqOf(foe)!.pos;
const types = ['infantry', 'tank', 'apc', 'infantry', 'rocket_artillery'];
for (let i = 0; i < army; i++) {
  const k = i / army;
  const a = sim.addUnit(types[i % types.length] as never, me, { x: hqA.x + (hqB.x - hqA.x) * 0.25 + (i % 20) * 0.6, y: hqA.y + (hqB.y - hqA.y) * 0.25 + Math.floor(i / 20) * 0.6 });
  const b = sim.addUnit(types[i % types.length] as never, foe, { x: hqA.x + (hqB.x - hqA.x) * 0.75 + (i % 20) * 0.6, y: hqA.y + (hqB.y - hqA.y) * 0.75 + Math.floor(i / 20) * 0.6 });
  void k;
  void a;
  void b;
}
// os dois exércitos marcham um contra o outro e, a cada minuto, trocam de direção (movimento o tempo todo)
const order = (flip: boolean) => {
  for (const [slot, to] of [[me, flip ? hqA : hqB], [foe, flip ? hqB : hqA]] as const) {
    const ids = sim.units.filter((u) => u.owner === slot).map((u) => u.id);
    for (let i = 0; i < ids.length; i += 50) sim.applyCommand(slot, { type: 'attack_move', unitIds: ids.slice(i, i + 50), x: to.x, y: to.y });
  }
};
order(false);
if (camera) {
  const cs = sim.map.cellSize;
  // a tela de um computador mostra ~30 x 18 células: olhando para a própria base
  const at = camera === 2 ? { x: 15 * cs, y: 9 * cs } : hqA;
  await send({ t: 'view', rect: [at.x - 15 * cs, at.y - 9 * cs, at.x + 15 * cs, at.y + 9 * cs] });
}
const enc = (room as unknown as { deltas: Map<number, { deferred: number }> }).deltas;
let deferred = 0;
let unitPatches = 0;
const total = minutes * 60 * TICK_RATE;
const mk = () => {
  const z = createDeflateRaw({ level: 1, windowBits: 15, memLevel: 8 });
  const st = { z, out: 0 };
  z.on('data', (c: Buffer) => (st.out += c.length));
  return st;
};
const zNew = mk();
const zBin = mk();
let rawBin = 0;
let perMsgBin = 0;
const flushBin = (z: DeflateRaw, d: string | Uint8Array) => new Promise<void>((r) => z.write(typeof d === 'string' ? Buffer.from(d) : Buffer.from(d), () => z.flush(constants.Z_SYNC_FLUSH, () => r())));
const zOld = mk();
const flush = (z: DeflateRaw, s: string) => new Promise<void>((r) => z.write(Buffer.from(s), () => z.flush(constants.Z_SYNC_FLUSH, () => r())));
const dec = new SnapshotDeltaDecoder();
let rawNew = 0;
let perMsg = 0;
const { deflateRawSync } = await import('node:zlib');
let rawOld = 0;
let n = 0;
let maxOld = 0;
for (tick = 0; tick < total; tick++) {
  if (room.status !== 'playing') break;
  if (tick % TICK_RATE === 0) for (const c of pilot.think(sim)) await send({ t: 'cmd', cmd: c });
  room.advance();
  if (tick % (60 * TICK_RATE) === 0 && tick > 0) order((tick / (60 * TICK_RATE)) % 2 === 1);
  deferred += enc.get(me)?.deferred ?? 0;
  while (sent.length) {
    const d = sent.shift()!;
    // binário: mede o quadro como saiu e guarda o texto equivalente para a comparação
    const m = (typeof d === 'string' ? JSON.parse(d) : decodeSnapshotFrame(d)) as { t: string; s?: never; scope?: string };
    const s = typeof d === 'string' ? d : JSON.stringify(m);
    if (m.t === 'snapshot' && !m.scope) unitPatches += ((m.s as unknown as { u?: unknown[] })?.u ?? []).length;
    rawNew += s.length;
    perMsg += s.length > 512 ? deflateRawSync(s, { level: 1 }).length : s.length;
    await flush(zNew.z, s);
    rawBin += d.length;
    perMsgBin += typeof d === 'string' ? (d.length > 512 ? deflateRawSync(d, { level: 1 }).length : d.length) : deflateRawSync(d, { level: 1 }).length;
    await flushBin(zBin.z, d);
    let old = s;
    if (m.t === 'snapshot' && !m.scope) {
      n++;
      old = JSON.stringify({ ...m, s: dec.apply(m.s!) });
      maxOld = Math.max(maxOld, old.length);
    }
    rawOld += old.length;
    await flush(zOld.z, old);
  }
}
const secs = tick / TICK_RATE;
const mbH = (b: number) => +((b / secs) * 3600 / 1048576).toFixed(0);
const moving = sim.units.filter((u) => u.activity === 'moving' || u.activity === 'chasing' || u.activity === 'attacking').length;
console.log(JSON.stringify({ emAcao: moving, minutos: +(secs / 60).toFixed(1), snapshots: n, tropasNoFim: sim.units.length, maiorSnapshotInteiroKB: Math.round(maxOld / 1024),
  antigo: { cruMBporHora: mbH(rawOld), fioMBporHora: mbH(zOld.out) }, novo: { porMensagemMBporHora: mbH(perMsg), cruMBporHora: mbH(rawNew), fioMBporHora: mbH(zNew.out) },
  binario: { porMensagemMBporHora: mbH(perMsgBin), cruMBporHora: mbH(rawBin), fioMBporHora: mbH(zBin.out) }, camera, tropasAtualizadas: unitPatches, tropasQueEsperaram: deferred }));
