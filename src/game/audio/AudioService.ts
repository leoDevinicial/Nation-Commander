/**
 * Serviço central de áudio (Fase 7). Todo som é sintetizado na hora com WebAudio — nenhum arquivo é
 * baixado em tempo de execução e não há material de terceiros a licenciar.
 *
 * - Canais com volume próprio: geral → música, interface, ambiente, combate e produção.
 * - Sons de combate posicionados: atenuação pela distância até o ponto que a câmera olha (e pelo
 *   zoom), panorâmica estéreo pela posição na tela, variação de altura e timbre a cada disparo, e um
 *   limite de vozes simultâneas (menor no celular) — o que excede é descartado pela prioridade.
 * - Produção: só o edifício próprio selecionado toca seu som de trabalho, com entrada e saída suaves.
 * - Mísseis: sons distintos para preparação, armado, autorização, lançamento, voo, impacto e
 *   interceptação.
 *
 * O contexto de áudio só nasce no primeiro gesto do jogador (exigência dos navegadores).
 */

export type Channel = 'music' | 'ui' | 'ambient' | 'combat' | 'production';
export const CHANNELS: Channel[] = ['music', 'ui', 'ambient', 'combat', 'production'];
export type Volumes = Record<Channel | 'master', number>;

export const DEFAULT_VOLUMES: Volumes = { master: 0.8, music: 0.35, ui: 0.7, ambient: 0.5, combat: 0.75, production: 0.6 };

export type UiSound = 'click' | 'confirm' | 'error' | 'alert' | 'success' | 'hold';
export type CombatSound = 'rifle' | 'cannon' | 'howitzer' | 'tower' | 'explosion' | 'explosion_big' | 'jet' | 'bomb' | 'flak' | 'missile_launch' | 'missile_impact' | 'intercept' | 'rocket' | 'aa_gun' | 'aa_twin' | 'mbt_gun' | 'tank_gun' | 'vehicle_explosion' | 'vehicle_explosion_heavy' | 'nuclear_blast' | 'space_prelaunch' | 'space_liftoff' | 'dome_launch' | 'dome_intercept' | 'gatling';
export type MissileCue = 'prepare' | 'armed' | 'authorize';

/** Som de trabalho de cada edifício (os demais usam o zumbido genérico). */
export type ProductionSound = 'saw' | 'quarry' | 'mine' | 'factory' | 'pump' | 'farm' | 'jet_idle' | 'port' | 'office' | 'hum';
export const PRODUCTION_SOUND: Record<string, ProductionSound> = {
  sawmill: 'saw',
  quarry: 'quarry',
  mine: 'mine',
  factory: 'factory',
  barracks: 'office',
  oil_well: 'pump',
  farm: 'farm',
  airbase: 'jet_idle',
  port: 'port',
  market: 'office',
  rail_station: 'port',
  hq: 'office',
  missile_silo: 'hum',
  aa_battery: 'hum',
  refinery: 'pump',
  steel_mill: 'factory',
  hospital: 'office',
  school: 'office',
  police_station: 'office',
};

interface Voice {
  stop: () => void;
  end: number;
  priority: number;
}

/** Prioridade (maior não é descartado quando o limite de vozes é atingido). */
const PRIORITY: Record<CombatSound, number> = {
  rifle: 1,
  tower: 1,
  flak: 2,
  aa_gun: 3,
  aa_twin: 3,
  mbt_gun: 3,
  vehicle_explosion: 4,
  vehicle_explosion_heavy: 5,
  nuclear_blast: 9,
  space_prelaunch: 8,
  space_liftoff: 9,
  dome_launch: 6,
  dome_intercept: 7,
  gatling: 3,
  tank_gun: 3,
  cannon: 2,
  howitzer: 4,
  rocket: 2,
  jet: 2,
  explosion: 3,
  bomb: 4,
  explosion_big: 4,
  intercept: 5,
  missile_launch: 6,
  missile_impact: 6,
};

/** Intervalo mínimo (s) entre dois sons iguais: vários fuzis no mesmo quadro viram um. */
const MIN_GAP: Partial<Record<CombatSound, number>> = { rifle: 0.12, tower: 0.06, cannon: 0.08, howitzer: 0.35, rocket: 0.05, explosion: 0.06, flak: 0.05, jet: 0.4, aa_gun: 0.45, aa_twin: 0.4, mbt_gun: 0.18, gatling: 0.15, vehicle_explosion: 0.1, vehicle_explosion_heavy: 0.15, nuclear_blast: 1, space_prelaunch: 2, space_liftoff: 2, dome_launch: 0.2, dome_intercept: 0.3, tank_gun: 0.18 };

/**
 * Atenuação e panorâmica de um ponto do mapa para quem olha `L` (ponto da câmera, distância e giro).
 * null = longe demais para ouvir. Com a câmera afastada se ouve mais longe, porém mais baixo.
 */
export function spatialMix(L: { x: number; y: number; dist: number; yaw: number }, x: number, y: number): { gain: number; pan: number } | null {
  const dx = x - L.x;
  const dy = y - L.y;
  const d = Math.hypot(dx, dy);
  const ref = 10 + L.dist * 0.35;
  const max = 30 + L.dist * 1.6;
  if (d > max) return null;
  const zoom = Math.min(1, 26 / Math.max(14, L.dist)) * 0.6 + 0.4;
  const gain = (zoom * ref) / (ref + Math.max(0, d - 4));
  // lado na tela: projeta no eixo "direita" da câmera
  const right = { x: Math.cos(L.yaw), y: -Math.sin(L.yaw) };
  const pan = Math.max(-0.85, Math.min(0.85, (dx * right.x + dy * right.y) / (ref * 1.8)));
  return { gain, pan };
}

/**
 * Limite de vozes: -1 = há vaga; índice = voz de menor prioridade a descartar; null = o som novo
 * é que fica de fora (nenhuma voz tocando tem prioridade menor).
 */
export function pickVictim(voices: readonly { priority: number }[], priority: number, max: number): number | null {
  if (voices.length < max) return -1;
  let worst = -1;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i]!;
    if (v.priority < priority && (worst < 0 || v.priority < voices[worst]!.priority)) worst = i;
  }
  return worst < 0 ? null : worst;
}

export class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Channel, GainNode>();
  private volumes: Volumes = { ...DEFAULT_VOLUMES };
  private muted = false;
  private noise: AudioBuffer | null = null;
  private readonly voices: Voice[] = [];
  private maxVoices = 24;
  private readonly lastPlayed = new Map<string, number>();
  private listener = { x: 0, y: 0, dist: 40, yaw: 0 };
  private production: { kind: ProductionSound; gain: GainNode; stop: () => void } | null = null;
  private ambient: { stop: () => void } | null = null;
  private music: { stop: () => void } | null = null;
  private musicTimer = 0;
  private alarm: { stop: () => void; id: number } | null = null;

  /** Celular: menos vozes simultâneas. */
  configure(opts: { mobile: boolean }): void {
    this.maxVoices = opts.mobile ? 10 : 24;
  }

  /** Cria (ou retoma) o contexto no primeiro gesto do jogador. */
  unlock(): void {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      // compressor suave no fim: explosões somadas não estouram
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      for (const c of CHANNELS) {
        const g = this.ctx.createGain();
        g.connect(this.master);
        this.buses.set(c, g);
      }
      this.noise = this.makeNoise();
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(v: Volumes, muted: boolean): void {
    this.volumes = { ...v };
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    for (const c of CHANNELS) this.buses.get(c)!.gain.setTargetAtTime(this.volumes[c], t, 0.05);
  }

  /** Ponto que a câmera olha, distância da câmera e giro (para atenuação e panorâmica). */
  setListener(x: number, y: number, dist: number, yaw: number): void {
    this.listener = { x, y, dist, yaw };
  }

  // ------------------------------------------------------------------ utilidades

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // ruído rosa (Voss-McCartney simplificado): mais natural que o branco para vento e explosões
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  private readonly drives = new Map<number, Float32Array<ArrayBuffer>>();

  /** Curva de saturação (tanh) com ganho `k`: engrossa os graves do disparo sem estourar. */
  private driveCurve(k: number): Float32Array<ArrayBuffer> {
    let c = this.drives.get(k);
    if (!c) {
      const n = 2048;
      c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(x * k) / Math.tanh(k);
      }
      this.drives.set(k, c);
    }
    return c;
  }

  private outdoor: ConvolverNode | null = null;

  /**
   * Reverberação de campo aberto (uma só, compartilhada, ligada ao canal de combate): resposta ao impulso gerada aqui,
   * com os primeiros reflexos do terreno e de construções próximas (30 a 260 ms, cada um mais abafado) e uma cauda
   * difusa que perde os agudos enquanto some (~2 s). É o que faz um tiro forte "rolar" pela paisagem.
   */
  private outdoorReverb(): ConvolverNode {
    if (this.outdoor) return this.outdoor;
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.round(rate * 2.4);
    const ir = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      // reflexos iniciais: pulsos curtos com o lado esquerdo e o direito um pouco diferentes (largura estéreo)
      const early = [0.031, 0.054, 0.083, 0.121, 0.167, 0.214, 0.262];
      early.forEach((s, k) => {
        const at = Math.round((s + (ch ? 0.006 : 0) * (k % 2 ? 1 : -1)) * rate);
        const amp = 0.55 * Math.pow(0.72, k);
        for (let i = 0; i < 90 && at + i < len; i++) d[at + i]! += (Math.random() * 2 - 1) * amp * Math.exp(-i / 18);
      });
      // cauda difusa: ruído com queda exponencial e um passa-baixa que fecha com o tempo (o ar come os agudos)
      let lp = 0;
      for (let i = Math.round(0.04 * rate); i < len; i++) {
        const t = i / rate;
        const k = 0.5 * Math.exp(-t * 0.9) + 0.04;
        lp += ((Math.random() * 2 - 1) - lp) * k;
        d[i]! += lp * 0.42 * Math.exp(-t * 2.6) * Math.min(1, (t - 0.04) / 0.08);
      }
    }
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = ir;
    conv.connect(this.buses.get('combat')!);
    this.outdoor = conv;
    return conv;
  }

  private rocketCrackle: AudioBuffer | null = null;

  /**
   * Estalos do jato de um motor de foguete (12 s, gerados uma vez): o som característico de um lançamento de verdade,
   * que vem das ondas de choque fracas do jato supersônico. Pulsos curtos e assimétricos (subida rápida e queda
   * negativa mais lenta, como ondas N), em instantes aleatórios (~90 por segundo), com força de cauda longa: muitos
   * pequenos e alguns bem fortes.
   */
  private rocketCrackleBuffer(): AudioBuffer {
    if (this.rocketCrackle) return this.rocketCrackle;
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.round(12 * rate);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let time = 0;
    while (time < 12) {
      time += -Math.log(1 - Math.random()) / 90;
      const at = Math.round(time * rate);
      const amp = Math.min(1, 0.08 / Math.pow(Math.random(), 0.75)) * (Math.random() < 0.5 ? 1 : -1);
      const w = Math.round((0.0004 + Math.random() * 0.0012) * rate);
      for (let i = 0; i < w * 3 && at + i < len; i++) {
        const x = i / w;
        d[at + i]! += amp * (x < 1 ? x : x < 1.6 ? 1 - (x - 1) * 3.3 : -0.98 * Math.exp(-(x - 1.6) * 1.8));
      }
    }
    this.rocketCrackle = buf;
    return buf;
  }

  private readonly gatlingBursts: { buffer: AudioBuffer; firing: number; lead: number }[] = [];

  /**
   * Rajada do Gatling desenhada amostra a amostra (três variantes guardadas, sorteadas a cada uso). Cada tiro:
   * estalo de ruído branco de ~1,5 ms, corpo em duas senoides amortecidas (~200 e ~420 Hz) e sopro grave filtrado, com
   * pequenas variações de tempo e força. Os primeiros tiros saem mais espaçados (os canos ainda ganhando velocidade).
   */
  private gatlingBurst(): { buffer: AudioBuffer; firing: number; lead: number } {
    if (this.gatlingBursts.length < 3) {
      const ctx = this.ctx!;
      const rate = ctx.sampleRate;
      const lead = 0.12;
      const firing = 1.75 + Math.random() * 0.1;
      const rof = 72 + Math.random() * 6;
      const len = Math.round((lead + firing + 0.08) * rate);
      const buffer = ctx.createBuffer(1, len, rate);
      const d = buffer.getChannelData(0);
      let time = lead;
      let shot = 0;
      while (time < lead + firing) {
        const at = Math.round((time + (Math.random() - 0.5) * 0.0016) * rate);
        const amp = (0.82 + Math.random() * 0.18) * Math.min(1, 0.55 + shot * 0.15);
        const f1 = 195 + Math.random() * 30;
        let blast = 0;
        for (let i = 0; i < Math.round(0.014 * rate) && at + i < len; i++) {
          const s = i / rate;
          const crack = s < 0.002 ? (Math.random() * 2 - 1) * Math.exp(-s / 0.0005) * 1.25 : 0;
          const body = Math.sin(2 * Math.PI * f1 * s) * Math.exp(-s / 0.0042) * 0.6 + Math.sin(2 * Math.PI * f1 * 2.13 * s) * Math.exp(-s / 0.0022) * 0.3;
          blast += ((Math.random() * 2 - 1) - blast) * 0.08;
          d[at + i]! += amp * (crack + body + blast * Math.exp(-s / 0.005) * 2.6);
        }
        // spin-up: os primeiros tiros mais espaçados até a cadência plena
        time += (1 / rof) * (shot < 4 ? 1.6 - shot * 0.15 : 1);
        shot++;
      }
      this.gatlingBursts.push({ buffer, firing, lead });
    }
    return this.gatlingBursts[Math.floor(Math.random() * this.gatlingBursts.length)]!;
  }

  private noiseSource(loop = false): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number): number {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return t + attack + decay;
  }

  /** Reserva uma voz: respeita o limite, descartando a de menor prioridade. */
  private claim(priority: number, end: number, stop: () => void): boolean {
    const now = this.ctx!.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i]!.end <= now) this.voices.splice(i, 1);
    const victim = pickVictim(this.voices, priority, this.maxVoices);
    if (victim === null) return false;
    if (victim >= 0) {
      this.voices[victim]!.stop();
      this.voices.splice(victim, 1);
    }
    this.voices.push({ stop, end, priority });
    return true;
  }

  private spatial(x: number, y: number): { gain: number; pan: number } | null {
    return spatialMix(this.listener, x, y);
  }

  private out(channel: Channel, gain: number, pan = 0): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.buses.get(channel)!);
    } else g.connect(this.buses.get(channel)!);
    return g;
  }

  private gap(key: string, seconds: number): boolean {
    const now = this.ctx!.currentTime;
    const last = this.lastPlayed.get(key) ?? -1;
    if (now - last < seconds) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  // ------------------------------------------------------------------ combate

  /** Som de combate num ponto do mapa (descartado se longe ou sem voz livre). */
  playAt(sound: CombatSound, x: number, y: number): void {
    if (!this.ready) return;
    const sp = this.spatial(x, y);
    if (!sp || sp.gain < 0.03) return;
    if (!this.gap(sound, MIN_GAP[sound] ?? 0)) return;
    this.combat(sound, sp.gain, sp.pan);
  }

  /**
   * Som enorme, ouvido em qualquer parte do mapa (lançamento espacial): posicionado e atenuado pela distância como
   * `playAt`, mas nunca abaixo de `minGain`, para chegar como um ronco distante mesmo com a câmera longe.
   */
  playWide(sound: CombatSound, x: number, y: number, minGain: number): void {
    if (!this.ready) return;
    if (!this.gap(sound, MIN_GAP[sound] ?? 0)) return;
    const sp = this.spatial(x, y);
    this.combat(sound, Math.max(minGain, sp?.gain ?? 0), sp?.pan ?? 0);
  }

  /** Som de combate sem posição (ex.: alerta do próprio silo). */
  play(sound: CombatSound, gain = 1): void {
    if (!this.ready) return;
    this.combat(sound, gain, 0);
  }

  private combat(sound: CombatSound, gain: number, pan: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    const vary = 1 + (Math.random() - 0.5) * 0.18;
    const nodes: AudioScheduledSourceNode[] = [];
    const out = this.out('combat', gain, pan);
    const burst = (type: BiquadFilterType, freq: number, q: number, attack: number, peak: number, decay: number, at = t, dest: AudioNode = out): number => {
      const n = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq * vary;
      f.Q.value = q;
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(dest);
      const end = this.env(g, at, attack, peak, decay);
      n.start(at, Math.random());
      n.stop(end + 0.05);
      nodes.push(n);
      return end;
    };
    const thump = (from: number, to: number, attack: number, peak: number, decay: number, at = t, type: OscillatorType = 'sine', dest: AudioNode = out): number => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(from * vary, at);
      o.frequency.exponentialRampToValueAtTime(to * vary, at + attack + decay);
      const g = ctx.createGain();
      o.connect(g).connect(dest);
      const end = this.env(g, at, attack, peak, decay);
      o.start(at);
      o.stop(end + 0.05);
      nodes.push(o);
      return end;
    };
    let end = t;
    switch (sound) {
      case 'rifle': {
        // rajada de metralhadora (~750 tiros/min): 3 a 5 disparos, cada um com o estalo supersônico,
        // o corpo do tiro, um soco grave curto e o clique do ferrolho; variação leve de tom e força
        // entre os tiros (nada soa colado), e o eco curto da rajada no fim
        const rounds = 3 + Math.floor(Math.random() * 3);
        const rate = 0.075 + Math.random() * 0.01;
        for (let i = 0; i < rounds; i++) {
          const at = t + i * rate + (Math.random() - 0.5) * 0.006;
          const k = (i === 0 ? 1 : 0.82 + Math.random() * 0.18) * 0.85;
          burst('highpass', 2600 + Math.random() * 600, 0.8, 0.0008, 0.55 * k, 0.03, at);
          burst('bandpass', 520 + Math.random() * 120, 1.3, 0.001, 0.62 * k, 0.1, at);
          thump(150 + Math.random() * 20, 62, 0.001, 0.42 * k, 0.09, at);
          burst('bandpass', 3600, 7, 0.001, 0.08 * k, 0.018, at + 0.022);
        }
        const tail = t + rounds * rate;
        burst('lowpass', 900, 0.6, 0.02, 0.16, 0.35, tail - rate * 0.5);
        end = burst('lowpass', 420, 0.6, 0.04, 0.09, 0.5, tail + 0.08);
        break;
      }
      case 'tower':
        end = burst('bandpass', 1200, 1.1, 0.002, 0.55, 0.12);
        thump(220, 90, 0.003, 0.25, 0.1);
        break;
      case 'aa_gun': {
        // canhão antiaéreo automático duplo (35 mm, tipo Gepard): rajada de 6 a 9 tiros alternando os
        // dois canos (~12 por segundo). Cada tiro: estalo supersônico seco, soco grave saturado (o
        // peso "ignorante" que se sente no peito), jato da boca e o clangor do mecanismo de
        // alimentação. No fim, o eco grave da rajada rolando pelo terreno.
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(4.2);
        drive.oversample = '4x';
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 420;
        const body = ctx.createGain();
        body.gain.value = 1.05;
        drive.connect(low).connect(body).connect(out);
        const rounds = 6 + Math.floor(Math.random() * 4);
        const rate = 0.082 + Math.random() * 0.008;
        for (let i = 0; i < rounds; i++) {
          const at = t + i * rate + (Math.random() - 0.5) * 0.005;
          // os dois canos têm timbre um pouco diferente; o primeiro tiro é o mais forte
          const left = i % 2 === 0;
          const k = (i === 0 ? 1.1 : 0.85 + Math.random() * 0.15) * (left ? 1 : 0.92);
          burst('highpass', (left ? 1700 : 1500) + Math.random() * 300, 0.7, 0.0008, 1.15 * k, 0.045, at);
          burst('bandpass', left ? 700 : 620, 1.2, 0.001, 0.9 * k, 0.12, at);
          thump(left ? 120 : 108, 36, 0.002, 1.6 * k, 0.2, at, 'sine', drive);
          thump(64, 24, 0.003, 1.1 * k, 0.32, at, 'triangle', drive);
          burst('lowpass', 520, 0.7, 0.002, 1.25 * k, 0.22, at, drive);
          // mecanismo: culatra batendo e o elo da munição (metal)
          burst('bandpass', 2900 + Math.random() * 300, 9, 0.001, 0.22 * k, 0.05, at + 0.03);
        }
        const tail = t + rounds * rate;
        burst('lowpass', 340, 0.6, 0.03, 1.0, 0.9, tail - rate, drive);
        burst('lowpass', 220, 0.5, 0.07, 0.55, 1.4, tail + 0.25);
        end = burst('lowpass', 150, 0.5, 0.12, 0.32, 1.8, tail + 0.7);
        break;
      }
      case 'aa_twin':
      case 'mbt_gun':
      case 'tank_gun': {
        // os tanques usam a mesma receita com um disparo só: o Tanque Moderno mais grave (calibre maior); o tanque
        // comum mais fraco, com menos grave e menos eco (`power`)
        const shots = sound === 'aa_twin' ? 2 : 1;
        const pitch = sound === 'mbt_gun' ? 0.8 : sound === 'tank_gun' ? 0.95 : 1;
        const power = sound === 'tank_gun' ? 0.55 : 1;
        // canhões gêmeos de 30 mm (antiaérea do Futuro Próximo): dois disparos pesados e separados, um de cada cano.
        // Cada um tem cinco camadas que chegam juntas e somem em tempos diferentes:
        //   1. estalo supersônico: o "crack" seco e muito brilhante do projétil rompendo a barreira do som;
        //   2. sopro da boca: os gases saindo do cano, saturados (é o que dá o peso agressivo);
        //   3. soco grave: o recuo do cano e a onda de pressão que se sente no peito;
        //   4. subgrave: a pressão bem funda que treme o chão, mais longa que o resto;
        //   5. mecânica: o ferrolho batendo no fim do curso (grave e curto, sem tilintar agudo).
        // Os tiros vão também para a reverberação de campo aberto (eco do terreno), e no fim o estrondo rola longe.
        const mix = ctx.createGain();
        mix.gain.value = power;
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.32 * power;
        mix.connect(wet).connect(this.outdoorReverb());
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(5.5);
        drive.oversample = '4x';
        const driveLow = ctx.createBiquadFilter();
        driveLow.type = 'lowpass';
        driveLow.frequency.value = 680;
        driveLow.Q.value = 0.9;
        const body = ctx.createGain();
        body.gain.value = 1.15;
        drive.connect(driveLow).connect(body).connect(mix);
        // sopro da boca saturado, mais aberto que o soco (médios rasgados)
        const blast = ctx.createWaveShaper();
        blast.curve = this.driveCurve(3.2);
        blast.oversample = '4x';
        const blastBand = ctx.createBiquadFilter();
        blastBand.type = 'bandpass';
        blastBand.frequency.value = 1100;
        blastBand.Q.value = 0.55;
        blast.connect(blastBand).connect(mix);
        const gap = 0.2 + Math.random() * 0.025;
        for (let i = 0; i < shots; i++) {
          const at = t + i * gap;
          // o segundo cano: um pouco mais grave e um fio mais fraco (nada soa colado)
          const k = i === 0 ? 1 : 0.93;
          const f = (i === 0 ? 1 : 0.91) * pitch;
          // 1. estalo supersônico (duas camadas: o pico e o brilho)
          burst('highpass', 3200 * f, 0.5, 0.0002, 2.0 * k, 0.014, at, mix);
          burst('bandpass', 5200 * f, 0.8, 0.0003, 1.2 * k, 0.022, at, mix);
          // 2. sopro da boca, saturado
          burst('bandpass', 900 * f, 0.6, 0.0008, 1.9 * k, 0.08, at + 0.002, blast);
          burst('lowpass', 2400 * f, 0.5, 0.001, 0.9 * k, 0.11, at + 0.003, mix);
          // 3. soco grave saturado (o recuo e a onda de pressão)
          thump(165 * f, 50, 0.0015, 2.2 * k, 0.16, at, 'sine', drive);
          thump(98 * f, 34, 0.002, 1.6 * k, 0.24, at, 'triangle', drive);
          thump(230 * f, 110, 0.0008, 0.7 * k, 0.05, at, 'square', drive);
          burst('lowpass', 420, 0.8, 0.0015, 1.6 * k, 0.18, at, drive);
          // 4. subgrave longo (direto, sem saturar: pressão limpa e funda)
          thump(56 * f, 26, 0.006, 1.3 * k * power, 0.55 * power, at, 'sine', mix);
          // 5. mecânica: ferrolho batendo no fim do curso
          burst('bandpass', 2300, 9, 0.0008, 0.42 * k, 0.045, at + 0.052, mix);
          thump(310, 190, 0.001, 0.28 * k, 0.045, at + 0.052, 'square', mix);
        }
        // eco do terreno: o estrondo volta abafado de longe, duas vezes, e rola até sumir
        const tail = t + gap * (shots - 1);
        burst('lowpass', 480, 0.6, 0.02, 0.32, 0.45, tail + 0.36, mix);
        thump(64, 30, 0.015, 0.35, 0.5, tail + 0.36, 'sine', mix);
        burst('lowpass', 300, 0.5, 0.05, 0.24, 0.9, tail + 0.7, mix);
        end = burst('lowpass', 170, 0.5, 0.12, 0.16, 1.6, tail + 1.1, mix);
        break;
      }
      case 'gatling': {
        // Gatling de 20 mm do CIWS: uma rajada inteira (~1,8 s, ~75 tiros por segundo). Cada tiro é desenhado na
        // amostra (`gatlingBurst`): estalo, corpo e sopro curtos, mais curtos que o intervalo entre os tiros. Por isso
        // eles se fundem no rasgo grave e contínuo ("brrrrt") sem virar zumbido. Por cima: o motor que gira os canos
        // (sobe antes do primeiro tiro e desce depois do último), o ronco grave da rajada e o eco do terreno.
        const { buffer, firing, lead } = this.gatlingBurst();
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.3;
        mix.connect(wet).connect(this.outdoorReverb());
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = vary;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 55;
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(2.4);
        drive.oversample = '4x';
        const level = ctx.createGain();
        level.gain.value = 0.95;
        src.connect(hp).connect(drive).connect(level).connect(mix);
        src.start(t);
        nodes.push(src);
        const start = t + lead / vary;
        const stop = t + (lead + firing) / vary;
        // ronco grave contínuo da rajada (a pressão dos tiros somada)
        const n = this.noiseSource();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 240;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, start);
        ng.gain.exponentialRampToValueAtTime(0.55, start + 0.08);
        ng.gain.setValueAtTime(0.55, stop - 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, stop + 0.15);
        n.connect(lp).connect(ng).connect(mix);
        n.start(t, Math.random());
        n.stop(stop + 0.2);
        nodes.push(n);
        // motor elétrico do feixe de canos: sobe antes do primeiro tiro e desce depois do último
        const whine = ctx.createOscillator();
        whine.type = 'sawtooth';
        whine.frequency.setValueAtTime(140, t);
        whine.frequency.exponentialRampToValueAtTime(820, start);
        whine.frequency.setValueAtTime(820, stop);
        whine.frequency.exponentialRampToValueAtTime(160, stop + 0.6);
        const wf = ctx.createBiquadFilter();
        wf.type = 'bandpass';
        wf.frequency.value = 900;
        wf.Q.value = 2;
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(0.0001, t);
        wg.gain.exponentialRampToValueAtTime(0.05, start);
        wg.gain.setValueAtTime(0.035, stop);
        wg.gain.exponentialRampToValueAtTime(0.0001, stop + 0.6);
        whine.connect(wf).connect(wg).connect(mix);
        whine.start(t);
        whine.stop(stop + 0.65);
        nodes.push(whine);
        // eco do terreno depois da rajada
        burst('lowpass', 420, 0.6, 0.03, 0.35, 0.7, stop + 0.12, mix);
        end = burst('lowpass', 200, 0.5, 0.1, 0.2, 1.3, stop + 0.45, mix);
        break;
      }
      case 'cannon':
        end = burst('lowpass', 900, 0.8, 0.003, 0.9, 0.45);
        thump(110, 38, 0.004, 0.9, 0.38);
        break;
      case 'howitzer': {
        // obus de 155 mm: estampido supersônico seco, onda de pressão subgrave saturada que "empurra"
        // o ar, jato lateral do freio de boca, estalos do recuo e do retorno do tubo, e o eco do
        // disparo rolando pelo terreno por alguns segundos. Os graves passam por dois estágios de
        // saturação (o segundo mais duro), o que dá o peso "ignorante" sem estourar a saída.
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(3.6);
        drive.oversample = '4x';
        const crush = ctx.createWaveShaper();
        crush.curve = this.driveCurve(7);
        crush.oversample = '4x';
        const crushLow = ctx.createBiquadFilter();
        crushLow.type = 'lowpass';
        crushLow.frequency.value = 260;
        const body = ctx.createGain();
        body.gain.value = 1.15;
        drive.connect(crush).connect(crushLow).connect(body).connect(out);
        // estampido duplo: o "crack" do projétil e, colado nele, o tapa do gás saindo da boca
        burst('highpass', 1200, 0.6, 0.001, 1.8, 0.08);
        burst('bandpass', 3400, 0.9, 0.001, 0.9, 0.04);
        burst('highpass', 900, 0.7, 0.001, 1.3, 0.1, t + 0.018);
        // onda de choque: graves descendentes saturados (o soco no peito), um sub bem fundo e longo
        // e um quadrado curto que rasga o primeiro instante
        thump(92, 26, 0.003, 2.2, 0.9, t, 'sine', drive);
        thump(52, 17, 0.005, 1.8, 1.6, t, 'triangle', drive);
        thump(34, 14, 0.02, 1.5, 2.2, t + 0.01, 'sine', drive);
        thump(70, 30, 0.002, 0.9, 0.18, t, 'square', drive);
        // corpo do disparo: ruído grave denso (saturado) e o jato do freio de boca para os lados
        burst('lowpass', 480, 0.7, 0.003, 2.1, 1.5, t, drive);
        burst('bandpass', 820, 1.1, 0.002, 1.2, 0.4, t + 0.012);
        burst('lowpass', 1700, 0.5, 0.008, 0.9, 0.75, t + 0.02);
        // chão e ferragens tremendo logo depois do tiro
        burst('bandpass', 5200, 1.6, 0.03, 0.18, 0.7, t + 0.06);
        // mecânica: recuo batendo no fim do curso e o tubo voltando (metal pesado)
        burst('bandpass', 2300, 9, 0.002, 0.3, 0.14, t + 0.24);
        thump(170, 105, 0.003, 0.28, 0.18, t + 0.24, 'square');
        burst('bandpass', 1700, 10, 0.002, 0.2, 0.12, t + 0.62);
        thump(120, 80, 0.003, 0.16, 0.14, t + 0.62, 'square');
        // eco: reflexões graves, cada vez mais abafadas e espaçadas, rolando até sumir
        burst('lowpass', 320, 0.6, 0.04, 1.0, 1.2, t + 0.32, drive);
        burst('lowpass', 230, 0.6, 0.07, 0.7, 1.6, t + 0.82);
        burst('lowpass', 170, 0.5, 0.1, 0.5, 2.0, t + 1.4);
        end = burst('lowpass', 120, 0.5, 0.15, 0.32, 2.4, t + 2.1);
        break;
      }
      case 'rocket': {
        // foguete da salva: estalo da ignição e um sopro que sobe de tom e some
        burst('highpass', 2200, 0.8, 0.002, 0.5, 0.08);
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.4;
        f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.55);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.65, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        n.connect(f).connect(g).connect(out);
        n.start(t);
        n.stop(t + 0.75);
        nodes.push(n);
        end = t + 0.75;
        break;
      }
      case 'flak':
        end = burst('bandpass', 1500, 2, 0.002, 0.6, 0.18);
        burst('highpass', 3000, 0.7, 0.001, 0.3, 0.05, t + 0.03);
        break;
      case 'vehicle_explosion':
      case 'vehicle_explosion_heavy': {
        // veículo destruído, cinematográfico, em camadas:
        //   estalo da detonação; bola de fogo saturada que abre e fecha (filtro varrendo do agudo ao grave);
        //   estrondo grave, o soco no peito e um subgrave longo; destroços de metal caindo (baques médios, sem
        //   tilintar agudo); o fogo crepitando; nos pesados, a munição cozinhando (estouros secundários).
        // Tudo também vai para a reverberação de campo aberto, e no fim o estrondo rola pelo terreno.
        const heavy = sound === 'vehicle_explosion_heavy';
        const p = heavy ? 1 : 0.75;
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * (heavy ? 0.55 : 0.42);
        mix.connect(wet).connect(this.outdoorReverb());
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(4.5);
        drive.oversample = '4x';
        const driveLow = ctx.createBiquadFilter();
        driveLow.type = 'lowpass';
        driveLow.frequency.value = 520;
        drive.connect(driveLow).connect(mix);
        // 1. estalo da detonação
        burst('highpass', 2600, 0.5, 0.0004, 1.6 * p, 0.035, t, mix);
        burst('bandpass', 1300, 0.7, 0.0006, 1.3 * p, 0.07, t, mix);
        // 2. bola de fogo: ruído saturado com o filtro fechando de 3,2 kHz até 260 Hz
        {
          const n = this.noiseSource();
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.Q.value = 0.8;
          f.frequency.setValueAtTime(3200 * vary, t);
          f.frequency.exponentialRampToValueAtTime(260, t + 0.9);
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(2.6);
          const g = ctx.createGain();
          n.connect(f).connect(sat).connect(g).connect(mix);
          this.env(g, t + 0.004, 0.012, 1.5 * p, heavy ? 1.3 : 1);
          n.start(t, Math.random());
          n.stop(t + 1.6);
          nodes.push(n);
        }
        // 3. estrondo: soco saturado e subgrave limpo e longo
        thump(120, 34, 0.004, 2.2 * p, 0.7, t, 'sine', drive);
        thump(72, 22, 0.008, 1.7 * p, 1.2, t, 'triangle', drive);
        burst('lowpass', 300, 0.8, 0.006, 1.6 * p, 0.8, t, drive);
        thump(48, 17, 0.015, 1.4 * p, heavy ? 2.2 : 1.6, t, 'sine', mix);
        // 4. destroços de metal caindo: baques médios espalhados
        const pieces = heavy ? 6 : 4;
        for (let i = 0; i < pieces; i++) {
          const at = t + 0.25 + Math.random() * (heavy ? 1.3 : 0.9);
          const k = (0.25 + Math.random() * 0.25) * p * (1 - i / (pieces * 1.6));
          burst('bandpass', 700 + Math.random() * 900, 5, 0.001, k, 0.06 + Math.random() * 0.06, at, mix);
          thump(190 + Math.random() * 80, 110, 0.001, k * 0.8, 0.07, at, 'square', mix);
          burst('lowpass', 240, 0.7, 0.002, k * 0.9, 0.12, at, mix);
        }
        // 5. fogo: sopro que fica e estalos curtos e irregulares
        burst('bandpass', 520, 0.6, 0.25, 0.32 * p, heavy ? 2.6 : 1.8, t + 0.2, mix);
        const crackles = heavy ? 18 : 11;
        for (let i = 0; i < crackles; i++) {
          const at = t + 0.3 + Math.random() * (heavy ? 2.4 : 1.6);
          burst('bandpass', 1400 + Math.random() * 1600, 1.4, 0.0008, (0.08 + Math.random() * 0.1) * p, 0.015 + Math.random() * 0.02, at, mix);
        }
        // 6. munição cozinhando nos veículos pesados: estouros secundários, menores, depois do primeiro
        if (heavy)
          for (let i = 0; i < 3; i++) {
            const at = t + 0.55 + i * 0.35 + Math.random() * 0.4;
            const k = 0.6 - i * 0.12;
            burst('bandpass', 1100, 0.7, 0.0008, k, 0.06, at, mix);
            burst('lowpass', 800, 0.6, 0.003, k * 0.9, 0.35, at, drive);
            thump(110, 40, 0.003, k * 1.2, 0.3, at, 'sine', drive);
          }
        // 7. o estrondo rolando pelo terreno
        burst('lowpass', 380, 0.6, 0.05, 0.55 * p, 1.0, t + 0.35, mix);
        burst('lowpass', 220, 0.5, 0.1, 0.4 * p, 1.6, t + 0.85, mix);
        end = burst('lowpass', 140, 0.5, 0.2, 0.28 * p, heavy ? 2.6 : 2, t + 1.5, mix);
        break;
      }
      case 'explosion':
        end = burst('lowpass', 700, 0.6, 0.006, 1, 0.9);
        thump(80, 30, 0.01, 0.8, 0.6);
        break;
      case 'explosion_big':
      case 'bomb':
        end = burst('lowpass', 520, 0.6, 0.01, 1.2, 1.8);
        thump(60, 22, 0.02, 1.1, 1.3);
        burst('bandpass', 2400, 0.9, 0.002, 0.4, 0.2);
        break;
      case 'jet': {
        // passagem: ruído de turbina que sobe e desce com leve efeito de aproximação
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 0.8;
        f.frequency.setValueAtTime(700, t);
        f.frequency.linearRampToValueAtTime(1800, t + 1.1);
        f.frequency.linearRampToValueAtTime(500, t + 2.6);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.7, t + 1.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        n.connect(f).connect(g).connect(out);
        n.start(t);
        n.stop(t + 2.9);
        nodes.push(n);
        end = t + 2.9;
        break;
      }
      case 'missile_launch': {
        // ignição e rugido do motor (3 s): ruído grave que abre e um estalo inicial
        burst('highpass', 2500, 0.7, 0.002, 0.8, 0.12);
        thump(70, 40, 0.01, 1, 0.6);
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 1.2);
        f.frequency.exponentialRampToValueAtTime(900, t + 3.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1.1, t + 0.25);
        g.gain.setValueAtTime(1.1, t + 1.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
        n.connect(f).connect(g).connect(out);
        n.start(t);
        n.stop(t + 3.9);
        nodes.push(n);
        end = t + 3.9;
        break;
      }
      case 'dome_launch': {
        // interceptador saindo do tubo: o estalo da ignição e o baque grave da carga de expulsão, e o motor sólido
        // rasgando para cima, um sopro que sobe de tom e some ao longe; com eco de campo aberto
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.45;
        mix.connect(wet).connect(this.outdoorReverb());
        burst('highpass', 1700, 0.6, 0.0006, 1.1, 0.05, t, mix);
        burst('bandpass', 700, 0.8, 0.001, 0.9, 0.12, t, mix);
        thump(120, 42, 0.002, 1.2, 0.3, t, 'sine', mix);
        {
          const n = this.noiseSource();
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = 0.9;
          f.frequency.setValueAtTime(380, t);
          f.frequency.exponentialRampToValueAtTime(1500, t + 0.9);
          f.frequency.exponentialRampToValueAtTime(700, t + 2.2);
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(2);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(1.0, t + 0.06);
          g.gain.exponentialRampToValueAtTime(0.45, t + 0.8);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
          n.connect(f).connect(sat).connect(g).connect(mix);
          n.start(t, Math.random());
          n.stop(t + 2.5);
          nodes.push(n);
        }
        end = burst('lowpass', 300, 0.6, 0.02, 0.45, 0.9, t + 0.05, mix);
        break;
      }
      case 'dome_intercept': {
        // interceptação no alto: o estalo seco e muito forte da explosão, o estrondo que vem do céu, abafado pela
        // distância, e o eco rolando pelo terreno; com bastante reverberação de campo aberto
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.7;
        mix.connect(wet).connect(this.outdoorReverb());
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(4);
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 380;
        drive.connect(low).connect(mix);
        const a = t + 0.08;
        burst('highpass', 1900, 0.5, 0.0004, 1.8, 0.05, a, mix);
        burst('bandpass', 1000, 0.6, 0.0008, 1.4, 0.16, a, mix);
        burst('highpass', 1400, 0.6, 0.0006, 0.8, 0.05, a + 0.03, mix);
        thump(95, 30, 0.003, 2.0, 0.7, a, 'sine', drive);
        thump(55, 20, 0.01, 1.4, 1.4, a, 'triangle', drive);
        burst('lowpass', 520, 0.6, 0.004, 1.2, 0.8, a, drive);
        burst('lowpass', 360, 0.6, 0.05, 0.55, 1.2, a + 0.45, mix);
        burst('lowpass', 240, 0.5, 0.1, 0.38, 1.8, a + 1.1, mix);
        end = burst('lowpass', 160, 0.5, 0.2, 0.25, 2.4, a + 2, mix);
        break;
      }
      case 'space_prelaunch': {
        // contagem do Programa Espacial (10 s até a decolagem, sincronizada com a animação): o ronco mecânico grave das
        // bombas de propelente; o sopro do oxigênio líquido nos respiros; o braço da tripulação recolhendo (hidráulica
        // e o baque metálico no fim, −7,5 a −5,5 s); válvulas batendo (−5, −4,1 e −3,8 s); a água da supressão acústica
        // (−3,6 s) e a ignição a −2,2 s: o baque grave e o ronco que nasce, ainda com o foguete preso.
        const T0 = t + 10;
        const at = (rel: number) => T0 + rel;
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.4;
        mix.connect(wet).connect(this.outdoorReverb());
        // ronco das bombas: dois tons graves batendo entre si, filtrados, e um ruído grave por baixo
        const pumpG = ctx.createGain();
        pumpG.gain.setValueAtTime(0.0001, t);
        pumpG.gain.exponentialRampToValueAtTime(0.15, t + 1.5);
        pumpG.gain.setValueAtTime(0.15, at(-2.4));
        pumpG.gain.exponentialRampToValueAtTime(0.0001, at(-1.4));
        const pumpF = ctx.createBiquadFilter();
        pumpF.type = 'lowpass';
        pumpF.frequency.value = 160;
        pumpF.connect(pumpG).connect(mix);
        for (const f of [41, 43.5, 82]) {
          const o = ctx.createOscillator();
          o.type = f > 80 ? 'triangle' : 'sawtooth';
          o.frequency.value = f;
          o.connect(pumpF);
          o.start(t);
          o.stop(at(-1.3));
          nodes.push(o);
        }
        {
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 220;
          f.Q.value = 1.2;
          const g = ctx.createGain();
          g.gain.value = 0.35;
          n.connect(f).connect(g).connect(pumpG);
          n.start(t, Math.random());
          n.stop(at(-1.3));
          nodes.push(n);
        }
        // respiros de oxigênio: sopros médios, sem agudo estridente
        for (let rel = -9.6; rel < -2.6; rel += 1.1 + Math.random() * 0.7) burst('bandpass', 1100 + Math.random() * 400, 0.9, 0.12, 0.16, 0.7 + Math.random() * 0.4, at(rel), mix);
        // braço da tripulação: motor hidráulico subindo e descendo de tom e o baque no fim do curso
        {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(95, at(-7.5));
          o.frequency.linearRampToValueAtTime(140, at(-6.8));
          o.frequency.setValueAtTime(140, at(-6));
          o.frequency.linearRampToValueAtTime(90, at(-5.5));
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 420;
          f.Q.value = 1.6;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at(-7.5));
          g.gain.exponentialRampToValueAtTime(0.14, at(-7.2));
          g.gain.setValueAtTime(0.14, at(-5.7));
          g.gain.exponentialRampToValueAtTime(0.0001, at(-5.45));
          o.connect(f).connect(g).connect(mix);
          o.start(at(-7.5));
          o.stop(at(-5.4));
          nodes.push(o);
        }
        burst('bandpass', 600, 4, 0.002, 0.45, 0.18, at(-5.5), mix);
        thump(140, 70, 0.002, 0.6, 0.25, at(-5.5), 'sine', mix);
        // válvulas: baques metálicos curtos com o sopro do gás
        for (const rel of [-5.0, -4.1, -3.8]) {
          burst('bandpass', 800, 5, 0.001, 0.3, 0.08, at(rel), mix);
          thump(210, 120, 0.001, 0.3, 0.07, at(rel), 'square', mix);
          burst('bandpass', 1000, 0.8, 0.01, 0.1, 0.35, at(rel) + 0.02, mix);
        }
        // água da supressão acústica: jorro grave e cheio que cresce e fica
        {
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 1300;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at(-3.6));
          g.gain.exponentialRampToValueAtTime(0.32, at(-2.8));
          g.gain.setValueAtTime(0.32, at(0.2));
          g.gain.exponentialRampToValueAtTime(0.0001, at(0.6));
          n.connect(f).connect(g).connect(mix);
          n.start(at(-3.6), Math.random());
          n.stop(at(0.7));
          nodes.push(n);
        }
        // ignição: baque grave saturado e o ronco nascendo (o foguete ainda preso), que passa a vez ao som da subida
        {
          const ig = at(-2.2);
          const drive = ctx.createWaveShaper();
          drive.curve = this.driveCurve(3.5);
          const low = ctx.createBiquadFilter();
          low.type = 'lowpass';
          low.frequency.value = 240;
          drive.connect(low).connect(mix);
          thump(62, 24, 0.01, 1.8, 1.4, ig, 'sine', drive);
          burst('lowpass', 500, 0.6, 0.015, 1.1, 0.8, ig, drive);
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(260, ig);
          f.frequency.exponentialRampToValueAtTime(900, at(0));
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(2.2);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, ig);
          g.gain.exponentialRampToValueAtTime(0.9, ig + 0.6);
          g.gain.setValueAtTime(0.9, at(0.05));
          g.gain.exponentialRampToValueAtTime(0.0001, at(0.5));
          n.connect(f).connect(sat).connect(g).connect(mix);
          n.start(ig, Math.random());
          n.stop(at(0.6));
          nodes.push(n);
          const sub = ctx.createOscillator();
          sub.type = 'sine';
          sub.frequency.value = 34;
          const sg = ctx.createGain();
          sg.gain.setValueAtTime(0.0001, ig);
          sg.gain.exponentialRampToValueAtTime(0.8, ig + 0.8);
          sg.gain.setValueAtTime(0.8, at(0.05));
          sg.gain.exponentialRampToValueAtTime(0.0001, at(0.5));
          sub.connect(sg).connect(mix);
          sub.start(ig);
          sub.stop(at(0.6));
          nodes.push(sub);
        }
        end = at(0.7);
        break;
      }
      case 'space_liftoff': {
        // decolagem e subida (do 0 s em diante, sincronizada com a animação). Ronco grave contínuo e saturado, o
        // estalo característico do jato (`rocketCrackleBuffer`), a turbulência do ar (ondulação irregular) e o
        // subgrave. A força cresce enquanto o foguete sai da plataforma (até ~4 s); depois o som se afasta, abafa (o
        // filtro fecha) e baixa, com os reflexos do terreno e o ronco distante rolando no fim.
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.55;
        mix.connect(wet).connect(this.outdoorReverb());
        // envelope comum: cresce até 4 s, sustenta e some ao longe até ~24 s
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.85, t + 0.25);
        env.gain.linearRampToValueAtTime(1, t + 4);
        env.gain.setValueAtTime(1, t + 6);
        env.gain.exponentialRampToValueAtTime(0.35, t + 12);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 24);
        env.connect(mix);
        // distância: o filtro fecha conforme o foguete sobe
        const dist = ctx.createBiquadFilter();
        dist.type = 'lowpass';
        dist.frequency.setValueAtTime(5200, t);
        dist.frequency.setValueAtTime(5200, t + 4);
        dist.frequency.exponentialRampToValueAtTime(900, t + 12);
        dist.frequency.exponentialRampToValueAtTime(260, t + 22);
        dist.connect(env);
        // turbulência: ondulações lentas e irregulares no volume do ronco
        const turb = ctx.createGain();
        turb.gain.value = 1;
        for (const [f, depth] of [
          [0.7, 0.16],
          [1.9, 0.1],
          [3.3, 0.06],
        ] as const) {
          const lfo = ctx.createOscillator();
          lfo.frequency.value = f * (0.9 + Math.random() * 0.2);
          const lg = ctx.createGain();
          lg.gain.value = depth;
          lfo.connect(lg).connect(turb.gain);
          lfo.start(t);
          lfo.stop(t + 24.5);
          nodes.push(lfo);
        }
        turb.connect(dist);
        // ronco: ruído grave saturado e um corpo médio
        {
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 420;
          f.Q.value = 0.6;
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(3);
          sat.oversample = '2x';
          const g = ctx.createGain();
          g.gain.value = 1.1;
          n.connect(f).connect(sat).connect(g).connect(turb);
          n.start(t, Math.random());
          n.stop(t + 24.5);
          nodes.push(n);
          const m = this.noiseSource(true);
          const mf = ctx.createBiquadFilter();
          mf.type = 'bandpass';
          mf.frequency.value = 900;
          mf.Q.value = 0.5;
          const mg = ctx.createGain();
          mg.gain.value = 0.45;
          m.connect(mf).connect(mg).connect(turb);
          m.start(t, Math.random());
          m.stop(t + 24.5);
          nodes.push(m);
        }
        // estalos do jato: mais fortes da saída da plataforma até a subida, e somem com a distância
        {
          const src = ctx.createBufferSource();
          src.buffer = this.rocketCrackleBuffer();
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 300;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.7, t + 1.5);
          g.gain.setValueAtTime(0.9, t + 5);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 12);
          src.connect(hp).connect(g).connect(dist);
          src.start(t);
          src.stop(t + 12);
          nodes.push(src);
        }
        // subgrave
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(34, t);
        sub.frequency.linearRampToValueAtTime(28, t + 16);
        const sg = ctx.createGain();
        sg.gain.value = 0.85;
        sub.connect(sg).connect(env);
        sub.start(t);
        sub.stop(t + 24.5);
        nodes.push(sub);
        // reflexos do terreno e ronco distante rolando
        burst('lowpass', 300, 0.6, 0.3, 0.35, 2.5, t + 6, mix);
        burst('lowpass', 200, 0.5, 0.5, 0.3, 3.5, t + 11, mix);
        end = burst('lowpass', 140, 0.5, 0.8, 0.22, 5, t + 17, mix);
        break;
      }
      case 'nuclear_blast': {
        // detonação nuclear ouvida de longe, cinematográfica. O clarão vem antes (a luz chega primeiro) e o som chega
        // depois de `d`, sem o estalo agudo, que a distância come. Chegam:
        //   o estrondo abafado e enorme: soco grave saturado e um subgrave que dura segundos;
        //   o ronco que incha e se sustenta, ondulando devagar (a bola de fogo subindo);
        //   o vento da onda de choque passando (sopro que sobe e desce de tom);
        //   estalos distantes e baixos (coisas quebrando longe);
        //   o trovão rolando pelo terreno em ondas cada vez mais graves e espaçadas.
        // Quase tudo vai também para a reverberação de campo aberto, bem mais forte que nos outros sons.
        const d = 0.75;
        const a = t + d;
        const mix = ctx.createGain();
        mix.gain.value = 0.85;
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.8;
        mix.connect(wet).connect(this.outdoorReverb());
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(4);
        drive.oversample = '4x';
        const driveLow = ctx.createBiquadFilter();
        driveLow.type = 'lowpass';
        driveLow.frequency.value = 200;
        drive.connect(driveLow).connect(mix);
        // estrondo abafado
        burst('lowpass', 420, 0.6, 0.02, 1.4, 1.2, a, mix);
        thump(70, 20, 0.02, 2.4, 2.2, a, 'sine', drive);
        thump(44, 15, 0.05, 2.0, 4.5, a, 'triangle', drive);
        thump(32, 12, 0.12, 1.5, 6.5, a, 'sine', mix);
        // ronco que incha e ondula
        {
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(320, a);
          f.frequency.exponentialRampToValueAtTime(160, a + 6);
          f.frequency.exponentialRampToValueAtTime(90, a + 13);
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(2.4);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, a);
          g.gain.exponentialRampToValueAtTime(1.5, a + 1.4);
          g.gain.setValueAtTime(1.5, a + 3.5);
          g.gain.exponentialRampToValueAtTime(0.0001, a + 14);
          // ondulação lenta (o rumor rolando)
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.45;
          const lg = ctx.createGain();
          lg.gain.value = 0.35;
          const wob = ctx.createGain();
          wob.gain.value = 1;
          lfo.connect(lg).connect(wob.gain);
          n.connect(f).connect(sat).connect(wob).connect(g).connect(mix);
          n.start(a, Math.random());
          n.stop(a + 14.2);
          lfo.start(a);
          lfo.stop(a + 14.2);
          nodes.push(n, lfo);
        }
        // vento da onda de choque
        {
          const n = this.noiseSource();
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = 0.9;
          f.frequency.setValueAtTime(260, a + 0.9);
          f.frequency.exponentialRampToValueAtTime(820, a + 2.3);
          f.frequency.exponentialRampToValueAtTime(300, a + 5.5);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, a + 0.9);
          g.gain.exponentialRampToValueAtTime(0.55, a + 2.2);
          g.gain.exponentialRampToValueAtTime(0.0001, a + 5.8);
          n.connect(f).connect(g).connect(mix);
          n.start(a + 0.9, Math.random());
          n.stop(a + 6);
          nodes.push(n);
        }
        // estalos distantes
        for (let i = 0; i < 14; i++) {
          const at = a + 1.5 + Math.random() * 7;
          const k = 0.05 + Math.random() * 0.07;
          burst('bandpass', 700 + Math.random() * 700, 1.2, 0.002, k, 0.05 + Math.random() * 0.05, at, mix);
        }
        // trovão rolando
        burst('lowpass', 300, 0.6, 0.15, 0.9, 2.2, a + 2.2, drive);
        thump(48, 20, 0.1, 0.9, 2.4, a + 2.2, 'sine', mix);
        burst('lowpass', 220, 0.5, 0.25, 0.7, 2.8, a + 4, mix);
        burst('lowpass', 170, 0.5, 0.35, 0.5, 3.4, a + 6.2, mix);
        thump(40, 18, 0.2, 0.6, 3, a + 6.2, 'sine', mix);
        end = burst('lowpass', 120, 0.5, 0.5, 0.35, 4.5, a + 9, mix);
        break;
      }
      case 'missile_impact': {
        // ogiva caindo no alvo, cinematográfica, em camadas:
        //   1. onda de choque: estalo duplo, seco e muito forte;
        //   2. bola de fogo: rugido saturado e longo, com o filtro fechando do agudo ao grave;
        //   3. pressão: soco grave saturado e um subgrave bem fundo que dura (treme o chão);
        //   4. destroços e terra caindo de volta (baques médios espalhados);
        //   5. trovão: o estrondo rolando pelo terreno em ondas cada vez mais graves e espaçadas.
        // Tudo vai também para a reverberação de campo aberto.
        const mix = ctx.createGain();
        mix.gain.value = 0.8;
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.6;
        mix.connect(wet).connect(this.outdoorReverb());
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(5);
        drive.oversample = '4x';
        const driveLow = ctx.createBiquadFilter();
        driveLow.type = 'lowpass';
        driveLow.frequency.value = 420;
        drive.connect(driveLow).connect(mix);
        // 1. onda de choque
        burst('highpass', 2200, 0.5, 0.0004, 2.0, 0.05, t, mix);
        burst('bandpass', 900, 0.6, 0.0006, 1.8, 0.12, t, mix);
        burst('highpass', 1600, 0.6, 0.0006, 1.2, 0.06, t + 0.035, mix);
        // 2. bola de fogo
        {
          const n = this.noiseSource();
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.Q.value = 0.7;
          f.frequency.setValueAtTime(4200 * vary, t);
          f.frequency.exponentialRampToValueAtTime(900, t + 0.6);
          f.frequency.exponentialRampToValueAtTime(180, t + 3.2);
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(3);
          const g = ctx.createGain();
          n.connect(f).connect(sat).connect(g).connect(mix);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(1.6, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.7, t + 0.8);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
          n.start(t, Math.random());
          n.stop(t + 3.7);
          nodes.push(n);
        }
        // 3. pressão
        thump(95, 26, 0.005, 2.4, 1.1, t, 'sine', drive);
        thump(60, 18, 0.01, 1.9, 1.8, t, 'triangle', drive);
        burst('lowpass', 240, 0.8, 0.008, 1.8, 1.4, t, drive);
        thump(38, 14, 0.03, 1.6, 3.2, t, 'sine', mix);
        // 4. destroços e terra caindo de volta
        for (let i = 0; i < 8; i++) {
          const at = t + 0.5 + Math.random() * 1.8;
          const k = (0.18 + Math.random() * 0.2) * (1 - i / 14);
          burst('bandpass', 500 + Math.random() * 800, 3, 0.002, k, 0.08 + Math.random() * 0.08, at, mix);
          burst('lowpass', 200, 0.7, 0.004, k * 1.1, 0.2, at, mix);
        }
        burst('bandpass', 2500, 0.6, 0.4, 0.12, 1.6, t + 0.6, mix);
        // 5. trovão rolando
        burst('lowpass', 420, 0.6, 0.06, 0.8, 1.2, t + 0.5, drive);
        burst('lowpass', 300, 0.5, 0.1, 0.6, 1.8, t + 1.3, mix);
        thump(52, 22, 0.05, 0.7, 1.6, t + 1.3, 'sine', mix);
        burst('lowpass', 210, 0.5, 0.18, 0.42, 2.4, t + 2.4, mix);
        end = burst('lowpass', 140, 0.5, 0.3, 0.3, 3.2, t + 3.6, mix);
        break;
      }
      case 'intercept':
        // estouro seco e alto no céu, sem o grave do impacto no solo
        end = burst('bandpass', 2200, 1.4, 0.001, 1, 0.5);
        thump(420, 160, 0.003, 0.5, 0.35, t, 'triangle');
        break;
    }
    if (!this.claim(PRIORITY[sound], end, () => nodes.forEach((n) => n.stop()))) nodes.forEach((n) => n.stop());
  }

  // ------------------------------------------------------------------ interface

  ui(sound: UiSound): void {
    if (!this.ready) return;
    if (!this.gap(`ui:${sound}`, 0.04)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.003;
    const out = this.out('ui', 1);
    const tone = (freq: number, at: number, dur: number, peak: number, type: OscillatorType = 'triangle', to?: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, at);
      if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
      const g = ctx.createGain();
      o.connect(g).connect(out);
      const end = this.env(g, at, 0.005, peak, dur);
      o.start(at);
      o.stop(end + 0.02);
    };
    switch (sound) {
      case 'click':
        tone(1250, t, 0.045, 0.18, 'square');
        break;
      case 'hold':
        tone(520, t, 0.06, 0.12, 'sine', 640);
        break;
      case 'confirm':
        tone(660, t, 0.09, 0.22);
        tone(990, t + 0.07, 0.12, 0.2);
        break;
      case 'success':
        tone(523, t, 0.1, 0.2);
        tone(659, t + 0.09, 0.1, 0.2);
        tone(784, t + 0.18, 0.18, 0.2);
        break;
      case 'error':
        tone(220, t, 0.14, 0.25, 'sawtooth', 170);
        break;
      case 'alert':
        tone(880, t, 0.12, 0.25, 'square');
        tone(660, t + 0.16, 0.16, 0.25, 'square');
        break;
    }
  }

  /** Sinais do silo próprio: preparação (bomba de combustível), armado (alarme contínuo) e autorização. */
  missileCue(cue: MissileCue, launchId: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const out = this.out('ui', 0.9);
    if (cue === 'prepare') {
      // abastecimento: pulsos graves de bomba durante a preparação
      for (let i = 0; i < 6; i++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(70 + i * 6, t + i * 0.45);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 300;
        const g = ctx.createGain();
        o.connect(f).connect(g).connect(out);
        const end = this.env(g, t + i * 0.45, 0.04, 0.35, 0.3);
        o.start(t + i * 0.45);
        o.stop(end + 0.02);
      }
      return;
    }
    if (cue === 'armed') {
      // armado: sirene mecânica de ataque (rotor) que sobe e desce sem parar até autorizar ou abortar. Dois rotores
      // um pouco desafinados entre si (o batimento dá o tremor de sirene de verdade), um pouco de saturação, o
      // ronco do motor por baixo e um klaxon grave pulsando entre as ondas; com eco de campo aberto.
      this.stopAlarm();
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, t);
      bus.gain.exponentialRampToValueAtTime(1, t + 1.2);
      bus.connect(out);
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      bus.connect(wet).connect(this.outdoorReverb());
      const sat = ctx.createWaveShaper();
      sat.curve = this.driveCurve(1.8);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 0.8;
      const sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.45;
      sat.connect(band).connect(sirenGain).connect(bus);
      // o tom da sirene sobe e desce entre ~260 e ~760 Hz (onda de 3,2 s), começando de baixo (o rotor ganhando giro)
      const wail = ctx.createOscillator();
      wail.type = 'sine';
      wail.frequency.value = 1 / 3.2;
      const depth = ctx.createGain();
      depth.gain.value = 250;
      wail.connect(depth);
      const rotors: OscillatorNode[] = [];
      for (const detune of [0, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(120, t);
        o.frequency.linearRampToValueAtTime(510, t + 1.4);
        o.detune.value = detune * 10;
        depth.connect(o.frequency);
        o.connect(sat);
        rotors.push(o);
      }
      // ronco do motor da sirene
      const motor = ctx.createOscillator();
      motor.type = 'triangle';
      motor.frequency.setValueAtTime(30, t);
      motor.frequency.linearRampToValueAtTime(58, t + 1.4);
      const mg = ctx.createGain();
      mg.gain.value = 0.12;
      motor.connect(mg).connect(bus);
      const all = [wail, ...rotors, motor];
      for (const o of all) o.start(t);
      // klaxon grave entre as ondas da sirene
      const klaxon = () => {
        const at = ctx.currentTime + 0.02;
        for (const [k, f] of [180, 226].entries()) {
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = f;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1200;
          const g = ctx.createGain();
          o.connect(lp).connect(g).connect(bus);
          const end = this.env(g, at + k * 0.02, 0.02, 0.07, 0.45);
          o.start(at + k * 0.02);
          o.stop(end + 0.05);
        }
      };
      const first = window.setTimeout(klaxon, 1600);
      const timer = window.setInterval(klaxon, 3200);
      this.alarm = {
        id: launchId,
        stop: () => {
          // desligada, a sirene desce de tom e some (o rotor perdendo giro)
          window.clearTimeout(first);
          window.clearInterval(timer);
          const now = ctx.currentTime;
          for (const o of rotors) {
            o.frequency.cancelScheduledValues(now);
            o.frequency.setValueAtTime(o.frequency.value, now);
            o.frequency.exponentialRampToValueAtTime(70, now + 2.2);
          }
          depth.gain.setTargetAtTime(0, now, 0.3);
          bus.gain.cancelScheduledValues(now);
          bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
          bus.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
          for (const o of all) o.stop(now + 2.5);
        },
      };
      return;
    }
    // autorização: três toques fortes de klaxon de lançamento (acorde áspero e saturado), com eco
    this.stopAlarm();
    const bus = ctx.createGain();
    bus.connect(out);
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    bus.connect(wet).connect(this.outdoorReverb());
    const sat = ctx.createWaveShaper();
    sat.curve = this.driveCurve(2.5);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.9;
    sat.connect(band).connect(bus);
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.62;
      for (const f of [330, 415, 494]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.94, at);
        o.frequency.linearRampToValueAtTime(f, at + 0.06);
        const g = ctx.createGain();
        o.connect(g).connect(sat);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.32, at + 0.03);
        g.gain.setValueAtTime(0.32, at + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        o.start(at);
        o.stop(at + 0.55);
      }
    }
  }

  /** Encerra o alarme de "armado" (de um lançamento, ou qualquer um). */
  stopAlarm(launchId?: number): void {
    if (!this.alarm || (launchId !== undefined && this.alarm.id !== launchId)) return;
    this.alarm.stop();
    this.alarm = null;
  }

  // ------------------------------------------------------------------ produção (edifício selecionado)

  /** Som de trabalho do edifício selecionado (null para nenhum), com entrada e saída suaves. */
  setProduction(kind: ProductionSound | null): void {
    if (!this.ready) return;
    if (this.production?.kind === kind) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (this.production) {
      const old = this.production;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + 0.6);
      window.setTimeout(old.stop, 700);
      this.production = null;
    }
    if (!kind) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 0.8);
    gain.connect(this.buses.get('production')!);
    this.production = { kind, gain, stop: this.productionLoop(kind, gain) };
  }

  private productionLoop(kind: ProductionSound, out: GainNode): () => void {
    const ctx = this.ctx!;
    const stops: (() => void)[] = [];
    const drone = (
      type: OscillatorType,
      freq: number,
      level: number,
      filter?: { type: BiquadFilterType; freq: number; q?: number },
      lfo?: { rate: number; depth: number; target: 'freq' | 'gain' },
    ) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      let node: AudioNode = o;
      if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = filter.type;
        f.frequency.value = filter.freq;
        f.Q.value = filter.q ?? 1;
        o.connect(f);
        node = f;
      }
      node.connect(g).connect(out);
      if (lfo) {
        const l = ctx.createOscillator();
        l.frequency.value = lfo.rate;
        const d = ctx.createGain();
        d.gain.value = lfo.depth;
        l.connect(d).connect(lfo.target === 'freq' ? o.frequency : g.gain);
        l.start();
        stops.push(() => l.stop());
      }
      o.start();
      stops.push(() => o.stop());
    };
    const hiss = (type: BiquadFilterType, freq: number, level: number, q = 0.8, lfo?: { rate: number; depth: number }) => {
      const n = this.noiseSource(true);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      n.connect(f).connect(g).connect(out);
      if (lfo) {
        const l = ctx.createOscillator();
        l.frequency.value = lfo.rate;
        const d = ctx.createGain();
        d.gain.value = lfo.depth;
        l.connect(d).connect(g.gain);
        l.start();
        stops.push(() => l.stop());
      }
      n.start();
      stops.push(() => n.stop());
    };
    /** Batida periódica (martelo, britador, vagonete), com leve variação. */
    const knock = (every: number, freq: number, level: number, decay: number) => {
      const timer = window.setInterval(() => {
        const t = ctx.currentTime + 0.01;
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq * (0.9 + Math.random() * 0.2);
        f.Q.value = 2;
        const g = ctx.createGain();
        n.connect(f).connect(g).connect(out);
        const end = this.env(g, t, 0.004, level, decay);
        n.start(t, Math.random());
        n.stop(end + 0.02);
      }, every * 1000);
      stops.push(() => window.clearInterval(timer));
    };
    switch (kind) {
      case 'saw':
        drone('sawtooth', 190, 0.05, { type: 'bandpass', freq: 2400, q: 3 }, { rate: 0.25, depth: 25, target: 'freq' });
        hiss('highpass', 3500, 0.05, 0.7, { rate: 0.5, depth: 0.03 });
        drone('sine', 55, 0.08);
        break;
      case 'quarry':
        hiss('lowpass', 400, 0.18, 0.7, { rate: 0.7, depth: 0.08 });
        knock(0.9, 900, 0.35, 0.18);
        break;
      case 'mine':
        hiss('lowpass', 250, 0.15);
        drone('triangle', 48, 0.09, undefined, { rate: 0.4, depth: 0.03, target: 'gain' });
        knock(1.7, 1400, 0.25, 0.12);
        break;
      case 'factory':
        drone('sawtooth', 60, 0.05, { type: 'lowpass', freq: 400 });
        hiss('bandpass', 1200, 0.06, 1.2);
        knock(1.2, 600, 0.3, 0.2);
        break;
      case 'pump':
        drone('sine', 42, 0.12, undefined, { rate: 0.22, depth: 0.1, target: 'gain' });
        hiss('lowpass', 300, 0.06, 0.7, { rate: 0.22, depth: 0.05 });
        break;
      case 'farm':
        drone('sawtooth', 38, 0.05, { type: 'lowpass', freq: 220 }, { rate: 6, depth: 4, target: 'freq' });
        hiss('highpass', 4000, 0.02);
        break;
      case 'jet_idle':
        hiss('bandpass', 2600, 0.08, 1.5, { rate: 0.1, depth: 0.03 });
        drone('sine', 120, 0.04, undefined, { rate: 0.3, depth: 6, target: 'freq' });
        break;
      case 'port':
        hiss('lowpass', 600, 0.12, 0.6, { rate: 0.15, depth: 0.08 });
        knock(2.6, 500, 0.22, 0.3);
        break;
      case 'office':
        drone('sine', 110, 0.03);
        hiss('bandpass', 900, 0.03, 0.6);
        break;
      case 'hum':
        drone('sine', 100, 0.05);
        drone('sine', 150, 0.02);
        break;
    }
    return () => stops.forEach((s) => s());
  }

  // ------------------------------------------------------------------ ambiente e música

  /** Vento e campo, sempre baixos, durante a partida. */
  startAmbient(): void {
    if (!this.ready || this.ambient) return;
    const ctx = this.ctx!;
    const out = this.out('ambient', 1);
    const n = this.noiseSource(true);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 180;
    lfo.connect(depth).connect(f.frequency);
    n.connect(f).connect(g).connect(out);
    n.start();
    lfo.start();
    this.ambient = {
      stop: () => {
        n.stop();
        lfo.stop();
      },
    };
  }

  /** Trilha ambiente procedural: acordes lentos e suaves (não compete com os efeitos). */
  startMusic(): void {
    if (!this.ready || this.music) return;
    const ctx = this.ctx!;
    const out = this.out('music', 1);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    f.connect(out);
    // Lá menor → Fá → Dó → Sol (progressão modal, 8 s por acorde)
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [130.81, 196, 261.63],
      [196, 246.94, 293.66],
    ];
    let i = 0;
    const play = () => {
      const t = ctx.currentTime + 0.05;
      for (const freq of chords[i % chords.length]!) {
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = freq;
          o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.05, t + 2.5);
          g.gain.setValueAtTime(0.05, t + 6);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 8.8);
          o.connect(g).connect(f);
          o.start(t);
          o.stop(t + 9);
        }
      }
      i++;
    };
    play();
    this.musicTimer = window.setInterval(play, 8000);
    this.music = { stop: () => window.clearInterval(this.musicTimer) };
  }

  /** Fim da partida: silencia laços (ambiente, música, produção e alarme). */
  stopAll(): void {
    this.ambient?.stop();
    this.ambient = null;
    this.music?.stop();
    this.music = null;
    this.stopAlarm();
    if (this.production) {
      this.production.stop();
      this.production = null;
    }
    for (const v of this.voices) v.stop();
    this.voices.length = 0;
  }
}

/** Instância única do jogo. */
export const audio = new AudioService();
