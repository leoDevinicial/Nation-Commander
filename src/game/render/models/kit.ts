import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Nível de detalhe dos modelos. No Ultra, caixas ganham arestas arredondadas (que pegam luz como
 * concreto e chapa reais) e cilindros/esferas têm o dobro de segmentos — menos "tudo quadrado".
 * Definido antes de os modelos serem montados (os caches são limpos ao fim de cada partida).
 */
export type ModelDetail = 'standard' | 'ultra';
let detail: ModelDetail = 'standard';
export function setModelDetail(d: ModelDetail): void {
  detail = d;
}
export function modelDetail(): ModelDetail {
  return detail;
}
/** Peças menores que isto continuam com quinas vivas (economia de vértices sem perda visível). */
const ROUND_MIN = 0.08;

type V3 = [number, number, number];

export interface PartOpts {
  pos?: V3;
  rot?: V3;
  scale?: V3;
}

/**
 * Monta um modelo low-poly a partir de primitivas. Cada peça recebe uma cor de vértice e todas
 * são fundidas numa única geometria (uma chamada de desenho por camada de material).
 */
export class PartBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly tmpColor = new THREE.Color();

  add(source: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    const g = source.index ? source.toNonIndexed() : source.clone();
    g.deleteAttribute('uv');
    g.deleteAttribute('uv1');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(o.pos ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(o.scale ?? [1, 1, 1])),
    );
    g.applyMatrix4(m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    const c = this.tmpColor.set(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    // mantém só os atributos comuns para a fusão
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
    this.parts.push(g);
    source.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: V3, rot?: V3): this {
    const m = Math.min(w, h, d);
    const geo = detail === 'ultra' && m >= ROUND_MIN ? new RoundedBoxGeometry(w, h, d, 1, Math.min(0.06, m * 0.18)) : new THREE.BoxGeometry(w, h, d);
    return this.add(geo, color, { pos, rot });
  }

  cyl(rTop: number, rBottom: number, h: number, color: THREE.ColorRepresentation, pos: V3, rot?: V3, segments = 10): this {
    const seg = detail === 'ultra' ? Math.min(32, segments * 2) : segments;
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, { pos, rot });
  }

  sphere(r: number, color: THREE.ColorRepresentation, pos: V3, scale?: V3, segments = 8): this {
    const seg = detail === 'ultra' ? Math.min(24, segments * 2) : segments;
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), color, { pos, scale });
  }

  /** Perfil lateral (x, y) extrudado ao longo de z, centrado em z = 0. */
  side(profile: [number, number][], depth: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], rot?: V3): this {
    const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, { pos, rot });
  }

  /** Perfil em planta (x, z) extrudado para cima (y) com altura h. */
  plan(profile: [number, number][], h: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0]): this {
    const shape = new THREE.Shape(profile.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, { pos });
  }

  /** Telhado de duas águas ao longo de x. */
  gable(w: number, d: number, h: number, color: THREE.ColorRepresentation, pos: V3, rotY = 0): this {
    return this.side(
      [
        [-d / 2, 0],
        [d / 2, 0],
        [0, h],
      ],
      w,
      color,
      pos,
      [0, Math.PI / 2 + rotY, 0],
    );
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('Falha ao fundir geometrias do modelo');
    merged.computeBoundingSphere();
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return merged;
  }
}

/** Camadas de um modelo: corpo (cores de vértice), detalhes da facção e vidros. */
export interface ModelLayers {
  body: THREE.BufferGeometry;
  accent: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
}

export function layers(): { body: PartBuilder; accent: PartBuilder; glass: PartBuilder; build: () => ModelLayers } {
  const body = new PartBuilder();
  const accent = new PartBuilder();
  const glass = new PartBuilder();
  return { body, accent, glass, build: () => ({ body: body.build(), accent: accent.build(), glass: glass.build() }) };
}

/** Paleta comum aos modelos (tons militares e de construção civil). */
export const C = {
  olive: '#5d6542',
  oliveDark: '#474e33',
  oliveLight: '#737b55',
  khaki: '#8a8160',
  track: '#2c2d2a',
  rubber: '#232422',
  metal: '#626870',
  metalDark: '#3c4046',
  steel: '#8b9198',
  skin: '#c49a74',
  boot: '#2a2924',
  concrete: '#aaa597',
  concreteDark: '#807b70',
  concreteLight: '#c0bbb0',
  asphalt: '#45484c',
  roof: '#676b70',
  roofRed: '#9a4434',
  brick: '#a0583f',
  wood: '#8a6a45',
  woodDark: '#5e4630',
  sandbag: '#a8996e',
  yellow: '#d6a92c',
  white: '#d9d8d0',
  red: '#b93a2e',
  crop: '#9fae4a',
  cropRipe: '#c9b452',
  soil: '#5a4430',
  stone: '#9a968d',
  oil: '#1d1c1a',
} as const;
