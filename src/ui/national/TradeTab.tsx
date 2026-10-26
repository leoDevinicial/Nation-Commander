import { useMemo, useState } from 'react';
import type { NationView } from '../../../shared/protocol.ts';
import type { Command } from '../../../shared/sim/commands.ts';
import type { TradeView } from '../../../shared/sim/snapshot.ts';
import {
  BASE_PRICE,
  DEPOT_FOR,
  TRADE,
  TRADE_RESOURCES,
  TRANSPORT,
  TRANSPORT_MODES,
  isNpcPartner,
  type ContractStatus,
  type TradeContract,
  type TradeOffer,
  type TradeResource,
  type TransportMode,
} from '../../../shared/sim/trade.ts';
import { BUILDINGS, RESOURCE_LABELS } from '../../../shared/sim/config.ts';
import { formatUsd } from '../../lib/format.ts';
import { gameClient } from '../../net/client.ts';
import { useHudStore } from '../../state/useHudStore.ts';

const send = (cmd: Command) => gameClient.send({ t: 'cmd', cmd });
const RES = (r: TradeResource) => RESOURCE_LABELS[r] ?? r;

const STATUS: Record<ContractStatus, { label: string; cls: string }> = {
  active: { label: 'Ativo', cls: 'text-signal-blue border-signal-blue/50' },
  fulfilled: { label: 'Cumprido', cls: 'text-signal-green border-signal-green/50' },
  suspended: { label: 'Suspenso', cls: 'text-brass-400 border-brass-400/60' },
  interrupted: { label: 'Interrompido', cls: 'text-red-300 border-red-400/50' },
  cancelled: { label: 'Cancelado', cls: 'text-ink-300 border-ink-600' },
  expired: { label: 'Expirado', cls: 'text-ink-300 border-ink-600' },
};

const SHIP_STATE: Record<string, string> = {
  loading: 'carregando',
  moving: 'em trânsito no mapa',
  offmap: 'em trânsito fora do teatro',
  waiting_capacity: 'aguardando espaço no destino',
  delivered: 'entregue',
  lost: 'perdida',
};

interface Partner {
  id: number;
  name: string;
  known: boolean;
}

/**
 * Comércio internacional (Fase 6): propor compra ou venda a países conhecidos, responder ofertas
 * (aceitar, recusar, contrapropor), acompanhar contratos e cargas e consultar o mercado. Tudo o
 * que é bloqueado diz o motivo; o servidor revalida com a mesma regra.
 */
export function TradeTab({ nation, mySlot, partners }: { nation: NationView; mySlot: number; partners: Partner[] }) {
  const trade = useHudStore((s) => s.trade);
  const tick = useHudStore((s) => s.tick);
  const [draft, setDraft] = useState<Draft | null>(null);
  const nameOf = (id: number) => partners.find((p) => p.id === id)?.name ?? (id === mySlot ? 'Você' : `#${id}`);
  if (!trade) return <p className="text-sm text-ink-400">Aguardando dados de comércio…</p>;
  const received = trade.offers.filter((o) => o.to === mySlot && o.status === 'pending');
  const sent = trade.offers.filter((o) => o.from === mySlot && o.status === 'pending');
  const recent = trade.offers.filter((o) => o.status !== 'pending').slice(-6).reverse();
  const contracts = [...trade.contracts].sort((a, b) => order(a.status) - order(b.status) || b.id - a.id);
  const noMarket = trade.modes.road.blocker?.includes('Terminal Comercial');

  return (
    <div className="space-y-3 text-xs">
      <section className="rounded border border-ink-700 bg-ink-900 p-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-ink-100">Balança comercial</span>
          <span className="font-mono text-ink-200">
            <span className="text-signal-green">+{formatUsd(nation.trade?.exportsUsd ?? 0)}</span> · <span className="text-red-300">−{formatUsd(nation.trade?.importsUsd ?? 0)}</span> · frete −
            {formatUsd(nation.trade?.freightUsd ?? 0)}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
          {TRANSPORT_MODES.map((m) => (
            <div key={m} className={`rounded border px-1.5 py-1 ${trade.modes[m].blocker ? 'border-ink-700 text-ink-400' : 'border-signal-green/40 text-ink-100'}`} title={trade.modes[m].blocker ?? TRANSPORT[m].risk}>
              <div className="font-semibold">
                {MODE_ICON[m]} {TRANSPORT[m].label}
              </div>
              <div className="text-[10px]">{trade.modes[m].blocker ? 'indisponível' : `${TRANSPORT[m].capacity}/viagem · ${trade.modes[m].limit} simultâneos`}</div>
            </div>
          ))}
        </div>
        {noMarket && <p className="mt-1.5 text-brass-400">{trade.modes.road.blocker}</p>}
      </section>

      {received.length > 0 && (
        <Section title={`Ofertas recebidas (${received.length})`}>
          {received.map((o) => (
            <OfferCard key={o.id} o={o} mySlot={mySlot} nameOf={nameOf} tick={tick}>
              <button className="btn btn-primary px-2 py-1 text-xs" onClick={() => send({ type: 'trade_respond', offerId: o.id, accept: true })}>
                Aceitar
              </button>
              <button className="btn px-2 py-1 text-xs" onClick={() => send({ type: 'trade_respond', offerId: o.id, accept: false })}>
                Recusar
              </button>
              <button className="btn px-2 py-1 text-xs" onClick={() => setDraft({ ...fromOffer(o, mySlot), counterOf: o.id })}>
                Contrapropor
              </button>
            </OfferCard>
          ))}
        </Section>
      )}

      <Section title="Nova proposta">
        {draft ? (
          <ProposalForm draft={draft} setDraft={setDraft} trade={trade} partners={partners.filter((p) => p.known)} nameOf={nameOf} />
        ) : (
          <button className="btn w-full py-1.5 text-xs" disabled={!!noMarket} title={noMarket ? (trade.modes.road.blocker ?? '') : ''} onClick={() => setDraft(defaultDraft(partners.filter((p) => p.known)[0]?.id ?? null, trade))}>
            + Propor compra ou venda
          </button>
        )}
      </Section>

      {sent.length > 0 && (
        <Section title="Propostas enviadas">
          {sent.map((o) => (
            <OfferCard key={o.id} o={o} mySlot={mySlot} nameOf={nameOf} tick={tick}>
              <button className="btn px-2 py-1 text-xs" onClick={() => send({ type: 'trade_withdraw', offerId: o.id })}>
                Retirar
              </button>
            </OfferCard>
          ))}
        </Section>
      )}

      <Section title={`Contratos (${contracts.filter((c) => c.status === 'active' || c.status === 'suspended').length} em andamento)`}>
        {contracts.length === 0 && <p className="text-ink-400">Nenhum contrato ainda.</p>}
        {contracts.map((c) => (
          <ContractCard key={c.id} c={c} mySlot={mySlot} nameOf={nameOf} tick={tick} trade={trade} />
        ))}
      </Section>

      {recent.length > 0 && (
        <Section title="Respostas recentes">
          {recent.map((o) => (
            <div key={o.id} className="flex justify-between gap-2 border-b border-ink-800 py-1 text-[11px] last:border-0">
              <span className="text-ink-300">
                {o.from === mySlot ? `Para ${nameOf(o.to)}` : `De ${nameOf(o.from)}`}: {o.from === o.seller ? 'venda' : 'compra'} de {o.quantity} {RES(o.resource)}
              </span>
              <span className={o.status === 'accepted' ? 'text-signal-green' : o.status === 'countered' ? 'text-brass-400' : 'text-ink-400'}>
                {OFFER_STATUS[o.status]}
                {o.reason ? ` — ${o.reason}` : ''}
              </span>
            </div>
          ))}
        </Section>
      )}

      <Section title="Mercado dos países conhecidos (US$ por unidade)">
        <Quotes trade={trade} nameOf={nameOf} />
      </Section>
    </div>
  );
}

const MODE_ICON: Record<TransportMode, string> = { road: '🚚', rail: '🚆', sea: '🚢', air: '🚁' };
const OFFER_STATUS: Record<string, string> = { pending: 'pendente', accepted: 'aceita', rejected: 'recusada', countered: 'contraproposta', expired: 'expirou', withdrawn: 'retirada' };
const order = (s: ContractStatus) => ['active', 'suspended', 'fulfilled', 'interrupted', 'expired', 'cancelled'].indexOf(s);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function OfferCard({ o, mySlot, nameOf, tick, children }: { o: TradeOffer; mySlot: number; nameOf: (id: number) => string; tick: number; children: React.ReactNode }) {
  const iSell = o.seller === mySlot;
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-ink-100">
          {iSell ? 'Vender' : 'Comprar'} {o.quantity} de {RES(o.resource)} {iSell ? 'para' : 'de'} {nameOf(iSell ? o.buyer : o.seller)}
        </span>
        <span className="font-mono text-ink-200">{formatUsd(o.price * o.quantity)}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-ink-400">
        {formatUsd(o.price)}/un · {MODE_ICON[o.mode]} {TRANSPORT[o.mode].label} · prazo {o.days} dias · expira em {Math.max(0, Math.ceil((o.expiresTick - tick) / 20))} dias
        {o.reason ? <span className="text-brass-400"> · {o.reason}</span> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ContractCard({ c, mySlot, nameOf, tick, trade }: { c: TradeContract; mySlot: number; nameOf: (id: number) => string; tick: number; trade: TradeView }) {
  const iSell = c.seller === mySlot;
  const st = STATUS[c.status];
  const open = c.status === 'active' || c.status === 'suspended';
  const ships = trade.shipments.filter((s) => s.contractId === c.id);
  const pct = (n: number) => `${(n / c.quantity) * 100}%`;
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink-100">
          {iSell ? 'Exportação' : 'Importação'}: {c.quantity} {RES(c.resource)} {iSell ? '→' : '←'} {nameOf(iSell ? c.buyer : c.seller)}
        </span>
        <span className={`rounded border px-1.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      {/* entregue (verde), em trânsito (azul), perdido (vermelho) */}
      <div className="relative mt-1.5 h-2 overflow-hidden rounded bg-ink-950" title={`Entregue ${Math.round(c.delivered)} · embarcado ${c.shipped} · perdido ${Math.round(c.lost)} · reservado ${c.reserved}`}>
        <div className="absolute inset-y-0 left-0 bg-signal-blue/60" style={{ width: pct(c.shipped) }} />
        <div className="absolute inset-y-0 left-0 bg-signal-green" style={{ width: pct(c.delivered) }} />
        <div className="absolute inset-y-0 bg-red-400" style={{ left: pct(c.delivered), width: pct(c.lost) }} />
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 text-[10px] text-ink-400 sm:grid-cols-4">
        <span>Entregue: {Math.round(c.delivered)}/{c.quantity}</span>
        <span>{iSell ? 'Recebido' : 'Pago'}: {formatUsd(c.paidUsd)}</span>
        <span>Frete: {formatUsd(c.freightUsd)}</span>
        <span>{open ? `Prazo: ${Math.max(0, Math.ceil((c.deadlineTick - tick) / 20))} dias` : `${MODE_ICON[c.mode]} ${TRANSPORT[c.mode].label}`}</span>
      </div>
      {c.reason && <div className={`mt-1 text-[11px] ${c.status === 'suspended' ? 'text-brass-400' : 'text-ink-300'}`}>{c.reason}</div>}
      {ships.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {ships.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-ink-200">
                {MODE_ICON[s.mode]} {s.quantity} {s.resource ? RES(s.resource) : ''} — {SHIP_STATE[s.state]}
                {s.etaSeconds !== undefined && s.state !== 'waiting_capacity' ? ` · ~${s.etaSeconds} dias` : ''}
                {s.reason ? <span className="text-brass-400"> · {s.reason}</span> : null}
              </span>
              {s.state !== 'offmap' && (
                <button className="btn px-1.5 py-0.5 text-[10px]" onClick={() => useHudStore.getState().set({ inspectedShipment: s.id })} title="Mostrar a rota no mapa">
                  Ver rota
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {c.log.length > 0 && <div className="mt-1 text-[10px] text-ink-400">Último: {c.log[c.log.length - 1]!.text}</div>}
      {open && (
        <button className="btn mt-1.5 px-2 py-0.5 text-[10px]" onClick={() => send({ type: 'trade_cancel', contractId: c.id })} title="Encerra o contrato: a reserva ainda não embarcada volta ao estoque; nada já pago é devolvido">
          Cancelar contrato
        </button>
      )}
    </div>
  );
}

function Quotes({ trade, nameOf }: { trade: TradeView; nameOf: (id: number) => string }) {
  const partners = [...new Set(trade.quotes.map((q) => q.partner))];
  if (!partners.length) return <p className="text-ink-400">Nenhum país conhecido fora do teatro ainda (faça contato pelo Globo).</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-ink-400">
            <th className="py-0.5 text-left font-normal">País</th>
            {TRADE_RESOURCES.map((r) => (
              <th key={r} className="px-1 text-right font-normal">
                {RES(r)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => (
            <tr key={p} className="border-t border-ink-800">
              <td className="py-0.5 pr-1 text-ink-200">{nameOf(p)}</td>
              {TRADE_RESOURCES.map((r) => {
                const q = trade.quotes.find((x) => x.partner === p && x.resource === r)!;
                return (
                  <td key={r} className="px-1 text-right font-mono" title={`Vende a ${formatUsd(q.sell)} (tem ${q.supply}) · compra a ${formatUsd(q.buy)} (quer ${q.demand})`}>
                    <span className="text-red-300">{Math.round(q.sell / 1000)}</span>/<span className="text-signal-green">{Math.round(q.buy / 1000)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-ink-400">Mil US$ por unidade: vermelho = preço de venda do país, verde = quanto ele paga. Toque num valor para ver estoque e demanda.</p>
    </div>
  );
}

// ------------------------------------------------------------------ formulário

interface Draft {
  partner: number | null;
  side: 'buy' | 'sell';
  resource: TradeResource;
  quantity: number;
  price: number;
  mode: TransportMode;
  days: number;
  counterOf?: number;
}

function suggestedPrice(trade: TradeView, partner: number | null, side: 'buy' | 'sell', r: TradeResource): number {
  const q = partner !== null ? trade.quotes.find((x) => x.partner === partner && x.resource === r) : undefined;
  if (!q) return BASE_PRICE[r];
  return side === 'sell' ? q.buy : q.sell;
}

function defaultDraft(partner: number | null, trade: TradeView): Draft {
  return { partner, side: 'sell', resource: 'iron', quantity: 50, price: suggestedPrice(trade, partner, 'sell', 'iron'), mode: 'road', days: 180 };
}

function fromOffer(o: TradeOffer, mySlot: number): Draft {
  return { partner: o.from, side: o.seller === mySlot ? 'sell' : 'buy', resource: o.resource, quantity: o.quantity, price: o.price, mode: o.mode, days: o.days };
}

function ProposalForm({ draft, setDraft, trade, partners, nameOf }: { draft: Draft; setDraft: (d: Draft | null) => void; trade: TradeView; partners: Partner[]; nameOf: (id: number) => string }) {
  const d = draft;
  const up = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const def = TRANSPORT[d.mode];
  const lots = Math.ceil(d.quantity / def.capacity);
  const freight = d.side === 'sell' || (d.partner !== null && !isNpcPartner(d.partner)) ? d.quantity * def.costPerUnit : 0;
  // verificação rápida no cliente (o servidor revalida com a regra completa)
  const blocker = useMemo(() => {
    if (d.partner === null) return 'Escolha um país';
    if (trade.modes[d.mode].blocker) return trade.modes[d.mode].blocker;
    if (d.quantity < 1 || d.quantity > TRADE.maxQuantity) return `Quantidade entre 1 e ${TRADE.maxQuantity}`;
    if (d.days < TRADE.minDays || d.days > TRADE.maxDays) return `Prazo entre ${TRADE.minDays} e ${TRADE.maxDays} dias`;
    if (d.side === 'sell' && trade.sellable[d.resource] < d.quantity)
      return `Estoque vendável: ${trade.sellable[d.resource]} (${d.resource === 'oil' ? 'só o petróleo dos tanques' : `no ${BUILDINGS[DEPOT_FOR[d.resource]].label}`})`;
    if (d.side === 'buy' && trade.free[d.resource] < Math.min(d.quantity, def.capacity)) return `Espaço livre para receber: ${trade.free[d.resource]}`;
    return null;
  }, [d, trade, def.capacity]);
  const submit = () => {
    if (blocker || d.partner === null) return;
    send({ type: 'trade_offer', partner: d.partner, side: d.side, resource: d.resource, quantity: d.quantity, price: Math.round(d.price), mode: d.mode, days: d.days, ...(d.counterOf !== undefined ? { counterOf: d.counterOf } : {}) });
    setDraft(null);
  };
  const field = 'mt-0.5 w-full rounded border border-ink-600 bg-ink-850 px-1.5 py-1 text-xs text-ink-100';
  return (
    <div className="rounded border border-signal-blue/40 bg-ink-900 p-2">
      {d.counterOf !== undefined && <div className="mb-1 text-brass-400">Contraproposta para {nameOf(d.partner ?? -1)}</div>}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-ink-400">
          País
          <select className={field} value={d.partner ?? ''} disabled={d.counterOf !== undefined} onChange={(e) => up({ partner: Number(e.target.value), price: suggestedPrice(trade, Number(e.target.value), d.side, d.resource) })}>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-400">
          Operação
          <select className={field} value={d.side} onChange={(e) => up({ side: e.target.value as 'buy' | 'sell', price: suggestedPrice(trade, d.partner, e.target.value as 'buy' | 'sell', d.resource) })}>
            <option value="sell">Vender (exportar)</option>
            <option value="buy">Comprar (importar)</option>
          </select>
        </label>
        <label className="text-ink-400">
          Recurso
          <select className={field} value={d.resource} onChange={(e) => up({ resource: e.target.value as TradeResource, price: suggestedPrice(trade, d.partner, d.side, e.target.value as TradeResource) })}>
            {TRADE_RESOURCES.map((r) => (
              <option key={r} value={r}>
                {RES(r)} {d.side === 'sell' ? `(tem ${trade.sellable[r]})` : `(cabe ${trade.free[r]})`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-400">
          Quantidade
          <input className={field} type="number" min={1} max={TRADE.maxQuantity} value={d.quantity} onChange={(e) => up({ quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        </label>
        <label className="text-ink-400">
          Preço por unidade (mil US$)
          <input className={field} type="number" min={1} step={1} value={Math.round(d.price / 1000)} onChange={(e) => up({ price: Math.max(1, Number(e.target.value) || 0) * 1000 })} />
        </label>
        <label className="text-ink-400">
          Prazo (dias)
          <input className={field} type="number" min={TRADE.minDays} max={TRADE.maxDays} step={30} value={d.days} onChange={(e) => up({ days: Math.floor(Number(e.target.value) || 0) })} />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {TRANSPORT_MODES.map((m) => (
          <button
            key={m}
            className={`rounded border px-1 py-1 text-[10px] ${d.mode === m ? 'border-signal-blue bg-signal-blue/15 text-ink-100' : 'border-ink-600 text-ink-300'} ${trade.modes[m].blocker ? 'opacity-50' : ''}`}
            onClick={() => up({ mode: m })}
            title={trade.modes[m].blocker ?? TRANSPORT[m].risk}
          >
            {MODE_ICON[m]} {TRANSPORT[m].label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-[11px] text-ink-300">
        Total {formatUsd(d.price * d.quantity)} · {lots} {lots === 1 ? 'viagem' : 'viagens'} de até {def.capacity} · frete ≈ {formatUsd(freight)}
        {d.partner !== null && isNpcPartner(d.partner) ? ` · trecho fora do teatro ≈ ${def.offmapSeconds} dias` : ''}
        <div className="text-[10px] text-ink-400">{def.risk}</div>
      </div>
      {blocker && <div className="mt-1 text-[11px] text-red-300">{blocker}</div>}
      <div className="mt-2 flex gap-2">
        <button className="btn btn-primary flex-1 py-1 text-xs" disabled={!!blocker} onClick={submit}>
          Enviar proposta
        </button>
        <button className="btn py-1 text-xs" onClick={() => setDraft(null)}>
          Fechar
        </button>
      </div>
    </div>
  );
}
