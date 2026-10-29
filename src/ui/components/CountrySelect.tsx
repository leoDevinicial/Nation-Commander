import { COUNTRIES } from '../../../shared/data/countries.ts';

export function CountrySelect({
  value,
  onChange,
  disabled,
  id,
  random,
  taken,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
  /** Opção "sortear" no topo (valor 'random'). */
  random?: boolean;
  /** Países já usados por outros na sala (desabilitados). */
  taken?: readonly string[];
  label?: string;
}) {
  return (
    <select id={id} className="field" value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {random && <option value="random">🎲 Sortear outro país</option>}
      {COUNTRIES.map((c) => (
        <option key={c.id} value={c.id} disabled={taken?.includes(c.id)}>
          {c.name} ({c.id})
        </option>
      ))}
    </select>
  );
}
