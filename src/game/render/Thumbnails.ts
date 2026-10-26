import * as THREE from 'three';
import { BUILDINGS, UNITS, type BuildingType, type UnitType } from '../../../shared/sim/config.ts';
import { buildingModel } from './models/buildingModels.ts';
import { citizenModel, recruitModel, unitModel } from './models/unitModels.ts';
import type { ModelLayers } from './models/kit.ts';
import { factionColor } from './palette.ts';

/** Chave de miniatura: tipo de edifício, de unidade, ou 'citizen' / 'recruit'. */
export type ThumbKey = BuildingType | UnitType | 'citizen' | 'recruit';

const SIZE = 160;

/**
 * Miniaturas 3D dos botões do HUD, renderizadas uma vez por partida com os próprios modelos do
 * jogo (mesmo nível de detalhe do preset), na cor da facção do jogador. Usa o renderizador da
 * partida com um alvo fora da tela — sem abrir um segundo contexto WebGL — e devolve PNGs
 * (data URL) que os botões mostram como imagem comum.
 */
export function renderThumbnails(renderer: THREE.WebGLRenderer, slot: number): Partial<Record<ThumbKey, string>> {
  const out: Partial<Record<ThumbKey, string>> = {};
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfe9f2', '#4a4436', 1.6));
  const sun = new THREE.DirectionalLight('#fff2dc', 2.4);
  sun.position.set(4, 7, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  const mats = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 }),
    accent: new THREE.MeshStandardMaterial({ color: factionColor(slot), roughness: 0.55, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: '#4d6270', roughness: 0.2, metalness: 0.6, emissive: '#0f1d26' }),
  };
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const prev = { target: renderer.getRenderTarget(), toneMapping: renderer.toneMapping, autoClear: renderer.autoClear };
  const clear = new THREE.Color();
  renderer.getClearColor(clear);
  const prevAlpha = renderer.getClearAlpha();

  const add = (group: THREE.Group, l: ModelLayers, at?: [number, number, number]) => {
    for (const [geo, m] of [
      [l.body, mats.body],
      [l.accent, mats.accent],
      [l.glass, mats.glass],
    ] as const) {
      if (!geo.getAttribute('position')) continue;
      const mesh = new THREE.Mesh(geo, m);
      if (at) mesh.position.set(...at);
      group.add(mesh);
    }
  };

  const shoot = (key: ThumbKey, group: THREE.Group) => {
    scene.add(group);
    // enquadra pelo volume do modelo, vista de três quartos de cima (como a câmera do jogo)
    const box = new THREE.Box3().setFromObject(group);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = new THREE.Vector3(1.05, 0.95, 1.25).normalize();
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.02;
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels);
    const img = ctx.createImageData(SIZE, SIZE);
    // o alvo é lido de baixo para cima: inverte as linhas
    for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    ctx.putImageData(img, 0, 0);
    out[key] = canvas.toDataURL('image/png');
    scene.remove(group);
  };

  try {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = false;
    for (const type of Object.keys(BUILDINGS) as BuildingType[]) {
      const m = buildingModel(type);
      const g = new THREE.Group();
      add(g, m.base);
      if (m.detail) add(g, m.detail);
      if (m.moving) add(g, m.moving.layers, m.moving.pivot);
      if (m.pump) {
        add(g, m.pump.crank, m.pump.crankPivot);
        add(g, m.pump.rod, m.pump.rodPivot);
      }
      shoot(type, g);
    }
    for (const type of Object.keys(UNITS) as UnitType[]) {
      const m = unitModel(type);
      const g = new THREE.Group();
      add(g, m.hull);
      if (m.turret) add(g, m.turret, m.turretPivot);
      // frente (+x) virada para a câmera
      g.rotation.y = -0.35;
      shoot(type, g);
    }
    for (const [key, l] of [
      ['citizen', citizenModel()],
      ['recruit', recruitModel()],
    ] as const) {
      const g = new THREE.Group();
      add(g, l);
      g.rotation.y = -0.6;
      shoot(key, g);
    }
  } finally {
    renderer.setRenderTarget(prev.target);
    renderer.toneMapping = prev.toneMapping;
    renderer.autoClear = prev.autoClear;
    renderer.setClearColor(clear, prevAlpha);
    rt.dispose();
    for (const m of Object.values(mats)) m.dispose();
  }
  return out;
}
