# Vida ambiente (pássaros, cervos e carros nas cidades)

Pedido do usuário (31/10): uma melhora sutil no visual geral do jogo, para dar mais vida ao mapa. É só visual: nada
disso existe na simulação, não afeta regras nem multijogador. Código em `src/game/render/AmbientLife.ts`, ligado no
`GameRuntime`.

## Pássaros
- **Bandos:** 5 bandos de pássaros escuros sobre a terra, ou 3 no perfil leve.
- **Gaivotas:** se o mapa tiver água em mais de 3% das células, 2 bandos de gaivotas brancas sobre a água, ou 1 no
  perfil leve.
- **Voo:**
  - V solto, com cada pássaro oscilando um pouco em volta do seu lugar;
  - batem asas em rajadas e planam (as gaivotas planam mais);
  - inclinam nas curvas e às vezes circulam numa térmica.
- **Forma (01/11):** corpo facetado com cabeça, bico (amarelo nas gaivotas) e cauda em leque; asas em duas partes,
  braço e mão (malhas `wingL/R` e `handL/R`), com a ponta mais escura. A mão bate com atraso em relação ao braço
  (chicote); no planeio as asas ficam quase retas e as gaivotas planam em "M".
- **Susto:** tiros por perto, explosões, bombas, minas e caravanas atacadas fazem o bando fugir subindo e acelerando,
  batendo asas sem parar.

## Cervos
- **Onde:** manadas de 3 a 5 cervos, com um macho de chifres, no pasto da borda das matas.
  - O pasto é planície ou solo fértil a até 2 células de floresta.
  - Nunca a menos de 14 células do ponto inicial de uma nação.
- **Quantidade:** proporcional ao mapa, de 4 a 16 manadas, ou até 8 no perfil leve.
- **Comportamento:**
  - pastam de cabeça baixa (o pescoço gira no ombro até o focinho tocar o chão);
  - de vez em quando erguem a cabeça para vigiar e andam alguns passos;
  - fogem a galope quando uma tropa chega a menos de 5,5 ou algo explode perto, e escolhem pasto novo onde
    pararem;
  - não pisam em água, rocha nem construções (as construções contam com uma célula de folga em volta);
  - mudam de pasto quando uma construção ocupa o lugar.

## Carros nas cidades (02/11)
`src/game/render/CityTraffic.ts`, só visual: os carros dos cidadãos indo e voltando do trabalho e do comércio.
- **Modelos (refeitos em 02/11):** hatch, sedã, picape (caçamba com tampa e santantônio) e van (janelas laterais e rack
  no teto), low poly com casco facetado (capô e traseira inclinados), vidraça com colunas e teto pintado, retrovisores,
  pneus com calota, para-choques, grade, faróis, lanternas e placas. A pintura é tingida por carro com cores comuns de
  rua; o resto não. ~0,6 a 0,76 de comprimento, ×1,15 no mapa (leem melhor andando).
- **Movimento:** de centro em centro das células de estrada e rodovia, sempre na mão direita; no cruzamento escolhe uma
  saída ao acaso (sem voltar) e no fim da linha faz o retorno. Na rodovia andam mais rápido.
- **Quantidade:** acompanha o tamanho das cidades (8% das células de estrada + 0,35 por moradia + 0,5 por lote do
  zoneamento), até 70 carros (30 no perfil leve). Um carro aparece ou some por quadro, sem saltos.
- **Custo:** 12 chamadas de desenho por instâncias (pintura, peças escuras e vidro de cada modelo), com a névoa de guerra.

## Desenho e custo
- Low poly e cores chapadas, com sombra nos cervos.
- Sete `InstancedMesh` no total, com matrizes atualizadas por quadro e nenhuma alocação por quadro.
- Materiais com a névoa de guerra: em área inexplorada ficam escondidos como o resto do mapa.
- A lista de construções só é refeita quando ela muda.
