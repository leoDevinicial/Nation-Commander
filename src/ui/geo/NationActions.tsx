import { Ban, Check, Gavel, Handshake, HeartHandshake, Landmark, Map, Package, RadioTower, ShieldCheck, Swords, Truck, Undo2, Unlink, X } from 'lucide-react';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { useState } from 'react';
import type { DiplomacyView, ForeignView, NationView } from '../../../shared/protocol.ts';
import { DIPLO, type DiplomaticAction, type NationId, type Treaty } from '../../../shared/strategic/Diplomacy.ts';
import { CAIXA_DAYS } from '../../../shared/strategic/params.ts';
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

  if (!f.known && f.isPlayer)
    return (
      <div className="space-y-1.5 text-xs">
        <p className="text-ink-300">Esta nação está no mesmo mapa, mas vocês ainda não se encontraram.</p>
        <p className="text-ink-400">
          Explore com tropas ou um explorador: quando uma unidade sua avistar o território ou as forças dela, o contato é estabelecido. Antes disso não há como negociar, propor pacto ou
          aliança, nem declarar guerra.
        </p>
      </div>
    );
  if (!f.known) {
    const cost = CAIXA_DAYS.contact * me.dayUsd;
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
            <RadioTower size={14} aria-hidden /> Estabelecer Contato{' '}
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
          <span className="nc-kicker">Relação com seu país</span>
          <span className={`nc-num ${(relation?.value ?? 0) > 0 ? 'text-signal-green' : (relation?.value ?? 0) < 0 ? 'text-red-300' : 'text-ink-100'}`}>{formatSigned(relation?.value ?? 0, 0)}</span>
        </div>
        <RelationBar value={relation?.value ?? 0} />
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

      <div className="rounded-[3px] border border-ink-700 bg-ink-950/60 p-2">
        <div className="nc-kicker mb-1.5">Situação atual</div>
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
            <dt className="text-ink-400">Saldo do orçamento</dt>
            <dd className="text-right font-mono">{formatPct(-f.intel.deficitPctGdp)} do PIB</dd>
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
              <Truck size={14} aria-hidden /> Propor Comércio
            </button>
            <button
              className="btn px-2 py-1 text-xs"
              disabled={has('alliance')}
              onClick={() => onAction({ type: 'propose', treaty: 'alliance', partner: f.id })}
              title={`Duração ${DIPLO.allianceDays} dias. O aliado envia ajuda militar ao teatro; custa ${DIPLO.allianceCostPct}% do PIB/ano. Exige relação alta.`}
            >
              <Handshake size={14} aria-hidden /> Propor Aliança
            </button>
            {enemies.map((e) => (
              <button
                key={e}
                className="btn px-2 py-1 text-xs"
                disabled={view.treaties.some((t) => t.type === 'sanctions' && t.a === f.id && t.b === e)}
                onClick={() => onAction({ type: 'request_sanctions', partner: f.id, target: e })}
                title="O governo avalia sua relação com você, com o alvo e o custo de sancionar."
              >
                <Gavel size={14} aria-hidden /> Pedir Sanções contra {nameOf(e)}
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
            <Landmark size={14} aria-hidden /> {mission ? 'Encerrar Missão' : 'Abrir Missão Diplomática'}
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
                Confirmar {formatUsd(AID_PCT * CAIXA_DAYS.aidPerPctGdp * me.dayUsd)} do caixa
              </button>
              <button className="btn px-2 py-1 text-xs" onClick={() => setConfirmAid(false)}>
                Não
              </button>
            </span>
          ) : (
            <button className="btn px-2 py-1 text-xs" onClick={() => setConfirmAid(true)} title="Pago com endividamento. O efeito sobre a relação decai com o tempo.">
              <HeartHandshake size={14} aria-hidden /> Enviar Ajuda
            </button>
          ))}
        {has('sanctions', mine) ? (
          <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'lift_sanctions', target: f.id })}>
            <Undo2 size={14} aria-hidden /> Retirar Sanções
          </button>
        ) : (
          <button
            className="btn btn-danger px-2 py-1 text-xs"
            onClick={() => onAction({ type: 'impose_sanctions', target: f.id })}
            title="Reduz o crescimento do alvo, custa um pouco ao seu e encerra o comércio entre as partes."
          >
            <Ban size={14} aria-hidden /> Impor Sanções
          </button>
        )}
      </div>

      {f.isPlayer && <TheaterPacts f={f} mine={mine} view={view} atWar={atWar} nameOf={nameOf} onAction={onAction} onDeclareWar={onDeclareWar} />}
      {!f.isPlayer && f.known && (
        <div className="rounded border border-signal-red/40 bg-[#2a1210]/60 p-2">
          {atWar ? (
            <>
              <p className="mb-1.5 text-red-300">Em guerra. O país está fora do teatro: o combate é por operações expedicionárias nas regiões dele.</p>
              <button className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => onOpenOperations?.(f.id)}>
                <Map size={14} className="inline-block align-[-2px]" aria-hidden /> Abrir Mapa Operacional
              </button>
            </>
          ) : (
            <>
              <p className="mb-1.5 text-ink-200">
                {nameOf(f.id)} está fora do teatro. Em guerra, suas tropas do teatro podem ser enviadas em operações contra as regiões do país (viagem, batalha local e volta).
              </p>
              <button className="btn btn-danger px-3 py-1.5 text-xs" onClick={() => onDeclareWar(f.id)}>
                <Swords size={14} aria-hidden /> Declarar Guerra…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Relação de −100 a +100 numa barra com o zero no meio: verde para a direita, vermelho para a esquerda. */
function RelationBar({ value }: { value: number }) {
  const v = Math.max(-100, Math.min(100, value));
  const w = Math.abs(v) / 2;
  return (
    <div className="relative mb-1.5 h-1.5 overflow-hidden rounded-sm bg-ink-800" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label="Relação">
      <span className="absolute inset-y-0 left-1/2 w-px bg-ink-500" aria-hidden />
      <span className="absolute inset-y-0" style={{ left: v >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: v >= 0 ? 'var(--color-signal-green)' : 'var(--color-signal-red)' }} aria-hidden />
    </div>
  );
}

const usdMi = (usd: number) => `US$ ${(usd / 1e6).toFixed(1).replace('.', ',')} mi`;

/**
 * Pactos com uma nação do mesmo teatro (06/11): aliança de time (fixa), aliança ou não agressão firmadas na partida
 * (romper custa indenização), convites pendentes nos dois sentidos, propostas com o custo e a guerra quando não há pacto.
 */
function TheaterPacts({ f, mine, view, atWar, nameOf, onAction, onDeclareWar }: { f: ForeignView; mine: NationId; view: DiplomacyView; atWar: boolean; nameOf: (id: number) => string; onAction: (a: DiplomaticAction) => void; onDeclareWar: (id: NationId) => void }) {
  const [confirm, setConfirm] = useState(false);
  const p = view.pacts;
  const pact = view.treaties.find((t) => ((t.a === mine && t.b === f.id) || (t.a === f.id && t.b === mine)) && (t.pact || t.team || (t.type === 'alliance' && t.endDay - t.startDay >= 1_000_000)));
  const team = !!pact && (pact.team || !pact.pact);
  const incoming = p?.offers.find((o) => o.from === f.id && o.to === mine);
  const outgoing = p?.offers.find((o) => o.from === mine && o.to === f.id);
  const bot = !!p?.bots.includes(f.id);
  const what = (t: 'alliance' | 'nonaggression') => (t === 'alliance' ? 'aliança' : 'pacto de não agressão');
  return (
    <div className="space-y-2">
      {pact ? (
        <div className={`rounded-[3px] border p-2 ${pact.type === 'alliance' ? 'border-signal-green/40 bg-signal-green/[0.06]' : 'border-signal-blue/40 bg-signal-blue/[0.06]'}`}>
          <div className="nc-kicker mb-1">{team ? 'Aliado de time' : pact.type === 'alliance' ? 'Aliança' : 'Pacto de não agressão'}</div>
          <p className="mb-1.5 text-ink-200">
            {pact.type === 'alliance'
              ? 'Vocês veem o que o outro vê, podem enviar recursos e mandar tropas em auxílio. Nenhum dos dois pode atacar o outro.'
              : 'Nenhum dos dois pode atacar o outro enquanto o pacto valer. Sem outros efeitos.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pact.type === 'alliance' && (
              <button className="btn btn-primary px-2 py-1 text-xs" onClick={() => useNationalStore.getState().setGiftTarget(f.id)}>
                <Package size={14} aria-hidden /> Enviar recursos
              </button>
            )}
            {pact.type === 'nonaggression' && !outgoing && p && !p.teamMode && (
              <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'propose', treaty: 'alliance', partner: f.id })} title={`Quem propõe paga ${usdMi(p.allianceFeeUsd)} ao firmar`}>
                <Handshake size={14} aria-hidden /> Propor aliança ({usdMi(p.allianceFeeUsd)})
              </button>
            )}
            {!team &&
              p &&
              (confirm ? (
                <span className="flex gap-1">
                  <button
                    className="btn btn-danger px-2 py-1 text-xs"
                    onClick={() => {
                      onAction({ type: 'cancel_treaty', treatyId: pact.id });
                      setConfirm(false);
                    }}
                  >
                    Romper e pagar {usdMi(pact.type === 'alliance' ? p.allianceIndemnityUsd : p.napIndemnityUsd)}
                  </button>
                  <button className="btn px-2 py-1 text-xs" onClick={() => setConfirm(false)}>
                    Não
                  </button>
                </span>
              ) : (
                <button className="btn px-2 py-1 text-xs" onClick={() => setConfirm(true)} title={`Quem rompe paga a indenização a ${nameOf(f.id)}`}>
                  <Unlink size={14} aria-hidden /> Romper…
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[3px] border border-ink-700 bg-ink-950/50 p-2">
          <div className="nc-kicker mb-1">Pactos</div>
          {p?.teamMode ? (
            <p className="text-ink-400">Partida com times: as alianças são os times definidos na sala.</p>
          ) : incoming ? (
            <>
              <p className="mb-1.5 text-ink-200">
                {nameOf(f.id)} propõe {incoming.treaty === 'alliance' ? 'uma aliança' : 'um pacto de não agressão'} (até o dia {incoming.expiresDay}). Quem propôs paga o custo.
              </p>
              <div className="flex gap-1.5">
                <button className="btn btn-primary px-2 py-1 text-xs" onClick={() => onAction({ type: 'answer_offer', offerId: incoming.id, accept: true })}>
                  <Check size={14} aria-hidden /> Aceitar
                </button>
                <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'answer_offer', offerId: incoming.id, accept: false })}>
                  <X size={14} aria-hidden /> Recusar
                </button>
              </div>
            </>
          ) : outgoing ? (
            <p className="text-ink-300">Convite de {what(outgoing.treaty)} enviado; aguardando resposta até o dia {outgoing.expiresDay}.</p>
          ) : p ? (
            <>
              <p className="mb-1.5 text-ink-400">
                Não agressão: ninguém ataca ninguém até alguém romper. Aliança: o mesmo, mais visão compartilhada, envio de recursos e tropas em auxílio. Quem propõe paga ao firmar; quem rompe paga
                indenização à outra parte. {bot ? 'Governo da IA: responde na hora.' : 'Jogador: recebe um convite.'}
                {atWar ? ' Firmar agora encerra a guerra.' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'propose', treaty: 'nonaggression', partner: f.id })}>
                  <ShieldCheck size={14} aria-hidden /> Propor não agressão ({usdMi(p.napFeeUsd)})
                </button>
                <button className="btn px-2 py-1 text-xs" onClick={() => onAction({ type: 'propose', treaty: 'alliance', partner: f.id })}>
                  <Handshake size={14} aria-hidden /> Propor aliança ({usdMi(p.allianceFeeUsd)})
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
      {!pact && (
        <div className="rounded border border-signal-red/40 bg-[#2a1210]/60 p-2">
          {atWar ? (
            <p className="text-red-300">Em guerra: as forças dos dois países no teatro de operações podem se enfrentar.</p>
          ) : (
            <>
              <p className="mb-1.5 text-ink-200">As forças de {nameOf(f.id)} estão no mesmo teatro de operações, mas sem guerra formal nenhum dos lados pode atacar.</p>
              <button className="btn btn-danger px-3 py-1.5 text-xs" onClick={() => onDeclareWar(f.id)}>
                <Swords size={14} aria-hidden /> Declarar Guerra…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
