import * as THREE from 'three';
import { factionColor } from '../factions.ts';
import { withFog } from './materials.ts';

/**
 * Fronteiras no terreno, no estilo do mapa político de Rise of Nations: um tom suave da cor da
 * nação sobre o território e uma faixa contínua na borda. Reconstruído só quando o território
 * muda (o servidor envia a grade nova apenas nesses momentos).
 *
 * O tom passa pela névoa de guerra como o chão embaixo dele: sem isso, onde o chão fica quase
 * preto (fora de visão), só o azul sobrava e o território virava uma mancha azul-marinho (E3).
 * A faixa da borda continua sempre visível, como num mapa político.
 */
export class TerritoryLayer {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private readonly fill: THREE.Mesh;
  private borders: THREE.Mesh | null = null;
  private readonly borderMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly cellSize: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const W = width * cellSize;
    const H = height * cellSize;
    const geo = new THREE.PlaneGeometry(W, H);
    this.fill = new THREE.Mesh(geo, withFog(new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.position.set(W / 2, 0.06, H / 2);
    this.fill.renderOrder = 1;
    this.group.add(this.fill);
  }

  /**
   * `explored`: estado da névoa por célula (0 = nunca visto). Território em terra nunca explorada
   * não aparece (nem o tom nem a faixa), como no minimapa: a fronteira de um inimigo ainda não
   * encontrado não se revela antes da hora.
   */
  update(territory: Int8Array, explored?: ArrayLike<number>): void {
    const known = (i: number) => !explored || explored[i]! > 0;
    const { width: w, height: h, cellSize: cs } = this;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const color = new THREE.Color();
    for (let i = 0; i < territory.length; i++) {
      const o = territory[i]!;
      if (o < 0 || !known(i)) continue;
      color.set(factionColor(o));
      img.data[i * 4] = Math.round(color.r * 255);
      img.data[i * 4 + 1] = Math.round(color.g * 255);
      img.data[i * 4 + 2] = Math.round(color.b * 255);
      img.data[i * 4 + 3] = 22;
    }
    ctx.putImageData(img, 0, 0);
    this.texture.needsUpdate = true;

    // faixas de fronteira: cada aresta entre células de donos diferentes, do lado de quem é dono
    const pos: number[] = [];
    const col: number[] = [];
    const band = 0.28;
    const lift = 0.12;
    const push = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, c: THREE.Color) => {
      // quad entre a aresta e uma linha deslocada para dentro do território (normal n)
      const a = [x0, z0];
      const b = [x1, z1];
      const a2 = [x0 + nx * band, z0 + nz * band];
      const b2 = [x1 + nx * band, z1 + nz * band];
      for (const [x, z] of [a, b, b2, a, b2, a2] as [number, number][]) {
        pos.push(x, this.heightAt(x, z) + lift, z);
        col.push(c.r, c.g, c.b);
      }
    };
    const owner = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -2 : territory[y * w + x]!);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = territory[y * w + x]!;
        if (o < 0 || !known(y * w + x)) continue;
        color.set(factionColor(o));
        const X = x * cs;
        const Z = y * cs;
        if (owner(x - 1, y) !== o) push(X, Z, X, Z + cs, 1, 0, color);
        if (owner(x + 1, y) !== o) push(X + cs, Z, X + cs, Z + cs, -1, 0, color);
        if (owner(x, y - 1) !== o) push(X, Z, X + cs, Z, 0, 1, color);
        if (owner(x, y + 1) !== o) push(X, Z + cs, X + cs, Z + cs, 0, -1, color);
      }
    if (this.borders) {
      this.borders.geometry.dispose();
      this.group.remove(this.borders);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.borders = new THREE.Mesh(geo, this.borderMat);
    this.borders.renderOrder = 2;
    this.group.add(this.borders);
  }

  dispose(): void {
    this.borders?.geometry.dispose();
    this.borderMat.dispose();
    this.fill.geometry.dispose();
    (this.fill.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
