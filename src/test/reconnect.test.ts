import { describe, expect, it } from 'vitest';
import type { MatchStartInfo } from '../../shared/protocol.ts';
import { isSameMatch } from '../net/client.ts';

const base = { seed: 7, yourSlot: 0, width: 40, height: 30, cellSize: 2, terrain: '0123' } as MatchStartInfo;

describe('reconexão', () => {
  it('a mesma partida mantém a cena (câmera, seleção e mapa explorado)', () => {
    expect(isSameMatch(base, { ...base, players: [] } as MatchStartInfo)).toBe(true);
  });
  it('partida nova (ou nenhuma na tela) monta uma cena nova', () => {
    expect(isSameMatch(null, base)).toBe(false);
    expect(isSameMatch(base, { ...base, seed: 8 })).toBe(false);
    expect(isSameMatch(base, { ...base, yourSlot: 1 })).toBe(false);
    expect(isSameMatch(base, { ...base, terrain: '0124' })).toBe(false);
  });
});

describe('snapshot guardado para a tela que monta depois', () => {
  it('leva o território e as estradas mais recentes (a estrada inicial aparecia sem asfalto)', async () => {
    const { gameClient, snapshotBuffer } = await import('../net/client.ts');
    const emit = (msg: unknown) => (gameClient as unknown as { listeners: Set<(m: unknown) => void> }).listeners.forEach((l) => l(msg));
    const snap = (tick: number, extra: object) => ({ t: 'snapshot', s: { tick, units: [], buildings: [], players: [], events: [], territoryVersion: 1, ...extra }, paused: false, speed: 1, pausedBy: null });
    // primeiro snapshot: fronteiras e estradas juntas; os seguintes vêm sem elas (não mudaram)
    emit(snap(2, { territory: 'AAAA', roads: [10, 11, 12] }));
    emit(snap(4, {}));
    emit(snap(5, {}));
    const last = snapshotBuffer.last!.s;
    expect(last.tick).toBe(5);
    expect(last.territory).toBe('AAAA');
    expect(last.roads).toEqual([10, 11, 12]);
  });
});
