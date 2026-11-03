import * as THREE from 'three';
import { Random } from '../../../shared/sim/Random.ts';
import { bodyMaterial, glassMaterial } from './materials.ts';
import { PartBuilder } from './models/kit.ts';

/**
 * Trânsito das cidades (02/11), puramente visual: carros dos cidadãos indo e voltando do trabalho e do comércio pelas
 * estradas e rodovias. Nada disso existe na simulação.
 *
 * - Quatro modelos low poly (hatch, sedã, picape e van), com a pintura tingida por carro (paleta de cores comuns de rua),
 *   rodas, para-choques e faróis escuros, vidros na camada de vidro. Frente para +x, de 0,58 a 0,76 de comprimento (×1,15 no mapa).
 * - Cada carro anda de centro em centro de célula de estrada, sempre na mão direita; num cruzamento escolhe uma saída
 *   ao acaso (evita voltar), no fim da linha faz o retorno. Na rodovia anda mais rápido.
 * - A quantidade acompanha o tamanho da cidade (estradas, casas e lotes do zoneamento), com teto por qualidade gráfica.
 * - Desenho por instâncias: três malhas por modelo (pintura, peças escuras e vidro), doze chamadas no total. Os
 *   materiais têm a névoa de guerra do mapa: carro em área inexplorada fica escondido como o resto.
 */

const LANE = 0.24;
const LIFT = 0.07;
const SPEED_ROAD = 1.6;
const SPEED_HIGHWAY = 2.8;
/** Cores comuns de carro de rua (branco, prata, cinza, preto, vermelho, azul, verde-escuro, bege). */
const PAINT = ['#f2f2ef', '#c9ccce', '#8a8f94', '#2c2f33', '#b4322c', '#2f5f9e', '#3d5a45', '#c8b48a', '#e2e4e2', '#6d2f3a'];

export interface CarModel {
  paint: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
}

interface Car {
  model: number;
  from: number;
  to: number;
  prev: number;
  t: number;
  len: number;
  speed: number;
  heading: number;
  color: THREE.Color;
}

const TIRE = '#1b1c1e';
const HUB = '#b9bec2';
const TRIM = '#2e3135';
const GRILLE = '#1f2124';
const LIGHT_F = '#f6f1d6';
const LIGHT_R = '#b02a22';
const PLATE = '#e8e6dc';

type V3 = [number, number, number];
/** Espelha pontos do lado +z para os dois lados (cascas simétricas). */
const sym = (pts: V3[]): V3[] => pts.flatMap(([x, y, z]) => (z === 0 ? [[x, y, z] as V3] : [[x, y, z] as V3, [x, y, -z] as V3]));

/**
 * Peças comuns que não levam a pintura: pneus com calota, para-choques, grade, faróis, lanternas e placas. `front` e
 * `rear` são as pontas do carro em x; `wx` a distância dos eixos ao centro; `bumpY` a altura dos para-choques.
 */
function running(t: PartBuilder, o: { front: number; rear: number; wid: number; wheelR: number; wx: [number, number]; bumpY: number; lampY: number }): void {
  const { front, rear, wid, wheelR: r } = o;
  for (const x of o.wx)
    for (const sz of [-1, 1]) {
      t.cyl(r, r, 0.055, TIRE, [x, r, sz * (wid / 2 - 0.02)], [Math.PI / 2, 0, 0], 10);
      t.cyl(r * 0.55, r * 0.55, 0.012, HUB, [x, r, sz * (wid / 2 + 0.009)], [Math.PI / 2, 0, 0], 8);
    }
  // para-choques envolventes e grade
  t.box(0.035, 0.055, wid * 0.98, TRIM, [front - 0.005, o.bumpY, 0]);
  t.box(0.035, 0.055, wid * 0.98, TRIM, [rear + 0.005, o.bumpY, 0]);
  t.box(0.012, 0.045, wid * 0.42, GRILLE, [front + 0.012, o.lampY, 0]);
  for (const sz of [-1, 1]) {
    t.box(0.014, 0.032, 0.075, LIGHT_F, [front + 0.01, o.lampY + 0.005, sz * wid * 0.33]);
    t.box(0.014, 0.034, 0.07, LIGHT_R, [rear - 0.01, o.lampY + 0.01, sz * wid * 0.33]);
  }
  t.box(0.008, 0.03, 0.09, PLATE, [front + 0.025, o.bumpY, 0]);
  t.box(0.008, 0.03, 0.09, PLATE, [rear - 0.025, o.bumpY + 0.02, 0]);
}

/** Retrovisores (na pintura). */
function mirrors(p: PartBuilder, x: number, y: number, wid: number): void {
  for (const sz of [-1, 1]) p.box(0.03, 0.025, 0.04, '#ffffff', [x, y, sz * (wid / 2 + 0.015)]);
}

/** Hatch compacto: frente curta e inclinada, traseira quase reta, vidraça ampla com teto pintado. */
function hatch(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  const L = 0.58;
  const W = 0.3;
  p.convex(
    sym([
      [L / 2, 0.08, W / 2 - 0.035],
      [L / 2, 0.18, W / 2 - 0.035],
      [L / 2 - 0.08, 0.225, W / 2 - 0.012],
      [0.05, 0.07, W / 2],
      [0.05, 0.235, W / 2],
      [-L / 2, 0.08, W / 2 - 0.03],
      [-L / 2, 0.235, W / 2 - 0.025],
    ]),
    '#ffffff',
  );
  // vidraça (o "aquário") e o teto pintado por cima, com colunas
  g.convex(sym([[0.13, 0.225, W / 2 - 0.03], [-0.27, 0.23, W / 2 - 0.03], [0.02, 0.345, W / 2 - 0.05], [-0.25, 0.34, W / 2 - 0.05]]), '#ffffff');
  p.convex(sym([[0.03, 0.34, W / 2 - 0.048], [-0.255, 0.335, W / 2 - 0.048], [0.025, 0.355, W / 2 - 0.055], [-0.25, 0.35, W / 2 - 0.055]]), '#ffffff');
  for (const sz of [-1, 1]) p.box(0.025, 0.11, 0.012, '#ffffff', [-0.08, 0.285, sz * (W / 2 - 0.038)]);
  mirrors(p, 0.11, 0.25, W);
  running(t, { front: L / 2, rear: -L / 2, wid: W, wheelR: 0.072, wx: [0.17, -0.18], bumpY: 0.1, lampY: 0.17 });
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

/** Sedã: capô longo, cabine no meio e porta-malas. */
function sedan(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  const L = 0.7;
  const W = 0.31;
  p.convex(
    sym([
      [L / 2, 0.085, W / 2 - 0.035],
      [L / 2, 0.175, W / 2 - 0.035],
      [L / 2 - 0.07, 0.215, W / 2 - 0.012],
      [0, 0.07, W / 2],
      [0, 0.23, W / 2],
      [-L / 2, 0.09, W / 2 - 0.03],
      [-L / 2, 0.205, W / 2 - 0.03],
      [-L / 2 + 0.07, 0.235, W / 2 - 0.012],
    ]),
    '#ffffff',
  );
  g.convex(sym([[0.16, 0.22, W / 2 - 0.03], [-0.21, 0.225, W / 2 - 0.03], [0.04, 0.335, W / 2 - 0.05], [-0.13, 0.335, W / 2 - 0.05]]), '#ffffff');
  p.convex(sym([[0.05, 0.33, W / 2 - 0.048], [-0.14, 0.33, W / 2 - 0.048], [0.045, 0.345, W / 2 - 0.056], [-0.135, 0.345, W / 2 - 0.056]]), '#ffffff');
  for (const sz of [-1, 1]) p.box(0.022, 0.1, 0.012, '#ffffff', [-0.045, 0.28, sz * (W / 2 - 0.038)]);
  mirrors(p, 0.14, 0.245, W);
  running(t, { front: L / 2, rear: -L / 2, wid: W, wheelR: 0.074, wx: [0.215, -0.215], bumpY: 0.105, lampY: 0.165 });
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

/** Picape: alta, cabine simples na frente, caçamba aberta com tampa e santantônio. */
function pickup(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  const L = 0.76;
  const W = 0.33;
  p.convex(
    sym([
      [L / 2, 0.1, W / 2 - 0.03],
      [L / 2, 0.235, W / 2 - 0.03],
      [L / 2 - 0.06, 0.27, W / 2 - 0.01],
      [-0.07, 0.27, W / 2],
      [-0.07, 0.09, W / 2],
    ]),
    '#ffffff',
  );
  // cabine
  p.convex(sym([[0.1, 0.26, W / 2 - 0.01], [-0.06, 0.26, W / 2 - 0.01], [0.04, 0.42, W / 2 - 0.035], [-0.06, 0.42, W / 2 - 0.035]]), '#ffffff');
  g.convex(sym([[0.115, 0.275, W / 2 - 0.02], [0.05, 0.41, W / 2 - 0.04], [0.035, 0.29, W / 2 - 0.012], [0.035, 0.4, W / 2 - 0.03]]), '#ffffff');
  for (const sz of [-1, 1]) g.box(0.09, 0.08, 0.008, '#ffffff', [-0.005, 0.34, sz * (W / 2 - 0.018)]);
  g.box(0.008, 0.08, W - 0.09, '#ffffff', [-0.066, 0.35, 0]);
  // caçamba: assoalho escuro, laterais e tampa pintadas
  t.box(0.36, 0.012, W - 0.04, '#2a2c2f', [-0.24, 0.215, 0]);
  p.box(0.4, 0.13, W, '#ffffff', [-0.24, 0.15, 0]);
  for (const sz of [-1, 1]) p.box(0.38, 0.08, 0.022, '#ffffff', [-0.24, 0.255, sz * (W / 2 - 0.011)]);
  p.box(0.022, 0.08, W, '#ffffff', [-L / 2 + 0.011, 0.255, 0]);
  // santantônio
  for (const sz of [-1, 1]) t.box(0.02, 0.14, 0.02, TRIM, [-0.085, 0.33, sz * (W / 2 - 0.03)]);
  t.box(0.02, 0.02, W - 0.04, TRIM, [-0.085, 0.4, 0]);
  mirrors(p, 0.08, 0.31, W);
  running(t, { front: L / 2, rear: -L / 2, wid: W, wheelR: 0.088, wx: [0.24, -0.23], bumpY: 0.12, lampY: 0.2 });
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

/** Van: caixa alta, bico curto, janelas laterais e rack no teto. */
function van(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  const L = 0.72;
  const W = 0.32;
  p.convex(
    sym([
      [L / 2, 0.09, W / 2 - 0.03],
      [L / 2, 0.22, W / 2 - 0.03],
      [L / 2 - 0.1, 0.27, W / 2 - 0.01],
      [L / 2 - 0.2, 0.45, W / 2 - 0.02],
      [-L / 2, 0.08, W / 2 - 0.01],
      [-L / 2, 0.46, W / 2 - 0.02],
      [0, 0.08, W / 2],
      [0, 0.465, W / 2 - 0.01],
    ]),
    '#ffffff',
  );
  // para-brisa inclinado e janelas laterais
  g.convex(sym([[L / 2 - 0.091, 0.275, W / 2 - 0.035], [L / 2 - 0.186, 0.44, W / 2 - 0.045], [L / 2 - 0.106, 0.275, W / 2 - 0.035], [L / 2 - 0.196, 0.44, W / 2 - 0.045]]), '#ffffff');
  for (const sz of [-1, 1]) for (const x of [0.07, -0.1, -0.27]) g.box(0.13, 0.09, 0.008, '#ffffff', [x, 0.36, sz * (W / 2 - 0.004)]);
  // rack do teto
  for (const x of [-0.2, 0.05]) t.box(0.02, 0.02, W - 0.05, TRIM, [x, 0.475, 0]);
  for (const sz of [-1, 1]) t.box(0.34, 0.015, 0.015, TRIM, [-0.075, 0.48, sz * (W / 2 - 0.03)]);
  mirrors(p, L / 2 - 0.13, 0.3, W);
  running(t, { front: L / 2, rear: -L / 2, wid: W, wheelR: 0.08, wx: [0.22, -0.22], bumpY: 0.11, lampY: 0.19 });
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

/** Os quatro modelos (hatch, sedã, picape e van), para a prévia de modelos. */
export const carModels = (): CarModel[] => [hatch(), sedan(), pickup(), van()];

export class CityTraffic {
  readonly group = new THREE.Group();
  private readonly models: CarModel[] = [hatch(), sedan(), pickup(), van()];
  private readonly meshes: { paint: THREE.InstancedMesh; trim: THREE.InstancedMesh; glass: THREE.InstancedMesh }[] = [];
  private readonly rng = new Random(0xca75);
  private cars: Car[] = [];
  private roads: number[] = [];
  private roadSet = new Set<number>();
  private highways: ReadonlySet<number> = new Set();
  private target = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly cellSize: number,
    private readonly width: number,
    private readonly height: number,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly max: number,
  ) {
    this.group.name = 'city-traffic';
    const paintMat = bodyMaterial();
    const trimMat = bodyMaterial();
    const glassMat = glassMaterial();
    // um pouco maiores que os carros estacionados nos lotes: leem melhor andando, na câmera do RTS
    const k = (cellSize / 2) * 1.15;
    for (const model of this.models) {
      for (const g of [model.paint, model.trim, model.glass]) g.scale(k, k, k);
      const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
        const im = new THREE.InstancedMesh(geo, mat, max);
        im.count = 0;
        im.castShadow = true;
        im.frustumCulled = false;
        this.group.add(im);
        return im;
      };
      this.meshes.push({ paint: mk(model.paint, paintMat), trim: mk(model.trim, trimMat), glass: mk(model.glass, glassMat) });
    }
  }

  /** Malha de estradas (todas as que o cliente conhece) e quais são rodovia. */
  setRoads(cells: ReadonlySet<number>, highways: ReadonlySet<number>): void {
    this.roadSet = new Set(cells);
    this.highways = highways;
    // só células com vizinha (um carro precisa ter para onde ir)
    this.roads = [...cells].filter((i) => this.exits(i).length > 0);
    // carros cuja célula sumiu (não acontece hoje) saem
    this.cars = this.cars.filter((c) => this.roadSet.has(c.from) && this.roadSet.has(c.to));
  }

  /** Quantos carros a cidade comporta agora (estradas, moradias e lotes do zoneamento). */
  setActivity(roads: number, homes: number, lots: number): void {
    this.target = Math.min(this.max, Math.round(roads * 0.08 + homes * 0.35 + lots * 0.5));
  }

  private exits(i: number): number[] {
    const W = this.width;
    const x = i % W;
    const y = Math.floor(i / W);
    const out: number[] = [];
    if (x > 0 && this.roadSet.has(i - 1)) out.push(i - 1);
    if (x < W - 1 && this.roadSet.has(i + 1)) out.push(i + 1);
    if (y > 0 && this.roadSet.has(i - W)) out.push(i - W);
    if (y < this.height - 1 && this.roadSet.has(i + W)) out.push(i + W);
    return out;
  }

  private center(i: number, out: THREE.Vector2): THREE.Vector2 {
    return out.set(((i % this.width) + 0.5) * this.cellSize, (Math.floor(i / this.width) + 0.5) * this.cellSize);
  }

  private spawn(): void {
    if (!this.roads.length) return;
    const from = this.roads[Math.floor(this.rng.next() * this.roads.length)]!;
    const ex = this.exits(from);
    const to = ex[Math.floor(this.rng.next() * ex.length)]!;
    const r = this.rng.next();
    this.cars.push({
      model: r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3,
      from,
      to,
      prev: -1,
      t: this.rng.next(),
      len: this.cellSize,
      speed: 0.8 + this.rng.next() * 0.4,
      heading: 0,
      color: new THREE.Color(PAINT[Math.floor(this.rng.next() * PAINT.length)]!),
    });
  }

  private readonly a = new THREE.Vector2();
  private readonly b = new THREE.Vector2();

  update(dt: number): void {
    // aparece ou some um carro por quadro até chegar ao alvo (sem saltos)
    if (this.cars.length < this.target) this.spawn();
    else if (this.cars.length > this.target) this.cars.pop();
    const counts = [0, 0, 0, 0];
    for (const c of this.cars) {
      const hw = this.highways.has(c.from) && this.highways.has(c.to);
      c.t += (dt * c.speed * (hw ? SPEED_HIGHWAY : SPEED_ROAD)) / c.len;
      while (c.t >= 1) {
        c.t -= 1;
        // próxima célula: uma saída ao acaso, sem voltar (no fim da linha, retorno)
        const ex = this.exits(c.to).filter((n) => n !== c.from);
        const next = ex.length ? ex[Math.floor(this.rng.next() * ex.length)]! : c.from;
        c.prev = c.from;
        c.from = c.to;
        c.to = next;
      }
      const a = this.center(c.from, this.a);
      const b = this.center(c.to, this.b);
      const dx = b.x - a.x;
      const dz = b.y - a.y;
      const d = Math.hypot(dx, dz) || 1;
      // mão direita: desloca para a direita do sentido (no plano x/z, a direita de (dx,dz) é (-dz,dx))
      const ox = (-dz / d) * LANE * this.cellSize * 0.5 * (hw ? 1.25 : 1);
      const oz = (dx / d) * LANE * this.cellSize * 0.5 * (hw ? 1.25 : 1);
      const x = a.x + dx * c.t + ox;
      const z = a.y + dz * c.t + oz;
      const want = Math.atan2(-dz, dx);
      let diff = want - c.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.heading += diff * Math.min(1, dt * 8);
      const k = c.model;
      const n = counts[k]!++;
      const mesh = this.meshes[k]!;
      this.p.set(x, this.heightAt(x, z) + LIFT, z);
      this.q.setFromAxisAngle(this.up, c.heading);
      this.m.compose(this.p, this.q, this.s);
      mesh.paint.setMatrixAt(n, this.m);
      mesh.trim.setMatrixAt(n, this.m);
      mesh.glass.setMatrixAt(n, this.m);
      mesh.paint.setColorAt(n, c.color);
    }
    this.meshes.forEach((mesh, k) => {
      for (const im of [mesh.paint, mesh.trim, mesh.glass]) {
        im.count = counts[k]!;
        im.instanceMatrix.needsUpdate = true;
      }
      if (mesh.paint.instanceColor) mesh.paint.instanceColor.needsUpdate = true;
    });
  }

  dispose(): void {
    for (const m of this.meshes) for (const im of [m.paint, m.trim, m.glass]) im.dispose();
    for (const model of this.models) for (const g of [model.paint, model.trim, model.glass]) g.dispose();
    this.group.removeFromParent();
  }
}
