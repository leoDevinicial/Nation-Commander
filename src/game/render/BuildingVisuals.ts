import * as THREE from 'three';
import { BUILDINGS, type BuildingType } from '../../../shared/sim/config.ts';
import { HealthBar, selectionRing } from './HealthBar.ts';
import { accentMaterial, bodyMaterial, glassMaterial, withFog } from './materials.ts';
import { buildingModel } from './models/buildingModels.ts';
import { C, PartBuilder, type ModelLayers } from './models/kit.ts';
import { box, cyl, mat, mesh, sharedMaterial } from './palette.ts';

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
}

export class BuildingVisual {
  readonly group = new THREE.Group();
  private readonly model = new THREE.Group();
  private readonly scaffold: THREE.Group;
  private readonly ring: THREE.Mesh;
  readonly hp: HealthBar;
  private readonly rally: THREE.Group;
  private moving: THREE.Group | null = null;
  private movingKind: 'spin' | 'rock' | 'saw' | null = null;
  private fields: THREE.Mesh | null = null;
  private t = Math.random() * 10;
  remembered = false;

  constructor(
    readonly id: number,
    readonly type: BuildingType,
    readonly owner: number,
    friendly: boolean,
    opts: BuildingVisualOptions,
  ) {
    const size = BUILDINGS[type].size * opts.cellSize;
    this.group.position.set(opts.center.x, 0, opts.center.y);
    this.group.add(this.model);
    const def = buildingModel(type);
    for (const m of layerMeshes(def.base, owner)) this.model.add(m);
    if (def.moving) {
      this.moving = new THREE.Group();
      this.moving.position.set(...def.moving.pivot);
      for (const m of layerMeshes(def.moving.layers, owner)) this.moving.add(m);
      this.model.add(this.moving);
      this.movingKind = def.moving.kind;
    }
    if (opts.claims?.length) this.fields = buildClaimMarkers(type, opts, this.group.position);
    if (this.fields) this.group.add(this.fields);
    this.scaffold = buildScaffold(size, def.height);
    this.group.add(this.scaffold);
    this.ring = selectionRing(size * 0.72, friendly ? '#8fe0a4' : '#ff8a7a');
    this.group.add(this.ring);
    this.hp = new HealthBar(Math.min(size * 0.6, 2.6), def.height + 0.6);
    this.group.add(this.hp.group);
    this.rally = buildRallyFlag(owner);
    this.group.userData.entityId = id;
  }

  /** O marcador de reunião é filho da cena, não do edifício. */
  get rallyObject(): THREE.Object3D {
    return this.rally;
  }

  setSelected(v: boolean): void {
    this.ring.visible = v;
  }

  update(dt: number, progress: number, hpFraction: number, showHp: boolean, camera: THREE.Camera, rally: THREE.Vector2 | null, showRally: boolean): void {
    this.t += dt;
    const done = progress >= 1;
    this.scaffold.visible = !done;
    this.model.scale.y = done ? 1 : 0.12 + progress * 0.88;
    if (this.fields) this.fields.visible = done;
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
    this.fields?.geometry.dispose();
    this.rally.removeFromParent();
    this.group.removeFromParent();
  }
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

/** Fantasma de posicionamento de construção. */
export function buildGhost(type: BuildingType, cellSize: number): THREE.Mesh {
  const s = BUILDINGS[type].size * cellSize;
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, 1.2, s), mat.ghostOk());
  m.position.y = 0.6;
  m.renderOrder = 5;
  return m;
}
