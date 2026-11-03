# Partidas com mais nações, mapas maiores e tipos de mapa

Lote 4 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md).

## Número de nações

| Versão | Nações por partida (humanos + bots) |
|---|---|
| Grátis | até 4 |
| Assinante | até 6 |

O limite de cada sala depende do anfitrião, pelo campo `active` da tabela `subscriptions` (migração
`20261029010000_subscriptions.sql`). A assinatura fica numa tabela separada do perfil porque o jogador pode editar o
próprio perfil e não pode se marcar como assinante. A tabela tem RLS sem políticas, então só o servidor, com a chave de
serviço, lê e grava. Ainda não há tela de pagamento: hoje uma assinatura é ativada com
`insert into subscriptions (user_id, active) values (...)`.

No lobby (`LobbyScreen`):
- O anfitrião escolhe quantas nações a partida terá e o tipo de mapa.
- O anfitrião adiciona e remove bots (IA), em qualquer modo. Cada bot recebe um país **sorteado** entre os que ninguém
  da sala usa. O anfitrião pode escolher o país de cada bot na lista (países já usados ficam bloqueados) ou pedir
  "🎲 Sortear outro país" (mensagem `set_bot_country`). Se um jogador escolher o país de um bot, o bot ganha outro
  sorteado.
- Cada jogador escolhe o próprio time (A, B ou C, ou sem time). O anfitrião escolhe o time dos bots.
- O mesmo time começa aliado, no teatro e na diplomacia. A aliança de time vale a partida inteira e bloqueia a
  declaração de guerra entre os parceiros.
- A partida só começa com pelo menos dois lados.
- Ao começar, os slots são renumerados em sequência (0 a n−1).

A IA tática escolhe o alvo entre vários rivais: ignora aliados e prefere quem está perto, quem já está em guerra com
ela e quem já está em guerra com outra nação.

## Mapas

O gerador é `generateMatchMap` (`shared/sim/matchMap.ts`). O tamanho cresce com o número de nações:

| Nações | Lado do mapa | Oceano Central e Arquipélago |
|---|---|---|
| 2 | 96 células | 120 células |
| 3–4 | 144 células | 168 células |
| 5–6 | 192 células | 216 células |

Os mapas cresceram em 03/11 (antes: 96, 128 e 160), a pedido do usuário, para 6 nações não ficarem apertadas; nos
oceânicos o mar ocupa boa parte, por isso +24 (`mapSizeFor`).

**Simetria**
- 2 e 4 nações: rotação exata da grade, de 180° ou 90°. Cada nação recebe exatamente o mesmo terreno.
- 3, 5 e 6 nações: o terreno é amostrado em coordenadas polares no setor de referência. O mapa vira um continente
  circular cercado de mar, para nenhuma nação ganhar um canto a mais.

O kit de cada base é desenhado para a nação de referência e copiado pela mesma rotação. O kit tem rocha, uma serra com
minério, floresta, solo fértil, duas jazidas de petróleo e uma jazida disputada no caminho do vizinho. O traçado de
cada base ao centro só deixa marca onde cruza água ou rocha: ali vira passagem (ponte ou corte na serra), o que garante
a travessia de rios e serras. Em terreno transitável não há mais o caminho de cascalho (01/11, pedido do usuário: ele
denunciava onde ficavam as outras nações e impedia pavimentar por cima). Os testes conferem a conexão entre todas as
bases em todos os tipos de mapa.

| Tipo | O que muda |
|---|---|
| Continental | o padrão: florestas, serras e planícies |
| Rios e Pontes | rio largo na fronteira entre nações vizinhas e lago central; a travessia é pelas estradas (pontes) |
| Montanhoso | cordilheiras nas fronteiras com dois passos cada, mais rocha e minério |
| Deserto | pouca floresta e solo fértil, uma jazida de petróleo a mais por nação; terreno com tons áridos |
| Oceano Central (03/11) | mar no centro (raio ~45% do mapa, costa irregular com praia) e as nações na faixa de terra em volta, ligadas por terra ao redor do mar; a jazida disputada fica na faixa de terra; o caminho até o centro não vira ponte |
| Arquipélago (03/11) | cada nação na sua ilha (raio ~23 células, costa irregular, dois maciços com minério), uma ilha central com a jazida e o maciço disputados e oceano no resto; **sem pontes**: o contato entre as nações é por navio de transporte e por avião |

O anfitrião escolhe o tipo, ou deixa sorteado no início da partida (o sorteio inclui os oceânicos).

**Arquipélago sem pontes (03/11):** a primeira versão ligava cada ilha à central por uma ponte, enquanto não havia
navios. Com o Navio de Transporte, o usuário pediu para tirar as pontes: o caminho de cada base ao centro morre no mar.
O teste de mapa confere que todas as ilhas encostam no mesmo oceano (os navios chegam a todas) e o teste naval que não há
caminho por terra entre as bases. No Oceano Central, as nações continuam ligadas por terra em volta do mar.

### Navio de Transporte (03/11)
`transport_ship` em `UNITS` (era 2, produzido no **Porto**, atalho N): 300 de vida, velocidade 4,2, sem arma, 10 vagas
(`NAVAL`: infantaria ocupa 1, veículo 2). Só anda na água: a simulação usa a grade em modo naval (`Grid.naval`), em que
só a água é transitável, para o caminho, a separação entre navios e o ponto de saída do Porto.
- **Embarcar** (comando `embark`, tropas + navio): cada tropa anda até a margem colada ao navio e, a até
  `NAVAL.embarkRange`, sai do mapa e entra na carga (`Unit.cargo`). A carga conta na população e na manutenção.
- **Desembarcar** (comando `unload`, navio + ponto em terra): o navio vai até a água colada à costa mais perto do ponto
  e solta as tropas nas células de terra livres em volta, viradas para o ponto. Em território de outra nação, só em
  guerra (a mesma regra de entrada das tropas). Sem costa alcançável pelo mar, a ordem é recusada.
- **Afundado**, a carga se perde (conta como baixa). O navio nunca entra em combate: precisa de escolta.
- **KAC:** o servidor confere o dono do navio e das tropas pela conexão; o snapshot só leva a carga (`cargo`, tipos das
  tropas) para o dono; o inimigo vê o navio, não o que vai dentro. Eventos `embarked` (sem texto, um por tropa) e
  `unloaded` ("Desembarque inimigo avistado na costa!" para quem vê).
- **Cliente:** com tropas de terra selecionadas, botão direito no próprio navio embarca; com navios carregados
  selecionados, botão direito na terra desembarca (o resto da seleção só anda); na água, só move. O painel do navio
  mostra as vagas e as tropas a bordo. O modelo (`buildTransportShip`) é um navio de desembarque low poly: proa
  afilada com rampa, convés de carga, ponte de comando à popa, faixa do casco e bandeira na cor da nação; flutua na
  linha d'água e balança com as ondas.
- **IA:** quando o adversário escolhido está noutra ilha (fora da terra alcançável a pé a partir da base), ela constrói
  um Porto que dê para o mar aberto (o maior corpo d'água, não um lago), mantém até 3 navios (vagas para 1,5× a onda) e,
  na hora da ofensiva, distribui a onda pelos navios parados e manda embarcar. Quando todos embarcaram (ou depois de
  75 s), os navios desembarcam perto do QG inimigo; em terra, a onda avança atacando e os navios voltam para a costa
  de casa (`TacticalAI.launchAmphib` e `stepAmphib`; o estado vai no save).
- **Ilha pequena:** com o inimigo além-mar e sem lugar a 9 células do QG, a IA procura até 16 (prefeitura: 22), menos para usinas; o Porto
  dispensa o corredor livre em volta (já confere a própria saída).
- `MAP_TYPE=islands NAVAL_LOG=1 npx tsx scripts/sim-economia.ts 2 40` mostra portos, navios e desembarques.

### Montanhas (03/11)
Pedido do usuário: o mapa não tinha montanhas. Agora cada nação ganha dois maciços altos (`generateMatchMap`, copiados
pela mesma simetria do mapa, para ninguém sair em vantagem):
- **no flanco da base:** raio ~5 (×1,3 no Montanhoso, ×0,8 no Deserto), com o anel de minério virado para a base;
- **entre a nação e a vizinha (disputado):** maior (raio 6 a 7), com minério em manchas por toda a base.

A borda do maciço tem um anel de ~2 células onde aflora o minério; o resto é rocha. Lagos e passagens não são cobertos
(a passagem da base ao centro corta a serra, se precisar). Os depósitos ficam grandes: no mapa de 2 nações, seed 7, a
rocha dos maciços dá 57, 61 e 116 células (41 a 83 mil de pedra; uma rocha comum tinha poucas dezenas de células),
com o limite de 2 extrações por montanha. A pedreira e a mina se constroem na base, colada à encosta.

No desenho (`src/game/render/relief.ts`), a rocha e o minério sobem conforme a distância até a borda do maciço: a borda
fica rente ao chão (onde as construções encostam) e o miolo vira encosta íngreme e facetada, com pico de até ~11 e neve
acima de ~8. A mesma conta serve à malha do terreno e à altura das tropas, construções e estradas (`groundHeight`).
Só visual: a simulação segue na grade plana e a rocha continua intransitável. As pedras decorativas ficam só na base.

## Região inicial do país

A região perto da base reflete o país. Cada perfil ganha mais de um recurso e perde de outro (compensação declarada),
e o lobby mostra o perfil de cada nação.

| Perfil | Países | Ganho | Compensação |
|---|---|---|---|
| Florestal | Brasil, Canadá, Rússia, Coreia do Sul | mais floresta | menos rocha |
| Petrolífera | Arábia Saudita, México, Egito, Austrália | +1 jazida de petróleo | menos solo fértil e floresta |
| Serrana | Japão, China, Turquia, Coreia do Norte, África do Sul, Itália | serra maior, mais minério | menos solo fértil |
| Agrícola | Argentina, EUA, França, Índia, Alemanha | mais solo fértil | menos minério |
| Equilibrada | os demais | padrão | — |

## Desempenho

Um mapa de 160×160 tem 6,25 vezes as células do antigo, de 64×64. O território vai para os clientes só quando muda.
A névoa e o A* escalam com a área. O desempenho ainda não foi medido em aparelhos reais; o KGPS mostra o custo no
cliente.
