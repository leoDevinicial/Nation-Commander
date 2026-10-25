import { BUILDINGS, UNITS, type BuildingType, type UnitType } from '../../shared/sim/config.ts';
import type { SimEvent } from '../../shared/sim/types.ts';

/** Mensagens do painel de eventos, derivadas exclusivamente de eventos da simulação. */
export function describeEvent(e: SimEvent, mySlot: number): { text: string; tone: 'info' | 'good' | 'warn' | 'bad' } | null {
  switch (e.type) {
    case 'construction_started':
      return e.owner === mySlot ? { text: `Construção iniciada: ${BUILDINGS[e.buildingType].label}`, tone: 'info' } : null;
    case 'construction_completed':
      return e.owner === mySlot ? { text: `Construção concluída: ${BUILDINGS[e.buildingType].label}`, tone: 'good' } : null;
    case 'unit_produced':
      return e.owner === mySlot ? { text: `Pronta para o combate: ${UNITS[e.unitType].label}`, tone: 'good' } : null;
    case 'under_attack':
      return e.owner === mySlot ? { text: 'Nossas forças estão sob ataque!', tone: 'bad' } : null;
    case 'destroyed': {
      const label = e.entity === 'unit' ? UNITS[e.entityType as UnitType].label : BUILDINGS[e.entityType as BuildingType].label;
      if (e.owner === mySlot) return { text: e.entity === 'unit' ? `Unidade perdida: ${label}` : `Estrutura destruída: ${label}`, tone: 'bad' };
      if (e.killerOwner === mySlot && e.entity === 'building') return { text: `Estrutura inimiga destruída: ${label}`, tone: 'good' };
      return null;
    }
    case 'player_defeated':
      return { text: e.slot === mySlot ? 'Nosso QG caiu.' : 'Forças inimigas derrotadas!', tone: e.slot === mySlot ? 'bad' : 'good' };
    default:
      return null;
  }
}
