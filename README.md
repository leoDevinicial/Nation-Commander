# Nation Commander

RTS geopolítico 3D multijogador para navegador (nome de trabalho). Implementa as **Fases 1 e 2** da
[especificação](PROJETO_RTS_GEOPOLITICO_CLAUDE.md): uma operação tática jogável com servidor
autoritativo via WebSocket, e uma camada nacional (economia, orçamento, opinião pública, pesquisa)
que roda dentro de cada partida a partir de dados reais de 10 países.

## Arquitetura

```
┌──────────────────────┐   WebSocket (JSON)   ┌────────────────────────────┐
│ Cliente (Vercel)     │ ───── comandos ────▶ │ Servidor de jogo (Node)    │
│ React + Three.js     │ ◀──── snapshots ──── │ ws + simulação autoritativa│
└─────────┬────────────┘     (10/s)           └─────────────┬──────────────┘
          │ login/cadastro, perfil, histórico               │ valida token, grava partidas
          ▼                                                 ▼
                  ┌──────────────────────────────────────────┐
                  │ Supabase: Auth + Postgres (RLS)          │
                  └──────────────────────────────────────────┘
```

| Pasta | Responsabilidade |
| --- | --- |
| `shared/sim/` | Simulação tática determinística (mapa, A*, movimento, combate, economia, construção, IA). Sem DOM, sem Three.js, sem rede — usada pelo servidor e pelos testes. |
| `shared/strategic/` | Simulação nacional (PIB, inflação, desemprego, orçamento, dívida, aprovação, estabilidade, pesquisa), IA de governo e leitura dos dados de referência. |
| `shared/data/reference/` | Dados reais importados do Banco Mundial (`worldbank.json`) e lideranças (`leaders.ts`). |
| `scripts/` | `import-reference-data.ts`: importação dos dados de referência. |
| `server/` | Servidor WebSocket: autenticação, salas (PvP e contra IA), laço de 20 ticks/s, validação de mensagens, reconexão, pausa/velocidade e gravação de partidas. |
| `src/` | Cliente: telas (React + Tailwind), HUD (Zustand), cena 3D (Three.js), interpolação de snapshots e entrada do jogador. |
| `supabase/migrations/` | Esquema do banco (perfis, partidas, participações, view de estatísticas, RLS). |

**Por que um servidor autoritativo?** O cliente só envia intenções (`mover`, `atacar`, `construir`…);
o servidor valida dono, alcance, custo e posição, simula e devolve o estado. Isso impede trapaça
simples, mantém os dois jogadores sincronizados e garante que as estatísticas gravadas sejam
confiáveis (só o servidor, com a chave `service_role`, pode gravar partidas).

**Por que o servidor não fica na Vercel?** Funções da Vercel não mantêm conexões WebSocket abertas.
O servidor de jogo precisa de um processo persistente: o repositório inclui `Dockerfile` e
`render.yaml` (Render), mas roda igualmente em Fly.io, Railway ou qualquer VPS com Node 22.

## Rodando localmente

Requisitos: Node 22+.

```bash
npm install
cp .env.example .env.local      # ajuste se necessário
```

Em dois terminais:

```bash
# 1) servidor de jogo (porta 8787)
SUPABASE_URL=https://vzzzfseliawtnodsysrn.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<chave service_role> \
ALLOWED_ORIGINS=http://localhost:5173 \
npm run dev:server

# 2) cliente (http://localhost:5173)
npm run dev
```

Sem a chave `service_role` dá para testar como convidado: inicie o servidor com `ALLOW_GUESTS=true`
e o cliente com `VITE_ALLOW_GUESTS=true` (no `.env.local`). Partidas de convidado não são gravadas.

### Variáveis de ambiente

| Variável | Onde | Descrição |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | cliente | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | cliente | chave pública (publishable/anon) |
| `VITE_GAME_SERVER_URL` | cliente | `wss://…/ws` do servidor de jogo |
| `VITE_ALLOW_GUESTS` | cliente | `true` mostra "jogar como convidado" |
| `PORT` | servidor | porta HTTP/WebSocket (padrão 8787) |
| `SUPABASE_URL` | servidor | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | **secreta**: valida sessões e grava partidas |
| `ALLOWED_ORIGINS` | servidor | origens aceitas, separadas por vírgula; `*` funciona como curinga (ex.: `https://seu-app.vercel.app,https://seu-app-*.vercel.app`) |
| `ALLOW_GUESTS` | servidor | aceita conexões sem conta |
| `RECONNECT_GRACE_MS` | servidor | prazo para reconectar antes de perder por abandono (padrão 60000) |

## Publicação

1. **Banco (Supabase)** — a migração em `supabase/migrations/` já foi aplicada ao projeto
   `nationscommander`. Para cadastro sem confirmação de e-mail, desative
   *Authentication → Sign In / Providers → Email → Confirm email* no painel do Supabase.
2. **Servidor de jogo (Render)** — *New → Blueprint*, aponte para este repositório; o `render.yaml`
   cria o serviço. Preencha `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys) e
   `ALLOWED_ORIGINS` com o domínio da Vercel. Teste em `https://<serviço>.onrender.com/health`.
3. **Cliente (Vercel)** — importe o repositório; o `vercel.json` já define build e saída. Configure
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_GAME_SERVER_URL=wss://<serviço>.onrender.com/ws`.

> O plano gratuito do Render hiberna após inatividade (a primeira conexão demora ~30–60 s) e
> partidas em andamento são perdidas quando o serviço reinicia ou é publicado de novo.

## Como jogar

| Ação | Controle |
| --- | --- |
| Selecionar | clique esquerdo · arrastar para seleção em área · Shift adiciona · duplo clique seleciona o mesmo tipo |
| Mover / atacar | clique direito no terreno / no inimigo |
| Avançar atacando | `F` e clique no destino |
| Parar | `X` |
| Construir (com o Centro de Comando selecionado) | `C` Fazenda · `M` Serraria · `P` Pedreira · `O` Poço de Petróleo · `B` Base Militar · `N` Fábrica de Veículos · `K` Torre de Vigilância |
| Produzir | `I` Infantaria (Base Militar) · `V` Veículo Blindado · `T` Tanque · `R` Artilharia (Fábrica) · `Del` cancela o último da fila |
| Ponto de reunião | clique direito com Caserna/Fábrica selecionada |
| Grupos | `Ctrl+1…9` grava · `1…9` seleciona |
| Câmera | `WASD`/setas · botão do meio arrasta · `Q`/`E` ou Alt+botão do meio giram · roda faz zoom · `H` centraliza no QG · clique no minimapa |
| Pausa / velocidade | `Espaço` · botões 1×/2×/4× (velocidade só contra a IA) |
| Menu / chat | `F10` · `Enter` |

| Painel nacional | `G` ou botão **🏛 Nação**: visão geral, orçamento, pesquisa, diagnóstico e dados de referência |

**Objetivo:** destruir o Centro de Comando inimigo. Limite de 40 unidades.

### Recursos (estilo Rise of Nations)

| Recurso | Fonte | Usado em |
| --- | --- | --- |
| Suprimentos | Centro de Comando (+3/s) e logística nacional (orçamento de defesa) | veículos, fábrica, serraria |
| Comida | **Fazenda** no solo fértil (marrom) | infantaria |
| Madeira | **Serraria** junto à floresta | construções |
| Pedra | **Pedreira** junto aos afloramentos rochosos | construções, artilharia, torres |
| Petróleo | **Poço** sobre jazida (manchas escuras) | veículos |

Cada edifício de coleta **reivindica** as células de recurso livres ao seu alcance (fazenda até 8
de solo fértil, serraria até 10 árvores, pedreira até 8 rochas) e rende por célula — dois edifícios
do mesmo tipo não dividem as mesmas células. Ao posicionar, o painel mostra quantas células livres
estão ao alcance e a renda resultante. Recursos não se esgotam. Construções exigem estar perto das
suas estruturas; poços podem ser erguidos em qualquer jazida livre.

### Névoa de guerra

O servidor só envia a cada jogador as unidades inimigas dentro do raio de visão das suas unidades e
edifícios; recursos do adversário ficam ocultos. Edifícios inimigos já avistados continuam
"lembrados" com o último estado conhecido até a área ser observada de novo. No mapa e no minimapa,
áreas inexploradas ficam escuras e as exploradas fora de visão, esmaecidas. A artilharia (alcance 16,
visão 9) precisa de outras unidades ou torres para enxergar seus alvos.

## Camada nacional (Fase 2)

Cada partida simula também a nação de cada jogador a partir de 01/01/2026, **1 dia de jogo por
segundo** (a 1×). Tudo depois dessa data é uma linha histórica alternativa.

- **Dados iniciais reais** (Banco Mundial e séries que ele redistribui: OIT, SIPRI, IISS, UNESCO,
  OMS): população, PIB, crescimento, inflação, desemprego, dívida, receita e despesa do governo,
  gasto militar, educação, saúde, P&D. Cada número mostra ano e fonte; lacunas aparecem como "sem
  dado confiável" e usam valores de jogo declarados. Detalhes em `docs/DATA_SOURCES.md`.
- **Orçamento** (% do PIB): receita, defesa, educação, saúde, infraestrutura, pesquisa e
  previdência/administração. Déficits viram dívida; a dívida gera juros com prêmio de risco.
- **Economia:** crescimento = tendência + impulso fiscal − carga tributária + infraestrutura (com
  acumulação) + capital humano (defasado) − dívida excessiva − instabilidade + pesquisas. Inflação
  converge para uma âncora e reage a déficits acima do de referência; desemprego segue a lei de Okun.
- **Opinião pública:** aprovação converge para um alvo formado por fatores visíveis no
  **Diagnóstico** (inflação, desemprego, serviços, impostos, crescimento, baixas e vitórias militares).
  Abaixo de 35 há risco diário de protestos, sorteado com a seed da partida e registrado com causas.
- **Pesquisa:** seis tecnologias com efeitos táticos (logística, dano, blindagem, tempo de
  construção/produção) ou econômicos. A velocidade depende do % do PIB investido.
- **Ligação com o combate:** o orçamento de defesa vira suprimentos/s no teatro de operações:
  `1,2 × log₁₀(1 + gasto de defesa anual em US$ bi)`. A regra do teatro é escolhida pelo anfitrião:
  **paridade** (todos como se tivessem PIB de US$ 1 tri: vale a parcela do PIB investida) ou
  **escala real** (vale o gasto real; grandes economias têm vantagem).
- **IA de governo:** revisa o orçamento mensalmente com regras explícitas (déficit, aprovação,
  baixas) e escolhe pesquisas — usando os mesmos comandos do jogador.
- Todos os coeficientes estão em `shared/strategic/params.ts`; são hipóteses de jogo, não
  estimativas econométricas.

Para atualizar os dados: GitHub → Actions → **Importar dados de referência** → *Run workflow*
(ou `npm run data:import` numa máquina com acesso a `api.worldbank.org`).

## Banco de dados

| Objeto | Conteúdo | Acesso |
| --- | --- | --- |
| `profiles` | username (único, sem diferenciar maiúsculas), nome de exibição, país preferido | leitura pública; o dono edita nome de exibição e país |
| `matches` | modo, regra do teatro, seed do mapa, início/fim, duração, motivo do fim, vencedor, versão | leitura pública; escrita só pelo servidor |
| `match_players` | estatísticas por jogador na partida (produção, abates, perdas, estruturas, recursos, dano) e resumo nacional (`national_summary`) | idem |
| `player_stats` (view) | agregados por jogador | leitura pública |
| `record_match(jsonb)` | grava partida + participações numa transação | apenas `service_role` |
| `username_available(text)` | checagem antes do cadastro | público |

O perfil é criado por trigger em `auth.users` usando o `username` enviado no cadastro.

## Gráficos e assets

Unidades e edifícios são modelos low-poly procedurais (`src/game/render/models/`), montados a partir
de primitivas e fundidos em poucas malhas por modelo (corpo com cores de vértice, detalhes na cor da
facção e vidros). Árvores, arbustos e rochas vêm do **Nature Kit** do
[Gobkit](https://github.com/Ariescar/gobkit-free-assets) (CC0, em `public/assets/models/nature/`); se
não carregarem, o terreno usa vegetação procedural. A névoa de guerra é aplicada no shader de todos
os materiais por posição de mundo.

## Testes e verificação

```bash
npm test          # Vitest: A*, mapa, movimento, combate, economia, construção, IA, determinismo, servidor
npm run lint
npm run build     # typecheck + build do cliente
npm run build:server
```

## Decisões e desvios em relação à especificação

- **Multijogador desde já** (decisão do projeto): a especificação previa single-player primeiro. A
  simulação continua isolada em `shared/` e roda igual no servidor e nos testes; o modo "contra a
  IA" também passa pelo servidor.
- **Save/load local substituído** por estado no servidor + reconexão automática: ao recarregar a
  página ou perder a conexão, o jogador volta à mesma partida (até 60 s; contra a IA a partida pausa
  enquanto isso). Não há saves persistentes de partidas.
- **Pausa em PvP**: qualquer jogador pode pausar/retomar; a velocidade é fixa em 1×.
- **Camada nacional dentro da partida**: a especificação previa uma campanha estratégica separada;
  aqui ela roda junto com cada operação tática e termina com ela (decisão do projeto para o
  multijogador). Não há campanha persistente entre partidas.

## Limitações conhecidas

- Snapshots completos (~1,6 kB a 10/s); compressão delta fica para quando houver mais unidades.
- Salas vivem em memória de um único processo: reiniciar o servidor encerra partidas em andamento,
  e não há escala horizontal.
- Sem áudio, tutorial ou matchmaking automático (entrada por código de sala).
- Dívida pública sem série no WDI para Argentina, Alemanha, França e Japão (usa 60% do PIB, sinalizado);
  inflação da Argentina é a de 2024 (último ano no WDI). Uma importação do FMI resolveria ambos.
- Partidas duram minutos (≈ centenas de dias simulados): efeitos de longo prazo (educação,
  infraestrutura) aparecem pouco numa partida curta.
- Diplomacia, mapa mundial, notícias e rankings ainda não existem (Fases 3+).
