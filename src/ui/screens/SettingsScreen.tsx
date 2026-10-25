import { useAppStore } from '../../state/useAppStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { Shell } from '../components/Shell.tsx';

export function SettingsScreen() {
  const s = useSettingsStore();
  const setScreen = useAppStore((x) => x.setScreen);
  return (
    <Shell title="Configurações" back={() => setScreen('menu')}>
      <div className="space-y-4 text-sm">
        <fieldset>
          <legend className="label">Qualidade gráfica</legend>
          <div className="flex gap-2">
            {(['high', 'low'] as const).map((q) => (
              <button key={q} className={`btn ${s.quality === q ? 'btn-primary' : ''}`} onClick={() => s.update({ quality: q })}>
                {q === 'high' ? 'Alta' : 'Desempenho'}
              </button>
            ))}
          </div>
        </fieldset>
        <Toggle label="Sombras" checked={s.shadows} onChange={(v) => s.update({ shadows: v })} />
        <Toggle label="Mover câmera pelas bordas da tela" checked={s.edgeScroll} onChange={(v) => s.update({ edgeScroll: v })} />
        <Toggle label="Mostrar FPS" checked={s.showFps} onChange={(v) => s.update({ showFps: v })} />
        <div>
          <label className="label" htmlFor="pan">
            Velocidade da câmera: {s.panSpeed.toFixed(2)}×
          </label>
          <input id="pan" type="range" min={0.25} max={3} step={0.25} value={s.panSpeed} onChange={(e) => s.update({ panSpeed: Number(e.target.value) })} className="w-full" />
        </div>
        <div>
          <span className="label">Áudio</span>
          <p className="text-ink-400">Ainda não há sons nesta versão; alertas importantes aparecem sempre no painel de eventos.</p>
        </div>
        <p className="text-xs text-ink-400">Mudanças gráficas valem a partir da próxima partida.</p>
        <button className="btn" onClick={s.reset}>
          Restaurar padrões
        </button>
      </div>
    </Shell>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>{label}</span>
      <input type="checkbox" className="h-4 w-4 accent-[#e0b44c]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
