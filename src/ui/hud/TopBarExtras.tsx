import { WORKS_SHARE_OF_INFRA } from '../../../shared/strategic/params.ts';
import { BUILDINGS } from '../../../shared/sim/config.ts';
import { formatUsd } from '../../../shared/sim/upgrades.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { producibleIcon, producibleLabel } from './CommandPanel.tsx';

export type TopBarPopover = 'money' | 'production' | 'perf' | 'sandbox' | null;

/**
 * Dinheiro do teatro na barra superior (também no celular): a verba de obras que paga as
 * melhorias de construções, com quanto entra por segundo. Um toque abre a explicação.
 */
export function MoneyChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const mySlot = useHudStore((s) => s.mySlot);
  const speed = useHudStore((s) => s.speed);
  const works = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.works);
  if (!works) return null;
  // 1 dia de jogo por segundo a 1×; a recarga diária é 1/365 do teto anual
  const perSec = (works.capUsd / 365) * speed;
  const full = works.fundUsd >= works.capUsd - 1;
  return (
    <button
      className={`flex shrink-0 items-center gap-1 rounded px-1 py-0.5 ${open ? 'bg-ink-700' : 'hover:bg-ink-800'}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Verba de obras: ${formatUsd(works.fundUsd)}`}
      title="Verba de obras (dinheiro das melhorias) — toque para entender"
    >
      <span className="font-bold text-emerald-300" aria-hidden>
        US$
      </span>
      <span className="font-mono font-bold">{formatUsd(works.fundUsd).replace('US$ ', '')}</span>
      <span className={`hidden text-[11px] sm:inline ${full ? 'text-ink-400' : 'text-signal-green'}`}>{full ? 'cheio' : `+${formatUsd(perSec).replace('US$ ', '')}/s`}</span>
    </button>
  );
}

export function MoneyPopover({ onClose }: { onClose: () => void }) {
  const mySlot = useHudStore((s) => s.mySlot);
  const speed = useHudStore((s) => s.speed);
  const nation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const openPanelAt = useNationalStore((s) => s.openPanelAt);
  if (!nation) return null;
  const w = nation.works;
  const perDay = w.capUsd / 365;
  const last = w.ledger.at(-1);
  return (
    <div className="panel scroll-thin max-h-[calc(100dvh-4.5rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto bg-ink-900 p-3 text-xs text-ink-200" role="dialog" aria-label="Verba de obras">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink-100">Verba de obras: {formatUsd(w.fundUsd)}</div>
          <div className="text-ink-400">teto {formatUsd(w.capUsd)} por ano</div>
        </div>
        <button className="btn min-h-8 px-2" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      <dl className="mt-2 space-y-1.5">
        <div>
          <dt className="font-semibold text-ink-100">Para que serve</dt>
          <dd>Paga as melhorias de construções (o botão ⬆ Melhorar de cada prédio). Recursos do mapa pagam o resto da obra.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-100">De onde vem</dt>
          <dd>
            Do orçamento do seu país: {(WORKS_SHARE_OF_INFRA * 100).toFixed(1).replace('.', ',')}% do gasto anual com infraestrutura ({nation.budget.infrastructurePct.toFixed(1).replace('.', ',')}% do
            PIB). Já está contado nas contas públicas — não cria dívida.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-100">Quanto entra</dt>
          <dd>
            {formatUsd(perDay)} por dia de jogo — {formatUsd(perDay * speed)}/s na velocidade atual ({speed}×), até encher o teto
            {w.fundUsd >= w.capUsd - 1 ? ' (cheio agora: gaste em melhorias)' : ''}.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-100">Como ter mais</dt>
          <dd>Aumente a fatia de infraestrutura no Orçamento (eleva o teto e a recarga). Cancelar uma obra devolve 80%.</dd>
        </div>
        {last && (
          <div className="text-ink-400">
            Último lançamento: {last.description} ({last.usd > 0 ? '−' : '+'}
            {formatUsd(Math.abs(last.usd))}) · gasto na partida {formatUsd(w.spentUsd)}
          </div>
        )}
      </dl>
      <button
        className="btn btn-primary mt-3 min-h-10 w-full"
        onClick={() => {
          openPanelAt('budget');
          onClose();
        }}
      >
        Abrir Orçamento
      </button>
    </div>
  );
}

/** Quantas unidades estão em produção em todos os edifícios (toque abre a lista). */
export function ProductionChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const production = useHudStore((s) => s.production);
  const total = production.reduce((n, p) => n + p.queue.length, 0);
  const military = production.reduce((n, p) => n + p.queue.filter((q) => q.unitType !== 'citizen' && q.unitType !== 'recruit').length, 0);
  return (
    <button
      className={`flex shrink-0 items-center gap-1 rounded px-1 py-0.5 ${open ? 'bg-ink-700' : 'hover:bg-ink-800'} ${total === 0 ? 'text-ink-400' : ''}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Produção: ${total} na fila`}
      title="Fila de produção de todos os edifícios — toque para ver"
    >
      <span aria-hidden>🏭</span>
      <span className="font-mono font-bold">{total}</span>
      {military > 0 && <span className="hidden text-[11px] text-brass-400 sm:inline">⚔{military}</span>}
    </button>
  );
}

export function ProductionPopover({ runtime, onClose }: { runtime: GameRuntime; onClose: () => void }) {
  const production = useHudStore((s) => s.production);
  return (
    <div className="panel scroll-thin max-h-[calc(100dvh-4.5rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto bg-ink-900 p-3 text-xs text-ink-200" role="dialog" aria-label="Fila de produção">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink-100">Em produção</div>
        <button className="btn min-h-8 px-2" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      {production.length === 0 ? (
        <p className="mt-2 text-ink-400">Nada na fila. Selecione a base militar (recrutas, infantaria), a fábrica (veículos) ou o Centro de Comando (cidadãos) para produzir.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {production.map((p) => {
            const [first, ...rest] = p.queue;
            return (
              <li key={p.id}>
                <button
                  className="w-full rounded border border-ink-700 bg-ink-900/70 p-1.5 text-left hover:border-ink-500"
                  onClick={() => {
                    runtime.focusBuilding(p.id);
                    onClose();
                  }}
                  title="Ir até o edifício"
                >
                  <div className="flex justify-between text-ink-400">
                    <span>{BUILDINGS[p.type].label}</span>
                    <span>ir ›</span>
                  </div>
                  {first && (
                    <div className="mt-0.5 flex items-center gap-2">
                      <span aria-hidden>{producibleIcon(first.unitType)}</span>
                      <span className="font-semibold text-ink-100">{producibleLabel(first.unitType)}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink-950">
                        <div className="h-full bg-brass-400" style={{ width: `${first.progress * 100}%` }} />
                      </div>
                      <span className="font-mono">{Math.round(first.progress * 100)}%</span>
                    </div>
                  )}
                  {rest.length > 0 && <div className="mt-0.5 text-ink-400">Depois: {rest.map((q) => producibleLabel(q.unitType)).join(', ')}</div>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
