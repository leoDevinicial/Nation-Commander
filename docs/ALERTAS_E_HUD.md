# Alertas mundiais, alerta de ataque, botão Construir e Demolir (03/11)

Pedido do usuário: avisar todos os jogadores dos grandes eventos (como no Rise of Nations), alertar com som e no
minimapa quando estamos sob ataque, construir sem precisar clicar no QG toda vez e demolir o que é nosso.

## Alertas mundiais
- Evento `world` da simulação (`shared/sim/types.ts`), visível a **todos** (`eventVisible`), **sem posição** (não
  revela onde fica a obra). Tipos:

| `kind` | Quando | Onde nasce |
|---|---|---|
| `war` | uma nação declara guerra a outra (`slot` declarou, `other` é o alvo) | `Simulation.setWar` (a camada nacional chama `setWar(quem declara, alvo)`) |
| `era` | uma nação conclui o avanço de era | `updateEras` |
| `nuclear` | uma nação começa a pesquisar Armas nucleares e quando conclui (uma vez cada) | `watchNuclear`, a cada segundo, por `NationalLink.researching` e `techs` |
| `project` | uma nação começa e conclui um Grande Projeto | comando `build` e fim da obra |

- No Sandbox não há alerta de projeto nem nuclear (tudo já vem pesquisado).
- Cliente: faixa grande no topo (`src/ui/hud/WorldAlerts.tsx`, some em 7 s, um toque fecha), com ícone, título e o
  nome do país (`worldAlertText` em `src/game/eventText.ts`); som de clarim (`audio.ui('herald')`) ou, quando é
  contra nós ou nuclear de outro país, clarim grave (`'warning'`). O alerta também entra no registro de eventos
  (menos a guerra, que a camada nacional já registra).

## Sob ataque
- O evento `under_attack` (já existia, espaçado por `UNDER_ATTACK_ALERT_TICKS`) agora toca uma sirene curta de dois
  tons (`audio.ui('attack')`) e marca o lugar no minimapa: ponto vermelho e anéis que se expandem por 4 s
  (`GameRuntime.attackPings`, desenhados em `Minimap.tsx`, que passou a redesenhar a 10 quadros por segundo).

## Botão Construir
- Botão **🏗 Construir** em cima do minimapa e tecla **B**: seleciona o Centro de Comando (ou a primeira prefeitura
  pronta) **sem mover a câmera**, o que abre o menu de construção (`GameRuntime.openBuildMenu`). Com o QG ou uma
  prefeitura já selecionados, B continua sendo o atalho da Base Militar.

## Demolir
- Botão **⛏ Demolir** no menu de construção: entra no modo Demolir (`{ kind: 'demolish' }`); cada clique numa
  construção própria ou numa célula de estrada/rodovia própria a derruba na hora. Botão direito ou Esc sai do modo.
- Comando `demolish` (`buildingId` **ou** `cells`), validado no servidor pelo dono da conexão (KAC):
  - construção: só a própria, nunca o Centro de Comando nem as prefeituras; sem reembolso da obra; a fila de
    produção é devolvida (recursos, bens e tripulação);
  - estrada: só as células próprias; as pontes do mapa não são de ninguém e ficam; a célula volta a ser planície.
- Evento `demolished` (dono e quem vê o lugar): poeira e estalo no cliente; texto "Demolido: …" para o dono.

## Pesquisa concluída (08/11)
Pesquisa nacional própria concluída aparece também no topo da tela (alerta verde com ícone de frasco e o primeiro item
de `unlocks`) e toca `success`, além da linha no registro: não é preciso abrir a aba Pesquisa para saber.

## Assessor falado (08/11)
Os alertas grandes que nos tocam também são falados pela voz do narrador do tutorial (`audio.announce`): pesquisa
concluída, sob ataque, era nova, contato, guerra contra nós, armas nucleares (nossas ou de outra nação), Grande Projeto,
satélite, proposta de pacto e caixa no vermelho. Lista, textos e intervalos em `assets/sfx/CATALOGO.md` (lote 40).

## Testes
`shared/test/alerts.test.ts`: alerta de guerra para todos e sem posição, sem repetir; alerta nuclear ao começar e ao
terminar; demolição de construção (QG recusado, construção alheia recusada), de estrada (só a própria) e validação do
comando.
