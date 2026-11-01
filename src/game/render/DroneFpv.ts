import * as THREE from 'three';
import { DRONE } from '../../../shared/sim/drones.ts';

/** Um alvo possível na tela da câmera do drone (tropa ou edifício inimigo à vista). */
export interface FpvTarget {
  pos: THREE.Vector3;
  label: string;
  kind: 'unit' | 'building';
}

/** Estado do drone que a câmera acompanha (posição e atitude já interpoladas pela camada aérea). */
export interface FpvDroneView {
  pos: THREE.Vector3;
  heading: number;
  pitch: number;
  bank: number;
  speed: number;
  alt: number;
  battery: number;
}

/** Comando do manche para o servidor (a simulação limita os valores de novo). */
export interface FpvSteer {
  turn: number;
  climb: number;
  throttle: number;
}

/** Metros por unidade de mundo, só para os números da tela (velocidade e altitude). */
const METERS = 4;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Campo de visão de 120°, como nos jogos de tiro (medido em 4:3, o padrão de Quake, CS e Apex): o ângulo vertical fica
 * fixo e a tela larga ganha mais lado (~133° em 16:9).
 */
export const FPV_FOV = 120;
const FPV_VFOV = (2 * Math.atan(Math.tan(((FPV_FOV / 2) * Math.PI) / 180) / (4 / 3)) * 180) / Math.PI;
/** Pose prevista no cliente: a câmera responde na hora e é puxada aos poucos para a posição do servidor. */
interface Pred {
  x: number;
  z: number;
  alt: number;
  heading: number;
  speed: number;
  turn: number;
  climb: number;
  vz: number;
  bank: number;
  pitch: number;
}

/**
 * Câmera em primeira pessoa do drone de ataque, no estilo dos óculos de FPV: a imagem da câmera de bordo com o OSD
 * branco por cima (sinal, tensão da bateria, bússola, velocidade, altitude, tempo de voo, horizonte artificial, mira),
 * as marcações dos alvos inimigos à vista e um pouco de chiado analógico. O OSD é um canvas 2D por cima do jogo,
 * redesenhado a cada quadro (os marcadores acompanham os alvos sem tremer).
 *
 * Controles: o mouse (cursor travado na tela) dá a direção; W acelera, Shift é o turbo e S freia; A/D viram de leve; Espaço sobe e
 * Ctrl (ou C) desce; clique esquerdo explode; Esc devolve ao piloto automático. No toque, arrastar o dedo é o manche e
 * um toque rápido explode.
 */
export class DroneFpv {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  droneId: number | null = null;
  private keys = new Set<string>();
  private stick: { x: number; y: number } | null = null;
  private dragFrom: { x: number; y: number } | null = null;
  /** Mira do mouse com o cursor travado: o movimento empurra o manche, que volta sozinho ao centro. */
  private aim = { x: 0, y: 0 };
  /** A mira do mouse filtrada (tira o tremido do movimento da mão). */
  private aimSmooth = { x: 0, y: 0 };
  private pred: Pred | null = null;
  private realAt = 0;
  private hist: { x: number; z: number; alt: number; heading: number; t: number }[] = [];
  private readonly shown = { pos: new THREE.Vector3() };
  /** O jogador soltou o cursor (Esc do navegador, troca de janela): devolve o drone ao piloto automático. */
  onLockLost: (() => void) | null = null;
  private readonly onMouse = (e: MouseEvent) => {
    if (!this.locked()) return;
    this.aim.x = clamp(this.aim.x + e.movementX * 0.0034, -1, 1);
    this.aim.y = clamp(this.aim.y + e.movementY * 0.0034, -1, 1);
  };
  private readonly onLockChange = () => {
    if (!this.locked() && this.active && !this.lostAt && this.wasLocked) this.onLockLost?.();
    this.wasLocked = this.locked();
  };
  private wasLocked = false;
  private lastSent: FpvSteer = { turn: 0, climb: 0, throttle: 0 };
  private sentAt = 0;
  private startedAt = 0;
  private lostAt = 0;
  private time = 0;
  private savedCam: { fov: number; near: number } | null = null;

  constructor(private readonly host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '40', display: 'none' });
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    document.addEventListener('mousemove', this.onMouse);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  private locked(): boolean {
    return document.pointerLockElement === this.host;
  }

  get active(): boolean {
    return this.droneId !== null;
  }

  /** O sinal caiu (impacto, derrubado, bateria): tela de chiado por um instante antes de voltar ao mapa. */
  get lost(): boolean {
    return this.lostAt > 0;
  }

  enter(id: number, camera: THREE.PerspectiveCamera): void {
    this.droneId = id;
    this.startedAt = this.time;
    this.lostAt = 0;
    this.keys.clear();
    this.stick = null;
    this.savedCam ??= { fov: camera.fov, near: camera.near };
    camera.fov = FPV_VFOV;
    camera.near = 0.04;
    camera.updateProjectionMatrix();
    this.canvas.style.display = 'block';
    this.aim = { x: 0, y: 0 };
    this.aimSmooth = { x: 0, y: 0 };
    this.pred = null;
    // o mouse vira a direção: trava o cursor no centro (no celular não existe; lá o dedo é o manche)
    try {
      const req = this.host.requestPointerLock() as unknown as Promise<void> | undefined;
      req?.catch?.(() => undefined);
    } catch {
      // navegador sem suporte: segue com o teclado e o arrasto
    }
  }

  exit(camera: THREE.PerspectiveCamera): void {
    this.droneId = null;
    this.pred = null;
    this.lostAt = 0;
    this.keys.clear();
    this.stick = null;
    if (this.savedCam) {
      camera.fov = this.savedCam.fov;
      camera.near = this.savedCam.near;
      camera.updateProjectionMatrix();
      this.savedCam = null;
    }
    this.canvas.style.display = 'none';
    this.wasLocked = false;
    if (this.locked()) document.exitPointerLock();
  }

  signalLost(): void {
    if (this.active && !this.lostAt) this.lostAt = this.time || 0.0001;
  }

  /** Segundos desde que o sinal caiu (0 = no ar). */
  lostFor(): number {
    return this.lostAt ? this.time - this.lostAt : 0;
  }

  key(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearKeys(): void {
    this.keys.clear();
    this.stick = null;
    this.dragFrom = null;
  }

  pointerDown(x: number, y: number): void {
    this.dragFrom = { x, y };
    this.stick = { x: 0, y: 0 };
  }

  pointerMove(x: number, y: number): void {
    if (!this.dragFrom) return;
    const r = this.canvas.getBoundingClientRect();
    const k = Math.min(r.width, r.height) * 0.22;
    this.stick = { x: clamp((x - this.dragFrom.x) / k, -1, 1), y: clamp((y - this.dragFrom.y) / k, -1, 1) };
  }

  pointerUp(): void {
    this.dragFrom = null;
    this.stick = null;
  }

  /**
   * Manche atual: mouse (com o cursor travado) dá a direção e inclina o nariz; W acelera, Shift é o turbo e S freia; A/D viram de leve;
   * Espaço sobe e Ctrl (ou C) desce; no toque, arrastar o dedo é o manche.
   */
  private input(): FpvSteer {
    const k = this.keys;
    let turn = ((k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)) * 0.6;
    let climb = (k.has('Space') ? 1 : 0) - (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC') ? 1 : 0);
    // W acelera um pouco; Shift é o turbo (velocidade máxima); S freia
    const turbo = k.has('ShiftLeft') || k.has('ShiftRight');
    const fwd = turbo ? 1 : k.has('KeyW') || k.has('ArrowUp') ? 0.4 : 0;
    const throttle = fwd - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.locked()) {
      const dz = (v: number) => (Math.abs(v) < 0.04 ? 0 : v - Math.sign(v) * 0.04);
      turn = clamp(turn + dz(this.aimSmooth.x) * 1.15, -1, 1);
      // mouse para cima levanta o nariz (sobe), para baixo mergulha
      climb = clamp(climb - dz(this.aimSmooth.y) * 1.15, -1, 1);
    }
    if (this.stick) {
      const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : v);
      turn = clamp(turn + dz(this.stick.x) * 1.2, -1, 1);
      // arrastar para cima sobe
      climb = clamp(climb - dz(this.stick.y) * 1.2, -1, 1);
    }
    return { turn, climb, throttle };
  }

  /**
   * Um quadro: posiciona a câmera no nariz do drone, desenha o OSD e devolve o manche quando for hora de mandar ao
   * servidor (~10 por segundo quando muda, e a cada 0,6 s para manter o controle vivo).
   */
  frame(dt: number, view: FpvDroneView | null, camera: THREE.PerspectiveCamera, targets: FpvTarget[], flightSeconds: number): FpvSteer | null {
    this.time += dt;
    // a mira do mouse volta devagar ao centro: mexer o mouse vira, parar endireita
    const back = Math.exp(-dt * 1.8);
    this.aim.x *= back;
    this.aim.y *= back;
    const f = 1 - Math.exp(-dt * 12);
    this.aimSmooth.x += (this.aim.x - this.aimSmooth.x) * f;
    this.aimSmooth.y += (this.aim.y - this.aimSmooth.y) * f;
    this.resize();
    if (Math.abs(camera.fov - FPV_VFOV) > 0.01) {
      camera.fov = FPV_VFOV;
      camera.updateProjectionMatrix();
    }
    const raw = this.input();
    const shown = view && !this.lostAt ? this.predict(dt, raw, view) : view;
    if (shown && !this.lostAt) this.placeCamera(shown, camera);
    this.draw(shown, camera, targets, flightSeconds);
    if (!view || this.lostAt) return null;
    const q = (v: number) => Math.round(v * 20) / 20;
    const s = { turn: q(raw.turn), climb: q(raw.climb), throttle: q(raw.throttle) };
    const changed = s.turn !== this.lastSent.turn || s.climb !== this.lastSent.climb || s.throttle !== this.lastSent.throttle;
    const since = this.time - this.sentAt;
    if ((changed && since >= 0.1) || since >= 0.6) {
      this.lastSent = s;
      this.sentAt = this.time;
      return s;
    }
    return null;
  }

  /**
   * Prevê o voo no cliente com as mesmas contas do servidor (manche suavizado, curva, subida, acelerador): a câmera
   * responde ao mouse e ao teclado na hora, sem esperar a volta da rede. A previsão é puxada com suavidade para a pose do
   * servidor (adiantada pelo atraso estimado), e um desvio grande faz ela pular para a do servidor. Quem decide onde o
   * drone está continua sendo o servidor.
   */
  private predict(dt: number, s: FpvSteer, v: FpvDroneView): FpvDroneView {
    let p = this.pred;
    if (!p) {
      p = this.pred = { x: v.pos.x, z: v.pos.z, alt: v.pos.y, heading: v.heading, speed: v.speed, turn: 0, climb: 0, vz: 0, bank: v.bank, pitch: v.pitch };
      this.hist = [];
      this.realAt = 0;
    }
    // tempo real desde o último quadro: o laço do jogo limita o passo a 0,1 s, e com o quadro lento (celular fraco) a
    // previsão ficaria para trás do servidor e daria pulos; aqui ela anda o tempo todo, em passos de até 50 ms
    const now = performance.now();
    const h = this.realAt ? clamp((now - this.realAt) / 1000, 0, 0.5) : Math.min(dt, 0.1);
    this.realAt = now;
    const n = Math.max(1, Math.ceil(h / 0.05));
    const want = s.throttle >= 0 ? DRONE.cruiseSpeed + (DRONE.boostSpeed - DRONE.cruiseSpeed) * s.throttle : DRONE.cruiseSpeed + (DRONE.cruiseSpeed - DRONE.slowSpeed) * s.throttle;
    for (let i = 0; i < n; i++) {
      const st = h / n;
      const k = Math.min(1, st * DRONE.stickResponse);
      p.turn += (s.turn - p.turn) * k;
      p.climb += (s.climb - p.climb) * k;
      p.speed += (want - p.speed) * Math.min(1, st * DRONE.throttleResponse);
      p.heading += p.turn * DRONE.turnRate * st;
      p.vz = p.climb * DRONE.climbRate * (p.climb < 0 ? DRONE.diveMul : 1);
      p.alt = clamp(p.alt + p.vz * st, 0.3, DRONE.maxAlt);
      p.x += Math.cos(p.heading) * p.speed * st;
      p.z += Math.sin(p.heading) * p.speed * st;
    }
    // trajeto previsto do último 1,5 s: a pose do servidor chega atrasada, então é comparada com o ponto do trajeto
    // onde a previsão estava naquela hora (o mais perto dela), e não com a pose de agora. Assim o atraso da rede não
    // puxa a câmera para trás; só o desvio de verdade é corrigido, aos poucos.
    this.hist.push({ x: p.x, z: p.z, alt: p.alt, heading: p.heading, t: now });
    while (this.hist.length > 2 && now - this.hist[0]!.t > 1500) this.hist.shift();
    let best = this.hist[this.hist.length - 1]!;
    let bestD = Infinity;
    for (const q of this.hist) {
      const d = (q.x - v.pos.x) ** 2 + (q.z - v.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    if (bestD > 25) {
      // desvio grande (pacote perdido, colisão de borda): vai direto para o servidor
      Object.assign(p, { x: v.pos.x, z: v.pos.z, alt: v.pos.y, heading: v.heading, speed: v.speed });
      this.hist = [];
    } else {
      const c = 1 - Math.exp(-h * 1.5);
      const ex = (v.pos.x - best.x) * c;
      const ez = (v.pos.z - best.z) * c;
      const ea = (v.pos.y - best.alt) * c;
      const eh = angDiff(v.heading, best.heading) * c * 0.6;
      p.x += ex;
      p.z += ez;
      p.alt = clamp(p.alt + ea, 0.3, DRONE.maxAlt);
      p.heading += eh;
      // o trajeto guardado anda junto com a correção (senão o mesmo erro seria corrigido de novo a cada quadro)
      for (const q of this.hist) {
        q.x += ex;
        q.z += ez;
        q.alt += ea;
        q.heading += eh;
      }
      p.speed += (v.speed - p.speed) * c * 0.3;
    }
    // atitude da câmera: inclina na curva e levanta/baixa o nariz, sempre suave
    const a = 1 - Math.exp(-h * 5);
    p.bank += (clamp(p.turn * DRONE.turnRate * 0.42, -0.5, 0.5) - p.bank) * a;
    p.pitch += (Math.atan2(p.vz, Math.max(1, p.speed)) * 0.8 - p.pitch) * a;
    this.shown.pos.set(p.x, p.alt, p.z);
    return { pos: this.shown.pos, heading: p.heading, pitch: p.pitch, bank: p.bank, speed: p.speed, alt: p.alt, battery: v.battery };
  }

  private placeCamera(v: FpvDroneView, camera: THREE.PerspectiveCamera): void {
    const fwd = new THREE.Vector3(Math.cos(v.heading) * Math.cos(v.pitch), Math.sin(v.pitch), Math.sin(v.heading) * Math.cos(v.pitch));
    // câmera no nariz, olhando um pouco para baixo (como a câmera inclinada de um drone de corrida)
    camera.position
      .copy(v.pos)
      .addScaledVector(fwd, 0.95)
      .add(new THREE.Vector3(0, -0.05, 0));
    const tilt = v.pitch - 0.2;
    const look = new THREE.Vector3(Math.cos(v.heading) * Math.cos(tilt), Math.sin(tilt), Math.sin(v.heading) * Math.cos(tilt));
    camera.up.set(0, 1, 0);
    camera.lookAt(camera.position.clone().add(look));
    camera.rotateZ(-v.bank * 0.7);
    camera.updateMatrixWorld();
  }

  private vignetteCache: HTMLCanvasElement | null = null;

  /** Vinheta pronta (desenhada uma vez por tamanho de tela; o degradê em tela cheia a cada quadro pesava no celular). */
  private vignette(W: number, H: number): HTMLCanvasElement {
    const v = this.vignetteCache;
    if (v && v.width === W && v.height === H) return v;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d')!;
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    this.vignetteCache = cv;
    return cv;
  }

  private resize(): void {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.round(this.host.clientWidth * dpr);
    const h = Math.round(this.host.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private draw(view: FpvDroneView | null, camera: THREE.PerspectiveCamera, targets: FpvTarget[], flightSeconds: number): void {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const u = Math.min(W, H) / 720;
    c.clearRect(0, 0, W, H);
    // sinal perdido: chiado na tela inteira e o aviso
    if (this.lostAt || !view) {
      c.fillStyle = '#111';
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 1400; i++) {
        const g = Math.floor(Math.random() * 255);
        c.fillStyle = `rgb(${g},${g},${g})`;
        c.fillRect(Math.random() * W, Math.random() * H, 3 * u, 2 * u);
      }
      this.text('SINAL PERDIDO', W / 2, H / 2, 40 * u, 'center');
      return;
    }
    const bar = H * 0.055;
    // vinheta e chiado analógico leve
    c.drawImage(this.vignette(W, H), 0, 0);
    const low = view.battery < 0.25;
    const noise = 90 + (low ? 200 : 0);
    for (let i = 0; i < noise; i++) {
      c.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.1})`;
      c.fillRect(Math.random() * W, Math.random() * H, 2 * u, 1 * u);
    }
    if (Math.random() < 0.04 + (low ? 0.1 : 0)) {
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(0, Math.random() * H, W, (2 + Math.random() * 6) * u);
    }
    // faixas pretas em cima e embaixo (a imagem dos óculos)
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, bar);
    c.fillRect(0, H - bar, W, bar);

    // horizonte artificial (inclina com a curva e sobe/desce com o nariz)
    const cx = W / 2;
    const cy = H / 2;
    c.save();
    c.translate(cx, cy + view.pitch * H * 0.6);
    c.rotate(view.bank * 0.7);
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 2 * u;
    c.beginPath();
    c.moveTo(-140 * u, 0);
    c.lineTo(-40 * u, 0);
    c.moveTo(40 * u, 0);
    c.lineTo(140 * u, 0);
    c.stroke();
    c.restore();
    // mira
    c.strokeStyle = '#fff';
    c.lineWidth = 2 * u;
    c.beginPath();
    c.arc(cx, cy, 13 * u, 0, Math.PI * 2);
    c.moveTo(cx - 26 * u, cy);
    c.lineTo(cx - 16 * u, cy);
    c.moveTo(cx + 16 * u, cy);
    c.lineTo(cx + 26 * u, cy);
    c.moveTo(cx, cy + 16 * u);
    c.lineTo(cx, cy + 26 * u);
    c.stroke();

    // alvos inimigos à vista: cantoneiras, nome e distância; o mais perto da mira fica travado
    const proj = new THREE.Vector3();
    let lock: { x: number; y: number; d: number; t: FpvTarget } | null = null;
    let nearestOff: { ang: number; d: number } | null = null;
    for (const t of targets) {
      const d = t.pos.distanceTo(view.pos);
      proj.copy(t.pos).project(camera);
      const sx = (proj.x * 0.5 + 0.5) * W;
      const sy = (-proj.y * 0.5 + 0.5) * H;
      const onScreen = proj.z < 1 && sx > 0 && sx < W && sy > bar && sy < H - bar;
      if (!onScreen) {
        if (!nearestOff || d < nearestOff.d) {
          const behind = proj.z >= 1 ? -1 : 1;
          nearestOff = { ang: Math.atan2((sy - cy) * behind, (sx - cx) * behind), d };
        }
        continue;
      }
      const size = clamp(900 / Math.max(4, d), 10, 46) * u;
      const col = t.kind === 'unit' ? '#ff4d3d' : '#ffb23d';
      this.brackets(sx, sy, size, col);
      this.text(`${t.label} ${Math.round(d * METERS)}m`, sx, sy - size - 8 * u, 13 * u, 'center', col);
      const off = Math.hypot(sx - cx, sy - cy);
      if (off < 90 * u && (!lock || off < Math.hypot(lock.x - cx, lock.y - cy))) lock = { x: sx, y: sy, d, t };
    }
    if (lock) {
      c.strokeStyle = 'rgba(255,77,61,0.9)';
      c.lineWidth = 1.5 * u;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(lock.x, lock.y);
      c.stroke();
      if (Math.floor(this.time * 4) % 2 === 0) this.text('ALVO TRAVADO', cx, cy + 58 * u, 18 * u, 'center', '#ff4d3d');
    } else if (nearestOff) {
      // seta na borda para o alvo mais perto fora da tela
      const r = Math.min(W, H) * 0.36;
      const ax = cx + Math.cos(nearestOff.ang) * r;
      const ay = cy + Math.sin(nearestOff.ang) * r;
      c.save();
      c.translate(ax, ay);
      c.rotate(nearestOff.ang);
      c.fillStyle = '#ffb23d';
      c.beginPath();
      c.moveTo(14 * u, 0);
      c.lineTo(-8 * u, -9 * u);
      c.lineTo(-8 * u, 9 * u);
      c.closePath();
      c.fill();
      c.restore();
      this.text(`${Math.round(nearestOff.d * METERS)}m`, ax, ay + 22 * u, 13 * u, 'center', '#ffb23d');
    }

    // bússola (fita no topo): 0 = norte (−y do mapa)
    const bearing = ((((view.heading * 180) / Math.PI + 90) % 360) + 360) % 360;
    const top = bar + 26 * u;
    const span = 320 * u;
    c.save();
    c.beginPath();
    c.rect(cx - span / 2, top - 22 * u, span, 40 * u);
    c.clip();
    for (let a = -90; a <= 90; a += 5) {
      const deg = Math.round(bearing / 5) * 5 + a;
      const x = cx + ((deg - bearing) / 90) * (span / 2);
      const n = ((deg % 360) + 360) % 360;
      const major = n % 45 === 0;
      c.fillStyle = '#fff';
      c.fillRect(x - u, top - (major ? 10 : 5) * u, 2 * u, (major ? 10 : 5) * u);
      if (major) this.text(['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][n / 45]!, x, top + 14 * u, 15 * u, 'center');
    }
    c.restore();
    this.text(`${Math.round(bearing)}°`, cx, bar + 6 * u, 13 * u, 'center');

    // cantos: modo, velocidade, altitude, bateria, sinal e tempo
    const pad = 22 * u;
    const big = 22 * u;
    this.text('AIR', pad, bar + 34 * u, big, 'left');
    this.text(this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 'MAX' : 'ACRO', W - pad, bar + 34 * u, big, 'right');
    const kmh = Math.round(view.speed * METERS * 3.6);
    this.text(`${kmh} km/h`, pad, cy - 8 * u, 26 * u, 'left');
    this.text('VEL', pad, cy + 18 * u, 13 * u, 'left');
    this.text(`${Math.round(view.alt * METERS)} m`, W - pad, cy - 8 * u, 26 * u, 'right');
    this.text('ALT', W - pad, cy + 18 * u, 13 * u, 'right');
    const cell = 3.3 + 0.9 * clamp(view.battery, 0, 1);
    const sig = clamp(Math.round(60 - flightSeconds * 0.25 + Math.sin(this.time * 3) * 2), 12, 60);
    const bottom = H - bar - 18 * u;
    this.text(`▮▮▮ ${sig}`, pad, bottom - 66 * u, big, 'left');
    this.text(`▯ ${cell.toFixed(2)}v`, pad, bottom - 33 * u, big, 'left', low ? '#ff4d3d' : '#fff');
    this.text(`▯ ${(cell * 6).toFixed(1)}v`, pad, bottom, big, 'left', low ? '#ff4d3d' : '#fff');
    const mm = Math.floor(flightSeconds / 60);
    const ss = Math.floor(flightSeconds % 60);
    this.text(`${Math.round(view.battery * 100)}%`, W - pad, bottom - 33 * u, big, 'right', low ? '#ff4d3d' : '#fff');
    this.text(`⏱ ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, W - pad, bottom, big, 'right');
    if (low && Math.floor(this.time * 3) % 2 === 0) this.text('BATERIA BAIXA', cx, cy - 70 * u, 20 * u, 'center', '#ff4d3d');
    // dica dos controles nos primeiros segundos
    if (this.time - this.startedAt < 6)
      this.text('MOUSE direção · W acelera · SHIFT turbo · S freia · ESPAÇO sobe · CTRL/C desce · CLIQUE explode · ESC sai', cx, H - bar - 46 * u, 14 * u, 'center');
    // alcance da bateria em segundos (referência para o piloto)
    this.text(`${Math.round(view.battery * DRONE.batterySeconds)}s`, W - pad, bottom - 66 * u, 15 * u, 'right');
  }

  private brackets(x: number, y: number, s: number, col: string): void {
    const c = this.ctx;
    const k = s * 0.45;
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.beginPath();
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      c.moveTo(x + dx * s, y + dy * s - dy * k);
      c.lineTo(x + dx * s, y + dy * s);
      c.lineTo(x + dx * s - dx * k, y + dy * s);
    }
    c.stroke();
  }

  /** Texto do OSD: branco com contorno preto, fonte monoespaçada. */
  private text(t: string, x: number, y: number, size: number, align: CanvasTextAlign, color = '#fff'): void {
    const c = this.ctx;
    c.font = `bold ${Math.round(size)}px "Courier New", ui-monospace, monospace`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.lineWidth = Math.max(2, size / 6);
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.strokeText(t, x, y);
    c.fillStyle = color;
    c.fillText(t, x, y);
  }

  dispose(): void {
    document.removeEventListener('mousemove', this.onMouse);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (this.locked()) document.exitPointerLock();
    this.canvas.remove();
  }
}
