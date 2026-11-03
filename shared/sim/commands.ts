import { BUILDERS, BUILDINGS, UNITS, isMilitaryResearchId, type BuildingType, type MilitaryResearchId, type ProducibleType, type UnitType } from './config.ts';
import type { EntityId } from './types.ts';
import { isSpecId, type SpecId } from './upgrades.ts';
import { isModId, type ModId } from './modernization.ts';
import { isAircraftType, type AircraftType, type MissionKind } from './air.ts';
import { TRADE_RESOURCES, TRANSPORT_MODES, type TradeResource, type TransportMode } from './trade.ts';
import { isMarketResource, type MarketResource } from './market.ts';
import { isZoneKind, ZONING, type ZoneKind } from './zoning.ts';

/** Lista de células (índices na grade) de um comando de zoneamento. */
const isCellList = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.length <= ZONING.maxCellsPerCommand && v.every((x) => Number.isInteger(x) && x >= 0 && x < 1 << 20);

export type Command =
  | { type: 'move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack_move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack'; unitIds: EntityId[]; targetId: EntityId }
  /** Navio de transporte (03/11): tropas embarcam num navio próprio; o navio desembarca a carga perto de (x, y). */
  | { type: 'embark'; unitIds: EntityId[]; shipId: EntityId }
  | { type: 'unload'; shipId: EntityId; x: number; y: number }
  /** Atacar uma célula de estrada ou rodovia de quem está em guerra com você (02/11). */
  | { type: 'attack_road'; unitIds: EntityId[]; cx: number; cy: number }
  | { type: 'stop'; unitIds: EntityId[] }
  | { type: 'build'; buildingType: BuildingType; cx: number; cy: number }
  | { type: 'produce'; buildingId: EntityId; unitType: ProducibleType }
  | { type: 'set_workers'; buildingId: EntityId; count: number }
  /** Quantos cidadãos constroem a obra (0 a `BUILDERS.max`). */
  | { type: 'set_builders'; buildingId: EntityId; count: number }
  /**
   * Põe cidadãos escolhidos pelo jogador para trabalhar num edifício: cada fonte é 0 (cidadão
   * ocioso) ou o id do edifício onde ele trabalha hoje (realocação).
   */
  | { type: 'assign_workers'; buildingId: EntityId; sources: number[] }
  | { type: 'cancel_production'; buildingId: EntityId }
  /** Pesquisa militar no Centro de Pesquisa (uma por vez por centro) e cancelamento (devolve 75%). */
  | { type: 'military_research'; buildingId: EntityId; researchId: MilitaryResearchId }
  | { type: 'cancel_military_research'; buildingId: EntityId }
  /** Avanço de era (obra no Centro de Comando) e cancelamento (devolve 75%). */
  | { type: 'advance_era' }
  /** Engenheiro de Combate: instala uma mina antitanque no ponto. */
  | { type: 'lay_mine'; unitIds: EntityId[]; x: number; y: number }
  /** Estrada: traçado de células adjacentes (horizontal, vertical ou diagonal). */
  | { type: 'build_road'; cells: { cx: number; cy: number }[]; highway?: boolean }
  /** Zoneamento (02/11): pinta (ou apaga, com `kind` null) células junto às estradas; demole lotes; imposto do setor. */
  | { type: 'zone_paint'; cells: number[]; kind: ZoneKind | null }
  | { type: 'zone_demolish'; cells: number[] }
  | { type: 'zone_tax'; kind: ZoneKind; pct: number }
  /** Mercado interno do Terminal Comercial: vende o excedente por suprimentos. */
  | { type: 'market_sell'; buildingId: EntityId; resource: MarketResource; quantity: number }
  | { type: 'market_buy'; buildingId: EntityId; resource: MarketResource; quantity: number }
  /** Programa Espacial: autoriza o lançamento do satélite. */
  | { type: 'space_launch'; buildingId: EntityId }
  | { type: 'cancel_era' }
  | { type: 'set_rally'; buildingId: EntityId; x: number; y: number }
  /** Melhoria para o próximo nível; `spec` é obrigatório no nível que pede especialização. */
  | { type: 'upgrade'; buildingId: EntityId; spec?: SpecId }
  | { type: 'cancel_upgrade'; buildingId: EntityId }
  /** Instala um pacote de modernização nas unidades (Fase 5); cada uma precisa estar perto de uma instalação compatível. */
  | { type: 'modernize'; unitIds: EntityId[]; mod: ModId }
  | { type: 'cancel_modernize'; unitIds: EntityId[] }
  /**
   * Comércio (02/11): anúncio de venda simples ou contrato, compra de um anúncio escolhendo o transporte, retirada do
   * anúncio, fim de contrato e compra/venda no mercado mundial.
   */
  | { type: 'trade_list'; kind: 'sale' | 'contract'; items: { resource: TradeResource; quantity: number }[]; priceUsd: number; everyDays?: number }
  | { type: 'trade_buy'; listingId: number; mode: TransportMode }
  | { type: 'trade_withdraw'; listingId: number }
  | { type: 'trade_cancel'; contractId: number }
  | { type: 'trade_world'; side: 'buy' | 'sell'; resource: TradeResource; quantity: number; mode: TransportMode }
  /** Força aérea e mísseis (Fase 7). */
  | { type: 'build_aircraft'; buildingId: EntityId; aircraftType: AircraftType }
  | { type: 'air_mission'; buildingId: EntityId; aircraftIds: number[]; mission: MissionKind; targetId?: EntityId; x?: number; y?: number; unitIds?: EntityId[] }
  | { type: 'build_missile'; buildingId: EntityId; nuclear?: boolean }
  | { type: 'missile_prepare'; buildingId: EntityId; x: number; y: number; nuclear?: boolean }
  | { type: 'missile_authorize'; launchId: number }
  | { type: 'missile_abort'; launchId: number }
  /** Drone de ataque: lançar contra um ponto, assumir/devolver o controle, pilotar (−1..1) e detonar. */
  | { type: 'launch_drone'; buildingId: EntityId; x: number; y: number }
  | { type: 'drone_control'; droneId: number; take: boolean }
  | { type: 'drone_steer'; droneId: number; turn: number; climb: number; throttle: number }
  | { type: 'drone_detonate'; droneId: number }
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
    case 'embark':
      if (!isIdList(raw.unitIds) || !isId(raw.shipId)) return null;
      return { type: 'embark', unitIds: [...new Set(raw.unitIds)], shipId: raw.shipId };
    case 'unload':
      if (!isId(raw.shipId) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      return { type: 'unload', shipId: raw.shipId, x: raw.x as number, y: raw.y as number };
    case 'attack_road':
      if (!isIdList(raw.unitIds) || !Number.isInteger(raw.cx) || !Number.isInteger(raw.cy)) return null;
      return { type: 'attack_road', unitIds: [...new Set(raw.unitIds)], cx: raw.cx as number, cy: raw.cy as number };
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
    case 'set_builders':
      if (!isId(raw.buildingId) || !Number.isInteger(raw.count) || (raw.count as number) < 0 || (raw.count as number) > BUILDERS.max) return null;
      return { type: 'set_builders', buildingId: raw.buildingId, count: raw.count as number };
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
    case 'advance_era':
    case 'cancel_era':
      return { type: raw.type };
    case 'lay_mine':
      if (!isIdList(raw.unitIds) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      return { type: 'lay_mine', unitIds: [...new Set(raw.unitIds)], x: raw.x, y: raw.y };
    case 'zone_paint':
      if (!isCellList(raw.cells) || (raw.kind !== null && !isZoneKind(raw.kind))) return null;
      return { type: 'zone_paint', cells: raw.cells, kind: raw.kind as ZoneKind | null };
    case 'zone_demolish':
      if (!isCellList(raw.cells)) return null;
      return { type: 'zone_demolish', cells: raw.cells };
    case 'zone_tax':
      if (!isZoneKind(raw.kind) || !Number.isInteger(raw.pct) || (raw.pct as number) < 0 || (raw.pct as number) > ZONING.taxMax) return null;
      return { type: 'zone_tax', kind: raw.kind, pct: raw.pct as number };
    case 'build_road': {
      if (!Array.isArray(raw.cells) || raw.cells.length === 0 || raw.cells.length > 60) return null;
      const cells: { cx: number; cy: number }[] = [];
      for (const c of raw.cells) {
        if (!isObj(c) || !Number.isInteger(c.cx) || !Number.isInteger(c.cy)) return null;
        cells.push({ cx: c.cx as number, cy: c.cy as number });
      }
      return { type: 'build_road', cells, ...(raw.highway === true ? { highway: true } : {}) };
    }
    case 'market_sell':
      if (!isId(raw.buildingId) || !isMarketResource(raw.resource) || !Number.isInteger(raw.quantity) || (raw.quantity as number) <= 0 || (raw.quantity as number) > 100_000) return null;
      return { type: 'market_sell', buildingId: raw.buildingId, resource: raw.resource, quantity: raw.quantity as number };
    case 'market_buy':
      if (!isId(raw.buildingId) || !isMarketResource(raw.resource) || !Number.isInteger(raw.quantity) || (raw.quantity as number) <= 0 || (raw.quantity as number) > 100_000) return null;
      return { type: 'market_buy', buildingId: raw.buildingId, resource: raw.resource, quantity: raw.quantity as number };
    case 'space_launch':
      return isId(raw.buildingId) ? { type: 'space_launch', buildingId: raw.buildingId } : null;
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
    case 'trade_list': {
      if (raw.kind !== 'sale' && raw.kind !== 'contract') return null;
      if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 3) return null;
      const items: { resource: TradeResource; quantity: number }[] = [];
      for (const it of raw.items) {
        if (!isObj(it) || !TRADE_RESOURCES.includes(it.resource as TradeResource) || !Number.isInteger(it.quantity)) return null;
        items.push({ resource: it.resource as TradeResource, quantity: it.quantity as number });
      }
      if (!isFiniteNum(raw.priceUsd) || (raw.priceUsd as number) <= 0) return null;
      if (raw.everyDays !== undefined && !Number.isInteger(raw.everyDays)) return null;
      return { type: 'trade_list', kind: raw.kind, items, priceUsd: raw.priceUsd as number, ...(raw.everyDays !== undefined ? { everyDays: raw.everyDays as number } : {}) };
    }
    case 'trade_buy':
      if (!isId(raw.listingId) || !TRANSPORT_MODES.includes(raw.mode as TransportMode)) return null;
      return { type: 'trade_buy', listingId: raw.listingId, mode: raw.mode as TransportMode };
    case 'trade_withdraw':
      if (!isId(raw.listingId)) return null;
      return { type: 'trade_withdraw', listingId: raw.listingId };
    case 'trade_world':
      if ((raw.side !== 'buy' && raw.side !== 'sell') || !TRADE_RESOURCES.includes(raw.resource as TradeResource) || !TRANSPORT_MODES.includes(raw.mode as TransportMode)) return null;
      if (!Number.isInteger(raw.quantity) || (raw.quantity as number) < 1 || (raw.quantity as number) > 10_000) return null;
      return { type: 'trade_world', side: raw.side, resource: raw.resource as TradeResource, quantity: raw.quantity as number, mode: raw.mode as TransportMode };
    case 'trade_cancel':
      if (!isId(raw.contractId)) return null;
      return { type: 'trade_cancel', contractId: raw.contractId };
    case 'build_aircraft':
      if (!isId(raw.buildingId) || !isAircraftType(raw.aircraftType)) return null;
      return { type: 'build_aircraft', buildingId: raw.buildingId, aircraftType: raw.aircraftType };
    case 'air_mission': {
      if (!isId(raw.buildingId) || !isIdList(raw.aircraftIds) || (raw.mission !== 'strike' && raw.mission !== 'recon' && raw.mission !== 'paradrop')) return null;
      if (raw.unitIds !== undefined && !isIdList(raw.unitIds)) return null;
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
        ...(raw.unitIds !== undefined ? { unitIds: [...new Set(raw.unitIds as number[])] } : {}),
      };
    }
    case 'build_missile':
      if (!isId(raw.buildingId)) return null;
      return raw.nuclear === true ? { type: 'build_missile', buildingId: raw.buildingId, nuclear: true } : { type: 'build_missile', buildingId: raw.buildingId };
    case 'missile_prepare':
      if (!isId(raw.buildingId) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      return { type: 'missile_prepare', buildingId: raw.buildingId, x: raw.x, y: raw.y, ...(raw.nuclear === true ? { nuclear: true } : {}) };
    case 'missile_authorize':
    case 'missile_abort':
      if (!isId(raw.launchId)) return null;
      return { type: raw.type, launchId: raw.launchId };
    case 'launch_drone':
      if (!isId(raw.buildingId) || !isFiniteNum(raw.x) || !isFiniteNum(raw.y)) return null;
      return { type: 'launch_drone', buildingId: raw.buildingId, x: raw.x, y: raw.y };
    case 'drone_control':
      if (!isId(raw.droneId) || typeof raw.take !== 'boolean') return null;
      return { type: 'drone_control', droneId: raw.droneId, take: raw.take };
    case 'drone_steer': {
      // só números finitos; os limites (−1..1) também são impostos na simulação
      if (!isId(raw.droneId) || !isFiniteNum(raw.turn) || !isFiniteNum(raw.climb) || !isFiniteNum(raw.throttle)) return null;
      const c = (v: number) => Math.max(-1, Math.min(1, v));
      return { type: 'drone_steer', droneId: raw.droneId, turn: c(raw.turn), climb: c(raw.climb), throttle: c(raw.throttle) };
    }
    case 'drone_detonate':
      if (!isId(raw.droneId)) return null;
      return { type: 'drone_detonate', droneId: raw.droneId };
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
