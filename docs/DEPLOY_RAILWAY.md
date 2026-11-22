# Servidor de jogo no Railway (22/11)

Troca do Render (plano free: fração de CPU e hibernação; a partida longa rodava a 1/3 da velocidade) pelo Railway,
plano Hobby (US$ 5/mês com US$ 5 de uso incluídos; cobrança por segundo de CPU e memória usados). Estimativa com 30
partidas de 50 min por dia: US$ 5 a 9/mês (conta na conversa de 22/11).

O servidor usa o `Dockerfile` da raiz; `railway.json` liga a verificação de saúde (`/health`) e só refaz o deploy quando
muda código do servidor (`server/`, `shared/`, dependências): mudança só no site não reinicia partidas.

## Passo a passo

1. **Conta:** railway.com → entrar com o GitHub → plano **Hobby**. Em *Account → Usage*, definir um **limite de gasto**
   (ex.: US$ 10).
2. **Projeto:** *New Project → Deploy from GitHub repo* → o repositório do jogo → branch de publicação. O Railway acha
   o `Dockerfile` e o `railway.json` sozinho.
3. **Região:** no serviço, *Settings → Region* → **US East** (perto do Supabase, `us-east-1`).
4. **Variáveis** (*Variables*): copiar as do Render (aba *Environment*), no mínimo:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (só aqui, nunca no site)
   - `ALLOWED_ORIGINS`: os domínios do site separados por vírgula (Vercel nova, Vercel antiga se for usar este servidor
     com ela, e `https://html-classic.itch.zone` quando o jogo for para o itch.io)
   - `ALLOW_GUESTS=true` (convidados)
   - os opcionais que existirem no Render: `STATS_TOKEN`, `KAC_ADMIN_TOKEN`, `COMMUNITY_MODERATORS`, `KNPS_REGION*`
   - **não** definir `PORT`: o Railway define sozinho e o servidor lê.
5. **Endereço:** *Settings → Networking → Generate Domain* → algo como `nations-server.up.railway.app`.
   Conferir `https://<domínio>/health` no navegador.
6. **Site (Vercel):** `VITE_GAME_SERVER_URL=wss://<domínio>/ws` e um novo deploy.
7. **Supabase:** *Authentication → URL Configuration*: acrescentar o domínio novo do site (confirmação de cadastro).

## Depois

- Logs e uso: painel do serviço (*Deployments*, *Metrics*). O `/health` mostra salas e partidas.
- Partidas em andamento são gravadas no Supabase a cada 30 s e no desligamento (cada deploy): voltam sozinhas.
- O Render pode ficar ligado em paralelo até a troca ser confirmada; depois, desligar para não haver dois servidores.
