/**
 * Serviço central de áudio (Fase 7). Os efeitos são sintetizados na hora com WebAudio; a música é a trilha sonora
 * original do jogo (04/11, `public/music/`), tocada em streaming pelo canal de música.
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
import { threatRank, type Threat } from './threat.ts';

export type Channel = 'music' | 'ui' | 'ambient' | 'combat' | 'production';

/** Faixas da trilha sonora original (04/11) e o ganho de cada uma no canal de música. */
type TrackId = 'horizon' | 'perimeter' | 'war' | 'zero';
const TRACKS: Record<TrackId, { file: string; calm: boolean; gain: number }> = {
  horizon: { file: 'architect-of-the-horizon.mp3', calm: true, gain: 0.85 },
  perimeter: { file: 'the-last-perimeter.mp3', calm: true, gain: 0.85 },
  war: { file: 'the-war-board.mp3', calm: false, gain: 0.85 },
  zero: { file: 'strike-at-zero.mp3', calm: false, gain: 0.8 },
};
/** Duração dos crossfades (s): subir de tensão é mais rápido que voltar à calma; entre faixas calmas, o meio-termo. */
const MUSIC_FADE = { up: 3, down: 5, calm: 4 };
interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  stoppedAt: number;
}
export const CHANNELS: Channel[] = ['music', 'ui', 'ambient', 'combat', 'production'];
export type Volumes = Record<Channel | 'master', number>;

export const DEFAULT_VOLUMES: Volumes = { master: 0.8, music: 0.35, ui: 0.7, ambient: 0.5, combat: 0.8, production: 0.6 };

export type UiSound = 'click' | 'confirm' | 'error' | 'alert' | 'success' | 'hold' | 'herald' | 'warning' | 'attack' | 'era';
export type CombatSound = 'rifle' | 'cannon' | 'howitzer' | 'tower' | 'explosion' | 'explosion_big' | 'jet' | 'bomb' | 'flak' | 'missile_launch' | 'missile_impact' | 'intercept' | 'rocket' | 'aa_gun' | 'aa_twin' | 'mbt_gun' | 'tank_gun' | 'vehicle_explosion' | 'vehicle_explosion_heavy' | 'nuclear_blast' | 'space_prelaunch' | 'space_liftoff' | 'dome_launch' | 'dome_intercept' | 'gatling' | 'bomber' | 'jet_cannon' | 'bomb_whistle' | 'carpet_rumble' | 'aam_launch' | 'agm_launch' | 'air_mg' | 'drone_pass' | 'apc_gun' | 'naval_gun' | 'torpedo' | 'torpedo_hit' | 'ship_sink';
/**
 * Só os sons grandes abaixam a música, e pouco (fração do volume dela). Tiro de fuzil, metralhadora e canhão leve não
 * mexem nela: quem faz o tiro aparecer é o filtro de combate (`MUSIC_EQ`), não o volume.
 */
const DUCK: Partial<Record<CombatSound, number>> = {
  explosion_big: 0.3,
  vehicle_explosion_heavy: 0.25,
  bomb: 0.3,
  carpet_rumble: 0.3,
  missile_impact: 0.35,
  nuclear_blast: 0.4,
  space_liftoff: 0.3,
};

/**
 * Espaço para a guerra na frequência (por estado de ameaça): em combate a música perde graves e médios, a região dos
 * tiros e explosões, sem mudar o volume aparente. Muda devagar, junto com o crossfade. Corte leve desde 04/11 (noite):
 * com −4/−5 dB, mais a faixa de guerra mais baixa, a música de combate sumia na caixinha do celular.
 */
/** Tiros e explosões mais à frente da música (04/11, noite, pedido do usuário): +3 dB no canal de combate. */
const COMBAT_BOOST = 1.4;

const MUSIC_EQ: Record<Threat, { low: number; mid: number }> = {
  calm: { low: 0, mid: 0 },
  combat: { low: -2, mid: -1.5 },
  massive: { low: -3, mid: -2.5 },
};

export type MissileCue = 'prepare' | 'armed' | 'authorize';

/** Som de trabalho de cada edifício (os demais usam o zumbido genérico). */
/** Classes de motor com laço próprio (lote 36): lagarta, rodas e navio. */
export type EngineClass = 'tracked' | 'wheeled' | 'naval';
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
  apc_gun: 2,
  cannon: 2,
  howitzer: 4,
  rocket: 2,
  jet: 2,
  bomber: 3,
  jet_cannon: 3,
  aam_launch: 4,
  drone_pass: 2,
  agm_launch: 4,
  air_mg: 2,
  bomb_whistle: 3,
  carpet_rumble: 5,
  explosion: 3,
  bomb: 4,
  explosion_big: 4,
  intercept: 5,
  missile_launch: 6,
  missile_impact: 6,
  naval_gun: 3,
  torpedo: 3,
  torpedo_hit: 5,
  ship_sink: 5,
};

/**
 * Efeitos gravados (04/11, `public/sfx/`, preparados por `scripts/sfx-preparar.py`): quando o arquivo já carregou, o
 * som de combate toca a gravação (variação sorteada, sem repetir a anterior, com leve variação de altura); enquanto
 * não carregou, ou se falhar, toca o som sintetizado de sempre. `rounds` repete o tiro único em sequência (rajada
 * curta de fuzil), com `interval` entre os disparos.
 */
export interface SampleSet {
  files: string[];
  gain: number;
  /** Peso no sorteio quando o som tem mais de um conjunto (padrão 1). */
  weight?: number;
  rate?: number;
  rounds?: [number, number];
  interval?: number;
  /**
   * Passagem de avião sobre um ronco contínuo gravado (lotes 11 e 13): volume que sobe até `peak` s e some até `dur` s,
   * e a altura que cai `drop` (fração) logo depois do pico (Doppler). O trecho do arquivo é sorteado.
   */
  pass?: { peak: number; dur: number; drop: number };
  /** Toca também o sintetizado, com este fator de volume (o grave das gravações some em caixinha pequena). */
  synth?: number;
  /** Segunda gravação somada (eco no céu do Domo), `delay` s depois, com o próprio ganho relativo. */
  layer?: { files: string[]; gain: number; delay: number };
  /** Começa `delay` s depois do pedido (contagem do Programa Espacial, que é pedida 10 s antes da decolagem). */
  delay?: number;
  /** Só neste idioma da tela, ou 'outros' (idioma sem gravação própria): a contagem gravada é falada. */
  lang?: 'en' | 'pt' | 'es' | 'outros';
}
const SFX = {
  tank: ['tanque-tiro-1', 'tanque-tiro-2', 'tanque-tiro-3', 'tanque-tiro-4', 'tanque-tiro-5'],
  explosion: ['explosao-grande-1', 'explosao-grande-2', 'explosao-grande-3'],
  launch: ['missil-lancamento-1', 'missil-lancamento-2', 'missil-lancamento-3', 'missil-lancamento-4'],
  impact: ['missil-impacto-1', 'missil-impacto-2', 'missil-impacto-3', 'missil-impacto-4'],
  mg: ['metralhadora-tiro-1', 'metralhadora-tiro-2', 'metralhadora-tiro-3', 'metralhadora-tiro-4'],
  burstShort: ['metralhadora-rajada-1', 'metralhadora-rajada-3'],
  burstLong: ['metralhadora-rajada-2', 'metralhadora-rajada-4'],
  distant: ['artilharia-distante-1', 'artilharia-distante-2', 'artilharia-distante-3', 'artilharia-distante-4', 'obus-distante'],
  powerDown: ['energia-desligando'],
  // lotes 9–32 (04/11)
  aaFast: ['antiaerea-rajada-1', 'antiaerea-rajada-2', 'antiaerea-rajada-3', 'antiaerea-rajada-4'],
  aaHeavy: ['antiaerea-continua-1', 'antiaerea-continua-2', 'antiaerea-continua-3', 'antiaerea-continua-4', 'antiaerea-continua-5', 'antiaerea-continua-6', 'antiaerea-continua-7'],
  aaTwin: ['antiaerea-era4-1', 'antiaerea-era4-2', 'antiaerea-era4-3'],
  vehicle: ['veiculo-explosao-1', 'veiculo-explosao-2', 'veiculo-explosao-3', 'veiculo-explosao-4'],
  vehicleHeavy: ['veiculo-explosao-pesada-1', 'veiculo-explosao-pesada-2'],
  jet: ['jato-voando-2', 'jato-voando-3', 'jato-voando-4'],
  bomberPass: ['bombardeiro-passagem'],
  bomber: ['bombardeiro-voando-2', 'bombardeiro-voando-3', 'bombardeiro-voando-4'],
  domeHit: ['domo-interceptacao-1', 'domo-interceptacao-2'],
  domeEcho: ['domo-eco-1', 'domo-eco-2'],
  domeLaunch: ['domo-lancamento-1', 'domo-lancamento-2', 'domo-lancamento-3'],
  intercept: ['interceptacao-no-ar-1', 'interceptacao-no-ar-2', 'interceptacao-no-ar-3', 'interceptacao-no-ar-4'],
  whistle: ['bomba-assobio-1', 'bomba-assobio-2', 'bomba-assobio-3', 'bomba-assobio-4'],
  carpet: ['bombardeio-tapete-1', 'bombardeio-tapete-2'],
  gatling: ['ciws-gatling-1', 'ciws-gatling-2', 'ciws-gatling-3', 'ciws-gatling-4'],
  nuclear: ['explosao-nuclear-1', 'explosao-nuclear-2', 'explosao-nuclear-3', 'explosao-nuclear-4'],
  apcShot: ['blindado-canhao-1', 'blindado-canhao-2'],
  apcBurst: ['blindado-canhao-3'],
  cannon: ['canhao-tiro-1', 'canhao-tiro-2', 'canhao-tiro-3', 'canhao-tiro-4'],
  howitzer: ['obus-tiro-1', 'obus-tiro-2', 'obus-tiro-3', 'obus-tiro-4'],
  small: ['explosao-pequena-1', 'explosao-pequena-2', 'explosao-pequena-3', 'explosao-pequena-4'],
  rocket: ['foguete-lancamento-1', 'foguete-lancamento-2', 'foguete-lancamento-3', 'foguete-lancamento-4'],
  salvo: ['foguete-salva'],
  tower: ['torre-defesa-1', 'torre-defesa-2'],
  jetCannon: ['caca-canhao-1', 'caca-canhao-2', 'caca-canhao-3'],
  aam: ['missil-ar-ar-1', 'missil-ar-ar-2', 'missil-ar-ar-3', 'missil-ar-ar-4'],
  // lote 33 (07/11, ElevenLabs): míssil ar-terra próprio, estouro antiaéreo, drone, silo, trovão e interface
  agm: ['missil-ar-terra-1', 'missil-ar-terra-2'],
  flak: ['antiaerea-estouro-1', 'antiaerea-estouro-2'],
  dronePass: ['drone-passagem-1', 'drone-passagem-2'],
  siloPrepare: ['silo-preparo-1', 'silo-preparo-2'],
  siloAuthorize: ['silo-autorizado-1', 'silo-autorizado-2'],
  thunder: ['trovao-1', 'trovao-2'],
  // bordo do drone de asa fixa (lote 34, em loop): hélice do turboélice e vento
  droneOnboard: ['drone-asa-fixa-1', 'drone-asa-fixa-2'],
  // marinha (lote 35): canhão da fragata, torpedo dos submarinos, a explosão na água e o navio afundando
  navalGun: ['canhao-naval-1', 'canhao-naval-2'],
  torpedo: ['torpedo-lancamento-1', 'torpedo-lancamento-2'],
  torpedoHit: ['explosao-agua-1', 'explosao-agua-2'],
  shipSink: ['navio-afundando-1', 'navio-afundando-2'],
  // motores andando (lote 36, em loop) e o apito do navio saindo do porto
  engineTracked: ['motor-lagarta-1', 'motor-lagarta-2'],
  engineWheeled: ['motor-rodas-1', 'motor-rodas-2'],
  shipUnderway: ['navio-navegando-1', 'navio-navegando-2'],
  shipHorn: ['navio-apito-1', 'navio-apito-2'],
  // sirene: o aviso curto "sob ataque" e as sirenes em loop do silo armado (o loop começa em `SIREN_LOOP` s)
  sirenAlert: ['sirene-aviso'],
  siren: ['sirene-loop-1', 'sirene-loop-2'],
  // vento (estéreo, em loop): brisas calmas de fundo e ventos mais fortes por cima
  breeze: ['vento-3', 'vento-4'],
  gust: ['vento-1', 'vento-2'],
  // clima (lote 33, estéreo, em loop): chuva e o vento frio da neve
  rain: ['chuva-1', 'chuva-2'],
  snowWind: ['vento-neve-1', 'vento-neve-2'],
};
/** Volumes das gravações fora do `SAMPLES` (vento: brisa e rajadas; ronco da salva; sirenes), calibrados no navegador. */
export const LEVELS = { breeze: 3.2, gust: 0.95, salvo: 0.5, siren: 2.2, alert: 0.45 };
/** Onde começa o loop de cada sirene (a parte antes é a subida do rotor; ver `LOOPS` em `scripts/sfx-preparar.py`). */
const SIREN_LOOP: Record<string, number> = { 'sirene-loop-1': 3.0, 'sirene-loop-2': 1.5 };
/**
 * Lote 33 (07/11): ganhos medidos offline contra o sintetizado que substituem (mesma energia média no canal, em
 * `scripts/sfx/calibrar.cjs`); interface e silo usam `UI_GAIN` e `SILO_GAIN` no `playExtra`.
 */
const AGM_GAIN = 0.75;
// o estouro sintetizado é quase inaudível (alto no céu): a gravação fica um pouco acima da energia dele
const FLAK_GAIN = 0.06;
const DRONE_PASS_GAIN = 1.33;
/** Ganhos calibrados no navegador (04/11) para ficar no nível do sintetizado que substituem (média do canal de combate). */
export const SAMPLES: Partial<Record<CombatSound, SampleSet | SampleSet[]>> = {
  mbt_gun: { files: SFX.tank, gain: 1.1, rate: 0.9 },
  tank_gun: { files: SFX.tank, gain: 0.5 },
  explosion_big: { files: SFX.explosion, gain: 1.35 },
  bomb: { files: SFX.explosion, gain: 1.8 },
  missile_launch: { files: SFX.launch, gain: 1.5 },
  missile_impact: { files: SFX.impact, gain: 2.6 },
  // infantaria: às vezes tiros únicos em sequência, às vezes uma rajada curta gravada
  rifle: [
    { files: SFX.mg, gain: 0.42, rounds: [3, 5], interval: 0.085, weight: 1 },
    { files: SFX.burstShort, gain: 0.45, weight: 1 },
  ],
  // metralhadora do caça: rajada gravada, mais rápida e aguda (cadência ~750 tiros/min)
  air_mg: { files: [...SFX.burstShort, ...SFX.burstLong], gain: 0.5, rate: 1.25 },
  // lotes 9–32 (04/11; `assets/sfx/CATALOGO.md`)
  aa_gun: [
    { files: SFX.aaFast, gain: 5.4, weight: 1 },
    { files: SFX.aaHeavy, gain: 6.2, weight: 1.5 },
  ],
  aa_twin: { files: SFX.aaTwin, gain: 2.45 },
  explosion: { files: SFX.small, gain: 0.8, rate: 1.02 },
  vehicle_explosion: { files: SFX.vehicle, gain: 2.85 },
  vehicle_explosion_heavy: [
    { files: SFX.vehicleHeavy, gain: 2.05, weight: 1.5 },
    { files: SFX.explosion, gain: 2.4, rate: 1.08, weight: 1 },
  ],
  jet: { files: SFX.jet, gain: 2.85, pass: { peak: 1.8, dur: 4.8, drop: 0.12 } },
  bomber: [
    { files: SFX.bomberPass, gain: 1.75, weight: 1.5 },
    { files: SFX.bomber, gain: 3.4, rate: 0.9, pass: { peak: 3.2, dur: 7.5, drop: 0.1 }, weight: 1 },
  ],
  dome_intercept: { files: SFX.domeHit, gain: 8, layer: { files: SFX.domeEcho, gain: 0.35, delay: 0.05 } },
  intercept: { files: SFX.intercept, gain: 0.25 },
  dome_launch: { files: SFX.domeLaunch, gain: 0.93 },
  bomb_whistle: { files: SFX.whistle, gain: 0.33 },
  // o trovão gravado é quase todo subgrave: o sintetizado (mais médio) fica por cima, mais baixo
  carpet_rumble: { files: SFX.carpet, gain: 1.25, synth: 0.5 },
  gatling: { files: SFX.gatling, gain: 2.6 },
  nuclear_blast: { files: SFX.nuclear, gain: 1.65, synth: 0.5 },
  // contagem: pedida 10 s antes da decolagem; o "zero" da gravação (~9,7 s) cai na decolagem da animação. Com o jogo
  // em inglês vai a voz; nos outros idiomas, só a partir da ignição. As bombas e válvulas do sintetizado seguem por baixo.
  space_prelaunch: [
    { files: ['espaco-contagem-en'], gain: 1.15, delay: 0.3, synth: 0.7, lang: 'en' },
    // português e espanhol (lote 33): a mesma ignição com "três, dois, um, ignição" por cima
    { files: ['espaco-contagem-pt'], gain: 1.2, delay: 2.6, synth: 0.7, lang: 'pt' },
    { files: ['espaco-contagem-es'], gain: 1.2, delay: 2.6, synth: 0.7, lang: 'es' },
    { files: ['espaco-ignicao'], gain: 1.2, delay: 2.6, synth: 0.7, lang: 'outros' },
  ],
  space_liftoff: { files: ['espaco-decolagem'], gain: 2.55 },
  // blindado: rajada de 3 tiros a ~0,3 s montada com tiros únicos, ou a rajada embolada gravada
  apc_gun: [
    { files: SFX.apcShot, gain: 0.46, rounds: [3, 3], interval: 0.3, weight: 2 },
    { files: SFX.apcBurst, gain: 0.41, weight: 1 },
  ],
  cannon: { files: SFX.cannon, gain: 0.35 },
  howitzer: { files: SFX.howitzer, gain: 5 },
  rocket: { files: SFX.rocket, gain: 0.1 },
  tower: { files: SFX.tower, gain: 0.073, rate: 1.03 },
  jet_cannon: { files: SFX.jetCannon, gain: 3.45 },
  aam_launch: { files: SFX.aam, gain: 0.47 },
  agm_launch: { files: SFX.agm, gain: AGM_GAIN },
  flak: { files: SFX.flak, gain: FLAK_GAIN },
  drone_pass: { files: SFX.dronePass, gain: DRONE_PASS_GAIN },
  // marinha (lote 35): o sintetizado de reserva (canhão) é fraco, então o nível vem das gravações vizinhas: o canhão
  // naval fica entre o tiro do tanque e o do MBT, o torpedo abaixo, a explosão na água e o naufrágio no nível do
  // veículo pesado destruído. O torpedo chega ao alvo ~1 s depois do disparo
  naval_gun: { files: SFX.navalGun, gain: 1 },
  torpedo: { files: SFX.torpedo, gain: 0.6 },
  torpedo_hit: { files: SFX.torpedoHit, gain: 1, delay: 1 },
  ship_sink: { files: SFX.shipSink, gain: 1.2 },
};
/** Gravações que não são sons de combate do `SAMPLES` (guerra ao longe, energia, sirene, vento, salva), carregadas junto. */
/** Interface gravada (lotes 33 e 34): o sintetizado continua para 'attack' (sirene) e enquanto o arquivo não carregou. */
const UI_SFX: Partial<Record<UiSound, string[]>> = {
  click: ['ui-clique-1', 'ui-clique-2'],
  confirm: ['ui-confirmar-1', 'ui-confirmar-2'],
  error: ['ui-erro-1', 'ui-erro-2'],
  alert: ['ui-alerta-1', 'ui-alerta-2'],
  success: ['ui-sucesso-1', 'ui-sucesso-2'],
  herald: ['ui-anuncio-1', 'ui-anuncio-2'],
  hold: ['ui-segurar-1', 'ui-segurar-2'],
  era: ['era-fanfarra-1', 'era-fanfarra-2'],
  warning: ['ui-aviso-grave-1', 'ui-aviso-grave-2'],
};
/** Volume da interface e dos sinais do silo gravados, no nível dos tons sintetizados (ver `AGM_GAIN`). */
const UI_GAIN: Partial<Record<UiSound, number>> = { click: 0.15, confirm: 0.14, error: 0.13, alert: 0.14, success: 0.18, herald: 0.19, hold: 0.07, warning: 0.19, era: 0.12 };
const SILO_GAIN = { prepare: 0.26, authorize: 1.5 };
const THUNDER_GAIN = 0.45;
/** Trabalho do edifício selecionado gravado (lote 33, mono, em loop); o sintetizado fica enquanto não carregou. */
const PRODUCTION_SFX: Record<ProductionSound, string[]> = {
  saw: ['producao-serraria-1', 'producao-serraria-2'],
  quarry: ['producao-pedreira-1', 'producao-pedreira-2'],
  mine: ['producao-mina-1', 'producao-mina-2'],
  factory: ['producao-fabrica-1', 'producao-fabrica-2'],
  pump: ['producao-petroleo-1', 'producao-petroleo-2'],
  farm: ['producao-fazenda-1', 'producao-fazenda-2'],
  jet_idle: ['producao-aeroporto-1', 'producao-aeroporto-2'],
  port: ['producao-porto-1', 'producao-porto-2'],
  office: ['producao-escritorio-1', 'producao-escritorio-2'],
  hum: ['producao-zumbido-1', 'producao-zumbido-2'],
};
// mesma energia do sintetizado (`scripts/sfx/calibrar.cjs`); a bomba de petróleo fica limitada a 1,2 para não estourar
const PRODUCTION_GAIN: Record<ProductionSound, number> = {
  saw: 0.73,
  quarry: 1.2,
  mine: 0.9,
  factory: 0.35,
  pump: 1.2,
  farm: 0.36,
  jet_idle: 0.41,
  port: 0.48,
  office: 0.39,
  hum: 0.52,
};
/**
 * Chuva e vento de neve gravados no lugar das camadas de ruído. A mesma energia pediria 4,5 e 3,2, mas a chuva
 * sintetizada guarda quase tudo no grave e a gravada é larga (soa mais alta com menos energia, e estouraria): 3 nas duas.
 */
const RAIN_GAIN = 3;
/** Bordo do drone gravado no lugar da hélice, turbina e vento sintetizados (o chiado de rádio continua). */
const DRONE_ONBOARD_GAIN = 1;
/**
 * Laço de cada classe de motor e o volume com a mixagem cheia (`level` 1, uma coluna inteira perto da câmera): no
 * nível médio da chuva gravada, bem abaixo dos tiros (`calibrar.cjs`). O apito fica na energia de um tiro de tanque.
 */
const ENGINE_SFX: Record<EngineClass, string[]> = { tracked: SFX.engineTracked, wheeled: SFX.engineWheeled, naval: SFX.shipUnderway };
const ENGINE_GAIN: Record<EngineClass, number> = { tracked: 0.45, wheeled: 0.45, naval: 0.45 };
const SHIP_HORN_GAIN = 0.6;
const SNOW_WIND_GAIN = 3;
export const EXTRA_SAMPLES = [
  ...SFX.distant,
  ...SFX.powerDown,
  ...SFX.sirenAlert,
  ...SFX.siren,
  ...SFX.breeze,
  ...SFX.gust,
  ...SFX.salvo,
  ...SFX.siloPrepare,
  ...SFX.siloAuthorize,
  ...SFX.thunder,
  ...SFX.rain,
  ...SFX.snowWind,
  ...SFX.droneOnboard,
  ...SFX.engineTracked,
  ...SFX.engineWheeled,
  ...SFX.shipUnderway,
  ...SFX.shipHorn,
  ...Object.values(UI_SFX).flat(),
  ...Object.values(PRODUCTION_SFX).flat(),
];

/** Intervalo mínimo (s) entre dois sons iguais: vários fuzis no mesmo quadro viram um. */
const MIN_GAP: Partial<Record<CombatSound, number>> = { rifle: 0.12, tower: 0.06, cannon: 0.08, howitzer: 0.35, rocket: 0.05, explosion: 0.06, flak: 0.05, jet: 0.4, bomber: 1.2, jet_cannon: 0.12, aam_launch: 0.25, drone_pass: 3, agm_launch: 0.2, air_mg: 0.18, bomb_whistle: 0.4, carpet_rumble: 1.5, bomb: 0.07, aa_gun: 0.45, aa_twin: 0.4, mbt_gun: 0.18, gatling: 0.15, vehicle_explosion: 0.1, vehicle_explosion_heavy: 0.15, nuclear_blast: 1, space_prelaunch: 2, space_liftoff: 2, dome_launch: 0.2, dome_intercept: 0.3, tank_gun: 0.18, apc_gun: 0.25, naval_gun: 0.15, torpedo: 0.2, torpedo_hit: 0.2, ship_sink: 0.3 };

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
  private musicMuted = false;
  /** Abaixa a música sob tiros e explosões (a guerra sempre se ouve acima da trilha). */
  private duck: GainNode | null = null;
  /** Filtros da música: grave (shelf) e médio (peaking), abertos na calma e cortados em combate. */
  private musicEq: { low: BiquadFilterNode; mid: BiquadFilterNode } | null = null;
  private noise: AudioBuffer | null = null;
  private readonly voices: Voice[] = [];
  private maxVoices = 24;
  private readonly lastPlayed = new Map<string, number>();
  private listener = { x: 0, y: 0, dist: 40, yaw: 0 };
  private production: { kind: ProductionSound; gain: GainNode; stop: () => void } | null = null;
  private ambient: { stop: () => void; recorded?: boolean } | null = null;
  private ost: { deck: (id: TrackId) => Deck; current: TrackId | null; threat: Threat; calmNext: TrackId } | null = null;
  private alarm: { stop: () => void; id: number } | null = null;
  /** Gravações decodificadas (nome → buffer); `null` = falhou (fica no sintetizado). */
  private readonly sampleBufs = new Map<string, AudioBuffer | null>();
  private readonly lastVariant = new Map<CombatSound, number>();
  /** Idioma da tela (a contagem gravada do Programa Espacial é em inglês). */
  voiceLang = 'pt';
  /** Desliga as gravações (comparação com o sintetizado em teste). */
  useSamples = true;

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
      this.duck = this.ctx.createGain();
      this.duck.connect(this.master);
      const low = this.ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 180;
      low.gain.value = 0;
      const mid = this.ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1400;
      mid.Q.value = 0.7;
      mid.gain.value = 0;
      low.connect(mid).connect(this.duck);
      this.musicEq = { low, mid };
      for (const c of CHANNELS) {
        const g = this.ctx.createGain();
        g.connect(c === 'music' ? low : this.master);
        this.buses.set(c, g);
      }
      this.noise = this.makeNoise();
      this.loadSamples();
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(v: Volumes, muted: boolean, musicMuted = false): void {
    this.volumes = { ...v };
    this.muted = muted;
    this.musicMuted = musicMuted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    for (const c of CHANNELS) this.buses.get(c)!.gain.setTargetAtTime(c === 'music' && this.musicMuted ? 0 : this.volumes[c] * (c === 'combat' ? COMBAT_BOOST : 1), t, 0.05);
  }

  /**
   * Abaixa um pouco a música num evento grande (`depth` 0..1 do volume dela, no máximo 40%): desce em ~150 ms e volta
   * devagar (~2,5 s), sem o "bombeamento" de um ducking rápido. Eventos seguidos não somam: vale o mais forte.
   */
  private duckMusic(depth: number): void {
    const g = this.duck;
    if (!g || !this.ctx || depth <= 0.05) return;
    const t = this.ctx.currentTime;
    const now = g.gain.value;
    const to = 1 - Math.min(0.4, depth);
    if (to >= now - 0.02) return;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(now, t);
    g.gain.linearRampToValueAtTime(to, t + 0.15);
    g.gain.setTargetAtTime(1, t + 0.6, 0.8);
  }

  /** Filtro da música para o estado de ameaça (constante de ~1,2 s: chega ao alvo em 3–5 s). */
  private applyMusicEq(level: Threat): void {
    const eq = this.musicEq;
    if (!eq || !this.ctx) return;
    const t = this.ctx.currentTime;
    eq.low.gain.setTargetAtTime(MUSIC_EQ[level].low, t, 1.2);
    eq.mid.gain.setTargetAtTime(MUSIC_EQ[level].mid, t, 1.2);
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

  private readonly cannonBursts: { buffer: AudioBuffer; firing: number }[] = [];

  /**
   * Rajada do canhão rotativo de um caça (tipo M61 de 20 mm), desenhada amostra a amostra (três variantes sorteadas).
   * São ~100 tiros por segundo, rápidos demais para o ouvido separar: a rajada vira o "BRRRT" grave e rasgado típico.
   * Cada tiro tem um estalo de ~1 ms, um corpo grave em duas senoides (~140 e ~300 Hz) e um sopro curto. Os primeiros
   * tiros saem um pouco mais espaçados (os canos ainda acelerando) e a força oscila de leve.
   */
  private cannonBurst(): { buffer: AudioBuffer; firing: number } {
    if (this.cannonBursts.length < 3) {
      const ctx = this.ctx!;
      const rate = ctx.sampleRate;
      const firing = 0.85 + Math.random() * 0.25;
      const rof = 96 + Math.random() * 10;
      const len = Math.round((firing + 0.06) * rate);
      const buffer = ctx.createBuffer(1, len, rate);
      const d = buffer.getChannelData(0);
      let time = 0.01;
      let shot = 0;
      while (time < firing) {
        const at = Math.round((time + (Math.random() - 0.5) * 0.001) * rate);
        const amp = (0.85 + Math.random() * 0.15) * Math.min(1, 0.6 + shot * 0.12) * (1 + 0.08 * Math.sin(time * 37));
        const f1 = 135 + Math.random() * 20;
        let blast = 0;
        for (let i = 0; i < Math.round(0.011 * rate) && at + i < len; i++) {
          const t = i / rate;
          const crack = t < 0.0015 ? (Math.random() * 2 - 1) * Math.exp(-t / 0.0004) * 1.1 : 0;
          const body = Math.sin(2 * Math.PI * f1 * t) * Math.exp(-t / 0.0055) * 0.75 + Math.sin(2 * Math.PI * f1 * 2.2 * t) * Math.exp(-t / 0.0025) * 0.3;
          blast += ((Math.random() * 2 - 1) - blast) * 0.06;
          d[at + i]! += amp * (crack + body + blast * Math.exp(-t / 0.004) * 2.4);
        }
        time += (1 / rof) * (shot < 3 ? 1.5 - shot * 0.15 : 1);
        shot++;
      }
      this.cannonBursts.push({ buffer, firing });
    }
    return this.cannonBursts[Math.floor(Math.random() * this.cannonBursts.length)]!;
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
  /** Baixa e decodifica as gravações em segundo plano (~0,8 MB); cada uma passa a valer assim que fica pronta. */
  private loadSamples(): void {
    const ctx = this.ctx;
    if (!ctx || typeof fetch === 'undefined') return;
    const names = new Set([...Object.values(SAMPLES).flatMap((s) => (Array.isArray(s) ? s : [s]).flatMap((x) => x.files)), ...EXTRA_SAMPLES]);
    for (const name of names) {
      if (this.sampleBufs.has(name)) continue;
      fetch(`${import.meta.env.BASE_URL}sfx/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => {
          this.sampleBufs.set(name, buf);
          // o vento sintetizado já tocando dá lugar ao gravado assim que ele chega
          if (this.ambient && !this.ambient.recorded && SFX.breeze.includes(name)) {
            this.ambient.stop();
            this.ambient = null;
            this.startAmbient();
          }
        })
        .catch(() => this.sampleBufs.set(name, null));
    }
  }

  /**
   * Toca a gravação do som, se houver alguma pronta. Devolve false para cair no sintetizado; com gravação, devolve o
   * fator de volume com que o sintetizado também toca (0 = não toca).
   */
  private playSample(sound: CombatSound, gain: number, pan: number): false | number {
    const entry = SAMPLES[sound];
    if (!entry || !this.useSamples) return false;
    const ready = (files: string[]) => files.map((f) => this.sampleBufs.get(f)).filter((b): b is AudioBuffer => !!b);
    const sets = (Array.isArray(entry) ? entry : [entry])
      .filter((set, _i, all) => !set.lang || set.lang === this.voiceLang || (set.lang === 'outros' && !all.some((x) => x.lang === this.voiceLang)))
      .map((set) => ({ set, ready: ready(set.files) }))
      .filter((x) => x.ready.length > 0);
    if (!sets.length) return false;
    let roll = Math.random() * sets.reduce((a, x) => a + (x.set.weight ?? 1), 0);
    const chosen = sets.find((x) => (roll -= x.set.weight ?? 1) < 0) ?? sets[0]!;
    const { set } = chosen;
    const bufs = chosen.ready;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005 + (set.delay ?? 0);
    const out = this.out('combat', gain * set.gain, pan);
    const rounds = set.rounds ? set.rounds[0] + Math.floor(Math.random() * (set.rounds[1] - set.rounds[0] + 1)) : 1;
    const nodes: AudioBufferSourceNode[] = [];
    let end = t;
    let last = this.lastVariant.get(sound) ?? -1;
    for (let i = 0; i < rounds; i++) {
      let pick = Math.floor(Math.random() * bufs.length);
      if (bufs.length > 1 && pick === last) pick = (pick + 1) % bufs.length;
      last = pick;
      const buf = bufs[pick]!;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const rate = (set.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.08);
      src.playbackRate.value = rate;
      const at = t + i * (set.interval ?? 0) + (i ? (Math.random() - 0.5) * 0.008 : 0);
      if (set.pass) {
        // passagem: envelope de distância (chega, pico, vai embora) e o tom caindo depois do pico, sobre um trecho
        // sorteado do ronco gravado
        const { peak, dur, drop } = set.pass;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.02, at);
        env.gain.exponentialRampToValueAtTime(1, at + peak);
        env.gain.exponentialRampToValueAtTime(0.005, at + dur);
        src.playbackRate.setValueAtTime(rate * (1 + drop * 0.4), at);
        src.playbackRate.linearRampToValueAtTime(rate, at + peak);
        src.playbackRate.linearRampToValueAtTime(rate * (1 - drop), at + peak + 0.9);
        src.connect(env).connect(out);
        const offset = Math.max(0, buf.duration - dur * 1.1) * Math.random();
        src.start(at, offset);
        src.stop(at + dur);
        end = Math.max(end, at + dur);
      } else {
        if (i > 0) {
          const g = ctx.createGain();
          g.gain.value = 0.8 + Math.random() * 0.2;
          src.connect(g).connect(out);
        } else src.connect(out);
        src.start(at);
        end = Math.max(end, at + buf.duration / rate);
      }
      nodes.push(src);
    }
    const layer = set.layer ? ready(set.layer.files) : [];
    if (set.layer && layer.length) {
      const src = ctx.createBufferSource();
      src.buffer = layer[Math.floor(Math.random() * layer.length)]!;
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.08;
      const g = ctx.createGain();
      g.gain.value = set.layer.gain;
      src.connect(g).connect(out);
      src.start(t + set.layer.delay);
      end = Math.max(end, t + set.layer.delay + src.buffer.duration);
      nodes.push(src);
    }
    this.lastVariant.set(sound, last);
    const stop = () => nodes.forEach((n) => n.stop());
    if (!this.claim(PRIORITY[sound], end, stop)) {
      stop();
      return 0;
    }
    return set.synth ?? 0;
  }

  /** Toca uma gravação avulsa (fora do `SAMPLES`) num canal; false se ainda não carregou. */
  private playExtra(files: string[], channel: Channel, gain: number, pan: number, rate = 1, delay = 0): boolean {
    const ready = files.map((f) => this.sampleBufs.get(f)).filter((b): b is AudioBuffer => !!b);
    if (!ready.length || !this.ctx) return false;
    const buf = ready[Math.floor(Math.random() * ready.length)]!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(this.out(channel, gain, pan));
    src.start(delay > 0 ? this.ctx.currentTime + delay : 0);
    return true;
  }

  private distant = { level: 0, pan: 0, next: 0 };

  /**
   * Guerra ao longe (04/11): com combate recente do jogador (`fights`, posições dos últimos segundos), quanto mais
   * longe a câmera estiver dele (ou mais afastada no zoom), mais se ouve artilharia distante, sorteada a cada 2–6 s,
   * vinda do lado do combate. Com a câmera em cima da luta, some (ali tocam os tiros de cada unidade). `massive`
   * (ataque massivo ou guerra nuclear) deixa o fundo sempre presente. Chamado uma vez por segundo.
   */
  warAt(fights: readonly { x: number; y: number }[], massive: boolean): void {
    if (!this.ready) return;
    const L = this.listener;
    let level = 0;
    let pan = 0;
    if (fights.length) {
      let near = fights[0]!;
      let best = Infinity;
      for (const f of fights) {
        const d = Math.hypot(f.x - L.x, f.y - L.y);
        if (d < best) {
          best = d;
          near = f;
        }
      }
      const far = Math.max(0, Math.min(1, (best - (18 + L.dist * 0.4)) / (40 + L.dist)));
      const zoomOut = Math.max(0, Math.min(1, (L.dist - 45) / 90));
      level = Math.min(1, Math.max(far, zoomOut * 0.7) * (0.45 + Math.min(1, fights.length / 12) * 0.55));
      const right = { x: Math.cos(L.yaw), y: -Math.sin(L.yaw) };
      const dx = near.x - L.x;
      const dy = near.y - L.y;
      pan = Math.max(-0.7, Math.min(0.7, (dx * right.x + dy * right.y) / Math.max(1, best)));
    }
    if (massive) level = Math.max(level, 0.35);
    const d = this.distant;
    d.level = level;
    d.pan = pan;
    const now = this.ctx!.currentTime;
    if (level < 0.05 || now < d.next) return;
    if (this.playExtra(SFX.distant, 'combat', level * (0.55 + Math.random() * 0.45) * 0.9, pan + (Math.random() - 0.5) * 0.3, 0.92 + Math.random() * 0.16))
      d.next = now + (2 + Math.random() * 4) / (0.6 + level * 0.6);
  }

  /** Construção própria ficou sem energia: zumbido que desce e apaga (só uma vez a cada 4 s, mesmo se a rede inteira cair). */
  powerDown(x: number, y: number): void {
    if (!this.ready || !this.gap('power_down', 4)) return;
    const sp = this.spatial(x, y);
    this.playExtra(SFX.powerDown, 'ui', Math.max(0.35, sp?.gain ?? 0) * 0.7, sp?.pan ?? 0, 0.96 + Math.random() * 0.08);
  }

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
    const last = this.lastPlayed.get(key) ?? -Infinity;
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
    const duck = DUCK[sound];
    if (duck) this.duckMusic(duck * Math.min(1, gain * 1.5));
    const withSample = this.playSample(sound, gain, pan);
    if (withSample !== false) {
      if (withSample <= 0) return;
      gain *= withSample;
    }
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
      // canhão da fragata e torpedo sem a gravação: o estampido abafado do canhão
      case 'naval_gun':
      case 'torpedo':
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
      case 'torpedo_hit':
      case 'ship_sink':
      case 'vehicle_explosion_heavy': {
        // veículo destruído, cinematográfico, em camadas:
        //   estalo da detonação; bola de fogo saturada que abre e fecha (filtro varrendo do agudo ao grave);
        //   estrondo grave, o soco no peito e um subgrave longo; destroços de metal caindo (baques médios, sem
        //   tilintar agudo); o fogo crepitando; nos pesados, a munição cozinhando (estouros secundários).
        // Tudo também vai para a reverberação de campo aberto, e no fim o estrondo rola pelo terreno.
        const heavy = sound === 'vehicle_explosion_heavy' || sound === 'ship_sink';
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
        end = burst('lowpass', 520, 0.6, 0.01, 1.2, 1.8);
        thump(60, 22, 0.02, 1.1, 1.3);
        burst('bandpass', 2400, 0.9, 0.002, 0.4, 0.2);
        break;
      case 'bomb': {
        // bomba de aviação de 500 lb, cinematográfica, em camadas (mesma receita da explosão de veículo, mais pesada):
        //   1. estalo supersônico da detonação;
        //   2. bola de fogo: ruído saturado com o filtro fechando do agudo ao grave;
        //   3. o soco de pressão no peito e um subgrave longo (a terra treme);
        //   4. terra, pedra e entulho chovendo de volta;
        //   5. o estrondo ecoando em ondas pelo terreno, cada vez mais longe e abafado.
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.75;
        mix.connect(wet).connect(this.outdoorReverb());
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(5);
        drive.oversample = '4x';
        const driveLow = ctx.createBiquadFilter();
        driveLow.type = 'lowpass';
        driveLow.frequency.value = 480;
        drive.connect(driveLow).connect(mix);
        // 1. estalo
        burst('highpass', 3000, 0.5, 0.0003, 1.5, 0.03, t, mix);
        burst('bandpass', 1100, 0.6, 0.0005, 1.4, 0.09, t, mix);
        // 2. bola de fogo
        {
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.Q.value = 0.9;
          f.frequency.setValueAtTime(3600 * vary, t);
          f.frequency.exponentialRampToValueAtTime(180, t + 1.3);
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(3);
          const g = ctx.createGain();
          n.connect(f).connect(sat).connect(g).connect(mix);
          this.env(g, t + 0.003, 0.01, 1.7, 1.6);
          n.start(t, Math.random());
          n.stop(t + 1.8);
          nodes.push(n);
        }
        // 3. soco e subgrave
        thump(130, 30, 0.003, 2.2, 0.8, t, 'sine', drive);
        thump(80, 22, 0.006, 2.0, 1.4, t, 'triangle', drive);
        burst('lowpass', 260, 0.8, 0.005, 2.0, 1.1, t, drive);
        thump(42, 14, 0.02, 1.8, 2.6, t, 'sine', mix);
        // 4. terra e entulho chovendo
        burst('bandpass', 900, 0.5, 0.3, 0.28, 1.6, t + 0.25, mix);
        for (let i = 0; i < 14; i++) {
          const at = t + 0.35 + Math.random() * 1.6;
          const k = 0.12 + Math.random() * 0.16;
          burst('bandpass', 500 + Math.random() * 1400, 2.5, 0.001, k, 0.05 + Math.random() * 0.08, at, mix);
          if (i % 3 === 0) burst('lowpass', 200, 0.7, 0.003, k * 1.4, 0.15, at, mix);
        }
        // 5. eco rolando pelo terreno
        burst('lowpass', 420, 0.6, 0.04, 0.7, 1.0, t + 0.3, mix);
        burst('lowpass', 260, 0.5, 0.1, 0.55, 1.5, t + 0.9, mix);
        burst('lowpass', 170, 0.5, 0.2, 0.42, 2.0, t + 1.6, mix);
        end = burst('lowpass', 110, 0.5, 0.3, 0.3, 2.6, t + 2.4, mix);
        break;
      }
      case 'carpet_rumble': {
        // bombardeio em tapete visto de longe: as detonações se fundem num trovão contínuo que caminha pelo chão
        // (pulsos graves irregulares sobre um ronco que cresce e some), com o eco longo do campo aberto
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.8;
        mix.connect(wet).connect(this.outdoorReverb());
        const n = this.noiseSource(true);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 220;
        const sat = ctx.createWaveShaper();
        sat.curve = this.driveCurve(2.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.95, t + 0.4);
        g.gain.setValueAtTime(0.95, t + 1.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
        n.connect(f).connect(sat).connect(g).connect(mix);
        n.start(t, Math.random());
        n.stop(t + 5.6);
        nodes.push(n);
        for (let i = 0; i < 9; i++) {
          const at = t + i * 0.22 + Math.random() * 0.08;
          thump(70 + Math.random() * 20, 20, 0.01, 0.9 - i * 0.05, 0.9, at, 'sine', mix);
        }
        end = t + 5.6;
        break;
      }
      case 'bomb_whistle': {
        // assobio das bombas caindo: três tons que descem juntos (cada bomba um pouco desafinada) e um sopro de ar
        // estreito acompanhando, crescendo até o impacto
        const dur = 1.05;
        for (let k = 0; k < 3; k++) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          const f0 = (1480 + k * 85) * vary;
          o.frequency.setValueAtTime(f0, t + k * 0.08);
          o.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + k * 0.08 + dur);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t + k * 0.08);
          g.gain.exponentialRampToValueAtTime(0.09, t + k * 0.08 + dur * 0.75);
          g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.08 + dur);
          o.connect(g).connect(out);
          o.start(t + k * 0.08);
          o.stop(t + k * 0.08 + dur + 0.05);
          nodes.push(o);
        }
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 9;
        f.frequency.setValueAtTime(1500, t);
        f.frequency.exponentialRampToValueAtTime(560, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
        n.connect(f).connect(g).connect(out);
        n.start(t, Math.random());
        n.stop(t + dur + 0.15);
        nodes.push(n);
        end = t + dur + 0.2;
        break;
      }
      case 'jet_cannon': {
        // canhão rotativo do caça: a rajada desenhada na amostra (o "BRRRT"), saturada, com o ronco grave da pressão dos
        // tiros somada por baixo e o eco longo no céu aberto depois do último tiro
        const { buffer, firing } = this.cannonBurst();
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.5;
        mix.connect(wet).connect(this.outdoorReverb());
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = vary;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 45;
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(3);
        drive.oversample = '4x';
        const level = ctx.createGain();
        level.gain.value = 0.9;
        // o estalo de cada tiro chega abafado pelo ar: sem o chiado agudo
        const air = ctx.createBiquadFilter();
        air.type = 'lowpass';
        air.frequency.value = 5000;
        src.connect(hp).connect(drive).connect(air).connect(level).connect(mix);
        src.start(t);
        nodes.push(src);
        const stop = t + firing / vary;
        const n = this.noiseSource();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 200;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.6, t + 0.06);
        ng.gain.setValueAtTime(0.6, stop - 0.04);
        ng.gain.exponentialRampToValueAtTime(0.0001, stop + 0.2);
        n.connect(lp).connect(ng).connect(mix);
        n.start(t, Math.random());
        n.stop(stop + 0.25);
        nodes.push(n);
        end = burst('lowpass', 280, 0.6, 0.06, 0.35, 1.3, stop - 0.05, mix);
        break;
      }
      case 'jet':
      case 'bomber': {
        // passagem de avião, com a física de um sobrevoo de verdade:
        // - aproximação: o assobio agudo da turbina chega antes, mais alto em tom (Doppler);
        // - passagem: o rugido de banda larga abre de vez e o reflexo no chão cria o "chiado varrido" (filtro pente com
        //   atraso que encolhe até a passagem e volta a crescer);
        // - afastamento: o tom cai, e fica o trovão grave do escape, com o crepitar do jato no caça, que demora a sumir;
        // - o bombardeiro é mais lento e mais grave: quatro motores batendo entre si (um pulsar grave) e um trovão longo.
        const big = sound === 'bomber';
        const dur = big ? 7.5 : 4.8;
        const tp = t + (big ? 3.2 : 1.8);
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.45;
        mix.connect(wet).connect(this.outdoorReverb());
        // distância: chega devagar, pico na passagem, e o escape demora a sumir
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.005, t);
        env.gain.exponentialRampToValueAtTime(0.25, tp - (big ? 1.5 : 0.7));
        env.gain.exponentialRampToValueAtTime(1, tp);
        env.gain.exponentialRampToValueAtTime(0.4, tp + (big ? 1.8 : 1));
        env.gain.exponentialRampToValueAtTime(0.1, t + dur - 0.8);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        env.connect(mix);
        const comb = ctx.createDelay(0.05);
        comb.delayTime.setValueAtTime(0.012, t);
        comb.delayTime.linearRampToValueAtTime(0.0011, tp);
        comb.delayTime.linearRampToValueAtTime(0.014, t + dur);
        const combG = ctx.createGain();
        combG.gain.value = 0.7;
        const pre = ctx.createGain();
        pre.connect(env);
        pre.connect(comb).connect(combG).connect(env);
        const stopAt = t + dur + 0.1;
        // 1. rugido de banda larga: o filtro abre na passagem e fecha no afastamento
        {
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.Q.value = 0.6;
          f.frequency.setValueAtTime(big ? 500 : 900, t);
          f.frequency.exponentialRampToValueAtTime(big ? 1900 : 5200, tp);
          f.frequency.exponentialRampToValueAtTime(big ? 320 : 650, t + dur);
          const g = ctx.createGain();
          g.gain.value = big ? 0.9 : 0.75;
          n.connect(f).connect(g).connect(pre);
          n.start(t, Math.random());
          n.stop(stopAt);
          nodes.push(n);
        }
        // 2. trovão grave do escape, mais forte logo depois da passagem
        {
          const n = this.noiseSource(true);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = big ? 130 : 170;
          const sat = ctx.createWaveShaper();
          sat.curve = this.driveCurve(2);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.5, tp);
          g.gain.exponentialRampToValueAtTime(big ? 1.5 : 1.2, tp + (big ? 0.8 : 0.4));
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          n.connect(f).connect(sat).connect(g).connect(mix);
          n.start(t, Math.random());
          n.stop(stopAt);
          nodes.push(n);
        }
        // 3. assobio da turbina (vem da entrada de ar: forte na aproximação, some logo depois), com Doppler
        for (const [f0, k] of (big
          ? [
              [1150, 0.035],
              [1730, 0.02],
            ]
          : [
              [2900, 0.045],
              [4350, 0.025],
            ]) as [number, number][]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f0 * 1.16 * vary, t);
          o.frequency.setValueAtTime(f0 * 1.12 * vary, tp - 0.25);
          o.frequency.exponentialRampToValueAtTime(f0 * 0.84 * vary, tp + 0.35);
          o.frequency.linearRampToValueAtTime(f0 * 0.8 * vary, t + dur);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 5;
          bp.frequency.value = f0;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(k, tp - 0.15);
          g.gain.exponentialRampToValueAtTime(0.0001, tp + (big ? 2 : 1.2));
          o.connect(bp).connect(g).connect(pre);
          o.start(t);
          o.stop(stopAt);
          nodes.push(o);
        }
        // 4. crepitar do jato (ondas de choque do escape), mais forte no caça, depois da passagem
        {
          const src = ctx.createBufferSource();
          src.buffer = this.rocketCrackleBuffer();
          src.playbackRate.value = big ? 0.45 : 0.8;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = big ? 900 : 2600;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.2, tp - 0.3);
          g.gain.exponentialRampToValueAtTime(big ? 0.5 : 0.85, tp + 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          src.connect(f).connect(g).connect(pre);
          src.start(t, Math.random() * 4);
          src.stop(stopAt);
          nodes.push(src);
        }
        // 5. bombardeiro: quatro motores levemente desafinados batendo entre si (o pulsar grave de um quadrimotor)
        if (big)
          for (const f0 of [74, 76.5, 79, 82.5]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(f0 * 1.06 * vary, t);
            o.frequency.setValueAtTime(f0 * 1.05 * vary, tp - 0.4);
            o.frequency.exponentialRampToValueAtTime(f0 * 0.94 * vary, tp + 0.6);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 380;
            const g = ctx.createGain();
            g.gain.value = 0.09;
            o.connect(lp).connect(g).connect(pre);
            o.start(t);
            o.stop(stopAt);
            nodes.push(o);
          }
        end = t + dur;
        break;
      }
      case 'apc_gun': {
        // canhão automático de 30 mm do blindado: rajada curta de três tiros (~200 por minuto), cada um com o estalo
        // seco do projétil, o "tum" médio do gás saindo do cano, um soco grave curto e o ferrolho; bem mais leve e
        // menos grave que os tanques, e o eco curto do campo aberto
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.3;
        mix.connect(wet).connect(this.outdoorReverb());
        const drive = ctx.createWaveShaper();
        drive.curve = this.driveCurve(2);
        const lvl = ctx.createGain();
        lvl.gain.value = 0.55;
        drive.connect(lvl).connect(mix);
        const shots = 3;
        for (let i = 0; i < shots; i++) {
          const at = t + i * 0.3 + Math.random() * 0.015;
          const k = 1 - i * 0.06;
          burst('highpass', 2600, 0.7, 0.0008, 0.45 * k, 0.035, at, mix);
          burst('bandpass', 520, 0.9, 0.002, 0.7 * k, 0.16, at, drive);
          thump(150, 55, 0.003, 0.4 * k, 0.16, at, 'sine', drive);
          burst('bandpass', 1300, 2.5, 0.001, 0.22, 0.03, at + 0.07, mix);
        }
        end = t + shots * 0.3 + 0.6;
        break;
      }
      case 'drone_pass':
        end = this.dronePass(t, out, gain, nodes);
        break;
      case 'aam_launch':
      case 'agm_launch': {
        // míssil do caça: o estalo seco da ignição no trilho, o "fssshhh" rasgado do motor de combustível sólido que
        // acelera e se afasta (o tom sobe e o volume cai), o ronco grave da queima por baixo e o eco no céu aberto.
        // O ar-terra é mais pesado: ignição mais grave, motor mais encorpado e queima mais longa.
        const heavy = sound === 'agm_launch';
        const len = heavy ? 2.1 : 1.6;
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.5;
        mix.connect(wet).connect(this.outdoorReverb());
        burst('highpass', heavy ? 1400 : 2200, 0.7, 0.0008, 0.9, 0.045, t, mix);
        thump(heavy ? 95 : 130, 45, 0.004, heavy ? 0.9 : 0.6, 0.22, t, 'sine', mix);
        const n = this.noiseSource();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.9;
        bp.frequency.setValueAtTime(heavy ? 700 : 900, t);
        bp.frequency.exponentialRampToValueAtTime(heavy ? 2600 : 3800, t + len * 0.55);
        bp.frequency.exponentialRampToValueAtTime(heavy ? 1500 : 2000, t + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(heavy ? 0.85 : 0.75, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.3, t + len * 0.45);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        n.connect(bp).connect(g).connect(mix);
        n.start(t, Math.random());
        n.stop(t + len + 0.05);
        nodes.push(n);
        const r = this.noiseSource();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = heavy ? 260 : 200;
        const rg = ctx.createGain();
        rg.gain.setValueAtTime(0.0001, t);
        rg.gain.exponentialRampToValueAtTime(heavy ? 0.7 : 0.45, t + 0.05);
        rg.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.8);
        r.connect(lp).connect(rg).connect(mix);
        r.start(t, Math.random());
        r.stop(t + len);
        nodes.push(r);
        end = t + len + 0.1;
        break;
      }
      case 'air_mg': {
        // metralhadora pesada do caça (~1.100 tiros/min, rajada de ~0,6 s): cada tiro é um estampido curto e seco com o
        // corpo grave do cano; o conjunto vira o "tá-tá-tá" rápido e cheio, com eco no céu
        const mix = ctx.createGain();
        mix.connect(out);
        const wet = ctx.createGain();
        wet.gain.value = gain * 0.4;
        mix.connect(wet).connect(this.outdoorReverb());
        const shots = 16 + Math.floor(Math.random() * 4);
        for (let i = 0; i < shots; i++) {
          const at = t + i * 0.055 + Math.random() * 0.006;
          burst('bandpass', 1800, 1.2, 0.0006, 0.55, 0.035, at, mix);
          thump(160, 70, 0.002, 0.45, 0.06, at, 'triangle', mix);
        }
        end = t + shots * 0.055 + 0.3;
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
    // sob ataque: no máximo um aviso a cada 30 s (o evento chega a cada 6 s enquanto o ataque dura e o toque repetido
    // irritava): a subida da sirene gravada, ou o toque curto sintetizado se ela ainda não carregou
    if (sound === 'attack') {
      if (!this.gap('attack_alert', 30)) return;
      if (this.useSamples && this.playExtra(SFX.sirenAlert, 'ui', LEVELS.alert, 0)) return;
    }
    if (sound === 'alert' && !this.gap('ui:alert_soft', 3)) return;
    const rec = UI_SFX[sound];
    if (rec && this.useSamples && this.playExtra(rec, 'ui', UI_GAIN[sound] ?? 1, 0)) return;
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
      // nova era sem a fanfarra gravada: o mesmo arpejo de sucesso
      case 'era':
      case 'success':
        tone(523, t, 0.1, 0.2);
        tone(659, t + 0.09, 0.1, 0.2);
        tone(784, t + 0.18, 0.18, 0.2);
        break;
      case 'error':
        tone(220, t, 0.14, 0.25, 'sawtooth', 170);
        break;
      case 'alert':
        // perda (unidade, avião, caravana): duas notas suaves, no máximo a cada 3 s (o intervalo é conferido acima)
        tone(880, t, 0.12, 0.22, 'triangle');
        tone(660, t + 0.16, 0.16, 0.22, 'triangle');
        break;
      case 'herald':
        // anúncio mundial (03/11): três notas de clarim subindo
        tone(523, t, 0.16, 0.22, 'sawtooth');
        tone(659, t + 0.17, 0.16, 0.22, 'sawtooth');
        tone(784, t + 0.34, 0.42, 0.24, 'sawtooth');
        break;
      case 'warning':
        // anúncio mundial grave (guerra contra nós, armas nucleares): clarim descendo em tom menor
        tone(659, t, 0.18, 0.24, 'sawtooth');
        tone(523, t + 0.2, 0.18, 0.24, 'sawtooth');
        tone(415, t + 0.4, 0.5, 0.26, 'sawtooth');
        break;
      case 'attack':
        // sob ataque, enquanto a sirene gravada não carregou: dois tons que sobem e descem, uma vez (sem a onda quadrada)
        tone(520, t, 0.3, 0.26, 'triangle', 760);
        tone(760, t + 0.3, 0.3, 0.26, 'triangle', 520);
        break;
    }
  }

  /** Sinais do silo próprio: preparação (bomba de combustível), armado (alarme contínuo) e autorização. */
  missileCue(cue: MissileCue, launchId: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const out = this.out('ui', 0.9);
    // preparação e autorização gravadas (lote 33); o alarme de armado continua com a sirene em loop
    if (cue === 'prepare' && this.useSamples && this.playExtra(SFX.siloPrepare, 'ui', 0.9 * SILO_GAIN.prepare, 0)) return;
    if (cue === 'authorize' && this.useSamples && this.playExtra(SFX.siloAuthorize, 'ui', 0.9 * SILO_GAIN.authorize, 0)) {
      this.stopAlarm();
      return;
    }
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
    if (cue === 'armed' && this.armedSiren(launchId, out)) return;
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

  /**
   * Silo armado com a sirene gravada (lote 22): sobe do arranque do rotor e fica em loop sem emenda até autorizar ou
   * abortar; ao desligar, o rotor perde giro (o tom cai) e some. false se a gravação ainda não carregou.
   */
  private armedSiren(launchId: number, out: GainNode): boolean {
    if (!this.useSamples) return false;
    const name = SFX.siren[Math.floor(Math.random() * SFX.siren.length)]!;
    const buf = this.sampleBufs.get(name);
    if (!buf) return false;
    this.stopAlarm();
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = SIREN_LOOP[name] ?? 0;
    src.loopEnd = buf.duration;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(LEVELS.siren, t + 0.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    src.connect(g).connect(out);
    g.connect(wet).connect(this.outdoorReverb());
    src.start(t);
    this.alarm = {
      id: launchId,
      stop: () => {
        const now = ctx.currentTime;
        src.playbackRate.cancelScheduledValues(now);
        src.playbackRate.setValueAtTime(1, now);
        src.playbackRate.exponentialRampToValueAtTime(0.4, now + 2.2);
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
        src.stop(now + 2.5);
      },
    };
    return true;
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

  /** Uma das gravações já carregadas de `files` tocando em loop (começo sorteado) em `out`; null se nenhuma carregou. */
  private loopSample(files: string[], out: AudioNode, gain: number): (() => void) | null {
    if (!this.useSamples || !this.ctx) return null;
    const ready = files.map((f) => this.sampleBufs.get(f)).filter((b): b is AudioBuffer => !!b);
    if (!ready.length) return null;
    const buf = ready[Math.floor(Math.random() * ready.length)]!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(out);
    src.start(this.ctx.currentTime, Math.random() * buf.duration);
    return () => src.stop();
  }

  private productionLoop(kind: ProductionSound, out: GainNode): () => void {
    const recorded = this.loopSample(PRODUCTION_SFX[kind], out, PRODUCTION_GAIN[kind]);
    if (recorded) return recorded;
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

  /** Vento e campo, sempre baixos, durante a partida: o vento gravado quando já carregou, senão o sintetizado. */
  startAmbient(): void {
    if (!this.ready || this.ambient) return;
    this.ambient = this.windAmbient();
    if (this.ambient) return;
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

  /**
   * Vento gravado (lote 24, estéreo, em loop sem emenda): uma brisa calma de fundo o tempo todo e um vento mais forte
   * por cima que sobe e desce devagar (rajadas de ~20 s). Entra em 3 s. null se as gravações ainda não carregaram.
   */
  private windAmbient(): { stop: () => void; recorded: boolean } | null {
    if (!this.useSamples || !this.ctx) return null;
    const pick = (files: string[]) => {
      const ready = files.map((f) => this.sampleBufs.get(f)).filter((b): b is AudioBuffer => !!b);
      return ready.length ? ready[Math.floor(Math.random() * ready.length)]! : null;
    };
    const breeze = pick(SFX.breeze);
    if (!breeze) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const out = this.out('ambient', 1);
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0.0001, t);
    fade.gain.exponentialRampToValueAtTime(1, t + 3);
    fade.connect(out);
    const stops: (() => void)[] = [];
    const loop = (buf: AudioBuffer, gain: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(fade);
      src.start(t, Math.random() * buf.duration);
      stops.push(() => src.stop());
      return g;
    };
    loop(breeze, LEVELS.breeze);
    const gust = pick(SFX.gust);
    if (gust) {
      const g = loop(gust, LEVELS.gust * 0.5);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      const depth = ctx.createGain();
      depth.gain.value = LEVELS.gust * 0.5;
      lfo.connect(depth).connect(g.gain);
      lfo.start(t);
      stops.push(() => lfo.stop());
    }
    return { recorded: true, stop: () => stops.forEach((f) => f()) };
  }

  /**
   * Ronco da salva inteira do Lança-Foguetes (lote 27), por baixo dos lançamentos de cada foguete: dura `seconds` (o
   * tempo que os foguetes levam para sair) e some em 0,6 s.
   */
  rocketSalvo(x: number, y: number, seconds: number): void {
    if (!this.ready || !this.useSamples) return;
    const buf = this.sampleBufs.get(SFX.salvo[0]!);
    const sp = this.spatial(x, y);
    if (!buf || !sp || sp.gain < 0.03) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    const g = ctx.createGain();
    const end = t + Math.min(buf.duration - 0.6, seconds);
    g.gain.setValueAtTime(1, end);
    g.gain.exponentialRampToValueAtTime(0.001, end + 0.6);
    src.connect(g).connect(this.out('combat', sp.gain * LEVELS.salvo, sp.pan));
    src.start(t);
    src.stop(end + 0.65);
    if (!this.claim(PRIORITY.rocket + 1, end + 0.65, () => src.stop())) src.stop();
  }

  /**
   * Trilha sonora original (04/11): faixas em `public/music/`, tocadas pelo canal de música (volume e mudo das
   * configurações). Construção alterna Architect of the Horizon e The Last Perimeter; combate convencional toca The War
   * Board; ataque massivo e guerra nuclear, Strike at Zero. A troca entre estados de ameaça (`setThreat`) é por
   * crossfade de 3–5 s, nunca um corte seco.
   */
  startMusic(): void {
    if (!this.ready || this.ost) return;
    const ctx = this.ctx!;
    const decks = new Map<TrackId, Deck>();
    const deck = (id: TrackId): Deck => {
      let d = decks.get(id);
      if (d) return d;
      const el = new Audio(`${import.meta.env.BASE_URL}music/${TRACKS[id].file}`);
      el.preload = TRACKS[id].calm ? 'auto' : 'metadata';
      el.loop = !TRACKS[id].calm;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      try {
        ctx.createMediaElementSource(el).connect(gain);
        gain.connect(this.buses.get('music')!);
      } catch {
        // sem Web Audio para mídia: o volume vai direto no elemento (sem o canal de música)
      }
      d = { el, gain, stoppedAt: 0 };
      // faixa de construção acabando: emenda a outra com crossfade, sem silêncio
      if (TRACKS[id].calm)
        el.addEventListener('timeupdate', () => {
          const o = this.ost;
          if (o && o.current === id && o.threat === 'calm' && el.duration - el.currentTime < MUSIC_FADE.calm) this.musicTo(o.calmNext, MUSIC_FADE.calm, true);
        });
      decks.set(id, d);
      return d;
    };
    this.ost = { deck, current: null, threat: 'calm', calmNext: 'horizon' };
    this.musicTo('horizon', 2.5, true);
  }

  /** Estado de ameaça da partida (ver `threat.ts`); só troca a faixa quando o estado muda. */
  setThreat(level: Threat): void {
    const o = this.ost;
    if (!o || o.threat === level) return;
    const up = threatRank(level) > threatRank(o.threat);
    o.threat = level;
    this.applyMusicEq(level);
    if (level === 'calm') this.musicTo(o.calmNext, MUSIC_FADE.down, true);
    else this.musicTo(level === 'combat' ? 'war' : 'zero', up ? MUSIC_FADE.up : MUSIC_FADE.down);
  }

  /** Crossfade para uma faixa: a nova sobe enquanto a atual desce (`fade` em segundos). */
  private musicTo(id: TrackId, fade: number, calm = false): void {
    const o = this.ost;
    if (!o || !this.ctx || o.current === id) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const prevId = o.current;
    const prev = prevId ? o.deck(prevId) : null;
    if (prev) {
      prev.gain.gain.cancelScheduledValues(t);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, t);
      prev.gain.gain.linearRampToValueAtTime(0, t + fade);
      // pausa depois do fade, a menos que a faixa tenha voltado a tocar nesse meio-tempo
      window.setTimeout(() => {
        if (this.ost?.current === prevId) return;
        prev.el.pause();
        prev.stoppedAt = performance.now();
      }, fade * 1000 + 100);
    }
    const next = o.deck(id);
    // combate que volta em menos de 1 min continua de onde parou; depois disso, recomeça do início
    if (!TRACKS[id].calm && next.el.paused && performance.now() - next.stoppedAt > 60_000) next.el.currentTime = 0;
    if (TRACKS[id].calm && next.el.ended) next.el.currentTime = 0;
    next.gain.gain.cancelScheduledValues(t);
    next.gain.gain.setValueAtTime(next.gain.gain.value, t);
    next.gain.gain.linearRampToValueAtTime(TRACKS[id].gain, t + fade);
    void next.el.play().catch(() => this.retryOnGesture(next.el, id));
    o.current = id;
    if (calm) o.calmNext = id === 'horizon' ? 'perimeter' : 'horizon';
  }

  /**
   * O navegador recusou tocar a faixa (no celular, mídia nova fora de um toque pode ser barrada): tenta de novo no
   * próximo toque ou tecla, se ela ainda for a faixa atual.
   */
  private retryOnGesture(el: HTMLAudioElement, id: TrackId): void {
    if (typeof window === 'undefined') return;
    const retry = () => {
      window.removeEventListener('pointerdown', retry, true);
      window.removeEventListener('keydown', retry, true);
      if (this.ost?.current === id && el.paused) void el.play().catch(() => undefined);
    };
    window.addEventListener('pointerdown', retry, true);
    window.addEventListener('keydown', retry, true);
  }

  private stopMusic(fade = 1.5): void {
    const o = this.ost;
    if (!o || !this.ctx || !o.current) return;
    this.applyMusicEq('calm');
    const d = o.deck(o.current);
    const t = this.ctx.currentTime;
    d.gain.gain.cancelScheduledValues(t);
    d.gain.gain.setValueAtTime(d.gain.gain.value, t);
    d.gain.gain.linearRampToValueAtTime(0, t + fade);
    window.setTimeout(() => d.el.pause(), fade * 1000 + 100);
    this.ost = null;
  }

  private weatherLoop: {
    wash: GainNode;
    hiss: GainNode;
    roof: GainNode;
    snow: GainNode;
    /** a chuva gravada já traz as gotas: as sintetizadas ficam de fora */
    recordedRain: boolean;
    stop: () => void;
  } | null = null;
  private weatherRain = 0;

  /**
   * Clima (canal ambiente). Chuva em camadas, sem nada que assobie ou pulse:
   * - o "lençol" da chuva: ruído rosado abafado (passa-baixa suave), largo e constante;
   * - um chiado fino bem baixo por cima (a água batendo em folhas e no chão);
   * - o tamborilar grave nos telhados;
   * - gotas soltas (estalos curtos, de altura e posição variadas no estéreo), sorteadas a cada chamada.
   * Neve: só o vento frio, grave e lento. `rain` e `snow` de 0 a 1; as mudanças entram devagar.
   */
  setWeather(rain: number, snow: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    if (!this.weatherLoop) {
      if (rain < 0.01 && snow < 0.01) return;
      const out = this.out('ambient', 1);
      const stops: (() => void)[] = [];
      const layer = (filters: [BiquadFilterType, number, number][], lfo?: { rate: number; depth: number; target: 'freq' | 'gain' }) => {
        const n = this.noiseSource(true);
        let node: AudioNode = n;
        let first: BiquadFilterNode | null = null;
        for (const [type, freq, q] of filters) {
          const f = ctx.createBiquadFilter();
          f.type = type;
          f.frequency.value = freq;
          f.Q.value = q;
          first ??= f;
          node = node.connect(f);
        }
        const g = ctx.createGain();
        g.gain.value = 0;
        const sway = ctx.createGain();
        sway.gain.value = 1;
        node.connect(sway).connect(g).connect(out);
        if (lfo) {
          const l = ctx.createOscillator();
          l.frequency.value = lfo.rate;
          const d = ctx.createGain();
          d.gain.value = lfo.depth;
          l.connect(d).connect(lfo.target === 'freq' ? first!.frequency : sway.gain);
          l.start();
          stops.push(() => l.stop());
        }
        n.start(0, Math.random());
        stops.push(() => n.stop());
        return g;
      };
      // gravação (lote 33) no lugar das camadas de ruído quando já carregou: o ganho da camada controla o loop
      const recorded = (files: string[], gain: number) => {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(out);
        const stop = this.loopSample(files, g, gain);
        if (!stop) {
          g.disconnect();
          return null;
        }
        stops.push(stop);
        return g;
      };
      const rainRec = recorded(SFX.rain, RAIN_GAIN);
      // com a chuva gravada, chiado e telhado viram ganhos soltos (sem fonte)
      const wash = rainRec ?? layer(
        [
          ['highpass', 180, 0.5],
          ['lowpass', 2200, 0.4],
          ['lowpass', 3600, 0.4],
        ],
        { rate: 0.06, depth: 0.18, target: 'gain' },
      );
      const hiss = rainRec ? ctx.createGain() : layer([
        ['highpass', 4200, 0.4],
        ['lowpass', 9000, 0.4],
      ]);
      const roof = rainRec ? ctx.createGain() : layer(
        [
          ['highpass', 70, 0.5],
          ['lowpass', 420, 0.6],
        ],
        { rate: 0.11, depth: 0.12, target: 'gain' },
      );
      const snowG = recorded(SFX.snowWind, SNOW_WIND_GAIN) ?? layer(
        [
          ['highpass', 60, 0.5],
          ['lowpass', 420, 0.8],
        ],
        { rate: 0.09, depth: 240, target: 'freq' },
      );
      this.weatherLoop = { wash, hiss, roof, snow: snowG, recordedRain: !!rainRec, stop: () => stops.forEach((f) => f()) };
    }
    const t = ctx.currentTime;
    // volumes confortáveis: a chuva fica atrás do jogo, nunca na frente
    this.weatherLoop.wash.gain.setTargetAtTime(0.3 * rain, t, 2);
    this.weatherLoop.hiss.gain.setTargetAtTime(0.035 * rain, t, 2);
    this.weatherLoop.roof.gain.setTargetAtTime(0.16 * rain, t, 2);
    this.weatherLoop.snow.gain.setTargetAtTime(0.3 * snow, t, 2.5);
    this.weatherRain += (rain - this.weatherRain) * 0.3;
    // gotas soltas para o próximo meio segundo (a função é chamada a cada ~0,5 s)
    const drops = this.weatherLoop.recordedRain ? 0 : Math.round(this.weatherRain * 9 * (0.7 + Math.random() * 0.6));
    for (let i = 0; i < drops; i++) this.rainDrop(t + Math.random() * 0.5, this.weatherRain);
  }

  private droneLoop: { prop: OscillatorNode; am: OscillatorNode; amDepth: GainNode; propGain: GainNode; propFilter: BiquadFilterNode; whine: OscillatorNode[]; whineGain: GainNode; wind: GainNode; windFilter: BiquadFilterNode; hiss: GainNode; rec: { src: AudioBufferSourceNode; gain: GainNode } | null; stop: () => void } | null = null;
  private propWave: PeriodicWave | null = null;

  /**
   * Timbre da hélice: a frequência de passagem das pás (fundamental) com uma escada de harmônicos que cai devagar, o
   * "zumbido de cortador de grama" das hélices propulsoras; os pares têm um pouco mais de energia (as pás batem em
   * pares no escoamento da fuselagem).
   */
  private propellerWave(): PeriodicWave {
    if (!this.propWave) {
      const n = 24;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let h = 1; h < n; h++) imag[h] = (h % 2 === 0 ? 1.25 : 1) / Math.pow(h, 1.15);
      this.propWave = this.ctx!.createPeriodicWave(real, imag);
    }
    return this.propWave;
  }

  /**
   * Drone em primeira pessoa (som da câmera de bordo), com base no som real de um drone armado turboélice:
   * - hélice de quatro pás: fundamental na passagem das pás (~110 a 150 Hz, sobe com a rotação) e harmônicos, com a
   *   pulsação de cada volta (modulação na rotação, 1/4 da fundamental);
   * - turbina: o assobio agudo e baixo do turboélice (duas linhas próximas, que batem entre si);
   * - vento: sopro largo que cresce com a velocidade;
   * - um chiado baixo de rádio.
   * `speed` em unidades/s.
   */
  setDroneFpv(active: boolean, speed: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (!active) {
      if (!this.droneLoop) return;
      const loop = this.droneLoop;
      this.droneLoop = null;
      for (const g of [loop.propGain, loop.whineGain, loop.wind, loop.hiss]) g.gain.setTargetAtTime(0, t, 0.06);
      loop.rec?.gain.gain.setTargetAtTime(0, t, 0.06);
      setTimeout(() => loop.stop(), 600);
      return;
    }
    if (!this.droneLoop) {
      const out = this.out('combat', 1);
      // hélice: forma de onda com os harmônicos, filtro passa-baixa e a pulsação de cada volta
      const prop = ctx.createOscillator();
      prop.setPeriodicWave(this.propellerWave());
      prop.frequency.value = 120;
      const propFilter = ctx.createBiquadFilter();
      propFilter.type = 'lowpass';
      propFilter.frequency.value = 1400;
      propFilter.Q.value = 0.6;
      const propGain = ctx.createGain();
      propGain.gain.value = 0;
      const pulse = ctx.createGain();
      pulse.gain.value = 0.8;
      const am = ctx.createOscillator();
      am.frequency.value = 30;
      const amDepth = ctx.createGain();
      amDepth.gain.value = 0.22;
      am.connect(amDepth).connect(pulse.gain);
      prop.connect(propFilter).connect(pulse).connect(propGain).connect(out);
      prop.start();
      am.start();
      // turbina: assobio agudo
      const whineGain = ctx.createGain();
      whineGain.gain.value = 0;
      const whine = [1, 1.006].map((m) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 3600 * m;
        o.connect(whineGain);
        o.start();
        return o;
      });
      whineGain.connect(out);
      // vento e chiado de rádio
      const windSrc = this.noiseSource(true);
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 600;
      windFilter.Q.value = 0.5;
      const wind = ctx.createGain();
      wind.gain.value = 0;
      windSrc.connect(windFilter).connect(wind).connect(out);
      windSrc.start(0, Math.random());
      const hissSrc = this.noiseSource(true);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4000;
      const hiss = ctx.createGain();
      hiss.gain.value = 0;
      hissSrc.connect(hp).connect(hiss).connect(out);
      hissSrc.start(0, Math.random());
      // bordo gravado (lote 34): a hélice, a turbina e o vento sintetizados ficam mudos e a rotação muda a velocidade
      // da gravação
      const ready = this.useSamples ? SFX.droneOnboard.map((f) => this.sampleBufs.get(f)).filter((b): b is AudioBuffer => !!b) : [];
      let rec: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
      if (ready.length) {
        const buf = ready[Math.floor(Math.random() * ready.length)]!;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(out);
        src.start(t, Math.random() * buf.duration);
        rec = { src, gain };
      }
      this.droneLoop = {
        prop,
        am,
        amDepth,
        propGain,
        propFilter,
        whine,
        whineGain,
        wind,
        windFilter,
        hiss,
        rec,
        stop: () => {
          rec?.src.stop();
          prop.stop();
          am.stop();
          for (const o of whine) o.stop();
          windSrc.stop();
          hissSrc.stop();
        },
      };
    }
    const L = this.droneLoop;
    const k = Math.max(0, Math.min(1, (speed - 3) / 8));
    // rotação da hélice (passagem das pás) e da turbina sobem com o acelerador
    const bpf = 112 + k * 40;
    L.prop.frequency.setTargetAtTime(bpf, t, 0.25);
    L.am.frequency.setTargetAtTime(bpf / 4, t, 0.25);
    L.propFilter.frequency.setTargetAtTime(1100 + k * 900, t, 0.25);
    const synth = L.rec ? 0 : 1;
    L.propGain.gain.setTargetAtTime((0.16 + k * 0.06) * synth, t, 0.15);
    L.whine.forEach((o, i) => o.frequency.setTargetAtTime((3500 + k * 700) * (i ? 1.006 : 1), t, 0.3));
    L.whineGain.gain.setTargetAtTime((0.012 + k * 0.008) * synth, t, 0.2);
    L.windFilter.frequency.setTargetAtTime(450 + k * 900, t, 0.3);
    L.wind.gain.setTargetAtTime((0.05 + k * 0.16) * synth, t, 0.2);
    if (L.rec) {
      // a mesma subida de rotação do sintetizado (112 → 152 Hz, +36%) e um pouco mais de volume no acelerador
      L.rec.src.playbackRate.setTargetAtTime(0.9 + k * 0.32, t, 0.25);
      L.rec.gain.gain.setTargetAtTime(DRONE_ONBOARD_GAIN * (0.85 + k * 0.3), t, 0.15);
    }
    L.hiss.gain.setTargetAtTime(0.018, t, 0.3);
  }

  /**
   * Drone passando perto da câmera (visto do mapa): o zumbido da hélice chegando, passando e indo embora, com o tom
   * caindo na passagem (Doppler) e o volume pela distância; o assobio da turbina só perto.
   */
  private dronePass(t: number, out: AudioNode, gain: number, nodes: AudioScheduledSourceNode[]): number {
    const ctx = this.ctx!;
    const dur = 5;
    const tp = t + 2.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.35, tp - 1);
    env.gain.exponentialRampToValueAtTime(1, tp);
    env.gain.exponentialRampToValueAtTime(0.3, tp + 1.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(out);
    const wet = ctx.createGain();
    wet.gain.value = gain * 0.35;
    env.connect(wet).connect(this.outdoorReverb());
    const prop = ctx.createOscillator();
    prop.setPeriodicWave(this.propellerWave());
    prop.frequency.setValueAtTime(140, t);
    prop.frequency.setValueAtTime(138, tp - 0.4);
    prop.frequency.exponentialRampToValueAtTime(112, tp + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(2000, tp);
    lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = ctx.createGain();
    g.gain.value = 0.32;
    prop.connect(lp).connect(g).connect(env);
    prop.start(t);
    prop.stop(t + dur + 0.05);
    nodes.push(prop);
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(3900, t);
    whine.frequency.exponentialRampToValueAtTime(3300, tp + 0.6);
    const wg = ctx.createGain();
    wg.gain.value = 0.02;
    whine.connect(wg).connect(env);
    whine.start(t);
    whine.stop(t + dur + 0.05);
    nodes.push(whine);
    return t + dur + 0.1;
  }

  /** Uma gota: estalo curtíssimo e abafado (folha, telha ou poça), com altura e lado sorteados. */
  private rainDrop(at: number, rain: number): void {
    const ctx = this.ctx!;
    const out = this.out('ambient', 1, Math.random() * 1.6 - 0.8);
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    const roofy = Math.random() < 0.35;
    f.frequency.value = roofy ? 900 + Math.random() * 700 : 2400 + Math.random() * 2600;
    f.Q.value = 2.5 + Math.random() * 2;
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    const end = this.env(g, at, 0.002, (roofy ? 0.05 : 0.03) * (0.4 + rain * 0.6) * (0.5 + Math.random()), 0.02 + Math.random() * 0.03);
    n.start(at, Math.random() * 2);
    n.stop(end + 0.02);
  }

  /**
   * Trovão (canal ambiente) depois de `delay` s (a luz chega antes do som): perto, um estalo seco que rasga e o estrondo;
   * longe, só o ronco grave que rola e se repete pelas nuvens. `near` de 0 (longe) a 1 (em cima).
   */
  thunder(delay: number, near: number): void {
    if (!this.ready) return;
    // trovão gravado (lote 33): mais alto e mais agudo quando o raio cai perto
    if (this.useSamples && this.playExtra(SFX.thunder, 'ambient', (0.6 + near * 0.6) * THUNDER_GAIN, 0, 0.92 + near * 0.12, delay)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const out = this.out('ambient', 0.6 + near * 0.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    out.connect(wet).connect(this.outdoorReverb());
    const noise = (type: BiquadFilterType, freq: number, q: number, at: number, attack: number, peak: number, decay: number) => {
      const n = this.noiseSource(true);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(out);
      const end = this.env(g, at, attack, peak, decay);
      n.start(at, Math.random());
      n.stop(end + 0.1);
    };
    if (near > 0.5) {
      // estalo do raio: rasgos curtos em sequência
      for (let i = 0; i < 5; i++) noise('highpass', 1800 + Math.random() * 1500, 0.6, t + i * 0.035 + Math.random() * 0.02, 0.002, 0.5 * near, 0.08);
      noise('lowpass', 700, 0.7, t + 0.05, 0.01, 0.9 * near, 0.6);
    }
    // ronco: três ou quatro ondas graves, cada uma mais longe
    const rolls = 3 + Math.floor(Math.random() * 2);
    let at = t + (near > 0.5 ? 0.15 : 0);
    for (let i = 0; i < rolls; i++) {
      noise('lowpass', 260 - i * 40, 0.6, at, 0.25 + Math.random() * 0.3, (0.7 - i * 0.12) * (0.5 + near * 0.5), 1.4 + Math.random());
      at += 0.6 + Math.random() * 0.9;
    }
    noise('lowpass', 90, 0.5, t + 0.2, 0.6, 0.5, 4.5);
  }

  /** Fim da partida: silencia laços (ambiente, música, produção e alarme). */
  private engines = new Map<EngineClass, { gain: GainNode; pan: StereoPannerNode | null; stop: () => void }>();

  /**
   * Motores andando perto da câmera (lote 36): um laço gravado por classe, sempre o mesmo, cujo volume (`level` 0..1,
   * já somado e saturado por quem chama) e lado (`pan`) seguem as unidades em movimento. O laço só nasce na primeira
   * vez que a classe soa e fica tocando mudo depois. Sem a gravação, não há som de motor. Chamado ~4 vezes por segundo.
   */
  setEngines(mix: Partial<Record<EngineClass, { level: number; pan: number }>>): void {
    if (!this.ready || !this.useSamples) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const k of ['tracked', 'wheeled', 'naval'] as EngineClass[]) {
      const m = mix[k] ?? { level: 0, pan: 0 };
      let e = this.engines.get(k);
      if (!e) {
        if (m.level < 0.01) continue;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
        if (pan) gain.connect(pan).connect(this.buses.get('combat')!);
        else gain.connect(this.buses.get('combat')!);
        const stop = this.loopSample(ENGINE_SFX[k], gain, 1);
        if (!stop) continue;
        e = { gain, pan, stop };
        this.engines.set(k, e);
      }
      e.gain.gain.setTargetAtTime(ENGINE_GAIN[k] * m.level, t, 0.35);
      e.pan?.pan.setTargetAtTime(m.pan, t, 0.35);
    }
  }

  /** Apito do navio saindo do porto, posicionado como os sons de combate. */
  shipHorn(x: number, y: number): void {
    if (!this.ready || !this.useSamples) return;
    const sp = this.spatial(x, y);
    if (!sp || sp.gain < 0.03 || !this.gap('ship_horn', 4)) return;
    this.playExtra(SFX.shipHorn, 'combat', SHIP_HORN_GAIN * sp.gain, sp.pan, 0.97 + Math.random() * 0.06);
  }

  stopAll(): void {
    for (const e of this.engines.values()) e.stop();
    this.engines.clear();
    this.weatherLoop?.stop();
    this.weatherLoop = null;
    this.ambient?.stop();
    this.ambient = null;
    this.stopMusic();
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
