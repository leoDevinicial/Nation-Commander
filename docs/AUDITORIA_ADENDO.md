# Auditoria de implementação — Adendo v2

Data da auditoria: 25/10/2026, commit base `2087d2f`, branch `claude/serene-bell-7cjnhp`.

Este documento responde à **Fase 0** do `Adendo_Global_RTS_Atualizado_v2.md`. Ele registra o estado real do repositório, o
que pode ser estendido sem reescrita, os contratos entre sistemas e o plano das fases seguintes. O documento principal
(`PROJETO_RTS_GEOPOLITICO_CLAUDE.md`) continua sendo a especificação de referência.

Legenda: **implementada** · **parcial** · **ausente** · **bloqueada** (depende de outra fase).

## 1. Como o projeto está hoje

| Área | O que existe | Onde |
|---|---|---|
| Cliente | Vite 8 + React 19 + TypeScript 6 + Three.js 0.186 + Tailwind 4 + Zustand 5 | `src/` |
| Servidor | Node 22 + `ws`. **Servidor autoritativo**: só ele simula; os clientes enviam intenções | `server/` |
| Simulação tática | Determinística, 20 ticks/s, passo fixo, A* em grade 64×64, IA tática | `shared/sim/` |
| Camada nacional | 1 dia de jogo por segundo, economia, orçamento, dívida, aprovação, pesquisa, diplomacia com 8 governos de IA | `shared/strategic/` |
| Dados reais | Banco Mundial (WDI) e FMI (WEO), importados por GitHub Actions; fonte, ano e série de cada valor | `shared/data/reference/`, `docs/DATA_SOURCES.md` |
| Persistência | Supabase: contas sem confirmação de e-mail, perfis, partidas e estatísticas (RLS + RPC restrita ao servidor) | `supabase/migrations/` |
| Testes | 64 testes (Vitest) de simulação, pathfinding, mapa, camada nacional, diplomacia, sala e origens | `shared/test/`, `server/*.test.ts` |
| Deploy | Cliente na Vercel, servidor no Render (Docker) | `vercel.json`, `render.yaml`, `Dockerfile` |

Scripts validados nesta auditoria: `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run build:server`.
Nenhum problema impedia validar as fases seguintes.

## 2. Classificação das funcionalidades do adendo

### Fase 1 — Identidade visual, menu, HUD e responsividade
| Item | Antes desta entrega | Observação |
|---|---|---|
| Título "Modern Geopolitical Real Strategy 3d Game" | ausente | o menu mostrava "Nation Commander" |
| Globo 3D no fundo do menu | ausente | fundo era uma grade estática |
| Tokens visuais (cores, metal, estados diplomáticos, durações) | parcial | havia cores básicas em `@theme`, sem metal/estados |
| Botões metálicos com estados hover/pressed/focus | parcial | havia hover e focus; sem pressed nem acabamento |
| Capitalização dos rótulos | parcial | mistura de "Nova partida" e "Criar sala multijogador" |
| HUD com tooltips de custo e tempo | implementada | custos, tempo, vida, dano e alcance já apareciam |
| Interface responsiva (celular/tablet) | ausente | barra superior cortava, painéis com largura fixa |
| Controles de toque | ausente | seleção e ordens dependiam de mouse e botão direito |
| Presets gráficos | parcial | só "Alta" e "Desempenho" |
| Pausar efeitos em segundo plano | parcial | `requestAnimationFrame` já para com a aba oculta |

### Fase 2 — Globo, descoberta e declaração de guerra
| Item | Estado | Observação |
|---|---|---|
| Globo com fronteiras e seleção de países | ausente | a Fase 1 entrega o globo do menu com camadas separadas, reaproveitável aqui |
| País existente / descoberto / informação conhecida | ausente | hoje toda a lista de países é visível no painel de diplomacia |
| Bloqueio de ataque a país não descoberto | ausente | os combates acontecem só no teatro contra o adversário da sala |
| Declaração de guerra com custo | ausente | o adversário da sala está em guerra desde o início, implicitamente |

### Fase 3 — População, armazenamento e geologia
| Item | Estado | Observação |
|---|---|---|
| População, força de trabalho e efetivo | ausente | existe só o limite de 40 unidades militares |
| Limite de 200 / casas / prédio residencial | ausente | |
| Tanque de petróleo, armazém, silos | ausente | estoques são números sem capacidade |
| Limite de instalações por depósito | parcial | cada célula de recurso é reivindicada por uma única construção do mesmo tipo; não há classe pequena/média/grande |
| Esgotamento de depósitos | ausente | depósitos são infinitos |
| Montanhas/formações rochosas | parcial | terreno `Rock` gerado e explorado por pedreiras; sem minério |

### Fase 4 — Upgrades de construções
Ausente na auditoria: construções tinham um único nível. Implementada depois — veja `docs/FASE4_MELHORIAS.md`.

### Fase 5 — Pesquisa e modernização
Ausente/parcial na auditoria: 6 tecnologias sem pré-requisitos, com efeito global em todas as unidades ao concluir.
Implementada depois — veja `docs/FASE5_PESQUISA_MODERNIZACAO.md`.

### Fase 6 — Comércio e logística
Parcial na auditoria (acordos comerciais só afetavam o crescimento). Implementada depois — veja
`docs/FASE6_COMERCIO_LOGISTICA.md`.

### Fase 7 — Força aérea, mísseis e áudio
Ausente na auditoria (o jogo não tinha som). Implementada depois — veja `docs/FASE7_FORCA_AEREA_MISSEIS_AUDIO.md`.

### Fase 8 — Transição globo → mapa operacional → batalha
Ausente na auditoria (um único mapa tático por partida). Implementada depois — veja `docs/FASE8_TRANSICAO_OPERACOES.md`.

### Fase 8A — Água e petróleo
| Item | Estado | Observação |
|---|---|---|
| Água animada | parcial | superfície com material próprio, sem animação de ondas |
| Petróleo | parcial | poças escuras marcam as jazidas. **Contraria o adendo** (jazida não deve parecer lago). Corrigir na 8A |

### Fase 9 — Noticiário com cadeias causais
Parcial na auditoria (eventos sem identificador, causa nem efeito registrados). Implementada depois — veja
`docs/FASE9_NOTICIARIO.md`.

### Fase 10 — Mais nações
Parcial na auditoria (10 países). Lote 2 levou a 21; o lote 3 (Nigéria, Indonésia, Irã, Polônia, Colômbia e
Paquistão) levou a 27 — veja `docs/FASE10_NACOES.md`.

### Fase 11 — Multiplayer (auditoria resumida; a completa fica para a fase 11)
| Item | Estado | Observação |
|---|---|---|
| Arquitetura | ok | servidor próprio Node + WebSocket no Render; protocolo JSON versionado (`PROTOCOL_VERSION`) |
| Quem decide os resultados | ok | o servidor valida todos os comandos (`parseCommand` + regras da simulação) e envia snapshots filtrados pela névoa de guerra |
| Salas privadas com senha | ausente | as salas são acessadas por código de 5 caracteres; não há senha |
| Lista pública de salas | ausente | **o adendo supõe que ela existe; não existe**. Entra-se só pelo código |
| Reconexão | ok | 60 s de tolerância; o estado volta do servidor |
| Dificuldade dos bots | ausente | há um único nível de IA |
| Save/load | ausente | não há salvamento; os critérios de "salvar/carregar" do adendo dependem de criá-lo (fase 12 ou antes) |

## 3. Sistemas a estender (sem substituir)

- **Simulação nacional** (`NationalSimulation`, `Diplomacy`) — recebe descoberta, guerra formal, comércio por contratos e população agregada.
- **Economia tática** (`Simulation`, `gathering.ts`, `placement.ts`) — recebe armazenamento, depósitos finitos e trabalhadores.
- **Globo** (`src/globe/`, criado na Fase 1) — vira o ponto de entrada da camada geopolítica na Fase 2 sem trocar de motor.
- **Protocolo** (`shared/protocol.ts`) — versionado; cada fase que mudar mensagens incrementa `PROTOCOL_VERSION`.

## 4. Contratos entre sistemas

- **Simulação → interface.** Somente via snapshots (táticos, 10/s) e `national` (diário). A interface não muda estado, só envia
  `ClientMessage`. Fonte única da verdade: o servidor.
- **Interface → simulação.** Intenções tipadas (`Command`, `NationalCommand`), validadas no servidor com motivo de recusa
  explícito (`cmd_rejected`).
- **Renderização.** `GameRuntime` e `GlobeView` leem estado e nunca são lidos pela simulação. Os presets gráficos
  (`src/lib/graphics.ts`) só mudam custo de renderização.
- **Livro de eventos (a implementar, primeiro produtor: declaração de guerra na Fase 2).** Cada registro terá:
  `id` (sequencial por partida), `day`/`tick`, `category` (militar, econômico, social, diplomático), `source` (sistema
  que gerou), `actors` (países/entidades), `causes` (ids de eventos anteriores), `effects` (mudanças aplicadas, com valor),
  `certainty` (`fato` | `estimativa`). O noticiário (Fase 9) só poderá ler esse livro.
- **Áudio (Fase 7).** Serviço central que assina eventos e seleção; nunca toca por conta própria.

## 5. Ordem das próximas fases e critérios de aceite

As dependências seguem a tabela da seção 4 do adendo. Resumo dos critérios mínimos de cada fase:

| Fase | Depende de | Aceite mínimo |
|---|---|---|
| 2 | 1 (globo), diplomacia | país não descoberto não é alvo; ataque sem guerra é recusado; custo da declaração cobrado uma vez; testes para IA |
| 3 | economia tática | população ≤ 200; casa +10, prédio +20, centro de comando 20; estoques limitados por armazém/silo/tanque; depósitos esgotáveis |
| 4 | 3 | uma classe com vários níveis, custo, requisito e efeito visual |
| 5 | 3, 4 | pré-requisitos; modernização por unidade com custo |
| 6 | 2, 3 | contrato → reserva → transporte → entrega; rota bloqueada atrasa |
| 7 | 5, 6 | base aérea, missão contra tanque, mísseis com inventário; áudio central |
| 8 / 8A | 2, 7 | transição globo → batalha sem duplicar estado; água/petróleo nos três presets |
| 9 | livro de eventos | toda notícia aponta para eventos |
| 10 | pipeline de dados | novo lote com o mesmo esquema e metadados |
| 11 | 2–7 | senha/lista de salas, dificuldade de bots, testes de rede |
| 12 | todas | ciclo completo, desempenho e save/load |

## 6. Entregas

| Fase | Situação | Documento |
|---|---|---|
| 1 — Visual, menu, HUD e mobile | implementada (pendente: validação em aparelhos físicos) | `docs/FASE1_VISUAL_MOBILE.md` |
| 2 — Globo, contato e guerra formal | implementada para os países do teatro; guerra contra governos fora do teatro e paz ficam para fases posteriores (identificado no jogo) | `docs/FASE2_GLOBO_GUERRA.md` |
| 3 — População, armazenamento, geologia + fronteiras | implementada; save/load, mercados/portos/bases aéreas e alianças entre jogadores pendentes | `docs/FASE3_POPULACAO_FRONTEIRAS.md` |
| 4 — Melhorias de construções | implementada: 14 classes com até 10 níveis, custo em recursos e no fundo nacional de obras, requisitos, especializações exclusivas, evolução visual modular com LOD e serialização testada; pendentes modelos GLB finais, save/load acessível ao jogador (Fase 12) e mercados (Fase 6) | `docs/FASE4_MELHORIAS.md` |
| 5 — Pesquisa e modernização | implementada: 13 tecnologias em 4 categorias, com pré-requisitos, duração mínima e investimento em US$ registrado; 6 pacotes de modernização por unidade (instalação, baias, materiais, verba, indisponibilidade), padrão de produção com sobrecusto, equipamento visível e origem de cada bônus; persistência de equipamento e pesquisa testada; salvamento completo para o jogador na Fase 12 | `docs/FASE5_PESQUISA_MODERNIZACAO.md` |
| 6 — Comércio internacional e logística | implementada: terminal, porto e estação; ofertas, contrapropostas e contratos rastreáveis; reserva, lotes, quatro modais com rota, frete e riscos; entrega só com capacidade; interrupções por guerra, sanções, rota e depósito; veículos no mapa e inspeção de rota; persistência testada | `docs/FASE6_COMERCIO_LOGISTICA.md` |
| 7 — Força aérea, mísseis e áudio | implementada: base aérea (hangar, piloto, combustível, manutenção, terminal aéreo), antiaérea e silo; caça, reconhecimento e cargueiro; missões só contra alvos descobertos, em guerra e no alcance, com resultado registrado; perda de petróleo exata nos tanques; mísseis com inventário e estados preparar → armado → autorizado → voo → impacto/interceptado, confirmação por pressão longa; notícia e reputação; serviço de áudio procedural com canais, posição, limite de vozes e produção só do edifício selecionado; persistência testada. Pendentes: guerra aérea contra governos fora do teatro e escolta/combate aéreo direto | `docs/FASE7_FORCA_AEREA_MISSEIS_AUDIO.md` |
| 8 — Transição globo → mapa operacional → batalha | implementada: guerra contra governos da IA; regiões por país (bioma, relevo, infraestrutura); operações com as unidades reais do teatro (associação persistente, sem duplicar), viagem, custos e batalha local numa segunda simulação com mapa do bioma; reconciliação única (perdas, munição, guarnição, ocupação, PIB, reputação, notícia) e volta; segunda cena 3D sem recarregar, aproximação do globo, carregamento e esmaecimento com modo reduzido; testes de regras e de rede. Pendentes: contraofensivas e capitulação dos governos da IA | `docs/FASE8_TRANSICAO_OPERACOES.md` |

O livro de eventos começou na Fase 2: todos os eventos diplomáticos têm `id` sequencial e `causes`
quando são consequência de outro (guerra → tratados rompidos e sanções; tratado → descoberta).
