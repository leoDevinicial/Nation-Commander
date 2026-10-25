import { useState } from 'react';
import { BUILDINGS, RESOURCE_LABELS, UNITS, canAfford, type BuildingType, type Stockpile, type UnitType } from '../../../shared/sim/config.ts';
import { gatherRate } from '../../../shared/sim/gathering.ts';
import { CostLabel, ResourceIcon } from '../components/Resources.tsx';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { useHudStore } from '../../state/useHudStore.ts';

const BUILD_OPTIONS: BuildingType[] = ['farm', 'sawmill', 'quarry', 'oil_well', 'barracks', 'factory', 'tower'];
const EMPTY: Stockpile = { supplies: 0, food: 0, wood: 0, stone: 0, oil: 0 };

const ACTIVITY: Record<string, string> = { idle: 'Parada', moving: 'Movendo', chasing: 'Perseguindo', attacking: 'Atacando' };

export function CommandPanel({ runtime }: { runtime: GameRuntime }) {
  const units = useHudStore((s) => s.selectedUnits);
  const building = useHudStore((s) => s.selectedBuilding);
  const inspected = useHudStore((s) => s.inspected);
  const mode = useHudStore((s) => s.mode);
  const players = useHudStore((s) => s.players);
  const mySlot = useHudStore((s) => s.mySlot);
  const resources = players.find((p) => p.slot === mySlot)?.resources ?? EMPTY;
  const touch = useHudStore((s) => s.touchUi);
  const [help, setHelp] = useState(false);

  return (
    <div
      className="panel pointer-events-auto flex min-w-0 flex-1 flex-col gap-2 p-2 sm:h-[180px] sm:flex-row sm:gap-4 sm:p-3 [@media(max-height:520px)]:h-auto [@media(max-height:520px)]:max-h-[128px] [@media(max-height:520px)]:flex-row [@media(max-height:520px)]:gap-2 [@media(max-height:520px)]:p-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
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
        {mode.kind === 'attack_move' && (
          <ModeHint title="Avançar atacando" text={`${touch ? 'Toque' : 'Clique'} no destino. As unidades atacam o que encontrarem pelo caminho.`} />
        )}
        {mode.kind === 'normal' && units.length > 0 && <UnitsInfo units={units} />}
        {mode.kind === 'normal' && units.length === 0 && building && <BuildingInfo b={building} />}
        {mode.kind === 'normal' && units.length === 0 && !building && inspected && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: factionColor(inspected.owner) }} aria-hidden />
              {inspected.kind === 'unit' ? UNITS[inspected.type as UnitType].label : BUILDINGS[inspected.type as BuildingType].label}
              <span className="text-xs text-red-300">(inimigo)</span>
            </div>
            <HpLine hp={inspected.hp} max={inspected.kind === 'unit' ? UNITS[inspected.type as UnitType].maxHp : BUILDINGS[inspected.type as BuildingType].maxHp} />
          </div>
        )}
        {mode.kind === 'normal' && units.length === 0 && !building && !inspected && touch && (
          <div className="text-xs leading-relaxed text-ink-400">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-200">Nenhuma seleção</span>
              <button className="btn min-h-7 px-2 py-0.5 text-[11px]" aria-expanded={help} onClick={() => setHelp(!help)}>
                {help ? 'Menos Ajuda' : 'Ajuda'}
              </button>
            </div>
            {help ? (
              <>
                Toque para selecionar · dois toques: todas do tipo · toque longo: mover/atacar · arraste: câmera · pinça: zoom · gire dois dedos:
                rotação. Ferramentas à direita: Ordem, Área (seleção por retângulo), Somar e QG. Toque no Centro de Comando para construir.
              </>
            ) : (
              'Toque: selecionar · toque longo: ordem · arraste: câmera · pinça: zoom'
            )}
          </div>
        )}
        {mode.kind === 'normal' && units.length === 0 && !building && !inspected && !touch && (
          <div className="text-xs leading-relaxed text-ink-400">
            <div className="mb-1 text-sm font-semibold text-ink-200">Nenhuma seleção</div>
            Clique ou arraste para selecionar · Botão direito: mover/atacar · F: avançar atacando · X: parar · H: Centro de Comando ·
            Ctrl+1–9: grupos · WASD/setas: câmera · Q/E: girar · Roda: zoom · Espaço: pausa · G: painel nacional. Selecione o Centro de
            Comando para construir: fazendas no solo fértil, serrarias junto à floresta, pedreiras junto às rochas e poços sobre o petróleo.
          </div>
        )}
      </div>
      <div className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto sm:grid sm:grid-cols-4 sm:content-start sm:overflow-x-visible sm:overflow-y-auto [@media(max-height:520px)]:grid [@media(max-height:520px)]:grid-cols-4 [@media(max-height:520px)]:content-start [@media(max-height:520px)]:overflow-y-auto">
        {units.length > 0 && mode.kind === 'normal' && (
          <>
            <button className="cmd-btn shrink-0" onClick={() => runtime.startAttackMove()} title="Avançar atacando (F)">
              <span className="hotkey">F</span>⚔<span>Avançar</span>
            </button>
            <button className="cmd-btn shrink-0" onClick={() => runtime.stopSelected()} title="Parar (X)">
              <span className="hotkey">X</span>■<span>Parar</span>
            </button>
          </>
        )}
        {mode.kind === 'place' && touch && (
          <button className="cmd-btn shrink-0" disabled={!mode.valid} onClick={() => runtime.confirmPlacement()} title="Construir na posição marcada">
            <span className="text-base" aria-hidden>
              ✔
            </span>
            <span>Confirmar</span>
          </button>
        )}
        {mode.kind !== 'normal' && (
          <button className="cmd-btn shrink-0" onClick={() => runtime.cancelMode()} title="Cancelar (Esc)">
            <span className="hotkey">Esc</span>✖<span>Cancelar</span>
          </button>
        )}
        {building?.type === 'hq' &&
          mode.kind === 'normal' &&
          BUILD_OPTIONS.map((type) => {
            const def = BUILDINGS[type];
            return (
              <button
                key={type}
                className="cmd-btn shrink-0"
                disabled={!canAfford(resources, def.cost)}
                onClick={() => runtime.startPlacement(type)}
                title={`${def.label} — ${def.description}\nTempo: ${def.buildSeconds}s · Vida: ${def.maxHp}`}
              >
                <span className="hotkey">{def.hotkey}</span>
                <span className="font-semibold">{def.label}</span>
                <CostLabel cost={def.cost} have={resources} compact />
              </button>
            );
          })}
        {building && building.progress >= 1 && (building.type === 'barracks' || building.type === 'factory') && (
          <ProduceButtons runtime={runtime} type={building.type} resources={resources} />
        )}
      </div>
    </div>
  );
}

function ProduceButtons({ runtime, type, resources }: { runtime: GameRuntime; type: BuildingType; resources: Stockpile }) {
  const options = (Object.keys(UNITS) as UnitType[]).filter((u) => UNITS[u].producedBy === type);
  return (
    <>
      {options.map((u) => {
        const def = UNITS[u];
        return (
          <button
            key={u}
            className="cmd-btn shrink-0"
            disabled={!canAfford(resources, def.cost)}
            onClick={() => runtime.produce(u)}
            title={`${def.label} — ${def.description}\nTempo: ${def.buildSeconds}s · Vida: ${def.maxHp} · Dano: ${def.weapon.damage} · Alcance: ${def.weapon.range} · Visão: ${def.sight}`}
          >
            <span className="hotkey">{def.hotkey}</span>
            <span className="font-semibold">{def.label}</span>
            <CostLabel cost={def.cost} have={resources} compact />
          </button>
        );
      })}
      <button className="cmd-btn shrink-0" onClick={() => runtime.cancelProduction()} title="Cancelar último item da fila (Delete) — reembolso integral">
        <span className="hotkey">Del</span>↶<span>Cancelar</span>
      </button>
    </>
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
        <div className="h-full" style={{ width: `${f * 100}%`, background: f > 0.6 ? '#5cc47a' : f > 0.3 ? '#e0b44c' : '#e05a4c' }} />
      </div>
      <span className="font-mono text-ink-200">
        {Math.ceil(hp)}/{max}
      </span>
    </div>
  );
}

function UnitsInfo({ units }: { units: ReturnType<typeof useHudStore.getState>['selectedUnits'] }) {
  if (units.length === 1) {
    const u = units[0]!;
    const def = UNITS[u.type];
    return (
      <div>
        <div className="text-sm font-semibold">{def.label}</div>
        <HpLine hp={u.hp} max={def.maxHp} />
        <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-ink-400">
          <dt>Estado</dt>
          <dd className="col-span-2 text-ink-200">{ACTIVITY[u.activity] ?? u.activity}</dd>
          <dt>Dano / cadência</dt>
          <dd className="col-span-2 text-ink-200">
            {def.weapon.damage} a cada {def.weapon.cooldown}s
          </dd>
          <dt>Alcance / visão</dt>
          <dd className="col-span-2 text-ink-200">
            {def.weapon.range} / {def.sight}
          </dd>
        </dl>
      </div>
    );
  }
  const counts = new Map<UnitType, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return (
    <div>
      <div className="text-sm font-semibold">{units.length} unidades</div>
      <div className="mt-1 text-xs text-ink-400">{[...counts].map(([t, n]) => `${n}× ${UNITS[t].label}`).join(' · ')}</div>
      <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-hidden">
        {units.slice(0, 40).map((u) => {
          const f = u.hp / UNITS[u.type].maxHp;
          return (
            <div key={u.id} className="flex h-7 w-7 flex-col justify-between rounded border border-ink-600 bg-ink-850 p-0.5" title={`${UNITS[u.type].label} — ${Math.ceil(u.hp)} PV`}>
              <span className="text-center text-[10px] leading-none">{u.type === 'tank' ? '▣' : '●'}</span>
              <span className="h-1 rounded" style={{ width: `${f * 100}%`, background: f > 0.6 ? '#5cc47a' : f > 0.3 ? '#e0b44c' : '#e05a4c' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuildingInfo({ b }: { b: NonNullable<ReturnType<typeof useHudStore.getState>['selectedBuilding']> }) {
  const def = BUILDINGS[b.type];
  return (
    <div>
      <div className="text-sm font-semibold">{def.label}</div>
      <HpLine hp={b.hp} max={def.maxHp} />
      {b.progress < 1 ? (
        <div className="mt-2 text-xs text-ink-400">Em construção: {Math.round(b.progress * 100)}%</div>
      ) : (
        <div className="mt-2 text-xs text-ink-400">{def.description}</div>
      )}
      {b.progress >= 1 && def.income.supplies ? <div className="text-xs text-signal-green">Gera +{def.income.supplies} suprimentos/s</div> : null}
      {b.progress >= 1 && def.gather && (
        <div className="flex items-center gap-1.5 text-xs text-signal-green">
          <ResourceIcon type={def.gather.resource} />
          {def.gather.terrain === null
            ? `Extrai +${gatherRate(b.type, 1).toFixed(1)} ${RESOURCE_LABELS[def.gather.resource].toLowerCase()}/s`
            : `Explora ${b.claims} células → +${gatherRate(b.type, b.claims).toFixed(1)} ${RESOURCE_LABELS[def.gather.resource].toLowerCase()}/s`}
        </div>
      )}
      {b.type === 'hq' && <div className="text-xs text-ink-400">Construa dentro de {def.buildRadius} células do QG (ou 8 de outras estruturas).</div>}
      {b.queue.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          {b.queue.map((q, i) => (
            <div key={i} className="relative h-9 w-9 overflow-hidden rounded border border-ink-600 bg-ink-850 text-center text-[10px] leading-9" title={UNITS[q.unitType].label}>
              {q.unitType === 'tank' ? '▣' : '●'}
              {i === 0 && <div className="absolute bottom-0 left-0 h-1 bg-brass-400" style={{ width: `${q.progress * 100}%` }} />}
            </div>
          ))}
        </div>
      )}
      {(b.type === 'barracks' || b.type === 'factory') && b.progress >= 1 && (
        <div className="mt-1 text-[11px] text-ink-400">Botão direito no mapa define o ponto de reunião{b.hasRally ? ' (definido)' : ''}.</div>
      )}
    </div>
  );
}
