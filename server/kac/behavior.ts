/**
 * KAC-09 — sinais de automação (bots e macros), só como alerta para revisão humana.
 *
 * Um jogador humano manda ordens em rajadas irregulares: pensa, clica várias vezes, para, olha o mapa. Um script
 * costuma mandar no mesmo compasso (intervalos quase iguais) ou num ritmo que nenhuma mão sustenta. O monitor guarda
 * os intervalos entre as ordens que chegam ao servidor (relógio do servidor, nunca o do cliente) e, a cada lote,
 * mede:
 * - **regularidade**: coeficiente de variação (desvio-padrão ÷ média) dos últimos intervalos; humano fica bem acima
 *   de 0,5, um temporizador fixo fica perto de 0;
 * - **ritmo sustentado**: ordens no último minuto.
 *
 * APM alto sozinho NÃO é sinal (jogadores bons de RTS são rápidos); o alerta de ritmo só dispara num patamar que
 * nenhuma pessoa mantém por um minuto inteiro. Os limites são conservadores de propósito: errar para o lado de não
 * alertar. Cada alerta guarda os números que o geraram, para quem for revisar.
 */
export const BEHAVIOR_POLICY = {
  /** Intervalos analisados (os mais recentes). */
  window: 120,
  /** Reavalia a cada N ordens. */
  every: 40,
  /** Regularidade: coeficiente de variação abaixo disso, com média abaixo de `regularMaxMeanMs`. */
  regularCv: 0.08,
  regularMaxMeanMs: 3000,
  /** Ritmo: ordens no último minuto acima disso (15 por segundo, sem parar, por 60 s). */
  sustainedPerMinute: 900,
  /** No máximo um alerta por jogador a cada N ms. */
  cooldownMs: 5 * 60_000,
};

export interface AutomationSignal {
  kind: 'regular_timing' | 'sustained_rate';
  /** Números que geraram o alerta (para a revisão). */
  cv?: number;
  meanMs?: number;
  perMinute?: number;
  samples: number;
}

interface Track {
  last: number | null;
  intervals: number[];
  times: number[];
  count: number;
  alertedAt: number;
}

export class BehaviorMonitor {
  private readonly tracks = new Map<string, Track>();

  /** Registra a chegada de uma ordem; devolve um sinal quando o padrão de automação aparece. */
  record(key: string, now: number): AutomationSignal | null {
    let t = this.tracks.get(key);
    if (!t) this.tracks.set(key, (t = { last: null, intervals: [], times: [], count: 0, alertedAt: -Infinity }));
    if (t.last !== null) {
      t.intervals.push(now - t.last);
      if (t.intervals.length > BEHAVIOR_POLICY.window) t.intervals.shift();
    }
    t.last = now;
    t.times.push(now);
    while (t.times.length && now - t.times[0]! > 60_000) t.times.shift();
    t.count++;
    if (t.count % BEHAVIOR_POLICY.every !== 0 || now - t.alertedAt < BEHAVIOR_POLICY.cooldownMs) return null;
    const signal = evaluate(t);
    if (signal) t.alertedAt = now;
    return signal;
  }

  forget(key: string): void {
    this.tracks.delete(key);
  }
}

function evaluate(t: Track): AutomationSignal | null {
  if (t.times.length > BEHAVIOR_POLICY.sustainedPerMinute) return { kind: 'sustained_rate', perMinute: t.times.length, samples: t.times.length };
  const n = t.intervals.length;
  if (n < BEHAVIOR_POLICY.window) return null;
  const mean = t.intervals.reduce((a, b) => a + b, 0) / n;
  if (mean <= 0 || mean > BEHAVIOR_POLICY.regularMaxMeanMs) return null;
  const sd = Math.sqrt(t.intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const cv = sd / mean;
  return cv < BEHAVIOR_POLICY.regularCv ? { kind: 'regular_timing', cv: Math.round(cv * 1000) / 1000, meanMs: Math.round(mean), samples: n } : null;
}
