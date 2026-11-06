import { Plane, Send, Ship, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { TRADE_RESOURCES, TRANSPORT, giftFreightUsd, type TradeResource, type TransportMode } from '../../../shared/sim/trade.ts';
import { RESOURCE_LABELS } from '../../../shared/sim/config.ts';
import { formatUsd } from '../../lib/format.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { ResourceIcon } from '../components/Resources.tsx';

const MODES: { mode: TransportMode; icon: typeof Truck; label: string; note: string }[] = [
  { mode: 'road', icon: Truck, label: 'Caminhão', note: 'Mais barato e mais lento. Precisa de rodovia ou estrada ligando os Terminais Comerciais.' },
  { mode: 'sea', icon: Ship, label: 'Navio', note: 'Preço e velocidade intermediários. Precisa de Porto dos dois lados e um Cargueiro livre.' },
  { mode: 'air', icon: Plane, label: 'Avião', note: 'Mais caro e mais rápido. Precisa de aeroporto dos dois lados e um avião cargueiro (Transporte ou C-5 Galaxy).' },
];

/**
 * Envio de recursos a um aliado (06/11): o jogador escolhe os recursos, vê o frete de cada transporte e escolhe como a
 * carga vai. Um transporte indisponível mostra o motivo (o servidor confere tudo de novo ao enviar).
 */
export function GiftDialog({ ally, mySlot, nameOf, onSend, onClose }: { ally: number; mySlot: number; nameOf: (id: number) => string; onSend: (items: { resource: TradeResource; quantity: number }[], mode: TransportMode) => void; onClose: () => void }) {
  const me = useHudStore((s) => s.players.find((p) => p.slot === mySlot));
  const [qty, setQty] = useState<Partial<Record<TradeResource, number>>>({});
  const [mode, setMode] = useState<TransportMode | null>(null);
  const link = me?.allyLinks?.find((l) => l.ally === ally);
  const items = TRADE_RESOURCES.filter((r) => (qty[r] ?? 0) > 0).map((r) => ({ resource: r, quantity: Math.floor(qty[r]!) }));
  const have = (r: TradeResource) => Math.floor(me?.resources?.[r] ?? 0);
  const over = items.find((i) => i.quantity > have(i.resource));
  const blocker = (m: TransportMode) => (link ? link[m] : 'Esse país não é mais seu aliado');
  const chosen = mode && !blocker(mode) ? mode : null;
  const ok = items.length > 0 && !over && chosen !== null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950/75 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel panel-frame max-h-full w-full max-w-lg overflow-y-auto p-4" role="dialog" aria-labelledby="gift-title">
        <div className="mb-3 flex items-start justify-between gap-2 border-b border-brass-400/25 pb-2">
          <div>
            <div className="nc-kicker">Aliança</div>
            <h2 id="gift-title" className="nc-title text-lg">
              Enviar recursos a {nameOf(ally)}
            </h2>
          </div>
          <button className="nc-icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} aria-hidden />
          </button>
        </div>
        <p className="mb-2 text-xs text-ink-400">A carga sai do seu estoque agora e chega pelo transporte escolhido. Em guerra com alguém, ela pode ser atacada no caminho por quem está em guerra com vocês.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TRADE_RESOURCES.map((r) => (
            <label key={r} className="flex items-center gap-1.5 rounded-[3px] border border-ink-700 bg-ink-950/50 px-2 py-1.5 text-xs">
              <ResourceIcon type={r} size={14} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink-200">{RESOURCE_LABELS[r]}</span>
                <span className="nc-num text-[10px] text-ink-400">tem {have(r)}</span>
              </span>
              <input
                type="number"
                min={0}
                max={have(r)}
                step={10}
                className="field w-16 px-1 py-0.5 text-right text-xs"
                value={qty[r] ?? ''}
                placeholder="0"
                onChange={(e) => setQty({ ...qty, [r]: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })}
                aria-label={`Quantidade de ${RESOURCE_LABELS[r]}`}
              />
            </label>
          ))}
        </div>
        {over && <p className="mt-1.5 text-xs text-red-300">Você tem só {have(over.resource)} de {RESOURCE_LABELS[over.resource].toLowerCase()}.</p>}
        <div className="nc-kicker mt-3 mb-1.5">Transporte e frete</div>
        <div className="space-y-1.5">
          {MODES.map(({ mode: m, icon: Icon, label, note }) => {
            const why = blocker(m);
            const freight = items.length ? giftFreightUsd(items, m) : null;
            const on = mode === m && !why;
            return (
              <button
                key={m}
                className={`flex w-full items-start gap-2.5 rounded-[3px] border p-2 text-left text-xs ${on ? 'border-brass-400 bg-brass-400/[0.07]' : why ? 'cursor-not-allowed border-ink-700 opacity-70' : 'border-ink-700 hover:border-ink-500'}`}
                onClick={() => !why && setMode(m)}
                aria-pressed={on}
                aria-disabled={!!why}
              >
                <Icon size={18} className={`mt-0.5 shrink-0 ${on ? 'text-brass-400' : 'text-ink-300'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink-100">{label}</span>
                    <span className="nc-num text-brass-400">{freight !== null ? formatUsd(freight) : '—'}</span>
                  </span>
                  <span className="block text-ink-400">
                    {note} Até {TRANSPORT[m].capacity} por viagem.
                  </span>
                  {why && <span className="mt-0.5 block text-red-300">{why}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={!ok} onClick={() => chosen && onSend(items, chosen)}>
            <Send size={15} aria-hidden /> Enviar{chosen && items.length ? ` (${formatUsd(giftFreightUsd(items, chosen))} de frete)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
