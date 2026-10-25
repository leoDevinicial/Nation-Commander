import type { Command } from './sim/commands.ts';
import type { BalanceMode, Budget, ForeignView, GeopoliticalView, HistoryPoint, NationalEvent, NationState } from './strategic/NationalSimulation.ts';
import type { TechId } from './strategic/technologies.ts';
import type { DiplomaticAction } from './strategic/Diplomacy.ts';
import type { PlayerStats, Slot } from './sim/types.ts';
import type { Snapshot } from './sim/snapshot.ts';

export type RoomMode = 'pvp' | 'vs_ai';
export type { BalanceMode };

export type NationalCommand =
  | { type: 'set_budget'; budget: Budget }
  | { type: 'set_research'; techId: TechId | null }
  | { type: 'diplomacy'; action: DiplomaticAction };

/** Visão geopolítica do jogador: só países com quem tem contato trazem dados (ver `viewFor`). */
export type DiplomacyView = GeopoliticalView;
export type { ForeignView };

/** Estado nacional enviado ao cliente. `history` só vem quando muda (a cada registro mensal). */
export type NationView = Omit<NationState, 'history' | 'casualties30d' | 'victories30d'> & {
  history?: HistoryPoint[];
  casualties30d: number;
};

/** Resumo nacional gravado ao fim da partida. */
export interface NationalSummary {
  countryId: string;
  days: number;
  gdpStartUsd: number;
  gdpEndUsd: number;
  realGrowthAvgPct: number;
  approvalEnd: number;
  debtPctGdpEnd: number;
  inflationEndPct: number;
  unemploymentEndPct: number;
  researchDone: TechId[];
}
export type GameSpeed = 1 | 2 | 4;
export const GAME_SPEEDS: readonly GameSpeed[] = [1, 2, 4];

export interface PublicUser {
  id: string;
  name: string;
  guest: boolean;
}

export interface RoomPlayerInfo {
  slot: Slot;
  userId: string | null;
  name: string;
  countryId: string;
  ready: boolean;
  isAI: boolean;
  connected: boolean;
}

export interface RoomInfo {
  code: string;
  mode: RoomMode;
  hostUserId: string;
  status: 'lobby' | 'playing' | 'ended';
  players: RoomPlayerInfo[];
  maxPlayers: number;
  balanceMode: BalanceMode;
}

export interface MatchStartInfo {
  seed: number;
  yourSlot: Slot;
  players: RoomPlayerInfo[];
  /** Terreno codificado como string de dígitos (um por célula). */
  terrain: string;
  width: number;
  height: number;
  cellSize: number;
  resourceNodes: { cx: number; cy: number }[];
  spawns: { cx: number; cy: number }[];
  tickRate: number;
  /** Mensagem enviada a cada N ticks de simulação. */
  snapshotEvery: number;
  canControlSpeed: boolean;
  balanceMode: BalanceMode;
  scenarioStart: string;
  ticksPerDay: number;
}

export type EndReason = 'hq_destroyed' | 'forfeit' | 'disconnect' | 'draw';

export interface MatchEndInfo {
  winnerSlot: Slot | null;
  reason: EndReason;
  durationSeconds: number;
  players: (RoomPlayerInfo & { stats: PlayerStats; result: 'win' | 'loss' | 'draw'; national: NationalSummary | null })[];
  recorded: boolean;
}

export type ClientMessage =
  | { t: 'hello'; protocol: number; token: string | null; guestId?: string; guestName?: string }
  | { t: 'create_room'; mode: RoomMode; countryId: string }
  | { t: 'join_room'; code: string; countryId: string }
  | { t: 'leave_room' }
  | { t: 'set_country'; countryId: string }
  | { t: 'set_ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'cmd'; cmd: Command }
  | { t: 'national'; cmd: NationalCommand }
  | { t: 'set_balance'; mode: BalanceMode }
  | { t: 'pause'; paused: boolean }
  | { t: 'speed'; speed: GameSpeed }
  | { t: 'surrender' }
  | { t: 'chat'; text: string }
  | { t: 'ping'; n: number };

export type ServerMessage =
  | { t: 'welcome'; user: PublicUser; serverVersion: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'room'; room: RoomInfo | null }
  | { t: 'match_start'; match: MatchStartInfo }
  | { t: 'snapshot'; s: Snapshot; paused: boolean; speed: GameSpeed; pausedBy: string | null }
  | { t: 'match_end'; end: MatchEndInfo }
  /** `nations` traz só a nação do próprio jogador; as demais vêm filtradas em `diplomacy`. */
  | { t: 'national'; day: number; date: string; nations: NationView[]; events: NationalEvent[]; diplomacy: DiplomacyView }
  | { t: 'cmd_rejected'; reason: string }
  | { t: 'chat'; from: string; text: string; system?: boolean }
  | { t: 'pong'; n: number };

export const MAX_CHAT_LENGTH = 200;
