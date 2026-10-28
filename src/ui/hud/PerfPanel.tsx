import { useRef, useState } from 'react';
import { useHudStore, type PerfHud } from '../../state/useHudStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import type { DecisionKind, Evidence } from '../../game/perf/kgps.ts';
import { DEVICE_CLASS_TEXT } from '../../game/perf/device.ts';
import { PRESET_LABELS, type GraphicsPreset } from '../../lib/graphics.ts';

/**
 * Contador de quadros da barra superior. Com o KGPS, ele também é a porta do painel de
 * desempenho: o ponto colorido diz se a qualidade adaptativa está agindo, observando ou parada.
 */
export function PerfChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const fps = useHudStore((s) => s.fps);
  const perf = useHudStore((s) => s.perf);
  const adapted = perf ? isAdapted(perf) : false;
  const dot = !perf
    ? 'bg-ink-600'
    : perf.mode === 'blocked'
      ? 'bg-red-400'
      : perf.mode === 'observe'
        ? 'bg-ink-400'
        : perf.state === 'emergency'
          ? 'animate-pulse bg-red-300'
          : adapted
            ? 'bg-brass-400'
            : 'bg-signal-green';
  return (
    <button
      className={`hidden min-h-8 items-center gap-1.5 rounded px-1.5 font-mono text-xs text-ink-400 hover:text-ink-100 sm:inline-flex ${open ? 'bg-ink-800 text-ink-100' : ''}`}
      onClick={onToggle}
      title="Desempenho: quadros por segundo e qualidade adaptativa (KGPS)"
      aria-expanded={open}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {fps} qps{perf?.window ? <span className="hidden lg:inline"> · p95 {fmt(perf.window.p95)} ms</span> : null}
      {adapted ? <span className="hidden text-brass-400 md:inline"> · adaptado</span> : null}
    </button>
  );
}

const MODE_TEXT: Record<PerfHud['mode'], string> = { adaptive: 'Adaptativo', observe: 'Só observando', blocked: 'Bloqueado' };
const STATE_TEXT: Record<PerfHud['state'], string> = {
  warmup: 'aquecendo',
  observing: 'medindo',
  evaluating: 'avaliando um ajuste',
  emergency: 'descida rápida',
  stabilizing: 'estabilizando',
  externalCap: 'limite externo de 30 qps',
  frozen: 'em pausa',
};
const EVIDENCE_TEXT: Record<Evidence, string> = { medido: 'medido', estimado: 'estimado', hipotese: 'hipótese' };
const TARGET_ORIGIN_TEXT: Record<PerfHud['target']['origin'], string> = { classe: 'padrão do aparelho', jogador: 'escolha do jogador', tela: 'limite da tela' };
const BOTTLENECK_TEXT = { gpu: 'GPU (placa de vídeo)', cpu: 'CPU (processador)', unknown: 'indefinido' } as const;
const KIND_TONE: Partial<Record<DecisionKind, string>> = {
  degrade: 'text-brass-400',
  upgrade: 'text-signal-blue',
  keep: 'text-signal-green',
  revert: 'text-red-300',
  incident: 'text-red-300',
  suggest: 'text-ink-200',
};

const fmt = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

/** Algum botão abaixo do nível do preset (rótulo honesto "· adaptado"). */
const isAdapted = (perf: PerfHud) => perf.knobs.some((k) => k.level >= 0 && k.level < k.baseline);

const presetLabel = (preset: string) => PRESET_LABELS[preset as GraphicsPreset] ?? 'Personalizado';

/** Painel do KGPS/KAICS: medidas, ajustes em vigor, decisões recentes e o aparelho detectado. */
export function PerfPopover({ onClose }: { onClose: () => void }) {
  const perf = useHudStore((s) => s.perf);
  const adaptive = useSettingsStore((s) => s.adaptiveQuality);
  const update = useSettingsStore((s) => s.update);
  const w = perf?.window;
  const adapted = perf ? isAdapted(perf) : false;
  return (
    <div className="panel scroll-thin max-h-[calc(100dvh-4.5rem)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto bg-ink-900 p-3 text-xs text-ink-200" role="dialog" aria-label="Desempenho">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink-100">Desempenho · KGPS</div>
          {perf && (
            <div className={adapted ? 'text-brass-400' : 'text-ink-200'}>
              {presetLabel(perf.preset)}
              {adapted ? ' · adaptado' : ''}
            </div>
          )}
          <div className={perf?.state === 'emergency' ? 'text-red-300' : 'text-ink-400'}>
            {perf ? `${MODE_TEXT[perf.mode]} · ${STATE_TEXT[perf.state]}` : 'aguardando a primeira medição'}
            {perf?.frozenReason ? ` — ${perf.frozenReason}` : ''}
          </div>
        </div>
        <button className="btn min-h-8 px-2" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      <label className="mt-2 flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded bg-ink-800/60 px-2">
        <span>
          Qualidade adaptativa
          <span className="block text-[11px] text-ink-400">Alivia efeitos e resolução quando o jogo pesa e devolve quando sobra folga.</span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-[#e0b44c]" checked={adaptive} onChange={(e) => update({ adaptiveQuality: e.target.checked })} />
      </label>
      {perf?.reasons.length ? <p className="mt-1 text-[11px] text-ink-400">{perf.reasons.join(' · ')}</p> : null}
      {perf?.device.value === 'software' && (
        <p className="mt-1 text-[11px] text-brass-400">Renderização por software: aceleração gráfica desativada ou indisponível no navegador (meta de 30 qps).</p>
      )}

      {w && perf && (
        <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
          <Stat label="Quadros/s" value={fmt(w.fps, 0)} />
          <Stat label="Mediana" value={`${fmt(w.p50)} ms`} warn={w.p50 > perf.budgetMs * 1.08} />
          <Stat label="p95" value={`${fmt(w.p95)} ms`} warn={w.p95 > perf.budgetMs * 1.2} />
          <Stat label="p99" value={`${fmt(w.p99)} ms`} />
          <Stat label="CPU (mediana)" value={`${fmt(w.cpuP50)} ms`} />
          <Stat label="Travadas" value={w.stalls ? `${w.hitches} + ${w.stalls} longas` : String(w.hitches)} warn={w.hitches + w.stalls > 0} />
          <Stat label="Desenhos/quadro" value={String(perf.drawCalls)} />
          <Stat label="Triângulos" value={perf.triangles >= 1e6 ? `${fmt(perf.triangles / 1e6)} mi` : `${Math.round(perf.triangles / 1000)} mil`} />
          <Stat label="Custo do KGPS" value={`${fmt(perf.overheadUs, 0)} µs`} />
          <div className="col-span-3 text-[11px] text-ink-400">
            Meta: {perf.target.fps} qps ({fmt(perf.budgetMs)} ms por quadro, {TARGET_ORIGIN_TEXT[perf.target.origin]}) · gargalo provável: {BOTTLENECK_TEXT[perf.bottleneck]}
          </div>
        </dl>
      )}

      {perf && (
        <div className="mt-2 rounded bg-ink-800/60 px-2 py-1.5 text-[11px]">
          <div>
            <span className="text-ink-100">Qualidade adaptada: {Math.round(perf.fidelity * 100)}%</span>
            <span className="text-ink-400"> (estimativa relativa aos ajustes disponíveis; não é medida de imagem)</span>
          </div>
          {perf.emergencyKnobs.length > 0 && <div className="text-red-300">Níveis de emergência em vigor: {perf.emergencyKnobs.join(', ')}</div>}
        </div>
      )}

      {perf && perf.knobs.length > 0 && (
        <div className="mt-3">
          <div className="font-semibold text-ink-100">Ajustes</div>
          <ul className="mt-1 space-y-0.5">
            {perf.knobs.map((k) => {
              const reduced = k.level >= 0 && k.level < k.baseline;
              const emergency = k.level >= 0 && k.level < k.floor;
              return (
                <li key={k.id} className="flex items-center justify-between gap-2">
                  <span>{k.label}</span>
                  <span className={`text-right ${k.status !== 'ok' || emergency ? 'text-red-300' : reduced ? 'text-brass-400' : 'text-ink-400'}`}>
                    {k.status === 'quarantined' ? 'fora do controle (quarentena)' : k.status === 'faulted' ? 'com defeito' : (k.levels[k.level] ?? '?')}
                    {emergency ? ' · emergência' : ''}
                    {reduced ? <span className="text-ink-400"> (de {k.levels[k.baseline]})</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {perf && perf.log.length > 0 && (
        <div className="mt-3">
          <div className="font-semibold text-ink-100">Decisões recentes</div>
          <ul className="mt-1 space-y-1">
            {[...perf.log].reverse().map((d, i) => (
              <li key={`${d.at}-${i}`} className={KIND_TONE[d.kind] ?? 'text-ink-200'}>
                <span className="font-mono text-ink-400">{formatClock(d.at)} </span>
                {d.text}
                <span className="ml-1 rounded bg-ink-800 px-1 text-[10px] text-ink-400">{EVIDENCE_TEXT[d.evidence]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {perf && (
        <div className="mt-3 border-t border-ink-700 pt-2 text-[11px] text-ink-400">
          <div className="font-semibold text-ink-200">Aparelho (KAICS)</div>
          <div>
            Classe: {DEVICE_CLASS_TEXT[perf.device.value]} ({perf.device.kind === 'observada' ? 'observada' : 'inferida'}: {perf.device.source}) · tela:{' '}
            {perf.refreshHz ? `~${perf.refreshHz} Hz (estimada pelos quadros)` : 'taxa indeterminada'}
          </div>
          <div>
            {perf.caps.gpu ?? 'GPU não informada pelo navegador'} · WebGL {perf.caps.webgl2 ? '2' : '1'} · textura máx. {perf.caps.maxTextureSize}px · tela {fmt(perf.caps.devicePixelRatio, 2)}×
            {perf.caps.cores ? ` · ${perf.caps.cores} núcleos` : ''}
            {perf.caps.memoryGb ? ` · ${perf.caps.memoryGb} GB` : ''}
          </div>
          <div>Tempo de GPU: {perf.caps.gpuTimer ? 'disponível (não usado nesta versão)' : 'indisponível — o gargalo é estimado pela fração do quadro gasta na CPU'}</div>
          {perf.incidents.map((m) => (
            <div key={m} className="text-red-300">
              ⚠ {m}
            </div>
          ))}
        </div>
      )}

      {perf && <ReportBox perf={perf} />}
    </div>
  );
}

/**
 * Relatório de desempenho (R-EVD-02): gerado só quando o jogador pede e mostrado antes de copiar.
 * Nada sai do aparelho sozinho — o texto só vai para a área de transferência pelo botão.
 */
function ReportBox({ perf }: { perf: PerfHud }) {
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      // sem permissão de área de transferência (ou página sem HTTPS): o texto fica selecionado
      area.current?.select();
      setCopied('fail');
    }
  };
  return (
    <div className="mt-3 border-t border-ink-700 pt-2">
      {text === null ? (
        <button
          className="btn min-h-8 w-full px-2"
          onClick={() => {
            setText(perf.exportReport());
            setCopied(null);
          }}
        >
          Copiar relatório
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[11px] text-ink-400">
            Confira antes de copiar: aparelho, placa de vídeo, medições e decisões. Sem nome, sala, posição ou chat. Cole na conversa para ajustar o jogo ao seu aparelho.
          </div>
          <textarea
            ref={area}
            readOnly
            className="scroll-thin h-28 w-full resize-none rounded bg-ink-950 p-1.5 font-mono text-[10px] text-ink-200"
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Relatório de desempenho"
          />
          <div className="flex gap-2">
            <button className="btn min-h-8 flex-1 px-2" onClick={() => void copy()}>
              {copied === 'ok' ? 'Copiado ✓' : 'Copiar'}
            </button>
            <button className="btn min-h-8 px-2" onClick={() => setText(perf.exportReport())} title="Gerar de novo com as medições mais recentes">
              Atualizar
            </button>
            <button className="btn min-h-8 px-2" onClick={() => setText(null)}>
              Fechar
            </button>
          </div>
          {copied === 'fail' && <div className="text-[11px] text-brass-400">O navegador não liberou a área de transferência: o texto está selecionado, copie manualmente.</div>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] text-ink-400 uppercase">{label}</dt>
      <dd className={`font-mono ${warn ? 'text-brass-400' : 'text-ink-100'}`}>{value}</dd>
    </div>
  );
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
