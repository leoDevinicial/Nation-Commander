# Gráficos: aparência realista e desgastada

Pedido do usuário (antes da Fase 4): aproximar o visual de duas referências — uma base industrial realista e
envelhecida (concreto manchado, chaminés com fumaça, céu nublado, montanhas) e um cenário texturizado no estilo Tanki
Online (asfalto rachado, meio-fio, barreiras de concreto).

Tudo é gerado no próprio navegador (texturas em canvas e shaders); nenhum arquivo de terceiros é baixado.

| Item | Onde | O que faz |
|---|---|---|
| Texturas procedurais | `src/game/render/textures.ts` | grama, terra, asfalto (remendos, rachaduras, manchas de óleo), rocha, sujeira e janelas; ruído periódico para repetir sem emendas |
| Solo misturado | `TerrainFactory.ts` (`groundMaterial`) | mapa de pesos por célula mistura as 4 texturas com transição suave; variação de grande escala esconde a repetição |
| Relevo fora do mapa | `TerrainFactory.ts` (`buildSkirt`) | campos que sobem em morros e montanhas e somem na neblina; só cenário |
| Céu e ambiente | `src/game/render/Sky.ts` | gradiente, sol, nuvens em movimento; o mesmo céu gera o mapa de ambiente (reflexos em vidro e metal) |
| Desgaste das construções | `materials.ts` (`withFog` com `weather`) | sujeira triplanar com escorridos verticais, mais escura perto do chão, e aspereza variável |
| Janelas | `materials.ts` (`panes`) | vidros em grade com caixilhos e vidros quebrados/variados |
| Fumaça | `BuildingVisuals.ts` | partículas nas chaminés da fábrica (desligadas no preset Baixo) |
| Oclusão de ambiente | `src/game/render/PostFx.ts` | GTAO em espaço de tela: sombras de contato no chão, cantos e frestas (só no preset Alto) |
| Juntas de concreto | `textures.ts` (`grimeTexture`, canal verde) | painéis de forma nas paredes e chapas; vegetação e rochas usam o canal sem linhas |
| Vegetação e rochas | `TerrainFactory.ts` (`FOLIAGE_TINT`, `ROCK_TINT`) | cor variada por instância (verde-oliva, seco, escuro) e textura de desgaste |
| Objetos de cena | `buildingModels.ts` (`jersey`, `container`) | barreiras de concreto "New Jersey" no QG e na fábrica, contêineres com nervuras |

## Low poly com detalhe realista
A geometria continua low poly (faces planas, poucas peças). O realismo vem do que a foto tem e o brinquedo não:
sujeira e escorridos, juntas de concreto, variação de cor entre cópias, sombra de contato e objetos do dia a dia
(barreiras, contêineres). Assim o estilo continua coerente e legível de longe.

## Presets
- **Alto:** texturas 512 px, relevo externo com 160 segmentos, fumaça e oclusão de ambiente.
- **Equilibrado/Baixo:** texturas 256 px, 90 segmentos; fumaça só quando o preset permite mais de 60 efeitos.

## Limitações conhecidas
- Os modelos continuam sendo geometria low-poly; o realismo vem de texturas e iluminação, não de modelos esculpidos.
- Meio-fio e calçadas ao longo das estradas ainda não existem.

## Shader harmônico mínimo
Um único conjunto de ajustes, barato e igual em todos os presets, injetado no material padrão do three.js:

| Ajuste | Onde | Efeito |
|---|---|---|
| Correção de cor (`GRADE_GLSL`) | `materials.ts`, `Sky.ts` | saturação levemente contida, sombras um pouco frias e luzes quentes; céu, terreno, vegetação e modelos na mesma paleta |
| Luz de contorno | `materials.ts` (materiais com desgaste) | borda iluminada pelo céu que separa a silhueta do chão, sem contorno preto de desenho |
| Poeira na base | `materials.ts` | parte de baixo de veículos e paredes puxa para tom de terra (lama/poeira), em vez de só escurecer |

## Detalhe dos modelos
- **Tanque:** elos no topo da esteira, roda motriz dentada, roda tensora, roletes de retorno, saias blindadas em
  painéis, grades do motor, cabo de reboque, galões, mira do atirador e periscópio do comandante com vidro, manga
  térmica e evacuador no canhão, blindagem adicional na face da torre, carga no cesto traseiro.
- **Blindado (APC):** porcas nos cubos, para-lamas, periscópios, trilhos de teto, retrovisores, grade do motor,
  porta e lanternas traseiras, lançadores de fumaça.
- **Artilharia:** detalhes de esteira, freio de boca, evacuador, berço do cano, telêmetro, metralhadora do teto,
  caixas de munição e ferramentas.
- **Infantaria:** bolsas no colete, joelheiras, carregador, luvas, faixa no capacete; um dos três é operador de rádio
  (aparelho e antena).
- **Construções:** peitoris e vergas em todas as janelas, calhas, platibanda e ar-condicionado no QG, tubulação na
  fábrica, aparelhos de ar na fachada do residencial, degrau e calha na casa.
