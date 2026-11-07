# Tutorial — roteiro (07/11)

> **Implementado** (ver [`TUTORIAL.md`](TUTORIAL.md)). Depois da aprovação entraram os capítulos **Alianças** (7) e
> **Comércio** (8), o capítulo 6 virou **Governo e eras**, e a Vitória passou a ser o 9. O texto que vale é o de
> `shared/tutorial/script.ts`; este documento fica como a proposta original.

Proposta de um tutorial jogável, roteirizado e narrado, para quem abre o jogo pela primeira vez. Nada implementado
ainda: este documento define o que acontece em cada passo, o que o narrador fala e o que faz o jogo avançar. Depois de
aprovado, vira a lista de passos do diretor (ver "Como vai funcionar", no fim).

## Objetivo e regras do roteiro

- **Meta:** em 12–15 minutos, a pessoa sai sabendo mover a câmera, montar a economia básica, ligar energia, recrutar,
  mover e atacar, olhar o governo e vencer uma partida pequena.
- **Uma frase por ação.** O narrador fala pouco; quem faz é o jogador. Nenhuma fala passa de ~8 segundos.
- **Sempre um objetivo na tela** (painel "Objetivo", no estilo Sala de Situação) e o botão certo iluminado.
- **Nunca trava:** cada passo tem uma ajuda extra se a pessoa ficar parada (30–45 s) e o diretor resolve sozinho se ela
  continuar presa (por exemplo, a obra fica pronta).
- **Pode pular** o capítulo ou o tutorial inteiro a qualquer momento, e **retomar** do capítulo onde parou.
- **Mapa sem pressa:** o inimigo só aparece quando o roteiro manda. Não há derrota no tutorial.
- **Interface liberada aos poucos:** o que ainda não foi ensinado fica escondido (governo, comércio, diplomacia, globo,
  força aérea, mísseis).

## Cenário

- **Mapa:** Continental pequeno (96×96), dia claro, sem chuva, era Guerra Fria.
- **Jogador:** o país escolhido no menu (ou Brasil por padrão). Começa como uma partida normal: Centro de Comando,
  Termelétrica a Carvão, estrada curta com postes, carvão em estoque e 11 cidadãos (`STARTING_CITIZENS`).
- **Em volta da base, de propósito:** solo fértil a ~6 células, floresta a ~8, rochas a ~8 e minério a ~12, todos à
  vista e do mesmo lado, para a câmera não precisar ir longe.
- **Inimigo:** "Força Vermelha", fora da névoa, a ~45 células. IA desligada. Base pequena: Centro de Comando com vida
  reduzida, uma Torre de Vigilância e 4 infantarias paradas. Já em guerra com o jogador (como no Sandbox), para não ter de
  ensinar a declaração de guerra antes da hora.
- **Velocidade:** obras e produção 3× mais rápidas que numa partida normal (o tutorial ensina a ordem, não a espera).
- **Recursos:** o bastante para o roteiro; se faltar, o diretor completa sem alarde.

## Capítulos e passos

Legenda das colunas: **Fala** = narrador (português; inglês e espanhol traduzidos depois). **Destaque** = o que fica
iluminado. **Avança quando** = condição verificada pelo servidor. **Ajuda** = o que aparece se a pessoa ficar parada.

### Capítulo 1 — O teatro de operações (~2 min)

| # | Fala | Destaque | Avança quando | Ajuda |
|---|---|---|---|---|
| 1.1 | "Comandante, bem-vindo. Este é o seu país. Vamos montar a sua primeira base." | — (câmera desce do alto até o Centro de Comando) | fim da fala | — |
| 1.2 | "Mova a câmera: W A S D no teclado, ou arraste com um dedo." | painel de objetivo "Mova a câmera" | câmera andou 10 células | animação das teclas / do dedo |
| 1.3 | "Agora aproxime e afaste: roda do mouse, ou pinça na tela." | — | zoom mudou nos dois sentidos | animação da roda / da pinça |
| 1.4 | "Clique no Centro de Comando. É o coração da base: se ele cair, você perde." | o Centro de Comando (anel pulsando) | QG selecionado | "Tecla H volta ao Centro de Comando." |
| 1.5 | "Embaixo aparecem as ações do prédio selecionado. Tudo tem um porquê: passe o mouse ou toque para ler." | painel de comando | 4 s | — |

### Capítulo 2 — Economia (~4 min)

| # | Fala | Destaque | Avança quando | Ajuda |
|---|---|---|---|---|
| 2.1 | "Pessoas são o seu recurso mais valioso: os cidadãos trabalham nas obras e na produção. Forme mais dois." | botão Cidadão no painel do QG | 2 cidadãos formados | "Cada cidadão custa comida. Veja a barra de cima." |
| 2.2 | "Comida vem da fazenda, e a fazenda só nasce em solo fértil, o verde mais escuro." | solo fértil (contorno no chão) | 3 s | — |
| 2.3 | "Abra o menu de construção — botão Construir, ou tecla B — e escolha a Fazenda." | botão Construir, depois Fazenda | modo de colocação da Fazenda aberto | seta no botão |
| 2.4 | "Coloque a fazenda no solo fértil iluminado." | área de solo fértil | fazenda colocada | o encaixe verde mostra onde pode |
| 2.5 | "Toda obra precisa de gente. Até quatro cidadãos trabalham juntos; sem nenhum, a obra para." | a obra e os cidadãos indo até ela | fazenda pronta | (o diretor manda um cidadão se não houver nenhum) |
| 2.6 | "Madeira e pedra vêm da serraria, junto à floresta, e da pedreira, junto às rochas. Construa as duas." | floresta e rochas | serraria e pedreira colocadas | "O prédio fica vermelho onde não pode." |
| 2.7 | "Repare nos números lá em cima: cada recurso tem a sua cor. Verde rende, vermelho custa." | barra de recursos | 4 s | — |
| 2.8 | "Sem moradia, a população não cresce. Construa uma casa." | Casa no menu | casa pronta | — |

### Capítulo 3 — Energia e estrada (~2 min)

| # | Fala | Destaque | Avança quando | Ajuda |
|---|---|---|---|---|
| 3.1 | "Quartéis e fábricas precisam de energia. Ela sai da termelétrica e anda pelas estradas, com os postes." | termelétrica e estrada inicial (fios acesos) | 4 s | — |
| 3.2 | "A energia alcança quatro células da estrada. Vamos estender: ferramenta Estrada, e arraste na grade." | botão Estrada; trecho sugerido no chão (pontilhado) | estrada de ≥5 células ligada à rede | "Cada célula custa pedra." |
| 3.3 | "A termelétrica queima carvão, que sai das minas. Fique de olho no indicador de energia." | indicador de energia na barra | 4 s | — |

### Capítulo 4 — Exército (~3 min)

| # | Fala | Destaque | Avança quando | Ajuda |
|---|---|---|---|---|
| 4.1 | "Hora de se defender. Construa a Base Militar perto da estrada, onde chega energia." | Base Militar no menu; área com energia | Base Militar pronta | "Longe da estrada, ela fica sem luz e para." |
| 4.2 | "Soldados precisam de recrutas. Na Base Militar, aliste dois recrutas." | botão Recruta | 2 recrutas | — |
| 4.3 | "Agora treine duas infantarias." | botão Infantaria | 2 infantarias prontas | — |
| 4.4 | "Selecione as tropas: clique numa, ou arraste uma caixa em volta das duas." | as duas infantarias | 2 tropas selecionadas | animação da caixa / "No celular, a barra lateral tem a seleção em grupo." |
| 4.5 | "Botão direito no chão para mover. No celular, toque longo. Leve-as até a bandeira." | bandeira no mapa (ponto de encontro) | tropas na bandeira (raio 3) | — |
| 4.6 | (o rádio responde "Entendido, a caminho.") "Ouviu? Cada ordem tem resposta pelo rádio." | — | fim da fala | — |

### Capítulo 5 — Primeiro combate (~2 min)

| # | Fala | Destaque | Avança quando | Ajuda |
|---|---|---|---|---|
| 5.1 | "Atenção: patrulha inimiga se aproximando pelo leste!" (sirene curta; o diretor solta 2 infantarias inimigas) | ponto do alerta no minimapa; câmera vai até elas | patrulha à vista | — |
| 5.2 | "Selecione as suas tropas e clique com o botão direito no inimigo para atacar." | as infantarias inimigas | ordem de ataque dada (ou combate começou) | "Tecla F: avançar atacando o que aparecer." |
| 5.3 | "Mais tropas, mais chance. Continue treinando na Base Militar enquanto lutam." | botão Infantaria | patrulha destruída | (o diretor enfraquece a patrulha se o jogador perder as duas tropas) |
| 5.4 | "Patrulha eliminada. Bom trabalho, comandante." | — | fim da fala | — |

### Capítulo 6 — O governo (~1,5 min)

| # | Fala | Destaque | Avança quando | Ajuda |
|---|---|---|---|---|
| 6.1 | "A guerra se paga no governo. Abra o painel Nação: botão Nação, ou tecla G." | botão Nação (liberado agora) | painel aberto | — |
| 6.2 | "Aqui ficam impostos, gastos e aprovação. O dinheiro do país é o US$ da barra de cima." | aba de orçamento e o US$ da barra | 5 s | — |
| 6.3 | "Pesquisas liberam prédios e tropas novas. Escolha uma e mande pesquisar." | aba Pesquisa | uma pesquisa iniciada | sugere a mais barata |
| 6.4 | "Feche o painel. A pesquisa anda sozinha, um dia por segundo." | botão fechar | painel fechado | — |

### Capítulo 7 — Vitória (~2 min)

| # | Fala | Destaque | Avança quando | Ajuda |
|---|---|---|---|---|
| 7.1 | "Encontramos a base da Força Vermelha. Destrua o Centro de Comando deles e a vitória é sua." | Centro de Comando inimigo (câmera mostra e volta) | fim da fala | — |
| 7.2 | "Junte pelo menos cinco tropas antes de avançar. A torre deles atira em quem chega perto." | contador "Tropas: 2/5" no objetivo | ≥5 tropas | — |
| 7.3 | "Selecione todas e ataque o Centro de Comando inimigo." | QG inimigo | QG inimigo destruído | após 2 min sem progresso: o diretor reduz a vida do QG inimigo |
| 7.4 | (fanfarra de era) "Vitória! Você já sabe o essencial. Na partida de verdade, a IA também constrói e ataca — e você tem oito minutos de preparo antes disso." | — | fim da fala | — |

### Encerramento

Tela final na moldura de console: "Tutorial concluído" com três botões:
- **Primeira partida contra a IA (Fácil)**, recomendado;
- **Ver o manual** (os cartões que já existem, agora como referência);
- **Menu principal**.

## Entrada, pular e retomar

- **Primeira vez** (nenhum tutorial concluído nem pulado nesta conta/aparelho): depois do login, em vez do manual,
  aparece "Primeira vez no comando? **Começar o tutorial** (12 min) · Pular". Quem pula vai para o manual, como hoje.
- **No menu**, botão fixo "Tutorial", com os capítulos para escolher (os já feitos marcados).
- **Durante o tutorial**, o painel de objetivo tem "Pular capítulo" e "Sair do tutorial". Sair guarda o capítulo.
- Pausar (Espaço) pausa também o narrador.

## Narração

- Uma voz de narrador diferente do rádio das tropas: tom de oficial de estado-maior, calmo e claro (ElevenLabs, uma
  voz por idioma: português do Brasil, inglês e espanhol). Gerada por fala, com legenda sempre visível.
- ~40 falas por idioma, 3–8 s cada. Volume no canal da interface; a música abaixa durante a fala.
- Sem a gravação (ou com o som desligado), a legenda basta: o tutorial nunca depende de ouvir.

## Medição

Cada passo tem um id (`1.1` a `7.4`). O cliente avisa o servidor ao começar e terminar cada passo, e o painel de
números passa a mostrar o funil: quantos começaram, quantos chegaram a cada capítulo, onde pularam e quanto tempo
cada passo levou. Assim dá para corrigir o passo que mais perde gente.

## Como vai funcionar (resumo técnico)

- **Modo de sala `tutorial`**, irmão do Sandbox: 1 jogador, IA desligada, inimigo pronto, guerra declarada, sem
  derrota e sem entrar no histórico.
- **Roteiro em dados** (`shared/tutorial/script.ts`): a lista de passos acima, cada um com fala, destaque,
  condição e ações.
- **Diretor no servidor:** confere as condições na simulação e nos eventos que ela já emite (obra concluída, unidade
  produzida, destruído...), executa as ações no mundo (soltar a patrulha, completar recursos, enfraquecer o inimigo) e
  manda ao cliente só o passo atual. O cliente nunca muda a partida por conta própria (regra do KAC).
- **Cliente:** painel de objetivo, destaque (escurece a tela e ilumina o elemento), câmera roteirizada, narração e
  legendas. Os botões ensinados ganham um identificador fixo, e um teste confere que todo destaque do roteiro existe.

## Decisões para o responsável

1. **Duração:** 7 capítulos (~15 min) ou só os capítulos 1–5 (~12 min), deixando governo e vitória para a primeira
   partida real com uma lista de objetivos?
2. **Guerra já declarada no tutorial** (mais simples) ou ensinar a declarar pelo Globo no capítulo 5?
3. **Velocidade 3×** nas obras e produção do tutorial: ok?
4. **Voz do narrador:** masculina ou feminina? (Posso gerar duas amostras para escolher.)
5. **Substituir o manual na primeira entrada** pelo convite ao tutorial (o manual continua no menu)?
