import { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRY_GEO, REGION_LABELS, geoOf } from '../../../shared/data/geography.ts';
import { countryName } from '../../../shared/data/countries.ts';
import type { DiplomaticAction } from '../../../shared/strategic/Diplomacy.ts';
import { countryReference } from '../../../shared/strategic/reference.ts';
import { gameClient } from '../../net/client.ts';
import { PROFILES } from '../../lib/graphics.ts';
import { formatDate, formatPct, formatUsd } from '../../lib/format.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useNationalStore } from '../../state/useNationalStore.ts';
import { useOpsStore } from '../../state/useOpsStore.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { makeNameOf } from '../../game/nationalText.ts';
import type { GlobeLayer, GlobeView } from '../../globe/GlobeView.ts';
import { loadWorldGeo } from '../../globe/worldGeo.ts';
import { POLITICAL_COLORS, POLITICAL_LABELS, politicalArcs, politicalFills, politicalLabels, politicalState, scenarioCountryByIso, type PoliticalState } from '../../globe/political.ts';
import { MAIN_ROWS, ReferenceRow } from '../components/CountryCard.tsx';
import { Chip, NationActions } from './NationActions.tsx';

const LAYERS: { id: GlobeLayer; label: string; short: string }[] = [
  { id: 'political', label: 'Política', short: 'Política' },
  { id: 'arcs', label: 'Tratados e Conflitos', short: 'Tratados' },
  { id: 'borders', label: 'Fronteiras', short: 'Fronteiras' },
  { id: 'labels', label: 'Nomes', short: 'Nomes' },
];

const LEGEND_KEY = 'nc.globe.legend';
function legendSaved(): boolean {
  try {
    return localStorage.getItem(LEGEND_KEY) === '1';
  } catch {
    return false;
  }
}

type Selection = { kind: 'scenario'; countryId: string } | { kind: 'outside'; name: string } | null;

/**
 * Globo diplomático da partida: camada política e de informação. Economia, construções e
 * combate ficam no teatro (RTS); aqui se vê quem existe, quem se conhece, relações, tratados,
 * sanções e guerras — e se tomam as decisões diplomáticas, inclusive declarar guerra.
 */
export function GlobePanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GlobeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [layers, setLayers] = useState<Record<string, boolean>>({ political: true, arcs: true, borders: true, labels: true });
  const [selection, setSelection] = useState<Selection>(null);
  // legenda recolhida por padrão: o globo fica livre; a escolha é lembrada neste aparelho
  const [legend, setLegend] = useState(legendSaved);
  const toggleLegend = (open: boolean) => {
    setLegend(open);
    try {
      localStorage.setItem(LEGEND_KEY, open ? '1' : '0');
    } catch {
      // armazenamento indisponível: vale só nesta sessão
    }
  };
  const [outsideIso, setOutsideIso] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(true);

  const match = useAppStore((s) => s.match);
  const mySlot = match?.yourSlot ?? 0;
  const myCountry = match?.players.find((p) => p.slot === mySlot)?.countryId ?? '';
  const diplomacy = useNationalStore((s) => s.diplomacy);
  const me = useNationalStore((s) => s.nations.find((n) => n.slot === mySlot));
  const day = useNationalStore((s) => s.day);
  const date = useNationalStore((s) => s.date);
  const focus = useNationalStore((s) => s.globeFocus);
  const quality = useSettingsStore((s) => s.quality);
  const reduced = useSettingsStore((s) => s.reducedMotion);
  const nameOf = useMemo(() => makeNameOf(match?.players ?? [], diplomacy?.nations ?? []), [match, diplomacy]);

  // cria o globo uma vez por partida; depois só pausa/retoma
  useEffect(() => {
    const host = hostRef.current;
    const labelHost = labelRef.current;
    if (!host || !labelHost) return;
    let view: GlobeView | null = null;
    let cancelled = false;
    const profile = PROFILES[quality];
    void Promise.all([import('../../globe/GlobeView.ts'), loadWorldGeo()])
      .then(async ([{ GlobeView }, geo]) => {
        if (cancelled) return;
        const inScenario = new Set(COUNTRY_GEO.map((g) => g.isoNumeric));
        setOutsideIso(geo.countries.flatMap((c) => (c.id && !inScenario.has(c.id) ? [c.id] : [])));
        view = new GlobeView(host, {
          profile: { ...profile.globe, maxFps: Math.min(profile.globe.maxFps, 60) },
          pixelRatioCap: profile.pixelRatioCap,
          antialias: profile.antialias,
          reducedMotion: reduced,
          highlight: myCountry,
          interactive: {
            labelHost,
            onSelect: (iso) => {
              if (!iso) return setSelection(null);
              const c = scenarioCountryByIso(iso);
              const name = geo.countries.find((x) => x.id === iso)?.name ?? '';
              setSelection(c ? { kind: 'scenario', countryId: c } : { kind: 'outside', name });
              setSheetOpen(true);
            },
          },
        });
        view.setLayerVisible('markers', false);
        viewRef.current = view;
        if (import.meta.env.DEV) (window as unknown as { __globe?: GlobeView }).__globe = view;
        await view.load();
        if (cancelled) return;
        const cap = geoOf(myCountry)?.capital;
        if (cap) view.focus(cap.lon, cap.lat);
        setReady(true);
      })
      .catch((err: unknown) => {
        console.warn('Globo diplomático indisponível', err);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      view?.dispose();
      viewRef.current = null;
    };
    // o globo é criado uma vez; qualidade muda só na próxima partida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.setActive(visible);
  }, [visible, ready]);

  // camadas políticas derivadas do estado filtrado enviado pelo servidor
  const selectedIso = selection?.kind === 'scenario' ? (geoOf(selection.countryId)?.isoNumeric ?? null) : null;
  useEffect(() => {
    const v = viewRef.current;
    if (!v || !ready || !diplomacy) return;
    v.setPolitical(politicalFills(diplomacy, mySlot, myCountry, outsideIso), selectedIso);
    v.setArcs(politicalArcs(diplomacy, mySlot, myCountry));
  }, [diplomacy, ready, mySlot, myCountry, outsideIso, selectedIso]);

  const labelKey = diplomacy
    ? politicalLabels(diplomacy, mySlot, myCountry)
        .map((l) => `${l.key}:${l.color}`)
        .join('|')
    : '';
  useEffect(() => {
    const v = viewRef.current;
    if (!v || !ready || !diplomacy) return;
    v.setLabels(politicalLabels(diplomacy, mySlot, myCountry));
    // só quando nomes/cores mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelKey, ready]);

  useEffect(() => {
    for (const l of LAYERS) viewRef.current?.setLayerVisible(l.id, layers[l.id] ?? true);
  }, [layers, ready]);

  // pedido externo para centralizar um país (painel nacional, painel de comando)
  const [handledFocus, setHandledFocus] = useState<string | null>(null);
  if (focus !== handledFocus) {
    setHandledFocus(focus);
    if (focus) {
      setSelection({ kind: 'scenario', countryId: focus });
      setSheetOpen(true);
    }
  }
  useEffect(() => {
    if (!focus || !ready || !visible) return;
    const cap = geoOf(focus)?.capital;
    if (cap) viewRef.current?.focus(cap.lon, cap.lat);
    useNationalStore.setState({ globeFocus: null });
  }, [focus, ready, visible]);

  const diplomaticAction = (action: DiplomaticAction) => gameClient.send({ t: 'national', cmd: { type: 'diplomacy', action } });
  const selectedState: PoliticalState | null =
    selection?.kind === 'scenario' && diplomacy
      ? politicalState(diplomacy, mySlot, selection.countryId === myCountry ? mySlot : (diplomacy.nations.find((n) => n.countryId === selection.countryId)?.id ?? -1))
      : null;

  return (
    <div className={`absolute inset-0 z-20 bg-ink-950 ${visible ? '' : 'pointer-events-none invisible'}`} aria-hidden={!visible}>
      <div className="backdrop-atmosphere absolute inset-0" />
      <div ref={hostRef} className="absolute inset-0" />
      <div ref={labelRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-400">
          Não foi possível iniciar o globo (WebGL indisponível). A diplomacia continua disponível no painel 🏛 Nação.
        </div>
      )}

      {/* cabeçalho compacto: título e data, camadas, legenda recolhível e volta ao teatro */}
      <div className="pointer-events-none absolute top-15 left-2 flex max-w-[calc(100vw-16px)] flex-col items-start gap-1.5 sm:top-16 sm:left-3">
        <div className="panel pointer-events-auto flex max-w-full flex-wrap items-center gap-1 px-2 py-1">
          <div className="mr-1 leading-tight">
            <div className="font-display text-[11px] font-bold tracking-wide uppercase">Globo</div>
            <div className="text-[10px] text-ink-400">{date ? formatDate(date) : '—'}</div>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Camadas do globo">
            {LAYERS.map((l) => (
              <button
                key={l.id}
                className={`btn min-h-6 px-1.5 py-0 text-[10px] ${layers[l.id] ? 'btn-primary' : ''}`}
                aria-pressed={layers[l.id]}
                title={`Camada: ${l.label}`}
                onClick={() => setLayers((s) => ({ ...s, [l.id]: !s[l.id] }))}
              >
                {l.short}
              </button>
            ))}
          </div>
          <button className="btn min-h-6 px-1.5 py-0 text-[10px]" aria-expanded={legend} onClick={() => toggleLegend(!legend)} title="Mostrar ou ocultar a legenda das cores">
            Legenda {legend ? '▴' : '▾'}
          </button>
          <button className="btn min-h-6 px-1.5 py-0 text-[10px]" onClick={onClose} title="Voltar ao teatro de operações (Tab)">
            ⚔ Teatro
          </button>
        </div>
        {legend && (
          <div className="panel pointer-events-auto w-60 max-w-full px-2 py-1.5 text-[10px]">
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {(Object.keys(POLITICAL_LABELS) as PoliticalState[]).map((k) => (
                <li key={k} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: POLITICAL_COLORS[k], backgroundImage: k === 'unknown' ? 'repeating-linear-gradient(135deg, transparent 0 2px, rgba(190,200,210,.6) 2px 3px)' : undefined }}
                    aria-hidden
                  />
                  {POLITICAL_LABELS[k]}
                </li>
              ))}
              <li className="col-span-2 mt-0.5 leading-snug text-ink-400">Escuro: fora do cenário. Linhas: tratados (tracejado = sanções) e guerras.</li>
            </ul>
          </div>
        )}
      </div>

      {/* país selecionado: painel lateral no desktop, folha inferior no celular */}
      {selection && sheetOpen && diplomacy && me && (
        <div
          className="panel scroll-thin pointer-events-auto absolute right-2 bottom-2 left-2 max-h-[55%] overflow-y-auto p-3 sm:top-16 sm:right-3 sm:bottom-3 sm:left-auto sm:max-h-none sm:w-[400px]"
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="País selecionado"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            {selection.kind === 'scenario' ? (
              <div>
                <h2 className="font-display text-lg font-bold tracking-wide">{countryName(selection.countryId)}</h2>
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-ink-400">
                  {REGION_LABELS[geoOf(selection.countryId)!.region]} · capital {geoOf(selection.countryId)!.capital.name}
                  {selectedState && (
                    <Chip
                      tone={selectedState === 'war' || selectedState === 'sanctions' || selectedState === 'hostile' ? 'bad' : selectedState === 'ally' || selectedState === 'trade' ? 'good' : 'info'}
                    >
                      {POLITICAL_LABELS[selectedState]}
                    </Chip>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="font-display text-lg font-bold tracking-wide">{selection.name || 'País'}</h2>
                <div className="text-[11px] text-ink-400">Nome conforme o Natural Earth</div>
              </div>
            )}
            <button className="btn px-2 py-1 text-xs" onClick={() => setSheetOpen(false)} aria-label="Fechar painel do país">
              ✖
            </button>
          </div>
          {selection.kind === 'outside' ? (
            <p className="text-xs text-ink-400">Fora do cenário desta versão: o país aparece no mapa, mas não tem dados, governo simulado nem diplomacia.</p>
          ) : selection.countryId === myCountry ? (
            <OwnSummary me={me} />
          ) : (
            foreignDetail(selection.countryId)
          )}
        </div>
      )}
      {!selection && ready && visible && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-ink-950/80 px-3 py-1.5 text-xs text-ink-200">
          Toque ou clique num país · arraste para girar · pinça ou roda para aproximar
        </div>
      )}
    </div>
  );

  function foreignDetail(countryId: string) {
    const f = diplomacy!.nations.find((n) => n.countryId === countryId);
    if (!f) return null;
    const ref = countryReference(countryId);
    return (
      <div className="space-y-3">
        <NationActions
          f={f}
          me={me!}
          view={diplomacy!}
          day={day}
          nameOf={nameOf}
          onAction={diplomaticAction}
          onDeclareWar={(id) => useNationalStore.getState().setWarTarget(id)}
          onOpenOperations={(id) => useOpsStore.getState().set({ opMap: id })}
        />
        {f.known && (
          <details className="rounded border border-ink-700 bg-ink-950/60 p-2 text-xs">
            <summary className="cursor-pointer font-semibold text-ink-200">Indicadores públicos de referência</summary>
            <table className="mt-1 w-full">
              <tbody>
                {MAIN_ROWS.map((r) => (
                  <ReferenceRow key={r.key} k={r.key} v={ref.values[r.key]} fmt={r.fmt} />
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-ink-400">Banco Mundial (WDI) e FMI (WEO); ano de cada valor à direita. Dados públicos do início do cenário — não a situação atual.</p>
          </details>
        )}
      </div>
    );
  }
}

function OwnSummary({ me }: { me: NonNullable<ReturnType<typeof useNationalStore.getState>['nations'][number]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      <dt className="text-ink-400">PIB</dt>
      <dd className="text-right font-mono">{formatUsd(me.gdpUsd)}</dd>
      <dt className="text-ink-400">Crescimento</dt>
      <dd className="text-right font-mono">{formatPct(me.realGrowthPct)}</dd>
      <dt className="text-ink-400">Aprovação</dt>
      <dd className="text-right font-mono">{formatPct(me.approval, 0)}</dd>
      <dt className="text-ink-400">Dívida</dt>
      <dd className="text-right font-mono">{formatPct((me.debtUsd / me.gdpUsd) * 100)} do PIB</dd>
      <dd className="col-span-2 mt-1 text-[11px] text-ink-400">Economia, orçamento e pesquisa no painel 🏛 Nação; construções e tropas no teatro de operações.</dd>
    </dl>
  );
}
