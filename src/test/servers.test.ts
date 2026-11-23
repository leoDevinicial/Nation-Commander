import { describe, expect, it } from 'vitest';
import { nextServer, serverCandidates } from '../net/servers.ts';

/** Servidor principal (Railway) com o da Vercel de reserva (22/11). */
describe('lista de servidores', () => {
  it('principal primeiro, reserva depois, sem repetir', () => {
    expect(serverCandidates('wss://principal/ws', 'wss://reserva/ws')).toEqual(['wss://principal/ws', 'wss://reserva/ws']);
    expect(serverCandidates('wss://mesmo/ws', 'wss://mesmo/ws')).toEqual(['wss://mesmo/ws']);
    expect(serverCandidates(null, 'wss://reserva/ws')).toEqual(['wss://reserva/ws']);
  });

  it('o próximo da lista gira e volta ao primeiro', () => {
    const l = ['a', 'b'];
    expect(nextServer(l, 'a')).toBe('b');
    expect(nextServer(l, 'b')).toBe('a');
    expect(nextServer(l, 'outro')).toBe('a');
  });
});
