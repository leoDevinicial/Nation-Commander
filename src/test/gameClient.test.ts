import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameClient } from '../net/GameClient.ts';

/** WebSocket de mentira: registra as instâncias e o que foi enviado; o teste decide quando abre e o que chega. */
class FakeWs {
  static OPEN = 1;
  static all: FakeWs[] = [];
  readyState = 0;
  sent: { t: string }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWs.all.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as { t: string });
  }
  close(): void {
    this.readyState = 3;
  }
  async accept(): Promise<void> {
    this.readyState = 1;
    await this.onopen?.();
    this.recv({ t: 'welcome', user: { id: 'x', name: 'x', guest: true }, serverVersion: '1' });
  }
  recv(msg: object): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe('GameClient: reconexão', () => {
  beforeEach(() => {
    FakeWs.all = [];
    vi.stubGlobal('WebSocket', FakeWs);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const connect = async () => {
    const c = new GameClient('ws://x');
    c.connect({ getToken: async () => null, guestId: 'g' });
    await FakeWs.all[0]!.accept();
    expect(c.status).toBe('connected');
    return c;
  };

  it('conexão que morre sem aviso (sem fechar) é detectada pelos pings e refeita em poucos segundos', async () => {
    const c = await connect();
    // o servidor some: nada mais chega e o navegador não dispara onclose
    await vi.advanceTimersByTimeAsync(2500 * 4);
    expect(c.status).toBe('reconnecting');
    // primeira nova tentativa sai quase na hora
    await vi.advanceTimersByTimeAsync(300);
    expect(FakeWs.all.length).toBe(2);
    await FakeWs.all[1]!.accept();
    expect(c.status).toBe('connected');
  });

  it('com o servidor respondendo, os pings não derrubam a conexão', async () => {
    const c = await connect();
    const ws = FakeWs.all[0]!;
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(2500);
      ws.recv({ t: 'pong', n: 0 });
    }
    expect(c.status).toBe('connected');
    expect(FakeWs.all.length).toBe(1);
  });

  it('queda normal: as primeiras tentativas são rápidas', async () => {
    const c = await connect();
    FakeWs.all[0]!.onclose?.({ code: 1006, reason: '' });
    expect(c.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(260);
    expect(FakeWs.all.length).toBe(2);
    FakeWs.all[1]!.onclose?.({ code: 1006, reason: '' });
    await vi.advanceTimersByTimeAsync(760);
    expect(FakeWs.all.length).toBe(3);
  });

  it('conexão que não abre (rede presa) é abandonada e tentada de novo', async () => {
    const c = new GameClient('ws://x');
    c.connect({ getToken: async () => null });
    await vi.advanceTimersByTimeAsync(9000 + 300);
    expect(FakeWs.all.length).toBe(2);
  });

  it('enviar com a conexão muda devolve falso (a tela avisa) em vez de perder a mensagem', async () => {
    const c = await connect();
    await vi.advanceTimersByTimeAsync(2500 * 2);
    expect(c.send({ t: 'surrender' })).toBe(false);
    expect(c.status).toBe('reconnecting');
  });
});

describe('GameClient: compressão pelo servidor e snapshots delta (15/11)', () => {
  beforeEach(() => {
    FakeWs.all = [];
    vi.stubGlobal('WebSocket', FakeWs);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sem compressão no WebSocket pede inflate; binário e texto chegam na ordem e o delta vira snapshot inteiro', async () => {
    const { SnapshotDeltaEncoder } = await import('../../shared/net/delta.ts');
    const c = new GameClient('ws://x');
    const got: { t: string; s?: { tick: number; units: { id: number; x: number }[] } }[] = [];
    c.on((m) => got.push(m as never));
    c.connect({ getToken: async () => null, guestId: 'g' });
    const ws = FakeWs.all[0]!;
    await ws.accept();
    expect(ws.sent[0]).toMatchObject({ t: 'hello', inflate: true });
    const enc = new SnapshotDeltaEncoder();
    const snap = (tick: number) => ({ t: 'snapshot', paused: false, speed: 1, pausedBy: null, s: enc.encode({ tick, units: [{ id: 1, x: tick }], buildings: [], players: [], events: [], territoryVersion: 1 } as never) });
    // o mesmo deflate-raw que o servidor usa, feito aqui pela API do navegador
    const bin = (o: object) => new Response(new Blob([JSON.stringify(o)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    const [b1, b2] = [await bin(snap(1)), await bin(snap(2))];
    (ws.onmessage as unknown as (ev: { data: ArrayBuffer }) => void)({ data: b1 });
    (ws.onmessage as unknown as (ev: { data: ArrayBuffer }) => void)({ data: b2 });
    ws.recv({ t: 'chat', from: 'a', text: 'depois' });
    await vi.waitFor(() => expect(got.filter((m) => m.t !== 'welcome').length).toBe(3));
    const seq = got.filter((m) => m.t !== 'welcome');
    expect(seq.map((m) => m.t)).toEqual(['snapshot', 'snapshot', 'chat']);
    expect(seq[1]!.s!.units[0]!.x).toBe(2);
  });
});
