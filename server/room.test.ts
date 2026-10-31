import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { Connection } from './Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from './handler.ts';
import { parseClientMessage } from './messages.ts';
import { RoomManager } from './RoomManager.ts';
import { CommunityChat } from './communityChat.ts';
import type { MatchRecord } from './supabase.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { COUNTRIES } from '../shared/data/countries.ts';
import { PREPARATION_TICKS } from '../shared/sim/config.ts';
import { UPGRADE_CANCEL_REFUND, upgradeCost } from '../shared/sim/upgrades.ts';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => sent.push(JSON.parse(s) as ServerMessage),
    close: vi.fn(),
  } as unknown as WebSocket;
  const conn = new Connection(ws);
  return { conn, sent, last: <T extends ServerMessage['t']>(t: T) => sent.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined };
}

function setup(now = { t: 0 }) {
  const records: MatchRecord[] = [];
  const rooms = new RoomManager(
    {
      reconnectGraceMs: 1000,
      record: async (r) => {
        records.push(r);
        return true;
      },
      autoLoop: false,
      seed: 5,
      now: () => now.t,
    },
    10,
  );
  const deps: HandlerDeps = {
    rooms,
    allowGuests: false,
    sessions: new Map(),
    verify: async (token) => (token.startsWith('ok-') ? { id: token.slice(3), name: token.slice(3) } : null),
  };
  const send = (c: Connection, raw: object) => {
    const msg = parseClientMessage(JSON.stringify(raw));
    if (!msg) throw new Error('mensagem inválida no teste');
    return handleMessage(c, msg, deps);
  };
  return { rooms, deps, records, send, now };
}

describe('servidor de partidas', () => {
  it('recusa conexão sem token quando convidados estão desativados', async () => {
    const { send } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: null });
    expect(a.last('error')?.code).toBe('auth');
    expect(a.conn.user).toBeNull();
  });

  it('recusa token inválido e versão de protocolo diferente', async () => {
    const { send } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'bad' });
    expect(a.last('error')?.code).toBe('auth');
    const b = fakeConn();
    await send(b.conn, { t: 'hello', protocol: 999, token: 'ok-x' });
    expect(b.last('error')?.code).toBe('protocol');
  });

  it('fluxo PvP: criar, entrar, pronto, iniciar, comandar e encerrar com gravação', async () => {
    const { send, rooms, records } = setup();
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-alice' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-bob' });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
    expect(b.last('room')!.room!.players).toHaveLength(2);

    await send(a.conn, { t: 'start' });
    expect(a.last('error')?.message).toBe('Nem todos estão prontos');
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const start = b.last('match_start')!.match;
    expect(start.yourSlot).toBe(1);
    expect(start.terrain).toHaveLength(start.width * start.height);

    const room = rooms.get(code)!;
    const sim = room.sim!;
    const myUnit = sim.units.find((u) => u.owner === 0)!;
    const enemyUnit = sim.units.find((u) => u.owner === 1)!;
    // B tenta mover unidade de A: recusado pela simulação
    await send(b.conn, { t: 'cmd', cmd: { type: 'move', unitIds: [myUnit.id], x: 60, y: 60 } });
    room.advance();
    expect(b.last('cmd_rejected')).toBeDefined();
    // A move a própria unidade
    await send(a.conn, { t: 'cmd', cmd: { type: 'move', unitIds: [myUnit.id], x: myUnit.pos.x + 6, y: myUnit.pos.y } });
    room.advance();
    expect(myUnit.order.kind).toBe('move');
    expect(enemyUnit.order.kind).toBe('idle');
    expect(a.last('snapshot')!.s.units.length).toBeGreaterThan(0);

    // velocidade é fixa em PvP
    await send(a.conn, { t: 'speed', speed: 4 });
    expect(a.last('cmd_rejected')?.reason).toMatch(/Velocidade/);

    await send(b.conn, { t: 'surrender' });
    await vi.waitFor(() => expect(a.last('match_end')).toBeDefined());
    const end = a.last('match_end')!.end;
    expect(end.winnerSlot).toBe(0);
    expect(end.reason).toBe('forfeit');
    expect(end.recorded).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]!.winner_id).toBe('alice');
    expect(records[0]!.players.map((p) => p.result)).toEqual(['win', 'loss']);
    // relatório pós-partida vai junto para o histórico, igual ao da tela de resultado
    expect(records[0]!.report.samples.length).toBeGreaterThan(0);
    expect(records[0]!.report.medals.map((m) => m.slot)).toEqual([0, 1]);
    // relatório pós-partida: amostra inicial e final, medalha de vitória para quem venceu
    expect(end.report!.samples.length).toBeGreaterThanOrEqual(2);
    expect(end.report!.medals.find((m) => m.slot === 0)!.medals).toContain('victory');
    expect(end.report!.medals.find((m) => m.slot === 1)!.medals).not.toContain('victory');
  });

  it('pausa impede o avanço da simulação; reconexão restaura a partida', async () => {
    const now = { t: 0 };
    const { send, rooms, deps } = setup(now);
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-carol' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(a.last('room')!.room!.code)!;
    const loop = () => (room as unknown as { onLoop(): void }).onLoop();

    now.t += 200;
    loop();
    const t1 = room.sim!.tick;
    expect(t1).toBe(4); // 200 ms a 20 ticks/s

    await send(a.conn, { t: 'pause', paused: true });
    now.t += 2000;
    loop();
    expect(room.sim!.tick).toBe(t1);

    await send(a.conn, { t: 'pause', paused: false });
    await send(a.conn, { t: 'speed', speed: 2 });
    now.t += 100;
    loop();
    expect(room.sim!.tick).toBe(t1 + 4);

    // desconecta: em vs_ai a partida pausa automaticamente
    handleClose(a.conn, deps);
    expect(room.paused).toBe(true);
    const a2 = fakeConn();
    await send(a2.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-carol' });
    expect(a2.last('match_start')).toBeDefined();
    expect(a2.last('snapshot')).toBeDefined();
  });

  it('abandono após o prazo de reconexão encerra a partida', async () => {
    const now = { t: 0 };
    const { send, rooms, deps } = setup(now);
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-dan' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-eve' });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    handleClose(b.conn, deps);
    now.t += 1500;
    (room as unknown as { onLoop(): void }).onLoop();
    await vi.waitFor(() => expect(a.last('match_end')?.end.reason).toBe('disconnect'));
  });

  it('camada nacional: avança um dia a cada 20 ticks, aplica orçamento e grava resumo', async () => {
    const { send, rooms, records } = setup();
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-host' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-guest' });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'USA' });
    const code = a.last('room')!.room!.code;
    await send(b.conn, { t: 'join_room', code, countryId: 'ZAF' });
    // só o anfitrião muda a regra, e isso desfaz o "pronto" dos outros
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(b.conn, { t: 'set_balance', mode: 'realistic' });
    expect(a.last('room')!.room!.balanceMode).toBe('parity');
    await send(a.conn, { t: 'set_balance', mode: 'realistic' });
    expect(a.last('room')!.room!.balanceMode).toBe('realistic');
    expect(a.last('room')!.room!.players.find((p) => p.userId === 'guest')!.ready).toBe(false);
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });

    const room = rooms.get(code)!;
    const first = a.last('national')!;
    expect(first.day).toBe(0);
    expect(first.nations[0]!.history).toBeDefined();
    const usa = room.national!.nation(0)!;
    const supply = usa.theaterSupplyPerSec;
    expect(room.sim!.players[0]!.modifiers.externalIncome).toBeCloseTo(supply);

    await send(a.conn, { t: 'national', cmd: { type: 'set_budget', budget: { ...usa.budget, defensePct: 6 } } });
    await send(a.conn, { t: 'national', cmd: { type: 'set_research', techId: 'logistics' } });
    for (let i = 0; i < 20; i++) room.advance();
    const msg = a.last('national')!;
    expect(msg.day).toBe(1);
    expect(msg.date).toBe('2026-01-02');
    expect(msg.nations[0]!.history).toBeUndefined(); // histórico só no registro mensal
    expect(usa.budget.defensePct).toBe(6);
    expect(usa.research.current).toBe('logistics');
    expect(room.sim!.players[0]!.modifiers.externalIncome).toBeGreaterThan(supply);
    expect(msg.events.some((e) => e.type === 'budget_changed')).toBe(true);

    await send(b.conn, { t: 'surrender' });
    await vi.waitFor(() => expect(records).toHaveLength(1));
    const rec = records[0]!;
    expect(rec.balance_mode).toBe('realistic');
    expect(rec.players[0]!.national?.countryId).toBe('USA');
    expect(rec.players[0]!.national?.days).toBe(1);
    await vi.waitFor(() => expect(a.last('match_end')).toBeDefined());
    expect(a.last('match_end')!.end.players[1]!.national?.countryId).toBe('ZAF');
  });

  it('país do bot: sorteado entre os livres, escolhido pelo anfitrião sem repetir', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-botc' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    const room = rooms.get(a.last('room')!.room!.code)!;
    const bot = () => room.players.find((p) => p.isAI)!;
    expect(bot().countryId).not.toBe('BRA');
    await send(a.conn, { t: 'set_bot_country', slot: bot().slot, countryId: 'JPN' });
    expect(bot().countryId).toBe('JPN');
    // país de outro jogador: recusado
    await send(a.conn, { t: 'set_bot_country', slot: bot().slot, countryId: 'BRA' });
    expect(bot().countryId).toBe('JPN');
    // sortear troca por outro país livre
    await send(a.conn, { t: 'set_bot_country', slot: bot().slot, countryId: 'random' });
    expect(['JPN', 'BRA']).not.toContain(bot().countryId);
    // o jogador escolhe o país do bot: o bot ganha outro
    const taken = bot().countryId;
    await send(a.conn, { t: 'set_country', countryId: taken });
    expect(bot().countryId).not.toBe(taken);
    // só o anfitrião escolhe
    const b = fakeConn();
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-botc2' });
    const before = bot().countryId;
    room.setBotCountry(b.conn, bot().slot, 'random');
    expect(bot().countryId).toBe(before);
  });

  it('diplomacia: ação validada pelo servidor e estado enviado aos clientes', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-diplo' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    // o país do bot é sorteado: fixa a Argentina para o cenário do teste
    await send(a.conn, { t: 'set_bot_country', slot: 1, countryId: 'ARG' });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(a.last('room')!.room!.code)!;
    const first = a.last('national')!;
    // todos os outros países existem; os da mesma região (Américas) e o rival do teatro já têm contato
    expect(first.diplomacy.nations.length).toBe(COUNTRIES.length - 1);
    const usa = first.diplomacy.nations.find((n) => n.countryId === 'USA')!;
    expect(usa.known).toBe(true);
    const jpn = first.diplomacy.nations.find((n) => n.countryId === 'JPN')!;
    expect(jpn.known).toBe(false);
    expect(jpn.intel).toBeNull();
    // o adversário não revela o orçamento: só a própria nação vem completa
    expect(first.nations.map((n) => n.slot)).toEqual([0]);
    expect(parseClientMessage(JSON.stringify({ t: 'national', cmd: { type: 'diplomacy', action: { type: 'send_aid', partner: usa.id, pctGdp: 5 } } }))).toBeNull();
    await send(a.conn, { t: 'national', cmd: { type: 'diplomacy', action: { type: 'propose', treaty: 'trade', partner: usa.id } } });
    for (let i = 0; i < 20; i++) room.advance();
    const msg = a.last('national')!;
    expect(msg.diplomacy.treaties.some((t) => t.type === 'trade' && (t.a === usa.id || t.b === usa.id))).toBe(true);
    expect(msg.diplomacy.relations.find((r) => (r.a === 0 && r.b === usa.id) || (r.b === 0 && r.a === usa.id))!.value).toBeGreaterThan(0);
    // sem declaração não há guerra: a relação mostra só a rivalidade no teatro
    expect(msg.diplomacy.relations.find((r) => r.a === 0 && r.b === 1)!.factors[0]!.key).toBe('rivalry');
    expect(msg.diplomacy.wars).toEqual([]);
    // proposta a um país sem contato é recusada com motivo
    await send(a.conn, { t: 'national', cmd: { type: 'diplomacy', action: { type: 'propose', treaty: 'trade', partner: jpn.id } } });
    room.advance();
    expect(a.last('cmd_rejected')!.reason).toMatch(/não descoberto/);
  });

  it('melhoria pela rede: só o dono comanda, cobra recursos e verba nacional e o snapshot mostra a obra', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-beto' });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: 'BRA' });
    const code = a.last('room')!.room!.code;
    await send(b.conn, { t: 'join_room', code, countryId: 'ARG' });
    await send(b.conn, { t: 'set_ready', ready: true });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(code)!;
    const sim = room.sim!;
    const hq = sim.buildings.find((x) => x.owner === 0 && x.type === 'hq')!;
    const works = room.national!.nation(0)!.works;
    const me = sim.players[0]!;
    // o começo da partida é enxuto: estoque suficiente para a obra (dentro da capacidade do QG)
    Object.assign(me.resources, { supplies: 1000, wood: 300, stone: 300, iron: 200 });
    const fund0 = works.fundUsd;
    const wood0 = me.resources.wood;
    const stone0 = me.resources.stone;
    const { cost, usd } = upgradeCost('hq', 2);
    expect(fund0).toBeGreaterThan(usd);

    // o adversário não melhora o QG de outra nação, e nada é cobrado
    await send(b.conn, { t: 'cmd', cmd: { type: 'upgrade', buildingId: hq.id } });
    room.advance();
    expect(b.last('cmd_rejected')).toBeDefined();
    expect(hq.upgrade).toBeNull();
    expect(works.fundUsd).toBe(fund0);

    await send(a.conn, { t: 'cmd', cmd: { type: 'upgrade', buildingId: hq.id } });
    room.advance();
    expect(hq.upgrade?.toLevel).toBe(2);
    expect(works.fundUsd).toBe(fund0 - usd);
    expect(works.ledger.at(-1)!.usd).toBe(usd);
    expect(me.resources.wood).toBe(wood0 - cost.wood!);
    expect(me.resources.stone).toBe(stone0 - cost.stone!);
    const own = a.last('snapshot')!.s.buildings.find((x) => x.id === hq.id)!;
    expect(own.level).toBe(1);
    expect(own.upgrade && 'toLevel' in own.upgrade ? own.upgrade.toLevel : null).toBe(2);

    await send(a.conn, { t: 'cmd', cmd: { type: 'cancel_upgrade', buildingId: hq.id } });
    room.advance();
    expect(hq.upgrade).toBeNull();
    expect(hq.level).toBe(1);
    expect(works.fundUsd).toBe(fund0 - usd + Math.floor(usd * UPGRADE_CANCEL_REFUND));
    expect(works.ledger.at(-1)!.usd).toBe(-Math.floor(usd * UPGRADE_CANCEL_REFUND));
    expect(me.resources.wood).toBe(wood0 - cost.wood! + Math.floor(cost.wood! * UPGRADE_CANCEL_REFUND));
  });

  it('decreto pelo painel nacional: vale na sala e chega ao teatro (recrutas mais baratos)', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-dec' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(a.last('room')!.room!.code)!;
    await send(a.conn, { t: 'national', cmd: { type: 'decree', id: 'conscription', active: true } });
    room.advance();
    expect(room.national!.nation(0)!.policies!.decrees.map((d) => d.id)).toEqual(['conscription']);
    expect(room.sim!.players[0]!.modifiers.recruitCostMul).toBeCloseTo(0.6);
    expect(a.last('national')!.nations[0]!.policies!.decrees).toHaveLength(1);
  });

  it('a IA declara guerra pelo caminho validado antes de causar qualquer dano', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-war' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(a.last('room')!.room!.code)!;
    const sim = room.sim!;
    // o jogador humano tenta atacar sem guerra: recusado
    const mine = sim.units.find((u) => u.owner === 0)!;
    const theirs = sim.buildings.find((b) => b.owner === 1)!;
    await send(a.conn, { t: 'cmd', cmd: { type: 'attack', unitIds: [mine.id], targetId: theirs.id } });
    room.advance();
    expect(a.last('cmd_rejected')?.reason).toMatch(/Sem estado de guerra|fora de visão/);
    let warTick = -1;
    let incidents = 0;
    // período de preparo (8 min no Normal) + tempo para formar a primeira onda; antes da guerra,
    // só há dano durante os incidentes de fronteira (curtos e anunciados)
    for (let i = 0; i < 20 * 60 * 24 && warTick < 0; i++) {
      const before = sim.players[1]!.stats.damageDealt;
      room.advance();
      if (room.national!.diplomacy.atWar(0, 1)) warTick = sim.tick;
      else if (sim.incidentUntil(0, 1) === null) expect(sim.players[1]!.stats.damageDealt).toBe(before);
      else incidents++;
    }
    expect(incidents).toBeGreaterThan(0);
    expect(warTick).toBeGreaterThanOrEqual(PREPARATION_TICKS);
    const msg = a.last('national')!;
    expect(msg.diplomacy.wars).toEqual([[0, 1]]);
    expect(msg.events.some((e) => e.type === 'diplomacy' && e.event.type === 'war_declared' && e.event.by === 1)).toBe(true);
  }, 240_000);
});

describe('operações expedicionárias pela rede (Fase 8)', () => {
  it('guerra contra país da IA, lançamento, batalha local com escopo próprio e retorno reconciliado', async () => {
    const { send, rooms } = setup();
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-op' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
    await send(a.conn, { t: 'start' });
    const room = rooms.get(a.last('room')!.room!.code)!;
    const sim = room.sim!;
    const usa = a.last('national')!.diplomacy.nations.find((n) => n.countryId === 'USA')!.id;
    await send(a.conn, { t: 'national', cmd: { type: 'diplomacy', action: { type: 'declare_war', target: usa } } });
    room.advance();
    expect(a.last('cmd_rejected')).toBeUndefined();
    for (let i = 0; i < 20; i++) room.advance();
    const view = a.last('operations')!.ops;
    expect(view.wars.find((w) => w.target === usa)?.sectors.length).toBeGreaterThan(0);
    const mine = sim.units.filter((u) => u.owner === 0);
    // a declaração consumiu o petróleo inicial: abastece para a operação
    sim.players[0]!.resources.oil = 100;
    sim.players[0]!.oilReserve = 100;
    const sector = view.wars.find((w) => w.target === usa)!.sectors[0]!.id;
    await send(a.conn, { t: 'cmd', cmd: { type: 'launch_operation', target: usa, sectorId: sector, unitIds: mine.map((u) => u.id) } });
    room.advance();
    expect(a.last('cmd_rejected')).toBeUndefined();
    expect(sim.units.filter((u) => u.owner === 0)).toHaveLength(0);
    const op = a.last('operations')!.ops.ops[0]!;
    expect(op.state).toBe('transit');
    // até a chegada: o servidor abre a batalha local e envia snapshots com escopo próprio
    for (let i = 0; i < op.travelDays * 20 + 5; i++) room.advance();
    const start = a.last('battle_start')!;
    expect(start.battle.opId).toBe(op.id);
    expect(start.battle.match.yourSlot).toBe(0);
    const battleSnap = a.sent.filter((m) => m.t === 'snapshot' && m.scope === 'battle').at(-1) as Extract<ServerMessage, { t: 'snapshot' }>;
    expect(battleSnap.opId).toBe(op.id);
    expect(battleSnap.s.units.filter((u) => u.owner === 0)).toHaveLength(mine.length);
    // ordem na batalha vai para a batalha (não para o teatro)
    const ids = battleSnap.s.units.filter((u) => u.owner === 0).map((u) => u.id);
    await send(a.conn, { t: 'cmd', cmd: { type: 'move', unitIds: ids, x: 30, y: 30 }, scope: 'battle' });
    room.advance();
    expect(a.last('cmd_rejected')).toBeUndefined();
    await send(a.conn, { t: 'cmd', cmd: { type: 'operation_retreat', opId: op.id } });
    room.advance();
    const end = a.last('battle_end')!;
    expect(end.result.outcome).toBe('retreat');
    expect(end.result.lost).toBe(0);
    for (let i = 0; i < op.travelDays * 20 + 5; i++) room.advance();
    expect(sim.units.filter((u) => u.owner === 0)).toHaveLength(mine.length);
    expect(a.last('operations')!.ops.ops[0]!.state).toBe('done');
  });
  it('render-se não fica preso se o banco não responder: o resultado sai após o limite de espera', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const rooms = new RoomManager({ reconnectGraceMs: 1000, record: () => new Promise<boolean>(() => {}), autoLoop: false, seed: 5, now: () => 0 }, 10);
      const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), verify: async (token) => ({ id: token, name: token }) };
      const a = fakeConn();
      const send = (raw: object) => handleMessage(a.conn, parseClientMessage(JSON.stringify(raw))!, deps);
      await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'alice' });
      await send({ t: 'create_room', mode: 'vs_ai', countryId: 'BRA' });
      await send({ t: 'start' });
      await send({ t: 'surrender' });
      expect(a.last('match_end')).toBeUndefined();
      await vi.advanceTimersByTimeAsync(8000);
      expect(a.last('match_end')!.end).toMatchObject({ reason: 'forfeit', recorded: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('salas públicas', () => {
  it('a sala pública aparece na lista do menu, some quando enche ou fica privada, e dá para entrar pela lista', async () => {
    const { send } = setup();
    const host = fakeConn();
    const guest = fakeConn();
    await send(host.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    await send(guest.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-beto' });
    // sala privada não aparece
    await send(host.conn, { t: 'create_room', mode: 'pvp', countryId: COUNTRIES[0]!.id });
    await send(guest.conn, { t: 'list_rooms' });
    expect(guest.last('room_list')?.rooms).toEqual([]);
    // o anfitrião abre a sala
    await send(host.conn, { t: 'set_room', isPublic: true });
    await send(guest.conn, { t: 'list_rooms' });
    const list = guest.last('room_list')!.rooms;
    expect(list).toHaveLength(1);
    expect(list[0]!.hostName).toBe('ana');
    expect(list[0]!.name).toBe('Sala de ana');
    await send(host.conn, { t: 'set_room', name: '  Guerra   Fria <b>!</b> ' });
    await send(guest.conn, { t: 'list_rooms' });
    expect(guest.last('room_list')!.rooms[0]!.name).toBe('Guerra Fria b!b');
    expect(list[0]!.players).toBe(1);
    // entra pela lista; com 2 de 2 a sala some
    await send(guest.conn, { t: 'join_room', code: list[0]!.code, countryId: COUNTRIES[1]!.id });
    expect(guest.last('room')?.room?.players).toHaveLength(2);
    await send(guest.conn, { t: 'list_rooms' });
    expect(guest.last('room_list')?.rooms).toEqual([]);
  });

  it('só salas multijogador podem ser públicas', async () => {
    const { send } = setup();
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-beto' });
    await send(a.conn, { t: 'create_room', mode: 'vs_ai', countryId: COUNTRIES[0]!.id, isPublic: true });
    await send(b.conn, { t: 'list_rooms' });
    expect(b.last('room_list')?.rooms).toEqual([]);
    await send(a.conn, { t: 'leave_room' });
    await send(a.conn, { t: 'create_room', mode: 'pvp', countryId: COUNTRIES[0]!.id, isPublic: true });
    await send(b.conn, { t: 'list_rooms' });
    expect(b.last('room_list')?.rooms).toHaveLength(1);
  });
});

describe('comunidade e feedback', () => {
  it('grava o feedback com nome e versão, recusa mensagem vazia e limita a 1 por minuto', async () => {
    const { send, deps } = setup();
    const saved: unknown[] = [];
    deps.saveFeedback = async (r) => {
      saved.push(r);
      return true;
    };
    const a = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    expect(parseClientMessage(JSON.stringify({ t: 'feedback', category: 'bug', message: 'oi' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'feedback', category: 'hack', message: 'mensagem longa' }))).toBeNull();
    await send(a.conn, { t: 'feedback', category: 'suggestion', message: 'Mais mapas navais, por favor!', rating: 5 });
    expect(a.last('feedback_ok')).toBeDefined();
    expect(saved).toEqual([expect.objectContaining({ user_id: 'ana', category: 'suggestion', rating: 5, display_name: 'ana' })]);
    await send(a.conn, { t: 'feedback', category: 'bug', message: 'Outro recado logo em seguida' });
    expect(a.last('error')?.code).toBe('feedback');
    expect(saved).toHaveLength(1);
  });
});

describe('chat da comunidade', () => {
  it('quem entra recebe o histórico e o número de pessoas; mensagens chegam a todos; limite de ritmo', async () => {
    const { send } = setup();
    const a = fakeConn();
    const b = fakeConn();
    await send(a.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-ana' });
    await send(b.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: 'ok-beto' });
    await send(a.conn, { t: 'community_join' });
    await send(a.conn, { t: 'community_say', text: 'Olá, comandantes!' });
    await send(b.conn, { t: 'community_join' });
    expect(b.last('community_history')?.messages.map((m) => m.text)).toEqual(['Olá, comandantes!']);
    expect(b.last('community_history')?.online).toBe(2);
    expect(a.last('community_online')?.online).toBe(2);
    await send(b.conn, { t: 'community_say', text: 'Bora uma partida?' });
    expect(a.last('community_msg')?.msg.from).toBe('beto');
    // segunda mensagem logo em seguida: recusada
    await send(b.conn, { t: 'community_say', text: 'de novo' });
    expect(b.last('error')?.code).toBe('community');
    await send(b.conn, { t: 'community_leave' });
    expect(a.last('community_online')?.online).toBe(1);
  });
});

describe('moderação do chat da comunidade', () => {
  async function chat(names: string[]) {
    const { send, deps } = setup();
    const reports: unknown[] = [];
    const t = { now: 1_000_000 };
    deps.community = new CommunityChat({ now: () => t.now, moderators: ['mod'], saveReport: (r) => (reports.push(r), true) });
    const conns = [];
    for (const n of names) {
      const c = fakeConn();
      await send(c.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: `ok-${n}` });
      await send(c.conn, { t: 'community_join' });
      conns.push(c);
    }
    const say = async (c: ReturnType<typeof fakeConn>, text: string) => {
      t.now += 5000;
      await send(c.conn, { t: 'community_say', text });
    };
    return { send, conns, say, reports, t };
  }

  it('o filtro oculta ofensas e silencia quem insiste', async () => {
    const { conns, say } = await chat(['ana', 'beto']);
    const [a, b] = conns;
    await say(a!, 'vai tomar no cu, arrombado');
    expect(b!.last('community_msg')?.msg).toMatchObject({ filtered: true });
    expect(b!.last('community_msg')?.msg.text).not.toMatch(/arrombado/);
    await say(a!, 'f u c k');
    await say(a!, 'seu merda filho da puta');
    expect(a!.last('error')?.message).toMatch(/silenciado/);
    await say(a!, 'agora falo bonito');
    expect(a!.last('error')?.message).toMatch(/silenciado no chat por mais/);
  });

  it('3 denúncias de pessoas diferentes removem a mensagem e silenciam o autor; cada denúncia é gravada', async () => {
    const { send, conns, say, reports } = await chat(['ana', 'beto', 'caio', 'duda']);
    const [a, b, c, d] = conns;
    await say(a!, 'spam spam spam compre moedas');
    const id = b!.last('community_msg')!.msg.id;
    await send(a!.conn, { t: 'community_report', id, reason: 'spam' });
    expect(a!.last('community_notice')?.text).toMatch(/própria/);
    await send(b!.conn, { t: 'community_report', id, reason: 'spam' });
    await send(b!.conn, { t: 'community_report', id, reason: 'spam' });
    expect(b!.last('community_notice')?.text).toMatch(/já denunciou/);
    await send(c!.conn, { t: 'community_report', id, reason: 'spam' });
    await send(d!.conn, { t: 'community_report', id, reason: 'offense' });
    expect(b!.last('community_remove')?.id).toBe(id);
    expect(reports).toHaveLength(3);
    expect(reports.at(-1)).toMatchObject({ removed: true, author_id: 'ana' });
    await say(a!, 'oi');
    expect(a!.last('error')?.message).toMatch(/silenciado/);
  });

  it('moderador apaga e silencia; quem não é moderador não consegue', async () => {
    const { send, conns, say } = await chat(['mod', 'beto', 'caio']);
    const [m, b, c] = conns;
    expect(m!.last('community_history')?.moderator).toBe(true);
    expect(b!.last('community_history')?.moderator).toBeUndefined();
    await say(b!, 'mensagem chata');
    const id = c!.last('community_msg')!.msg.id;
    await send(c!.conn, { t: 'community_mod', action: 'delete', id });
    expect(c!.last('community_notice')?.text).toMatch(/Só moderadores/);
    await send(m!.conn, { t: 'community_mod', action: 'mute', id, minutes: 60 });
    expect(c!.last('community_remove')?.id).toBe(id);
    await say(b!, 'voltei');
    expect(b!.last('error')?.message).toMatch(/silenciado/);
  });
});

describe('moderação justa', () => {
  async function chat(names: string[]) {
    const { send, deps } = setup();
    const t = { now: 1_000_000 };
    deps.community = new CommunityChat({ now: () => t.now, saveReport: () => true });
    deps.allowGuests = true;
    const conns = [];
    for (const n of names) {
      const c = fakeConn();
      if (n.startsWith('guest')) await send(c.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: null, guestId: n, guestName: n });
      else await send(c.conn, { t: 'hello', protocol: PROTOCOL_VERSION, token: `ok-${n}` });
      await send(c.conn, { t: 'community_join' });
      conns.push(c);
    }
    const say = async (c: ReturnType<typeof fakeConn>, text: string) => {
      t.now += 5000;
      await send(c.conn, { t: 'community_say', text });
    };
    return { send, conns, say, t };
  }

  it('denúncias de convidados valem meio voto', async () => {
    const { send, conns, say } = await chat(['ana', 'guest1', 'guest2', 'guest3', 'beto']);
    const [a, g1, g2, g3, b] = conns;
    await say(a!, 'mensagem normal');
    const id = b!.last('community_msg')!.msg.id;
    for (const g of [g1, g2, g3]) await send(g!.conn, { t: 'community_report', id, reason: 'spam' });
    expect(b!.last('community_remove')).toBeUndefined();
    await send(b!.conn, { t: 'community_report', id, reason: 'spam' });
    await send(conns[0]!.conn, { t: 'community_report', id, reason: 'spam' });
    expect(b!.last('community_remove')).toBeUndefined();
  });

  it('as duas primeiras ofensas só avisam; a punição cresce com a reincidência', async () => {
    const { conns, say, t } = await chat(['ana', 'beto']);
    const [a] = conns;
    await say(a!, 'arrombado');
    expect(a!.last('error')?.message).toMatch(/^Aviso/);
    await say(a!, 'arrombado');
    await say(a!, 'arrombado');
    expect(a!.last('error')?.message).toMatch(/por 5 min/);
    t.now += 6 * 60_000;
    for (let i = 0; i < 3; i++) await say(a!, 'arrombado');
    expect(a!.last('error')?.message).toMatch(/por 15 min/);
  });

  it('cada pessoa denuncia no máximo 5 vezes a cada 10 min', async () => {
    const { send, conns, say } = await chat(['ana', 'beto']);
    const [a, b] = conns;
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) {
      await say(a!, `mensagem ${i}`);
      ids.push(b!.last('community_msg')!.msg.id);
    }
    for (const id of ids) await send(b!.conn, { t: 'community_report', id, reason: 'spam' });
    expect(b!.last('community_notice')?.text).toMatch(/muitas denúncias/);
  });
});
