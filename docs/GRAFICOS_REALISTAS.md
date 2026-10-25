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

## Presets
- **Alto:** texturas 512 px, relevo externo com 160 segmentos, fumaça.
- **Equilibrado/Baixo:** texturas 256 px, 90 segmentos; fumaça só quando o preset permite mais de 60 efeitos.

## Limitações conhecidas
- Os modelos continuam sendo geometria low-poly; o realismo vem de texturas e iluminação, não de modelos esculpidos.
- Barreiras de concreto, contêineres e meio-fio como objetos de cena ficam para uma próxima rodada visual.
