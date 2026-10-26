import * as THREE from 'three';
import type { BuildingType } from '../../../../shared/sim/config.ts';
import type { SpecId } from '../../../../shared/sim/upgrades.ts';
import { C, type PartBuilder } from './kit.ts';
import { tractor } from './crops.ts';
import { staticPumpjack } from './pumpjack.ts';

/**
 * Evolução visual das melhorias (Fase 4): módulos procedurais que se somam ao modelo base
 * conforme o nível e a especialização — anexos, tanques, chaminés, antenas, vias internas,
 * iluminação e estruturas de apoio. Um edifício no nível N mostra todos os módulos de nível ≤ N
 * (e os da sua especialização), dentro da própria área ocupada.
 *
 * Peças pequenas (`detail`) ficam numa camada separada que some em zoom distante (LOD), para a
 * leitura continuar limpa de longe e no celular. Modelos GLB finais ainda não existem: estes
 * volumes procedurais são temporários e estão registrados como lacuna no relatório da fase.
 */
export interface ModuleTarget {
  b: PartBuilder;
  a: PartBuilder;
  g: PartBuilder;
}

export interface UpgradeModule {
  level: number;
  spec?: SpecId;
  /** Peça pequena: some em zoom distante. */
  detail?: boolean;
  /** Altura total do modelo com este módulo (para posicionar a barra de vida). */
  height?: number;
  /** Novas saídas de fumaça (coordenadas locais). */
  smoke?: [number, number, number][];
  build: (t: ModuleTarget) => void;
}

type V3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ peças reutilizáveis

/** Poste de iluminação com braço e luminária voltada para `dir` (rad). */
function lamp({ b, g }: ModuleTarget, x: number, z: number, h = 1.3, dir = 0): void {
  b.cyl(0.03, 0.04, h, C.steel, [x, h / 2 + 0.05, z], undefined, 6);
  const dx = Math.cos(dir) * 0.18;
  const dz = Math.sin(dir) * 0.18;
  b.box(0.36, 0.03, 0.04, C.steel, [x + dx, h + 0.04, z + dz], [0, -dir, 0]);
  b.box(0.16, 0.05, 0.1, C.metalDark, [x + dx * 2, h, z + dz * 2], [0, -dir, 0]);
  g.box(0.12, 0.012, 0.07, '#ffffff', [x + dx * 2, h - 0.03, z + dz * 2], [0, -dir, 0]);
}

/** Torre de holofotes (canteiro, pátio militar). */
function floodMast({ b, g }: ModuleTarget, x: number, z: number, h = 2.4): void {
  b.box(0.08, h, 0.08, C.steel, [x, h / 2, z]);
  for (let y = 0.4; y < h - 0.2; y += 0.45) b.box(0.24, 0.02, 0.02, C.steel, [x, y, z], [0, 0, 0.6]);
  b.box(0.42, 0.05, 0.1, C.metalDark, [x, h + 0.02, z]);
  for (const o of [-0.13, 0.13]) {
    b.box(0.12, 0.12, 0.08, C.metalDark, [x + o, h + 0.12, z + 0.04]);
    g.box(0.09, 0.09, 0.012, '#ffffff', [x + o, h + 0.12, z + 0.085]);
  }
}

/** Cerca de alambrado entre dois pontos (postes e duas travessas), sobre o piso em `y0`. */
function fence({ b }: ModuleTarget, x0: number, z0: number, x1: number, z1: number, h = 0.42, y0 = 0.16): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.5));
  const rot: V3 = [0, -Math.atan2(z1 - z0, x1 - x0), 0];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.box(0.035, h, 0.035, C.steel, [x0 + (x1 - x0) * t, y0 + h / 2, z0 + (z1 - z0) * t]);
  }
  for (const y of [y0 + h * 0.45, y0 + h * 0.95]) b.box(len, 0.018, 0.018, C.steel, [(x0 + x1) / 2, y, (z0 + z1) / 2], rot);
}

/** Pátio pavimentado com faixas de sinalização. */
function pad({ b }: ModuleTarget, x: number, z: number, w: number, d: number, marks = true, color: string = C.asphalt): void {
  b.box(w, 0.025, d, color, [x, 0.175, z]);
  if (!marks) return;
  const along = w >= d;
  const len = along ? w : d;
  for (let s = -len / 2 + 0.2; s < len / 2 - 0.15; s += 0.45) {
    b.box(along ? 0.22 : 0.05, 0.006, along ? 0.05 : 0.22, '#d8c25a', [along ? x + s : x, 0.191, along ? z : z + s]);
  }
}

/** Tanque vertical com teto em domo, anel e escada. */
function tank({ b, a }: ModuleTarget, x: number, z: number, r: number, h: number, color: string = C.white, y0 = 0.16, band = true): void {
  b.cyl(r, r, h, color, [x, y0 + h / 2, z], undefined, 14);
  b.sphere(r * 1.01, C.metal, [x, y0 + h, z], [1, 0.32, 1], 14);
  b.cyl(r * 1.03, r * 1.03, 0.04, C.metal, [x, y0 + h * 0.5, z], undefined, 14);
  b.box(0.035, h, 0.035, C.steel, [x + r + 0.02, y0 + h / 2, z]);
  if (band) a.cyl(r * 1.015, r * 1.015, Math.min(0.14, h * 0.15), '#ffffff', [x, y0 + h * 0.75, z], undefined, 14);
}

/** Tanque horizontal (vaso separador) sobre berços. */
function vessel({ b }: ModuleTarget, x: number, z: number, len: number, r: number, color: string = C.white, rotY = 0): void {
  b.cyl(r, r, len, color, [x, 0.2 + r + 0.08, z], [0, rotY, Math.PI / 2], 12);
  for (const s of [-1, 1]) {
    const ox = Math.cos(rotY) * s * len * 0.42;
    const oz = -Math.sin(rotY) * s * len * 0.42;
    b.sphere(r, color, [x + ox * 1.19, 0.2 + r + 0.08, z + oz * 1.19], [0.35, 1, 1], 10);
    b.box(0.08, r + 0.1, r * 1.6, C.concreteDark, [x + ox, 0.2 + (r + 0.1) / 2, z + oz], [0, rotY, 0]);
  }
}

/** Mastro treliçado com luz de sinalização no topo. */
function mast({ b }: ModuleTarget, x: number, z: number, h: number, base = 0.16): void {
  const w = 0.18;
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [0, 1],
  ] as const)
    b.cyl(0.015, 0.02, h, C.steel, [x + dx * w * 0.5, base + h / 2, z + dz * w * 0.5], [dz * 0.03, 0, -dx * 0.03], 4);
  for (let y = base + 0.35; y < base + h - 0.2; y += 0.4) b.cyl(w * 0.62, w * 0.62, 0.015, C.steel, [x, y, z], undefined, 3);
  b.cyl(0.012, 0.012, 0.5, C.steel, [x, base + h + 0.25, z], undefined, 4);
  b.sphere(0.05, C.red, [x, base + h + 0.52, z], undefined, 6);
}

/** Antena parabólica fixa sobre suporte. */
function dish({ b }: ModuleTarget, x: number, y: number, z: number, r: number, facing = 0): void {
  b.cyl(0.03, 0.04, r * 0.9, C.steel, [x, y + r * 0.45, z], undefined, 6);
  b.sphere(r, C.white, [x, y + r * 1.1, z], [0.32, 1, 1], 12);
  b.cyl(0.015, 0.015, r * 0.8, C.steel, [x + Math.cos(facing) * r * 0.35, y + r * 1.1, z - Math.sin(facing) * r * 0.35], [0, facing, Math.PI / 2], 4);
}

/** Cúpula de radar sobre base. */
function radome({ b }: ModuleTarget, x: number, y: number, z: number, r: number): void {
  b.cyl(r * 0.8, r * 0.85, r * 0.4, C.concreteLight, [x, y + r * 0.2, z], undefined, 12);
  b.sphere(r, C.white, [x, y + r * 0.55, z], undefined, 14);
}

/** Painéis solares inclinados em fileiras (moldura no corpo, vidro escuro na camada de vidro). */
function solar({ b, g }: ModuleTarget, x: number, y: number, z: number, cols: number, rows: number, w = 0.42, d = 0.3, rotY = 0): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const lx = (i - (cols - 1) / 2) * (w + 0.06);
      const lz = (j - (rows - 1) / 2) * (d + 0.12);
      const px = x + lx * c + lz * s;
      const pz = z - lx * s + lz * c;
      b.box(0.03, 0.12, 0.03, C.steel, [px, y + 0.06, pz]);
      b.box(w + 0.02, 0.025, d + 0.02, C.metalDark, [px, y + 0.14, pz], [0.35, rotY, 0]);
      g.box(w, 0.01, d, '#ffffff', [px, y + 0.158, pz], [0.35, rotY, 0]);
    }
}

/** Condensadora/exaustor de cobertura. */
function acUnit({ b }: ModuleTarget, x: number, y: number, z: number, s = 1): void {
  b.box(0.42 * s, 0.24 * s, 0.32 * s, C.steel, [x, y + 0.12 * s, z]);
  b.cyl(0.11 * s, 0.11 * s, 0.02, C.metalDark, [x, y + 0.25 * s, z], undefined, 10);
  for (let i = 0; i < 3; i++) b.box(0.02, 0.18 * s, 0.33 * s, C.metalDark, [x - 0.12 * s + i * 0.12 * s, y + 0.12 * s, z]);
}

/** Anexo simples: bloco, platibanda, porta e janelas (normal da fachada em +z). */
function annex({ b, g, a }: ModuleTarget, x: number, z: number, w: number, h: number, d: number, color: string = C.concrete, door = true, stripe = false): void {
  b.box(w, h, d, color, [x, 0.16 + h / 2, z]);
  b.box(w + 0.06, 0.06, d + 0.06, C.concreteDark, [x, 0.16 + h + 0.03, z]);
  const n = Math.max(1, Math.floor(w / 0.45));
  for (let i = 0; i < n; i++) {
    const wx = x - w / 2 + (i + 0.5) * (w / n);
    g.box(0.22, 0.2, 0.03, '#ffffff', [wx, 0.16 + h * 0.62, z + d / 2 + 0.01]);
    b.box(0.26, 0.025, 0.06, C.concreteLight, [wx, 0.16 + h * 0.62 - 0.115, z + d / 2 + 0.01]);
  }
  if (door) b.box(0.22, Math.min(0.42, h * 0.7), 0.04, C.metalDark, [x + w / 2 - 0.2, 0.16 + Math.min(0.42, h * 0.7) / 2, z + d / 2 + 0.02]);
  if (stripe) a.box(w + 0.01, 0.06, 0.02, '#ffffff', [x, 0.16 + h - 0.08, z + d / 2 + 0.012]);
}

/** Galpão aberto: pilares e cobertura de uma água. */
function shed({ b }: ModuleTarget, x: number, z: number, w: number, d: number, h: number, roof: string = C.roof): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, h, 0.06, C.metalDark, [x + (sx * w) / 2.15, 0.16 + h / 2, z + (sz * d) / 2.15]);
  b.box(w + 0.12, 0.05, d + 0.12, roof, [x, 0.16 + h + 0.02, z], [0.08, 0, 0]);
}

/** Tubo reto entre dois pontos. */
function pipe({ b }: ModuleTarget, from: V3, to: V3, r = 0.035, color: string = C.steel): void {
  const a = new THREE.Vector3(...from);
  const c = new THREE.Vector3(...to);
  const dir = c.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  b.cyl(r, r, len, color, [(a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2], [e.x, e.y, e.z], 6);
}

/** Rack de tubulação: postes e dois tubos ao longo de x. */
function pipeRack(t: ModuleTarget, x0: number, x1: number, z: number, y = 0.7): void {
  for (let x = x0; x <= x1 + 1e-6; x += 0.6) {
    t.b.box(0.05, y, 0.05, C.metalDark, [x, 0.16 + y / 2, z]);
    t.b.box(0.05, 0.04, 0.3, C.metalDark, [x, 0.16 + y, z]);
  }
  for (const dz of [-0.08, 0.08]) pipe(t, [x0 - 0.1, 0.16 + y + 0.06, z + dz], [x1 + 0.1, 0.16 + y + 0.06, z + dz], 0.035, dz < 0 ? C.steel : '#7f8a58');
}

/** Chaminé listrada (topo em y0 + h). */
function chimney({ b }: ModuleTarget, x: number, z: number, h: number, r = 0.15, y0 = 0.16): void {
  b.cyl(r * 0.85, r * 1.2, h, C.concreteLight, [x, y0 + h / 2, z], undefined, 10);
  b.cyl(r * 0.9, r * 0.9, 0.18, C.red, [x, y0 + h - 0.1, z], undefined, 10);
  b.cyl(r, r, 0.16, C.red, [x, y0 + h * 0.62, z], undefined, 10);
  b.box(0.03, h * 0.9, 0.03, C.steel, [x + r * 1.15, y0 + h * 0.45, z]);
}

/** Contêiner com nervuras (comprimento ao longo de x, ou de z com rotY = π/2). */
function container({ b }: ModuleTarget, x: number, y: number, z: number, color: string, len = 1.0, rotY = 0): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (dx: number, dy: number, dz: number): V3 => [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
  const w = 0.42;
  const h = 0.44;
  b.box(len, h, w, color, at(0, h / 2, 0), [0, rotY, 0]);
  const ribs = Math.round(len / 0.12);
  for (let i = 1; i < ribs; i++) b.box(0.03, h - 0.06, w + 0.025, color, at(-len / 2 + (i * len) / ribs, h / 2, 0), [0, rotY, 0]);
  for (const sx of [-1, 1]) b.box(0.04, h + 0.01, w + 0.02, C.metalDark, at((sx * len) / 2, h / 2, 0), [0, rotY, 0]);
}

/** Muro de sacos de areia em linha (duas camadas). */
function sandbags({ b }: ModuleTarget, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.32));
  const rot: V3 = [0, -Math.atan2(z1 - z0, x1 - x0), 0];
  for (let layer = 0; layer < 2; layer++)
    for (let i = 0; i < n - layer; i++) {
      const t = (i + 0.5 + layer * 0.5) / n;
      b.box(0.3, 0.13, 0.17, C.sandbag, [x0 + (x1 - x0) * t, 0.22 + layer * 0.12, z0 + (z1 - z0) * t], rot);
    }
}

/** Barreira de concreto tipo New Jersey (comprimento ao longo de x). */
function jersey({ b }: ModuleTarget, x: number, z: number, rotY = 0, len = 0.7): void {
  b.side(
    [
      [-0.16, 0],
      [0.16, 0],
      [0.1, 0.1],
      [0.05, 0.42],
      [-0.05, 0.42],
      [-0.1, 0.1],
    ],
    len,
    C.concrete,
    [x, 0.16, z],
    [0, Math.PI / 2 + rotY, 0],
  );
}

/** Pilha de toras (ao longo de x). */
function logPile({ b }: ModuleTarget, x: number, z: number, n = 4, len = 1.2): void {
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < n - row; i++) b.cyl(0.12, 0.12, len, C.wood, [x - (n - 1) * 0.12 + i * 0.25 + row * 0.12, 0.28 + row * 0.21, z], [Math.PI / 2, 0, Math.PI / 2], 8);
}

/** Tambores (petróleo, óleo, químicos) sobre o piso em `y0`. */
function drums({ b }: ModuleTarget, x: number, z: number, n = 4, color = '#3f5a4a', y0 = 0.16): void {
  for (let i = 0; i < n; i++) b.cyl(0.08, 0.08, 0.22, color, [x + (i % 2) * 0.18, y0 + 0.11, z + Math.floor(i / 2) * 0.18], undefined, 8);
}

/** Rotação de uma roda (cilindro) com o eixo no z local de um veículo girado `rotY`. */
function wheelRot(rotY: number): V3 {
  return [0, rotY - Math.PI / 2, -Math.PI / 2];
}

/** Escavadeira de esteiras (braço voltado para +x local), sobre o piso em `y0`. */
function crawler({ b }: ModuleTarget, x: number, z: number, color: string = C.yellow, rotY = 0, y0 = 0.16): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (dx: number, dy: number, dz: number): V3 => [x + dx * c + dz * s, dy + y0 - 0.16, z - dx * s + dz * c];
  for (const side of [-1, 1]) b.box(0.7, 0.16, 0.14, C.track, at(0, 0.24, side * 0.2), [0, rotY, 0]);
  b.box(0.5, 0.26, 0.4, color, at(-0.05, 0.45, 0), [0, rotY, 0]);
  b.box(0.22, 0.22, 0.22, '#2a3a44', at(0.1, 0.68, 0.08), [0, rotY, 0]);
  b.box(0.7, 0.07, 0.08, color, at(0.45, 0.62, 0), [0, rotY, -0.5]);
  b.box(0.18, 0.16, 0.26, C.metalDark, at(0.78, 0.38, 0), [0, rotY, 0]);
}

/** Caminhão basculante (cabine em +x local), sobre o piso em `y0`. */
function truck({ b, g }: ModuleTarget, x: number, z: number, color: string = C.yellow, rotY = 0, y0 = 0.16): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (dx: number, dy: number, dz: number): V3 => [x + dx * c + dz * s, dy + y0 - 0.16, z - dx * s + dz * c];
  for (const dx of [-0.32, 0.05, 0.36]) for (const side of [-1, 1]) b.cyl(0.09, 0.09, 0.06, C.rubber, at(dx, 0.25, side * 0.2), wheelRot(rotY), 8);
  b.box(0.95, 0.08, 0.36, C.metalDark, at(0, 0.32, 0), [0, rotY, 0]);
  b.box(0.26, 0.26, 0.36, color, at(0.36, 0.5, 0), [0, rotY, 0]);
  g.box(0.02, 0.12, 0.3, '#ffffff', at(0.5, 0.56, 0), [0, rotY, 0]);
  b.box(0.6, 0.24, 0.4, color, at(-0.14, 0.5, 0), [0, rotY, 0.12]);
}

/** Pá carregadeira de pneus (caçamba em +x local), sobre o piso em `y0`. */
function loader({ b, g }: ModuleTarget, x: number, z: number, color: string = C.yellow, rotY = 0, y0 = 0.16): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (dx: number, dy: number, dz: number): V3 => [x + dx * c + dz * s, dy + y0 - 0.16, z - dx * s + dz * c];
  for (const dx of [-0.26, 0.2]) for (const side of [-1, 1]) b.cyl(0.13, 0.13, 0.1, C.rubber, at(dx, 0.29, side * 0.21), wheelRot(rotY), 10);
  b.box(0.4, 0.22, 0.3, color, at(-0.24, 0.42, 0), [0, rotY, 0]);
  b.box(0.3, 0.16, 0.28, color, at(0.17, 0.38, 0), [0, rotY, 0]);
  b.box(0.22, 0.24, 0.24, '#2a3a44', at(-0.03, 0.63, 0), [0, rotY, 0]);
  g.box(0.02, 0.14, 0.2, '#ffffff', at(0.09, 0.65, 0), [0, rotY, 0]);
  for (const side of [-1, 1]) b.box(0.32, 0.05, 0.05, color, at(0.4, 0.44, side * 0.11), [0, rotY, -0.45]);
  b.box(0.16, 0.2, 0.52, C.metalDark, at(0.6, 0.3, 0), [0, rotY, 0]);
}

/** Esteira transportadora reta entre dois pontos, com pés nas pontas elevadas. */
function conveyor({ b }: ModuleTarget, from: V3, to: V3, w = 0.22): void {
  const a = new THREE.Vector3(...from);
  const c = new THREE.Vector3(...to);
  const dir = c.clone().sub(a);
  const len = dir.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(FORWARD, dir.normalize()));
  b.box(w, 0.05, len, C.metalDark, [(a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2], [e.x, e.y, e.z]);
  for (const p of [a, c]) if (p.y > 0.35) b.box(0.05, p.y - 0.08, 0.05, C.metal, [p.x, (p.y + 0.08) / 2, p.z]);
}

// ------------------------------------------------------------------ módulos por classe

const HQ: UpgradeModule[] = [
  {
    level: 2,
    detail: true,
    build: (t) => {
      lamp(t, 2.72, -0.7, 1.4, Math.PI);
      lamp(t, -2.72, 2.6, 1.4, 0);
      lamp(t, -2.72, -0.9, 1.4, 0);
    },
  },
  { level: 3, build: (t) => solar(t, -1.3, 2.48, 1.45, 3, 2) },
  {
    level: 4,
    build: (t) => {
      annex(t, -1.15, -2.3, 1.1, 0.85, 0.9, C.concrete, true, true);
      acUnit(t, -1.35, 1.07, -2.35, 0.7);
      t.b.cyl(0.02, 0.02, 0.9, C.steel, [-0.75, 1.5, -2.5], undefined, 4);
    },
  },
  {
    level: 5,
    height: 6.4,
    build: (t) => {
      // segundo pavimento na torre de comando
      t.b.box(1.6, 0.8, 1.4, C.concreteLight, [-1.1, 4.38, -0.2]);
      t.b.box(1.7, 0.08, 1.5, C.concreteDark, [-1.1, 4.82, -0.2]);
      t.g.box(1.3, 0.3, 0.03, '#ffffff', [-1.1, 4.42, 0.515]);
      t.g.box(0.03, 0.3, 1.0, '#ffffff', [-0.285, 4.42, -0.2]);
      t.a.box(1.62, 0.07, 0.02, '#ffffff', [-1.1, 4.7, 0.512]);
    },
  },
  {
    level: 6,
    spec: 'admin',
    build: (t) => {
      for (const z of [-0.2, 0.55, 1.3]) {
        t.b.cyl(0.025, 0.03, 2.4, C.steel, [2.62, 1.36, z], undefined, 6);
        t.a.box(0.5, 0.3, 0.02, '#ffffff', [2.62 - 0.26, 2.35, z], [0, Math.PI / 2, 0]);
      }
      // átrio envidraçado na entrada
      t.g.box(1.25, 0.72, 0.03, '#ffffff', [-0.2, 0.55, 2.86]);
      t.g.box(0.03, 0.72, 0.6, '#ffffff', [-0.82, 0.55, 2.56]);
      t.g.box(0.03, 0.72, 0.6, '#ffffff', [0.42, 0.55, 2.56]);
      dish(t, -0.6, 2.48, 1.7, 0.35, 0.4);
    },
  },
  {
    level: 6,
    spec: 'logistics_hub',
    build: (t) => {
      container(t, 2.5, 0.16, -0.25, '#5b6f7e', 1.0, Math.PI / 2);
      container(t, 2.5, 0.16, 0.9, '#8a4b32', 1.0, Math.PI / 2);
      container(t, 2.5, 0.6, 0.35, '#6d7a45', 1.0, Math.PI / 2);
      tank(t, 0.12, -2.55, 0.28, 0.9, C.white);
      tank(t, -0.55, -2.65, 0.22, 0.7, C.white, 0.16, false);
    },
  },
  {
    level: 6,
    spec: 'fortified',
    build: (t) => {
      sandbags(t, 2.6, -0.7, 2.6, 2.05);
      sandbags(t, -2.75, -1.0, -2.75, 2.2);
      // casamata com seteira e segunda torre de defesa
      t.b.box(0.85, 0.5, 0.7, C.concreteDark, [0.0, 0.41, -2.45]);
      t.b.box(0.5, 0.06, 0.04, '#1b1a18', [0.0, 0.52, -2.09]);
      t.b.cyl(0.26, 0.3, 0.24, C.metalDark, [0.0, 0.78, -2.45], undefined, 10);
      t.b.box(0.7, 0.09, 0.09, C.metalDark, [0.0, 0.84, -2.1], [0, Math.PI / 2, 0]);
      // persianas blindadas nas janelas da fachada
      for (const x of [-2.0, -1.28, -0.56, 0.16, 0.88, 1.6]) t.b.box(0.32, 0.08, 0.05, C.metalDark, [x, 1.92, 2.25]);
    },
  },
  { level: 7, height: 6.6, build: (t) => mast(t, 2.6, -0.45, 4.6) },
  {
    level: 8,
    detail: true,
    build: (t) => {
      pad(t, -2.7, 0.65, 0.5, 3.2, false);
      fence(t, -2.9, -2.9, -1.8, -2.9);
      fence(t, 0.6, -2.95, 2.9, -2.95);
      lamp(t, 2.72, 1.7, 1.4, Math.PI);
    },
  },
  { level: 9, height: 6.9, build: (t) => radome(t, -1.1, 4.86, -0.2, 0.42) },
  {
    level: 10,
    height: 6.9,
    build: (t) => {
      t.a.box(2.6, 0.42, 0.03, '#ffffff', [-0.2, 2.02, 2.245]);
      floodMast(t, 2.75, 2.75, 2.6);
      floodMast(t, -2.75, -2.75, 2.6);
    },
  },
];

/** Rede de camuflagem sobre a cobertura em arco do quartel (manchas em três tons acompanhando o arco). */
function camoNet({ b }: ModuleTarget): void {
  // mesmo arco do modelo base: raio 1,35 ao longo de z (centro -0,1), altura 0,74 sobre y = 1,05
  const R = 1.35;
  const H = 0.74;
  const tones: string[] = [C.oliveDark, C.olive, '#5b5236'];
  const patches: [number, number, number][] = [
    [-0.95, -0.7, 1.6],
    [-0.5, 0.5, 1.9],
    [-0.1, -0.6, 1.7],
    [0.3, 0.7, 1.6],
    [0.7, -0.4, 2.0],
    [1.05, 0.6, 1.3],
    [0.05, 1.1, 0.9],
    [-0.7, -1.2, 0.8],
  ];
  patches.forEach(([th, x, len], i) => {
    const z = -0.1 + R * Math.sin(th) * 1.02;
    const y = 1.05 + H * Math.cos(th) * 1.02 + 0.02;
    b.box(len, 0.02, 0.62, tones[i % 3] ?? C.olive, [x, y, z], [Math.atan2(H * Math.sin(th), R * Math.cos(th)), 0, 0]);
  });
}

// Quartel: hangar 3,2 × 2,6 no centro; frente direita (x 0,45…1,55, z 1,3…1,95) reservada à
// especialização, que também ganha um elemento alto próprio para ser reconhecível de longe.
const BARRACKS: UpgradeModule[] = [
  {
    level: 2,
    detail: true,
    build: (t) => {
      lamp(t, 1.85, 1.35, 1.2, Math.PI);
      // armários de equipamento junto à fachada
      for (let i = 0; i < 3; i++) {
        t.b.box(0.04, 0.4, 0.04, C.woodDark, [-1.45 + i * 0.3, 0.36, 1.45]);
        t.b.box(0.18, 0.22, 0.05, C.khaki, [-1.45 + i * 0.3, 0.5, 1.45]);
      }
    },
  },
  {
    level: 3,
    build: (t) => {
      for (const x of [-0.9, 0, 0.9]) {
        t.b.box(0.22, 0.18, 0.22, C.metal, [x, 1.86, -0.1]);
        t.b.box(0.28, 0.04, 0.28, C.metalDark, [x, 1.97, -0.1]);
      }
    },
  },
  {
    level: 4,
    detail: true,
    build: (t) => {
      // pista de obstáculos na lateral: muros baixos e pneus
      t.b.box(0.08, 0.3, 0.42, C.concrete, [-1.8, 0.31, -0.75]);
      t.b.box(0.08, 0.45, 0.42, C.concrete, [-1.8, 0.38, -0.1]);
      for (let i = 0; i < 3; i++) t.b.cyl(0.11, 0.11, 0.07, C.rubber, [-1.8, 0.2, 0.45 + i * 0.25], undefined, 10);
    },
  },
  {
    level: 5,
    height: 2.9,
    build: (t) => {
      // guarita de vigilância no canto
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        t.b.box(0.05, 1.6, 0.05, C.woodDark, [-1.72 + dx * 0.18, 0.96, -1.72 + dz * 0.18]);
      t.b.box(0.5, 0.06, 0.5, C.woodDark, [-1.72, 1.78, -1.72]);
      t.b.box(0.46, 0.3, 0.46, C.wood, [-1.72, 1.96, -1.72]);
      t.b.gable(0.56, 0.56, 0.2, C.roof, [-1.72, 2.12, -1.72]);
    },
  },
  {
    level: 6,
    spec: 'drill',
    height: 2.9,
    build: (t) => {
      // estande de tiro: alvos de dupla face e banca com sacos de areia
      for (let i = 0; i < 3; i++) {
        const x = 0.6 + i * 0.4;
        for (const s of [-1, 1]) t.b.box(0.03, 0.5, 0.03, C.woodDark, [x + s * 0.1, 0.41, 1.88]);
        t.b.box(0.26, 0.3, 0.02, C.white, [x, 0.58, 1.88]);
        for (const s of [-1, 1]) {
          t.b.cyl(0.09, 0.09, 0.006, C.red, [x, 0.58, 1.88 + s * 0.013], [Math.PI / 2, 0, 0], 12);
          t.b.cyl(0.035, 0.035, 0.008, C.white, [x, 0.58, 1.88 + s * 0.016], [Math.PI / 2, 0, 0], 8);
        }
      }
      sandbags(t, 0.45, 1.4, 1.55, 1.4);
      // torre de rapel nos fundos (plataforma, guarda-corpo, parede de escalada e corda)
      const tx = 0.45;
      const tz = -1.72;
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        t.b.box(0.05, 2.3, 0.05, C.woodDark, [tx + dx * 0.2, 1.31, tz + dz * 0.16]);
      t.b.box(0.52, 0.05, 0.42, C.wood, [tx, 2.48, tz]);
      t.b.box(0.52, 0.03, 0.03, C.woodDark, [tx, 2.72, tz - 0.2]);
      for (const s of [-1, 1]) t.b.box(0.03, 0.03, 0.42, C.woodDark, [tx + s * 0.25, 2.72, tz]);
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
      ] as const)
        t.b.box(0.03, 0.26, 0.03, C.woodDark, [tx + dx * 0.25, 2.6, tz + dz * 0.2]);
      t.b.box(0.42, 1.5, 0.04, C.wood, [tx, 1.0, tz + 0.18], [-0.12, 0, 0]);
      t.b.cyl(0.008, 0.008, 2.2, C.khaki, [tx + 0.18, 1.38, tz + 0.24], undefined, 4);
    },
  },
  {
    level: 6,
    spec: 'elite',
    height: 3.4,
    build: (t) => {
      camoNet(t);
      // viatura blindada leve estacionada na frente
      for (const dx of [-0.24, 0.02, 0.26]) for (const s of [-1, 1]) t.b.cyl(0.08, 0.08, 0.05, C.rubber, [1.0 + dx, 0.24, 1.62 + s * 0.17], [Math.PI / 2, 0, 0], 8);
      t.b.box(0.74, 0.2, 0.36, C.oliveDark, [1.0, 0.37, 1.62]);
      t.b.box(0.42, 0.13, 0.3, C.olive, [0.94, 0.53, 1.62]);
      t.b.cyl(0.05, 0.05, 0.06, C.metalDark, [1.08, 0.63, 1.62], undefined, 8);
      t.b.cyl(0.012, 0.012, 0.32, C.metalDark, [1.26, 0.65, 1.62], [0, 0, Math.PI / 2], 4);
      // mastro de comunicações com parabólica
      mast(t, 0.45, -1.75, 2.6);
      dish(t, 1.15, 1.76, -0.1, 0.2, Math.PI / 2);
    },
  },
  {
    level: 6,
    spec: 'enlistment',
    height: 2.6,
    build: (t) => {
      // tenda de alistamento, bandeiras e placa de recrutamento
      t.b.gable(0.95, 0.62, 0.48, C.olive, [1.0, 0.18, 1.56]);
      t.b.box(0.3, 0.3, 0.02, C.oliveDark, [1.0, 0.33, 1.875]);
      for (let i = 0; i < 3; i++) {
        const x = 0.55 + i * 0.45;
        t.b.cyl(0.014, 0.018, 1.7, C.steel, [x, 1.0, 1.93], undefined, 5);
        t.a.box(0.34, 0.2, 0.012, '#ffffff', [x + 0.18, 1.72, 1.93]);
      }
      t.b.box(0.04, 0.5, 0.04, C.woodDark, [1.63, 0.41, 1.42]);
      t.a.box(0.36, 0.24, 0.02, '#ffffff', [1.63, 0.72, 1.43]);
    },
  },
  {
    level: 7,
    height: 2.7,
    build: (t) => {
      // caixa-d'água elevada nos fundos
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        t.b.box(0.045, 1.7, 0.045, C.steel, [1.1 + dx * 0.17, 1.01, -1.72 + dz * 0.17]);
      for (const y of [0.7, 1.3]) for (const s of [-1, 1]) t.b.box(0.36, 0.02, 0.02, C.steel, [1.1, y, -1.72 + s * 0.17]);
      tank(t, 1.1, -1.72, 0.26, 0.48, C.concreteLight, 1.86, false);
    },
  },
  {
    level: 8,
    detail: true,
    build: (t) => {
      fence(t, -1.45, -1.93, 1.95, -1.93);
      fence(t, -1.93, -1.45, -1.93, 1.3);
    },
  },
  {
    level: 9,
    height: 2.6,
    build: (t) => {
      floodMast(t, -1.85, 1.85, 2.2);
      floodMast(t, 1.85, -0.6, 2.2);
    },
  },
  {
    level: 10,
    build: (t) => {
      t.a.box(1.6, 0.34, 0.03, '#ffffff', [0, 1.42, 1.23]);
      t.b.box(1.7, 0.06, 0.08, C.metalDark, [0, 1.62, 1.23]);
      dish(t, -1.15, 1.72, -0.1, 0.2, -Math.PI / 2);
    },
  },
];

const FACTORY: UpgradeModule[] = [
  {
    level: 2,
    detail: true,
    build: (t) => {
      lamp(t, -1.86, 1.82, 1.4, 0);
      lamp(t, 1.86, 1.86, 1.4, Math.PI);
    },
  },
  {
    level: 3,
    build: (t) => {
      for (const x of [-1.15, 0, 1.15]) {
        t.b.cyl(0.13, 0.15, 0.2, C.metal, [x - 0.3, 2.42, 0.9], undefined, 10);
        t.b.cyl(0.16, 0.16, 0.03, C.metalDark, [x - 0.3, 2.53, 0.9], undefined, 10);
      }
    },
  },
  { level: 4, build: (t) => tank(t, 1.5, -1.74, 0.2, 1.0, C.white, 0.16, false) },
  {
    level: 5,
    height: 3.0,
    build: (t) => {
      // pórtico rolante sobre o pátio
      for (const x of [-1.85, 0.6]) t.b.box(0.1, 2.1, 0.1, C.yellow, [x, 1.21, 1.8]);
      t.b.box(2.6, 0.14, 0.14, C.yellow, [-0.62, 2.28, 1.8]);
      t.b.box(0.25, 0.2, 0.25, C.metalDark, [-0.9, 2.12, 1.8]);
      t.b.cyl(0.01, 0.01, 1.1, C.steel, [-0.9, 1.5, 1.8], undefined, 4);
    },
  },
  {
    level: 6,
    spec: 'volume',
    height: 3.5,
    smoke: [[-0.35, 3.35, -1.72]],
    build: (t) => chimney(t, -0.35, -1.72, 3.2, 0.17),
  },
  {
    level: 6,
    spec: 'energy',
    build: (t) => {
      for (const x of [-1.15, 0, 1.15]) solar(t, x - 0.15, 1.95, -0.6, 1, 2, 0.5, 0.36, 0);
      // turbina eólica de pequeno porte
      t.b.cyl(0.04, 0.06, 2.6, C.white, [-0.4, 1.46, -1.78], undefined, 8);
      for (let k = 0; k < 3; k++) t.b.box(0.06, 0.7, 0.02, C.white, [-0.4 + Math.sin((k * 2 * Math.PI) / 3) * 0.33, 2.8 + Math.cos((k * 2 * Math.PI) / 3) * 0.33, -1.72], [0, 0, -(k * 2 * Math.PI) / 3]);
    },
  },
  {
    level: 6,
    spec: 'advanced',
    build: (t) => {
      // blindado em teste no pátio e radar de ensaio
      t.b.box(0.8, 0.22, 0.42, C.olive, [1.3, 0.42, 1.38]);
      t.b.box(0.4, 0.14, 0.3, C.oliveDark, [1.25, 0.6, 1.38]);
      t.b.cyl(0.02, 0.025, 0.55, C.metalDark, [1.6, 0.6, 1.38], [0, 0, Math.PI / 2], 6);
      for (const s of [-1, 1]) t.b.box(0.82, 0.12, 0.08, C.track, [1.3, 0.25, 1.38 + s * 0.2]);
      dish(t, 0.9, 2.3, -0.4, 0.32, 0);
    },
  },
  { level: 7, build: (t) => pipeRack(t, -0.5, 1.9, -1.86, 0.65) },
  {
    level: 8,
    detail: true,
    build: (t) => {
      pad(t, -0.6, 1.72, 1.4, 0.45);
      fence(t, 1.92, -1.9, 1.92, 1.0);
    },
  },
  {
    level: 9,
    build: (t) => {
      acUnit(t, -1.45, 2.3, -0.9, 0.8);
      acUnit(t, -0.3, 2.3, -0.9, 0.8);
      acUnit(t, 0.85, 2.3, -0.9, 0.8);
    },
  },
  {
    level: 10,
    height: 3.5,
    build: (t) => {
      t.a.box(2.2, 0.36, 0.03, '#ffffff', [0.2, 1.45, 1.475]);
      floodMast(t, 1.86, 0.4, 2.6);
    },
  },
];

const FARM: UpgradeModule[] = [
  {
    level: 2,
    detail: true,
    build: (t) => {
      lamp(t, -0.12, 1.75, 1.1, Math.PI / 2);
      for (let i = 0; i < 3; i++) t.b.cyl(0.13, 0.13, 0.22, '#c9b452', [-1.6 + i * 0.3, 0.17, -1.45], [Math.PI / 2, 0, 0], 10);
    },
  },
  { level: 3, height: 2.2, build: (t) => tank(t, 0.48, 0.78, 0.3, 1.3, C.concreteLight, 0.06, false) },
  {
    level: 4,
    build: (t) => {
      // estufa
      t.b.box(1.2, 0.04, 0.9, C.concreteDark, [-1.1, 0.08, -0.85]);
      t.g.box(1.18, 0.42, 0.88, '#ffffff', [-1.1, 0.31, -0.85]);
      t.g.side(
        [
          [-0.44, 0],
          [0.44, 0],
          [0, 0.26],
        ],
        1.18,
        '#ffffff',
        [-1.1, 0.52, -0.85],
        [0, Math.PI / 2, 0],
      );
      for (let i = 0; i < 4; i++) t.b.box(0.02, 0.7, 0.9, C.steel, [-1.68 + i * 0.39, 0.42, -0.85]);
    },
  },
  {
    level: 5,
    height: 2.4,
    build: (t) => {
      // caixa-d'água da irrigação
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        t.b.box(0.04, 1.3, 0.04, C.steel, [-1.62 + dx * 0.14, 0.7, 1.62 + dz * 0.14]);
      t.b.cyl(0.25, 0.25, 0.4, C.metal, [-1.62, 1.55, 1.62], undefined, 12);
      t.b.sphere(0.25, C.metal, [-1.62, 1.75, 1.62], [1, 0.4, 1], 12);
    },
  },
  {
    level: 6,
    spec: 'intensive',
    build: (t) => {
      // pulverizador com barra aberta e tambores de insumos na frente
      t.b.box(1.2, 0.05, 0.06, C.yellow, [0.82, 0.55, 1.62]);
      t.b.box(0.35, 0.3, 0.3, C.yellow, [0.82, 0.35, 1.62]);
      t.b.cyl(0.12, 0.12, 0.3, C.white, [0.82, 0.62, 1.62], [0, 0, Math.PI / 2], 10);
      for (const s of [-1, 1]) t.b.cyl(0.1, 0.1, 0.06, C.rubber, [0.82, 0.18, 1.62 + s * 0.17], [Math.PI / 2, 0, 0], 8);
      drums(t, 1.5, 1.45, 4, '#4f6b8a');
    },
  },
  {
    level: 6,
    spec: 'mechanized',
    build: (t) => {
      // colheitadeira estacionada na frente (plataforma de corte voltada para −x)
      t.b.box(0.7, 0.4, 0.4, '#4b7a3a', [1.05, 0.42, 1.62]);
      t.b.box(0.25, 0.25, 0.3, '#2a3a44', [0.82, 0.74, 1.62]);
      t.b.box(0.18, 0.14, 0.7, C.yellow, [0.6, 0.3, 1.62]);
      for (const s of [-1, 1]) t.b.cyl(0.14, 0.14, 0.08, C.rubber, [0.9, 0.2, 1.62 + s * 0.22], [Math.PI / 2, 0, 0], 10);
      t.b.cyl(0.04, 0.04, 0.6, '#4b7a3a', [1.3, 0.8, 1.62], [0, 0, -1.1], 6);
      // segundo trator junto ao primeiro
      tractor(t.b, t.g, -0.62, 0.06, -0.2, '#2f6f3a');
    },
  },
  {
    level: 6,
    spec: 'granary',
    height: 2.6,
    build: (t) => {
      tank(t, 0.95, 1.6, 0.26, 1.6, C.concreteLight, 0.06, false);
      tank(t, 0.4, 1.62, 0.24, 1.4, C.concreteLight, 0.06, false);
    },
  },
  // galpão de máquinas no fim do caminho interno, entre a estufa e o celeiro
  { level: 7, build: (t) => shed(t, -0.1, -0.98, 0.62, 0.62, 0.55, C.roof) },
  {
    level: 8,
    detail: true,
    build: (t) => {
      t.b.box(0.5, 0.02, 3.6, '#9a8a62', [-0.05, 0.075, 0]);
      fence(t, -1.9, 1.9, 1.9, 1.9, 0.3);
    },
  },
  {
    level: 9,
    height: 3.2,
    build: (t) => {
      // aerogerador
      t.b.cyl(0.04, 0.06, 2.6, C.white, [-1.75, 1.36, -1.75], undefined, 8);
      t.b.box(0.18, 0.12, 0.12, C.white, [-1.75, 2.7, -1.75]);
      for (let k = 0; k < 3; k++) t.b.box(0.05, 0.55, 0.02, C.white, [-1.75 + Math.sin((k * 2 * Math.PI) / 3) * 0.26, 2.7 + Math.cos((k * 2 * Math.PI) / 3) * 0.26, -1.68], [0, 0, -(k * 2 * Math.PI) / 3]);
    },
  },
  {
    level: 10,
    height: 3.4,
    build: (t) => {
      // elevador de grãos ao lado do silo
      t.b.box(0.24, 2.9, 0.24, C.metal, [1.78, 1.51, 0.12]);
      t.b.box(0.34, 0.25, 0.34, C.metalDark, [1.78, 3.0, 0.12]);
      pipe(t, [1.72, 2.9, 0.22], [1.4, 2.05, 0.65], 0.04, C.metal);
    },
  },
];

/** Britador com tremonha (base em `y0`). */
function crusher({ b }: ModuleTarget, x: number, z: number, y0: number): void {
  b.box(0.7, 0.5, 0.5, C.metal, [x, y0 + 0.25, z]);
  b.side(
    [
      [-0.3, 0],
      [0.3, 0],
      [0.18, -0.3],
      [-0.18, -0.3],
    ],
    0.46,
    C.metalDark,
    [x, y0 + 0.82, z],
    [0, Math.PI / 2, 0],
  );
  b.box(0.08, 0.5, 0.08, C.metalDark, [x + 0.3, y0 + 0.25, z + 0.2]);
}

/** Peneira vibratória sobre pés (deck inclinado para +x). */
function screenDeck({ b }: ModuleTarget, x: number, z: number, y0: number): void {
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    b.box(0.05, 0.55, 0.05, C.metal, [x + dx * 0.24, y0 + 0.275, z + dz * 0.17]);
  b.box(0.58, 0.28, 0.44, C.metalDark, [x, y0 + 0.69, z]);
  b.box(0.52, 0.03, 0.38, '#5f6b52', [x, y0 + 0.85, z], [0, 0, -0.2]);
}

// Serraria: galpão aberto no centro (x ±1,6; z −1,05…1,15), toras ao fundo à esquerda e tábuas na
// frente à direita. Laterais livres para os módulos (faixas x ±1,6…1,95).
const SAWMILL: UpgradeModule[] = [
  { level: 2, detail: true, build: (t) => lamp(t, 1.86, -1.86, 1.3, Math.PI / 2) },
  { level: 3, build: (t) => logPile(t, 1.15, -1.6, 3, 0.9) },
  {
    level: 4,
    smoke: [[-0.62, 1.45, 1.55]],
    build: (t) => {
      // estufa de secagem com chaminé
      annex(t, -1.0, 1.55, 1.1, 0.6, 0.55, C.brick, true, false);
      t.b.cyl(0.07, 0.08, 0.6, C.metalDark, [-0.62, 1.1, 1.55], undefined, 8);
    },
  },
  { level: 5, build: (t) => truck(t, 0.0, 1.45, C.yellow, Math.PI / 2) },
  {
    level: 6,
    spec: 'intensive',
    build: (t) => {
      // descascador de toras (tambor rotativo) na lateral, alimentando o galpão
      for (const z of [-0.65, 0.25]) t.b.box(0.3, 0.3, 0.08, C.metalDark, [-1.78, 0.31, z]);
      t.b.cyl(0.2, 0.2, 1.1, C.metal, [-1.78, 0.62, -0.2], [Math.PI / 2, 0, 0], 12);
      for (const z of [-0.75, 0.35]) t.b.cyl(0.215, 0.215, 0.05, C.metalDark, [-1.78, 0.62, z], [Math.PI / 2, 0, 0], 12);
      conveyor(t, [-1.6, 0.7, -0.2], [-1.05, 0.55, -0.2], 0.2);
    },
  },
  {
    level: 6,
    spec: 'efficient',
    height: 2.7,
    build: (t) => {
      // ciclone de serragem (aproveitamento de resíduos) com duto até o galpão e briquetes
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        t.b.box(0.04, 1.1, 0.04, C.steel, [1.78 + dx * 0.12, 0.71, -0.35 + dz * 0.12]);
      t.b.cyl(0.18, 0.05, 0.45, C.metal, [1.78, 1.45, -0.35], undefined, 12);
      t.b.cyl(0.18, 0.18, 0.5, C.metal, [1.78, 1.92, -0.35], undefined, 12);
      t.b.cyl(0.07, 0.07, 0.25, C.metalDark, [1.78, 2.3, -0.35], undefined, 8);
      pipe(t, [1.62, 2.0, -0.35], [1.0, 1.75, -0.35], 0.05, C.metal);
      for (let i = 0; i < 3; i++) t.b.box(0.3, 0.12, 0.25, '#b08a5a', [1.78, 0.22 + i * 0.12, 0.95]);
    },
  },
  {
    level: 6,
    spec: 'mechanized',
    height: 2.8,
    build: (t) => {
      // grua florestal sobre pedestal, com a garra sobre a pilha de toras
      t.b.cyl(0.12, 0.16, 0.3, C.metalDark, [0.35, 0.31, -1.3], undefined, 10);
      t.b.box(0.1, 1.5, 0.1, C.yellow, [0.35, 1.2, -1.3]);
      t.b.box(0.18, 0.2, 0.2, '#2a3a44', [0.35, 0.6, -1.12]);
      t.b.box(0.95, 0.08, 0.08, C.yellow, [0.78, 2.0, -1.3], [0, 0, 0.25]);
      t.b.box(0.6, 0.07, 0.07, C.yellow, [1.33, 1.82, -1.42], [0, 0.4, -0.9]);
      t.b.box(0.18, 0.12, 0.14, C.metalDark, [1.5, 1.5, -1.52]);
    },
  },
  {
    level: 7,
    build: (t) => {
      // silo de serragem com duto de exaustão do galpão
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        t.b.box(0.04, 0.8, 0.04, C.steel, [1.78 + dx * 0.13, 0.56, 0.4 + dz * 0.13]);
      t.b.box(0.34, 0.45, 0.34, C.concreteLight, [1.78, 1.18, 0.4]);
      t.b.cyl(0.17, 0.04, 0.25, C.metal, [1.78, 0.84, 0.4], undefined, 8);
      pipe(t, [1.78, 1.4, 0.4], [1.2, 1.7, 0.4], 0.04, C.metal);
    },
  },
  {
    level: 8,
    detail: true,
    build: (t) => {
      t.b.box(0.6, 0.02, 1.0, '#6b6458', [0, 0.17, 1.45]);
      fence(t, -1.92, -1.93, 1.6, -1.93);
    },
  },
  { level: 9, build: (t) => tank(t, -1.78, 0.78, 0.16, 0.9, C.metal, 0.16, false) },
  { level: 10, height: 2.9, build: (t) => floodMast(t, 1.86, 1.86, 2.4) },
];

// Pedreira (piso em y 0,06): escavadeira no centro, blocos e esteira ao fundo, escritório na frente à
// direita. A frente à esquerda recebe as máquinas da especialização.
const QUARRY: UpgradeModule[] = [
  { level: 2, detail: true, build: (t) => lamp(t, -1.86, 1.86, 1.3, 0) },
  {
    level: 3,
    build: (t) => {
      for (let i = 0; i < 4; i++) t.b.box(0.32, 0.26, 0.3, C.stone, [-1.7 + (i % 2) * 0.36, 0.19 + Math.floor(i / 2) * 0.26, -0.45]);
    },
  },
  { level: 4, build: (t) => crusher(t, 1.55, 0.65, 0.06) },
  { level: 5, build: (t) => truck(t, 0.25, 1.55, C.yellow, 0, 0.06) },
  {
    level: 6,
    spec: 'intensive',
    build: (t) => {
      // segunda escavadeira carregando o caminhão e tambores de explosivos
      crawler(t, -1.1, 1.45, C.yellow, 0, 0.06);
      drums(t, -1.85, 0.5, 4, '#8a3f30', 0.06);
    },
  },
  {
    level: 6,
    spec: 'efficient',
    build: (t) => {
      // peneira com esteira de alimentação e pilha de agregado classificado
      screenDeck(t, -1.3, 1.1, 0.06);
      conveyor(t, [-1.75, 0.3, 0.5], [-1.45, 0.85, 1.0], 0.18);
      t.b.cyl(0, 0.34, 0.42, C.stone, [-0.75, 0.27, 1.25], undefined, 7);
    },
  },
  { level: 6, spec: 'mechanized', build: (t) => loader(t, -1.1, 1.45, C.yellow, 0, 0.06) },
  { level: 7, build: (t) => conveyor(t, [1.75, 0.45, 0.35], [1.75, 1.05, -0.75], 0.22) },
  {
    level: 8,
    detail: true,
    build: (t) => {
      t.b.box(0.6, 0.02, 0.95, '#6b6458', [0.25, 0.07, 1.47]);
      fence(t, -1.6, 1.93, 1.7, 1.93, 0.35, 0.06);
    },
  },
  { level: 9, build: (t) => tank(t, -1.72, -1.72, 0.2, 0.9, C.metal, 0.06, false) },
  { level: 10, height: 2.9, build: (t) => floodMast(t, 1.86, 1.86, 2.4) },
];

// Mina (piso em y 0,06): encosta ao fundo (x ±1,6; z −1,9…−0,3; topo plano em y 1,26), trilhos no
// centro, castelete à direita (z 0,6) e pilha de minério na frente à esquerda.
const MINE: UpgradeModule[] = [
  { level: 2, detail: true, build: (t) => lamp(t, 0.8, -0.15, 1.2, Math.PI) },
  {
    level: 3,
    build: (t) => {
      // caçambas de minério separado
      for (const z of [-0.08, 0.28]) {
        t.b.box(0.36, 0.26, 0.3, C.woodDark, [1.72, 0.19, z]);
        t.b.box(0.3, 0.06, 0.24, '#8a4b32', [1.72, 0.33, z]);
      }
    },
  },
  { level: 4, build: (t) => crusher(t, 0.78, 0.25, 0.06) },
  { level: 5, build: (t) => truck(t, 1.15, 1.55, C.yellow, 0, 0.06) },
  {
    level: 6,
    spec: 'intensive',
    build: (t) => {
      crawler(t, -1.15, 0.2, C.yellow, 0, 0.06);
      drums(t, -1.85, -0.05, 2, '#8a3f30', 0.06);
    },
  },
  {
    level: 6,
    spec: 'efficient',
    build: (t) => {
      // separação de minério: peneira, esteira até a pilha e rejeito em pilha própria
      screenDeck(t, -1.0, 0.15, 0.06);
      conveyor(t, [-1.1, 0.75, 0.36], [-1.3, 0.8, 0.85], 0.18);
      t.b.cyl(0, 0.3, 0.32, C.stone, [-1.7, 0.22, -0.05], undefined, 7);
    },
  },
  { level: 6, spec: 'mechanized', build: (t) => loader(t, -1.1, 0.2, C.yellow, 0, 0.06) },
  {
    level: 7,
    build: (t) => {
      // tubos de ventilação e ar comprimido subindo pela face da encosta
      for (const [x, color] of [
        [-0.8, C.yellow],
        [-0.68, C.steel],
      ] as const) {
        pipe(t, [x, 0.06, -0.25], [x, 1.3, -0.25], 0.035, color);
        pipe(t, [x, 1.3, -0.25], [x, 1.3, -1.0], 0.035, color);
      }
    },
  },
  {
    level: 8,
    detail: true,
    build: (t) => {
      t.b.box(0.6, 0.02, 0.95, '#6b6458', [1.15, 0.07, 1.47]);
      fence(t, -1.6, 1.93, 1.7, 1.93, 0.35, 0.06);
    },
  },
  {
    level: 9,
    height: 2.3,
    build: (t) => {
      // poço de ventilação no alto da encosta
      t.b.box(0.5, 0.2, 0.5, C.concrete, [0.45, 1.36, -1.25]);
      t.b.cyl(0.16, 0.16, 0.6, C.metal, [0.45, 1.76, -1.25], undefined, 12);
      t.b.cyl(0.24, 0.24, 0.05, C.metalDark, [0.45, 2.1, -1.25], undefined, 12);
      for (const s of [-1, 1]) t.b.box(0.03, 0.08, 0.03, C.steel, [0.45 + s * 0.18, 2.05, -1.25]);
    },
  },
  { level: 10, height: 2.9, build: (t) => floodMast(t, -1.85, 1.85, 2.4) },
];

const OIL_WELL: UpgradeModule[] = [
  { level: 2, detail: true, build: (t) => lamp(t, 1.86, 1.86, 1.2, Math.PI) },
  { level: 3, build: (t) => vessel(t, -0.3, 1.5, 1.2, 0.18, C.white) },
  {
    level: 4,
    build: (t) => {
      tank(t, 1.5, 0.15, 0.25, 0.7, C.white);
      tank(t, 1.5, 0.75, 0.25, 0.7, C.white, 0.16, false);
    },
  },
  {
    level: 5,
    height: 3.4,
    smoke: [[-1.5, 3.2, -1.5]],
    build: (t) => {
      // tocha de queima de gás
      t.b.cyl(0.05, 0.08, 3.0, C.steel, [-1.5, 1.56, -1.5], undefined, 8);
      for (const s of [-1, 1]) t.b.cyl(0.01, 0.01, 2.1, C.steel, [-1.5 + s * 0.35, 1.1, -1.5], [0, 0, -s * 0.17], 4);
      t.b.cyl(0.08, 0.06, 0.12, C.metalDark, [-1.5, 3.1, -1.5], undefined, 8);
      t.a.sphere(0.06, '#ffffff', [-1.5, 3.2, -1.5], undefined, 6);
    },
  },
  {
    level: 6,
    spec: 'enhanced',
    build: (t) => {
      // bombas de injeção e tanque de água
      t.b.box(0.8, 0.35, 0.45, C.metal, [-1.1, 0.33, -0.6]);
      t.b.cyl(0.1, 0.1, 0.5, C.red, [-0.8, 0.45, -0.6], [0, 0, Math.PI / 2], 8);
      tank(t, -0.55, -1.5, 0.28, 0.8, '#4f6b8a', 0.06, false);
    },
  },
  {
    level: 6,
    spec: 'conservation',
    build: (t) => {
      annex(t, -1.15, -0.85, 0.8, 0.45, 0.55, C.concreteLight, true, true);
      mast(t, -0.65, -1.2, 1.6);
    },
  },
  {
    level: 6,
    spec: 'lean',
    build: (t) => {
      solar(t, -1.1, 0.06, -0.8, 2, 2, 0.4, 0.3, 0);
      t.b.box(0.3, 0.45, 0.2, C.metalDark, [-0.4, 0.29, -1.4]);
    },
  },
  { level: 7, build: (t) => pipeRack(t, -1.0, 1.3, 1.0, 0.45) },
  {
    level: 8,
    detail: true,
    build: (t) => {
      pad(t, 0.2, -1.65, 3.2, 0.45, false, C.concreteDark);
      fence(t, -1.92, 1.92, 1.92, 1.92, 0.35);
    },
  },
  {
    level: 9,
    build: (t) => {
      // segundo poço com cavalo-mecânico (parado, em escala menor) na frente à direita
      staticPumpjack(t.b, [1.39, 0.06, 1.55], 0.42);
    },
  },
  { level: 10, height: 3.4, build: (t) => annex(t, 0.8, -1.55, 1.2, 0.7, 0.6, C.concreteLight, true, true) },
];

const WAREHOUSE: UpgradeModule[] = [
  {
    level: 2,
    detail: true,
    build: (t) => {
      lamp(t, -1.86, 1.86, 1.2, 0);
      lamp(t, 1.86, 1.86, 1.2, Math.PI);
    },
  },
  {
    level: 3,
    build: (t) => {
      // na água da frente do telhado (inclinação 0,35 rad)
      for (const x of [-1.0, 0, 1.0]) t.g.box(0.5, 0.02, 0.5, '#ffffff', [x, 1.68, 0.35], [0.346, 0, 0]);
    },
  },
  {
    level: 4,
    build: (t) => {
      // cobertura das docas
      t.b.box(3.3, 0.05, 0.6, C.metal, [0, 1.25, 1.22]);
      for (const x of [-1.6, 0, 1.6]) t.b.box(0.05, 1.05, 0.05, C.metalDark, [x, 0.72, 1.5]);
    },
  },
  {
    level: 5,
    height: 2.4,
    build: (t) => {
      // lanternim (ventilação e luz natural) ao longo da cumeeira
      t.b.box(2.6, 0.28, 0.5, C.concreteDark, [0, 1.98, -0.3]);
      t.g.box(2.5, 0.12, 0.02, '#ffffff', [0, 1.98, -0.04]);
      t.b.gable(2.7, 0.6, 0.16, C.roof, [0, 2.12, -0.3]);
    },
  },
  {
    level: 6,
    spec: 'capacity',
    build: (t) => {
      // estantes de paletes ao ar livre
      for (const x of [-1.85, 1.85])
        for (let y = 0; y < 3; y++) t.b.box(0.18, 0.04, 2.2, C.steel, [x, 0.3 + y * 0.35, -0.3]);
      for (const x of [-1.85, 1.85]) for (let i = 0; i < 4; i++) t.b.box(0.16, 0.25, 0.4, C.wood, [x, 0.46 + (i % 3) * 0.35, -1.1 + i * 0.55]);
    },
  },
  {
    level: 6,
    spec: 'hardened',
    build: (t) => {
      for (const x of [-1.5, -0.75, 0.75, 1.5]) jersey(t, x, 1.88, 0, 0.6);
      for (const x of [-0.9, 0.9]) t.b.box(0.95, 0.9, 0.06, C.metalDark, [x, 0.6, 0.98]);
      t.b.box(0.08, 0.9, 2.2, C.concreteDark, [-1.78, 0.6, -0.3]);
      t.b.box(0.08, 0.9, 2.2, C.concreteDark, [1.78, 0.6, -0.3]);
    },
  },
  {
    level: 7,
    height: 2.6,
    build: (t) => {
      for (const x of [-1.7, 1.7]) t.b.box(0.08, 1.9, 0.08, C.yellow, [x, 1.11, 1.72]);
      t.b.box(3.5, 0.1, 0.12, C.yellow, [0, 2.06, 1.72]);
      t.b.box(0.22, 0.16, 0.2, C.metalDark, [0.5, 1.94, 1.72]);
    },
  },
  {
    level: 8,
    detail: true,
    build: (t) => {
      fence(t, -1.92, -1.92, 1.92, -1.92);
      pad(t, 0, 1.75, 3.6, 0.35);
    },
  },
  {
    level: 9,
    build: (t) => {
      acUnit(t, -1.1, 1.55, -1.25, 0.7);
      acUnit(t, 1.1, 1.55, -1.25, 0.7);
    },
  },
  {
    level: 10,
    height: 2.8,
    build: (t) => {
      floodMast(t, -1.86, -1.86, 2.4);
      floodMast(t, 1.86, -1.86, 2.4);
    },
  },
];

const SILO: UpgradeModule[] = [
  { level: 2, detail: true, build: (t) => lamp(t, 0.82, -0.82, 1.1, Math.PI / 2) },
  {
    level: 3,
    build: (t) => {
      // passarela no topo
      t.b.cyl(0.66, 0.66, 0.03, C.metalDark, [-0.15, 2.0, -0.1], undefined, 14);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        t.b.box(0.02, 0.25, 0.02, C.steel, [-0.15 + Math.cos(a) * 0.64, 2.13, -0.1 + Math.sin(a) * 0.64]);
      }
    },
  },
  { level: 4, build: (t) => tank(t, 0.6, -0.62, 0.24, 1.3, C.concreteLight, 0.1, false) },
  {
    level: 5,
    height: 3.1,
    build: (t) => {
      // corpo prolongado
      t.b.cyl(0.55, 0.55, 0.7, C.concreteLight, [-0.15, 2.45, -0.1], undefined, 14);
      t.b.sphere(0.56, C.metal, [-0.15, 2.8, -0.1], [1, 0.55, 1], 14);
      t.b.box(0.06, 0.8, 0.06, C.steel, [0.45, 2.5, 0.35]);
    },
  },
  { level: 6, spec: 'capacity', height: 3.1, build: (t) => tank(t, -0.62, 0.62, 0.26, 1.7, C.concreteLight, 0.1, false) },
  {
    level: 6,
    spec: 'hardened',
    build: (t) => {
      t.b.cyl(0.62, 0.66, 0.9, C.concreteDark, [-0.15, 0.55, -0.1], undefined, 14);
      sandbags(t, -0.9, 0.85, 0.2, 0.85);
    },
  },
  {
    level: 7,
    height: 3.5,
    build: (t) => {
      t.b.box(0.18, 3.2, 0.18, C.metal, [0.75, 1.7, 0.75]);
      pipe(t, [0.75, 3.2, 0.7], [0.0, 2.7, 0.0], 0.04, C.metal);
    },
  },
  { level: 8, detail: true, build: (t) => pad(t, 0, 0.75, 1.7, 0.35, false, C.concreteDark) },
  {
    level: 9,
    build: (t) => {
      // ventiladores de aeração ao pé do silo, longe da moega e do silo extra
      for (const a of [1.5, 3.1, 4.3]) acUnit(t, -0.15 + Math.cos(a) * 0.74, 0.1, -0.1 + Math.sin(a) * 0.74, 0.45);
    },
  },
  {
    level: 10,
    height: 3.6,
    build: (t) => {
      t.b.cyl(0.015, 0.015, 0.6, C.steel, [-0.15, 3.25, -0.1], undefined, 4);
      t.b.sphere(0.05, C.red, [-0.15, 3.56, -0.1], undefined, 6);
    },
  },
];

/** Guarda-corpo circular no teto do tanque de petróleo (teto em `y`). */
function tankRailing({ b }: ModuleTarget, y: number): void {
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    b.box(0.02, 0.18, 0.02, C.steel, [Math.cos(a) * 0.62, y + 0.1, Math.sin(a) * 0.62]);
  }
  // raio um pouco menor que o costado: quando o tanque cresce, o guarda-corpo antigo fica dentro
  b.cyl(0.635, 0.635, 0.015, C.steel, [0, y + 0.18, 0], undefined, 16);
}

const OIL_TANK: UpgradeModule[] = [
  { level: 2, detail: true, build: (t) => lamp(t, 0.85, 0.85, 1.0, Math.PI) },
  { level: 3, build: (t) => tankRailing(t, 1.12) },
  {
    level: 4,
    build: (t) => {
      t.b.box(0.22, 0.2, 0.18, C.red, [0.62, 0.3, 0.62]);
      pipe(t, [0.55, 0.35, 0.55], [0.35, 0.35, 0.35], 0.03);
    },
  },
  {
    level: 5,
    height: 1.9,
    build: (t) => {
      // anel extra: o teto sobe e o guarda-corpo vai junto
      t.b.cyl(0.65, 0.65, 0.55, C.white, [0, 1.38, 0], undefined, 16);
      t.b.cyl(0.66, 0.66, 0.05, C.metal, [0, 1.67, 0], undefined, 16);
      tankRailing(t, 1.67);
    },
  },
  {
    level: 6,
    spec: 'capacity',
    height: 2.5,
    build: (t) => {
      t.b.cyl(0.65, 0.65, 0.4, C.white, [0, 1.88, 0], undefined, 16);
      t.b.cyl(0.66, 0.66, 0.05, C.metal, [0, 2.1, 0], undefined, 16);
      tankRailing(t, 2.1);
    },
  },
  {
    level: 6,
    spec: 'hardened',
    build: (t) => {
      for (const [x, z, w, d] of [
        [0, 0.88, 1.8, 0.12],
        [0, -0.88, 1.8, 0.12],
        [0.88, 0, 0.12, 1.8],
        [-0.88, 0, 0.12, 1.8],
      ] as const)
        t.b.box(w, 0.55, d, C.concreteDark, [x, 0.38, z]);
    },
  },
  {
    level: 7,
    build: (t) => {
      pipe(t, [0.7, 0.2, -0.7], [0.7, 1.75, -0.7], 0.03, C.red);
      pipe(t, [0.7, 1.75, -0.7], [0.2, 1.8, -0.2], 0.03, C.red);
    },
  },
  { level: 8, detail: true, build: (t) => pad(t, 0, 0.0, 1.7, 1.7, false, C.concreteDark) },
  // câmara de espuma (combate a incêndio) no teto, na altura de cada especialização
  { level: 9, spec: 'capacity', build: (t) => t.b.sphere(0.3, C.metal, [0, 2.13, 0], [1, 0.45, 1], 12) },
  { level: 9, spec: 'hardened', build: (t) => t.b.sphere(0.3, C.metal, [0, 1.7, 0], [1, 0.45, 1], 12) },
  {
    level: 10,
    spec: 'capacity',
    height: 2.8,
    build: (t) => {
      t.b.cyl(0.015, 0.015, 0.5, C.steel, [0.5, 2.37, 0.0], undefined, 4);
      t.b.sphere(0.05, C.red, [0.5, 2.63, 0], undefined, 6);
    },
  },
  {
    level: 10,
    spec: 'hardened',
    height: 2.4,
    build: (t) => {
      t.b.cyl(0.015, 0.015, 0.5, C.steel, [0.5, 1.94, 0.0], undefined, 4);
      t.b.sphere(0.05, C.red, [0.5, 2.2, 0], undefined, 6);
    },
  },
];

const HOUSE: UpgradeModule[] = [
  {
    level: 2,
    build: (t) => {
      // puxadinho lateral
      t.b.box(0.32, 0.5, 0.6, C.concreteLight, [0.74, 0.31, 0.05]);
      t.b.box(0.36, 0.04, 0.64, C.roofRed, [0.74, 0.58, 0.05], [0, 0, -0.18]);
      t.g.box(0.03, 0.16, 0.2, '#ffffff', [0.905, 0.38, 0.05]);
    },
  },
  {
    level: 3,
    height: 1.95,
    build: (t) => {
      // segundo pavimento
      t.b.box(1.15, 0.55, 0.95, C.concreteLight, [0, 1.08, 0]);
      t.b.gable(1.3, 1.1, 0.45, C.roofRed, [0, 1.36, 0]);
      t.g.box(0.22, 0.2, 0.04, '#ffffff', [-0.28, 1.1, 0.49]);
      t.g.box(0.22, 0.2, 0.04, '#ffffff', [0.25, 1.1, 0.49]);
      t.b.box(0.12, 0.3, 0.12, C.brick, [0.35, 1.7, -0.2]);
    },
  },
];

const RESIDENTIAL: UpgradeModule[] = [
  {
    level: 2,
    detail: true,
    build: (t) => {
      lamp(t, 1.75, 1.75, 1.2, Math.PI);
      for (const x of [0.6, 1.1]) t.b.box(0.36, 0.08, 0.12, C.wood, [x, 0.25, 1.85]);
    },
  },
  { level: 3, build: (t) => solar(t, 0.2, 2.85, 0.15, 3, 1, 0.42, 0.3) },
  {
    level: 4,
    detail: true,
    build: (t) => {
      pad(t, 1.15, 1.25, 1.4, 1.1, false);
      t.b.box(0.42, 0.16, 0.22, '#7e2f2a', [0.85, 0.27, 1.05]);
      t.b.box(0.42, 0.16, 0.22, '#3d5874', [1.4, 0.27, 1.05]);
    },
  },
  {
    level: 5,
    height: 3.8,
    build: (t) => {
      // quinto pavimento
      t.b.box(2.6, 0.6, 1.7, C.concrete, [0, 3.15, -0.3]);
      t.b.box(2.7, 0.1, 1.8, C.concreteDark, [0, 3.5, -0.3]);
      for (let i = 0; i < 5; i++) t.g.box(0.26, 0.28, 0.04, '#ffffff', [-1.0 + i * 0.5, 3.15, 0.56]);
      // caixa-d'água e painéis solares sobem para a nova cobertura
      t.b.box(0.5, 0.3, 0.4, C.metal, [0.8, 3.7, -0.6]);
      solar(t, 0.2, 3.55, 0.15, 3, 1, 0.42, 0.3);
    },
  },
  {
    level: 6,
    spec: 'dense',
    height: 5.0,
    build: (t) => {
      for (const y of [3.85, 4.45]) {
        t.b.box(2.6, 0.6, 1.7, C.concrete, [0, y, -0.3]);
        for (let i = 0; i < 5; i++) t.g.box(0.26, 0.28, 0.04, '#ffffff', [-1.0 + i * 0.5, y, 0.56]);
      }
      t.b.box(2.7, 0.1, 1.8, C.concreteDark, [0, 4.8, -0.3]);
      t.b.box(0.5, 0.3, 0.4, C.metal, [0.8, 5.0, -0.6]);
      solar(t, 0.2, 4.85, 0.15, 3, 1, 0.42, 0.3);
    },
  },
  {
    level: 6,
    spec: 'self_sufficient',
    build: (t) => {
      // cobertura solar do estacionamento, horta no terraço e cisternas
      for (const x of [0.6, 1.7]) t.b.box(0.05, 0.75, 0.05, C.steel, [x, 0.55, 1.65]);
      solar(t, 1.15, 0.85, 1.2, 2, 2, 0.5, 0.36);
      for (const x of [-0.9, -0.3, 0.3]) t.b.box(0.5, 0.08, 0.5, '#4b6b32', [x, 3.55, -0.7]);
      tank(t, -1.55, -1.6, 0.22, 0.7, '#4f6b8a', 0.16, false);
    },
  },
  {
    level: 7,
    detail: true,
    build: (t) => {
      // pracinha
      t.b.box(0.05, 0.5, 0.05, C.red, [-1.5, 0.41, 1.75]);
      t.b.box(0.05, 0.5, 0.05, C.red, [-1.1, 0.41, 1.75]);
      t.b.box(0.45, 0.04, 0.04, C.red, [-1.3, 0.66, 1.75]);
    },
  },
  { level: 8, detail: true, build: (t) => pad(t, 0, 0.72, 2.8, 0.25, false, C.concreteLight) },
  { level: 9, spec: 'self_sufficient', height: 4.6, build: (t) => mast(t, -1.05, 0.25, 1.2, 3.55) },
  { level: 9, spec: 'dense', height: 6.2, build: (t) => mast(t, -1.05, 0.25, 1.2, 4.85) },
  { level: 10, height: 4.6, build: (t) => t.a.box(2.62, 0.16, 0.02, '#ffffff', [0, 3.4, 0.565]) },
];

const TOWER: UpgradeModule[] = [
  {
    level: 2,
    build: (t) => {
      sandbags(t, -0.85, 0.85, 0.85, 0.85);
      sandbags(t, -0.85, -0.85, 0.85, -0.85);
      t.b.box(0.04, 3.0, 0.3, C.steel, [0.62, 1.55, 0.0]);
    },
  },
  {
    level: 3,
    build: (t) => {
      // chapas de blindagem na cabine
      t.b.box(1.12, 0.32, 0.04, C.metalDark, [0, 3.25, 0.57]);
      t.b.box(1.12, 0.32, 0.04, C.metalDark, [0, 3.25, -0.57]);
      t.b.box(0.04, 0.32, 1.12, C.metalDark, [0.57, 3.25, 0]);
      t.b.box(0.04, 0.32, 1.12, C.metalDark, [-0.57, 3.25, 0]);
    },
  },
  {
    level: 4,
    height: 5.0,
    build: (t) => {
      dish(t, -0.3, 4.15, 0.2, 0.22, 0.5);
      t.b.cyl(0.12, 0.15, 0.2, C.metalDark, [-0.45, 3.85, -0.45], [0.6, 0, 0.6], 8);
    },
  },
  {
    level: 5,
    build: (t) => {
      // base de concreto armado
      for (const [x, z] of [
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6],
      ] as const)
        t.b.box(0.22, 1.2, 0.22, C.concreteDark, [x * 0.82, 0.74, z * 0.82]);
      t.b.box(0.5, 0.05, 0.05, C.metalDark, [-0.55, 3.45, 0.3]);
    },
  },
];

export const UPGRADE_MODULES: Partial<Record<BuildingType, UpgradeModule[]>> = {
  hq: HQ,
  barracks: BARRACKS,
  factory: FACTORY,
  farm: FARM,
  sawmill: SAWMILL,
  quarry: QUARRY,
  mine: MINE,
  oil_well: OIL_WELL,
  warehouse: WAREHOUSE,
  silo: SILO,
  oil_tank: OIL_TANK,
  house: HOUSE,
  residential: RESIDENTIAL,
  tower: TOWER,
};

/** Módulos visíveis em `level` com `spec` (os da especialização só a partir do nível dela). */
export function modulesFor(type: BuildingType, level: number, spec: SpecId | null): UpgradeModule[] {
  return (UPGRADE_MODULES[type] ?? []).filter((m) => m.level <= level && (!m.spec || m.spec === spec));
}
