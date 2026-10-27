import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { UnitVisual } from '../game/render/UnitVisuals.ts';
import { TrackMarks } from '../game/render/TrackMarks.ts';

const cam = new THREE.PerspectiveCamera();

describe('animações das unidades', () => {
  it('entram em cena crescendo até o tamanho real', () => {
    const v = new UnitVisual(1, 'tank', 0, true);
    v.update(1 / 60, false, null, 1, false, cam);
    expect(v.group.scale.x).toBeLessThan(0.9);
    for (let i = 0; i < 40; i++) v.update(1 / 60, false, null, 1, false, cam);
    expect(v.group.scale.x).toBeCloseTo(1, 5);
    v.dispose();
  });

  it('veículo destruído tomba e afunda antes de sumir; soldado cai', () => {
    const tank = new UnitVisual(2, 'tank', 0, true);
    tank.beginDeath();
    let alive = true;
    let t = 0;
    while (alive && t < 10) {
      alive = tank.updateDeath(1 / 30);
      t += 1 / 30;
    }
    expect(t).toBeGreaterThan(5);
    expect(Math.abs(tank.body.rotation.x)).toBeGreaterThan(0.2);
    expect(tank.body.position.y).toBeLessThan(-0.3);
    tank.dispose();
    const inf = new UnitVisual(3, 'infantry', 0, true);
    inf.beginDeath();
    for (let i = 0; i < 30; i++) inf.updateDeath(1 / 30);
    expect(inf.body.rotation.z).toBeGreaterThan(1.3);
    inf.dispose();
  });

  it('tanque andando deixa rastros; parado não', () => {
    const marks = new TrackMarks(64);
    const v = new UnitVisual(4, 'tank', 0, true);
    v.treadMarks = marks;
    const fade = marks.mesh.geometry.getAttribute('aFade');
    const count = () => Array.from({ length: 64 }, (_, i) => fade.getX(i)).filter((x) => x > 0).length;
    for (let i = 0; i < 30; i++) v.update(1 / 30, false, null, 1, false, cam);
    expect(count()).toBe(0);
    for (let i = 0; i < 60; i++) {
      v.renderPos.x += 0.1;
      v.update(1 / 30, true, null, 1, false, cam);
    }
    // 6 de distância a cada 0,34: ~17 pares
    expect(count()).toBeGreaterThanOrEqual(30);
    v.dispose();
    marks.dispose();
  });
});

describe('animações das construções', () => {
  it('as máquinas param devagar quando o prédio para de funcionar e voltam quando ele volta', async () => {
    const { BuildingVisual } = await import('../game/render/BuildingVisuals.ts');
    const b = new BuildingVisual(9, 'sawmill', 0, true, { center: new THREE.Vector2(10, 10), cellSize: 2, mapWidth: 64 });
    const speed = (active: boolean) => {
      const w = (b as unknown as { workT: number }).workT;
      b.update(0.1, 1, 1, false, cam, null, false, false, active);
      return (b as unknown as { workT: number }).workT - w;
    };
    for (let i = 0; i < 10; i++) speed(true);
    expect(speed(true)).toBeCloseTo(0.1, 3);
    const first = speed(false);
    expect(first).toBeGreaterThan(0.05); // desacelera, não trava de uma vez
    for (let i = 0; i < 60; i++) speed(false);
    expect(speed(false)).toBe(0);
    for (let i = 0; i < 60; i++) speed(true);
    expect(speed(true)).toBeCloseTo(0.1, 3);
    b.dispose();
  });
});
