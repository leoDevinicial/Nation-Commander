# Nation Commander

RTS geopolítico 3D multijogador para navegador (nome de trabalho). Esta é a **Fase 1** da
[especificação](PROJETO_RTS_GEOPOLITICO_CLAUDE.md): uma operação tática jogável, agora com servidor
autoritativo via WebSocket, contas de jogador e estatísticas no Supabase.

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
| `shared/` | Simulação tática determinística (mapa, A*, movimento, combate, economia, construção, IA), protocolo de rede e dados de países. Sem DOM, sem Three.js, sem rede — usada pelo servidor e pelos testes. |
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
| `ALLOWED_ORIGINS` | servidor | origens aceitas, separadas por vírgula (ex.: `https://seu-app.vercel.app`) |
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
| Construir (com o QG selecionado) | `B` Caserna · `N` Fábrica · `J` Extrator (sobre jazida) |
| Produzir | `I` Infantaria (Caserna) · `T` Blindado (Fábrica) · `Del` cancela o último da fila |
| Ponto de reunião | clique direito com Caserna/Fábrica selecionada |
| Grupos | `Ctrl+1…9` grava · `1…9` seleciona |
| Câmera | `WASD`/setas · botão do meio arrasta · `Q`/`E` ou Alt+botão do meio giram · roda faz zoom · `H` centraliza no QG · clique no minimapa |
| Pausa / velocidade | `Espaço` · botões 1×/2×/4× (velocidade só contra a IA) |
| Menu / chat | `F10` · `Enter` |

**Objetivo:** destruir o Quartel-General inimigo. O QG gera +3 suprimentos/s e tem um canhão de
defesa; extratores sobre jazidas geram +4/s. Construções só podem ser erguidas perto das suas
estruturas (extratores, em qualquer jazida livre). Limite de 40 unidades.

## Banco de dados

| Objeto | Conteúdo | Acesso |
| --- | --- | --- |
| `profiles` | username (único, sem diferenciar maiúsculas), nome de exibição, país preferido | leitura pública; o dono edita nome de exibição e país |
| `matches` | modo, seed do mapa, início/fim, duração, motivo do fim, vencedor, versão | leitura pública; escrita só pelo servidor |
| `match_players` | estatísticas por jogador na partida (produção, abates, perdas, estruturas, recursos, dano) | idem |
| `player_stats` (view) | agregados por jogador | leitura pública |
| `record_match(jsonb)` | grava partida + participações numa transação | apenas `service_role` |
| `username_available(text)` | checagem antes do cadastro | público |

O perfil é criado por trigger em `auth.users` usando o `username` enviado no cadastro.

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
- **Países**: perfis provisórios só de identidade da facção. Nenhum indicador é exibido nem afeta a
  partida até a integração de dados reais (Fase 2). Ver `docs/DATA_SOURCES.md`.

## Limitações conhecidas

- Sem névoa de guerra: o cliente recebe todas as unidades. A IA, porém, só reage a inimigos dentro
  da visão das suas próprias entidades.
- Snapshots completos (~1,6 kB a 10/s); compressão delta fica para quando houver mais unidades.
- Salas vivem em memória de um único processo: reiniciar o servidor encerra partidas em andamento,
  e não há escala horizontal.
- Sem áudio, tutorial ou matchmaking automático (entrada por código de sala).
- Camadas nacional, diplomática, mapa mundial, notícias e rankings ainda não existem (Fases 2+).
