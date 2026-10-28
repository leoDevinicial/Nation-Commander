import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { COUNTRIES } from '../../shared/data/countries.ts';
import { COUNTRY_GEO } from '../../shared/data/geography.ts';
import { GAME_TITLE } from '../../shared/version.ts';
import { PROFILES, detectPreset } from '../lib/graphics.ts';
import { parseSettings, type Settings } from '../state/useSettingsStore.ts';
import { countryAt, facingRotation, globeFraming, lonLatToVector, REDUCED_SPIN_FACTOR, SPIN, SPIN_RAMP, vectorToLonLat } from '../globe/GlobeView.ts';
import { parseWorld } from '../globe/worldGeo.ts';
import atlas from 'world-atlas/countries-110m.json';
import { POLITICAL_COLORS, politicalArcs, politicalFills, politicalState } from '../globe/political.ts';

const base: Settings = { quality: 'balanced', shadows: true, adaptiveQuality: true, fpsTarget: 'auto', panSpeed: 1, edgeScroll: false, showFps: false, reducedMotion: false, autoFullscreen: false, lockLandscape: false, volumes: { master: 0.8, music: 0.35, ui: 0.7, ambient: 0.5, combat: 0.75, production: 0.6 }, muted: false };

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
    // oclusão de ambiente custa uma passada extra: só no preset Alto
    expect(PROFILES.low.ao).toBe(false);
    expect(PROFILES.balanced.ao).toBe(false);
    expect(PROFILES.high.ao).toBe(true);
    // celular: sem passadas extras (reflexo só do céu, exposição fixa, sem luzes dinâmicas nem sonda)
    expect(PROFILES.low).toMatchObject({ reflections: 'sky', adaptiveExposure: false, dynamicLights: 0, envProbe: false });
    expect(PROFILES.high).toMatchObject({ reflections: 'planar', adaptiveExposure: true, envProbe: true });
    expect(PROFILES.balanced.dynamicLights).toBeLessThanOrEqual(PROFILES.high.dynamicLights);
  });

  it('configurações antigas (low/high) são migradas e valores inválidos ignorados', () => {
    expect(parseSettings(JSON.stringify({ quality: 'high', panSpeed: 2 }), base)).toMatchObject({ quality: 'high', panSpeed: 2 });
    expect(parseSettings(JSON.stringify({ quality: 'cinema', panSpeed: 99 }), base)).toMatchObject({ quality: 'balanced', panSpeed: 1 });
    expect(parseSettings(JSON.stringify({ quality: 'ultra' }), base)).toMatchObject({ quality: 'ultra' });
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

  it('globo do menu gira de forma visível (uma volta entre 1 e 2 min) e mais devagar com movimento reduzido', () => {
    const turn = (2 * Math.PI) / SPIN;
    // original 0,08 rad/s, +5% e depois +10%
    expect(SPIN).toBeCloseTo(0.08 * 1.05 * 1.1, 6);
    expect(SPIN_RAMP).toBeGreaterThan(0);
    expect(SPIN_RAMP).toBeLessThan(3);
    expect(turn).toBeGreaterThan(60);
    expect(turn).toBeLessThan(120);
    expect(REDUCED_SPIN_FACTOR).toBeGreaterThan(0);
    expect(REDUCED_SPIN_FACTOR).toBeLessThan(1);
  });

  it('conversão lon/lat segue a convenção da esfera e a rotação põe a longitude de frente', () => {
    const north = lonLatToVector(0, 90);
    expect(north.y).toBeCloseTo(1);
    const v = lonLatToVector(-47.88, -15.79);
    v.applyAxisAngle(new Vector3(0, 1, 0), facingRotation(-47.88));
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.z).toBeGreaterThan(0.9);
  });

  it('seleção por coordenada encontra o país certo (inclusive perto do antimeridiano)', () => {
    expect(countryAt(world.countries, -47.88, -15.79)?.id).toBe('076');
    expect(countryAt(world.countries, 139.69, 35.68)?.id).toBe('392');
    expect(countryAt(world.countries, 150, 62)?.name).toBe('Russia');
    expect(countryAt(world.countries, -30, 0)).toBeNull();
    const v = lonLatToVector(28.19, -25.75);
    expect(vectorToLonLat(v).lon).toBeCloseTo(28.19, 4);
    expect(vectorToLonLat(v).lat).toBeCloseTo(-25.75, 4);
  });

  it('enquadramento: globo à direita em telas largas, horizonte em retrato estreito', () => {
    expect(globeFraming('hero', 1440, 900).offsetX).toBeGreaterThan(0);
    expect(globeFraming('hero', 390, 844)).toMatchObject({ offsetX: 0 });
    expect(globeFraming('hero', 390, 844).offsetY).toBeGreaterThan(0);
    expect(globeFraming('center', 1440, 900)).toMatchObject({ offsetX: 0, offsetY: 0 });
  });
});

describe('camada política do globo', () => {
  const view = {
    nations: [
      { id: 1, countryId: 'ARG', isPlayer: true, known: true, contactDueDay: null, intel: null },
      { id: 100, countryId: 'USA', isPlayer: false, known: true, contactDueDay: null, intel: null },
      { id: 101, countryId: 'JPN', isPlayer: false, known: false, contactDueDay: null, intel: null },
      { id: 102, countryId: 'MEX', isPlayer: false, known: true, contactDueDay: null, intel: null },
    ],
    relations: [
      { a: 0, b: 1, value: -20, factors: [] },
      { a: 0, b: 100, value: 12, factors: [] },
      { a: 0, b: 102, value: 0, factors: [] },
    ],
    treaties: [{ id: 1, type: 'trade' as const, a: 0, b: 100, startDay: 0, endDay: 360 }],
    missions: [],
    wars: [] as [number, number][],
  };

  it('estado de cada país deriva só da visão filtrada', () => {
    expect(politicalState(view, 0, 0)).toBe('self');
    expect(politicalState(view, 0, 1)).toBe('hostile');
    expect(politicalState(view, 0, 100)).toBe('trade');
    expect(politicalState(view, 0, 101)).toBe('unknown');
    expect(politicalState(view, 0, 102)).toBe('neutral');
    expect(politicalState({ ...view, wars: [[0, 1]] }, 0, 1)).toBe('war');
  });

  it('país sem contato aparece hachurado; tratados e guerras viram linhas entre capitais', () => {
    const fills = politicalFills(view, 0, 'BRA', ['250']);
    expect(fills['392']).toMatchObject({ hatch: true });
    expect(fills['250']!.color).toBe('#05080c');
    expect(fills['076']!.color).toBe(POLITICAL_COLORS.self);
    expect(politicalArcs({ ...view, wars: [[0, 1]] }, 0, 'BRA')).toHaveLength(2);
  });
});
