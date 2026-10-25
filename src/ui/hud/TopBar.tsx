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

  return (
    <div className="panel absolute top-3 right-3 left-3 flex h-10 items-center gap-4 overflow-hidden px-3 text-sm">
      {RESOURCE_TYPES.map((r) => (
        <div key={r} className="flex items-center gap-1.5" title={`${RESOURCE_LABELS[r]}: estoque e renda por segundo`}>
          <ResourceIcon type={r} />
          <span className="font-mono font-bold">{Math.floor(me?.resources?.[r] ?? 0)}</span>
          <span className="hidden text-[11px] text-signal-green xl:inline">+{(me?.income?.[r] ?? 0).toFixed(1)}</span>
        </div>
      ))}
      <div className="flex items-center gap-2" title="Unidades em campo e em produção / limite">
        <span className="text-ink-400" aria-hidden>
          ▲
        </span>
        <span className="font-mono">
          {me?.supply ?? 0}/{UNIT_CAP}
        </span>
      </div>
      <div className="flex items-center gap-2" title="Tempo de operação">
        <span className="text-ink-400" aria-hidden>
          ⏱
        </span>
        <span className="font-mono">{formatDuration(Math.floor(tick / TICK_RATE))}</span>
      </div>
      {date && (
        <div className="hidden items-center gap-2 lg:flex" title="Data do cenário (1 dia de jogo por segundo a 1×)">
          <span className="text-ink-400" aria-hidden>
            📅
          </span>
          <span className="font-mono">{formatDate(date)}</span>
        </div>
      )}
      {nation && (
        <div className="hidden items-center gap-2 lg:flex" title="Aprovação do governo e logística nacional do teatro">
          <span className="text-ink-400">Aprovação</span>
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
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {connStatus !== 'connected' && <span className="text-xs text-brass-400">⚠ reconectando…</span>}
        {showFps && <span className="font-mono text-xs text-ink-400">{fps} fps</span>}
        {paused && <span className="text-xs font-semibold text-brass-400">⏸ PAUSADO{pausedBy ? ` por ${pausedBy}` : ''}</span>}
        <button className="btn px-2 py-1 text-xs whitespace-nowrap" onClick={() => runtime.togglePause()} title="Pausar/retomar (Espaço)">
          {paused ? '▶ Retomar' : '⏸ Pausar'}
        </button>
        {GAME_SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn px-2 py-1 font-mono text-xs ${speed === s ? 'btn-primary' : ''}`}
            disabled={!canControlSpeed}
            title={canControlSpeed ? `Velocidade ${s}×` : 'Velocidade fixa em partidas entre jogadores'}
            onClick={() => runtime.setSpeed(s)}
          >
            {s}×
          </button>
        ))}
        <button className={`btn px-2 py-1 text-xs whitespace-nowrap ${panelOpen ? 'btn-primary' : ''}`} onClick={() => togglePanel(!panelOpen)} title="Painel nacional: economia, orçamento e pesquisa (G)">
          🏛 Nação
        </button>
        <button className="btn px-2 py-1 text-xs whitespace-nowrap" onClick={onMenu} title="Menu (F10)">
          ☰ Menu
        </button>
      </div>
    </div>
  );
}
