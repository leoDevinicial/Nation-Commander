import { useEffect, useState } from 'react';
import { countryName } from '../../../shared/data/countries.ts';
import { BIOME_LABELS } from '../../../shared/data/sectors.ts';
import { OPS } from '../../../shared/strategic/operations.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { formatUsd } from '../../lib/format.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { enterBattle, useOpsStore } from '../../state/useOpsStore.ts';
import { OUTCOME_LABEL } from '../geo/OperationalMap.tsx';

const STATE_SHORT = { transit: 'a caminho', battle: 'em combate', returning: 'voltando', done: 'concluída' } as const;

/**
 * Barra superior da batalha local: região, objetivo, forças, tempo até o impasse, e as saídas —
 * voltar ao teatro (a batalha segue) ou recuar (confirmado).
 */
export function BattleBar({ runtime }: { runtime: GameRuntime }) {
  const battle = useOpsStore((s) => s.battle);
  const tick = useHudStore((s) => s.tick);
  const [confirm, setConfirm] = useState(false);
  const [forces, setForces] = useState({ mine: 0, enemy: 0 });
  useEffect(() => {
    const id = window.setInterval(() => {
      const f = runtime.battleForces();
      setForces((p) => (p.mine === f.mine && p.enemy === f.enemy ? p : f));
    }, 500);
    return () => window.clearInterval(id);
  }, [runtime]);
  if (!battle) return null;
  const left = Math.max(0, OPS.maxBattleSeconds - Math.floor(tick / 20));
  return (
    <div className="pointer-events-none absolute top-2 right-2 left-2 z-20 flex flex-wrap items-start gap-2 sm:top-3 sm:right-3 sm:left-3">
      <div className="panel pointer-events-auto max-w-full px-2.5 py-1.5 text-xs">
        <div className="font-display font-bold tracking-wide uppercase">
          ⚔ {battle.sector.name.split(' (')[0]} · {countryName(battle.targetCountryId)}
        </div>
        <div className="text-[11px] text-ink-300">Objetivo: destruir o posto de comando inimigo. Proteja sua base avançada.</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
          <span>Suas forças: {forces.mine}</span>
          <span>Inimigos à vista: {forces.enemy}</span>
          <span>
            Impasse em {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
          <span className="hidden sm:inline">{BIOME_LABELS[battle.sector.biome]}</span>
        </div>
      </div>
      <div className="pointer-events-auto ml-auto flex gap-1.5">
        <button className="btn px-2 py-1 text-xs" onClick={() => useOpsStore.getState().set({ inBattle: false })} title="A batalha continua; volte pelo indicador da operação">
          ⤺ Teatro
        </button>
        {confirm ? (
          <>
            <button
              className="btn btn-danger px-2 py-1 text-xs"
              onClick={() => {
                runtime.send({ type: 'operation_retreat', opId: battle.opId });
                setConfirm(false);
              }}
            >
              Confirmar recuo
            </button>
            <button className="btn px-2 py-1 text-xs" onClick={() => setConfirm(false)}>
              Não
            </button>
          </>
        ) : (
          <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => setConfirm(true)} title="Encerra a batalha: os sobreviventes voltam ao teatro">
            Recuar
          </button>
        )}
      </div>
    </div>
  );
}

/** Indicador da operação em curso no teatro (abre o mapa ou entra na batalha). */
export function OperationChip() {
  const op = useOpsStore((s) => s.view?.ops.find((o) => o.state !== 'done'));
  const battle = useOpsStore((s) => s.battle);
  if (!op) return null;
  return (
    <div className="panel pointer-events-auto absolute top-15 left-1/2 z-10 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-2 px-2 py-1 text-[11px] sm:top-14">
      <span className="truncate">
        Operação {op.sectorName.split(' (')[0]}: {STATE_SHORT[op.state]}
        {op.state === 'transit' || op.state === 'returning' ? ` · ${op.daysLeft} d` : ''}
      </span>
      {op.state === 'battle' && battle?.opId === op.id ? (
        <button className="btn btn-primary min-h-6 px-2 py-0 text-[11px]" onClick={() => enterBattle()}>
          ⚔ Entrar
        </button>
      ) : (
        <button className="btn min-h-6 px-2 py-0 text-[11px]" onClick={() => useOpsStore.getState().set({ opMap: op.target })}>
          🗺 Mapa
        </button>
      )}
    </div>
  );
}

/** Chegada das forças à região: entrar agora ou depois (a batalha começa de qualquer forma). */
export function BattlePrompt() {
  const battle = useOpsStore((s) => s.battle);
  const inBattle = useOpsStore((s) => s.inBattle);
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (!battle || inBattle || dismissed === battle.opId) return null;
  return (
    <div className="absolute inset-x-0 bottom-28 z-30 flex justify-center px-3 sm:bottom-auto sm:top-24">
      <div className="panel pointer-events-auto max-w-sm p-3 text-xs" role="alertdialog" aria-label="Batalha iniciada">
        <div className="font-semibold text-ink-100">Suas forças chegaram a {battle.sector.name.split(' (')[0]}</div>
        <p className="mt-1 text-ink-300">A guarnição de {countryName(battle.targetCountryId)} defende a região. Assuma o comando da batalha local.</p>
        <div className="mt-2 flex gap-1.5">
          <button className="btn btn-primary px-3 py-1 text-xs" onClick={() => enterBattle()}>
            ⚔ Entrar na batalha
          </button>
          <button className="btn px-3 py-1 text-xs" onClick={() => setDismissed(battle.opId)}>
            Depois
          </button>
        </div>
      </div>
    </div>
  );
}

/** Relatório da operação reconciliada: o que mudou na campanha. */
export function OutcomeDialog() {
  const outcome = useOpsStore((s) => s.outcome);
  if (!outcome) return null;
  const r = outcome.result;
  const close = () => useOpsStore.getState().set({ outcome: null });
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel w-full max-w-md p-4 text-xs" role="dialog" aria-label="Resultado da operação">
        <div className={`font-display text-base font-bold ${r.outcome === 'victory' ? 'text-signal-green' : 'text-brass-400'}`}>{OUTCOME_LABEL[r.outcome]}</div>
        <div className="text-ink-300">
          {outcome.sectorName}
          {outcome.targetCountryId ? ` · ${countryName(outcome.targetCountryId)}` : ''}
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-400">Forças</dt>
          <dd>
            {r.sent} enviadas · {r.lost} perdidas · {r.returned} voltando ao teatro
          </dd>
          <dt className="text-ink-400">Inimigo</dt>
          <dd>
            {r.enemyLost} de {r.enemyInitial} unidades e torres destruídas
          </dd>
          <dt className="text-ink-400">Custos</dt>
          <dd>
            {formatUsd(r.usd)} · {r.supplies} suprimentos · {r.oil} petróleo · {r.ammoSupplies} em munição
          </dd>
          {r.occupied && (
            <>
              <dt className="text-ink-400">Ocupação</dt>
              <dd>Região ocupada: o país perde {formatUsd(r.gdpLossUsd)} de PIB; a região passa a render suprimentos no teatro. Repercussão diplomática negativa.</dd>
            </>
          )}
          <dt className="text-ink-400">Duração</dt>
          <dd>{r.days} dias desde a partida</dd>
        </dl>
        <div className="mt-3 flex gap-1.5">
          <button className="btn btn-primary px-3 py-1 text-xs" onClick={close}>
            Voltar ao teatro
          </button>
          <button
            className="btn px-3 py-1 text-xs"
            onClick={() => {
              const op = useOpsStore.getState().view?.ops.find((o) => o.id === outcome.opId);
              useOpsStore.getState().set({ outcome: null, opMap: op?.target ?? null });
            }}
          >
            🗺 Mapa operacional
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Carregamento da batalha local: cobre a troca enquanto a cena gera o terreno e recebe o
 * primeiro estado; some sozinho (ou cancela e volta ao teatro). Nunca deixa a tela congelada.
 */
export function BattleLoading({ runtime }: { runtime: GameRuntime | null }) {
  const battle = useOpsStore((s) => s.battle);
  const [readyFor, setReadyFor] = useState<GameRuntime | null>(null);
  useEffect(() => {
    if (!runtime) return;
    const id = window.setInterval(() => {
      if (runtime.hasSnapshot) {
        setReadyFor(runtime);
        window.clearInterval(id);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [runtime]);
  if (!battle || (runtime && readyFor === runtime)) return null;
  return (
    <div className="absolute inset-0 z-[36] flex items-center justify-center bg-ink-950" role="status" aria-live="polite">
      <div className="scene-enter max-w-sm p-4 text-center">
        <div className="font-display text-sm font-bold tracking-wide uppercase">⚔ {battle.sector.name.split(' (')[0]}</div>
        <div className="mt-1 text-xs text-ink-300">
          {countryName(battle.targetCountryId)} · {BIOME_LABELS[battle.sector.biome]}
        </div>
        <div className="mt-3 text-[11px] text-ink-400">{runtime ? 'Posicionando as forças…' : 'Gerando o terreno da região…'}</div>
        <div className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded bg-ink-800">
          <div className={`h-full bg-brass-400 transition-all duration-500 ${runtime ? 'w-3/4' : 'w-1/3'}`} />
        </div>
        <button className="btn mt-3 px-3 py-1 text-xs" onClick={() => useOpsStore.getState().set({ inBattle: false })}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
