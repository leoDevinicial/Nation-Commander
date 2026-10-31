import * as THREE from 'three';
import { GRADE_GLSL } from './materials.ts';

/**
 * Céu atmosférico: gradiente do zênite ao horizonte, brilho do sol e nuvens procedurais em
 * movimento lento. Também alimenta o mapa de ambiente (reflexos em vidros e metais).
 */
export const SKY = {
  zenith: new THREE.Color('#4f7fb0'),
  horizon: new THREE.Color('#c3d0d6'),
  /** Neblina de distância usa o tom do horizonte para fundir o terreno com o céu. */
  haze: new THREE.Color('#b6c4c8'),
  sunDir: new THREE.Vector3(-0.55, 0.62, -0.38).normalize(),
  sunColor: new THREE.Color('#fff0d8'),
};

/** Estado do céu controlado pelo clima e pela hora (`WeatherSystem`): noite, nuvens fechadas e clarão de raio. */
export const skyUniforms = {
  uNight: { value: 0 },
  uCover: { value: 0 },
  uFlash: { value: 0 },
};

export function createSky(radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uSunDir: { value: SKY.sunDir },
      uSunColor: { value: SKY.sunColor },
      uTime: { value: 0 },
      uNight: skyUniforms.uNight,
      uCover: skyUniforms.uCover,
      uFlash: skyUniforms.uFlash,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uTime;
      uniform float uNight; uniform float uCover; uniform float uFlash;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
        // sol: disco suave e halo
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 900.0) * 3.0 + pow(sd, 12.0) * 0.25) * (1.0 - uCover * 0.85);
        // estrelas e lua à noite (somem com nuvens)
        if (uNight > 0.0 && d.y > 0.0) {
          vec2 sp = d.xz / (d.y + 0.3) * 90.0;
          float st = hash(floor(sp));
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 40.0);
          col += vec3(0.9, 0.95, 1.0) * step(0.985, st) * tw * uNight * (1.0 - uCover) * smoothstep(0.0, 0.3, d.y);
          vec3 moonDir = normalize(vec3(0.45, 0.7, 0.35));
          float md = max(dot(d, moonDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * (step(0.9993, md) * 1.2 + pow(md, 60.0) * 0.12) * uNight * (1.0 - uCover * 0.8);
        }
        // nuvens: projetadas num plano alto, mais densas perto do horizonte
        if (d.y > 0.02) {
          vec2 uv = d.xz / (d.y + 0.15) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
          // céu encoberto: mais nuvens, mais escuras
          float c = smoothstep(0.48 - uCover * 0.42, 0.78 - uCover * 0.3, fbm(uv));
          float shade = 0.82 + 0.18 * fbm(uv * 2.0 + 3.0);
          vec3 cloud = mix(vec3(0.78, 0.8, 0.83), vec3(1.0), shade) + uSunColor * pow(sd, 4.0) * 0.25;
          cloud *= mix(1.0, 0.55, uCover) * mix(1.0, 0.25, uNight);
          col = mix(col, cloud, c * smoothstep(0.02, 0.25, d.y) * 0.9);
        }
        // abaixo do horizonte: neblina
        col = mix(col, uHorizon * 0.92, smoothstep(0.02, -0.15, d.y));
        col += vec3(0.75, 0.8, 1.0) * uFlash;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        ${GRADE_GLSL}
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

/** Mapa de ambiente filtrado a partir do céu (iluminação indireta e reflexos). */
export function environmentFromSky(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.add(createSky(50));
  // chão aproximado para que reflexos de baixo não fiquem com cor de céu
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: '#5d6a45' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  scene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  });
  return rt.texture;
}
