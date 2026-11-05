import * as THREE from 'three';
import { withFog } from './materials.ts';
import { layers, type PartBuilder } from './models/kit.ts';
import { strut } from './models/rigging.ts';

const ASPHALT = '#1f2227';
const SIDEWALK = '#8e8b84';
const CURB = '#c3bfb5';
const PAINT = '#efeee8';
/** Rodovia (02/11): asfalto mais escuro, canteiro de concreto, guard-rail e placas verdes. */
const HW_ASPHALT = '#18191c';
const HW_BARRIER = '#b8b4aa';
const HW_RAIL = '#9aa2a8';
const HW_SIGN = '#2f7a46';
const HW_EDGE = '#f1e7b0';

/** Largura da calçada (com meio-fio) nas bordas sem estrada vizinha, em fração da célula. */
const SIDEWALK_FRAC = 0.15;
/** Quanto o asfalto fica acima do chão (cobre o pequeno ruído de altura do terreno). */
const LIFT = 0.05;
/** Subdivisões da placa de asfalto por lado de célula. */
const PLATE_SEG = 4;

/**
 * Estradas construídas pelos jogadores (lote 3, seção 1), desenhadas como peças de asfalto por
 * célula que se encaixam sozinhas pelas vizinhas (N, L, S, O):
 * - reta: faixa central tracejada e calçada com meio-fio dos dois lados;
 * - curva: a faixa central dobra de uma saída para a outra;
 * - fim de linha: a faixa vai só até a saída;
 * - cruzamento em T ou em cruz: faixas de pedestres em cada saída e calçada nos cantos.
 * A estrada de terra que o mapa gera conta como vizinha (o asfalto encosta nela sem calçada).
 * A malha inteira é refeita quando o conjunto de estradas muda (acontece pouco).
 *
 * Relevo (02/11, bug das estradas em degraus no morro): as peças são montadas sem altura e, no fim, cada vértice é
 * posto sobre o chão (`drape`), na mesma malha do terreno (`sub` subdivisões por célula, com interpolação bilinear
 * entre os vértices dela). Células vizinhas compartilham a altura das bordas, então a estrada sobe e desce o morro
 * contínua, sem placas flutuando nem enterradas. O asfalto é uma placa subdividida para acompanhar a curva dentro
 * da célula.
 */
/** Até quantas luminárias acendem à noite (instâncias). */
const MAX_LAMPS = 600;

export class RoadLayer {
  readonly mesh: THREE.Mesh;
  /**
   * Iluminação pública (05/11): cada poste da rua tem uma luminária sobre a pista; à noite a lâmpada brilha e deixa uma
   * poça de luz quente no asfalto. Sem luz de verdade (seria pesado demais): brilho aditivo que acompanha a noite.
   */
  readonly lights = new THREE.Group();
  private readonly bulbs: THREE.InstancedMesh;
  private readonly pools: THREE.InstancedMesh;
  private lampAt: { head: THREE.Vector3; ground: THREE.Vector3 }[] = [];
  private nightLevel = -1;

  constructor(
    private readonly cellSize: number,
    private readonly width: number,
    private readonly height: number,
    private readonly heightAt: (x: number, z: number) => number,
    /** Subdivisões por célula da malha do terreno (1, 2 ou 4, conforme a qualidade). */
    private readonly sub = 1,
  ) {
    // material próprio: asfalto fosco com pouco desgaste (o dos edifícios suja demais e puxa para o marrom)
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.4 }), { weather: 0.25 }));
    this.mesh.receiveShadow = true;
    this.mesh.name = 'player-roads';
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe2a4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), bulbMat, MAX_LAMPS);
    const poolMat = new THREE.MeshBasicMaterial({ color: '#ffb45c', map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, MAX_LAMPS);
    for (const m of [this.bulbs, this.pools]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 2;
    }
    this.lights.add(this.pools, this.bulbs);
    this.lights.name = 'street-lights';
    this.lights.visible = false;
  }

  /** Acompanha a noite (0 de dia, 1 de noite): as lâmpadas acendem no entardecer e apagam no amanhecer. */
  setNight(night: number): void {
    const on = THREE.MathUtils.smoothstep(night, 0.15, 0.6);
    const q = Math.round(on * 40) / 40;
    if (q === this.nightLevel) return;
    this.nightLevel = q;
    this.lights.visible = q > 0;
    (this.bulbs.material as THREE.MeshBasicMaterial).opacity = q;
    (this.pools.material as THREE.MeshBasicMaterial).opacity = q * 0.4;
  }

  private placeLights(): void {
    const n = Math.min(MAX_LAMPS, this.lampAt.length);
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const r = this.cellSize * 1.15;
    for (let k = 0; k < n; k++) {
      const l = this.lampAt[k]!;
      this.bulbs.setMatrixAt(k, m.makeTranslation(l.head.x, l.head.y, l.head.z));
      this.pools.setMatrixAt(k, m.compose(l.ground, q, scale.set(r * 2, 1, r * 2)));
    }
    this.bulbs.count = n;
    this.pools.count = n;
    this.bulbs.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  /**
   * Refaz as peças. `paved` são as células com asfalto do jogador; `isRoad` diz se uma célula é
   * estrada de qualquer tipo (inclusive a de terra do mapa), para o encaixe.
   */
  set(paved: ReadonlySet<number>, isRoad: (i: number) => boolean, highways: ReadonlySet<number> = new Set()): void {
    const l = layers();
    const b = l.body;
    const W = this.width;
    const road = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < W && cy < this.height && isRoad(cy * W + cx);
    for (const i of paved) {
      const cx = i % W;
      const cy = Math.floor(i / W);
      if (highways.has(i)) {
        this.highwayTile(b, cx, cy, { n: road(cx, cy - 1), s: road(cx, cy + 1), w: road(cx - 1, cy), e: road(cx + 1, cy) });
        continue;
      }
      this.tile(b, cx, cy, { n: road(cx, cy - 1), s: road(cx, cy + 1), w: road(cx - 1, cy), e: road(cx + 1, cy) }, {
        nw: road(cx - 1, cy - 1),
        ne: road(cx + 1, cy - 1),
        sw: road(cx - 1, cy + 1),
        se: road(cx + 1, cy + 1),
      });
    }
    // a rodovia não leva energia: sem postes nas células dela
    this.lampAt = [];
    this.poles(b, highways.size ? new Set([...paved].filter((i) => !highways.has(i))) : paved, road);
    const geo = l.build().body;
    this.drape(geo);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.placeLights();
  }

  /** Altura da malha do terreno em (x, z): interpolação bilinear dos vértices da grade (passo célula / `sub`). */
  private meshHeight(x: number, z: number): number {
    const step = this.cellSize / this.sub;
    const gx = x / step;
    const gz = z / step;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const h = (i: number, j: number) => this.heightAt(i * step, j * step);
    const a = h(x0, z0) * (1 - fx) + h(x0 + 1, z0) * fx;
    const c = h(x0, z0 + 1) * (1 - fx) + h(x0 + 1, z0 + 1) * fx;
    return a * (1 - fz) + c * fz;
  }

  /** Põe cada vértice (montado com o chão em y = 0) sobre o relevo. */
  private drape(geo: THREE.BufferGeometry): void {
    const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const cache = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const k = `${Math.round(x * 100)},${Math.round(z * 100)}`;
      let g = cache.get(k);
      if (g === undefined) cache.set(k, (g = this.meshHeight(x, z) + LIFT));
      pos.setY(i, pos.getY(i) + g);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }

  /**
   * Rede elétrica: postes de madeira na calçada a cada três células de asfalto (cruzeta, isoladores) e os fios entre
   * postes vizinhos da mesma rua, com uma leve barriga no meio.
   */
  private poles(b: PartBuilder, paved: ReadonlySet<number>, road: (cx: number, cy: number) => boolean): void {
    const W = this.width;
    const cs = this.cellSize;
    const tops = new Map<number, THREE.Vector3>();
    for (const i of paved) {
      const cx = i % W;
      const cy = Math.floor(i / W);
      if ((cx + cy) % 3 !== 0) continue;
      // o poste fica do lado em que não há estrada vizinha (na calçada); rua cercada dos dois lados: no canto
      const horizontal = road(cx - 1, cy) || road(cx + 1, cy);
      // cruzamentos e curvas: sem poste (cairia dentro da pista); a linha segue nas retas
      if (horizontal && (road(cx, cy - 1) || road(cx, cy + 1))) continue;
      const side = horizontal ? (road(cx, cy - 1) ? 1 : -1) : road(cx - 1, cy) ? 1 : -1;
      const x = (cx + 0.5) * cs + (horizontal ? 0 : side * cs * 0.42);
      const z = (cy + 0.5) * cs + (horizontal ? side * cs * 0.42 : 0);
      const g = 0; // posto sobre o relevo no `drape`
      const H = 1.55;
      b.cyl(0.035, 0.05, H, '#6b5038', [x, g + H / 2, z], undefined, 6);
      // cruzeta perpendicular à rua, com três isoladores
      const arm: [number, number] = horizontal ? [0, 1] : [1, 0];
      b.box(horizontal ? 0.04 : 0.5, 0.04, horizontal ? 0.5 : 0.04, '#5a432f', [x, g + H - 0.08, z]);
      for (const k of [-0.2, 0, 0.2]) b.cyl(0.018, 0.022, 0.07, '#cfd6d8', [x + arm[0] * k, g + H - 0.02, z + arm[1] * k], undefined, 5);
      tops.set(i, new THREE.Vector3(x, g + H - 0.01, z));
      // luminária: braço curvo do poste para cima da pista e a cúpula com a lâmpada embaixo
      const reach = cs * 0.3;
      const hx = horizontal ? x : x - side * reach;
      const hz = horizontal ? z - side * reach : z;
      strut(b, [x, g + H - 0.2, z], [(x + hx) / 2, g + H + 0.08, (z + hz) / 2], 0.018, '#3a3d42');
      strut(b, [(x + hx) / 2, g + H + 0.08, (z + hz) / 2], [hx, g + H + 0.02, hz], 0.018, '#3a3d42');
      b.box(horizontal ? 0.14 : 0.22, 0.06, horizontal ? 0.22 : 0.14, '#2f3236', [hx, g + H, hz]);
      b.box(horizontal ? 0.1 : 0.16, 0.02, horizontal ? 0.16 : 0.1, '#f3e6c2', [hx, g + H - 0.035, hz]);
      const ground = this.meshHeight(hx, hz) + LIFT;
      this.lampAt.push({ head: new THREE.Vector3(hx, ground + H - 0.06, hz), ground: new THREE.Vector3(hx, ground + 0.03, hz) });
    }
    // fios: liga cada poste ao próximo da mesma linha ou coluna (3 células adiante), se a estrada segue entre eles
    for (const [i, p] of tops) {
      const cx = i % W;
      const cy = Math.floor(i / W);
      for (const [dx, dy] of [
        [3, 0],
        [0, 3],
      ] as const) {
        const j = (cy + dy) * W + (cx + dx);
        const q = cy + dy < this.height && cx + dx >= 0 && cx + dx < W ? tops.get(j) : undefined;
        if (!q || (!road(cx + Math.sign(dx), cy) && !road(cx, cy + Math.sign(dy)))) continue;
        const mid = p.clone().lerp(q, 0.5);
        mid.y -= 0.12;
        for (const [a, c] of [
          [p, mid],
          [mid, q],
        ] as const) {
          strut(b, [a.x, a.y, a.z], [c.x, c.y, c.z], 0.015, '#1d1f22');
        }
      }
    }
  }

  private tile(b: PartBuilder, cx: number, cy: number, c: { n: boolean; s: boolean; w: boolean; e: boolean }, d: { nw: boolean; ne: boolean; sw: boolean; se: boolean }): void {
    const cs = this.cellSize;
    const half = cs / 2;
    const x = (cx + 0.5) * cs;
    const z = (cy + 0.5) * cs;
    // placa de asfalto subdividida, montada no chão (y = 0); o `drape` a deita sobre o relevo
    const h = 0;
    b.add(new THREE.PlaneGeometry(cs, cs, PLATE_SEG, PLATE_SEG).rotateX(-Math.PI / 2), ASPHALT, { pos: [x, 0, z] });

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

  /**
   * Rodovia: pista dupla sem calçada. Nas retas, canteiro central de concreto, faixas tracejadas de cada lado, linhas
   * de borda e guard-rail onde não há vizinha; de tempos em tempos uma placa verde. Em curvas e cruzamentos fica só o
   * asfalto com as linhas de borda (o canteiro abre para o trevo).
   */
  private highwayTile(b: PartBuilder, cx: number, cy: number, c: { n: boolean; s: boolean; w: boolean; e: boolean }): void {
    const cs = this.cellSize;
    const half = cs / 2;
    const x = (cx + 0.5) * cs;
    const z = (cy + 0.5) * cs;
    const top = 0.014;
    b.add(new THREE.PlaneGeometry(cs, cs, PLATE_SEG, PLATE_SEG).rotateX(-Math.PI / 2), HW_ASPHALT, { pos: [x, 0, z] });
    const straightNS = c.n && c.s && !c.w && !c.e;
    const straightWE = c.w && c.e && !c.n && !c.s;
    const endNS = !c.w && !c.e && (c.n || c.s);
    const endWE = !c.n && !c.s && (c.w || c.e);
    const ns = straightNS || endNS;
    const we = straightWE || endWE;
    // guard-rail e linha de borda nas bordas sem vizinha
    const rail = (horizontal: boolean, off: number) => {
      const len = cs;
      if (horizontal) {
        b.box(len, 0.05, 0.03, HW_RAIL, [x, 0.17, z + off]);
        for (const k of [-0.75, -0.25, 0.25, 0.75]) b.box(0.035, 0.18, 0.035, HW_RAIL, [x + k * half, 0.09, z + off]);
        b.box(len, 0.008, 0.05, HW_EDGE, [x, top, z + off * 0.86]);
      } else {
        b.box(0.03, 0.05, len, HW_RAIL, [x + off, 0.17, z]);
        for (const k of [-0.75, -0.25, 0.25, 0.75]) b.box(0.035, 0.18, 0.035, HW_RAIL, [x + off, 0.09, z + k * half]);
        b.box(0.05, 0.008, len, HW_EDGE, [x + off * 0.86, top, z]);
      }
    };
    const edge = half - 0.06;
    if (!c.n) rail(true, -edge);
    if (!c.s) rail(true, edge);
    if (!c.w) rail(false, -edge);
    if (!c.e) rail(false, edge);
    if (!ns && !we) return;
    // canteiro central de concreto (barreira baixa) e uma faixa tracejada em cada pista
    const dashL = cs * 0.22;
    if (ns) {
      b.box(0.14, 0.13, cs, HW_BARRIER, [x, 0.065, z]);
      b.box(0.07, 0.03, cs, '#d6d2c8', [x, 0.14, z]);
      for (const lane of [-1, 1]) for (const dz of [-0.25, 0.25]) b.box(0.05, 0.008, dashL, PAINT, [x + lane * cs * 0.26, top, z + dz * cs]);
    } else {
      b.box(cs, 0.13, 0.14, HW_BARRIER, [x, 0.065, z]);
      b.box(cs, 0.03, 0.07, '#d6d2c8', [x, 0.14, z]);
      for (const lane of [-1, 1]) for (const dx of [-0.25, 0.25]) b.box(dashL, 0.008, 0.05, PAINT, [x + dx * cs, top, z + lane * cs * 0.26]);
    }
    // placa verde de tempos em tempos, no canteiro (poste e painel)
    if ((cx * 7 + cy * 13) % 9 === 0) {
      const H = 1.05;
      b.box(0.06, H, 0.06, HW_RAIL, [x, H / 2, z]);
      if (ns) b.box(0.55, 0.3, 0.04, HW_SIGN, [x, H, z]);
      else b.box(0.04, 0.3, 0.55, HW_SIGN, [x, H, z]);
      if (ns) b.box(0.42, 0.03, 0.045, '#e9efe9', [x, H + 0.04, z]);
      else b.box(0.045, 0.03, 0.42, '#e9efe9', [x, H + 0.04, z]);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    for (const m of [this.bulbs, this.pools]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.mesh.removeFromParent();
  }
}

let poolTex: THREE.Texture | null = null;
/** Mancha radial macia para a poça de luz no chão (gerada uma vez). */
function poolTexture(): THREE.Texture {
  if (poolTex) return poolTex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  poolTex = new THREE.CanvasTexture(c);
  return poolTex;
}
