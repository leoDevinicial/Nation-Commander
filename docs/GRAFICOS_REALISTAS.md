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

## Reflexos e iluminação adaptativa

| Recurso | Onde | Baixo | Equilibrado | Alto |
|---|---|---|---|---|
| Água com Fresnel, ondulações e brilho do sol | `Water.ts` | reflexo do céu | reflexo do céu | **espelho real da cena** (`Reflector`, 512 px) |
| Exposição adaptativa (olho/câmera) | `Lighting.ts` (`AdaptiveExposure`) | — | sim | sim |
| Sombras que acompanham a câmera | `Lighting.ts` (`ShadowFollow`) | sem sombras | sim | sim |
| Luzes de disparos e explosões | `Effects.ts` (conjunto fixo de `PointLight`) | 0 | 2 | 4 |
| Sonda de ambiente (reflexos do cenário real) | `Lighting.ts` (`EnvironmentProbe`) | — | — | sim |

- **Exposição adaptativa:** a cada ~0,6 s a cena é desenhada numa miniatura de 32×18 e lida de forma assíncrona (sem
  travar a GPU). A média logarítmica da luminância ignora pixels quase pretos (áreas inexploradas da névoa de guerra)
  e a exposição se aproxima suavemente do alvo em ~1 s, aplicando só metade da correção (`ADAPT_STRENGTH = 0,5`)
  para preservar o visual, entre 0,8 e 1,45. A referência (`EXPOSURE_KEY = 0,13`) foi medida em vistas típicas da base
  (0,10 a 0,16). Funções puras testadas em `src/test/lighting.test.ts`.
- **Sombras:** o volume de sombra do sol cobre só a área em volta do ponto observado e cresce com o zoom; o centro é
  encaixado na grade de texels para a sombra não tremer.
- **Luzes dinâmicas:** número fixo por preset (luzes apagadas não forçam recompilação de shaders); um clarão fraco não
  rouba a luz de uma explosão que ainda está acesa.
- **Sonda de ambiente:** a cada 2,5 s, se a câmera andou mais de 8 unidades, um cubo de 64 px do entorno vira o mapa de
  ambiente: vidros e metais refletem o terreno e os prédios da região, não só o céu.
- **Oclusão de ambiente:** camadas transparentes que não gravam profundidade (fronteiras, água, céu, fumaça) ficam fora
  do passe de normais do GTAO — antes apareciam como manchas pretas nas faixas de fronteira.

Relação com a Fase 8A: a água ganhou reflexo e ondulação de superfície, mas ondas, margens e petróleo da 8A continuam
pendentes.

## Preset Ultra

Para GPUs dedicadas recentes; nunca é escolhido automaticamente. Tudo do Alto, mais:

| Recurso | Onde | Como funciona |
|---|---|---|
| Modelos menos quadrados | `models/kit.ts` (`setModelDetail`) | caixas com arestas arredondadas (`RoundedBoxGeometry`, raio até 6 cm), cilindros e esferas com o dobro de segmentos; peças < 0,08 mantêm quinas vivas para poupar vértices. Vegetação e rochas com sombreamento suave |
| Água com ondas | `Water.ts` | malha subdividida (2 vértices por unidade) deslocada por 4 ondas de Gerstner; a frequência de cada onda segue a relação de dispersão de águas profundas ω = √(g·k), com g ajustado à escala (~3 m por unidade). Normais analíticas + ondulação fina por pixel; espelho real da cena distorcido pelas ondas |
| Margem e espuma | `Water.ts` (`shoreDistance`) | distância de cada célula de água até a terra (busca em largura); água mais clara e transparente no raso, linha de arrebentação animada e espuma nas cristas maiores |
| Fumaça volumétrica | `textures.ts` (`volumetricSmokeTexture`), `BuildingVisuals.ts`, `Effects.ts` | partículas com volume (ruído fractal) e sombreamento próprio, giro, turbulência, pluma dobrada pelo vento; sai escura e clareia ao subir. Chaminés com 16 partículas por saída; explosões com coluna de 5–9 partículas |
| Feixes de luz do sol | `UltraPasses.ts` (`LightShaftsPass`) | espalhamento volumétrico numa camada de névoa baixa: 28 amostras por pixel ao longo do raio de visão, cada uma testada contra um mapa de profundidade visto do sol; trechos à sombra de prédios e árvores não espalham luz. Fase Henyey-Greenstein (g = 0,55) |
| Luz adaptativa nas sombras | `UltraPasses.ts` (`LocalExposurePass`) | mede a luminância média por região (grade 64×36, suavizada) e clareia só as regiões escuras (ganho de até 1,5×, levemente azulado como a luz do céu), sem estourar o que está ao sol |
| Sombras | `GameRuntime.ts` | mapa de 4096 px e filtro PCF mais largo (penumbra suave) |
| Luzes dinâmicas | `Effects.ts` | 6 luzes de disparos e explosões |

Limite honesto: a imagem de referência (base industrial com dezenas de tanques) é de um jogo AAA feito com modelos
esculpidos e texturas fotográficas. Aqui os modelos são montados por código a partir de primitivas; o Ultra aproxima a
iluminação, a água, a fumaça e o acabamento, mas não chega ao nível de detalhe de modelos feitos à mão por artistas.
Testes: `src/test/ultra.test.ts`.
