import { BUILDINGS, TICK_RATE, Terrain, type BuildingType } from './config.ts';
import { TICKS_PER_DAY } from '../strategic/params.ts';
import { findPath } from './pathfinding/AStar.ts';
import type { Simulation } from './Simulation.ts';
import type { Building, Cell, EntityId, Slot, Vec2 } from './types.ts';

/**
 * Comércio internacional e logística (Fase 6).
 *
 * Fluxo: oferta → (aceita) contrato → reserva no depósito de origem → embarques (lotes que
 * respeitam a capacidade do veículo) → trajeto no mapa e fora dele → entrega no destino (só se
 * houver capacidade de armazenamento) → pagamento. Nada aparece magicamente: a mercadoria sai do
 * estoque ao ser reservada, viaja como carga com estado próprio e só entra no estoque de quem
 * compra ao chegar.
 *
 * Parceiros: jogadores do teatro (slot < 100) ou países fora do teatro governados pela IA
 * (id ≥ 100, os mesmos da diplomacia). Com estes, a carga sai do mapa por um ponto de fronteira e
 * percorre um trecho "fora do mapa" com tempo próprio de cada modal.
 */

export type TradeResource = 'food' | 'wood' | 'stone' | 'iron' | 'oil';
export const TRADE_RESOURCES: TradeResource[] = ['food', 'wood', 'stone', 'iron', 'oil'];
export type TransportMode = 'road' | 'rail' | 'sea' | 'air';
export const TRANSPORT_MODES: TransportMode[] = ['road', 'rail', 'sea', 'air'];
export type PartnerId = number;

export const NPC_ID_FROM = 100;
export const isNpcPartner = (id: PartnerId) => id >= NPC_ID_FROM;

/** Preço de referência (US$ por unidade de jogo). */
export const BASE_PRICE: Record<TradeResource, number> = { food: 30_000, wood: 25_000, stone: 20_000, iron: 60_000, oil: 90_000 };

export interface TransportDef {
  label: string;
  /** Carga máxima de um veículo/comboio (unidades). */
  capacity: number;
  /** Velocidade no mapa (unidades de mundo por segundo). */
  speed: number;
  /** Trecho fora do mapa, até/desde um país de fora do teatro (segundos de jogo = dias). */
  offmapSeconds: number;
  /** Frete por unidade (US$), pago por quem despacha. */
  costPerUnit: number;
  /** Instalação de embarque exigida. */
  facility: BuildingType;
  needs: string;
  /** Exposição a interrupções (texto do painel de rota). */
  risk: string;
}

export const TRANSPORT: Record<TransportMode, TransportDef> = {
  road: {
    label: 'Rodoviário',
    capacity: 60,
    speed: 4,
    offmapSeconds: 30,
    costPerUnit: 2_000,
    facility: 'market',
    needs: 'Terminal Comercial',
    risk: 'Rota terrestre: território de países em guerra bloqueia o trajeto; tropas inimigas destroem o comboio.',
  },
  rail: {
    label: 'Ferroviário',
    capacity: 160,
    speed: 7,
    offmapSeconds: 18,
    costPerUnit: 800,
    facility: 'rail_station',
    needs: 'Estação Ferroviária',
    risk: 'Mesma rota terrestre, mais carga e menos frete; a estação é alvo fixo.',
  },
  sea: {
    label: 'Marítimo',
    capacity: 320,
    speed: 3,
    offmapSeconds: 45,
    costPerUnit: 500,
    facility: 'port',
    needs: 'Porto',
    risk: 'Lento e de grande volume; em guerra navega escoltado (+50% de tempo).',
  },
  air: {
    label: 'Aéreo',
    capacity: 20,
    speed: 14,
    offmapSeconds: 6,
    costPerUnit: 9_000,
    facility: 'hq',
    needs: 'Terminal Comercial e Base Aérea ou QG nível 4 (heliponto de carga)',
    risk: 'Rápido e caro; em guerra o frete sobe 50% (espaço aéreo contestado).',
  },
};
/** Nível mínimo do QG para o modal aéreo. */
export const AIR_HQ_LEVEL = 4;

/** Depósito de onde cada recurso sai (e para onde chega). */
export const DEPOT_FOR: Record<TradeResource, BuildingType> = { food: 'silo', wood: 'warehouse', stone: 'warehouse', iron: 'warehouse', oil: 'oil_tank' };

/** Regras gerais. */
export const TRADE = {
  /** Validade de uma oferta (dias = segundos). */
  offerDaysPlayer: 90,
  offerDaysNpc: 60,
  /** Prazo de contrato permitido (dias). */
  minDays: 60,
  maxDays: 720,
  maxQuantity: 2000,
  /** Embarques simultâneos por instalação de um modal. */
  convoysPerFacility: 2,
  /** Carregamento: tempo fixo + tempo proporcional à distância depósito → instalação (s). */
  loadSeconds: 3,
  loadSecondsPerWorld: 0.15,
  /** Atraso ao redirecionar a reserva para outro depósito (s). */
  redirectDelaySeconds: 10,
  /** Tropa ou torre em guerra a esta distância destrói o comboio. */
  ambushRange: 5,
  /** Dívida acima disto (% do PIB) suspende o crédito para compras. */
  maxDebtPctForImports: 150,
  /** Os países da IA respondem às ofertas depois deste prazo (dias). */
  npcReplyDays: 3,
  /** Intervalo entre ofertas espontâneas dos países da IA (dias). */
  npcOfferEveryDays: 45,
};

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired' | 'withdrawn';

export interface TradeOffer {
  id: number;
  /** Quem propôs e quem recebe. */
  from: PartnerId;
  to: PartnerId;
  seller: PartnerId;
  buyer: PartnerId;
  resource: TradeResource;
  quantity: number;
  /** US$ por unidade. */
  price: number;
  mode: TransportMode;
  /** Prazo do contrato que a oferta criaria (dias). */
  days: number;
  createdTick: number;
  expiresTick: number;
  status: OfferStatus;
  /** Contraproposta de outra oferta. */
  counterOf: number | null;
  /** Motivo da recusa (ou da contraproposta). */
  reason: string | null;
}

export type ContractStatus = 'active' | 'fulfilled' | 'suspended' | 'interrupted' | 'cancelled' | 'expired';

export interface TradeContract {
  id: number;
  offerId: number;
  seller: PartnerId;
  buyer: PartnerId;
  resource: TradeResource;
  quantity: number;
  price: number;
  mode: TransportMode;
  startTick: number;
  deadlineTick: number;
  /** Mercadoria do vendedor-jogador reservada no depósito e ainda não embarcada. */
  reserved: number;
  /** Depósito de origem da reserva (vendedor-jogador). */
  depotId: EntityId | null;
  shipped: number;
  delivered: number;
  lost: number;
  /** US$ já pagos pelo comprador ao vendedor. */
  paidUsd: number;
  /** Frete pago por quem despacha. */
  freightUsd: number;
  status: ContractStatus;
  /** Motivo da suspensão, interrupção, cancelamento ou expiração. */
  reason: string | null;
  /** Momento a partir do qual pode despachar de novo (atrasos). */
  holdUntilTick: number;
  log: { tick: number; text: string }[];
}

export type ShipmentState = 'loading' | 'moving' | 'offmap' | 'waiting_capacity' | 'delivered' | 'lost';

export interface Shipment {
  id: number;
  contractId: number;
  resource: TradeResource;
  quantity: number;
  mode: TransportMode;
  /** Quem despacha (vendedor) e quem recebe. */
  seller: PartnerId;
  buyer: PartnerId;
  /** Trajeto no mapa (mundo) e posição percorrida nele. */
  path: Vec2[];
  pathLength: number;
  travelled: number;
  /** Ordem dos trechos: carregar → mapa → fora do mapa (exportação) ou fora do mapa → mapa (importação). */
  legs: ('map' | 'offmap')[];
  leg: number;
  state: ShipmentState;
  /** Ticks restantes do estado atual (carregamento, trecho fora do mapa). */
  timer: number;
  /** Tempo total estimado (ticks), desde o despacho. */
  etaTicks: number;
  startTick: number;
  /** Instalação de destino no mapa (comprador-jogador). */
  destId: EntityId | null;
  reason: string | null;
}

/** Oferta/demanda de um país da IA por recurso (unidades disponíveis, repostas por dia). */
export interface NpcMarket {
  supply: number;
  demand: number;
}

export interface TradeSave {
  nextId: number;
  offers: TradeOffer[];
  contracts: TradeContract[];
  shipments: Shipment[];
  npc: Record<number, Record<TradeResource, NpcMarket>>;
  lastNpcOfferDay: number;
}

/** Ligação com a camada nacional: diplomacia, países da IA e dinheiro. */
export interface TradeLink {
  /** Países da IA (fora do teatro) e o código do país. */
  npcs(): { id: PartnerId; countryId: string }[];
  knows(a: PartnerId, b: PartnerId): boolean;
  atWar(a: PartnerId, b: PartnerId): boolean;
  /** Sanções em vigor em qualquer sentido. */
  sanctioned(a: PartnerId, b: PartnerId): boolean;
  relation(a: PartnerId, b: PartnerId): number;
  /** Em guerra com alguém (escolta naval, espaço aéreo contestado). */
  atWarAny(a: PartnerId): boolean;
  debtPctGdp(slot: Slot): number;
  /** Lançamento no tesouro do jogador: positivo = receita, negativo = despesa. */
  pay(slot: Slot, usd: number, description: string): void;
  partnerName(id: PartnerId): string;
}

// ------------------------------------------------------------------ perfil dos países da IA

/** Vantagens comparativas conhecidas (multiplicador de oferta; demanda é o inverso). */
const PROFILE: Partial<Record<string, Partial<Record<TradeResource, number>>>> = {
  BRA: { food: 1.7, iron: 1.6, wood: 1.4, oil: 1.2 },
  ARG: { food: 1.7, oil: 1.0 },
  USA: { food: 1.5, oil: 1.5, wood: 1.2 },
  MEX: { oil: 1.4, food: 0.9 },
  DEU: { iron: 0.7, food: 0.8, oil: 0.5, stone: 1.1 },
  FRA: { food: 1.2, oil: 0.5 },
  IND: { iron: 1.3, food: 0.9, oil: 0.5 },
  JPN: { food: 0.5, oil: 0.3, iron: 0.6, wood: 0.7 },
  ZAF: { iron: 1.4, stone: 1.3 },
  AUS: { iron: 1.8, food: 1.3, stone: 1.2 },
};
export function npcSupplyMul(countryId: string, r: TradeResource): number {
  return PROFILE[countryId]?.[r] ?? 1;
}

/** Preço que o país da IA cobra ao vender e paga ao comprar, com a relação diplomática. */
export function npcQuote(countryId: string, r: TradeResource, relation: number): { sell: number; buy: number } {
  const mul = npcSupplyMul(countryId, r);
  const scarcity = 1 + 0.3 * (1 - mul); // abundante → mais barato
  const friendly = 1 - Math.max(-20, Math.min(30, relation)) / 300; // boa relação → até 10% melhor
  const mid = BASE_PRICE[r] * scarcity;
  return { sell: Math.round(mid * 1.08 * friendly), buy: Math.round((mid * 0.92) / friendly) };
}

const NPC_DAILY = 6; // unidades/dia repostas na oferta e na demanda, antes do perfil
const NPC_POOL_MAX = 400;

// ------------------------------------------------------------------ sistema

export interface OfferInput {
  partner: PartnerId;
  side: 'buy' | 'sell';
  resource: TradeResource;
  quantity: number;
  price: number;
  mode: TransportMode;
  days: number;
  counterOf?: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export class TradeSystem {
  nextId = 1;
  offers: TradeOffer[] = [];
  contracts: TradeContract[] = [];
  shipments: Shipment[] = [];
  npc: Record<number, Record<TradeResource, NpcMarket>> = {};
  lastNpcOfferDay = 0;
  link: TradeLink | null = null;

  constructor(private readonly sim: Simulation) {}

  // -------------------------------------------------------------- salvar/carregar

  toSave(): TradeSave {
    return JSON.parse(
      JSON.stringify({ nextId: this.nextId, offers: this.offers, contracts: this.contracts, shipments: this.shipments, npc: this.npc, lastNpcOfferDay: this.lastNpcOfferDay }),
    ) as TradeSave;
  }

  load(s: TradeSave | undefined): void {
    if (!s) return;
    const c = JSON.parse(JSON.stringify(s)) as TradeSave;
    this.nextId = c.nextId;
    this.offers = c.offers;
    this.contracts = c.contracts;
    this.shipments = c.shipments;
    this.npc = c.npc;
    this.lastNpcOfferDay = c.lastNpcOfferDay;
  }

  // -------------------------------------------------------------- consultas

  private get day(): number {
    return Math.floor(this.sim.tick / DAY_TICKS);
  }

  name(id: PartnerId): string {
    return this.link?.partnerName(id) ?? (isNpcPartner(id) ? `País ${id}` : `Jogador ${id + 1}`);
  }

  /** Instalações concluídas de um tipo. */
  private facilities(slot: Slot, type: BuildingType): Building[] {
    return this.sim.buildings.filter((b) => b.owner === slot && b.type === type && b.progress >= 1 && b.hp > 0);
  }

  /** O modal está disponível para o jogador? (motivo, ou null). */
  modeBlocker(slot: Slot, mode: TransportMode): string | null {
    const def = TRANSPORT[mode];
    if (this.facilities(slot, 'market').length === 0) return 'Construa um Terminal Comercial para negociar com outros países';
    if (mode === 'air') {
      if (!this.airTerminals(slot).length) return `Modal aéreo: construa uma Base Aérea ou melhore o Centro de Comando até o nível ${AIR_HQ_LEVEL} (heliponto de carga)`;
      return null;
    }
    if (this.facilities(slot, def.facility).length === 0) return `Modal ${def.label.toLowerCase()}: construa ${def.needs === 'Porto' ? 'um Porto (na margem da água)' : `uma ${def.needs}`}`;
    return null;
  }

  /** Terminais aéreos: bases aéreas e o heliponto do QG (nível 4+). */
  private airTerminals(slot: Slot): Building[] {
    const list = this.facilities(slot, 'airbase');
    const hq = this.sim.hqOf(slot);
    if (hq && hq.progress >= 1 && hq.level >= AIR_HQ_LEVEL) list.push(hq);
    return list;
  }

  /** Diplomacia permite negociar? */
  accessBlocker(a: PartnerId, b: PartnerId): string | null {
    if (a === b) return 'Parceiro inválido';
    const l = this.link;
    if (!l) return 'Comércio internacional indisponível nesta partida';
    // basta um dos lados conhecer o outro: quem propõe apresenta-se na própria oferta
    if (!l.knows(a, b) && !l.knows(b, a)) return `Sem contato diplomático com ${this.name(b)}`;
    if (l.atWar(a, b)) return `Em guerra com ${this.name(b)}`;
    if (l.sanctioned(a, b)) return `Sanções em vigor com ${this.name(b)}`;
    return null;
  }

  /** Embarques ativos de um jogador num modal (limite = instalações × 2). */
  private activeShipments(slot: Slot, mode: TransportMode): number {
    return this.shipments.filter((s) => s.mode === mode && (s.seller === slot || s.buyer === slot) && (s.state === 'loading' || s.state === 'moving' || s.state === 'offmap')).length;
  }

  convoyLimit(slot: Slot, mode: TransportMode): number {
    // aéreo: terminais comerciais × 2, mais um embarque por cargueiro pronto (Fase 7)
    if (mode === 'air') return this.facilities(slot, 'market').length * TRADE.convoysPerFacility + this.sim.air.transports(slot);
    return this.facilities(slot, TRANSPORT[mode].facility).length * TRADE.convoysPerFacility;
  }

  /** Estoque utilizável para venda: oleo só dos tanques; demais recursos com o depósito certo. */
  sellable(slot: Slot, r: TradeResource): number {
    const p = this.sim.players[slot];
    if (!p) return 0;
    if (this.facilities(slot, DEPOT_FOR[r]).length === 0) return 0;
    if (r === 'oil') return this.facilities(slot, 'oil_tank').reduce((a, t) => a + t.stored, 0);
    return Math.max(0, p.resources[r]);
  }

  freeCapacity(slot: Slot, r: TradeResource): number {
    const p = this.sim.players[slot];
    if (!p) return 0;
    return Math.max(0, this.sim.capacity(slot)[r] - p.resources[r]);
  }

  /** Validação completa de uma proposta (mesmo texto no servidor e no painel). */
  offerBlocker(from: PartnerId, o: OfferInput): string | null {
    if (!TRADE_RESOURCES.includes(o.resource)) return 'Recurso inválido';
    if (!TRANSPORT_MODES.includes(o.mode)) return 'Modal inválido';
    if (!Number.isInteger(o.quantity) || o.quantity < 1 || o.quantity > TRADE.maxQuantity) return `Quantidade entre 1 e ${TRADE.maxQuantity}`;
    if (!(o.price > 0) || o.price > BASE_PRICE[o.resource] * 5) return 'Preço inválido';
    if (!Number.isInteger(o.days) || o.days < TRADE.minDays || o.days > TRADE.maxDays) return `Prazo entre ${TRADE.minDays} e ${TRADE.maxDays} dias`;
    const access = this.accessBlocker(from, o.partner);
    if (access) return access;
    const seller = o.side === 'sell' ? from : o.partner;
    const buyer = o.side === 'sell' ? o.partner : from;
    if (o.mode === 'sea' && !isNpcPartner(seller) && !isNpcPartner(buyer)) return 'Entre forças do mesmo teatro só há rotas terrestres e aéreas';
    for (const side of [seller, buyer]) {
      if (isNpcPartner(side)) continue;
      const m = this.modeBlocker(side, o.mode);
      if (m) return side === from ? m : `${this.name(side)} não tem como receber/enviar por este modal`;
    }
    if (!isNpcPartner(seller)) {
      if (this.facilities(seller, DEPOT_FOR[o.resource]).length === 0) return `Sem ${BUILDINGS[DEPOT_FOR[o.resource]].label} de origem para ${o.resource === 'oil' ? 'o petróleo' : 'este recurso'}`;
    }
    if (!isNpcPartner(buyer)) {
      if (this.facilities(buyer, DEPOT_FOR[o.resource]).length === 0) return `${buyer === from ? 'Sem' : `${this.name(buyer)} não tem`} ${BUILDINGS[DEPOT_FOR[o.resource]].label} para receber`;
      if (this.link && this.link.debtPctGdp(buyer) > TRADE.maxDebtPctForImports) return 'Crédito suspenso: dívida acima de 150% do PIB';
    }
    return null;
  }

  // -------------------------------------------------------------- comandos

  propose(from: PartnerId, o: OfferInput): string | null {
    const err = this.offerBlocker(from, o);
    if (err) return err;
    if (o.counterOf !== undefined) {
      const orig = this.offers.find((x) => x.id === o.counterOf);
      if (!orig || orig.status !== 'pending' || orig.to !== from || orig.from !== o.partner) return 'Oferta original indisponível';
      orig.status = 'countered';
      orig.reason = 'Contraproposta enviada';
    }
    const seller = o.side === 'sell' ? from : o.partner;
    const buyer = o.side === 'sell' ? o.partner : from;
    const days = isNpcPartner(from) ? TRADE.offerDaysNpc : TRADE.offerDaysPlayer;
    const offer: TradeOffer = {
      id: this.nextId++,
      from,
      to: o.partner,
      seller,
      buyer,
      resource: o.resource,
      quantity: o.quantity,
      price: Math.round(o.price),
      mode: o.mode,
      days: o.days,
      createdTick: this.sim.tick,
      expiresTick: this.sim.tick + days * DAY_TICKS,
      status: 'pending',
      counterOf: o.counterOf ?? null,
      reason: null,
    };
    this.offers.push(offer);
    this.sim.emitTrade({ type: 'trade_offer', tick: this.sim.tick, offerId: offer.id, from, to: o.partner });
    return null;
  }

  withdraw(slot: Slot, offerId: number): string | null {
    const o = this.offers.find((x) => x.id === offerId);
    if (!o || o.from !== slot || o.status !== 'pending') return 'Oferta indisponível';
    o.status = 'withdrawn';
    return null;
  }

  respond(slot: PartnerId, offerId: number, accept: boolean, reason: string | null = null): string | null {
    const o = this.offers.find((x) => x.id === offerId);
    if (!o || o.to !== slot || o.status !== 'pending') return 'Oferta indisponível';
    if (!accept) {
      o.status = 'rejected';
      o.reason = reason ?? 'Recusada';
      this.sim.emitTrade({ type: 'trade_reply', tick: this.sim.tick, offerId: o.id, from: o.to, to: o.from, accepted: false, reason: o.reason });
      return null;
    }
    // a aceitação revalida tudo com o estado atual (estoque, capacidade, diplomacia)
    const err = this.acceptBlocker(o);
    if (err) return err;
    this.createContract(o);
    return null;
  }

  /** O que impede fechar o contrato agora (reserva e capacidade do primeiro lote). */
  acceptBlocker(o: TradeOffer): string | null {
    const base = this.offerBlocker(o.from, { partner: o.to, side: o.from === o.seller ? 'sell' : 'buy', resource: o.resource, quantity: o.quantity, price: o.price, mode: o.mode, days: o.days });
    if (base) return base;
    if (!isNpcPartner(o.seller)) {
      const have = this.sellable(o.seller, o.resource);
      if (have + 1e-6 < o.quantity) return `Estoque insuficiente para reservar: ${Math.floor(have)} de ${o.quantity} disponíveis ${o.resource === 'oil' ? 'nos tanques' : 'nos depósitos'}`;
    }
    if (!isNpcPartner(o.buyer)) {
      const lot = Math.min(o.quantity, TRANSPORT[o.mode].capacity);
      const free = this.freeCapacity(o.buyer, o.resource);
      if (free + 1e-6 < lot) return `Sem capacidade para receber: ${Math.floor(free)} livres, o primeiro lote tem ${lot}`;
    }
    if (isNpcPartner(o.seller)) {
      const pool = this.npcPool(o.seller)[o.resource];
      if (pool.supply + 1e-6 < o.quantity) return `${this.name(o.seller)} só tem ${Math.floor(pool.supply)} disponíveis para exportar`;
    }
    if (isNpcPartner(o.buyer)) {
      const pool = this.npcPool(o.buyer)[o.resource];
      if (pool.demand + 1e-6 < o.quantity) return `${this.name(o.buyer)} só compra ${Math.floor(pool.demand)} neste momento`;
    }
    return null;
  }

  private createContract(o: TradeOffer): void {
    o.status = 'accepted';
    const c: TradeContract = {
      id: this.nextId++,
      offerId: o.id,
      seller: o.seller,
      buyer: o.buyer,
      resource: o.resource,
      quantity: o.quantity,
      price: o.price,
      mode: o.mode,
      startTick: this.sim.tick,
      deadlineTick: this.sim.tick + o.days * DAY_TICKS,
      reserved: 0,
      depotId: null,
      shipped: 0,
      delivered: 0,
      lost: 0,
      paidUsd: 0,
      freightUsd: 0,
      status: 'active',
      reason: null,
      holdUntilTick: this.sim.tick,
      log: [],
    };
    // reserva: a mercadoria sai do estoque utilizável e fica presa ao contrato no depósito de origem
    if (!isNpcPartner(c.seller)) {
      this.sim.takeForTrade(c.seller, c.resource, c.quantity);
      c.reserved = c.quantity;
      c.depotId = this.pickDepot(c.seller, c.resource)?.id ?? null;
    }
    if (isNpcPartner(c.seller)) this.npcPool(c.seller)[c.resource].supply -= c.quantity;
    if (isNpcPartner(c.buyer)) this.npcPool(c.buyer)[c.resource].demand -= c.quantity;
    this.note(c, `Contrato fechado: ${c.quantity} de ${c.resource} a ${fmtUsd(c.price)}/un (${TRANSPORT[c.mode].label.toLowerCase()})`);
    this.contracts.push(c);
    this.sim.emitTrade({ type: 'trade_reply', tick: this.sim.tick, offerId: o.id, from: o.to, to: o.from, accepted: true, reason: null });
    this.sim.emitTrade({ type: 'contract_update', tick: this.sim.tick, contractId: c.id, seller: c.seller, buyer: c.buyer, status: c.status, text: 'Contrato fechado' });
  }

  cancel(slot: Slot, contractId: number): string | null {
    const c = this.contracts.find((x) => x.id === contractId);
    if (!c || (c.seller !== slot && c.buyer !== slot)) return 'Contrato inválido';
    if (c.status !== 'active' && c.status !== 'suspended') return 'Contrato já encerrado';
    this.close(c, 'cancelled', `Cancelado por ${this.name(slot)}`);
    return null;
  }

  // -------------------------------------------------------------- passo

  step(): void {
    const tick = this.sim.tick;
    if (tick % DAY_TICKS === 0) this.daily();
    for (const s of this.shipments) this.moveShipment(s);
    // remove o histórico antigo de embarques concluídos
    if (tick % (DAY_TICKS * 10) === 0) this.shipments = this.shipments.filter((s) => (s.state !== 'delivered' && s.state !== 'lost') || tick - s.startTick < DAY_TICKS * 60);
  }

  private daily(): void {
    const tick = this.sim.tick;
    // reposição diária da oferta/demanda dos países da IA
    for (const { id, countryId } of this.link?.npcs() ?? []) {
      const pool = this.npcPool(id);
      for (const r of TRADE_RESOURCES) {
        const m = npcSupplyMul(countryId, r);
        pool[r].supply = Math.min(NPC_POOL_MAX * m, pool[r].supply + NPC_DAILY * m);
        pool[r].demand = Math.min(NPC_POOL_MAX / m, pool[r].demand + NPC_DAILY / m);
      }
    }
    // ofertas: validade e respostas dos países da IA
    for (const o of this.offers) {
      if (o.status !== 'pending') continue;
      if (tick >= o.expiresTick) {
        o.status = 'expired';
        o.reason = 'Prazo da oferta encerrado';
        continue;
      }
      if (isNpcPartner(o.to) && tick - o.createdTick >= TRADE.npcReplyDays * DAY_TICKS) this.npcReply(o);
    }
    // contratos: diplomacia, prazo e despacho
    for (const c of this.contracts) {
      if (c.status !== 'active' && c.status !== 'suspended') continue;
      if (this.link?.atWar(c.seller, c.buyer)) {
        this.interrupt(c, `Guerra entre ${this.name(c.seller)} e ${this.name(c.buyer)}`);
        continue;
      }
      if (this.link?.sanctioned(c.seller, c.buyer)) {
        this.interrupt(c, `Sanções entre ${this.name(c.seller)} e ${this.name(c.buyer)}`);
        continue;
      }
      if (tick >= c.deadlineTick && c.shipped < c.quantity) {
        this.close(c, 'expired', `Prazo encerrado com ${c.quantity - c.shipped} sem embarcar`);
        continue;
      }
      this.dispatch(c);
    }
    // ofertas espontâneas dos países da IA para jogadores com terminal comercial
    if (this.day - this.lastNpcOfferDay >= TRADE.npcOfferEveryDays) {
      this.lastNpcOfferDay = this.day;
      this.npcOffers();
    }
  }

  // -------------------------------------------------------------- despacho e trajeto

  private pickDepot(slot: Slot, r: TradeResource): Building | null {
    const depots = this.facilities(slot, DEPOT_FOR[r]);
    if (r === 'oil') depots.sort((a, b) => b.stored - a.stored || a.id - b.id);
    else depots.sort((a, b) => a.id - b.id);
    return depots[0] ?? null;
  }

  /** Instalação de embarque do jogador para o modal (a mais próxima do depósito). */
  private terminal(slot: Slot, mode: TransportMode, near?: Vec2): Building | null {
    const list = mode === 'air' ? this.airTerminals(slot) : this.facilities(slot, TRANSPORT[mode].facility);
    if (near) list.sort((a, b) => dist(a.pos, near) - dist(b.pos, near) || a.id - b.id);
    return list[0] ?? null;
  }

  private dispatch(c: TradeContract): void {
    if (c.shipped >= c.quantity || this.sim.tick < c.holdUntilTick) return;
    const sellerPlayer = !isNpcPartner(c.seller);
    const shipper = sellerPlayer ? c.seller : null;
    // depósito de origem: destruído antes da retirada → redireciona ou perde a reserva
    if (sellerPlayer) {
      const depot = c.depotId !== null ? this.sim.entities.get(c.depotId) : undefined;
      if (!depot || depot.kind !== 'building' || depot.hp <= 0) {
        const other = this.pickDepot(c.seller, c.resource);
        if (other) {
          c.depotId = other.id;
          c.holdUntilTick = this.sim.tick + TRADE.redirectDelaySeconds * TICK_RATE;
          this.note(c, `Depósito de origem destruído: carga redirecionada para outro ${BUILDINGS[other.type].label} (+${TRADE.redirectDelaySeconds} dias)`);
          return;
        }
        const lost = c.reserved;
        c.reserved = 0;
        c.lost += lost;
        this.interrupt(c, `Depósito de origem destruído: ${lost} reservados perdidos`);
        return;
      }
    }
    const lot = Math.min(TRANSPORT[c.mode].capacity, c.quantity - c.shipped);
    const route = this.route(c);
    if (typeof route === 'string') {
      this.suspend(c, route);
      return;
    }
    // aguarda veículo livre: cada instalação opera um número limitado de embarques ao mesmo tempo
    for (const side of [c.seller, c.buyer]) if (!isNpcPartner(side) && this.activeShipments(side, c.mode) >= this.convoyLimit(side, c.mode)) return;
    if (c.status === 'suspended') {
      c.status = 'active';
      c.reason = null;
      this.note(c, 'Rota restabelecida: despacho retomado');
      this.sim.emitTrade({ type: 'contract_update', tick: this.sim.tick, contractId: c.id, seller: c.seller, buyer: c.buyer, status: c.status, text: 'Rota restabelecida' });
    }
    // frete pago por quem despacha (jogador); risco de guerra encarece aéreo e atrasa marítimo
    const war = this.link ? this.link.atWarAny(c.seller) || this.link.atWarAny(c.buyer) : false;
    let freight = lot * TRANSPORT[c.mode].costPerUnit * (c.mode === 'air' && war ? 1.5 : 1);
    if (shipper === null) freight = 0;
    if (shipper !== null && this.link) this.link.pay(shipper, -freight, `Frete: ${lot} ${c.resource} para ${this.name(c.buyer)}`);
    c.freightUsd += freight;
    if (sellerPlayer) c.reserved -= lot;
    c.shipped += lot;
    const offmap = Math.round(TRANSPORT[c.mode].offmapSeconds * TICK_RATE * (c.mode === 'sea' && war ? 1.5 : 1));
    const load = sellerPlayer ? Math.round((TRADE.loadSeconds + route.load * TRADE.loadSecondsPerWorld) * TICK_RATE) : 0;
    const pathLength = polyLength(route.path);
    const s: Shipment = {
      id: this.nextId++,
      contractId: c.id,
      resource: c.resource,
      quantity: lot,
      mode: c.mode,
      seller: c.seller,
      buyer: c.buyer,
      path: route.path,
      pathLength,
      travelled: 0,
      legs: route.legs,
      leg: 0,
      state: sellerPlayer ? 'loading' : 'offmap',
      timer: sellerPlayer ? load : offmap,
      etaTicks: load + Math.round((pathLength / TRANSPORT[c.mode].speed) * TICK_RATE) + (route.legs.includes('offmap') ? offmap : 0),
      startTick: this.sim.tick,
      destId: route.destId,
      reason: null,
    };
    if (!sellerPlayer) s.leg = 0; // importação: começa fora do mapa
    this.shipments.push(s);
    this.note(c, `Lote despachado: ${lot} (${TRANSPORT[c.mode].label.toLowerCase()})`);
  }

  /** Trajeto no mapa de um lote, ou o motivo de não haver rota. */
  private route(c: TradeContract): { path: Vec2[]; legs: ('map' | 'offmap')[]; load: number; destId: EntityId | null } | string {
    const sellerP = !isNpcPartner(c.seller);
    const buyerP = !isNpcPartner(c.buyer);
    const depot = sellerP && c.depotId !== null ? (this.sim.entities.get(c.depotId) as Building | undefined) : undefined;
    const from = sellerP ? this.terminal(c.seller, c.mode, depot?.pos) : null;
    const to = buyerP ? this.terminal(c.buyer, c.mode) : null;
    const term = c.mode === 'air' ? 'base aérea ou heliponto (QG nível 4)' : BUILDINGS[TRANSPORT[c.mode].facility].label;
    if (sellerP && !from) return `Sem ${term} para embarcar`;
    if (buyerP && !to) return `${this.name(c.buyer)} sem ${term} para receber`;
    const load = depot && from ? dist(depot.pos, from.pos) : 0;
    const shipper = sellerP ? c.seller : c.buyer;
    if (sellerP && buyerP) {
      const path = this.mapPath(shipper, from!.pos, to!.pos, c.mode);
      if (!path) return 'Rota terrestre bloqueada entre os terminais';
      return { path, legs: ['map'], load, destId: to!.id };
    }
    // com país de fora do teatro: fronteira do mapa na direção do parceiro
    const partner = sellerP ? c.buyer : c.seller;
    const terminal = (sellerP ? from : to)!;
    const exit = this.exitPoint(partner, terminal.pos, c.mode);
    if (!exit) return 'Sem saída do mapa para esse destino';
    const path = this.mapPath(shipper, terminal.pos, exit, c.mode);
    if (!path) return c.mode === 'sea' ? 'Rota marítima bloqueada' : 'Rota terrestre bloqueada até a fronteira (território em guerra ou intransitável)';
    return sellerP ? { path, legs: ['map', 'offmap'], load, destId: null } : { path: [...path].reverse(), legs: ['offmap', 'map'], load: 0, destId: to!.id };
  }

  /** Ponto de saída na borda do mapa para um país de fora (lado fixo por país). */
  private exitPoint(partner: PartnerId, from: Vec2, mode: TransportMode): Vec2 | null {
    const m = this.sim.map;
    const cs = m.cellSize;
    const side = (partner * 7 + 3) % 4; // 0 norte, 1 leste, 2 sul, 3 oeste
    if (mode === 'sea' || mode === 'air') {
      // navios e aviões seguem em linha reta até a borda daquele lado
      const W = m.width * cs;
      const H = m.height * cs;
      return side === 0 ? { x: from.x, y: 0.5 } : side === 1 ? { x: W - 0.5, y: from.y } : side === 2 ? { x: from.x, y: H - 0.5 } : { x: 0.5, y: from.y };
    }
    // terrestre: a célula de borda transitável mais próxima do meio daquele lado
    const cands: Cell[] = [];
    for (let i = 0; i < (side % 2 === 0 ? m.width : m.height); i++) {
      const c = side === 0 ? { cx: i, cy: 0 } : side === 1 ? { cx: m.width - 1, cy: i } : side === 2 ? { cx: i, cy: m.height - 1 } : { cx: 0, cy: i };
      if (this.sim.grid.isPassable(c.cx, c.cy)) cands.push(c);
    }
    if (!cands.length) return null;
    const mid = side % 2 === 0 ? m.width / 2 : m.height / 2;
    cands.sort((a, b) => Math.abs((side % 2 === 0 ? a.cx : a.cy) - mid) - Math.abs((side % 2 === 0 ? b.cx : b.cy) - mid));
    return this.sim.grid.cellCenter(cands[0]!);
  }

  /**
   * Trajeto no mapa: terrestre por pathfinding, evitando território de quem está em guerra com
   * quem despacha; marítimo e aéreo em linha reta (o marítimo exige água no caminho até a borda).
   */
  private mapPath(shipper: Slot, a: Vec2, b: Vec2, mode: TransportMode): Vec2[] | null {
    if (mode === 'air') return [a, b];
    if (mode === 'sea') return this.seaPath(a, b);
    const g = this.sim.grid;
    const start = g.nearestPassable(g.worldToCell(a), 4);
    const goal = g.nearestPassable(g.worldToCell(b), 4);
    if (!start || !goal) return null;
    g.blocker = (cx, cy) => {
      const o = this.sim.territoryOwner(cx, cy);
      return o >= 0 && o !== shipper && this.sim.hostile(shipper, o);
    };
    try {
      const cells = findPath(g, start, goal, { maxExpanded: g.width * g.height });
      if (!cells) return null;
      // simplifica: um ponto a cada 3 células (o veículo segue a via sem tremer)
      const pts = cells.filter((_, i) => i % 3 === 0 || i === cells.length - 1).map((c) => g.cellCenter(c));
      return [a, ...pts, b];
    } finally {
      g.blocker = null;
    }
  }

  /** Marítimo: do porto até a borda pela água; exige água junto ao porto. */
  private seaPath(a: Vec2, b: Vec2): Vec2[] | null {
    const g = this.sim.grid;
    const c = g.worldToCell(a);
    for (let r = 1; r <= 3; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = c.cx + dx;
          const y = c.cy + dy;
          if (g.inBounds(x, y) && g.terrainAt(x, y) === WATER) {
            const w = g.cellCenter({ cx: x, cy: y });
            return [a, w, b];
          }
        }
    return null;
  }

  private moveShipment(s: Shipment): void {
    if (s.state === 'delivered' || s.state === 'lost') return;
    const c = this.contracts.find((x) => x.id === s.contractId);
    if (!c) return;
    if (s.state === 'loading') {
      if (--s.timer > 0) return;
      s.state = s.legs[s.leg] === 'offmap' ? 'offmap' : 'moving';
      if (s.state === 'offmap') s.timer = Math.round(TRANSPORT[s.mode].offmapSeconds * TICK_RATE);
      return;
    }
    if (s.state === 'offmap') {
      if (--s.timer > 0) return;
      this.nextLeg(s, c);
      return;
    }
    if (s.state === 'moving') {
      s.travelled = Math.min(s.pathLength, s.travelled + TRANSPORT[s.mode].speed / TICK_RATE);
      // emboscada: tropas ou torres de quem está em guerra com o dono da carga
      if (s.mode === 'road' || s.mode === 'rail') {
        const shipper = !isNpcPartner(s.seller) ? s.seller : s.buyer;
        if (this.sim.tick % 5 === 0 && this.sim.hostileNear(shipper, this.position(s), TRADE.ambushRange)) {
          this.lose(s, c, 'Comboio destruído por forças inimigas');
          return;
        }
      }
      if (s.travelled >= s.pathLength - 1e-6) this.nextLeg(s, c);
      return;
    }
    if (s.state === 'waiting_capacity') {
      if (this.sim.tick % TICK_RATE === 0) this.unload(s, c);
    }
  }

  private nextLeg(s: Shipment, c: TradeContract): void {
    s.leg++;
    if (s.leg >= s.legs.length) {
      this.arrive(s, c);
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

  /** Chegada: para país da IA, entregue; para jogador, descarga no depósito (se couber). */
  private arrive(s: Shipment, c: TradeContract): void {
    if (isNpcPartner(s.buyer)) {
      this.deliver(s, c, s.quantity);
      return;
    }
    // o terminal de destino precisa existir na chegada
    const dest = s.destId !== null ? this.sim.entities.get(s.destId) : undefined;
    if (!dest || dest.kind !== 'building' || dest.hp <= 0) {
      this.lose(s, c, 'Terminal de destino destruído: carga perdida');
      return;
    }
    this.unload(s, c);
  }

  private unload(s: Shipment, c: TradeContract): void {
    const stored = this.sim.storeFromTrade(s.buyer, s.resource, s.quantity);
    if (stored > 0) {
      s.quantity -= stored;
      this.deliver(s, c, stored);
    }
    if (s.quantity > 1e-6) {
      if (s.state !== 'waiting_capacity') this.note(c, `Aguardando espaço no depósito do comprador (${Math.ceil(s.quantity)} no pátio)`);
      s.state = 'waiting_capacity';
      s.reason = 'Sem capacidade de armazenamento no destino';
    } else {
      s.state = 'delivered';
      s.reason = null;
    }
  }

  /** Entrega de parte ou de todo o lote: pagamento do comprador ao vendedor. */
  private deliver(s: Shipment, c: TradeContract, qty: number): void {
    const usd = qty * c.price;
    c.delivered += qty;
    c.paidUsd += usd;
    if (this.link) {
      if (!isNpcPartner(c.buyer)) this.link.pay(c.buyer, -usd, `Importação: ${r1(qty)} ${c.resource} de ${this.name(c.seller)}`);
      if (!isNpcPartner(c.seller)) this.link.pay(c.seller, usd, `Exportação: ${r1(qty)} ${c.resource} para ${this.name(c.buyer)}`);
    }
    if (isNpcPartner(s.buyer)) s.state = 'delivered';
    this.sim.emitTrade({ type: 'shipment_delivered', tick: this.sim.tick, shipmentId: s.id, contractId: c.id, seller: c.seller, buyer: c.buyer, resource: c.resource, quantity: r1(qty) });
    if (c.delivered + c.lost >= c.quantity - 1e-6 && (c.status === 'active' || c.status === 'suspended')) this.close(c, 'fulfilled', null);
  }

  private lose(s: Shipment, c: TradeContract, reason: string): void {
    s.state = 'lost';
    s.reason = reason;
    c.lost += s.quantity;
    this.note(c, `${reason} (${Math.round(s.quantity)} perdidos)`);
    this.sim.emitTrade({ type: 'shipment_lost', tick: this.sim.tick, shipmentId: s.id, contractId: c.id, seller: c.seller, buyer: c.buyer, resource: c.resource, quantity: r1(s.quantity), reason, pos: this.position(s) });
    if (c.status === 'active' || c.status === 'suspended') {
      if (c.delivered + c.lost >= c.quantity - 1e-6) this.close(c, 'fulfilled', 'Concluído com perdas no transporte');
    }
  }

  private suspend(c: TradeContract, reason: string): void {
    if (c.status === 'suspended' && c.reason === reason) return;
    c.status = 'suspended';
    c.reason = reason;
    this.note(c, `Suspenso: ${reason}`);
    this.sim.emitTrade({ type: 'contract_update', tick: this.sim.tick, contractId: c.id, seller: c.seller, buyer: c.buyer, status: c.status, text: reason });
  }

  /** Interrupção definitiva (guerra, sanções, perda da reserva): a carga a caminho do parceiro hostil é perdida. */
  private interrupt(c: TradeContract, reason: string): void {
    for (const s of this.shipments) if (s.contractId === c.id && (s.state === 'moving' || s.state === 'offmap' || s.state === 'loading')) this.lose(s, c, `Carga apreendida: ${reason}`);
    this.close(c, 'interrupted', reason);
  }

  private close(c: TradeContract, status: ContractStatus, reason: string | null): void {
    // reserva não embarcada volta ao estoque utilizável do vendedor (o que couber)
    if (!isNpcPartner(c.seller) && c.reserved > 0) {
      const back = this.sim.storeFromTrade(c.seller, c.resource, c.reserved);
      if (back < c.reserved) this.note(c, `Reserva devolvida: ${Math.round(back)} (o resto não coube no depósito e se perdeu)`);
      c.reserved = 0;
    }
    if (status === 'cancelled' || status === 'expired' || status === 'interrupted') {
      // a parte não usada da oferta/demanda volta ao país da IA
      const left = c.quantity - c.shipped;
      if (isNpcPartner(c.seller)) this.npcPool(c.seller)[c.resource].supply += left;
      if (isNpcPartner(c.buyer)) this.npcPool(c.buyer)[c.resource].demand += left;
    }
    c.status = status;
    c.reason = reason;
    this.note(c, reason ?? 'Contrato cumprido');
    this.sim.emitTrade({ type: 'contract_update', tick: this.sim.tick, contractId: c.id, seller: c.seller, buyer: c.buyer, status, text: reason ?? 'Contrato cumprido' });
  }

  private note(c: TradeContract, text: string): void {
    c.log.push({ tick: this.sim.tick, text });
    if (c.log.length > 12) c.log.shift();
  }

  /** Posição atual da carga no mapa (para desenhar e para emboscadas). */
  position(s: Shipment): Vec2 {
    if (s.state === 'loading') return { ...s.path[0]! };
    if (s.state === 'offmap' || s.state === 'delivered') return { ...s.path[s.legs[0] === 'offmap' ? 0 : s.path.length - 1]! };
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

  // -------------------------------------------------------------- países da IA

  npcPool(id: PartnerId): Record<TradeResource, NpcMarket> {
    let p = this.npc[id];
    if (!p) {
      const countryId = this.link?.npcs().find((n) => n.id === id)?.countryId ?? '';
      p = Object.fromEntries(
        TRADE_RESOURCES.map((r) => {
          const m = npcSupplyMul(countryId, r);
          return [r, { supply: Math.round(150 * m), demand: Math.round(150 / m) }];
        }),
      ) as Record<TradeResource, NpcMarket>;
      this.npc[id] = p;
    }
    return p;
  }

  /** Cotação de um país da IA para um jogador. */
  quote(npc: PartnerId, slot: Slot, r: TradeResource): { sell: number; buy: number } {
    const countryId = this.link?.npcs().find((n) => n.id === npc)?.countryId ?? '';
    return npcQuote(countryId, r, this.link?.relation(npc, slot) ?? 0);
  }

  /** Resposta de um país da IA: aceita, contrapropõe preço ou recusa — com o motivo. */
  private npcReply(o: TradeOffer): void {
    const npc = o.to;
    const player = o.from;
    if ((this.link?.relation(npc, player) ?? 0) < -20) {
      this.respond(npc, o.id, false, 'Relações diplomáticas ruins demais para negociar');
      return;
    }
    const q = this.quote(npc, player, o.resource);
    const npcSells = o.seller === npc;
    const fair = npcSells ? o.price >= q.sell * 0.97 : o.price <= q.buy * 1.03;
    const close = npcSells ? o.price >= q.sell * 0.8 : o.price <= q.buy * 1.25;
    const pool = this.npcPool(npc)[o.resource];
    const room = npcSells ? pool.supply : pool.demand;
    if (fair && room >= o.quantity) {
      const err = this.respond(npc, o.id, true);
      if (err) this.respond(npc, o.id, false, err);
      return;
    }
    if ((fair || close) && room >= 1) {
      // contraproposta: preço de mercado e quantidade que o país consegue
      const qty = Math.max(1, Math.min(o.quantity, Math.floor(room)));
      const why = !fair ? 'preço fora do mercado' : 'quantidade acima do disponível';
      const err = this.propose(npc, { partner: player, side: npcSells ? 'sell' : 'buy', resource: o.resource, quantity: qty, price: npcSells ? q.sell : q.buy, mode: o.mode, days: o.days, counterOf: o.id });
      if (err) {
        this.respond(npc, o.id, false, err);
        return;
      }
      o.reason = `Contraproposta: ${why}`;
      this.offers[this.offers.length - 1]!.reason = `Contraproposta (${why})`;
      this.sim.emitTrade({ type: 'trade_reply', tick: this.sim.tick, offerId: o.id, from: npc, to: player, accepted: false, reason: o.reason });
      return;
    }
    this.respond(npc, o.id, false, room < 1 ? 'Sem interesse neste recurso agora' : 'Preço muito distante do mercado');
  }

  /** Ofertas espontâneas: cada jogador com terminal recebe até uma oferta de um país conhecido. */
  private npcOffers(): void {
    const l = this.link;
    if (!l) return;
    const npcs = l.npcs();
    for (const p of this.sim.players) {
      if (p.defeated || this.facilities(p.slot, 'market').length === 0) continue;
      const open = npcs.filter((n) => !this.accessBlocker(p.slot, n.id));
      if (!open.length) continue;
      const k = (this.day + p.slot * 13) % (open.length * TRADE_RESOURCES.length);
      const npc = open[k % open.length]!;
      const r = TRADE_RESOURCES[Math.floor(k / open.length) % TRADE_RESOURCES.length]!;
      const pool = this.npcPool(npc.id)[r];
      const q = this.quote(npc.id, p.slot, r);
      // o país quer comprar o que lhe falta, ou vender o que lhe sobra
      const wantsBuy = pool.demand >= pool.supply;
      const room = Math.floor(wantsBuy ? pool.demand : pool.supply);
      const qty = Math.min(room, 40 + (k % 5) * 20);
      if (qty < 10) continue;
      const mode: TransportMode = this.modeBlocker(p.slot, 'sea') ? 'road' : 'sea';
      this.propose(npc.id, { partner: p.slot, side: wantsBuy ? 'buy' : 'sell', resource: r, quantity: qty, price: wantsBuy ? Math.round(q.buy * 1.05) : Math.round(q.sell * 0.97), mode, days: 180 });
    }
  }
}

export const DAY_TICKS = TICKS_PER_DAY;
const WATER = Terrain.Water;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polyLength(p: Vec2[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1]!, p[i]!);
  return s;
}

export function fmtUsd(usd: number): string {
  const m = usd / 1e6;
  if (Math.abs(m) >= 1) return `US$ ${m.toFixed(m >= 10 ? 0 : 1).replace('.', ',')} mi`;
  return `US$ ${Math.round(usd / 1000)} mil`;
}
