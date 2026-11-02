import * as THREE from 'three';
import { accentMaterial, bodyMaterial, glassMaterial } from './materials.ts';
import { lotBackModel, lotModel, type LotKind } from './models/zoneLots.ts';

/** Giro do lote (frente +z) para o lado da rua: sul, norte, leste, oeste. */
const FACE_ROT = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

const KINDS: LotKind[] = ['res', 'com', 'ind'];
/** Cores das zonas pintadas (como no Cities: verde, azul, amarelo). */
export const ZONE_COLORS: Record<LotKind, string> = { res: '#5fc46a', com: '#4f8fe0', ind: '#e0b43c' };

/**
 * Zonas pintadas (só as do próprio jogador): um quadrado translúcido por célula sem lote, na cor do setor. Fica
 * discreto no jogo e forte com a ferramenta de zoneamento aberta.
 */
export class ZoneOverlay {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private key = '';

  constructor(
    private readonly cellSize: number,
    private readonly width: number,
    private readonly heightAt: (x: number, z: number) => number,
    max = 4096,
  ) {
    const geo = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'zones';
  }

  /** Destaca as zonas (ferramenta aberta) ou deixa discretas. */
  setStrong(on: boolean): void {
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = on ? 0.5 : 0.18;
  }

  /** `zones` em pares (célula, setor 0..2); `lots` diz quais células já têm lote (não mostram a zona). */
  set(zones: readonly number[], hasLot: (i: number) => boolean): void {
    const key = zones.join(',');
    if (key === this.key) return;
    this.key = key;
    let n = 0;
    for (let k = 0; k + 1 < zones.length && n < this.mesh.instanceMatrix.count; k += 2) {
      const i = zones[k]!;
      if (hasLot(i)) continue;
      const x = ((i % this.width) + 0.5) * this.cellSize;
      const z = (Math.floor(i / this.width) + 0.5) * this.cellSize;
      this.m.makeTranslation(x, this.heightAt(x, z) + 0.07, z);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.c.set(ZONE_COLORS[KINDS[zones[k + 1]!]!]));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}

/**
 * Lotes privados (casas, prédios, lojas e indústrias): desenhados em lote (InstancedMesh por modelo, dono e camada),
 * virados para a rua em que encostam; o lote fundo ganha a parte de trás (construção mais comprida). Abandonados ficam escuros, sem luz nas janelas e sem a cor da nação.
 */
export class LotLayer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private key = '';
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly cellSize: number,
    private readonly width: number,
    _height: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    void _height;
    this.group.name = 'zone-lots';
  }

  /** `lots` em grupos de 9: célula da frente, dono, setor, modelo, nível, abandonado, com luz, lado da rua, fundo. */
  set(lots: readonly number[]): void {
    const key = lots.join(',');
    if (key === this.key) return;
    this.key = key;
    for (const m of this.meshes) {
      m.dispose();
      m.removeFromParent();
    }
    this.meshes = [];
    // agrupa por modelo e dono; abandonado vira um grupo próprio (sem vidro aceso nem cor da nação)
    // (o lote fundo desenha também a parte de trás, no mesmo lugar e giro da frente)
    const groups = new Map<string, { kind: LotKind; variant: number; level: number; owner: number; abandoned: boolean; back: boolean; cells: [number, number][] }>();
    for (let k = 0; k + 8 < lots.length; k += 9) {
      const [i, owner, kind, variant, level, abandoned, , face, back] = lots.slice(k, k + 9) as number[];
      for (const part of back! >= 0 ? [false, true] : [false]) {
        const g = `${kind}:${variant}:${level}:${owner}:${abandoned}:${part}`;
        let e = groups.get(g);
        if (!e) groups.set(g, (e = { kind: KINDS[kind!]!, variant: variant!, level: level!, owner: owner!, abandoned: abandoned === 1, back: part, cells: [] }));
        e.cells.push([i!, face!]);
      }
    }
    const cs = this.cellSize;
    const scale = new THREE.Vector3(cs / 2, cs / 2, cs / 2);
    const pos = new THREE.Vector3();
    for (const e of groups.values()) {
      const model = e.back ? lotBackModel(e.kind, e.variant, e.level) : lotModel(e.kind, e.variant, e.level);
      const parts: [THREE.BufferGeometry, THREE.Material][] = [[model.body, bodyMaterial()]];
      if (!e.abandoned) parts.push([model.accent, accentMaterial(e.owner)], [model.glass, glassMaterial()]);
      for (const [geo, mat] of parts) {
        if (!geo.attributes.position) continue;
        const im = new THREE.InstancedMesh(geo, mat, e.cells.length);
        im.castShadow = true;
        im.receiveShadow = true;
        e.cells.forEach(([i, face], n) => {
          const x = ((i % this.width) + 0.5) * cs;
          const z = (Math.floor(i / this.width) + 0.5) * cs;
          pos.set(x, this.heightAt(x, z), z);
          this.q.setFromAxisAngle(this.up, FACE_ROT[face] ?? 0);
          this.m.compose(pos, this.q, scale);
          im.setMatrixAt(n, this.m);
          if (e.abandoned) im.setColorAt(n, new THREE.Color(0.42, 0.4, 0.38));
        });
        im.instanceMatrix.needsUpdate = true;
        this.group.add(im);
        this.meshes.push(im);
      }
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    this.meshes = [];
    this.group.removeFromParent();
  }
}
