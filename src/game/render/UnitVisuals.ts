import * as THREE from 'three';
import { UNITS, type UnitType } from '../../../shared/sim/config.ts';
import { HealthBar, selectionRing } from './HealthBar.ts';
import { accentMaterial, bodyMaterial, glassMaterial } from './materials.ts';
import type { ModelLayers } from './models/kit.ts';
import { unitModel } from './models/unitModels.ts';
import type { ModId } from '../../../shared/sim/modernization.ts';
import { sharedGeometry, sharedMaterial } from './palette.ts';

const plateMat = () => sharedMaterial('mod-plate', () => new THREE.MeshStandardMaterial({ color: '#4b5143', roughness: 0.85, metalness: 0.25 }));
const darkMat = () => sharedMaterial('mod-dark', () => new THREE.MeshStandardMaterial({ color: '#23272b', roughness: 0.6, metalness: 0.4 }));
const lensMat = () => sharedMaterial('mod-lens', () => new THREE.MeshStandardMaterial({ color: '#1b2c36', roughness: 0.15, metalness: 0.7, emissive: '#2a6d8f', emissiveIntensity: 0.6 }));
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** Comprimento de um ciclo de passada dos soldados (unidades do mundo). */
const STRIDE = 1.1;
const box = (key: string, w: number, h: number, d: number) => sharedGeometry(`mod-box-${key}`, () => new THREE.BoxGeometry(w, h, d));

/**
 * Peças visíveis de cada pacote de modernização (Fase 5): saias de blindagem, mastro de rádio,
 * caixa de sensores, escapamento do motor novo e placa de colete. O equipamento de cada unidade
 * fica reconhecível em campo, mesmo sem selecioná-la.
 */
function equipmentParts(type: UnitType, mods: readonly ModId[], radius: number, turretTop: [number, number, number] | null): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const vehicle = UNITS[type].armor === 'vehicle';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    out.push(m);
    return m;
  };
  for (const id of mods) {
    if (id === 'composite_armor' && vehicle) {
      const len = radius * 1.7;
      for (const side of [-1, 1]) add(box(`skirt-${type}`, len, 0.26, 0.07), plateMat(), 0, 0.42, side * radius * 0.92);
    } else if (id === 'body_armor' && !vehicle) {
      add(box('vest', 0.2, 0.22, 0.3), plateMat(), 0, 0.72, 0);
    } else if (id === 'digital_radio') {
      const h = vehicle ? 1.0 : 0.5;
      const mast = add(sharedGeometry(`mod-mast-${h}`, () => new THREE.CylinderGeometry(0.018, 0.024, h, 5)), darkMat(), vehicle ? -radius * 0.6 : -0.12, (vehicle ? 0.8 : 0.85) + h / 2, vehicle ? radius * 0.45 : 0.08);
      mast.castShadow = false;
    } else if (id === 'thermal_optics' && vehicle) {
      const [x, y, z] = turretTop ?? [radius * 0.2, 0.9, 0];
      add(box('optic', 0.24, 0.16, 0.2), darkMat(), x, y + 0.1, z - 0.22);
      add(box('lens', 0.03, 0.09, 0.12), lensMat(), x + 0.13, y + 0.1, z - 0.22);
    } else if (id === 'efficient_engine' && vehicle) {
      for (const side of [-1, 1]) add(box('exhaust', 0.12, 0.12, 0.1), darkMat(), -radius * 0.98, 0.62, side * radius * 0.35);
    } else if (id === 'guided_munitions' && vehicle) {
      add(box('fcs', 0.14, 0.1, 0.14), lensMat(), radius * 0.35, 0.95, radius * 0.3);
    }
  }
  return out;
}

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
  private equipment = new THREE.Group();
  private equipmentKey = '';
  private readonly refitRing: THREE.Mesh;
  private refitPulse = 0;
  /** Esteiras, rodas e pernas (giram/balançam com a distância percorrida). */
  private treadTop: THREE.Mesh | null = null;
  private treadBottom: THREE.Mesh | null = null;
  private readonly wheelSets: { mesh: THREE.InstancedMesh; at: [number, number, number][]; r: number }[] = [];
  private readonly legSets: { mesh: THREE.InstancedMesh; hips: [number, number, number][] }[] = [];
  /** Distância percorrida (para frente, em unidades do mundo) e ritmo atual da passada. */
  private travel = 0;
  private gait = 0;
  private readonly lastPos = new THREE.Vector2(NaN, NaN);

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
    // anel âmbar pulsante: unidade parada na instalação recebendo um pacote
    this.refitRing = selectionRing(UNITS[type].radius + 0.55, '#f0b84a');
    this.group.add(this.refitRing);
    this.body.add(this.equipment);
    this.buildMotion(model.motion);
    const vehicle = UNITS[type].armor === 'vehicle';
    this.hp = new HealthBar(vehicle ? 1.8 : 1.2, type === 'artillery' || type === 'rocket_artillery' ? 2.4 : type === 'mbt' ? 2.3 : vehicle ? 2.1 : 1.6);
    this.group.add(this.hp.group);
    this.group.userData.entityId = id;
  }

  private buildMotion(motion: ReturnType<typeof unitModel>['motion']): void {
    const mat = bodyMaterial();
    if (motion.treads) {
      this.treadTop = new THREE.Mesh(motion.treads.top, mat);
      this.treadBottom = new THREE.Mesh(motion.treads.bottom, mat);
      for (const m of [this.treadTop, this.treadBottom]) {
        m.castShadow = true;
        this.body.add(m);
      }
    }
    for (const w of motion.wheels) {
      const mesh = new THREE.InstancedMesh(w.geo, mat, w.at.length);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.body.add(mesh);
      this.wheelSets.push({ mesh, at: w.at, r: w.r });
    }
    for (const l of motion.legs) {
      const mesh = new THREE.InstancedMesh(l.geo, mat, l.hips.length);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.body.add(mesh);
      this.legSets.push({ mesh, hips: l.hips });
    }
    this.poseMotion(0);
  }

  /**
   * Posiciona esteiras, rodas e pernas para a distância percorrida: o ramo superior da esteira
   * corre para a frente e o inferior para trás (fica parado em relação ao chão), cada roda gira
   * d/r e as pernas alternam a passada (soldados da mesma esquadra levemente fora de sincronia).
   */
  private poseMotion(gait: number): void {
    const pitch = unitModel(this.type).motion.treads?.pitch ?? 1;
    const shift = ((this.travel % pitch) + pitch) % pitch;
    if (this.treadTop) this.treadTop.position.x = shift;
    if (this.treadBottom) this.treadBottom.position.x = -shift;
    for (const w of this.wheelSets) {
      tmpQ.setFromAxisAngle(Z_AXIS, -this.travel / w.r);
      for (let i = 0; i < w.at.length; i++) w.mesh.setMatrixAt(i, tmpM.compose(tmpV.set(...w.at[i]!), tmpQ, ONE));
      w.mesh.instanceMatrix.needsUpdate = true;
    }
    const stride = (this.travel / STRIDE) * Math.PI * 2;
    for (const l of this.legSets) {
      for (let i = 0; i < l.hips.length; i++) {
        const soldier = i >> 1;
        const swing = Math.sin(stride + soldier * 1.3 + (i & 1) * Math.PI) * 0.6 * gait;
        tmpQ.setFromAxisAngle(Z_AXIS, swing);
        l.mesh.setMatrixAt(i, tmpM.compose(tmpV.set(...l.hips[i]!), tmpQ, ONE));
      }
      l.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setSelected(v: boolean): void {
    this.ring.visible = v;
  }

  /** Mostra as peças dos pacotes instalados e se a unidade está em modernização. */
  setEquipment(mods: readonly ModId[], refitting: boolean): void {
    this.refitRing.visible = refitting;
    const key = mods.join(',');
    if (key === this.equipmentKey) return;
    this.equipmentKey = key;
    this.equipment.clear();
    const model = unitModel(this.type);
    const top: [number, number, number] | null = model.turret ? [model.turretPivot[0], model.turretPivot[1] + 0.25, model.turretPivot[2]] : null;
    for (const part of equipmentParts(this.type, mods, UNITS[this.type].radius, top)) this.equipment.add(part);
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
    if (this.refitRing.visible) {
      this.refitPulse += dt * 3;
      (this.refitRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(this.refitPulse);
    }
    // deslocamento real neste quadro, no sentido da frente da unidade (dá ré: valor negativo)
    let step = 0;
    if (!Number.isNaN(this.lastPos.x)) {
      const dx = this.renderPos.x - this.lastPos.x;
      const dy = this.renderPos.y - this.lastPos.y;
      if (dx * dx + dy * dy < 9) step = dx * Math.cos(this.facing) + dy * Math.sin(this.facing);
    }
    this.lastPos.copy(this.renderPos);
    const going = moving && Math.abs(step) > 1e-4;
    this.gait += ((going ? 1 : 0) - this.gait) * Math.min(1, dt * 8);
    if (step !== 0 || this.gait > 0.01) {
      this.travel += step;
      this.poseMotion(this.gait);
    }
    if (UNITS[this.type].armor === 'infantry') {
      // marcha: o corpo sobe a cada passo e inclina um pouco para a frente
      const stride = (this.travel / STRIDE) * Math.PI * 2;
      this.body.position.y = Math.abs(Math.sin(stride)) * 0.06 * this.gait;
      this.body.rotation.z = -0.08 * this.gait;
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
    for (const w of this.wheelSets) w.mesh.dispose();
    for (const l of this.legSets) l.mesh.dispose();
    this.hp.dispose();
    this.group.removeFromParent();
  }
}
