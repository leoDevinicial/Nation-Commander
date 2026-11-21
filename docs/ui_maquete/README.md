# Maquete da interface — "Sala de Situação" (05/11/2026)

Proposta de identidade visual para o HUD, feita a pedido do responsável ("a UI está simples, dá ar de amadorismo").
**Ainda não está no jogo:** são imagens para aprovar a direção antes de mexer em `src/ui/`.

- `1-tela-computador.jpg` — partida com o Centro de Comando selecionado e a dica de um cartão.
- `2-tela-celular.jpg` — a mesma tela no celular em paisagem (menos itens, mesmo layout).
- `3-momento-cinematografico.jpg` — faixa dos grandes momentos (satélite, nova era, guerra, nuclear).
- `4-identidade-visual.jpg` — cores, tipografia, moldura, botões, estados dos cartões, ícones e regras de UX.
- `5-antes-e-depois.jpg` — prints do celular do usuário × a proposta, na mesma escala.

Ideia central: painéis de console sobre o mapa, com canto chanfrado (eco das formas facetadas do low poly), colchetes
de latão nos outros cantos, faixa na cor da nação, números em fonte de instrumento; ícones de um conjunto só (Lucide,
ISC) no lugar dos emojis; fontes livres (Barlow Condensed / Barlow Semi Condensed / JetBrains Mono, OFL) embutidas.

**Revisão de 05/11:** o ferro virou lingote (a bigorna não era reconhecida) e cada recurso tem a sua cor também nos
custos; o cartão diz quanto falta ("Faltam 100 de ferro") e mostra a manutenção por dia com o $ verde; a dica detalha
a manutenção (serviço público, energia, área, como no caixa do país: `shared/strategic/treasury.ts`) e o saldo do
caixa antes → depois de construir. **Regra aprovada (05/11):** o cartão mostra o saldo líquido do prédio por dia
(produção que entra no caixa menos manutenção, serviço e energia): verde se positivo, vermelho se negativo (ex.: Fazenda
+$21 mil/dia, Escola −$83 mil/dia). Design aprovado pelo responsável em 05/11. Valores da maquete: país com PIB de ~US$ 2,2 tri na Era IV (energia ×2).

O fundo é uma cena real do jogo (Sandbox) capturada sem o HUD. Para refazer as imagens:

```bash
cd docs/ui_maquete/fonte
npm i --no-save @fontsource/barlow-semi-condensed @fontsource/barlow-condensed @fontsource/jetbrains-mono lucide-static
node build.cjs            # monta hud.html, hud-cine.html e folha.html (ícones embutidos)
node shot.cjs hud.html ../1-tela-computador.png 1600 900 2
```

## Implementação no jogo

1. **Base + barra de cima (05/11):** fontes embutidas (`src/main.tsx`), tokens e classes `nc-*` em `src/index.css`
   (moldura `.nc-frame` → componente `src/ui/components/Frame.tsx`, `.nc-icon-btn`, `.nc-seg`, `.nc-kicker`,
   `.nc-title`, `.nc-num`); `.panel` e `.btn` do jogo todo passaram ao grafite liso; ícones Lucide (`lucide-react`) e o
   lingote próprio (`IngotIcon`); `ResourceIcon`/`RESOURCE_STYLE` com a cor fixa de cada recurso (custo que falta: ícone
   vermelho). `TopBar` em quatro blocos: insígnia com a sigla do país na cor da nação (não há bandeiras no jogo), era em
   algarismo romano e aprovação com medidor; recursos com barra de capacidade (rótulos a partir de 1800 px, rolagem com
   esmaecido na borda); relógio, hora do dia, pausa e velocidade (botões 1×/2×/4× a partir de 1800 px, um botão que
   alterna abaixo); menus só com ícone e a conexão como um ponto. Abaixo de 1024 px saem o nome do país, o saldo diário
   do caixa, a visão de perto e a música (seguem no extrato, no menu e na tecla M).
2. **Painel de comando (05/11):** moldura `<Frame>`; abas com ícone e sublinhado de latão (`.nc-tab`; só o ícone abaixo
   de 1100 px); cartões (`CardButton`, CSS `.cmd-card`) com canto chanfrado, miniatura 3D, custo nas cores dos recursos,
   "Faltam N de X" em vermelho quando falta recurso (o cartão não apaga), hachurado e aviso em âmbar quando falta era,
   pesquisa ou nível do QG (`locked`), e o **saldo por dia** (`net`, verde rende, vermelho custa) calculado por
   `buildingDayUsd` em `shared/strategic/treasury.ts` (as mesmas contas do caixa: produção estimada com 75% das
   células, área, serviço público e energia da era, na escala do PIB `research.usdScale`); grade de 6 colunas a partir
   de 1280 px. Cabeçalho do prédio: retrato 3D, nome em título, nível em marcadores (`LevelPips`), vida em 10 segmentos
   e o saldo real (com o rendimento atual). Fila restilizada.
3. **Avisos, faixa cinematográfica e minimapa (05/11):** feed (`EventLog`, classe `.nc-event`) com faixa e ícone por
   tipo e o emoji inicial dos textos antigos removido; alertas mundiais com ícone em hexágono (`WorldAlertIcon`); os
   grandes momentos do próprio jogador (`big`: nova era, Grande Projeto concluído, armas nucleares, guerra declarada
   contra nós, satélite em órbita) viram a faixa cinematográfica no centro por 5,5 s (`.nc-cine-band`, mais compacta em
   telas baixas). Minimapa na moldura nova, com bússola.
4. **Celular (05/11, feedback com prints):** a barra de recursos fica sozinha no topo (todos os recursos visíveis) e
   nação, relógio e menus abrem por um botão ao lado (seta; mostra o ícone de pausa quando o jogo está pausado), numa
   linha opaca por cima dos avisos. O contador de desempenho ficou compacto. Corrigido: com altura máxima, a moldura
   cortava os cartões de construção em vez de rolar (`.nc-frame` em coluna e `.nc-frame-in` com `flex: 1; min-height:
   0`). Cartões estreitos: "Faltam N" com o ícone do recurso e o saldo sem "/dia".
5. **Menus (05/11):** menu de pausa e Opções na moldura `<Frame>`, com título, rótulo "Sala de Situação" e ícones;
   as cantoneiras antigas (`.panel-frame`, telas fora da partida e diálogos como o de guerra) viraram os colchetes de
   latão, sem o recorte chanfrado (nada que abre para fora é cortado); menu principal com ícones no lugar dos emojis.
   Barra de recursos: petróleo como gota cheia, carvão como pedras (`OilIcon`, `CoalIcon`) e um toque num item mostra
   no feed o nome e a quantidade (no celular não há dica ao passar o dedo).
6. **Painel nacional (05/11):** moldura `<Frame>` com fundo quase opaco (por cima de outros painéis), insígnia do país,
   nome em título, data em rótulo, botão de fechar com ícone e as 8 abas com ícone e sublinhado de latão; base subida
   para não cobrir o painel de comando. Peças compartilhadas pelas abas: `Meter` em 10 segmentos com ícone de estado e
   `StatTile` com canto chanfrado e números de instrumento. Ficha de país do Globo com os colchetes e o fechar novo.
7. **Ícones no lugar de emojis (05/11):** os cartões de comando (avançar, parar, construir, estrada, rodovia,
   zoneamento, demolir, mina, satélite, foguete, aviões, mísseis, abortar), os pincéis de zona, as áreas de melhoria e
   os tipos de aeronave usam ícones Lucide em latão (`.cmd-card-icon`; cinza quando bloqueado). Áreas de pesquisa,
   modos de rota do comércio e os textos do painel do prédio (serviços da cidade, caravana, energia, construtores,
   Globo) também. Controles deslizantes e caixas de marcar em latão.
8. **Fim dos emojis na interface (05/11, noite):** barra de toque do celular (mão, seta, área, zoom, girar, QG,
   desmarcar), botão do chat, drone, painéis de batalha, Globo, mapa operacional, Sandbox, melhoria de prédio, avisos
   (`Toasts`), estados da árvore de pesquisa (`StateIcon`: concluída, em andamento, bloqueada, pausada, disponível),
   dicas de energia no posicionamento, ligação por estrada, bens (aço e combustível), botões de fechar, lobby, salas,
   comunidade, feedback (estrelas preenchidas), manual, opções, login e resultados — tudo com ícones Lucide.
   Textos traduzidos ganharam a chave sem o símbolo em `en.ts`/`es.ts`.
9. **Lobby e salas (05/11, noite):** o `Shell` (moldura de todas as telas fora da partida) ganhou cabeçalho com o
   rótulo "Sala de Situação", título no estilo do painel, linha de latão e Voltar com ícone. Lobby: cada vaga com a
   insígnia da nação (`NationBadge`, sigla na cor da vaga), faixa lateral acesa, selo de estado (anfitrião, pronto,
   aguardando), ping em barras de sinal; vagas no seletor segmentado; mapa, regra e dificuldade em cartões de escolha
   (`ChoiceCard`: ícone, borda e marca de latão, rádio escondido mas acessível); código da sala em números de
   instrumento; chat com título "Canal da sala"; botões com ícone. Salas públicas: criar, entrar e lista vazia com ícone.
10. **Globo (05/11, noite):** barra de camadas na moldura com colchetes, título e data no estilo do painel; camadas
   ligáveis (`.nc-layer`: latão discreto ligado, apagado desligado; o latão cheio fica para comando) com ícones.
   Ficha do país com sigla, rótulo "Ficha do país" e título; relação em barra de −100 a +100 (`RelationBar`, verde
   para a direita, vermelho para a esquerda); "Situação atual" como rótulo; ações diplomáticas com ícones (comércio,
   aliança, sanções, missão, ajuda, guerra) — valem também na aba Diplomacia do painel nacional.
11. Restam de propósito: setas de tendência (▲▼) nos números do painel nacional, `producibleIcon` (só aparece sem
   miniatura) e símbolos matemáticos em textos (√, ≈, →).

## Lobby — proposta de redesign (16/11, ainda não está no jogo)

Pedido do responsável depois de uma proposta de menu/lobby feita com o Grok; esta segue a identidade aprovada em 05/11
(mesma moldura, latão, cor da nação e fontes), não a paleta nova daquela proposta.

- `6-lobby-computador.jpg` — sala multijogador de 4 nações (2 humanos + 2 bots) em 1600 × 900: tudo numa tela, sem
  rolar. Cabeçalho com o nome da sala e o código em destaque ("Copiar", "Pública", vagas e servidor); três colunas
  (Nações, Operação, Canal da sala); barra de ação fixa com quem está pronto (faixas na cor de cada nação), o que falta,
  o resumo da operação, "Sair" e "Iniciar operação".
- `7-lobby-celular.jpg` — celular em paisagem: abas Nações / Operação / Canal (com contador de mensagens), a lista rola
  dentro do painel e a barra de ação continua fixa.
- `8-lobby-antes-e-depois.jpg` — o lobby de hoje (2.467 px de altura, o Iniciar fica depois de rolar) × a proposta.

Fontes: `fonte/lobby.tpl.html`; `node fonte/lobby-build.cjs` monta `lobby.html` e `lobby-celular.html` (ícones de
`lucide-static`, instalado com `npm i --no-save lucide-static` na raiz) e `node fonte/shot.cjs` tira as imagens.
Os números das vagas (PIB, defesa) são ilustrativos.

## Menu inicial — redesign (16/11, aplicado em `src/ui/screens/MenuScreen.tsx`)

- `9-menu-computador.jpg` — o globo do menu como cenário da tela inteira, título grande ("Comande uma nação") com o
  título oficial do jogo no rótulo, uma ação principal ("Jogar contra a IA") e Multijogador ao lado; "Continuar partida"
  só quando há uma; modos em cartões embaixo (Contra a IA, Multijogador com o campo do código, Tutorial, Sandbox);
  cartão de Novidades com a versão e o link para o changelog; barra discreta em cima com Comunidade, Novidades,
  Manual, Configurações, idioma, servidor e o perfil.
- `10-menu-celular.jpg` — celular deitado: atalhos só com ícone, cartões compactos, sem o texto de apoio.
- `11-menu-antes-e-depois.jpg` — o menu de hoje × a proposta.

Fontes: `fonte/menu.tpl.html` (base visual em `fonte/base-maquete.css`, a mesma do lobby) e `fonte/menu-globo.jpg`
(recorte do globo do menu de hoje). `node fonte/lobby-build.cjs` monta `menu.html` e `menu-celular.html`.

No jogo: o globo de fundo é o `GlobeBackdrop` "hero"; "Continuar partida" ficou de fora (o jogo ainda não guarda
partida para retomar pelo menu). No celular em pé os atalhos descem para uma segunda linha inteira e o idioma mostra só
a sigla; deitado (altura até 520 px) somem o texto de apoio, a descrição dos cartões e o subtítulo do perfil.

## HUD compacta — proposta (21/11) e implementação (21/11, padrão no jogo)

Pedido do responsável depois de comentários no Reddit ("UI ocupando 50–60% da tela", "esconda o que não está
selecionado", "nada de 'Toque: selecionar…' na tela; ensinar é papel do tutorial"). Ideia dele: minimapa no canto de
baixo à esquerda, um botão no canto de baixo à direita que abre uma roda de ferramentas e, ao selecionar algo, a roda
recolhe e aparece um cartão compacto. Segue a identidade aprovada em 05/11 (moldura, latão, cor da nação, fontes).

- `12-compacta-computador-vazio.jpg` — nada selecionado: barra de cima com o essencial (nação e era, caixa, suprimentos,
  comida, madeira, pedra, petróleo e "mais"), relógio e menus à direita, um aviso passageiro, minimapa e o botão da roda.
- `13-compacta-computador-roda.jpg` — roda aberta: Construir (B), Pesquisa (R), Nação (G), Diplomacia e Comércio num
  arco de 90°, com o atalho do teclado ao lado.
- `14-compacta-computador-predio.jpg` — Centro de Comando selecionado: retrato, nome, nível, vida, produção, uma linha de
  descrição e 4 ações (produzir Cidadão com o custo, Construir, Melhorar, Nova era); a roda recolhe.
- `15-compacta-computador-tropas.jpg` — tropas selecionadas: tipos agrupados, vida média e ordens (Mover, Atacar,
  Avançar atacando, Parar). Números ilustrativos.
- `16`, `17`, `18-compacta-celular-*.jpg` — celular deitado (Pixel 7): menos recursos fixos, ações só com ícone e alvos
  de toque de pelo menos ~40 px.
- `19-compacta-antes-e-depois.jpg` — hoje × proposta, na mesma partida e câmera.

Quanto da tela a interface cobre (1.500 pontos da tela; `elementFromPoint`, o que não cai no mapa):

| Estado | Hoje | Proposta |
|---|---|---|
| Computador, nada selecionado | 31% | 5% |
| Computador, roda aberta | — | 6% |
| Computador, prédio ou tropas | 31% | 13% |
| Celular, nada selecionado | 34% | 7% |
| Celular, roda aberta | — | 10% |
| Celular, prédio selecionado | 49% | 19% |

Fontes: `fonte/hud-compacta.tpl.html` (estados `s-vazio`, `s-roda`, `s-predio`, `s-tropas`; aparelho `pc` ou `cel`) e
`fonte/hud-compacta-build.cjs` (monta `compacta-*.html` com os ícones de `lucide-static`, instalado na raiz com
`npm i --no-save lucide-static`); `node fonte/hud-compacta-shot.cjs <página> <saída.png> [pc|cel]` fotografa e mede.
Os fundos (`compacta-cena-*.jpg`) e o "hoje" (`compacta-antes-*.jpg`) são capturas da partida real contra a IA, com a
interface escondida no caso dos fundos. A comparação sai de `fonte/compacta-antes-depois.tpl.html` (trocar `{{M}}` pela
pasta das fotos e `{{A_*}}`/`{{B_*}}` pelas porcentagens).

Em aberto para a implementação: o que vai para o "mais" da barra (energia, população, conhecimento, carvão, ferro),
onde ficam Exército e Chat (fora da roda: o chat é o ícone ao lado do menu), o cartão de quartel/fábrica com a fila de
produção e as escolhas de construção (abrem do botão Construir do cartão), e a opção "Interface compacta" nas
Configurações para comparar com a atual antes de trocar de vez.

**Implementado (21/11), como padrão:** `src/ui/hud/ToolWheel.tsx` (roda no canto de baixo à direita: Construir, Pesquisa,
Nação, Diplomacia e Comércio num arco; recolhe com seleção; Esc ou toque fora fecha; `data-tour="build-button"` no botão
principal e, aberta, no Construir), o painel de comando só aparece com seleção ou ação em andamento (o "Nenhuma
seleção" com a lista de atalhos saiu) e tem largura máxima de 980 px, o Construir saiu do minimapa, os controles de
toque começam recolhidos e o Chat virou só o ícone. Medido no jogo (mesma conta que a maquete): computador sem seleção
**8%** (era 31%), com o Centro de Comando selecionado 23% (era 31%); celular sem seleção **13%** (era 34%), com seleção 44%
(era 49%). Ainda não feito: barra de cima compacta (os recursos menos usados no "mais") e o cartão enxuto da maquete
(hoje o cartão é o painel de comando completo, com as obras e a fila).
