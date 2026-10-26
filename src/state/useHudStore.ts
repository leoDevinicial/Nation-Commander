import type { ModId } from '../../shared/sim/modernization.ts';
import { create } from 'zustand';
import type { BuildingType, DepositSize, ProducibleType, UnitType } from '../../shared/sim/config.ts';
import type { GameSpeed } from '../../shared/protocol.ts';
import type { PlayerSnapshot } from '../../shared/sim/snapshot.ts';
import type { BuildingStatus, EntityId, UnitActivity } from '../../shared/sim/types.ts';
import type { SpecId } from '../../shared/sim/upgrades.ts';

export interface SelectedUnitInfo {
  id: EntityId;
  type: UnitType;
  hp: number;
  /** Vida máxima desta unidade (pesquisas e especializações do edifício que a produziu). */
  maxHp: number;
  activity: UnitActivity;
  order: string;
  /** Pacotes de modernização instalados (Fase 5). */
  mods: ModId[];
  /** Modernização em andamento numa instalação. */
  refit: { mod: ModId; progress: number } | null;
}

export interface SelectedBuildingInfo {
  id: EntityId;
  type: BuildingType;
  owner: number;
  hp: number;
  maxHp: number;
  progress: number;
  /** Nível de melhoria e especialização (Fase 4). */
  level: number;
  spec: SpecId | null;
  /** Obra de melhoria em andamento. */
  upgrade: { toLevel: number; progress: number; spec: SpecId | null } | null;
  queue: { unitType: ProducibleType; progress: number }[];
  hasRally: boolean;
  claims: number;
  workers: number;
  workerTarget: number;
  status: BuildingStatus;
  rate: number;
  stored: number | null;
  deposit: { remaining: number; initial: number; size: DepositSize; maxSites: number } | null;
}

export interface HudEvent {
  id: number;
  /** performance.now() de quando entrou no painel. */
  at: number;
  tick: number;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
}

export type PointerMode =
  | { kind: 'normal' }
  | { kind: 'place'; buildingType: BuildingType; valid: boolean; reason: string | null; yield: { cells: number; rate: number } | null }
  | { kind: 'attack_move' };

/** Fila de produção de um edifício próprio (para o resumo de produção do HUD). */
export interface ProductionEntry {
  id: EntityId;
  type: BuildingType;
  queue: { unitType: ProducibleType; progress: number }[];
}

/** Ferramenta do toque: o que um toque curto faz no mapa. */
export type TouchTool = 'select' | 'order' | 'box';

export interface HudState {
  tick: number;
  players: PlayerSnapshot[];
  /** Edifícios próprios com algo na fila (unidades, recrutas, cidadãos). */
  production: ProductionEntry[];
  /** Miniaturas 3D (data URL) dos botões, por tipo de edifício/unidade, 'citizen' e 'recruit'. */
  thumbs: Partial<Record<string, string>>;
  mySlot: number;
  paused: boolean;
  pausedBy: string | null;
  speed: GameSpeed;
  selectedUnits: SelectedUnitInfo[];
  selectedBuilding: SelectedBuildingInfo | null;
  /** Seleção de entidade inimiga (só leitura). */
  inspected: { kind: 'unit' | 'building'; type: string; owner: number; hp: number; maxHp: number; level: number; spec: SpecId | null } | null;
  /** Painel de melhoria aberto para este edifício. */
  upgradeFor: EntityId | null;
  mode: PointerMode;
  events: HudEvent[];
  fps: number;
  /** Interface de toque ativa (aparelho de toque ou toque detectado nesta partida). */
  touchUi: boolean;
  touchTool: TouchTool;
  touchAdditive: boolean;
  set: (patch: Partial<Omit<HudState, 'set' | 'pushEvent' | 'expireEvents'>>) => void;
  pushEvent: (e: Omit<HudEvent, 'id' | 'at'>) => void;
  expireEvents: (maxAgeMs: number) => void;
}

let seq = 1;

export const useHudStore = create<HudState>((set) => ({
  tick: 0,
  players: [],
  production: [],
  thumbs: {},
  mySlot: 0,
  paused: false,
  pausedBy: null,
  speed: 1,
  selectedUnits: [],
  selectedBuilding: null,
  inspected: null,
  upgradeFor: null,
  mode: { kind: 'normal' },
  events: [],
  fps: 0,
  touchUi: false,
  touchTool: 'select',
  touchAdditive: false,
  set: (patch) => set(patch),
  pushEvent: (e) =>
    set((s) => {
      // agrupa repetições imediatas (ex.: vários alertas de ataque seguidos)
      const last = s.events.at(-1);
      if (last && last.text === e.text) return { events: [...s.events.slice(0, -1), { ...last, at: performance.now() }] };
      return { events: [...s.events.slice(-6), { ...e, id: seq++, at: performance.now() }] };
    }),
  expireEvents: (maxAgeMs) =>
    set((s) => {
      const now = performance.now();
      const kept = s.events.filter((e) => now - e.at < maxAgeMs);
      return kept.length === s.events.length ? s : { events: kept };
    }),
}));
