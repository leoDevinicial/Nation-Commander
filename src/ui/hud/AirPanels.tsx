import { useEffect, useRef, useState } from 'react';
import { UNITS, canAfford, emptyStockpile } from '../../../shared/sim/config.ts';
import { useMyBonus } from '../../state/myCountry.ts';
import { DRONE } from '../../../shared/sim/drones.ts';
import { AIR, AIRCRAFT_TYPES, AIRLIFT, aircraftFor, CRUISE, IRON_DOME, MISSILE, NUCLEAR, launcherRange, missileSpec, type AircraftState, type AircraftType, type LaunchState } from '../../../shared/sim/air.ts';
import { TECHNOLOGIES } from '../../../shared/strategic/technologies.ts';
import { buildingEffects, formatUsd } from '../../../shared/sim/upgrades.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore, type SelectedBuildingInfo } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { CostLabel } from '../components/Resources.tsx';
import { CardButton } from './CardButton.tsx';
import { audio } from '../../game/audio/AudioService.ts';
import { effectiveEra, effectiveFund, effectiveTechs, timeText } from '../../state/sandbox.ts';
import { AIRCRAFT_ERA } from '../../../shared/sim/eras.ts';

const ICON: Record<AircraftType, string> = { fighter: '✈', bomber: '💣', recon: '🔭', transport: '📦', drone: '🛩', airlifter: '🪂' };
const SHORT: Record<AircraftType, string> = { fighter: 'Caça', bomber: 'Bombardeiro', recon: 'Reconhecimento', transport: 'Cargueiro', drone: 'Drone', airlifter: 'C-5 Galaxy' };
const STATE: Record<AircraftState, string> = {
  building: 'em produção',
  ready: 'pronta',
  mission: 'em missão',
  maintenance: 'manutenção',
  grounded: 'em terra (sem manutenção)',
};
export const LAUNCH_STATE: Record<LaunchState, string> = {
  preparing: 'Abastecendo',
  armed: 'ARMADO — aguardando autorização',
  launching: 'Contagem final',
  flight: 'Em voo',
  impact: 'Impacto',
  intercepted: 'Interceptado',
  aborted: 'Abortado',
};

const warn = (text: string) => useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text, tone: 'warn' });

function useMe() {
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const mySlot = useHudStore((s) => s.mySlot);
  const nation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const bonus = useMyBonus();
  return {
    resources: me?.resources ?? emptyStockpile(),
    recruits: me?.population?.recruits ?? 0,
    techs: effectiveTechs(nation?.research.done ?? []),
    fund: effectiveFund(nation?.works.fundUsd ?? null),
    bonus,
    era: effectiveEra(me),
    goods: me?.goods,
  };
}

function Bar({ value, tone = 'bg-brass-400' }: { value: number; tone?: string }) {
  return (
    <span className="inline-block h-1 w-10 overflow-hidden rounded bg-ink-700 align-middle" aria-hidden>
      <span className={`block h-full ${tone}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

// ------------------------------------------------------------------ base aérea

/** Hangar e resultado das últimas missões (coluna de informações). */
export function AirbaseInfo({ b }: { b: SelectedBuildingInfo }) {
  const air = useHudStore((s) => s.air);
  const planes = air?.aircraft.filter((a) => a.baseId === b.id) ?? [];
  const missions = (air?.missions ?? [])
    .filter((m) => m.baseId === b.id && m.result)
    .slice(-2)
    .reverse();
  return (
    <div className="mt-1.5 text-xs">
      <div className="text-ink-400">
        Hangar: <span className="font-mono text-ink-100">{planes.length}</span>/{AIR.hangarPerBase}
        {air && air.transports > 0 && <span> · {air.transports} cargueiro(s) no comércio aéreo</span>}
      </div>
      {planes.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1" aria-label="Aeronaves da base">
          {planes.map((a) => (
            <li
              key={a.id}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${a.state === 'ready' ? 'border-signal-green/50 text-ink-100' : a.state === 'grounded' ? 'border-red-400/60 text-red-300' : 'border-ink-600 text-ink-300'}`}
            >
              {ICON[a.type]} {SHORT[a.type]} · {STATE[a.state]} {(a.state === 'building' || a.state === 'maintenance') && <Bar value={a.progress} />}
            </li>
          ))}
        </ul>
      )}
      {missions.map((m) => (
        <div key={m.id} className="mt-1 text-[11px] text-ink-300">
          {m.kind === 'strike' ? '🎯 Ataque' : '🔭 Reconhecimento'}: {m.result!.text}
          {m.state !== 'done' && <span className="text-ink-400"> (retornando)</span>}
          <span className="text-ink-400"> · {m.fuel} de petróleo</span>
        </div>
      ))}
    </div>
  );
}

function aircraftBlocker(type: AircraftType, ctx: ReturnType<typeof useMe>, inHangar: number, baseLevel: number): string | null {
  const def = aircraftFor(type, ctx.bonus, ctx.goods);
  if (AIRCRAFT_ERA[type] > ctx.era) return `era ${AIRCRAFT_ERA[type]}`;
  if (def.minBaseLevel && baseLevel < def.minBaseLevel) return `exige base nível ${def.minBaseLevel}`;
  if (inHangar >= AIR.hangarPerBase) return 'hangar cheio';
  if (ctx.recruits < 1) return 'sem piloto (recruta)';
  if (!canAfford(ctx.resources, def.cost)) return 'recursos insuficientes';
  if (ctx.fund !== null && ctx.fund < def.usd) return 'caixa do país sem saldo';
  return null;
}

/** Produção de aeronaves e ordens de missão (grade de ações). */
export function AirbaseButtons({ b, runtime }: { b: SelectedBuildingInfo; runtime: GameRuntime }) {
  const air = useHudStore((s) => s.air);
  const ctx = useMe();
  const planes = air?.aircraft.filter((a) => a.baseId === b.id) ?? [];
  const ready = (t: AircraftType) => planes.filter((a) => a.type === t && a.state === 'ready').map((a) => a.id);
  const fighters = ready('fighter');
  const recon = ready('recon');
  const bombers = ready('bomber');
  const noTech = !ctx.techs.includes('guided_munitions') ? `exige ${TECHNOLOGIES.guided_munitions.label}` : null;
  const strikeBlock = noTech ?? (fighters.length === 0 ? 'nenhum caça pronto' : null);
  const bombBlock = noTech ?? (bombers.length === 0 ? 'nenhum bombardeiro pronto' : null);
  const hasBombers = planes.some((a) => a.type === 'bomber');
  const drones = ready('drone');
  const hasDrones = planes.some((a) => a.type === 'drone');
  return (
    <>
      {AIRCRAFT_TYPES.map((t) => {
        const def = aircraftFor(t, ctx.bonus, ctx.goods);
        const blocker = aircraftBlocker(t, ctx, planes.length, b.level);
        return (
          <CardButton
            key={t}
            icon={ICON[t]}
            label={SHORT[t]}
            blocked={blocker !== null}
            short={blocker}
            count={planes.filter((a) => a.type === t && a.state === 'building').length}
            onClick={() => (blocker ? warn(`${def.label}: ${blocker}`) : runtime.send({ type: 'build_aircraft', buildingId: b.id, aircraftType: t }))}
            title={`${def.label} — ${def.role}\nCusto: ${formatUsd(def.usd)} do caixa do país + materiais + 1 piloto · ${timeText(def.buildSeconds)}${def.range ? `\nAlcance ${def.range} · manutenção ${def.maintenanceSeconds}s após cada missão` : ''}`}
          >
            <CostLabel cost={def.cost} have={ctx.resources} compact />
            {def.goods?.fuel && <span className="text-[9px] text-signal-blue">⛽{def.goods.fuel}</span>}
            <span className="text-[9px] text-ink-400">{formatUsd(def.usd)}</span>
          </CardButton>
        );
      })}
      <CardButton
        icon="🔭"
        label="Reconhecer área"
        blocked={recon.length === 0}
        short={recon.length === 0 ? 'nenhum pronto' : null}
        onClick={() => (recon.length ? runtime.startAirTarget('recon', b.id, recon.slice(0, 1)) : warn('Reconhecimento: nenhuma aeronave de reconhecimento pronta nesta base'))}
        title={`Reconhecimento: escolha um ponto no alcance. Revela a área por ${AIR.reconSeconds}s e registra os edifícios inimigos vistos (alvos de ataque).`}
      />
      <CardButton
        icon="🎯"
        label="Ataque aéreo"
        blocked={strikeBlock !== null}
        short={strikeBlock}
        onClick={() => (strikeBlock ? warn(`Ataque aéreo: ${strikeBlock}`) : runtime.startAirTarget('strike', b.id, fighters.slice(0, 4)))}
        title={`Ataque com os caças prontos (até 4) contra um edifício inimigo já descoberto, em guerra e no alcance. Antiaérea e caças inimigos podem derrubar aeronaves; o dano costuma ser parcial. Caças que cruzam com uma esquadrilha inimiga entram em combate aéreo.`}
      />
      {hasDrones && (
        <CardButton
          icon="🛩"
          label="Lançar drone"
          blocked={drones.length === 0}
          short={drones.length === 0 ? 'nenhum pronto' : null}
          onClick={() => (drones.length ? runtime.startAirTarget('drone', b.id, drones.slice(0, 1)) : warn('Drone: nenhum drone pronto nesta base'))}
          title={`Drone de ataque: escolha um ponto no alcance (${DRONE.range}). Ele voa sozinho e mergulha no alvo. Nos primeiros ${DRONE.takeoverSeconds}s de voo, você pode (se quiser) clicar no drone ou apertar T para pilotar em primeira pessoa: mouse dá a direção, W acelera, S freia, Espaço sobe, Ctrl ou C desce, clique explode, Esc devolve ao piloto automático. Só fere quem está em guerra com você; a antiaérea pode derrubá-lo.`}
        />
      )}
      {hasBombers && (
        <CardButton
          icon="💣"
          label="Bombardeio"
          blocked={bombBlock !== null}
          short={bombBlock}
          onClick={() => (bombBlock ? warn(`Bombardeio: ${bombBlock}`) : runtime.startAirTarget('strike', b.id, bombers.slice(0, 4)))}
          title={`Bombardeio em tapete com os bombardeiros prontos (até 4): muito dano ao edifício-alvo e ${Math.round(AIR.carpetSplash * 100)}% aos edifícios inimigos num raio de ${AIR.carpetRadius}. Lentos e sem escolta: caças inimigos os derrubam com facilidade.`}
        />
      )}
      {planes.some((a) => a.type === 'airlifter') && (
        <CardButton
          icon="🪂"
          label="Paraquedistas"
          blocked={ready('airlifter').length === 0}
          short={ready('airlifter').length === 0 ? 'nenhum C-5 pronto' : null}
          onClick={() => (ready('airlifter').length ? runtime.startAirTarget('paradrop', b.id, ready('airlifter').slice(0, 1)) : warn('Paraquedistas: nenhum C-5 pronto nesta base'))}
          title={`C-5 Galaxy: embarca as suas tropas paradas a até ${AIRLIFT.pickupRadius} da base (até ${AIRLIFT.infantry} soldados e ${AIRLIFT.vehicles} veículos), voa até o ponto escolhido e as lança de paraquedas; depois volta. Antiaérea e caças inimigos podem derrubá-lo: aí todos a bordo morrem.`}
        />
      )}
    </>
  );
}

/** Porta-aviões (03/11): caças no convés, reposição pelo preço normal e ataque com os prontos. */
export function CarrierButtons({ unitId, runtime }: { unitId: number; runtime: GameRuntime }) {
  const air = useHudStore((s) => s.air);
  const ctx = useMe();
  const planes = air?.aircraft.filter((a) => a.baseId === unitId) ?? [];
  const fighters = planes.filter((a) => a.type === 'fighter' && a.state === 'ready').map((a) => a.id);
  const max = UNITS.aircraft_carrier.carrierFighters ?? 4;
  const def = aircraftFor('fighter', ctx.bonus, ctx.goods);
  const full = planes.length >= max;
  const buildBlock = full ? 'convés cheio' : !canAfford(ctx.resources, def.cost) ? 'recursos insuficientes' : ctx.fund !== null && ctx.fund < def.usd ? 'verba insuficiente' : null;
  const noTech = !ctx.techs.includes('guided_munitions') ? `exige ${TECHNOLOGIES.guided_munitions.label}` : null;
  const strikeBlock = noTech ?? (fighters.length === 0 ? 'nenhum caça pronto' : null);
  return (
    <>
      <CardButton
        icon="✈"
        label={`Repor caça (${planes.length}/${max})`}
        blocked={buildBlock !== null}
        short={buildBlock}
        onClick={() => (buildBlock ? warn(`Caça: ${buildBlock}`) : runtime.send({ type: 'build_aircraft', buildingId: unitId, aircraftType: 'fighter' }))}
        title={`Produz um caça no porta-aviões pelo preço normal (${formatUsd(def.usd)} + materiais e um recruta como piloto). Cabem ${max}.`}
      >
        <CostLabel cost={def.cost} have={ctx.resources} compact />
      </CardButton>
      <CardButton
        icon="🎯"
        label="Ataque aéreo"
        blocked={strikeBlock !== null}
        short={strikeBlock}
        onClick={() => (strikeBlock ? warn(`Ataque aéreo: ${strikeBlock}`) : runtime.startAirTarget('strike', unitId, fighters.slice(0, 4)))}
        title="Ataque com os caças prontos do convés contra um edifício inimigo já descoberto, em guerra e no alcance."
      />
    </>
  );
}

// ------------------------------------------------------------------ silo de mísseis

export function SiloInfo({ b }: { b: SelectedBuildingInfo }) {
  const air = useHudStore((s) => s.air);
  const silo = air?.silos.find((x) => x.id === b.id);
  const launches = (air?.launches ?? []).filter((l) => l.siloId === b.id && l.owner === useHudStore.getState().mySlot);
  const active = launches.find((l) => l.state === 'preparing' || l.state === 'armed' || l.state === 'launching' || l.state === 'flight');
  const last = !active ? launches.at(-1) : undefined;
  return (
    <div className="mt-1.5 text-xs">
      <div className="text-ink-400">
        Mísseis no silo: <span className="font-mono text-ink-100">{silo?.missiles ?? 0}</span>/{MISSILE.capacityPerSilo}
        {(silo?.nuclear ?? 0) > 0 && <span className="text-red-300"> (☢ {silo!.nuclear} nuclear)</span>}
        {silo && silo.building > 0 && (
          <span>
            {' '}
            · produzindo{silo.buildingNuclear ? ' ogiva nuclear' : ''} <Bar value={silo.building} /> {Math.round(silo.building * 100)}%
          </span>
        )}
      </div>
      {active && (
        <div className={`mt-1 rounded border px-2 py-1 ${active.state === 'armed' ? 'border-red-500/70 bg-red-950/40 text-red-200' : 'border-brass-400/50 text-ink-100'}`} role="status">
          <div className="font-semibold">
            Lançamento #{active.id}: {LAUNCH_STATE[active.state]}
          </div>
          {(active.state === 'preparing' || active.state === 'launching' || active.state === 'flight') && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
              <Bar value={active.progress} tone={active.state === 'flight' ? 'bg-red-400' : 'bg-brass-400'} /> {Math.round(active.progress * 100)}%
            </div>
          )}
          {active.state === 'armed' && <div className="mt-0.5 text-[11px]">Segure o botão vermelho para autorizar, ou aborte para devolver o míssil ao silo.</div>}
        </div>
      )}
      {last && (last.state === 'impact' || last.state === 'intercepted' || last.state === 'aborted') && (
        <div className="mt-1 text-[11px] text-ink-400">Último lançamento: {LAUNCH_STATE[last.state].toLowerCase()}</div>
      )}
    </div>
  );
}

/** Domo de Ferro: interceptadores prontos, recarga do próximo e espera dos lançadores. */
export function DomeInfo({ b }: { b: SelectedBuildingInfo }) {
  const dome = useHudStore((s) => s.air?.domes?.find((x) => x.id === b.id));
  if (!dome) return null;
  const pairs = Math.floor(dome.ready / IRON_DOME.perEngagement);
  return (
    <div className="mt-1.5 text-xs">
      <div className="text-ink-400">
        Interceptadores: <span className="font-mono text-ink-100">{dome.ready}</span>/{dome.max}
        <span> · {pairs === 1 ? '1 interceptação pronta' : `${pairs} interceptações prontas`}</span>
      </div>
      {dome.ready < dome.max && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400">
          Recarregando o próximo <Bar value={dome.reload} /> {Math.round(dome.reload * 100)}%
        </div>
      )}
      {dome.cooldown > 0 && <div className="mt-0.5 text-[11px] text-amber-300">Lançadores se preparando: {Math.ceil(dome.cooldown)} s</div>}
      <div className="mt-0.5 text-[11px] text-ink-400">
        Protege até {IRON_DOME.range} de distância contra o míssil balístico comum. Não detém o míssil pesado nem a ogiva nuclear.
      </div>
    </div>
  );
}

export function SiloButtons({ b, runtime }: { b: SelectedBuildingInfo; runtime: GameRuntime }) {
  const air = useHudStore((s) => s.air);
  const mySlot = useHudStore((s) => s.mySlot);
  const ctx = useMe();
  const silo = air?.silos.find((x) => x.id === b.id);
  const active = (air?.launches ?? []).find((l) => l.siloId === b.id && l.owner === mySlot && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching'));
  const missiles = silo?.missiles ?? 0;
  const full = missiles + (active ? 1 : 0) >= MISSILE.capacityPerSilo;
  const buildBlock = !(ctx.techs as readonly string[]).includes(MISSILE.tech)
    ? 'exige pesquisa'
    : silo && silo.building > 0
      ? 'em produção'
      : full
        ? 'silo cheio'
        : !canAfford(ctx.resources, MISSILE.cost)
          ? 'recursos insuficientes'
          : ctx.fund !== null && ctx.fund < MISSILE.usd
            ? 'verba insuficiente'
            : null;
  const nukes = silo?.nuclear ?? 0;
  const prepBlock = missiles - nukes < 1 ? 'sem míssil' : active ? 'em andamento' : null;
  const gen = buildingEffects('missile_silo', b.level).missileGen;
  const spec = missileSpec(gen);
  const hasNukeTech = (ctx.techs as readonly string[]).includes(NUCLEAR.tech);
  const nukeBuildBlock = !hasNukeTech
    ? 'exige Armas nucleares'
    : silo && silo.building > 0
      ? 'em produção'
      : full
        ? 'silo cheio'
        : !canAfford(ctx.resources, NUCLEAR.cost)
          ? 'recursos insuficientes'
          : ctx.fund !== null && ctx.fund < NUCLEAR.usd
            ? 'verba insuficiente'
            : null;
  const nukePrepBlock = nukes < 1 ? 'sem ogiva nuclear' : active ? 'em andamento' : null;
  return (
    <>
      <CardButton
        icon="🚀"
        label="Produzir míssil"
        blocked={buildBlock !== null}
        short={buildBlock}
        onClick={() => (buildBlock ? warn(`Míssil: ${buildBlock}`) : runtime.send({ type: 'build_missile', buildingId: b.id }))}
        title={`${gen >= 2 ? 'Míssil pesado de nova geração' : 'Míssil balístico'}: ${formatUsd(MISSILE.usd)} + materiais · ${timeText(MISSILE.buildSeconds)} · dano ${spec.damage} em área (raio ${String(spec.radius).replace('.', ',')}), interceptável pela antiaérea do alvo${gen >= 2 ? ' (mais difícil de interceptar)' : ''}.`}
      >
        <CostLabel cost={MISSILE.cost} have={ctx.resources} compact />
      </CardButton>
      {!active && (
        <CardButton
          icon="⌖"
          label="Preparar lançamento"
          blocked={prepBlock !== null}
          short={prepBlock}
          onClick={() => (prepBlock ? warn(`Lançamento: ${prepBlock}`) : runtime.startAirTarget('missile', b.id))}
          title={`Escolha o alvo: qualquer ponto já explorado fora da sua fronteira, dentro do anel de alcance (${launcherRange('silo', gen)}); no território de outra nação, só em guerra. A preparação leva ${spec.prepareSeconds}s e o lançamento ainda exige autorização.`}
        />
      )}
      {hasNukeTech && (
        <CardButton
          icon="☢"
          label="Ogiva nuclear"
          blocked={nukeBuildBlock !== null}
          short={nukeBuildBlock}
          onClick={() => (nukeBuildBlock ? warn(`Ogiva nuclear: ${nukeBuildBlock}`) : runtime.send({ type: 'build_missile', buildingId: b.id, nuclear: true }))}
          title={`Míssil com ogiva nuclear: ${formatUsd(NUCLEAR.usd)} + materiais · ${timeText(NUCLEAR.buildSeconds)} · dano ${NUCLEAR.damage} em raio ${NUCLEAR.radius}. Todo lançamento derruba a economia de todos os países por meses, inclusive a nossa.`}
        >
          <CostLabel cost={NUCLEAR.cost} have={ctx.resources} compact />
        </CardButton>
      )}
      {!active && nukes > 0 && (
        <CardButton
          icon="☢"
          label="Lançamento nuclear"
          blocked={nukePrepBlock !== null}
          short={nukePrepBlock}
          onClick={() => (nukePrepBlock ? warn(`Lançamento nuclear: ${nukePrepBlock}`) : runtime.startAirTarget('missile', b.id, [], true))}
          title="Escolha o alvo do míssil nuclear. Depois da preparação, a autorização exige manter pressionado. Choque econômico global por meses e perda enorme de reputação."
        />
      )}
      {active && (active.state === 'preparing' || active.state === 'armed') && (
        <CardButton icon="⏹" label="Abortar" onClick={() => runtime.send({ type: 'missile_abort', launchId: active.id })} title="Aborta o lançamento: o míssil volta ao silo." />
      )}
      {active?.state === 'armed' && <HoldToConfirm label="Autorizar lançamento" onConfirm={() => runtime.send({ type: 'missile_authorize', launchId: active.id })} />}
    </>
  );
}

/**
 * Confirmação segura: é preciso manter pressionado por 1,5 s (dedo, mouse ou Enter/Espaço). Um
 * toque acidental, rolagem ou arrasto que sai do botão cancela — nada é lançado por engano.
 */
export function HoldToConfirm({ label, onConfirm, ms = 1500 }: { label: string; onConfirm: () => void; ms?: number }) {
  const [p, setP] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef(0);
  const timer = useRef(0);
  const done = useRef(false);
  const confirm = () => {
    done.current = true;
    start.current = null;
    cancelAnimationFrame(raf.current);
    window.clearTimeout(timer.current);
    setP(1);
    navigator.vibrate?.([30, 40, 60]);
    onConfirm();
  };
  /** Soltar: se o tempo já foi cumprido (aparelho lento que atrasou o temporizador), confirma. */
  const release = (e: { timeStamp: number }) => {
    if (start.current !== null && e.timeStamp - start.current >= ms) return confirm();
    stop();
  };
  const stop = () => {
    start.current = null;
    cancelAnimationFrame(raf.current);
    window.clearTimeout(timer.current);
    if (!done.current) setP(0);
  };
  const begin = () => {
    if (start.current !== null) return;
    done.current = false;
    start.current = performance.now();
    audio.ui('hold');
    // a confirmação vem de um temporizador (independe da taxa de quadros); o quadro só anima a barra
    timer.current = window.setTimeout(() => start.current !== null && confirm(), ms);
    const tick = () => {
      if (start.current === null) return;
      setP(Math.min(1, (performance.now() - start.current) / ms));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      className="cmd-btn cmd-card relative shrink-0 overflow-hidden border-red-500/80 text-red-100"
      style={{ touchAction: 'none' }}
      aria-label={`${label}: mantenha pressionado`}
      title={`${label}: mantenha pressionado por ${ms / 1000}s`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={release}
      onPointerCancel={stop}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={release}
      onBlur={stop}
    >
      <span className="absolute inset-x-0 bottom-0 bg-red-600/60" style={{ height: `${p * 100}%` }} aria-hidden />
      <span className="cmd-card-view relative" aria-hidden>
        <span className="text-xl">☢</span>
      </span>
      <span className="cmd-card-label relative">{p >= 1 ? 'Autorizado' : 'Segure para autorizar'}</span>
    </button>
  );
}

/** Dica do modo de escolha de alvo (e confirmação do alvo do míssil). */
export function airTargetText(purpose: 'recon' | 'strike' | 'missile' | 'drone' | 'paradrop', touch: boolean, hasTarget: boolean, missileGen = 1): { title: string; text: string } {
  const act = touch ? 'Toque' : 'Clique';
  if (purpose === 'paradrop') return { title: 'Salto de paraquedistas', text: `${act} no ponto do salto, dentro do anel de alcance (fora da sua fronteira, só em guerra com o dono). As tropas paradas perto da base embarcam no C-5.` };
  if (purpose === 'drone') return { title: 'Drone de ataque', text: `${act} no ponto do ataque, dentro do anel de alcance. Depois, ${touch ? 'toque no drone' : 'clique no drone ou aperte T'} nos primeiros ${DRONE.takeoverSeconds}s para pilotar (opcional).` };
  if (purpose === 'recon') return { title: 'Reconhecimento aéreo', text: `${act} no ponto a reconhecer, dentro do anel de alcance. Botão direito ou Cancelar desiste.` };
  if (purpose === 'strike') return { title: 'Ataque aéreo', text: `${act} num edifício inimigo já descoberto, dentro do anel de alcance.` };
  return hasTarget
    ? { title: 'Alvo do míssil marcado', text: `Confira o anel vermelho. Confirmar inicia a preparação (${missileSpec(missileGen).prepareSeconds}s de abastecimento); o lançamento ainda exige autorização.` }
    : { title: 'Alvo do míssil', text: `${act} no alvo, dentro do anel de alcance: qualquer ponto já explorado fora da sua fronteira (no território de outra nação, só em guerra). Dano em área.` };
}

/** Submarino Lançador (03/11): mísseis a bordo, preparação, autorização e aborto, como no silo. */
export function SubMissileButtons({ unitId, missiles, runtime }: { unitId: number; missiles: number; runtime: GameRuntime }) {
  const air = useHudStore((s) => s.air);
  const mySlot = useHudStore((s) => s.mySlot);
  const active = (air?.launches ?? []).find((l) => l.siloId === unitId && l.owner === mySlot && (l.state === 'preparing' || l.state === 'armed' || l.state === 'launching'));
  const block = missiles < 1 ? 'sem mísseis' : active ? 'em andamento' : null;
  return (
    <>
      {!active && (
        <CardButton
          icon="⌖"
          label={`Míssil de cruzeiro (${missiles})`}
          blocked={block !== null}
          short={block}
          onClick={() => (block ? useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text: `Míssil: ${block}`, tone: 'warn' }) : runtime.startAirTarget('missile', unitId))}
          title={`Míssil de cruzeiro convencional: qualquer ponto já explorado fora da sua fronteira a até ${CRUISE.range} do submarino (anel no mapa); dano ${CRUISE.damage} em raio ${String(CRUISE.radius).replace('.', ',')}. Preparação de ${CRUISE.prepareSeconds}s e autorização. Recarrega junto a um Porto seu (um a cada ${CRUISE.reloadSeconds}s, pagando o míssil).`}
        />
      )}
      {active && (active.state === 'preparing' || active.state === 'armed') && (
        <CardButton icon="⏹" label="Abortar" onClick={() => runtime.send({ type: 'missile_abort', launchId: active.id })} title="Aborta o lançamento: o míssil volta ao submarino." />
      )}
      {active?.state === 'armed' && <HoldToConfirm label="Autorizar lançamento" onConfirm={() => runtime.send({ type: 'missile_authorize', launchId: active.id })} />}
    </>
  );
}
