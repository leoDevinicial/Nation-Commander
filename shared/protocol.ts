import type { Command } from './sim/commands.ts';
import type { BalanceMode, Budget, ForeignView, GeopoliticalView, HistoryPoint, NationalEvent, NationState } from './strategic/NationalSimulation.ts';
import type { TechId } from './strategic/technologies.ts';
import type { DiplomaticAction } from './strategic/Diplomacy.ts';
import type { PlayerStats, Slot } from './sim/types.ts';
import type { Snapshot } from './sim/snapshot.ts';
import type { OperationResult, OperationsView, SectorView } from './strategic/operations.ts';
import type { Difficulty } from './sim/difficulty.ts';

/** `sandbox`: modo livre contra uma IA (recursos ilimitados, tudo liberado, ferramentas de teste). */
export type RoomMode = 'pvp' | 'vs_ai' | 'sandbox';
export type { BalanceMode };

export type NationalCommand = { type: 'set_budget'; budget: Budget } | { type: 'set_research'; techId: TechId | null } | { type: 'diplomacy'; action: DiplomaticAction };

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
  /** Dificuldade da IA (contra a IA e no Sandbox). */
  difficulty?: Difficulty;
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
  /** Modo da sala (o cliente esconde a economia e mostra as ferramentas no Sandbox). */
  mode?: RoomMode;
  /** Dificuldade da IA (o cliente mostra o preparo certo). */
  difficulty?: Difficulty;
}

export interface BattleInfo {
  opId: number;
  target: number;
  targetCountryId: string;
  sector: SectorView;
  match: MatchStartInfo;
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
  /** `scope: 'battle'`: ordem às tropas na batalha local de uma operação (Fase 8). */
  | { t: 'cmd'; cmd: Command; scope?: 'battle' }
  | { t: 'national'; cmd: NationalCommand }
  | { t: 'set_balance'; mode: BalanceMode }
  | { t: 'set_difficulty'; difficulty: Difficulty }
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
  | { t: 'snapshot'; s: Snapshot; paused: boolean; speed: GameSpeed; pausedBy: string | null; scope?: 'battle'; opId?: number }
  /** Batalha local de uma operação começou: mapa e contexto da região (o jogador é o slot 0). */
  | { t: 'battle_start'; battle: BattleInfo }
  /** Batalha local encerrada: resultado já reconciliado com a campanha. */
  | { t: 'battle_end'; opId: number; result: OperationResult }
  /** Operações expedicionárias do jogador: setores dos países em guerra e operações. */
  | { t: 'operations'; ops: OperationsView }
  | { t: 'match_end'; end: MatchEndInfo }
  /** `nations` traz só a nação do próprio jogador; as demais vêm filtradas em `diplomacy`. */
  | { t: 'national'; day: number; date: string; nations: NationView[]; events: NationalEvent[]; diplomacy: DiplomacyView }
  | { t: 'cmd_rejected'; reason: string }
  | { t: 'chat'; from: string; text: string; system?: boolean }
  | { t: 'pong'; n: number };

export const MAX_CHAT_LENGTH = 200;
