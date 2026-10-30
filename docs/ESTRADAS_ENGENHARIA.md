# Estradas do jogador e Engenharia de Combate

Lote 3 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md): estradas construídas pelo jogador, o
Engenheiro de Combate, minas antitanque e obstáculos antitanque.

## Estradas

O botão **Estrada** fica no Centro de Comando e no painel do Engenheiro de Combate. Com ele, o jogador arrasta uma
linha na grade (no toque: um toque marca o começo e outro o fim). A linha pode ser horizontal, vertical ou diagonal, com
até 40 células por vez.

Antes de soltar, o mapa mostra uma prévia:
- verde: a célula pode virar estrada;
- cinza: a célula já é estrada;
- vermelho: a célula não pode virar estrada.

O painel mostra o custo e o motivo de um traçado inválido. A regra é `Simulation.roadPlan`, conferida de novo pelo
servidor.

| Regra | Valor |
|---|---|
| Terreno | planície ou solo fértil, sem construção |
| Onde | no próprio território; fora dele (terra neutra ou de país em guerra), com um Engenheiro de Combate a até 6 células |
| Custo | 6 de pedra por célula e 0,2% do teto anual da verba de obras por célula |
| Manutenção | 0,004 suprimento/s por célula |
| Efeito | tropas mais rápidas (o terreno Estrada já valia 1,3× e o A* já preferia estradas), comboios rodoviários do comércio e caravanas internas ([`CARAVANAS.md`](CARAVANAS.md)) 30% mais rápidos sobre a estrada |
| Aprovação | moradias (Casa e Prédio Residencial) encostadas numa estrada formam o "bairro pavimentado": até +4 pontos com todas ligadas |

As estradas entram no salvamento e vão para os clientes junto com o território. O cliente pinta o asfalto no mapa de
pesos do solo (`TerrainHandle.repaint`) e tira a vegetação de cima da estrada.

A estrada vale para os dois lados: o inimigo em guerra também a usa.

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
