import { useAppStore } from '../../state/useAppStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { Shell } from '../components/Shell.tsx';
import { GRAPHICS_PRESETS, PRESET_LABELS, PROFILES, currentDeviceHints, detectPreset } from '../../lib/graphics.ts';

const PRESET_DESC = {
  low: 'Resolução nativa, sem sombras nem antisserrilhado, menos vegetação e efeitos; globo sem nuvens a 30 qps. Indicado para celulares.',
  balanced: 'Sombras leves, antisserrilhado e vegetação completa com resolução moderada.',
  high: 'Resolução até 2×, sombras detalhadas e mais efeitos simultâneos. Para computadores com GPU dedicada.',
} as const;

export function SettingsScreen() {
  const s = useSettingsStore();
  const setScreen = useAppStore((x) => x.setScreen);
  return (
    <Shell title="Configurações" back={() => setScreen('menu')}>
      <div className="space-y-4 text-sm">
        <fieldset>
          <legend className="label">Qualidade gráfica</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {GRAPHICS_PRESETS.map((q) => (
              <button key={q} role="radio" aria-checked={s.quality === q} className={`btn px-2 ${s.quality === q ? 'btn-primary' : ''}`} onClick={() => s.update({ quality: q })}>
                {PRESET_LABELS[q]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">{PRESET_DESC[s.quality]}</p>
          <p className="mt-1 text-[11px] text-ink-400">
            Sugerido para este aparelho: {PRESET_LABELS[detectPreset(currentDeviceHints())]}. Os presets mudam só o custo gráfico — nunca as regras ou os
            resultados da simulação.
          </p>
        </fieldset>
        <Toggle
          label={PROFILES[s.quality].shadows ? 'Sombras' : 'Sombras (indisponíveis no preset Mobile/Baixo)'}
          checked={s.shadows && PROFILES[s.quality].shadows}
          disabled={!PROFILES[s.quality].shadows}
          onChange={(v) => s.update({ shadows: v })}
        />
        <Toggle label="Reduzir animações (globo do menu e transições)" checked={s.reducedMotion} onChange={(v) => s.update({ reducedMotion: v })} />
        <Toggle label="Mover câmera pelas bordas da tela" checked={s.edgeScroll} onChange={(v) => s.update({ edgeScroll: v })} />
        <Toggle label="Mostrar FPS" checked={s.showFps} onChange={(v) => s.update({ showFps: v })} />
        <div>
          <label className="label" htmlFor="pan">
            Velocidade da câmera: {s.panSpeed.toFixed(2)}×
          </label>
          <input id="pan" type="range" min={0.25} max={3} step={0.25} value={s.panSpeed} onChange={(e) => s.update({ panSpeed: Number(e.target.value) })} className="w-full accent-[#e0b44c]" />
        </div>
        <div>
          <span className="label">Áudio</span>
          <p className="text-ink-400">Ainda não há sons nesta versão; alertas importantes aparecem sempre no painel de eventos.</p>
        </div>
        <p className="text-xs text-ink-400">Mudanças gráficas valem a partir da próxima partida (o globo do menu se atualiza na hora).</p>
        <button className="btn" onClick={s.reset}>
          Restaurar Padrões
        </button>
      </div>
    </Shell>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex min-h-9 items-center justify-between gap-4 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span>{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-[#e0b44c]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
