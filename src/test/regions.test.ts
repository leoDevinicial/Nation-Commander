import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bestRegion, httpBase, parseRegions, probeRegion, regionForCode } from '../net/regions.ts';
import { NetStats } from '../net/netStats.ts';
import { GameClient } from '../net/GameClient.ts';

describe('KNPS-08: regiões no cliente', () => {
  const regions = parseRegions('V|Virgínia (EUA)|wss://va.example.com, F|Frankfurt|wss://fr.example.com/ws, O|inválida|wss://x, V|repetida|wss://y', 'ws://local/ws');

  it('lê a lista, descarta letras inválidas ou repetidas; sem lista, um servidor só', () => {
    expect(regions.map((r) => r.letter)).toEqual(['V', 'F']);
    expect(parseRegions(undefined, 'ws://local/ws')).toEqual([{ letter: '', label: 'Servidor', url: 'ws://local/ws' }]);
    expect(httpBase('wss://fr.example.com/ws')).toBe('https://fr.example.com');
    expect(httpBase('ws://localhost:8787/ws')).toBe('http://localhost:8787');
  });

  it('o código da sala diz a região; sem letra conhecida, fica no servidor atual', () => {
    expect(regionForCode(regions, 'fk3x9')!.label).toBe('Frankfurt');
    expect(regionForCode(regions, 'VAB23')!.letter).toBe('V');
    expect(regionForCode(regions, 'KAB23')).toBeNull();
  });

  it('a melhor região é a de menor ping; sem resposta fica por último', () => {
    expect(
      bestRegion(
        regions,
        new Map([
          ['V', 140],
          ['F', 90],
        ]),
      ).letter,
    ).toBe('F');
    expect(
      bestRegion(
        regions,
        new Map([
          ['V', null],
          ['F', 200],
        ]),
      ).letter,
    ).toBe('F');
    expect(bestRegion(regions, new Map()).letter).toBe('V');
  });

  it('a sonda descarta a primeira medida (abre a conexão) e fica com a menor das outras', async () => {
    let t = 0;
    const costs = [300, 95, 80];
    const fetchFn = vi.fn(async () => {
      t += costs.shift()!;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    expect(await probeRegion(regions[0]!, fetchFn, () => t)).toBe(80);
    expect(fetchFn).toHaveBeenCalledWith('https://va.example.com/knps/ping', expect.objectContaining({ cache: 'no-store' }));
    const failing = vi.fn(async () => Promise.reject(new Error('rede'))) as unknown as typeof fetch;
    expect(await probeRegion(regions[0]!, failing)).toBeNull();
  });

  it('a qualidade usa o ping de rede do servidor quando existe (sem o tempo da página)', () => {
    let t = 0;
    const s = new NetStats(() => t);
    // página travada: o ping visto pela página é alto
    for (const r of [900, 1200, 1000]) {
      s.pingSent();
      t += 2500;
      s.pong(r);
    }
    expect(s.summary().quality).toBe('ruim');
    for (const r of [60, 62, 61]) s.network(r, 'Virgínia (EUA)');
    const x = s.summary();
    expect(x.netP50).toBe(61);
    expect(x.region).toBe('Virgínia (EUA)');
    expect(x.quality).toBe('boa');
  });
});

class FakeWs {
  static all: FakeWs[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWs.all.push(this);
  }
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
  async accept(): Promise<void> {
    this.readyState = 1;
    await this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ t: 'welcome', user: { id: 'x', name: 'x', guest: true }, serverVersion: '1' }) });
  }
}

describe('KNPS-08: troca de servidor', () => {
  beforeEach(() => {
    FakeWs.all = [];
    vi.stubGlobal('WebSocket', Object.assign(FakeWs, { OPEN: 1 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('troca para o servidor de outra região com a mesma conta e larga o anterior sem disparar reconexão nele', async () => {
    const c = new GameClient('ws://a/ws');
    c.connect({ getToken: async () => null, guestId: 'g' });
    await FakeWs.all[0]!.accept();
    const done = c.switchTo('ws://b/ws');
    expect(FakeWs.all[1]!.url).toBe('ws://b/ws');
    // o socket antigo fechando não deve agendar reconexão para o servidor antigo
    FakeWs.all[0]!.onclose?.({ code: 1006, reason: '' });
    await FakeWs.all[1]!.accept();
    expect(await done).toBe(true);
    expect(c.serverUrl).toBe('ws://b/ws');
    expect(c.status).toBe('connected');
    expect(FakeWs.all.length).toBe(2);
  });
});
