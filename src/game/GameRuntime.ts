import * as THREE from 'three';
import type { GameSpeed, MatchStartInfo, ServerMessage } from '../../shared/protocol.ts';
import type { Command } from '../../shared/sim/commands.ts';
import { BUILDINGS, CITIZEN, UNITS, type BuildingType, type Terrain, type UnitType } from '../../shared/sim/config.ts';
import { anchorForCursor, placementError } from '../../shared/sim/placement.ts';
import type { BuildingSnapshot, Snapshot, UnitSnapshot } from '../../shared/sim/snapshot.ts';
import type { Cell, MapData, SimEvent } from '../../shared/sim/types.ts';
import type { GameClient } from '../net/GameClient.ts';
import { useHudStore, type PointerMode } from '../state/useHudStore.ts';
import { BuildingVisual, buildGhost } from './render/BuildingVisuals.ts';
import { CameraController } from './render/CameraController.ts';
import { Effects } from './render/Effects.ts';
import { disposeSharedResources, mat } from './render/palette.ts';
import { buildTerrain, type TerrainHandle } from './render/TerrainFactory.ts';
import { disposeMaterials, fogUniforms, weatherUniforms } from './render/materials.ts';
import { disposeBuildingModels } from './render/models/buildingModels.ts';
import { disposeUnitModels } from './render/models/unitModels.ts';
import { chooseClaims, claimedBy, gatherRate, sitesByDeposit } from '../../shared/sim/gathering.ts';
import { findDeposits, type DepositIndex } from '../../shared/sim/deposits.ts';
import { decodeTerritory } from '../../shared/sim/territory.ts';
import { Terrain as T } from '../../shared/sim/config.ts';
import { TerritoryLayer } from './render/TerritoryLayer.ts';
import { createSky, environmentFromSky, SKY } from './render/Sky.ts';
import { disposeTextures, grimeTexture, windowTexture } from './render/textures.ts';
import { UnitVisual } from './render/UnitVisuals.ts';
import { PostFx } from './render/PostFx.ts';
import { describeEvent } from './eventText.ts';
import type { GraphicsProfile } from '../lib/graphics.ts';
import { isTouchDevice } from '../lib/graphics.ts';
import { TouchGestures, type TouchPoint } from './input/TouchGestures.ts';
import type { TouchTool } from '../state/useHudStore.ts';

type SnapshotMsg = Extract<ServerMessage, { t: 'snapshot' }>;

export interface RuntimeOptions {
  profile: GraphicsProfile;
  /** Já combinado com o preset: só é verdadeiro se o preset permitir sombras. */
  shadows: boolean;
  panSpeed: number;
  edgeScroll: boolean;
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
const DRAG_THRESHOLD = 6;

/**
 * Coordena cena 3D, entrada e comunicação com o servidor. O estado autoritativo vem dos
 * snapshots do servidor; aqui ficam apenas interpolação, seleção e intenções do jogador.
 */
export class GameRuntime {
  readonly map: MapData;
  readonly mySlot: number;
  private readonly renderer: THREE.WebGLRenderer;
  private postFx: PostFx | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  readonly cameraCtl: CameraController;
  private readonly effects: Effects;
  private readonly units = new Map<number, TrackedUnit>();
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
  private ghost: THREE.Mesh | null = null;
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
    };
    this.mySlot = match.yourSlot;
    this.canControlSpeed = match.canControlSpeed;
    this.snapshotInterval = (1000 / match.tickRate) * match.snapshotEvery;

    this.renderer = new THREE.WebGLRenderer({ antialias: opts.profile.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.profile.pixelRatioCap));
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      useHudStore.getState().pushEvent({ tick: 0, text: 'Contexto gráfico perdido. Tentando restaurar…', tone: 'bad' });
    });

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
    if (opts.profile.ao) this.postFx = new PostFx(this.renderer, this.scene, this.camera);
    this.territoryLayer = new TerritoryLayer(this.map.width, this.map.height, this.map.cellSize, (x, z) => this.groundHeight(x, z));
    this.scene.add(this.territoryLayer.group);
    this.effects = new Effects(this.scene, opts.profile.maxEffects);

    this.selectionBox = document.createElement('div');
    this.selectionBox.className = 'selection-box';
    this.selectionBox.style.display = 'none';
    document.body.appendChild(this.selectionBox);

    this.touch = new TouchGestures(
      {
        tap: (x, y, double) => this.onTouchTap(x, y, double),
        longPress: (x, y) => this.onTouchLongPress(x, y),
        pan: (dx, dy) => this.cameraCtl.pan(-dx * 0.08, dy * 0.08),
        pinch: (scale, rot, dx, dy) => {
          if (scale !== 1) this.cameraCtl.zoom(1 / scale);
          if (rot) this.cameraCtl.rotate(rot);
          if (dx || dy) this.cameraCtl.pan(-dx * 0.08, dy * 0.08);
        },
        box: (x0, y0, x1, y1, done) => this.onTouchBox(x0, y0, x1, y1, done),
        cancel: () => (this.selectionBox.style.display = 'none'),
      },
      () => this.touchTool === 'box',
    );
    this.bindInput();
    this.resize();
    useHudStore.setState({
      mySlot: this.mySlot,
      events: [],
      selectedUnits: [],
      selectedBuilding: null,
      inspected: null,
      mode: { kind: 'normal' },
      touchUi: isTouchDevice(),
      touchTool: 'select',
      touchAdditive: false,
    });

    this.unsubscribe = client.on((msg) => {
      if (msg.t === 'snapshot') this.onSnapshot(msg);
      else if (msg.t === 'cmd_rejected') useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text: msg.reason, tone: 'warn' });
    });
    if (initial) this.onSnapshot(initial);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ cena

  private setupScene(W: number, H: number): void {
    // céu com nuvens, neblina de distância no tom do horizonte e reflexos vindos do céu
    this.sky = createSky(480);
    this.scene.add(this.sky);
    this.scene.background = SKY.haze;
    this.scene.fog = new THREE.Fog(SKY.haze, 150, 470);
    this.scene.environment = environmentFromSky(this.renderer);
    weatherUniforms.uGrime.value = grimeTexture(this.opts.profile.terrain === 'high' ? 512 : 256);
    weatherUniforms.uPanes.value = windowTexture();
    this.scene.add(new THREE.HemisphereLight('#c9dcec', '#5b5340', 0.85));
    const sun = new THREE.DirectionalLight(SKY.sunColor, 2.6);
    sun.position.set(W / 2 + SKY.sunDir.x * 120, SKY.sunDir.y * 120, H / 2 + SKY.sunDir.z * 120);
    sun.target.position.set(W / 2, 0, H / 2);
    sun.castShadow = this.opts.shadows;
    sun.shadow.mapSize.set(this.opts.profile.shadowMapSize, this.opts.profile.shadowMapSize);
    const sc = sun.shadow.camera;
    sc.left = -W * 0.75;
    sc.right = W * 0.75;
    sc.top = H * 0.75;
    sc.bottom = -H * 0.75;
    sc.near = 10;
    sc.far = 260;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun, sun.target);
    this.terrain = buildTerrain(this.map, this.opts.profile.terrain);
    this.scene.add(this.terrain.group);
    // modelos do Nature Kit chegam depois; até lá, vegetação procedural
    this.terrain.upgrade().catch((err: unknown) => console.warn('Nature Kit indisponível', err));
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
    this.snapshot = s;
    if (s.territory) {
      this.territory = decodeTerritory(s.territory);
      this.territoryLayer.update(this.territory);
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
        const visual = new UnitVisual(u.id, u.type, u.owner, u.owner === this.mySlot);
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
      }
    }
    for (const [id, t] of this.units) {
      if (!seen.has(id)) {
        t.visual.dispose();
        this.units.delete(id);
        this.selection.delete(id);
      }
    }

    const seenB = new Set<number>();
    for (const b of s.buildings) {
      seenB.add(b.id);
      let t = this.buildings.get(b.id);
      if (!t) {
        const size = BUILDINGS[b.type].size;
        const center = new THREE.Vector2((b.cx + size / 2) * this.map.cellSize, (b.cy + size / 2) * this.map.cellSize);
        const visual = new BuildingVisual(b.id, b.type, b.owner, b.owner === this.mySlot, {
          center,
          cellSize: this.map.cellSize,
          mapWidth: this.map.width,
          claims: b.claims,
          effects: this.opts.profile.maxEffects > 60,
        });
        this.scene.add(visual.group, visual.rallyObject);
        t = { visual, snap: b };
        this.buildings.set(b.id, t);
      } else t.snap = b;
      t.visual.remembered = b.remembered === true;
    }
    for (const [id, t] of this.buildings) {
      if (!seenB.has(id)) {
        t.visual.dispose();
        this.buildings.delete(id);
        this.selection.delete(id);
      }
    }

    this.updateFog();
    for (const e of s.events) this.handleEvent(e);
    if (this.mode.kind === 'place') this.updateGhost();
  }

  private handleEvent(e: SimEvent): void {
    if (e.type === 'shot') {
      const attacker = this.units.get(e.attackerId);
      const heavy = attacker ? attacker.visual.type === 'tank' : true;
      attacker?.visual.onFire();
      const target = this.units.get(e.targetId);
      const tp = target ? target.visual.renderPos : new THREE.Vector2(e.to.x, e.to.y);
      const from = attacker ? attacker.visual.muzzleWorld() : new THREE.Vector3(e.from.x, 2, e.from.y);
      this.effects.tracer(from, new THREE.Vector3(tp.x, target ? 0.7 : 1.4, tp.y), heavy);
    } else if (e.type === 'destroyed') {
      this.effects.explosion(new THREE.Vector3(e.pos.x, 0, e.pos.y), e.entity === 'building' || e.entityType === 'tank');
    }
    const text = describeEvent(e, this.mySlot);
    if (text) useHudStore.getState().pushEvent({ tick: e.tick, text: text.text, tone: text.tone });
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
    for (const t of this.buildings.values()) {
      if (t.snap.owner !== this.mySlot) continue;
      const size = BUILDINGS[t.snap.type].size;
      mark((t.snap.cx + size / 2) * cs, (t.snap.cy + size / 2) * cs, BUILDINGS[t.snap.type].sight);
    }
    const tex = this.fogTexture.image.data as Uint8Array;
    for (let i = 0; i < w * h; i++) {
      if (visible[i]) this.fogState[i] = 2;
      else if (this.fogState[i] === 2) this.fogState[i] = 1;
      tex[i] = this.fogState[i] === 2 ? 255 : this.fogState[i] === 1 ? 115 : 0;
    }
    this.fogTexture.needsUpdate = true;
  }

  // ------------------------------------------------------------ laço de renderização

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1); // limita delta após perder foco
    this.lastFrame = now;

    this.updateCameraFromKeys(dt);
    this.cameraCtl.apply();

    const alpha = this.paused ? 1 : Math.min(1, (now - this.snapshotAt) / (this.snapshotInterval / this.speed));
    for (const t of this.units.values()) {
      const v = t.visual;
      v.renderPos.lerpVectors(t.prev, t.curr, alpha);
      let df = t.currFacing - t.prevFacing;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      v.facing = t.prevFacing + df * alpha;
      const target = t.snap.targetId !== null ? this.positionOf(t.snap.targetId) : null;
      const aim = target ? Math.atan2(target.y - v.renderPos.y, target.x - v.renderPos.x) : null;
      const def = UNITS[t.snap.type];
      const frac = t.snap.hp / def.maxHp;
      const selected = this.selection.has(t.snap.id);
      v.setSelected(selected);
      v.update(dt, t.snap.activity === 'moving' || t.snap.activity === 'chasing', aim, frac, selected || frac < 0.999, this.camera);
    }
    for (const t of this.buildings.values()) {
      const def = BUILDINGS[t.snap.type];
      const frac = t.snap.hp / def.maxHp;
      const selected = this.selection.has(t.snap.id);
      t.visual.setSelected(selected);
      const rally = t.snap.rally ? new THREE.Vector2(t.snap.rally.x, t.snap.rally.y) : null;
      t.visual.update(dt, t.snap.progress, frac, selected || frac < 0.999 || t.snap.progress < 1, this.camera, rally, selected && t.snap.owner === this.mySlot);
    }
    this.effects.update(dt);
    if (!this.suspended) {
      this.sky.position.copy(this.camera.position);
      (this.sky.material as THREE.ShaderMaterial).uniforms.uTime!.value = now / 1000;
      if (this.postFx) this.postFx.render();
      else this.renderer.render(this.scene, this.camera);
    }

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
  };

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
    if (dx || dz) this.cameraCtl.pan(dx, dz);
    if (k.has('KeyQ')) this.cameraCtl.rotate(dt * 1.6);
    if (k.has('KeyE')) this.cameraCtl.rotate(-dt * 1.6);
  }

  // ------------------------------------------------------------ HUD

  private publishHud(): void {
    const s = this.snapshot;
    if (!s) return;
    const selectedUnits = [];
    let selectedBuilding = null;
    let inspected = null;
    for (const id of this.selection) {
      const u = this.units.get(id);
      if (u) {
        if (u.snap.owner === this.mySlot) selectedUnits.push({ id, type: u.snap.type, hp: u.snap.hp, activity: u.snap.activity, order: u.snap.order });
        else inspected = { kind: 'unit' as const, type: u.snap.type, owner: u.snap.owner, hp: u.snap.hp };
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
            progress: b.snap.progress,
            queue: b.snap.queue,
            hasRally: b.snap.rally !== null,
            claims: b.snap.claims?.length ?? 0,
            workers: b.snap.workers ?? 0,
            workerTarget: b.snap.workerTarget ?? 0,
            status: b.snap.status ?? 'ok',
            rate: b.snap.rate ?? 0,
            stored: b.snap.stored ?? null,
            deposit: b.snap.deposit ?? null,
          };
        else inspected = { kind: 'building' as const, type: b.snap.type, owner: b.snap.owner, hp: b.snap.hp };
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
    useHudStore.getState().set({
      tick: s.tick,
      players: s.players,
      paused: this.paused,
      pausedBy: this.pausedBy,
      speed: this.speed,
      selectedUnits,
      selectedBuilding,
      inspected,
      mode: this.mode,
      fps: this.fps,
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
    this.client.send({ t: 'cmd', cmd });
  }

  private myUnitIds(): number[] {
    return [...this.selection].filter((id) => this.units.get(id)?.snap.owner === this.mySlot);
  }

  startPlacement(type: BuildingType): void {
    this.setMode({ kind: 'place', buildingType: type, valid: false, reason: null, yield: null });
    if (this.ghost) this.ghost.removeFromParent();
    this.ghost = buildGhost(type, this.map.cellSize);
    this.scene.add(this.ghost);
    if (useHudStore.getState().touchUi || (this.ghostAt.x === 0 && this.ghostAt.y === 0)) {
      // sem cursor (toque, ou mouse ainda parado): o fantasma começa no centro da vista
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ghostAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    this.updateGhost();
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (suspended) this.keys.clear();
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
    this.cameraCtl.zoom(factor);
  }

  rotateBy(delta: number): void {
    this.cameraCtl.rotate(delta);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  startAttackMove(): void {
    if (this.myUnitIds().length > 0) this.setMode({ kind: 'attack_move' });
  }

  cancelMode(): void {
    if (this.ghost) {
      this.ghost.geometry.dispose();
      this.ghost.removeFromParent();
      this.ghost = null;
    }
    this.setMode({ kind: 'normal' });
  }

  private setMode(m: PointerMode): void {
    this.mode = m;
    this.renderer.domElement.style.cursor = m.kind === 'normal' ? 'default' : 'crosshair';
    useHudStore.getState().set({ mode: m });
  }

  stopSelected(): void {
    const ids = this.myUnitIds();
    if (ids.length) this.send({ type: 'stop', unitIds: ids });
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

  centerOnHQ(): void {
    for (const b of this.buildings.values()) {
      if (b.snap.owner === this.mySlot && b.snap.type === 'hq') {
        const p = this.positionOf(b.snap.id)!;
        this.cameraCtl.lookAt(p.x, p.y);
        return;
      }
    }
  }

  lookAt(x: number, y: number): void {
    this.cameraCtl.lookAt(x, y);
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
    on(el, 'wheel', (e) => {
      e.preventDefault();
      this.cameraCtl.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    on(window, 'keydown', (e) => this.onKeyDown(e));
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    on(window, 'resize', () => this.resize());
    const ro = new ResizeObserver(() => this.resize());
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
          this.selection.clear();
          ids.forEach((id) => this.selection.add(id));
        }
      }
      return;
    }
    switch (e.code) {
      case 'Escape':
        if (this.mode.kind !== 'normal') this.cancelMode();
        else this.selection.clear();
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
        if (!b || b.snap.progress < 1) break;
        if (b.snap.type === 'hq') {
          if (key === CITIZEN.hotkey) {
            this.trainCitizen();
            break;
          }
          const type = (Object.keys(BUILDINGS) as BuildingType[]).find((t) => BUILDINGS[t].hotkey === key);
          if (type) this.startPlacement(type);
        } else {
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
    this.drag = { x: e.clientX, y: e.clientY, active: false, button: 0 };
  }

  private onPointerMove(e: PointerEvent): void {
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
      else this.cameraCtl.pan(-dx * 0.08, dy * 0.08);
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
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touch.up(touchPoint(e));
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
    const b = this.selectedOwnBuilding();
    if (b && b.snap.progress >= 1 && (b.snap.type === 'barracks' || b.snap.type === 'factory')) {
      this.send({ type: 'set_rally', buildingId: b.snap.id, x: p.x, y: p.y });
      this.effects.flash(new THREE.Vector3(p.x, 0.1, p.y), 0.35, '#e0b44c', 0.35);
      return true;
    }
    return false;
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
    if (!additive) this.selection.clear();
    if (hit === null) return;
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
      if (additive && (this.ownerOf(hit) !== this.mySlot || !u)) this.selection.clear();
      this.selection.add(hit);
    }
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    if (!additive) this.selection.clear();
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
  }

  private isOnScreen(p: THREE.Vector2): boolean {
    const v = new THREE.Vector3(p.x, 0, p.y).project(this.camera);
    return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
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
    this.ghost.position.set((cell.cx + size / 2) * cs, 0.6, (cell.cy + size / 2) * cs);
    const reason = this.localPlacementError(type, cell);
    this.ghost.material = reason ? mat.ghostBad() : mat.ghostOk();
    const yieldPreview = this.previewYield(type, cell);
    if (
      this.mode.valid !== !reason ||
      this.mode.reason !== reason ||
      this.mode.yield?.cells !== yieldPreview?.cells
    )
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
        deposits: this.deposits,
      },
      this.mySlot,
      type,
      cell,
    );
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

  trainCitizen(): void {
    const b = this.selectedOwnBuilding();
    if (b && b.snap.type === 'hq') this.send({ type: 'produce', buildingId: b.snap.id, unitType: 'citizen' });
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
    this.unsubscribe();
    for (const fn of this.cleanup) fn();
    for (const t of this.units.values()) t.visual.dispose();
    for (const t of this.buildings.values()) t.visual.dispose();
    this.effects.dispose();
    this.postFx?.dispose();
    this.selectionBox.remove();
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
    disposeBuildingModels();
    disposeMaterials();
    disposeTextures();
    weatherUniforms.uGrime.value = null;
    weatherUniforms.uPanes.value = null;
    this.scene.environment?.dispose();
    this.terrain.dispose();
    this.territoryLayer.dispose();
    this.fogTexture.dispose();
    fogUniforms.uFogMap.value = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function touchPoint(e: PointerEvent): TouchPoint {
  return { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, primary: e.isPrimary };
}
