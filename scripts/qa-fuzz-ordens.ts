/**
 * QA — fuzz estruturado de ordens: para cada tipo de ordem, gera ordens de formato válido com valores reais e extremos
 * (ids próprios e do inimigo, posições no mapa e nas bordas, quantidades enormes, frações, negativos) e manda pelo
 * caminho do servidor. Conta quantas o jogo aceitou (para garantir que o teste chega na simulação) e acusa exceções,
 * invariantes quebradas e recursos que aparecem do nada.
 *
 *   npx tsx scripts/qa-fuzz-ordens.ts [rodadas=30000] [seed=1] [sandbox=0]
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

const ROUNDS = Number(process.argv[2] ?? 30000);
let seed = Number(process.argv[3] ?? 1);
const SANDBOX = process.argv[4] === '1';
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;

const sent: { t: string; reason?: string }[] = [];
const ws = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: (s: string) => sent.push(JSON.parse(s)), close: () => {} };
const conn = new Connection(ws as unknown as WebSocket);
const rooms = new RoomManager({ reconnectGraceMs: 600_000, record: async () => true, autoLoop: false, seed: 5, now: () => 0 }, 10);
const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t }) };
const problems = new Map<string, string>();
const flag = (k: string, d: string) => problems.has(k) || problems.set(k, d);
const send = async (raw: object) => {
  const m = parseClientMessage(JSON.stringify(raw));
  if (!m) return false;
  try {
    await handleMessage(conn, m, deps);
  } catch (err) {
    flag(`handler.${(raw as { cmd?: { type?: string } }).cmd?.type ?? (raw as { t: string }).t}`, `${String(err)} ${(err as Error).stack?.split('\n').slice(1, 3).join(' | ')}`);
  }
  return true;
};
await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'fuzz' });
await send({ t: 'create_room', mode: SANDBOX ? 'sandbox' : 'vs_ai', countryId: 'BRA' });
await send({ t: 'start' });
const room = [...(rooms as unknown as { rooms: Map<string, Room> }).rooms.values()][0]!;
const sim = room.sim!;
const me = room.info().players.find((p) => !p.isAI)!.slot;
// recursos fartos para as ordens chegarem longe
for (const p of sim.players) for (const k of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[k] = 50_000;
for (let i = 0; i < 100; i++) room.advance();
const W = sim.map.width,
  H = sim.map.height,
  CS = sim.map.cellSize;
const mine = (k?: 'unit' | 'building') => [...sim.entities.values()].filter((e) => e.owner === me && (!k || e.kind === k)).map((e) => e.id);
const enemy = () => [...sim.entities.values()].filter((e) => e.owner !== me).map((e) => e.id);
const hq = [...sim.entities.values()].find((e) => e.owner === me && e.kind === 'building' && e.type === 'hq') as { cell: { cx: number; cy: number } } | undefined;
const near = (c: number) => Math.max(0, Math.min(W - 1, c + Math.floor((rnd() - 0.5) * 24)));
const cell = () => (rnd() < 0.75 && hq ? near(rnd() < 0.5 ? hq.cell.cx : hq.cell.cy) : pick([Math.floor(rnd() * W), 0, -1, W - 1, W, W + 10, 1e6, Math.floor(rnd() * W) + 0.5]));
const num = () => pick([0, 1, 2, 5, 10, 100, -1, -100, 0.5, 1e9, 1e308, -1e308, 3.7]);
const coordW = () => (rnd() < 0.6 && hq ? near(hq.cell.cx) * CS + rnd() * 30 : pick([rnd() * W * CS, 0, -5, W * CS, W * CS + 50, 1e9, -1e9, 0.001, W * CS - 0.001]));
const id = () => pick([...mine(), ...mine(), ...enemy(), 0, -1, 1e9, 999_999]);
const bid = () => pick([...mine('building'), ...mine('building'), ...enemy(), -1, 1e9]);
const uids = () => Array.from({ length: Math.floor(rnd() * 6) }, () => (rnd() < 0.8 ? (pick([...mine('unit'), ...enemy()]) ?? 0) : id()));
const res = () => pick(['food', 'wood', 'stone', 'iron', 'oil', 'coal', 'supplies', 'gold', '__proto__', 'x']);
const GEN: Record<string, () => object> = {
  move: () => ({ unitIds: uids(), x: coordW(), y: coordW() }),
  attack_move: () => ({ unitIds: uids(), x: coordW(), y: coordW() }),
  attack: () => ({ unitIds: uids(), targetId: id() }),
  stop: () => ({ unitIds: uids() }),
  build: () => ({ buildingType: pick(Object.keys(BUILDINGS)), cx: cell(), cy: cell() }),
  produce: () => ({ buildingId: bid(), unitType: pick([...Object.keys(UNITS), 'citizen', 'recruit', 'x']) }),
  set_workers: () => ({ buildingId: bid(), count: num() }),
  assign_workers: () => ({ buildingId: bid(), sources: Array.from({ length: Math.floor(rnd() * 8) }, () => pick([Math.floor(rnd() * W * H), -1, 1e9])) }),
  military_research: () => ({
    buildingId: bid(),
    researchId: pick([
      'tracked_armor',
      'field_artillery',
      'combat_engineering',
      'antitank_weapons',
      'mobile_air_defense',
      'special_operations',
      'rocket_systems',
      'modern_armor',
      'point_defense',
      'x',
    ]),
  }),
  cancel_military_research: () => ({ buildingId: bid() }),
  advance_era: () => ({}),
  cancel_era: () => ({}),
  lay_mine: () => ({ unitIds: uids(), x: coordW(), y: coordW() }),
  build_road: () => ({ cells: Array.from({ length: pick([1, 3, 10, 200]) }, () => ({ cx: cell(), cy: cell() })) }),
  market_sell: () => ({ buildingId: bid(), resource: res(), quantity: num() }),
  market_buy: () => ({ buildingId: bid(), resource: res(), quantity: num() }),
  space_launch: () => ({ buildingId: bid() }),
  cancel_production: () => ({ buildingId: bid() }),
  set_rally: () => ({ buildingId: bid(), x: coordW(), y: coordW() }),
  upgrade: () => ({ buildingId: bid(), ...(rnd() < 0.5 ? { spec: pick(['economy', 'military', 'defense', 'x']) } : {}) }),
  cancel_upgrade: () => ({ buildingId: bid() }),
  modernize: () => ({ unitIds: uids(), mod: pick(['armor', 'optics', 'era_kit', 'x']) }),
  cancel_modernize: () => ({ unitIds: uids() }),
  trade_offer: () => ({
    partner: pick([0, 1, 2, -1, 9]),
    side: pick(['buy', 'sell']),
    resource: res(),
    quantity: num(),
    price: num(),
    mode: pick(['road', 'rail', 'sea', 'air', 'x']),
    days: num(),
  }),
  trade_respond: () => ({ offerId: num(), accept: rnd() < 0.5 }),
  trade_withdraw: () => ({ offerId: num() }),
  trade_cancel: () => ({ contractId: num() }),
  build_aircraft: () => ({ buildingId: bid(), aircraftType: pick(['fighter', 'bomber', 'recon', 'transport', 'drone', 'x']) }),
  air_mission: () => ({ buildingId: bid(), aircraftIds: Array.from({ length: 3 }, () => num()), mission: pick(['strike', 'recon']), targetId: id(), x: coordW(), y: coordW() }),
  build_missile: () => ({ buildingId: bid(), nuclear: rnd() < 0.5 }),
  missile_prepare: () => ({ buildingId: bid(), x: coordW(), y: coordW(), nuclear: rnd() < 0.5 }),
  missile_authorize: () => ({ launchId: num() }),
  missile_abort: () => ({ launchId: num() }),
  launch_drone: () => ({ buildingId: bid(), x: coordW(), y: coordW() }),
  drone_control: () => ({ droneId: pick([...sim.air.drones.drones.map((d) => d.id), num()]), take: rnd() < 0.5 }),
  drone_steer: () => ({ droneId: pick([...sim.air.drones.drones.map((d) => d.id), num()]), turn: num(), climb: num(), throttle: num() }),
  drone_detonate: () => ({ droneId: pick([...sim.air.drones.drones.map((d) => d.id), num()]) }),
  launch_operation: () => ({ target: pick([0, 1, -1, 7]), sectorId: pick(['a', 'b', 'north', 'x', '']), unitIds: uids() }),
  operation_retreat: () => ({ opId: num() }),
  sandbox_toggle: () => ({ key: pick(['instant', 'reveal', 'aiActive', 'x']), value: rnd() < 0.5 }),
  sandbox_spawn: () => ({ unitType: pick(Object.keys(UNITS)), x: coordW(), y: coordW(), count: num(), enemy: rnd() < 0.5, maxed: rnd() < 0.5 }),
  sandbox_level: () => ({ buildingId: bid(), level: num() }),
  sandbox_maxout: () => ({ unitIds: uids() }),
  sandbox_remove: () => ({ ids: uids() }),
  sandbox_clear: () => ({ who: pick(['enemy', 'mine']) }),
};
const tried = new Map<string, number>();
const accepted = new Map<string, number>();
const t0 = Date.now();
for (let r = 0; r < ROUNDS && room.status === 'playing'; r++) {
  const type = pick(Object.keys(GEN));
  const cmd = { type, ...GEN[type]!() };
  const okParse = await send({ t: 'cmd', cmd });
  if (okParse) tried.set(type, (tried.get(type) ?? 0) + 1);
  sent.length = 0;
  room.advance();
  const rej = sent.some((m) => m.t === 'cmd_rejected');
  if (okParse && !rej) accepted.set(type, (accepted.get(type) ?? 0) + 1);
  sent.length = 0;
  if (room.paused && (room as unknown as { pausedBy: string | null }).pausedBy === 'Servidor') {
    flag('partida.pausada_por_erro', `após ${type} ${JSON.stringify(cmd).slice(0, 300)}`);
    break;
  }
  if (r % 50 === 0) {
    for (const e of sim.entities.values())
      if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.y) || !Number.isFinite(e.hp) || e.hp > e.maxHp + 1e-6) {
        flag('sim.entidade_invalida', `${e.type} ${e.pos.x},${e.pos.y} hp ${e.hp}/${e.maxHp} após ${type} ${JSON.stringify(cmd).slice(0, 200)}`);
      }
    for (const p of sim.players)
      for (const [k, v] of Object.entries(p.resources)) {
        if (!Number.isFinite(v) || v < -0.01) flag('sim.recurso_invalido', `slot ${p.slot} ${k}=${v} após ${type} ${JSON.stringify(cmd).slice(0, 200)}`);
        if (v > 1e7) flag('sim.recurso_infinito', `slot ${p.slot} ${k}=${v} após ${type} ${JSON.stringify(cmd).slice(0, 200)}`);
      }
  }
}
console.log(`fuzz-ordens: tick ${sim.tick}, ${((Date.now() - t0) / 1000).toFixed(0)} s, status ${room.status}, entidades ${sim.entities.size}`);
console.log('aceitas/tentadas:', JSON.stringify(Object.fromEntries([...tried].map(([k, n]) => [k, `${accepted.get(k) ?? 0}/${n}`]))));
if (!problems.size) console.log('OK: nenhum problema');
for (const [k, v] of problems) console.log(`PROBLEMA ${k}: ${v}`);
