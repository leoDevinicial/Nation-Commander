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
10. Restam de propósito: setas de tendência (▲▼) nos números do painel nacional, `producibleIcon` (só aparece sem
   miniatura) e símbolos matemáticos em textos (√, ≈, →). Próximo passo: miolo do Globo (ficha do país, legenda e
   ações) no estilo da moldura.
