import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';

/** Medidor 0–100: o preenchimento indica gravidade; texto e ícone acompanham a cor (Sala de Situação: 10 segmentos). */
export function Meter({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const level =
    v >= 50 ? { color: '#5cc47a', text: 'Estável', Icon: CircleCheck } : v >= 30 ? { color: '#e6a53c', text: 'Atenção', Icon: TriangleAlert } : { color: '#e85c4e', text: 'Crítico', Icon: OctagonAlert };
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="nc-kicker">{label}</span>
        <span className="flex items-center gap-1 text-ink-200">
          <level.Icon size={12} style={{ color: level.color }} aria-hidden /> {level.text} · <span className="nc-num">{v.toFixed(0)}</span>/100
        </span>
      </div>
      <div className="mt-1 flex h-2 gap-[2px]" role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => {
          const part = Math.max(0, Math.min(1, v / 10 - i));
          return (
            <span key={i} className="relative flex-1 bg-white/[0.08]">
              <span className="absolute inset-y-0 left-0" style={{ width: `${part * 100}%`, background: level.color }} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
