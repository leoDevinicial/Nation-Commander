import { useOpsStore } from '../../state/useOpsStore.ts';
import { useState } from 'react';
import type { DiplomacyView, NationView } from '../../../shared/protocol.ts';
import type { DiplomaticAction, NationId, Treaty } from '../../../shared/strategic/Diplomacy.ts';
import { TREATY_LABEL } from '../../game/nationalText.ts';
import { formatSigned } from '../../lib/format.ts';
import { POLITICAL_COLORS, POLITICAL_LABELS, politicalState } from '../../globe/political.ts';
import { Chip, NationActions, pairInfo } from '../geo/NationActions.tsx';

interface Props {
  me: NationView;
  diplomacy: DiplomacyView;
  day: number;
  nameOf: (id: number) => string;
  onAction: (a: DiplomaticAction) => void;
  onDeclareWar: (id: NationId) => void;
  onShowOnGlobe: (countryId: string) => void;
}

/** Lista diplomática (mesmas ações do globo, em formato de lista). */
export function DiplomacyTab({ me, diplomacy, day, nameOf, onAction, onDeclareWar, onShowOnGlobe }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const mine = me.slot;
  const others = [...diplomacy.nations].sort(
    (a, b) =>
      Number(b.known) - Number(a.known) || Number(b.isPlayer) - Number(a.isPlayer) || (pairInfo(diplomacy, mine, b.id).relation?.value ?? 0) - (pairInfo(diplomacy, mine, a.id).relation?.value ?? 0),
  );
  const myTreaties = diplomacy.treaties.filter((t) => t.a === mine || t.b === mine);
  const incoming = diplomacy.pacts?.offers.filter((o) => o.to === mine) ?? [];

  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink-400">
        Relações começam neutras (não há base confiável de relações bilaterais na data de referência), exceto a rivalidade com quem tem forças neste teatro. Só há negociação com países com quem há
        contato. A visão completa — mapa político, rotas e conflitos — está no{' '}
        <button className="underline decoration-dotted hover:text-ink-100" onClick={() => onShowOnGlobe(me.countryId)}>
          Globo Diplomático
        </button>
        .
      </p>

      {incoming.length > 0 && (
        <div className="rounded-[3px] border border-brass-400/50 bg-brass-400/[0.06] p-2.5">
          <div className="nc-kicker mb-1.5">Convites recebidos</div>
          <ul className="space-y-1.5">
            {incoming.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink-100">
                  {nameOf(o.from)} propõe {o.treaty === 'alliance' ? 'uma aliança' : 'um pacto de não agressão'} <span className="text-ink-400">· até o dia {o.expiresDay}</span>
                </span>
                <span className="flex gap-1">
                  <button className="btn btn-primary px-2 py-0.5 text-[11px]" data-tour="offer-accept" onClick={() => onAction({ type: 'answer_offer', offerId: o.id, accept: true })}>
                    Aceitar
                  </button>
                  <button className="btn px-2 py-0.5 text-[11px]" onClick={() => onAction({ type: 'answer_offer', offerId: o.id, accept: false })}>
                    Recusar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {myTreaties.length > 0 && (
        <div className="rounded border border-ink-700 bg-ink-900 p-2.5">
          <div className="mb-1.5 text-[11px] text-ink-400">Acordos e sanções em vigor</div>
          <ul className="space-y-1">
            {myTreaties.map((t) => (
              <TreatyRow key={t.id} t={t} mine={mine} day={day} nameOf={nameOf} view={diplomacy} onCancel={() => onAction({ type: 'cancel_treaty', treatyId: t.id })} />
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1.5">
        {others.map((o) => {
          const st = politicalState(diplomacy, mine, o.id);
          const info = pairInfo(diplomacy, mine, o.id);
          const expanded = open === o.id;
          return (
            <li key={o.id} className={`rounded border ${expanded ? 'border-ink-500 bg-ink-850' : 'border-ink-700 bg-ink-900'}`}>
              <button className="flex min-h-10 w-full items-center gap-2 p-2 text-left" onClick={() => setOpen(expanded ? null : o.id)} aria-expanded={expanded}>
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: POLITICAL_COLORS[st] }} aria-hidden />
                <span className={`w-28 truncate font-semibold ${o.known ? 'text-ink-100' : 'text-ink-400'}`}>{nameOf(o.id)}</span>
                <span className="w-10 text-right font-mono text-ink-100">{o.known ? formatSigned(info.relation?.value ?? 0, 0) : '—'}</span>
                <span className="flex flex-1 flex-wrap justify-end gap-1">
                  <Chip tone={st === 'war' || st === 'sanctions' || st === 'hostile' ? 'bad' : st === 'ally' || st === 'trade' ? 'good' : 'info'}>{POLITICAL_LABELS[st]}</Chip>
                  {o.isPlayer && <Chip tone="info">No teatro</Chip>}
                  {info.mission && <Chip tone="info">Missão</Chip>}
                  {o.contactDueDay !== null && <Chip tone="info">Contato em curso</Chip>}
                </span>
              </button>
              {expanded && (
                <div className="border-t border-ink-700 p-2">
                  <NationActions
                    f={o}
                    me={me}
                    view={diplomacy}
                    day={day}
                    nameOf={nameOf}
                    onAction={onAction}
                    onDeclareWar={onDeclareWar}
                    onOpenOperations={(id) => useOpsStore.getState().set({ opMap: id })}
                  />
                  <button className="mt-2 text-[11px] text-ink-400 underline decoration-dotted hover:text-ink-100" onClick={() => onShowOnGlobe(o.countryId)}>
                    Ver no globo
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TreatyRow({ t, mine, day, nameOf, view, onCancel }: { t: Treaty; mine: number; day: number; nameOf: (id: number) => string; view: DiplomacyView; onCancel: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const other = t.a === mine ? t.b : t.a;
  const team = t.team || (!t.pact && t.type === 'alliance' && t.endDay - t.startDay >= 1_000_000);
  const label = t.type === 'sanctions'
    ? t.a === mine
      ? `Sanções contra ${nameOf(t.b)}`
      : `Sanções de ${nameOf(t.a)} contra nós`
    : team
      ? `Aliado de time: ${nameOf(other)}`
      : t.pact
        ? `${t.type === 'alliance' ? 'Aliança' : 'Pacto de não agressão'} com ${nameOf(other)}`
        : `${TREATY_LABEL[t.type]} com ${nameOf(other)}`;
  const canCancel = !team && (t.type !== 'sanctions' || t.a === mine);
  const indemnity = t.pact && view.pacts ? (t.type === 'alliance' ? view.pacts.allianceIndemnityUsd : view.pacts.napIndemnityUsd) : 0;
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-ink-200">
        {label} <span className="text-ink-400">· {t.pact || team ? 'sem prazo' : `restam ${Math.max(0, t.endDay - day)} dias`}</span>
      </span>
      {canCancel &&
        (confirm ? (
          <span className="flex gap-1">
            <button className="btn btn-danger px-2 py-0.5 text-[11px]" onClick={onCancel}>
              {t.type === 'sanctions' ? 'Retirar' : t.pact ? `Romper e pagar US$ ${(indemnity / 1e6).toFixed(1).replace('.', ',')} mi` : 'Romper (custa relação)'}
            </button>
            <button className="btn px-2 py-0.5 text-[11px]" onClick={() => setConfirm(false)}>
              Não
            </button>
          </span>
        ) : (
          <button className="btn px-2 py-0.5 text-[11px]" onClick={() => setConfirm(true)}>
            {t.type === 'sanctions' ? 'Retirar' : 'Romper'}
          </button>
        ))}
    </li>
  );
}
