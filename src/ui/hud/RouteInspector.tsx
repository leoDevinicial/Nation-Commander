import { countryName } from '../../../shared/data/countries.ts';
import { RESOURCE_LABELS } from '../../../shared/sim/config.ts';
import { TRANSPORT } from '../../../shared/sim/trade.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';

const STATE: Record<string, string> = {
  loading: 'Carregando no terminal',
  moving: 'Em trânsito no mapa',
  offmap: 'Em trânsito fora do teatro',
  waiting_capacity: 'Aguardando espaço no destino',
};

/**
 * Inspeção de rota (Fase 6): produto, origem e destino, volume do lote, estado, tempo estimado,
 * capacidade do modal e riscos conhecidos. Abre pelo botão "Ver rota" do painel de comércio; a
 * linha tracejada no mapa mostra o trajeto restante.
 */
export function RouteInspector() {
  const id = useHudStore((s) => s.inspectedShipment);
  const s = useHudStore((s) => (id !== null ? s.trade?.shipments.find((x) => x.id === id) : undefined));
  const contract = useHudStore((st) => (s ? st.trade?.contracts.find((c) => c.id === s.contractId) : undefined));
  const players = useAppStore((st) => st.match?.players ?? []);
  const npcs = useNationalStore((st) => st.diplomacy?.nations ?? []);
  if (id === null) return null;
  const name = (n: number) => countryName(players.find((p) => p.slot === n)?.countryId ?? npcs.find((x) => x.id === n)?.countryId ?? '') || `#${n}`;
  const close = () => useHudStore.getState().set({ inspectedShipment: null });
  if (!s) {
    return (
      <div className="panel pointer-events-auto absolute top-[4.5rem] left-3 z-20 w-64 p-2.5 text-xs">
        <div className="flex justify-between">
          <span className="text-ink-300">Carga entregue ou fora do mapa.</span>
          <button className="btn px-1.5 py-0.5 text-[10px]" onClick={close} aria-label="Fechar inspeção de rota">
            ✖
          </button>
        </div>
      </div>
    );
  }
  const def = TRANSPORT[s.mode];
  return (
    <div className="panel pointer-events-auto absolute top-[4.5rem] left-3 z-20 w-72 max-w-[calc(100vw-24px)] p-2.5 text-xs" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Inspeção de rota">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-ink-100">
            {s.quantity} de {s.resource ? RESOURCE_LABELS[s.resource] : 'carga'} · {def.label}
          </div>
          <div className="text-[11px] text-ink-300">
            {name(s.seller)} → {name(s.buyer)}
          </div>
        </div>
        <button className="btn px-1.5 py-0.5 text-[10px]" onClick={close} aria-label="Fechar inspeção de rota">
          ✖
        </button>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-ink-400">Estado</dt>
        <dd className="text-ink-200">{STATE[s.state] ?? s.state}</dd>
        <dt className="text-ink-400">Chegada</dt>
        <dd className="text-ink-200">{s.etaSeconds !== undefined ? `~${s.etaSeconds} dias` : '—'}</dd>
        <dt className="text-ink-400">Capacidade</dt>
        <dd className="text-ink-200">
          {s.quantity}/{def.capacity} por viagem
        </dd>
        {contract && (
          <>
            <dt className="text-ink-400">Contrato</dt>
            <dd className="text-ink-200">
              {Math.round(contract.delivered)}/{contract.quantity} entregues · {contract.status === 'suspended' ? 'suspenso' : contract.status === 'active' ? 'ativo' : contract.status}
            </dd>
          </>
        )}
      </dl>
      <p className="mt-1.5 text-[10px] text-ink-400">Riscos: {def.risk}</p>
      {s.reason && <p className="mt-1 text-[11px] text-brass-400">{s.reason}</p>}
    </div>
  );
}
