import { useState } from 'react';
import { BUILDINGS, UNITS, type UnitType } from '../../../shared/sim/config.ts';
import { SANDBOX_MAX_SPAWN, type SandboxToggle } from '../../../shared/sim/commands.ts';
import { upgradeTrack, type SpecId } from '../../../shared/sim/upgrades.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore } from '../../state/useHudStore.ts';

/** Botão da barra superior que abre as ferramentas do modo Sandbox. */
export function SandboxChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded border border-brass-400/60 px-2 font-semibold tracking-wide text-brass-400 ${open ? 'bg-brass-400/15' : ''}`}
      onClick={onToggle}
      aria-expanded={open}
      title="Modo Sandbox: recursos ilimitados, tudo liberado e ferramentas de teste"
    >
      <span aria-hidden>🧪</span>
      SANDBOX
    </button>
  );
}

const TOGGLES: { key: SandboxToggle; label: string; hint: string }[] = [
  { key: 'instant', label: 'Tudo instantâneo', hint: 'Obras, melhorias, produção, pesquisas, aeronaves e mísseis ficam prontos na hora.' },
  { key: 'aiActive', label: 'IA inimiga ativa', hint: 'Desligada, a base inimiga fica parada como alvo. Ligada, ela constrói, produz e ataca.' },
  { key: 'reveal', label: 'Revelar o mapa', hint: 'Mostra o mapa inteiro, sem névoa de guerra (inclusive a base inimiga).' },
];

const COUNTS = [1, 5, 10, SANDBOX_MAX_SPAWN];

const TIPS = [
  'Construa qualquer edifício: sem custo, sem pesquisa e, com "Tudo instantâneo", pronto na hora.',
  'Selecione um edifício e toque em "Nível máximo" para ver a versão final (e as especializações).',
  'Crie tropas inimigas no centro da tela para testar combate, contras e defesas.',
  'Base Aérea + caças e Silo + mísseis funcionam desde o início: você já está em guerra com a IA.',
  'Ligue "IA inimiga ativa" para enfrentar as ondas de ataque com o seu exército de teste.',
  'O QG não cai e a partida não termina sozinha: use o Menu → Render-se para sair.',
];

/**
 * Ferramentas do modo Sandbox: regras (instantâneo, IA, névoa), criação de tropas próprias ou
 * inimigas no centro da tela (opcionalmente com todos os pacotes de modernização), nível de
 * qualquer edifício selecionado, modernização instantânea, remoção e dicas de teste.
 */
export function SandboxPanel({ runtime, onClose }: { runtime: GameRuntime; onClose: () => void }) {
  const opts = useHudStore((s) => s.sandbox);
  const thumbs = useHudStore((s) => s.thumbs);
  const building = useHudStore((s) => s.selectedBuilding);
  const units = useHudStore((s) => s.selectedUnits);
  const [enemy, setEnemy] = useState(false);
  const [count, setCount] = useState(5);
  const [maxed, setMaxed] = useState(true);
  const [tips, setTips] = useState(false);
  const track = building ? upgradeTrack(building.type) : undefined;
  const [spec, setSpec] = useState<SpecId | null>(null);
  const specs = track?.specs ?? [];

  return (
    <div
      className="panel scroll-thin max-h-[calc(100dvh-4.5rem)] w-[min(25rem,calc(100vw-1rem))] overflow-y-auto bg-ink-900 p-3 text-xs text-ink-200"
      role="dialog"
      aria-label="Ferramentas do Sandbox"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-brass-400">🧪 Modo Sandbox</div>
          <div className="text-ink-400">Recursos ilimitados, tudo pesquisado e liberado. Nada aqui conta no seu histórico.</div>
        </div>
        <button className="btn min-h-8 px-2" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>

      <Section title="Regras">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex min-h-8 cursor-pointer items-center justify-between gap-3" title={t.hint}>
            <span>
              {t.label}
              <span className="block text-[11px] text-ink-400">{t.hint}</span>
            </span>
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#e0b44c]" checked={!!opts?.[t.key]} onChange={(e) => runtime.sandboxToggle(t.key, e.target.checked)} />
          </label>
        ))}
      </Section>

      <Section title="Criar tropas no centro da tela">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded border border-ink-700" role="radiogroup" aria-label="Lado">
            {[
              [false, 'Minhas'],
              [true, 'Inimigas'],
            ].map(([v, label]) => (
              <button
                key={String(v)}
                role="radio"
                aria-checked={enemy === v}
                className={`px-2 py-1 ${enemy === v ? (v ? 'bg-red-500/30 text-red-200' : 'bg-signal-green/25 text-ink-100') : ''}`}
                onClick={() => setEnemy(v as boolean)}
              >
                {label as string}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded border border-ink-700" role="radiogroup" aria-label="Quantidade">
            {COUNTS.map((n) => (
              <button key={n} role="radio" aria-checked={count === n} className={`px-2 py-1 font-mono ${count === n ? 'bg-brass-400/25 text-ink-100' : ''}`} onClick={() => setCount(n)}>
                ×{n}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" className="h-4 w-4 accent-[#e0b44c]" checked={maxed} onChange={(e) => setMaxed(e.target.checked)} />
            Totalmente modernizadas
          </label>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(Object.keys(UNITS) as UnitType[]).map((u) => (
            <button
              key={u}
              className="btn flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11px] leading-tight"
              onClick={() => runtime.sandboxSpawn(u, count, enemy, maxed)}
              title={`Criar ${count}× ${UNITS[u].label} ${enemy ? 'inimigos' : 'seus'}`}
            >
              {thumbs[u] ? <img src={thumbs[u]} alt="" className="h-10 w-10 object-contain" /> : null}
              {UNITS[u].label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Seleção">
        {building && track ? (
          <div>
            <div className="text-ink-400">
              {BUILDINGS[building.type].label} · nível {building.level} de {track.maxLevel}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {Array.from({ length: track.maxLevel }, (_, i) => i + 1).map((lv) => (
                <button key={lv} className={`btn min-h-7 px-2 font-mono ${building.level === lv ? 'btn-primary' : ''}`} onClick={() => runtime.sandboxLevel(lv, spec ?? undefined)}>
                  {lv}
                </button>
              ))}
            </div>
            {specs.length > 0 && (
              <div className="mt-1.5">
                <div className="text-[11px] text-ink-400">Especialização (a partir do nível {track.specLevel}):</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {specs.map((sp) => (
                    <button key={sp.id} className={`btn min-h-7 px-2 ${(spec ?? building.spec) === sp.id ? 'btn-primary' : ''}`} onClick={() => setSpec(sp.id)} title={sp.summary}>
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button className="btn btn-primary mt-2 w-full" onClick={() => runtime.sandboxLevel(track.maxLevel, spec ?? undefined)}>
              ⬆ Nível máximo
            </button>
          </div>
        ) : building ? (
          <div className="text-ink-400">{BUILDINGS[building.type].label} não tem melhorias.</div>
        ) : null}
        {units.length > 0 && (
          <button className="btn mt-2 w-full" onClick={() => runtime.sandboxMaxout()}>
            ★ Modernizar tudo e curar ({units.length} {units.length === 1 ? 'unidade' : 'unidades'})
          </button>
        )}
        {(building || units.length > 0) && (
          <button className="btn btn-danger mt-2 w-full" onClick={() => runtime.sandboxRemoveSelected()}>
            Remover a seleção
          </button>
        )}
        {!building && units.length === 0 && <div className="text-ink-400">Selecione um edifício (para mudar o nível) ou unidades (para modernizar ou remover).</div>}
      </Section>

      <Section title="Limpar o campo">
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn" onClick={() => runtime.sandboxClear('enemy')}>
            Remover tropas inimigas
          </button>
          <button className="btn" onClick={() => runtime.sandboxClear('mine')}>
            Remover minhas tropas
          </button>
        </div>
      </Section>

      <div className="mt-3 border-t border-ink-700 pt-2">
        <button className="text-left font-semibold text-ink-100" onClick={() => setTips(!tips)} aria-expanded={tips}>
          {tips ? '▾' : '▸'} Como testar
        </button>
        {tips && (
          <ul className="mt-1 list-disc space-y-1 pl-4 text-ink-200">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-ink-700 pt-2">
      <div className="mb-1 font-semibold text-ink-100">{title}</div>
      {children}
    </div>
  );
}
