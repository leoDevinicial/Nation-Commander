import * as THREE from 'three';
import { SPACE } from '../../../shared/sim/config.ts';
import { PartBuilder } from './models/kit.ts';
import { accentMaterial, bodyMaterial } from './materials.ts';
import { SPACE_PAD, SPACE_TOWER } from './models/projects.ts';
import { glowTexture, volumetricSmokeTexture } from './textures.ts';

/** Ignição dos motores antes da liberação dos grampos (s, relativo à decolagem). */
export const LAUNCH_IGNITION = -2.2;
/** Braço de acesso da tripulação recolhe nesta janela da contagem (s). */
const CREW_ARM = [-7.5, -5.5] as const;
/** A água da supressão acústica começa a jorrar (s). */
const DELUGE = -3.6;

type Phase = 'idle' | 'countdown' | 'ascent' | 'gone';

interface Puff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  age: number;
  life: number;
  vel: THREE.Vector3;
  drag: number;
  rise: number;
  size0: number;
  size1: number;
  peak: number;
  /** Cor (fumaça ou vapor) e o calor inicial (laranja da chama que some nos primeiros instantes). */
  tone: THREE.Color;
  heat: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const WARM = new THREE.Color('#ffb066');

/**
 * Lançamento do Programa Espacial: o foguete de dois estágios com dois propulsores laterais, os braços da torre e todo
 * o espetáculo da contagem à subida, num relógio próprio sincronizado com a simulação (`setState`). `τ` é o tempo em
 * segundos relativo à decolagem (negativo na contagem):
 * - contagem: o oxigênio líquido solta vapor branco pelos respiros, que escorre pelo corpo; o braço da tripulação
 *   recolhe (−7,5 a −5,5 s); a água da supressão acústica jorra em volta da mesa (−3,6 s);
 * - ignição (−2,2 s): os motores acendem ainda presos; a luz estoura, o jato bate no defletor e uma nuvem enorme de
 *   fumaça e vapor sai pelo fosso de chamas e rola pela plataforma; o foguete treme;
 * - decolagem (0 s): os umbilicais se soltam e o foguete sobe devagar, acelerando (empuxo maior que o peso, massa
 *   diminuindo); a chama se alonga e abre com a altitude e o rastro de fumaça fica no céu;
 * - subida: a partir de ~4 s o foguete começa a inclinar (curva de gravidade) e some no alto.
 * Depois do satélite em órbita (`gone`) a plataforma fica vazia e a fumaça se desfaz aos poucos.
 */
export class SpaceLaunch {
  readonly group = new THREE.Group();
  private readonly rocket = new THREE.Group();
  private readonly base: THREE.Vector3;
  private crewArm!: THREE.Group;
  private readonly umbilicals: THREE.Group[] = [];
  private readonly flames: { group: THREE.Group; core: THREE.Mesh; outer: THREE.Mesh; diamonds: THREE.Sprite[]; scale: number }[] = [];
  /**
   * Luz da chama: só a posição (no referencial do grupo) e a força. Quem desenha a cena acende uma luz da reserva do
   * `Effects` ali (uma luz própria faria todos os materiais recompilarem quando o Programa Espacial aparece).
   */
  readonly flame = { pos: new THREE.Vector3(), power: 0 };
  /** Brilho grande na saída dos motores (a chama lida de longe). */
  private readonly glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd59a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  private readonly puffs: Puff[] = [];
  private next = 0;
  private readonly smokeMap = volumetricSmokeTexture();
  private phase: Phase = 'idle';
  private tau = -SPACE.countdownSeconds;
  private time = 0;
  private emitAcc = { vent: 0, deluge: 0, ground: 0, trail: 0 };
  private burn = 0;

  constructor(
    owner: number,
    /** Partículas disponíveis (menos no celular). */
    budget = 320,
  ) {
    this.base = new THREE.Vector3(SPACE_PAD[0], SPACE_PAD[1] + 0.3, SPACE_PAD[2]);
    this.buildRocket(owner);
    this.rocket.position.copy(this.base);
    this.group.add(this.rocket);
    this.buildArms();
    this.glow.visible = false;
    this.group.add(this.glow);
    for (let i = 0; i < budget; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.smokeMap, color: '#e9e6df', transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, mat, age: 1, life: 1, vel: new THREE.Vector3(), drag: 1, rise: 0, size0: 1, size1: 1, peak: 0, tone: new THREE.Color(), heat: 0 });
    }
  }

  /** Foguete moderno: primeiro estágio com pernas recolhidas e aletas em grade, interestágio escuro, segundo estágio, coifa ogival e dois propulsores laterais. Origem na base, eixo +y. */
  private buildRocket(owner: number): void {
    const b = new PartBuilder();
    const a = new PartBuilder();
    const WHITE = '#eef0ee';
    const BLACK = '#232527';
    const GREY = '#c9ccce';
    // primeiro estágio
    b.cyl(0.3, 0.3, 4.2, WHITE, [0, 2.1, 0], undefined, 16);
    b.cyl(0.305, 0.305, 0.35, BLACK, [0, 0.175, 0], undefined, 16);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      // pernas de pouso recolhidas e aletas em grade no topo do estágio
      b.box(0.08, 1.3, 0.05, BLACK, [Math.cos(ang) * 0.31, 0.95, Math.sin(ang) * 0.31], [0, -ang, 0]);
      b.box(0.16, 0.2, 0.03, '#55595d', [Math.cos(ang) * 0.36, 4.05, Math.sin(ang) * 0.36], [0, -ang + Math.PI / 2, 0]);
    }
    b.box(0.03, 3.5, 0.06, GREY, [0, 2.2, 0.31]);
    // interestágio, segundo estágio e coifa
    b.cyl(0.3, 0.3, 0.45, BLACK, [0, 4.425, 0], undefined, 16);
    b.cyl(0.3, 0.3, 1.0, WHITE, [0, 5.15, 0], undefined, 16);
    b.cyl(0.36, 0.3, 0.12, GREY, [0, 5.71, 0], undefined, 16);
    b.cyl(0.36, 0.36, 0.55, WHITE, [0, 6.045, 0], undefined, 16);
    b.cyl(0.27, 0.36, 0.38, WHITE, [0, 6.51, 0], undefined, 16);
    b.cyl(0.1, 0.27, 0.32, WHITE, [0, 6.86, 0], undefined, 16);
    b.cyl(0.0, 0.1, 0.14, WHITE, [0, 7.09, 0], undefined, 16);
    b.box(0.012, 1.3, 0.72, '#b3b6b8', [0, 6.4, 0]);
    // motores: saia e sino do núcleo
    b.cyl(0.2, 0.28, 0.18, '#3a3d40', [0, -0.09, 0], undefined, 14);
    // propulsores laterais em ±z, com ogiva, faixa preta e travas
    for (const s of [1, -1]) {
      const z = s * 0.56;
      b.cyl(0.23, 0.23, 3.5, WHITE, [0, 1.75, z], undefined, 14);
      b.cyl(0.235, 0.235, 0.3, BLACK, [0, 0.15, z], undefined, 14);
      b.cyl(0.0, 0.23, 0.5, WHITE, [0, 3.75, z], undefined, 14);
      b.cyl(0.16, 0.22, 0.16, '#3a3d40', [0, -0.08, z], undefined, 12);
      for (const y of [0.6, 3.1]) b.box(0.08, 0.06, 0.12, GREY, [0, y, s * 0.28]);
    }
    // cor da nação: faixa na coifa e painel no primeiro estágio
    a.cyl(0.365, 0.365, 0.14, '#ffffff', [0, 5.86, 0], undefined, 16);
    a.box(0.32, 0.5, 0.02, '#ffffff', [0.0, 3.2, 0.302]);
    a.box(0.32, 0.5, 0.02, '#ffffff', [0.0, 3.2, -0.302]);
    const body = new THREE.Mesh(b.build(), bodyMaterial());
    body.castShadow = true;
    const band = new THREE.Mesh(a.build(), accentMaterial(owner));
    this.rocket.add(body, band);
    // chamas: núcleo e propulsores, com o miolo branco, o envelope laranja e os discos de choque (diamantes)
    for (const [z, scale] of [
      [0, 1],
      [0.56, 0.8],
      [-0.56, 0.8],
    ] as const) {
      const group = new THREE.Group();
      group.position.set(0, -0.18, z);
      const core = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 1, 12, 1, true).rotateX(Math.PI).translate(0, -0.5, 0),
        new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      const outer = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 1, 12, 1, true).rotateX(Math.PI).translate(0, -0.5, 0),
        new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      const diamonds: THREE.Sprite[] = [];
      for (let k = 0; k < 3; k++) {
        const d = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff6dc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        );
        group.add(d);
        diamonds.push(d);
      }
      group.add(core, outer);
      group.visible = false;
      this.rocket.add(group);
      this.flames.push({ group, core, outer, diamonds, scale });
    }
  }

  /** Braço de acesso da tripulação (com a sala branca na ponta) e dois umbilicais, articulados na face da torre. */
  private buildArms(): void {
    const mat = bodyMaterial();
    const [tx, , tz] = SPACE_TOWER;
    const face = tx + 0.36;
    const reach = this.base.x - 0.3 - face;
    const arm = (len: number, y: number, room: boolean): THREE.Group => {
      const b = new PartBuilder();
      b.box(len, 0.1, 0.2, '#8b8f93', [len / 2, 0, 0]);
      b.box(len, 0.03, 0.03, '#b5482a', [len / 2, 0.08, 0.1]);
      b.box(len, 0.03, 0.03, '#b5482a', [len / 2, 0.08, -0.1]);
      if (room) b.box(0.26, 0.3, 0.3, '#e4e6e4', [len - 0.1, 0.1, 0]);
      else b.cyl(0.03, 0.03, len, '#2b2d30', [len / 2, -0.07, 0.05], [0, 0, Math.PI / 2], 6);
      const g = new THREE.Group();
      g.position.set(face, y, tz);
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = true;
      g.add(m);
      this.group.add(g);
      return g;
    };
    this.crewArm = arm(reach, this.base.y + 5.25, true);
    for (const y of [2.3, 4.35]) this.umbilicals.push(arm(reach + 0.02, this.base.y + y, false));
  }

  /** Estado da simulação: fase e progresso (0..1) da fase. Corrige o relógio local se ele se afastar. */
  setState(phase: Phase, progress = 0): void {
    const server = phase === 'countdown' ? -SPACE.countdownSeconds * (1 - progress) : phase === 'ascent' ? SPACE.ascentSeconds * progress : null;
    if (phase !== this.phase) {
      this.phase = phase;
      if (server !== null) this.tau = server;
      if (phase === 'idle') this.tau = -SPACE.countdownSeconds;
    } else if (server !== null && Math.abs(server - this.tau) > 0.35) this.tau = server;
  }

  /** Tremor de câmera pedido pelo lançamento (0..1). */
  get rumble(): number {
    if (this.phase !== 'countdown' && this.phase !== 'ascent') return 0;
    return this.burn * (1 - smooth(3, 11, this.tau));
  }

  /** Altura do foguete acima da mesa na decolagem: devagar no começo, acelerando (massa caindo, empuxo crescendo). */
  private altitude(t: number): number {
    return t <= 0 ? 0 : 0.32 * t * t + 0.07 * t * t * t;
  }

  update(dt: number): void {
    this.time += dt;
    const live = this.phase === 'countdown' || this.phase === 'ascent';
    if (live) this.tau += dt;
    const t = this.tau;
    // queima: acende na ignição em ~0,5 s e fica; some quando o foguete já foi
    this.burn = live && t >= LAUNCH_IGNITION ? Math.min(1, (t - LAUNCH_IGNITION) / 0.5) : 0;
    this.rocket.visible = this.phase !== 'gone';

    // --- foguete: tremor preso nos grampos, decolagem e curva de gravidade
    const h = this.phase === 'ascent' ? this.altitude(t) : 0;
    const turn = this.phase === 'ascent' ? smooth(4, 9, t) : 0;
    const shake = this.burn * 0.014 * (1 - smooth(0, 2.5, t));
    this.rocket.position.set(this.base.x + 0.18 * turn * turn * h * 0.2 + (Math.random() - 0.5) * shake, this.base.y + h, this.base.z + (Math.random() - 0.5) * shake);
    this.rocket.rotation.z = -0.32 * turn;

    // --- braços: tripulação recolhe na contagem; umbilicais se soltam na decolagem; voltam devagar depois
    const crew = this.phase === 'idle' ? 0 : this.phase === 'gone' ? 1 : smooth(CREW_ARM[0], CREW_ARM[1], t);
    this.crewArm.rotation.y = -1.45 * crew;
    const umb = this.phase === 'ascent' ? smooth(-0.1, 0.5, t) : this.phase === 'gone' ? 1 : 0;
    this.umbilicals.forEach((u, i) => (u.rotation.y = (i ? 1.2 : -1.2) * umb));

    // --- chamas: acendem na ignição, alongam e abrem com a altitude (o ar rarefeito deixa o jato expandir)
    for (const f of this.flames) {
      f.group.visible = this.burn > 0.01 && this.phase !== 'gone';
      if (!f.group.visible) continue;
      const len = (1.3 + Math.min(3.2, Math.max(0, t) * 0.35)) * f.scale * (0.92 + Math.random() * 0.16) * this.burn;
      const width = (1 + Math.min(1.6, Math.max(0, t) * 0.14)) * f.scale;
      f.core.scale.set(width, len * 0.62, width);
      f.outer.scale.set(width * (1.05 + Math.random() * 0.1), len, width * (1.05 + Math.random() * 0.1));
      (f.outer.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.random() * 0.1;
      f.diamonds.forEach((d, k) => {
        d.position.set(0, -len * (0.16 + k * 0.17), 0);
        d.scale.setScalar(0.26 * f.scale * (1 - k * 0.2) * (0.9 + Math.random() * 0.2));
        d.material.opacity = (0.85 - k * 0.22) * (1 - smooth(5, 9, t));
      });
    }
    // luz da chama: forte na ignição e na decolagem, sobe junto com o foguete
    this.flame.pos.set(this.rocket.position.x, this.rocket.position.y - 0.6, this.rocket.position.z);
    this.flame.power = this.rocket.visible ? this.burn * (1 - smooth(5, 10, t)) : 0;
    this.glow.visible = this.burn > 0.01 && this.phase !== 'gone';
    if (this.glow.visible) {
      tmpB.set(0, -0.5, 0).applyEuler(this.rocket.rotation);
      this.glow.position.copy(this.rocket.position).add(tmpB);
      this.glow.scale.setScalar((2.6 + Math.random() * 0.5) * this.burn * (1 + Math.min(1, Math.max(0, t) * 0.1)));
    }

    // --- partículas
    if (live) {
      if (t < LAUNCH_IGNITION + 0.4) this.emitVent(dt);
      if (t > DELUGE && t < 6) this.emitDeluge(dt, t);
      if (this.burn > 0) this.emitGround(dt, t, h);
      if (this.phase === 'ascent') this.emitTrail(dt, t);
    }
    this.updatePuffs(dt);
  }

  /** Respiros de oxigênio líquido: vapor branco que sai de lado e escorre pelo corpo. */
  private emitVent(dt: number): void {
    this.emitAcc.vent += dt;
    while (this.emitAcc.vent > 0.07) {
      this.emitAcc.vent -= 0.07;
      const side = Math.random() < 0.5 ? 1 : -1;
      const y = Math.random() < 0.55 ? 4.45 : 5.55;
      tmpA.set(this.base.x + side * 0.3, this.base.y + y + (Math.random() - 0.5) * 0.1, this.base.z + (Math.random() - 0.5) * 0.4);
      this.spawn(tmpA, {
        vx: side * (0.35 + Math.random() * 0.3),
        vy: -0.25 - Math.random() * 0.2,
        vz: (Math.random() - 0.5) * 0.25,
        life: 2.2 + Math.random(),
        size0: 0.15,
        size1: 0.9 + Math.random() * 0.4,
        peak: 0.6,
        color: '#f4f4f2',
        drag: 1.4,
        rise: -0.15,
      });
    }
  }

  /** Supressão acústica: jatos de água em volta da mesa, que viram vapor quando a chama chega. */
  private emitDeluge(dt: number, t: number): void {
    this.emitAcc.deluge += dt;
    while (this.emitAcc.deluge > 0.05) {
      this.emitAcc.deluge -= 0.05;
      const ang = Math.random() * Math.PI * 2;
      const hot = t > LAUNCH_IGNITION;
      tmpA.set(this.base.x + Math.cos(ang) * 0.6, SPACE_PAD[1] + 0.1, this.base.z + Math.sin(ang) * 0.6);
      this.spawn(tmpA, {
        vx: Math.cos(ang) * (1.2 + Math.random()),
        vy: hot ? 0.8 + Math.random() : 0.3,
        vz: Math.sin(ang) * (1.2 + Math.random()),
        life: hot ? 3 : 1.4,
        size0: 0.25,
        size1: hot ? 2.2 : 0.8,
        peak: 0.55,
        color: '#f2f3f4',
        drag: 1.8,
        rise: hot ? 0.4 : -0.6,
      });
    }
  }

  /**
   * Nuvem da plataforma: o jato bate no defletor e sai pelo fosso de chamas (+x) numa coluna que rola, e espalha
   * fumaça e vapor em volta da mesa. Forte da ignição até o foguete se afastar; os primeiros puffs saem quentes.
   */
  private emitGround(dt: number, t: number, h: number): void {
    const strength = this.burn * (1 - smooth(4, 12, h));
    if (strength <= 0.02) return;
    this.emitAcc.ground += dt * strength;
    while (this.emitAcc.ground > 0.028) {
      this.emitAcc.ground -= 0.028;
      const r = Math.random();
      if (r < 0.5) {
        // pelo fosso de chamas: a coluna que sai deitada e rola para cima
        tmpA.set(SPACE_PAD[0] + 2.4 + Math.random() * 0.6, 0.5, SPACE_PAD[2] + (Math.random() - 0.5) * 0.7);
        this.spawn(tmpA, {
          vx: 3 + Math.random() * 3,
          vy: 0.6 + Math.random() * 1.2,
          vz: (Math.random() - 0.5) * 2.6,
          life: 9 + Math.random() * 4,
          size0: 1.2,
          size1: 5.5 + Math.random() * 3,
          peak: 0.9,
          color: '#dcd8cf',
          drag: 0.4,
          rise: 0.4,
          heat: t < 1.5 ? 0.9 : 0.3,
        });
      } else if (r < 0.82) {
        // em volta da mesa, rolando pela plataforma e para fora dela
        const ang = Math.random() * Math.PI * 2;
        tmpA.set(this.base.x + Math.cos(ang) * 0.8, SPACE_PAD[1] + 0.25, this.base.z + Math.sin(ang) * 0.8);
        this.spawn(tmpA, {
          vx: Math.cos(ang) * (2 + Math.random() * 2.2),
          vy: 0.4 + Math.random() * 0.7,
          vz: Math.sin(ang) * (2 + Math.random() * 2.2),
          life: 8 + Math.random() * 3,
          size0: 1,
          size1: 4.4 + Math.random() * 2.2,
          peak: 0.8,
          color: '#e4e1d9',
          drag: 0.6,
          rise: 0.3,
          heat: t < 1 ? 0.8 : 0.2,
        });
      } else {
        // coluna que sobe em volta do foguete (vapor da água e gases do jato)
        const ang = Math.random() * Math.PI * 2;
        tmpA.set(this.base.x + Math.cos(ang) * 0.6, SPACE_PAD[1] + 0.5, this.base.z + Math.sin(ang) * 0.6);
        this.spawn(tmpA, {
          vx: Math.cos(ang) * 0.6,
          vy: 1.6 + Math.random() * 1.6,
          vz: Math.sin(ang) * 0.6,
          life: 7 + Math.random() * 3,
          size0: 1,
          size1: 3.6 + Math.random() * 1.8,
          peak: 0.7,
          color: '#eeece6',
          drag: 0.5,
          rise: 0.2,
          heat: 0.5,
        });
      }
    }
  }

  /** Rastro de fumaça da subida: sai da tubeira, abre com o tempo e fica no céu, levado devagar pelo vento. */
  private emitTrail(dt: number, t: number): void {
    if (t < 0.2) return;
    this.emitAcc.trail += dt;
    const every = 0.045;
    while (this.emitAcc.trail > every) {
      this.emitAcc.trail -= every;
      // tubeira no mundo do grupo: base do foguete, girada com a inclinação
      tmpB.set(0, -0.9 - Math.min(2.5, t * 0.25), 0).applyEuler(this.rocket.rotation);
      tmpA.copy(this.rocket.position).add(tmpB);
      const grow = Math.min(1, t / 8);
      this.spawn(tmpA, {
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.6 - Math.random() * 0.4,
        vz: 0.25 + (Math.random() - 0.5) * 0.3,
        life: 9 + Math.random() * 4,
        size0: 0.6 + grow * 0.6,
        size1: 2.6 + grow * 3,
        peak: 0.7,
        color: '#e9e6df',
        drag: 0.6,
        rise: 0.05,
        heat: 0.5,
      });
    }
  }

  private spawn(
    at: THREE.Vector3,
    o: { vx: number; vy: number; vz: number; life: number; size0: number; size1: number; peak: number; color: string; drag: number; rise: number; heat?: number },
  ): void {
    if (!this.puffs.length) return;
    const p = this.puffs[this.next]!;
    this.next = (this.next + 1) % this.puffs.length;
    p.sprite.position.copy(at);
    p.sprite.visible = true;
    p.mat.rotation = Math.random() * Math.PI * 2;
    p.age = 0;
    p.life = o.life;
    p.vel.set(o.vx, o.vy, o.vz);
    p.drag = o.drag;
    p.rise = o.rise;
    p.size0 = o.size0;
    p.size1 = o.size1;
    p.peak = o.peak;
    p.tone.set(o.color);
    p.heat = o.heat ?? 0;
  }

  private updatePuffs(dt: number): void {
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - dt * p.drag));
      p.vel.y += p.rise * dt;
      // não atravessa o chão
      if (p.sprite.position.y < 0.3) {
        p.sprite.position.y = 0.3;
        p.vel.y = Math.max(0, p.vel.y);
      }
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.sqrt(k));
      const warm = p.heat * Math.max(0, 1 - p.age / 0.8);
      p.mat.color.copy(p.tone).lerp(WARM, warm);
      p.mat.opacity = Math.min(1, k * 12) * Math.pow(1 - k, 1.4) * p.peak;
      p.mat.rotation += dt * 0.15;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    // só as malhas próprias (a geometria dos sprites é compartilhada pelo three)
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const p of this.puffs) p.mat.dispose();
    for (const f of this.flames) {
      (f.core.material as THREE.Material).dispose();
      (f.outer.material as THREE.Material).dispose();
      for (const d of f.diamonds) d.material.dispose();
    }
    this.glow.material.dispose();
  }
}

function smooth(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
