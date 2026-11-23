import type { ResourceType } from '../sim/config.ts';

/**
 * Eventos globais (23/11): de tempos em tempos o mundo muda para todas as nações da partida ao mesmo tempo, por uns
 * minutos. O anfitrião liga ou desliga na sala (`set_room.globalEvents`). Tudo é determinístico (sorteio da partida).
 * - Crise do petróleo: o petróleo vale o dobro no caixa e os veículos gastam 50% mais combustível.
 * - Inverno rigoroso: as fazendas colhem 30% menos e a energia consumida custa 50% mais.
 * - Alta das commodities: ferro, pedra e carvão valem 50% mais no caixa.
 * (Os pedidos das potências, com prazo e prêmio, já existem na camada nacional.)
 */
export type GlobalEventId = 'oil_crisis' | 'harsh_winter' | 'commodity_boom';

export interface GlobalEventDef {
  label: string;
  description: string;
  /** Duração em dias de jogo (1 dia = 1 s a 1×). */
  days: number;
  /** Preço no caixa de cada recurso produzido (padrão 1). */
  priceMul?: Partial<Record<ResourceType, number>>;
  /** Custo da energia consumida no caixa. */
  energyCostMul?: number;
  /** Coleta das fazendas. */
  foodGatherMul?: number;
  /** Combustível gasto por veículos e navios. */
  fuelMul?: number;
}

export const GLOBAL_EVENTS: Record<GlobalEventId, GlobalEventDef> = {
  oil_crisis: {
    label: 'Crise do petróleo',
    description: 'O petróleo vale o dobro no caixa e veículos e navios gastam 50% mais combustível.',
    days: 150,
    priceMul: { oil: 2 },
    fuelMul: 1.5,
  },
  harsh_winter: {
    label: 'Inverno rigoroso',
    description: 'As fazendas colhem 30% menos e a energia consumida custa 50% mais no caixa.',
    days: 150,
    foodGatherMul: 0.7,
    energyCostMul: 1.5,
  },
  commodity_boom: {
    label: 'Alta das commodities',
    description: 'Ferro, pedra e carvão valem 50% mais no caixa.',
    days: 150,
    priceMul: { iron: 1.5, stone: 1.5, coal: 1.5 },
  },
};

export const GLOBAL_EVENT_IDS = Object.keys(GLOBAL_EVENTS) as GlobalEventId[];

/** Quando: o primeiro aos 9 min de partida; depois, de 7 a 12 min entre um e outro. */
export const GLOBAL_EVENT_TIMING = { firstDay: 540, gapMin: 420, gapMax: 720 };

export interface GlobalEventState {
  on: boolean;
  active: { id: GlobalEventId; endDay: number } | null;
  nextDay: number;
}

export const newGlobalEvents = (on: boolean): GlobalEventState => ({ on, active: null, nextDay: GLOBAL_EVENT_TIMING.firstDay });

/** Um dia: encerra o evento que acabou e sorteia o próximo na hora certa. Devolve o que começou ou terminou. */
export function stepGlobalEvents(s: GlobalEventState, day: number, rand: () => number): { started?: GlobalEventId; ended?: GlobalEventId } {
  if (!s.on) return {};
  if (s.active && day >= s.active.endDay) {
    const ended = s.active.id;
    s.active = null;
    s.nextDay = day + GLOBAL_EVENT_TIMING.gapMin + Math.floor(rand() * (GLOBAL_EVENT_TIMING.gapMax - GLOBAL_EVENT_TIMING.gapMin));
    return { ended };
  }
  if (!s.active && day >= s.nextDay) {
    const id = GLOBAL_EVENT_IDS[Math.min(GLOBAL_EVENT_IDS.length - 1, Math.floor(rand() * GLOBAL_EVENT_IDS.length))]!;
    s.active = { id, endDay: day + GLOBAL_EVENTS[id].days };
    return { started: id };
  }
  return {};
}

/** Efeitos do evento em curso (todos 1 sem evento). */
export function globalFx(s: GlobalEventState | undefined): Required<Pick<GlobalEventDef, 'energyCostMul' | 'foodGatherMul' | 'fuelMul'>> & { priceMul: Partial<Record<ResourceType, number>> } {
  const d = s?.on && s.active ? GLOBAL_EVENTS[s.active.id] : null;
  return { priceMul: d?.priceMul ?? {}, energyCostMul: d?.energyCostMul ?? 1, foodGatherMul: d?.foodGatherMul ?? 1, fuelMul: d?.fuelMul ?? 1 };
}
