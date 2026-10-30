# Estradas do jogador e Engenharia de Combate

Lote 3 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md): estradas construídas pelo jogador, o
Engenheiro de Combate, minas antitanque e obstáculos antitanque.

## Estradas

O botão **Estrada** fica na aba Cívicas do Centro de Comando e no painel do Engenheiro de Combate. A construção tem
duas etapas: primeiro o jogador **marca** as células, depois **confirma**.

**Marcar**
- **Clique** numa célula: marca. Clique de novo numa célula marcada: desmarca.
- **Clique e arraste**: marca um caminho em L do ponto inicial até o ponteiro. O caminho vai primeiro pelo eixo mais
  longo e depois pelo outro, sempre em linhas retas, como numa grade de cidade.
- **Toque** (celular e tablet): cada toque marca ou desmarca uma célula.
- As marcações se acumulam: dá para arrastar vários trechos e acrescentar células soltas antes de construir.

**Prévia**
- verde: a célula pode virar estrada;
- cinza: a célula já é estrada;
- vermelho: a célula não pode virar estrada (o painel diz o motivo e quantas ficam de fora);
- branco: a célula sob o ponteiro, antes de clicar.

O painel mostra quantas células serão pavimentadas, a pedra e a verba de obras.

**Confirmar:** o botão **Construir** (ou Enter) pavimenta as células verdes, até 40 por obra. As vermelhas ficam de
fora. A ferramenta continua aberta para o próximo trecho. **Limpar** desmarca tudo e **Cancelar** (Esc) sai. As
células não precisam formar uma linha contínua. A regra é `Simulation.roadPlan`, conferida de novo pelo servidor.

**Aparência:** cada célula vira uma peça de asfalto (`src/game/render/RoadLayer.ts`) que se encaixa pelas vizinhas
(norte, sul, leste e oeste):

| Peça | Como fica |
|---|---|
| Reta | faixa central tracejada; calçada com meio-fio dos dois lados |
| Curva | a faixa central dobra de uma saída para a outra; calçada no lado de fora e no canto de dentro |
| Fim de linha | faixa só até a saída; calçada nos três lados fechados |
| Cruzamento em T e em cruz | faixas de pedestres em cada saída; calçada nos cantos |

A estrada de terra que o mapa gera conta como vizinha: o asfalto encosta nela sem calçada.

| Regra | Valor |
|---|---|
| Terreno | planície ou solo fértil, sem construção |
| Onde | no próprio território; fora dele (terra neutra ou de país em guerra), com um Engenheiro de Combate a até 6 células |
| Custo | 10 de pedra por célula e 0,2% do teto anual da verba de obras por célula |
| Manutenção | 0,004 suprimento/s por célula |
| Efeito | tropas mais rápidas (o terreno Estrada já valia 1,3× e o A* já preferia estradas), comboios rodoviários do comércio e caravanas internas ([`CARAVANAS.md`](CARAVANAS.md)) 30% mais rápidos sobre a estrada |
| Aprovação | moradias (Casa e Prédio Residencial) encostadas numa estrada formam o "bairro pavimentado": até +4 pontos com todas ligadas |
| Produção | coletas (fazenda, serraria, pedreira, mina, poço), Refinaria e Siderúrgica ligadas por estrada contínua ao Centro de Comando ou a uma prefeitura própria produzem **+15%** (`ROAD.productionMul`); o painel do edifício mostra se está ligado |
| Caravanas | só andam por estrada contínua entre o QG e a prefeitura ([`CARAVANAS.md`](CARAVANAS.md)) |

As estradas entram no salvamento e vão para os clientes junto com o território. O cliente desenha as peças de asfalto,
limpa o solo embaixo (`TerrainHandle.repaint`) e tira a vegetação de cima da estrada.

A estrada vale para os dois lados: o inimigo em guerra também a usa.

**Ligação por estrada** (caravanas e bônus de produção, `roadNetwork` e `roadLink` em `shared/sim/caravans.ts`): o
edifício precisa encostar (inclusive na diagonal) numa célula de estrada, e essa estrada precisa chegar ao QG ou a uma
prefeitura pronta do dono por células de estrada vizinhas pelo norte, sul, leste ou oeste, sem atravessar território
de quem está em guerra com ele. Vale a estrada do jogador e a de terra que o mapa gera. A rede é recalculada a cada
segundo de jogo e quando estradas ou fronteiras mudam.

**IA:** liga as prefeituras ao QG e, depois, as coletas e usinas mais produtivas, só em trechos de até 10 células novas e
deixando 200 de pedra de reserva. O traçado evita plantações e prefere planície a solo fértil (ver
[`CARAVANAS.md`](CARAVANAS.md)).

## Engenheiro de Combate

O Engenheiro de Combate sai da Base Militar a partir da era Pós-Guerra Fria. Ele é liberado pela pesquisa militar
**Engenharia de combate** (100 suprimentos, 70 ferro, 40 pedra, 35 s).

É uma unidade fraca em combate: 80 de vida e 5 de dano. Suas funções, pelo painel quando há engenheiros selecionados:
- **Instalar mina**: o próximo clique no chão marca o ponto. Shift mantém a ferramenta para várias minas.
- **Estrada**: pavimentar fora do território.
- **Obstáculo Antitanque**: ouriços de aço e sacos de areia, 1×1, 25 pedra e 10 ferro, 350 de vida. Bloqueia a
  passagem. Com o engenheiro por perto, pode ser erguido fora do território.
- **Detectar e remover minas inimigas**: é automático, sem botão (veja abaixo).

## Minas antitanque

As regras ficam em `shared/sim/mines.ts` e os números em `MINE`, em `shared/sim/config.ts`.

**Instalação**
- Custa 15 de ferro e 10 de suprimentos. O limite é de 24 minas por nação.
- O engenheiro mais próximo vai até o ponto e fica 3 s parado instalando, então não dá para minar no meio do combate.
- Uma nova ordem de movimento cancela a instalação e devolve o custo.

**Detonação**
- Só veículos inimigos detonam a mina; a infantaria passa por cima.
- O veículo que passa sobre ela leva 260 de dano. Quem estiver a até 2,2 em volta leva metade.

**Visibilidade**
- O dono vê as próprias minas.
- O inimigo só vê uma mina depois que um Engenheiro ou Forças Especiais dele chega a até 7 dela, ou depois de um
  reconhecimento aéreo sobre a área.
- O satélite do Programa Espacial não revela minas. Elas não são entidades, e o snapshot só envia ao jogador as
  próprias e as que ele já detectou.

**Remoção**
- Um engenheiro inimigo parado a até 1,8 de uma mina que o lado dele já viu a remove em 2,5 s.
- No mapa, o anel em volta da mina encolhe durante a remoção.

**No mapa:** a mina aparece como um disco meio enterrado, com anel na cor da facção (as próprias) ou um anel vermelho
piscando (as inimigas detectadas). A explosão tem cratera, coluna de terra, tremor e som. As mensagens do painel de
eventos são "mina instalada", "mina inimiga removida", "uma das nossas minas foi removida" e "mina detonada".

**Camada geopolítica:** minas que sobram no mapa quando o país não está em guerra com ninguém reduzem a aprovação
nacional (fator "Minas esquecidas no território", −0,25 por mina, até −5) até serem removidas.

## IA

A partir da dificuldade Normal, a IA pesquisa Engenharia de combate depois das armas antitanque. Ela mantém
engenheiros (1 no Normal, 2 no Difícil e no Brutal) e minas na defesa (4, 8 e 12), num arco a 15 e 18 do QG voltado
para o inimigo.

Quando a IA conhece uma mina inimiga a até 40 de um engenheiro dela, o engenheiro mais próximo vai até a mina e a
remove. Os engenheiros também acompanham as ondas e detectam as minas pelo caminho.

## Onde está

| O quê | Onde |
|---|---|
| Regra das estradas, custo e manutenção | `Simulation.roadPlan`, comando `build_road`, `ROAD` em `config.ts` |
| Comboios mais rápidos na estrada | `TradeSystem.moveShipment` |
| Bairro pavimentado e minas esquecidas | `Simulation.pavedHomes`, `theaterStats` (sala), `ROAD_APPROVAL` em `params.ts` |
| Minas | `shared/sim/mines.ts`, comando `lay_mine` |
| Obstáculo fora do território | `BuildingDef.engineerOutside`, `placementError(outsideOk)` |
| IA | `TacticalAI.planEngineers`, `DIFFICULTY[*].engineers/mines` |
| Cliente | `MineLayer`, `RoadPreview`, modos `lay_mine` e `road` no `GameRuntime`, `EngineerButtons` no painel |
| Testes | `shared/test/engineering.test.ts` |
