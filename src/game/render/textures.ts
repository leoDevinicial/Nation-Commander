import * as THREE from 'three';
import { Random } from '../../../shared/sim/Random.ts';

/**
 * Texturas procedurais geradas no próprio cliente (sem downloads de terceiros). Todas são
 * repetíveis sem emenda (ruído periódico) e ficam em cache enquanto a partida existir.
 */

/** Ruído de valor periódico (tileável) em [0, 1], com oitavas. */
function tileableFbm(size: number, period: number, octaves: number, seed: number): Float32Array {
  const rng = new Random(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(p * p);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * p;
      const y0 = Math.floor(gy);
      const ty = smooth(gy - y0);
      const y1 = (y0 + 1) % p;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * p;
        const x0 = Math.floor(gx);
        const tx = smooth(gx - x0);
        const x1 = (x0 + 1) % p;
        const a = grid[y0 * p + x0]!;
        const b = grid[y0 * p + x1]!;
        const c = grid[y1 * p + x0]!;
        const d = grid[y1 * p + x1]!;
        const i = y * size + x;
        out[i] = out[i]! + amp * (a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * ty);
      }
    }
    total += amp;
    amp *= 0.5;
    p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Pinta pixels a partir de uma função (x, y, i) → [r, g, b]. */
function paint(ctx: CanvasRenderingContext2D, size: number, fn: (i: number) => [number, number, number]): void {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fn(i);
    img.data[i * 4] = clamp255(r);
    img.data[i * 4 + 1] = clamp255(g);
    img.data[i * 4 + 2] = clamp255(b);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Riscos finos repetidos nas bordas opostas (para manter a textura tileável). */
function strokeWrapped(size: number, draw: (ox: number, oy: number) => void): void {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(ox, oy);
}

const cache = new Map<string, THREE.Texture>();

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/**
 * Desgaste (tons de cinza, ~0.55–1.0): manchas, sujeira acumulada e escorridos verticais.
 * Multiplicado sobre as cores dos modelos para dar aparência de concreto e metal usados.
 */
export function grimeTexture(size = 512): THREE.Texture {
  return cached(`grime-${size}`, () => {
    const [canvas, ctx] = canvasOf(size);
    const big = tileableFbm(size, 4, 5, 11);
    const fine = tileableFbm(size, 32, 3, 12);
    const streak = tileableFbm(size, 6, 3, 13);
    paint(ctx, size, (i) => {
      const x = i % size;
      const y = (i - x) / size;
      // escorridos: ruído esticado na vertical (eixo v = y da textura)
      const s = streak[((y >> 3) % size) * size + x]!;
      let v = 0.84 + (big[i]! - 0.5) * 0.4 + (fine[i]! - 0.5) * 0.2;
      v -= Math.max(0, s - 0.52) * 1.3;
      return [v * 255, v * 255, v * 255];
    });
    const rng = new Random(14);
    // manchas escuras e lascas
    for (let k = 0; k < 90; k++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const r = 2 + rng.next() * (size / 40);
      strokeWrapped(size, (ox, oy) => {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + rng.next() * 0.08})`;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    return toTexture(canvas, false);
  });
}

interface GroundSpec {
  base: [number, number, number];
  /** Variação de cor (amplitude por canal) do ruído grosso e fino. */
  vary: number;
  fineVary: number;
  seed: number;
}

function groundTexture(key: string, size: number, spec: GroundSpec, extra?: (ctx: CanvasRenderingContext2D, rng: Random) => void): THREE.Texture {
  return cached(`${key}-${size}`, () => {
    const [canvas, ctx] = canvasOf(size);
    const big = tileableFbm(size, 4, 4, spec.seed);
    const fine = tileableFbm(size, 48, 2, spec.seed + 1);
    const [r, g, b] = spec.base;
    paint(ctx, size, (i) => {
      const k = (big[i]! - 0.5) * spec.vary + (fine[i]! - 0.5) * spec.fineVary;
      return [r + k * 1.0, g + k * 1.05, b + k * 0.8];
    });
    extra?.(ctx, new Random(spec.seed + 7));
    return toTexture(canvas, true);
  });
}

/** Grama: tufos claros e escuros, áreas mais secas. */
export function grassTexture(size = 512): THREE.Texture {
  return groundTexture('grass', size, { base: [98, 118, 64], vary: 30, fineVary: 34, seed: 21 }, (ctx, rng) => {
    for (let k = 0; k < size * 3; k++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const light = rng.next() < 0.5;
      ctx.strokeStyle = light ? `rgba(190,200,120,${0.15 + rng.next() * 0.2})` : `rgba(30,45,20,${0.15 + rng.next() * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng.next() - 0.5) * 3, y - 2 - rng.next() * 4);
      ctx.stroke();
    }
  });
}

/** Terra batida com pedriscos (solo fértil, lama e chão de obra usam a mesma base, com tons diferentes). */
export function dirtTexture(size = 512): THREE.Texture {
  return groundTexture('dirt', size, { base: [118, 94, 66], vary: 60, fineVary: 40, seed: 31 }, (ctx, rng) => {
    for (let k = 0; k < size * 1.5; k++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const s = 0.8 + rng.next() * 2.2;
      ctx.fillStyle = rng.next() < 0.6 ? `rgba(165,150,128,${0.35 + rng.next() * 0.35})` : `rgba(45,35,25,${0.3 + rng.next() * 0.3})`;
      ctx.fillRect(x, y, s, s * (0.6 + rng.next() * 0.6));
    }
  });
}

/** Asfalto: grão fino, remendos, rachaduras e manchas de óleo. */
export function asphaltTexture(size = 512): THREE.Texture {
  return groundTexture('asphalt', size, { base: [100, 95, 86], vary: 26, fineVary: 40, seed: 41 }, (ctx, rng) => {
    // remendos
    for (let k = 0; k < 8; k++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const w = size * (0.08 + rng.next() * 0.12);
      const h = size * (0.05 + rng.next() * 0.1);
      strokeWrapped(size, (ox, oy) => {
        ctx.fillStyle = `rgba(30,32,34,${0.18 + rng.next() * 0.12})`;
        ctx.fillRect(x + ox, y + oy, w, h);
      });
    }
    // rachaduras
    ctx.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      let x = rng.next() * size;
      let y = rng.next() * size;
      const pts: [number, number][] = [[x, y]];
      let a = rng.next() * Math.PI * 2;
      for (let s = 0; s < 8; s++) {
        a += (rng.next() - 0.5) * 1.2;
        x += Math.cos(a) * (6 + rng.next() * 14);
        y += Math.sin(a) * (6 + rng.next() * 14);
        pts.push([x, y]);
      }
      strokeWrapped(size, (ox, oy) => {
        ctx.strokeStyle = 'rgba(20,20,22,0.55)';
        ctx.lineWidth = 0.8 + rng.next() * 1.2;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
        ctx.stroke();
      });
    }
    // manchas de óleo
    for (let k = 0; k < 6; k++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const r = size * (0.02 + rng.next() * 0.04);
      strokeWrapped(size, (ox, oy) => {
        const grad = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, 'rgba(15,15,18,0.45)');
        grad.addColorStop(1, 'rgba(15,15,18,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
  });
}

/** Rocha: faixas, fissuras e liquens. */
export function rockTexture(size = 512): THREE.Texture {
  return groundTexture('rock', size, { base: [128, 124, 116], vary: 90, fineVary: 40, seed: 51 }, (ctx, rng) => {
    for (let k = 0; k < 40; k++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      strokeWrapped(size, (ox, oy) => {
        ctx.strokeStyle = 'rgba(40,38,34,0.5)';
        ctx.lineWidth = 1 + rng.next() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + (rng.next() - 0.5) * 60, y + oy + (rng.next() - 0.5) * 20);
        ctx.stroke();
      });
    }
    for (let k = 0; k < 140; k++) {
      ctx.fillStyle = `rgba(120,135,80,${0.08 + rng.next() * 0.12})`;
      ctx.beginPath();
      ctx.arc(rng.next() * size, rng.next() * size, 1 + rng.next() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Partícula de fumaça (difusa, branca; a cor vem do material). */
export function smokeTexture(): THREE.Texture {
  return cached('smoke', () => {
    const [canvas, ctx] = canvasOf(64);
    const rng = new Random(61);
    for (let k = 0; k < 9; k++) {
      const x = 20 + rng.next() * 24;
      const y = 20 + rng.next() * 24;
      const r = 12 + rng.next() * 14;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/**
 * Janelas industriais: caixilhos escuros em grade, vidros com reflexo variado, alguns
 * sujos ou quebrados. Multiplicado sobre o material de vidro (aplicação triplanar).
 */
export function windowTexture(size = 256): THREE.Texture {
  return cached(`window-${size}`, () => {
    const [canvas, ctx] = canvasOf(size);
    const rng = new Random(71);
    const n = 4;
    const cell = size / n;
    const frame = Math.max(2, size / 64);
    ctx.fillStyle = 'rgb(70,72,74)';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const r = rng.next();
        // vidro: tom claro (reflexo), médio, sujo ou quebrado (escuro)
        const v = r < 0.08 ? 40 : r < 0.25 ? 150 : r < 0.6 ? 205 : 235;
        const g = ctx.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
        g.addColorStop(0, `rgb(${v},${v + 6},${v + 12})`);
        g.addColorStop(1, `rgb(${v * 0.78},${v * 0.82},${v * 0.88})`);
        ctx.fillStyle = g;
        ctx.fillRect(x * cell + frame, y * cell + frame, cell - frame * 2, cell - frame * 2);
        if (r < 0.08) {
          // estilhaços
          ctx.strokeStyle = 'rgba(200,205,210,0.6)';
          ctx.lineWidth = 1;
          for (let k = 0; k < 4; k++) {
            ctx.beginPath();
            ctx.moveTo(x * cell + cell / 2, y * cell + cell / 2);
            ctx.lineTo(x * cell + rng.next() * cell, y * cell + rng.next() * cell);
            ctx.stroke();
          }
        }
      }
    return toTexture(canvas, true);
  });
}
