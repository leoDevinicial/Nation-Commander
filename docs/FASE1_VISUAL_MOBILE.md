# Fase 1 do adendo — identidade visual, menu, HUD e mobile

## O que mudou

| Tema | Implementação | Arquivos |
|---|---|---|
| Título | "Modern Geopolitical Real Strategy 3d Game" no menu, no login e na aba do navegador (`GAME_TITLE`) | `shared/version.ts`, `index.html` |
| Globo do menu | Terra 3D com oceano, países, fronteiras e litoral em camadas separadas, halo atmosférico, nuvens (fora do preset baixo), estrelas e marcadores das capitais jogáveis. Gira continuamente (~80 s por volta; ~5 min com "reduzir movimento"). Carregado sob demanda. Sem WebGL, fica um fundo em CSS | `src/globe/`, `src/ui/components/GlobeBackdrop.tsx` |
| Enquadramento | Tela larga: menu à esquerda e globo à direita. Retrato estreito: horizonte planetário embaixo. Outras telas: globo esmaecido e centralizado. É sempre o mesmo globo, que não é recriado ao trocar de tela | `globeFraming()` |
| Tokens visuais | Superfícies, metal escovado, detalhe oxidado, acento latão, sinais, estados diplomáticos e militares (aliado, amistoso, neutro, hostil, guerra, sanção, desconhecido), raios, durações e alvo de toque | `src/index.css` |
| Botões | Gradiente metálico com textura fina, borda inferior levemente oxidada, estados hover/pressed/focus/disabled e alvos de 40 px no toque. As cantoneiras dos painéis são só detalhe | `src/index.css` (`@layer components`) |
| Rótulos | Iniciais maiúsculas, com preposições e artigos em minúsculas ("Nova Partida", "Criar Sala Multijogador", "Entrar em Sala", "Voltar ao Menu", "Propor Comércio"…) | telas e painéis |
| HUD | A barra superior rola na horizontal em vez de cortar e mostra os botões só com ícone em telas estreitas. A velocidade vira um botão cíclico. O painel de comando empilha as informações e rola os botões na horizontal no celular. O minimapa encolhe. O painel nacional ocupa a tela no celular, com abas roláveis. O registro de eventos mostra menos linhas em telas pequenas | `src/ui/hud/*`, `src/ui/national/NationalPanel.tsx` |
| Toque | Gestos (toque, dois toques, toque longo, arrastar, pinça, giro) e a barra de ferramentas Selecionar / Ordem / Área / Somar / Aproximar / Afastar / Girar / QG / Desmarcar. A construção é confirmada tocando duas vezes no mesmo lugar ou no botão **Confirmar** | `src/game/input/TouchGestures.ts`, `src/ui/hud/TouchToolbar.tsx`, `GameRuntime` |
| Presets gráficos | Mobile/Baixo, Equilibrado e Alto, com detecção pelo aparelho e migração das configurações antigas. Mexem só na renderização | `src/lib/graphics.ts`, `useSettingsStore` |
| Segundo plano | O globo para de desenhar com a aba oculta e tem limite de quadros por preset. Há opção "Reduzir animações" e o `prefers-reduced-motion` do sistema é respeitado | `GlobeView`, `SettingsScreen` |

Dependências novas: `world-atlas` e `topojson-client`, ambas com licença ISC; os dados do `world-atlas` vêm do Natural Earth, em
domínio público. Elas fornecem as fronteiras do globo. O arquivo de 108 kB (40 kB comprimido) faz parte do build. O
Three.js do menu fica em um bloco separado, carregado depois da interface.

## Testes automatizados

- `src/test/touch.test.ts` (11 testes) cobre:
  - toque e toque duplo;
  - limiar de tempo e distância;
  - arrasto;
  - toque longo e o cancelamento dele;
  - pinça e zona morta;
  - seleção por área e o cancelamento por um segundo dedo;
  - `pointercancel`.
- `src/test/ui-foundation.test.ts` (8 testes) cobre:
  - o título exato;
  - a escolha de preset por aparelho;
  - a ordem de custo dos presets;
  - a migração das configurações antigas;
  - a geografia dos 10 países jogáveis;
  - as camadas de fronteira e litoral;
  - a conversão lon/lat e a rotação do globo;
  - o enquadramento por formato de tela.

## Checklist manual (Chromium headless com SwiftShader e emulação de toque)

| Verificação | Desktop 1440×900 | Tablet 1180×820 (toque) | Celular 390×844 (toque) | Celular deitado 844×390 (toque) |
|---|---|---|---|---|
| Menu com título, rótulos e globo visível | ✔ | ✔ (globo centralizado, esmaecido) | ✔ (horizonte embaixo) | ✔ (globo à direita, menu rolável) |
| Barra superior sem corte | ✔ | ✔ | ✔ (rola na horizontal) | ✔ |
| Selecionar o Centro de Comando por toque | — | ✔ | ✔ | ✔ (o QG fica atrás do painel até usar **QG**) |
| Pinça com dois dedos (distância 48 → 16) | — | ✔ | ✔ | ✔ |
| Arrastar um dedo move a câmera | — | ✔ | ✔ | ✔ |
| Construir por toque (posicionar e tocar de novo) | — | — | ✔ (edifícios 1 → 2) | — |
| Dois toques selecionam o tipo; toque longo ordena | — | — | ✔ (3 soldados, comando `move` enviado) | — |
| Painel nacional sem cobrir controles essenciais | ✔ | ✔ | ✔ (tela cheia com botão fechar) | ✔ |
| Configurações e saguão legíveis | ✔ | ✔ | ✔ | ✔ |

## Limitações e pendências reais

- **Validação em aparelhos físicos:** os testes usaram emulação de toque no Chromium, com renderização por software. Falta medir FPS
  e conforto de toque em aparelhos reais (iOS Safari e Android Chrome). O adendo pede isso na Fase 12.
- **Fonte de exibição:** a interface usa fontes do sistema (Bahnschrift/DIN quando existem). Nenhuma fonte externa foi
  embutida para manter o build sem downloads de terceiros.
- **Ícones:** a maior parte dos ícones ainda são glifos Unicode. Pausar/retomar já é SVG porque o glifo faltava em fontes
  móveis. Um conjunto de ícones SVG próprio fica para o polimento.
- **Globo do menu:** é decorativo nesta fase. Seleção de países, névoa e estados diplomáticos chegam na Fase 2, reaproveitando as
  camadas (`setLayerVisible`) e os dados de `shared/data/geography.ts`.
- **Painel de comando no celular deitado:** ocupa cerca de 1/3 da altura. O botão **QG** e a ajuda recolhível reduzem o problema;
  um painel minimizável fica para o polimento.
