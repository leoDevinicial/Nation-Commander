/**
 * Tutorial (07/11, `docs/TUTORIAL.md`): o roteiro em dados. O diretor do servidor (`server/tutorial/Director.ts`) anda
 * por estes passos, confere as condições na simulação e manda ao cliente só o passo atual (`TutorialView`); o cliente
 * mostra a fala, o objetivo e o destaque e toca a narração (`public/narration/<idioma>/<id>.mp3`).
 *
 * Regras de escrita: uma frase por ação, falas curtas (até ~8 s), o jogador fazendo. Texto em português; as traduções
 * ficam nos dicionários de `src/i18n/` (o texto chega à tela e é traduzido como o resto da interface).
 */
import type { BuildingType, UnitType } from '../sim/config.ts';

/** Fatos que só o cliente vê (câmera, seleção, painéis); o servidor só os aceita no passo que os pede. */
export type TutorialFact =
  | 'camera_moved'
  | 'zoomed'
  | 'hq_selected'
  | 'build_menu'
  | 'units_selected'
  | 'nation_open'
  | 'nation_tab_research'
  | 'nation_tab_diplomacy'
  | 'nation_tab_trade'
  | 'nation_closed';
export const TUTORIAL_FACTS: readonly TutorialFact[] = [
  'camera_moved',
  'zoomed',
  'hq_selected',
  'build_menu',
  'units_selected',
  'nation_open',
  'nation_tab_research',
  'nation_tab_diplomacy',
  'nation_tab_trade',
  'nation_closed',
];

/** Pontos do mapa que o diretor calcula na hora (marcador pulsando no chão e alvo da câmera). */
export type TutorialMark =
  | 'hq'
  | 'fertile'
  | 'forest'
  | 'rock'
  | 'power'
  | 'rally'
  | 'patrol'
  | 'my_units'
  | 'ally_hq'
  | 'ally_highway_end'
  | 'enemy_hq';

/** Condição para avançar, conferida pelo servidor a cada meio segundo de jogo. */
export type TutorialCond =
  /** fim da fala (tempo estimado pelo tamanho do texto) */
  | { k: 'speech' }
  | { k: 'fact'; fact: TutorialFact }
  /** mais `n` cidadãos ou recrutas do que havia no começo do passo */
  | { k: 'more'; what: 'citizens' | 'recruits'; n: number }
  /** `n` construções do tipo (prontas com `done`; em obra também, sem) */
  | { k: 'built'; type: BuildingType; n?: number; done?: boolean }
  | { k: 'units'; type: UnitType; n: number }
  /** tropas de terra (militares) vivas */
  | { k: 'army'; n: number }
  /** `n` tropas próprias perto do ponto de encontro */
  | { k: 'at_rally'; n: number }
  /** mais `n` células de estrada própria do que no começo do passo */
  | { k: 'road_more'; n: number }
  | { k: 'patrol_dead' }
  | { k: 'researching' }
  | { k: 'era'; era: number }
  | { k: 'alliance' }
  /** rota de caminhão entre o Terminal Comercial do jogador e o do aliado */
  | { k: 'truck_route' }
  | { k: 'listed' }
  | { k: 'delivered' }
  | { k: 'enemy_defeated' };

/** Ações do diretor no mundo (servidor). */
export type TutorialAction =
  | 'spawn_patrol'
  | 'weaken_patrol'
  | 'start_era'
  | 'grant_trade'
  | 'meet_ally'
  | 'ally_propose'
  | 'ally_accept_pact'
  | 'ally_market'
  | 'ally_highway'
  | 'finish_highway'
  | 'ally_buy'
  | 'reveal_enemy'
  | 'weaken_enemy'
  | 'finish_obra'
  | 'grant_army';

export interface TutorialStep {
  id: string;
  /** Fala do narrador (e legenda). */
  text: string;
  /** Objetivo curto no painel (sem ele, o painel mostra só a fala). */
  objective?: string;
  /** Elementos da interface a destacar (`data-tour`), em ordem de preferência: o primeiro que existir na tela. */
  anchor?: string[];
  /** Marcador no mapa. */
  mark?: TutorialMark;
  /** A câmera vai até este ponto ao começar o passo. */
  camera?: TutorialMark;
  cond: TutorialCond;
  /** Dica extra se a pessoa ficar parada `helpAfter` s (padrão 35). */
  help?: string;
  helpAfter?: number;
  /** O diretor resolve sozinho depois de `after` s (o tutorial nunca trava). */
  auto?: { after: number; action: TutorialAction };
  /** Ações ao começar o passo. */
  enter?: TutorialAction[];
}

export interface TutorialChapter {
  id: number;
  title: string;
  /** Partes da interface liberadas a partir deste capítulo (antes, escondidas). */
  unlocks?: TutorialFeature[];
  steps: TutorialStep[];
}

/** Partes da interface que o tutorial esconde até a hora certa. */
export type TutorialFeature = 'nation' | 'globe';

export const TUTORIAL: TutorialChapter[] = [
  {
    id: 1,
    title: 'O teatro de operações',
    steps: [
      { id: '1.1', text: 'Comandante, bem-vindo. Este é o seu país. Vamos montar a sua primeira base.', camera: 'hq', cond: { k: 'speech' } },
      {
        id: '1.2',
        text: 'Mova a câmera: W, A, S, D no teclado, ou arraste com um dedo.',
        objective: 'Mova a câmera',
        cond: { k: 'fact', fact: 'camera_moved' },
        help: 'As setas do teclado também funcionam. No celular, arraste um dedo pela tela.',
      },
      {
        id: '1.3',
        text: 'Agora aproxime e afaste: roda do mouse, ou pinça na tela.',
        objective: 'Aproxime e afaste a câmera',
        cond: { k: 'fact', fact: 'zoomed' },
        help: 'Gire a roda do mouse para os dois lados. No celular, abra e feche dois dedos.',
      },
      {
        id: '1.4',
        text: 'Clique no Centro de Comando. É o coração da base: se ele cair, você perde.',
        objective: 'Selecione o Centro de Comando',
        mark: 'hq',
        camera: 'hq',
        cond: { k: 'fact', fact: 'hq_selected' },
        help: 'A tecla H leva a câmera até ele. Depois, clique no prédio.',
      },
      {
        id: '1.5',
        text: 'Embaixo aparecem as ações do que estiver selecionado. Passe o mouse ou toque num botão para ler o que ele faz.',
        anchor: ['command-panel'],
        cond: { k: 'speech' },
      },
    ],
  },
  {
    id: 2,
    title: 'Economia',
    steps: [
      {
        id: '2.1',
        text: 'Os cidadãos trabalham nas obras e na produção. Forme mais dois no Centro de Comando.',
        objective: 'Forme 2 cidadãos',
        anchor: ['Cidadão', 'build-button'],
        cond: { k: 'more', what: 'citizens', n: 2 },
        help: 'Clique no Centro de Comando (a tecla H mostra onde ele está) e toque em Cidadão duas vezes. Cada um custa comida.',
      },
      {
        id: '2.2',
        text: 'A comida vem da fazenda, e a fazenda só nasce em solo fértil, o verde mais escuro.',
        mark: 'fertile',
        camera: 'fertile',
        cond: { k: 'speech' },
      },
      {
        id: '2.3',
        text: 'Abra o menu de construção: botão Construir, ou tecla B.',
        objective: 'Abra o menu de construção',
        anchor: ['build-button'],
        cond: { k: 'fact', fact: 'build_menu' },
      },
      {
        id: '2.4',
        text: 'Escolha a Fazenda e coloque-a no solo fértil marcado.',
        objective: 'Construa uma Fazenda no solo fértil',
        anchor: ['Fazenda', 'tab:production', 'build-button'],
        mark: 'fertile',
        cond: { k: 'built', type: 'farm' },
        help: 'O contorno fica verde onde pode construir e vermelho onde não pode. Clique para confirmar.',
      },
      {
        id: '2.5',
        text: 'Toda obra precisa de gente: até quatro cidadãos trabalham nela. Sem nenhum, a obra para.',
        objective: 'Espere a Fazenda ficar pronta',
        cond: { k: 'built', type: 'farm', done: true },
        auto: { after: 45, action: 'finish_obra' },
      },
      {
        id: '2.6',
        text: 'A madeira sai da serraria, junto à floresta. Construa uma.',
        objective: 'Construa uma Serraria junto à floresta',
        anchor: ['Serraria', 'tab:production', 'build-button'],
        mark: 'forest',
        camera: 'forest',
        cond: { k: 'built', type: 'sawmill' },
        help: 'A serraria precisa de floresta ao lado: o número no contorno mostra quanta madeira ela vai tirar.',
      },
      {
        id: '2.7',
        text: 'E a pedra sai da pedreira, junto às rochas.',
        objective: 'Construa uma Pedreira junto às rochas',
        anchor: ['Pedreira', 'tab:production', 'build-button'],
        mark: 'rock',
        camera: 'rock',
        cond: { k: 'built', type: 'quarry' },
      },
      {
        id: '2.8',
        text: 'Lá em cima ficam os seus recursos, cada um com a sua cor. Passe o mouse para ver quanto entra e quanto sai.',
        anchor: ['topbar:resources'],
        cond: { k: 'speech' },
      },
      {
        id: '2.9',
        text: 'Sem moradia, a população não cresce. Construa uma casa.',
        objective: 'Construa uma Casa',
        anchor: ['Casa', 'tab:civic', 'build-button'],
        camera: 'hq',
        cond: { k: 'built', type: 'house', done: true },
        help: 'A casa fica na aba Cívicas do menu de construção.',
        auto: { after: 90, action: 'finish_obra' },
      },
    ],
  },
  {
    id: 3,
    title: 'Energia e estradas',
    steps: [
      {
        id: '3.1',
        text: 'Quartéis e fábricas precisam de energia. Ela sai da termelétrica e anda pelas estradas, pelos postes.',
        mark: 'power',
        camera: 'power',
        cond: { k: 'speech' },
      },
      {
        id: '3.2',
        text: 'A luz alcança quatro células da estrada. Vamos estender: ferramenta Estrada, e arraste na grade.',
        objective: 'Construa 5 células de estrada ligadas à sua',
        anchor: ['Estrada', 'tab:civic', 'build-button'],
        cond: { k: 'road_more', n: 5 },
        help: 'Marque as células com um clique ou arrastando, a partir da estrada que já existe, e confirme em Construir (Enter).',
      },
      {
        id: '3.3',
        text: 'A termelétrica queima carvão, que sai das minas. Fique de olho no indicador de energia.',
        anchor: ['topbar:power'],
        cond: { k: 'speech' },
      },
    ],
  },
  {
    id: 4,
    title: 'Exército',
    steps: [
      {
        id: '4.1',
        text: 'Hora de se defender. Construa a Base Militar perto da estrada, onde chega energia.',
        objective: 'Construa a Base Militar',
        anchor: ['Base Militar', 'tab:military', 'build-button'],
        camera: 'hq',
        cond: { k: 'built', type: 'barracks', done: true },
        help: 'A Base Militar fica na aba Militares. Longe da estrada, ela fica sem luz e para.',
        auto: { after: 120, action: 'finish_obra' },
      },
      {
        id: '4.2',
        text: 'Soldados precisam de recrutas. Na Base Militar, aliste dois.',
        objective: 'Aliste 2 recrutas',
        anchor: ['Recruta'],
        cond: { k: 'more', what: 'recruits', n: 2 },
        help: 'Selecione a Base Militar e toque em Recruta. Ela precisa de cidadãos livres para trabalhar: forme mais no Centro de Comando se faltar.',
      },
      {
        id: '4.3',
        text: 'Agora treine duas infantarias.',
        objective: 'Treine 2 infantarias',
        anchor: ['Infantaria'],
        cond: { k: 'units', type: 'infantry', n: 2 },
        help: 'Ainda na Base Militar, toque em Infantaria. Cada uma usa um recruta.',
      },
      {
        id: '4.4',
        text: 'Selecione as tropas: clique numa, ou arraste uma caixa em volta das duas.',
        objective: 'Selecione as suas tropas',
        mark: 'my_units',
        camera: 'my_units',
        cond: { k: 'fact', fact: 'units_selected' },
        help: 'No celular, a barra lateral tem a ferramenta de seleção em grupo.',
      },
      {
        id: '4.5',
        text: 'Botão direito no chão para mover; no celular, toque longo. Leve-as até a bandeira.',
        objective: 'Leve as tropas até a bandeira',
        mark: 'rally',
        cond: { k: 'at_rally', n: 2 },
      },
      { id: '4.6', text: 'Ouviu o rádio? Cada ordem tem resposta.', cond: { k: 'speech' } },
    ],
  },
  {
    id: 5,
    title: 'Primeiro combate',
    steps: [
      {
        id: '5.1',
        text: 'Atenção: patrulha inimiga se aproximando!',
        enter: ['spawn_patrol'],
        mark: 'patrol',
        camera: 'patrol',
        cond: { k: 'speech' },
      },
      {
        id: '5.2',
        text: 'Selecione as suas tropas e clique com o botão direito no inimigo para atacar. Continue treinando enquanto lutam.',
        objective: 'Elimine a patrulha',
        mark: 'patrol',
        cond: { k: 'patrol_dead' },
        help: 'A tecla F manda avançar atacando o que aparecer pelo caminho.',
        auto: { after: 90, action: 'weaken_patrol' },
      },
      { id: '5.3', text: 'Patrulha eliminada. Bom trabalho, comandante.', cond: { k: 'speech' } },
    ],
  },
  {
    id: 6,
    title: 'Governo e eras',
    unlocks: ['nation'],
    steps: [
      {
        id: '6.1',
        text: 'A guerra se paga no governo. Abra o painel Nação: o botão com o prédio de colunas, no alto à direita.',
        objective: 'Abra o painel Nação',
        anchor: ['topbar:nation', 'topbar:more'],
        cond: { k: 'fact', fact: 'nation_open' },
      },
      {
        id: '6.2',
        text: 'Aqui ficam impostos, gastos e aprovação. O caixa do país é o dólar da barra de cima.',
        anchor: ['topbar:usd'],
        cond: { k: 'speech' },
      },
      {
        id: '6.3',
        text: 'Pesquisas liberam prédios e tropas novas. Abra a aba Pesquisa.',
        objective: 'Abra a aba Pesquisa',
        anchor: ['nation-tab:research', 'topbar:nation'],
        cond: { k: 'fact', fact: 'nation_tab_research' },
      },
      {
        id: '6.4',
        text: 'Escolha uma pesquisa e mande pesquisar. Ela anda sozinha, um dia por segundo.',
        objective: 'Comece uma pesquisa',
        anchor: ['research-start', 'nation-tab:research'],
        cond: { k: 'researching' },
        help: 'Qualquer uma serve. O custo sai do caixa do país e dos pontos de conhecimento.',
      },
      {
        id: '6.5',
        text: 'Cada era troca a aparência do país e libera coisas novas. Para o tutorial, vamos avançar agora para a Pós-Guerra Fria.',
        enter: ['start_era'],
        camera: 'hq',
        cond: { k: 'era', era: 2 },
      },
      {
        id: '6.6',
        text: 'Numa partida, o avanço de era é uma obra no Centro de Comando, com nível mínimo do QG e pesquisa. Feche o painel.',
        objective: 'Feche o painel Nação',
        cond: { k: 'fact', fact: 'nation_closed' },
      },
    ],
  },
  {
    id: 7,
    title: 'Alianças',
    unlocks: ['globe'],
    steps: [
      {
        id: '7.1',
        text: 'Encontramos um vizinho. Só depois do encontro no mapa há guerra, pacto ou comércio com uma nação.',
        enter: ['meet_ally'],
        mark: 'ally_hq',
        camera: 'ally_hq',
        cond: { k: 'speech' },
      },
      {
        id: '7.2',
        text: 'Eles propuseram uma aliança. Abra o painel Nação, aba Diplomacia.',
        enter: ['ally_propose'],
        objective: 'Abra a aba Diplomacia',
        anchor: ['nation-tab:diplomacy', 'topbar:nation', 'topbar:more'],
        cond: { k: 'fact', fact: 'nation_tab_diplomacy' },
      },
      {
        id: '7.3',
        text: 'Aceite o convite. Quem propõe paga para firmar; quem rompe depois paga uma indenização.',
        enter: ['ally_propose'],
        objective: 'Aceite a aliança',
        anchor: ['offer-accept', 'nation-tab:diplomacy'],
        cond: { k: 'alliance' },
        auto: { after: 90, action: 'ally_accept_pact' },
      },
      {
        id: '7.4',
        text: 'Aliados veem o que o outro vê, não se atacam e podem mandar tropas e recursos um para o outro.',
        camera: 'ally_hq',
        cond: { k: 'speech' },
      },
      {
        id: '7.5',
        text: 'Com tropas selecionadas, o cartão Auxiliar manda ajuda ao aliado. Na ficha do país, Enviar recursos manda carga por caminhão, navio ou avião.',
        cond: { k: 'speech' },
      },
    ],
  },
  {
    id: 8,
    title: 'Comércio',
    steps: [
      {
        id: '8.1',
        text: 'Comércio. Liberamos as pesquisas de Comércio exterior e Engenharia rodoviária. Construa um Terminal Comercial colado à sua estrada.',
        enter: ['grant_trade', 'ally_market'],
        objective: 'Construa um Terminal Comercial junto à estrada',
        anchor: ['Terminal Comercial', 'tab:civic', 'build-button'],
        camera: 'hq',
        cond: { k: 'built', type: 'market', done: true },
        help: 'O terminal fica na aba Cívicas. Encoste-o na estrada: é por ela que saem os caminhões.',
        auto: { after: 150, action: 'finish_obra' },
      },
      {
        id: '8.2',
        text: 'O aliado trouxe uma rodovia até a sua fronteira. A rodovia sai do país pela terra neutra, nunca pelo território de outra nação.',
        enter: ['ally_highway'],
        mark: 'ally_highway_end',
        camera: 'ally_highway_end',
        cond: { k: 'speech' },
      },
      {
        id: '8.3',
        text: 'Ligue a sua estrada à rodovia dele: ferramenta Rodovia, e arraste até a marca.',
        objective: 'Ligue o seu terminal à rodovia do aliado',
        anchor: ['Rodovia', 'tab:civic', 'build-button'],
        mark: 'ally_highway_end',
        cond: { k: 'truck_route' },
        help: 'Comece numa estrada sua e vá até a ponta da rodovia do aliado. Até 40 células por vez.',
        auto: { after: 150, action: 'finish_highway' },
      },
      {
        id: '8.4',
        text: 'Agora anuncie uma venda. Painel Nação, aba Comércio.',
        objective: 'Abra a aba Comércio',
        anchor: ['nation-tab:trade', 'topbar:nation', 'topbar:more'],
        cond: { k: 'fact', fact: 'nation_tab_trade' },
      },
      {
        id: '8.5',
        text: 'Escolha um recurso que sobra, a quantidade e o preço, e anuncie.',
        objective: 'Anuncie uma venda',
        anchor: ['trade-list', 'nation-tab:trade'],
        cond: { k: 'listed' },
        help: 'A mercadoria sai do estoque ao anunciar e volta se o anúncio for retirado.',
      },
      {
        id: '8.6',
        text: 'O aliado comprou. O caminhão vai pela rodovia, e o dinheiro só entra na chegada.',
        enter: ['ally_buy'],
        objective: 'Espere a carga chegar',
        cond: { k: 'delivered' },
      },
      {
        id: '8.7',
        text: 'Também dá para vender por navio, com porto dos dois lados e um cargueiro, ou por avião, com aeroporto e avião de carga. Quem está em guerra com uma das partes pode atacar a carga.',
        anchor: ['trade-modes', 'nation-tab:trade'],
        cond: { k: 'speech' },
      },
      {
        id: '8.8',
        text: 'Feche o painel. Falta a última missão.',
        objective: 'Feche o painel Nação',
        cond: { k: 'fact', fact: 'nation_closed' },
      },
    ],
  },
  {
    id: 9,
    title: 'Vitória',
    steps: [
      {
        id: '9.1',
        text: 'Encontramos a base da Força Vermelha. Destrua o Centro de Comando deles e a vitória é sua.',
        enter: ['reveal_enemy'],
        mark: 'enemy_hq',
        camera: 'enemy_hq',
        cond: { k: 'speech' },
      },
      {
        id: '9.2',
        text: 'Junte pelo menos cinco tropas antes de avançar. A torre deles atira em quem chega perto.',
        objective: 'Tenha 5 tropas',
        anchor: ['Infantaria', 'Base Militar'],
        camera: 'hq',
        cond: { k: 'army', n: 5 },
        auto: { after: 150, action: 'grant_army' },
      },
      {
        id: '9.3',
        text: 'Selecione todas e ataque o Centro de Comando inimigo. A rodovia deixa as tropas mais rápidas.',
        objective: 'Destrua o Centro de Comando inimigo',
        mark: 'enemy_hq',
        cond: { k: 'enemy_defeated' },
        help: 'Arraste uma caixa em volta das tropas e clique com o botão direito no Centro de Comando inimigo.',
        auto: { after: 180, action: 'weaken_enemy' },
      },
      {
        id: '9.4',
        text: 'Vitória! Você já sabe o essencial. Na partida de verdade, a IA também constrói e ataca, e você tem oito minutos de preparo antes disso.',
        cond: { k: 'speech' },
      },
    ],
  },
];

/** Todos os passos em ordem, com o capítulo de cada um. */
export const TUTORIAL_STEPS: { chapter: TutorialChapter; step: TutorialStep }[] = TUTORIAL.flatMap((chapter) => chapter.steps.map((step) => ({ chapter, step })));

/** Duração estimada da fala (s): ~2,6 palavras por segundo e uma pausa no fim (cobre as gravações em pt, en e es). */
export function speechSeconds(text: string): number {
  return Math.max(3, text.split(/\s+/).length / 2.6 + 2.2);
}

/** O que o cliente recebe a cada mudança do tutorial (nunca o roteiro inteiro). */
export interface TutorialView {
  chapter: number;
  chapters: number;
  title: string;
  step: string;
  /** Posição do passo no tutorial (0..total-1). */
  index: number;
  total: number;
  text: string;
  objective: string | null;
  anchor: string[];
  /** Marcadores no mapa (unidades de mundo). */
  marks: { x: number; y: number }[];
  /** Alvo da câmera ao começar o passo (null: não mexe). */
  camera: { x: number; y: number } | null;
  help: string | null;
  /** Contador do objetivo (ex.: 2/5 tropas). */
  progress: { have: number; need: number } | null;
  /** Fato do cliente que este passo espera. */
  fact: TutorialFact | null;
  /** Partes da interface ainda escondidas. */
  locked: TutorialFeature[];
  /** Tutorial concluído. */
  done: boolean;
}
