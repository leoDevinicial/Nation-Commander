/** Medidor 0–100: o preenchimento indica gravidade; texto e ícone acompanham a cor. */
export function Meter({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const level = v >= 50 ? { color: '#5cc47a', track: '#1d3326', text: 'Estável', icon: '●' } : v >= 30 ? { color: '#e0b44c', track: '#3a3018', text: 'Atenção', icon: '▲' } : { color: '#e05a4c', track: '#3a1a17', text: 'Crítico', icon: '✖' };
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-ink-400">{label}</span>
        <span className="text-ink-200">
          <span aria-hidden>{level.icon}</span> {level.text} · <span className="font-mono">{v.toFixed(0)}</span>/100
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded" style={{ background: level.track }} role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded" style={{ width: `${v}%`, background: level.color }} />
      </div>
    </div>
  );
}
