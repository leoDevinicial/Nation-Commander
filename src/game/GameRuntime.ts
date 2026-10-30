import * as THREE from 'three';
import type { GameSpeed, MatchStartInfo, ServerMessage } from '../../shared/protocol.ts';
import type { Command, SandboxToggle } from '../../shared/sim/commands.ts';
import { BUILDINGS, CITIZEN, CITY, MILITARY_RESEARCH, MILITARY_RESEARCH_IDS, RECRUIT, RESOURCE_TYPES, ROAD, SERVICES, TICK_RATE, UNITS, emptyStockpile, type BuildingType, type MilitaryResearchId, type Terrain, type UnitType } from '../../shared/sim/config.ts';
import { MOD_IDS, MODS, checkModernize, pickRefitFacility, type FacilityInfo, type ModId, type ModernizeCheck } from '../../shared/sim/modernization.ts';
import { anchorForCursor, placementError } from '../../shared/sim/placement.ts';
import type { BuildingSnapshot, Snapshot, UnitSnapshot } from '../../shared/sim/snapshot.ts';
import type { Cell, MapData, SimEvent } from '../../shared/sim/types.ts';
import type { GameClient } from '../net/GameClient.ts';
import { useHudStore, type PointerMode } from '../state/useHudStore.ts';
import { BuildingVisual, PlacementGhost } from './render/BuildingVisuals.ts';
import { renderThumbnails } from './render/Thumbnails.ts';
import { CameraController } from './render/CameraController.ts';
import { Effects } from './render/Effects.ts';
import { disposeSharedResources } from './render/palette.ts';
import { RocketLayer } from './render/RocketLayer.ts';
import { TrackMarks } from './render/TrackMarks.ts';
import { Projectiles } from './render/Projectiles.ts';
import { BIOME_TINT, buildTerrain, type TerrainHandle } from './render/TerrainFactory.ts';
import { cloudUniforms, disposeMaterials, fogUniforms, setCloudShadows, weatherUniforms, windUniforms } from './render/materials.ts';
import { disposeBuildingModels } from './render/models/buildingModels.ts';
import { disposeCitizenModel, disposeUnitModels, unitModel, unitModelKey } from './render/models/unitModels.ts';
import { setModelDetail } from './render/models/kit.ts';
import { chooseClaims, claimedBy, gatherRate, sitesByDeposit } from '../../shared/sim/gathering.ts';
import { findDeposits, type DepositIndex } from '../../shared/sim/deposits.ts';
import { decodeTerritory } from '../../shared/sim/territory.ts';
import { buildingEffects, planUpgrade, type SpecId, type UpgradePlan, type UpgradeWorld } from '../../shared/sim/upgrades.ts';
import { combineEffects } from '../../shared/strategic/technologies.ts';
import { useNationalStore } from '../state/useNationalStore.ts';
import { Terrain as T } from '../../shared/sim/config.ts';
import { MineLayer } from './render/MineLayer.ts';
import { RoadPreview } from './render/RoadPreview.ts';
import { RoadLayer } from './render/RoadLayer.ts';
import { TerritoryLayer } from './render/TerritoryLayer.ts';
import { createSky, environmentFromSky, SKY } from './render/Sky.ts';
import { cloudShadowTexture, disposeTextures, grimeTexture, windowTexture } from './render/textures.ts';
import { UnitVisual } from './render/UnitVisuals.ts';
import { PostFx } from './render/PostFx.ts';
import { CitizenLayer } from './render/CitizenLayer.ts';
import { CargoLayer, disposeCargoModels } from './render/CargoLayer.ts';
import { AirLayer, disposeAirModels } from './render/AirLayer.ts';
import { AIRCRAFT, FLIGHT_SIGHT, NUCLEAR, missileSpec } from '../../shared/sim/air.ts';
import { ERAS, type Era } from '../../shared/sim/eras.ts';
import { SPACE_PAD } from './render/models/projects.ts';
import { PRODUCTION_SOUND, audio } from './audio/AudioService.ts';
import { useSettingsStore } from '../state/useSettingsStore.ts';
import { AdaptiveExposure, EnvironmentProbe, ShadowFollow } from './render/Lighting.ts';
import { describeEvent } from './eventText.ts';
import type { GraphicsProfile } from '../lib/graphics.ts';
import { GRAPHICS_REVISION, isTouchDevice, prefersReducedMotion } from '../lib/graphics.ts';
import { TouchGestures, type TouchPoint } from './input/TouchGestures.ts';
import { Kaics, probeCapabilities } from './perf/kaics.ts';
import { KGPS_CONFIG, Kgps, localGainStore, localProfileStore } from './perf/kgps.ts';
import { gainKey, profileKey, targetFor, type TargetPolicy } from './perf/device.ts';
import { MemoryWatch } from './perf/memory.ts';
import { buildReport } from './perf/report.ts';
import { GpuTimer } from './perf/gpuTimer.ts';
import { isPreset, localAdvisorStore, recordSession } from './perf/advisor.ts';
import type { ExplosionSmoke } from './render/Effects.ts';
import type { PerfHud, TouchTool } from '../state/useHudStore.ts';
import { effectiveFund, effectiveStability, effectiveTechs, effectiveEra } from '../state/sandbox.ts';

type SnapshotMsg = Extract<ServerMessage, { t: 'snapshot' }>;

/** Um pacote de modernização para a seleção atual (botão do painel de comando). */
export interface ModernizeOption {
  mod: ModId;
  /** Unidades selecionadas que ainda não têm o pacote. */
  applicable: number;
  /** As que podem começar agora (instalação, baia, saldo e verba conferidos em sequência). */
  readyIds: number[];
  /** Motivo quando nenhuma pode começar. */
  blocker: string | null;
  short: string | null;
  /** Custo por unidade (da primeira avaliada). */
  check: ModernizeCheck;
}

export interface RuntimeOptions {
  profile: GraphicsProfile;
  /** Já combinado com o preset: só é verdadeiro se o preset permitir sombras. */
  shadows: boolean;
  panSpeed: number;
  edgeScroll: boolean;
  /**
   * Cena da batalha local de uma operação (Fase 8): recebe só os snapshots dessa batalha e envia
   * as ordens com escopo de batalha. O teatro continua em outro runtime, suspenso.
   */
  battle?: { opId: number; biome?: keyof typeof BIOME_TINT };
  /** Qualidade adaptativa (KGPS) ligada; desligada, ele só mede e sugere. */
  adaptive?: boolean;
  /** Preset escolhido (chave do ajuste aprendido neste aparelho). */
  preset?: string;
}

interface TrackedUnit {
  visual: UnitVisual;
  prev: THREE.Vector2;
  curr: THREE.Vector2;
  prevFacing: number;
  currFacing: number;
  snap: UnitSnapshot;
}

interface TrackedBuilding {
  visual: BuildingVisual;
  snap: BuildingSnapshot;
}

const HUD_INTERVAL_MS = 150;
/** Ids das caravanas internas na camada de cargas (separados dos embarques do comércio). */
const CARAVAN_ID_BASE = 1_000_000;
/** Painel de desempenho: atualização mais lenta (as janelas do KGPS são de ~2 s). */
const PERF_HUD_INTERVAL_MS = 500;
/** Piso da resolução interna (pixels de desenho por pixel de tela). */
const MIN_PIXEL_RATIO = 0.7;
/** Ultra+: quanto as sombras de nuvens escurecem a luz direta do sol (0–1). */
const CLOUD_SHADOW_STRENGTH = 0.42;
/** Ultra+: velocidade das nuvens em coordenadas de textura por segundo (≈2,4 unidades/s). */
const CLOUD_DRIFT = 0.011;
const DRAG_THRESHOLD = 6;

/**
 * Coordena cena 3D, entrada e comunicação com o servidor. O estado autoritativo vem dos
 * snapshots do servidor; aqui ficam apenas interpolação, seleção e intenções do jogador.
 */
/** Edifícios em que a tecla V produz uma tropa (nos outros casos, V liga a visão aproximada). */
const PRODUCERS_WITH_V: readonly BuildingType[] = (Object.keys(UNITS) as UnitType[]).filter((u) => UNITS[u].hotkey === 'V').map((u) => UNITS[u].producedBy);

/** Tremor (visão aproximada) por disparo dos veículos pesados; no lança-foguetes, por foguete. */
const HEAVY_FIRE_SHAKE: Partial<Record<UnitType, number>> = { tank: 0.22, mbt: 0.26, artillery: 0.32, rocket_artillery: 0.07 };

export class GameRuntime {
  readonly map: MapData;
  readonly mySlot: number;
  private readonly renderer: THREE.WebGLRenderer;
  private postFx: PostFx | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private citizens!: CitizenLayer;
  private exposure: AdaptiveExposure | null = null;
  private probe: EnvironmentProbe | null = null;
  private shadowFollow: ShadowFollow | null = null;
  private skyEnv: THREE.Texture | null = null;
  /** KAICS/KGPS (ver `perf/`): botões gráficos que o desempenho pode ajustar durante a partida. */
  private kaics!: Kaics;
  private kgps!: Kgps;
  private perfGate: string | null = null;
  /** Modelos novos (Nature Kit) chegaram: os shaders compilam nos primeiros quadros — sem medir. */
  private compilingUntil = 0;
  /** Tempo de GPU por quadro (só onde o navegador oferece a extensão de temporização). */
  private gpuTimer: GpuTimer | null = null;
  /** Pré-aquecimento de shaders (R-SHD-02): números para o painel e o relatório. */
  private prewarmInfo: { enabled: boolean; materials: number; programs: number; ms: number | null } = { enabled: false, materials: 0, programs: 0, ms: null };
  /** Travadas e congelamentos nos primeiros 60 s depois do carregamento (R-SHD-02). */
  private firstMinute: { start: number; hitches: number; stalls: number; done: boolean } | null = null;
  /** K-07: sombras de nuvens nesta cena (o uniforme é compartilhado entre teatro e batalha). */
  private cloudsOn = true;
  /** K-08: tropas longe da câmera animadas a cada N quadros (1 = todas a todo quadro). */
  private farAnimEvery = 1;
  /** Densidade base da resolução interna (refeita quando a densidade da tela muda). */
  private resolutionBase = 1;
  /** Vigia de memória da cena (Onda 3): geometrias, texturas e programas subindo sem parar. */
  private readonly memoryWatch = new MemoryWatch();
  /**
   * Teste de campo automático (Sandbox): uma fase parado e outra com 20 tropas em combate,
   * medidas como fases do KGPS para o relatório.
   */
  private fieldTest: {
    phase: 'parado' | 'combate' | 'concluído' | 'cancelado';
    at: number;
    phaseAt: number;
    phaseMs: number;
    batterySaver: boolean | null;
    /** Tropas do combate: pedidas ao servidor e confirmadas pelo estado (com reenvio se a conexão falhar). */
    spawn: { at: number; tries: number; mineBase: number; enemyBase: number; mineOk: boolean; enemyOk: boolean; troops: number } | null;
  } | null = null;
  private lastPerf = 0;
  private frameNo = 0;
  /** Mapa de sombra: redesenhado uma vez por quadro (ou a cada N), não a cada passe de render. */
  private shadowInterval = 1;
  private shadowDirty = true;
  private postFxOn = true;
  private probeLive = true;
  private exposureLive = true;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  readonly cameraCtl: CameraController;
  private readonly effects: Effects;
  private readonly units = new Map<number, TrackedUnit>();
  /** Veículos de carga do comércio (Fase 6) e a rota inspecionada. */
  private readonly cargo = new CargoLayer();
  private focusedShipment: number | null = null;
  private readonly heardFlights = new Set<number>();
  /** Aeronaves, mísseis, faróis dos silos e alvos (Fase 7). */
  private readonly airLayer: AirLayer;
  private mineLayer!: MineLayer;
  private roadPreview!: RoadPreview;
  private roadLayer!: RoadLayer;
  private readonly rocketLayer: RocketLayer;
  private readonly trackMarks: TrackMarks;
  private readonly projectiles: Projectiles;
  /** Visão aproximada: entidade acompanhada pela câmera e o zoom de antes (para voltar). */
  private follow: number | null = null;
  /** Unidades destruídas ainda caindo (animação curta antes de sumir). */
  private readonly dying: UnitVisual[] = [];
  private zoomBeforeCloseUp = 48;
  private readonly buildings = new Map<number, TrackedBuilding>();
  private readonly selection = new Set<number>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private snapshot: Snapshot | null = null;
  private snapshotAt = 0;
  private snapshotInterval = 100;
  private paused = false;
  private pausedBy: string | null = null;
  private speed: GameSpeed = 1;
  private mode: PointerMode = { kind: 'normal' };
  private ghost: PlacementGhost | null = null;
  private ghostCell: Cell | null = null;
  private keys = new Set<string>();
  private pointer = { x: 0, y: 0, inside: false };
  private drag: { x: number; y: number; active: boolean; button: number } | null = null;
  /** Posição de tela usada para o fantasma de construção (cursor no mouse, último toque no touch). */
  private ghostAt = { x: 0, y: 0 };
  private readonly touch: TouchGestures;
  private touchTool: TouchTool = 'select';
  private touchAdditive = false;
  private selectionBox: HTMLDivElement;
  private raf = 0;
  private lastFrame = performance.now();
  private lastHud = 0;
  private frames = 0;
  private fpsTime = performance.now();
  private fps = 0;
  private disposed = false;
  /** Teatro oculto (globo aberto): a simulação e a interpolação seguem, só não se desenha. */
  private suspended = false;
  private readonly unsubscribe: () => void;
  private readonly cleanup: (() => void)[] = [];
  private readonly controlGroups = new Map<string, number[]>();
  private lastSelectionCount = 0;
  private readonly canControlSpeed: boolean;
  private terrain!: TerrainHandle;
  private sky!: THREE.Mesh;
  /** Névoa de guerra local: 0 inexplorado, 1 explorado, 2 visível (por célula). */
  private readonly fogState: Uint8Array;
  private readonly fogTexture: THREE.DataTexture;
  /** Dono de cada célula, como enviado pelo servidor (fronteiras são públicas). */
  territory: Int8Array;
  private territoryLayer!: TerritoryLayer;
  private readonly deposits: DepositIndex;

  constructor(
    private readonly container: HTMLElement,
    match: MatchStartInfo,
    private readonly client: GameClient,
    private readonly opts: RuntimeOptions,
    initial: SnapshotMsg | null,
  ) {
    this.map = {
      width: match.width,
      height: match.height,
      cellSize: match.cellSize,
      seed: match.seed,
      terrain: [...match.terrain].map((ch) => Number(ch) as Terrain),
      resourceNodes: match.resourceNodes,
      spawns: match.spawns,
      ...(match.mapKind ? { kind: match.mapKind } : {}),
    };
    this.mySlot = match.yourSlot;
    this.canControlSpeed = match.canControlSpeed;
    this.snapshotInterval = (1000 / match.tickRate) * match.snapshotEvery;

    this.renderer = new THREE.WebGLRenderer({ antialias: opts.profile.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.profile.pixelRatioCap));
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setModelDetail(opts.profile.cinematic ? 'cinematic' : opts.profile.ultra ? 'ultra' : 'standard');
    // Ultra+: sombras de nuvens que atravessam o mapa (nos materiais criados a partir daqui)
    setCloudShadows(opts.profile.cinematic);
    cloudUniforms.uCloudMap.value = opts.profile.cinematic ? cloudShadowTexture() : null;
    cloudUniforms.uCloudStrength.value = opts.profile.cinematic ? CLOUD_SHADOW_STRENGTH : 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      // perda provocada pelo próprio encerramento da cena (forceContextLoss): não é um problema
      if (this.disposed) return;
      e.preventDefault();
      this.kaics?.setCondition('contextLost', true);
      this.kgps?.event(performance.now(), 'ctx-lost', 'Contexto gráfico perdido (o navegador liberou a GPU): medições pausadas');
      useHudStore.getState().pushEvent({ tick: 0, text: 'Contexto gráfico perdido. Tentando restaurar…', tone: 'bad' });
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.kaics?.setCondition('contextLost', false);
      this.shadowDirty = true;
      this.kgps?.event(performance.now(), 'ctx-restored', 'Contexto gráfico restaurado: medições recomeçando');
      this.kgps?.invalidate(performance.now(), 'contexto gráfico restaurado');
    });
    // o KGPS mede chamadas de desenho do quadro inteiro (todos os passes), não só do último render
    this.renderer.info.autoReset = false;
    const timer = new GpuTimer(this.renderer.getContext());
    this.gpuTimer = timer.available ? timer : null;
    // com sombras, o mapa é redesenhado sob demanda (ver frame): os passes extras o reaproveitam
    if (opts.shadows) this.renderer.shadowMap.autoUpdate = false;

    const W = this.map.width * this.map.cellSize;
    const H = this.map.height * this.map.cellSize;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    this.cameraCtl = new CameraController(this.camera, W, H);
    this.cameraCtl.panSpeed = opts.panSpeed;
    const spawn = this.map.spawns[this.mySlot] ?? this.map.spawns[0]!;
    this.cameraCtl.lookAt((spawn.cx + 0.5) * this.map.cellSize + 6, (spawn.cy + 0.5) * this.map.cellSize + 6);
    // vira a câmera para o centro do mapa
    const toMid = Math.atan2(spawn.cx - this.map.width / 2, spawn.cy - this.map.height / 2);
    this.cameraCtl.yaw = toMid;

    this.fogState = new Uint8Array(this.map.width * this.map.height);
    this.territory = new Int8Array(this.map.width * this.map.height).fill(-1);
    this.deposits = findDeposits(this.map);
    this.fogTexture = new THREE.DataTexture(new Uint8Array(this.map.width * this.map.height), this.map.width, this.map.height, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogTexture.magFilter = THREE.LinearFilter;
    this.fogTexture.minFilter = THREE.LinearFilter;
    this.fogTexture.needsUpdate = true;
    fogUniforms.uFogMap.value = this.fogTexture;
    fogUniforms.uFogSize.value.set(W, H);
    this.setupScene(W, H);
    if (opts.profile.ao)
      this.postFx = new PostFx(
        this.renderer,
        this.scene,
        this.camera,
        opts.profile.ultra && this.sun ? { sun: this.sun, sunDir: SKY.sunDir, sunColor: SKY.sunColor, sunDepthSize: opts.profile.cinematic ? 2048 : 1024, cinematic: opts.profile.cinematic } : null,
      );
    if (opts.profile.adaptiveExposure) this.exposure = new AdaptiveExposure(this.renderer, this.renderer.toneMappingExposure);
    if (opts.profile.envProbe) this.probe = opts.profile.cinematic ? new EnvironmentProbe(this.renderer, this.scene, 128, 1500) : new EnvironmentProbe(this.renderer, this.scene);
    this.territoryLayer = new TerritoryLayer(this.map.width, this.map.height, this.map.cellSize, (x, z) => this.groundHeight(x, z));
    this.scene.add(this.territoryLayer.group);
    this.mineLayer = new MineLayer(this.mySlot, (x, z) => this.groundHeight(x, z));
    this.scene.add(this.mineLayer.group);
    this.roadPreview = new RoadPreview(this.map.cellSize, (x, z) => this.groundHeight(x, z));
    this.scene.add(this.roadPreview.mesh);
    this.roadLayer = new RoadLayer(this.map.cellSize, this.map.width, this.map.height, (x, z) => this.groundHeight(x, z));
    this.scene.add(this.roadLayer.mesh);
    this.citizens = new CitizenLayer(this.map, this.mySlot, (x, z) => this.groundHeight(x, z));
    this.scene.add(this.citizens.group);
    this.scene.add(this.cargo.group);
    this.effects = new Effects(this.scene, opts.profile.maxEffects, opts.profile.dynamicLights, opts.profile.cinematic ? 'cinematic' : opts.profile.ultra ? 'volumetric' : 'basic');
    this.airLayer = new AirLayer(this.effects, this.mySlot, (id) => this.positionOf(id), opts.profile.maxEffects > 60 ? 140 : 60);
    this.scene.add(this.airLayer.group);
    this.rocketLayer = new RocketLayer(this.effects, (at, k) => this.shakeNear(at, k), (x, z) => audio.playAt('explosion', x, z), 72, opts.profile.maxEffects > 60 ? 220 : 110);
    this.scene.add(this.rocketLayer.group);
    // rastros de esteira: menos marcas guardadas nos presets leves
    this.trackMarks = new TrackMarks(opts.profile.maxEffects > 60 ? 3000 : 1200);
    this.scene.add(this.trackMarks.mesh);
    this.projectiles = new Projectiles(this.effects, opts.profile.maxEffects > 60 ? 80 : 40, opts.profile.maxEffects > 60 ? 140 : 60);
    this.scene.add(this.projectiles.group);

    this.selectionBox = document.createElement('div');
    this.selectionBox.className = 'selection-box';
    this.selectionBox.style.display = 'none';
    document.body.appendChild(this.selectionBox);

    this.touch = new TouchGestures(
      {
        tap: (x, y, double) => this.onTouchTap(x, y, double),
        longPress: (x, y) => this.onTouchLongPress(x, y),
        pan: (dx, dy) => {
          // arrastar o mapa solta o acompanhamento da visão aproximada
          this.cameraCtl.pan(-dx * 0.08, dy * 0.08);
          this.follow = null;
        },
        pinch: (scale, rot, dx, dy) => {
          if (scale !== 1) this.cameraCtl.zoom(1 / scale);
          if (rot) this.cameraCtl.rotate(rot);
          // a pinça desloca um pouco o centro: só solta o acompanhamento se for um arrasto de verdade
          if ((dx || dy) && Math.hypot(dx, dy) > 3) {
            this.cameraCtl.pan(-dx * 0.08, dy * 0.08);
            this.follow = null;
          } else if ((dx || dy) && !this.follow) this.cameraCtl.pan(-dx * 0.08, dy * 0.08);
        },
        box: (x0, y0, x1, y1, done) => this.onTouchBox(x0, y0, x1, y1, done),
        cancel: () => (this.selectionBox.style.display = 'none'),
      },
      () => this.touchTool === 'box',
    );
    this.battleOp = opts.battle?.opId ?? null;
    // batalha: a câmera entra do alto e desce até a base avançada (curto; nada com movimento reduzido)
    if (this.battleOp !== null && !useSettingsStore.getState().reducedMotion && !prefersReducedMotion()) {
      this.intro = { from: this.cameraCtl.distance * 2.4, to: this.cameraCtl.distance, t: 0 };
      this.cameraCtl.distance = this.intro.from;
    }
    this.bindInput();
    // o áudio (desbloqueio, ambiente e música) pertence ao teatro; a batalha só toca efeitos
    if (this.battleOp === null) this.bindAudio();
    this.resize();
    this.setupPerf();
    useHudStore.setState({
      mySlot: this.mySlot,
      events: [],
      selectedUnits: [],
      selectedBuilding: null,
      inspected: null,
      selectedCitizens: null,
      mode: { kind: 'normal' },
      touchUi: isTouchDevice(),
      touchTool: 'select',
      touchAdditive: false,
    });

    this.unsubscribe = client.on((msg) => {
      if (msg.t === 'snapshot') {
        if (this.battleOp === null ? !msg.scope : msg.scope === 'battle' && msg.opId === this.battleOp) this.onSnapshot(msg);
      } else if (msg.t === 'cmd_rejected' && this.hudActive) {
        useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text: msg.reason, tone: 'warn' });
        audio.ui('error');
      }
    });
    if (initial) this.onSnapshot(initial);
    this.prewarm();
    this.raf = requestAnimationFrame(this.frame);
    // miniaturas 3D dos botões: logo depois do primeiro quadro, para não atrasar a entrada
    window.setTimeout(() => {
      if (this.disposed || this.battleOp !== null) return;
      try {
        useHudStore.getState().set({ thumbs: renderThumbnails(this.renderer, this.mySlot) });
      } catch (err) {
        console.warn('Miniaturas indisponíveis', err);
      }
    }, 50);
  }

  // ------------------------------------------------------------ cena

  private setupScene(W: number, H: number): void {
    // céu com nuvens, neblina de distância no tom do horizonte e reflexos vindos do céu
    this.sky = createSky(480);
    this.scene.add(this.sky);
    this.scene.background = SKY.haze;
    this.scene.fog = new THREE.Fog(SKY.haze, 150, 470);
    this.skyEnv = environmentFromSky(this.renderer);
    this.scene.environment = this.skyEnv;
    weatherUniforms.uGrime.value = grimeTexture(this.opts.profile.terrain === 'high' ? 512 : 256);
    weatherUniforms.uPanes.value = windowTexture();
    this.scene.add(new THREE.HemisphereLight('#c9dcec', '#5b5340', 0.85));
    const sun = new THREE.DirectionalLight(SKY.sunColor, 2.6);
    this.sun = sun;
    sun.position.set(W / 2 + SKY.sunDir.x * 120, SKY.sunDir.y * 120, H / 2 + SKY.sunDir.z * 120);
    sun.target.position.set(W / 2, 0, H / 2);
    sun.castShadow = this.opts.shadows;
    // Ultra+ pede 8192; limitado ao máximo que a placa suporta
    const shadowSize = Math.min(this.opts.profile.shadowMapSize, this.renderer.capabilities.maxTextureSize);
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = sun.shadow.camera;
    sc.left = -W * 0.75;
    sc.right = W * 0.75;
    sc.top = H * 0.75;
    sc.bottom = -H * 0.75;
    sc.near = 10;
    sc.far = 260;
    // volume de sombra acompanha a câmera (mais nitidez onde o jogador olha)
    if (this.opts.shadows) this.shadowFollow = new ShadowFollow(sun, SKY.sunDir, Math.max(W, H) * 0.75);
    sun.shadow.bias = -0.0006;
    // Ultra: penumbra mais suave (filtro PCF mais largo)
    if (this.opts.profile.ultra) sun.shadow.radius = 2.5;
    // Ultra+: mapa mais denso permite penumbra mais larga sem perder o contato com o chão
    if (this.opts.profile.cinematic) {
      sun.shadow.radius = 4;
      sun.shadow.normalBias = 0.02;
    }
    this.scene.add(sun, sun.target);
    // mapa do tipo Deserto: tons áridos no teatro (as batalhas locais usam o bioma da região)
    const tint = this.opts.battle?.biome ? BIOME_TINT[this.opts.battle.biome] : this.map.kind === 'desert' ? BIOME_TINT.arid : undefined;
    this.terrain = buildTerrain(this.map, this.opts.profile.terrain, this.opts.profile.reflections, this.opts.profile.ultra, this.opts.profile.cinematic, tint);
    this.scene.add(this.terrain.group);
    this.sharpenTextures(this.terrain.group);
    // modelos do Nature Kit chegam depois; até lá, vegetação procedural
    this.terrain
      .upgrade()
      .then(() => {
        this.sharpenTextures(this.terrain.group);
        this.compilingUntil = performance.now() + 1500;
      })
      .catch((err: unknown) => console.warn('Nature Kit indisponível', err));
  }

  // ------------------------------------------------------------ snapshots

  /** Altura aproximada do terreno (mesma regra do TerrainFactory, sem o ruído). */
  private groundHeight(x: number, z: number): number {
    const cs = this.map.cellSize;
    const at = (px: number, pz: number) => {
      const cx = Math.min(this.map.width - 1, Math.max(0, Math.floor(px / cs)));
      const cy = Math.min(this.map.height - 1, Math.max(0, Math.floor(pz / cs)));
      const t = this.map.terrain[cy * this.map.width + cx];
      return t === T.Water ? -0.7 : t === T.Rock || t === T.Ore ? 0.9 : t === T.Mud ? -0.08 : 0;
    };
    const o = cs * 0.45;
    return (at(x - o, z - o) + at(x + o, z - o) + at(x - o, z + o) + at(x + o, z + o)) / 4;
  }

  private onSnapshot(msg: SnapshotMsg): void {
    const s = msg.s;
    if ((s.trade || s.caravans) && this.hudActive) {
      if (s.trade) useHudStore.getState().set({ trade: s.trade });
      // caravanas internas usam o mesmo caminhão dos comboios rodoviários
      const caravans = (s.caravans ?? [])
        .filter((c) => c.state !== 'destroyed')
        .map((c) => ({ id: CARAVAN_ID_BASE + c.id, mode: 'caravan' as const, state: c.state === 'moving' ? ('moving' as const) : ('loading' as const), x: c.x, y: c.y, heading: c.heading, seller: c.owner, buyer: c.owner }));
      this.cargo.update([...(s.trade?.shipments ?? []), ...caravans], this.cameraCtl.target);
      const mine = (s.caravans ?? []).filter((c) => c.owner === this.mySlot).map((c) => ({ cityId: c.cityId, state: c.state, to: c.to, income: c.income, waitSeconds: c.waitSeconds }));
      if (JSON.stringify(mine) !== JSON.stringify(useHudStore.getState().caravans)) useHudStore.getState().set({ caravans: mine });
    }
    if (s.air) {
      if (this.hudActive) useHudStore.getState().set({ air: s.air });
      this.airLayer.update(s.air);
      // passagem de jato quando uma formação entra no mapa (própria ou inimiga à vista)
      for (const f of s.air.flights)
        if (!this.heardFlights.has(f.id)) {
          this.heardFlights.add(f.id);
          audio.playAt('jet', f.x, f.y);
        }
    }
    this.snapshot = s;
    this.mineLayer.update(s.mines ?? []);
    if (this.hudActive) {
      const v = s.victory ?? [];
      const cur = useHudStore.getState().victory;
      if (JSON.stringify(v) !== JSON.stringify(cur)) useHudStore.getState().set({ victory: v });
    }
    if (s.territory) {
      this.territory = decodeTerritory(s.territory);
      this.bordersDirty = true;
      this.applyRoads(s.roads ?? []);
    }
    this.snapshotAt = performance.now();
    this.paused = msg.paused;
    this.pausedBy = msg.pausedBy;
    this.speed = msg.speed;

    const seen = new Set<number>();
    for (const u of s.units) {
      seen.add(u.id);
      let t = this.units.get(u.id);
      if (!t) {
        const visual = new UnitVisual(u.id, u.type, u.owner, u.owner === this.mySlot, u.era ?? 1);
        visual.treadMarks = this.trackMarks;
        const p = new THREE.Vector2(u.x, u.y);
        t = { visual, prev: p.clone(), curr: p.clone(), prevFacing: u.facing, currFacing: u.facing, snap: u };
        visual.renderPos.copy(p);
        visual.facing = u.facing;
        this.scene.add(visual.group);
        this.units.set(u.id, t);
      } else {
        // interpola entre snapshots consecutivos (não a partir da posição renderizada),
        // para que FPS baixo não acumule atraso visual
        t.prev.copy(t.curr);
        t.prevFacing = t.currFacing;
        t.curr.set(u.x, u.y);
        t.currFacing = u.facing;
        t.snap = u;
        // modernizada numa era que troca o veículo (ex.: Lança-Foguetes do Futuro Próximo): refaz o modelo
        if (unitModelKey(u.type, u.era ?? 1) !== t.visual.modelKey) {
          const old = t.visual;
          const visual = new UnitVisual(u.id, u.type, u.owner, u.owner === this.mySlot, u.era ?? 1);
          visual.treadMarks = this.trackMarks;
          visual.renderPos.copy(old.renderPos);
          visual.facing = old.facing;
          old.dispose();
          this.scene.add(visual.group);
          t.visual = visual;
        }
      }
      t.visual.setEquipment(u.mods ?? [], !!u.refit);
    }
    // unidades destruídas neste snapshot caem/tombam antes de sumir; as que só saíram da visão somem
    const killed = new Set<number>();
    for (const e of s.events) if (e.type === 'destroyed' && e.entity === 'unit') killed.add(e.id);
    for (const [id, t] of this.units) {
      if (!seen.has(id)) {
        if (killed.has(id)) {
          t.visual.beginDeath();
          this.dying.push(t.visual);
        } else t.visual.dispose();
        this.units.delete(id);
        this.selection.delete(id);
      }
    }

    const seenB = new Set<number>();
    for (const b of s.buildings) {
      seenB.add(b.id);
      let t = this.buildings.get(b.id);
      // cidade capturada: o edifício muda de dono (cores e anel de seleção são refeitos)
      if (t && t.snap.owner !== b.owner) {
        t.visual.dispose();
        this.buildings.delete(b.id);
        this.selection.delete(b.id);
        t = undefined;
      }
      if (!t) {
        const size = BUILDINGS[b.type].size;
        const center = new THREE.Vector2((b.cx + size / 2) * this.map.cellSize, (b.cy + size / 2) * this.map.cellSize);
        const visual = new BuildingVisual(b.id, b.type, b.owner, b.owner === this.mySlot, {
          center,
          cellSize: this.map.cellSize,
          mapWidth: this.map.width,
          claims: b.claims,
          effects: this.opts.profile.maxEffects > 60,
          ultra: this.opts.profile.ultra,
          cinematic: this.opts.profile.cinematic,
          level: b.level,
          spec: b.spec,
          era: s.players.find((p) => p.slot === b.owner)?.era ?? 1,
          // celular: os detalhes pequenos das melhorias somem mais cedo ao afastar a câmera
          lodDistance: this.opts.profile.terrain === 'low' ? 50 : 80,
          ...(b.type === 'port' ? { facing: this.waterFacing(b.cx, b.cy, size) } : {}),
        });
        this.scene.add(visual.group, visual.rallyObject);
        t = { visual, snap: b };
        this.buildings.set(b.id, t);
      } else t.snap = b;
      t.visual.remembered = b.remembered === true;
      t.visual.setCity(b.city);
      // o modelo acompanha o nível e a especialização registrados na simulação
      t.visual.setVariant(b.level, b.spec);
      // e a era da nação dona (pública: aparece nas construções)
      t.visual.setEra(s.players.find((p) => p.slot === b.owner)?.era ?? 1);
      if (b.type === 'space_center') t.visual.setLaunch(b.launch, !!s.players.find((p) => p.slot === b.owner)?.satellite);
    }
    const me = s.players.find((p) => p.slot === this.mySlot);
    this.citizens.sync(
      s.buildings,
      s.buildings.filter((b) => b.owner === this.mySlot && !b.remembered),
      me?.population?.idle ?? 0,
      me?.population?.recruits ?? 0,
    );
    for (const [id, t] of this.buildings) {
      if (!seenB.has(id)) {
        t.visual.dispose();
        this.buildings.delete(id);
        this.selection.delete(id);
      }
    }
    this.clearDecorUnderBuildings();
    this.updateSiloHatches(s);

    this.updateFog();
    for (const e of s.events) this.handleEvent(e);
    if (this.mode.kind === 'place') this.updateGhost();
  }

  /**
   * Tampas dos silos de mísseis: abertas na preparação, armado, contagem final e no começo do voo
   * (o míssil acabou de sair); fechadas no resto do tempo.
   */
  private updateSiloHatches(s: Snapshot): void {
    const open = new Set<number>();
    for (const l of s.air?.launches ?? [])
      if (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching' || (l.state === 'flight' && l.progress < 0.3)) open.add(l.siloId);
    for (const t of this.buildings.values()) if (t.snap.type === 'missile_silo') t.visual.setHatch(open.has(t.snap.id));
  }

  /** Chave do conjunto de construções já aplicado à vegetação (só recalcula quando muda). */
  private decorKey = '';
  /** Estradas construídas pelos jogadores já pintadas no solo. */
  private readonly roadCells = new Set<number>();

  /** Estradas novas (vêm junto com o território): terreno local, solo e vegetação por cima. */
  private applyRoads(cells: readonly number[]): void {
    const fresh = cells.filter((i) => !this.roadCells.has(i));
    if (!fresh.length) return;
    for (const i of fresh) {
      this.roadCells.add(i);
      this.map.terrain[i] = T.Road;
    }
    this.terrain.repaint(fresh);
    // peças de asfalto por cima, encaixadas pelas vizinhas
    this.roadLayer.set(this.roadCells, (i) => this.map.terrain[i] === T.Road);
    this.decorKey = '';
  }

  /** Árvores, arbustos e pedras decorativos somem sob as construções (e voltam quando elas caem). */
  private clearDecorUnderBuildings(): void {
    const key = `${[...this.buildings.keys()].join(',')}|${this.roadCells.size}`;
    if (key === this.decorKey) return;
    this.decorKey = key;
    const cs = this.map.cellSize;
    const rects = [...this.buildings.values()].map(({ snap: b }) => {
      const size = BUILDINGS[b.type].size;
      return { x0: b.cx * cs, z0: b.cy * cs, x1: (b.cx + size) * cs, z1: (b.cy + size) * cs };
    });
    for (const i of this.roadCells) {
      const cx = i % this.map.width;
      const cy = Math.floor(i / this.map.width);
      rects.push({ x0: cx * cs, z0: cy * cs, x1: (cx + 1) * cs, z1: (cy + 1) * cs });
    }
    if (this.terrain.clearUnder(rects)) this.shadowDirty = true;
  }

  private handleEvent(e: SimEvent): void {
    if (e.type === 'shot' && e.salvo) {
      // salva do lança-foguetes: os foguetes saem dos tubos do casulo, um a um
      const attacker = this.units.get(e.attackerId);
      const from = new THREE.Vector3(e.from.x, 1.4, e.from.y);
      this.rocketLayer.salvo({
        attackerId: e.attackerId,
        count: e.salvo,
        flight: (e.flightTicks ?? TICK_RATE) / TICK_RATE,
        target: e.to,
        spread: UNITS.rocket_artillery.weapon.splash ?? 3,
        tube: (i, pos, dir) => {
          const v = this.units.get(e.attackerId)?.visual;
          if (v) v.tubeWorld(i, pos, dir);
          else {
            pos.copy(from);
            dir.set(e.to.x - e.from.x, 0, e.to.y - e.from.y).normalize().setY(0.8).normalize();
          }
        },
        onLaunch: (i) => {
          this.units.get(e.attackerId)?.visual.rocketKick(i);
          this.closeUpRecoilShake(e.from, 'rocket_artillery');
          audio.playAt('rocket', e.from.x, e.from.y);
        },
      });
      attacker?.visual.onFire();
    } else if (e.type === 'salvo_intercepted') {
      // antiaérea do Futuro Próximo: mísseis pequenos saem dos casulos e derrubam foguetes da salva no ar
      const aa = this.units.get(e.aaId)?.visual;
      this.rocketLayer.intercept({
        attackerId: e.attackerId,
        count: e.rockets,
        from: (i, pos, dir) => {
          if (aa) aa.launcherWorld(i, pos, dir);
          else {
            pos.set(e.from.x, 1.6, e.from.y);
            dir.set(0, 1, 0);
          }
        },
        onLaunch: (i) => {
          if (i % 3 === 0) audio.playAt('rocket', e.from.x, e.from.y);
        },
      });
      aa?.onFire();
    } else if (e.type === 'salvo_impact') {
      // os foguetes visíveis explodem por conta própria; sem eles (névoa), a área explode aqui
      if (!this.rocketLayer.pending(e.attackerId))
        for (let i = 0; i < Math.min(6, e.rockets); i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * e.radius * 0.85;
          this.effects.explosion(new THREE.Vector3(e.pos.x + Math.cos(a) * r, 0, e.pos.y + Math.sin(a) * r), i === 0);
        }
      this.effects.scorch(e.pos, e.radius * 0.8, 25);
      this.shakeNear(e.pos, 0.18);
    } else if (e.type === 'shot' && this.units.get(e.attackerId) && unitModel(this.units.get(e.attackerId)!.visual.type).shot) {
      // veículos com canhão: o projétil sai da boca do cano (o cano recua) e voa até o alvo
      const attacker = this.units.get(e.attackerId)!;
      const kind = unitModel(attacker.visual.type).shot!;
      const target = this.units.get(e.targetId);
      const tp = target ? target.visual.renderPos : new THREE.Vector2(e.to.x, e.to.y);
      const ty = target ? (UNITS[target.visual.type].armor === 'vehicle' ? 0.6 : 0.7) : 1.2;
      attacker.visual.onFire();
      this.closeUpRecoilShake(attacker.visual.renderPos, attacker.visual.type);
      this.projectiles.fire(kind, { x: tp.x, y: ty, z: tp.y }, (pos, dir) => attacker.visual.fireGun(pos, dir));
    } else if (e.type === 'shot') {
      const attacker = this.units.get(e.attackerId);
      const heavy = attacker ? attacker.visual.type === 'tank' : true;
      attacker?.visual.onFire();
      const target = this.units.get(e.targetId);
      const tp = target ? target.visual.renderPos : new THREE.Vector2(e.to.x, e.to.y);
      const from = attacker ? attacker.visual.muzzleWorld() : new THREE.Vector3(e.from.x, 2, e.from.y);
      this.effects.tracer(from, new THREE.Vector3(tp.x, target ? 0.7 : 1.4, tp.y), heavy);
    } else if (e.type === 'destroyed') {
      const heavy = e.entity === 'building' || e.entityType === 'tank' || e.entityType === 'mbt';
      this.effects.explosion(new THREE.Vector3(e.pos.x, 0, e.pos.y), heavy);
      // veículo destruído: os destroços queimam e soltam uma coluna de fumaça escura
      if (e.entity === 'unit' && (UNITS as Record<string, { armor: string }>)[e.entityType]?.armor === 'vehicle')
        this.effects.plume(new THREE.Vector3(e.pos.x, 0.4, e.pos.y), { count: 7, size: 1.3, rise: 5, life: 6.5, spread: 0.6, tone: 0.25, delay: 0.15 });
    } else if (e.type === 'air_strike') {
      if (e.bombers) {
        // bombardeio em tapete: as fileiras de bombas caem e explodem em sequência pelo rumo da passagem
        this.airLayer.dropBombs(e.pos, e.dir ?? 0, e.bombers, (at, i) => {
          this.effects.explosion(at, i % 3 === 0);
          if (i % 4 === 0) this.effects.plume(at.clone().setY(0.3), { count: 3, size: 1.1, rise: 3.5, life: 4, spread: 0.5, tone: 0.3 });
          if (i % 2 === 0) audio.playAt('bomb', at.x, at.z);
          if (i % 5 === 0) this.shakeNear({ x: at.x, y: at.z }, 0.3);
        });
      } else
        // bombas guiadas: impactos em sequência sobre o alvo
        for (let i = 0; i < 3; i++) this.effects.explosion(new THREE.Vector3(e.pos.x + (Math.random() - 0.5) * 1.6, 0, e.pos.y + (Math.random() - 0.5) * 1.6), i === 0 && (e.destroyed || e.oilLost > 0));
    } else if (e.type === 'dogfight') {
      this.airLayer.dogfightShot(e);
    } else if (e.type === 'caravan_lost') {
      this.effects.explosion(new THREE.Vector3(e.pos.x, 0, e.pos.y), false);
    } else if (e.type === 'city_captured') {
      // a cidade troca de bandeira: clarão e onda na cor do novo dono
      this.effects.flash(new THREE.Vector3(e.pos.x, 2, e.pos.y), 2.2, '#fff1c4', 0.5);
      this.airLayer.shockwave(e.pos, CITY.radiusCells * this.map.cellSize);
    } else if (e.type === 'aircraft_lost') {
      // abatida em voo: explosão no ar (no combate aéreo, onde estava o avião; o destroço cai)
      const at = e.air ? this.airLayer.planeDown(e.pos, e.owner) : new THREE.Vector3(e.pos.x, 6.5, e.pos.y);
      this.effects.explosion(at, false);
      this.effects.flash(at, 1.1, '#ffd38a', 0.4);
    } else if (e.type === 'mine' && e.state === 'blast') {
      // mina antitanque: explosão no chão, cratera e coluna de terra
      const at = new THREE.Vector3(e.pos.x, 0, e.pos.y);
      this.effects.explosion(at, true);
      this.effects.scorch(e.pos, 1.6, 30);
      this.effects.plume(at.clone().setY(0.3), { count: 4, size: 1.1, rise: 3, life: 3.5, spread: 0.5, tone: 0.45 });
      this.shakeNear(e.pos, 0.35);
    } else if (e.type === 'space' && e.state === 'ascent') {
      // ignição do lançador: clarão, nuvem de fumaça rolando da plataforma e tremor longo
      const pad = new THREE.Vector3(e.pos.x + SPACE_PAD[0], 0.4, e.pos.y + SPACE_PAD[2]);
      this.effects.heavyIgnition(pad);
      this.effects.flash(new THREE.Vector3(pad.x, 2, pad.z), 6, '#ffd9a0', 0.8);
      this.airLayer.shockwave({ x: pad.x, y: pad.z }, 8);
      this.shakeNear({ x: pad.x, y: pad.z }, 0.9);
    } else if (e.type === 'missile') {
      const heavy = (e.gen ?? 1) >= 2 || !!e.nuclear;
      const radius = e.nuclear ? NUCLEAR.radius : missileSpec(e.gen ?? 1).radius;
      if (e.state === 'flight') {
        // ignição: clarão, luz forte e nuvem de fumaça rolando a partir do silo
        if (heavy) this.effects.heavyIgnition(new THREE.Vector3(e.from.x, 0.4, e.from.y));
        else this.effects.ignition(new THREE.Vector3(e.from.x, 0.4, e.from.y));
        this.airLayer.shockwave(e.from, heavy ? 6 : 3);
        this.shakeNear(e.from, heavy ? 0.7 : 0.35);
      } else if (e.state === 'impact' && e.nuclear) {
        // detonação nuclear: clarão branco enorme, bola de fogo, várias ondas de choque e tremor forte
        const at = new THREE.Vector3(e.target.x, 0, e.target.y);
        this.effects.flash(new THREE.Vector3(e.target.x, 8, e.target.y), radius * 2.6, '#fff6de', 1.6);
        this.effects.heavyMissileImpact(at, radius * 0.6);
        this.effects.heavyMissileImpact(at, radius);
        for (const k of [1, 1.8, 2.8, 4]) this.airLayer.shockwave(e.target, radius * k);
        this.shakeNear(e.target, 2.2);
      } else if (e.state === 'impact') {
        if (heavy) this.effects.heavyMissileImpact(new THREE.Vector3(e.target.x, 0, e.target.y), radius);
        else this.effects.missileImpact(new THREE.Vector3(e.target.x, 0, e.target.y), radius);
        // duas ondas: o clarão rápido e a poeira mais lenta e larga (três no pesado)
        this.airLayer.shockwave(e.target, radius);
        this.airLayer.shockwave(e.target, radius * 2.2);
        if (heavy) this.airLayer.shockwave(e.target, radius * 3.4);
        this.shakeNear(e.target, heavy ? 1.3 : 0.95);
      } else if (e.state === 'intercepted') {
        // interceptação: estouro alto no céu, sem dano no chão
        this.effects.airburst(new THREE.Vector3(e.target.x, 10, e.target.y));
        this.shakeNear(e.target, 0.2);
      }
    }
    this.eventSound(e);
    const text = describeEvent(e, this.mySlot);
    if (text) useHudStore.getState().pushEvent({ tick: e.tick, text: text.text, tone: text.tone });
  }

  /** Tremor de câmera proporcional à proximidade do que o jogador está olhando (sem movimento reduzido). */
  private shakeNear(at: { x: number; y: number }, amount: number): void {
    if (this.suspended || useSettingsStore.getState().reducedMotion || prefersReducedMotion()) return;
    const d = Math.hypot(at.x - this.cameraCtl.target.x, at.y - this.cameraCtl.target.z);
    const near = 1 - Math.min(1, d / (this.cameraCtl.distance * 1.6));
    if (near > 0) this.cameraCtl.shake(amount * near);
  }

  /**
   * Tremor do disparo dos veículos pesados, só na visão aproximada: bem fraco, some com a
   * distância do veículo à câmera e não soma além de um teto (rajadas não viram terremoto).
   */
  private closeUpRecoilShake(at: { x: number; y: number }, type: UnitType): void {
    if (!this.cameraCtl.closeUp) return;
    const amount = HEAVY_FIRE_SHAKE[type];
    if (!amount) return;
    if (this.suspended || useSettingsStore.getState().reducedMotion || prefersReducedMotion()) return;
    const d = Math.hypot(at.x - this.cameraCtl.target.x, at.y - this.cameraCtl.target.z);
    const near = 1 - Math.min(1, d / 14);
    if (near > 0) this.cameraCtl.shake(amount * near, 0.5);
  }

  /**
   * Névoa de guerra do cliente, calculada a partir das próprias entidades (o servidor já filtra o
   * que é enviado; aqui é só a representação visual: inexplorado, explorado e visível).
   */
  private updateFog(): void {
    const w = this.map.width;
    const h = this.map.height;
    const cs = this.map.cellSize;
    const visible = new Uint8Array(w * h);
    const mark = (px: number, py: number, sight: number) => {
      const cx = px / cs;
      const cy = py / cs;
      const r = sight / cs;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) visible[y * w + x] = 1;
        }
    };
    for (const t of this.units.values()) if (t.snap.owner === this.mySlot) mark(t.snap.x, t.snap.y, UNITS[t.snap.type].sight);
    for (const r of this.snapshot?.air?.reveals ?? []) mark(r.x, r.y, r.r);
    // aviões próprios em voo revelam a área por onde passam (na posição interpolada do desenho)
    for (const f of this.snapshot?.air?.flights ?? []) {
      if (f.owner !== this.mySlot) continue;
      const p = this.airLayer.flightPosition(f.id) ?? { x: f.x, y: f.y };
      mark(p.x, p.y, FLIGHT_SIGHT[f.plane]);
    }
    for (const t of this.buildings.values()) {
      if (t.snap.owner !== this.mySlot) continue;
      const size = BUILDINGS[t.snap.type].size;
      mark((t.snap.cx + size / 2) * cs, (t.snap.cy + size / 2) * cs, BUILDINGS[t.snap.type].sight);
    }
    // Sandbox com o mapa revelado, ou satélite em órbita (Programa Espacial): tudo à vista
    if (this.snapshot?.sandbox?.reveal || this.snapshot?.players.find((p) => p.slot === this.mySlot)?.satellite) visible.fill(1);
    const tex = this.fogTexture.image.data as Uint8Array;
    for (let i = 0; i < w * h; i++) {
      // célula descoberta agora: as fronteiras dela passam a aparecer
      if (this.fogState[i] === 0 && (visible[i] || this.territory[i] === this.mySlot)) this.bordersDirty = true;
      if (visible[i]) this.fogState[i] = 2;
      else if (this.fogState[i] === 2) this.fogState[i] = 1;
      // o próprio território é terra conhecida: no mínimo explorado (só o visual do chão; o
      // servidor continua escondendo as unidades fora de visão)
      else if (this.fogState[i] === 0 && this.territory[i] === this.mySlot) this.fogState[i] = 1;
      tex[i] = this.fogState[i] === 2 ? 255 : this.fogState[i] === 1 ? 115 : 0;
    }
    this.fogTexture.needsUpdate = true;
    // fronteiras só em terra já explorada (como no minimapa), redesenhadas no máximo 2× por segundo
    const now = performance.now();
    if (this.bordersDirty && now - this.bordersAt > 500) {
      this.bordersDirty = false;
      this.bordersAt = now;
      this.territoryLayer.update(this.territory, this.fogState);
    }
  }

  /** Há terra recém-explorada ou território novo: as fronteiras precisam ser redesenhadas. */
  private bordersDirty = false;
  private bordersAt = 0;

  // ------------------------------------------------------------ laço de renderização

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const workStart = performance.now();
    const interval = now - this.lastFrame;
    this.renderer.info.reset();
    const dt = Math.min(interval / 1000, 0.1); // limita delta após perder foco
    this.lastFrame = now;

    this.updateCameraFromKeys(dt);
    if (this.intro && !this.suspended) {
      // o zoom do jogador interrompe a aproximação (ver zoomBy)
      this.intro.t = Math.min(1, this.intro.t + dt / 0.9);
      const e = 1 - (1 - this.intro.t) ** 3;
      this.cameraCtl.distance = this.intro.from + (this.intro.to - this.intro.from) * e;
      if (this.intro.t >= 1) this.intro = null;
    }
    this.updateFollow(dt);
    this.cameraCtl.tick(dt);
    this.cameraCtl.apply();
    if (this.opts.profile.cinematic) {
      // o uniforme é de todas as cenas: a ativa impõe o seu estado (K-07)
      if (this.hudActive) cloudUniforms.uCloudStrength.value = this.cloudsOn ? CLOUD_SHADOW_STRENGTH : 0;
      // as nuvens andam com o mesmo vento da fumaça (≈2,4 unidades/s)
      const o = cloudUniforms.uCloudOffset.value;
      o.set((o.x - 0.94 * CLOUD_DRIFT * dt) % 1, (o.y - 0.34 * CLOUD_DRIFT * dt) % 1);
    }

    const alpha = this.paused ? 1 : Math.min(1, (now - this.snapshotAt) / (this.snapshotInterval / this.speed));
    // K-08: com o quadro pesado, tropas longe da câmera animam a cada 2 quadros (metade por vez)
    const farR = this.farAnimEvery > 1 ? Math.max(30, this.cameraCtl.distance * 0.8) : Infinity;
    const camT = this.cameraCtl.target;
    for (const t of this.units.values()) {
      const v = t.visual;
      v.renderPos.lerpVectors(t.prev, t.curr, alpha);
      let df = t.currFacing - t.prevFacing;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      v.facing = t.prevFacing + df * alpha;
      const target = t.snap.targetId !== null ? this.positionOf(t.snap.targetId) : null;
      const aim = target ? Math.atan2(target.y - v.renderPos.y, target.x - v.renderPos.x) : null;
      const frac = t.snap.hp / t.snap.maxHp;
      const selected = this.selection.has(t.snap.id);
      v.setSelected(selected);
      // na visão aproximada a barra de vida (em escala do mundo) cobriria a tela: fica só no painel
      const far = farR !== Infinity && (v.renderPos.x - camT.x) ** 2 + (v.renderPos.y - camT.z) ** 2 > farR * farR;
      const animate = !far || ((this.frameNo + t.snap.id) & 1) === 0;
      v.update(dt, t.snap.activity === 'moving' || t.snap.activity === 'chasing', aim, frac, (selected || frac < 0.999) && !this.cameraCtl.closeUp, this.camera, t.snap.activity === 'attacking', animate);
      v.setReload(t.snap.reload !== undefined && !this.cameraCtl.closeUp ? t.snap.reload : null, this.camera);
      v.setRank(t.snap.rank ?? 0, !this.cameraCtl.closeUp, this.camera);
      v.setEra(t.snap.era ?? 1);
    }
    for (const t of this.buildings.values()) {
      const frac = t.snap.hp / t.snap.maxHp;
      const selected = this.selection.has(t.snap.id);
      const upgrading = !!t.snap.upgrade;
      t.visual.setSelected(selected);
      const rally = t.snap.rally ? new THREE.Vector2(t.snap.rally.x, t.snap.rally.y) : null;
      t.visual.update(dt, t.snap.progress, frac, (selected || frac < 0.999 || t.snap.progress < 1 || upgrading) && !this.cameraCtl.closeUp, this.camera, rally, selected && t.snap.owner === this.mySlot, upgrading, t.snap.status === undefined || t.snap.status === 'ok');
    }
    this.cargo.frame(alpha, dt);
    this.airLayer.frame(alpha, dt);
    // os foguetes andam no relógio da simulação: param na pausa e aceleram com a velocidade
    this.rocketLayer.update(this.paused ? 0 : dt * this.speed);
    this.projectiles.update(this.paused ? 0 : dt * this.speed);
    for (let i = this.dying.length - 1; i >= 0; i--)
      if (!this.dying[i]!.updateDeath(dt)) {
        this.dying[i]!.dispose();
        this.dying.splice(i, 1);
      }
    this.trackMarks.update(dt);
    this.mineLayer.tick(dt);
    this.updateServiceRing();
    this.updateAirTargeting();
    if (this.hudActive) {
      audio.setListener(this.cameraCtl.target.x, this.cameraCtl.target.z, this.cameraCtl.distance, this.cameraCtl.yaw);
      this.updateProductionSound();
    }
    this.updateRouteInspection();
    this.effects.update(dt);
    this.citizens.update(this.paused ? 0 : dt * this.speed);
    if (!this.suspended) {
      this.sky.position.copy(this.camera.position);
      (this.sky.material as THREE.ShaderMaterial).uniforms.uTime!.value = now / 1000;
      this.terrain.update(now / 1000);
      // vento das folhas (movimento reduzido: parado)
      windUniforms.uWindTime.value = useSettingsStore.getState().reducedMotion || prefersReducedMotion() ? 0 : now / 1000;
      this.shadowFollow?.update(this.cameraCtl.target, this.cameraCtl.distance);
      // tempo de GPU do quadro inteiro (sombra, cena, reflexo, pós-processamento), 1 a cada 10 quadros
      this.gpuTimer?.begin();
      if (this.opts.shadows && (this.shadowDirty || this.frameNo % this.shadowInterval === 0)) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowDirty = false;
      }
      this.frameNo++;
      if (this.postFx && this.postFxOn) this.postFx.render();
      else this.renderer.render(this.scene, this.camera);
      // medições extras depois do quadro principal (o mapa de sombra já existe e está atualizado)
      if (this.probeLive) this.probe?.update(this.cameraCtl.target, now, [this.terrain.water]);
      if (this.exposureLive) this.exposure?.update(this.scene, this.camera, now, dt, [this.terrain.water]);
      this.gpuTimer?.end();
    }
    if (this.gpuTimer) for (const gpuMs of this.gpuTimer.poll()) this.kgps.gpuSample(now, gpuMs);
    this.trackFirstMinute(now, interval);
    this.perfFrame(now, interval, performance.now() - workStart);

    this.frames++;
    if (now - this.fpsTime >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsTime));
      this.frames = 0;
      this.fpsTime = now;
    }
    if (now - this.lastHud >= HUD_INTERVAL_MS) {
      this.lastHud = now;
      this.publishHud();
    }
    if (this.hudActive && now - this.lastPerf >= PERF_HUD_INTERVAL_MS) {
      this.lastPerf = now;
      useHudStore.getState().set({ perf: this.perfReport(now) });
    }
  };

  // ------------------------------------------------------------ desempenho (KAICS + KGPS)

  /**
   * Declara ao KAICS os botões gráficos desta cena, cada um com níveis, piso de qualidade, custo
   * visual de cada passo e leitura do estado real no renderizador. Só entra o que o preset ligou.
   */
  private setupPerf(): void {
    const r = this.renderer;
    const kaics = new Kaics(probeCapabilities(r.getContext(), r.capabilities.maxTextureSize), this.opts.adaptive ?? true);
    this.kaics = kaics;
    // classe do aparelho: celular (e renderização por software) tem pisos de emergência mais fundos
    const deep = kaics.device.value !== 'pc';
    const refl = this.terrain.reflection;
    if (refl)
      kaics.register({
        id: 'reflections',
        label: 'Reflexo da água',
        levels: ['só céu', 'a cada 3 quadros', 'a cada 2 quadros', 'todo quadro'],
        baseline: 3,
        floor: 1,
        // só céu: sem a passada que redesenha a cena (uniforme; não recompila)
        emergencyFloor: 0,
        helps: ['gpu', 'cpu'],
        stepCost: (from) => (from === 1 ? 3 : 1),
        apply: (l) => {
          refl.setSky(l === 0);
          if (l > 0) refl.setInterval(4 - l);
        },
        read: () => (refl.sky ? 0 : 4 - refl.interval),
      });
    if (this.probe)
      kaics.register({
        id: 'probe',
        label: 'Reflexos do cenário',
        levels: ['congelados', 'atualizados'],
        baseline: 1,
        floor: 0,
        helps: ['gpu', 'cpu'],
        stepCost: () => 1,
        apply: (l) => (this.probeLive = l === 1),
        read: () => (this.probeLive ? 1 : 0),
      });
    if (this.exposure)
      kaics.register({
        id: 'exposure',
        label: 'Exposição automática',
        levels: ['fixa', 'adaptativa'],
        baseline: 1,
        floor: 0,
        helps: ['gpu', 'cpu'],
        stepCost: () => 1,
        apply: (l) => (this.exposureLive = l === 1),
        read: () => (this.exposureLive ? 1 : 0),
      });
    if (this.opts.shadows)
      kaics.register({
        id: 'shadowRate',
        label: 'Atualização das sombras',
        levels: ['a cada 2 quadros', 'todo quadro'],
        baseline: 1,
        floor: 0,
        helps: ['gpu', 'cpu'],
        stepCost: () => 2,
        apply: (l) => (this.shadowInterval = l === 1 ? 1 : 2),
        read: () => (this.shadowInterval === 1 ? 1 : this.shadowInterval === 2 ? 0 : -1),
      });
    const fx = this.postFx;
    if (fx)
      kaics.register({
        id: 'postfx',
        label: 'Efeitos de tela',
        levels: ['desligados', 'oclusão de ambiente', 'oclusão + feixes de sol', 'oclusão + feixes + brilho'].slice(0, fx.maxLevel + 1),
        baseline: fx.maxLevel,
        floor: 0,
        helps: ['gpu', 'cpu'],
        stepCost: (from) => (from >= 3 ? 2 : from === 2 ? 3 : 4),
        apply: (l) => {
          fx.setLevel(l);
          this.postFxOn = l > 0;
        },
        read: () => fx.level,
      });
    const sun = this.sun;
    if (this.opts.shadows && sun) {
      const sizes: number[] = [];
      for (let size = 1024; size <= sun.shadow.mapSize.x; size *= 2) sizes.push(size);
      kaics.register({
        id: 'shadowRes',
        label: 'Resolução das sombras',
        levels: sizes.map((size) => `${size} px`),
        baseline: sizes.length - 1,
        floor: 0,
        helps: ['gpu'],
        stepCost: (from) => (sizes[from]! >= 8192 ? 1 : sizes[from]! >= 4096 ? 2 : 3),
        apply: (l) => {
          const size = sizes[l]!;
          sun.shadow.mapSize.set(size, size);
          // o three recria o mapa no próximo desenho de sombra
          sun.shadow.map?.dispose();
          sun.shadow.map = null;
          this.shadowDirty = true;
        },
        read: () => sizes.indexOf(sun.shadow.mapSize.x),
      });
    }
    // decoração (árvores, arbustos, pedras): sombra e densidade, sem recompilar shaders
    const terrain = this.terrain;
    if (this.opts.shadows)
      kaics.register({
        id: 'vegShadow',
        label: 'Sombra da vegetação e pedras',
        levels: ['sem sombra', 'com sombra'],
        baseline: 1,
        floor: 0,
        helps: ['gpu', 'cpu'],
        stepCost: () => 2,
        apply: (l) => {
          terrain.setDecorShadows(l === 1);
          this.shadowDirty = true;
        },
        read: () => (terrain.decorShadows ? 1 : 0),
      });
    const fxLevels = [0.4, 0.7, 1];
    const lowerSmoke: Record<ExplosionSmoke, ExplosionSmoke> = { cinematic: 'volumetric', volumetric: 'basic', basic: 'basic' };
    const fxSmoke = (l: number): ExplosionSmoke => (l >= 2 ? this.effects.topSmoke : l === 1 ? lowerSmoke[this.effects.topSmoke] : 'basic');
    kaics.register({
      id: 'effects',
      label: 'Efeitos (explosões, fumaça)',
      levels: ['40%', '70%', '100%'],
      baseline: 2,
      floor: 1,
      emergencyFloor: 0,
      helps: ['gpu', 'cpu'],
      stepCost: (from) => (from === 2 ? 2 : 4),
      apply: (l) => this.effects.setBudget(fxLevels[l]!, fxSmoke(l)),
      read: () => {
        const l = fxLevels.findIndex((f) => Math.abs(f - this.effects.budget) < 1e-6);
        return l >= 0 && this.effects.smoke === fxSmoke(l) ? l : -1;
      },
    });
    const vegLevels = [0.5, 0.75, 1];
    kaics.register({
      id: 'vegetation',
      label: 'Densidade da vegetação e pedras',
      levels: ['50%', '75%', '100%'],
      baseline: 2,
      floor: 1,
      // no PC a vegetação para em 75% (o resto é com o consultor da próxima partida)
      ...(deep ? { emergencyFloor: 0 } : {}),
      helps: ['gpu', 'cpu'],
      stepCost: (from) => (from === 2 ? 3 : 4),
      apply: (l) => {
        if (terrain.setDecorDensity(vegLevels[l]!)) this.shadowDirty = true;
      },
      read: () => vegLevels.findIndex((d) => Math.abs(d - terrain.decorDensity) < 1e-6),
    });
    // Onda 2 (K-06 a K-09): rastros, nuvens, animação distante e ondas — nenhum recompila shaders
    const trailLevels = [0.5, 1];
    kaics.register({
      id: 'trails',
      label: 'Rastros (esteiras, aviões, foguetes)',
      levels: ['50%', '100%'],
      baseline: 1,
      floor: 0,
      helps: ['cpu', 'gpu'],
      stepCost: () => 1,
      apply: (l) => {
        const f = trailLevels[l]!;
        this.trackMarks.setBudget(f);
        this.airLayer.setTrailBudget(f);
        this.rocketLayer.setTrailBudget(f);
      },
      read: () => {
        const f = this.airLayer.trailBudget;
        if (Math.abs(this.rocketLayer.trailBudget - f) > 1e-6 || Math.abs(this.trackMarks.budget - f) > 0.01) return -1;
        return trailLevels.findIndex((x) => Math.abs(x - f) < 1e-6);
      },
    });
    if (this.opts.profile.cinematic)
      kaics.register({
        id: 'clouds',
        label: 'Sombras das nuvens',
        levels: ['desligadas', 'ligadas'],
        baseline: 1,
        floor: 0,
        helps: ['gpu'],
        stepCost: () => 1,
        apply: (l) => {
          this.cloudsOn = l === 1;
          if (this.hudActive) cloudUniforms.uCloudStrength.value = this.cloudsOn ? CLOUD_SHADOW_STRENGTH : 0;
        },
        read: () => (this.cloudsOn ? 1 : 0),
      });
    kaics.register({
      id: 'farAnim',
      label: 'Animação das tropas distantes',
      levels: ['a cada 2 quadros', 'todo quadro'],
      baseline: 1,
      floor: 0,
      helps: ['cpu'],
      stepCost: () => 1,
      apply: (l) => (this.farAnimEvery = l === 1 ? 1 : 2),
      read: () => (this.farAnimEvery === 1 ? 1 : this.farAnimEvery === 2 ? 0 : -1),
    });
    const waves = this.terrain.waves;
    if (waves)
      kaics.register({
        id: 'waves',
        label: 'Ondas da água',
        levels: ['plano', 'ondas'],
        baseline: 1,
        floor: 0,
        helps: ['gpu'],
        stepCost: () => 2,
        apply: (l) => waves.set(l === 1),
        read: () => (waves.on ? 1 : 0),
      });
    this.registerResolution(r.getPixelRatio());
    // meta de quadros: a da classe do aparelho (30 no celular, 60 no PC) ou a escolhida pelo
    // jogador; o ajuste aprendido vale sob as mesmas condições (versão gráfica, preset, densidade
    // de tela, cena, classe e meta)
    const target = this.targetFromSettings();
    // ganho de cada ajuste aprendido neste aparelho e preset (ordem da descida rápida)
    const gains = localGainStore(gainKey({ revision: GRAPHICS_REVISION, preset: this.opts.preset ?? 'custom', dpr: window.devicePixelRatio, deviceClass: kaics.device.value }));
    this.kgps = new Kgps(kaics, performance.now(), localProfileStore(this.profileKeyFor(target.fps)), KGPS_CONFIG, target, gains);
    this.cleanup.push(
      useSettingsStore.subscribe((st) => {
        const now = performance.now();
        this.kgps.setAdaptive(st.adaptiveQuality, now);
        const next = this.targetFromSettings();
        if (next.fps !== this.kgps.target.fps || next.origin !== this.kgps.target.origin) this.kgps.setTarget(next, now, localProfileStore(this.profileKeyFor(next.fps)));
      }),
    );
    // eventos extraordinários no registro (R-EVD-05): aba oculta e de volta
    const onVisibility = () => {
      const now = performance.now();
      if (document.hidden) this.kgps.event(now, 'hidden', 'Jogo em segundo plano: medições pausadas');
      else this.kgps.event(now, 'visible', 'Jogo de volta ao primeiro plano: medições recomeçando depois de assentar');
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));
    this.watchDevicePixelRatio();
  }

  /** Meta de quadros a partir das configurações (Automática = padrão da classe do aparelho). */
  private targetFromSettings(): TargetPolicy {
    const chosen = useSettingsStore.getState().fpsTarget;
    return targetFor(this.kaics.device.value, null, chosen === 'auto' ? null : chosen);
  }

  private profileKeyFor(fps: number): string {
    return profileKey({
      revision: GRAPHICS_REVISION,
      preset: this.opts.preset ?? 'custom',
      dpr: window.devicePixelRatio,
      scene: this.battleOp === null ? 'teatro' : 'batalha',
      deviceClass: this.kaics.device.value,
      fps,
    });
  }

  /**
   * Botão de resolução interna sobre a densidade base `base` (refeito se a densidade da tela
   * mudar). Celular: níveis de emergência abaixo de 60% da base, até 0,7 px por px CSS (o piso
   * absoluto do preset mínimo); no PC a resolução fica no piso normal.
   */
  private registerResolution(base: number): void {
    const r = this.renderer;
    const deep = this.kaics.device.value !== 'pc';
    this.resolutionBase = base;
    const extra = deep ? [0.3, 0.4, 0.5].filter((f) => base * f >= MIN_PIXEL_RATIO - 1e-6) : [];
    const factors = [...extra, ...[0.6, 0.7, 0.8, 0.9, 1].filter((f) => base * f >= Math.min(base, MIN_PIXEL_RATIO) - 1e-6)];
    const ratios = factors.map((f) => (f === 1 ? base : base * f));
    const top = ratios.length - 1;
    const resFloor = extra.length;
    this.kaics.register({
      id: 'resolution',
      label: 'Resolução interna',
      levels: factors.map((f) => `${Math.round(f * 100)}%`),
      baseline: top,
      floor: resFloor,
      ...(extra.length ? { emergencyFloor: 0 } : {}),
      helps: ['gpu'],
      stepCost: (from) => (from <= resFloor ? 5 : from === top ? 2 : from === top - 1 ? 3 : 4),
      apply: (l) => {
        r.setPixelRatio(ratios[l]!);
        this.resize();
      },
      read: () => {
        const pr = r.getPixelRatio();
        // confere também o buffer real do canvas (o que a GPU de fato desenha)
        const size = r.getSize(new THREE.Vector2());
        if (size.x > 0 && r.domElement.width !== Math.floor(size.x * pr)) return -1;
        return ratios.findIndex((x) => Math.abs(x - pr) < 1e-3);
      },
    });
  }

  /**
   * Densidade da tela mudou (outro monitor, zoom do navegador) — R-DEV-04: a resolução é refeita
   * sobre a nova densidade, a taxa da tela estimada e a janela atual recomeçam.
   */
  private watchDevicePixelRatio(): void {
    if (typeof window.matchMedia !== 'function') return;
    let dpr = window.devicePixelRatio;
    let mq: MediaQueryList | null = null;
    const onChange = () => {
      const now = performance.now();
      const next = window.devicePixelRatio;
      const base = Math.min(next, this.opts.profile.pixelRatioCap);
      this.kgps.resetRefresh();
      this.kgps.event(now, 'dpr', `Densidade da tela mudou (${dpr.toFixed(2).replace('.', ',')}× → ${next.toFixed(2).replace('.', ',')}×): resolução refeita e medições recomeçando`);
      dpr = next;
      if (Math.abs(base - this.resolutionBase) > 1e-3) {
        this.kgps.forget('resolution', now);
        this.renderer.setPixelRatio(base);
        this.resize();
        this.registerResolution(base);
      }
      this.kgps.invalidate(now, 'densidade da tela mudou');
      arm();
    };
    const arm = () => {
      mq?.removeEventListener('change', onChange);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener('change', onChange);
    };
    arm();
    this.cleanup.push(() => mq?.removeEventListener('change', onChange));
  }

  /**
   * Pré-aquecimento de shaders (R-SHD-02). Sempre: os guardiões dos efeitos ficam na cena e seguram
   * os programas compilados (sem eles, a próxima explosão recompila depois que a última acaba).
   * No Alto, Ultra e Ultra+: compila de uma vez, em paralelo quando o navegador permite
   * (KHR_parallel_shader_compile), a cena, os guardiões e um modelo oculto de cada tropa — em vez
   * de travar no primeiro tiro ou no primeiro tanque inimigo. Sob o portão `compilando`, nada é
   * medido nem ajustado. `localStorage['nc.perf.prewarm'] = 'off'` desliga (teste antes/depois).
   */
  private prewarm(): void {
    this.scene.add(this.effects.keepers());
    const heavy = this.opts.preset === 'high' || this.opts.preset === 'ultra' || this.opts.preset === 'ultraplus';
    let off = false;
    try {
      off = localStorage.getItem('nc.perf.prewarm') === 'off';
    } catch {
      // sem armazenamento: segue o padrão
    }
    if (!heavy || off) return;
    const models = new THREE.Group();
    models.name = 'prewarm-models';
    models.visible = false;
    const visuals: UnitVisual[] = [];
    for (const type of Object.keys(UNITS) as UnitType[]) {
      try {
        const v = new UnitVisual(-1 - visuals.length, type, this.mySlot, true);
        visuals.push(v);
        models.add(v.group);
      } catch {
        // modelo indisponível: segue com os outros
      }
    }
    this.scene.add(models);
    const materials = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => materials.add(x));
      else if (m) materials.add(m);
    });
    const t0 = performance.now();
    this.compilingUntil = Infinity;
    this.prewarmInfo = { enabled: true, materials: materials.size, programs: 0, ms: null };
    const r = this.renderer;
    const prev = r.getRenderTarget();
    // reflexo e pós-processamento desenham em alvos intermediários (variante de shader sem o
    // mapeamento de tons da tela); sem pós-processamento, a cena principal vai direto à tela
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const jobs: Promise<unknown>[] = [];
    // sem compilação paralela no navegador, compila direto (o mesmo trabalho, sem esperar)
    const parallel = r.extensions.has('KHR_parallel_shader_compile');
    const compile = () => (parallel ? jobs.push(r.compileAsync(this.scene, this.camera)) : r.compile(this.scene, this.camera));
    try {
      r.setRenderTarget(rt);
      compile();
      r.setRenderTarget(prev);
      if (!this.postFx) compile();
    } catch (err) {
      r.setRenderTarget(prev);
      console.warn('pré-aquecimento de shaders falhou', err);
    }
    let finished = false;
    const finish = () => {
      if (finished || this.disposed) return;
      finished = true;
      const ms = Math.round(performance.now() - t0);
      for (const v of visuals) v.dispose();
      models.removeFromParent();
      rt.dispose();
      const programs = this.renderer.info.programs?.length ?? 0;
      this.prewarmInfo = { enabled: true, materials: materials.size, programs, ms };
      this.compilingUntil = performance.now() + 500;
      this.kgps.event(performance.now(), 'prewarm', `Pré-aquecimento de shaders: ${programs} programas para ${materials.size} materiais em ${ms} ms (antes do primeiro tiro e do primeiro tanque inimigo)`);
    };
    // nunca segura a partida: no pior caso, libera em 8 s
    const timeout = setTimeout(finish, 8000);
    void Promise.all(jobs).then(() => {
      clearTimeout(timeout);
      finish();
    });
  }

  /** Travadas (> 50 ms) e congelamentos (> 1 s) nos primeiros 60 s de partida (R-SHD-02). */
  private trackFirstMinute(now: number, interval: number): void {
    if (!this.snapshot || this.suspended) return;
    const f = this.firstMinute;
    if (!f) {
      this.firstMinute = { start: now, hitches: 0, stalls: 0, done: false };
      return;
    }
    if (f.done || (typeof document !== 'undefined' && document.hidden)) return;
    if (interval > 1000) f.stalls++;
    else if (interval > 50) f.hitches++;
    if (now - f.start < 60_000) return;
    f.done = true;
    const pw = this.prewarmInfo.enabled ? `ligado${this.prewarmInfo.ms !== null ? `, ${this.prewarmInfo.ms} ms` : ''}` : 'desligado';
    this.kgps.event(now, 'first-minute', `Primeiro minuto: ${f.hitches} travada(s) acima de 50 ms e ${f.stalls} congelamento(s) acima de 1 s (pré-aquecimento ${pw})`);
  }

  /** Telemetria do quadro: só conta quadros desenhados em condição normal (portões do KAICS). */
  private perfFrame(now: number, interval: number, cpu: number): void {
    const k = this.kaics;
    k.setCondition('suspended', this.suspended);
    k.setCondition('hidden', typeof document !== 'undefined' && document.hidden);
    k.setCondition('intro', this.intro !== null);
    k.setCondition('loading', this.snapshot === null);
    k.setCondition('compiling', now < this.compilingUntil);
    const gate = k.gate();
    if (gate !== this.perfGate) {
      this.kgps.invalidate(now, gate ?? `${this.perfGate} — retomado`);
      this.perfGate = gate;
    }
    // carga da cena (chamadas de desenho do quadro) acompanha cada amostra: separa cena mais
    // pesada de aparelho mais lento
    if (gate === null) this.kgps.sample(now, interval, cpu, this.renderer.info.render.calls);
    this.watchMemory(now);
    this.tickFieldTest(now);
  }

  /** Vigia de memória a cada 15 s (Onda 3): alta contínua vira incidente, nunca uma redução. */
  private watchMemory(now: number): void {
    if (this.suspended || !this.snapshot || !this.memoryWatch.due(now)) return;
    const mem = this.renderer.info.memory;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const alert = this.memoryWatch.add({
      t: now,
      geometries: mem.geometries,
      textures: mem.textures,
      programs: this.renderer.info.programs?.length ?? 0,
      heapMb: heap ? Math.round(heap / 1e5) / 10 : null,
      entities: this.units.size + this.buildings.size,
    });
    if (alert) this.kgps.incident(now, alert);
  }

  /**
   * Teste de campo automático (só no Sandbox, que pode criar tropas): câmera na capital e 2 min
   * parado; depois 10 tropas de cada lado num ponto perto da capital, 2 min em combate. Cada fase
   * vira um resumo no relatório. Devolve o motivo se não puder começar.
   */
  startFieldTest(batterySaver: boolean | null, phaseMs = 120_000): string | null {
    if (!this.snapshot?.sandbox) return 'O teste de campo funciona no Modo Sandbox (ele cria as tropas do combate).';
    if (this.fieldTest && (this.fieldTest.phase === 'parado' || this.fieldTest.phase === 'combate')) return 'Já há um teste em andamento.';
    const now = performance.now();
    this.centerOnHQ();
    this.fieldTest = { phase: 'parado', at: now, phaseAt: now, phaseMs, batterySaver, spawn: null };
    this.kgps.beginPhase('parado', now);
    return null;
  }

  cancelFieldTest(): void {
    const f = this.fieldTest;
    if (!f || (f.phase !== 'parado' && f.phase !== 'combate')) return;
    this.kgps.endPhase(performance.now());
    f.phase = 'cancelado';
  }

  /** Contagem de tropas próprias e inimigas na cena. */
  private troopCounts(): { mine: number; enemy: number } {
    let mine = 0;
    let enemy = 0;
    for (const t of this.units.values())
      if (t.snap.owner === this.mySlot) mine++;
      else enemy++;
    return { mine, enemy };
  }

  /** 10 tropas de um lado (4 tanques, 4 infantarias, 2 artilharias) no centro da câmera. */
  private spawnFieldSide(enemy: boolean): void {
    this.sandboxSpawn('tank', 4, enemy, false);
    this.sandboxSpawn('infantry', 4, enemy, false);
    this.sandboxSpawn('artillery', 2, enemy, false);
  }

  private tickFieldTest(now: number): void {
    const f = this.fieldTest;
    if (!f) return;
    const sp = f.spawn;
    if (f.phase === 'combate' && sp && !(sp.mineOk && sp.enemyOk)) {
      // as tropas chegaram no estado do servidor? (metade basta: o combate começa na hora)
      const c = this.troopCounts();
      if (!sp.mineOk && c.mine >= sp.mineBase + 5) sp.mineOk = true;
      if (!sp.enemyOk && c.enemy >= sp.enemyBase + 5) sp.enemyOk = true;
      const settled = sp.mineOk && sp.enemyOk;
      if (!settled && now - sp.at > 6000 && sp.tries < 3) {
        // comando perdido (conexão caiu ou o servidor recusou): reenvia só o lado que faltou
        if (!sp.mineOk) this.spawnFieldSide(false);
        if (!sp.enemyOk) this.spawnFieldSide(true);
        sp.tries++;
        sp.at = now;
      } else if (settled || now - sp.at > 6000) {
        // o cronômetro do combate conta a partir das tropas em campo (ou desiste de esperar)
        sp.troops = Math.max(0, c.mine - sp.mineBase) + Math.max(0, c.enemy - sp.enemyBase);
        sp.mineOk = sp.enemyOk = true;
        f.phaseAt = now;
        this.kgps.beginPhase('combate', now);
        if (!settled) this.kgps.event(now, 'field-spawn', `Teste de campo: só ${sp.troops} tropas confirmadas depois de ${sp.tries + 1} tentativas (conexão?)`);
      }
      return;
    }
    if (now - f.phaseAt < f.phaseMs) return;
    if (f.phase === 'parado') {
      // combate perto da capital, um pouco na direção do centro do mapa (fora dos prédios)
      this.kgps.endPhase(now);
      this.centerOnHQ();
      const t = this.cameraCtl.target;
      const cx = (this.map.width * this.map.cellSize) / 2;
      const cz = (this.map.height * this.map.cellSize) / 2;
      const d = Math.hypot(cx - t.x, cz - t.z) || 1;
      const step = Math.min(14 * this.map.cellSize, d * 0.5);
      this.cameraCtl.lookAt(t.x + ((cx - t.x) / d) * step, t.z + ((cz - t.z) / d) * step);
      const c = this.troopCounts();
      f.spawn = { at: now, tries: 0, mineBase: c.mine, enemyBase: c.enemy, mineOk: false, enemyOk: false, troops: 0 };
      this.spawnFieldSide(false);
      this.spawnFieldSide(true);
      f.phase = 'combate';
      f.phaseAt = now;
    } else if (f.phase === 'combate') {
      this.kgps.endPhase(now);
      f.phase = 'concluído';
      if (this.hudActive) useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text: 'Teste de campo concluído: toque no contador de qps e em "Copiar relatório".', tone: 'good' });
    }
  }

  /** Estado do teste de campo para o painel (tempo restante da fase em segundos). */
  private fieldTestView(now: number): PerfHud['fieldTest'] {
    const f = this.fieldTest;
    if (!f) return null;
    const running = f.phase === 'parado' || f.phase === 'combate';
    return {
      phase: f.phase,
      remainingS: running ? Math.max(0, Math.ceil((f.phaseMs - (now - f.phaseAt)) / 1000)) : 0,
      batterySaver: f.batterySaver,
      phases: this.kgps.phases(now).map(({ name, fpsMedian, p95Median, belowShare, running: r }) => ({ name, fpsMedian, p95Median, belowShare, running: r })),
    };
  }

  private perfReport(now: number): PerfHud {
    const info = this.renderer.info.render;
    const summary = this.kgps.summary(now);
    return {
      ...summary,
      drawCalls: info.calls,
      triangles: info.triangles,
      caps: this.kaics.capabilities,
      preset: this.opts.preset ?? 'custom',
      gpuTimer: this.gpuTimer !== null,
      sandbox: !!this.snapshot?.sandbox,
      fieldTest: this.fieldTestView(now),
      startFieldTest: (batterySaver, phaseMs) => this.startFieldTest(batterySaver, phaseMs),
      cancelFieldTest: () => this.cancelFieldTest(),
      memory: this.memoryWatch.latest(),
      knobGains: this.kgps.knobGains(),
      prewarm: this.prewarmInfo,
      firstMinute: this.firstMinute ? { hitches: this.firstMinute.hitches, stalls: this.firstMinute.stalls, done: this.firstMinute.done } : null,
      // relatório completo só quando o jogador pede (botão "Copiar relatório")
      exportReport: () =>
        buildReport({
          revision: GRAPHICS_REVISION,
          preset: this.opts.preset ?? 'custom',
          scene: this.battleOp === null ? 'teatro' : 'batalha',
          summary: this.kgps.summary(performance.now()),
          caps: this.kaics.capabilities,
          windows: this.kgps.recentWindows(),
          decisions: this.kgps.log,
          render: { drawCalls: info.calls, triangles: info.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures },
          session: this.kgps.session(),
          knobGains: this.kgps.knobGains(),
          memory: this.memoryWatch.latest(),
          fieldTest: this.fieldTest
            ? { status: this.fieldTest.phase, batterySaver: this.fieldTest.batterySaver, troops: this.fieldTest.spawn?.troops ?? 0, phases: this.kgps.phases(performance.now()) }
            : null,
          prewarm: this.prewarmInfo,
          firstMinute: this.firstMinute ? { hitches: this.firstMinute.hitches, stalls: this.firstMinute.stalls, done: this.firstMinute.done } : null,
        }),
    };
  }

  /** Rota inspecionada pelo painel de comércio: linha no mapa e câmera centrada uma vez. */
  private updateRouteInspection(): void {
    const hud = useHudStore.getState();
    const id = hud.inspectedShipment;
    const s = id !== null ? hud.trade?.shipments.find((x) => x.id === id) : undefined;
    this.cargo.showRoute(s ?? null);
    if (id !== this.focusedShipment) {
      this.focusedShipment = id;
      if (s) {
        this.cameraCtl.target.x = s.x;
        this.cameraCtl.target.z = s.y;
        this.follow = null;
        useNationalStore.getState().setPanelOpen(false);
      }
    }
  }

  private positionOf(id: number): THREE.Vector2 | null {
    const u = this.units.get(id);
    if (u) return u.visual.renderPos;
    const b = this.buildings.get(id);
    if (b) {
      const size = BUILDINGS[b.snap.type].size;
      return new THREE.Vector2((b.snap.cx + size / 2) * this.map.cellSize, (b.snap.cy + size / 2) * this.map.cellSize);
    }
    return null;
  }

  private updateCameraFromKeys(dt: number): void {
    const k = this.keys;
    const speed = 40 * dt;
    let dx = 0;
    let dz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) dz += speed;
    if (k.has('KeyS') || k.has('ArrowDown')) dz -= speed;
    if (k.has('KeyA') || k.has('ArrowLeft')) dx -= speed;
    if (k.has('KeyD') || k.has('ArrowRight')) dx += speed;
    if (this.opts.edgeScroll && this.pointer.inside) {
      const r = this.container.getBoundingClientRect();
      const m = 12;
      if (this.pointer.x < r.left + m) dx -= speed;
      if (this.pointer.x > r.right - m) dx += speed;
      if (this.pointer.y < r.top + m) dz += speed;
      if (this.pointer.y > r.bottom - m) dz -= speed;
    }
    if (dx || dz) {
      this.cameraCtl.pan(dx, dz);
      this.follow = null;
    }
    if (k.has('KeyQ')) this.cameraCtl.rotate(dt * 1.6);
    if (k.has('KeyE')) this.cameraCtl.rotate(-dt * 1.6);
  }

  // ------------------------------------------------------------ HUD

  private publishHud(): void {
    const s = this.snapshot;
    if (!s || !this.hudActive) return;
    const selectedUnits = [];
    let selectedBuilding = null;
    let inspected = null;
    for (const id of this.selection) {
      const u = this.units.get(id);
      if (u) {
        if (u.snap.owner === this.mySlot)
          selectedUnits.push({
            id,
            type: u.snap.type,
            hp: u.snap.hp,
            maxHp: u.snap.maxHp,
            activity: u.snap.activity,
            order: u.snap.order,
            mods: u.snap.mods ?? [],
            refit: u.snap.refit ? { mod: u.snap.refit.mod, progress: u.snap.refit.progress } : null,
            rank: u.snap.rank ?? 0,
            kills: u.snap.kills ?? 0,
          });
        else inspected = { kind: 'unit' as const, type: u.snap.type, owner: u.snap.owner, hp: u.snap.hp, maxHp: u.snap.maxHp, level: 1, spec: null };
        continue;
      }
      const b = this.buildings.get(id);
      if (b) {
        if (b.snap.owner === this.mySlot)
          selectedBuilding = {
            id,
            type: b.snap.type,
            owner: b.snap.owner,
            hp: b.snap.hp,
            maxHp: b.snap.maxHp,
            progress: b.snap.progress,
            level: b.snap.level,
            spec: b.snap.spec,
            upgrade: b.snap.upgrade && 'toLevel' in b.snap.upgrade ? b.snap.upgrade : null,
            queue: b.snap.queue,
            hasRally: b.snap.rally !== null,
            claims: b.snap.claims?.length ?? 0,
            workers: b.snap.workers ?? 0,
            workerTarget: b.snap.workerTarget ?? 0,
            status: b.snap.status ?? 'ok',
            rate: b.snap.rate ?? 0,
            stored: b.snap.stored ?? null,
            deposit: b.snap.deposit ?? null,
            research: b.snap.research ?? null,
          };
        else inspected = { kind: 'building' as const, type: b.snap.type, owner: b.snap.owner, hp: b.snap.hp, maxHp: b.snap.maxHp, level: b.snap.level, spec: b.snap.spec };
      }
    }
    if (selectedUnits.length !== this.lastSelectionCount && selectedUnits.length > 0) {
      useHudStore.getState().pushEvent({
        tick: s.tick,
        text: selectedUnits.length === 1 ? `${UNITS[selectedUnits[0]!.type].label} selecionada` : `${selectedUnits.length} unidades selecionadas`,
        tone: 'info',
      });
    }
    this.lastSelectionCount = selectedUnits.length;
    const production = [];
    const ownTypes = new Set<BuildingType>();
    const ownCounts: Partial<Record<BuildingType, number>> = {};
    let spaceLaunch: { id: number; phase: 'countdown' | 'ascent'; progress: number } | null = null;
    for (const t of this.buildings.values()) {
      if (t.snap.owner !== this.mySlot || t.snap.remembered) continue;
      if (t.snap.queue.length > 0) production.push({ id: t.snap.id, type: t.snap.type, queue: t.snap.queue });
      ownTypes.add(t.snap.type);
      ownCounts[t.snap.type] = (ownCounts[t.snap.type] ?? 0) + 1;
      if (t.snap.launch) spaceLaunch = { id: t.snap.id, ...t.snap.launch };
    }
    const prevTypes = useHudStore.getState().ownBuildingTypes;
    const prevCounts = useHudStore.getState().ownBuildingCounts;
    const countKeys = Object.keys(ownCounts) as BuildingType[];
    const sameCounts = countKeys.length === Object.keys(prevCounts).length && countKeys.every((k) => prevCounts[k] === ownCounts[k]);
    useHudStore.getState().set({
      tick: s.tick,
      players: s.players,
      production,
      // o conjunto só troca quando muda (o menu de construção não renderiza à toa)
      ownBuildingTypes: prevTypes.size === ownTypes.size && [...ownTypes].every((t) => prevTypes.has(t)) ? prevTypes : ownTypes,
      ownBuildingCounts: sameCounts ? prevCounts : ownCounts,
      spaceLaunch,
      paused: this.paused,
      pausedBy: this.pausedBy,
      speed: this.speed,
      selectedUnits,
      selectedBuilding,
      inspected,
      selectedCitizens: this.citizens.selectionInfo(),
      mode: this.mode,
      fps: this.fps,
      sandbox: s.sandbox ?? null,
      closeUp: this.cameraCtl.closeUp,
    });
  }

  /** Dados para o minimapa (chamado pelo componente em baixa frequência). */
  minimapData() {
    const units: { x: number; y: number; owner: number; selected: boolean }[] = [];
    for (const t of this.units.values()) units.push({ x: t.visual.renderPos.x, y: t.visual.renderPos.y, owner: t.snap.owner, selected: this.selection.has(t.snap.id) });
    const buildings = [...this.buildings.values()].map((t) => ({ cx: t.snap.cx, cy: t.snap.cy, size: BUILDINGS[t.snap.type].size, owner: t.snap.owner }));
    // trapézio visível: interseção dos cantos da tela com o chão
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) => this.ndcToGround(x!, y!));
    return { units, buildings, view: corners, fog: this.fogState, territory: this.territory };
  }

  // ------------------------------------------------------------ comandos (HUD e entrada)

  send(cmd: Command): void {
    this.client.send(this.battleOp !== null ? { t: 'cmd', cmd, scope: 'battle' } : { t: 'cmd', cmd });
  }

  // ------------------------------------------------------------ Sandbox

  // ------------------------------------------------------------ visão aproximada

  get closeUp(): boolean {
    return this.cameraCtl.closeUp;
  }

  toggleCloseUp(): void {
    this.setCloseUp(!this.cameraCtl.closeUp);
  }

  /**
   * Visão aproximada: a câmera desce perto das tropas e acompanha a seleção (a primeira unidade
   * ou o edifício escolhido). Mexer a câmera solta o acompanhamento; sair volta ao zoom de antes.
   */
  setCloseUp(on: boolean): void {
    if (on === this.cameraCtl.closeUp) return;
    const ctl = this.cameraCtl;
    if (on) {
      this.zoomBeforeCloseUp = ctl.distance;
      ctl.closeUp = true;
      this.intro = null;
      const id = [...this.selection].find((x) => this.units.has(x)) ?? [...this.selection][0] ?? null;
      this.follow = id;
      const b = id !== null ? this.buildings.get(id) : undefined;
      ctl.zoomTo(b ? 4 + BUILDINGS[b.snap.type].size * 2.6 : 6.5);
    } else {
      ctl.closeUp = false;
      this.follow = null;
      ctl.zoomTo(Math.max(16, this.zoomBeforeCloseUp));
    }
    this.publishHud();
  }

  /** Acompanha a entidade seguida (e troca para a nova seleção única, na visão aproximada). */
  private updateFollow(dt: number): void {
    if (!this.cameraCtl.closeUp) return;
    if (this.selection.size === 1) {
      const only = [...this.selection][0]!;
      if (only !== this.follow && (this.units.has(only) || this.buildings.has(only))) this.follow = only;
    }
    if (this.follow === null) return;
    const p = this.positionOf(this.follow);
    if (!p) {
      this.follow = null;
      return;
    }
    const k = 1 - Math.exp(-dt * 6);
    const t = this.cameraCtl.target;
    this.cameraCtl.lookAt(t.x + (p.x - t.x) * k, t.z + (p.y - t.z) * k);
  }

  /** Geração do míssil que sai deste silo (2 no nível 2). */
  missileGenOf(siloId: number): number {
    const t = this.buildings.get(siloId);
    return t && t.snap.type === 'missile_silo' ? buildingEffects('missile_silo', t.snap.level).missileGen : 1;
  }

  sandboxToggle(key: SandboxToggle, value: boolean): void {
    this.send({ type: 'sandbox_toggle', key, value });
  }

  /** Cria tropas no centro da tela (próprias ou do inimigo, opcionalmente com todos os pacotes). */
  sandboxSpawn(unitType: UnitType, count: number, enemy: boolean, maxed: boolean): void {
    this.send({ type: 'sandbox_spawn', unitType, x: this.cameraCtl.target.x, y: this.cameraCtl.target.z, count, enemy, maxed });
  }

  /** Leva o edifício selecionado ao nível pedido (com a especialização escolhida, se houver). */
  sandboxLevel(level: number, spec?: SpecId): void {
    const id = [...this.selection].find((x) => this.buildings.has(x));
    if (id === undefined) return;
    this.send(spec ? { type: 'sandbox_level', buildingId: id, level, spec } : { type: 'sandbox_level', buildingId: id, level });
  }

  /** Todos os pacotes de modernização e vida cheia nas unidades selecionadas. */
  sandboxMaxout(): void {
    const ids = [...this.selection].filter((x) => this.units.has(x)).slice(0, 60);
    if (ids.length) this.send({ type: 'sandbox_maxout', unitIds: ids });
  }

  /** Remove o que estiver selecionado (unidades ou edifícios, de qualquer lado; o QG fica). */
  sandboxRemoveSelected(): void {
    const ids = [...this.selection].slice(0, 60);
    if (ids.length) this.send({ type: 'sandbox_remove', ids });
    this.selection.clear();
  }

  sandboxClear(who: 'enemy' | 'mine'): void {
    this.send({ type: 'sandbox_clear', who });
  }

  /** Já recebeu o primeiro estado (a cena pode ser mostrada). */
  get hasSnapshot(): boolean {
    return this.snapshot !== null;
  }

  /** Unidades próprias no teatro (para compor a força de uma operação). */
  myForces(): { id: number; type: UnitType; hp: number; maxHp: number; refit: boolean }[] {
    const out = [];
    for (const t of this.units.values()) if (t.snap.owner === this.mySlot) out.push({ id: t.snap.id, type: t.snap.type, hp: t.snap.hp, maxHp: t.snap.maxHp, refit: !!t.snap.refit });
    return out;
  }

  /** Batalha local: unidades próprias vivas e inimigas à vista. */
  battleForces(): { mine: number; enemy: number } {
    let mine = 0;
    let enemy = 0;
    for (const t of this.units.values())
      if (t.snap.owner === this.mySlot) mine++;
      else enemy++;
    return { mine, enemy };
  }

  /** Operação cuja batalha local esta cena mostra (null = teatro). */
  readonly battleOp: number | null;
  /** Aproximação inicial da câmera na batalha local. */
  private intro: { from: number; to: number; t: number } | null = null;

  /** Só a cena ativa escreve no HUD, ouve o teclado e posiciona o áudio. */
  private hudActive = true;

  /** Troca de cena (teatro ↔ batalha): a ativa assume o HUD, a outra fica em segundo plano. */
  setHudActive(active: boolean): void {
    if (active === this.hudActive) return;
    this.hudActive = active;
    this.setSuspended(!active);
    if (!active) return;
    // a névoa de guerra é um uniform compartilhado pelos materiais: a cena ativa religa a sua
    fogUniforms.uFogMap.value = this.fogTexture;
    fogUniforms.uFogSize.value.set(this.map.width * this.map.cellSize, this.map.height * this.map.cellSize);
    useHudStore.setState({
      mySlot: this.mySlot,
      selectedUnits: [],
      selectedBuilding: null,
      inspected: null,
      selectedCitizens: null,
      mode: { kind: 'normal' },
      air: this.snapshot?.air ?? null,
      trade: this.snapshot?.trade ?? null,
    });
    this.clearSelection();
    this.publishHud();
  }

  private myUnitIds(): number[] {
    return [...this.selection].filter((id) => this.units.get(id)?.snap.owner === this.mySlot);
  }

  private myEngineerIds(): number[] {
    return this.myUnitIds().filter((id) => this.units.get(id)?.snap.type === 'engineer');
  }

  /** Anel do raio de cobertura de Hospital, Escola e Delegacia (ao posicionar ou selecionado). */
  private serviceRing: THREE.Mesh | null = null;

  private updateServiceRing(): void {
    const cs = this.map.cellSize;
    let at: { x: number; y: number } | null = null;
    const m = this.mode;
    if (m.kind === 'place' && BUILDINGS[m.buildingType].service && this.ghostCell) {
      const size = BUILDINGS[m.buildingType].size;
      at = { x: (this.ghostCell.cx + size / 2) * cs, y: (this.ghostCell.cy + size / 2) * cs };
    } else if (m.kind === 'normal') {
      const b = this.selectedOwnBuilding();
      if (b && BUILDINGS[b.snap.type].service) at = this.positionOf(b.snap.id);
    }
    if (!at) {
      if (this.serviceRing) this.serviceRing.visible = false;
      return;
    }
    if (!this.serviceRing) {
      const r = SERVICES.radius * cs;
      this.serviceRing = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.35, r, 96).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#7fd6a0', transparent: true, opacity: 0.55, depthWrite: false }),
      );
      this.serviceRing.renderOrder = 3;
      this.scene.add(this.serviceRing);
    }
    this.serviceRing.visible = true;
    this.serviceRing.position.set(at.x, this.groundHeight(at.x, at.y) + 0.12, at.y);
  }

  /** Minas próprias no mapa (limite por nação no painel do engenheiro). */
  myMineCount(): number {
    return (this.snapshot?.mines ?? []).filter((m) => m.owner === this.mySlot).length;
  }

  /** Engenheiros selecionados: escolher no mapa onde instalar uma mina antitanque. */
  startLayMine(): void {
    if (this.myEngineerIds().length) this.setMode({ kind: 'lay_mine' });
  }

  private layMineAt(clientX: number, clientY: number): void {
    const p = this.groundAt(clientX, clientY);
    const ids = this.myEngineerIds();
    if (!p || !ids.length) return;
    this.send({ type: 'lay_mine', unitIds: ids, x: p.x, y: p.y });
    this.effects.flash(new THREE.Vector3(p.x, 0.1, p.y), 0.4, '#e0b44c', 0.35);
  }

  /**
   * Ferramenta de estrada: clique marca ou desmarca uma célula; clicar e arrastar marca um caminho
   * em L (só retas, como numa grade de cidade). Nada é construído até o jogador confirmar
   * ("Construir" ou Enter), com a prévia e o custo à vista.
   */
  startRoad(): void {
    this.roadPending.clear();
    this.roadStroke = null;
    this.roadHover = null;
    this.roadPreview.set([]);
    this.setMode({ kind: 'road', cells: 0, bad: 0, marked: 0, reason: null });
  }

  /** Células marcadas e ainda não construídas (ordem em que foram marcadas). */
  private readonly roadPending = new Map<number, { cx: number; cy: number }>();
  /** Arrasto em andamento: célula onde começou, células do caminho e se o ponteiro saiu dela. */
  private roadStroke: { start: { cx: number; cy: number }; cells: { cx: number; cy: number }[]; moved: boolean } | null = null;
  /** Célula sob o ponteiro (prévia antes de clicar). */
  private roadHover: { cx: number; cy: number } | null = null;

  private cellAtScreen(clientX: number, clientY: number): { cx: number; cy: number } | null {
    const p = this.groundAt(clientX, clientY);
    if (!p) return null;
    const cx = Math.floor(p.x / this.map.cellSize);
    const cy = Math.floor(p.y / this.map.cellSize);
    return cx >= 0 && cy >= 0 && cx < this.map.width && cy < this.map.height ? { cx, cy } : null;
  }

  /** Por que a célula não pode virar estrada (regras que o cliente consegue conferir), ou null. */
  private roadCellProblem(c: { cx: number; cy: number }, occupied: Set<number>, engineers: { x: number; y: number }[]): string | null {
    const i = c.cy * this.map.width + c.cx;
    const t = this.map.terrain[i];
    if (t !== T.Plains && t !== T.Fertile) return 'Estradas só em planície ou solo fértil';
    if (occupied.has(i)) return 'Há uma construção no lugar';
    if (this.territory[i] !== this.mySlot) {
      const x = (c.cx + 0.5) * this.map.cellSize;
      const z = (c.cy + 0.5) * this.map.cellSize;
      const reach = ROAD.engineerRange * this.map.cellSize;
      if (!engineers.some((p) => Math.hypot(p.x - x, p.y - z) <= reach)) return 'Fora do território: só com um Engenheiro de Combate por perto';
    }
    return null;
  }

  /**
   * Avalia as células marcadas (mais o arrasto e a célula sob o ponteiro): verde onde dá para
   * pavimentar, cinza onde já é estrada e vermelho onde não dá. A simulação confere o resto
   * (guerra, pedra e verba) ao construir.
   */
  private evaluateRoad(): { ok: { cx: number; cy: number }[]; bad: number; reason: string | null } {
    const W = this.map.width;
    const occupied = new Set<number>();
    for (const { snap: b } of this.buildings.values()) {
      const size = BUILDINGS[b.type].size;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) occupied.add((b.cy + dy) * W + b.cx + dx);
    }
    const engineers = [...this.units.values()].filter((u) => u.snap.owner === this.mySlot && u.snap.type === 'engineer').map((u) => u.curr);
    const marked = new Map(this.roadPending);
    for (const c of this.roadStroke?.cells ?? []) marked.set(c.cy * W + c.cx, c);
    const preview: { cx: number; cy: number; state: 'ok' | 'road' | 'bad' | 'hover' }[] = [];
    const ok: { cx: number; cy: number }[] = [];
    let bad = 0;
    let reason: string | null = null;
    for (const [i, c] of marked) {
      if (this.map.terrain[i] === T.Road) {
        preview.push({ ...c, state: 'road' });
        continue;
      }
      const problem = ok.length >= ROAD.maxCells ? `Até ${ROAD.maxCells} células por obra` : this.roadCellProblem(c, occupied, engineers);
      if (problem) {
        bad++;
        reason ??= problem;
        preview.push({ ...c, state: 'bad' });
      } else {
        ok.push(c);
        preview.push({ ...c, state: 'ok' });
      }
    }
    const h = this.roadHover;
    if (h && !this.roadStroke && !marked.has(h.cy * W + h.cx)) {
      const problem = this.map.terrain[h.cy * W + h.cx] === T.Road ? 'road' : this.roadCellProblem(h, occupied, engineers);
      preview.push({ ...h, state: problem ? 'bad' : 'hover' });
    }
    this.roadPreview.set(preview);
    return { ok, bad, reason };
  }

  private refreshRoad(): void {
    if (this.mode.kind !== 'road') return;
    const { ok, bad, reason } = this.evaluateRoad();
    const marked = this.roadPending.size + (this.roadStroke?.cells.length ?? 0);
    const m = this.mode;
    if (m.cells !== ok.length || m.bad !== bad || m.reason !== reason || m.marked !== marked) this.setMode({ kind: 'road', cells: ok.length, bad, marked, reason });
  }

  /** Caminho em L de `a` até `b`: primeiro ao longo do eixo mais longo, depois do outro. */
  private roadPath(a: { cx: number; cy: number }, b: { cx: number; cy: number }): { cx: number; cy: number }[] {
    const out: { cx: number; cy: number }[] = [];
    let x = a.cx;
    let y = a.cy;
    const xFirst = Math.abs(b.cx - a.cx) >= Math.abs(b.cy - a.cy);
    out.push({ cx: x, cy: y });
    const stepX = () => {
      while (x !== b.cx && out.length < ROAD.maxCells * 2) out.push({ cx: (x += Math.sign(b.cx - x)), cy: y });
    };
    const stepY = () => {
      while (y !== b.cy && out.length < ROAD.maxCells * 2) out.push({ cx: x, cy: (y += Math.sign(b.cy - y)) });
    };
    if (xFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
    return out;
  }

  private roadDown(c: { cx: number; cy: number } | null): void {
    if (!c) return;
    this.roadStroke = { start: c, cells: [c], moved: false };
    this.refreshRoad();
  }

  private roadMove(c: { cx: number; cy: number } | null): void {
    this.roadHover = c;
    const st = this.roadStroke;
    if (st && c) {
      if (c.cx !== st.start.cx || c.cy !== st.start.cy) st.moved = true;
      st.cells = this.roadPath(st.start, c);
    }
    this.refreshRoad();
  }

  private roadUp(): void {
    const st = this.roadStroke;
    this.roadStroke = null;
    if (!st) return;
    const W = this.map.width;
    const k = st.start.cy * W + st.start.cx;
    // clique simples numa célula já marcada desmarca
    if (!st.moved && this.roadPending.has(k)) this.roadPending.delete(k);
    else for (const c of st.cells) this.roadPending.set(c.cy * W + c.cx, c);
    this.refreshRoad();
  }

  /** Toque: marca ou desmarca a célula. */
  private roadTap(c: { cx: number; cy: number } | null): void {
    if (!c) return;
    const k = c.cy * this.map.width + c.cx;
    if (this.roadPending.has(k)) this.roadPending.delete(k);
    else this.roadPending.set(k, c);
    this.refreshRoad();
  }

  /** Constrói as células marcadas que podem ser pavimentadas; a ferramenta continua aberta. */
  confirmRoad(): void {
    if (this.mode.kind !== 'road') return;
    const { ok, reason } = this.evaluateRoad();
    if (!ok.length) {
      useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text: `Estrada: ${reason ?? 'marque as células da estrada no mapa'}`, tone: 'warn' });
      return;
    }
    this.send({ type: 'build_road', cells: ok });
    this.roadPending.clear();
    this.roadStroke = null;
    this.refreshRoad();
  }

  /** Desmarca tudo sem sair da ferramenta. */
  clearRoad(): void {
    this.roadPending.clear();
    this.roadStroke = null;
    this.refreshRoad();
  }

  startPlacement(type: BuildingType): void {
    this.setMode({ kind: 'place', buildingType: type, valid: false, reason: null, yield: null });
    this.ghost?.dispose();
    this.ghost = new PlacementGhost(type, this.map.cellSize, this.mySlot);
    this.scene.add(this.ghost.group);
    if (useHudStore.getState().touchUi || (this.ghostAt.x === 0 && this.ghostAt.y === 0)) {
      // sem cursor (toque, ou mouse ainda parado): o fantasma começa no centro da vista
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ghostAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    this.updateGhost();
  }

  setSuspended(suspended: boolean): void {
    if (suspended !== this.suspended && this.kgps) {
      const now = performance.now();
      if (suspended) this.kgps.event(now, 'suspend', 'Cena em segundo plano (globo ou outra cena aberta): medições pausadas');
      else this.kgps.event(now, 'resume', 'Cena de volta: medições recomeçando depois de assentar');
    }
    this.suspended = suspended;
    if (suspended) this.keys.clear();
    // a memória da cena é comparada só dentro de um mesmo trecho visível
    this.memoryWatch.reset();
  }

  /** Confirma a construção na posição atual do fantasma (botão de confirmação no toque). */
  confirmPlacement(): void {
    this.tryPlace();
  }

  setTouchTool(tool: TouchTool): void {
    this.touchTool = tool;
    useHudStore.getState().set({ touchTool: tool });
  }

  toggleTouchAdditive(): void {
    this.touchAdditive = !this.touchAdditive;
    useHudStore.getState().set({ touchAdditive: this.touchAdditive });
  }

  zoomBy(factor: number): void {
    this.intro = null;
    this.cameraCtl.zoom(factor);
  }

  rotateBy(delta: number): void {
    this.cameraCtl.rotate(delta);
  }

  /** Limpa a seleção de entidades e de cidadãos. */
  clearSelection(): void {
    this.selection.clear();
    this.citizens?.selected.clear();
  }

  /**
   * Filtro anisotrópico no máximo da placa (até 16×) nas texturas do terreno e da vegetação: com a
   * câmera inclinada do RTS, o chão ao longe deixa de borrar. No preset Baixo fica em 4× (custo).
   */
  private sharpenTextures(root: THREE.Object3D): void {
    const level = this.opts.profile.terrain === 'low' ? 4 : Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    const seen = new Set<THREE.Texture>();
    const fix = (t: unknown) => {
      // texturas de render (reflexo da água, mapa de névoa) não são enviadas pela CPU: ficam de fora
      if (!(t instanceof THREE.Texture) || t.isRenderTargetTexture || t instanceof THREE.DataTexture || !t.image || seen.has(t) || t.anisotropy >= level) return;
      seen.add(t);
      t.anisotropy = level;
      t.needsUpdate = true;
    };
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        for (const v of Object.values(mat)) fix(v);
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const k of Object.keys(u)) fix(u[k]?.value);
      }
    });
  }

  /** Escolha de alvo da força aérea: reconhecimento (ponto), ataque (edifício) ou míssil (ponto). */
  startAirTarget(purpose: 'recon' | 'strike' | 'missile', sourceId: number, aircraftIds: number[] = [], nuclear = false): void {
    this.setMode({ kind: 'air_target', purpose, sourceId, aircraftIds, target: null, ...(nuclear ? { nuclear: true } : {}) });
  }

  /** Míssil: envia a preparação do alvo marcado (o lançamento ainda exige autorização). */
  confirmAirTarget(): void {
    const m = this.mode;
    if (m.kind !== 'air_target' || m.purpose !== 'missile' || !m.target) return;
    this.send({ type: 'missile_prepare', buildingId: m.sourceId, x: m.target.x, y: m.target.y, ...(m.nuclear ? { nuclear: true } : {}) });
    this.cancelMode();
  }

  private airTargetAt(clientX: number, clientY: number): void {
    const m = this.mode;
    if (m.kind !== 'air_target') return;
    const p = this.groundAt(clientX, clientY);
    if (!p) return;
    const warn = (text: string) => useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text, tone: 'warn' });
    if (m.purpose === 'recon') {
      this.send({ type: 'air_mission', buildingId: m.sourceId, aircraftIds: m.aircraftIds, mission: 'recon', x: p.x, y: p.y });
      this.effects.flash(new THREE.Vector3(p.x, 0.2, p.y), 0.8, '#7fc4ff', 0.5);
      this.cancelMode();
      return;
    }
    if (m.purpose === 'strike') {
      const hit = this.pickEntity(p);
      const b = hit !== null ? this.buildings.get(hit) : undefined;
      if (!b || b.snap.owner === this.mySlot) return warn('Ataque aéreo: toque num edifício inimigo já descoberto');
      if (!(this.snapshot?.air?.known ?? []).includes(b.snap.id)) return warn('Alvo não descoberto: faça um reconhecimento da área antes');
      this.send({ type: 'air_mission', buildingId: m.sourceId, aircraftIds: m.aircraftIds, mission: 'strike', targetId: b.snap.id });
      this.flashTarget(b.snap.id);
      this.cancelMode();
      return;
    }
    // míssil: só marca o alvo; a preparação sai pelo botão "Confirmar alvo"
    this.setMode({ ...m, target: { x: p.x, y: p.y } });
  }

  /** Raio de ação e alvo marcado no chão durante a escolha de alvo. */
  private updateAirTargeting(): void {
    const m = this.mode;
    if (m.kind !== 'air_target') {
      this.airLayer.setTargeting(null, null);
      return;
    }
    const src = this.positionOf(m.sourceId);
    const types = m.aircraftIds.map((id) => this.snapshot?.air?.aircraft.find((a) => a.id === id)?.type).filter((t) => t !== undefined);
    const range = types.length ? Math.min(...types.map((t) => AIRCRAFT[t].range)) : 0;
    this.airLayer.setTargeting(src && range ? { x: src.x, y: src.y, r: range } : null, m.target ? { x: m.target.x, y: m.target.y, r: missileSpec(this.missileGenOf(m.sourceId)).radius } : null);
  }

  startAttackMove(): void {
    if (this.myUnitIds().length > 0) this.setMode({ kind: 'attack_move' });
  }

  cancelMode(): void {
    this.roadPending.clear();
    this.roadStroke = null;
    this.roadHover = null;
    this.roadPreview.set([]);
    if (this.ghost) {
      this.ghost.dispose();
      this.ghost = null;
    }
    this.setMode({ kind: 'normal' });
  }

  private setMode(m: PointerMode): void {
    this.mode = m;
    this.renderer.domElement.style.cursor = m.kind === 'normal' ? 'default' : 'crosshair';
    useHudStore.getState().set({ mode: m });
  }

  /** Giro que vira o cais do porto (lado +z do modelo) para o lado com mais água. */
  private waterFacing(cx: number, cy: number, size: number): number {
    const W = this.map.width;
    const T = this.map.terrain;
    const water = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < this.map.height && T[y * W + x] === 4;
    const count = { s: 0, n: 0, e: 0, w: 0 };
    for (let i = -1; i <= size; i++) {
      if (water(cx + i, cy + size)) count.s++;
      if (water(cx + i, cy - 1)) count.n++;
      if (water(cx + size, cy + i)) count.e++;
      if (water(cx - 1, cy + i)) count.w++;
    }
    const best = (Object.entries(count) as [keyof typeof count, number][]).sort((a, b) => b[1] - a[1])[0]![0];
    // +z do modelo = sul (+y do mapa); girar em y: leste = +π/2, norte = π, oeste = −π/2
    return { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[best];
  }

  // ------------------------------------------------------------ modernização (Fase 5)

  /** Pesquisas concluídas do meu país (null antes do primeiro relatório nacional). */
  myTechs(): readonly string[] | null {
    return effectiveTechs(useNationalStore.getState().nations.find((n) => n.slot === this.mySlot)?.research.done ?? null);
  }

  /**
   * Pacotes que se aplicam às unidades selecionadas, com quantas podem começar agora — avaliadas
   * uma a uma com a mesma regra do servidor (`checkModernize` + `pickRefitFacility`), descontando
   * o saldo e as baias já usadas pelas anteriores — e o motivo quando nenhuma pode.
   */
  modernizeOptions(): ModernizeOption[] {
    const ids = this.myUnitIds();
    if (ids.length === 0) return [];
    const me = this.snapshot?.players.find((p) => p.slot === this.mySlot);
    const nation = useNationalStore.getState().nations.find((n) => n.slot === this.mySlot);
    const techs = this.myTechs();
    const cs = this.map.cellSize;
    const facilities: FacilityInfo[] = [...this.buildings.values()]
      .filter((t) => !t.snap.remembered)
      .map((t) => ({
        id: t.snap.id,
        type: t.snap.type,
        owner: t.snap.owner,
        ready: t.snap.progress >= 1 && t.snap.hp > 0,
        level: t.snap.level,
        x: (t.snap.cx + BUILDINGS[t.snap.type].size / 2) * cs,
        y: (t.snap.cy + BUILDINGS[t.snap.type].size / 2) * cs,
        half: (BUILDINGS[t.snap.type].size * cs) / 2,
      }));
    const baseBusy = new Map<number, number>();
    for (const t of this.units.values()) if (t.snap.refit) baseBusy.set(t.snap.refit.facility, (baseBusy.get(t.snap.refit.facility) ?? 0) + 1);
    const units = ids.map((id) => this.units.get(id)!.snap);
    const out: ModernizeOption[] = [];
    for (const mod of MOD_IDS) {
      const applicable = units.filter((u) => MODS[mod].units.includes(u.type) && !(u.mods ?? []).includes(mod));
      if (applicable.length === 0) continue;
      const resources = { ...(me?.resources ?? emptyStockpile()) };
      let funds = effectiveFund(nation ? nation.works.fundUsd : null);
      const busy = new Map(baseBusy);
      const ready: number[] = [];
      let first: ModernizeCheck | null = null;
      for (const u of applicable) {
        const facility = pickRefitFacility({ type: u.type, owner: u.owner, x: u.x, y: u.y }, facilities, (id) => busy.get(id) ?? 0);
        const check = checkModernize(mod, { unitType: u.type, mods: u.mods ?? [], refitting: !!u.refit, techs, facility, resources, fundsUsd: funds });
        first ??= check;
        if (check.blocker || !facility.ok) continue;
        ready.push(u.id);
        for (const r of RESOURCE_TYPES) resources[r] -= check.cost[r] ?? 0;
        if (funds !== null) funds -= check.usd;
        busy.set(facility.id, (busy.get(facility.id) ?? 0) + 1);
      }
      const blocked = ready.length === 0 ? first : null;
      out.push({ mod, applicable: applicable.length, readyIds: ready, blocker: blocked?.blocker ?? null, short: blocked?.short ?? null, check: first! });
    }
    return out;
  }

  modernize(mod: ModId): void {
    const ids = this.modernizeOptions().find((o) => o.mod === mod)?.readyIds ?? [];
    if (ids.length) this.send({ type: 'modernize', unitIds: ids, mod });
  }

  cancelModernize(): void {
    const ids = this.myUnitIds().filter((id) => this.units.get(id)?.snap.refit);
    if (ids.length) this.send({ type: 'cancel_modernize', unitIds: ids });
  }

  stopSelected(): void {
    const ids = this.myUnitIds();
    if (ids.length) this.send({ type: 'stop', unitIds: ids });
  }

  /** Pesquisa militar no Centro de Pesquisa selecionado. */
  startMilitaryResearch(researchId: MilitaryResearchId): void {
    const b = this.selectedOwnBuilding();
    if (b && b.snap.type === 'research_center') this.send({ type: 'military_research', buildingId: b.snap.id, researchId });
  }

  cancelMilitaryResearch(): void {
    const b = this.selectedOwnBuilding();
    if (b && b.snap.research) this.send({ type: 'cancel_military_research', buildingId: b.snap.id });
  }

  produce(unitType: UnitType): void {
    const b = this.selectedOwnBuilding();
    if (b) this.send({ type: 'produce', buildingId: b.snap.id, unitType });
  }

  cancelProduction(): void {
    const b = this.selectedOwnBuilding();
    if (b) this.send({ type: 'cancel_production', buildingId: b.snap.id });
  }

  private selectedOwnBuilding(): TrackedBuilding | null {
    for (const id of this.selection) {
      const b = this.buildings.get(id);
      if (b && b.snap.owner === this.mySlot) return b;
    }
    return null;
  }

  /** Seleciona um edifício próprio e centraliza a câmera nele (atalho do resumo de produção). */
  focusBuilding(id: number): void {
    const p = this.positionOf(id);
    if (!p) return;
    this.clearSelection();
    this.selection.add(id);
    this.cameraCtl.lookAt(p.x, p.y);
    // na visão aproximada, passa a acompanhar o edifício escolhido
    this.follow = this.cameraCtl.closeUp ? id : null;
  }

  centerOnHQ(): void {
    for (const b of this.buildings.values()) {
      if (b.snap.owner === this.mySlot && b.snap.type === 'hq') {
        const p = this.positionOf(b.snap.id)!;
        this.cameraCtl.lookAt(p.x, p.y);
        this.follow = null;
        return;
      }
    }
  }

  lookAt(x: number, y: number): void {
    this.cameraCtl.lookAt(x, y);
    this.follow = null;
  }

  /** Ordem de movimento a partir do minimapa. */
  orderMoveTo(x: number, y: number): void {
    const ids = this.myUnitIds();
    if (ids.length) this.send({ type: 'move', unitIds: ids, x, y });
  }

  setPaused(paused: boolean): void {
    this.client.send({ t: 'pause', paused });
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setSpeed(speed: GameSpeed): void {
    if (this.canControlSpeed) this.client.send({ t: 'speed', speed });
  }

  get isPaused(): boolean {
    return this.paused;
  }

  // ------------------------------------------------------------ áudio (Fase 7)

  /** Volumes das configurações e desbloqueio do áudio no primeiro gesto (exigência dos navegadores). */
  private bindAudio(): void {
    audio.configure({ mobile: isTouchDevice() || this.opts.profile.terrain === 'low' });
    const apply = () => {
      const s = useSettingsStore.getState();
      audio.setVolumes(s.volumes, s.muted);
    };
    apply();
    this.cleanup.push(useSettingsStore.subscribe(apply));
    const unlock = () => {
      audio.unlock();
      apply();
      if (!audio.ready) return;
      audio.startAmbient();
      audio.startMusic();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    this.cleanup.push(() => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      audio.stopAll();
    });
  }

  /** Sons de um evento da simulação (o serviço descarta o que está longe ou excede as vozes). */
  private eventSound(e: SimEvent): void {
    const mine = (o: number) => o === this.mySlot;
    switch (e.type) {
      case 'shot': {
        // a salva toca um sopro por foguete (na saída de cada um)
        if (e.salvo) break;
        const attacker = this.units.get(e.attackerId);
        const sound = attacker
          ? attacker.visual.type === 'artillery'
            ? 'howitzer'
            : attacker.visual.type === 'mobile_aa'
              ? 'aa_gun'
              : attacker.visual.type === 'tank' || attacker.visual.type === 'mbt'
                ? 'tank_gun'
                : attacker.visual.type === 'rocket_artillery'
                  ? 'cannon'
                  : 'rifle'
          : 'tower';
        audio.playAt(sound, e.from.x, e.from.y);
        break;
      }
      case 'salvo_impact':
        audio.playAt('explosion_big', e.pos.x, e.pos.y);
        break;
      case 'destroyed':
        audio.playAt(e.entity === 'building' || e.entityType === 'tank' ? 'explosion_big' : 'explosion', e.pos.x, e.pos.y);
        break;
      case 'air_strike':
        // no bombardeio em tapete o som sai com cada bomba que cai
        if (!e.bombers) audio.playAt('bomb', e.pos.x, e.pos.y);
        break;
      case 'dogfight':
        audio.playAt('rifle', e.from.x, e.from.y);
        break;
      case 'caravan_lost':
        audio.playAt('explosion', e.pos.x, e.pos.y);
        if (mine(e.owner)) audio.ui('alert');
        break;
      case 'city_captured':
        if (mine(e.owner)) audio.ui('success');
        else if (mine(e.victim)) audio.ui('alert');
        break;
      case 'aircraft_lost':
        audio.playAt('flak', e.pos.x, e.pos.y);
        audio.playAt('explosion', e.pos.x, e.pos.y);
        if (mine(e.owner)) audio.ui('alert');
        break;
      case 'under_attack':
        if (mine(e.owner)) audio.ui('alert');
        break;
      case 'unit_promoted':
        if (mine(e.owner)) audio.ui('success');
        break;
      case 'victory_progress':
        if (e.state !== 'lost') audio.ui(mine(e.slot) === (e.kind === 'territory') ? 'success' : 'alert');
        break;
      case 'mine':
        if (e.state === 'blast') {
          audio.playAt('explosion_big', e.pos.x, e.pos.y);
          if (mine(e.by ?? -1)) audio.ui('alert');
        } else if (e.state === 'cleared' && mine(e.by ?? -1)) audio.ui('success');
        else if (e.state === 'laid' && mine(e.owner)) audio.ui('click');
        break;
      case 'space':
        if (e.state === 'ascent') {
          audio.playAt('missile_launch', e.pos.x, e.pos.y);
          audio.playAt('explosion_big', e.pos.x, e.pos.y);
        } else if (e.state === 'orbit') audio.ui(mine(e.owner) ? 'success' : 'alert');
        else if (e.state === 'countdown' && !mine(e.owner)) audio.ui('alert');
        break;
      case 'era':
        if (mine(e.owner) && e.state === 'completed') audio.ui('success');
        else if (!mine(e.owner) && e.state === 'completed') audio.ui('alert');
        break;
      case 'border_incident':
        if (mine(e.victim)) audio.ui('alert');
        break;
      case 'construction_completed':
      case 'upgrade_completed':
      case 'military_research_completed':
        if (mine(e.owner)) audio.ui('success');
        break;
      case 'missile': {
        const own = mine(e.owner);
        if (own && e.state === 'preparing') audio.missileCue('prepare', e.launchId);
        else if (own && e.state === 'armed') audio.missileCue('armed', e.launchId);
        else if (own && e.state === 'launching') audio.missileCue('authorize', e.launchId);
        else if (own && e.state === 'aborted') audio.stopAlarm(e.launchId);
        else if (e.state === 'flight') {
          audio.playAt('missile_launch', e.from.x, e.from.y);
          // o pesado sai com um estrondo grave a mais
          if ((e.gen ?? 1) >= 2) audio.playAt('explosion_big', e.from.x, e.from.y);
          // o país-alvo ouve o alarme mesmo com a câmera longe
          if (mine(e.targetOwner)) audio.ui('alert');
        } else if (e.state === 'impact') {
          if (own || mine(e.targetOwner)) audio.play('missile_impact', 0.55);
          audio.playAt('missile_impact', e.target.x, e.target.y);
          if ((e.gen ?? 1) >= 2) audio.playAt('explosion_big', e.target.x, e.target.y);
        } else if (e.state === 'intercepted') audio.playAt('intercept', e.target.x, e.target.y);
        break;
      }
    }
  }

  /** Som de trabalho do edifício próprio selecionado (só ele; troca e silencia com transição). */
  private updateProductionSound(): void {
    const id = this.selection.size === 1 ? [...this.selection][0]! : null;
    const b = id !== null ? this.buildings.get(id) : undefined;
    const working = b && b.snap.owner === this.mySlot && b.snap.progress >= 1 && (b.snap.status ?? 'ok') === 'ok' && !this.paused;
    audio.setProduction(working ? (PRODUCTION_SOUND[b.snap.type] ?? null) : null);
  }

  // ------------------------------------------------------------ entrada

  private bindInput(): void {
    const el = this.renderer.domElement;
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };

    // o jogo trata todos os gestos de toque; o navegador não deve rolar nem dar zoom na página
    el.style.touchAction = 'none';
    on(el, 'contextmenu', (e) => e.preventDefault());
    on(el, 'pointerdown', (e) => this.onPointerDown(e));
    on(window, 'pointermove', (e) => this.onPointerMove(e));
    on(window, 'pointerup', (e) => this.onPointerUp(e));
    on(window, 'pointercancel', (e) => {
      if (e.pointerType === 'touch') this.touch.cancelPointer(e.pointerId);
    });
    on(el, 'pointerenter', () => (this.pointer.inside = true));
    on(el, 'pointerleave', () => (this.pointer.inside = false));
    on(
      el,
      'wheel',
      (e) => {
        e.preventDefault();
        this.cameraCtl.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
    on(window, 'keydown', (e) => this.onKeyDown(e));
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    const onResize = () => {
      this.resize();
      this.kgps?.invalidate(performance.now(), 'janela redimensionada');
    };
    on(window, 'resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(this.container);
    this.cleanup.push(() => ro.disconnect());
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.isTyping(e) || this.suspended) return;
    this.keys.add(e.code);
    const digit = /^Digit([0-9])$/.exec(e.code)?.[1];
    if (digit) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.controlGroups.set(digit, [...this.selection]);
      } else {
        const ids = this.controlGroups.get(digit)?.filter((id) => this.units.has(id) || this.buildings.has(id));
        if (ids?.length) {
          this.clearSelection();
          ids.forEach((id) => this.selection.add(id));
        }
      }
      return;
    }
    switch (e.code) {
      case 'Enter':
      case 'NumpadEnter':
        if (this.mode.kind === 'road') this.confirmRoad();
        break;
      case 'Escape':
        if (this.mode.kind !== 'normal') this.cancelMode();
        else if (this.cameraCtl.closeUp) this.setCloseUp(false);
        else this.clearSelection();
        break;
      case 'KeyF':
        this.startAttackMove();
        break;
      case 'KeyX':
        this.stopSelected();
        break;
      case 'KeyH':
        this.centerOnHQ();
        break;
      case 'Space':
        e.preventDefault();
        this.togglePause();
        break;
      case 'Delete':
        this.cancelProduction();
        break;
      default: {
        // atalhos de construção (com o Centro de Comando selecionado) e de produção
        const key = e.code.replace(/^Key/, '');
        const b = this.selectedOwnBuilding();
        // V: visão aproximada (com um quartel ou fábrica selecionado, V continua produzindo)
        if (key === 'V' && (!b || b.snap.progress < 1 || !PRODUCERS_WITH_V.includes(b.snap.type))) {
          this.toggleCloseUp();
          break;
        }
        if (!b || b.snap.progress < 1) break;
        // a Prefeitura pronta tem os mesmos atalhos do QG (cidadão e construções)
        if (b.snap.type === 'hq' || b.snap.type === 'city_hall') {
          if (key === CITIZEN.hotkey) {
            this.trainCitizen();
            break;
          }
          const type = (Object.keys(BUILDINGS) as BuildingType[]).find((t) => BUILDINGS[t].hotkey === key);
          if (type) this.startPlacement(type);
        } else if (b.snap.type === 'research_center') {
          const r = MILITARY_RESEARCH_IDS.find((id) => MILITARY_RESEARCH[id].hotkey === key);
          if (r) this.startMilitaryResearch(r);
        } else {
          if (b.snap.type === 'barracks' && key === RECRUIT.hotkey) {
            this.trainRecruit();
            break;
          }
          const unit = (Object.keys(UNITS) as UnitType[]).find((u) => UNITS[u].hotkey === key && UNITS[u].producedBy === b.snap.type);
          if (unit) this.produce(unit);
        }
      }
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      if (!useHudStore.getState().touchUi) useHudStore.getState().set({ touchUi: true });
      this.touch.down(touchPoint(e));
      return;
    }
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    if (e.button === 1) {
      e.preventDefault();
      this.drag = { x: e.clientX, y: e.clientY, active: true, button: 1 };
      return;
    }
    if (e.button === 2) {
      this.onRightClick(e);
      return;
    }
    if (e.button !== 0) return;
    if (this.mode.kind === 'place') {
      this.tryPlace();
      return;
    }
    if (this.mode.kind === 'attack_move') {
      const p = this.groundAt(e.clientX, e.clientY);
      const ids = this.myUnitIds();
      if (p && ids.length) this.send({ type: 'attack_move', unitIds: ids, x: p.x, y: p.y });
      if (!e.shiftKey) this.cancelMode();
      return;
    }
    if (this.mode.kind === 'air_target') {
      this.airTargetAt(e.clientX, e.clientY);
      return;
    }
    if (this.mode.kind === 'lay_mine') {
      this.layMineAt(e.clientX, e.clientY);
      if (!e.shiftKey) this.cancelMode();
      return;
    }
    if (this.mode.kind === 'road') {
      this.roadDown(this.cellAtScreen(e.clientX, e.clientY));
      return;
    }
    this.drag = { x: e.clientX, y: e.clientY, active: false, button: 0 };
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.suspended) return;
    if (e.pointerType === 'touch') {
      this.touch.move(touchPoint(e));
      return;
    }
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    const d = this.drag;
    if (d?.button === 1) {
      // botão do meio: arrasta o mapa; com Alt ou Ctrl, gira
      if (e.altKey || e.ctrlKey) this.cameraCtl.rotate(-dx * 0.006);
      else {
        this.cameraCtl.pan(-dx * 0.08, dy * 0.08);
        this.follow = null;
      }
      return;
    }
    if (d?.button === 0) {
      if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD) d.active = true;
      if (d.active) {
        const b = this.selectionBox;
        b.style.display = 'block';
        b.style.left = `${Math.min(d.x, e.clientX)}px`;
        b.style.top = `${Math.min(d.y, e.clientY)}px`;
        b.style.width = `${Math.abs(e.clientX - d.x)}px`;
        b.style.height = `${Math.abs(e.clientY - d.y)}px`;
      }
    }
    this.ghostAt = { x: e.clientX, y: e.clientY };
    if (this.mode.kind === 'place') this.updateGhost();
    if (this.mode.kind === 'road') this.roadMove(this.cellAtScreen(e.clientX, e.clientY));
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.suspended) return;
    if (e.pointerType === 'touch') {
      this.touch.up(touchPoint(e));
      return;
    }
    if (this.mode.kind === 'road' && e.button === 0 && this.roadStroke) {
      this.roadUp();
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || d.button !== e.button) return;
    if (d.button !== 0) return;
    this.selectionBox.style.display = 'none';
    if (d.active) this.boxSelect(d.x, d.y, e.clientX, e.clientY, e.shiftKey);
    else this.clickSelect(e.clientX, e.clientY, e.shiftKey, e.detail >= 2);
  }

  private onRightClick(e: PointerEvent): void {
    if (this.mode.kind !== 'normal') {
      this.cancelMode();
      return;
    }
    this.orderAt(e.clientX, e.clientY);
  }

  // ------------------------------------------------------------ toque

  private onTouchTap(x: number, y: number, double: boolean): void {
    if (this.mode.kind === 'place') {
      // primeiro toque posiciona o fantasma; tocar de novo na mesma célula confirma
      const before = this.ghostCell;
      this.ghostAt = { x, y };
      this.updateGhost();
      const after = this.ghostCell;
      if (before && after && before.cx === after.cx && before.cy === after.cy) this.tryPlace();
      return;
    }
    if (this.mode.kind === 'attack_move') {
      const p = this.groundAt(x, y);
      const ids = this.myUnitIds();
      if (p && ids.length) this.send({ type: 'attack_move', unitIds: ids, x: p.x, y: p.y });
      this.cancelMode();
      return;
    }
    if (this.mode.kind === 'air_target') {
      this.airTargetAt(x, y);
      return;
    }
    if (this.mode.kind === 'lay_mine') {
      this.layMineAt(x, y);
      this.cancelMode();
      return;
    }
    if (this.mode.kind === 'road') {
      // cada toque marca ou desmarca uma célula; "Construir" pavimenta
      this.roadTap(this.cellAtScreen(x, y));
      return;
    }
    if (this.touchTool === 'order') {
      this.orderAt(x, y);
      this.setTouchTool('select');
      return;
    }
    this.clickSelect(x, y, this.touchAdditive, double);
  }

  private onTouchLongPress(x: number, y: number): void {
    if (this.mode.kind !== 'normal') return;
    if (this.orderAt(x, y)) navigator.vibrate?.(12);
  }

  private onTouchBox(x0: number, y0: number, x1: number, y1: number, done: boolean): void {
    const b = this.selectionBox;
    if (done) {
      b.style.display = 'none';
      this.boxSelect(x0, y0, x1, y1, this.touchAdditive);
      this.setTouchTool('select');
      return;
    }
    b.style.display = 'block';
    b.style.left = `${Math.min(x0, x1)}px`;
    b.style.top = `${Math.min(y0, y1)}px`;
    b.style.width = `${Math.abs(x1 - x0)}px`;
    b.style.height = `${Math.abs(y1 - y0)}px`;
  }

  /** Ordem contextual no ponto da tela (botão direito ou toque longo). Retorna se algo foi ordenado. */
  private orderAt(clientX: number, clientY: number): boolean {
    const p = this.groundAt(clientX, clientY);
    if (!p) return false;
    const ids = this.myUnitIds();
    if (ids.length > 0) {
      const hit = this.pickEntity(p);
      if (hit && this.ownerOf(hit) !== this.mySlot) {
        this.send({ type: 'attack', unitIds: ids, targetId: hit });
        this.flashTarget(hit);
      } else {
        this.send({ type: 'move', unitIds: ids, x: p.x, y: p.y });
        this.effects.flash(new THREE.Vector3(p.x, 0.1, p.y), 0.35, '#8fe0a4', 0.35);
      }
      return true;
    }
    if (this.citizens.selected.size) return this.orderCitizens(p);
    const b = this.selectedOwnBuilding();
    if (b && b.snap.progress >= 1 && (b.snap.type === 'barracks' || b.snap.type === 'factory')) {
      this.send({ type: 'set_rally', buildingId: b.snap.id, x: p.x, y: p.y });
      this.effects.flash(new THREE.Vector3(p.x, 0.1, p.y), 0.35, '#e0b44c', 0.35);
      return true;
    }
    return false;
  }

  /**
   * Ordem aos cidadãos selecionados: num edifício próprio que emprega gente, vão trabalhar lá (a
   * simulação confirma e eles caminham até o prédio e entram); no chão, caminham até o ponto.
   */
  private orderCitizens(p: THREE.Vector2): boolean {
    const warn = (text: string) => useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text, tone: 'warn' });
    const hit = this.pickEntity(p);
    const b = hit !== null ? this.buildings.get(hit) : undefined;
    if (b && b.snap.owner === this.mySlot) {
      const need = buildingEffects(b.snap.type, b.snap.level, b.snap.spec).workers;
      if (b.snap.progress < 1) warn('O edifício ainda está em obra');
      else if (need === 0) warn(`${BUILDINGS[b.snap.type].label} não emprega trabalhadores`);
      else if ((b.snap.workers ?? 0) >= need) warn(`${BUILDINGS[b.snap.type].label}: sem vagas (${need} de ${need} trabalhadores)`);
      else {
        const sources = this.citizens.orderWork(b.snap.id);
        if (!sources.length) return true;
        this.send({ type: 'assign_workers', buildingId: b.snap.id, sources });
        const c = this.positionOf(b.snap.id);
        if (c) this.effects.flash(new THREE.Vector3(c.x, 0.2, c.y), 0.9, '#8fe0a4', 0.45);
      }
      return true;
    }
    if (this.citizens.orderMove(p)) this.effects.flash(new THREE.Vector3(p.x, 0.1, p.y), 0.35, '#8fe0a4', 0.35);
    else warn('Quem já está indo trabalhar segue para o posto: mande-o a outro edifício com vagas');
    return true;
  }

  private flashTarget(id: number): void {
    const p = this.positionOf(id);
    if (p) this.effects.flash(new THREE.Vector3(p.x, 0.2, p.y), 0.8, '#ff6a5a', 0.4);
  }

  private ownerOf(id: number): number | null {
    return this.units.get(id)?.snap.owner ?? this.buildings.get(id)?.snap.owner ?? null;
  }

  private clickSelect(x: number, y: number, additive: boolean, double: boolean): void {
    const p = this.groundAt(x, y);
    const hit = p ? this.pickEntity(p) : null;
    if (!additive) this.clearSelection();
    // cidadão (fora dos edifícios): escolhido antes do edifício ao lado de onde ele está
    const citizen = hit === null || !this.units.has(hit) ? this.pickCitizen(x, y) : null;
    if (citizen !== null) {
      this.selection.clear();
      const sel = this.citizens.selected;
      if (double) for (const c of this.citizens.visible()) if (this.isOnScreen(new THREE.Vector2(c.x, c.y))) sel.add(c.id);
      if (additive && sel.has(citizen) && !double) sel.delete(citizen);
      else sel.add(citizen);
      return;
    }
    if (hit === null) return;
    this.citizens.selected.clear();
    const u = this.units.get(hit);
    if (double && u && u.snap.owner === this.mySlot) {
      // duplo clique: todas as unidades do mesmo tipo visíveis
      for (const t of this.units.values()) {
        if (t.snap.owner === this.mySlot && t.snap.type === u.snap.type && this.isOnScreen(t.visual.renderPos)) this.selection.add(t.snap.id);
      }
      return;
    }
    if (additive && this.selection.has(hit)) this.selection.delete(hit);
    else {
      // não mistura entidades inimigas/edifícios numa seleção de unidades
      if (additive && (this.ownerOf(hit) !== this.mySlot || !u)) this.clearSelection();
      this.selection.add(hit);
    }
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    if (!additive) this.clearSelection();
    const v = new THREE.Vector3();
    for (const t of this.units.values()) {
      if (t.snap.owner !== this.mySlot) continue;
      v.set(t.visual.renderPos.x, 0.5, t.visual.renderPos.y).project(this.camera);
      const sx = r.left + ((v.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - v.y) / 2) * r.height;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) this.selection.add(t.snap.id);
    }
    // remove edifícios de uma seleção por arrasto com unidades
    if ([...this.selection].some((id) => this.units.has(id))) for (const id of [...this.selection]) if (!this.units.has(id)) this.selection.delete(id);
    // sem tropas no retângulo: seleciona os cidadãos à vista
    if (![...this.selection].some((id) => this.units.has(id))) {
      for (const c of this.citizens.visible()) {
        v.set(c.x, 0.5, c.y).project(this.camera);
        const sx = r.left + ((v.x + 1) / 2) * r.width;
        const sy = r.top + ((1 - v.y) / 2) * r.height;
        if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) this.citizens.selected.add(c.id);
      }
      if (this.citizens.selected.size) this.selection.clear();
    } else this.citizens.selected.clear();
  }

  private isOnScreen(p: THREE.Vector2): boolean {
    const v = new THREE.Vector3(p.x, 0, p.y).project(this.camera);
    return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
  }

  /** Cidadão à vista mais próximo do ponto da tela (pelo corpo, não pelo chão: ele é pequeno). */
  private pickCitizen(clientX: number, clientY: number): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best: number | null = null;
    let bd = useHudStore.getState().touchUi ? 26 : 16;
    for (const c of this.citizens.visible()) {
      v.set(c.x, this.groundHeight(c.x, c.y) + 0.45, c.y).project(this.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(r.left + ((v.x + 1) / 2) * r.width - clientX, r.top + ((1 - v.y) / 2) * r.height - clientY);
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return best;
  }

  /** Unidade mais próxima do ponto (com tolerância) ou edifício que o contém. */
  private pickEntity(p: THREE.Vector2): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const t of this.units.values()) {
      const d = t.visual.renderPos.distanceTo(p) - UNITS[t.snap.type].radius;
      if (d < 0.9 && d < bestD) {
        bestD = d;
        best = t.snap.id;
      }
    }
    if (best !== null) return best;
    const cs = this.map.cellSize;
    for (const t of this.buildings.values()) {
      const s = BUILDINGS[t.snap.type].size;
      if (p.x >= t.snap.cx * cs && p.x <= (t.snap.cx + s) * cs && p.y >= t.snap.cy * cs && p.y <= (t.snap.cy + s) * cs) return t.snap.id;
    }
    return null;
  }

  private groundAt(clientX: number, clientY: number): THREE.Vector2 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    return this.ndcToGround(ndc.x, ndc.y);
  }

  private ndcToGround(x: number, y: number): THREE.Vector2 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return new THREE.Vector2(hit.x, hit.z);
  }

  // ------------------------------------------------------------ construção

  private updateGhost(): void {
    if (this.mode.kind !== 'place' || !this.ghost || !this.snapshot) return;
    const p = this.groundAt(this.ghostAt.x, this.ghostAt.y);
    if (!p) return;
    const type = this.mode.buildingType;
    const cs = this.map.cellSize;
    const cursor = { cx: Math.floor(p.x / cs), cy: Math.floor(p.y / cs) };
    const cell = anchorForCursor(type, cursor, this.map.resourceNodes);
    this.ghostCell = cell;
    const size = BUILDINGS[type].size;
    this.ghost.group.position.set((cell.cx + size / 2) * cs, 0, (cell.cy + size / 2) * cs);
    const reason = this.localPlacementError(type, cell);
    this.ghost.setValid(!reason);
    const yieldPreview = this.previewYield(type, cell);
    if (this.mode.valid !== !reason || this.mode.reason !== reason || this.mode.yield?.cells !== yieldPreview?.cells)
      this.setMode({ kind: 'place', buildingType: type, valid: !reason, reason, yield: yieldPreview });
  }

  private localPlacementError(type: BuildingType, cell: Cell): string | null {
    const s = this.snapshot!;
    const me = s.players.find((p) => p.slot === this.mySlot);
    return placementError(
      {
        width: this.map.width,
        height: this.map.height,
        cellSize: this.map.cellSize,
        terrain: this.map.terrain,
        resourceNodes: this.map.resourceNodes,
        buildings: this.placementBuildings(),
        units: [...this.units.values()].map((t) => ({ type: t.snap.type, pos: { x: t.visual.renderPos.x, y: t.visual.renderPos.y } })),
        resources: me?.resources ?? { supplies: 0, food: 0, wood: 0, stone: 0, iron: 0, oil: 0 },
        territory: this.territory,
        // obstáculos perto de um engenheiro próprio: fora do território (a guerra o servidor confere)
        ...(BUILDINGS[type].engineerOutside && this.engineerNearCell(cell) ? { outsideOk: () => true } : {}),
        deposits: this.deposits,
      },
      this.mySlot,
      type,
      cell,
    );
  }

  private engineerNearCell(cell: Cell): boolean {
    const x = (cell.cx + 0.5) * this.map.cellSize;
    const z = (cell.cy + 0.5) * this.map.cellSize;
    const reach = ROAD.engineerRange * this.map.cellSize;
    return [...this.units.values()].some((u) => u.snap.owner === this.mySlot && u.snap.type === 'engineer' && Math.hypot(u.curr.x - x, u.curr.y - z) <= reach);
  }

  /**
   * Edifícios conhecidos com o depósito que exploram (deduzido das células reivindicadas, para os
   * próprios). A validação final é do servidor, que conhece também o que está na névoa.
   */
  private placementBuildings() {
    return (this.snapshot?.buildings ?? []).map((b) => {
      const first = b.claims?.[0];
      const depositId = first !== undefined ? this.deposits.cellDeposit[first]! : -1;
      return { type: b.type, owner: b.owner, cell: { cx: b.cx, cy: b.cy }, progress: b.progress, claims: b.claims, depositId: depositId >= 0 ? depositId : null };
    });
  }

  /** Prévia de rendimento de um edifício de coleta (células livres ao alcance → renda/s com todos os trabalhadores). */
  private previewYield(type: BuildingType, cell: Cell): { cells: number; rate: number } | null {
    const g = BUILDINGS[type].gather;
    if (!g || !this.snapshot) return null;
    if (g.terrain === null) return { cells: 1, rate: gatherRate(type, 1) };
    const list = this.placementBuildings();
    const choice = chooseClaims(this.map, this.deposits, type, cell, claimedBy(list, type), sitesByDeposit(list), (i) => this.territory[i] === this.mySlot);
    const cells = choice.claims.length;
    return { cells, rate: gatherRate(type, cells) };
  }

  setWorkers(buildingId: number, count: number): void {
    this.send({ type: 'set_workers', buildingId, count });
  }

  // ------------------------------------------------------------ melhorias (Fase 4)

  /** Estado do jogador para avaliar melhorias no painel (o servidor revalida com o mesmo cálculo). */
  upgradeWorld(): UpgradeWorld {
    const me = this.snapshot?.players.find((p) => p.slot === this.mySlot);
    const nation = useNationalStore.getState().nations.find((n) => n.slot === this.mySlot);
    const own = [...this.buildings.values()].filter((t) => t.snap.owner === this.mySlot && !t.snap.remembered);
    return {
      resources: me?.resources ?? emptyStockpile(),
      hqLevel: own.find((t) => t.snap.type === 'hq')?.snap.level ?? 0,
      bestLevel: (type) => own.reduce((best, t) => (t.snap.type === type && t.snap.progress >= 1 ? Math.max(best, t.snap.level) : best), 0),
      techs: effectiveTechs(nation ? nation.research.done : null),
      infrastructureIndex: nation ? nation.infrastructureIndex : null,
      stability: effectiveStability(nation ? nation.stability : null),
      fundsUsd: effectiveFund(nation ? nation.works.fundUsd : null),
      constructionTimeMul: nation ? combineEffects(nation.research.done).constructionTimeMul : 1,
      maxLevelByEra: ERAS[effectiveEra(me) as Era].maxUpgradeLevel,
      ...(this.snapshot?.sandbox ? { sandbox: { instant: this.snapshot.sandbox.instant } } : {}),
    };
  }

  upgradePlan(id: number, spec: SpecId | null = null): UpgradePlan | null {
    const t = this.buildings.get(id);
    if (!t || t.snap.owner !== this.mySlot) return null;
    const s = t.snap;
    return planUpgrade({ type: s.type, level: s.level, spec: s.spec, progress: s.progress, upgrading: !!s.upgrade }, this.upgradeWorld(), spec);
  }

  upgrade(id: number, spec: SpecId | null = null): void {
    this.send(spec ? { type: 'upgrade', buildingId: id, spec } : { type: 'upgrade', buildingId: id });
  }

  cancelUpgrade(id: number): void {
    this.send({ type: 'cancel_upgrade', buildingId: id });
  }

  trainRecruit(): void {
    const b = this.selectedOwnBuilding();
    if (b && b.snap.type === 'barracks') this.send({ type: 'produce', buildingId: b.snap.id, unitType: 'recruit' });
  }

  trainCitizen(): void {
    const b = this.selectedOwnBuilding();
    if (b && (b.snap.type === 'hq' || b.snap.type === 'city_hall')) this.send({ type: 'produce', buildingId: b.snap.id, unitType: 'citizen' });
  }

  private tryPlace(): void {
    if (this.mode.kind !== 'place' || !this.ghostCell) return;
    this.updateGhost();
    if (this.mode.kind !== 'place') return;
    if (!this.mode.valid) {
      useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text: this.mode.reason ?? 'Posição inválida', tone: 'warn' });
      return;
    }
    this.send({ type: 'build', buildingType: this.mode.buildingType, cx: this.ghostCell.cx, cy: this.ghostCell.cy });
    this.cancelMode();
  }

  // ------------------------------------------------------------ ciclo de vida

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.postFx?.setSize(w, h, this.renderer.getPixelRatio());
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    // fim da partida no teatro: a medição vai para o consultor de preset da próxima (C6)
    if (this.battleOp === null && this.kgps && isPreset(this.opts.preset)) {
      try {
        recordSession(localAdvisorStore(), this.opts.preset, this.kgps.session(), { revision: GRAPHICS_REVISION, deviceClass: this.kaics.device.value, now: Date.now() });
      } catch (err) {
        console.warn('consultor de preset indisponível', err);
      }
    }
    this.gpuTimer?.dispose();
    this.kaics?.dispose();
    this.unsubscribe();
    for (const fn of this.cleanup) fn();
    for (const t of this.units.values()) t.visual.dispose();
    for (const t of this.buildings.values()) t.visual.dispose();
    this.effects.dispose();
    this.postFx?.dispose();
    this.citizens.dispose();
    this.exposure?.dispose();
    this.probe?.dispose();
    this.selectionBox.remove();
    if (this.battleOp !== null) {
      // cena da batalha: geometrias, materiais, modelos e uniforms são compartilhados com o teatro
      // (caches de módulo) e continuam em uso por ele; só o que é desta cena é liberado
      this.cargo.dispose();
      this.airLayer.dispose();
      this.rocketLayer.dispose();
      this.trackMarks.dispose();
      this.projectiles.dispose();
      for (const v of this.dying.splice(0)) v.dispose();
      this.terrain.dispose();
      this.territoryLayer.dispose();
      this.mineLayer.dispose();
      this.roadPreview.dispose();
      this.roadLayer.dispose();
      this.fogTexture.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      return;
    }
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    disposeSharedResources();
    disposeUnitModels();
    disposeCitizenModel();
    this.cargo.dispose();
    disposeCargoModels();
    this.airLayer.dispose();
      this.rocketLayer.dispose();
      this.trackMarks.dispose();
      this.projectiles.dispose();
      for (const v of this.dying.splice(0)) v.dispose();
    disposeAirModels();
    disposeBuildingModels();
    disposeMaterials();
    disposeTextures();
    weatherUniforms.uGrime.value = null;
    weatherUniforms.uPanes.value = null;
    this.skyEnv?.dispose();
    this.terrain.dispose();
    this.territoryLayer.dispose();
    this.mineLayer.dispose();
    this.roadPreview.dispose();
    this.roadLayer.dispose();
    this.fogTexture.dispose();
    fogUniforms.uFogMap.value = null;
    cloudUniforms.uCloudMap.value = null;
    cloudUniforms.uCloudStrength.value = 0;
    setCloudShadows(false);
    this.renderer.dispose();
    // libera o contexto WebGL já: o navegador limita ~16 contextos ativos e, passando disso, derruba
    // o mais antigo — depois de várias partidas na mesma sessão, poderia ser o do globo ou da cena atual
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

function touchPoint(e: PointerEvent): TouchPoint {
  return { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, primary: e.isPrimary };
}
