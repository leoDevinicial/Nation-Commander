import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController } from '../game/render/CameraController.ts';
import { TrackMarks } from '../game/render/TrackMarks.ts';

describe('visão aproximada', () => {
  it('chega bem perto, abaixa a câmera conforme aproxima e volta ao zoom de comando ao sair', () => {
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    const ctl = new CameraController(cam, 128, 128);
    ctl.lookAt(50, 50);
    ctl.distance = 16;
    ctl.zoom(0.1);
    expect(ctl.distance).toBe(16); // sem a visão aproximada, o mínimo é o de comando
    const rts = ctl.pitch;
    ctl.closeUp = true;
    ctl.zoomTo(4);
    for (let i = 0; i < 120; i++) ctl.tick(1 / 60);
    expect(ctl.distance).toBeCloseTo(4, 1);
    expect(ctl.pitch).toBeLessThan(rts - 0.4);
    ctl.apply();
    // a câmera fica baixa, perto da altura das tropas
    expect(cam.position.y).toBeLessThan(2.5);
    ctl.closeUp = false;
    for (let i = 0; i < 240; i++) ctl.tick(1 / 60);
    expect(ctl.distance).toBeGreaterThanOrEqual(15.9);
    expect(ctl.pitch).toBeCloseTo(rts, 2);
  });
});

describe('rastros de esteira', () => {
  it('cada marca vira um par sob as duas esteiras, perpendicular à frente, e some com o tempo', () => {
    const tm = new TrackMarks(8);
    tm.add(10, 20, Math.PI / 2, 0.6, 0.3, 0.35); // frente para +z (sul na tela)
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const xs: number[] = [];
    for (const i of [0, 1]) {
      tm.mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(p.z).toBeCloseTo(20, 5);
      xs.push(p.x);
    }
    expect(xs.sort((a, b) => a - b)).toEqual([expect.closeTo(9.4, 5), expect.closeTo(10.6, 5)]);
    const fade = tm.mesh.geometry.getAttribute('aFade');
    expect(fade.getX(0)).toBe(1);
    for (let i = 0; i < 60 * 50; i++) tm.update(1 / 60);
    expect(fade.getX(0)).toBe(0);
    // conjunto em anel: as mais antigas dão lugar às novas
    for (let i = 0; i < 5; i++) tm.add(0, 0, 0, 0.6, 0.3, 0.35);
    expect(fade.getX(0)).toBe(1);
    tm.dispose();
  });
});
