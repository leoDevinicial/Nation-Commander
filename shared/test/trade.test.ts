import { describe, expect, it } from "vitest";
import {
  HIGHWAY,
  ROAD,
  TICK_RATE,
  Terrain,
  type BuildingType,
} from "../sim/config.ts";
import { parseCommand, type Command } from "../sim/commands.ts";
import { Simulation } from "../sim/Simulation.ts";
import {
  REF_PRICE,
  TRADE,
  TRANSPORT,
  WORLD,
  type TradeLink,
} from "../sim/trade.ts";
import type { Building, Cell } from "../sim/types.ts";
import { flatMap } from "./helpers.ts";
import { TacticalAI } from "../sim/TacticalAI.ts";

const DAY = 20;
const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

/** Diplomacia e caixa de teste: cada jogador com US$ 100 mi. */
function link() {
  const st = {
    war: new Set<string>(),
    sanctions: new Set<string>(),
    fund: new Map<number, number>(),
    ledger: [] as { slot: number; usd: number; kind: string }[],
  };
  const k = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const l: TradeLink = {
    atWar: (a, b) => st.war.has(k(a, b)),
    sanctioned: (a, b) => st.sanctions.has(k(a, b)),
    spendable: (slot) => st.fund.get(slot) ?? 100e6,
    pay: (slot, usd, kind) => {
      st.ledger.push({ slot, usd, kind });
      st.fund.set(slot, (st.fund.get(slot) ?? 100e6) + usd);
    },
    partnerName: (id) => `Jogador ${id + 1}`,
  };
  return { st, k, link: l };
}

/** Partida plana com 3 jogadores; o 0 e o 1 têm Terminal Comercial (a ligação por estrada é opcional). */
function setup(opts: { road?: boolean; players?: 2 | 3 } = {}) {
  const map = flatMap(48);
  map.spawns.push({ cx: 3, cy: 44 });
  const sim = new Simulation({
    map,
    playerCount: opts.players ?? 3,
    startingUnits: [],
  });
  const L = link();
  sim.setTradeLink(L.link);
  const put = (type: BuildingType, owner: number, cell: Cell): Building =>
    sim.addBuilding(type, owner, cell, 1);
  const m0 = put("market", 0, { cx: 10, cy: 10 });
  const m1 = put("market", 1, { cx: 30, cy: 10 });
  if (opts.road) layRoad(sim, 10, 30, 12);
  for (const p of sim.players)
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[])
      p.resources[r] = 300;
  return { sim, ...L, put, m0, m1 };
}

/** Estrada reta (linha y) de x0 a x1, encostando embaixo dos dois terminais (2×2). */
function layRoad(
  sim: Simulation,
  x0: number,
  x1: number,
  y: number,
  highway = false,
) {
  for (let x = x0; x <= x1 + 1; x++) {
    const i = y * sim.map.width + x;
    sim.map.terrain[i] = Terrain.Road;
    sim.grid.terrain[i] = Terrain.Road;
    sim.roads.push({ i, owner: 0, ...(highway ? { hw: true as const } : {}) });
    if (highway) sim.highways.add(i);
  }
}

const sale = (
  resource: "iron" | "food" | "oil",
  quantity: number,
  priceUsd: number,
): Command => ({
  type: "trade_list",
  kind: "sale",
  items: [{ resource, quantity }],
  priceUsd,
});

describe("Comércio entre nações (02/11)", () => {
  it("anúncio: precisa de terminal, preço dentro da faixa e estoque; a venda reserva a mercadoria e a retirada a devolve", () => {
    const { sim } = setup();
    expect(sim.applyCommand(2, sale("iron", 50, 50 * REF_PRICE.iron))).toMatch(
      /Terminal Comercial/,
    );
    expect(sim.applyCommand(0, sale("iron", 50, 1))).toMatch(/Preço fora/);
    expect(
      sim.applyCommand(0, sale("iron", 900, 900 * REF_PRICE.iron)),
    ).toMatch(/Estoque insuficiente/);
    expect(
      sim.applyCommand(0, sale("iron", 100, 100 * REF_PRICE.iron)),
    ).toBeNull();
    expect(sim.players[0]!.resources.iron).toBe(200);
    const l = sim.trade.listings[0]!;
    expect(
      sim.applyCommand(1, { type: "trade_withdraw", listingId: l.id }),
    ).toMatch(/indisponível/);
    expect(
      sim.applyCommand(0, { type: "trade_withdraw", listingId: l.id }),
    ).toBeNull();
    expect(sim.players[0]!.resources.iron).toBe(300);
  });

  it("venda por caminhão: precisa de estrada contínua; dinheiro e mercadoria só mudam de mão na chegada", () => {
    const { sim, st } = setup();
    expect(sim.applyCommand(0, sale("iron", 100, 1_000_000))).toBeNull();
    const id = sim.trade.listings[0]!.id;
    expect(
      sim.applyCommand(1, { type: "trade_buy", listingId: id, mode: "road" }),
    ).toMatch(/estrada ou rodovia contínua/);
    layRoad(sim, 10, 30, 12);
    run(sim, TICK_RATE * 3); // a rota em cache expira
    const iron1 = sim.players[1]!.resources.iron;
    expect(
      sim.applyCommand(1, { type: "trade_buy", listingId: id, mode: "road" }),
    ).toBeNull();
    const ship = sim.trade.shipments[0]!;
    expect(ship.mode).toBe("road");
    run(sim, TICK_RATE * 5);
    expect(ship.state).toBe("moving");
    expect(st.ledger).toEqual([]);
    expect(sim.players[1]!.resources.iron).toBe(iron1);
    run(sim, TICK_RATE * 40);
    expect(ship.state).toBe("delivered");
    expect(sim.players[1]!.resources.iron).toBe(iron1 + 100);
    expect(st.ledger).toEqual([
      { slot: 1, usd: -1_000_000, kind: "import" },
      { slot: 0, usd: 1_000_000, kind: "export" },
    ]);
  });

  it("rodovia: o caminhão anda mais rápido que na estrada comum", () => {
    const time = (highway: boolean) => {
      const { sim } = setup();
      layRoad(sim, 10, 30, 12, highway);
      sim.applyCommand(0, sale("iron", 50, 500_000));
      sim.applyCommand(1, {
        type: "trade_buy",
        listingId: sim.trade.listings[0]!.id,
        mode: "road",
      });
      const s = sim.trade.shipments[0]!;
      let t = 0;
      while (s.state !== "delivered" && t < TICK_RATE * 120) {
        sim.step();
        t++;
      }
      return t;
    };
    const road = time(false);
    const hw = time(true);
    expect(hw).toBeLessThan(
      road * (ROAD.convoyMul / HIGHWAY.convoyMul) +
        TICK_RATE * TRADE.loadSeconds +
        5,
    );
  });

  it("avião: aeroporto dos dois lados (Base Aérea ou QG nível 4), linha reta, carga pequena por voo", () => {
    const { sim, put } = setup();
    sim.applyCommand(0, sale("iron", 120, 1_200_000));
    const id = sim.trade.listings[0]!.id;
    expect(
      sim.applyCommand(1, { type: "trade_buy", listingId: id, mode: "air" }),
    ).toMatch(/Base Aérea|QG/);
    put("airbase", 0, { cx: 4, cy: 20 });
    put("airbase", 1, { cx: 38, cy: 20 });
    run(sim, TICK_RATE * 3);
    expect(
      sim.applyCommand(1, { type: "trade_buy", listingId: id, mode: "air" }),
    ).toBeNull();
    // 120 em aviões de 50: três voos, cada um paga a sua parte
    expect(sim.trade.shipments.map((s) => s.units)).toEqual([50, 50, 20]);
    expect(sim.trade.shipments[0]!.path).toHaveLength(2);
    run(sim, TICK_RATE * 30);
    expect(sim.trade.shipments.every((s) => s.state === "delivered")).toBe(
      true,
    );
    expect(sim.players[1]!.resources.iron).toBe(420);
  });

  it("contrato: X a cada N dias por US$ Z/mês; cai por força maior quando o fornecedor não tem o estoque", () => {
    const { sim, st } = setup({ road: true });
    sim.players[1]!.resources.food = 0; // espaço para receber
    sim.players[1]!.resources.iron = 0;
    expect(
      sim.applyCommand(0, {
        type: "trade_list",
        kind: "contract",
        items: [
          { resource: "iron", quantity: 100 },
          { resource: "food", quantity: 50 },
        ],
        priceUsd: 1_500_000,
        everyDays: 30,
      }),
    ).toBeNull();
    const l = sim.trade.listings[0]!;
    // o contrato não reserva nada: o estoque sai a cada entrega
    expect(sim.players[0]!.resources.iron).toBe(300);
    expect(
      sim.applyCommand(1, { type: "trade_buy", listingId: l.id, mode: "road" }),
    ).toBeNull();
    const c = sim.trade.contracts[0]!;
    expect(c.deliveries).toBe(1);
    expect(sim.players[0]!.resources.iron).toBe(200);
    run(sim, DAY * 30);
    expect(c.deliveries).toBe(2);
    // pago por entrega (mensalidade × 30/30), só na chegada
    expect(
      st.ledger.filter((x) => x.slot === 0).reduce((a, x) => a + x.usd, 0),
    ).toBe(1_500_000);
    run(sim, DAY * 40);
    expect(c.deliveries).toBe(3);
    expect(sim.players[0]!.resources.iron).toBe(0);
    run(sim, DAY * 31);
    expect(c.status).toBe("ended");
    expect(c.reason).toMatch(/não tinha 100 de ferro/);
  });

  it("contrato cai quando o comprador não tem caixa para a entrega; qualquer parte pode encerrar", () => {
    const { sim, st } = setup({ road: true });
    sim.applyCommand(0, {
      type: "trade_list",
      kind: "contract",
      items: [{ resource: "iron", quantity: 50 }],
      priceUsd: 600_000,
      everyDays: 20,
    });
    sim.applyCommand(1, {
      type: "trade_buy",
      listingId: sim.trade.listings[0]!.id,
      mode: "road",
    });
    const c = sim.trade.contracts[0]!;
    st.fund.set(1, 100_000);
    run(sim, DAY * 21);
    expect(c.status).toBe("ended");
    expect(c.reason).toMatch(/sem caixa/);
    st.fund.set(1, 100e6);
    sim.applyCommand(0, {
      type: "trade_list",
      kind: "contract",
      items: [{ resource: "iron", quantity: 50 }],
      priceUsd: 600_000,
      everyDays: 20,
    });
    sim.applyCommand(1, {
      type: "trade_buy",
      listingId: sim.trade.listings.at(-1)!.id,
      mode: "road",
    });
    const c2 = sim.trade.contracts.at(-1)!;
    expect(
      sim.applyCommand(2, { type: "trade_cancel", contractId: c2.id }),
    ).toMatch(/inválido/);
    expect(
      sim.applyCommand(1, { type: "trade_cancel", contractId: c2.id }),
    ).toBeNull();
    expect(c2.status).toBe("ended");
  });

  it("guerra: não se compra de inimigo, a carga a caminho é apreendida e o contrato cai", () => {
    const { sim, st } = setup({ road: true });
    sim.applyCommand(0, {
      type: "trade_list",
      kind: "contract",
      items: [{ resource: "iron", quantity: 50 }],
      priceUsd: 600_000,
      everyDays: 20,
    });
    sim.applyCommand(1, {
      type: "trade_buy",
      listingId: sim.trade.listings[0]!.id,
      mode: "road",
    });
    run(sim, TICK_RATE * 5);
    st.war.add("0:1");
    sim.setWar(0, 1, true);
    expect(sim.trade.contracts[0]!.status).toBe("ended");
    expect(sim.trade.shipments[0]!.state).toBe("lost");
    expect(st.ledger).toEqual([]);
    sim.applyCommand(0, sale("iron", 50, 500_000));
    expect(
      sim.applyCommand(1, {
        type: "trade_buy",
        listingId: sim.trade.listings.at(-1)!.id,
        mode: "road",
      }),
    ).toMatch(/Em guerra/);
  });

  it("emboscada: tropa de quem está em guerra com o comprador destrói o caminhão no caminho; ninguém paga", () => {
    const { sim, st } = setup({ road: true });
    st.war.add("1:2");
    sim.setWar(1, 2, true);
    sim.addUnit("infantry", 2, sim.grid.cellCenter({ cx: 20, cy: 13 }));
    sim.applyCommand(0, sale("iron", 100, 1_000_000));
    sim.applyCommand(1, {
      type: "trade_buy",
      listingId: sim.trade.listings[0]!.id,
      mode: "road",
    });
    run(sim, TICK_RATE * 40);
    const s = sim.trade.shipments[0]!;
    expect(s.state).toBe("lost");
    expect(s.reason).toMatch(/Comboio destruído/);
    expect(st.ledger).toEqual([]);
  });

  it("mercado mundial: preço pior que o de referência, limite diário e pagamento na chegada pela borda do mapa", () => {
    const { sim, st } = setup();
    const q = sim.trade.worldQuote(0, "food");
    expect(q.buy).toBeGreaterThan(REF_PRICE.food);
    expect(q.sell).toBeLessThan(REF_PRICE.food);
    expect(
      sim.applyCommand(0, {
        type: "trade_world",
        side: "buy",
        resource: "food",
        quantity: TRADE.worldDailyUnits + 1,
        mode: "road",
      }),
    ).toMatch(/Quantidade/);
    expect(
      sim.applyCommand(0, {
        type: "trade_world",
        side: "sell",
        resource: "food",
        quantity: 200,
        mode: "road",
      }),
    ).toBeNull();
    expect(sim.players[0]!.resources.food).toBe(100);
    expect(
      sim.applyCommand(0, {
        type: "trade_world",
        side: "sell",
        resource: "food",
        quantity: 150,
        mode: "road",
      }),
    ).toMatch(/só negocia mais 100/);
    const s = sim.trade.shipments[0]!;
    expect(s.buyer).toBe(WORLD);
    expect(st.ledger).toEqual([]);
    run(sim, TICK_RATE * (TRANSPORT.road.offmapSeconds + 40));
    expect(s.state).toBe("delivered");
    // 200 em dois caminhões de até 150: cada um paga a sua parte
    expect(st.ledger.every((x) => x.slot === 0 && x.kind === "export")).toBe(
      true,
    );
    expect(st.ledger.reduce((t, x) => t + x.usd, 0)).toBe(200 * q.sell);
    // compra: vem de fora do mapa e paga na chegada
    run(sim, DAY);
    expect(
      sim.applyCommand(0, {
        type: "trade_world",
        side: "buy",
        resource: "iron",
        quantity: 50,
        mode: "road",
      }),
    ).toBeNull();
    const b = sim.trade.shipments.at(-1)!;
    expect(b.state).toBe("offmap");
    run(sim, TICK_RATE * (TRANSPORT.road.offmapSeconds + 40));
    expect(b.state).toBe("delivered");
    expect(st.ledger.at(-1)).toEqual({
      slot: 0,
      usd: -50 * Math.round(REF_PRICE.iron * TRADE.worldBuyMul),
      kind: "import",
    });
  });

  it("salvar e carregar no meio de um contrato continua igual", () => {
    const { sim } = setup({ road: true });
    sim.applyCommand(0, {
      type: "trade_list",
      kind: "contract",
      items: [{ resource: "iron", quantity: 50 }],
      priceUsd: 600_000,
      everyDays: 20,
    });
    sim.applyCommand(1, {
      type: "trade_buy",
      listingId: sim.trade.listings[0]!.id,
      mode: "road",
    });
    sim.applyCommand(0, sale("food", 40, 200_000));
    run(sim, TICK_RATE * 7);
    const copy = Simulation.fromSave(sim.toSave());
    copy.setTradeLink(sim.trade.link);
    run(sim, DAY * 25);
    run(copy, DAY * 25);
    expect(JSON.stringify(copy.trade.toSave())).toBe(
      JSON.stringify(sim.trade.toSave()),
    );
  });

  it("comandos validados no servidor", () => {
    expect(
      parseCommand({
        type: "trade_list",
        kind: "sale",
        items: [{ resource: "iron", quantity: 10 }],
        priceUsd: 100,
      }),
    ).not.toBeNull();
    expect(
      parseCommand({
        type: "trade_list",
        kind: "leilão",
        items: [{ resource: "iron", quantity: 10 }],
        priceUsd: 100,
      }),
    ).toBeNull();
    expect(
      parseCommand({
        type: "trade_list",
        kind: "sale",
        items: [{ resource: "ouro", quantity: 10 }],
        priceUsd: 100,
      }),
    ).toBeNull();
    expect(
      parseCommand({
        type: "trade_list",
        kind: "sale",
        items: [],
        priceUsd: 100,
      }),
    ).toBeNull();
    expect(
      parseCommand({ type: "trade_buy", listingId: 3, mode: "rail" }),
    ).toBeNull();
    expect(
      parseCommand({
        type: "trade_world",
        side: "buy",
        resource: "coal",
        quantity: 10,
        mode: "sea",
      }),
    ).not.toBeNull();
    expect(
      parseCommand({
        type: "build_road",
        cells: [{ cx: 1, cy: 1 }],
        highway: true,
      }),
    ).toEqual({ type: "build_road", cells: [{ cx: 1, cy: 1 }], highway: true });
  });
});

describe("IA no comércio (02/11)", () => {
  it("a IA anuncia a sobra e compra de outra nação o recurso que lhe falta", () => {
    const { sim, put } = setup({ road: true });
    // P0 (IA) com armazém cheio de ferro; P1 (IA) quase sem comida
    put("warehouse", 0, { cx: 4, cy: 16 });
    sim.players[0]!.resources.iron = 1500;
    const ai0 = new TacticalAI(0);
    const list = ai0.think(sim).find((c) => c.type === "trade_list");
    expect(list).toMatchObject({
      type: "trade_list",
      kind: "sale",
      items: [{ resource: "iron" }],
    });
    expect(sim.applyCommand(0, list!)).toBeNull();
    // o comprador precisa do recurso: ferro abaixo de 20% da capacidade, com espaço
    put("warehouse", 1, { cx: 36, cy: 16 });
    sim.players[1]!.resources.iron = 10;
    run(sim, TICK_RATE * 3);
    const buy = new TacticalAI(1)
      .think(sim)
      .find((c) => c.type === "trade_buy");
    expect(buy).toMatchObject({
      type: "trade_buy",
      listingId: sim.trade.listings[0]!.id,
      mode: "road",
    });
    expect(sim.applyCommand(1, buy!)).toBeNull();
  });
});

describe("Rodovia (02/11)", () => {
  it("sai do território sem engenheiro, nunca entra em país em guerra, vira rodovia sobre a estrada própria e não leva energia", () => {
    const { sim } = setup({ players: 2 });
    const W = sim.map.width;
    // terra neutra no meio do mapa: estrada comum precisa de engenheiro; rodovia, não
    const cells = [20, 21, 22].map((cx) => ({ cx, cy: 24 }));
    expect(sim.territoryOwner(20, 24)).toBe(-1);
    expect(sim.roadPlan(0, cells).error).toMatch(/Engenheiro/);
    expect(sim.highwayPlan(0, cells).error).toBeNull();
    expect(
      sim.applyCommand(0, { type: "build_road", cells, highway: true }),
    ).toBeNull();
    expect(sim.isHighway(24 * W + 21)).toBe(true);
    // território do outro jogador: só em paz
    const hq1 = sim.hqOf(1)!;
    const inside = [{ cx: hq1.cell.cx - 2, cy: hq1.cell.cy + 4 }];
    expect(sim.territoryOwner(inside[0]!.cx, inside[0]!.cy)).toBe(1);
    sim.setWar(0, 1, true);
    expect(sim.highwayPlan(0, inside).error).toMatch(/inimigo/);
    sim.setWar(0, 1, false);
    expect(sim.highwayPlan(0, inside).error).toBeNull();
    // custo de manutenção em dobro
    expect(sim.roadCount(0)).toBe(3 * HIGHWAY.upkeepCells);
  });

  it("tropas andam mais rápido na rodovia", () => {
    const go = (highway: boolean) => {
      const { sim } = setup({ players: 2 });
      layRoad(sim, 4, 40, 30, highway);
      const u = sim.addUnit(
        "infantry",
        0,
        sim.grid.cellCenter({ cx: 6, cy: 30 }),
      );
      sim.applyCommand(0, {
        type: "move",
        unitIds: [u.id],
        x: sim.grid.cellCenter({ cx: 38, cy: 30 }).x,
        y: sim.grid.cellCenter({ cx: 38, cy: 30 }).y,
      });
      run(sim, TICK_RATE * 6);
      return u.pos.x;
    };
    expect(go(true)).toBeGreaterThan(go(false) + 2);
  });
});
