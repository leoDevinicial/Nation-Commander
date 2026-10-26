import { useEffect, useRef, useState } from 'react';
import { canAfford, emptyStockpile } from '../../../shared/sim/config.ts';
import { AIR, AIRCRAFT, AIRCRAFT_TYPES, MISSILE, type AircraftState, type AircraftType, type LaunchState } from '../../../shared/sim/air.ts';
import { TECHNOLOGIES } from '../../../shared/strategic/technologies.ts';
import { formatUsd } from '../../../shared/sim/upgrades.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { useHudStore, type SelectedBuildingInfo } from '../../state/useHudStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { CostLabel } from '../components/Resources.tsx';
import { CardButton } from './CardButton.tsx';

const ICON: Record<AircraftType, string> = { fighter: '✈', recon: '🔭', transport: '📦' };
const SHORT: Record<AircraftType, string> = { fighter: 'Caça', recon: 'Reconhecimento', transport: 'Cargueiro' };
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
  return { resources: me?.resources ?? emptyStockpile(), recruits: me?.population?.recruits ?? 0, techs: nation?.research.done ?? [], fund: nation?.works.fundUsd ?? null };
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

function aircraftBlocker(type: AircraftType, ctx: ReturnType<typeof useMe>, inHangar: number): string | null {
  const def = AIRCRAFT[type];
  if (inHangar >= AIR.hangarPerBase) return 'hangar cheio';
  if (ctx.recruits < 1) return 'sem piloto (recruta)';
  if (!canAfford(ctx.resources, def.cost)) return 'recursos insuficientes';
  if (ctx.fund !== null && ctx.fund < def.usd) return 'verba de obras insuficiente';
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
  const strikeBlock = !ctx.techs.includes('guided_munitions') ? `exige ${TECHNOLOGIES.guided_munitions.label}` : fighters.length === 0 ? 'nenhum caça pronto' : null;
  return (
    <>
      {AIRCRAFT_TYPES.map((t) => {
        const def = AIRCRAFT[t];
        const blocker = aircraftBlocker(t, ctx, planes.length);
        return (
          <CardButton
            key={t}
            icon={ICON[t]}
            label={SHORT[t]}
            blocked={blocker !== null}
            short={blocker}
            count={planes.filter((a) => a.type === t && a.state === 'building').length}
            onClick={() => (blocker ? warn(`${def.label}: ${blocker}`) : runtime.send({ type: 'build_aircraft', buildingId: b.id, aircraftType: t }))}
            title={`${def.label} — ${def.role}\nCusto: ${formatUsd(def.usd)} da verba de obras + materiais + 1 piloto · ${def.buildSeconds}s${def.range ? `\nAlcance ${def.range} · manutenção ${def.maintenanceSeconds}s após cada missão` : ''}`}
          >
            <CostLabel cost={def.cost} have={ctx.resources} compact />
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
        title={`Ataque com os caças prontos (até 4) contra um edifício inimigo já descoberto, em guerra e no alcance. Antiaérea e caças inimigos podem derrubar aeronaves; o dano costuma ser parcial.`}
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
        {silo && silo.building > 0 && (
          <span>
            {' '}
            · produzindo <Bar value={silo.building} /> {Math.round(silo.building * 100)}%
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
  const prepBlock = missiles < 1 ? 'sem míssil' : active ? 'em andamento' : null;
  return (
    <>
      <CardButton
        icon="🚀"
        label="Produzir míssil"
        blocked={buildBlock !== null}
        short={buildBlock}
        onClick={() => (buildBlock ? warn(`Míssil: ${buildBlock}`) : runtime.send({ type: 'build_missile', buildingId: b.id }))}
        title={`Míssil balístico: ${formatUsd(MISSILE.usd)} + materiais · ${MISSILE.buildSeconds}s · dano em área (raio ${MISSILE.radius}), interceptável pela antiaérea do alvo.`}
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
          title="Escolha o alvo (território de um país em guerra, à vista ou junto de um edifício descoberto). A preparação leva 10s e o lançamento ainda exige autorização."
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
export function airTargetText(purpose: 'recon' | 'strike' | 'missile', touch: boolean, hasTarget: boolean): { title: string; text: string } {
  const act = touch ? 'Toque' : 'Clique';
  if (purpose === 'recon') return { title: 'Reconhecimento aéreo', text: `${act} no ponto a reconhecer, dentro do anel de alcance. Botão direito ou Cancelar desiste.` };
  if (purpose === 'strike') return { title: 'Ataque aéreo', text: `${act} num edifício inimigo já descoberto, dentro do anel de alcance.` };
  return hasTarget
    ? { title: 'Alvo do míssil marcado', text: `Confira o anel vermelho. Confirmar inicia a preparação (${MISSILE.prepareSeconds}s de abastecimento); o lançamento ainda exige autorização no silo.` }
    : { title: 'Alvo do míssil', text: `${act} no alvo: território de um país com quem você está em guerra, à vista ou junto de um edifício descoberto.` };
}
