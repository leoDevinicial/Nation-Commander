import { GAME_SPEEDS } from '../../../shared/protocol.ts';
import { DIFFICULTY, prepTicks } from '../../../shared/sim/difficulty.ts';
import { ERAS, type Era } from '../../../shared/sim/eras.ts';
import { GOODS, VICTORY, POP_ABSOLUTE_CAP, RESOURCE_LABELS, RESOURCE_TYPES, STORAGE_LABEL, TICK_RATE } from '../../../shared/sim/config.ts';
import { RESOURCE_STYLE, ResourceIcon } from '../components/Resources.tsx';
import { Frame } from '../components/Frame.tsx';
import { countryName } from '../../../shared/data/countries.ts';
import { Brain, ChevronDown, ChevronUp, ChevronsUp, CloudLightning, CloudRain, Fuel, Globe, Landmark, Map, Menu as MenuIcon, Moon, Music, Pause, Play, Scale, ShieldCheck, Snowflake, Sun, TriangleAlert, Users, Video, VolumeX, Zap } from 'lucide-react';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { formatDate, formatDuration, formatPct } from '../../lib/format.ts';
import { FullscreenButton } from '../components/FullscreenButton.tsx';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { useState, type ReactNode } from 'react';
import { MoneyChip, MoneyPopover, ProductionChip, ProductionPopover, type TopBarPopover } from './TopBarExtras.tsx';
import { PerfChip, PerfPopover } from './PerfPanel.tsx';
import { NetChip, NetPopover } from './NetPanel.tsx';
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
  // celular (< 1024 px, 05/11): só a barra de recursos fica no topo; nação, relógio e menus abrem por um botão
  const [more, setMore] = useState(false);
  const toggle = (p: Exclude<TopBarPopover, null>) => setPop((cur) => (cur === p ? null : p));

  const myCountry = roster.find((p) => p.slot === mySlot)?.countryId ?? '';
  const era = (me?.era ?? 1) as Era;
  const approval = nation?.approval;

  return (
    // Sala de Situação (05/11, docs/ui_maquete): quatro blocos com a moldura de comando — nação, recursos, tempo e
    // menus. Os menus que abrem para baixo ficam fora das molduras (o recorte delas cortaria).
    <div className="pointer-events-none absolute top-2 right-2 left-2 z-40 flex h-11 items-stretch gap-1.5 text-xs sm:top-2.5 sm:right-3 sm:left-3 sm:gap-2 sm:text-sm">
      {/* nação: insígnia na cor da nação com a sigla do país, nome, era e aprovação */}
      {/* nação, relógio e menus: no computador ficam na barra; no celular, numa linha que abre e fecha pelo botão ao lado
          dos recursos (fica por cima dos avisos enquanto aberta) */}
      <div className={`lg:contents ${more ? 'max-lg:absolute max-lg:top-[calc(100%+5px)] max-lg:left-0 max-lg:z-10 max-lg:flex max-lg:h-11 max-lg:gap-1.5' : 'max-lg:hidden'}`}>
      <Frame className="pointer-events-auto shrink-0 lg:order-1" innerClassName="flex items-center gap-2 pr-2.5 pl-2 max-lg:![background:rgb(12_17_24)] sm:gap-2.5 sm:pr-3">
        <span
          className="absolute top-2 bottom-0 left-0 w-[3px]"
          style={{ background: factionColor(mySlot), boxShadow: `0 0 10px ${factionColor(mySlot)}` }}
          aria-hidden
        />
        <span
          className="nc-num ml-1 grid h-7 w-10 shrink-0 place-items-center text-[11px] font-bold text-white"
          style={{ background: factionColor(mySlot), clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)', textShadow: '0 1px 2px rgb(0 0 0 / 0.5)' }}
          title={countryName(myCountry)}
          aria-hidden
        >
          {myCountry}
        </span>
        <div className="hidden min-w-0 flex-col justify-center lg:flex">
          <span className="nc-title hidden max-w-[9rem] truncate text-base leading-none min-[1800px]:block" translate="no">
            {countryName(myCountry)}
          </span>
          {me?.eras && <EraChip era={era} advance={me.eraAdvance} />}
        </div>
        {me?.eras && (
          <span className="lg:hidden">
            <EraChip era={era} advance={me.eraAdvance} />
          </span>
        )}
        {approval !== undefined && (
          <div className="flex flex-col items-end justify-center gap-0.5 pl-1" title="Aprovação do governo (abaixo de 35% é crise; ver o painel da Nação)">
            <span className="nc-kicker hidden text-[9px] min-[1800px]:block">Aprovação</span>
            <span className={`nc-num text-sm leading-none font-bold ${approval < 35 ? 'text-red-300' : approval < 50 ? 'text-brass-400' : 'text-signal-green'}`}>{formatPct(approval, 0)}</span>
            <span className="relative hidden h-1 w-12 bg-white/10 lg:block" aria-hidden>
              <span className={`absolute inset-y-0 left-0 ${approval < 35 ? 'bg-red-400' : approval < 50 ? 'bg-brass-400' : 'bg-signal-green'}`} style={{ width: `${Math.max(0, Math.min(100, approval))}%` }} />
            </span>
          </div>
        )}
      </Frame>

      </div>

      {/* recursos e indicadores: rolam na horizontal em telas estreitas em vez de cortar */}
      {/* prioridade por largura: os valores cabem sempre; rótulos, capacidade, saldo e nomes aparecem conforme sobra espaço
          (o detalhe completo fica na dica de cada item) */}
      <Frame
        className="pointer-events-auto min-w-0 flex-1 lg:order-2"
        innerClassName="no-scrollbar flex items-center gap-0 overflow-x-auto pr-3 pl-1.5 [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]"
      >
        {sandbox && (
          <span className="shrink-0 pr-2">
            <SandboxChip open={pop === 'sandbox'} onToggle={() => toggle('sandbox')} />
          </span>
        )}
        {/* Sandbox: sem economia na tela (recursos ilimitados) */}
        {!sandbox && <MoneyChip open={pop === 'money'} onToggle={() => toggle('money')} />}
        {!sandbox &&
          RESOURCE_TYPES.map((r) => {
            const have = Math.floor(me?.resources?.[r] ?? 0);
            const cap = me?.capacity?.[r] ?? 0;
            const net = me?.income?.[r] ?? 0;
            const full = cap > 0 && have >= cap;
            const alarm = (r === 'food' && me?.hungry) || (r === 'oil' && me?.noFuel);
            return (
              <BarItem
                key={r}
                label={RESOURCE_LABELS[r]}
                icon={<ResourceIcon type={r} size={15} />}
                title={`${RESOURCE_LABELS[r]}: ${have} de ${cap} (guardado em: ${STORAGE_LABEL[r]}). Saldo: ${net >= 0 ? '+' : ''}${net.toFixed(2)}/s${full ? ' — CHEIO: a produção pausa' : ''}${r === 'oil' ? `\nVeículos e navios gastam petróleo ao andar (o Combustível da Refinaria sai primeiro)${me?.noFuel ? ' — SEM COMBUSTÍVEL: andam a meia velocidade' : ''}` : ''}`}
                fill={cap > 0 ? have / cap : undefined}
                fillColor={full ? 'var(--color-signal-amber)' : RESOURCE_STYLE[r].color}
                valueClass={full ? 'text-signal-amber' : alarm ? 'text-red-300' : ''}
                extra={
                  <span className={`hidden text-[10px] min-[1800px]:inline ${net < 0 ? 'text-red-300' : 'text-signal-green'}`}>
                    {net >= 0 ? '+' : ''}
                    {net.toFixed(1)}
                  </span>
                }
              >
                {have}
              </BarItem>
            );
          })}
        {!sandbox && me?.power && <PowerChip power={me.power} />}
        {!sandbox && me?.goods && (me.goods.fuel > 0 || me.goods.steel > 0 || me.goods.cap > GOODS.baseCap) && (
          <BarItem
            label="Bens"
            icon={<Fuel size={15} color="#c9a26b" aria-hidden />}
            title={`Bens industriais (cadeias produtivas), até ${me.goods.cap} de cada: ${GOODS.label.fuel} ${me.goods.fuel} (Refinaria, substitui petróleo) · ${GOODS.label.steel} ${me.goods.steel} (Siderúrgica, substitui ferro). Cada unidade poupa ${GOODS.saves} do recurso bruto na produção de veículos e aeronaves, nas missões aéreas e no deslocamento de veículos e navios.`}
          >
            {me.goods.fuel}
            <span className="px-1 text-ink-600">·</span>
            {me.goods.steel}
          </BarItem>
        )}
        {!sandbox && me?.population && (
          <BarItem
            label="População"
            icon={<Users size={15} className="text-ink-300" aria-hidden />}
            title={`População ${me.population.total}/${me.population.cap} (teto nacional ${POP_ABSOLUTE_CAP}). Cidadãos: ${me.population.citizens} (${me.population.employed} empregados${me.population.builders ? `, ${me.population.builders} em obras` : ''}, ${me.population.idle} ociosos) · Recrutas na reserva: ${me.population.recruits} (+${me.population.queuedRecruits} em alistamento no quartel) · Militares: ${me.population.military} em campo, ${me.population.queuedMilitary} em formação · Cidadãos em formação: ${me.population.queuedCitizens}`}
            valueClass={me.population.total >= me.population.cap ? 'text-brass-400' : ''}
          >
            {me.population.total}
            <span className="text-ink-400">/{me.population.cap}</span>
          </BarItem>
        )}
        {!sandbox && me?.knowledge !== undefined && (
          <BarItem
            label="Conhecimento"
            icon={<Brain size={15} color="#b9a4f2" aria-hidden />}
            title={`Pontos de conhecimento: ${me.knowledge}. Formados por Escolas e Universidades (uma de cada por cidade, com trabalhadores e luz); pagam as pesquisas militares e nacionais junto com o US$ do caixa.`}
            ariaLabel={`Conhecimento: ${me.knowledge} pontos`}
          >
            {me.knowledge}
          </BarItem>
        )}
        <ProductionChip open={pop === 'production'} onToggle={() => toggle('production')} />
        {victory.map((v) => {
          const mine = v.slot === mySlot;
          const pct = Math.round(v.progress * 100);
          const good = mine === (v.kind === 'territory');
          const text =
            v.kind === 'territory'
              ? `${mine ? 'Nosso' : 'Inimigo:'} domínio territorial — ${pct}% dos ${VICTORY.territorySeconds / 60} min para a vitória (controle ≥ ${Math.round(VICTORY.territoryShare * 100)}% do território reivindicado)`
              : `${mine ? 'Nossa' : 'Inimigo:'} crise política — ${pct}% dos ${VICTORY.politicalDays} dias até a queda do governo (estabilidade abaixo de ${VICTORY.politicalStability})`;
          return (
            <BarItem
              key={`${v.kind}-${v.slot}`}
              label={v.kind === 'territory' ? 'Domínio' : 'Crise'}
              icon={v.kind === 'territory' ? <Map size={15} aria-hidden /> : <Scale size={15} aria-hidden />}
              title={text}
              fill={v.progress}
              fillColor={good ? 'var(--color-signal-green)' : 'var(--color-signal-red)'}
              valueClass={good ? 'text-signal-green' : 'text-red-300'}
            >
              {pct}%
            </BarItem>
          );
        })}
        {!sandbox && tick < prep && (
          <BarItem
            label="Preparo"
            icon={<ShieldCheck size={15} className="text-emerald-300" aria-hidden />}
            title={`Período de preparo (${DIFFICULTY[difficulty].label}): os governos de IA não declaram guerra nem lançam ofensivas.${DIFFICULTY[difficulty].harassment ? ' Podem provocar incidentes de fronteira com poucas tropas.' : ''} Use para montar a economia e as defesas.`}
            valueClass="text-emerald-300"
          >
            {formatDuration(Math.ceil((prep - tick) / TICK_RATE))}
          </BarItem>
        )}
        <div className="ml-auto hidden items-center gap-3 pl-3 min-[2200px]:flex">
          {roster.map((p) => (
            <span key={p.slot} className="flex items-center gap-1.5 text-xs" translate="no">
              <span className="inline-block h-2.5 w-2.5" style={{ background: factionColor(p.slot) }} aria-hidden />
              <span className={players.find((x) => x.slot === p.slot)?.defeated ? 'text-ink-400 line-through' : ''}>
                {p.name}
                {p.slot === mySlot && ' (você)'}
              </span>
            </span>
          ))}
        </div>
      </Frame>

      <Frame className="pointer-events-auto shrink-0 lg:hidden" innerClassName="flex items-center px-1.5">
        <button className={`nc-icon-btn ${more ? 'is-on' : ''}`} onClick={() => setMore(!more)} aria-expanded={more} aria-label={more ? 'Fechar a barra' : 'Nação, relógio e menus'} title={more ? 'Fechar a barra' : 'Nação, relógio e menus'}>
          {paused && !more ? <Pause size={17} aria-hidden /> : more ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
        </button>
      </Frame>

      <div className={`lg:contents ${more ? 'max-lg:absolute max-lg:top-[calc(100%+5px)] max-lg:right-0 max-lg:z-10 max-lg:flex max-lg:h-11 max-lg:gap-1.5' : 'max-lg:hidden'}`}>
      {/* tempo: relógio da operação, hora do dia, pausa e velocidade */}
      <Frame className="pointer-events-auto shrink-0 lg:order-3" innerClassName="flex items-center gap-2 pr-2 pl-2.5 max-lg:![background:rgb(12_17_24)] sm:gap-2.5">
        <div className="flex flex-col justify-center" title={date ? `Tempo de operação · data do cenário ${formatDate(date)} (1 dia de jogo por segundo a 1×)` : 'Tempo de operação'}>
          <span className="nc-num text-base leading-none font-bold sm:text-lg">{formatDuration(Math.floor(tick / TICK_RATE))}</span>
          {sky && <SkyChip sky={sky} />}
        </div>
        {paused && <span className="hidden text-[11px] font-semibold tracking-wider text-brass-400 uppercase md:inline">Pausado{pausedBy ? ` · ${pausedBy}` : ''}</span>}
        <div className="nc-seg">
          <button className="nc-icon-btn" onClick={() => runtime.togglePause()} title="Pausar/retomar (Espaço)" aria-label={paused ? 'Retomar' : 'Pausar'}>
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
          </button>
          {GAME_SPEEDS.map((s) => (
            <button
              key={s}
              className={`nc-icon-btn hidden text-[11px] min-[1800px]:inline-flex ${speed === s ? 'is-on' : ''}`}
              disabled={!canControlSpeed}
              title={canControlSpeed ? `Velocidade ${s}×` : 'Velocidade fixa em partidas entre jogadores'}
              onClick={() => runtime.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
          <button
            className="nc-icon-btn is-on text-[11px] min-[1800px]:hidden"
            disabled={!canControlSpeed}
            title={canControlSpeed ? `Velocidade atual ${speed}× — tocar alterna para ${nextSpeed}×` : 'Velocidade fixa em partidas entre jogadores'}
            aria-label={`Velocidade ${speed}×`}
            onClick={() => runtime.setSpeed(nextSpeed)}
          >
            {speed}×
          </button>
        </div>
      </Frame>

      {/* menus: conexão (só o ponto), visão de perto, globo, nação, música, tela cheia e menu */}
      <Frame className="pointer-events-auto shrink-0 lg:order-4" innerClassName="flex items-center gap-1 px-1.5 max-lg:![background:rgb(12_17_24)] sm:gap-1.5 sm:px-2">
        {connStatus !== 'connected' && (
          <span className="flex items-center gap-1 text-xs text-brass-400" title={connDetail ?? 'Reconectando ao servidor'}>
            <TriangleAlert size={15} aria-hidden />
            <span className="hidden sm:inline">{connDetail ? 'Servidor atualizando… a partida será retomada' : 'Reconectando…'}</span>
          </span>
        )}
        <NetChip open={pop === 'net'} onToggle={() => toggle('net')} />
        {showFps && <PerfChip open={pop === 'perf'} onToggle={() => toggle('perf')} />}
        <span className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" aria-hidden />
        <button
          className={`nc-icon-btn hidden lg:inline-flex ${closeUp ? 'is-on' : ''}`}
          onClick={() => runtime.toggleCloseUp()}
          title="Visão aproximada: a câmera desce perto das tropas e acompanha a seleção; role para chegar mais perto e use Q/E para girar (V; Esc sai)"
          aria-label="Visão aproximada"
          aria-pressed={closeUp}
        >
          <Video size={17} aria-hidden />
        </button>
        <button
          className={`nc-icon-btn ${globeOpen ? 'is-on' : ''}`}
          onClick={() => (globeOpen ? closeGlobe() : openGlobe())}
          title="Globo diplomático: países, contatos, relações, tratados e guerras (Tab)"
          aria-label="Globo"
        >
          <Globe size={17} aria-hidden />
        </button>
        <button className={`nc-icon-btn ${panelOpen ? 'is-on' : ''}`} onClick={() => togglePanel(!panelOpen)} title="Painel nacional: economia, orçamento, pesquisa e diplomacia (G)" aria-label="Nação">
          <Landmark size={17} aria-hidden />
        </button>
        <MusicButton />
        <FullscreenButton variant="bar" />
        <button className="nc-icon-btn" onClick={onMenu} title="Menu (F10)" aria-label="Menu">
          <MenuIcon size={17} aria-hidden />
        </button>
      </Frame>
      </div>

      {pop && (
        <>
          <div className="pointer-events-auto fixed inset-0 z-40" onPointerDown={() => setPop(null)} aria-hidden />
          <div className={`pointer-events-auto absolute top-full z-50 mt-1.5 ${pop === 'perf' || pop === 'net' ? 'right-0' : 'left-0'}`}>
            {pop === 'money' ? (
              <MoneyPopover onClose={() => setPop(null)} />
            ) : pop === 'sandbox' ? (
              <SandboxPanel runtime={runtime} onClose={() => setPop(null)} />
            ) : pop === 'perf' ? (
              <PerfPopover onClose={() => setPop(null)} />
            ) : pop === 'net' ? (
              <NetPopover onClose={() => setPop(null)} />
            ) : (
              <ProductionPopover runtime={runtime} onClose={() => setPop(null)} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** Selo da era: algarismo romano em latão e o nome quando cabe; mostra o avanço em andamento. */
function EraChip({ era, advance }: { era: Era; advance?: { to: number; progress: number } }) {
  return (
    <span
      className="mt-1 inline-flex h-[18px] items-center gap-1 border border-brass-500/70 bg-brass-400/10 pr-1.5 pl-1 text-[10px] font-bold tracking-[0.1em] whitespace-nowrap text-brass-400"
      style={{ clipPath: 'polygon(4px 0, 100% 0, 100% 100%, 0 100%, 0 4px)' }}
      title={`Era atual: ${ERAS[era].label} — ${ERAS[era].look}.${advance ? ` Avançando para ${ERAS[advance.to as Era].label}: ${Math.round(advance.progress * 100)}%.` : ' Avance de era no Centro de Comando.'}`}
    >
      <ChevronsUp size={11} aria-hidden />
      ERA {ROMAN[era]}
      <span className="hidden font-medium tracking-normal text-ink-300 min-[1800px]:inline">· {ERAS[era].label}</span>
      {advance && <span className="nc-num font-medium tracking-normal">→ {Math.round(advance.progress * 100)}%</span>}
    </span>
  );
}

/**
 * Item da barra de recursos: ícone na cor do recurso, rótulo pequeno (telas largas), valor em fonte de instrumento e
 * a barra fina de capacidade embaixo (`fill`, 0..1).
 */
function BarItem({
  label,
  icon,
  title,
  ariaLabel,
  fill,
  fillColor,
  valueClass = '',
  extra,
  children,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  ariaLabel?: string;
  fill?: number;
  fillColor?: string;
  valueClass?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full shrink-0 items-center gap-1 border-r border-white/[0.07] px-1.5 last:border-r-0 min-[1800px]:gap-1.5 min-[1800px]:px-2.5" title={title} aria-label={ariaLabel}>
      {icon}
      <div className="flex flex-col justify-center">
        <span className="nc-kicker mb-0.5 hidden text-[8.5px] min-[1800px]:block">{label}</span>
        <span className={`nc-num flex items-baseline gap-1 text-[13px] leading-none font-bold sm:text-sm ${valueClass}`}>
          <span>{children}</span>
          {extra}
        </span>
        {fill !== undefined && (
          <span className="mt-1 hidden h-0.5 w-full min-w-9 bg-white/[0.08] lg:block" aria-hidden>
            <span className="block h-full" style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, background: fillColor }} />
          </span>
        )}
      </div>
    </div>
  );
}

/** Hora do dia e clima (visual): ícone e hora; o título explica o clima da partida. */
function SkyChip({ sky }: { sky: { hour: number; weather: 'clear' | 'rain' | 'storm' | 'snow'; climate: string } }) {
  const night = sky.hour >= 19.5 || sky.hour < 5.5;
  const Icon = sky.weather === 'snow' ? Snowflake : sky.weather === 'storm' ? CloudLightning : sky.weather === 'rain' ? CloudRain : night ? Moon : Sun;
  const label = sky.weather === 'snow' ? 'Nevando' : sky.weather === 'storm' ? 'Tempestade' : sky.weather === 'rain' ? 'Chovendo' : night ? 'Noite' : 'Tempo bom';
  const hh = String(Math.floor(sky.hour)).padStart(2, '0');
  const mm = String(Math.floor((sky.hour % 1) * 4) * 15).padStart(2, '0');
  return (
    <span className="nc-num mt-0.5 hidden items-center gap-1 text-[10px] text-ink-400 lg:inline-flex" title={`${label} · clima ${sky.climate} (só visual)`} aria-label={`${label}, ${hh}:${mm}`}>
      <Icon size={11} aria-hidden />
      {hh}:{mm}
    </span>
  );
}

/** Rede elétrica: geração e consumo; vermelho quando há construções paradas sem luz. */
function PowerChip({ power }: { power: { supply: number; demand: number; served: number; dark: number; isolated: number; coalPerMin: number } }) {
  const short = power.dark > 0;
  const why = power.isolated > 0 ? `${power.isolated} longe da rede (ligue com estrada a até 4 células de uma usina, do QG ou de outra estrada)` : 'falta geração: construa outra usina';
  return (
    <BarItem
      label="Energia"
      icon={<Zap size={15} className={short ? 'text-red-300' : 'text-brass-400'} aria-hidden />}
      title={`Energia: geração ${power.supply}, consumo ${power.demand}${power.coalPerMin > 0 ? ` · termelétricas queimam ${power.coalPerMin} de carvão/min` : ''}${short ? ` — ${power.dark} construção(ões) PARADA(S) sem luz: ${why}` : ''}`}
      ariaLabel={`Energia ${power.supply} de geração, ${power.demand} de consumo`}
      fill={power.supply > 0 ? power.demand / power.supply : undefined}
      fillColor={short ? 'var(--color-signal-red)' : 'var(--color-brass-400)'}
      valueClass={short ? 'text-red-300' : ''}
    >
      {power.served}/{power.supply}
    </BarItem>
  );
}

/** Liga/desliga só a trilha sonora durante a partida (atalho M); volumes finos ficam em Menu → Áudio e Volumes. */
function MusicButton() {
  const musicMuted = useSettingsStore((s) => s.musicMuted);
  const update = useSettingsStore((s) => s.update);
  return (
    <button
      className={`nc-icon-btn hidden lg:inline-flex ${musicMuted ? 'text-ink-400' : ''}`}
      onClick={() => update({ musicMuted: !musicMuted })}
      title={musicMuted ? 'Ligar a música (M)' : 'Silenciar a música (M); os sons da guerra continuam'}
      aria-label={musicMuted ? 'Ligar a música' : 'Silenciar a música'}
      aria-pressed={musicMuted}
    >
      {musicMuted ? <VolumeX size={17} aria-hidden /> : <Music size={17} aria-hidden />}
    </button>
  );
}
