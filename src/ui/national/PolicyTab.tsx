import type { NationView } from '../../../shared/protocol.ts';
import {
  DECREE_IDS,
  DECREE_MIN_DAYS,
  DECREES,
  FACTION,
  FACTION_IDS,
  FACTIONS,
  REQUEST,
  demandText,
  policyEffects,
  requestText,
  type DecreeId,
} from '../../../shared/strategic/policies.ts';
import { Meter } from './Meter.tsx';

/**
 * Política (estilo Tropico): decretos com efeito duplo, satisfação e exigências das facções, e o
 * pedido em aberto de uma potência. Tudo vem do estado nacional enviado pelo servidor; os números
 * mostrados são os mesmos que o motor aplica (`policyEffects`).
 */
export function PolicyTab({
  nation,
  day,
  nameOf,
  onDecree,
  onRespond,
}: {
  nation: NationView;
  day: number;
  nameOf: (id: number) => string;
  onDecree: (id: DecreeId, active: boolean) => void;
  onRespond: (accept: boolean) => void;
}) {
  const p = nation.policies;
  if (!p) return <p className="text-ink-400">Política indisponível nesta partida.</p>;
  const fx = policyEffects(p);
  const pctDelta = (mul: number) => `${mul < 1 ? '−' : '+'}${Math.round(Math.abs(1 - mul) * 100)}%`;
  const active: string[] = [];
  if (fx.recruitCostMul !== 1) active.push(`recrutas ${pctDelta(fx.recruitCostMul)}`);
  if (fx.productionTimeMul !== 1) active.push(`tempo de produção ${pctDelta(fx.productionTimeMul)}`);
  if (fx.foodUpkeepMul !== 1) active.push(`consumo de comida ${pctDelta(fx.foodUpkeepMul)}`);
  if (fx.gatherMul !== 1) active.push(`coleta ${pctDelta(fx.gatherMul)}`);
  if (Math.abs(fx.approval) >= 0.05) active.push(`aprovação ${fx.approval > 0 ? '+' : '−'}${Math.abs(fx.approval).toFixed(1).replace('.', ',')}`);
  const req = p.request;
  return (
    <div className="space-y-3 text-xs">
      <section className="rounded border border-ink-700 bg-ink-900 p-2.5">
        <div className="font-semibold text-ink-100">Efeito atual no teatro</div>
        <p className="mt-1 text-ink-300">{active.length ? active.join(' · ') : 'Nenhum decreto em vigor e nenhuma facção em protesto.'}</p>
      </section>

      <section>
        <div className="label">Decretos</div>
        <p className="mb-1.5 text-[11px] text-ink-400">Cada decreto tem um ganho e um custo. Depois de decretado, vigora pelo menos {DECREE_MIN_DAYS} dias.</p>
        <ul className="space-y-1.5">
          {DECREE_IDS.map((id) => {
            const d = DECREES[id];
            const cur = p.decrees.find((x) => x.id === id);
            const left = cur ? DECREE_MIN_DAYS - (day - cur.sinceDay) : 0;
            return (
              <li key={id} className={`rounded border p-2 ${cur ? 'border-brass-400 bg-ink-850' : 'border-ink-700'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-100">{d.label}</span>
                  <button className={`btn px-2 py-1 text-[11px] ${cur ? '' : 'btn-primary'}`} disabled={!!cur && left > 0} onClick={() => onDecree(id, !cur)} title={cur && left > 0 ? `Pode ser revogado em ${left} dias` : undefined}>
                    {cur ? (left > 0 ? `Em vigor (revogar em ${left} d)` : 'Revogar') : 'Decretar'}
                  </button>
                </div>
                <div className="mt-0.5 text-signal-green">+ {d.gain}</div>
                <div className="text-signal-red">− {d.cost}</div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="label">Facções</div>
        <p className="mb-1.5 text-[11px] text-ink-400">
          Cumprir uma exigência rende aprovação e recursos no teatro. Ignorar baixa a satisfação; abaixo de {FACTION.unrestBelow}, a facção protesta.
        </p>
        <ul className="space-y-2">
          {FACTION_IDS.map((id) => {
            const f = p.factions[id];
            const def = FACTIONS[id];
            return (
              <li key={id} className="rounded border border-ink-700 p-2">
                <Meter label={def.label} value={f.satisfaction} hint={`Em protesto: ${def.unrest}`} />
                {f.satisfaction < FACTION.unrestBelow && <div className="mt-1 text-signal-red">Em protesto: {def.unrest}.</div>}
                {f.demand ? (
                  <div className="mt-1 text-ink-200">
                    Exige: <b>{demandText(f.demand.demand)}</b> <span className="text-ink-400">· faltam {Math.max(0, f.demand.dueDay - day)} dias</span>
                  </div>
                ) : (
                  <div className="mt-1 text-ink-400">Sem exigência no momento.</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="label">Pedido de uma potência</div>
        {req ? (
          <div className="rounded border border-signal-blue/40 bg-signal-blue/10 p-2">
            <div className="text-ink-100">
              <b>{nameOf(req.from)}</b> pede: {requestText(req.request, nameOf)}
            </div>
            <div className="mt-0.5 text-ink-400">
              Faltam {Math.max(0, req.dueDay - day)} dias. Cumprir: relação +{REQUEST.relationWin} e ajuda em US$. Falhar: relação {REQUEST.relationLoss}. Recusar agora: relação {REQUEST.relationDecline}.
            </div>
            <button className="btn btn-danger mt-1.5 px-2 py-1 text-[11px]" onClick={() => onRespond(false)}>
              Recusar o pedido
            </button>
          </div>
        ) : (
          <p className="text-ink-400">Nenhum pedido em aberto. As grandes economias conhecidas fazem pedidos de tempos em tempos.</p>
        )}
      </section>
    </div>
  );
}
