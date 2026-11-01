/**
 * KNPS-08 — regiões do servidor de jogo.
 *
 * `VITE_GAME_SERVERS` lista os servidores, um por região: `LETRA|Nome|endereço`, separados por vírgula. Exemplo:
 *   V|Virgínia (EUA)|wss://nc-virginia.onrender.com,F|Frankfurt (Europa)|wss://nc-frankfurt.onrender.com
 * A letra é a mesma do `KNPS_REGION_LETTER` daquele servidor: os códigos de sala criados lá começam com ela. Sem a
 * variável, vale um servidor só (`VITE_GAME_SERVER_URL`) e nada muda.
 *
 * O ping de cada região é medido por HTTP (`/knps/ping`, 3 vezes; a primeira só abre a conexão). É uma estimativa do
 * caminho até a região, não o ping do WebSocket (esse é medido pelo servidor depois de conectar).
 */
export interface GameRegion {
  letter: string;
  label: string;
  url: string;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function parseRegions(raw: string | undefined, fallbackUrl: string, normalize: (u: string) => string = (u) => u): GameRegion[] {
  const out: GameRegion[] = [];
  for (const part of (raw ?? '').split(',')) {
    const [letter, label, url] = part.split('|').map((x) => x.trim());
    const l = (letter ?? '').toUpperCase();
    if (l.length !== 1 || !LETTERS.includes(l) || !label || !url || out.some((r) => r.letter === l)) continue;
    out.push({ letter: l, label, url: normalize(url) });
  }
  return out.length ? out : [{ letter: '', label: 'Servidor', url: fallbackUrl }];
}

/** Endereço HTTP(S) da mesma máquina do WebSocket (para as sondas e a lista de salas). */
export function httpBase(wsUrl: string): string {
  try {
    const u = new URL(wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'));
    return `${u.protocol}//${u.host}`;
  } catch {
    return wsUrl;
  }
}

/** Região dona de um código de sala (pela primeira letra); null = sem região (o servidor atual). */
export function regionForCode(regions: GameRegion[], code: string): GameRegion | null {
  const c = code.trim().toUpperCase();
  return regions.find((r) => r.letter && c.startsWith(r.letter)) ?? null;
}

/** A melhor região pelo ping medido (sem medida fica por último; empate fica na ordem da lista). */
export function bestRegion(regions: GameRegion[], pings: ReadonlyMap<string, number | null>): GameRegion {
  let best = regions[0]!;
  let bestPing = Infinity;
  for (const r of regions) {
    const p = pings.get(r.letter);
    if (p !== null && p !== undefined && p < bestPing) {
      best = r;
      bestPing = p;
    }
  }
  return best;
}

/** Mede o ping HTTP de uma região: 3 sondas; descarta a primeira (abre a conexão) e fica com a menor das outras. */
export async function probeRegion(r: GameRegion, fetchFn: typeof fetch = fetch, now: () => number = () => performance.now()): Promise<number | null> {
  const url = `${httpBase(r.url)}/knps/ping`;
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const t0 = now();
    try {
      const res = await fetchFn(url, { cache: 'no-store', signal: ctl.signal });
      if (!res.ok && res.status !== 204) return null;
      samples.push(now() - t0);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return Math.round(Math.min(...samples.slice(1)));
}
