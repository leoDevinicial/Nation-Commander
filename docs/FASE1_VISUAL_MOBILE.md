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

## Tela cheia (celular e tablet)

Código em `src/lib/fullscreen.ts` (API) e `src/ui/components/FullscreenButton.tsx` (interface). Testes em `src/test/fullscreen.test.ts`.

| Situação | Comportamento |
|---|---|
| Android, iPad, computador | Botão de tela cheia na barra superior da partida e no canto inferior direito dos menus. Esconde a barra do navegador (`navigationUI: 'hide'`). Usa os nomes `webkit` quando só eles existem. Sair: o mesmo botão, o gesto de voltar ou Esc; o ícone acompanha o estado real |
| Início automático | Com a opção **Entrar em tela cheia ao iniciar uma partida** (ligada por padrão em aparelhos de toque), os toques em *Nova Partida*, *Entrar em Sala*, *Iniciar Operação* e *Estou Pronto* já entram em tela cheia. O navegador só aceita o pedido dentro de um toque, por isso nunca acontece sozinho |
| Convite na partida | Em aparelho de toque fora da tela cheia, um aviso compacto ("Mais espaço para o mapa · Tela cheia · ✕") entra com um toque. Não volta depois de dispensado nem se o jogador saiu da tela cheia de propósito na mesma sessão |
| Travar na horizontal | Opcional (Configurações), desligado por padrão: em tela cheia, trava a orientação onde o aparelho permite |
| iPhone | O Safari do iPhone não permite tela cheia de páginas. O botão e o convite explicam como **adicionar à Tela de Início**; aberto pelo ícone, o jogo roda sem barras (dica mostrada uma vez) |
| App instalado | `public/manifest.webmanifest` com `display: fullscreen`, ícones PNG (192, 512 e *maskable*) e metatags da Apple. Instalado, abre direto em tela cheia e o botão some |
| Entalhe/bordas curvas | Com `viewport-fit=cover`, a interface respeita as áreas seguras (`env(safe-area-inset-*)`) para nada ficar sob o entalhe |

Verificado em navegador headless com celular emulado (horizontal 844×390 e vertical 390×844):
- entrada automática ao iniciar a partida;
- botão de sair na barra;
- saída sem o convite voltar;
- convite com auto desligado, entrando com um toque.

## Abertura (intro)

Ao abrir o jogo, antes da tela de login/registro, toca uma abertura no estilo RTS (`src/ui/screens/IntroOverlay.tsx`, estilos
`.intro-*` em `src/index.css`), com cerca de 7 s:
- fundo preto com grade tática que deriva devagar, radar com varredura dourada e cantoneiras de visor;
- **NATIONS COMMANDER** em branco, fonte Michroma (OFL, embutida via `@fontsource/michroma`, sem depender de serviço
  externo), letra a letra: cada uma surge como um brilho difuso que se condensa em letra nítida;
- uma linha dourada se abre sob o título, um reflexo de luz o atravessa e surge "Modern Geopolitical Real Strategy";
- barra de inicialização com mensagens de status e coordenadas "varrendo" o globo;
- fade de 0,8 s para a tela de login/registro, que entra por baixo com a própria animação — sem corte seco. Se a
  sessão já estava aberta, vai direto ao manual ou ao menu.

Detalhes de comportamento:
- toque, clique ou qualquer tecla pula;
- toca toda vez que o jogo é aberto ou recarregado, inclusive com o login já salvo (antes era uma vez por sessão, o que
  escondia a abertura de quem mantinha a aba aberta); voltar ao menu dentro do jogo não repete;
- com a opção "Reduzir animações" do jogo, é curta e só usa opacidade;
- a preferência de movimento reduzido do sistema não desliga a abertura. O Windows a ativa sempre que "Mostrar
  animações no Windows" está desligado, e por isso a abertura ficava parada no PC enquanto animava no celular. Ela é
  curta, não move a câmera e pode ser pulada. A regra global que desliga as animações com essa preferência exclui
  `.intro-root`;
- robustez: o estado de repouso de todo elemento é visível (só a animação parte do invisível). Se um navegador falhar
  uma animação, o título aparece parado, em vez de sumir. As letras não usam `filter` e o reflexo não usa
  `mix-blend-mode` (combinação que faz texto sumir no Safari do iPhone);
- as telas por baixo só montam quando o fade começa.

## Manual de entrada

Depois do login, antes do menu principal, aparece o **Manual de campo** (`src/ui/manual.ts`, `ManualScreen.tsx`): 7 cartões
curtos (≈2 min), um assunto por cartão.

1. Missão (com o aviso dos 12 min de preparo).
2. Primeiros minutos (ordem de abertura).
3. Recursos e estoque.
4. População (cidadãos, recrutas, moradia, comida).
5. Exército e guerra.
6. Nação e melhorias (verba de obras, especialização).
7. Controles de computador e celular.

| Aspecto | Comportamento |
|---|---|
| Navegação | Botões Voltar/Próximo, pontos clicáveis, setas do teclado e deslize no celular; cada cartão cabe na tela sem rolar |
| Quando aparece | Volta a cada entrada até o jogador chegar ao último cartão e tocar em "Entendi, começar". Sempre disponível pelo botão **Manual** do menu |
| Pular | "Pular por agora" abre um aviso: o manual leva ~2 min e explica regras que travam quem não as conhece (recruta por tropa, guerra declarada, verba de obras, moradia e comida). O padrão é **Continuar lendo**; "Pular mesmo assim" vai ao menu, e o manual volta na próxima entrada. Quem já leu (abriu pelo menu) vê "Fechar", sem aviso |
| Transição | Sem corte seco após o login: o painel surge do fundo (desfoque → nítido, leve zoom, 0,7 s), os blocos aparecem em sequência e o globo atrás escurece junto. Respeita "reduzir movimento" |
| Testes | `src/test/manual.test.ts`: fluxo de leitura, falta de armazenamento, limite de tamanho dos textos (objetividade) e cobertura dos temas básicos |
