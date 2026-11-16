import { useState } from 'react';
import { Minus, Plus, Scissors } from 'lucide-react';
import type { NationView } from '../../../shared/protocol.ts';
import { AREA_FX, AREA_KEYS, AREA_LABEL, AREA_LIMITS, DEFAULT_AREAS, averageTax, clampAreas, taxApproval, type AreaKey, type Areas } from '../../../shared/strategic/areas.ts';
import { COEF, theaterSupply } from '../../../shared/strategic/params.ts';
import { ZONING, type ZoneKind } from '../../../shared/sim/zoning.ts';
import { formatSigned, formatUsd } from '../../lib/format.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { gameClient } from '../../net/client.ts';

/** Linhas do extrato do dia que cada área paga (para mostrar o custo de hoje). */
const AREA_LINES: Record<AreaKey, string[]> = {
  defense: ['defense'],
  infrastructure: ['buildings', 'roads'],
  education: ['svc_education'],
  health: ['svc_health'],
  security: ['svc_security'],
  research: ['research'],
  social: ['social'],
};

const AREA_HINT: Record<AreaKey, string> = {
  defense: 'Logística militar: os suprimentos/s que chegam ao teatro.',
  infrastructure: 'Manutenção de prédios e estradas: ritmo das obras e o índice de infraestrutura (QG alto e produtividade).',
  education: 'Escolas e universidades: conhecimento formado e capital humano.',
  health: 'Hospitais: formação de cidadãos no Centro de Comando e aprovação onde cobrem.',
  security: 'Delegacias: aprovação onde cobrem e protestos mais fracos.',
  research: 'Pesquisa nacional: ritmo e custo do dia da pesquisa em andamento.',
  social: 'Prefeituras e administração: aprovação geral e estabilidade.',
};

const TAX_ROWS: { k: ZoneKind; label: string }[] = [
  { k: 'res', label: 'Residencial (cidadãos e casas)' },
  { k: 'com', label: 'Comercial' },
  { k: 'ind', label: 'Industrial' },
];

/** O que a área faz no nível `v` (texto curto com números do jogo). */
function effectText(k: AreaKey, v: number, nation: NationView): string {
  const l = v / 100;
  const pct = (x: number) => (Math.abs(x - 1) < 0.005 ? '±0%' : `${x > 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}%`);
  switch (k) {
    case 'defense':
      return `${theaterSupply(((nation.referenceBudget.defensePct * l) / 100) * (COEF.parityGdpUsd / 1e9)).toFixed(2)} suprimentos/s (sem bônus)`;
    case 'infrastructure':
      return `obras ${pct(AREA_FX.buildSpeed(l))} · índice tende a ${AREA_FX.infraIndexTarget(l).toFixed(2)}`;
    case 'education':
      return `conhecimento ${pct(AREA_FX.knowledge(l))}`;
    case 'health':
      return `formação de cidadãos ${pct(AREA_FX.citizens(l))} · cobertura ×${l.toFixed(1)} na aprovação`;
    case 'security':
      return `cobertura das delegacias ×${l.toFixed(1)} na aprovação`;
    case 'research':
      return `pesquisas ${pct(AREA_FX.research(l))} · custo do dia ×${l.toFixed(1)}`;
    case 'social':
      return `aprovação ${formatSigned(AREA_FX.socialApproval(l), 0, '')}`;
  }
}

/**
 * Orçamento do país do cenário (16/11, `shared/strategic/areas.ts`), no estilo dos orçamentos de serviço de Cities:
 * impostos em cima (aplicam na hora) e as áreas embaixo, de 50% a 150%, cada uma com o custo de hoje, o custo no
 * rascunho e o efeito em números do jogo; o saldo do dia antes → depois.
 */
export function BudgetTab({ nation, onApply }: { nation: NationView; onApply: (a: Areas) => void }) {
  const current = clampAreas(nation.areas);
  const [edited, setEdited] = useState<Areas | null>(null);
  const draft = edited ?? current;
  const dirty = edited !== null && AREA_KEYS.some((k) => draft[k] !== current[k]);
  const tax = useHudStore((s) => s.zoning?.tax) ?? { res: ZONING.taxDefault, com: ZONING.taxDefault, ind: ZONING.taxDefault };
  const today = nation.works.today;
  const lineUsd = (keys: string[]) => keys.reduce((a, key) => a + (today?.expense.find((l) => l.key === key)?.usd ?? 0), 0);
  const effective = (k: AreaKey) => nation.areasCut?.[k] ?? current[k];
  const costToday = (k: AreaKey) => lineUsd(AREA_LINES[k]);
  // custo do rascunho: o de hoje proporcional ao nível (as linhas escalam linearmente com ele)
  const costDraft = (k: AreaKey) => (effective(k) > 0 ? (costToday(k) * draft[k]) / effective(k) : 0);
  const delta = AREA_KEYS.reduce((a, k) => a + costDraft(k) - costToday(k), 0);
  const net = today?.net ?? 0;
  const incomeOf = (prefix: string) => today?.income.filter((l) => l.key.startsWith(prefix)).reduce((a, l) => a + l.usd, 0) ?? 0;
  const setTax = (k: ZoneKind, pct: number) => gameClient.send({ t: 'cmd', cmd: { type: 'zone_tax', kind: k, pct: Math.max(0, Math.min(ZONING.taxMax, Math.round(pct))) } });
  const cut = nation.areasCut ? (Object.keys(nation.areasCut) as AreaKey[]) : [];

  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink-400">
        O orçamento governa o país do mapa: cada área paga prédios e serviços que estão no cenário e muda o que acontece nele. Valores por dia (1 dia = 1 s a
        1×).
      </p>

      <section className="space-y-1.5 rounded border border-ink-700 bg-ink-900 p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="nc-kicker">Impostos</span>
          <span className="text-[11px] text-ink-400">
            {`aprovação ${formatSigned(taxApproval(averageTax(tax)), 0, '')} · rendem ${formatUsd(incomeOf('tax_'))}/dia`}
          </span>
        </div>
        {TAX_ROWS.map(({ k, label }) => (
          <div key={k} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-ink-200">{label}</span>
            <button className="btn min-h-6 px-1.5 py-0" aria-label={`Menos imposto ${label}`} disabled={tax[k] <= 0} onClick={() => setTax(k, tax[k] - 1)}>
              <Minus size={12} aria-hidden />
            </button>
            <span className="w-9 text-center font-mono text-ink-100">{tax[k]}%</span>
            <button className="btn min-h-6 px-1.5 py-0" aria-label={`Mais imposto ${label}`} disabled={tax[k] >= ZONING.taxMax} onClick={() => setTax(k, tax[k] + 1)}>
              <Plus size={12} aria-hidden />
            </button>
          </div>
        ))}
        <p className="text-[10px] text-ink-400">Mais imposto: mais caixa por cidadão e por lote, mas os bairros crescem menos, abandonam mais e a aprovação cai (10% é neutro).</p>
      </section>

      {cut.length > 0 && (
        <p className="flex items-start gap-1.5 rounded border border-red-400/40 bg-red-500/10 p-2 text-red-200">
          <Scissors size={13} className="mt-px shrink-0" aria-hidden />
          <span>{`Caixa sem saldo: hoje o orçamento cortou ${cut.map((k) => `${AREA_LABEL[k]} (${nation.areasCut![k]}%)`).join(', ')}. Os efeitos caem junto.`}</span>
        </p>
      )}

      <section className="space-y-2.5">
        <span className="nc-kicker">Áreas (50% a 150%)</span>
        {AREA_KEYS.map((k) => {
          const v = draft[k];
          const changed = v !== current[k];
          return (
            <div key={k} title={AREA_HINT[k]}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`a-${k}`} className="text-ink-200">
                  {AREA_LABEL[k]}
                </label>
                <span className="font-mono text-ink-100">
                  {v}% <span className="text-ink-400">· {formatUsd(costDraft(k))}/dia</span>
                </span>
              </div>
              <input
                id={`a-${k}`}
                type="range"
                min={AREA_LIMITS[0]}
                max={Math.max(AREA_LIMITS[1], current[k])}
                step={10}
                value={v}
                onChange={(e) => setEdited({ ...draft, [k]: Number(e.target.value) })}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full accent-[#e2b54d]"
              />
              <div className="flex justify-between gap-2 text-[10px]">
                <span className={changed ? 'text-brass-400' : 'text-ink-400'}>{effectText(k, v, nation)}</span>
                {changed && <span className="shrink-0 font-mono text-ink-400">hoje {current[k]}%</span>}
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-ink-700 bg-ink-900 p-2.5 font-mono">
        <span className="font-sans text-ink-400">Saldo de hoje</span>
        <span className={`text-right ${net < 0 ? 'text-red-300' : 'text-signal-green'}`}>{formatSigned(net / 1e3, 0, ' mil')}/dia</span>
        {dirty && (
          <>
            <span className="font-sans text-ink-400">Com o rascunho</span>
            <span className={`text-right font-semibold ${net - delta < 0 ? 'text-red-300' : 'text-signal-green'}`}>{formatSigned((net - delta) / 1e3, 0, ' mil')}/dia</span>
          </>
        )}
        <span className="font-sans text-ink-400">Caixa do país</span>
        <span className="text-right text-ink-100">{formatUsd(nation.works.fundUsd)}</span>
      </div>

      <div className="flex gap-2">
        <button
          className="btn btn-primary flex-1"
          disabled={!dirty}
          onClick={() => {
            onApply(draft);
            setEdited(null);
          }}
        >
          Aplicar orçamento
        </button>
        <button className="btn" disabled={!dirty} onClick={() => setEdited(null)}>
          Descartar
        </button>
        <button className="btn" onClick={() => setEdited({ ...DEFAULT_AREAS })} title="Todas as áreas no custo de referência">
          Tudo em 100%
        </button>
      </div>
      <WorksFundBox nation={nation} />
    </div>
  );
}

/** Caixa do país: saldo, gasto na partida e o extrato das obras. */
function WorksFundBox({ nation }: { nation: NationView }) {
  const w = nation.works;
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-2.5">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-ink-200">Obras pagas pelo caixa</span>
        <span className="font-mono text-ink-100">{formatUsd(w.spentUsd)}</span>
      </div>
      <p className="mt-1 text-[10px] text-ink-400">
        O caixa recebe a produção, os impostos dos cidadãos e dos lotes e o comércio, e paga o exército, a energia, as áreas do orçamento, as melhorias,
        estradas, eras e Grandes Projetos. Nunca fica negativo: sem saldo, as áreas são cortadas. Extrato completo no US$ da barra superior.
      </p>
      {w.ledger.length > 0 && (
        <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px]">
          {[...w.ledger].reverse().map((l, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate text-ink-400">
                dia {l.day} · {l.description}
              </span>
              <span className={`shrink-0 font-mono ${l.usd > 0 ? 'text-red-300' : 'text-signal-green'}`}>
                {l.usd > 0 ? '−' : '+'}
                {formatUsd(Math.abs(l.usd))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
