-- Assinaturas (lote 4): partidas com até 6 nações para assinantes; a versão grátis vai até 4.
-- Tabela separada do perfil: o jogador edita o próprio perfil, mas não a assinatura. Sem políticas
-- de RLS, só o servidor (chave de serviço) lê e grava.
create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
comment on table public.subscriptions is 'Assinatura do jogador (salas com até 6 nações). Só o servidor acessa.';
