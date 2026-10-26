import { describe, expect, it } from 'vitest';
import { GRAPHICS_PRESETS, HEAVY_PRESETS, PROFILES, detectPreset } from '../lib/graphics.ts';
import { parseSettings } from '../state/useSettingsStore.ts';
import { PartBuilder, setModelDetail } from '../game/render/models/kit.ts';
import { shoreDistance } from '../game/render/Water.ts';

describe('preset Ultra', () => {
  it('existe, é o mais caro e nunca é escolhido automaticamente', () => {
    expect(GRAPHICS_PRESETS).toContain('ultra');
    expect(PROFILES.ultra.ultra).toBe(true);
    expect(PROFILES.ultra.shadowMapSize).toBeGreaterThan(PROFILES.high.shadowMapSize);
    expect(PROFILES.ultra.dynamicLights).toBeGreaterThan(PROFILES.high.dynamicLights);
    for (const p of ['low', 'balanced', 'high'] as const) expect(PROFILES[p].ultra).toBe(false);
    for (const hints of [
      { coarsePointer: false, shortSide: 1440, memoryGb: 32, cores: 16 },
      { coarsePointer: true, shortSide: 400 },
    ])
      expect(detectPreset(hints)).not.toBe('ultra');
  });

  it('modelos do Ultra têm arestas arredondadas e mais segmentos (menos "tudo quadrado")', () => {
    const count = () => {
      const b = new PartBuilder();
      b.box(1, 1, 1, '#888888', [0, 0, 0]);
      b.cyl(0.3, 0.3, 1, '#888888', [0, 0, 0]);
      const g = b.build();
      const n = g.getAttribute('position').count;
      g.dispose();
      return n;
    };
    setModelDetail('standard');
    const standard = count();
    setModelDetail('ultra');
    const ultra = count();
    setModelDetail('standard');
    expect(ultra).toBeGreaterThan(standard * 2);
  });

  it('peças minúsculas continuam com quinas vivas (economia de vértices)', () => {
    const verts = () => {
      const b = new PartBuilder();
      b.box(0.02, 0.5, 0.5, '#888888', [0, 0, 0]);
      const g = b.build();
      const n = g.getAttribute('position').count;
      g.dispose();
      return n;
    };
    setModelDetail('ultra');
    const ultra = verts();
    setModelDetail('standard');
    expect(ultra).toBe(verts());
  });

  it('distância até a margem: 0 em terra, cresce para dentro do lago e satura em 3 células', () => {
    // linha de 9 células: terra, 7 de água, terra
    const water = [false, true, true, true, true, true, true, true, false];
    const d = shoreDistance(9, 1, (i) => water[i]!);
    expect(d[0]).toBe(0);
    expect(d[8]).toBe(0);
    expect(d[1]).toBe(Math.round(255 / 3));
    expect(d[4]).toBe(255);
    expect(d[2]! < d[3]!).toBe(true);
  });
});

describe('preset Ultra+', () => {
  it('existe, vai além do Ultra em tudo, pede confirmação e nunca é escolhido automaticamente', () => {
    expect(GRAPHICS_PRESETS.at(-1)).toBe('ultraplus');
    expect(HEAVY_PRESETS).toEqual(['ultraplus']);
    const u = PROFILES.ultra;
    const p = PROFILES.ultraplus;
    expect(p.ultra).toBe(true);
    expect(p.cinematic).toBe(true);
    for (const q of ['low', 'balanced', 'high', 'ultra'] as const) expect(PROFILES[q].cinematic).toBe(false);
    expect(p.shadowMapSize).toBeGreaterThan(u.shadowMapSize);
    expect(p.pixelRatioCap).toBeGreaterThan(u.pixelRatioCap);
    expect(p.maxEffects).toBeGreaterThan(u.maxEffects);
    expect(p.dynamicLights).toBeGreaterThan(u.dynamicLights);
    for (const hints of [
      { coarsePointer: false, shortSide: 1440, memoryGb: 64, cores: 32 },
      { coarsePointer: true, shortSide: 400 },
    ])
      expect(detectPreset(hints)).not.toBe('ultraplus');
  });

  it('a escolha fica salva nas configurações', () => {
    const base = parseSettings(null, { quality: 'balanced', shadows: true, panSpeed: 1, edgeScroll: false, showFps: false, reducedMotion: false, autoFullscreen: false, lockLandscape: false });
    expect(parseSettings(JSON.stringify({ quality: 'ultraplus' }), base).quality).toBe('ultraplus');
  });

  it('modelos do Ultra+ são mais suaves que os do Ultra (mais vértices nas mesmas peças)', () => {
    const count = () => {
      const b = new PartBuilder();
      b.box(1, 1, 1, '#888888', [0, 0, 0]);
      b.box(0.06, 0.5, 0.5, '#888888', [0, 0, 0]);
      b.cyl(0.3, 0.3, 1, '#888888', [0, 0, 0]);
      b.sphere(0.3, '#888888', [0, 0, 0]);
      const g = b.build();
      const n = g.getAttribute('position').count;
      g.dispose();
      return n;
    };
    setModelDetail('ultra');
    const ultra = count();
    setModelDetail('cinematic');
    const cine = count();
    setModelDetail('standard');
    expect(cine).toBeGreaterThan(ultra * 1.5);
  });
});
