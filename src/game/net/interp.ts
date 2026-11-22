/**
 * Relógio da interpolação entre snapshots (15/11). Antes: `alpha = min(1, (agora − chegada) / intervalo)` e, a cada
 * snapshot, o ponto de partida virava o destino anterior. Com a rede irregular isso dava o "anda, para, anda" das
 * tropas e dos mísseis:
 * - pacote atrasado: alpha travava em 1 e a tropa ficava parada no destino até o próximo chegar;
 * - pacote adiantado: a tropa saltava do ponto desenhado (ex.: 70% do caminho) para o destino antigo (100%).
 *
 * Agora:
 * - quem recebe um snapshot parte de onde estava desenhado naquele instante (`rebase`: `prev = lerp(prev, curr,
 *   alpha)`), nunca salta;
 * - cada trecho dura o intervalo entre snapshots mais uma folga do tamanho da variação medida na chegada dos pacotes
 *   (`slackMs`), então o próximo quase sempre chega antes do fim do trecho e ninguém para;
 * - se ainda assim atrasar, segue um pouco na mesma direção (até `MAX_EXTRAPOLATION`) em vez de congelar.
 *
 * 22/11: com o servidor sobrecarregado a partida anda mais devagar que o relógio (ex.: 1/3 da velocidade) e os
 * snapshots chegam a cada 300 ms trazendo só 100 ms de jogo. Cada trecho durava 100 ms + folga e a tropa parava até o
 * próximo ("o míssil parando e andando no ar"). Agora o trecho dura pelo menos o intervalo real médio de chegada: o
 * movimento fica mais lento, como a partida, mas contínuo.
 */
export const MAX_EXTRAPOLATION = 1.15;

export class SnapshotClock {
  private at = 0;
  private intervalMs = 100;
  /** Variação média (ms) da chegada dos snapshots em relação ao intervalo esperado. */
  private jitterMs = 0;
  private lastArrival = 0;
  /** Intervalo real médio (ms) entre as chegadas: maior que o de jogo quando o servidor não dá conta. */
  private gapMs = 0;

  /** Folga somada a cada trecho: cobre a variação da rede sem atrasar à toa quem tem conexão estável. */
  get slackMs(): number {
    return Math.max(8, Math.min(160, this.jitterMs * 1.6));
  }

  get jitter(): number {
    return this.jitterMs;
  }

  /** Recomeça (partida nova, reconexão): o primeiro snapshot vai direto ao destino. */
  reset(): void {
    this.at = 0;
    this.lastArrival = 0;
    this.jitterMs = 0;
    this.gapMs = 0;
  }

  /** Duração esperada de um trecho: o intervalo de jogo, ou o real se o servidor estiver atrasando a partida. */
  private expected(intervalMs: number, speed: number): number {
    return Math.max(intervalMs / Math.max(0.01, speed), Math.min(this.gapMs, 1000));
  }

  /**
   * Fração do trecho atual a desenhar agora (0 = ponto de partida, 1 = último snapshot, acima disso extrapola). Na
   * pausa, 1: tudo para no último estado.
   */
  alpha(now: number, paused: boolean, speed: number): number {
    if (paused || this.at === 0) return 1;
    const dur = this.expected(this.intervalMs, speed) + this.slackMs;
    return Math.max(0, Math.min(MAX_EXTRAPOLATION, (now - this.at) / dur));
  }

  /**
   * Um snapshot chegou. `intervalMs` é a distância em tempo de jogo até o anterior (ticks × duração do tick); a
   * variação é medida contra esse intervalo na velocidade atual.
   */
  arrive(now: number, intervalMs: number, speed: number): void {
    if (this.lastArrival > 0) {
      const gap = now - this.lastArrival;
      // média lenta: rajadas (vários de uma vez) e um buraco isolado não mudam o ritmo de repente
      if (gap < 2000) this.gapMs = this.gapMs === 0 ? gap : this.gapMs + (gap - this.gapMs) * 0.1;
      const expected = this.expected(intervalMs, speed);
      const dev = Math.abs(gap - expected);
      // média móvel que sobe rápido (rede piorou) e desce devagar (não encolhe a folga num instante bom)
      this.jitterMs += (Math.min(400, dev) - this.jitterMs) * (dev > this.jitterMs ? 0.25 : 0.04);
    }
    this.lastArrival = now;
    this.at = now;
    this.intervalMs = intervalMs;
  }
}

/** Ângulo do caminho mais curto entre `a` e `b`, a fração `t` (aceita t > 1). */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}
