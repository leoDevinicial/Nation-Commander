import { COUNTRIES } from '../../../shared/data/countries.ts';

export function CountrySelect({ value, onChange, disabled, id }: { value: string; onChange: (v: string) => void; disabled?: boolean; id?: string }) {
  return (
    <select id={id} className="field" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {COUNTRIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.id})
        </option>
      ))}
    </select>
  );
}
