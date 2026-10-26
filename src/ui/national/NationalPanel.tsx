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
import { DiplomacyTab } from './DiplomacyTab.tsx';
import { makeNameOf } from '../../game/nationalText.ts';
import type { DiplomaticAction } from '../../../shared/strategic/Diplomacy.ts';

const TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'budget', label: 'Orçamento' },
  { id: 'research', label: 'Pesquisa' },
  { id: 'diplomacy', label: 'Diplomacia' },
  { id: 'diagnosis', label: 'Diagnóstico' },
  { id: 'data', label: 'Dados' },
] as const;

type Tab = (typeof TABS)[number]['id'];

export function NationalPanel({ onClose }: { onClose: () => void }) {
  const requested = useNationalStore((s) => s.panelTab);
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => t.id === requested)?.id ?? 'overview');
  const mySlot = useAppStore((s) => s.match?.yourSlot ?? 0);
  const balanceMode = useAppStore((s) => s.match?.balanceMode ?? 'parity');
  const nation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const history = useNationalStore((s) => s.history[mySlot] ?? []);
  const day = useNationalStore((s) => s.day);
  const date = useNationalStore((s) => s.date);
  const diplomacy = useNationalStore((s) => s.diplomacy);
  const players = useAppStore((s) => s.match?.players ?? []);

  const applyBudget = (budget: Budget) => gameClient.send({ t: 'national', cmd: { type: 'set_budget', budget } });
  const selectResearch = (techId: TechId | null) => gameClient.send({ t: 'national', cmd: { type: 'set_research', techId } });
  const diplomaticAction = (action: DiplomaticAction) => gameClient.send({ t: 'national', cmd: { type: 'diplomacy', action } });
  const nameOf = makeNameOf(players, diplomacy?.nations ?? []);

  return (
    <div
      className="panel pointer-events-auto absolute top-16 right-3 bottom-[200px] z-30 flex w-[520px] max-w-[calc(100vw-24px)] flex-col max-sm:inset-x-2 max-sm:top-15 max-sm:bottom-2 max-sm:w-auto max-sm:max-w-none [@media(max-height:520px)]:top-14 [@media(max-height:520px)]:bottom-2"
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
        <button className="btn px-2 py-1 text-xs" onClick={onClose} title="Fechar (G)" aria-label="Fechar painel nacional">
          ✖
        </button>
      </div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-700 px-2 pt-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`shrink-0 rounded-t px-2.5 py-2 text-xs font-semibold sm:py-1.5 ${tab === t.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
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
        ) : tab === 'diplomacy' ? (
          diplomacy ? (
            <DiplomacyTab
              me={nation}
              diplomacy={diplomacy}
              day={day}
              nameOf={nameOf}
              onAction={diplomaticAction}
              onDeclareWar={(id) => useNationalStore.getState().setWarTarget(id)}
              onShowOnGlobe={(c) => useNationalStore.getState().openGlobe(c)}
            />
          ) : (
            <p className="text-ink-400">Aguardando dados diplomáticos…</p>
          )
        ) : tab === 'diagnosis' ? (
          <DiagnosisTab nation={nation} />
        ) : (
          <DataTab nation={nation} />
        )}
      </div>
    </div>
  );
}
