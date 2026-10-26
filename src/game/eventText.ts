import { MODS } from '../../shared/sim/modernization.ts';
import { AIRCRAFT, type AircraftType } from '../../shared/sim/air.ts';
import { BUILDINGS, RESOURCE_LABELS, UNITS, type BuildingType, type UnitType } from '../../shared/sim/config.ts';
import type { BuildingStatus } from '../../shared/sim/types.ts';

const HALT_TEXT: Partial<Record<BuildingStatus, string>> = {
  no_workers: 'parado sem trabalhadores',
  storage_full: 'armazenamento cheio, produção pausada',
  no_tank: 'sem tanque de petróleo ao alcance',
  outside_territory: 'recursos fora do território',
  unpaid: 'manutenção não paga',
};
import type { SimEvent } from '../../shared/sim/types.ts';
import { specDef, type SpecId } from '../../shared/sim/upgrades.ts';

function specLabel(type: BuildingType, spec: SpecId): string {
  return specDef(type, spec)?.label ?? spec;
}

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
    case 'citizen_trained':
      return e.owner === mySlot ? { text: 'Novo cidadão na força de trabalho', tone: 'good' } : null;
    case 'recruit_trained':
      return e.owner === mySlot ? { text: 'Novo recruta na reserva militar', tone: 'good' } : null;
    case 'production_halted':
      return e.owner === mySlot ? { text: `${BUILDINGS[e.buildingType].label}: ${HALT_TEXT[e.reason] ?? 'produção parada'}`, tone: 'warn' } : null;
    case 'deposit_depleted':
      return e.owner === mySlot ? { text: `${BUILDINGS[e.buildingType].label}: depósito esgotado`, tone: 'warn' } : null;
    case 'storage_lost':
      return e.owner === mySlot
        ? { text: `Perda de ${e.amount} de ${RESOURCE_LABELS[e.resource].toLowerCase()} (${e.reason === 'destroyed' ? 'depósito destruído' : e.reason === 'attack' ? 'depósito atingido por ataque' : 'sem espaço de armazenamento'})`, tone: 'bad' }
        : null;
    case 'shortage':
      return e.owner === mySlot
        ? {
            text:
              e.resource === 'food'
                ? 'Fome: sem comida em estoque, a produção cai pela metade'
                : e.resource === 'oil'
                  ? 'Falta petróleo para a manutenção: edifícios mecanizados pararam'
                  : 'Faltam suprimentos para a manutenção: edifícios com manutenção em atraso pararam',
            tone: 'bad',
          }
        : null;
    case 'upgrade_started':
      return e.owner === mySlot ? { text: `Obra de melhoria iniciada: ${BUILDINGS[e.buildingType].label} → nível ${e.toLevel}${e.spec ? ` (${specLabel(e.buildingType, e.spec)})` : ''}`, tone: 'info' } : null;
    case 'upgrade_completed':
      return e.owner === mySlot
        ? { text: `Melhoria concluída: ${BUILDINGS[e.buildingType].label} agora no nível ${e.level}${e.spec ? ` · ${specLabel(e.buildingType, e.spec)}` : ''}`, tone: 'good' }
        : null;
    case 'upgrade_cancelled':
      return e.owner === mySlot ? { text: `Obra de melhoria cancelada: ${BUILDINGS[e.buildingType].label} (devolução parcial)`, tone: 'warn' } : null;
    case 'attrition':
      return e.owner === mySlot ? { text: 'Tropas sofrendo atrito em território inimigo: leve um blindado de transporte para manter o suprimento', tone: 'warn' } : null;
    case 'trade_offer':
      return e.to === mySlot ? { text: 'Nova oferta comercial recebida (Nação → Comércio)', tone: 'info' } : null;
    case 'trade_reply':
      if (e.to !== mySlot) return null;
      return e.accepted ? { text: 'Proposta comercial aceita: contrato fechado', tone: 'good' } : { text: `Proposta comercial: ${e.reason ?? 'recusada'}`, tone: 'warn' };
    case 'contract_update': {
      if (e.seller !== mySlot && e.buyer !== mySlot) return null;
      const kind = e.seller === mySlot ? 'exportação' : 'importação';
      if (e.status === 'fulfilled') return { text: `Contrato de ${kind} cumprido`, tone: 'good' };
      if (e.status === 'suspended') return { text: `Contrato de ${kind} suspenso: ${e.text}`, tone: 'warn' };
      if (e.status === 'interrupted') return { text: `Contrato de ${kind} interrompido: ${e.text}`, tone: 'bad' };
      if (e.status === 'expired' || e.status === 'cancelled') return { text: `Contrato de ${kind} encerrado: ${e.text}`, tone: 'warn' };
      return e.text === 'Contrato fechado' ? null : { text: `Comércio: ${e.text}`, tone: 'info' };
    }
    case 'shipment_delivered': {
      const r = RESOURCE_LABELS[e.resource as keyof typeof RESOURCE_LABELS] ?? e.resource;
      if (e.buyer === mySlot) return { text: `Carga recebida: ${e.quantity} de ${r}`, tone: 'good' };
      if (e.seller === mySlot) return { text: `Carga entregue: ${e.quantity} de ${r} (pagamento recebido)`, tone: 'good' };
      return null;
    }
    case 'shipment_lost':
      return e.seller === mySlot || e.buyer === mySlot ? { text: `Carga perdida: ${e.reason}`, tone: 'bad' } : null;
    case 'modernize_started':
      return e.owner === mySlot ? { text: `Modernização iniciada: ${UNITS[e.unitType].label} recebendo ${MODS[e.mod].label}`, tone: 'info' } : null;
    case 'unit_modernized':
      return e.owner === mySlot ? { text: `${UNITS[e.unitType].label} modernizado: ${MODS[e.mod].label}`, tone: 'good' } : null;
    case 'modernize_cancelled':
      return e.owner === mySlot
        ? {
            text:
              e.reason === 'facility_lost'
                ? `Modernização interrompida: a instalação foi destruída (${MODS[e.mod].label}, devolução parcial)`
                : `Modernização cancelada: ${MODS[e.mod].label} (devolução parcial)`,
            tone: 'warn',
          }
        : null;
    case 'air_mission':
      return e.owner === mySlot ? { text: e.phase === 'launched' ? e.text : `Missão aérea: ${e.text}`, tone: e.phase === 'launched' ? 'info' : 'good' } : null;
    case 'aircraft_lost':
      return e.owner === mySlot ? { text: `Aeronave perdida: ${AIRCRAFT[e.aircraftType as AircraftType]?.label ?? e.aircraftType}`, tone: 'bad' } : null;
    case 'air_strike':
      if (e.victim === mySlot)
        return { text: `Ataque aéreo inimigo: ${BUILDINGS[e.buildingType].label} atingido (${e.damage} de dano${e.oilLost ? `, ${e.oilLost} de petróleo perdidos` : ''}${e.destroyed ? ', destruído' : ''})`, tone: 'bad' };
      return null;
    case 'missile':
      if (e.owner === mySlot) return { text: e.text, tone: e.state === 'impact' ? 'good' : e.state === 'intercepted' || e.state === 'aborted' ? 'warn' : 'info' };
      if (e.targetOwner === mySlot)
        return e.state === 'flight'
          ? { text: 'ALERTA: míssil inimigo lançado contra o nosso território!', tone: 'bad' }
          : e.state === 'intercepted'
            ? { text: 'Míssil inimigo interceptado pela nossa antiaérea', tone: 'good' }
            : { text: 'Impacto de míssil inimigo no nosso território', tone: 'bad' };
      return null;
    case 'player_defeated':
      return { text: e.slot === mySlot ? 'Nosso QG caiu.' : 'Forças inimigas derrotadas!', tone: e.slot === mySlot ? 'bad' : 'good' };
    default:
      return null;
  }
}
