import { countryName } from '../../../shared/data/countries.ts';
import { factionColor } from '../../game/factions.ts';

/** Insígnia da nação (Sala de Situação): sigla do país num distintivo chanfrado na cor da vaga. */
export function NationBadge({ slot, countryId, size = 'md' }: { slot: number; countryId: string; size?: 'sm' | 'md' }) {
  const color = factionColor(slot);
  return (
    <span
      className={`nc-num grid shrink-0 place-items-center font-bold text-white ${size === 'sm' ? 'h-6 w-9 text-[10px]' : 'h-8 w-12 text-xs'}`}
      style={{ background: color, boxShadow: `0 0 10px ${color}55`, clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)', textShadow: '0 1px 2px rgb(0 0 0 / 0.5)' }}
      title={countryName(countryId)}
      translate="no"
    >
      {countryId}
    </span>
  );
}
