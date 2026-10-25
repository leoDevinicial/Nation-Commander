import { useState } from 'react';
import { countryName } from '../../../shared/data/countries.ts';
import type { Budget } from '../../../shared/strategic/NationalSimulation.ts';
import type { TechId } from '../../../shared/strategic/technologies.ts';
import { gameClient } from '../../net/client.ts';
import { formatDate } from '../../lib/format.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { BudgetTab } from './BudgetTab.tsx';
import { DataTab } from './DataTab.tsx';
import { DiagnosisTab } from './DiagnosisTab.tsx';
import { OverviewTab } from './OverviewTab.tsx';
import { ResearchTab } from './ResearchTab.tsx';

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'budget', label: 'Orçamento' },
  { id: 'research', label: 'Pesquisa' },
  { id: 'diagnosis', label: 'Diagnóstico' },
  { id: 'data', label: 'Dados' },
] as const;

type Tab = (typeof TABS)[number]['id'];

export function NationalPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const mySlot = useAppStore((s) => s.match?.yourSlot ?? 0);
  const balanceMode = useAppStore((s) => s.match?.balanceMode ?? 'parity');
  const nation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const history = useNationalStore((s) => s.history[mySlot] ?? []);
  const day = useNationalStore((s) => s.day);
  const date = useNationalStore((s) => s.date);

  const applyBudget = (budget: Budget) => gameClient.send({ t: 'national', cmd: { type: 'set_budget', budget } });
  const selectResearch = (techId: TechId | null) => gameClient.send({ t: 'national', cmd: { type: 'set_research', techId } });

  return (
    <div
      className="panel pointer-events-auto absolute top-16 right-3 bottom-[200px] z-20 flex w-[480px] max-w-[calc(100vw-24px)] flex-col"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Painel nacional"
    >
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
        <div>
          <div className="text-sm font-semibold">{nation ? countryName(nation.countryId) : 'Nação'}</div>
          <div className="text-[11px] text-ink-400">{date ? `${formatDate(date)} · dia ${day} do cenário` : 'Aguardando dados…'}</div>
        </div>
        <button className="btn px-2 py-1 text-xs" onClick={onClose} title="Fechar (G)">
          ✖
        </button>
      </div>
      <div className="flex gap-1 border-b border-ink-700 px-2 pt-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`rounded-t px-2.5 py-1.5 text-xs font-semibold ${tab === t.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!nation ? (
          <p className="text-sm text-ink-400">Aguardando o primeiro relatório nacional do servidor…</p>
        ) : tab === 'overview' ? (
          <OverviewTab nation={nation} history={history} day={day} balanceMode={balanceMode} />
        ) : tab === 'budget' ? (
          <BudgetTab nation={nation} onApply={applyBudget} balanceMode={balanceMode} />
        ) : tab === 'research' ? (
          <ResearchTab nation={nation} onSelect={selectResearch} />
        ) : tab === 'diagnosis' ? (
          <DiagnosisTab nation={nation} />
        ) : (
          <DataTab nation={nation} />
        )}
      </div>
    </div>
  );
}
