import * as THREE from 'three';

/** Até quantas células a prévia mostra (o traçado tem limite na simulação). */
const MAX = 64;

/**
 * Prévia do traçado de estrada (lote 3, seção 1): um quadrado por célula sobre o chão, verde onde
 * dá para pavimentar, cinza onde já é estrada e vermelho onde o traçado esbarra.
 */
export class RoadPreview {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor(
    private readonly cellSize: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    const geo = new THREE.PlaneGeometry(cellSize * 0.92, cellSize * 0.92).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'road-preview';
  }

  set(cells: readonly { cx: number; cy: number; state: 'ok' | 'road' | 'bad' }[]): void {
    const n = Math.min(MAX, cells.length);
    for (let i = 0; i < n; i++) {
      const c = cells[i]!;
      const x = (c.cx + 0.5) * this.cellSize;
      const z = (c.cy + 0.5) * this.cellSize;
      this.m.makeTranslation(x, this.heightAt(x, z) + 0.06, z);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(c.state === 'ok' ? '#5fd38a' : c.state === 'road' ? '#9aa3a8' : '#ff5a4a'));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Células de uma linha na grade (Bresenham, vizinhas inclusive na diagonal), até `max` células. */
export function gridLine(a: { cx: number; cy: number }, b: { cx: number; cy: number }, max: number): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  let x = a.cx;
  let y = a.cy;
  const dx = Math.abs(b.cx - a.cx);
  const dy = -Math.abs(b.cy - a.cy);
  const sx = a.cx < b.cx ? 1 : -1;
  const sy = a.cy < b.cy ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ cx: x, cy: y });
    if (out.length >= max || (x === b.cx && y === b.cy)) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}
