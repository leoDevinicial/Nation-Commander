import { GAME_SPEEDS } from '../../../shared/protocol.ts';
import { TICK_RATE, UNIT_CAP } from '../../../shared/sim/config.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { formatDuration } from '../../lib/format.ts';

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

  return (
    <div className="panel absolute top-3 right-3 left-3 flex h-10 items-center gap-5 px-3 text-sm">
      <div className="flex items-center gap-2" title="Suprimentos disponíveis e renda por segundo">
        <span className="text-brass-400" aria-hidden>
          ◆
        </span>
        <span className="font-mono font-bold">{me?.resources ?? 0}</span>
        <span className="text-xs text-signal-green">+{me?.income ?? 0}/s</span>
      </div>
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
      <div className="hidden items-center gap-3 md:flex">
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
      <div className="ml-auto flex items-center gap-2">
        {connStatus !== 'connected' && <span className="text-xs text-brass-400">⚠ reconectando…</span>}
        {showFps && <span className="font-mono text-xs text-ink-400">{fps} fps</span>}
        {paused && <span className="text-xs font-semibold text-brass-400">⏸ PAUSADO{pausedBy ? ` por ${pausedBy}` : ''}</span>}
        <button className="btn px-2 py-1 text-xs" onClick={() => runtime.togglePause()} title="Pausar/retomar (Espaço)">
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
        <button className="btn px-2 py-1 text-xs" onClick={onMenu} title="Menu (F10)">
          ☰ Menu
        </button>
      </div>
    </div>
  );
}
