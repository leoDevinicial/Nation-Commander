import * as THREE from 'three';
import { BUILDINGS, type BuildingType } from '../../../shared/sim/config.ts';
import { HealthBar, selectionRing } from './HealthBar.ts';
import { box, cyl, factionMaterial, mat, mesh, sharedGeometry, sharedMaterial } from './palette.ts';

export class BuildingVisual {
  readonly group = new THREE.Group();
  private readonly model = new THREE.Group();
  private readonly scaffold: THREE.Group;
  private readonly ring: THREE.Mesh;
  readonly hp: HealthBar;
  private readonly rally: THREE.Group;
  private spin: THREE.Object3D | null = null;
  private pump: THREE.Object3D | null = null;
  private t = Math.random() * 10;

  constructor(
    readonly id: number,
    readonly type: BuildingType,
    readonly owner: number,
    friendly: boolean,
    center: THREE.Vector2,
    cellSize: number,
  ) {
    const size = BUILDINGS[type].size * cellSize;
    this.group.position.set(center.x, 0, center.y);
    this.group.add(this.model);
    // laje de fundação
    this.group.add(mesh(box(size - 0.1, 0.14, size - 0.1), mat.concreteDark(), 0, 0.07, 0, false));
    switch (type) {
      case 'hq':
        this.buildHQ(size);
        break;
      case 'barracks':
        this.buildBarracks(size);
        break;
      case 'factory':
        this.buildFactory(size);
        break;
      case 'extractor':
        this.buildExtractor();
        break;
    }
    this.scaffold = this.buildScaffold(size);
    this.group.add(this.scaffold);
    this.ring = selectionRing(size * 0.75, friendly ? '#8fe0a4' : '#ff8a7a');
    this.group.add(this.ring);
    this.hp = new HealthBar(size * 0.8, type === 'hq' ? 5.4 : 4);
    this.group.add(this.hp.group);
    this.rally = this.buildRallyFlag();
    this.group.userData.entityId = id;
  }

  private buildHQ(size: number): void {
    const base = factionMaterial(this.owner);
    const m = this.model;
    m.add(mesh(box(size * 0.85, 1.6, size * 0.85), mat.concrete(), 0, 0.95, 0));
    m.add(mesh(box(size * 0.86, 0.22, size * 0.86), base, 0, 1.8, 0));
    m.add(mesh(box(size * 0.5, 1.4, size * 0.5), mat.concrete(), -0.6, 2.6, -0.6));
    m.add(mesh(box(size * 0.52, 0.2, size * 0.52), base, -0.6, 3.35, -0.6));
    for (const z of [-1.2, 0, 1.2]) m.add(mesh(box(0.05, 0.4, 0.7), mat.glass(), size * 0.43, 1.1, z, false));
    const mast = mesh(cyl(0.06, 0.08, 2.2, 6), mat.metal(), -0.6, 4.5, -0.6);
    m.add(mast);
    const dish = new THREE.Group();
    dish.position.set(1.2, 2.2, 1.2);
    const plate = mesh(sharedGeometry('dish', () => new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3)), mat.metal(), 0, 0, 0);
    plate.rotation.x = Math.PI * 0.7;
    dish.add(mesh(cyl(0.08, 0.08, 0.6, 6), mat.metal(), 0, -0.3, 0), plate);
    m.add(dish);
    this.spin = dish;
    const flag = mesh(box(0.9, 0.5, 0.04), base, -0.15, 5.2, -0.6, false);
    m.add(flag);
    // canhão de defesa
    const gun = new THREE.Group();
    gun.position.set(1.3, 1.95, -1.2);
    gun.add(mesh(cyl(0.35, 0.4, 0.3, 8), mat.darkMetal(), 0, 0, 0));
    const tube = mesh(cyl(0.07, 0.07, 1, 6), mat.metal(), 0.5, 0.1, 0);
    tube.rotation.z = Math.PI / 2;
    gun.add(tube);
    m.add(gun);
  }

  private buildBarracks(size: number): void {
    const base = factionMaterial(this.owner);
    const m = this.model;
    m.add(mesh(box(size * 0.85, 1.1, size * 0.6), mat.concrete(), 0, 0.7, 0));
    const roof = mesh(sharedGeometry('roof', () => new THREE.CylinderGeometry(0.01, 1, 1, 4, 1)), base, 0, 1.55, 0);
    roof.scale.set(size * 0.62, 0.7, size * 0.45);
    roof.rotation.y = Math.PI / 4;
    m.add(roof);
    m.add(mesh(box(0.5, 0.75, 0.05), mat.darkMetal(), 0, 0.55, size * 0.3, false));
    const pole = mesh(cyl(0.04, 0.04, 2.4, 6), mat.metal(), size * 0.38, 1.2, size * 0.38);
    m.add(pole, mesh(box(0.6, 0.35, 0.03), base, size * 0.38 + 0.3, 2.2, size * 0.38, false));
  }

  private buildFactory(size: number): void {
    const base = factionMaterial(this.owner);
    const m = this.model;
    m.add(mesh(box(size * 0.88, 1.5, size * 0.75), mat.concreteDark(), 0, 0.9, 0.1));
    for (let i = 0; i < 3; i++) {
      const saw = mesh(box(size * 0.28, 0.4, size * 0.72), base, -size * 0.3 + i * size * 0.3, 1.85, 0.1);
      saw.rotation.z = 0.35;
      m.add(saw);
    }
    m.add(mesh(cyl(0.22, 0.28, 2.4, 8), mat.metal(), size * 0.32, 2.4, -size * 0.32));
    m.add(mesh(cyl(0.18, 0.24, 1.9, 8), mat.metal(), size * 0.12, 2.1, -size * 0.34));
    m.add(mesh(box(1.4, 1, 0.05), mat.darkMetal(), 0, 0.65, size * 0.48, false));
  }

  private buildExtractor(): void {
    const base = factionMaterial(this.owner);
    const m = this.model;
    m.add(mesh(cyl(0.7, 0.8, 1, 10), mat.metal(), -0.7, 0.6, 0.7));
    m.add(mesh(cyl(0.72, 0.72, 0.12, 10), base, -0.7, 1.12, 0.7));
    const tower = new THREE.Group();
    tower.position.set(0.6, 0, -0.5);
    for (const [x, z] of [
      [-0.35, -0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35],
    ] as const) {
      const leg = mesh(cyl(0.05, 0.05, 2.6, 5), mat.darkMetal(), x * 0.6, 1.3, z * 0.6);
      leg.rotation.set(z * 0.25, 0, -x * 0.25);
      tower.add(leg);
    }
    tower.add(mesh(box(0.5, 0.18, 0.5), base, 0, 2.6, 0));
    const piston = mesh(cyl(0.08, 0.08, 1.4, 6), mat.metal(), 0, 1.4, 0);
    tower.add(piston);
    this.pump = piston;
    m.add(tower);
  }

  private buildScaffold(size: number): THREE.Group {
    const g = new THREE.Group();
    const material = sharedMaterial('scaffold', () => new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.7, metalness: 0.3 }));
    const h = 2.4;
    for (const x of [-1, 1])
      for (const z of [-1, 1]) g.add(mesh(cyl(0.05, 0.05, h, 4), material, (x * size) / 2.2, h / 2, (z * size) / 2.2));
    for (const y of [0.8, 1.6, 2.4]) {
      g.add(mesh(box(size * 0.9, 0.05, 0.05), material, 0, y, size / 2.2));
      g.add(mesh(box(size * 0.9, 0.05, 0.05), material, 0, y, -size / 2.2));
      g.add(mesh(box(0.05, 0.05, size * 0.9), material, size / 2.2, y, 0));
      g.add(mesh(box(0.05, 0.05, size * 0.9), material, -size / 2.2, y, 0));
    }
    return g;
  }

  private buildRallyFlag(): THREE.Group {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.03, 0.03, 1.6, 5), mat.metal(), 0, 0.8, 0, false));
    g.add(mesh(box(0.55, 0.32, 0.02), factionMaterial(this.owner), 0.28, 1.45, 0, false));
    g.visible = false;
    return g;
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
    this.model.scale.y = done ? 1 : 0.15 + progress * 0.85;
    if (done && this.spin) this.spin.rotation.y += dt * 0.6;
    if (done && this.pump) this.pump.position.y = 1.4 + Math.sin(this.t * 2.5) * 0.35;
    this.hp.set(hpFraction);
    this.hp.group.visible = showHp;
    if (showHp) this.hp.face(camera);
    this.rally.visible = showRally && rally !== null;
    if (rally) this.rally.position.set(rally.x, 0, rally.y);
  }

  dispose(): void {
    this.hp.dispose();
    this.rally.removeFromParent();
    this.group.removeFromParent();
  }
}

/** Fantasma de posicionamento de construção. */
export function buildGhost(type: BuildingType, cellSize: number): THREE.Mesh {
  const s = BUILDINGS[type].size * cellSize;
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, 1.2, s), mat.ghostOk());
  m.position.y = 0.6;
  m.renderOrder = 5;
  return m;
}
