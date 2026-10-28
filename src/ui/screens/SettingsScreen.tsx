import { useEffect, useState } from 'react';
import { useAppStore } from '../../state/useAppStore.ts';
import { fullscreenMode } from '../../lib/fullscreen.ts';
import { useSettingsStore, type FpsTarget } from '../../state/useSettingsStore.ts';
import { currentDeviceClass, CLASS_TARGET, DEVICE_CLASS_TEXT } from '../../game/perf/device.ts';
import { lastMeasurement, localAdvisorStore, measurementText } from '../../game/perf/advisor.ts';
import { Shell } from '../components/Shell.tsx';
import { AudioSettings } from '../components/AudioSettings.tsx';
import { GRAPHICS_PRESETS, GRAPHICS_REVISION, HEAVY_PRESETS, PRESET_LABELS, PROFILES, currentDeviceHints, detectPreset, type GraphicsPreset } from '../../lib/graphics.ts';

const PRESET_DESC = {
  low: 'Resolução nativa, sem sombras nem antisserrilhado, menos vegetação e efeitos; globo sem nuvens (girando a 60 qps, suave). Indicado para celulares.',
  balanced: 'Sombras leves, antisserrilhado e vegetação completa com resolução moderada.',
  high: 'Resolução até 2×, sombras detalhadas e mais efeitos simultâneos. Para computadores com GPU dedicada.',
  ultra:
    'Tudo do Alto, mais modelos arredondados e detalhados, água com ondas e espuma, fumaça volumétrica, feixes de luz do sol e luz que se adapta às áreas em sombra. Para GPUs dedicadas recentes.',
  ultraplus:
    'Cinematográfico: tudo do Ultra levado ao máximo — modelos ≈80% realistas e 20% low-poly, sombras dinâmicas de alta resolução com penumbra suave, sombras de nuvens cruzando o mapa, fumaça densa que se espalha com o vento, brilho em fogo e reflexos, feixes de sol mais finos e reflexos de ambiente nítidos. Muito pesado.',
} as const;

export function SettingsScreen() {
  const setScreen = useAppStore((x) => x.setScreen);
  return (
    <Shell title="Configurações" back={() => setScreen('menu')}>
      <SettingsForm />
    </Shell>
  );
}

/**
 * Conteúdo das configurações: a tela do menu principal e o painel Opções do menu da partida usam
 * o mesmo formulário. Na partida, avisa o que só vale na próxima (preset e sombras recriam a cena).
 */
export function SettingsForm({ inGame = false }: { inGame?: boolean }) {
  const s = useSettingsStore();
  // presets pesados só entram depois do aviso de desempenho (no celular, também o Ultra)
  const [pending, setPending] = useState<GraphicsPreset | null>(null);
  const [deviceClass] = useState(currentDeviceClass);
  const warns = (q: GraphicsPreset) => HEAVY_PRESETS.includes(q) || (deviceClass === 'mobile' && q === 'ultra');
  const choose = (q: GraphicsPreset) => {
    if (warns(q) && s.quality !== q) setPending(q);
    else s.update({ quality: q });
  };
  return (
    <>
      <div className="space-y-4 text-sm">
        <fieldset>
          <legend className="label">Qualidade gráfica</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup">
            {GRAPHICS_PRESETS.map((q) => (
              <button key={q} role="radio" aria-checked={s.quality === q} className={`btn px-2 ${s.quality === q ? 'btn-primary' : ''}`} onClick={() => choose(q)}>
                {PRESET_LABELS[q]}
                {warns(q) && <span className="ml-1 text-[10px] text-red-300">⚠</span>}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">{PRESET_DESC[s.quality]}</p>
          <p className="mt-1 text-[11px] text-ink-400">
            Sugerido para este aparelho: {PRESET_LABELS[detectPreset(currentDeviceHints())]}. Os presets mudam só o custo gráfico — nunca as regras ou os resultados da simulação.
          </p>
        </fieldset>
        <Toggle
          label={PROFILES[s.quality].shadows ? 'Sombras' : 'Sombras (indisponíveis no preset Mobile/Baixo)'}
          checked={s.shadows && PROFILES[s.quality].shadows}
          disabled={!PROFILES[s.quality].shadows}
          onChange={(v) => s.update({ shadows: v })}
        />
        {fullscreenMode() !== 'none' && (
          <fieldset className="space-y-1">
            <legend className="label">Tela cheia</legend>
            {fullscreenMode() === 'api' ? (
              <>
                <Toggle label="Entrar em tela cheia ao iniciar uma partida (celular e tablet)" checked={s.autoFullscreen} onChange={(v) => s.update({ autoFullscreen: v })} />
                <Toggle label="Travar na horizontal em tela cheia (onde o aparelho permite)" checked={s.lockLandscape} onChange={(v) => s.update({ lockLandscape: v })} />
                <p className="text-[11px] text-ink-400">Use o botão de tela cheia no canto da tela ou na barra da partida; para sair, toque nele de novo ou use o gesto de voltar.</p>
              </>
            ) : (
              <p className="text-xs text-ink-400">
                No iPhone, páginas não podem ocupar a tela toda: toque em Compartilhar → <b>Adicionar à Tela de Início</b> e abra o jogo pelo ícone, que ele abre em tela cheia.
              </p>
            )}
          </fieldset>
        )}
        <Toggle label="Reduzir animações (globo do menu e transições)" checked={s.reducedMotion} onChange={(v) => s.update({ reducedMotion: v })} />
        <Toggle label="Mover câmera pelas bordas da tela" checked={s.edgeScroll} onChange={(v) => s.update({ edgeScroll: v })} />
        <div>
          <Toggle label="Qualidade adaptativa (KGPS)" checked={s.adaptiveQuality} onChange={(v) => s.update({ adaptiveQuality: v })} />
          <p className="text-[11px] text-ink-400">
            Durante a partida, mede o tempo de cada quadro e, se o jogo ficar lento, alivia primeiro o que menos aparece (reflexos, efeitos de tela, sombras, resolução) — um ajuste por vez, desfazendo
            o que não ajudar. Com folga, devolve a qualidade do preset. Nunca passa do preset escolhido nem mexe em regras, névoa de guerra ou interface. Vale na hora.
          </p>
        </div>
        <fieldset>
          <legend className="label">Meta de quadros por segundo</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(['auto', 30, 60] as FpsTarget[]).map((t) => (
              <button key={String(t)} role="radio" aria-checked={s.fpsTarget === t} className={`btn px-2 ${s.fpsTarget === t ? 'btn-primary' : ''}`} onClick={() => s.update({ fpsTarget: t })}>
                {t === 'auto' ? 'Automática' : `${t} qps`}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-400">
            Automática: {CLASS_TARGET[deviceClass]} qps neste aparelho ({DEVICE_CLASS_TEXT[deviceClass]}) — 30 no celular, 60 no PC. Com 60 no celular, o jogo fica mais fluido mas a qualidade
            adaptativa reduz mais o visual e a bateria dura menos. Nunca passa da taxa da tela. Vale na hora.
          </p>
        </fieldset>
        <Toggle label="Mostrar FPS (toque no contador para ver o painel de desempenho)" checked={s.showFps} onChange={(v) => s.update({ showFps: v })} />
        <div>
          <label className="label" htmlFor="pan">
            Velocidade da câmera: {s.panSpeed.toFixed(2)}×
          </label>
          <input id="pan" type="range" min={0.25} max={3} step={0.25} value={s.panSpeed} onChange={(e) => s.update({ panSpeed: Number(e.target.value) })} className="w-full accent-[#e0b44c]" />
        </div>
        <AudioSettings />
        <p className="text-xs text-ink-400">
          {inGame
            ? 'Qualidade gráfica e sombras valem a partir da próxima partida; câmera, FPS, qualidade adaptativa, animações e áudio mudam na hora.'
            : 'Mudanças gráficas valem a partir da próxima partida (o globo do menu se atualiza na hora).'}
        </p>
        <button className="btn" onClick={s.reset}>
          Restaurar Padrões
        </button>
      </div>
      {pending && (
        <PerformanceWarning
          preset={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            // liga o contador de FPS para o jogador acompanhar o custo
            s.update({ quality: pending, showFps: true });
            setPending(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Aviso antes de ativar o Ultra+ (e, no celular, o Ultra): o que muda, o custo esperado, a última
 * medição real deste preset neste aparelho (R-ADV-02) e, em celulares, um alerta reforçado
 * (aquecimento, bateria, travamentos e o navegador recarregando a página).
 */
function PerformanceWarning({ preset, onCancel, onConfirm }: { preset: GraphicsPreset; onCancel: () => void; onConfirm: () => void }) {
  const [mobile] = useState(() => currentDeviceClass() === 'mobile');
  const suggested = detectPreset(currentDeviceHints());
  const [measured] = useState(() => {
    const rec = lastMeasurement(localAdvisorStore().history(), preset, GRAPHICS_REVISION);
    return rec ? measurementText(preset, rec, Date.now()) : null;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-3 sm:items-center" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="panel scroll-thin max-h-[92%] w-full max-w-lg overflow-y-auto p-4 text-sm" role="alertdialog" aria-modal="true" aria-labelledby="perf-title" aria-describedby="perf-body">
        <div id="perf-title" className="text-base font-semibold text-brass-400">
          ⚠ Aviso de desempenho — {PRESET_LABELS[preset]}
        </div>
        <div id="perf-body" className="mt-2 space-y-2 text-ink-200">
          {preset === 'ultraplus' ? (
            <>
              <p>
                O {PRESET_LABELS[preset]} leva o visual para cerca de <b>80% realista e 20% low-poly</b>. Ele é bem mais pesado que o Ultra:
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-300">
                <li>modelos com arestas suaves e até 3× mais polígonos;</li>
                <li>sombras dinâmicas em resolução de até 8192 px, com penumbra suave, e sombras de nuvens em movimento;</li>
                <li>fumaça densa e duradoura (o dobro de partículas), poeira nas explosões e mais efeitos simultâneos;</li>
                <li>brilho (bloom), feixes de sol com mais amostras, oclusão de ambiente mais fina e resolução até 2,5×.</li>
              </ul>
              <p className="text-xs">
                Espere menos quadros por segundo que no Ultra (muitas vezes metade) e mais uso de memória de vídeo. Indicado só para computadores com placa de vídeo dedicada recente e potente. O
                contador de FPS será ligado para você acompanhar; se o jogo ficar lento, volte para Ultra ou Alto.
              </p>
            </>
          ) : (
            <p className="text-xs">
              O {PRESET_LABELS[preset]} soma ao Alto modelos arredondados, água com ondas e espuma, fumaça volumétrica, feixes de luz do sol e exposição local. Foi pensado para placas de vídeo
              dedicadas; em celulares costuma ficar bem abaixo de 30 qps. O contador de FPS será ligado para você acompanhar.
            </p>
          )}
          {measured && <p className="rounded border border-brass-400/50 bg-ink-800/70 p-2 text-xs text-ink-100">{measured}</p>}
          {mobile && (
            <p className="rounded border border-red-400/60 bg-red-950/40 p-2 text-xs text-red-200">
              <b>Você está em um celular ou tablet.</b> Neste aparelho o {PRESET_LABELS[preset]} tende a travar, aquecer e gastar a bateria rapidamente; o navegador pode até recarregar a página por
              falta de memória. Recomendado aqui: <b>{PRESET_LABELS[suggested]}</b>.
            </p>
          )}
          <p className="text-[11px] text-ink-400">Só muda o visual: regras e resultados da partida são os mesmos em qualquer preset. Vale a partir da próxima partida.</p>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn btn-primary min-h-11" onClick={onCancel} autoFocus>
            Manter preset atual
          </button>
          <button className="btn min-h-11 border-red-400/60 text-red-200" onClick={onConfirm}>
            Ativar {PRESET_LABELS[preset]} mesmo assim
          </button>
        </div>
      </div>
    </div>
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
