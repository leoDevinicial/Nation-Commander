import { useState } from 'react';
import {
  BUILDINGS,
  CITIZEN,
  MILITARY_RESEARCH,
  MILITARY_RESEARCH_IDS,
  militaryResearchBlocker,
  RECRUIT,
  DEPOSIT_SIZE_LABELS,
  OIL_TANK_RANGE,
  RESOURCE_LABELS,
  UNITS,
  PRODUCTION_QUEUE_LIMIT,
  canAfford,
  emptyStockpile,
  type BuildingType,
  type MilitaryResearchId,
  type ProducibleType,
  type Stockpile,
  type UnitType,
} from '../../../shared/sim/config.ts';
import { checkProduce } from '../../../shared/sim/production.ts';
import { MODS, equipmentTag, unitStatLines, type ModId } from '../../../shared/sim/modernization.ts';
import { TECHNOLOGIES } from '../../../shared/strategic/technologies.ts';
import type { BuildingStatus } from '../../../shared/sim/types.ts';
import { CostLabel, ResourceIcon } from '../components/Resources.tsx';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { CardButton } from './CardButton.tsx';
import { AirbaseButtons, AirbaseInfo, SiloButtons, SiloInfo, airTargetText } from './AirPanels.tsx';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { buildingEffects, formatUsd as usdShort, specDef, upgradeTrack } from '../../../shared/sim/upgrades.ts';
import { effectiveMilitaryResearch, effectivePopCap, effectiveTechs, timeText } from '../../state/sandbox.ts';

const EMPTY_TECHS: readonly string[] = [];

const BUILD_OPTIONS: BuildingType[] = [
  'house',
  'farm',
  'sawmill',
  'quarry',
  'mine',
  'oil_well',
  'oil_tank',
  'warehouse',
  'silo',
  'barracks',
  'factory',
  'research_center',
  'tower',
  'residential',
  'market',
  'rail_station',
  'port',
  'airbase',
  'aa_battery',
  'missile_silo',
];
const EMPTY: Stockpile = emptyStockpile();

/** Motivo legível de um edifício parado, com o que fazer. */
export const STATUS_TEXT: Record<BuildingStatus, string> = {
  ok: 'Operando',
  no_workers: 'Parado: sem trabalhadores — forme cidadãos ou realoque',
  storage_full: 'Parado: armazenamento cheio — construa armazéns, silos ou tanques',
  no_tank: `Parado: sem Tanque de Petróleo a até ${OIL_TANK_RANGE} células`,
  depleted: 'Depósito esgotado — construa em outro depósito',
  outside_territory: 'Parado: os recursos ficaram fora do seu território',
  unpaid: 'Sem manutenção paga (faltam suprimentos): não abriga ninguém',
};

/** Cidadãos selecionados no mapa e como mandá-los trabalhar. */
function CitizensInfo({ sel, touch }: { sel: { idle: number; going: number }; touch: boolean }) {
  const n = sel.idle + sel.going;
  return (
    <div className="text-xs leading-relaxed text-ink-400">
      <div className="mb-1 text-sm font-semibold text-ink-200">{n === 1 ? 'Cidadão selecionado' : `${n} cidadãos selecionados`}</div>
      <div>
        {sel.idle > 0 && `${sel.idle} ocioso${sel.idle > 1 ? 's' : ''}`}
        {sel.idle > 0 && sel.going > 0 && ' · '}
        {sel.going > 0 && `${sel.going} a caminho do trabalho`}
      </div>
      <div className="mt-1">
        {touch ? 'Toque longo' : 'Botão direito'} numa construção com vagas (fazenda, serraria, pedreira, mina, poço, fábrica…): eles vão até lá e entram para trabalhar. No chão: caminham até o ponto.
      </div>
    </div>
  );
}

const ACTIVITY: Record<string, string> = {
  idle: 'Parada',
  moving: 'Movendo',
  chasing: 'Perseguindo',
  attacking: 'Atacando',
};

export function CommandPanel({ runtime }: { runtime: GameRuntime }) {
  const units = useHudStore((s) => s.selectedUnits);
  const building = useHudStore((s) => s.selectedBuilding);
  const inspected = useHudStore((s) => s.inspected);
  const citizens = useHudStore((s) => s.selectedCitizens);
  const mode = useHudStore((s) => s.mode);
  const players = useHudStore((s) => s.players);
  const mySlot = useHudStore((s) => s.mySlot);
  const resources = players.find((p) => p.slot === mySlot)?.resources ?? EMPTY;
  const touch = useHudStore((s) => s.touchUi);
  const thumbs = useHudStore((s) => s.thumbs);
  const [help, setHelp] = useState(false);
  const techs = effectiveTechs(useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.research.done ?? EMPTY_TECHS));

  return (
    <div
      className="panel pointer-events-auto flex min-w-0 flex-1 flex-col gap-2 p-2 sm:h-[212px] sm:flex-row sm:gap-3 sm:p-3 [@media(max-height:520px)]:h-auto [@media(max-height:520px)]:max-h-[140px] [@media(max-height:520px)]:flex-row [@media(max-height:520px)]:gap-2 [@media(max-height:520px)]:p-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex min-w-0 flex-1 gap-2 sm:gap-3">
        {/* fila de produção à esquerda, sempre visível nos edifícios que produzem */}
        {mode.kind === 'normal' && units.length === 0 && building && building.progress >= 1 && PRODUCERS.includes(building.type) && <QueueColumn b={building} runtime={runtime} />}
        <div className="scroll-thin max-h-24 min-w-0 flex-1 overflow-y-auto sm:max-h-none [@media(max-height:520px)]:max-h-none">
          {mode.kind === 'place' && (
            <div>
              <ModeHint
                title={`Posicionar ${BUILDINGS[mode.buildingType].label}`}
                text={
                  !mode.valid
                    ? `Posição inválida: ${mode.reason ?? '—'}`
                    : touch
                      ? 'Toque no mapa para posicionar; toque de novo no mesmo lugar ou em Confirmar para construir.'
                      : 'Clique esquerdo para construir. Botão direito ou Esc cancela.'
                }
                bad={!mode.valid}
              />
              <div className="mt-1.5 text-xs text-ink-400">
                Custo: <CostLabel cost={BUILDINGS[mode.buildingType].cost} have={resources} />
              </div>
              {mode.yield && BUILDINGS[mode.buildingType].gather && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-200">
                  <ResourceIcon type={BUILDINGS[mode.buildingType].gather!.resource} />
                  {BUILDINGS[mode.buildingType].gather!.terrain === null
                    ? `Rende +${mode.yield.rate.toFixed(1)}/s`
                    : `${mode.yield.cells} de ${BUILDINGS[mode.buildingType].gather!.maxCells} células livres ao alcance → +${mode.yield.rate.toFixed(1)} ${RESOURCE_LABELS[BUILDINGS[mode.buildingType].gather!.resource].toLowerCase()}/s`}
                </div>
              )}
            </div>
          )}
          {mode.kind === 'air_target' && <ModeHint {...airTargetText(mode.purpose, touch, mode.target !== null)} />}
          {mode.kind === 'attack_move' && <ModeHint title="Avançar atacando" text={`${touch ? 'Toque' : 'Clique'} no destino. As unidades atacam o que encontrarem pelo caminho.`} />}
          {mode.kind === 'normal' && units.length > 0 && <UnitsInfo units={units} />}
          {mode.kind === 'normal' && units.length === 0 && building && <BuildingInfo b={building} runtime={runtime} />}
          {mode.kind === 'normal' && units.length === 0 && !building && citizens && <CitizensInfo sel={citizens} touch={touch} />}
          {mode.kind === 'normal' && units.length === 0 && !building && !citizens && inspected && (
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: factionColor(inspected.owner) }} aria-hidden />
                {inspected.kind === 'unit' ? UNITS[inspected.type as UnitType].label : BUILDINGS[inspected.type as BuildingType].label}
                <span className="text-xs text-red-300">(rival)</span>
              </div>
              <HpLine hp={inspected.hp} max={inspected.maxHp} />
              {inspected.kind === 'building' && inspected.level > 1 && (
                <div className="mt-1 text-xs text-ink-400">
                  Nível {inspected.level}
                  {inspected.spec ? ` · ${specDef(inspected.type as BuildingType, inspected.spec)?.label ?? ''}` : ''}
                </div>
              )}
              <WarStatus owner={inspected.owner} mySlot={mySlot} />
            </div>
          )}
          {mode.kind === 'normal' && units.length === 0 && !building && !citizens && !inspected && touch && (
            <div className="text-xs leading-relaxed text-ink-400">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink-200">Nenhuma seleção</span>
                <button className="btn min-h-7 px-2 py-0.5 text-[11px]" aria-expanded={help} onClick={() => setHelp(!help)}>
                  {help ? 'Menos Ajuda' : 'Ajuda'}
                </button>
              </div>
              {help ? (
                <>
                  Toque para selecionar · dois toques: todas do tipo · toque longo: mover/atacar · arraste: câmera · pinça: zoom · gire dois dedos: rotação. Ferramentas à direita: Ordem, Área (seleção
                  por retângulo), Somar e QG. Toque no Centro de Comando para construir.
                </>
              ) : (
                'Toque: selecionar · toque longo: ordem · arraste: câmera · pinça: zoom'
              )}
            </div>
          )}
          {mode.kind === 'normal' && units.length === 0 && !building && !citizens && !inspected && !touch && (
            <div className="text-xs leading-relaxed text-ink-400">
              <div className="mb-1 text-sm font-semibold text-ink-200">Nenhuma seleção</div>
              Clique ou arraste para selecionar · Botão direito: mover/atacar · F: avançar atacando · X: parar · H: Centro de Comando · Ctrl+1–9: grupos · WASD/setas: câmera · Q/E: girar · Roda: zoom
              · Espaço: pausa · G: painel nacional. Selecione o Centro de Comando para construir: fazendas no solo fértil, serrarias junto à floresta, pedreiras junto às rochas e poços sobre o
              petróleo.
            </div>
          )}
        </div>
      </div>
      <div className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto pt-1 sm:grid sm:grid-cols-4 sm:content-start sm:overflow-x-visible sm:overflow-y-auto [@media(max-height:520px)]:grid [@media(max-height:520px)]:grid-cols-4 [@media(max-height:520px)]:content-start [@media(max-height:520px)]:overflow-y-auto">
        {units.length > 0 && mode.kind === 'normal' && (
          <>
            <CardButton icon="⚔" hotkey="F" label="Avançar atacando" onClick={() => runtime.startAttackMove()} title="Avançar atacando (F)" />
            <CardButton icon="■" hotkey="X" label="Parar" onClick={() => runtime.stopSelected()} title="Parar (X)" />
            <ModernizeButtons runtime={runtime} />
          </>
        )}
        {mode.kind === 'place' && touch && (
          <CardButton thumb={thumbs[mode.buildingType]} icon="✔" label="Confirmar" disabled={!mode.valid} onClick={() => runtime.confirmPlacement()} title="Construir na posição marcada" />
        )}
        {mode.kind === 'air_target' && mode.purpose === 'missile' && (
          <CardButton
            icon="⌖"
            label="Confirmar alvo"
            disabled={!mode.target}
            onClick={() => runtime.confirmAirTarget()}
            title="Inicia a preparação do míssil para o alvo marcado (ainda exige autorização)"
          />
        )}
        {mode.kind !== 'normal' && <CardButton icon="✖" hotkey="Esc" label="Cancelar" onClick={() => runtime.cancelMode()} title="Cancelar (Esc)" />}
        {building?.type === 'hq' && mode.kind === 'normal' && runtime.battleOp === null && (
          <ProduceButton
            b={building}
            unit="citizen"
            hotkey={CITIZEN.hotkey}
            label="Cidadão"
            onRun={() => runtime.trainCitizen()}
            title={`Formar cidadão civil — trabalha nas construções (fazendas, poços de petróleo, serrarias, pedreiras, minas, fábricas). Exige vaga de moradia.\nTempo: ${timeText(CITIZEN.buildSeconds)}`}
          />
        )}
        {building?.type === 'hq' &&
          mode.kind === 'normal' &&
          runtime.battleOp === null &&
          BUILD_OPTIONS.map((type) => {
            const def = BUILDINGS[type];
            const techMissing = def.requiresTech && !(techs as readonly string[]).includes(def.requiresTech) ? def.requiresTech : null;
            const ok = canAfford(resources, def.cost) && !techMissing;
            return (
              <CardButton
                key={type}
                thumb={thumbs[type]}
                hotkey={def.hotkey}
                label={def.label}
                blocked={!ok}
                short={techMissing ? 'exige pesquisa' : null}
                onClick={() =>
                  ok
                    ? runtime.startPlacement(type)
                    : useHudStore.getState().pushEvent({
                        tick: useHudStore.getState().tick,
                        text: `${def.label}: ${techMissing ? `exige a pesquisa ${TECHNOLOGIES[techMissing as keyof typeof TECHNOLOGIES]?.label ?? techMissing}` : 'recursos insuficientes'}`,
                        tone: 'warn',
                      })
                }
                title={`${def.label} — ${def.description}\nTempo: ${timeText(def.buildSeconds)} · Vida: ${def.maxHp}${def.workers ? ` · Trabalhadores: ${def.workers}` : ''}${def.territoryRadius ? ` · Fronteira: ${def.territoryRadius} células` : ''}`}
              >
                <CostLabel cost={def.cost} have={resources} compact />
              </CardButton>
            );
          })}
        {building && building.progress >= 1 && mode.kind === 'normal' && runtime.battleOp === null && upgradeTrack(building.type) && <UpgradeButton runtime={runtime} b={building} />}
        {building && building.progress >= 1 && (building.type === 'barracks' || building.type === 'factory') && <ProduceButtons runtime={runtime} b={building} />}
        {building && building.progress >= 1 && mode.kind === 'normal' && building.type === 'research_center' && runtime.battleOp === null && <ResearchButtons runtime={runtime} b={building} />}
        {building && building.progress >= 1 && mode.kind === 'normal' && building.type === 'airbase' && <AirbaseButtons runtime={runtime} b={building} />}
        {building && building.progress >= 1 && mode.kind === 'normal' && building.type === 'missile_silo' && <SiloButtons runtime={runtime} b={building} />}
      </div>
    </div>
  );
}

/** Sem guerra formal não há ataque: mostra o estado e o atalho para o globo. */
function WarStatus({ owner, mySlot }: { owner: number; mySlot: number }) {
  const atWar = useNationalStore((s) => s.diplomacy?.wars.some(([a, b]) => (a === mySlot && b === owner) || (a === owner && b === mySlot)) ?? false);
  const country = useAppStore((s) => s.match?.players.find((p) => p.slot === owner)?.countryId);
  if (atWar) return <div className="mt-1.5 text-xs text-red-300">Em guerra: pode ser atacado.</div>;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
      Sem guerra declarada: nenhum dos lados pode atacar.
      <button className="btn min-h-7 px-2 py-0.5 text-[11px]" onClick={() => useNationalStore.getState().openGlobe(country ?? null)}>
        🌐 Abrir no Globo
      </button>
    </div>
  );
}

/** Abre o painel de melhoria (ou cancela a obra em andamento). */
function UpgradeButton({ runtime, b }: { runtime: GameRuntime; b: NonNullable<ReturnType<typeof useHudStore.getState>['selectedBuilding']> }) {
  const track = upgradeTrack(b.type)!;
  const thumb = useHudStore((s) => s.thumbs[b.type]);
  const open = () => useHudStore.getState().set({ upgradeFor: b.id });
  if (b.upgrade)
    return (
      <CardButton
        thumb={thumb}
        icon="🏗"
        label={`Obra Nv ${b.upgrade.toLevel}`}
        onClick={open}
        title="Obra de melhoria em andamento — abrir detalhes ou cancelar"
        badge={`${Math.round(b.upgrade.progress * 100)}%`}
      >
        <span className="text-[10px] text-brass-400">em obra</span>
      </CardButton>
    );
  const plan = runtime.upgradePlan(b.id);
  const max = b.level >= track.maxLevel;
  return (
    <CardButton
      thumb={thumb}
      icon="⬆"
      label={max ? 'Nível máximo' : `⬆ Nível ${b.level + 1}`}
      onClick={open}
      title={max ? 'Nível máximo atingido' : `Melhorar para o nível ${b.level + 1}${plan?.blocker ? `\n${plan.blocker}` : ''}`}
      badge={`Nv ${b.level}`}
    >
      {!max && plan && <span className={`text-[10px] font-semibold ${plan.blocker ? 'text-red-300' : 'text-signal-green'}`}>{usdShort(plan.usd)}</span>}
    </CardButton>
  );
}

type SelectedBuilding = NonNullable<ReturnType<typeof useHudStore.getState>['selectedBuilding']>;

/**
 * Botão de produção (cidadão, recruta ou unidade). Usa a mesma regra do servidor (`checkProduce`):
 * mostra o custo real e, quando bloqueado, o motivo curto no próprio botão ("sem recruta",
 * "faltam 20 petróleo", "fila cheia"). Um toque num botão bloqueado explica o motivo completo —
 * no celular não há dica de mouse. O selo "×N" conta quantos desse tipo já estão na fila.
 */
function ProduceButton({ b, unit, hotkey, label, title, onRun }: { b: SelectedBuilding; unit: ProducibleType; hotkey: string; label: string; title: string; onRun: () => void }) {
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const mySlot = useHudStore((s) => s.mySlot);
  const techs = effectiveTechs(useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.research.done ?? null));
  const check = checkProduce(unit, {
    buildingType: b.type,
    level: b.level,
    spec: b.spec,
    progress: b.progress,
    queueLength: b.queue.length,
    resources: me?.resources ?? emptyStockpile(),
    recruits: me?.population?.recruits ?? 0,
    popTotal: me?.population?.total ?? 0,
    popCap: effectivePopCap(me?.population?.cap ?? 0),
    techs,
    militaryResearch: effectiveMilitaryResearch(me?.militaryResearch ?? []),
  });
  const queued = b.queue.filter((q) => q.unitType === unit).length;
  const thumb = useHudStore((s) => s.thumbs[unit]);
  return (
    <CardButton
      thumb={thumb}
      hotkey={hotkey}
      label={label}
      blocked={check.blocker !== null}
      short={check.short}
      count={queued}
      onClick={() => {
        if (check.blocker) {
          useHudStore.getState().pushEvent({
            tick: useHudStore.getState().tick,
            text: `${label}: ${check.blocker}`,
            tone: 'warn',
          });
          return;
        }
        onRun();
      }}
      title={`${title}${check.mods.length ? `\nSai da linha com: ${check.mods.map((m) => MODS[m].label).join(', ')} (custo do equipamento incluído)` : ''}${check.basic ? '\nSem recursos para o equipamento de linha: sai básica (modernize depois numa instalação)' : ''}${check.blocker ? `\nBloqueado: ${check.blocker}` : ''}`}
    >
      <CostLabel cost={check.cost} have={me?.resources ?? emptyStockpile()} compact />
      {check.basic && <span className="text-[9px] leading-tight text-brass-400">sai básica</span>}
      {check.mods.length > 0 && (
        <span className="text-[9px] leading-tight text-signal-blue">
          Ger. {check.mods.length} · {check.mods.map((m) => MODS[m].short).join(' ')}
        </span>
      )}
    </CardButton>
  );
}

function ProduceButtons({ runtime, b }: { runtime: GameRuntime; b: SelectedBuilding }) {
  const options = (Object.keys(UNITS) as UnitType[]).filter((u) => UNITS[u].producedBy === b.type);
  const recruits = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot)?.population?.recruits ?? 0);
  return (
    <>
      {b.type === 'barracks' && (
        <ProduceButton
          b={b}
          unit="recruit"
          hotkey={RECRUIT.hotkey}
          label={`Recruta (${recruits})`}
          onRun={() => runtime.trainRecruit()}
          title={`Alistar recruta — vai para a reserva militar e é a tripulação de qualquer unidade (infantaria, blindado, tanque, artilharia). Exige vaga de moradia.\nTempo: ${timeText(RECRUIT.buildSeconds)} · Na reserva: ${recruits}`}
        />
      )}
      {options.map((u) => {
        const def = UNITS[u];
        return (
          <ProduceButton
            key={u}
            b={b}
            unit={u}
            hotkey={def.hotkey}
            label={def.label}
            onRun={() => runtime.produce(u)}
            title={`${def.label} — ${def.description}\nTripulação: 1 recruta (reserva: ${recruits}) · Tempo: ${timeText(def.buildSeconds)} · Vida: ${def.maxHp} · Dano: ${def.weapon.damage} · Alcance: ${def.weapon.range} · Visão: ${def.sight}${counterText(u)}`}
          />
        );
      })}
      <CardButton
        icon="↶"
        hotkey="Del"
        label="Cancelar último"
        disabled={b.queue.length === 0}
        onClick={() => runtime.cancelProduction()}
        title="Cancelar último item da fila (Delete) — reembolso integral"
      />
    </>
  );
}

/** Vantagens e fraquezas da arma (para a dica do botão). */
function counterText(u: UnitType): string {
  const w = UNITS[u].weapon;
  const parts: string[] = [];
  const fmt = (v: number) => `×${String(v).replace('.', ',')}`;
  if (w.vsVehicle && w.vsVehicle !== 1) parts.push(`${fmt(w.vsVehicle)} contra veículos`);
  if (w.vsInfantry && w.vsInfantry !== 1) parts.push(`${fmt(w.vsInfantry)} contra infantaria`);
  if (w.vsBuilding && w.vsBuilding !== 1) parts.push(`${fmt(w.vsBuilding)} contra edifícios`);
  if (w.splash) parts.push(`dano em área (raio ${String(w.splash).replace('.', ',')})`);
  if (UNITS[u].airDefense) parts.push('defesa antiaérea por perto');
  return parts.length ? `\nDano: ${parts.join(' · ')}` : '';
}

/**
 * Centro de Pesquisa Militar: uma pesquisa por vez, com custo, tempo, pré-requisitos e o nível do
 * centro; cada botão mostra o que libera e, bloqueado, o motivo. A pesquisa em andamento mostra o
 * progresso e pode ser cancelada (devolve 75%).
 */
function ResearchButtons({ runtime, b }: { runtime: GameRuntime; b: SelectedBuilding }) {
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const thumbs = useHudStore((s) => s.thumbs);
  const done = effectiveMilitaryResearch(me?.militaryResearch ?? []);
  const resources = me?.resources ?? emptyStockpile();
  const unlockOf = (id: MilitaryResearchId) => (Object.keys(UNITS) as UnitType[]).find((u) => UNITS[u].requires === id)!;
  return (
    <>
      {MILITARY_RESEARCH_IDS.map((id) => {
        const def = MILITARY_RESEARCH[id];
        const unit = unlockOf(id);
        const current = b.research?.id === id;
        const isDone = done.includes(id);
        const blocker = isDone ? 'Pesquisa já concluída' : b.research && !current ? 'O centro já está pesquisando outra coisa' : militaryResearchBlocker(id, done, b.level);
        const short = isDone ? 'concluída' : current ? null : blocker ? (blocker.startsWith('Requer o Centro') ? `nível ${def.tier}` : blocker.startsWith('Requer:') ? 'pré-requisito' : 'ocupado') : null;
        const ok = !blocker && !current && canAfford(resources, def.cost);
        return (
          <CardButton
            key={id}
            thumb={thumbs[unit]}
            hotkey={def.hotkey}
            label={def.label}
            blocked={!ok && !current}
            short={short ?? (!current && !canAfford(resources, def.cost) ? 'recursos' : null)}
            badge={current ? `${Math.round((b.research?.progress ?? 0) * 100)}%` : isDone ? '✔' : undefined}
            onClick={() => {
              if (current) return runtime.cancelMilitaryResearch();
              if (ok) return runtime.startMilitaryResearch(id);
              useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text: `${def.label}: ${blocker ?? 'recursos insuficientes'}`, tone: 'warn' });
            }}
            title={`${def.label} — ${def.description}\nLibera: ${UNITS[unit].label} (${UNITS[unit].producedBy === 'barracks' ? 'base militar' : 'fábrica'})\nTempo: ${timeText(def.seconds)} (com 3 pesquisadores; o orçamento nacional de P&D acelera)${def.prereqs.length ? `\nRequer: ${def.prereqs.map((p) => MILITARY_RESEARCH[p].label).join(', ')}` : ''}${def.tier > 1 ? `\nCentro de Pesquisa no nível ${def.tier}` : ''}${current ? '\nEm andamento — clique para cancelar (devolve 75%)' : blocker ? `\nBloqueado: ${blocker}` : ''}`}
          >
            {!isDone && !current && <CostLabel cost={def.cost} have={resources} compact />}
            {current && <span className="text-[10px] text-brass-400">cancelar</span>}
          </CardButton>
        );
      })}
    </>
  );
}

/** Nome de um item da fila de produção. */
export function producibleLabel(t: ProducibleType): string {
  return t === 'citizen' ? CITIZEN.label : t === 'recruit' ? RECRUIT.label : UNITS[t].label;
}

/** Ícone curto de um item da fila (texto, para não depender de emoji do sistema). */
export function producibleIcon(t: ProducibleType): string {
  const icons: Partial<Record<ProducibleType, string>> = {
    citizen: '☺',
    recruit: '🎖',
    tank: '▣',
    mbt: '◼',
    apc: '▤',
    artillery: '⟋',
    rocket_artillery: '⋰',
    mobile_aa: '⌖',
    at_infantry: '➹',
    special_forces: '✦',
  };
  return icons[t] ?? '●';
}

/** Edifícios com fila de produção (cidadãos, recrutas, unidades). */
const PRODUCERS: BuildingType[] = ['hq', 'barracks', 'factory'];

/**
 * Fila de produção em coluna, à esquerda do painel: o item em andamento em destaque (miniatura,
 * nome e progresso) e os próximos em miniaturas menores; espaços vazios mostram a capacidade.
 */
function QueueColumn({ b, runtime }: { b: SelectedBuilding; runtime: GameRuntime }) {
  const thumbs = useHudStore((s) => s.thumbs);
  const [first, ...rest] = b.queue;
  return (
    <div className="flex w-[84px] shrink-0 flex-col gap-1 border-r border-ink-700 pr-2 sm:w-[96px]" aria-label="Fila de produção">
      <div className="flex items-center justify-between text-[10px] text-ink-400">
        <span>Fila</span>
        <span className="font-mono">
          {b.queue.length}/{PRODUCTION_QUEUE_LIMIT}
        </span>
      </div>
      {first ? (
        <div className="rounded border border-brass-400/50 bg-ink-900/80 p-1" title={`Produzindo: ${producibleLabel(first.unitType)}`}>
          <div className="cmd-card-view !h-[40px] [@media(max-height:520px)]:!h-[26px]">
            {thumbs[first.unitType] ? <img src={thumbs[first.unitType]} alt="" /> : <span className="text-lg">{producibleIcon(first.unitType)}</span>}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-semibold text-ink-100">{producibleLabel(first.unitType)}</div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-ink-950">
            <div className="h-full bg-brass-400 transition-[width] duration-300" style={{ width: `${first.progress * 100}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex h-[70px] items-center justify-center rounded border border-dashed border-ink-700 text-center text-[10px] text-ink-400">Fila vazia</div>
      )}
      <div className="grid grid-cols-4 gap-0.5 [@media(max-height:520px)]:hidden">
        {Array.from({ length: PRODUCTION_QUEUE_LIMIT - 1 }, (_, i) => {
          const q = rest[i];
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center overflow-hidden rounded border ${q ? 'border-ink-600 bg-ink-850' : 'border-dashed border-ink-700'}`}
              title={q ? producibleLabel(q.unitType) : 'vazio'}
            >
              {q &&
                (thumbs[q.unitType] ? <img src={thumbs[q.unitType]} alt={producibleLabel(q.unitType)} className="max-h-full" /> : <span className="text-[10px]">{producibleIcon(q.unitType)}</span>)}
            </div>
          );
        })}
      </div>
      {b.queue.length > 0 && (
        <button
          className="btn min-h-7 px-1 py-0.5 text-[10px] whitespace-nowrap [@media(max-height:520px)]:min-h-6"
          onClick={() => runtime.cancelProduction()}
          title="Cancelar o último item da fila — reembolso integral"
        >
          ↶ Cancelar
        </button>
      )}
    </div>
  );
}

function ModeHint({ title, text, bad }: { title: string; text: string; bad?: boolean }) {
  return (
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <div className={`mt-1 text-xs ${bad ? 'text-red-300' : 'text-ink-400'}`}>{text}</div>
    </div>
  );
}

function HpLine({ hp, max }: { hp: number; max: number }) {
  const f = Math.max(0, Math.min(1, hp / max));
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs">
      <div className="h-2 w-40 overflow-hidden rounded bg-ink-950" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max} aria-label="Vida">
        <div
          className="h-full"
          style={{
            width: `${f * 100}%`,
            background: f > 0.6 ? '#5cc47a' : f > 0.3 ? '#e0b44c' : '#e05a4c',
          }}
        />
      </div>
      <span className="font-mono text-ink-200">
        {Math.ceil(hp)}/{max}
      </span>
    </div>
  );
}

const AREA_ICON: Record<string, string> = { Blindagem: '🛡', Precisão: '🎯', Comunicações: '📡', Detecção: '🔭', 'Mobilidade e logística': '⚙' };

/**
 * Botões de modernização da seleção (Fase 5): um por pacote liberado que alguma unidade ainda não
 * tem. Mostra quantas podem começar agora (×N), o custo por unidade e, se nenhuma pode, o motivo
 * curto — e um toque explica o motivo completo (pesquisa, instalação longe, baias cheias, verba).
 */
function ModernizeButtons({ runtime }: { runtime: GameRuntime }) {
  // recalculado a cada publicação do HUD (seleção, posições, saldo)
  useHudStore((s) => s.tick);
  const units = useHudStore((s) => s.selectedUnits);
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const options = runtime.modernizeOptions();
  const refitting = units.filter((u) => u.refit).length;
  return (
    <>
      {options.map((o) => {
        const def = MODS[o.mod];
        const blocked = o.readyIds.length === 0;
        return (
          <CardButton
            key={o.mod}
            icon={AREA_ICON[def.area] ?? '⬆'}
            label={def.label}
            blocked={blocked}
            short={o.short}
            badge={blocked ? undefined : `×${o.readyIds.length}`}
            onClick={() => {
              if (blocked) {
                useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text: `${def.label}: ${o.blocker ?? 'indisponível'}`, tone: 'warn' });
                return;
              }
              runtime.modernize(o.mod);
            }}
            title={`Modernizar: ${def.label} (${def.area}) — ${def.description}\nPesquisa: ${TECHNOLOGIES[def.tech].label}\n${o.readyIds.length} de ${o.applicable} unidade(s) podem começar agora · ${timeText(o.check.seconds)} parada(s) na instalação · ${usdShort(o.check.usd)} por unidade${o.blocker ? `\nBloqueado: ${o.blocker}` : ''}`}
          >
            <CostLabel cost={o.check.cost} have={me?.resources ?? emptyStockpile()} compact />
            {o.check.usd > 0 && <span className="text-[9px] text-signal-green">{usdShort(o.check.usd)}</span>}
          </CardButton>
        );
      })}
      {refitting > 0 && (
        <CardButton
          icon="↶"
          label="Cancelar moderniz."
          onClick={() => runtime.cancelModernize()}
          title={`Cancelar a modernização de ${refitting} unidade(s) — devolve metade dos materiais e da verba`}
          badge={`×${refitting}`}
        />
      )}
    </>
  );
}

/** Rótulo curto do pacote com a pesquisa de origem (dica). */
function ModChip({ mod }: { mod: ModId }) {
  const def = MODS[mod];
  return (
    <span className="rounded border border-signal-blue/40 bg-signal-blue/10 px-1 text-[10px] text-ink-100" title={`${def.label} (${def.area}) — pesquisa: ${TECHNOLOGIES[def.tech].label}`}>
      {AREA_ICON[def.area]} {def.label}
    </span>
  );
}

function UnitsInfo({ units }: { units: ReturnType<typeof useHudStore.getState>['selectedUnits'] }) {
  if (units.length === 1) {
    const u = units[0]!;
    const def = UNITS[u.type];
    // cada número com a origem do ganho: pacote instalado → pesquisa
    const lines = unitStatLines(u.type, u.mods, u.maxHp).filter((l) => l.key !== 'hp' && (l.key !== 'attrition' || l.value !== 100));
    return (
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
          {def.label}
          <span className="text-[10px] font-normal text-ink-400">{equipmentTag(u.type, u.mods)}</span>
        </div>
        <HpLine hp={u.hp} max={u.maxHp} />
        {u.refit && (
          <div className="mt-1 text-xs text-brass-400">
            Em modernização: {MODS[u.refit.mod].label} — {Math.round(u.refit.progress * 100)}% (parada na instalação)
            <div className="mt-0.5 h-1 overflow-hidden rounded bg-ink-950">
              <div className="h-full bg-brass-400" style={{ width: `${u.refit.progress * 100}%` }} />
            </div>
          </div>
        )}
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-ink-400">
          <dt>Estado</dt>
          <dd className="text-ink-200">{u.refit ? 'Em modernização' : (ACTIVITY[u.activity] ?? u.activity)}</dd>
          {lines.map((l) => (
            <FragmentStat key={l.key} label={l.label} base={l.base} value={l.value} unit={l.unit} sources={l.sources} />
          ))}
        </dl>
        {u.mods.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {u.mods.map((m) => (
              <ModChip key={m} mod={m} />
            ))}
          </div>
        )}
      </div>
    );
  }
  const counts = new Map<UnitType, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  const gens = new Map<number, number>();
  for (const u of units) gens.set(u.mods.length, (gens.get(u.mods.length) ?? 0) + 1);
  const refitting = units.filter((u) => u.refit).length;
  return (
    <div>
      <div className="text-sm font-semibold">{units.length} unidades</div>
      <div className="mt-1 text-xs text-ink-400">{[...counts].map(([t, n]) => `${n}× ${UNITS[t].label}`).join(' · ')}</div>
      <div className="mt-0.5 text-[10px] text-ink-400">
        Equipamento:{' '}
        {[...gens]
          .sort((a, b) => a[0] - b[0])
          .map(([g, n]) => `${n}× ${g === 0 ? 'padrão inicial' : `ger. ${g}`}`)
          .join(' · ')}
        {refitting > 0 && <span className="text-brass-400"> · {refitting} em modernização</span>}
      </div>
      <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-hidden">
        {units.slice(0, 40).map((u) => {
          const f = u.hp / u.maxHp;
          return (
            <div
              key={u.id}
              className={`relative flex h-7 w-7 flex-col justify-between rounded border bg-ink-850 p-0.5 ${u.refit ? 'border-brass-400' : 'border-ink-600'}`}
              title={`${UNITS[u.type].label} — ${Math.ceil(u.hp)} PV — ${equipmentTag(u.type, u.mods)}${u.refit ? ' — em modernização' : ''}`}
            >
              <span className="text-center text-[10px] leading-none">{u.type === 'tank' ? '▣' : '●'}</span>
              {u.mods.length > 0 && <span className="absolute -top-1 -right-1 rounded bg-signal-blue px-0.5 text-[8px] leading-3 text-ink-950">{u.mods.length}</span>}
              <span
                className="h-1 rounded"
                style={{
                  width: `${f * 100}%`,
                  background: f > 0.6 ? '#5cc47a' : f > 0.3 ? '#e0b44c' : '#e05a4c',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Linha de atributo: valor atual, base e de onde veio a diferença. */
function FragmentStat({ label, base, value, unit, sources }: { label: string; base: number; value: number; unit: string; sources: { label: string; tech: string; text: string }[] }) {
  const fmt = (v: number) => `${String(v).replace('.', ',')}${unit}`;
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-ink-200">
        {fmt(value)}
        {value !== base && <span className="text-ink-400"> (base {fmt(base)})</span>}
        {sources.length > 0 && (
          <span className="ml-1 text-[10px] text-signal-blue" title={sources.map((x) => `${x.label} ${x.text} — pesquisa: ${x.tech}`).join('\n')}>
            {sources.map((x) => `${x.text} ${x.label}`).join(' · ')}
          </span>
        )}
      </dd>
    </>
  );
}

function BuildingInfo({ b, runtime }: { b: NonNullable<ReturnType<typeof useHudStore.getState>['selectedBuilding']>; runtime: GameRuntime }) {
  const def = BUILDINGS[b.type];
  const done = b.progress >= 1;
  const track = upgradeTrack(b.type);
  const spec = specDef(b.type, b.spec);
  // valores do nível e da especialização atuais (os de base valem só no nível 1)
  const fx = buildingEffects(b.type, b.level, b.spec);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {def.label}
          {track && done && (
            <span className="ml-1.5 text-xs font-normal text-brass-400" title={spec ? `${spec.label}: ${spec.summary}` : undefined}>
              Nv {b.level}/{track.maxLevel}
              {spec ? ` · ${spec.label}` : ''}
            </span>
          )}
        </span>
        {done && b.status !== 'ok' && <span className="text-[11px] font-semibold text-brass-400">⚠ {STATUS_TEXT[b.status].split(':')[0]}</span>}
      </div>
      <HpLine hp={b.hp} max={b.maxHp} />
      {b.upgrade && (
        <div className="mt-1 flex items-center gap-2 text-xs text-brass-400">
          Obra para o nível {b.upgrade.toLevel}: {Math.round(b.upgrade.progress * 100)}% (opera a 50% durante a obra)
        </div>
      )}
      {!done ? (
        <div className="mt-2 text-xs text-ink-400">Em construção: {Math.round(b.progress * 100)}%</div>
      ) : b.status !== 'ok' ? (
        <div className="mt-1.5 text-xs text-brass-400">{STATUS_TEXT[b.status]}</div>
      ) : (
        <div className="mt-1.5 text-xs text-ink-400">{def.description}</div>
      )}
      {done && fx.workers > 0 && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-ink-400">Trabalhadores</span>
          <button className="btn min-h-7 px-2 py-0 text-xs" aria-label="Menos trabalhadores" disabled={b.workerTarget <= 0} onClick={() => runtime.setWorkers(b.id, b.workerTarget - 1)}>
            −
          </button>
          <span className="font-mono text-ink-100" title="Ocupados / alvo / postos">
            {b.workers}/{b.workerTarget}
            <span className="text-ink-400"> de {fx.workers}</span>
          </span>
          <button className="btn min-h-7 px-2 py-0 text-xs" aria-label="Mais trabalhadores" disabled={b.workerTarget >= fx.workers} onClick={() => runtime.setWorkers(b.id, b.workerTarget + 1)}>
            +
          </button>
        </div>
      )}
      {done && fx.income.supplies ? <div className="text-xs text-signal-green">Gera +{fx.income.supplies.toFixed(2)} suprimentos/s</div> : null}
      {done && Object.keys(fx.upkeep).length > 0 && (
        <div className="text-[11px] text-ink-400">
          Manutenção:{' '}
          {Object.entries(fx.upkeep)
            .map(([r, v]) => `${(v as number).toFixed(2)} ${RESOURCE_LABELS[r as keyof typeof RESOURCE_LABELS].toLowerCase()}/s`)
            .join(' · ')}
        </div>
      )}
      {done && def.gather && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-signal-green">
          <ResourceIcon type={def.gather.resource} />+{b.rate.toFixed(2)} {RESOURCE_LABELS[def.gather.resource].toLowerCase()}/s
          {def.gather.terrain !== null && <span className="text-ink-400">· {b.claims} células</span>}
        </div>
      )}
      {b.deposit && (
        <div className="text-[11px] text-ink-400">
          Depósito {DEPOSIT_SIZE_LABELS[b.deposit.size]} (até {b.deposit.maxSites} {b.deposit.maxSites === 1 ? 'instalação' : 'instalações'}): restam{' '}
          <span className="font-mono text-ink-200">{b.deposit.remaining}</span> de {b.deposit.initial}
        </div>
      )}
      {b.stored !== null && (
        <div className="text-[11px] text-ink-400">
          Estoque do tanque: <span className="font-mono text-ink-200">{Math.floor(b.stored)}</span> / {fx.storage.oil}
        </div>
      )}
      {done && Object.keys(fx.storage).length > 0 && b.type !== 'oil_tank' && (
        <div className="text-[11px] text-ink-400">
          Capacidade:{' '}
          {Object.entries(fx.storage)
            .map(([r, v]) => `${v} ${RESOURCE_LABELS[r as keyof typeof RESOURCE_LABELS].toLowerCase()}`)
            .join(' · ')}
        </div>
      )}
      {done && b.type === 'airbase' && <AirbaseInfo b={b} />}
      {done && b.type === 'missile_silo' && <SiloInfo b={b} />}
      {done && fx.housing > 0 && <div className="text-[11px] text-ink-400">Moradia para {fx.housing} habitantes.</div>}
      {done && fx.territoryRadius > 0 && <div className="text-[11px] text-ink-400">Projeta fronteira num raio de {fx.territoryRadius} células.</div>}
      {(b.type === 'barracks' || b.type === 'factory') && done && (
        <div className="mt-1 text-[11px] text-ink-400">
          Botão direito no mapa define o ponto de reunião
          {b.hasRally ? ' (definido)' : ''}. Cada unidade usa um recruta da reserva.
        </div>
      )}
    </div>
  );
}
