import { CHANNELS, type Channel } from '../../game/audio/AudioService.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';

const LABEL: Record<Channel | 'master', string> = {
  master: 'Geral',
  music: 'Música',
  ui: 'Interface e alertas',
  ambient: 'Ambiente',
  combat: 'Combate',
  production: 'Produção (edifício selecionado)',
};

/** Volumes por canal (0–100%) e silenciar tudo. Vale na hora, inclusive durante a partida. */
export function AudioSettings({ compact = false }: { compact?: boolean }) {
  const volumes = useSettingsStore((s) => s.volumes);
  const muted = useSettingsStore((s) => s.muted);
  const update = useSettingsStore((s) => s.update);
  return (
    <fieldset className="space-y-1.5">
      <legend className="label">Áudio</legend>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={muted} onChange={(e) => update({ muted: e.target.checked })} className="accent-[#e0b44c]" />
        Silenciar todo o som
      </label>
      <div className={`grid gap-x-4 gap-y-1 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
        {(['master', ...CHANNELS] as const).map((k) => (
          <div key={k} className={muted ? 'opacity-50' : ''}>
            <label className="flex justify-between text-[11px] text-ink-300" htmlFor={`vol-${k}`}>
              <span>{LABEL[k]}</span>
              <span className="font-mono">{Math.round(volumes[k] * 100)}%</span>
            </label>
            <input
              id={`vol-${k}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumes[k]}
              disabled={muted}
              onChange={(e) => update({ volumes: { ...volumes, [k]: Number(e.target.value) } })}
              className="w-full accent-[#e0b44c]"
            />
          </div>
        ))}
      </div>
      {!compact && (
        <p className="text-[11px] text-ink-400">
          Todos os sons são gerados no próprio aparelho (nada é baixado). Combate soa mais alto perto do ponto que a câmera olha; a produção toca só para o edifício selecionado. Alertas importantes
          também aparecem sempre no painel de eventos.
        </p>
      )}
    </fieldset>
  );
}
