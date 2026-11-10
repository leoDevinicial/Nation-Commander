# Nation Commander — memória do projeto

RTS geopolítico 3D no navegador (three.js + React/zustand no cliente, servidor Node com a simulação em `shared/`,
Supabase para contas e histórico). O jogo é todo em português.

> **Começando numa conversa nova?** Leia primeiro [`docs/HANDOFF.md`](docs/HANDOFF.md): branch de trabalho, como rodar e
> verificar, mapa do código, o que já foi feito e de onde continuar.
>
> **Branch de trabalho atual: `claude/friendly-maxwell-ssxv7n`** (04/11, a partir de `265d772` da
> `claude/youthful-dijkstra-a45emp`; ver seção 0.1 do handoff). Commits e push só nela, sem merge nem PR sem pedido do usuário.
> **Outra conta assumindo?** Siga a seção "00. Checklist de chegada" do handoff: a branch nova parte da
> `claude/friendly-maxwell-ssxv7n` (a mais nova), nunca de uma branch antiga.
> **Publicar** (só quando o usuário disser "publica"): fast-forward da `claude/serene-bell-7cjnhp` até a branch de
> trabalho, seção 0.0 do handoff.

## Regras de trabalho
- Responder em português.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no cliente nem em commits.
- Não abrir pull request sem pedido explícito.
- Antes de entregar: `npm test`, `npm run lint`, `npm run typecheck`. Nunca rodar o prettier no arquivo inteiro
  (`src/game/GameRuntime.ts` vira milhares de linhas de diff); formatar só o trecho alterado.

## Diretriz visual (low poly) — vale para todo trabalho gráfico
O Nation Commander é **low poly estilizado**, por decisão do responsável pelo projeto. Fundamentos e exemplos em
[`docs/RELATORIO_LOW_POLY.pdf`](docs/RELATORIO_LOW_POLY.pdf) (fontes em `docs/relatorio_lowpoly/`).
- Formas facetadas, cores chapadas por camada (`body`, `accent` = cor da nação, `glass`), silhueta forte. Nada de
  realismo fotográfico, texturas fotográficas ou mapas PBR.
- Leitura antes de detalhe: todo modelo precisa ser reconhecível de longe, na câmera normal do RTS, pela silhueta e pela
  cor da nação.
- Coerência: mesmo kit (`src/game/render/models/kit.ts`), mesma paleta por era, mesma luz. Não misturar estilos.
- Visual próprio: fotos do mundo real servem de referência de forma e proporção; a aparência de outros jogos não é
  copiada nem transposta.
- Orçamento: até ~6 mil triângulos por tropa ou prédio (hoje 700–6.200); o jogo precisa seguir rodando no navegador e
  no celular.
- Modelos gerados por código em `src/game/render/models/`. Arquivo externo só com licença livre (CC0) e no mesmo estilo.
- Pedidos para "melhorar o gráfico" viram polimento dentro da estética: luz, efeitos, animação, legibilidade, variantes
  de era, biomas e interface.

## Identidade da interface ("Sala de Situação", aprovada em 05/11)
Painéis de console sobre o mapa: moldura `<Frame>` (canto chanfrado + colchetes de latão), grafite translúcido, latão só
para comando, cor da nação como faixa, fontes Barlow Condensed / Barlow Semi Condensed / JetBrains Mono embutidas e
ícones Lucide (sem emojis). Cada recurso tem cor fixa (`RESOURCE_STYLE`). Maquete, regras e andamento em
`docs/ui_maquete/README.md`; cartão de construção mostra o saldo líquido por dia (verde rende, vermelho custa).

## Onde está cada coisa
- `shared/sim/` — simulação tática determinística (config, IA, combate, comércio, melhorias). `shared/strategic/` —
  camada nacional (economia, orçamento, diplomacia).
- `src/game/` — runtime 3D (`GameRuntime.ts`), modelos, áudio sintetizado (`audio/AudioService.ts`) e qualidade
  adaptativa (`perf/`: KGPS e KAICS, ver `docs/KGPS_KAICS.md` e `docs/KAICS_ADAPTABLES_PLUS.md`).
- `docs/` — uma página por fase ou sistema já feito; `docs/AUDITORIA_ADENDO.md` diz o estado de cada fase.
- Custos: os valores-base ficam nas definições (`UNITS`, `BUILDINGS`, `AIRCRAFT`...), mas o bloco `ECONOMY` no fim de
  `shared/sim/config.ts` (e em `air.ts`) os multiplica ao carregar. O valor que o jogo usa é o escalado; ver
  `docs/ECONOMIA.md`. Testes de regra usam `TEST_START` (`shared/test/helpers.ts`) como estoque inicial.
- Custo crescente: construir usa `buildingCost(type, existentes)` (+18% por edifício do tipo), não `BUILDINGS[t].cost`,
  e paga uma taxa de obra em US$ que também cresce (`buildingUsd`, do 2º edifício do tipo em diante; `docs/PESQUEIRO_E_CUSTO_CRESCENTE.md`).
  Ao mexer em economia ou na IA, rodar `npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 25` e conferir os critérios de
  `docs/RECALIBRAGEM_RECURSOS.md` (seção 5).
- Rede elétrica (`shared/sim/power.ts`, `docs/REDE_ELETRICA.md`): carvão é recurso (sai das minas); a energia anda
  pelas estradas (alcance de 4 células); quartel, fábrica, pesquisa e militares param sem luz. Testes de regra antigos
  rodam sem a rede (`shared/test/setup.ts`); ao mexer na IA ou na energia, rodar
  `POWER_LOG=1 npx tsx scripts/sim-economia.ts 2,5,6 25`.
- KAC — Kaiser Anti Cheat (`server/kac/`, `docs/kac/`): o cliente só pede, o servidor decide. Qualquer comando ou
  mensagem nova passa por validação no servidor e confere o dono pela conexão, nunca pelo payload. Riscos abertos em
  `docs/kac/KAC_THREAT_MODEL.md`; ataques reproduzidos em `server/kac.test.ts`. O snapshot nunca cita o que o jogador
  não vê (nem id de alvo, nem base de voo). Os ids são embaralhados por partida (KAC-06): nunca ordenar por id para
  dizer "mais antigo"; usar a ordem de `Simulation.entities`. Nenhuma punição automática: ver `docs/kac/KAC_ENFORCEMENT_POLICY.md`.
- Painel de números (`docs/PAINEL_DE_NUMEROS.md`): `/painel#<STATS_TOKEN>` no site chama `GET /stats` de cada região
  (Bearer, só agregados): contas, online, partidas do dia e duração média. `GET /stats/details` (feedbacks e últimas
  partidas com os comandantes) só abre com a chave de detalhes, guardada no código só pelo hash.
- KNPS — Kaiser Network Performance System (`server/knps/`, `src/net/netStats.ts`, `docs/knps/`): compressão do
  WebSocket, fila de saída limitada (só snapshot é descartável), snapshot extra no tick da ordem e painel de conexão.
  Várias regiões (KNPS-08): `KNPS_REGION*` no servidor e `VITE_GAME_SERVERS` no cliente; a letra da região abre o
  código da sala. Nada do KNPS muda regra ou velocidade para um jogador. Medir com `npx tsx scripts/knps-baseline.ts`.
- Construtores (`BUILDERS`, `docs/CONSTRUTORES.md`): toda obra usa até 4 cidadãos (25% da velocidade cada; sem nenhum,
  para). Testes de regra antigos rodam sem eles (`shared/test/setup.ts`), como a rede elétrica.
- Caixa do país (`shared/strategic/treasury.ts`, `docs/CAIXA_DO_PAIS.md`): o antigo "verba de obras" (`works.fundUsd`)
  recebe repasse, produção e comércio e paga exército, energia, prédios, estradas e serviços todo dia; sem teto.
  Não existe dívida pública (02/11): guerra, contato, ajuda e operações saem do caixa em dias de repasse (`CAIXA_DAYS`).
- Comércio (`shared/sim/trade.ts`, `docs/COMERCIO.md`): anúncios entre as nações da partida (venda simples ou contrato),
  rota por rodovia/estrada, porto ou aeroporto, cargas atacáveis por quem está em guerra com uma das partes e pagamento
  só na chegada; mercado mundial de reserva. Rodovia (`HIGHWAY`): sai da fronteira sem engenheiro, só pela terra
  neutra (nunca no território de outra nação), não leva energia e acelera cargas, caravanas e tropas. Estradas e
  rodovias inimigas são alvo militar só por ordem do jogador (`attack_road`).
- Cidades e conhecimento (`shared/sim/cities.ts`, `KNOWLEDGE`, `docs/CONHECIMENTO_E_CIDADES.md`): cada construção pertence
  ao QG ou prefeitura mais próxima; `perCity` limita escola, universidade e as produções da era 3. Pesquisas custam
  US$ + conhecimento.
- Zoneamento (`shared/sim/zoning.ts`, `docs/ZONEAMENTO.md`): zonas R/C/I junto às estradas; lotes privados não são
  entidades (ocupam a grade com `LOT_OCCUPANT`), crescem pela demanda de cada cidade, pagam imposto e gastam energia.
- Clima e dia/noite (`shared/sim/climate.ts`, `docs/CLIMA_DIA_NOITE.md`) são só visuais, exceto a usina solar.
- Marinha (`docs/PARTIDAS_MAIORES_E_MAPAS.md`): L402, fragata, cargueiro, submarinos, porta-aviões e pesqueiro saem do Porto
  (o pesqueiro é civil e automático: pesca e traz comida, até 3 por porto; `FISHING`),
  só andam na água (`Grid.naval`), têm tripulação (`crew`), pesquisa nacional (`requiresTech`) e carga por classe
  (`cargo`). Quem atinge quem fica em `shared/sim/targeting.ts` (submarino só por submarino). A carga sai do mapa e
  só o dono a vê no snapshot. Mísseis têm alcance por lançador e miram qualquer ponto fora da própria fronteira que o país já tenha explorado (`Simulation.explored`).
  No Arquipélago não há pontes: o contato é por navio e avião (C-5 com paraquedistas).
- Diplomacia no mapa (`docs/DIPLOMACIA_NO_TEATRO.md`): contato entre nações do mapa só depois do encontro (`nations_met`;
  sem ele, nada de guerra, pacto ou comércio); modo time (aliança fixa, vitória do time; `Simulation.teams`/`winners`);
  sem times, pactos de não agressão e alianças entre quem está no mapa (`PACT`, `pactHooks`, convites `PactOffer` para humanos,
  bots avaliam na hora), custo ao firmar e indenização ao romper; aliados têm visão compartilhada, `aid_ally` e `trade_gift`
  (frete por caminhão, navio ou avião). Depois de uma eliminação, se só sobram pactuados, os pactos caem e a guerra volta.
- Alertas e HUD (`docs/ALERTAS_E_HUD.md`): evento `world` (guerra, era, nuclear, Grande Projeto) vai a todos, sem
  posição; sob ataque toca sirene e pulsa no minimapa; botão Construir (B) e comando `demolish` (nunca QG/prefeitura).
- Combustível (`FUEL`, `docs/COMBUSTIVEL_E_CORRECOES.md`): veículos e navios gastam petróleo ao andar (o Combustível da
  Refinaria sai primeiro); sem nenhum, andam a 50%. Testes de regra antigos rodam sem ele (`shared/test/setup.ts`).
- Efeitos gravados (`public/sfx/`, `assets/sfx/CATALOGO.md`, `SAMPLES` e `LEVELS` no `AudioService`): quase todo o
  combate toca gravações (sem o arquivo, cai no sintetizado), mais guerra ao longe (`warAt`), energia desligando
  (`powerDown`), sirenes (aviso de ataque e silo armado), vento ambiente, chuva, vento de neve e o trabalho dos prédios
  (`PRODUCTION_SFX`) em loop e o ronco da salva (`rocketSalvo`).
  Lote novo: guardar e catalogar, recortar em `scripts/sfx-preparar.py`, ligar no `SAMPLES` e calibrar o ganho contra o
  sintetizado; o que ainda falta gravar está no fim do catálogo.
- Trilha sonora (`public/music/`, `docs/TRILHA_SONORA.md`): 4 faixas trocadas por estado de ameaça (`threat.ts`) com crossfade de
  3–5 s no `AudioService`; a guerra fica acima da música (EQ por estado e ducking só em eventos grandes); tecla M silencia só a música.
- Idiomas (`src/i18n/`, `docs/IDIOMAS.md`): o código segue em português; `en.ts`/`es.ts` traduzem o texto da tela
  (escolha no menu, ou região pelo IP via `api/geo.js` da Vercel). Texto novo na interface: acrescente a tradução nos dois
  dicionários; `npx tsx scripts/i18n-faltando.ts` lista o que falta. Chat e nomes de jogadores ficam com `translate="no"`.
- Tutorial (`docs/TUTORIAL.md`): modo de sala `tutorial` (sem lobby, 3 nações, IA parada); roteiro em `shared/tutorial/script.ts`,
  diretor no servidor (`server/tutorial/Director.ts`) e painel/destaque no cliente (`TutorialOverlay`, âncoras `data-tour`).
  Botão novo citado no roteiro precisa de `data-tour`; texto novo do roteiro vai nos dicionários en/es e na narração
  (`scripts/narracao-preparar.py`).
- Escala (`docs/ESCALA_DA_SIMULACAO.md`): busca de alvo e separação das unidades usam a grade espacial
  (`shared/sim/spatial.ts`) com resultado idêntico à busca completa; ao mexer em combate ou movimento, rodar
  `npx tsx scripts/sim-escala.ts hash` antes e depois (só muda se a regra mudou) e `bench` para o custo do tick.
- Minas terrestres (`shared/sim/mines.ts`) não são entidades: o snapshot envia só as do dono e as já detectadas
  (`MineSystem.visibleTo`). O satélite do Programa Espacial revela o resto do mapa, mas nunca as minas.

## Próximas direções de design
Documento completo: [`docs/BALANCEAMENTO_E_PROGRESSAO.md`](docs/BALANCEAMENTO_E_PROGRESSAO.md). Consultar antes de mexer
em balanceamento, IA, progressão, mapas ou modos de partida. A seção "Estado da implementação" no fim dele diz o que
já foi feito; atualizar a tabela a cada entrega. Resumo do que já foi decidido em conversa:

- **Balanceamento rápido:** blindagem por classe (fuzil com `vsVehicle` baixo), Lança-Foguetes muito mais forte que
  hoje, contra-bateria e defesa proporcional da IA, níveis de dificuldade (Fácil / Normal / Difícil / Brutal),
  assédio leve durante o preparo, curva do orçamento de defesa mais sensível.
- **Eras como eixo da progressão:** Guerra Fria → Pós-Guerra Fria → Era Digital → Futuro Próximo. Avançar é uma
  pesquisa nacional cara com nível mínimo de QG; cada era troca a aparência de todas as construções e libera tropas,
  veículos e construções aos poucos (tabela na seção 3.1 do documento).
- **Tropico 5/6:** facções com exigências, pedidos das superpotências, decretos, cadeias produtivas (refinaria,
  siderúrgica), serviços com raio de cobertura, ministros, eleições.
- **Rise of Nations:** Centros Regionais com captura e assimilação, fortes e influência de fronteira, teto de
  produção, recursos raros, caravanas, generais, espiões, caminhão logístico, bônus únicos por país, Grandes Projetos
  Nacionais e vitórias alternativas.
- **Programa Espacial (megaconstrução de fim de partida):** a mais cara do jogo; exige era Futuro Próximo e QG 9+.
  Lançamento com animação do foguete; o satélite tira a névoa de guerra do dono (mapa inteiro em tempo real, menos
  minas) e aparece orbitando o globo com a bandeira.
- **Lançamento nuclear:** choque econômico global temporário para todas as nações, inclusive quem lançou.
- **Estradas do jogador** (arrasto na grade, custo em pedra + orçamento de infraestrutura; tropas e comboios ganham
  velocidade) e **Engenheiro de Combate** (minas antitanque, detecção e remoção, estradas fora do território,
  fortificações). Minas são invisíveis ao inimigo e ao satélite.
- **Partidas maiores:** até 4 nações na versão grátis e até 6 para assinantes (humanos + bots); mapas de 96×96 a
  160×160 conforme o número de nações, com gerador por simetria em N partes.
- **Tipos de mapa:** Continental, Rios e Pontes, Montanhoso, Deserto, Oceano Central e Arquipélago (os dois oceânicos
  existem desde 03/11; no Arquipélago não há pontes: navio de transporte e avião). O tipo de mapa é escolhido pelo anfitrião ou sorteado; a geografia real do país
  só influencia a região inicial de cada nação, com compensações declaradas.
