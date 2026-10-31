import * as THREE from 'three';
import { dayLight, weatherAt, type Climate, type WeatherState } from '../../../shared/sim/climate.ts';
import { climateUniforms } from './materials.ts';
import { SKY, skyUniforms } from './Sky.ts';

/**
 * Clima e hora do dia na cena (só visual; regra em `shared/sim/climate.ts`):
 * - dia e noite: o sol anda, fica dourado no nascer e no pôr; à noite a luz vem da lua (azulada e fraca), o céu
 *   escurece, aparecem estrelas e as janelas dos prédios acendem;
 * - chuva: céu fechado e cinza, luz mais fraca, neblina mais perto, chão molhado, gotas caindo inclinadas pelo vento
 *   e, nas tempestades, raios (clarão no céu e na cena, trovão depois);
 * - neve: flocos caindo devagar e balançando, e a neve que se acumula nas faces voltadas para cima (e derrete
 *   devagar quando para de nevar).
 * As partículas ficam numa caixa em volta do ponto que a câmera olha e são animadas na GPU (nenhum buffer muda por
 * quadro). Os valores-base do céu (`SKY`) são guardados e restaurados no fim.
 */

const RAIN_H = 26;
const SNOW_H = 22;

const C = (hex: string) => new THREE.Color(hex);
const PALETTE = {
  nightZenith: C('#0a1326'),
  nightHorizon: C('#1b2539'),
  nightHaze: C('#1a2232'),
  duskZenith: C('#3c5583'),
  duskHorizon: C('#efa36d'),
  duskHaze: C('#c9927a'),
  greyZenith: C('#68737e'),
  greyHorizon: C('#9aa2a7'),
  greyHaze: C('#959da2'),
  golden: C('#ffad6b'),
  moon: C('#9db4e0'),
  hemiNightSky: C('#3a4b72'),
  hemiNightGround: C('#1d2027'),
  hemiGreySky: C('#a9b2ba'),
};

export interface WeatherHooks {
  /** Raio: ponto no mapa, para o clarão e o trovão (com o atraso da distância). */
  lightning: (x: number, z: number) => void;
}

/** Neve no chão: no máximo manchas (0,85 cobria tudo de branco); depois de derreter fica só o resíduo. */
const SNOW_MAX = 0.38;
const SNOW_RESIDUE = 0.07;

export class WeatherSystem {
  readonly group = new THREE.Group();
  private readonly base: {
    zenith: THREE.Color;
    horizon: THREE.Color;
    haze: THREE.Color;
    sunColor: THREE.Color;
    sunDir: THREE.Vector3;
    sunI: number;
    hemiSky: THREE.Color;
    hemiGround: THREE.Color;
    hemiI: number;
    envI: number;
    fogNear: number;
    fogFar: number;
  };
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly rainMat: THREE.ShaderMaterial;
  private readonly snowMat: THREE.ShaderMaterial;
  /** Estado suavizado (as mudanças de clima nunca são bruscas). */
  private readonly now: WeatherState = { rain: 0, snow: 0, storm: 0, cover: 0 };
  private snowCover = 0;
  /** Já nevou nesta partida: depois de derreter, sobram manchas pequenas (sombra, beira de mato). */
  private snowed = false;
  private wet = 0;
  private flash = 0;
  private nextBolt = 4;
  private time = 0;
  private readonly tmp = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight | null,
    private readonly hemi: THREE.HemisphereLight,
    readonly climate: Climate,
    private readonly seed: number,
    lite: boolean,
    private readonly hooks: WeatherHooks,
  ) {
    const fog = scene.fog as THREE.Fog | null;
    this.base = {
      zenith: SKY.zenith.clone(),
      horizon: SKY.horizon.clone(),
      haze: SKY.haze.clone(),
      sunColor: SKY.sunColor.clone(),
      sunDir: SKY.sunDir.clone(),
      sunI: sun?.intensity ?? 2.6,
      hemiSky: hemi.color.clone(),
      hemiGround: hemi.groundColor.clone(),
      hemiI: hemi.intensity,
      envI: scene.environmentIntensity,
      fogNear: fog?.near ?? 150,
      fogFar: fog?.far ?? 470,
    };

    // chuva: riscos (dois vértices cada) com posição e semente; a queda e o laço na caixa são feitos no shader
    const nRain = lite ? 1600 : 4200;
    const rp = new Float32Array(nRain * 6);
    const rEnd = new Float32Array(nRain * 2);
    const rSeed = new Float32Array(nRain * 2);
    for (let i = 0; i < nRain; i++) {
      const x = Math.random() * 200;
      const y = Math.random() * RAIN_H;
      const z = Math.random() * 200;
      const s = Math.random();
      for (let k = 0; k < 2; k++) {
        rp.set([x, y, z], (i * 2 + k) * 3);
        rEnd[i * 2 + k] = k;
        rSeed[i * 2 + k] = s;
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(rEnd, 1));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(rSeed, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uR: { value: 40 }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(2.2, 1.1) }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uCenter; uniform float uR; uniform float uAmount; uniform vec2 uWind;
        attribute float aEnd; attribute float aSeed;
        varying float vA;
        void main() {
          vA = 1.0 - aEnd;
          if (aSeed > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float fall = 24.0 * (0.85 + aSeed * 0.3);
          float y = mod(position.y - uTime * fall, ${RAIN_H.toFixed(1)});
          // a caixa acompanha a câmera, mas cada gota fica parada no mundo (laço por módulo)
          float side = uR * 2.0;
          vec2 rel = mod(position.xz * (side / 200.0) + uWind * (uTime * 0.5) - uCenter.xz, side) - uR;
          vec3 p = vec3(uCenter.x + rel.x, y, uCenter.z + rel.y);
          // risco: o fim vai para cima e contra o vento (inclinação da chuva)
          p += aEnd * vec3(-uWind.x * 0.04, 0.85, -uWind.y * 0.04);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLight;
        varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.78, 0.83, 0.9) * uLight, 0.38 * (0.35 + 0.65 * vA)); }`,
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 5;

    // neve: flocos (pontos redondos e macios) que descem devagar balançando
    const nSnow = lite ? 1400 : 3600;
    const sp = new Float32Array(nSnow * 3);
    const sSeed = new Float32Array(nSnow);
    for (let i = 0; i < nSnow; i++) {
      sp.set([Math.random() * 200, Math.random() * SNOW_H, Math.random() * 200], i * 3);
      sSeed[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
    this.snowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uR: { value: 40 }, uAmount: { value: 0 }, uScale: { value: 300 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uCenter; uniform float uR; uniform float uAmount; uniform float uScale;
        attribute float aSeed;
        varying float vA;
        void main() {
          if (aSeed > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          float y = mod(position.y - uTime * (1.4 + aSeed * 1.2), ${SNOW_H.toFixed(1)});
          float side = uR * 2.0;
          vec2 sway = vec2(sin(uTime * 0.7 + aSeed * 40.0), cos(uTime * 0.5 + aSeed * 23.0)) * 0.7;
          vec2 rel = mod(position.xz * (side / 200.0) + sway + vec2(uTime * 0.6, uTime * 0.25) - uCenter.xz, side) - uR;
          vec4 mv = viewMatrix * vec4(uCenter.x + rel.x, y, uCenter.z + rel.y, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uScale * (0.05 + aSeed * 0.05) / -mv.z, 1.0, 9.0);
          vA = 0.65 + aSeed * 0.35;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLight;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(0.97, 0.98, 1.0) * uLight, vA * smoothstep(0.5, 0.15, d));
        }`,
    });
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.snow.renderOrder = 5;
    this.group.add(this.rain, this.snow);
  }

  /** Estado atual (para o som e a interface). */
  get state(): { rain: number; snow: number; storm: number; night: number; snowCover: number } {
    return { rain: this.now.rain, snow: this.now.snow, storm: this.now.storm, night: climateUniforms.uNight.value, snowCover: this.snowCover };
  }

  /**
   * Avança o clima. `seconds`: tempo da partida (para todos verem o mesmo); `dt`: tempo real do quadro (animação);
   * `center`/`distance`: onde a câmera olha e a que distância (tamanho da caixa de partículas).
   */
  update(seconds: number, dt: number, center: THREE.Vector3, distance: number, pixelHeight: number): void {
    this.time += dt;
    const dl = dayLight(seconds);
    const want = weatherAt(this.seed, this.climate, seconds);
    const k = Math.min(1, dt * 0.5);
    this.now.rain += (want.rain - this.now.rain) * k;
    this.now.snow += (want.snow - this.now.snow) * k;
    this.now.storm += (want.storm - this.now.storm) * k;
    this.now.cover += (want.cover - this.now.cover) * k;
    const { rain, snow, storm, cover } = this.now;
    // neve: acumula pouco (só manchas, nunca cobre o mapa) e derrete em ~1,5 min, deixando restos mínimos;
    // chuva: molha em ~15 s e seca em ~2 min
    if (this.snowCover > 0.15) this.snowed = true;
    const residue = this.snowed ? SNOW_RESIDUE : 0;
    const snowStep = snow > 0.12 ? (dt / 50) * snow : this.snowCover > residue ? -dt / 90 : 0;
    this.snowCover = THREE.MathUtils.clamp(this.snowCover + snowStep, residue, SNOW_MAX);
    this.wet = THREE.MathUtils.clamp(this.wet + (rain > 0.1 ? (dt / 15) * rain : -dt / 120), 0, 1);
    climateUniforms.uSnow.value = this.snowCover;
    climateUniforms.uWet.value = this.wet * (1 - this.snowCover);
    climateUniforms.uNight.value = dl.night;
    skyUniforms.uNight.value = dl.night;
    skyUniforms.uCover.value = cover;

    // raios nas tempestades: clarão rápido (com uma segunda piscada) e o trovão pelo gancho
    this.flash = Math.max(0, this.flash - dt * 5);
    if (storm > 0.3) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 3 + Math.random() * (9 / storm);
        this.flash = 1;
        const a = Math.random() * Math.PI * 2;
        const r = 10 + Math.random() * 60;
        this.hooks.lightning(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r);
      }
    }
    const flicker = this.flash > 0 ? this.flash * (this.flash > 0.55 || this.flash < 0.3 ? 1 : 0.2) : 0;
    skyUniforms.uFlash.value = flicker * 0.7;

    // céu: dia → entardecer/amanhecer (dourado) → noite; o tempo fechado puxa tudo para o cinza
    const day = dl.day;
    const night = dl.night;
    const gold = dl.golden * (1 - cover * 0.8);
    const mix3 = (out: THREE.Color, baseC: THREE.Color, duskC: THREE.Color, nightC: THREE.Color, greyC: THREE.Color) => {
      out.copy(baseC).lerp(duskC, gold * 0.75).lerp(nightC, night);
      this.tmp.copy(greyC).lerp(nightC, night * 0.85);
      out.lerp(this.tmp, cover * 0.85);
      return out;
    };
    mix3(SKY.zenith, this.base.zenith, PALETTE.duskZenith, PALETTE.nightZenith, PALETTE.greyZenith);
    mix3(SKY.horizon, this.base.horizon, PALETTE.duskHorizon, PALETTE.nightHorizon, PALETTE.greyHorizon);
    mix3(SKY.haze, this.base.haze, PALETTE.duskHaze, PALETTE.nightHaze, PALETTE.greyHaze);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(SKY.haze);
      const thick = Math.max(rain * 0.6, snow * 0.5);
      fog.near = this.base.fogNear * (1 - thick * 0.6);
      fog.far = this.base.fogFar * (1 - thick * 0.45);
    }

    // sol de dia (mais baixo e dourado no começo e no fim), lua à noite; com nuvens, a luz direta enfraquece
    const sunUp = dl.sunHeight > 0;
    const direct = 1 - cover * 0.7;
    if (sunUp) {
      const elev = THREE.MathUtils.lerp(0.22, this.base.sunDir.y, Math.min(1, dl.sunHeight * 1.4));
      const az = Math.atan2(this.base.sunDir.z, this.base.sunDir.x) + (1 - Math.min(1, dl.sunHeight * 1.4)) * 0.5;
      const h = Math.sqrt(1 - elev * elev);
      SKY.sunDir.set(Math.cos(az) * h, elev, Math.sin(az) * h);
      SKY.sunColor.copy(this.base.sunColor).lerp(PALETTE.golden, gold);
    } else {
      SKY.sunDir.set(0.45, 0.7, 0.35).normalize();
      SKY.sunColor.copy(PALETTE.moon);
    }
    if (this.sun) {
      this.sun.color.copy(SKY.sunColor);
      const sunI = this.base.sunI * day * (0.75 + 0.25 * (1 - gold));
      const moonI = 0.75 * night;
      this.sun.intensity = (sunUp ? sunI : moonI) * direct + flicker * 1.5;
    }
    this.hemi.color.copy(this.base.hemiSky).lerp(PALETTE.hemiNightSky, night).lerp(PALETTE.hemiGreySky, cover * 0.5 * (1 - night));
    this.hemi.groundColor.copy(this.base.hemiGround).lerp(PALETTE.hemiNightGround, night);
    // neve no chão rebate luz para cima (fica mais claro)
    this.hemi.intensity = this.base.hemiI * (1 - night * 0.42) * (1 - cover * 0.15) * (1 + this.snowCover * 0.25) + flicker * 1.2;
    this.scene.environmentIntensity = this.base.envI * (1 - night * 0.6) * (1 - cover * 0.3);

    // partículas: caixa em volta do ponto observado, maior com a câmera longe
    const R = THREE.MathUtils.clamp(distance * 0.9, 24, 70);
    const lightK = 0.35 + 0.65 * (1 - night) + flicker;
    this.rain.visible = rain > 0.01;
    if (this.rain.visible) {
      const u = this.rainMat.uniforms;
      u.uTime!.value = this.time;
      (u.uCenter!.value as THREE.Vector3).copy(center);
      u.uR!.value = R;
      u.uAmount!.value = rain;
      u.uLight!.value = lightK;
    }
    this.snow.visible = snow > 0.01;
    if (this.snow.visible) {
      const u = this.snowMat.uniforms;
      u.uTime!.value = this.time;
      (u.uCenter!.value as THREE.Vector3).copy(center);
      u.uR!.value = R;
      u.uAmount!.value = snow;
      u.uScale!.value = pixelHeight * 0.9;
      u.uLight!.value = lightK;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.rain.geometry.dispose();
    this.snow.geometry.dispose();
    this.rainMat.dispose();
    this.snowMat.dispose();
    // o céu é compartilhado entre partidas: volta ao padrão
    SKY.zenith.copy(this.base.zenith);
    SKY.horizon.copy(this.base.horizon);
    SKY.haze.copy(this.base.haze);
    SKY.sunColor.copy(this.base.sunColor);
    SKY.sunDir.copy(this.base.sunDir);
    climateUniforms.uSnow.value = 0;
    climateUniforms.uWet.value = 0;
    climateUniforms.uNight.value = 0;
    skyUniforms.uNight.value = 0;
    skyUniforms.uCover.value = 0;
    skyUniforms.uFlash.value = 0;
  }
}
