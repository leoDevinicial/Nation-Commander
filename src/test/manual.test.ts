import { afterEach, describe, expect, it, vi } from 'vitest';
import { MANUAL, manualRead, markManualRead, screenAfterLogin } from '../ui/manual.ts';

afterEach(() => vi.unstubAllGlobals());

function fakeStorage() {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
}

describe('manual de entrada', () => {
  it('aparece antes do menu até ser lido inteiro; depois, vai direto ao menu', () => {
    fakeStorage();
    expect(manualRead()).toBe(false);
    expect(screenAfterLogin()).toBe('manual');
    markManualRead();
    expect(screenAfterLogin()).toBe('menu');
  });

  it('sem armazenamento disponível, mostra o manual (e não quebra)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(screenAfterLogin()).toBe('manual');
    expect(() => markManualRead()).not.toThrow();
  });

  it('é objetivo: poucos cartões, poucos tópicos e frases curtas (cabe na tela do celular)', () => {
    expect(MANUAL.length).toBeGreaterThanOrEqual(5);
    expect(MANUAL.length).toBeLessThanOrEqual(8);
    for (const c of MANUAL) {
      expect(c.points.length).toBeGreaterThan(0);
      expect(c.points.length).toBeLessThanOrEqual(5);
      const words = [c.lead, ...c.points, c.tip ?? ''].join(' ').split(/\s+/).length;
      expect(words, c.title).toBeLessThanOrEqual(110);
      for (const p of c.points) expect(p.length, p).toBeLessThanOrEqual(170);
    }
  });

  it('cobre o básico: objetivo, economia, população, guerra, nação/melhorias e controles', () => {
    const all = MANUAL.map((c) => [c.title, c.lead, ...c.points, c.tip ?? ''].join(' ')).join(' ');
    for (const word of ['Centro de Comando', 'recruta', 'moradia', 'guerra', 'Melhorar', 'verba', 'pinça', 'preparo']) expect(all).toContain(word);
  });
});
