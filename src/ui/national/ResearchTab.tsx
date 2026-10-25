import type { NationView } from '../../../shared/protocol.ts';
import { TECH_IDS, TECHNOLOGIES, type TechId } from '../../../shared/strategic/technologies.ts';
import { formatPct } from '../../lib/format.ts';

export function ResearchTab({ nation, onSelect }: { nation: NationView; onSelect: (id: TechId | null) => void }) {
  const r = nation.research;
  const rate = nation.budget.researchPct;
  return (
    <div className="space-y-2 text-xs">
      <p className="text-ink-400">
        Investimento atual: {formatPct(rate, 2)} do PIB. O custo de cada pesquisa está em "% do PIB × ano": com 1% do PIB, uma pesquisa de custo
        0,25 leva cerca de 3 meses de jogo. Efeitos táticos valem para unidades e obras iniciadas depois da conclusão.
      </p>
      {TECH_IDS.map((id) => {
        const t = TECHNOLOGIES[id];
        const done = r.done.includes(id);
        const active = r.current === id;
        const progress = r.progress[id] ?? 0;
        const days = rate > 0 ? Math.ceil(((1 - progress) * t.cost * 365) / rate) : null;
        return (
          <div key={id} className={`rounded border p-2.5 ${active ? 'border-signal-blue bg-ink-850' : 'border-ink-700 bg-ink-900'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink-100">
                {done ? '✔ ' : active ? '▶ ' : ''}
                {t.label}
              </span>
              {done ? (
                <span className="text-signal-green">Concluída</span>
              ) : active ? (
                <button className="btn px-2 py-1 text-xs" onClick={() => onSelect(null)}>
                  Pausar
                </button>
              ) : (
                <button className="btn px-2 py-1 text-xs" onClick={() => onSelect(id)}>
                  Pesquisar
                </button>
              )}
            </div>
            <div className="mt-1 text-ink-400">{t.description}</div>
            {!done && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#1b2a3a]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded bg-signal-blue" style={{ width: `${progress * 100}%` }} />
                </div>
                <span className="w-32 text-right font-mono text-[10px] text-ink-400">
                  {Math.round(progress * 100)}% · {days === null ? 'sem verba' : `~${days} dias`}
                </span>
              </div>
            )}
            <div className="mt-1 text-[10px] text-ink-400">Custo: {String(t.cost).replace('.', ',')} % do PIB × ano</div>
          </div>
        );
      })}
    </div>
  );
}
