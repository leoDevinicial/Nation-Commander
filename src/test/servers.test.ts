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

describe('etiqueta do servidor no indicador de conexão', async () => {
  const { serverTag } = await import('../ui/components/ConnectionBadge.tsx');
  it('RL no Railway, RN no Render, LC no aparelho', () => {
    expect(serverTag('wss://nation-commander-server-production.up.railway.app/ws')).toBe('RL');
    expect(serverTag('wss://nation-commander-server.onrender.com/ws')).toBe('RN');
    expect(serverTag('local:')).toBe('LC');
    expect(serverTag('ws://localhost:8787/ws')).toBeNull();
  });
});

describe('painel de números (23/11)', async () => {
  const { panelServers } = await import('../ui/screens/StatsPage.tsx');
  it('consulta o Railway e o Render, sem repetir o servidor que já é região', () => {
    const rl = 'wss://nation-commander-server-production.up.railway.app/ws';
    const rn = 'wss://nation-commander-server.onrender.com/ws';
    expect(panelServers([{ label: 'Servidor', url: rn }], [rl, rn])).toEqual([
      { label: 'RN', url: rn },
      { label: 'RL', url: rl },
    ]);
  });
});
