# Passagem de bastão — para o próximo Claude continuar o Nation Commander

Este arquivo é o ponto de partida para quem pega o projeto numa conversa nova (outra conta, mesma repo). Leia-o inteiro
antes de mexer em qualquer coisa. Depois leia `CLAUDE.md` (regras curtas) e
`docs/BALANCEAMENTO_E_PROGRESSAO.md` (direção de design + tabela "Estado da implementação").

Última atualização: 31/10/2026 (versão 1.1.0 publicada: rede elétrica, clima, salas públicas. A 1.2.0, com Comunidade,
Feedback e o KAC, está pronta na branch de trabalho e ainda não foi publicada; próximo passo na seção 7).

## 0.1 Conta atual (assumiu em 30/10/2026)

- **Branch de trabalho desta conta: `claude/youthful-dijkstra-a45emp`.** Foi criada a partir de
  `claude/serene-bell-7cjnhp` no commit `20bdcc5` ("Transição de conta…"); as duas apontavam para o mesmo commit, então
  nada foi perdido nem retrocedido. Desenvolver, commitar e dar push só nela (`git push -u origin
  claude/youthful-dijkstra-a45emp`), salvo pedido explícito do usuário. A `claude/serene-bell-7cjnhp` fica como estava
  (é a que publica na Vercel/Render, ver seção 2): levar o trabalho para lá só quando o usuário pedir.
- **Publicação:** o jogo publicado (Vercel e Render) sai da `claude/serene-bell-7cjnhp`. Em 30/10, a pedido do
  usuário ("integrem no jogo"), ela foi avançada (fast-forward, sem merge) até a `claude/youthful-dijkstra-a45emp`,
  com o CIWS, os sons novos e a correção "Era Era". Para publicar de novo: rodar os testes e
  `git push origin claude/youthful-dijkstra-a45emp:claude/serene-bell-7cjnhp`, só quando o usuário pedir.
- Conferido na chegada: `npm ci`, `npm test` (51 arquivos, 468 testes), `npm run lint` e `npm run typecheck` passando.
- Se uma conta futura assumir, repetir o processo: anotar aqui a branch nova, o commit de partida e o resultado dos
  testes.

## 0. Comece por aqui (transição de 30/10/2026, conta anterior)

1. **Branch (da conta anterior):** `claude/serene-bell-7cjnhp`. Último commit desta conta: o da entrega "manual, handoff e relatório low
   poly" (ver `git log -3`). A árvore estava limpa e enviada ao GitHub, com `npm test` (468 testes), `npm run lint` e
   `npm run typecheck` passando. **Não** use a branch `ccr-0d806073-ne3r6d` nem outras `ccr-…`: o ambiente às vezes
   sugere uma branch nova, mas o usuário pediu para continuar nesta, sem merge e sem retroceder nada.
2. **Primeiro passo na conta nova:** `git fetch origin claude/serene-bell-7cjnhp && git checkout claude/serene-bell-7cjnhp
   && git pull`, depois `npm ci && npm test && npm run lint && npm run typecheck`. Se tudo passar, o estado é idêntico
   ao desta conta.
3. **Leia nesta ordem:** este arquivo → `CLAUDE.md` (regras e **diretriz visual low poly**) →
   `docs/BALANCEAMENTO_E_PROGRESSAO.md` (direção de design e tabela "Estado da implementação") → a página do sistema que
   for mexer (`docs/*.md`).
4. **Nada fica fora do repositório.** Tudo o que esta conta produziu está commitado: código, docs, guia em PDF e as
   **fontes** dele (`docs/guia/`), o relatório low poly e as fontes dele (`docs/relatorio_lowpoly/`). O scratchpad da
   conta antiga (logs de medição, capturas soltas) não é necessário para continuar.
5. **Não há pedido pela metade.** A última entrega foi concluída inteira (seção 6). O próximo passo é o que o usuário
   pedir; a seção 7 lista o que está aberto.

### Quem é quem

- **Usuário (diretor e responsável pelo projeto):** paga hospedagem e servidores, decide o rumo. Conversa em português,
  informal, manda prints e fotos de referência.
- **Co-diretor (irmão do usuário):** cuida principalmente do gráfico 3D. A direção visual definida pelo responsável é
  **low poly estilizado** (ver `docs/RELATORIO_LOW_POLY.pdf` e a diretriz no `CLAUDE.md`). Pedidos visuais são
  atendidos **dentro** dessa estética (luz, efeitos, animação, legibilidade, variantes de era), nunca puxando para o
  realismo nem copiando a aparência de outros jogos.

## 1. O projeto em uma frase

RTS geopolítico 3D no navegador, todo em português: cada jogador comanda um país real (dados do Banco Mundial/FMI) com
economia nacional, orçamento, diplomacia e um teatro de operações tático em tempo real (coleta, construções, tropas,
aviões, mísseis, eras). Cliente three.js + React/zustand; servidor Node autoritativo com a simulação determinística em
`shared/`; Supabase para contas e histórico.

## 2. Repositório, branch e deploy

- GitHub: `leoDevinicial/Nation-Commander`.
- **Branch padrão do repositório: `claude/serene-bell-7cjnhp`.** Todo o trabalho até 30/10 está nela. A conta atual
  trabalha em `claude/youthful-dijkstra-a45emp`, criada a partir dela (seção 0.1). Há outras branches antigas (`fase9-noticiario`,
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
- Ao mexer em economia ou IA: rodar `npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 25` (Normal) e, para o ritmo da IA,
  `npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 30 easy,normal,hard,brutal` (uns 8 min; dá para rodar as quatro
  dificuldades em paralelo, uma por processo). Critérios: seções 5 e 5.1 de `docs/RECALIBRAGEM_RECURSOS.md`. O script
  liga a camada nacional como o servidor (`server/Room.ts`). Na última medição, os únicos critérios que falhavam eram
  dois casos isolados no Normal: num mapa a primeira ofensiva saiu aos 12:55, e numa IA (seed 3, jogador 0) a população
  trava no começo e os suprimentos enchem o armazém 28% do tempo. Todos os outros passavam nas 4 dificuldades.
- **Diretriz visual:** low poly estilizado, modelos gerados por código, leitura antes de detalhe, sem copiar o visual de
  outros jogos, até ~6 mil triângulos por modelo (regras completas no `CLAUDE.md` e no capítulo 7 do relatório low
  poly).
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
- Para entrar como convidado no navegador, o cliente precisa de `VITE_ALLOW_GUESTS=true` e
  `VITE_GAME_SERVER_URL=ws://localhost:8787/ws` (`VITE_ALLOW_GUESTS=true VITE_GAME_SERVER_URL=ws://localhost:8787/ws npx
  vite --port 5173`), e o servidor de `ALLOW_GUESTS=true`. No Sandbox os recursos ficam sempre cheios: não dá para testar
  ali o que depende de armazém com espaço (por exemplo, a venda do mercado interno).
- **PDFs do projeto:** o guia do jogador sai de `docs/guia/` (`node pdf.cjs && python3 montar.py`, ver o README da
  pasta) e o relatório low poly de `docs/relatorio_lowpoly/` (mesmo processo). Ao mudar uma regra que aparece no guia,
  edite `docs/guia/guia.html` e regenere o PDF no mesmo commit.

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
- `scripts/sim-economia.ts` — simulação IA×IA com a camada nacional; critérios de economia e de ritmo da IA por
  dificuldade (terceiro argumento: `easy,normal,hard,brutal`).
- `shared/sim/market.ts` — mercado interno (excedente → suprimentos) do Terminal Comercial.
- `shared/sim/difficulty.ts` — tudo o que muda entre Fácil, Normal, Difícil e Brutal (preparo, primeira ofensiva,
  exército mínimo, eras, orçamento de defesa do governo da IA, ondas, aviões, mísseis, minas).
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

- **KAC — Kaiser Anti Cheat, fases P1 e P2** (31/10, `docs/kac/`):
  - novas correções com teste adversarial:
    - KAC-05: ids de conta viram ids públicos (hash) na sala e no `welcome`;
    - KAC-07: o snapshot não cita alvo fora da visão;
    - KAC-11: decisões nacionais também esperam a pausa;
    - KAC-12: voo inimigo não revela a base aérea na névoa (`AirLayer` anima sem a base);
  - KAC-08: diário persistente em lotes (`server/kac/store.ts`, tabela `kac_events`, migração
    `20261101020000_kac_events.sql`, **ainda não rodada no banco**);
  - KAC-09: sinais de automação, só alerta (`server/kac/behavior.ts`);
  - relatório de integridade de cada partida em `matches.report.integrity` (`server/kac/integrity.ts`);
  - painel de leitura `GET /kac`, ligado só com `KAC_ADMIN_TOKEN` (`server/kac/admin.ts`);
  - política de sanções sem punição automática: `docs/kac/KAC_ENFORCEMENT_POLICY.md`;
  - aberto: KAC-04 (confirmar o IP no Render pelo "KAC resumo"), KAC-06 (ids opacos), KAC-10 (uma instância).

- **KAC — Kaiser Anti Cheat, fase 0 e P0** (31/10, `docs/kac/`):
  - a auditoria confirmou servidor autoritativo (modelo A);
  - três falhas achadas e corrigidas, com testes adversariais em `server/kac.test.ts`:
    - KAC-01: sequestro de convidado pelo id que vazava na sala;
    - KAC-02: abuso da pausa entre humanos;
    - KAC-03: esgotar as salas do servidor sem limite por IP;
  - diário de eventos de segurança (`server/kac/journal.ts`);
  - riscos abertos e próximas etapas em `KAC_THREAT_MODEL.md` e `KAC_IMPLEMENTATION_ROADMAP.md`.

- **Chat da Comunidade** (31/10, `docs/COMUNIDADE_FEEDBACK.md`): botão 🗨 Comunidade no menu com chat global em tempo
  real (`server/communityChat.ts`, histórico de 80 mensagens em memória, limite de ritmo); o formulário virou o botão
  💬 Feedback (`FeedbackScreen`).

- **Comunidade e Feedback** (31/10, `docs/COMUNIDADE_FEEDBACK.md`): tela no menu com formulário de feedback
  (gravado pelo servidor na tabela `feedback`, migração `20261101000000_feedback.sql`), novidades das versões
  (`src/ui/changelog.ts`) e atalhos da comunidade (links por variáveis `VITE_COMMUNITY_*`).

- **Energia mais visível e ajuste fino** (31/10, `docs/REDE_ELETRICA.md`):
  - visibilidade:
    - ícone ⚡ vermelho piscando sobre a construção sem luz (snapshot `unpowered`, só para o dono);
    - ao posicionar, a área energizada aparece amarela no chão (`showPowerArea`) e o painel diz "Com energia aqui"
      ou "Sem energia aqui";
  - ajuste fino:
    - IA ergue a primeira solar ao chegar na Era Digital;
    - carvão 0,15 por ferro: sobra 300 a 580 aos 24 min;
    - critérios da `sim-economia` iguais (7 de 9).

- **Lobby** (31/10): nome da sala escolhido pelo anfitrião; "Vagas na sala" (4 grátis, 6 assinante); vaga aberta
  para jogador ou bot. Publicado com a tela de Salas Públicas.

- **Salas públicas no menu** (31/10, `docs/SALAS_PUBLICAS.md`): lista de salas multijogador abertas com vaga, botão de
  criar sala pública e a opção "Sala pública" no lobby.

- **Rede elétrica** (31/10, `docs/REDE_ELETRICA.md`):
  - carvão como recurso (sai das minas);
  - termelétrica, eólica e solar, e a nuclear e a hidrelétrica como fontes;
  - a energia anda pelas estradas (alcance de 4 células);
  - construções militares e industriais param sem luz; moradias com luz dão aprovação;
  - começo com termelétrica, estrada e postes;
  - a IA constrói usinas, liga os prédios à malha e ataca usinas inimigas;
  - `sim-economia` com `POWER_LOG=1` mostra a rede da IA minuto a minuto (7 de 9 critérios, como antes).

- **Clima, dia e noite** (31/10, `docs/CLIMA_DIA_NOITE.md`): neve se todas as nações forem da Europa, chuva e
  tempestades conforme a região, ciclo de dia e noite de 16 min com janelas acesas. Só visual e determinístico.

- **Vida ambiente** (31/10, `docs/VIDA_AMBIENTE.md`): bandos de pássaros e gaivotas e manadas de cervos que pastam e
  fogem de tropas e explosões. Só visual.

- **Aviões mais realistas** (31/10, depois da 1.0; `docs/FASE7_FORCA_AEREA_MISSEIS_AUDIO.md`, seção "Voo dos aviões e sons
  aéreos"):
  - decolagem pela pista, curva coordenada, pós-combustor e luzes de navegação;
  - trilhas de condensação e vapor nas asas (`Ribbon`), flares e rajadas de traçantes no combate aéreo;
  - sons novos de sobrevoo do caça e do bombardeiro, do canhão do caça, do assobio e do impacto das bombas.

- **Versão 1.0** (31/10, feedback do gerente):
  - obras com o dobro do tempo (`ECONOMY.buildTime`, Centro de Pesquisa ×1,3);
  - Base Aérea 4×4 com pista de ponta a ponta;
  - as aeronaves reais aparecem estacionadas nas vagas do pátio (`AirLayer.updateParked`, `AIRBASE_SLOTS`).
  - A rede elétrica ficou registrada como o próximo grande bloco (`docs/BALANCEAMENTO_E_PROGRESSAO.md`).
  - Publicada na `claude/serene-bell-7cjnhp` como versão 1.0.0.

- **Phalanx CIWS Móvel** (30/10, conta atual; `docs/CIWS.md`): tropa nova da Era Digital (`ciws`, Fábrica, pesquisa
   Defesa de ponto). Gatling de 20 mm que derruba 40% de cada salva do Lança-Foguetes por perto e conta como defesa
   antiaérea. Modelo 8×8 fiel à foto do usuário (`buildCiws`, com casco facetado por `PartBuilder.convex`). Feixe de
   canos que gira, traçantes de interceptação (`RocketLayer.gunIntercept`) e som `gatling`. A IA usa o CIWS contra
   lança-foguetes. O guia em PDF foi regerado (30 páginas). Depois, a pedido do usuário, passou a ser o veículo
   mais caro da Era Digital (745 no total) e ganhou torre muito rápida (`turretSlew`). Depois: rajadas de 8 tiros com pausa de 2,5 s, dano 9,225 e som de
   rajada desenhado tiro a tiro.
- **Entrega de transição** (30/10): manual do jogador atualizado (`docs/GUIA_DO_JOGADOR.pdf`, 29 páginas: caravanas,
   +15% de produção por estrada, mercado interno, horário do primeiro ataque da IA por dificuldade), com as fontes em
   `docs/guia/`; este handoff; relatório `docs/RELATORIO_LOW_POLY.pdf` (fontes em `docs/relatorio_lowpoly/`) e a
   diretriz visual low poly no `CLAUDE.md`.
- **Mercado interno** no Terminal Comercial (`docs/MERCADO_INTERNO.md`, `shared/sim/market.ts`): vende comida,
   madeira, pedra, ferro e petróleo por suprimentos; o preço cai com as vendas e se recupera. A IA vende a sobra, e a
   era 3 dela passou para ~21 min no Normal.
- **Ritmo da IA por dificuldade** (`docs/DIFICULDADE_VETERANIA.md`, `docs/RECALIBRAGEM_RECURSOS.md` §5.1): primeira
   ofensiva com o que tiver na hora da dificuldade, exército mínimo, QG rumo à próxima era, impasses de cidadãos
   resolvidos, defesa nacional maior nos níveis altos. `scripts/sim-economia.ts` passou a ligar a camada nacional
   (terceiro argumento: dificuldades). A era 3 da IA continua tardia (22 a 28 min) porque os suprimentos viram o
   gargalo (resolvido depois com o mercado interno).
- **Caravanas só por estrada e IA construindo estradas** (`roadLink` em `shared/sim/caravans.ts`,
   `TacticalAI.planRoads`/`roadRoute`): sem estrada contínua até o QG a caravana fica parada; a IA pavimenta com Dijkstra.
- **Estradas em peças de asfalto** (`src/game/render/RoadLayer.ts`) e ferramenta marcar → confirmar (Construir/Enter).
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

Histórico completo de cada entrega: `git log --oneline` na branch de trabalho (seção 0.1) (um commit por pedido,
mensagens em português descrevendo o que mudou).

## 7. De onde continuar

### Próximo passo recomendado (31/10, depois da 1.1.0)

1. **Teste humano da rede elétrica e das salas públicas** (prioridade 1).
   - Ninguém jogou a 1.1 de verdade. Jogar 2 partidas (contra a IA e multijogador por sala pública) e anotar:
     - o alcance de 4 células da estrada fica claro?
     - o aviso de apagão aparece na hora certa?
     - a tela de salas atualiza?
     - o nome da sala aparece para quem entra?
   - Corrigir o que aparecer antes de qualquer conteúdo novo.
2. ~~Clareza visual da energia~~ e ~~ajuste fino~~: feitos em 31/10 (ícone ⚡ vermelho sobre prédios sem luz, área
   energizada amarela no chão ao posicionar e aviso no painel; solar na Era Digital; carvão 0,15 por ferro).
   - Ainda aberto: estrada destruída por bombardeio (hoje a estrada não é destruída) e um apagão curto de vez em
     quando na IA, quando o vento cai (some sozinho).
3. Jogar e observar se os números da energia (geração 24 da térmica, consumo dos prédios) parecem justos.
4. **Guia do jogador (PDF):** atualizar `docs/guia/` com:
   - carvão, usinas, energia pelas estradas e apagão;
   - salas públicas e nome da sala;
   - clima, dia e noite.
5. **Monetização preparada:**
   - o limite 4/6 nações já depende de `user.subscriber` no servidor;
   - falta a tela de assinatura e a gravação do status no Supabase.
6. **Depois:**
   - conteúdo naval (transporte, fragata, submarino) e os mapas Oceano Central e Arquipélago;
   - generais, espiões e Centros Regionais (direções em `docs/BALANCEAMENTO_E_PROGRESSAO.md`).

Migração `supabase/migrations/20261031000000_match_report.sql` aplicada no banco pelo usuário em 31/10 (relatório pós-partida gravado em `matches.report`).

**KAC (31/10):** falta o usuário rodar `supabase/migrations/20261101020000_kac_events.sql` no Supabase (sem ela, o
servidor só registra no log a falha ao gravar `kac_events`; o jogo segue normal) e, se quiser o painel `/kac`, criar
`KAC_ADMIN_TOKEN` no Render. Depois de publicar a 1.2.0, ler o "KAC resumo" no log do Render para fechar o KAC-04
(próximas etapas em `docs/kac/KAC_IMPLEMENTATION_ROADMAP.md`).


Não há pedido em andamento. A rede elétrica foi feita em 31/10 (`docs/REDE_ELETRICA.md`); ainda sem partida humana de teste. Pontos abertos com o usuário: (1) um áudio antigo dele não pôde ser transcrito; pergunte
se ainda importa; (2) os bonecos que pareciam estar no teto do QG (ver o item 2 da lista numerada da seção 6); (3) a IA
do Fácil chega à era 3 tão cedo quanto a do Normal (gasta pouco com exército); foi oferecido atrasar a era dela, e o
usuário ainda não respondeu. Ideias pendentes e coisas conhecidas:

- **Pendente no design:** conteúdo naval de combate (transporte com desembarque, fragata, submarino, porta-aviões) e
  depois os mapas Oceano Central e Arquipélago. Outras direções em `docs/BALANCEAMENTO_E_PROGRESSAO.md` (Tropico:
  ministros, eleições; Rise of Nations: Centros Regionais com captura, generais, espiões, caminhão logístico, recursos
  raros, teto de comércio).
- O usuário está trocando os modelos da era "Futuro Próximo" um a um a partir de fotos de referência (sempre em low
  poly). Candidatos ainda
  sem variante de era 4: infantaria, APC, tanque, forças especiais, engenheiro, explorador, aviões e
  edifícios. Siga o padrão: builder novo em `unitModels.ts`, registrar em `ERA_BUILDERS`, prévia isolada, docs em
  `docs/ERAS.md`, detalhes na camada `accent`.
- Thumbnails do menu poderiam mostrar o modelo da era atual do jogador.
- Telhados em arco (quartel) e de duas águas (armazém, casa) ficam sem painel solar na Era Digital; se o usuário
  quiser painéis neles, criar uma variante inclinada que acompanhe a água do telhado.
- Exceção conhecida do início garantido: Rios e Pontes, 5 nações, perfil agrícola, seed 3 — a mina alcança 5 de 6 células.
- Partidas humanas contra a IA para validar a sensação da economia nova ainda não foram feitas.
- **Economia tardia:** resolvida em boa parte pelo mercado interno. O QG da IA travado no nível 7 pelo requisito de
  infraestrutura foi corrigido em 31/10: o governo da IA sobe a verba de infraestrutura até o índice passar 1,02.
- Mercado interno: vende e compra (a compra desde 31/10, ver `docs/MERCADO_INTERNO.md`). A IA ainda só vende.
- Os critérios de validação que ainda falham estão na seção 3 (dois casos isolados no Normal).
- Relatório pós-partida gravado no Supabase (`matches.report`) desde 31/10; a migração
  `20261031000000_match_report.sql` já foi aplicada (31/10).

## 8. Estilo de entrega que o usuário aprovou

- Mostrar imagens (prévia renderizada) quando o pedido é visual.
- Resposta final curta, em português, em tópicos: o que mudou, como verificar, o que não foi verificado.
- Fazer o pedido inteiro sem perguntar quando dá para decidir por padrão razoável; perguntar só quando algo é realmente
  ambíguo e muda o resultado.
