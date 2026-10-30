import * as THREE from 'three';
import type { Effects } from './Effects.ts';
import { glowTexture, volumetricSmokeTexture } from './textures.ts';

/** Tipo de disparo visível (ver `UnitModel.shot`). */
export type ShotKind = 'apfsds' | 'howitzer' | 'flak' | 'autocannon' | 'gatling';

interface Round {
  kind: ShotKind;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Instante de saída (relógio da camada) e duração do voo. */
  start: number;
  dur: number;
  apex: number;
  core: THREE.Sprite;
  streak: THREE.Mesh;
  shell: THREE.Mesh | null;
  smokeAcc: number;
  fired: boolean;
  /** Boca do cano no instante do disparo (as rajadas pedem a posição de novo a cada tiro). */
  muzzle: (pos: THREE.Vector3, dir: THREE.Vector3) => void;
}

interface Puff {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vel: THREE.Vector3;
  size0: number;
  size1: number;
  peak: number;
  tone: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

const STYLE: Record<ShotKind, { color: string; core: number; streak: number; width: number; speed: number }> = {
  // projétil flecha do canhão de tanque: muito rápido, rastro branco-amarelado do traçante
  apfsds: { color: '#fff1c4', core: 0.38, streak: 2.6, width: 0.025, speed: 75 },
  // granada do obus: visível (escura) em arco, traçante fraco e fumaça fina
  howitzer: { color: '#ffb066', core: 0.22, streak: 0.5, width: 0.02, speed: 0 },
  // antiaérea: traçantes laranja em rajada
  flak: { color: '#ffb24a', core: 0.26, streak: 1.4, width: 0.016, speed: 55 },
  // canhão automático do blindado: traçantes curtos amarelos
  autocannon: { color: '#ffd76a', core: 0.2, streak: 1, width: 0.014, speed: 60 },
  // Gatling do CIWS: fio contínuo de traçantes finos e muito rápidos
  gatling: { color: '#ffe39a', core: 0.13, streak: 1.3, width: 0.01, speed: 95 },
};

/**
 * Disparos visíveis dos veículos: o projétil sai da boca do cano (clarão, onda de pressão e
 * fumaça na boca) e voa até o alvo. Tanque: flecha muito rápida com traçante. Artilharia: granada
 * em arco que sobe e mergulha, com fumaça fina, e explode ao cair. Antiaérea e blindado: rajadas
 * de traçantes, alternando os canos. O dano é da simulação; aqui é só o que se vê.
 */
export class Projectiles {
  readonly group = new THREE.Group();
  private readonly rounds: Round[] = [];
  private readonly streakGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0);
  private readonly shellGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.22, 8).rotateZ(-Math.PI / 2);
  private readonly shellMat = new THREE.MeshStandardMaterial({ color: '#3d3b34', roughness: 0.5, metalness: 0.5 });
  private readonly puffs: Puff[] = [];
  private puffNext = 0;
  private time = 0;

  constructor(
    private readonly effects: Effects,
    private readonly maxRounds = 80,
    smokeBudget = 120,
  ) {
    const smoke = volumetricSmokeTexture();
    for (let i = 0; i < smokeBudget; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: '#cfccc4', transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, age: 1, life: 1, vel: new THREE.Vector3(), size0: 1, size1: 1, peak: 0, tone: 1 });
    }
  }

  /**
   * Um disparo de `kind` contra `target`. `muzzle` dá a boca do cano e a direção na hora de cada
   * tiro (e faz o cano recuar). Rajadas saem com um pequeno intervalo entre os tiros.
   */
  fire(kind: ShotKind, target: { x: number; y: number; z: number }, muzzle: (pos: THREE.Vector3, dir: THREE.Vector3) => void): void {
    const burst = kind === 'flak' ? 2 : kind === 'autocannon' ? 3 : kind === 'gatling' ? 9 : 1;
    const gap = kind === 'flak' ? 0.09 : kind === 'gatling' ? 0.04 : 0.11;
    for (let i = 0; i < burst; i++) {
      if (this.rounds.length >= this.maxRounds) return;
      const st = STYLE[kind];
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: st.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      core.scale.setScalar(st.core);
      core.visible = false;
      const streak = new THREE.Mesh(this.streakGeo, new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      streak.visible = false;
      const shell = kind === 'howitzer' ? new THREE.Mesh(this.shellGeo, this.shellMat) : null;
      if (shell) shell.visible = false;
      this.group.add(core, streak);
      if (shell) this.group.add(shell);
      // espalhamento pequeno da rajada no alvo
      const spread = kind === 'flak' || kind === 'autocannon' ? 0.35 : kind === 'gatling' ? 0.5 : 0;
      const to = new THREE.Vector3(target.x + (Math.random() - 0.5) * spread, target.y + (Math.random() - 0.5) * spread * 0.5, target.z + (Math.random() - 0.5) * spread);
      this.rounds.push({ kind, from: new THREE.Vector3(), to, start: this.time + i * gap, dur: 0, apex: 0, core, streak, shell, smokeAcc: 0, fired: false, muzzle });
    }
  }

  private emit(at: THREE.Vector3, o: { life: number; size0: number; size1: number; peak: number; tone: number; vx?: number; vy?: number; vz?: number }): void {
    if (!this.puffs.length) return;
    const p = this.puffs[this.puffNext]!;
    this.puffNext = (this.puffNext + 1) % this.puffs.length;
    p.sprite.position.copy(at);
    p.sprite.visible = true;
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
    p.age = 0;
    p.life = o.life;
    p.vel.set(o.vx ?? 0, o.vy ?? 0, o.vz ?? 0);
    p.size0 = o.size0;
    p.size1 = o.size1;
    p.peak = o.peak;
    p.tone = o.tone;
  }

  /** Saída do tiro: posição real da boca, clarão, pressão e fumaça conforme a arma. */
  private launch(r: Round): void {
    r.muzzle(tmpA, tmpDir);
    r.from.copy(tmpA);
    const dist = r.from.distanceTo(r.to);
    if (r.kind === 'howitzer') {
      r.dur = 0.45 + dist / 20;
      r.apex = Math.max(1.5, dist * 0.32);
    } else r.dur = Math.max(0.06, dist / STYLE[r.kind].speed);
    r.fired = true;
    const heavy = r.kind === 'apfsds' || r.kind === 'howitzer';
    // clarão na boca (estrela de fogo) e luz no entorno
    this.effects.muzzleFlash(tmpA, tmpDir, heavy ? 0.75 : 0.28);
    if (heavy) {
      this.effects.light(tmpA, '#ffcf8a', r.kind === 'howitzer' ? 70 : 45, 10, 0.14);
      // fumaça da boca: anel que se abre para a frente e para os lados, e poeira levantada no chão
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        this.emit(tmpB.copy(tmpA).addScaledVector(tmpDir, 0.3), {
          life: 1.6 + Math.random() * 0.6,
          size0: 0.35,
          size1: 1.6,
          peak: 0.55,
          tone: 0.92,
          vx: tmpDir.x * 2.2 + Math.cos(a) * 0.9,
          vy: tmpDir.y * 2.2 + 0.25,
          vz: tmpDir.z * 2.2 + Math.sin(a) * 0.9,
        });
      }
      this.emit(tmpB.set(tmpA.x, 0.2, tmpA.z), { life: 1.8, size0: 0.8, size1: 2.6, peak: 0.35, tone: 0.8, vy: 0.2 });
    } else {
      this.emit(tmpB.copy(tmpA).addScaledVector(tmpDir, 0.12), { life: 0.7, size0: 0.12, size1: 0.5, peak: 0.4, tone: 0.95, vx: tmpDir.x * 0.8, vy: 0.3, vz: tmpDir.z * 0.8 });
    }
  }

  private land(r: Round): void {
    if (r.kind === 'howitzer') {
      this.effects.explosion(new THREE.Vector3(r.to.x, 0, r.to.z), false);
      this.emit(tmpB.set(r.to.x, 0.4, r.to.z), { life: 3, size0: 0.9, size1: 3, peak: 0.55, tone: 0.55, vy: 0.5 });
    } else if (r.kind === 'apfsds') {
      // impacto da flecha: clarão curto e faíscas no alvo
      this.effects.muzzleFlash(r.to, tmpDir.subVectors(r.from, r.to).normalize(), 0.6);
      this.effects.light(r.to, '#ffb36b', 30, 7, 0.12);
    } else this.effects.muzzleFlash(r.to, tmpDir.subVectors(r.from, r.to).normalize(), 0.22);
  }

  private point(r: Round, k: number, out: THREE.Vector3): THREE.Vector3 {
    out.lerpVectors(r.from, r.to, k);
    if (r.kind === 'howitzer') out.y += 4 * r.apex * k * (1 - k);
    return out;
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i]!;
      if (this.time < r.start) continue;
      if (!r.fired) this.launch(r);
      const k = Math.min(1, (this.time - r.start) / r.dur);
      const pos = this.point(r, k, tmpA);
      const ahead = this.point(r, Math.min(1, k + 0.02), tmpB);
      tmpDir.subVectors(ahead, pos);
      if (tmpDir.lengthSq() < 1e-10) tmpDir.subVectors(r.to, r.from);
      tmpDir.normalize();
      const st = STYLE[r.kind];
      r.core.visible = true;
      r.core.position.copy(pos);
      // rastro do traçante atrás do projétil (não passa da boca do cano)
      const len = Math.min(st.streak, pos.distanceTo(r.from));
      r.streak.visible = len > 0.05;
      r.streak.position.copy(pos);
      r.streak.quaternion.setFromUnitVectors(tmpB.set(1, 0, 0), tmpDir);
      r.streak.scale.set(len, st.width, st.width);
      if (r.shell) {
        r.shell.visible = true;
        r.shell.position.copy(pos);
        r.shell.quaternion.setFromUnitVectors(tmpB.set(1, 0, 0), tmpDir);
        r.smokeAcc += dt;
        if (r.smokeAcc > 0.05) {
          r.smokeAcc = 0;
          this.emit(pos, { life: 1.4, size0: 0.15, size1: 0.6, peak: 0.35, tone: 1 });
        }
      }
      if (k >= 1) {
        this.land(r);
        for (const o of [r.core, r.streak, r.shell]) if (o) o.removeFromParent();
        r.core.material.dispose();
        (r.streak.material as THREE.Material).dispose();
        this.rounds.splice(i, 1);
      }
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      p.sprite.position.y += dt * 0.2;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.pow(t, 0.5));
      const m = p.sprite.material;
      const c = p.tone * (0.92 - t * 0.15);
      m.color.setRGB(c, c * 0.985, c * 0.96);
      m.opacity = Math.min(1, t * 14) * Math.pow(1 - t, 1.5) * p.peak;
      m.rotation += dt * 0.3;
    }
  }

  dispose(): void {
    for (const r of this.rounds) {
      r.core.material.dispose();
      (r.streak.material as THREE.Material).dispose();
    }
    this.rounds.length = 0;
    for (const p of this.puffs) p.sprite.material.dispose();
    this.streakGeo.dispose();
    this.shellGeo.dispose();
    this.shellMat.dispose();
    this.group.removeFromParent();
  }
}
