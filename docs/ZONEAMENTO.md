# Zoneamento (02/11)

Pedido do usuário: o Nation Commander une RTS de eras (Rise of Nations, Age of Empires) com city builder e tycoon. O
zoneamento fecha o ciclo de recursos: depois dele, só melhorias nas mecânicas que já existem.

## Como joga

> 02/11: só estradas **comuns** próprias servem para zonear; as margens das rodovias ficam de fora.

- **Ferramenta:** QG selecionado → aba Cívicas → **Zoneamento**. Pincéis: 🏠 Residencial, 🏪 Comercial, 🏭 Industrial,
  ⌫ Apagar (zona sem lote) e 🧨 Demolir (lote). Clique numa célula ou arraste um retângulo (no celular, toque ou
  arraste um dedo). A prévia mostra em verde o que vale e em vermelho o que não vale, com o motivo.
- **Onde:** no próprio território, em planície ou solo fértil livre, a até **2 células** de uma estrada construída sua.
- **Todo lote encosta na rua (02/11):** o lote nasce numa célula colada à estrada, virado para ela. Se a célula de
  trás também for da mesma zona, livre, o lote vira **fundo**: a mesma construção, com a mesma frente e o dobro do
  comprimento (a casa se estende com quintal; a loja ganha depósito e estacionamento; a indústria, galpão maior e
  pátio; o prédio, ala de fundos). Célula de trás sozinha, sem rua, nunca vira lote.
- **Pintar não constrói:** casas, prédios, lojas e indústrias **privadas** aparecem aos poucos, no ritmo da
  atratividade de cada cidade (sem cadência fixa; ver "Crescimento"). O lote ocupa a célula: nada se constrói em cima
  até demolir.
- **No começo é difícil:** uma cidade sem atrativos tem atratividade negativa e não cresce. O governo precisa
  construir casas e prédios residenciais (que só aumentam o teto de população; os cidadãos vêm do Centro de Comando).
  Conforme a cidade ganha serviços, empregos, construções e era, e o país vai bem, as zonas começam a povoar.
- **Painel:** imposto de cada setor (0 a 30%, padrão 10%) com −/+ e, para cada cidade, as barras de demanda R, C e I,
  os serviços (👮 🎓 🏥) e quantos lotes estão abandonados.

## População (02/11)
- **Casa privada:** +1 cidadão e +1 de teto de população. **Prédio privado:** +5 e +5; raro (só com muita procura
  residencial e 30+ moradores na cidade; 12% dos lotes novos nesse caso, e casas viram prédio raramente).
- Os cidadãos chegam junto com o lote e vão embora quando ele é abandonado, demolido ou perdido com a fronteira.
- **Teto nacional de população: 500** (era 300 até 11/11; antes, 200). Um lote residencial não surge se não couber.
- Casa e prédio residencial do governo só aumentam o teto; os cidadãos vêm do Centro de Comando.

## Cidades
Cada célula pertence à cidade do QG ou da prefeitura mais próxima (`cities.ts`). Os números são por cidade:
moradores (metade da capacidade das moradias do governo + os cidadãos das casas e prédios privados), empregos
(trabalhadores das construções do governo na cidade + loja 3 e indústria 6), lojas, indústrias, serviços (delegacia;
escola ou universidade; hospital), construções do governo e lotes com luz.

## Atratividade (−1 a 1, `ZoneSystem.evaluate`)
A curva segue a fase da partida: **negativa no começo** (0 a ~8 min), os **primeiros lotes entre 8 e 12 min**,
**florescendo entre 17 e 23 min** e **fácil no fim** para as nações bem desenvolvidas (com serviços, empregos e era).
- **Desenvolvimento da cidade (0 a 1,1):** serviços (delegacia, escola, hospital: até 0,3), empregos (até 0,25 com 100),
  construções do governo (até 0,15 com 30) e era (+0,14 por era depois da primeira; é o relógio natural da partida).
  Aparece no painel ao passar o dedo/mouse no nome da cidade.
- **Economia do país:** aprovação acima de 45 e crescimento real somam; abaixo, tiram.
- **Industrial:** −0,29 + 0,7 × desenvolvimento + economia − imposto industrial − 0,3 × ataques − autoritarismo.
- **Residencial:** −0,26 + 0,65 × desenvolvimento + empregos sobrando na cidade + economia − imposto residencial −
  0,25 × ataques − autoritarismo − 0,35 × casas sem luz.
- **Comercial:** −0,32 + 0,55 × desenvolvimento + moradores + indústrias + economia − imposto comercial −
  0,25 × ataques − autoritarismo.
- **Imposto:** cada ponto acima de 10% tira 0,05; abaixo de 10%, soma.
- **Governo autoritário:** lei marcial 0,7; recrutamento obrigatório 0,2; racionamento e economia de guerra 0,15 cada.
- **Ataques:** cada alerta de "sob ataque" a uma construção soma; o medo cai pela metade a cada 90 s.

## Crescimento
Não há cadência fixa: cada cidade acumula procura em cada setor, proporcional à atratividade elevada a **1,5**
(`growthPerSecond` 0,1 lote/s com atratividade 1), com uma variação aleatória. O lote surge quando a procura enche.
- Atratividade 0,2 → um lote a cada ~2 min; 0,35 → ~50 s; 0,5 → ~30 s; 0,6 → ~20 s; zero ou negativa → nada (e a
  procura acumulada esvazia aos poucos).

## Abandono
Por avaliação, cada lote ativo tem risco de ser abandonado: demanda negativa do setor, imposto acima de 18%,
ataques, autoritarismo e, nas casas, falta de luz e desemprego (moradores sem emprego na cidade). O abandonado fica
escuro, sem imposto e sem gastar luz, até o jogador **demolir**; aí a zona volta a crescer.

## Dinheiro e energia
- **Imposto** no caixa do país (linhas "Imposto residencial/comercial/industrial (x%)" no extrato), por lote ativo e
  por dia: casa US$ 1,8 mil (prédio conta 3), loja 4,5 mil, indústria 7,5 mil, com 10% de alíquota (proporcional à
  alíquota).
- **Energia:** 0,5 por lote ativo (prédio 1,0), na rede como as construções do governo (entram depois delas quando
  falta geração).
- **Serviços públicos** ficaram mais caros: US$ 30 mil por dia cada hospital, escola, universidade, delegacia e
  prefeitura (eram 20 mil).
- Lotes privados não produzem nem gastam recursos do mapa.

## Modelos (`src/game/render/models/zoneLots.ts`, ~700 a ~1.600 triângulos; prédio lâmina ~3.000)
Redesenho de 02/11 inspirado no que os kits low poly de cidade fazem para ler bem de cima: telhado com beiral,
testeira e cumeeira (a silhueta), janelas com moldura, divisória em cruz, peitoril e venezianas, paredes com rodapé
escuro e cantoneiras claras, portas com batente, degrau e marquise, e objetos de uso (caixa de correio, floreiras,
ar-condicionado, antena, freezer, bicicletário, paletes, empilhadeira, chaminé listrada, chapa ondulada, portão de
enrolar). Sem textura; cores chapadas por camada.
- Residencial: sobrado com varanda coberta e cerca, bangalô de quatro águas com garagem, casa moderna em balanço com
  ripado e piscina, casas geminadas com águas-furtadas e escadinhas; prédio lâmina com varandas e torre envidraçada
  com coroamento.
- Comercial: mercadinho com platibanda, vitrine e toldo listrado; posto com cobertura iluminada, bombas e totem;
  lanchonete americana de cantos arredondados com mesas; prédio de escritórios com lojas e outdoor.
- Industrial: galpão em dente de serra com chapa ondulada e portões; química com tanques, escadas, passarela e rack de
  tubos; centro logístico com docas e contêineres; fábrica de cimento com silos, torre de pré-aquecimento e forno.
- Desenhados em lote (`LotLayer`, InstancedMesh por modelo e dono), virados para a rua em que encostam; o lote fundo
  desenha também a parte de trás (`lotBackModel`). Zonas vazias
  aparecem em verde, azul e amarelo (`ZoneOverlay`).

## Servidor e KAC
- Comandos `zone_paint`, `zone_demolish`, `zone_tax`, validados em `commands.ts` (até 400 células) e na simulação
  (dono pela conexão; só no próprio território e junto às próprias estradas; só demole lote próprio).
- Lotes não são entidades: ocupam a célula na grade (`LOT_OCCUPANT`), bloqueiam construção, estrada e passagem.
- Snapshot: lotes só do dono e os alheios em célula à vista; zonas, impostos e números das cidades só do dono.
- Salvar/carregar: `SimulationSave.zoning`.

## IA
A partir dos 6 min, com folga de energia, pinta até 4 células por minuto junto às próprias estradas (metade
residencial; para com 6 zonas vazias) e demole os lotes abandonados. Também ergue os **serviços** da capital: escola
depois do Centro de Pesquisa (com 3 casas), delegacia e hospital na era 2 (o hospital depois da escola).

## Efeito no ritmo da IA
`sim-economia` 1–7 (`ZONE_LOG=1` mostra zonas, lotes, atratividade e serviços a cada 3 min): 5 a 7 de 9 critérios
por seed. Primeiro lote entre 10 e 12 min na maioria das IAs; aos 18 min, 3 a 15 lotes; aos 24 min, 8 a 22 nas
nações com delegacia, escola e hospital. Quem perde a guerra (medo dos ataques) ou fica sem luz cresce bem menos.

## Testes
`shared/test/zoning.test.ts`.
