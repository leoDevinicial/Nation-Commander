# Comunidade e Feedback (menu)

> Depois do pedido de 31/10 a área virou dois botões no menu: **🗨 Comunidade** (chat aberto entre os jogadores,
> `CommunityScreen`) e **💬 Feedback** (o formulário descrito abaixo, `FeedbackScreen`).

## Comunidade (chat)

- **Canal:** um canal só, para todos os jogadores conectados que abrem a tela.
  - Quem entra recebe as últimas 80 mensagens e o número de pessoas no chat.
  - As mensagens novas chegam na hora.
- **Limites:** até 300 caracteres por mensagem, uma a cada 1,5 s e no máximo 12 por minuto por jogador.
- **Convidados:** aparecem com a etiqueta "convidado".
- **Servidor** (`server/communityChat.ts`):
  - mensagens `community_join`, `community_leave` e `community_say`;
  - respostas `community_history`, `community_msg` e `community_online`.
- **Histórico:** fica na memória do servidor e some quando ele é atualizado ou reiniciado. Guardar no Supabase e criar
  moderação (denunciar, silenciar) ficam para depois.
- **Testes:** `server/room.test.ts`, bloco "chat da comunidade".


Pedido do usuário (31/10): uma área de comunidade e feedback do Nation Commander no menu.

## O que tem

- **Menu → "💬 Feedback"** abre a tela `FeedbackScreen`.
- **Envie seu feedback:**
  - tipo: Problema, Sugestão, Balanceamento, Elogio ou Outro;
  - mensagem de 5 a 2.000 caracteres, com uma dica de preenchimento para cada tipo;
  - nota opcional de 1 a 5 estrelas;
  - vai junto o nome do comandante e a versão do jogo;
  - limite: um envio por minuto por jogador.
- **Comunidade:**
  - atalho para as Salas Públicas;
  - links oficiais (Discord, Instagram, YouTube), que só aparecem se as variáveis `VITE_COMMUNITY_DISCORD_URL`,
    `VITE_COMMUNITY_INSTAGRAM_URL` e `VITE_COMMUNITY_YOUTUBE_URL` estiverem definidas no deploy do cliente (Vercel).
    Sem elas, aparece um aviso de que os canais chegam em breve.
- **Novidades:** a lista do que mudou em cada versão (`src/ui/changelog.ts`, editar a cada versão).

## Onde o feedback fica

- **Fluxo:**
  - o cliente manda `{ t: 'feedback', category, message, rating? }`;
  - o servidor valida (`server/messages.ts`), aplica o limite e grava com `saveFeedback` (`server/supabase.ts`);
  - o servidor responde `feedback_ok`, ou um erro com `code: 'feedback'`.
- **Tabela `public.feedback`:** migração `supabase/migrations/20261101000000_feedback.sql`.
  - Sem políticas de RLS: só o servidor grava, e a equipe lê no painel do Supabase.
  - Convidados gravam com `guest = true` e `user_id` nulo.
- **Servidor sem Supabase** (desenvolvimento): o feedback fica só no log do servidor.
- **Testes:** `server/room.test.ts`, bloco "comunidade e feedback".

Migração aplicada no Supabase pelo usuário em 31/10; área publicada.
