import { RESOURCE_LABELS, RESOURCE_TYPES, type Cost, type ResourceType, type Stockpile } from '../../../shared/sim/config.ts';

import { Mountain, Package, TreePine, Wheat, type LucideIcon } from 'lucide-react';
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

/** Gota de petróleo cheia, com reflexo (a gota vazada lia como água; 05/11). */
export function OilIcon({ size = 24, strokeWidth = 2, color = 'currentColor', ...rest }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M12 2.5c3.2 4.3 6.2 7.7 6.2 11.4a6.2 6.2 0 0 1-12.4 0c0-3.7 3-7.1 6.2-11.4z" fill={color} fillOpacity={0.85} />
      <path d="M9.4 14.6a2.8 2.8 0 0 0 2.4 2.6" stroke="#fff" strokeOpacity={0.75} />
    </svg>
  );
}

/** Pedras de carvão (a chama lia como fogo; 05/11): três blocos facetados escuros com a borda clara. */
export function CoalIcon({ size = 24, strokeWidth = 2, color = 'currentColor', ...rest }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M2.5 20.5 4 13.5l5-2.5 4 4-1.5 5.5z" fill="#4b525d" />
      <path d="M11.5 20.5l1.5-5.5 5-2 4 3.5-1 4z" fill="#4b525d" />
      <path d="M8 10.5 9.5 4.5l5-1.5 3 4-2 4-4.5 1.5z" fill="#4b525d" />
    </svg>
  );
}

/**
 * Ícone e cor fixa de cada recurso, iguais em todo o jogo (identidade "Sala de Situação", 05/11): comida dourada,
 * madeira verde, pedra cinza, ferro cobre, petróleo azul-violeta, carvão grafite, suprimentos areia.
 */
export const RESOURCE_STYLE: Record<ResourceType, { icon: LucideIcon | typeof IngotIcon | typeof OilIcon; color: string }> = {
  food: { icon: Wheat, color: '#d9b45a' },
  wood: { icon: TreePine, color: '#7fbf6a' },
  stone: { icon: Mountain, color: '#a9b3bd' },
  iron: { icon: IngotIcon, color: '#c98a63' },
  oil: { icon: OilIcon, color: '#8f8cff' },
  coal: { icon: CoalIcon, color: '#a7adb7' },
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
