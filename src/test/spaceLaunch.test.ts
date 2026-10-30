import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SPACE } from '../../shared/sim/config.ts';

// as texturas de fumaça e brilho são desenhadas em canvas (não existe no Node): aqui basta uma textura vazia
vi.mock('../game/render/textures.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../game/render/textures.ts')>()),
  glowTexture: () => new THREE.Texture(),
  volumetricSmokeTexture: () => new THREE.Texture(),
}));
import { LAUNCH_IGNITION, SpaceLaunch } from '../game/render/SpaceLaunch.ts';

/** Avança a sequência até o tempo `tau` (relativo à decolagem), como a simulação faria com o progresso das fases. */
function runTo(l: SpaceLaunch, from: number, tau: number): void {
  for (let t = from; t < tau; t += 1 / 30) {
    if (t < 0) l.setState('countdown', (t + SPACE.countdownSeconds) / SPACE.countdownSeconds);
    else l.setState('ascent', Math.min(1, t / SPACE.ascentSeconds));
    l.update(1 / 30);
  }
}

const rocketY = (l: SpaceLaunch) => (l as unknown as { rocket: { position: { y: number }; visible: boolean } }).rocket;

describe('lançamento do Programa Espacial', () => {
  it('motores acendem presos antes da decolagem, o foguete sobe acelerando e some depois da órbita', () => {
    const l = new SpaceLaunch(0, 60);
    l.setState('idle');
    l.update(1 / 30);
    const base = rocketY(l).position.y;
    expect(l.rumble).toBe(0);
    // contagem antes da ignição: parado e sem tremor
    runTo(l, -SPACE.countdownSeconds, LAUNCH_IGNITION - 0.5);
    expect(l.rumble).toBe(0);
    // ignição: ainda preso na mesa, mas tremendo
    runTo(l, LAUNCH_IGNITION - 0.5, -0.3);
    expect(l.rumble).toBeGreaterThan(0.5);
    expect(Math.abs(rocketY(l).position.y - base)).toBeLessThan(0.05);
    // decolagem: devagar no primeiro segundo, acelerando depois
    runTo(l, -0.3, 1);
    const h1 = rocketY(l).position.y - base;
    runTo(l, 1, 3);
    const h3 = rocketY(l).position.y - base;
    expect(h1).toBeGreaterThan(0.1);
    expect(h1).toBeLessThan(1);
    expect(h3).toBeGreaterThan(h1 * 4);
    // satélite em órbita: plataforma vazia
    l.setState('gone');
    l.update(1 / 30);
    expect(rocketY(l).visible).toBe(false);
    expect(l.rumble).toBe(0);
    l.dispose();
  });
});
