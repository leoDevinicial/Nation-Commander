import { DEPOSIT_RULES, OIL_DEPOSIT_AMOUNT, Terrain, type DepositSize } from './config.ts';
import type { Cell } from './types.ts';

/**
 * Depósito natural: agrupamento contínuo (4-vizinhança) de um terreno de recurso, ou uma jazida
 * de petróleo. Tem classe de tamanho, limite de instalações e quantidade extraível finita.
 * Solo fértil não forma depósito (renovável).
 */
export interface Deposit {
  id: number;
  /** null = jazida de petróleo. */
  terrain: Terrain | null;
  cells: number[];
  size: DepositSize;
  maxSites: number;
  /**
   * Lugar (02/11): depósitos ligados que dividem o limite `PLACE_MAX_SITES` — a rocha e o minério de uma mesma
   * montanha. Floresta e petróleo: o próprio depósito.
   */
  place: number;
  initial: number;
  remaining: number;
}

export interface DepositIndex {
  deposits: Deposit[];
  /** Depósito de cada célula (-1 = nenhum). Jazidas de petróleo marcam a célula âncora. */
  cellDeposit: Int32Array;
}

export function sizeClass(terrain: Terrain, cells: number): DepositSize {
  const r = DEPOSIT_RULES[terrain]!;
  return cells >= r.largeFrom ? 'large' : cells >= r.mediumFrom ? 'medium' : 'small';
}

/** Determinístico: mesma grade → mesmos depósitos, na mesma ordem. */
export function findDeposits(map: { width: number; height: number; terrain: ArrayLike<Terrain>; resourceNodes: Cell[] }): DepositIndex {
  const { width: w, height: h } = map;
  const cellDeposit = new Int32Array(w * h).fill(-1);
  const deposits: Deposit[] = [];
  for (let i = 0; i < w * h; i++) {
    const t = map.terrain[i]!;
    const rule = DEPOSIT_RULES[t];
    if (!rule || cellDeposit[i] !== -1) continue;
    const id = deposits.length;
    const cells: number[] = [];
    const stack = [i];
    cellDeposit[i] = id;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const x = c % w;
      const y = (c - x) / w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
      for (const n of nb) {
        if (n < 0 || cellDeposit[n] !== -1 || map.terrain[n] !== t) continue;
        cellDeposit[n] = id;
        stack.push(n);
      }
    }
    cells.sort((a, b) => a - b);
    const size = sizeClass(t, cells.length);
    const amount = cells.length * rule.amountPerCell;
    deposits.push({ id, terrain: t, cells, size, maxSites: rule.maxSites[size], place: id, initial: amount, remaining: amount });
  }
  // montanhas: rocha e minério ligados (4-vizinhança) formam um lugar só; o lugar recebe o menor id entre eles
  const mountain = (t: Terrain | undefined) => t === Terrain.Rock || t === Terrain.Ore;
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !mountain(map.terrain[i])) continue;
    const ids = new Set<number>();
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      ids.add(cellDeposit[c]!);
      const x = c % w;
      const y = (c - x) / w;
      for (const n of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
        if (n < 0 || seen[n] || !mountain(map.terrain[n])) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    const place = Math.min(...ids);
    for (const id of ids) deposits[id]!.place = place;
  }
  for (const n of map.resourceNodes) {
    const id = deposits.length;
    const i = n.cy * w + n.cx;
    cellDeposit[i] = id;
    deposits.push({ id, terrain: null, cells: [i], size: 'small', maxSites: 1, place: id, initial: OIL_DEPOSIT_AMOUNT, remaining: OIL_DEPOSIT_AMOUNT });
  }
  return { deposits, cellDeposit };
}
