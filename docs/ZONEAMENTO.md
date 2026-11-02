# Zoneamento (02/11)

Pedido do usuário: o Nation Commander une RTS de eras (Rise of Nations, Age of Empires) com city builder e tycoon. O
zoneamento fecha o ciclo de recursos: depois dele, só melhorias nas mecânicas que já existem.

## Como joga
- **Ferramenta:** QG selecionado → aba Cívicas → **Zoneamento**. Pincéis: 🏠 Residencial, 🏪 Comercial, 🏭 Industrial,
  ⌫ Apagar (zona sem lote) e 🧨 Demolir (lote). Clique numa célula ou arraste um retângulo (no celular, toque ou
  arraste um dedo). A prévia mostra em verde o que vale e em vermelho o que não vale, com o motivo.
- **Onde:** no próprio território, em planície ou solo fértil livre, a até **3 células** de uma estrada construída sua.
- **Pintar não constrói:** casas, prédios, lojas e indústrias **privadas** aparecem aos poucos (avaliação a cada 4 s
  por cidade e setor, chance proporcional à demanda). O lote ocupa a célula: nada se constrói em cima até demolir.
- **Painel:** imposto de cada setor (0 a 30%, padrão 10%) com −/+ e, para cada cidade, as barras de demanda R, C e I,
  os serviços (👮 🎓 🏥) e quantos lotes estão abandonados.

## Cidades
Cada célula pertence à cidade do QG ou da prefeitura mais próxima (`cities.ts`). Os números são por cidade:
moradores (casa 4, prédio 14), empregos (loja 4, indústria 8 e os trabalhadores das construções do governo na cidade),
lojas, indústrias, serviços (delegacia; escola ou universidade; hospital) e lotes com luz.

## Demanda (−1 a 1, `ZoneSystem.evaluate`)
- **Industrial:** 0,35 + economia (aprovação e crescimento do país) − imposto industrial − ataques − governo autoritário.
- **Residencial:** 0,25 + falta de moradores para os empregos da cidade + 0,1 por serviço − imposto residencial −
  ataques − autoritarismo − casas sem luz.
- **Comercial:** 0,05 + moradores + indústrias + economia − imposto comercial − ataques − autoritarismo.
- **Imposto:** cada ponto acima de 10% tira 0,05 da demanda; abaixo de 10%, soma.
- **Governo autoritário:** lei marcial 0,7; recrutamento obrigatório 0,2; racionamento e economia de guerra 0,15 cada.
- **Ataques:** cada alerta de "sob ataque" a uma construção soma; o medo cai pela metade a cada 90 s.
- **Prédio:** com demanda residencial alta e 16+ moradores, o lote novo pode nascer prédio, e casas viram prédio.

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
residencial) e demole os lotes abandonados.

## Efeito no ritmo da IA
`sim-economia` 1–7: 4 de 9 critérios (eram 5). A era 3 até 22:00 voltou a passar; as tropas até 15:00 caíram para
9,6 em média (eram 10,6), porque os lotes gastam energia e o carvão aperta.

## Testes
`shared/test/zoning.test.ts`.
