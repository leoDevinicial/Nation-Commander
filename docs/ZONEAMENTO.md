# Zoneamento (02/11)

Pedido do usuário: o Nation Commander une RTS de eras (Rise of Nations, Age of Empires) com city builder e tycoon. O
zoneamento fecha o ciclo de recursos: depois dele, só melhorias nas mecânicas que já existem.

## Como joga
- **Ferramenta:** QG selecionado → aba Cívicas → **Zoneamento**. Pincéis: 🏠 Residencial, 🏪 Comercial, 🏭 Industrial,
  ⌫ Apagar (zona sem lote) e 🧨 Demolir (lote). Clique numa célula ou arraste um retângulo (no celular, toque ou
  arraste um dedo). A prévia mostra em verde o que vale e em vermelho o que não vale, com o motivo.
- **Onde:** no próprio território, em planície ou solo fértil livre, a até **3 células** de uma estrada construída sua.
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
- **Teto nacional de população: 300** (era 200). Um lote residencial não surge se não couber.
- Casa e prédio residencial do governo só aumentam o teto; os cidadãos vêm do Centro de Comando.

## Cidades
Cada célula pertence à cidade do QG ou da prefeitura mais próxima (`cities.ts`). Os números são por cidade:
moradores (metade da capacidade das moradias do governo + os cidadãos das casas e prédios privados), empregos
(trabalhadores das construções do governo na cidade + loja 3 e indústria 6), lojas, indústrias, serviços (delegacia;
escola ou universidade; hospital), construções do governo e lotes com luz.

## Atratividade (−1 a 1, `ZoneSystem.evaluate`)
- **Desenvolvimento da cidade (0 a 1):** serviços (até 0,35), empregos (até 0,3 com 90), construções do governo (até 0,2
  com 25) e era (+0,08 por era depois da primeira). Aparece no painel ao passar o dedo/mouse no nome da cidade.
- **Economia do país:** aprovação acima de 45 e crescimento real somam; abaixo, tiram.
- **Industrial:** −0,3 + 0,6 × desenvolvimento + economia − imposto industrial − ataques − autoritarismo.
- **Residencial:** −0,3 + 0,5 × desenvolvimento + empregos sobrando na cidade + economia − imposto residencial −
  ataques − autoritarismo − casas sem luz.
- **Comercial:** −0,35 + 0,4 × desenvolvimento + moradores + indústrias + economia − imposto comercial − ataques −
  autoritarismo.
- **Imposto:** cada ponto acima de 10% tira 0,05; abaixo de 10%, soma.
- **Governo autoritário:** lei marcial 0,7; recrutamento obrigatório 0,2; racionamento e economia de guerra 0,15 cada.
- **Ataques:** cada alerta de "sob ataque" a uma construção soma; o medo cai pela metade a cada 90 s.

## Crescimento
Não há cadência fixa: cada cidade acumula procura em cada setor, proporcional ao **quadrado** da atratividade
(`growthPerSecond` 0,08 lote/s com atratividade 1), com uma variação aleatória. O lote surge quando a procura enche.
- Atratividade 0,2 → um lote a cada ~5 min; 0,35 → ~1,5 min; 0,6 → ~35 s; atratividade zero ou negativa → nada (e a
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

## Modelos (`src/game/render/models/zoneLots.ts`, ~200 a ~900 triângulos)
- Residencial: sobrado, bangalô com garagem, casa moderna com piscina, casas geminadas; prédio lâmina com varandas e
  torre envidraçada.
- Comercial: mercadinho com toldo, posto de gasolina, lanchonete com mesas, prédio de escritórios com outdoor.
- Industrial: galpão em dente de serra, química com tanques, centro logístico com contêineres, fábrica de cimento.
- Desenhados em lote (`LotLayer`, InstancedMesh por modelo e dono), virados para a estrada mais próxima. Zonas vazias
  aparecem em verde, azul e amarelo (`ZoneOverlay`).

## Servidor e KAC
- Comandos `zone_paint`, `zone_demolish`, `zone_tax`, validados em `commands.ts` (até 400 células) e na simulação
  (dono pela conexão; só no próprio território e junto às próprias estradas; só demole lote próprio).
- Lotes não são entidades: ocupam a célula na grade (`LOT_OCCUPANT`), bloqueiam construção, estrada e passagem.
- Snapshot: lotes só do dono e os alheios em célula à vista; zonas, impostos e números das cidades só do dono.
- Salvar/carregar: `SimulationSave.zoning`.

## IA
A partir dos 8 min, com folga de energia, pinta até 4 células por minuto junto às próprias estradas (metade
residencial; para com 6 zonas vazias) e demole os lotes abandonados.

## Efeito no ritmo da IA
`sim-economia` 1–7: 5 de 9 critérios, como antes do zoneamento; tropas até 15:00 em 10,6 de média. A cidade da IA
(sem delegacia, hospital e escola no começo) quase não cresce: 1 a 2 lotes até os 25 min.

## Testes
`shared/test/zoning.test.ts`.
