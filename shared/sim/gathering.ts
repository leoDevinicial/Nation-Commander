import { BUILDINGS, DEPOSIT_SIZE_LABELS, type BuildingType, type Terrain } from './config.ts';
import type { DepositIndex } from './deposits.ts';
import type { Cell } from './types.ts';

export interface GatherWorld {
  width: number;
  height: number;
  terrain: ArrayLike<Terrain>;
}

/**
 * Células de recurso que um edifício de coleta reivindicaria em `cell`, excluindo as já
 * reivindicadas por outro edifício do mesmo tipo e as que `allowed` recusar (ex.: fora do
 * território). Ordem determinística: mais próximas do centro primeiro, depois menor índice.
 */
export function claimableCells(world: GatherWorld, type: BuildingType, cell: Cell, claimed: ReadonlySet<number>, allowed?: (i: number) => boolean): number[] {
  const def = BUILDINGS[type];
  const g = def.gather;
  if (!g || g.terrain === null) return [];
  const size = def.size;
  const cx = cell.cx + size / 2;
  const cy = cell.cy + size / 2;
  const out: { i: number; d: number }[] = [];
  for (let y = cell.cy - g.radius; y < cell.cy + size + g.radius; y++) {
    for (let x = cell.cx - g.radius; x < cell.cx + size + g.radius; x++) {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      const i = y * world.width + x;
      if (world.terrain[i] !== g.terrain || claimed.has(i) || (allowed && !allowed(i))) continue;
      out.push({ i, d: Math.hypot(x + 0.5 - cx, y + 0.5 - cy) });
    }
  }
  out.sort((a, b) => a.d - b.d || a.i - b.i);
  return out.map((o) => o.i);
}

/** Conjunto de células já reivindicadas por edifícios do mesmo tipo. */
export function claimedBy(buildings: Iterable<{ type: BuildingType; claims?: number[] }>, type: BuildingType): Set<number> {
  const set = new Set<number>();
  for (const b of buildings) if (b.type === type) for (const i of b.claims ?? []) set.add(i);
  return set;
}

/** Instalações (de qualquer país, inclusive em obra) que já exploram cada depósito. */
export function sitesByDeposit(buildings: Iterable<{ depositId?: number | null }>): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of buildings) if (b.depositId !== undefined && b.depositId !== null) m.set(b.depositId, (m.get(b.depositId) ?? 0) + 1);
  return m;
}

export interface ClaimChoice {
  claims: number[];
  depositId: number | null;
  /** Motivo quando não há como explorar aqui. */
  error: string | null;
}

/**
 * Escolhe o depósito que o edifício exploraria (o de mais células livres ao alcance que ainda
 * tenha vaga e recurso) e as células que reivindica nele. Solo fértil não tem depósito.
 */
export function chooseClaims(
  world: GatherWorld,
  index: DepositIndex,
  type: BuildingType,
  cell: Cell,
  claimed: ReadonlySet<number>,
  sites: ReadonlyMap<number, number>,
  allowed?: (i: number) => boolean,
): ClaimChoice {
  const g = BUILDINGS[type].gather;
  if (!g) return { claims: [], depositId: null, error: null };
  if (g.terrain === null) {
    const i = cell.cy * world.width + cell.cx;
    const d = index.deposits[index.cellDeposit[i] ?? -1];
    if (!d || d.terrain !== null) return { claims: [], depositId: null, error: 'Poços de petróleo precisam ser construídos sobre uma jazida' };
    if ((sites.get(d.id) ?? 0) >= d.maxSites) return { claims: [], depositId: null, error: 'Esta jazida já tem um poço' };
    if (d.remaining <= 0) return { claims: [], depositId: null, error: 'Jazida esgotada' };
    return { claims: [i], depositId: d.id, error: null };
  }
  const cells = claimableCells(world, type, cell, claimed, allowed);
  const rule = (id: number) => index.deposits[id];
  if (index.cellDeposit.length === 0 || cells.every((i) => (index.cellDeposit[i] ?? -1) < 0)) {
    // recurso renovável (solo fértil)
    const claims = cells.slice(0, g.maxCells);
    return claims.length < g.minCells
      ? { claims: [], depositId: null, error: `Poucos recursos livres ao alcance (${claims.length} de ${g.minCells} necessários)` }
      : { claims, depositId: null, error: null };
  }
  const groups = new Map<number, number[]>();
  for (const i of cells) {
    const id = index.cellDeposit[i]!;
    if (id < 0) continue;
    let arr = groups.get(id);
    if (!arr) groups.set(id, (arr = []));
    arr.push(i);
  }
  const ranked = [...groups].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  let limitMsg: string | null = null;
  for (const [id, list] of ranked) {
    const d = rule(id)!;
    if ((sites.get(id) ?? 0) >= d.maxSites) {
      limitMsg ??= `Depósito ${DEPOSIT_SIZE_LABELS[d.size]} já tem ${d.maxSites} ${d.maxSites === 1 ? 'instalação' : 'instalações'} (limite pelo tamanho)`;
      continue;
    }
    if (d.remaining <= 0) {
      limitMsg ??= 'Depósito esgotado';
      continue;
    }
    const claims = list.slice(0, g.maxCells);
    if (claims.length < g.minCells) continue;
    return { claims, depositId: id, error: null };
  }
  const n = ranked[0]?.[1].length ?? 0;
  return { claims: [], depositId: null, error: limitMsg ?? `Poucos recursos livres ao alcance (${Math.min(n, g.maxCells)} de ${g.minCells} necessários)` };
}

/** Renda nominal por segundo de um edifício de coleta com `claims` células (antes de trabalhadores e estoque). */
export function gatherRate(type: BuildingType, claims: number): number {
  const g = BUILDINGS[type].gather;
  if (!g) return 0;
  return g.terrain === null ? g.ratePerCell : Math.min(claims, g.maxCells) * g.ratePerCell;
}
