import { BUILDINGS, UNITS, type BuildingType, type ProducibleType } from './config.ts';
import type { EntityId } from './types.ts';
import { isSpecId, type SpecId } from './upgrades.ts';
import { isModId, type ModId } from './modernization.ts';
import { TRADE_RESOURCES, TRANSPORT_MODES, type TradeResource, type TransportMode } from './trade.ts';

export type Command =
  | { type: 'move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack_move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack'; unitIds: EntityId[]; targetId: EntityId }
  | { type: 'stop'; unitIds: EntityId[] }
  | { type: 'build'; buildingType: BuildingType; cx: number; cy: number }
  | { type: 'produce'; buildingId: EntityId; unitType: ProducibleType }
  | { type: 'set_workers'; buildingId: EntityId; count: number }
  | { type: 'cancel_production'; buildingId: EntityId }
  | { type: 'set_rally'; buildingId: EntityId; x: number; y: number }
  /** Melhoria para o próximo nível; `spec` é obrigatório no nível que pede especialização. */
  | { type: 'upgrade'; buildingId: EntityId; spec?: SpecId }
  | { type: 'cancel_upgrade'; buildingId: EntityId }
  /** Instala um pacote de modernização nas unidades (Fase 5); cada uma precisa estar perto de uma instalação compatível. */
  | { type: 'modernize'; unitIds: EntityId[]; mod: ModId }
  | { type: 'cancel_modernize'; unitIds: EntityId[] }
  /** Comércio (Fase 6): proposta (ou contraproposta) a outro país, resposta, retirada e cancelamento. */
  | { type: 'trade_offer'; partner: number; side: 'buy' | 'sell'; resource: TradeResource; quantity: number; price: number; mode: TransportMode; days: number; counterOf?: number }
  | { type: 'trade_respond'; offerId: number; accept: boolean }
  | { type: 'trade_withdraw'; offerId: number }
  | { type: 'trade_cancel'; contractId: number };

const MAX_UNITS_PER_COMMAND = 60;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isIdList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length > 0 && v.length <= MAX_UNITS_PER_COMMAND && v.every(isId);

/** Valida a forma de um comando recebido pela rede. Não verifica regras de jogo. */
export function parseCommand(raw: unknown): Command | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'move':
    case 'attack_move':
      if (!isIdList(raw.unitIds) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      return { type: raw.type, unitIds: [...new Set(raw.unitIds)], x: raw.x, y: raw.y };
    case 'attack':
      if (!isIdList(raw.unitIds) || !isId(raw.targetId)) return null;
      return { type: 'attack', unitIds: [...new Set(raw.unitIds)], targetId: raw.targetId };
    case 'stop':
      if (!isIdList(raw.unitIds)) return null;
      return { type: 'stop', unitIds: [...new Set(raw.unitIds)] };
    case 'build':
      if (typeof raw.buildingType !== 'string' || !Object.hasOwn(BUILDINGS, raw.buildingType)) return null;
      if (!Number.isInteger(raw.cx) || !Number.isInteger(raw.cy)) return null;
      return { type: 'build', buildingType: raw.buildingType as BuildingType, cx: raw.cx as number, cy: raw.cy as number };
    case 'produce':
      if (!isId(raw.buildingId) || typeof raw.unitType !== 'string' || (raw.unitType !== 'citizen' && raw.unitType !== 'recruit' && !Object.hasOwn(UNITS, raw.unitType))) return null;
      return { type: 'produce', buildingId: raw.buildingId, unitType: raw.unitType as ProducibleType };
    case 'set_workers':
      if (!isId(raw.buildingId) || !Number.isInteger(raw.count) || (raw.count as number) < 0 || (raw.count as number) > 50) return null;
      return { type: 'set_workers', buildingId: raw.buildingId, count: raw.count as number };
    case 'cancel_production':
      if (!isId(raw.buildingId)) return null;
      return { type: 'cancel_production', buildingId: raw.buildingId };
    case 'set_rally':
      if (!isId(raw.buildingId) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      return { type: 'set_rally', buildingId: raw.buildingId, x: raw.x, y: raw.y };
    case 'upgrade':
      if (!isId(raw.buildingId)) return null;
      if (raw.spec !== undefined && raw.spec !== null && !isSpecId(raw.spec)) return null;
      return isSpecId(raw.spec) ? { type: 'upgrade', buildingId: raw.buildingId, spec: raw.spec } : { type: 'upgrade', buildingId: raw.buildingId };
    case 'cancel_upgrade':
      if (!isId(raw.buildingId)) return null;
      return { type: 'cancel_upgrade', buildingId: raw.buildingId };
    case 'modernize':
      if (!isIdList(raw.unitIds) || !isModId(raw.mod)) return null;
      return { type: 'modernize', unitIds: [...new Set(raw.unitIds)], mod: raw.mod };
    case 'cancel_modernize':
      if (!isIdList(raw.unitIds)) return null;
      return { type: 'cancel_modernize', unitIds: [...new Set(raw.unitIds)] };
    case 'trade_offer': {
      if (!Number.isInteger(raw.partner) || (raw.partner as number) < 0 || (raw.partner as number) > 1000) return null;
      if (raw.side !== 'buy' && raw.side !== 'sell') return null;
      if (!TRADE_RESOURCES.includes(raw.resource as TradeResource) || !TRANSPORT_MODES.includes(raw.mode as TransportMode)) return null;
      if (!Number.isInteger(raw.quantity) || !isFiniteNum(raw.price) || !Number.isInteger(raw.days)) return null;
      if (raw.counterOf !== undefined && !isId(raw.counterOf)) return null;
      return {
        type: 'trade_offer',
        partner: raw.partner as number,
        side: raw.side,
        resource: raw.resource as TradeResource,
        quantity: raw.quantity as number,
        price: raw.price,
        mode: raw.mode as TransportMode,
        days: raw.days as number,
        ...(raw.counterOf !== undefined ? { counterOf: raw.counterOf as number } : {}),
      };
    }
    case 'trade_respond':
      if (!isId(raw.offerId) || typeof raw.accept !== 'boolean') return null;
      return { type: 'trade_respond', offerId: raw.offerId, accept: raw.accept };
    case 'trade_withdraw':
      if (!isId(raw.offerId)) return null;
      return { type: 'trade_withdraw', offerId: raw.offerId };
    case 'trade_cancel':
      if (!isId(raw.contractId)) return null;
      return { type: 'trade_cancel', contractId: raw.contractId };
    default:
      return null;
  }
}
