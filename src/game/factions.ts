/** Cores de facção por slot. Acompanhadas de forma/ícone na interface (não dependem só da cor). */
export const FACTION_COLORS = ['#3d8fd6', '#d6503f', '#4fb36a', '#c9a43a', '#9a5fd0', '#e07fb0'] as const;

export function factionColor(slot: number): string {
  return FACTION_COLORS[slot % FACTION_COLORS.length]!;
}
