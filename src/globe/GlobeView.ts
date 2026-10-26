import * as THREE from 'three';
import type { Position } from 'geojson';
import { COUNTRY_GEO } from '../../shared/data/geography.ts';
import type { GraphicsProfile } from '../lib/graphics.ts';
import { loadWorldGeo, type WorldCountry, type WorldGeo } from './worldGeo.ts';
import { TouchGestures } from '../game/input/TouchGestures.ts';

/**
 * Globo 3D. A geografia (texturas e linhas) é gerada a partir dos dados de base; fronteiras,
 * litoral e marcadores ficam em camadas separadas para que estados políticos (névoa,
 * relações, guerras) possam ser ligados/desligados sem reconstruir a esfera.
 */
export interface GlobeOptions {
  profile: GraphicsProfile['globe'];
  pixelRatioCap: number;
  antialias: boolean;
  reducedMotion: boolean;
  /** País em destaque (ISO alfa-3). */
  highlight?: string;
  /** Modo interativo (globo diplomático da partida): arrastar, zoom, seleção e rótulos. */
  interactive?: {
    /** Elemento sobreposto ao canvas onde os rótulos HTML são posicionados. */
    labelHost: HTMLElement;
    /** País tocado/clicado (ISO numérico do Natural Earth) ou null no oceano. */
    onSelect: (isoNumeric: string | null) => void;
  };
}

/** Preenchimento político de um país (camada separada da geografia). */
export interface PoliticalFill {
  color: string;
  alpha: number;
  /** Hachura: país existente, mas sem contato. */
  hatch?: boolean;
}

export interface GlobeLabel {
  key: string;
  lon: number;
  lat: number;
  text: string;
  /** Mostrado só com zoom próximo. */
  sub?: string;
  color: string;
}

export interface GlobeArc {
  from: { lon: number; lat: number };
  to: { lon: number; lat: number };
  color: string;
  dashed?: boolean;
}

export type GlobeLayer = 'borders' | 'coasts' | 'markers' | 'clouds' | 'political' | 'arcs' | 'labels';
export type GlobeLayout = 'hero' | 'center';

const RADIUS = 1;
const DEG = Math.PI / 180;
/**
 * Rotação automática do globo do menu (rad/s): a original (0,08) +5% e depois +10%, uma volta a
 * cada ~68 s. Começa com aceleração suave (SPIN_RAMP) para não "dar um tranco" ao aparecer.
 */
export const SPIN = 0.08 * 1.05 * 1.1;
/** Segundos até o globo atingir a velocidade de cruzeiro. */
export const SPIN_RAMP = 1.6;
/** Com "reduzir movimento" o globo continua girando, mas a 1/4 da velocidade (~5 min por volta). */
export const REDUCED_SPIN_FACTOR = 0.25;

export function lonLatToVector(lon: number, lat: number, r = RADIUS, out = new THREE.Vector3()): THREE.Vector3 {
  // mesma convenção de UV da THREE.SphereGeometry (u = 0 em lon -180)
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return out.set(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

/** Rotação em Y que coloca a longitude dada de frente para a câmera (+Z). */
export function facingRotation(lon: number): number {
  return -(lon + 90) * DEG;
}

/**
 * Enquadramento por formato de tela: em telas largas (hero) o globo fica à direita do menu;
 * em retrato estreito ele vira um horizonte planetário na parte de baixo; nos demais casos,
 * centralizado. Retorna o raio aparente em px e o deslocamento do centro em px.
 */
export function globeFraming(layout: GlobeLayout, w: number, h: number): { radiusPx: number; offsetX: number; offsetY: number } {
  const aspect = w / h;
  if (layout === 'hero' && w >= 768 && aspect > 1.2) {
    return { radiusPx: (w >= 1280 ? 0.4 : 0.36) * h, offsetX: w * (w >= 1280 ? 0.2 : 0.25), offsetY: 0 };
  }
  if (aspect < 0.87 && w < 900) return { radiusPx: 0.95 * w, offsetX: 0, offsetY: h * 0.5 };
  return { radiusPx: 0.36 * Math.min(w, h), offsetX: 0, offsetY: 0 };
}

export class GlobeView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private readonly tilt = new THREE.Group();
  private readonly earth = new THREE.Group();
  private readonly layers = new Map<GlobeLayer, THREE.Object3D>();
  private readonly disposables: { dispose: () => void }[] = [];
  private clouds: THREE.Mesh | null = null;
  private layout: GlobeLayout = 'hero';
  private raf = 0;
  private last = 0;
  private accum = 0;
  /** Tempo desde que o giro automático começou (para a aceleração inicial). */
  private spinT = 0;
  private disposed = false;
  private readonly ro: ResizeObserver;
  private readonly onVisibility = () => this.syncRunning();
  private geo: WorldGeo | null = null;
  private active = true;
  /** Zoom do modo interativo (1 = enquadramento padrão). */
  private zoom = 1;
  private political: THREE.Mesh | null = null;
  private politicalCanvas: HTMLCanvasElement | null = null;
  private arcs = new THREE.Group();
  /** Tempo compartilhado pelos fluxos das linhas (segundos). */
  private readonly arcTime = { value: 0 };
  private labels: { def: GlobeLabel; el: HTMLDivElement; sub: HTMLDivElement | null }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private sphere: THREE.Mesh | null = null;
  private tween: { from: THREE.Vector2; to: THREE.Vector2; t: number; dur: number; zoom?: [number, number] } | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: GlobeOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.antialias, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // no globo diplomático o eixo fica reto: arrastar e centralizar países fica previsível
    this.tilt.rotation.z = opts.interactive ? 0 : 0.32;
    this.tilt.rotation.x = opts.interactive ? 0.3 : 0.18;
    this.tilt.add(this.earth);
    this.earth.add(this.arcs);
    this.layers.set('arcs', this.arcs);
    this.scene.add(this.tilt);
    const focus = COUNTRY_GEO.find((g) => g.id === opts.highlight)?.capital ?? { lon: -40, lat: 0 };
    this.earth.rotation.y = facingRotation(focus.lon + 25);

    this.scene.add(new THREE.AmbientLight('#7d93ad', 0.55));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    sun.position.set(-3.2, 1.6, 3.4);
    this.scene.add(sun);

    this.addStars(opts.profile.stars);
    this.addAtmosphere();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (opts.interactive) this.bindInteraction(opts.interactive.onSelect);
    this.resize();
  }

  // ------------------------------------------------------------ interação (globo diplomático)

  private bindInteraction(onSelect: (iso: string | null) => void): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    const gestures = new TouchGestures(
      {
        tap: (x, y) => onSelect(this.pick(x, y)),
        longPress: (x, y) => onSelect(this.pick(x, y)),
        pan: (dx, dy) => this.drag(dx, dy),
        pinch: (scale, _rot, dx, dy) => {
          this.zoomBy(scale);
          this.drag(dx, dy);
        },
        box: () => {},
        cancel: () => {},
      },
      () => false,
    );
    const pt = (e: PointerEvent) => ({ id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, primary: e.isPrimary });
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      el.setPointerCapture(e.pointerId);
      gestures.down(pt(e));
    };
    const move = (e: PointerEvent) => gestures.move(pt(e));
    const up = (e: PointerEvent) => gestures.up(pt(e));
    const cancel = (e: PointerEvent) => gestures.cancelPointer(e.pointerId);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('wheel', wheel, { passive: false });
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('wheel', wheel);
    });
  }

  /** Arrasto em pixels: gira o globo (longitude) e inclina (latitude), proporcional ao zoom. */
  private drag(dx: number, dy: number): void {
    this.tween = null;
    const k = 0.005 / this.zoom;
    this.earth.rotation.y += dx * k;
    this.tilt.rotation.x = THREE.MathUtils.clamp(this.tilt.rotation.x + dy * k, -1.2, 1.2);
  }

  zoomBy(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.8, 4);
    this.resize();
  }

  /**
   * Centraliza a coordenada; animação curta (instantânea com movimento reduzido). `zoom`
   * aproxima junto (globo → região), com a mesma suavização.
   */
  focus(lon: number, lat: number, zoom?: number, dur = 0.6): void {
    const to = new THREE.Vector2(facingRotation(lon), THREE.MathUtils.clamp(lat * DEG, -1.2, 1.2));
    // menor caminho em longitude
    const cur = this.earth.rotation.y;
    to.x = cur + Math.atan2(Math.sin(to.x - cur), Math.cos(to.x - cur));
    const z = zoom === undefined ? undefined : THREE.MathUtils.clamp(zoom, 0.8, 4);
    if (this.opts.reducedMotion) {
      this.earth.rotation.y = to.x;
      this.tilt.rotation.x = to.y;
      if (z !== undefined) this.zoomBy(z / this.zoom);
      return;
    }
    this.tween = { from: new THREE.Vector2(cur, this.tilt.rotation.x), to, t: 0, dur, ...(z !== undefined ? { zoom: [this.zoom, z] as [number, number] } : {}) };
  }

  /** Posição de tela (px relativos ao canvas) de uma coordenada, ou null se estiver no lado oculto. */
  projectToScreen(lon: number, lat: number): { x: number; y: number } | null {
    const v = lonLatToVector(lon, lat, RADIUS);
    this.earth.localToWorld(v);
    const toCam = this.camera.position.clone().sub(v).normalize();
    if (v.clone().normalize().dot(toCam) < 0.1) return null;
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** Pausa/retoma o desenho (o globo diplomático fica montado enquanto a partida dura). */
  setActive(active: boolean): void {
    this.active = active;
    this.syncRunning();
    if (active) this.resize();
  }

  /** Coordenada de tela → país (ISO numérico) sob o ponto, ou null. */
  private pick(clientX: number, clientY: number): string | null {
    if (!this.sphere || !this.geo) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.sphere, false)[0];
    if (!hit) return null;
    const p = this.earth.worldToLocal(hit.point.clone()).normalize();
    const { lon, lat } = vectorToLonLat(p);
    return countryAt(this.geo.countries, lon, lat)?.id ?? null;
  }

  /** Camada política: cores por país (só estado, nunca geografia). */
  setPolitical(fills: Record<string, PoliticalFill>, selected: string | null): void {
    if (!this.geo) return;
    const W = 2048;
    const H = 1024;
    if (!this.politicalCanvas) {
      this.politicalCanvas = document.createElement('canvas');
      this.politicalCanvas.width = W;
      this.politicalCanvas.height = H;
    }
    const c = this.politicalCanvas.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    const project = (p: Position): [number, number] => [((p[0]! + 180) / 360) * W, ((90 - p[1]!) / 180) * H];
    const hatch = hatchPattern(c);
    for (const country of this.geo.countries) {
      const f = country.id ? fills[country.id] : undefined;
      if (!f) continue;
      for (const poly of country.polygons) {
        for (const offset of [-W, 0, W]) {
          c.beginPath();
          for (const ring of poly) traceRing(ring, project, offset, H, c);
          c.globalAlpha = f.alpha;
          c.fillStyle = f.color;
          c.fill('evenodd');
          if (f.hatch && hatch) {
            c.globalAlpha = 0.5;
            c.fillStyle = hatch;
            c.fill('evenodd');
          }
          if (country.id === selected) {
            c.globalAlpha = 1;
            c.lineWidth = 3;
            c.strokeStyle = '#f3d27e';
            c.stroke();
          }
        }
      }
    }
    c.globalAlpha = 1;
    if (!this.political) {
      const tex = new THREE.CanvasTexture(this.politicalCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.disposables.push(tex);
      this.political = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.0007, 96, 48), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      this.earth.add(this.political);
      this.layers.set('political', this.political);
    } else {
      ((this.political.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture).needsUpdate = true;
    }
  }

  /** Rótulos HTML (nomes dos países do cenário; capitais com zoom próximo). */
  setLabels(defs: GlobeLabel[]): void {
    const host = this.opts.interactive?.labelHost;
    if (!host) return;
    for (const l of this.labels) l.el.remove();
    this.labels = defs.map((def) => {
      const el = document.createElement('div');
      el.className = 'globe-label';
      el.style.color = def.color;
      el.textContent = def.text;
      let sub: HTMLDivElement | null = null;
      if (def.sub) {
        sub = document.createElement('div');
        sub.className = 'globe-label-sub';
        sub.textContent = def.sub;
        el.appendChild(sub);
      }
      host.appendChild(el);
      return { def, el, sub };
    });
  }

  /**
   * Rotas e linhas entre capitais (tratados, sanções, guerras), em arcos baixos acima da superfície.
   * Cada linha tem um fluxo contínuo de pulsos que corre da origem para o destino (shader com o
   * comprimento acumulado do arco), na mesma velocidade em todas as linhas; sanções correm
   * tracejadas. O arco segue o grande círculo (slerp) e a altura é limitada, para que rotas longas
   * não virem órbitas fora do globo.
   */
  setArcs(defs: GlobeArc[]): void {
    for (const child of [...this.arcs.children]) {
      const line = child as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.arcs.remove(line);
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const d of defs) {
      lonLatToVector(d.from.lon, d.from.lat, 1, a);
      lonLatToVector(d.to.lon, d.to.lat, 1, b);
      const pts = arcPoints(a, b);
      const dist = new Float32Array(pts.length);
      for (let i = 1; i < pts.length; i++) dist[i] = dist[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!);
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      geom.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.arcTime, uColor: { value: new THREE.Color(d.color) }, uDashed: { value: d.dashed ? 1 : 0 }, uLength: { value: dist[dist.length - 1] ?? 1 } },
        vertexShader: ARC_VERTEX,
        fragmentShader: ARC_FRAGMENT,
        transparent: true,
        depthWrite: false,
      });
      this.arcs.add(new THREE.Line(geom, mat));
    }
  }

  private updateLabels(): void {
    if (!this.labels.length) return;
    const show = this.layers.get('labels')?.visible !== false && this.labelsVisible;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const close = this.zoom >= 1.8;
    for (const l of this.labels) {
      lonLatToVector(l.def.lon, l.def.lat, RADIUS * 1.01, v);
      this.earth.localToWorld(v);
      n.copy(v).normalize();
      camDir.copy(this.camera.position).sub(v).normalize();
      const facing = n.dot(camDir);
      if (!show || facing < 0.15) {
        l.el.style.display = 'none';
        continue;
      }
      v.project(this.camera);
      l.el.style.display = 'block';
      l.el.style.opacity = String(Math.min(1, (facing - 0.15) * 4));
      l.el.style.transform = `translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height}px) translate(-50%, -130%)`;
      if (l.sub) l.sub.style.display = close ? 'block' : 'none';
    }
  }

  private labelsVisible = true;

  /** Carrega a geografia e monta a esfera e as camadas. */
  async load(): Promise<void> {
    const geo = await loadWorldGeo();
    if (this.disposed) return;
    this.geo = geo;
    this.buildEarth(geo);
    this.buildLines(geo);
    this.buildMarkers();
    if (this.opts.profile.clouds) this.buildClouds();
    this.syncRunning();
  }

  setLayerVisible(layer: GlobeLayer, visible: boolean): void {
    if (layer === 'labels') this.labelsVisible = visible;
    const obj = this.layers.get(layer);
    if (obj) obj.visible = visible;
  }

  setLayout(layout: GlobeLayout): void {
    this.layout = layout;
    this.resize();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((fn) => fn());
    for (const l of this.labels) l.el.remove();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------ laço

  private syncRunning(): void {
    cancelAnimationFrame(this.raf);
    if (this.disposed || document.hidden || !this.active) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // limite de quadros por preset: acumula o tempo e só desenha quando passa do intervalo
    this.accum += dt;
    const minStep = 1 / this.opts.profile.maxFps;
    if (this.accum < minStep * 0.9) return;
    const step = this.accum;
    this.accum = 0;
    if (this.opts.interactive) {
      const tw = this.tween;
      if (tw) {
        tw.t = Math.min(1, tw.t + step / tw.dur);
        const e = 1 - (1 - tw.t) ** 3;
        this.earth.rotation.y = tw.from.x + (tw.to.x - tw.from.x) * e;
        this.tilt.rotation.x = tw.from.y + (tw.to.y - tw.from.y) * e;
        if (tw.zoom) {
          this.zoom = tw.zoom[0] + (tw.zoom[1] - tw.zoom[0]) * e;
          this.resize();
        }
        if (tw.t >= 1) this.tween = null;
      }
      if (this.clouds) this.clouds.rotation.y += SPIN * 0.05 * step;
    } else {
      // partida suave (smoothstep) até a velocidade de cruzeiro
      this.spinT = Math.min(SPIN_RAMP, this.spinT + step);
      const k = this.spinT / SPIN_RAMP;
      const spin = (this.opts.reducedMotion ? SPIN * REDUCED_SPIN_FACTOR : SPIN) * k * k * (3 - 2 * k);
      this.earth.rotation.y += spin * step;
      if (this.clouds) this.clouds.rotation.y += spin * 0.35 * step;
    }
    // fluxo das linhas: contínuo; com "Reduzir animações" corre devagar
    this.arcTime.value = (this.arcTime.value + step * (this.opts.reducedMotion ? 0.3 : 1)) % 1000;
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const framing = this.opts.interactive ? { radiusPx: 0.4 * Math.min(w, h), offsetX: 0, offsetY: 0 } : globeFraming(this.layout, w, h);
    const { offsetX, offsetY } = framing;
    const radiusPx = framing.radiusPx * this.zoom;
    const halfH = h / 2;
    this.camera.position.set(0, 0, Math.max(1.15, halfH / (radiusPx * Math.tan((this.camera.fov / 2) * DEG)) + 0.15));
    this.camera.lookAt(0, 0, 0);
    if (offsetX || offsetY) this.camera.setViewOffset(w, h, -offsetX, -offsetY, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (!this.raf || document.hidden) this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ construção

  private buildEarth(geo: WorldGeo): void {
    const W = this.opts.profile.textureWidth;
    const H = W / 2;
    const color = document.createElement('canvas');
    color.width = W;
    color.height = H;
    const spec = document.createElement('canvas');
    spec.width = W;
    spec.height = H;
    const c = color.getContext('2d')!;
    const s = spec.getContext('2d')!;

    // oceano: azul-petróleo profundo, um pouco mais claro perto do equador
    const ocean = c.createLinearGradient(0, 0, 0, H);
    ocean.addColorStop(0, '#0b1a26');
    ocean.addColorStop(0.5, '#123247');
    ocean.addColorStop(1, '#0b1a26');
    c.fillStyle = ocean;
    c.fillRect(0, 0, W, H);
    s.fillStyle = '#5a5a5a';
    s.fillRect(0, 0, W, H);

    const project = (p: Position): [number, number] => [((p[0]! + 180) / 360) * W, ((90 - p[1]!) / 180) * H];
    for (const country of geo.countries) {
      c.fillStyle = landColor(country.id, country.name);
      s.fillStyle = '#0a0a0a';
      for (const poly of country.polygons) {
        for (const offset of [-W, 0, W]) {
          c.beginPath();
          s.beginPath();
          for (const ring of poly) traceRing(ring, project, offset, H, c, s);
          c.fill('evenodd');
          s.fill('evenodd');
        }
      }
    }
    // relevo sugerido por ruído fino, sem pretensão cartográfica
    grain(c, W, H);

    const map = new THREE.CanvasTexture(color);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const specularMap = new THREE.CanvasTexture(spec);
    this.disposables.push(map, specularMap);
    const seg = W >= 2048 ? 96 : 64;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, seg, seg / 2),
      new THREE.MeshPhongMaterial({ map, specularMap, specular: new THREE.Color('#41586b'), shininess: 22, emissive: new THREE.Color('#0a1520'), emissiveIntensity: 1 }),
    );
    this.earth.add(sphere);
    this.sphere = sphere;
  }

  private buildLines(geo: WorldGeo): void {
    const borders = lineSegments(geo.borders, RADIUS * 1.0015, '#c7d3df', 0.32);
    const coasts = lineSegments(geo.coasts, RADIUS * 1.001, '#8fb3cc', 0.55);
    this.earth.add(borders, coasts);
    this.layers.set('borders', borders);
    this.layers.set('coasts', coasts);
  }

  private buildMarkers(): void {
    const sprite = circleSprite();
    this.disposables.push(sprite);
    const group = new THREE.Group();
    const normal: number[] = [];
    const hi: number[] = [];
    const v = new THREE.Vector3();
    for (const g of COUNTRY_GEO) {
      lonLatToVector(g.capital.lon, g.capital.lat, RADIUS * 1.004, v);
      (g.id === this.opts.highlight ? hi : normal).push(v.x, v.y, v.z);
    }
    const mk = (pos: number[], size: number, color: string, opacity: number) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return new THREE.Points(geom, new THREE.PointsMaterial({ map: sprite, size, sizeAttenuation: false, color, transparent: true, opacity, depthWrite: false, alphaTest: 0.05 }));
    };
    group.add(mk(normal, 7 * this.renderer.getPixelRatio(), '#e0b44c', 0.8));
    if (hi.length) group.add(mk(hi, 12 * this.renderer.getPixelRatio(), '#ffd47a', 1));
    this.earth.add(group);
    this.layers.set('markers', group);
  }

  private buildClouds(): void {
    const W = 512;
    const H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const v = new THREE.Vector3();
    for (let y = 0; y < H; y++) {
      const lat = 90 - ((y + 0.5) / H) * 180;
      for (let x = 0; x < W; x++) {
        // amostra o ruído na superfície da esfera: textura sem emenda na longitude 180
        lonLatToVector(((x + 0.5) / W) * 360 - 180, lat, 2.2, v);
        const n = fbm(v.x, v.y, v.z);
        const a = Math.max(0, Math.min(1, (n - 0.52) * 3.2));
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const alphaMap = new THREE.CanvasTexture(canvas);
    this.disposables.push(alphaMap);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.012, 64, 32), new THREE.MeshLambertMaterial({ color: '#e8eef4', alphaMap, transparent: true, opacity: 0.38, depthWrite: false }));
    this.earth.add(clouds);
    this.clouds = clouds;
    this.layers.set('clouds', clouds);
  }

  private addAtmosphere(): void {
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.14, 64, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color('#5aa2d8') } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
          void main() {
            // face traseira: d vai de -1 (centro) a 0 (borda do halo); máximo junto ao limbo da Terra
            float d = dot(vN, vV);
            float a = pow(clamp(-d * 2.0, 0.0, 1.0), 2.2) * 0.5;
            gl_FragColor = vec4(uColor * a, a);
          }`,
      }),
    );
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.003, 64, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color('#7fc0ee') } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
          void main() {
            float a = pow(1.0 - max(dot(vN, vV), 0.0), 3.5) * 0.7;
            gl_FragColor = vec4(uColor * a, a);
          }`,
      }),
    );
    this.tilt.add(halo, rim);
  }

  private addStars(count: number): void {
    const pos: number[] = [];
    const col: number[] = [];
    let seed = 1337;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const t = rnd() * Math.PI * 2;
      const r = 60 + rnd() * 30;
      const k = Math.sqrt(1 - u * u);
      pos.push(r * k * Math.cos(t), r * u, r * k * Math.sin(t) - 30);
      const b = 0.35 + rnd() * 0.5;
      col.push(b, b * 1.02, b * 1.1);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(geom, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false })));
  }
}

// ------------------------------------------------------------ utilitários

/** Paleta de terra contida (oliva, cáqui, cinza-esverdeado); gelo para as calotas. */
const LAND = ['#4d5a41', '#56603f', '#5b5a44', '#4a5747', '#615c45', '#525e4a', '#5a6148'];
function landColor(id: string | null, name: string): string {
  if (id === '010' || name === 'Antarctica') return '#b9c3cb';
  if (id === '304' || name === 'Greenland') return '#a9b5bd';
  let h = 0;
  for (const ch of id ?? name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LAND[h % LAND.length]!;
}

/**
 * Traça um anel em projeção equirretangular. Longitudes são "desembrulhadas" para que
 * polígonos que cruzam o antimeridiano fiquem contínuos; anéis que contornam um polo
 * (Antártida) são fechados pela borda do polo.
 */
function traceRing(ring: Position[], project: (p: Position) => [number, number], offset: number, H: number, ...ctxs: CanvasRenderingContext2D[]): void {
  if (ring.length < 3) return;
  let shift = 0;
  let prevLon = ring[0]![0]!;
  const pts: [number, number][] = [];
  for (const p of ring) {
    const lon = p[0]!;
    if (lon - prevLon > 180) shift -= 360;
    else if (lon - prevLon < -180) shift += 360;
    prevLon = lon;
    const [x, y] = project([lon + shift, p[1]!]);
    pts.push([x + offset, y]);
  }
  const span = shift;
  if (Math.abs(span) >= 180) {
    // contorna um polo: fecha pela borda (sul se a maior parte do anel estiver no hemisfério sul)
    const south = ring.reduce((a, p) => a + p[1]!, 0) / ring.length < 0;
    const yPole = south ? H : 0;
    const lastX = pts[pts.length - 1]![0];
    pts.push([lastX, yPole], [pts[0]![0], yPole]);
  }
  for (const ctx of ctxs) {
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.closePath();
  }
}

function lineSegments(lines: Position[][], r: number, color: string, opacity: number): THREE.LineSegments {
  const pos: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1]!;
      const q = line[i]!;
      let dLon = q[0]! - p[0]!;
      if (dLon > 180) dLon -= 360;
      else if (dLon < -180) dLon += 360;
      const dLat = q[1]! - p[1]!;
      // subdivide arestas longas para acompanharem a curvatura
      const steps = Math.max(1, Math.ceil(Math.hypot(dLon, dLat) / 2));
      for (let k = 0; k < steps; k++) {
        lonLatToVector(p[0]! + (dLon * k) / steps, p[1]! + (dLat * k) / steps, r, a);
        lonLatToVector(p[0]! + (dLon * (k + 1)) / steps, p[1]! + (dLat * (k + 1)) / steps, r, b);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function circleSprite(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grain(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  let seed = 99;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.globalCompositeOperation = 'overlay';
  const n = Math.round((W * H) / 900);
  for (let i = 0; i < n; i++) {
    const v = rnd();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const s = 1 + rnd() * (W / 512);
    ctx.fillRect(rnd() * W, rnd() * H, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ruído de valor 3D simples (determinístico) para as nuvens
function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(xf);
  const v = s(yf);
  const w = s(zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x: number, y: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * noise3(x * f, y * f * 1.6, z * f);
    f *= 2.1;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

export function vectorToLonLat(p: THREE.Vector3): { lon: number; lat: number } {
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(p.y, -1, 1)) / DEG;
  let lon = Math.atan2(p.z, -p.x) / DEG - 180;
  if (lon < -180) lon += 360;
  return { lon, lat };
}

/** Ponto em polígono (lon/lat planas, com tolerância ao antimeridiano). */
export function countryAt(countries: WorldCountry[], lon: number, lat: number): WorldCountry | null {
  for (const c of countries) {
    for (const poly of c.polygons) {
      let inside = false;
      for (const ring of poly) if (ringContains(ring, lon, lat)) inside = !inside;
      if (inside) return c;
    }
  }
  return null;
}

function ringContains(ring: Position[], lon: number, lat: number): boolean {
  let inside = false;
  const base = ring[0]![0]!;
  // desembrulha as longitudes em torno do primeiro ponto
  const unwrap = (x: number) => (x - base > 180 ? x - 360 : x - base < -180 ? x + 360 : x);
  let x = unwrap(lon);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = unwrap(ring[i]![0]!);
    const yi = ring[i]![1]!;
    const xj = unwrap(ring[j]![0]!);
    const yj = ring[j]![1]!;
    if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) {
    // segunda tentativa com a longitude deslocada (anéis que cruzam o antimeridiano)
    x = x + 360;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = unwrap(ring[i]![0]!);
      const yi = ring[i]![1]!;
      const xj = unwrap(ring[j]![0]!);
      const yj = ring[j]![1]!;
      if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(190,200,210,0.55)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, 12);
  g.lineTo(12, 0);
  g.stroke();
  return ctx.createPattern(c, 'repeat');
}

/** Pontos de um arco baixo sobre o grande círculo entre dois pontos da esfera unitária. */
function arcPoints(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const angle = a.angleTo(b);
  // eixo de rotação; pontos quase antípodas usam um eixo qualquer perpendicular
  const axis = new THREE.Vector3().crossVectors(a, b);
  if (axis.lengthSq() < 1e-10) {
    axis.set(0, 1, 0).cross(a);
    if (axis.lengthSq() < 1e-10) axis.set(1, 0, 0);
  }
  axis.normalize();
  const lift = Math.min(0.05, 0.015 + angle * 0.025);
  const n = Math.max(16, Math.ceil(angle * 48));
  const q = new THREE.Quaternion();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    q.setFromAxisAngle(axis, angle * t);
    pts.push(
      a
        .clone()
        .applyQuaternion(q)
        .multiplyScalar(RADIUS * (1.004 + Math.sin(Math.PI * t) * lift)),
    );
  }
  return pts;
}

const ARC_VERTEX = /* glsl */ `
attribute float aDist;
varying float vDist;
varying float vFacing;
void main() {
  vDist = aDist;
  // lado do globo voltado para a câmera (o globo fica na origem)
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(world), normalize(cameraPosition));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Linha fraca de base + pulsos (cabeça brilhante com cauda) que avançam para o destino; as pontas
 * esmaecem para o fluxo nascer na origem e sumir no destino, e o trecho no verso do globo some.
 */
const ARC_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uDashed;
uniform float uLength;
varying float vDist;
varying float vFacing;
void main() {
  float phase = fract(vDist * 7.0 - uTime * 1.6);
  float pulse = pow(phase, 3.0);
  float ends = smoothstep(0.0, 0.03, vDist) * smoothstep(0.0, 0.03, uLength - vDist);
  // o trecho atrás do globo some (não vira um anel em volta da borda)
  float alpha = (0.4 + 0.6 * pulse) * ends * smoothstep(0.12, 0.4, vFacing);
  if (uDashed > 0.5 && fract(vDist * 40.0 - uTime * 1.6 * 40.0 / 7.0) > 0.55) alpha *= 0.15;
  // cabeça do pulso clareia em direção ao branco
  gl_FragColor = vec4(mix(uColor, vec3(1.0), pulse * pulse * 0.6), alpha);
}
`;
