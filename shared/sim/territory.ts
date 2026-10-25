/**
 * Território (inspirado nas fronteiras de Rise of Nations). Cada edifício concluído com raio de
 * território projeta influência; cada célula pertence ao país de maior influência sobre ela.
 * Empates ficam neutros. É recalculado sempre que uma fonte surge, some ou muda de alcance, então
 * a fronteira avança e recua com as construções (fronteira dinâmica).
 *
 * Influência de uma fonte numa célula: peso × (raio − distância), se a distância ≤ raio.
 */
export interface TerritorySource {
  owner: number;
  /** Centro em coordenadas de célula (pode ser fracionário). */
  x: number;
  y: number;
  radius: number;
  weight: number;
}

export const NO_OWNER = -1;

export function computeTerritory(width: number, height: number, sources: readonly TerritorySource[]): Int8Array {
  const owner = new Int8Array(width * height).fill(NO_OWNER);
  const best = new Float32Array(width * height);
  const tie = new Uint8Array(width * height);
  // melhor influência por dono em cada célula: agrega o máximo por dono e depois compara donos
  const perOwner = new Map<number, Float32Array>();
  for (const s of sources) {
    if (s.radius <= 0) continue;
    let grid = perOwner.get(s.owner);
    if (!grid) perOwner.set(s.owner, (grid = new Float32Array(width * height)));
    const y0 = Math.max(0, Math.floor(s.y - s.radius));
    const y1 = Math.min(height - 1, Math.ceil(s.y + s.radius));
    const x0 = Math.max(0, Math.floor(s.x - s.radius));
    const x1 = Math.min(width - 1, Math.ceil(s.x + s.radius));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y);
        if (d > s.radius) continue;
        const v = s.weight * (s.radius - d) + 1e-3;
        const i = y * width + x;
        if (v > grid[i]!) grid[i] = v;
      }
  }
  for (const [o, grid] of [...perOwner].sort((a, b) => a[0] - b[0])) {
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i]!;
      if (v <= 0) continue;
      if (v > best[i]! + 1e-6) {
        best[i] = v;
        owner[i] = o;
        tie[i] = 0;
      } else if (Math.abs(v - best[i]!) <= 1e-6) tie[i] = 1;
    }
  }
  for (let i = 0; i < owner.length; i++) if (tie[i]) owner[i] = NO_OWNER;
  return owner;
}

/** Codificação compacta para a rede: um caractere por célula ('0' = neutro, '1'.. = dono + 1). */
export function encodeTerritory(t: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < t.length; i++) s += String.fromCharCode(49 + t[i]!);
  return s;
}

export function decodeTerritory(s: string): Int8Array {
  const out = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) - 49;
  return out;
}
