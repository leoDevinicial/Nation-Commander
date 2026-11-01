/**
 * KNPS — linha de base de tráfego: roda uma partida contra bots no servidor real (sem rede), mede o tamanho de cada
 * mensagem enviada ao jogador, o custo de montar o snapshot e quanto a compressão permessage-deflate economizaria.
 *
 *   npx tsx scripts/knps-baseline.ts [minutos=12] [bots=3]
 */
import { deflateRawSync } from 'node:zlib';
import type { WebSocket } from 'ws';
import { Connection } from '../server/Connection.ts';
import { handleMessage, type HandlerDeps } from '../server/handler.ts';
import { NetworkGuard } from '../server/kac/network.ts';
import { parseClientMessage } from '../server/messages.ts';
import { RoomManager } from '../server/RoomManager.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { TICK_RATE } from '../shared/sim/config.ts';

const minutes = Number(process.argv[2] ?? 12);
const bots = Number(process.argv[3] ?? 3);
const sent: { at: number; bytes: number; t: string; json: string }[] = [];
let tick = 0;
const ws = {
  readyState: 1,
  OPEN: 1,
  send: (s: string) => sent.push({ at: tick, bytes: Buffer.byteLength(s), t: (JSON.parse(s) as { t: string }).t, json: s }),
  close: () => {},
} as unknown as WebSocket;
const conn = new Connection(ws);
const rooms = new RoomManager({ reconnectGraceMs: 60_000, record: async () => true, autoLoop: false, seed: 11, now: () => tick * 50 }, 10);
const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t }) };
const send = (raw: object) => handleMessage(conn, parseClientMessage(JSON.stringify(raw))!, deps);
await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'ana' });
await send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
for (let i = 1; i < bots; i++) await send({ t: 'add_bot' });
await send({ t: 'start' });
const room = [...(rooms as unknown as { rooms: Map<string, { advance(): void }> }).rooms.values()][0]!;
const total = minutes * 60 * TICK_RATE;
let buildMs = 0;
for (tick = 0; tick < total; tick++) {
  const t0 = performance.now();
  (room as { advance(): void }).advance();
  buildMs += performance.now() - t0;
}
const snaps = sent.filter((m) => m.t === 'snapshot');
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;
const sizes = snaps.map((s) => s.bytes);
const late = snaps.filter((s) => s.at > total * 0.75).map((s) => s.bytes);
// compressão: amostra de 200 snapshots da parte final
const sample = snaps.filter((s) => s.at > total * 0.75).slice(-200);
let rawB = 0;
let defB = 0;
let defMs = 0;
for (const s of sample) {
  const t0 = performance.now();
  const d = deflateRawSync(Buffer.from(s.json), { level: 1 });
  defMs += performance.now() - t0;
  rawB += s.bytes;
  defB += d.length;
}
const byType = new Map<string, number>();
for (const m of sent) byType.set(m.t, (byType.get(m.t) ?? 0) + m.bytes);
const secs = total / TICK_RATE;
console.log(
  JSON.stringify(
    {
      minutos: minutes,
      nacoes: bots + 1,
      snapshots: snaps.length,
      snapshotBytes: { mediana: pct(sizes, 0.5), p95: pct(sizes, 0.95), max: Math.max(...sizes), finalMediana: pct(late, 0.5) },
      kbitPorSegundoMedio: Math.round((sent.reduce((a, m) => a + m.bytes, 0) * 8) / secs / 1000),
      kbitPorSegundoFinal: Math.round((late.reduce((a, b) => a + b, 0) * 8) / (secs * 0.25) / 1000),
      porTipoKB: Object.fromEntries([...byType].map(([k, v]) => [k, Math.round(v / 1024)])),
      deflateNivel1: { razao: +(defB / rawB).toFixed(3), msPorSnapshot: +(defMs / sample.length).toFixed(3) },
      servidorMsPorTick: +(buildMs / total).toFixed(3),
    },
    null,
    1,
  ),
);

// com contexto entre mensagens (permessage-deflate com context takeover): os snapshots seguidos se parecem muito
{
  const { createDeflateRaw, constants } = await import('node:zlib');
  const z = createDeflateRaw({ level: 1, windowBits: 15, memLevel: 8 });
  let out = 0;
  z.on('data', (c: Buffer) => (out += c.length));
  const t0 = performance.now();
  for (const s of sample) await new Promise<void>((r) => z.write(Buffer.from(s.json), () => z.flush(constants.Z_SYNC_FLUSH, () => r())));
  const ms = (performance.now() - t0) / sample.length;
  console.log(JSON.stringify({ deflateComContexto: { razao: +(out / rawB).toFixed(3), msPorSnapshot: +ms.toFixed(3) } }));
}
