/**
 * Reconhecimento de gestos de toque, independente do Three.js e do DOM (testável).
 *
 * Mapeamento:
 * - toque curto ............ tap (selecionar / confirmar / ordem, conforme a ferramenta)
 * - dois toques rápidos .... tap duplo (selecionar todas as unidades do tipo na tela)
 * - toque longo parado ..... ordem contextual (equivale ao botão direito)
 * - arrastar com um dedo ... mover a câmera (ou desenhar retângulo, na ferramenta "Área")
 * - dois dedos ............. pinça = zoom, giro = rotação, arrasto do ponto médio = câmera
 *
 * Limiares evitam comandos acidentais: o movimento só vira arrasto depois de TAP_SLOP px,
 * e um gesto de dois dedos cancela o toque e o toque longo em andamento.
 */
export const TAP_SLOP = 10;
export const TAP_MAX_MS = 350;
export const LONG_PRESS_MS = 550;
/** Intervalo máximo entre soltar o primeiro toque e iniciar o segundo. */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_SLOP = 28;
/** Variação mínima da distância entre os dedos (fração) antes de aplicar zoom. */
export const PINCH_DEADZONE = 0.03;
/** Giro mínimo (rad) antes de aplicar rotação. */
export const TWIST_DEADZONE = 0.06;

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  t: number;
}

export interface GestureHandlers {
  tap(x: number, y: number, double: boolean): void;
  longPress(x: number, y: number): void;
  pan(dx: number, dy: number): void;
  /** scale > 1 = dedos afastando (aproximar); rotate em rad; dx/dy = arrasto do ponto médio. */
  pinch(scale: number, rotate: number, dx: number, dy: number): void;
  box(x0: number, y0: number, x1: number, y1: number, done: boolean): void;
  /** Gesto abandonado (ex.: retângulo interrompido por um segundo dedo). */
  cancel(): void;
}

export interface Timer {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

const defaultTimer: Timer = {
  set: (fn, ms) => window.setTimeout(fn, ms) as unknown as number,
  clear: (id) => window.clearTimeout(id),
};

type Phase = 'idle' | 'pending' | 'drag' | 'box' | 'multi' | 'consumed';

export class TouchGestures {
  private readonly pts = new Map<number, TouchPoint>();
  private start: TouchPoint | null = null;
  private phase: Phase = 'idle';
  private longTimer: number | null = null;
  private lastTap: { x: number; y: number; t: number } | null = null;
  private multi: { dist: number; angle: number; mx: number; my: number; zoomActive: boolean; twistActive: boolean } | null = null;

  constructor(
    private readonly h: GestureHandlers,
    /** Ferramenta "Área": arrastar com um dedo desenha o retângulo em vez de mover a câmera. */
    private readonly boxMode: () => boolean,
    private readonly timer: Timer = defaultTimer,
  ) {}

  get active(): boolean {
    return this.pts.size > 0;
  }

  down(p: TouchPoint): void {
    this.pts.set(p.id, { ...p });
    if (this.pts.size === 1) {
      this.start = { ...p };
      this.phase = 'pending';
      this.armLongPress();
    } else if (this.pts.size === 2) {
      if (this.phase === 'box') this.h.cancel();
      this.clearLongPress();
      this.phase = 'multi';
      this.multi = this.measure();
    }
  }

  move(p: TouchPoint): void {
    const prev = this.pts.get(p.id);
    if (!prev) return;
    this.pts.set(p.id, { ...p });
    if (this.phase === 'multi' && this.pts.size >= 2) {
      this.updateMulti();
      return;
    }
    if (this.pts.size !== 1 || !this.start) return;
    if (this.phase === 'pending' && Math.hypot(p.x - this.start.x, p.y - this.start.y) > TAP_SLOP) {
      this.clearLongPress();
      this.phase = this.boxMode() ? 'box' : 'drag';
      // aplica o deslocamento acumulado desde o início para não "engolir" o limiar
      if (this.phase === 'drag') this.h.pan(p.x - this.start.x, p.y - this.start.y);
      else this.h.box(this.start.x, this.start.y, p.x, p.y, false);
      return;
    }
    if (this.phase === 'drag') this.h.pan(p.x - prev.x, p.y - prev.y);
    else if (this.phase === 'box') this.h.box(this.start.x, this.start.y, p.x, p.y, false);
  }

  up(p: TouchPoint): void {
    if (!this.pts.has(p.id)) return;
    this.pts.delete(p.id);
    const start = this.start;
    if (this.phase === 'multi') {
      // ao soltar um dos dois dedos, o restante não vira toque nem arrasto
      if (this.pts.size === 0) this.reset();
      else this.phase = 'consumed';
      return;
    }
    if (this.pts.size > 0) return;
    this.clearLongPress();
    if (start && this.phase === 'pending' && p.t - start.t <= TAP_MAX_MS && Math.hypot(p.x - start.x, p.y - start.y) <= TAP_SLOP) {
      const last = this.lastTap;
      const double = !!last && start.t - last.t <= DOUBLE_TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) <= DOUBLE_TAP_SLOP;
      this.lastTap = double ? null : { x: p.x, y: p.y, t: p.t };
      this.h.tap(p.x, p.y, double);
    } else if (start && this.phase === 'box') {
      this.h.box(start.x, start.y, p.x, p.y, true);
    }
    this.reset();
  }

  /** pointercancel: o navegador assumiu o gesto; descarta sem gerar comandos. */
  cancelPointer(id: number): void {
    if (!this.pts.delete(id)) return;
    if (this.phase === 'box') this.h.cancel();
    if (this.pts.size === 0) this.reset();
    else this.phase = 'consumed';
  }

  private reset(): void {
    this.clearLongPress();
    this.start = null;
    this.multi = null;
    this.phase = 'idle';
  }

  private armLongPress(): void {
    this.clearLongPress();
    this.longTimer = this.timer.set(() => {
      this.longTimer = null;
      if (this.phase !== 'pending' || !this.start || this.pts.size !== 1) return;
      const cur = this.pts.values().next().value as TouchPoint;
      this.phase = 'consumed';
      this.h.longPress(cur.x, cur.y);
    }, LONG_PRESS_MS);
  }

  private clearLongPress(): void {
    if (this.longTimer !== null) this.timer.clear(this.longTimer);
    this.longTimer = null;
  }

  private measure(): NonNullable<TouchGestures['multi']> {
    const [a, b] = [...this.pts.values()] as [TouchPoint, TouchPoint];
    return {
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      zoomActive: this.multi?.zoomActive ?? false,
      twistActive: this.multi?.twistActive ?? false,
    };
  }

  private updateMulti(): void {
    const prev = this.multi;
    const cur = this.measure();
    if (!prev) {
      this.multi = cur;
      return;
    }
    let scale = cur.dist / prev.dist;
    let rot = wrapAngle(cur.angle - prev.angle);
    // zonas mortas: só começa a dar zoom/girar depois de uma intenção clara
    if (!prev.zoomActive && Math.abs(scale - 1) < PINCH_DEADZONE) scale = 1;
    else cur.zoomActive = true;
    if (!prev.twistActive && Math.abs(rot) < TWIST_DEADZONE) rot = 0;
    else cur.twistActive = true;
    // enquanto o gesto não "engata", mantém a referência para acumular a variação
    if (!cur.zoomActive) cur.dist = prev.dist;
    if (!cur.twistActive) cur.angle = prev.angle;
    this.multi = cur;
    this.h.pinch(scale, rot, cur.mx - prev.mx, cur.my - prev.my);
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
