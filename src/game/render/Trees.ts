import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Random } from "../../../shared/sim/Random.ts";
import { withFog } from "./materials.ts";

/**
 * Árvores procedurais em low poly facetado (sem texturas nem cartões recortados), com silhuetas tiradas de
 * árvores reais:
 * - folhosas: carvalho (copa larga e baixa sobre um tronco que se divide em galhos), bétula (tronco claro com
 *   marcas escuras e copa estreita e alta) e bordo (copa redonda e cheia). A copa é feita de cachos facetados
 *   e irregulares, mais claros em cima e mais escuros embaixo, com a base achatada como numa copa de verdade;
 * - coníferas: abeto (camadas de ramos em cone, com a borda recortada e caída, que fecham na ponta na mesma cor,
 *   sem a ponta escura solta de antes) e pinheiro-silvestre (tronco alto e nu, avermelhado no alto, e a copa
 *   em tufos achatados no topo).
 * Cada variante é gerada uma vez e desenhada em lote (instâncias); `lite` usa cachos com menos faces.
 */

export interface TreeInstance {
  x: number;
  z: number;
  s: number;
  r: number;
  v: number;
}

interface TreeVariant {
  solid: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
}

/** Pinta a geometria com uma cor e um degradê vertical local (y0 → y1: escuro → claro). */
function paint(
  geo: THREE.BufferGeometry,
  color: THREE.Color,
  y0: number,
  y1: number,
  dark = 0.7,
  light = 1.08,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(
      1,
      Math.max(0, (pos.getY(i) - y0) / Math.max(1e-3, y1 - y0)),
    );
    const k = dark + (light - dark) * t;
    col[i * 3] = color.r * k;
    col[i * 3 + 1] = color.g * k;
    col[i * 3 + 2] = color.b * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

/** Galho (tronco cônico) entre dois pontos. */
function limb(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r0: number,
  r1: number,
  seg: number,
): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    ),
  );
  g.translate(a.x, a.y, a.z);
  return g;
}

/**
 * Cacho de folhagem facetado e irregular, com a base achatada. Os vértices são unidos antes do sorteio para a
 * superfície continuar fechada (sem frestas), e separados depois para as faces ficarem chapadas.
 */
function blob(
  rng: Random,
  r: number,
  detail: number,
  squash: number,
  flatBottom: number,
): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const k = 0.84 + rng.next() * 0.28;
    const y = Math.max(p.getY(i) * k * squash, -r * flatBottom);
    p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
  }
  return g.toNonIndexed();
}

/** Folhosa: tronco que se divide em galhos até os cachos da copa. */
function broadleaf(
  seed: number,
  kind: "oak" | "birch" | "maple",
  lite: boolean,
): TreeVariant {
  const rng = new Random(seed);
  const wood = new THREE.Color(kind === "birch" ? "#d8d2c4" : "#5a4330");
  const greens = {
    oak: ["#47702f", "#3f6629", "#557d36"],
    birch: ["#6b9440", "#7aa04a", "#5f8a3a"],
    maple: ["#4f7a33", "#5c8a3a", "#43702c"],
  }[kind];
  const solids: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const detail = lite ? 0 : 1;
  const trunkH =
    kind === "birch"
      ? 1.9 + rng.next() * 0.3
      : kind === "oak"
        ? 1.15 + rng.next() * 0.2
        : 1.4 + rng.next() * 0.25;
  const trunkR = kind === "birch" ? 0.1 : kind === "oak" ? 0.19 : 0.15;
  const lean = new THREE.Vector3(
    (rng.next() - 0.5) * 0.18,
    trunkH,
    (rng.next() - 0.5) * 0.18,
  );
  solids.push(
    paint(
      limb(new THREE.Vector3(0, 0, 0), lean, trunkR, trunkR * 0.7, 7),
      wood,
      0,
      trunkH,
      0.75,
      1,
    ),
  );
  // pé do tronco alargado (raízes)
  solids.push(
    paint(
      limb(
        new THREE.Vector3(0, -0.02, 0),
        new THREE.Vector3(0, 0.22, 0),
        trunkR * 1.6,
        trunkR * 1.02,
        7,
      ),
      wood,
      0,
      0.22,
      0.7,
      0.9,
    ),
  );
  if (kind === "birch") {
    // marcas escuras da casca da bétula
    for (let i = 0; i < 4; i++) {
      const y = 0.35 + i * 0.38 + rng.next() * 0.1;
      const ring = new THREE.CylinderGeometry(
        trunkR * 0.96,
        trunkR * 0.98,
        0.05,
        7,
        1,
        true,
      );
      ring.scale(1.04, 1, 1.04);
      ring.translate(lean.x * (y / trunkH), y, lean.z * (y / trunkH));
      solids.push(paint(ring, new THREE.Color("#2e2b28"), 0, 1, 1, 1));
    }
  }
  // cachos: um no alto e os outros em volta, com galhos saindo do topo do tronco até cada um
  const n = kind === "birch" ? 4 : kind === "oak" ? 6 : 5;
  const spread = kind === "oak" ? 0.85 : kind === "birch" ? 0.35 : 0.6;
  const base = kind === "oak" ? 1.6 : kind === "birch" ? 1.4 : 1.35;
  const sizeBase = kind === "oak" ? 0.72 : kind === "birch" ? 0.48 : 0.68;
  for (let i = 0; i < n; i++) {
    const top = i === 0;
    const a = (i / Math.max(1, n - 1)) * Math.PI * 2 + rng.next() * 0.7;
    const rr = top ? 0 : spread * (0.75 + rng.next() * 0.35);
    const y =
      kind === "birch"
        ? trunkH + (top ? 1.25 : 0.25 + (i / n) * 0.9)
        : trunkH + (top ? base * 0.62 : base * (0.18 + rng.next() * 0.3));
    const c = new THREE.Vector3(
      lean.x + Math.cos(a) * rr,
      y,
      lean.z + Math.sin(a) * rr,
    );
    const size = sizeBase * (top ? 1.05 : 0.85 + rng.next() * 0.25);
    if (!top) {
      const from = lean.clone().multiplyScalar(0.82 + rng.next() * 0.15);
      solids.push(
        paint(
          limb(from, c.clone().lerp(lean, 0.3), trunkR * 0.5, trunkR * 0.25, 5),
          wood,
          0,
          3,
          0.8,
          1,
        ),
      );
    }
    const g = blob(
      rng,
      size,
      detail,
      kind === "birch" ? 1.15 : 0.85,
      kind === "oak" ? 0.45 : 0.6,
    );
    g.translate(c.x, c.y, c.z);
    const col = new THREE.Color(greens[i % greens.length]!);
    leaves.push(paint(g, col, c.y - size * 0.6, c.y + size * 0.8, 0.62, 1.12));
  }
  return { solid: mergeGeometries(solids)!, leaves: mergeGeometries(leaves)! };
}

/** Camada de ramos de abeto: cone aberto com a borda recortada e caída, e a face de baixo mais escura. */
function spruceTier(
  rng: Random,
  y: number,
  r: number,
  h: number,
  color: THREE.Color,
  seg: number,
): THREE.BufferGeometry[] {
  let cone: THREE.BufferGeometry = new THREE.ConeGeometry(r, h, seg, 1, true);
  cone.deleteAttribute("normal");
  cone.deleteAttribute("uv");
  cone = mergeVertices(cone);
  const p = cone.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) continue; // ponta fica no eixo
    const k = 0.86 + rng.next() * 0.3;
    p.setXYZ(
      i,
      p.getX(i) * k,
      p.getY(i) - rng.next() * h * 0.18,
      p.getZ(i) * k,
    );
  }
  cone.translate(0, y + h / 2, 0);
  const under = new THREE.CircleGeometry(r * 0.92, seg);
  under.rotateX(Math.PI / 2);
  under.translate(0, y + h * 0.02, 0);
  return [
    paint(cone, color, y - h * 0.1, y + h, 0.7, 1.1),
    paint(under, color, 0, 1, 0.45, 0.45),
  ];
}

/** Abeto: tronco reto e camadas de ramos em cone que afinam até a ponta (na mesma cor da folhagem). */
function spruce(seed: number, lite: boolean): TreeVariant {
  const rng = new Random(seed);
  const wood = new THREE.Color("#4e3a28");
  const green = new THREE.Color("#2d5a33");
  const solids: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const H = 3.7 + rng.next() * 0.6;
  solids.push(
    paint(
      limb(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, H * 0.7, 0),
        0.14,
        0.05,
        6,
      ),
      wood,
      0,
      H,
      0.75,
      1,
    ),
  );
  const tiers = lite ? 5 : 7;
  const seg = lite ? 8 : 10;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y = 0.45 + k * (H - 1.35);
    const r = 1.05 * (1 - k * 0.82) + 0.08;
    const h = 0.95 - k * 0.2 + (t === tiers - 1 ? 0.35 : 0);
    const col = green.clone().multiplyScalar(0.88 + k * 0.22);
    leaves.push(...spruceTier(rng, y, r, h, col, seg));
  }
  return { solid: mergeGeometries(solids)!, leaves: mergeGeometries(leaves)! };
}

/** Pinheiro-silvestre: tronco alto e nu (avermelhado no alto) e a copa em tufos achatados no topo. */
function pine(seed: number, lite: boolean): TreeVariant {
  const rng = new Random(seed);
  const bark = new THREE.Color("#5a4330");
  const upper = new THREE.Color("#9a5f3a");
  const green = new THREE.Color("#3b5f34");
  const solids: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const H = 3.3 + rng.next() * 0.5;
  const lean = new THREE.Vector3(
    (rng.next() - 0.5) * 0.35,
    H,
    (rng.next() - 0.5) * 0.35,
  );
  const mid = lean.clone().multiplyScalar(0.55);
  solids.push(
    paint(
      limb(new THREE.Vector3(0, 0, 0), mid, 0.13, 0.1, 6),
      bark,
      0,
      H * 0.55,
      0.75,
      1,
    ),
  );
  solids.push(
    paint(limb(mid, lean, 0.1, 0.05, 6), upper, H * 0.55, H, 0.9, 1.05),
  );
  const tufts = 4;
  for (let i = 0; i < tufts; i++) {
    const top = i === 0;
    const a = (i / (tufts - 1)) * Math.PI * 2 + rng.next();
    const rr = top ? 0 : 0.45 + rng.next() * 0.25;
    const c = new THREE.Vector3(
      lean.x + Math.cos(a) * rr,
      H - (top ? -0.15 : 0.25 + rng.next() * 0.35),
      lean.z + Math.sin(a) * rr,
    );
    if (!top)
      solids.push(
        paint(
          limb(lean.clone().multiplyScalar(0.85), c, 0.05, 0.025, 4),
          upper,
          0,
          4,
          0.9,
          1,
        ),
      );
    const size = top ? 0.6 : 0.48 + rng.next() * 0.15;
    const g = blob(rng, size, lite ? 0 : 1, 0.5, 0.35);
    g.translate(c.x, c.y, c.z);
    leaves.push(
      paint(
        g,
        green.clone().multiplyScalar(0.92 + rng.next() * 0.16),
        c.y - size * 0.3,
        c.y + size * 0.4,
        0.6,
        1.1,
      ),
    );
  }
  return { solid: mergeGeometries(solids)!, leaves: mergeGeometries(leaves)! };
}

/**
 * Florestas: 3 folhosas (carvalho, bétula, bordo) e 2 coníferas (abeto, pinheiro), sorteadas por instância
 * (`v`), em lote. `tint` dá a variação de tom por árvore na folhagem.
 */
export function detailedTrees(
  items: readonly TreeInstance[],
  opts: {
    lite: boolean;
    tint: (h: number, out: THREE.Color) => THREE.Color;
    hash: (x: number, z: number) => number;
    track?: (mesh: THREE.InstancedMesh, items: readonly TreeInstance[]) => void;
  },
  disposables: { dispose: () => void }[],
): THREE.Group {
  const g = new THREE.Group();
  if (!items.length) return g;
  const variants = [
    broadleaf(101, "oak", opts.lite),
    broadleaf(202, "birch", opts.lite),
    broadleaf(303, "maple", opts.lite),
    spruce(404, opts.lite),
    pine(505, opts.lite),
  ];
  // a árvore inteira balança ao vento (tronco e copa com a mesma onda, então a copa não "escorrega" do tronco)
  const woodMat = withFog(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      flatShading: true,
    }),
    { sway: 0.022 },
  );
  const leafMat = withFog(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      flatShading: true,
    }),
    { sway: 0.022 },
  );
  disposables.push(woodMat, leafMat);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  variants.forEach((variant, idx) => {
    const mine = items.filter(
      (it) =>
        Math.min(variants.length - 1, Math.floor(it.v * variants.length)) ===
        idx,
    );
    if (!mine.length) return;
    for (const [geo, mat, tinted] of [
      [variant.solid, woodMat, false],
      [variant.leaves, leafMat, true],
    ] as const) {
      const im = new THREE.InstancedMesh(geo, mat, mine.length);
      mine.forEach((it, i) => {
        q.setFromAxisAngle(up, it.r);
        const sc = 0.8 * it.s;
        m.compose(
          new THREE.Vector3(it.x, 0, it.z),
          q,
          new THREE.Vector3(sc, sc, sc),
        );
        im.setMatrixAt(i, m);
        if (tinted) im.setColorAt(i, opts.tint(opts.hash(it.x, it.z), color));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      g.add(im);
      opts.track?.(im, mine);
    }
    disposables.push(variant.solid, variant.leaves);
  });
  return g;
}
