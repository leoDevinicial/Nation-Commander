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

### Marinha (03/11)
Pedido do usuário (com referências): fragata, cargueiro, dois submarinos, porta-aviões e o navio de desembarque L402,
além do cargueiro aéreo C-5 Galaxy. Todos os navios saem do **Porto** (que passou para a era 1), só andam na água
(`Grid.naval`), flutuam na linha d'água e levam a cor da nação em faixas, número de costado e bandeira
(`src/game/render/models/naval.ts`).

| Unidade | Era | Pesquisa nacional | Tripulação | O que faz |
|---|---|---|---|---|
| Navio de Desembarque L402 | 1 | Logística naval (Porto) | 4 | leva 10 tropas a pé e 10 veículos; sem arma |
| Fragata | 1 (3 modelos: Guerra Fria, moderna nas eras 2–3, furtiva no Futuro Próximo) | Guerra naval | 6 | navio × navio e bombardeio da costa (nunca atira em tropa em terra), antiaérea própria, leva 15 soldados a pé |
| Cargueiro | 1 | Logística integrada | 5 | o comércio por navio só sai com cargueiros: cada um leva uma remessa por vez, do Porto do vendedor ao do comprador |
| Submarino de Ataque | 2 | Submarinos | 3 | torpedos contra navios; só outro submarino o atinge |
| Submarino Lançador | 3 | Mísseis de cruzeiro submarinos | 3 | torpedos e 4 mísseis de cruzeiro convencionais; recarrega junto a um Porto próprio (um a cada 45 s, pagando o míssil) |
| Porta-Aviões | 3 | Aviação embarcada | 8 | sai com 4 caças (sem bombardeiros); caça perdido é reposto no próprio navio pelo preço normal; afundado, perde os do convés |

**Regras de alvo** (`shared/sim/targeting.ts`, `canHit`): submarino só é atingido por submarino (nem torres, nem dano
em área, nem mísseis, nem drones); o submarino só ataca navios; a fragata só atira em navios e construções. Tropas e
torres em terra atiram em navios de superfície normalmente.

**Tripulação** (`UnitDef.crew`): a unidade ocupa esse número de recrutas da reserva, e todos contam na população.
**Carga** (`UnitDef.cargo`): vagas separadas para tropas a pé e veículos; o embarque e o desembarque são os do navio de
transporte (botão direito no navio com tropas selecionadas; com o navio selecionado, botão direito na terra).

**Mísseis** (pedido do usuário): o silo tem alcance (90 no 1º nível, 120 no míssil pesado) e o submarino, 70; o anel
aparece no mapa ao escolher o alvo. O alvo pode ser qualquer ponto fora da própria fronteira (terra neutra, mar ou
território inimigo, este só em guerra), sem precisar estar à vista agora, mas já explorado pelo país alguma vez (ou
junto de um edifício inimigo já descoberto; 03/11, ver `docs/COMBUSTIVEL_E_CORRECOES.md`). O dano em área não atinge nações em paz com quem
lançou. Para alcançar o inimigo com o silo, é preciso construí-lo perto da fronteira.

**Lançamento do submarino** (só visual, pedido do usuário): na preparação a tampa do tubo da frente abre
(`UnitVisual.setTubeOpen`); na contagem final o míssil sobe do tubo por baixo d'água e rompe a superfície num borrifo
com anel de espuma e vapor, e só então acende o motor. No voo (`AirLayer.frameCruiseFlight`, `cruisePoint`) ele sobe
quase na vertical, solta o propulsor, faz a curva e segue baixo, rente ao mar e ao terreno, até mergulhar no alvo; o
modelo é próprio (corpo cinza fino, asas retas, entrada de ar e cauda em cruz). O lançamento e o evento levam
`cruise: true` para o cliente escolher o desenho e o raio da explosão.

**C-5 Galaxy** (aeronave da Base Aérea nível 2, era 3, pesquisa Operações aerotransportadas): o botão
**Paraquedistas** embarca as tropas próprias paradas a até 14 da base (até 12 a pé e 3 veículos), voa até o ponto
escolhido no anel de alcance, lança as tropas em volta dele e volta. Antiaérea e caças inimigos podem derrubá-lo; aí
todos a bordo morrem. No território de outra nação, só em guerra.

**Descida de paraquedas** (pedido do usuário): ao saltar, cada tropa já está no mapa, no ponto de pouso, mas desce por
3,2 s (soldado) ou 4,6 s (veículo, num palete com três paraquedas), uma depois da outra (0,22 s entre saídas). No ar
ela **não anda nem atira, mas pode ser atingida** (`Unit.descent`; o snapshot manda a fração que falta a quem vê a
tropa). No cliente (`UnitVisuals.setDescent`), cada soldado do grupo pendura no próprio paraquedas em gomos na cor da
nação e branco, com cordas; o veículo desce no palete com três cúpulas maiores; no pouso a lona murcha.

**Modelos** (`naval.ts`, 1 a 2,5 mil triângulos cada): castelo de proa, faixa preta na linha d'água, guarda-corpos,
vigias, âncoras, número de costado, botes e balsas, radares, CIWS, VLS, lançadores antinavio, convoo com helicóptero
(L402 e fragatas), porta-aviões com seis caças, sponsons e ilha em três níveis, cargueiro com bulbo de proa, baias de
contêineres e guindaste. Os navios usam uma variante do material das tropas sem a lama na parte de baixo
(`eraUnitBodyMaterial(era, naval)`), que sujava de bege os cascos.

**IA:** quando o adversário escolhido está noutra ilha (fora da terra alcançável a pé a partir da base), ela constrói
um Porto que dê para o mar aberto (o maior corpo d'água, não um lago), mantém navios de desembarque e até 2 fragatas.
Na hora da ofensiva, distribui a onda pelos navios parados e manda embarcar; as fragatas vão na frente até a costa do
alvo. Quando todos embarcaram (ou depois de 75 s), os navios desembarcam perto do QG inimigo (a costa escolhida é sempre
da água ligada à do navio, nunca um lago); em terra, a onda avança atacando e os navios voltam para casa
(`TacticalAI.launchAmphib` e `stepAmphib`; o estado vai no save). Sem lugar a 9 células do QG numa ilha, procura até 16
(menos para usinas). Com Terminal Comercial, faz um cargueiro. O governo pesquisa Guerra naval logo depois da Logística
naval. `MAP_TYPE=islands NAVAL_LOG=1 npx tsx scripts/sim-economia.ts 2 40` mostra portos, navios e desembarques.

Testes: `shared/test/navy.test.ts` (alvos, combate, tripulação, carga, mísseis, porta-aviões, C-5 e cargueiro) e
`shared/test/naval.test.ts` (embarque, travessia e desembarque no Arquipélago).

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
