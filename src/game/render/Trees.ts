import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Random } from '../../../shared/sim/Random.ts';
import { withFog } from './materials.ts';

/**
 * Árvores procedurais com folhagem detalhada.
 * - Folhosas: tronco com galhos e copa feita de cachos; cada cacho tem um miolo fechado (para a
 *   copa não ficar vazada) e cartões de folhas com textura recortada (folhas desenhadas uma a uma,
 *   com nervura), virados para fora. As normais dos cartões apontam para fora do cacho, o que dá
 *   o volume suave de uma copa de verdade em vez de facetas.
 * - Coníferas: tronco reto e camadas de ramos caídos (cartões de agulhas) em volta de um miolo
 *   escuro, mais estreitas para o alto.
 * Cada variante é gerada uma vez e desenhada em lote (instâncias); `lite` reduz os cartões para
 * celulares.
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

/** Textura de um ramo de folhas (canvas): folhas elípticas com nervura sobre fundo transparente. */
function leafTexture(kind: 'broad' | 'needle'): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const rng = new Random(kind === 'broad' ? 11 : 23);
  const greens = kind === 'broad' ? ['#4f7a35', '#5f8c3c', '#3f6a2e', '#6e9a45', '#47732f'] : ['#2f5a34', '#3a6a3c', '#264d2d', '#41723f'];
  if (kind === 'broad') {
    // raminho central e folhas em volta
    g.strokeStyle = '#4a3a24';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(size / 2, size - 4);
    g.lineTo(size / 2, 18);
    g.stroke();
    for (let i = 0; i < 26; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 10 + rng.next() * 42;
      const x = size / 2 + Math.cos(a) * d * 0.95;
      const y = size / 2 + Math.sin(a) * d * 0.95;
      const len = 13 + rng.next() * 9;
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2 + (rng.next() - 0.5) * 0.8);
      g.fillStyle = greens[Math.floor(rng.next() * greens.length)]!;
      g.beginPath();
      g.ellipse(0, 0, len * 0.42, len, 0, 0, Math.PI * 2);
      g.fill();
      // nervura e borda clara (luz na ponta da folha)
      g.strokeStyle = 'rgba(210,230,160,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -len * 0.85);
      g.lineTo(0, len * 0.85);
      g.stroke();
      g.restore();
    }
  } else {
    // ramo de pinheiro: eixo central com agulhas em espinha de peixe
    g.lineCap = 'round';
    for (let b = 0; b < 3; b++) {
      const ox = size / 2 + (b - 1) * 26;
      g.strokeStyle = '#3d2f1f';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ox, size - 6);
      g.lineTo(ox + (b - 1) * 8, 8);
      g.stroke();
      for (let y = 10; y < size - 8; y += 3) {
        const t = y / size;
        const w = 6 + 16 * t;
        const cx = ox + (b - 1) * 8 * (1 - t);
        g.strokeStyle = greens[Math.floor(rng.next() * greens.length)]!;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx - w, y + 6 + rng.next() * 3);
        g.moveTo(cx, y);
        g.lineTo(cx + w, y + 6 + rng.next() * 3);
        g.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const paint = (geo: THREE.BufferGeometry, color: THREE.Color, shade = 0): THREE.BufferGeometry => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position!.count;
  const col = new Float32Array(n * 3);
  const pos = g.attributes.position!;
  for (let i = 0; i < n; i++) {
    // mais escuro embaixo (oclusão)
    const k = 1 - shade + shade * Math.min(1, Math.max(0, pos.getY(i) / 3));
    col[i * 3] = color.r * k;
    col[i * 3 + 1] = color.g * k;
    col[i * 3 + 2] = color.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
};

/** Cilindro de galho entre dois pontos. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Cartão de folhas no ponto `p`, virado para `out`, com normais "de copa" (para fora de `center`). */
function card(p: THREE.Vector3, out: THREE.Vector3, w: number, h: number, spin: number, center: THREE.Vector3, droop = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateZ(spin);
  if (droop) g.rotateX(droop);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out.clone().normalize());
  g.applyQuaternion(q);
  g.translate(p.x, p.y, p.z);
  const pos = g.attributes.position!;
  const nor = g.attributes.normal!;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(center).normalize();
    v.y = v.y * 0.7 + 0.3;
    v.normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function broadleaf(seed: number, lite: boolean): TreeVariant {
  const rng = new Random(seed);
  const wood = new THREE.Color('#5a4330');
  const core = new THREE.Color('#355a2a');
  const solids: THREE.BufferGeometry[] = [];
  const cards: THREE.BufferGeometry[] = [];
  const h = 1.5 + rng.next() * 0.4;
  const lean = new THREE.Vector3((rng.next() - 0.5) * 0.25, h, (rng.next() - 0.5) * 0.25);
  solids.push(paint(limb(new THREE.Vector3(0, 0, 0), lean, 0.17, 0.11, 7), wood, 0.3));
  // raízes aparentes
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng.next();
    solids.push(paint(limb(new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(Math.cos(a) * 0.32, -0.02, Math.sin(a) * 0.32), 0.07, 0.03, 4), wood, 0.2));
  }
  const clusters = lite ? 5 : 7;
  const perCluster = lite ? 7 : 12;
  for (let i = 0; i < clusters; i++) {
    const a = (i / clusters) * Math.PI * 2 + rng.next() * 0.6;
    const top = i === 0;
    const rr = top ? 0 : 0.45 + rng.next() * 0.35;
    const c = new THREE.Vector3(lean.x + Math.cos(a) * rr, h + (top ? 1.05 : 0.35 + rng.next() * 0.6), lean.z + Math.sin(a) * rr);
    const size = top ? 0.7 : 0.5 + rng.next() * 0.22;
    // galho até o cacho
    if (!top) solids.push(paint(limb(lean.clone().multiplyScalar(0.75 + rng.next() * 0.2), c.clone().lerp(lean, 0.25), 0.06, 0.035, 4), wood, 0.1));
    // miolo fechado, levemente irregular
    const ico = new THREE.IcosahedronGeometry(size * 0.78, 0);
    const p = ico.attributes.position!;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.9 + rng.next() * 0.2), p.getY(k) * (0.8 + rng.next() * 0.15), p.getZ(k) * (0.9 + rng.next() * 0.2));
    ico.translate(c.x, c.y, c.z);
    ico.computeVertexNormals();
    solids.push(paint(ico, core, 0.25));
    // cartões de folhas distribuídos na superfície do cacho (mais em cima, onde bate o sol)
    for (let k = 0; k < perCluster; k++) {
      const u = rng.next() * Math.PI * 2;
      const vv = Math.acos(1 - rng.next() * 1.7);
      const dir = new THREE.Vector3(Math.sin(vv) * Math.cos(u), Math.cos(vv), Math.sin(vv) * Math.sin(u));
      const pt = c.clone().addScaledVector(dir, size * (0.7 + rng.next() * 0.25));
      const s = size * (0.95 + rng.next() * 0.5);
      cards.push(card(pt, dir.clone().lerp(new THREE.Vector3(0, 1, 0), 0.25), s, s, rng.next() * Math.PI * 2, c));
    }
  }
  return { solid: mergeGeometries(solids)!, leaves: mergeGeometries(cards)! };
}

function conifer(seed: number, lite: boolean): TreeVariant {
  const rng = new Random(seed);
  const wood = new THREE.Color('#4e3a28');
  const core = new THREE.Color('#203e25');
  const solids: THREE.BufferGeometry[] = [];
  const cards: THREE.BufferGeometry[] = [];
  const H = 3.4 + rng.next() * 0.6;
  solids.push(paint(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H, 0), 0.15, 0.04, 6), wood, 0.3));
  const tiers = lite ? 4 : 5;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y = 0.75 + k * (H - 1.25);
    const r = 1.05 * (1 - k * 0.75);
    const th = 0.9 - k * 0.3;
    // miolo escuro da camada
    const cone = new THREE.ConeGeometry(r * 0.7, th, 9, 1, true);
    cone.translate(0, y + th / 2, 0);
    solids.push(paint(cone, core.clone().multiplyScalar(0.85 + k * 0.3), 0.2));
    // ramos caídos em volta
    const n = (lite ? 6 : 9) - Math.round(k * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.next() * 0.5 + t;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const p = new THREE.Vector3(0, y + th * 0.55, 0).addScaledVector(out, r * 0.55);
      // o cartão deita para fora e cai na ponta
      const g = new THREE.PlaneGeometry(r * 0.75, r * 1.25);
      g.rotateX(-Math.PI / 2 + 0.45 + rng.next() * 0.2);
      g.rotateY(-a + Math.PI / 2);
      g.translate(p.x, p.y, p.z);
      const nor = g.attributes.normal!;
      const pos = g.attributes.position!;
      const v = new THREE.Vector3();
      for (let q = 0; q < pos.count; q++) {
        v.set(pos.getX(q), 0, pos.getZ(q)).normalize();
        v.y = 0.8;
        v.normalize();
        nor.setXYZ(q, v.x, v.y, v.z);
      }
      cards.push(g);
    }
  }
  // ponta
  const tip = new THREE.ConeGeometry(0.18, 0.7, 6);
  tip.translate(0, H + 0.1, 0);
  solids.push(paint(tip, core, 0));
  return { solid: mergeGeometries(solids)!, leaves: mergeGeometries(cards)! };
}

/**
 * Florestas com as árvores detalhadas: 3 folhosas e 2 coníferas, sorteadas por instância
 * (`v`), em lote. `tint` dá a variação de tom por árvore.
 */
export function detailedTrees(
  items: readonly TreeInstance[],
  opts: { lite: boolean; tint: (h: number, out: THREE.Color) => THREE.Color; hash: (x: number, z: number) => number; track?: (mesh: THREE.InstancedMesh, items: readonly TreeInstance[]) => void },
  disposables: { dispose: () => void }[],
): THREE.Group {
  const g = new THREE.Group();
  if (!items.length) return g;
  const variants = [broadleaf(101, opts.lite), broadleaf(202, opts.lite), broadleaf(303, opts.lite), conifer(404, opts.lite), conifer(505, opts.lite)];
  const broadTex = leafTexture('broad');
  const needleTex = leafTexture('needle');
  const solidMat = withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  // folhas balançam levemente ao vento (o tronco fica parado)
  const leafMat = (map: THREE.Texture) => withFog(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }), { sway: 0.022 });
  const broadMat = leafMat(broadTex);
  const needleMat = leafMat(needleTex);
  disposables.push(broadTex, needleTex, solidMat, broadMat, needleMat);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  variants.forEach((variant, idx) => {
    const mine = items.filter((it) => Math.min(variants.length - 1, Math.floor(it.v * variants.length)) === idx);
    if (!mine.length) return;
    const leaves = idx >= 3 ? needleMat : broadMat;
    for (const [geo, mat] of [
      [variant.solid, solidMat],
      [variant.leaves, leaves],
    ] as const) {
      const im = new THREE.InstancedMesh(geo, mat, mine.length);
      mine.forEach((it, i) => {
        q.setFromAxisAngle(up, it.r);
        const sc = 0.8 * it.s;
        m.compose(new THREE.Vector3(it.x, 0, it.z), q, new THREE.Vector3(sc, sc, sc));
        im.setMatrixAt(i, m);
        im.setColorAt(i, opts.tint(opts.hash(it.x, it.z), color));
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
