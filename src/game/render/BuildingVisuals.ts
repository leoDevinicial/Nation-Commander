import * as THREE from 'three';
import { BUILDINGS, type BuildingType } from '../../../shared/sim/config.ts';
import { HealthBar, selectionRing } from './HealthBar.ts';
import { accentMaterial, bodyMaterial, glassMaterial, withFog } from './materials.ts';
import { cinematicSmokeTexture, smokeTexture, volumetricSmokeTexture } from './textures.ts';
import { buildingModel, type BuildingModel } from './models/buildingModels.ts';
import type { SpecId } from '../../../shared/sim/upgrades.ts';
import { C, PartBuilder, type ModelLayers } from './models/kit.ts';
import { box, cyl, factionColor, mat, mesh, sharedMaterial } from './palette.ts';

function layerMeshes(l: ModelLayers, owner: number): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const [geo, material] of [
    [l.body, bodyMaterial()],
    [l.accent, accentMaterial(owner)],
    [l.glass, glassMaterial()],
  ] as const) {
    if (!geo.getAttribute('position')) continue;
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}

export interface BuildingVisualOptions {
  center: THREE.Vector2;
  cellSize: number;
  mapWidth: number;
  /** Células de recurso reivindicadas (só para edifícios próprios de coleta). */
  claims?: number[];
  /** Efeitos decorativos (fumaça) — desligados no preset Mobile/Baixo. */
  effects?: boolean;
  /** Ultra: fumaça volumétrica. */
  ultra?: boolean;
  /** Ultra+: fumaça densa e dispersa pelo vento (mais partículas, maiores e mais suaves). */
  cinematic?: boolean;
  /** Nível e especialização iniciais (Fase 4). */
  level?: number;
  spec?: SpecId | null;
  /** Distância da câmera a partir da qual as peças pequenas dos módulos somem (LOD). */
  lodDistance?: number;
}

/** Distância padrão do LOD dos módulos de melhoria. */
const DEFAULT_LOD = 80;

/** Qualidade da fumaça: simples (Mobile/Equilibrado/Alto), volumétrica (Ultra) e cinematográfica (Ultra+). */
export type SmokeMode = 'basic' | 'volumetric' | 'cinematic';

/** Direção do vento (horizontal) compartilhada por toda a fumaça. */
const WIND_X = 0.94;
const WIND_Z = 0.34;

/** Fumaça contínua de chaminé: sprites reciclados, subindo, crescendo e sumindo. */
class Smoke {
  readonly group = new THREE.Group();
  private readonly puffs: { s: THREE.Sprite; phase: number; m: THREE.SpriteMaterial; spin: number; seed: number; side: number; lift: number }[] = [];

  constructor(
    tops: [number, number, number][],
    private readonly mode: SmokeMode = 'basic',
  ) {
    const count = mode === 'cinematic' ? 30 : mode === 'volumetric' ? 16 : 7;
    const map = mode === 'cinematic' ? cinematicSmokeTexture() : mode === 'volumetric' ? volumetricSmokeTexture() : smokeTexture();
    for (const [x, y, z] of tops) {
      for (let i = 0; i < count; i++) {
        const m = new THREE.SpriteMaterial({ map, color: '#8d8f90', transparent: true, depthWrite: false, opacity: 0 });
        const sp = new THREE.Sprite(m);
        sp.position.set(x, y, z);
        sp.userData.origin = [x, y, z];
        this.group.add(sp);
        this.puffs.push({
          s: sp,
          phase: i / count,
          m,
          spin: (Math.random() - 0.5) * 0.6,
          seed: Math.random() * 10,
          // cada partícula se abre para um lado da pluma e sobe um pouco diferente
          side: (Math.random() - 0.5) * 2,
          lift: 0.8 + Math.random() * 0.4,
        });
      }
    }
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      const [x, y, z] = p.s.userData.origin as [number, number, number];
      if (this.mode === 'cinematic') {
        // vida longa: a pluma sobe, deita com o vento e se espalha em um véu largo e ralo
        p.phase = (p.phase + dt * 0.07) % 1;
        const t = p.phase;
        const drift = Math.pow(t, 1.45) * 7.5;
        const spread = Math.pow(t, 1.2) * 2.4 * p.side;
        const turbX = Math.sin(t * 7 + p.seed) * 0.45 * t + Math.sin(t * 17 + p.seed * 2) * 0.12 * t;
        const turbZ = Math.cos(t * 6 + p.seed) * 0.4 * t;
        p.s.position.set(
          x + drift * WIND_X - spread * WIND_Z + turbX,
          y + Math.pow(t, 0.55) * 5.2 * p.lift,
          z + drift * WIND_Z + spread * WIND_X + turbZ,
        );
        const sc = 0.6 + Math.pow(t, 0.75) * 6.5;
        p.s.scale.set(sc, sc * 0.92, sc);
        p.m.rotation += p.spin * dt * 0.6;
        // sai escura e quente perto da chaminé, clareia ao subir e fica levemente azulada ao dispersar
        const c = 0.34 + t * 0.4;
        p.m.color.setRGB(c, c * 0.995, c * (0.97 + t * 0.05));
        // muitas partículas finas e sobrepostas: transições suaves, sem "bolhas" visíveis
        p.m.opacity = Math.min(1, t * 6) * Math.pow(1 - t, 1.6) * 0.52;
      } else if (this.mode === 'volumetric') {
        p.phase = (p.phase + dt * 0.11) % 1;
        const t = p.phase;
        // pluma: sobe rápido na saída e é dobrada pelo vento (deriva cresce com t^1,6), com turbulência
        const drift = Math.pow(t, 1.6);
        const turb = Math.sin(t * 9 + p.seed) * 0.25 * t;
        p.s.position.set(x + drift * 4.5 + turb, y + Math.sqrt(t) * 4.2, z + drift * 1.6 + Math.cos(t * 7 + p.seed) * 0.2 * t);
        const sc = 0.45 + Math.pow(t, 0.8) * 4.2;
        p.s.scale.set(sc, sc, sc);
        p.m.rotation += p.spin * dt;
        // sai escura e quente, clareia e se dissipa
        const c = 0.38 + t * 0.32;
        p.m.color.setRGB(c, c * 0.99, c * 0.97);
        p.m.opacity = Math.min(1, t * 8) * Math.pow(1 - t, 1.3) * 0.85;
      } else {
        p.phase = (p.phase + dt * 0.16) % 1;
        const t = p.phase;
        // sobe e é levada pelo vento, abrindo-se
        p.s.position.set(x + t * 2.2, y + t * 3.2, z + t * 0.8);
        const sc = 0.5 + t * 2.4;
        p.s.scale.set(sc, sc, sc);
        p.m.opacity = Math.sin(t * Math.PI) * 0.55;
      }
    }
  }

  dispose(): void {
    for (const p of this.puffs) p.m.dispose();
  }
}

export class BuildingVisual {
  readonly group = new THREE.Group();
  private readonly model = new THREE.Group();
  /** Corpo do modelo no nível atual (base + módulos de melhoria). */
  private readonly parts = new THREE.Group();
  /** Peças pequenas dos módulos (somem em zoom distante). */
  private readonly detail = new THREE.Group();
  private readonly scaffold: THREE.Group;
  private crane: THREE.Group | null = null;
  private readonly ring: THREE.Mesh;
  readonly hp: HealthBar;
  private readonly rally: THREE.Group;
  private moving: THREE.Group | null = null;
  private movingKind: 'spin' | 'rock' | 'saw' | null = null;
  private fields: THREE.Mesh | null = null;
  private smoke: Smoke | null = null;
  private smokeKey = '';
  private t = Math.random() * 10;
  private level = 1;
  private spec: SpecId | null = null;
  private height = 1;
  private readonly size: number;
  private readonly lod: number;
  remembered = false;

  constructor(
    readonly id: number,
    readonly type: BuildingType,
    readonly owner: number,
    friendly: boolean,
    private readonly opts: BuildingVisualOptions,
  ) {
    this.size = BUILDINGS[type].size * opts.cellSize;
    this.lod = opts.lodDistance ?? DEFAULT_LOD;
    this.group.position.set(opts.center.x, 0, opts.center.y);
    this.group.add(this.model);
    this.model.add(this.parts, this.detail);
    this.level = opts.level ?? 1;
    this.spec = opts.spec ?? null;
    const def = buildingModel(type, this.level, this.spec);
    if (def.moving) {
      this.moving = new THREE.Group();
      this.moving.position.set(...def.moving.pivot);
      for (const m of layerMeshes(def.moving.layers, owner)) this.moving.add(m);
      this.model.add(this.moving);
      this.movingKind = def.moving.kind;
    }
    if (opts.claims?.length) this.fields = buildClaimMarkers(type, opts, this.group.position);
    if (this.fields) this.group.add(this.fields);
    this.scaffold = buildScaffold(this.size, def.height);
    this.group.add(this.scaffold);
    this.ring = selectionRing(this.size * 0.72, friendly ? '#8fe0a4' : '#ff8a7a');
    this.group.add(this.ring);
    this.hp = new HealthBar(Math.min(this.size * 0.6, 2.6), def.height + 0.6);
    this.group.add(this.hp.group);
    this.applyModel(def);
    this.rally = buildRallyFlag(owner);
    this.group.userData.entityId = id;
  }

  /** Troca o modelo quando o nível ou a especialização mudam (o mesmo valor da simulação). */
  setVariant(level: number, spec: SpecId | null): void {
    if (level === this.level && spec === this.spec) return;
    this.level = level;
    this.spec = spec;
    this.applyModel(buildingModel(this.type, level, spec));
  }

  private applyModel(def: BuildingModel): void {
    // as geometrias são compartilhadas (cache por nível/especialização): só os meshes são trocados
    this.parts.clear();
    this.detail.clear();
    for (const m of layerMeshes(def.base, this.owner)) this.parts.add(m);
    if (def.detail)
      for (const m of layerMeshes(def.detail, this.owner)) {
        m.castShadow = false;
        this.detail.add(m);
      }
    this.height = def.height;
    this.hp.group.position.y = def.height + 0.6;
    const key = JSON.stringify(def.smoke ?? []);
    if (key !== this.smokeKey) {
      this.smokeKey = key;
      if (this.smoke) {
        this.smoke.group.removeFromParent();
        this.smoke.dispose();
        this.smoke = null;
      }
      if (def.smoke && this.opts.effects) {
        this.smoke = new Smoke(def.smoke, this.opts.cinematic ? 'cinematic' : this.opts.ultra ? 'volumetric' : 'basic');
        this.model.add(this.smoke.group);
      }
    }
  }

  /** O marcador de reunião é filho da cena, não do edifício. */
  get rallyObject(): THREE.Object3D {
    return this.rally;
  }

  setSelected(v: boolean): void {
    this.ring.visible = v;
  }

  update(
    dt: number,
    progress: number,
    hpFraction: number,
    showHp: boolean,
    camera: THREE.Camera,
    rally: THREE.Vector2 | null,
    showRally: boolean,
    upgrading = false,
  ): void {
    this.t += dt;
    const done = progress >= 1;
    // andaimes na construção e nas obras de melhoria; guindaste só nas melhorias
    this.scaffold.visible = !done || upgrading;
    if (upgrading && !this.crane) {
      this.crane = buildCrane(this.size, this.height);
      this.group.add(this.crane);
    }
    if (this.crane) {
      this.crane.visible = upgrading && !this.remembered;
      if (this.crane.visible) (this.crane.userData.jib as THREE.Object3D).rotation.y += dt * 0.35;
    }
    this.model.scale.y = done ? 1 : 0.12 + progress * 0.88;
    // LOD: peças pequenas só de perto
    this.detail.visible = camera.position.distanceTo(this.group.position) < this.lod;
    if (this.fields) this.fields.visible = done;
    if (this.smoke) {
      this.smoke.group.visible = done && !this.remembered;
      if (this.smoke.group.visible) this.smoke.update(dt);
    }
    if (done && this.moving && !this.remembered) {
      if (this.movingKind === 'spin') this.moving.rotation.y += dt * 0.7;
      else if (this.movingKind === 'rock') this.moving.rotation.z = Math.sin(this.t * 2.2) * 0.32;
      else if (this.movingKind === 'saw') this.moving.rotation.z += dt * 18;
    }
    this.hp.set(hpFraction);
    this.hp.group.visible = showHp && !this.remembered;
    if (showHp) this.hp.face(camera);
    this.rally.visible = showRally && rally !== null;
    if (rally) this.rally.position.set(rally.x, 0, rally.y);
  }

  dispose(): void {
    this.hp.dispose();
    this.smoke?.dispose();
    this.fields?.geometry.dispose();
    if (this.crane) this.crane.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.rally.removeFromParent();
    this.group.removeFromParent();
  }
}

/** Guindaste de obra (torre treliçada com lança giratória) para as melhorias. */
function buildCrane(size: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const material = sharedMaterial('crane', () => withFog(new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.6, metalness: 0.35 })));
  const h = Math.max(2.6, height + 1.2);
  const x = size * 0.38;
  const z = -size * 0.38;
  g.add(mesh(box(0.14, h, 0.14), material, x, h / 2, z));
  for (let y = 0.5; y < h - 0.3; y += 0.5) g.add(mesh(box(0.2, 0.03, 0.03), material, x, y, z));
  const jib = new THREE.Group();
  jib.position.set(x, h, z);
  jib.add(mesh(box(size * 0.95, 0.08, 0.08), material, -size * 0.32, 0, 0));
  jib.add(mesh(box(0.35, 0.18, 0.18), mat.metal(), size * 0.18, -0.05, 0));
  jib.add(mesh(cyl(0.01, 0.01, h * 0.55, 4), mat.metal(), -size * 0.6, -h * 0.27, 0));
  g.add(jib);
  g.userData.jib = jib;
  return g;
}

/** Marcas nas células exploradas: lavouras (fazenda), tocos (serraria), cortes (pedreira). */
function buildClaimMarkers(type: BuildingType, opts: BuildingVisualOptions, origin: THREE.Vector3): THREE.Mesh | null {
  const claims = opts.claims ?? [];
  if (!claims.length || BUILDINGS[type].gather?.terrain === null) return null;
  const b = new PartBuilder();
  const cs = opts.cellSize;
  for (const i of claims) {
    const cx = (i % opts.mapWidth) + 0.5;
    const cy = Math.floor(i / opts.mapWidth) + 0.5;
    const x = cx * cs - origin.x;
    const z = cy * cs - origin.z;
    if (type === 'farm') {
      b.box(cs * 0.94, 0.04, cs * 0.94, C.soil, [x, 0.03, z]);
      for (let r = 0; r < 4; r++) b.box(cs * 0.86, 0.1, 0.16, (i + r) % 3 === 0 ? C.cropRipe : C.crop, [x, 0.09, z - cs * 0.33 + r * cs * 0.22]);
    } else if (type === 'sawmill') {
      b.cyl(0.13, 0.15, 0.16, C.woodDark, [x + 0.3, 0.08, z - 0.2], undefined, 6);
      b.cyl(0.11, 0.13, 0.14, C.woodDark, [x - 0.35, 0.07, z + 0.3], undefined, 6);
    } else if (type === 'quarry') {
      b.box(0.5, 0.3, 0.4, C.stone, [x, 0.15, z]);
    } else if (type === 'mine') {
      b.box(0.4, 0.25, 0.35, '#7b4630', [x, 0.55, z]);
    }
  }
  if (b.isEmpty) return null;
  const m = new THREE.Mesh(b.build(), bodyMaterial());
  m.receiveShadow = true;
  return m;
}

function buildScaffold(size: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const material = sharedMaterial('scaffold', () => withFog(new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.7, metalness: 0.3 })));
  const h = Math.min(2.6, height * 0.7);
  const half = size / 2.2;
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(cyl(0.05, 0.05, h, 4), material, x * half, h / 2, z * half));
  for (const y of [h * 0.33, h * 0.66, h]) {
    g.add(mesh(box(size * 0.9, 0.05, 0.05), material, 0, y, half));
    g.add(mesh(box(size * 0.9, 0.05, 0.05), material, 0, y, -half));
    g.add(mesh(box(0.05, 0.05, size * 0.9), material, half, y, 0));
    g.add(mesh(box(0.05, 0.05, size * 0.9), material, -half, y, 0));
  }
  return g;
}

function buildRallyFlag(owner: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.03, 0.03, 1.6, 5), mat.metal(), 0, 0.8, 0, false));
  g.add(mesh(box(0.55, 0.32, 0.02), accentMaterial(owner), 0.28, 1.45, 0, false));
  g.visible = false;
  return g;
}

/**
 * Prévia de posicionamento: o edifício pronto, translúcido como um holograma, sobre uma base na
 * área ocupada — verde quando a posição é válida, vermelha quando não. A geometria é a do modelo
 * real (cache compartilhado); só os materiais pertencem à prévia.
 */
export class PlacementGhost {
  readonly group = new THREE.Group();
  private readonly base: THREE.Mesh;
  private readonly mats: THREE.MeshStandardMaterial[];
  private valid = true;

  constructor(type: BuildingType, cellSize: number, owner: number) {
    const s = BUILDINGS[type].size * cellSize;
    this.base = new THREE.Mesh(new THREE.BoxGeometry(s, 0.08, s), mat.ghostOk());
    this.base.position.y = 0.05;
    this.base.renderOrder = 5;
    this.group.add(this.base);
    const look = { transparent: true, opacity: 0.68, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.1 };
    const body = new THREE.MeshStandardMaterial({ ...look, vertexColors: true, emissive: '#2f9a52' });
    const accent = new THREE.MeshStandardMaterial({ ...look, color: factionColor(owner), emissive: '#2f9a52' });
    const glass = new THREE.MeshStandardMaterial({ ...look, color: '#4d6270', emissive: '#2f9a52' });
    this.mats = [body, accent, glass];
    const model = buildingModel(type);
    const parts: [ModelLayers, [number, number, number] | null][] = [[model.base, null]];
    if (model.detail) parts.push([model.detail, null]);
    if (model.moving) parts.push([model.moving.layers, model.moving.pivot]);
    for (const [l, at] of parts)
      for (const [geo, m] of [
        [l.body, body],
        [l.accent, accent],
        [l.glass, glass],
      ] as const) {
        if (!geo.getAttribute('position')) continue;
        const mesh = new THREE.Mesh(geo, m);
        if (at) mesh.position.set(...at);
        mesh.renderOrder = 6;
        this.group.add(mesh);
      }
  }

  setValid(ok: boolean): void {
    if (ok === this.valid) return;
    this.valid = ok;
    this.base.material = ok ? mat.ghostOk() : mat.ghostBad();
    for (const m of this.mats) m.emissive.set(ok ? '#2f9a52' : '#b8322a');
  }

  dispose(): void {
    this.base.geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.group.removeFromParent();
  }
}
