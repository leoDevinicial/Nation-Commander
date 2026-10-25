import type { NationView } from '../../../shared/protocol.ts';
import { countryReference } from '../../../shared/strategic/reference.ts';
import { ALL_ROWS, ReferenceRow } from '../components/CountryCard.tsx';

export function DataTab({ nation }: { nation: NationView }) {
  const ref = countryReference(nation.countryId);
  return (
    <div className="space-y-2 text-xs">
      <p className="text-ink-400">
        Dados de referência usados para iniciar a simulação. Eles nunca são alterados pela partida: o que acontece depois de 01/01/2026 é uma
        linha histórica alternativa.
      </p>
      <table className="w-full">
        <tbody>
          {ALL_ROWS.map((r) => (
            <ReferenceRow key={r.key} k={r.key} v={ref.values[r.key]} fmt={r.fmt} />
          ))}
        </tbody>
      </table>
      {nation.estimatedFields.length > 0 && (
        <p className="rounded border border-brass-500/50 p-2 text-ink-200">
          <span aria-hidden>▲ </span>Sem dado confiável para: {nation.estimatedFields.join(', ')}. A simulação usa valores de jogo declarados em{' '}
          <code>shared/strategic/params.ts</code> (FALLBACKS) para esses campos.
        </p>
      )}
    </div>
  );
}
