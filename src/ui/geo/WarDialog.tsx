import { warPreview, type NationId } from '../../../shared/strategic/Diplomacy.ts';
import { NPC_BASE_ID } from '../../../shared/strategic/NationalSimulation.ts';
import { TREATY_LABEL } from '../../game/nationalText.ts';
import { formatUsd } from '../../lib/format.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { ResourceIcon } from '../components/Resources.tsx';

/**
 * Confirmação de declaração de guerra. Mostra custos e consequências calculados pela mesma
 * regra do servidor (`warPreview`), mas só com o que o governo do jogador conhece — por isso
 * é rotulada como estimativa. O servidor recalcula com informação completa ao confirmar.
 */
export function WarDialog({ target, mySlot, nameOf, onConfirm, onClose }: { target: NationId; mySlot: number; nameOf: (id: number) => string; onConfirm: () => void; onClose: () => void }) {
  const me = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const view = useNationalStore((s) => s.diplomacy);
  const stock = useHudStore((s) => s.players.find((p) => p.slot === mySlot)?.resources ?? null);
  if (!me || !view) return null;
  const f = view.nations.find((n) => n.id === target);
  const p = warPreview({
    actor: mySlot,
    target,
    actorGdpUsd: me.gdpUsd,
    actorDebtPctGdp: (me.debtUsd / me.gdpUsd) * 100,
    theaterStock: stock,
    targetInTheater: !!f?.isPlayer,
    known: !!f?.known,
    atWar: view.wars.some(([a, b]) => (a === mySlot && b === target) || (a === target && b === mySlot)),
    treaties: view.treaties,
    isNpc: (id) => id >= NPC_BASE_ID,
    relationWith: (id) => view.relations.find((r) => r.b === id)?.value ?? 0,
  });
  const blocked = p.blockers.length > 0;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950/75 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel panel-frame w-full max-w-md p-4" role="alertdialog" aria-labelledby="war-title" aria-describedby="war-desc">
        <h2 id="war-title" className="font-display text-lg font-bold tracking-wide text-red-300 uppercase">
          Declarar Guerra a {nameOf(target)}
        </h2>
        <p id="war-desc" className="mt-1 text-xs text-ink-400">
          Estimativa com base nas informações que seu governo possui. Tratados e alianças que você desconhece podem trazer consequências adicionais.
        </p>

        <h3 className="label mt-3">Custo da mobilização (cobrado uma vez)</h3>
        <ul className="space-y-1 text-sm">
          <li className="flex justify-between">
            <span>Gasto público extra (financiado por dívida)</span>
            <span className="font-mono">{formatUsd(p.costs.usd)}</span>
          </li>
          <li className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <ResourceIcon type="supplies" /> Suprimentos do teatro
            </span>
            <span className={`font-mono ${stock && stock.supplies < p.costs.supplies ? 'text-red-300' : ''}`}>
              {p.costs.supplies} <span className="text-ink-400">/ {Math.floor(stock?.supplies ?? 0)}</span>
            </span>
          </li>
          <li className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <ResourceIcon type="oil" /> Combustível do teatro
            </span>
            <span className={`font-mono ${stock && stock.oil < p.costs.oil ? 'text-red-300' : ''}`}>
              {p.costs.oil} <span className="text-ink-400">/ {Math.floor(stock?.oil ?? 0)}</span>
            </span>
          </li>
          <li className="flex justify-between">
            <span>Aprovação do governo</span>
            <span className="font-mono text-red-300">{p.costs.approval} p.p.</span>
          </li>
        </ul>

        <h3 className="label mt-3">Consequências previstas</h3>
        <ul className="list-inside list-disc space-y-0.5 text-xs text-ink-200">
          <li>Combate liberado no teatro de operações para os dois lados (o alvo também passa a poder atacar).</li>
          <li>Relação com {nameOf(target)} cai para estado de guerra; reputação −8 com todos os demais países.</li>
          {p.brokenTreaties.map((t) => (
            <li key={t.id}>{TREATY_LABEL[t.type]} com {nameOf(target)} será rompido.</li>
          ))}
          {p.respondingAllies.map((a) => (
            <li key={a} className="text-red-300">
              {nameOf(a)} (aliado de {nameOf(target)}) deve impor sanções contra seu país e encerrar o comércio.
            </li>
          ))}
          {p.otherAllies.map((a) => (
            <li key={a}>{nameOf(a)} é aliado de {nameOf(target)}; não deve sancionar, mas a relação com ele cai.</li>
          ))}
          {p.respondingAllies.length + p.otherAllies.length === 0 && <li>Nenhum aliado conhecido de {nameOf(target)}.</li>}
        </ul>

        {blocked && (
          <div className="mt-3 rounded border border-signal-red/50 bg-[#2a1210]/70 p-2 text-xs text-red-200" role="alert">
            <div className="font-semibold">Declaração bloqueada</div>
            <ul className="list-inside list-disc">
              {p.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button className="btn flex-1" onClick={onClose} autoFocus>
            Cancelar
          </button>
          <button className="btn btn-danger flex-1" disabled={blocked} onClick={onConfirm}>
            Confirmar Declaração
          </button>
        </div>
      </div>
    </div>
  );
}
