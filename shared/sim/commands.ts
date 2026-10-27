import { BUILDINGS, UNITS, isMilitaryResearchId, type BuildingType, type MilitaryResearchId, type ProducibleType, type UnitType } from './config.ts';
import type { EntityId } from './types.ts';
import { isSpecId, type SpecId } from './upgrades.ts';
import { isModId, type ModId } from './modernization.ts';
import { isAircraftType, type AircraftType, type MissionKind } from './air.ts';
import { TRADE_RESOURCES, TRANSPORT_MODES, type TradeResource, type TransportMode } from './trade.ts';

export type Command =
  | { type: 'move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack_move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack'; unitIds: EntityId[]; targetId: EntityId }
  | { type: 'stop'; unitIds: EntityId[] }
  | { type: 'build'; buildingType: BuildingType; cx: number; cy: number }
  | { type: 'produce'; buildingId: EntityId; unitType: ProducibleType }
  | { type: 'set_workers'; buildingId: EntityId; count: number }
  /**
   * Põe cidadãos escolhidos pelo jogador para trabalhar num edifício: cada fonte é 0 (cidadão
   * ocioso) ou o id do edifício onde ele trabalha hoje (realocação).
   */
  | { type: 'assign_workers'; buildingId: EntityId; sources: number[] }
  | { type: 'cancel_production'; buildingId: EntityId }
  /** Pesquisa militar no Centro de Pesquisa (uma por vez por centro) e cancelamento (devolve 75%). */
  | { type: 'military_research'; buildingId: EntityId; researchId: MilitaryResearchId }
  | { type: 'cancel_military_research'; buildingId: EntityId }
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
  | { type: 'trade_cancel'; contractId: number }
  /** Força aérea e mísseis (Fase 7). */
  | { type: 'build_aircraft'; buildingId: EntityId; aircraftType: AircraftType }
  | { type: 'air_mission'; buildingId: EntityId; aircraftIds: number[]; mission: MissionKind; targetId?: EntityId; x?: number; y?: number }
  | { type: 'build_missile'; buildingId: EntityId }
  | { type: 'missile_prepare'; buildingId: EntityId; x: number; y: number }
  | { type: 'missile_authorize'; launchId: number }
  | { type: 'missile_abort'; launchId: number }
  /** Operações expedicionárias (Fase 8): lançar contra um setor de um país em guerra e recuar. */
  | { type: 'launch_operation'; target: number; sectorId: string; unitIds: EntityId[] }
  | { type: 'operation_retreat'; opId: number }
  /** Modo Sandbox: ferramentas livres (só aceitas numa partida Sandbox, para o jogador humano). */
  | { type: 'sandbox_toggle'; key: SandboxToggle; value: boolean }
  | { type: 'sandbox_spawn'; unitType: UnitType; x: number; y: number; count: number; enemy: boolean; maxed: boolean }
  | { type: 'sandbox_level'; buildingId: EntityId; level: number; spec?: SpecId }
  | { type: 'sandbox_maxout'; unitIds: EntityId[] }
  | { type: 'sandbox_remove'; ids: EntityId[] }
  | { type: 'sandbox_clear'; who: 'enemy' | 'mine' };

/** Opções do Sandbox: produção/obras instantâneas, IA inimiga agindo e mapa revelado. */
export type SandboxToggle = 'instant' | 'aiActive' | 'reveal';
export const SANDBOX_TOGGLES: readonly SandboxToggle[] = ['instant', 'aiActive', 'reveal'];
/** Máximo de unidades criadas de uma vez no Sandbox. */
export const SANDBOX_MAX_SPAWN = 20;

const MAX_UNITS_PER_COMMAND = 60;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isIdList = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.length <= MAX_UNITS_PER_COMMAND && v.every(isId);

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
    case 'assign_workers':
      if (!isId(raw.buildingId) || !Array.isArray(raw.sources) || raw.sources.length === 0 || raw.sources.length > MAX_UNITS_PER_COMMAND) return null;
      if (!raw.sources.every((v) => v === 0 || isId(v))) return null;
      return { type: 'assign_workers', buildingId: raw.buildingId, sources: raw.sources as number[] };
    case 'military_research':
      if (!isId(raw.buildingId) || !isMilitaryResearchId(raw.researchId)) return null;
      return { type: 'military_research', buildingId: raw.buildingId, researchId: raw.researchId };
    case 'cancel_military_research':
      if (!isId(raw.buildingId)) return null;
      return { type: 'cancel_military_research', buildingId: raw.buildingId };
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
    case 'build_aircraft':
      if (!isId(raw.buildingId) || !isAircraftType(raw.aircraftType)) return null;
      return { type: 'build_aircraft', buildingId: raw.buildingId, aircraftType: raw.aircraftType };
    case 'air_mission': {
      if (!isId(raw.buildingId) || !isIdList(raw.aircraftIds) || (raw.mission !== 'strike' && raw.mission !== 'recon')) return null;
      if (raw.targetId !== undefined && !isId(raw.targetId)) return null;
      const hasPoint = raw.x !== undefined || raw.y !== undefined;
      if (hasPoint && (!isFiniteNum(raw.x) || !isFiniteNum(raw.y))) return null;
      return {
        type: 'air_mission',
        buildingId: raw.buildingId,
        aircraftIds: [...new Set(raw.aircraftIds)],
        mission: raw.mission,
        ...(raw.targetId !== undefined ? { targetId: raw.targetId as number } : {}),
        ...(hasPoint ? { x: raw.x as number, y: raw.y as number } : {}),
      };
    }
    case 'build_missile':
      if (!isId(raw.buildingId)) return null;
      return { type: 'build_missile', buildingId: raw.buildingId };
    case 'missile_prepare':
      if (!isId(raw.buildingId) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      return { type: 'missile_prepare', buildingId: raw.buildingId, x: raw.x, y: raw.y };
    case 'missile_authorize':
    case 'missile_abort':
      if (!isId(raw.launchId)) return null;
      return { type: raw.type, launchId: raw.launchId };
    case 'launch_operation':
      if (!Number.isInteger(raw.target) || (raw.target as number) < 0 || (raw.target as number) > 1000) return null;
      if (typeof raw.sectorId !== 'string' || raw.sectorId.length > 40 || !isIdList(raw.unitIds)) return null;
      return { type: 'launch_operation', target: raw.target as number, sectorId: raw.sectorId, unitIds: [...new Set(raw.unitIds)] };
    case 'operation_retreat':
      if (!isId(raw.opId)) return null;
      return { type: 'operation_retreat', opId: raw.opId };
    case 'sandbox_toggle':
      if (!SANDBOX_TOGGLES.includes(raw.key as SandboxToggle) || typeof raw.value !== 'boolean') return null;
      return { type: 'sandbox_toggle', key: raw.key as SandboxToggle, value: raw.value };
    case 'sandbox_spawn':
      if (typeof raw.unitType !== 'string' || !Object.hasOwn(UNITS, raw.unitType) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      if (!Number.isInteger(raw.count) || (raw.count as number) < 1 || (raw.count as number) > SANDBOX_MAX_SPAWN) return null;
      if (typeof raw.enemy !== 'boolean' || typeof raw.maxed !== 'boolean') return null;
      return { type: 'sandbox_spawn', unitType: raw.unitType as UnitType, x: raw.x, y: raw.y, count: raw.count as number, enemy: raw.enemy, maxed: raw.maxed };
    case 'sandbox_level':
      if (!isId(raw.buildingId) || !Number.isInteger(raw.level) || (raw.level as number) < 1 || (raw.level as number) > 20) return null;
      if (raw.spec !== undefined && !isSpecId(raw.spec)) return null;
      return isSpecId(raw.spec) ? { type: 'sandbox_level', buildingId: raw.buildingId, level: raw.level as number, spec: raw.spec } : { type: 'sandbox_level', buildingId: raw.buildingId, level: raw.level as number };
    case 'sandbox_maxout':
      if (!isIdList(raw.unitIds)) return null;
      return { type: 'sandbox_maxout', unitIds: [...new Set(raw.unitIds)] };
    case 'sandbox_remove':
      if (!isIdList(raw.ids)) return null;
      return { type: 'sandbox_remove', ids: [...new Set(raw.ids)] };
    case 'sandbox_clear':
      return raw.who === 'enemy' || raw.who === 'mine' ? { type: 'sandbox_clear', who: raw.who } : null;
    default:
      return null;
  }
}
