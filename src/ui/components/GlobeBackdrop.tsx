import { useEffect, useRef, useState } from 'react';
import { PROFILES, prefersReducedMotion } from '../../lib/graphics.ts';
import { preferredCountry } from '../../app/session.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import type { GlobeLayout, GlobeView } from '../../globe/GlobeView.ts';

/**
 * Globo animado de fundo das telas fora da partida. O Three.js é carregado sob demanda;
 * até lá (ou sem WebGL) fica um fundo atmosférico em CSS, e os menus nunca esperam por ele.
 */
export function GlobeBackdrop({ layout, dim }: { layout: GlobeLayout; dim: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GlobeView | null>(null);
  const [ready, setReady] = useState(false);
  const quality = useSettingsStore((s) => s.quality);
  const reducedSetting = useSettingsStore((s) => s.reducedMotion);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let view: GlobeView | null = null;
    let cancelled = false;
    const profile = PROFILES[quality];
    void import('../../globe/GlobeView.ts')
      .then(async ({ GlobeView }) => {
        if (cancelled) return;
        view = new GlobeView(el, {
          profile: profile.globe,
          pixelRatioCap: profile.pixelRatioCap,
          antialias: profile.antialias,
          reducedMotion: reducedSetting || prefersReducedMotion(),
          highlight: preferredCountry(),
        });
        viewRef.current = view;
        await view.load();
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => console.warn('Globo indisponível; usando fundo estático', err));
    return () => {
      cancelled = true;
      view?.dispose();
      viewRef.current = null;
      setReady(false);
    };
  }, [quality, reducedSetting]);

  useEffect(() => {
    viewRef.current?.setLayout(layout);
  }, [layout, ready]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink-950">
      <div className="backdrop-atmosphere absolute inset-0" />
      <div
        ref={ref}
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: ready ? (dim ? 0.45 : 1) : 0 }}
      />
      <div className="backdrop-vignette absolute inset-0" />
    </div>
  );
}
