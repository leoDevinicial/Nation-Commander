# Lote de 23/11: espião, rede elétrica visível, eventos globais, ranking, convite e IA

Pedido do usuário (sugestões 4, 5, 6, 7, 9, 10, 12 e 13 da conversa de 23/11).

## Relatório de fim de partida
`ReportSample` ganhou `fundUsd` (caixa do país), `power` (energia gerada) e `kills` (abates acumulados);
`ReportCharts` mostra as três novas métricas ao lado de tropas, construções, território, coleta e PIB.

## IA
- **Estradas** (`TacticalAI.roadRoute`): anda pela quina (`ROAD_STEPS`, custo × √2) e atravessa rocha em túnel no
  próprio território (custo `ROAD.tunnelMul`); a pedra da obra vem do `roadPlan` (o túnel custa mais).
- **Drones** (`planAir`): da Era Digital em diante, até 2 por Base Aérea; em guerra, um por janela de ataque contra o
  alvo conhecido mais valioso (`launch_drone`, `lastDroneTick` salvo).
- **Dinheiro a aliados** (`NationalAI.diplomacy`): aliado do mapa em guerra e com menos de 40% do caixa da IA recebe
  15% do caixa (`AI_ALLY_AID`, `send_money`), uma vez por revisão.

## Visão da rede elétrica e alerta de apagão
- Servidor: `solvePower` devolve `nets` (cada rede separada: geração, consumo pedido e atendido, consumidoras sem
  luz, uma célula `at` e o centro); vai em `PlayerPower.nets`, só para o dono.
- Cliente: `PowerGridLayer` (tecla E sem construção selecionada, ou "Rede elétrica" na roda de ferramentas) pinta as
  estradas que levam energia (verde = rede dá conta, vermelho = falta), as consumidoras com e sem luz, as usinas em
  branco e uma placa "atendido/pedido · geração" em cada rede. Os pedaços são achados no cliente (8 vizinhas,
  `netOfCells`) e casados com a rede do servidor pela célula `at`.
- `PowerAlert`: enquanto alguma rede tem falta, um cartão diz quanto falta e onde (cidade mais próxima) com "Ver rede",
  "Construir <usina mais forte liberada>" e "Subir nível da usina" (eólica/solar da rede abaixo do nível 5;
  `GameRuntime.powerFix`). Fechado, volta se o consumo mudar.

## Espião (`UNITS.spy`, `SPY`)
- Quartel, era 3, pesquisa militar Operações Especiais; sem arma; entra em qualquer território (o caminho não evita
  fronteira) e as ordens de mover para território alheio valem para ele.
- **Furtivo:** `canSee` esconde o espião de quem não é aliado, a não ser que haja uma tropa ou construção dessa nação
  a até 2 células, ou torre/delegacia a até 8 (`spyDetected`, guardado por tick). Vale para snapshot, alvo e satélite.
- **Informação:** construções alheias a até 4 células de um espião mandam a fila de produção para o dono do espião
  (`spyIntel`); no painel do inimigo selecionado aparece "Espião: produzindo …".
- **Sabotagem** (`spy_sabotage`, KAC: dono do espião pela conexão, alvo usina, guerra declarada, usina vista ou em área
  explorada): o espião vai até a usina; a até 2,5 células por 6 s, ela para por 60 s (`sabotagedUntil`, `powerGen`
  devolve 0) e o espião é consumido; evento `sabotage` só para as duas partes.

## Eventos globais (`shared/strategic/globalEvents.ts`)
- Crise do petróleo (petróleo vale 2× no caixa, combustível 1,5×), Inverno rigoroso (fazendas 0,7×, energia 1,5× no
  caixa) e Alta das commodities (ferro, pedra e carvão 1,5×). 150 dias cada; o primeiro no dia 540, depois a cada 420
  a 720 dias. Sorteio próprio (`globalRng`), salvo com a nação.
- Efeitos: preço e energia no `treasuryDay` (`priceMul`, `energyMul`); colheita e combustível no teatro
  (`TacticalModifiers.foodGatherMul`/`fuelMul`, pela sala em `applyNationalModifiers`).
- Sala: `set_room.globalEvents` (só o anfitrião; padrão ligado), valendo em multijogador e contra a IA. Aviso
  `global_event` a todos (faixa no topo).

## Ranking e temporada mensal
- Servidor: `GET /leaderboard` (só origens do jogo, cache de 5 min; `server/leaderboard.ts`): soma, no mês (UTC), as
  participações de quem tem conta; partida local (`verdict = 'local'`) e IA ficam de fora. Ordem: vitórias,
  aproveitamento, menos partidas. Os três primeiros do mês passado ganham o título (Marechal, General, Coronel da
  Temporada).
- Cliente: tela "Ranking" no menu (`RankingScreen`), do servidor remoto atual (na partida local, o principal).

## Link de convite
`/sala/ABCDE` (e `/room/ABCDE`; rewrites na Vercel) guarda o código na aba e volta para `/`; no menu, com conexão,
entra sozinho na sala (`lib/invite.ts`). No lobby, "Copiar convite" copia o link.

## Testes
`shared/test/spy.test.ts`, `shared/test/globalEvents.test.ts`, `shared/test/power.test.ts` (redes separadas),
`shared/test/pacts.test.ts` (IA ajuda aliado), `server/leaderboard.test.ts`, `server/room.test.ts` (opção da sala),
`src/test/powerGrid.test.ts`, `src/test/servers.test.ts` (convite).
