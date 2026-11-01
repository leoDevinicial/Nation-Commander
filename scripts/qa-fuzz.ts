/**
 * QA — fuzz de mensagens e ordens. Manda milhares de mensagens com valores aleatórios e maliciosos (tipos errados,
 * números enormes, NaN, ids de outros jogadores, textos estranhos) pelo caminho real do servidor, numa partida em
 * andamento, e acusa qualquer exceção, partida pausada por erro ou invariante quebrada.
 *
 *   npx tsx scripts/qa-fuzz.ts [rodadas=20000] [seed=1]
 */
import type { WebSocket } from 'ws';
import { Connection } from '../server/Connection.ts';
import { handleMessage, type HandlerDeps } from '../server/handler.ts';
import { NetworkGuard } from '../server/kac/network.ts';
import { parseClientMessage } from '../server/messages.ts';
import type { Room } from '../server/Room.ts';
import { RoomManager } from '../server/RoomManager.ts';
import { BUILDINGS, UNITS } from '../shared/sim/config.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';

const ROUNDS = Number(process.argv[2] ?? 20000);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;

const MSG = [
  'create_room',
  'list_rooms',
  'join_room',
  'set_country',
  'set_ready',
  'start',
  'set_room',
  'add_bot',
  'remove_bot',
  'set_bot_country',
  'set_team',
  'cmd',
  'national',
  'set_balance',
  'set_difficulty',
  'pause',
  'speed',
  'chat',
  'ping',
  'community_say',
  'feedback',
];
const CMD = [
  'move',
  'attack_move',
  'attack',
  'stop',
  'build',
  'produce',
  'set_workers',
  'assign_workers',
  'military_research',
  'cancel_military_research',
  'advance_era',
  'cancel_era',
  'lay_mine',
  'build_road',
  'market_sell',
  'market_buy',
  'space_launch',
  'cancel_production',
  'set_rally',
  'upgrade',
  'cancel_upgrade',
  'modernize',
  'cancel_modernize',
  'trade_offer',
  'trade_respond',
  'trade_withdraw',
  'trade_cancel',
  'build_aircraft',
  'air_mission',
  'build_missile',
  'missile_prepare',
  'missile_authorize',
  'missile_abort',
  'launch_drone',
  'drone_control',
  'drone_steer',
  'drone_detonate',
  'launch_operation',
  'operation_retreat',
];
const NAT = [
  'establish_contact',
  'declare_war',
  'propose',
  'request_sanctions',
  'impose_sanctions',
  'lift_sanctions',
  'send_aid',
  'set_mission',
  'cancel_treaty',
  'set_budget',
  'set_policy',
  'start_research',
  'decree',
];

function main() {
  const out: string[] = [];
  const problems = new Map<string, string>();
  const flag = (k: string, d: string) => problems.has(k) || problems.set(k, d);
  const ws = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: (s: string) => out.push(s), close: () => {} };
  const conn = new Connection(ws as unknown as WebSocket);
  const rooms = new RoomManager({ reconnectGraceMs: 600_000, record: async () => true, autoLoop: false, seed: 3, now: () => 0 }, 10);
  const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t }) };
  return { out, problems, flag, conn, rooms, deps };
}

const { out, problems, flag, conn, rooms, deps } = main();
const send = async (raw: unknown) => {
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    return;
  }
  let m;
  try {
    m = parseClientMessage(text);
  } catch (err) {
    flag('parser.excecao', `${String(err)} ${text.slice(0, 200)}`);
    return;
  }
  if (!m) return;
  try {
    await handleMessage(conn, m, deps);
  } catch (err) {
    flag(`handler.excecao.${(raw as { t?: string }).t}`, `${String(err)} ${(err as Error).stack?.split('\n').slice(1, 3).join(' | ')} ${text.slice(0, 200)}`);
  }
};

await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'fuzz' });
await send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
await send({ t: 'add_bot' });
await send({ t: 'start' });
const room = [...(rooms as unknown as { rooms: Map<string, Room> }).rooms.values()][0]!;
const sim = room.sim!;
for (let i = 0; i < 200; i++) room.advance();

const ids = () => [...sim.entities.keys()];
const weird = (): unknown =>
  pick<() => unknown>([
    () => Math.floor(rnd() * 200),
    () => rnd() * 200,
    () => -1,
    () => 1e308,
    () => -1e308,
    () => Number.NaN,
    () => 0,
    () => '',
    () => 'x'.repeat(5000),
    () => null,
    () => true,
    () => [],
    () => ({}),
    () => [1, 2, 3],
    () => pick(ids()) ?? 1,
    () => pick(ids()) ?? 1,
    () => pick(Object.keys(UNITS)),
    () => pick(Object.keys(BUILDINGS)),
    () => '__proto__',
    () => 'constructor',
    () => '<script>',
    () => 'BRA',
  ])();
const fields = [
  'unitIds',
  'x',
  'y',
  'targetId',
  'buildingType',
  'cx',
  'cy',
  'buildingId',
  'unitType',
  'count',
  'sources',
  'researchId',
  'cells',
  'resource',
  'quantity',
  'spec',
  'mod',
  'partner',
  'side',
  'price',
  'mode',
  'days',
  'offerId',
  'accept',
  'contractId',
  'aircraftType',
  'aircraftIds',
  'mission',
  'nuclear',
  'launchId',
  'droneId',
  'take',
  'turn',
  'climb',
  'throttle',
  'target',
  'sectorId',
  'opId',
  'key',
  'value',
  'enemy',
  'maxed',
  'level',
  'ids',
  'who',
  'text',
  'slot',
  'countryId',
  'ready',
  'team',
  'maxPlayers',
  'mapType',
  'name',
  'isPublic',
  'difficulty',
  'speed',
  'code',
  'budget',
  'policy',
  'kind',
  'amount',
];
const randomPayload = () => {
  const o: Record<string, unknown> = {};
  const n = 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) o[pick(fields)] = rnd() < 0.3 ? [weird(), weird()] : weird();
  if (rnd() < 0.5)
    o.unitIds = ids()
      .slice(0, Math.floor(rnd() * 8))
      .map((x) => (rnd() < 0.1 ? weird() : x));
  return o;
};

const t0 = Date.now();
for (let r = 0; r < ROUNDS; r++) {
  const t = rnd() < 0.7 ? 'cmd' : pick(MSG);
  if (t === 'cmd') await send({ t: 'cmd', cmd: { type: pick(CMD), ...randomPayload() }, ...(rnd() < 0.1 ? { scope: 'battle' } : {}) });
  else if (t === 'national') await send({ t: 'national', cmd: { type: pick(NAT), ...randomPayload() } });
  else await send({ t, ...randomPayload() });
  if (r % 5 === 0) {
    try {
      room.advance();
    } catch (err) {
      flag('advance.excecao', `${String(err)} ${(err as Error).stack?.split('\n').slice(1, 4).join(' | ')}`);
    }
  }
  if (room.paused && (room as unknown as { pausedBy: string | null }).pausedBy === 'Servidor') {
    flag('partida.pausada_por_erro', `rodada ${r}`);
    break;
  }
  if (room.status !== 'playing') {
    // recomeça uma partida para continuar
    await send({ t: 'leave_room' });
    break;
  }
  out.length = 0;
}
for (const e of sim.entities.values())
  if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.y) || !Number.isFinite(e.hp)) flag('sim.nan', `${e.kind} ${e.type} ${e.pos.x},${e.pos.y} hp ${e.hp}`);
for (const p of sim.players) for (const [k, v] of Object.entries(p.resources)) if (!Number.isFinite(v) || v < -0.01) flag('sim.recurso', `slot ${p.slot} ${k}=${v}`);
console.log(`fuzz: ${ROUNDS} rodadas, tick ${sim.tick}, status ${room.status}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (!problems.size) console.log('OK: nenhuma exceção');
for (const [k, v] of problems) console.log(`PROBLEMA ${k}: ${v}`);
