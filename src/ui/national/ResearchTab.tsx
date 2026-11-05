import { useMemo, useState } from 'react';
import { Brain, Factory, Landmark, Pickaxe, Swords } from 'lucide-react';
import type { NationView } from '../../../shared/protocol.ts';
import {
  TECH_CATEGORIES,
  TECH_IDS,
  TECHNOLOGIES,
  missingPrereqs,
  researchBlocker,
  techKnowledge,
  researchEtaDays,
  techDailyUsd,
  techDays,
  type TechCategory,
  type TechId,
} from '../../../shared/strategic/technologies.ts';
import { formatUsd } from '../../lib/format.ts';
import { treeLayout } from './techTree.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { isSandboxMatch } from '../../state/sandbox.ts';

const CATEGORY_ORDER: TechCategory[] = ['military', 'state', 'industry', 'resources'];

/**
 * Pesquisa nacional (Fase 5): árvore por categoria de investimento, com pré-requisitos, custo em
 * US$ por dia (sai do caixa do país enquanto a pesquisa corre, desde 02/11), investido até agora, prazo e o que cada
 * pesquisa libera. Pesquisas militares liberam pacotes de modernização: as tropas só ganham o
 * benefício depois de modernizadas numa instalação (painel de comando das unidades).
 */
/** Ícone de cada área de pesquisa (Sala de Situação: sem emojis). */
const CATEGORY_ICON = { military: Swords, industry: Factory, resources: Pickaxe, state: Landmark } as const;

export function ResearchTab({ nation, onSelect }: { nation: NationView; onSelect: (id: TechId | null) => void }) {
  const r = nation.research;
  const scale = r.usdScale ?? 1;
  const current = r.current ? TECHNOLOGIES[r.current] : null;
  const daily = r.current ? techDailyUsd(r.current) * scale : 0;
  return (
    <div className="space-y-3 text-xs">
      <section className="rounded border border-ink-700 bg-ink-900 p-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-ink-100">Pesquisa nacional</span>
          {current && <span className="font-mono text-ink-200">−{formatUsd(daily)}/dia do caixa</span>}
        </div>
        {current ? (
          <p className="mt-1 text-ink-300">
            Projeto atual: <b className="text-ink-100">{current.label}</b>, {researchEtaDays(r.current!, r.progress[r.current!] ?? 0)} dias para terminar.
            {r.stalled && <span className="text-signal-red"> Parada: o caixa do país não tem saldo para o dia.</span>}
          </p>
        ) : (
          <p className="mt-1 text-ink-400">Nenhum projeto ativo: nada sai do caixa para pesquisa.</p>
        )}
        <p className="mt-1 text-[11px] text-ink-400">
          Cada pesquisa custa US$ por dia, descontado do caixa enquanto corre (aparece no extrato), mais o conhecimento ao começar. Pausar ou trocar de
          projeto guarda o progresso.
        </p>
      </section>

      <AreaTree nation={nation} onSelect={onSelect} />
    </div>
  );
}

const NODE_W = 140;
const NODE_H = 72;
const GAP_X = 28;
const GAP_Y = 10;

type NodeState = 'done' | 'active' | 'locked' | 'paused' | 'ready';

function nodeState(id: TechId, nation: NationView, era = 4): NodeState {
  const r = nation.research;
  if (r.done.includes(id)) return 'done';
  if (r.current === id) return 'active';
  if (missingPrereqs(id, r.done).length > 0) return 'locked';
  const minEra = TECHNOLOGIES[id].minEra;
  if (minEra && era < minEra) return 'locked';
  return (r.progress[id] ?? 0) > 0 ? 'paused' : 'ready';
}

/**
 * Pesquisa por área (01/11, pedido do usuário: "o HUD de pesquisas está muito poluído"): um menu com as áreas e, em
 * cada uma, a árvore de nós ligados pelos pré-requisitos. Tocar num nó abre o detalhe (efeitos, custo, prazo e o
 * botão de pesquisar) embaixo da árvore.
 */
function AreaTree({ nation, onSelect }: { nation: NationView; onSelect: (id: TechId | null) => void }) {
  const r = nation.research;
  const era = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot)?.era ?? 1);
  const [area, setArea] = useState<TechCategory>(() => (r.current ? TECHNOLOGIES[r.current].category : CATEGORY_ORDER[0]!));
  const [picked, setPicked] = useState<TechId | null>(r.current);
  const ids = TECH_IDS.filter((id) => TECHNOLOGIES[id].category === area);
  const tree = useMemo(() => treeLayout(ids, (id) => TECHNOLOGIES[id as TechId].prereqs), [area]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = new Map(tree.nodes.map((n) => [n.id, n]));
  const x = (col: number) => col * (NODE_W + GAP_X);
  const y = (row: number) => row * (NODE_H + GAP_Y);
  const width = tree.cols * (NODE_W + GAP_X) - GAP_X;
  const height = tree.rows * (NODE_H + GAP_Y) - GAP_Y;
  const shown = picked && TECHNOLOGIES[picked].category === area ? picked : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist" aria-label="Áreas de pesquisa">
        {CATEGORY_ORDER.map((cat) => {
          const all = TECH_IDS.filter((id) => TECHNOLOGIES[id].category === cat);
          const done = all.filter((id) => r.done.includes(id)).length;
          const running = r.current !== null && TECHNOLOGIES[r.current].category === cat;
          const open = all.filter((id) => nodeState(id, nation, era) === 'ready' || nodeState(id, nation, era) === 'paused').length;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={area === cat}
              className={`border px-2 py-1.5 text-left ${area === cat ? 'border-brass-400/70 bg-brass-400/10 shadow-[inset_0_0_0_1px_rgb(226_181_77/0.2)]' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
              style={{ clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)' }}
              onClick={() => setArea(cat)}
            >
              <div className="flex items-center gap-1.5 font-semibold text-ink-100">
                {(() => {
                  const Icon = CATEGORY_ICON[cat as keyof typeof CATEGORY_ICON] ?? Landmark;
                  return <Icon size={14} className={area === cat ? 'text-brass-400' : 'text-ink-300'} aria-hidden />;
                })()}
                {TECH_CATEGORIES[cat].label}
              </div>
              <div className="text-[10px] text-ink-400">
                {done}/{all.length} concluídas{running ? ' · ▶ em andamento' : open ? ` · ${open} disponíve${open > 1 ? 'is' : 'l'}` : ''}
              </div>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded border border-ink-700 bg-ink-950/60 p-2.5">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {tree.edges.map((e) => {
              const a = at.get(e.from)!;
              const b = at.get(e.to)!;
              const x1 = x(a.col) + NODE_W;
              const y1 = y(a.row) + NODE_H / 2;
              const x2 = x(b.col);
              const y2 = y(b.row) + NODE_H / 2;
              const ok = r.done.includes(e.from as TechId);
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M${x1},${y1} C${x1 + GAP_X / 2},${y1} ${x2 - GAP_X / 2},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={ok ? '#4fbf7a' : '#41566b'}
                  strokeWidth={2}
                  strokeDasharray={ok ? undefined : '4 3'}
                />
              );
            })}
          </svg>
          {tree.nodes.map((n) => {
            const id = n.id as TechId;
            const t = TECHNOLOGIES[id];
            const state = nodeState(id, nation, era);
            const progress = r.progress[id] ?? 0;
            const look = {
              done: 'border-signal-green/60 bg-[#13261c]',
              active: 'border-signal-blue bg-ink-850',
              locked: 'border-ink-700 bg-ink-900 opacity-70',
              paused: 'border-brass-400/60 bg-ink-900',
              ready: 'border-ink-600 bg-ink-900',
            }[state];
            return (
              <button
                key={id}
                className={`absolute overflow-hidden rounded border px-1.5 py-1 text-left ${look} ${shown === id ? 'ring-2 ring-signal-blue' : ''}`}
                style={{ left: x(n.col), top: y(n.row), width: NODE_W, height: NODE_H }}
                onClick={() => setPicked(id)}
                title={t.description}
              >
                <div className="truncate text-[11px] font-semibold text-ink-100">
                  {{ done: '✔', active: '▶', locked: '🔒', paused: '⏸', ready: '○' }[state]} {t.label}
                </div>
                <div className="line-clamp-2 text-[10px] leading-tight text-ink-400">{t.unlocks[0] ?? t.description}</div>
                {state !== 'done' && (
                  <div className="truncate text-[9px] text-ink-300">
                    <Brain size={11} className="inline-block align-[-1px] text-[#b9a4f2]" aria-hidden /> {techKnowledge(id)}
                    {t.minEra ? ` · era ${t.minEra}` : ''}
                  </div>
                )}
                {n.external.length > 0 && state === 'locked' && (
                  <div className="truncate text-[9px] text-brass-400">requer {n.external.map((p) => TECHNOLOGIES[p as TechId].label).join(', ')}</div>
                )}
                {progress > 0 && state !== 'done' && (
                  <div className="absolute right-0 bottom-0 left-0 h-1 bg-[#1b2a3a]">
                    <div className={`h-full ${state === 'active' ? 'bg-signal-blue' : 'bg-brass-400/70'}`} style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {shown ? (
        <TechCard id={shown} nation={nation} onSelect={onSelect} />
      ) : (
        <p className="text-[11px] text-ink-400">Toque numa pesquisa da árvore para ver o que ela libera, o custo e o prazo.</p>
      )}
    </>
  );
}

function TechCard({ id, nation, onSelect }: { id: TechId; nation: NationView; onSelect: (id: TechId | null) => void }) {
  const r = nation.research;
  const t = TECHNOLOGIES[id];
  const done = r.done.includes(id);
  const active = r.current === id;
  const progress = r.progress[id] ?? 0;
  const invested = r.invested?.[id] ?? 0;
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const sandbox = isSandboxMatch();
  const kpPaid = (r.kpPaid ?? []).includes(id);
  const blocker = done ? null : researchBlocker(id, r.done, sandbox ? {} : { era: me?.era ?? 1, knowledge: me?.knowledge ?? 0, kpPaid });
  const locked = !done && missingPrereqs(id, r.done).length > 0;
  const dailyUsd = techDailyUsd(id) * (r.usdScale ?? 1);
  const totalUsd = dailyUsd * techDays(id);
  const eta = researchEtaDays(id, progress);
  const state = done ? 'done' : active ? 'active' : locked ? 'locked' : progress > 0 ? 'paused' : 'ready';
  const border = { done: 'border-signal-green/40', active: 'border-signal-blue bg-ink-850', locked: 'border-ink-700 opacity-75', paused: 'border-brass-400/50', ready: 'border-ink-700' }[state];
  return (
    <div className={`rounded border bg-ink-900 p-2.5 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-ink-100">
            {done ? '✔ ' : active ? '▶ ' : locked ? '🔒 ' : ''}
            {t.label}
          </div>
          <div className="text-[11px] text-ink-400">{t.description}</div>
        </div>
        {done ? (
          <span className="shrink-0 text-signal-green">Concluída{r.doneDay?.[id] !== undefined ? ` (dia ${r.doneDay[id]})` : ''}</span>
        ) : active ? (
          <button className="btn shrink-0 px-2 py-1 text-xs" onClick={() => onSelect(null)} title="Pausa o projeto: o progresso e o investido ficam guardados">
            Pausar
          </button>
        ) : (
          <button className="btn shrink-0 px-2 py-1 text-xs" disabled={!!blocker} onClick={() => onSelect(id)} title={blocker ?? (r.current ? 'Troca o projeto atual por este (o atual fica pausado, sem perder progresso)' : 'Iniciar')}>
            {progress > 0 ? 'Retomar' : 'Pesquisar'}
          </button>
        )}
      </div>

      {t.prereqs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
          <span className="text-ink-400">Requer:</span>
          {t.prereqs.map((p) => {
            const ok = r.done.includes(p);
            return (
              <span key={p} className={`rounded border px-1 ${ok ? 'border-signal-green/40 text-signal-green' : 'border-red-400/40 text-red-300'}`}>
                {ok ? '✔' : '✖'} {TECHNOLOGIES[p].label}
              </span>
            );
          })}
        </div>
      )}

      <ul className="mt-1.5 space-y-0.5 text-[11px] text-ink-200">
        {t.unlocks.map((u) => (
          <li key={u} className="flex gap-1.5">
            <span className="text-signal-blue" aria-hidden>
              ›
            </span>
            {u}
          </li>
        ))}
      </ul>

      {!done && (
        <>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#1b2a3a]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded ${active ? 'bg-signal-blue' : 'bg-brass-400/70'}`} style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="w-28 text-right font-mono text-[10px] text-ink-400">
              {Math.round(progress * 100)}% · {eta} dias
            </span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 text-[10px] text-ink-400 sm:grid-cols-4">
            <span>Custo: {formatUsd(dailyUsd)}/dia do caixa</span>
            <span>Conhecimento: <Brain size={11} className="inline-block align-[-1px] text-[#b9a4f2]" aria-hidden /> {techKnowledge(id)}{kpPaid ? ' (pago)' : ''}</span>
            <span>Investido: {formatUsd(invested)}</span>
            <span>Falta: {formatUsd(totalUsd * (1 - progress))}</span>
            <span>Prazo: {t.minDays} dias (total {formatUsd(totalUsd)})</span>
          </div>
        </>
      )}
    </div>
  );
}
