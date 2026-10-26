/**
 * Manual de entrada: o básico do jogo em cartões curtos, mostrado antes do menu principal até o
 * jogador chegar ao fim pelo menos uma vez (e sempre disponível pelo botão "Manual" do menu).
 * Regra de escrita: cada cartão cabe numa tela de celular, frases curtas, um assunto por cartão.
 */
export interface ManualCard {
  icon: string;
  title: string;
  /** Frase de abertura: a ideia central do cartão. */
  lead: string;
  points: string[];
  /** Dica em destaque (opcional). */
  tip?: string;
}

export const MANUAL: ManualCard[] = [
  {
    icon: '🎯',
    title: 'Sua missão',
    lead: 'Você governa um país real e comanda suas forças num teatro de operações em 3D.',
    points: [
      'Duas frentes ao mesmo tempo: o mapa de batalha (economia e exército) e o governo (orçamento, pesquisa e diplomacia).',
      'Vence quem destruir o Centro de Comando inimigo. Perdeu o seu, perdeu a partida.',
      'Os países usam dados reais (Banco Mundial e FMI): PIB, dívida e gastos fazem diferença.',
    ],
    tip: 'Os primeiros 12 minutos são de preparo: a IA não ataca. Use-os para montar a economia.',
  },
  {
    icon: '🚀',
    title: 'Primeiros minutos',
    lead: 'Uma ordem simples que funciona:',
    points: [
      '1. Selecione o Centro de Comando e forme cidadãos — eles são a sua mão de obra.',
      '2. Construa fazenda (solo fértil), serraria (floresta) e pedreira (rochas).',
      '3. Faça casas: sem moradia, a população não cresce.',
      '4. Construa a Base Militar, aliste recrutas e treine as primeiras tropas.',
      '5. Amplie silos e armazéns e comece as melhorias.',
    ],
  },
  {
    icon: '📦',
    title: 'Recursos',
    lead: 'Seis recursos movem o seu teatro; todos aparecem na barra superior.',
    points: [
      'Suprimentos: renda fixa do Centro de Comando. Comida, madeira, pedra, ferro e petróleo: vêm das construções de coleta.',
      'Cada coleta precisa do recurso ao lado: a mina, do minério; o poço, da jazida de petróleo e de um tanque por perto.',
      'O estoque é limitado: silo (comida), armazém (madeira, pedra, ferro) e tanque (petróleo). Cheio, a produção pausa.',
      'Depósitos se esgotam. Solo fértil não.',
    ],
  },
  {
    icon: '👥',
    title: 'População',
    lead: 'Pessoas são o recurso mais valioso.',
    points: [
      'Cidadãos (no Centro de Comando) trabalham nas construções. Sem trabalhadores, nada produz.',
      'Recrutas (na Base Militar) ficam na reserva e tripulam as tropas: cada unidade usa 1 recruta.',
      'Moradia: Centro de Comando 20, casa +10, prédio residencial +20 — teto de 200 habitantes.',
      'Todos comem. Sem comida, a produção cai pela metade.',
    ],
  },
  {
    icon: '⚔',
    title: 'Exército e guerra',
    lead: 'Atacar exige guerra declarada.',
    points: [
      'Base Militar: infantaria. Fábrica de Veículos: blindado, tanque e artilharia.',
      'Declare guerra pelo Globo (🌐). Sem guerra, as ordens de ataque são recusadas.',
      'Só se constrói no próprio território. Tropas em terra inimiga perdem vida aos poucos — um Veículo Blindado por perto mantém o suprimento.',
      'Torres de vigilância defendem e empurram a fronteira.',
    ],
  },
  {
    icon: '🏛',
    title: 'Nação e melhorias',
    lead: 'O governo financia a guerra.',
    points: [
      'Painel Nação (🏛): impostos, gastos, dívida, pesquisa e aprovação. Um dia passa a cada segundo.',
      'O US$ da barra é a verba de obras: sai do orçamento de infraestrutura e paga as melhorias.',
      'Selecione um prédio e toque em ⬆ Melhorar: até 10 níveis. No nível 6 você escolhe uma especialização, e ela é permanente.',
      'Pesquisas militares liberam modernizações: leve a tropa à base militar ou fábrica e toque no pacote.',
    ],
    tip: 'Botão apagado? Ele mostra o motivo (ex.: "sem recruta", "faltam 20 petróleo"). Toque para ver os detalhes.',
  },
  {
    icon: '🎮',
    title: 'Controles',
    lead: 'Computador ou celular, o jogo é o mesmo.',
    points: [
      'Computador: clique seleciona, arraste seleciona vários, botão direito move ou ataca. WASD move a câmera, Q/E gira, roda faz zoom.',
      'Atalhos: H Centro de Comando · F avançar atacando · X parar · Espaço pausa · G Nação · Tab Globo.',
      'Celular: toque seleciona, toque longo dá a ordem, arraste move a câmera, pinça faz zoom. A barra lateral troca a ferramenta.',
      '🏭 na barra mostra tudo o que está em produção. Use o botão de tela cheia para ganhar espaço.',
    ],
  },
];

const KEY = 'nc.manual.v1';

/** O jogador já leu o manual até o fim? */
export function manualRead(): boolean {
  try {
    return localStorage.getItem(KEY) === 'read';
  } catch {
    return false;
  }
}

export function markManualRead(): void {
  try {
    localStorage.setItem(KEY, 'read');
  } catch {
    // sem armazenamento: o manual volta a aparecer na próxima visita
  }
}

/** Tela que vem depois do login: o manual na primeira vez, o menu depois. */
export function screenAfterLogin(): 'manual' | 'menu' {
  return manualRead() ? 'menu' : 'manual';
}
