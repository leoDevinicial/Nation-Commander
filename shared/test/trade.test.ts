import { describe, expect, it } from 'vitest';
import { TICK_RATE, Terrain, type BuildingType } from '../sim/config.ts';
import { parseCommand } from '../sim/commands.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TRADE, TRANSPORT, type TradeLink } from '../sim/trade.ts';
import type { Building } from '../sim/types.ts';
import { flatMap } from './helpers.ts';

const DAY = 20;
const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

/** Diplomacia e tesouro de teste. */
function link() {
  const st = { war: new Set<string>(), sanctions: new Set<string>(), unknown: new Set<string>(), ledger: [] as { slot: number; usd: number; d: string }[], relation: 0, debt: 50 };
  const k = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const l: TradeLink = {
    npcs: () => [
      { id: 100, countryId: 'AUS' },
      { id: 101, countryId: 'JPN' },
    ],
    knows: (a, b) => !st.unknown.has(k(a, b)),
    atWar: (a, b) => st.war.has(k(a, b)),
    sanctioned: (a, b) => st.sanctions.has(k(a, b)),
    relation: () => st.relation,
    atWarAny: (a) => [...st.war].some((x) => x.split(':').includes(String(a))),
    debtPctGdp: () => st.debt,
    pay: (slot, usd, d) => void st.ledger.push({ slot, usd, d }),
    partnerName: (id) => (id === 100 ? 'Austrália' : id === 101 ? 'Japão' : `Jogador ${id + 1}`),
  };
  return { st, k, link: l };
}

/** Partida plana com terminal comercial, silo e tanque prontos para o jogador 0. */
function setup(opts: { wall?: boolean; types?: BuildingType[] } = {}) {
  const map = flatMap(40, (set) => {
    if (opts.wall) for (let x = 0; x < 40; x++) set(x, 38, Terrain.Rock); // isola a borda sul (saída para o Japão)
  });
  const sim = new Simulation({ map, playerCount: 2, startingUnits: [] });
  const L = link();
  sim.setTradeLink(L.link);
  const p = sim.players[0]!;
  const place = (type: BuildingType): Building => {
    for (let cy = 1; cy < 14; cy++)
      for (let cx = 2; cx < 14; cx++) if (sim.applyCommand(0, { type: 'build', buildingType: type, cx, cy }) === null) return sim.buildings.find((b) => b.type === type && b.owner === 0 && b.cell.cx === cx && b.cell.cy === cy)!;
    throw new Error(`sem lugar para ${type}`);
  };
  for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 400;
  const built: Partial<Record<BuildingType, Building>> = {};
  for (const t of opts.types ?? ['market', 'silo', 'oil_tank']) built[t] = place(t);
  run(sim, 20 * TICK_RATE);
  // estoque controlado: 200 de ferro no armazém inicial
  p.resources.iron = 200;
  return { sim, p, ...L, built };
}

/** Preço que o Japão (101) paga pelo ferro: a venda é aceita. */
const JP = (sim: Simulation) => sim.trade.quote(101, 0, 'iron').buy;

const sell = (partner: number, quantity: number, price: number, extra: Partial<{ mode: 'road' | 'rail' | 'sea' | 'air'; days: number; resource: 'iron' | 'food' | 'oil' }> = {}) =>
  ({ type: 'trade_offer', partner, side: 'sell', resource: extra.resource ?? 'iron', quantity, price, mode: extra.mode ?? 'road', days: extra.days ?? 120 }) as const;
const buy = (partner: number, quantity: number, price: number, extra: Partial<{ mode: 'road' | 'rail' | 'sea' | 'air'; resource: 'iron' | 'food' }> = {}) =>
  ({ type: 'trade_offer', partner, side: 'buy', resource: extra.resource ?? 'iron', quantity, price, mode: extra.mode ?? 'road', days: 120 }) as const;

describe('Fase 6 — ofertas e contratos', () => {
  it('recusa propostas inválidas com o motivo (sem terminal, sem contato, guerra, sanções, limites)', () => {
    const { sim, st, k } = setup({ types: [] });
    expect(sim.applyCommand(0, sell(100, 50, 60_000))).toMatch(/Terminal Comercial/);
    const s2 = setup();
    st.unknown.add(k(0, 101));
    s2.st.unknown.add(s2.k(0, 101));
    expect(s2.sim.applyCommand(0, sell(101, 50, 60_000))).toMatch(/Sem contato/);
    s2.st.war.add(s2.k(0, 100));
    expect(s2.sim.applyCommand(0, sell(100, 50, 60_000))).toMatch(/guerra/);
    s2.st.war.clear();
    s2.st.sanctions.add(s2.k(0, 100));
    expect(s2.sim.applyCommand(0, sell(100, 50, 60_000))).toMatch(/Sanções/);
    s2.st.sanctions.clear();
    expect(s2.sim.applyCommand(0, sell(100, 0, 60_000))).toMatch(/Quantidade/);
    expect(s2.sim.applyCommand(0, sell(100, 10, 60_000, { days: 10 }))).toMatch(/Prazo/);
    expect(s2.sim.applyCommand(0, sell(100, 10, 60_000, { mode: 'rail' }))).toMatch(/Estação Ferroviária/);
    expect(s2.sim.applyCommand(0, sell(100, 10, 60_000, { mode: 'air' }))).toMatch(/nível 4/);
  });

  it('estoque insuficiente impede o contrato; a reserva impede vender a mesma mercadoria duas vezes', () => {
    const { sim, p } = setup();
    expect(sim.applyCommand(0, sell(101, 150, JP(sim)))).toBeNull();
    expect(sim.applyCommand(0, sell(100, 150, sim.trade.quote(100, 0, 'iron').buy))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 1) * DAY);
    const [c1, c2] = [sim.trade.offers[0]!, sim.trade.offers[1]!];
    // (a Austrália compra pouco ferro: a segunda também cairia por demanda — o motivo é o estoque, verificado antes)
    // a primeira foi aceita e reservou 150; a segunda já não tem estoque
    expect(c1.status).toBe('accepted');
    expect(p.resources.iron).toBe(50);
    expect(c2.status).toBe('rejected');
    expect(c2.reason).toMatch(/Estoque insuficiente/);
  });

  it('exportação completa: reserva, embarque, trajeto, trecho fora do mapa, entrega e pagamento', () => {
    const { sim, p, st } = setup();
    const price = JP(sim);
    expect(sim.applyCommand(0, sell(101, 100, price))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 1) * DAY);
    const c = sim.trade.contracts[0]!;
    expect(c.status).toBe('active');
    expect(p.resources.iron).toBe(100); // 100 reservados saíram do estoque utilizável
    expect(c.reserved + c.shipped).toBe(100);
    run(sim, 2 * DAY);
    const lots = sim.trade.shipments;
    expect(lots.length).toBe(2); // 60 + 40: capacidade do caminhão
    expect(lots.map((s) => s.quantity)).toEqual([60, 40]);
    expect(lots.every((s) => s.state === 'loading' || s.state === 'moving')).toBe(true);
    expect(st.ledger.filter((x) => x.d.startsWith('Frete')).reduce((t, x) => t + x.usd, 0)).toBe(-100 * TRANSPORT.road.costPerUnit);
    // nada é pago antes de chegar
    expect(st.ledger.some((x) => x.d.startsWith('Exportação'))).toBe(false);
    run(sim, 120 * TICK_RATE);
    expect(c.status).toBe('fulfilled');
    expect(c.delivered).toBe(100);
    expect(st.ledger.filter((x) => x.d.startsWith('Exportação')).reduce((a, x) => a + x.usd, 0)).toBe(100 * price);
    expect(p.resources.iron).toBe(100); // o estoque nunca volta nem duplica
  });

  it('importação: a carga só entra no estoque ao chegar e se houver espaço', () => {
    const { sim, p, st } = setup();
    const cap = sim.capacity(0).iron;
    p.resources.iron = cap - 20; // só cabem 20
    const q = sim.trade.quote(100, 0, 'iron');
    expect(sim.applyCommand(0, buy(100, 20, q.sell))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 1) * DAY);
    expect(sim.trade.contracts[0]!.status).toBe('active');
    run(sim, DAY);
    const s = sim.trade.shipments[0]!;
    expect(s.state).toBe('offmap');
    expect(p.resources.iron).toBe(cap - 20);
    p.resources.iron = cap - 5; // o espaço diminuiu durante a viagem
    run(sim, 80 * TICK_RATE);
    expect(p.resources.iron).toBe(cap);
    expect(s.state).toBe('waiting_capacity');
    expect(s.quantity).toBe(15);
    p.resources.iron = cap - 100;
    run(sim, 2 * TICK_RATE);
    expect(s.state).toBe('delivered');
    expect(p.resources.iron).toBe(cap - 85);
    expect(sim.trade.contracts[0]!.status).toBe('fulfilled');
    expect(st.ledger.filter((x) => x.d.startsWith('Importação')).reduce((a, x) => a + x.usd, 0)).toBe(-20 * q.sell);
  });

  it('rota bloqueada não vira transporte instantâneo: o contrato fica suspenso e expira no prazo', () => {
    const { sim, p } = setup({ wall: true });
    expect(sim.applyCommand(0, sell(101, 50, JP(sim), { days: 60 }))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 2) * DAY);
    const c = sim.trade.contracts[0]!;
    expect(c.status).toBe('suspended');
    expect(c.reason).toMatch(/Rota terrestre bloqueada/);
    expect(sim.trade.shipments).toHaveLength(0);
    run(sim, 60 * DAY);
    expect(c.status).toBe('expired');
    expect(c.delivered).toBe(0);
    expect(p.resources.iron).toBe(200); // a reserva volta ao estoque
  });

  it('guerra interrompe o contrato e a carga a caminho é apreendida', () => {
    const { sim, st, k } = setup();
    expect(sim.applyCommand(0, sell(101, 100, JP(sim)))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 3) * DAY);
    const c = sim.trade.contracts[0]!;
    expect(sim.trade.shipments.length).toBeGreaterThan(0);
    st.war.add(k(0, 101));
    run(sim, DAY);
    expect(c.status).toBe('interrupted');
    expect(c.reason).toMatch(/Guerra/);
    expect(sim.trade.shipments.every((s) => s.state === 'lost')).toBe(true);
    expect(st.ledger.some((x) => x.d.startsWith('Exportação'))).toBe(false);
  });

  it('depósito de origem destruído antes da retirada: redireciona se houver outro, senão a reserva se perde', () => {
    // rota bloqueada segura a carga no depósito (suspenso), como um atraso qualquer
    const { sim } = setup({ wall: true, types: ['market', 'silo', 'silo'] });
    const p = sim.players[0]!;
    p.resources.food = 140;
    expect(sim.applyCommand(0, sell(101, 60, sim.trade.quote(101, 0, 'food').buy, { resource: 'food', days: 200 }))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 2) * DAY);
    const c = sim.trade.contracts[0]!;
    expect(c.status).toBe('suspended');
    const first = sim.entities.get(c.depotId!) as Building;
    first.hp = 0;
    run(sim, 2 * DAY);
    expect(c.log.some((x) => /redirecionada/.test(x.text))).toBe(true);
    expect(c.depotId).not.toBe(first.id);
    ;(sim.entities.get(c.depotId!) as Building).hp = 0;
    run(sim, (TRADE.redirectDelaySeconds + 2) * TICK_RATE);
    expect(c.status).toBe('interrupted');
    expect(c.reason).toMatch(/Depósito de origem destruído/);
    expect(c.lost).toBe(60);
  });

  it('contraproposta de preço do país da IA', () => {
    const { sim } = setup();
    const q = sim.trade.quote(101, 0, 'iron');
    expect(sim.applyCommand(0, sell(101, 30, Math.round(q.buy * 1.15)))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 1) * DAY);
    const [orig, counter] = sim.trade.offers;
    expect(orig!.status).toBe('countered');
    expect(counter!.from).toBe(101);
    expect(counter!.price).toBe(q.buy);
    expect(sim.applyCommand(0, { type: 'trade_respond', offerId: counter!.id, accept: true })).toBeNull();
    expect(sim.trade.contracts[0]!.price).toBe(q.buy);
  });

  it('infraestrutura muda o fluxo: estação ferroviária leva lotes maiores e entrega antes', () => {
    const road = setup();
    const rail = setup({ types: ['market', 'rail_station'] });
    for (const s of [road, rail]) s.p.resources.iron = 200;
    expect(road.sim.applyCommand(0, sell(101, 150, JP(road.sim)))).toBeNull();
    expect(rail.sim.applyCommand(0, sell(101, 150, JP(rail.sim), { mode: 'rail' }))).toBeNull();
    for (const s of [road, rail]) run(s.sim, (TRADE.npcReplyDays + 2) * DAY);
    expect(rail.sim.trade.shipments.map((x) => x.quantity)).toEqual([150]);
    expect(road.sim.trade.shipments.map((x) => x.quantity)).toEqual([60, 60]); // 2 embarques por terminal
    let t = 0;
    while (rail.sim.trade.contracts[0]!.status !== 'fulfilled' && t++ < 4000) rail.sim.step();
    let u = 0;
    while (road.sim.trade.contracts[0]!.status !== 'fulfilled' && u++ < 8000) road.sim.step();
    expect(t).toBeLessThan(u);
    expect(rail.st.ledger.find((x) => x.d.startsWith('Frete'))!.usd).toBe(-150 * TRANSPORT.rail.costPerUnit);
  });

  it('o comércio persiste no salvar/carregar e continua igual', () => {
    const { sim, link: l } = setup();
    expect(sim.applyCommand(0, sell(101, 100, JP(sim)))).toBeNull();
    run(sim, (TRADE.npcReplyDays + 3) * DAY);
    const copy = Simulation.deserialize(sim.serialize());
    copy.setTradeLink(l);
    expect(copy.trade.contracts).toEqual(sim.trade.contracts);
    run(sim, 30 * TICK_RATE);
    run(copy, 30 * TICK_RATE);
    expect(copy.trade.toSave()).toEqual(sim.trade.toSave());
  });

  it('valida a forma dos comandos de comércio', () => {
    expect(parseCommand(sell(100, 5, 1000))).toEqual(sell(100, 5, 1000));
    expect(parseCommand({ ...sell(100, 5, 1000), resource: 'gold' })).toBeNull();
    expect(parseCommand({ ...sell(100, 5, 1000), mode: 'teleport' })).toBeNull();
    expect(parseCommand({ type: 'trade_respond', offerId: 3, accept: 'sim' })).toBeNull();
    expect(parseCommand({ type: 'trade_cancel', contractId: 2 })).toEqual({ type: 'trade_cancel', contractId: 2 });
  });
});
