import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import type { WebSocket } from 'ws';
import { APP_DEFLATE_MIN, Connection } from './Connection.ts';
import { parseClientMessage } from './messages.ts';

/** Compressão feita pelo servidor (15/11) quando o WebSocket chega sem permessage-deflate (proxy no caminho). */
function fakeWs(extensions = '') {
  const out: { data: unknown; opts?: { binary?: boolean; compress?: boolean } }[] = [];
  const ws = { readyState: 1, OPEN: 1, extensions, send: (data: unknown, opts?: { binary?: boolean }) => out.push({ data, opts }) } as unknown as WebSocket;
  return { ws, out };
}

describe('compressão pelo servidor', () => {
  it('com inflate no hello: mensagens grandes saem em binário (deflate-raw) e descomprimem no texto igual', () => {
    const { ws, out } = fakeWs();
    const c = new Connection(ws);
    c.appDeflate = true;
    const big = JSON.stringify({ t: 'snapshot', s: { units: Array.from({ length: 200 }, (_, i) => ({ id: i, x: i * 1.5 })) } });
    expect(big.length).toBeGreaterThan(APP_DEFLATE_MIN);
    c.sendRaw(big);
    c.sendRaw('{"t":"pong","n":1}');
    expect(out[0]!.opts).toEqual({ binary: true, compress: false });
    expect((out[0]!.data as Buffer).length).toBeLessThan(big.length / 3);
    expect(typeof out[1]!.data).toBe('string');
    expect(inflateRawSync(out[0]!.data as Buffer).toString()).toBe(big);
    expect(c.compression).toBe('servidor');
  });

  it('sem o pedido (ou com o WebSocket comprimindo) manda texto como antes', () => {
    const { ws, out } = fakeWs('permessage-deflate; client_no_context_takeover');
    const c = new Connection(ws);
    c.sendRaw('x'.repeat(5000));
    expect(typeof out[0]!.data).toBe('string');
    expect(c.compression).toBe('transporte');
  });

  it('o parser aceita só inflate: true', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'hello', protocol: 7, token: null, inflate: true }))).toMatchObject({ inflate: true });
    expect(parseClientMessage(JSON.stringify({ t: 'hello', protocol: 7, token: null, inflate: 'sim' }))).not.toHaveProperty('inflate');
  });
});
