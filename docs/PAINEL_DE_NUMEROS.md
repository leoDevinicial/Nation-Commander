# Painel de números (06/11)

Página só por link direto com contas registradas, jogadores online, partidas do dia e duração média.

## Como acessar

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
