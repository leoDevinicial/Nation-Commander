import * as THREE from 'three';
import type { ShipmentView } from '../../../shared/sim/snapshot.ts';
import { accentMaterial, bodyMaterial, glassMaterial } from './materials.ts';
import type { ModelLayers } from './models/kit.ts';
import { cargoVehicle } from './models/logistics.ts';

/** Máximo de veículos desenhados ao mesmo tempo (os mais próximos da câmera). */
const MAX_VEHICLES = 24;
const ALTITUDE = { road: 0, rail: 0, sea: 0.05, air: 3.2 } as const;

type Mode = ShipmentView['mode'];

interface Tracked {
  group: THREE.Group;
  prev: THREE.Vector2;
  curr: THREE.Vector2;
  prevHeading: number;
  currHeading: number;
  mode: Mode;
  bob: number;
}

const modelCache = new Map<Mode, ModelLayers>();
function model(mode: Mode): ModelLayers {
  let m = modelCache.get(mode);
  if (!m) {
    m = cargoVehicle(mode);
    modelCache.set(mode, m);
  }
  return m;
}

/**
 * Logística visível (Fase 6): um veículo por embarque em trânsito no mapa — comboio de
 * caminhões, composição ferroviária, navio porta-contêineres ou helicóptero de carga — com a cor
 * da nação que despacha. Cada embarque já é um lote agregado (até a capacidade do veículo), e só
 * os mais próximos da câmera são desenhados. A rota inspecionada aparece como linha tracejada.
 */
export class CargoLayer {
  readonly group = new THREE.Group();
  private readonly tracked = new Map<number, Tracked>();
  private routeLine: THREE.Line | null = null;
  private routeFor: number | null = null;

  update(shipments: ShipmentView[], camTarget: THREE.Vector3): void {
    const onMap = shipments.filter((s) => s.state === 'moving' || s.state === 'loading' || s.state === 'waiting_capacity');
    onMap.sort((a, b) => Math.hypot(a.x - camTarget.x, a.y - camTarget.z) - Math.hypot(b.x - camTarget.x, b.y - camTarget.z));
    const shown = new Set(onMap.slice(0, MAX_VEHICLES).map((s) => s.id));
    for (const s of onMap) {
      if (!shown.has(s.id)) continue;
      let t = this.tracked.get(s.id);
      const p = new THREE.Vector2(s.x, s.y);
      if (!t) {
        const group = new THREE.Group();
        const l = model(s.mode);
        for (const [geo, mat] of [
          [l.body, bodyMaterial()],
          [l.accent, accentMaterial(s.seller < 100 ? s.seller : s.buyer)],
          [l.glass, glassMaterial()],
        ] as const) {
          if (!geo.getAttribute('position')) continue;
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = s.mode !== 'air';
          group.add(mesh);
        }
        group.userData.shipmentId = s.id;
        this.group.add(group);
        t = { group, prev: p.clone(), curr: p.clone(), prevHeading: s.heading, currHeading: s.heading, mode: s.mode, bob: Math.random() * 6 };
        this.tracked.set(s.id, t);
      } else {
        t.prev.copy(t.curr);
        t.curr.copy(p);
        t.prevHeading = t.currHeading;
        t.currHeading = s.heading;
      }
    }
    for (const [id, t] of this.tracked) {
      if (shown.has(id)) continue;
      t.group.removeFromParent();
      this.tracked.delete(id);
    }
  }

  /** Interpola as posições entre snapshots (alpha 0..1) e anima balanço/rotores. */
  frame(alpha: number, dt: number): void {
    for (const t of this.tracked.values()) {
      const x = t.prev.x + (t.curr.x - t.prev.x) * alpha;
      const y = t.prev.y + (t.curr.y - t.prev.y) * alpha;
      let dh = t.currHeading - t.prevHeading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      t.bob += dt;
      const lift = t.mode === 'sea' ? Math.sin(t.bob * 1.4) * 0.04 : t.mode === 'air' ? Math.sin(t.bob * 2) * 0.08 : 0;
      t.group.position.set(x, ALTITUDE[t.mode] + lift, y);
      t.group.rotation.y = -(t.prevHeading + dh * alpha);
      if (t.mode === 'sea') t.group.rotation.z = Math.sin(t.bob * 1.1) * 0.03;
    }
  }

  /** Linha tracejada do trajeto restante da rota inspecionada (ou nenhuma). */
  showRoute(s: ShipmentView | null): void {
    const id = s?.id ?? null;
    if (id === this.routeFor && (!s || !s.path)) return;
    this.routeLine?.geometry.dispose();
    this.routeLine?.removeFromParent();
    this.routeLine = null;
    this.routeFor = id;
    if (!s?.path || s.path.length < 2) return;
    const pts = s.path.map((p) => new THREE.Vector3(p.x, 0.35, p.y));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#f2c94c', dashSize: 0.8, gapSize: 0.5, depthTest: false, transparent: true }));
    line.computeLineDistances();
    line.renderOrder = 20;
    this.group.add(line);
    this.routeLine = line;
  }

  dispose(): void {
    this.routeLine?.geometry.dispose();
    for (const t of this.tracked.values()) t.group.removeFromParent();
    this.tracked.clear();
    this.group.removeFromParent();
  }
}

export function disposeCargoModels(): void {
  for (const m of modelCache.values()) for (const g of [m.body, m.accent, m.glass]) g.dispose();
  modelCache.clear();
}
