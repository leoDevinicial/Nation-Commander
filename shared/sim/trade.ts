import { BUILDINGS, HIGHWAY, ROAD, TICK_RATE, Terrain, UNITS, type BuildingType } from './config.ts';
import { TICKS_PER_DAY } from '../strategic/params.ts';
import { findPath } from './pathfinding/AStar.ts';
import type { Simulation } from './Simulation.ts';
import type { Building, Cell, EntityId, Slot, Vec2 } from './types.ts';

/**
 * Comércio (02/11, refeito a pedido do usuário). Tudo passa pelo caixa do país (sem dívida) e nada é instantâneo:
 *
 * - **Entre nações da partida:** o vendedor publica um anúncio no Terminal Comercial.
 *   - *Venda simples:* "X de um recurso por US$ Y". A mercadoria fica reservada até alguém comprar (ou o anúncio sair).
 *   - *Contrato:* "X de cada recurso a cada N dias, por US$ Z ao mês", até uma das partes encerrar ou cair por força
 *     maior (o fornecedor não tem o estoque na data, o comprador não tem caixa para a entrega, guerra ou sanções).
 * - **Rotas:** o comprador escolhe como a carga vai — caminhão pelas estradas e rodovias (Terminal Comercial dos dois
 *   lados, ligados por uma via contínua), navio pela água (Porto dos dois lados, ligados pela água) ou avião (Base Aérea
 *   ou heliponto do QG nível 4 dos dois lados, em linha reta).
 * - **Mercado mundial:** países de fora da partida compram e vendem direto, com preço pior que o de um vizinho e volume
 *   limitado por dia; a carga entra ou sai pela borda do mapa.
 * - **Entrega e pagamento:** o dinheiro só entra para o vendedor e a mercadoria só entra para o comprador quando a carga
 *   chega ao destino. No caminho, tropas, torres e antiaérea de quem está em guerra com qualquer uma das partes destroem
 *   o veículo.
 */

export type TradeResource = 'food' | 'wood' | 'stone' | 'iron' | 'oil' | 'coal';
export const TRADE_RESOURCES: TradeResource[] = ['food', 'wood', 'stone', 'iron', 'oil', 'coal'];
export type TransportMode = 'road' | 'sea' | 'air';
export const TRANSPORT_MODES: TransportMode[] = ['road', 'sea', 'air'];

/** Lado "mercado mundial" (países de fora da partida). */
export const WORLD = 999;
export const isWorld = (id: number) => id === WORLD;

/** Preço de referência por unidade (US$), o mesmo do extrato da produção (`TREASURY.price`). */
export const REF_PRICE: Record<TradeResource, number> = {
  food: 4_500,
  wood: 4_500,
  stone: 4_500,
  iron: 8_000,
  oil: 10_000,
  coal: 6_000,
};

export interface TransportDef {
  label: string;
  /** Carga de um veículo (unidades somadas de todos os recursos). */
  capacity: number;
  /** Velocidade no mapa (unidades de mundo por segundo). */
  speed: number;
  /** Trecho fora do mapa no mercado mundial (segundos de jogo). */
  offmapSeconds: number;
  /** O que cada lado precisa ter. */
  needs: string;
  risk: string;
}

export const TRANSPORT: Record<TransportMode, TransportDef> = {
  road: {
    label: 'Caminhão',
    capacity: 150,
    speed: 4,
    offmapSeconds: 20,
    needs: 'Terminal Comercial ligado por estrada ou rodovia',
    risk: 'Tropas e torres de quem está em guerra com uma das partes destroem o comboio. Rodovia: o dobro da velocidade.',
  },
  sea: {
    label: 'Navio',
    capacity: 600,
    speed: 3,
    offmapSeconds: 30,
    needs: 'Porto dos dois lados, ligados pela água',
    risk: 'Grande volume e lento; tropas e torres inimigas na margem afundam o navio.',
  },
  air: {
    label: 'Avião cargueiro',
    capacity: 50,
    speed: 12,
    offmapSeconds: 8,
    needs: 'Base Aérea ou Centro de Comando nível 4 (heliponto) dos dois lados',
    risk: 'Rápido e pequeno; antiaérea e caças inimigos derrubam o avião.',
  },
};
/** Nível mínimo do QG para servir de aeroporto de carga. */
export const AIR_HQ_LEVEL = 4;

/** Regras gerais. */
export const TRADE = {
  /** Anúncio aberto por até (dias = segundos). */
  listingDays: 240,
  /** Anúncios abertos por jogador. */
  maxListings: 4,
  /** Até 3 recursos por anúncio; quantidade máxima de cada um. */
  maxItems: 3,
  maxQuantity: 2000,
  /** Contrato: intervalo entre entregas (dias). */
  minEveryDays: 20,
  maxEveryDays: 180,
  /** Preço aceito (por unidade, sobre a referência): evita anúncios absurdos. */
  minPriceMul: 0.2,
  maxPriceMul: 5,
  /** Veículos em trânsito ao mesmo tempo, por instalação do modal. */
  vehiclesPerFacility: 2,
  /** Carregamento no terminal (s). */
  loadSeconds: 3,
  /** Raio (mundo) em que tropas e torres inimigas atacam caminhão ou navio; antiaérea, o avião. */
  ambushRange: 5,
  airDefenseRange: 9,
  /** Segundos de exposição contínua até o veículo ser destruído. */
  exposureSeconds: 1.5,
  /** Contrato sem rota por mais que isto (dias) cai por força maior. */
  noRouteDays: 30,
  /** Mercado mundial: compra a 1,6× a referência, vende a 0,8×; até 300 unidades de cada recurso por dia e jogador. */
  worldBuyMul: 1.6,
  worldSellMul: 0.8,
  worldDailyUnits: 300,
} as const;

export interface TradeItem {
  resource: TradeResource;
  quantity: number;
}

export type ListingKind = 'sale' | 'contract';
export type ListingStatus = 'open' | 'sold' | 'withdrawn' | 'expired';

export interface TradeListing {
  id: number;
  seller: Slot;
  kind: ListingKind;
  items: TradeItem[];
  /** Venda: preço total. Contrato: preço por mês (30 dias). */
  priceUsd: number;
  /** Contrato: dias entre entregas. */
  everyDays: number;
  createdTick: number;
  expiresTick: number;
  status: ListingStatus;
  buyer: Slot | null;
}

export type ContractStatus = 'active' | 'ended';

export interface TradeContract {
  id: number;
  listingId: number;
  seller: Slot;
  buyer: Slot;
  items: TradeItem[];
  everyDays: number;
  monthlyUsd: number;
  mode: TransportMode;
  startTick: number;
  /** Próxima entrega a despachar. */
  nextTick: number;
  /** Desde quando está sem rota (null = com rota). */
  noRouteSince: number | null;
  status: ContractStatus;
  reason: string | null;
  deliveries: number;
  paidUsd: number;
  lost: number;
  log: { tick: number; text: string }[];
}

export type ShipmentState = 'queued' | 'loading' | 'moving' | 'offmap' | 'waiting_capacity' | 'delivered' | 'lost';

export interface Shipment {
  id: number;
  listingId: number | null;
  contractId: number | null;
  /** Jogador ou `WORLD`. */
  seller: number;
  buyer: number;
  items: TradeItem[];
  /** O que o comprador paga ao vendedor na entrega (proporcional ao que couber no depósito). */
  payUsd: number;
  /** Total de unidades na partida (para a proporção do pagamento). */
  units: number;
  mode: TransportMode;
  path: Vec2[];
  pathLength: number;
  travelled: number;
  /** Trechos: mapa e, no mercado mundial, fora do mapa (antes na compra, depois na venda). */
  legs: ('map' | 'offmap')[];
  leg: number;
  state: ShipmentState;
  timer: number;
  etaTicks: number;
  startTick: number;
  /** Instalação de destino (comprador jogador). */
  destId: EntityId | null;
  /** Instalação de origem (vendedor jogador). */
  fromId: EntityId | null;
  /** Ticks seguidos sob fogo. */
  exposure: number;
  reason: string | null;
}

export interface TradeSave {
  nextId: number;
  listings: TradeListing[];
  contracts: TradeContract[];
  shipments: Shipment[];
  worldUsed: Record<number, Partial<Record<TradeResource, number>>>;
  worldDay: number;
}

/** Ligação com a camada nacional: diplomacia e caixa. */
export interface TradeLink {
  atWar(a: Slot, b: Slot): boolean;
  /** Sanções em vigor em qualquer sentido. */
  sanctioned(a: Slot, b: Slot): boolean;
  /** Dinheiro livre no caixa agora (saldo menos compras do dia ainda não fechadas). */
  spendable(slot: Slot): number;
  /** Lançamento no caixa: `export` = venda recebida, `import` = compra paga (negativo). */
  pay(slot: Slot, usd: number, kind: 'export' | 'import'): void;
  partnerName(id: Slot): string;
}

export interface ListingInput {
  kind: ListingKind;
  items: TradeItem[];
  priceUsd: number;
  everyDays?: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const unitsOf = (items: readonly TradeItem[]) => items.reduce((a, i) => a + i.quantity, 0);
export const refValue = (items: readonly TradeItem[]) => items.reduce((a, i) => a + REF_PRICE[i.resource] * i.quantity, 0);

export class TradeSystem {
  nextId = 1;
  listings: TradeListing[] = [];
  contracts: TradeContract[] = [];
  shipments: Shipment[] = [];
  /** Mercado mundial: unidades negociadas hoje por jogador e recurso. */
  worldUsed: Record<number, Partial<Record<TradeResource, number>>> = {};
  worldDay = 0;
  link: TradeLink | null = null;
  /** Rotas calculadas há pouco (a busca roda no máximo a cada 2 s por par e modal). */
  private routeCache = new Map<string, { tick: number; route: Route | string }>();

  constructor(private readonly sim: Simulation) {}

  // -------------------------------------------------------------- salvar/carregar

  toSave(): TradeSave {
    return JSON.parse(
      JSON.stringify({
        nextId: this.nextId,
        listings: this.listings,
        contracts: this.contracts,
        shipments: this.shipments,
        worldUsed: this.worldUsed,
        worldDay: this.worldDay,
      }),
    ) as TradeSave;
  }

  load(s: TradeSave | undefined): void {
    if (!s) return;
    const c = JSON.parse(JSON.stringify(s)) as Partial<TradeSave>;
    // salvamentos de antes de 02/11 (ofertas e contratos com países de fora) não são aproveitados
    this.nextId = c.nextId ?? 1;
    this.listings = c.listings ?? [];
    this.contracts = (c.contracts ?? []).filter((x) => Array.isArray(x.items));
    this.shipments = (c.shipments ?? []).filter((x) => Array.isArray(x.items));
    this.worldUsed = c.worldUsed ?? {};
    this.worldDay = c.worldDay ?? 0;
    this.routeCache.clear();
  }

  // -------------------------------------------------------------- consultas

  private get day(): number {
    return Math.floor(this.sim.tick / DAY_TICKS);
  }

  name(id: number): string {
    if (isWorld(id)) return 'Mercado mundial';
    return this.link?.partnerName(id) ?? `Jogador ${id + 1}`;
  }

  /** Instalações concluídas de um tipo. */
  private facilities(slot: Slot, type: BuildingType): Building[] {
    return this.sim.buildings.filter((b) => b.owner === slot && b.type === type && b.progress >= 1 && b.hp > 0);
  }

  /** Aeroportos de carga: bases aéreas e o heliponto do QG (nível 4+). */
  private airports(slot: Slot): Building[] {
    const list = this.facilities(slot, 'airbase');
    const hq = this.sim.hqOf(slot);
    if (hq && hq.progress >= 1 && hq.hp > 0 && hq.level >= AIR_HQ_LEVEL) list.push(hq);
    return list;
  }

  /** Terminais do modal de um jogador. */
  terminals(slot: Slot, mode: TransportMode): Building[] {
    if (mode === 'air') return this.airports(slot);
    return this.facilities(slot, mode === 'sea' ? 'port' : 'market');
  }

  /** O jogador pode negociar por este modal? (motivo, ou null). O Terminal Comercial é a bolsa: sem ele, nada. */
  modeBlocker(slot: Slot, mode: TransportMode): string | null {
    if (this.facilities(slot, 'market').length === 0) return 'Construa um Terminal Comercial para negociar';
    if (mode === 'air' && !this.airports(slot).length) return `Avião: construa uma Base Aérea ou melhore o Centro de Comando até o nível ${AIR_HQ_LEVEL} (heliponto de carga)`;
    if (mode === 'sea' && !this.facilities(slot, 'port').length) return 'Navio: construa um Porto na margem da água';
    return null;
  }

  /** Veículos em trânsito ao mesmo tempo num modal (instalações × 2; no aéreo, mais um por cargueiro pronto). */
  convoyLimit(slot: Slot, mode: TransportMode): number {
    const base = this.terminals(slot, mode).length * TRADE.vehiclesPerFacility;
    return mode === 'air' ? base + this.sim.air.transports(slot) : base;
  }

  private activeVehicles(slot: Slot, mode: TransportMode): number {
    let n = 0;
    for (const s of this.shipments) if (s.mode === mode && (s.seller === slot || s.buyer === slot) && (s.state === 'loading' || s.state === 'moving' || s.state === 'offmap')) n++;
    return n;
  }

  /** Estoque que pode sair numa venda (petróleo só dos tanques). */
  sellable(slot: Slot, r: TradeResource): number {
    const p = this.sim.players[slot];
    if (!p) return 0;
    if (r === 'oil') return this.facilities(slot, 'oil_tank').reduce((a, t) => a + t.stored, 0);
    return Math.max(0, p.resources[r]);
  }

  freeCapacity(slot: Slot, r: TradeResource): number {
    const p = this.sim.players[slot];
    if (!p) return 0;
    return Math.max(0, this.sim.capacity(slot)[r] - p.resources[r]);
  }

  /** Diplomacia permite negociar? */
  accessBlocker(a: Slot, b: Slot): string | null {
    if (a === b) return 'Você não pode comprar o próprio anúncio';
    if (!this.link) return 'Comércio indisponível nesta partida';
    if (this.sim.players[b]?.defeated || this.sim.players[a]?.defeated) return 'Nação derrotada';
    if (this.link.atWar(a, b) || this.sim.hostile(a, b)) return `Em guerra com ${this.name(b)}`;
    if (this.link.sanctioned(a, b)) return `Sanções em vigor com ${this.name(b)}`;
    return null;
  }

  private spendable(slot: Slot): number {
    return this.link ? this.link.spendable(slot) : Infinity;
  }

  /** Mercado mundial: preço por unidade (compra e venda) e o que ainda cabe hoje. */
  worldQuote(slot: Slot, r: TradeResource): { buy: number; sell: number; left: number } {
    const used = this.worldDay === this.day ? (this.worldUsed[slot]?.[r] ?? 0) : 0;
    return {
      buy: Math.round(REF_PRICE[r] * TRADE.worldBuyMul),
      sell: Math.round(REF_PRICE[r] * TRADE.worldSellMul),
      left: Math.max(0, TRADE.worldDailyUnits - used),
    };
  }

  // -------------------------------------------------------------- anúncios

  /** Validação de um anúncio (mesmo texto no servidor e no painel). */
  listingBlocker(seller: Slot, o: ListingInput): string | null {
    if (o.kind !== 'sale' && o.kind !== 'contract') return 'Tipo de anúncio inválido';
    if (!this.link) return 'Comércio indisponível nesta partida';
    if (this.facilities(seller, 'market').length === 0) return 'Construa um Terminal Comercial para anunciar';
    if (!o.items.length || o.items.length > TRADE.maxItems) return `De 1 a ${TRADE.maxItems} recursos por anúncio`;
    if (o.kind === 'sale' && o.items.length !== 1) return 'A venda simples tem um recurso só';
    const seen = new Set<TradeResource>();
    for (const it of o.items) {
      if (!TRADE_RESOURCES.includes(it.resource) || seen.has(it.resource)) return 'Recurso inválido';
      seen.add(it.resource);
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > TRADE.maxQuantity) return `Quantidade entre 1 e ${TRADE.maxQuantity}`;
    }
    const days = o.kind === 'contract' ? (o.everyDays ?? 0) : 30;
    if (o.kind === 'contract' && (!Number.isInteger(days) || days < TRADE.minEveryDays || days > TRADE.maxEveryDays)) return `Entrega a cada ${TRADE.minEveryDays} a ${TRADE.maxEveryDays} dias`;
    // preço comparado à referência (no contrato, o valor de uma entrega)
    const ref = refValue(o.items);
    const perDelivery = o.kind === 'contract' ? (o.priceUsd * days) / 30 : o.priceUsd;
    if (!(o.priceUsd > 0) || perDelivery < ref * TRADE.minPriceMul || perDelivery > ref * TRADE.maxPriceMul)
      return `Preço fora do aceito: entre ${fmtUsd(ref * TRADE.minPriceMul)} e ${fmtUsd(ref * TRADE.maxPriceMul)} por entrega`;
    if (this.listings.filter((l) => l.seller === seller && l.status === 'open').length >= TRADE.maxListings) return `Até ${TRADE.maxListings} anúncios abertos`;
    if (o.kind === 'sale') {
      const it = o.items[0]!;
      const have = this.sellable(seller, it.resource);
      if (have + 1e-6 < it.quantity) return `Estoque insuficiente: ${Math.floor(have)} de ${it.quantity}${it.resource === 'oil' ? ' (o petróleo sai dos tanques)' : ''}`;
    }
    return null;
  }

  /** Publica um anúncio. Na venda simples, a mercadoria já fica reservada (sai do estoque). */
  list(seller: Slot, o: ListingInput): string | null {
    const err = this.listingBlocker(seller, o);
    if (err) return err;
    const l: TradeListing = {
      id: this.nextId++,
      seller,
      kind: o.kind,
      items: o.items.map((i) => ({
        resource: i.resource,
        quantity: i.quantity,
      })),
      priceUsd: Math.round(o.priceUsd),
      everyDays: o.kind === 'contract' ? o.everyDays! : 0,
      createdTick: this.sim.tick,
      expiresTick: this.sim.tick + TRADE.listingDays * DAY_TICKS,
      status: 'open',
      buyer: null,
    };
    if (l.kind === 'sale') for (const it of l.items) this.sim.takeForTrade(seller, it.resource, it.quantity);
    this.listings.push(l);
    this.sim.emitTrade({
      type: 'trade_listed',
      tick: this.sim.tick,
      listingId: l.id,
      seller,
      kind: l.kind,
    });
    return null;
  }

  withdraw(slot: Slot, listingId: number): string | null {
    const l = this.listings.find((x) => x.id === listingId);
    if (!l || l.seller !== slot || l.status !== 'open') return 'Anúncio indisponível';
    this.closeListing(l, 'withdrawn');
    return null;
  }

  private closeListing(l: TradeListing, status: ListingStatus): void {
    l.status = status;
    // reserva da venda volta ao estoque (o que couber)
    if (l.kind === 'sale' && status !== 'sold') for (const it of l.items) this.sim.storeFromTrade(l.seller, it.resource, it.quantity);
  }

  /** O que impede `buyer` de comprar o anúncio por `mode` agora (texto do painel e do servidor). */
  buyBlocker(buyer: Slot, l: TradeListing, mode: TransportMode): string | null {
    if (l.status !== 'open') return 'Anúncio encerrado';
    if (!TRANSPORT_MODES.includes(mode)) return 'Transporte inválido';
    const access = this.accessBlocker(buyer, l.seller);
    if (access) return access;
    const mb = this.modeBlocker(buyer, mode);
    if (mb) return mb;
    if (this.modeBlocker(l.seller, mode)) return `${this.name(l.seller)} não despacha por ${TRANSPORT[mode].label.toLowerCase()}`;
    const route = this.route(l.seller, buyer, mode);
    if (typeof route === 'string') return route;
    const pay = l.kind === 'sale' ? l.priceUsd : this.perDelivery(l.priceUsd, l.everyDays);
    if (this.spendable(buyer) + 1e-6 < pay) return `Caixa insuficiente: ${fmtUsd(pay)} ${l.kind === 'sale' ? 'na entrega' : 'por entrega'}`;
    return null;
  }

  /** Compra um anúncio: venda simples despacha já; contrato começa com a primeira entrega. */
  buy(buyer: Slot, listingId: number, mode: TransportMode): string | null {
    const l = this.listings.find((x) => x.id === listingId);
    if (!l) return 'Anúncio indisponível';
    const err = this.buyBlocker(buyer, l, mode);
    if (err) return err;
    l.status = 'sold';
    l.buyer = buyer;
    if (l.kind === 'sale') {
      this.ship({
        seller: l.seller,
        buyer,
        items: l.items,
        payUsd: l.priceUsd,
        mode,
        listingId: l.id,
        contractId: null,
      });
      this.sim.emitTrade({
        type: 'trade_sold',
        tick: this.sim.tick,
        listingId: l.id,
        seller: l.seller,
        buyer,
        kind: 'sale',
      });
      return null;
    }
    const c: TradeContract = {
      id: this.nextId++,
      listingId: l.id,
      seller: l.seller,
      buyer,
      items: l.items.map((i) => ({ ...i })),
      everyDays: l.everyDays,
      monthlyUsd: l.priceUsd,
      mode,
      startTick: this.sim.tick,
      nextTick: this.sim.tick,
      noRouteSince: null,
      status: 'active',
      reason: null,
      deliveries: 0,
      paidUsd: 0,
      lost: 0,
      log: [],
    };
    this.note(c, `Contrato fechado: ${itemsText(c.items)} a cada ${c.everyDays} dias por ${fmtUsd(c.monthlyUsd)}/mês (${TRANSPORT[mode].label.toLowerCase()})`);
    this.contracts.push(c);
    this.sim.emitTrade({
      type: 'trade_sold',
      tick: this.sim.tick,
      listingId: l.id,
      seller: l.seller,
      buyer,
      kind: 'contract',
    });
    this.contractStep(c);
    return null;
  }

  /** Valor de uma entrega do contrato (mensalidade proporcional ao intervalo). */
  perDelivery(monthlyUsd: number, everyDays: number): number {
    return Math.round((monthlyUsd * everyDays) / 30);
  }

  cancel(slot: Slot, contractId: number): string | null {
    const c = this.contracts.find((x) => x.id === contractId);
    if (!c || (c.seller !== slot && c.buyer !== slot)) return 'Contrato inválido';
    if (c.status !== 'active') return 'Contrato já encerrado';
    this.endContract(c, `Encerrado por ${this.name(slot)}`);
    return null;
  }

  // -------------------------------------------------------------- mercado mundial

  worldBlocker(slot: Slot, side: 'buy' | 'sell', r: TradeResource, quantity: number, mode: TransportMode): string | null {
    if (!this.link) return 'Comércio indisponível nesta partida';
    if (!TRADE_RESOURCES.includes(r)) return 'Recurso inválido';
    if (!TRANSPORT_MODES.includes(mode)) return 'Transporte inválido';
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > TRADE.worldDailyUnits) return `Quantidade entre 1 e ${TRADE.worldDailyUnits}`;
    const mb = this.modeBlocker(slot, mode);
    if (mb) return mb;
    const q = this.worldQuote(slot, r);
    if (q.left < quantity) return `O mercado mundial só negocia mais ${q.left} de ${RES_LABEL[r]} com você hoje`;
    if (side === 'sell') {
      const have = this.sellable(slot, r);
      if (have + 1e-6 < quantity) return `Estoque insuficiente: ${Math.floor(have)} de ${quantity}`;
    } else if (this.spendable(slot) + 1e-6 < q.buy * quantity) return `Caixa insuficiente: ${fmtUsd(q.buy * quantity)}`;
    const route = this.worldRoute(slot, mode);
    if (typeof route === 'string') return route;
    return null;
  }

  world(slot: Slot, side: 'buy' | 'sell', r: TradeResource, quantity: number, mode: TransportMode): string | null {
    const err = this.worldBlocker(slot, side, r, quantity, mode);
    if (err) return err;
    if (this.worldDay !== this.day) {
      this.worldDay = this.day;
      this.worldUsed = {};
    }
    const used = (this.worldUsed[slot] ??= {});
    used[r] = (used[r] ?? 0) + quantity;
    const q = this.worldQuote(slot, r);
    const items = [{ resource: r, quantity }];
    if (side === 'sell') {
      this.sim.takeForTrade(slot, r, quantity);
      this.ship({
        seller: slot,
        buyer: WORLD,
        items,
        payUsd: q.sell * quantity,
        mode,
        listingId: null,
        contractId: null,
      });
    } else
      this.ship({
        seller: WORLD,
        buyer: slot,
        items,
        payUsd: q.buy * quantity,
        mode,
        listingId: null,
        contractId: null,
      });
    return null;
  }

  // -------------------------------------------------------------- passo

  step(): void {
    const tick = this.sim.tick;
    if (tick % DAY_TICKS === 0) this.daily();
    for (const s of this.shipments) this.moveShipment(s);
    if (tick % (DAY_TICKS * 10) === 0) {
      this.shipments = this.shipments.filter((s) => (s.state !== 'delivered' && s.state !== 'lost') || tick - s.startTick < DAY_TICKS * 60);
      this.listings = this.listings.filter((l) => l.status === 'open' || tick - l.createdTick < DAY_TICKS * 400);
    }
  }

  private daily(): void {
    const tick = this.sim.tick;
    for (const l of this.listings) {
      if (l.status !== 'open') continue;
      if (tick >= l.expiresTick) this.closeListing(l, 'expired');
      else if (this.sim.players[l.seller]?.defeated) this.closeListing(l, 'withdrawn');
    }
    for (const c of this.contracts) if (c.status === 'active') this.contractStep(c);
  }

  /** Diplomacia, prazo e despacho de um contrato. */
  private contractStep(c: TradeContract): void {
    const l = this.link;
    if (l && (l.atWar(c.seller, c.buyer) || this.sim.hostile(c.seller, c.buyer))) {
      this.interrupt(c, `Guerra entre ${this.name(c.seller)} e ${this.name(c.buyer)}`);
      return;
    }
    if (l?.sanctioned(c.seller, c.buyer)) {
      this.interrupt(c, `Sanções entre ${this.name(c.seller)} e ${this.name(c.buyer)}`);
      return;
    }
    if (this.sim.players[c.seller]?.defeated || this.sim.players[c.buyer]?.defeated) {
      this.endContract(c, 'Uma das nações foi derrotada');
      return;
    }
    if (this.sim.tick < c.nextTick) return;
    // força maior: o fornecedor não tem o estoque na data ou o comprador não tem caixa para a entrega
    for (const it of c.items) {
      if (this.sellable(c.seller, it.resource) + 1e-6 < it.quantity) {
        this.endContract(c, `${this.name(c.seller)} não tinha ${it.quantity} de ${RES_LABEL[it.resource]} para a entrega`);
        return;
      }
    }
    const pay = this.perDelivery(c.monthlyUsd, c.everyDays);
    if (this.spendable(c.buyer) + 1e-6 < pay) {
      this.endContract(c, `${this.name(c.buyer)} sem caixa para pagar a entrega (${fmtUsd(pay)})`);
      return;
    }
    const route = this.route(c.seller, c.buyer, c.mode);
    if (typeof route === 'string') {
      c.noRouteSince ??= this.sim.tick;
      if (this.sim.tick - c.noRouteSince >= TRADE.noRouteDays * DAY_TICKS) this.endContract(c, `Sem rota por ${TRADE.noRouteDays} dias: ${route}`);
      else if (c.noRouteSince === this.sim.tick) this.note(c, `Sem rota: ${route} (tenta de novo a cada dia)`);
      return;
    }
    c.noRouteSince = null;
    for (const it of c.items) this.sim.takeForTrade(c.seller, it.resource, it.quantity);
    this.ship({
      seller: c.seller,
      buyer: c.buyer,
      items: c.items,
      payUsd: pay,
      mode: c.mode,
      listingId: c.listingId,
      contractId: c.id,
    });
    c.deliveries++;
    c.nextTick = this.sim.tick + c.everyDays * DAY_TICKS;
    this.note(c, `Entrega ${c.deliveries} despachada: ${itemsText(c.items)}`);
  }

  // -------------------------------------------------------------- despacho e rotas

  /** Cria os veículos de uma remessa (um por capacidade) na fila do terminal de origem. */
  private ship(o: { seller: number; buyer: number; items: TradeItem[]; payUsd: number; mode: TransportMode; listingId: number | null; contractId: number | null }): void {
    const cap = TRANSPORT[o.mode].capacity;
    const total = unitsOf(o.items);
    // divide a remessa em cargas do tamanho do veículo, recurso por recurso
    const loads: TradeItem[][] = [];
    let cur: TradeItem[] = [];
    let room = cap;
    for (const it of o.items) {
      let left = it.quantity;
      while (left > 0) {
        const take = Math.min(left, room);
        cur.push({ resource: it.resource, quantity: take });
        left -= take;
        room -= take;
        if (room <= 0) {
          loads.push(cur);
          cur = [];
          room = cap;
        }
      }
    }
    if (cur.length) loads.push(cur);
    for (const items of loads) {
      const units = unitsOf(items);
      const s: Shipment = {
        id: this.nextId++,
        listingId: o.listingId,
        contractId: o.contractId,
        seller: o.seller,
        buyer: o.buyer,
        items,
        payUsd: total > 0 ? Math.round((o.payUsd * units) / total) : 0,
        units,
        mode: o.mode,
        path: [],
        pathLength: 0,
        travelled: 0,
        legs: ['map'],
        leg: 0,
        state: 'queued',
        timer: 0,
        etaTicks: 0,
        startTick: this.sim.tick,
        destId: null,
        fromId: null,
        exposure: 0,
        reason: null,
      };
      this.shipments.push(s);
      this.depart(s);
    }
  }

  /** Sai da fila quando há veículo livre e rota; no mercado mundial, a compra começa fora do mapa. */
  private depart(s: Shipment): void {
    const shipper = isWorld(s.seller) ? s.buyer : s.seller;
    if (this.activeVehicles(shipper, s.mode) >= this.convoyLimit(shipper, s.mode)) {
      s.reason = 'Aguardando veículo livre no terminal';
      return;
    }
    const route = isWorld(s.seller) || isWorld(s.buyer) ? this.worldRoute(shipper, s.mode) : this.route(s.seller, s.buyer, s.mode);
    if (typeof route === 'string') {
      s.reason = route;
      return;
    }
    s.reason = null;
    const offmap = Math.round(TRANSPORT[s.mode].offmapSeconds * TICK_RATE);
    const load = Math.round(TRADE.loadSeconds * TICK_RATE);
    if (isWorld(s.seller)) {
      // compra no mercado mundial: vem de fora do mapa pela borda até o terminal
      s.path = [...route.path].reverse();
      s.legs = ['offmap', 'map'];
      s.state = 'offmap';
      s.timer = offmap;
      s.destId = route.fromId;
    } else {
      s.path = route.path;
      s.legs = isWorld(s.buyer) ? ['map', 'offmap'] : ['map'];
      s.state = 'loading';
      s.timer = load;
      s.fromId = route.fromId;
      s.destId = route.toId;
    }
    s.pathLength = polyLength(s.path);
    s.travelled = 0;
    s.leg = 0;
    s.startTick = this.sim.tick;
    s.etaTicks = (s.state === 'loading' ? load : 0) + Math.round((s.pathLength / TRANSPORT[s.mode].speed) * TICK_RATE) + (s.legs.includes('offmap') ? offmap : 0);
  }

  /** Rota entre dois jogadores por um modal (com cache curto), ou o motivo de não haver. */
  route(seller: Slot, buyer: Slot, mode: TransportMode): Route | string {
    const key = `${seller}:${buyer}:${mode}`;
    const hit = this.routeCache.get(key);
    if (hit && this.sim.tick - hit.tick < TICK_RATE * 2) return hit.route;
    const route = this.computeRoute(seller, buyer, mode);
    this.routeCache.set(key, { tick: this.sim.tick, route });
    return route;
  }

  private computeRoute(seller: Slot, buyer: Slot, mode: TransportMode): Route | string {
    const from = this.terminals(seller, mode);
    const to = this.terminals(buyer, mode);
    const what = mode === 'road' ? 'Terminal Comercial' : mode === 'sea' ? 'Porto' : 'aeroporto (Base Aérea ou QG nível 4)';
    if (!from.length) return `${this.name(seller)} sem ${what}`;
    if (!to.length) return `${this.name(buyer)} sem ${what}`;
    if (mode === 'air') {
      // o par de aeroportos mais próximo, em linha reta
      let best: [Building, Building] | null = null;
      for (const a of from) for (const b of to) if (!best || dist(a.pos, b.pos) < dist(best[0].pos, best[1].pos)) best = [a, b];
      return {
        path: [{ ...best![0].pos }, { ...best![1].pos }],
        fromId: best![0].id,
        toId: best![1].id,
      };
    }
    if (mode === 'sea') {
      for (const a of from)
        for (const b of to) {
          const path = this.waterPath(a, [b]);
          if (path)
            return {
              path: [{ ...a.pos }, ...path, { ...b.pos }],
              fromId: a.id,
              toId: b.id,
            };
        }
      return 'Sem ligação pela água entre os portos';
    }
    for (const a of from) {
      const path = this.roadPath(a, to);
      if (path) return path;
    }
    return 'Sem estrada ou rodovia contínua entre os Terminais Comerciais';
  }

  /** Rota até a borda do mapa (mercado mundial). */
  worldRoute(slot: Slot, mode: TransportMode): Route | string {
    const key = `${slot}:w:${mode}`;
    const hit = this.routeCache.get(key);
    if (hit && this.sim.tick - hit.tick < TICK_RATE * 2) return hit.route;
    const route = this.computeWorldRoute(slot, mode);
    this.routeCache.set(key, { tick: this.sim.tick, route });
    return route;
  }

  private computeWorldRoute(slot: Slot, mode: TransportMode): Route | string {
    const list = this.terminals(slot, mode);
    if (!list.length) return mode === 'sea' ? 'Sem Porto' : mode === 'air' ? 'Sem aeroporto' : 'Sem Terminal Comercial';
    const m = this.sim.map;
    const W = m.width * m.cellSize;
    const H = m.height * m.cellSize;
    if (mode === 'air') {
      const a = list[0]!;
      const e = nearestEdge(a.pos, W, H);
      return { path: [{ ...a.pos }, e], fromId: a.id, toId: null };
    }
    if (mode === 'sea') {
      for (const a of list) {
        const path = this.waterPath(a, null);
        if (path) return { path: [{ ...a.pos }, ...path], fromId: a.id, toId: null };
      }
      return 'O porto não tem saída para o mar aberto (borda do mapa)';
    }
    // caminhão: pelo terreno até a borda, sem atravessar território de quem está em guerra com o jogador
    const g = this.sim.grid;
    for (const a of list) {
      const start = g.nearestPassable(g.worldToCell(a.pos), 4);
      if (!start) continue;
      const exit = this.edgeCell(start);
      if (!exit) continue;
      g.blocker = (cx, cy) => {
        const o = this.sim.territoryOwner(cx, cy);
        return o >= 0 && o !== slot && this.sim.hostile(slot, o);
      };
      try {
        const cells = findPath(g, start, exit, {
          maxExpanded: g.width * g.height,
        });
        if (!cells) continue;
        const pts = cells.filter((_, i) => i % 3 === 0 || i === cells.length - 1).map((c) => g.cellCenter(c));
        return { path: pts.length >= 2 ? pts : [{ ...a.pos }, ...pts], fromId: a.id, toId: null };
      } finally {
        g.blocker = null;
      }
    }
    return 'Sem saída por terra até a borda do mapa';
  }

  /** Célula de borda transitável mais próxima (saída do caminhão para o mercado mundial). */
  private edgeCell(from: Cell): Cell | null {
    const m = this.sim.map;
    let best: Cell | null = null;
    let bd = Infinity;
    const consider = (cx: number, cy: number) => {
      if (!this.sim.grid.isPassable(cx, cy)) return;
      const d = Math.hypot(cx - from.cx, cy - from.cy);
      if (d < bd) {
        bd = d;
        best = { cx, cy };
      }
    };
    for (let x = 0; x < m.width; x++) {
      consider(x, 0);
      consider(x, m.height - 1);
    }
    for (let y = 0; y < m.height; y++) {
      consider(0, y);
      consider(m.width - 1, y);
    }
    return best;
  }

  /** Células de estrada vizinhas ao terreno de uma construção. */
  private roadCellsAround(b: Building): number[] {
    const W = this.sim.map.width;
    const size = BUILDINGS[b.type].size;
    const out: number[] = [];
    for (let dy = -1; dy <= size; dy++)
      for (let dx = -1; dx <= size; dx++) {
        if (dx >= 0 && dx < size && dy >= 0 && dy < size) continue;
        const cx = b.cell.cx + dx;
        const cy = b.cell.cy + dy;
        if (this.sim.grid.inBounds(cx, cy) && this.sim.map.terrain[cy * W + cx] === Terrain.Road) out.push(cy * W + cx);
      }
    return out;
  }

  /** Busca em largura pelas estradas e rodovias (de qualquer dono) entre dois terminais. */
  private roadPath(from: Building, to: Building[]): Route | null {
    const W = this.sim.map.width;
    const H = this.sim.map.height;
    const goal = new Map<number, Building>();
    for (const b of to) for (const i of this.roadCellsAround(b)) goal.set(i, b);
    if (!goal.size) return null;
    const prev = new Int32Array(W * H).fill(-2);
    const queue: number[] = [];
    for (const i of this.roadCellsAround(from)) {
      prev[i] = -1;
      queue.push(i);
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi]!;
      const hit = goal.get(i);
      if (hit) {
        const cells: number[] = [];
        for (let k = i; k >= 0; k = prev[k]!) cells.push(k);
        cells.reverse();
        const g = this.sim.grid;
        const pts = cells.map((k) => g.cellCenter({ cx: k % W, cy: Math.floor(k / W) }));
        return {
          // o caminhão espera, sai e chega pela rua ao lado dos terminais (não por cima deles)
          path: pts.length >= 2 ? pts : [{ ...from.pos }, ...pts, { ...hit.pos }],
          fromId: from.id,
          toId: hit.id,
        };
      }
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (prev[n] !== -2 || this.sim.map.terrain[n] !== Terrain.Road) continue;
        prev[n] = i;
        queue.push(n);
      }
    }
    return null;
  }

  /** Água junto a uma construção (raio 3). */
  private waterAround(b: Building): number[] {
    const W = this.sim.map.width;
    const g = this.sim.grid;
    const c = b.cell;
    const size = BUILDINGS[b.type].size;
    const out: number[] = [];
    for (let dy = -3; dy < size + 3; dy++)
      for (let dx = -3; dx < size + 3; dx++) {
        const x = c.cx + dx;
        const y = c.cy + dy;
        if (g.inBounds(x, y) && g.terrainAt(x, y) === Terrain.Water) out.push(y * W + x);
      }
    return out;
  }

  /** Busca em largura pela água: até um dos portos de destino, ou (null) até a borda do mapa. */
  private waterPath(from: Building, to: Building[] | null): Vec2[] | null {
    const W = this.sim.map.width;
    const H = this.sim.map.height;
    const goal = new Set<number>();
    if (to) for (const b of to) for (const i of this.waterAround(b)) goal.add(i);
    const isGoal = (i: number) => (to ? goal.has(i) : i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1));
    const prev = new Int32Array(W * H).fill(-2);
    const queue: number[] = [];
    for (const i of this.waterAround(from)) {
      prev[i] = -1;
      queue.push(i);
    }
    const g = this.sim.grid;
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi]!;
      if (isGoal(i)) {
        const cells: number[] = [];
        for (let k = i; k >= 0; k = prev[k]!) cells.push(k);
        cells.reverse();
        const pts = cells.filter((_, n) => n % 3 === 0 || n === cells.length - 1).map((k) => g.cellCenter({ cx: k % W, cy: Math.floor(k / W) }));
        if (!to) {
          // sai pela borda
          const last = pts[pts.length - 1]!;
          const m = this.sim.map;
          pts.push(nearestEdge(last, m.width * m.cellSize, m.height * m.cellSize));
        }
        return pts;
      }
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (prev[n] !== -2 || g.terrainAt(nx, ny) !== Terrain.Water) continue;
        prev[n] = i;
        queue.push(n);
      }
    }
    return null;
  }

  // -------------------------------------------------------------- trajeto, ataques e entrega

  private moveShipment(s: Shipment): void {
    if (s.state === 'delivered' || s.state === 'lost') return;
    if (s.state === 'queued') {
      if (this.sim.tick % TICK_RATE === 0) this.depart(s);
      return;
    }
    if (s.state === 'loading') {
      if (--s.timer > 0) return;
      s.state = 'moving';
      return;
    }
    if (s.state === 'offmap') {
      if (--s.timer > 0) return;
      this.nextLeg(s);
      return;
    }
    if (s.state === 'moving') {
      let speed = TRANSPORT[s.mode].speed;
      const pos = this.position(s);
      if (s.mode === 'road') {
        const cell = this.sim.grid.worldToCell(pos);
        if (this.sim.grid.inBounds(cell.cx, cell.cy)) {
          const i = cell.cy * this.sim.map.width + cell.cx;
          if (this.sim.map.terrain[i] === Terrain.Road) speed *= this.sim.isHighway(i) ? HIGHWAY.convoyMul : ROAD.convoyMul;
        }
      }
      s.travelled = Math.min(s.pathLength, s.travelled + speed / TICK_RATE);
      // ataque: quem está em guerra com o vendedor ou o comprador destrói o veículo no caminho
      if (this.sim.tick % 5 === 0) {
        if (this.underFire(s, pos)) {
          s.exposure += 5;
          if (s.exposure >= TRADE.exposureSeconds * TICK_RATE) {
            this.lose(s, s.mode === 'air' ? 'Avião cargueiro derrubado' : s.mode === 'sea' ? 'Navio afundado por forças inimigas' : 'Comboio destruído por forças inimigas');
            return;
          }
        } else s.exposure = 0;
      }
      if (s.travelled >= s.pathLength - 1e-6) this.nextLeg(s);
      return;
    }
    if (s.state === 'waiting_capacity' && this.sim.tick % TICK_RATE === 0) this.unload(s);
  }

  /** Há forças em guerra com uma das partes atirando no veículo? */
  private underFire(s: Shipment, p: Vec2): boolean {
    const sides = [s.seller, s.buyer].filter((x) => !isWorld(x));
    if (s.mode !== 'air') return sides.some((slot) => this.sim.hostileNear(slot, p, TRADE.ambushRange));
    const r = TRADE.airDefenseRange;
    for (const slot of sides) {
      for (const b of this.sim.buildings) {
        if (b.hp <= 0 || b.progress < 1 || !this.sim.hostile(slot, b.owner)) continue;
        if ((b.type === 'aa_battery' || b.type === 'iron_dome' || b.type === 'tower') && dist(b.pos, p) <= r) return true;
      }
      for (const u of this.sim.units) if (u.hp > 0 && UNITS[u.type].airDefense && this.sim.hostile(slot, u.owner) && dist(u.pos, p) <= r) return true;
    }
    return false;
  }

  private nextLeg(s: Shipment): void {
    s.leg++;
    if (s.leg >= s.legs.length) {
      this.arrive(s);
      return;
    }
    if (s.legs[s.leg] === 'offmap') {
      s.state = 'offmap';
      s.timer = Math.round(TRANSPORT[s.mode].offmapSeconds * TICK_RATE);
    } else {
      s.state = 'moving';
      s.travelled = 0;
    }
  }

  /** Chegada: no mercado mundial a venda se conclui; para um jogador, descarga no depósito (se couber). */
  private arrive(s: Shipment): void {
    if (isWorld(s.buyer)) {
      this.settle(s, s.units);
      s.state = 'delivered';
      return;
    }
    const dest = s.destId !== null ? this.sim.entities.get(s.destId) : undefined;
    if (!dest || dest.kind !== 'building' || dest.hp <= 0) {
      this.lose(s, 'Terminal de destino destruído: carga perdida');
      return;
    }
    this.unload(s);
  }

  /** Descarrega o que couber; o resto aguarda no pátio e tenta de novo a cada segundo. */
  private unload(s: Shipment): void {
    let stored = 0;
    for (const it of s.items) {
      if (it.quantity <= 1e-6) continue;
      const got = this.sim.storeFromTrade(s.buyer, it.resource, it.quantity);
      it.quantity -= got;
      stored += got;
    }
    if (stored > 0) this.settle(s, stored);
    if (s.items.some((i) => i.quantity > 1e-6)) {
      s.state = 'waiting_capacity';
      s.reason = 'Sem espaço no depósito do comprador: a carga aguarda no pátio';
    } else {
      s.state = 'delivered';
      s.reason = null;
    }
  }

  /** Pagamento na entrega, proporcional ao que entrou: o comprador paga, o vendedor recebe. */
  private settle(s: Shipment, units: number): void {
    const usd = s.units > 0 ? Math.round((s.payUsd * units) / s.units) : 0;
    if (this.link && usd > 0) {
      if (!isWorld(s.buyer)) this.link.pay(s.buyer, -usd, 'import');
      if (!isWorld(s.seller)) this.link.pay(s.seller, usd, 'export');
    }
    const c = s.contractId !== null ? this.contracts.find((x) => x.id === s.contractId) : undefined;
    if (c) c.paidUsd += usd;
    const first = s.items[0];
    this.sim.emitTrade({
      type: 'shipment_delivered',
      tick: this.sim.tick,
      shipmentId: s.id,
      contractId: s.contractId ?? 0,
      seller: s.seller,
      buyer: s.buyer,
      resource: first?.resource ?? 'food',
      quantity: r1(units),
      usd,
    });
  }

  private lose(s: Shipment, reason: string): void {
    s.state = 'lost';
    s.reason = reason;
    const left = unitsOf(s.items);
    const c = s.contractId !== null ? this.contracts.find((x) => x.id === s.contractId) : undefined;
    if (c) {
      c.lost += left;
      this.note(c, `${reason} (${Math.round(left)} perdidos)`);
    }
    this.sim.emitTrade({
      type: 'shipment_lost',
      tick: this.sim.tick,
      shipmentId: s.id,
      contractId: s.contractId ?? 0,
      seller: s.seller,
      buyer: s.buyer,
      resource: s.items[0]?.resource ?? 'food',
      quantity: r1(left),
      reason,
      pos: this.position(s),
      mode: s.mode,
    });
  }

  /** Guerra ou sanções: o contrato cai e a carga a caminho é apreendida. */
  private interrupt(c: TradeContract, reason: string): void {
    for (const s of this.shipments) if (s.contractId === c.id && (s.state === 'moving' || s.state === 'loading' || s.state === 'queued')) this.lose(s, `Carga apreendida: ${reason}`);
    this.endContract(c, reason);
  }

  private endContract(c: TradeContract, reason: string): void {
    c.status = 'ended';
    c.reason = reason;
    this.note(c, reason);
    this.sim.emitTrade({
      type: 'contract_update',
      tick: this.sim.tick,
      contractId: c.id,
      seller: c.seller,
      buyer: c.buyer,
      status: 'ended',
      text: reason,
    });
  }

  /** Guerra nova entre duas nações: vendas a caminho entre elas também são apreendidas. */
  onWar(a: Slot, b: Slot): void {
    for (const c of this.contracts)
      if (c.status === 'active' && ((c.seller === a && c.buyer === b) || (c.seller === b && c.buyer === a))) this.interrupt(c, `Guerra entre ${this.name(a)} e ${this.name(b)}`);
    for (const s of this.shipments)
      if (s.contractId === null && (s.state === 'moving' || s.state === 'loading' || s.state === 'queued') && ((s.seller === a && s.buyer === b) || (s.seller === b && s.buyer === a)))
        this.lose(s, `Carga apreendida: guerra entre ${this.name(a)} e ${this.name(b)}`);
  }

  private note(c: TradeContract, text: string): void {
    c.log.push({ tick: this.sim.tick, text });
    if (c.log.length > 12) c.log.shift();
  }

  /** Posição atual da carga no mapa (para desenhar e para os ataques). */
  position(s: Shipment): Vec2 {
    if (!s.path.length) {
      const from = s.fromId !== null ? this.sim.entities.get(s.fromId) : undefined;
      return from ? { ...from.pos } : { x: 0, y: 0 };
    }
    if (s.state === 'queued' || s.state === 'loading') return { ...s.path[0]! };
    if (s.state === 'offmap' || s.state === 'delivered')
      return {
        ...s.path[s.legs[0] === 'offmap' && s.leg === 0 ? 0 : s.path.length - 1]!,
      };
    if (s.state === 'waiting_capacity') return { ...s.path[s.path.length - 1]! };
    let left = s.travelled;
    for (let i = 1; i < s.path.length; i++) {
      const a = s.path[i - 1]!;
      const b = s.path[i]!;
      const d = dist(a, b);
      if (left <= d) {
        const k = d > 0 ? left / d : 0;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      left -= d;
    }
    return { ...s.path[s.path.length - 1]! };
  }
}

export interface Route {
  path: Vec2[];
  fromId: EntityId;
  toId: EntityId | null;
}

export const DAY_TICKS = TICKS_PER_DAY;
const NEIGHBORS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polyLength(p: Vec2[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1]!, p[i]!);
  return s;
}

/** Ponto da borda do mapa mais próximo. */
function nearestEdge(p: Vec2, W: number, H: number): Vec2 {
  const opts = [
    { d: p.y, v: { x: p.x, y: 0.5 } },
    { d: H - p.y, v: { x: p.x, y: H - 0.5 } },
    { d: p.x, v: { x: 0.5, y: p.y } },
    { d: W - p.x, v: { x: W - 0.5, y: p.y } },
  ];
  opts.sort((a, b) => a.d - b.d);
  return opts[0]!.v;
}

export const RES_LABEL: Record<TradeResource, string> = {
  food: 'comida',
  wood: 'madeira',
  stone: 'pedra',
  iron: 'ferro',
  oil: 'petróleo',
  coal: 'carvão',
};

export function itemsText(items: readonly TradeItem[]): string {
  return items.map((i) => `${Math.round(i.quantity)} de ${RES_LABEL[i.resource]}`).join(', ');
}

export function fmtUsd(usd: number): string {
  const m = usd / 1e6;
  if (Math.abs(m) >= 1) return `US$ ${m.toFixed(m >= 10 ? 0 : 1).replace('.', ',')} mi`;
  return `US$ ${Math.round(usd / 1000)} mil`;
}
