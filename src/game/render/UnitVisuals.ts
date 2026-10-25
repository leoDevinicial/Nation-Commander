import * as THREE from 'three';
import { UNITS, type UnitType } from '../../../shared/sim/config.ts';
import { HealthBar, selectionRing } from './HealthBar.ts';
import { box, cyl, factionMaterial, mat, mesh, sphere } from './palette.ts';

/** Representação visual de uma unidade, ligada ao id da simulação. Sem estado de jogo próprio. */
export class UnitVisual {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  private turret: THREE.Object3D | null = null;
  private barrel: THREE.Object3D | null = null;
  private readonly ring: THREE.Mesh;
  readonly hp: HealthBar;
  private recoil = 0;
  private bob = Math.random() * 10;
  /** Posição renderizada (interpolada) no plano. */
  readonly renderPos = new THREE.Vector2();
  facing = 0;
  turretAngle = 0;

  constructor(
    readonly id: number,
    readonly type: UnitType,
    readonly owner: number,
    friendly: boolean,
  ) {
    this.group.add(this.body);
    if (type === 'tank') this.buildTank();
    else this.buildInfantry();
    this.ring = selectionRing(UNITS[type].radius + 0.25, friendly ? '#8fe0a4' : '#ff8a7a');
    this.group.add(this.ring);
    this.hp = new HealthBar(type === 'tank' ? 1.8 : 1.2, type === 'tank' ? 2.2 : 2.0);
    this.group.add(this.hp.group);
    this.group.userData.entityId = id;
  }

  private buildTank(): void {
    const base = factionMaterial(this.owner);
    const dark = factionMaterial(this.owner, 'dark');
    const hull = mesh(box(1.9, 0.55, 1.25), base, 0, 0.55, 0);
    const glacis = mesh(box(0.4, 0.35, 1.15), dark, 0.95, 0.5, 0);
    glacis.rotation.z = -0.5;
    const trackL = mesh(box(2.1, 0.45, 0.32), mat.darkMetal(), 0, 0.3, 0.62);
    const trackR = mesh(box(2.1, 0.45, 0.32), mat.darkMetal(), 0, 0.3, -0.62);
    this.body.add(hull, glacis, trackL, trackR);
    for (let i = -2; i <= 2; i++) {
      for (const side of [0.79, -0.79]) {
        const wheel = mesh(cyl(0.17, 0.17, 0.06, 8), mat.metal(), i * 0.4, 0.25, side, false);
        wheel.rotation.x = Math.PI / 2;
        this.body.add(wheel);
      }
    }
    const turret = new THREE.Group();
    turret.position.set(-0.1, 0.95, 0);
    turret.add(mesh(box(0.95, 0.4, 0.85), dark, 0, 0, 0));
    turret.add(mesh(cyl(0.12, 0.12, 0.2, 8), mat.darkMetal(), -0.25, 0.28, 0.2));
    const barrel = new THREE.Group();
    const tube = mesh(cyl(0.08, 0.09, 1.4, 8), mat.metal(), 0.7, 0, 0);
    tube.rotation.z = Math.PI / 2;
    barrel.add(tube);
    barrel.position.set(0.45, 0.02, 0);
    turret.add(barrel);
    this.body.add(turret);
    this.turret = turret;
    this.barrel = barrel;
  }

  private buildInfantry(): void {
    // esquadra de três soldados para melhor leitura à distância
    const uniform = factionMaterial(this.owner);
    const offsets: [number, number][] = [
      [0.2, 0],
      [-0.2, 0.28],
      [-0.2, -0.28],
    ];
    for (const [ox, oz] of offsets) {
      const s = new THREE.Group();
      s.position.set(ox, 0, oz);
      s.add(mesh(box(0.14, 0.42, 0.18), mat.olive(), 0, 0.21, 0));
      s.add(mesh(box(0.2, 0.36, 0.28), uniform, 0, 0.58, 0));
      s.add(mesh(sphere(0.11, 8), mat.skin(), 0, 0.86, 0));
      s.add(mesh(cyl(0.13, 0.13, 0.08, 8), mat.olive(), 0, 0.95, 0));
      const rifle = mesh(box(0.42, 0.05, 0.05), mat.darkMetal(), 0.18, 0.6, 0.12);
      s.add(rifle);
      this.body.add(s);
    }
  }

  setSelected(v: boolean): void {
    this.ring.visible = v;
  }

  onFire(): void {
    this.recoil = 1;
  }

  /** Atualiza transformações a cada frame. */
  update(dt: number, moving: boolean, aimAngle: number | null, hpFraction: number, showHp: boolean, camera: THREE.Camera): void {
    this.group.position.set(this.renderPos.x, 0, this.renderPos.y);
    // facing da simulação: ângulo no plano (x, y) → rotação em torno do eixo Y (x, z)
    this.body.rotation.y = -this.facing;
    if (this.turret) {
      const target = aimAngle === null ? 0 : -(aimAngle - this.facing);
      let diff = target - this.turretAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.turretAngle += diff * Math.min(1, dt * 6);
      this.turret.rotation.y = this.turretAngle;
    }
    if (this.barrel) this.barrel.position.x = 0.45 - this.recoil * 0.25;
    this.recoil = Math.max(0, this.recoil - dt * 4);
    if (this.type === 'infantry') {
      this.bob += dt * (moving ? 12 : 0);
      this.body.position.y = moving ? Math.abs(Math.sin(this.bob)) * 0.06 : 0;
    }
    this.hp.set(hpFraction);
    this.hp.group.visible = showHp;
    if (showHp) this.hp.face(camera);
  }

  dispose(): void {
    this.hp.dispose();
    this.group.removeFromParent();
  }
}
