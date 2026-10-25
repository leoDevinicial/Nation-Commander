import { BUILDINGS, UNITS, type BuildingType, type UnitType } from '../../../shared/sim/config.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { factionColor } from '../../game/render/palette.ts';
import { useHudStore } from '../../state/useHudStore.ts';

const BUILD_OPTIONS: { type: BuildingType; key: string }[] = [
  { type: 'barracks', key: 'B' },
  { type: 'factory', key: 'N' },
  { type: 'extractor', key: 'J' },
];

const ACTIVITY: Record<string, string> = { idle: 'Parada', moving: 'Movendo', chasing: 'Perseguindo', attacking: 'Atacando' };

export function CommandPanel({ runtime }: { runtime: GameRuntime }) {
  const units = useHudStore((s) => s.selectedUnits);
  const building = useHudStore((s) => s.selectedBuilding);
  const inspected = useHudStore((s) => s.inspected);
  const mode = useHudStore((s) => s.mode);
  const players = useHudStore((s) => s.players);
  const mySlot = useHudStore((s) => s.mySlot);
  const resources = players.find((p) => p.slot === mySlot)?.resources ?? 0;

  return (
    <div className="panel pointer-events-auto flex h-[180px] min-w-0 flex-1 gap-4 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="min-w-0 flex-1 overflow-hidden">
        {mode.kind === 'place' && (
          <ModeHint
            title={`Posicionar ${BUILDINGS[mode.buildingType].label}`}
            text={mode.valid ? 'Clique esquerdo para construir. Botão direito ou Esc cancela.' : `Posição inválida: ${mode.reason ?? '—'}`}
            bad={!mode.valid}
          />
        )}
        {mode.kind === 'attack_move' && <ModeHint title="Avançar atacando" text="Clique no destino. As unidades atacam o que encontrarem pelo caminho." />}
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
        {mode.kind === 'normal' && units.length === 0 && !building && !inspected && (
          <div className="text-xs leading-relaxed text-ink-400">
            <div className="mb-1 text-sm font-semibold text-ink-200">Nenhuma seleção</div>
            Clique ou arraste para selecionar · Botão direito: mover/atacar · F: avançar atacando · X: parar · H: QG · Ctrl+1–9: grupos ·
            WASD/setas: câmera · Q/E: girar · Roda: zoom · Espaço: pausa
          </div>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-4 content-start gap-1.5">
        {units.length > 0 && mode.kind === 'normal' && (
          <>
            <button className="cmd-btn" onClick={() => runtime.startAttackMove()} title="Avançar atacando (F)">
              <span className="hotkey">F</span>⚔<span>Avançar</span>
            </button>
            <button className="cmd-btn" onClick={() => runtime.stopSelected()} title="Parar (X)">
              <span className="hotkey">X</span>■<span>Parar</span>
            </button>
          </>
        )}
        {mode.kind !== 'normal' && (
          <button className="cmd-btn" onClick={() => runtime.cancelMode()} title="Cancelar (Esc)">
            <span className="hotkey">Esc</span>✖<span>Cancelar</span>
          </button>
        )}
        {building?.type === 'hq' &&
          mode.kind === 'normal' &&
          BUILD_OPTIONS.map(({ type, key }) => {
            const def = BUILDINGS[type];
            return (
              <button
                key={type}
                className="cmd-btn"
                disabled={resources < def.cost}
                onClick={() => runtime.startPlacement(type)}
                title={`${def.label} — ${def.description}\nCusto: ${def.cost} · Tempo: ${def.buildSeconds}s · Vida: ${def.maxHp}`}
              >
                <span className="hotkey">{key}</span>
                <span className="font-semibold">{def.label}</span>
                <span className="font-mono text-brass-400">◆{def.cost}</span>
                <span className="text-ink-400">{def.buildSeconds}s</span>
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

function ProduceButtons({ runtime, type, resources }: { runtime: GameRuntime; type: BuildingType; resources: number }) {
  const options = (Object.keys(UNITS) as UnitType[]).filter((u) => UNITS[u].producedBy === type);
  return (
    <>
      {options.map((u) => {
        const def = UNITS[u];
        return (
          <button
            key={u}
            className="cmd-btn"
            disabled={resources < def.cost}
            onClick={() => runtime.produce(u)}
            title={`${def.label} — ${def.description}\nCusto: ${def.cost} · Tempo: ${def.buildSeconds}s · Vida: ${def.maxHp} · Dano: ${def.weapon.damage} · Alcance: ${def.weapon.range}`}
          >
            <span className="hotkey">{u === 'infantry' ? 'I' : 'T'}</span>
            <span className="font-semibold">{def.label}</span>
            <span className="font-mono text-brass-400">◆{def.cost}</span>
            <span className="text-ink-400">{def.buildSeconds}s</span>
          </button>
        );
      })}
      <button className="cmd-btn" onClick={() => runtime.cancelProduction()} title="Cancelar último item da fila (Delete) — reembolso integral">
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
      {def.income > 0 && b.progress >= 1 && <div className="text-xs text-signal-green">Gera +{def.income} suprimentos/s</div>}
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
