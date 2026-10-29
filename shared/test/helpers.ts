import type { NationalSimulation } from '../strategic/NationalSimulation.ts';
import { CELL_SIZE, Terrain } from '../sim/config.ts';
import type { MapData } from '../sim/types.ts';

/** Mapa plano 32x32 com bases em cantos opostos, para testes controlados. */
export function flatMap(size = 32, edit?: (set: (cx: number, cy: number, t: Terrain) => void) => void): MapData {
  const terrain = new Array<Terrain>(size * size).fill(Terrain.Plains);
  edit?.((cx, cy, t) => {
    terrain[cy * size + cx] = t;
  });
  return {
    width: size,
    height: size,
    cellSize: CELL_SIZE,
    seed: 1,
    terrain,
    resourceNodes: [{ cx: 10, cy: 3 }],
    spawns: [
      { cx: 3, cy: 3 },
      { cx: size - 4, cy: size - 4 },
    ],
  };
}

/** Atalho de teste: estabelece contato mútuo sem passar pela missão de contato. */
export function meet(sim: NationalSimulation, a: number, b: number) {
  sim.diplomacy.discover(a, b, 'contato', sim.day);
  sim.diplomacy.discover(b, a, 'contato', sim.day);
}

/** Teatro de teste: estoques táticos simples e registro das guerras ativadas no combate. */
export function theater(sim: NationalSimulation, stock = { supplies: 1000, oil: 1000 }) {
  const stocks = new Map([0, 1].map((s) => [s, { supplies: stock.supplies, food: 0, wood: 0, stone: 0, iron: 0, oil: stock.oil }]));
  const wars: [number, number][] = [];
  sim.attachTheater({
    resources: (slot) => stocks.get(slot) ?? null,
    spend: (slot, cost) => {
      const st = stocks.get(slot)!;
      st.supplies -= cost.supplies ?? 0;
      st.oil -= cost.oil ?? 0;
    },
    setWar: (a, b) => wars.push([a, b]),
  });
  return { stocks, wars };
}


/**
 * Estoque folgado para testes de regras (dentro da capacidade do Centro de Comando): o começo
 * real da partida é enxuto de propósito (ver `STARTING_RESOURCES`), mas os testes de construção e
 * produção conferem regras, não o ritmo da economia.
 */
export const TEST_START = { supplies: 1200, food: 300, wood: 300, stone: 300, iron: 200, oil: 100 };
