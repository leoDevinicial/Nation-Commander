import type { AirView, CaravanView, TradeView } from '../../shared/sim/snapshot.ts';
import type { ModId } from '../../shared/sim/modernization.ts';
import { create } from 'zustand';
import type { BuildingType, DepositSize, MilitaryResearchId, ProducibleType, UnitType } from '../../shared/sim/config.ts';
import type { GameSpeed } from '../../shared/protocol.ts';
import type { PlayerSnapshot } from '../../shared/sim/snapshot.ts';
import type { BuildingStatus, EntityId, UnitActivity } from '../../shared/sim/types.ts';
import type { SpecId } from '../../shared/sim/upgrades.ts';
import type { Capabilities } from '../game/perf/kaics.ts';
import type { MemorySample } from '../game/perf/memory.ts';
import type { PerfSummary } from '../game/perf/kgps.ts';

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
  /** Veterania: patente (0 = recruta) e abates. */
  rank: number;
  kills: number;
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
  /** Produção ligada por estrada ao QG ou a uma prefeitura (null: não se aplica). */
  roadLinked: boolean | null;
  stored: number | null;
  deposit: { remaining: number; initial: number; size: DepositSize; maxSites: number } | null;
  /** Pesquisa militar em andamento (Centro de Pesquisa). */
  research: { id: MilitaryResearchId; progress: number } | null;
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
  | { kind: 'attack_move' }
  /**
   * Escolha de alvo da força aérea (Fase 7): ponto do reconhecimento, edifício inimigo descoberto
   * do ataque, ou ponto do míssil — este último fica marcado e só segue com "Confirmar alvo".
   */
  | { kind: 'air_target'; purpose: 'recon' | 'strike' | 'missile'; sourceId: EntityId; aircraftIds: number[]; target: { x: number; y: number } | null; nuclear?: boolean }
  /** Engenheiros selecionados: o próximo clique no chão marca onde instalar a mina (lote 3). */
  | { kind: 'lay_mine' }
  /**
   * Traçado de estrada (lote 3): arrasto na grade (no toque, um toque marca o começo e outro o
   * fim). `cells` são as células novas a pavimentar; `reason`, o que impede o traçado.
   */
  /** Ferramenta de estrada: células que podem ser pavimentadas, inválidas, marcadas no total e o primeiro motivo de recusa. */
  | { kind: 'road'; cells: number; bad: number; marked: number; reason: string | null };

/** Fila de produção de um edifício próprio (para o resumo de produção do HUD). */
export interface ProductionEntry {
  id: EntityId;
  type: BuildingType;
  queue: { unitType: ProducibleType; progress: number }[];
}

/** Ferramenta do toque: o que um toque curto faz no mapa. */
export type TouchTool = 'select' | 'order' | 'box';

/** Resumo do KGPS mais dados do renderizador e do aparelho (KAICS). */
export type PerfHud = PerfSummary & {
  drawCalls: number;
  triangles: number;
  caps: Capabilities;
  /** Preset escolhido (para o rótulo "· adaptado"). */
  preset: string;
  /** Tempo de GPU medido neste aparelho (extensão de temporização ativa). */
  gpuTimer: boolean;
  /** Partida no Modo Sandbox (o teste de campo cria tropas). */
  sandbox: boolean;
  /** Teste de campo automático: fase atual e segundos restantes (null = nenhum). */
  fieldTest: {
    phase: 'parado' | 'combate' | 'concluído' | 'cancelado';
    remainingS: number;
    batterySaver: boolean | null;
    phases: { name: string; fpsMedian: number; p95Median: number; belowShare: number; running: boolean }[];
  } | null;
  /** Começa o teste de campo; devolve o motivo se não puder. */
  startFieldTest: (batterySaver: boolean | null, phaseMs?: number) => string | null;
  cancelFieldTest: () => void;
  /** Última amostra da vigia de memória (null = ainda não medida). */
  memory: MemorySample | null;
  /** Ganho medido de cada ajuste neste aparelho (R-ADP-04). */
  knobGains: { id: string; expectedPct: number | null }[];
  /** Pré-aquecimento de shaders (R-SHD-02). */
  prewarm: { enabled: boolean; materials: number; programs: number; ms: number | null };
  /** Travadas nos primeiros 60 s depois do carregamento (null = partida ainda carregando). */
  firstMinute: { hitches: number; stalls: number; done: boolean } | null;
  /** Relatório de desempenho em JSON, gerado sob demanda (botão "Copiar relatório"). */
  exportReport: () => string;
};

export interface HudState {
  tick: number;
  players: PlayerSnapshot[];
  /** Edifícios próprios com algo na fila (unidades, recrutas, cidadãos). */
  production: ProductionEntry[];
  /** Miniaturas 3D (data URL) dos botões, por tipo de edifício/unidade, 'citizen' e 'recruit'. */
  thumbs: Partial<Record<string, string>>;
  /** Comércio internacional do jogador (Fase 6). */
  trade: TradeView | null;
  /** Força aérea e mísseis do jogador (Fase 7). */
  air: AirView | null;
  /** Vitórias alternativas em curso (domínio territorial, colapso político). */
  victory: { kind: 'territory' | 'political'; slot: number; progress: number }[];
  /** Situação das caravanas internas do jogador (sem posição), por prefeitura. */
  caravans: Pick<CaravanView, 'cityId' | 'state' | 'to' | 'income' | 'waitSeconds'>[];
  /** Rota inspecionada no mapa (id do embarque). */
  inspectedShipment: number | null;
  mySlot: number;
  paused: boolean;
  pausedBy: string | null;
  speed: GameSpeed;
  /** Hora do dia e clima da partida (só visual), para o indicador da barra de cima. */
  sky: { hour: number; weather: 'clear' | 'rain' | 'storm' | 'snow'; climate: string } | null;
  selectedUnits: SelectedUnitInfo[];
  selectedBuilding: SelectedBuildingInfo | null;
  /** Tipos de construção próprios no mapa (Grandes Projetos: um por nação). */
  ownBuildingTypes: Set<BuildingType>;
  /** Quantos edifícios de cada tipo o jogador tem (custo crescente no menu de construção). */
  ownBuildingCounts: Partial<Record<BuildingType, number>>;
  /** Lançamento do Programa Espacial em andamento. */
  spaceLaunch: { id: number; phase: 'countdown' | 'ascent'; progress: number } | null;
  /** Seleção de entidade inimiga (só leitura). */
  inspected: { kind: 'unit' | 'building'; type: string; owner: number; hp: number; maxHp: number; level: number; spec: SpecId | null } | null;
  /** Cidadãos selecionados no mapa: ociosos e a caminho de um posto. */
  selectedCitizens: { idle: number; going: number } | null;
  /** Painel de melhoria aberto para este edifício. */
  upgradeFor: EntityId | null;
  mode: PointerMode;
  events: HudEvent[];
  fps: number;
  /** Painel de desempenho (KGPS/KAICS); null antes da primeira janela publicada. */
  perf: PerfHud | null;
  /** Opções do modo Sandbox (null nas partidas normais). */
  sandbox: { instant: boolean; aiActive: boolean; reveal: boolean } | null;
  /** Visão aproximada da câmera ligada. */
  closeUp: boolean;
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
  trade: null,
  air: null,
  victory: [],
  caravans: [],
  inspectedShipment: null,
  mySlot: 0,
  paused: false,
  pausedBy: null,
  speed: 1,
  sky: null,
  selectedUnits: [],
  selectedBuilding: null,
  ownBuildingTypes: new Set(),
  ownBuildingCounts: {},
  spaceLaunch: null,
  inspected: null,
  selectedCitizens: null,
  upgradeFor: null,
  mode: { kind: 'normal' },
  events: [],
  fps: 0,
  perf: null,
  sandbox: null,
  closeUp: false,
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
