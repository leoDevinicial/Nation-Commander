import { countryBonus, type CountryBonus } from '../../shared/sim/countryBonus.ts';
import { useAppStore } from './useAppStore.ts';

/** País do jogador nesta partida e o bônus único dele (custos e tempos mostrados no HUD). */
export function useMyBonus(): CountryBonus {
  const id = useAppStore((s) => s.match?.players.find((p) => p.slot === s.match?.yourSlot)?.countryId);
  return countryBonus(id);
}
