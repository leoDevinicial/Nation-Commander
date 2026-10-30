# Passagem de bastão — para o próximo Claude continuar o Nation Commander

Este arquivo é o ponto de partida para quem pega o projeto numa conversa nova (outra conta, mesma repo). Leia-o inteiro
antes de mexer em qualquer coisa. Depois leia `CLAUDE.md` (regras curtas) e
`docs/BALANCEAMENTO_E_PROGRESSAO.md` (direção de design + tabela "Estado da implementação").

Última atualização: 29/10/2026.

## 1. O projeto em uma frase

RTS geopolítico 3D no navegador, todo em português: cada jogador comanda um país real (dados do Banco Mundial/FMI) com
economia nacional, orçamento, diplomacia e um teatro de operações tático em tempo real (coleta, construções, tropas,
aviões, mísseis, eras). Cliente three.js + React/zustand; servidor Node autoritativo com a simulação determinística em
`shared/`; Supabase para contas e histórico.

## 2. Repositório, branch e deploy

- GitHub: `leoDevinicial/Nation-Commander`.
- **Branch de trabalho = branch padrão do repositório: `claude/serene-bell-7cjnhp`.** Todo o trabalho recente está nela.
  Continue nela (ou crie uma branch a partir dela, se o usuário pedir). Há outras branches antigas (`fase9-noticiario`,
  `fase10-nacoes`, `e2e-fotos`, `titulo-3d-modern-geopolitical-rts`, `ccr-…`) — não são a linha principal.
- Push na branch publica: o cliente vai para a Vercel (`vercel.json`) e o servidor para o Render (`render.yaml`, plano
  gratuito hiberna ~30–60 s). Ver `README.md`, seção de deploy.
- Não abrir pull request sem pedido explícito do usuário.
- Commits terminam com as linhas de atribuição que o ambiente pedir (Co-Authored-By / Claude-Session). Nunca colocar
  identificador de modelo em código, commits ou docs.

## 3. Regras de trabalho (do usuário e do `CLAUDE.md`)

- **Responder sempre em português.** O usuário escreve informalmente, manda prints do jogo e imagens de referência.
- **Nunca expor `SUPABASE_SERVICE_ROLE_KEY`** no cliente nem em commits. Supabase: projeto `vzzzfseliawtnodsysrn`
  (migrações em `supabase/migrations/`; as já aplicadas estão no banco).
- Antes de entregar: `npm test`, `npm run lint`, `npm run typecheck` — os três precisam passar.
- **Nunca rodar o prettier no arquivo inteiro** de arquivos existentes (`src/game/GameRuntime.ts` e
  `src/game/render/models/unitModels.ts` não seguem o prettier padrão; o diff explodiria). Em arquivos **novos**:
  `npx prettier --write --single-quote --print-width 180 <arquivo>`.
- A cada entrega: atualizar a tabela "Estado da implementação" no fim de `docs/BALANCEAMENTO_E_PROGRESSAO.md` e a página
  de docs do sistema mexido (uma página por sistema em `docs/`).
- Ao mexer em economia ou IA: rodar `npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 25` e conferir os 6 critérios da
  seção 5 de `docs/RECALIBRAGEM_RECURSOS.md` (todos passavam em 12 seeds na última medição).
- Commits pequenos e descritivos em português, um por pedido do usuário; push logo depois.
- Ao final de cada pedido, responder ao usuário em português, curto, dizendo o que mudou e o que foi verificado (e o que
  **não** foi verificado).

## 4. Rodar e verificar

```bash
npm ci
ALLOW_GUESTS=true npx tsx watch server/index.ts   # servidor de jogo (ws://localhost:8787/ws)
npx vite --port 5173                              # cliente
npm test && npm run lint && npm run typecheck
```

- `.env.example` lista as variáveis (cliente `VITE_*`, servidor `SUPABASE_*`, `ALLOW_GUESTS`, `ALLOWED_ORIGINS`).
- Verificação no navegador: Playwright + Chromium já vêm no ambiente de nuvem (`require('playwright')`). Padrão usado:
  entrar como convidado (`#guest` + botão "Jogar"), "Operação contra a IA" ou "Modo Sandbox", "Iniciar Operação", esperar
  `window.__runtime.snapshot`; o runtime fica exposto em `window.__runtime` (seleção, `send(cmd)`,
  `localPlacementError`, `publishHud`). Lançar o Chromium com
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; o SwiftShader é lento e às vezes reconecta —
  tire screenshots rápido.
- **Prévia de modelo 3D isolado** (o jeito mais rápido de iterar design): criar um `.html` temporário na raiz que importa o
  builder (`/src/game/render/models/...`), monta cena com luz e chão e renderiza; servir com `npx vite --port 5174` e
  tirar screenshot com Playwright. Apagar o `.html` antes do commit.
- **Folha de auditoria visual** (todos os edifícios ou unidades de uma era numa imagem): página temporária que cria
  `new BuildingVisual(id, type, 0, true, { center, cellSize: 2, mapWidth: 64, era })` (ou `new UnitVisual(id, type, 0,
  true, era)`) para cada tipo, enquadra pela `Box3` e desenha num `<canvas>` grande, 4 por linha. **Obrigatório na
  prévia:** os materiais do jogo leem o mapa da névoa de guerra (`fogUniforms` em `src/game/render/materials.ts`); sem
  ele tudo sai preto. Antes de renderizar:
  `const wt = new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1); wt.needsUpdate = true;
  fogUniforms.uFogMap.value = wt; fogUniforms.uFogSize.value.set(1000, 1000);`
- Rodar script TS que importa `three` direto: precisa estar dentro do repositório (ex.: `./zz_teste.ts`, apagar depois);
  no scratchpad o `three` não é encontrado.
- **Cuidado:** nunca usar `pkill -f` com um padrão que case com o próprio comando do shell (mata o shell). Matar por PID:
  `for p in $(ps aux | grep -E "vite --port 517[34]" | grep -v grep | awk '{print $2}'); do kill $p; done`.
- Transcrever áudio não funciona aqui (download de modelos bloqueado): peça o pedido por escrito.

## 5. Mapa do código

- `shared/sim/` — simulação tática determinística (20 ticks/s):
  - `config.ts` — unidades, construções, custos, terreno, depósitos. **Bloco `ECONOMY` no fim** multiplica os custos ao
    carregar (o valor usado é o escalado). **Custo crescente:** construir usa `buildingCost(type, existentes)` (+18% por
    edifício do tipo), nunca `BUILDINGS[t].cost` direto.
  - `Simulation.ts` — estado, comandos (`applyCommand`), coleta, trabalhadores (`staff`: ociosos entram em rodízio),
    combate, eras, snapshot.
  - `TacticalAI.ts` — IA tática (economia que reage ao gargalo, reservas, pesquisa, ondas, explorador, engenheiros,
    aviões).
  - `matchMap.ts` — gerador dos mapas das partidas (2–6 nações, simetria, tipos de mapa, kit de recursos por base com
    início garantido).
  - `eras.ts`, `air.ts`, `mines.ts`, `upgrades.ts`, `production.ts`, `placement.ts`, `report.ts`, `trade.ts`…
- `shared/strategic/` — camada nacional (economia, orçamento, diplomacia, decretos/facções).
- `server/` — `Room.ts` (lobby, bots, times, partida, salvamento), `handler.ts`, `messages.ts` (validação das mensagens).
- `src/game/` — `GameRuntime.ts` (runtime 3D), `render/` (visuais de unidades/edifícios, materiais, modelos em
  `render/models/`), `audio/`, `perf/` (KGPS/KAICS).
- `src/globe/` — globo diplomático (`GlobeView.ts`, satélite em `satelliteModel.ts`).
- `src/ui/` — HUD e telas (lobby `screens/LobbyScreen.tsx`, painel de comando `hud/CommandPanel.tsx`).
- `scripts/sim-economia.ts` — simulação IA×IA e critérios de economia.
- `docs/` — uma página por fase/sistema; `docs/AUDITORIA_ADENDO.md` diz o estado de cada fase.

### Modelos 3D (o usuário pede muito isso)

- Kit: `src/game/render/models/kit.ts` (`PartBuilder`: `box`, `cyl`, `sphere`, `side` (perfil XY extrudado em Z),
  `plan` (planta XZ extrudada em Y), `add`). Unidades têm camadas `body` (cor de vértice, recebe a pintura da era),
  `accent` (cor da facção do dono) e `glass`.
- Unidades: `render/models/unitModels.ts`; frente = +x. `unitModel(type, era)`; **variantes por era** em
  `ERA_BUILDERS` (hoje, na era 4 "Futuro Próximo": Lança-Foguetes 8×8, Artilharia 6×6 com torre, Tanque Moderno
  "Proryv"). `unitModelKey` decide quando trocar o modelo; `GameRuntime` refaz o visual quando a unidade é modernizada
  numa era que troca o veículo. `glow` no modelo = lentes acesas (`color: 'faction'` usa a cor do dono).
- Detalhes que devem seguir o jogador vão na camada `accent` (não usar vermelho fixo — o usuário pediu isso).
- Edifícios: `render/models/*.ts` + `render/BuildingVisuals.ts`; peças de era em `render/models/eraProps.ts`
  (radar, painéis solares, torre de telecomunicação, LED, drone de vigilância em `droneModel.ts`).
  **Peças de era sempre apoiadas no telhado real:** `roofSampler(this.parts)` (raio vertical contra as malhas do corpo)
  é passado a `buildEraProps`; nunca posicionar pela altura nominal `def.height` (foi isso que deixava painéis e
  mastros flutuando). Painéis solares só em telhado plano (tolerância 0,06, com margem de 0,3), com pés até o telhado;
  radar é parabólica aberta (`LatheGeometry`) em escala `size / 6` (mín. 0,55); mastro e radar usam `roofNear`
  (procura telhado indo do canto para o centro). Ao trocar de nível o modelo muda e as peças de era são refeitas.
- Altura dos cidadãos/recrutas (`render/CitizenLayer.ts`) e das peças no chão: `GameRuntime.groundHeight` (só o
  terreno; água −0,7, rocha/minério 0,9, lama −0,08).
- Thumbnails do menu (`render/Thumbnails.ts`) ainda usam o modelo da era 1.

## 6. O que foi feito nesta sessão (mais recente primeiro)

- **Caravanas internas** QG ↔ prefeitura (`shared/sim/caravans.ts`, `docs/CARAVANAS.md`): uma por prefeitura,
   renda por chegada proporcional à rota, 30% mais rápidas na estrada, emboscadas e reposição; caminhão no `CargoLayer`
   e situação no painel da prefeitura.
- **Guia do jogador em PDF** (`docs/GUIA_DO_JOGADOR.pdf`, 27 páginas, linguagem simples, com capturas do jogo).
   Feito com HTML + Playwright (`page.pdf`) a partir de capturas em partida contra a IA e no Sandbox; os números são
   os do jogo em 30/10/2026. Se regras ou custos mudarem, o guia precisa ser refeito.
1. **Antiaérea Móvel do Futuro Próximo** (8×8 estilo Pantsir, `buildMobileAaFuture`) e **interceptação de
   salvas do Lança-Foguetes** em voo:
   - a regra fica em `ROCKET_INTERCEPT` e `Simulation.updateInterceptions`; gera o evento `salvo_intercepted`, com
     teste em `shared/test/military.test.ts`;
   - o visual fica em `RocketLayer.intercept`, com mísseis pequenos saindo dos casulos.
   Variantes de era 4 já feitas: Lança-Foguetes, Artilharia, Tanque Moderno e Antiaérea Móvel. Detalhes em
   `docs/ERAS.md`.
2. **Auditoria visual e estruturas flutuantes corrigidas:** peças de era (painéis solares, radar, torre de
   telecomunicação, LED) passaram a se apoiar no telhado real (`roofSampler`). Radar virou parabólica em escala.
   Folhas de todos os edifícios (eras 1, 3 e 4) e unidades (eras 1 e 4) revisadas sem outros erros visíveis.
   Pendente: o usuário viu cidadãos/recrutas que pareciam estar no teto do QG (print com bonecos de capacete azul
   perto da torre do QG na era 2); pela leitura do código eles ficam na altura do chão e não foi possível reproduzir —
   se ele mandar outro print, investigar (CitizenLayer: `doorPoint`, rota dos recrutas em volta do quartel, grid de
   ocupação).
3. Arquivo de passagem `docs/HANDOFF.md` (este) e link no `CLAUDE.md` e no README.
4. Detalhes vermelhos dos veículos da era 4 → cor da facção.
5. Tanque Moderno da era 4 (T-90M "Proryv", Shtora acesa) — `t90Future`.
6. Artilharia da era 4 (caminhão 6×6 com torre facetada) — `buildArtilleryFuture`.
7. Lança-Foguetes da era 4 (8×8 blindado, 12 tubos grandes) + sistema de variantes por era.
8. Drone de vigilância redesenhado (protetores octogonais, hélices girando).
9. Bots com país sorteado e escolhido pelo anfitrião (`set_bot_country`; com `seed` nos testes o sorteio é fixo).
10. Satélite do globo redesenhado (`satelliteModel.ts`).
11. **Recalibragem da coleta** (`docs/RECALIBRAGEM_RECURSOS.md`): 6 trabalhadores por coleta, QG 1,5/s, consumo de
    comida 0,04, cidadão 10 s, custo crescente +18%, IA que reage ao gargalo, início garantido no mapa, ondas menos
    suicidas, guarnição mínima, explorador em ronda. Os 6 critérios passam em 12 seeds.
12. **Economia cara** (`docs/ECONOMIA.md`): custos 1,25×–3× (`ECONOMY`), começo com 6 cidadãos + 1 Explorador, verba de
    obras inicial 25%, depósitos e armazéns maiores.
13. Antes disso: Centro Financeiro redesenhado, menu de construção em abas, aeronaves revelam o mapa, prefeitura como QG
    secundário, fronteiras inimigas só em terra explorada, lote 4 (até 4/6 nações, tipos de mapa, regiões por país),
    relatório pós-partida, cadeias produtivas, serviços, vitórias alternativas, estradas, engenheiro e minas, Grandes
    Projetos e Programa Espacial, eras, bônus por país e choque nuclear, etc. (ver tabela de estado).

Histórico completo de cada entrega: `git log --oneline` na branch `claude/serene-bell-7cjnhp` (um commit por pedido,
mensagens em português descrevendo o que mudou).

## 7. De onde continuar

Não há pedido em andamento. Dois pontos abertos com o usuário: (1) um áudio dele não pôde ser transcrito — pergunte o
que ele queria; (2) os bonecos que pareciam estar no teto do QG (ver item 1 da seção 6). Ideias pendentes e coisas
conhecidas:

- **Pendente no design:** conteúdo naval de combate (transporte com desembarque, fragata, submarino, porta-aviões) e
  depois os mapas Oceano Central e Arquipélago. Outras direções em `docs/BALANCEAMENTO_E_PROGRESSAO.md` (Tropico:
  ministros, eleições; Rise of Nations: Centros Regionais com captura, generais, espiões, caminhão logístico, recursos
  raros, teto de comércio).
- O usuário está trocando os modelos da era "Futuro Próximo" um a um a partir de fotos de referência. Candidatos ainda
  sem variante de era 4: infantaria, APC, tanque, forças especiais, engenheiro, explorador, aviões e
  edifícios. Siga o padrão: builder novo em `unitModels.ts`, registrar em `ERA_BUILDERS`, prévia isolada, docs em
  `docs/ERAS.md`, detalhes na camada `accent`.
- Thumbnails do menu poderiam mostrar o modelo da era atual do jogador.
- Telhados em arco (quartel) e de duas águas (armazém, casa) ficam sem painel solar na Era Digital; se o usuário
  quiser painéis neles, criar uma variante inclinada que acompanhe a água do telhado.
- Exceção conhecida do início garantido: Rios e Pontes, 5 nações, perfil agrícola, seed 3 — a mina alcança 5 de 6 células.
- Partidas humanas contra a IA para validar a sensação da economia nova ainda não foram feitas.
- `docs/RELATORIO_POS_PARTIDA.md`: o relatório ainda não é gravado no histórico do Supabase.

## 8. Estilo de entrega que o usuário aprovou

- Mostrar imagens (prévia renderizada) quando o pedido é visual.
- Resposta final curta, em português, em tópicos: o que mudou, como verificar, o que não foi verificado.
- Fazer o pedido inteiro sem perguntar quando dá para decidir por padrão razoável; perguntar só quando algo é realmente
  ambíguo e muda o resultado.
