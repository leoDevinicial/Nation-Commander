# Painel de números (06/11)

Página só por link direto com contas registradas, jogadores online, partidas do dia e duração média.

## Como acessar

**Provisório (06/11):** enquanto `STATS_TOKEN` não existir no Render, vale a chave `PROVISIONAL_STATS_TOKEN` de
`server/stats.ts` (pedido do responsável; os números são só agregados). Ao criar `STATS_TOKEN`, ela para de valer.

1. No servidor de jogo (cada região), defina `STATS_TOKEN` com um segredo de pelo menos 24 caracteres
   (`openssl rand -hex 24`) e reinicie. Sem ele, o endpoint não existe (404).
2. Abra `https://<site do jogo>/painel#<STATS_TOKEN>`.

- O token fica depois do `#`: o navegador não o envia ao site nem a logs; a página o manda só no cabeçalho
  `Authorization: Bearer` para o `GET /stats` de cada região (`VITE_GAME_SERVERS`).
- Sem token ou com token errado, a página mostra só "Página não encontrada." Não há link para ela no jogo, ela pede
  para não ser indexada (`X-Robots-Tag` e meta `robots`) e não conecta ao jogo nem faz login.
- Errar o token 10 vezes em 10 min bloqueia o IP por um tempo (429). Comparação em tempo constante.
- Só números agregados: nenhum nome, id ou IP sai do `/stats`. CORS só para as origens do jogo (`ALLOWED_ORIGINS`).

## O que mostra

| Número | Fonte |
|---|---|
| Contas registradas | `profiles` no Supabase (contagem) |
| Jogadores online | conexões ativas somadas de todas as regiões; quantos estão em partida e quantas partidas rodam |
| Partidas hoje | `matches` com `ended_at` desde a meia-noite de Brasília |
| Duração média hoje | média de `duration_seconds` dessas partidas; e dos últimos 7 dias |
| Contagem dos servidores | partidas encerradas hoje em cada servidor desde o último reinício, **inclusive só de convidados** (o banco só grava partidas com pelo menos uma conta registrada); o Sandbox não conta |

As consultas ao banco ficam em cache por 30 s; a página atualiza sozinha a cada 20 s.

## Código

`server/stats.ts` (`StatsGate`, `DbStatsCache`, `MatchTally`), rota em `server/index.ts`, contagem em `Room.finish`,
página `src/ui/screens/StatsPage.tsx` (escolhida em `src/main.tsx` pelo caminho `/painel`), reescrita em `vercel.json`.
Testes em `server/stats.test.ts`.

## Feedbacks e últimas partidas (07/11)

Abaixo dos números, o painel mostra duas janelas, só para quem abre com a **chave de detalhes** (ou com o `STATS_TOKEN`
de verdade, quando ele existir no Render):

- **Feedbacks:** os 50 mais recentes da tabela `feedback` (nome, convidado ou não, categoria, nota, mensagem, versão).
- **Últimas partidas:** duas abas.
  - *Servidores (todas):* as 40 últimas encerradas em cada servidor desde o reinício, inclusive só de convidados
    (`RecentMatches` em memória; o Sandbox não entra).
  - *Banco (com conta):* as 30 últimas da tabela `matches` com os jogadores de `match_players`.
  - Cada linha mostra o fim, a duração, os comandantes (país, IA, convidado, troféu para quem venceu), o modo, o mapa e o
    motivo do fim.

A rota é `GET /stats/details` (`DbDetailsCache`, cache de 30 s). Nomes e mensagens são dados de jogadores, então a chave
de detalhes não é a pública `HkL665Bn&8D` e não fica no código: só o SHA-256 dela (`PROVISIONAL_DETAILS_KEY_SHA256`); a
chave foi passada ao responsável em conversa. Ela também abre os números. Com `STATS_TOKEN` definido, só ele abre os
detalhes. A chave pública continua mostrando só os números.

## Contas com e-mail (11/11)

Pedido do responsável: ver se as contas são de jogadores de verdade ou cadastros automáticos. Só na **chave de
detalhes** (`/stats/details`); a chave pública continua só com os números.

- **Tabela "Contas registradas"** (`AccountsPanel` em `StatsPage.tsx`): e-mail, usuário, data de criação, último login,
  e-mail confirmado, partidas gravadas e feedbacks de cada conta (até 500, as mais novas primeiro), com filtro por
  texto, "só sem uso" (nenhuma partida e nenhum feedback) e os domínios de e-mail mais comuns. Sinais de cadastro
  falso: e-mail não confirmado, login "nunca", sem partidas, muitos e-mails do mesmo domínio estranho.
- **E-mail ao lado do nome** nas últimas partidas (do servidor e do banco) e nos feedbacks, para quem tem conta.
- **Código:** `DbDetailsCache` (`server/stats.ts`) lê as contas com `auth.admin.listUsers` (precisa da service role do
  Supabase no servidor, que já existe no Render), cruza com `profiles`, `match_players` e `feedback`. O id da conta
  nunca sai na resposta: as partidas da memória guardam o `uid` só para o `server/index.ts` trocar pelo e-mail.
  Teste em `server/stats.test.ts` com um Supabase falso.
