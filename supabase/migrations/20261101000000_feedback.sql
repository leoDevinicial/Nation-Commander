-- Comunidade e feedback (menu): o jogador envia um feedback pelo jogo; o servidor grava aqui com a chave de serviço.
-- Sem políticas de RLS: só o servidor lê e grava (o painel do Supabase mostra tudo para a equipe).
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  guest boolean not null default false,
  display_name text not null,
  category text not null check (category in ('bug', 'suggestion', 'balance', 'praise', 'other')),
  rating smallint check (rating between 1 and 5),
  message text not null check (char_length(message) between 5 and 2000),
  game_version text not null,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create index feedback_created_at_idx on public.feedback (created_at desc);
comment on table public.feedback is 'Feedback enviado pelos jogadores na área Comunidade e Feedback do menu. Só o servidor acessa.';
