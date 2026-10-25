import { GAME_SPEEDS } from '../../../shared/protocol.ts';
import { RESOURCE_LABELS, RESOURCE_TYPES, TICK_RATE, UNIT_CAP } from '../../../shared/sim/config.ts';
import { ResourceIcon } from '../components/Resources.tsx';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { formatDate, formatDuration, formatPct } from '../../lib/format.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';

export function TopBar({ runtime, onMenu, canControlSpeed }: { runtime: GameRuntime; onMenu: () => void; canControlSpeed: boolean }) {
  const players = useHudStore((s) => s.players);
  const mySlot = useHudStore((s) => s.mySlot);
  const tick = useHudStore((s) => s.tick);
  const paused = useHudStore((s) => s.paused);
  const pausedBy = useHudStore((s) => s.pausedBy);
  const speed = useHudStore((s) => s.speed);
  const fps = useHudStore((s) => s.fps);
  const showFps = useSettingsStore((s) => s.showFps);
  const roster = useAppStore((s) => s.match?.players ?? []);
  const connStatus = useAppStore((s) => s.connStatus);
  const me = players.find((p) => p.slot === mySlot);
  const date = useNationalStore((s) => s.date);
  const nation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const panelOpen = useNationalStore((s) => s.panelOpen);
  const togglePanel = useNationalStore((s) => s.setPanelOpen);
  const nextSpeed = GAME_SPEEDS[(GAME_SPEEDS.indexOf(speed) + 1) % GAME_SPEEDS.length]!;

  return (
    <div className="panel absolute top-2 right-2 left-2 flex h-11 items-center gap-2 px-2 text-xs sm:top-3 sm:right-3 sm:left-3 sm:h-10 sm:gap-4 sm:px-3 sm:text-sm">
      {/* indicadores: rolam na horizontal em telas estreitas em vez de cortar */}
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-3 overflow-x-auto sm:gap-4">
        {RESOURCE_TYPES.map((r) => (
          <div key={r} className="flex shrink-0 items-center gap-1" title={`${RESOURCE_LABELS[r]}: estoque e renda por segundo`}>
            <ResourceIcon type={r} />
            <span className="font-mono font-bold">{Math.floor(me?.resources?.[r] ?? 0)}</span>
            <span className="hidden text-[11px] text-signal-green xl:inline">+{(me?.income?.[r] ?? 0).toFixed(1)}</span>
          </div>
        ))}
        <div className="flex shrink-0 items-center gap-1.5" title="Unidades em campo e em produção / limite">
          <span className="text-ink-400" aria-hidden>
            ▲
          </span>
          <span className="font-mono">
            {me?.supply ?? 0}/{UNIT_CAP}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" title="Tempo de operação">
          <span className="text-ink-400" aria-hidden>
            ⏱
          </span>
          <span className="font-mono">{formatDuration(Math.floor(tick / TICK_RATE))}</span>
        </div>
        {date && (
          <div className="hidden shrink-0 items-center gap-2 lg:flex" title="Data do cenário (1 dia de jogo por segundo a 1×)">
            <span className="text-ink-400" aria-hidden>
              📅
            </span>
            <span className="font-mono">{formatDate(date)}</span>
          </div>
        )}
        {nation && (
          <div className="flex shrink-0 items-center gap-1.5" title="Aprovação do governo">
            <span className="hidden text-ink-400 lg:inline">Aprovação</span>
            <span className="text-ink-400 lg:hidden" aria-hidden>
              ☺
            </span>
            <span className={`font-mono ${nation.approval < 35 ? 'text-red-300' : 'text-ink-100'}`}>{formatPct(nation.approval, 0)}</span>
          </div>
        )}
        <div className="hidden items-center gap-3 2xl:flex">
          {roster.map((p) => (
            <span key={p.slot} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: factionColor(p.slot) }} aria-hidden />
              <span className={players.find((x) => x.slot === p.slot)?.defeated ? 'text-ink-400 line-through' : ''}>
                {p.name}
                {p.slot === mySlot && ' (você)'}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {connStatus !== 'connected' && (
          <span className="text-xs text-brass-400" title="Reconectando ao servidor">
            ⚠<span className="hidden sm:inline"> Reconectando…</span>
          </span>
        )}
        {showFps && <span className="hidden font-mono text-xs text-ink-400 sm:inline">{fps} qps</span>}
        {paused && <span className="hidden text-xs font-semibold text-brass-400 md:inline">PAUSADO{pausedBy ? ` por ${pausedBy}` : ''}</span>}
        <button className="btn min-h-8 px-2 py-1 text-xs whitespace-nowrap" onClick={() => runtime.togglePause()} title="Pausar/retomar (Espaço)" aria-label={paused ? 'Retomar' : 'Pausar'}>
          <PlayPauseIcon playing={!paused} />
          <span className="hidden sm:inline">{paused ? 'Retomar' : 'Pausar'}</span>
        </button>
        <div className="hidden gap-1 md:flex">
          {GAME_SPEEDS.map((s) => (
            <button
              key={s}
              className={`btn min-h-8 px-2 py-1 font-mono text-xs ${speed === s ? 'btn-primary' : ''}`}
              disabled={!canControlSpeed}
              title={canControlSpeed ? `Velocidade ${s}×` : 'Velocidade fixa em partidas entre jogadores'}
              onClick={() => runtime.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          className="btn min-h-8 px-2 py-1 font-mono text-xs md:hidden"
          disabled={!canControlSpeed}
          title={canControlSpeed ? `Velocidade atual ${speed}× — tocar alterna para ${nextSpeed}×` : 'Velocidade fixa em partidas entre jogadores'}
          aria-label={`Velocidade ${speed}×`}
          onClick={() => runtime.setSpeed(nextSpeed)}
        >
          {speed}×
        </button>
        <button
          className={`btn min-h-8 px-2 py-1 text-xs whitespace-nowrap ${panelOpen ? 'btn-primary' : ''}`}
          onClick={() => togglePanel(!panelOpen)}
          title="Painel nacional: economia, orçamento, pesquisa e diplomacia (G)"
          aria-label="Nação"
        >
          🏛<span className="hidden sm:inline">Nação</span>
        </button>
        <button className="btn min-h-8 px-2 py-1 text-xs whitespace-nowrap" onClick={onMenu} title="Menu (F10)" aria-label="Menu">
          ☰<span className="hidden sm:inline">Menu</span>
        </button>
      </div>
    </div>
  );
}

/** Ícone desenhado em SVG: glifos ⏸/▶ variam (ou faltam) entre fontes de sistemas móveis. */
function PlayPauseIcon({ playing }: { playing: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="currentColor">
      {playing ? (
        <>
          <rect x="2" y="1.5" width="3" height="9" rx="0.5" />
          <rect x="7" y="1.5" width="3" height="9" rx="0.5" />
        </>
      ) : (
        <path d="M3 1.5v9l7.5-4.5z" />
      )}
    </svg>
  );
}
