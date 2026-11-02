import { TICK_RATE, Terrain, type BuildingType } from './config.ts';
import { citySeat } from './cities.ts';
import type { PowerNode } from './power.ts';
import type { Building, Slot } from './types.ts';

/**
 * Zoneamento (02/11, pedido do usuário: "o próximo update eleva a um novo nível a mecânica de citybuilder").
 *
 * - O jogador pinta células junto às suas estradas construídas (até `ZONING.reach` células) como residenciais,
 *   comerciais ou industriais. Pintar não constrói nada: a cidade cresce sozinha, aos poucos, conforme a demanda.
 * - Cada cidade (QG ou prefeitura, ver `cities.ts`) tem a sua demanda por setor, calculada pelos seus números:
 *   moradores, empregos, lojas, indústrias, serviços (delegacia, escola/universidade, hospital), luz nos lotes; e pelos
 *   do país: economia (aprovação e crescimento), imposto de cada setor, governo autoritário (decretos) e ataques
 *   recentes.
 * - Os lotes são privados: não produzem nem gastam recursos do mapa; pagam imposto ao caixa do país e consomem só
 *   energia (`ZONING.lotPower` cada). Casa vira prédio quando a cidade precisa de muita moradia.
 * - Com imposto alto, governo autoritário, ataques seguidos, falta de luz ou de emprego, os lotes podem ser
 *   abandonados. O abandonado fica no lugar (sem pagar imposto nem gastar luz) até o jogador demolir.
 *
 * Lotes não são entidades (como as minas terrestres): ocupam a célula na grade (`LOT_OCCUPANT`) e vão no snapshot só
 * para o dono e para quem enxerga a célula. As zonas pintadas só vão para o dono.
 */
export type ZoneKind = 'res' | 'com' | 'ind';
export const ZONE_KINDS: readonly ZoneKind[] = ['res', 'com', 'ind'];
export const isZoneKind = (v: unknown): v is ZoneKind => v === 'res' || v === 'com' || v === 'ind';
export const ZONE_LABEL: Record<ZoneKind, string> = { res: 'Residencial', com: 'Comercial', ind: 'Industrial' };

export const ZONING = {
  /** Distância máxima (células, em xadrez) de uma estrada construída do jogador. */
  reach: 2,
  /** A cidade é avaliada a cada N ticks. */
  everyTicks: TICK_RATE * 4,
  /**
   * Crescimento: lotes por segundo de um setor com atratividade 1 (cresce com o quadrado da atratividade: 0,5 dá um
   * quarto disso; 0,2, 4%).
   */
  growthPerSecond: 0.08,
  /** Chance de o lote residencial novo já nascer prédio (com muita procura e cidade grande). */
  apartmentChance: 0.12,
  /** Cidadãos que cada casa e cada prédio privados trazem (e levam ao serem abandonados ou demolidos). */
  citizens: [1, 5] as const,
  /** Chance de abandono por avaliação, por lote, multiplicada pelo risco. */
  abandonChance: 0.03,
  /** Energia de cada lote ativo. */
  lotPower: 0.5,
  /** Moradores (para a demanda da cidade) de uma casa e de um prédio privados: os cidadãos que eles trazem. */
  residents: [1, 5] as const,
  /** Empregos de uma loja e de uma indústria privadas (para a demanda residencial). */
  jobs: { com: 3, ind: 6 },
  /** Imposto por setor (%): padrão e teto. */
  taxDefault: 10,
  taxMax: 30,
  /** Os ataques pesam por uns minutos (meia-vida). */
  heatHalfLifeTicks: TICK_RATE * 90,
  /** Células por comando de pintura. */
  maxCellsPerCommand: 400,
  /** Variações de modelo por setor (casas, lojas, indústrias). */
  variants: 4,
};

/** Ocupante da grade para um lote privado (os edifícios usam o próprio id, sempre positivo). */
export const LOT_OCCUPANT = -7;

export interface Lot {
  owner: Slot;
  kind: ZoneKind;
  /** Modelo (0..variants-1). */
  variant: number;
  /** 1 = casa / loja / indústria; 2 = prédio (só residencial). */
  level: 1 | 2;
  abandoned: boolean;
  since: number;
  /**
   * Lado da estrada visto da célula da frente (02/11: todo lote encosta na rua): 0 = sul (+y), 1 = norte, 2 = leste
   * (+x), 3 = oeste. Ausente em salvamentos antigos (0).
   */
  face?: number;
  /** Célula de trás (lote fundo: a construção é mais comprida e ocupa as duas células), ou ausente. */
  back?: number;
}

export type ZoneTax = Record<ZoneKind, number>;

export interface ZoneSave {
  zones: [number, Slot, ZoneKind][];
  lots: [number, Lot][];
  tax: ZoneTax[];
  heat: number[];
  growth?: Record<number, Record<ZoneKind, number>>[];
}

/** Números de uma cidade para o zoneamento (o que o painel mostra). */
export interface CityZoneStats {
  /** Id da sede (QG ou prefeitura). */
  seat: number;
  name: string;
  residents: number;
  jobs: number;
  lots: Record<ZoneKind, number>;
  abandoned: number;
  zoned: Record<ZoneKind, number>;
  services: { police: boolean; school: boolean; hospital: boolean };
  /** Atratividade por setor (−1..1): positiva atrai lotes novos, mais rápido quanto maior. */
  demand: Record<ZoneKind, number>;
  /** Desenvolvimento da cidade (0..1): serviços, empregos, construções do governo e era. */
  development: number;
}

/** O que o zoneamento precisa da simulação (mantém o módulo testável e sem dependência circular). */
export interface ZoningHost {
  readonly tick: number;
  readonly map: { width: number; height: number; terrain: Terrain[] };
  readonly territory: ArrayLike<number>;
  readonly buildings: readonly Building[];
  readonly roads: readonly { i: number; owner: Slot }[];
  readonly grid: { occupant(cx: number, cy: number): number; setOccupied(cell: { cx: number; cy: number }, size: number, id: number): void };
  readonly playerCount: number;
  /** Economia do país (aprovação 0..100 e crescimento real em % ao ano) e quão autoritário está o governo (0..1). */
  approval(slot: Slot): number;
  growth(slot: Slot): number;
  authoritarian(slot: Slot): number;
  cityName(b: Building): string | undefined;
  workersIn(b: Building): number;
  isVisibleTo(slot: Slot, p: { x: number; y: number }): boolean;
  /** Era da nação (1..4). */
  era(slot: Slot): number;
  /** Capacidade de moradia de uma construção do governo pronta (casas e prédios residenciais). */
  housingOf(b: Building): number;
  /** Quantos cidadãos ainda cabem no teto nacional de população. */
  popRoom(slot: Slot): number;
  /** Cidadãos chegam (lote residencial novo) ou vão embora (abandonado ou demolido). */
  moveCitizens(slot: Slot, n: number): void;
  /** Rede elétrica ligada na partida (sem ela, todo lote conta como aceso). */
  readonly powerOn: boolean;
  /** Há unidade parada na célula (o lote não nasce em cima dela). */
  unitOn(i: number): boolean;
  readonly cellSize: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Sorteio determinístico (mesmo resultado no servidor para o mesmo tick, célula e uso). */
export function lotRandom(tick: number, i: number, salt: number): number {
  let t = (Math.imul(tick ^ 0x9e3779b9, 2654435761) ^ Math.imul(i + 1, 40503) ^ Math.imul(salt + 7, 2246822519)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class ZoneSystem {
  /** Zonas pintadas: célula → dono e setor. */
  zones = new Map<number, { owner: Slot; kind: ZoneKind }>();
  /** Lotes privados: célula da frente (a que encosta na rua) → lote. */
  lots = new Map<number, Lot>();
  /** Toda célula ocupada por lote (frente e fundo) → célula da frente. */
  readonly cover = new Map<number, number>();
  tax: ZoneTax[] = [];
  /** Ataques recentes (decai com o tempo). */
  heat: number[] = [];
  /** Lotes com luz no último cálculo da rede. */
  private litLots = new Set<number>();
  /** Procura acumulada por jogador, cidade (id da sede) e setor (o lote surge quando enche). */
  growth: Record<number, Record<ZoneKind, number>>[] = [];
  /** Muda a cada alteração de zonas ou lotes (o cliente refaz as camadas). */
  version = 0;
  private stats: CityZoneStats[][] = [];

  constructor(private readonly host: ZoningHost) {}

  /** Alíquotas do jogador (padrão sem guardar nada: ler não muda o estado salvo). */
  taxOf(slot: Slot): ZoneTax {
    return this.tax[slot] ?? { res: ZONING.taxDefault, com: ZONING.taxDefault, ind: ZONING.taxDefault };
  }

  // ------------------------------------------------------------ comandos

  /** Célula pode receber zona do jogador? (motivo ou null) */
  cellProblem(slot: Slot, i: number, ownRoads?: Set<number>): string | null {
    const h = this.host;
    const W = h.map.width;
    const cx = i % W;
    const cy = (i - cx) / W;
    if (cx < 0 || cy < 0 || cx >= W || cy >= h.map.height) return 'Fora do mapa';
    if (h.territory[i] !== slot) return 'Fora do seu território';
    const t = h.map.terrain[i];
    if (t !== Terrain.Plains && t !== Terrain.Fertile) return 'Zonas só em planície ou solo fértil';
    if (h.grid.occupant(cx, cy) !== 0) return 'Há uma construção no lugar';
    const roads = ownRoads ?? new Set(h.roads.filter((r) => r.owner === slot).map((r) => r.i));
    if (!this.nearRoad(cx, cy, roads)) return `Zonas ficam a até ${ZONING.reach} células de uma estrada sua`;
    return null;
  }

  private nearRoad(cx: number, cy: number, roads: Set<number>): boolean {
    const W = this.host.map.width;
    const R = ZONING.reach;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < W && y < this.host.map.height && roads.has(y * W + x)) return true;
      }
    return false;
  }

  /** Pinta (ou apaga, com `kind` null) as células. Retorna erro só se nenhuma célula valer. */
  paint(slot: Slot, cells: readonly number[], kind: ZoneKind | null): string | null {
    if (!cells.length) return 'Nenhuma célula';
    if (cells.length > ZONING.maxCellsPerCommand) return `Até ${ZONING.maxCellsPerCommand} células por vez`;
    const roads = new Set(this.host.roads.filter((r) => r.owner === slot).map((r) => r.i));
    let changed = 0;
    let first: string | null = null;
    for (const i of new Set(cells)) {
      const z = this.zones.get(i);
      if (kind === null) {
        if (z && z.owner === slot && !this.cover.has(i)) {
          this.zones.delete(i);
          changed++;
        }
        continue;
      }
      if (z && z.owner === slot && z.kind === kind) continue;
      if (this.cover.has(i)) {
        first ??= 'Há um lote no lugar: demolir antes de mudar a zona';
        continue;
      }
      const problem = this.cellProblem(slot, i, roads);
      if (problem) {
        first ??= problem;
        continue;
      }
      this.zones.set(i, { owner: slot, kind });
      changed++;
    }
    if (!changed) return kind === null ? 'Nenhuma zona sua (sem lote) nessas células' : (first ?? 'Nada para mudar');
    this.version++;
    return null;
  }

  /** Demole lotes próprios (abandonados ou não); a zona continua pintada. */
  demolish(slot: Slot, cells: readonly number[]): string | null {
    let n = 0;
    for (const c of new Set(cells)) {
      const i = this.cover.get(c);
      const lot = i !== undefined ? this.lots.get(i) : undefined;
      if (i === undefined || !lot || lot.owner !== slot) continue;
      if (lot.kind === 'res' && !lot.abandoned) this.host.moveCitizens(slot, -ZONING.citizens[lot.level - 1]!);
      this.removeLot(i);
      n++;
    }
    if (!n) return 'Nenhum lote seu nessas células';
    this.version++;
    return null;
  }

  setTax(slot: Slot, kind: ZoneKind, pct: number): string | null {
    if (!Number.isFinite(pct) || pct < 0 || pct > ZONING.taxMax) return `Imposto entre 0 e ${ZONING.taxMax}%`;
    for (let s = 0; s <= slot; s++) this.tax[s] ??= { ...this.taxOf(s) };
    this.tax[slot]![kind] = Math.round(pct);
    return null;
  }

  // ------------------------------------------------------------ eventos do mundo

  /** Um ataque a construções do jogador (um por alerta de "sob ataque"): a cidade fica com medo por uns minutos. */
  noteAttack(slot: Slot): void {
    this.heat[slot] = (this.heat[slot] ?? 0) + 1;
  }

  /** Uma estrada nova ou uma construção tomou a célula: a zona some (lotes já bloqueiam a célula). */
  clearCell(i: number): void {
    if (this.zones.delete(i)) this.version++;
  }

  /** Células de um lote: a da frente e, no lote fundo, a de trás. */
  lotCells(i: number, l: Lot): number[] {
    return l.back !== undefined ? [i, l.back] : [i];
  }

  private placeLot(i: number, l: Lot): void {
    const W = this.host.map.width;
    this.lots.set(i, l);
    for (const c of this.lotCells(i, l)) {
      this.cover.set(c, i);
      this.host.grid.setOccupied({ cx: c % W, cy: Math.floor(c / W) }, 1, LOT_OCCUPANT);
    }
  }

  private removeLot(i: number): void {
    const W = this.host.map.width;
    const l = this.lots.get(i);
    this.lots.delete(i);
    this.litLots.delete(i);
    for (const c of l ? this.lotCells(i, l) : [i]) {
      this.cover.delete(c);
      if (this.host.grid.occupant(c % W, Math.floor(c / W)) === LOT_OCCUPANT) this.host.grid.setOccupied({ cx: c % W, cy: Math.floor(c / W) }, 1, 0);
    }
  }

  /** Lado da estrada própria encostada na célula (0 sul, 1 norte, 2 leste, 3 oeste), ou −1 se nenhuma. */
  private roadSide(i: number, roads: Set<number>): number {
    const W = this.host.map.width;
    const cx = i % W;
    const cy = Math.floor(i / W);
    const sides: [number, number][] = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (let f = 0; f < 4; f++) {
      const [dx, dy] = sides[f]!;
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && y >= 0 && x < W && y < this.host.map.height && roads.has(y * W + x)) return f;
    }
    return -1;
  }

  /** Célula atrás da frente (do lado oposto à estrada), ou −1 fora do mapa. */
  private behind(i: number, face: number): number {
    const W = this.host.map.width;
    const [dx, dy] = ([[0, -1], [0, 1], [-1, 0], [1, 0]] as const)[face]!;
    const x = (i % W) + dx;
    const y = Math.floor(i / W) + dy;
    return x >= 0 && y >= 0 && x < W && y < this.host.map.height ? y * W + x : -1;
  }

  // ------------------------------------------------------------ energia

  /** Nós de consumo dos lotes ativos de um jogador (id negativo: `-(célula + 1)`). */
  powerNodes(slot: Slot): PowerNode[] {
    const W = this.host.map.width;
    const out: PowerNode[] = [];
    for (const [i, l] of this.lots)
      if (l.owner === slot && !l.abandoned) out.push({ id: -(i + 1), type: 'house', cx: i % W, cy: Math.floor(i / W), size: 1, gen: 0, use: ZONING.lotPower * l.level });
    return out;
  }

  setLit(powered: Iterable<number>, slot: Slot): void {
    for (const [i, l] of this.lots) if (l.owner === slot) this.litLots.delete(i);
    for (const id of powered) if (id < 0) this.litLots.add(-id - 1);
  }

  isLit(i: number): boolean {
    return !this.host.powerOn || this.litLots.has(i);
  }

  // ------------------------------------------------------------ cidades e crescimento

  /** Sede (QG ou prefeitura) da cidade a que a célula pertence. */
  private seatOf(slot: Slot, i: number): Building | null {
    const W = this.host.map.width;
    return citySeat(this.host.buildings, slot, 'house' as BuildingType, { cx: i % W, cy: Math.floor(i / W) });
  }

  cityStats(slot: Slot): CityZoneStats[] {
    return this.stats[slot] ?? [];
  }

  /** Moradia dos lotes residenciais privados ativos (casa 1, prédio 5): entra no teto de população. */
  privateHousing(slot: Slot): number {
    let n = 0;
    for (const l of this.lots.values()) if (l.owner === slot && l.kind === 'res' && !l.abandoned) n += ZONING.citizens[l.level - 1]!;
    return n;
  }

  /** Imposto pagos por dia (para o caixa): unidades ativas por setor (prédio conta como 3 casas). */
  taxBase(slot: Slot): Record<ZoneKind, number> {
    const out = { res: 0, com: 0, ind: 0 };
    for (const l of this.lots.values()) if (l.owner === slot && !l.abandoned) out[l.kind] += l.kind === 'res' && l.level === 2 ? 3 : 1;
    return out;
  }

  step(): void {
    const h = this.host;
    // os ataques esquecem aos poucos
    const decay = Math.pow(0.5, 1 / ZONING.heatHalfLifeTicks);
    for (let s = 0; s < this.heat.length; s++) this.heat[s] = (this.heat[s] ?? 0) * decay;
    // zonas e lotes fora do território do dono somem (fronteira perdida)
    if (h.tick % TICK_RATE === 0) {
      for (const [i, z] of this.zones)
        if (h.territory[i] !== z.owner && !this.cover.has(i)) {
          this.zones.delete(i);
          this.version++;
        }
      for (const [i, l] of this.lots)
        if (h.territory[i] !== l.owner) {
          if (l.kind === 'res' && !l.abandoned) h.moveCitizens(l.owner, -ZONING.citizens[l.level - 1]!);
          this.removeLot(i);
          this.zones.delete(i);
          this.version++;
        }
    }
    if (h.tick % ZONING.everyTicks !== 0) return;
    for (let slot = 0; slot < h.playerCount; slot++) this.evaluate(slot);
  }

  /**
   * Avalia as cidades do jogador: atratividade de cada setor, crescimento, prédios e abandono.
   *
   * Atratividade (−1..1) por cidade: começa negativa numa cidade sem atrativos e sobe com o desenvolvimento (serviços,
   * empregos, construções do governo, era) e com a economia do país; cai com imposto alto, governo autoritário e
   * ataques. O crescimento não tem ritmo fixo: cada setor acumula "procura" proporcional à atratividade (ao quadrado,
   * então uma cidade pouco atraente quase não cresce) e um lote surge quando a procura enche; com atratividade baixa,
   * leva muitos minutos; numa cidade desenvolvida, segundos.
   */
  private evaluate(slot: Slot): void {
    const h = this.host;
    const W = h.map.width;
    const seats = h.buildings.filter((b) => b.owner === slot && b.hp > 0 && (b.type === 'hq' || b.type === 'city_hall'));
    if (!seats.length) {
      this.stats[slot] = [];
      return;
    }
    const tax = this.taxOf(slot);
    const heat = clamp((this.heat[slot] ?? 0) / 4, 0, 1);
    const auth = clamp(h.authoritarian(slot), 0, 1);
    const econ = clamp((h.approval(slot) - 45) / 40, -1, 1) * 0.15 + clamp(h.growth(slot) / 6, -0.5, 0.5) * 0.2;
    const eraBonus = (clamp(h.era(slot), 1, 4) - 1) * 0.08;
    // números de cada cidade
    type CityAcc = { seat: Building; free: Record<ZoneKind, number[]>; lots: [number, Lot][]; jobs: number; gov: number; housing: number; services: CityZoneStats['services'] };
    const by = new Map<number, CityAcc>();
    for (const s of seats) by.set(s.id, { seat: s, free: { res: [], com: [], ind: [] }, lots: [], jobs: 0, gov: 0, housing: 0, services: { police: false, school: false, hospital: false } });
    for (const b of h.buildings) {
      if (b.owner !== slot || b.hp <= 0 || b.progress < 1) continue;
      const seat = citySeat(seats, slot, b.type, b.cell);
      const c = seat && by.get(seat.id);
      if (!c) continue;
      c.jobs += h.workersIn(b);
      c.gov++;
      c.housing += h.housingOf(b);
      if (b.type === 'police_station') c.services.police = true;
      if (b.type === 'school' || b.type === 'university') c.services.school = true;
      if (b.type === 'hospital') c.services.hospital = true;
    }
    for (const [i, z] of this.zones) {
      if (z.owner !== slot) continue;
      const seat = this.seatOf(slot, i);
      const c = seat && by.get(seat.id);
      if (!c) continue;
      const front = this.cover.get(i);
      if (front !== undefined) {
        const lot = this.lots.get(front);
        if (front === i && lot) c.lots.push([i, lot]);
      } else if (h.grid.occupant(i % W, Math.floor(i / W)) === 0) c.free[z.kind].push(i);
    }
    let popRoom = h.popRoom(slot);
    const ownRoads = new Set(h.roads.filter((r) => r.owner === slot).map((r) => r.i));
    const stats: CityZoneStats[] = [];
    const acc = (this.growth[slot] ??= {});
    for (const c of by.values()) {
      // moradores da cidade: metade da capacidade das moradias do governo (nem toda vaga está ocupada) e as
      // casas/prédios privados
      let residents = Math.round(c.housing / 2);
      let jobs = c.jobs;
      const count = { res: 0, com: 0, ind: 0 };
      let abandoned = 0;
      let dark = 0;
      let resLots = 0;
      for (const [i, l] of c.lots) {
        if (l.abandoned) {
          abandoned++;
          continue;
        }
        count[l.kind]++;
        if (l.kind === 'res') {
          residents += ZONING.residents[l.level - 1]!;
          resLots++;
          if (!this.isLit(i)) dark++;
        } else jobs += ZONING.jobs[l.kind];
      }
      const services = (c.services.police ? 1 : 0) + (c.services.school ? 1 : 0) + (c.services.hospital ? 1 : 0);
      // desenvolvimento da cidade (0..1): serviços, empregos, construções do governo e era
      const dev = clamp((services / 3) * 0.35 + clamp(jobs / 90, 0, 1) * 0.3 + clamp(c.gov / 25, 0, 1) * 0.2 + eraBonus, 0, 1);
      const darkRatio = resLots ? dark / resLots : 0;
      const taxPen = (k: ZoneKind) => (tax[k] - 10) / 20;
      const unemployed = residents > 0 ? clamp((residents - jobs) / residents, 0, 1) : 0;
      const demand: Record<ZoneKind, number> = {
        ind: clamp(-0.3 + 0.6 * dev + econ - taxPen('ind') - 0.5 * heat - 0.4 * auth, -1, 1),
        res: clamp(-0.3 + 0.5 * dev + 0.3 * clamp((jobs - residents) / Math.max(10, residents), -1, 1) + econ - taxPen('res') - 0.4 * heat - 0.3 * auth - 0.5 * darkRatio, -1, 1),
        com: clamp(-0.35 + 0.4 * dev + 0.3 * clamp(residents / 50, 0, 1) + 0.2 * clamp(count.ind / 6, 0, 1) + econ - taxPen('com') - 0.4 * heat - 0.3 * auth, -1, 1),
      };
      const zoned = { res: 0, com: 0, ind: 0 };
      for (const k of ZONE_KINDS) zoned[k] = c.free[k].length;
      for (const [, l] of c.lots) zoned[l.kind]++;
      stats.push({ seat: c.seat.id, name: h.cityName(c.seat) ?? (c.seat.type === 'hq' ? 'Capital' : 'Cidade'), residents, jobs, lots: count, abandoned, zoned, services: c.services, demand, development: Math.round(dev * 100) / 100 });

      // --- abandono: imposto alto, governo autoritário, ataques, sem luz (casas), sem emprego (casas), demanda negativa
      for (const [i, l] of c.lots) {
        if (l.abandoned) continue;
        let risk = Math.max(0, -demand[l.kind]) * 0.6 + Math.max(0, (tax[l.kind] - 18) / 12) + 0.5 * heat + 0.4 * auth;
        if (l.kind === 'res') {
          if (!this.isLit(i)) risk += 0.6;
          if (unemployed > 0.3) risk += 0.5 * unemployed;
        }
        if (risk > 0 && lotRandom(h.tick, i, 1) < Math.min(0.3, risk * ZONING.abandonChance)) {
          l.abandoned = true;
          l.since = h.tick;
          this.litLots.delete(i);
          if (l.kind === 'res') h.moveCitizens(slot, -ZONING.citizens[l.level - 1]!);
          this.version++;
        }
      }
      // --- crescimento: a procura de cada setor acumula conforme a atratividade; o lote surge quando ela enche
      const g = (acc[c.seat.id] ??= { res: 0, com: 0, ind: 0 });
      for (const k of ZONE_KINDS) {
        const d = demand[k];
        if (d <= 0 || !c.free[k].length) {
          g[k] = Math.max(0, g[k] - 0.02);
          continue;
        }
        g[k] += d * d * ZONING.growthPerSecond * (ZONING.everyTicks / TICK_RATE) * (0.6 + 0.8 * lotRandom(h.tick, c.seat.id & 0xffff, 30 + ZONE_KINDS.indexOf(k)));
        if (g[k] < 1) continue;
        // o lote nasce encostado na rua: só células da zona coladas a uma estrada própria
        const fronts = c.free[k].filter((x) => this.roadSide(x, ownRoads) >= 0);
        if (!fronts.length) continue;
        const i = fronts[Math.floor(lotRandom(h.tick, fronts.length, 20) * fronts.length)]!;
        const pick = c.free[k].indexOf(i);
        if (h.unitOn(i)) continue;
        const face = this.roadSide(i, ownRoads);
        // lote fundo: a célula de trás da mesma zona, livre, vira parte do mesmo lote (construção mais comprida)
        const b = this.behind(i, face);
        const bz = b >= 0 ? this.zones.get(b) : undefined;
        const deep = b >= 0 && bz?.owner === slot && bz.kind === k && !this.cover.has(b) && h.grid.occupant(b % W, Math.floor(b / W)) === 0 && !h.unitOn(b) && this.roadSide(b, ownRoads) < 0;
        // prédio privado: raro, só com muita procura e cidade grande
        const level: 1 | 2 = k === 'res' && d > 0.65 && residents >= 30 && lotRandom(h.tick, i, 3) < ZONING.apartmentChance ? 2 : 1;
        const people = k === 'res' ? ZONING.citizens[level - 1]! : 0;
        if (people > popRoom) continue; // teto nacional de população
        c.free[k].splice(pick, 1);
        if (deep) c.free[k].splice(c.free[k].indexOf(b), 1);
        g[k] -= 1;
        this.placeLot(i, { owner: slot, kind: k, variant: Math.floor(lotRandom(h.tick, i, 4) * ZONING.variants), level, abandoned: false, since: h.tick, face, ...(deep ? { back: b } : {}) });
        if (people) {
          h.moveCitizens(slot, people);
          popRoom -= people;
        }
        this.version++;
      }
      // casa vira prédio (raro)
      if (demand.res > 0.75 && residents >= 30 && popRoom >= ZONING.citizens[1]! - ZONING.citizens[0]!) {
        const house = c.lots.find(([i, l]) => l.kind === 'res' && l.level === 1 && !l.abandoned && lotRandom(h.tick, i, 5) < 0.03);
        if (house) {
          house[1].level = 2;
          h.moveCitizens(slot, ZONING.citizens[1]! - ZONING.citizens[0]!);
          popRoom -= ZONING.citizens[1]! - ZONING.citizens[0]!;
          this.version++;
        }
      }
    }
    this.stats[slot] = stats;
  }

  // ------------------------------------------------------------ visão e salvamento

  /** Lotes que o jogador enxerga: os próprios e os alheios em célula à vista. */
  visibleLots(viewer: Slot): [number, Lot][] {
    const W = this.host.map.width;
    const cs = this.host.cellSize;
    const out: [number, Lot][] = [];
    for (const [i, l] of this.lots) if (l.owner === viewer || this.host.isVisibleTo(viewer, { x: ((i % W) + 0.5) * cs, y: (Math.floor(i / W) + 0.5) * cs })) out.push([i, l]);
    return out;
  }

  ownZones(viewer: Slot): [number, ZoneKind][] {
    const out: [number, ZoneKind][] = [];
    for (const [i, z] of this.zones) if (z.owner === viewer) out.push([i, z.kind]);
    return out;
  }

  toSave(): ZoneSave {
    return {
      zones: [...this.zones].map(([i, z]) => [i, z.owner, z.kind]),
      lots: [...this.lots].map(([i, l]) => [i, { ...l }]),
      tax: this.tax.map((t) => ({ ...t })),
      heat: [...this.heat],
      growth: this.growth.map((g) => JSON.parse(JSON.stringify(g ?? {})) as Record<number, Record<ZoneKind, number>>),
    };
  }

  load(s: ZoneSave | undefined): void {
    this.zones.clear();
    this.lots.clear();
    this.cover.clear();
    if (!s) return;
    for (const [i, owner, kind] of s.zones) this.zones.set(i, { owner, kind });
    for (const [i, l] of s.lots) this.placeLot(i, { ...l });
    this.tax = s.tax.map((t) => ({ ...t }));
    this.heat = [...s.heat];
    this.growth = (s.growth ?? []).map((g) => JSON.parse(JSON.stringify(g ?? {})) as Record<number, Record<ZoneKind, number>>);
    this.version++;
  }
}
