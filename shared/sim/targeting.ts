import { UNITS, type UnitType } from './config.ts';
import type { Entity } from './types.ts';

/**
 * Quem pode atingir quem (03/11): submarino só é atingido por outro submarino (nem torres, nem área, nem mísseis); o
 * submarino só ataca navios; o navio de guerra (fragata) atira em navios e construções, nunca em tropas em terra.
 * `attacker` null = torre, míssil ou outro efeito que não é unidade.
 */
export function canHit(attacker: UnitType | null, e: Entity): boolean {
  const t = e.kind === 'unit' ? UNITS[e.type] : null;
  if (t?.submarine) return attacker !== null && !!UNITS[attacker].submarine;
  if (attacker === null) return true;
  const a = UNITS[attacker];
  if (a.submarine) return !!t?.naval;
  if (a.shipsAndCoast) return e.kind === 'building' || !!t?.naval;
  return true;
}
