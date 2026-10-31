import { GAME_SPEEDS } from '../../../shared/protocol.ts';
import { DIFFICULTY, prepTicks } from '../../../shared/sim/difficulty.ts';
import { ERAS, type Era } from '../../../shared/sim/eras.ts';
import { GOODS, VICTORY, POP_ABSOLUTE_CAP, RESOURCE_LABELS, RESOURCE_TYPES, STORAGE_LABEL, TICK_RATE } from '../../../shared/sim/config.ts';
import { ResourceIcon } from '../components/Resources.tsx';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { formatDate, formatDuration, formatPct } from '../../lib/format.ts';
import { FullscreenButton } from '../components/FullscreenButton.tsx';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { useState } from 'react';
import { MoneyChip, MoneyPopover, ProductionChip, ProductionPopover, type TopBarPopover } from './TopBarExtras.tsx';
import { PerfChip, PerfPopover } from './PerfPanel.tsx';
import { SandboxChip, SandboxPanel } from './SandboxPanel.tsx';

export function TopBar({ runtime, onMenu, canControlSpeed }: { runtime: GameRuntime; onMenu: () => void; canControlSpeed: boolean }) {
  const players = useHudStore((s) => s.players);
  const mySlot = useHudStore((s) => s.mySlot);
  const tick = useHudStore((s) => s.tick);
  const victory = useHudStore((s) => s.victory);
  const paused = useHudStore((s) => s.paused);
  const pausedBy = useHudStore((s) => s.pausedBy);
  const speed = useHudStore((s) => s.speed);
  const sky = useHudStore((s) => s.sky);
  const showFps = useSettingsStore((s) => s.showFps);
  const closeUp = useHudStore((s) => s.closeUp);
  const roster = useAppStore((s) => s.match?.players ?? []);
  const sandbox = useAppStore((s) => s.match?.mode === 'sandbox');
  const difficulty = useAppStore((s) => s.match?.difficulty ?? 'normal');
  const prep = prepTicks(difficulty);
  const connStatus = useAppStore((s) => s.connStatus);
  const connDetail = useAppStore((s) => s.connDetail);
  const me = players.find((p) => p.slot === mySlot);
  const date = useNationalStore((s) => s.date);
  const nation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const panelOpen = useNationalStore((s) => s.panelOpen);
  const togglePanel = useNationalStore((s) => s.setPanelOpen);
  const globeOpen = useNationalStore((s) => s.globeOpen);
  const openGlobe = useNationalStore((s) => s.openGlobe);
  const closeGlobe = useNationalStore((s) => s.closeGlobe);
  const nextSpeed = GAME_SPEEDS[(GAME_SPEEDS.indexOf(speed) + 1) % GAME_SPEEDS.length]!;
  const [pop, setPop] = useState<TopBarPopover>(null);
  const toggle = (p: Exclude<TopBarPopover, null>) => setPop((cur) => (cur === p ? null : p));

  return (
    <div className="panel absolute top-2 right-2 left-2 z-40 flex h-11 items-center gap-2 px-2 text-xs sm:top-3 sm:right-3 sm:left-3 sm:h-10 sm:gap-4 sm:px-3 sm:text-sm">
      {/* indicadores: rolam na horizontal em telas estreitas em vez de cortar */}
      {/* prioridade por largura: os valores (recursos, população, era, tempo, aprovação) cabem sempre; capacidade, saldo,
          data, nomes e o texto dos botões aparecem conforme sobra espaço (o detalhe completo fica na dica de cada item) */}
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto xl:gap-2.5 2xl:gap-4">
        {/* dinheiro e produção primeiro: ficam visíveis mesmo na tela estreita do celular */}
        {sandbox && <SandboxChip open={pop === 'sandbox'} onToggle={() => toggle('sandbox')} />}
        {/* Sandbox: sem economia na tela (recursos ilimitados) */}
        {!sandbox && <MoneyChip open={pop === 'money'} onToggle={() => toggle('money')} />}
        <ProductionChip open={pop === 'production'} onToggle={() => toggle('production')} />
        {!sandbox &&
          RESOURCE_TYPES.map((r) => {
            const have = Math.floor(me?.resources?.[r] ?? 0);
            const cap = me?.capacity?.[r] ?? 0;
            const net = me?.income?.[r] ?? 0;
            const full = cap > 0 && have >= cap;
            return (
              <div
                key={r}
                className="flex shrink-0 items-center gap-1"
                title={`${RESOURCE_LABELS[r]}: ${have} de ${cap} (guardado em: ${STORAGE_LABEL[r]}). Saldo: ${net >= 0 ? '+' : ''}${net.toFixed(2)}/s${full ? ' — CHEIO: a produção pausa' : ''}`}
              >
                <ResourceIcon type={r} />
                <span className={`font-mono font-bold ${full ? 'text-brass-400' : r === 'food' && me?.hungry ? 'text-red-300' : ''}`}>{have}</span>
                <span className="hidden font-mono text-[10px] text-ink-400 2xl:inline">/{cap}</span>
                <span className={`hidden text-[11px] min-[1800px]:inline ${net < 0 ? 'text-red-300' : 'text-signal-green'}`}>
                  {net >= 0 ? '+' : ''}
                  {net.toFixed(1)}
                </span>
              </div>
            );
          })}
        {!sandbox && me?.power && <PowerChip power={me.power} />}
        {!sandbox && me?.goods && (me.goods.fuel > 0 || me.goods.steel > 0 || me.goods.cap > GOODS.baseCap) && (
          <div
            className="flex shrink-0 items-center gap-1.5"
            title={`Bens industriais (cadeias produtivas), até ${me.goods.cap} de cada: ${GOODS.label.fuel} ${me.goods.fuel} (Refinaria, substitui petróleo) · ${GOODS.label.steel} ${me.goods.steel} (Siderúrgica, substitui ferro). Cada unidade poupa ${GOODS.saves} do recurso bruto na produção de veículos e aeronaves e nas missões aéreas.`}
          >
            <span aria-hidden>⛽</span>
            <span className="font-mono">{me.goods.fuel}</span>
            <span aria-hidden>🔩</span>
            <span className="font-mono">{me.goods.steel}</span>
          </div>
        )}
        {!sandbox && me?.population && (
          <div
            className="flex shrink-0 items-center gap-1.5"
            title={`População ${me.population.total}/${me.population.cap} (teto nacional ${POP_ABSOLUTE_CAP}). Cidadãos: ${me.population.citizens} (${me.population.employed} empregados, ${me.population.idle} ociosos) · Recrutas na reserva: ${me.population.recruits} (+${me.population.queuedRecruits} em alistamento no quartel) · Militares: ${me.population.military} em campo, ${me.population.queuedMilitary} em formação · Cidadãos em formação: ${me.population.queuedCitizens}`}
          >
            <span className="text-ink-400" aria-hidden>
              👥
            </span>
            <span className={`font-mono ${me.population.total >= me.population.cap ? 'text-brass-400' : ''}`}>
              {me.population.total}/{me.population.cap}
            </span>
            <span className="hidden text-[11px] text-ink-400 min-[2000px]:inline">
              · {me.population.idle} ociosos · 🎖{me.population.recruits} recrutas · ⚔{me.population.military}
            </span>
          </div>
        )}
        {me?.eras && (
          <div
            className="flex shrink-0 items-center gap-1.5"
            title={`Era atual: ${ERAS[(me.era ?? 1) as Era].label} — ${ERAS[(me.era ?? 1) as Era].look}.${me.eraAdvance ? ` Avançando para ${ERAS[me.eraAdvance.to as Era].label}: ${Math.round(me.eraAdvance.progress * 100)}%.` : ' Avance de era no Centro de Comando.'}`}
          >
            <span aria-hidden>🏛</span>
            <span className="hidden xl:inline">{ERAS[(me.era ?? 1) as Era].label}</span>
            <span className="xl:hidden font-mono">E{me.era ?? 1}</span>
            {me.eraAdvance && <span className="font-mono text-brass-400">→ {Math.round(me.eraAdvance.progress * 100)}%</span>}
          </div>
        )}
        {victory.map((v) => {
          const mine = v.slot === mySlot;
          const pct = Math.round(v.progress * 100);
          const text =
            v.kind === 'territory'
              ? `${mine ? 'Nosso' : 'Inimigo:'} domínio territorial — ${pct}% dos ${VICTORY.territorySeconds / 60} min para a vitória (controle ≥ ${Math.round(VICTORY.territoryShare * 100)}% do território reivindicado)`
              : `${mine ? 'Nossa' : 'Inimigo:'} crise política — ${pct}% dos ${VICTORY.politicalDays} dias até a queda do governo (estabilidade abaixo de ${VICTORY.politicalStability})`;
          return (
            <div key={`${v.kind}-${v.slot}`} className={`flex shrink-0 items-center gap-1 font-mono ${mine === (v.kind === 'territory') ? 'text-signal-green' : 'text-red-300'}`} title={text}>
              <span aria-hidden>{v.kind === 'territory' ? '🗺' : '⚖'}</span>
              <span className="inline-block h-1.5 w-12 overflow-hidden rounded bg-ink-700 align-middle" aria-hidden>
                <span className={`block h-full ${mine === (v.kind === 'territory') ? 'bg-signal-green' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
              </span>
              <span>{pct}%</span>
            </div>
          );
        })}
        <div className="flex shrink-0 items-center gap-1.5" title="Tempo de operação">
          <span className="text-ink-400" aria-hidden>
            ⏱
          </span>
          <span className="font-mono">{formatDuration(Math.floor(tick / TICK_RATE))}</span>
        </div>
        {!sandbox && tick < prep && (
          <div
            className="flex shrink-0 items-center gap-1.5 text-emerald-300"
            title={`Período de preparo (${DIFFICULTY[difficulty].label}): os governos de IA não declaram guerra nem lançam ofensivas.${DIFFICULTY[difficulty].harassment ? ' Podem provocar incidentes de fronteira com poucas tropas.' : ''} Use para montar a economia e as defesas.`}
          >
            <span aria-hidden>🛡</span>
            <span className="hidden xl:inline">Preparo</span>
            <span className="font-mono">{formatDuration(Math.ceil((prep - tick) / TICK_RATE))}</span>
          </div>
        )}
        {date && (
          <div className="hidden shrink-0 items-center gap-2 min-[1700px]:flex" title="Data do cenário (1 dia de jogo por segundo a 1×)">
            <span className="text-ink-400" aria-hidden>
              📅
            </span>
            <span className="font-mono">{formatDate(date)}</span>
          </div>
        )}
        {nation && (
          <div className="flex shrink-0 items-center gap-1.5" title="Aprovação do governo">
            <span className="hidden text-ink-400 2xl:inline">Aprovação</span>
            <span className="text-ink-400 2xl:hidden" aria-hidden>
              ☺
            </span>
            <span className={`font-mono ${nation.approval < 35 ? 'text-red-300' : 'text-ink-100'}`}>{formatPct(nation.approval, 0)}</span>
          </div>
        )}
        <div className="hidden items-center gap-3 min-[2200px]:flex">
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
          <span className="text-xs text-brass-400" title={connDetail ?? 'Reconectando ao servidor'}>
            ⚠<span className="hidden sm:inline"> {connDetail ? 'Servidor atualizando… a partida será retomada' : 'Reconectando…'}</span>
          </span>
        )}
        {showFps && <PerfChip open={pop === 'perf'} onToggle={() => toggle('perf')} />}
        {sky && <SkyChip sky={sky} />}
        {paused && <span className="hidden text-xs font-semibold text-brass-400 md:inline">PAUSADO{pausedBy ? ` por ${pausedBy}` : ''}</span>}
        <button className="btn min-h-8 px-2 py-1 text-xs whitespace-nowrap" onClick={() => runtime.togglePause()} title="Pausar/retomar (Espaço)" aria-label={paused ? 'Retomar' : 'Pausar'}>
          <PlayPauseIcon playing={!paused} />
          <span className="hidden min-[2100px]:inline">{paused ? 'Retomar' : 'Pausar'}</span>
        </button>
        <div className="hidden gap-1 xl:flex">
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
          className="btn min-h-8 px-2 py-1 font-mono text-xs xl:hidden"
          disabled={!canControlSpeed}
          title={canControlSpeed ? `Velocidade atual ${speed}× — tocar alterna para ${nextSpeed}×` : 'Velocidade fixa em partidas entre jogadores'}
          aria-label={`Velocidade ${speed}×`}
          onClick={() => runtime.setSpeed(nextSpeed)}
        >
          {speed}×
        </button>
        <button
          className={`btn min-h-8 px-2 py-1 text-xs whitespace-nowrap ${closeUp ? 'btn-primary' : ''}`}
          onClick={() => runtime.toggleCloseUp()}
          title="Visão aproximada: a câmera desce perto das tropas e acompanha a seleção; role para chegar mais perto e use Q/E para girar (V; Esc sai)"
          aria-label="Visão aproximada"
          aria-pressed={closeUp}
        >
          🎥<span className="hidden min-[2100px]:inline">De perto</span>
        </button>
        <button
          className={`btn min-h-8 px-2 py-1 text-xs whitespace-nowrap ${globeOpen ? 'btn-primary' : ''}`}
          onClick={() => (globeOpen ? closeGlobe() : openGlobe())}
          title="Globo diplomático: países, contatos, relações, tratados e guerras (Tab)"
          aria-label="Globo"
        >
          🌐<span className="hidden min-[2100px]:inline">Globo</span>
        </button>
        <button
          className={`btn min-h-8 px-2 py-1 text-xs whitespace-nowrap ${panelOpen ? 'btn-primary' : ''}`}
          onClick={() => togglePanel(!panelOpen)}
          title="Painel nacional: economia, orçamento, pesquisa e diplomacia (G)"
          aria-label="Nação"
        >
          🏛<span className="hidden min-[2100px]:inline">Nação</span>
        </button>
        <FullscreenButton />
        <button className="btn min-h-8 px-2 py-1 text-xs whitespace-nowrap" onClick={onMenu} title="Menu (F10)" aria-label="Menu">
          ☰<span className="hidden min-[2100px]:inline">Menu</span>
        </button>
      </div>
      {pop && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setPop(null)} aria-hidden />
          <div className={`absolute top-full z-50 mt-1 ${pop === 'perf' ? 'right-0' : 'left-0'}`}>
            {pop === 'money' ? (
              <MoneyPopover onClose={() => setPop(null)} />
            ) : pop === 'sandbox' ? (
              <SandboxPanel runtime={runtime} onClose={() => setPop(null)} />
            ) : pop === 'perf' ? (
              <PerfPopover onClose={() => setPop(null)} />
            ) : (
              <ProductionPopover runtime={runtime} onClose={() => setPop(null)} />
            )}
          </div>
        </>
      )}
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

/** Hora do dia e clima (visual): ícone e hora; o título explica o clima da partida. */
function SkyChip({ sky }: { sky: { hour: number; weather: 'clear' | 'rain' | 'storm' | 'snow'; climate: string } }) {
  const night = sky.hour >= 19.5 || sky.hour < 5.5;
  const icon = sky.weather === 'snow' ? '❄' : sky.weather === 'storm' ? '⛈' : sky.weather === 'rain' ? '🌧' : night ? '🌙' : '☀';
  const label = sky.weather === 'snow' ? 'Nevando' : sky.weather === 'storm' ? 'Tempestade' : sky.weather === 'rain' ? 'Chovendo' : night ? 'Noite' : 'Tempo bom';
  const hh = String(Math.floor(sky.hour)).padStart(2, '0');
  const mm = String(Math.floor((sky.hour % 1) * 4) * 15).padStart(2, '0');
  return (
    <span className="hidden items-center gap-1 font-mono text-xs text-ink-100 lg:inline-flex" title={`${label} · clima ${sky.climate} (só visual)`} aria-label={`${label}, ${hh}:${mm}`}>
      <span aria-hidden>{icon}</span>
      {hh}:{mm}
    </span>
  );
}

/** Rede elétrica: geração e consumo; vermelho quando há construções paradas sem luz. */
function PowerChip({ power }: { power: { supply: number; demand: number; served: number; dark: number; isolated: number; coalPerMin: number } }) {
  const short = power.dark > 0;
  const why = power.isolated > 0 ? `${power.isolated} longe da rede (ligue com estrada a até 4 células de uma usina, do QG ou de outra estrada)` : 'falta geração: construa outra usina';
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      title={`Energia: geração ${power.supply}, consumo ${power.demand}${power.coalPerMin > 0 ? ` · termelétricas queimam ${power.coalPerMin} de carvão/min` : ''}${short ? ` — ${power.dark} construção(ões) PARADA(S) sem luz: ${why}` : ''}`}
      aria-label={`Energia ${power.supply} de geração, ${power.demand} de consumo`}
    >
      <span aria-hidden className={short ? 'text-red-300' : 'text-brass-400'}>⚡</span>
      <span className={`font-mono font-bold ${short ? 'text-red-300' : ''}`}>
        {power.served}/{power.supply}
      </span>
    </div>
  );
}
