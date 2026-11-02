import { BUILDINGS } from '../../../shared/sim/config.ts';
import { formatUsd } from '../../../shared/sim/upgrades.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { producibleIcon, producibleLabel } from './CommandPanel.tsx';

export type TopBarPopover = 'money' | 'production' | 'perf' | 'net' | 'sandbox' | null;

/**
 * Caixa do país na barra superior (01/11; também no celular): o saldo disponível e quanto entra ou sai por dia
 * (receitas − despesas), verde ou vermelho. Um toque abre o extrato.
 */
/** Valores do dia: abaixo de US$ 1 mi em mil (o caixa e as obras seguem em mi). */
function perDay(usd: number): string {
  const a = Math.abs(usd);
  return a < 1e6 ? `${Math.round(a / 1e3)} mil` : formatUsd(a).replace('US$ ', '');
}

export function MoneyChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const mySlot = useHudStore((s) => s.mySlot);
  const works = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.works);
  if (!works) return null;
  const net = works.today?.net ?? works.capUsd / 365;
  const negative = works.fundUsd < 0;
  return (
    <button
      className={`flex shrink-0 items-center gap-1 rounded px-1 py-0.5 ${open ? 'bg-ink-700' : 'hover:bg-ink-800'}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Caixa do país: ${formatUsd(works.fundUsd)}, ${net >= 0 ? 'ganhando' : 'perdendo'} US$ ${perDay(net)} por dia`}
      title="Caixa do país — toque para ver de onde vem e para onde vai o dinheiro"
    >
      <span className="font-bold text-emerald-300" aria-hidden>
        US$
      </span>
      <span className={`font-mono font-bold ${negative ? 'text-red-400' : ''}`}>{formatUsd(works.fundUsd).replace('US$ ', '')}</span>
      <span className={`font-mono text-[11px] ${net >= 0 ? 'text-signal-green' : 'text-red-400'}`}>
        {net >= 0 ? '+' : '−'}
        {perDay(net)}/dia
      </span>
    </button>
  );
}

export function MoneyPopover({ onClose }: { onClose: () => void }) {
  const mySlot = useHudStore((s) => s.mySlot);
  const nation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const openPanelAt = useNationalStore((s) => s.openPanelAt);
  if (!nation) return null;
  const w = nation.works;
  const day = w.today;
  const totalIn = day ? day.income.reduce((a, l) => a + l.usd, 0) : 0;
  const totalOut = day ? day.expense.reduce((a, l) => a + l.usd, 0) : 0;
  const last = w.ledger.at(-1);
  const line = (l: { key: string; label: string; usd: number }, sign: '+' | '−') => (
    <div key={l.key} className="flex justify-between gap-2">
      <span className="text-ink-300">{l.label}</span>
      <span className={`font-mono ${sign === '+' ? 'text-signal-green' : 'text-red-300'}`}>
        {l.usd === 0 ? '—' : `${sign}${perDay(l.usd)}`}
      </span>
    </div>
  );
  return (
    <div className="panel scroll-thin max-h-[calc(100dvh-4.5rem)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto bg-ink-900 p-3 text-xs text-ink-200" role="dialog" aria-label="Caixa do país">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-sm font-semibold ${w.fundUsd < 0 ? 'text-red-400' : 'text-ink-100'}`}>Caixa do país: {formatUsd(w.fundUsd)}</div>
          {day && (
            <div className={day.net >= 0 ? 'text-signal-green' : 'text-red-400'}>
              {day.net >= 0 ? 'Ganhando' : 'Perdendo'} US$ {perDay(day.net)} por dia de jogo (1 s a 1×)
            </div>
          )}
        </div>
        <button className="btn min-h-8 px-2" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      {day ? (
        <div className="mt-2 space-y-2">
          <section>
            <div className="mb-0.5 flex justify-between font-semibold text-ink-100">
              <span>Receitas do dia</span>
              <span className="font-mono text-signal-green">+{perDay(totalIn)}</span>
            </div>
            {day.income.map((l) => line(l, '+'))}
          </section>
          <section>
            <div className="mb-0.5 flex justify-between font-semibold text-ink-100">
              <span>Despesas do dia</span>
              <span className="font-mono text-red-300">−{perDay(totalOut)}</span>
            </div>
            {day.expense.map((l) => line(l, '−'))}
          </section>
        </div>
      ) : (
        <p className="mt-2 text-ink-400">O primeiro extrato sai no fim do primeiro dia de jogo.</p>
      )}
      <dl className="mt-2 space-y-1.5 border-t border-ink-700 pt-2">
        <div>
          <dt className="font-semibold text-ink-100">Para que serve</dt>
          <dd>Paga as melhorias de construções, as estradas, os avanços de era e os Grandes Projetos. Sem saldo, essas obras esperam.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-100">Como ganhar mais</dt>
          <dd>
            Mais produção (coletas ligadas à rede e com trabalhadores), exportações e acordos comerciais, e mais infraestrutura e educação no Orçamento. Cada tropa, prédio, estrada e
            unidade de energia custa manutenção todo dia.
          </dd>
        </div>
        {last && (
          <div className="text-ink-400">
            Último gasto: {last.description} ({last.usd > 0 ? '−' : '+'}
            {formatUsd(Math.abs(last.usd))}) · gasto em obras na partida {formatUsd(w.spentUsd)}
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
