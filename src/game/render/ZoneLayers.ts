import * as THREE from 'three';
import { accentMaterial, bodyMaterial, glassMaterial } from './materials.ts';
import { lotModel, type LotKind } from './models/zoneLots.ts';

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
 * virados para a estrada mais próxima. Abandonados ficam escuros, sem luz nas janelas e sem a cor da nação.
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
    private readonly height: number,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly isRoad: (i: number) => boolean,
  ) {
    this.group.name = 'zone-lots';
  }

  /** Giro que vira a frente (+z) do lote para a estrada mais próxima (sul, norte, leste ou oeste). */
  private facing(i: number): number {
    const W = this.width;
    const cx = i % W;
    const cy = Math.floor(i / W);
    for (let d = 1; d <= 3; d++)
      for (const [dx, dy, rot] of [
        [0, d, 0],
        [0, -d, Math.PI],
        [d, 0, Math.PI / 2],
        [-d, 0, -Math.PI / 2],
      ] as const) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < W && y < this.height && this.isRoad(y * W + x)) return rot;
      }
    return 0;
  }

  /** `lots` em grupos de 7: célula, dono, setor, modelo, nível, abandonado, com luz. */
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
    const groups = new Map<string, { kind: LotKind; variant: number; level: number; owner: number; abandoned: boolean; cells: number[] }>();
    for (let k = 0; k + 6 < lots.length; k += 7) {
      const [i, owner, kind, variant, level, abandoned] = [lots[k]!, lots[k + 1]!, lots[k + 2]!, lots[k + 3]!, lots[k + 4]!, lots[k + 5]!];
      const g = `${kind}:${variant}:${level}:${owner}:${abandoned}`;
      let e = groups.get(g);
      if (!e) groups.set(g, (e = { kind: KINDS[kind]!, variant, level, owner, abandoned: abandoned === 1, cells: [] }));
      e.cells.push(i);
    }
    const cs = this.cellSize;
    const scale = new THREE.Vector3(cs / 2, cs / 2, cs / 2);
    const pos = new THREE.Vector3();
    for (const e of groups.values()) {
      const model = lotModel(e.kind, e.variant, e.level);
      const parts: [THREE.BufferGeometry, THREE.Material][] = [[model.body, bodyMaterial()]];
      if (!e.abandoned) parts.push([model.accent, accentMaterial(e.owner)], [model.glass, glassMaterial()]);
      for (const [geo, mat] of parts) {
        if (!geo.attributes.position) continue;
        const im = new THREE.InstancedMesh(geo, mat, e.cells.length);
        im.castShadow = true;
        im.receiveShadow = true;
        e.cells.forEach((i, n) => {
          const x = ((i % this.width) + 0.5) * cs;
          const z = (Math.floor(i / this.width) + 0.5) * cs;
          pos.set(x, this.heightAt(x, z), z);
          this.q.setFromAxisAngle(this.up, this.facing(i));
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
