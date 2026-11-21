/**
 * Manual de entrada: o básico do jogo em cartões curtos, mostrado antes do menu principal até o
 * jogador chegar ao fim pelo menos uma vez (e sempre disponível pelo botão "Manual" do menu).
 * Regra de escrita: cada cartão cabe numa tela de celular, frases curtas, um assunto por cartão.
 */
import { Flag, Gamepad2, Landmark, Package, Ship, Swords, Target, Users, type LucideIcon } from 'lucide-react';
import { tutorialSeen } from '../state/useTutorialStore.ts';

export interface ManualCard {
  icon: LucideIcon;
  title: string;
  /** Frase de abertura: a ideia central do cartão. */
  lead: string;
  points: string[];
  /** Dica em destaque (opcional). */
  tip?: string;
}

export const MANUAL: ManualCard[] = [
  {
    icon: Target,
    title: 'Sua missão',
    lead: 'Você governa um país e comanda suas forças num teatro de operações em 3D.',
    points: [
      'Duas frentes ao mesmo tempo: o mapa de batalha (economia e exército) e o governo (orçamento, pesquisa e diplomacia).',
      'Vence quem destruir o Centro de Comando inimigo. Perdeu o seu, perdeu a partida.',
      'Todos os países começam iguais; cada um tem um bônus próprio, mostrado no cartão do país na sala.',
    ],
    tip: 'Os primeiros minutos são de preparo (8 no Normal): a IA não declara guerra. Use-os para montar a economia.',
  },
  {
    icon: Flag,
    title: 'Primeiros minutos',
    lead: 'Uma ordem simples que funciona:',
    points: [
      '1. Mande o Explorador para o centro do mapa: é o encontro com as outras nações que libera diplomacia e guerra.',
      '2. Selecione o Centro de Comando e forme cidadãos: eles são a sua mão de obra.',
      '3. Construa fazenda (solo fértil), serraria (floresta) e pedreira (rochas), e casas antes de lotar a moradia.',
      '4. Construa a Base Militar, aliste recrutas e treine as primeiras tropas.',
      '5. Amplie silos e armazéns e comece as melhorias.',
    ],
  },
  {
    icon: Package,
    title: 'Recursos',
    lead: 'Sete recursos movem a sua base; todos aparecem na barra superior.',
    points: [
      'Suprimentos: renda fixa do Centro de Comando. Comida, madeira, pedra, ferro e petróleo vêm das construções de coleta; o carvão sai da mina, junto com o ferro.',
      'Cada coleta precisa do recurso ao lado: a mina, do minério; o poço, da jazida de petróleo e de um tanque por perto.',
      'O estoque é limitado: silo (comida), armazém (madeira, pedra, ferro) e tanque (petróleo). Cheio, a produção pausa.',
      'Depósitos se esgotam. Solo fértil não.',
      'Combustível ⛽: veículos e navios gastam petróleo ao andar (o Combustível da Refinaria sai primeiro). Sem nenhum dos dois, andam a meia velocidade.',
    ],
  },
  {
    icon: Users,
    title: 'População',
    lead: 'Pessoas são o recurso mais valioso.',
    points: [
      'Cidadãos trabalham nas construções e erguem as obras (até 4 por obra); sem eles, nada produz.',
      'Recrutas (na Base Militar) ficam na reserva e tripulam as tropas: cada unidade usa 1 recruta (navios usam a tripulação inteira; o porta-aviões, também os 4 pilotos).',
      'Moradia: Centro de Comando 20, casa +10, prédio residencial +20, com teto de 500 habitantes.',
      'Todos comem. Sem comida, a produção cai pela metade.',
    ],
  },
  {
    icon: Swords,
    title: 'Exército e guerra',
    lead: 'Atacar exige guerra declarada.',
    points: [
      'Base Militar: infantaria. Fábrica de Veículos: blindado, tanque e artilharia.',
      'Encontre o inimigo e declare guerra pelo Globo (Tab). Sem guerra, as ordens de ataque são recusadas.',
      'Só se constrói no próprio território. Tropas em terra inimiga perdem vida aos poucos; um Veículo Blindado por perto mantém o suprimento.',
      'Engenheiro de Combate: minas antitanque, invisíveis ao inimigo, que só explodem com veículos. Engenheiros e forças especiais acham as minas do outro lado.',
      'Base Aérea: reconhecimento revela alvos; caças só atacam o que já foi descoberto. Mísseis exigem preparar, confirmar o alvo e segurar o botão de autorização.',
    ],
  },
  {
    icon: Ship,
    title: 'Mar, ar e estradas',
    lead: 'Navios, aviões e estradas levam o exército longe.',
    points: [
      'Embarque: selecione as tropas e clique com o botão direito no L402 ou na fragata. Com o navio selecionado, botão direito na terra desembarca.',
      'Paraquedistas: o C-5 Galaxy (Base Aérea nível 2) leva 12 soldados e 3 veículos ao ponto escolhido.',
      'Estrada: leva energia a até 4 células, acelera as tropas e dá +15% de produção ao que estiver ligado ao Centro de Comando.',
      'Rodovia: sai da fronteira sem engenheiro, só por terra neutra, e dobra a velocidade das cargas, mas não leva energia.',
      'Ilha desabitada: leve uma tropa ou navio e construa uma prefeitura a até 8 células (colônia).',
    ],
  },
  {
    icon: Landmark,
    title: 'Nação e melhorias',
    lead: 'O governo financia a guerra.',
    points: [
      'Painel Nação (G): impostos, as sete áreas do orçamento, pesquisa e aprovação. Um dia passa a cada segundo.',
      'O US$ da barra é o caixa do país: produção e impostos entram, manutenção e o orçamento saem. Toque para ver o extrato.',
      'Selecione um prédio e toque em ⬆ Melhorar: até 10 níveis. No nível 6 você escolhe uma especialização, e ela é permanente.',
      'Depois do encontro, o Globo oferece pactos de não agressão e alianças com as nações do mapa; aliados dividem a visão e trocam recursos.',
    ],
    tip: 'Botão apagado? Ele mostra o motivo (ex.: "sem recruta", "faltam 20 petróleo"). Toque para ver os detalhes.',
  },
  {
    icon: Gamepad2,
    title: 'Controles',
    lead: 'Computador ou celular, o jogo é o mesmo.',
    points: [
      'Computador: clique seleciona, arraste seleciona vários, botão direito move ou ataca. WASD move a câmera, Q/E gira, roda faz zoom.',
      'Atalhos: H Centro de Comando · B Construir · F avançar atacando · X parar · Espaço pausa · G Nação · Tab Globo.',
      'Roda de ferramentas (canto de baixo à direita): Construir, Pesquisa, Nação, Diplomacia, Comércio e Globo.',
      'Celular: toque seleciona, toque longo dá a ordem, arraste move a câmera, pinça faz zoom.',
      'A conexão caiu? Abra o jogo de novo na mesma conta: ele volta para a partida.',
    ],
    tip: 'Tudo em detalhe: o Guia do Comandante (PDF), no botão do alto.',
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

/** O Guia do Comandante em PDF (public/guia/), no idioma da tela. */
export function guideUrl(lang: string): string {
  if (lang === 'en') return '/guia/commanders-guide.pdf';
  if (lang === 'es') return '/guia/guia-del-comandante.pdf';
  return '/guia/guia-do-comandante.pdf';
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
  // primeira visita (07/11): o menu com o convite para o tutorial no lugar do manual (que segue no botão Manual)
  if (!tutorialSeen()) return 'menu';
  return manualRead() ? 'menu' : 'manual';
}
