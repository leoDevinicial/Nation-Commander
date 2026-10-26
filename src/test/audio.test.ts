import { describe, expect, it } from 'vitest';
import { AudioService, DEFAULT_VOLUMES, PRODUCTION_SOUND, pickVictim, spatialMix } from '../game/audio/AudioService.ts';
import { parseSettings, type Settings } from '../state/useSettingsStore.ts';

const L = { x: 50, y: 50, dist: 30, yaw: 0 };

describe('áudio contextual (Fase 7)', () => {
  it('atenua com a distância, silencia longe demais e põe à direita o que está à direita na tela', () => {
    const near = spatialMix(L, 52, 50)!;
    const far = spatialMix(L, 100, 50)!;
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(spatialMix(L, 50 + 200, 50)).toBeNull();
    // yaw 0: a direita da câmera é +x
    expect(spatialMix(L, 70, 50)!.pan).toBeGreaterThan(0);
    expect(spatialMix(L, 30, 50)!.pan).toBeLessThan(0);
    // câmera afastada: ouve mais longe, porém mais baixo de perto
    const zoomedOut = { ...L, dist: 120 };
    expect(spatialMix(zoomedOut, 50 + 150, 50)).not.toBeNull();
    expect(spatialMix(zoomedOut, 52, 50)!.gain).toBeLessThan(near.gain);
  });

  it('limite de vozes: descarta a de menor prioridade; som menos importante fica de fora', () => {
    const voices = [{ priority: 1 }, { priority: 3 }, { priority: 2 }];
    expect(pickVictim(voices, 1, 4)).toBe(-1);
    expect(pickVictim(voices, 6, 3)).toBe(0); // impacto de míssil corta um tiro de fuzil
    expect(pickVictim(voices, 1, 3)).toBeNull(); // outro fuzil não corta nada
  });

  it('sem contexto de áudio (antes do primeiro gesto) nada quebra', () => {
    const a = new AudioService();
    expect(a.ready).toBe(false);
    a.playAt('rifle', 1, 1);
    a.ui('click');
    a.missileCue('armed', 1);
    a.setProduction('saw');
    a.stopAll();
  });

  it('só edifícios de trabalho têm som de produção; volumes são salvos e validados', () => {
    expect(PRODUCTION_SOUND.sawmill).toBe('saw');
    expect(PRODUCTION_SOUND.house).toBeUndefined();
    const base = {
      quality: 'low',
      shadows: true,
      panSpeed: 1,
      edgeScroll: false,
      showFps: false,
      reducedMotion: false,
      autoFullscreen: false,
      lockLandscape: false,
      volumes: { ...DEFAULT_VOLUMES },
      muted: false,
    } as Settings;
    const s = parseSettings(JSON.stringify({ volumes: { master: 0.3, combat: 2, music: 'x' }, muted: true }), base);
    expect(s.volumes.master).toBe(0.3);
    expect(s.volumes.combat).toBe(DEFAULT_VOLUMES.combat);
    expect(s.volumes.music).toBe(DEFAULT_VOLUMES.music);
    expect(s.muted).toBe(true);
  });
});
