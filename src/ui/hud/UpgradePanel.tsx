import { useEffect, useState } from 'react';
import { BUILDINGS, RESOURCE_LABELS, RESOURCE_TYPES, emptyStockpile, type Cost } from '../../../shared/sim/config.ts';
import {
  HQ_LEVEL_LEAD,
  INFRA_GATE_LEVEL,
  UPGRADE_CANCEL_REFUND,
  formatUsd as usdShort,
  specDef,
  upgradeCost,
  upgradeTrack,
  type SpecId,
  type UpgradeGain,
} from '../../../shared/sim/upgrades.ts';
import { TECHNOLOGIES } from '../../../shared/strategic/technologies.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { CostLabel, ResourceIcon } from '../components/Resources.tsx';
import { effectiveFund } from '../../state/sandbox.ts';

const nf = (d: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d });

function gainValue(g: UpgradeGain, v: number): string {
  if (g.unit === '%') return `${nf(0).format(v)}%`;
  if (g.unit === '/s') return `${nf(2).format(v)}/s`;
  if (g.unit === 'células') return `${nf(1).format(v)} células`;
  return nf(1).format(v);
}

function UpkeepText({ cost }: { cost: Cost }) {
  const parts = RESOURCE_TYPES.filter((r) => Math.abs(cost[r] ?? 0) > 1e-9);
  if (!parts.length) return <span className="text-ink-400">sem alteração</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {parts.map((r) => (
        <span key={r} className={`inline-flex items-center gap-1 ${(cost[r] ?? 0) > 0 ? 'text-red-300' : 'text-signal-green'}`}>
          <ResourceIcon type={r} />
          {(cost[r] ?? 0) > 0 ? '+' : ''}
          {nf(2).format(cost[r] ?? 0)}/s
        </span>
      ))}
    </span>
  );
}

/**
 * Painel de melhoria de uma construção: nível atual e próximo, custo em recursos e em verba do
 * orçamento nacional, tempo, requisitos com o que falta, ganhos esperados, custo operacional
 * adicional, riscos e — nos níveis que pedem — a escolha de especialização. Mesmo cálculo que o
 * servidor usa para aceitar ou recusar a obra.
 */
export function UpgradePanel({ runtime }: { runtime: GameRuntime }) {
  const id = useHudStore((s) => s.upgradeFor);
  const b = useHudStore((s) => s.selectedBuilding);
  // reavalia quando o estoque (snapshot) ou a verba/pesquisas (camada nacional) mudam
  useHudStore((s) => s.players);
  useNationalStore((s) => s.nations);
  // a escolha de especialização vale só para o edifício em que foi feita
  const [choice, setChoice] = useState<{ id: number; spec: SpecId } | null>(null);
  const spec = choice && choice.id === id ? choice.spec : null;
  const setSpec = (s: SpecId) => id !== null && setChoice({ id, spec: s });
  const [roadmap, setRoadmap] = useState(false);
  const close = () => useHudStore.getState().set({ upgradeFor: null });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (id === null) return null;
  if (!b || b.id !== id) {
    queueMicrotask(close);
    return null;
  }
  const def = BUILDINGS[b.type];
  const track = upgradeTrack(b.type);
  const plan = runtime.upgradePlan(b.id, spec);
  if (!track || !plan) return null;
  const nation = useNationalStore.getState().nations.find((n) => n.slot === b.owner);
  const fund = effectiveFund(nation?.works.fundUsd ?? null);
  const resources = useHudStore.getState().players.find((p) => p.slot === b.owner)?.resources ?? emptyStockpile();
  const currentSpec = specDef(b.type, b.spec);

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-ink-950/55 p-2 sm:items-center" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel scroll-thin flex max-h-[92%] w-full max-w-3xl flex-col overflow-y-auto p-3 text-xs sm:p-4" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div id="upgrade-title" className="text-base font-semibold">
              {def.label} · Nível {b.level} de {track.maxLevel}
            </div>
            {currentSpec && (
              <div className="mt-0.5 text-ink-400">
                Especialização: <span className="text-brass-400">{currentSpec.label}</span> — {currentSpec.summary}
              </div>
            )}
            <LevelPips level={b.level} max={track.maxLevel} target={b.upgrade?.toLevel ?? null} specLevel={track.specLevel ?? null} />
          </div>
          <button className="btn min-h-9 px-3" onClick={close} aria-label="Fechar">
            ✕
          </button>
        </div>

        {b.upgrade ? (
          <div className="mt-3 rounded border border-ink-700 bg-ink-900 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Obra para o nível {b.upgrade.toLevel}{b.upgrade.spec ? ` · ${specDef(b.type, b.upgrade.spec)?.label}` : ''}</span>
              <span className="font-mono">{Math.round(b.upgrade.progress * 100)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-ink-950">
              <div className="h-full bg-brass-400" style={{ width: `${b.upgrade.progress * 100}%` }} />
            </div>
            <p className="mt-2 text-ink-400">Durante a obra o edifício opera a 50%. Se for destruído, o investimento é perdido.</p>
            <button className="btn mt-2 min-h-10" onClick={() => runtime.cancelUpgrade(b.id)}>
              Cancelar obra (devolve {Math.round(UPGRADE_CANCEL_REFUND * 100)}% dos recursos e da verba)
            </button>
          </div>
        ) : plan.toLevel === null ? (
          <p className="mt-3 text-ink-200">{plan.blocker}</p>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded border border-ink-700 bg-ink-900 p-2">
                <div className="text-ink-400">Custo no teatro</div>
                <div className="mt-1">
                  <CostLabel cost={plan.cost} have={resources} />
                </div>
              </div>
              <div className="rounded border border-ink-700 bg-ink-900 p-2">
                <div className="text-ink-400">Verba de obras (orçamento nacional)</div>
                <div className={`mt-1 font-mono text-sm ${fund !== null && fund < plan.usd ? 'text-red-300' : 'text-ink-100'}`}>{usdShort(plan.usd)}</div>
                <div className="text-[10px] text-ink-400">disponível: {fund === null ? '—' : usdShort(fund)}</div>
                {nation && (
                  <div className="mt-0.5 text-[10px] text-ink-400">
                    Vem do orçamento do país (parte da infraestrutura): +{usdShort(nation.works.capUsd / 365)} por dia de jogo (1 s a 1×). Saldo também no US$ da barra superior.
                  </div>
                )}
              </div>
              <div className="rounded border border-ink-700 bg-ink-900 p-2">
                <div className="text-ink-400">Tempo de obra</div>
                <div className="mt-1 font-mono text-sm">{plan.seconds} s</div>
                <div className="text-[10px] text-ink-400">
                  manutenção: <UpkeepText cost={plan.upkeepDelta} />
                </div>
              </div>
            </div>

            {plan.specChoice && (
              <div className="mt-3">
                <div className="mb-1.5 font-semibold text-ink-200">Especialização do nível {plan.toLevel} — escolha uma (é permanente)</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {plan.specChoice.map((s) => (
                    <button
                      key={s.id}
                      className={`rounded border p-2 text-left transition-colors ${spec === s.id ? 'border-brass-400 bg-ink-800' : 'border-ink-700 bg-ink-900 hover:border-ink-500'}`}
                      aria-pressed={spec === s.id}
                      onClick={() => setSpec(s.id)}
                    >
                      <div className="font-semibold text-ink-100">{s.label}</div>
                      <div className="mt-0.5 text-[11px] text-ink-400">{s.summary}</div>
                      <ul className="mt-1.5 space-y-0.5">
                        {s.pros.map((p) => (
                          <li key={p} className="text-signal-green">
                            ✔ {p}
                          </li>
                        ))}
                        {s.cons.map((c) => (
                          <li key={c} className="text-red-300">
                            ✖ {c}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-semibold text-ink-200">Requisitos</div>
                <ul className="space-y-0.5">
                  {plan.requirements.map((r) => (
                    <li key={r.key} className={r.met ? 'text-ink-200' : 'text-red-300'}>
                      {r.met ? '✔' : '✖'} {r.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 font-semibold text-ink-200">Ganhos esperados (nível {b.level} → {plan.toLevel})</div>
                {plan.gains.length === 0 ? (
                  <p className="text-ink-400">{plan.specChoice && !spec ? 'Escolha a especialização para ver os ganhos.' : 'Sem mudança funcional neste nível.'}</p>
                ) : (
                  <table className="w-full">
                    <tbody>
                      {plan.gains.map((g) => {
                        const good = (g.after > g.before) === g.higherIsBetter;
                        return (
                          <tr key={g.key}>
                            <td className="py-0.5 pr-2 text-ink-400">{g.label}</td>
                            <td className="py-0.5 text-right font-mono text-ink-200">{gainValue(g, g.before)}</td>
                            <td className="px-1 text-ink-400">→</td>
                            <td className={`py-0.5 font-mono ${good ? 'text-signal-green' : 'text-red-300'}`}>{gainValue(g, g.after)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 font-semibold text-ink-200">Riscos e custos</div>
              <ul className="list-disc space-y-0.5 pl-4 text-brass-400">
                {plan.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="sticky bottom-0 mt-3 flex flex-col gap-2 border-t border-ink-700 bg-ink-850/95 pt-2 sm:flex-row sm:items-center">
              <div className={`flex-1 ${plan.blocker ? 'text-red-300' : 'text-signal-green'}`}>{plan.blocker ?? 'Tudo pronto para iniciar a obra.'}</div>
              <button
                className="btn btn-primary min-h-11"
                disabled={plan.blocker !== null}
                onClick={() => {
                  runtime.upgrade(b.id, plan.specChoice ? spec : null);
                  close();
                }}
              >
                ⬆ Iniciar obra · nível {plan.toLevel}
              </button>
            </div>
          </>
        )}

        <button className="btn mt-3 self-start" aria-expanded={roadmap} onClick={() => setRoadmap(!roadmap)}>
          {roadmap ? 'Ocultar' : 'Ver'} todos os níveis
        </button>
        {roadmap && <Roadmap type={b.type} level={b.level} />}
      </div>
    </div>
  );
}

function LevelPips({ level, max, target, specLevel }: { level: number; max: number; target: number | null; specLevel: number | null }) {
  return (
    <div className="mt-1.5 flex gap-1" aria-label={`Nível ${level} de ${max}`}>
      {Array.from({ length: max }, (_, i) => i + 1).map((l) => (
        <span
          key={l}
          title={l === specLevel ? `Nível ${l}: especialização` : `Nível ${l}`}
          className={`h-2 w-5 rounded-sm ${l <= level ? 'bg-brass-400' : l === target ? 'animate-pulse bg-brass-400/50' : 'bg-ink-700'} ${l === specLevel ? 'ring-1 ring-signal-green/70' : ''}`}
        />
      ))}
    </div>
  );
}

/** Tabela de todos os níveis da classe: custo, verba, tempo e o que cada um exige. */
function Roadmap({ type, level }: { type: Parameters<typeof upgradeTrack>[0]; level: number }) {
  const t = upgradeTrack(type)!;
  const rows = [];
  for (let l = 2; l <= t.maxLevel; l++) {
    const c = upgradeCost(type, l);
    const tags: string[] = [];
    if (type !== 'hq') tags.push(`QG ${l - HQ_LEVEL_LEAD}`);
    for (const g of t.techAt ?? []) if (g.level === l) tags.push(TECHNOLOGIES[g.tech].label);
    if (t.storageAt && l >= t.storageAt.from) tags.push(`${BUILDINGS[t.storageAt.building].label} ${Math.floor(l / 2)}`);
    if (l === INFRA_GATE_LEVEL) tags.push('infraestrutura nacional');
    if (t.stabilityAt?.level === l) tags.push(`estabilidade ${t.stabilityAt.min}`);
    if (l === t.specLevel) tags.push('especialização');
    rows.push(
      <tr key={l} className={l <= level ? 'text-ink-400' : 'text-ink-200'}>
        <td className="py-0.5 pr-2 font-mono">{l}</td>
        <td className="py-0.5 pr-2">
          {RESOURCE_TYPES.filter((r) => c.cost[r]).map((r) => (
            <span key={r} className="mr-1.5 inline-flex items-center gap-0.5 font-mono">
              <ResourceIcon type={r} />
              {c.cost[r]}
            </span>
          ))}
        </td>
        <td className="py-0.5 pr-2 font-mono">{usdShort(c.usd)}</td>
        <td className="py-0.5 pr-2 font-mono">{c.seconds} s</td>
        <td className="py-0.5 text-[10px] text-ink-400">{tags.join(' · ')}</td>
      </tr>,
    );
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr className="text-left text-ink-400">
            <th className="pr-2 font-normal">Nível</th>
            <th className="pr-2 font-normal">Recursos</th>
            <th className="pr-2 font-normal">Verba</th>
            <th className="pr-2 font-normal">Tempo</th>
            <th className="font-normal">Requisitos a partir deste nível</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <p className="mt-1 text-[10px] text-ink-400">
        Tempos sem a pesquisa de construção modular. Recursos: {RESOURCE_TYPES.map((r) => RESOURCE_LABELS[r].toLowerCase()).join(', ')}.
      </p>
    </div>
  );
}
