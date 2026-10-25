import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { COUNTRIES } from '../../shared/data/countries.ts';
import { COUNTRY_GEO } from '../../shared/data/geography.ts';
import { GAME_TITLE } from '../../shared/version.ts';
import { PROFILES, detectPreset } from '../lib/graphics.ts';
import { parseSettings, type Settings } from '../state/useSettingsStore.ts';
import { facingRotation, globeFraming, lonLatToVector } from '../globe/GlobeView.ts';
import { parseWorld } from '../globe/worldGeo.ts';
import atlas from 'world-atlas/countries-110m.json';

const base: Settings = { quality: 'balanced', shadows: true, panSpeed: 1, edgeScroll: false, showFps: false, reducedMotion: false };

describe('identidade', () => {
  it('título exato do jogo', () => {
    expect(GAME_TITLE).toBe('Modern Geopolitical Real Strategy 3d Game');
  });
});

describe('presets gráficos', () => {
  it('celular com tela pequena começa no preset baixo; desktop no equilibrado', () => {
    expect(detectPreset({ coarsePointer: true, shortSide: 390 })).toBe('low');
    expect(detectPreset({ coarsePointer: false, shortSide: 1080, memoryGb: 16, cores: 12 })).toBe('balanced');
    expect(detectPreset({ coarsePointer: false, shortSide: 1080, memoryGb: 4 })).toBe('low');
  });

  it('presets crescem em custo e o baixo desliga sombras e nuvens', () => {
    expect(PROFILES.low.shadows).toBe(false);
    expect(PROFILES.low.globe.clouds).toBe(false);
    expect(PROFILES.low.pixelRatioCap).toBeLessThan(PROFILES.balanced.pixelRatioCap);
    expect(PROFILES.balanced.pixelRatioCap).toBeLessThan(PROFILES.high.pixelRatioCap);
    expect(PROFILES.low.maxEffects).toBeLessThan(PROFILES.high.maxEffects);
  });

  it('configurações antigas (low/high) são migradas e valores inválidos ignorados', () => {
    expect(parseSettings(JSON.stringify({ quality: 'high', panSpeed: 2 }), base)).toMatchObject({ quality: 'high', panSpeed: 2 });
    expect(parseSettings(JSON.stringify({ quality: 'ultra', panSpeed: 99 }), base)).toMatchObject({ quality: 'balanced', panSpeed: 1 });
    expect(parseSettings('{quebrado', base)).toEqual(base);
  });
});

describe('globo', () => {
  const topo = atlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const world = parseWorld(topo);

  it('todos os países jogáveis têm geografia e capital', () => {
    for (const c of COUNTRIES) {
      const g = COUNTRY_GEO.find((x) => x.id === c.id);
      expect(g, c.id).toBeDefined();
      const shape = world.countries.find((w) => w.id === g!.isoNumeric);
      expect(shape?.polygons.length, c.id).toBeGreaterThan(0);
    }
  });

  it('fronteiras e litoral são camadas separadas e não vazias', () => {
    expect(world.borders.length).toBeGreaterThan(100);
    expect(world.coasts.length).toBeGreaterThan(50);
  });

  it('conversão lon/lat segue a convenção da esfera e a rotação põe a longitude de frente', () => {
    const north = lonLatToVector(0, 90);
    expect(north.y).toBeCloseTo(1);
    const v = lonLatToVector(-47.88, -15.79);
    v.applyAxisAngle(new Vector3(0, 1, 0), facingRotation(-47.88));
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.z).toBeGreaterThan(0.9);
  });

  it('enquadramento: globo à direita em telas largas, horizonte em retrato estreito', () => {
    expect(globeFraming('hero', 1440, 900).offsetX).toBeGreaterThan(0);
    expect(globeFraming('hero', 390, 844)).toMatchObject({ offsetX: 0 });
    expect(globeFraming('hero', 390, 844).offsetY).toBeGreaterThan(0);
    expect(globeFraming('center', 1440, 900)).toMatchObject({ offsetX: 0, offsetY: 0 });
  });
});
