/**
 * QA — partidas longas no servidor real (Room) com verificação de invariantes.
 *
 * Um "humano" falso é pilotado pela própria IA tática do jogo: as ordens dele passam pelo caminho real (parser de
 * mensagem → validação do Room → Simulation). Os bots jogam normalmente. A cada snapshot e a cada 5 s de jogo, confere
 * regras que nunca podem quebrar. Uso:
 *
 *   npx tsx scripts/qa-invariantes.ts [seeds=1,2,3] [minutos=30] [nações=4] [mapa=random] [dificuldade=normal]
 */
import type { WebSocket } from 'ws';
import { Connection } from '../server/Connection.ts';
import { handleMessage, type HandlerDeps } from '../server/handler.ts';
import { NetworkGuard } from '../server/kac/network.ts';
import { parseClientMessage } from '../server/messages.ts';
import type { Room } from '../server/Room.ts';
import { RoomManager } from '../server/RoomManager.ts';
import { BUILDINGS, TICK_RATE, UNITS } from '../shared/sim/config.ts';
import { TacticalAI } from '../shared/sim/TacticalAI.ts';
import type { ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';

const seeds = (process.argv[2] ?? '1,2,3').split(',').map(Number);
const minutes = Number(process.argv[3] ?? 30);
const nations = Number(process.argv[4] ?? 4);
const mapType = process.argv[5] ?? 'random';
const difficulty = process.argv[6] ?? 'normal';

const problems = new Map<string, { n: number; first: string }>();
const flag = (key: string, detail: string) => {
  const p = problems.get(key);
  if (p) p.n++;
  else problems.set(key, { n: 1, first: detail });
};
const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function checkSnapshot(seed: number, msg: Extract<ServerMessage, { t: 'snapshot' }>, W: number, H: number): void {
  const s = msg.s;
  for (const u of s.units) {
    if (!fin(u.x) || !fin(u.y)) flag('snap.unit.pos', `seed ${seed} tick ${s.tick} ${u.type} ${u.x},${u.y}`);
    else if (u.x < -0.5 || u.y < -0.5 || u.x > W + 0.5 || u.y > H + 0.5) flag('snap.unit.fora_do_mapa', `seed ${seed} tick ${s.tick} ${u.type} ${u.x},${u.y}`);
    if (!fin(u.hp) || u.hp < 0 || u.hp > u.maxHp + 1e-6) flag('snap.unit.hp', `seed ${seed} tick ${s.tick} ${u.type} hp ${u.hp}/${u.maxHp}`);
  }
  for (const b of s.buildings) {
    if (!fin(b.hp) || b.hp < 0 || b.hp > b.maxHp + 1e-6) flag('snap.building.hp', `seed ${seed} tick ${s.tick} ${b.type} hp ${b.hp}/${b.maxHp}`);
    if (!fin(b.progress) || b.progress < 0 || b.progress > 1 + 1e-6) flag('snap.building.progress', `seed ${seed} ${b.type} ${b.progress}`);
  }
  for (const p of s.players) {
    for (const [k, v] of Object.entries(p.resources ?? {})) if (!fin(v) || (v as number) < -0.01) flag('snap.recurso', `seed ${seed} tick ${s.tick} slot ${p.slot} ${k}=${v}`);
  }
  for (const f of s.air?.flights ?? []) if (!fin(f.x) || !fin(f.y)) flag('snap.voo.pos', `seed ${seed} ${f.plane} ${f.x},${f.y}`);
  for (const d of s.air?.drones ?? []) if (!fin(d.x) || !fin(d.y) || !fin(d.alt)) flag('snap.drone.pos', `seed ${seed} ${d.x},${d.y},${d.alt}`);
  const raw = JSON.stringify(msg);
  if (raw.includes('NaN') || raw.includes('Infinity')) flag('snap.json', `seed ${seed} tick ${s.tick}`);
}

async function run(seed: number): Promise<void> {
  const sent: ServerMessage[] = [];
  const ws = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: (s: string) => sent.push(JSON.parse(s) as ServerMessage), close: () => {} };
  const conn = new Connection(ws as unknown as WebSocket);
  const rooms = new RoomManager({ reconnectGraceMs: 600_000, record: async () => true, autoLoop: false, seed, now: () => 0 }, 10);
  const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t, subscriber: true }) };
  const send = async (raw: object) => {
    const m = parseClientMessage(JSON.stringify(raw));
    if (!m) {
      flag('parser.recusou_ordem_da_ia', JSON.stringify(raw).slice(0, 160));
      return;
    }
    await handleMessage(conn, m, deps);
  };
  await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'qa' });
  await send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
  await send({ t: 'set_room', maxPlayers: nations, mapType });
  await send({ t: 'set_difficulty', difficulty });
  for (let i = 1; i < nations; i++) await send({ t: 'add_bot' });
  await send({ t: 'start' });
  const room = [...(rooms as unknown as { rooms: Map<string, Room> }).rooms.values()][0]!;
  const sim = room.sim!;
  if (!sim) {
    flag('partida.nao_comecou', `seed ${seed} ${JSON.stringify(sent.filter((m) => m.t === 'error'))}`);
    return;
  }
  const me = room.info().players.find((p) => !p.isAI)!.slot;
  const pilot = new TacticalAI(me);
  const W = sim.map.width * sim.map.cellSize;
  const H = sim.map.height * sim.map.cellSize;
  const total = minutes * 60 * TICK_RATE;
  let rejected = 0;
  const rejectReasons = new Map<string, number>();
  const t0 = Date.now();
  for (let t = 0; t < total; t++) {
    if (room.status !== 'playing') break;
    if (t % TICK_RATE === 0 && !sim.players[me]!.defeated) {
      for (const c of pilot.think(sim)) await send({ t: 'cmd', cmd: c });
    }
    try {
      room.advance();
    } catch (err) {
      flag('servidor.excecao', `seed ${seed} tick ${sim.tick} ${String(err)} ${(err as Error).stack?.split('\n').slice(1, 4).join(' | ')}`);
      break;
    }
    if (room.paused && (room as unknown as { pausedBy: string | null }).pausedBy === 'Servidor') {
      flag('servidor.pausou_por_erro', `seed ${seed} tick ${sim.tick}`);
      break;
    }
    // mensagens do servidor
    while (sent.length) {
      const m = sent.shift()!;
      if (m.t === 'snapshot' && !m.scope) checkSnapshot(seed, m, W, H);
      if (m.t === 'cmd_rejected') {
        rejected++;
        rejectReasons.set(m.reason, (rejectReasons.get(m.reason) ?? 0) + 1);
      }
      if (m.t === 'error') flag('servidor.erro_msg', `seed ${seed} ${JSON.stringify(m).slice(0, 200)}`);
    }
    if (t % (5 * TICK_RATE) === 0) {
      for (const e of sim.entities.values()) {
        if (!fin(e.pos.x) || !fin(e.pos.y)) flag('sim.pos', `seed ${seed} tick ${sim.tick} ${e.kind} ${e.type}`);
        if (e.hp > e.maxHp + 1e-6) flag('sim.hp>max', `seed ${seed} ${e.type} ${e.hp}/${e.maxHp}`);
        if (e.kind === 'unit' && e.hp <= 0) flag('sim.unidade_morta_viva', `seed ${seed} tick ${sim.tick} ${e.type}`);
        if (e.kind === 'unit' && !UNITS[e.type]) flag('sim.tipo_desconhecido', `seed ${seed} ${e.type}`);
        if (e.kind === 'building' && !BUILDINGS[e.type]) flag('sim.tipo_desconhecido', `seed ${seed} ${e.type}`);
        if (e.owner < 0 || e.owner >= sim.players.length) flag('sim.dono_invalido', `seed ${seed} ${e.type} owner ${e.owner}`);
        if (sim.players[e.owner]?.defeated) flag('sim.entidade_de_derrotado', `seed ${seed} tick ${sim.tick} ${e.type}`);
      }
      for (const p of sim.players)
        for (const [k, v] of Object.entries(p.resources)) if (!fin(v) || v < -0.01) flag('sim.recurso', `seed ${seed} tick ${sim.tick} slot ${p.slot} ${k}=${v}`);
      // salvar e retomar no meio da partida tem que funcionar sempre
      if (t % (60 * TICK_RATE) === 0 && t > 0) {
        try {
          const save = room.toSave();
          if (save) JSON.parse(JSON.stringify(save));
        } catch (err) {
          flag('save.falhou', `seed ${seed} tick ${sim.tick} ${String(err)}`);
        }
      }
    }
  }
  const alive = sim.players.filter((p) => !p.defeated).length;
  const top = [...rejectReasons].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(
    `seed ${seed}: ${(sim.tick / TICK_RATE / 60).toFixed(1)} min, status ${room.status}, vivos ${alive}/${sim.players.length}, entidades ${sim.entities.size}, ordens recusadas ${rejected} ${JSON.stringify(top)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`,
  );
}

for (const s of seeds) await run(s);
if (!problems.size) console.log('OK: nenhuma invariante quebrada');
for (const [k, v] of problems) console.log(`PROBLEMA ${k} ×${v.n}: ${v.first}`);
