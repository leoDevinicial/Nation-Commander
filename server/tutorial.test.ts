import { NetworkGuard } from './kac/network.ts';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../shared/version.ts';
import { BUILDINGS, TICK_RATE, type BuildingType } from '../shared/sim/config.ts';
import { TECH_IDS } from '../shared/strategic/technologies.ts';
import { TUTORIAL_STEPS, speechSeconds, type TutorialView } from '../shared/tutorial/script.ts';
import { Connection } from './Connection.ts';
import { handleMessage, type HandlerDeps } from './handler.ts';
import { MemoryMatchStore } from './matchStore.ts';
import { parseClientMessage } from './messages.ts';
import { RoomManager } from './RoomManager.ts';
import type { MatchRecord } from './supabase.ts';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const ws = { readyState: 1, OPEN: 1, send: (s: string) => sent.push(JSON.parse(s) as ServerMessage), close: vi.fn() } as unknown as WebSocket;
  return { conn: new Connection(ws), sent, last: <T extends ServerMessage['t']>(t: T) => sent.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined };
}

async function tutorialRoom() {
  const now = { t: 0 };
  const records: MatchRecord[] = [];
  const rooms = new RoomManager({ reconnectGraceMs: 1000, record: async (r) => (records.push(r), true), autoLoop: false, now: () => now.t }, 10, new MemoryMatchStore(() => now.t));
  const deps: HandlerDeps = { rooms, allowGuests: false, sessions: new Map(), network: new NetworkGuard(), verify: async (t) => ({ id: t, name: 'Teste' }) };
  const a = fakeConn();
  const send = (raw: object) => handleMessage(a.conn, parseClientMessage(JSON.stringify(raw))!, deps);
  await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: 'u1' });
  await send({ t: 'create_room', mode: 'tutorial', countryId: 'BRA' });
  const room = rooms.get(a.last('room')!.room!.code)!;
  const view = () => a.last('tutorial')!.view;
  // ordens espaçadas como as de uma pessoa (o diretor completa o estoque a cada meio segundo)
  const cmd = async (c: object) => {
    await send({ t: 'cmd', cmd: c });
    for (let i = 0; i < TICK_RATE; i++) room.advance();
  };
  /** Roda até o passo mudar (ou `max` segundos). */
  const until = (step: string, max: number) => {
    for (let i = 0; i < max * TICK_RATE && view().step === step && !view().done; i++) room.advance();
  };
  return { room, sim: room.sim!, a, send, cmd, view, until, records };
}

describe('tutorial', () => {
  it('começa sem lobby: 3 nações, mapa fixo, guerra com a Força Vermelha e a IA parada', async () => {
    const { sim, a, view, room } = await tutorialRoom();
    expect(a.last('match_start')!.match.mode).toBe('tutorial');
    expect(sim.players).toHaveLength(3);
    expect(sim.tutorial).toEqual({ slot: 0, timeDiv: 3 });
    expect(sim.hostile(0, 2)).toBe(true);
    expect(sim.hostile(0, 1)).toBe(false);
    expect(view()).toMatchObject({ step: '1.1', chapter: 1, chapters: 9, index: 0, done: false, locked: ['nation', 'globe'] });
    expect(view().camera).not.toBeNull();
    // a IA não age: nenhuma ordem nem obra nova dos bots em 20 s
    const before = sim.buildings.filter((b) => b.owner !== 0).length;
    for (let i = 0; i < 20 * TICK_RATE; i++) room.advance();
    expect(sim.buildings.filter((b) => b.owner === 1).length + sim.buildings.filter((b) => b.owner === 2).length).toBe(before);
    expect(room.toSave()).toBeNull();
  });

  it('fato da tela só vale no passo que o pede; pular capítulo roda as ações dos passos pulados', async () => {
    const { send, view, until, room } = await tutorialRoom();
    until('1.1', 30);
    expect(view().step).toBe('1.2');
    await send({ t: 'tutorial', fact: 'zoomed' });
    room.advance();
    for (let i = 0; i < TICK_RATE; i++) room.advance();
    expect(view().step).toBe('1.2');
    await send({ t: 'tutorial', fact: 'camera_moved' });
    for (let i = 0; i < TICK_RATE; i++) room.advance();
    expect(view().step).toBe('1.3');
    await send({ t: 'tutorial', fact: 'zoomed' });
    for (let i = 0; i < TICK_RATE; i++) room.advance();
    // passo novo: a ajuda só aparece depois de 35 s parado
    expect(view()).toMatchObject({ step: '1.4', help: null });
    for (let i = 0; i < 36 * TICK_RATE; i++) room.advance();
    expect(view().help).toContain('tecla H');
    await send({ t: 'tutorial', skip: 'chapter' });
    expect(view()).toMatchObject({ chapter: 2, step: '2.1' });
    // mensagem inválida é recusada já no parser
    expect(parseClientMessage(JSON.stringify({ t: 'tutorial', fact: 'qualquer' }))).toBeNull();
  });

  it('do começo ao fim: economia, exército, combate, governo, aliança, comércio e vitória', async () => {
    const { sim, room, send, cmd, view, until, a, records } = await tutorialRoom();
    const hq = () => sim.hqOf(0)!;
    const placeNear = (type: BuildingType) => {
      for (let r = 2; r < 18; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const cell = { cx: hq().cell.cx + dx, cy: hq().cell.cy + dy };
            if (sim.placementError(0, type, cell) === null) return cell;
          }
      throw new Error(`sem lugar para ${type}`);
    };
    const own = (type: BuildingType) => sim.buildings.find((b) => b.owner === 0 && b.type === type)!;
    const army = () => sim.units.filter((u) => u.owner === 0 && u.type !== 'scout').map((u) => u.id);
    const seen: string[] = [];
    for (let guard = 0; guard < 80 && !view().done; guard++) {
      const v: TutorialView = view();
      seen.push(v.step);
      const { step } = TUTORIAL_STEPS[v.index]!;
      const c = step.cond;
      if (c.k === 'speech') until(v.step, speechSeconds(step.text) + 2);
      else if (c.k === 'fact') {
        await send({ t: 'tutorial', fact: c.fact });
        until(v.step, 2);
      } else if (c.k === 'more') {
        const at = c.what === 'citizens' ? hq() : own('barracks');
        for (let i = 0; i < c.n; i++) await cmd({ type: 'produce', buildingId: at.id, unitType: c.what === 'citizens' ? 'citizen' : 'recruit' });
        until(v.step, 60);
      } else if (c.k === 'built') {
        if (!sim.buildings.some((b) => b.owner === 0 && b.type === c.type)) await cmd({ type: 'build', buildingType: c.type, ...placeNear(c.type) });
        until(v.step, 200);
      } else if (c.k === 'units' || c.k === 'army') {
        const need = c.k === 'units' ? c.n : c.n - army().length;
        for (let i = 0; i < need; i++) {
          await cmd({ type: 'produce', buildingId: own('barracks').id, unitType: 'recruit' });
          await cmd({ type: 'produce', buildingId: own('barracks').id, unitType: 'infantry' });
        }
        until(v.step, 200);
      } else if (c.k === 'at_rally') {
        await cmd({ type: 'move', unitIds: army(), x: v.marks[0]!.x, y: v.marks[0]!.y });
        until(v.step, 90);
      } else if (c.k === 'patrol_dead') {
        await cmd({ type: 'attack_move', unitIds: army(), x: v.marks[0]?.x ?? hq().pos.x, y: v.marks[0]?.y ?? hq().pos.y });
        until(v.step, 150);
      } else if (c.k === 'road_more') {
        // a estrada à mão é difícil de traçar no teste: este passo testa o "pular"
        await send({ t: 'tutorial', skip: 'step' });
      } else if (c.k === 'researching') {
        const nation = room['national']!.nation(0)!;
        const tech = TECH_IDS.find((t) => !nation.research.done.includes(t) && room['national']!.setResearch(0, t) === null);
        expect(tech).toBeDefined();
        until(v.step, 5);
      } else if (c.k === 'alliance') {
        const offer = room['national']!.diplomacy.offers.find((o) => o.from === 1 && o.to === 0);
        expect(offer).toBeDefined();
        await send({ t: 'national', cmd: { type: 'diplomacy', action: { type: 'answer_offer', offerId: offer!.id, accept: true } } });
        until(v.step, 10);
      } else if (c.k === 'truck_route') {
        // sem traçar: o diretor completa a ligação depois de 150 s
        until(v.step, 170);
      } else if (c.k === 'listed') {
        await cmd({ type: 'trade_list', kind: 'sale', items: [{ resource: 'wood', quantity: 40 }], priceUsd: 40 * 4500 });
        until(v.step, 5);
      } else if (c.k === 'delivered') until(v.step, 240);
      else if (c.k === 'enemy_defeated') {
        const foe = sim.hqOf(2)!;
        await cmd({ type: 'attack', unitIds: army(), targetId: foe.id });
        until(v.step, 400);
      } else if (c.k === 'era') until(v.step, 20);
      expect(view().step === v.step && !view().done, `parado no passo ${v.step}`).toBe(false);
    }
    expect(view().done).toBe(true);
    expect(seen).toEqual(TUTORIAL_STEPS.map((s) => s.step.id));
    // o que o tutorial deixou no mundo
    expect(sim.allied(0, 1)).toBe(true);
    expect(typeof sim.trade.route(0, 1, 'road')).not.toBe('string');
    expect(sim.eraOf(0)).toBe(2);
    expect(sim.players[2]!.defeated || !sim.hqOf(2)).toBe(true);
    for (let i = 0; i < 2 * TICK_RATE; i++) room.advance();
    await Promise.resolve();
    const end = a.last('match_end');
    expect(end).toBeDefined();
    expect(end!.end.players.find((p) => p.slot === 0)?.result).toBe('win');
    // não conta no histórico nem no ranking
    expect(records).toHaveLength(0);
    expect(BUILDINGS.market.requiresTech).toBe('foreign_trade');
  }, 120_000);
});
