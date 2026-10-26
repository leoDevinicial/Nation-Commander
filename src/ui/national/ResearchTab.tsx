import type { NationView } from '../../../shared/protocol.ts';
import {
  TECH_CATEGORIES,
  TECH_IDS,
  TECHNOLOGIES,
  missingPrereqs,
  researchBlocker,
  researchDailyProgress,
  researchEtaDays,
  type TechCategory,
  type TechId,
} from '../../../shared/strategic/technologies.ts';
import { formatPct, formatUsd } from '../../lib/format.ts';

const CATEGORY_ORDER: TechCategory[] = ['military', 'state', 'industry', 'resources'];

/**
 * Pesquisa nacional (Fase 5): árvore por categoria de investimento, com pré-requisitos, custo em
 * US$ (no PIB atual), investido até agora, prazo estimado com a verba de P&D atual e o que cada
 * pesquisa libera. Pesquisas militares liberam pacotes de modernização: as tropas só ganham o
 * benefício depois de modernizadas numa instalação (painel de comando das unidades).
 */
export function ResearchTab({ nation, onSelect }: { nation: NationView; onSelect: (id: TechId | null) => void }) {
  const r = nation.research;
  const pct = nation.budget.researchPct;
  const yearlyUsd = (pct / 100) * nation.gdpUsd;
  const current = r.current ? TECHNOLOGIES[r.current] : null;
  const capped = r.current ? researchDailyProgress(r.current, pct).capped : false;
  return (
    <div className="space-y-3 text-xs">
      <section className="rounded border border-ink-700 bg-ink-900 p-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-ink-100">Orçamento de P&amp;D</span>
          <span className="font-mono text-ink-200">
            {formatPct(pct, 2)} do PIB · {formatUsd(yearlyUsd)}/ano
          </span>
        </div>
        {current ? (
          <p className="mt-1 text-ink-300">
            Projeto atual: <b className="text-ink-100">{current.label}</b>. Toda a verba de P&amp;D vai para ele.
            {capped && <span className="text-brass-400"> Ritmo máximo atingido: a duração mínima é de {current.minDays} dias e verba extra não acelera mais.</span>}
          </p>
        ) : (
          <p className="mt-1 text-brass-400">
            Nenhum projeto ativo: a verba de P&amp;D ({formatUsd(yearlyUsd / 365)}/dia) está sendo gasta sem retorno tecnológico. Já foram {formatUsd(r.idleUsd)} assim.
          </p>
        )}
        <p className="mt-1 text-[11px] text-ink-400">
          Mais verba (aba Orçamento) acelera até a duração mínima de cada pesquisa e compete com as outras despesas do país. Pausar ou trocar de projeto mantém o progresso e
          o que foi investido, mas nada é devolvido. Pesquisas militares liberam pacotes de modernização: cada tropa precisa ser modernizada numa base militar ou fábrica.
        </p>
      </section>

      {CATEGORY_ORDER.map((cat) => (
        <section key={cat}>
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
            {TECH_CATEGORIES[cat].icon} {TECH_CATEGORIES[cat].label}
          </h3>
          <div className="space-y-2">
            {TECH_IDS.filter((id) => TECHNOLOGIES[id].category === cat).map((id) => (
              <TechCard key={id} id={id} nation={nation} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TechCard({ id, nation, onSelect }: { id: TechId; nation: NationView; onSelect: (id: TechId | null) => void }) {
  const r = nation.research;
  const t = TECHNOLOGIES[id];
  const done = r.done.includes(id);
  const active = r.current === id;
  const progress = r.progress[id] ?? 0;
  const invested = r.invested?.[id] ?? 0;
  const blocker = done ? null : researchBlocker(id, r.done);
  const locked = !done && missingPrereqs(id, r.done).length > 0;
  const totalUsd = (t.cost / 100) * nation.gdpUsd;
  const eta = researchEtaDays(id, progress, nation.budget.researchPct);
  const state = done ? 'done' : active ? 'active' : locked ? 'locked' : progress > 0 ? 'paused' : 'ready';
  const border = { done: 'border-signal-green/40', active: 'border-signal-blue bg-ink-850', locked: 'border-ink-700 opacity-75', paused: 'border-brass-400/50', ready: 'border-ink-700' }[state];
  return (
    <div className={`rounded border bg-ink-900 p-2.5 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-ink-100">
            {done ? '✔ ' : active ? '▶ ' : locked ? '🔒 ' : ''}
            {t.label}
          </div>
          <div className="text-[11px] text-ink-400">{t.description}</div>
        </div>
        {done ? (
          <span className="shrink-0 text-signal-green">Concluída{r.doneDay?.[id] !== undefined ? ` (dia ${r.doneDay[id]})` : ''}</span>
        ) : active ? (
          <button className="btn shrink-0 px-2 py-1 text-xs" onClick={() => onSelect(null)} title="Pausa o projeto: o progresso e o investido ficam guardados">
            Pausar
          </button>
        ) : (
          <button className="btn shrink-0 px-2 py-1 text-xs" disabled={!!blocker} onClick={() => onSelect(id)} title={blocker ?? (r.current ? 'Troca o projeto atual por este (o atual fica pausado, sem perder progresso)' : 'Iniciar')}>
            {progress > 0 ? 'Retomar' : 'Pesquisar'}
          </button>
        )}
      </div>

      {t.prereqs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
          <span className="text-ink-400">Requer:</span>
          {t.prereqs.map((p) => {
            const ok = r.done.includes(p);
            return (
              <span key={p} className={`rounded border px-1 ${ok ? 'border-signal-green/40 text-signal-green' : 'border-red-400/40 text-red-300'}`}>
                {ok ? '✔' : '✖'} {TECHNOLOGIES[p].label}
              </span>
            );
          })}
        </div>
      )}

      <ul className="mt-1.5 space-y-0.5 text-[11px] text-ink-200">
        {t.unlocks.map((u) => (
          <li key={u} className="flex gap-1.5">
            <span className="text-signal-blue" aria-hidden>
              ›
            </span>
            {u}
          </li>
        ))}
      </ul>

      {!done && (
        <>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#1b2a3a]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded ${active ? 'bg-signal-blue' : 'bg-brass-400/70'}`} style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="w-28 text-right font-mono text-[10px] text-ink-400">
              {Math.round(progress * 100)}% · {Number.isFinite(eta) ? `~${eta} dias` : 'sem verba'}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 text-[10px] text-ink-400 sm:grid-cols-4">
            <span>Custo: {formatUsd(totalUsd)}</span>
            <span>Investido: {formatUsd(invested)}</span>
            <span>Falta: {formatUsd(totalUsd * (1 - progress))}</span>
            <span>Mínimo: {t.minDays} dias</span>
          </div>
        </>
      )}
    </div>
  );
}
