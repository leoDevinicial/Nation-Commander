import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../../shared/version.ts';
import { Connection } from '../Connection.ts';
import { handleMessage, type HandlerDeps } from '../handler.ts';
import { NetworkGuard } from '../kac/network.ts';
import { parseClientMessage } from '../messages.ts';
import { RoomManager } from '../RoomManager.ts';
import type { MatchRecord } from '../supabase.ts';
import { validateLocalMatch } from './localMatch.ts';

/** Resultado de partida local recebido pelo servidor remoto para o histórico (22/11). */
const stats = { unitsProduced: 10, unitsLost: 3, unitsKilled: 7, structuresBuilt: 12, structuresLost: 1, structuresDestroyed: 4, resourcesGathered: 5000, resourcesSpent: 4200, damageDealt: 9000 };
const ana = { id: 'uuid-ana', name: 'Ana', guest: false };
function rec(over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    room_code: 'ABCDE',
    mode: 'vs_ai',
    map_seed: 123,
    started_at: new Date(now - 600_000).toISOString(),
    ended_at: new Date(now).toISOString(),
    duration_seconds: 600,
    end_reason: 'hq_destroyed',
    winner_id: 'uuid-ana',
    game_version: '1.6.0',
    balance_mode: 'parity',
    players: [
      { slot: 0, player_id: 'uuid-ana', is_ai: false, display_name: 'quem quer que seja', country_id: 'BRA', result: 'win', stats, national: null },
      { slot: 1, player_id: null, is_ai: true, display_name: 'Argentina', country_id: 'ARG', result: 'loss', stats, national: null },
    ],
    report: { samples: [], medals: [{ slot: 0, medals: ['victory', 'inventada'] }] },
    ...over,
  };
}

describe('validação do resultado de partida local', () => {
  it('aceita uma partida contra a IA da própria conta e marca como local', () => {
    const r = validateLocalMatch(rec(), ana) as MatchRecord;
    expect(typeof r).toBe('object');
    expect(r.room_code).toBe('LABCDE');
    expect(r.report.integrity?.verdict).toBe('local');
    expect(r.report.integrity?.competitive).toBe(false);
    // o nome do humano é o da conta (não o que veio no resultado); medalha desconhecida some
    expect(r.players.find((p) => !p.is_ai)!.display_name).toBe('Ana');
    expect(r.report.medals[0]!.medals).toEqual(['victory']);
    expect(r.winner_id).toBe('uuid-ana');
  });

  it('recusa: convidado, outro modo, outra conta, dois humanos, números absurdos e partida muito antiga', () => {
    expect(validateLocalMatch(rec(), { id: 'guest:x', name: 'X', guest: true })).toMatch(/convidado/);
    expect(validateLocalMatch(rec({ mode: 'pvp' }), ana)).toMatch(/contra a IA/);
    const other = rec();
    other.players[0]!.player_id = 'uuid-de-outro';
    expect(validateLocalMatch(other, ana)).toMatch(/não é esta conta/);
    const two = rec();
    two.players[1] = { ...two.players[1]!, is_ai: false, player_id: 'uuid-ana' };
    expect(validateLocalMatch(two, ana)).toMatch(/um humano só/);
    const big = rec();
    big.players[0] = { ...big.players[0]!, stats: { ...stats, unitsKilled: 1e12 } };
    expect(validateLocalMatch(big, ana)).toMatch(/unitsKilled/);
    expect(validateLocalMatch(rec({ ended_at: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() }), ana)).toMatch(/prazo/);
  });
});

describe('servidor remoto recebe o resultado da partida local', () => {
  async function connected(user: { token: string } | null) {
    const sent: ServerMessage[] = [];
    const ws = { readyState: 1, OPEN: 1, send: (d: string) => sent.push(JSON.parse(d) as ServerMessage), close: vi.fn() } as unknown as WebSocket;
    const conn = new Connection(ws);
    const recorded: MatchRecord[] = [];
    const deps: HandlerDeps = {
      rooms: new RoomManager({ reconnectGraceMs: 1, record: async () => true, autoLoop: false }, 10),
      allowGuests: true,
      sessions: new Map(),
      network: new NetworkGuard(),
      verify: async (t) => ({ id: `uuid-${t}`, name: t }),
      recordLocalMatch: async (r) => {
        recorded.push(r);
        return true;
      },
    };
    const send = async (raw: object) => {
      const m = parseClientMessage(JSON.stringify(raw));
      if (!m) throw new Error('mensagem inválida no teste');
      await handleMessage(conn, m, deps);
    };
    await send({ t: 'hello', protocol: PROTOCOL_VERSION, token: user?.token ?? null, guestId: 'segredo123' });
    return { sent, send, recorded, deps };
  }

  it('grava uma vez, confirma, e repetir o mesmo resultado só confirma de novo', async () => {
    const c = await connected({ token: 'ana' });
    await c.send({ t: 'local_match', id: 'resultado-0001', rec: rec() });
    await c.send({ t: 'local_match', id: 'resultado-0001', rec: rec() });
    expect(c.recorded.length).toBe(1);
    expect(c.sent.filter((m) => m.t === 'local_match_ok').length).toBe(2);
  });

  it('um resultado novo logo em seguida espera (limite por conta); um recusado é confirmado para não insistir', async () => {
    const c = await connected({ token: 'ana' });
    await c.send({ t: 'local_match', id: 'resultado-0001', rec: rec() });
    await c.send({ t: 'local_match', id: 'resultado-0002', rec: rec() });
    expect(c.recorded.length).toBe(1);
    expect(c.sent.filter((m) => m.t === 'local_match_ok').length).toBe(1);
    const g = await connected(null);
    await g.send({ t: 'local_match', id: 'resultado-0003', rec: rec() });
    expect(g.recorded.length).toBe(0);
    expect(g.sent.some((m) => m.t === 'local_match_ok')).toBe(true);
  });
});
