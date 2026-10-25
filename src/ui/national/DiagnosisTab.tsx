import type { NationView } from '../../../shared/protocol.ts';
import type { Factor } from '../../../shared/strategic/NationalSimulation.ts';
import { COEF } from '../../../shared/strategic/params.ts';
import { formatPct, formatSigned } from '../../lib/format.ts';

const POS = '#4ca3e0';
const NEG = '#e08a4c';

function FactorList({ title, factors, unit, note }: { title: string; factors: Factor[]; unit: string; note: string }) {
  const max = Math.max(1, ...factors.map((f) => Math.abs(f.value)));
  const sorted = [...factors].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-2.5">
      <div className="mb-1.5 text-[11px] text-ink-400">{title}</div>
      <ul className="space-y-1">
        {sorted.map((f) => (
          <li key={f.key} className="grid grid-cols-[1fr_100px_76px] items-center gap-2">
            <span className="text-ink-200">{f.label}</span>
            <span className="relative h-2 rounded bg-[#1b2430]" aria-hidden>
              <span className="absolute top-0 h-full w-px bg-ink-600" style={{ left: '50%' }} />
              <span
                className="absolute top-0 h-full rounded"
                style={{
                  background: f.value >= 0 ? POS : NEG,
                  left: f.value >= 0 ? '50%' : `${50 - (Math.abs(f.value) / max) * 50}%`,
                  width: `${(Math.abs(f.value) / max) * 50}%`,
                }}
              />
            </span>
            <span className="text-right font-mono whitespace-nowrap text-ink-100">{formatSigned(f.value, 1, unit)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-ink-400">{note}</p>
    </div>
  );
}

export function DiagnosisTab({ nation }: { nation: NationView }) {
  const protestRisk = nation.approval < COEF.protestApprovalThreshold ? (COEF.protestMaxDailyChance * (COEF.protestApprovalThreshold - nation.approval)) / COEF.protestApprovalThreshold : 0;
  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink-400">
        Fatores calculados pelo motor neste momento — não são previsões do mundo real. Barras à direita (▶ azul) ajudam; à esquerda (◀ laranja)
        prejudicam.
      </p>
      <FactorList
        title={`Aprovação: alvo ${formatPct(Math.max(0, Math.min(100, COEF.approvalBase + nation.approvalFactors.reduce((a, f) => a + f.value, 0))), 0)} (base ${COEF.approvalBase}) — a aprovação atual (${formatPct(nation.approval, 0)}) converge para ele em ~${COEF.approvalDays} dias`}
        factors={nation.approvalFactors}
        unit=" pts"
        note="Inflação e desemprego são comparados à situação de referência do país; serviços e impostos, ao orçamento de referência."
      />
      <FactorList
        title={`Crescimento real anualizado: ${formatPct(nation.realGrowthPct)} (soma dos fatores)`}
        factors={nation.growthFactors}
        unit=" p.p."
        note="A tendência vem do crescimento observado no último ano com dado (limitado a −1% e 6%). Infraestrutura e educação agem com defasagem."
      />
      <div className="rounded border border-ink-700 bg-ink-900 p-2.5">
        <div className="mb-1 text-[11px] text-ink-400">Risco de protestos</div>
        {protestRisk > 0 ? (
          <p className="text-ink-200">
            <span aria-hidden>▲ </span>Aprovação abaixo de {COEF.protestApprovalThreshold}: chance estimada de {formatPct(protestRisk * 100, 2)} por dia. Protestos reduzem
            aprovação e estabilidade. Principais causas: os fatores negativos acima.
          </p>
        ) : (
          <p className="text-ink-200">Sem risco relevante enquanto a aprovação ficar acima de {COEF.protestApprovalThreshold}.</p>
        )}
      </div>
    </div>
  );
}
