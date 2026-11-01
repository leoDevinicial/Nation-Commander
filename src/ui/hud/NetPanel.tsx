import { useEffect, useState } from 'react';
import { gameClient } from '../../net/client.ts';
import type { NetSummary } from '../../net/netStats.ts';

/** Lê as medições do cliente uma vez por segundo (sem estado global: o painel só existe enquanto está na tela). */
function useNet(): NetSummary {
  const [s, setS] = useState<NetSummary>(() => gameClient.stats.summary());
  useEffect(() => {
    const t = setInterval(() => setS(gameClient.stats.summary()), 1000);
    return () => clearInterval(t);
  }, []);
  return s;
}

const DOT = { boa: 'bg-signal-green', instável: 'bg-brass-400', ruim: 'bg-red-400', medindo: 'bg-ink-600' } as const;
const ms = (v: number | null) => (v === null ? '—' : `${Math.round(v)} ms`);

/** Ping na barra superior (KNPS): o ponto colorido resume a qualidade da conexão; o clique abre os detalhes. */
export function NetChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const s = useNet();
  return (
    <button
      className={`inline-flex min-h-8 items-center gap-1.5 rounded px-1.5 font-mono text-xs text-ink-400 hover:text-ink-100 ${open ? 'bg-ink-800 text-ink-100' : ''}`}
      onClick={onToggle}
      title="Conexão com o servidor (KNPS): ping, oscilação e cadência"
      aria-expanded={open}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[s.quality]}`} aria-hidden />
      {s.rttP50 === null ? '— ms' : `${Math.round(s.rttP50)} ms`}
    </button>
  );
}

export function NetPopover({ onClose }: { onClose: () => void }) {
  const s = useNet();
  return (
    <div className="panel w-[min(22rem,calc(100vw-1rem))] bg-ink-900 p-3 text-xs text-ink-200" role="dialog" aria-label="Conexão">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink-100">Conexão · KNPS</div>
          <div className={s.quality === 'ruim' ? 'text-red-300' : s.quality === 'instável' ? 'text-brass-400' : 'text-ink-400'}>
            {s.quality === 'medindo' ? 'medindo…' : `Conexão ${s.quality}`}
            {s.reasons.length ? ` — ${s.reasons.join(', ')}` : ''}
          </div>
        </div>
        <button className="btn min-h-8 px-2" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
        <Stat label="Ping (mediana)" value={ms(s.rttP50)} />
        <Stat label="Ping p95" value={ms(s.rttP95)} warn={(s.rttP95 ?? 0) > 250} />
        <Stat label="Oscilação" value={ms(s.jitter)} warn={(s.jitter ?? 0) > 40} />
        <Stat label="Sem resposta" value={`${Math.round(s.unanswered * 100)}%`} warn={s.unanswered > 0.1} />
        <Stat label="Snapshots/s" value={String(s.snapshotsPerSec)} />
        <Stat label="Intervalo p95" value={ms(s.gapP95)} warn={(s.gapP95 ?? 0) > 300} />
        <Stat label="Dados" value={`${s.kbps} kbit/s`} />
      </dl>
      <p className="mt-2 text-[11px] text-ink-400">
        Ping é a ida e volta até o servidor do jogo, contando o tempo que a página leva para ler a resposta: com o jogo travando (poucos quadros por segundo), ele sobe junto. Dados contam o conteúdo já descomprimido; na rede ele viaja comprimido (cerca de 1/18 do tamanho).
      </p>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-400">{label}</dt>
      <dd className={`font-mono ${warn ? 'text-brass-400' : 'text-ink-100'}`}>{value}</dd>
    </div>
  );
}
