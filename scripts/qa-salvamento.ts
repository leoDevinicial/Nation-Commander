/**
 * QA — salvar e retomar uma partida no meio (o que acontece quando o servidor reinicia). A partida retomada precisa
 * continuar idêntica à original: mesma simulação, mesmas decisões da IA, mesmo estado nacional.
 *
 *   npx tsx scripts/qa-salvamento.ts [seeds=1,2] [minuto_do_salvamento=8] [minutos_depois=4]
 */
import type { WebSocket } from 'ws';
import { Connection } from '../server/Connection.ts';
import { handleMessage, type HandlerDeps } from '../server/handler.ts';
import { NetworkGuard } from '../server/kac/network.ts';
import { parseClientMessage } from '../server/messages.ts';
import { Room, type RoomDeps } from '../server/Room.ts';
import { RoomManager } from '../server/RoomManager.ts';
import { TICK_RATE } from '../shared/sim/config.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';

const seeds = (process.argv[2] ?? '1,2').split(',').map(Number);
const saveAt = Number(process.argv[3] ?? 8);
const after = Number(process.argv[4] ?? 4);
let failures = 0;

for (const seed of seeds) {
  const ws = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: () => {}, close: () => {} };
  const conn = new Connection(ws as unknown as WebSocket);
  const deps0 = { reconnectGraceMs: 600_000, record: async () => true, autoLoop: false, seed, now: () => 0 };
  const rooms = new RoomManager(deps0, 10);
  const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: t }) };
  const send = (raw: object) => handleMessage(conn, parseClientMessage(JSON.stringify(raw))!, deps);
  await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'qa' });
  await send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
  await send({ t: 'add_bot' });
  await send({ t: 'start' });
  const room = [...(rooms as unknown as { rooms: Map<string, Room> }).rooms.values()][0]!;
  for (let i = 0; i < saveAt * 60 * TICK_RATE; i++) room.advance();
  const save = JSON.parse(JSON.stringify(room.toSave()));
  const copy = Room.restore(save, { ...deps0, onEmpty: () => {}, onEnded: () => {} } as RoomDeps);
  let diverged: string | null = null;
  for (let i = 0; i < after * 60 * TICK_RATE && !diverged; i++) {
    room.advance();
    copy.advance();
    if (i % TICK_RATE === 0) {
      const a = room.sim!.serialize();
      const b = copy.sim!.serialize();
      if (a !== b) {
        // primeira diferença, para o diagnóstico
        let k = 0;
        while (k < a.length && a[k] === b[k]) k++;
        diverged = `tick ${room.sim!.tick}: ...${a.slice(Math.max(0, k - 120), k + 80)} ≠ ...${b.slice(Math.max(0, k - 120), k + 80)}`;
      }
    }
  }
  if (diverged) {
    failures++;
    console.log(`seed ${seed}: DIVERGIU depois de retomar — ${diverged}`);
  } else console.log(`seed ${seed}: retomada idêntica por ${after} min (salvo aos ${saveAt} min)`);
}
process.exit(failures ? 1 : 0);
