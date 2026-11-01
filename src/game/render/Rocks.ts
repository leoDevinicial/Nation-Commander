import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Random } from "../../../shared/sim/Random.ts";
import { withFog } from "./materials.ts";

/**
 * Formações rochosas procedurais em low poly facetado, no lugar das pedras soltas de cores variadas:
 * - matacões: um bloco grande arredondado e dois menores encostados, com musgo nas faces de cima;
 * - afloramento em camadas: lajes empilhadas e deslocadas, como rocha sedimentar;
 * - penhasco: uma lasca alta e inclinada com blocos caídos no pé;
 * - cascalho: várias pedras pequenas espalhadas.
 * Paleta única de pedra (cinza quente, mais escuro embaixo e mais claro em cima); nas células de minério a
 * instância ganha um tom ferruginoso. Desenhadas em lote (uma malha instanciada por variante).
 */

export interface RockInstance {
  x: number;
  z: number;
  s: number;
  r: number;
  v: number;
  ore?: boolean;
}

const STONE = new THREE.Color("#8a857b");
const STONE_DARK = new THREE.Color("#6f6a61");
const MOSS = new THREE.Color("#5d7040");

/** Pedra facetada: icosaedro com os vértices unidos (sem frestas) e deformados, achatada e com a base plana. */
function stone(
  rng: Random,
  r: number,
  stretch: [number, number, number],
  detail = 0,
): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + rng.next() * 0.35;
    const y = Math.max(p.getY(i) * k * stretch[1], -r * 0.25);
    p.setXYZ(i, p.getX(i) * k * stretch[0], y, p.getZ(i) * k * stretch[2]);
  }
  return g.toNonIndexed();
}

/** Cor por vértice: mais escuro embaixo, mais claro em cima e, se `moss`, verde nas faces viradas para cima. */
function paint(
  g: THREE.BufferGeometry,
  base: THREE.Color,
  moss: number,
): THREE.BufferGeometry {
  g.computeVertexNormals();
  const pos = g.attributes.position!;
  const nor = g.attributes.normal!;
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y;
  const y1 = g.boundingBox!.max.y;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    // a face inteira com a mesma cor (facetado): média da altura e da normal dos três vértices
    let y = 0;
    let ny = 0;
    for (let j = 0; j < 3; j++) {
      y += pos.getY(i + j) / 3;
      ny += nor.getY(i + j) / 3;
    }
    const t = (y - y0) / Math.max(1e-3, y1 - y0);
    c.copy(STONE_DARK)
      .lerp(base, Math.min(1, t * 1.3))
      .multiplyScalar(0.85 + t * 0.25);
    if (moss > 0 && ny > 0.75) c.lerp(MOSS, moss);
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = c.r;
      col[(i + j) * 3 + 1] = c.g;
      col[(i + j) * 3 + 2] = c.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function place(
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function boulders(seed: number): THREE.BufferGeometry {
  const rng = new Random(seed);
  return mergeGeometries([
    paint(place(stone(rng, 0.62, [1.15, 0.8, 1], 1), 0, 0.32, 0), STONE, 0.45),
    paint(
      place(stone(rng, 0.36, [1, 0.75, 1.1], 0), 0.62, 0.18, 0.25, 0.6),
      STONE,
      0.3,
    ),
    paint(
      place(stone(rng, 0.24, [1.1, 0.7, 1], 0), -0.45, 0.12, 0.45, 1.3),
      STONE,
      0,
    ),
  ])!;
}

function strata(seed: number): THREE.BufferGeometry {
  const rng = new Random(seed);
  const parts: THREE.BufferGeometry[] = [];
  let y = 0.1;
  for (let k = 0; k < 3; k++) {
    const r = 0.7 - k * 0.15;
    const g = stone(rng, r, [1.25, 0.32, 0.95], 0);
    parts.push(
      paint(
        place(
          g,
          (rng.next() - 0.5) * 0.25,
          y,
          (rng.next() - 0.5) * 0.25,
          rng.next() * 3,
          (rng.next() - 0.5) * 0.12,
        ),
        k % 2 ? STONE : STONE_DARK.clone().lerp(STONE, 0.5),
        k === 2 ? 0.35 : 0,
      ),
    );
    y += r * 0.42;
  }
  parts.push(
    paint(place(stone(rng, 0.2, [1, 0.7, 1]), 0.7, 0.1, -0.3), STONE, 0),
  );
  return mergeGeometries(parts)!;
}

function crag(seed: number): THREE.BufferGeometry {
  const rng = new Random(seed);
  return mergeGeometries([
    paint(
      place(stone(rng, 0.42, [0.9, 2.3, 0.8], 0), 0, 0.75, 0, 0.4, 0.16),
      STONE,
      0.2,
    ),
    paint(
      place(stone(rng, 0.32, [1.1, 0.8, 1]), 0.45, 0.2, 0.3, 1.1),
      STONE,
      0.25,
    ),
    paint(
      place(stone(rng, 0.22, [1, 0.7, 1.2]), -0.4, 0.13, 0.35, 2),
      STONE,
      0,
    ),
    paint(place(stone(rng, 0.16, [1, 0.7, 1]), 0.1, 0.09, 0.62), STONE, 0),
  ])!;
}

function scree(seed: number): THREE.BufferGeometry {
  const rng = new Random(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = rng.next() * Math.PI * 2;
    const d = k === 0 ? 0 : 0.25 + rng.next() * 0.55;
    const r = k === 0 ? 0.34 : 0.12 + rng.next() * 0.14;
    parts.push(
      paint(
        place(
          stone(rng, r, [1.1, 0.7, 1]),
          Math.cos(a) * d,
          r * 0.45,
          Math.sin(a) * d,
          rng.next() * 3,
        ),
        STONE,
        k === 0 ? 0.3 : 0,
      ),
    );
  }
  return mergeGeometries(parts)!;
}

export function proceduralRocks(
  points: readonly RockInstance[],
  track?: (
    mesh: THREE.InstancedMesh,
    items: readonly { x: number; z: number }[],
  ) => void,
): THREE.Group {
  const g = new THREE.Group();
  if (points.length === 0) return g;
  const variants = [
    boulders(11),
    strata(23),
    crag(37),
    scree(41),
    boulders(53),
  ];
  const mat = withFog(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      flatShading: true,
    }),
    { weather: 0.85 },
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  variants.forEach((geo, idx) => {
    const mine = points.filter(
      (p) =>
        Math.min(variants.length - 1, Math.floor(p.v * variants.length)) ===
        idx,
    );
    if (!mine.length) {
      geo.dispose();
      return;
    }
    const im = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r);
      const s = p.s * 1.3;
      m.compose(
        new THREE.Vector3(p.x, -0.04, p.z),
        q,
        new THREE.Vector3(s, s, s),
      );
      im.setMatrixAt(i, m);
      // variação de tom por instância e o tom ferruginoso nas células de minério
      const h = Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233)) % 1;
      const b = 0.9 + h * 0.18;
      if (p.ore) c.setRGB(1.12 * b, 0.82 * b, 0.66 * b);
      else c.setRGB(b, b * 0.99, b * 0.96);
      im.setColorAt(i, c);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
    track?.(im, mine);
  });
  return g;
}
