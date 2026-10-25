import * as THREE from 'three';
import type { GameSpeed, MatchStartInfo, ServerMessage } from '../../shared/protocol.ts';
import type { Command } from '../../shared/sim/commands.ts';
import { BUILDINGS, UNITS, type BuildingType, type Terrain, type UnitType } from '../../shared/sim/config.ts';
import { anchorForCursor, placementError } from '../../shared/sim/placement.ts';
import type { BuildingSnapshot, Snapshot, UnitSnapshot } from '../../shared/sim/snapshot.ts';
import type { Cell, MapData, SimEvent } from '../../shared/sim/types.ts';
import type { GameClient } from '../net/GameClient.ts';
import { useHudStore, type PointerMode } from '../state/useHudStore.ts';
import { BuildingVisual, buildGhost } from './render/BuildingVisuals.ts';
import { CameraController } from './render/CameraController.ts';
import { Effects } from './render/Effects.ts';
import { disposeSharedResources, mat } from './render/palette.ts';
import { buildTerrain } from './render/TerrainFactory.ts';
import { UnitVisual } from './render/UnitVisuals.ts';
import { describeEvent } from './eventText.ts';

type SnapshotMsg = Extract<ServerMessage, { t: 'snapshot' }>;

export interface RuntimeOptions {
  quality: 'low' | 'high';
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
  private selectionBox: HTMLDivElement;
  private raf = 0;
  private lastFrame = performance.now();
  private lastHud = 0;
  private frames = 0;
  private fpsTime = performance.now();
  private fps = 0;
  private disposed = false;
  private readonly unsubscribe: () => void;
  private readonly cleanup: (() => void)[] = [];
  private readonly controlGroups = new Map<string, number[]>();
  private lastSelectionCount = 0;
  private readonly canControlSpeed: boolean;

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

    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === 'high' ? 1.75 : 1));
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

    this.setupScene(W, H);
    this.effects = new Effects(this.scene, opts.quality);

    this.selectionBox = document.createElement('div');
    this.selectionBox.className = 'selection-box';
    this.selectionBox.style.display = 'none';
    document.body.appendChild(this.selectionBox);

    this.bindInput();
    this.resize();
    useHudStore.setState({ mySlot: this.mySlot, events: [], selectedUnits: [], selectedBuilding: null, inspected: null, mode: { kind: 'normal' } });

    this.unsubscribe = client.on((msg) => {
      if (msg.t === 'snapshot') this.onSnapshot(msg);
      else if (msg.t === 'cmd_rejected') useHudStore.getState().pushEvent({ tick: this.snapshot?.tick ?? 0, text: msg.reason, tone: 'warn' });
    });
    if (initial) this.onSnapshot(initial);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ cena

  private setupScene(W: number, H: number): void {
    const sky = new THREE.Color('#9fb7c9');
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 120, 260);
    this.scene.add(new THREE.HemisphereLight('#dfe9f3', '#4a4a3a', 1.1));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(W * 0.2, 90, H * 0.1);
    sun.target.position.set(W / 2, 0, H / 2);
    sun.castShadow = this.opts.shadows;
    sun.shadow.mapSize.set(this.opts.quality === 'high' ? 2048 : 1024, this.opts.quality === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -W * 0.75;
    sc.right = W * 0.75;
    sc.top = H * 0.75;
    sc.bottom = -H * 0.75;
    sc.near = 10;
    sc.far = 260;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun, sun.target);
    this.scene.add(buildTerrain(this.map, this.opts.quality));
    // borda do mapa
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 4, H * 4),
      new THREE.MeshStandardMaterial({ color: '#3d4a33', roughness: 1 }),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.set(W / 2, -0.8, H / 2);
    this.scene.add(border);
  }

  // ------------------------------------------------------------ snapshots

  private onSnapshot(msg: SnapshotMsg): void {
    const s = msg.s;
    this.snapshot = s;
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
        const visual = new BuildingVisual(b.id, b.type, b.owner, b.owner === this.mySlot, center, this.map.cellSize);
        this.scene.add(visual.group, visual.rallyObject);
        t = { visual, snap: b };
        this.buildings.set(b.id, t);
      } else t.snap = b;
    }
    for (const [id, t] of this.buildings) {
      if (!seenB.has(id)) {
        t.visual.dispose();
        this.buildings.delete(id);
        this.selection.delete(id);
      }
    }

    for (const e of s.events) this.handleEvent(e);
    if (this.mode.kind === 'place') this.updateGhost();
  }

  private handleEvent(e: SimEvent): void {
    if (e.type === 'shot') {
      const attacker = this.units.get(e.attackerId);
      const heavy = attacker ? attacker.visual.type === 'tank' : true;
      attacker?.visual.onFire();
      const fromY = attacker ? (heavy ? 1 : 0.6) : 2;
      const target = this.units.get(e.targetId);
      const tp = target ? target.visual.renderPos : new THREE.Vector2(e.to.x, e.to.y);
      const fp = attacker ? attacker.visual.renderPos : new THREE.Vector2(e.from.x, e.from.y);
      this.effects.tracer(new THREE.Vector3(fp.x, fromY, fp.y), new THREE.Vector3(tp.x, target ? 0.7 : 1.4, tp.y), heavy);
    } else if (e.type === 'destroyed') {
      this.effects.explosion(new THREE.Vector3(e.pos.x, 0, e.pos.y), e.entity === 'building' || e.entityType === 'tank');
    }
    const text = describeEvent(e, this.mySlot);
    if (text) useHudStore.getState().pushEvent({ tick: e.tick, text: text.text, tone: text.tone });
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
    this.renderer.render(this.scene, this.camera);

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
          selectedBuilding = { id, type: b.snap.type, owner: b.snap.owner, hp: b.snap.hp, progress: b.snap.progress, queue: b.snap.queue, hasRally: b.snap.rally !== null };
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
    return { units, buildings, view: corners };
  }

  // ------------------------------------------------------------ comandos (HUD e entrada)

  send(cmd: Command): void {
    this.client.send({ t: 'cmd', cmd });
  }

  private myUnitIds(): number[] {
    return [...this.selection].filter((id) => this.units.get(id)?.snap.owner === this.mySlot);
  }

  startPlacement(type: BuildingType): void {
    this.setMode({ kind: 'place', buildingType: type, valid: false, reason: null });
    if (this.ghost) this.ghost.removeFromParent();
    this.ghost = buildGhost(type, this.map.cellSize);
    this.scene.add(this.ghost);
    this.updateGhost();
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

    on(el, 'contextmenu', (e) => e.preventDefault());
    on(el, 'pointerdown', (e) => this.onPointerDown(e));
    on(window, 'pointermove', (e) => this.onPointerMove(e));
    on(window, 'pointerup', (e) => this.onPointerUp(e));
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
    if (this.isTyping(e)) return;
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
      case 'KeyB':
      case 'KeyN':
      case 'KeyJ': {
        const b = this.selectedOwnBuilding();
        if (b?.snap.type === 'hq') this.startPlacement(e.code === 'KeyB' ? 'barracks' : e.code === 'KeyN' ? 'factory' : 'extractor');
        break;
      }
      case 'KeyI':
        this.produce('infantry');
        break;
      case 'KeyT':
        this.produce('tank');
        break;
    }
  }

  private onPointerDown(e: PointerEvent): void {
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
    if (this.mode.kind === 'place') this.updateGhost();
  }

  private onPointerUp(e: PointerEvent): void {
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
    const p = this.groundAt(e.clientX, e.clientY);
    if (!p) return;
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
      return;
    }
    const b = this.selectedOwnBuilding();
    if (b && b.snap.progress >= 1 && (b.snap.type === 'barracks' || b.snap.type === 'factory')) {
      this.send({ type: 'set_rally', buildingId: b.snap.id, x: p.x, y: p.y });
    }
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
    const p = this.groundAt(this.pointer.x, this.pointer.y);
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
    if (this.mode.valid !== !reason || this.mode.reason !== reason) this.setMode({ kind: 'place', buildingType: type, valid: !reason, reason });
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
        buildings: s.buildings.map((b) => ({ type: b.type, owner: b.owner, cell: { cx: b.cx, cy: b.cy }, progress: b.progress })),
        units: [...this.units.values()].map((t) => ({ type: t.snap.type, pos: { x: t.visual.renderPos.x, y: t.visual.renderPos.y } })),
        resources: me?.resources ?? 0,
      },
      this.mySlot,
      type,
      cell,
    );
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
