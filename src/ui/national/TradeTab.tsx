import { useState } from 'react';
import { Plane, Ship, Truck, type LucideIcon } from 'lucide-react';
import type { NationView } from '../../../shared/protocol.ts';
import type { Command } from '../../../shared/sim/commands.ts';
import type { ListingView, ShipmentView, TradeView } from '../../../shared/sim/snapshot.ts';
import {
  REF_PRICE,
  TRADE,
  TRADE_RESOURCES,
  TRANSPORT,
  TRANSPORT_MODES,
  WORLD,
  refValue,
  type TradeContract,
  type TradeItem,
  type TradeResource,
  type TransportMode,
} from '../../../shared/sim/trade.ts';
import { RESOURCE_LABELS } from '../../../shared/sim/config.ts';
import { formatUsd } from '../../lib/format.ts';
import { gameClient } from '../../net/client.ts';
import { useHudStore } from '../../state/useHudStore.ts';

const send = (cmd: Command) => gameClient.send({ t: 'cmd', cmd });
const RES = (r: TradeResource) => RESOURCE_LABELS[r] ?? r;
const MODE_ICON: Record<TransportMode, LucideIcon> = {
  road: Truck,
  sea: Ship,
  air: Plane,
};
/** Ícone do meio de transporte (Sala de Situação: sem emojis). */
function ModeIcon({ mode }: { mode: TransportMode }) {
  const Icon = MODE_ICON[mode];
  return <Icon size={13} className="inline-block shrink-0 align-[-2px]" aria-hidden />;
}
const items = (list: readonly TradeItem[]) => list.map((i) => `${Math.round(i.quantity)} ${RES(i.resource)}`).join(' + ');

const SHIP_STATE: Record<string, string> = {
  queued: 'na fila do terminal',
  loading: 'carregando',
  moving: 'a caminho',
  offmap: 'fora do mapa',
  waiting_capacity: 'aguardando espaço no depósito',
};

interface Partner {
  id: number;
  name: string;
  known: boolean;
}

/**
 * Comércio (02/11): anúncios entre as nações da partida (venda simples ou contrato), compra escolhendo o transporte
 * (caminhão pela rodovia, navio entre portos, avião entre aeroportos), contratos, cargas a caminho e o mercado mundial.
 * Tudo pelo caixa do país; o dinheiro e a mercadoria só mudam de mão quando a carga chega. O servidor revalida tudo.
 */
export function TradeTab({ nation, mySlot, partners }: { nation: NationView; mySlot: number; partners: Partner[] }) {
  const trade = useHudStore((s) => s.trade);
  const tick = useHudStore((s) => s.tick);
  const nameOf = (id: number) => (id === WORLD ? 'Mercado mundial' : id === mySlot ? 'Você' : (partners.find((p) => p.id === id)?.name ?? `Jogador ${id + 1}`));
  if (!trade) return <p className="text-sm text-ink-400">Aguardando dados de comércio…</p>;
  const noMarket = trade.modes.road.blocker?.includes('Terminal Comercial') ? trade.modes.road.blocker : null;
  const others = trade.listings.filter((l) => l.seller !== mySlot && l.status === 'open');
  const own = trade.listings.filter((l) => l.seller === mySlot).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.id - a.id);
  const contracts = [...trade.contracts].sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || b.id - a.id);
  const ships = trade.shipments.filter((s) => s.items);

  return (
    <div className="space-y-3 text-xs">
      <section className="rounded border border-ink-700 bg-ink-900 p-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-ink-100">Comércio do país</span>
          <span className="font-mono text-ink-200">
            vendas <span className="text-signal-green">+{formatUsd(nation.trade?.exportsUsd ?? 0)}</span> · compras <span className="text-red-300">−{formatUsd(nation.trade?.importsUsd ?? 0)}</span>
          </span>
        </div>
        <p className="mt-1 text-[11px] text-ink-400">
          Tudo passa pelo caixa do país. O dinheiro e a mercadoria só mudam de mão quando a carga chega; no caminho, quem está em guerra com uma das partes pode destruí-la.
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {TRANSPORT_MODES.map((m) => (
            <div
              key={m}
              className={`rounded border px-1.5 py-1 ${trade.modes[m].blocker ? 'border-ink-700 text-ink-400' : 'border-signal-green/40 text-ink-100'}`}
              title={trade.modes[m].blocker ?? `${TRANSPORT[m].needs}. ${TRANSPORT[m].risk}`}
            >
              <div className="font-semibold">
                <ModeIcon mode={m} /> {TRANSPORT[m].label}
              </div>
              <div className="text-[10px]">{trade.modes[m].blocker ? 'indisponível' : `${TRANSPORT[m].capacity}/viagem · ${trade.modes[m].limit} ao mesmo tempo`}</div>
            </div>
          ))}
        </div>
        {noMarket && <p className="mt-1.5 text-brass-400">{noMarket}</p>}
      </section>

      <Section title={`Anúncios de outras nações (${others.length})`}>
        {others.length === 0 && <p className="text-ink-400">Nenhum anúncio aberto agora. Nações em guerra com você não aparecem.</p>}
        {others.map((l) => (
          <ListingCard key={l.id} l={l} nameOf={nameOf} tick={tick}>
            {TRANSPORT_MODES.map((m) => {
              const why = l.blockers?.[m] ?? null;
              return (
                <button
                  key={m}
                  className={`btn px-2 py-1 text-xs ${why ? '' : 'btn-primary'}`}
                  disabled={!!why}
                  title={why ?? `Comprar e receber por ${TRANSPORT[m].label.toLowerCase()}`}
                  onClick={() => send({ type: 'trade_buy', listingId: l.id, mode: m })}
                >
                  <ModeIcon mode={m} /> {l.kind === 'sale' ? 'Comprar' : 'Assinar'}
                </button>
              );
            })}
          </ListingCard>
        ))}
      </Section>

      <Section title="Anunciar">
        <ListingForm trade={trade} disabled={noMarket} />
      </Section>

      {own.length > 0 && (
        <Section title="Meus anúncios">
          {own.map((l) => (
            <ListingCard key={l.id} l={l} nameOf={nameOf} tick={tick}>
              {l.status === 'open' ? (
                <button className="btn px-2 py-1 text-xs" onClick={() => send({ type: 'trade_withdraw', listingId: l.id })} title={l.kind === 'sale' ? 'A mercadoria reservada volta ao estoque' : ''}>
                  Retirar
                </button>
              ) : (
                <span className="text-[11px] text-ink-400">
                  {l.status === 'sold' ? `${l.kind === 'sale' ? 'Vendido' : 'Contrato fechado'} com ${nameOf(l.buyer ?? -1)}` : l.status === 'expired' ? 'Expirou' : 'Retirado'}
                </span>
              )}
            </ListingCard>
          ))}
        </Section>
      )}

      <Section title={`Contratos (${contracts.filter((c) => c.status === 'active').length} ativos)`}>
        {contracts.length === 0 && <p className="text-ink-400">Nenhum contrato. Assine um anúncio de contrato ou publique o seu.</p>}
        {contracts.map((c) => (
          <ContractCard key={c.id} c={c} mySlot={mySlot} nameOf={nameOf} tick={tick} />
        ))}
      </Section>

      {ships.length > 0 && (
        <Section title={`Cargas a caminho (${ships.length})`}>
          {ships.map((s) => (
            <ShipmentRow key={s.id} s={s} mySlot={mySlot} nameOf={nameOf} />
          ))}
        </Section>
      )}

      <Section title="Mercado mundial (países de fora da partida)">
        <WorldMarket trade={trade} disabled={noMarket} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/** Preço do anúncio comparado à referência (o quanto acima ou abaixo). */
function vsRef(l: { kind: string; items: TradeItem[]; priceUsd: number; everyDays: number }): string {
  const perDelivery = l.kind === 'contract' ? (l.priceUsd * l.everyDays) / 30 : l.priceUsd;
  const pct = Math.round((perDelivery / refValue(l.items) - 1) * 100);
  return pct === 0 ? 'no preço de referência' : `${pct > 0 ? '+' : ''}${pct}% da referência`;
}

function ListingCard({ l, nameOf, tick, children }: { l: ListingView; nameOf: (id: number) => string; tick: number; children: React.ReactNode }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-ink-100">
          {l.kind === 'sale' ? 'Venda' : 'Contrato'}: {items(l.items)}
          {l.kind === 'contract' ? ` a cada ${l.everyDays} dias` : ''}
        </span>
        <span className="font-mono text-ink-200">
          {formatUsd(l.priceUsd)}
          {l.kind === 'contract' ? '/mês' : ''}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-ink-400">
        {nameOf(l.seller)} · {vsRef(l)}
        {l.status === 'open' ? ` · aberto por mais ${Math.max(0, Math.ceil((l.expiresTick - tick) / 20))} dias` : ''}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

const DAYS = [20, 30, 60, 90] as const;

function ListingForm({ trade, disabled }: { trade: TradeView; disabled: string | null }) {
  const [kind, setKind] = useState<'sale' | 'contract'>('sale');
  const [rows, setRows] = useState<TradeItem[]>([{ resource: 'food', quantity: 100 }]);
  const [every, setEvery] = useState<number>(30);
  const [markup, setMarkup] = useState(10);
  const list = kind === 'sale' ? rows.slice(0, 1) : rows;
  const ref = refValue(list);
  // preço sugerido: referência ± o ajuste escolhido (no contrato, por mês)
  const perDelivery = Math.round(ref * (1 + markup / 100));
  const price = kind === 'contract' ? Math.round((perDelivery * 30) / every) : perDelivery;
  const short = kind === 'sale' ? list.find((i) => trade.sellable[i.resource] < i.quantity) : undefined;
  const why = disabled ?? (short ? `Estoque insuficiente de ${RES(short.resource)}: ${trade.sellable[short.resource]} disponíveis` : null);
  const setRow = (i: number, p: Partial<TradeItem>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-1.5 rounded border border-ink-700 bg-ink-900 p-2">
      <div className="flex gap-1">
        {(['sale', 'contract'] as const).map((k) => (
          <button key={k} className={`btn flex-1 py-1 text-xs ${kind === k ? 'btn-primary' : ''}`} onClick={() => setKind(k)}>
            {k === 'sale' ? 'Venda simples' : 'Contrato de fornecimento'}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-400">
        {kind === 'sale'
          ? 'Um lote por um preço fechado. A mercadoria fica reservada até alguém comprar; quem compra escolhe o transporte.'
          : 'Você entrega o lote a cada N dias e recebe por mês, até alguém encerrar. Cai sozinho se faltar estoque na data ou se o comprador não tiver caixa.'}
      </p>
      {list.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select className="input flex-1 py-1 text-xs" value={it.resource} onChange={(e) => setRow(i, { resource: e.target.value as TradeResource })}>
            {TRADE_RESOURCES.map((r) => (
              <option key={r} value={r} disabled={list.some((x, k) => k !== i && x.resource === r)}>
                {RES(r)} (você tem {trade.sellable[r]})
              </option>
            ))}
          </select>
          <input
            className="input w-20 py-1 text-right text-xs"
            type="number"
            min={1}
            max={TRADE.maxQuantity}
            step={10}
            value={it.quantity}
            onChange={(e) =>
              setRow(i, {
                quantity: Math.max(1, Math.min(TRADE.maxQuantity, Math.round(Number(e.target.value) || 1))),
              })
            }
          />
          {kind === 'contract' && list.length > 1 && (
            <button className="btn px-1.5 py-1 text-[10px]" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Tirar recurso">
              ✖
            </button>
          )}
        </div>
      ))}
      {kind === 'contract' && rows.length < TRADE.maxItems && (
        <button
          className="btn w-full py-1 text-[11px]"
          onClick={() =>
            setRows([
              ...rows,
              {
                resource: TRADE_RESOURCES.find((r) => !rows.some((x) => x.resource === r))!,
                quantity: 100,
              },
            ])
          }
        >
          + Outro recurso no mesmo contrato
        </button>
      )}
      {kind === 'contract' && (
        <div className="flex items-center gap-1.5">
          <span className="text-ink-400">Entrega a cada</span>
          {DAYS.map((d) => (
            <button key={d} className={`btn px-2 py-0.5 text-[11px] ${every === d ? 'btn-primary' : ''}`} onClick={() => setEvery(d)}>
              {d} dias
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-ink-400">Preço</span>
        <input className="flex-1" type="range" min={-30} max={60} step={5} value={markup} onChange={(e) => setMarkup(Number(e.target.value))} aria-label="Ajuste sobre a referência" />
        <span className="w-24 text-right font-mono text-ink-100">
          {formatUsd(price)}
          {kind === 'contract' ? '/mês' : ''}
        </span>
      </div>
      <div className="text-[10px] text-ink-400">
        Referência {formatUsd(ref)} por {kind === 'contract' ? 'entrega' : 'lote'} ({markup >= 0 ? '+' : ''}
        {markup}%)
        {kind === 'contract' ? ` · ${formatUsd(perDelivery)} por entrega` : ''}
      </div>
      <button
        className="btn btn-primary w-full py-1.5 text-xs"
        disabled={!!why}
        title={why ?? ''}
        onClick={() =>
          send({
            type: 'trade_list',
            kind,
            items: list,
            priceUsd: price,
            ...(kind === 'contract' ? { everyDays: every } : {}),
          })
        }
      >
        Publicar anúncio
      </button>
      {why && <p className="text-[11px] text-brass-400">{why}</p>}
    </div>
  );
}

function ContractCard({ c, mySlot, nameOf, tick }: { c: TradeContract; mySlot: number; nameOf: (id: number) => string; tick: number }) {
  const iSell = c.seller === mySlot;
  const active = c.status === 'active';
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink-100">
          {iSell ? 'Você fornece' : 'Você recebe'}: {items(c.items)} {iSell ? '→' : '←'} {nameOf(iSell ? c.buyer : c.seller)}
        </span>
        <span className={`rounded border px-1.5 text-[10px] font-semibold ${active ? 'border-signal-blue/50 text-signal-blue' : 'border-ink-600 text-ink-300'}`}>{active ? 'Ativo' : 'Encerrado'}</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 text-[10px] text-ink-400 sm:grid-cols-4">
        <span>
          {formatUsd(c.monthlyUsd)}/mês · a cada {c.everyDays} dias
        </span>
        <span>
          <ModeIcon mode={c.mode} /> {TRANSPORT[c.mode].label}
        </span>
        <span>
          Entregas: {c.deliveries}
          {c.lost > 0 ? ` · perdidos ${Math.round(c.lost)}` : ''}
        </span>
        <span>{active ? `Próxima em ${Math.max(0, Math.ceil((c.nextTick - tick) / 20))} dias` : `${iSell ? 'Recebido' : 'Pago'}: ${formatUsd(c.paidUsd)}`}</span>
      </div>
      {c.reason && <div className="mt-1 text-[11px] text-ink-300">{c.reason}</div>}
      {c.log.length > 0 && <div className="mt-1 text-[10px] text-ink-400">Último: {c.log[c.log.length - 1]!.text}</div>}
      {active && (
        <button
          className="btn mt-1.5 px-2 py-0.5 text-[10px]"
          onClick={() => send({ type: 'trade_cancel', contractId: c.id })}
          title="Encerra o contrato. Cargas já a caminho ainda chegam e são pagas na entrega."
        >
          Encerrar contrato
        </button>
      )}
    </div>
  );
}

function ShipmentRow({ s, mySlot, nameOf }: { s: ShipmentView; mySlot: number; nameOf: (id: number) => string }) {
  const out = s.seller === mySlot;
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-ink-800 bg-ink-900 px-2 py-1 text-[11px]">
      <span className="text-ink-200">
        <ModeIcon mode={s.mode} /> {items(s.items ?? [])} {out ? '→' : '←'} {nameOf(out ? s.buyer : s.seller)} · {SHIP_STATE[s.state] ?? s.state}
        {s.etaSeconds !== undefined && s.etaSeconds >= 0 && s.state !== 'waiting_capacity' ? ` · ~${s.etaSeconds} dias` : ''}
        {s.payUsd ? ` · ${formatUsd(s.payUsd)} na entrega` : ''}
        {s.reason ? <span className="text-brass-400"> · {s.reason}</span> : null}
      </span>
      {(s.state === 'moving' || s.state === 'loading' || s.state === 'waiting_capacity') && (
        <button className="btn px-1.5 py-0.5 text-[10px]" onClick={() => useHudStore.getState().set({ inspectedShipment: s.id })} title="Mostrar a rota no mapa">
          Ver rota
        </button>
      )}
    </div>
  );
}

const LOTS = [50, 100, 300] as const;

function WorldMarket({ trade, disabled }: { trade: TradeView; disabled: string | null }) {
  const [qty, setQty] = useState<number>(100);
  const [mode, setMode] = useState<TransportMode>('road');
  const modeWhy = disabled ?? trade.modes[mode].world;
  return (
    <div className="space-y-1.5 rounded border border-ink-700 bg-ink-900 p-2">
      <p className="text-[11px] text-ink-400">
        Compra a {Math.round(TRADE.worldBuyMul * 100)}% e vende a {Math.round(TRADE.worldSellMul * 100)}% do preço de referência, até {TRADE.worldDailyUnits} de cada recurso por dia. A carga entra ou
        sai pela borda do mapa e só paga na chegada. Um vizinho costuma pagar melhor.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-ink-400">Lote</span>
        {LOTS.map((q) => (
          <button key={q} className={`btn px-2 py-0.5 text-[11px] ${qty === q ? 'btn-primary' : ''}`} onClick={() => setQty(q)}>
            {q}
          </button>
        ))}
        <span className="ml-2 text-ink-400">Por</span>
        {TRANSPORT_MODES.map((m) => (
          <button key={m} className={`btn px-2 py-0.5 text-[11px] ${mode === m ? 'btn-primary' : ''}`} onClick={() => setMode(m)} title={trade.modes[m].world ?? TRANSPORT[m].label}>
            <ModeIcon mode={m} />
          </button>
        ))}
      </div>
      {modeWhy && <p className="text-[11px] text-brass-400">{modeWhy}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-ink-400">
              <th className="py-0.5 text-left font-normal">Recurso</th>
              <th className="text-right font-normal">Compra/un</th>
              <th className="text-right font-normal">Venda/un</th>
              <th className="text-right font-normal">Hoje</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {TRADE_RESOURCES.map((r) => {
              const q = trade.world[r];
              const n = Math.min(qty, q.left);
              const buyWhy = modeWhy ?? (n <= 0 ? 'Limite de hoje atingido' : trade.free[r] < n ? `Sem espaço: ${trade.free[r]} livres` : null);
              const sellWhy = modeWhy ?? (n <= 0 ? 'Limite de hoje atingido' : trade.sellable[r] < n ? `Estoque: ${trade.sellable[r]}` : null);
              return (
                <tr key={r} className="border-t border-ink-800">
                  <td className="py-1 text-ink-200">{RES(r)}</td>
                  <td className="text-right font-mono text-ink-200" title={`Referência ${formatUsd(REF_PRICE[r])}`}>
                    {formatUsd(q.buy)}
                  </td>
                  <td className="text-right font-mono text-ink-200">{formatUsd(q.sell)}</td>
                  <td className="text-right font-mono text-ink-400">{q.left}</td>
                  <td className="py-1 pl-1.5 text-right whitespace-nowrap">
                    <button
                      className="btn px-1.5 py-0.5 text-[10px]"
                      disabled={!!buyWhy}
                      title={buyWhy ?? `Comprar ${n} por ${formatUsd(n * q.buy)}`}
                      onClick={() =>
                        send({
                          type: 'trade_world',
                          side: 'buy',
                          resource: r,
                          quantity: n,
                          mode,
                        })
                      }
                    >
                      Comprar
                    </button>{' '}
                    <button
                      className="btn px-1.5 py-0.5 text-[10px]"
                      disabled={!!sellWhy}
                      title={sellWhy ?? `Vender ${n} por ${formatUsd(n * q.sell)}`}
                      onClick={() =>
                        send({
                          type: 'trade_world',
                          side: 'sell',
                          resource: r,
                          quantity: n,
                          mode,
                        })
                      }
                    >
                      Vender
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
