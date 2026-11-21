import { beforeEach, describe, expect, it, vi } from 'vitest';

// o diagnóstico manda pelo cliente do jogo: aqui um falso, que só registra (sem rede)
const sent: { t: string; kind?: string; detail?: string; inMatch?: boolean }[] = [];
const fake = { status: 'connected' as string, send: (m: { t: string }) => (fake.status === 'connected' ? (sent.push(m), true) : false), onStatus: () => () => {} };
vi.mock('../net/client.ts', () => ({ gameClient: fake }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal('screen', { width: 1280, height: 800 });
vi.stubGlobal('window', { devicePixelRatio: 2 });
vi.stubGlobal('navigator', { userAgent: 'teste', maxTouchPoints: 0, hardwareConcurrency: 4, deviceMemory: 2 });
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }), visibilityState: 'visible' });

const diag = await import('../lib/clientDiag.ts');
const { useSettingsStore } = await import('../state/useSettingsStore.ts');

describe('diagnóstico do navegador e modo leve (21/11)', () => {
  beforeEach(() => {
    sent.length = 0;
    store.clear();
    fake.status = 'connected';
    useSettingsStore.getState().update({ quality: 'high', shadows: true });
  });

  it('página que morreu no meio da partida, com a aba visível e há pouco tempo, é fim abrupto', () => {
    const now = 1_000_000_000;
    const m = { at: now - 20_000, inMatch: true, visible: true, quality: 'high' };
    expect(diag.wasAbruptEnd(m, now)).toBe(true);
    expect(diag.wasAbruptEnd(null, now)).toBe(false);
    // fora da partida, em segundo plano (o celular fecha abas assim) ou marca velha: não é queda
    expect(diag.wasAbruptEnd({ ...m, inMatch: false }, now)).toBe(false);
    expect(diag.wasAbruptEnd({ ...m, visible: false }, now)).toBe(false);
    expect(diag.wasAbruptEnd({ ...m, at: now - 60 * 60_000 }, now)).toBe(false);
  });

  it('modo leve guarda a qualidade de antes, avisa o servidor e deixa voltar', () => {
    expect(diag.enterSafeMode('teste')).toBe(true);
    expect(useSettingsStore.getState().quality).toBe('low');
    expect(useSettingsStore.getState().shadows).toBe(false);
    expect(diag.safeModeInfo()).toMatchObject({ from: 'high', shadows: true });
    expect(sent.at(-1)).toMatchObject({ t: 'client_diag', kind: 'safe_mode' });
    // já no mínimo: não repete
    expect(diag.enterSafeMode('de novo')).toBe(false);
    diag.exitSafeMode();
    expect(useSettingsStore.getState().quality).toBe('high');
    expect(useSettingsStore.getState().shadows).toBe(true);
    expect(diag.safeModeInfo()).toBeNull();
  });

  it('sem conexão, o diagnóstico espera (com teto) e vai com o aparelho', () => {
    fake.status = 'reconnecting';
    for (let i = 0; i < 15; i++) diag.reportDiag('error', `e${i}`);
    expect(sent).toHaveLength(0);
    fake.status = 'connected';
    diag.reportDiag('context_lost');
    expect(sent[0]).toMatchObject({ t: 'client_diag', kind: 'context_lost', device: { memoryGb: 2, cores: 4, quality: 'high', screen: '1280x800@2' } });
  });

  it('gráficos perdidos sem volta: avisa, liga o modo leve e pede para recarregar', () => {
    vi.useFakeTimers();
    try {
      diag.gfxEvents.lost();
      expect(sent.at(-1)?.kind).toBe('context_lost');
      vi.advanceTimersByTime(diag.CONTEXT_RESTORE_WAIT_MS + 10);
      expect(sent.map((m) => m.kind)).toContain('context_failed');
      expect(diag.useGfxHealth.getState().failed).toBe(true);
      expect(useSettingsStore.getState().quality).toBe('low');
      // voltou: some o aviso
      diag.gfxEvents.restored();
      expect(diag.useGfxHealth.getState().failed).toBe(false);
      // perdeu e voltou logo: nada de modo leve
      useSettingsStore.getState().update({ quality: 'high', shadows: true });
      diag.gfxEvents.lost();
      diag.gfxEvents.restored();
      vi.advanceTimersByTime(diag.CONTEXT_RESTORE_WAIT_MS + 10);
      expect(useSettingsStore.getState().quality).toBe('high');
    } finally {
      vi.useRealTimers();
    }
  });
});
