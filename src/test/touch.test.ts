import { describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, TAP_SLOP, TouchGestures, type GestureHandlers, type Timer } from '../game/input/TouchGestures.ts';

function setup(box = false) {
  const calls: string[] = [];
  const h: GestureHandlers = {
    tap: (x, y, d) => calls.push(`tap ${x},${y}${d ? ' double' : ''}`),
    longPress: (x, y) => calls.push(`long ${x},${y}`),
    pan: (dx, dy) => calls.push(`pan ${dx},${dy}`),
    pinch: (s, r, dx, dy) => calls.push(`pinch ${s.toFixed(2)} ${r.toFixed(2)} ${dx},${dy}`),
    box: (x0, y0, x1, y1, done) => calls.push(`box ${x0},${y0}-${x1},${y1}${done ? ' done' : ''}`),
    cancel: () => calls.push('cancel'),
  };
  let pending: { fn: () => void; id: number } | null = null;
  const timer: Timer = {
    set: (fn) => {
      pending = { fn, id: 1 };
      return 1;
    },
    clear: () => (pending = null),
  };
  const g = new TouchGestures(h, () => box, timer);
  return { g, calls, fireTimer: () => pending?.fn(), hasTimer: () => pending !== null };
}

describe('gestos de toque', () => {
  it('toque curto e parado vira tap; dois toques próximos viram tap duplo', () => {
    const { g, calls } = setup();
    g.down({ id: 1, x: 100, y: 100, t: 0 });
    g.up({ id: 1, x: 102, y: 101, t: 120 });
    g.down({ id: 2, x: 104, y: 100, t: 300 });
    g.up({ id: 2, x: 104, y: 100, t: 380 });
    expect(calls).toEqual(['tap 102,101', 'tap 104,100 double']);
  });

  it('toque lento demais não é tap (evita comando acidental)', () => {
    const { g, calls } = setup();
    g.down({ id: 1, x: 0, y: 0, t: 0 });
    g.up({ id: 1, x: 0, y: 0, t: 500 });
    expect(calls).toEqual([]);
  });

  it('movimento pequeno não arrasta; acima do limiar vira arrasto de câmera sem tap', () => {
    const { g, calls } = setup();
    g.down({ id: 1, x: 0, y: 0, t: 0 });
    g.move({ id: 1, x: TAP_SLOP - 2, y: 0, t: 10 });
    expect(calls).toEqual([]);
    g.move({ id: 1, x: 30, y: 0, t: 20 });
    g.move({ id: 1, x: 40, y: 5, t: 30 });
    g.up({ id: 1, x: 40, y: 5, t: 40 });
    expect(calls).toEqual(['pan 30,0', 'pan 10,5']);
  });

  it('toque longo parado dispara ordem contextual uma vez e não gera tap', () => {
    const { g, calls, fireTimer } = setup();
    g.down({ id: 1, x: 50, y: 60, t: 0 });
    fireTimer();
    g.up({ id: 1, x: 50, y: 60, t: LONG_PRESS_MS + 10 });
    expect(calls).toEqual(['long 50,60']);
  });

  it('arrastar cancela o toque longo', () => {
    const { g, calls, hasTimer } = setup();
    g.down({ id: 1, x: 0, y: 0, t: 0 });
    g.move({ id: 1, x: 40, y: 0, t: 50 });
    expect(hasTimer()).toBe(false);
    expect(calls).toEqual(['pan 40,0']);
  });

  it('dois dedos: pinça vira zoom e giro, sem tap ao soltar', () => {
    const { g, calls } = setup();
    g.down({ id: 1, x: 100, y: 100, t: 0 });
    g.down({ id: 2, x: 200, y: 100, t: 10 });
    g.move({ id: 2, x: 300, y: 100, t: 20 }); // distância dobra
    g.up({ id: 2, x: 300, y: 100, t: 30 });
    g.up({ id: 1, x: 100, y: 100, t: 40 });
    expect(calls).toEqual(['pinch 2.00 0.00 50,0']);
  });

  it('variações mínimas dentro da zona morta não aplicam zoom', () => {
    const { g, calls } = setup();
    g.down({ id: 1, x: 100, y: 100, t: 0 });
    g.down({ id: 2, x: 200, y: 100, t: 0 });
    g.move({ id: 2, x: 201, y: 100, t: 10 });
    expect(calls[0]?.startsWith('pinch 1.00 0.00')).toBe(true);
  });

  it('ferramenta Área: arrastar desenha retângulo e conclui ao soltar', () => {
    const { g, calls } = setup(true);
    g.down({ id: 1, x: 10, y: 10, t: 0 });
    g.move({ id: 1, x: 60, y: 40, t: 50 });
    g.up({ id: 1, x: 80, y: 50, t: 400 });
    expect(calls).toEqual(['box 10,10-60,40', 'box 10,10-80,50 done']);
  });

  it('segundo dedo durante o retângulo cancela a seleção por área', () => {
    const { g, calls } = setup(true);
    g.down({ id: 1, x: 10, y: 10, t: 0 });
    g.move({ id: 1, x: 60, y: 40, t: 50 });
    g.down({ id: 2, x: 200, y: 200, t: 60 });
    expect(calls.at(-1)).toBe('cancel');
  });

  it('pointercancel do navegador descarta o gesto sem comandos', () => {
    const { g, calls } = setup();
    g.down({ id: 1, x: 10, y: 10, t: 0 });
    g.cancelPointer(1);
    g.up({ id: 1, x: 10, y: 10, t: 50 });
    expect(calls).toEqual([]);
    expect(g.active).toBe(false);
  });

  it('usa o temporizador do navegador por padrão', () => {
    vi.stubGlobal('window', { setTimeout: vi.fn(() => 7), clearTimeout: vi.fn() });
    const g = new TouchGestures({ tap() {}, longPress() {}, pan() {}, pinch() {}, box() {}, cancel() {} }, () => false);
    g.down({ id: 1, x: 0, y: 0, t: 0 });
    expect((window as unknown as { setTimeout: ReturnType<typeof vi.fn> }).setTimeout).toHaveBeenCalledWith(expect.any(Function), LONG_PRESS_MS);
    vi.unstubAllGlobals();
  });
});
