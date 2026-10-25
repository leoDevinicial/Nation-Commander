import { useMemo, useState } from 'react';
import type { NationView } from '../../../shared/protocol.ts';
import { interestRate, spendPct, type Budget } from '../../../shared/strategic/NationalSimulation.ts';
import { COEF, LIMITS } from '../../../shared/strategic/params.ts';
import { formatPct, formatSigned, formatUsd } from '../../lib/format.ts';

const ROWS: { key: keyof Budget; label: string; limits: readonly [number, number]; hint: string }[] = [
  { key: 'taxPct', label: 'Receita tributária', limits: LIMITS.taxPct, hint: 'Mais impostos reduzem o déficit, mas freiam o crescimento e derrubam a aprovação.' },
  { key: 'defensePct', label: 'Defesa', limits: LIMITS.defensePct, hint: 'Financia a logística do teatro (suprimentos/s), com retornos decrescentes.' },
  { key: 'educationPct', label: 'Educação', limits: LIMITS.categoryPct, hint: 'Melhora a aprovação; eleva o crescimento só após anos (capital humano).' },
  { key: 'healthPct', label: 'Saúde', limits: LIMITS.categoryPct, hint: 'Serviço público: pesa na aprovação.' },
  { key: 'infrastructurePct', label: 'Infraestrutura', limits: LIMITS.categoryPct, hint: 'Acumula estoque de infraestrutura que eleva o crescimento gradualmente.' },
  { key: 'researchPct', label: 'Pesquisa (pública)', limits: LIMITS.researchPct, hint: 'Velocidade das pesquisas: custo em % do PIB × ano.' },
  { key: 'socialPct', label: 'Previdência, assistência e administração', limits: LIMITS.categoryPct, hint: 'Serviço público: pesa na aprovação. Cortes aliviam o déficit.' },
];

export function BudgetTab({ nation, onApply, balanceMode }: { nation: NationView; onApply: (b: Budget) => void; balanceMode: 'parity' | 'realistic' }) {
  // rascunho só existe enquanto o jogador edita; sem ele, mostra o orçamento vigente
  const [edited, setEdited] = useState<Budget | null>(null);
  const draft = edited ?? nation.budget;
  const dirty = edited !== null;

  const preview = useMemo(() => {
    const debtPct = (nation.debtUsd / nation.gdpUsd) * 100;
    const interestPct = interestRate(nation.inflationPct, debtPct) * (debtPct / 100);
    const spend = spendPct(draft);
    const balance = draft.taxPct - spend - interestPct;
    const gdpForTheater = balanceMode === 'parity' ? COEF.parityGdpUsd : nation.gdpUsd;
    const supply = COEF.theaterSupplyK * Math.log10(1 + ((draft.defensePct / 100) * gdpForTheater) / 1e9);
    return { interestPct, spend, balance, supplyBase: supply };
  }, [draft, nation, balanceMode]);

  const set = (key: keyof Budget, v: number) => setEdited({ ...draft, [key]: v });
  const usd = (pct: number) => formatUsd((pct / 100) * nation.gdpUsd);

  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink-400">
        Valores anuais em % do PIB ({formatUsd(nation.gdpUsd)}). Os efeitos não são instantâneos: aprovação, crescimento e inflação reagem ao
        longo de semanas e meses de jogo (1 dia = 1 s a 1×).
      </p>
      <div className="space-y-2.5">
        {ROWS.map((r) => {
          const ref = nation.referenceBudget[r.key];
          const v = draft[r.key];
          return (
            <div key={r.key} title={r.hint}>
              <div className="flex items-baseline justify-between">
                <label htmlFor={`b-${r.key}`} className="text-ink-200">
                  {r.label}
                </label>
                <span className="font-mono text-ink-100">
                  {formatPct(v, 1)} <span className="text-ink-400">· {usd(v)}</span>
                </span>
              </div>
              <input
                id={`b-${r.key}`}
                type="range"
                min={r.limits[0]}
                max={r.limits[1]}
                step={0.1}
                value={v}
                onChange={(e) => set(r.key, Number(e.target.value))}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full accent-[#4ca3e0]"
              />
              <div className="flex justify-between text-[10px] text-ink-400">
                <span>{r.hint}</span>
                <span className="shrink-0 pl-2">ref. {formatPct(ref, 1)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-ink-700 bg-ink-900 p-2.5 font-mono">
        <span className="font-sans text-ink-400">Receitas</span>
        <span className="text-right">{formatPct(draft.taxPct)}</span>
        <span className="font-sans text-ink-400">Despesas primárias</span>
        <span className="text-right">{formatPct(preview.spend)}</span>
        <span className="font-sans text-ink-400">Juros da dívida ({formatPct(interestRate(nation.inflationPct, (nation.debtUsd / nation.gdpUsd) * 100))} a.a.)</span>
        <span className="text-right">{formatPct(preview.interestPct)}</span>
        <span className="font-sans font-semibold text-ink-200">Saldo (− = déficit)</span>
        <span className={`text-right font-semibold ${preview.balance < 0 ? 'text-red-300' : 'text-signal-green'}`}>
          {formatSigned(preview.balance, 1, '%')} · {usd(preview.balance)}
        </span>
        <span className="font-sans text-ink-400">Logística do teatro (sem bônus)</span>
        <span className="text-right">+{preview.supplyBase.toFixed(2)}/s</span>
      </div>
      {nation.taxAdjustmentPct > 0 && (
        <p className="text-[10px] text-ink-400">
          A receita de referência inclui um ajuste de {formatPct(nation.taxAdjustmentPct)} do PIB: os dados de receita cobrem só o governo central,
          enquanto saúde e educação cobrem todos os níveis de governo. O ajuste preserva o déficit observado.
        </p>
      )}
      <div className="flex gap-2">
        <button
          className="btn btn-primary flex-1"
          disabled={!dirty}
          onClick={() => {
            onApply(draft);
            setEdited(null);
          }}
        >
          Aplicar orçamento
        </button>
        <button
          className="btn"
          disabled={!dirty}
          onClick={() => setEdited(null)}
        >
          Descartar
        </button>
        <button
          className="btn"
          onClick={() => setEdited({ ...nation.referenceBudget })}
          title="Volta aos valores de referência do país"
        >
          Referência
        </button>
      </div>
    </div>
  );
}
