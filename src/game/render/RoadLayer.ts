import * as THREE from 'three';
import { withFog } from './materials.ts';
import { layers, type PartBuilder } from './models/kit.ts';

const ASPHALT = '#1f2227';
const SIDEWALK = '#8e8b84';
const CURB = '#c3bfb5';
const PAINT = '#efeee8';

/** Largura da calçada (com meio-fio) nas bordas sem estrada vizinha, em fração da célula. */
const SIDEWALK_FRAC = 0.15;

/**
 * Estradas construídas pelos jogadores (lote 3, seção 1), desenhadas como peças de asfalto por
 * célula que se encaixam sozinhas pelas vizinhas (N, L, S, O):
 * - reta: faixa central tracejada e calçada com meio-fio dos dois lados;
 * - curva: a faixa central dobra de uma saída para a outra;
 * - fim de linha: a faixa vai só até a saída;
 * - cruzamento em T ou em cruz: faixas de pedestres em cada saída e calçada nos cantos.
 * A estrada de terra que o mapa gera conta como vizinha (o asfalto encosta nela sem calçada).
 * A malha inteira é refeita quando o conjunto de estradas muda (acontece pouco).
 */
export class RoadLayer {
  readonly mesh: THREE.Mesh;

  constructor(
    private readonly cellSize: number,
    private readonly width: number,
    private readonly height: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    // material próprio: asfalto fosco com pouco desgaste (o dos edifícios suja demais e puxa para o marrom)
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.4 }), { weather: 0.25 }));
    this.mesh.receiveShadow = true;
    this.mesh.name = 'player-roads';
  }

  /**
   * Refaz as peças. `paved` são as células com asfalto do jogador; `isRoad` diz se uma célula é
   * estrada de qualquer tipo (inclusive a de terra do mapa), para o encaixe.
   */
  set(paved: ReadonlySet<number>, isRoad: (i: number) => boolean): void {
    const l = layers();
    const b = l.body;
    const W = this.width;
    const road = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < W && cy < this.height && isRoad(cy * W + cx);
    for (const i of paved) {
      const cx = i % W;
      const cy = Math.floor(i / W);
      this.tile(b, cx, cy, { n: road(cx, cy - 1), s: road(cx, cy + 1), w: road(cx - 1, cy), e: road(cx + 1, cy) }, {
        nw: road(cx - 1, cy - 1),
        ne: road(cx + 1, cy - 1),
        sw: road(cx - 1, cy + 1),
        se: road(cx + 1, cy + 1),
      });
    }
    const geo = l.build().body;
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  private tile(b: PartBuilder, cx: number, cy: number, c: { n: boolean; s: boolean; w: boolean; e: boolean }, d: { nw: boolean; ne: boolean; sw: boolean; se: boolean }): void {
    const cs = this.cellSize;
    const half = cs / 2;
    const x = (cx + 0.5) * cs;
    const z = (cy + 0.5) * cs;
    // a placa fica um pouco acima do ponto mais alto do chão na célula e desce como saia
    const inset = half * 0.85;
    const h = Math.max(this.heightAt(x, z), this.heightAt(x - inset, z - inset), this.heightAt(x + inset, z - inset), this.heightAt(x - inset, z + inset), this.heightAt(x + inset, z + inset)) + 0.03;
    b.box(cs, 0.16, cs, ASPHALT, [x, h - 0.07, z]);

    const sw = cs * SIDEWALK_FRAC;
    const top = h + 0.012;
    const walk = (w: number, dz: number, px: number, pz: number) => {
      b.box(w, 0.06, dz, SIDEWALK, [px, h + 0.03, pz]);
    };
    // calçadas e meio-fio nas bordas sem vizinha (comprimento total da borda)
    if (!c.n) {
      walk(cs, sw, x, z - half + sw / 2);
      b.box(cs, 0.07, 0.05, CURB, [x, h + 0.035, z - half + sw]);
    }
    if (!c.s) {
      walk(cs, sw, x, z + half - sw / 2);
      b.box(cs, 0.07, 0.05, CURB, [x, h + 0.035, z + half - sw]);
    }
    if (!c.w) {
      walk(sw, cs, x - half + sw / 2, z);
      b.box(0.05, 0.07, cs, CURB, [x - half + sw, h + 0.035, z]);
    }
    if (!c.e) {
      walk(sw, cs, x + half - sw / 2, z);
      b.box(0.05, 0.07, cs, CURB, [x + half - sw, h + 0.035, z]);
    }
    // cantos de calçada onde duas saídas vizinhas se encontram (curva, T e cruz)
    const corner = (sx: number, sz: number) => walk(sw, sw, x + sx * (half - sw / 2), z + sz * (half - sw / 2));
    if (c.n && c.w && !d.nw) corner(-1, -1);
    if (c.n && c.e && !d.ne) corner(1, -1);
    if (c.s && c.w && !d.sw) corner(-1, 1);
    if (c.s && c.e && !d.se) corner(1, 1);

    // pintura
    const exits = [c.n, c.s, c.w, c.e].filter(Boolean).length;
    const dashL = cs * 0.2;
    const dashW = 0.07;
    const dashNS = (dz: number) => b.box(dashW, 0.01, dashL, PAINT, [x, top, z + dz]);
    const dashWE = (dx: number) => b.box(dashL, 0.01, dashW, PAINT, [x + dx, top, z]);
    if (exits >= 3) {
      // faixas de pedestres em cada saída
      const lane = cs - 2 * sw - 0.16;
      const n = 5;
      const stripe = lane / (n * 2 - 1);
      const off = half - cs * 0.17;
      for (let k = 0; k < n; k++) {
        const t = -lane / 2 + stripe / 2 + k * stripe * 2;
        if (c.n) b.box(stripe, 0.01, cs * 0.16, PAINT, [x + t, top, z - off]);
        if (c.s) b.box(stripe, 0.01, cs * 0.16, PAINT, [x + t, top, z + off]);
        if (c.w) b.box(cs * 0.16, 0.01, stripe, PAINT, [x - off, top, z + t]);
        if (c.e) b.box(cs * 0.16, 0.01, stripe, PAINT, [x + off, top, z + t]);
      }
      return;
    }
    const q = cs * 0.25;
    if (exits === 0) return;
    const straightNS = c.n && c.s;
    const straightWE = c.w && c.e;
    if (straightNS) {
      dashNS(-q);
      dashNS(q);
    } else if (straightWE) {
      dashWE(-q);
      dashWE(q);
    } else {
      // curva ou fim de linha: um traço do centro para cada saída
      if (c.n) dashNS(-q);
      if (c.s) dashNS(q);
      if (c.w) dashWE(-q);
      if (c.e) dashWE(q);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
