# Tutorial (07/11)

Partida roteirizada e narrada para quem joga pela primeira vez: 9 capítulos, 49 passos, ~15 minutos. Pedido do
responsável depois de ver no painel de números que muita gente saía cedo por não saber jogar. O roteiro aprovado está em
[`TUTORIAL_ROTEIRO.md`](TUTORIAL_ROTEIRO.md); o roteiro que vale é o de `shared/tutorial/script.ts`.

## Capítulos

| # | Capítulo | O que ensina |
|---|---|---|
| 1 | O teatro de operações | câmera (mover e zoom), Centro de Comando, painel de comando |
| 2 | Economia | cidadãos, fazenda no solo fértil, construtores, serraria, pedreira, barra de recursos, casa |
| 3 | Energia e estradas | termelétrica, postes, estender a estrada, carvão |
| 4 | Exército | Base Militar junto à energia, recrutas, infantaria, selecionar, mover, rádio |
| 5 | Primeiro combate | patrulha inimiga roteirizada, atacar |
| 6 | Governo e eras | painel Nação, caixa do país, pesquisa, avanço para a Pós-Guerra Fria |
| 7 | Alianças | encontro no mapa, convite de aliança (aceitar), visão compartilhada, Auxiliar e Enviar recursos |
| 8 | Comércio | Terminal Comercial, rodovia do aliado até a fronteira, ligar a sua, anunciar, caminhão e pagamento na chegada; navio e avião explicados |
| 9 | Vitória | juntar 5 tropas e destruir o QG da Força Vermelha |

## Como funciona

| Parte | Onde |
|---|---|
| Roteiro em dados (fala, objetivo, destaque, marcador, câmera, condição, ajuda, ação automática) | `shared/tutorial/script.ts` |
| Modo de sala `tutorial`: começa sem lobby, 3 nações (jogador, "Nação Aliada", "Força Vermelha"), mapa Continental fixo (`TUTORIAL_SEED`), IA tática e nacional paradas, não salva nem conta no histórico | `server/Room.ts`, `server/handler.ts` |
| Diretor: confere as condições a cada meio segundo de jogo, executa as ações, manda ao jogador só o passo atual (`TutorialView`) | `server/tutorial/Director.ts` |
| Simulação: `Simulation.tutorial` divide as durações de obra e produção do jogador por 3 e desliga as vitórias territorial e política; `layHighway` | `shared/sim/Simulation.ts` |
| Cliente: painel do passo, moldura no botão (`data-tour`), anéis no mapa, câmera, narração, fatos da tela | `src/ui/hud/TutorialOverlay.tsx`, `src/state/useTutorialStore.ts`, `GameRuntime.setTutorialMarks/tutorialFocus`, `AudioService.narrate` |
| Entrada: convite no menu na primeira visita (no lugar do manual), botão Tutorial no menu, fim com "Primeira partida contra a IA" | `MenuScreen.tsx`, `manual.ts` (`screenAfterLogin`), `ResultsOverlay.tsx` |

### Regras do diretor

- **Nunca trava:** depois de 35 s parado aparece a ajuda do passo; os passos longos têm uma ação automática (termina a
  obra, aceita a aliança, liga a rodovia, enfraquece a patrulha ou a base inimiga e manda reforços).
- **Sempre recursos:** piso de estoque (`FLOOR`), caixa mínimo e dois cidadãos livres (sem eles, quartel e terminal param
  sem trabalhador).
- **Ações idempotentes:** as de entrada do passo repetem a cada conta até pegarem (ex.: a proposta do aliado só sai depois
  do contato).
- **Pular cumpre o passo** (`fulfill`): constrói, treina, conclui a era, firma a aliança, liga a rodovia, anuncia. Pular o
  capítulo roda também as ações de entrada dos passos pulados.
- **Fim:** depois do último passo, vitória do jogador e do aliado (`sim.winners`); a regra "só sobram pactuados, a guerra
  volta" não vale no tutorial.

### KAC

O cliente só manda `{ t: 'tutorial', fact }` (fatos da própria tela: câmera, zoom, seleção do QG ou de tropas, aba do
painel Nação) e `{ t: 'tutorial', skip }`. O servidor aceita o fato só no passo que o pede e só do jogador humano da
sala; nada disso muda a partida além de andar o roteiro. Tudo o que muda o mundo é ação do diretor, no servidor.

### Interface escondida

O painel Nação e o Globo ficam escondidos (botões fora da barra e `setPanelOpen`/`openPanelAt`/`openGlobe` recusados)
até os capítulos 6 e 7.

## Narração

`public/narration/<idioma>/<passo>.mp3`, uma fala por passo, cortada por `scripts/narracao-preparar.py` dos originais em
`assets/narration/originais/<idioma>-<capítulo>-<a|b>.mp3` (ElevenLabs `eleven_v4`, uma tomada por capítulo com pausas
longas entre as falas). Vozes: português "Michelangelo/Lucas - Warm & Confident", inglês "Ian - Professional, Warm, Calm",
espanhol "Roberto - Warm Baritone Broadcaster". Idioma sem gravação usa o inglês; sem o arquivo, fica só a legenda. A
duração estimada de cada fala (`speechSeconds`, palavras ÷ 2,6 + 2,2 s) cobre a gravada nos três idiomas (conferido:
falas de 1,8 a 10,8 s, nenhuma passa do tempo do passo).

**Estado (07/11):** gravados os 49 passos em português, inglês e espanhol (27 tomadas, tomada "a" em todas). Texto do
roteiro mudou: regravar o capítulo no ElevenLabs e rodar `python3 scripts/narracao-preparar.py`.

## Testes

`server/tutorial.test.ts`: começa sem lobby, com 3 nações, guerra e IA parada; fato só no passo certo e ajuda depois de
35 s; pular capítulo cumpre os passos (aliança, era, terminal, rota); o tutorial inteiro jogado pelo servidor do 1.1 ao
9.4, com vitória e sem gravar no histórico.

## Pendências conhecidas

- Atalhos G e M: com o QG selecionado, G também entra na colocação da Prefeitura e M na de uma construção (conflito antigo
  com o painel Nação e a música). O tutorial fala do botão Nação, não da tecla.
- Medição por passo no painel de números (funil) ainda não feita.
