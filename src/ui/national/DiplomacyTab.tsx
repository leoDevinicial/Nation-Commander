import { useState } from 'react';
import type { DiplomacyView, NationView } from '../../../shared/protocol.ts';
import { DIPLO, type DiplomaticAction, type Treaty } from '../../../shared/strategic/Diplomacy.ts';
import { TREATY_LABEL } from '../../game/nationalText.ts';
import { formatSigned, formatUsd } from '../../lib/format.ts';

const POS = '#4ca3e0';
const NEG = '#e08a4c';

interface Props {
  me: NationView;
  diplomacy: DiplomacyView;
  day: number;
  nameOf: (id: number) => string;
  /** Adversários nesta partida (outros jogadores). */
  enemies: number[];
  onAction: (a: DiplomaticAction) => void;
}

function RelationBar({ value }: { value: number }) {
  const w = (Math.min(100, Math.abs(value)) / 100) * 50;
  return (
    <span className="relative inline-block h-2 w-28 rounded bg-[#1b2430] align-middle" aria-hidden>
      <span className="absolute top-0 h-full w-px bg-ink-600" style={{ left: '50%' }} />
      <span className="absolute top-0 h-full rounded" style={{ background: value >= 0 ? POS : NEG, left: value >= 0 ? '50%' : `${50 - w}%`, width: `${w}%` }} />
    </span>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: 'good' | 'bad' | 'info' }) {
  const cls = tone === 'good' ? 'border-signal-green/60 text-signal-green' : tone === 'bad' ? 'border-signal-red/60 text-red-300' : 'border-ink-600 text-ink-200';
  return <span className={`rounded border px-1.5 py-px text-[10px] ${cls}`}>{children}</span>;
}

export function DiplomacyTab({ me, diplomacy, day, nameOf, enemies, onAction }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const mine = me.slot;
  const relationWith = (id: number) => diplomacy.relations.find((r) => (r.a === mine && r.b === id) || (r.b === mine && r.a === id));
  const treatiesWith = (id: number) => diplomacy.treaties.filter((t) => (t.a === mine && t.b === id) || (t.b === mine && t.a === id));
  const others = [
    ...enemies.map((id) => ({ id, gdpUsd: null as number | null, enemy: true })),
    ...diplomacy.npcs.map((n) => ({ id: n.id, gdpUsd: n.gdpUsd, enemy: false })),
  ].sort((a, b) => Number(b.enemy) - Number(a.enemy) || (relationWith(b.id)?.value ?? 0) - (relationWith(a.id)?.value ?? 0));
  const myTreaties = diplomacy.treaties.filter((t) => t.a === mine || t.b === mine);
  const aidPct = 0.1;

  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink-400">
        Não há base de dados confiável sobre relações bilaterais na data de referência, então todas começam neutras (0), exceto com o adversário
        desta operação. Cada relação é a soma dos fatores listados ao expandir um país. Os governos da IA aceitam ou recusam propostas por
        interesse e risco — e explicam o motivo.
      </p>

      {myTreaties.length > 0 && (
        <div className="rounded border border-ink-700 bg-ink-900 p-2.5">
          <div className="mb-1.5 text-[11px] text-ink-400">Acordos e sanções em vigor</div>
          <ul className="space-y-1">
            {myTreaties.map((t) => (
              <TreatyRow key={t.id} t={t} mine={mine} day={day} nameOf={nameOf} onCancel={() => onAction({ type: 'cancel_treaty', treatyId: t.id })} />
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1.5">
        {others.map((o) => {
          const rel = relationWith(o.id);
          const value = rel?.value ?? 0;
          const ts = treatiesWith(o.id);
          const has = (type: Treaty['type'], directedFrom?: number) => ts.some((t) => t.type === type && (directedFrom === undefined || t.a === directedFrom));
          const mission = diplomacy.missions.includes(`${mine}>${o.id}`);
          const expanded = open === o.id;
          return (
            <li key={o.id} className={`rounded border ${expanded ? 'border-ink-500 bg-ink-850' : 'border-ink-700 bg-ink-900'}`}>
              <button className="flex w-full items-center gap-2 p-2 text-left" onClick={() => setOpen(expanded ? null : o.id)} aria-expanded={expanded}>
                <span className="w-28 truncate font-semibold text-ink-100">{nameOf(o.id)}</span>
                <RelationBar value={value} />
                <span className="w-10 text-right font-mono text-ink-100">{formatSigned(value, 0)}</span>
                <span className="flex flex-1 flex-wrap justify-end gap-1">
                  {o.enemy && <Chip tone="bad">⚔ Em guerra</Chip>}
                  {has('trade') && <Chip tone="good">Comércio</Chip>}
                  {has('alliance') && <Chip tone="good">Aliança</Chip>}
                  {has('sanctions', mine) && <Chip tone="info">Sancionamos →</Chip>}
                  {has('sanctions', o.id) && <Chip tone="bad">← Nos sanciona</Chip>}
                  {mission && <Chip tone="info">Missão</Chip>}
                </span>
              </button>
              {expanded && (
                <div className="space-y-2 border-t border-ink-700 p-2">
                  {o.gdpUsd !== null && <div className="text-ink-400">PIB: {formatUsd(o.gdpUsd)}</div>}
                  <ul className="space-y-0.5">
                    {(rel?.factors ?? []).length === 0 && <li className="text-ink-400">Relação neutra: nenhum fator ativo.</li>}
                    {(rel?.factors ?? []).map((f) => (
                      <li key={f.key} className="flex justify-between gap-2">
                        <span className="text-ink-200">{f.label}</span>
                        <span className="font-mono text-ink-100">{formatSigned(f.value, 1)}</span>
                      </li>
                    ))}
                  </ul>
                  {!o.enemy && (
                    <div className="flex flex-wrap gap-1.5">
                      <button className="btn px-2 py-1 text-xs" disabled={has('trade') || has('sanctions')} onClick={() => onAction({ type: 'propose', treaty: 'trade', partner: o.id })} title={`Duração ${DIPLO.tradeDays} dias. Aumenta o crescimento das duas partes.`}>
                        Propor comércio
                      </button>
                      <button className="btn px-2 py-1 text-xs" disabled={has('alliance')} onClick={() => onAction({ type: 'propose', treaty: 'alliance', partner: o.id })} title={`Duração ${DIPLO.allianceDays} dias. O aliado envia ajuda militar ao teatro; custa ${DIPLO.allianceCostPct}% do PIB/ano. Exige relação alta.`}>
                        Propor aliança
                      </button>
                      {enemies.map((e) => (
                        <button key={e} className="btn px-2 py-1 text-xs" disabled={ts.some((t) => t.type === 'sanctions' && t.a === o.id && t.b === e)} onClick={() => onAction({ type: 'request_sanctions', partner: o.id, target: e })} title="O governo avalia sua relação com você, com o alvo e o custo de sancionar.">
                          Pedir sanções contra {nameOf(e)}
                        </button>
                      ))}
                      <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'set_mission', partner: o.id, active: !mission })} title={`Melhora a relação gradualmente (até +${DIPLO.missionCap}); custa ${DIPLO.missionCostPct}% do PIB/ano.`}>
                        {mission ? 'Encerrar missão' : 'Abrir missão diplomática'}
                      </button>
                      <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'send_aid', partner: o.id, pctGdp: aidPct })} title="Pago com endividamento. O efeito sobre a relação decai com o tempo.">
                        Enviar ajuda ({formatUsd((aidPct / 100) * me.gdpUsd)})
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {has('sanctions', mine) ? (
                      <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'lift_sanctions', target: o.id })}>
                        Retirar sanções
                      </button>
                    ) : (
                      <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => onAction({ type: 'impose_sanctions', target: o.id })} title="Reduz o crescimento do alvo, custa um pouco ao seu e encerra o comércio entre as partes.">
                        Impor sanções
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TreatyRow({ t, mine, day, nameOf, onCancel }: { t: Treaty; mine: number; day: number; nameOf: (id: number) => string; onCancel: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const other = t.a === mine ? t.b : t.a;
  const label = t.type === 'sanctions' ? (t.a === mine ? `Sanções contra ${nameOf(t.b)}` : `Sanções de ${nameOf(t.a)} contra nós`) : `${TREATY_LABEL[t.type]} com ${nameOf(other)}`;
  const canCancel = t.type !== 'sanctions' || t.a === mine;
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-ink-200">
        {label} <span className="text-ink-400">· restam {Math.max(0, t.endDay - day)} dias</span>
      </span>
      {canCancel &&
        (confirm ? (
          <span className="flex gap-1">
            <button className="btn btn-danger px-2 py-0.5 text-[11px]" onClick={onCancel}>
              {t.type === 'sanctions' ? 'Retirar' : 'Romper (custa relação)'}
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
