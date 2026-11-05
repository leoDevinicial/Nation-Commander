import { useState } from 'react';
import { ChartColumn, FlaskConical, Handshake, LayoutDashboard, Scale, Ship, Stethoscope, Wallet, X } from 'lucide-react';
import { Frame } from '../components/Frame.tsx';
import { factionColor } from '../../game/render/palette.ts';
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
import { TradeTab } from './TradeTab.tsx';
import { PolicyTab } from './PolicyTab.tsx';
import { makeNameOf } from '../../game/nationalText.ts';
import type { DiplomaticAction } from '../../../shared/strategic/Diplomacy.ts';

const TABS = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'budget', label: 'Orçamento', icon: Wallet },
  { id: 'research', label: 'Pesquisa', icon: FlaskConical },
  { id: 'policy', label: 'Política', icon: Scale },
  { id: 'diplomacy', label: 'Diplomacia', icon: Handshake },
  { id: 'trade', label: 'Comércio', icon: Ship },
  { id: 'diagnosis', label: 'Diagnóstico', icon: Stethoscope },
  { id: 'data', label: 'Dados', icon: ChartColumn },
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
    // Sala de Situação (05/11): moldura de comando, insígnia do país na cor da nação e abas com ícone e sublinhado de latão
    <Frame
      className="pointer-events-auto absolute top-16 right-3 bottom-[246px] z-30 w-[520px] max-w-[calc(100vw-24px)] max-sm:inset-x-2 max-sm:top-15 max-sm:bottom-2 max-sm:w-auto max-sm:max-w-none [@media(max-height:520px)]:top-14 [@media(max-height:520px)]:bottom-2"
      innerClassName="flex flex-col ![background:linear-gradient(180deg,rgb(16_22_31/0.97),rgb(10_14_20/0.96))]"
      onPointerDown={(e) => e.stopPropagation()}
    >
     <div className="flex min-h-0 flex-1 flex-col" onWheel={(e) => e.stopPropagation()} role="dialog" aria-label="Painel nacional">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {nation && (
            <span
              className="nc-num grid h-8 w-11 shrink-0 place-items-center text-xs font-bold text-white"
              style={{ background: factionColor(mySlot), clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)', textShadow: '0 1px 2px rgb(0 0 0 / 0.5)' }}
              aria-hidden
            >
              {nation.countryId}
            </span>
          )}
          <div className="min-w-0">
            <div className="nc-title truncate text-lg leading-none" translate="no">
              {nation ? countryName(nation.countryId) : 'Nação'}
            </div>
            <div className="nc-kicker mt-1">{date ? `${formatDate(date)} · dia ${day} do cenário` : 'Aguardando dados…'}</div>
          </div>
        </div>
        <button className="nc-icon-btn shrink-0" onClick={onClose} title="Fechar (G)" aria-label="Fechar painel nacional">
          <X size={17} aria-hidden />
        </button>
      </div>
      <div className="no-scrollbar flex overflow-x-auto px-2 pt-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="nc-tab !flex-none px-2.5" onClick={() => setTab(t.id)} title={t.label}>
            <t.icon size={13} aria-hidden />
            <span>{t.label}</span>
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
        ) : tab === 'policy' ? (
          <PolicyTab
            nation={nation}
            day={day}
            nameOf={nameOf}
            onDecree={(id, active) => gameClient.send({ t: 'national', cmd: { type: 'decree', id, active } })}
            onRespond={(accept) => gameClient.send({ t: 'national', cmd: { type: 'request_respond', accept } })}
          />
        ) : tab === 'trade' ? (
          <TradeTab
            nation={nation}
            mySlot={mySlot}
            partners={(diplomacy?.nations ?? []).map((n) => ({ id: n.id, name: nameOf(n.id), known: n.known }))}
          />
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
    </Frame>
  );
}
