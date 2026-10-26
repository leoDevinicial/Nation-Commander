import { useEffect, useState } from 'react';
import { UNITS, type UnitType } from '../../../shared/sim/config.ts';
import { countryName } from '../../../shared/data/countries.ts';
import { geoOf } from '../../../shared/data/geography.ts';
import { BIOME_LABELS, INFRA_LABELS, sectorById } from '../../../shared/data/sectors.ts';
import { OPS, operationCost, type OperationView, type SectorView } from '../../../shared/strategic/operations.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { loadWorldGeo, type WorldGeo } from '../../globe/worldGeo.ts';
import { formatUsd } from '../../lib/format.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';
import { useOpsStore } from '../../state/useOpsStore.ts';
import { factionColor } from '../../game/render/palette.ts';

const UNIT_ORDER: UnitType[] = ['infantry', 'apc', 'tank', 'artillery'];
const STATE_LABEL: Record<OperationView['state'], string> = { transit: 'A caminho', battle: 'Em combate', returning: 'Voltando ao teatro', done: 'Concluída' };
export const OUTCOME_LABEL = { victory: 'Vitória: região ocupada', defeat: 'Derrota', retreat: 'Recuo', stalemate: 'Impasse: recuo por tempo' } as const;

type Box = { minLon: number; maxLon: number; minLat: number; maxLat: number };

/** Projeção equirretangular local (largura corrigida pelo cosseno da latitude média). */
function projector(box: Box, w: number, h: number) {
  const k = Math.cos((((box.minLat + box.maxLat) / 2) * Math.PI) / 180);
  const spanX = (box.maxLon - box.minLon) * k;
  const spanY = box.maxLat - box.minLat;
  const s = Math.min(w / spanX, h / spanY);
  const ox = (w - spanX * s) / 2;
  const oy = (h - spanY * s) / 2;
  return (lon: number, lat: number): [number, number] => [ox + (lon - box.minLon) * k * s, oy + (box.maxLat - lat) * s];
}

/**
 * Mapa operacional de um país da IA em guerra (Fase 8): contorno do país (Natural Earth 1:110m,
 * simplificado), regiões operacionais aproximadas com controle, guarnição estimada, bioma,
 * relevo e infraestrutura; rota a partir do seu país; composição da força e operação em curso.
 */
export function OperationalMap({ runtime, target }: { runtime: GameRuntime; target: number }) {
  const view = useOpsStore((s) => s.view);
  const war = view?.wars.find((w) => w.target === target);
  const op = view?.ops.find((o) => o.target === target && o.state !== 'done') ?? view?.ops.find((o) => o.state !== 'done');
  const lastDone = view?.ops.filter((o) => o.target === target && o.result).at(-1);
  const match = useAppStore((s) => s.match);
  const myCountry = match?.players.find((p) => p.slot === match.yourSlot)?.countryId ?? '';
  const [geo, setGeo] = useState<WorldGeo | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [counts, setCounts] = useState<Partial<Record<UnitType, number>>>({});
  const close = () => useOpsStore.getState().set({ opMap: null });
  useEffect(() => {
    let alive = true;
    loadWorldGeo()
      .then((g) => alive && setGeo(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sectors = war?.sectors ?? [];
  const sel = sectors.find((s) => s.id === selected) ?? null;
  const box: Box | null = (() => {
    if (!sectors.length) return null;
    const lons = sectors.map((s) => s.lon);
    const lats = sectors.map((s) => s.lat);
    const pad = (a: number, b: number) => Math.max(6, (b - a) * 0.45);
    const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
    return { minLon: minLon - pad(minLon, maxLon), maxLon: maxLon + pad(minLon, maxLon), minLat: minLat - pad(minLat, maxLat), maxLat: maxLat + pad(minLat, maxLat) };
  })();
  const W = 600;
  const H = 400;
  const proj = box ? projector(box, W, H) : null;
  const targetIso = geoOf(war?.countryId ?? '')?.isoNumeric;
  const paths = (() => {
    if (!geo || !proj || !box) return [];
    const out: { d: string; target: boolean }[] = [];
    for (const c of geo.countries) {
      for (const poly of c.polygons) {
        const ring = poly[0];
        if (!ring) continue;
        // só polígonos que tocam a área visível
        if (!ring.some(([lon, lat]) => lon! > box.minLon - 15 && lon! < box.maxLon + 15 && lat! > box.minLat - 15 && lat! < box.maxLat + 15)) continue;
        const d = poly
          .map(
            (r) =>
              r
                .map(
                  ([lon, lat], i) =>
                    `${i ? 'L' : 'M'}${proj(lon!, lat!)
                      .map((v) => v.toFixed(1))
                      .join(',')}`,
                )
                .join('') + 'Z',
          )
          .join('');
        out.push({ d, target: c.id === targetIso });
      }
    }
    return out;
  })();

  // força disponível no teatro
  const forces = runtime.myForces().filter((u) => !u.refit);
  const available = (t: UnitType) => forces.filter((u) => u.type === t).length;
  const chosen = UNIT_ORDER.flatMap((t) =>
    forces
      .filter((u) => u.type === t)
      .sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)
      .slice(0, counts[t] ?? 0),
  );
  const def = sel ? sectorById(sel.id) : undefined;
  const cost =
    def && chosen.length
      ? operationCost(
          myCountry,
          def,
          chosen.map((u) => u.type),
        )
      : null;
  const res = useHudStore((s) => s.players.find((p) => p.slot === s.mySlot)?.resources);
  const blocker = !sel
    ? 'Escolha uma região no mapa'
    : sel.control === 'occupied'
      ? 'Região já ocupada'
      : op
        ? 'Já há uma operação em andamento'
        : !chosen.length
          ? 'Escolha as unidades'
          : chosen.length > OPS.maxUnits
            ? `No máximo ${OPS.maxUnits} unidades`
            : cost && res && res.supplies < cost.supplies
              ? `Faltam suprimentos (${cost.supplies})`
              : cost && res && res.oil < cost.oil
                ? `Falta petróleo (${cost.oil})`
                : null;
  const launch = () => {
    if (blocker || !sel) return;
    runtime.send({ type: 'launch_operation', target, sectorId: sel.id, unitIds: chosen.map((u) => u.id) });
    setCounts({});
  };
  const mine = factionColor(match?.yourSlot ?? 0);
  // seta da rota: do lado do seu país até a região escolhida (ou o centro)
  const route = (() => {
    const from = geoOf(myCountry)?.capital;
    if (!from || !proj || !box) return null;
    const to = sel ?? sectors[0];
    if (!to) return null;
    const [tx, ty] = proj(to.lon, to.lat);
    const [fx0, fy0] = proj(from.lon, from.lat);
    const dx = fx0 - tx;
    const dy = fy0 - ty;
    const len = Math.hypot(dx, dy) || 1;
    const inside = fx0 >= 0 && fx0 <= W && fy0 >= 0 && fy0 <= H;
    const reach = inside ? len : Math.min(len, Math.min(W, H) * 0.42);
    return { x1: tx + (dx / len) * reach, y1: ty + (dy / len) * reach, x2: tx + (dx / len) * 14, y2: ty + (dy / len) * 14, km: def ? operationCost(myCountry, def, ['infantry']).km : null };
  })();

  return (
    <div
      className="absolute inset-x-0 top-14 bottom-0 z-30 flex flex-col border-t border-ink-700 bg-ink-950/95 sm:flex-row"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Mapa operacional"
    >
      <div className="relative min-h-0 flex-1">
        <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-2">
          <div className="panel px-2 py-1">
            <div className="font-display text-xs font-bold tracking-wide uppercase">Mapa operacional · {countryName(war?.countryId ?? '')}</div>
            <div className="text-[10px] text-ink-400">Regiões e contornos aproximados — não é cartografia exata</div>
          </div>
          <button className="btn min-h-7 px-2 py-0.5 text-[11px]" onClick={close} title="Fechar (Esc)">
            ✖ Fechar
          </button>
        </div>
        {!war ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-400">Sem guerra com este país: declare guerra pelo globo para planejar operações.</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Regiões operacionais">
            <rect width={W} height={H} fill="#0d1a24" />
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.target ? '#3a2422' : '#1d262c'} stroke={p.target ? '#b5524a' : '#3b4952'} strokeWidth={p.target ? 1.2 : 0.6} />
            ))}
            {route && (
              <g>
                <defs>
                  <marker id="op-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={mine} />
                  </marker>
                </defs>
                <line x1={route.x1} y1={route.y1} x2={route.x2} y2={route.y2} stroke={mine} strokeWidth={2} strokeDasharray="6 5" markerEnd="url(#op-arrow)" opacity={0.85} />
                <text x={route.x1} y={route.y1 - 6} fill={mine} fontSize={11} textAnchor="middle">
                  {countryName(myCountry)}
                  {route.km ? ` · ${route.km.toLocaleString('pt-BR')} km` : ''}
                </text>
              </g>
            )}
            {proj &&
              sectors.map((s) => {
                const [x, y] = proj(s.lon, s.lat);
                const r = 9 + s.share * 30;
                const occupied = s.control === 'occupied';
                const active = op?.sectorId === s.id;
                return (
                  <g key={s.id} className="cursor-pointer" onClick={() => setSelected(s.id)} role="button" aria-label={s.name}>
                    <circle cx={x} cy={y} r={r + 6} fill="transparent" />
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={occupied ? mine : '#c0443a'}
                      fillOpacity={0.35}
                      stroke={selected === s.id ? '#f2c94c' : occupied ? mine : '#e06a5c'}
                      strokeWidth={selected === s.id ? 3 : 1.5}
                    />
                    {active && <circle cx={x} cy={y} r={r + 5} fill="none" stroke="#f2c94c" strokeDasharray="3 3" />}
                    <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="#f1efe8" fontWeight={700}>
                      {occupied ? '⚑' : `⚔${s.garrison}`}
                    </text>
                    <text x={x} y={y + r + 13} textAnchor="middle" fontSize={10} fill="#d9d8d0" style={{ paintOrder: 'stroke' }} stroke="#0d1a24" strokeWidth={3}>
                      {s.name.split(' (')[0]}
                    </text>
                  </g>
                );
              })}
          </svg>
        )}
      </div>

      <aside className="scroll-thin max-h-[48%] w-full overflow-y-auto border-t border-ink-700 p-3 text-xs sm:max-h-none sm:w-[340px] sm:border-t-0 sm:border-l">
        {op && <ActiveOperation op={op} runtime={runtime} />}
        {lastDone?.result && !op && (
          <div className="mb-3 rounded border border-ink-700 p-2">
            <div className="font-semibold">Última operação: {lastDone.sectorName}</div>
            <div className="text-ink-300">
              {OUTCOME_LABEL[lastDone.result.outcome]} · {lastDone.result.lost}/{lastDone.result.sent} perdidas · {lastDone.result.enemyLost} baixas inimigas
            </div>
          </div>
        )}
        {!sel ? <p className="text-ink-400">Toque numa região para ver o terreno, a guarnição estimada e planejar uma operação.</p> : <SectorDetail s={sel} />}
        {sel && sel.control !== 'occupied' && !op && (
          <div className="mt-3 space-y-1.5">
            <div className="font-semibold text-ink-100">Força expedicionária (do teatro)</div>
            {UNIT_ORDER.filter((t) => available(t) > 0).map((t) => (
              <div key={t} className="flex items-center gap-2">
                <span className="flex-1">{UNITS[t].label}</span>
                <button className="btn min-h-7 px-2 py-0" aria-label={`Menos ${UNITS[t].label}`} disabled={!counts[t]} onClick={() => setCounts((c) => ({ ...c, [t]: Math.max(0, (c[t] ?? 0) - 1) }))}>
                  −
                </button>
                <span className="w-12 text-center font-mono">
                  {counts[t] ?? 0}/{available(t)}
                </span>
                <button
                  className="btn min-h-7 px-2 py-0"
                  aria-label={`Mais ${UNITS[t].label}`}
                  disabled={(counts[t] ?? 0) >= available(t)}
                  onClick={() => setCounts((c) => ({ ...c, [t]: Math.min(available(t), (c[t] ?? 0) + 1) }))}
                >
                  +
                </button>
              </div>
            ))}
            {forces.length === 0 && <p className="text-ink-400">Nenhuma unidade disponível no teatro.</p>}
            {cost && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 rounded border border-ink-700 p-2 text-[11px]">
                <dt className="text-ink-400">Viagem</dt>
                <dd>
                  {cost.days} dias ({cost.km.toLocaleString('pt-BR')} km) · volta igual
                </dd>
                <dt className="text-ink-400">Custo</dt>
                <dd>
                  {formatUsd(cost.usd)} (dívida) · {cost.supplies} suprimentos · {cost.oil} petróleo
                </dd>
                <dt className="text-ink-400">Munição</dt>
                <dd>cobrada no fim, pelos disparos</dd>
              </dl>
            )}
            <button className="btn btn-danger w-full py-1.5 text-xs" disabled={blocker !== null} onClick={launch} title={blocker ?? 'As unidades saem do teatro, viajam e entram em combate na região'}>
              {blocker ?? `Lançar operação (${chosen.length} unidades)`}
            </button>
            <p className="text-[10px] text-ink-400">
              As unidades escolhidas deixam o teatro durante a operação. Os sobreviventes voltam com a vida e o equipamento que tiverem; as perdas contam como baixas.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function SectorDetail({ s }: { s: SectorView }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-ink-100">{s.name}</div>
      <div className={s.control === 'occupied' ? 'text-signal-green' : 'text-red-300'}>
        {s.control === 'occupied' ? 'Ocupada por suas forças' : `Controle inimigo · guarnição estimada: ${s.garrison} unidades + torres`}
      </div>
      <div className="text-ink-300">{BIOME_LABELS[s.biome]}</div>
      <div className="text-ink-400">{[s.coast && 'costa', s.river && 'rio', s.mountains && 'montanhas'].filter(Boolean).join(' · ') || 'terreno aberto'}</div>
      <div className="text-ink-400">Infraestrutura: {s.infra.map((i) => INFRA_LABELS[i]).join(', ')}</div>
      <div className="text-ink-400">≈ {Math.round(s.share * 100)}% da economia do país</div>
    </div>
  );
}

function ActiveOperation({ op, runtime }: { op: OperationView; runtime: GameRuntime }) {
  const battle = useOpsStore((s) => s.battle);
  const alive = op.units.filter((u) => !u.lost).length;
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mb-3 rounded border border-brass-400/50 bg-ink-900/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink-100">Operação: {op.sectorName.split(' (')[0]}</span>
        <span className="text-brass-400">{STATE_LABEL[op.state]}</span>
      </div>
      <div className="mt-0.5 text-ink-300">
        {alive}/{op.units.length} unidades{op.state === 'transit' || op.state === 'returning' ? ` · ${op.daysLeft} dias` : ''}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {op.state === 'battle' && battle?.opId === op.id && (
          <button className="btn btn-primary px-2 py-1 text-xs" onClick={() => useOpsStore.getState().set({ inBattle: true, opMap: null })}>
            ⚔ Entrar na batalha
          </button>
        )}
        {(op.state === 'battle' || op.state === 'transit') &&
          (confirm ? (
            <>
              <button
                className="btn btn-danger px-2 py-1 text-xs"
                onClick={() => {
                  runtime.send({ type: 'operation_retreat', opId: op.id });
                  setConfirm(false);
                }}
              >
                Confirmar recuo
              </button>
              <button className="btn px-2 py-1 text-xs" onClick={() => setConfirm(false)}>
                Não
              </button>
            </>
          ) : (
            <button className="btn px-2 py-1 text-xs" onClick={() => setConfirm(true)}>
              Recuar
            </button>
          ))}
      </div>
    </div>
  );
}
