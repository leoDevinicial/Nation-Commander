/**
 * Vigia de memória (KAICS Adaptables+ · Onda 3, R-DEV-05 / R-MEM-01).
 *
 * A cada 15 s guarda o que o renderizador mantém na placa de vídeo (geometrias, texturas,
 * programas de shader) e, onde o navegador informa, a memória do JavaScript. Se em 10 min, sem
 * troca de cena, as geometrias ou texturas sobem quase sem parar — e mais rápido que o número de
 * tropas e prédios, que crescem naturalmente numa partida —, isso vira incidente: possível
 * vazamento. É um indício (hipótese), nunca um motivo para reduzir qualidade: a correção é no
 * código do jogo, e o relatório traz os números para achá-la.
 */

export interface MemorySample {
  /** Momento da amostra (ms). */
  t: number;
  geometries: number;
  textures: number;
  programs: number;
  /** Memória do JavaScript em uso (MB; null fora do Chrome). */
  heapMb: number | null;
  /** Tropas + prédios na cena (a memória cresce com eles sem ser vazamento). */
  entities: number;
}

export const MEMORY_WATCH = {
  everyMs: 15_000,
  spanMs: 600_000,
  /** Alta mínima (20%) do total e da proporção por entidade. */
  minRise: 0.2,
  /** Alta mínima em objetos (geometrias ou texturas). */
  minObjects: 50,
  /** Alta mínima da memória do JavaScript (MB). */
  minHeapMb: 50,
  /** Fração mínima de amostras que não caíram em relação à anterior ("quase sem parar"). */
  monotonic: 0.8,
};

type Key = 'geometries' | 'textures';
const LABEL: Record<Key, string> = { geometries: 'geometrias', textures: 'texturas' };

export class MemoryWatch {
  private samples: MemorySample[] = [];
  private lastAt = -Infinity;
  private lastAlert = -Infinity;

  constructor(private readonly cfg = MEMORY_WATCH) {}

  /** Já é hora de uma nova amostra. */
  due(now: number): boolean {
    return now - this.lastAt >= this.cfg.everyMs;
  }

  latest(): MemorySample | null {
    return this.samples.at(-1) ?? null;
  }

  /** Troca de cena ou cena retomada: a comparação recomeça. */
  reset(): void {
    this.samples = [];
  }

  /** Nova amostra; devolve o texto do incidente quando a alta é contínua (no máximo 1 a cada 10 min). */
  add(s: MemorySample): string | null {
    this.lastAt = s.t;
    this.samples.push(s);
    while (this.samples.length && this.samples[0]!.t < s.t - this.cfg.spanMs * 1.2) this.samples.shift();
    if (s.t - this.lastAlert < this.cfg.spanMs) return null;
    const win = this.samples.filter((x) => x.t >= s.t - this.cfg.spanMs);
    if (win.length < 4 || s.t - win[0]!.t < this.cfg.spanMs * 0.95) return null;
    const first = win[0]!;
    const last = win.at(-1)!;
    const minutes = Math.round((last.t - first.t) / 60_000);
    const steady = (get: (x: MemorySample) => number) => {
      let up = 0;
      for (let i = 1; i < win.length; i++) if (get(win[i]!) >= get(win[i - 1]!)) up++;
      return up / (win.length - 1) >= this.cfg.monotonic;
    };
    const rise = 1 + this.cfg.minRise;
    for (const key of ['geometries', 'textures'] as Key[]) {
      const a = first[key];
      const b = last[key];
      const perA = a / Math.max(1, first.entities);
      const perB = b / Math.max(1, last.entities);
      if (b - a >= this.cfg.minObjects && b >= a * rise && perB >= perA * rise && steady((x) => x[key])) {
        this.lastAlert = s.t;
        return `Memória de vídeo subindo sem parar: ${LABEL[key]} ${a} → ${b} em ${minutes} min, mais rápido que tropas e prédios (${first.entities} → ${last.entities}). Possível vazamento — nada é reduzido por isso`;
      }
    }
    if (first.heapMb !== null && last.heapMb !== null && last.heapMb - first.heapMb >= this.cfg.minHeapMb && last.heapMb >= first.heapMb * rise && steady((x) => x.heapMb ?? 0)) {
      this.lastAlert = s.t;
      return `Memória do JavaScript subindo sem parar: ${Math.round(first.heapMb)} → ${Math.round(last.heapMb)} MB em ${minutes} min. Possível vazamento — nada é reduzido por isso`;
    }
    return null;
  }
}
