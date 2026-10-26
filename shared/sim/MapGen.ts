import { CELL_SIZE, MAP_SIZE, TERRAIN, Terrain } from './config.ts';
import { Random } from './Random.ts';
import type { Cell, MapData } from './types.ts';

/** Ruído de valor suavizado em grade grossa, interpolado bilinearmente. */
function valueNoise(rng: Random, size: number, scale: number): Float64Array {
  const coarse = Math.ceil(size / scale) + 2;
  const pts = new Float64Array(coarse * coarse);
  for (let i = 0; i < pts.length; i++) pts[i] = rng.next();
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const v00 = pts[y0 * coarse + x0]!;
      const v10 = pts[y0 * coarse + x0 + 1]!;
      const v01 = pts[(y0 + 1) * coarse + x0]!;
      const v11 = pts[(y0 + 1) * coarse + x0 + 1]!;
      out[y * size + x] = lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
    }
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Gera um mapa simétrico (rotação de 180°) para dois jogadores, com montanhas (rocha para pedreiras
 * e minério de ferro para minas). Mesmo seed → mesmo mapa.
 * Garante uma estrada passável entre as bases e áreas livres ao redor das bases e jazidas.
 */
export function generateMap(seed: number, size = MAP_SIZE): MapData {
  const rng = new Random(seed);
  const elevation = valueNoise(rng, size, 9);
  const moisture = valueNoise(rng, size, 6);
  const detail = valueNoise(rng, size, 3);
  const terrain: Terrain[] = new Array<Terrain>(size * size).fill(Terrain.Plains);

  const half = Math.ceil((size * size) / 2);
  for (let i = 0; i < half; i++) {
    const e = elevation[i]! * 0.75 + detail[i]! * 0.25;
    const m = moisture[i]!;
    let t = Terrain.Plains;
    if (e < 0.2) t = Terrain.Water;
    else if (e < 0.26) t = Terrain.Mud;
    // montanhas: formações rochosas com veios de minério no núcleo
    else if (e > 0.78) t = detail[i]! > 0.62 && e > 0.82 ? Terrain.Ore : Terrain.Rock;
    else if (m > 0.66) t = Terrain.Forest;
    else if (m < 0.3 && e > 0.4 && e < 0.62) t = Terrain.Fertile;
    terrain[i] = t;
    terrain[size * size - 1 - i] = t; // simetria rotacional
  }

  const margin = 8;
  const spawns: Cell[] = [
    { cx: margin, cy: margin },
    { cx: size - 1 - margin, cy: size - 1 - margin },
  ];

  const set = (cx: number, cy: number, t: Terrain) => {
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) return;
    terrain[cy * size + cx] = t;
    terrain[(size - 1 - cy) * size + (size - 1 - cx)] = t;
  };
  const clearArea = (c: Cell, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = terrain[(c.cy + dy) * size + (c.cx + dx)];
        if (t !== undefined && t !== Terrain.Road) set(c.cx + dx, c.cy + dy, Terrain.Plains);
      }
  };

  clearArea(spawns[0]!, 7);

  // Jazidas: duas perto da base, uma em posição avançada; espelhadas para o adversário.
  const nodeOffsets: Cell[] = [
    { cx: margin + 9, cy: margin - 2 },
    { cx: margin - 2, cy: margin + 9 },
    { cx: Math.floor(size / 2) - 6, cy: Math.floor(size / 2) + 4 },
  ];
  const resourceNodes: Cell[] = [];
  for (const n of nodeOffsets) {
    clearArea(n, 2);
    resourceNodes.push(n);
  }
  // Recursos garantidos perto de cada base (espelhados): rocha, floresta e solo fértil.
  const patch = (c: Cell, r: number, t: Terrain) => {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = c.cx + dx;
        const y = c.cy + dy;
        if (resourceNodes.some((n) => x >= n.cx && x <= n.cx + 1 && y >= n.cy && y <= n.cy + 1)) continue;
        set(x, y, t);
      }
  };
  patch({ cx: 2, cy: 3 }, 1.7, Terrain.Rock);
  // pequena serra com veio de ferro dentro do território inicial
  patch({ cx: 17, cy: 15 }, 2.3, Terrain.Rock);
  patch({ cx: 17, cy: 15 }, 1.3, Terrain.Ore);
  patch({ cx: 3, cy: 13 }, 2.6, Terrain.Forest);
  patch({ cx: 13, cy: 3 }, 2.4, Terrain.Fertile);

  // As jazidas espelhadas ocupam a célula oposta; o extrator 2x2 é ancorado na célula da jazida,
  // então a cópia espelhada precisa deslocar 1 célula para ficar dentro da área limpa.
  for (const n of nodeOffsets) resourceNodes.push({ cx: size - 2 - n.cx, cy: size - 2 - n.cy });

  // Estrada sinuosa ligando as bases (desenhada por último, garante conectividade).
  let x = spawns[0]!.cx + 2;
  let y = spawns[0]!.cy + 2;
  const tx = Math.floor(size / 2);
  while (x < tx || y < tx) {
    set(x, y, Terrain.Road);
    set(x + 1, y, Terrain.Road);
    if (x < tx && (y >= tx || rng.next() < 0.5)) x++;
    else y++;
  }
  set(tx, tx, Terrain.Road);
  set(tx - 1, tx, Terrain.Road);

  return { width: size, height: size, cellSize: CELL_SIZE, seed: seed >>> 0, terrain, resourceNodes, spawns };
}

/** Conta células passáveis alcançáveis a partir de `from` (para testes/diagnóstico). */
export function reachable(map: MapData, from: Cell): Set<number> {
  const seen = new Set<number>();
  const stack = [from.cy * map.width + from.cx];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i)) continue;
    const t = map.terrain[i];
    if (t === undefined || !TERRAIN[t].passable) continue;
    seen.add(i);
    const cx = i % map.width;
    const cy = (i - cx) / map.width;
    if (cx > 0) stack.push(i - 1);
    if (cx < map.width - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - map.width);
    if (cy < map.height - 1) stack.push(i + map.width);
  }
  return seen;
}

/** Características da região que orientam o mapa tático local (Fase 8). */
export interface BattleTerrainSpec {
  biome: 'temperate' | 'arid' | 'tropical' | 'cold' | 'grassland';
  coast: boolean;
  river: boolean;
  mountains: boolean;
}

/** Proporções de terreno por bioma (limiares sobre ruído): coerência visual, não cartografia. */
const BIOME_MIX: Record<BattleTerrainSpec['biome'], { forest: number; fertile: number; mud: number; rock: number }> = {
  temperate: { forest: 0.6, fertile: 0.32, mud: 0.04, rock: 0.84 },
  grassland: { forest: 0.8, fertile: 0.42, mud: 0.03, rock: 0.9 },
  tropical: { forest: 0.45, fertile: 0.25, mud: 0.08, rock: 0.88 },
  arid: { forest: 0.92, fertile: 0.08, mud: 0.0, rock: 0.74 },
  cold: { forest: 0.55, fertile: 0.12, mud: 0.05, rock: 0.7 },
};

/**
 * Mapa da batalha local (Fase 8): menor que o teatro, sem simetria. O atacante entra pela borda
 * oeste e o defensor guarda um posto de comando a leste. Costa (água ao sul), rio (com vaus e
 * ponte de estrada), montanhas e vegetação seguem o setor escolhido. Sempre há uma estrada
 * passável entre as duas posições.
 */
export function generateBattleMap(seed: number, spec: BattleTerrainSpec, size = 40): MapData {
  const rng = new Random(seed ^ 0x2c1b3c6d);
  const elevation = valueNoise(rng, size, 7);
  const moisture = valueNoise(rng, size, 5);
  const detail = valueNoise(rng, size, 3);
  const mix = BIOME_MIX[spec.biome];
  const terrain: Terrain[] = new Array<Terrain>(size * size).fill(Terrain.Plains);
  for (let i = 0; i < size * size; i++) {
    const e = elevation[i]! * 0.75 + detail[i]! * 0.25 + (spec.mountains ? 0.06 : -0.04);
    const m = moisture[i]!;
    let t = Terrain.Plains;
    if (e > mix.rock) t = Terrain.Rock;
    else if (m > mix.forest) t = Terrain.Forest;
    else if (m < mix.mud) t = Terrain.Mud;
    else if (m < mix.fertile && e > 0.35) t = Terrain.Fertile;
    terrain[i] = t;
  }
  const set = (x: number, y: number, t: Terrain) => {
    if (x >= 0 && y >= 0 && x < size && y < size) terrain[y * size + x] = t;
  };
  // costa: faixa de água ao sul, com praia lamacenta
  if (spec.coast) {
    for (let x = 0; x < size; x++) {
      const depth = 4 + Math.round(Math.sin(x * 0.35 + seed) * 1.5 + rng.next());
      for (let y = size - depth; y < size; y++) set(x, y, Terrain.Water);
      set(x, size - depth - 1, Terrain.Mud);
    }
  }
  // rio: atravessa de norte a sul no meio do mapa, com dois vaus
  if (spec.river) {
    let rx = Math.floor(size / 2) + Math.round((rng.next() - 0.5) * 4);
    const fords = [Math.floor(size * 0.3), Math.floor(size * 0.62)];
    for (let y = 0; y < size; y++) {
      const ford = fords.some((f) => Math.abs(y - f) <= 1);
      for (const dx of [0, 1]) set(rx + dx, y, ford ? Terrain.Mud : Terrain.Water);
      if (rng.next() < 0.3) rx += rng.next() < 0.5 ? -1 : 1;
      rx = Math.max(size / 2 - 5, Math.min(size / 2 + 5, rx));
    }
  }
  const spawns: Cell[] = [
    { cx: 5, cy: Math.floor(size / 2) - 4 },
    { cx: size - 6, cy: Math.floor(size / 2) - 4 },
  ];
  const clear = (c: Cell, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) set(c.cx + dx, c.cy + dy, Terrain.Plains);
  };
  clear(spawns[0]!, 5);
  clear(spawns[1]!, 5);
  // estrada sinuosa de base a base (atravessa o rio por ponte)
  let x = spawns[0]!.cx;
  let y = spawns[0]!.cy + 1;
  const ty = spawns[1]!.cy + 1;
  while (x < spawns[1]!.cx) {
    set(x, y, Terrain.Road);
    set(x, y + 1, Terrain.Road);
    if (rng.next() < 0.75 || y === ty) x++;
    else y += y < ty ? 1 : -1;
    y = Math.max(2, Math.min(size - 8, y));
  }
  return { width: size, height: size, cellSize: CELL_SIZE, seed: seed >>> 0, terrain, resourceNodes: [], spawns };
}
