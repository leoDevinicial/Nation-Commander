import { RESOURCE_LABELS, RESOURCE_TYPES, type Cost, type ResourceType, type Stockpile } from '../../../shared/sim/config.ts';

import { Droplet, Flame, Mountain, Package, TreePine, Wheat, type LucideIcon } from 'lucide-react';
import type { SVGProps } from 'react';

/** Lingote de ferro no mesmo traço do Lucide (a bigorna não era reconhecida como ferro; 05/11). */
export function IngotIcon({ size = 24, strokeWidth = 2, ...rest }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M3 18h18l-3.5-7h-11z" />
      <path d="M6.5 11 8.5 7h7l2 4" />
      <path d="M8.5 7 7 11" />
    </svg>
  );
}

/**
 * Ícone e cor fixa de cada recurso, iguais em todo o jogo (identidade "Sala de Situação", 05/11): comida dourada,
 * madeira verde, pedra cinza, ferro cobre, petróleo azul-violeta, carvão grafite, suprimentos areia.
 */
export const RESOURCE_STYLE: Record<ResourceType, { icon: LucideIcon | typeof IngotIcon; color: string }> = {
  food: { icon: Wheat, color: '#d9b45a' },
  wood: { icon: TreePine, color: '#7fbf6a' },
  stone: { icon: Mountain, color: '#a9b3bd' },
  iron: { icon: IngotIcon, color: '#c98a63' },
  oil: { icon: Droplet, color: '#8f8cff' },
  coal: { icon: Flame, color: '#8a8f99' },
  supplies: { icon: Package, color: '#e2c48a' },
};

export function ResourceIcon({ type, size = 14, color }: { type: ResourceType; size?: number; color?: string }) {
  const { icon: Icon, color: c } = RESOURCE_STYLE[type];
  return <Icon size={size} strokeWidth={size <= 12 ? 2.25 : 2} color={color ?? c} aria-hidden className="inline-block shrink-0" />;
}

/** Custo em vários recursos; itens que faltam aparecem em vermelho com o déficit no título. */
export function CostLabel({ cost, have, compact }: { cost: Cost; have?: Stockpile | null; compact?: boolean }) {
  const items = RESOURCE_TYPES.filter((r) => (cost[r] ?? 0) > 0);
  if (items.length === 0) return <span className="text-ink-400">grátis</span>;
  return (
    <span className={`inline-flex flex-wrap items-center ${compact ? 'gap-x-1' : 'gap-x-2'} gap-y-0.5 font-mono`}>
      {items.map((r) => {
        const short = have ? have[r] < (cost[r] ?? 0) : false;
        return (
          <span key={r} className={`inline-flex items-center gap-0.5 ${short ? 'text-red-300' : 'text-ink-100'}`} title={`${RESOURCE_LABELS[r]}: ${cost[r]}`}>
            <ResourceIcon type={r} size={compact ? 10 : 12} color={short ? '#e85c4e' : undefined} />
            {cost[r]}
          </span>
        );
      })}
    </span>
  );
}
