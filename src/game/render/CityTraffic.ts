import * as THREE from 'three';
import { Random } from '../../../shared/sim/Random.ts';
import { bodyMaterial, glassMaterial } from './materials.ts';
import { PartBuilder } from './models/kit.ts';

/**
 * Trânsito das cidades (02/11), puramente visual: carros dos cidadãos indo e voltando do trabalho e do comércio pelas
 * estradas e rodovias. Nada disso existe na simulação.
 *
 * - Quatro modelos low poly (hatch, sedã, picape e van), com a pintura tingida por carro (paleta de cores comuns de rua),
 *   rodas, para-choques e faróis escuros, vidros na camada de vidro. Frente para +x, ~0,62 de comprimento.
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

interface CarModel {
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

const DARK = '#1d1f22';
const TRIM = '#3a3d41';
const LIGHT_F = '#f4efd2';
const LIGHT_R = '#a8261f';

/** Rodas (4), para-choques e faróis: o que não leva a pintura. */
function chassis(t: PartBuilder, len: number, wid: number, wheelR: number, frontX: number): void {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) t.cyl(wheelR, wheelR, 0.05, DARK, [sx * len * 0.3, wheelR, sz * (wid / 2 - 0.01)], [Math.PI / 2, 0, 0], 8);
  t.box(0.03, 0.05, wid * 0.96, TRIM, [frontX, 0.1, 0]);
  t.box(0.03, 0.05, wid * 0.96, TRIM, [-len / 2 - 0.005, 0.1, 0]);
  for (const sz of [-1, 1]) {
    t.box(0.012, 0.03, 0.06, LIGHT_F, [frontX + 0.012, 0.15, sz * wid * 0.32]);
    t.box(0.012, 0.03, 0.06, LIGHT_R, [-len / 2 - 0.012, 0.15, sz * wid * 0.32]);
  }
}

function hatch(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  p.box(0.56, 0.12, 0.28, '#ffffff', [0, 0.14, 0]);
  p.convex(
    [
      [0.1, 0.2, 0.13],
      [0.1, 0.2, -0.13],
      [-0.26, 0.2, 0.13],
      [-0.26, 0.2, -0.13],
      [0.02, 0.32, 0.12],
      [0.02, 0.32, -0.12],
      [-0.24, 0.31, 0.12],
      [-0.24, 0.31, -0.12],
    ],
    '#ffffff',
  );
  g.box(0.012, 0.09, 0.22, '#ffffff', [0.065, 0.26, 0], [0, 0, -0.75]);
  for (const sz of [-1, 1]) g.box(0.24, 0.08, 0.01, '#ffffff', [-0.11, 0.26, sz * 0.125]);
  chassis(t, 0.56, 0.28, 0.07, 0.285);
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

function sedan(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  p.box(0.66, 0.12, 0.29, '#ffffff', [0, 0.14, 0]);
  p.convex(
    [
      [0.14, 0.2, 0.135],
      [0.14, 0.2, -0.135],
      [-0.22, 0.2, 0.135],
      [-0.22, 0.2, -0.135],
      [0.05, 0.31, 0.12],
      [0.05, 0.31, -0.12],
      [-0.15, 0.31, 0.12],
      [-0.15, 0.31, -0.12],
    ],
    '#ffffff',
  );
  g.box(0.012, 0.08, 0.22, '#ffffff', [0.095, 0.26, 0], [0, 0, -0.9]);
  g.box(0.012, 0.08, 0.22, '#ffffff', [-0.185, 0.26, 0], [0, 0, 0.9]);
  for (const sz of [-1, 1]) g.box(0.19, 0.075, 0.01, '#ffffff', [-0.05, 0.255, sz * 0.13]);
  chassis(t, 0.66, 0.29, 0.07, 0.335);
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

function pickup(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  p.box(0.7, 0.14, 0.3, '#ffffff', [0, 0.16, 0]);
  // cabine na frente e caçamba aberta atrás (bordas)
  p.box(0.24, 0.15, 0.28, '#ffffff', [0.1, 0.3, 0]);
  for (const sz of [-1, 1]) p.box(0.3, 0.07, 0.02, '#ffffff', [-0.19, 0.265, sz * 0.14]);
  p.box(0.02, 0.07, 0.3, '#ffffff', [-0.345, 0.265, 0]);
  t.box(0.28, 0.01, 0.26, '#2a2c2f', [-0.19, 0.235, 0]);
  g.box(0.012, 0.1, 0.24, '#ffffff', [0.225, 0.31, 0], [0, 0, -0.3]);
  for (const sz of [-1, 1]) g.box(0.16, 0.08, 0.01, '#ffffff', [0.1, 0.315, sz * 0.141]);
  chassis(t, 0.7, 0.3, 0.085, 0.355);
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

function van(): CarModel {
  const p = new PartBuilder();
  const t = new PartBuilder();
  const g = new PartBuilder();
  p.box(0.66, 0.34, 0.31, '#ffffff', [-0.02, 0.26, 0]);
  p.convex(
    [
      [0.31, 0.09, 0.15],
      [0.31, 0.09, -0.15],
      [0.31, 0.24, 0.15],
      [0.31, 0.24, -0.15],
      [0.24, 0.42, 0.15],
      [0.24, 0.42, -0.15],
    ],
    '#ffffff',
  );
  g.box(0.012, 0.13, 0.27, '#ffffff', [0.285, 0.33, 0], [0, 0, -0.35]);
  for (const sz of [-1, 1]) for (const x of [0.12, -0.08, -0.26]) g.box(0.13, 0.09, 0.01, '#ffffff', [x, 0.34, sz * 0.157]);
  chassis(t, 0.66, 0.31, 0.075, 0.33);
  return { paint: p.build(), trim: t.build(), glass: g.build() };
}

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
    const k = cellSize / 2;
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
