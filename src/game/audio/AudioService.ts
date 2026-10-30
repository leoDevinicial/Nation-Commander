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
export type CombatSound = 'rifle' | 'cannon' | 'howitzer' | 'tower' | 'explosion' | 'explosion_big' | 'jet' | 'bomb' | 'flak' | 'missile_launch' | 'missile_impact' | 'intercept' | 'rocket' | 'aa_gun' | 'aa_twin' | 'tank_gun' | 'gatling';
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
const MIN_GAP: Partial<Record<CombatSound, number>> = { rifle: 0.12, tower: 0.06, cannon: 0.08, howitzer: 0.35, rocket: 0.05, explosion: 0.06, flak: 0.05, jet: 0.4, aa_gun: 0.45, aa_twin: 0.4, gatling: 0.5, tank_gun: 0.18 };

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
      case 'aa_twin': {
        // canhões gêmeos de 30 mm (antiaérea do Futuro Próximo): dois disparos pesados e separados, um de cada cano.
        // Cada um tem cinco camadas que chegam juntas e somem em tempos diferentes:
        //   1. estalo supersônico: o "crack" seco e muito brilhante do projétil rompendo a barreira do som;
        //   2. sopro da boca: os gases saindo do cano, saturados (é o que dá o peso agressivo);
        //   3. soco grave: o recuo do cano e a onda de pressão que se sente no peito;
        //   4. subgrave: a pressão bem funda que treme o chão, mais longa que o resto;
        //   5. mecânica: o ferrolho batendo no fim do curso (grave e curto, sem tilintar agudo).
        // Os tiros vão também para a reverberação de campo aberto (eco do terreno), e no fim o estrondo rola longe.
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.32;
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
        for (let i = 0; i < 2; i++) {
          const at = t + i * gap;
          // o segundo cano: um pouco mais grave e um fio mais fraco (nada soa colado)
          const k = i === 0 ? 1 : 0.93;
          const f = i === 0 ? 1 : 0.91;
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
          thump(56 * f, 26, 0.006, 1.3 * k, 0.55, at, 'sine', mix);
          // 5. mecânica: ferrolho batendo no fim do curso
          burst('bandpass', 2300, 9, 0.0008, 0.42 * k, 0.045, at + 0.052, mix);
          thump(310, 190, 0.001, 0.28 * k, 0.045, at + 0.052, 'square', mix);
        }
        // eco do terreno: o estrondo volta abafado de longe, duas vezes, e rola até sumir
        const tail = t + gap;
        burst('lowpass', 480, 0.6, 0.02, 0.32, 0.45, tail + 0.36, mix);
        thump(64, 30, 0.015, 0.35, 0.5, tail + 0.36, 'sine', mix);
        burst('lowpass', 300, 0.5, 0.05, 0.24, 0.9, tail + 0.7, mix);
        end = burst('lowpass', 170, 0.5, 0.12, 0.16, 1.6, tail + 1.1, mix);
        break;
      }
      case 'gatling': {
        // Gatling de 20 mm do CIWS (~75 tiros por segundo): os disparos se fundem num rasgo contínuo ("brrrt")
        // em vez de tiros separados. Trem de pulsos quadrado na cadência, saturado e filtrado (o zumbido
        // rouco), ruído médio pulsando junto (o estampido de cada tiro), o giro do feixe de canos subindo e
        // descendo de tom, e o eco grave da rajada no fim
        const len = 0.55 + Math.random() * 0.2;
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(5);
        drive.oversample = '4x';
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 520;
        band.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
        g.gain.setValueAtTime(0.9, t + len - 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        drive.connect(band).connect(g).connect(out);
        const rate = 72 + Math.random() * 8;
        const pulse = ctx.createOscillator();
        pulse.type = 'square';
        pulse.frequency.setValueAtTime(rate * 0.8 * vary, t);
        pulse.frequency.linearRampToValueAtTime(rate * vary, t + 0.08);
        const pg = ctx.createGain();
        pg.gain.value = 1.2;
        pulse.connect(pg).connect(drive);
        pulse.start(t);
        pulse.stop(t + len + 0.05);
        nodes.push(pulse);
        // estampido: ruído médio modulado pela mesma cadência
        const n = this.noiseSource();
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 1500;
        nf.Q.value = 0.8;
        const am = ctx.createGain();
        am.gain.value = 0;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = rate * vary;
        const depth = ctx.createGain();
        depth.gain.value = 0.5;
        lfo.connect(depth).connect(am.gain);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.85, t + 0.02);
        ng.gain.setValueAtTime(0.85, t + len - 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + len);
        n.connect(nf).connect(am).connect(ng).connect(out);
        n.start(t, Math.random());
        n.stop(t + len + 0.05);
        lfo.start(t);
        lfo.stop(t + len + 0.05);
        nodes.push(n, lfo);
        // giro do feixe de canos (motor elétrico): sobe no começo e desce depois da rajada
        const whine = ctx.createOscillator();
        whine.type = 'sawtooth';
        whine.frequency.setValueAtTime(380 * vary, t - 0.02);
        whine.frequency.linearRampToValueAtTime(900 * vary, t + 0.12);
        whine.frequency.setValueAtTime(900 * vary, t + len);
        whine.frequency.exponentialRampToValueAtTime(260 * vary, t + len + 0.4);
        const wf = ctx.createBiquadFilter();
        wf.type = 'bandpass';
        wf.frequency.value = 1100;
        wf.Q.value = 3;
        const wg = ctx.createGain();
        whine.connect(wf).connect(wg).connect(out);
        this.env(wg, t, 0.06, 0.07, len + 0.35);
        whine.start(t - 0.02);
        whine.stop(t + len + 0.45);
        nodes.push(whine);
        thump(110, 40, 0.004, 0.9, 0.25, t, 'sine', drive);
        burst('lowpass', 380, 0.6, 0.04, 0.6, 0.9, t + len - 0.1);
        end = burst('lowpass', 200, 0.5, 0.1, 0.32, 1.4, t + len + 0.3);
        break;
      }
      case 'tank_gun': {
        // canhão de tanque (120–125 mm), seco: estalo supersônico e tapa do gás no mesmo instante,
        // um soco médio curto (pouco grave) com saturação leve, o "clac" do recuo e do carregador e
        // quase nenhum eco — o tiro corta, não ressoa
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(3);
        drive.oversample = '4x';
        const band = ctx.createBiquadFilter();
        band.type = 'highpass';
        band.frequency.value = 140;
        drive.connect(band).connect(out);
        // estampido seco e brilhante
        burst('highpass', 1800, 0.6, 0.0004, 2.2, 0.05);
        burst('bandpass', 4200, 0.9, 0.0004, 1.2, 0.03);
        burst('bandpass', 1200, 0.8, 0.0006, 1.6, 0.06, t + 0.006);
        // soco médio e curto (sem cauda grave)
        thump(190, 80, 0.001, 1.4, 0.09, t, 'square', drive);
        thump(130, 60, 0.001, 1.2, 0.14, t, 'triangle', drive);
        burst('bandpass', 700, 0.9, 0.0008, 1.5, 0.12, t, drive);
        // mecânica: recuo e carregador
        burst('bandpass', 2600, 10, 0.001, 0.3, 0.06, t + 0.14);
        thump(240, 150, 0.001, 0.25, 0.06, t + 0.14, 'square');
        burst('bandpass', 3400, 12, 0.001, 0.16, 0.04, t + 0.5);
        // reflexo curto e seco
        end = burst('bandpass', 900, 0.7, 0.01, 0.25, 0.25, t + 0.12);
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
      case 'missile_impact':
        // estrondo com cauda longa (rumor que se afasta)
        burst('highpass', 1800, 0.7, 0.002, 1, 0.25);
        thump(55, 18, 0.02, 1.4, 2.2);
        end = burst('lowpass', 380, 0.5, 0.015, 1.4, 3.2);
        break;
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
      // armado: dois tons alternados a cada 1,2 s até autorizar ou abortar
      this.stopAlarm();
      const osc: OscillatorNode[] = [];
      const beep = () => {
        const at = ctx.currentTime + 0.01;
        for (const [i, f] of [960, 720].entries()) {
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = f;
          const g = ctx.createGain();
          o.connect(g).connect(out);
          const end = this.env(g, at + i * 0.18, 0.005, 0.16, 0.14);
          o.start(at + i * 0.18);
          o.stop(end + 0.02);
          osc.push(o);
        }
      };
      beep();
      const timer = window.setInterval(beep, 1200);
      this.alarm = { id: launchId, stop: () => window.clearInterval(timer) };
      return;
    }
    // autorização: sirene ascendente curta
    this.stopAlarm();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.9);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    o.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    g.gain.setValueAtTime(0.3, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.start(t);
    o.stop(t + 1.15);
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
