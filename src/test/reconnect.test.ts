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
