import { CELL_SIZE, TERRAIN, Terrain } from './config.ts';
import { Random } from './Random.ts';
import type { Cell, MapData } from './types.ts';

/**
 * Mapas das partidas com 2 a 6 nações (docs/BALANCEAMENTO_E_PROGRESSAO.md, lote 4):
 * - o tamanho cresce com o número de nações (96, 128 ou 160 células de lado);
 * - simetria por rotação em N partes em torno do centro: exata para 2 e 4 nações (rotação da grade)
 *   e por amostragem polar para 3, 5 e 6 (o mapa vira um círculo cercado de serras, para nenhuma
 *   nação ganhar um canto a mais);
 * - quatro tipos terrestres: Continental, Rios e Pontes, Montanhoso e Deserto. Os navais (Oceano
 *   Central e Arquipélago) esperam o conteúdo naval de combate;
 * - a região inicial reflete o país (mais floresta, petróleo, serras ou solo fértil), com
 *   compensação declarada em outro recurso.
 * Mesmo seed, mesmas nações e mesmo tipo → mesmo mapa.
 */
export type MapType = 'continental' | 'rivers' | 'mountains' | 'desert' | 'ocean' | 'islands';
export const MAP_TYPES: readonly MapType[] = ['continental', 'rivers', 'mountains', 'desert', 'ocean', 'islands'];
export const isMapType = (v: unknown): v is MapType => typeof v === 'string' && (MAP_TYPES as readonly string[]).includes(v);

export const MAP_TYPE_INFO: Record<MapType, { label: string; description: string }> = {
  continental: { label: 'Continental', description: 'Terra contínua com florestas, serras e planícies. O padrão.' },
  rivers: { label: 'Rios e Pontes', description: 'Rios largos entre as nações, cruzados só por pontes: pontos de estrangulamento.' },
  mountains: { label: 'Montanhoso', description: 'Cordilheiras com poucos passos, ferro farto e defesa forte; a artilharia vale mais.' },
  desert: { label: 'Deserto', description: 'Pouca comida e madeira, muito petróleo: economia de comércio e veículos.' },
  ocean: { label: 'Oceano Central', description: 'Um mar no centro e as nações na faixa de terra em volta: portos e navios de carga valem mais.' },
  islands: { label: 'Arquipélago', description: 'Cada nação na sua ilha, com o oceano entre elas; pontes longas até a ilha central são os únicos caminhos por terra.' },
};

/** Nações por partida: até 4 na versão grátis e até 6 para assinantes. */
export const MAX_NATIONS_FREE = 4;
export const MAX_NATIONS_SUBSCRIBER = 6;

export function mapSizeFor(nations: number): number {
  return nations <= 2 ? 96 : nations <= 4 ? 128 : 160;
}

/** Perfil da região inicial de cada país (com a compensação declarada no texto). */
export type RegionProfile = 'balanced' | 'forest' | 'oil' | 'mountains' | 'fertile';
export const REGION_INFO: Record<RegionProfile, { label: string; text: string }> = {
  balanced: { label: 'Equilibrada', text: 'Recursos iniciais padrão.' },
  forest: { label: 'Florestal', text: 'Mais floresta perto da base; em troca, menos rocha.' },
  oil: { label: 'Petrolífera', text: 'Uma jazida de petróleo a mais perto da base; em troca, menos solo fértil e floresta.' },
  mountains: { label: 'Serrana', text: 'Serra maior com mais minério de ferro; em troca, menos solo fértil.' },
  fertile: { label: 'Agrícola', text: 'Mais solo fértil perto da base; em troca, menos minério de ferro.' },
};
const COUNTRY_REGION: Record<string, RegionProfile> = {
  BRA: 'forest',
  CAN: 'forest',
  RUS: 'forest',
  KOR: 'forest',
  SAU: 'oil',
  MEX: 'oil',
  EGY: 'oil',
  AUS: 'oil',
  JPN: 'mountains',
  CHN: 'mountains',
  TUR: 'mountains',
  PRK: 'mountains',
  ZAF: 'mountains',
  ITA: 'mountains',
  ARG: 'fertile',
  USA: 'fertile',
  FRA: 'fertile',
  IND: 'fertile',
  DEU: 'fertile',
  UKR: 'fertile',
};
export const regionOf = (countryId: string | undefined): RegionProfile => (countryId && COUNTRY_REGION[countryId]) || 'balanced';

export interface MatchMapOptions {
  nations: number;
  type?: MapType;
  /** País de cada slot (região inicial). */
  countries?: readonly string[];
}

/** Ruído de valor contínuo (amostrado em coordenadas fracionárias), em grade grossa. */
function noiseField(rng: Random, size: number, scale: number): (x: number, y: number) => number {
  const coarse = Math.ceil(size / scale) + 3;
  const pts = new Float64Array(coarse * coarse);
  for (let i = 0; i < pts.length; i++) pts[i] = rng.next();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x, y) => {
    const gx = Math.max(0, Math.min(coarse - 2.001, x / scale));
    const gy = Math.max(0, Math.min(coarse - 2.001, y / scale));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const v = (i: number, j: number) => pts[(y0 + j) * coarse + x0 + i]!;
    return lerp(lerp(v(0, 0), v(1, 0), tx), lerp(v(0, 1), v(1, 1), tx), ty);
  };
}

export function generateMatchMap(seed: number, opts: MatchMapOptions): MapData {
  const n = Math.max(2, Math.min(MAX_NATIONS_SUBSCRIBER, Math.floor(opts.nations)));
  const type = opts.type ?? 'continental';
  const size = mapSizeFor(n);
  const rng = new Random(seed ^ (n * 0x9e37) ^ (MAP_TYPES.indexOf(type) * 0x51ed));
  const elevation = noiseField(rng, size, 11);
  const moisture = noiseField(rng, size, 7);
  const detail = noiseField(rng, size, 3.5);
  const c = (size - 1) / 2;
  const R = size / 2 - 1;
  const sector = (Math.PI * 2) / n;
  // primeira nação no canto superior esquerdo (como no mapa de dois jogadores)
  const base = -Math.PI * 0.75;
  const circular = n !== 2 && n !== 4;
  const terrain: Terrain[] = new Array<Terrain>(size * size).fill(Terrain.Plains);

  // tipo de mapa: limiares de água, serra, floresta e solo fértil
  const mix = {
    continental: { water: 0.2, mud: 0.26, rock: 0.78, forest: 0.66, fertileLo: 0.3 },
    rivers: { water: 0.14, mud: 0.2, rock: 0.8, forest: 0.62, fertileLo: 0.34 },
    mountains: { water: 0.16, mud: 0.21, rock: 0.64, forest: 0.68, fertileLo: 0.26 },
    desert: { water: 0.1, mud: 0.13, rock: 0.8, forest: 0.86, fertileLo: 0.12 },
    // oceânicos (03/11): poucos lagos em terra; o mar vem da forma do mapa (abaixo)
    ocean: { water: 0.12, mud: 0.17, rock: 0.79, forest: 0.64, fertileLo: 0.3 },
    islands: { water: 0.1, mud: 0.15, rock: 0.8, forest: 0.62, fertileLo: 0.32 },
  }[type];
  // ponto de partida da nação 0 (as demais giram junto); usado também pela forma das ilhas
  const spawnR = n === 2 ? R * 0.92 : n === 4 ? R * 0.86 : R * 0.72;
  const s0 = { cx: Math.round(c + spawnR * Math.cos(base)), cy: Math.round(c + spawnR * Math.sin(base)) };
  /** Raio da ilha de cada nação e da ilha central (Arquipélago) e do mar central (Oceano Central). */
  const islandR = 23;
  const islandShift = 5 / Math.max(1, spawnR);
  const centralIslandR = R * 0.2;
  const seaR = R * 0.45;
  /** Forma dos mapas oceânicos no domínio fundamental: água, praia (lama) ou terra (null = segue o relevo). */
  const oceanShape = (fx: number, fy: number, r: number): Terrain | null => {
    const wobble = 0.85 + 0.3 * detail(fx * 0.8 + 11, fy * 0.8 + 3);
    if (type === 'islands') {
      // a ilha fica um pouco para dentro da base (no mapa de 2 nações a base está no canto)
      const d = Math.hypot(fx - (s0.cx + (c - s0.cx) * islandShift), fy - (s0.cy + (c - s0.cy) * islandShift));
      const rr = islandR * wobble;
      const rc = centralIslandR * (0.9 + 0.2 * detail(fx + 5, fy + 5));
      if (d < rr - 1.5 || r < rc - 1.2) return null;
      if (d < rr || r < rc) return Terrain.Mud;
      return Terrain.Water;
    }
    if (type === 'ocean') {
      const rs = seaR * wobble;
      if (r < rs) return Terrain.Water;
      if (r < rs + 1.5) return Terrain.Mud;
    }
    return null;
  };

  /** Terreno do ponto do domínio fundamental equivalente à célula (simetria por amostragem). */
  const sample = (x: number, y: number): Terrain => {
    const dx = x - c;
    const dy = y - c;
    const r = Math.hypot(dx, dy);
    if (circular && r > R) return Terrain.Water;
    const a = (((Math.atan2(dy, dx) - base) % sector) + sector) % sector;
    const fx = c + r * Math.cos(base + a);
    const fy = c + r * Math.sin(base + a);
    const e = elevation(fx, fy) * 0.75 + detail(fx, fy) * 0.25;
    const m = moisture(fx, fy);
    // faixa de lama (praia) na costa do continente circular
    if (circular && r > R - 1.5) return Terrain.Mud;
    const shape = oceanShape(fx, fy, r);
    if (shape !== null) return shape;
    if (e < mix.water) return Terrain.Water;
    if (e < mix.mud) return Terrain.Mud;
    if (e > mix.rock) return detail(fx, fy) > 0.62 && e > mix.rock + 0.04 ? Terrain.Ore : Terrain.Rock;
    if (m > mix.forest) return Terrain.Forest;
    if (m < mix.fertileLo && e > 0.4 && e < 0.62) return Terrain.Fertile;
    return Terrain.Plains;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) terrain[y * size + x] = sample(x, y);

  // simetria exata da grade para 2 (180°) e 4 (90°) nações: cada órbita copia o representante
  const rot = (x: number, y: number, k: number): [number, number] => {
    let px = x;
    let py = y;
    for (let i = 0; i < k; i++) [px, py] = [size - 1 - py, px];
    return [px, py];
  };
  const orbit = (x: number, y: number): [number, number][] => {
    if (n === 2) return [[x, y], rot(x, y, 2)];
    if (n === 4) return [0, 1, 2, 3].map((k) => rot(x, y, k));
    return [[x, y]];
  };
  if (!circular) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const o = orbit(x, y);
        const rep = o.reduce((a, b) => (b[1] * size + b[0] < a[1] * size + a[0] ? b : a));
        terrain[y * size + x] = terrain[rep[1] * size + rep[0]]!;
      }
  }

  /**
   * Célula equivalente na nação `k` (a nação 0 é a referência): rotação exata da grade para 2 e 4
   * nações; para 3, 5 e 6, rotação pelo ângulo do setor com arredondamento.
   */
  const rotCell = (x: number, y: number, k: number): [number, number] => {
    if (!circular) return rot(x, y, (k * 4) / n);
    const a = k * sector;
    const dx = x - c;
    const dy = y - c;
    return [Math.round(c + dx * Math.cos(a) - dy * Math.sin(a)), Math.round(c + dx * Math.sin(a) + dy * Math.cos(a))];
  };
  /** Âncora de uma jazida 2×2 na nação `k` (o bloco gira junto). */
  const rotNode = (cell: Cell, k: number): Cell => {
    if (!circular) {
      const corners = [rot(cell.cx, cell.cy, (k * 4) / n), rot(cell.cx + 1, cell.cy + 1, (k * 4) / n)];
      return { cx: Math.min(corners[0]![0], corners[1]![0]), cy: Math.min(corners[0]![1], corners[1]![1]) };
    }
    const [x, y] = rotCell(cell.cx + 0.5, cell.cy + 0.5, k);
    return { cx: x, cy: y };
  };
  const inside = (x: number, y: number) => x >= 1 && y >= 1 && x < size - 1 && y < size - 1;
  const setOne = (x: number, y: number, t: Terrain) => {
    if (inside(x, y)) terrain[y * size + x] = t;
  };
  /** Pinta na referência (nação 0) e em todas as equivalentes. */
  const setAll = (x: number, y: number, t: Terrain) => {
    for (let k = 0; k < n; k++) {
      const [px, py] = rotCell(x, y, k);
      setOne(px, py, t);
    }
  };
  const disc = (cx: number, cy: number, r: number, t: Terrain, keep?: (t: Terrain) => boolean) => {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        if (keep && inside(x, y) && keep(terrain[y * size + x]!)) continue;
        setAll(x, y, t);
      }
  };

  // --- tipo de mapa: rio ou cordilheira na fronteira entre a nação 0 e a seguinte (replicado)
  if (type === 'rivers' || type === 'mountains') {
    const a = base + 0.5 * sector;
    for (let r = R * 0.12; r <= R + 1; r += 0.5) {
      const wob = Math.sin(r * 0.35) * 1.2;
      const x = c + r * Math.cos(a) - wob * Math.sin(a);
      const y = c + r * Math.sin(a) + wob * Math.cos(a);
      if (type === 'mountains' && (Math.abs(r - R * 0.42) < 2.2 || Math.abs(r - R * 0.78) < 2.2)) continue;
      disc(x, y, type === 'rivers' ? 1.3 : 1.8, type === 'rivers' ? Terrain.Water : Terrain.Rock);
    }
    if (type === 'rivers') disc(c, c, R * 0.14, Terrain.Water);
  }

  // --- ponto de partida e região inicial (kit da nação 0, replicado; o perfil do país muda o tamanho)
  const spawns: Cell[] = [];
  for (let k = 0; k < n; k++) {
    const [x, y] = rotCell(s0.cx, s0.cy, k);
    spawns.push({ cx: x, cy: y });
  }
  const f = { x: -Math.cos(base), y: -Math.sin(base) };
  const side = { x: -Math.sin(base), y: Math.cos(base) };
  const at = (along: number, across: number) => ({ x: s0.cx + along * f.x + across * side.x, y: s0.cy + along * f.y + across * side.y });
  disc(s0.cx, s0.cy, 7.5, Terrain.Plains);
  const desert = type === 'desert';
  // terreno comum a todas as nações; o perfil do país ajusta só a própria região, depois
  const kit: { along: number; across: number; t: Terrain; r: (p: RegionProfile) => number }[] = [
    { along: -5, across: -6, t: Terrain.Rock, r: (p) => (p === 'forest' ? 1.8 : 2.1) },
    { along: 9, across: 4, t: Terrain.Rock, r: (p) => (p === 'mountains' ? 2.8 : 2.3) },
    // início garantido (docs/RECALIBRAGEM_RECURSOS.md §2.4): o veio de minério aflora do lado da base, com
    // células suficientes para a primeira mina trabalhar cheia
    { along: 6.5, across: 4.5, t: Terrain.Ore, r: (p) => (p === 'mountains' ? 2.6 : p === 'fertile' ? 2.2 : 2.4) },
    { along: -3, across: 8, t: Terrain.Forest, r: (p) => (desert ? 1.6 : 0) + (p === 'forest' ? 3.4 : p === 'oil' ? 2.0 : 2.6) * (desert ? 0.4 : 1) },
    { along: 6, across: -6, t: Terrain.Fertile, r: (p) => (desert ? 1.6 : 0) + (p === 'fertile' ? 3.2 : p === 'oil' || p === 'mountains' ? 1.9 : 2.4) * (desert ? 0.3 : 1) },
  ];
  const paintKit = (set: (x: number, y: number, t: Terrain) => void) => {
    for (let k = 0; k < n; k++) {
      const prof = regionOf(opts.countries?.[k]);
      for (const item of kit) {
        const p = at(item.along, item.across);
        const r = item.r(prof);
        if (circular) {
          // setores de 3, 5 ou 6 nações: gira o centro e pinta o disco inteiro (girar célula a célula
          // arredonda e perde células do disco)
          const a = k * sector;
          const ox = Math.round(p.x) - c;
          const oy = Math.round(p.y) - c;
          const qx = Math.round(c + ox * Math.cos(a) - oy * Math.sin(a));
          const qy = Math.round(c + ox * Math.sin(a) + oy * Math.cos(a));
          for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
            for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r * r) set(qx + dx, qy + dy, item.t);
          continue;
        }
        for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
          for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const [x, y] = rotCell(Math.round(p.x) + dx, Math.round(p.y) + dy, k);
            set(x, y, item.t);
          }
      }
    }
  };
  // --- montanhas (03/11): maciços altos de rocha com veios de minério na base, onde cabem pedreira e mina com estoque
  // grande. Por nação: um no flanco da base e um maior entre ela e a vizinha (disputado). Desenhados na nação 0 e
  // copiados para as outras pela mesma simetria do mapa; lagos e passagens ficam como estão.
  const scale = type === 'mountains' ? 1.3 : type === 'desert' ? 0.8 : 1;
  /** Terreno de um ponto do maciço, a partir do centro (dx, dy) (null = fora). `ore` aponta para onde fica o minério. */
  const massifAt = (mx: number, my: number, r0: number, ore: { x: number; y: number } | null, dx: number, dy: number): Terrain | null => {
    const d = Math.hypot(dx, dy);
    const rr = r0 * (0.8 + 0.45 * detail(mx + dx * 0.9 + 5, my + dy * 0.9 + 9));
    if (d > rr) return null;
    if (d <= rr - 2.3) return Terrain.Rock;
    // anel da base: minério do lado indicado (ou em manchas, se não houver lado)
    if (ore ? (dx * ore.x + dy * ore.y) / (d || 1) > 0.3 : detail(mx - dx + 2, my - dy + 4) > 0.55) return Terrain.Ore;
    return Terrain.Rock;
  };
  const massif = (mx: number, my: number, r0: number, ore: { x: number; y: number } | null) => {
    const ext = Math.ceil(r0 * 1.3) + 1;
    for (let k = 0; k < n; k++) {
      if (!circular) {
        for (let dy = -ext; dy <= ext; dy++)
          for (let dx = -ext; dx <= ext; dx++) {
            const t = massifAt(mx, my, r0, ore, dx, dy);
            if (t === null) continue;
            const [px, py] = rotCell(Math.round(mx) + dx, Math.round(my) + dy, k);
            if (inside(px, py) && terrain[py * size + px] !== Terrain.Water && terrain[py * size + px] !== Terrain.Road) terrain[py * size + px] = t;
          }
        continue;
      }
      // 3, 5 e 6 nações: cada célula em volta do centro girado amostra o maciço de referência (sem buracos)
      const a = k * sector;
      const ox = mx - c;
      const oy = my - c;
      const qx = Math.round(c + ox * Math.cos(a) - oy * Math.sin(a));
      const qy = Math.round(c + ox * Math.sin(a) + oy * Math.cos(a));
      for (let ey = -ext; ey <= ext; ey++)
        for (let ex = -ext; ex <= ext; ex++) {
          const rx = ex * Math.cos(-a) - ey * Math.sin(-a);
          const ry = ex * Math.sin(-a) + ey * Math.cos(-a);
          const t = massifAt(mx, my, r0, ore, rx, ry);
          if (t === null) continue;
          const px = qx + ex;
          const py = qy + ey;
          if (inside(px, py) && terrain[py * size + px] !== Terrain.Water && terrain[py * size + px] !== Terrain.Road) terrain[py * size + px] = t;
        }
    }
  };
  {
    // flanco da base: minério virado para a base
    const fl = at(6, -18);
    const toBase = { x: s0.cx - fl.x, y: s0.cy - fl.y };
    const len = Math.hypot(toBase.x, toBase.y) || 1;
    massif(fl.x, fl.y, 5 * scale, { x: toBase.x / len, y: toBase.y / len });
    // entre as nações (disputado): maior, com minério em manchas por toda a base
    const ma = base + 0.5 * sector;
    const mr = n === 2 ? R * 0.5 : n === 4 ? R * 0.55 : R * 0.5;
    massif(c + mr * Math.cos(ma), c + mr * Math.sin(ma), (n === 2 ? 7 : 6) * scale, null);
  }
  paintKit(setOne);


  // jazidas de petróleo: duas perto de cada base, +1 no deserto ou no perfil petrolífero, e uma
  // disputada a caminho da nação vizinha
  const resourceNodes: Cell[] = [];
  const nodeAt = (cell: Cell, k: number) => {
    const nd = rotNode(cell, k);
    for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) if ((dx - 0.5) ** 2 + (dy - 0.5) ** 2 <= 7) setOne(nd.cx + dx, nd.cy + dy, Terrain.Plains);
    resourceNodes.push(nd);
  };
  const cellOf = (p: { x: number; y: number }): Cell => ({ cx: Math.round(p.x), cy: Math.round(p.y) });
  const shared = [cellOf(at(3, 10)), cellOf(at(-1, -11))];
  const ca = base + 0.3 * sector;
  // Arquipélago: a jazida disputada fica na ilha central; Oceano Central: na faixa de terra, longe do mar
  const cr = type === 'islands' ? R * 0.1 : type === 'ocean' ? R * 0.68 : n === 2 ? R * 0.35 : R * 0.45;
  shared.push({ cx: Math.round(c + cr * Math.cos(ca)), cy: Math.round(c + cr * Math.sin(ca)) });
  const extra = cellOf(at(-8, 1));
  for (let k = 0; k < n; k++) {
    for (const cell of shared) nodeAt(cell, k);
    if (desert || regionOf(opts.countries?.[k]) === 'oil') nodeAt(extra, k);
  }

  // --- passagens: de cada base ao centro, só onde o caminho cruza água ou rocha (pontes e cortes na serra). Antes era
  // uma estrada de cascalho inteira: denunciava onde ficavam as outras nações e impedia o jogador de pavimentar por
  // cima (pedido do usuário, 01/11). Em terreno transitável o caminho não deixa marca
  const onNode = (x: number, y: number) => resourceNodes.some((nd) => x >= nd.cx && x <= nd.cx + 1 && y >= nd.cy && y <= nd.cy + 1);
  const road = (x: number, y: number) => {
    if (!inside(x, y) || onNode(x, y)) return;
    // Oceano Central: o caminho até o centro morre no mar (sem ponte); só corta a serra
    if (type === 'ocean' && terrain[y * size + x] === Terrain.Water) return;
    if (!TERRAIN[terrain[y * size + x]!].passable) setOne(x, y, Terrain.Road);
  };
  if (!circular) {
    const steps = Math.ceil(Math.hypot(c - s0.cx, c - s0.cy) * 2);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(s0.cx + ((c - s0.cx) * i) / steps);
      const y = Math.round(s0.cy + ((c - s0.cy) * i) / steps);
      for (let k = 0; k < n; k++) for (const [px, py] of [rotCell(x, y, k), rotCell(x + 1, y, k), rotCell(x, y + 1, k)]) road(px, py);
    }
  } else {
    // giradas por ângulo, as células ficariam só na diagonal: cada nação traça a sua em linha reta do
    // ponto de partida ao centro, com o carimbo de 3 células (passagem ortogonal contínua). A linha reta
    // não atravessa os recursos da base, que ficam ao lado do caminho
    const tc = Math.round(c);
    for (const sp of spawns) {
      const steps = Math.ceil(Math.hypot(tc - sp.cx, tc - sp.cy) * 2);
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(sp.cx + ((tc - sp.cx) * i) / steps);
        const y = Math.round(sp.cy + ((tc - sp.cy) * i) / steps);
        road(x, y);
        road(x + 1, y);
        road(x, y + 1);
      }
    }
  }
  if (type !== 'ocean') disc(c, c, 2.2, Terrain.Road, (t) => TERRAIN[t].passable);
  // início garantido: os discos de recursos de cada base são repintados por cima das estradas e jazidas
  // (sem cobrir a estrada, que garante a passagem), para nenhuma nação perder células da primeira coleta
  paintKit((x, y, t) => {
    if (inside(x, y) && terrain[y * size + x] !== Terrain.Road && !onNode(x, y)) terrain[y * size + x] = t;
  });

  return { width: size, height: size, cellSize: CELL_SIZE, seed: seed >>> 0, terrain, resourceNodes, spawns, kind: type };
}
