import type { BuildingType } from './config.ts';

/**
 * Rede elétrica (versão 1.1, pedido do gerente).
 * - Fontes: termelétrica a carvão (queima carvão, que sai das minas junto com o ferro), parque eólico (varia com o
 *   vento), usina solar (só de dia, rende mais a partir da Era Digital) e os Grandes Projetos Usina Nuclear e
 *   Hidrelétrica (as maiores fontes, de fim de partida).
 * - A energia anda pelas estradas: as células de estrada do jogador, o Centro de Comando e as usinas formam a malha.
 *   Uma construção a até `reach` células da malha liga-se a ela (a fiação dos postes). Cada pedaço da malha separado
 *   dos outros é uma rede própria, com a sua oferta e a sua demanda.
 * - Sem energia, a construção para por completo (quartel, fábrica, pesquisa, base aérea, silo, defesa antimíssil,
 *   antiaérea, refinaria e siderúrgica). Quando falta energia numa rede, as construções mais antigas ficam com a luz
 *   e as mais novas apagam.
 * - Moradias com luz dão aprovação; bairros no escuro tiram.
 */
export const POWER = {
  /** Carvão por unidade de ferro extraída numa mina. */
  coalPerIron: 0.15,
  /** Distância (células) da malha até onde a fiação alcança. */
  reach: 4,
  /** Recalcula a rede a cada N ticks. */
  everyTicks: 10,
  /** Aprovação: até +3 com todas as moradias acesas, até −6 com todas no escuro. */
  approvalLit: 3,
  approvalDark: 6,
  /** Solar: rendimento a partir da Era Digital. */
  solarEraMul: 1.4,
};

export type PowerSource = 'coal' | 'wind' | 'solar' | 'nuclear' | 'hydro';

/** Geração máxima e combustível (carvão por segundo a plena carga). */
export const POWER_GEN: Partial<Record<BuildingType, { gen: number; source: PowerSource; coal?: number }>> = {
  coal_plant: { gen: 24, source: 'coal', coal: 0.6 },
  wind_farm: { gen: 12, source: 'wind' },
  solar_farm: { gen: 18, source: 'solar' },
  nuclear_plant: { gen: 150, source: 'nuclear' },
  hydro_dam: { gen: 90, source: 'hydro' },
};

/**
 * Consumo (unidades de energia) das construções que dependem de luz. `stops`: para por completo sem energia; as
 * moradias e serviços não param, mas a falta de luz pesa na aprovação.
 */
export const POWER_USE: Partial<Record<BuildingType, { use: number; stops: boolean }>> = {
  barracks: { use: 3, stops: true },
  factory: { use: 6, stops: true },
  research_center: { use: 5, stops: true },
  airbase: { use: 8, stops: true },
  missile_silo: { use: 5, stops: true },
  iron_dome: { use: 6, stops: true },
  aa_battery: { use: 2, stops: true },
  refinery: { use: 5, stops: true },
  steel_mill: { use: 6, stops: true },
  house: { use: 1, stops: false },
  residential: { use: 2, stops: false },
  hospital: { use: 3, stops: false },
  school: { use: 2, stops: false },
  police_station: { use: 2, stops: false },
  city_hall: { use: 2, stops: false },
  market: { use: 2, stops: false },
  network_5g: { use: 10, stops: false },
  financial_center: { use: 6, stops: false },
  space_center: { use: 16, stops: false },
};

/** Vento (0,35 a 1,3): rajadas lentas e determinísticas, diferentes para cada parque. */
export function windFactor(seconds: number, id: number): number {
  const a = Math.sin(seconds * 0.013 + id * 1.7) * 0.5 + Math.sin(seconds * 0.041 + id * 0.6) * 0.3;
  return Math.min(1.3, Math.max(0.35, 0.82 + a * 0.6));
}

export interface PowerNode {
  id: number;
  type: BuildingType;
  /** Canto e lado (células). */
  cx: number;
  cy: number;
  size: number;
  /** Geração disponível agora (já com vento, sol e combustível). */
  gen: number;
  use: number;
}

export interface PowerResult {
  /** Construções consumidoras com luz. */
  powered: Set<number>;
  /** Consumidoras sem malha por perto (fora do alcance de estrada, usina ou Centro de Comando). */
  isolated: Set<number>;
  /** Geração usada de cada usina (0..1 da disponível), para o consumo de carvão. */
  load: Map<number, number>;
  supply: number;
  demand: number;
  served: number;
}

/**
 * Resolve a rede de um jogador: malha = células de estrada + área das usinas e do Centro de Comando; cada pedaço
 * conexo (4 vizinhos) é uma rede. Construções a até `reach` células de uma rede entram nela; uma construção que alcança
 * duas redes as une (a fiação dela passa por dentro). Em cada rede, a geração atende as consumidoras na ordem em que
 * chegam em `nodes`, que é a de construção (as mais antigas primeiro; os ids não têm ordem, ver `ids.ts`).
 */
export function solvePower(width: number, height: number, roadCells: Iterable<number>, hubs: readonly PowerNode[], nodes: readonly PowerNode[]): PowerResult {
  const grid = new Int32Array(width * height).fill(-1);
  // 1. células da malha
  const mesh: number[] = [];
  const mark = (i: number) => {
    if (grid[i] === -1) {
      grid[i] = -2;
      mesh.push(i);
    }
  };
  for (const i of roadCells) mark(i);
  for (const h of hubs) for (let y = h.cy; y < h.cy + h.size; y++) for (let x = h.cx; x < h.cx + h.size; x++) if (x >= 0 && y >= 0 && x < width && y < height) mark(y * width + x);
  // 2. pedaços conexos
  let comps = 0;
  for (const start of mesh) {
    if (grid[start] !== -2) continue;
    const c = comps++;
    const stack = [start];
    grid[start] = c;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (grid[j] === -2) {
          grid[j] = c;
          stack.push(j);
        }
      }
    }
  }
  // 3. cada construção liga-se às redes ao alcance; união das redes que ela toca
  const parent = Array.from({ length: comps }, (_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a]!)));
  const touches = new Map<number, number>();
  const R = POWER.reach;
  const all = [...hubs, ...nodes];
  for (const n of all) {
    let first = -1;
    for (let y = n.cy - R; y < n.cy + n.size + R; y++)
      for (let x = n.cx - R; x < n.cx + n.size + R; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const c = grid[y * width + x]!;
        if (c < 0) continue;
        if (first < 0) first = c;
        else {
          const a = find(first);
          const b = find(c);
          if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
        }
      }
    if (first >= 0) touches.set(n.id, first);
  }
  // 4. oferta e atendimento por rede
  const supplyBy = new Map<number, number>();
  const plantsBy = new Map<number, PowerNode[]>();
  for (const n of all)
    if (n.gen > 0 && touches.has(n.id)) {
      const c = find(touches.get(n.id)!);
      supplyBy.set(c, (supplyBy.get(c) ?? 0) + n.gen);
      let l = plantsBy.get(c);
      if (!l) plantsBy.set(c, (l = []));
      l.push(n);
    }
  const left = new Map(supplyBy);
  const usedBy = new Map<number, number>();
  const powered = new Set<number>();
  const isolated = new Set<number>();
  let demand = 0;
  let served = 0;
  // na ordem recebida, que é a de construção (os ids não têm ordem: KAC-06)
  for (const n of nodes) {
    if (n.use <= 0) continue;
    demand += n.use;
    const t = touches.get(n.id);
    if (t === undefined) {
      isolated.add(n.id);
      continue;
    }
    const c = find(t);
    const have = left.get(c) ?? 0;
    if (have + 1e-9 >= n.use) {
      left.set(c, have - n.use);
      usedBy.set(c, (usedBy.get(c) ?? 0) + n.use);
      powered.add(n.id);
      served += n.use;
    }
  }
  const load = new Map<number, number>();
  let supply = 0;
  for (const [c, plants] of plantsBy) {
    const total = supplyBy.get(c) ?? 0;
    supply += total;
    const frac = total > 0 ? Math.min(1, (usedBy.get(c) ?? 0) / total) : 0;
    for (const p of plants) load.set(p.id, frac);
  }
  return { powered, isolated, load, supply, demand, served };
}
