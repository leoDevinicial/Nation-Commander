/**
 * Veterania (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 1, §3.2): tropas que abatem inimigos sobem
 * de patente, com mais dano e mais vida, e ganham insígnia. Dá motivo para preservar as tropas e
 * combina com a modernização (os bônus se somam aos pacotes instalados).
 */
export interface RankDef {
  label: string;
  /** Abates (unidades ou edifícios) para chegar à patente. */
  kills: number;
}

export const RANKS: readonly RankDef[] = [
  { label: 'Recruta', kills: 0 },
  { label: 'Veterano', kills: 2 },
  { label: 'Elite', kills: 5 },
  { label: 'Herói', kills: 10 },
];

/** Por patente: +10% de dano e +8% de vida máxima. */
export const RANK_DAMAGE = 0.1;
export const RANK_HP = 0.08;

export function rankFor(kills: number): number {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (kills >= RANKS[i]!.kills) r = i;
  return r;
}

export const rankDamageMul = (rank: number): number => 1 + RANK_DAMAGE * rank;
export const rankHpMul = (rank: number): number => 1 + RANK_HP * rank;
