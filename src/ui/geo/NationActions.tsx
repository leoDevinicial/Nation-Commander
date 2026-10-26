import { useState } from 'react';
import type { DiplomacyView, ForeignView, NationView } from '../../../shared/protocol.ts';
import { DIPLO, type DiplomaticAction, type NationId, type Treaty } from '../../../shared/strategic/Diplomacy.ts';
import { formatPct, formatSigned, formatUsd } from '../../lib/format.ts';

interface Props {
  f: ForeignView;
  me: NationView;
  view: DiplomacyView;
  day: number;
  nameOf: (id: number) => string;
  onAction: (a: DiplomaticAction) => void;
  onDeclareWar: (id: NationId) => void;
  /** Abre o mapa operacional de um país da IA em guerra (Fase 8). */
  onOpenOperations?: (id: NationId) => void;
}

const AID_PCT = 0.1;

export function Chip({ children, tone }: { children: React.ReactNode; tone: 'good' | 'bad' | 'info' }) {
  const cls = tone === 'good' ? 'border-signal-green/60 text-signal-green' : tone === 'bad' ? 'border-signal-red/60 text-red-300' : 'border-ink-600 text-ink-200';
  return <span className={`rounded border px-1.5 py-px text-[10px] ${cls}`}>{children}</span>;
}

/** Estado do par jogador–país a partir da visão filtrada. */
export function pairInfo(view: DiplomacyView, mine: NationId, id: NationId) {
  const pair = (t: { a: NationId; b: NationId }) => (t.a === mine && t.b === id) || (t.a === id && t.b === mine);
  const ts = view.treaties.filter(pair);
  const has = (type: Treaty['type'], directedFrom?: NationId) => ts.some((t) => t.type === type && (directedFrom === undefined || t.a === directedFrom));
  return {
    relation: view.relations.find((r) => r.b === id),
    has,
    atWar: view.wars.some(([a, b]) => pair({ a, b })),
    mission: view.missions.includes(`${mine}>${id}`),
  };
}

/**
 * Ações diplomáticas sobre um país, respeitando o que o jogador conhece. Usado no globo e no
 * painel nacional, para que as duas telas executem exatamente os mesmos comandos.
 */
export function NationActions({ f, me, view, day, nameOf, onAction, onDeclareWar, onOpenOperations }: Props) {
  const mine = me.slot;
  const { relation, has, atWar, mission } = pairInfo(view, mine, f.id);
  const enemies = view.wars.flatMap(([a, b]) => (a === mine ? [b] : b === mine ? [a] : []));
  const [confirmAid, setConfirmAid] = useState(false);

  if (!f.known) {
    const cost = (DIPLO.contactCostPct / 100) * me.gdpUsd;
    return (
      <div className="space-y-2 text-xs">
        <p className="text-ink-400">
          Sem contato diplomático: o país existe, mas seu governo não tem canais com ele. Não é possível negociar, consultar dados nem declarar guerra até estabelecer contato.
        </p>
        {f.contactDueDay !== null ? (
          <p className="text-ink-200">
            Missão de contato a caminho — conclusão no dia {f.contactDueDay} (faltam {Math.max(0, f.contactDueDay - day)} dias).
          </p>
        ) : (
          <button className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => onAction({ type: 'establish_contact', partner: f.id })}>
            Estabelecer Contato{' '}
            <span className="font-normal opacity-80">
              ({formatUsd(cost)} · {DIPLO.contactDays} dias)
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-xs">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-ink-400">Relação com seu país</span>
          <span className="font-mono text-ink-100">{formatSigned(relation?.value ?? 0, 0)}</span>
        </div>
        <ul className="space-y-0.5">
          {(relation?.factors ?? []).length === 0 && <li className="text-ink-400">Relação neutra: nenhum fator ativo.</li>}
          {(relation?.factors ?? []).map((x) => (
            <li key={x.key} className="flex justify-between gap-2">
              <span className="text-ink-200">{x.label}</span>
              <span className="font-mono text-ink-100">{formatSigned(x.value, 1)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded border border-ink-700 bg-ink-950/60 p-2">
        <div className="mb-1 text-[11px] font-semibold text-ink-200">Situação atual</div>
        {f.intel ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <dt className="text-ink-400">PIB</dt>
            <dd className="text-right font-mono">{formatUsd(f.intel.gdpUsd)}</dd>
            <dt className="text-ink-400">Crescimento</dt>
            <dd className="text-right font-mono">{formatPct(f.intel.realGrowthPct)}</dd>
            <dt className="text-ink-400">Aprovação do governo</dt>
            <dd className="text-right font-mono">{formatPct(f.intel.approval, 0)}</dd>
            <dt className="text-ink-400">Defesa</dt>
            <dd className="text-right font-mono">{formatPct(f.intel.defensePct, 2)} do PIB</dd>
            <dt className="text-ink-400">Dívida</dt>
            <dd className="text-right font-mono">{formatPct(f.intel.debtPctGdp)} do PIB</dd>
          </dl>
        ) : (
          <p className="text-ink-400">Dados correntes indisponíveis: abra uma missão diplomática para obter informação atualizada do governo.</p>
        )}
        {f.intel && <p className="mt-1 text-[10px] text-ink-400">Fonte: relatórios da missão diplomática (simulação da partida).</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!f.isPlayer && !atWar && (
          <>
            <button
              className="btn px-2 py-1 text-xs"
              disabled={has('trade') || has('sanctions')}
              onClick={() => onAction({ type: 'propose', treaty: 'trade', partner: f.id })}
              title={`Duração ${DIPLO.tradeDays} dias. Aumenta o crescimento das duas partes.`}
            >
              Propor Comércio
            </button>
            <button
              className="btn px-2 py-1 text-xs"
              disabled={has('alliance')}
              onClick={() => onAction({ type: 'propose', treaty: 'alliance', partner: f.id })}
              title={`Duração ${DIPLO.allianceDays} dias. O aliado envia ajuda militar ao teatro; custa ${DIPLO.allianceCostPct}% do PIB/ano. Exige relação alta.`}
            >
              Propor Aliança
            </button>
            {enemies.map((e) => (
              <button
                key={e}
                className="btn px-2 py-1 text-xs"
                disabled={view.treaties.some((t) => t.type === 'sanctions' && t.a === f.id && t.b === e)}
                onClick={() => onAction({ type: 'request_sanctions', partner: f.id, target: e })}
                title="O governo avalia sua relação com você, com o alvo e o custo de sancionar."
              >
                Pedir Sanções contra {nameOf(e)}
              </button>
            ))}
          </>
        )}
        {!atWar && (
          <button
            className="btn px-2 py-1 text-xs"
            onClick={() => onAction({ type: 'set_mission', partner: f.id, active: !mission })}
            title={`Melhora a relação gradualmente (até +${DIPLO.missionCap}) e fornece dados atualizados; custa ${DIPLO.missionCostPct}% do PIB/ano.`}
          >
            {mission ? 'Encerrar Missão' : 'Abrir Missão Diplomática'}
          </button>
        )}
        {!f.isPlayer &&
          !atWar &&
          (confirmAid ? (
            <span className="flex gap-1">
              <button
                className="btn btn-primary px-2 py-1 text-xs"
                onClick={() => {
                  onAction({ type: 'send_aid', partner: f.id, pctGdp: AID_PCT });
                  setConfirmAid(false);
                }}
              >
                Confirmar {formatUsd((AID_PCT / 100) * me.gdpUsd)}
              </button>
              <button className="btn px-2 py-1 text-xs" onClick={() => setConfirmAid(false)}>
                Não
              </button>
            </span>
          ) : (
            <button className="btn px-2 py-1 text-xs" onClick={() => setConfirmAid(true)} title="Pago com endividamento. O efeito sobre a relação decai com o tempo.">
              Enviar Ajuda
            </button>
          ))}
        {has('sanctions', mine) ? (
          <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'lift_sanctions', target: f.id })}>
            Retirar Sanções
          </button>
        ) : (
          <button
            className="btn btn-danger px-2 py-1 text-xs"
            onClick={() => onAction({ type: 'impose_sanctions', target: f.id })}
            title="Reduz o crescimento do alvo, custa um pouco ao seu e encerra o comércio entre as partes."
          >
            Impor Sanções
          </button>
        )}
      </div>

      {f.isPlayer && (
        <div className="rounded border border-signal-red/40 bg-[#2a1210]/60 p-2">
          {atWar ? (
            <p className="text-red-300">Em guerra: as forças dos dois países no teatro de operações podem se enfrentar.</p>
          ) : (
            <>
              <p className="mb-1.5 text-ink-200">As forças de {nameOf(f.id)} estão no mesmo teatro de operações, mas sem guerra formal nenhum dos lados pode atacar.</p>
              <button className="btn btn-danger px-3 py-1.5 text-xs" onClick={() => onDeclareWar(f.id)}>
                Declarar Guerra…
              </button>
            </>
          )}
        </div>
      )}
      {!f.isPlayer && f.known && (
        <div className="rounded border border-signal-red/40 bg-[#2a1210]/60 p-2">
          {atWar ? (
            <>
              <p className="mb-1.5 text-red-300">Em guerra. O país está fora do teatro: o combate é por operações expedicionárias nas regiões dele.</p>
              <button className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => onOpenOperations?.(f.id)}>
                🗺 Abrir Mapa Operacional
              </button>
            </>
          ) : (
            <>
              <p className="mb-1.5 text-ink-200">
                {nameOf(f.id)} está fora do teatro. Em guerra, suas tropas do teatro podem ser enviadas em operações contra as regiões do país (viagem, batalha local e volta).
              </p>
              <button className="btn btn-danger px-3 py-1.5 text-xs" onClick={() => onDeclareWar(f.id)}>
                Declarar Guerra…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
