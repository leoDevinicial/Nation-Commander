import { BUILDINGS, UNITS, type BuildingType, type ProducibleType } from './config.ts';
import type { EntityId } from './types.ts';

export type Command =
  | { type: 'move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack_move'; unitIds: EntityId[]; x: number; y: number }
  | { type: 'attack'; unitIds: EntityId[]; targetId: EntityId }
  | { type: 'stop'; unitIds: EntityId[] }
  | { type: 'build'; buildingType: BuildingType; cx: number; cy: number }
  | { type: 'produce'; buildingId: EntityId; unitType: ProducibleType }
  | { type: 'set_workers'; buildingId: EntityId; count: number }
  | { type: 'cancel_production'; buildingId: EntityId }
  | { type: 'set_rally'; buildingId: EntityId; x: number; y: number };

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
      if (!isId(raw.buildingId) || typeof raw.unitType !== 'string' || (raw.unitType !== 'citizen' && !Object.hasOwn(UNITS, raw.unitType))) return null;
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
    default:
      return null;
  }
}
