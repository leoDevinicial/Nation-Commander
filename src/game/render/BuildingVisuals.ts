import * as THREE from 'three';
import { BUILDINGS, type BuildingType } from '../../../shared/sim/config.ts';
import { HealthBar, selectionRing } from './HealthBar.ts';
import { eraLayerMaterial, accentMaterial, bodyMaterial, withFog } from './materials.ts';
import { cinematicSmokeTexture, smokeTexture, volumetricSmokeTexture } from './textures.ts';
import { animRestPivot, buildingModel, type BuildingModel, type ModelAnim } from './models/buildingModels.ts';
import { PUMP, pumpPose } from './models/pumpjack.ts';
import { cropCell } from './models/crops.ts';
import { buildEraProps, type EraProps } from './models/eraProps.ts';
import { SPACE_PAD } from './models/projects.ts';
import { SPACE } from '../../../shared/sim/config.ts';
import type { SpecId } from '../../../shared/sim/upgrades.ts';
import { C, PartBuilder, type ModelLayers } from './models/kit.ts';
import { box, cyl, factionColor, mat, mesh, sharedMaterial } from './palette.ts';

function layerMeshes(l: ModelLayers, owner: number, era = 1): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const [geo, layer] of [
    [l.body, 'body'],
    [l.accent, 'accent'],
    [l.glass, 'glass'],
  ] as const) {
    if (!geo.getAttribute('position')) continue;
    const m = new THREE.Mesh(geo, eraLayerMaterial(layer, owner, era));
    // a camada fica marcada para a troca de aparência quando a nação muda de era
    m.userData.layer = layer;
    m.castShadow = true;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}

export interface BuildingVisualOptions {
  center: THREE.Vector2;
  cellSize: number;
  mapWidth: number;
  /** Células de recurso reivindicadas (só para edifícios próprios de coleta). */
  claims?: number[];
  /** Efeitos decorativos (fumaça) — desligados no preset Mobile/Baixo. */
  effects?: boolean;
  /** Ultra: fumaça volumétrica. */
  ultra?: boolean;
  /** Ultra+: fumaça densa e dispersa pelo vento (mais partículas, maiores e mais suaves). */
  cinematic?: boolean;
  /** Nível e especialização iniciais (Fase 4). */
  level?: number;
  spec?: SpecId | null;
  /** Era da nação dona (aparência das construções). */
  era?: number;
  /** Distância da câmera a partir da qual as peças pequenas dos módulos somem (LOD). */
  lodDistance?: number;
  /** Giro do modelo em torno de y (ex.: porto com o cais virado para a água). */
  facing?: number;
}

/** Distância padrão do LOD dos módulos de melhoria. */
const DEFAULT_LOD = 80;
/** Ciclos do cavalo-mecânico: ≈ 13 golpes por minuto, como um poço real. */
const PUMP_SPEED = 1.4;

/** Qualidade da fumaça: simples (Mobile/Equilibrado/Alto), volumétrica (Ultra) e cinematográfica (Ultra+). */
export type SmokeMode = 'basic' | 'volumetric' | 'cinematic';

/** Direção do vento (horizontal) compartilhada por toda a fumaça. */
const WIND_X = 0.94;
const WIND_Z = 0.34;

/** Fumaça contínua de chaminé: sprites reciclados, subindo, crescendo e sumindo. */
class Smoke {
  readonly group = new THREE.Group();
  private readonly puffs: { s: THREE.Sprite; phase: number; m: THREE.SpriteMaterial; spin: number; seed: number; side: number; lift: number }[] = [];

  constructor(
    tops: [number, number, number][],
    private readonly mode: SmokeMode = 'basic',
  ) {
    const count = mode === 'cinematic' ? 30 : mode === 'volumetric' ? 16 : 7;
    const map = mode === 'cinematic' ? cinematicSmokeTexture() : mode === 'volumetric' ? volumetricSmokeTexture() : smokeTexture();
    for (const [x, y, z] of tops) {
      for (let i = 0; i < count; i++) {
        const m = new THREE.SpriteMaterial({ map, color: '#8d8f90', transparent: true, depthWrite: false, opacity: 0 });
        const sp = new THREE.Sprite(m);
        sp.position.set(x, y, z);
        sp.userData.origin = [x, y, z];
        this.group.add(sp);
        this.puffs.push({
          s: sp,
          phase: i / count,
          m,
          spin: (Math.random() - 0.5) * 0.6,
          seed: Math.random() * 10,
          // cada partícula se abre para um lado da pluma e sobe um pouco diferente
          side: (Math.random() - 0.5) * 2,
          lift: 0.8 + Math.random() * 0.4,
        });
      }
    }
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      const [x, y, z] = p.s.userData.origin as [number, number, number];
      if (this.mode === 'cinematic') {
        // vida longa: a pluma sobe, deita com o vento e se espalha em um véu largo e ralo
        p.phase = (p.phase + dt * 0.07) % 1;
        const t = p.phase;
        const drift = Math.pow(t, 1.45) * 7.5;
        const spread = Math.pow(t, 1.2) * 2.4 * p.side;
        const turbX = Math.sin(t * 7 + p.seed) * 0.45 * t + Math.sin(t * 17 + p.seed * 2) * 0.12 * t;
        const turbZ = Math.cos(t * 6 + p.seed) * 0.4 * t;
        p.s.position.set(
          x + drift * WIND_X - spread * WIND_Z + turbX,
          y + Math.pow(t, 0.55) * 5.2 * p.lift,
          z + drift * WIND_Z + spread * WIND_X + turbZ,
        );
        const sc = 0.6 + Math.pow(t, 0.75) * 6.5;
        p.s.scale.set(sc, sc * 0.92, sc);
        p.m.rotation += p.spin * dt * 0.6;
        // sai escura e quente perto da chaminé, clareia ao subir e fica levemente azulada ao dispersar
        const c = 0.34 + t * 0.4;
        p.m.color.setRGB(c, c * 0.995, c * (0.97 + t * 0.05));
        // muitas partículas finas e sobrepostas: transições suaves, sem "bolhas" visíveis
        p.m.opacity = Math.min(1, t * 6) * Math.pow(1 - t, 1.6) * 0.52;
      } else if (this.mode === 'volumetric') {
        p.phase = (p.phase + dt * 0.11) % 1;
        const t = p.phase;
        // pluma: sobe rápido na saída e é dobrada pelo vento (deriva cresce com t^1,6), com turbulência
        const drift = Math.pow(t, 1.6);
        const turb = Math.sin(t * 9 + p.seed) * 0.25 * t;
        p.s.position.set(x + drift * 4.5 + turb, y + Math.sqrt(t) * 4.2, z + drift * 1.6 + Math.cos(t * 7 + p.seed) * 0.2 * t);
        const sc = 0.45 + Math.pow(t, 0.8) * 4.2;
        p.s.scale.set(sc, sc, sc);
        p.m.rotation += p.spin * dt;
        // sai escura e quente, clareia e se dissipa
        const c = 0.38 + t * 0.32;
        p.m.color.setRGB(c, c * 0.99, c * 0.97);
        p.m.opacity = Math.min(1, t * 8) * Math.pow(1 - t, 1.3) * 0.85;
      } else {
        p.phase = (p.phase + dt * 0.16) % 1;
        const t = p.phase;
        // sobe e é levada pelo vento, abrindo-se
        p.s.position.set(x + t * 2.2, y + t * 3.2, z + t * 0.8);
        const sc = 0.5 + t * 2.4;
        p.s.scale.set(sc, sc, sc);
        p.m.opacity = Math.sin(t * Math.PI) * 0.55;
      }
    }
  }

  dispose(): void {
    for (const p of this.puffs) p.m.dispose();
  }
}

/** Rotação das hélices do drone de vigilância (rad/s): rápida, mas abaixo do ponto em que as pás piscam a 60 fps. */
const DRONE_ROTOR_SPEED = 22;

export class BuildingVisual {
  readonly group = new THREE.Group();
  private readonly model = new THREE.Group();
  /** Corpo do modelo no nível atual (base + módulos de melhoria). */
  private readonly parts = new THREE.Group();
  /** Peças pequenas dos módulos (somem em zoom distante). */
  private readonly detail = new THREE.Group();
  private readonly scaffold: THREE.Group;
  private crane: THREE.Group | null = null;
  private readonly ring: THREE.Mesh;
  readonly hp: HealthBar;
  private readonly rally: THREE.Group;
  private moving: THREE.Group | null = null;
  private movingKind: 'spin' | 'rock' | 'saw' | 'pump' | null = null;
  /** Cavalo-mecânico: manivela, bielas e haste animadas com o balancim. */
  private pump: { crank: THREE.Group; pitman: THREE.Group; rod: THREE.Group; pivot: [number, number, number]; crankPivot: [number, number, number]; rodY: number } | null = null;
  private fields: THREE.Mesh | null = null;
  /** Partes animadas genéricas (serras, toras, guindaste, polias...). */
  private anims: { group: THREE.Group; anim: ModelAnim }[] = [];
  /** Folhas da tampa do silo, abertura atual (0 fechada, 1 aberta) e o alvo. */
  private readonly hatch: { group: THREE.Group; side: 1 | -1 }[] = [];
  private hatchK = 0;
  private hatchWant = 0;
  private smoke: Smoke | null = null;
  private smokeKey = '';
  private t = Math.random() * 10;
  private level = 1;
  private spec: SpecId | null = null;
  /** Era da nação dona: materiais e peças de telhado (radar, painéis, LED, drone). */
  private era = 1;
  private eraProps: EraProps | null = null;
  /** Brilho da troca de era (1 → 0). */
  private eraFlash = 0;
  private height = 1;
  private readonly size: number;
  private readonly lod: number;
  remembered = false;

  constructor(
    readonly id: number,
    readonly type: BuildingType,
    readonly owner: number,
    friendly: boolean,
    private readonly opts: BuildingVisualOptions,
  ) {
    this.size = BUILDINGS[type].size * opts.cellSize;
    this.lod = opts.lodDistance ?? DEFAULT_LOD;
    this.group.position.set(opts.center.x, 0, opts.center.y);
    this.group.add(this.model);
    this.model.add(this.parts, this.detail);
    if (opts.facing) this.model.rotation.y = opts.facing;
    this.level = opts.level ?? 1;
    this.spec = opts.spec ?? null;
    this.era = opts.era ?? 1;
    const def = buildingModel(type, this.level, this.spec);
    if (def.moving) {
      this.moving = new THREE.Group();
      this.moving.position.set(...def.moving.pivot);
      for (const m of layerMeshes(def.moving.layers, owner, this.era)) this.moving.add(m);
      this.model.add(this.moving);
      this.movingKind = def.moving.kind;
      if (def.pump) {
        const part = (l: ModelLayers, at: [number, number, number]) => {
          const g = new THREE.Group();
          g.position.set(...at);
          for (const m of layerMeshes(l, owner, this.era)) g.add(m);
          this.model.add(g);
          return g;
        };
        this.pump = {
          crank: part(def.pump.crank, def.pump.crankPivot),
          pitman: part(def.pump.pitman, [0, 0, 0]),
          rod: part(def.pump.rod, def.pump.rodPivot),
          pivot: def.moving.pivot,
          crankPivot: def.pump.crankPivot,
          rodY: def.pump.rodPivot[1],
        };
        this.posePump(0);
      }
    }
    if (def.anims) {
      for (const anim of def.anims) {
        const group = new THREE.Group();
        group.position.set(...anim.pivot);
        for (const m of layerMeshes(anim.layers, owner, this.era)) group.add(m);
        const parent = anim.parent !== undefined ? this.anims[anim.parent]?.group : undefined;
        (parent ?? this.model).add(group);
        this.anims.push({ group, anim });
      }
      this.poseAnims(0);
    }
    for (const h of def.hatch ?? []) {
      const group = new THREE.Group();
      group.position.set(...h.pivot);
      for (const m of layerMeshes(h.layers, owner, this.era)) group.add(m);
      this.model.add(group);
      this.hatch.push({ group, side: h.side });
    }
    if (opts.claims?.length) this.fields = buildClaimMarkers(type, opts, this.group.position);
    if (this.fields) this.group.add(this.fields);
    this.scaffold = buildScaffold(this.size, def.height);
    this.group.add(this.scaffold);
    this.ring = selectionRing(this.size * 0.72, friendly ? '#8fe0a4' : '#ff8a7a');
    this.group.add(this.ring);
    this.hp = new HealthBar(Math.min(this.size * 0.6, 2.6), def.height + 0.6);
    this.group.add(this.hp.group);
    this.applyModel(def);
    if (this.era > 1) this.rebuildEraProps();
    this.rally = buildRallyFlag(owner);
    this.group.userData.entityId = id;
  }

  /** Programa Espacial: foguete na plataforma, chama e coluna de fumaça na subida. */
  private rocket: { group: THREE.Group; flame: THREE.Mesh; plume: THREE.Mesh; base: THREE.Vector3 } | null = null;
  private launchPhase: 'idle' | 'countdown' | 'ascent' | 'gone' = 'idle';
  private launchT = 0;

  /**
   * Estado do lançamento vindo da simulação: na contagem o foguete solta vapor; na subida acelera
   * até sumir no alto da tela, com chama e coluna de fumaça; depois do satélite em órbita a
   * plataforma fica vazia.
   */
  setLaunch(launch: { phase: 'countdown' | 'ascent'; progress: number } | undefined, satellite: boolean): void {
    if (this.type !== 'space_center') return;
    if (!this.rocket) this.rocket = buildRocket(this.owner);
    // a coluna de fumaça fica fora do foguete (não sobe com ele)
    if (!this.rocket.group.parent) this.model.add(this.rocket.group, this.rocket.plume);
    const phase = launch ? launch.phase : satellite ? 'gone' : 'idle';
    if (phase === 'ascent' && this.launchPhase !== 'ascent') this.launchT = launch!.progress * SPACE.ascentSeconds;
    this.launchPhase = phase;
  }

  private animateRocket(dt: number): void {
    const r = this.rocket;
    if (!r) return;
    r.group.visible = this.launchPhase !== 'gone';
    if (this.launchPhase === 'ascent') {
      this.launchT += dt;
      const t = this.launchT;
      // aceleração constante: começa devagar e some no alto em ~9 s
      const y = 0.6 * t * t;
      r.group.position.set(r.base.x, r.base.y + y, r.base.z);
      r.flame.visible = true;
      r.flame.scale.set(1, 1 + Math.random() * 0.35 + Math.min(1.5, t * 0.2), 1);
      // coluna de fumaça da plataforma até o foguete, que vai se desfazendo
      r.plume.visible = true;
      r.plume.scale.set(1 + t * 0.12, Math.max(0.01, y), 1 + t * 0.12);
      r.plume.position.set(r.base.x, r.base.y + y / 2, r.base.z);
      (r.plume.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.55 - t * 0.03);
    } else {
      r.group.position.copy(r.base);
      r.flame.visible = this.launchPhase === 'countdown' && Math.random() < 0.3;
      r.flame.scale.set(0.6, 0.4, 0.6);
      r.plume.visible = this.launchPhase === 'countdown';
      r.plume.scale.set(1.6, 0.6 + Math.sin(this.t * 3) * 0.1, 1.6);
      r.plume.position.set(r.base.x, r.base.y + 0.3, r.base.z);
      (r.plume.material as THREE.MeshBasicMaterial).opacity = 0.35;
    }
  }

  /** Troca a aparência quando a nação dona muda de era (com um brilho curto de transição). */
  setEra(era: number): void {
    if (era === this.era) return;
    const first = this.eraProps === null && this.era === 1;
    this.era = era;
    this.model.traverse((o) => {
      const layer = o.userData.layer as 'body' | 'accent' | 'glass' | undefined;
      if (layer && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = eraLayerMaterial(layer, this.owner, era);
    });
    this.rebuildEraProps();
    if (!first) this.eraFlash = 1;
  }

  private rebuildEraProps(): void {
    if (this.eraProps) this.eraProps.group.removeFromParent();
    this.eraProps = this.era > 1 ? buildEraProps(this.type, this.size, this.height, this.era, this.owner) : null;
    if (this.eraProps) this.model.add(this.eraProps.group);
  }

  /** Troca o modelo quando o nível ou a especialização mudam (o mesmo valor da simulação). */
  setVariant(level: number, spec: SpecId | null): void {
    if (level === this.level && spec === this.spec) return;
    this.level = level;
    this.spec = spec;
    this.applyModel(buildingModel(this.type, level, spec));
  }

  private applyModel(def: BuildingModel): void {
    // as geometrias são compartilhadas (cache por nível/especialização): só os meshes são trocados
    this.parts.clear();
    this.detail.clear();
    for (const m of layerMeshes(def.base, this.owner, this.era)) this.parts.add(m);
    if (def.detail)
      for (const m of layerMeshes(def.detail, this.owner, this.era)) {
        m.castShadow = false;
        this.detail.add(m);
      }
    const grew = def.height !== this.height;
    this.height = def.height;
    this.hp.group.position.y = def.height + 0.6;
    // peças da era acompanham a nova altura do modelo
    if (grew && this.era > 1) this.rebuildEraProps();
    const key = JSON.stringify(def.smoke ?? []);
    if (key !== this.smokeKey) {
      this.smokeKey = key;
      if (this.smoke) {
        this.smoke.group.removeFromParent();
        this.smoke.dispose();
        this.smoke = null;
      }
      if (def.smoke && this.opts.effects) {
        this.smoke = new Smoke(def.smoke, this.opts.cinematic ? 'cinematic' : this.opts.ultra ? 'volumetric' : 'basic');
        this.model.add(this.smoke.group);
      }
    }
  }

  /** Tampa do silo: abre para o míssil subir e fecha depois do lançamento. */
  setHatch(open: boolean): void {
    this.hatchWant = open ? 1 : 0;
  }

  /** Abertura atual da tampa (0..1). */
  get hatchOpen(): number {
    return this.hatchK;
  }

  /** O marcador de reunião é filho da cena, não do edifício. */
  get rallyObject(): THREE.Object3D {
    return this.rally;
  }

  setSelected(v: boolean): void {
    this.ring.visible = v;
  }

  private cityTag: THREE.Sprite | null = null;
  private cityText: string | undefined;

  /** Placa com o nome da cidade acima da prefeitura (e da capital, no QG). */
  setCity(name: string | undefined): void {
    if (name === this.cityText) return;
    this.cityText = name;
    if (this.cityTag) {
      this.cityTag.material.map?.dispose();
      this.cityTag.material.dispose();
      this.cityTag.removeFromParent();
      this.cityTag = null;
    }
    if (!name) return;
    this.cityTag = nameTag(name, factionColor(this.owner), this.type === 'hq');
    this.cityTag.position.y = this.height + 1.1;
    this.group.add(this.cityTag);
  }

  /** Ritmo das máquinas (0 parado, 1 normal) e o tempo de animação acumulado nesse ritmo. */
  private workRate = 1;
  // fase inicial própria: construções iguais não ficam em sincronia perfeita
  private workT = Math.random() * 100;

  update(
    dt: number,
    progress: number,
    hpFraction: number,
    showHp: boolean,
    camera: THREE.Camera,
    rally: THREE.Vector2 | null,
    showRally: boolean,
    upgrading = false,
    active = true,
  ): void {
    this.t += dt;
    // as máquinas acompanham o funcionamento: param devagar sem trabalhadores, sem pagar a
    // manutenção, com o depósito esgotado ou o armazém cheio, e voltam a girar suaves
    this.workRate += ((active ? 1 : 0) - this.workRate) * (1 - Math.exp(-dt * 1.6));
    if (Math.abs(this.workRate - (active ? 1 : 0)) < 1e-3) this.workRate = active ? 1 : 0;
    this.workT += dt * this.workRate;
    const done = progress >= 1;
    // andaimes na construção e nas obras de melhoria; guindaste só nas melhorias
    this.scaffold.visible = !done || upgrading;
    if (upgrading && !this.crane) {
      this.crane = buildCrane(this.size, this.height);
      this.group.add(this.crane);
    }
    if (this.crane) {
      this.crane.visible = upgrading && !this.remembered;
      if (this.crane.visible) (this.crane.userData.jib as THREE.Object3D).rotation.y += dt * 0.35;
    }
    this.model.scale.y = done ? 1 : 0.12 + progress * 0.88;
    // LOD: peças pequenas só de perto
    this.detail.visible = camera.position.distanceTo(this.group.position) < this.lod;
    if (this.fields) this.fields.visible = done;
    if (this.smoke) {
      this.smoke.group.visible = done && !this.remembered && this.workRate > 0.05;
      if (this.smoke.group.visible) this.smoke.update(dt);
    }
    if (done && this.moving && !this.remembered) {
      if (this.movingKind === 'spin') this.moving.rotation.y += dt * 0.7 * this.workRate;
      else if (this.movingKind === 'rock') this.moving.rotation.z = Math.sin(this.workT * 2.2) * 0.32;
      else if (this.movingKind === 'saw') this.moving.rotation.z += dt * 18 * this.workRate;
      else if (this.movingKind === 'pump') this.posePump(this.workT * PUMP_SPEED);
    }
    if (done && this.anims.length && !this.remembered) this.poseAnims(this.workT);
    if (this.hatch.length) {
      // abre em ~0,7 s (motor hidráulico) e fecha mais devagar; começa e termina suave
      const step = dt * (this.hatchWant > this.hatchK ? 1.5 : 0.8);
      this.hatchK = this.hatchWant > this.hatchK ? Math.min(this.hatchWant, this.hatchK + step) : Math.max(this.hatchWant, this.hatchK - step);
      const e = this.hatchK * this.hatchK * (3 - 2 * this.hatchK);
      for (const h of this.hatch) h.group.rotation.z = -h.side * 1.52 * e;
    }
    if (this.cityTag) this.cityTag.position.y = this.height + 1.1;
    if (this.rocket) {
      this.rocket.group.visible = done && this.launchPhase !== 'gone';
      if (done) this.animateRocket(dt);
    }
    if (this.eraProps && done && !this.remembered) {
      if (this.eraProps.radar) this.eraProps.radar.rotation.y += dt * 1.1;
      const d = this.eraProps.drone;
      if (d) {
        const a = this.t * 0.45;
        d.position.set(Math.cos(a) * this.size * 0.7, this.height + 2.2 + Math.sin(this.t * 1.7) * 0.2, Math.sin(a) * this.size * 0.7);
        // frente (+Z) na direção do voo; inclina para dentro da curva e baixa o nariz, com leve oscilação
        d.rotation.y = -a;
        d.rotation.z = 0.16 + Math.sin(this.t * 1.3) * 0.03;
        d.rotation.x = 0.07 + Math.sin(this.t * 1.7 + 1) * 0.02;
        const parts = this.eraProps.droneParts;
        if (parts) {
          // hélices em rotação contínua (sentidos alternados, como num quadricóptero real); o disco translúcido
          // por baixo das pás dá a sensação de velocidade sem o efeito estroboscópico
          parts.rotors.forEach((r, i) => (r.rotation.y += dt * DRONE_ROTOR_SPEED * (i === 0 || i === 3 ? 1 : -1)));
        }
      }
    }
    if (this.eraProps) this.eraProps.group.visible = done;
    if (this.eraFlash > 0) {
      // transição de era: o modelo pulsa levemente e volta ao tamanho
      this.eraFlash = Math.max(0, this.eraFlash - dt * 0.8);
      const k = 1 + Math.sin(this.eraFlash * Math.PI) * 0.06;
      this.model.scale.x = this.model.scale.z = k;
    }
    this.hp.set(hpFraction);
    this.hp.group.visible = showHp && !this.remembered;
    if (showHp) this.hp.face(camera);
    this.rally.visible = showRally && rally !== null;
    if (rally) this.rally.position.set(rally.x, 0, rally.y);
  }

  /** Pose de cada parte animada no instante t (s). */
  private poseAnims(t: number): void {
    for (const { group, anim } of this.anims) {
      const m = anim.motion;
      const [px, py, pz] = anim.pivot;
      switch (m.kind) {
        case 'spin':
          group.rotation[m.axis] = t * m.speed;
          break;
        case 'swing':
          group.rotation[m.axis] = m.amp * Math.sin(t * m.speed + (m.phase ?? 0));
          break;
        case 'bob':
          group.position.y = py + m.amp * Math.sin(t * m.speed + (m.phase ?? 0));
          break;
        case 'slide': {
          const f = (((t * m.speed) / m.length + (m.phase ?? 0)) % 1 + 1) % 1;
          const d = f * m.length;
          group.position.set(px + m.dir[0] * d, py + m.dir[1] * d, pz + m.dir[2] * d);
          const fade = m.fade ?? 0;
          group.scale.setScalar(fade > 0 ? Math.max(0.001, Math.min(1, f / fade, (1 - f) / fade)) : 1);
          break;
        }
        case 'shuttle': {
          const d = m.length * (0.5 - 0.5 * Math.cos(t * m.speed + (m.phase ?? 0)));
          group.position.set(px + m.dir[0] * d, py + m.dir[1] * d, pz + m.dir[2] * d);
          break;
        }
      }
    }
  }

  /** Cinemática do cavalo-mecânico na fase `w` (radianos): balancim, manivela, haste e bielas juntos. */
  private posePump(w: number): void {
    const p = this.pump;
    if (!p || !this.moving) return;
    const theta = PUMP.amp * Math.sin(w);
    const phi = w + Math.PI;
    this.moving.rotation.z = theta;
    p.crank.rotation.z = phi;
    const pose = pumpPose(p.pivot, p.crankPivot, theta, phi);
    p.rod.position.y = p.rodY + pose.rodDy;
    p.pitman.position.set(...pose.pitmanPos);
    p.pitman.rotation.z = pose.pitmanRotZ;
    p.pitman.scale.y = pose.pitmanLen;
  }

  dispose(): void {
    this.setCity(undefined);
    this.hp.dispose();
    this.smoke?.dispose();
    this.fields?.geometry.dispose();
    if (this.crane) this.crane.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.rally.removeFromParent();
    this.group.removeFromParent();
  }
}

/**
 * Placa de nome (sprite com textura de texto): faixa escura translúcida com o nome em branco e um
 * filete na cor da nação; a capital ganha uma estrela. Tamanho fixo no mundo (some ao longe).
 */
function nameTag(text: string, color: THREE.ColorRepresentation, capital: boolean): THREE.Sprite {
  const label = capital ? `★ ${text}` : text;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 44px system-ui, sans-serif';
  let w = 300;
  if (ctx) {
    ctx.font = font;
    w = Math.ceil(ctx.measureText(label).width) + 48;
  }
  canvas.width = w;
  canvas.height = 76;
  if (ctx) {
    ctx.fillStyle = 'rgba(16, 20, 24, 0.62)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, 64, 14);
    ctx.fill();
    ctx.fillStyle = new THREE.Color(color).getStyle();
    ctx.fillRect(14, 56, w - 28, 6);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f1e8';
    ctx.fillText(label, w / 2, 31);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  const h = 1.1;
  sprite.scale.set((h * canvas.width) / canvas.height, h, 1);
  sprite.renderOrder = 20;
  sprite.name = 'city-tag';
  return sprite;
}

/** Guindaste de obra (torre treliçada com lança giratória) para as melhorias. */
function buildCrane(size: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const material = sharedMaterial('crane', () => withFog(new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.6, metalness: 0.35 })));
  const h = Math.max(2.6, height + 1.2);
  const x = size * 0.38;
  const z = -size * 0.38;
  g.add(mesh(box(0.14, h, 0.14), material, x, h / 2, z));
  for (let y = 0.5; y < h - 0.3; y += 0.5) g.add(mesh(box(0.2, 0.03, 0.03), material, x, y, z));
  const jib = new THREE.Group();
  jib.position.set(x, h, z);
  jib.add(mesh(box(size * 0.95, 0.08, 0.08), material, -size * 0.32, 0, 0));
  jib.add(mesh(box(0.35, 0.18, 0.18), mat.metal(), size * 0.18, -0.05, 0));
  jib.add(mesh(cyl(0.01, 0.01, h * 0.55, 4), mat.metal(), -size * 0.6, -h * 0.27, 0));
  g.add(jib);
  g.userData.jib = jib;
  return g;
}

/** Marcas nas células exploradas: lavouras (fazenda), tocos (serraria), cortes (pedreira). */
function buildClaimMarkers(type: BuildingType, opts: BuildingVisualOptions, origin: THREE.Vector3): THREE.Mesh | null {
  const claims = opts.claims ?? [];
  if (!claims.length || BUILDINGS[type].gather?.terrain === null) return null;
  const b = new PartBuilder();
  const cs = opts.cellSize;
  for (const i of claims) {
    const cx = (i % opts.mapWidth) + 0.5;
    const cy = Math.floor(i / opts.mapWidth) + 0.5;
    const x = cx * cs - origin.x;
    const z = cy * cs - origin.z;
    if (type === 'farm') {
      cropCell(b, x, z, cs, i);
    } else if (type === 'sawmill') {
      b.cyl(0.13, 0.15, 0.16, C.woodDark, [x + 0.3, 0.08, z - 0.2], undefined, 6);
      b.cyl(0.11, 0.13, 0.14, C.woodDark, [x - 0.35, 0.07, z + 0.3], undefined, 6);
    } else if (type === 'quarry') {
      b.box(0.5, 0.3, 0.4, C.stone, [x, 0.15, z]);
    } else if (type === 'mine') {
      b.box(0.4, 0.25, 0.35, '#7b4630', [x, 0.55, z]);
    }
  }
  if (b.isEmpty) return null;
  const m = new THREE.Mesh(b.build(), bodyMaterial());
  m.receiveShadow = true;
  return m;
}

function buildScaffold(size: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const material = sharedMaterial('scaffold', () => withFog(new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.7, metalness: 0.3 })));
  const h = Math.min(2.6, height * 0.7);
  const half = size / 2.2;
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(cyl(0.05, 0.05, h, 4), material, x * half, h / 2, z * half));
  for (const y of [h * 0.33, h * 0.66, h]) {
    g.add(mesh(box(size * 0.9, 0.05, 0.05), material, 0, y, half));
    g.add(mesh(box(size * 0.9, 0.05, 0.05), material, 0, y, -half));
    g.add(mesh(box(0.05, 0.05, size * 0.9), material, half, y, 0));
    g.add(mesh(box(0.05, 0.05, size * 0.9), material, -half, y, 0));
  }
  return g;
}

function buildRallyFlag(owner: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.03, 0.03, 1.6, 5), mat.metal(), 0, 0.8, 0, false));
  g.add(mesh(box(0.55, 0.32, 0.02), accentMaterial(owner), 0.28, 1.45, 0, false));
  g.visible = false;
  return g;
}

/**
 * Prévia de posicionamento: o edifício pronto, translúcido como um holograma, sobre uma base na
 * área ocupada — verde quando a posição é válida, vermelha quando não. A geometria é a do modelo
 * real (cache compartilhado); só os materiais pertencem à prévia.
 */
export class PlacementGhost {
  readonly group = new THREE.Group();
  private readonly base: THREE.Mesh;
  private readonly mats: THREE.MeshStandardMaterial[];
  private valid = true;

  constructor(type: BuildingType, cellSize: number, owner: number) {
    const s = BUILDINGS[type].size * cellSize;
    this.base = new THREE.Mesh(new THREE.BoxGeometry(s, 0.08, s), mat.ghostOk());
    this.base.position.y = 0.05;
    this.base.renderOrder = 5;
    this.group.add(this.base);
    const look = { transparent: true, opacity: 0.68, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.1 };
    const body = new THREE.MeshStandardMaterial({ ...look, vertexColors: true, emissive: '#2f9a52' });
    const accent = new THREE.MeshStandardMaterial({ ...look, color: factionColor(owner), emissive: '#2f9a52' });
    const glass = new THREE.MeshStandardMaterial({ ...look, color: '#4d6270', emissive: '#2f9a52' });
    this.mats = [body, accent, glass];
    const model = buildingModel(type);
    const parts: [ModelLayers, [number, number, number] | null][] = [[model.base, null]];
    if (model.detail) parts.push([model.detail, null]);
    if (model.moving) parts.push([model.moving.layers, model.moving.pivot]);
    if (model.pump) parts.push([model.pump.crank, model.pump.crankPivot], [model.pump.rod, model.pump.rodPivot]);
    if (model.anims) model.anims.forEach((x, i) => parts.push([x.layers, animRestPivot(model.anims!, i)]));
    for (const h of model.hatch ?? []) parts.push([h.layers, h.pivot]);
    for (const [l, at] of parts)
      for (const [geo, m] of [
        [l.body, body],
        [l.accent, accent],
        [l.glass, glass],
      ] as const) {
        if (!geo.getAttribute('position')) continue;
        const mesh = new THREE.Mesh(geo, m);
        if (at) mesh.position.set(...at);
        mesh.renderOrder = 6;
        this.group.add(mesh);
      }
  }

  setValid(ok: boolean): void {
    if (ok === this.valid) return;
    this.valid = ok;
    this.base.material = ok ? mat.ghostOk() : mat.ghostBad();
    for (const m of this.mats) m.emissive.set(ok ? '#2f9a52' : '#b8322a');
  }

  dispose(): void {
    this.base.geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.group.removeFromParent();
  }
}

/** Foguete lançador: corpo branco, propulsores laterais, aletas, faixa na cor da facção, chama e fumaça. */
function buildRocket(owner: number): { group: THREE.Group; flame: THREE.Mesh; plume: THREE.Mesh; base: THREE.Vector3 } {
  const b = new PartBuilder();
  const a = new PartBuilder();
  b.cyl(0.32, 0.32, 3.6, '#eceeed', [0, 1.8, 0], undefined, 14);
  b.cyl(0.02, 0.32, 0.9, '#eceeed', [0, 4.05, 0], undefined, 14);
  for (const [x, z] of [
    [0.45, 0],
    [-0.45, 0],
    [0, 0.45],
    [0, -0.45],
  ] as const) {
    b.cyl(0.14, 0.14, 2.0, '#e1e3e1', [x, 1.0, z], undefined, 10);
    b.cyl(0.01, 0.14, 0.35, '#e1e3e1', [x, 2.17, z], undefined, 10);
    b.box(0.04, 0.5, 0.3, '#5d6166', [x * 1.25, 0.3, z * 1.25], [0, Math.atan2(x, z), 0]);
  }
  b.cyl(0.26, 0.34, 0.25, '#3a3d40', [0, -0.1, 0], undefined, 12);
  a.box(0.66, 0.35, 0.66, '#ffffff', [0, 3.0, 0]);
  const group = new THREE.Group();
  const body = new THREE.Mesh(b.build(), bodyMaterial());
  body.castShadow = true;
  const band = new THREE.Mesh(a.build(), accentMaterial(owner));
  group.add(body, band);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 2.2, 12, 1, true).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  flame.position.y = -1.2;
  flame.visible = false;
  group.add(flame);
  const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#e8e4dc', transparent: true, opacity: 0.4, depthWrite: false }));
  plume.visible = false;
  const base = new THREE.Vector3(...SPACE_PAD);
  group.position.copy(base);
  return { group, flame, plume, base };
}
