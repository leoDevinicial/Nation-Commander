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

  it('na reconexão, nada além do hello sai antes do welcome (o servidor tirava da conta; 22/11)', async () => {
    const c = await connect();
    FakeWs.all[0]!.onclose?.({ code: 1006, reason: '' });
    await vi.advanceTimersByTimeAsync(260);
    const ws = FakeWs.all[1]!;
    ws.readyState = 1;
    await ws.onopen?.();
    // a câmera manda a área a cada quadro: com a conexão aberta mas sem welcome, fica para depois
    expect(c.send({ t: 'view', rect: [0, 0, 10, 10] })).toBe(false);
    expect(ws.sent.map((m) => m.t)).toEqual(['hello']);
    ws.recv({ t: 'welcome', user: { id: 'x', name: 'x', guest: true }, serverVersion: '1' });
    expect(c.send({ t: 'view', rect: [0, 0, 10, 10] })).toBe(true);
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

describe('GameClient: token na reconexão (20/11)', () => {
  beforeEach(() => {
    FakeWs.all = [];
    vi.stubGlobal('WebSocket', FakeWs);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pede o token de novo a cada conexão e, se a renovação falhar, tenta outra vez em vez de entrar sem token', async () => {
    const tokens = ['t1', new Error('rede'), 't2'];
    const c = new GameClient('ws://x');
    c.connect({
      getToken: async () => {
        const t = tokens.shift()!;
        if (t instanceof Error) throw t;
        return t;
      },
    });
    await FakeWs.all[0]!.accept();
    expect(FakeWs.all[0]!.sent[0]).toMatchObject({ t: 'hello', token: 't1' });
    // a conexão cai; na volta a renovação do token falha: nada de hello sem token
    FakeWs.all[0]!.onclose?.({ code: 1006, reason: '' });
    await vi.advanceTimersByTimeAsync(300);
    FakeWs.all[1]!.readyState = 1;
    await FakeWs.all[1]!.onopen?.();
    expect(FakeWs.all[1]!.sent).toEqual([]);
    expect(c.status).toBe('reconnecting');
    // na tentativa seguinte o token renovado chega
    await vi.advanceTimersByTimeAsync(1000);
    await FakeWs.all[2]!.accept();
    expect(FakeWs.all[2]!.sent[0]).toMatchObject({ t: 'hello', token: 't2' });
    expect(c.status).toBe('connected');
  });

  it('servidor sem conseguir validar a sessão (1013) não é fatal: reconecta', async () => {
    const c = new GameClient('ws://x');
    c.connect({ getToken: async () => 'tok' });
    await FakeWs.all[0]!.accept();
    FakeWs.all[0]!.onclose?.({ code: 1013, reason: 'auth unavailable' });
    expect(c.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(300);
    expect(FakeWs.all.length).toBe(2);
  });
});

describe('GameClient: formato binário e retomada (21/11)', () => {
  beforeEach(() => {
    FakeWs.all = [];
    vi.stubGlobal('WebSocket', FakeWs);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pede binário no hello, lê o quadro binário e, na volta, pede a diferença desde o ponto de retomada', async () => {
    const { SnapshotDeltaEncoder } = await import('../../shared/net/delta.ts');
    const { encodeSnapshotFrame } = await import('../../shared/net/wire.ts');
    const c = new GameClient('ws://x');
    c.resumeKey = () => '777';
    const got: { t: string; s?: { tick: number; units: { id: number; x: number }[] } }[] = [];
    c.on((m) => got.push(m as never));
    c.connect({ getToken: async () => 'tok' });
    const ws = FakeWs.all[0]!;
    // compressão pelo WebSocket: o binário chega como está (sem a compressão pelo servidor)
    (ws as unknown as { extensions: string }).extensions = 'permessage-deflate';
    await ws.accept();
    expect(ws.sent[0]).toMatchObject({ t: 'hello', bin: true });
    expect(ws.sent[0]).not.toHaveProperty('resume');
    const enc = new SnapshotDeltaEncoder();
    const units = (tick: number) => Array.from({ length: 12 }, (_, i) => ({ id: i + 1, x: tick + i / 100, y: 1, facing: 0, hp: 10, type: 'tank' }));
    const msg = (tick: number) => ({ t: 'snapshot', paused: false, speed: 1, pausedBy: null, s: enc.encode({ tick, units: units(tick), buildings: [], players: [], events: [], territoryVersion: 1 } as never) });
    ws.recv(msg(20));
    const frame = encodeSnapshotFrame(msg(22) as never)!;
    expect(frame).not.toBeNull();
    (ws.onmessage as unknown as (ev: { data: ArrayBuffer }) => void)({ data: frame.slice().buffer });
    await vi.waitFor(() => expect(got.filter((m) => m.t === 'snapshot')).toHaveLength(2));
    const last = got.filter((m) => m.t === 'snapshot').at(-1)!;
    expect(last.s!.tick).toBe(22);
    expect(last.s!.units[3]!.x).toBe(22.03);
    // queda: na volta, o hello leva o último ponto de retomada (tick 20) e a partida dele
    ws.onclose?.({ code: 1006, reason: '' });
    await vi.advanceTimersByTimeAsync(300);
    await FakeWs.all[1]!.accept();
    expect(FakeWs.all[1]!.sent[0]).toMatchObject({ t: 'hello', bin: true, resume: { tick: 20, key: '777' } });
  });

  it('com a compressão pelo servidor, o quadro binário chega comprimido e é lido igual', async () => {
    vi.useRealTimers();
    const { SnapshotDeltaEncoder } = await import('../../shared/net/delta.ts');
    const { encodeSnapshotFrame } = await import('../../shared/net/wire.ts');
    const c = new GameClient('ws://x');
    const got: { t: string; s?: { tick: number; units: { x: number }[] } }[] = [];
    c.on((m) => got.push(m as never));
    c.connect({ getToken: async () => 'tok' });
    const ws = FakeWs.all[0]!;
    await ws.accept();
    expect(ws.sent[0]).toMatchObject({ t: 'hello', inflate: true, bin: true });
    const enc = new SnapshotDeltaEncoder();
    const units = (tick: number) => Array.from({ length: 10 }, (_, i) => ({ id: i + 1, x: tick + i, y: 2, type: 'tank' }));
    const msg = (tick: number) => ({ t: 'snapshot', paused: false, speed: 1, pausedBy: null, s: enc.encode({ tick, units: units(tick), buildings: [], events: [], territoryVersion: 1 } as never) });
    ws.recv(msg(1));
    const frame = encodeSnapshotFrame(msg(2) as never)!;
    const deflated = await new Response(new Blob([frame.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    (ws.onmessage as unknown as (ev: { data: ArrayBuffer }) => void)({ data: deflated });
    ws.recv({ t: 'chat', from: 'a', text: 'depois' });
    await vi.waitFor(() => expect(got.filter((m) => m.t !== 'welcome')).toHaveLength(3));
    const seq = got.filter((m) => m.t !== 'welcome');
    expect(seq.map((m) => m.t)).toEqual(['snapshot', 'snapshot', 'chat']);
    expect(seq[1]!.s!.units[5]!.x).toBe(7);
  });
});

