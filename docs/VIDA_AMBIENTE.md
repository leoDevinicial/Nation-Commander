# Vida ambiente (pássaros e cervos)

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

## Desenho e custo
- Low poly e cores chapadas, com sombra nos cervos.
- Sete `InstancedMesh` no total, com matrizes atualizadas por quadro e nenhuma alocação por quadro.
- Materiais com a névoa de guerra: em área inexplorada ficam escondidos como o resto do mapa.
- A lista de construções só é refeita quando ela muda.
