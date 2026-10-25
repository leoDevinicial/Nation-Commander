import { RESOURCE_LABELS, RESOURCE_TYPES, type Cost, type ResourceType, type Stockpile } from '../../../shared/sim/config.ts';

const PATHS: Record<ResourceType, { d: string; color: string }> = {
  // caixote de suprimentos
  supplies: { d: 'M2 5l6-3 6 3v6l-6 3-6-3z M2 5l6 3 6-3 M8 8v6', color: '#e0b44c' },
  // espiga
  food: { d: 'M8 15V6 M8 6c-2-1-3-3-2-5 2 1 3 3 2 5z M8 9c-2-.5-3.5-2-3.5-3.5 2 0 3.5 1.5 3.5 3.5z M8 9c2-.5 3.5-2 3.5-3.5-2 0-3.5 1.5-3.5 3.5z', color: '#d8c35a' },
  // tora
  wood: { d: 'M3 6h9a2.5 2.5 0 010 5H3a2.5 2.5 0 010-5z M3 6a2.5 2.5 0 000 5', color: '#b0844f' },
  // pedra
  stone: { d: 'M3 12l2-6 4-2 4 3 1 5-4 2z', color: '#a9a49a' },
  // gota de petróleo
  oil: { d: 'M8 2c3 4 4.5 6 4.5 8a4.5 4.5 0 01-9 0C3.5 8 5 6 8 2z', color: '#8fa0b4' },
};

export function ResourceIcon({ type, size = 14 }: { type: ResourceType; size?: number }) {
  const p = PATHS[type];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="inline-block shrink-0">
      <path d={p.d} fill={type === 'oil' || type === 'stone' ? p.color : 'none'} stroke={p.color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
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
            <ResourceIcon type={r} size={compact ? 10 : 12} />
            {cost[r]}
          </span>
        );
      })}
    </span>
  );
}
