import { useState } from 'react';
import { RANK_DAMAGE, RANK_HP, RANKS } from '../../../shared/sim/veterancy.ts';
import { policyEffects } from '../../../shared/strategic/policies.ts';
import { useMyBonus } from '../../state/myCountry.ts';
import {
  BUILDINGS,
  RESOURCE_TYPES,
  CITIZEN,
  MILITARY_RESEARCH,
  MILITARY_RESEARCH_IDS,
  militaryResearchBlocker,
  RECRUIT,
  DEPOSIT_SIZE_LABELS,
  OIL_TANK_RANGE,
  RESOURCE_LABELS,
  UNITS,
  NAVAL,
  PRODUCTION_QUEUE_LIMIT,
  SPACE,
  MINE,
  ROAD,
  HIGHWAY,
  BUILDERS,
  MILITARY_RESEARCH_USD_SHARE,
  militaryResearchKnowledge,
  canAfford,
  buildingCost,
  buildingUsd,
  costText,
  emptyStockpile,
  ESCALATING_BUILDINGS,
  ESCALATING_COST_STEP,
  recruitsFor,
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
import { useHudStore, type ZoneBrush } from '../../state/useHudStore.ts';
import { ZONING, type ZoneKind } from '../../../shared/sim/zoning.ts';
import { CardButton, usdDay } from './CardButton.tsx';
import { Frame } from '../components/Frame.tsx';
import { buildingDayUsd } from '../../../shared/strategic/treasury.ts';
import { ArrowBigUp, Brain, Check, CircleDot, Cog, Construction, Crosshair, Eraser, Factory, Fuel, Globe, GraduationCap, Grid3x3, HardHat, Hospital, Hourglass, House, Landmark, type LucideIcon, Milestone, Pickaxe, RadioTower, Rocket, Route, RouteOff, Satellite, Shield, Siren, Square, Star, Store, Swords, Target, Telescope, TriangleAlert, Truck, Undo2, X, Zap } from 'lucide-react';
import { AirbaseButtons, AirbaseInfo, CarrierButtons, DomeInfo, HoldToConfirm, SiloButtons, SiloInfo, SubMissileButtons, airTargetText } from './AirPanels.tsx';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { buildingEffects, formatUsd as usdShort, specDef, upgradeTrack } from '../../../shared/sim/upgrades.ts';
import { effectiveEra, effectiveMilitaryResearch, effectivePopCap, effectiveTechs, isSandboxMatch, timeText } from '../../state/sandbox.ts';
import { BUILDING_ERA, ERAS, UNIT_ERA, buildingEra, eraPhrase, eraTitle, type Era } from '../../../shared/sim/eras.ts';
import { POWER_GEN, POWER_USE, powerUse } from '../../../shared/sim/power.ts';
import { MARKET, MARKET_RESOURCES, marketPrice, marketQuote, marketBuyPrice, marketBuyQuote } from '../../../shared/sim/market.ts';

const EMPTY_TECHS: readonly string[] = [];

/**
 * Menu de construção em abas, como no *Rise of Nations*: produção (coleta, armazéns e cadeias
 * produtivas), cívicas (moradia, cidades, serviços, comércio e transporte), militares e os Grandes
 * Projetos Nacionais. Os atalhos de teclado continuam valendo em qualquer aba.
 */
type BuildTab = 'production' | 'energy' | 'civic' | 'military' | 'projects';
const BUILD_TABS: { id: BuildTab; label: string; icon: LucideIcon; types: BuildingType[] }[] = [
  { id: 'production', label: 'Produção', icon: Factory, types: ['farm', 'sawmill', 'quarry', 'mine', 'oil_well', 'oil_tank', 'warehouse', 'silo', 'refinery', 'steel_mill', 'eucalyptus_forest', 'charcoal_kiln', 'underground_mine'] },
  // rede elétrica: as usinas (a nuclear e a hidrelétrica continuam nos Grandes Projetos)
  { id: 'energy', label: 'Energia', icon: Zap, types: ['coal_plant', 'wind_farm', 'solar_farm'] },
  { id: 'civic', label: 'Cívicas', icon: Landmark, types: ['house', 'residential', 'city_hall', 'school', 'university', 'hospital', 'police_station', 'market', 'port'] },
  { id: 'military', label: 'Militares', icon: Swords, types: ['barracks', 'factory', 'research_center', 'tower', 'tank_trap', 'aa_battery', 'airbase', 'missile_silo', 'iron_dome'] },
  // Grandes Projetos Nacionais (Futuro Próximo)
  { id: 'projects', label: 'Projetos', icon: Star, types: ['nuclear_plant', 'network_5g', 'hydro_dam', 'financial_center', 'space_center'] },
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
  no_input: 'Parado: sem matéria-prima (petróleo para a Refinaria, ferro para a Siderúrgica)',
  no_power: 'Parado: sem energia — ligue-o à rede (estrada a até 4 células de uma usina ou do QG) ou construa mais usinas',
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
  const [buildTab, setBuildTab] = useState<BuildTab>('production');
  const techs = effectiveTechs(useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.research.done ?? EMPTY_TECHS));
  const myEra = effectiveEra(players.find((p) => p.slot === mySlot));
  const myNation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const worksCap = myNation?.works.capUsd ?? 0;
  const fund = myNation ? myNation.works.fundUsd : null;
  // escala do PIB do caixa do país (saldo por dia de cada construção, 05/11)
  const usdScale = myNation?.research.usdScale ?? null;
  const ownTypes = useHudStore((s) => s.ownBuildingTypes);
  const ownCounts = useHudStore((s) => s.ownBuildingCounts);
  // Centro de Comando ou Prefeitura pronta (QG secundário da cidade): constrói e forma cidadãos
  const command = building?.type === 'hq' || (building?.type === 'city_hall' && building.progress >= 1);
  const hqLevel = building?.type === 'hq' ? building.level : command ? runtime.upgradeWorld().hqLevel : 0;

  return (
    <Frame
      className="pointer-events-auto min-w-0 flex-1 sm:h-[222px] [@media(max-height:520px)]:h-auto [@media(max-height:520px)]:max-h-[150px]"
      innerClassName="flex min-w-0 flex-col gap-2 p-2 sm:flex-row sm:gap-3 sm:p-3 [@media(max-height:520px)]:flex-row [@media(max-height:520px)]:gap-2 [@media(max-height:520px)]:p-2"
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
                Custo: <CostLabel cost={buildingCost(mode.buildingType, ownCounts[mode.buildingType] ?? 0)} have={resources} />
                {!isSandboxMatch() && buildingUsd(mode.buildingType, ownCounts[mode.buildingType] ?? 0, worksCap) > 0 && (
                  <span className={`ml-1 font-mono ${fund !== null && fund < buildingUsd(mode.buildingType, ownCounts[mode.buildingType] ?? 0, worksCap) ? 'text-red-300' : 'text-brass-400'}`}>
                    + {usdShort(buildingUsd(mode.buildingType, ownCounts[mode.buildingType] ?? 0, worksCap))} de taxa de obra
                  </span>
                )}
                {ESCALATING_BUILDINGS.has(mode.buildingType) && (
                  <span className="ml-1 text-ink-500">
                    · o próximo: {costText(buildingCost(mode.buildingType, (ownCounts[mode.buildingType] ?? 0) + 1))}
                    {!isSandboxMatch() && worksCap > 0 && ` + ${usdShort(buildingUsd(mode.buildingType, (ownCounts[mode.buildingType] ?? 0) + 1, worksCap))}`}
                  </span>
                )}
              </div>
              {mode.power && (
                <div className={`mt-1 flex items-start gap-1.5 text-xs font-semibold ${mode.power === 'on' ? 'text-brass-400' : 'text-red-300'}`}>
                  {mode.power === 'on' ? <Zap size={14} className="mt-px shrink-0" aria-hidden /> : <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />}
                  <span>
                    {mode.power === 'on'
                      ? 'Com energia aqui (área amarela no chão)'
                      : POWER_GEN[mode.buildingType]
                        ? 'Longe da rede: a usina ficará isolada — ligue-a com estrada'
                        : POWER_USE[mode.buildingType]?.stops
                          ? 'Sem energia aqui: ficará parada. Construa na área amarela ou leve estrada até aqui'
                          : POWER_USE[mode.buildingType]?.slows
                            ? 'Sem energia aqui: vai render metade. Construa na área amarela ou leve estrada até aqui'
                            : 'Sem energia aqui: fica no escuro. Construa na área amarela ou leve estrada até aqui'}
                  </span>
                </div>
              )}
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
          {mode.kind === 'air_target' && <ModeHint {...airTargetText(mode.purpose, touch, mode.target !== null, runtime.missileGenOf(mode.sourceId))} />}
          {mode.kind === 'lay_mine' && (
            <ModeHint
              title="Instalar mina antitanque"
              text={`${touch ? 'Toque' : 'Clique'} no ponto: o engenheiro mais próximo vai até lá e fica ${MINE.laySeconds} s parado instalando. Só veículos inimigos detonam; o inimigo não vê a mina sem engenheiro, forças especiais ou reconhecimento aéreo.${touch ? '' : ' Shift mantém a ferramenta.'}`}
            />
          )}
          {mode.kind === 'road' && <RoadHint mode={mode} touch={touch} worksCap={worksCap} stone={resources.stone} />}
          {mode.kind === 'zone' && <ZoneInfo mode={mode} touch={touch} runtime={runtime} />}
          {mode.kind === 'demolish' && (
            <ModeHint title="Demolir" text={`${touch ? 'Toque' : 'Clique'} numa construção ou estrada sua para derrubar na hora (sem devolver o custo). O QG e as prefeituras ficam. ${touch ? 'Cancelar' : 'Botão direito ou Esc'} sai do modo.`} />
          )}
          {mode.kind === 'attack_road' && <ModeHint title="Atacar estrada" text={`${touch ? 'Toque' : 'Clique'} numa célula de estrada ou rodovia inimiga à vista. As tropas vão até lá e destroem o asfalto (estrada: ${ROAD.hp} de vida; rodovia: ${HIGHWAY.hp}).`} />}
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
                  por retângulo), Somar e QG. Toque no Centro de Comando ou numa Prefeitura para construir.
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
              · Espaço: pausa · G: painel nacional. Selecione o Centro de Comando ou uma Prefeitura para construir: fazendas no solo fértil, serrarias junto à floresta, pedreiras junto às rochas e poços sobre o
              petróleo.
            </div>
          )}
        </div>
      </div>
      <div className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto pt-1 sm:grid sm:grid-cols-4 sm:content-start sm:overflow-x-visible sm:overflow-y-auto xl:grid-cols-6 [@media(max-height:520px)]:grid [@media(max-height:520px)]:grid-cols-4 [@media(max-height:520px)]:content-start [@media(max-height:520px)]:overflow-y-auto">
        {units.length > 0 && mode.kind === 'normal' && (
          <>
            <CardButton icon={<Swords size={20} />} hotkey="F" label="Avançar atacando" onClick={() => runtime.startAttackMove()} title="Avançar atacando (F)" />
            <CardButton icon={<Square size={20} />} hotkey="X" label="Parar" onClick={() => runtime.stopSelected()} title="Parar (X)" />
            <CardButton
              icon={<RouteOff size={20} />}
              label="Atacar estrada"
              onClick={() => runtime.startAttackRoad()}
              title="Atacar uma célula de estrada ou rodovia de quem está em guerra com você. As tropas nunca fazem isso sozinhas. Destruída, a célula some: corta a energia que passava por ela, as caravanas e a rota dos caminhões de carga."
            />
            <ModernizeButtons runtime={runtime} />
            {units.some((u) => u.type === 'engineer') && <EngineerButtons runtime={runtime} />}
            {units.length === 1 && units[0]!.type === 'aircraft_carrier' && <CarrierButtons unitId={units[0]!.id} runtime={runtime} />}
            {units.length === 1 && units[0]!.type === 'missile_submarine' && <SubMissileButtons unitId={units[0]!.id} missiles={units[0]!.missiles ?? 0} runtime={runtime} />}
          </>
        )}
        {mode.kind === 'place' && touch && (
          <CardButton thumb={thumbs[mode.buildingType]} icon={<Check size={20} />} label="Confirmar" disabled={!mode.valid} onClick={() => runtime.confirmPlacement()} title="Construir na posição marcada" />
        )}
        {mode.kind === 'air_target' && mode.purpose === 'missile' && (
          <CardButton
            icon={<Crosshair size={20} />}
            label="Confirmar alvo"
            disabled={!mode.target}
            onClick={() => runtime.confirmAirTarget()}
            title="Inicia a preparação do míssil para o alvo marcado (ainda exige autorização)"
          />
        )}
        {mode.kind === 'road' && (
          <>
            <CardButton icon={<Check size={20} />} hotkey="Enter" label="Construir" disabled={mode.cells === 0} onClick={() => runtime.confirmRoad()} title="Pavimenta as células marcadas em verde (Enter)" />
            <CardButton icon={<Eraser size={20} />} label="Limpar" disabled={mode.marked === 0} onClick={() => runtime.clearRoad()} title="Desmarca todas as células sem sair da ferramenta" />
          </>
        )}
        {mode.kind === 'zone' &&
          ZONE_BRUSHES.map((z) => (
            <CardButton
              key={z.id}
              icon={<z.icon size={20} />}
              label={z.label}
              badge={mode.brush === z.id ? '●' : undefined}
              onClick={() => runtime.startZone(z.id)}
              title={z.title}
            />
          ))}
        {mode.kind !== 'normal' && <CardButton icon={<X size={20} />} hotkey="Esc" label="Cancelar" onClick={() => runtime.cancelMode()} title="Cancelar (Esc)" />}
        {command && mode.kind === 'normal' && runtime.battleOp === null && (
          <div className="flex shrink-0 flex-col gap-0 sm:col-span-4 sm:flex-row xl:col-span-6 [@media(max-height:520px)]:col-span-4 [@media(max-height:520px)]:flex-row" role="tablist" aria-label="Categorias de construção">
            {BUILD_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={buildTab === t.id}
                className="nc-tab"
                onClick={() => setBuildTab(t.id)}
                title={`Construções ${t.label.toLowerCase()}`}
              >
                <t.icon size={13} aria-hidden />
                <span className="hidden min-[1100px]:inline">{t.label}</span>
              </button>
            ))}
          </div>
        )}
        {command && mode.kind === 'normal' && runtime.battleOp === null && (
          <ProduceButton
            b={building}
            unit="citizen"
            hotkey={CITIZEN.hotkey}
            label="Cidadão"
            onRun={() => runtime.trainCitizen()}
            title={`Formar cidadão civil — trabalha nas construções (fazendas, poços de petróleo, serrarias, pedreiras, minas, fábricas). Exige vaga de moradia.\nTempo: ${timeText(CITIZEN.buildSeconds)}`}
          />
        )}
        {building?.type === 'hq' && mode.kind === 'normal' && runtime.battleOp === null && <EraButton runtime={runtime} />}
        {command && mode.kind === 'normal' && runtime.battleOp === null && buildTab === 'civic' && (
          <CardButton
            icon={<Route size={20} />}
            label="Estrada"
            onClick={() => runtime.startRoad()}
            title={`Estrada: arraste na grade para pavimentar até ${ROAD.maxCells} células por vez, dentro do território (fora dele, só com um Engenheiro de Combate por perto).\nCusto: ${ROAD.stonePerCell} de pedra por célula e verba de obras; manutenção pequena em suprimentos.\nTropas e comboios andam ${Math.round((ROAD.convoyMul - 1) * 100)}% mais rápido; moradias ligadas à estrada dão aprovação (bairro pavimentado).`}
          />
        )}
        {command && mode.kind === 'normal' && runtime.battleOp === null && buildTab === 'civic' && (
          <CardButton
            icon={<Milestone size={20} />}
            label="Rodovia"
            blocked={!techs.includes('road_engineering')}
            locked={!techs.includes('road_engineering')}
            short={techs.includes('road_engineering') ? null : 'exige pesquisa'}
            onClick={() =>
              techs.includes('road_engineering')
                ? runtime.startRoad(true)
                : useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text: 'Rodovia: exige a pesquisa Engenharia rodoviária (painel nacional, aba Pesquisa)', tone: 'warn' })
            }
            title={`Rodovia: pista dupla que vai além da fronteira sem engenheiro, mas só pela terra neutra (nunca no território de outra nação); lá ela se encontra com a rodovia do vizinho. Arraste na grade (até ${HIGHWAY.maxCells} células por vez); sobre a sua estrada, ela vira rodovia.\nCusto: ${HIGHWAY.stonePerCell} de pedra por célula e o dobro da verba da estrada; manutenção mais barata que a da estrada. Não leva energia e as margens não podem ser zoneadas.\nCaminhões de carga e caravanas andam ${Math.round((HIGHWAY.convoyMul - 1) * 100)}% mais rápido e tropas ${Math.round((HIGHWAY.unitMul - 1) * 100)}%. Liga o seu Terminal Comercial ao de outra nação para vender e comprar por caminhão.`}
          />
        )}
        {command && mode.kind === 'normal' && runtime.battleOp === null && buildTab === 'civic' && (
          <CardButton
            icon={<Grid3x3 size={20} />}
            label="Zoneamento"
            onClick={() => runtime.startZone('res')}
            title={`Zoneamento: pinte células a até ${ZONING.reach} das suas estradas como residenciais, comerciais ou industriais. Nada é construído na hora: casas, lojas e indústrias privadas aparecem aos poucos conforme a demanda de cada cidade, pagam imposto ao caixa do país e gastam ${String(ZONING.lotPower).replace('.', ',')} de energia cada.`}
          />
        )}
        {command && mode.kind === 'normal' && runtime.battleOp === null && (
          <CardButton
            icon={<Pickaxe size={20} />}
            label="Demolir"
            onClick={() => runtime.startDemolish()}
            title="Demolir: clique numa construção sua ou numa célula de estrada/rodovia sua para derrubar na hora (sem devolver o custo da obra; a fila de produção é devolvida). O Centro de Comando e as prefeituras não podem ser demolidos. Botão direito ou Esc sai do modo."
          />
        )}
        {command &&
          mode.kind === 'normal' &&
          runtime.battleOp === null &&
          BUILD_TABS.find((t) => t.id === buildTab)!.types.map((type) => {
            const def = BUILDINGS[type];
            const techMissing = def.requiresTech && !(techs as readonly string[]).includes(def.requiresTech) ? def.requiresTech : null;
            const needEra = buildingEra(type);
            const eraMissing = needEra > myEra ? needEra : null;
            const sandbox = isSandboxMatch();
            const hqMissing = !sandbox && def.minHqLevel && hqLevel < def.minHqLevel ? def.minHqLevel : null;
            const hasOne = !!def.project && ownTypes.has(type);
            const projectUsd = def.project ? Math.round(worksCap * def.project.usdShare) : 0;
            const fundShort = !sandbox && def.project && fund !== null && fund < projectUsd;
            const other = hqMissing ? `QG nível ${hqMissing}` : hasOne ? 'já construído' : fundShort ? 'verba insuficiente' : null;
            // custo crescente: o preço sobe com cada edifício do mesmo tipo
            const owned = ownCounts[type] ?? 0;
            const cost = buildingCost(type, owned);
            const next = ESCALATING_BUILDINGS.has(type) ? buildingCost(type, owned + 1) : null;
            const feeUsd = sandbox ? 0 : buildingUsd(type, owned, worksCap);
            const feeShort = feeUsd > 0 && fund !== null && fund < feeUsd;
            const ok = canAfford(resources, cost) && !techMissing && !eraMissing && !other && !feeShort;
            const locked = !!(eraMissing || techMissing || other);
            const lack = RESOURCE_TYPES.find((r) => (cost[r] ?? 0) > resources[r]);
            const day0 = usdScale !== null ? buildingDayUsd(type, { era: myEra, scale: usdScale }) : null;
            const day = day0 && Math.abs(day0.net) >= 50 ? day0 : null;
            return (
              <CardButton
                key={type}
                thumb={thumbs[type]}
                hotkey={def.hotkey}
                label={def.label}
                blocked={!ok}
                locked={locked}
                net={day?.net ?? null}
                short={eraMissing ? `era ${eraMissing}` : techMissing ? 'exige pesquisa' : other ?? (feeShort ? 'sem caixa' : null) ??
                  (lack ? (
                    <span className="inline-flex items-center gap-0.5" title={`Faltam ${Math.ceil((cost[lack] ?? 0) - resources[lack])} de ${RESOURCE_LABELS[lack].toLowerCase()}`}>
                      Faltam {Math.ceil((cost[lack] ?? 0) - resources[lack])}
                      <ResourceIcon type={lack} size={10} color="#f08a7e" />
                    </span>
                  ) : null)}
                onClick={() =>
                  ok
                    ? runtime.startPlacement(type)
                    : useHudStore.getState().pushEvent({
                        tick: useHudStore.getState().tick,
                        text: `${def.label}: ${eraMissing ? `requer ${eraPhrase(eraMissing)} (avance de era no Centro de Comando)` : techMissing ? `exige a pesquisa ${TECHNOLOGIES[techMissing as keyof typeof TECHNOLOGIES]?.label ?? techMissing}` : hqMissing ? `requer o Centro de Comando no nível ${hqMissing}` : hasOne ? 'Grande Projeto: só um por nação' : fundShort ? `caixa do país sem saldo (${usdShort(projectUsd)})` : feeShort ? `caixa do país sem saldo para a taxa de obra (${usdShort(feeUsd)})` : 'recursos insuficientes'}`,
                        tone: 'warn',
                      })
                }
                title={`${def.label} — ${def.description}\nTempo: ${timeText(def.buildSeconds)} · Vida: ${def.maxHp}${def.workers ? ` · Trabalhadores: ${def.workers}` : ''}${def.territoryRadius ? ` · Fronteira: ${def.territoryRadius} células` : ''}${def.project ? `\nGrande Projeto: ${def.project.effect} · ${usdShort(projectUsd)} do caixa do país` : ''}${feeUsd > 0 ? `\nTaxa de obra: ${usdShort(feeUsd)} do caixa do país` : ''}${next ? `\nCusto crescente (+${Math.round(ESCALATING_COST_STEP * 100)}% por edifício do tipo, em recursos e em US$): você tem ${owned}; depois deste, o próximo custará ${costText(next)}${sandbox ? '' : ` + ${usdShort(buildingUsd(type, owned + 1, worksCap))}`}` : ''}${day ? `\n${dayText(day)}` : ''}`}
              >
                <CostLabel cost={cost} have={resources} compact />
                {feeUsd > 0 && <span className={`nc-num text-[9px] leading-tight ${feeShort ? 'text-red-300' : 'text-brass-400'}`}>+{usdShort(feeUsd)}</span>}
              </CardButton>
            );
          })}
        {building && building.progress >= 1 && mode.kind === 'normal' && runtime.battleOp === null && upgradeTrack(building.type) && <UpgradeButton runtime={runtime} b={building} />}
        {building && building.progress >= 1 && (building.type === 'barracks' || building.type === 'factory' || building.type === 'port') && <ProduceButtons runtime={runtime} b={building} />}
        {building && building.progress >= 1 && mode.kind === 'normal' && building.type === 'research_center' && runtime.battleOp === null && <ResearchButtons runtime={runtime} b={building} />}
        {building && building.progress >= 1 && mode.kind === 'normal' && building.type === 'airbase' && <AirbaseButtons runtime={runtime} b={building} />}
        {building && building.progress >= 1 && mode.kind === 'normal' && building.type === 'missile_silo' && <SiloButtons runtime={runtime} b={building} />}
        {building && building.progress >= 1 && mode.kind === 'normal' && building.type === 'space_center' && <SpaceButtons runtime={runtime} b={building} />}
      </div>
    </Frame>
  );
}

const ZONE_BRUSHES: { id: ZoneBrush; icon: LucideIcon; label: string; title: string }[] = [
  { id: 'res', icon: House, label: 'Residencial', title: 'Casas (+1 cidadão cada) e, raramente, prédios (+5). Crescem com a cidade desenvolvida, emprego por perto, serviços, luz e imposto baixo.' },
  { id: 'com', icon: Store, label: 'Comercial', title: 'Lojas, postos e escritórios. Crescem com moradores, indústrias e imposto baixo.' },
  { id: 'ind', icon: Factory, label: 'Industrial', title: 'Indústrias privadas. Vêm com economia boa, aprovação alta e imposto industrial baixo.' },
  { id: 'erase', icon: Eraser, label: 'Apagar', title: 'Tira a zona das células sem lote.' },
  { id: 'demolish', icon: Pickaxe, label: 'Demolir', title: 'Demole lotes seus (os abandonados precisam ser demolidos para a zona voltar a crescer).' },
];

/** Ferramenta de zoneamento: como usar, impostos por setor e a demanda de cada cidade (barras R, C e I). */
function ZoneInfo({ mode, touch, runtime }: { mode: Extract<ReturnType<typeof useHudStore.getState>['mode'], { kind: 'zone' }>; touch: boolean; runtime: GameRuntime }) {
  const zoning = useHudStore((s) => s.zoning);
  const brush = ZONE_BRUSHES.find((z) => z.id === mode.brush)!;
  const how = touch ? 'Toque numa célula ou arraste um dedo para pintar um retângulo.' : 'Clique numa célula ou clique e arraste para pintar um retângulo. Esc sai da ferramenta.';
  const kinds: { k: ZoneKind; label: string; color: string }[] = [
    { k: 'res', label: 'R', color: '#5fc46a' },
    { k: 'com', label: 'C', color: '#4f8fe0' },
    { k: 'ind', label: 'I', color: '#e0b43c' },
  ];
  return (
    <div className="text-xs">
      <ModeHint title={`Zoneamento · ${brush.label}`} text={`${brush.title} ${how}`} bad={false} />
      {mode.bad > 0 && mode.reason && <div className="mt-1 text-signal-red">{mode.reason}</div>}
      {zoning && (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-ink-400">Imposto:</span>
            {kinds.map(({ k, label, color }) => (
              <span key={k} className="flex items-center gap-1">
                <span className="font-semibold" style={{ color }}>
                  {label}
                </span>
                <button className="btn min-h-6 px-1.5 py-0 text-[11px]" aria-label={`Menos imposto ${label}`} disabled={zoning.tax[k] <= 0} onClick={() => runtime.setZoneTax(k, zoning.tax[k] - 1)}>
                  −
                </button>
                <span className="w-7 text-center font-mono text-ink-100">{zoning.tax[k]}%</span>
                <button className="btn min-h-6 px-1.5 py-0 text-[11px]" aria-label={`Mais imposto ${label}`} disabled={zoning.tax[k] >= ZONING.taxMax} onClick={() => runtime.setZoneTax(k, zoning.tax[k] + 1)}>
                  +
                </button>
              </span>
            ))}
          </div>
          <div className="mt-1.5 max-h-28 space-y-1 overflow-y-auto">
            {zoning.cities.map((c) => (
              <div key={c.seat} className="flex items-center gap-2">
                <span className="w-24 truncate text-ink-200" title={`${c.name}: desenvolvimento ${Math.round(c.development * 100)}% · ${c.residents} moradores, ${c.jobs} empregos, ${c.lots.res + c.lots.com + c.lots.ind} lotes privados${c.abandoned ? `, ${c.abandoned} abandonados` : ''}`}>
                  {c.name}
                </span>
                {kinds.map(({ k, label, color }) => (
                  <span key={k} className="flex items-center gap-0.5" title={`Atratividade ${label}: ${Math.round(c.demand[k] * 100)}% (abaixo de zero, a zona não cresce; quanto maior, mais rápido) · ${c.lots[k]} lotes de ${c.zoned[k]} células`}>
                    <span style={{ color }}>{label}</span>
                    <span className="relative h-2 w-8 overflow-hidden rounded bg-ink-800">
                      <span className="absolute inset-y-0 left-0" style={{ width: `${Math.max(0, c.demand[k]) * 100}%`, background: color }} />
                      {c.demand[k] < 0 && <span className="absolute inset-y-0 right-0 bg-signal-red/70" style={{ width: `${-c.demand[k] * 100}%` }} />}
                    </span>
                  </span>
                ))}
                <span className="text-[10px] text-ink-400" title="Delegacia · escola/universidade · hospital na cidade">
                  {c.services.police ? <Siren size={11} className="inline-block align-[-2px]" aria-hidden /> : '·'}
                  {c.services.school ? <GraduationCap size={11} className="inline-block align-[-2px]" aria-hidden /> : '·'}
                  {c.services.hospital ? <Hospital size={11} className="inline-block align-[-2px]" aria-hidden /> : '·'}
                </span>
                {c.abandoned > 0 && <span className="text-[10px] text-signal-red">{c.abandoned} abandonado(s)</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Dica e custo do traçado de estrada em andamento. */
function RoadHint({ mode, touch, worksCap, stone }: { mode: Extract<ReturnType<typeof useHudStore.getState>['mode'], { kind: 'road' }>; touch: boolean; worksCap: number; stone: number }) {
  const def = mode.highway ? HIGHWAY : ROAD;
  const cost = mode.cells * def.stonePerCell;
  const usd = Math.round(worksCap * def.usdSharePerCell * mode.cells);
  const what = mode.highway ? 'a rodovia' : 'a estrada';
  const how = touch
    ? `Toque nas células para marcar ou desmarcar ${what}; depois toque em Construir.`
    : 'Clique para marcar ou desmarcar uma célula, ou clique e arraste para marcar um caminho. Depois, Construir (Enter). Esc sai da ferramenta.';
  return (
    <div>
      <ModeHint title={mode.highway ? 'Construir rodovia' : 'Construir estrada'} text={mode.highway ? `${how} A rodovia pode sair da fronteira (nunca em país em guerra com você) e não leva energia.` : how} bad={false} />
      {mode.marked > 0 && (
        <div className="mt-1.5 text-xs text-ink-400">
          {mode.cells} célula(s) a pavimentar · <span className={stone < cost ? 'text-signal-red' : 'text-ink-200'}>{cost} de pedra</span>
          {usd > 0 && <span className="text-signal-green"> · {usdShort(usd)} do caixa do país</span>}
          {mode.bad > 0 && mode.reason && (
            <div className="text-signal-red">
              {mode.bad} célula(s) em vermelho ficam de fora: {mode.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Engenheiro de Combate (lote 3): minas antitanque, estradas fora do território e obstáculos.
 * Recalculado a cada publicação do HUD (saldo e minas no mapa).
 */
function EngineerButtons({ runtime }: { runtime: GameRuntime }) {
  useHudStore((s) => s.tick);
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const resources = me?.resources ?? emptyStockpile();
  const mines = runtime.myMineCount();
  const full = mines >= MINE.perNation;
  const sandbox = isSandboxMatch();
  const afford = sandbox || canAfford(resources, MINE.cost);
  const trap = BUILDINGS.tank_trap;
  return (
    <>
      <CardButton
        icon={<CircleDot size={20} />}
        label="Instalar mina"
        blocked={full || !afford}
        short={full ? 'limite' : !afford ? 'recursos' : null}
        badge={`${mines}/${MINE.perNation}`}
        onClick={() =>
          full || !afford
            ? useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text: full ? `Limite de ${MINE.perNation} minas por nação` : 'Recursos insuficientes para a mina', tone: 'warn' })
            : runtime.startLayMine()
        }
        title={`Mina antitanque: o engenheiro instala parado (${MINE.laySeconds} s). Detona só com veículos inimigos (${MINE.damage} de dano, metade em volta). Invisível ao inimigo e ao satélite; engenheiros e forças especiais inimigos a detectam a ${MINE.detectRange} m e a removem parados ao lado.\nLimite: ${MINE.perNation} por nação.`}
      >
        <CostLabel cost={MINE.cost} have={resources} compact />
      </CardButton>
      <CardButton
        icon={<Route size={20} />}
        label="Estrada"
        onClick={() => runtime.startRoad()}
        title={`Estrada: com o engenheiro por perto (${ROAD.engineerRange} células), dá para pavimentar fora do território — terra neutra ou de um país em guerra.\nCusto: ${ROAD.stonePerCell} de pedra por célula e verba de obras.`}
      />
      <CardButton
        thumb={useHudStore.getState().thumbs.tank_trap}
        label={trap.label}
        onClick={() => runtime.startPlacement('tank_trap')}
        title={`${trap.label} — ${trap.description}\nCom o engenheiro por perto, pode ser erguido fora do território.`}
      >
        <CostLabel cost={trap.cost} have={resources} compact />
      </CardButton>
    </>
  );
}

/**
 * Avanço de era no Centro de Comando: requisito (nível do QG), custo em recursos e US$, prazo e o
 * que a era seguinte libera. Durante a obra, mostra o progresso e permite cancelar (devolve 75%).
 */
function EraButton({ runtime }: { runtime: GameRuntime }) {
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const hqLevel = useHudStore((s) => s.selectedBuilding?.level ?? 0);
  const mySlot = useHudStore((s) => s.mySlot);
  const fund = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.works.fundUsd ?? null);
  const cap = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.works.capUsd ?? 0);
  if (!me?.eras) return null;
  const cur = me.era ?? 1;
  if (me.eraAdvance)
    return (
      <CardButton
        icon={<Hourglass size={20} />}
        label={eraTitle(me.eraAdvance.to)}
        badge={`${Math.round(me.eraAdvance.progress * 100)}%`}
        onClick={() => runtime.send({ type: 'cancel_era' })}
        title={`Avanço para ${eraPhrase(me.eraAdvance.to)} em andamento (${Math.round(me.eraAdvance.progress * 100)}%). Clique para cancelar (devolve 75%).`}
      >
        <span className="text-[10px] text-brass-400">cancelar</span>
      </CardButton>
    );
  if (cur >= 4) return null;
  const to = (cur + 1) as Era;
  const def = ERAS[to];
  const usd = Math.round(cap * def.usdShare);
  const sandbox = isSandboxMatch();
  const blocker = sandbox
    ? null
    : hqLevel < def.hqLevel
      ? `QG nível ${def.hqLevel}`
      : !canAfford(me.resources ?? emptyStockpile(), def.cost)
        ? 'recursos insuficientes'
        : fund !== null && fund < usd
          ? 'verba insuficiente'
          : null;
  const unlocks = [
    ...(Object.keys(UNIT_ERA) as UnitType[]).filter((u) => UNIT_ERA[u] === to).map((u) => UNITS[u].label),
    ...(Object.keys(BUILDING_ERA) as BuildingType[]).filter((b) => BUILDING_ERA[b] === to).map((b) => BUILDINGS[b].label),
  ];
  return (
    <CardButton
      icon={<Landmark size={20} />}
      label={eraTitle(to)}
      blocked={blocker !== null}
      short={blocker}
      onClick={() =>
        blocker ? useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text: `Avanço de era: ${blocker}`, tone: 'warn' }) : runtime.send({ type: 'advance_era' })
      }
      title={`Avançar para ${eraPhrase(to)}: ${def.look}.\nLibera: ${unlocks.join(', ') || '—'}${def.maxUpgradeLevel > ERAS[cur as Era].maxUpgradeLevel ? `; melhorias até o nível ${def.maxUpgradeLevel}` : ''}.\nRequer o Centro de Comando no nível ${def.hqLevel} · ${usdShort(usd)} da verba de obras (${Math.round(def.usdShare * 100)}% do teto anual) · ${timeText(def.seconds)}`}
    >
      <CostLabel cost={def.cost} have={me.resources ?? emptyStockpile()} compact />
    </CardButton>
  );
}

/** Programa Espacial: autorizar o lançamento (manter pressionado) e acompanhar a contagem e a subida. */
function SpaceButtons({ runtime, b }: { runtime: GameRuntime; b: SelectedBuilding }) {
  const sat = useHudStore((s) => !!s.players.find((p) => p.slot === s.mySlot)?.satellite);
  const launch = useHudStore((s) => s.spaceLaunch);
  if (sat) return <CardButton icon={<Satellite size={20} />} label="Satélite em órbita" disabled onClick={() => {}} title="O satélite já está em órbita: o mapa inteiro fica visível em tempo real." />;
  if (launch && launch.id === b.id)
    return (
      <CardButton
        icon={<Rocket size={20} />}
        label={launch.phase === 'countdown' ? `Contagem ${Math.max(0, Math.ceil(SPACE.countdownSeconds * (1 - launch.progress)))}` : 'Subindo'}
        disabled
        onClick={() => {}}
        title="Lançamento em andamento"
        badge={`${Math.round(launch.progress * 100)}%`}
      />
    );
  return <HoldToConfirm label="Autorizar lançamento" onConfirm={() => runtime.send({ type: 'space_launch', buildingId: b.id })} />;
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
        <Globe size={12} className="inline-block align-[-2px]" aria-hidden /> Abrir no Globo
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
        icon={<Construction size={20} />}
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
      icon={<ArrowBigUp size={20} />}
      label={max ? 'Nível máximo' : `Nível ${b.level + 1}`}
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
  const myNation = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const bonus = useMyBonus();
  const techs = effectiveTechs(myNation?.research.done ?? null);
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
    recruitCostMul: policyEffects(myNation?.policies).recruitCostMul,
    bonus,
    era: effectiveEra(me),
    ...(me?.goods ? { goods: me.goods } : {}),
    ...(unit === 'fishing_boat' ? { fishing: { owned: me?.fishing?.owned ?? 0, atPort: me?.fishing?.ports.find(([id]) => id === b.id)?.[1] ?? 0 } } : {}),
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
      <GoodsLabel goods={check.goods} />
      {check.basic && <span className="text-[9px] leading-tight text-brass-400">sai básica</span>}
      {check.mods.length > 0 && (
        <span className="text-[9px] leading-tight text-signal-blue">
          Ger. {check.mods.length} · {check.mods.map((m) => MODS[m].short).join(' ')}
        </span>
      )}
    </CardButton>
  );
}

/** Bens industriais usados no lugar de parte do custo (aço, combustível). */
export function GoodsLabel({ goods }: { goods: Partial<Record<'fuel' | 'steel', number>> | undefined }) {
  if (!goods || (!goods.fuel && !goods.steel)) return null;
  return (
    <span className="text-[9px] leading-tight text-signal-blue" title="Bens industriais da Refinaria e da Siderúrgica usados no lugar de parte do petróleo e do ferro">
      {goods.steel ? (
        <span className="mr-1 inline-flex items-center gap-0.5">
          <Cog size={10} aria-hidden />
          {goods.steel}
        </span>
      ) : null}
      {goods.fuel ? (
        <span className="inline-flex items-center gap-0.5">
          <Fuel size={10} aria-hidden />
          {goods.fuel}
        </span>
      ) : null}
    </span>
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
            title={`${def.label} — ${def.description}\nTripulação: ${recruitsFor(u)} recruta${recruitsFor(u) > 1 ? "s" : ""}${def.carrierFighters ? ` (com ${def.carrierFighters} pilotos)` : ""} (reserva: ${recruits})${def.cargo ? ` · Leva ${def.cargo.infantry} a pé${def.cargo.vehicles ? ` e ${def.cargo.vehicles} veículos` : ""}` : ""} · Tempo: ${timeText(def.buildSeconds)} · Vida: ${def.maxHp} · Dano: ${def.weapon.damage} · Alcance: ${def.weapon.range} · Visão: ${def.sight}${counterText(u)}`}
          />
        );
      })}
      <CardButton
        icon={<Undo2 size={20} />}
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
  // 02/11: conhecimento (escolas e universidades) e US$ do caixa do país
  const mySlot = useHudStore((s) => s.mySlot);
  const works = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.works);
  const sandbox = isSandboxMatch();
  const knowledge = me?.knowledge ?? 0;
  return (
    <>
      {MILITARY_RESEARCH_IDS.map((id) => {
        const def = MILITARY_RESEARCH[id];
        const unit = unlockOf(id);
        const current = b.research?.id === id;
        const isDone = done.includes(id);
        const blocker = isDone ? 'Pesquisa já concluída' : b.research && !current ? 'O centro já está pesquisando outra coisa' : militaryResearchBlocker(id, done, b.level, effectiveEra(me));
        const short = isDone ? 'concluída' : current ? null : blocker ? (blocker.startsWith('Requer o Centro') ? `nível ${def.tier}` : blocker.startsWith('Requer:') ? 'pré-requisito' : 'ocupado') : null;
        const kp = militaryResearchKnowledge(id);
        const usd = Math.round((works?.capUsd ?? 0) * MILITARY_RESEARCH_USD_SHARE[def.tier - 1]!);
        const kpShort = !sandbox && knowledge < kp;
        const noUsd = !sandbox && !!works && works.fundUsd < usd;
        const ok = !blocker && !current && canAfford(resources, def.cost) && !kpShort && !noUsd;
        return (
          <CardButton
            key={id}
            thumb={thumbs[unit]}
            hotkey={def.hotkey}
            label={def.label}
            blocked={!ok && !current}
            short={short ?? (current ? null : !canAfford(resources, def.cost) ? 'recursos' : kpShort ? 'conhecimento' : noUsd ? 'caixa' : null)}
            badge={current ? `${Math.round((b.research?.progress ?? 0) * 100)}%` : isDone ? '✔' : undefined}
            onClick={() => {
              if (current) return runtime.cancelMilitaryResearch();
              if (ok) return runtime.startMilitaryResearch(id);
              const why = blocker ?? (!canAfford(resources, def.cost) ? 'recursos insuficientes' : kpShort ? `conhecimento insuficiente (${Math.floor(knowledge)} de ${kp}): forme mais em escolas e universidades` : 'caixa do país sem saldo');
              useHudStore.getState().pushEvent({ tick: useHudStore.getState().tick, text: `${def.label}: ${why}`, tone: 'warn' });
            }}
            title={`${def.label} — ${def.description}\nLibera: ${UNITS[unit].label} (${UNITS[unit].producedBy === 'barracks' ? 'base militar' : 'fábrica'})\nTempo: ${timeText(def.seconds)} (com 3 pesquisadores; o orçamento nacional de P&D acelera)${def.prereqs.length ? `\nRequer: ${def.prereqs.map((p) => MILITARY_RESEARCH[p].label).join(', ')}` : ''}${def.tier > 1 ? `\nCentro de Pesquisa no nível ${def.tier}` : ''}${current ? '\nEm andamento — clique para cancelar (devolve 75%)' : blocker ? `\nBloqueado: ${blocker}` : ''}`}
          >
            {!isDone && !current && <CostLabel cost={def.cost} have={resources} compact />}
            {!isDone && !current && !sandbox && (
              <span className="text-[10px] text-ink-300">
                <span className={kpShort ? 'text-red-300' : ''}><Brain size={11} className="inline-block align-[-1px] text-[#b9a4f2]" aria-hidden /> {kp}</span> · <span className={noUsd ? 'text-red-300' : ''}>{usdShort(usd)}</span>
              </span>
            )}
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
    ciws: '⊛',
    at_infantry: '➹',
    special_forces: '✦',
  };
  return icons[t] ?? '●';
}

/** Edifícios com fila de produção (cidadãos, recrutas, unidades). */
const PRODUCERS: BuildingType[] = ['hq', 'city_hall', 'barracks', 'factory'];

/**
 * Fila de produção em coluna, à esquerda do painel: o item em andamento em destaque (miniatura,
 * nome e progresso) e os próximos em miniaturas menores; espaços vazios mostram a capacidade.
 */
function QueueColumn({ b, runtime }: { b: SelectedBuilding; runtime: GameRuntime }) {
  const thumbs = useHudStore((s) => s.thumbs);
  const [first, ...rest] = b.queue;
  return (
    <div className="flex w-[84px] shrink-0 flex-col gap-1 border-r border-white/10 pr-2 sm:w-[96px]" aria-label="Fila de produção">
      <div className="nc-kicker flex items-center justify-between">
        <span>Fila</span>
        <span className="font-mono">
          {b.queue.length}/{PRODUCTION_QUEUE_LIMIT}
        </span>
      </div>
      {first ? (
        <div className="border border-brass-400/50 bg-white/[0.04] p-1" title={`Produzindo: ${producibleLabel(first.unitType)}`}>
          <div className="cmd-card-view !h-[40px] [@media(max-height:520px)]:!h-[26px]">
            {thumbs[first.unitType] ? <img src={thumbs[first.unitType]} alt="" /> : <span className="text-lg">{producibleIcon(first.unitType)}</span>}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-semibold text-ink-100">{producibleLabel(first.unitType)}</div>
          <div className="mt-0.5 h-1 overflow-hidden bg-white/10">
            <div className="h-full bg-brass-400 shadow-[0_0_6px_rgb(226_181_77/0.5)] transition-[width] duration-300" style={{ width: `${first.progress * 100}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex h-[70px] items-center justify-center border border-dashed border-white/15 text-center text-[10px] text-ink-400">Fila vazia</div>
      )}
      <div className="grid grid-cols-4 gap-0.5 [@media(max-height:520px)]:hidden">
        {Array.from({ length: PRODUCTION_QUEUE_LIMIT - 1 }, (_, i) => {
          const q = rest[i];
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center overflow-hidden border ${q ? 'border-white/20 bg-white/[0.04]' : 'border-dashed border-white/15'}`}
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
          <Undo2 size={12} aria-hidden /> Cancelar
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
  const color = f > 0.6 ? '#5cc47a' : f > 0.3 ? '#e0b44c' : '#e05a4c';
  // vida em 10 segmentos (Sala de Situação): lê de longe quanto falta
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs">
      <div className="flex h-2 w-40 gap-[2px]" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max} aria-label="Vida">
        {Array.from({ length: 10 }, (_, i) => {
          const part = Math.max(0, Math.min(1, f * 10 - i));
          return (
            <span key={i} className="relative flex-1 bg-white/[0.08]">
              <span className="absolute inset-y-0 left-0" style={{ width: `${part * 100}%`, background: color }} />
            </span>
          );
        })}
      </div>
      <span className="nc-num text-ink-200">
        {Math.ceil(hp)}/{max}
      </span>
    </div>
  );
}

/** Nível da construção em marcadores (um por nível, os alcançados em latão) e a especialização. */
function LevelPips({ level, max, spec, specLabel }: { level: number; max: number; spec: string | null; specLabel: string | null }) {
  return (
    <div className="mt-1.5 flex items-center gap-[3px]" title={`Nível ${level} de ${max}${spec ? ` · ${spec}` : ''}`} aria-label={`Nível ${level} de ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-3 ${i < level ? 'bg-brass-400 shadow-[0_0_6px_rgb(226_181_77/0.4)]' : 'bg-white/10'}`}
          style={{ clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' }}
        />
      ))}
      <span className="nc-kicker ml-1.5 whitespace-nowrap text-brass-400/90">
        Nv {level}/{max}
        {specLabel ? ` · ${specLabel}` : ''}
      </span>
    </div>
  );
}

/** Detalhe do saldo por dia (dica do cartão e do prédio): produção menos área, serviço e energia. */
function dayText(d: { produce: number; area: number; service: number; energy: number; net: number }): string {
  const parts = [d.produce > 0 ? `produção +$${usdDay(d.produce)}` : null, d.service > 0 ? `serviço público −$${usdDay(d.service)}` : null, d.energy > 0 ? `energia −$${usdDay(d.energy)}` : null, d.area > 0 ? `área −$${usdDay(d.area)}` : null].filter(Boolean);
  return `Saldo no caixa do país: ${d.net >= 0 ? '+' : '−'}$${usdDay(d.net)}/dia (${parts.join(' · ')})${d.produce > 0 ? ' — produção estimada' : ''}`;
}

const AREA_ICON: Record<string, LucideIcon> = { Blindagem: Shield, Precisão: Target, Comunicações: RadioTower, Detecção: Telescope, 'Mobilidade e logística': Cog };

function AreaIcon({ area, size }: { area: string; size: number }) {
  const Icon = AREA_ICON[area] ?? ArrowBigUp;
  return <Icon size={size} className="inline-block align-[-2px]" aria-hidden />;
}

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
            icon={<AreaIcon area={def.area} size={20} />}
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
          icon={<Undo2 size={20} />}
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
      <AreaIcon area={def.area} size={11} /> {def.label}
    </span>
  );
}

/** Navio de transporte: vagas ocupadas, tropas a bordo e como embarcar e desembarcar. */
function CargoInfo({ cargo, capacity }: { cargo: UnitType[]; capacity: { infantry: number; vehicles: number } }) {
  const foot = cargo.filter((t) => NAVAL.slotOf(t) === 'infantry').length;
  const cars = cargo.length - foot;
  const used = cargo.length;
  const counts = new Map<UnitType, number>();
  for (const t of cargo) counts.set(t, (counts.get(t) ?? 0) + 1);
  return (
    <div className="mt-1.5 text-xs text-ink-400">
      <div className="text-ink-200">
        A bordo: {foot}/{capacity.infantry} a pé{capacity.vehicles ? ` · ${cars}/${capacity.vehicles} veículos` : ''}
        {counts.size > 0 && <span className="text-ink-400"> · {[...counts].map(([t, n]) => `${n}× ${UNITS[t].label}`).join(', ')}</span>}
      </div>
      <div className="mt-0.5 leading-snug">
        {used > 0
          ? 'Botão direito na terra: encosta na costa mais perto e desembarca as tropas. Em território de outra nação, só em guerra.'
          : 'Selecione tropas de terra e clique com o botão direito no navio para embarcar.'}
      </div>
    </div>
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
          <dt>Patente</dt>
          <dd className="text-ink-200" title="Veterania: cada patente dá +10% de dano e +8% de vida máxima">
            {u.rank > 0 && <span className="text-brass-400">{'︽'.repeat(u.rank)} </span>}
            {RANKS[u.rank]?.label ?? 'Recruta'}
            {u.rank > 0 && <span className="text-ink-400"> (+{Math.round(RANK_DAMAGE * u.rank * 100)}% dano, +{Math.round(RANK_HP * u.rank * 100)}% vida)</span>}
            <span className="text-ink-400">
              {' '}
              · {u.kills} {u.kills === 1 ? 'abate' : 'abates'}
              {RANKS[u.rank + 1] ? `, próxima em ${RANKS[u.rank + 1]!.kills}` : ''}
            </span>
          </dd>
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
        {def.cargo && <CargoInfo cargo={u.cargo ?? []} capacity={def.cargo} />}
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

/** Situação da caravana interna da prefeitura selecionada. */
/** Mercado interno: vende o excedente por suprimentos; o preço cai com a pressão das vendas recentes. */
function MarketInfo({ b, runtime }: { b: { id: number }; runtime: GameRuntime }) {
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  const res = me?.resources;
  if (!res) return null;
  const pressure = me.market ?? {};
  // espaço no armazém de suprimentos (sem espaço, a venda é recusada)
  const room = me.capacity && me.capacity.supplies > 0 ? me.capacity.supplies - res.supplies : Infinity;
  return (
    <div className="mt-1.5">
      <div className="text-[11px] font-semibold text-ink-200" title="Troca o excedente por suprimentos. Cada venda baixa o preço daquele recurso; o preço volta ao normal com o tempo (1.000 vendidos se recuperam em cerca de 8 min). Vender aos poucos rende o mesmo que vender de uma vez.">
        Mercado interno: vender por suprimentos{room < 20 ? ' (armazém de suprimentos cheio)' : ''}
      </div>
      <div className="mt-0.5 grid w-fit grid-cols-2 gap-x-6 gap-y-0.5">
        {MARKET_RESOURCES.map((r) => {
          const p = pressure[r] ?? 0;
          const price = marketPrice(r, p);
          const full = MARKET.rates[r];
          return (
            <div key={r} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-14 text-ink-300">{RESOURCE_LABELS[r]}</span>
              <span className={`w-14 ${price < full * 0.75 ? 'text-amber-300' : 'text-ink-400'}`} title={`Preço cheio: ${full} suprimento por unidade`}>
                {price.toFixed(2)}/un
              </span>
              {MARKET.lots.map((q) => {
                const gain = marketQuote(r, p, q);
                const ok = res[r] >= q && gain > 0 && gain <= room;
                return (
                  <button
                    key={q}
                    disabled={!ok}
                    onClick={() => runtime.send({ type: 'market_sell', buildingId: b.id, resource: r, quantity: q })}
                    className="rounded bg-ink-800 px-1.5 py-0.5 text-ink-200 hover:bg-ink-700 disabled:opacity-40"
                    title={`Vender ${q} de ${RESOURCE_LABELS[r].toLowerCase()} por ${gain} suprimentos`}
                  >
                    {q} → +{gain}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div
        className="mt-1.5 text-[11px] font-semibold text-ink-200"
        title="Compra recursos pagando suprimentos. Custa mais do que a venda rende (comprar e revender dá prejuízo), e cada compra encarece aquele recurso; o preço volta ao normal com o tempo."
      >
        Mercado interno: comprar com suprimentos
      </div>
      <div className="mt-0.5 grid w-fit grid-cols-2 gap-x-6 gap-y-0.5">
        {MARKET_RESOURCES.map((r) => {
          const d = me.marketDemand?.[r] ?? 0;
          const price = marketBuyPrice(r, d);
          const roomR = me.capacity ? me.capacity[r] - res[r] : Infinity;
          return (
            <div key={r} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-14 text-ink-300">{RESOURCE_LABELS[r]}</span>
              <span className={`w-14 ${price > MARKET.rates[r] * MARKET.buySpread * 1.25 ? 'text-amber-300' : 'text-ink-400'}`}>{price.toFixed(2)}/un</span>
              {MARKET.lots.map((q) => {
                const cost = marketBuyQuote(r, d, q);
                const ok = res.supplies >= cost && roomR >= q;
                return (
                  <button
                    key={q}
                    disabled={!ok}
                    onClick={() => runtime.send({ type: 'market_buy', buildingId: b.id, resource: r, quantity: q })}
                    className="rounded bg-ink-800 px-1.5 py-0.5 text-ink-200 hover:bg-ink-700 disabled:opacity-40"
                    title={roomR < q ? `Sem espaço no armazém para ${q} de ${RESOURCE_LABELS[r].toLowerCase()}` : `Comprar ${q} de ${RESOURCE_LABELS[r].toLowerCase()} por ${cost} suprimentos`}
                  >
                    +{q} ← {cost}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Consumo de energia da construção (cresce com a era) e o que acontece no escuro. */
/** Construtores da obra (01/11): até 4 cidadãos, cada um vale 25% da velocidade; sem nenhum, a obra para. */
function BuildersLine({ b, runtime }: { b: { id: number; builders?: number; builderTarget?: number }; runtime: GameRuntime }) {
  const n = b.builders ?? 0;
  const target = b.builderTarget ?? BUILDERS.max;
  const speed = Math.round((n / BUILDERS.max) * 100);
  return (
    <div className="mt-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-ink-400">
          <HardHat size={12} className="inline-block align-[-2px]" aria-hidden /> Construtores
        </span>
        <button className="btn min-h-7 px-2 py-0 text-xs" aria-label="Menos construtores" disabled={target <= 1} onClick={() => runtime.send({ type: 'set_builders', buildingId: b.id, count: target - 1 })}>
          −
        </button>
        <span className="font-mono text-ink-100" title="Na obra / alvo">
          {n}/{target}
        </span>
        <button className="btn min-h-7 px-2 py-0 text-xs" aria-label="Mais construtores" disabled={target >= BUILDERS.max} onClick={() => runtime.send({ type: 'set_builders', buildingId: b.id, count: target + 1 })}>
          +
        </button>
        <span className={n ? 'text-ink-400' : 'font-semibold text-red-400'}>{n ? `velocidade ${speed}%` : 'obra parada'}</span>
      </div>
      {n < target && <div className="mt-0.5 text-[11px] text-brass-400">Faltam cidadãos: forme mais no Centro de Comando.</div>}
    </div>
  );
}

function PowerUseLine({ b }: { b: { type: BuildingType; owner: number; unpowered?: boolean } }) {
  const me = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot));
  if (!me?.power || b.owner !== useHudStore.getState().mySlot) return null;
  const rule = POWER_USE[b.type]!;
  const dark = rule.stops ? 'para sem luz' : rule.slows ? 'rende metade sem luz' : 'fica no escuro sem luz';
  return (
    <div className={`text-[11px] ${b.unpowered ? 'text-red-300' : 'text-ink-400'}`} title="O consumo cresce a cada era. Ligue a construção à rede (estradas, usinas e QG) e mantenha a geração acima da demanda.">
      <Zap size={12} className="inline-block align-[-2px]" aria-hidden /> Consome {powerUse(b.type, effectiveEra(me))} de energia · {b.unpowered ? 'SEM LUZ agora' : dark}
    </div>
  );
}

function CaravanInfo({ cityId }: { cityId: number }) {
  const c = useHudStore((s) => s.caravans.find((x) => x.cityId === cityId));
  if (!c) return <div className="text-[11px] text-ink-400">
        <Truck size={12} className="inline-block align-[-2px]" aria-hidden /> Caravana: saindo do Centro de Comando…
      </div>;
  const income = c.income ? ` · +${c.income} suprimentos por chegada` : '';
  const text =
    c.state === 'moving'
      ? `a caminho ${c.to === 'hq' ? 'do Centro de Comando' : 'da prefeitura'}${income}`
      : c.state === 'unloading'
        ? `descarregando${income}`
        : c.state === 'no_road'
          ? 'parada: falta uma estrada contínua até o Centro de Comando (ou ela passa por território inimigo em guerra)'
          : `destruída por forças inimigas; outra sai do Centro de Comando em ${c.waitSeconds ?? 0} s`;
  return (
    <div className={`text-[11px] ${c.state === 'destroyed' || c.state === 'no_road' ? 'text-amber-300' : 'text-ink-400'}`} title="A caravana só anda por estrada: ligue a prefeitura ao Centro de Comando com uma estrada contínua (ferramenta Estrada). Rende mais com rota longa. Tropas e torres inimigas destroem a caravana no caminho.">
      <Truck size={12} className="inline-block align-[-2px]" aria-hidden /> Caravana: {text}
    </div>
  );
}

function BuildingInfo({ b, runtime }: { b: NonNullable<ReturnType<typeof useHudStore.getState>['selectedBuilding']>; runtime: GameRuntime }) {
  const def = BUILDINGS[b.type];
  const done = b.progress >= 1;
  const track = upgradeTrack(b.type);
  const spec = specDef(b.type, b.spec);
  // valores do nível e da especialização atuais (os de base valem só no nível 1)
  const fx = buildingEffects(b.type, b.level, b.spec);
  const thumbs = useHudStore((s) => s.thumbs);
  const mySlot = useHudStore((s) => s.mySlot);
  const myEra = effectiveEra(useHudStore((s) => s.players.find((p) => p.slot === mySlot)));
  const usdScale = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot)?.research.usdScale ?? null);
  // saldo real por dia (com o rendimento atual da coleta), como no cartão de construção
  const day0 = done && usdScale !== null ? buildingDayUsd(b.type, { era: myEra, scale: usdScale, rate: b.rate }) : null;
  // saldo praticamente zero (o QG não paga área): não mostra a linha
  const day = day0 && Math.abs(day0.net) >= 50 ? day0 : null;
  return (
    <div>
      {/* cabeçalho (Sala de Situação, 05/11): retrato 3D, nome, nível em marcadores e vida segmentada */}
      <div className="flex gap-2.5">
        {thumbs[b.type] && (
          <div className="cmd-card-view !h-[54px] !w-[72px] shrink-0 border border-white/10 [@media(max-height:520px)]:hidden" aria-hidden>
            <img src={thumbs[b.type]} alt="" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="nc-title truncate text-[17px] leading-none">{def.label}</span>
            {done && b.status !== 'ok' && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brass-400">
                <TriangleAlert size={12} aria-hidden />
                {STATUS_TEXT[b.status].split(':')[0]}
              </span>
            )}
          </div>
          {track && done && <LevelPips level={b.level} max={track.maxLevel} spec={spec ? `${spec.label}: ${spec.summary}` : null} specLabel={spec?.label ?? null} />}
          <HpLine hp={b.hp} max={b.maxHp} />
        </div>
      </div>
      {day && (
        <div className="mt-1 text-[11px]" title={dayText(day)}>
          <span className="nc-kicker mr-1.5">Saldo</span>
          <span className={`nc-num font-bold ${day.net >= 0 ? 'text-signal-green' : 'text-red-300'}`}>
            $ {day.net >= 0 ? '+' : '−'}
            {usdDay(day.net)}/dia
          </span>
        </div>
      )}
      {b.upgrade && (
        <div className="mt-1 flex items-center gap-2 text-xs text-brass-400">
          Obra para o nível {b.upgrade.toLevel}: {Math.round(b.upgrade.progress * 100)}% (opera a 50% durante a obra)
        </div>
      )}
      {!done ? (
        <>
          <div className="mt-2 text-xs text-ink-400">Em construção: {Math.round(b.progress * 100)}%</div>
          {b.builderTarget !== undefined && <BuildersLine b={b} runtime={runtime} />}
        </>
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
      {done && POWER_USE[b.type] && <PowerUseLine b={b} />}
      {done && def.gather && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-signal-green">
          <ResourceIcon type={def.gather.resource} />+{b.rate.toFixed(2)} {RESOURCE_LABELS[def.gather.resource].toLowerCase()}/s
          {def.gather.terrain !== null && <span className="text-ink-400">· {b.claims} células</span>}
        </div>
      )}
      {done && b.roadLinked !== null && (
        <div
          className={`text-[11px] ${b.roadLinked ? 'text-signal-green' : 'text-ink-400'}`}
          title={`Coletas, Refinaria e Siderúrgica ligadas por estrada contínua ao Centro de Comando ou a uma prefeitura produzem ${Math.round((ROAD.productionMul - 1) * 100)}% a mais.`}
        >
          <Route size={12} className="mr-1 inline-block align-[-2px]" aria-hidden />
          {b.roadLinked
            ? `Ligada por estrada: +${Math.round((ROAD.productionMul - 1) * 100)}% de produção`
            : `Sem estrada até o QG ou uma prefeitura: pavimente para +${Math.round((ROAD.productionMul - 1) * 100)}% de produção`}
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
      {done && b.type === 'iron_dome' && b.owner === useHudStore.getState().mySlot && <DomeInfo b={b} />}
      {done && b.type === 'city_hall' && b.owner === useHudStore.getState().mySlot && <CaravanInfo cityId={b.id} />}
      {done && b.type === 'market' && b.owner === useHudStore.getState().mySlot && <MarketInfo b={b} runtime={runtime} />}
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
