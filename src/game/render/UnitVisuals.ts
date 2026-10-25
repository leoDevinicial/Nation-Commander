import * as THREE from 'three';
import { UNITS, type UnitType } from '../../../shared/sim/config.ts';
import { HealthBar, selectionRing } from './HealthBar.ts';
import { accentMaterial, bodyMaterial, glassMaterial } from './materials.ts';
import type { ModelLayers } from './models/kit.ts';
import { unitModel } from './models/unitModels.ts';

function layerMeshes(l: ModelLayers, owner: number): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const [geo, mat] of [
    [l.body, bodyMaterial()],
    [l.accent, accentMaterial(owner)],
    [l.glass, glassMaterial()],
  ] as const) {
    if (!geo.getAttribute('position')) continue;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}

/** Representação visual de uma unidade, ligada ao id da simulação. Sem estado de jogo próprio. */
export class UnitVisual {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  private turret: THREE.Group | null = null;
  private readonly ring: THREE.Mesh;
  readonly hp: HealthBar;
  private recoil = 0;
  private bob = Math.random() * 10;
  private readonly muzzleLocal: THREE.Vector3;
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
    const model = unitModel(type);
    this.group.add(this.body);
    for (const m of layerMeshes(model.hull, owner)) this.body.add(m);
    if (model.turret) {
      this.turret = new THREE.Group();
      this.turret.position.set(...model.turretPivot);
      for (const m of layerMeshes(model.turret, owner)) this.turret.add(m);
      this.body.add(this.turret);
    }
    this.muzzleLocal = new THREE.Vector3(...model.muzzle);
    this.ring = selectionRing(UNITS[type].radius + 0.3, friendly ? '#8fe0a4' : '#ff8a7a');
    this.group.add(this.ring);
    const vehicle = type !== 'infantry';
    this.hp = new HealthBar(vehicle ? 1.8 : 1.2, type === 'artillery' ? 2.4 : vehicle ? 2.1 : 1.6);
    this.group.add(this.hp.group);
    this.group.userData.entityId = id;
  }

  setSelected(v: boolean): void {
    this.ring.visible = v;
  }

  onFire(): void {
    this.recoil = 1;
  }

  /** Posição de mundo da boca do cano (para efeitos de disparo). */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const parent = this.turret ?? this.body;
    parent.updateWorldMatrix(true, false);
    return out.copy(this.muzzleLocal).applyMatrix4(parent.matrixWorld);
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
      this.turretAngle += diff * Math.min(1, dt * 5);
      this.turret.rotation.y = this.turretAngle;
      this.turret.position.x = unitModel(this.type).turretPivot[0] - this.recoil * 0.08;
    }
    this.recoil = Math.max(0, this.recoil - dt * 4);
    if (this.type === 'infantry') {
      this.bob += dt * (moving ? 12 : 0);
      this.body.position.y = moving ? Math.abs(Math.sin(this.bob)) * 0.05 : 0;
    } else if (moving) {
      // leve balanço do chassi em movimento
      this.bob += dt * 9;
      this.body.rotation.z = Math.sin(this.bob) * 0.015;
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
